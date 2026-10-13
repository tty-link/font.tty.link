/* 글꼴 페이지의 시험대 씨앗과 "내 글꼴 만들기" — 시험대 변주 도구, 글꼴 뽑기, 만들기 카드.
 *
 * 변주: 바탕 요소에 seed와 jamo-seeds를 주면 런타임이 자모 노드마다 --fy-jamo-seed(0–1)를 걸고,
 * 씨앗에 반응하는 글꼴(fonts[].seed)은 그 값으로 자모마다 기울기·위치를 흔든다. 끔 / 매번 새로
 * (seed="auto", 그릴 때마다 새 씨앗) / 씨앗 고정(같은 씨앗 = 같은 모양) 셋이다. 씨앗에 반응하지
 * 않는 글꼴은 속성을 줘도 모양이 그대로라 그 사실을 행 표시(씨앗 반응)와 시험대 안내 한 줄로 밝힌다
 * (다른 글꼴은 조합기의 변주로 흔든다). 코드 복사(attrs)는 씨앗에 반응하는 글꼴에만 속성을 붙인다.
 *
 * AI 카드의 문장은 소개와 같은 글이다 — FontKkuLandingSets.prompt(8칸, site/landing-ai-sets.js).
 *
 * 글꼴 뽑기: FontKkuCustomizer.draw(seed)가 뽑기 씨앗 하나로 꾸미기 상태를 결정론적으로 정해 꾸미기
 * 창을 연다. 기능 모음의 뽑기 카드는 같은 상태를 창 밖에서 미리 그린다(cssFor·seedFor).
 *
 * 카드 단추는 행 단추와 다른 속성(data-lab-*)을 쓴다 — 행의 [data-customize-font]·[data-download-font]는
 * 글꼴마다 하나씩이라는 약속(브라우저 smoke)이 있다.
 *
 * 쓰는 법: FontKkuLab.init({ fonts, form, hosts, cdn, skillUrl, copyText }); 코드 복사는 attrs(font)로
 * 변주 속성을 붙인다. */
(function () {
  "use strict";

  var SEED = /^[a-z0-9-]{1,16}$/i;

  var config = null;
  var mode = "off";
  var seed = "kku";
  var drawSeed = "";
  var drawStyle = null;

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function fontById(id) {
    return config.fonts.filter(function (item) { return item.id === id; })[0] || null;
  }

  function randomSeed() {
    return Math.random().toString(36).slice(2, 7) || "kku";
  }

  function setAttr(host, name, value) {
    if (value === null || value === undefined) {
      if (host.hasAttribute(name)) host.removeAttribute(name);
    } else if (host.getAttribute(name) !== String(value)) {
      host.setAttribute(name, value);
    }
  }

  function seedValue() {
    return mode === "auto" ? "auto" : mode === "fixed" ? seed : null;
  }

  // ── 시험대 변주 ────────────────────────────────────────

  function applyVariation() {
    var value = seedValue();
    config.hosts().forEach(function (host) {
      setAttr(host, "seed", value);
      setAttr(host, "jamo-seeds", value === null ? null : "");
    });
    $$("[data-var]", config.form).forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-var") === mode));
    });
    var seedWrap = $("[data-var-seed]", config.form);
    seedWrap.hidden = mode !== "fixed";
    $("[data-var-reseed]", config.form).hidden = mode === "off";
    var note = $("[data-var-note]", config.form);
    if (note) {
      var names = $("[data-var-note-fonts]", note);
      if (names) names.textContent = seedFontNames();
      note.hidden = mode === "off";
    }
    var input = $('input[name="seed"]', config.form);
    if (input.value !== seed) input.value = seed;
    document.documentElement.setAttribute("data-fl-vary", mode);
  }

  function reseedTester() {
    if (mode === "off") {
      mode = "auto";
      applyVariation();
      return;
    }
    if (mode === "fixed") {
      seed = randomSeed();
      applyVariation();
      return;
    }
    // 매번 새로: 다시 그리면 런타임이 새 씨앗을 뽑는다
    config.hosts().forEach(function (host) {
      window.FontKku.refresh(host);
    });
  }

  /* 씨앗에 반응하는 글꼴 이름(정본 순서) — 옛 꾸러미 글꼴은 견본 행이 없어 뺀다. */
  function seedFontNames() {
    return config.fonts.filter(function (item) { return item.seed && !item.legacy; })
      .map(function (item) { return item.name; }).join("·");
  }

  function attrs(item) {
    var value = seedValue();
    if (value === null || !item || !item.seed) return "";
    return ' seed="' + value + '" jamo-seeds';
  }

  /* 고정 시험대의 실제 아래끝 — 안내 줄(씨앗·바탕)이 붙거나 줄이 꺾이면 시험대가 높아져, 주소로 온 행(#pixel)의
   * 제목이 그 밑에 숨었다. 머리말 + 시험대 높이를 --fl-tester-bottom으로 적고 행·무리 제목의 scroll-margin-top이
   * 그 값을 따른다(font-lab.css). 좁은 화면은 시험대가 붙지 않아(position: static) 머리말 높이만 센다. */
  function measureTester() {
    var header = $(".k-header");
    var form = config.form;
    var top = header ? header.getBoundingClientRect().height : 0;
    var sticky = form && getComputedStyle(form).position === "sticky";
    var bottom = Math.ceil(top + (sticky ? form.getBoundingClientRect().height : 0));
    document.documentElement.style.setProperty("--fl-tester-bottom", bottom + "px");
  }

  function watchTester() {
    measureTester();
    if (typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(measureTester);
      observer.observe(config.form);
      var header = $(".k-header");
      if (header) observer.observe(header);
    }
    // 폭이 좁아져 시험대가 붙지 않게 되는 때(크기는 같고 position만 바뀜)
    window.addEventListener("resize", measureTester);
  }

  // ── 뽑기 미리보기(기능 모음 카드) ──────────────────────

  function renderDrawPreview(key) {
    var customizer = window.FontKkuCustomizer;
    var card = $("[data-lab-draw-card]");
    if (!card || !customizer || !customizer.drawState) return;
    drawSeed = key || randomSeed();
    var state = customizer.drawState(drawSeed);
    if (!state) return;
    var item = fontById(state.f);
    var stage = $("[data-lab-draw-stage]", card);
    var host = $("[data-lab-draw-host]", card);
    if (!drawStyle) {
      drawStyle = document.createElement("style");
      drawStyle.setAttribute("data-lab-draw-style", "");
      document.head.appendChild(drawStyle);
    }
    drawStyle.textContent = customizer.cssFor(state);
    setAttr(stage, "data-tone", item && item.tone ? item.tone : null);
    host.className = state.n;
    setAttr(host, "font", state.f);
    var value = customizer.seedFor(state);
    setAttr(host, "seed", value);
    setAttr(host, "jamo-seeds", value === null ? null : "");
    setAttr(host, "animate", state.an || null);
    var text = "글꼴 뽑기";
    if (host.getAttribute("data-fy-upgraded") === "true") {
      if ((host.dataset.source || "") !== text) window.FontKku.refresh(host, { text: text });
    } else {
      host.textContent = text;
      if (window.FontKku) window.FontKku.upgradeAll(stage);
    }
    $("[data-lab-draw-no]", card).textContent = drawSeed;
    $("[data-lab-draw-base]", card).textContent = item ? item.name + " · " + item.id : state.f;
  }

  // ── 카드 단추 ─────────────────────────────────────────

  /* 소개의 'AI에게 맡길 문장 복사'와 같은 글 — 8칸(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)을 칸 계약 세트로 그려 달라는 부탁. */
  function skillPrompt() {
    var sets = window.FontKkuLandingSets;
    if (sets && typeof sets.prompt === "function") return sets.prompt(sets.MARKER);
    return "이 설명서를 읽고 따라 해 줘: " + config.skillUrl;
  }

  function scrollToRow(id) {
    var row = document.getElementById(id);
    if (row) row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return row;
  }

  function onClick(event) {
    var target = event.target.closest("button, a");
    if (!target) return;
    var customizer = window.FontKkuCustomizer;

    if (target.hasAttribute("data-var") && config.form.contains(target)) {
      mode = target.getAttribute("data-var");
      if (mode === "fixed" && !SEED.test(seed)) seed = "kku";
      applyVariation();
      return;
    }
    if (target.hasAttribute("data-var-reseed")) {
      reseedTester();
      return;
    }
    if (target.hasAttribute("data-draw")) {
      if (customizer) customizer.draw(null, target);
      return;
    }
    if (target.hasAttribute("data-lab-customize")) {
      if (customizer) customizer.open(target.getAttribute("data-lab-customize"), null, target);
      return;
    }
    if (target.hasAttribute("data-lab-draw-next")) {
      renderDrawPreview(null);
      return;
    }
    if (target.hasAttribute("data-lab-draw-open")) {
      if (customizer) customizer.draw(drawSeed, target);
      return;
    }
    if (target.hasAttribute("data-lab-reseed")) {
      $$("[data-lab-seed-auto]").forEach(function (host) { window.FontKku.refresh(host); });
      return;
    }
    if (target.hasAttribute("data-lab-vary-on")) {
      mode = "auto";
      applyVariation();
      // 고정 시험대는 이미 화면 위에 붙어 있어 거기로 옮기면 화면이 그대로다 — 씨앗에 반응하는 첫 견본 행으로 간다
      var tag = $(".fl-seed-tag");
      var seedRow = tag && tag.closest("[data-font-row]");
      if (seedRow) scrollToRow(seedRow.id);
      return;
    }
    if (target.hasAttribute("data-lab-export")) {
      var id = target.getAttribute("data-lab-export");
      var row = scrollToRow(id);
      var button = row && row.querySelector('[data-download-font="' + id + '"]');
      if (button) button.click();
      return;
    }
    if (target.hasAttribute("data-lab-prompt")) {
      config.copyText(skillPrompt(), target);
    }
  }

  function onInput(event) {
    if (event.target.name !== "seed" || !config.form.contains(event.target)) return;
    var value = event.target.value.trim();
    if (SEED.test(value)) {
      seed = value;
      applyVariation();
    } else if (event.type === "change") {
      event.target.value = seed;
    }
  }

  function init(options) {
    config = {
      fonts: options.fonts,
      form: options.form,
      hosts: options.hosts,
      cdn: options.cdn,
      skillUrl: options.skillUrl,
      copyText: options.copyText
    };
    document.addEventListener("click", onClick);
    config.form.addEventListener("input", onInput);
    config.form.addEventListener("change", onInput);
    applyVariation();
    watchTester();
    renderDrawPreview(null);
  }

  window.FontKkuLab = {
    init: init,
    attrs: attrs,
    variation: function () { return { mode: mode, seed: seedValue() }; },
    setVariation: function (next, value) {
      if (["off", "auto", "fixed"].indexOf(next) === -1) return;
      mode = next;
      if (typeof value === "string" && SEED.test(value)) seed = value;
      applyVariation();
    },
    drawPreview: function (key) { renderDrawPreview(key); return drawSeed; }
  };
})();
