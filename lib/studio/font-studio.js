/* font-studio.js — Font Studio UI (ADR-009)
 *
 * 공개 API(FontKku.render/refreshAll/fontInfo)와 폰트 계약 v2만 쓰는 정적 페이지.
 * 편집 중인 폰트는 미리보기 전용 shadow root의 constructable stylesheet로 즉시
 * 반영하고(스튜디오 UI는 폰트 CSS의 영향을 받지 않는다), 모든 편집은
 * FontStudioModel이 원문의 해당 선언만 바꾼다.
 */
(function () {
  "use strict";

  var Model = window.FontStudioModel;
  var Lint = window.FontKkuLint || null; // authoring/font-kku-lint.js — also used by check_css_contract.js
  var Derive = window.FontKkuDerive || null; // authoring/font-derive.js — 파생 글꼴(ADR-030 §8)
  var Package = window.FontStudioPackage || null; // authoring/font-studio-package.js — 글꼴 묶음(PLAN-STUDIO-002 S2)
  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var download = Util.download;
  var FontKku = window.FontKku;
  var root = document.querySelector("[data-studio]");
  if (!root || !Model || !FontKku) {
    return;
  }

  var PROJECT_FORMAT = "font-kku-font-project";
  var PROJECT_VERSION = 2;
  var DRAFT_FORMAT = "font-kku-font-studio-draft";
  var requestedDraftKey = new URLSearchParams(location.search).get("__font_kku_draft_key");
  var DRAFT_KEY = requestedDraftKey && requestedDraftKey.trim() ? requestedDraftKey : "font-kku-font-studio-v2";
  var DRAFT_PENDING_KEY = DRAFT_KEY + ":pending";
  var SHIPPED_BASE = "../profiles/";
  /* 기본 제공 글꼴을 고친 채 같은 이름으로 저장하기(ADR-030 §8 '이 글꼴 그대로') — 저장소 작업실만 연다(mount 옵션 shippedSave,
   * 바로 열 때는 ?shipped-save=1). 사이트 기본은 '이 글꼴로 새 글꼴'로만 저장한다 */
  var SHIPPED_SAVE = new URLSearchParams(location.search).get("shipped-save") === "1";
  /* 갈래 자료(글꼴 CSS 기록)의 개수는 하나의 기록(PLAN-STUDIO-002 S2)이 크기·개수 상한으로 자른다 — 갈래 스스로는 자르지 않게 넉넉히 */
  var LANE_STEPS = 100000;
  /* 값 표의 속성 이름(화면 말은 한국어 — S4 '값'). 변수 접미사는 칸의 툴팁에 */
  var LABELS = {
    top: "세로 위치", left: "가로 위치", size: "크기", "scale-x": "가로 배율", "scale-y": "세로 배율",
    rotate: "회전", weight: "굵기", stroke: "획 두께", clip: "자르기", dilate: "획 넓힘",
    "glyph-text": "그릴 문자", "glyph-candidate": "문자 후보"
  };
  var LAYER_NAMES = { "font-kku.font": "font", "font-kku.jamo": "jamo", "font-kku.context": "context", "font-kku.tune": "tune" };
  /* 값을 공급한 요소(모델의 supplier.scope)를 화면에 보일 때의 이름. "node"는 표시하지 않는다. */
  var SUPPLIER_SCOPE_LABELS = { host: "바탕 요소", glyph: "글자", ancestor: "상위 요소" };
  var PREVIEW_CHROME = [
    '[part~="jamo"] { cursor: pointer; }',
    /* 고른 자모는 잉크 상자의 손잡이 틀(.studio-handles, 미리보기 위)로 보인다. 손가락으로 끌 수 있게 그 글자 칸은 쪽 넘기기를 받지 않는다 */
    ".studio-selected {",
    "  cursor: grab;",
    "}",
    '[part="glyph"]:has(.studio-selected) {',
    "  touch-action: none;",
    "}"
  ].join("\n");

  function $(selector) {
    return root.querySelector(selector);
  }

  var textInput = $("[data-studio-text]");
  var preview = $("[data-studio-preview]");
  var host = $("[data-studio-host]");

  // ── Preview isolation ──────────────────────────────────────────────────
  /* The font CSS is arbitrary author CSS: it lives in a shadow root together
   * with the core stylesheet and the host, so it cannot restyle the Studio.
   * @font-face/@property only work at document level and are hoisted. */
  var stage = document.createElement("div");
  stage.className = "studio-preview-stage";
  stage.setAttribute("data-studio-preview-root", "");
  var shadow = stage.attachShadow({ mode: "open" });
  host.parentNode.insertBefore(stage, host);
  var coreLink = document.createElement("link");
  coreLink.rel = "stylesheet";
  coreLink.href = coreStylesheetHref();
  var coreReady = new Promise(function (resolve) {
    coreLink.addEventListener("load", function () { resolve(true); }, { once: true });
    coreLink.addEventListener("error", function () { resolve(false); }, { once: true });
  });
  shadow.appendChild(coreLink);
  shadow.appendChild(host);
  var probeBox = document.createElement("div");
  probeBox.hidden = true;
  shadow.appendChild(probeBox);
  var chromeSheet = new CSSStyleSheet();
  chromeSheet.replaceSync(PREVIEW_CHROME);
  var fontSheet = new CSSStyleSheet();
  /* 끄는 동안만 쓰는 시트 — 편집이 쓸 레이어·선택자·변수를 그대로 앞서 보인다(끌기 한 걸음마다 글꼴 CSS를 다시 해석하지 않는다).
   * 뗄 때 글꼴 CSS에 한 번 적고 비운다 */
  var dragSheet = new CSSStyleSheet();
  var documentSheet = new CSSStyleSheet();
  var overlays = [];
  /* 같은 글꼴 시트를 받는 다른 미리보기 root(디자인 비교 칸 등): { root, chrome } — 재료 덮어쓰기는 [data-studio-host]만
   * 겨누므로 거기서는 아무것도 바꾸지 않는다 */
  var previewRoots = [];
  document.adoptedStyleSheets = document.adoptedStyleSheets.concat([documentSheet]);

  function coreStylesheetHref() {
    var link = Array.prototype.filter.call(document.querySelectorAll('link[rel~="stylesheet"]'), function (entry) {
      return /(^|\/)font-kku\.css(\?|#|$)/.test(entry.getAttribute("href") || "");
    })[0];
    return link ? link.href : new URL("../font-kku.css", document.baseURI).href;
  }

  function adoptPreviewSheets() {
    shadow.adoptedStyleSheets = [chromeSheet, fontSheet, dragSheet].concat(overlays);
    previewRoots.forEach(function (entry) {
      entry.root.adoptedStyleSheets = entry.chrome.concat([fontSheet, dragSheet]).concat(overlays);
    });
  }

  function addPreviewRoot(root, chrome) {
    if (!previewRoots.some(function (entry) { return entry.root === root; })) {
      previewRoots.push({ root: root, chrome: chrome || [] });
    }
    adoptPreviewSheets();
  }

  /* 미리보기 root를 놓는다 — 그 root는 제 chrome만 남기고 글꼴 시트를 받지 않는다(쉬는 모듈의 칸이 고칠 때마다 다시 스타일을
   * 셈하지 않게, PLAN-STUDIO-002 S1 모듈 수명). 다시 받으려면 addPreviewRoot */
  function removePreviewRoot(root) {
    var kept = [];
    previewRoots.forEach(function (entry) {
      if (entry.root === root) {
        root.adoptedStyleSheets = entry.chrome.slice();
      } else {
        kept.push(entry);
      }
    });
    previewRoots = kept;
  }

  var state = {
    fontId: null,
    fontName: null,
    identity: [],
    css: "",
    original: "",
    baseUrl: new URL(SHIPPED_BASE, document.baseURI).href,
    selection: null, // { glyph, source, pos, jamo, node }
    scope: "slot",
    context: "",
    shared: "edit",
    escalate: null,
    fileHandle: null,
    pristine: null, // { id, css } — 패키지에서 실은 기본 제공 글꼴의 원문(같은 이름 저장 막기·손 보정 옮기기)
    userEdited: false,
    coreLoaded: false
  };
  var baseTexts = {}; // 파생 글꼴의 바탕(기본 제공 글꼴) 지금 원문 — '바탕 새 판 받기'가 쓴다
  var history = Model.createHistory(LANE_STEPS);
  state.undo = history.undo;
  state.redo = history.redo;
  /* CSS 되돌리기 단계마다 처음 고친 시각 — Cmd/Ctrl+Z가 CSS·디자인 기록 중 마지막 일을 고를 때(2026-10-18 검토 D5) */
  var cssTimes = { undo: [], redo: [] };
  /* 같은 단계마다 { label, actor } — 자동화 계약 v1의 history()·change 사건(PLAN-STUDIO-002 S1). cssTimes와 같은 차례·길이 */
  var cssInfo = { undo: [], redo: [] };
  var historyLabel = null; // 다음 CSS 기록 줄의 이름(commit이 그 편집 알림으로 정한다)
  /* 지금 편집하는 행위자(FontStudio.api.setActor) — 기록 줄과 change 사건에 남는다. 화면 편집도 같은 행위자로 적힌다 */
  state.actor = { kind: "human", id: null };
  var loadingNow = 0; // 불러오기 중(emit "load") — 모듈이 싣는 것은 고친 것으로 세지 않는다
  state.dirty = false; // 불러온 뒤 고친 것이 있는가(다른 글꼴을 열기 전에 묻는다, D12)
  state.scopeChosen = false; // 범위를 사람이(또는 setScope가) 골랐는가 — 아니면 글꼴 모양마다의 기본 범위(D2)

  function stampCssHistory() {
    cssTimes.undo.push(Date.now());
    cssInfo.undo.push({ label: historyLabel || "글꼴 CSS 바꾸기", actor: copyActor() });
    while (cssTimes.undo.length > history.undo.length) {
      cssTimes.undo.shift(); // 기록 상한(60)을 넘어 버린 단계
      cssInfo.undo.shift();
    }
    cssTimes.redo = [];
    cssInfo.redo = [];
  }

  function copyActor() {
    return { kind: state.actor.kind, id: state.actor.id };
  }
  var doc = null;
  /* module: 늦게 싣는 무리가 실렸다(이름 — font-studio-lazy.js가 낸다, S6). 처음부터 붙어 있던 모듈이 늦게 온 모듈에 붙는 때 */
  var hooks = { load: [], select: [], project: [], render: [], page: [], change: [], mode: [], catalog: [], font: [], module: [] };
  var messages = {}; // 페이지 → 알림 { text, tone, detail, page } (message·paintMessage)

  /* 재료 탭(font-studio-material.js) 같은 확장이 붙는 지점. 처리기 하나가 던져도 뒤 처리기는 돈다(2026-10-18 검토 — 하나가 던지면
   * 렌더 훅 뒤가 끊겼다) */
  function emit(name, payload) {
    hooks[name].slice().forEach(function (listener) {
      try {
        listener(payload);
      } catch (error) {
        if (window.console && console.error) {
          console.error("font-studio: '" + name + "' 처리기가 실패했습니다", error);
        }
      }
    });
  }

  /* 글꼴 내용이 바뀌었다(자동화 계약 v1의 change 사건 — 개발·검수 사이트 자동 저장이 기댄다): { cause, actor, rev, …extra }.
   * 여기서는 글꼴 CSS(css)와 불러오기(load)만 낸다. 디자인·그림·자소판·검수의 바뀜은 font-studio-api.js가 그 모듈 사건에서 낸다 */
  function changed(cause, extra) {
    var detail = { cause: cause, actor: copyActor(), rev: Model.contentRev(state.css) };
    Object.keys(extra || {}).forEach(function (key) { detail[key] = extra[key]; });
    emit("change", detail);
  }

  // ── 작업실 페이지(2026-10-17 사용자 결정 — 페이지 나누기) ──────────────
  /* 디자인 · 고치기 · 자소판은 주소(?page=)가 다른 페이지다. 한 문서 안에서 바꾸어 고친 것·되돌리기 기록·mount 연결이 그대로
   * 이어진다(따로 된 문서면 페이지마다 끊긴다). 칸은 data-studio-pages로 보이는 페이지를 밝히고 CSS가 나머지를 감춘다.
   * 옛 주소 #studio-material은 자소판 페이지다. */
  var PAGES = ["design", "edit", "sheet", "review"];

  function pageFromUrl() {
    var requested = new URLSearchParams(location.search).get("page");
    if (PAGES.indexOf(requested) >= 0) {
      return requested;
    }
    return location.hash === "#studio-material" ? "sheet" : "design";
  }

  function setPage(name, push) {
    if (PAGES.indexOf(name) < 0) {
      return false;
    }
    var changed = root.dataset.page !== name;
    root.dataset.page = name;
    Array.prototype.forEach.call(root.querySelectorAll("[data-studio-page-link]"), function (link) {
      if (link.closest("[data-studio-pages-nav]")) {
        if (link.getAttribute("data-studio-page-link") === name) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    });
    if (push) {
      var url = new URL(location.href);
      url.searchParams.set("page", name);
      if (url.hash === "#studio-material" && name !== "sheet") {
        url.hash = "";
      }
      try {
        window.history.pushState({ studioPage: name }, "", url.href); // history는 이 파일의 되돌리기 기록이다
      } catch (error) {
        /* file:// 등 주소를 못 바꾸면 화면만 바꾼다 */
      }
    }
    if (changed) {
      if ($("[data-studio-message]")) {
        paintMessage(); // 알림은 그 페이지의 것만
      }
      emit("page", name);
    }
    return true;
  }

  root.addEventListener("click", function (event) {
    var link = event.target.closest ? event.target.closest("[data-studio-page-link]") : null;
    if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return; // 새 탭으로 열기는 그 주소로
    }
    event.preventDefault();
    setPage(link.getAttribute("data-studio-page-link"), true);
    root.scrollIntoView({ block: "start" });
  });
  window.addEventListener("popstate", function () {
    setPage(pageFromUrl(), false);
  });
  setPage(pageFromUrl(), false);

  // ── 보기(쉬운·정밀, PLAN-STUDIO-002 ⚑1·S3) ───────────────────────────────
  /* 한 문서 안의 두 보기(root data-studio-mode). 쉬운은 결과(보이는 글자·위치·크기), 정밀은 원인(규칙·범위·출처·원문)이다. 데이터·
   * 되돌리기·고른 것·저장은 같고 보기만 바뀐다 — 정밀 전용 칸은 [data-studio-precise], 쉬운 전용 칸은 [data-studio-easy](font-studio.css가
   * 감춘다). 처음 보기: 주소 ?mode=(mount mode도 이 주소로 온다) > 이 브라우저에 기억한 사람의 선택(머리 막대의 전환만 기억한다) >
   * 저장소 작업실(shipped-save — mount shippedSave)은 정밀, 그 밖(사이트·서비스)은 쉬운 */
  var MODES = ["easy", "precise"];
  var MODE_KEY = "font-kku-studio-mode";

  function storedMode() {
    try {
      var value = window.localStorage.getItem(MODE_KEY);
      return MODES.indexOf(value) >= 0 ? value : null;
    } catch (error) {
      return null; // 저장소를 못 쓰면(사생활 보호 창 등) 기본값
    }
  }

  function initialMode() {
    var asked = new URLSearchParams(location.search).get("mode");
    if (MODES.indexOf(asked) >= 0) {
      return asked;
    }
    return storedMode() || (SHIPPED_SAVE ? "precise" : "easy");
  }

  /* setMode(name, { remember }) — remember는 사람이 머리 막대에서 바꿀 때만(그 브라우저에 기억하고, 주소에 ?mode=가 있으면 그것도
   * 바꿔 다시 열어도 같다). 자동화 창구(api.setMode)·mount는 기억하지 않는다 */
  function setMode(name, options) {
    if (MODES.indexOf(name) < 0) {
      return false;
    }
    if (options && options.remember) {
      try {
        window.localStorage.setItem(MODE_KEY, name);
      } catch (error) {
        /* 기억하지 못해도 바꾼다 */
      }
      var url = new URL(location.href);
      if (url.searchParams.has("mode") && url.searchParams.get("mode") !== name) {
        url.searchParams.set("mode", name);
        try {
          window.history.replaceState(window.history.state, "", url.href); // history는 이 파일의 되돌리기 기록이다
        } catch (error) {
          /* file:// 등 */
        }
      }
    }
    if (root.dataset.studioMode !== name) {
      root.dataset.studioMode = name;
      emit("mode", name);
    }
    return true;
  }

  root.dataset.studioMode = initialMode();

  function editing() {
    return root.dataset.page === "edit";
  }

  // ── Small helpers ──────────────────────────────────────────────────────

  /* 알림 한 줄 — 한국어 문장(text)과, 있으면 접힌 '자세히'(detail: 변수·줄 번호 같은 원문). 알림은 띄운 페이지의 것이다: 다른 페이지로
   * 가면 그 페이지의 알림이 보이고(없으면 비움), 다음 편집 동작이 지운다(2026-10-18 검토 — 모두 되돌린 뒤에도·다른 페이지에도 남았다).
   * messages(페이지 → 알림)는 맨 위에 둔다 — 첫 setPage가 이 줄보다 먼저 돈다 */

  function paintMessage() {
    var node = $("[data-studio-message]");
    var entry = messages[root.dataset.page] || null;
    node.textContent = "";
    node.dataset.tone = entry ? entry.tone : "info";
    if (!entry) {
      node.removeAttribute("data-page");
      return;
    }
    node.dataset.page = entry.page;
    node.appendChild(document.createTextNode(entry.text));
    if (entry.detail) {
      var more = document.createElement("details");
      more.className = "studio-message-detail";
      var summary = document.createElement("summary");
      summary.textContent = "자세히";
      var raw = document.createElement("span");
      raw.textContent = entry.detail;
      more.appendChild(summary);
      more.appendChild(raw);
      node.appendChild(document.createTextNode(" "));
      node.appendChild(more);
    }
    if (handles) {
      requestAnimationFrame(positionHandles); // 알림 줄 높이가 바뀌면 미리보기가 움직인다
    }
  }

  function message(text, tone, detail) {
    if (capture) {
      capture.messages.push({ text: String(text || ""), tone: tone || "info", detail: detail ? String(detail) : "" });
      return; // 미리 셈(dryRun)은 화면 알림을 바꾸지 않는다
    }
    var page = root.dataset.page;
    if (!text && !detail) {
      delete messages[page];
    } else {
      messages[page] = { text: String(text || ""), tone: tone || "info", detail: detail ? String(detail) : "", page: page };
    }
    paintMessage();
  }

  /* 다음 편집 동작이 앞 알림을 지운다(그 동작이 새 알림을 띄우기 전에) */
  function clearMessage() {
    if (capture) {
      return;
    }
    if (messages[root.dataset.page]) {
      delete messages[root.dataset.page];
      paintMessage();
    }
  }

  /* XHR instead of fetch: under file:// with file access allowed (Firefox
   * same-directory policy, Chromium --allow-file-access-from-files) XHR works
   * while fetch() never does. Over http both work. */
  function readUrl(url) {
    return new Promise(function (resolve, reject) {
      var request = new XMLHttpRequest();
      request.open("GET", url);
      request.onload = function () {
        if (request.status === 200 || (request.status === 0 && request.responseText)) {
          resolve(request.responseText);
        } else {
          reject(new Error("HTTP " + request.status));
        }
      };
      request.onerror = function () { reject(new Error("blocked")); };
      request.send();
    });
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  function shortSelector(selector) {
    var scope = state.fontId ? Model.fontScope(state.fontId) : null;
    var text = scope && Model.sameSelector(selector.slice(0, scope.length), scope) ? selector.slice(scope.length) : selector;
    text = text.replace(/^:where\(\[data-fy-font=[^\]]*\]\)/, "").trim();
    return text || "(바탕 요소)";
  }

  function layerLabel(layer) {
    return LAYER_NAMES[layer] || (layer ? layer : "레이어 밖");
  }

  // ── Document state ─────────────────────────────────────────────────────

  /* Which font the preview shows: the scope selector decides what matches,
   * --fy-font-id names the export. A missing id is reported, never borrowed
   * from the previously loaded font. */
  function identify(nextDoc, fresh) {
    var meta = Model.readMetadata(nextDoc);
    var scopes = Model.scopeFontIds(nextDoc);
    var metaId = meta["font-id"] || null;
    var scopeId = scopes[0] || null;
    /* `lint: true` problems are what the font lint reports too (font-id,
     * scope); the diagnostics list shows the lint's wording instead. */
    var problems = [];
    var id = scopeId || metaId || (fresh ? null : state.fontId);
    if (!metaId) {
      problems.push({ lint: true, text: "--fy-font-id 선언이 없습니다" + (scopeId ? " — scope 셀렉터의 '" + scopeId + "'로 미리 봅니다" : "") });
    } else if (scopeId && metaId !== scopeId) {
      problems.push({ lint: true, text: "--fy-font-id(" + metaId + ")와 scope 셀렉터(" + scopeId + ")가 다릅니다 — 미리보기는 셀렉터를 따릅니다" });
    }
    if (!id) {
      id = "untitled";
      problems.push({ lint: false, text: "글꼴 id를 찾지 못해 'untitled'로 둡니다 — '새 이름'으로 이름을 정하세요" });
    }
    return { id: id, name: metaId || id, problems: problems, meta: meta };
  }

  function setCss(nextCss, options) {
    var opts = options || {};
    if (typeof nextCss !== "string") {
      message("CSS 텍스트가 아닙니다.", "error");
      return false;
    }
    if (!opts.fresh && nextCss === state.css) {
      return true;
    }
    var nextDoc;
    try {
      nextDoc = Model.parse(nextCss);
    } catch (error) {
      message("CSS를 해석하지 못해 바꾸지 않았습니다: " + error.message, "error");
      return false;
    }
    var identity = identify(nextDoc, opts.fresh);
    if (!opts.fresh && !opts.fromHistory) {
      history.record(state.css);
      stampCssHistory();
      timelineRecord("css", { label: historyLabel || "글꼴 CSS 바꾸기", cause: "css", bytes: state.css.length * 2 });
    }
    var label = opts.fromHistory === "undo" ? "되돌리기" : opts.fromHistory === "redo" ? "다시 하기" : historyLabel || "글꼴 CSS 바꾸기";
    state.css = nextCss;
    doc = nextDoc;
    if (opts.fresh) {
      state.original = nextCss;
      if (timeline) {
        timeline.clear(); // 다른 글꼴·프로젝트를 열면 하나의 기록을 비운다(고친 것이 있으면 guardLoad가 먼저 묻는다)
      }
      history.clear();
      cssTimes.undo = [];
      cssTimes.redo = [];
      cssInfo.undo = [];
      cssInfo.redo = [];
    }
    state.fontId = identity.id;
    state.fontName = identity.name;
    state.identity = identity.problems;
    applySheet();
    updateStatus(identity.meta);
    if (!opts.fresh) {
      state.userEdited = true;
      state.dirty = true;
      scheduleDraftSave();
      changed("css", { label: label, via: opts.fromHistory || "edit" });
    }
    return true;
  }

  function applySheet() {
    var previewCss = Model.rewriteUrls(state.css, state.baseUrl);
    try {
      fontSheet.replaceSync(previewCss);
    } catch (error) {
      message("미리보기에 CSS를 적용하지 못했습니다: " + error.message, "error");
    }
    try {
      documentSheet.replaceSync(Model.extractAtRules(previewCss, ["font-face", "property"]));
    } catch (error) {
      documentSheet.replaceSync("");
    }
    adoptPreviewSheets();
    renderPreview();
  }

  var renderSeq = 0;

  /* 미리보기를 지금 글꼴 시트로 다시 그린다. FontKku.render가 바탕 요소의 스타일(깊이·재료·글꼴 id)을 새로 읽으므로 뒤에
   * refreshAll(host)을 다시 부르지 않는다 — 같은 요소를 한 번 더 읽고 머리 음절·원소 굵기를 다시 맞추기만 했다(글꼴 22개 × 열기·값
   * 고침·글 바꿈·되돌리기에서 바뀐 것 0, 값 고침 한 번에 약 6ms — PLAN-STUDIO-002 S6 성능) */
  function renderPreview() {
    if (window.FontStudio && window.FontStudio.glyphs) { window.FontStudio.glyphs.applyPreviewOptions(host); }
    host.setAttribute("font", state.fontId || "untitled");
    FontKku.render(host, { text: textInput.value });
    renderSeq += 1;
    root.dataset.renderSeq = String(renderSeq);
    restoreSelection();
    scheduleChecks();
    emit("render", host);
    renderGlobals();
  }

  function updateStatus(meta) {
    var info = meta || Model.readMetadata(doc);
    $("[data-studio-font-id]").textContent = info["font-id"] || "(없음)";
    $("[data-studio-contract]").textContent = info.contract || "(없음)";
    $("[data-studio-material]").textContent = info.material || "(없음)";
    $("[data-studio-changes]").textContent = String(Model.lineDiffCount(state.original, state.css));
    root.dataset.fontId = state.fontId;
    renderDiagnostics();
    syncSource(false);
    renderDerived();
  }

  /* The font lint (authoring/font-kku-lint.js, ADR-008 §9) on the current CSS:
   * the same grammar check_css_contract.js --check applies to shipped fonts,
   * parse errors included. The file name is the export name. Without the
   * lint script (older page) the model's own diagnostics stand in. */
  var lintCache = { css: null, name: null, findings: [] };

  function lintFindings() {
    var name = (state.fontName || state.fontId || "untitled") + ".css";
    if (lintCache.css === state.css && lintCache.name === name) {
      return lintCache.findings;
    }
    var findings = Lint
      ? Lint.lint(state.css, { fileName: name })
      : Model.diagnostics(doc).filter(function (entry) { return entry.code !== "unknown-at-rule" || entry.severity === "error"; });
    lintCache = { css: state.css, name: name, findings: findings };
    return findings;
  }

  function lintErrorCount() {
    return lintFindings().filter(function (entry) { return entry.severity === "error"; }).length;
  }

  /* Lint findings (with line numbers) and the preview identity notes the
   * lint does not cover. Non-blocking: editing and export continue. */
  function renderDiagnostics() {
    var list = $("[data-studio-diagnostics]");
    var findings = lintFindings();
    var items = state.identity.filter(function (problem) { return !(Lint && problem.lint); }).map(function (problem) {
      return { severity: "warning", code: "identity", line: null, message: problem.text };
    }).concat(findings);
    list.textContent = "";
    items.slice(0, 12).forEach(function (entry) {
      var item = document.createElement("li");
      item.dataset.severity = entry.severity;
      item.dataset.code = entry.code;
      if (entry.line) {
        item.dataset.line = String(entry.line);
      }
      item.textContent = (entry.line ? "L" + entry.line + " " : "") + "[" + entry.code + "] " + entry.message;
      list.appendChild(item);
    });
    if (items.length > 12) {
      var more = document.createElement("li");
      more.textContent = "… 외 " + (items.length - 12) + "건";
      list.appendChild(more);
    }
    list.hidden = items.length === 0;
    /* 쉬운 모드는 목록 대신 한 줄(줄 번호·검사 코드는 정밀 모드의 목록에) */
    var summary = $("[data-studio-diagnostics-summary]");
    if (summary) {
      summary.textContent = "";
      summary.hidden = items.length === 0;
      if (items.length) {
        var errors = items.filter(function (entry) { return entry.severity === "error"; }).length;
        summary.appendChild(document.createTextNode("⚠ 글꼴 검사 " + (errors ? "오류 " + errors + "건" : "") +
          (errors && items.length > errors ? " · " : "") + (items.length > errors ? "경고 " + (items.length - errors) + "건" : "") +
          " — 고치거나 저장할 수는 있습니다. "));
        var more = document.createElement("button");
        more.type = "button";
        more.className = "studio-link-button";
        more.dataset.studioToPrecise = "";
        more.textContent = "정밀 모드에서 보기";
        summary.appendChild(more);
      }
    }
    root.dataset.diagnostics = String(items.length);
    root.dataset.lintErrors = String(findings.filter(function (entry) { return entry.severity === "error"; }).length);
  }

  // ── 글꼴 CSS 원문 고쳐 쓰기(정밀 모드, PLAN-STUDIO-002 ⚑6 S3) ───────────────
  /* 원문 칸은 고쳐 쓸 수 있다(2026-09-24 사용자 결정 — CSS 손 편집이 핵심). 적용은 Ctrl/Cmd+Enter·'적용' 단추·칸을 떠날 때(change)이고,
   * 적용은 다른 편집과 같은 길(commit → setCss: 하나의 기록 한 줄·미리보기·검사·초안·저장 창구의 change 사건)이다. 구문 오류(Model.parse
   * 의 error)가 있으면 적용하지 않고 칸에 남겨 오류를 줄 번호와 함께 보인다. Esc·'되돌림'은 칸을 지금 CSS로. 고치는 중에는 다른 편집이
   * 와도 칸을 덮지 않는다(초안을 잃지 않게) — 적용이나 되돌림이 다시 맞춘다. 칸 안의 Ctrl+Z는 칸의 되돌리기다(하나의 기록 아님) */
  var sourceArea = $("[data-studio-source]");
  var sourceErrors = [];

  function sourceDirty() {
    return sourceArea.dataset.dirty === "true";
  }

  function sourceLine(text, index) {
    var lines = text.split("\n");
    var start = 0;
    for (var line = 1; line < index && line <= lines.length; line += 1) {
      start += lines[line - 1].length + 1;
    }
    var length = (lines[index - 1] || "").length;
    return { start: start, end: start + length };
  }

  function renderSourceState() {
    var dirty = sourceDirty();
    var stateLine = $("[data-studio-source-state]");
    var findings = dirty ? sourceErrors : lintFindings();
    root.dataset.sourceState = dirty ? (sourceErrors.length ? "invalid" : "dirty") : "clean";
    $("[data-studio-source-apply]").disabled = !dirty;
    $("[data-studio-source-revert]").disabled = !dirty;
    stateLine.textContent = !dirty ? "고쳐 쓰고 Ctrl+Enter(⌘Enter)로 적용"
      : sourceErrors.length ? "구문 오류 " + sourceErrors.length + "건 — 적용하지 않았습니다"
        : "적용하지 않은 원문 — Ctrl+Enter(⌘Enter)로 적용, Esc로 되돌림";
    var list = $("[data-studio-source-lint]");
    list.textContent = "";
    findings.slice(0, 40).forEach(function (entry) {
      var item = document.createElement("li");
      item.dataset.severity = entry.severity || "warning";
      if (entry.line) {
        item.dataset.line = String(entry.line);
        var jump = document.createElement("button");
        jump.type = "button";
        jump.className = "studio-link-button";
        jump.dataset.studioSourceLine = String(entry.line);
        jump.textContent = "L" + entry.line;
        item.appendChild(jump);
        item.appendChild(document.createTextNode(" "));
      }
      item.appendChild(document.createTextNode((entry.code ? "[" + entry.code + "] " : "") + entry.message));
      list.appendChild(item);
    });
    if (findings.length > 40) {
      var more = document.createElement("li");
      more.textContent = "… 외 " + (findings.length - 40) + "건";
      list.appendChild(more);
    }
    list.hidden = findings.length === 0;
  }

  /* 지금 CSS를 칸에 — 고치는 중(적용 안 한 원문)이면 덮지 않는다 */
  function syncSource(force) {
    if (!sourceArea) {
      return;
    }
    if (force || !sourceDirty()) {
      sourceArea.value = state.css;
      sourceArea.dataset.dirty = "false";
      sourceErrors = [];
    }
    renderSourceState();
  }

  function applySource() {
    var text = sourceArea.value;
    if (text === state.css) {
      syncSource(true);
      return { ok: true, effect: "unchanged" };
    }
    var parsed;
    try {
      parsed = Model.parse(text);
    } catch (error) {
      parsed = { errors: [{ severity: "error", line: null, message: error.message }] };
    }
    var errors = (parsed.errors || []).filter(function (entry) { return entry.severity === "error"; });
    /* 막는 것은 새로 생긴 구문 오류뿐 — 연 CSS가 이미 브라우저처럼 복구해 읽은 오류를 가졌으면 그 수까지는 받는다 */
    var already = doc ? doc.errors.filter(function (entry) { return entry.severity === "error"; }).length : 0;
    if (errors.length > already) {
      sourceErrors = errors.map(function (entry) { return { severity: "error", line: entry.line, code: "syntax", message: entry.message }; });
      sourceArea.dataset.dirty = "true";
      renderSourceState();
      var refusalEntry = showRefusal(makeRefusal("SOURCE_INVALID", { count: errors.length,
        detail: errors.slice(0, 3).map(function (entry) { return (entry.line ? "L" + entry.line + " " : "") + entry.message; }).join(" · ") }));
      var out = refusedResult(refusalEntry);
      out.errors = sourceErrors.slice();
      return out;
    }
    sourceArea.dataset.dirty = "false";
    sourceErrors = [];
    var done = commit(text, "원문을 고쳐 적용했습니다.");
    syncSource(true);
    var warning = lintWarning("적용했습니다");
    if (done && warning) {
      message("원문을 고쳐 적용했습니다." + warning, "warn");
    }
    return { ok: Boolean(done), effect: done ? "ok" : "refused" };
  }

  function revertSource() {
    syncSource(true);
    message("원문 칸을 지금 CSS로 되돌렸습니다.");
  }

  if (sourceArea) {
    sourceArea.addEventListener("input", function () {
      sourceArea.dataset.dirty = sourceArea.value === state.css ? "false" : "true";
      sourceErrors = [];
      renderSourceState();
    });
    sourceArea.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        applySource();
      } else if (event.key === "Escape" && sourceDirty()) {
        event.preventDefault();
        event.stopPropagation();
        revertSource();
      }
    });
    /* 칸을 떠나면 적용(change는 고친 것이 있을 때만 온다). 구문 오류면 칸에 남는다 */
    sourceArea.addEventListener("change", function () {
      if (sourceDirty() && !sourceErrors.length) {
        applySource();
      }
    });
    $("[data-studio-source-apply]").addEventListener("click", function () { applySource(); });
    $("[data-studio-source-revert]").addEventListener("click", revertSource);
    $("[data-studio-source-lint]").addEventListener("click", function (event) {
      var jump = event.target.closest("[data-studio-source-line]");
      if (!jump) {
        return;
      }
      var range = sourceLine(sourceArea.value, Number(jump.dataset.studioSourceLine));
      sourceArea.focus({ preventScroll: true });
      sourceArea.setSelectionRange(range.start, range.end);
      var lineHeight = parseFloat(getComputedStyle(sourceArea).lineHeight) || 16;
      sourceArea.scrollTop = Math.max(0, (Number(jump.dataset.studioSourceLine) - 3) * lineHeight);
    });
  }

  /* Before export/save: the file still goes out (the lint never blocks), but
   * the author is told it would fail check_css_contract.js. */
  function lintWarning(action) {
    var errors = lintErrorCount();
    if (!errors) {
      return "";
    }
    if (root.dataset.studioMode === "easy") {
      return " ⚠ 글꼴 검사 오류 " + errors + "건이 있는 채로 " + action + "(정밀 모드에서 볼 수 있습니다).";
    }
    var first = lintFindings().filter(function (entry) { return entry.severity === "error"; })[0];
    return " ⚠ 글꼴 계약 검사 오류 " + errors + "건이 있는 채로 " + action + " — 첫 오류 L" + first.line + " [" + first.code + "] " +
      first.message.slice(0, 80) + (first.message.length > 80 ? "…" : "") + " (아래 경고 목록)";
  }

  /* Load-time note: syntax errors (recovered like a browser) and the number
   * of font lint errors (details in the diagnostics list). */
  function parseSummary() {
    var errors = doc.errors.filter(function (entry) { return entry.severity === "error"; });
    if (root.dataset.studioMode === "easy") {
      var lintOnly = lintErrorCount() - errors.length;
      return (errors.length ? " · 글꼴 CSS에 고칠 곳 " + errors.length + "곳 — 브라우저처럼 읽어 열었습니다" : "") +
        (Lint && lintOnly > 0 ? " · 글꼴 검사 오류 " + lintOnly + "건(정밀 모드에서 볼 수 있습니다)" : "");
    }
    var summary = errors.length
      ? " · 구문 오류 " + errors.length + "건 (L" + errors[0].line + ": " + errors[0].message + ") — 브라우저처럼 복구해 읽었습니다"
      : "";
    var lintErrors = lintErrorCount() - errors.length;
    if (Lint && lintErrors > 0) {
      summary += " · 글꼴 계약 검사 오류 " + lintErrors + "건 — 아래 경고 목록(편집·내보내기는 계속할 수 있습니다)";
    }
    return summary;
  }

  function loadTone() {
    return doc.errors.length || lintErrorCount() ? "warn" : "info";
  }

  // ── Drafts ─────────────────────────────────────────────────────────────
  /* 초안은 사용자가 편집한 뒤에만 저장한다(불러오기만으로는 쓰지 않는다).
   * 시작할 때 남아 있던 초안은 복원하거나 버릴 때까지 보관한다. */

  var draftTimer = null;
  var pendingDrafts = [];
  /* 저장 창구 상태(아래 '저장 창구') — store: 지금 창구, revs: 글꼴마다 창구에서 마지막으로 읽거나 쓴 판(If-Match), foreign: 다른
   * 행위자가 바꾼 판(알림을 받았거나 409) */
  var storeState = { store: null, revs: {}, unwatch: null, watching: null, foreign: null };

  function draftStatus(text, tone) {
    var node = $("[data-studio-draft-status]");
    node.textContent = text || "";
    node.dataset.tone = tone || "info";
    root.dataset.draftState = tone === "error" ? "failed" : tone === "warn" ? "partial" : text ? "saved" : "";
  }

  function readStorage(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      var value = JSON.parse(raw);
      /* 초안 판 2는 글꼴 묶음을 담는다(S2). 판 1(프로젝트)과 그 전 { css, baseUrl, text }도 읽는다 — 복원은 프로젝트 모양으로 하고,
       * 묶음이 모르는 칸(package)도 같이 둔다 */
      if (value && value.format === DRAFT_FORMAT && value.version === 2 && value.package && Package) {
        var read = Package.fromDraft(value);
        if (!read.ok) {
          return null;
        }
        var entry = { format: DRAFT_FORMAT, version: 2, savedAt: value.savedAt || null, project: Package.toProject(read.package), package: read.package };
        Object.defineProperty(entry, "raw", { value: value }); // 옆 칸(:pending)으로 옮길 때는 읽은 그대로
        return entry;
      }
      if (value && value.format === DRAFT_FORMAT && value.project && value.project.font && typeof value.project.font.css === "string") {
        return value;
      }
      if (value && typeof value.css === "string") { // 이전 형식 { css, baseUrl, text }
        return { format: DRAFT_FORMAT, version: 1, savedAt: null, project: { font: { css: value.css, baseUrl: value.baseUrl }, preview: { text: value.text } } };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error };
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // 저장소가 막혀 있으면 지울 것도 없다
    }
  }

  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    root.dataset.draftPending = "true";
    draftTimer = setTimeout(saveDraftNow, 400);
  }

  function saveDraftNow() {
    clearTimeout(draftTimer);
    draftTimer = null;
    root.dataset.draftPending = "false";
    if (!state.userEdited || !doc) {
      return false;
    }
    /* 복원하지 않은 시작 초안이 자동 저장 칸(DRAFT_KEY)에 있으면 먼저 옆 칸으로 옮긴다. */
    var unresolved = pendingDrafts.filter(function (entry) { return entry.key === DRAFT_KEY && !entry.preserved; })[0];
    if (unresolved) {
      var kept = writeStorage(DRAFT_PENDING_KEY, unresolved.draft.raw || unresolved.draft);
      if (!kept.ok) {
        draftStatus("복원하지 않은 초안을 보관할 공간이 없어 자동 저장을 멈췄습니다 — 초안을 복원하거나 버리세요", "error");
        return false;
      }
      unresolved.preserved = true;
      unresolved.key = DRAFT_PENDING_KEY;
      pendingDrafts = pendingDrafts.filter(function (entry) { return entry === unresolved || entry.key !== DRAFT_PENDING_KEY; });
      renderDraftBar();
    }
    /* 초안 판 2 — 글꼴 묶음 모양(S2). 묶음 모델이 없으면(옛 페이지) 판 1(프로젝트) */
    var draft;
    var parts;
    if (Package) {
      draft = Package.toDraft(packageSnapshot({ history: false }), new Date().toISOString()); // 편집 기록은 초안에 넣지 않는다(저장 공간)
      parts = draft.package;
    } else {
      draft = { format: DRAFT_FORMAT, version: 1, savedAt: new Date().toISOString(), project: projectSnapshot() };
      parts = draft.project;
    }
    var result = writeStorage(DRAFT_KEY, draft);
    var time = new Date().toLocaleTimeString();
    if (result.ok) {
      draftStatus("초안 저장됨 " + time);
      return true;
    }
    if (parts.material && parts.material.sheet) {
      var lean = JSON.parse(JSON.stringify(draft));
      var leanParts = lean.package || lean.project;
      delete leanParts.material.sheet;
      leanParts.material.sheetOmitted = true;
      var retry = writeStorage(DRAFT_KEY, lean);
      if (retry.ok) {
        draftStatus("초안 저장됨 " + time + " — 자소판은 저장 공간이 부족해 빠졌습니다. '프로젝트 저장'으로 보관하세요", "warn");
        return true;
      }
    }
    draftStatus("초안을 저장하지 못했습니다: " + (result.error && result.error.name === "QuotaExceededError"
      ? "저장 공간이 부족합니다" : (result.error && result.error.message) || "저장소를 쓸 수 없습니다") + " — 'CSS 내보내기'나 '프로젝트 저장'을 쓰세요", "error");
    return false;
  }

  function draftLabel(entry) {
    var project = entry.draft.project;
    var meta = Model.readMetadata(project.font.css);
    var when = entry.draft.savedAt ? new Date(entry.draft.savedAt).toLocaleString() : "시각 모름";
    return (meta["font-id"] || project.font.id || "이름 없음") + " · " + when;
  }

  function renderDraftBar() {
    var bar = $("[data-studio-draft]");
    var list = $("[data-studio-draft-list]");
    list.textContent = "";
    pendingDrafts.forEach(function (entry, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.studioRestoreDraft = String(index);
      button.textContent = (index === 0 ? "초안 복원" : "이전 초안 복원") + " (" + draftLabel(entry) + ")";
      list.appendChild(button);
    });
    bar.hidden = pendingDrafts.length === 0;
  }

  function restoreDraft(index) {
    var entry = pendingDrafts[index];
    if (!entry) {
      return false;
    }
    var project = entry.draft.project;
    var loaded = loadFontText(project.font.css, {
      baseUrl: project.font.baseUrl,
      previewText: project.preview && project.preview.text,
      material: project.material && project.material.sheet ? project.material : null,
      design: project.design || null,
      review: project.review || null,
      reproducibility: project.reproducibility || null,
      packageMeta: packageMetaOf(entry.draft.package || null, project)
    });
    if (!loaded) {
      return false;
    }
    removeStorage(DRAFT_PENDING_KEY);
    pendingDrafts = [];
    renderDraftBar();
    state.userEdited = true;
    state.dirty = true; // 초안은 파일로 저장하지 않은 작업이다(다른 글꼴을 열기 전에 묻는다)
    saveDraftNow();
    message("초안(" + draftLabel(entry) + ")을 복원했습니다." + parseSummary() +
      (project.material && project.material.sheetOmitted ? " 자소판은 초안에 없어 글꼴의 자소판을 씁니다." : ""), loadTone());
    return true;
  }

  function discardDrafts() {
    removeStorage(DRAFT_PENDING_KEY);
    if (!state.userEdited) {
      removeStorage(DRAFT_KEY);
    }
    pendingDrafts = [];
    renderDraftBar();
    message("초안을 버렸습니다.");
  }

  // ── Loading ────────────────────────────────────────────────────────────

  /* Replace the edited font with `css` as a fresh document. `extra` carries
   * what the source brought along (project material, preview text, the file
   * handle it came from). Parses first; nothing changes when that fails. */
  /* 불러오기 차례 — 처음 글꼴을 받는 중에 다른 글꼴을 고르거나(예제 열기·불러오기) 파일·초안을 열면 늦게 끝난 앞 주소
   * 요청이 그 글꼴을 덮어쓰지 않게, 가장 나중에 시작한 불러오기만 적용한다. lastLoad는 마지막으로 실은 불러오기의 옵션 —
   * 늦게 붙는 모듈(재료)이 놓친 불러오기를 같은 옵션(초안의 자소판 등)으로 따라잡는다. */
  var loadTicket = 0;
  var lastLoad = null;

  function loadFontText(css, extra) {
    var options = extra || {};
    /* 어느 길로 싣든(주소·파일·프로젝트·초안) 그보다 먼저 시작해 아직 받는 중인 주소 불러오기는 버린다 */
    loadTicket += 1;
    if (typeof css !== "string") {
      message("CSS 텍스트가 아닙니다.", "error");
      return false;
    }
    if (options.baseUrl) {
      state.baseUrl = options.baseUrl;
    }
    if (typeof options.previewText === "string") {
      textInput.value = options.previewText;
    }
    state.selection = null;
    state.escalate = null;
    state.fileHandle = options.fileHandle || null;
    if (!setCss(css, { fresh: true })) {
      return false;
    }
    /* 연 묶음이 들고 온 것(모르는 칸·처음 만든 시각·라이선스·저장 창구 판) — 다시 저장할 때 돌려놓는다. 다른 길로 열면 비운다 */
    state.packageMeta = options.packageMeta || null;
    state.saved = false; // 이 글꼴을 저장 창구로 저장했는가(처음 저장만 묻는다)
    state.pristine = options.shipped ? { id: options.shipped, css: css } : null;
    if (!state.pristine) {
      fetchPristine(state.fontName);
    }
    lastLoad = options;
    syncShippedSelect();
    /* 불러오는 동안 모듈이 싣는 것(초안·프로젝트의 디자인·자소판)은 고친 것이 아니다 — 불러온 뒤부터 고친 것을 센다(D12) */
    loadingNow += 1;
    try {
      emit("load", options);
    } finally {
      loadingNow -= 1;
    }
    state.dirty = false;
    changed("load", { label: "불러오기" });
    return true;
  }

  /* note: 불러온 뒤 알림 앞에 붙일 말(모르는 글꼴 이름을 기본 글꼴로 바꿔 열었을 때 등). fallback: 실패하고 아직 아무 글꼴도 없으면
   * 대신 열 기본 제공 글꼴 — 준비되지 않은 채 멈추지 않게(2026-10-18 검토 D1) */
  function loadFromUrl(url, label, shipped, note, fallback) {
    var absolute = new URL(url, document.baseURI).href;
    var ticket = ++loadTicket;
    return Promise.all([readUrl(absolute), coreReady]).then(function (results) {
      if (ticket !== loadTicket) {
        return;
      }
      if (loadFontText(results[0], { baseUrl: new URL(".", absolute).href, shipped: shipped || null })) {
        message((note ? note + " " : "") + (label || absolute) + "를 불러왔습니다." + parseSummary(), note ? "warn" : loadTone());
      }
    }, function (error) {
      if (ticket !== loadTicket) {
        return;
      }
      var status = /^HTTP (\d+)/.exec(error && error.message || "");
      var text = status
        ? "글꼴 파일을 찾지 못했습니다(" + (label || absolute) + ", HTTP " + status[1] + ")."
        : "브라우저가 글꼴 파일 읽기를 막았습니다. 'CSS 열기'로 파일을 고르거나 정적 서버로 여세요.";
      if (!doc && fallback && fallback !== shipped) {
        loadShipped(fallback, (note ? note + " " : "") + text + " 기본 글꼴 " + fallback + "을 대신 엽니다.");
        return;
      }
      message(text, "warn", absolute);
    });
  }

  function loadShipped(id, note) {
    syncShippedSelect(id);
    return loadFromUrl(SHIPPED_BASE + id + ".css", id + ".css", id, note, fontCatalog.defaultFont);
  }

  // ── 기본 제공 글꼴 목록(spec/fonts.json, 2026-10-18 검토 D1 — 22개 중 4개만 열렸다) ─────────
  /* 목록은 패키지의 spec/fonts.json(글꼴 메타 정본)에서 만든다: 바탕 글꼴과 파생 글꼴(derivedFrom)로 묶고, 별칭(default·classic·
   * gothic2)은 목록에 두지 않되 주소 ?font=로 오면 그 글꼴로 연다. 읽지 못하면(file:// 막힘 등) 페이지의 기본 칸에 파생 글꼴 계산
   * (FontKkuDerive.SHIPPED_FONTS — spec과 대조하는 시험이 있다)을 더한다 */
  var FONTS_URL = "../spec/fonts.json";
  var fontCatalog = { fonts: [], aliases: {}, defaultFont: "sebul", loaded: false };

  function readCatalog() {
    return readUrl(new URL(FONTS_URL, document.baseURI).href).then(function (text) {
      var spec = JSON.parse(text);
      var fonts = Object.keys(spec.fonts || {}).map(function (id) {
        return { id: id, base: (spec.fonts[id] && spec.fonts[id].derivedFrom) || null };
      });
      if (!fonts.length) {
        throw new Error("no fonts");
      }
      fontCatalog = { fonts: fonts, aliases: spec.aliases || {}, defaultFont: spec.defaultFont || "sebul", loaded: true };
    }).catch(function () {
      /* spec/fonts.json을 읽지 못하면 바탕 넷과 파생 글꼴 모듈이 아는 이름으로 */
      var names = ["sebul", "gothic", "sprite-example", "sprite-system"];
      (Derive ? Derive.SHIPPED_FONTS : []).forEach(function (name) {
        if (names.indexOf(name) < 0 && ["default", "classic", "gothic2"].indexOf(name) < 0) {
          names.push(name);
        }
      });
      fontCatalog = { fonts: names.map(function (id) { return { id: id, base: null }; }), aliases: { "default": "sebul", classic: "sebul", gothic2: "gothic" },
        defaultFont: "sebul", loaded: false };
    }).then(renderFontCatalog);
  }

  function catalogHas(id) {
    return fontCatalog.fonts.some(function (entry) { return entry.id === id; });
  }

  /* 주소·호스트가 준 이름 → 열 기본 제공 글꼴 id(별칭은 그 글꼴로), 모르면 null */
  function resolveShipped(name) {
    var id = String(name == null ? "" : name).trim().toLowerCase();
    if (catalogHas(id)) {
      return id;
    }
    var alias = fontCatalog.aliases[id];
    return alias && catalogHas(alias) ? alias : null;
  }

  /* 글꼴 목록이 섰다 — 머리 막대의 글꼴 고르기(font-studio-header.js)가 catalog 훅으로 메뉴를 다시 만든다 */
  function renderFontCatalog() {
    root.dataset.shippedFonts = String(fontCatalog.fonts.length);
    emit("catalog", JSON.parse(JSON.stringify(fontCatalog)));
  }

  /* 글꼴 고르기는 지금 연(여는) 글꼴을 보인다 — 목록 밖 글꼴(새 이름·파일)도 그 이름으로. font 훅: { id, shipped } */
  function syncShippedSelect(id) {
    var name = id === undefined ? state.fontName : id;
    root.dataset.currentFont = name || "";
    emit("font", { id: name || null, shipped: catalogHas(name) });
  }

  // ── 파생 글꼴과 기본 제공 글꼴의 저장(ADR-030 §8) ──────────────────────

  /* 기본 제공 글꼴의 패키지 원문 — 파일·초안·프로젝트로 연 글꼴이 기본 제공 이름이면 뒤에서 받아 둔다 */
  function shippedText(id) {
    if (baseTexts[id] !== undefined) {
      return Promise.resolve(baseTexts[id]);
    }
    return readUrl(new URL(SHIPPED_BASE + id + ".css", document.baseURI).href).then(function (text) {
      baseTexts[id] = text;
      return text;
    }, function () {
      baseTexts[id] = null;
      return null;
    });
  }

  function fetchPristine(name) {
    if (!Derive || !Derive.shipped(name)) {
      return;
    }
    shippedText(name).then(function (text) {
      if (text !== null && state.fontName === name && !state.pristine) {
        state.pristine = { id: name, css: text };
        renderDerived();
      }
    });
  }

  /* 고친 기본 제공 글꼴을 같은 이름으로 내보내려 하면 막는 까닭(막지 않으면 null) */
  function sameNameBlock() {
    if (SHIPPED_SAVE || !Derive || !Derive.shipped(state.fontName)) {
      return null;
    }
    if (state.pristine && state.pristine.id === state.fontName && state.pristine.css === state.css) {
      return null;
    }
    return "기본 제공 글꼴 " + state.fontName + "은 고친 채 같은 이름으로 저장하지 않습니다 — '새 이름'을 정하고 '이 글꼴로 새 글꼴'을 누르세요" +
      " (바탕은 판을 고정해 옮기고, 고친 것은 손 보정이 됩니다).";
  }

  function blockedSave() {
    var reason = sameNameBlock();
    if (!reason) {
      return false;
    }
    /* 쉬운 모드에는 '새 이름' 칸이 없다 — '저장'이 바로 새 글꼴(제안 이름)로 저장하니 그 단추로 이끈다(정밀 모드에 가지 않고 끝낼 수
     * 있게, 2026-10-18 사용자 원칙) */
    if (root.dataset.studioMode === "easy") {
      message("기본 제공 글꼴 " + state.fontName + "을 고쳐서 같은 이름으로는 내보내지 않습니다 — '저장'을 누르면 새 글꼴(" +
        suggestName(state.fontName) + ")로 저장되고, 그 뒤에 CSS를 내보낼 수 있습니다.", "warn");
      var save = $("[data-studio-save-all]");
      if (save) {
        save.focus();
      }
      return true;
    }
    message(reason, "warn");
    var more = $("[data-studio-bar-more]");
    if (more) {
      more.open = true; // 새 이름 칸은 막대의 '새 이름 · 파일 연결 · 그 밖'에 있다(S2 머리 막대)
    }
    var field = $("[data-studio-new-name]");
    if (field) {
      field.focus();
    }
    return true;
  }

  /* 내보낼 글 — '통째로 풀어 저장'을 고르면 파생 글꼴의 구간 표시를 뗀다 */
  function flattening() {
    var box = $("[data-studio-flatten]");
    return Boolean(Derive && box && box.checked && Derive.parse(state.css));
  }

  function outputCss() {
    return flattening() ? Derive.flatten(state.css) : state.css;
  }

  function derivedInfo() {
    var found = Derive ? Derive.parse(state.css) : null;
    if (!found) {
      return null;
    }
    var title = Derive.header(state.css);
    var base = title ? title.base : found.base;
    var current = title && Derive.shipped(base) ? baseTexts[base] : undefined;
    return {
      base: base,
      version: title ? title.version : null,
      hash: title ? title.hash : null,
      studio: Boolean(title),
      outdated: typeof current === "string" ? !Derive.upToDate(state.css, current) : false
    };
  }

  function renderDerived() {
    var line = $("[data-studio-derived]");
    var rebase = $("[data-studio-rebase]");
    var flatten = $("[data-studio-flatten-option]");
    if (!line) {
      return;
    }
    var info = derivedInfo();
    var text = "";
    if (info && info.studio) {
      text = "파생 글꼴 — 바탕 " + info.base + (info.version ? " " + info.version : "") + "(판 고정). 바탕 구간은 잠겨 있고 고친 값은 그 아래 손 보정에 씁니다." +
        (info.outdated ? " 바탕에 새 판이 있습니다." : "");
      if (Derive.shipped(info.base) && baseTexts[info.base] === undefined) {
        shippedText(info.base).then(renderDerived);
      }
    } else if (info) {
      text = "파생 글꼴 — 바탕 " + (info.base || "?") + ". 바탕 구간은 잠겨 있고(저장소에서는 scripts/build_derived_fonts.js가 다시 씁니다) 고친 값은 그 아래에 씁니다.";
    } else if (Derive && Derive.shipped(state.fontName) && !SHIPPED_SAVE) {
      text = "기본 제공 글꼴 — 고친 것은 '저장'이 새 이름의 파생 글꼴로 저장합니다(바탕은 판을 고정해 옮기고 고친 것은 손 보정으로).";
    }
    line.textContent = text;
    line.hidden = !text;
    root.dataset.derived = info ? (info.studio ? (info.outdated ? "outdated" : "studio") : "repo") : "";
    if (rebase) {
      rebase.hidden = !(info && info.outdated);
    }
    if (flatten) {
      flatten.hidden = !info;
    }
  }

  /* 바탕 새 판 받기 — 바탕 구간만 지금 패키지의 바탕으로 다시 쓴다(손 보정은 그대로, 되돌리기 한 단계) */
  function rebaseDerived() {
    var info = derivedInfo();
    if (!info || !info.studio || typeof baseTexts[info.base] !== "string") {
      message("바탕 새 판을 받을 수 없습니다 — 작업실이 만든 파생 글꼴이고 바탕이 기본 제공 글꼴이어야 합니다.", "warn");
      return false;
    }
    var next;
    try {
      next = Derive.rebase(state.css, baseTexts[info.base], { version: FontKku.version });
    } catch (error) {
      message("바탕 새 판을 받지 못했습니다: " + error.message, "error");
      return false;
    }
    if (next === state.css) {
      message("바탕 " + info.base + "이 이미 지금 판입니다.");
      return true;
    }
    if (!setCss(next)) {
      return false;
    }
    message("바탕 " + info.base + " 새 판(" + FontKku.version + ")을 받았습니다 — 손 보정은 그대로입니다. 되돌리기로 돌아갈 수 있습니다.");
    return true;
  }

  /* 프로젝트 v2 또는 글꼴 묶음 열기(mount loadProject·초안·파일 모두 이 길) — 묶음은 프로젝트 모양으로 바꿔 모듈이 지금처럼 받는다 */
  function loadProject(project) {
    if (Package && project && project.format === Package.FORMAT) {
      var checked = Package.validate(project);
      if (!checked.ok) {
        throw new Error("글꼴 묶음을 열 수 없습니다: " + checked.errors.map(function (entry) { return (entry.path ? entry.path + ": " : "") + entry.message; }).join("; "));
      }
      return loadPackage(checked.package);
    }
    if (!project || project.format !== PROJECT_FORMAT || project.version !== PROJECT_VERSION ||
        !project.font || typeof project.font.css !== "string") {
      throw new Error("font-kku-font-project v2 파일이 아닙니다");
    }
    return loadFontText(project.font.css, {
      baseUrl: project.font.baseUrl,
      previewText: project.preview && project.preview.text,
      material: project.material || null,
      design: project.design || null,
      review: project.review || null,
      reproducibility: project.reproducibility || null,
      packageMeta: packageMetaOf(null, project)
    });
  }

  /* 연 묶음·프로젝트가 들고 온 것 중 작업실 모듈이 모르는 것 — 다시 저장할 때 그대로 돌려놓는다(ADR-032 §7) */
  function packageMetaOf(pkg, project) {
    if (!Package) {
      return null;
    }
    var from = pkg || (project ? Package.fromProject(project) : null);
    if (!from) {
      return null;
    }
    return {
      keep: Package.keptFields(from),
      extra: from.extra ? JSON.parse(JSON.stringify(from.extra)) : null,
      createdAt: pkg && from.manifest ? from.manifest.createdAt || null : null,
      license: from.manifest && from.manifest.license ? from.manifest.license : null,
      history: pkg && pkg.history !== undefined ? pkg.history : null
    };
  }

  /* 글꼴 묶음 열기 — options: { rev(저장 창구 판), store(창구에서 왔으면 true) } */
  function loadPackage(pkg, options) {
    var opts = options || {};
    var project = Package.toProject(pkg);
    var meta = packageMetaOf(pkg, null);
    var loaded = loadFontText(project.font.css, {
      baseUrl: project.font.baseUrl,
      previewText: project.preview && project.preview.text,
      material: project.material || null,
      design: project.design || null,
      review: project.review || null,
      reproducibility: project.reproducibility || null,
      packageMeta: meta
    });
    if (!loaded) {
      return false;
    }
    if (opts.rev !== undefined && pkg.manifest && pkg.manifest.id) {
      storeState.revs[pkg.manifest.id] = opts.rev || null;
      state.saved = Boolean(opts.store);
    }
    /* 편집 기록(선택) — 작업실의 하나의 기록(S2-A)이 받을 수 있으면 돌려놓는다 */
    var timeline = window.FontStudio && window.FontStudio.timeline;
    if (meta && meta.history && timeline && typeof timeline.restore === "function") {
      try {
        timeline.restore(meta.history);
      } catch (error) {
        message("편집 기록은 되살리지 못했습니다: " + error.message, "warn");
      }
    }
    return true;
  }

  /* 파일 하나 열기 — 무엇인지 알아본다: 글꼴 묶음·프로젝트 v2·초안·CSS는 그 글꼴로, 디자인 묶음 v1·디자인 JSON은 지금 글꼴에
   * 적용한다(남이 준 묶음·디자인은 묶음의 안전 검사 scanUnsafe를 거친다). → Promise<{ ok, kind, errors }> */
  function openAnyText(text, label) {
    if (!Package) {
      try {
        var plain = loadProject(JSON.parse(text));
        return Promise.resolve({ ok: Boolean(plain), kind: "project", errors: [] });
      } catch (error) {
        message(error.message, "error");
        return Promise.resolve({ ok: false, kind: "unknown", errors: [{ code: "OPEN_FAILED", path: "", message: error.message }] });
      }
    }
    var read = Package.fromAny(text);
    var name = label || "파일";
    function refuse(errors) {
      var first = errors[0] || { message: "열 수 없는 파일입니다" };
      var reason = (first.path ? first.path + ": " : "") + first.message + (errors.length > 1 ? " 외 " + (errors.length - 1) + "건" : "");
      var out = storeRefusal("OPEN_FAILED", { file: name, reason: reason }, { kind: read.kind, errors: errors });
      out.ok = false;
      return out;
    }
    if (!read.ok) {
      return Promise.resolve(refuse(read.errors));
    }
    if (read.kind === "bundle") {
      var bundle = window.FontStudio && window.FontStudio.bundle;
      if (!bundle || typeof bundle.open !== "function") {
        return Promise.resolve(refuse([{ code: "MODULE_UNAVAILABLE", path: "", message: "묶음 모듈이 없어 디자인 묶음을 열 수 없습니다" }]));
      }
      return Promise.resolve(bundle.open(text, label)).then(function (result) {
        return { ok: Boolean(result && result.ok), kind: "bundle", errors: result && result.errors || [] };
      });
    }
    if (read.kind === "design") {
      var design = window.FontStudio && window.FontStudio.design;
      if (!design || typeof design.setJson !== "function") {
        return Promise.resolve(refuse([{ code: "MODULE_UNAVAILABLE", path: "", message: "디자인 모듈이 없어 디자인 JSON을 열 수 없습니다" }]));
      }
      var applied = design.setJson(text, name + "을 열었습니다", "JSON 열기: " + name);
      return Promise.resolve(applied).then(function (ok) {
        return { ok: ok !== false, kind: "design", errors: [] };
      });
    }
    if (read.kind === "css") {
      var css = loadFontText(text, {});
      if (css) {
        message(name + "을 열었습니다. 상대 경로 자산은 " + state.baseUrl + " 기준으로 해석합니다." + parseSummary(), loadTone());
      }
      return Promise.resolve({ ok: css, kind: "css", errors: [] });
    }
    var pkg = read.package;
    /* 그림이 든 묶음 — 그리기 모듈은 처음 쓸 때 싣는다. 실은 뒤 연다(실리지 않아도 그림 자료는 디자인 참가자로 남는다) */
    var waitDraw = pkg.drawings && window.FontStudio && !window.FontStudio.draw && typeof window.FontStudio.need === "function"
      ? window.FontStudio.need("draw").catch(function () { return null; }) : Promise.resolve(null);
    return waitDraw.then(function () {
      if (!loadPackage(pkg)) {
        return { ok: false, kind: read.kind, errors: [] };
      }
      var what = read.kind === "package" ? "글꼴 묶음" : read.kind === "project" ? "프로젝트" : "초안";
      message(name + " " + what + "을 열었습니다." + (read.kind === "project" ? " 저장하면 글꼴 묶음이 됩니다." : "") + parseSummary(), loadTone());
      return { ok: true, kind: read.kind, errors: [] };
    });
  }

  // ── Selection and inspector ────────────────────────────────────────────

  function glyphs() {
    return Array.prototype.slice.call(host.querySelectorAll('[part="glyph"]'));
  }

  function jamoNodes(glyph) {
    return Array.prototype.slice.call(glyph.querySelectorAll('[part~="jamo"]'));
  }

  /* Selection by identity (glyph + slot + jamo), not by index: structure
   * changes (depth, text edits) keep the same jamo selected when it exists. */
  function selectedNode() {
    var selection = state.selection;
    if (!selection) {
      return null;
    }
    var glyph = glyphs()[selection.glyph];
    if (!glyph || glyph.dataset.source !== selection.source) {
      return null;
    }
    var nodes = jamoNodes(glyph);
    var pick = function (test) { return nodes.filter(test)[0] || null; };
    return pick(function (node) { return node.getAttribute("data-fy-pos") === selection.pos && node.getAttribute("data-jamo") === selection.jamo; }) ||
      pick(function (node) { return node.getAttribute("data-jamo") === selection.jamo; }) ||
      pick(function (node) { return node.getAttribute("data-fy-pos") === selection.pos; }) ||
      nodes[selection.node] || null;
  }

  function selectionKey() {
    var selection = state.selection;
    return selection ? [selection.glyph, selection.pos, selection.jamo, state.scopeChosen ? state.scope : "(기본)", state.context].join("|") : "";
  }

  function select(node) {
    var glyph = node.closest('[part="glyph"]');
    var previous = selectionKey();
    state.selection = {
      glyph: glyphs().indexOf(glyph),
      source: glyph.dataset.source,
      pos: node.getAttribute("data-fy-pos"),
      jamo: node.getAttribute("data-jamo"),
      node: jamoNodes(glyph).indexOf(node)
    };
    if (selectionKey() !== previous) {
      state.escalate = null;
    }
    restoreSelection();
  }

  function restoreSelection() {
    Array.prototype.forEach.call(host.querySelectorAll(".studio-selected"), function (node) {
      node.classList.remove("studio-selected");
    });
    var node = selectedNode();
    if (node) {
      node.classList.add("studio-selected");
      var identity = { pos: node.getAttribute("data-fy-pos"), jamo: node.getAttribute("data-jamo") };
      state.selection.pos = identity.pos;
      state.selection.jamo = identity.jamo;
    } else if (state.selection && !glyphs()[state.selection.glyph]) {
      state.selection = null;
    }
    renderInspector(node);
    updateHandles(node);
    if (node) {
      emit("select", node);
    }
  }

  function contextOptions(node) {
    var glyph = node.closest('[part="glyph"]');
    var options = [];
    jamoNodes(glyph).forEach(function (other) {
      if (other === node) {
        return;
      }
      var selector = "[data-fy-pos=" + Model.cssString(other.getAttribute("data-fy-pos")) + "][data-jamo=" + Model.cssString(other.getAttribute("data-jamo")) + "]";
      options.push({ value: selector, label: other.textContent + " (" + other.getAttribute("data-fy-pos") + ")이 같은 글자에 있을 때" });
    });
    return options;
  }

  function resolverFor(node, sourceDoc) {
    return Model.createResolver(sourceDoc || doc, node, host);
  }

  /* The edit target of `property` at the current scope; the escalation when
   * the user asked to edit the covering rule instead. */
  /* 고른 노드가 든 음절 — 같은 짜임 모두(case)·이 글자만(glyph) 범위가 고른다 */
  function glyphInfo(node) {
    var glyph = node ? node.closest('[part="glyph"]') : null;
    return glyph ? { source: glyph.getAttribute("data-source"), layoutKey: glyph.getAttribute("data-layout-key") } : null;
  }

  /* 고른 범위(scope를 주면 그 범위 — 마우스를 올린 범위·기본 범위 셈, 그때는 '대신 고치기'를 따르지 않는다)의 편집 대상 */
  function planFor(property, resolver, sourceDoc, node, scope, noFreeze) {
    var target = node || selectedNode();
    var useScope = scope || currentScope(target);
    /* 고정 모양의 원칙 범위(principle)는 네모꼴 노드에서 이 자리 모두(slot)로 */
    if (useScope === "principle") {
      useScope = "slot";
    }
    var plan = Model.editTarget(sourceDoc || doc, state.fontId,
      { pos: resolver.pos, jamo: resolver.jamo, resolver: resolver, glyph: glyphInfo(target) },
      property, useScope, state.context, { shared: state.shared });
    if (!scope && plan && plan.blocked && plan.escalation && state.escalate === selectionKey() && GESTURE.indexOf(property) < 0) {
      plan.escalation.escalatedFrom = plan;
      plan.escalation.scope = plan.scope;
      plan.escalation.property = property;
      return plan.escalation;
    }
    if (!noFreeze) {
      fromFittedPlace(plan, target, resolver, sourceDoc || doc, useScope);
    }
    return plan;
  }

  // ── 맞춘 자리에서 시작(짓는 방식 C2 남은 것, ADR-035) ─────────────────────
  /* 네모꼴에서 글꼴 기본이 아닌 나누기를 고르면 런타임이 자리를 밝히지 않은 노드를 기본 나누기 자리로 옮겨 그린다(fitSquareSplits).
   * 그 노드의 자리(위치·크기·배율)를 절대 범위(이 자리 모두·이 자리의 이 자모·자리 가족)에 처음 적으면 '밝힌 값이 이긴다'로 맞춤이
   * 꺼져 CSS 자리로 튀었다. 그래서 첫 값은 지금 보이는 자리에서 시작하고, 같은 범위의 다른 자리 값(가로·세로 위치, 다르면 배율)도
   * 함께 적어 맞춤이 그리던 자리를 CSS에 굳힌다(plan.freeze — Model.applyTarget이 같은 편집에 쓴다). 보정 범위(이 자모 어디서나 …
   * 이 글자만)는 맞춘 자리 위에 더해져 그대로다. '이 자리 모두'는 같은 자리의 다른 글자도 이 노드의 굳힌 값을 받는다 */
  var FIT_PLACE = ["left", "top", "scale-x", "scale-y"];
  var FIT_SCOPES = { slot: true, slotJamo: true, family: true };

  function fitShift(node) {
    var fit = node && typeof FontKku.splitFit === "function" ? FontKku.splitFit(node) : null;
    var box = node ? node.offsetParent : null;
    if (!fit || !box || !box.clientWidth || !box.clientHeight) {
      return null;
    }
    var style = getComputedStyle(node);
    var size = parseFloat(style.fontSize) || 0;
    var matrix = style.transform && style.transform !== "none" ? new DOMMatrix(style.transform) : new DOMMatrix();
    var sx = Math.hypot(matrix.a, matrix.b) || 1;
    var sy = Math.hypot(matrix.c, matrix.d) || 1;
    var fromW = fit.from[2] - fit.from[0];
    var fromH = fit.from[3] - fit.from[1];
    if (!(fromW > 0 && fromH > 0 && size > 0)) {
      return null;
    }
    var kx = (fit.to[2] - fit.to[0]) / fromW;
    var ky = (fit.to[3] - fit.to[1]) / fromH;
    return {
      left: sx * size * (fit.to[0] - fit.from[0] * kx) / box.clientWidth * 100,
      top: sy * size * (fit.to[1] - fit.from[1] * ky) / box.clientHeight * 100,
      "scale-x": kx,
      "scale-y": ky
    };
  }

  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }

  /* 맞춘 노드의 그 범위 값 — 위치는 지금 값 + 맞춤이 옮긴 만큼(%), 배율은 지금 값 × 맞춤 배율. 셈할 수 없으면 null */
  function fittedValue(property, current, shift) {
    if (property === "left" || property === "top") {
      return Model.offsetAdd(current || "0%", round4(shift[property]), "%");
    }
    var base = current === "" || current === null || current === undefined ? 1 : Number(current);
    return isFinite(base) ? String(round4(base * shift[property])) : null;
  }

  function fromFittedPlace(plan, node, resolver, sourceDoc, scope) {
    if (!plan || plan.blocked || plan.existing || !FIT_SCOPES[scope] || FIT_PLACE.concat(["size"]).indexOf(plan.property) < 0) {
      return;
    }
    var shift = fitShift(node);
    if (!shift) {
      return;
    }
    var scaled = Math.abs(shift["scale-x"] - 1) > 0.002 || Math.abs(shift["scale-y"] - 1) > 0.002;
    if (plan.property !== "size") {
      var start = fittedValue(plan.property, planValue(plan), shift);
      if (start === null) {
        return;
      }
      plan.baseValue = start;
      plan.currentValue = start;
    }
    plan.freeze = [];
    FIT_PLACE.forEach(function (property) {
      if (property === plan.property || (!scaled && (property === "scale-x" || property === "scale-y"))) {
        return;
      }
      var other = planFor(property, resolver, sourceDoc, node, scope, true);
      if (!other || other.blocked || other.existing) {
        return;
      }
      var value = fittedValue(property, planValue(other), shift);
      if (value !== null) {
        plan.freeze.push({ layer: other.layer, selector: other.selector, variable: other.variable, value: value, property: property });
      }
    });
    plan.note = (plan.note ? plan.note + " · " : "") + "짓는 방식 맞춤이 그린 자리에서 시작합니다 — 이 범위에 자리를 적으면 맞춤 대신 적은 값으로 그리므로 " +
      "가로·세로 위치" + (scaled ? "·배율" : "") + "을 함께 적어 지금 자리를 지킵니다";
  }

  // ── 한 손짓 = 한 대상(2026-10-18 검토 D2) ───────────────────────────────
  /* 끌기(왼쪽·위)·크기·회전과 그 값 칸은 같은 편집 대상에 쓴다. 고른 범위가 그중 하나라도 이 자모에 닿지 않으면(다른 규칙이 가림)
   * 넷 다 받지 않는다 — 전에는 끌기·크기는 거부되고 회전만 받아들여 같은 자리의 다른 글자(의·회)까지 함께 돌았다. 받을 수 없는
   * 손잡이는 감추고 까닭을 보인다. '대신 … 고치기'를 누르면 넷 다 그 가리는 규칙에 쓴다(가려지지 않던 속성도 같은 규칙에 —
   * 그 규칙이 이길 수 없으면 그 속성만 받지 않는다) */
  var GESTURE = ["left", "top", "size", "rotate"];

  function propertyDef(key) {
    return Model.PROPERTIES.filter(function (entry) { return entry.key === key; })[0] || null;
  }

  function endsWith(text, tail) {
    return text.length >= tail.length && text.slice(text.length - tail.length) === tail;
  }

  /* 가려진 속성(lead)의 '대신 고치기' 규칙에 다른 속성(property)을 함께 쓰는 대상 — 같은 변수 갈래(자리 변수 --fy-<자리>-* 또는 보정
   * --fy-jamo-*·--fy-ctx-*)의 그 속성 이름. 그 규칙이 노드에서 이길 수 있을 때만(노드에 그 변수를 공급하는 다른 규칙이 없을 때) */
  function followPlan(lead, property, resolver, raw) {
    var escalation = lead.escalation;
    var rule = escalation && escalation.rule;
    var from = propertyDef(lead.property);
    var to = propertyDef(property);
    if (!rule || !from || !to) {
      return null;
    }
    var variable = null;
    var slotFamilyVar = false;
    if (endsWith(escalation.variable, "-" + from.key)) {
      variable = escalation.variable.slice(0, escalation.variable.length - from.key.length) + to.key;
      slotFamilyVar = true;
    } else if (from.offset && to.offset && endsWith(escalation.variable, "-" + from.offset)) {
      variable = escalation.variable.slice(0, escalation.variable.length - from.offset.length) + to.offset;
    }
    if (!variable) {
      return null;
    }
    var supplier = resolver.lookupAt(resolver.node, variable);
    if (supplier && supplier.rule !== rule) {
      return null;
    }
    var existing = rule.declarations.filter(function (declaration) { return declaration.name === variable; }).pop() || null;
    var seen = resolver.lookup(variable);
    var current = existing ? existing.value : seen ? seen.value
      : slotFamilyVar ? (resolver.entry(property).value || "") : "";
    return {
      layer: rule.layer, selector: rule.selector, variable: variable, rule: rule, existing: existing,
      mode: existing ? "edit" : "create", baseValue: current, currentValue: current,
      shared: null, blocked: null, escalation: null, note: null,
      escalatedFrom: raw, followed: true, scope: raw.scope, property: property
    };
  }

  /* 같은 손짓의 다른 속성이 가려져 이 속성도 받지 않는다 — 원래 대상에 까닭만 붙인 사본 */
  function groupRefusal(plan, lead, kind) {
    var copy = {};
    Object.keys(plan).forEach(function (key) { copy[key] = plan[key]; });
    copy.blocked = { reason: "gesture", by: lead.blocked.by, lead: lead, kind: kind || "group" };
    copy.escalation = null;
    copy.groupBlocked = true;
    return copy;
  }

  var gestureCache = null;

  /* 노드 하나·범위 하나의 손짓 대상 넷 { plans: { left, top, size, rotate }, lead(가려진 첫 대상 또는 null), escalated } */
  function gesturePlans(node, sourceDoc, scope) {
    var useDoc = sourceDoc || doc;
    var escalate = !scope && state.escalate === selectionKey() && node === selectedNode();
    var key = [state.scopeChosen ? state.scope : "", scope || "", escalate, state.shared, state.context].join("|");
    if (gestureCache && gestureCache.doc === useDoc && gestureCache.node === node && gestureCache.key === key && gestureCache.fontId === state.fontId) {
      return gestureCache.result;
    }
    var resolver = resolverFor(node, useDoc);
    var useScope = scope || currentScope(node);
    var raw = {};
    GESTURE.forEach(function (property) {
      raw[property] = planFor(property, resolver, useDoc, node, useScope);
      if (raw[property]) {
        raw[property].property = property;
      }
    });
    var blocked = GESTURE.map(function (property) { return raw[property]; }).filter(function (plan) { return plan && plan.blocked; });
    var result = { plans: {}, lead: null, escalated: false, scope: useScope };
    if (!blocked.length) {
      result.plans = raw;
    } else {
      var lead = blocked.filter(function (plan) { return plan.escalation; })[0] || blocked[0];
      result.lead = lead;
      result.escalated = escalate && Boolean(lead.escalation);
      GESTURE.forEach(function (property) {
        var plan = raw[property];
        if (!plan) {
          result.plans[property] = null;
        } else if (!result.escalated) {
          result.plans[property] = plan.blocked ? plan : groupRefusal(plan, lead);
        } else if (plan.blocked) {
          if (plan.escalation) {
            plan.escalation.escalatedFrom = plan;
            plan.escalation.scope = plan.scope;
            plan.escalation.property = property;
            result.plans[property] = plan.escalation;
          } else {
            result.plans[property] = plan;
          }
        } else {
          result.plans[property] = followPlan(lead, property, resolver, plan) || groupRefusal(plan, lead, "follow");
        }
      });
    }
    gestureCache = { doc: useDoc, node: node, key: key, fontId: state.fontId, result: result };
    return result;
  }

  /* 받지 않는 대상인가(가려졌고 '대신 고치기'로 옮기지 않았다) */
  function refused(plan) {
    return Boolean(plan && plan.blocked && !plan.escalatedFrom);
  }

  /* 뜻 범위의 화면 이름(PLAN-STUDIO-002 S4 '바꿀 것' 1) — 범위 id는 그대로다(자동화 계약·devsite가 쓴다). 사다리 차례(넓은 것부터,
   * Model.SCOPE_LADDER): 자리 가족 < 이 자리 모두 < 이 자리의 이 자모 < 이 자모 어디서나 < 같은 짜임 모두 < 문맥 < 이 글자만(ADR-035) */
  var SCOPE_NAMES = { family: "자리 가족", slot: "이 자리 모두", slotJamo: "이 자리의 이 자모", jamo: "이 자모 어디서나", context: "문맥",
    "case": "같은 짜임 모두", glyph: "이 글자만", principle: "원칙 범위", tune: "고정 모양 손 보정" };

  /* 거절한 대상을 가린 규칙이 사다리의 어느 범위인가 — "더 좁은 범위('문맥')의 규칙"처럼. 모르면 "다른 규칙" */
  function blockerRung(plan) {
    var rung = plan && plan.blocked && plan.blocked.by ? Model.ladderRung(plan.blocked.by) : null;
    return rung && SCOPE_NAMES[rung] ? rung : null;
  }

  function blockerPhrase(plan) {
    var rung = blockerRung(plan);
    if (!rung) {
      return "다른 규칙";
    }
    if (Model.narrowerRung(rung, plan.scope)) {
      return "더 좁은 범위('" + SCOPE_NAMES[rung] + "')의 규칙";
    }
    return rung === plan.scope ? "같은 범위의 다른 규칙" : "'" + SCOPE_NAMES[rung] + "' 범위의 규칙";
  }

  /* 거절된 범위 대신 이 자모에 먹는 가장 가까운 좁은 범위(범위 사다리, ADR-035) — 가린 규칙 위에 더해지거나 그 자리를 정한다.
   * 한 손짓(끌기·크기·회전)이면 넷 모두 먹어야 한다. 문맥은 조건을 골라야 해서 권하지 않는다. 없으면 null */
  function ladderAlternative(plan, node) {
    var target = node || selectedNode();
    if (!plan || !target || stamped(target)) {
      return null;
    }
    var shown = scopesFor(target, false);
    var glyph = glyphInfo(target);
    var resolver = resolverFor(target);
    var properties = GESTURE.indexOf(plan.property) >= 0 ? GESTURE : [plan.property];
    var start = Model.SCOPE_LADDER.indexOf(plan.scope);
    for (var index = start + 1; start >= 0 && index < Model.SCOPE_LADDER.length; index += 1) {
      var scope = Model.SCOPE_LADDER[index];
      if (shown.indexOf(scope) < 0 || scope === "context" || (scope === "case" && !(glyph && glyph.layoutKey))) {
        continue;
      }
      var takes = properties.every(function (property) {
        var other = planFor(property, resolver, doc, target, scope);
        return other && !other.blocked;
      });
      if (takes) {
        return scope;
      }
    }
    return null;
  }
  var PROPERTY_NAMES = { left: "가로 위치", top: "세로 위치", size: "크기", "scale-x": "가로 배율", "scale-y": "세로 배율", rotate: "회전",
    weight: "굵기", stroke: "획 두께", clip: "자르기", dilate: "획 넓힘", "glyph-text": "그릴 문자", "glyph-candidate": "문자 후보" };

  function propertyName(property) {
    return PROPERTY_NAMES[property] || property;
  }

  /* 거절 까닭 — 화면 알림의 한국어 문장(변수·줄 번호는 '자세히'의 blockedMessage로) */
  function refusalText(plan) {
    var scope = SCOPE_NAMES[plan.scope] || "이 범위";
    switch (plan.blocked.reason) {
      case "gesture":
        return plan.blocked.kind === "follow"
          ? "'대신 고치기'로 옮긴 규칙이 이 자모의 " + propertyName(plan.property) + "에는 이기지 못해 " + propertyName(plan.property) + "은(는) 받지 않습니다"
          : "'" + scope + "' 범위는 이 자모의 " + propertyName(plan.blocked.lead.property) + "에 닿지 않습니다 — 한 손짓이 한 대상에만 쓰이도록 " +
            propertyName(plan.property) + "도 받지 않습니다";
      case "slot-override":
        return "이 자모는 자기 자리 값을 따로 가져 '" + scope + "' 범위로 고쳐도 바뀌지 않습니다";
      case "node-override":
        return "이 자모는 " + blockerPhrase(plan) + "이 자리 값을 따로 정해 두어 '" + scope + "' 범위로 고쳐도 바뀌지 않습니다";
      case "higher-layer":
        return blockerPhrase(plan) + "이 이 값을 정해 '" + scope + "' 범위로 고쳐도 보이지 않습니다";
      case "specificity":
        return "먼저 만든 더 구체적인 규칙" + (blockerRung(plan) ? "('" + SCOPE_NAMES[blockerRung(plan)] + "' 범위)" : "") + "이 이겨 '" + scope +
          "' 범위의 새 규칙이 보이지 않습니다";
      case "important":
        return "중요 표시(!important)가 붙은 선언이 이 값을 정해 고칠 수 없습니다";
      case "nested":
        return "중첩 규칙이 이 값을 정해 작업실이 고치지 않습니다";
      default:
        return "조건부 규칙이 이 값을 정해 결과를 확신할 수 없습니다";
    }
  }

  /* 거절 알림 { text, detail, refusal } — 해결 길 안내까지(거절 표 EDIT_BLOCKED 한 줄) */
  function refusal(plan) {
    var lead = plan.blocked.reason === "gesture" ? plan.blocked.lead : plan;
    var narrower = ladderAlternative(lead);
    var entry = makeRefusal("EDIT_BLOCKED", { reason: refusalText(plan), escalation: Boolean(lead.escalation), detail: blockedMessage(lead),
      narrower: narrower ? SCOPE_NAMES[narrower] : null, narrowerScope: narrower });
    return { text: refusalLine(entry), detail: entry.detail, refusal: entry };
  }

  function blockedMessage(plan) {
    if (plan.blocked.reason === "gesture") {
      return blockedMessage(plan.blocked.lead);
    }
    var by = plan.blocked.by;
    var where = layerLabel(by.layer) + " L" + by.line + " " + shortSelector(by.selector);
    var rung = blockerRung(plan);
    var rungNote = rung && rung !== plan.scope ? " ('" + SCOPE_NAMES[rung] + "' 범위)" : "";
    switch (plan.blocked.reason) {
      case "slot-override":
        return "이 자모의 자리 변수 " + by.variable + "(" + where + ")가 가족 값을 덮어, 자리 가족 편집이 이 자모에는 닿지 않습니다";
      case "node-override":
        return "선택한 자모는 " + where + rungNote + " 규칙이 " + plan.variable + "를 직접 선언해, '" + SCOPE_NAMES.slot +
          "' 편집이 이 자모에는 닿지 않습니다";
      case "higher-layer":
        return where + rungNote + " 규칙(" + layerLabel(by.layer) + " 레이어)이 " + plan.variable + "를 덮어, " + layerLabel(plan.layer) +
          " 레이어 편집은 선택한 자모에 보이지 않습니다";
      case "specificity":
        return "새 규칙이 " + where + " 규칙보다 약해(특이도 " + by.specificity.join(",") + ") 이길 수 없습니다";
      case "important":
        return where + "의 !important 선언은 덮을 수 없습니다";
      case "nested":
        return where + "는 중첩(CSS nesting) 규칙이라 작업실이 고치지 않습니다";
      default:
        return where + " 규칙이 조건부(@container 등)라 결과를 확신할 수 없습니다";
    }
  }

  function describeTarget(plan) {
    var where = layerLabel(plan.layer) + (plan.rule ? " L" + plan.rule.line : " (새 규칙)") + " " + shortSelector(plan.selector);
    var verb = plan.mode === "edit" ? "고침" : plan.mode === "split" ? "분리해 새 규칙" : plan.rule ? "선언 추가" : "새 규칙";
    return where + " · " + plan.variable + " — " + verb;
  }

  // ── 고정 글꼴 모양 (ADR-026·028·030) ────────────────────────────────────
  /* 디자인이 고정 글꼴 모양(세벌식 case-fixed·직결식 fixed-three)을 고르면 코어 CSS의 모양 값 규칙(@layer font-kku.shape, --fy-shape-*)이
   * 자모 노드의 자리·크기·굵기를 정하고 글꼴 CSS의 자리(slot)·역할·자모·문맥 값을 덮는다(font-kku.css, ADR-030). 그 노드의 편집은
   * 글꼴 CSS의 @layer font-kku.tune 손 보정으로 적는다 — 기본 범위는 모양의 원칙대로(세벌식은 이 짜임의 이 자모, 직결식은 이 자모).
   * 위치·크기·비율은 모양 값(--fy-shape-*, Model.SHAPE_TUNE_PROPERTIES), 회전·굵기·획 두께·자르기는 자모 보정(--fy-jamo-*,
   * Model.SHAPE_CORRECTION_PROPERTIES — ADR-030 §7)을 쓴다. 기기 글꼴 획 넓힘(--fy-shape-stroke)과 밀도 굵기 계수는 생성 값이라 읽기만 한다.
   * 줄: [속성, 갈래] — tune(모양 값)·correction(자모 보정)·fixed(읽기 전용, 변수) */
  var SHAPE_ROWS = [["left", "tune"], ["top", "tune"], ["size", "tune"], ["scale-x", "tune"], ["scale-y", "tune"],
    ["rotate", "correction"], ["weight", "correction"], ["stroke", "correction"], ["clip", "correction"],
    ["shape-stroke", "fixed", "--fy-shape-stroke"], ["density", "fixed", "--fy-shape-density"]];
  var SHAPE_ROW_LABELS = { rotate: "회전 (보정)", weight: "굵기", stroke: "획 두께 (더함)", clip: "자르기", "shape-stroke": "기기 획 넓힘",
    density: "밀도 굵기 계수" };
  var STAMP_ROLE_LABELS = { initial: "초성", medial: "중성", final: "종성" };
  var CASE_VOWEL_KEYS = { right: "v", bottom: "h", "split-right": "c" };
  var CASE_FINAL_KEYS = { none: "0", single: "1", double: "2" };
  var CASE_VOWEL_LABELS = { v: "세로 모음", h: "가로 모음", c: "섞인 모음" };
  var CASE_FINAL_LABELS = { 0: "받침 없음", 1: "홑받침", 2: "겹받침" };
  /* 고정 배치에서 프로파일·모양 값이 정해 꺼지는 바탕 요소 변수(글자 칸, 합자·겹받침 묶음 변환) */
  var FIXED_INERT = /^--fy-(glyph-(width|height|gap)|(jung|jong)-cluster-)/;
  /* 고정 글꼴 모양의 음절 나누기(ADR-030 §4) — 바탕 글꼴의 기본 나누기(font 계층)는 모양에 닿지 않고, 모양 위의 보정(@layer font-kku.tune의
   * 바탕 요소 규칙)이 모양의 기본(프로파일 depth)을 덮는다. 작업실은 이 셋을 tune 계층에 적는다 */
  var FIXED_TUNE_HOST = /^--fy-font-((jamo|vowel|coda)-depth|composition)$/; // 짓는 방식(ADR-034)도 나누기와 같은 길

  function layoutModel() {
    var profile = host.dataset.fyLayout;
    var info = profile && FontKku.layoutProfiles ? FontKku.layoutProfiles[profile] : null;
    return info ? info.model : null;
  }

  function fixedLayout() {
    var model = layoutModel();
    return model === "fixed-three" || model === "case-fixed";
  }

  function partTokens(node) {
    return String(node.getAttribute("part") || "").split(/\s+/);
  }

  /* 모양 값을 받는 역할 노드의 역할(초성·중성·종성) — 고정 글꼴 모양이 아니거나 역할 노드가 아니면 null */
  var SHAPE_ROLES = { choseong: "initial", jungseong: "medial", jongseong: "final" };
  function shapeRole(node) {
    if (!node || !fixedLayout()) {
      return null;
    }
    var tokens = partTokens(node);
    if (tokens.indexOf("jamo") < 0) {
      return null;
    }
    for (var index = 0; index < tokens.length; index += 1) {
      if (SHAPE_ROLES[tokens[index]]) {
        return SHAPE_ROLES[tokens[index]];
      }
    }
    return null;
  }

  function stamped(node) {
    return Boolean(shapeRole(node));
  }

  function layoutLabel() {
    var profile = host.dataset.fyLayout || "";
    var info = FontKku.layoutProfiles && FontKku.layoutProfiles[profile];
    return profile + (info ? "@" + info.revision : "");
  }

  /* 손 보정 범위를 고르는 노드 정보(Model.shapeTarget의 info) — 짜임 열쇠는 글자 칸의 모음 모양·받침, 합자 모음 조각은 짝 조각 */
  function shapeInfo(node) {
    var role = shapeRole(node);
    if (!role) {
      return null;
    }
    var caseKey = "";
    if (layoutModel() === "case-fixed") {
      var frame = node.closest("[data-jung-layout]");
      var vowel = frame ? CASE_VOWEL_KEYS[frame.getAttribute("data-jung-layout")] : "";
      caseKey = vowel ? vowel + (CASE_FINAL_KEYS[frame.getAttribute("data-jong-layout")] || "0") : "";
    }
    /* 그 음절의 짜임(직결식에서도) — 이 짜임의 이 자모·이 글자만 범위가 쓴다 */
    var glyphFrame = node.closest("[data-jung-layout]");
    var glyphVowel = glyphFrame ? CASE_VOWEL_KEYS[glyphFrame.getAttribute("data-jung-layout")] : "";
    var glyphCase = glyphVowel ? glyphVowel + (CASE_FINAL_KEYS[glyphFrame.getAttribute("data-jong-layout")] || "0") : "";
    var glyph = node.closest('[part="glyph"]');
    var tokens = partTokens(node);
    var piece = null;
    if (tokens.indexOf("jungseong-base") >= 0 && node.nextElementSibling) {
      piece = { index: 0, base: node.getAttribute("data-jamo"), tail: node.nextElementSibling.getAttribute("data-jamo") };
    } else if (tokens.indexOf("jungseong-tail") >= 0 && node.previousElementSibling) {
      piece = { index: 1, base: node.previousElementSibling.getAttribute("data-jamo"), tail: node.getAttribute("data-jamo") };
    }
    var computed = getComputedStyle(node);
    var values = {};
    Model.SHAPE_TUNE_PROPERTIES.forEach(function (property) {
      values[property] = computed.getPropertyValue("--fy-shape-" + property).trim();
    });
    /* 고정 모양 노드의 자모 보정 — 코어가 shape 계층에서 중립값으로 비운 값(굵기·자르기는 비어 있다) 또는 tune 계층의 손 보정 */
    Model.SHAPE_CORRECTION_PROPERTIES.forEach(function (property) {
      values[property] = computed.getPropertyValue("--fy-jamo-" + property).trim();
    });
    return { layout: host.dataset.fyLayout, caseKey: caseKey, glyphCase: glyphCase, source: glyph ? glyph.getAttribute("data-source") : "",
      role: role, jamo: node.getAttribute("data-jamo"), piece: piece, values: values };
  }

  /* 고정 모양 노드의 손 보정 범위(ADR-030 §7) — 원칙 범위(기본), 이 짜임의 이 자모(직결식에서), 이 글자만. 세벌식의 '이 짜임의 이
   * 자모'는 원칙 범위와 같다 */
  function shapeRange(node) {
    var scope = currentScope(node || selectedNode());
    if (scope === "glyph") {
      return "glyph";
    }
    if (scope === "jamo" && layoutModel() === "case-fixed") {
      return "jamo"; // 세벌식 '이 자모 어디서나' — 모든 짜임에 같은 자모 보정(범위 사다리, ADR-035)
    }
    return scope === "case" && layoutModel() === "fixed-three" ? "case" : "principle";
  }

  function shapeScopeLabel(info, range) {
    var jamo = info.piece ? info.piece.base + "+" + info.piece.tail + " 조각 " + (info.piece.index === 0 ? info.piece.base : info.piece.tail) : info.jamo;
    var caseKey = range === "case" || range === "glyph" ? info.glyphCase || info.caseKey : info.caseKey;
    var caseText = caseKey ? CASE_VOWEL_LABELS[caseKey.charAt(0)] + "·" + CASE_FINAL_LABELS[caseKey.charAt(1)] : "";
    if (range === "glyph") {
      return "이 글자만 (" + info.source + " · " + jamo + ")";
    }
    if (range === "jamo") {
      return SCOPE_NAMES.jamo + " (" + jamo + ", 모든 짜임에 같은 보정)";
    }
    return caseKey
      ? SCOPE_NAMES["case"] + " (" + caseText + " · " + jamo + ")"
      : SCOPE_NAMES.jamo + " (" + jamo + ")";
  }

  /* 그 범위가 보는 모양 값 — 더 좁은 손 보정(이 글자만의 data-source 규칙, 직결식 원칙 범위에서는 짜임 규칙도)을 뺀 값(범위 사다리,
   * ADR-035). 노드의 계산 값은 좁은 규칙까지 든 값이라, 넓은 범위가 거기서 시작하면 좁은 범위의 차이를 그 범위 모두에 퍼뜨렸다(이 글자만
   * +2 뒤 원칙 범위 +1이 같은 짜임의 다른 글자를 +3 옮겼다). 좁은 규칙이 기대는 속성을 잠깐 떼고 계산 값을 읽는다 — 런타임은 생성한
   * 노드의 data-* 바꿈을 옵션 바꿈으로 보지 않는다 */
  function rangeValues(node, info, range) {
    var glyph = node.closest('[part="glyph"]');
    var frame = node.closest("[data-jung-layout]");
    var saved = [];
    var hide = function (element, name) {
      if (element && element.hasAttribute(name)) {
        saved.push([element, name, element.getAttribute(name)]);
        element.removeAttribute(name);
      }
    };
    if (range !== "glyph") {
      hide(glyph, "data-source");
    }
    if (range === "principle" && layoutModel() === "fixed-three") {
      hide(frame, "data-jung-layout");
      hide(frame, "data-jong-layout");
    }
    if (!saved.length) {
      return info.values;
    }
    var values = {};
    try {
      var computed = getComputedStyle(node);
      Model.SHAPE_TUNE_PROPERTIES.forEach(function (property) {
        values[property] = computed.getPropertyValue("--fy-shape-" + property).trim();
      });
      Model.SHAPE_CORRECTION_PROPERTIES.forEach(function (property) {
        values[property] = computed.getPropertyValue("--fy-jamo-" + property).trim();
      });
    } finally {
      saved.reverse().forEach(function (entry) {
        entry[0].setAttribute(entry[1], entry[2]);
      });
    }
    return values;
  }

  /* 노드가 모양 값 노드면 손 보정 편집 대상, 아니면 고른 범위의 글꼴 CSS 편집 대상 */
  function planOf(node, property, sourceDoc) {
    if (stamped(node)) {
      var range = shapeRange(node);
      var info = shapeInfo(node);
      info.values = rangeValues(node, info, range);
      return Model.shapeTarget(sourceDoc || doc, state.fontId, info, property, range);
    }
    if (GESTURE.indexOf(property) >= 0) {
      return gesturePlans(node, sourceDoc).plans[property];
    }
    return planFor(property, resolverFor(node, sourceDoc), sourceDoc, node);
  }

  // ── 기본 범위(2026-10-18 검토 D2) ───────────────────────────────────────
  /* 범위를 고르지 않았으면 글꼴 모양마다의 기본 범위: 고정 모양(세벌식·직결식)은 지금처럼 원칙 범위, 네모꼴은 '이 짜임의 이 자모'
   * (그 노드에서 먹을 때) — 아니면 먹는 범위 중 가장 좁은 것. 전에는 네모꼴의 기본이 '자리 전체'라 gothic·retro에서 jamo 규칙에 가려
   * 첫 끌기·크기가 거부되었다(MEMORY 2026-10-14 원칙: 기본 범위는 반드시 먹어야 한다) */
  var FIXED_SCOPES = ["principle", "jamo", "case", "glyph"];
  var SQUARE_SCOPES = ["family", "slot", "slotJamo", "jamo", "context", "case", "glyph"];
  var DEFAULT_ORDER = ["case", "glyph", "slotJamo", "jamo", "slot", "family"];
  var defaultCache = null;

  function scopesFor(node, fixed) {
    if (fixed) {
      /* 직결식은 원칙 범위 = 이 자모 어디서나(그래서 '같은 짜임 모두'를 따로), 세벌식은 원칙 범위 = 같은 짜임 모두(그래서 '이 자모 어디서나'를
       * 따로) — 같은 결과인 뜻은 원칙 범위 하나로 묶는다(PLAN-STUDIO-002 S4 '바꿀 것' 1) */
      var model = layoutModel();
      return FIXED_SCOPES.filter(function (scope) {
        return (scope !== "case" || model === "fixed-three") && (scope !== "jamo" || model === "case-fixed");
      });
    }
    var family = node ? Model.slotFamily(node.getAttribute("data-fy-pos")) : null;
    return SQUARE_SCOPES.filter(function (scope) { return scope !== "family" || family; });
  }

  function squareDefault(node) {
    var glyph = glyphInfo(node);
    var cacheKey = [glyph && glyph.source, glyph && glyph.layoutKey, node.getAttribute("data-fy-pos"), node.getAttribute("data-jamo"), state.shared].join("|");
    if (defaultCache && defaultCache.doc === doc && defaultCache.node === node && defaultCache.key === cacheKey) {
      return defaultCache.scope;
    }
    var shown = scopesFor(node, false);
    var resolver = resolverFor(node);
    var pick = null;
    for (var index = 0; index < DEFAULT_ORDER.length && !pick; index += 1) {
      var scope = DEFAULT_ORDER[index];
      if (shown.indexOf(scope) < 0 || (scope === "case" && !(glyph && glyph.layoutKey))) {
        continue;
      }
      var takes = GESTURE.every(function (property) {
        var plan = planFor(property, resolver, doc, node, scope);
        return plan && !plan.blocked;
      });
      if (takes) {
        pick = scope;
      }
    }
    pick = pick || (glyph && glyph.layoutKey ? "case" : "glyph");
    defaultCache = { doc: doc, node: node, key: cacheKey, scope: pick };
    return pick;
  }

  /* 노드에 쓰이는 범위 — 고른 범위가 그 노드에 있으면 그것, 아니면 기본 범위 */
  function currentScope(node) {
    if (!node) {
      return state.scope;
    }
    var fixed = stamped(node);
    if (state.scopeChosen && scopesFor(node, fixed).indexOf(state.scope) >= 0) {
      return state.scope;
    }
    return fixed ? "principle" : squareDefault(node);
  }

  /* 범위를 고른다(범위 단추·'… 범위로 고치기'·FontStudio.setScope가 같은 길) */
  function chooseScope(scope) {
    var radio = root.querySelector('input[name="scope"][value="' + scope + '"]');
    if (radio) {
      radio.checked = true;
    }
    state.scope = scope;
    state.scopeChosen = true;
    state.escalate = null;
    restoreSelection();
  }

  function safeMatch(node, selector) {
    try {
      return node.matches(selector);
    } catch (error) {
      return false;
    }
  }

  function fixedNotice(node) {
    return "고정 글꼴 모양(" + layoutLabel() + ") — 모양 값이 자리·크기를 정하고 글꼴 CSS의 자리·자모·문맥 값은 꺼져 있습니다. " +
      "고치면 이 글꼴 CSS의 @layer " + Model.TUNE_LAYER + "에 '" + shapeScopeLabel(shapeInfo(node), shapeRange(node)) + "' 손 보정으로 적습니다";
  }

  /* 고른 범위가 모양의 원칙을 깨면 그 안내(ADR-030 §5·§7 — 막지 않고 알린다), 아니면 "" */
  function principleBreach() {
    var range = shapeRange();
    if (!Model.shapeScopeBreaksPrinciple(layoutModel(), range)) {
      return "";
    }
    return "⚠ 이 범위는 모양의 원칙을 깹니다 — " + (layoutModel() === "fixed-three" ? "직결식은 같은 역할의 같은 자모를 어디서나 같은 자리에"
      : "세벌식은 같은 짜임의 같은 자모를 같은 자리에") + " 그린다고 밝혔습니다. 고친 대로 그리고, FontKku.layoutStability가 어긋남으로 보고합니다.";
  }

  function renderFixedTarget(panel, node) {
    panel.hidden = false;
    root.dataset.targetState = "fixed";
    var note = document.createElement("p");
    note.className = "studio-target-note";
    note.dataset.studioTargetNote = "shape-tune";
    note.textContent = fixedNotice(node);
    panel.appendChild(note);
    var breach = principleBreach();
    if (breach) {
      var warning = document.createElement("p");
      warning.className = "studio-target-warning";
      warning.dataset.studioTargetWarning = "principle";
      warning.textContent = breach;
      panel.appendChild(warning);
    }
    var plan = planOf(node, "left");
    if (plan) {
      var where = document.createElement("p");
      where.textContent = "→ " + describeTarget(plan);
      panel.appendChild(where);
    }
    appendAffectedCount(panel);
    /* 글꼴 모양을 통째로 바꾸는 단추('네모 문맥으로'·'디자인 끄고 글꼴 CSS로')는 디자인 페이지로 옮겼다(PLAN-STUDIO-002 ⚑9, S3) —
     * 그 페이지가 묻고 FontStudio.shapeChange(kind)를 부른다. 확인 갈고리 [data-studio-design-off]·[data-studio-design-square]는
     * 어디서 누르든 같은 처리기(confirmShapeChange + 디자인 패널)를 탄다 */
  }

  /* 모양 값 노드의 값 줄 — 위치·크기·비율은 모양 값 손 보정, 회전·굵기·획 두께·자르기는 자모 보정 입력, 기기 획 넓힘·밀도는 읽기 전용 */
  function shapeRows(node, tbody) {
    var computed = getComputedStyle(node);
    SHAPE_ROWS.forEach(function (spec) {
      var property = spec[0];
      var kind = spec[1];
      var row = document.createElement("tr");
      row.dataset.property = property;
      row.dataset.shape = kind === "fixed" ? "fixed" : "tune";
      if (kind === "correction") {
        row.dataset.correction = "";
      }
      var name = document.createElement("th");
      name.textContent = SHAPE_ROW_LABELS[property] || LABELS[property] || property;
      var valueCell = document.createElement("td");
      var source = document.createElement("td");
      source.className = "studio-source-cell";
      if (kind !== "fixed") {
        var plan = planOf(node, property);
        var variable = plan && plan.variable ? plan.variable : (kind === "correction" ? "--fy-jamo-" : "--fy-shape-") + property;
        var input = document.createElement("input");
        input.type = "text";
        input.size = 9;
        input.value = planValue(plan);
        /* 굵기 보정이 없으면 모양 값의 굵기, 다른 보정은 효과 없는 값을 자리 표시로 */
        var definition = Model.PROPERTIES.filter(function (entry) { return entry.key === property; })[0];
        input.placeholder = kind !== "correction" && !(plan && plan.range === "jamo") ? "" : property === "weight"
          ? computed.getPropertyValue("--fy-shape-weight").trim() : (definition && definition.neutral) || "";
        input.title = plan ? describeTarget(plan) : "";
        input.dataset.studioInput = property;
        input.addEventListener("change", function () {
          applyInput(property, input.value.trim());
        });
        valueCell.appendChild(input);
        source.textContent = variable + " · " + (plan && plan.existing
          ? "손 보정 " + layerLabel(plan.layer) + " L" + plan.rule.line + " (모양 값 " + layoutLabel() + " 위)"
          : kind === "correction" ? "보정 없음 — 모양 값 " + layoutLabel() : "모양 값 " + layoutLabel());
      } else {
        valueCell.className = "studio-stamp-value";
        valueCell.textContent = computed.getPropertyValue(spec[2]).trim() || "-";
        source.textContent = spec[2] + " · 모양 값 " + layoutLabel() + "(읽기 전용)";
      }
      row.appendChild(name);
      row.appendChild(valueCell);
      row.appendChild(source);
      tbody.appendChild(row);
    });
  }

  function renderTarget(node, resolver) {
    var panel = $("[data-studio-target]");
    panel.textContent = "";
    root.dataset.targetState = "";
    if (!node) {
      panel.hidden = true;
      if (affectedLayer) {
        showAffected(null);
      }
      return;
    }
    if (stamped(node)) {
      renderFixedTarget(panel, node);
      return;
    }
    var group = gesturePlans(node);
    var plans = ["left", "top"].map(function (property) { return group.plans[property]; }).filter(Boolean);
    panel.hidden = false;
    if (!plans.length) {
      panel.textContent = "이 범위에서는 위치를 옮길 수 없습니다.";
      appendAffectedCount(panel);
      return;
    }
    var seen = {};
    plans.forEach(function (plan) {
      var line = document.createElement("p");
      var text = describeTarget(plan);
      if (seen[text]) {
        return;
      }
      seen[text] = true;
      line.textContent = (plan.escalatedFrom ? "대신 고침: " : "편집 대상: ") + text;
      panel.appendChild(line);
    });
    var blocked = group.lead && !group.escalated ? group.lead : null;
    var escalated = plans.filter(function (plan) { return plan.escalatedFrom; })[0] || (group.escalated ? group.lead : null);
    var shared = plans.filter(function (plan) { return plan.shared; })[0];
    var note = plans.filter(function (plan) { return plan.note; })[0];
    if (blocked) {
      root.dataset.targetState = "blocked";
      var warning = document.createElement("p");
      warning.className = "studio-target-warning";
      warning.dataset.studioTargetWarning = "blocked";
      warning.textContent = "⚠ " + blockedMessage(blocked);
      panel.appendChild(warning);
      if (blocked.escalation) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.studioEscalate = "";
        button.textContent = "대신 " + layerLabel(blocked.escalation.layer) + " L" + blocked.escalation.rule.line + " 규칙 고치기";
        panel.appendChild(button);
      }
      /* 범위 사다리(ADR-035) — 가린 규칙 위에서도 이 자모에 먹는 가장 가까운 좁은 범위 */
      var narrower = ladderAlternative(blocked, node);
      if (narrower) {
        var ladderButton = document.createElement("button");
        ladderButton.type = "button";
        ladderButton.dataset.studioLadderScope = narrower;
        ladderButton.textContent = "'" + SCOPE_NAMES[narrower] + "' 범위로 고치기";
        panel.appendChild(ladderButton);
      }
    } else if (escalated) {
      root.dataset.targetState = "escalated";
      var back = document.createElement("button");
      back.type = "button";
      back.dataset.studioDeescalate = "";
      back.textContent = "원래 범위로";
      panel.appendChild(back);
    }
    /* 크기·회전 — 받지 않으면 손잡이를 감춘 까닭, 대신 고치기로 같은 규칙에 쓰면 그 대상 */
    var handleNotes = ["size", "rotate"].map(function (property) {
      var plan = group.plans[property];
      if (refused(plan)) {
        return propertyName(property) + " 손잡이를 감췄습니다 — " + refusalText(plan) + ".";
      }
      if (!plan) {
        return propertyName(property) + " 손잡이를 감췄습니다 — 이 범위에는 " + propertyName(property) + "을(를) 적을 곳이 없습니다.";
      }
      return plan && plan.followed ? propertyName(property) + "도 같은 규칙에 씁니다: " + describeTarget(plan) : "";
    }).filter(Boolean);
    if (handleNotes.length) {
      var handleNote = document.createElement("p");
      handleNote.className = "studio-target-note";
      handleNote.dataset.studioTargetNote = "handles";
      handleNote.textContent = handleNotes.join(" ");
      panel.appendChild(handleNote);
    }
    if (shared || (state.shared === "split" && plans.some(function (plan) { return plan.mode === "split"; }))) {
      root.dataset.targetState = root.dataset.targetState || "shared";
      var sharedPlan = shared || plans.filter(function (plan) { return plan.mode === "split"; })[0];
      var info = document.createElement("p");
      info.className = "studio-target-warning";
      info.dataset.studioTargetWarning = "shared";
      info.textContent = "⚠ 공유 규칙(" + (sharedPlan.shared ? sharedPlan.shared.text : "") + ") — 고르세요:";
      panel.appendChild(info);
      var choices = document.createElement("div");
      choices.className = "studio-target-choices";
      [["edit", "공유 규칙 고치기"], ["split", "이 자모만 새 규칙으로 분리"]].forEach(function (pair) {
        var label = document.createElement("label");
        var input = document.createElement("input");
        input.type = "radio";
        input.name = "shared";
        input.value = pair[0];
        input.checked = state.shared === pair[0];
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + pair[1]));
        choices.appendChild(label);
      });
      panel.appendChild(choices);
    }
    if (note) {
      var hint = document.createElement("p");
      hint.textContent = note.note;
      panel.appendChild(hint);
    }
    appendAffectedCount(panel);
  }

  /* 범위 단추 — 고정 모양 노드는 원칙 범위·(직결식이면) 이 짜임의 이 자모·이 글자만, 네모꼴 노드는 자리 가족 … 문맥·이 짜임의 이
   * 자모·이 글자만(ADR-030 §7). 고르지 않았거나 고른 값이 그 노드에 없는 범위면 기본 범위(currentScope)를 보인다 */
  function syncScopeRadios(node, fixed) {
    var shown = scopesFor(node, fixed);
    Array.prototype.forEach.call(root.querySelectorAll('input[name="scope"]'), function (radio) {
      radio.closest("label").hidden = shown.indexOf(radio.value) < 0;
      radio.disabled = shown.indexOf(radio.value) < 0;
    });
    var current = currentScope(node);
    if (!state.scopeChosen) {
      state.scope = current; // FontStudio.state.scope는 지금 쓰이는 범위
    }
    var radio = root.querySelector('input[name="scope"][value="' + current + '"]');
    if (radio) {
      radio.checked = true;
    }
    root.dataset.scope = current;
    root.dataset.scopeDefault = state.scopeChosen && current === state.scope ? "false" : "true";
    var glyph = glyphInfo(node);
    var info = fixed ? shapeInfo(node) : null;
    /* 모양에서 두 뜻이 같은 결과면 묶어 까닭을 보인다(PLAN-STUDIO-002 S4 '바꿀 것' 1) — 세벌식의 원칙 범위 = 같은 짜임 모두(짜임마다
     * 자리가 정해져 있다), 직결식의 원칙 범위 = 이 자모 어디서나(같은 역할의 같은 자모는 어디서나 같은 자리) */
    var principleLabel = root.querySelector('[data-scope-label="principle"]');
    principleLabel.textContent = info ? "원칙 범위 = " + shapeScopeLabel(info, "principle") : "원칙 범위";
    principleLabel.title = !info ? "" : layoutModel() === "fixed-three"
      ? "직결식은 같은 역할의 같은 자모를 어디서나 같은 자리에 그려 '원칙 범위'와 '" + SCOPE_NAMES.jamo + "'가 같은 결과입니다"
      : "세벌식은 같은 짜임의 같은 자모를 같은 자리에 그려 '원칙 범위'와 '" + SCOPE_NAMES["case"] + "'가 같은 결과입니다";
    root.querySelector('[data-scope-label="case"]').textContent = fixed && info
      ? SCOPE_NAMES["case"] + " (" + shapeScopeLabel(info, "case").replace(/^[^(]*\(|\)$/g, "") + ", 원칙 밖)"
      : SCOPE_NAMES["case"] + " (" + (glyph ? glyph.layoutKey : "") + " · " + node.getAttribute("data-jamo") + ", 보정)";
    if (fixed && info) {
      root.querySelector('[data-scope-label="jamo"]').textContent = shapeScopeLabel(info, "jamo");
    }
    root.querySelector('[data-scope-label="glyph"]').textContent = SCOPE_NAMES.glyph + " (" + (glyph ? glyph.source : "") + " · " +
      node.getAttribute("data-jamo") + (fixed ? ", 원칙 밖)" : ", 보정)");
  }

  /* 살펴보기의 두 판 — 쉬운 고치기 판(막대·숫자·경고, 고치기 페이지)과 정밀 값 표·규칙 목록 — 은 그 보기에서만 보인다. 감춰진 판은
   * 렌더마다 그리지 않고 밀어 두었다가 보일 때(보기·페이지가 바뀔 때) 그린다(PLAN-STUDIO-002 S6 성능 — 값 고침 한 번에 감춰진 판이
   * 약 4–6ms). 정밀 값 표는 정밀 보기면 페이지와 상관없이 그린다(디자인 페이지에서 고른 자모의 값 칸을 쓰는 옛 창구·시험). 범위·
   * 문맥·바뀔 곳처럼 상태를 정하는 일은 늘 한다 */
  var inspectorStale = { easy: false, precise: false };

  function inspectorShown(half) {
    return root.dataset.studioMode === half && (half === "precise" || editing());
  }

  function renderInspector(node) {
    renderEasy(node);
    var selection = $("[data-studio-selection]");
    var scopeField = $("[data-studio-scope]");
    var tbody = $("[data-studio-props] tbody");
    var rulesList = $("[data-studio-rules]");
    var precise = inspectorShown("precise");
    inspectorStale.precise = !precise && Boolean(node && doc);
    tbody.textContent = "";
    rulesList.textContent = "";
    if (!node || !doc) {
      selection.textContent = "자소를 클릭하세요.";
      scopeField.disabled = true;
      renderTarget(null);
      return;
    }
    var glyph = node.closest('[part="glyph"]');
    var pos = node.getAttribute("data-fy-pos");
    var jamo = node.getAttribute("data-jamo");
    var fixed = stamped(node);
    scopeField.disabled = false;
    syncScopeRadios(node, fixed);
    selection.textContent = "";
    var title = document.createElement("strong");
    title.textContent = (glyph.dataset.source || "") + " · " + node.textContent;
    var meta = document.createElement("span");
    meta.textContent = "자리 " + pos + " · 역할 " + node.getAttribute("data-fy-role") + " · 깊이 " +
      host.dataset.fyVowelDepth + "/" + host.dataset.fyCodaDepth +
      (fixed ? " · 고정 글꼴 모양 · " + STAMP_ROLE_LABELS[shapeRole(node)] + " · 손 보정 범위 " + shapeScopeLabel(shapeInfo(node), shapeRange(node)) : "");
    meta.dataset.studioPrecise = ""; // 자리·역할·깊이 코드는 정밀 모드에서(쉬운 판은 '의'의 ㅇ (첫소리))
    selection.appendChild(title);
    selection.appendChild(meta);
    if (fixed) {
      renderTarget(node, null);
      if (!precise) {
        root.dataset.mismatches = "";
        return;
      }
      root.dataset.mismatches = "0";
      shapeRows(node, tbody);
      var note = document.createElement("li");
      note.textContent = "고정 글꼴 모양 — 이 자소의 자리·크기·굵기는 모양 값(코어 생성)이 정합니다. 글꼴 CSS의 자리·자모·문맥 규칙은 꺼져 있습니다.";
      rulesList.appendChild(note);
      /* 이 노드에 닿는 손 보정 규칙 */
      doc.rules.filter(function (rule) { return rule.layer === Model.TUNE_LAYER && safeMatch(node, rule.selector); }).forEach(function (rule) {
        var item = document.createElement("li");
        item.dataset.layer = "tune";
        item.textContent = "[tune] L" + rule.line + "  " + shortSelector(rule.selector) + "  { " + rule.declarations.map(function (declaration) {
          return declaration.name + ": " + declaration.value;
        }).join("; ") + " }";
        rulesList.appendChild(item);
      });
      return;
    }

    var family = Model.slotFamily(pos);
    var familyRadio = root.querySelector('input[name="scope"][value="family"]');
    familyRadio.disabled = !family;
    familyRadio.closest("label").hidden = !family;
    root.querySelector('[data-scope-label="family"]').textContent = family
      ? "자리 가족 " + family.parent + " (" + family.members.join("·") + ")"
      : "자리 가족";
    root.querySelector('[data-scope-label="slot"]').textContent = SCOPE_NAMES.slot + " (" + pos + ")";
    root.querySelector('[data-scope-label="slotJamo"]').textContent = SCOPE_NAMES.slotJamo + " (" + pos + " · " + jamo + ")";
    root.querySelector('[data-scope-label="jamo"]').textContent = SCOPE_NAMES.jamo + " (" + jamo + ", 보정)";
    var contextSelect = $("[data-studio-context]");
    var options = contextOptions(node);
    contextSelect.textContent = "";
    options.forEach(function (option) {
      var element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      contextSelect.appendChild(element);
    });
    if (options.some(function (option) { return option.value === state.context; })) {
      contextSelect.value = state.context;
    } else {
      state.context = options.length ? options[0].value : "";
    }
    contextSelect.disabled = currentScope(node) !== "context" || options.length === 0;

    if (!precise) {
      root.dataset.mismatches = ""; // 값 표를 그리지 않았다 — 정밀 보기에서 그릴 때 센다
      renderTarget(node, null);
      return;
    }
    var resolver = resolverFor(node);
    var entries = resolver.entries();
    var computed = getComputedStyle(node);
    var mismatches = 0;
    var mapping = glyphMappingFont(node);
    entries.forEach(function (entry) {
      if (!mapping && GLYPH_MAPPING_ROWS.indexOf(entry.property) >= 0) {
        return; // '그릴 문자'·'문자 후보'는 글자로 만들기 글꼴에서만(S4 '값')
      }
      var row = propertyRow(entry, resolver, computed, node);
      if (row.dataset.mismatch === "true") {
        mismatches += 1;
      }
      tbody.appendChild(row);
    });
    root.dataset.mismatches = String(mismatches);
    renderTarget(node, resolver);

    /* 이 자소의 해석 체인에 닿는 선언만 보여 주고 나머지는 개수로 줄인다. */
    var relevant = {};
    entries.forEach(function (entry) {
      [entry.source].concat(entry.offsets).forEach(function (source) {
        if (source) {
          relevant[source.variable] = true;
        }
      });
      if (entry.slotVar) {
        relevant[entry.slotVar] = true;
      }
    });
    rulesFor(resolver).forEach(function (rule) {
      var item = document.createElement("li");
      item.dataset.layer = LAYER_NAMES[rule.layer] || "page";
      var shown = rule.declarations.filter(function (declaration) {
        return relevant[declaration.name] || declaration.name.indexOf("--fy-") !== 0 || rule.declarations.length <= 4;
      });
      var hidden = rule.declarations.length - shown.length;
      item.textContent = "[" + layerLabel(rule.layer) + "] L" + rule.line + "  " + shortSelector(rule.selector) +
        (rule.conditions.length ? "  @" + rule.conditions.map(function (condition) { return condition.type + " " + condition.text; }).join(" @") : "") +
        "  { " + shown.map(function (declaration) {
          return declaration.name + ": " + declaration.value + (declaration.important ? " !important" : "");
        }).join("; ") + (hidden ? (shown.length ? "; " : "") + "… 외 " + hidden + "개" : "") + " }";
      rulesList.appendChild(item);
    });
  }

  // ── 쉬운 고치기(PLAN-STUDIO-002 S3 '페이지별 보기' 고치기 행) ─────────────────
  /* 쉬운 모드의 고치기 판 — 뜻 범위 셋('이 글자만'·'같은 짜임 모두'·'이 자모 어디서나'), 위치·크기·회전·굵기 막대와 숫자, 한국어 경고와
   * 해결 단추. 숫자는 '지금 보이는 값'이다(규칙에 적힌 값이 아니라 그려진 자모의 값 — 위치는 자모 상자의 % 자리, 크기는 글자 대비 배수,
   * 회전은 도, 굵기는 굵기). 고치면 그 차이를 정밀 모드의 끌기·키와 같은 길로 보낸다: 위치는 nudge(글자 상자 %), 크기·회전은 키 한 걸음
   * (stepResult — 배수·도 더하기), 굵기는 값 칸(applyInput). 그래서 같은 편집은 값 표에 친 것과 같은 선언 diff를 낸다 */
  var EASY_SCOPES = [
    { meaning: "glyph", label: "이 글자만" },
    { meaning: "case", label: "같은 짜임 모두" },
    { meaning: "jamo", label: "이 자모 어디서나" }
  ];
  var EASY_ROWS = [
    { property: "left", label: "가로 위치", unit: "%", step: 0.5 },
    { property: "top", label: "세로 위치", unit: "%", step: 0.5 },
    { property: "size", label: "크기", unit: "배", step: 0.01 },
    { property: "rotate", label: "회전", unit: "°", step: 1 },
    { property: "weight", label: "굵기", unit: "", step: 50 }
  ];
  var ROLE_WORDS = { choseong: "첫소리", jungseong: "가운뎃소리", jongseong: "끝소리" };
  var easyNotice = null; // 쉬운 판에서 방금 거절된 편집의 한 줄 — 다음 동작(다른 고르기·범위 바꾸기)이 지운다

  /* 뜻 범위 → 그 노드·글꼴 모양의 실제 범위(없으면 scope null과 까닭). 네모꼴: glyph·case·jamo. 직결식: 이 자모 어디서나 = 원칙 범위,
   * 같은 짜임 = case. 세벌식: 같은 짜임 = 원칙 범위, 이 자모 어디서나 = jamo(짜임마다 다른 자리 위에 같은 보정 — 범위 사다리 ADR-035,
   * 전에는 '짜임마다 자리가 달라' 없었다) */
  function easyScopes(node) {
    var fixed = stamped(node);
    var model = fixed ? layoutModel() : null;
    var glyph = glyphInfo(node);
    return EASY_SCOPES.map(function (entry) {
      var out = { meaning: entry.meaning, label: entry.label, scope: null, why: "" };
      if (entry.meaning === "glyph") {
        out.scope = "glyph";
      } else if (entry.meaning === "case") {
        if (fixed) {
          out.scope = model === "fixed-three" ? "case" : "principle";
        } else if (glyph && glyph.layoutKey) {
          out.scope = "case";
        } else {
          out.why = "이 글자는 짜임이 정해지지 않아 '같은 짜임 모두'로 고칠 수 없습니다";
        }
      } else if (fixed) {
        /* 직결식은 원칙 범위가 곧 이 자모 어디서나. 세벌식은 짜임마다 다른 자리 위에 같은 보정을 더한다(범위 사다리, ADR-035) */
        out.scope = model === "fixed-three" ? "principle" : "jamo";
      } else {
        out.scope = "jamo";
      }
      return out;
    });
  }

  /* 지금 쓰이는 범위의 뜻(셋 밖이면 null) */
  function easyMeaning(node) {
    var scope = currentScope(node);
    var hit = easyScopes(node).filter(function (entry) { return entry.scope === scope; })[0];
    return hit ? hit.meaning : null;
  }

  function roleWord(node) {
    var tokens = partTokens(node);
    var keys = Object.keys(ROLE_WORDS);
    for (var index = 0; index < keys.length; index += 1) {
      if (tokens.indexOf(keys[index]) >= 0) {
        return ROLE_WORDS[keys[index]];
      }
    }
    return "";
  }

  /* 지금 보이는 값 — 그려진 자모에서 잰다(규칙 값이 아니라) */
  function easyVisible(node, property) {
    var computed = getComputedStyle(node);
    if (property === "left" || property === "top") {
      var parent = node.offsetParent;
      var px = parseFloat(property === "left" ? computed.insetInlineStart : computed.insetBlockStart);
      var span = parent ? (property === "left" ? parent.clientWidth : parent.clientHeight) : 0;
      return span && isFinite(px) ? Math.round(px / span * 1000) / 10 : null;
    }
    if (property === "size") {
      var parentSize = node.parentElement ? parseFloat(getComputedStyle(node.parentElement).fontSize) : NaN;
      var own = parseFloat(computed.fontSize);
      return parentSize > 0 && own > 0 ? Math.round(own / parentSize * 1000) / 1000 : null;
    }
    if (property === "rotate") {
      var match = /matrix\(([^)]+)\)/.exec(computed.transform || "");
      if (!match) {
        return computed.transform === "none" || !computed.transform ? 0 : null;
      }
      var m = match[1].split(",").map(parseFloat);
      return Math.round(Math.atan2(m[1], m[0]) * 180 / Math.PI * 10) / 10;
    }
    if (property === "weight") {
      var weight = parseFloat(computed.fontWeight);
      return isFinite(weight) ? Math.round(weight) : null;
    }
    return null;
  }

  function easyRange(property, now) {
    if (property === "left" || property === "top") {
      return [Math.floor(now - 25), Math.ceil(now + 25)];
    }
    if (property === "size") {
      return [Math.max(0.05, Math.round(now * 50) / 100), Math.round(now * 160) / 100];
    }
    if (property === "rotate") {
      return [Math.floor(now - 45), Math.ceil(now + 45)];
    }
    return [100, 900];
  }

  /* 쉬운 판의 경고 한 줄과 해결 단추 — 원문(변수·줄 번호)은 정밀 모드의 편집 대상 칸과 '자세히'에 */
  function easyWarningOf(node) {
    if (easyNotice && easyNotice.key === selectionKey()) {
      return { text: easyNotice.text, buttons: easyNotice.buttons || [] };
    }
    if (stamped(node)) {
      return principleBreach()
        ? { text: "이 범위는 글꼴 모양의 원칙(같은 자모는 같은 자리)을 벗어납니다 — 고친 대로 그리고, 검사가 어긋남으로 알립니다.", buttons: [] }
        : null;
    }
    var group = gesturePlans(node);
    var plans = ["left", "top", "size", "rotate"].map(function (property) { return group.plans[property]; }).filter(Boolean);
    var blocked = group.lead && !group.escalated ? group.lead : null;
    if (blocked) {
      var buttons = blocked.escalation ? [{ label: "앞선 규칙을 대신 고치기", hook: "studioEasyEscalate" }] : [];
      buttons.push({ label: "다른 범위 고르기", hook: "studioEasyRescope" });
      return { text: "⚠ " + refusalText(blocked) + ".", buttons: buttons };
    }
    if (group.escalated || plans.some(function (plan) { return plan.escalatedFrom; })) {
      return { text: "앞선 규칙을 대신 고치는 중입니다 — 그 규칙을 쓰는 다른 글자도 함께 바뀝니다.",
        buttons: [{ label: "원래 범위로", hook: "studioEasyDeescalate" }] };
    }
    var shared = plans.filter(function (plan) { return plan.shared; })[0];
    if (shared || (state.shared === "split" && plans.some(function (plan) { return plan.mode === "split"; }))) {
      return { text: "이 값은 다른 자모와 함께 쓰는 규칙에 있습니다 — 어떻게 고칠까요?", buttons: [
        { label: "함께 고치기", hook: "studioEasyShared", value: "edit", pressed: state.shared !== "split" },
        { label: "이 자모만 따로", hook: "studioEasyShared", value: "split", pressed: state.shared === "split" }] };
    }
    return null;
  }

  function easyChecksText() {
    var errors = lintErrorCount();
    var crowded = lastOverlaps.filter(function (entry) { return entry && Number(entry.ratio) > 0.15; }).length;
    if (!errors && !crowded) {
      return "검사: 문제 없음";
    }
    return "검사: " + [errors ? "글꼴 검사 오류 " + errors + "건" : "", crowded ? "자모가 많이 겹친 곳 " + crowded + "곳" : ""]
      .filter(Boolean).join(" · ") + " — 자세한 것은 정밀 모드";
  }

  function renderEasy(node) {
    var panel = $("[data-studio-easy-edit]");
    if (!panel) {
      return;
    }
    root.dataset.easyOpen = node && doc ? "true" : "false";
    inspectorStale.easy = false;
    if (!node || !doc) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    if (!inspectorShown("easy")) {
      inspectorStale.easy = true; // 감춰진 판 — 쉬운 보기의 고치기 페이지가 되면 그린다
      return;
    }
    var glyph = node.closest('[part="glyph"]');
    var role = roleWord(node);
    $("[data-studio-easy-what]").textContent = "'" + (glyph ? glyph.dataset.source || "" : "") + "'의 " + node.getAttribute("data-jamo") +
      (role ? " (" + role + ")" : "");
    /* 범위 셋 */
    var scopes = easyScopes(node);
    var meaning = easyMeaning(node);
    var notes = [];
    Array.prototype.forEach.call(panel.querySelectorAll('input[name="easy-scope"]'), function (radio) {
      var entry = scopes.filter(function (item) { return item.meaning === radio.value; })[0];
      radio.disabled = !entry || !entry.scope;
      radio.checked = meaning === radio.value;
      var label = radio.closest("label");
      label.dataset.disabled = radio.disabled ? "true" : "false";
      label.title = entry && entry.why ? entry.why : "";
      if (entry && entry.why) {
        notes.push(entry.why);
      }
    });
    if (!meaning) {
      notes.unshift("정밀 모드에서 고른 범위('" + (SCOPE_NAMES[currentScope(node)] || "다른 범위") + "')를 씁니다 — 위에서 고르면 바뀝니다");
    }
    var note = $("[data-studio-easy-scope-note]");
    note.hidden = notes.length === 0;
    note.textContent = notes.join(" · ");
    /* 막대와 숫자(지금 보이는 값) */
    var box = $("[data-studio-easy-sliders]");
    box.textContent = "";
    EASY_ROWS.forEach(function (spec) {
      var row = document.createElement("div");
      row.className = "studio-easy-row";
      row.dataset.studioEasyRow = spec.property;
      var id = "studio-easy-" + spec.property;
      var label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = spec.label;
      var plan = planOf(node, spec.property);
      var now = easyVisible(node, spec.property);
      var reason = !plan ? "이 범위에서는 " + spec.label + "을(를) 고칠 수 없습니다"
        : refused(plan) ? refusalText(plan) : now === null ? "지금 값을 읽을 수 없습니다" : "";
      var range = document.createElement("input");
      range.type = "range";
      range.id = id;
      range.dataset.studioEasyRange = spec.property;
      var number = document.createElement("input");
      number.type = "number";
      number.dataset.studioEasyValue = spec.property;
      number.setAttribute("aria-label", spec.label + " 숫자");
      number.step = String(spec.step);
      if (now !== null) {
        var bounds = easyRange(spec.property, now);
        range.min = String(bounds[0]);
        range.max = String(bounds[1]);
        range.step = String(spec.step);
        range.value = String(now);
        number.value = String(now);
        number.dataset.now = String(now);
      }
      range.disabled = Boolean(reason);
      number.disabled = Boolean(reason);
      if (reason) {
        row.dataset.disabled = "true";
        row.title = reason;
      }
      var unit = document.createElement("span");
      unit.className = "studio-easy-unit";
      unit.textContent = spec.unit;
      row.appendChild(label);
      row.appendChild(range);
      row.appendChild(number);
      row.appendChild(unit);
      box.appendChild(row);
    });
    /* 경고와 해결 단추 */
    var warning = easyWarningOf(node);
    var area = $("[data-studio-easy-warning]");
    area.textContent = "";
    area.hidden = !warning;
    if (warning) {
      var line = document.createElement("p");
      line.textContent = warning.text;
      area.appendChild(line);
      warning.buttons.forEach(function (spec) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset[spec.hook] = spec.value || "";
        if (spec.pressed !== undefined) {
          button.setAttribute("aria-pressed", spec.pressed ? "true" : "false");
        }
        button.textContent = spec.label;
        area.appendChild(button);
      });
    }
    $("[data-studio-easy-checks]").textContent = easyChecksText();
    keepAboveSheet(node, panel);
  }

  /* 휴대폰 쉬운 모드: 아래 판이 고른 글자를 가리지 않게 — 새로 고르면 그 글자가 판 위에 오도록 문서를 굴린다 */
  var easyShownKey = null;
  function keepAboveSheet(node, panel) {
    var key = selectionKey();
    if (key === easyShownKey) {
      return;
    }
    easyShownKey = key;
    if (!window.matchMedia || !window.matchMedia("(max-width: 600px)").matches || root.dataset.studioMode !== "easy" || !editing()) {
      return;
    }
    requestAnimationFrame(function () {
      var glyph = node.isConnected ? node.closest('[part="glyph"]') || node : null;
      if (!glyph) {
        return;
      }
      var box = glyph.getBoundingClientRect();
      var sheetTop = panel.getBoundingClientRect().top;
      if (box.top < 8 || box.bottom > sheetTop - 8) {
        window.scrollBy({ top: box.top - Math.max(8, (sheetTop - box.height) / 3), behavior: "instant" });
      }
    });
  }

  /* 쉬운 판의 값 하나를 그 값으로 — 지금 보이는 값과의 차이를 끌기·키와 같은 길로 보낸다. 결과는 applyInput과 같은 꼴 */
  function easyCommit(property, raw) {
    var node = selectedNode();
    if (!node) {
      return refusedResult(makeRefusal("NO_SELECTION"));
    }
    var target = parseFloat(String(raw).replace(",", "."));
    var now = easyVisible(node, property);
    var result;
    if (!isFinite(target) || now === null || (property === "size" && target <= 0)) {
      result = refusedResult(refuse("VALUE_INVALID", { kind: "easy", name: propertyName(property), detail: String(raw) }));
    } else if (property === "left" || property === "top") {
      var delta = Math.round((target - now) * 100) / 100;
      if (!delta) {
        return { ok: true, effect: "unchanged" };
      }
      result = property === "left" ? nudgeResult(delta, 0) : nudgeResult(0, delta);
    } else if (property === "size") {
      if (Math.abs(target - now) < 0.0005) {
        return { ok: true, effect: "unchanged" };
      }
      result = stepResult("size", target / now);
    } else if (property === "rotate") {
      var turn = Math.round((target - now) * 10) / 10;
      if (!turn) {
        return { ok: true, effect: "unchanged" };
      }
      result = stepResult("rotate", turn);
    } else {
      result = applyInput("weight", String(Math.round(target)));
    }
    easyNotice = result && !result.ok
      ? { key: selectionKey(), text: "⚠ " + (result.message || "고치지 못했습니다") + ".", buttons: [{ label: "정밀 모드에서 하기", hook: "studioToPrecise" }] }
      : null;
    restoreSelection();
    return result;
  }

  function easyAffectedText() {
    if (affected.refused) {
      return "이 범위로는 이 자모를 고칠 수 없습니다";
    }
    var total = totalText();
    return (affected.hover ? "이 범위로 고르면 " : "고치면 ") + "미리보기에서 " + affected.nodes.length + "곳이 바뀝니다(점선)" +
      (total ? " · " + total : "");
  }

  (function wireEasy() {
    var panel = $("[data-studio-easy-edit]");
    if (!panel) {
      return;
    }
    panel.addEventListener("change", function (event) {
      var target = event.target;
      if (target.name === "easy-scope") {
        var node = selectedNode();
        var entry = node ? easyScopes(node).filter(function (item) { return item.meaning === target.value; })[0] : null;
        if (entry && entry.scope) {
          state.scope = entry.scope;
          state.scopeChosen = true;
          state.escalate = null;
          easyNotice = null;
          restoreSelection();
        }
      } else if (target.dataset.studioEasyRange || target.dataset.studioEasyValue) {
        easyCommit(target.dataset.studioEasyRange || target.dataset.studioEasyValue, target.value);
      }
    });
    /* 막대를 끄는 동안은 숫자만 따라간다 — 놓을 때(change) 한 번 고친다(기록 한 줄) */
    panel.addEventListener("input", function (event) {
      var property = event.target.dataset.studioEasyRange;
      if (property) {
        var number = panel.querySelector('[data-studio-easy-value="' + property + '"]');
        if (number) {
          number.value = event.target.value;
        }
      }
    });
    panel.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.matches("[data-studio-easy-fold]")) {
        var folded = panel.dataset.folded === "true";
        panel.dataset.folded = folded ? "false" : "true";
        root.dataset.easyFolded = panel.dataset.folded;
        button.setAttribute("aria-expanded", folded ? "true" : "false");
        button.textContent = folded ? "접기" : "펼치기";
        return;
      }
      if (button.dataset.studioEasyShared !== undefined) {
        state.shared = button.dataset.studioEasyShared === "split" ? "split" : "edit";
        restoreSelection();
      } else if (button.dataset.studioEasyEscalate !== undefined) {
        state.escalate = selectionKey(); // 정밀 모드의 '대신 … 고치기'와 같은 길(그 단추는 줄 번호를 보인다)
        easyNotice = null;
        restoreSelection();
      } else if (button.dataset.studioEasyDeescalate !== undefined) {
        state.escalate = null;
        restoreSelection();
      } else if (button.dataset.studioEasyRescope !== undefined) {
        easyNotice = null;
        var first = panel.querySelector('input[name="easy-scope"]:not(:disabled)');
        if (first) {
          first.focus();
        }
      }
    });
    /* 범위에 마우스를 올리면 그 범위로 바뀔 곳을 미리 */
    var scopeBox = panel.querySelector("[data-studio-easy-scope]");
    scopeBox.addEventListener("pointerover", function (event) {
      var label = event.target.closest ? event.target.closest("label") : null;
      var radio = label ? label.querySelector('input[name="easy-scope"]') : null;
      var node = selectedNode();
      if (!radio || radio.disabled || !node || !editing()) {
        return;
      }
      var entry = easyScopes(node).filter(function (item) { return item.meaning === radio.value; })[0];
      var current = stamped(node) ? shapeRange(node) : currentScope(node);
      var want = entry && entry.scope && entry.scope !== current ? entry.scope : null;
      if (want !== affected.hover) {
        showAffected(want);
      }
    });
    scopeBox.addEventListener("pointerleave", function () {
      if (affected.hover) {
        showAffected(null);
      }
    });
  })();

  /* '정밀 모드에서 하기' — 고른 것·페이지·기록을 그대로 두고 정밀 모드로(사람이 바꾼 보기라 이 브라우저에 기억한다) */
  root.addEventListener("click", function (event) {
    var link = event.target.closest ? event.target.closest("[data-studio-to-precise]") : null;
    if (!link) {
      return;
    }
    event.preventDefault();
    setMode("precise", { remember: true });
    var target = $("[data-studio-target]");
    if (target && editing() && !target.hidden) {
      target.scrollIntoView({ block: "nearest" });
    }
  });

  /* 보기가 바뀌면 고친 것·고른 것은 그대로 — 판·손잡이·바뀔 곳 상자 자리만 다시 잡는다(칸이 나타나고 사라져 미리보기가 움직인다) */
  hooks.mode.push(function () {
    easyNotice = null;
    restoreSelection();
    requestAnimationFrame(function () {
      if (handles) {
        positionHandles();
      }
      positionAffected();
    });
  });

  /* Rules whose declarations reach the node: matching the node or any
   * element between it and the host (conditions evaluated). */
  function rulesFor(resolver) {
    var seen = [];
    resolver.chain.forEach(function (element) {
      var winners = resolver.winnersAt(element);
      Object.keys(winners).forEach(function (name) {
        var rule = winners[name].rule;
        if (seen.indexOf(rule) < 0) {
          seen.push(rule);
        }
      });
    });
    return doc.rules.filter(function (rule) { return seen.indexOf(rule) >= 0; });
  }

  function planValue(plan) {
    if (!plan) {
      return "";
    }
    return plan.existing ? plan.existing.value : (plan.baseValue || "");
  }

  /* Does the browser agree with the model about `variable` on `element`?
   * Registered (@property) types are compared through a probe element. */
  function sameComputed(element, variable, expected) {
    var actual = getComputedStyle(element).getPropertyValue(variable);
    if (Model.normalizeValue(actual) === Model.normalizeValue(expected)) {
      return true;
    }
    if (/var\(/i.test(expected)) {
      return true; // 치환된 값은 비교하지 않는다
    }
    var probe = document.createElement("span");
    probeBox.appendChild(probe);
    probe.style.setProperty(variable, expected);
    var canonical = getComputedStyle(probe).getPropertyValue(variable);
    probe.remove();
    return Model.normalizeValue(actual) === Model.normalizeValue(canonical);
  }

  /* 글자로 만들기(문자 매핑, ADR-032) 글꼴인가 — 글꼴 CSS가 그릴 문자·문자 후보를 적었거나 미리보기 자모가 매핑되었으면 */
  var GLYPH_MAPPING_ROWS = ["glyph-text", "glyph-candidate"];

  function glyphMappingFont(node) {
    if (/--fy-[a-z0-9-]*glyph-(text|candidate)\s*:/.test(state.css || "")) {
      return true;
    }
    if (node && (node.hasAttribute("data-fy-glyph-mapped") || node.hasAttribute("data-fy-glyph-status"))) {
      return true;
    }
    return Boolean(host && host.querySelector("[data-fy-glyph-mapped]"));
  }

  // ── 값 칸 = 지금 보이는 값(PLAN-STUDIO-002 S4 '값') ─────────────────────
  /* 정밀 모드 값 표의 칸은 노드가 지금 그리는 값이다 — 규칙에 적힌 값이 아니라 자리 값(노드에서 다시 적은 값 포함)에 보정을 합친 값
   * (검토 2026-10-18 §3: gothic top 칸 −18.4%, 실제 −20.3%). 셈은 코어 CSS의 합치는 규칙(font-kku.css 머리말)대로 모델의 해석(resolver
   * entry: 자리 사슬의 값 + 보정 변수들)에서 한다 — 위치·회전·획 두께는 더하고, 크기·배율은 곱하고, 굵기·자르기는 가장 좁은 보정이
   * 대신한다(entry.offsets는 넓은 것부터). 칸에 친 값은 '보이게 할 값'이다: 이 범위의 대상 값을 (친 값 − 보이는 값)만큼 옮긴다(배수는
   * 비로). 다른 기여가 없으면(대상 값 = 보이는 값) 친 글 그대로 적는다. 셀 수 없으면(var()·단위 섞인 곱) 대상 값을 그대로 보이고
   * 고친다(data-value-mode="written"). 화면 밖에서 쓰는 이름: FontStudio.visibleValue, api.edit의 visible. 나누기 맞춤(네모꼴의 기본 아닌
   * 나누기, 런타임 그림 옮김 — FontKku.splitFit)이 옮긴 노드는 그 옮김도 넣는다(가로·세로 위치에 더하고 배율에 곱한다, fitShift) — 맞춘
   * 자리에서 시작하는 절대 범위의 첫 값(fromFittedPlace)과 같은 '보이는 값'이다(S4-A 통합) */
  function plainNumber(text) {
    var value = String(text == null ? "" : text).trim();
    return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(value) ? parseFloat(value) : null;
  }

  /* "0.62em"·"1.1"·"0" → { n, unit } (단위 하나), 아니면 null */
  function factorTerm(text) {
    var bare = plainNumber(text);
    if (bare !== null) {
      return { n: bare, unit: "" };
    }
    var terms = Model.parseLengthSum(text);
    var units = terms ? Object.keys(terms) : [];
    return units.length === 1 ? { n: terms[units[0]], unit: units[0] } : null;
  }

  function addTerms(into, text, sign) {
    var terms = String(text == null ? "" : text).trim() === "" ? {} : Model.parseLengthSum(text);
    if (!terms) {
      return false;
    }
    Object.keys(terms).forEach(function (unit) {
      into[unit] = (into[unit] || 0) + sign * terms[unit];
    });
    return true;
  }

  /* 단위별 합 → 글(모델의 offsetAdd가 쓰는 꼴 그대로 — "−20.3%", "calc(-0.05em + 1%)"). 모두 0이면 "0<단위>" */
  function formatTerms(terms, unit) {
    var clean = {};
    Object.keys(terms).forEach(function (key) {
      if (Math.abs(terms[key]) > 1e-9) {
        clean[key] = Math.round(terms[key] * 10000) / 10000;
      }
    });
    var units = Object.keys(clean);
    return units.length ? Model.offsetAdd(sumText(clean), 0, units[0]) : "0" + (unit || "");
  }

  function sumText(terms) {
    var units = Object.keys(terms);
    if (units.length === 1) {
      return String(terms[units[0]]) + units[0];
    }
    return "calc(" + units.map(function (unit, index) {
      var part = String(terms[unit]) + unit;
      return index === 0 ? part : part.charAt(0) === "-" ? "- " + part.slice(1) : "+ " + part;
    }).join(" ") + ")";
  }

  /* 노드가 지금 그리는 값 { text, parts(어디서 온 값인지 — 출처 줄), ok } — 셀 수 없으면 ok false */
  function visibleOf(entry, node) {
    var definition = propertyDef(entry.property);
    var combine = definition ? definition.combine : null;
    var base = entry.value === null || entry.value === undefined ? "" : String(entry.value);
    var offsets = (entry.offsets || []).slice();
    var parts = [{ name: entry.source ? entry.source.variable : "기본", value: base }].concat(offsets.map(function (offset) {
      return { name: offset.variable, value: offset.value };
    }));
    var shift = node && FIT_PLACE.indexOf(entry.property) >= 0 ? fitShift(node) : null;
    if (shift) {
      var moved = entry.property === "left" || entry.property === "top" ? round4(shift[entry.property]) + "%" : String(round4(shift[entry.property]));
      offsets.push({ variable: "짓는 방식 맞춤", value: moved });
      parts.push({ name: "짓는 방식 맞춤", value: moved });
    }
    if (combine === "add") {
      var terms = {};
      var fine = addTerms(terms, base, 1) && offsets.every(function (offset) { return addTerms(terms, offset.value, 1); });
      var text = fine ? formatTerms(terms, definition.unit) : null;
      return text ? { ok: true, text: text, parts: parts, combine: combine } : { ok: false, parts: parts, combine: combine };
    }
    if (combine === "factor") {
      var head = base === "" ? { n: 1, unit: entry.property === "size" ? "em" : "" } : factorTerm(base);
      if (!head) {
        return { ok: false, parts: parts, combine: combine };
      }
      var product = head.n;
      for (var index = 0; index < offsets.length; index += 1) {
        var factor = plainNumber(offsets[index].value);
        if (factor === null) {
          return { ok: false, parts: parts, combine: combine };
        }
        product *= factor;
      }
      return { ok: true, text: String(Math.round(product * 10000) / 10000) + head.unit, parts: parts, combine: combine, unit: head.unit };
    }
    if (combine === "replace") {
      var winner = offsets.length ? offsets[offsets.length - 1].value : base;
      return { ok: winner !== "", text: winner, parts: parts, combine: combine };
    }
    return { ok: base !== "", text: base, parts: parts, combine: combine || "replace" };
  }

  /* 보이게 할 값 → 이 범위의 대상(plan)에 적을 값. 못 셈하면 null */
  function writtenFor(plan, visible, typed) {
    var current = planValue(plan);
    if (Model.normalizeValue(current) === Model.normalizeValue(visible.text) || visible.combine === "replace") {
      return typed; // 다른 기여가 없다 — 친 글 그대로
    }
    if (visible.combine === "add") {
      var terms = {};
      if (!addTerms(terms, current, 1) || !addTerms(terms, typed, 1) || !addTerms(terms, visible.text, -1)) {
        return null;
      }
      return formatTerms(terms, (propertyDef(plan.property) || {}).unit || "");
    }
    if (visible.combine === "factor") {
      var now = factorTerm(visible.text);
      var want = factorTerm(typed);
      var mine = factorTerm(current === "" ? "1" : current); // 새 보정은 배수 1에서
      if (!now || !want || !mine || !now.n || (want.unit && want.unit !== now.unit)) {
        return null;
      }
      return String(Math.round(mine.n * want.n / now.n * 10000) / 10000) + mine.unit;
    }
    return typed;
  }

  /* 값 칸(보이는 값)·FontStudio.visibleValue·api.edit의 visible → applyInput과 같은 결과 꼴 */
  function applyVisible(property, value) {
    var text = value === undefined || value === null ? "" : String(value).trim();
    if (!knownProperty(property)) {
      return refusedResult(refuse("PROPERTY_UNKNOWN", { property: property }));
    }
    var node = selectedNode();
    if (!node) {
      root.dataset.editEffect = "refused";
      return refusedResult(makeRefusal("NO_SELECTION"));
    }
    if (stamped(node) || text === "") {
      return applyInput(property, text); // 고정 모양의 모양 값 칸은 보이는 값 그대로(보정이 위치·크기에 더해지지 않는다)
    }
    var plan = planOf(node, property);
    if (!plan || refused(plan)) {
      return applyInput(property, text); // 같은 거절 문구
    }
    var visible = visibleOf(resolverFor(node).entry(property), node);
    if (!visible.ok) {
      return applyInput(property, text);
    }
    if (Model.normalizeValue(visible.text) === Model.normalizeValue(text)) {
      return { ok: true, effect: "unchanged" };
    }
    var written = writtenFor(plan, visible, text);
    if (written === null) {
      return refusedResult(refuse("VALUE_INVALID", { kind: "visible", name: propertyName(property), detail: visible.text + " → " + text }));
    }
    return applyInput(property, written);
  }

  function propertyRow(entry, resolver, computed, node) {
    var row = document.createElement("tr");
    row.dataset.property = entry.property;
    var name = document.createElement("th");
    name.textContent = propertyName(entry.property);
    name.title = entry.property + " — " + (entry.slotVar || "");
    var valueCell = document.createElement("td");
    var input = document.createElement("input");
    input.type = "text";
    input.size = 9;
    /* 위치·크기·회전 칸은 끌기·손잡이와 같은 대상(한 손짓 = 한 대상) */
    var plan = GESTURE.indexOf(entry.property) >= 0 ? gesturePlans(node).plans[entry.property] : planFor(entry.property, resolver);
    var visible = visibleOf(entry, node);
    input.value = visible.ok ? visible.text : planValue(plan);
    input.dataset.valueMode = visible.ok ? "visible" : "written";
    input.dataset.written = planValue(plan);
    if (visible.ok) {
      row.dataset.visible = visible.text;
    }
    /* 보정 범위의 새 칸은 효과 없는 값(누적 0, 배수 1, 대체는 비움)을 자리 표시로 */
    var correctionDefinition = Model.PROPERTIES.filter(function (property) { return property.key === entry.property; })[0];
    var planScope = plan && plan.scope ? plan.scope : currentScope(node);
    input.placeholder = plan && !plan.existing && ["jamo", "context", "case", "glyph"].indexOf(planScope) >= 0 &&
      correctionDefinition && correctionDefinition.neutral !== null ? correctionDefinition.neutral : "";
    input.disabled = !plan;
    input.title = (visible.ok ? "지금 보이는 값 " + visible.text + " — 친 값이 보이도록 이 범위의 값을 고칩니다\n" :
      "적힌 값 그대로 고칩니다(보이는 값을 셀 수 없음)\n") +
      (plan ? "고치는 곳: " + describeTarget(plan) + " (지금 " + (planValue(plan) || "없음") + ")" +
        (refused(plan) ? "\n⚠ " + refusalText(plan) + "\n" + blockedMessage(plan) : "")
        : "이 범위에는 이 속성의 보정 변수가 없습니다");
    if (refused(plan)) {
      row.dataset.refused = "";
    }
    input.dataset.studioInput = entry.property;
    input.addEventListener("change", function () {
      if (input.dataset.valueMode === "visible") {
        applyVisible(entry.property, input.value.trim());
      } else {
        applyInput(entry.property, input.value.trim());
      }
    });
    valueCell.appendChild(input);
    var source = document.createElement("td");
    source.className = "studio-source-cell";
    var mismatch = [entry.source].concat(entry.offsets).filter(Boolean).filter(function (supplier) {
      return !sameComputed(node, supplier.variable, supplier.value);
    });
    source.textContent = describeSource(entry, computed) + (mismatch.length
      ? "  ⚠ 실제 값이 모델과 다름: " + mismatch.map(function (supplier) {
        return supplier.variable + " = " + (getComputedStyle(node).getPropertyValue(supplier.variable).trim() || "(없음)");
      }).join(", ") + " (글꼴 밖 CSS가 이 값을 덮음)"
      : "");
    if (mismatch.length) {
      row.dataset.mismatch = "true";
    }
    row.appendChild(name);
    row.appendChild(valueCell);
    row.appendChild(source);
    return row;
  }

  function describeSupplier(supplier) {
    return layerLabel(supplier.layer) + " L" + supplier.line + (supplier.scope !== "node" ? " (" + (SUPPLIER_SCOPE_LABELS[supplier.scope] || supplier.scope) + ")" : "") +
      (supplier.important ? " !important" : "") +
      (supplier.conditions && supplier.conditions.length ? " @" + supplier.conditions.map(function (condition) { return condition.type; }).join("@") : "") +
      (supplier.uncertain ? " (조건 미확인)" : "");
  }

  function describeSource(entry, computed) {
    var parts = [];
    if (entry.source) {
      parts.push(entry.source.variable + " = " + entry.source.value + " · " + describeSupplier(entry.source));
    } else if (entry.builtin !== null && entry.builtin !== undefined) {
      parts.push("내장값 " + entry.builtin);
    } else {
      parts.push("상속/기본값");
    }
    entry.offsets.forEach(function (offset) {
      parts.push("+ " + offset.variable.replace("--fy-", "") + " " + offset.value + " · " + describeSupplier(offset));
    });
    if (entry.property === "top") {
      parts.push("→ " + computed.insetBlockStart);
    } else if (entry.property === "left") {
      parts.push("→ " + computed.insetInlineStart);
    } else if (entry.property === "size") {
      parts.push("→ " + computed.fontSize);
    } else if (entry.property === "weight") {
      parts.push("→ " + computed.fontWeight);
    } else if (entry.property === "stroke") {
      parts.push("→ " + computed.webkitTextStrokeWidth);
    } else if (entry.property === "clip") {
      parts.push("→ " + computed.clipPath);
    } else if (entry.property === "dilate" && computed.filter !== "none") {
      parts.push("→ " + computed.filter);
    }
    return parts.join("  ");
  }

  // ── Global and cluster variables ───────────────────────────────────────

  var CLUSTER_MEMBERS = ["x", "y", "scale-x", "scale-y", "rotate", "origin-x", "origin-y"];
  var GLOBAL_GROUPS = [
    { label: "리듬", names: ["--fy-glyph-width", "--fy-glyph-height", "--fy-glyph-gap", "--fy-space-width", "--fy-word-gap", "--fy-line-gap"] },
    { label: "글꼴", names: ["--fy-font-family", "--fy-font-weight", "--fy-font-stroke"] },
    { label: "구조", names: ["--fy-expression-mode", "--fy-font-jamo-depth", "--fy-font-vowel-depth", "--fy-font-coda-depth", "--fy-font-composition"] },
    { label: "그림 자소", names: ["--fy-sprite-cell", "--fy-sprite-zoom", "--fy-sprite-crop-x", "--fy-sprite-crop-y", "--fy-sprite-dilate", "--fy-sprite-rendering"] }
  ].concat([
    "--fy-jung-cluster-", "--fy-jung-cluster-open-", "--fy-jung-cluster-closed-",
    "--fy-jong-cluster-", "--fy-jong-cluster-right-", "--fy-jong-cluster-bottom-", "--fy-jong-cluster-split-"
  ].map(function (prefix) {
    return {
      label: prefix.replace(/^--fy-|-$/g, ""),
      names: CLUSTER_MEMBERS.map(function (member) { return prefix + member; })
    };
  }));

  /* Host-level winner of `name` (the rule an edit should change): the
   * cascade on the host, conditions and !important included. */
  function hostDeclaration(name) {
    return Model.createResolver(doc, host, host).lookupAt(host, name);
  }

  /* Where a host-level edit of `name` lands in `sourceDoc`: the cascade
   * winner on the host, else the base host rule of the font layer. */
  function hostTarget(sourceDoc, name) {
    var winner = Model.createResolver(sourceDoc, host, host).lookupAt(host, name);
    return winner
      ? { layer: winner.layer, selector: winner.selector, variable: name, rule: winner.rule, existing: winner.declaration }
      : { layer: "font-kku.font", selector: Model.fontScope(state.fontId), variable: name, rule: null };
  }

  /* Several host variables as one edit (one undo step). Each target is
   * resolved on the text the previous edit produced, so rule offsets never
   * go stale. An empty value removes the winning declaration. */
  function setHostVariables(pairs, note, tone) {
    var text = state.css;
    pairs.forEach(function (pair) {
      var target = hostTarget(Model.parse(text), pair[0]);
      if (pair[1] === "" && !target.rule) {
        return;
      }
      text = Model.applyTarget(text, target, pair[1]);
    });
    if (text === state.css) {
      return false;
    }
    return commit(text, note, tone);
  }

  function hostValue(name) {
    var winner = doc ? hostDeclaration(name) : null;
    return winner ? winner.value : null;
  }

  /* 글꼴 구조 변수(음절 나누기·짓는 방식 — ADR-030 §4, ADR-034) 여럿을 편집 한 번으로. 전역 변수 칸과 같은 길이다: 고정 글꼴 모양이면
   * font 계층의 값(바탕 글꼴의 기본)은 모양에 닿지 않으니 @layer font-kku.tune 바탕 요소 규칙에 적고 고친다. 빈 값은 그 선언을 지운다 */
  function structureTarget(sourceDoc, name) {
    var tuneHost = fixedLayout() && FIXED_TUNE_HOST.test(name);
    var winner = Model.createResolver(sourceDoc, host, host).lookupAt(host, name);
    if (tuneHost && winner && winner.layer !== Model.TUNE_LAYER) {
      winner = null;
    }
    return winner
      ? { layer: winner.layer, selector: winner.selector, variable: name, rule: winner.rule, existing: winner.declaration }
      : { layer: tuneHost ? Model.TUNE_LAYER : "font-kku.font", selector: Model.fontScope(state.fontId), variable: name, rule: null };
  }

  function setStructureVariables(pairs, note, tone) {
    if (!doc) {
      return false;
    }
    var text = state.css;
    pairs.forEach(function (pair) {
      var target = structureTarget(Model.parse(text), pair[0]);
      if (pair[1] === "" && !target.rule) {
        return;
      }
      text = Model.applyTarget(text, target, pair[1]);
    });
    if (text === state.css) {
      return false;
    }
    return commit(text, note, tone);
  }

  /* 구조 변수의 지금 선언 값(고정 모양이면 tune 계층 것만 — 그 위의 것만 모양에 닿는다), 없으면 null */
  function structureValue(name) {
    if (!doc) {
      return null;
    }
    var target = structureTarget(doc, name);
    return target.rule && target.existing ? target.existing.value : null;
  }

  /* 고정 글꼴 모양의 기본 나누기(프로파일 depth) — 이름 하나의 값 */
  function fixedDepthDefault(name) {
    var info = FontKku.layoutProfiles ? FontKku.layoutProfiles[host.dataset.fyLayout] : null;
    var depth = info && info.depth;
    if (!depth) {
      return "?";
    }
    if (/vowel/.test(name)) {
      return depth.vowel;
    }
    if (/coda/.test(name)) {
      return depth.coda;
    }
    return depth.vowel + " · " + depth.coda;
  }

  function renderGlobals() {
    var body = $("[data-studio-globals-body]");
    if (!doc || !$("[data-studio-globals]").open) {
      return;
    }
    body.textContent = "";
    var fixed = fixedLayout();
    GLOBAL_GROUPS.forEach(function (group) {
      var fieldset = document.createElement("fieldset");
      var legend = document.createElement("legend");
      var inert = fixed ? group.names.filter(function (name) { return FIXED_INERT.test(name); }) : [];
      var tuned = fixed ? group.names.filter(function (name) { return FIXED_TUNE_HOST.test(name); }) : [];
      legend.textContent = group.label + (inert.length ? " — 고정 글꼴 모양: " + (inert.length === group.names.length
        ? "글꼴 모양이 정해 꺼짐" : "글자 칸은 글꼴 모양이 정함") : "") +
        (tuned.length ? " — 고정 글꼴 모양: 음절 나누기는 손 보정(" + Model.TUNE_LAYER + ")에 적음" : "");
      if (inert.length === group.names.length) {
        fieldset.dataset.inert = "fixed-layout";
      }
      fieldset.appendChild(legend);
      group.names.forEach(function (name) {
        var tuneHost = fixed && FIXED_TUNE_HOST.test(name);
        var winner = hostDeclaration(name);
        /* 고정 모양: font 계층의 값(바탕 글꼴의 기본 나누기)은 닿지 않는다 — tune 계층의 선언만 보이고 고친다 */
        if (tuneHost && winner && winner.layer !== Model.TUNE_LAYER) {
          winner = null;
        }
        var label = document.createElement("label");
        if (inert.indexOf(name) >= 0) {
          label.dataset.inert = "fixed-layout";
          label.title = "고정 글꼴 모양(" + layoutLabel() + ")에서는 글꼴 모양이 이 값을 정합니다 — 고쳐도 화면이 바뀌지 않습니다";
        }
        var caption = document.createElement("span");
        caption.textContent = name.replace(/^--fy-/, "") + (winner ? " · L" + winner.line : "");
        var input = document.createElement("input");
        input.type = "text";
        input.value = winner ? winner.value : "";
        input.placeholder = tuneHost ? "(모양 기본 " + fixedDepthDefault(name) + ")" : "(미선언)";
        if (tuneHost) {
          label.title = "고정 글꼴 모양(" + layoutLabel() + ")의 음절 나누기 — 이 글꼴 CSS의 @layer " + Model.TUNE_LAYER + " 바탕 요소 규칙에 적습니다";
        }
        input.dataset.studioGlobal = name;
        input.addEventListener("change", function () {
          var target = winner
            ? { layer: winner.layer, selector: winner.selector, variable: name, rule: winner.rule, existing: winner.declaration }
            : { layer: tuneHost ? Model.TUNE_LAYER : "font-kku.font", selector: Model.fontScope(state.fontId), variable: name, rule: null };
          var value = input.value.trim();
          if (value === "" && !winner) {
            return;
          }
          commit(Model.applyTarget(state.css, target, value), name + (value === "" ? " 선언을 지웠습니다" : " = " + value) + " · " +
            layerLabel(target.layer) + " 레이어 " + shortSelector(target.selector));
          if (value !== "" && !sameComputed(host, name, value)) {
            warnNoEffect(name, value, host);
          }
        });
        label.appendChild(caption);
        label.appendChild(input);
        fieldset.appendChild(label);
      });
      body.appendChild(fieldset);
    });
  }

  // ── Editing ────────────────────────────────────────────────────────────

  // ── 미리 셈과 거절 표(자동화 계약 v1, PLAN-STUDIO-002 S1) ──────────────
  /* capture가 있으면(FontStudio.api.edit의 dryRun과 '모두 아니면 하나도' 셈) 편집 함수가 화면과 같은 길로 대상을 정하고 값을 셈하되
   * commit은 글꼴 CSS를 적용하지 않고 그 글만 받아 둔다: state.css·doc만 셈한 글로 바꿔 다음 편집이 그 위에서 대상을 정하고, 기록·
   * 초안·미리보기·알림은 그대로 둔다. 끝나면 runCapture가 원래 글로 되돌린다. */
  var capture = null;
  var commitLabel = null; // api가 정한 다음 기록 줄 이름(note)

  function runCapture(fn) {
    var saved = { css: state.css, doc: doc, effect: root.dataset.editEffect };
    capture = { notes: [], applied: [], messages: [] };
    var out = null;
    var failure = null;
    try {
      out = fn();
    } catch (error) {
      failure = error;
    }
    var result = capture;
    result.value = out;
    result.css = state.css;
    try {
      result.lint = lintFindings().slice(); // 셈한 글의 계약 검사(같은 검사 모듈)
    } catch (error) {
      result.lint = null;
    }
    capture = null;
    state.css = saved.css;
    doc = saved.doc;
    gestureCache = null;
    defaultCache = null;
    if (saved.effect === undefined) {
      delete root.dataset.editEffect;
    } else {
      root.dataset.editEffect = saved.effect;
    }
    restoreSelection(); // 살펴보기·손잡이를 원래 글로 다시 그린다
    if (failure) {
      throw failure;
    }
    return result;
  }

  /* 거절 한 줄(authoring/font-studio-refusals.js) — 표가 없는 옛 묶음에서는 코드만 */
  function makeRefusal(code, params) {
    var table = window.FontStudioRefusals;
    if (table) {
      return table.make(code, params);
    }
    return { code: code, message: code };
  }

  function refusalLine(refusal) {
    var table = window.FontStudioRefusals;
    return table ? table.line(refusal) : "⚠ " + refusal.message + ".";
  }

  /* 거절을 화면 알림에 보이고 그 한 줄을 돌려준다 — 화면 문구와 API refused[]가 같은 줄에서 나온다 */
  function showRefusal(refusal) {
    var table = window.FontStudioRefusals;
    var tone = table ? table.tone(refusal.code) : "warn";
    message(refusalLine(refusal), tone === "error" ? "error" : tone === "info" ? "info" : "warn", refusal.detail);
    if (tone !== "info") {
      root.dataset.editEffect = "refused";
    }
    return refusal;
  }

  function refuse(code, params) {
    return showRefusal(makeRefusal(code, params));
  }

  /* setValue·api 결과의 거절 꼴 { ok: false, code, message, hint?, detail? } */
  function refusedResult(refusal) {
    var out = { ok: false, code: refusal.code, message: refusal.message };
    if (refusal.hint) {
      out.hint = refusal.hint;
    }
    if (refusal.detail) {
      out.detail = refusal.detail;
    }
    if (refusal.suggestScope) {
      out.suggestScope = refusal.suggestScope;
    }
    return out;
  }

  function commit(nextCss, note, tone, detail) {
    if (capture) {
      var nextDoc;
      try {
        nextDoc = Model.parse(nextCss);
      } catch (error) {
        return false;
      }
      state.css = nextCss;
      doc = nextDoc;
      capture.notes.push({ text: note || "", detail: detail || "" });
      root.dataset.editEffect = "ok";
      return true;
    }
    historyLabel = commitLabel || note || null;
    commitLabel = null;
    var done = setCss(nextCss);
    historyLabel = null;
    if (!done) {
      return false;
    }
    if (note) {
      message(note, tone, detail);
    }
    root.dataset.editEffect = "ok";
    return true;
  }

  function warnNoEffect(variable, expected, element) {
    var actual = getComputedStyle(element).getPropertyValue(variable).trim();
    var cause = "글꼴 밖 CSS(페이지 규칙·보존 블록)가 이 값을 덮음";
    var mainCause = "글꼴 밖의 CSS가 이 값을 덮습니다";
    if (element !== host) {
      var supplier = resolverFor(element).lookup(variable);
      if (supplier && Model.normalizeValue(supplier.value) !== Model.normalizeValue(expected)) {
        cause = layerLabel(supplier.layer) + " L" + supplier.line + " " + shortSelector(supplier.selector) + " 규칙이 이 값을 덮음";
        mainCause = "다른 규칙이 이 값을 덮습니다";
      }
    }
    message("⚠ 편집이 반영되지 않았습니다 — " + mainCause + ".", "warn",
      variable + " 실제 값 " + (actual || "(없음)") + " ≠ " + expected + " — " + cause);
    root.dataset.editEffect = "none";
  }

  /* After an edit, the selected node must see what was written. */
  function verifyEdits(applied) {
    if (capture) {
      capture.applied = capture.applied.concat(applied); // 미리 셈은 계산된 값을 볼 수 없다 — 적용한 뒤 api가 다시 잰다
      return true;
    }
    var node = selectedNode();
    if (!node) {
      return true;
    }
    for (var index = 0; index < applied.length; index += 1) {
      var entry = applied[index];
      if (entry.value !== "" && !sameComputed(node, entry.plan.variable, entry.value)) {
        warnNoEffect(entry.plan.variable, entry.value, node);
        return false;
      }
    }
    root.dataset.editEffect = "ok";
    return true;
  }

  function planScopeName(plan) {
    if (plan.followed || plan.escalated || plan.escalatedFrom) {
      return "대신 고친 규칙";
    }
    if (plan.scope === "shape") {
      return "손 보정 · " + (SCOPE_NAMES[plan.range] || plan.range);
    }
    return SCOPE_NAMES[plan.scope] || plan.scope || "";
  }

  /* 편집 알림 { text(한국어), detail(변수·규칙 원문) } — applied: [{ plan, value }] */
  function editNote(applied) {
    var first = applied[0].plan;
    var text = "고쳤습니다: " + applied.map(function (entry) {
      var name = propertyName(entry.plan.property || "");
      return entry.value === "" ? name + " 값 지움" : name + " = " + entry.value;
    }).join(", ") + " · 범위 '" + planScopeName(first) + "'" + (first.shared ? " (여러 자모가 함께 쓰는 규칙)" : "") + ".";
    var detail = applied.map(function (entry) {
      return entry.plan.variable + (entry.value === "" ? " 선언을 지웠습니다" : " = " + entry.value) +
        (entry.plan.freeze && entry.plan.freeze.length && entry.value !== "" ? " (맞춘 자리를 함께 적음: " + entry.plan.freeze.map(function (frozen) {
          return frozen.variable + " = " + frozen.value;
        }).join(", ") + ")" : "");
    }).join(", ") + " · " + describeTarget(first) + (first.shared ? " (공유: " + first.shared.text + ")" : "");
    return { text: text, detail: detail };
  }

  /* 모르는 속성(D11 — 전에는 말없이 무시하고 앞 편집의 editEffect=ok가 남았다) */
  function knownProperty(property) {
    return Boolean(propertyDef(property));
  }

  /* 배수 보정(--fy-<수준>-size·scale-x·scale-y, 보정 수준 넷 — ADR-035)에 적을 값. 크기 보정 칸에 길이(0.6em·12px)를 치면 지금 보이는
   * 크기에 맞춘 배수로 바꾼다 — 그 수준의 지금 배수 × 원하는 크기 ÷ 보이는 크기(노드 글자 크기 ÷ 부모 글자 크기, em). 수는 그대로.
   * 그 밖(%·배율에 길이·글)은 { error } — 전에는 --fy-ctx-size: 0.6em을 그대로 적어 린트만 value-type으로 알렸다(D3 갈래가 찾음).
   * 돌려주는 것: { value, note? } 또는 { error } */
  var FACTOR_CORRECTION = /^--fy-(jamo|case|ctx|syl)-(size|scale-x|scale-y)$/;

  function factorInput(plan, text, node) {
    if (!plan || !FACTOR_CORRECTION.test(plan.variable || "") || text === "") {
      return { value: text };
    }
    if (/^-?\d*\.?\d+$/.test(text)) {
      return { value: text };
    }
    var length = /^(-?\d*\.?\d+)(em|px)$/i.exec(text);
    if (!length || !/-size$/.test(plan.variable) || !node || !node.parentElement) {
      return { error: true };
    }
    var nodeSize = parseFloat(getComputedStyle(node).fontSize);
    var parentSize = parseFloat(getComputedStyle(node.parentElement).fontSize);
    var wanted = parseFloat(length[1]) * (length[2].toLowerCase() === "px" ? 1 / parentSize : 1);
    var current = Number(planValue(plan) || "1");
    if (!(nodeSize > 0 && parentSize > 0 && wanted > 0 && isFinite(current))) {
      return { error: true };
    }
    var factor = round4(current * wanted / (nodeSize / parentSize));
    return { value: String(factor), note: "크기 " + text + "를 지금 보이는 크기에 맞춘 배수 " + factor + "로 적었습니다" };
  }

  /* 값 칸·FontStudio.setValue → { ok, code?, message?, hint?, detail? }. 코드(거절 표 authoring/font-studio-refusals.js):
   * PROPERTY_UNKNOWN · NO_SELECTION · NO_TARGET(이 범위에 그 속성의 변수가 없음) · EDIT_BLOCKED(가려짐, 한 손짓 막음 포함) ·
   * EDIT_FAILED. 적용하면 { ok: true, effect: "ok"|"none" }. 화면 알림은 같은 표의 한 줄이다 */
  function applyInput(property, value) {
    var text = value === undefined || value === null ? "" : String(value).trim();
    if (!knownProperty(property)) {
      return refusedResult(refuse("PROPERTY_UNKNOWN", { property: property }));
    }
    var node = selectedNode();
    if (!node) {
      root.dataset.editEffect = "refused";
      return refusedResult(makeRefusal("NO_SELECTION"));
    }
    clearMessage();
    var plan = planOf(node, property);
    if (!plan) {
      return refusedResult(refuse("NO_TARGET", { name: propertyName(property) }));
    }
    if (refused(plan)) {
      var why = refusal(plan);
      showRefusal(why.refusal);
      restoreSelection();
      return refusedResult(why.refusal);
    }
    if (text === "" && !plan.existing) {
      restoreSelection();
      return { ok: true, effect: "unchanged" };
    }
    var factor = factorInput(plan, text, node);
    if (factor.error) {
      return refusedResult(refuse("VALUE_INVALID", { kind: "factor", name: propertyName(property), value: text, detail: plan.variable + " = " + text }));
    }
    text = factor.value;
    var next;
    try {
      next = Model.applyTarget(state.css, plan, text);
    } catch (error) {
      return refusedResult(refuse("EDIT_FAILED", { detail: error.message }));
    }
    if (!plan.property) {
      plan.property = property;
    }
    var note = editNote([{ plan: plan, value: text }]);
    commit(next, note.text + (factor.note ? " " + factor.note + "." : ""), undefined, note.detail);
    if (text !== "") {
      verifyEdits([{ plan: plan, value: text }]);
    }
    return { ok: true, effect: root.dataset.editEffect };
  }

  /* Move the selected node by (dxPct, dyPct) of the glyph box at the current
   * scope: the target value (or the value the node sees now, for a new
   * rule) plus the delta. em terms stay; the % term changes (calc()). */
  function nudge(dxPct, dyPct) {
    var result = nudgeResult(dxPct, dyPct);
    return result.ok ? result.verified : false;
  }

  /* nudge의 결과 꼴(자동화 계약 v1): 거절은 { ok: false, code, message, … }, 적용하면 { ok: true, effect, verified } */
  function nudgeResult(dxPct, dyPct) {
    var node = selectedNode();
    if (!node) {
      return refusedResult(makeRefusal("NO_SELECTION"));
    }
    clearMessage();
    var text = state.css;
    var workDoc = doc;
    var applied = [];
    var failed = null;
    [["left", dxPct], ["top", dyPct]].forEach(function (pair) {
      if (!pair[1] || failed) {
        return;
      }
      var plan = planOf(node, pair[0], workDoc);
      if (!plan) {
        failed = makeRefusal("NO_TARGET", { action: "위치를 옮길" });
        return;
      }
      if (refused(plan)) {
        failed = refusal(plan).refusal;
        return;
      }
      var current = planValue(plan);
      var next = Model.offsetAdd(current, pair[1], "%");
      if (next === null) {
        failed = makeRefusal("VALUE_INVALID", { kind: "move", name: propertyName(pair[0]), detail: plan.variable + " = " + current });
        return;
      }
      try {
        text = Model.applyTarget(text, plan, next);
      } catch (error) {
        failed = makeRefusal("EDIT_FAILED", { detail: error.message });
        return;
      }
      workDoc = Model.parse(text);
      if (!plan.property) {
        plan.property = pair[0];
      }
      applied.push({ plan: plan, value: next });
    });
    if (failed) {
      return refusedResult(showRefusal(failed));
    }
    if (!applied.length) {
      return refusedResult(makeRefusal("NO_CHANGE"));
    }
    var note = editNote(applied);
    commit(text, note.text, undefined, note.detail);
    var verified = verifyEdits(applied);
    return { ok: true, effect: root.dataset.editEffect, verified: verified };
  }

  // ── Checks (ADR-009 §5 1단계: 잉크 상자 기반) ─────────────────────────

  var measureContext = document.createElement("canvas").getContext("2d");
  var checkTimer = null;

  /* 검증(잉크 상자·음절 안 겹침·손잡이 자리)은 고치기 페이지가 보일 때만 렌더마다 돈다(PLAN-STUDIO-002 S1 — 디자인·자소판·검수
   * 페이지에서 고칠 때마다 캔버스로 잉크를 다시 재던 것). 다른 페이지에서는 밀린 것(checksReady="stale")으로 두고, 고치기 페이지로
   * 가거나 settled()·overlaps()처럼 결과를 청하면 그때 돈다. settled()는 늘 검증까지 끝난 상태를 기다린다(뜻은 그대로) */
  function checksWanted() {
    return editing();
  }

  function scheduleChecks() {
    clearTimeout(checkTimer);
    checkTimer = null;
    if (!checksWanted()) {
      runChecks.token = null; // 돌던 재기의 결과는 버린다 — 밀린 것을 청할 때 새로 잰다
      root.dataset.checksReady = "stale";
      return;
    }
    root.dataset.checksReady = "false";
    checkTimer = setTimeout(runChecks, 120);
  }

  /* 밀린 검증을 지금 청한다(settled·overlaps·고치기 페이지로 가기) — 이미 돌거나 끝났으면 아무것도 하지 않는다 */
  function requestChecks() {
    if (root.dataset.checksReady === "stale" && doc && state.coreLoaded) {
      root.dataset.checksReady = "false";
      clearTimeout(checkTimer);
      checkTimer = setTimeout(runChecks, 0);
    }
  }

  hooks.page.push(function () {
    if (checksWanted()) {
      requestChecks();
    }
  });

  /* request === false(quiet)면 밀린 검증(stale)을 청하지 않고 끝난 것으로 본다 — 지금 화면에 필요한 일만 기다린다. 자동화 계약의
   * settled 사건이 이 길을 쓴다(편집마다 사건을 내려고 검증을 청하면 디자인 페이지에서도 검증이 늘 돌았다 — S1 통합에서 찾음) */
  function idle(request) {
    var studio = window.FontStudio || {};
    if (!doc || !state.coreLoaded) {
      return false;
    }
    if (request !== false) {
      requestChecks();
    }
    var checks = root.dataset.checksReady;
    return (checks === "true" || (request === false && checks === "stale")) && !reachPending && !runChecks.blank &&
      !(studio.material && typeof studio.material.busy === "function" && studio.material.busy()) &&
      !(studio.design && typeof studio.design.busy === "function" && studio.design.busy()) &&
      !(typeof studio.loading === "function" && studio.loading());
  }

  /* Where Blink puts the text baseline inside a jamo node: the font ascent
   * plus the *floored* half-leading of the line box (LayoutNG
   * FontHeight::AddLeading), metrics rounded to whole pixels. The unfloored
   * formula is off by up to a pixel, which a slot scale of 2× turns into a
   * visible shift of thin touching strokes. */
  function textBaseline(style, metrics) {
    var ascent = Math.round(metrics.fontBoundingBoxAscent);
    var descent = Math.round(metrics.fontBoundingBoxDescent);
    var lineHeight = parseFloat(style.lineHeight);
    if (!isFinite(lineHeight)) {
      return ascent; // line-height: normal — no leading to split
    }
    var layoutLine = Math.floor(lineHeight * 64) / 64; // LayoutUnit
    return ascent + Math.floor((layoutLine - (ascent + descent)) / 2);
  }

  /* Approximate ink box of a jamo node in page coordinates: canvas text
   * metrics for system/bundled material, the element box for sprite cells.
   * Clip-path and rotation are ignored (warning-level check). */
  function inkBox(node) {
    var mapped = mappedInkBox(node);
    if (mapped) { return mapped; }
    var style = getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    if (style.backgroundImage && style.backgroundImage !== "none") {
      return { x0: rect.left, x1: rect.right, y0: rect.top, y1: rect.bottom };
    }
    /* 원소 재료(ADR-024)는 획이 CSS 상자다 — 글자 측정 대신 그린 획 상자를 합친다(고정 배치의 좁은 글자 칸에서 글자 측정
     * 근사가 이웃과 겹쳐 보이던 것) */
    var strokes = node.querySelectorAll('[part="element"]');
    if (strokes.length) {
      var box = null;
      Array.prototype.forEach.call(strokes, function (stroke) {
        var part = stroke.getBoundingClientRect();
        if (part.width || part.height) {
          box = box ? { x0: Math.min(box.x0, part.left), x1: Math.max(box.x1, part.right), y0: Math.min(box.y0, part.top), y1: Math.max(box.y1, part.bottom) }
            : { x0: part.left, x1: part.right, y0: part.top, y1: part.bottom };
        }
      });
      if (box) {
        return box;
      }
    }
    measureContext.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    var metrics = measureContext.measureText(node.textContent);
    var baseline = textBaseline(style, metrics);
    var stroke = (parseFloat(style.webkitTextStrokeWidth) || 0) / 2;
    var matrix = style.transform && style.transform !== "none" ? new DOMMatrix(style.transform) : new DOMMatrix();
    return {
      x0: rect.left + (-metrics.actualBoundingBoxLeft - stroke) * matrix.a,
      x1: rect.left + (metrics.actualBoundingBoxRight + stroke) * matrix.a,
      y0: rect.top + (baseline - metrics.actualBoundingBoxAscent - stroke) * matrix.d,
      y1: rect.top + (baseline + metrics.actualBoundingBoxDescent + stroke) * matrix.d
    };
  }

  function glyphInk(glyph) {
    var box = null;
    jamoNodes(glyph).forEach(function (node) {
      var ink = inkBox(node);
      box = box ? { x0: Math.min(box.x0, ink.x0), x1: Math.max(box.x1, ink.x1), y0: Math.min(box.y0, ink.y0), y1: Math.max(box.y1, ink.y1) } : ink;
    });
    return box;
  }

  // ── 잉크로 고르기(작업실 검토 2026-10-16 §2) ───────────────────────────
  /* 자모 노드는 글자 칸만 한 em 상자라 뒤 노드(중성·종성)가 앞 노드(초성)를 덮는다 — 누른 점에 그 자모의 잉크가 있는지로 고른다.
   * 원소 재료는 획 상자([part="element"])를 브라우저가 맞히고(회전·둥근 모서리까지), 그림(SVG)은 도형의 칠·선, 자소판은 그 칸
   * 화소, 글자(기기 글꼴 맞춤의 ::before, 그 밖의 노드 글자)는 캔버스 한 칸에 다시 그려 잰다. 잴 수 없으면 null. */

  var hitCanvas = document.createElement("canvas");
  hitCanvas.width = 1;
  hitCanvas.height = 1;
  var hitContext = hitCanvas.getContext("2d", { willReadFrequently: true });

  function unquoteContent(content) {
    var match = /^"((?:[^"\\]|\\.)*)"$/.exec(content || "");
    return match ? match[1].replace(/\\(.)/g, "$1") : null;
  }

  function pixelInk(draw) {
    hitContext.setTransform(1, 0, 0, 1, 0, 0);
    hitContext.clearRect(0, 0, 1, 1);
    hitContext.save(); // 자르기(clip)가 다음 잼에 쌓이지 않게
    try {
      if (draw(hitContext) === false) {
        return null;
      }
      return hitContext.getImageData(0, 0, 1, 1).data[3] > 64;
    } catch (error) {
      return null; // file:// 자소판은 캔버스를 오염시킨다
    } finally {
      hitContext.restore();
    }
  }

  /* 노드 좌표(px, 노드 상자 왼쪽 위 기준)를 화면 점 (x, y)가 캔버스 (0, 0)에 오게 놓는 변환 */
  function nodeTransform(context, node, x, y) {
    var rect = node.getBoundingClientRect();
    var sx = rect.width / (node.offsetWidth || 1);
    var sy = rect.height / (node.offsetHeight || 1);
    context.setTransform(sx, 0, 0, sy, rect.left - x, rect.top - y);
  }

  /* 문자 매핑 잎은 의미 자모 노드의 글자가 아니다. 실제 run과 각 조상의 회전·비균등 배율을 같은 캔버스에 그려 고른다. */
  function mappedLeaves(node) {
    return Array.prototype.slice.call(node.querySelectorAll('[part="leaf"][data-fy-glyph-text]'));
  }

  function screenMatrix(element) {
    var matrix = new DOMMatrix(), current = element;
    while (current && current.nodeType === 1) {
      var value = getComputedStyle(current).transform;
      if (value && value !== "none") {
        var local = new DOMMatrix(value);
        matrix = new DOMMatrix([local.a, local.b, local.c, local.d, 0, 0]).multiply(matrix);
      }
      current = current.parentElement || (current.getRootNode && current.getRootNode().host);
    }
    var style = getComputedStyle(element), rect = element.getBoundingClientRect();
    var width = parseFloat(style.width) || element.offsetWidth || 1, height = parseFloat(style.height) || element.offsetHeight || 1;
    var points = [[0, 0], [width, 0], [0, height], [width, height]].map(function (point) { return matrix.transformPoint(new DOMPoint(point[0], point[1])); });
    matrix.e = rect.left - Math.min.apply(null, points.map(function (point) { return point.x; }));
    matrix.f = rect.top - Math.min.apply(null, points.map(function (point) { return point.y; }));
    return matrix;
  }

  function glyphPaint(context, leaf) {
    var paint = getComputedStyle(leaf);
    /* 잎의 언어(zxx)로 일반 글꼴 낱말을 풀어야 화면과 같은 글꼴이다 */
    if ("lang" in context) { context.lang = leaf.getAttribute("lang") || "inherit"; }
    context.font = paint.fontStyle + " " + paint.fontWeight + " " + paint.fontSize + " " + paint.fontFamily;
    if ("fontStretch" in context) { context.fontStretch = paint.fontStretch; }
    if ("letterSpacing" in context) { context.letterSpacing = paint.letterSpacing; }
    if ("wordSpacing" in context) { context.wordSpacing = paint.wordSpacing; }
    if ("fontKerning" in context) { context.fontKerning = paint.fontKerning; }
    return paint;
  }

  /* 잘라 그리는 잎(clip-path polygon, 잎 좌표 px)의 상자. 자르지 않으면 null */
  function leafClip(leaf) {
    var value = getComputedStyle(leaf).clipPath || "";
    if (!/^polygon\(/.test(value)) { return null; }
    var numbers = (value.match(/-?[0-9.]+(?:e-?[0-9]+)?px/g) || []).map(parseFloat);
    if (numbers.length < 6) { return null; }
    var xs = numbers.filter(function (n, i) { return i % 2 === 0; }), ys = numbers.filter(function (n, i) { return i % 2 === 1; });
    return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
  }

  function paintMapped(context, node, x, y, scale) {
    var zoom = scale || 1;
    context.save();
    var owner = getComputedStyle(node);
    if (owner.clipPath && owner.clipPath !== "none") {
      var clip = insetBox(owner.clipPath, node.offsetWidth || 1, node.offsetHeight || 1), box = screenMatrix(node);
      context.setTransform(box.a * zoom, box.b * zoom, box.c * zoom, box.d * zoom, (box.e - x) * zoom, (box.f - y) * zoom);
      context.beginPath(); context.rect(clip.x, clip.y, clip.w, clip.h); context.clip();
    }
    mappedLeaves(node).forEach(function (leaf) {
      var matrix = screenMatrix(leaf), paint = glyphPaint(context, leaf), text = leaf.textContent;
      context.setTransform(matrix.a * zoom, matrix.b * zoom, matrix.c * zoom, matrix.d * zoom, (matrix.e - x) * zoom, (matrix.f - y) * zoom);
      var metrics = context.measureText(text), baseline = textBaseline(paint, metrics), cut = leafClip(leaf);
      context.save();
      if (cut) { context.beginPath(); context.rect(cut.x0, cut.y0, cut.x1 - cut.x0, cut.y1 - cut.y0); context.clip(); }
      var fill = paint.webkitTextFillColor || paint.color;
      if (fill !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(fill)) { context.fillStyle = "#000"; context.fillText(text, 0, baseline); }
      var stroke = parseFloat(paint.webkitTextStrokeWidth) || 0;
      if (stroke > 0) { context.strokeStyle = "#000"; context.lineWidth = stroke; context.strokeText(text, 0, baseline); }
      context.restore();
    });
    context.restore();
  }

  function mappedInkBox(node) {
    var union = null;
    mappedLeaves(node).forEach(function (leaf) {
      measureContext.save();
      var paint = glyphPaint(measureContext, leaf), metrics = measureContext.measureText(leaf.textContent);
      measureContext.restore();
      var baseline = textBaseline(paint, metrics), stroke = (parseFloat(paint.webkitTextStrokeWidth) || 0) / 2, matrix = screenMatrix(leaf);
      var xs = [-metrics.actualBoundingBoxLeft - stroke, metrics.actualBoundingBoxRight + stroke];
      var ys = [baseline - metrics.actualBoundingBoxAscent - stroke, baseline + metrics.actualBoundingBoxDescent + stroke];
      var cut = leafClip(leaf);
      if (cut) {
        xs = [Math.max(xs[0], cut.x0), Math.min(xs[1], cut.x1)]; ys = [Math.max(ys[0], cut.y0), Math.min(ys[1], cut.y1)];
        if (xs[1] <= xs[0] || ys[1] <= ys[0]) { return; }
      }
      xs.forEach(function (x) { ys.forEach(function (y) {
        var point = matrix.transformPoint(new DOMPoint(x, y));
        union = union ? { x0: Math.min(union.x0, point.x), x1: Math.max(union.x1, point.x), y0: Math.min(union.y0, point.y), y1: Math.max(union.y1, point.y) }
          : { x0: point.x, x1: point.x, y0: point.y, y1: point.y };
      }); });
    });
    return union;
  }

  function textInk(node, x, y) {
    if (mappedLeaves(node).length) { return pixelInk(function (context) { paintMapped(context, node, x, y, 1); }); }
    var device = host.getAttribute("data-fy-face") === "device" && !node.hasAttribute("data-fy-leaves");
    var style = getComputedStyle(node);
    var paint = style;
    var text = node.textContent;
    if (device) {
      paint = getComputedStyle(node, "::before");
      text = unquoteContent(paint.content);
      if (text === null) {
        paint = style;
        text = node.textContent;
        device = false;
      }
    }
    if (!text) {
      return null;
    }
    return pixelInk(function (context) {
      nodeTransform(context, node, x, y);
      if (device && paint.transform && paint.transform !== "none") {
        var m = new DOMMatrix(paint.transform);
        context.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      }
      context.font = paint.fontWeight + " " + paint.fontSize + " " + paint.fontFamily;
      var metrics = context.measureText(text);
      var baseline = textBaseline(paint, metrics);
      context.fillStyle = "#000";
      context.fillText(text, 0, baseline);
      var stroke = parseFloat(paint.webkitTextStrokeWidth) || 0;
      if (stroke > 0) {
        context.strokeStyle = "#000";
        context.lineWidth = stroke;
        context.strokeText(text, 0, baseline);
      }
    });
  }

  function sheetInk(node, style, x, y) {
    var mask = /url\("?([^")]+)"?\)/.exec(style.webkitMaskImage || style.maskImage || "");
    var sheet = mask || /url\("?([^")]+)"?\)/.exec(style.backgroundImage || "");
    if (!sheet) {
      return undefined; // 자소판 노드가 아니다
    }
    var image = loadedImages[sheet[1]];
    if (!image) {
      cachedImage(sheet[1]);
      return null;
    }
    var position = (mask ? (style.webkitMaskPosition || style.maskPosition) : style.backgroundPosition).split(/\s+/).map(parseFloat);
    var size = (mask ? (style.webkitMaskSize || style.maskSize) : style.backgroundSize).split(/\s+/).map(parseFloat);
    if (!(size[0] > 0) || !(size[1] > 0)) {
      return null;
    }
    return pixelInk(function (context) {
      nodeTransform(context, node, x, y);
      context.beginPath();
      context.rect(0, 0, node.offsetWidth || 1, node.offsetHeight || 1);
      context.clip();
      context.drawImage(image, position[0] || 0, position[1] || 0, size[0], size[1]);
    });
  }

  function svgInk(node, x, y) {
    var shapes = node.querySelectorAll("svg path, svg line, svg polyline, svg polygon, svg circle, svg ellipse, svg rect");
    if (!shapes.length) {
      return null;
    }
    var point = new DOMPoint(x, y);
    for (var index = 0; index < shapes.length; index += 1) {
      var shape = shapes[index];
      var ctm = shape.getScreenCTM && shape.getScreenCTM();
      if (!ctm) {
        continue;
      }
      var local = point.matrixTransform(ctm.inverse());
      var style = getComputedStyle(shape);
      try {
        if (style.fill !== "none" && shape.isPointInFill(local)) {
          return true;
        }
        if (style.stroke !== "none" && shape.isPointInStroke(local)) {
          return true;
        }
      } catch (error) {
        return null;
      }
    }
    return false;
  }

  /* 자소판(배경·마스크 그림)을 미리 받아 둔다 — 첫 누르기부터 칸 화소로 잰다. 노드마다 본다: Firefox·Chromium은 노드마다 칸 그림이 다르다
   * (런타임 칸 문서, data-fy-sprite-cell) */
  function warmSheets() {
    var seen = {};
    Array.prototype.forEach.call(host.querySelectorAll("[data-sprite-jamo-kind]"), function (node) {
      var kind = node.getAttribute("data-sprite-jamo-kind");
      if (seen[kind] && !node.hasAttribute("data-fy-sprite-cell")) {
        return;
      }
      seen[kind] = true;
      var style = getComputedStyle(node);
      [style.webkitMaskImage, style.maskImage, style.backgroundImage].forEach(function (value) {
        var match = /url\("?([^")]+)"?\)/.exec(value || "");
        if (match) {
          cachedImage(match[1]);
        }
      });
    });
  }

  /* 누른 점 (x, y)에 잉크가 있는 자모 노드(위에 그려진 것부터)와, 그 점을 em 상자로 덮는 노드 */
  function inkAt(x, y) {
    var order = [];
    var inked = [];
    var elements = shadow.elementsFromPoint(x, y);
    elements.forEach(function (element) {
      if (!host.contains(element) || element === host) {
        return;
      }
      var node = element.closest('[part~="jamo"]');
      if (!node || !host.contains(node)) {
        return;
      }
      if (order.indexOf(node) < 0) {
        order.push(node);
      }
      if (element !== node && element.matches('[part="element"]') && inked.indexOf(node) < 0) {
        inked.push(node);
      }
    });
    var unknown = [];
    order.forEach(function (node) {
      if (inked.indexOf(node) >= 0 || node.querySelector('[part="element"]') && !mappedLeaves(node).length) {
        return;
      }
      var hit = mappedLeaves(node).length ? textInk(node, x, y) : undefined;
      if (hit !== true && node.querySelector("svg")) { hit = svgInk(node, x, y); }
      if (hit === undefined) {
        hit = sheetInk(node, getComputedStyle(node), x, y);
      }
      if (hit === undefined) {
        hit = textInk(node, x, y);
      }
      if (hit === true) {
        inked.push(node);
      } else if (hit === null) {
        unknown.push(node);
      }
    });
    inked.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return { order: order, inked: inked, unknown: unknown };
  }

  /* 누른 점에서 고를 차례: 그 점에 잉크가 있는 노드 → 둘레 3·6·10px에 잉크가 있는 노드(가는 획, 그림자 칠) → 잉크를 잴 수 없고 잉크 상자가 그 점을
   * 덮는 노드(작은 상자 먼저) → 나머지 em 상자. 같은 점을 다시 누르면 다음 노드로 간다. */
  function pickAt(x, y) {
    var here = inkAt(x, y);
    var ranked = here.inked.slice();
    var tiers = { ink: ranked.length };
    [3, 6, 10].forEach(function (radius) {
      for (var step = 0; step < 8; step += 1) {
        var angle = step * Math.PI / 4;
        inkAt(x + radius * Math.cos(angle), y + radius * Math.sin(angle)).inked.forEach(function (node) {
          if (ranked.indexOf(node) < 0) {
            ranked.push(node);
          }
        });
      }
    });
    tiers.near = ranked.length;
    here.unknown.map(function (node) {
      var box = inkBox(node);
      return { node: node, box: box, area: (box.x1 - box.x0) * (box.y1 - box.y0) };
    }).filter(function (entry) {
      return entry.box.x0 <= x && x <= entry.box.x1 && entry.box.y0 <= y && y <= entry.box.y1 && ranked.indexOf(entry.node) < 0;
    }).sort(function (a, b) { return a.area - b.area; }).forEach(function (entry) {
      ranked.push(entry.node);
    });
    tiers.box = ranked.length;
    here.order.forEach(function (node) {
      if (ranked.indexOf(node) < 0) {
        ranked.push(node);
      }
    });
    return { nodes: ranked, tiers: tiers };
  }

  // ── Checks 2단계: 음절 내부 잉크 겹침 (glyph_overlap_audit.py와 같은 판정) ──

  var OVERLAP_LIMIT = 0.15;
  var imageCache = {};

  var loadedImages = {}; // 불러 둔 자소판 — 누른 점의 잉크를 동기로 잴 때(pickAt)
  function cachedImage(url) {
    if (!imageCache[url]) {
      imageCache[url] = new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { loadedImages[url] = image; resolve(image); };
        image.onerror = function () { resolve(null); };
        image.src = url;
      });
    }
    return imageCache[url];
  }

  function forgetImage(url) {
    delete imageCache[url];
    delete loadedImages[url];
  }

  function insetBox(clip, width, height) {
    var match = /^inset\(([^)]*)\)/.exec(clip || "");
    if (!match) {
      return { x: 0, y: 0, w: width, h: height };
    }
    var parts = match[1].trim().split(/\s+/);
    var values = [parts[0], parts[1] || parts[0], parts[2] || parts[0], parts[3] || parts[1] || parts[0]];
    var px = function (value, total) {
      return /%$/.test(value) ? parseFloat(value) / 100 * total : parseFloat(value) || 0;
    };
    var top = px(values[0], height);
    var right = px(values[1], width);
    var bottom = px(values[2], height);
    var left = px(values[3], width);
    return { x: left, y: top, w: width - left - right, h: height - top - bottom };
  }

  /* Rasterize one jamo node into a glyph-local alpha mask the way the page
   * paints it: computed font/weight/stroke, the node's effective scale,
   * clip-path inset, or the sprite cell for sprite material. Resolves to
   * { mask, area } or { failed: "load" | "taint" }. */
  function nodeMask(node, region, scale, used) {
    var style = getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    var width = node.offsetWidth || 1;
    var height = node.offsetHeight || 1;
    var canvas = document.createElement("canvas");
    canvas.width = Math.ceil(region.width * scale);
    canvas.height = Math.ceil(region.height * scale);
    var context = canvas.getContext("2d", { willReadFrequently: true });
    var mapped = mappedLeaves(node).length > 0;
    context.setTransform(scale * rect.width / width, 0, 0, scale * rect.height / height,
      scale * (rect.left - region.left), scale * (rect.top - region.top));
    var clip = insetBox(style.clipPath, width, height);
    context.beginPath();
    context.rect(clip.x, clip.y, clip.w, clip.h);
    if (!mapped) { context.clip(); }
    var sprite = /url\("?([^")]+)"?\)/.exec(style.backgroundImage || "");
    var paint;
    if (mapped) {
      paintMapped(context, node, region.left, region.top, scale);
      paint = Promise.resolve(null);
    } else if (sprite && style.backgroundImage !== "none") {
      used[sprite[1]] = true;
      paint = cachedImage(sprite[1]).then(function (image) {
        if (!image) {
          return "load";
        }
        var position = style.backgroundPosition.split(/\s+/).map(parseFloat);
        var size = style.backgroundSize.split(/\s+/).map(parseFloat);
        context.drawImage(image, position[0], position[1], size[0], size[1]);
        return null;
      });
    } else {
      context.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
      var metrics = context.measureText(node.textContent);
      var baseline = textBaseline(style, metrics);
      context.fillStyle = "#000";
      context.fillText(node.textContent, 0, baseline);
      var stroke = parseFloat(style.webkitTextStrokeWidth) || 0;
      if (stroke > 0) {
        context.strokeStyle = "#000";
        context.lineWidth = stroke;
        context.strokeText(node.textContent, 0, baseline);
      }
      paint = Promise.resolve(null);
    }
    return paint.then(function (failure) {
      if (failure) {
        return { failed: failure };
      }
      var alpha;
      try {
        alpha = context.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch (error) {
        return { failed: "taint" }; // file:// 시트는 캔버스를 오염시킨다
      }
      /* canvas 글자는 페이지 글자(텍스트 감마·대비 보정)보다 가늘게 칠해진다. 알파 64를
       * 넘는 칸을 잉크로 치면 페이지 스크린숏의 50% 잉크 기준(glyph_overlap_audit.py)과
       * 잉크 면적이 가장 가깝다(Playwright 대조 검사가 같은 세션에서 확인한다). */
      var mask = new Uint8Array(canvas.width * canvas.height);
      var area = 0;
      for (var index = 0; index < mask.length; index += 1) {
        if (alpha[index * 4 + 3] > 64) {
          mask[index] = 1;
          area += 1;
        }
      }
      return { mask: mask, area: area };
    });
  }

  /* Every node pair of every glyph: ink intersection / smaller ink area.
   * Glyphs whose sheet could not be read are reported, not skipped silently. */
  function measureOverlaps() {
    var used = {};
    var unmeasured = [];
    var reasons = {};
    return Promise.all(glyphs().map(function (glyph) {
      var box = glyph.getBoundingClientRect();
      var pad = box.height * 0.5;
      var region = { left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
      var scale = Math.max(1, 150 / (box.height || 1));
      var nodes = jamoNodes(glyph);
      return Promise.all(nodes.map(function (node) { return nodeMask(node, region, scale, used); })).then(function (masks) {
        var failures = masks.filter(function (mask) { return mask.failed; });
        if (failures.length) {
          unmeasured.push(glyph.dataset.source);
          failures.forEach(function (mask) { reasons[mask.failed] = true; });
        }
        var pairs = [];
        for (var a = 0; a < nodes.length; a += 1) {
          for (var b = a + 1; b < nodes.length; b += 1) {
            if (masks[a].failed || masks[b].failed) {
              continue;
            }
            var inter = 0;
            for (var index = 0; index < masks[a].mask.length; index += 1) {
              inter += masks[a].mask[index] & masks[b].mask[index];
            }
            pairs.push({
              glyph: glyph.dataset.source,
              a: nodes[a].getAttribute("data-fy-pos"),
              b: nodes[b].getAttribute("data-fy-pos"),
              ratio: inter / Math.max(1, Math.min(masks[a].area, masks[b].area))
            });
          }
        }
        return pairs;
      });
    })).then(function (lists) {
      Object.keys(imageCache).forEach(function (url) {
        if (!used[url]) {
          delete imageCache[url];
        }
      });
      return { pairs: [].concat.apply([], lists), unmeasured: unmeasured, reasons: Object.keys(reasons) };
    });
  }

  var lastOverlaps = [];

  /* 5초를 넘겨 빈 칸(wait)에서 잰 검증은 칸이 오면(런타임 'restyle' 렌더 알림) 다시 잰다. 그때까지 settled()는 기다린다(idle) */
  host.addEventListener("font-kku:render", function () {
    if (runChecks.blank && !host.querySelector('[data-fy-sprite-cell="wait"]')) {
      runChecks.blank = false;
      scheduleChecks();
    }
  });

  function runChecks() {
    /* Firefox·Chromium 칸 문서(런타임이 칸을 나누는 동안 data-fy-sprite-cell="wait" — 글자 그림이 비어 있다)가 오면 잰다. 5초까지만 기다린다 */
    if (host.querySelector('[data-fy-sprite-cell="wait"]') && (runChecks.waits = (runChecks.waits || 0) + 1) <= 100) {
      clearTimeout(checkTimer);
      checkTimer = setTimeout(runChecks, 50);
      return;
    }
    runChecks.waits = 0;
    runChecks.blank = Boolean(host.querySelector('[data-fy-sprite-cell="wait"]'));
    var list = $("[data-studio-checks]");
    var summary = $("[data-studio-check-summary]");
    var findings = [];
    var all = glyphs();
    var inks = all.map(glyphInk);
    all.forEach(function (glyph, index) {
      var ink = inks[index];
      if (!ink) {
        return;
      }
      var box = glyph.getBoundingClientRect();
      var margin = box.width * 0.12;
      if (ink.x0 < box.left - margin || ink.x1 > box.right + margin) {
        findings.push({ kind: "cell", glyph: index, text: glyph.dataset.source + " — 잉크가 글자 칸 밖으로 " +
          Math.round(Math.max(box.left - ink.x0, ink.x1 - box.right)) + "px 나감" });
      }
      var next = inks[index + 1];
      var nextGlyph = all[index + 1];
      if (next && nextGlyph && Math.abs(nextGlyph.getBoundingClientRect().top - box.top) < 1) {
        var overlapX = Math.min(ink.x1, next.x1) - Math.max(ink.x0, next.x0);
        var overlapY = Math.min(ink.y1, next.y1) - Math.max(ink.y0, next.y0);
        if (overlapX > 1 && overlapY > 1) {
          findings.push({ kind: "collision", glyph: index, text: glyph.dataset.source + nextGlyph.dataset.source +
            " — 이웃 음절과 잉크 상자가 " + Math.round(overlapX) + "px 겹침" + (fixedLayout()
              ? " (고정 글꼴 모양의 글자 칸은 이웃과 겹치게 짜여 있어 글자 측정 근사일 수 있음 — 판정은 겹침 감사 --layout fixed)" : "") });
        }
      }
    });
    var token = {};
    runChecks.token = token;
    measureOverlaps().then(function (result) {
      if (runChecks.token !== token) {
        return;
      }
      lastOverlaps = result.pairs;
      result.pairs.filter(function (pair) { return pair.ratio > OVERLAP_LIMIT; }).forEach(function (pair) {
        findings.push({ kind: "overlap", text: pair.glyph + " — 음절 안 " + pair.a + "×" + pair.b +
          " 잉크가 " + Math.round(pair.ratio * 100) + "% 겹침 (임계 " + OVERLAP_LIMIT * 100 + "%)" });
      });
      var status = "ok";
      var overlapText;
      var worst = result.pairs.reduce(function (best, pair) { return Math.max(best, pair.ratio); }, 0);
      if (result.unmeasured.length) {
        var cause = result.reasons.indexOf("taint") >= 0
          ? "file:// 자소판이 캔버스를 오염시킴"
          : "자소판 이미지를 불러오지 못함";
        status = result.unmeasured.length === all.length ? "unmeasurable" : "partial";
        findings.push({ kind: "unmeasured", text: "음절 안 겹침을 잴 수 없음(" + cause + "): " + result.unmeasured.join(" ") });
        overlapText = status === "unmeasurable"
          ? " · 음절 안 겹침은 잴 수 없음 (" + cause + ")"
          : " · 음절 안 최대 겹침 " + Math.round(worst * 100) + "% (" + result.unmeasured.length + "글자는 잴 수 없음: " + cause + ")";
      } else {
        overlapText = " · 음절 안 최대 겹침 " + Math.round(worst * 100) + "%";
      }
      list.textContent = "";
      findings.forEach(function (finding) {
        var item = document.createElement("li");
        item.dataset.kind = finding.kind;
        item.textContent = finding.text;
        list.appendChild(item);
      });
      var problems = findings.filter(function (finding) { return finding.kind !== "unmeasured"; }).length;
      summary.textContent = (problems ? problems + "건" : status === "ok" ? "문제 없음" : "잰 범위에서 문제 없음") + overlapText +
        " (잉크 상자·canvas 다시 그리기 근사)";
      root.dataset.checkCount = String(problems);
      root.dataset.overlapStatus = status;
      positionHandles(); // 글꼴을 다 받으면 자리가 바뀔 수 있다
      warmSheets();
      root.dataset.checksReady = "true";
    });
  }

  // ── 직접 조작: 끌기·손잡이(작업실 검토 2026-10-16 §1·§2·§5·§6·§7) ─────────
  /* 누르면 잉크로 고르고(pickAt), 끌면 옮긴다. 고른 자모의 잉크 상자에 손잡이 틀을 두어 오른쪽 아래 손잡이는 크기, 위 손잡이는
   * 회전이다. 끄는 동안은 끌기 시트(dragSheet)만 바꾸고, 뗄 때 글꼴 CSS에 한 번 적는다(되돌리기 한 단계). 같은 점을 다시 누르면
   * (Alt 누르기도) 그 점 아래 다음 자모를 고른다. 손가락은 고른 자모만 끌고 다른 자모는 두드려 고른다 — 그 밖에서는 쪽을 넘긴다. */

  var handles = document.createElement("div");
  handles.className = "studio-handles";
  handles.setAttribute("data-studio-handles", "");
  handles.hidden = true;
  handles.innerHTML = '<span class="studio-handles-box" aria-hidden="true"></span>' +
    '<span class="studio-handles-stem" aria-hidden="true"></span>' +
    '<span class="studio-handle" data-studio-handle="rotate" title="끌어 돌리기 — 5°씩(Shift 15°), 키보드 [ ] (Shift 15°)"></span>' +
    '<span class="studio-handle" data-studio-handle="size" title="끌어 크기 바꾸기 — 키보드 + −"></span>' +
    '<span class="studio-handle-tip" data-studio-handle-tip role="status" hidden></span>';
  preview.appendChild(handles);
  var handleTip = handles.querySelector("[data-studio-handle-tip]");

  // ── 머리 음절 안 조각(PLAN-STUDIO-002 S4 '머리 음절 안 조각 고르기', 검토 2026-10-16 §3) ──────────
  /* '의'의 ㅇ처럼 머리 음절 노드(나누기 '머리 음절'의 으·호) 안의 조각은 따로 된 노드가 아니라, 글꼴 CSS로 그 조각만 고칠 곳이 없다.
   * 고른 머리 음절의 같은 점을 다시 누르면 그 조각(첫소리 또는 모음 묶음)을 점선으로 보이고, 그 자리에 '낱으로 나눠 고치기'를 낸다.
   * 누르면 짓는 방식의 모음 나누기만 낱 모음으로 바꾸고(받침 나누기·조각 깊이는 그대로 — 기록 한 줄, Ctrl+Z) 그 글자의 그 자모를
   * 고른다. 한 번 더 같은 점을 누르면 그 점 아래 다음 자모로(전과 같다). 조각 상자는 원소 재료의 획 묶음(data-fy-head-part)에서,
   * 묶음이 없는 재료(기기 글꼴·자소판)는 머리 음절의 위(첫소리)·아래(모음 — 머리 음절의 모음은 늘 가로 모음 ㅗ·ㅜ·ㅡ)로 가른다 */
  var piece = null; // { glyph(미리보기 차례), source, part: "initial"|"medial", jamo(조합형 낱자) }
  var pieceLayer = document.createElement("div");
  pieceLayer.className = "studio-piece";
  pieceLayer.setAttribute("data-studio-piece", "");
  pieceLayer.hidden = true;
  pieceLayer.innerHTML = '<span class="studio-piece-box" data-studio-piece-box aria-hidden="true"></span>' +
    '<span class="studio-piece-offer" data-studio-piece-offer role="status"><span data-studio-piece-text></span> ' +
    '<button type="button" data-studio-piece-split title="모음 나누기를 낱 모음으로 바꿔 이 조각을 따로 그립니다 — 글꼴 전체의 짓는 방식이 바뀝니다(Ctrl+Z로 되돌리기)">낱으로 나눠 고치기</button></span>';
  preview.appendChild(pieceLayer);
  /* 제안(말풍선)과 그 글 — 미리보기 위 층에 떠 있거나 아래 칸(pieceDock)에 붙는다. 어디에 있든 이 둘로 찾는다 */
  var pieceOffer = pieceLayer.querySelector("[data-studio-piece-offer]");
  var pieceText = pieceLayer.querySelector("[data-studio-piece-text]");
  var CHOSEONG_FIRST = 0x1100;

  function headNode(node) {
    return Boolean(node) && partTokens(node).indexOf("head") >= 0;
  }

  /* 머리 음절의 첫소리(조합형 ᄋ) — 음절 글자에서 */
  function headInitial(node) {
    var glyph = node.closest('[part="glyph"]');
    var code = glyph && glyph.dataset.source ? glyph.dataset.source.charCodeAt(0) - 0xAC00 : -1;
    return code >= 0 && code < 11172 ? String.fromCharCode(CHOSEONG_FIRST + Math.floor(code / 588)) : null;
  }

  function unionBox(elements) {
    var box = null;
    Array.prototype.forEach.call(elements, function (element) {
      var r = element.getBoundingClientRect();
      if (r.width || r.height) {
        box = box ? { x0: Math.min(box.x0, r.left), y0: Math.min(box.y0, r.top), x1: Math.max(box.x1, r.right), y1: Math.max(box.y1, r.bottom) }
          : { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
      }
    });
    return box;
  }

  /* 머리 음절 노드의 조각 둘의 화면 상자 — { initial, medial } */
  function headPieces(node) {
    var out = {};
    ["initial", "medial"].forEach(function (part) {
      var groups = node.querySelectorAll(':scope > [part="hoek"][data-fy-head-part="' + part + '"]');
      var shapes = [];
      Array.prototype.forEach.call(groups, function (group) {
        var inner = group.querySelectorAll('[part="element"], svg, path, line, circle, ellipse, polyline, polygon, rect');
        Array.prototype.push.apply(shapes, inner.length ? Array.prototype.slice.call(inner) : [group]);
      });
      out[part] = shapes.length ? unionBox(shapes) : null;
    });
    if (!out.initial || !out.medial) {
      var ink = selectionBox(node);
      var cut = ink.y0 + (ink.y1 - ink.y0) * 0.55;
      out.initial = out.initial || { x0: ink.x0, y0: ink.y0, x1: ink.x1, y1: cut };
      out.medial = out.medial || { x0: ink.x0, y0: cut, x1: ink.x1, y1: ink.y1 };
    }
    return out;
  }

  function inBox(box, x, y) {
    return box && x >= box.x0 - 2 && x <= box.x1 + 2 && y >= box.y0 - 2 && y <= box.y1 + 2;
  }

  function nearest(boxes, x, y) {
    var best = null;
    Object.keys(boxes).forEach(function (part) {
      var box = boxes[part];
      var d = inBox(box, x, y) ? -1 : Math.hypot((box.x0 + box.x1) / 2 - x, (box.y0 + box.y1) / 2 - y);
      if (!best || d < best.d) {
        best = { part: part, d: d };
      }
    });
    return best ? best.part : "initial";
  }

  /* 고른 머리 음절의 (x, y)에 있는 조각을 고른다 */
  function choosePiece(node, x, y) {
    var glyph = node.closest('[part="glyph"]');
    var part = nearest(headPieces(node), x, y);
    var jamo = part === "initial" ? headInitial(node) : node.getAttribute("data-jamo-base");
    piece = { glyph: glyphs().indexOf(glyph), source: glyph.dataset.source, part: part, jamo: jamo, head: node.getAttribute("data-jamo") };
    root.dataset.piece = part;
    positionPiece();
    return piece;
  }

  function clearPiece() {
    if (!piece) {
      return;
    }
    piece = null;
    delete root.dataset.piece;
    positionPiece();
  }

  function pieceNode() {
    if (!piece) {
      return null;
    }
    var node = selectedNode();
    var glyph = node && node.closest('[part="glyph"]');
    return headNode(node) && glyph && glyphs().indexOf(glyph) === piece.glyph ? node : null;
  }

  /* 말풍선이 미리보기 안에 들 자리가 없을 때 붙는 칸 — 미리보기 바로 아래(글자를 덮지 않는다, S5-B) */
  var pieceDock = document.createElement("div");
  pieceDock.className = "studio-piece-dock";
  pieceDock.setAttribute("data-studio-piece-dock", "");
  pieceDock.hidden = true;
  preview.insertAdjacentElement("afterend", pieceDock);
  pieceDock.addEventListener("click", function (event) {
    if (event.target.closest("[data-studio-piece-split]")) {
      splitPiece();
    }
  });

  /* 말풍선(제안)을 미리보기 위 층(떠 있음) 또는 아래 칸(붙음)으로 옮긴다 */
  function dockOffer(offer, docked) {
    var holder = docked ? pieceDock : pieceLayer;
    if (offer.parentNode !== holder) {
      holder.appendChild(offer);
    }
    if (docked) {
      offer.dataset.dock = "true";
      offer.style.left = "";
      offer.style.top = "";
    } else {
      delete offer.dataset.dock;
    }
    pieceDock.hidden = !docked;
  }

  function overlapArea(a, b) {
    var w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    var h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function boxGap(a, b) {
    var dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
    var dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
    return Math.hypot(dx, dy);
  }

  /* 말풍선 자리 고르기(S5-B — 1440에서 옆 글자를 가리던 것): 미리보기 안 후보(고른 글자 아래·위·옆, 다른 글자 줄의 아래·위, 미리보기
   * 가장자리) 가운데 고른 글자·조각·손잡이와 다른 글자의 잉크를 하나도 덮지 않는 가장 가까운 자리. 말풍선이 넓으면 접어 좁힌 꼴도
   * 견준다. 들 자리가 없으면 null — 부르는 쪽이 미리보기 아래 칸에 붙인다. 잉크는 글자 칸이 후보와 겹칠 때만 잰다 */
  function freeOfferSpot(offer, node, ink, area, keep) {
    var glyphList = Array.prototype.filter.call(host.querySelectorAll('[part="glyph"]'), function (glyph) {
      var r = glyph.getBoundingClientRect();
      return r.width > 0 && r.bottom > area.y0 && r.top < area.y1 && r.right > area.x0 && r.left < area.x1;
    });
    var cells = glyphList.map(function (glyph) {
      var r = glyph.getBoundingClientRect();
      return { glyph: glyph, cell: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }, ink: null };
    });
    var inkOf = function (entry) {
      if (!entry.ink) {
        entry.ink = [];
        jamoNodes(entry.glyph).forEach(function (jamo) {
          var box = selectionBox(jamo);
          if (box && box.x1 > box.x0 && box.y1 > box.y0) {
            entry.ink.push(box);
          }
        });
      }
      return entry.ink;
    };
    var pad = 3;
    var fixed = keep.map(function (box) { return { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad }; });
    var covers = function (rect) {
      if (fixed.some(function (box) { return overlapArea(rect, box) > 0; })) {
        return true;
      }
      return cells.some(function (entry) {
        return overlapArea(rect, entry.cell) > 0 && inkOf(entry).some(function (box) {
          return overlapArea(rect, { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad }) > 0;
        });
      });
    };
    var shapes = [];
    offer.style.inlineSize = "";
    shapes.push({ w: offer.offsetWidth || 0, h: offer.offsetHeight || 0, narrow: null });
    var narrow = Math.max(150, Math.ceil(shapes[0].w * 0.56));
    if (narrow < shapes[0].w - 8) {
      offer.style.inlineSize = narrow + "px";
      shapes.push({ w: offer.offsetWidth || narrow, h: offer.offsetHeight || 0, narrow: narrow });
      offer.style.inlineSize = "";
    }
    var rows = [];
    cells.forEach(function (entry) {
      [entry.cell.y0, entry.cell.y1].forEach(function (y) {
        if (rows.every(function (seen) { return Math.abs(seen - y) > 2; })) {
          rows.push(y);
        }
      });
    });
    var best = null;
    shapes.forEach(function (shape) {
      var w = shape.w;
      var h = shape.h;
      if (!w || !h) {
        return;
      }
      var xs = [ink.x0, ink.x1 - w, ink.x1 + 14, ink.x0 - w - 14, (ink.x0 + ink.x1 - w) / 2, area.x0 + 4, area.x1 - w - 4];
      var ys = [ink.y1 + 10, ink.y1 + 44, ink.y0 - h - 10, ink.y0 - h - 44, ink.y0, ink.y1 - h, area.y0 + 4, area.y1 - h - 4];
      rows.forEach(function (y) {
        ys.push(y + 4, y - h - 4);
      });
      xs.forEach(function (x) {
        ys.forEach(function (y) {
          var rect = { x0: x, y0: y, x1: x + w, y1: y + h };
          if (rect.x0 < area.x0 + 2 || rect.x1 > area.x1 || rect.y0 < area.y0 + 2 || rect.y1 > area.y1 - 2 || covers(rect)) {
            return;
          }
          var distance = boxGap(rect, ink) + (shape.narrow ? 24 : 0); // 접지 않은 꼴을 조금 더 좋아한다
          if (!best || distance < best.distance) {
            best = { x: x, y: y, narrow: shape.narrow, distance: distance };
          }
        });
      });
    });
    return best;
  }

  function positionPiece() {
    var node = pieceNode();
    var offerNode = pieceOffer;
    if (!node || !editing()) {
      dockOffer(offerNode, false);
      pieceLayer.hidden = true;
      syncEasyPiece();
      return;
    }
    var box = headPieces(node)[piece.part];
    var frame = preview.getBoundingClientRect();
    var ox = -frame.left - preview.clientLeft + preview.scrollLeft;
    var oy = -frame.top - preview.clientTop + preview.scrollTop;
    var outline = pieceLayer.querySelector("[data-studio-piece-box]");
    outline.style.left = (box.x0 + ox) + "px";
    outline.style.top = (box.y0 + oy) + "px";
    outline.style.width = Math.max(1, box.x1 - box.x0) + "px";
    outline.style.height = Math.max(1, box.y1 - box.y0) + "px";
    pieceText.textContent = "머리 음절 '" + piece.head + "'의 " + (piece.jamo || "") +
      (piece.part === "initial" ? "(첫소리)" : "(모음)");
    var offer = offerNode;
    var ink = selectionBox(node);
    pieceLayer.hidden = false;
    dockOffer(offer, false); // 재기 전에 미리보기 위 층으로 — 아래에서 들 자리가 없으면 붙이거나 감춘다
    offer.hidden = false;
    /* 미리보기(휴대폰 아래 판이 덮은 곳 빼고) 안에서 고른 글자·조각·손잡이와 다른 글자 잉크를 덮지 않는 자리(freeOfferSpot) */
    var area = { x0: frame.left + preview.clientLeft, y0: frame.top + preview.clientTop, x1: frame.right - 4, y1: frame.bottom - preview.clientTop };
    var sheet = $("[data-studio-easy-edit]");
    var sheeted = Boolean(sheet && !sheet.hidden && window.getComputedStyle(sheet).position === "fixed");
    if (sheeted) {
      area.y1 = Math.min(area.y1, sheet.getBoundingClientRect().top);
    }
    var keep = [ink, headPieces(node)[piece.part]];
    if (!handles.hidden) {
      Array.prototype.forEach.call(handles.querySelectorAll("[data-studio-handle]"), function (handle) {
        var r = handle.getBoundingClientRect();
        if (r.width && r.height && window.getComputedStyle(handle).display !== "none") {
          keep.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
        }
      });
    }
    var spot = freeOfferSpot(offer, node, ink, area, keep);
    if (!spot) {
      /* 휴대폰 쉬운 모드에서 아래 판이 덮어 들 자리가 없으면 말풍선은 감추고 쉬운 판의 한 줄만 — 그 밖은 미리보기 바로 아래 칸에 붙인다 */
      if (sheeted) {
        offer.hidden = true;
      } else {
        dockOffer(offer, true);
      }
      offer.style.inlineSize = "";
      syncEasyPiece();
      return;
    }
    offer.style.inlineSize = spot.narrow ? spot.narrow + "px" : "";
    offer.style.left = (spot.x + ox) + "px";
    offer.style.top = (spot.y + oy) + "px";
    syncEasyPiece();
  }

  /* 쉬운 판에도 같은 제안 한 줄(휴대폰에서 아래 판이 미리보기를 덮어도 누를 곳이 있게) */
  var easyPieceLine = null;
  function syncEasyPiece() {
    var panel = $("[data-studio-easy-body]");
    if (!panel) {
      return;
    }
    if (!easyPieceLine) {
      easyPieceLine = document.createElement("p");
      easyPieceLine.className = "studio-easy-piece";
      easyPieceLine.dataset.studioEasyPiece = "";
      easyPieceLine.innerHTML = '<span data-studio-easy-piece-text></span> <button type="button" data-studio-piece-split>낱으로 나눠 고치기</button>';
      easyPieceLine.addEventListener("click", function (event) {
        if (event.target.closest("[data-studio-piece-split]")) {
          splitPiece();
        }
      });
      var sliders = panel.querySelector("[data-studio-easy-sliders]");
      panel.insertBefore(easyPieceLine, sliders || null);
    }
    var on = Boolean(pieceNode()) && editing();
    easyPieceLine.hidden = !on;
    if (on) {
      easyPieceLine.querySelector("[data-studio-easy-piece-text]").textContent = pieceText.textContent;
    }
  }

  /* '낱으로 나눠 고치기' → Promise<{ ok, refused, selection }> — 짓는 방식의 모음 나누기만 낱으로, 그 뒤 그 글자의 그 자모를 고른다 */
  function splitPiece() {
    var target = piece;
    var composition = window.FontStudio && window.FontStudio.composition;
    if (!target || !composition || typeof composition.set !== "function") {
      return Promise.resolve({ ok: false, refused: [makeRefusal("NO_TARGET", { action: "조각을 나눌" })], selection: null });
    }
    var now = composition.current();
    var spec = now && now.spec ? now.spec : {};
    var next = { vowel: "split", coda: spec.coda || host.dataset.fyCodaDepth || "", pieces: spec.pieces || "" };
    return composition.set(next, { label: "낱으로 나눠 고치기" }).then(function (result) {
      piece = null;
      delete root.dataset.piece;
      var glyph = glyphs()[target.glyph];
      var node = glyph && glyph.dataset.source === target.source
        ? jamoNodes(glyph).filter(function (entry) { return entry.getAttribute("data-jamo") === target.jamo; })[0] : null;
      if (node) {
        select(node);
      } else {
        restoreSelection();
      }
      return { ok: Boolean(result && result.ok) && Boolean(node), refused: result && result.refused ? result.refused : [],
        selection: node ? { source: target.source, jamo: target.jamo, pos: node.getAttribute("data-fy-pos") } : null };
    });
  }

  pieceLayer.addEventListener("pointerdown", function (event) {
    event.stopPropagation(); // 미리보기의 고르기·끌기로 가지 않게
  });
  pieceLayer.addEventListener("click", function (event) {
    if (event.target.closest("[data-studio-piece-split]")) {
      splitPiece();
    }
  });

  // ── 바뀔 곳 미리 보이기(2026-10-18 검토 D4) ─────────────────────────────
  /* 고른 범위(또는 마우스를 올린 범위)로 고치면 바뀔 미리보기 자모마다 잉크 상자에 점선 틀을 두고, 편집 대상 칸에 "미리보기 n곳"을
   * 보인다. 끄는 동안도 둔다. 셈은 편집 대상(규칙·선택자·변수) 그대로: 바탕 요소 규칙(자리·자리 가족)은 그 자리 변수가 닿는 자모 —
   * 더 가까운 자리 값이나 노드 규칙이 가리는 자모는 빼고 —, 노드 규칙은 그 선택자에 맞는 자모 중 그 규칙이 값을 정하는(또는 새로
   * 정할) 자모 */
  var affectedLayer = document.createElement("div");
  affectedLayer.className = "studio-affected-layer";
  affectedLayer.setAttribute("data-studio-affected-layer", "");
  affectedLayer.setAttribute("aria-hidden", "true");
  preview.insertBefore(affectedLayer, handles);
  var affected = { nodes: [], scope: null, hover: null, refused: false, total: null, totalState: "none" };

  function slotChainOf(pos) {
    var chain = [];
    for (var slot = pos, guard = 0; slot && guard < 16; guard += 1) {
      chain.push(slot);
      slot = Model.SLOT_CONTRACT[slot] ? Model.SLOT_CONTRACT[slot].parent : null;
    }
    return chain;
  }

  function nodesAffectedBy(plan, selected, resolvers) {
    if (!plan || refused(plan) || !plan.selector) {
      return [];
    }
    var resolverOf = function (node) {
      if (!resolvers.has(node)) {
        resolvers.set(node, resolverFor(node));
      }
      return resolvers.get(node);
    };
    var all = Array.prototype.slice.call(host.querySelectorAll('[part~="jamo"]'));
    var found;
    if (safeMatch(host, plan.selector)) {
      var match = /^--fy-([a-z0-9]+)-(.+)$/.exec(plan.variable || "");
      if (!match || !propertyDef(match[2])) {
        return [selected];
      }
      found = all.filter(function (node) {
        if (slotChainOf(node.getAttribute("data-fy-pos")).indexOf(match[1]) < 0) {
          return false;
        }
        var resolver = resolverOf(node);
        var chain = resolver.entry(match[2]).chain;
        var at = chain.indexOf(plan.variable);
        if (at < 0) {
          return false;
        }
        for (var index = 0; index < at; index += 1) {
          if (resolver.lookup(chain[index])) {
            return false; // 더 가까운 자리 값이 있다
          }
        }
        return !resolver.overrideBelowHost(plan.variable);
      });
    } else {
      found = all.filter(function (node) {
        if (!safeMatch(node, plan.selector)) {
          return false;
        }
        var winner = resolverOf(node).lookupAt(node, plan.variable);
        return !winner || (plan.rule && winner.rule === plan.rule);
      });
    }
    if (found.indexOf(selected) < 0) {
      found.push(selected);
    }
    return found;
  }

  /* 노드·범위(없으면 지금 범위)로 고치면 바뀔 자모들 — { nodes, refused } */
  function affectedNodes(node, scope) {
    var plans;
    if (stamped(node)) {
      var range = !scope ? shapeRange(node) : scope === "glyph" ? "glyph" : scope === "case" && layoutModel() === "fixed-three" ? "case" : "principle";
      var info = shapeInfo(node);
      plans = GESTURE.map(function (property) { return Model.shapeTarget(doc, state.fontId, info, property, range); });
    } else {
      var group = gesturePlans(node, null, scope);
      plans = GESTURE.map(function (property) { return group.plans[property]; });
    }
    var live = plans.filter(function (plan) { return plan && !refused(plan); });
    if (!live.length) {
      return { nodes: [], refused: plans.some(Boolean), plans: [] };
    }
    var resolvers = new Map();
    var seen = {};
    var nodes = [];
    live.forEach(function (plan) {
      var key = plan.selector + "\n" + plan.variable;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      nodesAffectedBy(plan, node, resolvers).forEach(function (entry) {
        if (nodes.indexOf(entry) < 0) {
          nodes.push(entry);
        }
      });
    });
    return { nodes: nodes, refused: false, plans: live };
  }

  // ── 현대 한글 몇 자(S4 '바뀔 곳 미리 보이기') ─────────────────────────────
  /* 미리보기 n곳 옆에 "현대 한글 n자" — 편집 대상 규칙이 11,172자 중 몇 음절에 닿는지. 셈은 지연 싣는 모듈(font-studio-reach.js)이
   * 화면 밖 뼈대로 한다. 처음 한 번은 뼈대를 나눠 짓느라 늦고(그동안 '세는 중'), 그 뒤는 곧바로. 미리보기 수는 먼저 보인다 */
  var reachSeq = 0;

  function reachModule() {
    var studio = window.FontStudio;
    return studio && studio.reach ? studio.reach : null;
  }

  function loadReach() {
    var studio = window.FontStudio;
    if (reachModule()) {
      return Promise.resolve(reachModule());
    }
    if (!studio || typeof studio.need !== "function") {
      return Promise.resolve(null);
    }
    return studio.need("reach").then(function (module) {
      if (module && typeof module.setSlotChain === "function") {
        module.setSlotChain(slotChainOf);
      }
      return module;
    }, function () { return null; });
  }

  /* 지금 affected의 계획으로 셈을 청한다 — 끝나면 줄을 다시 쓴다(그사이 범위·선택이 바뀌었으면 버린다).
   * 뼈대가 있으면 곧바로 센다(셈 하나 약 4ms). 다만 같은 자모·범위를 다시 세는 것(값 고침 뒤 렌더)은 바뀐 미리보기를 먼저 그리게
   * 다음 프레임 뒤에 세고, 그동안 앞 수를 그대로 보인다('세는 중'이 깜박이지 않게 — PLAN-STUDIO-002 S6 성능). 셈이 남아 있는
   * 동안 idle()은 바쁘다(settled()가 기다린다) */
  var reachPending = 0;
  var reachShown = { key: null, total: null };

  function afterPaint(fn) {
    var done = false;
    function run() {
      if (!done) {
        done = true;
        fn();
      }
    }
    requestAnimationFrame(function () { setTimeout(run, 0); });
    setTimeout(run, 50); // 프레임이 멈춘 창(감춰진 iframe 등)에서도 끝나게
  }

  function requestReach(plans) {
    var seq = reachSeq += 1;
    var key = affected.scope ? selectionKey() + "|" + affected.scope + "|" + (affected.hover || "") : null;
    var keep = key !== null && key === reachShown.key && reachShown.total !== null;
    affected.total = keep ? reachShown.total : null;
    affected.totalState = !plans.length ? "none" : keep ? "ready" : "counting";
    reachPending = 0;
    if (!plans.length) {
      return;
    }
    var module = reachModule();
    if (module && typeof module.countNow === "function" && !keep) {
      var now = module.countNow(plans, host, { doc: doc });
      if (now) {
        affected.total = now.total;
        affected.totalState = "ready";
        reachShown = { key: key, total: now.total };
        return;
      }
    } else if (module && typeof module.countNow === "function") {
      reachPending = seq;
      afterPaint(function () {
        if (seq !== reachSeq) {
          return; // 그사이 새 셈을 청했다(그것이 reachPending을 맡는다)
        }
        var counted = module.countNow(plans, host, { doc: doc });
        reachPending = 0;
        if (counted) {
          affected.total = counted.total;
          affected.totalState = "ready";
          reachShown = { key: key, total: counted.total };
          paintAffectedLines();
          return;
        }
        countLater(seq, plans, key);
      });
      return;
    }
    countLater(seq, plans, key);
  }

  function countLater(seq, plans, key) {
    if (!(affected.totalState === "counting")) {
      affected.totalState = "counting";
      affected.total = null;
      paintAffectedLines();
    }
    loadReach().then(function (loaded) {
      return loaded ? loaded.count(plans, host, { doc: doc }) : null;
    }).then(function (result) {
      if (seq !== reachSeq) {
        return;
      }
      affected.total = result ? result.total : null;
      affected.totalState = result && result.total !== null ? "ready" : "none";
      reachShown = { key: key, total: affected.total };
      paintAffectedLines();
    }, function () {
      if (seq === reachSeq) {
        affected.totalState = "none";
        paintAffectedLines();
      }
    });
  }

  /* 고른 자모·범위(없으면 지금 범위)의 편집이 닿는 현대 한글 수 → Promise<number|null>(자동화 계약 reach.total) */
  function reachTotal(node, scope) {
    if (!node || !doc) {
      return Promise.resolve(null);
    }
    var result = affectedNodes(node, scope || null);
    if (!result.plans || !result.plans.length) {
      return Promise.resolve(result.refused ? 0 : null);
    }
    var plans = result.plans;
    return loadReach().then(function (module) {
      return module ? module.count(plans, host, { doc: doc }) : null;
    }).then(function (counted) {
      return counted ? counted.total : null;
    }, function () { return null; });
  }

  function totalText() {
    if (affected.totalState === "ready" && affected.total !== null) {
      return "현대 한글 " + affected.total.toLocaleString("ko-KR") + "자";
    }
    return affected.totalState === "counting" ? "현대 한글 세는 중…" : "";
  }

  function affectedText() {
    var scope = SCOPE_NAMES[affected.scope] || affected.scope || "";
    if (affected.refused) {
      return "'" + scope + "' 범위로는 이 자모를 고칠 수 없습니다 — 바뀌는 곳 없음";
    }
    var total = totalText();
    return "미리보기 " + affected.nodes.length + "곳" + (total ? " · " + total : "") +
      (scope ? " · " + (affected.hover ? "올려 본 범위 '" + scope + "'" : "범위 '" + scope + "'") : "");
  }

  function paintAffectedLines() {
    var line = $("[data-studio-affected-count]");
    if (line) {
      line.textContent = affected.scope ? affectedText() : "";
      line.dataset.hover = affected.hover ? "true" : "false";
      line.dataset.total = affected.totalState === "ready" && affected.total !== null ? String(affected.total) : "";
    }
    var easyLine = $("[data-studio-easy-count]");
    if (easyLine) {
      easyLine.textContent = affected.scope ? easyAffectedText() : "";
      easyLine.dataset.hover = affected.hover ? "true" : "false";
      easyLine.dataset.total = affected.totalState === "ready" && affected.total !== null ? String(affected.total) : "";
    }
    root.dataset.affectedTotal = affected.totalState === "ready" && affected.total !== null ? String(affected.total) : "";
  }

  function appendAffectedCount(panel) {
    var line = document.createElement("p");
    line.className = "studio-affected-count";
    line.dataset.studioAffectedCount = "";
    panel.appendChild(line);
    showAffected(null);
  }

  /* hoverScope: 마우스를 올린 범위(null이면 고른 범위) */
  function showAffected(hoverScope) {
    var node = selectedNode();
    var plans = [];
    if (!node || !editing() || !doc) {
      affected = { nodes: [], scope: null, hover: null, refused: false, total: null, totalState: "none" };
    } else {
      var scope = hoverScope || (stamped(node) ? shapeRange(node) : currentScope(node));
      var result = affectedNodes(node, hoverScope || null);
      affected = { nodes: result.nodes, scope: scope, hover: hoverScope || null, refused: result.refused, total: null, totalState: "none" };
      plans = result.plans || [];
    }
    Array.prototype.forEach.call(host.querySelectorAll(".studio-affected"), function (entry) {
      if (affected.nodes.indexOf(entry) < 0) {
        entry.classList.remove("studio-affected");
      }
    });
    affected.nodes.forEach(function (entry) { entry.classList.add("studio-affected"); });
    root.dataset.affected = String(affected.nodes.length);
    requestReach(affected.scope ? plans : []);
    paintAffectedLines();
    positionAffected();
  }

  function positionAffected() {
    var boxes = affectedLayer.children;
    var nodes = affected.nodes.filter(function (node) { return node.isConnected; });
    while (boxes.length > nodes.length) {
      affectedLayer.removeChild(affectedLayer.lastChild);
    }
    while (boxes.length < nodes.length) {
      var box = document.createElement("span");
      box.className = "studio-affected-box";
      affectedLayer.appendChild(box);
    }
    affectedLayer.hidden = !nodes.length;
    if (!nodes.length) {
      return;
    }
    var frame = preview.getBoundingClientRect();
    nodes.forEach(function (node, index) {
      var ink = selectionBox(node);
      var style = boxes[index].style;
      style.left = (ink.x0 - frame.left - preview.clientLeft + preview.scrollLeft) + "px";
      style.top = (ink.y0 - frame.top - preview.clientTop + preview.scrollTop) + "px";
      style.width = Math.max(1, ink.x1 - ink.x0) + "px";
      style.height = Math.max(1, ink.y1 - ink.y0) + "px";
    });
  }

  /* 범위 단추에 마우스를 올리면 그 범위로 바뀔 곳을 미리 — 내리면 고른 범위로 */
  var scopeField = $("[data-studio-scope]");
  scopeField.addEventListener("pointerover", function (event) {
    var label = event.target.closest ? event.target.closest("label") : null;
    var radio = label ? label.querySelector('input[name="scope"]') : null;
    if (radio && !radio.disabled && editing() && selectedNode()) {
      var node = selectedNode();
      var current = stamped(node) ? shapeRange(node) : currentScope(node);
      var want = radio.value === current ? null : radio.value;
      if (want !== affected.hover) {
        showAffected(want);
      }
    }
  });
  scopeField.addEventListener("pointerleave", function () {
    if (affected.hover) {
      showAffected(null);
    }
  });

  /* 손잡이 틀이 감쌀 상자(화면 좌표) — 잉크 상자. 그림(SVG)은 도형 상자, 기기 글꼴 맞춤은 ::before 글자를 그 변환대로 잰다 */
  function selectionBox(node) {
    var mapped = mappedInkBox(node);
    if (mapped) { return mapped; }
    var svg = node.querySelector("svg");
    if (svg) {
      var union = null;
      Array.prototype.forEach.call(svg.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect"), function (shape) {
        var part = shape.getBoundingClientRect();
        if (part.width || part.height) {
          union = union ? { x0: Math.min(union.x0, part.left), x1: Math.max(union.x1, part.right), y0: Math.min(union.y0, part.top), y1: Math.max(union.y1, part.bottom) }
            : { x0: part.left, x1: part.right, y0: part.top, y1: part.bottom };
        }
      });
      if (union) {
        return union;
      }
    }
    if (host.getAttribute("data-fy-face") === "device" && !node.querySelector('[part="element"]') && !node.hasAttribute("data-fy-leaves")) {
      var paint = getComputedStyle(node, "::before");
      var text = unquoteContent(paint.content);
      if (text) {
        measureContext.font = paint.fontWeight + " " + paint.fontSize + " " + paint.fontFamily;
        var metrics = measureContext.measureText(text);
        var baseline = textBaseline(paint, metrics);
        var stroke = (parseFloat(paint.webkitTextStrokeWidth) || 0) / 2;
        var matrix = paint.transform && paint.transform !== "none" ? new DOMMatrix(paint.transform) : new DOMMatrix();
        var rect = node.getBoundingClientRect();
        var sx = rect.width / (node.offsetWidth || 1);
        var sy = rect.height / (node.offsetHeight || 1);
        var xs = [];
        var ys = [];
        [[-metrics.actualBoundingBoxLeft - stroke, baseline - metrics.actualBoundingBoxAscent - stroke],
          [metrics.actualBoundingBoxRight + stroke, baseline + metrics.actualBoundingBoxDescent + stroke]].forEach(function (a) {
          [[a[0], baseline - metrics.actualBoundingBoxAscent - stroke], [a[0], baseline + metrics.actualBoundingBoxDescent + stroke]].forEach(function (corner) {
            var q = matrix.transformPoint(new DOMPoint(corner[0], corner[1]));
            xs.push(rect.left + q.x * sx);
            ys.push(rect.top + q.y * sy);
          });
        });
        return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
      }
    }
    return inkBox(node);
  }

  function positionHandles() {
    if (!handles) {
      return;
    }
    var node = selectedNode();
    if (affectedLayer) {
      positionAffected();
    }
    if (!node || !node.isConnected) {
      handles.hidden = true;
      positionPiece();
      return;
    }
    var box = selectionBox(node);
    var frame = preview.getBoundingClientRect();
    handles.hidden = false;
    handles.style.left = (box.x0 - frame.left - preview.clientLeft + preview.scrollLeft) + "px";
    handles.style.top = (box.y0 - frame.top - preview.clientTop + preview.scrollTop) + "px";
    handles.style.width = Math.max(1, box.x1 - box.x0) + "px";
    handles.style.height = Math.max(1, box.y1 - box.y0) + "px";
    /* 위 칸이 모자라면(첫 줄) 회전 손잡이를 틀 아래로 — 미리보기 가장자리에 잘리지 않게 */
    delete handles.dataset.flip;
    var knob = handles.querySelector('[data-studio-handle="rotate"]').getBoundingClientRect();
    if (knob.height && knob.top < frame.top + preview.clientTop) {
      handles.dataset.flip = "down";
    }
    positionPiece(); // 손잡이 자리(뒤집힘 포함)가 정해진 뒤 — 말풍선이 손잡이를 피한다
  }

  /* 손잡이는 그 값을 고칠 수 있을 때만 보인다(범위마다 planOf) */
  function updateHandles(node) {
    if (!handles) {
      return;
    }
    if (piece && !pieceNode()) {
      clearPiece(); // 다른 자모를 골랐다
    }
    if (!node) {
      handles.hidden = true;
      return;
    }
    /* 받지 않는 대상(한 손짓 = 한 대상으로 막힘 포함)의 손잡이는 감추고 까닭을 틀의 설명에 둔다(편집 대상 칸에도 보인다).
     * 이 범위에 그 속성을 적을 곳이 아예 없어도(대상 없음) 감추고 까닭을 둔다 — 말없이 사라지지 않게(S4 '한 손짓 한 대상') */
    var reasons = [];
    ["size", "rotate"].forEach(function (property) {
      var plan = planOf(node, property);
      handles.dataset[property] = plan && !refused(plan) ? "on" : "off";
      if (refused(plan)) {
        reasons.push(propertyName(property) + ": " + refusalText(plan));
      } else if (!plan) {
        reasons.push(propertyName(property) + ": 이 범위에는 " + propertyName(property) + "을(를) 적을 곳이 없습니다");
      }
    });
    if (reasons.length) {
      handles.dataset.reason = reasons.join(" / ");
      handles.title = "감춘 손잡이 — " + reasons.join(" / ");
    } else {
      delete handles.dataset.reason;
      handles.removeAttribute("title");
    }
    positionHandles();
  }

  preview.addEventListener("scroll", positionHandles);
  hooks.page.push(function () {
    if ((inspectorStale.easy && inspectorShown("easy")) || (inspectorStale.precise && inspectorShown("precise"))) {
      renderInspector(selectedNode()); // 밀어 둔 살펴보기 판이 이제 보인다(바뀔 곳도 함께 다시 센다)
    } else {
      showAffected(null);
    }
    requestAnimationFrame(positionHandles);
  });
  window.addEventListener("resize", positionHandles);

  /* 값 셈: 크기는 수(단위 그대로)에 배수, 회전은 deg 더하기. 빈 값은 그 변수의 중립값(보정 크기 1, 회전 0deg) */
  function scaledValue(plan, factor) {
    var value = planValue(plan);
    if (value === "" && /^--fy-(jamo|case|ctx|syl)-(size|scale-x|scale-y)$/.test(plan.variable)) { // 보정 수준 넷(ADR-035)의 배수 중립값
      value = "1";
    }
    var match = /^\s*(-?\d*\.?\d+)([a-z%]*)\s*$/i.exec(value);
    if (!match) {
      return null;
    }
    return String(Math.round(parseFloat(match[1]) * factor * 10000) / 10000) + match[2];
  }

  function rotatedValue(plan, degrees) {
    var value = planValue(plan).trim() || "0deg";
    var match = /^(-?\d*\.?\d+)(deg)?$/.exec(value);
    if (!match) {
      return null;
    }
    return String(Math.round((parseFloat(match[1]) + degrees) * 10) / 10) + "deg";
  }

  var PROPERTIES = { move: ["left", "top"], size: ["size"], rotate: ["rotate"] };

  /* 끌기를 시작할 때 한 번: 고칠 대상과 시작 값. 못 고치면 까닭 */
  function dragTargets(node, mode) {
    var targets = [];
    for (var index = 0; index < PROPERTIES[mode].length; index += 1) {
      var property = PROPERTIES[mode][index];
      var plan = planOf(node, property);
      if (!plan) {
        var none = makeRefusal("NO_TARGET", { action: mode === "move" ? "위치를 옮길" : mode === "size" ? "크기를 고칠" : "회전을 고칠" });
        return { error: refusalLine(none), refusal: none };
      }
      if (refused(plan)) {
        var why = refusal(plan);
        return { error: why.text, detail: why.detail };
      }
      targets.push({ property: property, plan: plan, start: planValue(plan) });
    }
    return { targets: targets };
  }

  /* 포인터 자리 → 대상마다 값. 셈할 수 없으면 null */
  function dragValues(state0, event) {
    var dx = event.clientX - state0.x0;
    var dy = event.clientY - state0.y0;
    var values = [];
    if (state0.mode === "move") {
      var left = Model.offsetAdd(state0.targets[0].start, dx * state0.gain.x / state0.width * 100, "%");
      var top = Model.offsetAdd(state0.targets[1].start, dy * state0.gain.y / state0.height * 100, "%");
      if (left === null || top === null) {
        return null;
      }
      return [dx ? left : state0.targets[0].start, dy ? top : state0.targets[1].start];
    }
    if (state0.mode === "size") {
      var a = state0.anchor;
      var before = Math.hypot(state0.x0 - a.x, state0.y0 - a.y) || 1;
      var factor = Math.max(0.1, Math.hypot(event.clientX - a.x, event.clientY - a.y) / before);
      factor = Math.round(factor * 100) / 100;
      values.push(scaledValue(state0.targets[0].plan, factor));
    } else {
      var turn = rotationTurn(state0, event);
      state0.turn = turn;
      values.push(rotatedValue(state0.targets[0].plan, turn));
    }
    if (state0.mode === "size") {
      state0.factor = factor;
    }
    return values[0] === null ? null : values;
  }

  /* 회전 손잡이(S4 '손잡이'): 돌리는 축을 잡은 점에서 ROTATE_RADIUS px 이상 떨어뜨려 감도를 줄인다 — 작은 글자는 손잡이가 중심에 가까워
   * 같은 끌기가 −22°·33.5°·42.5°로 튀었다(검토 2026-10-18 §3). 각도는 5°씩, Shift는 15°씩 맞춘다(돌린 양을 — 시작 값에서) */
  var ROTATE_RADIUS = 80;
  var ROTATE_STEP = 5;
  var ROTATE_SHIFT_STEP = 15;

  function rotationPivot(center, x, y) {
    var vx = x - center.x;
    var vy = y - center.y;
    var length = Math.hypot(vx, vy);
    if (length >= ROTATE_RADIUS) {
      return { x: center.x, y: center.y };
    }
    if (length < 0.5) {
      vx = 0;
      vy = -1;
      length = 1;
    }
    return { x: x - vx / length * ROTATE_RADIUS, y: y - vy / length * ROTATE_RADIUS };
  }

  function rotationTurn(state0, event) {
    var c = state0.pivot || state0.center;
    var turn = (Math.atan2(event.clientY - c.y, event.clientX - c.x) - Math.atan2(state0.y0 - c.y, state0.x0 - c.x)) * 180 / Math.PI;
    turn = ((turn + 540) % 360) - 180;
    var step = event.shiftKey ? ROTATE_SHIFT_STEP : ROTATE_STEP;
    turn = Math.round(turn / step) * step;
    return Object.is(turn, -0) ? 0 : turn;
  }

  /* 끄는 동안의 말풍선 — 회전은 돌린 양과 그 뒤 보일 각도, 크기는 배수, 옮기기는 글자 칸 % */
  function signed(value, digits) {
    var rounded = Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits);
    return (rounded > 0 ? "+" : rounded < 0 ? "−" : "±") + Math.abs(rounded);
  }

  function plainSigned(value) {
    return value < 0 ? "−" + Math.abs(value) : String(value);
  }

  function dragTipText(current) {
    if (current.mode === "rotate") {
      var turn = current.turn || 0;
      var shown = current.startAngle === null || current.startAngle === undefined ? null : Math.round((current.startAngle + turn) * 10) / 10;
      return "회전 " + signed(turn, 1) + "°" + (shown === null ? "" : " → " + plainSigned(shown) + "°") +
        (current.last && current.last.shiftKey ? " (15°씩)" : " (5°씩 · Shift 15°)");
    }
    if (current.mode === "size") {
      var factor = current.factor || 1;
      return "크기 ×" + (Math.round(factor * 100) / 100).toFixed(2) +
        (current.startSize ? " → " + (Math.round(current.startSize * factor * 1000) / 1000) + "배" : "");
    }
    var dx = current.last ? (current.last.clientX - current.x0) * current.gain.x / current.width * 100 : 0;
    var dy = current.last ? (current.last.clientY - current.y0) * current.gain.y / current.height * 100 : 0;
    return "가로 " + signed(dx, 1) + "% · 세로 " + signed(dy, 1) + "%";
  }

  function showDragTip(current) {
    if (!handleTip) {
      return;
    }
    if (!current || !current.moved || current.failed) {
      handleTip.hidden = true;
      handleTip.textContent = "";
      delete handles.dataset.tip;
      return;
    }
    handleTip.textContent = dragTipText(current);
    handleTip.hidden = false;
    handles.dataset.tip = current.mode;
  }

  /* 자모가 포인터를 그대로 따라오게 — 위치 %가 글자 칸 상자가 아닌 다른 상자(글자 몸통 등)를 기준으로 풀리는 글꼴이 있어,
   * 처음 8px 넘게 움직였을 때 실제 움직임과 포인터 움직임의 비로 축마다 한 번 맞춘다. 맞췄으면 true */
  function followPointer(current) {
    var rect = current.node.getBoundingClientRect();
    var changed = false;
    [["x", "left", "clientX", "x0"], ["y", "top", "clientY", "y0"]].forEach(function (axis) {
      var wanted = current.last[axis[2]] - current[axis[3]];
      var actual = rect[axis[1]] - current.rect0[axis[1]];
      if (!current.tuned[axis[0]] && Math.abs(wanted) >= 8 && Math.abs(actual) >= 8) {
        current.gain[axis[0]] *= wanted / actual;
        current.tuned[axis[0]] = true;
        changed = true;
      }
    });
    if (changed) {
      var values = dragValues(current, current.last);
      if (values) {
        current.values = values;
      }
    }
    return changed;
  }

  function writeDragSheet(targets, values) {
    var text = targets.map(function (target, index) {
      var rule = target.plan.selector + " { " + target.plan.variable + ": " + values[index] + "; }";
      return target.plan.layer ? "@layer " + target.plan.layer + " { " + rule + " }" : rule;
    }).join("\n");
    try {
      dragSheet.replaceSync(text);
    } catch (error) {
      dragSheet.replaceSync("");
    }
  }

  var drag = null;
  var tap = null;
  var lastPress = null;
  var dragFrame = 0;

  function startDrag(event, node, mode, extra) {
    var glyph = node.closest('[part="glyph"]').getBoundingClientRect();
    drag = { id: event.pointerId, mode: mode, node: node, x0: event.clientX, y0: event.clientY, width: glyph.width, height: glyph.height,
      moved: false, failed: false, targets: null, values: null, rect0: node.getBoundingClientRect(), gain: { x: 1, y: 1 }, tuned: {} };
    Object.keys(extra || {}).forEach(function (key) { drag[key] = extra[key]; });
    if (mode !== "move") {
      var box = selectionBox(node);
      drag.anchor = { x: box.x0, y: box.y0 };
      drag.center = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      drag.pivot = rotationPivot(drag.center, event.clientX, event.clientY);
      drag.startAngle = mode === "rotate" ? easyVisible(node, "rotate") : null;
      drag.startSize = mode === "size" ? easyVisible(node, "size") : null;
    }
    try {
      preview.setPointerCapture(event.pointerId);
    } catch (error) {
      /* 이미 뗀 포인터 */
    }
    event.preventDefault();
  }

  function cancelDrag() {
    if (!drag) {
      return;
    }
    drag = null;
    cancelAnimationFrame(dragFrame);
    dragSheet.replaceSync("");
    showDragTip(null);
    positionHandles();
  }

  /* 뗄 때 한 번 적는다 — 왼쪽·위는 앞 편집이 새 규칙을 만들었을 수 있어 다음 대상을 고친 글에서 다시 정한다(nudge와 같다) */
  function commitDrag(finished) {
    var text = state.css;
    var workDoc = doc;
    var applied = [];
    for (var index = 0; index < finished.targets.length; index += 1) {
      var target = finished.targets[index];
      var value = finished.values[index];
      if (value === target.start) {
        continue;
      }
      var plan = index === 0 ? target.plan : planOf(finished.node, target.property, workDoc);
      if (!plan || refused(plan)) {
        break;
      }
      try {
        text = Model.applyTarget(text, plan, value);
      } catch (error) {
        message("편집하지 못했습니다.", "error", error.message);
        dragSheet.replaceSync("");
        return false;
      }
      workDoc = Model.parse(text);
      if (!plan.property) {
        plan.property = target.property;
      }
      applied.push({ plan: plan, value: value });
    }
    if (!applied.length) {
      dragSheet.replaceSync("");
      positionHandles();
      return false;
    }
    var note = editNote(applied);
    var done = commit(text, note.text, undefined, note.detail);
    dragSheet.replaceSync("");
    if (done) {
      verifyEdits(applied);
    }
    positionHandles();
    return done;
  }

  function nextPick(pick, from) {
    var index = pick.nodes.indexOf(from);
    return pick.nodes[(index + 1) % pick.nodes.length];
  }

  preview.addEventListener("pointerdown", function (event) {
    if (event.button) {
      return;
    }
    var handle = event.target && event.target.closest ? event.target.closest("[data-studio-handle]") : null;
    if (handle && selectedNode() && editing()) {
      preview.focus({ preventScroll: true });
      startDrag(event, selectedNode(), handle.getAttribute("data-studio-handle"));
      return;
    }
    var pick = pickAt(event.clientX, event.clientY);
    if (!pick.nodes.length) {
      return;
    }
    var selected = selectedNode();
    var rank = selected ? pick.nodes.indexOf(selected) : -1;
    var target = rank >= 0 && rank < pick.tiers.box ? selected : pick.nodes[0];
    if (event.altKey && selected && rank >= 0 && pick.nodes.length > 1) {
      target = nextPick(pick, selected);
    }
    var same = lastPress && Math.abs(lastPress.x - event.clientX) <= 4 && Math.abs(lastPress.y - event.clientY) <= 4;
    if (event.pointerType === "touch" && target !== selected) {
      tap = { id: event.pointerId, x: event.clientX, y: event.clientY, node: target, pick: pick, same: same };
      return;
    }
    if (!editing()) {
      /* 디자인·자소판 페이지: 누르면 고르기만(같은 점을 다시 누르면 그 아래 자모) — 끌어 고치기는 고치기 페이지 */
      select(same && selected && rank >= 0 ? nextPick(pick, selected) : target);
      lastPress = { x: event.clientX, y: event.clientY };
      return;
    }
    preview.focus({ preventScroll: true });
    var cycle = target === selected && same && !event.altKey;
    if (target !== selected) {
      select(target);
    }
    startDrag(event, target, "move", { pick: pick, cycle: cycle });
  });

  preview.addEventListener("pointermove", function (event) {
    if (!drag || event.pointerId !== drag.id || drag.failed) {
      return;
    }
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.x0) < 3 && Math.abs(event.clientY - drag.y0) < 3) {
        return;
      }
      var planned = dragTargets(drag.node, drag.mode);
      if (planned.error) {
        drag.failed = true;
        message(planned.error, "warn", planned.detail);
        root.dataset.editEffect = "refused";
        return;
      }
      drag.targets = planned.targets;
      drag.moved = true;
      root.dataset.dragging = drag.mode;
    }
    var values = dragValues(drag, event);
    if (!values) {
      drag.failed = true;
      message(propertyName(drag.targets[0].property) + " 값은 끌어서 셈할 수 없습니다. 값 칸에서 직접 고치세요.", "warn",
        drag.targets[0].plan.variable + " = " + drag.targets[0].start);
      root.dataset.editEffect = "refused";
      dragSheet.replaceSync("");
      showDragTip(null);
      return;
    }
    drag.values = values;
    drag.last = { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey };
    if (!dragFrame) {
      dragFrame = requestAnimationFrame(function () {
        dragFrame = 0;
        if (drag && drag.values) {
          writeDragSheet(drag.targets, drag.values);
          if (drag.mode === "move" && followPointer(drag)) {
            writeDragSheet(drag.targets, drag.values);
          }
          positionHandles();
          showDragTip(drag);
        }
      });
    }
  });

  /* 끌기 한 번(누름→뗌)은 되돌리기 한 단계다. 움직이지 않고 뗀 같은 점 누르기는 그 점 아래 다음 자모로 */
  preview.addEventListener("pointerup", function (event) {
    if (tap && event.pointerId === tap.id) {
      var pressed = tap;
      tap = null;
      var selected = selectedNode();
      select(pressed.same && selected && pressed.pick.nodes.indexOf(selected) >= 0 ? nextPick(pressed.pick, selected) : pressed.node);
      lastPress = { x: event.clientX, y: event.clientY };
      return;
    }
    if (!drag || event.pointerId !== drag.id) {
      return;
    }
    var finished = drag;
    drag = null;
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    delete root.dataset.dragging;
    showDragTip(null);
    if (finished.moved && !finished.failed && finished.values) {
      commitDrag(finished);
      lastPress = null;
      return;
    }
    dragSheet.replaceSync("");
    if (finished.mode === "move" && !finished.moved && !finished.failed && finished.cycle) {
      /* 머리 음절의 같은 점을 다시 누르면 먼저 그 안 조각(S4), 그다음 누르기는 그 점 아래 다음 자모 */
      if (headNode(finished.node) && !pieceNode()) {
        choosePiece(finished.node, event.clientX, event.clientY);
      } else if (finished.pick.nodes.length > 1) {
        clearPiece();
        select(nextPick(finished.pick, finished.node));
      } else {
        clearPiece();
      }
    }
    lastPress = finished.mode === "move" ? { x: event.clientX, y: event.clientY } : lastPress;
  });

  preview.addEventListener("pointercancel", function (event) {
    if (tap && event.pointerId === tap.id) {
      tap = null; // 손가락이 쪽을 넘겼다
    }
    if (drag && event.pointerId === drag.id) {
      delete root.dataset.dragging;
      cancelDrag();
    }
  });
  preview.addEventListener("lostpointercapture", function (event) {
    if (drag && event.pointerId === drag.id) {
      delete root.dataset.dragging;
      cancelDrag();
    }
  });

  /* 크기·회전 키(+ − [ ]) — 값 칸과 같은 길(applyInput) */
  function stepProperty(property, amount) {
    return stepResult(property, amount).ok;
  }

  /* 크기(배수)·회전(도 더하기) 한 걸음 — 키 + − [ ]와 api.edit의 scale·rotate가 같은 길이다. 결과는 applyInput과 같은 꼴 */
  function stepResult(property, amount) {
    var node = selectedNode();
    if (!node) {
      return refusedResult(makeRefusal("NO_SELECTION"));
    }
    clearMessage();
    var plan = planOf(node, property);
    if (!plan) {
      return refusedResult(refuse("NO_TARGET", { action: property === "size" ? "크기를 고칠" : "회전을 고칠" }));
    }
    if (refused(plan)) {
      return refusedResult(showRefusal(refusal(plan).refusal));
    }
    var value = property === "size" ? scaledValue(plan, amount) : rotatedValue(plan, amount);
    if (value === null) {
      return refusedResult(refuse("VALUE_INVALID", { kind: "step", name: propertyName(property), detail: plan.variable + " = " + planValue(plan) }));
    }
    return applyInput(property, value);
  }

  document.addEventListener("keydown", function (event) {
    if (!state.selection || !editing() || event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT" || tag === "INPUT" || (target && target.isContentEditable)) {
      return; // 입력 칸과 라디오(키보드 이동)는 방향키를 그대로 쓴다
    }
    var step = event.shiftKey ? 1 : 0.1;
    var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      nudge(moves[event.key][0], moves[event.key][1]);
      event.preventDefault();
      return;
    }
    var steps = { "+": ["size", 1.05], "=": ["size", 1.05], "-": ["size", 1 / 1.05], "_": ["size", 1 / 1.05],
      "[": ["rotate", -1], "]": ["rotate", 1], "{": ["rotate", -15], "}": ["rotate", 15] };
    if (steps[event.key]) {
      stepProperty(steps[event.key][0], steps[event.key][1]);
      event.preventDefault();
    }
  });

  /* 포인터로 범위를 고르면 초점을 미리보기로 돌려, 다음 방향키가 자소를 옮긴다
   * (키보드로 라디오를 오갈 때는 그대로 둔다). */
  var scopePointer = false;
  root.addEventListener("pointerdown", function (event) {
    scopePointer = Boolean(event.target.closest("[data-studio-scope], [data-studio-target]"));
  });
  root.addEventListener("pointerup", function () {
    setTimeout(function () { scopePointer = false; }, 0); // 라벨이 넘겨준 click까지 같은 작업 안에서 끝난다
  });
  root.addEventListener("click", function (event) {
    var target = event.target;
    if (scopePointer && state.selection && target.tagName === "INPUT" && (target.name === "scope" || target.name === "shared")) {
      preview.focus({ preventScroll: true });
    }
  });

  root.addEventListener("change", function (event) {
    if (event.target.name === "scope") {
      state.scope = event.target.value; // 고정 모양의 원칙 범위·이 짜임·이 글자만도 같은 칸(planFor·shapeRange가 노드에 맞게 읽는다)
      state.scopeChosen = true;
      state.escalate = null;
      restoreSelection();
    } else if (event.target.name === "shared") {
      state.shared = event.target.value === "split" ? "split" : "edit";
      restoreSelection();
    }
  });

  root.addEventListener("click", function (event) {
    var target = event.target;
    if (target.closest("[data-studio-escalate]")) {
      state.escalate = selectionKey();
      restoreSelection();
      preview.focus({ preventScroll: true });
    } else if (target.closest("[data-studio-deescalate]")) {
      state.escalate = null;
      restoreSelection();
      preview.focus({ preventScroll: true });
    } else if (target.closest("[data-studio-ladder-scope]")) {
      chooseScope(target.closest("[data-studio-ladder-scope]").dataset.studioLadderScope);
      preview.focus({ preventScroll: true });
    } else if (target.closest("[data-studio-restore-draft]")) {
      var index = Number(target.closest("[data-studio-restore-draft]").dataset.studioRestoreDraft);
      guardLoad("초안", function () { restoreDraft(index); });
    } else if (target.closest("[data-studio-discard-draft]")) {
      discardDrafts();
    } else if (target.closest("[data-studio-design-off]")) {
      confirmShapeChange("off");
    } else if (target.closest("[data-studio-design-square]")) {
      confirmShapeChange("square");
    } else if (target.closest("[data-studio-unsaved-choice]")) {
      resolveUnsaved(target.closest("[data-studio-unsaved-choice]").dataset.studioUnsavedChoice);
    } else if (target.closest("[data-studio-export-notice-project]")) {
      saveProjectFile();
      hideExportNotice();
    } else if (target.closest("[data-studio-export-notice-close]")) {
      hideExportNotice();
    } else if (target.closest("[data-studio-copy-fallback-close]")) {
      $("[data-studio-copy-fallback]").hidden = true;
    }
  });

  /* 글꼴 모양을 통째로 바꾸기 — 디자인 페이지의 확인 단추와 자동화가 부른다(⚑9 S3). 확인 갈고리를 작업실 안에서 한 번 눌러
   * 화면 단추와 같은 두 처리기(아래 confirmShapeChange, 디자인 패널의 바꾸기)를 탄다. kind "off"(디자인 끄기)·"square"(네모꼴로) */
  function shapeChange(kind) {
    if (kind !== "off" && kind !== "square") {
      throw new TypeError("FontStudio.shapeChange: kind must be \"off\" or \"square\"");
    }
    var hook = document.createElement("button");
    hook.type = "button";
    hook.hidden = true;
    hook.dataset[kind === "off" ? "studioDesignOff" : "studioDesignSquare"] = "";
    root.appendChild(hook);
    hook.click();
    hook.remove();
    return true;
  }

  /* 글꼴 모양을 통째로 바꾸는 확인(디자인 패널이 같은 누르기를 받아 바꾼다 — 이 처리기가 먼저 돈다). 끄기는 디자인 기록에 남지 않아
   * 작업실 동작으로 남긴다(Cmd/Ctrl+Z가 되돌린다). 네모꼴로 바꾸기는 디자인 기록 한 줄이다 */
  function confirmShapeChange(kind) {
    var design = window.FontStudio && window.FontStudio.design;
    if (kind === "off" && design && design.state && design.state.applied) {
      recordAction("디자인 끄기", function () { design.setApplied(true); }, function () { design.setApplied(false); });
    }
    setTimeout(function () {
      message(kind === "off"
        ? "디자인을 껐습니다 — 미리보기는 글꼴 CSS로 그립니다. Ctrl+Z(⌘Z)로 되돌릴 수 있습니다."
        : "글꼴 모양을 네모꼴로 바꿨습니다. Ctrl+Z(⌘Z)로 되돌릴 수 있습니다.");
    }, 0);
  }

  $("[data-studio-globals]").addEventListener("toggle", renderGlobals);

  $("[data-studio-context]").addEventListener("change", function (event) {
    state.context = event.target.value;
    state.escalate = null;
    restoreSelection();
  });

  textInput.addEventListener("input", function () {
    state.selection = null;
    renderPreview();
    if (state.userEdited) {
      scheduleDraftSave();
    }
  });

  // ── 다른 글꼴 열기 전에 묻기(2026-10-18 검토 D12 — 확인 없이 사라졌다) ──
  /* 불러온 뒤 고친 것이 있으면 저장(프로젝트 파일)·버리고 열기·취소를 묻는다. 고친 것은 초안에도 남지만 새 글꼴을 고치기 시작하면
   * 초안이 새 작업으로 바뀐다 — 그래서 묻는다. 자동화 창구(loadProject·loadFontText)는 묻지 않는다 */
  var pendingLoad = null;

  function guardLoad(label, proceed, cancel) {
    if (!state.dirty) {
      proceed();
      return true;
    }
    if (pendingLoad && pendingLoad.cancel) {
      pendingLoad.cancel();
    }
    pendingLoad = { label: label, proceed: proceed, cancel: cancel || null };
    renderUnsaved();
    return false;
  }

  function renderUnsaved() {
    var box = $("[data-studio-unsaved]");
    box.hidden = !pendingLoad;
    if (pendingLoad) {
      $("[data-studio-unsaved-text]").textContent = "고친 것이 있습니다. 새로 열면(" + pendingLoad.label + ") 지금 작업이 화면에서 사라집니다. " +
        "고친 것은 이 브라우저의 초안에도 남지만, 새로 연 글꼴을 고치기 시작하면 초안이 새 작업으로 바뀝니다.";
      root.dataset.unsavedAsk = "open";
      var first = box.querySelector("button");
      if (first) {
        first.focus({ preventScroll: true });
      }
    } else {
      delete root.dataset.unsavedAsk;
    }
  }

  function resolveUnsaved(choice) {
    var entry = pendingLoad;
    pendingLoad = null;
    renderUnsaved();
    if (!entry) {
      return false;
    }
    if (choice === "cancel") {
      if (entry.cancel) {
        entry.cancel();
      }
      syncShippedSelect();
      message("열지 않았습니다 — 지금 작업을 그대로 둡니다.");
      return false;
    }
    if (choice === "save" && storeKind() !== "local" && !saveNeedsChoice()) {
      /* 바깥 저장 창구(개발·검수 사이트 등) — 그 창구에 저장하고, 된 뒤에 연다. 못 하면 열지 않는다 */
      saveToStore({}).then(function (result) {
        if (result && result.ok) {
          entry.proceed();
        }
      });
      return true;
    }
    if (choice === "save") {
      saveProjectFile();
    } else {
      saveDraftNow(); // 초안이 마지막으로 고친 상태를 갖게
    }
    entry.proceed();
    return true;
  }

  function requestShipped(value) {
    var id = resolveShipped(value);
    if (!id) {
      message("기본 제공 글꼴 목록에 없는 이름입니다(" + value + ").", "warn");
      syncShippedSelect();
      return false;
    }
    return guardLoad("글꼴 " + id, function () { loadShipped(id); }, function () { syncShippedSelect(); });
  }

  /* 열기 하나(S2 머리 막대) — CSS·글꼴 묶음·프로젝트·초안·디자인 JSON·디자인 묶음은 openAny, 자소판 PNG는 그림 자소 글꼴의
   * 자소판으로(material.importPng). 다른 글꼴로 바뀌는 것만 고친 것을 먼저 묻는다(디자인·묶음·PNG는 지금 글꼴에 적용한다) */
  function openFile(file) {
    if (!file) {
      return Promise.resolve({ ok: false, kind: "none", errors: [] });
    }
    var name = file.name || "파일";
    if (/\.png$/i.test(name) || file.type === "image/png") {
      var material = window.FontStudio && window.FontStudio.material;
      if (!material && spriteFont() && typeof window.FontStudio.need === "function") {
        /* 자소판 모듈은 그림 자소 글꼴을 열 때 싣는다(S6) — 받는 중이면 다 받고 연다 */
        return window.FontStudio.need("material").then(function () { return openFile(file); }, function () {
          var failed = storeRefusal("OPEN_FAILED", { file: name, reason: "자소판 모듈을 싣지 못했습니다" });
          failed.kind = "png";
          return failed;
        });
      }
      if (!material || !material.state || !material.state.active || typeof material.importPng !== "function") {
        var refusal = storeRefusal("OPEN_FAILED", { file: name, reason: "PNG는 그림 자소 글꼴의 자소판입니다 — 그림 자소 글꼴을 먼저 여세요" });
        refusal.kind = "png";
        return Promise.resolve(refusal);
      }
      return Promise.resolve(material.importPng(file)).then(function (result) {
        return { ok: result === "imported" || result === "pending", kind: "png", result: result, errors: [] };
      });
    }
    return readFile(file).then(function (text) {
      var kind = Package ? Package.fromAny(text).kind : "project";
      if (kind === "bundle" || kind === "design") {
        return openAnyText(text, name);
      }
      return new Promise(function (resolve) {
        guardLoad(name, function () {
          resolve(openAnyText(text, name));
        }, function () {
          resolve({ ok: false, kind: kind, cancelled: true, errors: [] });
        });
      });
    }, function (error) {
      message(name + "을 읽지 못했습니다: " + error.message, "error");
      return { ok: false, kind: "unknown", errors: [{ code: "OPEN_FAILED", path: "", message: error.message }] };
    });
  }

  $("[data-studio-open-file]").addEventListener("change", function (event) {
    var input = event.target;
    var file = input.files[0];
    input.value = "";
    if (file) {
      openFile(file);
    }
  });

  /* 이름을 바꾸면 다른 폰트다: 연결된 파일 핸들을 잊어 원본을 덮어쓰지 않는다. */
  /* The name is trimmed and lower-cased (ASCII) before it is written into
   * the scope selectors and --fy-font-id: the runtime stamps the lowercase
   * name in data-fy-font, so "MyFont" would never match. The field shows the
   * normalized name. */
  function renameTo(input) {
    var typed = String(input == null ? "" : input).trim();
    var name = Model.normalizeFontName(typed);
    var field = $("[data-studio-new-name]");
    if (field) {
      field.value = name;
    }
    var normalized = name !== typed ? " (입력 '" + typed + "' → 소문자 '" + name + "')" : "";
    if (!/^[a-z][a-z0-9-]*$/.test(name)) {
      message("이름은 소문자로 시작하는 a-z, 0-9, - 조합이어야 합니다 (파일 이름과 --fy-font-id가 같아야 한다)" + normalized, "warn");
      return false;
    }
    var from = state.fontId;
    function wholeCopy(text) {
      var copy = Model.renameFont(text, from, name);
      if (state.fontName && state.fontName !== from) {
        copy = Model.renameFont(copy, state.fontName, name);
      }
      return copy;
    }
    /* ADR-030 §8: 기본 제공 글꼴에서 만들면 파생 글꼴 — 바탕은 판을 고정해 구간에 옮기고, 지금까지 고친 것은 그 아래 손 보정으로.
     * 이미 파생 글꼴이면 이름만 바꾼다(바탕 구간은 그대로). 그 밖의 글꼴은 통째로 복사한다 */
    var next = null;
    var how = "";
    var tone = "info";
    var derived = Derive ? Derive.parse(state.css) : null;
    if (derived) {
      next = Derive.retitle(wholeCopy(state.css), name);
      how = " 바탕 " + (derived.base || "?") + " 구간은 그대로 두고 이름만 바꿨습니다.";
    } else if (Derive && state.pristine && state.pristine.id === from && Derive.shipped(from)) {
      var hand = Model.handEdits(state.pristine.css, state.css);
      if (!hand.problems.length) {
        try {
          next = Derive.derive(state.pristine.css, from, name, {
            version: FontKku.version,
            tune: hand.tune,
            hand: hand.css ? Model.renameFont(hand.css, from, name) : ""
          });
          var moved = (hand.css.match(/^\s+--[\w-]+\s*:/gm) || []).length;
          how = " 바탕 " + from + " " + FontKku.version + "을 파생 글꼴 구간에 옮겼습니다(판 고정)" +
            (moved ? " — 고친 선언 " + moved + "개는 그 아래 손 보정이 됐습니다." : ".");
        } catch (error) {
          next = null;
          how = " 파생 글꼴로 옮기지 못해(" + error.message + ") 통째로 복사했습니다 — 바탕 새 판 받기를 쓸 수 없습니다.";
          tone = "warn";
        }
      } else {
        how = " 고친 것 중 손 보정으로 옮길 수 없는 것이 있어(" + hand.problems.slice(0, 2).join(", ") +
          (hand.problems.length > 2 ? " 외 " + (hand.problems.length - 2) + "건" : "") + ") 통째로 복사했습니다 — 바탕 새 판 받기를 쓸 수 없습니다.";
        tone = "warn";
      }
    }
    if (next === null) {
      next = wholeCopy(state.css);
    }
    if (!setCss(next)) {
      return false;
    }
    state.original = state.css;
    state.fileHandle = null;
    updateStatus();
    message(from + "에서 새 글꼴 " + name + "을 시작했습니다" + normalized + "." + how + " 내보내면 " + name + ".css가 됩니다" +
      (canPickFiles ? " — '파일에 저장'은 새 파일을 고릅니다." : "."), tone);
    return true;
  }

  $("[data-studio-rename]").addEventListener("click", function () {
    renameTo($("[data-studio-new-name]").value.trim());
  });

  $("[data-studio-rebase]").addEventListener("click", rebaseDerived);

  /* 글꼴 CSS 기록 한 걸음(하나의 기록의 css 갈래가 부른다) — CSS 글만 되돌린다 */
  function cssBack() {
    var previous = history.back(state.css);
    if (previous === null) {
      return { ok: false, code: "NOTHING_TO_UNDO" };
    }
    cssTimes.redo.push(cssTimes.undo.length ? cssTimes.undo.pop() : 0);
    cssInfo.redo.push(cssInfo.undo.length ? cssInfo.undo.pop() : { label: "글꼴 CSS 바꾸기", actor: copyActor() });
    clearMessage();
    setCss(previous, { fromHistory: "undo" });
    return { ok: true };
  }

  function cssForward() {
    var next = history.forward(state.css);
    if (next === null) {
      return { ok: false, code: "NOTHING_TO_REDO" };
    }
    cssTimes.undo.push(cssTimes.redo.length ? cssTimes.redo.pop() : Date.now());
    cssInfo.undo.push(cssInfo.redo.length ? cssInfo.redo.pop() : { label: "글꼴 CSS 바꾸기", actor: copyActor() });
    clearMessage();
    setCss(next, { fromHistory: "redo" });
    return { ok: true };
  }

  // ── 하나의 기록(PLAN-STUDIO-002 S2) ──────────────────────────────────────
  /* 글꼴 CSS·디자인(그림 문서 포함)·자소판 화소·검수·작업실 동작(디자인 끄기)이 한 시간축(FontStudioTransactions.createTimeline)에
   * 이름 붙은 줄로 쌓인다. 갈래마다 제 되돌리기 자료를 들고(CSS 글 기록·디자인 기록·자소판 조각), 시간축이 차례·행위자·크기를 든다.
   * Cmd/Ctrl+Z·Shift+Cmd/Ctrl+Z·Ctrl+Y와 편집 기록 칸은 시간축 전체의 마지막 일, 갈래별 단추(CSS 되돌리기·디자인·자소판)와
   * FontStudio.undo/design.undo/material.undo는 그 갈래의 마지막 일이다. 시간축 모델은 디자인 모듈과 함께 싣는 transactions에
   * 있어 처음 쓸 때 만든다(이 파일보다 늦게 실린다) */
  var timeline = null;
  var timelineLanes = {};
  var timelineListeners = [];
  var TIMELINE_KIND_TEXT = { css: "글꼴 CSS", design: "디자인", drawing: "그림", sheet: "자소판", review: "검수", action: "작업실",
    group: "묶음", remote: "다른 행위자" };

  function ensureTimeline() {
    if (timeline) {
      return timeline;
    }
    var Tx = window.FontStudioTransactions;
    if (!Tx || typeof Tx.createTimeline !== "function") {
      return null;
    }
    timeline = Tx.createTimeline();
    Object.keys(timelineLanes).forEach(function (name) { timeline.lane(name, timelineLanes[name]); });
    timeline.on(function (event) {
      timelineListeners.slice().forEach(function (listener) {
        try {
          listener(event);
        } catch (error) {
          if (window.console && console.error) {
            console.error("font-studio: 기록 처리기가 실패했습니다", error);
          }
        }
      });
    });
    return timeline;
  }

  function timelineLane(name, spec) {
    timelineLanes[name] = spec;
    if (timeline) {
      timeline.lane(name, spec);
    }
    return function () {
      if (timelineLanes[name] === spec) {
        delete timelineLanes[name];
      }
    };
  }

  /* 갈래 하나가 기록 한 줄을 남긴다 — 행위자는 지금 행위자(api.setActor) */
  function timelineRecord(name, info) {
    var tl = ensureTimeline();
    if (!tl) {
      return null;
    }
    var data = info || {};
    if (!data.actor) {
      data.actor = copyActor();
    }
    return tl.record(name, data);
  }

  timelineLane("css", {
    undo: function () { return cssBack().ok; },
    redo: function () { return cssForward().ok; },
    truncate: function () {
      history.redo.length = 0;
      cssTimes.redo = [];
      cssInfo.redo = [];
    },
    dropOldest: function () {
      history.undo.shift();
      cssTimes.undo.shift();
      cssInfo.undo.shift();
    }
  });

  /* 작업실 동작(디자인 끄기처럼 다른 기록에 남지 않는 것) — 되돌릴 함수를 시간축 항목에 맡긴다 */
  timelineLane("action", {
    undo: function (entry) { entry.data.undo(); return true; },
    redo: function (entry) { entry.data.redo(); return true; }
  });

  function laneResult(result) {
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  }

  /* 글꼴 CSS 되돌리기·다시(막대 단추, FontStudio.undo/redo) → { ok } | { ok: false, code } (2026-10-18 검토 D11). CSS 갈래의 마지막 일 */
  function undo() {
    var tl = ensureTimeline();
    return tl ? laneResult(tl.undoLane("css")) : cssBack();
  }

  function redo() {
    var tl = ensureTimeline();
    return tl ? laneResult(tl.redoLane("css")) : cssForward();
  }

  /* 머리 막대의 되돌리기·다시는 하나의 기록 전체의 마지막 일 — Cmd/Ctrl+Z와 같다(S2 머리 막대). 글꼴 CSS 갈래만은 FontStudio.undo/redo */
  $("[data-studio-undo]").addEventListener("click", function () { undoLast(); });
  $("[data-studio-redo]").addEventListener("click", function () { redoLast(); });

  function entryText(entry) {
    var kind = TIMELINE_KIND_TEXT[entry.cause] || TIMELINE_KIND_TEXT[entry.kind] || "";
    return entry.label ? entry.label : kind || "편집";
  }

  /* Cmd/Ctrl+Z — 시간축 전체의 마지막 일(2026-10-18 검토 D5 → S2 하나의 기록). → { ok, kind, entry } */
  function undoLast() {
    var tl = ensureTimeline();
    if (!tl) {
      return refusedResult(refuse("NOTHING_TO_UNDO"));
    }
    var result = tl.undo();
    if (!result.ok) {
      if (result.code === "NOTHING_TO_UNDO" || result.code === "BATCH_OPEN") {
        return refusedResult(refuse("NOTHING_TO_UNDO"));
      }
      message("되돌리지 못했습니다 — " + entryText(result.entry || {}) + ".", "warn");
      return { ok: false, code: result.code, kind: result.entry ? result.entry.kind : null, entry: result.entry };
    }
    message("되돌렸습니다 — " + entryText(result.entry) + ". 다시 하려면 Shift+Ctrl+Z(⌘⇧Z)입니다.");
    return { ok: true, kind: result.entry.kind, entry: result.entry };
  }

  function redoLast() {
    var tl = ensureTimeline();
    if (!tl) {
      return refusedResult(refuse("NOTHING_TO_REDO"));
    }
    var result = tl.redo();
    if (!result.ok) {
      if (result.code === "NOTHING_TO_REDO" || result.code === "BATCH_OPEN") {
        return refusedResult(refuse("NOTHING_TO_REDO"));
      }
      message("다시 하지 못했습니다 — " + entryText(result.entry || {}) + ".", "warn");
      return { ok: false, code: result.code, kind: result.entry ? result.entry.kind : null, entry: result.entry };
    }
    message("다시 했습니다 — " + entryText(result.entry) + ".");
    return { ok: true, kind: result.entry.kind, entry: result.entry };
  }

  /* 작업실 동작 하나를 기록에 — 새 동작은 다시 할 것을 비운다 */
  function recordAction(label, undoFn, redoFn) {
    timelineRecord("action", { label: label, cause: "design", bytes: 64, data: { undo: undoFn, redo: redoFn } });
  }

  /* FontStudio.timeline — 모듈(갈래)·편집 기록 칸·자동화 계약이 쓰는 창구 */
  var timelineApi = {
    /* 갈래 붙이기 — spec: { undo(entry) → bool, redo(entry) → bool, truncate?(), dropOldest?(entry), merge?(prev, next) } */
    lane: timelineLane,
    /* 기록 한 줄 — info: { label, cause, bytes?, data?, mergeKey?, id?, actor? } (행위자는 없으면 지금 행위자) */
    record: timelineRecord,
    /* 다른 행위자가 이미 바꾼 것을 다시 적용하지 않고 줄로만 받는다(되돌릴 수 없는 줄) */
    receive: function (info) {
      var tl = ensureTimeline();
      return tl ? tl.receive(info) : null;
    },
    undo: undoLast,
    redo: redoLast,
    undoLane: function (name) {
      var tl = ensureTimeline();
      return tl ? tl.undoLane(name) : { ok: false, code: "NOTHING_TO_UNDO" };
    },
    redoLane: function (name) {
      var tl = ensureTimeline();
      return tl ? tl.redoLane(name) : { ok: false, code: "NOTHING_TO_REDO" };
    },
    /* 그 항목까지(null이면 처음 상태) — 편집 기록 칸의 항목 누르기 */
    jump: function (id) {
      var tl = ensureTimeline();
      if (!tl) {
        return { ok: false, code: "ENTRY_UNKNOWN" };
      }
      var target = id === null ? null : tl.entry(id);
      var result = tl.jump(id);
      if (result.ok && result.steps) {
        message("편집 기록으로 옮겼습니다 — " + (target ? entryText(target) : "처음 상태") + ".");
      } else if (!result.ok && result.code !== "ENTRY_UNKNOWN") {
        message("편집 기록으로 다 옮기지 못했습니다 — " + entryText(result.entry || {}) + "에서 멈췄습니다.", "warn");
      }
      return result;
    },
    batch: function (label, fn, info) {
      var tl = ensureTimeline();
      return tl ? tl.batch(label, fn, info) : fn();
    },
    begin: function (label, info) {
      var tl = ensureTimeline();
      return tl ? tl.begin(label, info) : false;
    },
    end: function () {
      return timeline ? timeline.end() : null;
    },
    forget: function (name) { return timeline ? timeline.forget(name) : false; },
    dropOldestOf: function (name) { return timeline ? timeline.dropOldestOf(name) : false; },
    /* [{ id, kind(갈래), lanes, cause, label, actor, time, bytes, undoable, state: "done"|"undone" }] — 오래된 것부터, 되돌린 것은 뒤 */
    entries: function () { return timeline ? timeline.entries() : []; },
    index: function () { return timeline ? timeline.index() : -1; },
    entry: function (id) { return timeline ? timeline.entry(id) : null; },
    /* 되돌리기·다시 단추 툴팁 — { undo: 이름|null, redo: 이름|null } */
    peek: function () { return timeline ? timeline.peek() : { undo: null, redo: null }; },
    canUndo: function () { return Boolean(timeline && timeline.canUndo()); },
    canRedo: function () { return Boolean(timeline && timeline.canRedo()); },
    canUndoLane: function (name) { return Boolean(timeline && timeline.canUndoLane(name)); },
    canRedoLane: function (name) { return Boolean(timeline && timeline.canRedoLane(name)); },
    applying: function () { return Boolean(timeline && timeline.applying()); },
    bytes: function () { return timeline ? timeline.bytes() : 0; },
    budget: function () {
      var tl = ensureTimeline();
      return tl ? tl.budget() : 0;
    },
    /* 크기 상한(바이트) — 넘으면 가장 오래된 줄부터 버린다(그 갈래 자료도) */
    setBudget: function (bytes) {
      var tl = ensureTimeline();
      return tl ? tl.setBudget(bytes) : 0;
    },
    /* 저장할 기록(이름·행위자·시각만) / 되살리기(되돌릴 수 없는 지난 줄) — 글꼴 묶음의 '편집 기록(선택)'(S2-B가 잇는다) */
    serialize: function () {
      var tl = ensureTimeline();
      return tl ? tl.serialize() : { format: "font-kku-timeline", version: 1, entries: [] };
    },
    restore: function (saved) {
      var tl = ensureTimeline();
      return tl ? tl.restore(saved) : 0;
    },
    clear: function () {
      if (timeline) {
        timeline.clear();
      }
    },
    /* 기록이 바뀔 때마다 { type: record|merge|undo|redo|drop|forget|clear|restore, entry } */
    on: function (listener) {
      timelineListeners.push(listener);
      return function off() {
        timelineListeners = timelineListeners.filter(function (entry) { return entry !== listener; });
      };
    },
    /* 갈래·까닭의 한국어 이름(편집 기록 칸) */
    kindText: function (kind) { return TIMELINE_KIND_TEXT[kind] || kind; }
  };

  function typing(target) {
    var tag = target && target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(target && target.isContentEditable);
  }

  document.addEventListener("keydown", function (event) {
    if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || typing(event.target)) {
      return; // 입력 칸 안에서는 그 칸의 되돌리기
    }
    var key = String(event.key || "").toLowerCase();
    var z = event.code === "KeyZ" || key === "z";
    var y = event.code === "KeyY" || key === "y";
    if (z && !event.shiftKey) {
      undoLast();
    } else if ((z && event.shiftKey) || (y && event.ctrlKey && !event.metaKey)) {
      redoLast();
    } else {
      return;
    }
    event.preventDefault();
  });

  // ── CSS만 내보낼 때 빠지는 것(2026-10-18 검토 D6 — 디자인·그린 세트를 말없이 뺐다) ──────────
  /* 지금 미리보기가 쓰는데 글꼴 CSS가 나르지 못하는 것의 이름들. 없으면 [] — 그때는 아무것도 묻거나 보이지 않는다 */
  function lostInCss() {
    var studio = window.FontStudio || {};
    var lost = [];
    var design = studio.design;
    if (design && design.state && design.state.applied && typeof design.status === "function" && design.status() !== "unavailable") {
      lost.push("디자인(글꼴 모양·재료·문자 매핑)");
    }
    var drawing = studio.draw && typeof studio.draw.doc === "function" ? studio.draw.doc() : null;
    var drawn = drawing && drawing.cells ? Object.keys(drawing.cells).filter(function (key) {
      var cell = drawing.cells[key];
      return cell && Array.isArray(cell.parts) && cell.parts.some(function (part) { return part && Array.isArray(part.shapes) && part.shapes.length; });
    }).length : 0;
    if (drawn) {
      lost.push("그린 그림 세트 " + drawn + "칸");
    }
    var material = studio.material;
    if (material && material.state && material.state.active && material.state.history && material.state.history.length) {
      lost.push("자소판 그림 수정('PNG 내보내기'로 따로 저장)");
    }
    return lost;
  }

  function showExportNotice(action, lost) {
    var box = $("[data-studio-export-notice]");
    if (!lost.length) {
      hideExportNotice();
      return;
    }
    $("[data-studio-export-notice-text]").textContent = "CSS 파일로 " + action + " — CSS에 담기지 않은 것: " + lost.join(", ") +
      ". 모두 남기려면 '저장'(글꼴 묶음)이나 '내보내기 ▸ 글꼴 묶음 파일'을 쓰세요.";
    box.hidden = false;
    root.dataset.exportNotice = lost.length ? "lost" : "";
  }

  function hideExportNotice() {
    $("[data-studio-export-notice]").hidden = true;
    delete root.dataset.exportNotice;
  }

  $("[data-studio-export-css]").addEventListener("click", function () {
    if (blockedSave()) {
      return;
    }
    var warning = lintWarning("내보냈습니다");
    var flat = flattening();
    download(state.fontName + ".css", outputCss(), "text/css");
    message(state.fontName + ".css를 " + (flat ? "통째로 풀어 " : "") + "내보냈습니다." + warning, warning ? "warn" : "info");
    showExportNotice("내보냈습니다", lostInCss());
  });

  /* Clipboard API only exists in secure contexts (https, localhost, file);
   * a tailnet/LAN http page falls back to a selected textarea + execCommand. */
  var lastCopy = null;

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.insetBlockStart = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    area.remove();
    return copied;
  }

  function copyText(text) {
    var attempt = navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); })
      : Promise.resolve(legacyCopy(text));
    return attempt.then(function (copied) {
      lastCopy = { text: text, copied: copied };
      return copied;
    });
  }

  $("[data-studio-copy-css]").addEventListener("click", function () {
    if (blockedSave()) {
      return;
    }
    var warning = lintWarning("복사했습니다");
    var text = outputCss();
    copyText(text).then(function (copied) {
      showExportNotice("복사했습니다", lostInCss());
      if (copied) {
        message(state.fontName + ".css를 클립보드에 복사했습니다." + warning, warning ? "warn" : "info");
        return;
      }
      /* 마지막 대체 길 — 어느 페이지에서나 보이는 칸에 글을 두고 골라 둔다(전에는 고치기 페이지에만 있는 감춰진 원문 칸을 가리켰다) */
      var fallback = $("[data-studio-copy-fallback]");
      var area = $("[data-studio-copy-fallback-text]");
      area.value = text;
      fallback.hidden = false;
      area.focus({ preventScroll: false });
      area.select();
      message("브라우저가 클립보드 쓰기를 막았습니다 — 아래 칸의 글을 골라 두었으니 직접 복사하세요(Ctrl+C·⌘C).", "warn");
    });
  });

  // ── File System Access (지원 브라우저만; 그 밖에는 다운로드) ────────────

  var canPickFiles = typeof window.showSaveFilePicker === "function";

  function cssPickerOptions() {
    return { types: [{ description: "font CSS", accept: { "text/css": [".css"] } }] };
  }

  function saveToHandle() {
    if (blockedSave()) {
      return Promise.resolve(false);
    }
    var text = outputCss();
    var flat = flattening();
    var pick = state.fileHandle
      ? Promise.resolve(state.fileHandle)
      : window.showSaveFilePicker(Object.assign({ suggestedName: state.fontName + ".css" }, cssPickerOptions()));
    return pick.then(function (handle) {
      state.fileHandle = handle;
      var warning = lintWarning("저장했습니다");
      return handle.createWritable().then(function (writable) {
        return writable.write(text).then(function () { return writable.close(); });
      }).then(function () {
        state.original = state.css;
        updateStatus();
        message((handle.name || state.fontName + ".css") + "에 " + (flat ? "통째로 풀어 " : "") + "저장했습니다." + warning, warning ? "warn" : "info");
        showExportNotice("저장했습니다", lostInCss());
      });
    }).catch(function (error) {
      if (error && error.name !== "AbortError") {
        message("저장하지 못했습니다: " + error.message, "error");
      }
    });
  }

  function openWithHandle() {
    return window.showOpenFilePicker(cssPickerOptions()).then(function (handles) {
      var handle = handles[0];
      return handle.getFile().then(function (file) {
        return readFile(file).then(function (text) {
          if (loadFontText(text, { fileHandle: handle })) {
            message(file.name + "을 열었습니다. '파일에 저장'은 이 파일을 덮어씁니다." + parseSummary(), loadTone());
          }
        });
      });
    }).catch(function (error) {
      if (error && error.name !== "AbortError") {
        message("열지 못했습니다: " + error.message, "error");
      }
    });
  }

  $("[data-studio-save]").hidden = !canPickFiles;
  $("[data-studio-open-handle]").hidden = typeof window.showOpenFilePicker !== "function";
  $("[data-studio-save]").addEventListener("click", saveToHandle);
  $("[data-studio-open-handle]").addEventListener("click", function () {
    guardLoad("파일 연결해 열기", openWithHandle);
  });

  /* 페이지 무리로 늦게 싣는 모듈(검수·자소판, S6 성능)이 아직 없으면 그 칸을 불러온 그대로 넘긴다 — 실리지 않은 모듈은 자료를
   * 바꿀 수 없으니 실렸을 때와 같은 값이다. 검수는 검수 모듈이 하던 것처럼 판 모양을 맞추고(normalize), 자소판은 그림 자소
   * 글꼴을 싣는 사이(모듈을 받는 동안)에만 불러온 자소판을 그대로 둔다(그 밖의 글꼴은 자소판 칸이 없다) */
  function passLazyParts(project) {
    var studio = window.FontStudio || {};
    var loaded = lastLoad || {};
    if (!studio.review && !Object.prototype.hasOwnProperty.call(project, "review")) {
      var ReviewModel = window.FontStudioReviewModel;
      if (ReviewModel && typeof ReviewModel.normalize === "function") {
        project.review = ReviewModel.normalize(loaded.review ? JSON.parse(JSON.stringify(loaded.review)) : null);
      }
      if (loaded.reproducibility) {
        project.reproducibility = JSON.parse(JSON.stringify(loaded.reproducibility));
      }
    }
    if (!studio.material && !project.material && loaded.material && loaded.material.sheet && spriteFont()) {
      project.material = JSON.parse(JSON.stringify(loaded.material));
    }
    /* 칸 차례는 모듈을 실은 차례와 상관없이 전과 같게(자소판 → 디자인 → 검수) — 저장한 파일의 글이 싣는 차례로 바뀌지 않게 */
    var ordered = {};
    PROJECT_ORDER.concat(Object.keys(project)).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(project, key) && !Object.prototype.hasOwnProperty.call(ordered, key)) {
        ordered[key] = project[key];
      }
    });
    Object.keys(project).forEach(function (key) { delete project[key]; });
    Object.keys(ordered).forEach(function (key) { project[key] = ordered[key]; });
  }

  var PROJECT_ORDER = ["format", "version", "font", "preview", "material", "design", "review", "reproducibility"];

  function spriteFont() {
    try {
      return Boolean(doc) && Model.readMetadata(doc).material === "sprite";
    } catch (error) {
      return false;
    }
  }

  function projectSnapshot() {
    var project = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      font: { id: state.fontName, css: state.css, baseUrl: state.baseUrl },
      preview: { text: textInput.value }
    };
    emit("project", project);
    passLazyParts(project);
    /* 연 프로젝트·묶음에 있던, 모듈이 모르는 칸은 그대로 돌려놓는다(버리지 않는다) */
    var extra = state.packageMeta && state.packageMeta.extra;
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        if (key === "font" && extra.font && typeof extra.font === "object") {
          Object.keys(extra.font).forEach(function (field) {
            if (!Object.prototype.hasOwnProperty.call(project.font, field)) {
              project.font[field] = JSON.parse(JSON.stringify(extra.font[field]));
            }
          });
        } else if (!Object.prototype.hasOwnProperty.call(project, key)) {
          project[key] = JSON.parse(JSON.stringify(extra[key]));
        }
      });
    }
    return project;
  }

  /* 글꼴 묶음(S2) — 프로젝트 칸(모듈이 채운다) + 내보낼 CSS + manifest. options: { history: false(편집 기록을 넣지 않음 — 초안) } */
  function packageSnapshot(options) {
    var opts = options || {};
    if (!Package) {
      return null;
    }
    var project = projectSnapshot();
    var meta = state.packageMeta || {};
    var info = derivedInfo();
    var Bundle = window.FontStudioBundleModel;
    var runtime = Bundle && typeof Bundle.runtimeInfo === "function" ? Bundle.runtimeInfo(FontKku) : { version: FontKku.version };
    var timeline = window.FontStudio && window.FontStudio.timeline;
    var history = null;
    if (opts.history !== false && timeline && typeof timeline.serialize === "function") {
      try {
        history = timeline.serialize();
      } catch (error) {
        history = null;
      }
    }
    return Package.fromProject(project, {
      css: outputCss(),
      id: state.fontName || state.fontId || undefined,
      runtime: runtime,
      base: info && info.base ? { id: info.base, rev: info.version || info.hash || null } : null,
      createdAt: meta.createdAt || undefined,
      license: meta.license || undefined,
      extra: meta.extra || undefined,
      keep: meta.keep || undefined,
      history: history
    });
  }

  /* 프로젝트 파일 저장 — 글꼴 묶음 파일(<이름>.font-kku.json, S2 ⚑2 — 전에는 프로젝트 v2). CSS·디자인·그림·자소판·검수를 모두
   * 담는다. 옛 프로젝트 v2 파일도 같은 '프로젝트 열기'로 연다. 저장하면 '고친 것'을 다시 센다(D12) */
  function saveProjectFile() {
    var warning = lintWarning("프로젝트를 저장했습니다");
    var pkg = packageSnapshot();
    var name = pkg ? Package.fileName(pkg) : state.fontName + ".font-kku.json";
    if (pkg) {
      download(name, Package.serialize(pkg), "application/json");
    } else {
      download(name, JSON.stringify(projectSnapshot(), null, 2) + "\n", "application/json");
    }
    message(name + "을 저장했습니다(글꼴 묶음)." + warning, warning ? "warn" : "info");
    state.dirty = false;
    return true;
  }

  // ── 저장 창구(S2 — PLAN-STUDIO-002 '저장 창구와 글꼴 묶음', studio/font-studio-store.js) ──────────
  /* 창구: 주소 ?store-url=(mount storeUrl — 개발·검수 사이트 /api/v1/store/<이름공간>/), ?__font_kku_store=relay(mount store 객체 —
   * bridge.js가 부모로 넘긴다), 아니면 local(묶음 파일 내려받기). revs: 창구의 글꼴마다 마지막으로 읽거나 쓴 판(If-Match) */
  function storeKind() {
    if (params.get("store-url")) {
      return "http";
    }
    if (params.get("__font_kku_store") === "relay") {
      return "relay";
    }
    return "local";
  }

  function activeStore() {
    if (storeState.store) {
      return storeState.store;
    }
    var Kit = window.FontStudioStore;
    if (!Kit) {
      return null;
    }
    var kind = storeKind();
    if (kind === "http") {
      storeState.store = Kit.http(new URL(params.get("store-url"), document.baseURI).href, {
        actor: function () { return state.actor && state.actor.id ? state.actor.id : null; }
      });
    } else if (kind === "relay") {
      var port = window.FontStudio && window.FontStudio.storeRelay;
      if (!port) {
        return null; // 다리가 아직 없다 — 부를 때 다시 본다
      }
      storeState.store = Kit.relay(port);
    } else {
      storeState.store = Kit.local({ download: download });
    }
    return storeState.store;
  }

  /* 처음 저장할 때 물을 것 — 기본 제공 글꼴(이름이 sebul·gothic 등)을 아직 저장하지 않았으면 '새 글꼴로 / 이 글꼴 그대로' 중에서.
   * '이 글꼴 그대로'는 저장소 작업실(shippedSave)에서만. 물을 것이 없으면 null */
  function saveNeedsChoice() {
    if (state.saved || !Derive || !Derive.shipped(state.fontName)) {
      return null;
    }
    return {
      choices: SHIPPED_SAVE ? ["new", "same"] : ["new"],
      suggestedName: suggestName(state.fontName),
      font: state.fontName,
      sameBlocked: sameNameBlock()
    };
  }

  function suggestName(from) {
    var base = "my-" + String(from || "font").replace(/^my-/, "");
    var name = base;
    var taken = {};
    fontCatalog.fonts.forEach(function (entry) { taken[entry.id] = true; });
    for (var n = 2; taken[name] || (Derive && Derive.shipped(name)); n += 1) {
      name = base + "-" + n;
    }
    return name;
  }

  /* 저장 — 글꼴 묶음 전체를 저장 창구로. options: { as: "new" | "same", name(새 글꼴 이름), force(창구 판이 달라도 덮어쓰기) }
   * → Promise<{ ok, id, rev, file?, contentRev?, code?, message?, choices?, suggestedName? }>. 거절은 결과다(던지지 않는다) */
  function saveToStore(options) {
    var opts = options || {};
    if (opts.as !== undefined && opts.as !== "new" && opts.as !== "same") {
      return Promise.reject(new TypeError("FontStudio.save: as must be \"new\" or \"same\""));
    }
    if (!Package) {
      return Promise.resolve(storeRefusal("MODULE_UNAVAILABLE", { module: "font-studio-package" }));
    }
    if (!doc) {
      return Promise.resolve(storeRefusal("NO_FONT"));
    }
    var ask = saveNeedsChoice();
    if (ask && !opts.as) {
      return Promise.resolve(storeRefusal("SAVE_NEEDS_CHOICE", { font: ask.font, suggestedName: ask.suggestedName },
        { choices: ask.choices, suggestedName: ask.suggestedName, font: ask.font }));
    }
    if (opts.as === "same" && ask && ask.choices.indexOf("same") < 0) {
      return Promise.resolve(storeRefusal("SAME_NAME_BLOCKED", { font: state.fontName }));
    }
    if (opts.as === "new") {
      var name = opts.name === undefined || opts.name === null || opts.name === "" ? (ask ? ask.suggestedName : suggestName(state.fontName)) : String(opts.name);
      if (!renameTo(name)) {
        return Promise.resolve(storeRefusal("NAME_INVALID", { name: name }));
      }
    } else {
      var reason = sameNameBlock();
      if (reason) {
        return Promise.resolve(storeRefusal("SAME_NAME_BLOCKED", { reason: reason, font: state.fontName }));
      }
    }
    var store = activeStore();
    if (!store) {
      return Promise.resolve(storeRefusal("STORE_UNAVAILABLE"));
    }
    var id = state.fontName;
    var pkg = packageSnapshot();
    var warning = lintWarning("저장했습니다");
    var ifMatch = storeState.revs[id] || null;
    if (opts.force) {
      ifMatch = typeof opts.force === "string" ? opts.force
        : storeState.foreign && storeState.foreign.id === id && storeState.foreign.rev ? storeState.foreign.rev : ifMatch;
    }
    return Promise.resolve(store.save(id, pkg, { ifMatch: ifMatch })).then(function (result) {
      if (!result || !result.ok) {
        var failure = result || { ok: false, code: "STORE_FAILED" };
        if (failure.code === "REV_MISMATCH") {
          root.dataset.storeConflict = "true";
          storeState.foreign = { id: id, rev: failure.rev || null, actor: null };
        }
        return storeRefusal(failure.code, { reason: failure.code === "REV_MISMATCH" ? "" : failure.message, font: id },
          { id: id, rev: failure.rev === undefined ? null : failure.rev, status: failure.status || null });
      }
      if (store.kind !== "local") {
        storeState.revs[id] = result.rev || null;
        root.dataset.storeRev = result.rev || "";
      }
      storeState.foreign = null;
      delete root.dataset.storeConflict;
      state.saved = true;
      state.dirty = false;
      state.original = state.css;
      state.packageMeta = Object.assign({}, state.packageMeta || {}, { createdAt: pkg.manifest.createdAt });
      updateStatus();
      if (!opts.quiet || warning) {
        message((store.kind === "local" ? (result.file || Package.fileName(pkg)) + "을 저장했습니다(글꼴 묶음)." : id + "을 저장했습니다.") + warning,
          warning ? "warn" : "info");
      }
      watchStore(id);
      return { ok: true, id: id, rev: result.rev || null, file: result.file || null, contentRev: pkg.manifest.contentRev };
    });
  }

  /* 저장·열기 거절 — 거절 표(authoring/font-studio-refusals.js)의 한 줄을 화면에 보이고 결과로 돌려준다(화면 문구 = 결과 message).
   * 표에 없는 창구 코드는 STORE_FAILED로 */
  function storeRefusal(code, params, extra) {
    var table = window.FontStudioRefusals;
    var known = !table || table.has(code) ? code : "STORE_FAILED";
    var refusal = makeRefusal(known, params || {});
    var tone = table ? table.tone(known) : "warn";
    message(refusalLine(refusal), tone === "error" ? "error" : tone === "info" ? "info" : "warn", refusal.detail);
    var out = Object.assign({ ok: false }, refusal);
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  /* 창구가 다른 행위자의 저장을 알리면 — 다시 싣지 않고 알린다(되돌리기 기록이 끊기지 않게). 다시 싣기는 reloadFromStore() */
  function watchStore(id) {
    var store = activeStore();
    if (!store || store.kind === "local" || storeState.watching === id) {
      return;
    }
    if (storeState.unwatch) {
      storeState.unwatch();
    }
    storeState.watching = id;
    storeState.unwatch = store.watch(id, function (event) {
      if (event.rev && event.rev === storeState.revs[id]) {
        return;
      }
      storeState.foreign = { id: id, rev: event.rev || null, actor: event.actor || null };
      root.dataset.storeConflict = "true";
      message("다른 행위자" + (event.actor ? "(" + event.actor + ")" : "") + "가 " + id + "을 바꿨습니다 — 다시 싣거나, 저장하면 덮어쓸지 묻습니다.", "warn");
    });
  }

  /* 창구에서 다시 싣기 — 고친 것은 버린다(호출하는 쪽이 묻는다) → Promise<{ ok, rev, code? }> */
  function reloadFromStore(id) {
    var store = activeStore();
    var target = id || state.fontName;
    if (!store || store.kind === "local") {
      return Promise.resolve(storeRefusal("STORE_UNAVAILABLE"));
    }
    return Promise.resolve(store.open(target)).then(function (found) {
      if (!found) {
        return storeRefusal("STORE_NOT_FOUND", { font: target });
      }
      if (found.ok === false) {
        return storeRefusal(found.code, { reason: found.message, font: target }, { status: found.status || null });
      }
      var checked = Package.validate(found.package);
      if (!checked.ok) {
        return storeRefusal("PACKAGE_INVALID", { reason: checked.errors[0].message }, { errors: checked.errors });
      }
      if (!loadPackage(checked.package, { rev: found.rev, store: true })) {
        return storeRefusal("OPEN_FAILED", { file: target });
      }
      storeState.foreign = null;
      delete root.dataset.storeConflict;
      root.dataset.storeRev = found.rev || "";
      watchStore(target);
      message(target + "을 저장 창구에서 실었습니다." + parseSummary(), loadTone());
      return { ok: true, rev: found.rev || null };
    });
  }

  /* 저장 창구의 글꼴 목록(머리 막대 '내 글꼴') → Promise<[{ id, rev, updatedAt, actor }]> — local이면 [], 실패면 { ok: false, code } */
  function storeList() {
    var store = activeStore();
    if (!store || store.kind === "local" || typeof store.list !== "function") {
      return Promise.resolve([]);
    }
    return Promise.resolve(store.list()).then(function (fonts) {
      return Array.isArray(fonts) ? fonts : fonts && fonts.ok === false ? fonts : [];
    }, function (error) {
      return { ok: false, code: "STORE_UNREACHABLE", message: error && error.message };
    });
  }

  function storeInfo() {
    var store = activeStore();
    return {
      kind: store ? store.kind : storeKind(),
      url: store && store.url ? store.url : null,
      rev: storeState.revs[state.fontName] || null,
      saved: Boolean(state.saved),
      conflict: storeState.foreign ? JSON.parse(JSON.stringify(storeState.foreign)) : null
    };
  }

  $("[data-studio-export-project]").addEventListener("click", function () {
    saveProjectFile();
  });

  // ── Boot ───────────────────────────────────────────────────────────────

  [readStorage(DRAFT_KEY) && { key: DRAFT_KEY, draft: readStorage(DRAFT_KEY) },
    readStorage(DRAFT_PENDING_KEY) && { key: DRAFT_PENDING_KEY, draft: readStorage(DRAFT_PENDING_KEY), preserved: true }]
    .filter(Boolean).forEach(function (entry) { pendingDrafts.push(entry); });
  renderDraftBar();

  coreReady.then(function (loaded) {
    state.coreLoaded = true;
    if (!loaded) {
      message("미리보기용 font-kku.css를 불러오지 못했습니다: " + coreLink.href, "error");
    }
    if (doc) {
      renderPreview();
    }
  });

  /* 처음 글꼴: ?src= 주소, 아니면 ?font=(기본 제공 글꼴 id·별칭 — 모르는 이름이면 알리고 기본 글꼴), 아니면 기본 글꼴. 목록
   * (spec/fonts.json)을 받은 뒤 연다 — 그사이 다른 글꼴을 열었으면(mount 프로젝트·파일) 그대로 둔다 */
  var params = new URLSearchParams(location.search);
  var catalogReady = readCatalog();
  var bootTicket = loadTicket;

  function bootDefault() {
    if (params.get("src")) {
      if (loadTicket === bootTicket && !doc) {
        loadFromUrl(params.get("src"));
      }
      return;
    }
    catalogReady.then(function () {
      if (loadTicket !== bootTicket || doc) {
        return;
      }
      var requested = params.get("font");
      var id = requested ? resolveShipped(requested) : null;
      var note = "";
      if (requested && !id) {
        id = fontCatalog.defaultFont;
        note = "기본 제공 글꼴 목록에 없는 이름입니다(" + requested + ") — 기본 글꼴 " + id + "을 엽니다.";
        root.dataset.fontFallback = requested;
      }
      loadShipped(id || fontCatalog.defaultFont, note);
    });
  }

  /* 저장 창구가 바깥(mount storeUrl·store)이면 먼저 창구에서 그 글꼴(?store-font=, 없으면 ?font=)을 연다. 창구에 없으면 지금처럼
   * ?src=·기본 제공 글꼴을 연다 — 그때 처음 저장은 If-None-Match: *(새로 만들기)다 */
  var storeFont = params.get("store-font") || params.get("font");
  /* 목록(XHR)은 뒤 스크립트(저장 창구 font-studio-store.js·mount 다리 bridge.js)보다 먼저 올 수 있다 — 문서를 다 읽은 뒤에 연다 */
  var parsed = document.readyState === "loading" ? new Promise(function (resolve) {
    document.addEventListener("DOMContentLoaded", resolve, { once: true });
  }) : Promise.resolve();
  if (storeKind() !== "local" && storeFont && /^[a-z][a-z0-9-]*$/.test(storeFont)) {
    Promise.all([catalogReady, parsed]).then(function () {
      var store = activeStore();
      if (!store || loadTicket !== bootTicket || doc) {
        bootDefault();
        return;
      }
      root.dataset.storeOpening = "true";
      return Promise.resolve(store.open(storeFont)).then(function (found) {
        delete root.dataset.storeOpening;
        if (loadTicket !== bootTicket || doc) {
          return; // 그사이 다른 것을 열었다(mount 프로젝트·파일)
        }
        if (found && found.ok !== false && found.package) {
          var checked = Package ? Package.validate(found.package) : { ok: false, errors: [{ message: "글꼴 묶음 모델이 없습니다" }] };
          if (checked.ok && loadPackage(checked.package, { rev: found.rev, store: true })) {
            root.dataset.storeRev = found.rev || "";
            watchStore(storeFont);
            message(storeFont + "을 저장 창구에서 열었습니다." + parseSummary(), loadTone());
            return;
          }
          message("저장 창구의 " + storeFont + " 묶음을 열 수 없어(" + (checked.errors && checked.errors[0] ? checked.errors[0].message : "?") + ") 파일에서 엽니다.", "warn");
        } else if (found && found.ok === false) {
          message("저장 창구를 읽지 못했습니다(" + (found.message || found.code) + ") — 파일에서 엽니다.", "warn");
        }
        bootDefault();
      }, function (error) {
        delete root.dataset.storeOpening;
        message("저장 창구를 읽지 못했습니다(" + (error && error.message || error) + ") — 파일에서 엽니다.", "warn");
        bootDefault();
      });
    });
  } else {
    bootDefault();
  }

  /* 테스트·자동화용 창구. 편집은 UI와 같은 경로(applyInput/nudge)를 쓴다. */
  window.FontStudio = {
    state: state,
    css: function () { return state.css; },
    doc: function () { return doc; },
    select: select,
    selected: selectedNode,
    nudge: nudge,
    setScope: function (scope) {
      chooseScope(scope);
    },
    /* 고른 범위를 풀어 기본 범위로(D2 — 글꼴 모양마다: 고정 모양은 원칙 범위, 네모꼴은 이 짜임의 이 자모 또는 먹는 가장 좁은 범위) */
    resetScope: function () {
      state.scopeChosen = false;
      state.escalate = null;
      restoreSelection();
      return currentScope(selectedNode());
    },
    scope: function () { return currentScope(selectedNode()); },
    /* 바뀔 곳 미리 보이기(D4): { count, scope, hover, refused, nodes: [{ source, jamo, pos }] } */
    affected: function () {
      return { count: affected.nodes.length, scope: affected.scope, hover: affected.hover, refused: affected.refused,
        total: affected.totalState === "ready" ? affected.total : null, totalState: affected.totalState,
        nodes: affected.nodes.map(function (node) {
          var glyph = node.closest('[part="glyph"]');
          return { source: glyph ? glyph.dataset.source : null, jamo: node.getAttribute("data-jamo"), pos: node.getAttribute("data-fy-pos") };
        }) };
    },
    setSharedPolicy: function (policy) {
      state.shared = policy === "split" ? "split" : "edit";
      restoreSelection();
    },
    escalate: function (on) {
      state.escalate = on === false ? null : selectionKey();
      restoreSelection();
    },
    target: function (property) {
      var node = selectedNode();
      return node ? planOf(node, property) : null;
    },
    /* 값 고치기 → { ok, code?, message?, effect? }(D11). 되돌리기·다시(글꼴 CSS) → { ok } */
    setValue: applyInput,
    /* 보이는 값으로 고치기(정밀 모드 값 칸과 같은 길, S4) — 친 값이 보이도록 고른 범위의 값을 옮긴다. 결과 꼴은 setValue와 같다 */
    visibleValue: applyVisible,
    /* 머리 음절 안 조각(S4): 고른 조각 { glyph, source, part, jamo, head } | null, 그 점(x, y)의 조각 고르기, '낱으로 나눠 고치기' */
    piece: function () { return piece ? JSON.parse(JSON.stringify(piece)) : null; },
    choosePiece: function (x, y) {
      var node = selectedNode();
      return headNode(node) ? JSON.parse(JSON.stringify(choosePiece(node, x, y))) : null;
    },
    splitPiece: splitPiece,
    undo: undo,
    redo: redo,
    /* Cmd/Ctrl+Z·Shift+Cmd/Ctrl+Z와 같은 길 — 하나의 기록 전체의 마지막 일(CSS·디자인·그림·자소판 화소·검수·디자인 끄기) → { ok, kind, entry } */
    undoLast: undoLast,
    redoLast: redoLast,
    /* 하나의 기록(PLAN-STUDIO-002 S2) — 갈래·기록 줄·되돌리기·건너뛰기·툴팁·크기 상한 */
    timeline: timelineApi,
    /* 불러온 뒤 고친 것이 있는가, UI에서 다른 글꼴을 열기 전 묻기(D12) — guardLoad(label, proceed, cancel) */
    dirty: function () { return state.dirty; },
    guardLoad: guardLoad,
    /* 기본 제공 글꼴 목록(spec/fonts.json): { fonts: [{ id, base }], aliases, defaultFont, loaded } */
    fonts: function () { return JSON.parse(JSON.stringify(fontCatalog)); },
    /* CSS만 내보내면 빠지는 것(D6) */
    lostInCss: lostInCss,
    /* 글꼴 모양을 통째로 바꾸기("off" 디자인 끄기·"square" 네모꼴로) — 묻는 것은 부르는 쪽(디자인 페이지)이 한다(⚑9). Ctrl+Z가 되돌린다 */
    shapeChange: shapeChange,
    rename: renameTo,
    /* 작업실 페이지: 지금 페이지, 바꾸기(주소도 바꾼다) */
    page: function () { return root.dataset.page; },
    setPage: function (name) { return setPage(name, true); },
    /* 보기(쉬운 easy · 정밀 precise) — S1은 이름과 mode 훅만 */
    mode: function () { return root.dataset.studioMode; },
    setMode: setMode,
    /* 자동화 계약 v1(font-studio-api.js)이 쓰는 안쪽 창구. 바깥(호스트·에이전트)은 FontStudio.api만 쓴다 */
    apiSupport: {
      nudge: nudgeResult,
      step: stepResult,
      /* 지금 범위의 편집이 닿는 현대 한글 수(S4) → Promise<number|null> */
      reachTotal: function () { return reachTotal(selectedNode(), null); },
      visible: applyVisible,
      capture: runCapture,
      /* 미리 셈한 글을 편집 하나로 적용한다 — 알림·기록 한 줄·반영 확인은 화면 편집과 같다 */
      commitCaptured: function (css, notes, applied, label) {
        var text = notes.map(function (entry) { return entry.text; }).filter(Boolean).join(" ");
        var detail = notes.map(function (entry) { return entry.detail; }).filter(Boolean).join(" / ");
        commitLabel = label || null;
        var done = commit(css, text, undefined, detail);
        commitLabel = null;
        if (!done) {
          return { ok: false };
        }
        var verified = applied.length ? verifyEdits(applied) : true;
        return { ok: true, effect: root.dataset.editEffect, verified: verified };
      },
      scopes: function (node) { return node ? scopesFor(node, stamped(node)) : []; },
      scopeName: function (scope) { return SCOPE_NAMES[scope] || scope; },
      scopeState: function () { return { scope: state.scope, chosen: state.scopeChosen, escalate: state.escalate, context: state.context }; },
      restoreScope: function (saved) {
        state.scope = saved.scope;
        state.scopeChosen = saved.chosen;
        state.escalate = saved.escalate;
        state.context = saved.context;
        restoreSelection();
      },
      contexts: function (node) { return node ? contextOptions(node) : []; },
      setContext: function (value) {
        state.context = value;
        state.escalate = null;
        restoreSelection();
      },
      /* 고른(또는 주어진) 자모 노드 → { index(미리보기 글자 차례), source, nth(같은 글자 중 몇째), jamo, pos, node(글자 안 차례) } */
      describe: function (node) {
        var glyph = node && node.closest('[part="glyph"]');
        if (!glyph) {
          return null;
        }
        var all = glyphs();
        var index = all.indexOf(glyph);
        var nth = all.slice(0, index).filter(function (other) { return other.dataset.source === glyph.dataset.source; }).length;
        return { index: index, source: glyph.dataset.source, nth: nth, jamo: node.getAttribute("data-jamo"),
          pos: node.getAttribute("data-fy-pos"), node: jamoNodes(glyph).indexOf(node) };
      },
      glyphs: glyphs,
      jamoNodes: jamoNodes,
      /* 글꼴 CSS 기록 줄 { undo: [{ label, actor, time }], redo: […] } — 오래된 것부터 */
      cssHistory: function () {
        function rows(info, times) {
          return info.map(function (entry, index) {
            return { label: entry.label, actor: { kind: entry.actor.kind, id: entry.actor.id }, time: times[index] || null };
          });
        }
        return { undo: rows(cssInfo.undo, cssTimes.undo), redo: rows(cssInfo.redo, cssTimes.redo) };
      },
      actor: copyActor,
      setActor: function (actor) {
        state.actor = { kind: actor.kind, id: actor.id === undefined ? null : actor.id };
        return copyActor();
      },
      changed: changed,
      loading: function () { return loadingNow > 0; },
      refusal: makeRefusal,
      showRefusal: showRefusal,
      refusalResult: refusedResult,
      contentRev: function () { return Model.contentRev(state.css); }
    },
    /* 직접 조작: 누른 점에서 고를 차례({ nodes, tiers: { ink, near, box } }), 손잡이 틀 */
    pickAt: pickAt,
    handles: function () { return handles; },
    dragState: function () {
      return drag && { mode: drag.mode, moved: drag.moved, gain: drag.gain, tuned: drag.tuned, values: drag.values,
        turn: drag.turn === undefined ? null : drag.turn, factor: drag.factor === undefined ? null : drag.factor,
        tip: handleTip && !handleTip.hidden ? handleTip.textContent : "" };
    },
    /* 파생 글꼴(ADR-030 §8): 바탕 정보, 바탕 새 판 받기, 내보낼 글(통째로 풀기 반영), 같은 이름 저장을 막는 까닭 */
    derived: derivedInfo,
    rebase: rebaseDerived,
    outputCss: outputCss,
    sameNameBlock: sameNameBlock,
    /* 머리 막대(S2): 기본 제공 글꼴 열기(고친 것이 있으면 묻는다 — D12), 열기 하나(File), 저장 창구의 글꼴 목록('내 글꼴') */
    openShipped: requestShipped,
    openFile: openFile,
    storeList: storeList,
    canPickFiles: function () { return canPickFiles; },
    ready: function () { return Boolean(doc) && state.coreLoaded; },
    /* 할 일이 없는가 — 글꼴·핵심 시트가 실렸고, 검증이 끝났고(밀려 있으면 지금 청한다), 재료·디자인·늦게 싣는 모듈이 바쁘지 않다.
     * settled()와 mount 다리(bridge.js)가 같은 조건을 쓴다 */
    idle: function () { return idle(); },
    /* 지금 화면에 필요한 일이 끝났는가 — idle과 같되 밀린 검증은 청하지 않고 끝난 것으로 본다(자동화 계약 settled 사건) */
    quiet: function () { return idle(false); },
    settled: function () {
      return new Promise(function (resolve) {
        (function poll() {
          if (idle()) {
            resolve(true);
          } else {
            setTimeout(poll, 16);
          }
        })();
      });
    },
    /* 음절 안 겹침(마지막 검증) — 다른 페이지에서 밀린 검증은 청해 두니, 새 값은 settled() 뒤에 읽는다 */
    overlaps: function () {
      requestChecks();
      return lastOverlaps.slice();
    },
    /* 고치기 페이지 밖에서 검증을 미뤘는가(true면 settled()·overlaps()·고치기 페이지가 돌린다) */
    checksPending: function () { return root.dataset.checksReady !== "true"; },
    /* 폰트 계약 린트 결과(check_css_contract.js와 같은 문법): [{ severity, code, message, line, column }] */
    lint: function () { return lintFindings().slice(); },
    saveToFile: function () { return saveToHandle(); },
    /* 정밀 모드의 원문 칸(⚑6): applySource()는 칸의 글을 적용(구문 오류면 { ok: false, code: SOURCE_INVALID }), sourceDirty()는 적용 안 한
     * 원문이 있는가 */
    applySource: function () { return applySource(); },
    sourceDirty: function () { return sourceDirty(); },
    saveDraft: saveDraftNow,
    projectSnapshot: projectSnapshot,
    loadProject: loadProject,
    /* 글꼴 묶음과 저장 창구(S2 — 머리 막대의 '저장'·'열기'·'내보내기'가 부른다)
     * package({ history }) → 지금 글꼴 묶음 · save({ as, name, force }) → Promise<결과> · saveNeedsChoice() → 처음 저장에 물을 것 | null
     * openAny(File | 글 | 객체, { label }) → Promise<{ ok, kind, errors }> · store() → { kind, url, rev, saved, conflict } ·
     * reloadFromStore(id?) → Promise<{ ok, rev }> */
    package: function (options) { return packageSnapshot(options); },
    save: saveToStore,
    saveNeedsChoice: saveNeedsChoice,
    openAny: function (input, options) {
      var label = options && options.label ? String(options.label) : input && typeof input.name === "string" ? input.name : null;
      if (input && typeof input === "object" && typeof input.size === "number" && typeof input.slice === "function") {
        return readFile(input).then(function (text) { return openAnyText(text, label); }, function (error) {
          message((label || "파일") + "을 읽지 못했습니다: " + error.message, "error");
          return { ok: false, kind: "unknown", errors: [{ code: "OPEN_FAILED", path: "", message: error.message }] };
        });
      }
      if (typeof input === "string") {
        return openAnyText(input, label);
      }
      if (input && typeof input === "object") {
        return openAnyText(JSON.stringify(input), label);
      }
      return Promise.reject(new TypeError("FontStudio.openAny: expects a File, text or a JSON object"));
    },
    store: storeInfo,
    reloadFromStore: reloadFromStore,
    /* 확장 모듈용: 이벤트 구독, 폰트 교체·편집, 알림, 미리보기 시트, 현재 host */
    on: function (name, listener) { hooks[name].push(listener); },
    /* 늦게 싣는 무리가 실렸다 — font-studio-lazy.js만 부른다(module 사건) */
    moduleLoaded: function (name) { emit("module", name); },
    lastLoadOptions: function () { return lastLoad; },
    loadFontText: loadFontText,
    setCss: function (text, note) { return commit(text, note); },
    setHostVariables: setHostVariables,
    hostValue: hostValue,
    /* 글꼴 구조 변수(나누기·짓는 방식) — 고정 모양이면 tune 계층에 적고 읽는다(작업실 짓는 방식, ADR-034) */
    setStructureVariables: setStructureVariables,
    structureValue: structureValue,
    copyText: copyText,
    lastCopy: function () { return lastCopy; },
    message: message,
    draftSoon: function () { if (state.userEdited) { scheduleDraftSave(); } },
    markEdited: function () {
      state.userEdited = true;
      if (!loadingNow) {
        state.dirty = true;
      }
      scheduleDraftSave();
    },
    addOverlay: function (sheet) {
      if (overlays.indexOf(sheet) < 0) {
        overlays.push(sheet);
        adoptPreviewSheets();
      }
    },
    removeOverlay: function (sheet) {
      overlays = overlays.filter(function (entry) { return entry !== sheet; });
      adoptPreviewSheets();
    },
    forgetImage: forgetImage,
    cachedImages: function () { return Object.keys(imageCache); },
    rerender: renderPreview,
    /* 같은 글꼴 시트를 받는 미리보기 root 더하기(디자인 비교 칸) — chrome은 글꼴 시트 앞에 붙는 그 root 전용 시트 */
    addPreviewRoot: addPreviewRoot,
    removePreviewRoot: removePreviewRoot,
    coreHref: function () { return coreLink.href; },
    /* 미리보기 바탕 요소의 배치 모델(case-fixed · fixed-three · adaptive-square), 배치 프로파일을 쓰지 않으면 null */
    layoutModel: layoutModel,
    shadowRoot: shadow,
    host: host
  };
})();
