/* Optional Studio host. The editor runs in its own document so multiple instances
 * and the host's CSS never share globals, selectors, or runtime registrations. */
(function (global) {
  "use strict";

  var script = global.document && global.document.currentScript;
  var defaultUrl = script && script.src ? new URL("./index.html", script.src).href : null;
  var PROTOCOL = "font-kku-studio-v1";
  /* 자동화 계약 v1(작업실 FontStudio.api) 가운데 다른 출처에서 부를 수 있는 동작 — 자료만 오간다. studio/font-studio-api.js의
   * REMOTE_METHODS와 같은 목록(시험이 견준다). 사건 이름도 같다 */
  var API_METHODS = ["info", "select", "edit", "undo", "redo", "history", "settled", "snapshot", "load", "save", "setActor",
    "review.record", "review.list", "setPage", "setMode", "setText", "setComposition", "draw.importSvg", "checks"];
  var API_EVENTS = ["change", "select", "page", "mode", "settled"];

  function mount(container, options) {
    var opts = options || {};
    if (!container || container.nodeType !== 1 || typeof container.appendChild !== "function") {
      throw new TypeError("font-kku-studio: container must be an element");
    }
    var document = container.ownerDocument;
    var view = document.defaultView;
    if (!view) {
      throw new TypeError("font-kku-studio: container must belong to a browser document");
    }
    var timeout = opts.timeoutMs === undefined ? 30000 : opts.timeoutMs;
    if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) {
      throw new TypeError("font-kku-studio: timeoutMs must be a positive finite number");
    }
    if (opts.draftKey !== undefined && (typeof opts.draftKey !== "string" || !opts.draftKey.trim())) {
      throw new TypeError("font-kku-studio: draftKey must be a non-empty string");
    }
    if (opts.page !== undefined && ["design", "edit", "sheet", "review"].indexOf(opts.page) < 0) {
      throw new TypeError("font-kku-studio: page must be \"design\", \"edit\", \"sheet\" or \"review\"");
    }
    if (opts.shippedSave !== undefined && typeof opts.shippedSave !== "boolean") {
      throw new TypeError("font-kku-studio: shippedSave must be a boolean");
    }
    if (opts.mode !== undefined && ["easy", "precise"].indexOf(opts.mode) < 0) {
      throw new TypeError("font-kku-studio: mode must be \"easy\" or \"precise\"");
    }
    /* 저장 창구(S2): store — 이 페이지의 객체 { save(id, package, { ifMatch }), open?(id), list?(), watch?(id, cb) }(작업실이 다리로 부른다),
     * storeUrl — 저장 창구 HTTP 약속 v1의 바탕 주소(작업실이 직접 부른다 — 같은 출처이거나 CORS가 열려 있어야 한다). 둘 중 하나만 */
    if (opts.store !== undefined && opts.storeUrl !== undefined) {
      throw new TypeError("font-kku-studio: pass either store or storeUrl, not both");
    }
    if (opts.store !== undefined && (!opts.store || typeof opts.store.save !== "function")) {
      throw new TypeError("font-kku-studio: store must have save(id, package, { ifMatch })");
    }
    var storeUrl = null;
    if (opts.storeUrl !== undefined) {
      storeUrl = new URL(String(opts.storeUrl), document.baseURI);
      if (["http:", "https:"].indexOf(storeUrl.protocol) < 0) {
        throw new TypeError("font-kku-studio: storeUrl must use http or https");
      }
    }
    if (!opts.studioUrl && !defaultUrl) {
      throw new TypeError("font-kku-studio: provide studioUrl when the script URL is unavailable");
    }
    var url = new URL(opts.studioUrl || defaultUrl, document.baseURI);
    if (["http:", "https:", "file:"].indexOf(url.protocol) < 0) {
      throw new TypeError("font-kku-studio: studioUrl must use http, https, or file");
    }
    var channel = view.crypto && typeof view.crypto.randomUUID === "function"
      ? view.crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    url.searchParams.set("__font_kku_studio", channel);
    // Chromium's file-access mode exposes location.origin as "file://" while
    // postMessage still serializes that opaque origin as "null".
    var parentUrl = new URL(view.location.href || document.baseURI);
    url.searchParams.set("__font_kku_parent_origin", parentUrl.protocol === "file:" ? "null" : parentUrl.origin);
    if (opts.font !== undefined) { url.searchParams.set("font", String(opts.font)); }
    if (opts.draftKey !== undefined) { url.searchParams.set("__font_kku_draft_key", opts.draftKey); }
    // 기본 제공 글꼴을 고친 채 같은 이름으로 저장(ADR-030 §8) — 저장소 작업실만. 기본은 '새 글꼴로'만
    if (opts.shippedSave === true) { url.searchParams.set("shipped-save", "1"); }
    // 처음 열 작업실 페이지(디자인 · 고치기 · 자소판). 안에서 페이지를 바꿔도 같은 문서라 연결이 이어진다
    if (opts.page !== undefined) { url.searchParams.set("page", opts.page); }
    // 보기(쉬운·정밀). 없으면 작업실이 정한다: shippedSave면 정밀, 아니면 쉬운
    if (opts.mode !== undefined) { url.searchParams.set("mode", opts.mode); }
    if (opts.src !== undefined) {
      url.searchParams.set("src", new URL(String(opts.src), document.baseURI).href);
    }
    if (storeUrl) { url.searchParams.set("store-url", storeUrl.href); }
    if (opts.store !== undefined) { url.searchParams.set("__font_kku_store", "relay"); }
    var expectedOrigin = url.protocol === "file:" ? "null" : url.origin;
    var targetOrigin = expectedOrigin === "null" ? "*" : expectedOrigin;
    var iframe = document.createElement("iframe");
    iframe.title = "폰꾸 글꼴 작업실";
    iframe.style.cssText = "display:block;width:100%;height:100%;min-height:640px;border:0;";
    iframe.setAttribute("data-font-kku-studio", "");
    var disposed = false;
    var initialized = false;
    var readyDone = false;
    var nextRequest = 0;
    var pending = new Map();
    var eventListeners = {};
    API_EVENTS.forEach(function (name) { eventListeners[name] = []; });
    var resolveReady;
    var rejectReady;
    var ready = new Promise(function (resolve, reject) { resolveReady = resolve; rejectReady = reject; });
    // A host may use only loadProject/exportProject; those methods also observe ready.
    ready.catch(function () {});
    var startupTimer;

    function post(message) {
      message.protocol = PROTOCOL;
      message.channel = channel;
      iframe.contentWindow.postMessage(message, targetOrigin);
    }

    function dispose(error) {
      if (disposed) { return; }
      disposed = true;
      view.clearTimeout(startupTimer);
      view.removeEventListener("message", receive);
      iframe.removeEventListener("error", frameError);
      if (!readyDone) { rejectReady(error); }
      pending.forEach(function (request) {
        view.clearTimeout(request.timer);
        request.reject(error);
      });
      pending.clear();
      Object.keys(storeWatches).forEach(function (key) {
        try { storeWatches[key](); } catch (ignored) { /* 호스트 창구가 그만 듣기에 실패해도 닫는다 */ }
      });
      storeWatches = {};
      API_EVENTS.forEach(function (name) { eventListeners[name] = []; });
      // Removing the document tears down its timers/listeners and document-owned blob URLs.
      iframe.remove();
    }

    function frameError() { dispose(new Error("font-kku-studio: editor document failed to load")); }

    /* 작업실이 저장 창구(opts.store)를 부른다 — 결과를 그대로 돌려준다(던지면 그 글을 오류로) */
    var storeWatches = {};
    function storeRequest(message) {
      var store = opts.store;
      if (!store) { return; }
      var op = message.op;
      var args = Array.isArray(message.args) ? message.args : [];
      if (op === "watch") {
        if (typeof store.watch === "function") {
          var stop = store.watch(args[0], function (detail) {
            if (!disposed) { post({ type: "store-event", watch: message.watch, detail: detail || {} }); }
          });
          if (typeof stop === "function") { storeWatches[message.watch] = stop; }
        }
        return;
      }
      if (op === "unwatch") {
        if (storeWatches[message.watch]) {
          try { storeWatches[message.watch](); } catch (ignored) { /* 그만 듣기 실패는 무시 */ }
          delete storeWatches[message.watch];
        }
        return;
      }
      var run = op === "save" ? function () { return store.save(args[0], args[1], args[2] || {}); }
        : op === "open" ? function () { return typeof store.open === "function" ? store.open(args[0]) : null; }
        : op === "list" ? function () { return typeof store.list === "function" ? store.list() : []; } : null;
      if (!run) {
        post({ type: "store-result", id: message.id, error: "unknown store operation" });
        return;
      }
      Promise.resolve().then(run).then(function (value) {
        if (!disposed) { post({ type: "store-result", id: message.id, value: value === undefined ? null : value }); }
      }, function (error) {
        if (!disposed) { post({ type: "store-result", id: message.id, error: String(error && error.message || error) }); }
      });
    }

    function receive(event) {
      var message = event.data;
      if (disposed || event.source !== iframe.contentWindow || event.origin !== expectedOrigin || !message ||
          message.protocol !== PROTOCOL || message.channel !== channel) { return; }
      if (message.type === "store") {
        try { storeRequest(message); }
        catch (error) { post({ type: "store-result", id: message.id, error: String(error && error.message || error) }); }
        return;
      }
      if (message.type === "boot" && !initialized) {
        initialized = true;
        try { post({ type: "init", options: { project: opts.project, text: opts.text, timeoutMs: timeout } }); }
        catch (error) { dispose(error); }
      } else if (message.type === "ready" && initialized && !readyDone) {
        readyDone = true;
        view.clearTimeout(startupTimer);
        resolveReady(handle);
      } else if (message.type === "fatal") {
        dispose(new Error("font-kku-studio: " + String(message.error || "editor startup failed")));
      } else if (message.type === "result" && pending.has(message.id)) {
        var request = pending.get(message.id);
        pending.delete(message.id);
        view.clearTimeout(request.timer);
        if (message.error) {
          var failure = message.code === "TYPE_ERROR" ? new TypeError("font-kku-studio: " + message.error) : new Error("font-kku-studio: " + message.error);
          if (message.code && message.code !== "TYPE_ERROR") { failure.code = message.code; }
          request.reject(failure);
        }
        else { request.resolve(message.value); }
      } else if (message.type === "event" && readyDone && Object.prototype.hasOwnProperty.call(eventListeners, message.name)) {
        eventListeners[message.name].slice().forEach(function (listener) {
          try { listener(message.detail); }
          catch (error) { view.setTimeout(function () { throw error; }, 0); }
        });
      }
    }

    function checkEvent(name, listener) {
      if (API_EVENTS.indexOf(name) < 0) {
        throw new TypeError("font-kku-studio: unknown event " + JSON.stringify(name) + " (one of " + API_EVENTS.join(", ") + ")");
      }
      if (typeof listener !== "function") {
        throw new TypeError("font-kku-studio: listener must be a function");
      }
    }

    function request(action, value) {
      return ready.then(function () {
        if (disposed) { throw new Error("font-kku-studio: instance has been destroyed"); }
        return new Promise(function (resolve, reject) {
          var id = ++nextRequest;
          var timer = view.setTimeout(function () {
            pending.delete(id);
            reject(new Error("font-kku-studio: " + action + " timed out"));
          }, timeout);
          pending.set(id, { resolve: resolve, reject: reject, timer: timer });
          try { post({ type: "request", id: id, action: action, value: value }); }
          catch (error) {
            pending.delete(id);
            view.clearTimeout(timer);
            reject(error);
          }
        });
      });
    }

    var handle = {
      iframe: iframe,
      ready: ready,
      exportProject: function () { return request("exportProject"); },
      /* 글꼴 묶음(font-kku-font-package v1, S2) — CSS·디자인·그림·자소판·검수를 모두 담는다. exportProject는 프로젝트 v2 그대로 */
      exportPackage: function () { return request("exportPackage"); },
      loadProject: function (project) { return request("loadProject", project); },
      getCss: function () { return request("getCss"); },
      setText: function (text) { return request("setText", text); },
      setBoundaries: function (enabled) {
        if (typeof enabled !== "boolean") {
          return Promise.reject(new TypeError("font-kku-studio: boundaries must be a boolean"));
        }
        return request("setBoundaries", enabled);
      },
      /* 자동화 계약 v1 — call("edit", { set: { top: "-3%" } }) 등. 결과는 작업실 FontStudio.api와 같다 */
      call: function (method) {
        if (typeof method !== "string" || API_METHODS.indexOf(method) < 0) {
          return Promise.reject(new TypeError("font-kku-studio: unknown API method " + JSON.stringify(method) + " (one of " + API_METHODS.join(", ") + ")"));
        }
        return request("api", { method: method, args: Array.prototype.slice.call(arguments, 1) });
      },
      /* 사건 듣기 — 돌려준 함수를 부르면 그만 듣는다. 준비(ready) 뒤의 사건만 온다 */
      on: function (name, listener) {
        checkEvent(name, listener);
        if (!disposed) { eventListeners[name].push(listener); }
        return function () { handle.off(name, listener); };
      },
      off: function (name, listener) {
        if (Object.prototype.hasOwnProperty.call(eventListeners, name)) {
          eventListeners[name] = eventListeners[name].filter(function (entry) { return entry !== listener; });
        }
      },
      destroy: function () { dispose(new Error("font-kku-studio: instance has been destroyed")); }
    };
    view.addEventListener("message", receive);
    iframe.addEventListener("error", frameError);
    startupTimer = view.setTimeout(function () {
      dispose(new Error("font-kku-studio: editor startup timed out"));
    }, timeout);
    iframe.src = url.href;
    try { container.appendChild(iframe); }
    catch (error) { dispose(error); throw error; }
    return handle;
  }

  var api = { mount: mount };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  global.FontKkuStudio = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
