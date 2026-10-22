/* font-kku-fx — 폰꾸 상호작용 확장 (ADR-017, 상호작용 축).
 *
 * 입력에 반응하는 움직임 넷을 JS로 단다. 폰꾸 런타임(font-kku.js) 뒤에 붙인다 —
 * 한 줄 설치 `data-addons="fx"`가 런타임 옆의 이 파일을 차례대로 실행한다.
 *
 *   type     두벌식 타자 — 자모 단위로 지웠다 다시 쓴다(ㅎ → 하 → 한). 앞부분이 같으면 남긴다
 *   scatter  흩어졌다 모이기 — 올리거나(마우스) 누르면(터치·Enter·Space) 자모가 역할 쪽으로
 *            흩어졌다가 떼면 제자리로 돌아온다
 *   magnet   커서 자석 — 커서에 가까운 자모만 밀려난다
 *   shuffle  씨앗 섞기 — 누르거나(click) 올리거나(hover) 일정 간격(every)마다 seed를 새로 뽑아
 *            다시 그린다. jamo-seeds가 없으면 켠다(씨앗 반응 글꼴·kku-vary-* 꾸밈이 매번 달라진다)
 *
 * 두 가지로 쓴다.
 *   선언   <font-kku font="sebul" data-kku-fx="magnet shuffle">…</font-kku>
 *          type은 data-kku-phrases="문장|문장"(없으면 지금 글을 한 번 쳐 넣는다)과
 *          data-kku-caret="클래스", scatter는 data-kku-scatter="hover|click",
 *          shuffle은 data-kku-shuffle="click | hover | 2000(ms 간격)"(여럿은 공백으로)
 *          로 고른다. 문서가 준비되면 한 번, 그 뒤로는 런타임이 처음 그린 바탕 요소마다
 *          (font-kku:render 이벤트) 저절로 붙는다. 끄려면 이 파일보다 먼저
 *          globalThis.FontKkuFxConfig = { autoBind: false }.
 *   JS     FontKkuFx.type(host, ["문장", …], options) 등 — 모두 stop()이 있는 조종기를 돌려준다.
 *
 * 공통 규칙
 * - 바탕 요소의 조상(또는 자신)에 data-kku-paused가 있거나 탭이 가려졌거나(타자는) 화면 밖이면
 *   다음 걸음을 미룬다. 사용자가 움직임 줄이기를 켜면 타자는 문장을 바로 보이고, 자석·간격
 *   섞기는 쉬고, 흩어지기는 옮기지 않는다(누르는 섞기는 그대로 — 사용자가 고른 변화다).
 * - 자모를 옮길 때는 코어가 쓰는 transform을 건드리지 않고 개별 속성 translate·rotate를
 *   인라인으로 준다. 바탕 요소가 다시 그려지면 자모 노드가 새로 생기므로 다시 잰다.
 * - 순수 함수 typingFrames·transitionFrames는 DOM 없이 Node에서도 돈다. 불러올 때 DOM에
 *   손대지 않는다. */
(function (global) {
  "use strict";

  // ── 두벌식 타자 프레임 (순수 함수) ────────────────────────

  var SYLLABLE_BASE = 0xac00;
  var SYLLABLE_LAST = 11171;
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  /* 합자 모음은 앞 모음부터(ㅘㅙㅚ ← ㅗ, ㅝㅞㅟ ← ㅜ, ㅢ ← ㅡ), 겹받침은 앞 자음부터 친다. */
  var VOWEL_FIRST = { 9: 8, 10: 8, 11: 8, 14: 13, 15: 13, 16: 13, 19: 18 };
  var CODA_FIRST = { 3: 1, 5: 4, 6: 4, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 8, 18: 17 };

  function syllable(l, v, t) {
    return String.fromCharCode(SYLLABLE_BASE + (l * 21 + v) * 28 + t);
  }

  /* 한 글자를 칠 때 화면에 차례로 보이는 모양. 한글 음절이 아니면 그 글자 하나. */
  function keySteps(ch) {
    var code = ch.charCodeAt(0) - SYLLABLE_BASE;
    if (ch.length !== 1 || code < 0 || code > SYLLABLE_LAST) {
      return [ch];
    }
    var l = Math.floor(code / 588);
    var v = Math.floor(code / 28) % 21;
    var t = code % 28;
    var steps = [CHO.charAt(l)];
    if (VOWEL_FIRST[v] !== undefined) {
      steps.push(syllable(l, VOWEL_FIRST[v], 0));
    }
    steps.push(syllable(l, v, 0));
    if (CODA_FIRST[t] !== undefined) {
      steps.push(syllable(l, v, CODA_FIRST[t]));
    }
    if (t) {
      steps.push(ch);
    }
    return steps;
  }

  /* 빈 화면에서 text를 끝까지 치는 동안의 화면들. 마지막 화면이 text다. */
  function typingFrames(text) {
    /* 코드 포인트 단위 — 그림 문자(서로게이트 쌍)를 반으로 쪼개 깨진 글자가 비치지 않게 */
    var chars = Array.from(String(text));
    var frames = [];
    for (var i = 0; i < chars.length; i += 1) {
      var head = chars.slice(0, i).join("");
      keySteps(chars[i]).forEach(function (step) {
        frames.push(head + step);
      });
    }
    return frames;
  }

  function codePoints(text) {
    return Array.from(text).length;
  }

  /* from에서 to로: 같은 앞부분(keep 글자)은 남기고 그 뒤를 자모 단위로 거꾸로 지운 다음
   * to의 나머지를 친다. erase의 마지막은 from.slice(0, keep), write의 마지막은 to. */
  function transitionFrames(from, to) {
    var a = Array.from(String(from));
    var b = Array.from(String(to));
    var keep = 0;
    while (keep < a.length && keep < b.length && a[keep] === b[keep]) {
      keep += 1;
    }
    var erase = typingFrames(a.join("")).filter(function (frame) {
      return codePoints(frame) > keep;
    }).reverse().slice(1);
    if (a.length > keep) {
      erase.push(a.slice(0, keep).join(""));
    }
    var write = typingFrames(b.join("")).filter(function (frame) {
      return codePoints(frame) > keep;
    });
    return { keep: keep, erase: erase, write: write };
  }

  function defaultTypeDelay(frame) {
    var last = frame.charAt(frame.length - 1);
    if (last === "\n") {
      return 360;
    }
    if (last === "," || last === ".") {
      return 260;
    }
    if (last === " ") {
      return 110;
    }
    return 65 + Math.random() * 70;
  }

  // ── DOM 도움 ──────────────────────────────────────────────

  var RENDER_EVENT = "font-kku:render";
  var PAUSE_SELECTOR = "[data-kku-paused]";

  function runtime() {
    return global.FontKku || null;
  }

  function toHosts(target) {
    if (!target) {
      return [];
    }
    if (typeof target.length === "number" && typeof target.getAttribute !== "function") {
      return Array.prototype.slice.call(target).filter(Boolean);
    }
    return [target];
  }

  function requireHosts(target, name) {
    var hosts = toHosts(target);
    if (!hosts.length || hosts.some(function (host) { return typeof host.getAttribute !== "function"; })) {
      throw new TypeError("FontKkuFx." + name + ": needs a font-kku host element (or a list of them)");
    }
    return hosts;
  }

  function prefersReducedMotion() {
    return Boolean(global.matchMedia) && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function documentHidden() {
    return Boolean(global.document && global.document.hidden);
  }

  function pausedBy(host) {
    return typeof host.closest === "function" && Boolean(host.closest(PAUSE_SELECTOR));
  }

  /* 사용자 정의 요소는 속성 이름 그대로, 꾸밈 클래스(.font-kku)는 data- 이름을 쓴다. */
  function optionAttr(host, name) {
    return String(host.localName || host.tagName || "").toLowerCase() === "font-kku" ? name : "data-" + name;
  }

  function isUpgraded(host) {
    return host.getAttribute("data-fy-upgraded") === "true";
  }

  function readText(host) {
    if (isUpgraded(host) && typeof host.querySelector === "function") {
      var source = host.querySelector('[part="sr-source"]');
      if (source) {
        return source.textContent;
      }
    }
    return String(host.textContent || "").trim();
  }

  function setText(host, text) {
    var FontKku = runtime();
    if (FontKku && typeof FontKku.refresh === "function" && isUpgraded(host)) {
      FontKku.refresh(host, { text: text });
    } else {
      host.textContent = text;
    }
  }

  function jamoNodes(host) {
    return typeof host.querySelectorAll === "function"
      ? Array.prototype.slice.call(host.querySelectorAll('[part~="jamo"]'))
      : [];
  }

  function partTokens(node) {
    return String(node.getAttribute("part") || "").split(/\s+/);
  }

  /* 자모의 역할 단계: 초성·완성형 head 0, 중성 1, 받침 2. */
  function roleStep(node) {
    var parts = partTokens(node);
    if (parts.indexOf("jongseong") !== -1) {
      return 2;
    }
    if (parts.indexOf("jungseong") !== -1) {
      return 1;
    }
    return 0;
  }

  function glyphIndexOf(node) {
    var value = node.style && typeof node.style.getPropertyValue === "function"
      ? node.style.getPropertyValue("--fy-glyph-index") : "";
    var cursor = node;
    while (!value && cursor && cursor.parentNode) {
      cursor = cursor.parentNode;
      if (cursor.getAttribute && cursor.getAttribute("data-glyph-index") !== null) {
        value = cursor.getAttribute("data-glyph-index");
      }
    }
    var index = parseInt(value, 10);
    return isNaN(index) ? 0 : index;
  }

  /* 자모의 씨앗값(0–1): jamo-seeds가 켜져 있으면 런타임이 준 값, 아니면 순번에서 정한 값. */
  function jamoSeed(node, order) {
    var value = node.style && typeof node.style.getPropertyValue === "function"
      ? parseFloat(node.style.getPropertyValue("--fy-jamo-seed")) : NaN;
    if (!isNaN(value)) {
      return value;
    }
    var x = Math.sin((order + 1) * 12.9898 + roleStep(node) * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  /* 한 자모의 같은 속성을 여러 controller가 빌려 쓴다. 자석 > 흩어짐,
   * 같은 효과는 나중에 만든 controller가 우선한다. 반환할 때 다른 소유자의 값을
   * 드러내고 마지막 반환만 작성자의 원래 값과 !important를 복원한다. */
  var MOTIONS = new WeakMap();
  var motionOrder = 0;
  var MOTION_PROPERTIES = ["translate", "rotate", "animation-name"];
  var TRANSITION_PROPERTIES = ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"];

  function motionOwner(priority) {
    return { priority: priority, order: ++motionOrder, nodes: new Set() };
  }

  function ownStyles(owner, node, values) {
    var state = MOTIONS.get(node);
    if (!state && !values) { return; }
    if (!state) {
      state = { owners: new Map(), original: new Map() };
      MOTIONS.set(node, state);
    }
    if (values) {
      state.owners.set(owner, values);
      owner.nodes.add(node);
      Object.keys(values).forEach(function (name) {
        if (!state.original.has(name)) {
          state.original.set(name, {
            value: node.style.getPropertyValue(name),
            priority: node.style.getPropertyPriority(name)
          });
        }
      });
    } else {
      state.owners.delete(owner);
      owner.nodes.delete(node);
    }
    state.original.forEach(function (original, name) {
      var winner = null;
      var value;
      state.owners.forEach(function (props, candidate) {
        if (Object.prototype.hasOwnProperty.call(props, name) && (!winner ||
            candidate.priority > winner.priority ||
            (candidate.priority === winner.priority && candidate.order > winner.order))) {
          winner = candidate;
          value = props[name];
        }
      });
      if (winner) {
        node.style.setProperty(name, value, original.priority);
      } else {
        if (original.value) {
          node.style.setProperty(name, original.value, original.priority);
        } else {
          node.style.removeProperty(name);
        }
        state.original.delete(name);
      }
    });
    if (!state.owners.size) { MOTIONS.delete(node); }
  }

  function releaseMotion(owner) {
    owner.nodes.forEach(function (node) { ownStyles(owner, node, null); });
  }

  function setMotion(owner, node, translate, rotate, transition) {
    var values = {};
    if (translate || rotate) {
      MOTION_PROPERTIES.forEach(function (name, index) {
        values[name] = [translate, rotate, "none"][index];
      });
    }
    if (transition) {
      TRANSITION_PROPERTIES.forEach(function (name, index) { values[name] = transition[index]; });
    }
    ownStyles(owner, node, Object.keys(values).length ? values : null);
  }

  /* 여러 상호작용이 공유하는 포커스 진입점은 마지막 controller가 반환한다. */
  var NATIVELY_FOCUSABLE = /^(a|button|input|select|textarea|summary)$/i;
  var FOCUS_OWNERS = new WeakMap();
  function ensureFocusable(host, added) {
    var count = FOCUS_OWNERS.get(host);
    if (count) {
      FOCUS_OWNERS.set(host, count + 1);
      added.push(host);
    } else if (host.getAttribute("tabindex") === null &&
        !NATIVELY_FOCUSABLE.test(host.localName || host.tagName || "")) {
      host.setAttribute("tabindex", "0");
      FOCUS_OWNERS.set(host, 1);
      added.push(host);
    }
  }
  function releaseFocusable(added) {
    added.splice(0).forEach(function (host) {
      var count = FOCUS_OWNERS.get(host) - 1;
      if (count) {
        FOCUS_OWNERS.set(host, count);
      } else {
        FOCUS_OWNERS.delete(host);
        if (host.getAttribute("tabindex") === "0") { host.removeAttribute("tabindex"); }
      }
    });
  }

  var OPEN_OWNERS = new WeakMap();
  function scatterClass(host, owner, open) {
    var state = OPEN_OWNERS.get(host);
    if (!state && !open) { return; }
    if (!state) {
      state = { owners: new Set(), original: host.classList.contains("kku-fx-open") };
      OPEN_OWNERS.set(host, state);
    }
    if (open) { state.owners.add(owner); } else { state.owners.delete(owner); }
    toggleClass(host, "kku-fx-open", state.original || state.owners.size > 0);
    if (!state.owners.size) { OPEN_OWNERS.delete(host); }
  }

  function listen(list, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    list.push([target, type, handler, options]);
  }

  function unlistenAll(list) {
    list.splice(0).forEach(function (entry) {
      entry[0].removeEventListener(entry[1], entry[2], entry[3]);
    });
  }

  function toggleClass(host, name, on) {
    if (!name || !host.classList) {
      return;
    }
    if (on) {
      host.classList.add(name);
    } else {
      host.classList.remove(name);
    }
  }

  /* 미뤄도 되는 타이머: 불렀을 때 blocked()면 잠깐 뒤에 다시 본다. hosts가 모두 문서에서 빠지면
   * 멈춘다 — 지운 바탕 요소에 타자·섞기가 계속 돌지 않게. */
  function scheduler(blocked, hosts) {
    var timers = [];
    var stopped = false;
    function detached() {
      return Boolean(hosts && hosts.length) && hosts.every(function (host) { return host.isConnected === false; });
    }
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.splice(timers.indexOf(id), 1);
        if (stopped) {
          return;
        }
        if (detached()) {
          later.stop();
          return;
        }
        if (blocked()) {
          later(fn, 300);
          return;
        }
        fn();
      }, ms);
      timers.push(id);
    }
    later.stop = function () {
      stopped = true;
      timers.splice(0).forEach(clearTimeout);
    };
    return later;
  }

  // ── type ──────────────────────────────────────────────────

  /* 한 번 도는 움직임 — 타자는 글을 바꿀 때마다 다시 그리므로 이것들은 매 걸음 다시 날아온다.
   * 계속 도는 움직임(물결·깜빡임 …)은 그대로 둔다. */
  var ONE_SHOT_MOTIONS = ["rise", "fade", "stagger", "assemble", "drop", "draw"];

  /* hosts가 둘 이상이면 문장의 "\n"이 줄을 나눠 바탕 요소마다 한 줄씩 쓴다. */
  function type(target, phrases, options) {
    var hosts = requireHosts(target, "type");
    var list = (Array.isArray(phrases) ? phrases : [phrases]).map(function (phrase) {
      return String(phrase === undefined || phrase === null ? "" : phrase);
    });
    if (!list.length) {
      throw new TypeError("FontKkuFx.type: needs at least one phrase");
    }
    var opts = options || {};
    var caret = opts.caret || "";
    var typeDelay = typeof opts.typeDelay === "function" ? opts.typeDelay : defaultTypeDelay;
    var eraseDelay = opts.eraseDelay === undefined ? 26 : opts.eraseDelay;
    var hold = opts.hold === undefined ? 2200 : opts.hold;
    var firstHold = opts.firstHold === undefined ? 2400 : opts.firstHold;
    var caretLead = Math.min(opts.caretLead || 0, firstHold);
    var gap = opts.gap === undefined ? 380 : opts.gap;
    var loop = opts.loop === undefined ? list.length > 1 : Boolean(opts.loop);
    var intro = opts.intro === undefined ? list.length === 1 : Boolean(opts.intro);
    var shuffleOrder = opts.order === "shuffle";
    var index = opts.start === "random"
      ? Math.floor(Math.random() * list.length)
      : Math.max(0, Math.min(list.length - 1, parseInt(opts.start, 10) || 0));
    var shown = hosts.map(readText);
    var queue = [];
    var inView = true;
    var observer = null;
    var later = scheduler(function () {
      return documentHidden() || !inView ||
        hosts.some(pausedBy) || (typeof opts.paused === "function" && Boolean(opts.paused()));
    }, hosts);
    var started = false;

    function paint(frame) {
      var parts = hosts.length > 1 ? frame.split("\n") : [frame];
      hosts.forEach(function (host, i) {
        var text = parts[i] || "";
        if (text !== shown[i]) {
          shown[i] = text;
          setText(host, text);
        }
      });
      if (started) {
        var last = Math.min(parts.length, hosts.length) - 1;
        hosts.forEach(function (host, i) {
          toggleClass(host, caret, i === last);
        });
      }
    }

    function announce() {
      if (typeof opts.onPhrase === "function") {
        opts.onPhrase(index, list[index]);
      }
    }

    /* 한 번 도는 움직임은 다시 그릴 때마다 다시 날아온다 — 타자가 시작되면 끈다. */
    function begin() {
      if (started) {
        return;
      }
      started = true;
      if (opts.keepAnimate !== true) {
        hosts.forEach(function (host) {
          ["animate", "data-animate"].forEach(function (name) {
            var value = host.getAttribute(name);
            if (value !== null && (opts.keepAnimate === false || ONE_SHOT_MOTIONS.indexOf(value.trim().toLowerCase()) !== -1)) {
              host.removeAttribute(name);
            }
          });
        });
      }
      paint(shown.join("\n"));
    }

    function play(frames, delay, done) {
      var i = 0;
      (function step() {
        if (i >= frames.length) {
          done();
          return;
        }
        var frame = frames[i];
        i += 1;
        paint(frame);
        later(step, typeof delay === "function" ? delay(frame) : delay);
      })();
    }

    function nextIndex() {
      if (!shuffleOrder) {
        return (index + 1) % list.length;
      }
      if (!queue.length) {
        queue = list.map(function (_, i) { return i; }).filter(function (i) { return i !== index; });
        for (var i = queue.length - 1; i > 0; i -= 1) {
          var j = Math.floor(Math.random() * (i + 1));
          var swap = queue[i];
          queue[i] = queue[j];
          queue[j] = swap;
        }
      }
      return queue.shift();
    }

    function cycle() {
      if (!loop && index === list.length - 1) {
        return;
      }
      var from = list[index];
      index = nextIndex();
      var plan = transitionFrames(from, list[index]);
      announce();
      play(plan.erase, eraseDelay, function () {
        later(function () {
          play(plan.write, typeDelay, function () {
            later(cycle, hold);
          });
        }, gap);
      });
    }

    var reduced = prefersReducedMotion();
    if (reduced || (!intro && list.length < 2)) {
      paint(list[index]);
      announce();
    } else if (intro) {
      /* 빈 화면에서 첫 문장을 쳐 넣는다(문장이 하나면 그것으로 끝). */
      announce();
      begin();
      paint("");
      later(function () {
        play(typingFrames(list[index]), typeDelay, function () {
          if (list.length > 1) {
            later(cycle, hold);
          }
        });
      }, opts.delay || 0);
    } else {
      paint(list[index]);
      announce();
      later(function () {
        begin();
        later(cycle, caretLead);
      }, firstHold - caretLead);
    }

    if (!reduced && global.IntersectionObserver) {
      observer = new global.IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting;
      });
      observer.observe(opts.observe || hosts[0]);
    }

    return {
      hosts: hosts,
      get index() {
        return index;
      },
      stop: function () {
        later.stop();
        if (observer) {
          observer.disconnect();
        }
        hosts.forEach(function (host) {
          toggleClass(host, caret, false);
        });
      }
    };
  }

  // ── scatter ───────────────────────────────────────────────

  function scatter(target, options) {
    var hosts = requireHosts(target, "scatter");
    var opts = options || {};
    var reach = opts.distance === undefined ? 1 : Number(opts.distance);
    var duration = opts.duration === undefined ? 650 : opts.duration;
    var on = opts.on || "auto";
    var hover = on === "hover" || (on === "auto" && Boolean(global.matchMedia) &&
      global.matchMedia("(hover: hover)").matches);
    var listeners = [];
    var focusable = [];
    var open = false;
    var stopped = false;
    var owner = motionOwner(1);
    var easing = "cubic-bezier(0.2, 0.9, 0.25, 1.25)";

    function apply() {
      var still = prefersReducedMotion();
      hosts.forEach(function (host) {
        jamoNodes(host).forEach(function (node, order) {
          var glyph = glyphIndexOf(node);
          var transition = ["translate, rotate", duration + "ms", easing, glyph * 25 + "ms"];
          if (!open || still) {
            setMotion(owner, node, "", "", transition);
            return;
          }
          var seed = jamoSeed(node, order);
          var step = roleStep(node);
          var dx;
          var dy;
          var turn;
          if (step === 0) {
            dx = -(0.2 + seed * 0.3);
            dy = -(0.18 + seed * 0.25);
            turn = -(8 + seed * 16);
          } else if (step === 1) {
            dx = 0.18 + seed * 0.3;
            dy = (seed - 0.5) * 0.4;
            turn = 6 + seed * 14;
          } else {
            dx = (seed - 0.5) * 0.4;
            dy = 0.22 + seed * 0.25;
            turn = (seed - 0.5) * 30;
          }
          setMotion(owner, node, (dx * reach).toFixed(3) + "em " + (dy * reach).toFixed(3) + "em", turn.toFixed(1) + "deg", transition);
        });
      });
    }

    function set(next) {
      if (stopped) { return; }
      open = Boolean(next);
      hosts.forEach(function (host) {
        scatterClass(host, owner, open);
      });
      apply();
    }

    hosts.forEach(function (host) {
      if (hover) {
        listen(listeners, host, "pointerenter", function () { set(true); });
        listen(listeners, host, "pointerleave", function () { set(false); });
      }
      if (on !== "hover") {
        listen(listeners, host, "click", function () {
          if (!hover) {
            set(!open);
          }
        });
      }
      ensureFocusable(host, focusable);
      listen(listeners, host, "keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        set(!open);
      });
      listen(listeners, host, "blur", function () { set(false); });
      listen(listeners, host, RENDER_EVENT, function (event) {
        if (event.target === host) {
          releaseMotion(owner);
          if (open) { apply(); }
        }
      });
    });

    return {
      hosts: hosts,
      get open() {
        return open;
      },
      set: set,
      toggle: function () {
        set(!open);
        return open;
      },
      stop: function () {
        if (stopped) { return; }
        stopped = true;
        unlistenAll(listeners);
        releaseFocusable(focusable);
        releaseAndSettle(owner);
        open = false;
        hosts.forEach(function (host) { scatterClass(host, owner, false); });
      }
    };
  }

  // ── magnet ────────────────────────────────────────────────

  function nextFrame(fn) {
    return typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame(fn)
      : setTimeout(fn, 16);
  }

  function cancelFrame(id) {
    if (typeof global.cancelAnimationFrame === "function") {
      global.cancelAnimationFrame(id);
    } else {
      clearTimeout(id);
    }
  }

  /* WebKit은 개별 translate·rotate가 0으로 돌아와도 넓어진 스크롤 영역을 줄이지 않는다 — 음절 상자(transform이 없는 조상)의
   * transform을 한 번 바꿨다 같은 작업 안에 되돌리면 그 바탕 요소 전체를 다시 잰다. transition으로 돌아오는 움직임은 코어가
   * transitionend에서 같은 일을 한다(font-kku.js nudgeBoxes). 자석은 프레임마다 인라인 값을 써서 끝 사건이 없고, 멈추기(stop)는
   * 인라인 값을 지워 자모가 바로 제자리로 오므로 여기서 한다. 코어와 같은 규칙: WebKit 엔진에서만, 줄 덩이마다 상자 하나, transform
   * 하나만 CSSOM으로 바꾸고 값·우선순위째 되돌린다(transition은 그대로, style 속성 글은 쓰지 않는다 — CSP style-src), 이미 transform이
   * 있거나 transform을 transition하는 상자는 건너뛴다. */
  function webkitEngine() {
    var ua = (global.navigator && global.navigator.userAgent) || "";
    return /AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(ua);
  }

  /* transform을 transition하는지 — all·transform·-webkit-transform, 시간이나 늦춤이 0보다 크면(시간 0 + 늦춤도 transition이 선다) */
  function transitionsTransform(style) {
    var names = String(style.transitionProperty || "").split(",");
    var times = String(style.transitionDuration || "0s").split(",");
    var delays = String(style.transitionDelay || "0s").split(",");
    return names.some(function (name, i) {
      var trimmed = name.trim();
      return (trimmed === "all" || trimmed === "transform" || trimmed === "-webkit-transform") &&
        (parseFloat(times[i % times.length]) > 0 || parseFloat(delays[i % delays.length]) > 0);
    });
  }

  function settleParents(nodes) {
    if (!nodes.length || !webkitEngine()) {
      return;
    }
    var roots = [];
    var ready = [];
    nodes.forEach(function (node) {
      var box = node && typeof node.closest === "function" ? node.closest('[part~="glyph"]') : null;
      if (!box || box === node || !box.style || box.isConnected === false) {
        return;
      }
      /* 줄 덩이(part="line", 줄바꿈마다)마다 상자 하나 — 상자 하나로 그 줄 덩이만 다시 잰다 */
      var root = typeof box.closest === "function" ? box.closest('[part="line"]') || box.closest('[part="root"]') || box.parentElement : null;
      if (roots.indexOf(root) >= 0) {
        return;
      }
      var view = box.ownerDocument && box.ownerDocument.defaultView;
      var style = view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(box) : null;
      if (style && (style.transform !== "none" || transitionsTransform(style))) {
        return;
      }
      roots.push(root);
      ready.push(box);
    });
    if (!ready.length) {
      return;
    }
    var saved = ready.map(function (box) {
      return [box.hasAttribute("style"), box.style.getPropertyValue("transform"), box.style.getPropertyPriority("transform")];
    });
    ready.forEach(function (box) { box.style.setProperty("transform", "translateZ(0)", "important"); });
    void ready[0].offsetWidth;
    ready.forEach(function (box, i) {
      if (saved[i][1]) {
        box.style.setProperty("transform", saved[i][1], saved[i][2]);
      } else {
        box.style.removeProperty("transform");
      }
      if (!saved[i][0] && box.getAttribute("style") === "") {
        box.removeAttribute("style");
      }
    });
  }

  /* 움직임을 거두고(releaseMotion) 그 자모의 바탕 요소를 다시 재게 한다 — 인라인 값을 지우면 transition 없이 바로 제자리라 끝 사건이 없다 */
  function releaseAndSettle(owner) {
    var nodes = [];
    owner.nodes.forEach(function (node) { nodes.push(node); });
    releaseMotion(owner);
    settleParents(nodes);
  }

  /* 자모 중심은 커서가 들어올 때 한 번 재고(다시 그려지면 다시), 매 프레임 조금씩 따라간다. */
  function magnet(target, options) {
    var hosts = requireHosts(target, "magnet");
    var opts = options || {};
    var reachEm = opts.reach === undefined ? 1.3 : Number(opts.reach);
    var strength = opts.strength === undefined ? 0.55 : Number(opts.strength);
    var listeners = [];
    var controllers = hosts.map(function (host) {
      var area = opts.area || host;
      var items = [];
      var pointer = null;
      var frame = 0;
      var owner = motionOwner(2);

      function scroll() {
        return { x: global.scrollX || 0, y: global.scrollY || 0 };
      }
      function measure() {
        var size = parseFloat(global.getComputedStyle ? global.getComputedStyle(host).fontSize : "16") || 16;
        var offset = scroll();
        releaseAndSettle(owner);
        rested = [];
        items = jamoNodes(host).map(function (node) {
          var box = node.getBoundingClientRect();
          return { node: node, x: box.left + box.width / 2 + offset.x, y: box.top + box.height / 2 + offset.y, dx: 0, dy: 0, size: size };
        });
      }
      var rested = [];
      function place(item) {
        item.moved = true;
        setMotion(owner, item.node, item.dx.toFixed(1) + "px " + item.dy.toFixed(1) + "px", (item.dx * 0.6).toFixed(1) + "deg", ["none", "0s", "linear", "0s"]);
      }
      function tick() {
        frame = 0;
        var moving = false;
        items.forEach(function (item) {
          var tx = 0;
          var ty = 0;
          if (pointer) {
            var ax = item.x - pointer.x;
            var ay = item.y - pointer.y;
            var distance = Math.sqrt(ax * ax + ay * ay) || 1;
            var force = Math.max(0, 1 - distance / (item.size * reachEm));
            tx = (ax / distance) * force * force * item.size * strength;
            ty = (ay / distance) * force * force * item.size * strength;
          }
          item.dx += (tx - item.dx) * 0.2;
          item.dy += (ty - item.dy) * 0.2;
          if (Math.abs(tx - item.dx) > 0.1 || Math.abs(ty - item.dy) > 0.1) {
            moving = true;
          }
          if (Math.abs(tx) < 0.1 && Math.abs(ty) < 0.1 && Math.abs(item.dx) < 0.1 && Math.abs(item.dy) < 0.1) {
            /* 제자리에 돌아왔다 — 인라인 값을 지워 자모 움직임이 다시 돈다 */
            if (item.moved) {
              rested.push(item.node);
              item.moved = false;
            }
            item.dx = 0;
            item.dy = 0;
            setMotion(owner, item.node, "", "");
            return;
          }
          place(item);
        });
        if (moving) {
          frame = nextFrame(tick);
        } else if (rested.length) {
          /* 움직임이 멎을 때 한 번 — 프레임마다 하면 긴 페이지에서 강제 배치가 프레임을 떨군다 */
          settleParents(rested.splice(0));
        }
      }
      function wake() {
        if (!frame) {
          frame = nextFrame(tick);
        }
      }
      listen(listeners, area, "pointerenter", function () {
        if (!prefersReducedMotion()) {
          measure();
        }
      });
      listen(listeners, area, "pointermove", function (event) {
        if (prefersReducedMotion() || pausedBy(host)) {
          return;
        }
        if (!items.length) {
          measure();
        }
        var offset = scroll();
        pointer = { x: event.clientX + offset.x, y: event.clientY + offset.y };
        wake();
      });
      listen(listeners, area, "pointerleave", function () {
        pointer = null;
        wake();
      });
      listen(listeners, host, RENDER_EVENT, function (event) {
        if (event.target === host) {
          /* 자모 노드가 그대로인 다시 그리기(Firefox 칸 그림만 바뀜 등)는 제자리만 다시 재고 밀어 둔 자리는 둔다 — 같은 작업 안에서
           * 다시 놓으니 자모가 제자리로 튀었다가 다시 밀려 나가지 않는다 */
          var nodes = jamoNodes(host);
          var kept = items.length === nodes.length && items.every(function (item, i) { return item.node === nodes[i]; }) ? items : null;
          releaseMotion(owner);
          items = [];
          if (pointer && !prefersReducedMotion()) {
            measure();
            if (kept) {
              items.forEach(function (item, i) {
                item.dx = kept[i].dx;
                item.dy = kept[i].dy;
                if (kept[i].moved) { place(item); }
              });
            }
            wake();
          }
        }
      });
      return {
        stop: function () {
          if (frame) {
            cancelFrame(frame);
            frame = 0;
          }
          releaseAndSettle(owner);
          rested = [];
          items = [];
        }
      };
    });

    return {
      hosts: hosts,
      stop: function () {
        unlistenAll(listeners);
        controllers.forEach(function (controller) {
          controller.stop();
        });
      }
    };
  }

  // ── shuffle ───────────────────────────────────────────────

  function makeSeed() {
    return "kku-" + Math.floor(Math.random() * 0x7fffffff).toString(36);
  }

  function shuffle(target, options) {
    var hosts = requireHosts(target, "shuffle");
    var opts = options || {};
    var on = opts.on === undefined ? "click" : opts.on;
    var every = Number(opts.every) || 0;
    var listeners = [];
    var focusable = [];
    var initial = hosts[0].getAttribute(optionAttr(hosts[0], "seed"));
    var current = initial;
    var later = scheduler(function () {
      return documentHidden() || hosts.some(pausedBy);
    }, hosts);

    if (opts.jamoSeeds !== false) {
      hosts.forEach(function (host) {
        var name = optionAttr(host, "jamo-seeds");
        if (host.getAttribute(name) === null) {
          host.setAttribute(name, "");
        }
      });
    }

    function reseed(seed) {
      var next = seed === undefined || seed === null || seed === ""
        ? (typeof opts.seed === "function" ? String(opts.seed()) : makeSeed())
        : String(seed);
      current = next;
      hosts.forEach(function (host) {
        host.setAttribute(optionAttr(host, "seed"), next);
      });
      if (typeof opts.onSeed === "function") {
        opts.onSeed(next);
      }
      return next;
    }

    function reset() {
      if (initial === null) {
        current = null;
        hosts.forEach(function (host) {
          host.removeAttribute(optionAttr(host, "seed"));
        });
        if (typeof opts.onSeed === "function") {
          opts.onSeed(null);
        }
        return null;
      }
      return reseed(initial);
    }

    hosts.forEach(function (host) {
      if (on === "click") {
        ensureFocusable(host, focusable);
        listen(listeners, host, "click", function () { reseed(); });
        listen(listeners, host, "keydown", function (event) {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          if (typeof event.preventDefault === "function") {
            event.preventDefault();
          }
          reseed();
        });
      } else if (on === "hover") {
        listen(listeners, host, "pointerenter", function () { reseed(); });
      }
    });

    if (every > 0) {
      (function tick() {
        later(function () {
          if (!prefersReducedMotion()) {
            reseed();
          }
          tick();
        }, every);
      })();
    }

    return {
      hosts: hosts,
      get seed() {
        return current;
      },
      reseed: reseed,
      reset: reset,
      stop: function () {
        later.stop();
        unlistenAll(listeners);
        releaseFocusable(focusable);
      }
    };
  }

  // ── replay ────────────────────────────────────────────────

  /* 한 번 도는 움직임(assemble·drop 등)을 처음부터: 다시 그리면 자모 노드가 새로 생긴다.
   * seed="auto"면 다시 그릴 때 씨앗도 새로 뽑는다. */
  function replay(target) {
    var FontKku = runtime();
    var hosts = toHosts(target);
    if (FontKku && typeof FontKku.refresh === "function") {
      hosts.forEach(function (host) {
        FontKku.refresh(host);
      });
    }
    return hosts;
  }

  // ── 선언형 연결 ───────────────────────────────────────────

  var FX_NAMES = ["type", "scatter", "magnet", "shuffle"];
  var BOUND = [];

  function boundEntry(host) {
    for (var i = 0; i < BOUND.length; i += 1) {
      if (BOUND[i].host === host) {
        return BOUND[i];
      }
    }
    return null;
  }

  function warn(message) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(message);
    }
  }

  function shuffleOptions(value) {
    var options = { on: null };
    String(value || "click").split(/\s+/).filter(Boolean).forEach(function (token) {
      if (/^\d+$/.test(token)) {
        options.every = parseInt(token, 10);
      } else if (token === "click" || token === "hover") {
        options.on = token;
      }
    });
    return options;
  }

  /* 문서에서 빠진 바탕 요소의 효과는 멈추고 뗀다 — 지운 요소에 타이머·리스너가 남지 않게.
   * 옮겨 붙인 요소는 확인할 때 다시 문서 안이라 그대로 둔다. */
  var reaper = null;
  function watchRemovals() {
    var doc = global.document;
    if (reaper || typeof global.MutationObserver !== "function" || !doc || !doc.documentElement) {
      return;
    }
    reaper = new global.MutationObserver(function () {
      BOUND = BOUND.filter(function (entry) {
        if (entry.host.isConnected !== false) {
          return true;
        }
        entry.controllers.forEach(function (controller) {
          controller.stop();
        });
        return false;
      });
      if (!BOUND.length) {
        reaper.disconnect();
        reaper = null;
      }
    });
    reaper.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function bindHost(host) {
    var existing = boundEntry(host);
    if (existing) {
      return existing.controllers;
    }
    var controllers = [];
    String(host.getAttribute("data-kku-fx") || "").split(/[\s,]+/).filter(Boolean).forEach(function (raw) {
      var name = raw.toLowerCase();
      if (FX_NAMES.indexOf(name) === -1) {
        warn("font-kku-fx: unknown effect \"" + name + "\" (" + FX_NAMES.join(", ") + ")");
        return;
      }
      if (name === "type") {
        var phrases = String(host.getAttribute("data-kku-phrases") || "").split("|").filter(function (phrase) {
          return phrase.trim() !== "";
        });
        controllers.push(type(host, phrases.length ? phrases : [readText(host)], {
          caret: host.getAttribute("data-kku-caret") || ""
        }));
      } else if (name === "scatter") {
        controllers.push(scatter(host, { on: host.getAttribute("data-kku-scatter") || "auto" }));
      } else if (name === "magnet") {
        controllers.push(magnet(host));
      } else {
        controllers.push(shuffle(host, shuffleOptions(host.getAttribute("data-kku-shuffle"))));
      }
    });
    BOUND.push({ host: host, controllers: controllers });
    watchRemovals();
    return controllers;
  }

  function scopeHosts(root) {
    var scope = root || global.document;
    if (!scope) {
      return [];
    }
    var hosts = typeof scope.querySelectorAll === "function"
      ? Array.prototype.slice.call(scope.querySelectorAll("[data-kku-fx]"))
      : [];
    if (typeof scope.getAttribute === "function" && scope.getAttribute("data-kku-fx") !== null) {
      hosts.unshift(scope);
    }
    return hosts;
  }

  /* root(기본 document) 안의 data-kku-fx 바탕 요소에 효과를 단다. 이미 단 요소는 건너뛴다. */
  function bind(root) {
    var hosts = scopeHosts(root);
    hosts.forEach(bindHost);
    return hosts;
  }

  function contains(root, host) {
    return !root || root === host || (typeof root.contains === "function" && root.contains(host));
  }

  /* root(기본 전부) 안의 효과를 멈추고 뗀다. 다시 bind하면 새로 단다. */
  function unbind(root) {
    var removed = [];
    BOUND = BOUND.filter(function (entry) {
      if (!contains(root, entry.host)) {
        return true;
      }
      entry.controllers.forEach(function (controller) {
        controller.stop();
      });
      removed.push(entry.host);
      return false;
    });
    return removed;
  }

  var FontKkuFx = {
    typingFrames: typingFrames,
    transitionFrames: transitionFrames,
    type: type,
    scatter: scatter,
    magnet: magnet,
    shuffle: shuffle,
    replay: replay,
    bind: bind,
    unbind: unbind
  };

  /* 같은 페이지에 두 번 실행돼도(한 줄 설치 + ESM import) 하나만 묶는다. */
  if (global.FontKkuFx && typeof global.FontKkuFx.bind === "function") {
    FontKkuFx = global.FontKkuFx;
  } else {
    global.FontKkuFx = FontKkuFx;
    var config = global.FontKkuFxConfig || {};
    var doc = global.document;
    if (config.autoBind !== false && doc && typeof doc.addEventListener === "function") {
      var start = function () {
        bind(doc);
      };
      if (doc.readyState === "loading") {
        doc.addEventListener("DOMContentLoaded", start);
      } else {
        start();
      }
      /* 나중에 그려진(또는 처음 그려진) 바탕 요소 — 런타임의 그리기 이벤트는 거품이 올라온다. */
      doc.addEventListener(RENDER_EVENT, function (event) {
        var host = event.target;
        if (host && typeof host.getAttribute === "function" && host.getAttribute("data-kku-fx") !== null &&
            doc.readyState !== "loading") {
          bindHost(host);
        }
      });
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuFx;
  }
})(typeof window !== "undefined" ? window : globalThis);
