/* 움직임 페이지 — 카드마다 견본을 꽂고, 그 견본을 '코드 복사'용 HTML 한 장으로 만든다.
 *
 * 카드 한 장은 effects.html 안의 조각들이다.
 *   <template data-fx-html> (카드 안)       견본 마크업. 무대([data-fx-stage])에 꽂는다
 *   <style data-fx-css="<id>">              카드에 따로 필요한 CSS(있을 때만)
 *   <script type="text/plain" data-fx-js>   카드에 따로 필요한 JS(있을 때만). 견본을 꽂은 뒤 실행한다
 * 움직임(animate)과 상호작용(data-kku-fx)은 확장이 맡으므로 대개 마크업 한 줄이다. 복사하는
 * 코드도 같은 조각이라 화면의 견본과 가져가는 코드가 어긋나지 않는다.
 *
 * 카드 속성: data-fx-fonts(한 줄 설치에 적을 글꼴), data-fx-addons(한 줄 설치의 data-addons),
 * data-fx-jamo-sets(벡터 자소 모듈), data-fx-replay(한 번 도는 움직임 — '다시 재생' 단추를 달고
 * 화면에 들어올 때 처음부터 돌린다. 값이 "class"면 견본의 is-playing 클래스로 돌리는 조리법 카드). */
(function () {
  "use strict";

  window.FontKkuDemo.renderNav("effects");
  var site = window.FontKkuSite;
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

  /* 가져가서 그대로 여는 HTML 한 장 — 런타임은 jsDelivr 주소로. */
  function snippet(card) {
    var id = card.getAttribute("data-fx");
    var css = piece('style[data-fx-css="' + id + '"]');
    var js = piece('script[data-fx-js="' + id + '"]');
    var html = dedent(card.querySelector("template[data-fx-html]").innerHTML);
    var sets = card.getAttribute("data-fx-jamo-sets");
    var addons = card.getAttribute("data-fx-addons");
    var out = [
      "<!doctype html>",
      '<meta charset="utf-8">',
      '<script src="' + site.RUNTIME + '" data-fonts="' + card.getAttribute("data-fx-fonts") + '"' +
        (addons ? ' data-addons="' + addons + '"' : "") +
        (sets ? ' data-jamo-sets="' + sets + '"' : "") + "></" + "script>"
    ];
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
    return Array.prototype.slice.call(card.querySelectorAll("[data-fx-stage] font-kku, [data-fx-stage] .font-kku"));
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
