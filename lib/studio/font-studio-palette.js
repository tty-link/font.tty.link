/* font-studio-palette.js — 글꼴 팔레트 작업대 (설계 v1.2 §6.5·§13.4·§15.5·§17.4, PLAN-HANGUL-001 F7)
 *
 * "기존 글꼴로 만들기" 재료일 때 디자인 탭 [data-studio-f=palette]에 붙는다. 팔레트 항목(글꼴 인스턴스 = 디자인의 font 소스)마다
 * 카드 하나 — 그 인스턴스 하나만 쓰는 임시 디자인(lease)으로 그린 미리보기, 준비 상태(웹 글꼴로 실렸나 · 로컬 이름은 확인 불가),
 * 측정 상태(기록의 measurement), 출처 확신(기록의 identity — 기본 대체 글꼴과 잉크가 같으면 대체 의심). 같은 자모를 인스턴스마다
 * 나란히 보이는 자모 매트릭스(역할 하나씩: 초성 X+ㅏ · 중성 ㅇ+X · 종성 아+X)에서 칸을 누르면 그 자모·역할을 그 글꼴로 고른다
 * (pick 규칙, 다시 누르면 풀기). 잠근 칸은 자동 섞기가 건너뛰고 여기서도 바꾸지 않는다(조립식 비교와 같다 — 풀고 고른다).
 * 섞기는 씨앗으로 같은 결과(§15.5) — 고른 칸·잠근 칸은 건너뛴다.
 *
 * 모든 바꾸기는 FontStudio.design.edit 한 길(이름 붙은 기록 한 줄)이고, 항목 빼기는 영향 확인({ impact: true })을 거친다. 매트릭스
 * 열은 인스턴스마다 shadow root 하나(같은 글꼴 시트를 받는 미리보기 root — 늘지 않게 돌려 쓴다)에 표본마다 <font-kku>를 두고,
 * 칸 단추는 열 요소의 자식(slot)으로 그 표본 위에 겹친다. 낱자(호환 자모 글자)는 기기 글꼴 경로가 디자인으로 그리지 않아
 * 매트릭스 역할에 두지 않는다. FontStudio.palette = { instances, add, remove, choose, lock, mix, clearMix, matrix, role, busy }.
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var el = Util.element;

  var Studio = window.FontStudio;
  var Model = window.FontStudioPaletteModel;
  var Rules = window.FontStudioDesignRules;
  var Design = window.FontStudioDesign;
  var FontKku = window.FontKku;
  if (!Studio || !Studio.design || typeof Studio.design.edit !== "function" || !Studio.f || !Model || !Rules || !Design || !FontKku ||
      typeof FontKku.traceOf !== "function" || typeof FontKku.planJamo !== "function") {
    return;
  }

  var design = Studio.design;
  var SAMPLE_SIZE = "24px";
  var CARD_SIZE = "26px";
  var CARD_TEXT = "가 곽 한글";
  var UNSUPPORTED = "DESIGN_UNSUPPORTED_FONT";
  var ROLE_COUNT = { initial: 19, medial: 21, final: 27 };
  var WARN_TEXT = { "fallback-suspected": "대체 글꼴 의심", unmeasured: "잴 수 없음" };

  var state = {
    role: "initial",
    renderTimer: null,
    measureTimer: null,
    /* 인스턴스 id → { lease, key } — 그 인스턴스 하나만 쓰는 임시 디자인 */
    leases: {},
    leaseErrors: {},
    /* 인스턴스 id → 카드 { el, stage, … } */
    cards: {},
    /* 인스턴스 id → 매트릭스 열 stage */
    columns: {},
    matrixKey: "",
    /* 지금 역할의 칸 표시: { role, bySource: { id: [cellFlags…] } } */
    flags: { role: null, bySource: {} },
    /* 인스턴스 id → Model.summarize 결과 + ready·status */
    summary: {},
    /* 지금 역할의 행마다 실제로 그리는 소스(planJamo) */
    effective: [],
    unsupported: false,
    focus: { row: 0, col: 0 }
  };
  /* 깨어 있는 동안의 수명 맥락(f-shell, S1) — 탭이 보이고 디자인 페이지이고 본문이 펼쳐져 있을 때만 그리고 임시 디자인을 빌린다.
   * 늦게 싣기(font-studio-lazy.js)가 먼저 붙인 탭 자리를 이어받는다 — 이미 깨어 있으면 껍데기가 바로 activate를 부른다(state 뒤에 붙인다) */
  var life = null;
  /* 정밀 모드에서만(S3) */
  var section = Studio.f.mount("palette", { label: "글꼴 팔레트", modes: ["font"], mode: "precise", activate: activate, deactivate: deactivate });

  // ── 미리보기 root(돌려 쓴다) ──────────────────────────────────────────

  var chrome = new CSSStyleSheet();
  chrome.replaceSync([
    ":host { display: block; min-inline-size: 0; }",
    ".rows { display: grid; grid-auto-rows: var(--palette-row, 40px); }",
    ".rows[data-kind=\"card\"] { grid-auto-rows: auto; }",
    ".row { position: relative; display: grid; place-items: center; min-inline-size: 0; }",
    /* 글자는 칸 단추 위에 — 단추의 칠(고름·지금 그리는 글꼴)이 글자를 덮지 않고, 누르기는 글자를 지나 단추로 간다 */
    "font-kku { position: relative; z-index: 1; display: block; pointer-events: none; }",
    "::slotted([data-palette-cell]) { position: absolute; inset: 2px; z-index: 0; }"
  ].join("\n"));
  /* addPreviewRoot는 지우는 길이 없다 — 열·카드 stage를 버리지 않고 모아 두었다가 다시 쓴다 */
  var pools = { card: [], column: [] };

  function makeStage(kind) {
    var element = document.createElement("div");
    element.className = kind === "column" ? "studio-palette-column" : "studio-palette-preview";
    var root = element.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = Studio.coreHref();
    var rows = document.createElement("div");
    rows.className = "rows";
    rows.dataset.kind = kind;
    var stage = { kind: kind, element: element, root: root, rows: rows, hosts: [], dirty: true };
    link.addEventListener("load", function () {
      stage.dirty = true;
      scheduleRender();
    }, { once: true });
    root.appendChild(link);
    root.appendChild(rows);
    root.addEventListener("font-kku:render", scheduleMeasure);
    Studio.addPreviewRoot(root, [chrome]);
    return stage;
  }

  function takeStage(kind) {
    var stage = pools[kind].pop() || makeStage(kind);
    stage.dirty = true;
    return stage;
  }

  /* 문서에서 떼어 모아 둔다 — 떨어진 바탕 요소는 런타임이 다시 그리지 않고, 다시 쓸 때 dirty로 새로 그린다 */
  function dropStage(stage) {
    stage.element.remove();
    stage.element.textContent = ""; // 열의 칸 단추(빛 DOM)
    delete stage.element.dataset.paletteColumn;
    pools[stage.kind].push(stage);
  }

  /* stage에 표본 글을 하나씩 <font-kku>로 — 글·이름·글꼴이 그대로면 다시 그리지 않는다 */
  function fillStage(stage, texts, name, fontId, size) {
    while (stage.hosts.length > texts.length) {
      stage.hosts.pop().row.remove();
    }
    while (stage.hosts.length < texts.length) {
      var row = document.createElement("div");
      row.className = "row";
      var host = document.createElement("font-kku");
      host.setAttribute("size", size);
      host.setAttribute("wrap-unit", "glyph");
      row.appendChild(host);
      if (stage.kind === "column") {
        var slot = document.createElement("slot");
        slot.name = "r" + stage.hosts.length;
        row.appendChild(slot);
      }
      stage.rows.appendChild(row);
      stage.hosts.push({ row: row, host: host, text: null, name: null, font: null });
    }
    texts.forEach(function (text, index) {
      var entry = stage.hosts[index];
      if (!stage.dirty && entry.text === text && entry.name === name && entry.font === fontId) {
        return;
      }
      entry.text = text;
      entry.name = name;
      entry.font = fontId;
      entry.host.setAttribute("font", fontId);
      if (name) {
        entry.host.style.setProperty("--fy-design", name);
      } else {
        entry.host.style.removeProperty("--fy-design");
      }
      FontKku.render(entry.host, { text: text });
      FontKku.refreshAll(entry.host);
    });
    stage.dirty = false;
  }

  function traceNodes(entry) {
    var trace = entry && entry.host ? FontKku.traceOf(entry.host) : null;
    return trace && Array.isArray(trace.nodes) ? trace.nodes : [];
  }

  // ── 화면 뼈대 ────────────────────────────────────────────────────────

  function option(value, text) {
    var node = el("option", "", text);
    node.value = value;
    return node;
  }

  /* 칸 이름은 탭(글꼴 팔레트)이 맡는다 — 머리에는 쓰는 법과, 글꼴이 하나뿐일 때의 안내 */
  var head = el("header", "studio-palette-head");
  head.appendChild(el("p", "studio-palette-help",
    "팔레트 항목은 글꼴 인스턴스(이름·굵기·모양)입니다. 카드마다 그 글꼴 하나로 그린 미리보기와 준비·측정·출처 확인을 보이고, " +
    "아래 매트릭스에서 칸을 누르면 그 역할의 그 자모를 그 글꼴로 고릅니다(다시 누르면 풀기)."));
  var hint = el("p", "studio-palette-hint", "글꼴을 하나 더 더하면 같은 자모를 나란히 견주고, 고르거나 섞을 수 있습니다.");
  hint.dataset.paletteHint = "";
  hint.hidden = true;
  head.appendChild(hint);

  var cardList = el("div", "studio-palette-instances");
  cardList.dataset.paletteInstances = "";
  cardList.setAttribute("role", "list");
  cardList.setAttribute("aria-label", "팔레트 항목");

  var form = el("form", "studio-palette-add");
  form.dataset.paletteAdd = "";
  form.setAttribute("aria-label", "팔레트에 글꼴 더하기");
  form.noValidate = true;
  var familyInput = el("input");
  familyInput.type = "text";
  familyInput.name = "family";
  familyInput.spellcheck = false;
  familyInput.placeholder = "예: Nanum Myeongjo";
  familyInput.dataset.paletteAddFamily = "";
  var weightSelect = el("select");
  weightSelect.name = "weight";
  weightSelect.dataset.paletteAddWeight = "";
  weightSelect.appendChild(option("", "글꼴 CSS 그대로"));
  [100, 200, 300, 400, 500, 600, 700, 800, 900].forEach(function (weight) { weightSelect.appendChild(option(String(weight), String(weight))); });
  var styleSelect = el("select");
  styleSelect.name = "style";
  styleSelect.dataset.paletteAddStyle = "";
  styleSelect.appendChild(option("", "보통"));
  styleSelect.appendChild(option("italic", "기울임(italic)"));
  styleSelect.appendChild(option("oblique", "비스듬(oblique)"));
  [["글꼴 이름", familyInput], ["굵기", weightSelect], ["모양", styleSelect]].forEach(function (pair) {
    var label = el("label");
    label.appendChild(el("span", "", pair[0]));
    label.appendChild(pair[1]);
    form.appendChild(label);
  });
  var addButton = el("button", "", "팔레트에 더하기");
  addButton.type = "submit";
  form.appendChild(addButton);

  var mixBox = el("div", "studio-palette-mix");
  mixBox.setAttribute("role", "group");
  mixBox.setAttribute("aria-label", "자동 섞기");
  var seedLabel = el("label");
  seedLabel.appendChild(el("span", "", "씨앗"));
  var seedInput = el("input");
  seedInput.type = "text";
  seedInput.spellcheck = false;
  seedInput.placeholder = "비우면 새로 뽑음";
  seedInput.dataset.paletteMixSeed = "";
  seedLabel.appendChild(seedInput);
  var mixButton = el("button", "", "섞기");
  mixButton.type = "button";
  mixButton.dataset.paletteMix = "";
  mixButton.title = "고르지 않고 잠그지 않은 초·중·종성 칸마다 씨앗으로 글꼴을 뽑는다 — 같은 씨앗이면 같은 결과";
  var clearButton = el("button", "", "섞기 지우기");
  clearButton.type = "button";
  clearButton.dataset.paletteMixClear = "";
  var mixCount = el("output", "studio-palette-mix-count");
  mixCount.dataset.paletteMixCount = "";
  mixBox.appendChild(seedLabel);
  mixBox.appendChild(mixButton);
  mixBox.appendChild(clearButton);
  mixBox.appendChild(mixCount);

  var bar = el("div", "studio-palette-bar");
  var roles = el("fieldset", "studio-palette-roles");
  roles.appendChild(el("legend", "", "역할"));
  Model.MATRIX_ROLES.forEach(function (role) {
    var label = el("label");
    var radio = el("input");
    radio.type = "radio";
    radio.name = "palette-role";
    radio.value = role;
    radio.checked = role === state.role;
    label.appendChild(radio);
    label.appendChild(document.createTextNode(" " + Model.ROLE_TEXT[role] + " " + ROLE_COUNT[role]));
    roles.appendChild(label);
  });
  var autoLockLabel = el("label", "studio-palette-autolock");
  var autoLock = el("input");
  autoLock.type = "checkbox";
  autoLock.dataset.paletteAutolock = "";
  autoLockLabel.appendChild(autoLock);
  autoLockLabel.appendChild(document.createTextNode(" 고르면 잠그기(자동 섞기가 건너뜀)"));
  bar.appendChild(roles);
  bar.appendChild(autoLockLabel);

  var matrixBox = el("div", "studio-palette-matrix");
  matrixBox.dataset.paletteMatrix = "";
  matrixBox.dataset.role = state.role;
  var grid = el("div", "studio-palette-grid");
  grid.setAttribute("role", "group");
  matrixBox.appendChild(grid);

  var status = el("p", "studio-palette-status");
  status.dataset.paletteStatus = "";
  status.hidden = true;
  var message = el("p", "studio-palette-message");
  message.dataset.paletteMessage = "";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  [head, cardList, form, mixBox, bar, status, matrixBox, message].forEach(function (node) { section.appendChild(node); });

  function note(text, tone) {
    message.textContent = text || "";
    message.dataset.tone = tone || "info";
  }

  // ── 그리기 ───────────────────────────────────────────────────────────

  function currentJson() {
    return design.json();
  }

  function fontId() {
    return Studio.state.fontId || null;
  }

  /* 칸이 보이는가 — 탭이 보이고, 디자인 페이지이고, 디자인 본문이 펼쳐져 있을 때(D10, f-shell 수명이 깨운 동안) */
  function active() {
    return Boolean(life) && life.active();
  }

  function scheduleRender() {
    if (!active()) {
      return;
    }
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, 30);
  }

  function scheduleMeasure() {
    if (!active()) {
      return;
    }
    clearTimeout(state.measureTimer);
    state.measureTimer = setTimeout(measure, 40);
  }

  function leaseName(id) {
    var entry = state.leases[id];
    return entry ? entry.lease.name : null;
  }

  /* 인스턴스마다 임시 디자인 하나 — 배치·인스턴스가 그대로면 그대로 둔다 */
  function syncLeases(json, list) {
    list.forEach(function (instance) {
      var next = Model.leaseDesign(json, instance.id);
      var key = Design.stableJson(next);
      var entry = state.leases[instance.id];
      if (entry && entry.key === key) {
        return;
      }
      try {
        if (entry) {
          entry.lease.update(next);
          entry.key = key;
        } else {
          state.leases[instance.id] = { lease: design.lease(next), key: key };
        }
        delete state.leaseErrors[instance.id];
      } catch (error) {
        state.leaseErrors[instance.id] = error && error.message || String(error);
      }
    });
  }

  /* 빠진 인스턴스의 임시 디자인을 거둔다 — 그 카드·열을 떼어 낸 뒤(붙은 채 거두면 런타임이 미등록으로 다시 그린다) */
  function pruneLeases(list) {
    var keep = {};
    list.forEach(function (instance) { keep[instance.id] = true; });
    Object.keys(state.leases).forEach(function (id) {
      if (!keep[id]) {
        state.leases[id].lease.release();
        delete state.leases[id];
      }
    });
  }

  function releaseLeases() {
    Object.keys(state.leases).forEach(function (id) {
      state.leases[id].lease.release();
    });
    state.leases = {};
  }

  function chip(name) {
    var item = el("li", "studio-palette-chip");
    item.dataset.chip = name;
    return item;
  }

  function makeCard(instance) {
    var card = { el: el("article", "studio-palette-card"), stage: takeStage("card") };
    card.el.setAttribute("role", "listitem");
    card.el.dataset.paletteInstance = instance.id;
    var title = el("header", "studio-palette-card-head");
    card.family = el("strong", "studio-palette-family");
    card.variant = el("span", "studio-palette-variant");
    card.code = el("code", "studio-palette-id", instance.id);
    card.badge = el("span", "studio-palette-badge");
    [card.family, card.variant, card.code, card.badge].forEach(function (node) { title.appendChild(node); });
    card.chips = el("ul", "studio-palette-chips");
    card.ready = chip("ready");
    card.identity = chip("identity");
    card.measurement = chip("measurement");
    [card.ready, card.identity, card.measurement].forEach(function (node) { card.chips.appendChild(node); });
    card.remove = el("button", "studio-palette-remove", "빼기");
    card.remove.type = "button";
    card.remove.dataset.paletteRemove = instance.id;
    card.el.appendChild(title);
    card.el.appendChild(card.stage.element);
    card.el.appendChild(card.chips);
    card.el.appendChild(card.remove);
    return card;
  }

  function syncCards(list) {
    var keep = {};
    list.forEach(function (instance, index) {
      keep[instance.id] = true;
      var card = state.cards[instance.id] || (state.cards[instance.id] = makeCard(instance));
      card.el.dataset.family = instance.family;
      card.el.dataset.weight = instance.weight ? String(instance.weight) : "";
      card.el.dataset.style = instance.style || "";
      card.el.dataset.default = String(instance.isDefault);
      card.el.dataset.roles = instance.roles.join(" ");
      card.family.textContent = instance.family;
      card.family.title = instance.label;
      card.variant.textContent = [instance.weight ? String(instance.weight) : "", instance.style || "", instance.stretch || ""]
        .filter(Boolean).join(" ");
      card.badge.textContent = instance.isDefault ? "기본" : instance.roles.length
        ? instance.roles.map(function (role) { return Model.ROLE_TEXT[role]; }).join("·") + " 기본" : "";
      card.badge.hidden = !card.badge.textContent;
      card.remove.setAttribute("aria-label", instance.label + " 팔레트에서 빼기");
      /* 디자인의 소스 차례로 — 제자리면 옮기지 않는다(옮기면 미리보기가 문서에서 떨어졌다 붙어 다시 그린다) */
      if (cardList.children[index] !== card.el) {
        cardList.insertBefore(card.el, cardList.children[index] || null);
      }
      fillStage(card.stage, [CARD_TEXT], leaseName(instance.id), fontId(), CARD_SIZE);
    });
    Object.keys(state.cards).forEach(function (id) {
      if (!keep[id]) {
        dropStage(state.cards[id].stage);
        state.cards[id].el.remove();
        delete state.cards[id];
      }
    });
  }

  /* 매트릭스 뼈대 — 역할이나 인스턴스 차례가 바뀔 때만 다시 짠다 */
  function buildMatrix(list, samples) {
    Object.keys(state.columns).forEach(function (id) { dropStage(state.columns[id]); });
    state.columns = {};
    grid.textContent = "";
    grid.style.setProperty("--palette-cols", String(list.length));
    grid.setAttribute("aria-label", Model.ROLE_TEXT[state.role] + " 자모 × 글꼴 — 칸을 누르면 고른다");
    var corner = el("div", "studio-palette-corner", Model.ROLE_TEXT[state.role]);
    grid.appendChild(corner);
    list.forEach(function (instance) {
      var heading = el("div", "studio-palette-colhead");
      heading.dataset.paletteColumnHead = instance.id;
      heading.appendChild(el("span", "studio-palette-colhead-label"));
      heading.appendChild(el("code", "", instance.id));
      grid.appendChild(heading);
    });
    var rowHeads = el("div", "studio-palette-rowheads");
    samples.forEach(function (sample) {
      var rowHead = el("div", "studio-palette-rowhead");
      rowHead.dataset.paletteRow = sample.jamo;
      rowHead.appendChild(el("span", "studio-palette-rowhead-jamo", sample.jamo));
      var lock = el("button", "studio-palette-lock", "잠금");
      lock.type = "button";
      lock.dataset.paletteLock = "";
      lock.dataset.jamo = sample.jamo;
      lock.setAttribute("aria-pressed", "false");
      lock.setAttribute("aria-label", sample.jamo + " " + Model.ROLE_TEXT[state.role] + " 잠금 — 자동 섞기가 건너뜀");
      rowHead.appendChild(lock);
      rowHeads.appendChild(rowHead);
    });
    grid.appendChild(rowHeads);
    list.forEach(function (instance, col) {
      var stage = takeStage("column");
      stage.element.dataset.paletteColumn = instance.id;
      samples.forEach(function (sample, row) {
        var cell = el("button", "studio-palette-cell");
        cell.type = "button";
        cell.slot = "r" + row;
        cell.dataset.paletteCell = "";
        cell.dataset.jamo = sample.jamo;
        cell.dataset.role = state.role;
        cell.dataset.source = instance.id;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.tabIndex = -1;
        var warn = el("span", "studio-palette-warn", "⚠");
        warn.setAttribute("aria-hidden", "true");
        cell.appendChild(warn);
        stage.element.appendChild(cell);
      });
      grid.appendChild(stage.element);
      state.columns[instance.id] = stage;
    });
    state.flags = { role: null, bySource: {} };
    state.focus = { row: 0, col: 0 };
  }

  function syncMatrix(list) {
    var samples = Model.matrixSamples(state.role);
    var key = state.role + "|" + list.map(function (instance) { return instance.id; }).join(",");
    if (key !== state.matrixKey) {
      buildMatrix(list, samples);
      state.matrixKey = key;
    }
    matrixBox.dataset.role = state.role;
    var texts = samples.map(function (sample) { return sample.text; });
    list.forEach(function (instance) {
      var heading = grid.querySelector('[data-palette-column-head="' + instance.id + '"]');
      heading.title = instance.label + (instance.isDefault ? " (기본)" : "");
      heading.dataset.default = String(instance.isDefault);
      heading.querySelector(".studio-palette-colhead-label").textContent = instance.label;
      fillStage(state.columns[instance.id], texts, leaseName(instance.id), fontId(), SAMPLE_SIZE);
    });
  }

  /* 행마다 지금 디자인이 실제로 그리는 소스 — 고른 칸이 없을 때 어느 열이 이기는지(역할 기본·자모 규칙·기본) */
  function effectiveSources(samples) {
    var name = design.name();
    return samples.map(function (sample) {
      if (!name) {
        return null;
      }
      try {
        var root = FontKku.planJamo(sample.jamo, { design: name, role: sample.role }).trace[0];
        return root ? root.effectiveSource || root.source || null : null;
      } catch (error) {
        return null;
      }
    });
  }

  function updateCells() {
    var json = currentJson();
    var samples = Model.matrixSamples(state.role);
    state.effective = effectiveSources(samples);
    var labels = {};
    Model.instances(json).forEach(function (instance) { labels[instance.id] = instance.label; });
    var flags = state.flags.role === state.role ? state.flags.bySource : {};
    Array.prototype.forEach.call(grid.querySelectorAll("[data-palette-cell]"), function (cell) {
      var row = Number(cell.dataset.row);
      var source = cell.dataset.source;
      var cellState = Model.cellState(json, cell.dataset.jamo, state.role, source);
      var flag = flags[source] && flags[source][row] ? flags[source][row] : null;
      var effective = state.effective[row] === source;
      cell.dataset.chosen = String(cellState.chosen);
      cell.dataset.origin = cellState.origin;
      cell.dataset.locked = String(cellState.locked);
      cell.dataset.effective = String(effective);
      cell.dataset.warn = flag ? flag.warn : "";
      cell.setAttribute("aria-pressed", String(cellState.chosen && cellState.origin === "pick"));
      cell.setAttribute("aria-disabled", String(cellState.locked));
      var parts = [cell.dataset.jamo + " " + Model.ROLE_TEXT[state.role] + " — " + (labels[source] || source)];
      if (cellState.chosen) {
        parts.push(cellState.origin === "pick" ? "고름(다시 누르면 풀기)" : cellState.origin === "mix" ? "섞기로 고름" : "규칙으로 고름");
      } else if (effective) {
        parts.push("지금 그리는 글꼴");
      }
      if (cellState.locked) {
        parts.push("잠김 — 풀고 고르기");
      }
      if (flag && flag.warn) {
        parts.push("⚠ " + WARN_TEXT[flag.warn]);
      }
      cell.setAttribute("aria-label", parts.join(" · "));
      cell.title = parts.join(" · ");
      cell.tabIndex = row === state.focus.row && Number(cell.dataset.col) === state.focus.col ? 0 : -1;
    });
    Array.prototype.forEach.call(grid.querySelectorAll("[data-palette-lock]"), function (button) {
      var locked = Rules.isLocked(json, { jamo: button.dataset.jamo, role: state.role });
      var covered = locked && !exactLock(json, button.dataset.jamo, state.role);
      button.setAttribute("aria-pressed", String(locked));
      button.disabled = covered;
      button.title = covered ? button.dataset.jamo + "의 모든 역할 잠금이 덮습니다 — 조립식·binding 탭의 '모든 역할'에서 푸세요"
        : locked ? "잠김 — 자동 섞기가 건너뛰고 고르기도 막는다. 누르면 풀기" : "잠그면 자동 섞기가 건너뛰고 고르기도 막는다";
      button.closest("[data-palette-row]").dataset.locked = String(locked);
    });
    var count = Model.mixCount(json);
    var single = Object.keys(labels).length < 2;
    mixCount.textContent = count ? "섞은 칸 " + count : "섞은 칸 없음";
    mixCount.dataset.count = String(count);
    clearButton.disabled = count === 0;
    mixButton.disabled = single;
    hint.hidden = !single;
  }

  function render() {
    state.renderTimer = null;
    if (!active()) {
      return;
    }
    var json = currentJson();
    if (json.mode !== "font" || !fontId() || !Studio.doc()) {
      return;
    }
    life.work();
    var list = Model.instances(json);
    syncLeases(json, list);
    syncCards(list);
    syncMatrix(list);
    pruneLeases(list);
    updateCells();
    scheduleMeasure();
  }

  /* 카드·칸 기록 읽기 — 인스턴스마다 카드 미리보기와 매트릭스 열의 기록을 모아 센다 */
  function measure() {
    state.measureTimer = null;
    if (!active()) {
      return;
    }
    var json = currentJson();
    var list = Model.instances(json);
    var bySource = {};
    var unsupported = false;
    list.forEach(function (instance) {
      var card = state.cards[instance.id];
      var column = state.columns[instance.id];
      var nodes = [];
      var hosts = (card ? card.stage.hosts : []).concat(column ? column.hosts : []);
      hosts.forEach(function (entry) {
        nodes = nodes.concat(traceNodes(entry));
        if (entry.host.dataset.fyDesignStatus === UNSUPPORTED) {
          unsupported = true;
        }
      });
      bySource[instance.id] = column ? column.hosts.map(function (entry) { return Model.cellFlags(traceNodes(entry), state.role); }) : [];
      var summary = Model.summarize(Model.aggregate(nodes)[instance.id]);
      summary.ready = Model.readiness(instance.family, document.fonts);
      summary.status = state.leaseErrors[instance.id] ? "invalid" : card && card.stage.hosts[0]
        ? card.stage.hosts[0].host.dataset.fyDesignStatus || "" : "";
      state.summary[instance.id] = summary;
      if (card) {
        card.el.dataset.ready = summary.ready;
        card.el.dataset.identity = summary.identity;
        card.el.dataset.measurement = summary.measurement;
        card.el.dataset.requests = String(summary.requests);
        card.el.dataset.status = summary.status;
        card.ready.textContent = Model.READINESS_TEXT[summary.ready];
        card.ready.dataset.value = summary.ready;
        card.identity.textContent = Model.IDENTITY_TEXT[summary.identity] +
          (summary.suspected ? " " + summary.suspected + "/" + summary.requests : "");
        card.identity.dataset.value = summary.identity;
        card.measurement.textContent = Model.MEASUREMENT_TEXT[summary.measurement];
        card.measurement.dataset.value = summary.measurement;
      }
    });
    state.flags = { role: state.role, bySource: bySource };
    state.unsupported = unsupported;
    status.hidden = !unsupported;
    status.textContent = unsupported ? "⚠ 지금 작업실 글꼴은 디자인을 받지 않아(" + UNSUPPORTED + ") 팔레트 미리보기를 그리지 못합니다 — " +
      "sebul·gothic 같은 표준 잉크 상자 글꼴로 바꾸세요." : "";
    updateCells();
  }

  /* 깨면 렌더 훅·디자인 바뀜·글꼴 도착을 받고 그린다 */
  function activate(ctx) {
    life = ctx;
    ctx.onRender(scheduleRender);
    ctx.listen(design, "change", scheduleRender);
    if (document.fonts && typeof document.fonts.addEventListener === "function") {
      ctx.listen(document.fonts, "loadingdone", scheduleMeasure);
      ctx.listen(document.fonts, "loadingerror", scheduleMeasure);
    }
    scheduleRender();
  }

  /* 잠들면(칸이 숨거나 다른 페이지·접힘) 임시 디자인을 거둔다(깨면 새로 빌린다) */
  function deactivate() {
    life = null;
    park();
  }

  /* 쉬게 둔다 — 그리기·재기를 멈추고, 카드·열의 바탕 요소를 비워(디자인 이름을 떼어) 런타임이 감춰진 칸을 다시 그리지 않게 한 뒤
   * 임시 디자인을 거둔다. 다시 보이면 dirty로 새로 그린다 */
  function park() {
    clearTimeout(state.renderTimer);
    clearTimeout(state.measureTimer);
    state.renderTimer = null;
    state.measureTimer = null;
    var stages = Object.keys(state.cards).map(function (id) { return state.cards[id].stage; })
      .concat(Object.keys(state.columns).map(function (id) { return state.columns[id]; }));
    stages.forEach(function (stage) {
      stage.hosts.forEach(function (entry) {
        if (entry.text !== null) {
          entry.host.style.removeProperty("--fy-design");
          FontKku.render(entry.host, { text: "" });
          entry.text = null;
          entry.name = null;
        }
      });
      stage.dirty = true;
    });
    releaseLeases();
  }


  // ── 편집 ─────────────────────────────────────────────────────────────

  function result(ok, extra) {
    var out = { ok: ok, design: currentJson(), errors: [], impact: null, cancelled: false };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  function refuse(code, text, path) {
    note("⚠ " + text, "error");
    return Promise.resolve(result(false, { errors: [{ code: code, path: path || "", message: text }] }));
  }

  function needFont(json) {
    return json.mode === "font" ? null : "글꼴 팔레트는 \"기존 글꼴로 만들기\" 재료에서 씁니다(지금 재료: " + json.mode + ")";
  }

  function roleKey(role) {
    if (Rules.ROLES.indexOf(role) < 0) {
      throw new TypeError("font-studio-palette: role is initial, medial, final or standalone (got " + JSON.stringify(role) + ")");
    }
    return role;
  }

  function slotLabel(jamo, role) {
    return jamo + "(" + Model.ROLE_TEXT[role] + ")";
  }

  function finish(out, okText, tone) {
    if (out.ok && okText) {
      note(okText, tone);
    } else if (!out.ok && !out.cancelled) {
      note("⚠ 바꾸지 못했습니다 — " + (out.errors[0] ? out.errors[0].message : "검사 오류"), "error");
    } else if (out.cancelled) {
      note("바꾸지 않았습니다.");
    }
    scheduleRender();
    return out;
  }

  /* 인스턴스 더하기 — spec: { family, weight?, style?, stretch? }. 같은 인스턴스가 있으면 그 id(added: false) */
  function add(spec) {
    var json = currentJson();
    var mode = needFont(json);
    if (mode) {
      return refuse("STUDIO_PALETTE_MODE", mode);
    }
    var plan;
    try {
      plan = Model.addInstance(json, spec);
    } catch (error) {
      return refuse("STUDIO_PALETTE_INSTANCE", error.message, "family");
    }
    var label = Model.instanceLabel(plan.design.sources[plan.id]);
    if (!plan.added) {
      note(label + "은 이미 팔레트에 있습니다(" + plan.id + ").");
      return Promise.resolve(result(true, { id: plan.id, added: false }));
    }
    return design.edit("팔레트에 더하기 " + label, function () { return plan.design; }).then(function (out) {
      out.id = plan.id;
      out.added = out.ok;
      return finish(out, label + "을 팔레트에 더했습니다(" + plan.id + ").");
    });
  }

  /* 인스턴스 빼기 — 그 글꼴을 고른 규칙·역할 기본·대체 목록을 정리한다. 영향 확인을 거친다 */
  function remove(id) {
    var json = currentJson();
    var plan = Model.removeInstance(json, id);
    if (!plan.ok) {
      return refuse("STUDIO_PALETTE_REMOVE", plan.reason, "sources." + id);
    }
    var summary = (plan.droppedRules.length ? " — 지운 규칙 " + plan.droppedRules.length + "개" : "") +
      (plan.defaultSource ? " · 기본 소스는 " + plan.defaultSource : "");
    return design.edit("팔레트에서 빼기 " + id, function () { return plan.design; }, { impact: true }).then(function (out) {
      out.removed = plan;
      return finish(out, id + "을 팔레트에서 뺐습니다" + summary + ".");
    });
  }

  /* 그 자모·역할을 그 인스턴스로 고른다(pick). id가 null이면 그 칸의 고르기를 푼다. options.lock: 함께 잠금(기본: 칸의 상자) */
  function choose(jamo, role, id, options) {
    var json = currentJson();
    var mode = needFont(json);
    if (mode) {
      return refuse("STUDIO_PALETTE_MODE", mode);
    }
    var key;
    try {
      key = roleKey(role);
    } catch (error) {
      return refuse("STUDIO_PALETTE_ROLE", error.message, "role");
    }
    var slotLocked;
    try {
      slotLocked = Rules.isLocked(json, { jamo: jamo, role: key });
    } catch (error) {
      return refuse("STUDIO_PALETTE_REFUSED", error.message, "rules");
    }
    if (slotLocked) {
      return refuse("STUDIO_PALETTE_LOCKED", slotLabel(jamo, key) + "은 잠겨 있습니다 — 잠금을 풀고 고르세요.", "editor.locks");
    }
    if (id === null || id === undefined) {
      if (Rules.getChoice(json, jamo, key).origin === "none") {
        return Promise.resolve(result(true, { unchanged: true }));
      }
      return design.edit(slotLabel(jamo, key) + " 고르기 풀기", function (draft) { return Rules.clearChoice(draft, jamo, key); })
        .then(function (out) { return finish(out, slotLabel(jamo, key) + "의 고르기를 풀었습니다."); });
    }
    var source = json.sources && json.sources[id];
    if (!source || source.kind !== "font") {
      return refuse("STUDIO_PALETTE_SOURCE", "글꼴 소스 " + id + "이 팔레트에 없습니다", "sources." + id);
    }
    var current = Rules.getChoice(json, jamo, key);
    var allowed = Rules.choiceAllowed(json, FontKku.layoutProfiles, jamo, key, current.method || "auto");
    if (!allowed.ok) {
      return refuse("STUDIO_PALETTE_REFUSED", allowed.reason, "rules");
    }
    var lock = options && typeof options.lock === "boolean" ? options.lock : autoLock.checked;
    var label = slotLabel(jamo, key) + " → " + Model.instanceLabel(source);
    return design.edit(label, function (draft) {
      var next = Rules.setChoice(draft, { jamo: jamo, role: key, source: id }, { origin: "pick" });
      return lock ? Rules.setLock(next, { jamo: jamo, role: key }, true) : next;
    }).then(function (out) { return finish(out, label + (lock ? " — 잠금" : "") + "."); });
  }

  /* 그 자모·역할 잠금이 바로 적혀 있는가(역할 없는 자모 잠금이 덮는 것은 아니다) */
  function exactLock(json, jamo, role) {
    return Rules.locks(json).some(function (entry) {
      return entry.jamo === jamo && (entry.role || null) === role && !entry.part;
    });
  }

  /* 잠금 켜기·끄기 — 잠근 칸은 자동 섞기가 건너뛰고 고르기도 막는다 */
  function lock(jamo, role, on) {
    var json = currentJson();
    var key;
    var locked;
    try {
      key = roleKey(role);
      locked = Rules.isLocked(json, { jamo: jamo, role: key });
    } catch (error) {
      return refuse("STUDIO_PALETTE_LOCK", error.message, "editor.locks");
    }
    var want = on !== false;
    if (locked === want) {
      return Promise.resolve(result(true, { unchanged: true }));
    }
    if (!want && !exactLock(json, jamo, key)) {
      return refuse("STUDIO_PALETTE_LOCK", jamo + "의 모든 역할 잠금이 덮습니다 — 조립식·binding 탭의 '모든 역할'에서 푸세요.", "editor.locks");
    }
    var label = (want ? "잠금 " : "잠금 풀기 ") + slotLabel(jamo, key);
    return design.edit(label, function (draft) { return Rules.setLock(draft, { jamo: jamo, role: key }, want); })
      .then(function (out) { return finish(out, label + "."); });
  }

  function randomSeed() {
    return Math.floor(Math.random() * 0x7fffffff).toString(36);
  }

  /* 자동 섞기 — 팔레트의 모든 인스턴스에서 초·중·종성 칸마다 씨앗으로 뽑는다. 씨앗을 비우면 새로 뽑아 칸에 남긴다 */
  function mix(seed) {
    var json = currentJson();
    var mode = needFont(json);
    if (mode) {
      return refuse("STUDIO_PALETTE_MODE", mode);
    }
    var text = seed === undefined || seed === null || String(seed).trim() === "" ? randomSeed() : String(seed).trim();
    var ids = Model.instances(json).map(function (instance) { return instance.id; });
    seedInput.value = text;
    return design.edit("섞기 " + text, function (draft) {
      return Rules.autoMix(draft, { seed: text, sourceIds: ids, scope: "jamo" });
    }).then(function (out) {
      out.seed = text;
      return finish(out, "씨앗 " + text + "으로 섞었습니다 — 섞은 칸 " + Model.mixCount(out.design) +
        (ids.length < 2 ? " (글꼴이 하나라 섞을 것이 없음)" : "") + ".");
    });
  }

  function clearMix() {
    var json = currentJson();
    if (!Model.mixCount(json)) {
      return Promise.resolve(result(true, { unchanged: true }));
    }
    return design.edit("섞기 지우기", function (draft) { return Rules.clearMix(draft); })
      .then(function (out) { return finish(out, "섞은 칸을 모두 지웠습니다."); });
  }

  function setRole(role) {
    if (Model.MATRIX_ROLES.indexOf(role) < 0) {
      throw new TypeError("font-studio-palette: the matrix shows initial, medial or final (got " + JSON.stringify(role) + ")");
    }
    if (role === state.role) {
      return;
    }
    state.role = role;
    Array.prototype.forEach.call(roles.querySelectorAll('input[name="palette-role"]'), function (radio) {
      radio.checked = radio.value === role;
    });
    scheduleRender();
  }

  /* 매트릭스 한 판(지금 디자인) — 역할을 주면 그 역할로 바꾼다. 칸의 warn·effective는 마지막으로 잰 값(재기 전이면 null) */
  function matrix(role) {
    if (role !== undefined) {
      setRole(role);
    }
    var json = currentJson();
    var ids = Model.instances(json).map(function (instance) { return instance.id; });
    var flags = state.flags.role === state.role ? state.flags.bySource : {};
    var rows = Model.matrix(json, state.role, ids);
    rows.forEach(function (row, index) {
      row.cells.forEach(function (cell) {
        var flag = flags[cell.source] && flags[cell.source][index];
        cell.warn = flag ? flag.warn : null;
        cell.effective = state.effective.length === rows.length ? state.effective[index] === cell.source : null;
      });
    });
    return { role: state.role, sources: ids, rows: rows };
  }

  function instances() {
    return Model.instances(currentJson()).map(function (instance) {
      var summary = state.summary[instance.id] || Model.summarize(null);
      instance.ready = summary.ready || Model.readiness(instance.family, document.fonts);
      instance.identity = summary.identity;
      instance.measurement = summary.measurement;
      instance.requests = summary.requests;
      instance.lease = leaseName(instance.id);
      return instance;
    });
  }

  function busy() {
    return Boolean(state.renderTimer || state.measureTimer);
  }

  // ── 이벤트 ───────────────────────────────────────────────────────────

  function focusCell(row, col) {
    var cell = grid.querySelector('[data-palette-cell][data-row="' + row + '"][data-col="' + col + '"]');
    if (!cell) {
      return false;
    }
    state.focus = { row: row, col: col };
    Array.prototype.forEach.call(grid.querySelectorAll("[data-palette-cell]"), function (other) { other.tabIndex = other === cell ? 0 : -1; });
    cell.focus();
    return true;
  }

  section.addEventListener("click", function (event) {
    var target = event.target;
    var cell = target.closest("[data-palette-cell]");
    if (cell) {
      state.focus = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
      var picked = cell.dataset.chosen === "true" && cell.dataset.origin === "pick";
      choose(cell.dataset.jamo, state.role, picked ? null : cell.dataset.source);
      return;
    }
    var lockButton = target.closest("[data-palette-lock]");
    if (lockButton) {
      lock(lockButton.dataset.jamo, state.role, lockButton.getAttribute("aria-pressed") !== "true");
      return;
    }
    var removeButton = target.closest("[data-palette-remove]");
    if (removeButton) {
      remove(removeButton.dataset.paletteRemove);
      return;
    }
    if (target.closest("[data-palette-mix]")) {
      mix(seedInput.value);
    } else if (target.closest("[data-palette-mix-clear]")) {
      clearMix();
    }
  });

  section.addEventListener("change", function (event) {
    if (event.target.matches('input[name="palette-role"]')) {
      setRole(event.target.value);
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    add({ family: familyInput.value, weight: weightSelect.value, style: styleSelect.value }).then(function (out) {
      if (out.ok) {
        familyInput.value = "";
      } else {
        familyInput.focus();
      }
    });
  });

  /* 매트릭스 방향키(↑↓ 행 · ←→ 열 · Home·End 행 끝) — 칸 하나만 Tab으로 들어온다 */
  grid.addEventListener("keydown", function (event) {
    var cell = event.target.closest("[data-palette-cell]");
    if (!cell) {
      return;
    }
    var row = Number(cell.dataset.row);
    var col = Number(cell.dataset.col);
    var rows = Model.matrixSamples(state.role).length;
    var cols = Object.keys(state.columns).length;
    var next = event.key === "ArrowDown" ? [Math.min(rows - 1, row + 1), col] : event.key === "ArrowUp" ? [Math.max(0, row - 1), col]
      : event.key === "ArrowRight" ? [row, Math.min(cols - 1, col + 1)] : event.key === "ArrowLeft" ? [row, Math.max(0, col - 1)]
      : event.key === "Home" ? [row, 0] : event.key === "End" ? [row, cols - 1] : null;
    if (next && focusCell(next[0], next[1])) {
      event.preventDefault();
    }
  });

  /* 렌더 훅·디자인 바뀜·글꼴 도착은 깨어 있을 때만 받는다(activate). 페이지·접기는 f-shell 수명이 잠재우고 깨운다 */
  design.addBusy(busy);

  Studio.palette = {
    instances: instances,
    add: add,
    remove: remove,
    choose: choose,
    lock: lock,
    mix: mix,
    clearMix: clearMix,
    matrix: matrix,
    role: function () { return state.role; },
    refresh: scheduleRender,
    busy: busy
  };
})();
