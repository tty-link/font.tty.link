/* 전광판 — 영문 자판으로 친 한글을 그림 자소 글꼴로 띄우는 도트 전광판.
 * 상태(글·글꼴·움직임·속도·크기·색·점·배열)는 주소의 #에 담아 링크로 나눈다. */
(function () {
  "use strict";

  var FontKku = window.FontKku;
  var Ime = window.FontKkuIme;
  var Apps = window.FontKkuApps;
  var Site = window.FontKkuSite;

  window.FontKkuDemo.renderNav("showcase");

  var FONTS = ["pixel", "sprite-system", "dojang", "chalk"];
  var MODES = ["scroll", "blink", "static"];
  var DEFAULTS = {
    text: "어서 오세요 · 폰꾸 전광판",
    font: "pixel",
    mode: "scroll",
    speed: 4,
    size: 120,
    color: "#ff3b30",
    dots: "on",
    layout: "dubeol"
  };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  function clampInt(value, min, max, fallback) {
    var number = parseInt(value, 10);
    return isNaN(number) ? fallback : Math.max(min, Math.min(max, number));
  }

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    var state = Object.assign({}, DEFAULTS);
    if (params.has("t")) {
      state.text = params.get("t").replace(/[\r\n]+/g, " ").slice(0, 200);
    }
    if (FONTS.indexOf(params.get("f")) !== -1) {
      state.font = params.get("f");
    }
    if (MODES.indexOf(params.get("m")) !== -1) {
      state.mode = params.get("m");
    } else if (reduceMotion) {
      state.mode = "static";
    }
    state.speed = clampInt(params.get("s"), 1, 10, DEFAULTS.speed);
    state.size = Math.round(clampInt(params.get("z"), 48, 240, DEFAULTS.size) / 8) * 8;
    if (/^[0-9a-f]{6}$/i.test(params.get("c") || "")) {
      state.color = "#" + params.get("c").toLowerCase();
    }
    if (params.get("d") === "off") {
      state.dots = "off";
    }
    try {
      state.layout = Ime.normalizeLayout(params.get("k") || DEFAULTS.layout);
    } catch (error) {
      state.layout = DEFAULTS.layout;
    }
    return state;
  }

  var state = readHash();
  var hashTimer = 0;

  function writeHashNow() {
    clearTimeout(hashTimer);
    var params = new URLSearchParams();
    params.set("t", state.text);
    params.set("f", state.font);
    params.set("m", state.mode);
    params.set("s", String(state.speed));
    params.set("z", String(state.size));
    params.set("c", state.color.slice(1));
    params.set("d", state.dots);
    params.set("k", state.layout);
    history.replaceState(null, "", "#" + params.toString());
  }

  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHashNow, 250);
  }

  var sign = document.querySelector("[data-sign]");
  var windowEl = sign.querySelector("[data-sign-window]");
  var track = sign.querySelector("[data-sign-track]");
  var host = sign.querySelector("[data-sign-text]");
  Apps.ensureTint("sign-led", state.color);

  // ── 전광판 그리기 ───────────────────────────────────────
  var animation = null;
  var restartQueued = false;

  function sizePx() {
    return parseFloat(getComputedStyle(host).fontSize) || state.size;
  }

  function isFull() {
    return document.fullscreenElement === sign || sign.classList.contains("is-pseudo-fullscreen");
  }

  /* 전체 화면에서 멈춤·깜빡이기는 한 줄로 두고 화면 폭에 맞춰 글자를 줄인다 */
  function fitFullscreen() {
    sign.style.removeProperty("--sign-size-fit");
    if (!isFull() || state.mode === "scroll") {
      return;
    }
    var available = windowEl.clientWidth;
    var natural = track.scrollWidth;
    if (natural > available && natural > 0) {
      sign.style.setProperty("--sign-size-fit", Math.floor((sizePx() * available) / natural) + "px");
    }
  }

  function restart() {
    restartQueued = false;
    if (animation) {
      animation.cancel();
      animation = null;
    }
    fitFullscreen();
    sign.setAttribute("data-mode", state.mode);
    sign.style.setProperty("--blink", Math.max(0.35, 2.2 - state.speed * 0.18).toFixed(2) + "s");
    if (state.mode !== "scroll" || typeof track.animate !== "function") {
      return;
    }
    var dot = sizePx() / 32; /* apps.css --dot와 같은 간격 */
    var width = windowEl.clientWidth;
    var trackWidth = track.getBoundingClientRect().width;
    /* 출발·도착을 점 간격에 맞추고 한 점씩 옮긴다 — 진짜 LED처럼 점 단위로 흐른다 */
    var from = Math.ceil(width / dot) * dot;
    var to = -Math.ceil(trackWidth / dot) * dot;
    var distance = from - to;
    if (!(distance > 0) || !(dot > 0)) {
      return; /* 아직 배치되지 않음(숨은 탭 등) — 크기가 생기면 resize가 다시 부른다 */
    }
    var pxPerSecond = sizePx() * (0.5 + state.speed * 0.45);
    var duration = (distance / pxPerSecond) * 1000;
    animation = track.animate(
      [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(" + to + "px)" }],
      {
        duration: duration,
        iterations: Infinity,
        easing: state.dots === "on" ? "steps(" + Math.max(1, Math.round(distance / dot)) + ", end)" : "linear"
      }
    );
    /* 글을 고칠 때마다 다시 시작하므로 첫 글자가 왼쪽 끝에 보이는 자리에서 출발한다 */
    animation.currentTime = (duration * Math.max(0, from - dot * 2)) / distance;
  }

  function queueRestart() {
    if (restartQueued) {
      return;
    }
    restartQueued = true;
    requestAnimationFrame(restart);
  }

  function applySign() {
    sign.style.setProperty("--sign-size-user", state.size + "px");
    sign.style.setProperty("--led", state.color);
    sign.setAttribute("data-dots", state.dots);
    Apps.ensureTint("sign-led", state.color);
    var wrap = state.mode === "scroll" || isFull() ? "line" : "word";
    if (host.getAttribute("wrap-unit") !== wrap) {
      host.setAttribute("wrap-unit", wrap);
    }
    if (host.getAttribute("font") !== state.font) {
      host.setAttribute("font", state.font);
    }
    queueRestart();
  }

  function setText(text) {
    state.text = text;
    if (host.getAttribute("data-source") !== text) {
      FontKku.refresh(host, { text: text });
    }
    queueRestart();
    writeHash();
  }

  host.addEventListener("font-kku:render", queueRestart);
  window.addEventListener("resize", queueRestart);
  document.addEventListener("fullscreenchange", function () {
    applySign();
  });

  // ── 입력 ─────────────────────────────────────────────────
  var keyboardMount = document.querySelector("[data-keyboard]");
  var keyboardToggle = document.querySelector("[data-keyboard-toggle]");
  var keyboard = null;

  var editor = Apps.createEditor(document.querySelector("[data-sign-editor]"), {
    multiline: false,
    font: "sprite-system",
    layout: state.layout,
    value: state.text,
    label: "전광판에 띄울 글",
    placeholder: "여기에 입력",
    maxLength: 200,
    onChange: function (value) {
      if (value !== state.text) {
        setText(value);
      }
    }
  });

  var renderMode = Apps.bindImeControls(editor, document, function (layout) {
    state.layout = layout;
    writeHash();
  });

  function showKeyboard(show) {
    keyboardMount.hidden = !show;
    keyboardToggle.setAttribute("aria-expanded", String(show));
    if (show && !keyboard) {
      keyboard = Apps.createKeyboard(keyboardMount, { editor: editor, font: "sprite-system", enter: false });
    }
    /* 터치 기기에서 화면 자판을 쓰는 동안 기기 키보드를 띄우지 않는다 */
    if (coarse) {
      if (show) {
        editor.field.setAttribute("inputmode", "none");
      } else {
        editor.field.removeAttribute("inputmode");
      }
    }
  }
  keyboardToggle.addEventListener("click", function () {
    showKeyboard(keyboardMount.hidden);
  });

  // ── 조작 ─────────────────────────────────────────────────
  function pressGroup(selector, attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll(selector + " [" + attr + "]"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute(attr) === value));
    });
  }

  function syncControls() {
    pressGroup("[data-font-choices]", "data-font", state.font);
    pressGroup("[data-modes]", "data-mode", state.mode);
    pressGroup("[data-dot-choices]", "data-dot", state.dots);
    pressGroup("[data-colors]", "data-color", state.color);
    document.querySelector("[data-speed-range]").value = String(state.speed);
    document.querySelector("[data-speed-out]").value = String(state.speed);
    document.querySelector("[data-size-range]").value = String(state.size);
    document.querySelector("[data-size-out]").value = state.size + "px";
    document.querySelector("[data-color-custom]").value = state.color;
  }

  function change(patch) {
    Object.assign(state, patch);
    syncControls();
    applySign();
    writeHash();
  }

  document.querySelector("[data-font-choices]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-font]");
    if (button) change({ font: button.getAttribute("data-font") });
  });
  document.querySelector("[data-modes]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (button) change({ mode: button.getAttribute("data-mode") });
  });
  document.querySelector("[data-dot-choices]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-dot]");
    if (button) change({ dots: button.getAttribute("data-dot") });
  });
  document.querySelector("[data-colors]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-color]");
    if (button) change({ color: button.getAttribute("data-color") });
  });
  document.querySelector("[data-color-custom]").addEventListener("input", function (event) {
    change({ color: event.target.value.toLowerCase() });
  });
  document.querySelector("[data-speed-range]").addEventListener("input", function (event) {
    change({ speed: clampInt(event.target.value, 1, 10, DEFAULTS.speed) });
  });
  document.querySelector("[data-size-range]").addEventListener("input", function (event) {
    change({ size: clampInt(event.target.value, 48, 240, DEFAULTS.size) });
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    if (sign.classList.contains("is-pseudo-fullscreen")) {
      sign.classList.remove("is-pseudo-fullscreen");
      applySign();
      return;
    }
    function pseudo() {
      sign.classList.add("is-pseudo-fullscreen");
      applySign();
    }
    if (sign.requestFullscreen) {
      sign.requestFullscreen().catch(pseudo);
    } else {
      pseudo();
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-sign-fullscreen]"), function (button) {
    button.addEventListener("click", toggleFullscreen);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && sign.classList.contains("is-pseudo-fullscreen")) {
      sign.classList.remove("is-pseudo-fullscreen");
      applySign();
    }
  });

  document.querySelector("[data-share]").addEventListener("click", function (event) {
    writeHashNow();
    Site.copyText(location.href, event.currentTarget);
  });
  document.querySelector("[data-copy-text-live]").addEventListener("click", function (event) {
    Site.copyText(state.text, event.currentTarget);
  });

  window.addEventListener("hashchange", function () {
    var next = readHash();
    var textChanged = next.text !== state.text;
    state = next;
    if (textChanged) {
      editor.setValue(state.text);
      FontKku.refresh(host, { text: state.text });
    }
    if (editor.ime.getLayout() !== state.layout) {
      editor.ime.setLayout(state.layout);
      renderMode();
    }
    syncControls();
    applySign();
  });

  // ── 시작 ─────────────────────────────────────────────────
  Apps.applyNoFont();
  FontKku.refresh(host, { text: state.text });
  syncControls();
  applySign();
  showKeyboard(coarse || Apps.noFont.active);

  window.FontKkuSign = {
    state: function () {
      return Object.assign({}, state);
    },
    editor: editor,
    animation: function () {
      return animation;
    }
  };
})();
