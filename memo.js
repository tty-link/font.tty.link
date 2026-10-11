/* 메모장 — 영문 자판으로 한글을 쓰고, 폰꾸 그림 자소로 그린 면에서 고치는 메모장.
 * 글·글꼴·크기·배열은 이 브라우저의 localStorage에 저장한다. */
(function () {
  "use strict";

  var Apps = window.FontKkuApps;
  var Site = window.FontKkuSite;

  window.FontKkuDemo.renderNav("showcase");

  var STORAGE_KEY = "font-kku-memo";
  var FONTS = { "sprite-system": "", pixel: "", dojang: "paper", chalk: "board" };
  var SIZES = ["24", "34", "46"];
  var DEFAULTS = {
    text: "오늘 할 일\n- 전광판에 가게 이름 띄우기\n- 한글 글꼴 없는 기기에서 메모 써 보기",
    font: "sprite-system",
    size: "34",
    layout: "dubeol"
  };
  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  var en = Apps.noFont.active;

  function load() {
    var saved = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      saved = null;
    }
    var state = Object.assign({}, DEFAULTS);
    if (saved && typeof saved === "object") {
      if (typeof saved.text === "string") state.text = saved.text.slice(0, 5000);
      if (Object.prototype.hasOwnProperty.call(FONTS, saved.font)) state.font = saved.font;
      if (SIZES.indexOf(String(saved.size)) !== -1) state.size = String(saved.size);
      try {
        state.layout = window.FontKkuIme.normalizeLayout(saved.layout || DEFAULTS.layout);
      } catch (error) {
        state.layout = DEFAULTS.layout;
      }
    }
    return state;
  }

  var state = load();
  var paper = document.querySelector("[data-memo-paper]");
  var statusNode = document.querySelector("[data-memo-status]");
  var saveTimer = 0;
  var saved = true;

  function charCount(text) {
    return Array.from(text).length;
  }

  function renderStatus() {
    var count = charCount(state.text);
    var label = en
      ? count + " chars · " + (saved === true ? "saved" : saved === false ? "not saved" : "saving…")
      : count + "자 · " + (saved === true ? "저장됨" : saved === false ? "저장 못 함" : "저장 중…");
    statusNode.textContent = label;
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saved = true;
    } catch (error) {
      saved = false;
    }
    renderStatus();
  }

  function queueSave() {
    saved = null;
    renderStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  /* 탭을 닫거나 다른 페이지로 갈 때 기다리던 저장을 바로 한다 */
  function flushSave() {
    if (saved === null) {
      clearTimeout(saveTimer);
      save();
    }
  }
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      flushSave();
    }
  });

  var editor = Apps.createEditor(paper, {
    multiline: true,
    font: state.font,
    layout: state.layout,
    value: state.text,
    label: "메모 본문",
    placeholder: "여기에 한글을 써 보세요",
    maxLength: 5000,
    onChange: function (value) {
      if (value !== state.text) {
        state.text = value;
        queueSave();
      }
    }
  });

  Apps.bindImeControls(editor, document, function (layout) {
    state.layout = layout;
    queueSave();
  });

  // ── 글꼴·크기 ────────────────────────────────────────────
  function pressGroup(selector, attr, value) {
    Array.prototype.forEach.call(document.querySelectorAll(selector + " [" + attr + "]"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute(attr) === value));
    });
  }

  function applyLook() {
    editor.setFont(state.font);
    editor.root.style.setProperty("--kk-editor-size", state.size + "px");
    var tone = FONTS[state.font];
    if (tone) {
      paper.setAttribute("data-tone", tone);
    } else {
      paper.removeAttribute("data-tone");
    }
    pressGroup("[data-font-choices]", "data-font", state.font);
    pressGroup("[data-sizes]", "data-size", state.size);
    editor.relayout();
  }

  document.querySelector("[data-font-choices]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-font]");
    if (button) {
      state.font = button.getAttribute("data-font");
      applyLook();
      queueSave();
    }
  });
  document.querySelector("[data-sizes]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-size]");
    if (button) {
      state.size = button.getAttribute("data-size");
      applyLook();
      queueSave();
    }
  });

  // ── 복사·내려받기·지우기 ─────────────────────────────────
  document.querySelector("[data-memo-copy]").addEventListener("click", function (event) {
    Site.copyText(editor.getValue(), event.currentTarget);
  });

  document.querySelector("[data-memo-download]").addEventListener("click", function (event) {
    var now = new Date();
    function pad(n) {
      return (n < 10 ? "0" : "") + n;
    }
    var name = "memo-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" +
      pad(now.getHours()) + pad(now.getMinutes()) + ".txt";
    var blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    var button = event.currentTarget;
    var label = button.textContent;
    button.textContent = en ? "Downloaded" : "내려받음";
    setTimeout(function () { button.textContent = label; }, 1600);
  });

  /* 확인 창(기기 글꼴로 그린다) 대신 두 번 누르기 */
  var clearButton = document.querySelector("[data-memo-clear]");
  var clearArmed = 0;
  clearButton.addEventListener("click", function () {
    if (!clearArmed) {
      var label = clearButton.textContent;
      clearButton.textContent = en ? "Click again to clear" : "한 번 더 누르면 지웁니다";
      clearButton.classList.add("k-btn--red");
      clearArmed = setTimeout(function () {
        clearArmed = 0;
        clearButton.textContent = label;
        clearButton.classList.remove("k-btn--red");
      }, 2500);
      return;
    }
    clearTimeout(clearArmed);
    clearArmed = 0;
    clearButton.textContent = en ? "Clear" : "지우기";
    clearButton.classList.remove("k-btn--red");
    editor.setValue("");
    state.text = "";
    queueSave();
    editor.focus();
  });

  // ── 화면 자판 ────────────────────────────────────────────
  var keyboardWrap = document.querySelector("[data-keyboard-wrap]");
  var keyboardToggle = document.querySelector("[data-keyboard-toggle]");
  var keyboard = Apps.createKeyboard(document.querySelector("[data-keyboard]"), { editor: editor, font: "sprite-system" });

  function showKeyboard(show) {
    keyboardWrap.hidden = !show;
    keyboardToggle.setAttribute("aria-expanded", String(show));
    if (coarse) {
      if (show) {
        editor.field.setAttribute("inputmode", "none");
      } else {
        editor.field.removeAttribute("inputmode");
      }
    }
  }
  keyboardToggle.addEventListener("click", function () {
    showKeyboard(keyboardWrap.hidden);
  });

  // ── 시작 ─────────────────────────────────────────────────
  Apps.applyNoFont();
  applyLook();
  showKeyboard(true);
  renderStatus();

  window.FontKkuMemo = {
    editor: editor,
    keyboard: keyboard,
    state: function () {
      return Object.assign({}, state);
    },
    storageKey: STORAGE_KEY
  };
})();
