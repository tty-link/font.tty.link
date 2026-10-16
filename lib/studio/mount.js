/* Optional Studio host. The editor runs in its own document so multiple instances
 * and the host's CSS never share globals, selectors, or runtime registrations. */
(function (global) {
  "use strict";

  var script = global.document && global.document.currentScript;
  var defaultUrl = script && script.src ? new URL("./index.html", script.src).href : null;
  var PROTOCOL = "font-kku-studio-v1";

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
    if (opts.src !== undefined) {
      url.searchParams.set("src", new URL(String(opts.src), document.baseURI).href);
    }
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
      // Removing the document tears down its timers/listeners and document-owned blob URLs.
      iframe.remove();
    }

    function frameError() { dispose(new Error("font-kku-studio: editor document failed to load")); }

    function receive(event) {
      var message = event.data;
      if (disposed || event.source !== iframe.contentWindow || event.origin !== expectedOrigin || !message ||
          message.protocol !== PROTOCOL || message.channel !== channel) { return; }
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
        if (message.error) { request.reject(new Error("font-kku-studio: " + message.error)); }
        else { request.resolve(message.value); }
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
      loadProject: function (project) { return request("loadProject", project); },
      getCss: function () { return request("getCss"); },
      setText: function (text) { return request("setText", text); },
      setBoundaries: function (enabled) {
        if (typeof enabled !== "boolean") {
          return Promise.reject(new TypeError("font-kku-studio: boundaries must be a boolean"));
        }
        return request("setBoundaries", enabled);
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
