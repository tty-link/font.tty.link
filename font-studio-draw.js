/* font-studio-draw.js — 그리기 8 → 24 → 40 (설계 v1.2 §13.3·§18.1, PLAN-HANGUL-001 F5)
 *
 * 작업실 디자인 도구 탭 [data-studio-f=draw]. 사람이 칸 계약 그림 세트(ADR-024)를 원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)부터 그리고,
 * 나머지는 조립식이 만든 것을 보며 기본 24·확장 40으로 늘린다. 차례를 막지 않는다 — ㅃ을 먼저 그려도 된다.
 *
 * 그림 문서(font-kku-drawing v1, font-studio-draw-model.js)는 디자인 참가자 'drawings'다: 편집 기록·되돌리기·프로젝트·초안이
 * 디자인과 함께 싣고, 상태가 들어올 때마다(편집·되돌리기·열기) 세트를 registerJamo로 다시 등록한다 — 디자인보다 먼저.
 * start()는 빈 문서만 만들고 디자인은 바꾸지 않는다. 첫 칸을 넣는 편집 하나가 디자인을 그 세트로 돌린다('ㄱ 그리기 · 그림 세트로').
 *
 * 화면: 단계 줄([data-draw-stage]·[data-draw-helper]) · 다음에 그릴 자모 제안([data-draw-proposals]) · 자모 칸 41개([data-draw-grid],
 * 지금 디자인의 planJamo 결과 + 그림 출처) · 칸 편집기(0–100 격자 svg, 선·꺾은선·펜·타원·고르기, 문맥 칸, 부분 목록, SVG 가져오기)
 * · 문장 미리보기 둘(지금 디자인 / 원형 8만 그린 셈 — lease, 보이는 칸 = 그린 칸 ∩ 원형 8).
 * 포인터 한 번은 design.begin() → update(미리보기는 칸 그림만) → commit, 기록 한 줄. Escape는 취소.
 *
 * 탭은 늦게 붙인다(그리기를 시작하거나 그린 세트가 디자인에 들어올 때) — 맨 작업실의 탭 줄·편집 기록·임시 등록은 그대로다.
 * 재료가 그림 세트가 아니면 디자인 칸에 들어가는 단추([data-draw-entry])를 보인다.
 *
 * 하지 않는 것(계획 밖): 위 자모를 따라가는 조각 보정(§5.5 — 떼어 낸 독립 그림에서만), 글꼴 낱자 → SVG(§6.6), 세벌 고정의
 * 자모별 크기·자리(도장이 맡는다).
 *
 * FontStudio.draw = { start, doc, setCell, removeCell, importSvg, select, selection, movePart, scalePart, removePart, progress,
 *                     proposals, statuses, sentence, tool, open, on, off, busy }
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var Draw = window.FontStudioDrawModel;
  var Design = window.FontStudioDesign;
  var FontKku = window.FontKku;
  if (!Studio || !Draw || !Design || !FontKku || !Studio.f || !Studio.design || typeof Studio.design.participant !== "function" ||
      typeof FontKku.registerJamo !== "function" || typeof FontKku.planJamo !== "function") {
    return;
  }

  var design = Studio.design;
  var textInput = document.querySelector("[data-studio-text]");
  var SVG_NS = "http://www.w3.org/2000/svg";
  var Catalog = window.FontStudioRecipeCatalog;
  var STAGE_LISTS = Catalog && Catalog.stages && Array.isArray(Catalog.stages.full40) ? Catalog.stages : {
    origin8: "ㄱㄴㅁㅅㅇㆍㅡㅣ".split(""),
    basic24: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ".split(""),
    full40: "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("")
  };
  var HELPER = Draw.HELPER;
  var STAGES = Draw.STAGES;
  var GRID = STAGE_LISTS.full40.concat([HELPER]);
  var ORIGIN8 = STAGE_LISTS.origin8;
  var TOOLS = [
    { id: "line", label: "선" },
    { id: "polyline", label: "꺾은선" },
    { id: "pen", label: "펜" },
    { id: "ellipse", label: "타원" },
    { id: "select", label: "고르기" }
  ];
  var CONTEXT_LABELS = { "": "바탕", "@cho": "초성(@cho)", "@bar": "가로 모음 위(@bar)", "@jong": "받침(@jong)" };
  var STATUS_TEXT = Object.assign({}, Draw.STATUS_TEXT, { none: "그리지 않음", direct: "원본(다른 세트)" });
  var CONTEXT_PROMPT = { "": "바탕꼴(초성·모음 자리)", "@cho": "초성 자리 꼴", "@bar": "가로 모음(ㅗ·ㅡ 계열) 위에 놓이는 꼴",
    "@jong": "받침 자리 꼴" };
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  var JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  var JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

  var doc = null;
  var section = null;
  var built = false;
  var visible = false;
  var sel = { jamo: null, context: "" };
  var selectedPart = null;
  var tool = "line";
  var gesture = null;
  var renderTimer = null;
  var pendingEdits = 0;
  var pendingLinks = 0;
  var lastImport = null;
  var listeners = { select: [], change: [] };
  var els = {};
  var sentences = { rows: {}, lease: null, leaseJson: null };
  var entry = null;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function svgNode(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (key) {
      node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function emit(name, payload) {
    listeners[name].slice().forEach(function (listener) {
      try {
        listener(payload);
      } catch (error) {
        setTimeout(function () { throw error; }, 0);
      }
    });
  }

  function mode() {
    var json = design.state && design.state.json;
    return json ? json.mode : null;
  }

  function currentSet() {
    return Design.currentSet(design.state.json);
  }

  function usesDoc() {
    return Boolean(doc) && currentSet() === doc.set;
  }

  function keyOf(jamo, context) {
    return jamo + (context || "");
  }

  function selectedKey() {
    return sel.jamo ? keyOf(sel.jamo, sel.context) : null;
  }

  function splitKey(key) {
    var text = String(key || "");
    var at = text.indexOf("@");
    return at < 0 ? { jamo: text, context: "" } : { jamo: text.slice(0, at), context: text.slice(at) };
  }

  function stageOf(jamo) {
    if (jamo === HELPER) {
      return "helper";
    }
    return ORIGIN8.indexOf(jamo) >= 0 ? "origin8" : STAGE_LISTS.basic24.indexOf(jamo) >= 0 ? "basic24" : "full40";
  }

  function previewText() {
    return textInput ? textInput.value : "";
  }

  function note(text, tone) {
    if (els.message) {
      els.message.textContent = text || "";
      els.message.dataset.tone = tone || "info";
    }
  }

  // ── 그림 문서 참가자 ─────────────────────────────────────────────────

  /* 세트를 런타임에 (다시) 등록한다 — 빈 문서는 등록할 수 없다(registerJamo는 칸이 하나도 없으면 거절). 그때 디자인은 그 세트의
   * 보이는 칸을 비워(cells: []) 남은 옛 칸을 그리지 않는다(designFor) */
  function registerDoc() {
    if (!doc || Draw.isEmpty(doc)) {
      return false;
    }
    try {
      return Boolean(Draw.register(doc, FontKku));
    } catch (error) {
      note("⚠ 그림 세트를 등록하지 못했습니다: " + (error && error.message || error), "error");
      return false;
    }
  }

  /* 참가자 set — 편집·되돌리기·프로젝트·초안 열기. 들어온 문서는 모델 검사로 맞춘다(프로젝트 파일은 사람 손을 탄다) */
  function setDoc(value) {
    if (value === null || value === undefined) {
      doc = null;
    } else {
      var checked = Draw.normalizeDoc(value);
      if (!checked.ok) {
        doc = null;
        note("⚠ 그림 문서를 읽지 못했습니다 — " + checked.errors.map(function (error) {
          return (error.path ? error.path + ": " : "") + error.message;
        }).join("; "), "error");
      } else {
        doc = checked.doc;
      }
    }
    registerDoc();
    if (doc && !Draw.isEmpty(doc)) {
      ensureMounted();
    }
    if (sel.jamo === null && doc) {
      sel = { jamo: firstProposal(), context: "" };
    }
    scheduleRender();
    emit("change", { doc: doc ? clone(doc) : null });
  }

  var participantSpec = {
    get: function () { return doc; },
    set: setDoc,
    /* 묶음 편집 중(포인터를 끄는 동안) — 칸 그림만 다시 그린다. 세트 등록·디자인은 commit 때 */
    preview: function (value) {
      renderCanvas(value && Draw.isDoc(value) ? value : doc);
    }
  };
  var attached = false;

  /* 참가자는 그림이 생길 때 붙인다 — 그리기를 시작하거나, 연 프로젝트·초안에 그림 문서가 있을 때. 맨 작업실의 참가자 목록·
   * 프로젝트는 그대로다. 붙일 때 마지막으로 연 프로젝트·초안의 그림이 있으면 design.participant가 따라잡는다(세트 등록) */
  function attach() {
    if (!attached) {
      design.participant("drawings", participantSpec);
      attached = true;
    }
    return attached;
  }

  function savedDrawing(options) {
    var saved = options && options.design && options.design.participants;
    return Boolean(saved && typeof saved === "object" && saved.drawings);
  }

  // ── 디자인 바꾸기 ─────────────────────────────────────────────────────

  /* 그림 문서의 다음 상태에 맞는 디자인: 처음 칸을 넣으면 그 세트로(재료 svg), 문서가 비면 그 세트의 보이는 칸을 비운다,
   * 지금 목표 단계(editor.authoringTarget)를 다 그렸으면 다음 단계로 */
  function designFor(draft, next) {
    var json = draft;
    var empty = Draw.isEmpty(next);
    if (!empty && Design.currentSet(json) !== next.set) {
      json = Design.withMode(json, "svg", { set: next.set }).design;
    }
    Object.keys(json.sources || {}).forEach(function (id) {
      var source = json.sources[id];
      if (source && source.kind === "svg" && source.assetSet === next.set) {
        if (empty) {
          source.cells = [];
        } else if (Array.isArray(source.cells) && !source.cells.length) {
          delete source.cells;
        }
      }
    });
    if (!empty && Design.currentSet(json) === next.set && json.editor && json.editor.authoringTarget) {
      var progress = Draw.progress(next, FontKku);
      var target = json.editor.authoringTarget;
      var row = progress.stages[STAGES.indexOf(target)];
      if (row && !row.missing.length && progress.next && STAGES.indexOf(progress.next) > STAGES.indexOf(target)) {
        json.editor.authoringTarget = progress.next;
      }
    }
    return json;
  }

  function switching(next) {
    return !Draw.isEmpty(next) && currentSet() !== next.set;
  }

  function editLabel(label, next) {
    return label + (switching(next) ? " · 그림 세트로" : "");
  }

  function refused(error, key) {
    note("⚠ " + (error && error.message || error), "error");
    return { ok: false, design: design.json(), errors: [{ code: "STUDIO_DRAW_INVALID", path: key ? "cells." + key : "",
      message: String(error && error.message || error) }], impact: null, cancelled: false };
  }

  function track(promise) {
    pendingEdits += 1;
    return Promise.resolve(promise).then(function (result) {
      pendingEdits -= 1;
      scheduleRender();
      return result;
    }, function (error) {
      pendingEdits -= 1;
      scheduleRender();
      throw error;
    });
  }

  /* 그림 문서 한 상태를 편집 하나로(기록 한 줄) — 디자인은 designFor */
  function commitDoc(label, next, extra) {
    var opts = { participants: { drawings: next } };
    if (extra && extra.impact) {
      opts.impact = extra.impact;
    }
    return track(design.edit(editLabel(label, next), function (draft) { return designFor(draft, next); }, opts));
  }

  function ensureDoc() {
    attach();
    if (!doc) {
      doc = Draw.createDoc();
      if (sel.jamo === null) {
        sel = { jamo: firstProposal(), context: "" };
      }
    }
    return doc;
  }

  function setCell(key, value, options) {
    var opts = options || {};
    if (value === null || value === undefined) {
      return removeCell(key);
    }
    ensureDoc();
    ensureMounted();
    var next;
    try {
      next = Draw.setCell(doc, key, value, { origin: opts.origin || "authored", from: opts.from, label: opts.partLabel, group: opts.group });
    } catch (error) {
      return Promise.resolve(refused(error, key));
    }
    return commitDoc(opts.label || key + " 그리기", next);
  }

  /* 세트 상태 — 영향 목록(F1 impactOf)의 sets 값 { cells, options }. 빈 문서는 {}(등록할 수 없는 세트) */
  function setState(value) {
    return Draw.isEmpty(value) ? {} : { cells: Draw.toCells(value), options: Draw.registerOptions(value) };
  }

  /* 칸 지우기 — 그 칸을 빌려 쓰던 자모(ㄱ → ㅋ·ㄲ)를 영향 목록으로 묻는다(영향 처리기) */
  function removeCell(key) {
    if (!doc || !doc.cells[key]) {
      return Promise.resolve(refused(new Error("그린 칸이 없습니다: " + key), key));
    }
    var next = Draw.removeCell(doc, key);
    var sets = { before: {}, after: {} };
    sets.before[doc.set] = setState(doc);
    sets.after[doc.set] = setState(next);
    return commitDoc(key + " 지우기", next, { impact: { sets: sets } });
  }

  function partEdit(label, key, change) {
    if (!doc) {
      return Promise.resolve(refused(new Error("그림 문서가 없습니다 — 먼저 그리기를 시작하세요"), key));
    }
    var next;
    try {
      next = change(doc);
    } catch (error) {
      return Promise.resolve(refused(error, key));
    }
    return commitDoc(key + " " + label, next);
  }

  function movePart(key, partId, dx, dy) {
    return partEdit("부분 옮기기", key, function (current) { return Draw.movePart(current, key, partId, dx, dy); });
  }

  function scalePart(key, partId, sx, sy) {
    return partEdit("부분 크기", key, function (current) { return Draw.scalePart(current, key, partId, sx, sy); });
  }

  function removePart(key, partId) {
    if (selectedPart === partId) {
      selectedPart = null;
    }
    return partEdit("부분 지우기", key, function (current) { return Draw.removePart(current, key, partId); });
  }

  /* AI·다른 도구의 SVG 글 → 허용 목록 도형만(sanitizeSvg, §18.1). 버린 것은 경고 목록에 */
  function importSvg(key, text) {
    var target = splitKey(key);
    if (!Draw.isEditableKey(key)) {
      return Promise.resolve({ ok: false, shapes: [], warnings: [], rejected: [], refused: { code: "bad-key", message: "고칠 수 없는 칸: " + key }, edit: null });
    }
    var result = Draw.sanitizeSvg(String(text === undefined || text === null ? "" : text));
    lastImport = { key: key, warnings: result.warnings.slice(), rejected: result.rejected.slice(), refused: result.refused, count: result.shapes.length };
    select(target.jamo, target.context);
    renderWarnings();
    if (!result.ok) {
      note("⚠ SVG를 가져오지 않았습니다 — " + (result.refused ? result.refused.message : "그릴 도형이 없음"), "error");
      return Promise.resolve({ ok: false, shapes: [], warnings: result.warnings, rejected: result.rejected, refused: result.refused, edit: null });
    }
    return setCell(key, result.shapes, { origin: "imported", label: key + " SVG 가져오기" }).then(function (edit) {
      if (edit.ok) {
        note(key + "에 도형 " + result.shapes.length + "개를 가져왔습니다" + (result.warnings.length ? " — 버린 것 " + result.warnings.length + "가지(아래 목록)" : "") + ".",
          result.warnings.length ? "warn" : "info");
      }
      return { ok: edit.ok, shapes: result.shapes, warnings: result.warnings, rejected: result.rejected, refused: null, edit: edit };
    });
  }

  // ── 상태 · 진행 · 제안 ─────────────────────────────────────────────────

  function progress() {
    return doc ? Draw.progress(doc, FontKku) : FontKku.authoringProgress([]);
  }

  function rootOf(plan) {
    return plan.trace.filter(function (item) { return item.path.length === 0; })[0] || null;
  }

  /* 자모 하나의 지금 모양 — 지금 디자인(이름 하나)의 planJamo 뿌리 결과. 그 결과가 이 문서의 칸을 그대로 쓴 것이면 그림 출처
   * (authored · detached · imported). ㆍ는 planJamo가 받지 않는 보조 원본이라 그림 여부만 */
  function statusOf(jamo) {
    var drawn = doc ? Draw.originOf(doc, jamo) : null;
    if (jamo === HELPER) {
      return { status: drawn || "none", recipe: "", drawn: Boolean(drawn), trace: drawn ? "ok" : "", diagnostic: "" };
    }
    var root = null;
    var diagnostic = "";
    try {
      root = rootOf(FontKku.planJamo(jamo, { design: design.name() }));
    } catch (error) {
      diagnostic = error && error.code || "PLAN_FAILED";
    }
    var result = root ? root.result : "none";
    var json = design.state.json;
    var source = root && json.sources ? json.sources[root.source] : null;
    var fromDoc = Boolean(drawn) && result === "direct" && Boolean(source) && source.kind === "svg" && source.assetSet === doc.set;
    return { status: fromDoc ? drawn : result, recipe: root && root.recipe || "", drawn: Boolean(drawn),
      trace: root ? root.status : "error", diagnostic: root && root.diagnostic || diagnostic };
  }

  function statuses() {
    var out = {};
    GRID.forEach(function (jamo) {
      out[jamo] = statusOf(jamo);
    });
    return out;
  }

  function proposals(map) {
    var table = map || statuses();
    return Draw.proposals({ progress: progress(), statuses: function (jamo) { return table[jamo] ? table[jamo].status : null; },
      sentence: previewText() });
  }

  function firstProposal() {
    try {
      var list = Draw.proposals({ progress: progress(), sentence: previewText() });
      return list.length ? list[0].jamo : ORIGIN8[0];
    } catch (error) {
      return ORIGIN8[0];
    }
  }

  // ── 고르기 ────────────────────────────────────────────────────────────

  function select(jamo, context) {
    var text = String(jamo || "");
    var contexts = Draw.contextsFor(text);
    if (!contexts.length) {
      return false;
    }
    var ctx = contexts.indexOf(context || "") >= 0 ? context || "" : "";
    if (sel.jamo !== text || sel.context !== ctx) {
      selectedPart = null;
    }
    sel = { jamo: text, context: ctx };
    if (gesture) {
      cancelGesture();
    }
    scheduleRender();
    emit("select", { jamo: text, context: ctx, key: keyOf(text, ctx) });
    return true;
  }

  /* 미리보기에서 고른 자모(조합형 낱자) → 호환 자모. 그리기 칸이 보일 때만 따라간다 */
  function compatOf(node) {
    var ch = node.getAttribute("data-jamo") || "";
    var code = ch.charCodeAt(0);
    if (code >= 0x1100 && code <= 0x1112) {
      return { jamo: CHO.charAt(code - 0x1100), context: "" };
    }
    if (code >= 0x1161 && code <= 0x1175) {
      return { jamo: JUNG.charAt(code - 0x1161), context: "" };
    }
    if (code >= 0x11a8 && code <= 0x11c2) {
      var jamo = JONG.charAt(code - 0x11a8);
      return { jamo: jamo, context: doc && doc.cells[jamo + "@jong"] ? "@jong" : "" };
    }
    return /[ㄱ-ㆎ]/.test(ch) ? { jamo: ch, context: "" } : null;
  }

  // ── 시작 · 탭 ─────────────────────────────────────────────────────────

  function onShow(node) {
    section = section || node;
    build();
    visible = true;
    scheduleRender();
  }

  function onHide() {
    visible = false;
    if (gesture) {
      cancelGesture();
    }
    releaseLease();
  }

  function ensureMounted() {
    if (!section) {
      section = Studio.f.mount("draw", { label: "그리기 8→24→40", modes: ["svg"], onShow: onShow, onHide: onHide });
      build();
      syncEntry();
    }
    return section;
  }

  /* 빈 그림 문서를 만들고 탭을 연다 — 디자인·편집 기록은 그대로(첫 칸을 넣을 때 디자인이 그 세트로) */
  function start() {
    ensureDoc();
    ensureMounted();
    if (mode() === "svg") {
      Studio.f.show("draw");
    }
    scheduleRender();
    return clone(doc);
  }

  function open() {
    ensureMounted();
    return Studio.f.show("draw");
  }

  function buildEntry() {
    var pick = document.querySelector("[data-studio-design] .studio-design-pick");
    if (!pick) {
      return;
    }
    entry = make("p", "studio-draw-entry");
    entry.dataset.drawEntryRow = "";
    var button = make("button", "", "그리기 8 → 24 → 40");
    button.type = "button";
    button.dataset.drawEntry = "";
    var hint = make("small", "", "원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)부터 직접 그립니다 — 나머지는 조립식이 만들고, 그린 세트는 첫 획을 그을 때 디자인에 들어갑니다.");
    entry.appendChild(button);
    entry.appendChild(hint);
    pick.appendChild(entry);
    button.addEventListener("click", function () {
      if (mode() !== "svg") {
        var own = doc && !Draw.isEmpty(doc) && typeof FontKku.jamoSets === "function" && FontKku.jamoSets().indexOf(doc.set) >= 0;
        design.setMode("svg", own ? { set: doc.set } : undefined);
      }
      start();
    });
  }

  function syncEntry() {
    if (entry) {
      entry.hidden = Boolean(section) && mode() === "svg";
    }
  }

  // ── 화면 만들기 ───────────────────────────────────────────────────────

  function build() {
    if (built || !section) {
      return;
    }
    built = true;
    section.classList.add("studio-draw");
    section.setAttribute("aria-label", "그리기 8 → 24 → 40");

    var head = make("div", "studio-draw-head");
    var title = make("h3", "studio-draw-title", "그리기 8 → 24 → 40");
    els.set = make("output", "studio-draw-set");
    els.set.dataset.drawSet = "";
    head.appendChild(title);
    head.appendChild(els.set);
    section.appendChild(head);

    els.stepper = make("ol", "studio-draw-stepper");
    els.stepper.dataset.drawStepper = "";
    els.stages = {};
    STAGES.forEach(function (stage) {
      var item = make("li", "studio-draw-stage");
      item.dataset.drawStage = stage;
      var name = make("strong", "", Draw.STAGE_LABELS[stage]);
      var count = make("span", "studio-draw-stage-count");
      var bar = make("span", "studio-draw-stage-bar");
      var fill = make("span", "studio-draw-stage-fill");
      bar.appendChild(fill);
      item.appendChild(name);
      item.appendChild(count);
      item.appendChild(bar);
      els.stepper.appendChild(item);
      els.stages[stage] = { item: item, count: count, fill: fill };
    });
    els.helper = make("li", "studio-draw-stage studio-draw-helper");
    els.helper.dataset.drawHelper = "";
    els.helper.appendChild(make("strong", "", HELPER));
    els.helperText = make("span", "studio-draw-stage-count");
    els.helper.appendChild(els.helperText);
    els.stepper.appendChild(els.helper);
    section.appendChild(els.stepper);

    var body = make("div", "studio-draw-body");
    var side = make("div", "studio-draw-side");

    var proposalBox = make("div", "studio-draw-block");
    proposalBox.appendChild(make("h4", "studio-draw-subtitle", "다음에 그릴 자모"));
    els.proposals = make("ol", "studio-draw-proposals");
    els.proposals.dataset.drawProposals = "";
    proposalBox.appendChild(els.proposals);
    els.proposalsEmpty = make("p", "studio-draw-empty", "40자를 모두 그렸습니다.");
    els.proposalsEmpty.hidden = true;
    proposalBox.appendChild(els.proposalsEmpty);
    side.appendChild(proposalBox);

    var gridBox = make("div", "studio-draw-block");
    gridBox.appendChild(make("h4", "studio-draw-subtitle", "자모 41 — 지금 디자인에서 어떻게 그려지나"));
    els.grid = make("div", "studio-draw-grid");
    els.grid.dataset.drawGrid = "";
    els.grid.setAttribute("role", "group");
    els.grid.setAttribute("aria-label", "자모 칸 — 고르면 편집기가 열립니다");
    els.tiles = {};
    GRID.forEach(function (jamo) {
      var tile = make("button", "studio-draw-tile");
      tile.type = "button";
      tile.dataset.drawJamo = jamo;
      tile.dataset.stage = stageOf(jamo);
      tile.appendChild(make("span", "studio-draw-tile-jamo", jamo));
      tile.appendChild(make("span", "studio-draw-tile-mark"));
      els.grid.appendChild(tile);
      els.tiles[jamo] = tile;
    });
    gridBox.appendChild(els.grid);
    var legend = make("p", "studio-draw-legend");
    ["authored", "detached", "imported", "composed", "strokes", "primitive", "none"].forEach(function (status) {
      var key = make("span", "studio-draw-legend-item", STATUS_TEXT[status]);
      key.dataset.status = status;
      legend.appendChild(key);
    });
    gridBox.appendChild(legend);
    side.appendChild(gridBox);
    body.appendChild(side);
    body.appendChild(buildEditor());
    /* 문장은 본문 격자 안 — 넓으면 왼쪽 칸 아래(편집기 옆 빈자리), 좁으면 편집기 뒤 */
    body.appendChild(buildSentences());
    section.appendChild(body);

    els.message = make("p", "studio-draw-message");
    els.message.dataset.drawMessage = "";
    els.message.setAttribute("role", "status");
    section.appendChild(els.message);
    bind();
  }

  function buildEditor() {
    var editor = make("div", "studio-draw-editor");
    editor.dataset.drawEditor = "";
    var head = make("div", "studio-draw-editor-head");
    els.key = make("strong", "studio-draw-key");
    els.key.dataset.drawKey = "";
    els.keyStatus = make("span", "studio-draw-key-status");
    els.keyStatus.dataset.drawKeyStatus = "";
    els.contexts = make("div", "studio-draw-contexts");
    els.contexts.setAttribute("role", "group");
    els.contexts.setAttribute("aria-label", "문맥 칸");
    head.appendChild(els.key);
    head.appendChild(els.keyStatus);
    head.appendChild(els.contexts);
    editor.appendChild(head);

    var tools = make("div", "studio-draw-tools");
    tools.setAttribute("role", "radiogroup");
    tools.setAttribute("aria-label", "그리기 도구");
    TOOLS.forEach(function (item) {
      var label = make("label", "studio-draw-tool");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "draw-tool";
      input.value = item.id;
      input.checked = item.id === tool;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + item.label));
      tools.appendChild(label);
    });
    editor.appendChild(tools);

    var canvas = svgNode("svg", { viewBox: "0 0 100 100", class: "studio-draw-canvas", tabindex: "0", role: "application",
      "aria-label": "칸 편집 — 0–100 격자. 끌어서 긋기, Escape 취소, Enter 꺾은선 끝" });
    canvas.setAttribute("data-draw-canvas", "");
    var grid = svgNode("g", { class: "studio-draw-gridlines", "aria-hidden": "true" });
    var lines = [];
    for (var at = 0; at <= 100; at += 10) {
      lines.push("M" + at + " 0V100M0 " + at + "H100");
    }
    grid.appendChild(svgNode("path", { d: lines.join(""), class: "studio-draw-grid-minor" }));
    grid.appendChild(svgNode("path", { d: "M50 0V100M0 50H100", class: "studio-draw-grid-major" }));
    canvas.appendChild(grid);
    els.ghost = svgNode("text", { x: "50", y: "50", class: "studio-draw-ghost", "text-anchor": "middle", "dominant-baseline": "central",
      "aria-hidden": "true" });
    els.ghost.setAttribute("data-draw-ghost", "");
    canvas.appendChild(els.ghost);
    els.shapes = svgNode("g", { class: "studio-draw-shapes" });
    els.shapes.setAttribute("data-draw-shapes", "");
    canvas.appendChild(els.shapes);
    els.live = svgNode("g", { class: "studio-draw-live", "aria-hidden": "true" });
    canvas.appendChild(els.live);
    els.canvas = canvas;
    var frame = make("div", "studio-draw-canvas-frame");
    frame.appendChild(canvas);
    editor.appendChild(frame);
    editor.appendChild(make("p", "studio-draw-hint",
      "칸은 0–100 격자입니다. 그린 범위를 런타임이 자모 자리에 맞추고, 획 굵기는 세트 하나로 같습니다. 회색 글자는 기기 글꼴 참고입니다."));

    els.parts = make("ol", "studio-draw-parts");
    els.parts.dataset.drawParts = "";
    editor.appendChild(els.parts);

    var actions = make("div", "studio-draw-actions");
    els.clear = make("button", "", "칸 지우기");
    els.clear.type = "button";
    els.clear.dataset.drawClear = "";
    actions.appendChild(els.clear);
    editor.appendChild(actions);

    var importBox = make("details", "studio-draw-import");
    importBox.appendChild(make("summary", "", "SVG 가져오기 — AI·다른 도구에서"));
    els.importText = make("textarea", "studio-draw-import-text");
    els.importText.dataset.drawImport = "";
    els.importText.spellcheck = false;
    els.importText.setAttribute("aria-label", "가져올 SVG 글");
    els.importText.placeholder = '<svg viewBox="0 0 100 100"> … </svg>';
    importBox.appendChild(els.importText);
    var importActions = make("div", "studio-draw-actions");
    var apply = make("button", "", "이 칸에 가져오기");
    apply.type = "button";
    apply.dataset.drawImportApply = "";
    var prompt = make("button", "", "AI 요청 글 복사");
    prompt.type = "button";
    prompt.dataset.drawImportPrompt = "";
    importActions.appendChild(apply);
    importActions.appendChild(prompt);
    importBox.appendChild(importActions);
    importBox.appendChild(make("small", "studio-draw-hint",
      "선·꺾은선·다각형·사각형·원·타원·path만 받습니다. 스크립트·이벤트 속성·글자·그림·참조·스타일·url()은 버리고 아래에 적습니다."));
    els.warnings = make("ul", "studio-draw-warnings");
    els.warnings.dataset.drawWarnings = "";
    els.warnings.hidden = true;
    importBox.appendChild(els.warnings);
    els.importBox = importBox;
    editor.appendChild(importBox);
    return editor;
  }

  var sentenceChrome = null;

  function buildSentences() {
    var box = make("div", "studio-draw-sentences");
    box.dataset.drawSentences = "";
    box.appendChild(make("h4", "studio-draw-subtitle", "문장 미리보기 — 미리보기 문장"));
    if (!sentenceChrome && typeof CSSStyleSheet === "function") {
      sentenceChrome = new CSSStyleSheet();
      sentenceChrome.replaceSync(":host { display: block; }\nfont-kku { display: block; }");
    }
    [{ id: "current", label: "지금 디자인" }, { id: "origin8", label: "원형 8만" }].forEach(function (row) {
      var line = make("div", "studio-draw-sentence-row");
      line.dataset.drawSentenceRow = row.id;
      var label = make("span", "studio-draw-sentence-label", row.label);
      var stage = make("div", "studio-draw-sentence-stage");
      var root = stage.attachShadow({ mode: "open" });
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = Studio.coreHref();
      /* 글꼴 시트가 오기 전에 그린 문장은 다시 그린다. 오지 않아도(막힘) settled()를 붙들지 않게 4초에서 놓는다 */
      pendingLinks += 1;
      var waiting = true;
      var loaded = function () {
        if (waiting) {
          waiting = false;
          pendingLinks = Math.max(0, pendingLinks - 1);
          scheduleRender();
        }
      };
      link.addEventListener("load", loaded, { once: true });
      link.addEventListener("error", loaded, { once: true });
      setTimeout(loaded, 4000);
      root.appendChild(link);
      var host = document.createElement("font-kku");
      host.setAttribute("data-draw-sentence", row.id);
      host.setAttribute("size", "34px");
      host.setAttribute("wrap-unit", "glyph");
      root.appendChild(host);
      /* 런타임이 스스로 다시 그리면(그림 세트가 늦게 실림·세트 다시 등록) 센 값만 다시 — 다시 그리지 않는다 */
      root.addEventListener("font-kku:render", scheduleReadout);
      Studio.addPreviewRoot(root, sentenceChrome ? [sentenceChrome] : []);
      var output = make("output", "studio-draw-sentence-readout");
      line.appendChild(label);
      line.appendChild(stage);
      line.appendChild(output);
      box.appendChild(line);
      sentences.rows[row.id] = { line: line, host: host, output: output };
    });
    return box;
  }

  // ── 그리기 ────────────────────────────────────────────────────────────

  function render() {
    renderTimer = null;
    syncEntry();
    if (!built || !visible) {
      return;
    }
    var table = statuses();
    renderStepper();
    renderProposals(table);
    renderGrid(table);
    renderEditor(table);
    renderSentences();
  }

  function scheduleRender() {
    if (!renderTimer) {
      renderTimer = setTimeout(render, 0);
    }
  }

  function renderStepper() {
    var state = progress();
    var json = design.state.json;
    var target = usesDoc() && json.editor ? json.editor.authoringTarget : null;
    state.stages.forEach(function (row) {
      var view = els.stages[row.stage];
      view.item.dataset.have = String(row.have.length);
      view.item.dataset.total = String(row.total);
      view.item.dataset.done = String(!row.missing.length);
      view.item.dataset.target = String(target === row.stage);
      view.item.dataset.extra = String(row.extra.length);
      view.count.textContent = row.have.length + "/" + row.total;
      view.fill.style.inlineSize = (row.total ? Math.round(row.have.length / row.total * 100) : 0) + "%";
      view.item.title = row.missing.length ? "남은 자모: " + row.missing.join(" ") : "다 그림";
    });
    els.helper.dataset.drawn = String(state.helper.drawn);
    els.helperText.textContent = state.helper.drawn ? "보조 원본 그림" : "보조 원본(천지인 점) — 그리지 않음";
    var set = doc ? doc.set : "";
    els.set.textContent = doc ? "그림 세트 " + set + (usesDoc() ? " — 디자인에 들어감" : Draw.isEmpty(doc) ? " — 첫 획을 그으면 디자인에 들어갑니다" : " — 지금 디자인은 다른 세트")
      : "";
    els.set.dataset.drawSet = set;
    els.set.dataset.inDesign = String(usesDoc());
  }

  function renderProposals(table) {
    var list = proposals(table);
    els.proposals.textContent = "";
    list.forEach(function (item) {
      var li = make("li");
      var button = make("button", "studio-draw-proposal");
      button.type = "button";
      button.dataset.jamo = item.jamo;
      button.dataset.status = item.status || "";
      button.dataset.count = String(item.count);
      button.appendChild(make("strong", "", item.jamo));
      button.appendChild(make("small", "", item.reason));
      li.appendChild(button);
      els.proposals.appendChild(li);
    });
    els.proposalsEmpty.hidden = list.length > 0;
  }

  function renderGrid(table) {
    GRID.forEach(function (jamo) {
      var tile = els.tiles[jamo];
      var state = table[jamo];
      tile.dataset.status = state.status;
      tile.dataset.recipe = state.recipe;
      tile.dataset.drawn = String(state.drawn);
      if (state.trace && state.trace !== "ok") {
        tile.dataset.trace = state.trace;
      } else {
        delete tile.dataset.trace;
      }
      tile.setAttribute("aria-pressed", String(sel.jamo === jamo));
      tile.title = jamo + " — " + (STATUS_TEXT[state.status] || state.status) + (state.recipe ? " " + state.recipe : "") +
        (state.diagnostic ? " · " + state.diagnostic : "");
    });
  }

  function renderEditor(table) {
    var key = selectedKey();
    var jamo = sel.jamo;
    var state = jamo && table[jamo] ? table[jamo] : null;
    els.key.textContent = key || "-";
    els.key.dataset.drawKey = key || "";
    els.keyStatus.textContent = state ? (STATUS_TEXT[state.status] || state.status) + (state.recipe ? " · " + state.recipe : "") : "";
    els.keyStatus.dataset.status = state ? state.status : "";
    els.contexts.textContent = "";
    (jamo ? Draw.contextsFor(jamo) : []).forEach(function (context) {
      var button = make("button", "studio-draw-context", CONTEXT_LABELS[context] || context);
      button.type = "button";
      button.dataset.drawContext = context;
      button.setAttribute("aria-pressed", String(context === sel.context));
      if (doc && doc.cells[jamo + context]) {
        button.dataset.drawn = "true";
      }
      els.contexts.appendChild(button);
    });
    els.ghost.textContent = jamo || "";
    els.canvas.setAttribute("aria-label", (key || "칸") + " 편집 — 0–100 격자. 끌어서 긋기, Escape 취소, Enter 꺾은선 끝");
    els.canvas.dataset.tool = tool;
    renderCanvas(doc);
    renderParts();
    els.clear.disabled = !(doc && key && doc.cells[key]);
    renderWarnings();
  }

  function shapeNode(shape, stroke) {
    var item = typeof shape === "string" ? { d: shape } : shape;
    var fill = item.fill === true;
    var node = Array.isArray(item.ellipse)
      ? svgNode("ellipse", { cx: item.ellipse[0], cy: item.ellipse[1], rx: item.ellipse[2], ry: item.ellipse[3] })
      : svgNode("path", { d: item.d });
    node.setAttribute("class", fill ? "studio-draw-fill" : "studio-draw-stroke");
    if (!fill) {
      node.setAttribute("stroke-width", String(stroke));
    }
    return node;
  }

  /* 칸 그림 — value: 그릴 문서(묶음 편집 미리보기면 그 상태) */
  function renderCanvas(value) {
    if (!built) {
      return;
    }
    els.shapes.textContent = "";
    var key = selectedKey();
    var cell = value && key && value.cells ? value.cells[key] : null;
    var stroke = value && value.options ? Number(value.options.stroke) || Draw.DEFAULT_OPTIONS.stroke : Draw.DEFAULT_OPTIONS.stroke;
    (cell ? cell.parts : []).forEach(function (part) {
      var group = svgNode("g", { class: "studio-draw-part" });
      group.setAttribute("data-part-id", part.id);
      if (part.id === selectedPart) {
        group.setAttribute("data-selected", "true");
      }
      part.shapes.forEach(function (shape) {
        group.appendChild(shapeNode(shape, stroke));
      });
      els.shapes.appendChild(group);
    });
    els.canvas.dataset.parts = String(cell ? cell.parts.length : 0);
  }

  function renderParts() {
    els.parts.textContent = "";
    var key = selectedKey();
    var cell = doc && key ? doc.cells[key] : null;
    if (cell && selectedPart && !cell.parts.some(function (part) { return part.id === selectedPart; })) {
      selectedPart = null;
    }
    (cell ? cell.parts : []).forEach(function (part) {
      var item = make("li", "studio-draw-part-row");
      item.dataset.partId = part.id;
      item.setAttribute("aria-current", String(part.id === selectedPart));
      var pick = make("button", "studio-draw-part-pick", part.label + " · " + part.id);
      pick.type = "button";
      pick.dataset.drawPartPick = part.id;
      item.appendChild(pick);
      [["←", "-2,0"], ["→", "2,0"], ["↑", "0,-2"], ["↓", "0,2"]].forEach(function (pair) {
        var move = make("button", "studio-draw-part-tool", pair[0]);
        move.type = "button";
        move.dataset.drawPartMove = pair[1];
        move.setAttribute("aria-label", part.label + " 옮기기 " + pair[0]);
        item.appendChild(move);
      });
      [["키우기", "1.1"], ["줄이기", "0.9"]].forEach(function (pair) {
        var scaleButton = make("button", "studio-draw-part-tool", pair[0]);
        scaleButton.type = "button";
        scaleButton.dataset.drawPartScale = pair[1];
        item.appendChild(scaleButton);
      });
      var drop = make("button", "studio-draw-part-tool", "지우기");
      drop.type = "button";
      drop.dataset.drawPartRemove = part.id;
      item.appendChild(drop);
      els.parts.appendChild(item);
    });
    if (cell && cell.provenance) {
      els.parts.dataset.origin = cell.provenance.origin;
    } else {
      delete els.parts.dataset.origin;
    }
  }

  function renderWarnings() {
    if (!built) {
      return;
    }
    els.warnings.textContent = "";
    var show = lastImport && lastImport.key === selectedKey() ? lastImport : null;
    (show ? show.warnings : []).forEach(function (text) {
      els.warnings.appendChild(make("li", "", text));
    });
    if (show && show.refused) {
      var refusedItem = make("li", "", "가져오지 않음 — " + show.refused.message);
      refusedItem.dataset.refused = show.refused.code;
      els.warnings.appendChild(refusedItem);
    }
    els.warnings.hidden = els.warnings.children.length === 0;
    if (!els.warnings.hidden) {
      els.importBox.open = true;
    }
  }

  // ── 문장 미리보기 ─────────────────────────────────────────────────────

  /* 원형 8만 그린 셈 치는 디자인 — 이 문서 세트를 쓰는 svg 소스의 보이는 칸을 (그린 칸 ∩ 원형 8)로 */
  function origin8Json() {
    var json = design.json();
    var drawn = {};
    (doc ? Draw.cellKeys(doc) : []).forEach(function (key) {
      drawn[Draw.baseOf(key)] = true;
    });
    var cells = ORIGIN8.filter(function (jamo) { return drawn[jamo]; });
    Object.keys(json.sources || {}).forEach(function (id) {
      var source = json.sources[id];
      if (doc && source && source.kind === "svg" && source.assetSet === doc.set) {
        source.cells = cells;
      }
    });
    return json;
  }

  function releaseLease() {
    if (sentences.lease) {
      try {
        sentences.lease.release();
      } catch (error) {
        /* 이미 지운 이름 */
      }
      sentences.lease = null;
      sentences.leaseJson = null;
    }
  }

  function leaseName() {
    var json = origin8Json();
    var text = Design.stableJson(json);
    try {
      if (!sentences.lease) {
        sentences.lease = design.lease(json);
        sentences.leaseJson = text;
      } else if (sentences.leaseJson !== text) {
        sentences.lease.update(json);
        sentences.leaseJson = text;
      }
      return sentences.lease.name;
    } catch (error) {
      releaseLease();
      return null;
    }
  }

  /* 자모 노드마다 뿌리 요청(조각 경로 []) 하나의 결과를 센다 — 조합이 빌려 쓴 칸(조각 요청)은 세지 않는다 */
  function countRequests(host) {
    var counts = { requests: 0, direct: 0, composed: 0, strokes: 0, primitive: 0, pending: 0 };
    var trace = typeof FontKku.traceOf === "function" ? FontKku.traceOf(host) : null;
    (trace ? trace.nodes : []).forEach(function (node) {
      node.requests.forEach(function (request) {
        if (request.path.length) {
          return;
        }
        counts.requests += 1;
        if (counts[request.result] !== undefined) {
          counts[request.result] += 1;
        }
        if (request.status === "pending") {
          counts.pending += 1;
        }
      });
    });
    return counts;
  }

  function renderSentences() {
    var fontId = Studio.state.fontId;
    if (!fontId || !Studio.doc()) {
      return;
    }
    var names = { current: design.name(), origin8: leaseName() };
    Object.keys(sentences.rows).forEach(function (id) {
      var row = sentences.rows[id];
      var name = names[id];
      row.host.setAttribute("font", fontId);
      if (name) {
        row.host.style.setProperty("--fy-design", name);
      } else {
        row.host.style.removeProperty("--fy-design");
      }
      FontKku.render(row.host, { text: previewText() });
      FontKku.refreshAll(row.host);
    });
    readSentences();
  }

  var readoutTimer = null;

  function scheduleReadout() {
    if (!readoutTimer) {
      readoutTimer = setTimeout(readSentences, 0);
    }
  }

  function readSentences() {
    clearTimeout(readoutTimer);
    readoutTimer = null;
    Object.keys(sentences.rows).forEach(function (id) {
      var row = sentences.rows[id];
      var counts = countRequests(row.host);
      var drawnName = row.host.dataset.fyDesign || "";
      Object.keys(counts).forEach(function (key) {
        row.line.dataset[key] = String(counts[key]);
      });
      row.line.dataset.design = drawnName;
      row.output.textContent = drawnName
        ? "원본 " + counts.direct + " · 조합 " + counts.composed + " · 원소 획 " + counts.strokes + " · 대체 " + counts.primitive +
          (counts.pending ? " · 받는 중 " + counts.pending : "")
        : "디자인이 그려지지 않음" + (row.host.dataset.fyDesignStatus ? " " + row.host.dataset.fyDesignStatus : "");
    });
  }

  // ── 포인터 ────────────────────────────────────────────────────────────

  function pointOf(event) {
    var matrix = els.canvas.getScreenCTM();
    if (!matrix) {
      return null;
    }
    var point = els.canvas.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    var local = point.matrixTransform(matrix.inverse());
    return [Math.round(local.x * 10) / 10, Math.round(local.y * 10) / 10];
  }

  function distance(a, b) {
    return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
  }

  /* 끄는 중인 도형 하나 — 너무 작으면 null(클릭만 한 것) */
  function gestureShape(g, end) {
    var a = g.points[0];
    if (g.kind === "line") {
      return end && distance(a, end) >= 1 ? "M" + a[0] + " " + a[1] + "L" + end[0] + " " + end[1] : null;
    }
    if (g.kind === "ellipse") {
      if (!end) {
        return null;
      }
      var rx = Math.abs(end[0] - a[0]) / 2;
      var ry = Math.abs(end[1] - a[1]) / 2;
      return rx >= 0.5 && ry >= 0.5 ? { ellipse: [Math.round((a[0] + end[0]) * 5) / 10, Math.round((a[1] + end[1]) * 5) / 10,
        Math.round(rx * 10) / 10, Math.round(ry * 10) / 10] } : null;
    }
    var points = g.points.concat(end ? [end] : []);
    var length = 0;
    for (var index = 1; index < points.length; index += 1) {
      length += distance(points[index - 1], points[index]);
    }
    if (points.length < 2 || length < 1) {
      return null;
    }
    return g.kind === "pen" ? Draw.freehandData(points) : Draw.polylineData(points);
  }

  function pendingDoc(g, end) {
    if (g.kind === "move") {
      return end ? Draw.movePart(g.base, g.key, g.partId, end[0] - g.points[0][0], end[1] - g.points[0][1]) : g.base;
    }
    var shape = gestureShape(g, end);
    return shape ? Draw.setPart(g.base, g.key, null, [shape], { origin: "authored" }) : g.base;
  }

  function beginGesture(kind, point, extra) {
    ensureDoc();
    var key = selectedKey();
    if (!key) {
      return null;
    }
    /* 긋기·옮기기가 끝나면 칸이 생기므로 지금 디자인이 이 세트가 아니면 그 편집이 세트로 돌린다 */
    var label = (kind === "move" ? key + " 부분 옮기기" : key + " 그리기") + (currentSet() !== doc.set ? " · 그림 세트로" : "");
    gesture = {
      kind: kind,
      key: key,
      base: doc,
      points: [point],
      partId: extra && extra.partId || null,
      tx: design.begin(label),
      moved: false
    };
    return gesture;
  }

  function updateGesture(end) {
    var g = gesture;
    if (!g) {
      return;
    }
    try {
      g.tx.update(null, { drawings: pendingDoc(g, end) });
    } catch (error) {
      /* 그 자리의 도형이 모델 상한을 넘으면 미리보기만 건너뛴다 */
    }
    renderRubber(g, end);
  }

  function renderRubber(g, end) {
    els.live.textContent = "";
    if (g && g.kind === "polyline" && end) {
      var last = g.points[g.points.length - 1];
      els.live.appendChild(svgNode("path", { d: "M" + last[0] + " " + last[1] + "L" + end[0] + " " + end[1], class: "studio-draw-rubber" }));
    }
  }

  function finishGesture(end) {
    var g = gesture;
    if (!g) {
      return Promise.resolve(null);
    }
    gesture = null;
    els.live.textContent = "";
    var next;
    try {
      next = pendingDoc(g, end);
    } catch (error) {
      g.tx.cancel();
      note("⚠ " + (error && error.message || error), "error");
      return Promise.resolve(null);
    }
    if (next === g.base) {
      g.tx.cancel();
      renderCanvas(doc);
      return Promise.resolve(null);
    }
    g.tx.update(function (draft) { return designFor(draft, next); }, { drawings: next });
    return track(g.tx.commit());
  }

  function cancelGesture() {
    var g = gesture;
    gesture = null;
    if (els.live) {
      els.live.textContent = "";
    }
    if (g && g.tx.isOpen()) {
      g.tx.cancel();
    }
    renderCanvas(doc);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || !doc && !sel.jamo) {
      return;
    }
    var point = pointOf(event);
    if (!point) {
      return;
    }
    els.canvas.focus({ preventScroll: true });
    if (tool === "polyline") {
      if (gesture && gesture.kind === "polyline") {
        var last = gesture.points[gesture.points.length - 1];
        if (distance(last, point) >= 0.5) {
          gesture.points.push(point);
        }
        updateGesture(null);
      } else {
        beginGesture("polyline", point);
      }
      event.preventDefault();
      return;
    }
    if (gesture) {
      cancelGesture();
    }
    if (tool === "select") {
      var hit = event.target.closest ? event.target.closest("[data-part-id]") : null;
      selectedPart = hit ? hit.getAttribute("data-part-id") : null;
      renderCanvas(doc);
      renderParts();
      if (selectedPart) {
        beginGesture("move", point, { partId: selectedPart });
        els.canvas.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      return;
    }
    beginGesture(tool, point);
    els.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!gesture) {
      return;
    }
    var point = pointOf(event);
    if (!point) {
      return;
    }
    if (gesture.kind === "polyline") {
      renderRubber(gesture, point);
      return;
    }
    if (gesture.kind === "pen") {
      var last = gesture.points[gesture.points.length - 1];
      if (distance(last, point) >= 0.4) {
        gesture.points.push(point);
      }
      updateGesture(null);
      return;
    }
    gesture.moved = gesture.moved || distance(gesture.points[0], point) >= 0.5;
    if (gesture.moved) {
      updateGesture(point);
    }
  }

  function onPointerUp(event) {
    if (!gesture || gesture.kind === "polyline") {
      return;
    }
    var point = pointOf(event);
    if (gesture.kind === "move" && !gesture.moved) {
      cancelGesture();
      return;
    }
    finishGesture(gesture.kind === "pen" ? null : point);
  }

  function onKey(event) {
    if (event.key === "Escape" && gesture) {
      cancelGesture();
      note("긋기를 취소했습니다.");
      event.preventDefault();
    } else if (event.key === "Enter" && gesture && gesture.kind === "polyline") {
      finishGesture(null);
      event.preventDefault();
    } else if (!gesture && selectedPart && tool === "select" && event.target === els.canvas) {
      var step = event.shiftKey ? 5 : 1;
      var delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (delta) {
        movePart(selectedKey(), selectedPart, delta[0], delta[1]);
        event.preventDefault();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        removePart(selectedKey(), selectedPart);
        event.preventDefault();
      }
    }
  }

  // ── 이벤트 ────────────────────────────────────────────────────────────

  function aiPrompt(key) {
    var target = splitKey(key);
    return "한글 자모 '" + target.jamo + "'의 " + (CONTEXT_PROMPT[target.context] || "꼴") + "을 SVG 하나로 그려 주세요.\n" +
      "- <svg viewBox=\"0 0 100 100\"> 하나, 안에는 path·line·polyline·polygon·rect·circle·ellipse와 g(transform은 translate·scale·rotate·matrix)만\n" +
      "- 획은 중심선: fill=\"none\" stroke=\"#000\" stroke-width=\"8\" stroke-linecap=\"round\" (채운 모양은 fill만)\n" +
      "- 글자(text)·그림(image)·use·style·script·외부 참조·url() 없이\n" +
      "- 획 하나에 요소 하나, 자모가 칸을 거의 채우게. SVG 글만 답해 주세요.";
  }

  function bind() {
    section.addEventListener("click", function (event) {
      var target = event.target;
      var tile = target.closest("[data-draw-jamo]");
      var proposal = target.closest("[data-draw-proposals] [data-jamo]");
      var context = target.closest("[data-draw-context]");
      var row = target.closest("[data-part-id]");
      if (tile) {
        select(tile.dataset.drawJamo, "");
      } else if (proposal) {
        select(proposal.dataset.jamo, "");
      } else if (context) {
        select(sel.jamo, context.dataset.drawContext);
      } else if (target.closest("[data-draw-part-pick]")) {
        selectedPart = target.closest("[data-draw-part-pick]").dataset.drawPartPick;
        renderCanvas(doc);
        renderParts();
      } else if (row && target.closest("[data-draw-part-move]")) {
        var delta = target.closest("[data-draw-part-move]").dataset.drawPartMove.split(",").map(Number);
        selectedPart = row.dataset.partId;
        movePart(selectedKey(), row.dataset.partId, delta[0], delta[1]);
      } else if (row && target.closest("[data-draw-part-scale]")) {
        var factor = Number(target.closest("[data-draw-part-scale]").dataset.drawPartScale);
        selectedPart = row.dataset.partId;
        scalePart(selectedKey(), row.dataset.partId, factor, factor);
      } else if (target.closest("[data-draw-part-remove]")) {
        removePart(selectedKey(), target.closest("[data-draw-part-remove]").dataset.drawPartRemove);
      } else if (target.closest("[data-draw-clear]")) {
        removeCell(selectedKey());
      } else if (target.closest("[data-draw-import-apply]")) {
        importSvg(selectedKey(), els.importText.value);
      } else if (target.closest("[data-draw-import-prompt]")) {
        Studio.copyText(aiPrompt(selectedKey())).then(function (copied) {
          note(copied ? selectedKey() + " 칸을 그려 달라는 요청 글을 복사했습니다 — AI의 답(SVG)을 위 칸에 붙이세요."
            : "브라우저가 클립보드 쓰기를 막았습니다.", copied ? "info" : "warn");
        });
      }
    });
    section.addEventListener("change", function (event) {
      if (event.target.matches('input[name="draw-tool"]')) {
        if (gesture) {
          cancelGesture();
        }
        tool = event.target.value;
        els.canvas.dataset.tool = tool;
      }
    });
    els.canvas.addEventListener("pointerdown", onPointerDown);
    els.canvas.addEventListener("pointermove", onPointerMove);
    els.canvas.addEventListener("pointerup", onPointerUp);
    els.canvas.addEventListener("pointercancel", function () {
      if (gesture && gesture.kind !== "polyline") {
        cancelGesture();
      }
    });
    els.canvas.addEventListener("dblclick", function (event) {
      if (gesture && gesture.kind === "polyline") {
        finishGesture(null);
        event.preventDefault();
      }
    });
    els.canvas.addEventListener("keydown", onKey);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && gesture && event.target !== els.canvas) {
        onKey(event);
      }
    });
  }

  // ── 훅 · 시작 ─────────────────────────────────────────────────────────

  design.on("change", function () {
    if (doc && !Draw.isEmpty(doc) && usesDoc()) {
      ensureMounted();
    }
    syncEntry();
    scheduleRender();
  });

  Studio.on("render", scheduleRender);
  /* 미리보기를 런타임이 스스로 다시 그리면(그림 세트가 늦게 실림) 칸 상태도 다시 — 디자인 이름은 그대로라 change가 없다 */
  if (Studio.host) {
    Studio.host.addEventListener("font-kku:render", scheduleRender);
  }

  /* 프로젝트·초안 열기 — 디자인 패널(먼저 붙은 load 훅)이 디자인을 연 같은 차례 안에서 참가자를 붙여 그림 세트를 등록한다.
   * 이미 붙어 있으면 디자인 패널이 디자인보다 먼저 넣었다 */
  Studio.on("load", function (options) {
    if (!attached && savedDrawing(options)) {
      attach();
    }
  });

  Studio.on("select", function (node) {
    if (!visible || !node) {
      return;
    }
    var target = compatOf(node);
    if (target && GRID.indexOf(target.jamo) >= 0) {
      select(target.jamo, target.context);
    }
  });

  function busy() {
    return Boolean(renderTimer) || Boolean(readoutTimer) || pendingEdits > 0 || (built && visible && pendingLinks > 0);
  }

  design.addBusy(busy);
  buildEntry();
  syncEntry();
  /* 이 스크립트보다 먼저 연 초안·프로젝트에 그림이 있었으면 지금 붙어 따라잡는다 */
  if (savedDrawing(Studio.lastLoadOptions())) {
    attach();
  }

  function on(name, listener) {
    if (!listeners[name] || typeof listener !== "function") {
      throw new TypeError("font-studio: draw.on(" + JSON.stringify(name) + ") — events are select and change");
    }
    listeners[name].push(listener);
    return function () { off(name, listener); };
  }

  function off(name, listener) {
    if (listeners[name]) {
      listeners[name] = listeners[name].filter(function (entryListener) { return entryListener !== listener; });
    }
  }

  Studio.draw = {
    /* 빈 그림 문서 + 탭(디자인·기록은 그대로) → 문서 복사본 */
    start: start,
    open: open,
    /* 그림 문서 참가자 'drawings'를 붙인다(문서·탭은 만들지 않는다) — design.edit에 participants.drawings를 넘기기 전에(묶음 열기 등) */
    attach: attach,
    doc: function () { return doc ? clone(doc) : null; },
    /* 칸 하나(도형 목록 · 부분 목록 · { parts, provenance }) → Promise<편집 결과>. options: { label(기록 이름), origin, from, partLabel, group } */
    setCell: setCell,
    removeCell: removeCell,
    importSvg: importSvg,
    select: select,
    selection: function () { return { jamo: sel.jamo, context: sel.context, key: selectedKey(), part: selectedPart }; },
    movePart: movePart,
    scalePart: scalePart,
    removePart: removePart,
    progress: progress,
    proposals: function () { return proposals(); },
    /* { 자모: { status: authored|detached|imported|direct|composed|strokes|primitive|none, recipe, drawn, trace, diagnostic } } */
    statuses: statuses,
    statusOf: statusOf,
    /* 문장 미리보기 바탕 요소 { current, origin8 } — 아직 칸을 만들지 않았으면 null */
    sentence: function () {
      return built ? { current: sentences.rows.current.host, origin8: sentences.rows.origin8.host } : null;
    },
    tool: function (name) {
      if (name !== undefined && TOOLS.some(function (item) { return item.id === name; })) {
        if (gesture) {
          cancelGesture();
        }
        tool = name;
        if (built) {
          var radio = section.querySelector('input[name="draw-tool"][value="' + name + '"]');
          radio.checked = true;
          els.canvas.dataset.tool = tool;
        }
      }
      return tool;
    },
    on: on,
    off: off,
    busy: busy
  };
})();
