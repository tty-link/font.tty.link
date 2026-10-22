/* Review and environment records extend the existing v2 project/draft hooks.
 * 판정 근거(PLAN-STUDIO-002 ⚑8, 2026-10-18 사용자 결정): 글꼴 내용 지문(CSS·디자인·재료·그림 + 런타임 판·의존 지문)과 항목마다
 * 그린 모양 서명. 기기(UA·화면 배율·창 크기)는 참고로만 적고 판정을 무르지 않는다. 내용이 바뀌면 그 항목 글자의 그린 모양이
 * 바뀐 항목만 다시 검수다.
 * S5-C: 검수 칸을 꾸밈(kku-look-*)·바탕(테마 바탕)에 얹어 볼 수 있다 — 보기만 바꾸고 서명에는 들지 않는다(판정 기록에 본 꾸밈·바탕을
 * 참고로 적는다). 정밀 모드의 비교 기준이 있으면 '차이 칠하기'가 기준과 지금을 겹쳐 다른 잉크만 칠하고, 그린 모양 서명으로 같은지 말한다. */
(function () {
  "use strict";
  var Studio = window.FontStudio, Model = window.FontStudioReviewModel, Repro = window.FontStudioReproducibilityModel;
  if (!Studio || !Model || !Repro) { return; }
  var root = document.querySelector("[data-studio]");
  function $(selector) { return root.querySelector(selector); }
  var review = Model.normalize(null), savedEnvironment = null, coreResources = [], environmentReady = false;
  var labels = Model.LABELS;
  var timer = null, entries = [], baselineEntries = [], baselineSheet = new CSSStyleSheet(), baselineKey = null, baselineError = "";
  var returnText = null; // '이 문장 고치기' 앞의 미리보기 글 — 검수로 돌아오면 되돌린다
  // 옛(판 1) 기록을 읽을 때만 쓴다: 판 1 지문은 확인 못한 재료가 있으면 이 세션 표시를 넣었다.
  var observationSession = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  var BASELINE_DESIGN = "studio-review-baseline", BASELINE_SET = "studio-review-baseline-jamo";
  var PROBE_SIZE = 48;
  function copy(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }
  function project() { return Studio.projectSnapshot(); }
  function localTime(iso) {
    var date = new Date(iso);
    if (!iso || isNaN(date.getTime())) { return iso || "시각 모름"; }
    try { return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }); } catch (_) { return date.toLocaleString(); }
  }
  /* 판정 단추: 옛 화면 값(fail·pending)을 지금 어휘로 맞춘다. 화면 파일이 새 값이면 아무것도 바꾸지 않는다. */
  Array.prototype.forEach.call(root.querySelectorAll("[data-review-verdict]"), function (button) {
    var verdict = Model.verdict(button.dataset.reviewVerdict);
    if (verdict) { button.dataset.reviewVerdict = verdict; button.textContent = labels[verdict]; }
  });
  function directSets() {
    var style = getComputedStyle(Studio.host);
    return [Studio.host.getAttribute("jamo-set"), style.getPropertyValue("--fy-jamo-set"), style.getPropertyValue("--fy-font-jamo-set")]
      .filter(function (name) { return typeof name === "string" && name.trim() && !/^(none|initial|inherit|unset)$/i.test(name.trim()); })
      .map(function (name) { return name.trim(); });
  }
  function environment(snapshot) {
    var resources = coreResources.slice(), json = snapshot.design && snapshot.design.applied && snapshot.design.json;
    var sources = json && json.sources || {};
    var drawings = snapshot.design && snapshot.design.participants && snapshot.design.participants.drawings;
    Object.keys(sources).sort().forEach(function (name) {
      var source = sources[name];
      if (source.kind === "svg") {
        resources.push({ kind: "jamo-set", id: source.assetSet || name,
          text: drawings && drawings.set === source.assetSet ? JSON.stringify(drawings) : undefined });
      } else if (source.kind === "font") {
        resources.push({ kind: "device-font", id: source.family || name });
      }
    });
    directSets().forEach(function (name) { resources.push({ kind: "jamo-set", id: name }); });
    // CSS image/font URLs may depend on remote or device assets. Unknown bytes stay explicitly unverified.
    var urls = {}, regex = /url\(\s*["']?([^\s"')]+)["']?\s*\)/g, match;
    while ((match = regex.exec(snapshot.font.css))) {
      var id;
      try { id = new URL(match[1], snapshot.font.baseUrl || document.baseURI).href; } catch (_) { id = match[1]; }
      if (!urls[id]) { urls[id] = true; resources.push({ kind: "asset", id: id, text: id.indexOf("data:") === 0 ? id : undefined }); }
    }
    var face = getComputedStyle(Studio.host).getPropertyValue("--fy-face").trim() || Studio.host.getAttribute("data-fy-face");
    if (face === "device") {
      resources.push({ kind: "device-font", id: getComputedStyle(Studio.host).getPropertyValue("--fy-font-family").trim() || "기기 기본 글꼴" });
    }
    var unique = {}, safeResources = [];
    resources.forEach(function (resource) {
      var id = String(resource.id || "unknown");
      if (id.length > 500 || /[<>\u0000-\u001f\u007f]/.test(id)) { id = resource.kind + ":" + Repro.fingerprint(id); }
      resource.id = id;
      var key = resource.kind + ":" + id;
      if (!unique[key] && safeResources.length < 250) { unique[key] = true; safeResources.push(resource); }
    });
    if (resources.length > 250) { safeResources.push({ kind: "asset", id: "additional-assets-unverified" }); }
    return Repro.capture({ runtime: window.FontStudioBundleModel.runtimeInfo(window.FontKku), resources: safeResources });
  }
  /* 내용 지문의 런타임 쪽: 런타임 판·배치 revision과 내용을 확인한 의존 지문. 주소(서버 출처)와 기기는 넣지 않는다. */
  function runtimeEvidence(env) {
    return { runtime: env.runtime, resources: env.resources.filter(function (resource) { return resource.fingerprint; })
      .map(function (resource) { return resource.kind + ":" + resource.fingerprint; }).sort() };
  }
  function current() {
    var snapshot = project(), env = environment(snapshot);
    var unverified = env.resources.some(function (resource) { return !resource.fingerprint; });
    var reference = { browser: navigator.userAgent, scale: window.devicePixelRatio || 1, viewport: window.innerWidth + "×" + window.innerHeight };
    if (view.look) { reference.look = view.look; }
    if (toneOf()) { reference.background = toneOf(); }
    return { snapshot: snapshot, environment: env, unverified: unverified, fingerprint: Model.fingerprint(snapshot, runtimeEvidence(env)),
      reference: reference };
  }

  // ── 꾸밈·바탕 바꿔 보기(S5-C) ──────────────────────────────────────────
  /* 보는 조건일 뿐이다 — 저장하지 않고(기록 줄도 없음) 서명 재기(probe)에도 쓰지 않는다. 목록은 테마 자료(spec/themes.json에서 만든
   * authoring/themes-data.js)를 검수 페이지가 처음 깰 때 싣는다. 꾸밈 CSS(font-kku-looks.css)는 꾸밈을 처음 고를 때 칸마다 붙인다 */
  var view = { look: "", background: "" }, themes = null, looksHref = null;
  function lookInfo(id) { return themes && themes.looks && themes.looks[id] || null; }
  function toneInfo(id) { return themes && themes.tones && themes.tones[id] || null; }
  /* 지금 칸에 깔 바탕 — 고른 바탕, 아니면(꾸밈에 맞춤) 고른 꾸밈의 바탕, 둘 다 없으면 작업실 바탕("") */
  function toneOf() {
    if (view.background) { return view.background; }
    var look = view.look && lookInfo(view.look);
    return look && look.tone && toneInfo(look.tone) ? look.tone : "";
  }
  function lookName(id) { var look = lookInfo(id); return look && look.name || id; }
  function toneName(id) { var tone = toneInfo(id); return tone && tone.name || id; }
  function fillViewOptions() {
    var lookSelect = $("[data-review-look]"), toneSelect = $("[data-review-background]");
    if (!themes || lookSelect.options.length > 1) { return; }
    Object.keys(themes.looks || {}).forEach(function (id) {
      var option = document.createElement("option"); option.value = id; option.textContent = lookName(id);
      option.title = themes.looks[id].summary || ""; lookSelect.appendChild(option);
    });
    Object.keys(themes.tones || {}).forEach(function (id) {
      var option = document.createElement("option"); option.value = id; option.textContent = toneName(id); toneSelect.appendChild(option);
    });
    lookSelect.value = view.look; toneSelect.value = view.background;
  }
  var themesLoading = false, themesFailed = false;
  /* 검수 페이지가 그릴 때마다 부른다 — 지연 싣기(font-studio-lazy.js)는 이 파일 뒤에 실리니 처음 깰 때는 아직 없을 수 있다. 실패하면 다시 청하지 않는다 */
  function loadThemes() {
    themes = themes || window.FontKkuThemes || null;
    if (themes || themesLoading || themesFailed || typeof Studio.need !== "function") { fillViewOptions(); setViewReady(); return; }
    themesLoading = true; setViewReady();
    Studio.need("looks").then(function (data) {
      themesLoading = false; themes = data || window.FontKkuThemes || null; fillViewOptions(); setViewReady(); schedule();
    }, function () { themesLoading = false; themesFailed = true; setViewReady(); });
  }
  function setViewReady() {
    var ready = Boolean(themes);
    $("[data-review-look]").disabled = !ready; $("[data-review-background]").disabled = !ready;
    $("[data-review-view]").dataset.state = ready ? "ready" : themesFailed ? "unavailable" : "loading";
  }
  /* 칸 하나(shadow root와 그 font-kku)에 지금 보기를 얹는다. 꾸밈 CSS 고리는 처음 꾸밈을 고를 때만 붙인다 */
  function applyView(entry) {
    Array.prototype.slice.call(entry.host.classList).forEach(function (name) {
      if (/^kku-look-/.test(name)) { entry.host.classList.remove(name); }
    });
    if (!view.look) { return; }
    if (!entry.looks) {
      looksHref = looksHref || new URL("font-kku-looks.css", Studio.coreHref()).href;
      var link = document.createElement("link"); link.rel = "stylesheet"; link.href = looksHref; link.setAttribute("data-review-looks", "");
      entry.host.parentNode.insertBefore(link, entry.host); entry.looks = link;
    }
    entry.host.classList.add("kku-look-" + view.look);
  }
  function paintTone(container) {
    var tone = toneInfo(toneOf());
    if (!tone) { container.removeAttribute("data-review-tone"); container.style.removeProperty("--review-tone-bg"); container.style.removeProperty("--review-tone-ink"); return; }
    container.setAttribute("data-review-tone", toneOf());
    container.style.setProperty("--review-tone-bg", tone.background); container.style.setProperty("--review-tone-ink", tone.ink);
  }
  function renderView() {
    entries.concat(baselineEntries).forEach(applyView);
    paintTone($("[data-review-specimens]")); paintTone($("[data-review-baseline-specimens]"));
    var note = $("[data-review-view-note]");
    note.textContent = !themes ? "" : view.background || !view.look ? "" : toneOf() ? "꾸밈에 맞춘 바탕: " + toneName(toneOf()) : "";
  }
  function legacyFingerprint(now) {
    return Model.legacyFingerprint(now.snapshot, { dependencies: now.environment, browser: navigator.userAgent, scale: window.devicePixelRatio,
      session: now.unverified ? observationSession : null });
  }

  // ── 항목의 그린 모양 서명 ──────────────────────────────────────────────
  /* 화면 밖 측정 바탕 요소 하나(검수 칸과 같은 글꼴 시트·덮어쓰기)에 항목 글을 48px로 그려 글자마다 노드 구조·자리·칠을 읽는다.
   * 자리는 글자 상자 기준 em(0.01em)이라 줄 나눔·창 크기와 무관하다. 글자 크기에서 나오는 상자 크기(기기 글꼴 지표)는 읽지
   * 않는다. 자소판 칸은 그 칸의 화소 서명으로 읽어(blob·svg 주소 대신) 다른 칸을 고쳐도 서명이 그대로다. */
  var probe = null;
  function probeHost() {
    if (probe) { return probe; }
    var stage = document.createElement("div"), shadow = stage.attachShadow({ mode: "open" });
    stage.setAttribute("aria-hidden", "true"); stage.setAttribute("data-review-probe", "");
    stage.style.cssText = "position:fixed;left:-20000px;top:0;width:1600px;pointer-events:none;";
    var link = document.createElement("link"); link.rel = "stylesheet"; link.href = Studio.coreHref();
    var host = document.createElement("font-kku"); host.setAttribute("data-studio-host", ""); host.setAttribute("size", PROBE_SIZE + "px");
    host.setAttribute("wrap-unit", "word");
    probe = { host: host, ready: false };
    // 핵심 시트가 오지 않아도(막힘) 4초 뒤에는 놓는다 — 검수 단추를 붙들지 않는다(그리기 떼어 내기 무대와 같다)
    var done = function () { if (!probe.ready) { probe.ready = true; schedule(); } };
    link.addEventListener("load", done); link.addEventListener("error", done); setTimeout(done, 4000);
    // 작업실 [data-studio] 밖에 둔다 — 페이지 칸 감추기·화면 검사에 걸리지 않는다
    shadow.appendChild(link); shadow.appendChild(host); document.body.appendChild(stage); Studio.addPreviewRoot(shadow, []);
    return probe;
  }
  function round(value) { var rounded = Math.round(value * 100) / 100; return rounded === 0 ? 0 : rounded; }
  function normalized(value, px) {
    return String(value).replace(/(-?\d*\.?\d+(?:e[-+]?\d+)?)(px)?/gi, function (_, number, unit) {
      return unit ? round(Number(number) / px) + "em" : String(round(Number(number)));
    });
  }
  var PAINT = ["display", "visibility", "opacity", "color", "background-color", "background-position", "background-size", "filter",
    "clip-path", "transform", "font-size", "font-weight", "font-family", "-webkit-text-stroke-width", "-webkit-text-stroke-color"];
  var PLACE = ["top", "left", "line-height", "transform-origin"];
  var BEFORE = ["content", "top", "left", "font-size", "font-family", "font-weight", "transform", "color", "clip-path"];
  var NUMERIC_ATTRIBUTES = /^(style|d|points|transform|x|y|x1|y1|x2|y2|width|height|viewbox|cx|cy|r|rx|ry|stroke-width)$/i;
  /* Firefox·Chromium 칸 문서(런타임 data-fy-sprite-cell·--fy-sprite-cell-image — Blob 주소가 페이지마다 다르다)는 그린 모양이 아니다 */
  function attributes(el, px) {
    return Array.prototype.map.call(el.attributes, function (attribute) {
      var value = attribute.value;
      if (attribute.name === "style" && value.indexOf("--fy-sprite-cell-image") >= 0) {
        value = value.replace(/\s*--fy-sprite-cell-image\s*:[^;]*;?/g, "").trim();
      }
      return [attribute.name, value];
    }).filter(function (pair) {
      return pair[0] !== "id" && pair[0] !== "class" && pair[0] !== "data-fy-sprite-cell" && !(pair[0] === "style" && !pair[1]);
    }).map(function (pair) {
      return pair[0] + "=" + (NUMERIC_ATTRIBUTES.test(pair[0]) ? normalized(pair[1], px) : pair[1]);
    }).sort().join(";");
  }
  /* 칸 문서 노드의 배경 자리·크기를 자소판 전체의 자리·크기로 되돌린다 — 칸 그림은 칸 하나라 자소판 칸 자리를 뺀 값이다(확대·자르기는 남는다) */
  function sheetGeometry(el, style) {
    if (el.getAttribute("data-fy-sprite-cell") !== "" || !/url\(/.test(style.getPropertyValue("background-image"))) { return null; }
    var size = style.getPropertyValue("background-size").split(" ").map(parseFloat);
    var pos = style.getPropertyValue("background-position").split(" ").map(parseFloat);
    var cols = parseInt(style.getPropertyValue("--fy-sprite-cols"), 10), rows = parseInt(style.getPropertyValue("--fy-sprite-rows"), 10);
    var row = parseInt(style.getPropertyValue("--fy-sprite-row"), 10) || 0, col = parseInt(el.getAttribute("data-sprite-jamo-index"), 10) || 0;
    if (size.length !== 2 || pos.length !== 2 || size.concat(pos).some(isNaN) || !(cols > 0) || !(rows > 0)) { return null; }
    return { "background-size": size[0] * cols + "px " + size[1] * rows + "px",
      "background-position": (pos[0] - col * size[0]) + "px " + (pos[1] - row * size[1]) + "px" };
  }
  function ownText(el) {
    var text = "";
    Array.prototype.forEach.call(el.childNodes, function (node) { if (node.nodeType === 3) { text += node.nodeValue; } });
    return text.trim();
  }
  function spriteCell(el, style, cells) {
    var material = Studio.material;
    if (!material || !material.cellSignature || !el.hasAttribute("data-sprite-jamo") || !/url\(/.test(style.getPropertyValue("background-image"))) { return null; }
    var row = parseInt(style.getPropertyValue("--fy-sprite-row"), 10) || 0, col = parseInt(el.getAttribute("data-sprite-jamo-index"), 10) || 0;
    var key = row + "," + col;
    if (!(key in cells)) { cells[key] = material.cellSignature(row, col); }
    return cells[key];
  }
  /* options.shape === true: 차이 칠하기가 기준 칸과 지금 칸을 견줄 때 — 자소판 칸은 화소 서명 대신 자리(배경 위치·크기)로만 적고
   * 그림 주소는 'sprite'로 접는다(기준은 data: 주소, 지금은 blob·파일 주소라 늘 달라 보인다). 칠한 그림이 잉크 모양만 견주니 색도 뺀다 */
  var COLORS = ["color", "background-color", "-webkit-text-stroke-color"];
  function describe(host, options) {
    var shape = Boolean(options && options.shape);
    var px = parseFloat(getComputedStyle(host).fontSize) || PROBE_SIZE, lines = [], cells = shape ? null : {};
    var paint = shape ? PAINT.filter(function (name) { return COLORS.indexOf(name) < 0; }) : PAINT;
    var beforePaint = shape ? BEFORE.filter(function (name) { return COLORS.indexOf(name) < 0; }) : BEFORE;
    Array.prototype.forEach.call(host.querySelectorAll('[part="glyph"]'), function (glyph) {
      var box = glyph.getBoundingClientRect(), hangul = glyph.getAttribute("data-glyph-kind") === "hangul";
      lines.push("G|" + attributes(glyph, px) + "|" + (hangul ? round(box.width / px) + "," + round(box.height / px) : glyph.textContent));
      Array.prototype.forEach.call(glyph.querySelectorAll("*"), function (el) {
        var line = el.tagName + "|" + attributes(el, px);
        if (!hangul) { lines.push(line + "|" + (el.children.length ? "" : el.textContent)); return; }
        var style = getComputedStyle(el), text = ownText(el);
        if (text) {
          line += "|T:" + text + "|" + PLACE.map(function (name) { return normalized(style.getPropertyValue(name), px); }).join(";");
        } else {
          var rect = el.getBoundingClientRect();
          line += "|" + [rect.left - box.left, rect.top - box.top, rect.width, rect.height].map(function (value) { return round(value / px); }).join(",");
        }
        var sheet = sheetGeometry(el, style);
        line += "|" + paint.map(function (name) { return normalized(sheet && sheet[name] || style.getPropertyValue(name), px); }).join(";");
        var image = style.getPropertyValue("background-image");
        var cell = cells ? spriteCell(el, style, cells) : null;
        if (!cells && el.hasAttribute("data-sprite-jamo") && /url\(/.test(image)) {
          line += "|sprite";
        } else {
          line += "|" + (cell ? "cell:" + cell : image.split(location.origin).join("").replace(/blob:[^"')\s]+/g, "blob"));
        }
        var before = getComputedStyle(el, "::before");
        if (before.content && before.content !== "none" && before.content !== "normal") {
          line += "|B:" + beforePaint.map(function (name) { return normalized(before.getPropertyValue(name), px); }).join(";");
        }
        lines.push(line);
      });
    });
    return lines;
  }
  /* 지금 글꼴로 그린 그 항목 글의 서명. 같은 그리기 동안(한 번의 render) 같은 글은 한 번만 잰다. */
  function signature(sample, pass) {
    if (pass && pass[sample.text] !== undefined) { return pass[sample.text]; }
    var host = probeHost().host;
    host.setAttribute("font", Studio.state.fontId || "untitled");
    host.style.cssText = Studio.host.style.cssText;
    ["jamo-set", "face", "seed", "jamo-seeds"].forEach(function (key) {
      if (Studio.host.hasAttribute(key)) { host.setAttribute(key, Studio.host.getAttribute(key)); } else { host.removeAttribute(key); }
    });
    FontKku.render(host, { text: sample.text }); FontKku.refreshAll(host);
    var value = Model.renderSignature(describe(host));
    if (pass) { pass[sample.text] = value; }
    return value;
  }
  function evidence(now, sample, pass) {
    return { fingerprint: now.fingerprint, unverified: now.unverified, reference: now.reference, render: signature(sample, pass) };
  }
  /* 항목 판정 상태. 내용이 같으면 그대로, 다르면(또는 확인 못한 재료가 있으면) 그 항목의 그린 모양을 견준다. 옛(판 1) 기록은
   * 판 1 규칙으로 아직 맞으면 지금 근거로 옮긴다(판정·메모·시각은 그대로). */
  function statusOf(now, sample, pass, legacy) {
    var record = review.records[sample.id];
    if (record && record.status && !record.render && record.text === sample.text && /^review-v1-/.test(record.fingerprint)) {
      if (legacy.value === undefined) { legacy.value = legacyFingerprint(now); }
      if (record.fingerprint === legacy.value) { review.records[sample.id] = record = Model.adopt(record, evidence(now, sample, pass)); }
    }
    var current = { fingerprint: now.fingerprint, unverified: now.unverified };
    if (Model.needsRender(record, current, sample.text)) { current.render = signature(sample, pass); }
    return Model.status(record, current, sample.text);
  }
  function selected() {
    var samples = Model.samples(review);
    return samples.filter(function (sample) { return sample.id === review.selected; })[0] || samples[0];
  }
  /* 검수 페이지가 보일 때만(f-shell 수명, S1) 다시 그리기를 예약한다 — 다른 페이지에서 고칠 때마다 타이머를 걸던 것. 깨면 따라잡는다 */
  var life = null;
  function schedule() { clearTimeout(timer); timer = life ? setTimeout(render, 60) : null; }
  function renderEnvironment(env) {
    var comparison = Repro.compare(savedEnvironment, env);
    var text = !environmentReady ? "그리기에 쓰는 파일을 확인하고 있습니다." : !savedEnvironment
      ? "이 프로젝트에는 저장한 환경 기록이 없습니다. 지금 환경을 기록할 수 있습니다."
      : comparison.status === "match" ? "저장한 그리기 파일과 지금 파일이 같습니다. 기기와 브라우저에 따라 보이는 결과는 달라질 수 있습니다."
      : comparison.status === "changed" ? "저장할 때와 그리기 환경이 달라졌습니다. 지금 보이는 글자를 다시 확인한 뒤 환경을 갱신하세요."
      : "그리기 환경의 일부를 확인할 수 없습니다. 외부 그림이나 기기 글꼴까지 같은 모습으로 고정되지는 않습니다. 판정은 항목마다 지금 그린 모양과 견줘, 모양이 바뀐 항목만 다시 검수합니다.";
    var unknownResources = env.resources.filter(function (resource) { return !resource.fingerprint; });
    if (environmentReady && !savedEnvironment && unknownResources.length) {
      text += " 일부 그림이나 기기 글꼴의 내용을 확인하지 못했습니다. 판정은 항목마다 지금 그린 모양과 견줍니다.";
    }
    $("[data-studio-environment-status]").textContent = text;
    $("[data-studio-environment-status]").dataset.state = comparison.status;
    $("[data-studio-environment-adopt]").disabled = !environmentReady;
    $("[data-studio-environment-adopt]").textContent = savedEnvironment ? "지금 환경으로 갱신" : "지금 환경 기록";
    var list = $("[data-studio-environment-details]");
    list.textContent = "";
    var statusLabels = { changed: "달라짐", missing: "없음", unverified: "내용 확인 못함", added: "새로 사용" };
    comparison.items.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item.id + " — " + (statusLabels[item.status] || item.status);
      list.appendChild(li);
    });
    unknownResources.forEach(function (resource) {
      if (comparison.items.some(function (item) { return item.kind === resource.kind && item.id === resource.id; })) { return; }
      var li = document.createElement("li"); li.textContent = resource.id + " — 내용 확인 못함"; list.appendChild(li);
    });
    if (!list.children.length) { var li = document.createElement("li"); li.textContent = "확인한 파일에 차이가 없습니다."; list.appendChild(li); }
  }
  /* 크기마다 한 칸 — 16·24·48px 문장과 120px 머리글(문장의 첫 낱말, S3 — 소개 히어로 크기의 사람 검수 기준) */
  var HERO = 120;
  function heroText(text) {
    var word = String(text || "").trim().split(/\s+/)[0] || "";
    return Array.from(word).slice(0, 4).join("");
  }
  function specimenText(entry, text) {
    return entry.size === HERO ? heroText(text) : text;
  }
  function buildSpecimens(baseline) {
    [16, 24, 48, HERO].forEach(function (size) {
      var box = document.createElement("div"); box.className = "studio-review-size" + (size === HERO ? " studio-review-hero" : "");
      box.dataset.reviewSize = String(size);
      var label = document.createElement("small"); label.textContent = size + "px";
      var stage = document.createElement("div"), shadow = stage.attachShadow({ mode: "open" });
      var link = document.createElement("link"); link.rel = "stylesheet"; link.href = Studio.coreHref();
      var host = document.createElement("font-kku"); host.setAttribute("data-studio-host", ""); host.setAttribute("size", size + "px");
      host.setAttribute("wrap-unit", "word");
      shadow.appendChild(link); shadow.appendChild(host);
      if (baseline) { shadow.adoptedStyleSheets = [baselineSheet]; } else { Studio.addPreviewRoot(shadow); }
      box.appendChild(label); box.appendChild(stage); $(baseline ? "[data-review-baseline-specimens]" : "[data-review-specimens]").appendChild(box);
      (baseline ? baselineEntries : entries).push({ host: host, size: size });
    });
  }
  function prepareBaseline() {
    var baseline = review.baseline;
    if (baselineKey === baseline) { return; }
    baselineKey = baseline; baselineError = "";
    if (FontKku.designs().indexOf(BASELINE_DESIGN) >= 0) { FontKku.unregisterDesign(BASELINE_DESIGN); }
    if (!baseline) { baselineSheet.replaceSync(""); return; }
    try {
      if (baseline.directSets && baseline.directSets.length) { throw new Error("직접 지정한 그림 세트의 원본이 기준에 담기지 않아 이전 그림을 확인할 수 없습니다."); }
      var css = window.FontStudioModel.rewriteUrls(baseline.font.css, baseline.font.baseUrl || document.baseURI);
      if (/url\(/i.test(css) && !(baseline.material && baseline.material.sheet)) { throw new Error("기준에 그림 파일이 담기지 않아 이전 모습을 확인할 수 없습니다."); }
      if (/@font-face/i.test(css)) { throw new Error("기준 글꼴에 별도 글꼴 파일이 있어 이전 모습을 안전하게 분리하지 못했습니다."); }
      var json = baseline.design && baseline.design.applied ? copy(baseline.design.json) : null;
      var drawing = baseline.design && baseline.design.participants && baseline.design.participants.drawings;
      if (json) {
        var captured = drawing && window.FontStudioDrawModel.normalizeDoc(drawing);
        Object.keys(json.sources || {}).forEach(function (id) {
          var source = json.sources[id];
          if (source.kind !== "svg") { return; }
          if (!captured || !captured.ok || source.assetSet !== captured.doc.set) {
            throw new Error("기준에 그림 원본이 담기지 않아 이전 그림을 확인할 수 없습니다. 원본을 포함한 프로젝트를 사용하세요.");
          }
          source.assetSet = BASELINE_SET;
        });
        if (captured && captured.ok && !window.FontStudioDrawModel.isEmpty(captured.doc)) {
          captured.doc.set = BASELINE_SET; window.FontStudioDrawModel.register(captured.doc, FontKku);
        }
        FontKku.registerDesign(BASELINE_DESIGN, json, { replace: true });
      }
      if (baseline.material && typeof baseline.material.sheet === "string" && /^data:image\/png;base64,/.test(baseline.material.sheet)) {
        var url = "url(" + JSON.stringify(baseline.material.sheet) + ")";
        css += "\n[data-studio-host] { --fy-sprite-url: " + url + "; --fy-sprite-url-2x: " + url + "; --fy-sprite-url-3x: " + url + "; }";
      }
      baselineSheet.replaceSync(css);
    } catch (error) { baselineError = error.message; baselineSheet.replaceSync(""); }
  }
  function renderBaseline(sample) {
    prepareBaseline();
    var baseline = review.baseline, visible = Boolean(baseline && !baselineError);
    $("[data-review-baseline]").hidden = !visible;
    $("[data-review-compare]").classList.toggle("has-baseline", visible);
    $("[data-review-baseline-clear]").hidden = !baseline;
    $("[data-review-baseline-info]").textContent = baselineError || (baseline
      ? "기준 저장: " + localTime(baseline.at) + " · 두 모습은 같은 실행 환경에서 비교합니다. 저장 당시의 화면을 보관한 것은 아닙니다."
      : "고치기 전에 비교 기준을 저장하면 이전 모습과 견줄 수 있습니다.");
    if (!visible) { return; }
    baselineEntries.forEach(function (entry) {
      entry.host.setAttribute("font", baseline.font.id);
      entry.host.style.cssText = baseline.hostStyle;
      if (Studio.glyphs) { Studio.glyphs.applyPreviewOptions(entry.host, baseline.design && baseline.design.json || {}); }
      if (baseline.design && baseline.design.applied) { entry.host.style.setProperty("--fy-design", BASELINE_DESIGN); }
      FontKku.render(entry.host, { text: specimenText(entry, sample.text) }); FontKku.refreshAll(entry.host);
    });
  }
  // ── 차이 칠하기(S5-C) ───────────────────────────────────────────────────
  /* 기준과 지금을 크기마다 같은 자리에 겹친다(칠하는 법은 font-studio-review.css). 켤 때 칸을 만들고, 끄면 지금 칸의 글꼴 시트를 놓는다
   * (모듈 수명 S1 — 보이지 않는 칸이 고칠 때마다 스타일을 다시 셈하지 않게). 같은지는 그린 모양 서명(describe)을 글자마다 견줘 말한다 */
  var diff = { on: false, entries: [], leased: false }, lastDiff = null;
  function buildDiff() {
    if (diff.entries.length) {
      if (!diff.leased) { diff.entries.forEach(function (entry) { Studio.addPreviewRoot(entry.nowShadow); }); diff.leased = true; }
      return;
    }
    diff.leased = true;
    var holder = $("[data-review-diff-specimens]");
    [16, 24, 48, HERO].forEach(function (size) {
      var box = document.createElement("div"); box.className = "studio-review-size" + (size === HERO ? " studio-review-hero" : "");
      box.dataset.reviewDiffSize = String(size);
      var label = document.createElement("small"); label.textContent = size + "px";
      var stack = document.createElement("div"); stack.className = "studio-review-diff-stack";
      var made = {};
      ["base", "now"].forEach(function (which) {
        var layer = document.createElement("div"); layer.className = "studio-review-diff-layer studio-review-diff-" + which;
        var stage = document.createElement("div"), shadow = stage.attachShadow({ mode: "open" });
        var link = document.createElement("link"); link.rel = "stylesheet"; link.href = Studio.coreHref();
        var host = document.createElement("font-kku"); host.setAttribute("data-studio-host", ""); host.setAttribute("size", size + "px");
        host.setAttribute("wrap-unit", "word");
        shadow.appendChild(link); shadow.appendChild(host);
        if (which === "base") { shadow.adoptedStyleSheets = [baselineSheet]; } else { Studio.addPreviewRoot(shadow); }
        layer.appendChild(stage); stack.appendChild(layer);
        made[which] = host; made[which + "Shadow"] = shadow;
      });
      box.appendChild(label); box.appendChild(stack); holder.appendChild(box);
      diff.entries.push({ size: size, base: made.base, now: made.now, nowShadow: made.nowShadow, box: box });
    });
  }
  function dropDiff() {
    diff.entries.forEach(function (entry) { Studio.removePreviewRoot(entry.nowShadow); });
    diff.leased = false;
  }
  /* 글자마다 묶은 서명 줄 — 'G|'로 시작하는 줄이 글자 하나의 머리다 */
  function glyphGroups(lines) {
    var groups = [];
    lines.forEach(function (line) {
      if (line.indexOf("G|") === 0 || !groups.length) { groups.push([line]); } else { groups[groups.length - 1].push(line); }
    });
    return groups.map(function (group) { return group.join("\n"); });
  }
  /* 기준 칸 서명의 기준 전용 이름(기준 디자인·그림 세트·글꼴 이름)을 지금 이름으로 맞춘다 — 이름만 다른 것을 차이로 세지 않는다 */
  function baselineAliases() {
    var baseline = review.baseline, pairs = [], style = getComputedStyle(Studio.host);
    var design = style.getPropertyValue("--fy-design").trim();
    if (design && design !== "none") { pairs.push([BASELINE_DESIGN, design]); }
    var json = Studio.design && Studio.design.json && Studio.design.json();
    var sources = json && json.sources || {};
    Object.keys(sources).forEach(function (id) { if (sources[id].kind === "svg" && sources[id].assetSet) { pairs.push([BASELINE_SET, sources[id].assetSet]); } });
    if (baseline && baseline.font && baseline.font.id && baseline.font.id !== (Studio.state.fontId || "untitled")) {
      pairs.push([baseline.font.id, Studio.state.fontId || "untitled"]);
    }
    return pairs;
  }
  function aliased(text, pairs) {
    return pairs.reduce(function (out, pair) { return out.split(pair[0]).join(pair[1]); }, text);
  }
  function hasSprite(host) {
    return Boolean(host.querySelector("[data-sprite-jamo]"));
  }
  function renderDiff(sample) {
    var baseline = review.baseline, available = Boolean(baseline && !baselineError);
    var toggle = $("[data-review-diff-toggle]");
    toggle.hidden = !available;
    var shown = available && diff.on;
    $("[data-review-diff-view]").hidden = !shown;
    if (!shown) { return null; }
    buildDiff();
    var style = Studio.host.style.cssText, pairs = baselineAliases();
    var sameMaterial = JSON.stringify(baseline.material || null) === JSON.stringify(project().material || null);
    var differing = {}, sizes = [], unknown = false;
    diff.entries.forEach(function (entry) {
      entry.base.setAttribute("font", baseline.font.id);
      entry.base.style.cssText = baseline.hostStyle;
      if (Studio.glyphs) { Studio.glyphs.applyPreviewOptions(entry.base, baseline.design && baseline.design.json || {}); }
      if (baseline.design && baseline.design.applied) { entry.base.style.setProperty("--fy-design", BASELINE_DESIGN); }
      entry.now.setAttribute("font", Studio.state.fontId || "untitled");
      entry.now.style.cssText = style;
      ["jamo-set", "face", "seed", "jamo-seeds"].forEach(function (key) {
        if (Studio.host.hasAttribute(key)) { entry.now.setAttribute(key, Studio.host.getAttribute(key)); } else { entry.now.removeAttribute(key); }
      });
      var text = specimenText(entry, sample.text);
      FontKku.render(entry.base, { text: text }); FontKku.refreshAll(entry.base);
      FontKku.render(entry.now, { text: text }); FontKku.refreshAll(entry.now);
      var before = glyphGroups(describe(entry.base, { shape: true })).map(function (group) { return aliased(group, pairs); });
      var after = glyphGroups(describe(entry.now, { shape: true }));
      var glyphsNow = entry.now.querySelectorAll('[part="glyph"]'), changed = 0;
      for (var index = 0; index < Math.max(before.length, after.length); index += 1) {
        if (before[index] !== after[index]) {
          changed += 1;
          var glyph = glyphsNow[index];
          var source = glyph && (glyph.getAttribute("data-source") || glyph.textContent) || "";
          if (source.trim()) { differing[source.trim()] = true; }
        }
      }
      // 자소판 그림이 기준과 다르면(자소판 고침) 칸 자리만으로는 같다고 말할 수 없다 — 칠한 그림을 보게 한다
      if (!changed && !sameMaterial && (hasSprite(entry.base) || hasSprite(entry.now))) { unknown = true; }
      entry.box.dataset.reviewDiffState = changed ? "different" : (!sameMaterial && (hasSprite(entry.base) || hasSprite(entry.now))) ? "unknown" : "same";
      if (changed) { sizes.push(entry.size + "px"); }
    });
    var status = $("[data-review-diff-status]"), letters = Object.keys(differing);
    if (sizes.length) {
      status.dataset.state = "different";
      status.textContent = sizes.join("·") + "에서 다릅니다" + (letters.length ? " — " + letters.slice(0, 12).join(" ") + (letters.length > 12 ? " 외" : "") : "") +
        (unknown ? ". 자소판 그림이 기준과 달라 다른 크기는 칠한 그림으로 보세요." : ".");
    } else if (unknown) {
      status.dataset.state = "unknown";
      status.textContent = "자소판 그림이 기준과 달라 그린 모양 서명으로는 견주지 못했습니다 — 칠한 그림에서 빨강·파랑을 찾아보세요.";
    } else {
      status.dataset.state = "same";
      status.textContent = "기준과 지금의 글자 모양이 같습니다 — 칠할 차이가 없습니다(색은 견주지 않습니다).";
    }
    return { state: status.dataset.state, sizes: sizes, letters: letters };
  }
  function referenceText(record) {
    var ref = record && record.reference;
    var seen = ref && (ref.look || ref.background)
      ? " · 본 모습: " + [ref.look ? "꾸밈 " + lookName(ref.look) : "", ref.background ? toneName(ref.background) : ""].filter(Boolean).join(" · ") : "";
    return (ref && ref.scale ? " · 기기 참고: 화면 배율 " + ref.scale + (ref.viewport ? ", 창 " + ref.viewport : "") : "") + seen;
  }
  function render() {
    timer = null;
    if (!Studio.doc()) { return; }
    /* Firefox·Chromium 칸 문서를 만드는 동안(data-fy-sprite-cell="wait") 글자 그림이 비어 서명이 다르다 — 칸이 오면 그린다 */
    var waiting = !environmentReady || Boolean(Studio.material && Studio.material.busy()) || !probeHost().ready ||
      Boolean(Studio.host.querySelector('[data-fy-sprite-cell="wait"]'));
    Array.prototype.forEach.call(root.querySelectorAll("[data-review-verdict], [data-review-baseline-save]"), function (button) { button.disabled = waiting; });
    if (waiting) { schedule(); return; }
    if (Studio.page() !== "review") { return; } // 감춰진 검수 페이지는 재지 않는다 — 깨면(activate) 다시 그린다
    if (life) { life.work(); }
    if (!themes) { loadThemes(); }
    var now = current(); renderEnvironment(now.environment);
    var sample = selected(), samples = Model.samples(review), pass = {}, legacy = {};
    var counts = { pass: 0, "needs-fix": 0, hold: 0, unreviewed: 0, stale: 0 }, verdicts = {};
    review.selected = sample.id;
    var nav = $("[data-review-samples]"); nav.textContent = "";
    samples.forEach(function (entry) {
      var status = statusOf(now, entry, pass, legacy); counts[status] += 1; verdicts[entry.id] = status;
      var button = document.createElement("button"); button.type = "button"; button.dataset.reviewSample = entry.id; button.dataset.reviewState = status;
      button.textContent = entry.title + " · " + labels[status]; button.setAttribute("aria-current", String(entry.id === sample.id));
      nav.appendChild(button);
    });
    $("[data-review-summary]").textContent = ["pass", "needs-fix", "hold", "unreviewed", "stale"].map(function (key) {
      return labels[key] + " " + counts[key];
    }).join(" · ");
    $("[data-review-title]").textContent = sample.title;
    renderBaseline(sample);
    entries.forEach(function (entry) {
      entry.host.setAttribute("font", Studio.state.fontId || "untitled");
      entry.host.style.cssText = Studio.host.style.cssText;
      ["jamo-set", "face", "seed", "jamo-seeds"].forEach(function (key) {
        if (Studio.host.hasAttribute(key)) { entry.host.setAttribute(key, Studio.host.getAttribute(key)); } else { entry.host.removeAttribute(key); }
      });
      FontKku.render(entry.host, { text: specimenText(entry, sample.text) }); FontKku.refreshAll(entry.host);
    });
    renderView();
    lastDiff = renderDiff(sample);
    var record = review.records[sample.id], verdict = verdicts[sample.id];
    $("[data-review-status]").textContent = labels[verdict] + (verdict === "stale"
      ? " — 이 항목 글자의 모양이 바뀌었습니다. 이전 판정: " + labels[record.status] : "");
    $("[data-review-status]").dataset.state = verdict;
    if (document.activeElement !== $("[data-review-note]")) { $("[data-review-note]").value = record ? record.note : ""; }
    var previous = record && record.previous, history = [];
    if (record && record.status) { history.push("판정: " + labels[record.status] + " · " + localTime(record.at) + referenceText(record)); }
    if (previous) { history.push("이전 기록: " + labels[previous.status] + " · " + localTime(previous.at) + (previous.note ? " · " + previous.note : "")); }
    $("[data-review-history]").textContent = history.join(" / ");
    if (document.activeElement !== $("[data-review-custom]")) { $("[data-review-custom]").value = review.customText; }
  }
  /* 검수 기록이 바뀌었다 — 자동화 계약 v1의 change 사건(까닭 review). 개발·검수 사이트 자동 저장이 받는다 */
  function notify(label) {
    var support = Studio.apiSupport;
    if (support && typeof support.changed === "function") { support.changed("review", { label: label }); }
  }
  /* 하나의 기록(PLAN-STUDIO-002 S2) — 검수 편집(판정·메모·검수 문장·비교 기준·저장 환경)은 작업실 시간축에 검수 갈래로 남는다.
   * 자료는 시간축 항목에 맡긴다: 바꾸기 전·후의 { review, environment }. 메모는 같은 항목을 이어 치면 한 줄로 모은다(mergeKey) */
  function reviewState() { return { review: copy(review), environment: copy(savedEnvironment) }; }
  function restoreState(saved, label) {
    review = Model.normalize(copy(saved.review)); savedEnvironment = copy(saved.environment);
    Studio.markEdited(); render(); notify(label || "검수 되돌리기");
  }
  function timelineCall(method) {
    var timeline = Studio.timeline;
    if (!timeline || typeof timeline[method] !== "function") { return undefined; }
    return timeline[method].apply(timeline, Array.prototype.slice.call(arguments, 1));
  }
  timelineCall("lane", "review", {
    undo: function (entry) { restoreState(entry.data.before, entry.label); return true; },
    redo: function (entry) { restoreState(entry.data.after, entry.label); return true; }
  });
  /* 검수 편집 한 번 — mutate가 review·savedEnvironment를 바꾸면 기록 한 줄(바뀐 것이 없으면 남기지 않음) */
  function tracked(label, mutate, mergeKey) {
    var before = reviewState();
    var out = mutate();
    var after = reviewState();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      timelineCall("record", "review", { label: label, cause: "review", mergeKey: mergeKey || null, data: { before: before, after: after } });
    }
    return out;
  }
  /* 판정 한 줄 — 화면 판정 단추와 FontStudio.api.review.record가 같은 길이다. actor가 없으면 지금 행위자 */
  function record(id, verdictValue, note, actor) {
    var sample = Model.samples(review).filter(function (entry) { return entry.id === id; })[0];
    if (!sample) { return { ok: false, code: "SAMPLE_UNKNOWN" }; }
    if (verdictValue !== null && !Model.verdict(verdictValue)) { return { ok: false, code: "VERDICT_UNKNOWN" }; }
    var old = review.records[sample.id];
    var who = actor || (Studio.apiSupport ? Studio.apiSupport.actor() : null);
    tracked("검수 판정 — " + (sample.title || sample.id), function () {
      review = Model.mark(review, sample, evidence(current(), sample), verdictValue, note === undefined ? (old ? old.note : "") : note,
        undefined, who);
    });
    Studio.markEdited(); render(); notify("검수 판정");
    return { ok: true, record: copy(review.records[sample.id]) };
  }
  /* 항목마다 지금 상태(통과·고칠 것·보류·미검수·다시 검수)와 판정·메모·행위자 */
  function list() {
    var now = current(), pass = {}, legacy = {};
    return Model.samples(review).map(function (sample) {
      var status = statusOf(now, sample, pass, legacy), entry = review.records[sample.id];
      return { key: sample.id, title: sample.title, text: sample.text, status: status, verdict: entry ? entry.status : null,
        note: entry ? entry.note : "", at: entry ? entry.at : "", actor: entry && entry.actor ? copy(entry.actor) : null };
    });
  }
  root.addEventListener("click", function (event) {
    var button = event.target.closest("[data-review-sample], [data-review-verdict], [data-review-edit], [data-studio-environment-adopt], [data-review-baseline-save], [data-review-baseline-clear]");
    if (!button) { return; }
    if (button.hasAttribute("data-review-sample")) { review.selected = button.dataset.reviewSample; Studio.markEdited(); render(); }
    else if (button.hasAttribute("data-review-verdict")) {
      record(selected().id, button.dataset.reviewVerdict, $("[data-review-note]").value);
    } else if (button.hasAttribute("data-review-edit")) {
      var input = $("[data-studio-text]");
      if (returnText === null) { returnText = input.value; }
      input.value = selected().text; input.dispatchEvent(new Event("input", { bubbles: true }));
      $("[data-review-return]").hidden = false; Studio.setPage("edit");
    } else if (button.hasAttribute("data-review-baseline-save")) {
      var snapshot = project(), style = document.createElement("span"); style.style.cssText = Studio.host.style.cssText; style.style.removeProperty("--fy-design");
      tracked("비교 기준 저장", function () {
        review.baseline = { font: copy(snapshot.font), design: copy(snapshot.design), material: copy(snapshot.material),
          at: new Date().toISOString(), hostStyle: style.style.cssText, directSets: directSets() };
      });
      Studio.markEdited(); render(); notify("비교 기준 저장");
    } else if (button.hasAttribute("data-review-baseline-clear")) {
      tracked("비교 기준 지우기", function () { delete review.baseline; });
      Studio.markEdited(); render(); notify("비교 기준 지우기");
    } else if (environmentReady) {
      tracked("저장 환경 기록", function () { savedEnvironment = copy(current().environment); });
      Studio.markEdited(); render(); notify("저장 환경 기록");
    }
  });
  $("[data-review-note]").addEventListener("input", function () {
    var sample = selected(), value = this.value;
    tracked("검수 메모 — " + (sample.title || sample.id), function () {
      var entry = review.records[sample.id];
      if (!entry) { review = Model.mark(review, sample, { fingerprint: current().fingerprint }, null, value); }
      else { entry.note = value; }
    }, "note:" + sample.id);
    Studio.markEdited(); notify("검수 메모");
  });
  /* 보기만 바꾼다 — 기록 줄·저장 안 한 편집 표시·change 사건을 내지 않는다 */
  $("[data-review-look]").addEventListener("change", function () { view.look = this.value; render(); });
  $("[data-review-background]").addEventListener("change", function () { view.background = this.value; render(); });
  $("[data-review-diff]").addEventListener("change", function () {
    diff.on = this.checked;
    if (!diff.on) { dropDiff(); }
    render();
  });
  $("[data-review-custom]").addEventListener("change", function () {
    var value = this.value;
    tracked("검수 문장", function () {
      review.customText = value.slice(0, 500); review.selected = review.customText.trim() ? "custom" : "words";
    });
    Studio.markEdited(); render(); notify("검수 문장");
  });
  Studio.on("project", function (snapshot) {
    snapshot.review = copy(review);
    if (savedEnvironment) { snapshot.reproducibility = copy(savedEnvironment); }
  });
  function load(options) {
    timelineCall("forget", "review");
    review = Model.normalize(options && options.review); savedEnvironment = copy(options && options.reproducibility);
    returnText = null; $("[data-review-return]").hidden = true; schedule();
  }
  /* '이 문장 고치기'로 바꾼 미리보기 글은 검수로 돌아오면 원래 글로 되돌린다. */
  function restoreText(page) {
    if (page !== "review" || returnText === null) { return; }
    var input = $("[data-studio-text]"), text = returnText;
    returnText = null; $("[data-review-return]").hidden = true;
    if (input.value !== text) { input.value = text; input.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  Studio.on("load", load); Studio.on("page", restoreText);
  function activate(ctx) {
    life = ctx;
    ctx.onRender(schedule);
    ctx.listen(window, "resize", schedule);
    if (Studio.design) { ctx.listen(Studio.design, "change", schedule); ctx.listen(Studio.design, "status", schedule); }
    schedule();
  }
  function deactivate() { life = null; clearTimeout(timer); timer = null; }
  if (Studio.f && typeof Studio.f.lifecycle === "function") {
    Studio.f.lifecycle("review", { pages: ["review"], activate: activate, deactivate: deactivate });
  } else {
    activate({ onRender: function (fn) { Studio.on("render", fn); }, listen: function (target, name, fn) { target.addEventListener ? target.addEventListener(name, fn) : target.on(name, fn); },
      work: function () {}, active: function () { return true; } });
  }
  if (Studio.material && Studio.material.onChange) { Studio.material.onChange(schedule); } // 자소판 화소 편집은 CSS를 바꾸지 않는다
  buildSpecimens(false); buildSpecimens(true); probeHost(); setViewReady(); load(Studio.lastLoadOptions());
  function read(url) {
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest(); xhr.open("GET", url, true);
      xhr.onload = function () { resolve(xhr.status === 0 || xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : null); };
      xhr.timeout = 10000; xhr.onerror = xhr.ontimeout = function () { resolve(null); }; xhr.send();
    });
  }
  var runtimeScript = document.querySelector('script[src$="/font-kku.js"]');
  Promise.all([read(runtimeScript ? runtimeScript.src : new URL("../font-kku.js", document.baseURI).href), read(Studio.coreHref())]).then(function (texts) {
    coreResources = [{ kind: "runtime", id: "font-kku.js", fingerprint: texts[0] === null ? null : Repro.fingerprint(texts[0]) },
      { kind: "core-css", id: "font-kku.css", fingerprint: texts[1] === null ? null : Repro.fingerprint(texts[1]) }];
    environmentReady = true; render();
  });
  Studio.review = { state: function () { return copy(review); }, current: current, render: render,
    ready: function () { return environmentReady && probeHost().ready; },
    environment: function () { return Repro.compare(savedEnvironment, current().environment); },
    /* 항목 하나의 지금 그린 모양 서명(시험·자동화) */
    signature: function (id) {
      var sample = Model.samples(review).filter(function (entry) { return entry.id === id; })[0] || selected();
      return signature(sample);
    },
    /* 판정 기록(화면 판정 단추와 같은 길) → { ok, record } | { ok: false, code } — FontStudio.api.review.record가 쓴다 */
    record: record,
    list: list,
    /* 지금 보기(꾸밈·바탕)와 그것을 바꾸기(화면 고르기와 같은 길 — 시험·검수 시트) */
    view: function () { return { look: view.look, background: view.background, tone: toneOf(), themes: Boolean(themes) }; },
    setView: function (next) {
      if (next && typeof next.look === "string") { view.look = next.look && lookInfo(next.look) ? next.look : ""; }
      if (next && typeof next.background === "string") { view.background = next.background && toneInfo(next.background) ? next.background : ""; }
      $("[data-review-look]").value = view.look; $("[data-review-background]").value = view.background;
      render();
      return this.view();
    },
    /* 차이 칠하기 켜고 끄기와 마지막 결과 { state: same|different|unknown, sizes, letters } (꺼졌거나 기준이 없으면 null) */
    setDiff: function (on) { $("[data-review-diff]").checked = Boolean(on); diff.on = Boolean(on); if (!diff.on) { dropDiff(); } render(); return lastDiff; },
    diff: function () { return lastDiff; } };
})();
