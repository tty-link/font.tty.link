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
 * · 문장 미리보기 하나(원형 8만 그린 셈 — lease, 보이는 칸 = 그린 칸 ∩ 원형 8). '지금 디자인' 문장은 본 미리보기와 같은 그림이라
 *   뺐다(PLAN-STUDIO-002 S3 ⚑5 — shadow root가 하나 더 들었다). 단계 줄은 공용 진행률 부품(FontStudio.progress)을 쓴다.
 * 포인터 한 번은 design.begin() → update(미리보기는 칸 그림만) → commit, 기록 한 줄. Escape는 취소.
 *
 * 편집 칸(D7, 작업실 비판 검토 2026-10-18): 그리기를 열면 미리보기에서 고른 자모(그 칸이 있으면)에서 열고, 그 뒤로는 사람이 칸·제안·
 * 문맥 단추를 누르거나 미리보기에서 새로 고를 때(또는 API select)만 바꾼다 — 획을 그어 미리보기를 다시 그려도 칸은 그대로다.
 * 보이지 않으면(다른 페이지·탭·접힘) 41칸·문장을 그리지 않고 문장 임시 이름을 돌려준다(D10). 보이면 따라잡는다.
 *
 * 탭은 늦게 붙인다(그리기를 시작하거나 그린 세트가 디자인에 들어올 때) — 맨 작업실의 탭 줄·편집 기록·임시 등록은 그대로다.
 * 재료가 그림 세트가 아니면 디자인 칸에 들어가는 단추([data-draw-entry])를 보인다.
 *
 * 다듬기(PLAN-STUDIO-002 S5-A) — 모두 고르지 않아도 된다(원칙 9):
 * - 여러 칸 한 번에: AI 답(글 + <svg> 여럿)을 통째로 붙이면 '칸마다 나눠 가져오기'가 칸 이름(data-jamo·id·제목·바로 앞 줄)으로 나눠
 *   새 칸·바꿀 칸·이름 모름·버린 도형을 먼저 보이고(사람이 칸을 고칠 수 있다), 넣으면 편집 하나(기록 한 줄)다. '이 칸에 가져오기'에
 *   SVG가 둘 넘게 들어 있으면 같은 미리 보기로 간다(전에는 한 칸에 모두 합쳤다). 모델 bundleImport, 자동화 계약 draw.importSvg(글).
 * - 한 번에 부탁하는 글: 지금 단계의 남은 칸(원형 8이면 ㆍ도)을 한 벌로 그려 달라는 글 — 답의 꼴은 위 가져오기가 읽는 꼴이다.
 * - 부분 회전: 고른 획 하나만 그 획의 가운데를 축으로 돌린다 — 부분 줄 ↺·↻(15°), 고르기 도구에서 [ ]  5°(Shift 15°).
 * - 다 그린 칸만: 문장 미리보기를 '원형 8만 그린 셈'(기본) 대신 다 그린 칸으로 지을 수 있는 글자만 보이게 고를 수 있다.
 * - 쉬운 모드 화면 말에 칸 키(@bar·@jong)·세트 이름·조립식 이름·도형 검사 원문을 싣지 않는다(정밀 모드에서 보임).
 *
 * 하지 않는 것(계획 밖): 위 자모를 따라가는 조각 보정(§5.5 — 떼어 낸 독립 그림에서만), 글꼴 낱자 → SVG(§6.6), 고정 배치의
 * 자모별 크기·자리(도장이 맡는다).
 *
 * FontStudio.draw = { start, doc, setCell, removeCell, importSvg, importCells, importBundle, previewBundle, bundle, select, selection,
 *                     movePart, scalePart, rotatePart, removePart, progress, proposals, statuses, sentence, sentenceView, aiPrompt,
 *                     tool, open, on, off, busy }
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var clone = Util.clone;
  var make = Util.element;

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
    origin8: Util.STAGE_JAMO.origin8.split(""),
    basic24: Util.STAGE_JAMO.basic24.split(""),
    full40: Util.STAGE_JAMO.full40.split("")
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
  /* 문맥 단추 이름 — 모델 contextsFor가 내는 꼬리만(바탕 칸이 세로 모음 옆 초성 꼴이라 @cho 단추는 없다). 칸 키(@bar)는 정밀
   * 모드에서만 이름 옆에 보인다 */
  var CONTEXT_LABELS = { "": "바탕", "@bar": "가로 모음 위", "@jong": "받침" };
  var STATUS_TEXT = Object.assign({}, Draw.STATUS_TEXT, { none: "그리지 않음", direct: "원본(다른 세트)" });
  var CONTEXT_PROMPT = { "": "바탕꼴(초성·모음 자리)", "@bar": "가로 모음(ㅗ·ㅡ 계열) 위에 놓이는 꼴", "@jong": "받침 자리 꼴" };
  var CHO = Util.CHO;
  var JUNG = Util.JUNG;
  var JONG = Util.JONG;

  var doc = null;
  var section = null;
  var built = false;
  var life = null; // 깨어 있는 동안의 수명 맥락(f.mount activate) — 탭이 보이고 디자인 페이지이고 본문이 펼쳐져 있을 때
  var sel = { jamo: null, context: "" };
  var selectedPart = null;
  var tool = "line";
  var gesture = null;
  var renderTimer = null;
  var pendingEdits = 0;
  var pendingLinks = 0;
  /* 칸마다 마지막 가져오기의 버린 것 { 칸: { key, warnings, rejected, refused, count } } — 그 칸을 고르면 경고 목록에 */
  var imports = {};
  /* 여러 칸 가져오기 미리 보기 { text, assign, result } — 넣거나 취소하면 null */
  var bundle = null;
  /* 문장 미리보기 보기 — origin8(원형 8만 그린 셈, 기본) | drawn(다 그린 칸만) */
  var sentenceView = "origin8";
  var drawnMemo = { key: "", table: {} };
  var listeners = { select: [], change: [] };
  var els = {};
  var sentences = { rows: {}, lease: null, leaseJson: null };
  var entry = null;
  var previewBox = document.querySelector("[data-studio-preview]");
  /* 편집기가 마지막으로 따라간(본) 미리보기 선택의 정체(글자 차례 · 원문 · 자모) — 다시 그리기가 같은 선택을 다시 알려도 칸을
   * 바꾸지 않는다. previewPress: 사람이 미리보기를 누르는 중(같은 자모를 다시 눌러도 따라간다) */
  var pickSeen = null;
  var previewPress = false;

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

  /* 화면에 쓰는 칸 이름 — 'ㄱ' · 'ㄱ 가로 모음 위' · 'ㄱ 받침'(칸 키 ㄱ@bar는 data-*·정밀 모드만) */
  function cellName(key) {
    var target = splitKey(key);
    return target.jamo + (target.context ? " " + (CONTEXT_LABELS[target.context] || target.context) : "");
  }

  /* 정밀 모드에서만 보이는 덧말(칸 키·세트 이름·조립식 이름) */
  function preciseNote(text) {
    var span = make("span", "studio-draw-precise-note", text);
    span.setAttribute("data-studio-precise", "");
    return span;
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
      sel = openingCell();
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
        sel = openingCell();
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

  /* 칸 여러 개를 편집 하나로(되돌리기 한 번) 넣는다 — 소개 페이지에서 그린 8칸을 이어 그릴 때. cells: { 칸 키: 도형들 | { shapes } }.
   * 칸마다 출처는 imported이고 그림 범위(box)는 도형에서 다시 잰다(toCells). 고칠 수 없는 키·빈 칸은 건너뛴다. */
  function importCells(cells, label) {
    if (!cells || typeof cells !== "object") {
      return Promise.resolve(refused(new Error("가져올 칸이 없습니다"), ""));
    }
    ensureDoc();
    ensureMounted();
    var next = doc;
    var keys = [];
    try {
      Object.keys(cells).forEach(function (key) {
        var cell = cells[key];
        var shapes = Array.isArray(cell) ? cell : cell && cell.shapes;
        if (!Draw.isEditableKey(key) || !Array.isArray(shapes) || !shapes.length) {
          return;
        }
        next = Draw.setCell(next, key, shapes, { origin: "imported" });
        keys.push(key);
      });
    } catch (error) {
      return Promise.resolve(refused(error, keys.length ? keys[keys.length - 1] : ""));
    }
    if (!keys.length) {
      return Promise.resolve(refused(new Error("가져올 칸이 없습니다"), ""));
    }
    return commitDoc(label || "칸 " + keys.length + "개 가져오기", next).then(function (edit) {
      if (edit && edit.ok) {
        note("칸 " + keys.length + "개(" + keys.join(" ") + ")를 가져왔습니다 — 칸을 눌러 이어서 그리세요.", "info");
      }
      return edit;
    });
  }

  /* 소개 페이지의 '작업실에서 이어 그리기'가 남긴 칸 — localStorage 한 번만 읽고 지운다(10분 안에 남긴 것만). 저장소가 막혀 있으면 없다 */
  var HANDOFF_KEY = "font-kku:studio-handoff";
  function takeHandoff() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(HANDOFF_KEY);
      window.localStorage.removeItem(HANDOFF_KEY);
    } catch (error) {
      return null;
    }
    var data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
    if (!data || data.v !== 1 || !data.cells || typeof data.cells !== "object" || !(Date.now() - Number(data.at) < 10 * 60 * 1000)) {
      return null;
    }
    return data;
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

  /* 부분 하나만 돌린다(S5-A) — deg는 시계 방향, 축은 그 부분 그림 범위의 가운데. 되돌리기 한 번 */
  function rotatePart(key, partId, deg) {
    var angle = Number(deg);
    return partEdit("부분 돌리기 " + (angle > 0 ? "+" : "") + angle + "°", key, function (current) {
      return Draw.rotatePart(current, key, partId, angle);
    });
  }

  function remember(key, result) {
    imports[key] = { key: key, warnings: result.warnings.slice(), rejected: result.rejected.slice(), refused: result.refused, count: result.shapes ? result.shapes.length : result.count };
  }

  /* AI·다른 도구의 SVG 글 → 허용 목록 도형만(sanitizeSvg, §18.1). 버린 것은 경고 목록에 */
  function importSvg(key, text) {
    var target = splitKey(key);
    if (!Draw.isEditableKey(key)) {
      return Promise.resolve({ ok: false, shapes: [], warnings: [], rejected: [], refused: { code: "bad-key", message: "고칠 수 없는 칸: " + key }, edit: null });
    }
    var result = Draw.sanitizeSvg(String(text === undefined || text === null ? "" : text));
    remember(key, result);
    select(target.jamo, target.context);
    renderWarnings();
    if (!result.ok) {
      note("⚠ SVG를 가져오지 않았습니다 — " + (result.refused ? result.refused.message : "그릴 도형이 없음"), "error");
      return Promise.resolve({ ok: false, shapes: [], warnings: result.warnings, rejected: result.rejected, refused: result.refused, edit: null });
    }
    return setCell(key, result.shapes, { origin: "imported", label: key + " SVG 가져오기" }).then(function (edit) {
      if (edit.ok) {
        note(cellName(key) + "에 도형 " + result.shapes.length + "개를 가져왔습니다" + (result.warnings.length ? " — 버린 것 " + result.warnings.length + "가지(아래 목록)" : "") + ".",
          result.warnings.length ? "warn" : "info");
      }
      return { ok: edit.ok, shapes: result.shapes, warnings: result.warnings, rejected: result.rejected, refused: null, edit: edit };
    });
  }

  // ── 여러 칸 한 번에(S5-A) ─────────────────────────────────────────────

  /* AI 답을 칸마다 나눠 미리 본다 — 아무것도 바꾸지 않는다. assign: { 덩어리 차례: 칸 | "" }(사람이 고른 칸). → bundleImport 결과 */
  function previewBundle(text, assign) {
    var source = String(text === undefined || text === null ? "" : text);
    var result = Draw.bundleImport(doc, source, { assign: assign || {}, fallback: selectedKey() });
    bundle = { text: source, assign: Object.assign({}, assign || {}), result: result, rev: docRev() };
    if (built) {
      renderBundle();
    }
    if (!result.rows.length) {
      note("⚠ 나눌 SVG가 없습니다 — " + (result.refused ? result.refused.message : "<svg>가 없음"), "error");
    }
    return clone(result);
  }

  function docRev() {
    return doc ? Draw.docRevision(doc) : "";
  }

  function closeBundle() {
    bundle = null;
    if (built) {
      renderBundle();
    }
  }

  /* 미리 본 묶음(또는 새 글)을 넣는다 — 넣을 칸이 있으면 편집 하나(기록 한 줄 'SVG n칸 가져오기'). 이름 모름·겹침·거절 덩어리는
   * 건너뛰고 알린다. 칸마다 버린 것은 그 칸의 경고 목록에 */
  function importBundle(text, options) {
    var opts = options || {};
    var current = text === undefined || text === null ? bundle : null;
    var result = current ? Draw.bundleImport(doc, current.text, { assign: current.assign, fallback: selectedKey() })
      : Draw.bundleImport(doc, String(text), { assign: opts.assign || {}, fallback: opts.fallback });
    var keys = Object.keys(result.cells);
    if (!keys.length) {
      return Promise.resolve(refused(new Error(result.refused ? result.refused.message : "넣을 칸이 없습니다 — 칸 이름을 고르세요"), ""));
    }
    result.rows.forEach(function (row) {
      if (row.key && (row.state === "new" || row.state === "overwrite")) {
        remember(row.key, row);
      }
    });
    var skipped = result.rows.filter(function (row) { return row.state !== "new" && row.state !== "overwrite"; }).length;
    var first = splitKey(keys[0]);
    return importCells(result.cells, opts.label || "SVG " + keys.length + "칸 가져오기").then(function (edit) {
      if (edit && edit.ok) {
        bundle = null;
        select(first.jamo, first.context);
        renderBundle();
        note("SVG " + keys.length + "칸(" + keys.map(cellName).join(", ") + ")을 넣었습니다" + (skipped ? " — 넣지 않은 SVG " + skipped + "개" : "") +
          ". 되돌리기 한 번이면 모두 돌아갑니다.", skipped ? "warn" : "info");
      }
      return edit;
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

  /* 미리보기 선택의 정체 — 다시 그리기는 같은 정체로 다시 고른다(font-studio.js restoreSelection) */
  function pickKey() {
    var picked = Studio.state && Studio.state.selection;
    return picked ? [picked.glyph, picked.source, picked.jamo].join("|") : "";
  }

  /* 미리보기에서 고른 자모의 그리기 칸 — 41칸에 없으면 null */
  function previewTarget(node) {
    var picked = node || (typeof Studio.selected === "function" ? Studio.selected() : null);
    var target = picked ? compatOf(picked) : null;
    return target && GRID.indexOf(target.jamo) >= 0 && Draw.contextsFor(target.jamo).length ? target : null;
  }

  /* 편집기를 처음 열 칸 — 미리보기에서 고른 자모(그 칸이 있으면), 아니면 지금 기본(첫 제안) */
  function openingCell() {
    var target = previewTarget();
    pickSeen = pickKey();
    return target ? { jamo: target.jamo, context: target.context } : { jamo: firstProposal(), context: "" };
  }

  /* 미리보기 선택을 따라간다 — 새 선택(정체가 바뀜)이거나 사람이 누른 때만(force). 같은 선택을 다시 알리는 다시 그리기는 건너뛴다 */
  function followPreview(node, force) {
    var key = pickKey();
    if (!force && key === pickSeen) {
      return false;
    }
    pickSeen = key;
    var target = previewTarget(node);
    return target ? select(target.jamo, target.context) : false;
  }

  // ── 시작 · 탭 ─────────────────────────────────────────────────────────

  function onShow(node) {
    section = section || node;
    build();
  }

  /* 깨면(탭이 보이고, 디자인 페이지이고, 디자인 본문이 펼쳐져 있을 때 — f-shell 수명, S1) 렌더 훅을 받고 따라잡는다. 잠들면 park */
  function activate(ctx) {
    life = ctx;
    build();
    ctx.onRender(scheduleRender);
    /* 미리보기를 런타임이 스스로 다시 그리면(그림 세트가 늦게 실림) 칸 상태도 다시 — 디자인 이름은 그대로라 change가 없다 */
    ctx.listen(Studio.host, "font-kku:render", scheduleRender);
    catchUp();
  }

  function deactivate() {
    life = null;
    clearTimeout(renderTimer);
    renderTimer = null;
    park();
  }

  /* 칸이 보이는가(D10) — 깨어 있을 때 */
  function shown() {
    return Boolean(life) && life.active();
  }

  /* 감춰지면 — 긋기를 취소하고, 문장 임시 이름을 돌려주고, 문장 바탕 요소를 비워 쉬게 둔다(디자인을 고칠 때마다 런타임이 다시
   * 그리지 않게) */
  function park() {
    if (gesture) {
      cancelGesture();
    }
    releaseLease();
    clearTimeout(readoutTimer);
    readoutTimer = null;
    Object.keys(sentences.rows).forEach(function (id) {
      var row = sentences.rows[id];
      if (!row.parked) {
        row.host.style.removeProperty("--fy-design");
        FontKku.render(row.host, { text: "" });
        row.parked = true;
      }
    });
  }

  /* 다시 보이면 — 그사이 미리보기에서 새로 고른 자모가 있으면 그 칸에서 열고(편집기를 여는 것), 41칸·문장을 다시 그린다 */
  function catchUp() {
    if (!shown()) {
      return;
    }
    if (doc && pickKey() !== pickSeen) {
      followPreview(null, false);
    }
    scheduleRender();
  }

  function ensureMounted() {
    if (!section) {
      section = Studio.f.mount("draw", { label: "그리기 8→24→40", modes: ["svg"], onShow: onShow, activate: activate, deactivate: deactivate });
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
    /* 늦게 싣기(font-studio-lazy.js)가 둔 입구 자리 — 이 단추로 바꾼다(자리 단추를 누른 일은 싣기가 이 단추로 넘긴다) */
    var stub = pick.querySelector('[data-studio-lazy-stub="draw"]');
    entry = make("p", "studio-draw-entry");
    entry.dataset.drawEntryRow = "";
    var button = make("button", "", "그리기 8 → 24 → 40");
    button.type = "button";
    button.dataset.drawEntry = "";
    var hint = make("small", "", "원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)부터 직접 그립니다 — 나머지는 조립식이 만들고, 그린 세트는 첫 획을 그을 때 디자인에 들어갑니다.");
    entry.appendChild(button);
    entry.appendChild(hint);
    if (stub) {
      pick.replaceChild(entry, stub);
    } else {
      pick.appendChild(entry);
    }
    button.addEventListener("click", begin);
  }

  /* 그리기 입구 — 디자인 칸의 '직접 그려 만들기'(S3에서 하나로 합침)와 주소 #draw가 같은 길: 재료를 그림 세트로 바꾸고(이미 그린
   * 세트가 있으면 그 세트) 빈 그림 문서로 그리기 탭을 연다 */
  function begin() {
    if (mode() !== "svg") {
      var own = doc && !Draw.isEmpty(doc) && typeof FontKku.jamoSets === "function" && FontKku.jamoSets().indexOf(doc.set) >= 0;
      design.setMode("svg", own ? { set: doc.set } : undefined);
    }
    return start();
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

    /* 단계 줄 — 디자인 칸의 그림 세트 진행률과 같은 부품(FontStudio.progress). 단계 칸은 [data-draw-stage]도 단다 */
    els.stepper = make("ol", "studio-draw-stepper");
    els.stepper.dataset.drawStepper = "";
    stepperRender(progress(), null);
    els.helper = make("li", "studio-progress-stage studio-draw-helper");
    els.helper.dataset.drawHelper = "";
    els.helper.appendChild(make("strong", "studio-progress-name", HELPER));
    els.helperText = make("span", "studio-progress-count");
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
    var selectHint = make("p", "studio-draw-hint",
      "고르기: 획을 눌러 고른 뒤 끌어 옮기기 · 방향키 1(Shift 5) · [ ] 돌리기 5°(Shift 15°) · Delete 지우기");
    selectHint.dataset.drawSelectHint = "";
    editor.appendChild(selectHint);

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
    var split = make("button", "", "칸마다 나눠 가져오기");
    split.type = "button";
    split.dataset.drawImportSplit = "";
    var prompt = make("button", "", "AI 요청 글 복사");
    prompt.type = "button";
    prompt.dataset.drawImportPrompt = "";
    els.promptAll = make("button", "", "남은 칸 한 번에 부탁하는 글 복사");
    els.promptAll.type = "button";
    els.promptAll.dataset.drawImportPromptAll = "";
    importActions.appendChild(apply);
    importActions.appendChild(split);
    importActions.appendChild(prompt);
    importActions.appendChild(els.promptAll);
    importBox.appendChild(importActions);
    importBox.appendChild(make("small", "studio-draw-hint",
      "선·꺾은선·다각형·사각형·원·타원·경로만 받습니다. 스크립트·이벤트 속성·글자·그림·참조·스타일·url()은 버리고 아래에 적습니다. " +
      "AI 답을 통째로 붙여도 됩니다 — SVG마다 칸 이름(자모)을 읽어 칸마다 나눠 넣습니다."));
    els.bundle = buildBundle();
    importBox.appendChild(els.bundle);
    els.warningsSummary = make("p", "studio-draw-warnings-summary");
    els.warningsSummary.dataset.drawWarningsSummary = "";
    els.warningsSummary.setAttribute("data-studio-easy", "");
    els.warningsSummary.hidden = true;
    importBox.appendChild(els.warningsSummary);
    els.warnings = make("ul", "studio-draw-warnings");
    els.warnings.dataset.drawWarnings = "";
    els.warnings.setAttribute("data-studio-precise", "");
    els.warnings.hidden = true;
    importBox.appendChild(els.warnings);
    els.importBox = importBox;
    editor.appendChild(importBox);
    return editor;
  }

  /* 여러 칸 가져오기 미리 보기 — 덩어리마다 칸 이름(고칠 수 있음)·상태·도형 수·버린 것, 그리고 넣기·취소 */
  function buildBundle() {
    var box = make("div", "studio-draw-bundle");
    box.dataset.drawBundle = "";
    box.hidden = true;
    els.bundleSummary = make("p", "studio-draw-bundle-summary");
    els.bundleSummary.dataset.drawBundleSummary = "";
    els.bundleSummary.setAttribute("role", "status");
    box.appendChild(els.bundleSummary);
    els.bundleRows = make("ol", "studio-draw-bundle-rows");
    els.bundleRows.dataset.drawBundleRows = "";
    box.appendChild(els.bundleRows);
    var actions = make("div", "studio-draw-actions");
    els.bundleApply = make("button", "studio-draw-bundle-apply", "넣기");
    els.bundleApply.type = "button";
    els.bundleApply.dataset.drawBundleApply = "";
    var cancel = make("button", "", "취소");
    cancel.type = "button";
    cancel.dataset.drawBundleCancel = "";
    actions.appendChild(els.bundleApply);
    actions.appendChild(cancel);
    box.appendChild(actions);
    return box;
  }

  var BUNDLE_STATE = {
    "new": "새 칸", overwrite: "그린 칸을 바꿈", unknown: "칸 이름을 읽지 못함 — 칸을 고르세요", duplicate: "앞과 같은 칸 — 넣지 않음",
    skipped: "넣지 않음", refused: "가져오지 않음"
  };

  /* 칸 고르기 목록 — 그리기 41칸 × 그 자모의 문맥 칸, 맨 앞은 '넣지 않음' */
  var cellOptions = null;
  function bundleSelect(row) {
    if (!cellOptions) {
      cellOptions = [];
      GRID.forEach(function (jamo) {
        Draw.contextsFor(jamo).forEach(function (context) {
          cellOptions.push(keyOf(jamo, context));
        });
      });
    }
    var select = document.createElement("select");
    select.className = "studio-draw-bundle-key";
    select.dataset.drawBundleKey = String(row.index);
    select.setAttribute("aria-label", (row.index + 1) + "번째 SVG를 넣을 칸");
    var none = document.createElement("option");
    none.value = "";
    none.textContent = row.key || row.state === "skipped" ? "넣지 않음" : "칸 고르기…";
    select.appendChild(none);
    cellOptions.forEach(function (key) {
      var option = document.createElement("option");
      option.value = key;
      option.textContent = cellName(key);
      select.appendChild(option);
    });
    select.value = row.key || "";
    return select;
  }

  function renderBundle() {
    var box = els.bundle;
    if (!box) {
      return;
    }
    els.bundleRows.textContent = "";
    if (!bundle || !bundle.result.rows.length) {
      box.hidden = true;
      return;
    }
    var result = bundle.result;
    var counts = { "new": 0, overwrite: 0, other: 0 };
    result.rows.forEach(function (row) {
      if (row.state === "new" || row.state === "overwrite") {
        counts[row.state] += 1;
      } else {
        counts.other += 1;
      }
      var item = make("li", "studio-draw-bundle-row");
      item.dataset.drawBundleRow = String(row.index);
      item.dataset.key = row.key || "";
      item.dataset.state = row.state;
      item.dataset.shapes = String(row.shapes);
      var head = make("div", "studio-draw-bundle-head");
      head.appendChild(make("span", "studio-draw-bundle-index", (row.index + 1) + "."));
      if (row.state === "refused") {
        head.appendChild(make("strong", "studio-draw-bundle-name", row.key ? cellName(row.key) : "이름 모름"));
      } else {
        head.appendChild(bundleSelect(row));
      }
      var state = make("span", "studio-draw-bundle-state", BUNDLE_STATE[row.state] +
        (row.refused ? " — " + row.refused.message : "") + (row.state !== "refused" ? " · 도형 " + row.shapes + "개" : ""));
      head.appendChild(state);
      item.appendChild(head);
      var notes = [];
      if (row.note) {
        notes.push(row.note);
      }
      if (row.warnings.length) {
        notes.push("버린 것 " + row.warnings.length + "가지");
      }
      if (notes.length) {
        item.appendChild(make("small", "studio-draw-bundle-note", notes.join(" · ")));
      }
      if (row.warnings.length) {
        var list = make("ul", "studio-draw-warnings");
        list.setAttribute("data-studio-precise", "");
        row.warnings.forEach(function (text) {
          list.appendChild(make("li", "", text));
        });
        item.appendChild(list);
      }
      els.bundleRows.appendChild(item);
    });
    var take = counts["new"] + counts.overwrite;
    els.bundleSummary.textContent = "SVG " + result.rows.length + "개 — 넣을 칸 " + take + "개" +
      (take ? "(새 칸 " + counts["new"] + " · 바꿀 칸 " + counts.overwrite + ")" : "") +
      (counts.other ? " · 넣지 않을 것 " + counts.other + "개" : "") + ". 넣으면 되돌리기 한 번으로 모두 돌아갑니다.";
    els.bundleApply.textContent = take ? take + "칸 넣기" : "넣을 칸이 없음";
    els.bundleApply.disabled = !take;
    box.dataset.take = String(take);
    box.hidden = false;
    els.importBox.open = true;
  }

  var sentenceChrome = null;

  function buildSentences() {
    var box = make("div", "studio-draw-sentences");
    box.dataset.drawSentences = "";
    box.appendChild(make("h4", "studio-draw-subtitle", "문장 미리보기 — 미리보기 문장"));
    /* 보기 고르기(S5-A) — 원형 8만 그린 셈(기본) | 다 그린 칸만(다 그린 칸으로 지을 수 있는 글자만) */
    var views = make("div", "studio-draw-sentence-views");
    views.dataset.drawSentenceView = "";
    views.setAttribute("role", "radiogroup");
    views.setAttribute("aria-label", "문장 미리보기 보기");
    [{ id: "origin8", label: "원형 8만 그린 셈" }, { id: "drawn", label: "다 그린 칸만" }].forEach(function (item) {
      var label = make("label", "studio-draw-sentence-view");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "draw-sentence-view";
      input.value = item.id;
      input.checked = item.id === sentenceView;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + item.label));
      views.appendChild(label);
    });
    box.appendChild(views);
    if (!sentenceChrome && typeof CSSStyleSheet === "function") {
      sentenceChrome = new CSSStyleSheet();
      sentenceChrome.replaceSync(":host { display: block; }\nfont-kku { display: block; }");
    }
    els.sentenceBox = box;
    sentenceRow("origin8");
    if (sentenceView !== "origin8") {
      sentenceRow(sentenceView); // 그리기 칸을 만들기 전에 보기를 골랐으면
    }
    return box;
  }

  var SENTENCE_LABELS = { origin8: "원형 8만", drawn: "다 그린 칸만" };

  /* 문장 줄 하나(그림자 뿌리 + 바탕 요소) — 원형 8 줄은 처음부터, 다 그린 칸만 줄은 그 보기를 처음 고를 때 만든다(그림자 뿌리를
   * 쓰지 않는 보기 몫까지 늘리지 않는다 — S3 ⚑5) */
  function sentenceRow(id) {
    if (sentences.rows[id]) {
      return sentences.rows[id];
    }
    var line = make("div", "studio-draw-sentence-row");
    line.dataset.drawSentenceRow = id;
    line.hidden = id !== sentenceView;
    var label = make("span", "studio-draw-sentence-label", SENTENCE_LABELS[id]);
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
    host.setAttribute("data-draw-sentence", id);
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
    els.sentenceBox.appendChild(line);
    sentences.rows[id] = { line: line, host: host, output: output, parked: true }; // 처음 그릴 때까지 쉰다
    return sentences.rows[id];
  }

  // ── 그리기 ────────────────────────────────────────────────────────────

  function render() {
    renderTimer = null;
    syncEntry();
    if (!built || !shown()) {
      return;
    }
    life.work();
    var table = statuses();
    renderStepper();
    renderProposals(table);
    renderGrid(table);
    renderEditor(table);
    if (bundle && bundle.rev !== docRev()) {
      /* 미리 보는 동안 칸이 바뀌면(획·되돌리기) 새 칸·바꿀 칸을 다시 센다 — 문서가 그대로면 줄을 다시 만들지 않는다(고르는 중인 칸 목록) */
      bundle.result = Draw.bundleImport(doc, bundle.text, { assign: bundle.assign, fallback: selectedKey() });
      bundle.rev = docRev();
      renderBundle();
    }
    renderSentences();
  }

  function scheduleRender() {
    if (!built || !shown()) {
      syncEntry(); // 감춰진 동안은 그리지 않는다 — 깨면 catchUp이 다시 부른다
      return;
    }
    if (!renderTimer) {
      renderTimer = setTimeout(render, 0);
    }
  }

  function stepperRender(state, target) {
    if (Studio.progress) {
      Studio.progress.render(els.stepper, state, { target: target, stageAttribute: "drawStage" });
    }
  }

  function renderStepper() {
    var state = progress();
    var json = design.state.json;
    var target = usesDoc() && json.editor ? json.editor.authoringTarget : null;
    stepperRender(state, target);
    els.helper.dataset.drawn = String(state.helper.drawn);
    els.helperText.textContent = state.helper.drawn ? "보조 원본 그림" : "보조 원본(천지인 점) — 그리지 않음";
    var set = doc ? doc.set : "";
    els.set.textContent = "";
    if (doc) {
      /* 세트 이름(studio-draw-…)은 정밀 모드에서만 — 쉬운 모드 화면 말에 개발 식별자를 싣지 않는다 */
      els.set.appendChild(document.createTextNode("그림 세트"));
      els.set.appendChild(preciseNote(" " + set));
      els.set.appendChild(document.createTextNode(usesDoc() ? " — 디자인에 들어감" : Draw.isEmpty(doc) ? " — 첫 획을 그으면 디자인에 들어갑니다" : " — 지금 디자인은 다른 세트"));
    }
    els.set.dataset.drawSet = set;
    els.set.dataset.inDesign = String(usesDoc());
    renderPromptAll(state);
  }

  /* '남은 n칸 한 번에 부탁하는 글 복사' — 지금 단계의 남은 칸 수. 다 그렸으면 감춘다 */
  function renderPromptAll(state) {
    var keys = Draw.promptTargets(state || progress());
    els.promptAll.hidden = !keys.length;
    els.promptAll.textContent = "남은 " + keys.length + "칸 한 번에 부탁하는 글 복사";
    els.promptAll.dataset.count = String(keys.length);
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
    els.key.textContent = key ? cellName(key) : "-";
    els.key.dataset.drawKey = key || "";
    els.keyStatus.textContent = state ? STATUS_TEXT[state.status] || state.status : "";
    if (state && state.recipe) {
      els.keyStatus.appendChild(preciseNote(" · " + state.recipe)); // 조립식 이름은 정밀 모드에서만
    }
    els.keyStatus.dataset.status = state ? state.status : "";
    els.contexts.textContent = "";
    (jamo ? Draw.contextsFor(jamo) : []).forEach(function (context) {
      var button = make("button", "studio-draw-context", CONTEXT_LABELS[context] || context);
      if (context) {
        button.appendChild(preciseNote("(" + context + ")"));
      }
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
      /* 부분 회전(S5-A) — 그 획의 가운데를 축으로 15° */
      [["↺", "-15", "왼쪽으로"], ["↻", "15", "오른쪽으로"]].forEach(function (triple) {
        var turn = make("button", "studio-draw-part-tool", triple[0]);
        turn.type = "button";
        turn.dataset.drawPartRotate = triple[1];
        turn.setAttribute("aria-label", part.label + " " + triple[2] + " 15° 돌리기");
        turn.title = triple[2] + " 15° 돌리기";
        item.appendChild(turn);
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
    var key = selectedKey();
    var show = key && imports[key] ? imports[key] : null;
    (show ? show.warnings : []).forEach(function (text) {
      els.warnings.appendChild(make("li", "", text));
    });
    if (show && show.refused) {
      var refusedItem = make("li", "", "가져오지 않음 — " + show.refused.message);
      refusedItem.dataset.refused = show.refused.code;
      els.warnings.appendChild(refusedItem);
    }
    els.warnings.hidden = els.warnings.children.length === 0;
    /* 쉬운 모드는 버린 것의 수만(도형 검사 원문은 정밀 모드) */
    var dropped = show ? show.warnings.length : 0;
    els.warningsSummary.textContent = show && show.refused ? "가져오지 않음 — " + show.refused.message
      : dropped ? "가져올 때 버린 것 " + dropped + "가지 — 정밀 모드에서 자세히 봅니다." : "";
    els.warningsSummary.hidden = !els.warningsSummary.textContent;
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

  /* 다 그린 칸만 — 자모 요청 하나가 그린 칸만으로 지어지는가(planJamo, 지금 디자인). 디자인 판·문서 판이 같으면 셈을 다시 쓴다 */
  function canDrawFor() {
    var json = design.state.json || {};
    var key = [design.name(), design.state.revision, doc ? Draw.docRevision(doc) : ""].join("|");
    if (drawnMemo.key !== key) {
      drawnMemo = { key: key, table: {} };
    }
    var fromDoc = function (id) {
      var source = json.sources ? json.sources[id] : null;
      return Boolean(doc && source && source.kind === "svg" && source.assetSet === doc.set);
    };
    return function (request) {
      var id = [request.jamo, request.role, request.context, request.hasFinal].join(":");
      if (drawnMemo.table[id] === undefined) {
        var ok = false;
        try {
          ok = usesDoc() && Draw.planUsesDrawnOnly(FontKku.planJamo(request.jamo, { design: design.name(), role: request.role,
            context: request.context, hasFinal: request.hasFinal }), fromDoc);
        } catch (error) {
          ok = false;
        }
        drawnMemo.table[id] = ok;
      }
      return drawnMemo.table[id];
    };
  }

  function drawnText() {
    return Draw.drawnOnlyText(previewText(), canDrawFor());
  }

  function parkRow(row) {
    if (!row.parked) {
      row.host.style.removeProperty("--fy-design");
      FontKku.render(row.host, { text: "" });
      row.parked = true;
    }
  }

  function renderSentences() {
    var fontId = Studio.state.fontId;
    if (!fontId || !Studio.doc()) {
      return;
    }
    Object.keys(sentences.rows).forEach(function (id) {
      var row = sentences.rows[id];
      row.line.hidden = id !== sentenceView;
      if (id !== sentenceView) {
        parkRow(row); // 고르지 않은 보기는 쉰다 — 디자인을 고칠 때마다 다시 그리지 않게
        return;
      }
      var name = id === "origin8" ? leaseName() : usesDoc() ? design.name() : null;
      var text = previewText();
      if (id === "drawn") {
        row.drawn = drawnText();
        text = row.drawn.text;
      }
      row.parked = false;
      row.host.setAttribute("font", fontId);
      if (name) {
        row.host.style.setProperty("--fy-design", name);
      } else {
        row.host.style.removeProperty("--fy-design");
      }
      FontKku.render(row.host, { text: text });
      FontKku.refreshAll(row.host);
    });
    if (sentenceView !== "origin8") {
      releaseLease();
    }
    readSentences();
  }

  /* 문장 미리보기 보기 — origin8 | drawn. 이름 없이 부르면 지금 보기 */
  function setSentenceView(name) {
    if (name === undefined) {
      return sentenceView;
    }
    if (name !== "origin8" && name !== "drawn") {
      throw new TypeError("font-studio: draw.sentenceView(" + JSON.stringify(name) + ") — views are origin8 and drawn");
    }
    sentenceView = name;
    if (built) {
      sentenceRow(name);
      var radio = section.querySelector('input[name="draw-sentence-view"][value="' + name + '"]');
      if (radio) {
        radio.checked = true;
      }
      Object.keys(sentences.rows).forEach(function (id) {
        sentences.rows[id].line.hidden = id !== sentenceView;
      });
    }
    scheduleRender();
    return sentenceView;
  }

  var readoutTimer = null;

  function scheduleReadout() {
    if (!readoutTimer && shown()) {
      readoutTimer = setTimeout(readSentences, 0);
    }
  }

  function readSentences() {
    clearTimeout(readoutTimer);
    readoutTimer = null;
    Object.keys(sentences.rows).forEach(function (id) {
      var row = sentences.rows[id];
      if (row.parked) {
        return;
      }
      var counts = countRequests(row.host);
      var drawnName = row.host.dataset.fyDesign || "";
      Object.keys(counts).forEach(function (key) {
        row.line.dataset[key] = String(counts[key]);
      });
      row.line.dataset.design = drawnName;
      if (id === "drawn") {
        var only = row.drawn || { text: "", total: 0, kept: 0, dropped: [] };
        row.line.dataset.kept = String(only.kept);
        row.line.dataset.total = String(only.total);
        row.line.dataset.dropped = only.dropped.join("");
        var missing = only.dropped.length ? " · 아직 못 짓는 글자 " + only.dropped.slice(0, 8).join(" ") + (only.dropped.length > 8 ? " …" : "") : "";
        row.output.textContent = !usesDoc() ? "지금 디자인은 그린 세트를 쓰지 않습니다 — 첫 획을 그으면 디자인에 들어갑니다."
          : !only.total ? "미리보기 문장에 한글이 없습니다."
          : !only.kept ? "다 그린 칸으로 지을 수 있는 글자가 아직 없습니다" + missing + "."
          : "다 그린 칸으로 " + only.total + "자 중 " + only.kept + "자" + missing + ".";
        return;
      }
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
      /* [ ] 돌리기 5°(Shift 15°) — 작업실 고치기의 [ ] 회전 키와 같은 손(Shift를 누르면 { }가 온다) */
      var turn = { "[": -1, "{": -1, "]": 1, "}": 1 }[event.key];
      if (delta) {
        movePart(selectedKey(), selectedPart, delta[0], delta[1]);
        event.preventDefault();
      } else if (turn && !event.metaKey && !event.ctrlKey && !event.altKey) {
        rotatePart(selectedKey(), selectedPart, turn * (event.shiftKey ? 15 : 5));
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

  /* 한 번에 부탁하는 글(S5-A) — 지금 단계의 남은 칸(원형 8이면 ㆍ도). 답의 꼴은 '칸마다 나눠 가져오기'가 읽는 꼴. 남은 칸이 없으면 null */
  function bundleAiPrompt() {
    var keys = Draw.promptTargets(progress());
    if (!keys.length) {
      return null;
    }
    return { keys: keys, text: Draw.bundlePrompt(keys, { stroke: doc && doc.options ? doc.options.stroke : undefined }) };
  }

  function copyPrompt(text, done) {
    Studio.copyText(text).then(function (copied) {
      note(copied ? done : "브라우저가 클립보드 쓰기를 막았습니다.", copied ? "info" : "warn");
    });
  }

  /* '이 칸에 가져오기' — SVG가 둘 넘게 든 글이면 칸마다 나눠 미리 본다(한 칸에 모두 합치지 않는다) */
  function applyImport() {
    var text = els.importText.value;
    var split = Draw.splitSvgBundle(text);
    if (split.ok && split.blocks.length > 1) {
      previewBundle(text);
      note("SVG가 " + split.blocks.length + "개라 칸마다 나눠 보입니다 — 칸을 확인하고 넣으세요.", "info");
      return null;
    }
    return importSvg(selectedKey(), text);
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
      } else if (row && target.closest("[data-draw-part-rotate]")) {
        var degrees = Number(target.closest("[data-draw-part-rotate]").dataset.drawPartRotate);
        selectedPart = row.dataset.partId;
        rotatePart(selectedKey(), row.dataset.partId, degrees);
      } else if (target.closest("[data-draw-part-remove]")) {
        removePart(selectedKey(), target.closest("[data-draw-part-remove]").dataset.drawPartRemove);
      } else if (target.closest("[data-draw-clear]")) {
        removeCell(selectedKey());
      } else if (target.closest("[data-draw-import-apply]")) {
        applyImport();
      } else if (target.closest("[data-draw-import-split]")) {
        previewBundle(els.importText.value);
      } else if (target.closest("[data-draw-bundle-apply]")) {
        importBundle();
      } else if (target.closest("[data-draw-bundle-cancel]")) {
        closeBundle();
        note("여러 칸 가져오기를 취소했습니다.");
      } else if (target.closest("[data-draw-import-prompt-all]")) {
        var all = bundleAiPrompt();
        if (all) {
          copyPrompt(all.text, "남은 " + all.keys.length + "칸(" + all.keys.map(cellName).join(" ") + ")을 한 번에 그려 달라는 글을 복사했습니다 — " +
            "AI의 답을 통째로 위 칸에 붙이고 '칸마다 나눠 가져오기'를 누르세요.");
        }
      } else if (target.closest("[data-draw-import-prompt]")) {
        copyPrompt(aiPrompt(selectedKey()), cellName(selectedKey()) + " 칸을 그려 달라는 요청 글을 복사했습니다 — AI의 답(SVG)을 위 칸에 붙이세요.");
      }
    });
    section.addEventListener("change", function (event) {
      if (event.target.matches('input[name="draw-tool"]')) {
        if (gesture) {
          cancelGesture();
        }
        tool = event.target.value;
        els.canvas.dataset.tool = tool;
      } else if (event.target.matches('input[name="draw-sentence-view"]')) {
        setSentenceView(event.target.value);
      } else if (event.target.matches("[data-draw-bundle-key]") && bundle) {
        var assign = Object.assign({}, bundle.assign);
        assign[event.target.dataset.drawBundleKey] = event.target.value;
        previewBundle(bundle.text, assign);
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


  /* 프로젝트·초안 열기 — 디자인 패널(먼저 붙은 load 훅)이 디자인을 연 같은 차례 안에서 참가자를 붙여 그림 세트를 등록한다.
   * 이미 붙어 있으면 디자인 패널이 디자인보다 먼저 넣었다 */
  Studio.on("load", function (options) {
    if (!attached && savedDrawing(options)) {
      attach();
    }
  });

  /* 미리보기 선택 — 칸이 보일 때 새로 고른 자모(또는 사람이 누른 자모)만 따라간다. 획을 그어 미리보기를 다시 그리면 같은 선택이
   * 다시 오지만 칸을 바꾸지 않는다(D7) */
  Studio.on("select", function (node) {
    var press = previewPress;
    previewPress = false;
    if (!node || !shown()) {
      return;
    }
    followPreview(node, press);
  });
  /* 사람이 미리보기를 누르는 중 — 작업실이 고르기 전에(잡기 단계) 표시하고, 그 차례가 끝나면 지운다 */
  if (previewBox) {
    ["pointerdown", "pointerup"].forEach(function (type) {
      previewBox.addEventListener(type, function (event) {
        if (event.button) {
          return;
        }
        previewPress = true;
        setTimeout(function () { previewPress = false; }, 0);
      }, true);
    });
  }

  /* 페이지가 바뀌거나 디자인 본문을 접고 펴면 — f-shell 수명이 잠재우고(park) 깨운다(catchUp) */

  function busy() {
    return Boolean(renderTimer) || Boolean(readoutTimer) || pendingEdits > 0 || (built && shown() && pendingLinks > 0);
  }

  design.addBusy(busy);
  buildEntry();
  syncEntry();
  /* 이 스크립트보다 먼저 연 초안·프로젝트에 그림이 있었으면 지금 붙어 따라잡는다 */
  if (savedDrawing(Studio.lastLoadOptions())) {
    attach();
  }

  /* 주소 #draw(소개 페이지의 '8칸 그려서 내 글꼴 만들기')로 들어오면 디자인 칸의 '그리기 8 → 24 → 40' 단추와 같은 길로
   * 그리기 탭을 바로 연다 — 재료를 그림 세트로 바꾸고 빈 그림 문서를 원형 8 단계로 연 뒤 그 탭으로 내려간다. 이미 그린
   * 문서(초안·프로젝트)가 있으면 그 문서 그대로 연다. 소개에서 그리던 칸을 넘겼으면(takeHandoff) 그 칸을 가져온다. */
  if (location.hash === "#draw" && entry) {
    var entryButton = entry.querySelector("[data-draw-entry]");
    if (entryButton) {
      entryButton.click();
      /* 소개에서 그리던 칸을 가져온다 — 지금 문서(초안 포함)에 칸을 덮어 쓰는 편집 하나라 되돌릴 수 있다 */
      var handoff = takeHandoff();
      if (handoff) {
        importCells(handoff.cells, "소개 페이지에서 그린 칸 가져오기");
      }
      requestAnimationFrame(function () {
        if (section) {
          /* 붙어 있는 머리말 밑으로 숨지 않게 그 높이만큼 덜 내려간다 */
          var header = document.querySelector("header");
          var offset = header && getComputedStyle(header).position === "sticky" ? header.getBoundingClientRect().height + 8 : 0;
          window.scrollTo(0, Math.max(0, section.getBoundingClientRect().top + window.scrollY - offset));
        }
      });
    }
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
    /* 그리기 입구('직접 그려 만들기'·#draw) — 재료를 그림 세트로 바꾸고 start() */
    begin: begin,
    open: open,
    /* 그림 문서 참가자 'drawings'를 붙인다(문서·탭은 만들지 않는다) — design.edit에 participants.drawings를 넘기기 전에(묶음 열기 등) */
    attach: attach,
    doc: function () { return doc ? clone(doc) : null; },
    /* 칸 하나(도형 목록 · 부분 목록 · { parts, provenance }) → Promise<편집 결과>. options: { label(기록 이름), origin, from, partLabel, group } */
    setCell: setCell,
    removeCell: removeCell,
    importSvg: importSvg,
    /* 칸 여러 개 { 키: 도형들 | { shapes } } → 편집 하나 */
    importCells: importCells,
    /* AI 답(글 + <svg> 여럿) → 미리 보기(바꾸지 않음) · 넣기(넣을 칸이 있으면 편집 하나, 글을 주지 않으면 미리 본 묶음). S5-A */
    previewBundle: previewBundle,
    importBundle: importBundle,
    bundle: function () { return bundle ? clone(bundle.result) : null; },
    select: select,
    selection: function () { return { jamo: sel.jamo, context: sel.context, key: selectedKey(), part: selectedPart }; },
    movePart: movePart,
    scalePart: scalePart,
    /* 부분 하나 돌리기(시계 방향 도) — 그 부분의 가운데가 축. S5-A */
    rotatePart: rotatePart,
    removePart: removePart,
    progress: progress,
    proposals: function () { return proposals(); },
    /* { 자모: { status: authored|detached|imported|direct|composed|strokes|primitive|none, recipe, drawn, trace, diagnostic } } */
    statuses: statuses,
    statusOf: statusOf,
    /* 문장 미리보기 바탕 요소 { current, origin8, drawn } — 아직 칸을 만들지 않았으면 null */
    sentence: function () {
      return built ? { current: null, origin8: sentences.rows.origin8.host, drawn: sentences.rows.drawn ? sentences.rows.drawn.host : null } : null;
    },
    /* 문장 미리보기 보기 origin8(기본) | drawn(다 그린 칸만) — 이름 없이 부르면 지금 보기. S5-A */
    sentenceView: setSentenceView,
    /* 다 그린 칸만 보기의 글 { text, total, kept, dropped } — 지금 미리보기 문장으로 */
    drawnText: drawnText,
    /* AI 요청 글 — 칸 하나(key) 또는 지금 단계의 남은 칸 모두({ all: true } → { keys, text } | null) */
    aiPrompt: function (target) {
      return target && target.all ? bundleAiPrompt() : aiPrompt(target || selectedKey());
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
