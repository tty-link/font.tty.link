/* 웹 앱(전광판·메모장) 공용 부품 — 한글 입력기도 한글 글꼴도 없는 기기에서 쓰는 화면.
 *
 * - 글꼴 없는 모드   기기 글꼴이 한글을 못 그리면(FontKku.hasHangulFont() === false, 또는
 *                    주소에 ?hangul-font=none) 화면 글을 영어로 바꾸고, 기기 글꼴 재료로
 *                    그리던 폰꾸 제목을 그림 자소 글꼴로 바꾼다. 한글은 폰꾸가 자소판
 *                    그림으로만 그린다. ?hangul-font=device는 판단을 끈다
 *                      [data-en]             글을 이 영어로 바꾼다
 *                      [data-en-placeholder] placeholder를 바꾼다
 *                      [data-nofont-font]    폰꾸 바탕 요소의 글꼴을 이 그림 자소 글꼴로
 * - 편집면 createEditor  숨은 <textarea>/<input>이 키를 받고(입력기 font-kku-ime가 한글을
 *                    조합), 보이는 면은 폰꾸가 줄마다 그린다. 캐럿·조합 중인 음절·선택
 *                    영역은 그 위에 겹쳐 그린다. 기기 글꼴 없이도 편집하는 화면이다
 * - 화면 자판 createKeyboard  배열마다 키가 내는 자모를 폰꾸로 그린 자판. 누르면 입력기에
 *                    키를 넣는다(포인터·터치). 초성·중성·종성을 적·청·녹으로 칠한다
 *
 * font-kku.js(한 줄 설치)와 font-kku-ime.js 뒤에 불러온다. */
(function () {
  "use strict";

  var FontKku = window.FontKku;
  var Ime = window.FontKkuIme;
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* 기기 글꼴 재료 글꼴 — 글꼴 없는 모드에서 그림 자소 글꼴로 바꾼다 */
  var SYSTEM_FONTS = ["sebul", "gothic", "neon", "sticker", "malang", "retro", "saekdong", "geumbak", "glitch", "riso", "blueprint", "default", "classic", "gothic2"];
  var NAV_EN = { index: "Intro", showcase: "Cases", fonts: "Fonts", effects: "Motion", docs: "Docs", "font-studio": "Studio" };
  var LAYOUT_LABELS = {
    dubeol: { ko: "두벌식", en: "2-set" },
    "sebeol-390": { ko: "세벌식 390", en: "3-set 390" },
    "sebeol-final": { ko: "세벌식 최종", en: "3-set Final" }
  };
  var ROLE_COLORS = { cho: "#d62839", jung: "#1f4fd1", jong: "#12965f" };

  // ── 글꼴 없는 모드 ──────────────────────────────────────

  function decideNoFont() {
    var param = new URLSearchParams(location.search).get("hangul-font");
    if (param === "none") {
      return { active: true, forced: true };
    }
    if (param === "device") {
      return { active: false, forced: true };
    }
    return { active: Boolean(FontKku) && FontKku.hasHangulFont() === false, forced: false };
  }

  var noFont = decideNoFont();

  function swapFont(host, font) {
    if (host.tagName.toLowerCase() === "font-kku") {
      host.setAttribute("font", font);
    } else {
      host.setAttribute("data-font", font);
    }
  }

  function currentFont(host) {
    return (host.getAttribute("font") || host.getAttribute("data-font") || "sebul").trim().toLowerCase();
  }

  /* 화면을 글꼴 없는 모드로. renderNav() 뒤에 부른다. */
  function applyNoFont(root) {
    if (!noFont.active) {
      return;
    }
    var scope = root || document;
    document.documentElement.setAttribute("data-hangul-font", "none");
    ensureTint("kk-tint-cho", ROLE_COLORS.cho);
    Array.prototype.forEach.call(scope.querySelectorAll("[data-en]"), function (node) {
      node.textContent = node.getAttribute("data-en");
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-en-placeholder]"), function (node) {
      node.setAttribute("placeholder", node.getAttribute("data-en-placeholder"));
    });
    Array.prototype.forEach.call(scope.querySelectorAll("font-kku, .font-kku"), function (host) {
      var target = host.getAttribute("data-nofont-font");
      if (!target && SYSTEM_FONTS.indexOf(currentFont(host)) !== -1) {
        target = "sprite-system";
      }
      if (target && target !== currentFont(host)) {
        swapFont(host, target);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-demo-nav-link]"), function (link) {
      var label = link.querySelector(".demo-nav-label");
      var en = NAV_EN[link.getAttribute("data-demo-nav-link")];
      if (label && en) {
        label.textContent = en;
      }
    });
    var title = document.documentElement.getAttribute("data-en-title");
    if (title) {
      document.title = title;
    }
  }

  // ── 그림 자소 칠: SVG 필터 ──────────────────────────────
  /* 자소판 칸은 color를 따르지 않는다. 알파만 남기고 한 색으로 칠하는 필터를 만들어
   * 페이지 전용 변수 --fy-sprite-filter: url(#id)로 건다. */
  var tintRoot = null;

  function ensureTint(id, color) {
    if (!tintRoot) {
      tintRoot = document.createElementNS(SVG_NS, "svg");
      tintRoot.setAttribute("width", "0");
      tintRoot.setAttribute("height", "0");
      tintRoot.setAttribute("aria-hidden", "true");
      tintRoot.setAttribute("focusable", "false");
      tintRoot.style.position = "absolute";
      document.body.appendChild(tintRoot);
    }
    var filter = document.getElementById(id);
    if (!filter) {
      filter = document.createElementNS(SVG_NS, "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("color-interpolation-filters", "sRGB");
      var flood = document.createElementNS(SVG_NS, "feFlood");
      var composite = document.createElementNS(SVG_NS, "feComposite");
      composite.setAttribute("in2", "SourceAlpha");
      composite.setAttribute("operator", "in");
      filter.appendChild(flood);
      filter.appendChild(composite);
      tintRoot.appendChild(filter);
    }
    filter.firstChild.setAttribute("flood-color", color);
    return "url(#" + id + ")";
  }

  // ── 편집면 ──────────────────────────────────────────────

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    Object.keys(attrs || {}).forEach(function (name) {
      node.setAttribute(name, attrs[name]);
    });
    return node;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /* options:
   *   multiline   true면 <textarea>(여러 줄), 아니면 <input>
   *   font        그릴 글꼴(그림 자소 글꼴 권장)
   *   layout      입력기 배열 id
   *   value       처음 글
   *   label       숨은 입력 필드의 접근성 이름
   *   placeholder 비었을 때 보일 글(폰꾸로 그린다)
   *   maxLength   최대 글자 수
   *   onChange(value, state, reason)  글·캐럿·모드가 바뀔 때 */
  function createEditor(mount, options) {
    var opts = options || {};
    var multiline = opts.multiline !== false;
    var font = opts.font || "sprite-system";
    var maxLength = opts.maxLength || 4000;

    var root = el("div", "kk-editor" + (multiline ? " kk-editor--multi" : " kk-editor--single"));
    var field = multiline
      ? el("textarea", "kk-editor-input", { wrap: "off", rows: "1" })
      : el("input", "kk-editor-input", { type: "text" });
    field.setAttribute("aria-label", opts.label || "입력");
    field.setAttribute("autocomplete", "off");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("autocorrect", "off");
    field.setAttribute("spellcheck", "false");
    field.setAttribute("maxlength", String(maxLength));
    var view = el("div", "kk-editor-view", { "aria-hidden": "true" });
    var linesBox = el("div", "kk-editor-lines");
    var overlay = el("div", "kk-editor-overlay");
    var caret = el("span", "kk-caret");
    var placeholder = el("font-kku", "kk-editor-placeholder", { font: font, size: "var(--kk-editor-size)", "wrap-unit": "glyph" });
    placeholder.textContent = opts.placeholder || "";
    overlay.appendChild(caret);
    view.appendChild(placeholder);
    view.appendChild(linesBox);
    view.appendChild(overlay);
    root.appendChild(view);
    root.appendChild(field);
    mount.appendChild(root);

    var lines = [];       // [{ text, host }]
    var cache = {};       // 줄 번호 → 캐럿 자리 목록(그리기마다 비운다)
    var goalX = null;     // 위·아래 화살표의 목표 x
    var history = [];
    var historyIndex = -1;
    var lastRecord = 0;
    var subscribers = typeof opts.onChange === "function" ? [opts.onChange] : [];

    function makeLine(text) {
      var host = el("font-kku", "kk-line", { font: font, size: "var(--kk-editor-size)", "wrap-unit": multiline ? "glyph" : "line" });
      host.textContent = text;
      return { text: text, host: host };
    }

    /* 값이 바뀐 줄만 다시 그린다 */
    function syncLines(value) {
      var parts = multiline ? value.split("\n") : [value.replace(/\n/g, " ")];
      var i;
      for (i = 0; i < parts.length; i += 1) {
        if (i < lines.length) {
          if (lines[i].text !== parts[i]) {
            lines[i].text = parts[i];
            FontKku.refresh(lines[i].host, { text: parts[i] });
          }
        } else {
          var line = makeLine(parts[i]);
          lines.push(line);
          linesBox.appendChild(line.host);
        }
      }
      while (lines.length > parts.length) {
        var removed = lines.pop();
        removed.host.remove();
      }
      root.classList.toggle("is-empty", value.length === 0);
      cache = {};
    }

    function lineOf(index) {
      var start = 0;
      for (var i = 0; i < lines.length; i += 1) {
        var end = start + lines[i].text.length;
        if (index <= end) {
          return { index: i, start: start };
        }
        start = end + 1;
      }
      var last = lines.length - 1;
      return { index: last, start: start - lines[last].text.length - 1 };
    }

    function lineStart(lineIndex) {
      var start = 0;
      for (var i = 0; i < lineIndex; i += 1) {
        start += lines[i].text.length + 1;
      }
      return start;
    }

    /* 줄 하나의 글자·공백 단위 — 폰꾸 텍스트 모델과 그려진 노드를 같은 순서로 맞춘다 */
    function lineUnits(line) {
      var model = FontKku.createTextModel(line.text).lines[0];
      var lineNode = line.host.querySelector('[part="line"]');
      var nodes = lineNode ? Array.prototype.filter.call(lineNode.children, function (node) {
        var part = node.getAttribute("part");
        return part === "word" || part === "space";
      }) : [];
      var units = [];
      var offset = 0;
      (model ? model.children : []).forEach(function (child, index) {
        var node = nodes[index];
        if (child.type === "word") {
          var glyphs = node ? node.children : [];
          child.children.forEach(function (glyph, glyphIndex) {
            units.push({ start: offset, end: offset + glyph.source.length, node: glyphs[glyphIndex] || null });
            offset += glyph.source.length;
          });
        } else {
          units.push({ start: offset, end: offset + child.raw.length, node: node || null, count: child.raw.length, space: true });
          offset += child.raw.length;
        }
      });
      return units;
    }

    function viewRect() {
      return view.getBoundingClientRect();
    }

    /* 줄 하나의 캐럿 자리: 줄 안 오프셋 → { x, top, height } (편집면 기준 좌표) */
    function linePositions(lineIndex) {
      if (cache[lineIndex]) {
        return cache[lineIndex];
      }
      var line = lines[lineIndex];
      var base = viewRect();
      var dx = view.scrollLeft - base.left;
      var dy = view.scrollTop - base.top;
      var hostRect = line.host.getBoundingClientRect();
      var fontPx = parseFloat(getComputedStyle(line.host).fontSize) || 24;
      var unitHeight = fontPx * 1.2;
      var units = lineUnits(line);
      var out = [];
      var glyphTops = units.map(function (unit) {
        return unit.space || !unit.node ? null : unit.node.getBoundingClientRect().top + dy;
      });
      function nearestTop(index) {
        for (var back = index - 1; back >= 0; back -= 1) {
          if (glyphTops[back] !== null) return glyphTops[back];
        }
        for (var ahead = index + 1; ahead < glyphTops.length; ahead += 1) {
          if (glyphTops[ahead] !== null) return glyphTops[ahead];
        }
        return hostRect.top + dy;
      }
      if (!units.length) {
        out[0] = { x: hostRect.left + dx, top: hostRect.top + dy, height: unitHeight };
      }
      units.forEach(function (unit, index) {
        if (!unit.node) {
          return;
        }
        var rect = unit.node.getBoundingClientRect();
        if (unit.space) {
          var top = nearestTop(index);
          for (var j = 0; j < unit.count; j += 1) {
            out[unit.start + j] = { x: rect.left + dx + (rect.width * j) / unit.count, top: top, height: unitHeight, rect: rect };
          }
        } else {
          out[unit.start] = { x: rect.left + dx, top: rect.top + dy, height: rect.height };
        }
      });
      var last = units[units.length - 1];
      if (last && last.node) {
        var lastRect = last.node.getBoundingClientRect();
        out[line.text.length] = {
          x: lastRect.right + dx,
          top: last.space ? nearestTop(units.length - 1) : lastRect.top + dy,
          height: last.space ? unitHeight : lastRect.height
        };
      }
      cache[lineIndex] = { out: out, units: units, dx: dx, dy: dy };
      return cache[lineIndex];
    }

    function positionAt(index) {
      var where = lineOf(index);
      var data = linePositions(where.index);
      var offset = index - where.start;
      while (offset > 0 && !data.out[offset]) {
        offset -= 1;
      }
      return data.out[offset] || { x: 0, top: 0, height: 24 };
    }

    function unitRects(start, end, className) {
      var fragments = [];
      if (start >= end) {
        return fragments;
      }
      var first = lineOf(start).index;
      var last = lineOf(end).index;
      /* 노드 상자는 지금 재므로 편집면 기준 보정도 지금 값으로 — 캐시한 보정은 그 뒤
       * 페이지·편집면이 스크롤되면 어긋난다 */
      var now = viewRect();
      var dx = view.scrollLeft - now.left;
      var dy = view.scrollTop - now.top;
      for (var li = first; li <= last; li += 1) {
        var data = linePositions(li);
        var base = lineStart(li);
        data.units.forEach(function (unit) {
          var a = Math.max(start, base + unit.start);
          var b = Math.min(end, base + unit.end);
          if (a >= b || !unit.node) {
            return;
          }
          var rect = unit.node.getBoundingClientRect();
          var x = rect.left + dx;
          var width = rect.width;
          var top = rect.top + dy;
          var height = rect.height;
          if (unit.space) {
            var pos = data.out[a - base];
            x = rect.left + dx + (rect.width * (a - base - unit.start)) / unit.count;
            width = (rect.width * (b - a)) / unit.count;
            top = pos ? pos.top : top;
            height = pos ? pos.height : height;
          }
          var box = el("span", className);
          box.style.left = x + "px";
          box.style.top = top + "px";
          box.style.width = Math.max(2, width) + "px";
          box.style.height = height + "px";
          fragments.push(box);
        });
      }
      return fragments;
    }

    var composingState = null;

    function paintOverlay() {
      Array.prototype.forEach.call(overlay.querySelectorAll(".kk-sel, .kk-compose"), function (node) {
        node.remove();
      });
      var start = field.selectionStart || 0;
      var end = field.selectionEnd || 0;
      if (end > start) {
        unitRects(start, end, "kk-sel").forEach(function (node) {
          overlay.insertBefore(node, caret);
        });
      }
      if (composingState && composingState.end > composingState.start) {
        unitRects(composingState.start, composingState.end, "kk-compose").forEach(function (node) {
          overlay.insertBefore(node, caret);
        });
      }
      var focusIndex = field.selectionDirection === "backward" ? start : end;
      var pos = positionAt(focusIndex);
      caret.style.left = pos.x + "px";
      caret.style.top = pos.top + "px";
      caret.style.height = pos.height + "px";
      root.classList.toggle("is-composing", Boolean(composingState));
      /* 숨은 필드를 캐럿 자리에 둬 모바일 스크롤·후보 창이 캐럿을 따라오게 한다 */
      field.style.left = clamp(pos.x - view.scrollLeft, 0, Math.max(0, view.clientWidth - 2)) + "px";
      field.style.top = clamp(pos.top - view.scrollTop, 0, Math.max(0, view.clientHeight - 2)) + "px";
      if (!multiline) {
        var right = pos.x - view.scrollLeft;
        if (right > view.clientWidth - 24) {
          view.scrollLeft = pos.x - view.clientWidth + 48;
          cache = {};
        } else if (right < 0) {
          view.scrollLeft = Math.max(0, pos.x - 24);
          cache = {};
        }
      }
      caret.style.animation = "none";
      void caret.offsetWidth;
      caret.style.animation = "";
    }

    function keepCaretVisible() {
      if (!multiline || document.activeElement !== field) {
        return;
      }
      var rect = caret.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8 || rect.top < 72) {
        caret.scrollIntoView({ block: "nearest" });
      }
    }

    function record(reason) {
      var now = Date.now();
      var snapshot = { value: field.value, start: field.selectionStart, end: field.selectionEnd };
      var top = history[historyIndex];
      if (top && top.value === snapshot.value) {
        top.start = snapshot.start;
        top.end = snapshot.end;
        return;
      }
      history = history.slice(0, historyIndex + 1);
      /* 이어 치는 글은 한 단계로 묶는다(공백·줄바꿈에서 끊는다) */
      var typing = reason === "input" && top && now - lastRecord < 900 &&
        !/[\s]$/.test(top.value) && Math.abs(snapshot.value.length - top.value.length) <= 2;
      if (typing && historyIndex > 0) {
        history[historyIndex] = snapshot;
      } else {
        history.push(snapshot);
        if (history.length > 200) {
          history.shift();
        }
        historyIndex = history.length - 1;
      }
      lastRecord = now;
    }

    function clean(value) {
      var normalized = value.normalize ? value.normalize("NFC") : value;
      if (!multiline) {
        normalized = normalized.replace(/[\r\n]+/g, " ");
      }
      if (normalized.length > maxLength) {
        /* 서로게이트 쌍을 반으로 자르지 않는다 */
        normalized = Array.from(normalized).reduce(function (out, ch) {
          return out.length + ch.length <= maxLength ? out + ch : out;
        }, "");
      }
      return normalized;
    }

    function normalizeField() {
      var value = field.value;
      var normalized = clean(value);
      if (normalized !== value) {
        var caretAt = (value.slice(0, field.selectionEnd || 0).normalize("NFC")).length;
        field.value = normalized;
        field.setSelectionRange(Math.min(caretAt, normalized.length), Math.min(caretAt, normalized.length));
      }
    }

    var lastValue = null;

    function update(state, reason) {
      if (reason === "input" && !(state && state.composing)) {
        normalizeField();
      }
      composingState = state && state.composing ? state.composing : null;
      var value = field.value;
      if (value !== lastValue) {
        syncLines(value);
        lastValue = value;
        record(reason);
      }
      paintOverlay();
      if (reason === "input") {
        keepCaretVisible();
      }
      var state = ime.state();
      subscribers.forEach(function (fn) {
        fn(value, state, reason);
      });
    }

    var ime = Ime.attach(field, {
      layout: opts.layout || "dubeol",
      onChange: function (state, reason) {
        if (reason !== "select" && reason !== "focus" && reason !== "blur") {
          goalX = null;
        }
        update(state, reason);
        root.classList.toggle("is-focused", document.activeElement === field);
      }
    });
    root.setAttribute("data-mode", ime.getMode());

    function setSelection(start, end, direction) {
      field.setSelectionRange(start, end, direction || "none");
      update(ime.state(), "select");
    }

    /* 위·아래·Home·End는 폰꾸가 그린 줄(감싼 줄 포함) 기준으로 옮긴다 */
    function verticalTarget(index, dir) {
      var pos = positionAt(index);
      var x = goalX === null ? pos.x : goalX;
      goalX = x;
      var where = lineOf(index);
      var candidates = [];
      function collect(lineIndex, filter) {
        var data = linePositions(lineIndex);
        var base = lineStart(lineIndex);
        data.out.forEach(function (p, offset) {
          if (p && filter(p)) {
            candidates.push({ index: base + offset, p: p });
          }
        });
      }
      collect(where.index, function (p) {
        return dir < 0 ? p.top < pos.top - 2 : p.top > pos.top + 2;
      });
      if (!candidates.length) {
        var next = where.index + dir;
        if (next < 0) {
          return 0;
        }
        if (next >= lines.length) {
          return field.value.length;
        }
        collect(next, function () { return true; });
      }
      if (!candidates.length) {
        return index;
      }
      var rowTop = candidates.reduce(function (best, c) {
        return dir < 0 ? Math.max(best, c.p.top) : Math.min(best, c.p.top);
      }, dir < 0 ? -Infinity : Infinity);
      var row = candidates.filter(function (c) { return Math.abs(c.p.top - rowTop) < 2; });
      row.sort(function (a, b) { return Math.abs(a.p.x - x) - Math.abs(b.p.x - x); });
      return row[0].index;
    }

    function rowEdge(index, toEnd) {
      var pos = positionAt(index);
      var where = lineOf(index);
      var data = linePositions(where.index);
      var best = null;
      data.out.forEach(function (p, offset) {
        if (p && Math.abs(p.top - pos.top) < 2) {
          if (best === null || (toEnd ? offset > best : offset < best)) {
            best = offset;
          }
        }
      });
      return where.start + (best === null ? 0 : best);
    }

    function moveTo(target, extend) {
      var start = field.selectionStart;
      var end = field.selectionEnd;
      if (!extend) {
        setSelection(target, target);
        return;
      }
      var anchor = field.selectionDirection === "backward" ? end : start;
      if (start === end) {
        anchor = start;
      }
      if (target < anchor) {
        setSelection(target, anchor, "backward");
      } else {
        setSelection(anchor, target, "forward");
      }
    }

    function applySnapshot(snapshot) {
      /* 되돌린 자리에서 다시 치면 새 단계로 쌓는다(되돌린 상태를 덮어쓰지 않게) */
      lastRecord = 0;
      ime.commit();
      field.value = snapshot.value;
      field.setSelectionRange(snapshot.end, snapshot.end);
      lastValue = null;
      update(ime.state(), "history");
    }

    field.addEventListener("keydown", function (event) {
      var mod = event.metaKey || event.ctrlKey;
      if (mod && !event.altKey && (event.key === "z" || event.key === "Z" || event.code === "KeyZ")) {
        event.preventDefault();
        if (event.shiftKey) {
          if (historyIndex < history.length - 1) {
            historyIndex += 1;
            applySnapshot(history[historyIndex]);
          }
        } else if (historyIndex > 0) {
          historyIndex -= 1;
          applySnapshot(history[historyIndex]);
        }
        return;
      }
      if (mod && event.code === "KeyY") {
        event.preventDefault();
        if (historyIndex < history.length - 1) {
          historyIndex += 1;
          applySnapshot(history[historyIndex]);
        }
        return;
      }
      if (event.altKey || mod) {
        return;
      }
      var focus = field.selectionDirection === "backward" ? field.selectionStart : field.selectionEnd;
      if (multiline && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
        var keepGoal = goalX;
        moveTo(verticalTarget(focus, event.key === "ArrowUp" ? -1 : 1), event.shiftKey);
        goalX = keepGoal === null ? goalX : keepGoal;
        return;
      }
      if (multiline && (event.key === "Home" || event.key === "End")) {
        event.preventDefault();
        moveTo(rowEdge(focus, event.key === "End"), event.shiftKey);
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        goalX = null;
      }
    });

    /* 편집면을 누르면 그 자리로 캐럿을 옮기고, 끌면 선택한다 */
    function indexAtPoint(clientX, clientY) {
      var base = viewRect();
      var x = clientX - base.left + view.scrollLeft;
      var y = clientY - base.top + view.scrollTop;
      var best = null;
      lines.forEach(function (line, lineIndex) {
        var rect = line.host.getBoundingClientRect();
        var top = rect.top - base.top + view.scrollTop;
        var bottom = top + rect.height;
        var distance = y < top ? top - y : y > bottom ? y - bottom : 0;
        if (best && distance > best.distance) {
          return;
        }
        var data = linePositions(lineIndex);
        var start = lineStart(lineIndex);
        data.out.forEach(function (p, offset) {
          if (!p) return;
          var dyRow = y < p.top ? p.top - y : y > p.top + p.height ? y - p.top - p.height : 0;
          var score = dyRow * 1000 + Math.abs(p.x - x);
          if (!best || distance < best.distance || (distance === best.distance && score < best.score)) {
            best = { index: start + offset, score: score, distance: distance };
          }
        });
      });
      return best ? best.index : field.value.length;
    }

    var dragAnchor = null;
    view.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      ime.commit();
      var index = indexAtPoint(event.clientX, event.clientY);
      field.focus({ preventScroll: true });
      if (event.shiftKey) {
        moveTo(index, true);
      } else {
        setSelection(index, index);
      }
      dragAnchor = event.shiftKey ? null : index;
      if (view.setPointerCapture) {
        try { view.setPointerCapture(event.pointerId); } catch (error) { /* 무시 */ }
      }
    });
    view.addEventListener("pointermove", function (event) {
      if (dragAnchor === null || !(event.buttons & 1)) {
        return;
      }
      var index = indexAtPoint(event.clientX, event.clientY);
      if (index < dragAnchor) {
        setSelection(index, dragAnchor, "backward");
      } else {
        setSelection(dragAnchor, index, "forward");
      }
    });
    view.addEventListener("pointerup", function () {
      dragAnchor = null;
    });

    /* 글꼴 CSS가 늦게 오거나 크기가 바뀌면 좌표를 다시 잰다 */
    var relayoutQueued = false;
    function relayout() {
      if (relayoutQueued) {
        return;
      }
      relayoutQueued = true;
      requestAnimationFrame(function () {
        relayoutQueued = false;
        cache = {};
        paintOverlay();
      });
    }
    view.addEventListener("font-kku:render", function (event) {
      /* 편집으로 다시 그린 줄(refresh)은 update()가 바로 잰다 */
      if (!event.detail || event.detail.reason !== "refresh") {
        relayout();
      }
    });
    window.addEventListener("resize", relayout);
    if (window.ResizeObserver) {
      new ResizeObserver(relayout).observe(view);
    }
    field.addEventListener("focus", function () {
      root.classList.add("is-focused");
    });
    field.addEventListener("blur", function () {
      root.classList.remove("is-focused");
    });

    function setValue(value) {
      ime.commit();
      lastRecord = 0;
      field.value = clean(String(value == null ? "" : value));
      field.setSelectionRange(field.value.length, field.value.length);
      lastValue = null;
      history = [];
      historyIndex = -1;
      update(ime.state(), "set");
    }

    function setFont(next) {
      font = next;
      placeholder.setAttribute("font", next);
      lines.forEach(function (line) {
        line.host.setAttribute("font", next);
      });
      root.setAttribute("data-font", next);
      relayout();
    }

    setValue(opts.value || "");
    root.setAttribute("data-font", font);

    return {
      root: root,
      field: field,
      view: view,
      ime: ime,
      getValue: function () {
        return field.value;
      },
      setValue: setValue,
      setFont: setFont,
      getFont: function () {
        return font;
      },
      relayout: relayout,
      /* (value, state, reason) — reason: input · select · mode · layout · set · history … */
      subscribe: function (fn) {
        subscribers.push(fn);
      },
      focus: function () {
        field.focus({ preventScroll: true });
        update(ime.state(), "select");
      },
      lines: function () {
        return lines.map(function (line) { return line.host; });
      }
    };
  }

  // ── 화면 자판 ────────────────────────────────────────────

  /* options: editor(createEditor 결과), font(자판 글자 글꼴), onAction(name) */
  function createKeyboard(mount, options) {
    var opts = options || {};
    var editor = opts.editor;
    var ime = editor.ime;
    var font = opts.font || "sprite-system";
    var shiftLatched = false;
    var shiftHeld = false;

    ensureTint("kk-tint-cho", ROLE_COLORS.cho);
    ensureTint("kk-tint-jung", ROLE_COLORS.jung);
    ensureTint("kk-tint-jong", ROLE_COLORS.jong);

    var board = el("div", "kk-keys", { role: "group" });
    board.setAttribute("aria-label", noFont.active ? "On-screen keyboard" : "화면 자판");
    mount.appendChild(board);

    function keyFace(value) {
      if (!value || !value.role) {
        var plain = el("span", "kk-key-sym");
        plain.textContent = value ? value.value : "";
        return plain;
      }
      var host = el("font-kku", "kk-key-glyph", { font: font, size: "var(--kk-key-size)" });
      host.textContent = value.compat;
      return host;
    }

    function render() {
      var layout = ime.getLayout();
      var shifted = shiftLatched || shiftHeld;
      board.innerHTML = "";
      board.setAttribute("data-layout", layout);
      board.setAttribute("data-mode", ime.getMode());
      board.classList.toggle("is-shifted", shifted);
      Ime.keyMap(layout).forEach(function (row, rowIndex) {
        var rowNode = el("div", "kk-keys-row kk-keys-row--" + rowIndex);
        row.forEach(function (cap) {
          var value = shifted ? cap.shift : cap.plain;
          var latin = shifted ? cap.shiftKey : cap.key;
          var button = el("button", "kk-key", {
            type: "button",
            "data-key": latin,
            "data-code": cap.code,
            "data-role": value.role || "sym",
            "aria-label": (value.role ? value.compat + " " : "") + "(" + latin + ")"
          });
          button.appendChild(keyFace(value));
          var tag = el("span", "kk-key-latin");
          tag.textContent = latin;
          button.appendChild(tag);
          rowNode.appendChild(button);
        });
        board.appendChild(rowNode);
      });
      var mods = el("div", "kk-keys-row kk-keys-row--mods");
      [
        ["shift", "⇧", "Shift"],
        ["toggle", ime.getMode() === "hangul" ? "한" : "EN", noFont.active ? "Korean / English" : "한/영"],
        ["space", "", "Space"],
        ["backspace", "⌫", "Backspace"]
      ].concat(opts.enter === false ? [] : [["enter", "⏎", "Enter"]]).forEach(function (spec) {
        var button = el("button", "kk-key kk-key--" + spec[0], { type: "button", "data-action": spec[0], "aria-label": spec[2] });
        if (spec[0] === "toggle" && ime.getMode() === "hangul") {
          var face = el("font-kku", "kk-key-glyph", { font: font, size: "var(--kk-key-size)" });
          face.textContent = "한";
          button.appendChild(face);
          var en = el("span", "kk-key-latin");
          en.textContent = "EN";
          button.appendChild(en);
        } else {
          button.appendChild(document.createTextNode(spec[1] || spec[2]));
        }
        if (spec[0] === "shift") {
          button.setAttribute("aria-pressed", String(shifted));
        }
        mods.appendChild(button);
      });
      board.appendChild(mods);
    }

    /* 포인터로 누를 때 숨은 필드의 초점을 뺏지 않는다(모바일 기기 키보드가 뜨지 않게) */
    function keepFocus(event) {
      if (event.target.closest(".kk-key")) {
        event.preventDefault();
      }
    }
    board.addEventListener("pointerdown", keepFocus);
    board.addEventListener("mousedown", keepFocus);
    board.addEventListener("click", function (event) {
      var button = event.target.closest(".kk-key");
      if (!button) {
        return;
      }
      var action = button.getAttribute("data-action");
      /* 키는 편집면에 초점을 두고 넣는다 — 캐럿이 보이고, 초점 잃은 입력 칸의 선택 영역이
       * 문서 선택에 끌려 처음으로 돌아가는 일(Chrome)이 없다. 터치 기기는 화면 자판을 켜는
       * 동안 inputmode="none"이라 기기 키보드가 뜨지 않는다. */
      if (document.activeElement !== editor.field) {
        editor.focus();
      }
      if (action === "shift") {
        shiftLatched = !shiftLatched;
        render();
        return;
      }
      if (action === "toggle") {
        ime.toggleMode();
      } else if (action === "space") {
        ime.feed(" ");
      } else if (action === "backspace") {
        ime.backspace();
      } else if (action === "enter") {
        ime.feed("\n");
      } else {
        var key = button.getAttribute("data-key");
        ime.feed(key);
        if (shiftLatched) {
          shiftLatched = false;
          render();
        }
      }
      if (typeof opts.onAction === "function") {
        opts.onAction(action || "key");
      }
    });

    /* 실제 키보드를 누르면 같은 자리 키를 눌린 모양으로 */
    function highlight(event, down) {
      if (event.key === "Shift") {
        if (shiftHeld !== down) {
          shiftHeld = down;
          render();
        }
        return;
      }
      var button = event.code ? board.querySelector('[data-code="' + event.code + '"]') : null;
      if (button) {
        button.classList.toggle("is-down", down);
      }
    }
    editor.field.addEventListener("keydown", function (event) {
      highlight(event, true);
    });
    editor.field.addEventListener("keyup", function (event) {
      highlight(event, false);
    });
    editor.field.addEventListener("blur", function () {
      if (shiftHeld) {
        shiftHeld = false;
        render();
      }
    });

    editor.subscribe(function (value, state, reason) {
      if (reason === "mode" || reason === "layout") {
        render();
      }
    });

    render();
    return {
      root: board,
      render: render,
      setFont: function (next) {
        font = next;
        render();
      }
    };
  }

  function layoutLabel(id) {
    var label = LAYOUT_LABELS[id] || { ko: id, en: id };
    return noFont.active ? label.en : label.ko;
  }

  /* 한/영 단추([data-ime-toggle] 안의 [data-ime-badge]·[data-ime-mode-label])와 배열 칩
   * ([data-layouts])을 편집면 입력기에 잇는다. onLayout(id)은 배열이 바뀔 때. */
  function bindImeControls(editor, scope, onLayout) {
    var root = scope || document;
    var button = root.querySelector("[data-ime-toggle]");
    var badge = root.querySelector("[data-ime-badge]");
    var label = root.querySelector("[data-ime-mode-label]");
    var chips = root.querySelector("[data-layouts]");
    var ime = editor.ime;

    Ime.layouts.forEach(function (layout) {
      var chip = el("button", "", { type: "button", "data-layout": layout.id });
      chip.textContent = layoutLabel(layout.id);
      chips.appendChild(chip);
    });

    function render() {
      var mode = ime.getMode();
      button.setAttribute("data-mode", mode);
      button.setAttribute("aria-pressed", String(mode === "hangul"));
      badge.innerHTML = "";
      if (mode === "hangul") {
        var face = el("font-kku", "", { font: "sprite-system", size: "17" });
        face.textContent = "한";
        badge.appendChild(face);
      } else {
        badge.textContent = "EN";
      }
      label.textContent = mode === "hangul" ? (noFont.active ? "Korean" : "한글") : (noFont.active ? "English" : "영문");
      Array.prototype.forEach.call(chips.querySelectorAll("[data-layout]"), function (chip) {
        chip.setAttribute("aria-pressed", String(chip.getAttribute("data-layout") === ime.getLayout()));
      });
    }

    chips.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-layout]");
      if (chip) {
        ime.setLayout(chip.getAttribute("data-layout"));
      }
    });
    button.addEventListener("click", function () {
      ime.toggleMode();
    });
    editor.subscribe(function (value, state, reason) {
      if (reason === "mode" || reason === "layout") {
        render();
        if (reason === "layout" && typeof onLayout === "function") {
          onLayout(ime.getLayout());
        }
      }
    });
    render();
    return render;
  }

  window.FontKkuApps = {
    noFont: noFont,
    applyNoFont: applyNoFont,
    ensureTint: ensureTint,
    createEditor: createEditor,
    createKeyboard: createKeyboard,
    bindImeControls: bindImeControls,
    layoutLabel: layoutLabel,
    layoutLabels: LAYOUT_LABELS,
    roleColors: ROLE_COLORS
  };
})();
