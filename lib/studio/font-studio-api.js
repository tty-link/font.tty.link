/* font-studio-api.js — 작업실 자동화 계약 v1 (PLAN-STUDIO-002 '자동화 계약 v1', S1)
 *
 * FontStudio.api는 바깥(호스트 페이지·개발·검수 사이트·에이전트·나중의 대외 서비스)이 쓰는 이름 붙은 판이다. window.FontStudio의
 * 나머지는 시험용 안쪽 창구로 남는다. mount 핸들은 다른 출처에서도 call(이름, …)·on(사건, fn)으로 같은 일을 한다(bridge.js).
 * - 모든 동작은 Promise로 결과 객체를 돌려준다. 거절은 결과(refused[] — 거절 표 authoring/font-studio-refusals.js의 { code,
 *   message, hint?, detail? })다. 던지는(거부하는) 것은 잘못된 호출(TypeError)과 시간 초과(code TIMEOUT)뿐이다.
 * - 편집은 화면과 같은 길을 쓴다: visible은 정밀 모드 값 칸(보이는 값 — S4), set은 그 범위의 대상 변수에 적을 값(applyInput),
 *   nudge는 방향키(nudge), scale·rotate는 + − [ ] 키(stepProperty). 먼저 모두 미리 셈(capture)해 하나라도 거절되면 아무것도 바꾸지
 *   않고, 모두 받으면 편집 한 번(기록 한 줄)으로 적용한다. dryRun은 셈만 한다. 결과의 affected는 { preview(미리보기 자모 수),
 *   total(그 규칙이 닿는 현대 한글 음절 수 — S4, 편집 전 범위로), scope }.
 * - 사건: change { cause: css|design|drawing|sheet|review|load, actor, rev, seq, label?, via? } · select · page · mode ·
 *   settled { seq, rev }. 디자인·그림·자소판·검수 편집도 change를 낸다(개발·검수 사이트 자동 저장이 기댄다).
 * - 읽기 전용 검사 checks()(S5-C): 린트와 음절 안 겹침을 읽기만 한다. 밀린 검증은 청해 끝나기를 기다리고, 편집·기록은 하지 않는다.
 * - 쓰는 모듈(그리기·디자인·검수 등)은 부를 때 찾는다 — 지연 싣기(S1 모듈 수명)로 아직 없으면 FontStudio.need(이름)를 기다리고, 그래도
 *   없으면 MODULE_UNAVAILABLE로 거절한다.
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var clone = Util.clone;

  var Studio = window.FontStudio;
  var Model = window.FontStudioModel;
  if (!Studio || !Studio.apiSupport || !Model || typeof Model.declarationDiff !== "function") {
    return;
  }
  var support = Studio.apiSupport;

  var VERSION = 1;
  var EVENTS = ["change", "select", "page", "mode", "settled"];
  /* mount 핸들 call()이 다른 출처에서 부를 수 있는 동작 — 함수를 넘기지 않는(자료만 오가는) 것. studio/mount.js와 같은 목록이다(시험이 견준다) */
  var REMOTE_METHODS = ["info", "select", "edit", "undo", "redo", "history", "settled", "snapshot", "load", "save", "setActor",
    "review.record", "review.list", "setPage", "setMode", "setText", "setComposition", "draw.importSvg", "checks"];
  var PAGES = ["design", "edit", "sheet", "review"];
  var MODES = ["easy", "precise"];
  var SET_PROPERTIES = ["left", "top", "size", "scale-x", "scale-y", "rotate", "weight", "stroke", "clip", "dilate", "glyph-text", "glyph-candidate"];
  var DEFAULT_TIMEOUT = 30000;
  var EDIT_SETTLE = 10000;

  var listeners = {};
  EVENTS.forEach(function (name) { listeners[name] = []; });
  var seq = 0;

  function fire(name, detail) {
    listeners[name].slice().forEach(function (listener) {
      try {
        listener(clone(detail));
      } catch (error) {
        setTimeout(function () { throw error; }, 0); // 듣는 쪽 오류가 편집을 깨뜨리지 않게
      }
    });
  }

  function refusal(code, params) {
    return support.refusal(code, params);
  }

  function rev() {
    return support.contentRev();
  }

  // ── 기다리기 ───────────────────────────────────────────────────────────

  function timeoutOf(options, fallback) {
    var ms = options && options.timeoutMs;
    if (ms === undefined || ms === null) {
      return fallback;
    }
    if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) {
      throw new TypeError("FontStudio.api: timeoutMs must be a positive finite number");
    }
    return ms;
  }

  function within(promise, ms, what) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        var error = new Error("FontStudio.api: " + what + " did not finish within " + ms + "ms");
        error.code = "TIMEOUT";
        reject(error);
      }, ms);
      promise.then(function (value) { clearTimeout(timer); resolve(value); }, function (error) { clearTimeout(timer); reject(error); });
    });
  }

  /* 조건이 참이 될 때까지(16ms마다) — 시간이 다 되면 false */
  function until(test, ms) {
    return new Promise(function (resolve) {
      var deadline = Date.now() + ms;
      (function poll() {
        var ok = false;
        try {
          ok = Boolean(test());
        } catch (error) {
          ok = false;
        }
        if (ok) {
          resolve(true);
        } else if (Date.now() >= deadline) {
          resolve(false);
        } else {
          setTimeout(poll, 16);
        }
      })();
    });
  }

  /* 글꼴을 다 실을 때까지 — 처음 열 때만 기다린다 */
  function ready() {
    if (Studio.ready()) {
      return Promise.resolve(true);
    }
    return until(function () { return Studio.ready(); }, DEFAULT_TIMEOUT).then(function (ok) {
      if (!ok) {
        var error = new Error("FontStudio.api: the studio did not load a font within " + DEFAULT_TIMEOUT + "ms");
        error.code = "TIMEOUT";
        throw error;
      }
      return true;
    });
  }

  /* 작업실이 다 그렸는가 — 시간이 다 되면 false(거부하지 않는다) */
  function settledWithin(ms) {
    return within(Studio.settled(), ms, "settled").then(function () { return true; }, function () { return false; });
  }

  /* 지연 싣는 모듈 — 지금 없으면 FontStudio.need(이름)가 있을 때 기다린다 */
  function moduleOf(name) {
    if (Studio[name]) {
      return Promise.resolve(Studio[name]);
    }
    if (typeof Studio.need !== "function") {
      return Promise.resolve(null);
    }
    return Promise.resolve().then(function () { return Studio.need(name); }).then(function () {
      attachModules();
      return Studio[name] || null;
    }, function () { return null; });
  }

  function unavailable(name) {
    return refusal("MODULE_UNAVAILABLE", { module: name });
  }

  // ── 사건 ────────────────────────────────────────────────────────────────

  var settledPending = false;

  /* settled 사건은 지금 화면에 필요한 일이 끝나면 낸다(FontStudio.quiet) — 고치기 페이지 밖에서 미뤄 둔 검증은 청하지 않는다.
   * 검증까지 기다리려면 api.settled()를 부른다 */
  function whenQuiet() {
    if (typeof Studio.quiet !== "function") {
      return Studio.settled();
    }
    return new Promise(function (resolve) {
      (function poll() {
        if (Studio.quiet()) {
          resolve(true);
        } else {
          setTimeout(poll, 16);
        }
      })();
    });
  }

  function scheduleSettled() {
    if (settledPending) {
      return;
    }
    settledPending = true;
    whenQuiet().then(function () {
      settledPending = false;
      fire("settled", { seq: seq, rev: rev() });
    });
  }

  function emitChange(detail) {
    seq += 1;
    var out = clone(detail) || {};
    out.seq = seq;
    if (!out.actor) {
      out.actor = support.actor();
    }
    if (!out.rev) {
      out.rev = rev();
    }
    fire("change", out);
    scheduleSettled();
  }

  var lastDrawings = null;
  var lastSheet = null;
  var attached = { design: false, material: false };

  function drawingsKey() {
    var design = Studio.design;
    if (!design || typeof design.participants !== "function") {
      return null;
    }
    try {
      var drawings = design.participants().drawings;
      return drawings === undefined ? null : JSON.stringify(drawings);
    } catch (error) {
      return null;
    }
  }

  function sheetKey() {
    var material = Studio.material;
    var state = material && material.state;
    if (!state || !state.history) {
      return "none";
    }
    var top = state.history[state.history.length - 1];
    return [state.history.length, (state.redo || []).length, top ? top.label : "", Boolean(state.sourceEdited)].join("|");
  }

  function baseline() {
    lastDrawings = drawingsKey();
    lastSheet = sheetKey();
  }

  function onDesignChange(event) {
    var cause = event && event.cause || "edit";
    var nowDrawings = drawingsKey();
    var drew = nowDrawings !== lastDrawings;
    lastDrawings = nowDrawings;
    if (support.loading()) {
      return; // 불러오는 동안의 되살림은 불러오기 change(load) 하나로
    }
    // 기록 줄의 행위자는 하나의 기록(FontStudio.timeline)이 적는다(S2)
    emitChange({ cause: cause === "restore" ? "load" : drew ? "drawing" : "design", label: event && event.label || "", via: cause });
  }

  function onSheetChange() {
    var key = sheetKey();
    if (key === lastSheet) {
      return; // 미리보기 칸 크기·품질처럼 화소 기록이 그대로인 다시 그리기
    }
    lastSheet = key;
    if (support.loading()) {
      return;
    }
    var material = Studio.material;
    var top = material && material.state && material.state.history[material.state.history.length - 1];
    emitChange({ cause: "sheet", label: top ? top.label : "자소판" });
  }

  /* 늦게 실린 모듈에도 붙는다(지연 싣기) */
  function attachModules() {
    if (!attached.design && Studio.design && typeof Studio.design.on === "function") {
      Studio.design.on("change", onDesignChange);
      attached.design = true;
      lastDrawings = drawingsKey();
    }
    if (!attached.material && Studio.material && typeof Studio.material.onChange === "function") {
      Studio.material.onChange(onSheetChange);
      attached.material = true;
      lastSheet = sheetKey();
    }
  }

  var lastSelect = null;

  Studio.on("change", function (detail) {
    if (detail && detail.cause === "load") {
      attachModules();
      baseline(); // 불러오며 바뀐 그림·자소판 기록은 바뀜이 아니다
    }
    emitChange(detail);
  });
  Studio.on("select", function (node) {
    var described = support.describe(node);
    if (!described) {
      return;
    }
    var key = [described.index, described.source, described.pos, described.jamo].join("|");
    if (key !== lastSelect) {
      lastSelect = key;
      fire("select", described);
    }
  });
  Studio.on("load", function () { lastSelect = null; });
  Studio.on("page", function (name) {
    attachModules();
    fire("page", { page: name });
  });
  Studio.on("mode", function (name) { fire("mode", { mode: name }); });
  if (Studio.on && typeof Studio.moduleLoaded === "function") {
    Studio.on("module", attachModules); // 페이지 무리(자소판 등)가 늦게 실리면 곧바로 붙는다(S6)
  }
  attachModules();

  function on(name, listener) {
    if (EVENTS.indexOf(name) < 0) {
      throw new TypeError("FontStudio.api: unknown event " + JSON.stringify(name) + " (one of " + EVENTS.join(", ") + ")");
    }
    if (typeof listener !== "function") {
      throw new TypeError("FontStudio.api: listener must be a function");
    }
    listeners[name].push(listener);
    return function () { off(name, listener); };
  }

  function off(name, listener) {
    if (EVENTS.indexOf(name) >= 0) {
      listeners[name] = listeners[name].filter(function (entry) { return entry !== listener; });
    }
  }

  // ── 고르기 ──────────────────────────────────────────────────────────────

  /* glyph: 미리보기 글자 차례(0부터) 또는 { source: "의", nth: 0 }(같은 글자 중 몇째, 기본 0) 또는 글자 하나("의") */
  function findGlyph(glyph) {
    var all = support.glyphs();
    if (typeof glyph === "number") {
      if (!(glyph >= 0 && Math.floor(glyph) === glyph)) {
        throw new TypeError("FontStudio.api: glyph index must be a non-negative integer");
      }
      return all[glyph] || null;
    }
    var spec = typeof glyph === "string" ? { source: glyph, nth: 0 } : glyph;
    if (!spec || typeof spec.source !== "string") {
      throw new TypeError("FontStudio.api: glyph must be an index, a syllable, or { source, nth }");
    }
    var nth = spec.nth === undefined ? 0 : spec.nth;
    if (typeof nth !== "number" || nth < 0 || Math.floor(nth) !== nth) {
      throw new TypeError("FontStudio.api: glyph.nth must be a non-negative integer");
    }
    return all.filter(function (entry) { return entry.dataset.source === spec.source; })[nth] || null;
  }

  function glyphLabel(glyph) {
    return typeof glyph === "object" && glyph ? glyph.source + (glyph.nth ? "#" + glyph.nth : "") : String(glyph);
  }

  function scopeInfo(node) {
    if (!node) {
      return null;
    }
    return {
      current: Studio.scope(),
      chosen: support.scopeState().chosen,
      available: support.scopes(node).map(function (id) { return { id: id, name: support.scopeName(id) }; }),
      contexts: support.contexts(node).map(function (entry) { return { value: entry.value, label: entry.label }; })
    };
  }

  function select(spec) {
    if (!spec || typeof spec !== "object") {
      throw new TypeError("FontStudio.api.select: expects { glyph, jamo } | { glyph, node } | { point: { x, y } }");
    }
    if (spec.point !== undefined && (!spec.point || typeof spec.point.x !== "number" || typeof spec.point.y !== "number")) {
      throw new TypeError("FontStudio.api.select: point must be { x, y } in client pixels");
    }
    if (spec.point === undefined && spec.glyph === undefined) {
      throw new TypeError("FontStudio.api.select: give glyph (with jamo or node) or point");
    }
    if (spec.jamo !== undefined && typeof spec.jamo !== "string") {
      throw new TypeError("FontStudio.api.select: jamo must be a string (data-jamo, e.g. \"ᄋ\")");
    }
    if (spec.node !== undefined && (typeof spec.node !== "number" || spec.node < 0 || Math.floor(spec.node) !== spec.node)) {
      throw new TypeError("FontStudio.api.select: node must be a non-negative integer");
    }
    return ready().then(function () {
      var node = null;
      var candidates = [];
      if (spec.point) {
        var pick = Studio.pickAt(spec.point.x, spec.point.y);
        candidates = pick.nodes.map(support.describe);
        node = pick.nodes[0] || null;
        if (!node) {
          return { ok: false, refused: [refusal("TARGET_NOT_FOUND", { what: "point" })], selection: null, candidates: [] };
        }
      } else {
        var glyph = findGlyph(spec.glyph);
        if (!glyph) {
          return { ok: false, refused: [refusal("TARGET_NOT_FOUND", { what: "glyph", glyph: glyphLabel(spec.glyph) })], selection: null, candidates: [] };
        }
        var nodes = support.jamoNodes(glyph);
        candidates = nodes.map(support.describe);
        if (spec.node !== undefined) {
          node = nodes[spec.node] || null;
        } else if (spec.jamo !== undefined) {
          node = nodes.filter(function (entry) {
            return entry.getAttribute("data-jamo") === spec.jamo && (spec.pos === undefined || entry.getAttribute("data-fy-pos") === spec.pos);
          })[0] || null;
        } else {
          node = nodes[0] || null;
        }
        if (!node) {
          return { ok: false, refused: [refusal("TARGET_NOT_FOUND", { what: "jamo", jamo: spec.jamo !== undefined ? spec.jamo : "#" + spec.node })],
            selection: null, candidates: candidates };
        }
      }
      Studio.select(node);
      var selected = Studio.selected();
      return { ok: true, refused: [], selection: support.describe(selected || node), candidates: candidates, scope: scopeInfo(selected || node) };
    });
  }

  // ── 편집 ────────────────────────────────────────────────────────────────

  function lintSummary(findings) {
    if (!findings) {
      return null;
    }
    return {
      errors: findings.filter(function (entry) { return entry.severity === "error"; }).length,
      warnings: findings.filter(function (entry) { return entry.severity !== "error"; }).length,
      findings: clone(findings)
    };
  }

  function editRefused(list, extra) {
    var out = { applied: false, refused: list, changes: [], affected: { preview: 0, total: null }, lint: null, overlaps: null, rev: rev() };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function checkEditSpec(spec) {
    if (!spec || typeof spec !== "object") {
      throw new TypeError("FontStudio.api.edit: expects { scope?, context?, set?, visible?, nudge?, rotate?, scale?, dryRun?, note? }");
    }
    /* set — 이 범위의 대상 변수에 적을 값(글꼴 CSS 그대로). visible — 노드가 보이게 할 값(정밀 모드 값 칸과 같은 길, S4) */
    ["set", "visible"].forEach(function (field) {
      if (spec[field] === undefined) {
        return;
      }
      if (!spec[field] || typeof spec[field] !== "object" || Array.isArray(spec[field])) {
        throw new TypeError("FontStudio.api.edit: " + field + " must be { property: value }");
      }
      Object.keys(spec[field]).forEach(function (key) {
        var value = spec[field][key];
        if (typeof value !== "string" && typeof value !== "number") {
          throw new TypeError("FontStudio.api.edit: " + field + "." + key + " must be a string or number (\"\" removes the declaration)");
        }
      });
    });
    if (spec.nudge !== undefined && (!spec.nudge || typeof spec.nudge !== "object" ||
        ["dx", "dy"].some(function (key) { return spec.nudge[key] !== undefined && (typeof spec.nudge[key] !== "number" || !isFinite(spec.nudge[key])); }))) {
      throw new TypeError("FontStudio.api.edit: nudge must be { dx, dy } in percent of the glyph box");
    }
    if (spec.rotate !== undefined && (typeof spec.rotate !== "number" || !isFinite(spec.rotate))) {
      throw new TypeError("FontStudio.api.edit: rotate must be degrees (number)");
    }
    if (spec.scale !== undefined && (typeof spec.scale !== "number" || !isFinite(spec.scale) || spec.scale <= 0)) {
      throw new TypeError("FontStudio.api.edit: scale must be a positive factor");
    }
    if (spec.scope !== undefined && typeof spec.scope !== "string") {
      throw new TypeError("FontStudio.api.edit: scope must be a scope id (or \"default\")");
    }
    if (spec.context !== undefined && typeof spec.context !== "string") {
      throw new TypeError("FontStudio.api.edit: context must be a context selector string");
    }
    if (spec.note !== undefined && typeof spec.note !== "string") {
      throw new TypeError("FontStudio.api.edit: note must be a string");
    }
    if (spec.set === undefined && spec.visible === undefined && spec.nudge === undefined && spec.rotate === undefined &&
        spec.scale === undefined && spec.scope === undefined && spec.context === undefined) {
      throw new TypeError("FontStudio.api.edit: nothing to do — give set, visible, nudge, rotate, scale or scope");
    }
    timeoutOf(spec, EDIT_SETTLE);
  }

  /* 화면 편집 길(값 칸·방향키·크기·회전 키)의 차례 */
  function operations(spec) {
    var ops = [];
    Object.keys(spec.set || {}).forEach(function (property) {
      var value = spec.set[property];
      ops.push(function () { return Studio.setValue(property, typeof value === "number" ? String(value) : value); });
    });
    Object.keys(spec.visible || {}).forEach(function (property) {
      var value = spec.visible[property];
      ops.push(function () { return support.visible(property, typeof value === "number" ? String(value) : value); });
    });
    if (spec.nudge) {
      ops.push(function () { return support.nudge(spec.nudge.dx || 0, spec.nudge.dy || 0); });
    }
    if (spec.scale !== undefined) {
      ops.push(function () { return support.step("size", spec.scale); });
    }
    if (spec.rotate !== undefined) {
      ops.push(function () { return support.step("rotate", spec.rotate); });
    }
    return ops;
  }

  function asRefusal(result) {
    var out = { code: result.code, message: result.message };
    if (result.hint) {
      out.hint = result.hint;
    }
    if (result.detail) {
      out.detail = result.detail;
    }
    if (result.suggestScope) {
      out.suggestScope = result.suggestScope; // 범위 사다리(ADR-035) — 먹는 가장 가까운 좁은 범위 id
    }
    return out;
  }

  function edit(spec) {
    checkEditSpec(spec);
    var settleMs = timeoutOf(spec, EDIT_SETTLE);
    return ready().then(function () {
      var node = Studio.selected();
      if (!node) {
        return editRefused([refusal("NO_SELECTION")]);
      }
      var saved = support.scopeState();
      var dry = Boolean(spec.dryRun);
      function back() {
        support.restoreScope(saved);
      }
      function refuseWith(entry) {
        back();
        if (!dry) {
          support.showRefusal(entry); // 사람 화면에도 같은 거절 한 줄
        }
        return editRefused([entry]);
      }
      if (spec.scope !== undefined) {
        if (spec.scope === "default") {
          Studio.resetScope();
        } else {
          var available = support.scopes(node);
          if (available.indexOf(spec.scope) < 0) {
            return refuseWith(refusal("SCOPE_UNAVAILABLE", { scope: spec.scope, scopeName: support.scopeName(spec.scope),
              available: available.map(support.scopeName).join(" · ") }));
          }
          Studio.setScope(spec.scope);
        }
      }
      if (spec.context !== undefined) {
        var contexts = support.contexts(node).map(function (entry) { return entry.value; });
        if (contexts.indexOf(spec.context) < 0) {
          return refuseWith(refusal("CONTEXT_UNAVAILABLE"));
        }
        support.setContext(spec.context);
      }
      var affected = Studio.affected();
      var reach = { preview: affected.count, total: null, scope: Studio.scope() };
      /* 현대 한글 몇 자(S4) — 편집 전 범위로 센다. 뼈대를 처음 지을 때만 수백 ms */
      var counting = typeof support.reachTotal === "function" ? support.reachTotal() : Promise.resolve(null);
      return counting.then(function (total) {
        reach.total = typeof total === "number" ? total : null;
        return applyEdit(spec, dry, reach, back, refuseWith, settleMs);
      });
    });
  }

  function applyEdit(spec, dry, reach, back, refuseWith, settleMs) {
    var before = Studio.css();
    var ops = operations(spec);
    var captured = support.capture(function () {
      for (var index = 0; index < ops.length; index += 1) {
        var result = ops[index]();
        if (result && result.ok === false && result.code !== "NO_CHANGE") {
          return result;
        }
      }
      return null;
    });
    if (captured.value) {
      return refuseWith(asRefusal(captured.value));
    }
    var changes = Model.declarationDiff(before, captured.css);
    if (dry) {
      back();
      return { applied: false, dryRun: true, refused: [], changes: changes, affected: reach, lint: lintSummary(captured.lint),
        overlaps: null, rev: Model.contentRev(captured.css), effect: null };
    }
    if (captured.css === before) {
      return { applied: false, refused: [], changes: [], affected: reach, lint: lintSummary(Studio.lint()), overlaps: Studio.overlaps(),
        rev: rev(), effect: "unchanged" };
    }
    var committed = support.commitCaptured(captured.css, captured.notes, captured.applied, spec.note);
    if (!committed.ok) {
      return refuseWith(refusal("EDIT_FAILED"));
    }
    var out = { applied: true, refused: [], changes: Model.declarationDiff(before, Studio.css()), affected: reach,
      lint: lintSummary(Studio.lint()), overlaps: null, rev: rev(), effect: committed.effect };
    return settledWithin(settleMs).then(function (done) {
      out.settled = done;
      out.overlaps = done ? clone(Studio.overlaps()) : null;
      return out;
    });
  }

  // ── 디자인·그림 ─────────────────────────────────────────────────────────

  function designRefusals(result) {
    if (result.cancelled) {
      return [refusal("DESIGN_CANCELLED")];
    }
    var errors = result.errors || [];
    return [refusal("DESIGN_INVALID", { first: errors[0] ? errors[0].message : "", detail: errors.map(function (entry) {
      return (entry.code || "") + (entry.path ? " " + entry.path : "") + " " + (entry.message || "");
    }).join(" / ") })];
  }

  function designEdit(label, mutate, options) {
    if (typeof mutate !== "function" && (!mutate || typeof mutate !== "object")) {
      throw new TypeError("FontStudio.api.design.edit: mutate must be a function(draft) or the next design JSON");
    }
    var opts = options || {};
    return ready().then(function () { return moduleOf("design"); }).then(function (design) {
      if (!design || typeof design.edit !== "function") {
        return { applied: false, refused: [unavailable("design")], design: null, rev: rev() };
      }
      if (opts.dryRun) {
        var draft = design.json();
        var out = typeof mutate === "function" ? mutate(draft) : clone(mutate);
        var next = out === undefined ? draft : out;
        var check = design.validate(next);
        return { applied: false, dryRun: true, refused: check.ok ? [] : designRefusals(check), errors: clone(check.errors || []),
          warnings: clone(check.warnings || []), design: clone(next), rev: rev() };
      }
      var editOptions = {};
      ["participants", "impact", "note", "tone", "cause"].forEach(function (key) {
        if (opts[key] !== undefined) {
          editOptions[key] = opts[key];
        }
      });
      return design.edit(String(label || "디자인 바꾸기"), mutate, editOptions).then(function (result) {
        return { applied: Boolean(result.ok), refused: result.ok ? [] : designRefusals(result), errors: clone(result.errors || []),
          warnings: clone(result.warnings || []), design: clone(result.design), rev: rev() };
      });
    });
  }

  /* 글 하나(AI 답 — 글 + <svg> 여럿, S5-A): 칸 이름(data-jamo·id·제목·바로 앞 줄)으로 칸마다 나눈다(모델 bundleImport). 덩어리가
   * 모두 이름 있고 깨끗해야(겹침·이름 모름·도형 거절이 없어야) 넣는다 — 하나라도 아니면 아무것도 바꾸지 않고 덩어리마다 SVG_REFUSED */
  function importSvgText(text, options) {
    var opts = options || {};
    return ready().then(function () { return moduleOf("draw"); }).then(function (draw) {
      var Draw = window.FontStudioDrawModel;
      if (!draw || typeof draw.importCells !== "function" || !Draw || typeof Draw.bundleImport !== "function") {
        return { applied: false, refused: [unavailable("draw")], cells: [], rev: rev() };
      }
      var result = Draw.bundleImport(typeof draw.doc === "function" ? draw.doc() : null, text);
      var REASON = { unknown: "칸 이름이 없음", duplicate: "앞 SVG와 같은 칸", skipped: "넣지 않음" };
      var refused = [];
      if (!result.rows.length) {
        refused.push(refusal("SVG_REFUSED", { key: "가져온 글", reason: result.refused ? result.refused.message : "<svg>가 없음" }));
      }
      var report = result.rows.map(function (row) {
        var ok = row.state === "new" || row.state === "overwrite";
        if (!ok) {
          refused.push(refusal("SVG_REFUSED", { key: row.key || "(" + (row.index + 1) + "번째 SVG)",
            reason: row.refused ? row.refused.message : REASON[row.state] || row.state }));
        }
        return { key: row.key, index: row.index, state: row.state, from: row.from, ok: ok, shapes: row.shapes,
          warnings: clone(row.warnings), rejected: clone(row.rejected) };
      });
      if (refused.length || opts.dryRun) {
        return { applied: false, dryRun: Boolean(opts.dryRun), refused: refused, cells: report, rev: rev() };
      }
      return draw.importCells(result.cells, opts.label || "SVG " + Object.keys(result.cells).length + "칸 가져오기").then(function (edit) {
        var ok = Boolean(edit && edit.ok);
        return { applied: ok, refused: ok ? [] : designRefusals(edit || {}), cells: report, rev: rev() };
      });
    });
  }

  /* cells: { "ㄱ": "<svg …>", "ㅏ@mr": "…" } 또는 [{ key, svg }] 또는 글 하나(위 importSvgText). 모두 통과해야 칸 여럿을 편집 한 번
   * (기록 한 줄)으로 넣는다 */
  function importSvg(cells, options) {
    if (typeof cells === "string") {
      return importSvgText(cells, options);
    }
    var list;
    if (Array.isArray(cells)) {
      list = cells.map(function (entry) {
        if (!entry || typeof entry.key !== "string" || typeof entry.svg !== "string") {
          throw new TypeError("FontStudio.api.draw.importSvg: array entries must be { key, svg }");
        }
        return { key: entry.key, svg: entry.svg };
      });
    } else if (cells && typeof cells === "object") {
      list = Object.keys(cells).map(function (key) {
        if (typeof cells[key] !== "string") {
          throw new TypeError("FontStudio.api.draw.importSvg: cells." + key + " must be SVG text");
        }
        return { key: key, svg: cells[key] };
      });
    } else {
      throw new TypeError("FontStudio.api.draw.importSvg: cells must be { key: svg } or [{ key, svg }]");
    }
    if (!list.length) {
      throw new TypeError("FontStudio.api.draw.importSvg: no cells");
    }
    var opts = options || {};
    return ready().then(function () { return moduleOf("draw"); }).then(function (draw) {
      var Draw = window.FontStudioDrawModel;
      if (!draw || typeof draw.importCells !== "function" || !Draw) {
        return { applied: false, refused: [unavailable("draw")], cells: [], rev: rev() };
      }
      var refused = [];
      var shapes = {};
      var report = list.map(function (entry) {
        if (!Draw.isEditableKey(entry.key)) {
          refused.push(refusal("SVG_REFUSED", { key: entry.key, reason: "고칠 수 없는 칸" }));
          return { key: entry.key, ok: false, shapes: 0, warnings: [], rejected: [] };
        }
        var result = Draw.sanitizeSvg(entry.svg);
        if (!result.ok) {
          refused.push(refusal("SVG_REFUSED", { key: entry.key, reason: result.refused ? result.refused.message : "그릴 도형이 없음" }));
        } else {
          shapes[entry.key] = result.shapes;
        }
        return { key: entry.key, ok: result.ok, shapes: result.shapes.length, warnings: clone(result.warnings), rejected: clone(result.rejected) };
      });
      if (refused.length || opts.dryRun) {
        return { applied: false, dryRun: Boolean(opts.dryRun), refused: refused, cells: report, rev: rev() };
      }
      return draw.importCells(shapes, opts.label).then(function (result) {
        var ok = Boolean(result && result.ok);
        return { applied: ok, refused: ok ? [] : designRefusals(result || {}), cells: report, rev: rev() };
      });
    });
  }

  // ── 기록 ────────────────────────────────────────────────────────────────

  function undoRedo(which) {
    return ready().then(function () {
      var result = which === "undo" ? Studio.undoLast() : Studio.redoLast();
      var entry = result.entry ? historyRow(result.entry) : result.kind ? { kind: result.kind } : null;
      if (result.ok) {
        return { ok: true, refused: [], entry: entry, rev: rev() };
      }
      return { ok: false, refused: [result.code ? asRefusal(result) : refusal("NO_CHANGE")], entry: entry, rev: rev() };
    });
  }

  /* 하나의 기록의 줄 하나(PLAN-STUDIO-002 S2) — kind는 갈래(css·design·sheet·review·action·group·remote), cause는 까닭(그림이면 drawing) */
  function historyRow(entry) {
    return { id: entry.id, kind: entry.kind, cause: entry.cause, label: entry.label, actor: clone(entry.actor || null),
      time: entry.time || null, state: entry.state, undoable: entry.undoable !== false };
  }

  /* 하나의 기록 — 오래된 것부터, 되돌린 것은 뒤(index가 지금 자리). 시간축이 없으면(옛 작업실) 갈래마다 모아 시각 차례로 */
  function history() {
    return ready().then(function () {
      var timeline = Studio.timeline;
      if (timeline && typeof timeline.entries === "function") {
        return { ok: true, entries: timeline.entries().map(historyRow), index: timeline.index() };
      }
      var done = [];
      var undone = [];
      var css = support.cssHistory();
      css.undo.forEach(function (entry) { done.push({ kind: "css", label: entry.label, actor: entry.actor, time: entry.time, state: "done" }); });
      css.redo.slice().reverse().forEach(function (entry) {
        undone.push({ kind: "css", label: entry.label, actor: entry.actor, time: entry.time, state: "undone" });
      });
      done.sort(function (a, b) { return (a.time || 0) - (b.time || 0); });
      return { ok: true, entries: done.concat(undone), index: done.length - 1 };
    });
  }

  // ── 보관·보기 ──────────────────────────────────────────────────────────

  /* 읽기 전용 검사(PLAN-STUDIO-002 S5-C) — 글꼴 계약 린트와 음절 안 잉크 겹침을 읽기만 한다. 고치기 페이지 밖에서 미뤄 둔 검증
   * (checksPending)은 청해 두고 settled()와 같은 길로 끝나기를 기다린다 — 편집하지 않고 기록 줄·change 사건도 내지 않는다.
   * 제한시간 안에 끝나지 않으면 settled: false, overlaps: null(옛 값을 새 값처럼 주지 않는다). lint는 edit 결과와 같은 꼴 */
  function checks(options) {
    if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) {
      throw new TypeError("FontStudio.api.checks: options must be an object");
    }
    var ms = timeoutOf(options, DEFAULT_TIMEOUT);
    return ready().then(function () {
      Studio.overlaps(); // 밀린 검증을 청한다(FontStudio.overlaps의 뜻 그대로)
      return settledWithin(ms);
    }).then(function (done) {
      return {
        ok: true,
        settled: done,
        checksPending: typeof Studio.checksPending === "function" ? Studio.checksPending() : null,
        lint: lintSummary(Studio.lint()),
        overlaps: done ? clone(Studio.overlaps()) : null,
        rev: rev()
      };
    });
  }

  function settled(options) {
    var ms = timeoutOf(options, DEFAULT_TIMEOUT);
    return within(ready().then(function () { return Studio.settled(); }), ms, "settled").then(function () {
      return { ok: true, seq: seq, rev: rev() };
    });
  }

  /* 보관(S2) — 글꼴 묶음(package)과 그 내용 지문(contentRev). project(v2)도 같이 준다(S1 결과와 맞춤). rev는 다른 결과처럼 글꼴 CSS의 판 */
  function snapshot() {
    return ready().then(function () {
      var pkg = typeof Studio.package === "function" ? Studio.package() : null;
      return { ok: true, package: pkg ? clone(pkg) : null, project: clone(Studio.projectSnapshot()), rev: rev(),
        contentRev: pkg && pkg.manifest ? pkg.manifest.contentRev : null };
    });
  }

  /* 저장 — 작업실의 '저장'과 같은 길(FontStudio.save: 지금 저장 창구에 글꼴 묶음 전체). 처음 저장이면 as("new"|"same")가 있어야 한다
   * (없으면 SAVE_NEEDS_CHOICE). quiet면 저장했다는 알림을 띄우지 않는다(자동 저장 — 방금 고친 것의 알림을 덮지 않게, 거절은 그대로 알린다) */
  function save(options) {
    if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) {
      throw new TypeError("FontStudio.api.save: options must be an object");
    }
    var opts = options || {};
    return ready().then(function () {
      if (typeof Studio.save !== "function") {
        return { ok: false, refused: [unavailable("font-studio-package")], id: null, rev: null };
      }
      return Studio.save({ as: opts.as, name: opts.name, force: opts.force, quiet: opts.quiet === true }).then(function (result) {
        if (result && result.ok) {
          return { ok: true, refused: [], id: result.id, rev: result.rev, contentRev: result.contentRev || null, file: result.file || null };
        }
        var r = result || {};
        var out = { ok: false, refused: [{ code: r.code || "STORE_FAILED", message: r.message || "", hint: r.hint, detail: r.detail }],
          id: r.id || null, rev: r.rev === undefined ? null : r.rev };
        if (r.choices) {
          out.choices = r.choices.slice();
          out.suggestedName = r.suggestedName || null;
        }
        return out;
      });
    });
  }

  /* 열기 — 글꼴 묶음·프로젝트 v2는 바로, 그 밖의 옛 형식(초안·디자인 묶음·디자인 JSON·CSS 글)은 FontStudio.openAny로(API는 묻지 않는다) */
  function load(project, options) {
    if (!project || (typeof project !== "object" && typeof project !== "string")) {
      throw new TypeError("FontStudio.api.load: expects a font package, a font-kku-font-project v2 object, or file text");
    }
    var ms = timeoutOf(options, DEFAULT_TIMEOUT);
    var direct = typeof project === "object" && (project.format === "font-kku-font-project" || project.format === "font-kku-font-package");
    return ready().then(function () {
      if (!direct && typeof Studio.openAny === "function") {
        return Studio.openAny(project).then(function (result) {
          if (!result || !result.ok) {
            var first = result && result.errors && result.errors[0];
            return { ok: false, refused: [refusal("PROJECT_INVALID", { reason: first ? first.message : "" })], rev: rev() };
          }
          return settledWithin(ms).then(function (done) {
            return { ok: true, refused: [], settled: done, rev: rev(), kind: result.kind };
          });
        });
      }
      try {
        if (!Studio.loadProject(project)) {
          return { ok: false, refused: [refusal("PROJECT_INVALID")], rev: rev() };
        }
      } catch (error) {
        return { ok: false, refused: [refusal("PROJECT_INVALID", { reason: error.message })], rev: rev() };
      }
      return settledWithin(ms).then(function (done) {
        return { ok: true, refused: [], settled: done, rev: rev() };
      });
    });
  }

  function setActor(actor) {
    if (!actor || typeof actor !== "object" || (actor.kind !== "human" && actor.kind !== "agent")) {
      throw new TypeError("FontStudio.api.setActor: expects { kind: \"human\" | \"agent\", id? }");
    }
    if (actor.id !== undefined && actor.id !== null && (typeof actor.id !== "string" || actor.id.length > 100)) {
      throw new TypeError("FontStudio.api.setActor: id must be a string of at most 100 characters (or null)");
    }
    return Promise.resolve({ ok: true, actor: support.setActor({ kind: actor.kind, id: actor.id === undefined ? null : actor.id }) });
  }

  function setPage(name) {
    if (PAGES.indexOf(name) < 0) {
      return Promise.resolve({ ok: false, refused: [refusal("PAGE_UNKNOWN", { page: name })], page: Studio.page() });
    }
    Studio.setPage(name);
    attachModules();
    return Promise.resolve({ ok: true, refused: [], page: Studio.page() });
  }

  function setMode(name) {
    if (MODES.indexOf(name) < 0) {
      return Promise.resolve({ ok: false, refused: [refusal("MODE_UNKNOWN", { mode: name })], mode: Studio.mode() });
    }
    Studio.setMode(name);
    return Promise.resolve({ ok: true, refused: [], mode: Studio.mode() });
  }

  function setText(text, options) {
    if (typeof text !== "string") {
      throw new TypeError("FontStudio.api.setText: text must be a string");
    }
    var ms = timeoutOf(options, DEFAULT_TIMEOUT);
    return ready().then(function () {
      var input = document.querySelector("[data-studio-text]");
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return settledWithin(ms);
    }).then(function (done) {
      return { ok: true, settled: done, glyphs: support.glyphs().length };
    });
  }

  /* 짓는 방식(ADR-034, C3) — 디자인 칸의 '짓는 방식'과 같은 길(FontStudio.composition.set): 디자인이 걸려 있으면 디자인 composition, 아니면
   * 글꼴 CSS. 프리셋 이름 · { preset?, vowel?, coda?, pieces? } · null(모양대로). 모르는 값은 COMPOSITION_INVALID로 거절 */
  function setComposition(value) {
    if (value !== null && value !== undefined && typeof value !== "string" && (typeof value !== "object" || Array.isArray(value))) {
      throw new TypeError("FontStudio.api.setComposition: expects a preset name, { preset?, vowel?, coda?, pieces? } or null");
    }
    return ready().then(function () {
      var composition = Studio.composition;
      if (!composition || typeof composition.set !== "function") {
        return { ok: false, refused: [unavailable("composition")], composition: null, rev: rev() };
      }
      return composition.set(value === undefined ? null : value, { quiet: true }).then(function (result) {
        return { ok: Boolean(result.ok), refused: result.refused || [], composition: clone(result.composition), rev: rev() };
      });
    });
  }

  function compositionInfo() {
    return Studio.composition && typeof Studio.composition.current === "function" && Studio.ready() ? clone(Studio.composition.current()) : null;
  }

  function info() {
    return Promise.resolve({
      ok: true,
      version: VERSION,
      ready: Studio.ready(),
      font: Studio.state.fontId,
      page: Studio.page(),
      mode: Studio.mode(),
      actor: support.actor(),
      rev: Studio.ready() ? rev() : null,
      seq: seq,
      selection: Studio.selected() ? support.describe(Studio.selected()) : null,
      composition: compositionInfo(),
      scope: Studio.selected() ? scopeInfo(Studio.selected()) : null,
      properties: SET_PROPERTIES.slice(),
      events: EVENTS.slice(),
      remote: REMOTE_METHODS.slice()
    });
  }

  // ── 검수 ────────────────────────────────────────────────────────────────

  function reviewReady(review, ms) {
    return until(function () {
      return (!review.ready || review.ready()) && !(Studio.material && Studio.material.busy && Studio.material.busy());
    }, ms);
  }

  function reviewRecord(entry) {
    if (!entry || typeof entry !== "object" || typeof entry.key !== "string") {
      throw new TypeError("FontStudio.api.review.record: expects { key, verdict, note?, actor? }");
    }
    if (entry.verdict !== null && typeof entry.verdict !== "string") {
      throw new TypeError("FontStudio.api.review.record: verdict must be \"pass\" | \"needs-fix\" | \"hold\" (or null for a note only)");
    }
    if (entry.note !== undefined && typeof entry.note !== "string") {
      throw new TypeError("FontStudio.api.review.record: note must be a string");
    }
    if (entry.actor !== undefined && (!entry.actor || (entry.actor.kind !== "human" && entry.actor.kind !== "agent"))) {
      throw new TypeError("FontStudio.api.review.record: actor must be { kind: \"human\" | \"agent\", id? }");
    }
    var ms = timeoutOf(entry, DEFAULT_TIMEOUT);
    var Verdicts = window.FontStudioReviewModel;
    if (entry.verdict !== null && Verdicts && !Verdicts.verdict(entry.verdict)) {
      return Promise.resolve({ ok: false, refused: [refusal("VERDICT_UNKNOWN", { verdict: entry.verdict })], record: null });
    }
    return ready().then(function () { return moduleOf("review"); }).then(function (review) {
      if (!review || typeof review.record !== "function") {
        return { ok: false, refused: [unavailable("review")], record: null };
      }
      return reviewReady(review, ms).then(function (ok) {
        if (!ok) {
          return { ok: false, refused: [refusal("NOT_READY", { what: "검수 페이지" })], record: null };
        }
        var who = entry.actor ? { kind: entry.actor.kind, id: typeof entry.actor.id === "string" ? entry.actor.id : null } : undefined;
        var result = review.record(entry.key, entry.verdict, entry.note, who);
        if (!result.ok) {
          return { ok: false, refused: [refusal(result.code, { key: entry.key, verdict: entry.verdict })], record: null };
        }
        return { ok: true, refused: [], record: clone(result.record) };
      });
    });
  }

  function reviewList() {
    return ready().then(function () { return moduleOf("review"); }).then(function (review) {
      if (!review || typeof review.list !== "function") {
        return { ok: false, refused: [unavailable("review")], items: [] };
      }
      return reviewReady(review, DEFAULT_TIMEOUT).then(function () {
        return { ok: true, refused: [], items: clone(review.list()) };
      });
    });
  }

  /* 호출 실수(TypeError)는 거부된 Promise로 — 모든 동작이 Promise를 돌려준다 */
  function promised(fn) {
    return function () {
      try {
        return Promise.resolve(fn.apply(null, arguments));
      } catch (error) {
        return Promise.reject(error);
      }
    };
  }

  var api = {
    version: VERSION,
    EVENTS: EVENTS.slice(),
    REMOTE_METHODS: REMOTE_METHODS.slice(),
    info: promised(info),
    select: promised(select),
    edit: promised(edit),
    undo: promised(function () { return undoRedo("undo"); }),
    redo: promised(function () { return undoRedo("redo"); }),
    history: promised(history),
    on: on,
    off: off,
    settled: promised(settled),
    checks: promised(checks),
    snapshot: promised(snapshot),
    load: promised(load),
    save: promised(save),
    setActor: promised(setActor),
    setPage: promised(setPage),
    setMode: promised(setMode),
    setText: promised(setText),
    setComposition: promised(setComposition),
    design: Object.freeze({ edit: promised(designEdit) }),
    draw: Object.freeze({ importSvg: promised(importSvg) }),
    review: Object.freeze({ record: promised(reviewRecord), list: promised(reviewList) })
  };
  Object.freeze(api.EVENTS);
  Object.freeze(api.REMOTE_METHODS);
  Studio.api = Object.freeze(api);
})();
