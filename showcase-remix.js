/* 사례 '고쳐 쓰기' — 템플릿 HTML의 폰꾸 글씨를 8칸 그림 세트로 갈아 끼우는 변환과, 바뀐 줄을 보이는 줄 비교.
 *
 * 미리보기와 복사하는 HTML이 같은 글에서 나오도록 변환은 글(문자열)만 다룬다. 바꾸는 것은 넷이다.
 * - 바탕 요소의 글꼴: <font-kku …>의 font="x" → font="sebul" jamo-set="my-font",
 *   class에 font-kku가 든 꾸미개의 data-font="x" → data-font="sebul" data-jamo-set="my-font".
 *   글꼴을 밝히지 않은 바탕 요소(기본 배치 세벌 고정)에는 jamo-set만 더해 세벌 고정 그대로 그린다(draw-jamo.md).
 * - 런타임 <script>의 data-fonts → "sebul"과 바꾸지 않은 글꼴, 그 바로 뒤에 registerJamo 등록 코드 한 덩이.
 *   바꾼 뒤 아무 데서도 쓰지 않게 된 템플릿 자신의 registerJamo("이름", …) 호출은 뺀다(그 호출만 든 <script>면 통째로).
 * - </head> 앞에 세트의 획 굵기(--fy-element-width) 규칙. 씨앗을 켜면 바탕 요소마다 seed="auto"·jamo-seeds
 *   (꾸미개는 data-seed·data-jamo-seeds)를 붙이고, 소개 '씨앗 변주'와 같은 기울기 ±6°·자리 ±0.03em 규칙을 더한다.
 * 바꿀 바탕 요소가 하나도 없으면 템플릿을 그대로 돌려준다. 주석(<!-- … -->) 속 글은 건드리지 않는다.
 * 페이지 CSS가 자모 역할([part~="jongseong"] 등)로 준 색과 움직임은 건드리지 않는다. 템플릿의 스크립트가 나중에
 * 만드는 바탕 요소는 글에 없어서 바뀌지 않는다 — 그런 템플릿은 사례 페이지가 고르기 목록에서 뺀다. */
(function () {
  "use strict";

  var SET_NAME = "my-font";
  /* 글꼴 이름이 없는 바탕 요소(기본 배치 세벌 고정)를 가리키는 열쇠 — 사례 목록 index.json의 fonts에도 같은 말을 쓴다 */
  var FIXED = "fixed";
  var ORDER = ["ㄱ", "ㄴ", "ㅁ", "ㅅ", "ㅇ", "ㆍ", "ㅡ", "ㅣ"];
  /* 여는 태그 — 따옴표 안의 '>'·'<'를 태그 끝으로 읽지 않게 속성 하나씩(이름, = 값) 읽는다. 1: 이름, 2: 속성들, 3: 끝(공백·/) */
  var TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*)(\s*\/?)>/g;
  var ATTR = /\s+([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
  var RUNTIME_TAG = /<script\b[^<>]*\ssrc\s*=\s*(["'])[^"']*font-kku(?:\.min)?\.js\1[^<>]*>\s*<\/script>/i;
  var HAND_RULE = [
    "  /* 볼 때마다 다르게 — 자모마다 붙는 씨앗값(0–1)으로 기울기 ±6°와 자리를 정한다 */",
    "  :is(font-kku, .font-kku)[data-fy-jamo-seeds=\"true\"] [part~=\"jamo\"] {",
    "    --fy-rotate: calc((var(--fy-jamo-seed, 0.5) - 0.5) * 12deg);",
    "    translate: calc(sin(var(--fy-jamo-seed, 0.5) * 23rad) * 0.03em) calc(sin(var(--fy-jamo-seed, 0.5) * 31rad) * 0.03em);",
    "  }"
  ].join("\n");

  /* 속성 글을 [{ name, value, text }]로 — text는 원래 글(앞 공백 포함) 그대로, value는 값이 없으면 "" */
  function parseAttrs(attrs) {
    var out = [];
    var match;
    ATTR.lastIndex = 0;
    while ((match = ATTR.exec(attrs || ""))) {
      var value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
      out.push({ name: match[1].toLowerCase(), value: value === undefined ? "" : value, text: match[0] });
    }
    return out;
  }

  function findAttr(list, names) {
    for (var i = 0; i < list.length; i += 1) {
      if (names.indexOf(list[i].name) >= 0) return list[i];
    }
    return null;
  }

  function prefixOf(name) { return name.toLowerCase() === "font-kku" ? "" : "data-"; }

  function isHost(name, list) {
    if (name.toLowerCase() === "font-kku") return true;
    var cls = findAttr(list, ["class"]);
    return Boolean(cls) && cls.value.split(/\s+/).indexOf("font-kku") >= 0;
  }

  /* 바탕 요소의 글꼴 열쇠 — font(꾸미개는 data-font)나 profile 값, 없으면 FIXED */
  function fontKey(name, list) {
    var prefix = prefixOf(name);
    var attr = findAttr(list, [prefix + "font", prefix + "profile"]);
    return attr && attr.value ? attr.value : FIXED;
  }

  function cellsCode(cells) {
    return ORDER.filter(function (key) { return cells[key]; }).map(function (key) {
      var cell = cells[key];
      return '    "' + key + '": { box: ' + JSON.stringify(cell.box) + ", shapes: " + JSON.stringify(cell.shapes) + " }";
    }).join(",\n");
  }

  function optionsCode(options) {
    var keys = Object.keys(options || {});
    if (!keys.length) {
      return '{ frame: "box" }';
    }
    return "{ " + keys.map(function (key) { return key + ": " + JSON.stringify(options[key]); }).join(", ") + " }";
  }

  /* set: { cells, options, width, label } — label은 등록 코드 머리 주석(세트의 내력) */
  function registerCode(set) {
    return "<script>\n" +
      "  /* " + String(set.label || "8칸 그림 세트").replace(/\*\//g, "* /") + " */\n" +
      '  FontKku.registerJamo("' + SET_NAME + '", {\n' + cellsCode(set.cells) + "\n" +
      "  }, " + optionsCode(set.options) + ");\n" +
      "</" + "script>";
  }

  function styleCode(set, seed) {
    var rules = [];
    if (set && set.width) {
      rules.push("  /* 그림 세트 " + SET_NAME + "의 획 굵기 — 세트가 정한 값 */\n" +
        '  :is(font-kku[jamo-set="' + SET_NAME + '"], [data-jamo-set="' + SET_NAME + '"]) { --fy-element-width: ' + set.width + "; }");
    }
    if (seed) {
      rules.push(HAND_RULE);
    }
    return rules.length ? "<style>\n" + rules.join("\n") + "\n</style>" : "";
  }

  function hostTag(name, attrs, tail, set, seed) {
    var prefix = prefixOf(name);
    var list = parseAttrs(attrs);
    var out = attrs || "";
    if (set) {
      var font = findAttr(list, [prefix + "font", prefix + "profile"]);
      var setAttr = " " + prefix + "jamo-set=\"" + SET_NAME + "\"";
      /* 글꼴을 밝히지 않은 바탕 요소는 그림 세트만 건다 — 기본 배치(세벌 고정)가 그대로다. 새 속성은 옛 글꼴(없으면 옛
       * 그림 세트) 자리에 둔다 */
      var at = font || findAttr(list, [prefix + "jamo-set"]);
      out = list.map(function (attr) {
        if (attr === at) return (font ? " " + prefix + "font=\"sebul\"" : "") + setAttr;
        return attr.name === prefix + "jamo-set" ? "" : attr.text;
      }).join("");
      if (!at) out = setAttr + out;
    }
    if (seed && !findAttr(list, [prefix + "seed"])) {
      out += " " + prefix + "seed=\"auto\" " + prefix + "jamo-seeds";
    }
    return "<" + name + out + tail + ">";
  }

  /* 템플릿 글에서 바탕 요소가 쓰는 글꼴 열쇠(주석 밖, 나온 차례) — 사례 목록의 fonts와 맞춰 보는 데 쓴다 */
  function hostFonts(src) {
    var seen = [];
    String(src).split(/(<!--[\s\S]*?-->)/).forEach(function (part) {
      if (part.slice(0, 4) === "<!--") return;
      part.replace(TAG, function (match, name, attrs) {
        var list = parseAttrs(attrs);
        if (isHost(name, list)) {
          var key = fontKey(name, list);
          if (seen.indexOf(key) < 0) seen.push(key);
        }
        return match;
      });
    });
    return seen;
  }

  /* text[open]이 여는 괄호일 때 짝이 맞는 닫는 괄호의 자리 — 문자열·주석은 건너뛴다. 못 찾으면 -1 */
  function closeParen(text, open) {
    var depth = 0;
    for (var i = open; i < text.length; i += 1) {
      var ch = text[i];
      if (ch === '"' || ch === "'" || ch === "`") {
        for (i += 1; i < text.length && text[i] !== ch; i += 1) {
          if (text[i] === "\\") i += 1;
        }
      } else if (ch === "/" && text[i + 1] === "*") {
        i = text.indexOf("*/", i + 2);
        if (i < 0) return -1;
        i += 1;
      } else if (ch === "/" && text[i + 1] === "/") {
        i = text.indexOf("\n", i);
        if (i < 0) return -1;
      } else if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        depth -= 1;
        if (depth === 0) return ch === ")" ? i : -1;
      }
    }
    return -1;
  }

  /* 문장 앞자리인가 — 앞의 공백·블록 주석을 건너뛰고 { ; } 또는 <script …>의 끝이 오면 문장 앞이다 */
  function statementStart(text, at) {
    var i = at - 1;
    for (;;) {
      while (i >= 0 && /\s/.test(text[i])) i -= 1;
      if (i >= 1 && text[i] === "/" && text[i - 1] === "*") {
        var open = text.lastIndexOf("/*", i - 2);
        if (open < 0) return false;
        i = open - 1;
        continue;
      }
      return i >= 0 && "{;}>".indexOf(text[i]) >= 0;
    }
  }

  function count(text, word) { return text.split(word).length - 1; }

  /* 쓰지 않게 된 템플릿 자신의 registerJamo("이름", …); 호출을 part에서 뺀다. 이름이 그 호출 밖 문서 어디에든(whole,
   * 주석 포함) 남아 있으면, 또는 호출이 문장 하나로 서 있지 않으면 그대로 둔다. 그 호출만 든 인라인 <script>는 통째로 뺀다. */
  function dropUnusedSets(part, whole) {
    var CALL = /FontKku\.registerJamo\(\s*(["'])([^"'\\]+)\1/g;
    var match;
    while ((match = CALL.exec(part))) {
      var name = match[2];
      var start = match.index;
      var open = part.indexOf("(", start);
      var close = closeParen(part, open);
      if (name === SET_NAME || close < 0 || !statementStart(part, start)) continue;
      var end = close + 1;
      var after = /^[ \t]*;?/.exec(part.slice(end))[0];
      end += after.length;
      if (count(whole, name) > count(part.slice(start, end), name) || !/^[ \t]*(?:\r?\n|$|\})/.test(part.slice(end))) continue;
      var lineStart = part.lastIndexOf("\n", start - 1) + 1;
      if (/^[ \t]*$/.test(part.slice(lineStart, start))) {
        start = lineStart;
        var newline = /^[ \t]*\r?\n/.exec(part.slice(end));
        if (newline) end += newline[0].length;
      }
      part = part.slice(0, start) + part.slice(end);
      part = dropEmptyScript(part, start);
      CALL.lastIndex = 0;
    }
    return part;
  }

  /* at을 품은 인라인 <script>의 몸이 주석·공백과 빈 if (window.FontKku) { }뿐이면 그 <script>를 줄째 뺀다 */
  function dropEmptyScript(part, at) {
    var open = part.lastIndexOf("<script", at);
    var close = part.indexOf("</script>", at);
    if (open < 0 || close < 0 || part.lastIndexOf("</script>", at) > open) return part;
    var head = /^<script\b[^<>]*>/i.exec(part.slice(open));
    if (!head || /\ssrc\s*=/i.test(head[0])) return part;
    var body = part.slice(open + head[0].length, close)
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\s+/g, "");
    if (!/^(?:if\(window\.FontKku\)\{\})?;?$/.test(body)) return part;
    var start = open;
    var end = close + "</script>".length;
    var lineStart = part.lastIndexOf("\n", start - 1) + 1;
    if (/^[ \t]*$/.test(part.slice(lineStart, start))) {
      start = lineStart;
      var newline = /^[ \t]*\r?\n/.exec(part.slice(end));
      if (newline) end += newline[0].length;
      /* 앞뒤가 모두 빈 줄이면 빈 줄 하나만 남긴다 */
      if (/\n[ \t]*\n[ \t]*$/.test(part.slice(0, start)) && /^[ \t]*\r?\n/.test(part.slice(end))) {
        end += /^[ \t]*\r?\n/.exec(part.slice(end))[0].length;
      }
    }
    return part.slice(0, start) + part.slice(end);
  }

  /* src: 템플릿 HTML. opts: { set: { cells, options, width, label } | null, seed: boolean, fonts: ["neon", "fixed", …] | null }
   * fonts를 주면 그 글꼴 열쇠로 그린 바탕 요소만 바꾼다("fixed"는 글꼴을 밝히지 않은 바탕 요소). 나머지는 원래 글꼴 그대로다.
   * 돌려주는 것: { html, hosts } — hosts는 바꾼 바탕 요소 수. 0이면 html은 src 그대로다 */
  function remix(src, opts) {
    opts = opts || {};
    var set = opts.set && opts.set.cells ? opts.set : null;
    var seed = Boolean(opts.seed);
    var only = set && Array.isArray(opts.fonts) ? opts.fonts : null;
    var html = String(src);
    if (!set && !seed) {
      return { html: html, hosts: 0 };
    }
    var hosts = 0;
    /* 주석(<!-- … -->) 속 글은 그대로 둔다 — 머리 주석의 안내 글에 든 <font-kku>나 런타임 주소를 바탕 요소로 세지 않게 */
    var parts = html.split(/(<!--[\s\S]*?-->)/);
    parts = parts.map(function (part) {
      if (part.slice(0, 4) === "<!--") {
        return part;
      }
      return part.replace(TAG, function (match, name, attrs, tail) {
        var list = parseAttrs(attrs);
        if (!isHost(name, list)) {
          return match;
        }
        if (only && only.indexOf(fontKey(name, list)) < 0) {
          return match;
        }
        hosts += 1;
        return hostTag(name, attrs, tail, set, seed);
      });
    });
    if (!hosts) {
      return { html: html, hosts: 0 };
    }
    var placed = false;
    var whole = parts.join("");
    parts = parts.map(function (part) {
      if (part.slice(0, 4) === "<!--") {
        return part;
      }
      if (set) {
        part = dropUnusedSets(part, whole);
      }
      var runtime = placed ? null : RUNTIME_TAG.exec(part);
      if (!runtime) {
        return part;
      }
      placed = true;
      var tag = runtime[0];
      if (set) {
        /* 첫 화면 글꼴 목록: sebul과, 바꾸지 않고 남긴 글꼴 */
        var listed = /\sdata-fonts\s*=\s*(["'])([^"']*)\1/.exec(tag);
        var fonts = ["sebul"].concat((listed ? listed[2] : "").split(/\s+/).filter(function (name) {
          return name && name !== "sebul" && only && only.indexOf(name) < 0;
        }));
        var attr = ' data-fonts="' + fonts.join(" ") + '"';
        tag = listed ? tag.replace(listed[0], attr) : tag.replace(/^<script/i, "<script" + attr);
        tag += "\n  " + registerCode(set).replace(/\n/g, "\n  ");
      }
      return part.slice(0, runtime.index) + tag + part.slice(runtime.index + runtime[0].length);
    });
    html = parts.join("");
    var extra = [];
    if (!placed && set) {
      extra.push(registerCode(set));
    }
    var style = styleCode(set, seed);
    if (style) {
      extra.push(style);
    }
    if (extra.length) {
      var block = "  " + extra.join("\n").replace(/\n/g, "\n  ") + "\n";
      var head = html.search(/<\/head>/i);
      html = head >= 0 ? html.slice(0, head) + block + html.slice(head) : html + "\n" + block;
    }
    return { html: html, hosts: hosts };
  }

  /* 줄 비교 — 같은 앞뒤를 덜고 가운데만 가장 긴 공통 줄(LCS)로 맞춘다. 템플릿은 수백 줄이라 표 하나로 충분하다.
   * 돌려주는 것: { rows: [{ op: " " | "-" | "+", a, b, text }], added, removed } — a·b는 1부터 센 줄 번호 */
  function diff(before, after) {
    var a = String(before).split("\n");
    var b = String(after).split("\n");
    var start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
    var endA = a.length;
    var endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA -= 1;
      endB -= 1;
    }
    var n = endA - start;
    var m = endB - start;
    var table = new Uint32Array((n + 1) * (m + 1));
    for (var i = n - 1; i >= 0; i -= 1) {
      for (var j = m - 1; j >= 0; j -= 1) {
        table[i * (m + 1) + j] = a[start + i] === b[start + j] ? table[(i + 1) * (m + 1) + j + 1] + 1 :
          Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
      }
    }
    var rows = [];
    var added = 0;
    var removed = 0;
    for (var k = 0; k < start; k += 1) rows.push({ op: " ", a: k + 1, b: k + 1, text: a[k] });
    var x = 0;
    var y = 0;
    while (x < n || y < m) {
      if (x < n && y < m && a[start + x] === b[start + y]) {
        rows.push({ op: " ", a: start + x + 1, b: start + y + 1, text: a[start + x] });
        x += 1;
        y += 1;
      } else if (y < m && (x >= n || table[x * (m + 1) + y + 1] >= table[(x + 1) * (m + 1) + y])) {
        rows.push({ op: "+", a: null, b: start + y + 1, text: b[start + y] });
        added += 1;
        y += 1;
      } else {
        rows.push({ op: "-", a: start + x + 1, b: null, text: a[start + x] });
        removed += 1;
        x += 1;
      }
    }
    for (var t = 0; endA + t < a.length; t += 1) rows.push({ op: " ", a: endA + t + 1, b: endB + t + 1, text: a[endA + t] });
    /* 한 덩이 안에서는 지운 줄을 먼저, 더한 줄을 뒤에 — 읽을 때 '이 줄이 이렇게 바뀌었다'로 보인다 */
    var sorted = [];
    var run = [];
    function flush() {
      run.sort(function (p, q) { return (p.op === "-" ? 0 : 1) - (q.op === "-" ? 0 : 1); });
      sorted = sorted.concat(run);
      run = [];
    }
    rows.forEach(function (row) {
      if (row.op === " ") {
        flush();
        sorted.push(row);
      } else {
        run.push(row);
      }
    });
    flush();
    return { rows: sorted, added: added, removed: removed };
  }

  var api = { SET_NAME: SET_NAME, FIXED: FIXED, ORDER: ORDER, remix: remix, diff: diff, hostFonts: hostFonts,
    registerCode: registerCode, HAND_RULE: HAND_RULE };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.FontKkuRemix = api;
  }
})();
