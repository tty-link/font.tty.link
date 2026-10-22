/* Saved dependency evidence, not a runtime archive or a guarantee of identical pixels.
 * capture({ runtime: { version, layouts }, resources: [{ kind, id, text?, fingerprint?, revision? }] })
 * records only identifiers and fingerprints. No resource is fetched or executed here.
 * normalize(input) validates untrusted JSON; compare(saved, current) never updates either manifest.
 * A missing fingerprint stays unverified, including device fonts and external assets.
 * The caller preserves a loaded manifest until the author explicitly adopts the current environment. */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-reproducibility-model: load font-studio-util.js first");
  }
  var FORMAT = "font-kku-dependencies";
  var VERSION = 1;
  var MAX_RESOURCES = 256;
  var REQUIRED = [{ kind: "runtime", id: "font-kku.js" }, { kind: "core-css", id: "font-kku.css" }];
  var object = function (value) { return value && typeof value === "object" && !Array.isArray(value); };
  var clean = function (value, max) {
    return typeof value === "string" && value.length > 0 && value.length <= max && !/[<>\u0000-\u001f\u007f]/.test(value);
  };
  var key = function (resource) { return resource.kind + "\n" + resource.id; };
  var copy = function (value) { return JSON.parse(JSON.stringify(value)); };

  // A change detector over UTF-16 source text; not a cryptographic integrity check.
  function fingerprint(text) {
    var source = String(text);
    return "fnv1a32:" + Util.fnv1a(source) + ":" + source.length;
  }

  function normalize(input) {
    var errors = [];
    function error(path, message) { errors.push({ code: "DEPENDENCIES_INVALID", path: path, message: message }); }
    function keys(value, allowed, path) {
      Object.keys(value).forEach(function (name) {
        if (allowed.indexOf(name) < 0) { error(path ? path + "." + name : name, "unknown dependency field"); }
      });
    }
    if (!object(input)) { error("", "dependency manifest must be an object"); return { ok: false, manifest: null, errors: errors }; }
    keys(input, ["format", "version", "runtime", "resources"], "");
    if (input.format !== FORMAT) { error("format", "unknown dependency format"); }
    if (input.version !== VERSION) { error("version", "unsupported dependency manifest version"); }
    if (!object(input.runtime)) { error("runtime", "runtime must contain version and layouts"); }
    else {
      keys(input.runtime, ["version", "layouts"], "runtime");
      if (input.runtime.version !== null && !clean(input.runtime.version, 40)) { error("runtime.version", "version must be a short string or null"); }
      if (!object(input.runtime.layouts) || Object.keys(input.runtime.layouts).length > 32) { error("runtime.layouts", "layouts must contain at most 32 named revisions"); }
      else { Object.keys(input.runtime.layouts).forEach(function (name) {
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !clean(input.runtime.layouts[name], 40)) {
          error("runtime.layouts." + name, "invalid layout name or revision");
        }
      }); }
    }
    var seen = Object.create(null);
    if (!Array.isArray(input.resources) || input.resources.length > MAX_RESOURCES) { error("resources", "resources must contain at most " + MAX_RESOURCES + " entries"); }
    else { input.resources.forEach(function (resource, index) {
      var path = "resources[" + index + "]";
      if (!object(resource)) { error(path, "resource must be an object"); return; }
      keys(resource, ["kind", "id", "fingerprint", "revision"], path);
      if (!clean(resource.kind, 40) || !/^[a-z][a-z0-9-]*$/.test(resource.kind)) { error(path + ".kind", "invalid resource kind"); }
      if (!clean(resource.id, 500)) { error(path + ".id", "resource id must be a short identifier"); }
      if (resource.fingerprint !== null && (!clean(resource.fingerprint, 120) || !/^(fnv1a32:[a-f0-9]{8}:[0-9]+|sha256:[a-f0-9]{64})$/.test(resource.fingerprint))) {
        error(path + ".fingerprint", "fingerprint must be a supported digest or null");
      }
      if (resource.revision !== null && !clean(resource.revision, 120)) { error(path + ".revision", "revision must be a short string or null"); }
      if (seen[key(resource)]) { error(path, "duplicate dependency"); }
      seen[key(resource)] = true;
    }); }
    REQUIRED.forEach(function (resource) {
      if (!seen[key(resource)]) { error("resources", "missing required dependency " + resource.id); }
    });
    if (errors.length) { return { ok: false, manifest: null, errors: errors }; }
    var manifest = copy(input);
    manifest.resources.sort(function (a, b) { return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0; });
    return { ok: true, manifest: manifest, errors: [] };
  }

  function capture(options) {
    var opts = options || {};
    var runtime = opts.runtime || {};
    var layouts = {};
    Object.keys(runtime.layouts || {}).sort().forEach(function (name) { layouts[name] = String(runtime.layouts[name]); });
    var resources = (opts.resources || []).map(function (resource) {
      return { kind: resource.kind, id: resource.id,
        fingerprint: typeof resource.text === "string" ? fingerprint(resource.text) : resource.fingerprint || null,
        revision: resource.revision === undefined || resource.revision === null ? null : String(resource.revision) };
    });
    REQUIRED.forEach(function (required) {
      if (!resources.some(function (resource) { return key(resource) === key(required); })) {
        resources.push({ kind: required.kind, id: required.id, fingerprint: null, revision: null });
      }
    });
    var result = normalize({ format: FORMAT, version: VERSION,
      runtime: { version: runtime.version && runtime.version !== "unknown" ? String(runtime.version) : null, layouts: layouts }, resources: resources });
    if (!result.ok) { throw new TypeError("font-studio-reproducibility: " + result.errors.map(function (error) { return error.path + ": " + error.message; }).join("; ")); }
    return result.manifest;
  }

  function compare(saved, current) {
    var before = normalize(saved);
    var after = normalize(current);
    var items = [];
    function item(kind, id, status, oldValue, newValue) {
      items.push({ kind: kind, id: id, status: status, saved: oldValue === undefined ? null : oldValue, current: newValue === undefined ? null : newValue });
    }
    if (!before.ok || !after.ok) {
      item("manifest", "dependencies", "unverified", before.ok ? before.manifest : null, after.ok ? after.manifest : null);
    } else {
      var a = before.manifest;
      var b = after.manifest;
      if (!a.runtime.version || !b.runtime.version) { item("version", "runtime", "unverified", a.runtime.version, b.runtime.version); }
      else if (a.runtime.version !== b.runtime.version) { item("version", "runtime", "changed", a.runtime.version, b.runtime.version); }
      var names = Array.from(new Set(Object.keys(a.runtime.layouts).concat(Object.keys(b.runtime.layouts)))).sort();
      names.forEach(function (name) {
        var av = a.runtime.layouts[name];
        var bv = b.runtime.layouts[name];
        if (av !== bv) { item("layout", name, bv === undefined ? "missing" : av === undefined ? "added" : "changed", av, bv); }
      });
      var oldResources = Object.create(null);
      var newResources = Object.create(null);
      a.resources.forEach(function (resource) { oldResources[key(resource)] = resource; });
      b.resources.forEach(function (resource) { newResources[key(resource)] = resource; });
      Array.from(new Set(Object.keys(oldResources).concat(Object.keys(newResources)))).sort().forEach(function (name) {
        var av = oldResources[name];
        var bv = newResources[name];
        var resource = av || bv;
        if (!av || !bv) { item(resource.kind, resource.id, bv ? "added" : "missing", av, bv); }
        else if ((av.fingerprint && bv.fingerprint && av.fingerprint !== bv.fingerprint) || av.revision !== bv.revision) {
          item(resource.kind, resource.id, "changed", av, bv);
        } else if (!av.fingerprint || !bv.fingerprint) { item(resource.kind, resource.id, "unverified", av, bv); }
      });
    }
    var changed = items.some(function (entry) { return entry.status !== "unverified"; });
    return { status: changed ? "changed" : items.length ? "unverified" : "match", items: items, sameDependencies: items.length === 0 };
  }

  var Model = { FORMAT: FORMAT, VERSION: VERSION, MAX_RESOURCES: MAX_RESOURCES,
    fingerprint: fingerprint, capture: capture, normalize: normalize, compare: compare };
  global.FontStudioReproducibilityModel = Model;
  if (typeof module !== "undefined" && module.exports) { module.exports = Model; }
})(typeof window !== "undefined" ? window : globalThis);
