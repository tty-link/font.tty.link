/* font-studio-store.js — 저장 창구(store adapter, PLAN-STUDIO-002 '저장 창구와 글꼴 묶음' S2, ADR-033 §7)
 *
 * 작업실은 글꼴 묶음(authoring/font-studio-package.js)을 저장 창구 하나로 저장하고 연다. 창구는 바꿔 끼운다.
 *   창구 = { kind, open(id) → Promise<{ package, rev } | null>, save(id, pkg, { ifMatch }) → Promise<결과>, list() → Promise<[…]>,
 *            watch(id, cb) → 그만 듣기 함수 }
 *   save 결과: { ok: true, rev } · { ok: false, code: "REV_MISMATCH", rev } · { ok: false, code, message } (던지지 않는다)
 * - local(기본): 서버 없이 정적으로 돈다(ADR-009 §1). 저장은 묶음 파일 내려받기(파일 핸들이 있으면 그 파일에 쓰기)다. 초안 자동 저장은
 *   작업실(font-studio.js)이 같은 묶음 모양으로 한다. open·list는 없다(파일 열기로 연다).
 * - http(storeUrl): 저장 창구 HTTP 약속 v1(개발·검수 사이트 /api/v1/store/<이름공간>/, 나중의 대외 서비스) —
 *     GET {storeUrl}fonts → { fonts: [{ id, rev, updatedAt, actor }] }
 *     GET {storeUrl}fonts/<id> → { id, rev, package } · 404 { code: "NOT_FOUND" }
 *     PUT {storeUrl}fonts/<id> { package } — If-Match: "<rev>"(고칠 때) · If-None-Match: *(처음), X-FKK-CSRF(쿠키 fkk_csrf가 있으면),
 *       X-FKK-Actor(선택) → { id, rev } · 409 { code: "REV_MISMATCH", rev } · 400 { code: "PACKAGE_INVALID", message } · 401·403
 *     알림: SSE {origin}/events 의 사건 store, data { ns, id, rev, actor } — 이 창구가 쓴 rev는 받지 않는다
 *   rev는 서버가 센다(받은 묶음 바이트의 sha256 앞 16자). 작업실은 세지 않고 서버 값을 쓴다.
 * - relay(port): mount의 store 옵션(부모 페이지의 같은 출처 객체) — 부모로 부름을 넘긴다(bridge.js가 port를 준다).
 * - wrap(object): 같은 문서 안의 객체를 창구로(시험·호스트가 직접 넘길 때).
 */
(function (global) {
  "use strict";

  var Package = global.FontStudioPackage;

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function fail(code, message, extra) {
    var out = { ok: false, code: code, message: message || code };
    if (extra) {
      Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
    }
    return out;
  }

  function checkId(id) {
    if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
      throw new TypeError("font-studio-store: font id must match /^[a-z][a-z0-9-]*$/ (got " + JSON.stringify(id) + ")");
    }
  }

  // ── local ──────────────────────────────────────────────────────────────

  /* options: { download(name, text, type), handle?(파일 핸들 — 있으면 그 파일에 쓴다) } */
  function local(options) {
    var opts = options || {};
    var handle = opts.handle || null;
    return {
      kind: "local",
      open: function () { return Promise.resolve(null); },
      list: function () { return Promise.resolve([]); },
      watch: function () { return function () {}; },
      /* 묶음 파일로 저장 — 파일 핸들이 있으면 덮어쓰고, 없으면 내려받는다 */
      save: function (id, pkg) {
        checkId(id);
        var text = Package ? Package.serialize(pkg) : JSON.stringify(pkg, null, 2) + "\n";
        var name = Package ? Package.fileName(pkg) : id + ".font-kku.json";
        if (handle && typeof handle.createWritable === "function") {
          return handle.createWritable().then(function (writable) {
            return writable.write(text).then(function () { return writable.close(); });
          }).then(function () {
            return { ok: true, rev: null, file: handle.name || name, via: "handle" };
          }, function (error) {
            return fail("STORE_WRITE", "묶음 파일에 쓰지 못했습니다: " + (error && error.message || error));
          });
        }
        try {
          opts.download(name, text, "application/json");
        } catch (error) {
          return Promise.resolve(fail("STORE_WRITE", "묶음 파일을 내려받지 못했습니다: " + (error && error.message || error)));
        }
        return Promise.resolve({ ok: true, rev: null, file: name, via: "download" });
      },
      setHandle: function (next) { handle = next || null; },
      handle: function () { return handle; }
    };
  }

  // ── http ───────────────────────────────────────────────────────────────

  function cookie(name, doc) {
    var text = doc && typeof doc.cookie === "string" ? doc.cookie : "";
    var found = null;
    text.split(";").forEach(function (part) {
      var at = part.indexOf("=");
      if (at > 0 && part.slice(0, at).trim() === name) {
        found = decodeURIComponent(part.slice(at + 1).trim());
      }
    });
    return found;
  }

  /* 바탕 주소의 이름공간 — /api/v1/store/<ns>/ 의 <ns>(알림의 ns와 견준다). 모르면 null */
  function namespaceOf(base) {
    var match = /\/store\/([^/]+)\/?$/.exec(base.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /* storeUrl: 이름공간 하나의 바탕 주소(끝에 /가 없으면 붙인다). options: { fetch, EventSource, document, actor(행위자 이름 — X-FKK-Actor),
   * eventsUrl(알림 주소, 기본 {origin}/events) } */
  function http(storeUrl, options) {
    var opts = options || {};
    var doFetch = opts.fetch || (typeof global.fetch === "function" ? global.fetch.bind(global) : null);
    var Source = opts.EventSource || global.EventSource || null;
    var doc = opts.document || global.document || null;
    if (!doFetch) {
      throw new TypeError("font-studio-store: fetch is unavailable");
    }
    var baseHref = String(storeUrl);
    if (!/\/$/.test(baseHref)) {
      baseHref += "/";
    }
    var base = new URL(baseHref, doc && doc.baseURI ? doc.baseURI : undefined);
    var ns = namespaceOf(base);
    var eventsUrl = opts.eventsUrl ? new URL(opts.eventsUrl, base).href : new URL("/events", base).href;
    var written = {}; // 이 창구가 쓴 rev — 알림으로 돌아와도 '다른 행위자'가 아니다
    var watchers = [];
    var source = null;

    function fontUrl(id) {
      return new URL("fonts/" + encodeURIComponent(id), base).href;
    }

    function headers(extra) {
      var out = { Accept: "application/json" };
      var csrf = cookie("fkk_csrf", doc);
      if (csrf) {
        out["X-FKK-CSRF"] = csrf;
      }
      var actor = typeof opts.actor === "function" ? opts.actor() : opts.actor;
      if (actor) {
        out["X-FKK-Actor"] = String(actor);
      }
      Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
      return out;
    }

    function body(response) {
      return response.text().then(function (text) {
        if (!text) {
          return {};
        }
        try {
          return JSON.parse(text);
        } catch (error) {
          return { message: text.slice(0, 200) };
        }
      });
    }

    function unreachable(error) {
      return fail("STORE_UNREACHABLE", "저장 창구에 닿지 못했습니다: " + (error && error.message || error));
    }

    function refused(response, data) {
      if (response.status === 401 || response.status === 403) {
        return fail("STORE_FORBIDDEN", data.message || "저장 권한이 없습니다(HTTP " + response.status + ")", { status: response.status });
      }
      if (response.status === 409) {
        return fail("REV_MISMATCH", data.message || "다른 곳에서 먼저 바뀌었습니다", { rev: data.rev || null, status: 409 });
      }
      if (response.status === 400 || response.status === 422) {
        return fail(data.code || "PACKAGE_INVALID", data.message || "저장 창구가 묶음을 받지 않았습니다", { status: response.status, findings: data.findings || null });
      }
      return fail(data.code || "STORE_FAILED", data.message || "저장 창구가 HTTP " + response.status + "을 돌려줬습니다", { status: response.status });
    }

    function ensureSource() {
      if (source || !Source) {
        return;
      }
      source = new Source(eventsUrl, { withCredentials: false });
      source.addEventListener("store", function (event) {
        var data;
        try {
          data = JSON.parse(event.data);
        } catch (error) {
          return;
        }
        if (!isObject(data) || (ns && data.ns && data.ns !== ns)) {
          return;
        }
        var own = Boolean(data.rev && written[data.rev]);
        watchers.slice().forEach(function (watcher) {
          if (watcher.id === data.id && !own) {
            try {
              watcher.cb({ id: data.id, rev: data.rev || null, actor: data.actor || null, ns: data.ns || ns });
            } catch (error) {
              setTimeout(function () { throw error; }, 0);
            }
          }
        });
      });
    }

    return {
      kind: "http",
      url: base.href,
      ns: ns,
      list: function () {
        return doFetch(new URL("fonts", base).href, { headers: headers(), credentials: "same-origin" }).then(function (response) {
          return body(response).then(function (data) {
            if (!response.ok) {
              return refused(response, data);
            }
            return Array.isArray(data.fonts) ? data.fonts : [];
          });
        }, unreachable);
      },
      /* → { package, rev } · 없으면 null · 실패면 { ok: false, code } */
      open: function (id) {
        checkId(id);
        return doFetch(fontUrl(id), { headers: headers(), credentials: "same-origin" }).then(function (response) {
          return body(response).then(function (data) {
            if (response.status === 404) {
              return null;
            }
            if (!response.ok) {
              return refused(response, data);
            }
            if (!isObject(data.package)) {
              return fail("PACKAGE_INVALID", "저장 창구가 묶음 없이 답했습니다");
            }
            return { package: data.package, rev: data.rev || null };
          });
        }, unreachable);
      },
      save: function (id, pkg, saveOptions) {
        checkId(id);
        var so = saveOptions || {};
        var extra = { "Content-Type": "application/json" };
        if (so.ifMatch) {
          extra["If-Match"] = "\"" + String(so.ifMatch).replace(/"/g, "") + "\"";
        } else {
          extra["If-None-Match"] = "*";
        }
        return doFetch(fontUrl(id), { method: "PUT", headers: headers(extra), credentials: "same-origin", body: JSON.stringify({ package: pkg }) })
          .then(function (response) {
            return body(response).then(function (data) {
              if (!response.ok) {
                return refused(response, data);
              }
              if (data.rev) {
                written[data.rev] = true;
              }
              return { ok: true, rev: data.rev || null };
            });
          }, unreachable);
      },
      watch: function (id, cb) {
        checkId(id);
        if (typeof cb !== "function") {
          throw new TypeError("font-studio-store: watch callback must be a function");
        }
        var watcher = { id: id, cb: cb };
        watchers.push(watcher);
        ensureSource();
        return function () {
          watchers = watchers.filter(function (entry) { return entry !== watcher; });
          if (!watchers.length && source) {
            source.close();
            source = null;
          }
        };
      },
      close: function () {
        watchers = [];
        if (source) {
          source.close();
          source = null;
        }
      }
    };
  }

  // ── relay · wrap ───────────────────────────────────────────────────────

  /* port: { call(op, args) → Promise, watch(id, cb) → 그만 듣기 } — bridge.js가 부모(mount의 store 객체)로 넘긴다 */
  function relay(port) {
    if (!port || typeof port.call !== "function") {
      throw new TypeError("font-studio-store: relay needs a port");
    }
    return {
      kind: "relay",
      open: function (id) { checkId(id); return port.call("open", [id]); },
      list: function () { return port.call("list", []); },
      save: function (id, pkg, saveOptions) {
        checkId(id);
        return port.call("save", [id, pkg, saveOptions || {}]).then(normalizeSave, function (error) {
          return fail("STORE_FAILED", "호스트 저장 창구가 실패했습니다: " + (error && error.message || error));
        });
      },
      watch: function (id, cb) { checkId(id); return port.watch(id, cb); }
    };
  }

  function normalizeSave(result) {
    if (isObject(result) && result.ok === false) {
      return result;
    }
    return { ok: true, rev: isObject(result) && result.rev ? String(result.rev) : null };
  }

  /* 같은 문서 안의 객체 { open?, save, list?, watch? } → 창구(빠진 것은 비어 있는 것으로) */
  function wrap(object) {
    if (!object || typeof object.save !== "function") {
      throw new TypeError("font-studio-store: a store needs save(id, package, { ifMatch })");
    }
    return {
      kind: "custom",
      open: function (id) { return Promise.resolve(typeof object.open === "function" ? object.open(id) : null); },
      list: function () { return Promise.resolve(typeof object.list === "function" ? object.list() : []); },
      save: function (id, pkg, saveOptions) {
        return Promise.resolve().then(function () { return object.save(id, pkg, saveOptions || {}); }).then(normalizeSave, function (error) {
          return fail("STORE_FAILED", "저장 창구가 실패했습니다: " + (error && error.message || error));
        });
      },
      watch: function (id, cb) {
        var stop = typeof object.watch === "function" ? object.watch(id, cb) : null;
        return typeof stop === "function" ? stop : function () {};
      }
    };
  }

  var FontStudioStore = { local: local, http: http, relay: relay, wrap: wrap, namespaceOf: namespaceOf };
  global.FontStudioStore = FontStudioStore;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioStore;
  }
})(typeof window !== "undefined" ? window : globalThis);
