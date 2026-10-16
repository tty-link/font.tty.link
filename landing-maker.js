/* 소개의 '8칸 만들기' — 히어로 데모와, 그 세트를 따라 그리는 '하나 · 직접 만드는 한글 글꼴'·'다섯 · 내 페이지에 쓰기'.
 *
 * 세트는 src/landing-ai-sets.js가 AI 답 HTML 그대로 등록한 칸 계약 그림 세트(frame: "box")다. 히어로에서 세트를 고르거나
 * 칸을 직접 그으면(직접 그리기 = 고른 세트를 복사한 'landing-draw' 세트를 registerJamo로 다시 등록) [data-follow-set]
 * 바탕 요소(히어로 제목 둘째 줄 포함)가 모두 그 세트로 다시 그려진다.
 *
 * 그린 칸은 이 브라우저(localStorage 'font-kku:landing-draft')에 남아 다시 와서 '✎ 이어 그리기'로 연다. 작업실로 넘길 때는
 * 'font-kku:studio-handoff'에 칸을 남기고 font-studio.html#draw로 간다 — 작업실이 한 번 읽고 지운다(font-studio-draw.js).
 * 저장소가 막힌 브라우저(사생활 보호 창 등)에서는 남기지 않을 뿐 데모는 그대로 돈다.
 *
 * 숫자는 모두 이 브라우저가 센 값이다:
 * - 칸 하나가 들어가는 글자 수 — 자모마다 FontKku.planJamo로 조립 계획을 세워, 그 칸의 그림(drawing)이나 그 칸이 대신 긋는
 *   획(alias)이 든 자모를 고르고 11,172자(초성 19 × 중성 21 × 받침 28)에서 센다.
 * - 11,172자 모두 그려 보기 — 가부터 힣까지 588자씩 실제로 그려 FontKku.traceOf로 자모 노드마다 출처를 본다.
 * 움직임 줄이기를 켜면 처음의 획순 그리기와 조립 움직임을 건너뛴다. */
(function () {
  "use strict";

  var FK = window.FontKku;
  var S = window.FontKkuLandingSets;
  var site = window.FontKkuSite;
  var maker = document.querySelector("[data-maker]");
  if (!FK || !S || !maker || typeof FK.registerJamo !== "function") return;

  var ORDER = ["ㄱ", "ㄴ", "ㅁ", "ㅅ", "ㅇ", "ㆍ", "ㅡ", "ㅣ"];
  var VOWEL_CELLS = { "ㆍ": true, "ㅡ": true, "ㅣ": true };
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
  var JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
  var JONG = [""].concat("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split(""));
  var BAR_VOWELS = "ㅗㅛㅜㅠㅡ";
  var DRAW_SET = "landing-draw";
  var DRAFT_KEY = "font-kku:landing-draft";
  var HANDOFF_KEY = "font-kku:studio-handoff";
  var DEFAULT_TEXT = "다람쥐 헌 쳇바퀴에 타고파";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
  function num(n) { return Number(n).toLocaleString("ko-KR"); }
  function particle(jamo) { return VOWEL_CELLS[jamo] ? "를" : "을"; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; });
  }

  /* 브라우저 저장소 — 막혀 있거나(사생활 보호 창) 깨진 값이면 없는 셈 친다 */
  function storeRead(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }
  function storeWrite(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  // ── 세트 ───────────────────────────────────────────────────
  var answers = {};
  S.sets.forEach(function (set) { answers[set.id] = S.read(set); });

  var state = {
    source: S.sets[0].id,      // 고른 AI 세트(직접 그리기는 이 세트를 복사해 시작한다)
    mode: "set",               // set | draw
    width: answers[S.sets[0].id].width || "0.13em",
    cap: "round",
    vary: false,
    draw: null,                // 직접 그리기 칸: { ㄱ: { box, shapes, touched } }
    selected: null,            // 그리는 칸
    edited: []                 // 직접 고친 칸
  };

  function currentSet() { return state.mode === "draw" ? DRAW_SET : state.source; }

  function currentCells() {
    if (state.mode === "draw") {
      var out = {};
      ORDER.forEach(function (key) {
        var cell = state.draw[key];
        if (cell && cell.shapes.length) out[key] = { box: cell.box.slice(), shapes: cell.shapes.slice() };
      });
      return out;
    }
    return answers[state.source].cells;
  }

  function registerOptions() {
    return state.cap === "butt" ? { frame: "box", cap: "butt", join: "miter" } : { frame: "box", cap: "round", join: "round" };
  }

  function registerDraw() {
    var cells = currentCells();
    if (!Object.keys(cells).length) return false;
    FK.registerJamo(DRAW_SET, cells, { frame: "box", cap: "round", join: "round" });
    depCache[DRAW_SET] = null;
    return true;
  }

  // ── 칸이 들어가는 글자 수(조립 계획으로 센다) ─────────────────
  var depCache = {};
  function cellsOf(jamo, setName, role, context) {
    var plan = FK.planJamo(jamo, { set: setName, role: role, context: context });
    var used = {};
    plan.items.forEach(function (item) {
      if (item.drawing) used[item.drawing] = (used[item.drawing] || 0) + 1;
      if (item.alias) used[item.alias] = (used[item.alias] || 0) + 1;
    });
    return used;
  }

  /* 자모마다 쓰는 칸 — 초성은 문맥(세로 모음 옆 cho, 가로 모음 위 bar)마다 */
  function deps(setName) {
    if (depCache[setName]) return depCache[setName];
    var d = {
      cho: CHO.map(function (j) { return { cho: cellsOf(j, setName, "initial", "cho"), bar: cellsOf(j, setName, "initial", "bar") }; }),
      jung: JUNG.map(function (j) { return cellsOf(j, setName, "medial"); }),
      jong: JONG.map(function (j) { return j ? cellsOf(j, setName, "final", "jong") : {}; })
    };
    depCache[setName] = d;
    return d;
  }

  function syllableUses(d, l, v, t, key) {
    var cho = BAR_VOWELS.indexOf(JUNG[v]) >= 0 ? d.cho[l].bar : d.cho[l].cho;
    return Boolean(cho[key] || d.jung[v][key] || d.jong[t][key]);
  }

  var countCache = {};
  function affected(setName, key) {
    var cacheKey = setName + "|" + key;
    if (setName !== DRAW_SET && countCache[cacheKey]) return countCache[cacheKey];
    var d = deps(setName);
    var n = 0;
    for (var l = 0; l < 19; l += 1) {
      for (var v = 0; v < 21; v += 1) {
        for (var t = 0; t < 28; t += 1) {
          if (syllableUses(d, l, v, t, key)) n += 1;
        }
      }
    }
    if (setName !== DRAW_SET) countCache[cacheKey] = n;
    return n;
  }

  function textAffected(setName, key, text) {
    var d = deps(setName);
    var n = 0;
    Array.from(text).forEach(function (ch) {
      var code = ch.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return;
      if (syllableUses(d, Math.floor(code / 588), Math.floor(code / 28) % 21, code % 28, key)) n += 1;
    });
    return n;
  }

  function hangulCount(text) {
    return Array.from(text).filter(function (ch) { return ch >= "가" && ch <= "힣"; }).length;
  }

  // ── 칸 그림 ─────────────────────────────────────────────────
  function shapeNode(shape) {
    var item = typeof shape === "string" ? { d: shape } : shape;
    var node;
    if (item.ellipse) {
      node = document.createElementNS(SVG_NS, "ellipse");
      node.setAttribute("cx", item.ellipse[0]);
      node.setAttribute("cy", item.ellipse[1]);
      node.setAttribute("rx", item.ellipse[2]);
      node.setAttribute("ry", item.ellipse[3]);
    } else {
      node = document.createElementNS(SVG_NS, "path");
      node.setAttribute("d", item.d);
    }
    if (item.fill) node.setAttribute("data-fill", "");
    node.setAttribute("pathLength", "1");
    return node;
  }

  /* 칸 하나 — 그림 범위(box)를 칸에 꽉 차게. 획 굵기는 펜 굵기를 칸 크기에 맞춰 */
  function cellSvg(cell) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    if (!cell) {
      svg.setAttribute("viewBox", "0 0 100 100");
      return svg;
    }
    var box = cell.box || [0, 0, 100, 100];
    var w = Math.max(box[2] - box[0], 1);
    var h = Math.max(box[3] - box[1], 1);
    var side = Math.max(w, h, 40);
    var cx = (box[0] + box[2]) / 2;
    var cy = (box[1] + box[3]) / 2;
    svg.setAttribute("viewBox", [cx - side / 2, cy - side / 2, side, side].map(function (n) { return Math.round(n * 10) / 10; }).join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var stroke = parseFloat(state.width) * 70 * side / 100;
    (cell.shapes || []).forEach(function (shape) {
      var node = shapeNode(shape);
      node.setAttribute("stroke-width", String(Math.max(2.5, Math.round(stroke * 10) / 10)));
      svg.appendChild(node);
    });
    return svg;
  }

  var cellsMount = $("[data-maker-cells]", maker);
  /* 칸 단추를 새로 만든다 — 그 안에 있던 키보드 포커스는 같은 칸의 새 단추로 옮긴다(body로 떨어지지 않게) */
  function renderCells() {
    var cells = state.mode === "draw" ? state.draw : answers[state.source].cells;
    var active = document.activeElement;
    var keep = active && cellsMount.contains(active) ? active.getAttribute("data-maker-cell") : null;
    cellsMount.innerHTML = "";
    ORDER.forEach(function (key) {
      var cell = cells[key];
      var li = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "k-maker-cell";
      button.setAttribute("data-maker-cell", key);
      button.setAttribute("aria-pressed", String(state.mode === "draw" && state.selected === key));
      button.setAttribute("aria-label", key + " 칸 — 눌러서 직접 그리기");
      var empty = !cell || !cell.shapes || !cell.shapes.length;
      button.setAttribute("data-empty", String(empty));
      button.appendChild(cellSvg(empty ? null : cell));
      var label = document.createElement("b");
      label.textContent = key;
      button.appendChild(label);
      li.appendChild(button);
      cellsMount.appendChild(li);
      if (keep === key) button.focus({ preventScroll: true });
    });
  }

  // ── 따라 그리는 바탕 요소 ─────────────────────────────────────
  var host = $("[data-maker-host]", maker);

  function followers() { return $$("[data-follow-set]"); }

  /* 바탕 요소(<font-kku>)는 jamo-set, 꾸미개(.font-kku)는 data-jamo-set을 읽는다 */
  function setAttrOf(node) { return node.localName === "font-kku" ? "jamo-set" : "data-jamo-set"; }

  /* 페이지 제목은 굵기를 따라가되 0.14em에서 멈춘다 — 그보다 굵으면 짧은 획이 묻혀 '다'가 '디'처럼 읽힌다 */
  var TITLE_MAX_WIDTH = 0.14;
  function widthFor(node) {
    return node.closest("#hero-title") ? Math.min(parseFloat(state.width), TITLE_MAX_WIDTH) + "em" : state.width;
  }

  function applyToHosts() {
    var setName = currentSet();
    var hasCells = state.mode !== "draw" || Object.keys(currentCells()).length > 0;
    followers().forEach(function (node) {
      var attr = setAttrOf(node);
      node.style.setProperty("--fy-element-width", widthFor(node));
      if (hasCells) {
        if (node.getAttribute(attr) !== setName) node.setAttribute(attr, setName);
        else FK.refresh(node);
      } else if (node.hasAttribute(attr)) {
        node.removeAttribute(attr);
      }
    });
  }

  /* 변주: 자모마다 기울기·자리(이 페이지의 .k-hand)와 농담 */
  function applyHeroOptions() {
    ["k-hand", "kku-vary-ink"].forEach(function (cls) { host.classList.toggle(cls, state.vary); });
    if (!host.classList.length) host.removeAttribute("class");
    if (state.vary) {
      host.setAttribute("seed", "auto");
      host.setAttribute("jamo-seeds", "");
    } else {
      host.removeAttribute("seed");
      host.removeAttribute("jamo-seeds");
    }
    maker.setAttribute("data-cap", state.cap);
  }

  // ── 셈 줄과 기록 줄 ───────────────────────────────────────────
  var countOut = $("[data-maker-count]", maker);
  var metaOut = $("[data-maker-meta]", maker);
  var keepRow = $("[data-maker-keep]", maker);
  var lastEdit = null;

  function drawnCount() {
    return Object.keys(currentCells()).length;
  }

  function renderCount() {
    var text = host.dataset.source || host.textContent || "";
    var base = "그린 칸 <strong>" + drawnCount() + "</strong> · 이 문장 <strong>" + num(hangulCount(text)) + "</strong>자 · 쓸 수 있는 글자 <strong>11,172</strong>자 모두";
    if (lastEdit) {
      countOut.innerHTML = lastEdit.key + particle(lastEdit.key) + " 고쳐 <strong>" + num(lastEdit.total) + "</strong>자가 바뀌었습니다 · 이 문장에서는 <strong>" +
        num(textAffected(currentSet(), lastEdit.key, text)) + "</strong>자 · " + base;
    } else {
      countOut.innerHTML = base;
    }
  }

  function renderMeta() {
    var set = S.byId(state.source);
    keepRow.hidden = state.mode !== "draw";
    if (state.mode === "draw") {
      metaOut.innerHTML = "직접 그리기 — " + escapeHtml(tabLabel(state.source)) + "에서 시작했습니다" +
        (state.edited.length ? ". 고친 칸: " + escapeHtml(state.edited.join(" ")) : ". 칸을 누르고 그어 보세요") +
        ". 아래 <a href=\"#web\">내 페이지에 쓰기</a> 코드에도 그대로 들어갑니다.";
    } else {
      var from = set.by + " · " + set.where + " · " + set.date + " · " + set.attempt + (set.edited ? " · 고침" : " · 고치지 않음");
      metaOut.innerHTML = "AI 답 그대로 — " + escapeHtml(from) + " · 느낌 '" + escapeHtml(set.feel) + "' · <a href=\"#ai-answers\">프롬프트와 답 원문</a>";
    }
  }

  function tabLabel(id) {
    var tab = $('[data-maker-set="' + id + '"]', maker);
    if (tab) return tab.textContent.trim();
    var set = S.byId(id);
    return set ? "AI 답(" + set.feel + ")" : id;
  }

  // ── 고르기 ──────────────────────────────────────────────────
  var tabs = $$("[data-maker-set]", maker);
  var drawTab = $('[data-maker-set="draw"]', maker);
  var pad = $("[data-maker-pad]", maker);

  function selectTab(id) {
    tabs.forEach(function (tab) {
      var on = tab.getAttribute("data-maker-set") === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
  }

  /* 남겨 둔 그림이 있으면 직접 그리기 탭이 '이어 그리기'가 된다 */
  function syncDrawTab() {
    drawTab.textContent = state.mode !== "draw" && storeRead(DRAFT_KEY) ? "✎ 이어 그리기" : "✎ 직접 그리기";
  }

  function chooseSet(id) {
    state.mode = "set";
    state.source = id;
    state.width = answers[id].width || state.width;
    state.selected = null;
    lastEdit = null;
    pad.hidden = true;
    widthInput.value = String(parseFloat(state.width));
    selectTab(id);
    syncDrawTab();
    renderCells();
    applyToHosts();
    renderCount();
    renderMeta();
    emit();
  }

  function validDraft(draft) {
    return draft && draft.v === 1 && draft.cells && typeof draft.cells === "object" && answers[draft.from] &&
      ORDER.some(function (key) { return draft.cells[key] && Array.isArray(draft.cells[key].shapes); });
  }

  function enterDraw(key) {
    if (state.mode !== "draw") {
      var draft = storeRead(DRAFT_KEY);
      state.mode = "draw";
      state.draw = {};
      if (validDraft(draft)) {
        /* 지난번에 그리던 칸 — 이 브라우저에 남겨 둔 것 */
        state.source = draft.from;
        /* 굵기 막대의 끝(0.15em — 풍선 둘째 답의 굵기, 그보다 굵으면 짧은 획이 묻힌다. 예전에는 0.2em까지)을 넘는 값은 끝으로 */
        state.width = /^0?\.\d+em$/.test(draft.width) ? Math.min(parseFloat(draft.width), Number(widthInput.max)) + "em" : state.width;
        state.edited = Array.isArray(draft.edited) ? draft.edited.filter(function (k) { return ORDER.indexOf(k) >= 0; }) : [];
        ORDER.forEach(function (k) {
          var cell = draft.cells[k];
          var ok = cell && Array.isArray(cell.shapes) && Array.isArray(cell.box) && cell.box.length === 4;
          state.draw[k] = ok ? { box: cell.box.slice(), shapes: clone(cell.shapes), touched: state.edited.indexOf(k) >= 0 } : { box: [0, 0, 100, 100], shapes: [], touched: true };
        });
        widthInput.value = String(parseFloat(state.width));
      } else {
        state.edited = [];
        var cells = answers[state.source].cells;
        ORDER.forEach(function (k) {
          var cell = cells[k];
          state.draw[k] = cell ? { box: (cell.box || [0, 0, 100, 100]).slice(), shapes: clone(cell.shapes), touched: false } : { box: [0, 0, 100, 100], shapes: [], touched: false };
        });
      }
      registerDraw();
      applyToHosts();
    }
    selectTab("draw");
    syncDrawTab();
    openPad(key || state.selected || "ㄱ");
    renderCount();
    renderMeta();
    emit();
  }

  function saveDraft() {
    if (state.mode !== "draw") return;
    storeWrite(DRAFT_KEY, { v: 1, from: state.source, width: state.width, edited: state.edited.slice(), cells: currentCells(), at: Date.now() });
  }

  // ── 직접 그리기 ─────────────────────────────────────────────
  var canvas = $("[data-maker-canvas]", maker);
  var padTitle = $("[data-maker-pad-title]", maker);
  var ghost = null;
  var inkLayer = null;
  var stroke = null;

  function openPad(key) {
    state.selected = key;
    pad.hidden = false;
    /* ㆍ는 본문 글꼴에서 가운뎃점(·)과 똑같아 보인다 — 이름으로 쓴다 */
    padTitle.textContent = key === "ㆍ" ? "짧은 획 칸 — ㅏ와 ㅗ에 붙는 획" : key + " 칸";
    renderCells();
    renderPad();
    revealPad();
  }

  /* 좁은 화면에서는 그리기 칸(위)과 문장(아래)이 세로로 놓인다. 둘이 한 화면에 들어가면 둘 다 보이게 옮겨, 한 획을 그을
   * 때마다 문장이 바뀌는 것을 보며 그린다. 안 들어가면 그리기 칸만 다 보이게 */
  function revealPad() {
    var header = $(".k-header");
    var top = header && getComputedStyle(header).position !== "static" ? header.getBoundingClientRect().bottom : 0;
    var room = window.innerHeight - top;
    var cv = canvas.getBoundingClientRect();
    var stage = $("[data-maker-stage]", maker).getBoundingClientRect();
    var margin = 8;
    var by = 0;
    if (stage.bottom - cv.top <= room - margin * 2) {
      if (stage.bottom > window.innerHeight - margin) by = stage.bottom - window.innerHeight + margin;
      else if (cv.top < top + margin) by = cv.top - top - margin;
    } else if (cv.bottom > window.innerHeight - margin) {
      by = Math.min(cv.bottom - window.innerHeight + margin, cv.top - top - margin);
    } else if (cv.top < top + margin) {
      by = cv.top - top - margin;
    }
    /* 바로 옮긴다 — 부드럽게 옮기면 옮기는 사이에 그은 획이 엇나간다. site.css의 html { scroll-behavior: smooth }를
     * 따르지 않게 instant를 밝힌다(모르는 브라우저는 그냥 옮긴다) */
    if (Math.abs(by) > 1) jumpTo(window.scrollY + by);
  }

  function jumpTo(top) {
    try {
      window.scrollTo({ top: top, behavior: "instant" });
    } catch (error) {
      window.scrollTo(0, top);
    }
  }

  function renderPad() {
    canvas.innerHTML = "";
    var cell = state.draw[state.selected];
    ghost = document.createElementNS(SVG_NS, "g");
    ghost.setAttribute("data-ghost", "");
    inkLayer = document.createElementNS(SVG_NS, "g");
    if (cell && !cell.touched) {
      cell.shapes.forEach(function (shape) { ghost.appendChild(shapeNode(shape)); });
    } else if (cell) {
      cell.shapes.forEach(function (shape) { inkLayer.appendChild(shapeNode(shape)); });
    }
    canvas.appendChild(ghost);
    canvas.appendChild(inkLayer);
  }

  function point(event) {
    var rect = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
    ];
  }

  /* 점 목록을 줄인다(Ramer–Douglas–Peucker). 처음과 끝이 거의 같은 닫힌 획(ㅇ을 한 번에 돌려 그은 것)은 잴 선이 없으므로
   * 처음 점에서 떨어진 거리로 잰다 — 선까지의 거리로 재면 모든 점이 0이 되어 획이 점 하나로 줄었다 */
  function simplify(points, epsilon) {
    if (points.length < 3) return points;
    var first = points[0];
    var last = points[points.length - 1];
    var dx = last[0] - first[0];
    var dy = last[1] - first[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    var index = 0;
    var max = 0;
    for (var i = 1; i < points.length - 1; i += 1) {
      var dist = len < 1e-6
        ? Math.sqrt(Math.pow(points[i][0] - first[0], 2) + Math.pow(points[i][1] - first[1], 2))
        : Math.abs(dy * points[i][0] - dx * points[i][1] + last[0] * first[1] - last[1] * first[0]) / len;
      if (dist > max) { max = dist; index = i; }
    }
    if (max > epsilon) {
      var left = simplify(points.slice(0, index + 1), epsilon);
      return left.slice(0, -1).concat(simplify(points.slice(index), epsilon));
    }
    return [first, last];
  }

  function pathOf(points) {
    var r = function (n) { return Math.round(n * 10) / 10; };
    if (points.length === 1) points = [points[0], [points[0][0] + 1, points[0][1]]];
    return points.map(function (p, i) { return (i ? "L" : "M") + r(p[0]) + " " + r(p[1]); }).join(" ");
  }

  function boxOf(shapes) {
    var xs = [];
    var ys = [];
    shapes.forEach(function (d) {
      String(d).replace(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g, function (m, x, y) { xs.push(Number(x)); ys.push(Number(y)); return m; });
    });
    var box = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    /* 납작한 획(ㅡ·ㅣ·ㆍ)도 범위가 0이 되지 않게 */
    [[0, 2], [1, 3]].forEach(function (pair) {
      if (box[pair[1]] - box[pair[0]] < 4) {
        var mid = (box[pair[0]] + box[pair[1]]) / 2;
        box[pair[0]] = mid - 2;
        box[pair[1]] = mid + 2;
      }
    });
    return box.map(function (n) { return Math.round(n * 10) / 10; });
  }

  function commitCell(key) {
    var cell = state.draw[key];
    if (cell.shapes.length) cell.box = boxOf(cell.shapes);
    if (state.edited.indexOf(key) < 0) state.edited.push(key);
    var ok = registerDraw();
    if (!ok || host.getAttribute("jamo-set") !== DRAW_SET) applyToHosts();
    else followers().forEach(function (node) { if (node !== host) FK.refresh(node); });
    lastEdit = { key: key, total: affected(DRAW_SET, key) };
    saveDraft();
    renderCells();
    renderCount();
    renderMeta();
    emit();
  }

  canvas.addEventListener("pointerdown", function (event) {
    if (!state.selected) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    var cell = state.draw[state.selected];
    if (!cell.touched) {
      /* 처음 긋는 획이 칸을 새로 시작한다 — 이전 그림은 흐린 밑그림으로만 남는다 */
      cell.touched = true;
      cell.shapes = [];
      inkLayer.innerHTML = "";
    }
    stroke = { points: [point(event)], node: document.createElementNS(SVG_NS, "path") };
    inkLayer.appendChild(stroke.node);
    stroke.node.setAttribute("d", pathOf(stroke.points));
  });

  canvas.addEventListener("pointermove", function (event) {
    if (!stroke) return;
    var p = point(event);
    var last = stroke.points[stroke.points.length - 1];
    if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 1.2) return;
    stroke.points.push(p);
    stroke.node.setAttribute("d", pathOf(stroke.points));
  });

  function endStroke() {
    if (!stroke) return;
    var d = pathOf(simplify(stroke.points, 0.8));
    stroke.node.setAttribute("d", d);
    state.draw[state.selected].shapes.push(d);
    stroke = null;
    commitCell(state.selected);
  }

  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", function () {
    if (stroke) {
      stroke.node.remove();
      stroke = null;
    }
  });

  $("[data-maker-undo]", maker).addEventListener("click", function () {
    var cell = state.draw && state.draw[state.selected];
    if (!cell || !cell.touched || !cell.shapes.length) return;
    cell.shapes.pop();
    renderPad();
    commitCell(state.selected);
  });

  $("[data-maker-clear]", maker).addEventListener("click", function () {
    var cell = state.draw && state.draw[state.selected];
    if (!cell) return;
    cell.touched = true;
    cell.shapes = [];
    renderPad();
    commitCell(state.selected);
  });

  $("[data-maker-done]", maker).addEventListener("click", function () {
    pad.hidden = true;
    state.selected = null;
    renderCells();
  });

  maker.addEventListener("click", function (event) {
    var tab = event.target.closest("[data-maker-set]");
    if (tab) {
      var id = tab.getAttribute("data-maker-set");
      if (id === "draw") enterDraw(state.selected || "ㄱ");
      else chooseSet(id);
      return;
    }
    var cell = event.target.closest("[data-maker-cell]");
    if (cell) enterDraw(cell.getAttribute("data-maker-cell"));
  });

  $("[data-maker-tabs]", maker).addEventListener("keydown", function (event) {
    var index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    var next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    var tab = tabs[(next + tabs.length) % tabs.length];
    tab.focus();
    tab.click();
  });

  // ── 그린 글꼴 가져가기: 작업실로 · HTML 한 장 · 페이지 코드 ─────────────
  function cellsCode(cells) {
    return ORDER.filter(function (key) { return cells[key]; }).map(function (key) {
      var cell = cells[key];
      return '    "' + key + '": { box: ' + JSON.stringify(cell.box) + ", shapes: " + JSON.stringify(cell.shapes) + " }";
    }).join(",\n");
  }

  function runtimeUrl() {
    return site && site.RUNTIME ? site.RUNTIME : "https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.2/font-kku.min.js";
  }

  /* 등록 코드 — 스크립트 두 줄(런타임 · registerJamo). 끝 모양은 히어로에서 고른 것 */
  function registerCode(info) {
    var options = registerOptions();
    return '<script src="' + runtimeUrl() + '" data-fonts="sebul"></' + "script>\n" +
      "<script>\n" +
      '  FontKku.registerJamo("my-font", {\n' + cellsCode(info.cells) + "\n" +
      '  }, { frame: "box", cap: "' + options.cap + '", join: "' + options.join + '" });\n' +
      "</" + "script>";
  }

  function headingCode(info, text, size) {
    return '<h1><font-kku font="sebul" jamo-set="my-font" size="' + size + '"\n' +
      '  style="--fy-element-width: ' + info.width + '">' + escapeHtml(text) + "</font-kku></h1>";
  }

  function pageCode(info, text) {
    return registerCode(info) + "\n" + headingCode(info, text, 48);
  }

  function heroText() {
    return (input.value || "").trim() || DEFAULT_TEXT;
  }

  function handoffToStudio() {
    if (state.mode !== "draw") return false;
    return storeWrite(HANDOFF_KEY, { v: 1, from: "landing", width: state.width, cells: currentCells(), at: Date.now() });
  }

  $("[data-maker-studio]", maker).addEventListener("click", function () { handoffToStudio(); });
  /* 히어로의 주 버튼도 그리던 칸이 있으면 들고 간다 — 없으면 작업실이 빈 칸으로 연다 */
  var cta = $("[data-maker-cta]");
  if (cta) cta.addEventListener("click", function () { if (state.mode === "draw" && state.edited.length) handoffToStudio(); });

  /* HTML 한 장 — AI 답과 같은 모양이라 브라우저로 열면 내 글꼴로 그린 문장이 보이고, 코드를 그대로 옮겨 쓴다 */
  $("[data-maker-download]", maker).addEventListener("click", function (event) {
    var current = info();
    var html = "<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n<title>내 폰꾸 글꼴</title>\n" +
      registerCode(current) + "\n</head>\n<body>\n" + headingCode(current, heroText(), 64) + "\n</body>\n</html>\n";
    if (site && site.download) site.download("my-font-kku.html", html, event.currentTarget);
  });

  $("[data-maker-copy]", maker).addEventListener("click", function (event) {
    if (site && site.copyText) site.copyText(pageCode(info(), heroText()), event.currentTarget);
  });

  $("[data-maker-forget]", maker).addEventListener("click", function () {
    storeWrite(DRAFT_KEY, null);
    chooseSet(state.source);
  });

  // ── 펜 · 변주 ────────────────────────────────────────────────
  var widthInput = $("[data-maker-width]", maker);
  var widthTimer = 0;
  widthInput.addEventListener("input", function () {
    state.width = Number(widthInput.value).toFixed(3).replace(/0+$/, "") + "em";
    renderCells();
    clearTimeout(widthTimer);
    widthTimer = setTimeout(function () {
      applyToHosts();
      saveDraft();
      emit();
    }, 60);
  });

  function pressGroup(selector, attr, value) {
    $$(selector, maker).forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute(attr) === value));
    });
  }

  $("[data-maker-caps]", maker).addEventListener("click", function (event) {
    var button = event.target.closest("[data-maker-cap]");
    if (!button) return;
    state.cap = button.getAttribute("data-maker-cap");
    pressGroup("[data-maker-cap]", "data-maker-cap", state.cap);
    applyHeroOptions();
    emit();
  });

  var varyButton = $("[data-maker-vary]", maker);
  varyButton.addEventListener("click", function () {
    state.vary = !state.vary;
    varyButton.setAttribute("aria-pressed", String(state.vary));
    applyHeroOptions();
  });

  // ── 문장 ────────────────────────────────────────────────────
  var form = $("[data-maker-form]", maker);
  var input = form.querySelector("input");

  function applyText() {
    FK.refresh(host, { text: heroText() });
    renderCount();
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); });
  input.addEventListener("input", applyText);

  // ── 처음: 8칸이 획순대로 그어지고, 끝나면 문장이 조립된다 ─────────
  function intro() {
    if (reduceMotion) return;
    var paths = $$(".k-maker-cell svg :is(path, ellipse)", maker);
    var perCell = 1500 / ORDER.length;
    $$(".k-maker-cell", maker).forEach(function (cell, i) {
      var list = $$("svg :is(path, ellipse)", cell);
      list.forEach(function (node, j) {
        node.style.setProperty("--k-stroke-delay", Math.round(i * perCell + j * perCell / list.length) + "ms");
        node.style.setProperty("--k-stroke-dur", Math.round(perCell / list.length + 40) + "ms");
      });
    });
    if (!paths.length) return;
    maker.setAttribute("data-intro", "drawing");
    setTimeout(function () {
      maker.removeAttribute("data-intro");
      host.setAttribute("animate", "assemble");
      /* 한 번 돈 뒤에는 떼어 둔다 — 문장을 고칠 때마다 다시 날아오지 않게 */
      setTimeout(function () { host.removeAttribute("animate"); }, 1800);
    }, 1560);
  }

  // ── 따라 그리는 다른 구간에 알린다 ──────────────────────────────
  var listeners = [];
  function info() {
    return { set: currentSet(), cells: currentCells(), width: state.width, mode: state.mode, source: state.source, cap: state.cap };
  }
  function emit() {
    var current = info();
    listeners.forEach(function (fn) { fn(current); });
  }

  window.FontKkuLanding = {
    on: function (fn) { listeners.push(fn); fn(info()); },
    state: info,
    affected: function (key) { return affected(currentSet(), key); },
    deps: function () { return deps(currentSet()); },
    pageCode: function () { return pageCode(info(), heroText()); },
    cellsOf: cellsOf,
    ORDER: ORDER
  };

  // ── 다른 페이지에서 그리러 온 길: index.html#maker-draw ───────────────────
  /* 사례·글꼴 페이지의 '8칸 그리러 가기'가 여기로 온다. 데모로 옮기고 '✎ 직접 그리기'(남겨 둔 그림이 있으면 '이어 그리기')를
   * 누른 것처럼 그리기 칸을 연다. #maker는 id라 브라우저가 옮긴다 — 둘 다 landing.css의 scroll-margin-top으로 붙은 머리말 아래 */
  var DRAW_HASH = "#maker-draw";
  function toMaker() {
    var margin = parseFloat(getComputedStyle(maker).scrollMarginTop) || 0;
    jumpTo(window.scrollY + maker.getBoundingClientRect().top - margin);
    revealPad();
  }
  function followHash() {
    if (location.hash !== DRAW_HASH) return false;
    enterDraw(state.selected || "ㄱ");
    toMaker();
    return true;
  }
  window.addEventListener("hashchange", followHash);

  renderCells();
  renderCount();
  renderMeta();
  syncDrawTab();
  applyHeroOptions();
  if (followHash()) {
    /* 위쪽 글꼴이 다 그려지기 전에 옮겼다면, 그동안 사용자가 움직이지 않았을 때만 다시 맞춘다 */
    var landedAt = window.scrollY;
    window.addEventListener("load", function () {
      if (location.hash === DRAW_HASH && Math.abs(window.scrollY - landedAt) < 2) toMaker();
    }, { once: true });
  } else {
    intro();
  }

  // ── 하나: 자모 지도 · 칸마다 글자 수 · 11,172자 ────────────────────
  var mapGrids = {};
  $$("[data-jamomap-grid]").forEach(function (grid) { mapGrids[grid.getAttribute("data-group")] = grid; });

  /* 조립 식의 항 — ['ㆍ×2', 'ㅡ', 'ㅣ'] */
  function recipeTerms(jamo, setName, drawn) {
    if (drawn[jamo]) return ["그린 칸"];
    var role = /[ㅏ-ㅣ]/.test(jamo) ? "medial" : "initial";
    var used = cellsOf(jamo, setName, role, role === "initial" ? "cho" : undefined);
    var terms = Object.keys(used).map(function (key) { return key + (used[key] > 1 ? "×" + used[key] : ""); });
    return terms.length ? terms : ["원소 획"];
  }

  /* 식은 붙여 쓰고(ㆍ×2+ㅡ+ㅣ) 칸이 좁으면 '+' 뒤에서만 줄을 바꾼다 — 'ㅣ'와 '×2'가 갈라지지 않게 */
  function mapItems(list, info, drawn) {
    return list.map(function (j) {
      var terms = recipeTerms(j, info.set, drawn);
      return '<li data-jamo="' + j + '" data-drawn="' + Boolean(drawn[j]) + '" title="' + j + " = " + escapeHtml(terms.join(" + ")) + '">' +
        '<font-kku font="sebul" jamo-set="' + info.set + '" size="40" style="--fy-element-width:' + info.width + '">' + j + "</font-kku>" +
        "<small>" + terms.map(function (term) { return "<span>" + escapeHtml(term) + "</span>"; }).join("+<wbr>") + "</small></li>";
    }).join("");
  }

  function renderMap(info) {
    if (!mapGrids.consonant || !mapGrids.vowel) return;
    var drawn = {};
    Object.keys(info.cells).forEach(function (key) { drawn[key] = true; });
    mapGrids.consonant.innerHTML = mapItems(CHO, info, drawn);
    mapGrids.vowel.innerHTML = mapItems(JUNG, info, drawn);
    /* 짧은 획 ㆍ는 자모가 아니라 ㅏ·ㅗ 같은 모음의 짧은 획(천)이다 — 그린 칸 그대로 보인다 */
    var dot = document.createElement("li");
    dot.setAttribute("data-jamo", "ㆍ");
    dot.setAttribute("data-drawn", String(Boolean(drawn["ㆍ"])));
    dot.className = "k-jamomap-dot";
    dot.appendChild(cellSvg(info.cells["ㆍ"] || null));
    var small = document.createElement("small");
    small.textContent = drawn["ㆍ"] ? "그린 칸" : "짧은 획";
    dot.appendChild(small);
    mapGrids.vowel.appendChild(dot);
  }

  var countList = $("[data-cellcount]");
  function renderCellCounts(info) {
    if (!countList) return;
    var keys = ORDER.filter(function (key) { return info.cells[key]; });
    var counts = keys.map(function (key) { return [key, affected(info.set, key)]; });
    /* ㆍ 하나만 쓰면 목록의 글머리표(·)처럼 보인다 — '짧은 획'으로 적는다 */
    countList.innerHTML = counts.map(function (pair) {
      var label = pair[0] === "ㆍ" ? '<b class="k-cellcount-short" title="ㆍ">짧은 획</b>' : "<b>" + pair[0] + "</b>";
      return "<li>" + label + '<i style="--k-bar:' + (pair[1] / 11172 * 100).toFixed(1) + '%"></i><span>' + num(pair[1]) + "자</span></li>";
    }).join("");
  }

  // 11,172자 모두 그려 보기 — 숨은 칸에서 588자씩 그려 세고, 끝나면 고르게 뽑은 48자를 칸마다 하나씩 보인다
  var fullButton = $("[data-fullcheck]");
  var fullOut = $("[data-fullcheck-out]");
  var fullSample = $("[data-fullcheck-sample]");
  if (fullButton) {
    fullButton.addEventListener("click", function () {
      var current = window.FontKkuLanding.state();
      fullButton.disabled = true;
      fullOut.textContent = "그리는 중… 0 / 11,172";
      fullSample.hidden = true;
      fullSample.innerHTML = "";
      var probe = document.createElement("font-kku");
      probe.className = "k-fullcheck-probe";
      probe.setAttribute("font", "sebul");
      probe.setAttribute("jamo-set", current.set);
      probe.setAttribute("size", "14");
      probe.setAttribute("wrap-unit", "glyph");
      probe.style.setProperty("--fy-element-width", current.width);
      fullSample.parentNode.insertBefore(probe, fullSample);
      var started = performance.now();
      var start = 0xac00;
      var tally = { glyphs: 0, nodes: 0, fromSet: 0, other: 0 };
      function step() {
        var text = "";
        for (var c = start; c < Math.min(start + 588, 0xd7a4); c += 1) text += String.fromCharCode(c);
        FK.refresh(probe, { text: text });
        requestAnimationFrame(function () { measure(); });
      }
      function measure() {
        tally.glyphs += probe.querySelectorAll('[part~="glyph"]').length;
        var trace = FK.traceOf(probe);
        (trace ? trace.nodes : []).forEach(function (node) {
          tally.nodes += 1;
          var ok = node.requests.every(function (q) { return q.source === current.set && q.result !== "primitive" && q.result !== "none"; });
          if (ok) tally.fromSet += 1; else tally.other += 1;
        });
        start += 588;
        fullOut.textContent = "그리는 중… " + num(Math.min(start - 0xac00, 11172)) + " / 11,172";
        if (start <= 0xd7a3) {
          requestAnimationFrame(step);
          return;
        }
        var seconds = ((performance.now() - started) / 1000).toFixed(1);
        fullOut.textContent = "11,172자 중 " + num(tally.glyphs) + "자를 그렸습니다. 자모 노드 " + num(tally.nodes) + "개 가운데 " + num(tally.fromSet) +
          "개가 그린 " + Object.keys(current.cells).length + "칸에서 나왔고, 다른 데서 온 것은 " + num(tally.other) + "개입니다 (이 브라우저, " + seconds +
          "초 — 자모마다 출처를 추적한 시간이라 그리는 속도와 다릅니다).";
        probe.remove();
        /* 고르게 뽑은 48자 — 칸마다 하나씩, 겹치지 않게 */
        var cells = [];
        for (var k = 0; k < 48; k += 1) cells.push(String.fromCharCode(0xac00 + Math.floor(k * 11172 / 48) + (k * 37) % 200));
        fullSample.innerHTML = cells.map(function (ch) {
          return '<span><font-kku font="sebul" jamo-set="' + current.set + '" size="34" style="--fy-element-width:' + current.width + '">' + ch + "</font-kku></span>";
        }).join("");
        fullSample.hidden = false;
        fullButton.disabled = false;
        fullButton.textContent = "다시 세기";
      }
      requestAnimationFrame(step);
    });
  }

  // ── 다섯: 내 페이지에 쓰는 코드 ─────────────────────────────────
  var webCode = $("[data-web-code]");
  var webSize = $("[data-web-size]");
  function renderWeb(current) {
    if (!webCode) return;
    webCode.textContent = pageCode(current, "오늘의 기록");
    if (webSize) {
      var bytes = new Blob([JSON.stringify(current.cells)]).size;
      webSize.textContent = "그린 칸 " + Object.keys(current.cells).length + "개, 칸 자료 " + num(bytes) + "바이트 — 이것이 글꼴 전부입니다. 나머지는 런타임이 조립합니다.";
    }
  }

  var followTimer = 0;
  window.FontKkuLanding.on(function (current) {
    clearTimeout(followTimer);
    followTimer = setTimeout(function () {
      renderMap(current);
      renderCellCounts(current);
      renderWeb(current);
    }, current.mode === "draw" ? 250 : 0);
  });
})();
