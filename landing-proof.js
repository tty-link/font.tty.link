/* 소개의 '둘 · AI에게 맡기는 한글 글꼴', '셋 · 씨앗 변주', '넷 · 자모 단위 칠과 움직임', '덤'.
 *
 * - AI: 느낌마다 프롬프트(src/landing-ai-sets.js의 프롬프트에 느낌만 바꿔 넣는다)와, 그 프롬프트로 실제로 받은 답(HTML 원문
 *   그대로)을 같은 문장·같은 크기로 나란히 그린 줄. 고른 느낌의 답 줄이 표시된다. 히어로의 'AI에게 맡길 문장 복사'도 여기서
 *   지금 프롬프트를 복사한다.
 * - 씨앗 변주: 같은 AI 마커 세트에 화면에 보인 6줄 그대로 돌린 글자 단위 JS 흔들기와 폰꾸 자모 단위(.k-hand) — 글꼴은 같고
 *   흔드는 단위(음절 대 자모)만 다르다. 씨앗은 짧은 이름으로 정해 옮겨 적기 쉽게 한다. 이름 씨앗 셋은 다시 그려도 자모
 *   씨앗값이 그대로인지 이 브라우저가 견준다.
 * - 자모 단위: 입력한 문장을 NFD로 풀어 span마다 색을 준 것(이 브라우저가 실제로 그린 모습)과 폰꾸를 나란히, 움직임 타일도
 *   입력한 문장으로 다시 그린다.
 * - 덤: examples/index.json에서 사례 수·제목을 읽어, 쓰임이 다른 카드 셋(PICKS)과 모든 사례 제목 한 줄을 그린다. */
(function () {
  "use strict";

  var FK = window.FontKku;
  var Fx = window.FontKkuFx;
  var S = window.FontKkuLandingSets;
  var site = window.FontKkuSite;
  if (!FK || !site) return;

  function $(selector, scope) { return (scope || document).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
  function nextFrame(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch]; });
  }
  function kb(bytes) { return bytes < 1024 ? bytes + "B" : (bytes / 1024).toFixed(1) + "KB"; }

  /* 자모 노드마다 걸린 씨앗값(jamo-seeds) — 두 바탕 요소가 같은 모양인지 견줄 때 쓴다. */
  function jamoSeeds(host) {
    return $$("[data-jamo]", host).map(function (node) {
      return node.style.getPropertyValue("--fy-jamo-seed");
    }).join(",");
  }

  // ── 둘: AI에게 부탁하기 ─────────────────────────────────────
  /* 느낌 하나에 프롬프트 하나 — 그 느낌으로 실제로 받은 답이 아래 목록에서 표시된다(답이 없는 느낌은 두지 않는다) */
  var PRESETS = S ? [
    { label: "굵은 마커", feel: S.MARKER },
    { label: "붓펜", feel: S.BRUSH },
    { label: "풍선 글씨", feel: S.BALLOON },
    { label: "가는 펜", feel: S.PEN }
  ] : [];

  var aiPreset = 0;
  var promptEl = document.getElementById("ai-prompt");
  /* 실린 답 수 — 글로 적어 두면 답을 더할 때 어긋난다 */
  $$("[data-ai-count]").forEach(function (node) { if (S) node.textContent = String(S.sets.length); });
  var presetMount = $("[data-ai-presets]");
  var answersMount = $("[data-ai-answers]");

  function promptFor(index) {
    var preset = PRESETS[index];
    return preset && S ? S.prompt(preset.feel) : "";
  }

  function renderAi() {
    if (!promptEl) return;
    promptEl.textContent = promptFor(aiPreset);
    presetMount.innerHTML = PRESETS.map(function (item, index) {
      var count = S.sets.filter(function (set) { return set.feel === item.feel; }).length;
      return '<button type="button" data-ai-preset="' + index + '" aria-pressed="' + (index === aiPreset) + '">' + escapeHtml(item.label) +
        ' <small>답 ' + count + "</small></button>";
    }).join("");
    if (answersMount) {
      var feel = PRESETS[aiPreset] ? PRESETS[aiPreset].feel : "";
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
        '<div class="k-stage"><font-kku font="sebul" jamo-set="' + set.id + '" size="clamp(26px, 3.6vw, 44px)" style="--fy-element-width: ' + read.width + '">다람쥐 헌 쳇바퀴에 타고파</font-kku></div>' +
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

  if (promptEl) {
    presetMount.addEventListener("click", function (event) {
      var button = event.target.closest("[data-ai-preset]");
      if (!button) return;
      aiPreset = Number(button.getAttribute("data-ai-preset"));
      renderAi();
    });
    renderAi();
  }

  /* 히어로의 'AI에게 맡길 문장 복사' — 지금 고른 느낌의 프롬프트를 복사하고 AI 구간으로 */
  $$("[data-copy-prompt]").forEach(function (button) {
    button.addEventListener("click", function () {
      site.copyText(promptEl ? promptEl.textContent : promptFor(0), button);
      var target = document.querySelector(button.getAttribute("data-copy-prompt"));
      if (target) {
        setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 350);
      }
    });
  });

  // ── 셋: 씨앗 변주 ───────────────────────────────────────────
  /* 화면에 보이는 6줄 그대로다 — 이 글을 new Function으로 돌린다. 웹폰트 글에 Splitting.js로 글자마다 span을 씌워 흔드는
   * 것과 같은 일을, 폰꾸가 같은 AI 마커 세트로 그린 글자(음절) 노드에 한다 — 글꼴은 같고 흔드는 단위만 자모와 다르다.
   * 색은 바꾸지 않는다(모양 차이만 견준다) */
  var JS_JITTER = [
    "// el: 같은 세트로 그린 글 — 글자(음절)마다 통째로",
    "el.querySelectorAll('[part~=\"glyph\"]').forEach((glyph) => {",
    "  const r = Math.random;",
    "  glyph.style.rotate = `${(r() - .5) * 12}deg`;",
    "  glyph.style.translate = `${(r() - .5) * .06}em ${(r() - .5) * .06}em`;",
    "});"
  ].join("\n");
  var jitter = null;
  try {
    /* eslint-disable-next-line no-new-func */
    jitter = new Function("el", JS_JITTER);
  } catch (error) {
    jitter = null;
  }

  /* 짧은 씨앗 이름 — 해석된 숫자 대신 사람이 옮겨 적을 수 있는 네 글자 */
  function shortSeed() {
    var abc = "abcdefghjkmnpqrstuvwxyz23456789";
    var out = "";
    for (var i = 0; i < 4; i += 1) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return out;
  }

  var vary = $("[data-vary]");
  if (vary) {
    var jsRow = $("[data-vary-js]");
    var jsCode = $("[data-vary-js-code]");
    var varyHost = $("[data-vary-host]");
    var seedOut = $("[data-vary-seed]");
    var codeBox = $("[data-vary-code-box]");
    var code = $("#vary-code code");
    jsCode.textContent = JS_JITTER;

    /* 바탕 요소는 화면 가까이 와서야 그려지고, 다시 그리면 글자 노드가 새로 생긴다 — 그릴 때마다 흔든다 */
    var shake = function () {
      if (jitter) jitter(jsRow);
    };
    jsRow.addEventListener("font-kku:render", shake);
    var reseed = function () {
      var seed = shortSeed();
      varyHost.setAttribute("seed", seed);
      seedOut.textContent = seed;
      return seed;
    };

    shake();
    reseed();
    $("[data-vary-reroll]").addEventListener("click", function () {
      shake();
      reseed();
      codeBox.hidden = true;
    });
    $("[data-vary-fix]").addEventListener("click", function (event) {
      var seed = varyHost.getAttribute("seed");
      if (!seed) return;
      code.textContent = '<font-kku font="sebul" jamo-set="my-font" class="k-hand" seed="' + seed +
        '" jamo-seeds>' + (varyHost.dataset.source || "") + "</font-kku>\n" +
        "<!-- my-font는 '내 페이지에 쓰기'의 registerJamo로 등록한 8칸, .k-hand는 위 변주 CSS -->";
      codeBox.hidden = false;
      site.copyText(code.textContent, event.currentTarget);
    });

    // 이름 씨앗 — 세 이름을 다시 그려도 자모 씨앗값이 그대로인지 이 브라우저가 견준다
    var nameForm = $("[data-name-form]");
    var nameInput = nameForm.elements.name;
    var nameHosts = $$("[data-name-host]");
    var nameCheck = $("[data-name-check]");
    var seedsOf = function () { return nameHosts.map(jamoSeeds); };
    var redraw = function () {
      var before = seedsOf();
      nameHosts.forEach(function (nameHost) { FK.refresh(nameHost); });
      nextFrame(function () {
        var after = seedsOf();
        var count = after.reduce(function (sum, seeds) { return sum + (seeds ? seeds.split(",").length : 0); }, 0);
        var same = before.every(function (seeds, i) { return seeds && seeds === after[i]; });
        nameCheck.textContent = same
          ? "✓ 세 이름을 다시 그렸는데 자모 " + count + "개의 씨앗값이 그대로입니다 — 이름이 같으면 언제 그려도 같은 모양이고, 이름이 다르면 모양도 다릅니다."
          : "자모 씨앗값을 읽지 못했습니다.";
      });
    };
    var applyName = function () {
      var name = (nameInput.value || "").trim() || "김폰꾸";
      nameHosts[0].setAttribute("seed", name);
      FK.refresh(nameHosts[0], { text: name });
      nextFrame(redraw);
    };
    nameForm.addEventListener("submit", function (event) { event.preventDefault(); });
    nameInput.addEventListener("input", applyName);
    $("[data-name-redraw]").addEventListener("click", redraw);
    /* 화면 밖 바탕 요소는 가까이 와서야 그려진다 — 셋 다 그려진 뒤에 한 번 견준다 */
    var waiting = nameHosts.length;
    nameHosts.forEach(function (nameHost) {
      var done = function () {
        nameHost.removeEventListener("font-kku:render", done);
        waiting -= 1;
        if (waiting === 0) nextFrame(redraw);
      };
      if (jamoSeeds(nameHost)) done();
      else nameHost.addEventListener("font-kku:render", done);
    });
  }

  // ── 넷: 자모 단위로 칠하고 움직이기 ─────────────────────────────
  var jamoForm = $("[data-jamo-form]");
  if (jamoForm) {
    var jamoInput = jamoForm.elements.text;
    var nfd = $("[data-nfd]");
    var nfdBlock = $("[data-nfd-block]");
    var typing = null;

    var nfdMarkup = function (text) {
      return Array.from(text.normalize("NFD")).map(function (ch) {
        return ch === " " ? " " : "<span>" + escapeHtml(ch) + "</span>";
      }).join("");
    };
    var currentText = function () { return (jamoInput.value || "").trim() || "받침이 톡 떨어진다"; };
    var applyJamo = function () {
      var text = currentText();
      nfd.innerHTML = nfdMarkup(text);
      nfdBlock.innerHTML = nfdMarkup(text);
      $$("[data-jamo-host], [data-fx-tile]").forEach(function (node) {
        if (typing && node.hasAttribute("data-fx-type")) {
          typing.stop();
          typing = null;
        }
        FK.refresh(node, { text: text });
      });
    };
    jamoForm.addEventListener("submit", function (event) { event.preventDefault(); });
    jamoInput.addEventListener("input", applyJamo);
    applyJamo();

    /* 한 번 도는 움직임은 불러올 때 이미 돌았다 — 칸에 커서를 올리면(포커스하면) 다시 돈다. 타자는 처음부터 다시 친다. */
    var again = function (node) {
      if (node.hasAttribute("data-fx-type")) {
        if (!Fx || typeof Fx.type !== "function") return;
        if (typing) typing.stop();
        typing = Fx.type(node, [currentText()], { intro: true, loop: false, firstHold: 200 });
        return;
      }
      if (node.hasAttribute("animate") && Fx && typeof Fx.replay === "function") Fx.replay(node);
    };
    $$(".k-fxtile").forEach(function (tile) {
      var node = tile.querySelector("[data-fx-tile]");
      if (!node) return;
      tile.addEventListener("pointerenter", function () { again(node); });
      tile.addEventListener("focus", function () { again(node); });
    });
    var replayHost = $("[data-jamo-replay]");
    if (replayHost) {
      replayHost.parentNode.addEventListener("pointerenter", function () { again(replayHost); });
    }
    var typeTile = $("[data-fx-type]");
    if (typeTile && Fx && typeof Fx.type === "function" && "IntersectionObserver" in window) {
      var seen = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          seen.disconnect();
          again(typeTile);
        }
      }, { threshold: 0.6 });
      seen.observe(typeTile);
    }
  }

  // ── 덤: 사례 ──────────────────────────────────────────────────
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
        }).join('<span aria-hidden="true">\u00a0· </span>');
        caseLinks.hidden = false;
      }
    }).catch(function () {
      casesMount.innerHTML = '<p class="k-note">사례 목록을 불러오지 못했습니다. <a href="./showcase.html">사례 페이지</a>에서 보세요.</p>';
    });
  }
})();
