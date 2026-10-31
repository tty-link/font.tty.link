/* 움직임 페이지 — 카드마다 견본을 꽂고, 그 견본을 '코드 복사'용 HTML 한 장으로 만든다.
 *
 * 카드 한 장은 effects.html 안의 조각들이다.
 *   <template data-fx-html> (카드 안)       견본 마크업. 무대([data-fx-stage])에 꽂는다
 *   <style data-fx-css="<id>">              카드에 따로 필요한 CSS(있을 때만)
 *   <script type="text/plain" data-fx-js>   카드에 따로 필요한 JS(있을 때만). 견본을 꽂은 뒤 실행한다
 * 움직임(animate)과 상호작용(data-kku-fx)은 확장이 맡으므로 대개 마크업 한 줄이다. 복사하는
 * 코드도 같은 조각이라 화면의 견본과 가져가는 코드가 어긋나지 않는다.
 *
 * 카드 속성: data-fx-fonts(한 줄 설치에 적을 글꼴 — 글꼴을 비운 기본 세벌식도 sebul),
 * data-fx-addons(한 줄 설치의 data-addons), data-fx-jamo-sets(벡터 자소 모듈), data-fx-ai-set(견본이 쓰는
 * AI 8칸 세트 — landing-ai-sets.js가 이 페이지에 등록한 것. 복사하는 코드에는 그 등록 코드를 넣는다),
 * data-fx-replay(한 번 도는 움직임 — '다시 재생' 단추를 달고 화면에 들어올 때 처음부터 돌린다. 값이 "class"면
 * 견본의 is-playing 클래스로 돌리는 조리법 카드), data-fx-fixed-text('내 문장으로 보기'를 받지 않는 카드 —
 * 타자 문장·움직임 이름·자모 목록처럼 견본 글이 곧 보여 줄 것일 때). */
(function () {
  "use strict";

  window.FontKkuDemo.renderNav("effects");
  var site = window.FontKkuSite;
  var sets = window.FontKkuLandingSets;
  var cards = Array.prototype.slice.call(document.querySelectorAll("[data-fx]"));

  /* 앞뒤 빈 줄을 떼고 공통 들여쓰기를 걷어 낸다. */
  function dedent(text) {
    var lines = String(text).replace(/\t/g, "  ").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var indent = lines.reduce(function (min, line) {
      if (!line.trim()) return min;
      return Math.min(min, line.match(/^ */)[0].length);
    }, Infinity);
    return lines.map(function (line) { return line.slice(indent === Infinity ? 0 : indent); }).join("\n");
  }

  function indent(text, pad) {
    return text.split("\n").map(function (line) { return line ? pad + line : line; }).join("\n");
  }

  function piece(selector) {
    var node = document.querySelector(selector);
    return node ? dedent(node.textContent) : "";
  }

  function hostsIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll("font-kku, .font-kku"));
  }

  /* 견본 마크업. text가 있으면 바탕 요소의 글만 그 문장으로 바꾼다 — 화면의 견본과 같은 글이 복사된다.
   * 틀(template)의 문서는 그리지 않는 문서라 여기서 만든 바탕 요소는 그려지지 않는다. */
  function sampleHtml(card, text) {
    var template = card.querySelector("template[data-fx-html]");
    if (!text) return dedent(template.innerHTML);
    var box = template.content.ownerDocument.createElement("div");
    box.appendChild(template.content.cloneNode(true));
    hostsIn(box).forEach(function (host) {
      host.textContent = text;
      wrapByGlyph(host);
    });
    return dedent(box.innerHTML);
  }

  /* 방문자 문장은 띄어 쓰지 않은 긴 낱말일 수 있다 — 낱말 단위 줄바꿈(기본)이면 카드 밖으로 밀어내므로 글자 단위로 바꾼다 */
  function wrapByGlyph(host) {
    host.setAttribute(host.localName === "font-kku" ? "wrap-unit" : "data-wrap-unit", "glyph");
  }

  function literal(value) {
    return "{ " + Object.keys(value).map(function (key) { return key + ": " + JSON.stringify(value[key]); }).join(", ") + " }";
  }

  /* AI 8칸 세트의 등록 코드 — 이 페이지가 등록한 답의 칸 그대로(landing-ai-sets.js). */
  function setCode(name) {
    var set = sets && sets.byId(name);
    var answer = set && sets.read(set);
    if (!answer) return "";
    return [
      "<script>",
      "  /* 8칸 그림 세트 「" + set.feel + "」 — 소개(https://font.tty.link/#ai-answers)에 실은 AI 답을 고치지 않고 옮겼다.",
      "     원형 8칸만 그렸고 나머지 자모는 폰꾸가 조립한다. 내 세트로 바꾸려면 칸만 바꾼다 */",
      '  FontKku.registerJamo("' + name + '", {',
      Object.keys(answer.cells).map(function (key) {
        return "    " + JSON.stringify(key) + ": " + literal(answer.cells[key]);
      }).join(",\n"),
      "  }, " + literal(answer.options) + ");",
      "</" + "script>"
    ].join("\n");
  }

  /* 가져가서 그대로 여는 HTML 한 장 — 런타임은 jsDelivr 주소로. */
  function snippet(card, text) {
    var id = card.getAttribute("data-fx");
    var css = piece('style[data-fx-css="' + id + '"]');
    var js = piece('script[data-fx-js="' + id + '"]');
    var html = sampleHtml(card, text);
    var jamoSets = card.getAttribute("data-fx-jamo-sets");
    var aiSet = card.getAttribute("data-fx-ai-set");
    var addons = card.getAttribute("data-fx-addons");
    var out = [
      "<!doctype html>",
      '<meta charset="utf-8">',
      '<script src="' + site.RUNTIME + '" data-fonts="' + card.getAttribute("data-fx-fonts") + '"' +
        (addons ? ' data-addons="' + addons + '"' : "") +
        (jamoSets ? ' data-jamo-sets="' + jamoSets + '"' : "") + "></" + "script>"
    ];
    if (aiSet) out.push(setCode(aiSet));
    if (css) out.push("<style>", indent(css, "  "), "</style>");
    out.push("", html);
    if (js) out.push("", "<script>", indent(js, "  "), "</" + "script>");
    return out.join("\n") + "\n";
  }

  function button(label, attrs) {
    var node = document.createElement("button");
    node.type = "button";
    node.className = "k-btn k-btn--small";
    node.textContent = label;
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  function stageHosts(card) {
    return hostsIn(card.querySelector("[data-fx-stage]"));
  }

  /* 한 번 도는 움직임을 처음부터: 확장 움직임은 다시 그리면 자모 노드가 새로 생겨 다시 돈다
   * (FontKkuFx.replay와 같다). 조리법 카드는 is-playing을 떼었다 붙인다. */
  function replay(card) {
    stageHosts(card).forEach(function (host) {
      if (card.getAttribute("data-fx-replay") === "class") {
        host.classList.remove("is-playing");
        void host.offsetWidth;
        host.classList.add("is-playing");
      } else {
        window.FontKku.refresh(host);
      }
    });
  }

  cards.forEach(function (card) {
    var id = card.getAttribute("data-fx");
    var stage = card.querySelector("[data-fx-stage]");
    stage.appendChild(card.querySelector("template[data-fx-html]").content.cloneNode(true));

    var actions = card.querySelector("[data-fx-actions]");
    var codeId = "fx-code-" + id;
    var hint = actions.querySelector(".fx-hint");
    if (card.hasAttribute("data-fx-replay")) {
      var again = button("다시 재생", { "data-fx-again": "" });
      again.addEventListener("click", function () { replay(card); });
      actions.insertBefore(again, hint);
    }
    actions.insertBefore(button("코드 복사", { "data-copy": "#" + codeId }), hint);

    var details = document.createElement("details");
    details.className = "fx-code";
    details.innerHTML = "<summary>코드 보기</summary>" +
      '<div class="k-code"><div class="k-code-bar"><span>HTML 한 장</span>' +
      '<button type="button" data-copy="#' + codeId + '">복사</button></div>' +
      '<pre id="' + codeId + '"><code></code></pre></div>';
    details.querySelector("code").textContent = snippet(card);
    card.appendChild(details);
  });

  /* 견본은 나중에 넣었으니 직접 그린다. data-kku-fx는 상호작용 확장이 그리기 이벤트를 보고 단다. */
  window.FontKku.upgradeAll(document.querySelector("main"));

  /* 내 문장으로 보기 — 받는 카드의 견본을 그 문장으로 다시 그리고(한 번 도는 움직임은 다시 돈다) 복사할 코드도
   * 같은 문장으로 바꾼다. 비우면 처음 견본 글로. 치는 동안은 잠깐 기다렸다 한 번 그린다. */
  var textForm = document.querySelector("[data-fx-text-form]");
  if (textForm) {
    var textInput = textForm.elements.text;
    var textCards = cards.filter(function (card) { return !card.hasAttribute("data-fx-fixed-text"); });
    var samples = new Map();
    textCards.forEach(function (card) {
      var originals = hostsIn(card.querySelector("template[data-fx-html]").content);
      stageHosts(card).forEach(function (host, i) { samples.set(host, originals[i]); });
    });
    /* 처음 견본의 줄바꿈 단위로 되돌린다(속성이 없었으면 뗀다) */
    var restoreWrap = function (host, original) {
      ["wrap-unit", "data-wrap-unit"].forEach(function (name) {
        if (original.hasAttribute(name)) host.setAttribute(name, original.getAttribute(name));
        else host.removeAttribute(name);
      });
    };
    var shown = "";
    var applyText = function () {
      var text = (textInput.value || "").replace(/\s+/g, " ").trim();
      if (text === shown) return;
      shown = text;
      textCards.forEach(function (card) {
        stageHosts(card).forEach(function (host) {
          var original = samples.get(host);
          if (text) wrapByGlyph(host);
          else restoreWrap(host, original);
          window.FontKku.refresh(host, { text: text || original.textContent });
        });
        document.getElementById("fx-code-" + card.getAttribute("data-fx")).firstChild.textContent = snippet(card, text);
      });
    };
    var textTimer = 0;
    textInput.addEventListener("input", function () {
      clearTimeout(textTimer);
      textTimer = setTimeout(applyText, 250);
    });
    textForm.addEventListener("submit", function (event) {
      event.preventDefault();
      clearTimeout(textTimer);
      applyText();
    });
  }

  /* 견본을 꽂은 뒤에 카드 JS를 실행한다 — 복사하는 코드와 같은 글이다. */
  Array.prototype.forEach.call(document.querySelectorAll('script[type="text/plain"][data-fx-js]'), function (source) {
    var run = document.createElement("script");
    run.textContent = source.textContent;
    document.body.appendChild(run);
  });

  /* 한 번 도는 확장 움직임은 불러올 때 이미 돌았을 수 있다 — 카드가 화면에 들어오면 한 번 더 돌린다. */
  if ("IntersectionObserver" in window) {
    var opener = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        opener.unobserve(entry.target);
        replay(entry.target);
      });
    }, { threshold: 0.6 });
    cards.forEach(function (card) {
      var mode = card.getAttribute("data-fx-replay");
      if (mode !== null && mode !== "class") opener.observe(card);
    });
  }

  /* 목록 */
  var index = document.querySelector("[data-fx-index]");
  index.innerHTML = cards.map(function (card) {
    return '<a href="#' + card.id + '">' + card.querySelector("h3").textContent + "</a>";
  }).join("");

  /* 움직임 멈추기 — data-kku-paused는 확장의 움직임과 상호작용을 그 자리에 세운다(타자는 다음
   * 걸음을 미룬다). 조리법 카드의 움직임은 effects.css가 세운다. */
  var pause = document.querySelector("[data-fx-pause]");
  pause.addEventListener("click", function () {
    var paused = pause.getAttribute("aria-pressed") !== "true";
    pause.setAttribute("aria-pressed", String(paused));
    pause.textContent = paused ? "움직임 다시 켜기" : "움직임 멈추기";
    document.body.toggleAttribute("data-kku-paused", paused);
  });

  /* 화면 밖 카드의 반복 움직임은 쉰다. */
  if ("IntersectionObserver" in window) {
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.toggleAttribute("data-fx-offscreen", !entry.isIntersecting);
      });
    });
    cards.forEach(function (card) { watcher.observe(card); });
  }
})();
