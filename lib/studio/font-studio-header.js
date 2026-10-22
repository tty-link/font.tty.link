/* font-studio-header.js — 작업실 머리 막대 (PLAN-STUDIO-002 S2 '머리 막대 다시 짜기')
 *
 * 막대: 글꼴 고르기 ▾ · 열기 하나 · 저장 하나 · 내보내기 ▾ · 되돌리기·다시(하나의 기록) · 저장 상태.
 * - 글꼴 고르기: spec/fonts.json의 기본 제공 글꼴(바탕·파생)마다 견본 한 줄(메뉴를 처음 열 때 그린다) + 저장 창구가 바깥(http·relay)이면
 *   '내 글꼴'. 고르면 바로 연다 — 고친 것이 있으면 묻는다(FontStudio.openShipped → guardLoad, D12).
 * - 열기: 파일 하나(CSS·글꼴 묶음·프로젝트·초안·디자인 JSON·디자인 묶음·자소판 PNG — FontStudio.openFile).
 * - 저장: 글꼴 묶음 전체를 저장 창구로(FontStudio.save). 처음 저장은 FontStudio.saveNeedsChoice()가 있으면 대화상자로 묻는다
 *   ('새 글꼴로' 이름 제안 / '이 글꼴 그대로'는 저장소 작업실에서만).
 * - 내보내기: CSS만(빠지는 것을 함께 보인다 — lostInCss) · CSS 복사 · 연결한 파일에 저장 · 내 페이지에 쓰기(코드) · 글꼴 묶음 파일 ·
 *   글꼴 파일(TTF) · 자소판 PNG · 그림 세트 .jamo.js · 통째로 풀어 저장(파생 글꼴). 앞 다섯과 통째로 풀기는 font-studio.js가 잇는다.
 * - 되돌리기·다시: 하나의 기록 전체의 마지막 일(Cmd/Ctrl+Z와 같다), 툴팁은 그 일의 이름(FontStudio.timeline.peek()).
 * 메뉴 키: 단추에서 Enter·Space·↓(첫 항목)·↑(끝 항목), 메뉴 안 ↑↓·Home·End, Esc는 닫고 단추로, Tab은 닫는다.
 * - 보기 전환(S3): '쉬운 / 정밀' 두 단추(radiogroup, ←→로 오감) — [data-studio-mode-slot]. 바꾸면 이 브라우저에 기억한다
 *   (FontStudio.setMode(name, { remember: true })). 쉬운 모드의 막대는 계획의 목록만: 페이지 고리 · 글꼴 ▾('파일 열기…' 포함) ·
 *   되돌리기·다시 · 저장 · 내보내기 ▾ · 보기. '열기' 단추·상태·'새 이름 · 파일 연결 · 그 밖'은 정밀 모드에서.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var root = document.querySelector("[data-studio]");
  var bar = root && root.querySelector("[data-studio-bar]");
  if (!Studio || !root || !bar) {
    return;
  }

  function $(selector) {
    return root.querySelector(selector);
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

  // ── 메뉴 ───────────────────────────────────────────────────────────

  var menus = {};
  var current = null;
  var openInput = $("[data-studio-open-file]");

  /* 지금 보이는 항목만(감춘 칸·보기에 따라 감춘 칸[data-studio-easy|precise]·꺼진 단추 빼고) */
  function itemsOf(menu) {
    return Array.prototype.filter.call(menu.panel.querySelectorAll('[role^="menuitem"]'), function (item) {
      return !item.hidden && !item.closest("[hidden]:not([data-studio-menu-panel])") && !item.disabled &&
        (menu.panel.hidden || getComputedStyle(item).display !== "none");
    });
  }

  function focusItem(menu, which) {
    var items = itemsOf(menu);
    if (!items.length) {
      menu.panel.focus();
      return;
    }
    var target = which === "last" ? items[items.length - 1]
      : which === "checked" ? items.filter(function (item) { return item.getAttribute("aria-checked") === "true"; })[0] || items[0]
      : items[0];
    var focusable = target.matches("label") ? target.querySelector("input") || target : target;
    focusable.focus({ preventScroll: false });
  }

  function openMenu(name, focus) {
    var menu = menus[name];
    if (!menu) {
      return false;
    }
    if (current && current !== name) {
      closeMenu(false);
    }
    if (menu.onOpen) {
      menu.onOpen();
    }
    menu.panel.hidden = false;
    menu.button.setAttribute("aria-expanded", "true");
    current = name;
    root.dataset.studioMenu = name;
    if (focus) {
      focusItem(menu, focus);
    }
    return true;
  }

  function closeMenu(returnFocus) {
    if (!current) {
      return;
    }
    var menu = menus[current];
    menu.panel.hidden = true;
    menu.button.setAttribute("aria-expanded", "false");
    current = null;
    delete root.dataset.studioMenu;
    if (returnFocus) {
      menu.button.focus({ preventScroll: true });
    }
  }

  function moveFocus(menu, step) {
    var items = itemsOf(menu);
    if (!items.length) {
      return;
    }
    var active = document.activeElement;
    var index = items.findIndex(function (item) { return item === active || item.contains(active); });
    var next = items[(index + step + items.length) % items.length];
    (next.matches("label") ? next.querySelector("input") || next : next).focus();
  }

  function registerMenu(name, options) {
    var button = bar.querySelector('[data-studio-menu-button="' + name + '"]');
    var panel = bar.querySelector('[data-studio-menu-panel="' + name + '"]');
    if (!button || !panel) {
      return null;
    }
    panel.tabIndex = -1;
    var menu = { name: name, button: button, panel: panel, onOpen: options && options.onOpen };
    menus[name] = menu;
    button.addEventListener("click", function () {
      if (current === name) {
        closeMenu(false);
      } else {
        openMenu(name, name === "font" ? "checked" : "first");
      }
    });
    button.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu(name, event.key === "ArrowUp" ? "last" : name === "font" ? "checked" : "first");
      } else if (event.key === "Escape" && current === name) {
        event.preventDefault();
        closeMenu(true);
      }
    });
    panel.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(menu, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        focusItem(menu, event.key === "Home" ? "first" : "last");
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      } else if (event.key === "Tab") {
        closeMenu(false);
      }
    });
    /* 항목을 누르면 닫는다(체크 칸은 열어 둔다) — 일은 항목에 붙은 처리기가 먼저 한다(항목 처리기는 이 판보다 먼저 돈다).
     * 바로 닫는다 — 다음 틱에 닫으면 곧이어 다시 연 메뉴가 닫혔다 */
    panel.addEventListener("click", function (event) {
      var item = event.target.closest('[role^="menuitem"]');
      if (!item || item.disabled || item.getAttribute("role") === "menuitemcheckbox") {
        return;
      }
      if (current === name) {
        closeMenu(document.activeElement === item);
      }
    });
    return menu;
  }

  document.addEventListener("pointerdown", function (event) {
    if (current && !menus[current].panel.contains(event.target) && !menus[current].button.contains(event.target)) {
      closeMenu(false);
    }
  });

  // ── 글꼴 고르기 ────────────────────────────────────────────────────

  var fontButton = bar.querySelector('[data-studio-menu-button="font"]');
  var fontPanel = bar.querySelector("[data-studio-font-menu]");
  var currentFont = null;
  var catalog = null;
  var samplesDrawn = false;
  var SAMPLE_TEXT = "한글 꾸미기";

  function profileUrl(id) {
    /* 작업실 옆의 profiles/ — 코어 CSS(font-kku.css)와 같은 자리(저장소·npm 꾸러미 모두) */
    return new URL("profiles/" + id + ".css", new URL(".", Studio.coreHref())).href;
  }

  function groupLabel(text, kind) {
    var label = make("p", "studio-menu-group", text);
    label.setAttribute("role", "presentation");
    label.dataset.studioFontGroup = kind;
    return label;
  }

  function fontOption(entry) {
    var item = make("button", "studio-font-option");
    item.type = "button";
    item.setAttribute("role", "menuitemradio");
    item.setAttribute("aria-checked", String(entry.id === currentFont));
    item.dataset.studioFontOption = entry.id;
    var name = make("span", "studio-font-name", entry.id);
    item.appendChild(name);
    if (entry.base) {
      item.appendChild(make("span", "studio-font-base", "바탕 " + entry.base));
    }
    var sample = make("span", "studio-font-sample");
    sample.setAttribute("aria-hidden", "true");
    sample.dataset.studioFontSample = entry.id;
    item.appendChild(sample);
    return item;
  }

  function buildFontMenu(info) {
    catalog = info || (typeof Studio.fonts === "function" ? Studio.fonts() : null);
    if (!catalog) {
      return;
    }
    samplesDrawn = false;
    fontPanel.textContent = "";
    /* 쉬운 모드에는 '열기' 단추가 없다 — 글꼴 ▾ 맨 위의 '파일 열기…'(정밀 모드는 막대의 '열기') */
    var openItem = make("button", "studio-font-open", "파일 열기…");
    openItem.type = "button";
    openItem.setAttribute("role", "menuitem");
    openItem.dataset.studioOpenItem = "";
    openItem.dataset.studioEasy = "";
    openItem.appendChild(make("small", "", "CSS · 글꼴 묶음 · 프로젝트 · 디자인 · 자소판 PNG"));
    fontPanel.appendChild(openItem);
    var bases = catalog.fonts.filter(function (entry) { return !entry.base; });
    var derived = catalog.fonts.filter(function (entry) { return entry.base; });
    fontPanel.appendChild(groupLabel("바탕 글꼴", "base"));
    bases.forEach(function (entry) { fontPanel.appendChild(fontOption(entry)); });
    if (derived.length) {
      fontPanel.appendChild(groupLabel("파생 글꼴", "derived"));
      derived.forEach(function (entry) { fontPanel.appendChild(fontOption(entry)); });
    }
    var mine = make("div", "studio-store-fonts");
    mine.dataset.studioStoreFonts = "";
    mine.setAttribute("role", "group");
    mine.setAttribute("aria-label", "내 글꼴");
    mine.hidden = true;
    fontPanel.appendChild(mine);
    fontPanel.dataset.count = String(catalog.fonts.length);
  }

  /* 견본 한 줄 — 견본마다 그림자 트리(코어 CSS + 그 글꼴 CSS)에 <font-kku>를 둔다. 메뉴를 처음 열 때, 넷씩 차례로 */
  function drawSamples() {
    if (samplesDrawn || typeof FontKku === "undefined") {
      return;
    }
    samplesDrawn = true;
    var queue = Array.prototype.slice.call(fontPanel.querySelectorAll("[data-studio-font-sample]"));
    function next() {
      var sample = queue.shift();
      if (!sample) {
        return Promise.resolve();
      }
      var id = sample.dataset.studioFontSample;
      if (sample.shadowRoot) {
        return next();
      }
      var shadow = sample.attachShadow({ mode: "open" });
      var core = document.createElement("link");
      core.rel = "stylesheet";
      core.href = Studio.coreHref();
      shadow.appendChild(core);
      var style = document.createElement("style");
      style.textContent = ":host { display: block; font-size: 20px; line-height: 1.25; white-space: nowrap; overflow: hidden; }";
      shadow.appendChild(style);
      var host = document.createElement("font-kku");
      host.setAttribute("font", id);
      host.textContent = SAMPLE_TEXT;
      shadow.appendChild(host);
      return FontKku.loadFont(profileUrl(id), { root: shadow }).then(function () {
        sample.dataset.drawn = "true";
      }, function () {
        sample.dataset.drawn = "failed";
      }).then(next);
    }
    var lanes = [];
    for (var i = 0; i < 4; i += 1) {
      lanes.push(next());
    }
    Promise.all(lanes).then(function () { fontPanel.dataset.samples = "drawn"; });
  }

  function storeFontsRow(entry) {
    var item = make("button", "studio-font-option studio-store-font");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.studioStoreFont = entry.id;
    item.appendChild(make("span", "studio-font-name", entry.id));
    var bits = [];
    if (entry.rev) {
      bits.push("판 " + String(entry.rev).slice(0, 7));
    }
    if (entry.updatedAt) {
      var when = new Date(entry.updatedAt);
      if (!isNaN(when.getTime())) {
        bits.push(when.toLocaleString());
      }
    }
    if (entry.actor) {
      bits.push(String(entry.actor));
    }
    item.appendChild(make("span", "studio-font-base", bits.join(" · ")));
    return item;
  }

  function loadStoreFonts() {
    var box = fontPanel.querySelector("[data-studio-store-fonts]");
    var info = typeof Studio.store === "function" ? Studio.store() : null;
    if (!box || !info || info.kind === "local" || typeof Studio.storeList !== "function") {
      if (box) {
        box.hidden = true;
      }
      return;
    }
    box.hidden = false;
    box.textContent = "";
    box.appendChild(groupLabel("내 글꼴(저장 창구)", "store"));
    var wait = make("p", "studio-menu-note", "목록을 받는 중…");
    box.appendChild(wait);
    Studio.storeList().then(function (fonts) {
      wait.remove();
      if (!Array.isArray(fonts)) {
        box.appendChild(make("p", "studio-menu-note", "저장 창구 목록을 받지 못했습니다" + (fonts && fonts.message ? " — " + fonts.message : "") + "."));
        return;
      }
      if (!fonts.length) {
        box.appendChild(make("p", "studio-menu-note", "아직 저장한 글꼴이 없습니다."));
        return;
      }
      fonts.forEach(function (entry) {
        if (entry && typeof entry.id === "string") {
          box.appendChild(storeFontsRow(entry));
        }
      });
    });
  }

  function syncFont(id) {
    currentFont = id || null;
    var label = $("[data-studio-font-current]");
    if (label) {
      label.textContent = currentFont || "-";
    }
    Array.prototype.forEach.call(fontPanel.querySelectorAll("[data-studio-font-option]"), function (item) {
      item.setAttribute("aria-checked", String(item.dataset.studioFontOption === currentFont));
    });
    fontButton.title = (currentFont ? "글꼴 " + currentFont + " — " : "") + "글꼴 고르기: 고르면 바로 엽니다";
  }

  fontPanel.addEventListener("click", function (event) {
    if (event.target.closest("[data-studio-open-item]")) {
      closeMenu(false);
      openInput.click();
      return;
    }
    var option = event.target.closest("[data-studio-font-option]");
    if (option) {
      Studio.openShipped(option.dataset.studioFontOption);
      return;
    }
    var mine = event.target.closest("[data-studio-store-font]");
    if (mine) {
      var id = mine.dataset.studioStoreFont;
      Studio.guardLoad("저장 창구의 " + id, function () { Studio.reloadFromStore(id); });
    }
  });

  registerMenu("font", {
    onOpen: function () {
      if (!fontPanel.querySelector("[data-studio-font-option]")) {
        buildFontMenu();
      }
      syncFont(currentFont);
      drawSamples();
      loadStoreFonts();
    }
  });

  Studio.on("catalog", function (info) {
    buildFontMenu(info);
    syncFont(currentFont);
  });
  Studio.on("font", function (info) {
    syncFont(info && info.id);
  });

  // ── 열기 ───────────────────────────────────────────────────────────

  var openButton = $("[data-studio-open]");
  openButton.addEventListener("click", function () {
    closeMenu(false);
    openInput.click();
  });

  // ── 저장 · 처음 저장 대화상자 ──────────────────────────────────────

  var saveButton = $("[data-studio-save-all]");
  var dialog = $("[data-studio-save-dialog]");
  var form = dialog ? dialog.querySelector("[data-studio-save-form]") : null;
  var pendingForce = false;
  var savedAt = null;

  function showSaveDialog(ask, force) {
    if (!dialog) {
      return false;
    }
    pendingForce = Boolean(force);
    dialog.querySelector("[data-studio-save-why]").textContent = "기본 제공 글꼴 " + ask.font + "을(를) 처음 저장합니다 — 어떻게 저장할지 고르세요." +
      (ask.choices.indexOf("same") < 0 ? " 고친 기본 제공 글꼴은 새 이름의 파생 글꼴로 저장합니다." : "");
    var same = dialog.querySelector('[data-studio-save-option="same"]');
    same.hidden = ask.choices.indexOf("same") < 0;
    dialog.querySelector("[data-studio-save-font]").textContent = ask.font;
    dialog.querySelector('input[name="studio-save-as"][value="new"]').checked = true;
    var name = dialog.querySelector("[data-studio-save-name]");
    name.value = ask.suggestedName || "";
    name.disabled = false;
    var error = dialog.querySelector("[data-studio-save-error]");
    error.hidden = true;
    error.textContent = "";
    root.dataset.saveDialog = "open";
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    name.focus();
    name.select();
    return true;
  }

  function closeSaveDialog() {
    if (!dialog) {
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
    delete root.dataset.saveDialog;
  }

  function afterSave(result) {
    if (result && result.ok) {
      savedAt = new Date();
    }
    renderStore();
    return result;
  }

  /* 저장 하나 — 처음 저장이면 묻고, 아니면 바로. force: 저장 창구 판이 달라도 내 것으로 덮어쓰기.
   * 쉬운 모드에서 고를 것이 '새 글꼴로' 하나뿐이면(사이트·서비스) 묻지 않고 제안 이름(my-<id>)으로 바로 저장한다 — 간단하게도 만들 수
   * 있게(2026-10-18 사용자 원칙: 모든 기능을 거쳐야만 글꼴을 만들 수 있게 강제하지 않는다). 이름은 정밀 모드의 '새 이름'에서 바꾼다.
   * 고를 것이 둘이면(저장소 작업실 — 같은 이름도 된다)·정밀 모드면 지금처럼 묻는다 */
  function save(options) {
    var opts = options || {};
    closeMenu(false);
    var ask = typeof Studio.saveNeedsChoice === "function" ? Studio.saveNeedsChoice() : null;
    if (ask && !opts.as) {
      var mode = typeof Studio.mode === "function" ? Studio.mode() : root.dataset.studioMode;
      if (mode === "easy" && ask.choices.length === 1 && ask.choices[0] === "new") {
        return Studio.save({ as: "new", name: ask.suggestedName, force: opts.force }).then(function (result) {
          if (result && result.ok) {
            Studio.message("새 글꼴 '" + ask.suggestedName + "'(으)로 저장했습니다 — 바탕 " + ask.font +
              "은 그대로 두고 고친 것만 담았습니다. 이름은 정밀 모드의 '새 이름'에서 바꿀 수 있습니다.");
          }
          return afterSave(result);
        });
      }
      showSaveDialog(ask, opts.force);
      return Promise.resolve({ ok: false, code: "SAVE_NEEDS_CHOICE", asked: true });
    }
    return Studio.save(opts).then(afterSave);
  }

  saveButton.addEventListener("click", function () { save(); });

  if (form) {
    dialog.querySelectorAll('input[name="studio-save-as"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        dialog.querySelector("[data-studio-save-name]").disabled = dialog.querySelector('input[name="studio-save-as"]:checked').value !== "new";
      });
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var as = dialog.querySelector('input[name="studio-save-as"]:checked').value;
      var options = { as: as };
      if (as === "new") {
        options.name = dialog.querySelector("[data-studio-save-name]").value.trim();
      }
      if (pendingForce) {
        options.force = true;
      }
      var confirm = dialog.querySelector("[data-studio-save-confirm]");
      confirm.disabled = true;
      Studio.save(options).then(function (result) {
        confirm.disabled = false;
        if (result && result.ok) {
          closeSaveDialog();
          saveButton.focus({ preventScroll: true });
        } else {
          var error = dialog.querySelector("[data-studio-save-error]");
          error.textContent = result && result.message ? result.message : "저장하지 못했습니다.";
          error.hidden = false;
        }
        afterSave(result);
      }, function (error) {
        confirm.disabled = false;
        var line = dialog.querySelector("[data-studio-save-error]");
        line.textContent = error && error.message ? error.message : "저장하지 못했습니다.";
        line.hidden = false;
      });
    });
    dialog.querySelector("[data-studio-save-cancel]").addEventListener("click", function () {
      closeSaveDialog();
      Studio.message("저장하지 않았습니다.");
      saveButton.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", function () {
      delete root.dataset.saveDialog;
    });
  }

  // ── 저장 상태 · 창구 판 충돌 ───────────────────────────────────────

  var stateLine = $("[data-studio-store-state]");
  var conflictBar = $("[data-studio-store-conflict-bar]");

  function renderStore() {
    var info = typeof Studio.store === "function" ? Studio.store() : { kind: "local", saved: false, conflict: null };
    var dirty = typeof Studio.dirty === "function" ? Studio.dirty() : false;
    var conflict = root.dataset.storeConflict === "true";
    var where = info.kind === "local" ? "" : "저장 창구 ";
    var text = "";
    var kind = "clean";
    if (conflict) {
      kind = "conflict";
      text = where + "판이 다릅니다";
    } else if (dirty) {
      kind = "dirty";
      text = "저장 안 한 편집";
    } else if (info.saved) {
      kind = "saved";
      text = where + "저장함" + (savedAt ? " " + savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
    }
    stateLine.textContent = text;
    stateLine.dataset.state = kind;
    stateLine.title = info.kind === "local" ? "저장은 글꼴 묶음 파일을 내려받습니다(파일을 연결했으면 그 파일)" :
      (info.url || "") + (info.rev ? " · 판 " + info.rev : "");
    saveButton.dataset.state = kind;
    if (conflictBar) {
      conflictBar.hidden = !conflict;
      if (conflict) {
        var font = Studio.state.fontName || "";
        var who = info.conflict && info.conflict.actor ? "다른 행위자(" + info.conflict.actor + ")가 " + font + "을(를) 바꿨습니다" :
          "저장 창구의 " + font + " 판이 내가 연 판과 다릅니다";
        $("[data-studio-store-conflict-text]").textContent = who + " — '창구 판 다시 싣기'는 지금 고친 것을 버리고, '내 것으로 덮어쓰기'는 창구의 판을 지금 것으로 바꿉니다.";
      }
    }
  }

  $("[data-studio-store-reload]").addEventListener("click", function () {
    Studio.reloadFromStore().then(renderStore);
  });
  $("[data-studio-store-overwrite]").addEventListener("click", function () {
    save({ force: true });
  });

  new MutationObserver(renderStore).observe(root, { attributes: true, attributeFilter: ["data-store-conflict", "data-store-rev"] });

  // ── 되돌리기 · 다시 ────────────────────────────────────────────────

  var undoButton = $("[data-studio-undo]");
  var redoButton = $("[data-studio-redo]");

  function syncHistory() {
    var timeline = Studio.timeline;
    if (!timeline) {
      return;
    }
    var peek = timeline.peek();
    var canUndo = timeline.canUndo();
    var canRedo = timeline.canRedo();
    undoButton.disabled = !canUndo;
    redoButton.disabled = !canRedo;
    undoButton.title = canUndo && peek.undo ? "되돌리기 — " + peek.undo + " (Ctrl+Z · ⌘Z)" : "되돌릴 것이 없습니다";
    redoButton.title = canRedo && peek.redo ? "다시 — " + peek.redo + " (Shift+Ctrl+Z · ⌘⇧Z)" : "다시 할 것이 없습니다";
    undoButton.dataset.label = canUndo ? peek.undo || "" : "";
    redoButton.dataset.label = canRedo ? peek.redo || "" : "";
  }

  if (Studio.timeline && typeof Studio.timeline.on === "function") {
    Studio.timeline.on(function () {
      syncHistory();
      renderStore();
    });
  }

  // ── 내보내기 ───────────────────────────────────────────────────────

  var exportPanel = bar.querySelector('[data-studio-menu-panel="export"]');

  function material() {
    return Studio.material && Studio.material.state && Studio.material.state.active ? Studio.material : null;
  }

  function drawingJs() {
    return Studio.bundle && typeof Studio.bundle.jamoJs === "function" ? Studio.bundle.jamoJs() : null;
  }

  function setItem(selector, enabled, note) {
    var item = exportPanel.querySelector(selector);
    if (!item) {
      return;
    }
    item.disabled = !enabled;
    var small = item.querySelector("small");
    if (small) {
      small.textContent = note || "";
    }
  }

  function syncExport() {
    var lost = typeof Studio.lostInCss === "function" ? Studio.lostInCss() : [];
    var lostNote = exportPanel.querySelector("[data-studio-export-lost]");
    if (lostNote) {
      lostNote.textContent = lost.length ? "빠지는 것: " + lost.join(", ") : "글꼴 CSS 한 파일";
    }
    exportPanel.querySelector("[data-studio-export-css]").dataset.lost = String(lost.length);
    var sheet = material();
    setItem("[data-studio-export-font]", Boolean(sheet), sheet ? "한글 11,172자 · 몇 초 걸립니다" : "그림 자소 글꼴(자소판)만");
    setItem("[data-studio-export-sheet]", Boolean(sheet), sheet ? "지금 자소판 그림" : "그림 자소 글꼴(자소판)만");
    var jamo = drawingJs();
    setItem("[data-studio-export-jamo]", Boolean(jamo), jamo ? "그린 그림 세트 — <script>로 싣는 파일" : "그린 칸이 없습니다");
    var flatten = exportPanel.querySelector("[data-studio-flatten-option]");
    if (flatten) {
      flatten.setAttribute("aria-checked", String(Boolean(exportPanel.querySelector("[data-studio-flatten]").checked)));
    }
  }

  registerMenu("export", { onOpen: syncExport });

  exportPanel.querySelector("[data-studio-flatten]").addEventListener("change", syncExport);

  /* 내 페이지에 쓰기 — 글꼴 CSS 파일 + 런타임 + (CSS가 나르지 못하는 디자인·그린 그림 세트가 있으면) 그림 세트 줄과 디자인 등록 */
  function pageCode() {
    var id = Studio.state.fontName || Studio.state.fontId || "my-font";
    var sheet = material();
    var lost = typeof Studio.lostInCss === "function" ? Studio.lostInCss() : [];
    var files = ["font-kku.js · font-kku.css(npm @tty.link/font-kku)", id + ".css('내보내기 ▸ CSS만 내려받기')"];
    if (sheet) {
      files.push("자소판 PNG('내보내기 ▸ 자소판 PNG')");
    }
    var lines = [
      "<!-- font-kku " + (typeof FontKku !== "undefined" ? FontKku.version : "") + " — 글꼴 " + id + "을(를) 내 페이지에 쓰기. 페이지 옆에 둘 파일: " +
        files.join(", ") + " -->",
      '<link rel="stylesheet" href="font-kku.css">',
      '<link rel="stylesheet" href="' + id + '.css">',
      '<script src="font-kku.js"></script>'
    ];
    var designLost = lost.some(function (item) { return /디자인|그림 세트/.test(item); });
    if (designLost && Studio.bundle && typeof Studio.bundle.snippet === "function") {
      lines.push(Studio.bundle.snippet().trim());
    }
    lines.push('<font-kku font="' + id + '">한글</font-kku>');
    return lines.join("\n") + "\n";
  }

  function copyPageCode() {
    var text = pageCode();
    return Studio.copyText(text).then(function (copied) {
      if (copied) {
        Studio.message("내 페이지에 쓸 코드를 복사했습니다 — 주석에 적힌 파일을 페이지 옆에 두세요.");
      } else {
        var fallback = $("[data-studio-copy-fallback]");
        var area = $("[data-studio-copy-fallback-text]");
        var label = $("[data-studio-copy-fallback-label]");
        if (label) {
          label.textContent = "내 페이지에 쓸 코드 — 골라 두었으니 직접 복사하세요";
        }
        area.value = text;
        fallback.hidden = false;
        area.focus({ preventScroll: false });
        area.select();
        Studio.message("브라우저가 클립보드 쓰기를 막았습니다 — 아래 칸의 코드를 골라 두었으니 직접 복사하세요(Ctrl+C·⌘C).", "warn");
      }
      return { copied: copied, text: text };
    });
  }

  exportPanel.addEventListener("click", function (event) {
    var item = event.target.closest("button[role=menuitem]");
    if (!item || item.disabled) {
      return;
    }
    if (item.matches("[data-studio-export-page]")) {
      copyPageCode();
    } else if (item.matches("[data-studio-export-font]")) {
      var sheet = material();
      if (sheet) {
        sheet.exportFontFile().catch(function () {});
      }
    } else if (item.matches("[data-studio-export-sheet]")) {
      var png = material();
      if (png) {
        png.exportPng().then(function (result) {
          Studio.message(result.name + "(" + result.width + "×" + result.height + ")을 내보냈습니다.");
        });
      }
    } else if (item.matches("[data-studio-export-jamo]")) {
      Studio.bundle.exportJamo();
    }
  });

  // ── 처음과 글꼴을 열 때 ────────────────────────────────────────────

  /* 고친 것(CSS·디자인·그림·자소판·검수 — 자동화 계약의 change 훅)은 '고친 것 있음'을 정한 뒤에 온다 — 저장 상태를 다시 */
  Studio.on("change", function () {
    renderStore();
  });
  Studio.on("load", function () {
    savedAt = null;
    setTimeout(function () {
      syncHistory();
      renderStore();
    }, 0);
  });

  if (typeof Studio.fonts === "function" && Studio.fonts().fonts.length) {
    buildFontMenu();
  }
  syncFont(Studio.state.fontName || root.dataset.currentFont || null);
  syncHistory();
  renderStore();

  // ── 보기 전환(쉬운 / 정밀, S3) ─────────────────────────────────────

  var modeSlot = $("[data-studio-mode-slot]");
  var modeButtons = {};

  function syncMode() {
    var mode = typeof Studio.mode === "function" ? Studio.mode() : root.dataset.studioMode;
    Object.keys(modeButtons).forEach(function (name) {
      var on = name === mode;
      modeButtons[name].setAttribute("aria-checked", on ? "true" : "false");
      modeButtons[name].tabIndex = on ? 0 : -1;
    });
  }

  function chooseMode(name, focus) {
    if (typeof Studio.setMode === "function") {
      Studio.setMode(name, { remember: true });
    }
    syncMode();
    if (focus && modeButtons[name]) {
      modeButtons[name].focus({ preventScroll: true });
    }
  }

  if (modeSlot) {
    var group = make("div", "studio-mode-toggle");
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "보기");
    group.dataset.studioModeToggle = "";
    [["easy", "쉬운", "결과 중심 — 보이는 글자·위치·크기만"], ["precise", "정밀", "원인 중심 — 규칙·범위·출처·CSS 원문까지"]].forEach(function (spec) {
      var button = make("button", "studio-mode-option", spec[1]);
      button.type = "button";
      button.setAttribute("role", "radio");
      button.dataset.studioModeOption = spec[0];
      button.title = spec[1] + " 보기 — " + spec[2];
      button.addEventListener("click", function () { chooseMode(spec[0], false); });
      modeButtons[spec[0]] = button;
      group.appendChild(button);
    });
    group.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
        var mode = typeof Studio.mode === "function" ? Studio.mode() : root.dataset.studioMode;
        chooseMode(mode === "easy" ? "precise" : "easy", true);
        event.preventDefault();
      }
    });
    modeSlot.textContent = "";
    modeSlot.appendChild(group);
    modeSlot.hidden = false;
    Studio.on("mode", syncMode);
    syncMode();
  }

  /* 시험·자동화: 메뉴 열고 닫기, 첫 저장(대화상자 포함), 내 페이지 코드 */
  Studio.header = {
    open: function (name) { return openMenu(name, "first"); },
    close: function () { closeMenu(false); },
    current: function () { return current; },
    save: save,
    pageCode: pageCode,
    copyPageCode: copyPageCode,
    sync: function () {
      syncHistory();
      renderStore();
      syncExport();
    }
  };
})();
