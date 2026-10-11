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
  var Lint = window.FontKkuLint || null; // site/font-kku-lint.js — the same lint as check_css_contract.js
  var FontKku = window.FontKku;
  var root = document.querySelector("[data-studio]");
  if (!root || !Model || !FontKku) {
    return;
  }

  var PROJECT_FORMAT = "font-kku-font-project";
  var PROJECT_VERSION = 2;
  var DRAFT_FORMAT = "font-kku-font-studio-draft";
  var DRAFT_KEY = "font-kku-font-studio-v2";
  var DRAFT_PENDING_KEY = "font-kku-font-studio-v2:pending";
  var SHIPPED_BASE = "lib/profiles/";
  var UNDO_LIMIT = 60;
  var LABELS = {
    top: "top", left: "left", size: "size", "scale-x": "scale-x", "scale-y": "scale-y",
    rotate: "rotate", weight: "weight", stroke: "stroke", clip: "clip", dilate: "dilate"
  };
  var LAYER_NAMES = { "font-kku.font": "font", "font-kku.jamo": "jamo", "font-kku.context": "context" };
  /* 값을 공급한 요소(모델의 supplier.scope)를 화면에 보일 때의 이름. "node"는 표시하지 않는다. */
  var SUPPLIER_SCOPE_LABELS = { host: "바탕 요소", glyph: "글자", ancestor: "상위 요소" };
  var PREVIEW_CHROME = [
    '[part~="jamo"] { cursor: pointer; }',
    ".studio-selected {",
    "  outline: 1.5px solid var(--demo-accent, #2447a8);",
    "  outline-offset: 1px;",
    "  background-color: var(--demo-accent-soft, rgba(36, 71, 168, 0.12));",
    "  cursor: grab;",
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
  var documentSheet = new CSSStyleSheet();
  var overlays = [];
  document.adoptedStyleSheets = document.adoptedStyleSheets.concat([documentSheet]);

  function coreStylesheetHref() {
    var link = Array.prototype.filter.call(document.querySelectorAll('link[rel~="stylesheet"]'), function (entry) {
      return /(^|\/)font-kku\.css(\?|#|$)/.test(entry.getAttribute("href") || "");
    })[0];
    return link ? link.href : new URL("lib/font-kku.css", document.baseURI).href;
  }

  function adoptPreviewSheets() {
    shadow.adoptedStyleSheets = [chromeSheet, fontSheet].concat(overlays);
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
    userEdited: false,
    coreLoaded: false
  };
  var history = Model.createHistory(UNDO_LIMIT);
  state.undo = history.undo;
  state.redo = history.redo;
  var doc = null;
  var hooks = { load: [], select: [], project: [], render: [] };

  /* 재료 탭(font-studio-material.js) 같은 확장이 붙는 지점. */
  function emit(name, payload) {
    hooks[name].forEach(function (listener) {
      listener(payload);
    });
  }

  // ── Small helpers ──────────────────────────────────────────────────────

  function message(text, tone) {
    var node = $("[data-studio-message]");
    node.textContent = text || "";
    node.dataset.tone = tone || "info";
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
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
    }
    state.css = nextCss;
    doc = nextDoc;
    if (opts.fresh) {
      state.original = nextCss;
      history.clear();
    }
    state.fontId = identity.id;
    state.fontName = identity.name;
    state.identity = identity.problems;
    applySheet();
    updateStatus(identity.meta);
    if (!opts.fresh) {
      state.userEdited = true;
      scheduleDraftSave();
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

  function renderPreview() {
    host.setAttribute("font", state.fontId || "untitled");
    FontKku.render(host, { text: textInput.value });
    FontKku.refreshAll(host);
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
    $("[data-studio-source]").value = state.css;
    $("[data-studio-undo]").disabled = history.undo.length === 0;
    $("[data-studio-redo]").disabled = history.redo.length === 0;
    root.dataset.fontId = state.fontId;
    renderDiagnostics();
  }

  /* The font lint (site/font-kku-lint.js, ADR-008 §9) on the current CSS:
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
    root.dataset.diagnostics = String(items.length);
    root.dataset.lintErrors = String(findings.filter(function (entry) { return entry.severity === "error"; }).length);
  }

  /* Before export/save: the file still goes out (the lint never blocks), but
   * the author is told it would fail check_css_contract.js. */
  function lintWarning(action) {
    var errors = lintErrorCount();
    if (!errors) {
      return "";
    }
    var first = lintFindings().filter(function (entry) { return entry.severity === "error"; })[0];
    return " ⚠ 글꼴 계약 검사 오류 " + errors + "건이 있는 채로 " + action + " — 첫 오류 L" + first.line + " [" + first.code + "] " +
      first.message.slice(0, 80) + (first.message.length > 80 ? "…" : "") + " (아래 경고 목록)";
  }

  /* Load-time note: syntax errors (recovered like a browser) and the number
   * of font lint errors (details in the diagnostics list). */
  function parseSummary() {
    var errors = doc.errors.filter(function (entry) { return entry.severity === "error"; });
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
      var kept = writeStorage(DRAFT_PENDING_KEY, unresolved.draft);
      if (!kept.ok) {
        draftStatus("복원하지 않은 초안을 보관할 공간이 없어 자동 저장을 멈췄습니다 — 초안을 복원하거나 버리세요", "error");
        return false;
      }
      unresolved.preserved = true;
      unresolved.key = DRAFT_PENDING_KEY;
      pendingDrafts = pendingDrafts.filter(function (entry) { return entry === unresolved || entry.key !== DRAFT_PENDING_KEY; });
      renderDraftBar();
    }
    var project = projectSnapshot();
    var draft = { format: DRAFT_FORMAT, version: 1, savedAt: new Date().toISOString(), project: project };
    var result = writeStorage(DRAFT_KEY, draft);
    var time = new Date().toLocaleTimeString();
    if (result.ok) {
      draftStatus("초안 저장됨 " + time);
      return true;
    }
    if (project.material && project.material.sheet) {
      var lean = JSON.parse(JSON.stringify(draft));
      delete lean.project.material.sheet;
      lean.project.material.sheetOmitted = true;
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
      material: project.material && project.material.sheet ? project.material : null
    });
    if (!loaded) {
      return false;
    }
    removeStorage(DRAFT_PENDING_KEY);
    pendingDrafts = [];
    renderDraftBar();
    state.userEdited = true;
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
  function loadFontText(css, extra) {
    var options = extra || {};
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
    emit("load", options);
    return true;
  }

  function loadFromUrl(url, label) {
    var absolute = new URL(url, document.baseURI).href;
    return Promise.all([readUrl(absolute), coreReady]).then(function (results) {
      if (loadFontText(results[0], { baseUrl: new URL(".", absolute).href })) {
        message((label || absolute) + "를 불러왔습니다." + parseSummary(), loadTone());
      }
    }, function () {
      message("브라우저가 " + absolute + " 읽기를 막았습니다. 'CSS 파일 열기'로 파일을 고르거나 정적 서버로 여세요.", "warn");
    });
  }

  function loadShipped(id) {
    return loadFromUrl(SHIPPED_BASE + id + ".css", id + ".css");
  }

  function openCssFile(file) {
    return readFile(file).then(function (text) {
      if (loadFontText(text, {})) {
        message(file.name + "을 열었습니다. 상대 경로 자산은 " + state.baseUrl + " 기준으로 해석합니다." + parseSummary(),
          loadTone());
      }
    }, function (error) {
      message(file.name + "을 읽지 못했습니다: " + error.message, "error");
    });
  }

  function openProject(file) {
    return readFile(file).then(function (text) {
      var project = JSON.parse(text);
      if (!project || project.format !== PROJECT_FORMAT || project.version !== PROJECT_VERSION ||
          !project.font || typeof project.font.css !== "string") {
        throw new Error("font-kku-font-project v2 파일이 아닙니다");
      }
      if (loadFontText(project.font.css, {
        baseUrl: project.font.baseUrl,
        previewText: project.preview && project.preview.text,
        material: project.material || null
      })) {
        message(file.name + " 프로젝트를 열었습니다." + parseSummary(), loadTone());
      }
    }).catch(function (error) {
      message(error.message, "error");
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
    return selection ? [selection.glyph, selection.pos, selection.jamo, state.scope, state.context].join("|") : "";
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
  function planFor(property, resolver, sourceDoc) {
    var plan = Model.editTarget(sourceDoc || doc, state.fontId, { pos: resolver.pos, jamo: resolver.jamo, resolver: resolver },
      property, state.scope, state.context, { shared: state.shared });
    if (plan && plan.blocked && plan.escalation && state.escalate === selectionKey()) {
      plan.escalation.escalatedFrom = plan;
      plan.escalation.scope = plan.scope;
      plan.escalation.property = property;
      return plan.escalation;
    }
    return plan;
  }

  function blockedMessage(plan) {
    var by = plan.blocked.by;
    var where = layerLabel(by.layer) + " L" + by.line + " " + shortSelector(by.selector);
    switch (plan.blocked.reason) {
      case "slot-override":
        return "이 자모의 자리 변수 " + by.variable + "(" + where + ")가 가족 값을 덮어, 자리 가족 편집이 이 자모에는 닿지 않습니다";
      case "node-override":
        return "선택한 자모는 " + where + " 규칙이 " + plan.variable + "를 직접 선언해, 자리 전체 편집이 이 자모에는 닿지 않습니다";
      case "higher-layer":
        return where + " 규칙(" + layerLabel(by.layer) + " 레이어)이 " + plan.variable + "를 덮어, " + layerLabel(plan.layer) +
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

  function renderTarget(node, resolver) {
    var panel = $("[data-studio-target]");
    panel.textContent = "";
    root.dataset.targetState = "";
    if (!node) {
      panel.hidden = true;
      return;
    }
    var plans = ["left", "top"].map(function (property) { return planFor(property, resolver); }).filter(Boolean);
    panel.hidden = false;
    if (!plans.length) {
      panel.textContent = "이 범위에서는 위치를 옮길 수 없습니다.";
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
    var blocked = plans.filter(function (plan) { return plan.blocked; })[0];
    var escalated = plans.filter(function (plan) { return plan.escalatedFrom; })[0];
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
    } else if (escalated) {
      root.dataset.targetState = "escalated";
      var back = document.createElement("button");
      back.type = "button";
      back.dataset.studioDeescalate = "";
      back.textContent = "원래 범위로";
      panel.appendChild(back);
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
  }

  function renderInspector(node) {
    var selection = $("[data-studio-selection]");
    var scopeField = $("[data-studio-scope]");
    var tbody = $("[data-studio-props] tbody");
    var rulesList = $("[data-studio-rules]");
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
    scopeField.disabled = false;
    selection.textContent = "";
    var title = document.createElement("strong");
    title.textContent = (glyph.dataset.source || "") + " · " + node.textContent;
    var meta = document.createElement("span");
    meta.textContent = "자리 " + pos + " · 역할 " + node.getAttribute("data-fy-role") + " · 깊이 " +
      host.dataset.fyVowelDepth + "/" + host.dataset.fyCodaDepth;
    selection.appendChild(title);
    selection.appendChild(meta);

    var family = Model.slotFamily(pos);
    var familyRadio = root.querySelector('input[name="scope"][value="family"]');
    familyRadio.disabled = !family;
    familyRadio.closest("label").hidden = !family;
    root.querySelector('[data-scope-label="family"]').textContent = family
      ? "자리 가족 " + family.parent + " (" + family.members.join("·") + ")"
      : "자리 가족";
    if (!family && state.scope === "family") {
      state.scope = "slot";
      root.querySelector('input[name="scope"][value="slot"]').checked = true;
    }
    root.querySelector('[data-scope-label="slot"]').textContent = "자리 전체 (" + pos + ")";
    root.querySelector('[data-scope-label="slotJamo"]').textContent = "이 자리의 이 자모 (" + pos + " · " + jamo + ")";
    root.querySelector('[data-scope-label="jamo"]').textContent = "이 자모 " + jamo + " (모든 자리, 보정)";
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
    contextSelect.disabled = state.scope !== "context" || options.length === 0;

    var resolver = resolverFor(node);
    var entries = resolver.entries();
    var computed = getComputedStyle(node);
    var mismatches = 0;
    entries.forEach(function (entry) {
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

  function propertyRow(entry, resolver, computed, node) {
    var row = document.createElement("tr");
    row.dataset.property = entry.property;
    var name = document.createElement("th");
    name.textContent = LABELS[entry.property] || entry.property;
    var valueCell = document.createElement("td");
    var input = document.createElement("input");
    input.type = "text";
    input.size = 9;
    var plan = planFor(entry.property, resolver);
    input.value = planValue(plan);
    input.placeholder = plan && !plan.existing && (state.scope === "jamo" || state.scope === "context") ? "0" : "";
    input.disabled = !plan;
    input.title = plan ? describeTarget(plan) + (plan.blocked && !plan.escalatedFrom ? "\n⚠ " + blockedMessage(plan) : "")
      : "이 범위에는 이 속성의 보정 변수가 없습니다";
    input.dataset.studioInput = entry.property;
    input.addEventListener("change", function () {
      applyInput(entry.property, input.value.trim());
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
    { label: "구조", names: ["--fy-expression-mode", "--fy-font-jamo-depth", "--fy-font-vowel-depth", "--fy-font-coda-depth"] },
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

  function renderGlobals() {
    var body = $("[data-studio-globals-body]");
    if (!doc || !$("[data-studio-globals]").open) {
      return;
    }
    body.textContent = "";
    GLOBAL_GROUPS.forEach(function (group) {
      var fieldset = document.createElement("fieldset");
      var legend = document.createElement("legend");
      legend.textContent = group.label;
      fieldset.appendChild(legend);
      group.names.forEach(function (name) {
        var winner = hostDeclaration(name);
        var label = document.createElement("label");
        var caption = document.createElement("span");
        caption.textContent = name.replace(/^--fy-/, "") + (winner ? " · L" + winner.line : "");
        var input = document.createElement("input");
        input.type = "text";
        input.value = winner ? winner.value : "";
        input.placeholder = "(미선언)";
        input.dataset.studioGlobal = name;
        input.addEventListener("change", function () {
          var target = winner
            ? { layer: winner.layer, selector: winner.selector, variable: name, rule: winner.rule, existing: winner.declaration }
            : { layer: "font-kku.font", selector: Model.fontScope(state.fontId), variable: name, rule: null };
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

  function commit(nextCss, note, tone) {
    if (!setCss(nextCss)) {
      return false;
    }
    if (note) {
      message(note, tone);
    }
    root.dataset.editEffect = "ok";
    return true;
  }

  function warnNoEffect(variable, expected, element) {
    var actual = getComputedStyle(element).getPropertyValue(variable).trim();
    var cause = "글꼴 밖 CSS(페이지 규칙·보존 블록)가 이 값을 덮음";
    if (element !== host) {
      var supplier = resolverFor(element).lookup(variable);
      if (supplier && Model.normalizeValue(supplier.value) !== Model.normalizeValue(expected)) {
        cause = layerLabel(supplier.layer) + " L" + supplier.line + " " + shortSelector(supplier.selector) + " 규칙이 이 값을 덮음";
      }
    }
    message("⚠ 편집이 반영되지 않았습니다: " + variable + " 실제 값 " + (actual || "(없음)") + " ≠ " + expected + " — " + cause, "warn");
    root.dataset.editEffect = "none";
  }

  /* After an edit, the selected node must see what was written. */
  function verifyEdits(applied) {
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

  function applyInput(property, value) {
    var node = selectedNode();
    if (!node) {
      return;
    }
    var plan = planFor(property, resolverFor(node));
    if (!plan) {
      return;
    }
    if (plan.blocked && !plan.escalatedFrom) {
      message("⚠ " + blockedMessage(plan) + ". '대신 … 규칙 고치기'를 누르거나 범위를 바꾸세요.", "warn");
      root.dataset.editEffect = "refused";
      restoreSelection();
      return;
    }
    if (value === "" && !plan.existing) {
      restoreSelection();
      return;
    }
    var next;
    try {
      next = Model.applyTarget(state.css, plan, value);
    } catch (error) {
      message("편집하지 못했습니다: " + error.message, "error");
      return;
    }
    commit(next, plan.variable + (value === "" ? " 선언을 지웠습니다" : " = " + value) + " · " + describeTarget(plan) +
      (plan.shared ? " (공유: " + plan.shared.text + ")" : ""));
    if (value !== "") {
      verifyEdits([{ plan: plan, value: value }]);
    }
  }

  /* Move the selected node by (dxPct, dyPct) of the glyph box at the current
   * scope: the target value (or the value the node sees now, for a new
   * rule) plus the delta. em terms stay; the % term changes (calc()). */
  function nudge(dxPct, dyPct) {
    var node = selectedNode();
    if (!node) {
      return false;
    }
    var text = state.css;
    var workDoc = doc;
    var applied = [];
    var failed = null;
    [["left", dxPct], ["top", dyPct]].forEach(function (pair) {
      if (!pair[1] || failed) {
        return;
      }
      var plan = planFor(pair[0], resolverFor(node, workDoc), workDoc);
      if (!plan) {
        failed = "이 범위에서는 위치를 옮길 수 없습니다";
        return;
      }
      if (plan.blocked && !plan.escalatedFrom) {
        failed = "⚠ " + blockedMessage(plan) + ". '대신 … 규칙 고치기'를 누르거나 범위를 바꾸세요.";
        return;
      }
      var current = planValue(plan);
      var next = Model.offsetAdd(current, pair[1], "%");
      if (next === null) {
        failed = plan.variable + " 값(" + current + ")은 길이의 합이 아니라 드래그로 옮길 수 없습니다. 값 칸에서 직접 고치세요";
        return;
      }
      try {
        text = Model.applyTarget(text, plan, next);
      } catch (error) {
        failed = "편집하지 못했습니다: " + error.message;
        return;
      }
      workDoc = Model.parse(text);
      applied.push({ plan: plan, value: next });
    });
    if (failed) {
      message(failed, "warn");
      root.dataset.editEffect = "refused";
      return false;
    }
    commit(text, applied.map(function (entry) {
      return entry.plan.variable + " = " + entry.value;
    }).join(", ") + " · " + describeTarget(applied[0].plan) + (applied[0].plan.shared ? " (공유: " + applied[0].plan.shared.text + ")" : ""));
    return verifyEdits(applied);
  }

  // ── Checks (ADR-009 §5 1단계: 잉크 상자 기반) ─────────────────────────

  var measureContext = document.createElement("canvas").getContext("2d");
  var checkTimer = null;

  function scheduleChecks() {
    root.dataset.checksReady = "false";
    clearTimeout(checkTimer);
    checkTimer = setTimeout(runChecks, 120);
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
    var style = getComputedStyle(node);
    var rect = node.getBoundingClientRect();
    if (style.backgroundImage && style.backgroundImage !== "none") {
      return { x0: rect.left, x1: rect.right, y0: rect.top, y1: rect.bottom };
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

  // ── Checks 2단계: 음절 내부 잉크 겹침 (glyph_overlap_audit.py와 같은 판정) ──

  var OVERLAP_LIMIT = 0.15;
  var imageCache = {};

  function cachedImage(url) {
    if (!imageCache[url]) {
      imageCache[url] = new Promise(function (resolve) {
        var image = new Image();
        image.onload = function () { resolve(image); };
        image.onerror = function () { resolve(null); };
        image.src = url;
      });
    }
    return imageCache[url];
  }

  function forgetImage(url) {
    delete imageCache[url];
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
    context.setTransform(scale * rect.width / width, 0, 0, scale * rect.height / height,
      scale * (rect.left - region.left), scale * (rect.top - region.top));
    var clip = insetBox(style.clipPath, width, height);
    context.beginPath();
    context.rect(clip.x, clip.y, clip.w, clip.h);
    context.clip();
    var sprite = /url\("?([^")]+)"?\)/.exec(style.backgroundImage || "");
    var paint;
    if (sprite && style.backgroundImage !== "none") {
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

  function runChecks() {
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
            " — 이웃 음절과 잉크 상자가 " + Math.round(overlapX) + "px 겹침" });
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
      root.dataset.checksReady = "true";
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────

  var drag = null;

  function eventNode(event) {
    var path = event.composedPath ? event.composedPath() : [event.target];
    for (var index = 0; index < path.length; index += 1) {
      var entry = path[index];
      if (entry && entry.nodeType === 1 && entry.matches && entry.matches('[part~="jamo"]')) {
        return host.contains(entry) ? entry : null;
      }
      if (entry === host) {
        return null;
      }
    }
    return null;
  }

  preview.addEventListener("pointerdown", function (event) {
    var node = eventNode(event);
    if (!node) {
      return;
    }
    preview.focus({ preventScroll: true });
    select(node);
    var glyph = node.closest('[part="glyph"]').getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, width: glyph.width, height: glyph.height, moved: false };
    history.begin(state.css);
    preview.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  preview.addEventListener("pointermove", function (event) {
    if (!drag) {
      return;
    }
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = true;
    nudge(dx / drag.width * 100, dy / drag.height * 100);
  });

  /* 드래그 한 번(누름→뗌)은 되돌리기 한 단계다. */
  function endDrag() {
    if (!drag) {
      return;
    }
    drag = null;
    history.end(state.css);
    updateStatus();
  }

  preview.addEventListener("pointerup", endDrag);
  preview.addEventListener("pointercancel", endDrag);
  preview.addEventListener("lostpointercapture", endDrag);

  document.addEventListener("keydown", function (event) {
    if (!state.selection || event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) {
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
      state.scope = event.target.value;
      state.escalate = null;
      restoreSelection();
    } else if (event.target.name === "shared") {
      state.shared = event.target.value === "split" ? "split" : "edit";
      restoreSelection();
    }
  });

  root.addEventListener("click", function (event) {
    if (event.target.closest("[data-studio-escalate]")) {
      state.escalate = selectionKey();
      restoreSelection();
      preview.focus({ preventScroll: true });
    } else if (event.target.closest("[data-studio-deescalate]")) {
      state.escalate = null;
      restoreSelection();
      preview.focus({ preventScroll: true });
    } else if (event.target.closest("[data-studio-restore-draft]")) {
      restoreDraft(Number(event.target.closest("[data-studio-restore-draft]").dataset.studioRestoreDraft));
    } else if (event.target.closest("[data-studio-discard-draft]")) {
      discardDrafts();
    }
  });

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

  $("[data-studio-load]").addEventListener("click", function () {
    loadShipped($("[data-studio-shipped]").value);
  });

  $("[data-studio-open-css]").addEventListener("change", function (event) {
    if (event.target.files[0]) {
      openCssFile(event.target.files[0]);
    }
  });

  $("[data-studio-open-project]").addEventListener("change", function (event) {
    if (event.target.files[0]) {
      openProject(event.target.files[0]);
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
    var next = Model.renameFont(state.css, from, name);
    if (state.fontName && state.fontName !== from) {
      next = Model.renameFont(next, state.fontName, name);
    }
    if (!setCss(next)) {
      return false;
    }
    state.original = state.css;
    state.fileHandle = null;
    updateStatus();
    message(from + "에서 새 글꼴 " + name + "을 시작했습니다" + normalized + ". 내보내면 " + name + ".css가 됩니다" +
      (canPickFiles ? " — '파일에 저장'은 새 파일을 고릅니다." : "."));
    return true;
  }

  $("[data-studio-rename]").addEventListener("click", function () {
    renameTo($("[data-studio-new-name]").value.trim());
  });

  function undo() {
    var previous = history.back(state.css);
    if (previous !== null) {
      setCss(previous, { fromHistory: true });
    }
  }

  function redo() {
    var next = history.forward(state.css);
    if (next !== null) {
      setCss(next, { fromHistory: true });
    }
  }

  $("[data-studio-undo]").addEventListener("click", undo);
  $("[data-studio-redo]").addEventListener("click", redo);

  $("[data-studio-export-css]").addEventListener("click", function () {
    var warning = lintWarning("내보냈습니다");
    download(state.fontName + ".css", state.css, "text/css");
    message(state.fontName + ".css를 내보냈습니다." + warning, warning ? "warn" : "info");
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
    var warning = lintWarning("복사했습니다");
    copyText(state.css).then(function (copied) {
      if (copied) {
        message(state.fontName + ".css를 클립보드에 복사했습니다." + warning, warning ? "warn" : "info");
        return;
      }
      var source = $("[data-studio-source]");
      source.closest("details").open = true;
      source.focus();
      source.select();
      message("브라우저가 클립보드 쓰기를 막았습니다 — 아래 '글꼴 CSS 원문'을 선택해 두었으니 직접 복사하세요.", "warn");
    });
  });

  // ── File System Access (지원 브라우저만; 그 밖에는 다운로드) ────────────

  var canPickFiles = typeof window.showSaveFilePicker === "function";

  function cssPickerOptions() {
    return { types: [{ description: "font CSS", accept: { "text/css": [".css"] } }] };
  }

  function saveToHandle() {
    var pick = state.fileHandle
      ? Promise.resolve(state.fileHandle)
      : window.showSaveFilePicker(Object.assign({ suggestedName: state.fontName + ".css" }, cssPickerOptions()));
    return pick.then(function (handle) {
      state.fileHandle = handle;
      var warning = lintWarning("저장했습니다");
      return handle.createWritable().then(function (writable) {
        return writable.write(state.css).then(function () { return writable.close(); });
      }).then(function () {
        state.original = state.css;
        updateStatus();
        message((handle.name || state.fontName + ".css") + "에 저장했습니다." + warning, warning ? "warn" : "info");
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
  $("[data-studio-open-handle]").addEventListener("click", openWithHandle);

  function projectSnapshot() {
    var project = {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      font: { id: state.fontName, css: state.css, baseUrl: state.baseUrl },
      preview: { text: textInput.value }
    };
    emit("project", project);
    return project;
  }

  $("[data-studio-export-project]").addEventListener("click", function () {
    var warning = lintWarning("프로젝트를 저장했습니다");
    download(state.fontName + ".font-kku.json", JSON.stringify(projectSnapshot(), null, 2) + "\n", "application/json");
    message(state.fontName + ".font-kku.json을 저장했습니다." + warning, warning ? "warn" : "info");
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

  var params = new URLSearchParams(location.search);
  var requested = params.get("font");
  if (requested) {
    $("[data-studio-shipped]").value = requested;
  }
  if (params.get("src")) {
    loadFromUrl(params.get("src"));
  } else {
    loadShipped($("[data-studio-shipped]").value);
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
      var radio = root.querySelector('input[name="scope"][value="' + scope + '"]');
      radio.checked = true;
      state.scope = scope;
      state.escalate = null;
      restoreSelection();
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
      return node ? planFor(property, resolverFor(node)) : null;
    },
    setValue: applyInput,
    undo: undo,
    redo: redo,
    rename: renameTo,
    ready: function () { return Boolean(doc) && state.coreLoaded; },
    settled: function () {
      return new Promise(function (resolve) {
        (function poll() {
          var material = window.FontStudio.material;
          if (doc && state.coreLoaded && root.dataset.checksReady === "true" && !(material && material.busy && material.busy())) {
            resolve(true);
          } else {
            setTimeout(poll, 16);
          }
        })();
      });
    },
    overlaps: function () { return lastOverlaps.slice(); },
    /* 폰트 계약 린트 결과(check_css_contract.js와 같은 문법): [{ severity, code, message, line, column }] */
    lint: function () { return lintFindings().slice(); },
    saveToFile: function () { return saveToHandle(); },
    saveDraft: saveDraftNow,
    projectSnapshot: projectSnapshot,
    /* 확장 모듈용: 이벤트 구독, 폰트 교체·편집, 알림, 미리보기 시트, 현재 host */
    on: function (name, listener) { hooks[name].push(listener); },
    loadFontText: loadFontText,
    setCss: function (text, note) { return commit(text, note); },
    setHostVariables: setHostVariables,
    hostValue: hostValue,
    copyText: copyText,
    lastCopy: function () { return lastCopy; },
    message: message,
    draftSoon: function () { if (state.userEdited) { scheduleDraftSave(); } },
    markEdited: function () { state.userEdited = true; scheduleDraftSave(); },
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
    shadowRoot: shadow,
    host: host
  };
})();
