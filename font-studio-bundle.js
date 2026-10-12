/* font-studio-bundle.js — 디자인 묶음 저장·열기·사전 검사 (설계 v1.2 §13.6·§17.3·§18.1, PLAN-HANGUL-001 F8)
 *
 * 디자인 칸 파일 줄의 [data-studio-f=bundle]. 묶음(font-kku-design-bundle v1, site/font-studio-bundle-model.js)은 디자인 JSON과 그
 * 디자인이 쓰는 작업실 그림(그림 참가자 drawings)을 한 파일(<id>.fkk-bundle.json)에 싣는다 — 디자인 JSON만으로는 작업실이 그린
 * 세트(studio-draw-<8hex>)를 다시 그릴 수 없어서다. 글꼴 파일은 싣지 않는다(§17.3).
 *
 * - 저장([data-bundle-save]): 지금 디자인(마지막 정상 디자인) + 그린 칸이 있는 그림 문서 + 런타임 판·배치 revision + 사전 검사
 * - 열기([data-bundle-open], FontStudio.bundle.open): 읽기·검사(파일 크기·허용 목록·그림 다시 검사·validateDesign)를 모두 통과한 뒤
 *   이름 겹침을 풀고 design.edit('묶음 열기') 한 번 — 그림 참가자(세트 등록)가 디자인보다 먼저 들어간다. 어디서든 걸리면 디자인·
 *   그림·편집 기록은 그대로이고 까닭을 칸 안 목록([data-bundle-errors])에 보인다(반만 들어가지 않는다)
 * - 사전 검사([data-bundle-preflight] li[data-code][data-severity]): 역할 쌍 67개(초 19·중 21·종 27)를 지금 디자인으로 planJamo하고
 *   글꼴 재료는 비교 칸의 identity를 센다. 펼쳤을 때·저장·열기 때만 잰다
 * - 페이지용 코드(그림 포함, 실험)·그림 세트 .jamo.js 내보내기
 *
 * 맨 작업실에서 칸은 파일 줄 끝에 한 묶음(저장·열기·접힌 사전 검사)으로 보이고, 초안·기록을 쓰지 않는다.
 * 하지 않는 것(선택 항목): TTF 내보내기, 주소(#) 공유.
 *
 * FontStudio.bundle = { build, save, open, preflight, snippet, jamoJs, exportJamo, copySnippet, last, busy }
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var Bundle = window.FontStudioBundleModel;
  var Draw = window.FontStudioDrawModel;
  var Design = window.FontStudioDesign;
  var FontKku = window.FontKku;
  if (!Studio || !Bundle || !Draw || !Design || !FontKku || !Studio.f || !Studio.design || typeof Studio.design.edit !== "function" ||
      typeof FontKku.planJamo !== "function" || typeof FontKku.registerDesign !== "function") {
    return;
  }

  var design = Studio.design;
  var LABEL = "묶음 열기";
  var MAX_SHOWN_ERRORS = 20;
  var SEVERITY_TEXT = { error: "오류", warning: "경고", info: "알림" };
  var ERROR_TEXT = {
    BUNDLE_TOO_LARGE: "파일이 너무 큽니다",
    BUNDLE_JSON: "JSON 문법 오류",
    BUNDLE_FORMAT: "묶음 파일이 아닙니다",
    BUNDLE_VERSION: "모르는 묶음 판입니다",
    BUNDLE_UNKNOWN_KEY: "묶음에 없는 칸 — 글꼴 파일 같은 데이터는 싣지 않습니다",
    BUNDLE_UNSAFE_TEXT: "받지 않는 글(꼬리표·url()·스크립트 주소·data: URI·@font-face)",
    BUNDLE_TOO_DEEP: "너무 깊게 겹친 값",
    BUNDLE_DESIGN: "디자인 JSON이 없습니다",
    BUNDLE_DRAWINGS: "그림 목록이 잘못되었습니다",
    BUNDLE_DRAWING: "그림 칸이 문법·상한을 넘습니다",
    BUNDLE_RUNTIME: "런타임 정보가 잘못되었습니다",
    BUNDLE_PREFLIGHT: "사전 검사 값이 잘못되었습니다",
    STUDIO_DRAW_UNAVAILABLE: "이 작업실에 그리기 모듈이 없습니다"
  };

  var section = null;
  var els = {};
  var opening = 0;
  var checkTimer = null;
  var lastPreflight = null;
  var lastOpen = null;
  /* 마지막으로 연 묶음 — 지금 디자인이 그 디자인이면 사전 검사가 묶음을 만든 런타임의 배치 revision과 견준다 */
  var opened = null;

  function clone(value) {
    return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
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

  function button(text, attribute) {
    var node = make("button", "", text);
    node.type = "button";
    node.setAttribute(attribute, "");
    return node;
  }

  function note(text, tone) {
    els.message.textContent = text || "";
    els.message.dataset.tone = tone || "info";
    els.message.hidden = !text;
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

  // ── 지금 상태 ───────────────────────────────────────────────────────

  /* 그린 칸이 있는 그림 문서(참가자 drawings) — 없으면 null */
  function currentDrawing() {
    var states = design.participants();
    var doc = states && states.drawings ? states.drawings : null;
    return doc && Draw.isDoc(doc) && !Draw.isEmpty(doc) ? doc : null;
  }

  function shippedSets() {
    return (Design.SVG_SETS || []).map(function (entry) { return entry.id; });
  }

  /* 등록된 세트 { 이름: cellsRevision | null(내용 모름) } — 지금 그림 문서의 세트만 내용을 안다 */
  function registeredSets() {
    var map = {};
    (typeof FontKku.jamoSets === "function" ? FontKku.jamoSets() : []).forEach(function (name) {
      map[name] = null;
    });
    var doc = currentDrawing();
    if (doc && Object.prototype.hasOwnProperty.call(map, doc.set)) {
      map[doc.set] = Draw.cellsRevision(doc);
    }
    return map;
  }

  function hasFontSource(json) {
    var sources = json && json.sources || {};
    return Object.keys(sources).some(function (id) { return sources[id] && sources[id].kind === "font"; });
  }

  // ── 사전 검사 ───────────────────────────────────────────────────────

  function computePreflight() {
    var json = design.json();
    var doc = currentDrawing();
    var name = design.name();
    var sameAsOpened = opened && Design.stableJson(opened.design) === Design.stableJson(json);
    return Bundle.preflight({
      design: json,
      plans: name ? Bundle.collectPlans(FontKku, name) : [],
      identity: hasFontSource(json) ? design.identity() : null,
      drawings: doc ? [doc] : [],
      shippedSets: shippedSets(),
      profiles: FontKku.layoutProfiles,
      runtimeLayouts: sameAsOpened && opened.runtime ? opened.runtime.layouts : null
    });
  }

  function summaryText(result) {
    var counts = Bundle.summary(result);
    var parts = [counts.reproducible ? "다른 페이지에서 그대로 그림" : "그대로 다시 그릴 수 없음"];
    ["error", "warning", "info"].forEach(function (severity) {
      if (counts[severity]) {
        parts.push(SEVERITY_TEXT[severity] + " " + counts[severity]);
      }
    });
    return parts.join(" · ");
  }

  function renderPreflight(result) {
    lastPreflight = result;
    var list = els.preflight;
    list.textContent = "";
    result.items.forEach(function (item) {
      var row = make("li");
      row.dataset.code = item.code;
      row.dataset.severity = item.severity;
      if (item.jamo) {
        row.dataset.jamo = item.jamo;
      }
      if (item.role) {
        row.dataset.role = item.role;
      }
      row.appendChild(make("span", "studio-bundle-severity", SEVERITY_TEXT[item.severity] || item.severity));
      row.appendChild(make("strong", "", Bundle.CODES[item.code] ? Bundle.CODES[item.code].text : item.code));
      if (item.jamo) {
        row.appendChild(make("span", "studio-bundle-jamo", item.jamo + (item.role ? " " + Bundle.ROLE_TEXT[item.role] : "")));
      }
      row.appendChild(make("span", "studio-bundle-detail", item.detail));
      list.appendChild(row);
    });
    if (!result.items.length) {
      list.appendChild(make("li", "studio-bundle-empty", "걸리는 것이 없습니다 — 원소 재료만 씁니다."));
    }
    els.summary.textContent = summaryText(result);
    els.summary.dataset.reproducible = String(result.reproducible);
    section.dataset.bundleReproducible = String(result.reproducible);
    return result;
  }

  function preflight() {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    return clone(renderPreflight(computePreflight()));
  }

  /* 펼쳐 둔 동안 디자인이 바뀌면 다시 잰다(한 번에 모아서) */
  function schedulePreflight() {
    if (!els.details.open || checkTimer) {
      return;
    }
    checkTimer = setTimeout(function () {
      checkTimer = null;
      renderPreflight(computePreflight());
    }, 0);
  }

  // ── 저장 ───────────────────────────────────────────────────────────

  function build() {
    var doc = currentDrawing();
    var checks = renderPreflight(computePreflight());
    return Bundle.build({ design: design.json(), drawings: doc ? [doc] : [], runtimeInfo: Bundle.runtimeInfo(FontKku), preflight: checks });
  }

  function save() {
    var bundle = build();
    var text = Bundle.serialize(bundle);
    var name = Bundle.fileName(bundle);
    download(name, text, "application/json");
    var invalid = design.status() === "invalid";
    note(name + "을 저장했습니다 — " + summaryText(bundle.preflight) + (bundle.drawings.length ? " · 그림 세트 " + bundle.drawings[0].set +
      "(칸 " + Draw.cellKeys(bundle.drawings[0]).length + "개)" : "") + (invalid ? " · ⚠ 적용 실패 상태라 마지막 정상 디자인을 실었습니다" : ""),
      invalid ? "warn" : "info");
    return { name: name, text: text, bundle: bundle };
  }

  // ── 열기 ───────────────────────────────────────────────────────────

  /* 오류 한 줄의 한국어 설명 — 디자인 검사 코드는 디자인 패널 것(Design.describeError), 묶음 코드는 여기 것 */
  function errorText(entry) {
    return entry.text || ERROR_TEXT[entry.code] || "";
  }

  function errorLine(error) {
    var entry = Design.describeError(error);
    var text = errorText(entry);
    return (entry.code ? "[" + entry.code + "] " : "") + (entry.path ? entry.path + " " : "") + (text ? text + " — " : "") + entry.message;
  }

  function renderErrors(errors) {
    var list = els.errors;
    list.textContent = "";
    errors.slice(0, MAX_SHOWN_ERRORS).forEach(function (error) {
      var entry = Design.describeError(error);
      var row = make("li");
      row.dataset.severity = "error";
      if (entry.code) {
        row.dataset.code = entry.code;
        row.appendChild(make("code", "", entry.code));
        row.appendChild(document.createTextNode(" "));
      }
      if (entry.path) {
        row.dataset.path = entry.path;
        row.appendChild(make("span", "studio-bundle-path", entry.path));
        row.appendChild(document.createTextNode(" "));
      }
      var text = errorText(entry);
      row.appendChild(make("span", "studio-bundle-detail", (text ? text + " — " : "") + entry.message));
      list.appendChild(row);
    });
    if (errors.length > MAX_SHOWN_ERRORS) {
      list.appendChild(make("li", "studio-bundle-more-errors", "+" + (errors.length - MAX_SHOWN_ERRORS) + "건 더"));
    }
    list.dataset.count = String(errors.length);
    list.hidden = errors.length === 0;
  }

  function refuse(errors, fileLabel) {
    renderErrors(errors);
    note("⚠ " + (fileLabel ? fileLabel + " — " : "") + "묶음을 열지 않았습니다" + (errors.length > 1 ? "(오류 " + errors.length + "건)" : "") +
      " — 디자인·그림·편집 기록은 그대로입니다: " + errorLine(errors[0]), "error");
    lastOpen = { ok: false, errors: clone(errors), renamed: [], file: fileLabel || null };
    return { ok: false, errors: clone(errors), renamed: [], design: design.json(), preflight: null };
  }

  /* 묶음 하나를 연다: 읽기·검사를 모두 통과한 뒤에만 편집 하나('묶음 열기') — 그림 참가자가 디자인보다 먼저 들어간다 */
  function openNow(input, fileLabel) {
    var parsed = Bundle.parseBundle(input, { runtime: FontKku });
    if (!parsed.ok) {
      return refuse(parsed.errors, fileLabel);
    }
    var bundle = parsed.bundle;
    if (bundle.drawings.length > 1) {
      return refuse([{ code: "BUNDLE_DRAWINGS", path: "drawings", message: "this studio opens one drawing per bundle (got " + bundle.drawings.length + ")" }], fileLabel);
    }
    var hasDrawing = bundle.drawings.length === 1;
    if (hasDrawing && !(Studio.draw && typeof Studio.draw.attach === "function")) {
      return refuse([{ code: "STUDIO_DRAW_UNAVAILABLE", path: "drawings", message: "the drawing module (font-studio-draw.js) is not loaded" }], fileLabel);
    }
    var resolved = Bundle.resolveNames(bundle, registeredSets(), { reserved: Bundle.RESERVED_SETS });
    var json = resolved.bundle.design;
    var check = design.validate(json);
    if (!check.ok) {
      return refuse(check.errors.map(function (error) {
        return { code: error.code, path: "design" + (error.path ? "." + error.path : ""), message: error.message };
      }), fileLabel);
    }
    var participants = {};
    if (hasDrawing) {
      Studio.draw.attach();
      participants.drawings = resolved.bundle.drawings[0];
    } else if (currentDrawing()) {
      participants.drawings = null; // 그림 없는 묶음 — 지금 그림을 비운다(되돌리면 돌아온다)
    }
    var drawing = hasDrawing ? resolved.bundle.drawings[0] : null;
    var text = (fileLabel ? fileLabel + " — " : "") + "묶음을 열었습니다" +
      (drawing ? " · 그림 세트 " + drawing.set + "(칸 " + Draw.cellKeys(drawing).length + "개)" : "") +
      (resolved.renamed.length ? " · 이름이 겹쳐 " + resolved.renamed.map(function (entry) { return entry.from + " → " + entry.to; }).join(", ") + "로" : "");
    return design.edit(LABEL, function () { return json; }, { participants: participants, note: text }).then(function (result) {
      if (!result.ok) {
        return refuse(result.errors && result.errors.length ? result.errors
          : [{ code: "STUDIO_EDIT_FAILED", path: "design", message: result.cancelled ? "the edit was cancelled" : "the design did not apply" }], fileLabel);
      }
      opened = { design: clone(json), runtime: clone(resolved.bundle.runtime || null) };
      renderErrors([]);
      var checks = renderPreflight(computePreflight());
      note(text + " — " + summaryText(checks), checks.reproducible ? "info" : "warn");
      lastOpen = { ok: true, errors: [], renamed: clone(resolved.renamed), file: fileLabel || null };
      return { ok: true, errors: [], renamed: clone(resolved.renamed), design: result.design, preflight: clone(checks) };
    });
  }

  /* open(글 | 객체, 파일 이름?) → Promise<{ ok, errors, renamed, design, preflight }> */
  function open(input, fileLabel) {
    opening += 1;
    var running;
    try {
      running = Promise.resolve(openNow(input, fileLabel));
    } catch (error) {
      running = Promise.resolve(refuse([{ code: "BUNDLE_OPEN_FAILED", path: "", message: String(error && error.message || error) }], fileLabel));
    }
    return running.then(function (result) {
      opening -= 1;
      return result;
    }, function (error) {
      opening -= 1;
      return refuse([{ code: "BUNDLE_OPEN_FAILED", path: "", message: String(error && error.message || error) }], fileLabel);
    });
  }

  function openFile(file) {
    if (file.size > Bundle.LIMITS.maxBytes) {
      refuse([{ code: "BUNDLE_TOO_LARGE", path: "", message: "the file is " + file.size + " bytes (limit " + Bundle.LIMITS.maxBytes + ")" }], file.name);
      return;
    }
    opening += 1; // 읽는 동안도 settled()가 기다린다
    var reader = new FileReader();
    reader.onload = function () {
      opening -= 1;
      open(String(reader.result), file.name);
    };
    reader.onerror = function () {
      opening -= 1;
      refuse([{ code: "BUNDLE_READ", path: "", message: "the file could not be read" }], file.name);
    };
    reader.readAsText(file);
  }

  // ── 내보내기 ───────────────────────────────────────────────────────

  function snippet() {
    return Bundle.snippet(design.json(), currentDrawing());
  }

  function jamoJs() {
    var doc = currentDrawing();
    return doc ? Bundle.jamoJs(doc) : null;
  }

  function exportJamo() {
    var doc = currentDrawing();
    if (!doc) {
      note("그린 칸이 없어 내보낼 그림 세트가 없습니다 — 그리기 8 → 24 → 40에서 그리세요.", "warn");
      return null;
    }
    var name = doc.set + ".jamo.js";
    var text = Bundle.jamoJs(doc);
    download(name, text, "text/javascript");
    note(name + "을 내보냈습니다 — font-kku.js 앞이나 뒤에 <script>로 싣고 디자인 소스에 assetSet: \"" + doc.set + "\"", "info");
    return { name: name, text: text };
  }

  function copySnippet() {
    var text = snippet();
    return Studio.copyText(text).then(function (copied) {
      note(copied ? "페이지용 코드(그림 포함, 실험 API)를 클립보드에 복사했습니다." : "브라우저가 클립보드 쓰기를 막았습니다 — FontStudio.bundle.snippet()으로 받으세요.",
        copied ? "info" : "warn");
      return { copied: copied, text: text };
    });
  }

  // ── 화면 ───────────────────────────────────────────────────────────

  function syncButtons() {
    if (els.exportJamo) {
      var doc = currentDrawing();
      els.exportJamo.disabled = !doc;
      els.exportJamo.title = doc ? doc.set + ".jamo.js" : "그린 칸이 없습니다";
    }
  }

  function buildPanel() {
    section.classList.add("studio-bundle");
    section.setAttribute("aria-label", "디자인 묶음 파일 — 디자인 JSON과 그림 한 파일");

    var title = make("span", "studio-bundle-title", "묶음");
    title.title = "디자인 JSON + 작업실 그림을 한 파일(.fkk-bundle.json)로 — 글꼴 파일은 싣지 않습니다";
    els.save = button("묶음 저장", "data-bundle-save");
    var openLabel = make("label", "studio-file studio-bundle-open");
    openLabel.appendChild(make("span", "", "묶음 열기"));
    els.open = make("input");
    els.open.type = "file";
    els.open.accept = ".json,application/json";
    els.open.setAttribute("data-bundle-open", "");
    openLabel.appendChild(els.open);

    els.details = make("details", "studio-bundle-more");
    els.details.setAttribute("data-bundle-details", "");
    var summary = make("summary", "studio-bundle-summary");
    summary.appendChild(make("span", "", "사전 검사·페이지 코드"));
    els.summary = make("span", "studio-bundle-status"); // output이면 summary를 눌러도 펼쳐지지 않는다(Chromium)
    els.summary.setAttribute("data-bundle-summary", "");
    summary.appendChild(els.summary);
    els.details.appendChild(summary);

    var body = make("div", "studio-bundle-body");
    var help = make("p", "studio-bundle-help");
    help.textContent = "묶음 = 디자인 JSON + 작업실 그림(그린 칸) 한 파일. 글꼴 파일은 싣지 않습니다 — 글꼴 재료는 이름만 적고, " +
      "다른 기기에서는 다른 글꼴로 그려질 수 있습니다. 사전 검사는 역할 쌍 67개(초성 19·중성 21·종성 27)를 지금 디자인으로 풉니다.";
    body.appendChild(help);
    els.preflight = make("ul", "studio-bundle-preflight");
    els.preflight.setAttribute("data-bundle-preflight", "");
    els.preflight.setAttribute("aria-label", "묶음 사전 검사");
    body.appendChild(els.preflight);
    var buttons = make("div", "studio-bundle-buttons");
    buttons.appendChild(button("다시 검사", "data-bundle-check"));
    els.copySnippet = button("페이지용 코드(그림 포함) 복사", "data-bundle-copy-snippet");
    buttons.appendChild(els.copySnippet);
    els.exportJamo = button("그림 세트 .jamo.js 내보내기", "data-bundle-export-jamo");
    buttons.appendChild(els.exportJamo);
    body.appendChild(buttons);
    els.details.appendChild(body);

    els.message = make("p", "studio-bundle-message");
    els.message.setAttribute("data-bundle-message", "");
    els.message.setAttribute("role", "status");
    els.message.hidden = true;
    els.errors = make("ul", "studio-bundle-errors");
    els.errors.setAttribute("data-bundle-errors", "");
    els.errors.setAttribute("aria-label", "묶음을 열지 못한 까닭");
    els.errors.hidden = true;

    [title, els.save, openLabel, els.details, els.message, els.errors].forEach(function (node) {
      section.appendChild(node);
    });

    section.addEventListener("click", function (event) {
      var target = event.target;
      if (target.closest("[data-bundle-save]")) {
        save();
      } else if (target.closest("[data-bundle-check]")) {
        preflight();
      } else if (target.closest("[data-bundle-copy-snippet]")) {
        copySnippet();
      } else if (target.closest("[data-bundle-export-jamo]")) {
        exportJamo();
      }
    });
    els.open.addEventListener("change", function () {
      var file = els.open.files && els.open.files[0];
      if (file) {
        openFile(file);
      }
      els.open.value = "";
    });
    els.details.addEventListener("toggle", function () {
      if (els.details.open) {
        preflight();
      }
    });
    syncButtons();
  }

  function busy() {
    return opening > 0 || Boolean(checkTimer);
  }

  section = Studio.f.mount("bundle", { label: "묶음", tab: false });
  buildPanel();
  design.addBusy(busy);
  design.on("change", function () {
    syncButtons();
    schedulePreflight();
  });

  Studio.bundle = {
    /* 지금 상태의 묶음 객체(사전 검사를 새로 재서 싣는다) */
    build: build,
    /* <id>.fkk-bundle.json 내려받기 → { name, text, bundle } */
    save: save,
    /* (글 | 객체, 파일 이름?) → Promise<{ ok, errors, renamed, design, preflight }> — 걸리면 아무것도 바꾸지 않는다 */
    open: open,
    /* 지금 디자인의 사전 검사 { items, reproducible } — 목록도 다시 그린다 */
    preflight: preflight,
    /* 페이지용 코드(그림 세트 줄 + registerDesign + --fy-design, 실험) */
    snippet: snippet,
    /* 지금 그림 문서의 profiles/*.jamo.js 꼴 글 — 그린 칸이 없으면 null */
    jamoJs: jamoJs,
    exportJamo: exportJamo,
    copySnippet: copySnippet,
    /* 마지막 열기 결과 { ok, errors, renamed, file } · 마지막 사전 검사 */
    last: function () { return { open: clone(lastOpen), preflight: clone(lastPreflight) }; },
    busy: busy
  };
})();
