/* 소개의 '2 · 칸 하나를 고치면', '3 · 대화창 답 하나가 글꼴 하나', '4 · 자모마다'(특장점 타일), '5 · 사례'.
 * 무대(글꼴 바·8칸·큰 문장)와 증명·내 페이지 코드는 landing-maker.js가 맡는다.
 *
 * - 칸 하나를 고치면: 무대가 고른 세트(window.FontKkuLanding)를 따라가되 ㅅ 칸만 바꿔 'landing-fix' 세트로 다시 등록한다.
 *   견본에서 ㅅ 칸으로 그은 획([data-hoek-drawing="ㅅ"])만 빨갛게 보이고, 같이 바뀌는 자모와 든 글자 수는 이 브라우저가 조립
 *   계획으로 센다. 화면에 들어오면 변주를 한 바퀴 돌리고, 사람이 칩을 누르면 멈춘다.
 * - AI: 느낌 칩 하나가 프롬프트의 느낌 줄(src/landing-ai-sets.js의 프롬프트에 느낌만 바꿔 넣는다), 큰 견본(그 느낌으로 실제로
 *   받은 첫 답), 답 원문 목록의 표시를 함께 고른다. 답은 받은 HTML 그대로다.
 * - 타일: 한 번 도는 움직임은 커서를 올리면 다시 돌고, 씨앗 변주는 다시 뽑는다. 평문 2줄은 런타임 renderText로 그 자리에서 푼다.
 * - 사례: examples/index.json에서 사례 수·제목을 읽어, 쓰임이 다른 카드 셋(PICKS)과 모든 사례 제목 한 줄을 그린다. */
(function () {
  "use strict";

  var FK = window.FontKku;
  var Fx = window.FontKkuFx;
  var S = window.FontKkuLandingSets;
  var L = window.FontKkuLanding;
  var site = window.FontKkuSite;
  if (!FK || !site) return;

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function num(n) { return Number(n).toLocaleString("ko-KR"); }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; });
  }
  function kb(bytes) { return bytes < 1024 ? bytes + "B" : (bytes / 1024).toFixed(1) + "KB"; }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── 2. 칸 하나를 고치면 ─────────────────────────────────────────
  var FIX_SET = "landing-fix";
  /* ㅅ 칸의 다른 모양 셋 — 칸 계약(frame: "box")의 100×100 좌표, 중심선 경로 */
  var VARIANTS = {
    sharp: { box: [10, 10, 90, 90], shapes: ["M50 10 L18 90", "M50 10 L82 90"] },
    round: { box: [10, 10, 90, 90], shapes: ["M56 10 C48 40 32 68 10 86", "M44 38 C54 60 70 78 90 84"] },
    wide: { box: [10, 10, 90, 90], shapes: ["M50 28 C40 56 26 76 10 88", "M50 28 C60 56 74 76 90 88"] }
  };
  var CYCLE = ["sharp", "round", "wide", "base"];
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
  var JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("");

  var fix = $("[data-fix]");
  var fixHost = $("[data-fix-host]");
  if (fix && fixHost && L && S) {
    var fixSvg = $("[data-fix-svg]");
    var fixCaption = $("[data-fix-caption]");
    var fixChips = $$("[data-fix-variant]");
    var variant = "base";
    var current = null;      // 무대가 알려 준 { set, cells, width, cap, source }
    var touched = false;     // 사람이 칩을 누르면 자동 순환을 멈춘다

    var usesS = function (jamo, role, context) {
      var plan = FK.planJamo(jamo, { set: FIX_SET, role: role, context: context });
      return plan.items.some(function (item) { return item.drawing === "ㅅ" || item.alias === "ㅅ"; });
    };
    var derivedFromS = function () {
      var out = [];
      CHO.forEach(function (j) { if (usesS(j, "initial", "cho") || usesS(j, "initial", "bar")) out.push(j); });
      JONG.forEach(function (j) { if (out.indexOf(j) < 0 && usesS(j, "final", "jong")) out.push(j); });
      return out;
    };
    /* 직접 그리기에서 ㅅ 칸을 아직 긋지 않았으면 고른 AI 세트의 ㅅ으로 보인다 */
    var baseCells = function () {
      var cells = clone(current.cells);
      if (!cells["ㅅ"]) {
        var fallback = S.read(S.byId(current.source) || S.sets[0]);
        cells["ㅅ"] = clone(fallback.cells["ㅅ"]);
      }
      return cells;
    };
    var drawCell = function (cell, width) {
      fixSvg.innerHTML = "";
      var stroke = parseFloat(width) * 70 * 0.8;
      (cell.shapes || []).forEach(function (shape) {
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", typeof shape === "string" ? shape : shape.d);
        path.setAttribute("stroke-width", String(stroke));
        fixSvg.appendChild(path);
      });
    };
    var applyFix = function () {
      if (!current || !Object.keys(current.cells).length) return;
      var cells = baseCells();
      if (variant !== "base") cells["ㅅ"] = clone(VARIANTS[variant]);
      var options = current.cap === "butt" ? { frame: "box", cap: "butt", join: "miter" } : { frame: "box", cap: "round", join: "round" };
      FK.registerJamo(FIX_SET, cells, options);
      fixHost.style.setProperty("--fy-element-width", current.width);
      FK.refresh(fixHost);
      drawCell(cells["ㅅ"], current.width);
      fixChips.forEach(function (chip) { chip.setAttribute("aria-pressed", String(chip.getAttribute("data-fix-variant") === variant)); });
      var list = derivedFromS();
      fixCaption.innerHTML = '<span class="k-red">빨간 획</span>이 ㅅ 칸으로 그은 부분입니다 · 같이 바뀌는 자모 ' +
        list.map(function (j) { return '<span class="k-jamo">' + j + "</span>"; }).join("") +
        " · 그 자모가 든 글자 <b>" + num(L.affected("ㅅ")) + "</b>자 / 11,172자 — 이 브라우저가 지금 센 값입니다";
    };

    fixChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        touched = true;
        variant = chip.getAttribute("data-fix-variant");
        applyFix();
      });
    });
    var fixDraw = $("[data-fix-draw]");
    if (fixDraw) {
      fixDraw.addEventListener("click", function () {
        touched = true;
        var cell = $('[data-maker-cell="ㅅ"]');
        if (cell) cell.click();
      });
    }
    L.on(function (info) {
      current = info;
      applyFix();
    });

    if (!reduceMotion && "IntersectionObserver" in window) {
      var timer = 0;
      var step = 0;
      var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          clearInterval(timer);
          timer = 0;
          if (entry.isIntersecting && !touched) {
            timer = setInterval(function () {
              if (touched) { clearInterval(timer); return; }
              variant = CYCLE[step % CYCLE.length];
              step += 1;
              applyFix();
            }, 2200);
          }
        });
      }, { threshold: 0.4 });
      seen.observe(fix);
    }
  }

  // ── 3. 대화창 답 하나가 글꼴 하나 ──────────────────────────────────
  /* 느낌 하나에 프롬프트 하나 — 그 느낌으로 실제로 받은 답이 견본과 목록에 표시된다(답이 없는 느낌은 두지 않는다) */
  var PRESETS = S ? [
    { label: "굵은 마커", feel: S.MARKER },
    { label: "붓펜", feel: S.BRUSH },
    { label: "풍선 글씨", feel: S.BALLOON },
    { label: "가는 펜", feel: S.PEN }
  ] : [];

  var aiPreset = 0;
  var promptEl = document.getElementById("ai-prompt");
  var presetMount = $("[data-ai-presets]");
  var answersMount = $("[data-ai-answers]");
  var answerHosts = $$("[data-answer-host], [data-answer-host-2]");
  var answerMeta = $("[data-answer-meta]");
  $$("[data-ai-count]").forEach(function (node) { if (S) node.textContent = String(S.sets.length); });

  function promptFor(index) {
    var preset = PRESETS[index];
    return preset && S ? S.prompt(preset.feel) : "";
  }

  function answersFor(feel) {
    return S ? S.sets.filter(function (set) { return set.feel === feel; }) : [];
  }

  function renderAi() {
    if (!promptEl || !S) return;
    var feel = PRESETS[aiPreset] ? PRESETS[aiPreset].feel : "";
    /* 느낌 줄만 표시해 두면 어디를 바꿔 쓰는지 보인다 — textContent는 그대로 프롬프트 전문이다 */
    promptEl.innerHTML = promptFor(aiPreset).split("\n").map(function (line) {
      return /^느낌:/.test(line) ? "<mark>" + escapeHtml(line) + "</mark>" : escapeHtml(line);
    }).join("\n");
    presetMount.innerHTML = PRESETS.map(function (item, index) {
      return '<button type="button" data-ai-preset="' + index + '" aria-pressed="' + (index === aiPreset) + '">' + escapeHtml(item.label) +
        " <small>답 " + answersFor(item.feel).length + "</small></button>";
    }).join("");
    var first = answersFor(feel)[0];
    if (first) {
      var read = S.read(first);
      answerHosts.forEach(function (host) {
        host.style.setProperty("--fy-element-width", read.width || "0.13em");
        host.setAttribute("jamo-set", first.id);
      });
      if (answerMeta) {
        answerMeta.innerHTML = "느낌 <b>'" + escapeHtml(first.feel) + "'</b>로 받은 " + escapeHtml(first.attempt) + " · " + (first.edited ? "고침" : "고치지 않음") +
          " · " + escapeHtml(first.by) + " · " + escapeHtml(first.where);
      }
    }
    if (answersMount) {
      $$(".k-answer", answersMount).forEach(function (card) {
        card.setAttribute("data-active", String(card.getAttribute("data-feel") === feel));
      });
    }
  }

  /* 실제로 받은 답 — 같은 문장을 같은 크기로 나란히. 줄마다 느낌·몇 번째 답·고쳤는지, 답 원문과 받기 */
  if (answersMount && S) {
    answersMount.innerHTML = S.sets.map(function (set) {
      var read = S.read(set);
      var bytes = new Blob([set.answer]).size;
      var cells = new Blob([JSON.stringify(read.cells)]).size;
      var shapes = Object.keys(read.cells).reduce(function (sum, key) { return sum + read.cells[key].shapes.length; }, 0);
      return '<article class="k-answer" data-answer="' + set.id + '" data-feel="' + escapeHtml(set.feel) + '">' +
        '<div class="k-answer-head"><strong>' + escapeHtml(set.feel) + "</strong>" +
        "<span>" + escapeHtml(set.attempt) + " · " + (set.edited ? "고침" : "고치지 않음") + " · 굵기 " + escapeHtml(read.width) + "</span>" +
        (set.followup ? '<span class="k-answer-followup">이어서 한 부탁: “' + escapeHtml(set.followup) + "”</span>" : "") + "</div>" +
        /* 답이 적은 글꼴(S.ANSWERED_FONT — 답을 받은 프롬프트가 적게 한 sebul) 그대로 그린다 */
        '<div class="k-stage"><font-kku font="' + S.ANSWERED_FONT + '" jamo-set="' + set.id + '" size="clamp(26px, 3.6vw, 44px)" style="--fy-element-width: ' + read.width + '">다람쥐 헌 쳇바퀴에 타고파</font-kku></div>' +
        '<details><summary>답 원문(HTML) · ' + kb(bytes) + " — 칸 " + Object.keys(read.cells).length + "개, 경로 " + shapes + "개, 칸 자료 " + kb(cells) + "</summary>" +
        '<p class="k-answer-meta">' + escapeHtml(set.by) + " · " + escapeHtml(set.where) + " · " + escapeHtml(set.date) + "</p>" +
        "<pre>" + escapeHtml(set.answer) + "</pre>" +
        '<button type="button" class="k-btn k-btn--small" data-answer-download="' + set.id + '">답 HTML 받기</button></details>' +
        "</article>";
    }).join("");
    answersMount.addEventListener("click", function (event) {
      var button = event.target.closest("[data-answer-download]");
      if (!button) return;
      var set = S.byId(button.getAttribute("data-answer-download"));
      if (set) site.download(set.id + ".html", set.answer, button);
    });
  }

  if (promptEl && presetMount) {
    presetMount.addEventListener("click", function (event) {
      var button = event.target.closest("[data-ai-preset]");
      if (!button) return;
      aiPreset = Number(button.getAttribute("data-ai-preset"));
      renderAi();
    });
    renderAi();
  }

  /* 'AI에게 맡길 문장 복사' 단추가 있으면 지금 고른 느낌의 프롬프트를 복사하고 AI 구간으로 */
  $$("[data-copy-prompt]").forEach(function (button) {
    button.addEventListener("click", function () {
      site.copyText(promptEl ? promptEl.textContent : promptFor(0), button);
      var selector = button.getAttribute("data-copy-prompt");
      var target = selector ? document.querySelector(selector) : null;
      if (target) setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
    });
  });

  // ── 4. 자모마다 — 타일 ────────────────────────────────────────────
  /* 한 번 도는 움직임은 불러올 때 이미 돌았다 — 커서를 올리면(포커스하면) 다시 돈다 */
  $$("[data-tile-replay]").forEach(function (stage) {
    var node = stage.querySelector("font-kku[animate]");
    if (!node || !Fx || typeof Fx.replay !== "function") return;
    var again = function () { Fx.replay(node); };
    stage.addEventListener("pointerenter", again);
    stage.closest(".k-tile").addEventListener("focusin", again);
  });
  /* 씨앗 변주 — 커서를 올리면 새 씨앗으로 다시 뽑는다 */
  $$("[data-tile-reseed]").forEach(function (stage) {
    var node = stage.querySelector("font-kku[jamo-seeds]");
    if (!node) return;
    var reseed = function () {
      node.setAttribute("seed", "s" + Math.random().toString(36).slice(2, 6));
      FK.refresh(node);
    };
    stage.addEventListener("pointerenter", reseed);
    stage.closest(".k-tile").addEventListener("focusin", reseed);
  });
  /* 평문 2줄 — 같은 분해 엔진(renderText)이 그 자리에서 푼다 */
  var plain = $("[data-plain-sample]");
  if (plain && typeof FK.renderText === "function") {
    try {
      plain.textContent = FK.renderText("폰꾸 한글").join("\n");
    } catch (error) {
      plain.textContent = "";
    }
  }

  // ── 5. 사례 ──────────────────────────────────────────────────
  /* 카드로 보일 사례 — 쓰임이 다른 셋(행사 · 영상 · 교육). 목록에 없는 파일은 건너뛴다. 사례 페이지 카드의 id는
   * case-<파일 이름>이다(showcase.html) */
  var PICKS = ["house-warming-note.html", "variety-caption.html", "hangul-class.html"];
  var casesMount = $("[data-cases]");
  if (casesMount) {
    var caseLinks = $("[data-case-links]");
    var caseAnchor = function (item) { return "./showcase.html#case-" + encodeURIComponent(String(item.file).replace(/\.html$/, "")); };
    fetch("./examples/index.json").then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }).then(function (data) {
      /* 파일 이름은 주소와 속성에 그대로 들어간다 — 사례 폴더의 이름 꼴(소문자·숫자·줄표 + .html)만 받는다 */
      var examples = (data.examples || []).filter(function (item) {
        return item && typeof item.file === "string" && /^[a-z0-9-]+\.html$/.test(item.file) && item.title;
      });
      $$("[data-cases-count]").forEach(function (node) { node.textContent = String(examples.length); });
      var byFile = {};
      examples.forEach(function (item) { byFile[item.file] = item; });
      casesMount.innerHTML = PICKS.filter(function (file) { return byFile[file]; }).map(function (file) {
        var item = byFile[file];
        var href = "./examples/" + item.file;
        return '<a class="k-case" href="' + href + '">' +
          '<span class="k-case-frame"><iframe src="' + href + '" title="' + escapeHtml(item.title) + ' 미리보기" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></span>' +
          "<strong>" + escapeHtml(item.title) + "</strong>" +
          "<span>" + escapeHtml(item.summary || "") + "</span>" +
          "</a>";
      }).join("");
      if (caseLinks && examples.length) {
        caseLinks.innerHTML = '<span class="k-case-links-label">모든 사례</span> ' + examples.map(function (item) {
          return '<a href="' + caseAnchor(item) + '">' + escapeHtml(item.title) + "</a>";
        }).join('<span aria-hidden="true"> · </span>');
        caseLinks.hidden = false;
      }
    }).catch(function () {
      casesMount.innerHTML = '<p class="k-note">사례 목록을 불러오지 못했습니다. <a href="./showcase.html">사례 페이지</a>에서 보세요.</p>';
    });
  }
})();
