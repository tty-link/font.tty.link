/* Structured font glyph candidates (ADR-032 H3c). Immutable edits preserve the entire
 * design; v1 remains readable, and adding a mapping explicitly upgrades to v2.0.
 * Rendering and seed choice belong to FontKku.planJamo, never to this editor model. */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-glyphs: load font-studio-util.js first");
  }
  var VERSION = "2.0";
  var ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  var ROLES = ["initial", "medial", "final", "standalone"];
  var STAGES = Object.assign({}, Util.STAGE_JAMO);
  var TITLES = Util.STAGE_NAMES;
  var CHO = Util.CHO;
  var JUNG = Util.JUNG;
  var JONG = Util.JONG;
  var own = function (o, k) { return Boolean(o) && Object.prototype.hasOwnProperty.call(o, k); };
  var object = function (o) { return Boolean(o) && typeof o === "object" && !Array.isArray(o); };
  var clone = Util.clone;
  var identity = function (m) { return m.jamo + ":" + (m.role || ""); };
  function fail(message, code) {
    var error = new TypeError("font-studio-glyphs: " + message);
    error.code = code || "DESIGN_GLYPHS_INVALID";
    throw error;
  }
  function validText(text) {
    if (typeof text !== "string" || !text.length || /[\u0000-\u001f\u007f-\u009f]/.test(text)) { return false; }
    for (var i = 0; i < text.length; i += 1) {
      var n = text.charCodeAt(i);
      if (n >= 0xd800 && n <= 0xdbff) {
        var next = text.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) { return false; }
        i += 1;
      } else if (n >= 0xdc00 && n <= 0xdfff) { return false; }
    }
    return true;
  }
  function normalize(design) {
    var errors = [];
    function error(path, message, code) { errors.push({ code: code || "DESIGN_GLYPHS_INVALID", path: path, message: message }); }
    if (!object(design)) { return { ok: false, design: design, errors: [{ code: "DESIGN_NOT_OBJECT", path: "", message: "design must be an object" }] }; }
    if (design.version !== undefined && ["1.0", "1.1", "1.2", VERSION].indexOf(design.version) < 0) {
      error("version", "지원하지 않는 디자인 판입니다. 원문을 보존하고 지원하는 도구에서 여세요", "DESIGN_VERSION_INVALID");
    }
    if (design.editor && own(design.editor, "glyphPreview")) {
      var preview = design.editor.glyphPreview;
      if (design.version !== VERSION) { error("editor.glyphPreview", "미리보기 후보 설정은 version 2.0에서만 저장합니다"); }
      if (!object(preview) || typeof preview.seed !== "string" || typeof preview.jamoSeeds !== "boolean" ||
        Object.keys(preview).some(function (key) { return key !== "seed" && key !== "jamoSeeds"; })) {
        error("editor.glyphPreview", "glyphPreview must contain seed:string and jamoSeeds:boolean");
      }
    }
    Object.keys(design.sources || {}).forEach(function (id) {
      var source = design.sources[id];
      if (!object(source) || !own(source, "glyphs")) { return; }
      var path = "sources." + id + ".glyphs";
      if (design.version !== VERSION) { error(path, "문자 후보는 version 2.0에서만 저장합니다"); }
      if (source.kind !== "font") { error(path, "문자 후보는 font 소스에만 둡니다"); }
      if (!Array.isArray(source.glyphs)) { error(path, "glyphs must be an array"); return; }
      var seen = Object.create(null);
      source.glyphs.forEach(function (mapping, index) {
        var at = path + "[" + index + "]";
        if (!object(mapping)) { error(at, "mapping must be an object"); return; }
        Object.keys(mapping).forEach(function (key) { if (["jamo", "role", "candidates", "selected", "locked"].indexOf(key) < 0) { error(at + "." + key, "unknown mapping field"); } });
        if (typeof mapping.jamo !== "string" || !/^[ㄱ-ㆎ]$/.test(mapping.jamo)) { error(at + ".jamo", "jamo must be a compatibility jamo"); }
        if (own(mapping, "role") && ROLES.indexOf(mapping.role) < 0) { error(at + ".role", "invalid role"); }
        if (seen[identity(mapping)]) { error(at, "duplicate jamo and role mapping"); }
        seen[identity(mapping)] = true;
        var candidates = Object.create(null);
        if (!Array.isArray(mapping.candidates) || !mapping.candidates.length) { error(at + ".candidates", "at least one candidate is required"); }
        else { mapping.candidates.forEach(function (candidate, ci) {
          var cp = at + ".candidates[" + ci + "]";
          if (!object(candidate)) { error(cp, "candidate must be an object"); return; }
          Object.keys(candidate).forEach(function (key) { if (key !== "id" && key !== "text") { error(cp + "." + key, "unknown candidate field"); } });
          if (typeof candidate.id !== "string" || !ID.test(candidate.id)) { error(cp + ".id", "invalid candidate id"); }
          if (candidates[candidate.id]) { error(cp + ".id", "duplicate candidate id"); }
          candidates[candidate.id] = true;
          if (!validText(candidate.text)) { error(cp + ".text", "candidate text must be nonempty text without controls or lone surrogates"); }
        }); }
        if (own(mapping, "selected") && (typeof mapping.selected !== "string" || !own(candidates, mapping.selected))) { error(at + ".selected", "selected must name an existing candidate"); }
        if (own(mapping, "locked") && typeof mapping.locked !== "boolean") { error(at + ".locked", "locked must be boolean"); }
        if (mapping.locked === true && !own(mapping, "selected")) { error(at + ".selected", "잠근 후보는 selected를 명시해야 합니다"); }
      });
    });
    return { ok: errors.length === 0, design: clone(design), errors: errors };
  }
  function checked(design) {
    var result = normalize(design);
    if (!result.ok) { fail(result.errors.map(function (e) { return e.path + ": " + e.message; }).join("; "), result.errors[0].code); }
    return result.design;
  }
  function sourceOf(design, id) {
    var source = design && design.sources && design.sources[id];
    if (!source || source.kind !== "font") { fail("font source " + id + " is required"); }
    return source;
  }
  function create(design, id, options) {
    var next = checked(design);
    if (!ID.test(id)) { fail("invalid source id"); }
    next.sources = next.sources || {};
    if (!own(next.sources, id)) {
      if (!options || typeof options.family !== "string" || !options.family.trim()) { fail("a new source needs family"); }
      next.sources[id] = { kind: "font", family: options.family };
    }
    var source = sourceOf(next, id);
    if (!own(source, "glyphs")) { source.glyphs = []; }
    next.version = VERSION;
    return checked(next);
  }
  function getMapping(design, id, jamo, role) {
    var list = sourceOf(design, id).glyphs || [];
    var found = list.find(function (m) { return m.jamo === jamo && m.role === role; }) ||
      list.find(function (m) { return m.jamo === jamo && !own(m, "role"); });
    return found ? clone(found) : null;
  }
  function withMapping(design, id, mapping) {
    var next = create(design, id);
    var list = sourceOf(next, id).glyphs;
    var index = list.findIndex(function (m) { return identity(m) === identity(mapping); });
    if (index >= 0 && list[index].locked && mapping.locked !== false && JSON.stringify(list[index]) !== JSON.stringify(mapping)) {
      fail("후보를 바꾸기 전에 잠금을 풀어 주세요", "DESIGN_GLYPH_LOCKED");
    }
    if (index < 0) { list.push(clone(mapping)); } else { list[index] = clone(mapping); }
    return checked(next);
  }
  function update(design, id, target, patch) {
    var list = sourceOf(design, id).glyphs || [];
    var current = list.find(function (m) { return identity(m) === identity(target); });
    var next = Object.assign({}, current || target, patch);
    // null is the editor's explicit reset; stored fields stay optional rather than nullable.
    ["selected", "role"].forEach(function (key) { if (next[key] === null) { delete next[key]; } });
    return withMapping(design, id, next);
  }
  function remove(design, id, target) {
    var next = checked(design);
    var source = sourceOf(next, id);
    var list = source.glyphs || [];
    var found = list.find(function (m) { return identity(m) === identity(target); });
    if (found && found.locked) { fail("후보를 지우기 전에 잠금을 풀어 주세요", "DESIGN_GLYPH_LOCKED"); }
    source.glyphs = list.filter(function (m) { return identity(m) !== identity(target); });
    return next;
  }
  function capability(design, target) {
    var result = normalize(design);
    if (!result.ok) { return { supported: false, code: result.errors[0].code, reason: result.errors[0].message }; }
    var mapped = Object.keys(design.sources || {}).some(function (id) { return own(design.sources[id], "glyphs"); });
    if (mapped && ["browser", "project", "bundle", "design"].indexOf(target) < 0) {
      return { supported: false, code: "GLYPH_MAPPING_UNSUPPORTED_OUTPUT", reason: "구조화된 문자 후보는 브라우저에서 그립니다. 이 출력기는 후보·잠금을 보존해 그릴 수 없습니다" };
    }
    return { supported: true, code: null, reason: "" };
  }
  function progress(design, runtime, options) {
    var opts = options || {};
    var items = [];
    var stages = [];
    var error = null;
    var name = opts.name || "studio-glyph-progress";
    try { checked(design); runtime.registerDesign(name, design, { replace: true }); } catch (e) { error = String(e.message || e); }
    var all = Array.from(new Set((STAGES.origin8 + STAGES.basic24 + STAGES.full40 + JONG).split("")));
    all.forEach(function (jamo) {
      var roles = [];
      if (CHO.indexOf(jamo) >= 0) { roles.push("initial"); }
      if (JUNG.indexOf(jamo) >= 0 || jamo === "ㆍ") { roles.push("medial"); }
      if (JONG.indexOf(jamo) >= 0) { roles.push("final"); }
      roles.forEach(function (role) {
        var entry = { jamo: jamo, role: role, status: "missing", reason: error || "", plan: null };
        if (!error) {
          try {
            var plan = runtime.planJamo(jamo, Object.assign({}, opts, { design: name, role: role }));
            entry.plan = plan;
            var trace = plan.trace || [];
            var failed = trace.find(function (t) {
              if (t.status !== "error" && t.status !== "pending") { return false; }
              // An explicitly approved fallback may supersede an unsuccessful child recipe.
              return !trace.some(function (ancestor) {
                return ancestor.status === "degraded" && ancestor.path && t.path && ancestor.path.length < t.path.length &&
                  ancestor.path.every(function (part, index) { return part === t.path[index]; });
              });
            });
            var incomplete = !(plan.items || []).length || plan.items.some(function (item) { return !item.glyph; });
            var unverified = (plan.items || []).some(function (item) {
              var source = design.sources && design.sources[item.source];
              return !item.glyph && source && source.kind === "font" && !own(source, "glyphs");
            });
            if (failed || incomplete) { entry.reason = failed && failed.diagnostic || (unverified ? "GLYPH_SOURCE_UNVERIFIED" : "GLYPH_MAPPING_MISSING"); }
            else if (trace.some(function (t) { return t.status === "degraded"; })) {
              entry.status = "fallback"; entry.reason = "SOURCE_FALLBACK";
            } else { entry.status = trace[0] && trace[0].result === "direct" ? "direct" : "composed"; }
          } catch (e) { entry.reason = String(e.message || e); }
        }
        items.push(entry);
      });
    });
    Object.keys(STAGES).forEach(function (id) {
      var chars = STAGES[id].split("");
      var missing = items.filter(function (item) { return chars.indexOf(item.jamo) >= 0 && item.status === "missing"; });
      var ready = chars.filter(function (jamo) { var rows = items.filter(function (item) { return item.jamo === jamo; }); return rows.length && rows.every(function (item) { return item.status !== "missing"; }); });
      var direct = ready.filter(function (jamo) { return items.filter(function (item) { return item.jamo === jamo; }).every(function (item) { return item.status === "direct"; }); });
      var fallback = ready.filter(function (jamo) { return items.some(function (item) { return item.jamo === jamo && item.status === "fallback"; }); });
      stages.push({ id: id, title: TITLES[id], total: chars.length, ready: ready.length, direct: direct.length,
        composed: ready.length - direct.length - fallback.length, fallback: fallback.length,
        missing: missing.map(function (item) { return { jamo: item.jamo, role: item.role, reason: item.reason }; }) });
    });
    return { stages: stages, items: items, complete: items.length > 0 && items.every(function (item) { return item.status !== "missing"; }) };
  }
  var Model = { VERSION: VERSION, STAGES: STAGES, normalize: normalize, create: create, getMapping: getMapping, withMapping: withMapping,
    update: update, remove: remove, removeMapping: function (d, id, jamo, role) { return remove(d, id, { jamo: jamo, role: role }); },
    progress: progress, capability: capability };
  global.FontStudioGlyphs = Model;
  if (typeof module !== "undefined" && module.exports) { module.exports = Model; }
})(typeof window !== "undefined" ? window : globalThis);
