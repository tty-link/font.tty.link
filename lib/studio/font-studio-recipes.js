/* font-studio-recipes.js — 조립식·binding 비교와 원본/조합/자동·잠금 (설계 v1.2 §13.4, PLAN-HANGUL-001 F3)
 *
 * 디자인 본문의 [data-studio-f=recipes] 탭. 자모 칸 하나(자모 + 역할)를 두고 후보를 나란히 그린다 — 지금 디자인 · 자동 · 원본
 * (그림·글꼴 재료만) · 그 자모를 만드는 조립식마다 조합. 후보 디자인은 FontStudioDesignRules.setChoice로 만들어 임시 이름
 * (FontStudio.design.lease)에 등록하고, 비교 칸처럼 미리보기 글꼴 시트를 받는 따로 된 shadow root의 <font-kku>로 그린다. 후보마다
 * 런타임 기록(traceOf — 그 칸이 나뉘어 찍히면 planJamo)에서 결과·상태·조립식·소스를 읽어 [data-recipes-candidate]에 적는다.
 * 고르기·조각 binding·잠금은 FontStudio.design.edit 한 번씩(이름 붙은 기록 한 줄) — 규칙은 pick-<역할>-u<16진> 하나로 모인다.
 * 문맥 조건(vowelLayout·hasFinal)은 만들지 않는다(고정 배치 L08 — 네모 문맥의 문맥 규칙은 고급의 문맥 탭).
 *
 * 대상: 미리보기에서 자모를 고르면(select — 같은 선택을 다시 그릴 때 오는 사건은 건너뛴다) 그 음절의 그 역할 자모(ㅘ의 조각을
 * 골라도 ㅘ), 또는 칸 안의 자모 목록 [data-recipes-target](현대 자모 51)·역할 input[name=recipes-role]. 탭은 처음 고를 때(또는
 * open) 붙는다 — 맨 작업실 첫 화면은 그대로. 칸은 접힌 한 줄(고른 칸 · 고른 것)이 기본이다: 미리보기 위의 디자인 칸이 자모를
 * 고를 때마다 크게 자라 누른 자리를 밀어내지 않게(펼침은 보는 사람마다 기억). 펼쳐 보일 때만 후보를 그리고, 접히거나 가려지면
 * (탭·디자인 접기) 임시 이름을 돌려준다.
 * FontStudio.recipes = { open(jamo, role), close(), target(), candidates(), choose(id), setBinding(part, { source, method }),
 * lock(on), clear(), busy() }.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var Rules = window.FontStudioDesignRules;
  var Design = window.FontStudioDesign;
  var FontKku = window.FontKku;
  if (!Studio || !Rules || !Design || !FontKku || !Studio.design || !Studio.f || typeof FontKku.traceOf !== "function" ||
      typeof FontKku.planJamo !== "function") {
    return;
  }

  var design = Studio.design;
  var Catalog = Rules.catalog;
  var CHO = Catalog.roles.initial;
  var JUNG = Catalog.roles.medial;
  var JONG = Catalog.roles.final;
  var ROLES = ["any", "initial", "medial", "final"];
  var ROLE_LABELS = { any: "모든 역할", initial: "초성", medial: "중성", final: "종성", standalone: "낱자" };
  var METHOD_LABELS = { auto: "자동", direct: "원본", compose: "조합" };
  var RESULT_LABELS = { direct: "원본 그대로", composed: "조합", strokes: "획(원소)", primitive: "원소로 대체", none: "그리지 않음" };
  var STATUS_LABELS = { ok: "", pending: "그림 세트 받는 중", degraded: "덜 그려짐", error: "실패" };
  var OPERATION_LABELS = { double: "병서", "final-pair": "겹받침", compose: "합용", add: "가획", place: "자리 조립" };
  var KIND_LABELS = { svg: "그림 세트", font: "글꼴", primitive: "원소" };
  var UNSUPPORTED = "DESIGN_UNSUPPORTED_FONT";
  var SIZE = "36px";
  var READ_DELAY = 40;
  var OPEN_KEY = "font-kku-studio-recipes-open";

  var mainBox = document.querySelector("[data-design-main]");
  var previewBox = document.querySelector("[data-studio-preview]");
  var panel = null;
  var view = null;
  /* 후보 줄은 늘리기만 하고 다시 쓴다 — 미리보기 root(Studio.addPreviewRoot)는 지울 수 없다 */
  var rows = [];
  var target = null;
  var list = [];
  var leases = {};
  var refreshTimer = null;
  var readTimer = null;
  var stale = false;
  var lastSelect = "";
  var lastFont = null;
  var message = { text: "", tone: "info" };
  var opened = readOpen();

  /* 펼침 기억은 보는 사람의 편의 — 저장소가 막혀도 접힌 채로 돈다 */
  function readOpen() {
    try {
      return window.localStorage.getItem(OPEN_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function writeOpen(value) {
    opened = Boolean(value);
    try {
      window.localStorage.setItem(OPEN_KEY, opened ? "1" : "0");
    } catch (error) {
      /* 기억하지 못해도 이번 화면에서는 그대로 */
    }
  }

  var chrome = new CSSStyleSheet();
  chrome.replaceSync([
    ":host { display: block; }",
    "font-kku { display: block; }",
    /* 고른 자모 칸(역할이 맞는 노드)은 글자 색으로 — 모든 재료가 currentColor로 칠한다 */
    ".studio-recipes-hit { color: var(--studio-accent, #2447a8); }"
  ].join("\n"));

  // ── 자모 ─────────────────────────────────────────────────────────────

  function has(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  /* 조합용 자모(초 U+1100 · 중 U+1161 · 종 U+11A8) → 호환 자모. 호환 자모는 그대로 */
  function compat(text) {
    var code = text ? text.charCodeAt(0) : 0;
    if (code >= 0x1100 && code < 0x1100 + CHO.length) {
      return CHO[code - 0x1100];
    }
    if (code >= 0x1161 && code < 0x1161 + JUNG.length) {
      return JUNG[code - 0x1161];
    }
    if (code >= 0x11A8 && code < 0x11A8 + JONG.length) {
      return JONG[code - 0x11A8];
    }
    return text || "";
  }

  function decompose(syllable) {
    var code = syllable && syllable.length === 1 ? syllable.charCodeAt(0) - 0xAC00 : -1;
    if (!(code >= 0 && code < 11172)) {
      return null;
    }
    return { initial: CHO[Math.floor(code / 588)], medial: JUNG[Math.floor((code % 588) / 28)], final: code % 28 ? JONG[code % 28 - 1] : null };
  }

  function syllable(initial, medial, final) {
    return String.fromCharCode(0xAC00 + (CHO.indexOf(initial) * 21 + JUNG.indexOf(medial)) * 28 + (final ? JONG.indexOf(final) + 1 : 0));
  }

  function rolesOf(jamo) {
    return ROLES.filter(function (role) { return role === "any" || Rules.roleJamo(role).indexOf(jamo) >= 0; });
  }

  function defaultRole(jamo) {
    return rolesOf(jamo).filter(function (role) { return role !== "any"; })[0] || "any";
  }

  /* 견줄 글: 낱자 + 그 자모가 초성(ㅏ·ㅗ·ㅡ와)·받침(앟)·중성(와·왕)으로 든 음절 — ㅎ: "ㅎ 하 호 흐 앟", ㅘ: "ㅘ 와 왕" */
  function sampleText(jamo) {
    var out = [jamo];
    if (CHO.indexOf(jamo) >= 0) {
      ["ㅏ", "ㅗ", "ㅡ"].forEach(function (vowel) { out.push(syllable(jamo, vowel, null)); });
    }
    if (JONG.indexOf(jamo) >= 0) {
      out.push(syllable("ㅇ", "ㅏ", jamo));
    }
    if (JUNG.indexOf(jamo) >= 0) {
      out.push(syllable("ㅇ", jamo, null), syllable("ㅇ", jamo, "ㅇ"));
    }
    return out.join(" ");
  }

  /* 미리보기 노드 → { jamo, role }. 역할 자리는 음절에서 읽는다 — ㅘ의 조각(jung-base ᅩ)을 골라도 ㅘ, 겹받침 조각이면 겹받침 */
  function targetOf(node) {
    var role = Design.nodeRole(node.getAttribute("data-fy-role"), node.getAttribute("data-fy-stamp"));
    var glyph = node.closest('[part~="glyph"]');
    var parts = decompose(glyph ? glyph.getAttribute("data-source") : "");
    if (role === "head") {
      return parts ? { jamo: parts.initial, role: "initial" } : null; // 네모 문맥의 머리 음절 — 초성 칸
    }
    var known = role === "initial" || role === "medial" || role === "final";
    var jamo = known && parts && parts[role] ? parts[role] : compat(node.getAttribute("data-jamo"));
    if (Catalog.modernShapes51.indexOf(jamo) < 0) {
      return null;
    }
    return { jamo: jamo, role: known && rolesOf(jamo).indexOf(role) >= 0 ? role : null };
  }

  function roleKey(role) {
    return role || "any";
  }

  function slotLabel(slot) {
    return slot.jamo + "(" + ROLE_LABELS[roleKey(slot.role)] + ")";
  }

  /* 기록에서 읽을 역할 — 모든 역할이면 그 자모가 먼저 오는 역할 */
  function readRole() {
    var key = target.role || defaultRole(target.jamo);
    return key === "any" ? null : key;
  }

  // ── 후보 ─────────────────────────────────────────────────────────────

  function profiles() {
    return FontKku.layoutProfiles || {};
  }

  /* 칸에 지금 고른 것 → 그 후보 id(auto · direct · 조립식 id), 칸에 조립 값이 없으면 null */
  function activeId(choice) {
    if (choice.method === "compose" && choice.recipe) {
      return choice.recipe;
    }
    return choice.method === "direct" || choice.method === "auto" ? choice.method : null;
  }

  function choiceFor(id, choice) {
    if (id === "auto") {
      return { method: "auto", recipe: null, bindings: null };
    }
    if (id === "direct") {
      return { method: "direct" };
    }
    /* 같은 조립식이면 조각 binding을 잇고, 다른 조립식이면 지운다(이름이 같은 조각도 뜻이 다르다) */
    return { method: "compose", recipe: id, bindings: choice.recipe === id ? choice.bindings : null };
  }

  function recipeHelp(recipe) {
    return (OPERATION_LABELS[recipe.operation] || recipe.operation) + " — " + recipe.parts.map(function (part) {
      return part.id + " " + (part.jamo !== undefined ? part.jamo : "획");
    }).join(" + ");
  }

  /* 후보 목록: { id, kind, label, help, method, recipe, refused, reason, warning, json } */
  function candidatesFor(json) {
    var key = target.role;
    var choice = Rules.getChoice(json, target.jamo, key);
    var mode = json.mode;
    var out = [{ id: "current", kind: "current", label: "지금 디자인", help: "칸에 적힌 규칙·역할 기본·디자인 기본 그대로" }];
    out.push({ id: "auto", kind: "auto", label: "자동", help: "그림이 있으면 그림, 없으면 기본 조립식, 그다음 원소", method: "auto" });
    out.push({ id: "direct", kind: "direct", label: "원본", method: "direct",
      help: mode === "font" ? "글꼴의 그 자모를 통째로" : mode === "svg" ? "그림 세트의 그 칸을 통째로" : "소스의 그 자모를 통째로" });
    Rules.recipesFor(target.jamo).forEach(function (recipe) {
      var tags = [];
      if (recipe.isDefault) {
        tags.push("기본");
      }
      if (Catalog.history[target.jamo] === recipe.id) {
        tags.push("제자 원리");
      }
      out.push({ id: recipe.id, kind: "recipe", label: "조합 " + recipe.id + (tags.length ? " (" + tags.join("·") + ")" : ""),
        help: recipeHelp(recipe), method: "compose", recipe: recipe.id });
    });
    var active = activeId(choice);
    out.forEach(function (cand) {
      cand.active = cand.id === active;
      if (cand.kind === "current") {
        return;
      }
      var allowed = Rules.choiceAllowed(json, profiles(), target.jamo, key, cand.method);
      /* 원소 재료의 원본은 등록은 되지만 그릴 원본이 없다 — 후보로 내지 않고 까닭만 보인다(§13.4) */
      if (!allowed.ok || (cand.kind === "direct" && mode === "primitive")) {
        cand.refused = true;
        cand.code = allowed.code || "PRIMITIVE_DIRECT";
        cand.reason = allowed.reason;
        return;
      }
      cand.json = Rules.setChoice(json, Object.assign({ jamo: target.jamo, role: key }, choiceFor(cand.id, choice)), { origin: "pick" });
    });
    return out;
  }

  // ── 임시 이름 ────────────────────────────────────────────────────────

  function errorText(error) {
    return error && error.message ? error.message : String(error);
  }

  function releaseLease(id) {
    var lease = leases[id];
    delete leases[id];
    if (lease) {
      try {
        lease.release();
      } catch (error) {
        setTimeout(function () { throw error; }, 0);
      }
    }
  }

  /* 후보 디자인을 임시 이름에 — 남는 후보의 이름은 바꿔 쓰고(update), 처음 보는 후보는 새로 받는다 */
  function leaseFor(cand) {
    if (cand.kind === "current") {
      cand.name = design.name();
      return;
    }
    if (cand.refused) {
      return;
    }
    try {
      if (leases[cand.id]) {
        cand.name = leases[cand.id].update(cand.json);
      } else {
        leases[cand.id] = design.lease(cand.json);
        cand.name = leases[cand.id].name;
      }
    } catch (error) {
      releaseLease(cand.id); // 등록이 거부된 후보 — 이름에 남은 앞 디자인을 그리지 않게
      cand.name = null;
      cand.error = errorText(error);
    }
  }

  // ── 칸 ──────────────────────────────────────────────────────────────

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function setData(node, values) {
    Object.keys(values).forEach(function (key) {
      var value = values[key];
      if (value === null || value === undefined || value === "" || value === false) {
        delete node.dataset[key];
      } else {
        node.dataset[key] = value === true ? "true" : String(value);
      }
    });
  }

  function build(section) {
    section.textContent = "";
    section.classList.add("studio-recipes");
    var head = el("div", "studio-recipes-head");
    var pick = el("label", "studio-recipes-pick");
    pick.appendChild(el("span", "", "자모"));
    var select = el("select");
    select.dataset.recipesTarget = "";
    var blank = el("option", "", "고르기…");
    blank.value = "";
    select.appendChild(blank);
    [["자음", CHO], ["모음", JUNG], ["겹받침", JONG.filter(function (jamo) { return CHO.indexOf(jamo) < 0; })]].forEach(function (group) {
      var holder = el("optgroup");
      holder.label = group[0];
      group[1].forEach(function (jamo) {
        var count = Rules.recipesFor(jamo).length;
        var option = el("option", "", jamo + (count ? " · 조립식 " + count : ""));
        option.value = jamo;
        holder.appendChild(option);
      });
      select.appendChild(holder);
    });
    pick.appendChild(select);
    var roles = el("fieldset", "studio-recipes-roles");
    roles.appendChild(el("legend", "", "역할"));
    ROLES.forEach(function (role) {
      var label = el("label");
      var radio = el("input");
      radio.type = "radio";
      radio.name = "recipes-role";
      radio.value = role;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(" " + ROLE_LABELS[role]));
      roles.appendChild(label);
    });
    var lockLabel = el("label", "studio-recipes-lock");
    var lock = el("input");
    lock.type = "checkbox";
    lock.dataset.recipesLock = "";
    lockLabel.appendChild(lock);
    lockLabel.appendChild(document.createTextNode(" 잠금"));
    var clear = el("button", "studio-recipes-clear", "고른 것 지우기");
    clear.type = "button";
    clear.dataset.recipesClear = "";
    head.appendChild(pick);
    head.appendChild(roles);
    head.appendChild(lockLabel);
    head.appendChild(clear);
    var notes = el("div", "studio-recipes-notes");
    notes.dataset.recipesNotes = "";
    var empty = el("p", "studio-recipes-empty", "미리보기에서 자모를 누르거나 위 목록에서 고르면, 그 칸을 그리는 방법(자동·원본·조립식)을 나란히 견줍니다.");
    empty.dataset.recipesEmpty = "";
    var holder = el("ol", "studio-recipes-list");
    holder.dataset.recipesCandidates = "";
    holder.setAttribute("aria-label", "후보");
    var bindings = el("div", "studio-recipes-bindings");
    bindings.dataset.recipesBindings = "";
    bindings.hidden = true;
    var status = el("p", "studio-recipes-message");
    status.dataset.recipesMessage = "";
    status.setAttribute("role", "status");
    var fold = el("details", "studio-recipes-fold");
    fold.dataset.recipesFold = "";
    fold.open = opened;
    var line = el("summary", "studio-recipes-line");
    line.appendChild(el("span", "studio-recipes-line-title", "조립식 견주기"));
    var brief = el("span", "studio-recipes-brief");
    brief.dataset.recipesBrief = "";
    line.appendChild(brief);
    var body = el("div", "studio-recipes-body");
    body.appendChild(head);
    body.appendChild(notes);
    body.appendChild(empty);
    body.appendChild(holder);
    body.appendChild(bindings);
    fold.appendChild(line);
    fold.appendChild(body);
    section.appendChild(fold);
    section.appendChild(status);
    view = { fold: fold, brief: brief, select: select, roles: roles, lock: lock, lockLabel: lockLabel, clear: clear, notes: notes, empty: empty,
      list: holder, bindings: bindings, status: status };
    fold.addEventListener("toggle", function () {
      if (fold.open !== opened) {
        writeOpen(fold.open);
      }
      section.dataset.recipesOpen = String(fold.open);
      if (fold.open) {
        scheduleRefresh();
      } else {
        folded();
      }
    });
    bind(section);
  }

  function makeRow() {
    var item = el("li", "studio-recipes-candidate");
    var top = el("div", "studio-recipes-candidate-head");
    var title = el("strong", "studio-recipes-candidate-title");
    var choose = el("button", "studio-recipes-choose", "고르기");
    choose.type = "button";
    choose.dataset.recipesChoose = "";
    top.appendChild(title);
    top.appendChild(choose);
    var help = el("small", "studio-recipes-candidate-help");
    var stage = el("div", "studio-recipes-stage");
    var root = stage.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = Studio.coreHref();
    var host = document.createElement("font-kku");
    host.setAttribute("size", SIZE);
    host.setAttribute("wrap-unit", "glyph");
    host.dataset.studioRecipes = "";
    root.appendChild(link);
    root.appendChild(host);
    var summary = el("output", "studio-recipes-summary");
    summary.dataset.recipesSummary = "";
    item.appendChild(top);
    item.appendChild(help);
    item.appendChild(stage);
    item.appendChild(summary);
    var row = { item: item, title: title, choose: choose, help: help, stage: stage, root: root, host: host, summary: summary, text: "" };
    link.addEventListener("load", function () { drawHost(row); }, { once: true });
    root.addEventListener("font-kku:render", scheduleRead);
    Studio.addPreviewRoot(root, [chrome]);
    return row;
  }

  function ensureRows(count) {
    while (rows.length < count) {
      var row = makeRow();
      rows.push(row);
      view.list.appendChild(row.item);
    }
  }

  function drawHost(row) {
    if (!row.text || !row.name || !Studio.state.fontId) {
      return;
    }
    row.host.setAttribute("font", Studio.state.fontId);
    row.host.style.setProperty("--fy-design", row.name);
    FontKku.render(row.host, { text: row.text });
  }

  /* 후보 줄을 비운다 — 이름을 돌려주기 전에 떼어 낸다(지운 이름을 그리지 않게) */
  function blankRow(row) {
    row.name = null;
    if (row.text) {
      row.text = "";
      row.host.style.removeProperty("--fy-design");
      FontKku.render(row.host, { text: "" });
    }
  }

  function renderRow(row, cand, text, slotLocked) {
    row.item.hidden = false;
    row.item.dataset.recipesCandidate = cand.id;
    setData(row.item, { kind: cand.kind, active: cand.active, disabled: Boolean(cand.refused || cand.error), reason: cand.code || "",
      result: null, status: cand.refused ? "refused" : cand.error ? "invalid" : null, recipe: null, source: null, method: null,
      design: cand.name || "", trace: null });
    row.title.textContent = cand.label;
    row.help.textContent = cand.help;
    row.choose.dataset.recipesChoose = cand.id;
    row.choose.hidden = cand.kind === "current";
    row.choose.textContent = cand.active ? "고름" : "고르기";
    row.choose.setAttribute("aria-pressed", String(Boolean(cand.active)));
    row.choose.disabled = Boolean(cand.refused || cand.error || cand.active || slotLocked);
    if (cand.refused || cand.error || !cand.name) {
      row.stage.hidden = true;
      blankRow(row);
      row.summary.textContent = cand.refused ? "고를 수 없음 — " + cand.reason : "등록하지 못함 — " + (cand.error || "이름 없음");
      return;
    }
    row.stage.hidden = false;
    row.summary.textContent = "그리는 중…";
    row.name = cand.name;
    row.text = text;
    drawHost(row);
  }

  // ── 기록 읽기 ────────────────────────────────────────────────────────

  function nodeSlot(node) {
    if (node.hasAttribute("data-fy-standalone")) {
      return { jamo: node.getAttribute("data-fy-standalone"), role: "standalone" };
    }
    return targetOf(node);
  }

  /* 고른 칸에 드는 노드를 글자 색으로 */
  function markTargets(host) {
    Array.prototype.forEach.call(host.querySelectorAll('[part~="jamo"], [part="content"][data-fy-standalone]'), function (node) {
      var slot = nodeSlot(node);
      var hit = Boolean(slot) && slot.jamo === target.jamo && (target.role === null || slot.role === target.role);
      node.classList.toggle("studio-recipes-hit", hit);
    });
  }

  function worstIdentity(requests) {
    var order = ["fallback-suspected", "unverified", "verified"];
    var found = null;
    requests.forEach(function (request) {
      var at = order.indexOf(request.identity);
      if (at >= 0 && (found === null || at < order.indexOf(found))) {
        found = request.identity;
      }
    });
    return found;
  }

  var STATUS_ORDER = ["ok", "pending", "degraded", "error"];

  function worstStatus(requests) {
    return requests.reduce(function (worst, request) {
      return STATUS_ORDER.indexOf(request.status) > STATUS_ORDER.indexOf(worst) ? request.status : worst;
    }, "ok");
  }

  function piecesOf(requests) {
    var seen = {};
    return requests.filter(function (request) {
      var key = request.path.length === 1 ? request.path[0] : null;
      var keep = key !== null && !seen[key];
      if (keep) {
        seen[key] = true;
      }
      return keep;
    }).map(function (request) {
      return { path: request.path[0], jamo: request.jamo, source: request.source, result: request.result, status: request.status };
    });
  }

  /* 후보 하나의 읽기 — 미리보기 기록에서 그 칸의 맨 위 요청(조각 경로 []). 합자 모음·겹받침을 조각 둘로 찍으면(고정 배치, 네모
   * 문맥의 머리 음절) 맨 위 요청이 없다: 그 역할의 조각 요청(경로 한 마디 — 견줄 글에서 그 역할은 대상 자모뿐)을 모으고, 묶음
   * (방법·조립식·소스)은 planJamo로 */
  function readCandidate(row, cand) {
    var host = row.host;
    var status = host.dataset.fyDesignStatus || "";
    if (status === UNSUPPORTED) {
      return { state: "unsupported", text: "이 글꼴은 디자인을 받지 않음 (" + UNSUPPORTED + ")" };
    }
    if (host.dataset.fyDesign !== cand.name) {
      return { state: "pending", text: "디자인이 아직 그려지지 않음" + (status ? " — " + status : "") };
    }
    var role = readRole();
    var trace = FontKku.traceOf(host);
    var nodes = trace ? trace.nodes : [];
    var found = null;
    var requests = [];
    nodes.some(function (node) {
      return node.requests.some(function (request) {
        if (request.path.length === 0 && request.jamo === target.jamo && (role === null || request.role === role)) {
          found = request;
          requests = node.requests;
          return true;
        }
        return false;
      });
    });
    var from = "render";
    var split = [];
    if (!found) {
      nodes.forEach(function (node) {
        node.requests.forEach(function (request) {
          if (request.path.length === 1 && role !== null && request.role === role) {
            split.push(request);
          }
        });
      });
      try {
        var plan = FontKku.planJamo(target.jamo, { design: cand.name, role: role || undefined });
        found = plan.trace[0] || null;
        requests = split.length ? split : plan.trace;
        from = split.length ? "split" : "plan";
      } catch (error) {
        return { state: "error", text: errorText(error) };
      }
    }
    if (!found) {
      return { state: "error", text: "기록이 없음" };
    }
    var info = {
      state: "read", from: from, result: found.result, status: found.status, recipe: found.recipe, source: found.source,
      method: found.method, rules: found.rules.slice(), diagnostic: found.diagnostic, identity: worstIdentity(requests),
      pieces: piecesOf(requests)
    };
    if (from === "split") {
      /* 조각으로 찍은 칸 — 묶음의 조립식(없으면 기본 조립식)으로 조합한 셈. 상태는 가장 나쁜 조각 */
      info.result = "composed";
      info.recipe = found.recipe || Rules.defaultRecipe(target.jamo);
      info.status = worstStatus(split);
      info.diagnostic = split.map(function (request) { return request.diagnostic; }).filter(Boolean)[0] || null;
    }
    return info;
  }

  function summaryText(info) {
    if (info.state !== "read") {
      return info.text;
    }
    var parts = [(METHOD_LABELS[info.method] || info.method) + (info.recipe ? " " + info.recipe : "") + " → " +
      (RESULT_LABELS[info.result] || info.result), "소스 " + info.source];
    if (info.pieces.length) {
      parts.push("조각 " + info.pieces.map(function (piece) {
        return piece.path + ":" + piece.jamo + "@" + piece.source + (piece.status !== "ok" ? "(" + (STATUS_LABELS[piece.status] || piece.status) + ")" : "");
      }).join(" "));
    }
    if (info.status !== "ok") {
      parts.push(STATUS_LABELS[info.status] || info.status);
    }
    if (info.diagnostic) {
      parts.push(info.diagnostic);
    }
    if (info.identity === "fallback-suspected") {
      parts.push("대체 글꼴 의심");
    }
    if (info.rules.length) {
      parts.push("규칙 " + info.rules.join(", "));
    }
    return parts.join(" · ") + (info.from === "split" ? " (조각으로 나눠 찍는 칸)" : info.from === "plan" ? " (그린 노드 없음 — 조립 계획)" : "");
  }

  function scheduleRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(readAll, READ_DELAY);
  }

  function readAll() {
    readTimer = null;
    if (!target || !view) {
      return;
    }
    var unsupported = 0;
    var drawn = 0;
    list.forEach(function (cand, index) {
      var row = rows[index];
      if (!row || !row.name || cand.refused || cand.error) {
        return;
      }
      drawn += 1;
      var info = readCandidate(row, cand);
      cand.read = info;
      if (info.state === "unsupported") {
        unsupported += 1;
      }
      setData(row.item, info.state === "read" ? { result: info.result, status: info.status, recipe: info.recipe || "", source: info.source,
        method: info.method, trace: info.from } : { result: null, status: info.state, recipe: null, source: null, method: null, trace: null });
      row.summary.textContent = summaryText(info);
      markTargets(row.host);
    });
    view.notes.querySelectorAll('[data-note="unsupported"]').forEach(function (node) { node.remove(); });
    if (drawn && unsupported === drawn) {
      addNote("unsupported", "미리보기 글꼴이 디자인을 받지 않아 후보를 그리지 못합니다 — sebul·gothic 같은 기본 제공 글꼴에서 견주세요.");
    }
  }

  // ── 그리기 ──────────────────────────────────────────────────────────

  function shown() {
    return Boolean(panel) && !panel.hidden && !(mainBox && mainBox.hidden);
  }

  function scheduleRefresh() {
    if (!refreshTimer) {
      refreshTimer = setTimeout(refresh, 0);
    }
  }

  function locked() {
    if (!target) {
      return false;
    }
    return Rules.isLocked(design.json(), { jamo: target.jamo, role: target.role });
  }

  function addNote(code, text) {
    var note = el("p", "studio-recipes-note", text);
    note.dataset.note = code;
    view.notes.appendChild(note);
  }

  function renderNotes(json) {
    view.notes.textContent = "";
    var layout = Design.layoutState(json, profiles());
    var compound = target.jamo && Design.COMPOUND_MEDIALS.indexOf(target.jamo) >= 0 && (target.role === null || target.role === "medial");
    if (layout.kind === "fixed" && compound) {
      var recipe = Rules.recipesFor(target.jamo)[0];
      addNote("fixed-compound", "고정 배치는 " + target.jamo + "을 조각 둘(" + recipe.parts.map(function (part) { return part.jamo; }).join(" + ") +
        ")로 찍습니다 — 원본(통째)은 고를 수 없고, 조합의 조각마다 소스를 고릅니다.");
    }
    if (layout.kind === "square") {
      addNote("square-context", "네모 문맥 — 모음 모양·받침에 따른 문맥 규칙은 고급의 '문맥 규칙' 탭에서 고칩니다. 여기서는 역할·자모 칸만 고릅니다.");
    }
    if (json.mode === "primitive") {
      addNote("primitive", "원소 재료 — 그릴 원본이 없어 자동과 조립식만 견줍니다.");
    }
    if (locked()) {
      addNote("locked", "잠긴 칸 — 자동 섞기가 건너뛰고, 여기서도 바꾸지 않습니다. 바꾸려면 잠금을 푸세요.");
    }
  }

  function renderHead(json) {
    view.select.value = target ? target.jamo : "";
    var allowed = target ? rolesOf(target.jamo) : [];
    Array.prototype.forEach.call(view.roles.querySelectorAll('input[name="recipes-role"]'), function (radio) {
      radio.disabled = !target || allowed.indexOf(radio.value) < 0;
      radio.checked = Boolean(target) && radio.value === roleKey(target.role);
    });
    var lock = view.lock;
    if (!target) {
      lock.checked = false;
      lock.disabled = true;
      view.clear.disabled = true;
      view.lockLabel.title = "";
      return;
    }
    var slot = { jamo: target.jamo, role: target.role };
    var exact = Rules.locks(json).some(function (entry) {
      return entry.jamo === slot.jamo && (entry.role || null) === slot.role && !entry.part;
    });
    var covered = Rules.isLocked(json, slot);
    lock.checked = covered;
    /* 더 넓은 잠금(역할 없는 자모 잠금)이 덮으면 여기서는 풀 수 없다 */
    lock.disabled = covered && !exact;
    view.lockLabel.title = covered && !exact ? target.jamo + "의 모든 역할 잠금이 덮습니다 — 역할 '모든 역할'에서 푸세요" :
      "잠그면 자동 섞기(글꼴 팔레트)가 이 칸을 건너뜁니다";
    view.clear.disabled = covered || Rules.getChoice(json, slot.jamo, slot.role).origin === "none";
  }

  function bindingOptions(select, values) {
    select.textContent = "";
    values.forEach(function (entry) {
      var option = el("option", "", entry.label);
      option.value = entry.value;
      option.disabled = Boolean(entry.disabled);
      if (entry.title) {
        option.title = entry.title;
      }
      select.appendChild(option);
    });
  }

  /* 고른 조립식의 조각마다 소스·방법(같은 edit에서 apply.bindings로) */
  function renderBindings(json) {
    var box = view.bindings;
    box.textContent = "";
    var choice = target ? Rules.getChoice(json, target.jamo, target.role) : null;
    var recipe = choice && choice.method === "compose" ? choice.recipe : null;
    var parts = recipe ? (Rules.partsOf(recipe) || []).filter(function (part) { return part.jamo !== undefined; }) : [];
    box.hidden = !parts.length;
    box.dataset.recipe = recipe || "";
    if (!parts.length) {
      return;
    }
    var kind = json.mode;
    var sources = Object.keys(json.sources || {}).filter(function (id) { return json.sources[id] && json.sources[id].kind === kind; });
    var heading = el("p", "studio-recipes-bindings-title", "조각 binding — " + recipe + " (" + KIND_LABELS[kind] + " 소스)");
    box.appendChild(heading);
    var off = locked();
    parts.forEach(function (part) {
      var value = choice.bindings && choice.bindings[part.id] || {};
      var line = el("div", "studio-recipes-binding");
      line.dataset.recipesBinding = part.id;
      line.appendChild(el("span", "studio-recipes-binding-part", part.id + " · " + part.jamo));
      var source = el("select");
      source.dataset.recipesBindingSource = "";
      source.setAttribute("aria-label", part.id + " 소스");
      bindingOptions(source, [{ value: "", label: "소스: 물려받음" }].concat(sources.map(function (id) {
        var entry = json.sources[id];
        return { value: id, label: "소스: " + id + (entry.family ? " (" + entry.family + (entry.weight ? " " + entry.weight : "") + ")" :
          entry.assetSet ? " (" + entry.assetSet + ")" : "") };
      })));
      if (value.source && sources.indexOf(value.source) < 0) {
        bindingOptions(source, Array.prototype.map.call(source.options, function (option) { return { value: option.value, label: option.textContent }; })
          .concat([{ value: value.source, label: "소스: " + value.source + " (재료가 다름)" }]));
      }
      source.value = value.source || "";
      var method = el("select");
      method.dataset.recipesBindingMethod = "";
      method.setAttribute("aria-label", part.id + " 방법");
      bindingOptions(method, [{ value: "", label: "방법: 물려받음" }, { value: "auto", label: "방법: 자동" },
        { value: "direct", label: "방법: 원본", disabled: kind === "primitive", title: kind === "primitive" ? "원소 재료에는 원본이 없음" : "" }]);
      method.value = value.method || "";
      source.disabled = off;
      method.disabled = off;
      line.appendChild(source);
      line.appendChild(method);
      box.appendChild(line);
    });
  }

  function renderMessage() {
    view.status.textContent = message.text;
    view.status.dataset.tone = message.tone;
  }

  function hideRows(from) {
    rows.slice(from).forEach(function (row) {
      row.item.hidden = true;
      blankRow(row);
    });
  }

  /* 접힌 한 줄 — 고른 칸과 그 칸에 적힌 것(그리지 않고 디자인 JSON에서) */
  function renderBrief(json) {
    var panelData = { recipesOpen: String(view.fold.open) };
    setData(panel, panelData);
    if (!target) {
      view.brief.textContent = "미리보기에서 자모를 고르면 그 칸의 자동·원본·조립식을 견줍니다";
      return;
    }
    var slot = { jamo: target.jamo, role: target.role };
    var choice = Rules.getChoice(json, slot.jamo, slot.role);
    var picked = activeId(choice);
    var what = picked === null ? (choice.source ? "소스 " + choice.source : "고른 것 없음 — 기본을 따름")
      : (picked === "auto" ? "자동" : picked === "direct" ? "원본" : "조합 " + picked) + (choice.source ? " · 소스 " + choice.source : "");
    var bound = choice.bindings ? Object.keys(choice.bindings).length : 0;
    var count = Rules.recipesFor(slot.jamo).length;
    view.brief.textContent = slotLabel(slot) + " · " + what + (bound ? " · 조각 binding " + bound : "") +
      (Rules.isLocked(json, slot) ? " · 잠금" : "") + (count ? " · 조립식 " + count : "");
  }

  /* 접으면 그리지 않는다 — 줄을 비우고 임시 이름을 돌려준다(대상은 둔다) */
  function folded() {
    hideRows(0);
    Object.keys(leases).forEach(releaseLease);
    list = [];
  }

  /* 지금 대상·디자인으로 후보를 다시 만든다 — 보이지 않으면 미뤘다가 보일 때, 접혀 있으면 한 줄만 */
  function refresh() {
    refreshTimer = null;
    if (!view) {
      return;
    }
    if (!target) {
      folded();
      renderEmpty();
      return;
    }
    if (!shown()) {
      stale = true;
      return;
    }
    stale = false;
    var json = design.json();
    lastFont = Studio.state.fontId;
    panel.dataset.recipesState = "ready";
    panel.dataset.recipesJamo = target.jamo;
    panel.dataset.recipesRole = roleKey(target.role);
    view.empty.hidden = true;
    renderHead(json);
    renderBrief(json);
    renderNotes(json);
    renderMessage();
    if (!view.fold.open) {
      folded();
      view.bindings.hidden = true;
      return;
    }
    var next = candidatesFor(json);
    next.forEach(leaseFor);
    var text = sampleText(target.jamo);
    ensureRows(next.length);
    list = next;
    var slotLocked = Rules.isLocked(json, { jamo: target.jamo, role: target.role });
    next.forEach(function (cand, index) { renderRow(rows[index], cand, text, slotLocked); });
    hideRows(next.length);
    /* 남는 후보의 이름은 이미 바꿔 썼다 — 없어진 후보의 이름만 돌려준다(줄을 다른 이름으로 옮긴 뒤) */
    var keep = {};
    next.forEach(function (cand) { keep[cand.id] = Boolean(cand.name) && cand.kind !== "current"; });
    Object.keys(leases).forEach(function (id) {
      if (!keep[id]) {
        releaseLease(id);
      }
    });
    renderBindings(json);
    scheduleRead();
  }

  function renderEmpty() {
    if (!view) {
      return;
    }
    panel.dataset.recipesState = "empty";
    delete panel.dataset.recipesJamo;
    delete panel.dataset.recipesRole;
    view.empty.hidden = false;
    view.notes.textContent = "";
    view.bindings.hidden = true;
    view.bindings.textContent = "";
    var json = design.json();
    renderHead(json);
    renderBrief(json);
    renderMessage();
  }

  /* 임시 이름을 모두 돌려준다(대상은 둔다 — 다시 보이면 다시 받는다) */
  function releaseAll() {
    rows.forEach(blankRow);
    Object.keys(leases).forEach(releaseLease);
    list.forEach(function (cand) { cand.name = null; });
    stale = true;
  }

  function mount() {
    if (panel) {
      return panel;
    }
    panel = Studio.f.mount("recipes", {
      label: "조립식·binding",
      onShow: function () { scheduleRefresh(); },
      onHide: function () { releaseAll(); }
    });
    build(panel);
    renderEmpty();
    return panel;
  }

  // ── 바꾸기 ──────────────────────────────────────────────────────────

  function refuse(code, text) {
    message = { text: "⚠ " + text, tone: "warn" };
    if (view) {
      renderMessage();
    }
    return Promise.resolve({ ok: false, design: design.json(), errors: [{ code: code, path: "", message: text }], impact: null, cancelled: false });
  }

  function run(label, mutate, done) {
    return design.edit(label, mutate).then(function (result) {
      message = result.ok ? { text: done, tone: "info" } : result.cancelled ? { text: label + " — 바꾸지 않았습니다.", tone: "info" }
        : { text: "⚠ " + label + " — 적용하지 못했습니다: " + (result.errors[0] ? result.errors[0].message : "오류"), tone: "error" };
      if (view) {
        renderMessage();
      }
      if (!result.ok && target) {
        scheduleRefresh(); // 바꾸지 않았으면 잠금 칸·binding 고르기를 디자인 그대로 되돌린다
      }
      return result;
    });
  }

  function needTarget() {
    return target ? null : refuse("STUDIO_RECIPES_NO_TARGET", "먼저 자모를 고르세요.");
  }

  function choose(id) {
    var waiting = needTarget();
    if (waiting) {
      return waiting;
    }
    if (id === "current") {
      return Promise.resolve({ ok: true, design: design.json(), errors: [], impact: null, cancelled: false, unchanged: true });
    }
    var json = design.json();
    var slot = { jamo: target.jamo, role: target.role };
    if (Rules.isLocked(json, slot)) {
      return refuse("STUDIO_RECIPES_LOCKED", slotLabel(slot) + "은 잠겨 있습니다 — 잠금을 풀고 고르세요.");
    }
    var cand = candidatesFor(json).filter(function (entry) { return entry.id === id; })[0];
    if (!cand) {
      return refuse("STUDIO_RECIPES_UNKNOWN", slotLabel(slot) + "에 " + JSON.stringify(id) + " 후보가 없습니다.");
    }
    if (cand.refused) {
      return refuse(cand.code, slotLabel(slot) + " " + cand.label + " — " + cand.reason);
    }
    var choice = choiceFor(id, Rules.getChoice(json, slot.jamo, slot.role));
    var name = cand.kind === "recipe" ? cand.recipe : cand.label;
    return run(slotLabel(slot) + " → " + name, function (draft) {
      return Rules.setChoice(draft, Object.assign({ jamo: slot.jamo, role: slot.role }, choice), { origin: "pick" });
    }, slotLabel(slot) + "을 " + cand.label + "(으)로 골랐습니다.");
  }

  /* 고른 조립식의 조각 하나 — value: { source?, method? }(준 키만 바꾸고, null·""이면 지운다) */
  function setBinding(part, value) {
    var waiting = needTarget();
    if (waiting) {
      return waiting;
    }
    var json = design.json();
    var slot = { jamo: target.jamo, role: target.role };
    var choice = Rules.getChoice(json, slot.jamo, slot.role);
    if (choice.method !== "compose" || !choice.recipe) {
      return refuse("STUDIO_RECIPES_NO_RECIPE", slotLabel(slot) + " — 먼저 조합(조립식)을 고르세요.");
    }
    if (Rules.isLocked(json, slot)) {
      return refuse("STUDIO_RECIPES_LOCKED", slotLabel(slot) + "은 잠겨 있습니다 — 잠금을 풀고 바꾸세요.");
    }
    if (Rules.bindableParts(choice.recipe).indexOf(part) < 0) {
      return refuse("STUDIO_RECIPES_PART", choice.recipe + "에 " + JSON.stringify(part) + " 조각이 없습니다.");
    }
    var input = value || {};
    var bindings = Design.clone(choice.bindings) || {};
    var entry = Object.assign({}, bindings[part] || {});
    ["source", "method"].forEach(function (key) {
      if (has(input, key)) {
        if (input[key] === null || input[key] === undefined || input[key] === "") {
          delete entry[key];
        } else {
          entry[key] = input[key];
        }
      }
    });
    if (Object.keys(entry).length) {
      bindings[part] = entry;
    } else {
      delete bindings[part];
    }
    var what = [entry.source ? "소스 " + entry.source : "", entry.method ? (METHOD_LABELS[entry.method] || entry.method) : ""].filter(Boolean).join(" ") ||
      "물려받음";
    return run(slotLabel(slot) + " " + choice.recipe + "." + part + " ← " + what, function (draft) {
      return Rules.setChoice(draft, { jamo: slot.jamo, role: slot.role, method: "compose", recipe: choice.recipe, bindings: bindings }, { origin: "pick" });
    }, slotLabel(slot) + "의 조각 " + part + "을 " + what + "(으)로 했습니다.");
  }

  function lock(on) {
    var waiting = needTarget();
    if (waiting) {
      return waiting;
    }
    var slot = { jamo: target.jamo, role: target.role };
    var value = on !== false;
    return run((value ? "잠금 " : "잠금 풀기 ") + slotLabel(slot), function (draft) {
      return Rules.setLock(draft, slot, value);
    }, slotLabel(slot) + (value ? "을 잠갔습니다 — 자동 섞기가 건너뜁니다." : "의 잠금을 풀었습니다."));
  }

  function clearChoice() {
    var waiting = needTarget();
    if (waiting) {
      return waiting;
    }
    var slot = { jamo: target.jamo, role: target.role };
    if (Rules.isLocked(design.json(), slot)) {
      return refuse("STUDIO_RECIPES_LOCKED", slotLabel(slot) + "은 잠겨 있습니다 — 잠금을 풀고 지우세요.");
    }
    return run(slotLabel(slot) + " 고른 것 지우기", function (draft) {
      return Rules.clearChoice(draft, slot.jamo, slot.role);
    }, slotLabel(slot) + "에 고른 것을 지웠습니다 — 역할 기본·디자인 기본을 따릅니다.");
  }

  // ── 대상 ────────────────────────────────────────────────────────────

  function setTarget(jamo, role) {
    var next = { jamo: jamo, role: role === "any" ? null : role };
    var same = Boolean(target) && target.jamo === next.jamo && target.role === next.role;
    target = next;
    if (!same) {
      message = { text: "", tone: "info" };
    }
    return !same;
  }

  function onSelect(node, force) {
    var selection = Studio.state.selection;
    var key = selection ? [selection.glyph, selection.source, selection.pos, selection.jamo].join("|") : "";
    /* 미리보기를 다시 그릴 때마다 같은 선택이 다시 온다 — 사용자가 고른 자모(목록)를 덮지 않게 바뀐 선택만 */
    if (!force && key === lastSelect) {
      return;
    }
    lastSelect = key;
    var slot = node ? targetOf(node) : null;
    if (!slot) {
      return;
    }
    mount();
    if (setTarget(slot.jamo, slot.role) || stale) {
      scheduleRefresh();
    }
  }

  function bind(section) {
    section.addEventListener("change", function (event) {
      var node = event.target;
      if (node.matches("[data-recipes-target]")) {
        if (node.value) {
          setTarget(node.value, defaultRole(node.value));
        } else {
          target = null;
        }
        scheduleRefresh();
      } else if (node.matches('input[name="recipes-role"]')) {
        if (target && setTarget(target.jamo, node.value)) {
          scheduleRefresh();
        }
      } else if (node.matches("[data-recipes-lock]")) {
        lock(node.checked);
      } else if (node.matches("[data-recipes-binding-source], [data-recipes-binding-method]")) {
        var part = node.closest("[data-recipes-binding]").dataset.recipesBinding;
        setBinding(part, node.matches("[data-recipes-binding-source]") ? { source: node.value } : { method: node.value });
      }
    });
    section.addEventListener("click", function (event) {
      var button = event.target.closest("[data-recipes-choose]");
      if (button && !button.disabled) {
        choose(button.dataset.recipesChoose);
      } else if (event.target.closest("[data-recipes-clear]")) {
        clearChoice();
      }
    });
  }

  // ── 훅 ──────────────────────────────────────────────────────────────

  Studio.on("select", function (node) { onSelect(node, false); });

  /* 미리보기를 눌러 고르면 같은 자모를 다시 눌러도 그 자모로(목록에서 고른 자모를 바꿔 놓았을 때) */
  if (previewBox) {
    previewBox.addEventListener("pointerdown", function (event) {
      var node = Studio.selected();
      if (node && typeof event.composedPath === "function" && event.composedPath().indexOf(node) >= 0) {
        onSelect(node, true);
      }
    });
  }

  /* 글꼴이 바뀌면 후보도 그 글꼴로 */
  Studio.on("render", function () {
    if (target && view && Studio.state.fontId !== lastFont) {
      scheduleRefresh();
    }
  });

  design.on("change", function () {
    if (target && view) {
      scheduleRefresh();
    }
  });

  /* 디자인 본문을 접으면 임시 이름을 돌려주고, 펴면 미뤄 둔 후보를 그린다 */
  if (mainBox && typeof MutationObserver === "function") {
    new MutationObserver(function () {
      if (mainBox.hidden) {
        if (view && Object.keys(leases).length) {
          releaseAll();
        }
      } else if (stale && target && shown()) {
        scheduleRefresh();
      }
    }).observe(mainBox, { attributes: true, attributeFilter: ["hidden"] });
  }

  function busy() {
    return Boolean(refreshTimer || readTimer);
  }

  design.addBusy(busy);

  function whenIdle() {
    return new Promise(function (resolve) {
      (function poll() {
        if (busy()) {
          setTimeout(poll, 16);
        } else {
          resolve();
        }
      })();
    });
  }

  function snapshot() {
    return list.map(function (cand, index) {
      var row = rows[index];
      var read = cand.read && cand.read.state === "read" ? cand.read : null;
      return {
        id: cand.id, kind: cand.kind, label: cand.label, active: Boolean(cand.active), disabled: Boolean(cand.refused || cand.error),
        code: cand.code || null, reason: cand.reason || cand.error || null, name: cand.name || null,
        state: cand.read ? cand.read.state : null, result: read ? read.result : null, status: read ? read.status : null,
        recipe: read ? read.recipe : null, source: read ? read.source : null, method: read ? read.method : null,
        pieces: read ? Design.clone(read.pieces) : [], summary: row ? row.summary.textContent : ""
      };
    });
  }

  Studio.recipes = {
    /* 자모 칸을 열고 탭을 보인다 — 후보를 다 읽은 뒤 candidates()로 풀린다. role: any|initial|medial|final(없으면 그 자모의 첫 역할) */
    open: function (jamo, role) {
      var text = compat(String(jamo || ""));
      if (Catalog.modernShapes51.indexOf(text) < 0) {
        return Promise.reject(new TypeError("font-studio: recipes.open needs a modern compatibility jamo (got " + JSON.stringify(jamo) + ")"));
      }
      var key = role === undefined || role === null ? defaultRole(text) : role;
      if (ROLES.indexOf(key) < 0) {
        return Promise.reject(new TypeError("font-studio: recipes role is any, initial, medial or final (got " + JSON.stringify(role) + ")"));
      }
      mount();
      setTarget(text, key);
      writeOpen(true);
      view.fold.open = true;
      Studio.f.show("recipes");
      clearTimeout(refreshTimer);
      refreshTimer = null;
      refresh();
      return whenIdle().then(snapshot);
    },
    /* 대상을 비우고 임시 이름을 모두 돌려준다 */
    close: function () {
      target = null;
      releaseAll();
      list = [];
      if (view) {
        hideRows(0);
        renderEmpty();
      }
      return true;
    },
    target: function () { return target ? { jamo: target.jamo, role: roleKey(target.role) } : null; },
    candidates: snapshot,
    choose: choose,
    setBinding: setBinding,
    lock: lock,
    clear: clearChoice,
    /* 지금 빌린 임시 이름(후보 id → 이름) */
    leases: function () {
      var out = {};
      Object.keys(leases).forEach(function (id) { out[id] = leases[id].name; });
      return out;
    },
    sampleText: sampleText,
    busy: busy
  };
})();
