/* 소개 '고르고 섞는 얼굴'의 맛보기 — 글꼴·꾸밈·움직임 세 축을 골라 한 문장에 섞는다(ADR-017).
 * 목록과 이름, 꾸밈·글꼴이 권하는 바탕은 정본(spec/themes.json → themes-data.js)에서 온다.
 * 꾸밈은 그림 자소 글꼴에서 마스크 칠을 켜고 끄므로 고를 때마다 FontKku.refresh로 다시 그린다
 * — 한 번 도는 움직임(조립·받침 톡)도 그때 다시 돈다. */
(function () {
  "use strict";

  var T = window.FontKkuThemes;
  var root = document.querySelector("[data-mix]");
  if (!T || !root || !window.FontKku) return;

  var host = root.querySelector("[data-mix-host]");
  var stage = root.querySelector("[data-mix-stage]");
  var code = root.querySelector("[data-mix-code]");
  var CHOICES = {
    font: ["sebul", "gothic", "pilgi", "dunggeun", "butgeul", "pixel"],
    look: ["", "neon", "sticker", "geumbak", "saekdong", "riso"],
    motion: ["", "wave", "assemble", "drop", "flicker"]
  };
  var NAMES = { font: T.fonts, look: T.looks, motion: T.motions };
  var state = { font: "gothic", look: "neon", motion: "wave" };

  Object.keys(CHOICES).forEach(function (axis) {
    var group = root.querySelector('[data-mix-axis="' + axis + '"] .k-chips');
    CHOICES[axis].forEach(function (id) {
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("data-mix-value", id);
      button.textContent = id ? NAMES[axis][id].name : "없음";
      group.appendChild(button);
    });
  });

  function tone() {
    return state.look ? T.looks[state.look].tone || "light" : T.fonts[state.font].tone || "light";
  }

  function render() {
    host.setAttribute("font", state.font);
    host.className = state.look ? "kku-look-" + state.look : "";
    if (state.motion) {
      host.setAttribute("animate", state.motion);
    } else {
      host.removeAttribute("animate");
    }
    if (tone() === "light") {
      stage.removeAttribute("data-tone");
    } else {
      stage.setAttribute("data-tone", tone());
    }
    window.FontKku.refresh(host);
    Object.keys(CHOICES).forEach(function (axis) {
      root.querySelectorAll('[data-mix-axis="' + axis + '"] button').forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-mix-value") === state[axis]));
      });
    });
    var addons = (state.look ? ["looks"] : []).concat(state.motion && T.motions[state.motion].source === "motion" ? ["motion"] : []);
    code.textContent =
      '<script src="…/font-kku.js" data-fonts="' + state.font + '"' + (addons.length ? ' data-addons="' + addons.join(" ") + '"' : "") + "></" + "script>\n" +
      '<font-kku font="' + state.font + '"' + (state.look ? ' class="kku-look-' + state.look + '"' : "") +
      (state.motion ? ' animate="' + state.motion + '"' : "") + ">고르고 섞기</font-kku>";
  }

  root.addEventListener("click", function (event) {
    var button = event.target.closest("[data-mix-axis] button");
    if (!button) return;
    state[button.closest("[data-mix-axis]").getAttribute("data-mix-axis")] = button.getAttribute("data-mix-value");
    render();
  });

  render();

  /* 주소의 #절로 들어오면 글꼴 CSS가 도착하고 견본이 그려지는 동안 문서가 길어져, 브라우저가 처음
   * 내려간 자리에서 대상이 밀려난다. 다 그려진 뒤(load, 그다음 두 프레임) 한 번 더 맞춘다 — 사용자가
   * 그 사이 스크롤했으면 건드리지 않는다. */
  if (location.hash.length > 1) {
    var userMoved = false;
    ["wheel", "touchstart", "keydown"].forEach(function (type) {
      window.addEventListener(type, function () { userMoved = true; }, { once: true, passive: true });
    });
    window.addEventListener("load", function () {
      setTimeout(function () {
        var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target && !userMoved) target.scrollIntoView({ behavior: "auto", block: "start" });
      }, 400);
    });
  }

  /* 테마 띠: 칸마다 정본의 조합법(recipes)을 그대로 건다 — 정본이 바뀌어도 띠가 어긋나지 않게. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-theme-tile]"), function (tile) {
    var recipe = T.recipes[tile.getAttribute("data-theme-tile")];
    var tileHost = tile.querySelector("font-kku");
    if (!recipe || !tileHost) return;
    var changed = tileHost.getAttribute("font") !== recipe.font || (tileHost.getAttribute("class") || "") !== recipe.classes.join(" ") ||
      tileHost.getAttribute("jamo-set") !== (recipe.jamoSet || null);
    tileHost.setAttribute("font", recipe.font);
    if (recipe.jamoSet) tileHost.setAttribute("jamo-set", recipe.jamoSet); else tileHost.removeAttribute("jamo-set");
    if (recipe.classes.length) tileHost.setAttribute("class", recipe.classes.join(" ")); else tileHost.removeAttribute("class");
    if (recipe.jamoSeeds) {
      tileHost.setAttribute("seed", recipe.seed);
      tileHost.setAttribute("jamo-seeds", "");
    } else {
      tileHost.removeAttribute("seed");
      tileHost.removeAttribute("jamo-seeds");
    }
    if (recipe.animate) tileHost.setAttribute("animate", recipe.animate); else tileHost.removeAttribute("animate");
    if (recipe.tone === "light") tile.removeAttribute("data-tone"); else tile.setAttribute("data-tone", recipe.tone);
    if (changed) window.FontKku.refresh(tileHost);
  });
})();
