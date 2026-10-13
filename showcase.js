/* 사례 페이지 — 사례 모음(카드·쓰임 고르기, 카드마다 그대로 가져가기·고쳐 보기·AI에게 고쳐 달라기), 고쳐 쓰기(8칸 세트로
 * 글씨 갈아 끼우기), 새로 만들기(요청 글·빈 페이지).
 *
 * - 사례 목록은 examples/index.json이다. 카드는 목록 차례대로 서고([data-case]), 쓰임 고르기는 카드에 hidden만 준다.
 *   file은 /^[a-z0-9-]+\.html$/만 받는다(주소·속성에 그대로 들어간다). fonts의 "fixed"는 글꼴 이름을 비운 바탕 요소
 *   (기본 배치 세벌 고정)다 — 카드 표와 고쳐 쓰기 칩에 '세벌 고정'으로 보인다.
 *   항목의 made({ by, where, date, attempt, edited, prompt, note, builder? })는 그 페이지가 요청 글 하나로 AI에게 받은
 *   답이라는 기록이다 — 카드에 그 표지와 요청 원문을 보인다. builder는 그 요청 글을 낸 요청 글 만들기의 고르기다
 *   (buildPrompt(builder)가 prompt와 같을 때만 '이 설정 불러오기'를 보인다). made가 없는 항목의 prompt는 페이지를 글로
 *   적은 요청일 뿐이라 '받은 답'이라고 부르지 않는다.
 * - 고쳐 쓰기는 사례 HTML을 받아 showcase-remix.js로 바꾼 글 하나에서 미리보기(srcdoc + <base>)와 복사·내려받기
 *   (FontKkuSite.toCdn)를 함께 만든다. 세트는 소개와 같은 landing-ai-sets.js의 답, 또는 소개에서 그려 이 브라우저에
 *   남긴 칸(localStorage 'font-kku:landing-draft')이다. 미리보기 틀은 구획이 화면에 가까워질 때 처음 만든다.
 * - 요청 글은 FontKkuShowcase.buildPrompt(opts)가 만든다. 줄마다 설명서(SKILL.md 목차의 파일)를 가리키고, 설명서에 없는
 *   API 이름은 넣지 않는다 — 통합 쪽이 이 글을 그대로 AI에게 주고 받은 답을 사례로 싣는다. */
(function () {
  "use strict";

  var FK = window.FontKku;
  var site = window.FontKkuSite;
  var S = window.FontKkuLandingSets;
  var R = window.FontKkuRemix;
  var T = window.FontKkuThemes;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.FontKkuDemo.renderNav("showcase");

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }
  function baseName(file) { return String(file).replace(/\.html$/, ""); }
  /* 조사 고르기 — pair는 "은는"·"을를"처럼 받침 있을 때, 없을 때 차례 */
  function josa(word, pair) {
    var text = String(word);
    var code = text.charCodeAt(text.length - 1) - 0xac00;
    return text + (code >= 0 && code < 11172 && code % 28 !== 0 ? pair[0] : pair[1]);
  }

  // ── 봇 미리보기 ─────────────────────────────────────────────
  var botPreview = $("[data-bot-preview]");
  if (botPreview && FK) {
    botPreview.textContent = "배포봇  오후 3:02\n" + FK.renderText("배포 완료").join("\n");
  }

  // ── 요청 글 만들기 ────────────────────────────────────────────
  var FEEL_DEFAULT = "가는 펜으로 또박또박 쓴 단정한 글씨";

  /* 요청 글에 고를 수 있는 글꼴 — 설명서 fonts.md의 표와 같은 이름들: 글꼴 축(직접 그리는 바탕 둘은 뺀다)과 칠이 다른 꾸러미 글꼴 */
  function fontChoices() {
    var out = [];
    if (!T) return out;
    Object.keys(T.fonts || {}).forEach(function (id) {
      var font = T.fonts[id];
      if (font.group !== "starter" && id !== "sprite-system") out.push({ id: id, name: font.name });
    });
    Object.keys(T.looks || {}).forEach(function (id) {
      var look = T.looks[id];
      if (look.from && !out.some(function (item) { return item.id === look.from; })) out.push({ id: look.from, name: look.name });
    });
    return out;
  }
  var FONTS = fontChoices();
  var FIXED = R ? R.FIXED : "fixed";

  function fontName(id) {
    if (id === FIXED) return "세벌 고정";
    for (var i = 0; i < FONTS.length; i += 1) {
      if (FONTS[i].id === id) return FONTS[i].name;
    }
    return id;
  }

  /* opts: { what, font: "auto" | "draw" | "<글꼴 id>", fontName?, feel?, seed?, assemble?, input? } */
  function buildPrompt(opts) {
    opts = opts || {};
    var font = opts.font || "auto";
    var lines = [
      "이 설명서를 읽고 따라 해 줘: " + site.SKILL_URL,
      "",
      opts.what + " 페이지를 HTML 파일 하나로 만들어 줘.",
      "- 제목과 짧은 강조 문구만 폰꾸로 꾸미고, 본문은 폰꾸 없이 페이지 글꼴로 둬."
    ];
    if (font === "auto") {
      lines.push("- 폰꾸 글꼴은 설명서 fonts.md의 글꼴 표에서 페이지 바탕에 어울리는 것으로 골라 줘.");
    } else if (font === "draw") {
      var feel = String(opts.feel || "").trim() || FEEL_DEFAULT;
      feel = feel.replace(/\.$/, "");
      lines.push("- 제목 글꼴은 새로 그려 줘. 느낌: " + feel + ". draw-jamo.md의 「세벌·고딕에 그림 세트 걸기」대로 ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ 여덟 칸만 SVG 경로로 그려 FontKku.registerJamo로 등록하고, 제목에 jamo-set으로 걸어 줘.");
    } else {
      lines.push("- 폰꾸 글꼴은 이것으로: " + (opts.fontName || fontName(font)) + "(" + font + "). fonts.md에 적힌 그 글꼴의 바탕 조건을 지켜 줘.");
    }
    if (opts.seed) lines.push("- 제목은 같은 글자도 볼 때마다 조금씩 다르게 해 줘(styling.md의 씨앗 — seed=\"auto\"와 jamo-seeds).");
    if (opts.assemble) lines.push("- 제목이 화면에 들어올 때 자모가 모여 글자가 되게 해 줘(compose.md의 움직임).");
    if (opts.input) lines.push("- 입력칸에 쓴 글을 그 자리에서 폰꾸로 다시 그리게 해 줘(setup.md의 동적 변경).");
    lines.push("- 움직임 줄이기 설정이면 움직이지 않게, 휴대폰 폭 360px에서도 가로로 넘치지 않게 해 줘.");
    return lines.join("\n");
  }

  var builder = $("[data-builder]");
  var builderOut = $("[data-builder-out]");
  var fontSelect = $("[data-builder-fonts]");
  var feelInput = $("[data-builder-feel]");

  function builderOptions() {
    var form = builder.elements;
    var pressed = $("[data-builder-what] [aria-pressed='true']", builder);
    var typed = form.what.value.trim();
    var choice = form.font.value;
    var font = choice === "pick" ? fontSelect.value : choice;
    return {
      what: typed || (pressed ? pressed.getAttribute("data-what") : "청첩장·초대장"),
      font: font,
      fontName: choice === "pick" ? fontName(font) : undefined,
      feel: feelInput.value,
      seed: form.seed.checked,
      assemble: form.assemble.checked,
      input: form.input.checked
    };
  }

  function renderPrompt() {
    builderOut.textContent = buildPrompt(builderOptions());
  }

  /* 고르기를 opts(buildPrompt와 같은 모양)로 되돌린다 — 사례의 made.builder를 '이 설정 불러오기'로 */
  function loadBuilder(opts) {
    var form = builder.elements;
    var font = opts.font || "auto";
    var choice = font === "auto" || font === "draw" ? font : "pick";
    var chip = $$("[data-what]", builder).filter(function (button) { return button.getAttribute("data-what") === opts.what; })[0];
    $$("[data-what]", builder).forEach(function (button) { button.setAttribute("aria-pressed", String(button === chip)); });
    form.what.value = chip ? "" : opts.what || "";
    builder.querySelector("input[name='font'][value='" + choice + "']").checked = true;
    if (choice === "pick") fontSelect.value = font;
    feelInput.value = opts.feel || "";
    form.seed.checked = Boolean(opts.seed);
    form.assemble.checked = Boolean(opts.assemble);
    form.input.checked = Boolean(opts.input);
    renderPrompt();
  }

  if (builder) {
    fontSelect.innerHTML = FONTS.map(function (font) {
      return '<option value="' + escapeHtml(font.id) + '">' + escapeHtml(font.name) + " (" + escapeHtml(font.id) + ")</option>";
    }).join("");
    feelInput.placeholder = FEEL_DEFAULT;
    $("[data-builder-what]", builder).addEventListener("click", function (event) {
      var button = event.target.closest("[data-what]");
      if (!button) return;
      $$("[data-what]", builder).forEach(function (other) { other.setAttribute("aria-pressed", String(other === button)); });
      builder.elements.what.value = "";
      renderPrompt();
    });
    builder.elements.what.addEventListener("input", function () {
      var typed = builder.elements.what.value.trim();
      if (typed) $$("[data-what]", builder).forEach(function (other) { other.setAttribute("aria-pressed", "false"); });
      else if (!$("[data-what][aria-pressed='true']", builder)) $("[data-what]", builder).setAttribute("aria-pressed", "true");
    });
    fontSelect.addEventListener("change", function () { builder.querySelector("input[name='font'][value='pick']").checked = true; });
    feelInput.addEventListener("focus", function () { builder.querySelector("input[name='font'][value='draw']").checked = true; renderPrompt(); });
    builder.addEventListener("input", renderPrompt);
    builder.addEventListener("change", renderPrompt);
    builder.addEventListener("submit", function (event) { event.preventDefault(); });
    renderPrompt();
  }

  // ── 빈 페이지에서 ────────────────────────────────────────────
  var STARTER_SET = "claude-marker-1";
  var starterCode = $("[data-start-code]");
  if (starterCode && S && R) {
    var starter = S.read(S.byId(STARTER_SET));
    var register = R.registerCode({ cells: starter.cells, options: starter.options, label: "원형 8칸만 그린다 — 나머지 자모와 11,172자는 폰꾸가 조립한다" });
    starterCode.textContent = '<script src="' + site.RUNTIME + '" data-fonts="sebul"></' + "script>\n" + register + "\n\n" +
      '<h1><font-kku font="sebul" jamo-set="my-font" size="56"\n  style="--fy-element-width: ' + (starter.width || "0.13em") + '">오늘의 기록</font-kku></h1>\n' +
      "<p>본문은 폰꾸 없이 페이지 글꼴로 씁니다.</p>";
    var starterSet = S.byId(STARTER_SET);
    $("[data-start-about]").innerHTML = "이 코드를 이 페이지에서 그대로 그린 결과입니다. 8칸은 소개에 실은 " +
      '<a href="./index.html#ai">마커 답</a>(' + escapeHtml(starterSet.date + " " + starterSet.by + ", " + starterSet.attempt) +
      ", 고치지 않음)입니다. 내 글씨로 바꾸려면 등록 코드의 여덟 칸만 바꿉니다.";
  }

  // ── 고쳐 쓰기: 세트 ─────────────────────────────────────────────
  var DRAFT_KEY = "font-kku:landing-draft";
  var ORDER = R ? R.ORDER : [];

  function readDraft() {
    var draft = null;
    try {
      var raw = window.localStorage.getItem(DRAFT_KEY);
      draft = raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
    if (!draft || draft.v !== 1 || !draft.cells || typeof draft.cells !== "object") return null;
    var cells = {};
    ORDER.forEach(function (key) {
      var cell = draft.cells[key];
      if (cell && Array.isArray(cell.shapes) && cell.shapes.length && Array.isArray(cell.box) && cell.box.length === 4) {
        cells[key] = { box: cell.box, shapes: cell.shapes };
      }
    });
    if (!Object.keys(cells).length) return null;
    return {
      cells: cells,
      width: /^0?\.\d+em$/.test(draft.width) ? draft.width : "0.13em",
      edited: Array.isArray(draft.edited) ? draft.edited.filter(function (key) { return ORDER.indexOf(key) >= 0; }) : [],
      from: draft.from
    };
  }

  function setLabel(set) {
    return "8칸 그림 세트 「" + set.feel + "」 — " + set.date + " " + set.by + "의 " + set.attempt + (set.edited ? "" : "(고치지 않음)") +
      ". 원형 8칸만 그렸고 나머지 자모와 11,172자는 폰꾸가 조립한다";
  }

  function remixSet(id) {
    if (!id || !S) return null;
    if (id === "draft") {
      var draft = readDraft();
      return draft ? { cells: draft.cells, options: { frame: "box", cap: "round", join: "round" }, width: draft.width,
        label: "8칸 그림 세트 — 소개의 8칸 만들기에서 내가 그린 칸. 나머지 자모와 11,172자는 폰꾸가 조립한다" } : null;
    }
    var set = S.byId(id);
    var answer = set && S.read(set);
    return answer ? { cells: answer.cells, options: answer.options, width: answer.width, label: setLabel(set) } : null;
  }

  function aboutSet(id) {
    if (!id) return "사례가 원래 쓴 글꼴 그대로입니다. 씨앗만 켜 볼 수도 있습니다.";
    if (id === "draft") {
      var draft = readDraft();
      if (!draft) return "이 브라우저에 남은 칸이 없습니다.";
      return "소개의 8칸 만들기에서 그려 이 브라우저에 남긴 칸입니다" +
        (draft.edited.length ? " — 고친 칸: " + escapeHtml(draft.edited.join(" ")) : "") + ". 굵기 " + escapeHtml(draft.width) + ".";
    }
    var set = S.byId(id);
    if (!set) return "";
    var meta = [set.date, set.by, set.where, set.attempt, set.edited ? "손본 답" : "고치지 않음"].join(" · ");
    var text = escapeHtml(meta) + ". 느낌: " + escapeHtml(set.feel) + ".";
    if (set.followup) text += " 부탁: “" + escapeHtml(set.followup) + "”";
    if (id === "claude-balloon-2") text += " 큰 제목에 어울리고, 작은 글씨에서는 획이 뭉칩니다.";
    return text + ' <a href="./index.html#ai">답 원문 → 소개</a>';
  }

  // ── 사례 목록 ─────────────────────────────────────────────────
  var mount = $("[data-showcase]");
  var filterBox = $("[data-showcase-filter]");
  var kindsBox = $("[data-showcase-kinds]");
  var shownOut = $("[data-showcase-shown]");
  var countOut = $("[data-showcase-count]");
  var items = [];
  var byFile = {};

  function attemptLabel(made) {
    return /^1번째/.test(made.attempt || "") || !made.attempt ? "첫 답" : made.attempt;
  }

  /* 표지에 쓰는 짧은 말 — 고쳤는지만. 무엇을 고쳤는지(edited가 글이면)는 기록 줄(madeMeta)에 적는다 */
  function madeEdited(made) {
    return made.edited ? "손봄" : "고치지 않음";
  }

  function madeMeta(made) {
    var edited = !made.edited ? "고치지 않음" : typeof made.edited === "string" ? "손봄: " + made.edited : "손봄";
    return [made.date, made.by, made.where, made.attempt, edited].filter(Boolean).join(" · ");
  }

  /* 카드의 펼침 제목 — 펼치면 요청 원문이 보인다(답은 카드 그 자체다). 증거 줄도 이 말을 그대로 옮긴다 */
  function madeSummary(made) {
    return "이 페이지를 받은 요청 글 (" + attemptLabel(made) + ", " + madeEdited(made) + ")";
  }

  function madeOf(item) {
    return item && item.made && typeof item.made === "object" ? item.made : null;
  }

  function withSkill(prompt) {
    var text = String(prompt || "");
    return /^이 설명서를 읽고/.test(text) ? text : "이 설명서를 읽고 따라 해 줘: " + site.SKILL_URL + "\n\n" + text;
  }

  /* 'AI에게 고쳐 달라기' — 공개 사이트의 사례 주소와 설명서 주소를 담은 요청 글 */
  function askText(item) {
    return [
      "이 설명서를 읽고 따라 해 줘: " + site.SKILL_URL,
      "",
      "이 폰꾸 사례 템플릿을 바탕으로 내 페이지를 만들어 줘: " + site.SITE_URL + "examples/" + item.file + " (" + item.title + ")",
      "바꿀 것: (여기에 적어 주세요 — 이름, 날짜, 글, 색, 글꼴)",
      "- 폰꾸로 꾸민 제목과 강조는 폰꾸로 두고, 글꼴을 바꾸면 fonts.md에 적힌 바탕 조건을 지켜 줘.",
      "- 런타임 스크립트는 설명서의 jsDelivr 주소로 바꿔 HTML 파일 하나로 줘.",
      "- 휴대폰 폭 360px에서도 가로로 넘치지 않게 해 줘."
    ].join("\n");
  }

  function remixable(item) { return item.remix !== false; }

  function card(item) {
    var href = "./examples/" + item.file;
    var name = baseName(item.file);
    var made = madeOf(item);
    var tags = (item.fonts || []).map(function (font) {
      if (font === FIXED) return '<li class="sc-fixed"><a href="./fonts.html#layout" title="글꼴 이름을 비워 기본 배치로 그린 글자">세벌 고정</a></li>';
      return '<li><a href="./fonts.html#' + escapeHtml(font) + '"><code>' + escapeHtml(font) + "</code></a></li>";
    }).concat((item.features || []).map(function (feature) {
      return '<li class="sc-feature">' + escapeHtml(feature) + "</li>";
    })).join("");
    var madeBlock = "";
    if (made) {
      madeBlock = '<details class="sc-made" data-made>' +
        "<summary>" + escapeHtml(madeSummary(made)) + "</summary>" +
        '<p class="k-note">' + escapeHtml(madeMeta(made)) + (made.note ? ". " + escapeHtml(made.note) : "") +
        ". 아래 글을 그대로 주고 받은 답을 실었습니다. 같은 글을 다시 줘도 답은 AI마다, 할 때마다 다릅니다.</p>" +
        '<pre class="sc-made-prompt">' + escapeHtml(made.prompt || "") + "</pre>" +
        '<button type="button" class="k-btn k-btn--small" data-copy-text="' + escapeHtml(made.prompt || "") + '">요청 글 복사</button>' +
        "</details>";
    }
    return '<article class="k-showcase-card sc-card" id="case-' + escapeHtml(name) + '" data-case="' + escapeHtml(item.file) + '"' +
      (item.kind ? ' data-kind="' + escapeHtml(item.kind) + '"' : "") + ">" +
      '<a class="k-case-frame"' + (item.preview === "phone" ? ' data-preview="phone"' : "") + ' href="' + href +
      '" target="_blank" rel="noopener" aria-label="' + escapeHtml(item.title) + ' 새 창에서 열기">' +
      '<iframe src="' + href + '" title="' + escapeHtml(item.title) + ' 미리보기" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></a>' +
      '<div class="k-showcase-body">' +
      (item.kind ? '<p class="sc-kind">' + escapeHtml(item.kind) + "</p>" : "") +
      "<h3>" + escapeHtml(item.title) + "</h3>" +
      (made ? '<p class="sc-badge" title="' + escapeHtml(madeMeta(made)) + '">AI 답 · ' + escapeHtml(madeEdited(made)) + "</p>" : "") +
      "<p>" + escapeHtml(item.summary) + "</p>" +
      '<ul class="k-fontrow-tags sc-tags">' + tags + "</ul>" +
      '<div class="k-showcase-actions sc-actions">' +
      '<a class="k-btn k-btn--small k-btn--primary" href="' + href + '" target="_blank" rel="noopener">열어 보기</a>' +
      (remixable(item) ? '<a class="k-btn k-btn--small" href="#remix=' + escapeHtml(name) + '" data-remix-pick="' + escapeHtml(item.file) + '">고쳐 보기</a>' : "") +
      "</div>" +
      '<div class="k-showcase-actions sc-actions sc-actions--more">' +
      '<button type="button" class="k-btn k-btn--small" data-template="' + href + '">HTML 복사</button>' +
      '<button type="button" class="k-btn k-btn--small" data-template="' + href + '" data-template-download>내려받기</button>' +
      '<button type="button" class="k-btn k-btn--small" data-ask-ai data-copy-text="' + escapeHtml(askText(item)) + '">AI에게 고쳐 달라기</button>' +
      "</div>" + madeBlock + "</div></article>";
  }

  function kindsOf(data) {
    var order = Array.isArray(data.kinds) ? data.kinds.slice() : [];
    items.forEach(function (item) {
      if (item.kind && order.indexOf(item.kind) < 0) order.push(item.kind);
    });
    return order.map(function (kind) {
      return { kind: kind, count: items.filter(function (item) { return item.kind === kind; }).length };
    }).filter(function (entry) { return entry.count > 0; });
  }

  function applyFilter(kind) {
    var cards = $$("[data-case]", mount);
    var shown = 0;
    cards.forEach(function (node) {
      node.hidden = Boolean(kind) && node.getAttribute("data-kind") !== kind;
      if (!node.hidden) shown += 1;
    });
    $$("button", kindsBox).forEach(function (button) {
      button.setAttribute("aria-pressed", String((button.getAttribute("data-kind") || "") === (kind || "")));
    });
    shownOut.textContent = kind ? kind + " " + shown + "가지를 보여 줍니다." : "사례 " + shown + "가지를 모두 보여 줍니다.";
  }

  function renderFilter(kinds) {
    kindsBox.innerHTML = '<button type="button" data-kind="" aria-pressed="true">모두 <span class="sc-n">' + items.length + "</span></button>" +
      kinds.map(function (entry) {
        return '<button type="button" data-kind="' + escapeHtml(entry.kind) + '" aria-pressed="false">' + escapeHtml(entry.kind) +
          ' <span class="sc-n">' + entry.count + "</span></button>";
      }).join("");
    kindsBox.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-kind]");
      if (button) applyFilter(button.getAttribute("data-kind"));
    });
    filterBox.hidden = kinds.length < 2;
    applyFilter("");
  }

  function renderCount(kinds) {
    var apps = $$("#apps .k-app-card").length;
    var bots = $$("#bot [data-bot-example]").length;
    countOut.innerHTML = '<a href="#cases">사례 ' + items.length + "가지</a> · 쓰임 " + kinds.length + "갈래 · " +
      '<a href="#apps">웹 앱 ' + apps + "개</a> · " + '<a href="#bot">봇·터미널 예제 ' + bots + "개</a>";
    countOut.hidden = false;
  }

  /* listed: 사례 목록을 읽었는지 — 못 읽었으면(file://) 받은 답이 있는지 모르니 그 말을 하지 않는다 */
  function renderEvidence(listed) {
    var out = $("[data-evidence]");
    if (!out) return;
    var answers = S ? S.sets.length : 0;
    var made = items.filter(madeOf);
    var text = "AI가 설명서를 읽고 8칸 글꼴을 그린 실제 답 " + answers + "개는 소개의 " +
      '<a href="./index.html#ai">「대화창 답 하나가 글꼴 하나」</a>에 고치지 않고 실었습니다. ';
    if (!listed) {
      text = text.trim();
    } else if (made.length) {
      var labels = [];
      made.forEach(function (item) {
        var label = madeSummary(item.made);
        if (labels.indexOf(label) < 0) labels.push(label);
      });
      text += "요청 글 하나로 AI에게 페이지를 통째로 받은 답도 이 사례에 있습니다 — " + made.map(function (item) {
        return '<a href="#case-' + escapeHtml(baseName(item.file)) + '">' + escapeHtml(item.title) + "</a>(" +
          escapeHtml(attemptLabel(item.made) + ", " + madeEdited(item.made)) + ")";
      }).join(" · ") + ". 카드의 " + labels.map(function (label) { return "'" + escapeHtml(label) + "'"; }).join("·") +
        "을 펼치면 요청 원문을 봅니다.";
    } else {
      text += "페이지를 통째로 맡겨 받은 답은 아직 싣지 않았습니다.";
    }
    out.innerHTML = text;
  }

  /* 요청 글 만들기 옆 증거: 이 만들기의 출력을 그대로 줘 받은 답(made.builder로 지금 다시 만든 글이 made.prompt와 같은 것만) */
  function setupBuilderMade() {
    var box = $("[data-builder-made]");
    if (!box || !builder) return;
    var list = items.filter(function (item) {
      var made = madeOf(item);
      return made && made.builder && typeof made.builder === "object" && made.prompt && buildPrompt(made.builder) === made.prompt;
    });
    if (!list.length) return;
    var first = list.every(function (item) { return attemptLabel(item.made) === "첫 답"; });
    var clean = list.every(function (item) { return !item.made.edited; });
    $("[data-builder-made-lead]", box).innerHTML = "<strong>이 만들기로 받은 답</strong> — " +
      escapeHtml(josa(list.map(function (item) { return item.title; }).join("·"), "은는")) +
      " 여기서 만든 요청 글을 한 글자도 고치지 않고 AI에게 줘 받은 " + (first ? "첫 답" : "답") + "입니다. " +
      "AI는 이 저장소의 설명서만 읽고 썼고, " +
      (clean ? "받은 HTML에서는 런타임 주소만 사례 폴더에 맞게 바꿨습니다." : "받은 HTML을 손본 곳은 아래 기록에 적었습니다.");
    $("[data-builder-made-list]", box).innerHTML = list.map(function (item) {
      return '<li><span class="sc-proof-name"><a href="#case-' + escapeHtml(baseName(item.file)) + '">' + escapeHtml(item.title) + "</a>" +
        '<span class="sc-proof-meta">' + escapeHtml(madeMeta(item.made)) + "</span></span>" +
        '<button type="button" class="k-btn k-btn--small" data-builder-load="' + escapeHtml(item.file) + '">이 설정 불러오기</button></li>';
    }).join("");
    var status = $("[data-builder-made-status]", box);
    box.addEventListener("click", function (event) {
      var button = event.target.closest("[data-builder-load]");
      var item = button && byFile[button.getAttribute("data-builder-load")];
      if (!item) return;
      loadBuilder(item.made.builder);
      var same = builderOut.textContent === item.made.prompt;
      status.textContent = josa(item.title, "을를") + " 받은 설정을 불러왔습니다. " +
        (same ? "위 요청 글이 그때 준 글과 한 글자도 같습니다." : "그때 준 글과 다릅니다 — 요청 글 만들기가 그 뒤에 바뀌었습니다.");
    });
    box.hidden = false;
  }

  // ── 이 사례처럼 ───────────────────────────────────────────────
  var like = $("[data-like]");
  var likeSelect = $("[data-like-template]");

  function renderLike() {
    var item = byFile[likeSelect.value];
    if (!item) return;
    var made = madeOf(item);
    $("[data-like-title]").textContent = made ? madeSummary(made) : "이 페이지를 글로 적은 요청";
    $("[data-like-about]").textContent = made ?
      "이 사례는 아래 글을 그대로 AI에게 주고 받은 답입니다(" + madeMeta(made) + "). 같은 글을 다시 줘도 답은 AI마다, 할 때마다 다릅니다." :
      "이 페이지의 모습을 글로 적은 요청입니다. 이 글로 받은 답을 싣지는 않았고, 같은 페이지가 나온다는 보장은 없습니다. 답은 AI마다 다릅니다.";
    $("[data-like-out]").textContent = withSkill(made ? made.prompt : item.prompt);
  }

  function setupLike() {
    var list = items.filter(function (item) { return (item.made && item.made.prompt) || item.prompt; });
    if (!like || !list.length) return;
    likeSelect.innerHTML = list.map(function (item) {
      return '<option value="' + escapeHtml(item.file) + '">' + escapeHtml(item.title) + (item.kind ? " — " + escapeHtml(item.kind) : "") + "</option>";
    }).join("");
    likeSelect.addEventListener("change", renderLike);
    like.hidden = false;
    renderLike();
  }

  // ── 고쳐 쓰기 ───────────────────────────────────────────────
  var remixBox = $("[data-remix]");
  var remixForm = $("[data-remix-form]");
  var templateSelect = $("[data-remix-template]");
  var frameBox = $("[data-remix-frame]");
  var caption = $("[data-remix-caption]");
  var diffOut = $("[data-remix-diff]");
  var diffTitle = $("[data-remix-diff-title]");
  var copyButton = $("[data-remix-copy]");
  var downloadButton = $("[data-remix-download]");
  var rerollButton = $("[data-remix-reroll]");
  var openLink = $("[data-remix-open]");
  var DEFAULT_TEMPLATE = "cafe-menu.html";
  var sources = {};
  var remix = { file: DEFAULT_TEMPLATE, set: "claude-marker-1", seed: false, fonts: [], out: "", src: "", ready: false, started: false, seq: 0, frame: null };
  var fontsBox = $("[data-remix-fonts-box]");
  var fontChips = $("[data-remix-fonts]");

  function loadSource(file) {
    if (!sources[file]) {
      sources[file] = fetch("./examples/" + file).then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        return response.text();
      });
      sources[file].catch(function () { delete sources[file]; });
    }
    return sources[file];
  }

  /* 처음에 바꿀 글꼴 — 사례의 글꼴 가운데 remixKeep(색 바탕 위 스티커처럼 글꼴이 제 색을 가진 곳)을 뺀 것 */
  function defaultFonts(item) {
    var keep = Array.isArray(item.remixKeep) ? item.remixKeep : [];
    return (item.fonts || []).filter(function (font) { return keep.indexOf(font) < 0; });
  }

  function renderFontChips() {
    var item = byFile[remix.file] || {};
    fontChips.innerHTML = (item.fonts || []).map(function (font) {
      return '<button type="button" data-remix-font="' + escapeHtml(font) + '" aria-pressed="' + (remix.fonts.indexOf(font) >= 0) + '">' +
        escapeHtml(fontName(font)) + (font === FIXED ? "" : " <code>" + escapeHtml(font) + "</code>") + "</button>";
    }).join("");
    renderFontsNote();
    fontsBox.hidden = !remix.set;
  }

  /* 바꿀 글꼴 칩 아래 안내 — 켠 칩이 없어 바뀌는 곳이 없으면(remix.empty) 그것부터 말한다 */
  function renderFontsNote() {
    var item = byFile[remix.file] || {};
    var keep = Array.isArray(item.remixKeep) ? item.remixKeep : [];
    var note = $("[data-remix-fonts-note]");
    var text = keep.length ?
      "색 바탕 위 스티커처럼 글꼴이 제 색으로 읽히는 곳(" + keep.map(fontName).join("·") + ")은 처음에 그대로 둡니다. 눌러서 켜고 끕니다." :
      "누르면 그 글꼴로 그린 곳만 켜고 끕니다.";
    if ((item.fonts || []).indexOf(FIXED) >= 0) text += " 세벌 고정(글꼴 이름을 비운 곳)에는 그림 세트만 걸어 배치를 그대로 둡니다.";
    var html = (remix.empty ? "<strong>바꿀 글꼴을 하나 이상 켜세요.</strong> " : "") + escapeHtml(text);
    /* 읽어 주는 영역(aria-live)이라 글이 바뀔 때만 고쳐 쓴다 */
    if (html === fontsNoteHtml) return;
    fontsNoteHtml = html;
    note.innerHTML = html;
    note.toggleAttribute("data-empty", Boolean(remix.empty));
  }
  var fontsNoteHtml = "";

  function syncDraftChoice() {
    var draft = readDraft();
    var row = $("[data-remix-draft]");
    row.hidden = !draft;
    $("[data-remix-draw-link]").hidden = Boolean(draft);
    if (!draft && remix.set === "draft") {
      remix.set = "claude-marker-1";
      remixForm.querySelector("input[name='set'][value='claude-marker-1']").checked = true;
    }
  }

  /* 넓은 틀은 1280px 화면을 줄여 보이고(휴대폰용 사례는 휴대폰 폭 그대로), 좁은 틀은 이 화면 폭 그대로 보인다.
   * 틀을 만들기 전에도 그 높이를 잡아 둔다 — 늦게 만든 틀이 아래 구획(#new·#apps)을 밀어 앵커가 어긋나지 않게 */
  var DESK = { width: 1280, height: 1200 };
  var frameWidth = -1;
  function layoutFrame() {
    var frame = remix.frame;
    var width = frameBox.clientWidth;
    var item = byFile[remix.file] || {};
    frameWidth = width;
    if (frame) frame.style.transform = "";
    if (width >= 560 && item.preview === "phone") {
      var phone = Math.min(width, 430);
      if (frame) {
        frame.style.width = phone + "px";
        frame.style.height = "720px";
      }
      caption.textContent = "휴대폰용 사례라 휴대폰 폭(" + phone + "px) 그대로 보입니다. 미리보기 안에서 스크롤하고 눌러 볼 수 있습니다.";
      frameBox.style.height = "720px";
      frameBox.setAttribute("data-mode", "phone");
    } else if (width >= 560) {
      var scale = width / DESK.width;
      if (frame) {
        frame.style.width = DESK.width + "px";
        frame.style.height = DESK.height + "px";
        frame.style.transform = "scale(" + scale + ")";
      }
      caption.textContent = "1280px 화면을 " + (Math.round(scale * 100) / 100) + "배로 줄여 보입니다. 미리보기 안에서 스크롤하고 눌러 볼 수 있습니다.";
      frameBox.style.height = Math.round(DESK.height * scale) + "px";
      frameBox.setAttribute("data-mode", "desk");
    } else {
      if (frame) {
        frame.style.width = "100%";
        frame.style.height = "";
      }
      caption.textContent = "이 화면 폭 그대로 보입니다. 미리보기 안에서 스크롤하고 눌러 볼 수 있습니다.";
      frameBox.style.height = "";
      frameBox.setAttribute("data-mode", "narrow");
    }
  }

  /* 틀 크기는 폭이 바뀔 때만 다시 잡는다. 관찰 콜백 안에서 높이를 쓰면 'ResizeObserver loop' 오류가 나서 다음 그림 차례로 미룬다 */
  var layoutQueued = 0;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = window.requestAnimationFrame(function () {
      layoutQueued = 0;
      if (frameBox.clientWidth !== frameWidth) layoutFrame();
    });
  }

  function previewDoc(html, file) {
    var base = new URL("./examples/" + file, location.href).href;
    var tag = '<base href="' + escapeHtml(base) + '">';
    return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, function (head) { return head + "\n" + tag; }) : tag + html;
  }

  /* 미리보기 문서 안의 '#…' 링크는 <base> 때문에 원본 파일로 떠난다 — 그 자리에서 스크롤만 한다 */
  function keepAnchors(frame) {
    var doc = frame.contentDocument;
    if (!doc) return;
    doc.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a[href^='#']") : null;
      if (!link) return;
      event.preventDefault();
      var id = decodeURIComponent(link.getAttribute("href").slice(1));
      var target = id ? doc.getElementById(id) : doc.documentElement;
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  function ensureFrame() {
    if (remix.frame) return remix.frame;
    var wait = $("[data-remix-wait]", frameBox);
    if (wait) wait.remove();
    var frame = document.createElement("iframe");
    frame.className = "sc-remix-iframe";
    frame.setAttribute("title", "고쳐 쓴 사례 미리보기");
    frame.setAttribute("data-remix-preview", "");
    frame.addEventListener("load", function () {
      keepAnchors(frame);
      frameBox.setAttribute("data-loaded", "true");
    });
    frameBox.appendChild(frame);
    remix.frame = frame;
    layoutFrame();
    return frame;
  }

  function renderDiff(result) {
    var rows = result.rows;
    var shown = [];
    rows.forEach(function (row, index) { if (row.op !== " ") shown.push(index); });
    if (!shown.length) {
      diffTitle.textContent = "바뀐 줄 없음";
      diffOut.innerHTML = "<code>원래 글꼴 그대로입니다. 'HTML 복사'와 같은 글입니다.</code>";
      return;
    }
    var indent = Infinity;
    shown.forEach(function (index) {
      var lead = /^\s*/.exec(rows[index].text)[0].length;
      if (rows[index].text.trim()) indent = Math.min(indent, lead);
    });
    if (!isFinite(indent)) indent = 0;
    var html = [];
    shown.forEach(function (index, i) {
      var row = rows[index];
      if (i > 0 && shown[i - 1] !== index - 1) html.push('<span class="sc-diff-gap" aria-hidden="true">⋯</span>');
      var number = row.op === "+" ? row.b : row.a;
      html.push('<span class="sc-diff-' + (row.op === "+" ? "ins" : "del") + '"><span class="sc-diff-n" aria-hidden="true">' + number +
        '</span><span class="sc-diff-op">' + (row.op === "+" ? "+" : "−") + "</span>" + escapeHtml(row.text.slice(indent)) + "</span>");
    });
    diffTitle.textContent = "바뀐 줄 (+" + result.added + " −" + result.removed + ")";
    diffOut.innerHTML = "<code>" + html.join("") + "</code>";
  }

  function updateRemix() {
    if (!remix.started) return;
    var token = remix.seq += 1;
    var file = remix.file;
    remix.ready = false;
    copyButton.disabled = true;
    downloadButton.disabled = true;
    frameBox.removeAttribute("data-loaded");
    loadSource(file).then(function (src) {
      if (token !== remix.seq) return;
      var result = R.remix(src, { set: remixSet(remix.set), seed: remix.seed, fonts: remix.fonts.slice() });
      remix.src = src;
      remix.out = result.html;
      remix.hosts = result.hosts;
      /* 세트를 골랐는데 켠 칩이 없어 바꾼 곳이 없으면 사례 그대로다 — 'HTML 복사'와 같은 글을 내보내지 않는다 */
      remix.empty = Boolean(remix.set) && !result.hosts;
      remix.ready = true;
      renderFontsNote();
      if (remix.empty) {
        diffTitle.textContent = "바뀐 줄 없음";
        diffOut.innerHTML = "<code>바꿀 글꼴을 하나 이상 켜세요. 켠 글꼴이 없어 사례 HTML 그대로입니다.</code>";
      } else {
        renderDiff(R.diff(site.toCdn(src), site.toCdn(result.html)));
      }
      copyButton.disabled = remix.empty;
      downloadButton.disabled = remix.empty;
      var frame = ensureFrame();
      layoutFrame();
      frame.srcdoc = previewDoc(result.html, file);
    }, function () {
      if (token !== remix.seq) return;
      diffTitle.textContent = "바뀐 줄";
      diffOut.innerHTML = "<code>사례 HTML(" + escapeHtml(file) + ")을 불러오지 못했습니다.</code>";
    });
  }

  function syncRemixControls() {
    $("[data-remix-about]").innerHTML = aboutSet(remix.set);
    rerollButton.disabled = !remix.seed;
    openLink.href = "./examples/" + remix.file;
    fontsBox.hidden = !remix.set;
    if (templateSelect.value !== remix.file) templateSelect.value = remix.file;
  }

  function startRemix() {
    if (remix.started || !items.length) return;
    remix.started = true;
    remixBox.setAttribute("data-started", "");
    syncRemixControls();
    updateRemix();
  }

  function chooseTemplate(file) {
    remix.file = file;
    remix.empty = false;
    remix.fonts = defaultFonts(byFile[file] || {});
    renderFontChips();
    syncRemixControls();
  }

  function pickTemplate(file, focus) {
    if (!byFile[file] || !remixable(byFile[file])) return;
    chooseTemplate(file);
    if (remix.started) updateRemix();
    else startRemix();
    var section = document.getElementById("remix");
    if (focus && section) {
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      templateSelect.focus({ preventScroll: true });
    }
  }

  function setupRemix() {
    var list = items.filter(remixable);
    if (!list.length) return;
    if (!byFile[remix.file] || !remixable(byFile[remix.file])) remix.file = list[0].file;
    var kinds = [];
    list.forEach(function (item) { if (kinds.indexOf(item.kind || "") < 0) kinds.push(item.kind || ""); });
    templateSelect.innerHTML = kinds.map(function (kind) {
      var options = list.filter(function (item) { return (item.kind || "") === kind; }).map(function (item) {
        return '<option value="' + escapeHtml(item.file) + '">' + escapeHtml(item.title) + "</option>";
      }).join("");
      return kind ? '<optgroup label="' + escapeHtml(kind) + '">' + options + "</optgroup>" : options;
    }).join("");
    templateSelect.value = remix.file;
    syncDraftChoice();
    chooseTemplate(remix.file);
    layoutFrame();
    if (window.ResizeObserver) new ResizeObserver(queueLayout).observe(frameBox);
    else window.addEventListener("resize", queueLayout);

    templateSelect.addEventListener("change", function () {
      chooseTemplate(templateSelect.value);
      layoutFrame();
      updateRemix();
    });
    fontChips.addEventListener("click", function (event) {
      var button = event.target.closest("[data-remix-font]");
      if (!button) return;
      var font = button.getAttribute("data-remix-font");
      var at = remix.fonts.indexOf(font);
      if (at >= 0) remix.fonts.splice(at, 1);
      else remix.fonts.push(font);
      button.setAttribute("aria-pressed", String(at < 0));
      updateRemix();
    });
    $("[data-remix-sets]").addEventListener("change", function (event) {
      if (event.target.name !== "set") return;
      remix.set = event.target.value;
      syncRemixControls();
      updateRemix();
    });
    $("[data-remix-seed]").addEventListener("change", function (event) {
      remix.seed = event.target.checked;
      syncRemixControls();
      updateRemix();
    });
    rerollButton.addEventListener("click", function () {
      var view = remix.frame && remix.frame.contentWindow;
      if (!view || !view.FontKku) return;
      Array.prototype.forEach.call(view.document.querySelectorAll("font-kku, .font-kku"), function (host) {
        if (host.hasAttribute("seed") || host.hasAttribute("data-seed")) view.FontKku.refresh(host);
      });
    });
    remixForm.addEventListener("submit", function (event) { event.preventDefault(); });
    copyButton.addEventListener("click", function () {
      if (remix.ready && !remix.empty) site.copyText(site.toCdn(remix.out), copyButton);
    });
    downloadButton.addEventListener("click", function () {
      if (!remix.ready || remix.empty) return;
      var name = baseName(remix.file) + (remix.set ? "-my-font" : "") + ".html";
      site.download(name, site.toCdn(remix.out), downloadButton);
    });
    window.addEventListener("storage", function (event) {
      if (event.key === DRAFT_KEY) {
        /* 다른 탭에서 칸을 지우면 syncDraftChoice가 마커로 돌린다 — 그 전에 '내가 그린 8칸'이었는지 기억해 다시 만든다 */
        var was = remix.set;
        syncDraftChoice();
        if (was === "draft" || remix.set === "draft") updateRemix();
        syncRemixControls();
      }
    });
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("[data-remix-pick]");
      if (!link) return;
      event.preventDefault();
      if (history.replaceState) history.replaceState(null, "", "#remix=" + baseName(link.getAttribute("data-remix-pick")));
      pickTemplate(link.getAttribute("data-remix-pick"), true);
    });

    /* 미리보기 틀은 구획이 화면에 가까워질 때 처음 만든다 — 카드 미리보기 위에 런타임이 하나 더 뜨는 것을 늦춘다 */
    var section = document.getElementById("remix");
    if (window.IntersectionObserver) {
      var seen = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          seen.disconnect();
          startRemix();
        }
      }, { rootMargin: "400px 0px" });
      seen.observe(section);
    } else {
      startRemix();
    }
  }

  /* 부드러운 스크롤(site.css) 없이 바로 — 지나가는 길에 고쳐 쓰기 틀이 만들어져 목표가 밀리지 않게 */
  function jumpTo(node) {
    var root = document.documentElement;
    var was = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    node.scrollIntoView({ block: "start" });
    root.style.scrollBehavior = was;
  }

  /* 쓰임 고르기로 숨은 카드를 가리키면 고르기를 풀어 보이게 한다 */
  function revealCase(node) {
    if (node.hidden) applyFilter("");
    var details = $("[data-made]", node);
    if (details) details.open = true;
  }

  /* 주소의 #…를 따른다. 처음 열 때(event 없음)는 카드가 늦게 서서 브라우저가 먼저 한 앵커 스크롤이 어긋나므로 어느 id든
   * 다시 맞춘다. 그 뒤 페이지 안 링크(hashchange)는 브라우저의 앵커 스크롤에 맡기고 #remix=·#case-만 따로 다룬다 */
  function followHash(event) {
    var initial = !event;
    var hash = "";
    try {
      hash = decodeURIComponent(location.hash || "");
    } catch (error) {
      return;
    }
    var pick = /^#remix=([a-z0-9-]+)$/.exec(hash);
    if (pick) {
      pickTemplate(pick[1] + ".html", true);
      return;
    }
    var target = /^#case-([a-z0-9-]+)$/.exec(hash);
    var node = target ? document.getElementById("case-" + target[1]) : null;
    if (node) {
      revealCase(node);
      if (initial) jumpTo(node);
      else node.scrollIntoView({ block: "start" });
      return;
    }
    if (initial && hash.length > 1) {
      node = document.getElementById(hash.slice(1));
      if (node) jumpTo(node);
    }
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest && event.target.closest("a[href^='#case-']");
    var node = link && document.getElementById(link.getAttribute("href").slice(1));
    if (node && node.matches("[data-case]")) revealCase(node);
  });

  if (location.protocol === "file:") {
    remixBox.hidden = true;
    $("[data-remix-off]").hidden = false;
  }

  /* file://에서는 fetch가 막힌다(콘솔 오류만 남는다) — 묻지 않고 안내를 보인다 */
  var listRequest = location.protocol === "file:" ? Promise.reject(new Error("file")) : fetch("./examples/index.json").then(function (response) {
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  });
  listRequest.then(function (data) {
    /* file은 주소·속성에 그대로 들어간다 — 사례 폴더의 파일 이름 꼴만 받는다 */
    items = (data.examples || []).filter(function (item) { return item && /^[a-z0-9-]+\.html$/.test(String(item.file)); });
    items.forEach(function (item) { byFile[item.file] = item; });
    mount.innerHTML = items.map(card).join("");
    var kinds = kindsOf(data);
    renderFilter(kinds);
    renderCount(kinds);
    renderEvidence(true);
    setupBuilderMade();
    setupLike();
    if (location.protocol !== "file:") setupRemix();
    followHash();
    window.addEventListener("hashchange", followHash);
  }).catch(function () {
    mount.innerHTML = '<p class="k-note">사례 목록(<code>examples/index.json</code>)을 불러오지 못했습니다. 정적 서버로 열었는지 확인하세요.</p>';
    renderEvidence(false);
  });

  window.FontKkuShowcase = {
    buildPrompt: buildPrompt,
    fonts: function () { return FONTS.slice(); },
    askText: askText,
    remixState: function () {
      return { file: remix.file, set: remix.set, seed: remix.seed, fonts: remix.fonts.slice(), ready: remix.ready, hosts: remix.hosts || 0,
        empty: Boolean(remix.empty), html: remix.ready ? site.toCdn(remix.out) : "" };
    },
    pickTemplate: function (file) { pickTemplate(file, false); }
  };
})();
