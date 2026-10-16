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
        var root = document.querySelector("[data-studio]");
        if (studio.ready() && root.dataset.checksReady === "true" &&
            !studio.material.busy() && !studio.design.busy()) { resolve(true); return; }
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

  function receive(event) {
    var message = event.data;
    if (disposed || event.source !== window.parent || event.origin !== origin || !message ||
        message.protocol !== PROTOCOL || message.channel !== channel) { return; }
    if (message.type === "init" && !initialized) {
      initialized = true;
      var opts = message.options || {};
      if (typeof opts.timeoutMs === "number" && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0) { timeout = opts.timeoutMs; }
      queue = queue.then(function () {
        if (opts.project !== undefined) { project(opts.project); }
        if (opts.text !== undefined) { text(opts.text); }
        return settled();
      }).then(function () { send({ type: "ready" }); }, function (error) {
        send({ type: "fatal", error: error.message });
      });
    } else if (message.type === "request" && initialized) {
      queue = queue.then(function () {
        if (message.action === "loadProject") { project(message.value); }
        else if (message.action === "setText") { text(message.value); }
        else if (message.action === "setBoundaries") { boundaries(message.value); }
        else if (message.action !== "exportProject" && message.action !== "getCss") { throw new Error("unknown editor action"); }
        return settled();
      }).then(function () {
        var value = message.action === "exportProject" ? studio.projectSnapshot() : message.action === "getCss" ? studio.css()
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
  var required = ["material", "design", "f", "provenance", "recipes", "draw", "drawDetach", "palette", "bundle", "history"];
  if (!studio || required.some(function (name) { return !studio[name]; })) {
    send({ type: "fatal", error: "editor modules failed to initialize" });
  } else {
    send({ type: "boot" });
  }
})();
