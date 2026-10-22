/* Private parent/frame protocol; the public API lives in mount.js. */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var channel = params.get("__font_kku_studio");
  var origin = params.get("__font_kku_parent_origin");
  if (!channel || !origin || window.parent === window) { return; }
  var PROTOCOL = "font-kku-studio-v1";
  var targetOrigin = origin === "null" ? "*" : origin;
  var studio = window.FontStudio;
  var initialized = false;
  var disposed = false;
  var timeout = 30000;
  var timers = new Map();
  var queue = Promise.resolve();
  var boundarySheet = null;

  function boundaries(enabled) {
    if (typeof enabled !== "boolean") { throw new TypeError("boundaries must be a boolean"); }
    if (!boundarySheet && enabled) {
      boundarySheet = new CSSStyleSheet();
      boundarySheet.replaceSync([
        '[part="word"] { background: rgba(67,47,16,.04); outline: 1px solid rgba(109,91,67,.14); outline-offset: 1px; }',
        '[part="glyph"] { background: rgba(173,94,28,.08); outline: 1px solid rgba(173,94,28,.48); outline-offset: -1px; }',
        '[part="glyph-body"] { background: rgba(33,88,160,.05); outline: 1px dashed rgba(33,88,160,.42); outline-offset: -1px; }',
        '[part="space"] { position: relative; }',
        '[part="space"]::before { content: ""; position: absolute; inset-inline: 0;',
        'inset-block-start: calc(var(--fy-glyph-height, 1.2em) * -.92); block-size: var(--fy-glyph-height, 1.2em);',
        'border-inline: 1px dashed rgba(39,132,92,.4); background: repeating-linear-gradient(90deg, rgba(39,132,92,.08) 0 .2em, transparent .2em .4em); pointer-events: none; }',
        '[part="space"]:not(:first-child, :last-child)::before { position: static; display: inline-block; vertical-align: top;',
        'inline-size: calc(var(--fy-space-count, 1) * var(--fy-space-width, .5em)); margin-inline-end: calc(-1 * var(--fy-space-count, 1) * var(--fy-space-width, .5em)); box-sizing: border-box; }'
      ].join("\n"));
    }
    if (boundarySheet) {
      if (enabled) { studio.addOverlay(boundarySheet); }
      else { studio.removeOverlay(boundarySheet); }
    }
    return enabled;
  }

  function send(message) {
    if (disposed) { return; }
    message.protocol = PROTOCOL;
    message.channel = channel;
    window.parent.postMessage(message, targetOrigin);
  }

  function settled() {
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + timeout;
      function poll() {
        if (disposed) { reject(new Error("editor was closed")); return; }
        /* 작업실과 같은 조건(FontStudio.idle — 밀린 검증은 청하고, 늦게 싣는 모듈도 기다린다) */
        if (studio.ready() && studio.idle()) { resolve(true); return; }
        if (Date.now() >= deadline) { reject(new Error("editor did not become ready")); return; }
        var timer = setTimeout(function () { timers.delete(timer); poll(); }, 25);
        timers.set(timer, reject);
      }
      poll();
    });
  }

  function text(value) {
    if (typeof value !== "string") { throw new TypeError("text must be a string"); }
    var input = document.querySelector("[data-studio-text]");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function project(value) {
    if (!studio.loadProject(value)) { throw new Error("project CSS could not be loaded"); }
    return true;
  }

  /* 자동화 계약 v1(FontStudio.api) — mount 핸들 call(이름, …인자). 자료만 오가는 동작(api.REMOTE_METHODS)만 부른다 */
  function apiCall(value) {
    var api = studio.api;
    if (!api) { throw new Error("editor automation API is unavailable"); }
    var method = value && value.method;
    if (typeof method !== "string" || api.REMOTE_METHODS.indexOf(method) < 0) { throw new Error("unknown editor API method"); }
    var args = Array.isArray(value.args) ? value.args : [];
    var path = method.split(".");
    var owner = path.length > 1 ? api[path[0]] : api;
    return owner[path[path.length - 1]].apply(owner, args);
  }

  /* 사건(change·select·page·mode·settled)을 부모에 넘긴다 — 준비된 뒤부터 */
  var forwarding = false;
  function forwardEvents() {
    if (forwarding || !studio.api) { return; }
    forwarding = true;
    studio.api.EVENTS.forEach(function (name) {
      studio.api.on(name, function (detail) { send({ type: "event", name: name, detail: detail }); });
    });
  }

  /* 저장 창구 다리(S2) — mount의 store 옵션(부모 페이지의 객체)으로 작업실의 open·save·list·watch를 넘긴다. 작업실은
   * FontStudio.storeRelay를 FontStudioStore.relay로 감싸 쓴다(주소 ?__font_kku_store=relay일 때만) */
  var storeCalls = new Map();
  var storeWatchers = {};
  var storeNext = 0;
  function storeCall(op, args) {
    return new Promise(function (resolve, reject) {
      var id = ++storeNext;
      var timer = setTimeout(function () {
        storeCalls.delete(id);
        reject(new Error("host store " + op + " timed out"));
      }, timeout);
      storeCalls.set(id, { resolve: resolve, reject: reject, timer: timer });
      send({ type: "store", id: id, op: op, args: args || [] });
    });
  }
  function storeWatch(fontId, callback) {
    var watch = ++storeNext;
    storeWatchers[watch] = callback;
    send({ type: "store", id: 0, op: "watch", args: [fontId], watch: watch });
    return function () {
      if (storeWatchers[watch]) {
        delete storeWatchers[watch];
        send({ type: "store", id: 0, op: "unwatch", args: [], watch: watch });
      }
    };
  }
  if (params.get("__font_kku_store") === "relay" && studio) {
    studio.storeRelay = { call: storeCall, watch: storeWatch };
  }

  function receive(event) {
    var message = event.data;
    if (disposed || event.source !== window.parent || event.origin !== origin || !message ||
        message.protocol !== PROTOCOL || message.channel !== channel) { return; }
    if (message.type === "store-result" && storeCalls.has(message.id)) {
      var call = storeCalls.get(message.id);
      storeCalls.delete(message.id);
      clearTimeout(call.timer);
      if (message.error) { call.reject(new Error(message.error)); }
      else { call.resolve(message.value === undefined ? null : message.value); }
      return;
    }
    if (message.type === "store-event" && storeWatchers[message.watch]) {
      try { storeWatchers[message.watch](message.detail || {}); }
      catch (error) { setTimeout(function () { throw error; }, 0); }
      return;
    }
    if (message.type === "init" && !initialized) {
      initialized = true;
      var opts = message.options || {};
      if (typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) { timeout = opts.timeoutMs; }
      queue = queue.then(function () {
        if (opts.project !== undefined) { project(opts.project); }
        if (opts.text !== undefined) { text(opts.text); }
        return settled();
      }).then(function () { send({ type: "ready" }); forwardEvents(); }, function (error) {
        send({ type: "fatal", error: error.message });
      });
    } else if (message.type === "request" && initialized && message.action === "api") {
      queue = queue.then(function () { return apiCall(message.value); }).then(function (value) {
        send({ type: "result", id: message.id, value: value });
      }, function (error) { send({ type: "result", id: message.id, error: error.message, code: error.code || (error instanceof TypeError ? "TYPE_ERROR" : undefined) }); });
    } else if (message.type === "request" && initialized) {
      queue = queue.then(function () {
        if (message.action === "loadProject") { project(message.value); }
        else if (message.action === "setText") { text(message.value); }
        else if (message.action === "setBoundaries") { boundaries(message.value); }
        else if (message.action !== "exportProject" && message.action !== "exportPackage" && message.action !== "getCss") {
          throw new Error("unknown editor action");
        }
        return settled();
      }).then(function () {
        /* exportProject는 프로젝트 v2 그대로(사이트 계약), exportPackage는 글꼴 묶음(S2) */
        var value = message.action === "exportProject" ? studio.projectSnapshot() : message.action === "exportPackage" ? studio.package()
          : message.action === "getCss" ? studio.css()
          : message.action === "setBoundaries" ? message.value : true;
        send({ type: "result", id: message.id, value: value });
      }, function (error) { send({ type: "result", id: message.id, error: error.message }); });
    }
  }

  window.addEventListener("message", receive);
  window.addEventListener("pagehide", function () {
    disposed = true;
    window.removeEventListener("message", receive);
    timers.forEach(function (reject, timer) { clearTimeout(timer); reject(new Error("editor was closed")); });
    timers.clear();
  }, { once: true });
  /* 핵심만 필수다 — 디자인과 칸 껍데기. 나머지(조립식·출처·그리기·팔레트·묶음·편집 기록·문자 매핑)는 없거나 늦게 실려도 mount가
   * 죽지 않는다(PLAN-STUDIO-002 S1). 자소판·검수는 S6부터 페이지 무리라 늦게 싣는다 — 그림 자소 글꼴이면 자소판을 곧바로 싣고,
   * 준비(ready)는 settled()가 그것까지 기다린다. 싣기 전의 검수 기록은 작업실이 불러온 그대로 넘긴다 */
  var required = ["design", "f", "idle"];
  if (!studio || required.some(function (name) { return !studio[name]; })) {
    send({ type: "fatal", error: "editor modules failed to initialize" });
  } else {
    send({ type: "boot" });
  }
})();
