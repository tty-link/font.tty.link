/* font-derive.js — 파생 글꼴(바탕 글꼴 + 손 보정)의 글꼴 CSS 셈. 브라우저(window.FontKkuDerive)와 Node(require) 공용.
 *
 * 글꼴 CSS는 글꼴끼리 물려받지 못한다 — 모든 규칙이 :where([data-fy-font="<id>"])로 범위를 정한다(ADR-008 §9). 그래서 파생
 * 글꼴은 바탕 글꼴을 파일 안 구간(BEGIN/END GENERATED)에 옮겨 바탕 CSS를 고정하고, 자기 손 보정은 구간 아래 레이어 블록에 쓴다
 * (같은 레이어에서 뒤 규칙이 이긴다). 저장소의 파생 글꼴(spec/fonts.json derivedFrom, scripts/build_derived_fonts.js)과 작업실의
 * '새 글꼴로'(ADR-030 §8)가 같은 꼴·같은 셈을 쓴다 — 바탕 옮기기의 공통 셈(deriveBody)은 여기 하나다.
 *   바탕 새 판 받기  rebase(text, 새 바탕 CSS) — 구간만 다시 쓰고 손 보정은 그대로
 *   통째로 풀어 저장 flatten(text) — 구간 표시를 떼어 바탕 갱신 관계가 없는 CSS 한 파일로(코어·런타임·그림 의존성은 그대로)
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-derive: load font-studio-util.js first");
  }

  var BEGIN = Util.DERIVED_BEGIN;
  var END = Util.DERIVED_END;
  var LAYER_ORDER = Util.LAYER_STATEMENT;
  var TUNE_ORDER = Util.TUNE_STATEMENT;
  /* 작업실이 만든 파생 글꼴의 머리말 표시 — 통째로 풀어 저장할 때 이 머리말을 걷는다 */
  var STUDIO_HEADER = "/* font-kku studio derived font";
  var NAME = /^[a-z][a-z0-9-]*$/;
  var HEADER_LINE = /^\/\* font-kku studio derived font — ([a-z][a-z0-9-]*) \(바탕: ([a-z][a-z0-9-]*)(?: ([^ ·)]+))?(?: · ([0-9a-f]{8}))?\)/;
  /* 기본 제공 글꼴 이름(spec/fonts.json의 글꼴과 별칭 — 시험이 대조한다). 작업실은 이 이름으로 고친 글꼴을 저장하지 않는다
   * (사이트 기본, ADR-030 §8 — 저장소 작업실은 mount 옵션 shippedSave로 연다) */
  var SHIPPED_FONTS = [
    "sebul", "gothic", "sprite-example", "sprite-system", "jikgyeol", "neon", "sticker", "malang", "retro", "saekdong",
    "pixel", "dojang", "chalk", "geumbak", "glitch", "riso", "blueprint", "crayon", "jasu", "pilgi", "dunggeun", "butgeul",
    "default", "classic", "gothic2"
  ];

  function fail(message) {
    throw new Error("font-derive: " + message);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* 바탕 글꼴 CSS → 파생 글꼴 이름의 구간 본문(표시 없음): 주석과 계층 차례 문장을 걷고 글꼴 범위([data-fy-font])와
   * --fy-font-id를 새 이름으로 바꾼다. tune은 바탕이 다섯 계층 문장(고정 글꼴 모양의 손 보정 블록)을 가졌는지.
   * 그림 자소판 바탕의 자소판 주소·굵기 보정은 저장소 생성기(scripts/build_derived_fonts.js)가 이 뒤에 따로 다룬다. */
  function deriveBody(source, base, id) {
    if (!NAME.test(base) || !NAME.test(id)) {
      fail("font names are lowercase a-z, 0-9 and - starting with a letter (got " + JSON.stringify(base) + " → " + JSON.stringify(id) + ")");
    }
    var css = String(source).replace(/\/\*[\s\S]*?\*\//g, "");
    var tune = css.indexOf(TUNE_ORDER) >= 0;
    css = css.split(TUNE_ORDER).join("").split(LAYER_ORDER).join("");
    if (css.indexOf("@layer font-kku.font, ") >= 0) {
      fail(base + " has an unexpected layer-order statement");
    }
    var scope = new RegExp('\\[data-fy-font="' + escapeRegExp(base) + '"\\]', "g");
    if (!scope.test(css)) {
      fail(base + " has no " + base + " scope");
    }
    css = css.replace(scope, '[data-fy-font="' + id + '"]');
    css = css.replace(new RegExp("(--fy-font-id\\s*:\\s*)" + escapeRegExp(base) + "\\s*;"), "$1" + id + ";");
    return { css: css, tune: tune };
  }

  /* 구간 본문 다듬기 — 줄 끝 빈칸, 빈 줄 셋 이상, 앞뒤 빈칸 */
  function tidy(css) {
    return String(css).split("\n").map(function (line) { return line.replace(/\s+$/, ""); }).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  /* 표시를 붙인 구간 */
  function generatedText(base, css) {
    return BEGIN + " — base profiles/" + base + ".css */\n" + css + "\n" + END;
  }

  /* 바탕 글꼴 CSS → 구간(표시 포함)과 계층 문장 */
  function block(source, base, id) {
    var body = deriveBody(source, base, id);
    return { text: generatedText(base, tidy(body.css)), tune: body.tune };
  }

  /* 바탕 글의 짧은 지문 — FNV-1a 32비트, 16진 8자. 머리말에 판과 함께 적어 어느 바탕을 옮겼는지 가린다 */
  function digest(text) {
    return Util.fnv1a(String(text || ""));
  }

  function headerLine(id, base, version, hash) {
    return STUDIO_HEADER + " — " + id + " (바탕: " + base + (version ? " " + version : "") + (hash ? " · " + hash : "") + ")";
  }

  /* 작업실 머리말 — { id, base, version, hash }. 없으면 null */
  function header(text) {
    var match = HEADER_LINE.exec(String(text || ""));
    return match ? { id: match[1], base: match[2], version: match[3] || null, hash: match[4] || null } : null;
  }

  /* 작업실이 만든 파생 글꼴 한 파일 — 머리말(바탕·판·지문), 계층 문장, 바탕 구간, 손 보정 자리.
   * options: { version(바탕의 판, 예 패키지 판 "0.1.4"), note(머리말 끝 한 줄), tune(손 보정이 tune 레이어를 쓰면 true),
   *            hand(손 보정 CSS — 구간 아래에 붙인다) } */
  function derive(source, base, id, options) {
    var opts = options || {};
    var made = block(source, base, id);
    var version = opts.version ? String(opts.version) : "";
    var hand = opts.hand ? String(opts.hand).replace(/\s+$/, "") + "\n" : "";
    return [
      headerLine(id, base, version, digest(source)),
      " *",
      " * 바탕 글꼴 " + base + "을 아래 GENERATED 구간에 이 글꼴 이름으로 옮겼다(바탕 CSS 고정 — 바탕이 바뀌어도 이 파일은 그대로다).",
      " * 런타임·코어 CSS의 배치 값·그림 자산은 포함하지 않는다. 같은 모양 재현에는 이 의존성도 같은 판이어야 한다.",
      " * 구간은 작업실의 '바탕 새 판 받기'가 다시 쓰므로 고치지 않는다. 이 글꼴의 손 보정은 구간 아래 레이어 블록에 쓴다",
      " * (같은 레이어에서 뒤 규칙이 이긴다). '통째로 풀어 저장'은 구간 표시를 떼어 한 파일로 만든다(ADR-030 §8).",
      (opts.note ? " * " + String(opts.note) + "\n" : "") + " */",
      made.tune || opts.tune ? TUNE_ORDER : LAYER_ORDER,
      made.text,
      "",
      "/* 손 보정 — " + id + "만의 규칙(작업실이 여기에 쓴다) */",
      hand
    ].join("\n");
  }

  /* 이름 바꾼 파생 글꼴의 머리말 — 규칙 속 이름은 작업실 모델(renameFont)이 바꾸고, 머리말 줄의 이름은 여기서 */
  function retitle(text, id) {
    var source = String(text || "");
    var found = header(source);
    if (!found) {
      return source;
    }
    return source.replace(HEADER_LINE, headerLine(id, found.base, found.version, found.hash));
  }

  /* 파생 글꼴 CSS의 구간 — { base, begin, end, text(표시 포함 구간), body(본문) }. 구간이 없으면 null */
  function parse(text) {
    var source = String(text || "");
    var found = Util.derivedSection(source);
    if (!found) {
      return null;
    }
    return {
      base: found.base,
      begin: found.begin,
      end: found.end,
      text: source.slice(found.begin, found.end),
      body: source.slice(found.headEnd, found.end - END.length).replace(/^\n/, "").replace(/\n$/, "")
    };
  }

  /* 글꼴 이름(--fy-font-id, 없으면 범위 이름) */
  function fontId(text) {
    var match = /--fy-font-id\s*:\s*["']?([a-z][a-z0-9-]*)/.exec(String(text || "").replace(/\/\*[\s\S]*?\*\//g, ""));
    return match ? match[1] : null;
  }

  /* 바탕 새 판 받기 — 구간을 새 바탕 CSS로 다시 쓴다. 손 보정은 그대로, 머리말은 판·지문만 새로. 바탕이 다섯 계층 문장을
   * 가지면 첫 문장도 넓힌다. 바뀐 것이 없으면 같은 글을 돌려준다. options: { version(새 바탕의 판) } */
  function rebase(text, source, options) {
    var opts = options || {};
    var found = parse(text);
    if (!found || !found.base) {
      fail("not a derived font (no BEGIN/END GENERATED block with its base)");
    }
    var id = fontId(found.body) || fontId(text);
    if (!id) {
      fail("the derived font names no --fy-font-id");
    }
    var made = block(source, found.base, id);
    var next = String(text).slice(0, found.begin) + made.text + String(text).slice(found.end);
    if (made.tune && next.indexOf(TUNE_ORDER) < 0) {
      next = next.replace(LAYER_ORDER, TUNE_ORDER);
    }
    if (next === String(text)) {
      return next;
    }
    var title = header(next);
    if (title) {
      next = next.replace(HEADER_LINE, headerLine(title.id, title.base, opts.version ? String(opts.version) : title.version, digest(source)));
    }
    return next;
  }

  /* 바탕 구간이 지금 바탕과 같은가 — 다르면 '바탕 새 판 받기'를 보인다 */
  function upToDate(text, source) {
    var found = parse(text);
    if (!found || !found.base) {
      return true;
    }
    var id = fontId(found.body) || fontId(text);
    return block(source, found.base, id).text === found.text;
  }

  /* 통째로 풀어 저장 — 구간 표시 두 줄과 작업실 머리말을 걷어 바탕 갱신 관계가 없는 CSS 한 파일로(코어·런타임·그림 의존성은 그대로) */
  function flatten(text) {
    var source = String(text || "");
    var found = parse(source);
    if (!found) {
      return source;
    }
    var line = source.slice(found.begin, source.indexOf("*/", found.begin) + 2);
    var out = source.slice(0, found.begin) + found.text.slice(line.length).replace(/^\n/, "").slice(0, -END.length).replace(/\n$/, "") +
      source.slice(found.end);
    var header = out.indexOf(STUDIO_HEADER);
    if (header >= 0) {
      var close = out.indexOf("*/", header);
      out = out.slice(0, header) + out.slice(close + 2).replace(/^\n/, "");
    }
    return out;
  }

  var FontKkuDerive = {
    BEGIN: BEGIN,
    END: END,
    LAYER_ORDER: LAYER_ORDER,
    TUNE_ORDER: TUNE_ORDER,
    STUDIO_HEADER: STUDIO_HEADER,
    SHIPPED_FONTS: SHIPPED_FONTS.slice(),
    shipped: function (name) { return SHIPPED_FONTS.indexOf(String(name || "")) >= 0; },
    digest: digest,
    header: header,
    retitle: retitle,
    deriveBody: deriveBody,
    tidy: tidy,
    generatedText: generatedText,
    block: block,
    derive: derive,
    parse: parse,
    fontId: fontId,
    rebase: rebase,
    upToDate: upToDate,
    flatten: flatten
  };

  global.FontKkuDerive = FontKkuDerive;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuDerive;
  }
})(typeof window !== "undefined" ? window : globalThis);
