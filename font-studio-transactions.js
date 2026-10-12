/* font-studio-transactions.js — 작업실 디자인 편집의 기록·묶음·임시 등록 (설계 v1.2 §13.6, PLAN-HANGUL-001 F0)
 *
 * DOM 없이 셋을 맡는다. (1) 이름 붙은 편집 기록(createStore): 항목마다 바꾸기 전·후 상태 { design, participants }를 통째로
 * 들고, 되돌리기·다시·건너뛰기가 그 상태를 돌려준다 — 참가자(그림 문서처럼 디자인 JSON 밖에 사는 상태)가 디자인과 함께 되돌아간다.
 * (2) 묶음 편집(createTransaction): 끌기처럼 여러 번 바뀌는 동작을 미리보기만 하다가 commit에서 기록 한 줄로 남긴다. 취소하면
 * 아무것도 남지 않는다. (3) 임시 등록(createLeasePool): 비교·후보 미리보기용 디자인을 studio-tmp-<n> 이름에 바꿔 등록하고,
 * 다 쓰면 지운다(FontKku.unregisterDesign이 없으면 내용 주소 이름 studio-tmp-<fnv>에 남긴다). 검사 결과 모양 맞추기
 * (normalizeValidation)도 여기 둔다. 브라우저(window.FontStudioTransactions)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  var DEFAULT_LIMIT = 60;
  var LEASE_PREFIX = "studio-tmp";

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /* 키 차례가 정해진 직렬화 — font-kku.js·font-studio-design-model.js stableJson과 같다 */
  function stableJson(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(stableJson).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /* FNV-1a 32비트, 소문자 16진 8자리 — 내용 주소 이름(런타임 이름 문법: 소문자·숫자·-) */
  function fnv1a(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  // ── 편집 기록 ─────────────────────────────────────────────────────────

  /* 항목: { id, label, at, before: { design, participants }, after: { … } }. pointer는 마지막으로 적용된 항목(-1이면 처음 상태).
   * 새 항목을 남기면 pointer 뒤(다시 할 수 있던 항목)는 버린다. limit을 넘으면 가장 오래된 항목부터 버린다. */
  function createStore(options) {
    var limit = Math.max(1, Math.floor((options && options.limit) || DEFAULT_LIMIT));
    var list = [];
    var pointer = -1;
    var serial = 0;

    function light(entry) {
      return entry ? { id: entry.id, label: entry.label, at: entry.at } : null;
    }

    function find(id) {
      for (var index = 0; index < list.length; index += 1) {
        if (list[index].id === id) {
          return index;
        }
      }
      return -1;
    }

    /* index 자리로 옮기고 그때 상태를 돌려준다(-1이면 첫 항목의 before) */
    function stateAt(index) {
      if (index < 0) {
        return list.length ? clone(list[0].before) : null;
      }
      return clone(list[index].after);
    }

    return {
      record: function (entry) {
        if (!entry || !isObject(entry.before) || !isObject(entry.after)) {
          throw new TypeError("font-studio-transactions: record needs { label, before, after }");
        }
        list.length = pointer + 1;
        serial += 1;
        var stored = {
          id: "h" + serial,
          label: String(entry.label || ""),
          at: typeof entry.at === "number" ? entry.at : Date.now(),
          before: clone(entry.before),
          after: clone(entry.after)
        };
        list.push(stored);
        while (list.length > limit) {
          list.shift();
        }
        pointer = list.length - 1;
        return light(stored);
      },
      /* 되돌린다 — 되돌린 항목의 before(없으면 null) */
      undo: function () {
        if (pointer < 0) {
          return null;
        }
        pointer -= 1;
        return clone(list[pointer + 1].before);
      },
      /* 다시 — 다시 한 항목의 after(없으면 null) */
      redo: function () {
        if (pointer >= list.length - 1) {
          return null;
        }
        pointer += 1;
        return clone(list[pointer].after);
      },
      /* 그 항목까지 적용한 상태로 — 그 항목의 after. id가 null이면 처음 상태(첫 항목의 before). 모르는 id면 null(그대로) */
      jump: function (id) {
        var index = id === null ? -1 : find(id);
        if ((index < 0 && id !== null) || !list.length) {
          return null;
        }
        pointer = index;
        return stateAt(index);
      },
      /* 실패한 되돌리기·건너뛰기를 무를 때 — 상태는 돌려주지 않는다 */
      seek: function (index) {
        pointer = Math.max(-1, Math.min(list.length - 1, index));
        return pointer;
      },
      entry: function (id) {
        var index = find(id);
        return index < 0 ? null : clone(list[index]);
      },
      entries: function () {
        return list.map(light);
      },
      current: function () {
        return light(list[pointer] || null);
      },
      next: function () {
        return light(list[pointer + 1] || null);
      },
      index: function () {
        return pointer;
      },
      size: function () {
        return list.length;
      },
      canUndo: function () {
        return pointer >= 0;
      },
      canRedo: function () {
        return pointer < list.length - 1;
      },
      clear: function () {
        list.length = 0;
        pointer = -1;
      }
    };
  }

  // ── 검사 결과 ─────────────────────────────────────────────────────────

  function normalizeError(error) {
    if (typeof error === "string") {
      return { code: null, path: "", message: error };
    }
    var value = error || {};
    return {
      code: value.code || null,
      path: typeof value.path === "string" ? value.path : "",
      message: value.message !== undefined ? String(value.message) : String(error)
    };
  }

  /* validateDesign의 돌려준 값을 { ok, errors: [{ code, path, message }] }로 — 배열·{ ok, errors }·{ valid, errors }·불리언 */
  function normalizeValidation(result) {
    if (result === true || result === undefined || result === null) {
      return { ok: true, errors: [] };
    }
    if (result === false) {
      return { ok: false, errors: [{ code: null, path: "", message: "invalid design" }] };
    }
    if (Array.isArray(result)) {
      return { ok: result.length === 0, errors: result.map(normalizeError) };
    }
    var errors = Array.isArray(result.errors) ? result.errors.map(normalizeError) : [];
    var ok = "ok" in result ? Boolean(result.ok) : "valid" in result ? Boolean(result.valid) : errors.length === 0;
    if (!ok && !errors.length) {
      errors.push({ code: null, path: "", message: "invalid design" });
    }
    return { ok: ok, errors: ok ? [] : errors };
  }

  // ── 참가자 상태 ───────────────────────────────────────────────────────

  /* base에 덮어쓸 참가자 상태를 얹은 새 묶음 */
  function mergeParticipants(base, overrides) {
    var out = clone(base || {}) || {};
    Object.keys(overrides || {}).forEach(function (name) {
      out[name] = clone(overrides[name]);
      if (out[name] === undefined) {
        out[name] = null;
      }
    });
    return out;
  }

  /* 두 묶음에서 값이 다른 참가자 이름(어느 쪽에만 있는 이름도) */
  function changedParticipants(a, b) {
    var left = a || {};
    var right = b || {};
    var names = Object.keys(left).concat(Object.keys(right).filter(function (name) { return !(name in left); }));
    return names.filter(function (name) {
      return stableJson(left[name]) !== stableJson(right[name]);
    }).sort();
  }

  // ── 묶음 편집 ─────────────────────────────────────────────────────────

  /* options: { label, base: { design, participants }, preview(pending, names) → 결과, commit(label, pending) → 결과|Promise,
   *            cancel(base, { noop }) }. update는 미리보기만 하고, commit은 바뀐 것이 있을 때만 options.commit을 한 번 부른다. */
  function createTransaction(options) {
    var opts = options || {};
    var base = {
      design: clone(opts.base && opts.base.design),
      participants: clone(opts.base && opts.base.participants) || {}
    };
    var pending = { design: clone(base.design), participants: {} };
    var open = true;

    function snapshot() {
      return { design: clone(pending.design), participants: clone(pending.participants) };
    }

    function changed() {
      return stableJson(pending.design) !== stableJson(base.design) ||
        Object.keys(pending.participants).some(function (name) {
          return stableJson(pending.participants[name]) !== stableJson(base.participants[name]);
        });
    }

    return {
      label: String(opts.label || ""),
      isOpen: function () {
        return open;
      },
      pending: snapshot,
      changed: changed,
      /* mutate(draft)는 다음 JSON을 돌려주거나 draft를 고치고 undefined. participants: { 이름: 다음 상태 } */
      update: function (mutate, participants) {
        if (!open) {
          return { ok: false, closed: true, errors: [] };
        }
        if (typeof mutate === "function") {
          var draft = clone(pending.design);
          var next = mutate(draft);
          pending.design = next === undefined ? draft : clone(next);
        }
        var names = Object.keys(participants || {});
        names.forEach(function (name) {
          pending.participants[name] = clone(participants[name]);
          if (pending.participants[name] === undefined) {
            pending.participants[name] = null;
          }
        });
        return typeof opts.preview === "function" ? opts.preview(snapshot(), names) : { ok: true, errors: [] };
      },
      commit: function () {
        if (!open) {
          return Promise.resolve({ ok: false, closed: true, errors: [] });
        }
        open = false;
        if (!changed()) {
          if (typeof opts.cancel === "function") {
            opts.cancel(clone(base), { noop: true });
          }
          return Promise.resolve({ ok: true, noop: true, cancelled: false, design: clone(base.design), errors: [], impact: null });
        }
        return Promise.resolve(typeof opts.commit === "function" ? opts.commit(this.label, snapshot()) : { ok: true, errors: [] });
      },
      cancel: function () {
        if (!open) {
          return { ok: false, closed: true, errors: [] };
        }
        open = false;
        if (typeof opts.cancel === "function") {
          opts.cancel(clone(base), { noop: false });
        }
        return { ok: false, cancelled: true, design: clone(base.design), errors: [], impact: null };
      }
    };
  }

  // ── 임시 등록 ─────────────────────────────────────────────────────────

  /* runtime: FontKku(registerDesign·unregisterDesign). unregisterDesign이 있으면 studio-tmp-<n> 이름을 돌려 쓴다(registerDesign
   * { replace: true }로 바꿔 쓰고 release에서 지운다). 새 번호가 이미 다른 쪽에 등록돼 있으면(designs() 또는 planJamo로 확인)
   * 건너뛴다 — 남의 디자인을 바꿔 쓰지 않는다. unregisterDesign이 없으면 내용 주소 이름 studio-tmp-<fnv>에 남기고 release는
   * 하지 않는다. 디자인이 검사에 걸리면 registerDesign의 오류(code·path)를 그대로 던진다. */
  function createLeasePool(runtime, options) {
    var opts = options || {};
    var prefix = opts.prefix || LEASE_PREFIX;
    var pooled = Boolean(runtime) && typeof runtime.unregisterDesign === "function" && opts.pooled !== false;
    var free = [];
    var live = {};
    var serial = 0;

    function addressed(json) {
      return prefix + "-" + fnv1a(stableJson(json));
    }

    /* 그 이름이 이미 등록돼 있는가 — FontKku.designs()(이름 또는 { name } 목록)가 있으면 그것, 없으면 planJamo가 푸는지 */
    function taken(name) {
      if (typeof runtime.designs === "function") {
        return (runtime.designs() || []).some(function (entry) {
          return (typeof entry === "string" ? entry : entry && entry.name) === name;
        });
      }
      if (typeof runtime.planJamo === "function") {
        try {
          runtime.planJamo("ㅇ", { design: name });
          return true;
        } catch (error) {
          return false;
        }
      }
      return false;
    }

    function fresh() {
      var name;
      do {
        serial += 1;
        name = prefix + "-" + serial;
      } while (taken(name) && serial < 10000);
      return name;
    }

    function lease(json) {
      if (!runtime || typeof runtime.registerDesign !== "function") {
        throw new TypeError("font-studio-transactions: lease needs FontKku.registerDesign");
      }
      if (!pooled) {
        var fixed = { name: addressed(json) };
        runtime.registerDesign(fixed.name, json);
        fixed.update = function (next) {
          var name = addressed(next);
          runtime.registerDesign(name, next);
          fixed.name = name;
          return name;
        };
        fixed.release = function () { return false; };
        return fixed;
      }
      var name = free.length ? free.shift() : fresh();
      try {
        runtime.registerDesign(name, json, { replace: true });
      } catch (error) {
        free.unshift(name);
        throw error;
      }
      var released = false;
      live[name] = true;
      return {
        name: name,
        update: function (next) {
          if (released) {
            throw new Error("font-studio-transactions: lease " + name + " is released");
          }
          runtime.registerDesign(name, next, { replace: true });
          return name;
        },
        release: function () {
          if (released) {
            return false;
          }
          released = true;
          delete live[name];
          runtime.unregisterDesign(name);
          free.push(name);
          return true;
        }
      };
    }

    return {
      pooled: pooled,
      lease: lease,
      live: function () {
        return Object.keys(live).sort();
      }
    };
  }

  var FontStudioTransactions = {
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    LEASE_PREFIX: LEASE_PREFIX,
    clone: clone,
    stableJson: stableJson,
    fnv1a: fnv1a,
    createStore: createStore,
    normalizeValidation: normalizeValidation,
    mergeParticipants: mergeParticipants,
    changedParticipants: changedParticipants,
    createTransaction: createTransaction,
    createLeasePool: createLeasePool
  };

  global.FontStudioTransactions = FontStudioTransactions;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioTransactions;
  }
})(typeof window !== "undefined" ? window : globalThis);
