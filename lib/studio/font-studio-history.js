/* font-studio-history.js — 편집 기록·영향 목록 (설계 v1.2 §13.6, PLAN-HANGUL-001 F9)
 *
 * 둘을 맡는다.
 * (1) 편집 기록 칸([data-studio-f=history]): 하나의 기록(FontStudio.timeline, PLAN-STUDIO-002 S2 — 글꼴 CSS·디자인·그림·
 *     자소판·검수 편집)을 ol[data-history-list]로 보인다 — 항목마다 이름과 갈래·행위자·지난 시간, 지금 자리(data-current), 되돌린 항목
 *     (data-undone). 항목을 누르면 그 자리로(timeline.jump), 맨 위 "처음 상태"는 첫 편집 전으로. 되돌리기·다시 단추는 Cmd/Ctrl+Z와
 *     같다(전체의 마지막 일). 칸은 첫 기록이 생길 때 붙인다(맨 작업실 첫 화면은 그대로 — §13.2). 모든 페이지에 보이는 칸(디자인 본문
 *     밖, tab: false)이라 탭 차례를 빼앗지 않는다. 접힌 한 줄(개수 · 지금 항목)이 기본이고 펼침은 보는 사람마다 기억한다. 지난 시간
 *     타이머는 펼쳐 둔 동안만 돈다. 적용하지 못한 디자인 편집은 기록에 남지 않는다(§13.6) — 칸이 그 사실을 함께 보인다.
 * (2) 영향 목록: design.setImpactHandler — 영향을 묻는 편집(edit의 opts.impact)마다 FontStudioDesignRules.impactOf로 바꾸기 전·후를
 *     견준다. 오류·원소로 떨어짐·그린 원본을 잃음이 있거나, 빼는 소스를 쓰던 자모가 있으면 dialog[data-impact]로 묻고(취소하면
 *     디자인·참가자·기록 모두 그대로), 그 밖에는 묻지 않고 적용한 뒤 바뀐 자모 수를 알린다. JSON 적용처럼 묻지 않는 편집이 소스를
 *     빼면 막지 않고 알림 칸([data-impact-info])에 영향 목록을 보인다.
 * 영향 판정·문구는 DOM 없는 FontStudioHistoryModel(Node require 공용)이 맡는다.
 * FontStudio.history = { entries(), jump(id), impactOpen(), impact(), answer(ok), info(), open(on), refresh() } — entries·jump는
 * 하나의 기록의 것이다.
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("../authoring/font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-history: load authoring/font-studio-util.js first");
  }
  var element = Util.element;

  // ── 영향 판정·문구(DOM 없음) ──────────────────────────────────────────

  /* 묻는 영향 — 이것이 하나라도 있으면 적용 전에 묻는다 */
  var SEVERE = ["error", "primitive", "lost-original"];
  var LIST_LIMIT = 60;
  var EFFECT_TEXT = Object.assign({}, Util.IMPACT_TEXT);
  var EFFECTS = Util.IMPACT_EFFECTS;
  var ROLE_LABELS = Util.ROLE_LABELS;
  var METHOD_LABELS = { auto: "자동", direct: "원본", compose: "조합" };
  var RESULT_LABELS = { direct: "원본 그대로", composed: "조합", strokes: "획(원소)", primitive: "원소로 대체", none: "그리지 않음" };
  var STATUS_LABELS = { pending: "받는 중", degraded: "덜 그려짐", error: "오류" };

  function own(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  /* 바꾸기 전에 있고 뒤에 없는 소스 id(차례대로) */
  function removedSources(before, after) {
    var next = after && after.sources && typeof after.sources === "object" ? after.sources : {};
    var prior = before && before.sources && typeof before.sources === "object" ? before.sources : {};
    return Object.keys(prior).filter(function (id) { return !own(next, id); }).sort();
  }

  /* 물을까 — 계산 실패, 심각한 영향(SEVERE), 또는 소스를 빼는데 바뀌는 자모가 있음(그 소스를 쓰던 자모의 고른 값이 사라진다) */
  function blocking(rows, removed, error) {
    var list = rows || [];
    return Boolean(error) || list.some(function (row) { return SEVERE.indexOf(row.effect) >= 0; }) ||
      ((removed || []).length > 0 && list.length > 0);
  }

  /* 바뀌는 자모 수(역할이 달라도 한 자모) */
  function jamoCount(rows) {
    var seen = {};
    (rows || []).forEach(function (row) { seen[row.jamo] = true; });
    return Object.keys(seen).length;
  }

  /* "빼는 소스: B — 2개 자모가 바뀜(자리 3곳 · 소스 바뀜 3)" — applied면 "뺀 소스" */
  function summaryText(rows, removed, error, applied) {
    if (error) {
      return "영향을 계산하지 못했습니다 — " + error;
    }
    var list = rows || [];
    var counts = {};
    list.forEach(function (row) { counts[row.effect] = (counts[row.effect] || 0) + 1; });
    var parts = EFFECTS.filter(function (effect) { return counts[effect]; }).map(function (effect) {
      return EFFECT_TEXT[effect] + " " + counts[effect];
    });
    var jamo = jamoCount(list);
    var head = removed && removed.length ? (applied ? "뺀" : "빼는") + " 소스: " + removed.join(", ") + " — " : "";
    if (!list.length) {
      return head + "바뀌는 자모 없음";
    }
    return head + jamo + "개 자모가 바뀜(" + (list.length !== jamo ? "자리 " + list.length + "곳 · " : "") + parts.join(" · ") + ")";
  }

  /* 영향 줄 한쪽: "B · 조합 double-bieup · 조합" (+ 상태·진단) */
  function sideText(summary) {
    if (!summary) {
      return "-";
    }
    var how = (METHOD_LABELS[summary.method] || summary.method || "-") + (summary.recipe ? " " + summary.recipe : "");
    return (summary.source || "소스 없음") + " · " + how + " · " + (RESULT_LABELS[summary.result] || summary.result || "-") +
      (summary.status && summary.status !== "ok" ? " (" + (STATUS_LABELS[summary.status] || summary.status) + ")" : "") +
      (summary.diagnostic ? " " + summary.diagnostic : "");
  }

  function roleText(role) {
    return ROLE_LABELS[role] || "모든 역할";
  }

  /* 지난 시간 — 방금 · n초 전 · n분 전 · n시간 전 · 날짜 */
  function ago(at, now) {
    var seconds = Math.max(0, Math.round(((now === undefined ? Date.now() : now) - at) / 1000));
    if (seconds < 10) {
      return "방금";
    }
    if (seconds < 60) {
      return seconds + "초 전";
    }
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return minutes + "분 전";
    }
    var hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + "시간 전";
    }
    var date = new Date(at);
    return (date.getMonth() + 1) + "월 " + date.getDate() + "일";
  }

  /* 영향 처리기가 받는 ctx({ before: { design }, after: { design }, sets })로 impactOf를 부른다. { rows, removed, error } */
  function impactFor(ctx, Rules, runtime) {
    var before = ctx && ctx.before ? ctx.before.design : null;
    var after = ctx && ctx.after ? ctx.after.design : null;
    var removed = removedSources(before, after);
    try {
      return { rows: Rules.impactOf({ before: before, after: after, sets: ctx.sets || undefined }, runtime), removed: removed, error: null };
    } catch (error) {
      return { rows: [], removed: removed, error: error && error.message ? error.message : String(error) };
    }
  }

  var Model = {
    SEVERE: SEVERE,
    LIST_LIMIT: LIST_LIMIT,
    EFFECT_TEXT: EFFECT_TEXT,
    removedSources: removedSources,
    blocking: blocking,
    jamoCount: jamoCount,
    summaryText: summaryText,
    sideText: sideText,
    roleText: roleText,
    ago: ago,
    impactFor: impactFor
  };
  global.FontStudioHistoryModel = Model;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Model;
  }
  if (typeof document === "undefined") {
    return;
  }

  // ── 화면 ──────────────────────────────────────────────────────────────

  var Studio = global.FontStudio;
  var Rules = global.FontStudioDesignRules;
  var Design = global.FontStudioDesign;
  var FontKku = global.FontKku;
  if (!Studio || !Studio.design || !Studio.f || !Studio.timeline || !Rules || !Design || !FontKku || typeof Rules.impactOf !== "function") {
    return;
  }

  var design = Studio.design;
  var timeline = Studio.timeline;
  var life = null; // 깨어 있는 동안의 ctx(f-shell 수명)
  var tickTimer = null;
  var section = document.querySelector("[data-studio-design]");
  var OPEN_KEY = "font-kku-studio-history-open";
  var TICK_MS = 15000;
  var panel = null;
  var opened = readOpen();
  var lastJson = design.json();
  var dialog = null;
  /* 열린 물음 { resolve, label, rows, removed } */
  var asking = null;
  /* 영향을 물은(또는 묻지 않고 넘긴) 편집이 곧 적용될 때 알림 칸에 쓸 것 { key, label, rows, removed, asked } */
  var accepted = null;
  var infoBox = null;
  var infoState = null;
  var infoTimer = null;

  /* 펼침 기억은 보는 사람의 편의 — 저장소가 막혀도 이번 화면에서는 그대로 */
  function readOpen() {
    return Util.readFlag(OPEN_KEY);
  }

  function writeOpen(value) {
    opened = Boolean(value);
    Util.writeFlag(OPEN_KEY, opened);
  }

  function button(text, attribute) {
    var node = element("button", null, text);
    node.type = "button";
    node.setAttribute(attribute, "");
    return node;
  }

  // ── 편집 기록 칸 ──────────────────────────────────────────────────────

  /* 하나의 기록의 줄 — 오래된 것부터, 되돌린 것은 뒤 */
  function entries() {
    var index = timeline.index();
    return timeline.entries().map(function (entry, at) {
      return { id: entry.id, label: entry.label, at: entry.time, current: at === index, undone: entry.state === "undone",
        kind: entry.kind, cause: entry.cause, actor: entry.actor ? Design.clone(entry.actor) : null, undoable: entry.undoable };
    });
  }

  /* 칸을 붙이고 뼈대를 만든다(한 번) */
  function ensurePanel() {
    if (panel) {
      return panel;
    }
    var holder = Studio.f.mount("history", { label: "편집 기록", tab: false, activate: activate, deactivate: deactivate });
    holder.classList.add("studio-history");
    holder.setAttribute("aria-label", "편집 기록");
    holder.textContent = "";
    var fold = element("details", "studio-history-fold");
    fold.dataset.historyFold = "";
    fold.open = opened;
    var summary = element("summary", "studio-history-summary");
    summary.appendChild(element("span", "studio-history-title", "편집 기록"));
    var count = element("output", "studio-history-count", "0");
    count.dataset.historyCount = "";
    summary.appendChild(count);
    var now = element("span", "studio-history-now");
    now.dataset.historyNow = "";
    summary.appendChild(now);
    fold.appendChild(summary);
    var body = element("div", "studio-history-body");
    var invalid = element("p", "studio-history-invalid",
      "⚠ 마지막 편집은 검사에 걸려 적용하지 않았고 기록에도 남기지 않았습니다 — 미리보기는 마지막 정상 디자인입니다.");
    invalid.dataset.historyInvalid = "";
    invalid.hidden = true;
    body.appendChild(invalid);
    var buttons = element("div", "studio-history-buttons");
    buttons.appendChild(button("되돌리기", "data-history-undo"));
    buttons.appendChild(button("다시", "data-history-redo"));
    body.appendChild(buttons);
    var list = element("ol", "studio-history-list");
    list.dataset.historyList = "";
    list.setAttribute("aria-label", "편집 기록 — 누르면 그 자리로");
    body.appendChild(list);
    var empty = element("p", "studio-history-empty", "기록이 없습니다 — 다른 글꼴·프로젝트·초안을 열면 기록을 비웁니다.");
    empty.dataset.historyEmpty = "";
    empty.hidden = true;
    body.appendChild(empty);
    fold.appendChild(body);
    holder.appendChild(fold);

    fold.addEventListener("toggle", function () {
      if (fold.open !== opened) {
        writeOpen(fold.open);
      }
      syncTicker();
    });
    holder.addEventListener("click", function (event) {
      var jump = event.target.closest("[data-history-jump]");
      if (jump) {
        if (jump.closest("li").dataset.current !== "true") {
          timeline.jump(jump.dataset.historyJump || null);
        }
      } else if (event.target.closest("[data-history-undo]")) {
        timeline.undo();
      } else if (event.target.closest("[data-history-redo]")) {
        timeline.redo();
      }
    });
    panel = holder;
    tick();
    return panel;
  }

  /* 지난 시간 타이머 — 칸이 깨어 있고(f-shell 수명) 목록을 펼쳐 둔 동안만 돈다. 접힌 한 줄에는 시각이 없다. 깰 때 한 번 고친다(D10) */
  function syncTicker() {
    var want = Boolean(life && life.active() && panel && panel.querySelector("[data-history-fold]").open);
    if (want && tickTimer === null) {
      tickTimer = life.setInterval(function () {
        life.work();
        tick();
      }, TICK_MS);
      tick();
    } else if (!want && tickTimer !== null) {
      if (life) {
        life.clearInterval(tickTimer);
      } else {
        clearInterval(tickTimer);
      }
      tickTimer = null;
    }
  }

  function activate(ctx) {
    life = ctx;
    tickTimer = null;
    syncTicker();
    tick();
  }

  function deactivate() {
    life = null;
    tickTimer = null; // ctx가 걷었다
  }

  var KIND_SHORT = { css: "CSS", design: "디자인", drawing: "그림", sheet: "자소판", review: "검수", action: "작업실", group: "묶음",
    remote: "받음" };

  function actorText(actor) {
    if (!actor || actor.kind !== "agent") {
      return "";
    }
    return "에이전트" + (actor.id ? " " + actor.id : "");
  }

  function row(entry, now) {
    var item = element("li", "studio-history-entry");
    if (entry.start) {
      item.dataset.historyStart = "";
    } else {
      item.dataset.historyEntry = entry.id;
    }
    item.dataset.current = String(entry.current);
    if (entry.undone) {
      item.dataset.undone = "";
    }
    var jump = element("button", "studio-history-jump");
    jump.type = "button";
    jump.dataset.historyJump = entry.start ? "" : entry.id;
    if (entry.current) {
      jump.setAttribute("aria-current", "step");
    }
    if (!entry.start) {
      var kind = element("span", "studio-history-kind", KIND_SHORT[entry.cause] || KIND_SHORT[entry.kind] || entry.kind || "");
      kind.dataset.historyKind = entry.cause || entry.kind || "";
      jump.appendChild(kind);
      item.dataset.kind = entry.kind || "";
      if (entry.undoable === false) {
        item.dataset.locked = "";
      }
    }
    jump.appendChild(element("span", "studio-history-label", entry.label || "(이름 없는 편집)"));
    if (!entry.start && actorText(entry.actor)) {
      var actor = element("span", "studio-history-actor", actorText(entry.actor));
      actor.dataset.historyActor = entry.actor.id || entry.actor.kind;
      jump.appendChild(actor);
    }
    if (!entry.start) {
      var time = element("time", "studio-history-time", ago(entry.at, now));
      time.dateTime = new Date(entry.at).toISOString();
      time.dataset.at = String(entry.at);
      time.title = new Date(entry.at).toLocaleString("ko-KR");
      jump.appendChild(time);
    }
    item.appendChild(jump);
    return item;
  }

  function render() {
    if (!panel) {
      return;
    }
    var list = entries();
    var index = timeline.index();
    var holder = panel.querySelector("[data-history-list]");
    var now = Date.now();
    holder.textContent = "";
    if (list.length) {
      holder.appendChild(row({ start: true, label: "처음 상태", current: index < 0 }, now));
    }
    list.forEach(function (entry) { holder.appendChild(row(entry, now)); });
    var current = list.filter(function (entry) { return entry.current; })[0];
    panel.querySelector("[data-history-count]").textContent = String(list.length);
    panel.querySelector("[data-history-now]").textContent = list.length ? "지금: " + (current ? current.label : "처음 상태") : "";
    panel.querySelector("[data-history-empty]").hidden = list.length > 0;
    var peek = timeline.peek();
    var undoButton = panel.querySelector("[data-history-undo]");
    var redoButton = panel.querySelector("[data-history-redo]");
    undoButton.disabled = !timeline.canUndo();
    redoButton.disabled = !timeline.canRedo();
    undoButton.title = peek.undo ? "되돌리기 — " + peek.undo + " (Ctrl+Z · ⌘Z)" : "되돌릴 것이 없습니다";
    redoButton.title = peek.redo ? "다시 — " + peek.redo + " (Shift+Ctrl+Z · ⌘⇧Z)" : "다시 할 것이 없습니다";
    syncState(design.status());
    panel.dataset.count = String(list.length);
    panel.dataset.index = String(index);
  }

  /* 적용하지 못한 편집(검사 실패·JSON 문법)이 남아 있는가 — 런타임 진단으로 invalid인 것은 편집 실패가 아니다 */
  function syncState(state) {
    if (panel) {
      panel.dataset.state = state || "";
      panel.querySelector("[data-history-invalid]").hidden = !(design.state && design.state.error);
    }
  }

  /* 지난 시간만 고친다 */
  function tick() {
    if (!panel || panel.hidden) {
      return;
    }
    var now = Date.now();
    Array.prototype.forEach.call(panel.querySelectorAll("time[data-at]"), function (time) {
      time.textContent = ago(Number(time.dataset.at), now);
    });
  }

  // ── 영향 목록 ─────────────────────────────────────────────────────────

  function fillList(list, rows) {
    list.textContent = "";
    rows.slice(0, LIST_LIMIT).forEach(function (entry) {
      var item = element("li", "studio-impact-row");
      item.dataset.jamo = entry.jamo;
      item.dataset.role = entry.role || "";
      item.dataset.effect = entry.effect;
      var effect = element("span", "studio-impact-effect", EFFECT_TEXT[entry.effect] || entry.effect);
      var target = element("strong", "studio-impact-target", entry.jamo + " " + roleText(entry.role));
      var change = element("span", "studio-impact-change");
      var before = element("span", "studio-impact-side", sideText(entry.before));
      before.dataset.side = "before";
      var after = element("span", "studio-impact-side", sideText(entry.after));
      after.dataset.side = "after";
      change.appendChild(before);
      change.appendChild(document.createTextNode(" → "));
      change.appendChild(after);
      item.appendChild(effect);
      item.appendChild(target);
      item.appendChild(change);
      list.appendChild(item);
    });
    if (rows.length > LIST_LIMIT) {
      var more = element("li", "studio-impact-more", "+" + (rows.length - LIST_LIMIT) + "곳 더");
      more.dataset.impactMore = String(rows.length - LIST_LIMIT);
      list.appendChild(more);
    }
    list.hidden = rows.length === 0;
  }

  /* 물음 칸 — 모달 dialog. 문서 끝에 둔다(접힌 디자인 본문 안에 두면 열어도 보이지 않는다) */
  function ensureDialog() {
    if (dialog) {
      return dialog;
    }
    dialog = element("dialog", "studio-impact");
    dialog.dataset.impact = "";
    dialog.setAttribute("aria-labelledby", "studio-impact-title");
    var title = element("h3", "studio-impact-title");
    title.id = "studio-impact-title";
    title.dataset.impactTitle = "";
    var summary = element("p", "studio-impact-summary");
    summary.dataset.impactSummary = "";
    var list = element("ul", "studio-impact-list");
    list.dataset.impactList = "";
    var buttons = element("div", "studio-impact-buttons");
    buttons.appendChild(button("취소 — 바꾸지 않음", "data-impact-cancel"));
    buttons.appendChild(button("그래도 적용", "data-impact-accept"));
    dialog.appendChild(title);
    dialog.appendChild(summary);
    dialog.appendChild(list);
    dialog.appendChild(buttons);
    dialog.addEventListener("click", function (event) {
      if (event.target.closest("[data-impact-accept]")) {
        settle(true);
      } else if (event.target.closest("[data-impact-cancel]")) {
        settle(false);
      }
    });
    /* Esc는 취소. close 사건은 늦게 올 수 있어(Chromium은 다음 그림 틀에) 다시 연 물음을 닫지 않게 닫힌 때만 본다 */
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      settle(false);
    });
    dialog.addEventListener("close", function () {
      if (!dialog.open) {
        settle(false);
      }
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function ask(label, result) {
    settle(false); // 앞 물음이 남아 있으면 취소로 닫는다
    var box = ensureDialog();
    box.querySelector("[data-impact-title]").textContent = "영향 목록 — " + label;
    box.querySelector("[data-impact-summary]").textContent = summaryText(result.rows, result.removed, result.error, false) +
      ". 적용하면 기록 한 줄로 남아 되돌릴 수 있습니다.";
    fillList(box.querySelector("[data-impact-list]"), result.rows);
    box.dataset.count = String(result.rows.length);
    return new Promise(function (resolve) {
      asking = { resolve: resolve, label: label, rows: result.rows, removed: result.removed };
      try {
        box.showModal();
      } catch (error) {
        box.setAttribute("open", "");
      }
      box.querySelector("[data-impact-cancel]").focus(); // 바꾸지 않는 쪽이 기본
    });
  }

  /* 열린 물음에 답한다 — 물음이 없었으면 false */
  function settle(ok) {
    if (!asking) {
      return false;
    }
    var pending = asking;
    asking = null;
    if (dialog.open) {
      dialog.close();
    }
    pending.resolve(Boolean(ok));
    return true;
  }

  design.setImpactHandler(function (ctx) {
    var result = impactFor(ctx, Rules, FontKku);
    var key = Rules.stableJson(ctx.after.design);
    var label = ctx.label || "디자인 바꾸기";
    if (!blocking(result.rows, result.removed, result.error)) {
      accepted = { key: key, label: label, rows: result.rows, removed: result.removed, asked: false };
      return true;
    }
    accepted = null;
    return ask(label, result).then(function (ok) {
      accepted = ok ? { key: key, label: label, rows: result.rows, removed: result.removed, asked: true } : null;
      return ok;
    });
  });

  // ── 알림 칸(막지 않음) ────────────────────────────────────────────────

  function ensureInfo() {
    if (infoBox) {
      return infoBox;
    }
    infoBox = element("div", "studio-impact-info");
    infoBox.dataset.impactInfo = "";
    infoBox.setAttribute("role", "status");
    infoBox.hidden = true;
    var head = element("p", "studio-impact-info-head");
    var text = element("span", "studio-impact-info-text");
    text.dataset.impactInfoText = "";
    head.appendChild(text);
    var close = button("닫기", "data-impact-info-close");
    close.setAttribute("aria-label", "영향 알림 닫기");
    head.appendChild(close);
    var list = element("ul", "studio-impact-list");
    list.dataset.impactList = "";
    infoBox.appendChild(head);
    infoBox.appendChild(list);
    close.addEventListener("click", hideInfo);
    var message = section && section.querySelector("[data-design-message]");
    if (message) {
      message.parentNode.insertBefore(infoBox, message.nextSibling);
    } else if (section) {
      section.appendChild(infoBox);
    }
    return infoBox;
  }

  function showInfo(entry) {
    var rows = entry.rows || [];
    if (!rows.length && !entry.removed.length && !entry.error) {
      hideInfo();
      return;
    }
    var box = ensureInfo();
    infoState = { label: entry.label, rows: rows, removed: entry.removed, error: entry.error || null, asked: Boolean(entry.asked) };
    box.dataset.count = String(rows.length);
    box.dataset.asked = String(Boolean(entry.asked));
    box.dataset.blocking = String(blocking(rows, entry.removed, entry.error));
    box.querySelector("[data-impact-info-text]").textContent = "영향 — " + entry.label + ": " +
      summaryText(rows, entry.removed, entry.error, true) + (entry.asked ? "." : ". 막지 않고 적용했습니다 — 되돌리려면 편집 기록에서 앞 항목을 누르세요.");
    fillList(box.querySelector("[data-impact-list]"), rows);
    box.hidden = false;
  }

  function hideInfo() {
    clearTimeout(infoTimer);
    infoTimer = null;
    infoState = null;
    if (infoBox) {
      infoBox.hidden = true;
    }
  }

  /* 묻지 않는 편집이 소스를 뺐을 때 — 적용은 이미 끝났고, 영향은 다음 차례에 잰다(settled()가 기다린다) */
  function scheduleInfo(label, before, after, removed) {
    clearTimeout(infoTimer);
    infoTimer = setTimeout(function () {
      infoTimer = null;
      var result = impactFor({ before: { design: before }, after: { design: after } }, Rules, FontKku);
      showInfo({ label: label, rows: result.rows, removed: removed, error: result.error, asked: false });
    }, 0);
  }

  /* 바뀐 디자인마다: 물은 편집이 적용됐으면 그 영향을, 묻지 않은 편집(edit·JSON)이 같은 재료에서 소스를 뺐으면 잰 영향을 알린다.
   * 재료를 바꾸면(모든 자모가 바뀐다) 알리지 않는다. 되돌리기·건너뛰기·열기는 알림을 거둔다 */
  function noteChange(event, previous) {
    var pending = accepted;
    accepted = null;
    if (pending && pending.key === Rules.stableJson(event.json)) {
      clearTimeout(infoTimer);
      infoTimer = null;
      showInfo(pending);
      return;
    }
    if ((event.cause === "edit" || event.cause === "json") && previous && previous.mode === event.json.mode) {
      var removed = removedSources(previous, event.json);
      if (removed.length) {
        scheduleInfo(event.label || "디자인 바꾸기", previous, event.json, removed);
        return;
      }
    }
    hideInfo();
  }

  // ── 훅 ──────────────────────────────────────────────────────────────

  design.on("change", function (event) {
    var previous = lastJson;
    lastJson = event.json;
    render();
    noteChange(event, previous);
  });
  /* 하나의 기록이 바뀔 때마다(어느 갈래든) — 첫 줄이 생기면 칸을 붙인다 */
  timeline.on(function () {
    if (!panel && timeline.entries().length) {
      ensurePanel();
    }
    render();
  });
  design.on("status", function (event) {
    syncState(event.state);
  });
  design.addBusy(function () { return infoTimer !== null; });
  if (timeline.entries().length) {
    ensurePanel();
    render();
  }

  Studio.history = {
    /* [{ id, label, at, current, undone, kind, cause, actor, undoable }] — 하나의 기록의 줄 */
    entries: entries,
    /* 그 항목까지 적용한 상태로(null이면 처음 상태) — timeline.jump와 같다 → 옮겼는가 */
    jump: function (id) { return timeline.jump(id === undefined ? null : id).ok; },
    impactOpen: function () { return Boolean(asking); },
    /* 열린 물음 { label, rows, removed } — 없으면 null */
    impact: function () {
      return asking ? Design.clone({ label: asking.label, rows: asking.rows, removed: asking.removed }) : null;
    },
    /* 열린 물음에 답한다(true 적용 · false 취소) — 물음이 없었으면 false */
    answer: function (ok) { return settle(ok !== false); },
    /* 보이는 알림 칸 { label, rows, removed, error, asked } — 없으면 null */
    info: function () { return infoState && infoBox && !infoBox.hidden ? Design.clone(infoState) : null; },
    /* 칸을 붙여 펼치고(on이 false면 접고) 보인다 — 돌려준 값은 펼쳤는지 */
    open: function (on) {
      ensurePanel();
      render();
      writeOpen(on !== false);
      panel.querySelector("[data-history-fold]").open = opened;
      Studio.f.sync();
      syncTicker();
      return opened;
    },
    refresh: render
  };
})(typeof window !== "undefined" ? window : globalThis);
