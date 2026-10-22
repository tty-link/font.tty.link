/* font-kku-publish-check.js — 게시 미리 검사(엄격 단계, ADR-033 §7 '남이 쓴 CSS의 안전', PLAN-DEVSITE-001 D5)
 *
 * 남의 페이지가 실을 글꼴 CSS를 게시하기 전에 보는 검사다. 글꼴 계약 린트(font-kku-lint.js — 범위는 그 글꼴의
 * :where([data-fy-font="<id>"]) 안만, 등록된 --fy-* 와 계약이 허용한 속성만, @import·바깥 url() 거절)를 그대로 돌리고
 * 그 위에 게시 단계 규칙을 더한다. 저장은 막지 않는다 — 개발·검수 사이트는 결과를 저장 뒤 파이프라인과 고치기 화면에 보이기만 한다.
 *
 *   FontKkuPublishCheck.check(cssText, { fileName, fontId, readAsset, digest }) →
 *     { ok, stage: "publish", fontId, errors, warnings,
 *       findings: [{ severity, stage: "contract" | "publish", code, message, line, column, url? }],
 *       assets: [{ url, kind: "svg" | "png" | "font" | "other", source: "data" | "file", bytes, ok, reencode? }],
 *       notes: [글], limits }
 *
 *   readAsset(url) — 글꼴 파일 기준 상대 주소(./sheet.svg)를 읽는다. 돌려주는 값:
 *     null(읽을 곳이 없음 — 경고 publish-asset-unchecked) · { missing: true }(없음 — 오류) · { bytes: Uint8Array|Buffer }.
 *
 * 게시 단계 규칙(모두 오류, 읽지 못한 자산만 경고):
 *   publish-font-id   글꼴 id가 없거나 런타임 규칙(^[a-z0-9][a-z0-9-]*$) 밖, fileName과 fontId가 다름
 *   publish-alias     alias shim(spec/fonts.json의 별칭 파일)은 게시하지 않는다 — 원래 글꼴을 게시
 *   publish-size      CSS가 512KB를 넘음 · 자산이 64개를 넘음
 *   publish-markup    </style·<script·<!--·--> — CSS를 <style>에 넣어 싣는 페이지를 깨거나 HTML을 끼움
 *   publish-unit      화면·컨테이너 크기 단위(vw·vh·vmin·vmax·dvh·cqw …) — 글꼴이 페이지 크기에 기댐
 *   publish-math      pow()·exp()·infinity·NaN — 값의 크기를 가늠할 수 없음
 *   publish-magnitude 거대 크기 — 위치·크기·획·칠(그림자)·자르기·배율·굵기마다 상한(아래 CAPS, 수식은 곱·나눗셈을 모두 곱으로 보는 보수적 상한)
 *   publish-url       url(#…)(페이지 문서의 요소), 글꼴 꾸러미 밖 상대 주소(.. · \ · % · ? · /로 시작),
 *                     허용하지 않는 확장자·data: 종류, @font-face 밖의 글꼴 파일·@font-face 안의 그림
 *   publish-font-face @font-face font-family가 "font-kku-<id>"로 시작하지 않음(페이지의 다른 글꼴 이름을 가로챔)
 *   publish-asset     자산이 없음 · 너무 큼(SVG 1MB, PNG·글꼴 4MB)
 *   publish-svg       SVG가 그림 허용 목록(font-studio-draw-model.js sanitizeSvg — 작업실 SVG 가져오기와 같은 목록)에서
 *                     거절·버림이 있음(스크립트·이벤트 속성·foreignObject·글자·그림·use·style·url() 참조·외부 주소)
 *   publish-png       PNG 서명·IHDR·덩어리·IEND가 맞지 않음, 4096px 넘음, IEND 뒤 덧붙은 바이트. 다시 인코딩은 서비스 때 한다(notes)
 *   publish-font-file 글꼴 파일 머리(wOF2·wOFF·OTTO·true·0x00010000)가 아님
 *
 * Node(devsite Node 일꾼, tests)와 브라우저가 같은 코드를 쓴다(classic script, 전역 FontKkuPublishCheck).
 */
(function (global) {
  "use strict";

  var hasRequire = typeof require === "function";
  var Lint = global.FontKkuLint || (hasRequire ? require("./font-kku-lint.js") : null);
  var Model = global.FontStudioModel || (hasRequire ? require("./font-studio-model.js") : null);
  var Draw = global.FontStudioDrawModel || (hasRequire ? require("./font-studio-draw-model.js") : null);

  var FONT_ID = /^[a-z0-9][a-z0-9-]*$/;
  var LIMITS = {
    cssBytes: 512 * 1024,
    assets: 64,
    svgBytes: 1024 * 1024,
    pngBytes: 4 * 1024 * 1024,
    fontBytes: 4 * 1024 * 1024,
    pngSide: 4096,
    svgCommands: 500000
  };

  /* 값 종류마다 상한. em은 글자 크기 단위 길이를 em으로 바꾼 값(px/16 등), pct는 %, num은 단위 없는 수.
   * 지금 기본 제공 22개 글꼴이 쓰는 가장 큰 값(위치 61%·0.4em, 크기 1.2em, 배율 1.72, 그림자 0.6em, 자르기 1em·58%, 획 0.047em)의
   * 몇 배를 둔다. 페이지 위 다른 곳에 칠하거나 페이지를 덮는 값(수백 em, 수천 %)을 막는 것이 목적이다. */
  var CAPS = {
    position: { em: 2, pct: 200, num: 1000, label: "위치(top·left·dx·dy)" },
    size: { em: 4, pct: 400, num: 1000, label: "크기(size)" },
    stroke: { em: 0.5, pct: 50, num: 1000, label: "획 두께" },
    paint: { em: 1, pct: 100, num: 1000, label: "칠(그림자·밑줄·빛)" },
    clip: { em: 4, pct: 200, num: 1000, label: "자르기(clip)" },
    scale: { em: 8, pct: 800, num: 8, label: "배율(scale·zoom)" },
    weight: { em: 8, pct: 1000, num: 1000, label: "굵기(weight)" },
    other: { em: 8, pct: 1000, num: 1000, label: "값" }
  };

  /* 글자 크기에 대한 길이 단위 → em. 화면·컨테이너 단위는 따로 거절한다 */
  var LENGTH_EM = {
    em: 1, rem: 1, ex: 0.5, rex: 0.5, ch: 0.5, rch: 0.5, cap: 0.7, rcap: 0.7, ic: 1, ric: 1, lh: 1.2, rlh: 1.2,
    px: 1 / 16, pt: 1 / 12, pc: 1, "in": 6, cm: 96 / 2.54 / 16, mm: 96 / 25.4 / 16, q: 96 / 101.6 / 16
  };
  var VIEWPORT_UNITS = /^(?:[sld]?v(?:w|h|i|b|min|max)|cq(?:w|h|i|b|min|max))$/;
  var MATH_FUNCTIONS = {
    calc: true, min: true, max: true, clamp: true, round: true, mod: true, rem: true, abs: true, sign: true, sqrt: true,
    hypot: true, sin: true, cos: true, tan: true, asin: true, acos: true, atan: true, atan2: true, log: true
  };
  var REFUSED_FUNCTIONS = { pow: true, exp: true };
  var COLOR_FUNCTIONS = {
    rgb: true, rgba: true, hsl: true, hsla: true, hwb: true, lab: true, lch: true, oklab: true, oklch: true, color: true,
    "color-mix": true, "light-dark": true, "device-cmyk": true
  };
  var IMAGE_EXT = { svg: "svg", png: "png" };
  var FONT_EXT = { woff2: "font", woff: "font", ttf: "font", otf: "font" };
  var DATA_TYPES = {
    "image/svg+xml": "svg", "image/png": "png",
    "font/woff2": "font", "font/woff": "font", "font/ttf": "font", "font/otf": "font", "font/sfnt": "font",
    "application/font-woff": "font", "application/font-woff2": "font", "application/x-font-ttf": "font",
    "application/x-font-opentype": "font", "application/vnd.ms-opentype": "font", "application/font-sfnt": "font"
  };

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function shorten(text, limit) {
    var value = String(text).replace(/\s+/g, " ");
    return value.length > limit ? value.slice(0, limit - 1) + "…" : value;
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).length;
    }
    return unescape(encodeURIComponent(text)).length;
  }

  function utf8Text(bytes) {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) {
      out += String.fromCharCode(bytes[i]);
    }
    return decodeURIComponent(escape(out));
  }

  function base64Bytes(text) {
    var clean = String(text).replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
      return null;
    }
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      return new Uint8Array(Buffer.from(clean, "base64"));
    }
    var binary = atob(clean);
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function percentBytes(text) {
    try {
      var decoded = decodeURIComponent(text);
      if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(decoded);
      }
      var raw = unescape(encodeURIComponent(decoded));
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i += 1) {
        out[i] = raw.charCodeAt(i);
      }
      return out;
    } catch (error) {
      return null;
    }
  }

  function stripComments(value) {
    return String(value).replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  }

  /* 글꼴 파일 기준 상대 주소와 data: 주소를 읽는다(따옴표·이스케이프 없는 꼴과 따옴표 꼴) */
  function readUrls(value) {
    var out = [];
    var pattern = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s"']*))\s*\)/gi;
    var match;
    var text = stripComments(value);
    while ((match = pattern.exec(text))) {
      var raw = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3];
      out.push(raw.replace(/\\(.)/g, "$1"));
    }
    return out;
  }

  function category(name) {
    var lower = String(name).toLowerCase();
    if (/^(?:text-shadow|text-underline-offset|text-decoration-thickness)$/.test(lower) || /-(?:glow|dilate|filter)$/.test(lower)) {
      return "paint";
    }
    if (/^--fy-.*-(?:top|left|dx|dy)$/.test(lower)) {
      return "position";
    }
    if (/^--fy-.*-size$/.test(lower)) {
      return "size";
    }
    if (/^--fy-.*-(?:scale|scale-x|scale-y|zoom)$/.test(lower)) {
      return "scale";
    }
    if (/^--fy-.*-weight$/.test(lower)) {
      return "weight";
    }
    if (/^--fy-.*-(?:stroke|element-width|element-outline)$/.test(lower)) {
      return "stroke";
    }
    if (/^--fy-.*-clip$/.test(lower)) {
      return "clip";
    }
    return "other";
  }

  function isIdentStart(ch) {
    return /[A-Za-z_\u0080-￿]/.test(ch);
  }

  /* 값 하나를 훑어 수·단위·함수 자리를 모은다. 문자열·url()·주석·#색은 건너뛴다.
   * → { numbers: [{ value, unit, math: 묶음 번호|-1, color, op }], idents: [이름], functions: [이름] } */
  function scanValue(value) {
    var text = stripComments(value)
      .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ")
      .replace(/url\([^)]*\)/gi, " ");
    var out = { numbers: [], idents: [], functions: [] };
    var stack = [];
    var groups = 0;
    var lastOp = null;
    var prev = "";
    var i = 0;
    while (i < text.length) {
      var ch = text.charAt(i);
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === "#") {
        i += 1;
        while (i < text.length && /[0-9A-Za-z_-]/.test(text.charAt(i))) {
          i += 1;
        }
        prev = "x";
        continue;
      }
      /* 수는 늘 낱말 밖에서 시작한다(낱말 안의 숫자 x2·--fy-2x는 아래 낱말 갈래가 통째로 읽는다). 부호는 앞이 값이 아닐 때만 */
      var numberMatch = null;
      var re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
      var signed = (ch === "+" || ch === "-") && !/[A-Za-z0-9_)%.-]/.test(prev);
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(text.charAt(i + 1))) ||
          (signed && /[0-9.]/.test(text.charAt(i + 1)))) {
        re.lastIndex = i;
        numberMatch = re.exec(text);
      }
      if (numberMatch) {
        i = re.lastIndex;
        var unit = "";
        if (text.charAt(i) === "%") {
          unit = "%";
          i += 1;
        } else {
          var unitRe = /[A-Za-z]+/y;
          unitRe.lastIndex = i;
          var unitMatch = unitRe.exec(text);
          if (unitMatch) {
            unit = unitMatch[0].toLowerCase();
            i = unitRe.lastIndex;
          }
        }
        var mathAt = -1;
        var color = false;
        for (var depth = stack.length - 1; depth >= 0; depth -= 1) {
          if (!color && COLOR_FUNCTIONS[stack[depth].name] && mathAt < 0) {
            color = true;
          }
          if (MATH_FUNCTIONS[stack[depth].name]) {
            mathAt = stack[depth].group;
          }
        }
        out.numbers.push({ value: Number(numberMatch[0]), unit: unit, math: mathAt, color: color, op: lastOp });
        lastOp = null;
        prev = "1";
        continue;
      }
      if (isIdentStart(ch) || (ch === "-" && (isIdentStart(text.charAt(i + 1)) || text.charAt(i + 1) === "-"))) {
        var start = i;
        i += 1;
        while (i < text.length && /[A-Za-z0-9_\u0080-￿-]/.test(text.charAt(i))) {
          i += 1;
        }
        var name = text.slice(start, i).toLowerCase();
        if (text.charAt(i) === "(") {
          var inMath = stack.some(function (frame) { return MATH_FUNCTIONS[frame.name]; });
          var group = MATH_FUNCTIONS[name] && !inMath ? ++groups : stack.length ? stack[stack.length - 1].group : 0;
          stack.push({ name: name, group: group });
          out.functions.push(name);
          i += 1;
          prev = "(";
          lastOp = null;
          continue;
        }
        out.idents.push(name);
        prev = "a";
        continue;
      }
      if (ch === "(") {
        stack.push({ name: "", group: stack.length ? stack[stack.length - 1].group : 0 });
        prev = "(";
        i += 1;
        continue;
      }
      if (ch === ")") {
        stack.pop();
        prev = ")";
        i += 1;
        continue;
      }
      if (ch === "*" || ch === "/" || ch === "+" || ch === "-") {
        lastOp = ch;
      } else if (ch === ",") {
        lastOp = null;
      }
      prev = ch;
      i += 1;
    }
    return out;
  }

  /* 한 선언의 크기 문제 → [{ code, message }] */
  function magnitudeProblems(name, value) {
    var problems = [];
    var scan = scanValue(value);
    var cat = category(name);
    var caps = CAPS[cat];
    scan.functions.forEach(function (fn) {
      if (REFUSED_FUNCTIONS[fn]) {
        problems.push({ code: "publish-math", message: name + ": " + fn + "() — 값의 크기를 가늠할 수 없는 함수는 게시하지 않습니다" });
      }
    });
    scan.idents.forEach(function (ident) {
      if (ident === "infinity" || ident === "-infinity" || ident === "nan") {
        problems.push({ code: "publish-math", message: name + ": " + ident + " — 끝없는 값은 게시하지 않습니다" });
      }
    });
    var groups = {};
    scan.numbers.forEach(function (n) {
      var abs = Math.abs(n.value);
      if (n.unit && n.unit !== "%" && VIEWPORT_UNITS.test(n.unit)) {
        problems.push({ code: "publish-unit", message: name + ": " + n.value + n.unit + " — 화면·컨테이너 크기 단위는 글꼴을 싣는 페이지 크기에 기댑니다. em·%로 씁니다" });
        return;
      }
      if (!isFinite(n.value)) {
        problems.push({ code: "publish-math", message: name + ": 읽을 수 없는 수 " + n.value });
        return;
      }
      if (n.math >= 0) {
        var g = groups[n.math] || (groups[n.math] = { em: 0, pct: 0, factor: 1, numbers: 0, text: [] });
        if (n.unit === "") {
          if (!n.color) {
            g.numbers += 1;
            var factor = n.op === "/" ? (abs > 0 ? 1 / abs : Infinity) : abs;
            g.factor *= Math.max(1, factor);
            g.text.push((n.op === "/" ? "/" : "") + n.value);
          }
        } else if (n.unit === "%") {
          if (!n.color) {
            g.pct = Math.max(g.pct, abs);
          }
        } else if (own(LENGTH_EM, n.unit)) {
          g.em = Math.max(g.em, abs * LENGTH_EM[n.unit]);
        }
        return;
      }
      if (n.color) {
        return; // 색 채널(rgb 255·hsl 100% 등)
      }
      if (n.unit === "") {
        if (abs > caps.num) {
          problems.push({ code: "publish-magnitude", message: name + ": " + n.value + " — " + caps.label + "은 " + caps.num + "까지입니다" });
        }
      } else if (n.unit === "%") {
        if (abs > caps.pct) {
          problems.push({ code: "publish-magnitude", message: name + ": " + n.value + "% — " + caps.label + "은 " + caps.pct + "%까지입니다" });
        }
      } else if (own(LENGTH_EM, n.unit)) {
        if (abs * LENGTH_EM[n.unit] > caps.em) {
          problems.push({ code: "publish-magnitude", message: name + ": " + n.value + n.unit + " — " + caps.label + "은 " + caps.em + "em(약 " + Math.round(caps.em * 16) + "px)까지입니다" });
        }
      }
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      var em = g.em * g.factor;
      var pct = g.pct * g.factor;
      var bound = g.em === 0 && g.pct === 0 && g.numbers > 0 ? g.factor : 0;
      var why = g.text.length ? " — 수식의 수 " + g.text.slice(0, 4).join("·") + "를 곱한 보수적 상한" : "";
      if (em > caps.em) {
        problems.push({ code: "publish-magnitude", message: name + ": 수식 값이 " + (Math.round(em * 1000) / 1000) + "em까지 갈 수 있습니다" + why + ". " + caps.label + "은 " + caps.em + "em까지입니다" });
      }
      if (pct > caps.pct) {
        problems.push({ code: "publish-magnitude", message: name + ": 수식 값이 " + (Math.round(pct * 10) / 10) + "%까지 갈 수 있습니다" + why + ". " + caps.label + "은 " + caps.pct + "%까지입니다" });
      }
      if (bound > caps.num) {
        problems.push({ code: "publish-magnitude", message: name + ": 수식 값이 " + (Math.round(bound * 1000) / 1000) + "까지 갈 수 있습니다" + why + ". " + caps.label + "은 " + caps.num + "까지입니다" });
      }
    });
    return problems;
  }

  // ── 자산 ────────────────────────────────────────────────────────────────

  function extensionOf(path) {
    var match = /\.([A-Za-z0-9]+)$/.exec(path);
    return match ? match[1].toLowerCase() : "";
  }

  /* 상대 주소가 글꼴 꾸러미 안인지. 문제 글 또는 null */
  function relativeProblem(url) {
    if (url.charAt(0) === "#") {
      return "url(" + shorten(url, 40) + ") — 페이지 문서의 요소를 가리킵니다. 게시 글꼴은 제 꾸러미의 파일이나 data:만 씁니다";
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.slice(0, 2) === "//" || url.charAt(0) === "/") {
      return null; // 원격·절대·사이트 루트는 계약 린트(url)가 이미 거절한다
    }
    if (/[\\%?#]/.test(url) || /(^|\/)\.\.(\/|$)/.test(url) || /[\u0000-\u001f]/.test(url)) {
      return "url(" + shorten(url, 60) + ") — 글꼴 꾸러미 밖이나 알 수 없는 주소(.. · \\ · % · ? · #)입니다. ./이름.svg처럼 씁니다";
    }
    return null;
  }

  function pngProblem(bytes) {
    var sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 33) {
      return "PNG가 너무 짧습니다";
    }
    for (var i = 0; i < 8; i += 1) {
      if (bytes[i] !== sig[i]) {
        return "PNG 서명이 아닙니다";
      }
    }
    var at = 8;
    var first = true;
    var width = 0;
    var height = 0;
    var ended = false;
    while (at + 12 <= bytes.length) {
      var length = ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
      var type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
      if (!/^[A-Za-z]{4}$/.test(type) || at + 12 + length > bytes.length) {
        return "PNG 덩어리(" + type.replace(/[^\x20-\x7e]/g, "?") + ")가 잘렸거나 이상합니다";
      }
      if (first) {
        if (type !== "IHDR" || length !== 13) {
          return "PNG 첫 덩어리가 IHDR이 아닙니다";
        }
        width = ((bytes[at + 8] << 24) >>> 0) + (bytes[at + 9] << 16) + (bytes[at + 10] << 8) + bytes[at + 11];
        height = ((bytes[at + 12] << 24) >>> 0) + (bytes[at + 13] << 16) + (bytes[at + 14] << 8) + bytes[at + 15];
        first = false;
      }
      at += 12 + length;
      if (type === "IEND") {
        ended = true;
        break;
      }
    }
    if (!ended) {
      return "PNG에 IEND가 없습니다";
    }
    if (at !== bytes.length) {
      return "PNG IEND 뒤에 " + (bytes.length - at) + "바이트가 덧붙어 있습니다(다른 파일을 숨긴 꼴)";
    }
    if (!width || !height || width > LIMITS.pngSide || height > LIMITS.pngSide) {
      return "PNG 크기 " + width + "×" + height + " — 한 변 " + LIMITS.pngSide + "px까지입니다";
    }
    return null;
  }

  function fontFileProblem(bytes) {
    if (bytes.length < 12) {
      return "글꼴 파일이 너무 짧습니다";
    }
    var tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (tag === "wOF2" || tag === "wOFF" || tag === "OTTO" || tag === "true" ||
        (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) {
      return null;
    }
    return "글꼴 파일 머리(wOF2·wOFF·OTTO·true)가 아닙니다";
  }

  function svgProblems(text) {
    if (!Draw || typeof Draw.sanitizeSvg !== "function") {
      return ["SVG 허용 목록(font-studio-draw-model.js sanitizeSvg)을 싣지 못했습니다"];
    }
    var result = Draw.sanitizeSvg(text, { maxBytes: LIMITS.svgBytes, maxCommands: LIMITS.svgCommands, maxDepth: 64 });
    if (result.refused) {
      return ["SVG 거절 — " + result.refused.message];
    }
    var seen = {};
    var out = [];
    result.rejected.forEach(function (entry) {
      var key = entry.code + "|" + (entry.attribute ? "@" : entry.element);
      if (seen[key]) {
        seen[key].count += 1;
        return;
      }
      seen[key] = { count: 1, index: out.length };
      out.push(entry.message);
    });
    Object.keys(seen).forEach(function (key) {
      if (seen[key].count > 1) {
        out[seen[key].index] += " (" + seen[key].count + "곳)";
      }
    });
    return out;
  }

  /* data: 주소 → { type, bytes } 또는 { problem } */
  function readDataUrl(url) {
    var match = /^data:([^,]*),([\s\S]*)$/i.exec(url);
    if (!match) {
      return { problem: "읽을 수 없는 data: 주소" };
    }
    var meta = match[1].split(";").map(function (part) { return part.trim().toLowerCase(); });
    var type = meta[0] || "text/plain";
    var base64 = meta.indexOf("base64") > 0;
    var bytes = base64 ? base64Bytes(match[2]) : percentBytes(match[2]);
    if (!bytes) {
      return { type: type, problem: "data: 내용을 풀지 못했습니다(" + (base64 ? "base64" : "퍼센트 인코딩") + ")" };
    }
    return { type: type, bytes: bytes };
  }

  // ── 검사 ────────────────────────────────────────────────────────────────

  function createReport() {
    var list = [];
    var seen = {};
    function add(severity, stage, code, message, at, url) {
      var line = at && at.line ? at.line : 1;
      var column = at && at.column ? at.column : 1;
      var key = stage + code + "@" + line + ":" + column + ":" + message;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      var entry = { severity: severity, stage: stage, code: code, message: message, line: line, column: column };
      if (url) {
        entry.url = url;
      }
      list.push(entry);
    }
    return {
      list: list,
      error: function (code, message, at, url) { add("error", "publish", code, message, at, url); },
      warning: function (code, message, at, url) { add("warning", "publish", code, message, at, url); },
      contract: function (finding) {
        var entry = { severity: finding.severity, stage: "contract", code: finding.code, message: finding.message,
          line: finding.line || 1, column: finding.column || 1 };
        if (finding.detail) {
          entry.detail = finding.detail;
        }
        list.push(entry);
      }
    };
  }

  function fontIdFromFile(fileName) {
    if (!fileName) {
      return null;
    }
    var base = String(fileName).split(/[\\/]/).pop();
    var match = /^(.+)\.css$/i.exec(base);
    return match ? match[1] : null;
  }

  function checkAsset(url, where, inFontFace, readAsset, report, assets, cache) {
    var isData = /^data:/i.test(url);
    if (!isData) {
      var problem = relativeProblem(url);
      if (problem) {
        report.error("publish-url", where.name + ": " + problem, where, url);
        return;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.slice(0, 2) === "//" || url.charAt(0) === "/") {
        return; // 계약 린트가 거절
      }
    }
    var kind;
    var bytes = null;
    if (isData) {
      var data = readDataUrl(url);
      kind = own(DATA_TYPES, data.type) ? DATA_TYPES[data.type] : "other";
      if (kind === "other") {
        report.error("publish-url", where.name + ": data:" + shorten(data.type, 40) + " — 게시 글꼴은 SVG·PNG(그림)와 woff2·woff·ttf·otf(@font-face)만 data:로 씁니다", where, shorten(url, 80));
        assets.push({ url: shorten(url, 80), kind: kind, source: "data", bytes: data.bytes ? data.bytes.length : 0, ok: false });
        return;
      }
      if (data.problem) {
        report.error("publish-asset", where.name + ": " + data.problem, where, shorten(url, 80));
        assets.push({ url: shorten(url, 80), kind: kind, source: "data", bytes: 0, ok: false });
        return;
      }
      bytes = data.bytes;
    } else {
      var ext = extensionOf(url);
      kind = own(IMAGE_EXT, ext) ? IMAGE_EXT[ext] : own(FONT_EXT, ext) ? FONT_EXT[ext] : "other";
      if (kind === "other") {
        report.error("publish-url", where.name + ": url(" + shorten(url, 60) + ") — 게시 글꼴의 파일은 .svg·.png(그림)와 .woff2·.woff·.ttf·.otf(@font-face)만 씁니다", where, url);
        assets.push({ url: url, kind: kind, source: "file", bytes: 0, ok: false });
        return;
      }
    }
    var label = isData ? shorten(url, 80) : url;
    if (kind === "font" && !inFontFace) {
      report.error("publish-url", where.name + ": 글꼴 파일은 @font-face src에만 씁니다", where, label);
    } else if (kind !== "font" && inFontFace) {
      report.error("publish-url", where.name + ": @font-face src에는 글꼴 파일만 씁니다(그림 " + kind + ")", where, label);
    }
    if (!isData) {
      if (own(cache, url)) {
        bytes = cache[url];
      } else {
        var read = typeof readAsset === "function" ? readAsset(url) : null;
        if (read === null || read === undefined) {
          report.warning("publish-asset-unchecked", where.name + ": url(" + url + ")의 파일을 읽을 곳이 없어 보지 못했습니다 — 저장소·세션 글꼴로 검사하면 함께 봅니다", where, url);
          assets.push({ url: url, kind: kind, source: "file", bytes: 0, ok: null });
          cache[url] = null;
          return;
        }
        if (read.missing || !read.bytes) {
          report.error("publish-asset", where.name + ": url(" + url + ") — 파일이 없습니다" + (read.error ? "(" + read.error + ")" : ""), where, url);
          assets.push({ url: url, kind: kind, source: "file", bytes: 0, ok: false });
          cache[url] = false;
          return;
        }
        bytes = read.bytes instanceof Uint8Array ? read.bytes : new Uint8Array(read.bytes);
        cache[url] = bytes;
      }
      if (bytes === null || bytes === false) {
        return; // 같은 파일 — 이미 적음
      }
      if (assets.some(function (asset) { return asset.url === url && asset.source === "file"; })) {
        return;
      }
    }
    var entry = { url: label, kind: kind, source: isData ? "data" : "file", bytes: bytes.length, ok: true };
    var problems = [];
    if (kind === "svg") {
      if (bytes.length > LIMITS.svgBytes) {
        report.error("publish-asset", where.name + ": SVG " + bytes.length + "바이트 — " + LIMITS.svgBytes + "바이트까지입니다", where, label);
        entry.ok = false;
      } else {
        problems = svgProblems(utf8Text(bytes));
        problems.forEach(function (message) {
          report.error("publish-svg", label + ": " + message, where, label);
        });
      }
    } else if (kind === "png") {
      var png = bytes.length > LIMITS.pngBytes ? "PNG " + bytes.length + "바이트 — " + LIMITS.pngBytes + "바이트까지입니다" : pngProblem(bytes);
      if (png) {
        report.error("publish-png", label + ": " + png, where, label);
        problems.push(png);
      } else {
        entry.reencode = "service";
      }
    } else if (kind === "font") {
      var font = bytes.length > LIMITS.fontBytes ? "글꼴 파일 " + bytes.length + "바이트 — " + LIMITS.fontBytes + "바이트까지입니다" : fontFileProblem(bytes);
      if (font) {
        report.error("publish-font-file", label + ": " + font, where, label);
        problems.push(font);
      }
    }
    if (problems.length) {
      entry.ok = false;
    }
    assets.push(entry);
  }

  function check(cssText, options) {
    var opts = options || {};
    var css = String(cssText == null ? "" : cssText);
    var report = createReport();
    var result = { ok: false, stage: "publish", fontId: null, errors: 0, warnings: 0, findings: report.list, assets: [], notes: [],
      limits: { cssBytes: LIMITS.cssBytes, assets: LIMITS.assets, svgBytes: LIMITS.svgBytes, pngBytes: LIMITS.pngBytes,
        fontBytes: LIMITS.fontBytes, pngSide: LIMITS.pngSide } };
    if (!Lint || !Model) {
      report.error("publish-setup", "게시 검사를 준비하지 못했습니다(font-kku-lint.js 또는 font-studio-model.js 없음)", null);
      return finish(result);
    }
    var lintOptions = { fileName: opts.fileName || (opts.fontId ? opts.fontId + ".css" : undefined) };
    if (opts.digest) {
      lintOptions.digest = opts.digest;
    }
    Lint.lint(css, lintOptions).forEach(report.contract);

    var digest = opts.digest || Lint.DIGEST || {};
    var fileId = fontIdFromFile(opts.fileName);
    if (fileId && digest.aliases && own(digest.aliases, fileId)) {
      report.error("publish-alias", fileId + ".css는 " + digest.aliases[fileId] + "의 alias shim입니다 — 게시는 원래 글꼴(" + digest.aliases[fileId] + ")로 합니다", null);
      return finish(result);
    }
    var doc = Model.parse(css);
    var fontId = opts.fontId || fileId || (Model.scopeFontIds(doc) || [])[0] || null;
    if (opts.fontId && fileId && opts.fontId !== fileId) {
      report.error("publish-font-id", "글꼴 id " + opts.fontId + "와 파일 이름 " + opts.fileName + "이 다릅니다", null);
    }
    if (!fontId) {
      report.error("publish-font-id", "게시하려면 글꼴 id가 있어야 합니다(파일 이름 <id>.css나 범위 :where([data-fy-font=\"<id>\"]))", null);
    } else if (!FONT_ID.test(fontId)) {
      report.error("publish-font-id", "글꼴 id \"" + shorten(fontId, 40) + "\" — 런타임 글꼴 id 규칙(^[a-z0-9][a-z0-9-]*$) 밖입니다", null);
    }
    result.fontId = fontId;

    var bytes = utf8Bytes(css);
    if (bytes > LIMITS.cssBytes) {
      report.error("publish-size", "CSS " + bytes + "바이트 — 게시 글꼴 CSS는 " + LIMITS.cssBytes + "바이트까지입니다", null);
    }
    var markup = /<\/style|<script|<!--|-->/i.exec(css);
    if (markup) {
      var position = typeof doc.lineOf === "function" ? doc.lineOf(markup.index) : null;
      report.error("publish-markup", "\"" + markup[0] + "\" — <style>에 넣어 싣는 페이지를 깨거나 HTML을 끼울 수 있는 글은 게시하지 않습니다",
        position && position.line ? position : { line: css.slice(0, markup.index).split("\n").length, column: 1 });
    }

    var assets = result.assets;
    var cache = {};
    var readAsset = opts.readAsset;
    var urlCount = 0;
    doc.items.forEach(function (item) {
      if (item.kind !== "at-rule" || item.atRule !== "font-face") {
        return;
      }
      var declarations = item.declarations || [];
      declarations.forEach(function (declaration) {
        var name = declaration.name.toLowerCase();
        if (name === "font-family") {
          var family = stripComments(declaration.value).trim().replace(/^["']|["']$/g, "");
          var prefix = "font-kku-" + (fontId || "<id>");
          if (family.toLowerCase().indexOf(prefix) !== 0) {
            report.error("publish-font-face", "@font-face font-family \"" + shorten(family, 40) + "\" — 게시 글꼴의 @font-face 이름은 \"" + prefix +
              "\"로 시작합니다(페이지가 쓰는 다른 글꼴 이름을 가로채지 않게)", declaration);
          }
        }
        readUrls(declaration.value).forEach(function (url) {
          urlCount += 1;
          checkAsset(url, declaration, true, readAsset, report, assets, cache);
        });
      });
    });
    doc.rules.forEach(function (rule) {
      if (rule.invalid) {
        return;
      }
      rule.declarations.forEach(function (declaration) {
        if (declaration.invalid) {
          return;
        }
        magnitudeProblems(declaration.name, declaration.value).forEach(function (problem) {
          report.error(problem.code, problem.message, declaration);
        });
        readUrls(declaration.value).forEach(function (url) {
          urlCount += 1;
          checkAsset(url, declaration, false, readAsset, report, assets, cache);
        });
      });
    });
    if (assets.length > LIMITS.assets) {
      report.error("publish-size", "자산 " + assets.length + "개 — 게시 글꼴은 " + LIMITS.assets + "개까지입니다", null);
    }
    if (assets.some(function (asset) { return asset.kind === "png" && asset.ok; })) {
      result.notes.push("PNG는 지금 검사만 합니다 — 서비스에 올릴 때 다시 인코딩합니다(ADR-033 §7)");
    }
    if (assets.some(function (asset) { return asset.kind === "font" && asset.ok; })) {
      result.notes.push("글꼴 파일은 머리만 봅니다 — 서비스에 올릴 때 다시 검사합니다");
    }
    result.urls = urlCount;
    return finish(result);
  }

  function finish(result) {
    result.findings.sort(function (a, b) {
      return a.line - b.line || a.column - b.column || (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : 0);
    });
    result.errors = result.findings.filter(function (f) { return f.severity === "error"; }).length;
    result.warnings = result.findings.length - result.errors;
    result.ok = result.errors === 0;
    return result;
  }

  var FontKkuPublishCheck = {
    LIMITS: LIMITS,
    CAPS: CAPS,
    check: check,
    magnitude: magnitudeProblems,
    pngProblem: pngProblem
  };

  global.FontKkuPublishCheck = FontKkuPublishCheck;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuPublishCheck;
  }
})(typeof window !== "undefined" ? window : globalThis);
