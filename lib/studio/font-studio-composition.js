/* font-studio-composition.js — 작업실 디자인 페이지의 '짓는 방식'(ADR-034 §0·§6, PLAN-COMPOSE-001 C3)
 *
 * 글자를 어떤 덩어리로 지을지 고른다. 고르지 않아도 된다(MEMORY 설계 원칙 5, PLAN-STUDIO-002 원칙 9) — 칸은 접혀 있고 기본은 '모양대로'
 * (지금 출력 그대로)다.
 * - 쉬운 모드: 프리셋 여섯(모양대로·음절로·겹모음 통째로·자모로·조각으로·원형으로)을 그림 단추로. 단추마다 지금 글꼴·재료·모양으로 '화 흙'을
 *   그려 보인다. 이 재료로 짓지 못하는 프리셋(런타임 진단 COMPOSITION_UNSUPPORTED)은 까닭과 함께 막는다 — 다른 방식으로 몰래 바꾸지 않는다.
 * - 정밀 모드: 축 셋(모음 나누기·받침 나누기·조각 깊이)을 따로 고르고(섞이면 '직접 고름'), 자모마다 조립식 탭으로 가는 고리, 지원표
 *   (글꼴 모양 × 프리셋, 지금 재료)를 더한다.
 * - 적는 자리는 둘이다(런타임 차례 ADR-034 §3과 같은 수준):
 *   - 디자인이 미리보기에 걸려 있으면 디자인의 composition(프리셋 이름 하나 또는 { vowel, coda, pieces }) — 글꼴 묶음에 든다.
 *   - 아니면(디자인을 끈 글꼴·디자인을 받지 않는 자소판 글꼴) 글꼴 CSS의 --fy-font-composition. 런타임 차례가 낱 깊이 > 프리셋 > 줄임
 *     깊이(ADR-034 §3)라 기본 제공 글꼴(줄임 --fy-font-jamo-depth만 씀)은 이 한 줄로 바뀐다. 글꼴이 제 낱 깊이(--fy-font-vowel-depth·
 *     --fy-font-coda-depth)를 밝혔고 고른 것과 다르면 그 낱 깊이도 고른 값으로 적는다(누른 것이 먹게). '모양대로'는 프리셋 줄을 지우고 낱 깊이를 글꼴을 열 때의
 *     값으로 되돌린다 — 사람이 쓴 낱 깊이를 지우지 않는다(원칙 '원하면 세세하게'). 고정 글꼴 모양은 tune 계층에 적는다
 *     (FontStudio.setStructureVariables).
 *   어느 쪽이든 고르기 한 번이 기록 한 줄이고 Ctrl+Z가 되돌린다. '모양대로'는 고른 것(디자인 필드·프리셋 줄)을 남기지 않고, 글꼴 제 낱 깊이는 열 때의 값으로 둔다.
 * - 수명(S1): 견본은 칸이 펼쳐져 디자인 페이지에 보일 때만 그린다(f.lifecycle). 지원표는 정밀 모드에서만.
 * 창구: FontStudio.composition — current() · set(value, { label }) · presets() · support()
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var Design = window.FontStudioDesign;
  var block = document.querySelector("[data-studio-composition]");
  if (!Studio || !block || !window.FontKku || !FontKku.compositionPresets) {
    return;
  }

  var PRESETS = ["auto", "syllable", "whole", "jamo", "pieces", "origins"];
  var LABELS = { auto: "모양대로", syllable: "음절로", whole: "겹모음 통째로", jamo: "자모로", pieces: "조각으로", origins: "원형으로",
    custom: "직접 고름" };
  var HINTS = { auto: "글꼴 모양의 기본 그대로", syllable: "화 = 호 + ㅏ", whole: "화 = ㅎ + ㅘ", jamo: "화 = ㅎ + ㅗ + ㅏ",
    pieces: "화 = (ㅗ+ㅇ) + ㅗ + ㅏ", origins: "화 = 원형 획(ㆍ·ㅡ·ㅇ·ㅣ)으로" };
  var AXES = { vowel: ["split", "whole", "syllable"], coda: ["split", "whole"], pieces: ["pieces", "origins"] };
  var AXIS_LABELS = {
    vowel: { "": "모양대로", split: "낱 모음(ㅎ+ㅗ+ㅏ)", whole: "통짜 모음(ㅎ+ㅘ)", syllable: "머리 음절(호+ㅏ)" },
    coda: { "": "모양대로", split: "낱 받침(ㄹ+ㄱ)", whole: "통짜 받침(ㄺ)" },
    pieces: { "": "없음(자모 그대로)", pieces: "조각(ㅎ = ㅗ+ㅇ)", origins: "원형(ㅎ = ㆍ+ㅡ+ㅇ)" }
  };
  var AXIS_NAMES = { vowel: "모음 나누기", coda: "받침 나누기", pieces: "조각 깊이" };
  var NAMES = { composition: "--fy-font-composition", vowel: "--fy-font-vowel-depth", coda: "--fy-font-coda-depth",
    shorthand: "--fy-font-jamo-depth" };
  var SHORTHANDS = { atomic: { vowel: "split", coda: "split" }, composite: { vowel: "whole", coda: "whole" },
    syllable: { vowel: "syllable", coda: "whole" } };
  var REASONS = {
    COMPOSITION_UNSUPPORTED: "이 재료로는 조각으로 짓지 못합니다 — 자모를 통째로 그립니다",
    COMPOSITION_OLD_HANGUL: "옛한글에는 아직 걸지 않습니다",
    COMPOSITION_INVALID: "알 수 없는 값입니다"
  };
  var SHAPES = [
    { profile: "sebul-cases-v1", label: "세벌식" },
    { profile: "sebul-fixed-v1", label: "직결식" },
    { profile: "square-context-v1", label: "네모꼴" }
  ];
  var SAMPLE_TEXT = "화 흙";

  var designSection = document.querySelector("[data-studio-design]");
  var summaryValue = block.querySelector("[data-composition-summary]");
  var whereNote = block.querySelector("[data-composition-where]");
  var presetsBox = block.querySelector("[data-composition-presets]");
  var preciseBox = block.querySelector("[data-composition-precise]");
  var nowOutput = block.querySelector("[data-composition-now]");
  var supportTable = block.querySelector("[data-composition-support]");
  var recipesButton = block.querySelector("[data-composition-recipes]");
  var recipesNote = block.querySelector("[data-composition-recipes-note]");

  // ── 값: 축 셋(spec) ↔ 프리셋 ───────────────────────────────────────────

  function table() {
    return FontKku.compositionPresets.presets;
  }

  function emptySpec() {
    return { vowel: "", coda: "", pieces: "" };
  }

  function specOfPreset(name) {
    if (name === "auto") {
      return emptySpec();
    }
    var entry = table()[name];
    return entry ? { vowel: entry.vowel, coda: entry.coda, pieces: entry.pieces === "none" ? "" : entry.pieces } : null;
  }

  function sameSpec(a, b) {
    return a.vowel === b.vowel && a.coda === b.coda && a.pieces === b.pieces;
  }

  /* 고른 축 셋이 어느 프리셋인가 — 모두 비면 auto, 프리셋 셋과 같으면 그 이름, 아니면 custom */
  function presetOfSpec(spec) {
    if (!spec.vowel && !spec.coda && !spec.pieces) {
      return "auto";
    }
    for (var index = 1; index < PRESETS.length; index += 1) {
      if (sameSpec(spec, specOfPreset(PRESETS[index]))) {
        return PRESETS[index];
      }
    }
    return "custom";
  }

  /* 프리셋 이름·{ preset?, vowel?, coda?, pieces? }·null을 축 셋으로. 모르는 값이면 null */
  function normalize(value) {
    if (value === null || value === undefined || value === "") {
      return emptySpec();
    }
    if (typeof value === "string") {
      return specOfPreset(value.trim().toLowerCase());
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    var spec = value.preset !== undefined && value.preset !== null && value.preset !== "" ? specOfPreset(String(value.preset).trim().toLowerCase())
      : emptySpec();
    if (!spec) {
      return null;
    }
    var bad = false;
    Object.keys(value).forEach(function (key) {
      if (key === "preset") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(AXES, key)) {
        bad = true;
        return;
      }
      var axis = value[key] === null || value[key] === undefined ? "" : String(value[key]).trim().toLowerCase();
      if (axis === "" || axis === "auto" || (key === "pieces" && axis === "none")) {
        spec[key] = "";
      } else if (AXES[key].indexOf(axis) >= 0) {
        spec[key] = axis;
      } else {
        bad = true;
      }
    });
    return bad ? null : spec;
  }

  /* 디자인 필드 값 — auto는 null(필드를 지운다), 프리셋은 이름, 섞이면 빈 축을 뺀 { vowel?, coda?, pieces? } */
  function designValue(spec) {
    var preset = presetOfSpec(spec);
    if (preset === "auto") {
      return null;
    }
    if (preset !== "custom") {
      return preset;
    }
    var out = {};
    ["vowel", "coda", "pieces"].forEach(function (axis) {
      if (spec[axis]) {
        out[axis] = spec[axis];
      }
    });
    return out;
  }

  // ── 적는 자리 ─────────────────────────────────────────────────────────

  /* 디자인이 미리보기에 걸려 있는가 — 그러면 디자인에, 아니면 글꼴 CSS에 적는다 */
  function designPath() {
    var state = designSection ? designSection.dataset.designState : "";
    return Boolean(Studio.design && Studio.design.name && Studio.design.name() && (state === "applied" || state === "pending"));
  }

  function where() {
    return designPath() ? "design" : "css";
  }

  /* 글꼴을 열 때 글꼴 CSS에 있던 값 — '모양대로'가 되돌릴 자리. 글꼴이 제 낱 깊이를 밝혔으면 그것도 '모양대로'의 일부다 */
  var original = { composition: "", vowel: "", coda: "" };

  function structureToken(name, allowed) {
    if (typeof Studio.structureValue !== "function") {
      return "";
    }
    var value = String(Studio.structureValue(name) || "").trim().toLowerCase();
    return !allowed || allowed.indexOf(value) >= 0 ? value : "";
  }

  function captureOriginal() {
    original = { composition: structureToken(NAMES.composition), vowel: structureToken(NAMES.vowel, AXES.vowel),
      coda: structureToken(NAMES.coda, AXES.coda) };
  }

  function chosenSpec() {
    if (designPath()) {
      return normalize(Studio.design.json().composition) || emptySpec();
    }
    if (typeof Studio.structureValue !== "function") {
      return emptySpec();
    }
    var preset = structureToken(NAMES.composition);
    var base = preset ? specOfPreset(preset) || emptySpec() : emptySpec();
    /* 낱 깊이는 글꼴을 열 때와 다를 때만 고른 것이다(같으면 글꼴 제 값 — 모양대로의 일부) */
    var vowel = structureToken(NAMES.vowel, AXES.vowel);
    var coda = structureToken(NAMES.coda, AXES.coda);
    var spec = { vowel: base.vowel, coda: base.coda, pieces: base.pieces };
    if (vowel && vowel !== original.vowel) { spec.vowel = vowel; }
    if (coda && coda !== original.coda) { spec.coda = coda; }
    return spec;
  }

  function resolved() {
    var host = Studio.host;
    if (!host || !Studio.doc || !Studio.doc()) {
      return null;
    }
    var info = FontKku.fontInfo ? FontKku.fontInfo(host) : null;
    return info && info.composition ? JSON.parse(JSON.stringify(info.composition)) : null;
  }

  function current() {
    var spec = chosenSpec();
    return { preset: presetOfSpec(spec), spec: spec, where: where(), resolved: resolved() };
  }

  /* 거절 표는 이 파일 뒤에 실린다 — 부를 때 찾는다 */
  function refusal(code, params) {
    var table = window.FontStudioRefusals;
    if (table && table.has(code)) {
      return table.make(code, params || {});
    }
    return { code: code, message: code };
  }

  /* 고르기 → Promise<{ ok, refused, composition }>. 기록 한 줄(디자인이면 디자인 기록, 글꼴 CSS면 CSS 기록) */
  function set(value, options) {
    var opts = options || {};
    var spec = normalize(value);
    if (!spec) {
      var bad = refusal("COMPOSITION_INVALID", { value: typeof value === "string" ? value : JSON.stringify(value) });
      if (!opts.quiet && typeof Studio.message === "function") {
        Studio.message(window.FontStudioRefusals ? window.FontStudioRefusals.line(bad) : bad.message, "warn");
      }
      return Promise.resolve({ ok: false, refused: [bad], composition: current() });
    }
    if (!Studio.doc || !Studio.doc()) {
      return Promise.resolve({ ok: false, refused: [refusal("NO_FONT")], composition: null });
    }
    var preset = presetOfSpec(spec);
    var label = "짓는 방식: " + (opts.label || (preset === "custom" ? describe(spec) : LABELS[preset]));
    if (sameSpec(spec, chosenSpec())) {
      return Promise.resolve({ ok: true, refused: [], composition: current(), unchanged: true });
    }
    var done;
    if (designPath()) {
      done = Studio.design.edit(label, function (draft) {
        var next = designValue(spec);
        if (next === null) {
          delete draft.composition;
        } else {
          draft.composition = next;
        }
      }).then(function (result) {
        return { ok: Boolean(result && result.ok), errors: result ? result.errors : [] };
      });
    } else {
      var changed = Studio.setStructureVariables(cssWrites(spec, preset), label);
      done = Promise.resolve({ ok: changed !== false, errors: [] });
    }
    return done.then(function (result) {
      return Promise.resolve(typeof Studio.settled === "function" ? Studio.settled() : true).then(function () {
        sync();
        return { ok: result.ok, refused: result.ok ? [] : [refusal("COMPOSITION_INVALID", { value: JSON.stringify(designValue(spec)) })],
          composition: current() };
      });
    });
  }

  /* 글꼴 CSS 길에 적을 것 — 프리셋은 --fy-font-composition 한 줄. 낱 깊이는 고른 축이 프리셋과 다르거나(custom) 글꼴 제 낱 깊이가
   * 고른 값과 부딪칠 때만 적고, 아니면 글꼴을 열 때의 값으로 둔다. auto는 셋 모두 글꼴을 열 때의 값으로 */
  function cssWrites(spec, preset) {
    if (preset === "auto") {
      /* 프리셋은 늘 고른 것이라 지운다. 낱 깊이는 글꼴을 열 때의 값으로(사람이 쓴 세세한 값을 지우지 않는다) */
      return [[NAMES.composition, ""], [NAMES.vowel, original.vowel], [NAMES.coda, original.coda]];
    }
    var baseName = preset !== "custom" ? preset : spec.pieces === "origins" ? "origins" : spec.pieces === "pieces" ? "pieces" : "jamo";
    var base = specOfPreset(baseName) || emptySpec();
    var writes = [[NAMES.composition, baseName]];
    ["vowel", "coda"].forEach(function (axis) {
      var target = spec[axis] || base[axis];
      var need = target !== base[axis] || (original[axis] && original[axis] !== target);
      writes.push([NAMES[axis], need ? target : original[axis]]);
    });
    return writes;
  }

  function describe(spec) {
    return ["vowel", "coda", "pieces"].map(function (axis) {
      return AXIS_NAMES[axis] + " " + AXIS_LABELS[axis][spec[axis]].replace(/\(.*\)$/, "");
    }).join(" · ");
  }

  // ── 화면 ──────────────────────────────────────────────────────────────

  var sampleChrome = new CSSStyleSheet();
  sampleChrome.replaceSync([
    ":host { display: block; }",
    "font-kku { display: block; line-height: 1.2; }"
  ].join("\n"));
  var samples = {};

  function buildButtons() {
    PRESETS.forEach(function (name) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "studio-composition-preset";
      button.dataset.compositionPreset = name;
      button.setAttribute("aria-pressed", "false");
      var stage = document.createElement("span");
      stage.className = "studio-composition-sample";
      stage.setAttribute("aria-hidden", "true");
      var root = stage.attachShadow({ mode: "open" });
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = Studio.coreHref();
      root.appendChild(link);
      var host = document.createElement("font-kku");
      host.setAttribute("size", "30");
      host.setAttribute("wrap-unit", "glyph");
      host.dataset.compositionSampleHost = name;
      root.appendChild(host);
      root.addEventListener("font-kku:render", scheduleStatus);
      var title = document.createElement("strong");
      title.textContent = LABELS[name];
      var hint = document.createElement("span");
      hint.className = "studio-composition-hint";
      hint.textContent = HINTS[name];
      var reason = document.createElement("small");
      reason.className = "studio-composition-reason";
      reason.dataset.compositionReason = "";
      reason.hidden = true;
      button.appendChild(stage);
      button.appendChild(title);
      button.appendChild(hint);
      button.appendChild(reason);
      presetsBox.appendChild(button);
      samples[name] = { button: button, root: root, host: host, reason: reason, status: "" };
    });
  }

  function axisSelects() {
    return Array.prototype.slice.call(block.querySelectorAll("[data-composition-axis]"));
  }

  function buildSelects() {
    axisSelects().forEach(function (select) {
      var axis = select.dataset.compositionAxis;
      [""].concat(AXES[axis]).forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = AXIS_LABELS[axis][value];
        select.appendChild(option);
      });
    });
  }

  /* 지금 그릴 글꼴의 기본 나누기(고르지 않았을 때) — '모양대로' 견본이 쓴다. 고정 모양은 프로파일 기본(그 위 tune 줄임 이름),
   * 네모꼴은 글꼴의 줄임 이름, 없으면 낱 + 낱(런타임 기본) */
  function defaultAxes() {
    var host = Studio.host;
    var shorthand = typeof Studio.structureValue === "function" ? Studio.structureValue(NAMES.shorthand) : null;
    var key = shorthand ? String(shorthand).trim().toLowerCase() : "";
    if (SHORTHANDS[key]) {
      return SHORTHANDS[key];
    }
    var profile = host && host.dataset.fyLayout && FontKku.layoutProfiles ? FontKku.layoutProfiles[host.dataset.fyLayout] : null;
    if (profile && profile.depth) {
      return { vowel: profile.depth.vowel, coda: profile.depth.coda };
    }
    return { vowel: "split", coda: "split" };
  }

  function designName() {
    return designPath() ? Studio.design.name() : null;
  }

  /* '모양대로' 견본(디자인 길) — 지금 디자인에서 composition만 뺀 임시 등록 */
  var autoLease = null;

  function autoDesignName() {
    var json = Studio.design.json();
    if (!json || json.composition === undefined) {
      releaseAuto();
      return Studio.design.name();
    }
    var plain = JSON.parse(JSON.stringify(json));
    delete plain.composition;
    try {
      if (autoLease) {
        autoLease.update(plain);
      } else {
        autoLease = Studio.design.lease(plain);
      }
      return autoLease.name;
    } catch (error) {
      return Studio.design.name();
    }
  }

  function releaseAuto() {
    if (autoLease) {
      autoLease.release();
      autoLease = null;
    }
  }

  function drawSample(name) {
    var entry = samples[name];
    var host = entry.host;
    host.setAttribute("font", Studio.state.fontId);
    if (Studio.glyphs && typeof Studio.glyphs.applyPreviewOptions === "function") {
      Studio.glyphs.applyPreviewOptions(host, Studio.design ? Studio.design.json() : null);
    }
    ["--fy-design", "--fy-composition", "--fy-vowel-depth", "--fy-coda-depth"].forEach(function (property) {
      host.style.removeProperty(property);
    });
    var design = designName();
    if (name === "auto") {
      if (design) {
        host.style.setProperty("--fy-design", autoDesignName());
      } else {
        /* 글꼴 CSS 길: 페이지 수준으로 '조각 없음 + 글꼴의 기본 나누기'를 밝혀 글꼴 CSS에 적은 짓는 방식을 덮는다 */
        var axes = defaultAxes();
        host.style.setProperty("--fy-composition", "jamo");
        host.style.setProperty("--fy-vowel-depth", axes.vowel);
        host.style.setProperty("--fy-coda-depth", axes.coda);
      }
    } else {
      if (design) {
        host.style.setProperty("--fy-design", design);
      }
      host.style.setProperty("--fy-composition", name);
    }
    FontKku.render(host, { text: SAMPLE_TEXT });
    FontKku.refreshAll(host);
  }

  function parkSamples() {
    PRESETS.forEach(function (name) {
      var host = samples[name].host;
      host.style.removeProperty("--fy-design");
      FontKku.render(host, { text: "" });
    });
    releaseAuto();
  }

  var statusTimer = null;

  function scheduleStatus() {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(readStatus, 30);
  }

  /* 견본마다 런타임 진단 → 막을 것과 까닭. 모양대로는 막지 않는다 */
  function readStatus() {
    statusTimer = null;
    PRESETS.forEach(function (name) {
      var entry = samples[name];
      var codes = String(entry.host.getAttribute("data-fy-composition-status") || "").split(/\s+/).filter(Boolean);
      var blocking = name === "auto" ? null : codes.filter(function (code) { return REASONS[code] && code !== "COMPOSITION_OLD_HANGUL"; })[0] || null;
      entry.status = blocking || "";
      entry.button.disabled = Boolean(blocking);
      entry.button.dataset.compositionBlocked = blocking ? "true" : "false";
      entry.reason.hidden = !blocking;
      entry.reason.textContent = blocking ? REASONS[blocking] : "";
      entry.button.title = blocking ? REASONS[blocking] : HINTS[name];
    });
  }

  function syncChoice() {
    var info = current();
    PRESETS.forEach(function (name) {
      samples[name].button.setAttribute("aria-pressed", String(info.preset === name));
    });
    block.dataset.compositionCurrent = info.preset; // 단추의 [data-composition-preset]와 이름을 나눈다
    block.dataset.compositionIn = info.where;
    summaryValue.textContent = LABELS[info.preset] || info.preset;
    whereNote.textContent = info.where === "design"
      ? "고르면 디자인에 적습니다 — 글꼴 묶음에 함께 저장되고 Ctrl+Z로 되돌립니다."
      : "디자인을 쓰지 않는 글꼴이라 글꼴 CSS에 적습니다 — Ctrl+Z로 되돌립니다.";
    axisSelects().forEach(function (select) {
      select.value = info.spec[select.dataset.compositionAxis];
    });
    var drawn = info.resolved;
    nowOutput.textContent = drawn
      ? "지금 그리는 것: " + AXIS_NAMES.vowel + " " + (AXIS_LABELS.vowel[drawn.vowel] || drawn.vowel) + " · " + AXIS_NAMES.coda + " " +
        (AXIS_LABELS.coda[drawn.coda] || drawn.coda) + " · " + AXIS_NAMES.pieces + " " +
        (AXIS_LABELS.pieces[drawn.pieces === "none" ? "" : drawn.pieces] || drawn.pieces)
      : "지금 그리는 것: 고르지 않음(글꼴 모양의 기본)";
  }

  // ── 지원표(정밀) ──────────────────────────────────────────────────────

  var supportStage = null;
  var supportRoot = null;
  var supportHosts = [];
  var supportLeases = [];

  function buildSupportStage() {
    supportStage = document.createElement("div");
    supportStage.className = "studio-composition-support-stage";
    supportStage.setAttribute("aria-hidden", "true");
    supportRoot = supportStage.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = Studio.coreHref();
    supportRoot.appendChild(link);
    supportRoot.addEventListener("font-kku:render", scheduleSupport);
    preciseBox.appendChild(supportStage);
  }

  function supportRows() {
    if (!designPath()) {
      return [{ label: "이 글꼴(" + (Studio.state.fontId || "?") + ")", design: null, blocked: "" }];
    }
    return SHAPES.map(function (shape) {
      var result = Design && typeof Design.withLayout === "function"
        ? Design.withLayout(Studio.design.json(), shape.profile, FontKku.layoutProfiles || {}) : null;
      if (!result || !result.design) {
        return { label: shape.label, design: null, blocked: "이 디자인은 이 모양으로 바꿀 수 없습니다(합자 모음 규칙)" };
      }
      var plain = JSON.parse(JSON.stringify(result.design));
      delete plain.composition;
      try {
        var lease = Studio.design.lease(plain);
        supportLeases.push(lease);
        return { label: shape.label, design: lease.name, blocked: "" };
      } catch (error) {
        return { label: shape.label, design: null, blocked: "검사에 걸려 그릴 수 없습니다" };
      }
    });
  }

  function releaseSupport() {
    supportLeases.splice(0).forEach(function (lease) { lease.release(); });
    supportHosts.splice(0).forEach(function (entry) { entry.host.remove(); });
  }

  var supportPlan = [];

  function drawSupport() {
    releaseSupport();
    if (!Studio.state.fontId || !Studio.doc()) {
      return;
    }
    supportPlan = supportRows();
    supportPlan.forEach(function (row, rowIndex) {
      if (row.blocked) {
        return;
      }
      PRESETS.slice(1).forEach(function (name) {
        var host = document.createElement("font-kku");
        host.setAttribute("font", Studio.state.fontId);
        host.setAttribute("size", "16");
        if (row.design) {
          host.style.setProperty("--fy-design", row.design);
        }
        host.style.setProperty("--fy-composition", name);
        supportRoot.appendChild(host);
        supportHosts.push({ host: host, row: rowIndex, preset: name });
        FontKku.render(host, { text: SAMPLE_TEXT });
      });
    });
    scheduleSupport();
  }

  var supportTimer = null;

  function scheduleSupport() {
    clearTimeout(supportTimer);
    supportTimer = setTimeout(fillSupport, 40);
  }

  function fillSupport() {
    supportTimer = null;
    var body = supportTable.tBodies[0] || supportTable.createTBody();
    body.textContent = "";
    supportPlan.forEach(function (row, rowIndex) {
      var tr = document.createElement("tr");
      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = row.label;
      tr.appendChild(th);
      PRESETS.slice(1).forEach(function (name) {
        var td = document.createElement("td");
        if (row.blocked) {
          td.textContent = "—";
          td.title = row.blocked;
          td.dataset.compositionSupport = "blocked";
        } else {
          var hit = supportHosts.filter(function (entry) { return entry.row === rowIndex && entry.preset === name; })[0];
          var codes = hit ? String(hit.host.getAttribute("data-fy-composition-status") || "").split(/\s+/).filter(Boolean) : [];
          var blocking = codes.filter(function (code) { return REASONS[code] && code !== "COMPOSITION_OLD_HANGUL"; })[0];
          td.textContent = blocking ? "막힘" : "됨";
          td.title = blocking ? REASONS[blocking] : LABELS[name] + " — 됨";
          td.dataset.compositionSupport = blocking ? "blocked" : "ok";
        }
        td.dataset.preset = name;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    supportTable.dataset.compositionSupportRows = String(supportPlan.length);
  }

  function supportSnapshot() {
    return supportPlan.map(function (row, rowIndex) {
      var cells = {};
      PRESETS.slice(1).forEach(function (name) {
        var td = supportTable.querySelector("tbody tr:nth-child(" + (rowIndex + 1) + ") td[data-preset=\"" + name + "\"]");
        cells[name] = td ? td.dataset.compositionSupport : null;
      });
      return { shape: row.label, cells: cells };
    });
  }

  // ── 수명과 사건 ───────────────────────────────────────────────────────

  var life = null;
  var supportLife = null;
  var drawTimer = null;

  function sync() {
    syncChoice();
    if (life && life.active()) {
      scheduleDraw();
    }
    if (supportLife && supportLife.active()) {
      scheduleSupportDraw();
    }
  }

  function scheduleDraw() {
    var ctx = life && life.ctx();
    if (!ctx) {
      return;
    }
    clearTimeout(drawTimer);
    drawTimer = ctx.setTimeout(function () {
      drawTimer = null;
      if (!Studio.state.fontId || !Studio.doc()) {
        return;
      }
      PRESETS.forEach(drawSample);
      ctx.work();
      scheduleStatus();
    }, 60);
  }

  var supportDrawTimer = null;

  function scheduleSupportDraw() {
    var ctx = supportLife && supportLife.ctx();
    if (!ctx) {
      return;
    }
    clearTimeout(supportDrawTimer);
    supportDrawTimer = ctx.setTimeout(function () {
      supportDrawTimer = null;
      drawSupport();
      ctx.work();
    }, 120);
  }

  /* 칸이 접혀 있으면 견본 칸을 [hidden]으로 — 수명이 잠든다(접힌 칸의 견본은 그리지 않는다) */
  function syncOpen() {
    var open = block.open;
    presetsBox.hidden = !open;
    preciseBox.hidden = !open;
    if (Studio.f && typeof Studio.f.sync === "function") {
      Studio.f.sync();
    }
  }

  buildButtons();
  buildSelects();
  buildSupportStage();

  presetsBox.addEventListener("click", function (event) {
    var button = event.target.closest("[data-composition-preset]");
    if (!button || button.disabled) {
      return;
    }
    set(button.dataset.compositionPreset);
  });

  axisSelects().forEach(function (select) {
    select.addEventListener("change", function () {
      var spec = chosenSpec();
      spec[select.dataset.compositionAxis] = select.value;
      set({ vowel: spec.vowel, coda: spec.coda, pieces: spec.pieces },
        { label: AXIS_NAMES[select.dataset.compositionAxis] + " " + AXIS_LABELS[select.dataset.compositionAxis][select.value].replace(/\(.*\)$/, "") });
    });
  });

  recipesButton.addEventListener("click", function () {
    var shown = Studio.f && typeof Studio.f.show === "function" ? Studio.f.show("recipes") : false;
    recipesNote.hidden = Boolean(shown);
    if (shown) {
      var panel = document.querySelector('[data-studio-f="recipes"]');
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ block: "nearest" });
      }
    }
  });

  block.addEventListener("toggle", syncOpen);

  if (Studio.f && typeof Studio.f.lifecycle === "function") {
    life = Studio.f.lifecycle("composition", {
      pages: ["design"],
      element: presetsBox,
      activate: function (ctx) {
        PRESETS.forEach(function (name) { ctx.lease(samples[name].root, [sampleChrome]); });
        ctx.onRender(function () { scheduleDraw(); });
        ctx.on("load", function () { syncChoice(); scheduleDraw(); });
        if (Studio.design) {
          ctx.listen(Studio.design, "change", function () { syncChoice(); scheduleDraw(); });
        }
        syncChoice();
        scheduleDraw();
      },
      deactivate: function () {
        drawTimer = null;
        parkSamples();
      }
    });
    supportLife = Studio.f.lifecycle("composition-support", {
      pages: ["design"],
      mode: "precise",
      element: preciseBox,
      activate: function (ctx) {
        ctx.lease(supportRoot, []);
        ctx.onRender(function () { scheduleSupportDraw(); });
        if (Studio.design) {
          ctx.listen(Studio.design, "change", function () { scheduleSupportDraw(); });
        }
        scheduleSupportDraw();
      },
      deactivate: function () {
        supportDrawTimer = null;
        releaseSupport();
      }
    });
  }

  /* 디자인이 켜지고 꺼지면 적는 자리가 바뀐다 — 칸이 접혀 있어도 요약 줄은 맞춘다 */
  if (Studio.design && typeof Studio.design.on === "function") {
    Studio.design.on("change", syncChoice);
    Studio.design.on("status", syncChoice);
  }
  if (typeof Studio.on === "function") {
    Studio.on("load", function () {
      captureOriginal();
      syncChoice();
    });
    Studio.on("render", function () {
      if (!life || !life.active()) {
        syncChoice();
      }
    });
  }
  syncOpen();
  if (Studio.doc && Studio.doc()) {
    captureOriginal();
  }
  syncChoice();

  Studio.composition = {
    PRESETS: PRESETS.slice(),
    LABELS: JSON.parse(JSON.stringify(LABELS)),
    /* { preset: auto|syllable|whole|jamo|pieces|origins|custom, spec: { vowel, coda, pieces }, where: design|css, resolved } */
    current: current,
    /* 고르기 — 프리셋 이름 · { preset?, vowel?, coda?, pieces? } · null(모양대로) → Promise<{ ok, refused, composition }> */
    set: set,
    normalize: normalize,
    /* 견본 단추의 상태 { 프리셋: { pressed, blocked, reason } } — 시험·자동화 */
    presets: function () {
      var out = {};
      PRESETS.forEach(function (name) {
        var entry = samples[name];
        out[name] = { pressed: entry.button.getAttribute("aria-pressed") === "true", blocked: entry.button.disabled,
          reason: entry.reason.textContent || null };
      });
      return out;
    },
    /* 지원표(정밀 모드에서 그린 것) [{ shape, cells: { 프리셋: ok|blocked } }] */
    support: supportSnapshot,
    open: function (on) {
      block.open = on !== false;
      syncOpen();
      return block.open;
    },
    active: function () { return Boolean(life && life.active()); }
  };
})();
