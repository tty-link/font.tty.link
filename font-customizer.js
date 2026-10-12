/* 글꼴 시험대의 꾸미기 — 글꼴 하나를 기반으로 "나만의 꾸밈 글꼴"(페이지 CSS 클래스)을 만든다.
 *
 * 결과는 AI 설명서(skills/font-kku-use/custom-font.md)의 나만의 꾸밈 글꼴 형식 그대로다:
 * 머리 주석 + `.kku-<이름>` 규칙. 페이지 CSS는 글꼴 CSS의 레이어 밖이라 특이도와 상관없이
 * 글꼴보다 이긴다(docs.html #customize). 미리보기에 실제로 붙이는 CSS와 복사·내려받는 CSS는
 * 같은 문자열이다. 자모 위치(--fy-top/--fy-left)와 크기는 건드리지 않는다 — 조립이 무너진다.
 *
 * 글꼴마다 "색"이 무엇을 바꾸는지 다르다(paint 모델):
 *   fill         기기 글꼴 채움 — color
 *   hollow       속 빈 선 글자(neon·blueprint) — -webkit-text-stroke-color. glow가 있는
 *                글꼴(neon)은 빛번짐도 그 색으로 바꾼다
 *   sprite       그림 자소(자소판 그림 그대로) — 색을 주면 마스크 칠(ADR-014)로 바꾼다
 *   sprite-mask  이미 마스크 칠인 그림 자소(crayon) — color
 * 그라데이션 칠은 기기 글꼴이면 자모마다 background-clip:text, 그림 자소면 --fy-sprite-fill이다.
 * 그림자는 기기 글꼴 채움이면 text-shadow, 그림 자소·그라데이션 칠이면 글자 칸의
 * filter: drop-shadow()로 준다(투명 글자의 text-shadow는 숨은 글자 모양을 비추고,
 * background-clip:text 위에서는 그라데이션을 덮는다 — 그래서 그라데이션 칠은 글꼴의
 * text-shadow도 지운다).
 *
 * 변주(씨앗): 바탕 요소에 seed와 jamo-seeds를 주면 런타임이 자모 노드마다 --fy-jamo-seed(0–1)를
 * 건다. 변주 폭은 이 값으로 기울기(--fy-rotate)·크기(--fy-scale-x/y)·굵기(--fy-weight, 기기
 * 글꼴만)·미세 위치(translate)·색조(oklch 상대 색, 초성·중성·받침 색 칠에서만)를 흔든다.
 * 씨앗이 없으면 var(…, 0.5)라 흔들림이 0이다. 위치는 페이지 변수 --fy-top/--fy-left가 아니라
 * 개별 속성 translate로 아주 작게, 그림 자소의 색조는 filter(코어가 쓴다)가 아니라 마스크 칠의
 * color로 돌린다. 씨앗에 반응하는 글꼴(fonts[].seed)은 변주를 켜면 글꼴의 흔들림도 함께 산다.
 * 고정 씨앗이면 언제 그려도 같은 모양, seed="auto"면 그릴 때마다 새 모양이다.
 *
 * 글꼴 뽑기(draw): 뽑기 씨앗 하나로 기반 글꼴·칠·외곽선·그림자·변주·움직임을 결정론적으로
 * 고른다 — 같은 뽑기 씨앗은 언제나 같은 결과다. 바탕과 글자색이 겹치지 않게 어두운 바탕
 * 글꼴에는 밝은 색, 밝은 바탕 글꼴에는 짙은 색을 고른다.
 *
 * 쓰는 법: FontKkuCustomizer.init({ fonts, text, cdn, skillUrl, copyText }); 행 버튼이 open(id),
 * draw(seed?)가 글꼴 뽑기. 상태는 주소 해시(#kku=…)에 담겨 링크로 나누고, 열 때 해시가 있으면
 * 복원한다(변주 묶음 이전의 링크도 열린다). */
(function () {
  "use strict";

  var ROLES = [
    { key: "cho", label: "초성", selector: ':is([part~="choseong"], [part~="head"])' },
    { key: "jung", label: "중성", selector: '[part~="jungseong"]' },
    { key: "jong", label: "받침", selector: '[part~="jongseong"]' }
  ];
  var PRESETS = [
    { name: "색동", colors: ["#d62839", "#1f4fd1", "#12965f"] },
    { name: "파스텔", colors: ["#ff8fab", "#7aa7ff", "#5cc8a0"] },
    { name: "형광", colors: ["#ff2e88", "#00c2ff", "#9be000"] },
    { name: "먹·주홍", colors: ["#d62839", "#141414", "#141414"] },
    { name: "노을", colors: ["#ff5e3a", "#ff9f1c", "#7b2cbf"] },
    { name: "바다", colors: ["#0077b6", "#00b4d8", "#023e8a"] }
  ];
  var PAINTS = [["font", "글꼴 그대로"], ["color", "초성·중성·받침 색"], ["gradient", "그라데이션 (두 색)"]];
  var SHADOWS = [["font", "글꼴 그대로"], ["none", "지우기"], ["extrude", "입체"], ["sticker", "스티커 테두리"], ["glow", "빛번짐"], ["float", "떠 있는 그림자"]];
  var SHADOW_COLORS = { font: "#000000", none: "#000000", extrude: "#073b4c", sticker: "#ffffff", glow: "#ff4fd8", float: "#000000" };
  var ANIMATIONS = [["", "없음"], ["rise", "올라오기 (rise)"], ["fade", "나타나기 (fade)"], ["stagger", "차례로 (stagger)"], ["bounce", "통통 (bounce)"], ["wiggle", "흔들흔들 (wiggle)"], ["drift", "둥실 (drift)"]];
  var WEIGHTS = [["", "글꼴 그대로"], ["300", "300 가늘게"], ["400", "400"], ["500", "500"], ["600", "600"], ["700", "700"], ["800", "800"], ["900", "900 아주 굵게"]];
  var STUDIO_FONTS = ["sebul", "gothic", "sprite-example", "sprite-system"];
  var MODES = [["fixed", "이 모양 고정"], ["auto", "매번 새로"]];
  var DRAW_MOTIONS = ["rise", "stagger", "bounce", "wiggle", "drift"];
  var DARK_TONES = ["dark", "board", "blueprint"];
  var HEX = /^#[0-9a-f]{6}$/i;
  var SEED = /^[a-z0-9-]{1,16}$/i;
  // 씨앗 하나로 축마다 다른 흔들림을 얻는다 — 씨앗이 없으면(0.5) 모두 0이다.
  var J = "(var(--fy-jamo-seed, 0.5) - 0.5)";

  var config = null;
  var dialog = null;
  var font = null;
  var state = null;
  var opener = null;
  var styleNode = null;
  var hashTimer = 0;
  /* 꾸미기를 열기 전의 해시(조합기 #compose= 등) — 닫을 때 되돌려 그 링크를 잃지 않는다. */
  var hashBefore = "";

  function $(selector) {
    return dialog.querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function fontById(id) {
    return config.fonts.filter(function (item) { return item.id === id; })[0] || null;
  }

  function isSprite(item) {
    return item.paint === "sprite" || item.paint === "sprite-mask";
  }

  function slug(value, id) {
    var name = String(value || "").toLowerCase().replace(/^kku-/, "").replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return "kku-" + (name || "my-" + id);
  }

  function round(value) {
    return String(Math.round(value * 1000) / 1000);
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(hex, toward, amount) {
    var a = hexToRgb(hex);
    var b = hexToRgb(toward);
    return "#" + a.map(function (v, i) {
      return ("0" + Math.round(v + (b[i] - v) * amount).toString(16)).slice(-2);
    }).join("");
  }

  function defaults(item, text) {
    return {
      f: item.id,
      n: "kku-my-" + item.id,
      p: "font",
      c: { cho: null, jung: null, jong: null },
      g: ["#ffd166", "#ef476f"],
      ol: 0,
      olc: "#ffffff",
      sh: "font",
      shc: "#000000",
      shs: 1,
      w: "",
      vo: 0,
      vm: "fixed",
      wob: 0,
      vs: 0,
      vp: 0,
      vw: 0,
      vh: 0,
      seed: "kku",
      dr: "",
      an: "",
      bg: "auto",
      t: text || item.name
    };
  }

  // ── CSS 만들기 ─────────────────────────────────────────

  function shadowList(kind, color, size, asFilter) {
    var s = size;
    function em(value) { return value ? round(value * s) + "em" : "0"; }
    var soft = color + "73"; // 45%
    if (asFilter) {
      if (kind === "extrude") return [1, 2, 3].map(function () { return "drop-shadow(" + em(0.02) + " " + em(0.02) + " 0 " + color + ")"; });
      if (kind === "sticker") {
        var d = em(0.04);
        return ["drop-shadow(" + d + " 0 0 " + color + ")", "drop-shadow(-" + d + " 0 0 " + color + ")",
          "drop-shadow(0 " + d + " 0 " + color + ")", "drop-shadow(0 -" + d + " 0 " + color + ")",
          "drop-shadow(0.03em 0.06em 0.03em rgb(0 0 0 / 30%))"];
      }
      if (kind === "glow") return ["drop-shadow(0 0 " + em(0.04) + " " + color + ")", "drop-shadow(0 0 " + em(0.14) + " " + color + ")"];
      if (kind === "float") return ["drop-shadow(" + em(0.05) + " " + em(0.08) + " " + em(0.05) + " " + soft + ")"];
      return [];
    }
    if (kind === "extrude") return [1, 2, 3].map(function (i) { return em(0.02 * i) + " " + em(0.02 * i) + " 0 " + color; });
    if (kind === "sticker") {
      var o = 0.05;
      var q = 0.035;
      return [[o, 0], [-o, 0], [0, o], [0, -o], [q, q], [-q, q], [q, -q], [-q, -q]].map(function (p) {
        return em(p[0]) + " " + em(p[1]) + " " + color;
      }).concat(["0.04em 0.07em 0.02em rgb(0 0 0 / 30%)"]);
    }
    if (kind === "glow") return ["0 0 " + em(0.04) + " #fff", "0 0 " + em(0.12) + " " + color, "0 0 " + em(0.3) + " " + color];
    if (kind === "float") return [em(0.05) + " " + em(0.08) + " " + em(0.06) + " " + soft];
    return [];
  }

  function glow(color) {
    return "0 0 0.04em #fff, 0 0 0.12em " + color + ", 0 0 0.3em " + color + ", 0 0 0.6em " + mix(color, "#000000", 0.45);
  }

  // 글꼴의 잉크 투명도를 지킨다 — alpha(리소의 반투명 잉크)는 채움색에, fillAlpha(도면의 옅은
  // 속)는 속 빈 선 글자의 채움에 두 자리 16진 알파로 붙는다.
  function roleDecls(item, color) {
    if (item.paint === "hollow") {
      var decls = ["-webkit-text-stroke-color: " + color];
      if (item.fillAlpha) decls.push("-webkit-text-fill-color: " + color + item.fillAlpha);
      if (item.glow && state.sh === "font") decls.push("text-shadow: " + glow(color));
      return decls;
    }
    return ["color: " + color + (item.alpha || "")];
  }

  function block(selector, decls) {
    if (!decls.length) return "";
    if (decls.length === 1 && decls[0].length < 64) return selector + " { " + decls[0] + "; }";
    return selector + " {\n" + decls.map(function (d) { return "  " + d + ";"; }).join("\n") + "\n}";
  }

  function seedAttr(s) {
    return s.vo ? (s.vm === "auto" ? "auto" : s.seed) : null;
  }

  function usageTag(s) {
    var attrs = ' font="' + s.f + '" class="' + s.n + '"';
    if (s.vo) attrs += ' seed="' + seedAttr(s) + '" jamo-seeds';
    if (s.an) attrs += ' animate="' + s.an + '"';
    return "<font-kku" + attrs + ">" + escapeHtml(s.t || (fontById(s.f) || {}).name || "") + "</font-kku>";
  }

  function buildCss(item, s) {
    var cls = "." + s.n;
    var sprite = isSprite(item);
    var gradientFill = s.p === "gradient";
    var filterShadow = sprite || gradientFill;
    var host = [];
    var jamo = [];
    var roles = [];
    var shadow = [];
    var glyphFilters = [];

    if (!sprite && s.w) host.push("--fy-weight: " + s.w);

    if (s.p === "color") {
      if (item.paint === "sprite") host.push("--fy-sprite-paint: mask");
      ROLES.forEach(function (role) {
        var color = s.c[role.key];
        if (color) roles.push(block(cls + " " + role.selector, roleDecls(item, color)));
      });
    } else if (gradientFill) {
      var grad = "linear-gradient(180deg, " + s.g[0] + ", " + s.g[1] + ")";
      if (sprite) {
        if (item.paint === "sprite") host.push("--fy-sprite-paint: mask");
        host.push("--fy-sprite-fill: " + grad);
      } else {
        jamo.push("background-image: " + grad, "-webkit-background-clip: text", "background-clip: text", "-webkit-text-fill-color: transparent", "text-shadow: none");
      }
    }

    if (s.ol > 0) {
      if (sprite) {
        var w = round(s.ol) + "em";
        glyphFilters.push("drop-shadow(" + w + " 0 0 " + s.olc + ")", "drop-shadow(-" + w + " 0 0 " + s.olc + ")",
          "drop-shadow(0 " + w + " 0 " + s.olc + ")", "drop-shadow(0 -" + w + " 0 " + s.olc + ")");
      } else {
        host.push("--fy-stroke: " + round(s.ol) + "em");
        if (item.paint !== "hollow") jamo.push("-webkit-text-stroke-color: " + s.olc, "paint-order: stroke fill");
      }
    }

    var hue = [];
    if (s.vo) {
      if (s.wob > 0) jamo.push("--fy-rotate: calc(" + J + " * " + s.wob * 2 + "deg)");
      if (s.vs > 0) {
        var scale = "calc(1 + sin(" + J + " * 29rad) * " + round(s.vs / 100) + ")";
        jamo.push("--fy-scale-x: " + scale, "--fy-scale-y: " + scale);
      }
      if (s.vw > 0 && !sprite) {
        var baseWeight = s.w || "var(--fy-slot-weight, var(--fy-role-weight, var(--fy-font-weight, 700)))";
        jamo.push("--fy-weight: calc(" + baseWeight + " + sin(" + J + " * 37rad) * " + s.vw + ")");
      }
      if (s.vp > 0) {
        var reach = round(s.vp / 1000);
        jamo.push("translate: calc(" + J + " * " + round(s.vp / 500) + "em) calc(sin(" + J + " * 41rad) * " + reach + "em)");
      }
      // 색조는 고른 색에서 돈다(oklch 상대 색) — 못 읽는 브라우저는 @supports 밖이라 고른 색 그대로
      if (s.vh > 0 && s.p === "color") {
        var property = item.paint === "hollow" ? "-webkit-text-stroke-color" : "color";
        ROLES.forEach(function (role) {
          var color = s.c[role.key];
          if (!color) return;
          hue.push(block(cls + " " + role.selector, [property + ": oklch(from " + color + " l c calc(h + sin(" + J + " * 53rad) * " + s.vh + "))"]));
        });
      }
    }

    if (s.sh === "none" && !gradientFill) {
      shadow.push(block(cls + ' :is([part="glyph"], [part~="jamo"])', ["text-shadow: none"]));
    } else if (s.sh !== "font") {
      if (filterShadow) {
        glyphFilters = glyphFilters.concat(shadowList(s.sh, s.shc, s.shs, true));
      } else {
        shadow.push(block(cls + ' :is([part="glyph"], [part~="jamo"])', ["text-shadow: " + shadowList(s.sh, s.shc, s.shs, false).join(", ")]));
      }
    }

    var rules = [
      block(cls, host),
      block(cls + ' [part~="jamo"]', jamo)
    ].concat(roles, shadow, [
      block(cls + ' [part="glyph"]', glyphFilters.length ? ["filter: " + glyphFilters.join(" ")] : [])
    ]).filter(Boolean);
    if (hue.length) {
      rules.push("@supports (color: oklch(from red l c h)) {\n" + hue.join("\n").split("\n").map(function (line) { return "  " + line; }).join("\n") + "\n}");
    }

    var head = "/* 나만의 글꼴: " + s.n + " — 기반 " + item.id + ". 쓰는 법: " +
      usageTag(s).replace(/\*\//g, "* /") + " */";
    if (!rules.length) {
      rules.push(s.vo
        ? "/* 페이지 CSS 없이 글꼴의 씨앗 변주만 씁니다 — 태그의 seed·jamo-seeds 속성이 켭니다. */"
        : "/* 아직 바꾼 것이 없습니다 — 칠·외곽선·그림자·변주를 골라 보세요. */");
    }
    return head + "\n" + rules.join("\n") + "\n";
  }

  function toneFor(s) {
    if (s.bg === "light") return "";
    if (s.bg === "dark") return "dark";
    return font.tone || "";
  }

  function buildHtml(s, css) {
    var size = s.t.replace(/\s+/g, "").length <= 6 ? 96 : 64;
    var bg = { dark: "#12121c", pink: "#ffd6e5", paper: "#f7f0e1", board: "#24392f", blueprint: "#0f3d7a", linen: "#efe6d4" }[toneFor(s)] || "#ffffff";
    return "<!doctype html>\n<html lang=\"ko\">\n<head>\n  <meta charset=\"utf-8\" />\n" +
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n" +
      "  <title>" + escapeHtml(s.n) + " — 폰꾸 나만의 글꼴</title>\n" +
      "  <script src=\"" + config.runtime + "\" data-fonts=\"" + s.f + "\"></" + "script>\n" +
      "  <style>\n    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: " + bg + "; }\n" +
      css.trim().split("\n").map(function (line) { return "    " + line; }).join("\n") +
      "\n  </style>\n</head>\n<body>\n  " + usageTag(s).replace("<font-kku", "<font-kku size=\"" + size + "\"") + "\n</body>\n</html>\n";
  }

  function aiPrompt(s, css) {
    return "이 설명서를 읽고 따라 해 줘: " + config.skillUrl + "\n\n" +
      "폰꾸 '" + font.name + "'(" + font.id + ") 글꼴을 기반으로 한 나만의 꾸밈 글꼴 " + s.n + "를 CSS 파일 하나로 다듬어 줘.\n" +
      "지금까지 꾸민 CSS는 아래와 같아. 이 느낌을 살리면서 (여기에 원하는 분위기를 적기) 느낌을 더해 줘.\n" +
      "자모 위치와 크기는 바꾸지 말고, 같은 문장('" + s.t + "')을 기반 글꼴 그대로와 나란히 그린 미리보기 HTML도 함께 줘.\n\n" + css;
  }

  function studioHref(item) {
    if (STUDIO_FONTS.indexOf(item.id) !== -1) return "./font-studio.html?font=" + item.id;
    return "./font-studio.html?src=" + encodeURIComponent("lib/profiles/" + item.id + ".css");
  }

  // ── 해시 ──────────────────────────────────────────────

  function encodeState(s) {
    var json = JSON.stringify(s);
    var bytes = new TextEncoder().encode(json);
    var binary = "";
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeState(text) {
    try {
      var binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      return null;
    }
  }

  function pick(value, allowed, fallback) {
    return allowed.indexOf(value) !== -1 ? value : fallback;
  }

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    var item = fontById(raw.f);
    if (!item) return null;
    var s = defaults(item, typeof raw.t === "string" ? raw.t.slice(0, 24) : item.name);
    s.n = slug(raw.n, item.id);
    s.p = pick(raw.p, PAINTS.map(function (p) { return p[0]; }), "font");
    ROLES.forEach(function (role) {
      var color = raw.c && raw.c[role.key];
      s.c[role.key] = HEX.test(color) ? color.toLowerCase() : null;
    });
    if (Array.isArray(raw.g) && HEX.test(raw.g[0]) && HEX.test(raw.g[1])) s.g = [raw.g[0], raw.g[1]];
    s.ol = clamp(raw.ol, 0, 0.08, 0);
    s.olc = HEX.test(raw.olc) ? raw.olc : s.olc;
    s.sh = pick(raw.sh, SHADOWS.map(function (p) { return p[0]; }), "font");
    s.shc = HEX.test(raw.shc) ? raw.shc : SHADOW_COLORS[s.sh];
    s.shs = clamp(raw.shs, 0.5, 3, 1);
    s.w = pick(String(raw.w || ""), WEIGHTS.map(function (p) { return p[0]; }), "");
    s.wob = Math.round(clamp(raw.wob, 0, 10, 0));
    // 변주 묶음 이전 링크: 흔들림(wob)이 있으면 변주가 켜진 것이다
    s.vo = raw.vo === undefined ? (s.wob > 0 ? 1 : 0) : (raw.vo ? 1 : 0);
    s.vm = pick(raw.vm, MODES.map(function (m) { return m[0]; }), "fixed");
    s.vs = Math.round(clamp(raw.vs, 0, 8, 0));
    s.vp = Math.round(clamp(raw.vp, 0, 30, 0));
    s.vw = Math.round(clamp(raw.vw, 0, 200, 0) / 50) * 50;
    s.vh = Math.round(clamp(raw.vh, 0, 60, 0));
    s.seed = typeof raw.seed === "string" && SEED.test(raw.seed) ? raw.seed : "kku";
    s.dr = typeof raw.dr === "string" && SEED.test(raw.dr) ? raw.dr : "";
    s.an = pick(raw.an || "", ANIMATIONS.map(function (p) { return p[0]; }), "");
    s.bg = pick(raw.bg, ["auto", "light", "dark"], "auto");
    return s;
  }

  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      if (!state || !dialog.open) return;
      history.replaceState(null, "", location.pathname + location.search + "#kku=" + encodeState(state));
    }, 200);
  }

  function clearHash() {
    clearTimeout(hashTimer);
    if (/^#kku=/.test(location.hash)) {
      history.replaceState(null, "", location.pathname + location.search + hashBefore);
    }
    hashBefore = "";
  }

  // ── 화면 ──────────────────────────────────────────────

  function options(list, selected) {
    return list.map(function (entry) {
      return '<option value="' + entry[0] + '"' + (entry[0] === selected ? " selected" : "") + ">" + entry[1] + "</option>";
    }).join("");
  }

  function markup() {
    return '<div class="kku-sheet">' +
      '<header class="kku-head">' +
      '<div><p class="kku-kicker">나만의 글꼴 만들기 · 기반 <code data-kku-base-id></code><span class="kku-draw-no" data-kku-draw-no hidden> · 뽑기 <code></code></span></p>' +
      '<h2 id="kku-title" data-kku-title>꾸미기</h2></div>' +
      '<button type="button" class="kku-close" data-kku-close aria-label="꾸미기 닫기">닫기 <span aria-hidden="true">✕</span></button>' +
      "</header>" +
      '<div class="kku-body">' +
      '<div class="kku-controls">' +
      '<fieldset class="kku-group"><legend>이름</legend>' +
      '<label class="kku-field"><span>클래스 이름</span><input class="kku-text" type="text" maxlength="32" autocomplete="off" spellcheck="false" data-kku="n" /></label>' +
      '<p class="kku-hint">영문 소문자·숫자·하이픈. 앞에 <code>kku-</code>가 붙습니다.</p></fieldset>' +
      '<fieldset class="kku-group"><legend>칠</legend>' +
      '<label class="kku-field"><span>칠 방식</span><select data-kku="p">' + options(PAINTS, "font") + "</select></label>" +
      '<p class="kku-hint" data-kku-paint-hint></p>' +
      '<div class="kku-presets" role="group" aria-label="색 묶음" data-kku-presets>' +
      PRESETS.map(function (preset, i) {
        return '<button type="button" data-kku-preset="' + i + '"><span class="kku-swatches" aria-hidden="true">' +
          preset.colors.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>" + preset.name + "</button>";
      }).join("") + "</div>" +
      '<div class="kku-colors" data-kku-roles>' +
      ROLES.map(function (role) {
        return '<div class="kku-color"><label><input type="checkbox" data-kku-on="' + role.key + '" /> ' + role.label + "</label>" +
          '<input type="color" data-kku-color="' + role.key + '" aria-label="' + role.label + ' 색" /></div>';
      }).join("") + "</div>" +
      '<div class="kku-colors" data-kku-gradient>' +
      '<div class="kku-color"><label for="kku-g0">위</label><input id="kku-g0" type="color" data-kku-g="0" /></div>' +
      '<div class="kku-color"><label for="kku-g1">아래</label><input id="kku-g1" type="color" data-kku-g="1" /></div>' +
      "</div></fieldset>" +
      '<fieldset class="kku-group"><legend data-kku-outline-legend>외곽선</legend>' +
      '<label class="kku-field"><span>두께 <output data-kku-out="ol"></output></span><input type="range" min="0" max="0.08" step="0.005" data-kku="ol" /></label>' +
      '<label class="kku-field kku-field--color" data-kku-olc-wrap><span>색</span><input type="color" data-kku="olc" /></label>' +
      "</fieldset>" +
      '<fieldset class="kku-group"><legend>그림자</legend>' +
      '<label class="kku-field"><span>종류</span><select data-kku="sh">' + options(SHADOWS, "font") + "</select></label>" +
      '<label class="kku-field kku-field--color" data-kku-shadow-more><span>색</span><input type="color" data-kku="shc" /></label>' +
      '<label class="kku-field" data-kku-shadow-more><span>크기 <output data-kku-out="shs"></output></span><input type="range" min="0.5" max="3" step="0.25" data-kku="shs" /></label>' +
      "</fieldset>" +
      '<fieldset class="kku-group"><legend>굵기·움직임</legend>' +
      '<label class="kku-field" data-kku-weight-wrap><span>굵기</span><select data-kku="w">' + options(WEIGHTS, "") + "</select></label>" +
      '<label class="kku-field"><span>움직임</span><select data-kku="an">' + options(ANIMATIONS, "") + "</select></label>" +
      "</fieldset>" +
      '<fieldset class="kku-group kku-vary"><legend>변주 (씨앗)</legend>' +
      '<label class="kku-switch"><input type="checkbox" data-kku="vo" /> <span>변주 켜기 — 자모마다 씨앗으로 흔듭니다</span></label>' +
      '<p class="kku-hint" data-kku-vary-hint></p>' +
      '<div class="kku-vary-body" data-kku-vary-body>' +
      '<div class="kku-modes" role="radiogroup" aria-label="변주 방식">' +
      MODES.map(function (mode) {
        return '<label><input type="radio" name="kku-vm" value="' + mode[0] + '" data-kku="vm" /> ' + mode[1] + "</label>";
      }).join("") + "</div>" +
      '<div class="kku-seed-row"><label class="kku-field" data-kku-seed-wrap><span>씨앗</span><input class="kku-text" type="text" maxlength="16" autocomplete="off" spellcheck="false" data-kku="seed" /></label>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-reseed>다시 섞기</button></div>' +
      '<p class="kku-hint" data-kku-mode-hint></p>' +
      '<label class="kku-field"><span>기울기 <output data-kku-out="wob"></output></span><input type="range" min="0" max="10" step="1" data-kku="wob" /></label>' +
      '<label class="kku-field"><span>크기 <output data-kku-out="vs"></output></span><input type="range" min="0" max="8" step="1" data-kku="vs" /></label>' +
      '<label class="kku-field"><span>미세 위치 <output data-kku-out="vp"></output></span><input type="range" min="0" max="30" step="5" data-kku="vp" /></label>' +
      '<label class="kku-field" data-kku-vw-wrap><span>굵기 <output data-kku-out="vw"></output></span><input type="range" min="0" max="200" step="50" data-kku="vw" /></label>' +
      '<label class="kku-field" data-kku-vh-wrap><span>색조 <output data-kku-out="vh"></output></span><input type="range" min="0" max="60" step="5" data-kku="vh" /></label>' +
      '<p class="kku-hint" data-kku-vh-hint></p>' +
      "</div></fieldset>" +
      "</div>" +
      '<div class="kku-main">' +
      '<section class="kku-preview" aria-label="미리보기">' +
      '<div class="kku-preview-tools">' +
      '<input class="k-input" type="text" maxlength="24" autocomplete="off" data-kku-text aria-label="미리볼 문장" />' +
      '<div class="k-chips" role="group" aria-label="미리보기 바탕">' +
      '<button type="button" data-kku-bg="auto" aria-pressed="true">권장 바탕</button>' +
      '<button type="button" data-kku-bg="light" aria-pressed="false">흰 바탕</button>' +
      '<button type="button" data-kku-bg="dark" aria-pressed="false">어두운 바탕</button>' +
      "</div>" +
      '<button type="button" class="k-btn k-btn--small" data-kku-replay>다시 그리기</button>' +
      "</div>" +
      '<figure class="k-stage kku-stage" data-kku-stage><font-kku data-kku-live></font-kku><figcaption class="kku-label">내 꾸밈 · <code data-kku-class></code></figcaption></figure>' +
      '<figure class="k-stage kku-stage kku-stage--base" data-kku-stage-base><font-kku data-kku-original></font-kku><figcaption class="kku-label">기반 글꼴 그대로</figcaption></figure>' +
      "</section>" +
      '<section class="kku-output" aria-label="결과">' +
      '<div class="k-code"><div class="k-code-bar"><span data-kku-file>kku.css</span><button type="button" data-kku-action="css">CSS 복사</button></div>' +
      '<pre class="kku-code"><code data-kku-css></code></pre></div>' +
      '<div class="kku-actions">' +
      '<button type="button" class="k-btn k-btn--small k-btn--primary" data-kku-action="html">HTML 복사</button>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-action="download">CSS 내려받기</button>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-action="link">링크 복사</button>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-action="ai">AI에게 맡기기</button>' +
      '<a class="k-btn k-btn--small" data-kku-studio target="_blank" rel="noopener">작업실에서 글꼴 고치기</a>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-action="draw">또 뽑기</button>' +
      '<button type="button" class="k-btn k-btn--small" data-kku-action="reset">처음으로</button>' +
      "</div>" +
      '<p class="k-note">페이지 CSS는 글꼴 CSS보다 언제나 이깁니다. 이 CSS를 페이지에 넣고 태그에 클래스를 붙이면 됩니다 — 자모 배치는 기반 글꼴 그대로입니다. 배치·굵기 보정처럼 글꼴 자체를 고치려면 작업실에서 엽니다.</p>' +
      "</section>" +
      "</div></div></div>";
  }

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "kku";
    dialog.setAttribute("aria-labelledby", "kku-title");
    dialog.setAttribute("data-kku", "");
    dialog.innerHTML = markup();
    document.body.appendChild(dialog);
    styleNode = document.createElement("style");
    styleNode.setAttribute("data-kku-style", "");
    document.head.appendChild(styleNode);

    dialog.addEventListener("input", onInput);
    dialog.addEventListener("change", onInput);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("close", function () {
      clearHash();
      styleNode.textContent = "";
      document.documentElement.classList.remove("kku-open");
      if (opener && document.contains(opener)) opener.focus();
    });
    // 바깥(배경) 누르면 닫는다
    dialog.addEventListener("mousedown", function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function syncControls() {
    var sprite = isSprite(font);
    $("[data-kku-base-id]").textContent = font.id;
    $("[data-kku-title]").textContent = font.name + " 꾸미기";
    $("[data-kku-text]").value = state.t;
    $('[data-kku="n"]').value = state.n.replace(/^kku-/, "");
    $('[data-kku="p"]').value = state.p;
    ROLES.forEach(function (role, i) {
      var color = state.c[role.key];
      $('[data-kku-on="' + role.key + '"]').checked = Boolean(color);
      $('[data-kku-color="' + role.key + '"]').value = color || PRESETS[0].colors[i];
    });
    $('[data-kku-g="0"]').value = state.g[0];
    $('[data-kku-g="1"]').value = state.g[1];
    $('[data-kku="ol"]').value = state.ol;
    $('[data-kku="olc"]').value = state.olc;
    $('[data-kku="sh"]').value = state.sh;
    $('[data-kku="shc"]').value = state.shc;
    $('[data-kku="shs"]').value = state.shs;
    $('[data-kku="w"]').value = state.w;
    $('[data-kku="an"]').value = state.an;
    $('[data-kku="vo"]').checked = Boolean(state.vo);
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-kku="vm"]'), function (radio) {
      radio.checked = radio.value === state.vm;
    });
    $('[data-kku="seed"]').value = state.seed;
    ["wob", "vs", "vp", "vw", "vh"].forEach(function (key) {
      $('[data-kku="' + key + '"]').value = state[key];
    });
    var drawNo = $("[data-kku-draw-no]");
    drawNo.hidden = !state.dr;
    drawNo.querySelector("code").textContent = state.dr;
    $("[data-kku-vw-wrap]").hidden = sprite;
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-kku-bg]"), function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-kku-bg") === state.bg));
    });
    $("[data-kku-weight-wrap]").hidden = sprite;
    $("[data-kku-olc-wrap]").hidden = font.paint === "hollow";
    $("[data-kku-outline-legend]").textContent = font.paint === "hollow" ? "관 굵기" : "외곽선";
    $("[data-kku-studio]").href = studioHref(font);
    syncVisibility();
  }

  function syncVisibility() {
    var sprite = isSprite(font);
    $("[data-kku-roles]").hidden = state.p !== "color";
    $("[data-kku-presets]").hidden = state.p === "gradient";
    $("[data-kku-gradient]").hidden = state.p !== "gradient";
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-kku-shadow-more]"), function (node) {
      node.hidden = state.sh === "font" || state.sh === "none";
    });
    var hint = "";
    if (state.p === "font") {
      hint = sprite && font.paint === "sprite"
        ? "자소판 그림의 색 그대로입니다. 색을 고르면 자소판을 마스크로 써서 그 색으로 칠합니다."
        : "글꼴이 정한 색 그대로입니다.";
    } else if (state.p === "color") {
      hint = font.paint === "hollow" ? (font.glow ? "속 빈 관의 색과 빛번짐을 자소 역할마다 바꿉니다." : "속 빈 선 글자의 선 색을 자소 역할마다 바꿉니다.")
        : sprite ? "자소판을 마스크로 써서(--fy-sprite-paint: mask) 자소 역할마다 칠합니다."
        : "초성(완성형 덩어리 포함)·중성·받침을 따로 칠합니다.";
    } else {
      hint = sprite ? "자소판 모양 안을 위→아래 그라데이션으로 칠합니다(--fy-sprite-fill)."
        : "자모 하나하나를 위→아래 그라데이션으로 칠합니다(background-clip: text). 글꼴의 글자 그림자는 지우고, 그림자는 아래에서 다시 고릅니다.";
    }
    $("[data-kku-paint-hint]").textContent = hint;
    $('[data-kku-out="ol"]').textContent = state.ol > 0 ? round(state.ol) + "em" : "없음";
    $('[data-kku-out="shs"]').textContent = "×" + state.shs;
    $('[data-kku-out="wob"]').textContent = state.wob > 0 ? "±" + state.wob + "°" : "없음";
    $('[data-kku-out="vs"]').textContent = state.vs > 0 ? "±" + state.vs + "%" : "없음";
    $('[data-kku-out="vp"]').textContent = state.vp > 0 ? "±" + round(state.vp / 1000) + "em" : "없음";
    $('[data-kku-out="vw"]').textContent = state.vw > 0 ? "±" + state.vw : "없음";
    $('[data-kku-out="vh"]').textContent = state.vh > 0 ? "±" + state.vh + "°" : "없음";
    $("[data-kku-vary-body]").hidden = !state.vo;
    $("[data-kku-seed-wrap]").hidden = state.vm === "auto";
    $("[data-kku-vary-hint]").textContent = font.seed
      ? "이 글꼴은 씨앗에 반응합니다 — 변주를 켜면 글꼴이 정한 자모 흔들림이 살아나고, 아래 폭은 그 위에 더해집니다."
      : "이 글꼴 자체는 씨앗에 반응하지 않습니다 — 아래 폭만큼 페이지 CSS가 자모를 흔듭니다.";
    $("[data-kku-mode-hint]").textContent = state.vm === "auto"
      ? "그릴 때마다 새 씨앗을 뽑습니다(seed=\"auto\") — 새로고침할 때마다 모양이 바뀝니다."
      : "같은 씨앗이면 언제 그려도 같은 모양입니다 — 링크·인쇄·스크린샷이 화면과 같습니다.";
    var hueOn = state.p === "color";
    $('[data-kku="vh"]').disabled = !hueOn;
    $("[data-kku-vh-hint]").textContent = hueOn ? "" : "색조 흔들림은 칠 방식이 '초성·중성·받침 색'일 때 씁니다.";
  }

  function sizeFor(text, base) {
    var glyphs = text.replace(/\s+/g, "").length;
    var px = glyphs <= 3 ? 104 : glyphs <= 6 ? 84 : glyphs <= 10 ? 60 : 44;
    if (base) px = Math.round(px * 0.5);
    return "min(" + px + "px, " + (base ? 5 : 9) + "vw)";
  }

  function setAttr(host, name, value) {
    if (value === null || value === undefined || value === false) {
      if (host.hasAttribute(name)) host.removeAttribute(name);
    } else if (host.getAttribute(name) !== String(value)) {
      host.setAttribute(name, value);
    }
  }

  function render() {
    var css = buildCss(font, state);
    styleNode.textContent = css;
    $("[data-kku-css]").textContent = css;
    $("[data-kku-file]").textContent = state.n + ".css";
    $("[data-kku-class]").textContent = "." + state.n;

    var tone = toneFor(state);
    [$("[data-kku-stage]"), $("[data-kku-stage-base]")].forEach(function (stage) {
      setAttr(stage, "data-tone", tone || null);
    });

    var live = $("[data-kku-live]");
    var original = $("[data-kku-original]");
    var text = state.t || font.name;
    live.className = state.n;
    setAttr(live, "font", font.id);
    setAttr(live, "size", sizeFor(text, false));
    setAttr(live, "seed", seedAttr(state));
    setAttr(live, "jamo-seeds", state.vo ? "" : null);
    setAttr(live, "animate", state.an || null);
    setAttr(original, "font", font.id);
    setAttr(original, "size", sizeFor(text, true));
    [live, original].forEach(function (host) {
      if (window.FontKku && host.getAttribute("data-fy-upgraded") === "true") {
        if ((host.dataset.source || "") !== text) window.FontKku.refresh(host, { text: text });
      } else {
        host.textContent = text;
      }
    });
    // 마스크 칠(--fy-sprite-paint)은 그릴 때 읽는 구조 값이라 스타일이 바뀌면 다시 해소한다
    if (window.FontKku && window.FontKku.refreshAll) window.FontKku.refreshAll(dialog);
    syncVisibility();
    writeHash();
  }

  function onInput(event) {
    var target = event.target;
    var key = target.getAttribute("data-kku");
    if (target.hasAttribute("data-kku-text")) {
      state.t = target.value.trim() || font.name;
    } else if (key === "n") {
      if (event.type !== "change" && !target.value) return;
      state.n = slug(target.value, font.id);
      if (event.type === "change") target.value = state.n.replace(/^kku-/, "");
    } else if (key === "p") {
      state.p = target.value;
      if (state.p === "color" && !state.c.cho && !state.c.jung && !state.c.jong) {
        applyPreset(PRESETS[0]);
        return;
      }
    } else if (key === "ol" || key === "shs" || key === "wob" || key === "vs" || key === "vp" || key === "vw" || key === "vh") {
      state[key] = Number(target.value);
    } else if (key === "vo") {
      state.vo = target.checked ? 1 : 0;
      // 씨앗에 반응하지 않는 글꼴은 폭이 모두 0이면 켜도 그대로라, 기울기부터 조금 준다
      if (state.vo && !font.seed && !state.wob && !state.vs && !state.vp && !state.vw && !state.vh) state.wob = 4;
      syncControls();
    } else if (key === "vm") {
      if (!target.checked) return;
      state.vm = target.value;
    } else if (key === "seed") {
      if (SEED.test(target.value)) {
        state.seed = target.value;
      } else if (event.type === "change") {
        target.value = state.seed;
        return;
      } else {
        return;
      }
    } else if (key === "sh") {
      state.sh = target.value;
      state.shc = SHADOW_COLORS[state.sh];
      $('[data-kku="shc"]').value = state.shc;
    } else if (key) {
      state[key] = target.value;
    } else if (target.hasAttribute("data-kku-color")) {
      var role = target.getAttribute("data-kku-color");
      state.c[role] = target.value;
      $('[data-kku-on="' + role + '"]').checked = true;
    } else if (target.hasAttribute("data-kku-on")) {
      var on = target.getAttribute("data-kku-on");
      state.c[on] = target.checked ? $('[data-kku-color="' + on + '"]').value : null;
    } else if (target.hasAttribute("data-kku-g")) {
      state.g[Number(target.getAttribute("data-kku-g"))] = target.value;
    } else {
      return;
    }
    render();
  }

  function applyPreset(preset) {
    state.p = "color";
    ROLES.forEach(function (role, i) {
      state.c[role.key] = preset.colors[i];
    });
    syncControls();
    render();
  }

  function flash(button, message) {
    var label = button.getAttribute("data-label") || button.textContent;
    button.setAttribute("data-label", label);
    button.textContent = message;
    setTimeout(function () { button.textContent = label; }, 1600);
  }

  function onClick(event) {
    var button = event.target.closest("button, a");
    if (!button || !dialog.contains(button)) return;
    if (button.hasAttribute("data-kku-close")) {
      dialog.close();
      return;
    }
    if (button.hasAttribute("data-kku-bg")) {
      state.bg = button.getAttribute("data-kku-bg");
      syncControls();
      render();
      return;
    }
    if (button.hasAttribute("data-kku-preset")) {
      applyPreset(PRESETS[Number(button.getAttribute("data-kku-preset"))]);
      return;
    }
    if (button.hasAttribute("data-kku-reseed")) {
      if (!state.vo) {
        state.vo = 1;
        if (!font.seed && !state.wob && !state.vs && !state.vp && !state.vw && !state.vh) state.wob = 6;
      }
      if (state.vm === "fixed") state.seed = randomSeed();
      syncControls();
      render();
      // 매번 새로(seed="auto")는 다시 그릴 때 새 씨앗을 뽑는다
      if (state.vm === "auto" && window.FontKku) window.FontKku.refresh($("[data-kku-live]"));
      return;
    }
    if (button.hasAttribute("data-kku-replay")) {
      var live = $("[data-kku-live]");
      if (window.FontKku) window.FontKku.refresh(live);
      return;
    }
    var action = button.getAttribute("data-kku-action");
    if (!action) return;
    if (action === "draw") {
      draw(null, opener);
      return;
    }
    var css = buildCss(font, state);
    if (action === "css") config.copyText(css, button);
    if (action === "html") config.copyText(buildHtml(state, css), button);
    if (action === "ai") config.copyText(aiPrompt(state, css), button);
    if (action === "link") {
      config.copyText(location.origin + location.pathname + location.search + "#kku=" + encodeState(state), button);
    }
    if (action === "download") {
      var blob = new Blob([css], { type: "text/css;charset=utf-8" });
      var link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = state.n + ".css";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      flash(button, "내려받음");
    }
    if (action === "reset") {
      state = defaults(font, state.t);
      syncControls();
      render();
      flash(button, "처음으로 되돌림");
    }
  }

  // ── 글꼴 뽑기 ─────────────────────────────────────────

  function randomSeed() {
    return Math.random().toString(36).slice(2, 7) || "kku";
  }

  function hash32(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // mulberry32 — 뽑기 씨앗 하나에서 같은 순서의 수를 낸다
  function prng(seed) {
    var a = hash32("kku-draw|" + seed);
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hslHex(h, sat, light) {
    var s = sat / 100;
    var l = light / 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return "#" + [f(0), f(8), f(4)].map(function (v) {
      return ("0" + Math.round(v * 255).toString(16)).slice(-2);
    }).join("");
  }

  /* 뽑기 씨앗 → 꾸미기 상태. 같은 씨앗은 언제나 같은 상태다. 어두운 바탕 글꼴에는 밝은 색,
   * 밝은 바탕 글꼴에는 짙은 색을 골라 글자와 바탕이 겹치지 않는다. 미리보기 바탕은 글꼴 권장 바탕. */
  function drawState(seed) {
    var rand = prng(seed);
    function one(list) { return list[Math.floor(rand() * list.length) % list.length]; }
    var pool = [];
    config.fonts.forEach(function (item) {
      // 출발용 뼈대와, 옛 #kku= 링크를 열려고만 둔 꾸러미 글꼴(legacy)은 뽑지 않는다
      if (item.id === "sprite-example" || item.legacy) return;
      var weight = item.group === "derived" ? 3 : 2;
      for (var i = 0; i < weight; i += 1) pool.push(item);
    });
    var item = one(pool);
    var sprite = isSprite(item);
    var dark = DARK_TONES.indexOf(item.tone) !== -1;
    var s = defaults(item, config.text());
    s.n = "kku-draw-" + seed;
    s.dr = seed;
    s.seed = seed;

    var h0 = rand() * 360;
    var spread = one([[0, 35, 70], [0, 120, 240], [0, 150, 210], [0, 180, 30]]);
    var sat = 70 + rand() * 25;
    var light = dark ? 68 + rand() * 12 : 36 + rand() * 14;
    var palette = spread.map(function (step) {
      return hslHex((h0 + step) % 360, sat, Math.max(30, Math.min(84, light + rand() * 8 - 4)));
    });

    if (item.paint === "hollow") {
      s.p = rand() < 0.75 ? "color" : "font";
    } else {
      var r = rand();
      s.p = r < 0.25 ? "font" : r < 0.78 ? "color" : "gradient";
    }
    s.c = { cho: palette[0], jung: palette[1], jong: palette[2] };
    s.g = [palette[0], palette[2]];

    if (rand() < (item.paint === "hollow" ? 0.4 : 0.3)) {
      s.ol = item.paint === "hollow" ? one([0.025, 0.035]) : sprite ? one([0.01, 0.015]) : one([0.01, 0.015, 0.02, 0.025]);
      s.olc = dark ? "#ffffff" : mix(palette[0], "#000000", 0.65);
    }

    var shadows = dark ? ["font", "glow", "float", "font"]
      : item.tone ? ["font", "extrude", "sticker", "float"]
      : ["font", "extrude", "float", "none"];
    s.sh = one(shadows);
    s.shc = s.sh === "extrude" ? mix(palette[1], "#000000", 0.55)
      : s.sh === "glow" ? palette[0]
      : SHADOW_COLORS[s.sh];
    s.shs = one([1, 1, 1.25, 1.5]);

    if (!sprite && rand() < 0.3) s.w = one(["500", "600", "700", "800", "900"]);

    if (rand() < (item.seed ? 0.85 : 0.6)) {
      s.vo = 1;
      s.vm = "fixed";
      s.wob = 2 + Math.floor(rand() * 7);
      s.vs = rand() < 0.5 ? 2 + Math.floor(rand() * 5) : 0;
      s.vp = rand() < 0.4 ? 5 * (1 + Math.floor(rand() * 3)) : 0;
      s.vw = !sprite && rand() < 0.3 ? 50 * (1 + Math.floor(rand() * 3)) : 0;
      s.vh = s.p === "color" && rand() < 0.35 ? 10 + 5 * Math.floor(rand() * 5) : 0;
    }
    if (rand() < 0.25) s.an = one(DRAW_MOTIONS);
    return sanitize(s);
  }

  function draw(seed, trigger) {
    var key = typeof seed === "string" && SEED.test(seed) ? seed.toLowerCase() : randomSeed();
    var drawn = drawState(key);
    open(drawn.f, drawn, trigger);
    return key;
  }

  function open(id, initial, trigger) {
    var item = fontById(id);
    if (!item) return false;
    if (!dialog) build();
    font = item;
    state = initial && initial.f === id ? initial : defaults(item, config.text());
    opener = trigger || document.activeElement;
    syncControls();
    if (!dialog.open) {
      hashBefore = /^#kku=/.test(location.hash) ? "" : location.hash;
      dialog.showModal();
      document.documentElement.classList.add("kku-open");
    }
    render();
    $("[data-kku-close]").focus();
    return true;
  }

  function init(options) {
    config = {
      fonts: options.fonts,
      text: options.text || function () { return ""; },
      cdn: options.cdn,
      runtime: options.runtime || options.cdn + "font-kku.js",
      skillUrl: options.skillUrl,
      copyText: options.copyText
    };
    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-customize-font]");
      if (!button) return;
      open(button.getAttribute("data-customize-font"), null, button);
    });
    restoreFromHash();
    // 같은 페이지 안에서 #kku= 링크를 눌러도 연다(해시 쓰기는 replaceState라 이 이벤트를 내지 않는다)
    window.addEventListener("hashchange", restoreFromHash);
  }

  function restoreFromHash() {
    var match = /^#kku=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!match) return;
    var restored = sanitize(decodeState(match[1]));
    if (restored) {
      var row = document.querySelector('[data-customize-font="' + restored.f + '"]');
      open(restored.f, restored, row);
    }
  }

  window.FontKkuCustomizer = {
    init: init,
    open: open,
    close: function () { if (dialog && dialog.open) dialog.close(); },
    state: function () { return state; },
    css: function () { return font && state ? buildCss(font, state) : ""; },
    draw: function (seed, trigger) {
      if (!config) return null;
      return draw(seed, trigger || document.activeElement);
    },
    drawState: function (seed) { return config ? drawState(String(seed)) : null; },
    // 상태 하나의 CSS와 태그 속성 — 글꼴 페이지의 뽑기 미리보기가 꾸미기 창 밖에서 그릴 때 쓴다
    cssFor: function (s) {
      var item = s && fontById(s.f);
      return item ? buildCss(item, s) : "";
    },
    seedFor: function (s) { return s ? seedAttr(s) : null; },
    encode: encodeState,
    decode: function (text) { return sanitize(decodeState(text)); }
  };
})();
