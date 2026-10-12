/* 글꼴 페이지의 여섯 축 — 축 그림, 테마 갤러리, 조합기 (ADR-017).
 *
 * 자료는 site/themes-data.js의 window.FontKkuThemes다(spec/themes.json에서 scripts/build_looks.js가
 * 만든다). 글꼴·꾸밈·변주·움직임·상호작용·바탕 여섯 축의 목록과 테마, 테마마다 풀어 둔 조합법
 * (recipes: font, classes, seed, jamoSeeds, animate, fx, addons, tone)이 들어 있다. 이 파일은 그 자료만
 * 읽어 화면을 그리므로 정본에 글꼴·꾸밈·테마가 늘면 페이지에도 저절로 는다.
 *
 * 조합 하나는 같은 모양의 두 표현을 갖는다.
 *   상태(state)   조합기 조작 단위: font, look, vary[], seed("off"|"auto"|"fixed"), seedValue,
 *                 motion, fx, tone, text
 *   조합법(recipe) 바탕 요소에 붙일 것과 불러올 것: themes-data.js recipes와 같은 모양
 * 화면의 견본과 '코드 복사'는 같은 조합법에서 나오므로 어긋나지 않는다.
 *
 * 테마 카드 견본은 화면에 다가올 때 그리고(IntersectionObserver), 화면 밖으로 나가면
 * data-kku-paused로 움직임을 세운다. 상호작용은 font-kku-fx.js의 선언(data-kku-fx)으로 단다.
 * 조합기 상태는 주소 해시 #compose=…에 담겨 링크로 나눈다(꾸미기 창의 #kku=와 따로 논다).
 *
 * 쓰는 법: FontKkuThemesPage.init({ cdn, copyText, onFont }) — onFont(id)는 글꼴 견본 행으로. */
(function () {
  "use strict";

  var T = window.FontKkuThemes;
  var AXIS_IDS = ["font", "look", "vary", "motion", "interaction", "tone"];
  var DARK_TONES = ["dark", "board", "blueprint"];
  var FONT_GROUPS = [
    { id: "system", name: "기기 글꼴", note: "기기에 깔린 한글 글꼴을 재료로 자모를 다시 짠다" },
    { id: "sprite", name: "그림 자소", note: "직접 그린 자소판(SVG)으로 긋는다" },
    { id: "texture", name: "획 표현", note: "그림 자소 짜임에 획 재료만 바꿨다" },
    { id: "starter", name: "출발용", note: "내 자소판을 그려 넣는 뼈대" }
  ];
  var FILTERS = [
    { id: "all", label: "모두" },
    { id: "look", label: "꾸밈" },
    { id: "vary", label: "변주" },
    { id: "motion", label: "움직임" },
    { id: "fx", label: "상호작용" },
    { id: "sprite", label: "그림 자소" },
    { id: "dark", label: "어두운 바탕" }
  ];
  var SEED = /^[a-z0-9가-힣-]{1,16}$/i;
  var DEFAULT_TEXT = "한글 꾸미기";

  var config = null;
  var compose = null;
  var composeHost = null;
  var composeStage = null;
  var controller = null;
  var hashTimer = 0;
  var galleryTimer = 0;
  var interacted = false;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function has(map, key) {
    return Boolean(map) && Object.prototype.hasOwnProperty.call(map, key);
  }

  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function reducedMotion() {
    return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ── 상태와 조합법 ──────────────────────────────────────

  /* 글꼴이 권하는 바탕(정본 fonts[id].tone) — 꾸밈 없이 그 글꼴을 고르면 이 바탕이 기본이다. */
  function fontTone(id) {
    return (T.fonts[id] && T.fonts[id].tone) || "light";
  }

  function defaultState() {
    return { font: "sebul", look: "", vary: [], seed: "off", seedValue: "kku", motion: "", fx: "", tone: "light", text: "" };
  }

  function themeState(id) {
    var theme = T.themes[id];
    if (!theme) return null;
    var s = defaultState();
    s.font = theme.font;
    s.look = theme.look || "";
    s.vary = (theme.vary || []).slice();
    if (theme.seed) {
      s.seed = theme.seed === "auto" ? "auto" : "fixed";
      if (s.seed === "fixed") s.seedValue = String(theme.seed);
    } else if (s.vary.length) {
      s.seed = "auto";
    }
    s.motion = theme.motion || "";
    s.fx = theme.interaction || "";
    s.tone = theme.tone || "light";
    return s;
  }

  function sanitize(raw) {
    var s = defaultState();
    if (!raw) return s;
    if (has(T.fonts, raw.font)) s.font = raw.font;
    if (has(T.looks, raw.look)) s.look = raw.look;
    s.vary = (raw.vary || []).filter(function (id, i, list) {
      return has(T.variations, id) && list.indexOf(id) === i;
    });
    if (["off", "auto", "fixed"].indexOf(raw.seed) !== -1) s.seed = raw.seed;
    if (typeof raw.seedValue === "string" && SEED.test(raw.seedValue)) s.seedValue = raw.seedValue;
    if (s.vary.length && s.seed === "off") s.seed = "auto";
    if (has(T.motions, raw.motion)) s.motion = raw.motion;
    if (has(T.interactions, raw.fx)) s.fx = raw.fx;
    if (has(T.tones, raw.tone)) s.tone = raw.tone;
    if (typeof raw.text === "string") s.text = raw.text.slice(0, 40);
    return s;
  }

  /* 제 색을 가진 글꼴(그림 자소·먹색 마스크 칠·말랑)을 꾸밈 없이 권장과 반대 밝기의 바탕에 두면 글자가
   * 묻힌다(검은 자소판 + 어두운 바탕, 흰 분필 + 밝은 바탕). 그때만 바탕의 글자색을 칠하고, 자소판은
   * 마스크 칠로 그 색을 받는다. 꾸밈을 고르면 꾸밈이 칠을 정하므로 손대지 않는다. */
  var DARK_TONES = ["dark", "board", "blueprint"];
  function inkFor(s) {
    var font = T.fonts[s.font];
    if (s.look || !font || (font.group === "system" && !font.base)) return null;
    var fontDark = DARK_TONES.indexOf(font.tone || "light") !== -1;
    var toneDark = DARK_TONES.indexOf(s.tone) !== -1;
    return fontDark === toneDark ? null : (T.tones[s.tone] || T.tones.light).ink;
  }

  /* 획 단위 변주·움직임(ADR-018)은 벡터 자소에서만 획으로 쪼개진다 — 글꼴에 벡터 자소 모듈(jamoSet)이
   * 있으면 jamo-set을 단다(scripts/build_looks.js recipeFor와 같은 규칙). */
  function strokeLevel(s) {
    return s.vary.some(function (id) {
      var materials = T.variations[id] && T.variations[id].materials;
      return Boolean(materials) && materials.length === 1 && materials[0] === "vector";
    }) || Boolean(s.motion && T.motions[s.motion] && T.motions[s.motion].unit === "hoek");
  }

  function recipeOf(s) {
    var classes = [];
    if (s.look) classes.push("kku-look-" + s.look);
    s.vary.forEach(function (id) { classes.push("kku-vary-" + id); });
    var motion = s.motion ? T.motions[s.motion] : null;
    var addons = [];
    if (classes.length) addons.push("looks");
    if (motion && motion.source === "motion") addons.push("motion");
    if (s.fx) addons.push("fx");
    var seeded = s.seed !== "off";
    var recipe = {
      ink: inkFor(s),
      font: s.font,
      classes: classes,
      seed: seeded ? (s.seed === "auto" ? "auto" : s.seedValue) : null,
      jamoSeeds: seeded,
      animate: s.motion || null,
      fx: s.fx || null,
      addons: addons,
      tone: s.tone
    };
    var font = T.fonts[s.font];
    if (font && font.jamoSet && strokeLevel(s)) recipe.jamoSet = font.jamoSet;
    return recipe;
  }

  /* 같은 조합인 테마가 있으면 그 id. */
  function themeMatching(s) {
    var key = JSON.stringify(recipeOf(s));
    var found = "";
    Object.keys(T.themes).some(function (id) {
      if (JSON.stringify(recipeOf(themeState(id))) === key) {
        found = id;
        return true;
      }
      return false;
    });
    return found;
  }

  function shortcutOf(recipe, themeId) {
    var theme = themeId && T.themes[themeId];
    return theme && theme.shortcut ? theme.shortcut : "";
  }

  // ── 코드 ───────────────────────────────────────────────

  /* 바탕 요소 속성. 견본과 코드가 같은 문자열을 쓴다. */
  function hostAttrs(recipe, size) {
    var out = ' font="' + esc(recipe.font) + '"';
    if (recipe.jamoSet) out += ' jamo-set="' + esc(recipe.jamoSet) + '"';
    if (recipe.classes.length) out += ' class="' + esc(recipe.classes.join(" ")) + '"';
    if (recipe.seed) out += ' seed="' + esc(recipe.seed) + '"';
    if (recipe.jamoSeeds) out += " jamo-seeds";
    if (recipe.animate) out += ' animate="' + esc(recipe.animate) + '"';
    if (recipe.fx) out += ' data-kku-fx="' + esc(recipe.fx) + '"';
    if (recipe.ink) out += ' style="color: ' + esc(recipe.ink) + '; --fy-sprite-paint: mask"';
    if (size) out += ' size="' + esc(size) + '"';
    return out;
  }

  /* 가져가서 그대로 여는 HTML 한 장. shortcut이면 같은 모양을 내는 꾸러미 글꼴 한 장으로. */
  function snippet(recipe, text, shortcut) {
    var words = esc(text || DEFAULT_TEXT);
    var tone = T.tones[recipe.tone] || T.tones.light;
    var fonts = shortcut || recipe.font;
    var lines = [
      "<!doctype html>",
      '<meta charset="utf-8">',
      '<script src="' + config.runtime + '" data-fonts="' + esc(fonts) + '"' +
        (!shortcut && recipe.addons.length ? ' data-addons="' + recipe.addons.join(" ") + '"' : "") + "></" + "script>"
    ];
    if (recipe.tone && recipe.tone !== "light") {
      lines.push("<style>body { background: " + tone.background + "; color: " + tone.ink + "; }</style>");
    }
    lines.push("");
    if (shortcut) {
      lines.push('<font-kku font="' + esc(shortcut) + '" size="72">' + words + "</font-kku>");
    } else {
      lines.push("<font-kku" + hostAttrs(recipe, "72") + ">" + words + "</font-kku>");
    }
    return lines.join("\n") + "\n";
  }

  // ── 축 이름 ────────────────────────────────────────────

  function fontLabel(id) {
    var font = T.fonts[id];
    if (!font) return id;
    if (font.group === "texture" && font.texture && T.textures[font.texture]) {
      return font.name;
    }
    return font.name;
  }

  function axisValues(recipe, s) {
    var out = [];
    out.push({ axis: "font", value: fontLabel(recipe.font), title: T.fonts[recipe.font] ? T.fonts[recipe.font].structure + " · " + T.fonts[recipe.font].stroke : "" });
    if (s.look) out.push({ axis: "look", value: T.looks[s.look].name });
    if (s.vary.length || s.seed !== "off") {
      out.push({
        axis: "vary",
        value: (s.vary.length ? s.vary.map(function (id) { return T.variations[id].name; }).join("·") : "씨앗") +
          (s.seed === "auto" ? " (매번 새로)" : s.seed === "fixed" ? " (씨앗 " + s.seedValue + ")" : "")
      });
    }
    if (s.motion) out.push({ axis: "motion", value: T.motions[s.motion].name });
    if (s.fx) out.push({ axis: "interaction", value: T.interactions[s.fx].name });
    out.push({ axis: "tone", value: (T.tones[s.tone] || T.tones.light).name });
    return out;
  }

  function axisName(id) {
    var name = id;
    T.axes.forEach(function (axis) { if (axis.id === id) name = axis.name; });
    return name;
  }

  function badges(recipe, s) {
    return axisValues(recipe, s).map(function (item) {
      return '<div data-axis="' + item.axis + '"' + (item.title ? ' title="' + esc(item.title) + '"' : "") + ">" +
        "<dt>" + axisName(item.axis) + "</dt><dd>" + esc(item.value) + "</dd></div>";
    }).join("");
  }

  // ── 축 그림 ────────────────────────────────────────────

  var AXIS_SAMPLES = {
    font: '<font-kku font="pilgi" size="30">글꼴</font-kku>',
    look: '<font-kku font="gothic" class="kku-look-saekdong" size="30">꾸밈</font-kku>',
    vary: '<font-kku font="crayon" class="kku-vary-tilt kku-vary-bob kku-vary-hue" seed="auto" jamo-seeds size="30">변주</font-kku>',
    motion: '<font-kku font="sebul" animate="wave" size="30">움직임</font-kku>',
    interaction: '<font-kku font="sebul" class="kku-look-pastel" data-kku-fx="magnet" size="30">상호작용</font-kku>',
    tone: ""
  };

  function renderAxes() {
    var list = $("[data-theme-axes]");
    if (!list) return;
    list.innerHTML = T.axes.map(function (axis, i) {
      var sample = AXIS_SAMPLES[axis.id];
      if (axis.id === "tone") {
        sample = '<span class="ft-swatches" aria-hidden="true">' + Object.keys(T.tones).map(function (id) {
          return '<i style="background:' + T.tones[id].background + '"></i>';
        }).join("") + "</span>";
      }
      return '<li data-axis="' + axis.id + '">' +
        '<span class="ft-axis-no">' + (i + 1) + "</span>" +
        '<span class="ft-axis-sample"' + (axis.id === "interaction" ? ' title="커서를 올려 보세요"' : "") + ">" + sample + "</span>" +
        "<strong>" + axis.name + "</strong>" +
        "<p>" + esc(axis.summary) + "</p>" +
        "<code>" + esc(axis.how) + "</code>" +
        "</li>";
    }).join("");
  }

  // ── 테마 갤러리 ────────────────────────────────────────

  function galleryText() {
    var input = $("[data-theme-text]");
    return input ? input.value.trim() : "";
  }

  function themeTags(id) {
    var theme = T.themes[id];
    var font = T.fonts[theme.font] || {};
    var tags = [];
    if (theme.look) tags.push("look");
    if ((theme.vary || []).length || theme.seed) tags.push("vary");
    if (theme.motion) tags.push("motion");
    if (theme.interaction) tags.push("fx");
    if (font.group && font.group !== "system") tags.push("sprite");
    if (DARK_TONES.indexOf(theme.tone || "light") !== -1) tags.push("dark");
    return tags;
  }

  /* 한 줄 소개 — 테마에 없으면 꾸밈의 소개, 꾸밈도 없으면 글꼴의 획 표현·짜임으로. */
  function themeSummary(theme) {
    if (theme.summary) return theme.summary;
    if (theme.look && T.looks[theme.look]) return T.looks[theme.look].summary;
    var font = T.fonts[theme.font];
    if (!font) return "";
    if (font.texture && font.texture !== "plain" && T.textures[font.texture]) return T.textures[font.texture].summary;
    return font.structure;
  }

  function cardMarkup(id) {
    var theme = T.themes[id];
    var s = themeState(id);
    var recipe = T.recipes[id] || recipeOf(s);
    var tone = recipe.tone && recipe.tone !== "light" ? ' data-tone="' + recipe.tone + '"' : "";
    return '<article class="ft-card" id="theme-' + id + '" data-theme-card="' + id + '" data-has="' + themeTags(id).join(" ") + '">' +
      (theme.shortcut ? '<span class="ft-anchor" id="' + theme.shortcut + '"></span>' : "") +
      '<div class="k-stage ft-card-stage"' + tone + ' data-theme-stage="' + id + '" data-kku-paused></div>' +
      '<div class="ft-card-body">' +
      "<h3>" + esc(theme.name) + " <code>" + id + "</code></h3>" +
      (themeSummary(theme) ? '<p class="ft-card-summary">' + esc(themeSummary(theme)) + "</p>" : "") +
      '<dl class="ft-badges">' + badges(recipe, s) + "</dl>" +
      (theme.use ? '<p class="ft-card-use">어울리는 곳 · ' + esc(theme.use) + "</p>" : "") +
      (theme.shortcut ? '<p class="ft-card-short">글꼴 CSS 한 장으로도 같은 모양: <code>font="' + theme.shortcut + '"</code> ' +
        '<button type="button" class="ft-link-btn" data-theme-copy-short="' + id + '">그 코드 복사</button></p>' : "") +
      '<div class="ft-card-actions">' +
      '<button type="button" class="k-btn k-btn--small k-btn--primary" data-theme-open="' + id + '">조합기에서 열기</button>' +
      '<button type="button" class="k-btn k-btn--small" data-theme-copy="' + id + '">코드 복사</button>' +
      "</div></div></article>";
  }

  function renderCardSample(stage) {
    var id = stage.getAttribute("data-theme-stage");
    var recipe = T.recipes[id] || recipeOf(themeState(id));
    if (window.FontKkuFx) window.FontKkuFx.unbind(stage);
    stage.innerHTML = "<font-kku" + hostAttrs(recipe, "clamp(30px, 3.6vw, 42px)") + ">" +
      esc(galleryText() || T.themes[id].name) + "</font-kku>";
    stage.setAttribute("data-rendered", "true");
  }

  var cardObserver = null;

  function observeCards() {
    var stages = $$("[data-theme-stage]");
    if (!("IntersectionObserver" in window)) {
      stages.forEach(function (stage) {
        renderCardSample(stage);
        stage.removeAttribute("data-kku-paused");
      });
      return;
    }
    cardObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var stage = entry.target;
        if (entry.isIntersecting) {
          if (!stage.hasAttribute("data-rendered")) renderCardSample(stage);
          stage.removeAttribute("data-kku-paused");
        } else {
          stage.setAttribute("data-kku-paused", "");
        }
      });
    }, { rootMargin: "240px 0px" });
    stages.forEach(function (stage) { cardObserver.observe(stage); });
  }

  function rerenderCards() {
    $$("[data-theme-stage][data-rendered]").forEach(renderCardSample);
  }

  function applyFilter(id) {
    var shown = 0;
    $$("[data-theme-card]").forEach(function (card) {
      var on = id === "all" || (" " + card.getAttribute("data-has") + " ").indexOf(" " + id + " ") !== -1;
      card.hidden = !on;
      if (on) shown += 1;
    });
    $$("[data-theme-filter]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-filter") === id));
    });
    var count = $("[data-theme-count]");
    if (count) count.textContent = id === "all" ? "테마 " + shown + "개" : Object.keys(T.themes).length + "개 중 " + shown + "개";
  }

  function renderGallery() {
    var grid = $("[data-theme-grid]");
    if (!grid) return;
    grid.innerHTML = Object.keys(T.themes).map(cardMarkup).join("");
    var filters = $("[data-theme-filters]");
    if (filters) {
      filters.innerHTML = FILTERS.map(function (filter) {
        return '<button type="button" data-theme-filter="' + filter.id + '" aria-pressed="' + (filter.id === "all") + '">' + filter.label + "</button>";
      }).join("");
    }
    applyFilter("all");
    observeCards();
  }

  // ── 조합기 ─────────────────────────────────────────────

  function option(type, name, value, label, checked, extra) {
    return '<label class="ft-opt"' + (extra && extra.title ? ' title="' + esc(extra.title) + '"' : "") + ">" +
      '<input type="' + type + '" name="' + name + '" value="' + esc(value) + '"' + (checked ? " checked" : "") + ">" +
      "<span>" + (extra && extra.sample ? extra.sample : "") + esc(label) + "</span></label>";
  }

  function fontSample(id) {
    var tone = fontTone(id);
    return '<i class="ft-opt-sample"' + (tone !== "light" ? ' data-tone="' + tone + '"' : "") + ">" +
      '<font-kku font="' + id + '" size="20">가</font-kku></i>';
  }

  function lookSample(id) {
    var tone = T.looks[id].tone || "light";
    return '<i class="ft-opt-sample"' + (tone !== "light" ? ' data-tone="' + tone + '"' : "") + ">" +
      '<font-kku font="gothic" class="kku-look-' + id + '" size="20">가</font-kku></i>';
  }

  function legend(axis, i, note) {
    return '<legend><span class="ft-axis-no">' + (i + 1) + "</span>" + axisName(axis) + (note ? " <small>" + note + "</small>" : "") + "</legend>";
  }

  function renderControls() {
    var form = $("[data-compose]");
    var html = "";
    html += '<fieldset data-axis="font">' + legend("font", 0, "뼈대 — 짜임 × 획");
    FONT_GROUPS.forEach(function (group) {
      var ids = Object.keys(T.fonts).filter(function (id) { return T.fonts[id].group === group.id; });
      if (!ids.length) return;
      html += '<div class="ft-group"><p class="ft-group-name">' + group.name + " <small>" + group.note + "</small></p><div class=\"ft-opts\">" +
        ids.map(function (id) {
          var font = T.fonts[id];
          return option("radio", "font", id, font.name, false, { sample: fontSample(id), title: font.structure + " · " + font.stroke });
        }).join("") + "</div></div>";
    });
    html += "</fieldset>";

    html += '<fieldset data-axis="look">' + legend("look", 1, "칠 — 색·외곽선·그림자") + '<div class="ft-opts">' +
      option("radio", "look", "", "없음 (글꼴 그대로)", true) +
      Object.keys(T.looks).map(function (id) {
        return option("radio", "look", id, T.looks[id].name, false, { sample: lookSample(id), title: T.looks[id].summary });
      }).join("") + "</div></fieldset>";

    html += '<fieldset data-axis="vary">' + legend("vary", 2, "씨앗 — 자모마다, 그릴 때마다 다르게") + '<div class="ft-opts">' +
      Object.keys(T.variations).map(function (id) {
        return option("checkbox", "vary", id, T.variations[id].name, false, { title: T.variations[id].summary });
      }).join("") + "</div>" +
      '<div class="ft-seed"><span class="ft-seed-label" id="ft-seed-label">씨앗</span><div class="ft-opts" role="radiogroup" aria-labelledby="ft-seed-label">' +
      option("radio", "seed", "off", "끔", true) + option("radio", "seed", "auto", "매번 새로", false) + option("radio", "seed", "fixed", "고정", false) +
      '</div><input class="ft-seed-input" name="seedValue" type="text" maxlength="16" value="kku" autocomplete="off" spellcheck="false" aria-label="고정 씨앗"></div>' +
      '<p class="ft-note">씨앗을 켜야 변주가 움직입니다. 고정하면 언제 그려도 같은 모양, 매번 새로면 그릴 때마다 새 모양입니다.</p>' +
      "</fieldset>";

    var core = Object.keys(T.motions).filter(function (id) { return T.motions[id].source === "core"; });
    var addon = Object.keys(T.motions).filter(function (id) { return T.motions[id].source !== "core"; });
    function motionLabel(id) {
      var m = T.motions[id];
      return m.name + (m.play === "once" ? " ↻" : "");
    }
    html += '<fieldset data-axis="motion">' + legend("motion", 3, "animate — ↻는 한 번 도는 움직임") +
      '<div class="ft-opts">' + option("radio", "motion", "", "없음", true) + "</div>" +
      '<div class="ft-group"><p class="ft-group-name">자모 단위 <small>움직임 확장(motion)</small></p><div class="ft-opts">' +
      addon.map(function (id) { return option("radio", "motion", id, motionLabel(id), false, { title: id }); }).join("") + "</div></div>" +
      '<div class="ft-group"><p class="ft-group-name">글자 단위 <small>런타임에 들어 있음</small></p><div class="ft-opts">' +
      core.map(function (id) { return option("radio", "motion", id, motionLabel(id), false, { title: id }); }).join("") + "</div></div>" +
      "</fieldset>";

    html += '<fieldset data-axis="interaction">' + legend("interaction", 4, "data-kku-fx — 입력에 반응") + '<div class="ft-opts">' +
      option("radio", "fx", "", "없음", true) +
      Object.keys(T.interactions).map(function (id) {
        return option("radio", "fx", id, T.interactions[id].name, false, { title: T.interactions[id].summary });
      }).join("") + "</div></fieldset>";

    html += '<fieldset data-axis="tone">' + legend("tone", 5, "꾸밈이 가장 잘 사는 배경") + '<div class="ft-opts">' +
      Object.keys(T.tones).map(function (id) {
        return option("radio", "tone", id, T.tones[id].name, id === "light", {
          sample: '<i class="ft-tone-dot" style="background:' + T.tones[id].background + '"></i>'
        });
      }).join("") + "</div></fieldset>";

    form.innerHTML = html;
    var themeSelect = $("[data-compose-theme]");
    themeSelect.innerHTML = '<option value="">테마 고르기…</option>' + Object.keys(T.themes).map(function (id) {
      return '<option value="' + id + '">' + esc(T.themes[id].name) + "</option>";
    }).join("");
  }

  function syncControls() {
    var form = $("[data-compose]");
    function check(name, value) {
      $$('input[name="' + name + '"]', form).forEach(function (input) {
        input.checked = Array.isArray(value) ? value.indexOf(input.value) !== -1 : input.value === value;
      });
    }
    check("font", compose.font);
    check("look", compose.look);
    check("vary", compose.vary);
    check("seed", compose.seed);
    check("motion", compose.motion);
    check("fx", compose.fx);
    check("tone", compose.tone);
    var seedInput = form.elements.seedValue;
    if (seedInput.value !== compose.seedValue) seedInput.value = compose.seedValue;
    seedInput.disabled = compose.seed !== "fixed";
    var text = $("[data-compose-text]");
    if (text && text.value !== compose.text) text.value = compose.text;
  }

  function readControls() {
    var form = $("[data-compose]");
    function picked(name) {
      var input = $('input[name="' + name + '"]:checked', form);
      return input ? input.value : "";
    }
    var next = {
      font: picked("font"),
      look: picked("look"),
      vary: $$('input[name="vary"]:checked', form).map(function (input) { return input.value; }),
      seed: picked("seed") || "off",
      seedValue: form.elements.seedValue.value.trim(),
      motion: picked("motion"),
      fx: picked("fx"),
      tone: picked("tone") || "light",
      text: $("[data-compose-text]").value
    };
    return next;
  }

  function hint(s) {
    if (s.fx === "shuffle") return "글자를 누르면 씨앗을 새로 뽑습니다.";
    if (s.fx === "scatter") return "글자에 커서를 올리거나 누르면 자모가 흩어졌다 모입니다.";
    if (s.fx === "magnet") return "커서를 글자 가까이 움직여 보세요.";
    if (s.fx === "type") return "두벌식으로 치듯 자모가 하나씩 조합됩니다. '다시 재생'으로 다시 칩니다.";
    if (s.motion && T.motions[s.motion].play === "once") return "한 번 도는 움직임입니다. '다시 재생'으로 다시 봅니다.";
    if (s.motion === "scroll-assemble") return "페이지를 내리고 올리면 자모가 모이고 흩어집니다.";
    if (s.vary.length && s.seed === "auto") return "'다시 그리기'를 누를 때마다 새 씨앗으로 그립니다.";
    return "";
  }

  function stopController() {
    if (controller) {
      controller.stop();
      controller = null;
    }
  }

  function startController(s) {
    var Fx = window.FontKkuFx;
    if (!Fx || !s.fx) return;
    if (s.fx === "type") {
      controller = Fx.type(composeHost, [s.text || DEFAULT_TEXT], {
        intro: true,
        loop: false,
        keepAnimate: Boolean(s.motion && T.motions[s.motion].play !== "once"),
        observe: composeStage
      });
    } else if (s.fx === "scatter") {
      controller = Fx.scatter(composeHost, { on: "auto" });
    } else if (s.fx === "magnet") {
      controller = Fx.magnet(composeHost, { area: composeStage });
    } else if (s.fx === "shuffle") {
      controller = Fx.shuffle(composeHost, { on: "click" });
    }
  }

  function setAttr(node, name, value) {
    if (value === null || value === undefined || value === false) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
    } else if (node.getAttribute(name) !== String(value)) {
      node.setAttribute(name, value === true ? "" : value);
    }
  }

  function renderCompose(options) {
    var s = compose;
    var recipe = recipeOf(s);
    var text = s.text.trim() || DEFAULT_TEXT;
    stopController();
    setAttr(composeHost, "font", recipe.font);
    setAttr(composeHost, "jamo-set", recipe.jamoSet || null);
    composeHost.className = recipe.classes.join(" ");
    if (!composeHost.className) composeHost.removeAttribute("class");
    setAttr(composeHost, "seed", recipe.seed);
    setAttr(composeHost, "jamo-seeds", recipe.jamoSeeds ? true : null);
    setAttr(composeHost, "animate", recipe.animate);
    setAttr(composeStage, "data-tone", recipe.tone !== "light" ? recipe.tone : null);
    composeHost.style.color = recipe.ink || "";
    if (recipe.ink) composeHost.style.setProperty("--fy-sprite-paint", "mask"); else composeHost.style.removeProperty("--fy-sprite-paint");
    if (window.FontKku && composeHost.getAttribute("data-fy-upgraded") === "true") {
      window.FontKku.refresh(composeHost, { text: text });
    } else {
      composeHost.textContent = text;
    }
    startController(s);

    var theme = themeMatching(s);
    $("[data-compose-badges]").innerHTML = badges(recipe, s);
    $("[data-compose-code]").textContent = snippet(recipe, text, "");
    var themeSelect = $("[data-compose-theme]");
    themeSelect.value = theme;
    var named = $("[data-compose-named]");
    named.textContent = theme ? "테마 그대로: " + T.themes[theme].name : "나만의 조합";
    var hintNode = $("[data-compose-hint]");
    hintNode.textContent = hint(s);
    $("[data-compose-replay]").hidden = !(s.fx === "type" || (s.motion && T.motions[s.motion].play === "once"));
    $("[data-compose-redraw]").hidden = !(s.seed === "auto");
    if (!options || options.hash !== false) writeHash();
  }

  function setCompose(next, options) {
    compose = sanitize(next);
    syncControls();
    renderCompose(options);
  }

  // ── 주소 해시 ──────────────────────────────────────────

  function encodeState(s) {
    var params = new URLSearchParams();
    params.set("font", s.font);
    if (s.look) params.set("look", s.look);
    if (s.vary.length) params.set("vary", s.vary.join(","));
    if (s.seed !== "off") params.set("seed", s.seed === "auto" ? "auto" : s.seedValue);
    if (s.motion) params.set("motion", s.motion);
    if (s.fx) params.set("fx", s.fx);
    if (s.tone !== "light") params.set("tone", s.tone);
    if (s.text.trim()) params.set("text", s.text.trim());
    return params.toString();
  }

  function decodeState(text) {
    var params = new URLSearchParams(text);
    var seed = params.get("seed");
    return sanitize({
      font: params.get("font"),
      look: params.get("look") || "",
      vary: (params.get("vary") || "").split(",").filter(Boolean),
      seed: !seed ? "off" : seed === "auto" ? "auto" : "fixed",
      seedValue: seed && seed !== "auto" ? seed : "kku",
      motion: params.get("motion") || "",
      fx: params.get("fx") || "",
      tone: params.get("tone") || "light",
      text: params.get("text") || ""
    });
  }

  function writeHash() {
    if (!interacted) return;
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      if (/^#kku=/.test(location.hash)) return;
      history.replaceState(null, "", location.pathname + location.search + "#compose=" + encodeState(compose));
    }, 200);
  }

  function shareUrl() {
    return location.href.split("#")[0] + "#compose=" + encodeState(compose);
  }

  function restoreFromHash() {
    var match = /^#compose=(.*)$/.exec(location.hash);
    if (!match) return false;
    interacted = true;
    setCompose(decodeState(match[1]), { hash: false });
    var section = $("#compose");
    if (section) section.scrollIntoView({ block: "start" });
    return true;
  }

  // ── 조합 뽑기 ──────────────────────────────────────────

  function randomOf(list) {
    return list[Math.floor(Math.random() * list.length) % list.length];
  }

  function randomState() {
    var fonts = Object.keys(T.fonts).filter(function (id) { return T.fonts[id].group !== "starter"; });
    var s = defaultState();
    s.font = randomOf(fonts);
    var withLook = Math.random() < 0.72;
    s.look = withLook ? randomOf(Object.keys(T.looks)) : "";
    s.tone = s.look ? (T.looks[s.look].tone || "light") : fontTone(s.font);
    if (Math.random() < 0.5) {
      var vary = Object.keys(T.variations);
      s.vary = [randomOf(vary)];
      if (Math.random() < 0.5) s.vary.push(randomOf(vary));
      s.vary = s.vary.filter(function (id, i, list) { return list.indexOf(id) === i; });
      s.seed = "auto";
    }
    if (Math.random() < 0.55) {
      s.motion = randomOf(Object.keys(T.motions).filter(function (id) { return T.motions[id].play !== "scroll"; }));
    }
    if (Math.random() < 0.25) s.fx = randomOf(Object.keys(T.interactions).filter(function (id) { return id !== "type"; }));
    s.text = compose ? compose.text : "";
    return s;
  }

  // ── 이벤트 ─────────────────────────────────────────────

  function scrollToCompose() {
    var section = $("#compose");
    if (section) section.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function onClick(event) {
    var target = event.target.closest("button, a");
    if (!target) return;
    if (target.hasAttribute("data-theme-filter")) {
      applyFilter(target.getAttribute("data-theme-filter"));
      return;
    }
    if (target.hasAttribute("data-theme-open")) {
      interacted = true;
      var state = themeState(target.getAttribute("data-theme-open"));
      state.text = compose.text;
      setCompose(state);
      scrollToCompose();
      return;
    }
    if (target.hasAttribute("data-theme-copy")) {
      var id = target.getAttribute("data-theme-copy");
      var recipe = T.recipes[id] || recipeOf(themeState(id));
      config.copyText(snippet(recipe, galleryText() || T.themes[id].name, ""), target);
      return;
    }
    if (target.hasAttribute("data-theme-copy-short")) {
      var sid = target.getAttribute("data-theme-copy-short");
      config.copyText(snippet(T.recipes[sid], galleryText() || T.themes[sid].name, T.themes[sid].shortcut), target);
      return;
    }
    if (target.hasAttribute("data-compose-random")) {
      interacted = true;
      setCompose(randomState());
      if (!$("[data-compose]").contains(target) && !target.closest("#compose")) scrollToCompose();
      return;
    }
    if (target.hasAttribute("data-compose-reset")) {
      interacted = true;
      var reset = defaultState();
      reset.text = compose.text;
      setCompose(reset);
      return;
    }
    if (target.hasAttribute("data-compose-copy")) {
      config.copyText($("[data-compose-code]").textContent, target);
      return;
    }
    if (target.hasAttribute("data-compose-link")) {
      config.copyText(shareUrl(), target);
      return;
    }
    if (target.hasAttribute("data-compose-replay")) {
      renderCompose({ hash: false });
      return;
    }
    if (target.hasAttribute("data-compose-redraw")) {
      if (window.FontKku) window.FontKku.refresh(composeHost);
      return;
    }
    if (target.hasAttribute("data-compose-font")) {
      interacted = true;
      var fontState = sanitize(compose);
      fontState.font = target.getAttribute("data-compose-font");
      if (!fontState.look) fontState.tone = fontTone(fontState.font);
      setCompose(fontState);
      scrollToCompose();
    }
  }

  function onComposeChange(event) {
    interacted = true;
    var next = readControls();
    // 변주를 고르면 씨앗을 켜고, 씨앗을 끄면 변주를 비운다
    if (event && event.target.name === "vary" && event.target.checked && next.seed === "off") next.seed = "auto";
    if (event && event.target.name === "seed" && next.seed === "off") next.vary = [];
    // 글꼴만 바꾸고 꾸밈이 없으면 그 글꼴이 권하는 바탕으로
    if (event && event.target.name === "font" && !next.look) next.tone = fontTone(next.font);
    if (event && event.target.name === "look" && next.look) next.tone = T.looks[next.look].tone || next.tone;
    if (event && event.target.name === "seedValue" && !SEED.test(next.seedValue)) {
      if (event.type !== "change") return;
      next.seedValue = compose.seedValue;
    }
    setCompose(next);
  }

  function init(options) {
    if (!T) return;
    config = {
      cdn: options.cdn,
      runtime: options.runtime || options.cdn + "font-kku.js",
      copyText: options.copyText
    };
    // 고정 머리 높이(좁은 화면에서는 메뉴가 둘째 줄로 내려간다) — 조합기 견본이 그 아래에 붙는다
    var header = $(".k-header");
    function measureHeader() {
      if (header) document.documentElement.style.setProperty("--ft-header", header.offsetHeight + "px");
    }
    measureHeader();
    window.addEventListener("resize", measureHeader);
    renderAxes();
    renderGallery();
    composeStage = $("[data-compose-stage]");
    composeHost = $("[data-compose-host]");
    renderControls();
    compose = defaultState();
    syncControls();

    var form = $("[data-compose]");
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    form.addEventListener("change", onComposeChange);
    form.addEventListener("input", function (event) {
      if (event.target.name === "seedValue") onComposeChange(event);
    });
    $("[data-compose-text]").addEventListener("input", function () {
      interacted = true;
      compose.text = this.value.slice(0, 40);
      clearTimeout(galleryTimer);
      galleryTimer = setTimeout(function () { renderCompose(); }, 160);
    });
    $("[data-compose-theme]").addEventListener("change", function () {
      if (!this.value) return;
      interacted = true;
      var state = themeState(this.value);
      state.text = compose.text;
      setCompose(state);
    });
    var galleryInput = $("[data-theme-text]");
    if (galleryInput) {
      galleryInput.addEventListener("input", function () {
        clearTimeout(galleryTimer);
        galleryTimer = setTimeout(rerenderCards, 220);
      });
    }
    document.addEventListener("click", onClick);
    if (!restoreFromHash()) renderCompose({ hash: false });
    window.addEventListener("hashchange", restoreFromHash);
  }

  window.FontKkuThemesPage = {
    init: init,
    recipeOf: recipeOf,
    themeState: themeState,
    snippet: function (recipe, text, shortcut) { return snippet(recipe, text, shortcut || ""); },
    state: function () { return compose ? JSON.parse(JSON.stringify(compose)) : null; },
    setState: function (next) { interacted = true; setCompose(next); },
    encode: function (s) { return encodeState(sanitize(s || compose)); },
    decode: decodeState,
    random: function () { interacted = true; setCompose(randomState()); return JSON.parse(JSON.stringify(compose)); },
    fontTone: fontTone,
    axisIds: AXIS_IDS.slice()
  };
})();
