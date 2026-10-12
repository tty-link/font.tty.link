/* 소개의 '이럴 때 폰꾸' — 문제 카드 거르기와 증명 데모.
 *
 * 데모: 글꼴이 막힐 때(웹폰트 차단·한글 글꼴 없는 기기) · 매번 다른 글꼴(씨앗값 변주,
 * 이름 씨앗, 뽑기→고정) · 빈 글자 검사(완성형 2,350자 밖 음절) · 글꼴 파일 계기판 ·
 * 마크다운 → 텍스트 · AI로 세 번 · 이미지 대신 텍스트.
 *
 * 숫자는 모두 이 브라우저가 잰 값이다(Resource Timing, TextDecoder, 자모 씨앗값). 실제로
 * 재현할 수 없는 장면(웹폰트를 받았을 때, 한글 글꼴이 없는 기기, AI가 실행마다 고르는
 * 글꼴)은 화면에 '흉내'라고 밝힌다. */
(function () {
  "use strict";

  var FK = window.FontKku;
  var site = window.FontKkuSite;
  var root = document.getElementById("problems");
  if (!root || !FK) return;

  function $(selector, scope) { return (scope || root).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || root).querySelectorAll(selector)); }
  function nextFrame(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }

  /* 자모 노드마다 걸린 씨앗값(jamo-seeds) — 두 바탕 요소가 같은 모양인지 견줄 때 쓴다. */
  function jamoSeeds(host) {
    return $$("[data-jamo]", host).map(function (node) {
      return node.style.getPropertyValue("--fy-jamo-seed");
    }).join(",");
  }

  // ── 문제 카드: 내 상황으로 거르기, 대표만/모두 ─────────────────
  var cards = $$("[data-probs] .k-prob");
  var moreButton = $("[data-probs-more]");
  var role = "all";
  var expanded = false;

  function applyRole() {
    cards.forEach(function (card) {
      var roles = card.getAttribute("data-roles").split(/\s+/);
      var match = role === "all" || roles.indexOf(role) !== -1;
      card.hidden = !match || (role === "all" && !expanded && !card.hasAttribute("data-featured"));
    });
    moreButton.parentNode.hidden = role !== "all";
    moreButton.setAttribute("aria-expanded", String(expanded));
    moreButton.textContent = expanded ? "대표 문제만 보기" : "문제 " + cards.length + "가지 모두 보기";
  }

  $("[data-roles]").addEventListener("click", function (event) {
    var button = event.target.closest("[data-role]");
    if (!button) return;
    role = button.getAttribute("data-role");
    $$("[data-role]").forEach(function (other) {
      other.setAttribute("aria-pressed", String(other === button));
    });
    applyRole();
  });
  moreButton.addEventListener("click", function () {
    expanded = !expanded;
    applyRole();
  });
  applyRole();

  // ── 증명 탭 ───────────────────────────────────────────────
  var INIT = {};
  var tabs = $$("[data-proof-tab]");
  var panels = {};
  var opened = {};
  $$("[data-proof-panel]").forEach(function (panel) {
    panels[panel.getAttribute("data-proof-panel")] = panel;
  });

  function selectProof(name, focus) {
    if (!panels[name]) return;
    tabs.forEach(function (tab) {
      var on = tab.getAttribute("data-proof-tab") === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
    });
    Object.keys(panels).forEach(function (key) {
      panels[key].hidden = key !== name;
    });
    if (!opened[name] && INIT[name]) {
      opened[name] = true;
      INIT[name]();
    }
  }

  $(".k-proof .k-tabs").addEventListener("click", function (event) {
    var tab = event.target.closest("[data-proof-tab]");
    if (tab) selectProof(tab.getAttribute("data-proof-tab"));
  });
  $(".k-proof .k-tabs").addEventListener("keydown", function (event) {
    var index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    var next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectProof(tabs[(next + tabs.length) % tabs.length].getAttribute("data-proof-tab"), true);
  });
  // 카드·기둥의 '직접 해 보기'는 해당 데모 탭을 연다(스크롤은 #proof 앵커가 맡는다)
  root.addEventListener("click", function (event) {
    var link = event.target.closest("[data-proof]");
    if (link) selectProof(link.getAttribute("data-proof"));
  });

  // ── ① 글꼴이 막힐 때 ──────────────────────────────────────
  INIT.block = function () {
    var webSwitch = $('[data-block="webfont"]');
    var hangulSwitch = $('[data-block="hangul"]');
    var title = $("[data-wf-title]");
    var titleStatus = $("[data-wf-status]");
    var host = $("[data-block-host]");
    var hostStatus = $("[data-kku-status]");
    var original = title.textContent;
    var probe = FK.hasHangulFont();
    $("[data-device-hangul]").textContent = probe === false ? "없습니다" : probe === null ? "확인할 수 없습니다" : "있습니다";

    function apply() {
      var blocked = webSwitch.checked;
      var noHangul = hangulSwitch.checked;
      title.classList.toggle("is-blocked", blocked);
      // 한글 글꼴이 없는 기기의 빈 네모(두부)는 흉내다 — 이 기기에는 한글 글꼴이 있다
      title.textContent = noHangul ? original.replace(/[가-힣]/g, "□") : original;
      titleStatus.textContent = noHangul
        ? "한글을 그릴 글꼴이 없어 빈 네모로 보입니다(흉내)"
        : blocked
          ? "웹폰트를 받지 못해 기본 글꼴로 바뀌었습니다"
          : "웹폰트를 받았을 때의 모습(기기 글꼴로 흉내)";
      var font = noHangul ? "crayon" : "sticker";
      if (host.getAttribute("font") !== font) host.setAttribute("font", font);
      hostStatus.textContent = noHangul
        ? "그림 자소 글꼴(crayon)로 바꿔 SVG 자소판으로 그립니다"
        : blocked
          ? "웹폰트가 막혀도 기기 글꼴을 재료로 그대로 그립니다"
          : "기기 한글 글꼴을 재료로 조립해 그립니다";
    }
    webSwitch.addEventListener("change", apply);
    hangulSwitch.addEventListener("change", apply);
    apply();
  };

  // ── ② 매번 다른 글꼴 — 한 번 받은 것으로 섞기 ───────────────────
  /* '하' 다섯 개를 저마다 다른 조합으로 그린다. 글꼴은 정본의 글꼴 전부에서 고르고, 이 페이지가
   * 아직 받지 않은 글꼴은 런타임이 그 CSS 한 장만 그때 받는다(필요할 때 받기, ADR-019). 꾸밈·움직임은
   * 한 줄 설치의 확장(data-addons)이다. 축 목록·이름·권장 바탕은 정본(spec/themes.json → themes-data.js).
   *   모두 섞기  글자마다 글꼴·꾸밈·변주·움직임을 새로 뽑는다
   *   씨앗만     조합 하나를 다섯 글자가 함께 쓰고 씨앗만 다르다 — 같은 조합, 다른 자모 */
  (function () {
    var T = window.FontKkuThemes;
    var card = $("[data-pillar-mix]");
    if (!T || !card) return;
    var tiles = $("[data-pillar-tiles]", card);
    var note = $("[data-pillar-note]", card);
    var loader = document.querySelector("script[data-fonts]");
    var addons = loader ? (loader.getAttribute("data-addons") || "").split(/\s+/) : [];
    var FONTS = Object.keys(T.fonts).filter(function (id) { return T.fonts[id].group !== "starter"; });
    var LOOKS = addons.indexOf("looks") !== -1 ? Object.keys(T.looks) : [];
    var VARY = addons.indexOf("looks") !== -1 ? Object.keys(T.variations) : [];
    var MOTIONS = Object.keys(T.motions).filter(function (id) {
      var m = T.motions[id];
      return m.play !== "scroll" && (m.source === "core" || addons.indexOf("motion") !== -1);
    });
    var mode = "all";

    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
    function some(list, max) {
      var pool = list.slice();
      var out = [];
      var n = 1 + Math.floor(Math.random() * max);
      while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      return out;
    }
    function sprite(font) { return T.fonts[font].group !== "system"; }
    /* 변주는 재료가 받는 것만 — 굵기는 기기 글꼴만(그림 자소는 자소판이 획을 정한다) */
    function varyFor(font) {
      return VARY.filter(function (id) {
        var materials = T.variations[id].materials;
        return !materials || materials.indexOf(sprite(font) ? "sprite" : "system") !== -1;
      });
    }
    /* 첫 섞기는 이미 받은 기기 글꼴 안에서 — 첫 화면이 그림 자소판을 여럿 받지 않게. '다시 섞기'부터는
     * 모든 글꼴에서 고르고, 처음 쓰는 글꼴은 그때 CSS 한 장(그림 자소면 자소판도)을 받는다. */
    var firstRound = true;
    function combo() {
      var font = pick(firstRound ? FONTS.filter(function (id) { return T.fonts[id].group === "system"; }) : FONTS);
      return {
        font: font,
        look: Math.random() < 0.7 ? pick(LOOKS) || "" : "",
        vary: some(varyFor(font), 3),
        motion: Math.random() < 0.45 ? pick(MOTIONS) || "" : ""
      };
    }
    function tone(c) {
      return (c.look ? T.looks[c.look].tone : T.fonts[c.font].tone) || "light";
    }
    function caption(c) {
      var first = T.fonts[c.font].name + (c.look ? " · " + T.looks[c.look].name : "");
      var second = c.vary.map(function (id) { return T.variations[id].name; })
        .concat(c.motion ? [T.motions[c.motion].name] : []).join("·");
      return '<strong>' + first + "</strong>" + (second ? "<span>" + second + "</span>" : "");
    }
    function tile(c) {
      var classes = (c.look ? ["kku-look-" + c.look] : []).concat(c.vary.map(function (id) { return "kku-vary-" + id; }));
      var t = tone(c);
      return '<figure class="k-mixtile"' + (t === "light" ? "" : ' data-tone="' + t + '"') + ">" +
        '<font-kku font="' + c.font + '"' + (classes.length ? ' class="' + classes.join(" ") + '"' : "") +
        ' seed="auto" jamo-seeds' + (c.motion ? ' animate="' + c.motion + '"' : "") + ' size="clamp(40px, 5.2vw, 62px)">하</font-kku>' +
        "<figcaption>" + caption(c) + "</figcaption></figure>";
    }
    /* 씨앗만: 조합 하나(색이 자모마다 갈리는 꾸밈, 재료가 받는 변주 전부, 움직임 없음)를 다섯 글자가 쓴다 */
    var COLOURFUL = ["saekdong", "sticker", "pastel", "riso", "neon"].filter(function (id) { return LOOKS.indexOf(id) !== -1; });
    function seedCombo() {
      var font = pick(firstRound ? FONTS.filter(function (id) { return T.fonts[id].group === "system"; }) : FONTS);
      return { font: font, look: pick(COLOURFUL) || "", vary: varyFor(font), motion: "" };
    }
    var shared = null;
    function shuffle() {
      shared = mode === "seed" ? seedCombo() : null;
      var list = [];
      for (var i = 0; i < 5; i += 1) list.push(shared || combo());
      tiles.setAttribute("data-mode", mode);
      tiles.innerHTML = list.map(tile).join("");
      if (shared) {
        /* 다른 것은 바탕 요소마다 새로 뽑힌 씨앗값뿐이다 — 그려진 뒤(연결될 때 바로 그린다) 자막을 씨앗값으로 */
        nextFrame(function () {
          $$("font-kku", tiles).forEach(function (host) {
            var cap = host.parentNode.querySelector("figcaption");
            if (cap && host.dataset.fySeed) cap.innerHTML = "<strong>씨앗 " + Number(host.dataset.fySeed).toFixed(3) + "</strong>";
          });
        });
      }
      writeNote();
      firstRound = false;
    }

    /* 받은 것은 섞을 때마다 늘 수 있다 — 처음 쓰는 글꼴의 CSS가 도착하면(그리기 이벤트) 다시 센다. */
    var noteTimer = 0;
    function writeNote() {
      var fontCss = $$('link[rel="stylesheet"]', document).filter(function (link) { return /\/profiles\/[^/]+\.css$/.test(link.href); }).length;
      var addonCss = $$('link[rel="stylesheet"]', document).filter(function (link) { return /\/font-kku-(looks|motion)\.css$/.test(link.href); }).length;
      var received = "지금까지 받은 것: 스크립트 1 · 글꼴 CSS " + fontCss + "장 · 확장 CSS " + addonCss + "장 — 글꼴 파일 0개. 처음 쓰는 글꼴은 그때 CSS 한 장만 더 받습니다. ";
      note.textContent = shared
        ? received + "다섯 글자 모두 " + T.fonts[shared.font].name + (shared.look ? " · " + T.looks[shared.look].name : "") +
          " · 변주 " + shared.vary.map(function (id) { return T.variations[id].name; }).join("·") + " — 다른 것은 씨앗값뿐입니다."
        : received + "글꼴 " + FONTS.length + " × 꾸밈 " + (LOOKS.length + 1) + " × 변주 " + VARY.length +
          " × 움직임 " + (MOTIONS.length + 1) + "을 글자마다 섞습니다.";
    }
    tiles.addEventListener("font-kku:render", function () {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(writeNote, 200);
    });

    $("[data-pillar-reseed]", card).addEventListener("click", shuffle);
    $$("[data-pillar-mode]", card).forEach(function (button) {
      button.addEventListener("click", function () {
        mode = button.getAttribute("data-pillar-mode");
        $$("[data-pillar-mode]", card).forEach(function (other) { other.setAttribute("aria-pressed", String(other === button)); });
        shuffle();
      });
    });
    shuffle();
  })();

  INIT.seed = function () {
    var host = $("[data-seed-host]");
    var stage = $("[data-seed-stage]");
    var valueOut = $("[data-seed-value]");
    var codeBox = $("[data-seed-code-box]");
    var code = $("#seed-code code");
    var nameForm = $("[data-name-form]");
    var nameInput = nameForm.elements.name;
    var nameHosts = $$("[data-name-host]");
    var nameStages = $$("[data-name-stage]");
    var nameCheck = $("[data-name-check]");
    var font = "malang";
    var tone = "";

    function showSeed() {
      valueOut.textContent = host.dataset.fySeed || "—";
    }
    function setTone(node) {
      if (tone) node.setAttribute("data-tone", tone);
      else node.removeAttribute("data-tone");
    }
    function checkNames() {
      nextFrame(function () {
        var a = jamoSeeds(nameHosts[0]);
        var b = jamoSeeds(nameHosts[1]);
        nameCheck.textContent = a && a === b
          ? "✓ 두 번 따로 그렸는데 자모 " + a.split(",").length + "개의 씨앗값이 모두 같습니다 — 언제 그려도 같은 모양입니다."
          : "자모 씨앗값을 읽지 못했습니다.";
      });
    }
    function applyName() {
      var name = (nameInput.value || "").trim() || "김폰꾸";
      nameHosts.forEach(function (nameHost) {
        nameHost.setAttribute("font", font);
        nameHost.setAttribute("seed", name);
        FK.refresh(nameHost, { text: name });
      });
      checkNames();
    }

    $("[data-seed-fonts]").addEventListener("click", function (event) {
      var button = event.target.closest("[data-seed-font]");
      if (!button) return;
      font = button.getAttribute("data-seed-font");
      tone = button.getAttribute("data-seed-tone") || "";
      $$("[data-seed-font]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      host.setAttribute("font", font);
      codeBox.hidden = true; // 고정 코드는 고른 글꼴이 바뀌면 다시 만든다
      setTone(stage);
      nameStages.forEach(setTone);
      applyName();
      nextFrame(showSeed);
    });
    $("[data-seed-reroll]").addEventListener("click", function () {
      host.setAttribute("seed", "auto");
      FK.refresh(host);
      codeBox.hidden = true;
      nextFrame(showSeed);
    });
    $("[data-seed-fix]").addEventListener("click", function (event) {
      var seed = host.dataset.fySeed;
      if (!seed) return;
      // 해석된 숫자를 그대로 적으면 같은 모양으로 고정된다
      host.setAttribute("seed", seed);
      var text = host.dataset.source || "";
      code.textContent = '<font-kku font="' + font + '" seed="' + seed + '" jamo-seeds>' + text + "</font-kku>";
      codeBox.hidden = false;
      site.copyText(code.textContent, event.currentTarget);
      showSeed();
    });
    nameForm.addEventListener("submit", function (event) { event.preventDefault(); });
    nameInput.addEventListener("input", applyName);
    applyName();
    nextFrame(showSeed);
  };

  // ── ③ 빈 글자 검사 ────────────────────────────────────────
  var KS_X_1001 = null;
  /* 완성형 2,350자: EUC-KR 0xB0A1–0xC8FE를 이 브라우저의 디코더로 풀어 만든다. */
  function completeSet() {
    if (KS_X_1001) return KS_X_1001;
    var bytes = [];
    for (var hi = 0xb0; hi <= 0xc8; hi += 1) {
      for (var lo = 0xa1; lo <= 0xfe; lo += 1) bytes.push(hi, lo);
    }
    var text = new TextDecoder("euc-kr").decode(new Uint8Array(bytes));
    KS_X_1001 = new Set(Array.from(text).filter(function (ch) { return ch >= "가" && ch <= "힣"; }));
    return KS_X_1001;
  }

  INIT.missing = function () {
    var form = $("[data-missing-form]");
    var input = form.elements.text;
    var summary = $("[data-missing-summary]");
    var subset = $("[data-missing-subset]");
    var host = $("[data-missing-host]");
    var set;
    try {
      set = completeSet();
    } catch (error) {
      summary.textContent = "이 브라우저는 EUC-KR 디코더가 없어 2,350자 집합을 만들 수 없습니다.";
      return;
    }

    function apply() {
      var text = input.value || "";
      var missing = [];
      subset.textContent = "";
      Array.from(text).forEach(function (ch) {
        var out = ch >= "가" && ch <= "힣" && !set.has(ch);
        if (out && missing.indexOf(ch) === -1) missing.push(ch);
        if (out) {
          var mark = document.createElement("span");
          mark.className = "k-subset-miss";
          mark.textContent = ch;
          subset.appendChild(mark);
        } else {
          subset.appendChild(document.createTextNode(ch));
        }
      });
      summary.textContent = missing.length
        ? "완성형 " + set.size.toLocaleString("ko-KR") + "자 밖 글자 " + missing.length + "개: " + missing.join(" ") + " — 서브셋 웹폰트였다면 이 글자만 다른 글꼴로 나옵니다."
        : "모두 완성형 " + set.size.toLocaleString("ko-KR") + "자 안의 글자입니다. 아래 예시 글자를 넣어 보세요.";
      FK.refresh(host, { text: text.trim() || " " });
    }
    $("[data-missing-examples]").addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) return;
      if (input.value.length + 2 <= input.maxLength) input.value = (input.value.trim() + " " + button.textContent).trim();
      apply();
    });
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    input.addEventListener("input", apply);
    apply();
  };

  // ── ④ 글꼴 파일 계기판 ────────────────────────────────────
  var FONT_FILE = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;

  function kb(bytes) {
    return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(2) + "MB" : (bytes / 1024).toFixed(1) + "KB";
  }
  /* 전송 크기(압축 포함). 캐시에서 읽으면 transferSize가 0이라 본문 크기로 대신하고 표시한다. */
  function measureEntry(entry) {
    if (entry.transferSize > 0) return { bytes: entry.transferSize, cached: false, known: true };
    if (entry.encodedBodySize > 0) return { bytes: entry.encodedBodySize, cached: true, known: true };
    return { bytes: 0, cached: false, known: false };
  }

  function measure() {
    var groups = { runtime: [], base: [], css: [], svg: [], addons: [], font: [] };
    var seen = {};
    performance.getEntriesByType("resource").forEach(function (entry) {
      // gzip 실측용으로 이 스크립트가 다시 받은 fetch는 빼고, 같은 주소는 처음 것만 센다
      if (entry.initiatorType === "fetch" || seen[entry.name]) return;
      seen[entry.name] = true;
      var path;
      try { path = new URL(entry.name, location.href).pathname; } catch (error) { return; }
      if (FONT_FILE.test(path)) groups.font.push(entry);
      else if (/\/font-kku\.js$/.test(path)) groups.runtime.push(entry);
      else if (/\/font-kku\.css$/.test(path)) groups.base.push(entry);
      else if (/\/profiles\/[^/]+\.css$/.test(path)) groups.css.push(entry);
      else if (/\/profiles\/[^/]+\.svg$/.test(path)) groups.svg.push(entry);
      else if (/\/font-kku-(?:looks|motion)(?:\.min)?\.css$|\/font-kku-fx(?:\.min)?\.js$/.test(path)) groups.addons.push(entry);
    });
    function sum(list) {
      return list.reduce(function (acc, entry) {
        var m = measureEntry(entry);
        acc.bytes += m.bytes;
        acc.cached = acc.cached || m.cached;
        acc.known = acc.known && m.known;
        // 본문을 압축해 받았는지: 받은 본문(encoded)이 푼 본문(decoded)보다 작으면 압축
        if (entry.encodedBodySize > 0 && entry.encodedBodySize === entry.decodedBodySize) acc.raw = true;
        acc.urls.push(entry.name);
        return acc;
      }, { bytes: 0, cached: false, known: true, raw: false, count: list.length, urls: [] });
    }
    var fonts = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-fy-upgraded="true"]'), function (host) {
      if (host.dataset.fyFont) fonts[host.dataset.fyFont] = true;
    });
    var parts = { runtime: sum(groups.runtime), base: sum(groups.base), css: sum(groups.css), svg: sum(groups.svg),
      addons: sum(groups.addons) };
    var total = { bytes: 0, cached: false, known: true, raw: false, count: 0 };
    Object.keys(parts).forEach(function (key) {
      total.bytes += parts[key].bytes;
      total.count += parts[key].count;
      total.cached = total.cached || parts[key].cached;
      total.known = total.known && parts[key].known;
      total.raw = total.raw || parts[key].raw;
    });
    // 잰 항목이 하나도 없으면(파일로 연 페이지 등) 0이 아니라 '잴 수 없음'이다
    total.known = total.known && total.count > 0;
    return { fontFiles: groups.font.length, fontCount: Object.keys(fonts).length, parts: parts, total: total };
  }

  /* 같은 파일을 이 브라우저가 gzip으로 직접 압축해 본 크기(CompressionStream). 압축 없이
   * 보내는 서버에서도 CDN처럼 압축해 보낼 때의 크기를 실측으로 보여 준다. */
  var GZIP = {};
  function gzipSize(url) {
    if (GZIP[url]) return GZIP[url];
    GZIP[url] = fetch(url, { cache: "force-cache" }).then(function (response) {
      if (!response.ok) throw new Error(String(response.status));
      return response.blob();
    }).then(function (blob) {
      return new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    }).then(function (buffer) {
      return buffer.byteLength;
    });
    return GZIP[url];
  }
  function gzipSum(urls) {
    return Promise.all(urls.map(gzipSize)).then(function (sizes) {
      return sizes.reduce(function (a, b) { return a + b; }, 0);
    });
  }

  function label(part, measurable) {
    if (!measurable) return "잴 수 없음";
    if (!part.count) return "없음";
    if (!part.known) return "잴 수 없음";
    return kb(part.bytes) + (part.cached ? " (캐시됨)" : "");
  }

  var meterRun = 0;
  function renderMeter() {
    var m = measure();
    var run = ++meterRun;
    $$("[data-meter-fontfiles]").forEach(function (node) { node.textContent = String(m.fontFiles); });
    $$("[data-meter-fontcount]").forEach(function (node) { node.textContent = String(m.fontCount); });
    var set = function (selector, text) { var node = $(selector); if (node) node.textContent = text; };
    set("[data-meter-runtime]", label(m.parts.runtime, m.total.known));
    set("[data-meter-base]", label(m.parts.base, m.total.known));
    set("[data-meter-css]", label(m.parts.css, m.total.known));
    set("[data-meter-css-count]", String(m.parts.css.count));
    set("[data-meter-svg]", label(m.parts.svg, m.total.known));
    set("[data-meter-svg-count]", String(m.parts.svg.count));
    set("[data-meter-addons]", label(m.parts.addons, m.total.known));
    set("[data-meter-addons-count]", String(m.parts.addons.count));
    var totalText = m.total.known ? kb(m.total.bytes) + (m.total.cached ? " (캐시 포함)" : "") : "잴 수 없음";
    set("[data-meter-total]", totalText);
    set("[data-meter-raw]", m.total.raw
      ? "이 서버는 파일을 압축하지 않고 보냈습니다."
      : m.total.known ? "이 서버는 파일을 압축해 보냈습니다." : "");
    var summary = m.total.known
      ? "지금까지 브라우저가 잰 폰꾸 전송량은 런타임·CSS·자소판·확장을 합쳐 " + totalText + (m.total.raw ? "(압축 없이 받음)" : "") + "입니다."
      : "";
    set("[data-meter-summary]", summary);
    if (!window.CompressionStream || !m.total.known) {
      set("[data-meter-gzip]", window.CompressionStream ? "잴 수 없음" : "이 브라우저는 압축을 잴 수 없음");
      return;
    }
    var keys = ["runtime", "base", "css", "svg", "addons"];
    Promise.all(keys.map(function (key) { return gzipSum(m.parts[key].urls); })).then(function (sizes) {
      if (run !== meterRun) return;
      var gz = sizes.reduce(function (a, b) { return a + b; }, 0);
      set("[data-meter-gzip]", kb(gz));
      keys.forEach(function (key, i) {
        set('[data-meter-gz="' + key + '"]', m.parts[key].count ? "gzip " + kb(sizes[i]) : "");
      });
      if (m.total.raw) set("[data-meter-summary]", summary + " 같은 파일을 gzip으로 압축해 보내면 " + kb(gz) + "입니다(이 브라우저가 직접 압축해 잰 값).");
    }, function () {
      if (run === meterRun) set("[data-meter-gzip]", "잴 수 없음");
    });
  }

  var meterTimer = 0;
  function scheduleMeter() {
    clearTimeout(meterTimer);
    meterTimer = setTimeout(renderMeter, 250);
  }
  if (window.PerformanceObserver) {
    try {
      new PerformanceObserver(scheduleMeter).observe({ type: "resource", buffered: true });
    } catch (error) {
      window.addEventListener("load", scheduleMeter);
    }
  }
  window.addEventListener("load", scheduleMeter);
  $("[data-meter-again]").addEventListener("click", renderMeter);

  // ── ⑤ 마크다운 → 텍스트 ───────────────────────────────────
  var MD_SAMPLE = [
    "# 이번 주 배포 보고",
    "배포가 **무사히 끝났습니다**. 바뀐 점을 정리합니다.",
    "",
    "## 새 글꼴 여섯 종",
    "- 금박, 글리치, 리소, 도면",
    "- 크레용과 자수는 SVG 자소판으로 그립니다",
    "",
    "**다음 주에 또 만나요**",
    "",
    "> 문의는 [폰꾸 문서](https://example.com/docs)로"
  ].join("\n");

  function stripInline(text) {
    return text.replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
  }

  function inlineText(line, options) {
    return line
      .replace(/\*\*(.+?)\*\*|__(.+?)__/g, function (_, a, b) {
        return options.inline ? "「" + (a || b) + "」" : (a || b);
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/`([^`]+)`/g, "$1");
  }

  /* 제목과 굵게만 있는 줄은 2줄 평문으로 크게, 나머지 줄은 그대로. */
  function markdownToText(source, options) {
    var out = [];
    var fenced = false;
    function big(text) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      FK.renderText(text).forEach(function (line) { out.push(line.replace(/　+$/, "")); });
      out.push("");
    }
    source.replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      if (/^\s*```/.test(line)) {
        fenced = !fenced;
        out.push(line);
        return;
      }
      if (fenced) {
        out.push(line);
        return;
      }
      var heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading && options.heading) {
        big(stripInline(heading[2]));
        return;
      }
      var bold = /^\s*(\*\*|__)(.+?)\1\s*$/.exec(line);
      if (bold && options.boldline) {
        big(stripInline(bold[2]));
        return;
      }
      if (line === "" && out[out.length - 1] === "") return;
      out.push(inlineText(line, options));
    });
    while (out.length && out[out.length - 1] === "") out.pop();
    var text = out.join("\n");
    return options.fence ? "```\n" + text + "\n```" : text;
  }

  INIT.md = function () {
    var input = $("[data-md-input]");
    var output = $("[data-md-output]");
    input.value = MD_SAMPLE;
    function options() {
      var opts = {};
      $$("[data-md-opt]").forEach(function (box) { opts[box.getAttribute("data-md-opt")] = box.checked; });
      return opts;
    }
    function apply() {
      output.textContent = markdownToText(input.value, options());
    }
    input.addEventListener("input", apply);
    $$("[data-md-opt]").forEach(function (box) { box.addEventListener("change", apply); });
    $("[data-md-download]").addEventListener("click", function () {
      var blob = new Blob([output.textContent + "\n"], { type: "text/plain;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "폰꾸-텍스트.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
    apply();
  };

  // ── ⑥ AI로 세 번 ──────────────────────────────────────────
  INIT.ai3 = function () {
    var hosts = $$("[data-ai3-host]");
    var check = $("[data-ai3-check]");
    var buttons = $$("[data-ai3]");
    function report(mode) {
      nextFrame(function () {
        var seeds = hosts.map(jamoSeeds);
        var same = seeds.every(function (value) { return value && value === seeds[0]; });
        check.textContent = mode === "fixed"
          ? (same ? "✓ 세 번 모두 자모 씨앗값이 같습니다 — 다시 만들어도 같은 모양입니다." : "씨앗값을 읽지 못했습니다.")
          : (same ? "세 번이 같게 나왔습니다. 한 번 더 눌러 보세요." : "✓ 일부러 매번 새로 — 세 번의 자모 씨앗값이 서로 다릅니다.");
      });
    }
    $("[data-ai3-seed]").addEventListener("click", function (event) {
      var button = event.target.closest("[data-ai3]");
      if (!button) return;
      var mode = button.getAttribute("data-ai3");
      buttons.forEach(function (other) { other.setAttribute("aria-checked", String(other === button)); });
      hosts.forEach(function (host) {
        host.setAttribute("seed", mode === "fixed" ? "menu-1" : "auto");
        FK.refresh(host);
      });
      report(mode);
    });
    report("fixed");
  };

  // ── ⑦ 이미지 대신 텍스트 ──────────────────────────────────
  INIT.text = function () {
    var form = $("[data-text-form]");
    var input = form.elements.text;
    var host = $("[data-text-host]");
    var read = $("[data-text-read]");
    var canvas = $("[data-text-canvas]");
    var note = $("[data-text-image-note]");
    var imageText = "";

    /* 처음 문구로 한 번만 '이미지 배너'를 굽는다 — 이미지는 문구를 고쳐도 그대로다. */
    function bake(text) {
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var width = 560;
      var height = 140;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      var ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.fillStyle = "#12121c";
      ctx.fillRect(0, 0, width, height);
      var size = 60;
      ctx.font = "900 " + size + 'px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
      while (ctx.measureText(text).width > width - 40 && size > 24) {
        size -= 2;
        ctx.font = "900 " + size + 'px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#6b4510";
      ctx.fillText(text, width / 2, height / 2 + 3);
      ctx.fillStyle = "#f0c75e";
      ctx.fillText(text, width / 2, height / 2);
      canvas.setAttribute("aria-label", "배너 이미지: " + text);
      imageText = text;
    }

    function apply() {
      var text = (input.value || "").trim() || "가을 신메뉴 출시";
      FK.refresh(host, { text: text });
      read.textContent = host.dataset.source || text;
      note.textContent = text === imageText
        ? "이미지 속 글자는 고치려면 다시 그려야 합니다. 화면 읽기에는 대체 문구만 전해집니다."
        : "이미지는 아직 '" + imageText + "' 그대로입니다 — 고치려면 이미지를 다시 만들어야 합니다.";
    }
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    input.addEventListener("input", apply);
    bake((input.value || "").trim() || "가을 신메뉴 출시");
    apply();
  };

  selectProof("block");
})();
