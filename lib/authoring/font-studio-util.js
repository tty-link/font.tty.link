/* font-studio-util.js — 작업실·제작 모델이 함께 쓰는 작은 도구와 표 (PLAN-STUDIO-002 S6 '공용 유틸로 중복 줄이기')
 *
 * 전에는 모듈마다 손으로 적은 사본이었다(작업실 비판 검토 2026-10-18 §5). 여기 하나만 고친다.
 * - 자료 도구: clone(JSON 사본) · isObject · utf8Length · stableJson(키 차례를 고정한 JSON 글) · fnv1a(32비트 16진 8자) · hashPair(FNV-1a와 djb2 xor 짝)
 * - 한글 표: CHO·JUNG·JONG(호환 자모, 종성은 받침 없음 칸 없이 27자) · compose·decompose(완성형 음절) · ROLE_LABELS(역할 이름)
 * - 디자인 영향: IMPACT_EFFECTS(심각한 차례) · IMPACT_TEXT(화면 말) — 디자인 규칙 impactOf와 편집 기록
 * - 그릴 단계: STAGE_ORDER · STAGE_NAMES · STAGE_JAMO(spec/authoring-stages.json — 시험이 대조한다)
 * - 글꼴 CSS 계층: LAYERS 등(spec/css-variables.json — 린트 생성 요약 DIGEST와 시험이 대조한다)
 * - 파생 글꼴 바탕 구간: DERIVED_BEGIN·DERIVED_END · derivedSection(글)
 * - 화면: element(태그, 클래스, 글) · download(이름, 글|Blob, 형식) — 문서가 있을 때만 · readFlag·writeFlag(켬·끔 기억)
 *
 * 해시·JSON 글은 저장되는 값(판 번호·지문·규칙 id)을 만든다. 글자 하나라도 바꾸면 저장한 기록과 어긋나니 고치지 않는다.
 * 런타임(font-kku.js)과 렌더러는 이 파일을 쓰지 않는다. 브라우저(window.FontStudioUtil)와 Node(require) 공용, 다른 authoring
 * 파일보다 먼저 싣는다.
 */
(function (global) {
  "use strict";

  // ── 자료 도구 ──────────────────────────────────────────────────────────

  /* JSON으로 옮길 수 있는 값의 깊은 사본. undefined·null은 그대로 */
  function clone(value) {
    return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value));
  }

  /* 배열이 아닌 객체(null 빼고) */
  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  /* UTF-8 바이트 수(글 크기 한도) — 짝 없는 앞 대리 문자가 끝에 오면 3바이트로 센다 */
  function utf8Length(text) {
    var bytes = 0;
    for (var index = 0; index < text.length; index += 1) {
      var code = text.charCodeAt(index);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  /* 키를 사전 차례로 늘어놓은 JSON 글 — 같은 자료면 같은 글. undefined는 null로 적는다(키를 빼지 않는다) */
  function stableJson(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(stableJson).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /* FNV-1a 32비트, 16진 8자(앞을 0으로 채움). 암호 해시가 아니다 — 바뀜을 가리는 짧은 지문 */
  function fnv1a(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  /* 두 해시 짝 [FNV-1a 16진, djb2-xor 16진](앞 0 없음) — 판 번호(contentRev)·묶음 지문·검수 지문이 이 짝으로 글을 만든다 */
  function hashPair(text) {
    var a = 2166136261;
    var b = 5381;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619);
      b = Math.imul(b, 33) ^ code;
    }
    return [(a >>> 0).toString(16), (b >>> 0).toString(16)];
  }

  // ── 한글 표 ────────────────────────────────────────────────────────────

  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  var JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  var JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  var ROLE_LABELS = Object.freeze({ initial: "초성", medial: "중성", final: "종성", standalone: "낱자" });
  /* 디자인을 바꾸기 전·후 영향(디자인 규칙 impactOf와 편집 기록) — 심각한 것부터 */
  var IMPACT_EFFECTS = Object.freeze(["error", "primitive", "lost-original", "degraded", "source-changed", "changed"]);
  var IMPACT_TEXT = Object.freeze({
    error: "오류",
    primitive: "원소로 떨어짐",
    "lost-original": "그린 원본을 잃음",
    degraded: "덜 그려짐",
    "source-changed": "소스 바뀜",
    changed: "바뀜"
  });

  /* 완성형 음절 한 글자 → { initial, medial, final(없으면 null) }, 아니면 null */
  function decompose(syllable) {
    var code = syllable && syllable.length === 1 ? syllable.charCodeAt(0) - 0xAC00 : -1;
    if (!(code >= 0 && code < 11172)) {
      return null;
    }
    return { initial: CHO[Math.floor(code / 588)], medial: JUNG[Math.floor((code % 588) / 28)], final: code % 28 ? JONG[code % 28 - 1] : null };
  }

  /* 호환 자모 셋 → 완성형 음절(받침 없으면 final을 비운다). 표에 없는 자모를 주면 엉뚱한 글자가 나오니 부르는 쪽이 고른다 */
  function compose(initial, medial, final) {
    return String.fromCharCode(0xAC00 + (CHO.indexOf(initial) * 21 + JUNG.indexOf(medial)) * 28 + (final ? JONG.indexOf(final) + 1 : 0));
  }

  // ── 그릴 단계(원형 8 → 기본 24 → 확장 40) ──────────────────────────────

  var STAGE_ORDER = Object.freeze(["origin8", "basic24", "full40"]);
  var STAGE_NAMES = Object.freeze({ origin8: "원형 8", basic24: "기본 24", full40: "확장 40" });
  var STAGE_JAMO = Object.freeze({
    origin8: "ㄱㄴㅁㅅㅇㆍㅡㅣ",
    basic24: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ",
    full40: CHO + JUNG
  });

  // ── 글꼴 CSS 계층(ADR-008 §9, 고정 글꼴 모양 ADR-030 §2) ───────────────

  var LAYERS = Object.freeze(["font-kku.font", "font-kku.jamo", "font-kku.context"]);
  var SHAPE_LAYERS = Object.freeze(["font-kku.shape", "font-kku.tune"]);
  var LAYER_STATEMENT = "@layer " + LAYERS.join(", ") + ";";
  var TUNE_STATEMENT = "@layer " + LAYERS.concat(SHAPE_LAYERS).join(", ") + ";";

  // ── 파생 글꼴 바탕 구간(ADR-030 §8, scripts/build_derived_fonts.js가 쓰는 표시) ──

  var DERIVED_BEGIN = "/* BEGIN GENERATED: scripts/build_derived_fonts.js";
  var DERIVED_END = "/* END GENERATED: scripts/build_derived_fonts.js */";
  var DERIVED_BASE = / — base profiles\/([a-z][a-z0-9-]*)\.css \*\/$/;

  /* 글꼴 CSS의 바탕 구간 → { base(없으면 null), begin(표시 시작), headEnd(첫 표시 줄 끝), end(끝 표시 뒤) }, 없으면 null */
  function derivedSection(text) {
    var source = String(text);
    var begin = source.indexOf(DERIVED_BEGIN);
    var end = source.indexOf(DERIVED_END);
    if (begin < 0 || end < begin) {
      return null;
    }
    var headEnd = source.indexOf("*/", begin) + 2;
    var match = DERIVED_BASE.exec(source.slice(begin, headEnd));
    return { base: match ? match[1] : null, begin: begin, headEnd: headEnd, end: end + DERIVED_END.length };
  }

  // ── 화면 ───────────────────────────────────────────────────────────────

  /* 요소 하나 — className·text는 줄 때만(text는 textContent라 HTML로 읽지 않는다) */
  function element(tag, className, text) {
    var node = global.document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /* 켬·끔 기억(펼침 같은 보는 사람의 편의) — 저장소가 막혀도 던지지 않는다. 읽지 못하면 false, 쓰지 못하면 이번 화면에서만 */
  function readFlag(key) {
    try {
      return global.localStorage.getItem(key) === "1";
    } catch (error) {
      return false;
    }
  }

  function writeFlag(key, on) {
    try {
      global.localStorage.setItem(key, on ? "1" : "0");
    } catch (error) {
      /* 기억하지 못함 */
    }
  }

  /* 파일 받기 — data는 글 또는 Blob(글이면 type으로 Blob을 만든다) */
  function download(name, data, type) {
    var doc = global.document;
    if (!doc) {
      throw new Error("font-studio-util: download needs a document");
    }
    var blob = typeof data === "string" ? new Blob([data], { type: type }) : data;
    var link = doc.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  }

  var FontStudioUtil = Object.freeze({
    clone: clone,
    isObject: isObject,
    utf8Length: utf8Length,
    stableJson: stableJson,
    fnv1a: fnv1a,
    hashPair: hashPair,
    CHO: CHO,
    JUNG: JUNG,
    JONG: JONG,
    ROLE_LABELS: ROLE_LABELS,
    IMPACT_EFFECTS: IMPACT_EFFECTS,
    IMPACT_TEXT: IMPACT_TEXT,
    decompose: decompose,
    compose: compose,
    STAGE_ORDER: STAGE_ORDER,
    STAGE_NAMES: STAGE_NAMES,
    STAGE_JAMO: STAGE_JAMO,
    LAYERS: LAYERS,
    FONT_LAYER: LAYERS[0],
    JAMO_LAYER: LAYERS[1],
    CONTEXT_LAYER: LAYERS[2],
    SHAPE_LAYERS: SHAPE_LAYERS,
    SHAPE_LAYER: SHAPE_LAYERS[0],
    TUNE_LAYER: SHAPE_LAYERS[1],
    LAYER_STATEMENT: LAYER_STATEMENT,
    TUNE_STATEMENT: TUNE_STATEMENT,
    DERIVED_BEGIN: DERIVED_BEGIN,
    DERIVED_END: DERIVED_END,
    derivedSection: derivedSection,
    element: element,
    readFlag: readFlag,
    writeFlag: writeFlag,
    download: download
  });

  global.FontStudioUtil = FontStudioUtil;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioUtil;
  }
})(typeof window !== "undefined" ? window : globalThis);
