/* Font-source character mappings. Semantic jamo stay intact; this editor only changes the drawing source. */
(function () {
  "use strict";
  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var clone = Util.clone;
  var Studio = window.FontStudio, Glyphs = window.FontStudioGlyphs, FontKku = window.FontKku;
  var Design = window.FontStudioDesign;
  if (!Studio || !Studio.design || !Studio.f || !Glyphs) { return; }
  var design = Studio.design;
  var state = { source: "", jamo: "ㅇ", role: "", key: "", timer: null, progressKey: "", draft: null };
  /* 깨어 있을 때만 그린다(탭이 보이고 디자인 페이지이고 본문이 펼쳐져 있을 때 — f-shell 수명, S1). 잠들면 밀린 그리기를 버린다 */
  var life = null;
  var section = Studio.f.mount("glyphs", { label: "글자로 만들기", modes: ["font"],
    activate: function (ctx) { life = ctx; ctx.onRender(schedule); schedule(); },
    deactivate: function () { life = null; clearTimeout(state.timer); state.timer = null; } });
  section.classList.add("studio-glyphs");
  // Only constant markup goes through innerHTML. Every user string uses value/textContent.
  section.innerHTML = '<header class="studio-glyphs-head"><div><h3>자모를 다른 문자로 그리기</h3>' +
    '<p>ㅇ에 O나 0을, ㅣ에 |나 l을 넣어 보세요. 선택하고 복사하는 글자는 원래 한글입니다.</p></div>' +
    '<button type="button" data-glyphs-demo>O와 |로 ‘이’ 만들기</button></header>' +
    '<div class="studio-glyphs-grid"><div class="studio-glyphs-editor">' +
    '<div class="studio-glyphs-target"><label>재료 글꼴<select data-glyphs-source></select></label>' +
    '<label>자모<input data-glyphs-jamo value="ㅇ" list="studio-glyphs-jamo-list" autocomplete="off" /></label>' +
    '<label>쓰는 자리<select data-glyphs-role><option value="">모든 역할</option><option value="initial">초성</option><option value="medial">중성</option><option value="final">종성</option><option value="standalone">낱자</option></select></label></div>' +
    '<datalist id="studio-glyphs-jamo-list"></datalist><p class="studio-glyphs-hint" data-glyphs-inherited></p>' +
    '<div class="studio-glyphs-candidates" data-glyphs-candidates></div>' +
    '<div class="studio-glyphs-actions"><button type="button" data-glyphs-add>후보 더하기</button>' +
    '<label><input type="checkbox" data-glyphs-lock /> 선택한 후보 고정</label></div>' +
    '<p class="studio-glyphs-hint">●로 기본 후보를 고릅니다. 고정한 후보는 씨앗 변주에도 바뀌지 않습니다.</p>' +
    '<div class="studio-glyphs-actions"><button type="button" data-glyphs-apply>매핑 적용</button>' +
    '<button type="button" data-glyphs-unlock hidden>고정 풀고 수정</button><button type="button" data-glyphs-remove>이 매핑 지우기</button></div>' +
    '<p data-glyphs-message role="status"></p></div>' +
    '<aside class="studio-glyphs-preview"><h4>실제 조립 미리보기</h4><label>살펴볼 글<input data-glyphs-text value="이 이이 아이 오이" /></label>' +
    '<div data-glyphs-stage></div><p data-glyphs-trace class="studio-glyphs-hint"></p>' +
    '<fieldset><legend>미리보기 변주</legend><label><input type="checkbox" data-glyphs-vary /> 자모마다 후보 바꾸기</label>' +
    '<label>씨앗<input data-glyphs-seed value="" placeholder="비우면 기본 씨앗" spellcheck="false" /></label>' +
    '<div class="studio-glyphs-actions"><button type="button" data-glyphs-reroll>새 씨앗</button><button type="button" data-glyphs-seed-pin>지금 씨앗 고정</button></div>' +
    '<small>같은 씨앗과 글에서는 같은 후보를 고릅니다. auto만 적으면 후보 변주는 켜지지 않습니다.</small></fieldset>' +
    '<button type="button" data-glyphs-edit>이 글자를 끌어 고치기</button></aside></div>' +
    '<details class="studio-glyphs-coverage" open><summary>준비된 자모와 빠진 자모</summary><div data-glyphs-progress></div>' +
    '<p class="studio-glyphs-hint">원형 8 · 기본 24 · 확장 40을 실제 조립 계획으로 확인합니다. 매핑이 있는 대체 재료는 포함하고, 문자·그림 원본이 없는 획과 확인되지 않은 기기 글꼴은 제외합니다.</p></details>' +
    '<p class="studio-glyphs-capabilities">기기 글꼴 재료: 위치·크기·회전·색·글꼴 굵기·외곽선은 고칠 수 있습니다. 글자 자체의 획 모양 편집과 획순 그리기는 지원하지 않습니다. 직접 그릴 때는 SVG 재료를 고르세요.</p>';
  function $(selector) { return section.querySelector(selector); }
  function message(text, error) { $("[data-glyphs-message]").textContent = text; $("[data-glyphs-message]").dataset.error = String(Boolean(error)); }
  function missingReason(reason) {
    return ({ GLYPH_MAPPING_MISSING: "이 역할에서 쓸 문자 매핑이 없습니다", GLYPH_SOURCE_UNVERIFIED: "이 자모를 그릴 문자 매핑이 확인되지 않았습니다", GLYPH_CANDIDATE_MISSING: "선택한 문자 후보가 없습니다",
      GLYPH_FONT_PENDING: "재료 글꼴을 불러오는 중입니다", GLYPH_FONT_SETTINGS_UNSUPPORTED: "이 글꼴 설정으로 문자를 재기 어렵습니다",
      GLYPH_HEAD_UNSUPPORTED: "이 조립 방식에는 문자 매핑을 쓸 수 없습니다", GLYPH_LAYOUT_UNSUPPORTED: "이 배치에는 문자 매핑을 쓸 수 없습니다",
      GLYPH_MEASUREMENT_UNAVAILABLE: "문자의 잉크 영역을 재지 못했습니다", GLYPH_TEXT_INVALID: "그릴 문자를 확인해 주세요",
      GLYPH_UNSUPPORTED_FONT: "이 글꼴에서 후보 문자를 확인하지 못했습니다" })[reason] || reason;
  }
  function sourceEntries(json) { return Object.keys(json.sources || {}).filter(function (id) { return json.sources[id].kind === "font"; }); }
  function selectedSource(json) { return json.sources && json.sources[state.source]; }
  function exactMapping(json) {
    var source = selectedSource(json);
    return source && (source.glyphs || []).filter(function (entry) { return entry.jamo === state.jamo && (entry.role || "") === state.role; })[0] || null;
  }
  function currentMapping(json) { return Glyphs.getMapping(json, state.source, state.jamo, state.role || undefined); }
  function previewOptions(json) { var value = json && json.editor && json.editor.glyphPreview; return { seed: value && typeof value.seed === "string" ? value.seed : "", jamoSeeds: Boolean(value && value.jamoSeeds) }; }
  var previewOriginals = new WeakMap();
  function applyPreviewOptions(host, json) {
    var current = json || design.json(), declared = current && current.editor && current.editor.glyphPreview;
    if (!declared) {
      if (!previewOriginals.has(host)) { return; }
      var original = previewOriginals.get(host);
      ["seed", "jamo-seeds"].forEach(function (name) { if (original[name] === null) { host.removeAttribute(name); } else { host.setAttribute(name, original[name]); } });
      previewOriginals.delete(host); return;
    }
    if (!previewOriginals.has(host)) { previewOriginals.set(host, { seed: host.getAttribute("seed"), "jamo-seeds": host.getAttribute("jamo-seeds") }); }
    var options = previewOptions(current);
    if (options.seed) { host.setAttribute("seed", options.seed); } else { host.removeAttribute("seed"); }
    if (options.jamoSeeds) { host.setAttribute("jamo-seeds", ""); } else { host.removeAttribute("jamo-seeds"); }
  }
  var stage = $("[data-glyphs-stage]").attachShadow({ mode: "open" });
  var link = document.createElement("link"); link.rel = "stylesheet"; link.href = Studio.coreHref(); stage.appendChild(link);
  var preview = document.createElement("font-kku"); preview.setAttribute("size", "56px"); preview.setAttribute("wrap-unit", "glyph"); stage.appendChild(preview);
  Studio.addPreviewRoot(stage);
  "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㄲㄸㅃㅆㅉㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢㆍ".split("").forEach(function (jamo) {
    var option = document.createElement("option"); option.value = jamo; $("#studio-glyphs-jamo-list").appendChild(option);
  });
  function sample(jamo, role) {
    if (role === "standalone") { return jamo; }
    var cho = Util.CHO, jung = Util.JUNG, jong = " " + Util.JONG;
    if (role === "medial" || !role && jung.indexOf(jamo) >= 0) { return jung.indexOf(jamo) < 0 ? jamo : String.fromCharCode(0xac00 + (11 * 21 + jung.indexOf(jamo)) * 28); }
    if (role === "final") { return jong.indexOf(jamo) < 1 ? jamo : String.fromCharCode(0xac00 + 11 * 21 * 28 + jong.indexOf(jamo)); }
    return cho.indexOf(jamo) < 0 ? jamo : String.fromCharCode(0xac00 + cho.indexOf(jamo) * 21 * 28);
  }
  function resetDraft(json) {
    var mapping = currentMapping(json);
    state.draft = mapping ? clone(mapping) : { jamo: state.jamo, candidates: [{ id: "c1", text: "" }] };
    state.draft.jamo = state.jamo;
    if (state.role) { state.draft.role = state.role; } else { delete state.draft.role; }
    if (!state.draft.selected && state.draft.candidates.length) { state.draft.selected = state.draft.candidates[0].id; }
    renderCandidates(json);
  }
  function renderCandidates(json) {
    var source = selectedSource(json) || {}, inherited = currentMapping(json), exact = exactMapping(json);
    var locked = Boolean(inherited && inherited.locked);
    $("[data-glyphs-inherited]").textContent = inherited && !exact ? "모든 역할의 매핑을 사용 중입니다. 적용하면 이 역할만 따로 정합니다." : "";
    var list = $("[data-glyphs-candidates]"); list.textContent = "";
    state.draft.candidates.forEach(function (candidate, index) {
      var row = document.createElement("div"); row.className = "studio-glyphs-candidate"; row.dataset.glyphsCandidate = String(index);
      var radio = document.createElement("input"); radio.type = "radio"; radio.name = "glyph-default"; radio.checked = state.draft.selected === candidate.id;
      radio.setAttribute("aria-label", "후보 " + (index + 1) + " 기본으로 선택"); radio.disabled = locked;
      radio.addEventListener("change", function () { state.draft.selected = state.draft.candidates[index].id; });
      var idLabel = document.createElement("label"); idLabel.textContent = "후보 이름";
      var id = document.createElement("input"); id.value = candidate.id; id.dataset.glyphsId = ""; id.spellcheck = false; id.disabled = locked;
      id.addEventListener("input", function () { var old = candidate.id; candidate.id = id.value; if (state.draft.selected === old) { state.draft.selected = id.value; } }); idLabel.appendChild(id);
      var textLabel = document.createElement("label"); textLabel.textContent = "그릴 문자";
      var text = document.createElement("input"); text.value = candidate.text; text.dataset.glyphsTextValue = ""; text.spellcheck = false; text.disabled = locked;
      text.addEventListener("input", function () { candidate.text = text.value; swatch.textContent = text.value; }); textLabel.appendChild(text);
      var swatch = document.createElement("span"); swatch.className = "studio-glyphs-swatch"; swatch.textContent = candidate.text;
      swatch.style.fontFamily = source.family || "sans-serif"; swatch.style.fontWeight = source.weight || "normal"; swatch.setAttribute("aria-label", "후보 글자 미리보기");
      var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "빼기"; remove.disabled = locked || state.draft.candidates.length <= 1;
      remove.setAttribute("aria-label", "후보 " + (index + 1) + " 빼기"); remove.addEventListener("click", function () {
        state.draft.candidates.splice(index, 1); if (state.draft.selected === candidate.id) { state.draft.selected = state.draft.candidates[0].id; } renderCandidates(design.json());
      });
      [radio, swatch, idLabel, textLabel, remove].forEach(function (node) { row.appendChild(node); }); list.appendChild(row);
    });
    $("[data-glyphs-lock]").checked = Boolean(state.draft.locked); $("[data-glyphs-lock]").disabled = locked;
    $("[data-glyphs-unlock]").hidden = !locked; $("[data-glyphs-apply]").disabled = locked; $("[data-glyphs-add]").disabled = locked;
    $("[data-glyphs-remove]").disabled = locked || !exact;
  }
  function renderProgress(json) {
    var key = JSON.stringify(json);
    if (state.progressKey === key) { return; }
    state.progressKey = key;
    var holder = $("[data-glyphs-progress]"); holder.textContent = "";
    try {
      var report = Glyphs.progress(json, FontKku, { name: "studio-glyph-progress" });
      report.stages.forEach(function (entry) {
        var details = document.createElement("details"), summary = document.createElement("summary");
        summary.textContent = entry.title + " · " + entry.ready + " / " + entry.total + " 준비" + (entry.fallback ? " (대체 재료 " + entry.fallback + ")" : ""); details.appendChild(summary);
        if (!entry.missing.length) { var p = document.createElement("p"); p.textContent = "이 단계의 자모를 모두 그릴 수 있습니다."; details.appendChild(p); }
        entry.missing.forEach(function (missing) {
          var p = document.createElement("p"); p.textContent = missing.jamo + " · " + (Util.ROLE_LABELS[missing.role] || "") + " — " + missingReason(missing.reason); details.appendChild(p);
        });
        holder.appendChild(details);
      });
    } catch (error) { holder.textContent = "조립 범위를 확인하지 못했습니다: " + error.message; }
  }
  function render() {
    state.timer = null;
    var json = design.json(); applyPreviewOptions(Studio.host, json); exportNote(json);
    if (!life) { return; }
    life.work();
    var ids = sourceEntries(json), sourceSelect = $("[data-glyphs-source]");
    if (ids.indexOf(state.source) < 0) { state.source = ids.indexOf(json.defaults.source) >= 0 ? json.defaults.source : ids[0] || ""; }
    sourceSelect.textContent = ""; ids.forEach(function (id) { var option = document.createElement("option"); option.value = id; option.textContent = json.sources[id].family + " · " + id; sourceSelect.appendChild(option); }); sourceSelect.value = state.source;
    var key = state.source + ":" + state.jamo + ":" + state.role + ":" + JSON.stringify(selectedSource(json));
    if (key !== state.key) { state.key = key; resetDraft(json); }
    $("[data-glyphs-jamo]").value = state.jamo; $("[data-glyphs-role]").value = state.role;
    var options = previewOptions(json); $("[data-glyphs-vary]").checked = options.jamoSeeds;
    if (document.activeElement !== $("[data-glyphs-seed]")) { $("[data-glyphs-seed]").value = options.seed; }
    preview.setAttribute("font", Studio.state.fontId || "sebul"); preview.style.setProperty("--fy-design", design.name()); applyPreviewOptions(preview, json);
    FontKku.render(preview, { text: $("[data-glyphs-text]").value }); FontKku.refreshAll(preview);
    var trace = FontKku.traceOf(preview), selections = [];
    if (trace && trace.nodes) { trace.nodes.forEach(function (node) { (node.requests || []).forEach(function (request) { if (request.glyph) { selections.push(request.glyph.text + " (" + request.glyph.candidate + ")"); } }); }); }
    $("[data-glyphs-trace]").textContent = selections.length ? "지금 그리는 후보: " + selections.join(" · ") : "선택한 글꼴과 매핑으로 조립한 모습입니다. 그리지 못한 자모는 아래 준비 상태를 확인하세요.";
    renderProgress(json);
  }
  function schedule() { clearTimeout(state.timer); state.timer = life ? setTimeout(render, 60) : null; }
  /* 파일 줄의 '문자 매핑은 CSS 파일에 없음' 안내 — 디자인이 바뀔 때마다(어느 페이지에서나) */
  function exportNote(json) {
    document.querySelector("[data-studio-glyph-export-note]").hidden = !sourceEntries(json).some(function (id) { return (json.sources[id].glyphs || []).length > 0; });
  }
  function edit(label, mutate) {
    return design.edit(label, mutate).then(function (result) { message(result.ok ? label + " — 적용했습니다." : "적용하지 못했습니다: " + result.errors.map(function (error) { return error.message; }).join(" · "), !result.ok); if (result.ok) { clearTimeout(state.timer); render(); } return result; });
  }
  function setPreview(seed, vary) {
    return edit("미리보기 변주 바꾸기", function (json) { json.version = "2.0"; json.editor = json.editor || {}; json.editor.glyphPreview = { seed: seed, jamoSeeds: Boolean(vary) }; return json; });
  }
  function demo() {
    return edit("O와 |로 이 만들기", function (json) {
      var next = Design.withMode(json, "font", { families: { base: "Arial" } }).design;
      var source = next.defaults.source;
      next = Glyphs.withMapping(next, source, { jamo: "ㅇ", candidates: [{ id: "letter-o", text: "O" }, { id: "zero", text: "0" }, { id: "brackets", text: "()" }], selected: "letter-o" });
      next = Glyphs.withMapping(next, source, { jamo: "ㅣ", candidates: [{ id: "bar", text: "|" }, { id: "letter-l", text: "l" }], selected: "bar" });
      state.source = source; return next;
    }).then(function (result) { if (result.ok) { design.setApplied(true); state.jamo = "ㅇ"; state.role = ""; $("[data-glyphs-text]").value = "이 이이"; Studio.f.show("glyphs"); schedule(); } return result; });
  }
  section.addEventListener("change", function (event) {
    var target = event.target;
    if (target.matches("[data-glyphs-source]")) { state.source = target.value; state.key = ""; render(); }
    else if (target.matches("[data-glyphs-jamo]")) { state.jamo = target.value.trim(); state.key = ""; $("[data-glyphs-text]").value = sample(state.jamo, state.role); render(); }
    else if (target.matches("[data-glyphs-role]")) { state.role = target.value; state.key = ""; $("[data-glyphs-text]").value = sample(state.jamo, state.role); render(); }
    else if (target.matches("[data-glyphs-lock]")) { state.draft.locked = target.checked; }
    else if (target.matches("[data-glyphs-vary], [data-glyphs-seed]")) { setPreview($("[data-glyphs-seed]").value, $("[data-glyphs-vary]").checked); }
  });
  $("[data-glyphs-text]").addEventListener("input", schedule);
  section.addEventListener("click", function (event) {
    var target = event.target;
    if (target.closest("[data-glyphs-demo]")) { demo(); }
    else if (target.closest("[data-glyphs-add]")) {
      var index = state.draft.candidates.length + 1; while (state.draft.candidates.some(function (entry) { return entry.id === "c" + index; })) { index += 1; }
      state.draft.candidates.push({ id: "c" + index, text: "" }); renderCandidates(design.json());
    } else if (target.closest("[data-glyphs-apply]")) { edit("문자 매핑 적용", function (json) { return Glyphs.withMapping(json, state.source, state.draft); }); }
    else if (target.closest("[data-glyphs-unlock]")) {
      edit("후보 고정 풀기", function (json) { var mapping = clone(currentMapping(json)); mapping.locked = false; return Glyphs.withMapping(json, state.source, mapping); });
    } else if (target.closest("[data-glyphs-remove]")) { edit("문자 매핑 지우기", function (json) { return Glyphs.removeMapping(json, state.source, state.jamo, state.role || undefined); }); }
    else if (target.closest("[data-glyphs-reroll]")) { setPreview(String(Math.floor(Math.random() * 0x7fffffff)), $("[data-glyphs-vary]").checked); }
    else if (target.closest("[data-glyphs-seed-pin]")) { setPreview(preview.getAttribute("data-fy-seed") || $("[data-glyphs-seed]").value, $("[data-glyphs-vary]").checked); }
    else if (target.closest("[data-glyphs-edit]")) { var input = document.querySelector("[data-studio-text]"); input.value = $("[data-glyphs-text]").value; input.dispatchEvent(new Event("input", { bubbles: true })); Studio.setPage("edit"); }
  });
  document.querySelector("[data-glyphs-open]").addEventListener("click", function () { Studio.f.show("glyphs"); });
  design.on("change", function () { applyPreviewOptions(Studio.host); exportNote(design.json()); schedule(); }); Studio.on("load", function () { state.key = ""; schedule(); });
  Studio.glyphs = { demo: demo, render: render, sample: sample, applyPreviewOptions: applyPreviewOptions, previewOptions: previewOptions, setPreview: setPreview, previewHost: preview };
  applyPreviewOptions(Studio.host); exportNote(design.json()); schedule();
})();
