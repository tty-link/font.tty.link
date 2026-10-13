/* font-studio-model.js — Font Studio의 문서 모델 (ADR-009)
 *
 * 폰트 CSS 원문을 위치 정보가 있는 트리로 파싱하고, 편집은 해당 선언만
 * 제자리에서 교체·삽입·삭제한다. 원문의 주석·서식·손으로 쓴 규칙은
 * 바이트 단위로 보존되고, 같은 편집을 두 번 적용해도 결과가 같다.
 * 파서는 CSS Syntax 3의 오류 복구(파일 끝에서 블록 닫기, 줄바꿈에서 끝나는
 * 문자열, 셀렉터에 붙는 떠돌이 `;`/`}`)를 브라우저와 같게 따르고, 오류는
 * 줄 번호와 함께 보고한다. 브라우저(window.FontStudioModel)와
 * Node(module.exports) 양쪽에서 쓴다.
 */
(function (global) {
  "use strict";

  var LAYERS = ["font-kku.font", "font-kku.jamo", "font-kku.context"];
  var LAYER_STATEMENT = "@layer font-kku.font, font-kku.jamo, font-kku.context;";

  // BEGIN GENERATED CSS CONTRACT: studio-slot-contract
  // Source: spec/css-variables.json. Regenerate with:
  // node scripts/check_css_contract.js --write
  var SLOT_CONTRACT = {
    tc: { parent: null, role: "choseong", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    t: { parent: "tc", role: "choseong", emitted: true, defaults: { top: "0%", left: "8%", size: "0.68em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tt: { parent: "tc", role: "choseong", emitted: true, defaults: { top: "0%", left: "4%", size: "0.60em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tl: { parent: null, role: "choseong", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tlo: { parent: "tl", role: "choseong", emitted: true, defaults: { top: "0%", left: "0%", size: "0.62em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tlc: { parent: "tl", role: "choseong", emitted: true, defaults: { top: "0%", left: "0%", size: "0.62em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tls: { parent: "tl", role: "choseong", emitted: true, defaults: { top: "0%", left: "0%", size: "0.62em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    ttl: { parent: "tl", role: "choseong", emitted: true, defaults: { top: "0%", left: "0%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    h: { parent: null, role: "head", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    hs: { parent: "h", role: "head", emitted: true, defaults: { top: "0%", left: "0%", size: "0.78em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    hts: { parent: "h", role: "head", emitted: true, defaults: { top: "0%", left: "0%", size: "0.78em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tr: { parent: null, role: "jung-main", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    tro: { parent: "tr", role: "jung-main", emitted: true, defaults: { top: "5%", left: "40%", size: "0.60em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    trc: { parent: "tr", role: "jung-main", emitted: true, defaults: { top: "5%", left: "40%", size: "0.60em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mc: { parent: null, role: "jung-main", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    m: { parent: "mc", role: "jung-main", emitted: true, defaults: { top: "28%", left: "12%", size: "0.62em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mt: { parent: "mc", role: "jung-main", emitted: true, defaults: { top: "22%", left: "10%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mx: { parent: null, role: "jung-main", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mw: { parent: "mx", role: "jung-main", emitted: true, defaults: { top: "8%", left: "8%", size: "0.62em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mtw: { parent: "mx", role: "jung-main", emitted: true, defaults: { top: "6%", left: "8%", size: "0.58em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    xb: { parent: null, role: "jung-base", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    ml: { parent: "xb", role: "jung-base", emitted: true, defaults: { top: "20%", left: "6%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    mtl: { parent: "xb", role: "jung-base", emitted: true, defaults: { top: "18%", left: "8%", size: "0.48em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    xt: { parent: null, role: "jung-tail", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    trs: { parent: "xt", role: "jung-tail", emitted: true, defaults: { top: "5%", left: "40%", size: "0.60em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    ttr: { parent: "xt", role: "jung-tail", emitted: true, defaults: { top: "3%", left: "38%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bs: { parent: null, role: "jong-main", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    b: { parent: "bs", role: "jong-main", emitted: true, defaults: { top: "52%", left: "12%", size: "0.56em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    brs: { parent: "bs", role: "jong-main", emitted: true, defaults: { top: "46%", left: "24%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bbrs: { parent: "bs", role: "jong-main", emitted: true, defaults: { top: "50%", left: "24%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bx: { parent: null, role: "jong-main", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bw: { parent: "bx", role: "jong-main", emitted: true, defaults: { top: "47%", left: "10%", size: "0.56em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    brw: { parent: "bx", role: "jong-main", emitted: true, defaults: { top: "47%", left: "10%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bbw: { parent: "bx", role: "jong-main", emitted: true, defaults: { top: "51%", left: "10%", size: "0.52em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    xl: { parent: null, role: "jong-left", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bl: { parent: "xl", role: "jong-left", emitted: true, defaults: { top: "48%", left: "10%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    blr: { parent: "xl", role: "jong-left", emitted: true, defaults: { top: "48%", left: "10%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bbl: { parent: "xl", role: "jong-left", emitted: true, defaults: { top: "52%", left: "10%", size: "0.48em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    xr: { parent: null, role: "jong-right", emitted: false, defaults: { top: null, left: null, size: null, "scale-x": null, "scale-y": null, rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    br: { parent: "xr", role: "jong-right", emitted: true, defaults: { top: "46%", left: "24%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    brd: { parent: "xr", role: "jong-right", emitted: true, defaults: { top: "46%", left: "24%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bbrd: { parent: "xr", role: "jong-right", emitted: true, defaults: { top: "50%", left: "24%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    blb: { parent: null, role: "jong-left", emitted: false, defaults: { top: "48%", left: "10%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    brb: { parent: null, role: "jong-right", emitted: false, defaults: { top: "46%", left: "24%", size: "0.54em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bb: { parent: null, role: "jong-main", emitted: false, defaults: { top: "56%", left: "14%", size: "0.52em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } },
    bbr: { parent: null, role: "jong-right", emitted: false, defaults: { top: "50%", left: "24%", size: "0.50em", "scale-x": "1", "scale-y": "1", rotate: null, weight: null, stroke: null, clip: null, dilate: null } }
  };
  var SLOT_SUFFIXES = [
    { suffix: "top", type: "length-percentage", roleFallback: true },
    { suffix: "left", type: "length-percentage", roleFallback: true },
    { suffix: "size", type: "length-percentage", roleFallback: true },
    { suffix: "scale-x", type: "number", roleFallback: true },
    { suffix: "scale-y", type: "number", roleFallback: true },
    { suffix: "rotate", type: "angle", roleFallback: true },
    { suffix: "weight", type: "font-weight", roleFallback: true },
    { suffix: "stroke", type: "length", roleFallback: true },
    { suffix: "clip", type: "clip-path", roleFallback: true },
    { suffix: "dilate", type: "filter", roleFallback: true }
  ];
  var PAGE_ONLY_VARIABLES = [
    "--fy-jamo-depth",
    "--fy-vowel-depth",
    "--fy-coda-depth",
    "--fy-sprite-filter",
    "--fy-vector-stroke",
    "--fy-stroke-depth",
    "--fy-hoek-dx",
    "--fy-hoek-dy",
    "--fy-hoek-rotate",
    "--fy-hoek-scale-x",
    "--fy-hoek-scale-y",
    "--fy-glow",
    "--fy-ink-boxes",
    "--fy-face",
    "--fy-design",
    "--fy-element-width",
    "--fy-element-cap",
    "--fy-element-fill",
    "--fy-selection",
    "--fy-element-outline",
    "--fy-element-weight",
    "--fy-optical-sprite-zoom",
    "--fy-optical-sprite-crop-x",
    "--fy-optical-sprite-crop-y",
    "--fy-optical-sprite-filter",
    "--fy-top",
    "--fy-left",
    "--fy-font-size",
    "--fy-weight",
    "--fy-stroke",
    "--fy-clip",
    "--fy-scale-x",
    "--fy-scale-y",
    "--fy-rotate"
  ];
  // END GENERATED CSS CONTRACT: studio-slot-contract

  /* Editing metadata per slot suffix. The suffix list itself comes from the
   * generated contract (SLOT_SUFFIXES when the generator emits it, else the
   * keys of SLOT_CONTRACT defaults), so new registry suffixes (rotate, clip,
   * dilate …) show up without touching this file. `offset` is the cumulative
   * correction suffix (--fy-jamo-<offset>, --fy-ctx-<offset>). */
  var SUFFIX_META = {
    top: { offset: "dy", unit: "%" },
    left: { offset: "dx", unit: "%" },
    size: { unit: "em" },
    "scale-x": { offset: "scale-x" },
    "scale-y": { offset: "scale-y" },
    rotate: { offset: "rotate", unit: "deg" },
    weight: { fontVar: "--fy-font-weight" },
    stroke: { unit: "em", fontVar: "--fy-font-stroke" },
    clip: {},
    dilate: { fontVar: "--fy-sprite-dilate" }
  };

  /* Variables only pages may set (ADR-008: the page has the last word). The
   * generator may emit PAGE_ONLY_VARIABLES from the registry; this fallback
   * mirrors spec/css-variables.json v2.1 (direct-jamo family + page scope). */
  function pageOnlyVariables() {
    /* global PAGE_ONLY_VARIABLES */
    if (typeof PAGE_ONLY_VARIABLES !== "undefined" && Array.isArray(PAGE_ONLY_VARIABLES)) {
      return PAGE_ONLY_VARIABLES;
    }
    return ["--fy-top", "--fy-left", "--fy-font-size", "--fy-weight", "--fy-stroke", "--fy-clip", "--fy-scale-x",
      "--fy-jamo-depth", "--fy-vowel-depth", "--fy-coda-depth",
      "--fy-scale-y", "--fy-rotate", "--fy-sprite-filter", "--fy-optical-sprite-zoom", "--fy-optical-sprite-crop-x",
      "--fy-optical-sprite-crop-y", "--fy-optical-sprite-filter"];
  }

  function contractSuffixes() {
    /* global SLOT_SUFFIXES */
    if (typeof SLOT_SUFFIXES !== "undefined" && Array.isArray(SLOT_SUFFIXES)) {
      return SLOT_SUFFIXES.map(function (entry) {
        return typeof entry === "string" ? { suffix: entry } : entry;
      });
    }
    var seen = [];
    Object.keys(SLOT_CONTRACT).forEach(function (slot) {
      Object.keys(SLOT_CONTRACT[slot].defaults || {}).forEach(function (suffix) {
        if (seen.indexOf(suffix) < 0) {
          seen.push(suffix);
        }
      });
    });
    return seen.map(function (suffix) { return { suffix: suffix }; });
  }

  /* 속성별 해석 체인. role은 role 티어 변수 접미사, offset은 누적 보정 접미사. */
  var PROPERTIES = contractSuffixes().map(function (entry) {
    var meta = SUFFIX_META[entry.suffix] || {};
    return {
      key: entry.suffix,
      role: entry.suffix,
      roleFallback: entry.roleFallback !== false,
      offset: meta.offset || null,
      unit: meta.unit || "",
      fontVar: meta.fontVar || null
    };
  });

  function propertyDefinition(key) {
    for (var index = 0; index < PROPERTIES.length; index += 1) {
      if (PROPERTIES[index].key === key) {
        return PROPERTIES[index];
      }
    }
    return null;
  }

  function slotChain(pos) {
    var chain = [];
    for (var slot = pos, guard = 0; slot && guard < 16; guard += 1) {
      chain.push(slot);
      slot = SLOT_CONTRACT[slot] ? SLOT_CONTRACT[slot].parent : null;
    }
    return chain;
  }

  /* The non-emitted parent of an emitted slot and the emitted slots sharing
   * it (e.g. tl → tlo, tlc, tls, ttl). Contracts without `emitted` treat
   * every slot as emitted. */
  function slotFamily(pos) {
    var entry = SLOT_CONTRACT[pos];
    var parent = entry ? entry.parent : null;
    if (!parent) {
      return null;
    }
    var members = Object.keys(SLOT_CONTRACT).filter(function (slot) {
      return SLOT_CONTRACT[slot].parent === parent && SLOT_CONTRACT[slot].emitted !== false;
    });
    return { parent: parent, role: SLOT_CONTRACT[parent].role || entry.role || null, members: members };
  }

  // ── Character classes ──────────────────────────────────────────────────

  function isWs(char) {
    return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
  }

  function isNameCode(code) {
    return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
      code === 45 || code === 95 || code >= 128;
  }

  function isHex(char) {
    return /^[0-9a-fA-F]$/.test(char || "");
  }

  // ── Low-level scanning (shared by the parser and the text helpers) ─────

  function addError(p, severity, code, message, offset) {
    if (!p) {
      return;
    }
    var key = code + "@" + offset;
    if (p.errorKeys[key]) {
      return;
    }
    p.errorKeys[key] = true;
    var position = positionOf(p.lineStarts, offset);
    p.errors.push({ severity: severity, code: code, message: message, offset: offset, line: position.line, column: position.column });
  }

  function skipComment(p, text, index, end) {
    var close = text.indexOf("*/", index + 2);
    if (close < 0 || close + 2 > end) {
      addError(p, "error", "unterminated-comment", "주석이 닫히지 않아 블록 끝까지 주석으로 읽힙니다", index);
      return end;
    }
    return close + 2;
  }

  /* CSS Syntax §4.3.5: an unescaped newline ends the string as a bad-string
   * (the newline itself is not consumed); EOF ends it silently. */
  function scanString(p, text, index, end) {
    var quote = text[index];
    var cursor = index + 1;
    while (cursor < end) {
      var char = text[cursor];
      if (char === quote) {
        return { end: cursor + 1, bad: false };
      }
      if (char === "\\") {
        if (text[cursor + 1] === "\r" && text[cursor + 2] === "\n") {
          cursor += 3;
        } else {
          cursor += 2;
        }
        continue;
      }
      if (char === "\n" || char === "\r" || char === "\f") {
        addError(p, "error", "bad-string", "문자열이 줄바꿈 전에 닫히지 않았습니다 — 그 선언은 무시됩니다", index);
        return { end: cursor, bad: true };
      }
      cursor += 1;
    }
    if (cursor > end) {
      cursor = end;
    }
    addError(p, "warning", "unterminated-string", "문자열이 파일 끝까지 닫히지 않았습니다", index);
    return { end: cursor, bad: false };
  }

  function isUrlStart(text, index) {
    if (text.substr(index, 4).toLowerCase() !== "url(") {
      return false;
    }
    if (index === 0) {
      return true;
    }
    var previous = text.charCodeAt(index - 1);
    return !isNameCode(previous) && text[index - 1] !== "\\";
  }

  /* Unquoted url( … ) is one token: `;`, `{`, `}` inside it do not count.
   * Returns null for url("…") (a function token with a string argument). */
  function scanUrl(p, text, index, end) {
    var cursor = index + 4;
    while (cursor < end && isWs(text[cursor])) {
      cursor += 1;
    }
    if (text[cursor] === '"' || text[cursor] === "'") {
      return null;
    }
    function remnants(from) {
      addError(p, "error", "bad-url", "url( … )에 허용되지 않는 문자가 있습니다 — 그 선언은 무시됩니다", index);
      for (var at = from; at < end; at += 1) {
        if (text[at] === ")") {
          return { end: at + 1, bad: true };
        }
        if (text[at] === "\\") {
          at += 1;
        }
      }
      return { end: end, bad: true };
    }
    while (cursor < end) {
      var char = text[cursor];
      if (char === ")") {
        return { end: cursor + 1, bad: false };
      }
      if (char === "\\") {
        cursor += 2;
        continue;
      }
      if (isWs(char)) {
        var after = cursor;
        while (after < end && isWs(text[after])) {
          after += 1;
        }
        if (text[after] === ")") {
          return { end: after + 1, bad: false };
        }
        return remnants(after);
      }
      if (char === '"' || char === "'" || char === "(") {
        return remnants(cursor);
      }
      cursor += 1;
    }
    return { end: end, bad: true };
  }

  var CLOSER = { "(": ")", "[": "]", "{": "}" };

  /* Walk component values from `index` until a top-level char in `stops`
   * (outside strings, comments, url tokens and (), [], {} blocks). Unmatched
   * closers are plain tokens and unclosed openers swallow the rest, as in
   * CSS Syntax §5. With `stack` (e.g. ["}"]) it returns at the closer that
   * empties the stack: the end of the block whose body starts at `index`. */
  function scan(p, text, index, end, stops, stack) {
    var open = stack ? stack.slice() : [];
    var bad = null;
    var cursor = index;
    while (cursor < end) {
      var char = text[cursor];
      if (char === "/" && text[cursor + 1] === "*") {
        cursor = skipComment(p, text, cursor, end);
        continue;
      }
      if (char === '"' || char === "'") {
        var string = scanString(p, text, cursor, end);
        if (string.bad) {
          bad = bad || "bad-string";
        }
        cursor = string.end;
        continue;
      }
      if (char === "\\") {
        cursor += 2;
        continue;
      }
      if ((char === "u" || char === "U") && isUrlStart(text, cursor)) {
        var url = scanUrl(p, text, cursor, end);
        if (url) {
          if (url.bad) {
            bad = bad || "bad-url";
          }
          cursor = url.end;
          continue;
        }
      }
      if (open.length === 0 && stops && stops.indexOf(char) >= 0) {
        return { index: cursor, char: char, bad: bad };
      }
      if (CLOSER[char]) {
        open.push(CLOSER[char]);
      } else if (char === ")" || char === "]" || char === "}") {
        if (open.length && open[open.length - 1] === char) {
          open.pop();
          if (stack && open.length === 0) {
            return { index: cursor, char: char, bad: bad };
          }
        }
      }
      cursor += 1;
    }
    return { index: end, char: null, bad: bad, unclosed: open.length };
  }

  function skipTrivia(p, text, index, end) {
    var cursor = index;
    while (cursor < end) {
      var char = text[cursor];
      if (isWs(char)) {
        cursor += 1;
      } else if (char === "/" && text[cursor + 1] === "*") {
        cursor = skipComment(p, text, cursor, end);
      } else {
        break;
      }
    }
    return cursor;
  }

  /* Comments removed (string-aware), whitespace collapsed outside strings. */
  function cleanText(value) {
    var text = String(value);
    var out = "";
    var space = false;
    var index = 0;
    while (index < text.length) {
      var char = text[index];
      if (char === "/" && text[index + 1] === "*") {
        var close = text.indexOf("*/", index + 2);
        index = close < 0 ? text.length : close + 2;
        space = true;
        continue;
      }
      if (isWs(char)) {
        space = true;
        index += 1;
        continue;
      }
      if (space && out) {
        out += " ";
      }
      space = false;
      if (char === '"' || char === "'") {
        var string = scanString(null, text, index, text.length);
        out += text.slice(index, string.end);
        index = string.end;
        continue;
      }
      if (char === "\\") {
        out += text.slice(index, index + 2);
        index += 2;
        continue;
      }
      out += char;
      index += 1;
    }
    return out;
  }

  function stripComments(value) {
    return cleanText(value);
  }

  // ── Positions ──────────────────────────────────────────────────────────

  function computeLineStarts(text) {
    var starts = [0];
    for (var index = 0; index < text.length; index += 1) {
      var code = text.charCodeAt(index);
      if (code === 10 || (code === 13 && text.charCodeAt(index + 1) !== 10) || code === 12) {
        starts.push(index + 1);
      }
    }
    return starts;
  }

  function positionOf(lineStarts, offset) {
    var low = 0;
    var high = lineStarts.length - 1;
    while (low < high) {
      var middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { line: low + 1, column: offset - lineStarts[low] + 1 };
  }

  function detectEol(text) {
    var crlf = (text.match(/\r\n/g) || []).length;
    var lf = (text.match(/\n/g) || []).length - crlf;
    return crlf > lf ? "\r\n" : "\n";
  }

  function detectIndentUnit(text) {
    var match = /\n(\t+|[ ]{2,8})\S/.exec(text);
    if (!match) {
      return "  ";
    }
    if (match[1][0] === "\t") {
      return "\t";
    }
    var best = match[1].length;
    var pattern = /\n([ ]+)\S/g;
    var found;
    while ((found = pattern.exec(text)) !== null) {
      if (found[1].length >= 2 && found[1].length < best) {
        best = found[1].length;
      }
    }
    return new Array(best + 1).join(" ");
  }

  // ── Layers (CSS Cascade 5) ─────────────────────────────────────────────

  /* Layer order: siblings rank by first declaration, nested layers rank
   * inside their parent, and a layer's own (sublayer-less) rules rank after
   * all of its sublayers. A rule's key is the index path plus Infinity, so
   * keys compare lexicographically; unlayered rules get [Infinity]. */
  function createLayerRegistry() {
    var root = { name: null, full: null, path: [], children: {}, count: 0 };
    var anonymousCount = 0;
    var ordered = [];
    function child(parent, name) {
      if (!Object.prototype.hasOwnProperty.call(parent.children, name)) {
        var node = {
          name: name,
          full: parent.full ? parent.full + "." + name : name,
          path: parent.path.concat([parent.count]),
          children: {},
          count: 0
        };
        parent.children[name] = node;
        parent.count += 1;
        ordered.push(node.full);
      }
      return parent.children[name];
    }
    function declare(parent, dotted) {
      var node = parent || root;
      String(dotted).split(".").forEach(function (part) {
        node = child(node, part.trim());
      });
      return node;
    }
    function anonymous(parent) {
      anonymousCount += 1;
      return child(parent || root, "(anonymous " + anonymousCount + ")");
    }
    function find(full) {
      if (!full) {
        return null;
      }
      var node = root;
      var parts = String(full).split(".");
      for (var index = 0; index < parts.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(node.children, parts[index])) {
          return null;
        }
        node = node.children[parts[index]];
      }
      return node;
    }
    return { root: root, declare: declare, anonymous: anonymous, find: find, order: ordered };
  }

  function layerKeyOf(node) {
    return node ? node.path.concat([Infinity]) : [Infinity];
  }

  function compareKeys(a, b) {
    var length = Math.max(a.length, b.length);
    for (var index = 0; index < length; index += 1) {
      var x = index < a.length ? a[index] : -1;
      var y = index < b.length ? b[index] : -1;
      if (x !== y) {
        return x < y ? -1 : 1;
      }
    }
    return 0;
  }

  // ── Parsing ────────────────────────────────────────────────────────────

  var GROUP_AT_RULES = { layer: true, media: true, supports: true, container: true, scope: true, "starting-style": true, document: true, "-moz-document": true };
  var DESCRIPTOR_AT_RULES = {
    "font-face": true, property: true, page: true, "counter-style": true, "font-palette-values": true,
    "font-feature-values": true, "view-transition": true, "position-try": true, viewport: true
  };

  function readAtName(text, index) {
    var cursor = index + 1;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
      } else if (isNameCode(text.charCodeAt(cursor))) {
        cursor += 1;
      } else {
        break;
      }
    }
    return { name: text.slice(index + 1, cursor).toLowerCase(), end: cursor };
  }

  /* Why a qualified-rule prelude can never match (browsers drop the rule). */
  function selectorProblem(raw) {
    var masked = cleanText(raw).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/\\[\s\S]/g, "x");
    if (!masked.trim()) {
      return "empty";
    }
    if (masked.indexOf(";") >= 0) {
      return "stray-semicolon";
    }
    if (/[{}]/.test(masked)) {
      return "stray-brace";
    }
    if (masked.indexOf("@") >= 0) {
      return "stray-at-rule";
    }
    return null;
  }

  var SELECTOR_PROBLEMS = {
    empty: "셀렉터가 비었습니다",
    "stray-semicolon": "앞의 떠돌이 ';'가 셀렉터에 붙어 이 규칙은 무시됩니다",
    "stray-brace": "앞의 떠돌이 '}'가 셀렉터에 붙어 이 규칙은 무시됩니다",
    "stray-at-rule": "셀렉터에 at-rule이 섞여 이 규칙은 무시됩니다"
  };

  function newContext() {
    return { layerNode: null, layer: null, conditions: [], invalid: null };
  }

  function extendContext(p, context, name, prelude, offset) {
    if (name === "layer") {
      var layerName = prelude.trim();
      var parent = context.layerNode || p.layers.root;
      var invalid = context.invalid;
      var node;
      if (!layerName) {
        node = p.layers.anonymous(parent);
      } else if (!/^[^\s,]+$/.test(layerName)) {
        addError(p, "error", "invalid-layer-block", "@layer 블록에는 이름을 하나만 쓸 수 있습니다 — 블록 전체가 무시됩니다", offset);
        invalid = invalid || "invalid-layer-block";
        node = p.layers.anonymous(parent);
      } else {
        node = p.layers.declare(parent, layerName);
      }
      return { layerNode: node, layer: node.full, conditions: context.conditions, invalid: invalid };
    }
    var position = positionOf(p.lineStarts, offset);
    return {
      layerNode: context.layerNode,
      layer: context.layer,
      conditions: context.conditions.concat([{ type: name, text: prelude.trim(), line: position.line }]),
      invalid: context.invalid
    };
  }

  function blockBounds(p, text, open, end) {
    var close = scan(p, text, open + 1, end, null, ["}"]);
    var closed = close.char === "}";
    if (!closed) {
      addError(p, "error", "unclosed-block", "블록이 닫히지 않았습니다 — 브라우저처럼 끝에서 닫은 것으로 읽습니다", open);
    }
    return { bodyStart: open + 1, bodyEnd: closed ? close.index : end, end: closed ? close.index + 1 : end, closed: closed };
  }

  function parseRuleList(p, start, end, context) {
    var text = p.text;
    var items = [];
    var cursor = start;
    while (cursor < end) {
      cursor = skipTrivia(p, text, cursor, end);
      if (cursor >= end) {
        break;
      }
      if (text[cursor] === "@") {
        var atRule = parseAtRule(p, cursor, end, context);
        items.push(atRule);
        cursor = atRule.end;
        continue;
      }
      /* A qualified rule runs to its `{`; stray `;`/`}` before it become part
       * of its prelude (and invalidate it), exactly like CSS Syntax. */
      var stop = scan(p, text, cursor, end, "{");
      if (stop.char !== "{") {
        addError(p, "error", "trailing-garbage", "블록 없는 텍스트는 무시됩니다: " + cleanText(text.slice(cursor, Math.min(stop.index, cursor + 40))), cursor);
        var position = positionOf(p.lineStarts, cursor);
        items.push({ type: "garbage", text: text.slice(cursor, stop.index), start: cursor, end: stop.index, line: position.line });
        cursor = stop.index;
        break;
      }
      var rule = buildStyleRule(p, cursor, stop.index, end, context, null);
      items.push(rule);
      cursor = rule.end;
    }
    return items;
  }

  function parseAtRule(p, index, end, context) {
    var text = p.text;
    var at = readAtName(text, index);
    var stop = scan(p, text, at.end, end, ";{");
    var position = positionOf(p.lineStarts, index);
    var prelude = cleanText(text.slice(at.end, stop.index));
    if (stop.char !== "{") {
      var terminated = stop.char === ";";
      if (!terminated) {
        addError(p, "warning", "unterminated-statement", "@" + at.name + " 문장이 ';' 없이 끝났습니다", index);
      }
      var statement = {
        type: "statement",
        atRule: at.name,
        prelude: prelude,
        text: cleanText(text.slice(index, stop.index)),
        start: index,
        end: terminated ? stop.index + 1 : stop.index,
        line: position.line,
        column: position.column
      };
      if (at.name === "layer") {
        statement.layers = prelude.split(",").map(function (name) { return name.trim(); }).filter(Boolean).map(function (name) {
          return p.layers.declare(context.layerNode, name).full;
        });
      }
      p.statements.push(statement);
      return statement;
    }
    var bounds = blockBounds(p, text, stop.index, end);
    var block = {
      type: "block",
      atRule: at.name,
      prelude: cleanText(text.slice(index, stop.index)),
      preludeStart: index,
      preludeEnd: stop.index,
      bodyStart: bounds.bodyStart,
      bodyEnd: bounds.bodyEnd,
      end: bounds.end,
      closed: bounds.closed,
      line: position.line,
      column: position.column
    };
    if (GROUP_AT_RULES[at.name]) {
      var inner = extendContext(p, context, at.name, prelude, index);
      block.kind = "group";
      block.layer = at.name === "layer" ? inner.layer : null;
      block.condition = at.name === "layer" ? null : prelude;
      block.withinLayer = context.layer;
      block.conditions = inner.conditions;
      block.children = parseRuleList(p, bounds.bodyStart, bounds.bodyEnd, inner);
      p.groups.push(block);
    } else if (/^(-[a-z]+-)?keyframes$/.test(at.name)) {
      block.kind = "at-rule";
      block.name = prelude;
      block.children = parseKeyframes(p, bounds.bodyStart, bounds.bodyEnd);
    } else if (DESCRIPTOR_AT_RULES[at.name]) {
      block.kind = "at-rule";
      block.declarations = parseDeclarationList(p, bounds.bodyStart, bounds.bodyEnd);
    } else {
      block.kind = "at-rule";
      addError(p, "warning", "unknown-at-rule", "모르는 at-rule @" + at.name + "은 원문 그대로 둡니다", index);
    }
    p.atRules.push(block);
    return block;
  }

  function parseKeyframes(p, start, end) {
    var text = p.text;
    var frames = [];
    var cursor = start;
    while (cursor < end) {
      cursor = skipTrivia(p, text, cursor, end);
      if (cursor >= end) {
        break;
      }
      var stop = scan(p, text, cursor, end, "{");
      if (stop.char !== "{") {
        break;
      }
      var bounds = blockBounds(p, text, stop.index, end);
      frames.push({
        type: "block",
        kind: "keyframe",
        selector: cleanText(text.slice(cursor, stop.index)),
        preludeStart: cursor,
        bodyStart: bounds.bodyStart,
        bodyEnd: bounds.bodyEnd,
        end: bounds.end,
        declarations: parseDeclarationList(p, bounds.bodyStart, bounds.bodyEnd)
      });
      cursor = bounds.end;
    }
    return frames;
  }

  function parseDeclarationList(p, start, end) {
    var text = p.text;
    var declarations = [];
    var cursor = start;
    while (cursor < end) {
      cursor = skipTrivia(p, text, cursor, end);
      if (cursor >= end) {
        break;
      }
      if (text[cursor] === ";") {
        cursor += 1;
        continue;
      }
      var stop = scan(p, text, cursor, end, ";");
      var declaration = parseDeclaration(p, cursor, stop.index, stop.char === ";", stop.bad);
      if (declaration) {
        declarations.push(declaration);
      }
      cursor = stop.char === ";" ? stop.index + 1 : stop.index;
    }
    return declarations;
  }

  function isCustomPropertyStart(text, start, stop) {
    return /^--[^\s:]*\s*:/.test(cleanText(text.slice(start, stop)));
  }

  function buildStyleRule(p, preludeStart, open, end, context, parentRule) {
    var text = p.text;
    var bounds = blockBounds(p, text, open, end);
    var raw = text.slice(preludeStart, open);
    var selector = cleanText(raw);
    var position = positionOf(p.lineStarts, preludeStart);
    var rule = {
      type: "block",
      kind: "rule",
      prelude: selector,
      selector: selector,
      preludeStart: preludeStart,
      preludeEnd: open,
      bodyStart: bounds.bodyStart,
      bodyEnd: bounds.bodyEnd,
      end: bounds.end,
      closed: bounds.closed,
      line: position.line,
      column: position.column,
      layer: context.layer,
      layerKey: layerKeyOf(context.layerNode),
      conditions: context.conditions.slice(),
      nested: Boolean(parentRule),
      order: p.rules.length,
      invalid: context.invalid || null,
      declarations: [],
      children: []
    };
    if (parentRule) {
      Object.defineProperty(rule, "parentRule", { value: parentRule, enumerable: false, writable: true });
    }
    var problem = selectorProblem(raw);
    if (problem) {
      rule.invalid = rule.invalid || problem;
      addError(p, "error", problem, SELECTOR_PROBLEMS[problem] || "셀렉터 오류", preludeStart);
    }
    rule.effectiveSelector = parentRule ? resolveNesting(parentRule.effectiveSelector, selector) : selector;
    rule.specificity = selectorSpecificity(rule.effectiveSelector);
    p.rules.push(rule);
    if (parentRule) {
      p.nesting.push(rule);
    }
    parseStyleBody(p, rule, bounds.bodyStart, bounds.bodyEnd, context);
    return rule;
  }

  /* Style rule body: declarations, CSS-nesting rules and nested group rules. */
  function parseStyleBody(p, rule, start, end, context) {
    var text = p.text;
    var cursor = start;
    while (cursor < end) {
      cursor = skipTrivia(p, text, cursor, end);
      if (cursor >= end) {
        break;
      }
      var char = text[cursor];
      if (char === ";") {
        cursor += 1;
        continue;
      }
      if (char === "@") {
        cursor = parseNestedAtRule(p, rule, cursor, end, context);
        continue;
      }
      var stop = scan(p, text, cursor, end, ";{");
      if (stop.char === "{" && !isCustomPropertyStart(text, cursor, stop.index)) {
        var child = buildStyleRule(p, cursor, stop.index, end, context, rule);
        rule.children.push(child);
        cursor = child.end;
        continue;
      }
      if (stop.char === "{") {
        stop = scan(p, text, cursor, end, ";"); // custom property value holding {} blocks
      }
      var declaration = parseDeclaration(p, cursor, stop.index, stop.char === ";", stop.bad);
      if (declaration) {
        declaration.index = rule.declarations.length;
        rule.declarations.push(declaration);
        if (declaration.important) {
          p.important.push({ rule: rule, declaration: declaration });
        }
      }
      cursor = stop.char === ";" ? stop.index + 1 : stop.index;
    }
  }

  function parseNestedAtRule(p, rule, index, end, context) {
    var text = p.text;
    var at = readAtName(text, index);
    var stop = scan(p, text, at.end, end, ";{");
    var prelude = cleanText(text.slice(at.end, stop.index));
    if (stop.char !== "{") {
      if (at.name === "layer") {
        prelude.split(",").forEach(function (name) {
          if (name.trim()) {
            p.layers.declare(context.layerNode, name.trim());
          }
        });
      }
      return stop.char === ";" ? stop.index + 1 : stop.index;
    }
    var bounds = blockBounds(p, text, stop.index, end);
    var position = positionOf(p.lineStarts, index);
    if (!GROUP_AT_RULES[at.name]) {
      addError(p, "warning", "nested-at-rule", "스타일 규칙 안의 @" + at.name + "은 해석하지 않습니다", index);
      rule.children.push({ type: "block", kind: "at-rule", atRule: at.name, prelude: prelude, preludeStart: index, bodyStart: bounds.bodyStart, bodyEnd: bounds.bodyEnd, end: bounds.end, line: position.line });
      return bounds.end;
    }
    var inner = extendContext(p, context, at.name, prelude, index);
    var group = {
      type: "block",
      kind: "rule",
      atRule: at.name,
      condition: at.name === "layer" ? null : prelude,
      prelude: rule.selector,
      selector: rule.selector,
      effectiveSelector: rule.effectiveSelector,
      specificity: rule.specificity,
      preludeStart: index,
      preludeEnd: stop.index,
      bodyStart: bounds.bodyStart,
      bodyEnd: bounds.bodyEnd,
      end: bounds.end,
      closed: bounds.closed,
      line: position.line,
      column: position.column,
      layer: inner.layer,
      layerKey: layerKeyOf(inner.layerNode),
      conditions: inner.conditions.slice(),
      nested: true,
      order: p.rules.length,
      invalid: rule.invalid || inner.invalid || null,
      declarations: [],
      children: []
    };
    Object.defineProperty(group, "parentRule", { value: rule, enumerable: false, writable: true });
    p.rules.push(group);
    p.nesting.push(group);
    rule.children.push(group);
    parseStyleBody(p, group, bounds.bodyStart, bounds.bodyEnd, inner);
    return bounds.end;
  }

  /* Significant pieces of a declaration value: runs of non-whitespace
   * outside comments; strings are pieces of their own. */
  function valuePieces(p, text, start, end) {
    var pieces = [];
    var current = null;
    var cursor = start;
    while (cursor < end) {
      var char = text[cursor];
      if (char === "/" && text[cursor + 1] === "*") {
        current = null;
        cursor = skipComment(p, text, cursor, end);
        continue;
      }
      if (isWs(char)) {
        current = null;
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        current = null;
        var string = scanString(p, text, cursor, end);
        pieces.push({ start: cursor, end: string.end, string: true });
        cursor = string.end;
        continue;
      }
      var step = 1;
      if (char === "\\") {
        step = 2;
      } else if ((char === "u" || char === "U") && isUrlStart(text, cursor)) {
        var url = scanUrl(p, text, cursor, end);
        if (url) {
          step = url.end - cursor;
        }
      }
      if (!current) {
        current = { start: cursor, end: cursor, string: false };
        pieces.push(current);
      }
      cursor = Math.min(end, cursor + step);
      current.end = cursor;
    }
    return pieces;
  }

  function parseDeclaration(p, start, stop, terminated, bad) {
    var text = p.text;
    var colon = scan(null, text, start, stop, ":");
    var position = positionOf(p.lineStarts, start);
    if (colon.char !== ":") {
      if (cleanText(text.slice(start, stop))) {
        addError(p, "warning", "no-colon", "':'가 없는 선언은 무시됩니다: " + cleanText(text.slice(start, Math.min(stop, start + 40))), start);
      }
      return null;
    }
    var name = cleanText(text.slice(start, colon.index));
    if (!/^(--\S*|-?[A-Za-z_\u0080-￿][\w\u0080-￿-]*)$/.test(name)) {
      addError(p, "warning", "bad-property-name", "속성 이름이 올바르지 않습니다: " + name, start);
      return null;
    }
    var pieces = valuePieces(p, text, colon.index + 1, stop);
    var valueStart = pieces.length ? pieces[0].start : colon.index + 1;
    if (!pieces.length) {
      while (valueStart < stop && isWs(text[valueStart])) {
        valueStart += 1;
      }
    }
    var contentEnd = pieces.length ? pieces[pieces.length - 1].end : valueStart;
    var valueEnd = contentEnd;
    var importantStart = -1;
    var last = pieces[pieces.length - 1];
    if (last && !last.string) {
      var lastText = text.slice(last.start, last.end);
      if (/!important$/i.test(lastText)) {
        importantStart = last.end - 10;
        valueEnd = importantStart > last.start ? importantStart : (pieces.length > 1 ? pieces[pieces.length - 2].end : importantStart);
      } else if (/^important$/i.test(lastText) && pieces.length > 1) {
        var previous = pieces[pieces.length - 2];
        if (!previous.string && text[previous.end - 1] === "!") {
          importantStart = previous.end - 1;
          valueEnd = importantStart > previous.start ? importantStart : (pieces.length > 2 ? pieces[pieces.length - 3].end : importantStart);
        }
      }
    }
    if (valueEnd < valueStart) {
      valueEnd = valueStart;
    }
    return {
      name: name,
      value: text.slice(valueStart, valueEnd),
      important: importantStart >= 0,
      custom: name.slice(0, 2) === "--",
      start: start,
      colon: colon.index,
      valueStart: valueStart,
      valueEnd: valueEnd,
      importantStart: importantStart,
      contentEnd: contentEnd,
      end: terminated ? stop + 1 : contentEnd,
      terminated: terminated,
      line: position.line,
      column: position.column,
      invalid: bad || null
    };
  }

  /* Parse font CSS into a position-aware tree.
   *
   * Returns {
   *   text, eol, indentUnit,
   *   items:  top-level nodes — { type: "statement", atRule, prelude, layers? }
   *           | { type: "block", kind: "group", atRule, layer|condition, children }
   *           | { type: "block", kind: "rule", selector, declarations, children }
   *           | { type: "block", kind: "at-rule", atRule, declarations|children }
   *           | { type: "garbage" },
   *   rules:  every style rule in document order (nested ones included) with
   *           { layer, layerKey, conditions[{type,text,line}], nested,
   *             effectiveSelector, specificity, order, invalid, line, column },
   *   declarations carry { name, value, important, valueStart, valueEnd, … },
   *   errors: [{ severity, code, message, offset, line, column }],
   *   layerOrder, statements, atRules, groups, nesting, important
   * }
   * `options.seedLayers` (default LAYERS) are declared first, like the
   * core stylesheet does before any font. Never throws. */
  function parse(text, options) {
    var source = String(text == null ? "" : text);
    var opts = options || {};
    var p = {
      text: source,
      errors: [],
      errorKeys: {},
      rules: [],
      statements: [],
      atRules: [],
      groups: [],
      nesting: [],
      important: [],
      lineStarts: computeLineStarts(source),
      layers: createLayerRegistry()
    };
    (opts.seedLayers || LAYERS).forEach(function (name) {
      p.layers.declare(null, name);
    });
    var items = parseRuleList(p, 0, source.length, newContext());
    var lineStarts = p.lineStarts;
    return {
      text: source,
      eol: detectEol(source),
      indentUnit: detectIndentUnit(source),
      items: items,
      rules: p.rules,
      errors: p.errors,
      statements: p.statements,
      atRules: p.atRules,
      groups: p.groups,
      nesting: p.nesting,
      important: p.important,
      layers: p.layers,
      layerOrder: p.layers.order.slice(),
      position: function (offset) { return positionOf(lineStarts, offset); },
      lineOf: function (offset) { return positionOf(lineStarts, offset).line; }
    };
  }

  /* Parse errors plus lint-style findings the Studio cannot model faithfully
   * (ADR-008 fonts forbid !important and CSS nesting). The full font lint is
   * site/font-kku-lint.js (a superset, ADR-008 §9); the Studio shows that and
   * falls back to this only when the lint script is missing. */
  function diagnostics(doc) {
    var list = doc.errors.slice();
    doc.important.forEach(function (entry) {
      list.push({
        severity: "warning",
        code: "important",
        message: entry.declaration.name + "에 !important — 폰트 계약은 !important를 금지합니다(레이어 순서가 뒤집힘)",
        offset: entry.declaration.start,
        line: entry.declaration.line,
        column: entry.declaration.column
      });
    });
    doc.nesting.forEach(function (rule) {
      list.push({
        severity: "warning",
        code: "nesting",
        message: "중첩 규칙(CSS nesting) — 폰트 계약은 금지하며 스튜디오는 이 규칙을 편집하지 않습니다",
        offset: rule.preludeStart,
        line: rule.line,
        column: rule.column
      });
    });
    var pageOnly = pageOnlyVariables();
    doc.rules.forEach(function (rule) {
      rule.declarations.forEach(function (declaration) {
        if (pageOnly.indexOf(declaration.name) >= 0) {
          list.push({
            severity: "warning",
            code: "page-only",
            message: declaration.name + "는 페이지 전용 변수입니다 — 폰트가 선언하면 페이지가 덮을 수 없게 됩니다(린트 실패)",
            offset: declaration.start,
            line: declaration.line,
            column: declaration.column
          });
        }
      });
      if (!rule.nested && rule.layer === null && !rule.invalid) {
        list.push({
          severity: "warning",
          code: "unlayered",
          message: "레이어 밖 규칙 — 모든 폰트 레이어를 이깁니다",
          offset: rule.preludeStart,
          line: rule.line,
          column: rule.column
        });
      }
    });
    return list.sort(function (a, b) { return a.offset - b.offset; });
  }

  // ── Selectors: escapes, canonical form, specificity ────────────────────

  function readEscape(text, index) {
    var next = text[index + 1];
    if (next === undefined) {
      return { char: "�", end: index + 1 };
    }
    if (isHex(next)) {
      var cursor = index + 1;
      while (cursor < text.length && cursor < index + 7 && isHex(text[cursor])) {
        cursor += 1;
      }
      var code = parseInt(text.slice(index + 1, cursor), 16);
      if (text[cursor] === "\r" && text[cursor + 1] === "\n") {
        cursor += 2;
      } else if (isWs(text[cursor])) {
        cursor += 1;
      }
      var char = code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF) ? "�" : String.fromCodePoint(code);
      return { char: char, end: cursor };
    }
    var point = text.codePointAt(index + 1);
    var single = String.fromCodePoint(point);
    return { char: single, end: index + 1 + single.length };
  }

  function unescapeIdent(value) {
    var text = String(value);
    var out = "";
    for (var index = 0; index < text.length;) {
      if (text[index] === "\\") {
        var escape = readEscape(text, index);
        out += escape.char;
        index = escape.end;
      } else {
        out += text[index];
        index += 1;
      }
    }
    return out;
  }

  function readStringValue(text, index) {
    var quote = text[index];
    var out = "";
    var cursor = index + 1;
    while (cursor < text.length && text[cursor] !== quote) {
      if (text[cursor] === "\\") {
        if (text[cursor + 1] === "\n") {
          cursor += 2;
          continue;
        }
        if (text[cursor + 1] === "\r" && text[cursor + 2] === "\n") {
          cursor += 3;
          continue;
        }
        var escape = readEscape(text, cursor);
        out += escape.char;
        cursor = escape.end;
        continue;
      }
      if (text[cursor] === "\n") {
        break;
      }
      out += text[cursor];
      cursor += 1;
    }
    return { value: out, end: Math.min(text.length, cursor + 1) };
  }

  /* A CSS string literal ("…") for `value`. */
  function cssString(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ").replace(/\r/g, "\\d ") + '"';
  }

  function readIdent(text, index) {
    var cursor = index;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor = readEscape(text, cursor).end;
      } else if (isNameCode(text.charCodeAt(cursor))) {
        cursor += 1;
      } else {
        break;
      }
    }
    return cursor;
  }

  /* [name op value flag] → { name, op, value (unescaped), quote, flag, end,
   * valueStart, valueEnd } or null. */
  function readAttribute(text, index) {
    var cursor = index + 1;
    while (isWs(text[cursor])) {
      cursor += 1;
    }
    var nameStart = cursor;
    if (text[cursor] === "*" || text[cursor] === "|") {
      cursor += 1;
    }
    cursor = readIdent(text, cursor);
    if (text[cursor] === "|" && text[cursor + 1] !== "=") {
      cursor = readIdent(text, cursor + 1);
    }
    if (cursor === nameStart) {
      return null;
    }
    var name = unescapeIdent(text.slice(nameStart, cursor));
    while (isWs(text[cursor])) {
      cursor += 1;
    }
    var attribute = { name: name, op: null, value: null, quote: null, flag: null, start: index, valueStart: -1, valueEnd: -1, end: -1 };
    if (text[cursor] === "]") {
      attribute.end = cursor + 1;
      return attribute;
    }
    var op = /^([~|^$*]?=)/.exec(text.slice(cursor, cursor + 2));
    if (!op) {
      return null;
    }
    attribute.op = op[1];
    cursor += op[1].length;
    while (isWs(text[cursor])) {
      cursor += 1;
    }
    attribute.valueStart = cursor;
    if (text[cursor] === '"' || text[cursor] === "'") {
      attribute.quote = text[cursor];
      var string = readStringValue(text, cursor);
      attribute.value = string.value;
      cursor = string.end;
    } else {
      var identEnd = readIdent(text, cursor);
      if (identEnd === cursor) {
        return null;
      }
      attribute.value = unescapeIdent(text.slice(cursor, identEnd));
      cursor = identEnd;
    }
    attribute.valueEnd = cursor;
    while (isWs(text[cursor])) {
      cursor += 1;
    }
    if (/[a-zA-Z]/.test(text[cursor] || "")) {
      var flagEnd = readIdent(text, cursor);
      attribute.flag = text.slice(cursor, flagEnd).toLowerCase();
      cursor = flagEnd;
      while (isWs(text[cursor])) {
        cursor += 1;
      }
    }
    if (text[cursor] !== "]") {
      return null;
    }
    attribute.end = cursor + 1;
    return attribute;
  }

  function canonicalAttribute(attribute) {
    return "[" + attribute.name + (attribute.op ? attribute.op + cssString(attribute.value) + (attribute.flag ? " " + attribute.flag : "") : "") + "]";
  }

  /* Canonical text for comparing selectors: comments dropped, whitespace
   * normalized, escapes decoded, attribute values uniformly quoted. Only for
   * comparison — never written back into CSS. */
  function canonicalSelector(selector) {
    var text = String(selector || "");
    var tokens = [];
    var tight = { ">": true, "+": true, "~": true, ",": true, "(": true, ")": true };
    function push(value) {
      tokens.push(value);
    }
    var index = 0;
    while (index < text.length) {
      var char = text[index];
      if (char === "/" && text[index + 1] === "*") {
        var close = text.indexOf("*/", index + 2);
        index = close < 0 ? text.length : close + 2;
        push(" ");
        continue;
      }
      if (isWs(char)) {
        push(" ");
        index += 1;
        continue;
      }
      if (char === "[") {
        var attribute = readAttribute(text, index);
        if (attribute) {
          push(canonicalAttribute(attribute));
          index = attribute.end;
          continue;
        }
      }
      if (char === '"' || char === "'") {
        var string = readStringValue(text, index);
        push(cssString(string.value));
        index = string.end;
        continue;
      }
      if (char === "\\") {
        var escape = readEscape(text, index);
        push(isNameCode(escape.char.charCodeAt(0)) ? escape.char : "\\" + escape.char);
        index = escape.end;
        continue;
      }
      push(char);
      index += 1;
    }
    var out = "";
    for (var at = 0; at < tokens.length; at += 1) {
      var token = tokens[at];
      if (token === " ") {
        var previous = out[out.length - 1];
        var next = tokens.slice(at + 1).filter(function (value) { return value !== " "; })[0];
        if (!out || previous === " " || tight[previous] || next === undefined || tight[next]) {
          continue;
        }
      }
      out += token;
    }
    return out.trim();
  }

  function sameSelector(a, b) {
    return canonicalSelector(a) === canonicalSelector(b);
  }

  /* Split on a top-level separator (outside (), [], strings and escapes). */
  function splitTopLevel(value, separator) {
    var parts = [];
    var depth = 0;
    var start = 0;
    var text = String(value);
    for (var index = 0; index < text.length; index += 1) {
      var char = text[index];
      if (char === "\\") {
        index += 1;
      } else if (char === '"' || char === "'") {
        index = scanString(null, text, index, text.length).end - 1;
      } else if (char === "(" || char === "[") {
        depth += 1;
      } else if (char === ")" || char === "]") {
        depth = Math.max(0, depth - 1);
      } else if (char === separator && depth === 0) {
        parts.push(text.slice(start, index));
        start = index + 1;
      }
    }
    parts.push(text.slice(start));
    return parts.map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function matchParen(value, open) {
    var depth = 0;
    for (var index = open; index < value.length; index += 1) {
      var char = value[index];
      if (char === "\\") {
        index += 1;
      } else if (char === '"' || char === "'") {
        index = scanString(null, value, index, value.length).end - 1;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return value.length - 1;
  }

  function attributeEnd(value, open) {
    for (var index = open + 1; index < value.length; index += 1) {
      var char = value[index];
      if (char === "\\") {
        index += 1;
      } else if (char === '"' || char === "'") {
        index = scanString(null, value, index, value.length).end - 1;
      } else if (char === "]") {
        return index;
      }
    }
    return value.length - 1;
  }

  function addSpecificity(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function compareSpecificity(a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  }

  function maxSpecificity(list) {
    return list.reduce(function (best, item) {
      return compareSpecificity(item, best) > 0 ? item : best;
    }, [0, 0, 0]);
  }

  function listSpecificity(value) {
    return maxSpecificity(splitTopLevel(value, ",").map(complexSpecificity));
  }

  var LEGACY_PSEUDO_ELEMENTS = { before: true, after: true, "first-line": true, "first-letter": true };

  /* Specificity of one complex selector (Selectors Level 4: :where() is zero;
   * :is()/:not()/:has() take their most specific argument; :nth-child(… of S)
   * adds S; :host()/::slotted() add their argument). */
  function complexSpecificity(selector) {
    var total = [0, 0, 0];
    var text = String(selector);
    var index = 0;
    while (index < text.length) {
      var char = text[index];
      if (char === "[") {
        total = addSpecificity(total, [0, 1, 0]);
        index = attributeEnd(text, index) + 1;
      } else if (char === '"' || char === "'") {
        index = scanString(null, text, index, text.length).end;
      } else if (char === "#") {
        total = addSpecificity(total, [1, 0, 0]);
        index = readIdent(text, index + 1);
      } else if (char === ".") {
        total = addSpecificity(total, [0, 1, 0]);
        index = readIdent(text, index + 1);
      } else if (char === ":") {
        var element = text[index + 1] === ":";
        var nameStart = index + (element ? 2 : 1);
        var nameEnd = readIdent(text, nameStart);
        var name = unescapeIdent(text.slice(nameStart, nameEnd)).toLowerCase();
        if (text[nameEnd] === "(") {
          var argsEnd = matchParen(text, nameEnd);
          var args = text.slice(nameEnd + 1, argsEnd);
          if (element) {
            total = addSpecificity(total, [0, 0, 1]);
            if (name === "slotted" || name === "cue" || name === "cue-region") {
              total = addSpecificity(total, listSpecificity(args));
            }
          } else if (name === "where") {
            total = addSpecificity(total, [0, 0, 0]);
          } else if (name === "is" || name === "not" || name === "has" || name === "matches" || name === "-webkit-any" || name === "-moz-any") {
            total = addSpecificity(total, listSpecificity(args));
          } else if (name === "nth-child" || name === "nth-last-child") {
            total = addSpecificity(total, [0, 1, 0]);
            var of = /\sof\s/i.exec(args);
            if (of) {
              total = addSpecificity(total, listSpecificity(args.slice(of.index + of[0].length)));
            }
          } else if (name === "host" || name === "host-context") {
            total = addSpecificity(addSpecificity(total, [0, 1, 0]), listSpecificity(args));
          } else {
            total = addSpecificity(total, [0, 1, 0]);
          }
          index = argsEnd + 1;
        } else {
          total = addSpecificity(total, element || LEGACY_PSEUDO_ELEMENTS[name] ? [0, 0, 1] : [0, 1, 0]);
          index = Math.max(nameEnd, index + 1);
        }
      } else if (char === "*" || char === "|" || char === "\\" || isNameCode(text.charCodeAt(index)) && !/[0-9]/.test(char)) {
        var start = index;
        var end = char === "*" ? index + 1 : readIdent(text, index);
        if (text[end] === "|" && text[end + 1] !== "=") {
          index = end + 1; // namespace prefix: the type selector follows
          continue;
        }
        if (char === "|") {
          index += 1;
          continue;
        }
        if (text.slice(start, end) !== "*" && end > start) {
          total = addSpecificity(total, [0, 0, 1]);
        }
        index = Math.max(end, index + 1);
      } else {
        index += 1;
      }
    }
    return total;
  }

  function selectorSpecificity(selectorList) {
    return listSpecificity(selectorList);
  }

  /* CSS nesting: `&` → :is(parent); relative selectors get the parent as
   * their descendant context. */
  function resolveNesting(parentSelector, childSelector) {
    return splitTopLevel(childSelector, ",").map(function (part) {
      var out = "";
      var found = false;
      for (var index = 0; index < part.length; index += 1) {
        var char = part[index];
        if (char === "\\") {
          out += part.slice(index, index + 2);
          index += 1;
        } else if (char === '"' || char === "'") {
          var end = scanString(null, part, index, part.length).end;
          out += part.slice(index, end);
          index = end - 1;
        } else if (char === "&") {
          out += ":is(" + parentSelector + ")";
          found = true;
        } else {
          out += char;
        }
      }
      return found ? out : ":is(" + parentSelector + ") " + out;
    }).join(", ");
  }

  /* The compound after the last top-level combinator: the elements a rule
   * actually styles. */
  function subjectCompound(complex) {
    var text = String(complex).trim();
    var depth = 0;
    var cut = 0;
    for (var index = 0; index < text.length; index += 1) {
      var char = text[index];
      if (char === "\\") {
        index += 1;
      } else if (char === '"' || char === "'") {
        index = scanString(null, text, index, text.length).end - 1;
      } else if (char === "(" || char === "[") {
        depth += 1;
      } else if (char === ")" || char === "]") {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && (isWs(char) || char === ">" || char === "+" || char === "~")) {
        cut = index + 1;
      }
    }
    return text.slice(cut);
  }

  /* One complex selector as its compounds, each with the combinator that
   * precedes it (null for the first; a relative selector such as the
   * argument of :has() starts with its combinator). Simple selectors:
   *   { kind: "attribute", name, op, value, flag }  name lower-cased (HTML
   *     attribute names are case-insensitive), namespace prefix dropped,
   *     value unescaped; `[a ="x"]`, `[a|=x i]` etc. all normalize here
   *   { kind: "pseudo-class" | "pseudo-element", name (lower-cased), args }
   *     args is the raw text inside the parentheses or null
   *   { kind: "type" | "class" | "id", name }, { kind: "universal" },
   *   { kind: "nesting" } (&), { kind: "invalid", text }
   * The font lint classifies rules from this instead of substrings. */
  function selectorCompounds(complex) {
    var text = cleanText(complex).trim();
    var compounds = [];
    var simples = [];
    var combinator = null;
    var pendingSpace = false;
    function flush() {
      if (simples.length) {
        compounds.push({ combinator: combinator, simples: simples });
        simples = [];
        combinator = " ";
      }
    }
    var index = 0;
    while (index < text.length) {
      var char = text[index];
      if (isWs(char)) {
        pendingSpace = true;
        index += 1;
        continue;
      }
      if (char === ">" || char === "+" || char === "~") {
        flush();
        combinator = char;
        pendingSpace = false;
        index += 1;
        continue;
      }
      if (pendingSpace) {
        flush();
        pendingSpace = false;
      }
      if (char === "[") {
        var attribute = readAttribute(text, index);
        var close = attribute ? attribute.end : attributeEnd(text, index) + 1;
        if (attribute) {
          simples.push({
            kind: "attribute",
            name: attribute.name.replace(/^[^|]*\|/, "").toLowerCase(),
            op: attribute.op,
            value: attribute.value,
            flag: attribute.flag
          });
        } else {
          simples.push({ kind: "invalid", text: text.slice(index, close) });
        }
        index = close;
      } else if (char === ":") {
        var element = text[index + 1] === ":";
        var nameStart = index + (element ? 2 : 1);
        var nameEnd = readIdent(text, nameStart);
        var name = unescapeIdent(text.slice(nameStart, nameEnd)).toLowerCase();
        var args = null;
        var next = nameEnd;
        if (text[nameEnd] === "(") {
          var argsEnd = matchParen(text, nameEnd);
          args = text.slice(nameEnd + 1, argsEnd);
          next = argsEnd + 1;
        }
        if (!name) {
          simples.push({ kind: "invalid", text: text.slice(index, Math.max(next, index + 1)) });
          next = Math.max(next, index + 1);
        } else {
          simples.push({ kind: element || LEGACY_PSEUDO_ELEMENTS[name] ? "pseudo-element" : "pseudo-class", name: name, args: args });
        }
        index = next;
      } else if (char === "." || char === "#") {
        var identEnd = readIdent(text, index + 1);
        simples.push({ kind: char === "." ? "class" : "id", name: unescapeIdent(text.slice(index + 1, identEnd)) });
        index = Math.max(identEnd, index + 1);
      } else if (char === "&") {
        simples.push({ kind: "nesting" });
        index += 1;
      } else if (char === "*" || char === "|" || char === "\\" || isNameCode(text.charCodeAt(index))) {
        var start = index;
        var end = char === "*" ? index + 1 : readIdent(text, index);
        if (text[end] === "|" && text[end + 1] !== "=") {
          end = text[end + 1] === "*" ? end + 2 : readIdent(text, end + 1); // namespace|type
        }
        var raw = text.slice(start, Math.max(end, start + 1));
        var local = raw.replace(/^[^|]*\|/, "");
        simples.push(local === "*" ? { kind: "universal" } : { kind: "type", name: unescapeIdent(local).toLowerCase() });
        index = Math.max(end, start + 1);
      } else {
        simples.push({ kind: "invalid", text: char });
        index += 1;
      }
    }
    if (simples.length) {
      compounds.push({ combinator: combinator, simples: simples });
    } else if (combinator && combinator !== " ") {
      compounds.push({ combinator: combinator, simples: [{ kind: "invalid", text: combinator }] });
    }
    return compounds;
  }

  function removePseudo(text, names) {
    var out = "";
    for (var index = 0; index < text.length; index += 1) {
      if (text[index] === ":") {
        var nameEnd = readIdent(text, index + 1);
        var name = text.slice(index + 1, nameEnd).toLowerCase();
        if (names.indexOf(name) >= 0 && text[nameEnd] === "(") {
          index = matchParen(text, nameEnd);
          continue;
        }
      }
      out += text[index];
    }
    return out;
  }

  /* Which jamo / slots a rule's subject covers: { jamo, jamoBase, pos } lists,
   * `null` for "any". Conditions inside :has()/:not() are not coverage. */
  function ruleCoverage(rule) {
    var coverage = { jamo: [], jamoBase: [], pos: [], anyJamo: false, anyPos: false };
    function add(list, value) {
      if (list.indexOf(value) < 0) {
        list.push(value);
      }
    }
    splitTopLevel(rule.effectiveSelector || rule.selector, ",").forEach(function (complex) {
      var subject = removePseudo(subjectCompound(complex), ["has", "not"]);
      var jamo = false;
      var pos = false;
      for (var index = 0; index < subject.length; index += 1) {
        if (subject[index] === "[") {
          var attribute = readAttribute(subject, index);
          if (attribute && attribute.op === "=") {
            if (attribute.name === "data-jamo") {
              add(coverage.jamo, attribute.value);
              jamo = true;
            } else if (attribute.name === "data-jamo-base") {
              add(coverage.jamoBase, attribute.value);
              jamo = true;
            } else if (attribute.name === "data-fy-pos") {
              add(coverage.pos, attribute.value);
              pos = true;
            }
          }
          if (attribute) {
            index = attribute.end - 1;
          }
        }
      }
      coverage.anyJamo = coverage.anyJamo || !jamo;
      coverage.anyPos = coverage.anyPos || !pos;
    });
    return coverage;
  }

  // ── Cascade resolution ─────────────────────────────────────────────────

  function cascadeCompare(a, b) {
    if (a.important !== b.important) {
      return a.important ? 1 : -1;
    }
    var layer = compareKeys(a.layerKey, b.layerKey);
    if (layer !== 0) {
      return a.important ? -layer : layer; // important declarations reverse layer order
    }
    var specificity = compareSpecificity(a.specificity, b.specificity);
    if (specificity !== 0) {
      return specificity;
    }
    if (a.order !== b.order) {
      return a.order < b.order ? -1 : 1;
    }
    return a.start === b.start ? 0 : (a.start < b.start ? -1 : 1);
  }

  function candidateOf(rule, declaration, specificity) {
    return {
      rule: rule,
      declaration: declaration,
      specificity: specificity,
      important: Boolean(declaration.important),
      layerKey: rule.layerKey,
      order: rule.order,
      start: declaration.start
    };
  }

  function defaultEvaluateCondition(condition) {
    try {
      if (condition.type === "media" && typeof global.matchMedia === "function") {
        return global.matchMedia(condition.text || "all").matches;
      }
      if (condition.type === "supports" && global.CSS && typeof global.CSS.supports === "function") {
        return global.CSS.supports(condition.text);
      }
    } catch (error) {
      return null;
    }
    if (condition.type === "starting-style") {
      return false;
    }
    return null;
  }

  /* Resolves --fy-* values for one node the way the cascade does: winners per
   * element (conditions, !important, layers, specificity, order) and custom
   * property inheritance from the node up through glyph/cluster wrappers to
   * the host. `options.matches(element, selector)`, `options.parentOf(el)` and
   * `options.evaluateCondition({type, text})` (true/false/null=unknown) make
   * it usable without a DOM. */
  function createResolver(doc, node, host, options) {
    var opts = options || {};
    var matches = opts.matches || function (element, selector) { return element.matches(selector); };
    var parentOf = opts.parentOf || function (element) { return element.parentElement || null; };
    var evaluate = opts.evaluateCondition || defaultEvaluateCondition;
    var chain = [];
    for (var element = node, guard = 0; element && guard < 64; guard += 1) {
      chain.push(element);
      if (element === host) {
        break;
      }
      element = parentOf(element);
    }
    if (host && chain.indexOf(host) < 0) {
      chain.push(host);
    }
    var conditionCache = {};
    var winnerCache = [];

    function conditionState(rule) {
      var state = true;
      rule.conditions.forEach(function (condition) {
        var key = condition.type + " " + condition.text;
        if (!Object.prototype.hasOwnProperty.call(conditionCache, key)) {
          var value;
          try {
            value = evaluate(condition);
          } catch (error) {
            value = null;
          }
          conditionCache[key] = value === true ? true : value === false ? false : null;
        }
        var result = conditionCache[key];
        if (result === false) {
          state = false;
        } else if (result === null && state !== false) {
          state = null;
        }
      });
      return state;
    }

    function safeMatches(target, selector) {
      try {
        return Boolean(matches(target, selector));
      } catch (error) {
        return null; // invalid selector
      }
    }

    /* Specificity of the most specific complex selector in the list that
     * matches, or null. A list with one invalid selector is dropped whole. */
    function matchingSpecificity(rule, target) {
      if (rule.invalid) {
        return null;
      }
      var selector = rule.effectiveSelector || rule.selector;
      var whole = safeMatches(target, selector);
      if (!whole) {
        return null;
      }
      var parts = splitTopLevel(selector, ",");
      if (parts.length === 1) {
        return complexSpecificity(parts[0]);
      }
      var best = null;
      parts.forEach(function (part) {
        if (safeMatches(target, part)) {
          var specificity = complexSpecificity(part);
          if (!best || compareSpecificity(specificity, best) > 0) {
            best = specificity;
          }
        }
      });
      return best;
    }

    function winnersAt(target) {
      for (var index = 0; index < winnerCache.length; index += 1) {
        if (winnerCache[index].element === target) {
          return winnerCache[index].winners;
        }
      }
      var winners = {};
      doc.rules.forEach(function (rule) {
        if (rule.invalid || !rule.declarations.length) {
          return;
        }
        var state = conditionState(rule);
        if (state === false) {
          return;
        }
        var specificity = matchingSpecificity(rule, target);
        if (!specificity) {
          return;
        }
        rule.declarations.forEach(function (declaration) {
          if (declaration.invalid) {
            return;
          }
          var candidate = candidateOf(rule, declaration, specificity);
          candidate.uncertain = state === null;
          var current = winners[declaration.name];
          if (!current || cascadeCompare(candidate, current) > 0) {
            winners[declaration.name] = candidate;
          }
        });
      });
      winnerCache.push({ element: target, winners: winners });
      return winners;
    }

    function scopeOf(target) {
      if (target === node) {
        return "node";
      }
      if (target === host) {
        return "host";
      }
      return target && target.getAttribute && target.getAttribute("part") === "glyph" ? "glyph" : "ancestor";
    }

    function describe(name, winner, target) {
      return {
        variable: name,
        value: winner.declaration.value,
        important: winner.important,
        uncertain: Boolean(winner.uncertain),
        scope: scopeOf(target),
        element: target,
        layer: winner.rule.layer,
        selector: winner.rule.selector,
        line: winner.rule.line,
        conditions: winner.rule.conditions,
        specificity: winner.specificity,
        rule: winner.rule,
        declaration: winner.declaration
      };
    }

    function lookupAt(target, name) {
      var winner = winnersAt(target)[name];
      return winner ? describe(name, winner, target) : null;
    }

    function lookup(name) {
      for (var index = 0; index < chain.length; index += 1) {
        var found = lookupAt(chain[index], name);
        if (found) {
          return found;
        }
      }
      return null;
    }

    /* The value a declaration of `name` on the host would reach the node
     * through — null when an element below the host declares it. */
    function overrideBelowHost(name) {
      for (var index = 0; index < chain.length; index += 1) {
        if (chain[index] === host) {
          return null;
        }
        var found = lookupAt(chain[index], name);
        if (found) {
          return found;
        }
      }
      return null;
    }

    var pos = node && node.getAttribute ? node.getAttribute("data-fy-pos") : null;
    var role = node && node.getAttribute ? node.getAttribute("data-fy-role") : null;

    function chainFor(property) {
      var vars = slotChain(pos).map(function (slot) { return "--fy-" + slot + "-" + property.key; });
      if (role && property.roleFallback) {
        vars.push("--fy-" + role + "-" + property.role);
      }
      if (property.fontVar) {
        vars.push(property.fontVar);
      }
      return vars;
    }

    function entry(property) {
      var definition = typeof property === "string" ? propertyDefinition(property) : property;
      var vars = chainFor(definition);
      var source = null;
      for (var index = 0; index < vars.length && !source; index += 1) {
        source = lookup(vars[index]);
      }
      var builtin = SLOT_CONTRACT[pos] ? SLOT_CONTRACT[pos].defaults[definition.key] : null;
      var offsets = definition.offset
        ? ["--fy-jamo-" + definition.offset, "--fy-ctx-" + definition.offset].map(lookup).filter(Boolean)
        : [];
      return {
        property: definition.key,
        slotVar: pos ? "--fy-" + pos + "-" + definition.key : null,
        chain: vars,
        source: source,
        builtin: builtin === undefined ? null : builtin,
        value: source ? source.value : (builtin === undefined ? null : builtin),
        offsets: offsets
      };
    }

    /* The slot value as the host alone supplies it (node overrides ignored),
     * optionally starting the chain at an ancestor slot (`from`). */
    function hostValue(property, from) {
      var definition = typeof property === "string" ? propertyDefinition(property) : property;
      var vars = chainFor(definition);
      if (from) {
        var start = vars.indexOf("--fy-" + from + "-" + definition.key);
        vars = start >= 0 ? vars.slice(start) : vars;
      }
      for (var index = 0; index < vars.length; index += 1) {
        var found = lookupAt(host, vars[index]);
        if (found) {
          return found.value;
        }
      }
      var builtin = SLOT_CONTRACT[pos] ? SLOT_CONTRACT[pos].defaults[definition.key] : null;
      return builtin === undefined ? null : builtin;
    }

    return {
      doc: doc,
      node: node,
      host: host,
      chain: chain,
      pos: pos,
      role: role,
      jamo: node && node.getAttribute ? node.getAttribute("data-jamo") : null,
      winnersAt: winnersAt,
      lookupAt: lookupAt,
      lookup: lookup,
      overrideBelowHost: overrideBelowHost,
      matchingSpecificity: matchingSpecificity,
      entry: entry,
      hostValue: hostValue,
      entries: function () { return PROPERTIES.map(entry); }
    };
  }

  /* Resolve every contract property of one jamo node: which variable
   * supplies it, from which rule/layer, and on which element (node, glyph
   * wrapper, host). */
  function resolveNode(doc, node, host, options) {
    return createResolver(doc, node, host, options).entries();
  }

  // ── Line helpers (EOL-aware) ───────────────────────────────────────────

  function lineStartOf(text, offset) {
    var index = offset;
    while (index > 0 && text[index - 1] !== "\n" && text[index - 1] !== "\r") {
      index -= 1;
    }
    return index;
  }

  /* End of the line holding `offset`, before its line break. */
  function lineEndOf(text, offset) {
    var index = offset;
    while (index < text.length && text[index] !== "\n" && text[index] !== "\r") {
      index += 1;
    }
    return index;
  }

  /* Start of the line break just before `lineStart` (so removing
   * [breakBefore, lineEnd) drops a whole line without leaving a lone \r). */
  function breakBefore(text, lineStart) {
    if (lineStart >= 2 && text[lineStart - 2] === "\r" && text[lineStart - 1] === "\n") {
      return lineStart - 2;
    }
    return lineStart > 0 ? lineStart - 1 : 0;
  }

  function indentOf(text, offset) {
    var start = lineStartOf(text, offset);
    var match = /^[ \t]*/.exec(text.slice(start, offset));
    return match ? match[0] : "";
  }

  // ── Editing ────────────────────────────────────────────────────────────

  function fontScope(font) {
    return ":where([data-fy-font=" + cssString(font) + "])";
  }

  /* A rule an edit may create declarations in: unconditional, not nested. */
  function editableRule(rule) {
    return editableSupplier(rule) && (!rule.conditions || rule.conditions.length === 0);
  }

  /* A rule whose existing declaration an edit may change: the supplier the
   * cascade picked (a conditional rule qualifies while its condition holds). */
  function editableSupplier(rule) {
    return Boolean(rule) && rule.kind === "rule" && !rule.nested && !rule.invalid;
  }

  /* Rules with `selector` in `layer` that an edit may use: unconditional,
   * not nested, valid. Prefers the last rule already declaring `name` (the
   * one the cascade uses), then one declaring a sibling of `name`, then the
   * rule carrying --fy-font-id, then the last. */
  function findRule(doc, layer, selector, name) {
    var canonical = canonicalSelector(selector);
    var candidates = doc.rules.filter(function (rule) {
      return editableRule(rule) && rule.layer === layer && canonicalSelector(rule.selector) === canonical;
    });
    if (!candidates.length) {
      return null;
    }
    function declares(rule, test) {
      return rule.declarations.some(function (declaration) { return test(declaration.name); });
    }
    var pick = function (test) {
      var found = null;
      candidates.forEach(function (rule) {
        if (declares(rule, test)) {
          found = rule;
        }
      });
      return found;
    };
    if (name) {
      var exact = pick(function (other) { return other === name; });
      if (exact) {
        return exact;
      }
      var family = name.replace(/-[a-z]+$/, "-");
      var sibling = family.length > 5 ? pick(function (other) { return other.indexOf(family) === 0; }) : null;
      if (sibling) {
        return sibling;
      }
      var host = pick(function (other) { return other === "--fy-font-id"; });
      if (host) {
        return host;
      }
    }
    return candidates[candidates.length - 1];
  }

  function lastDeclaration(rule, name) {
    var found = null;
    rule.declarations.forEach(function (declaration) {
      if (declaration.name === name) {
        found = declaration;
      }
    });
    return found;
  }

  function findLayerBlock(doc, layer) {
    var found = null;
    doc.groups.forEach(function (group) {
      if (group.atRule === "layer" && group.layer === layer && group.conditions.length === 0) {
        found = found && found.preludeStart > group.preludeStart ? found : group;
      }
    });
    return found;
  }

  /* Locate `rule` (from an earlier parse) in a fresh parse of the same text. */
  function sameRuleIn(doc, rule) {
    for (var index = 0; index < doc.rules.length; index += 1) {
      var candidate = doc.rules[index];
      if (candidate.preludeStart === rule.preludeStart && candidate.selector === rule.selector) {
        return candidate;
      }
    }
    return null;
  }

  /* Closing braces for blocks left open at EOF, so appended text lands
   * outside them (browsers close them there anyway). */
  function closeOpenBlocks(doc) {
    var closers = "";
    var items = doc.items;
    for (var guard = 0; guard < 32 && items && items.length; guard += 1) {
      var last = items[items.length - 1];
      if (!last || last.type !== "block" || last.closed !== false) {
        break;
      }
      closers += doc.eol + "}";
      items = last.children || null;
    }
    return closers;
  }

  /* Set `name: value` inside `rule` (a rule object of parse(text)): replace
   * the value of the last declaration of `name` (keeping !important and
   * trailing comments), or append the declaration in the rule's style. */
  function setRuleDeclaration(text, rule, name, value) {
    var doc = parse(text);
    var target = sameRuleIn(doc, rule);
    if (!target) {
      throw new Error("font-studio: 편집할 규칙을 원문에서 찾지 못했습니다 (L" + rule.line + ")");
    }
    var existing = lastDeclaration(target, name);
    if (existing) {
      return text.slice(0, existing.valueStart) + value + text.slice(existing.valueEnd);
    }
    return insertDeclaration(doc, target, name, value);
  }

  function insertDeclaration(doc, rule, name, value) {
    var text = doc.text;
    var eol = doc.eol;
    var declarations = rule.declarations;
    var last = declarations[declarations.length - 1] || null;
    var body = text.slice(rule.bodyStart, rule.bodyEnd);
    var closeLineStart = lineStartOf(text, rule.bodyEnd);
    var braceOnOwnLine = /[\n\r]/.test(body) && /^[ \t]*$/.test(text.slice(closeLineStart, rule.bodyEnd));
    var needsSemicolon = last && !last.terminated;
    var anchor = rule.children.length && last ? last.end : null; // before nested rules
    if (braceOnOwnLine && anchor === null) {
      var indent = last && lineStartOf(text, last.start) === last.start - indentOf(text, last.start).length
        ? indentOf(text, last.start)
        : indentOf(text, rule.preludeStart) + doc.indentUnit;
      var before = text.slice(0, breakBefore(text, closeLineStart));
      if (needsSemicolon) {
        before = before.slice(0, last.contentEnd) + ";" + before.slice(last.contentEnd);
      }
      return before + eol + indent + name + ": " + value + ";" + text.slice(breakBefore(text, closeLineStart));
    }
    if (anchor !== null) {
      var patched = needsSemicolon ? text.slice(0, last.contentEnd) + ";" + text.slice(last.contentEnd, anchor) : text.slice(0, anchor);
      var lineIndent = indentOf(text, last.start);
      var separator = /[\n\r]/.test(body) ? eol + lineIndent : " ";
      return patched + separator + name + ": " + value + ";" + text.slice(anchor);
    }
    // one-line rule, or the closing brace shares a line with content
    var trimmedEnd = rule.bodyStart + body.replace(/\s+$/, "").length;
    var head = text.slice(0, trimmedEnd);
    if (needsSemicolon && last.contentEnd <= trimmedEnd) {
      head = text.slice(0, last.contentEnd) + ";" + text.slice(last.contentEnd, trimmedEnd);
    }
    return head + " " + name + ": " + value + "; " + text.slice(rule.bodyEnd);
  }

  /* Set `name: value` in the rule (layer, selector), creating the rule — and
   * the layer block — when missing. Conditional (@media/@supports), nested
   * and invalid rules are never chosen. Returns the new CSS text. */
  function setDeclaration(text, layer, selector, name, value) {
    var doc = parse(text);
    var rule = findRule(doc, layer, selector, name);
    if (rule) {
      var existing = lastDeclaration(rule, name);
      if (existing) {
        return text.slice(0, existing.valueStart) + value + text.slice(existing.valueEnd);
      }
      return insertDeclaration(doc, rule, name, value);
    }
    return insertRule(doc, layer, selector, name, value);
  }

  function insertRule(doc, layer, selector, name, value) {
    var text = doc.text;
    var eol = doc.eol;
    var unit = doc.indentUnit;
    var block = findLayerBlock(doc, layer);
    if (block) {
      var body = text.slice(block.bodyStart, block.bodyEnd);
      var closeLineStart = lineStartOf(text, block.bodyEnd);
      var ownLine = /[\n\r]/.test(body) && /^[ \t]*$/.test(text.slice(closeLineStart, block.bodyEnd));
      if (ownLine || !block.closed) {
        var blockIndent = indentOf(text, block.preludeStart) + unit;
        var cut = ownLine ? breakBefore(text, closeLineStart) : block.bodyEnd;
        var head = text.slice(0, cut).replace(/\s+$/, "");
        return head + eol + blockIndent + selector + " {" + eol + blockIndent + unit + name + ": " + value + ";" + eol +
          blockIndent + "}" + (ownLine ? "" : eol) + text.slice(cut);
      }
      // compact / one-line layer block: stay inside it, on the same line
      var inner = text.slice(0, block.bodyEnd).replace(/[ \t]+$/, "");
      return inner + " " + selector + " { " + name + ": " + value + "; } " + text.slice(block.bodyEnd);
    }
    var base = text.replace(/\s+$/, "");
    if (!base) {
      base = LAYER_STATEMENT;
    }
    base += closeOpenBlocks(doc);
    return base + eol + eol + "@layer " + layer + " {" + eol + unit + selector + " {" + eol + unit + unit + name + ": " + value + ";" + eol +
      unit + "}" + eol + "}" + eol;
  }

  /* Remove every declaration of `name` from `rule` (a rule of parse(text));
   * drops the rule when nothing but whitespace and comments would remain. */
  function removeRuleDeclaration(text, rule, name) {
    var doc = parse(text);
    var target = sameRuleIn(doc, rule);
    if (!target) {
      return text;
    }
    return removeFrom(doc, target, name);
  }

  function removeFrom(doc, rule, name) {
    var text = doc.text;
    var targets = rule.declarations.filter(function (declaration) { return declaration.name === name; });
    if (!targets.length) {
      return text;
    }
    var others = rule.declarations.filter(function (declaration) { return declaration.name !== name; });
    if (!others.length && !rule.children.length) {
      var ruleLineStart = lineStartOf(text, rule.preludeStart);
      var alone = /^[ \t]*$/.test(text.slice(ruleLineStart, rule.preludeStart)) &&
        /^[ \t]*$/.test(text.slice(rule.end, lineEndOf(text, rule.end)));
      if (alone && ruleLineStart > 0) {
        return text.slice(0, breakBefore(text, ruleLineStart)) + text.slice(lineEndOf(text, rule.end));
      }
      var after = rule.end;
      while (text[after] === " ") {
        after += 1;
      }
      return text.slice(0, rule.preludeStart) + text.slice(after);
    }
    var out = text;
    targets.slice().reverse().forEach(function (declaration) {
      out = removeDeclarationText(out, declaration);
    });
    return out;
  }

  function removeDeclarationText(text, declaration) {
    var lineStart = lineStartOf(text, declaration.start);
    var lineEnd = lineEndOf(text, declaration.end);
    var alone = /^[ \t]*$/.test(text.slice(lineStart, declaration.start)) &&
      /^\s*(\/\*[\s\S]*?\*\/\s*)?$/.test(text.slice(declaration.end, lineEnd));
    if (alone && lineStart > 0) {
      return text.slice(0, breakBefore(text, lineStart)) + text.slice(lineEnd);
    }
    var end = declaration.end;
    while (text[end] === " ") {
      end += 1;
    }
    return text.slice(0, declaration.start) + text.slice(end);
  }

  /* Remove `name` from the rule (layer, selector). */
  function removeDeclaration(text, layer, selector, name) {
    var doc = parse(text);
    var rule = findRule(doc, layer, selector, name);
    if (!rule) {
      return text;
    }
    return removeFrom(doc, rule, name);
  }

  /* Apply an editTarget() result: `value` "" removes the declaration. */
  function applyTarget(text, target, value) {
    if (!target) {
      return text;
    }
    if (target.rule) {
      return value === ""
        ? removeRuleDeclaration(text, target.rule, target.variable)
        : setRuleDeclaration(text, target.rule, target.variable, value);
    }
    return value === ""
      ? removeDeclaration(text, target.layer, target.selector, target.variable)
      : setDeclaration(text, target.layer, target.selector, target.variable, value);
  }

  // ── Font identity ──────────────────────────────────────────────────────

  function unquote(value) {
    var text = String(value || "").trim();
    if ((text[0] === '"' || text[0] === "'") && text.length >= 2) {
      return readStringValue(text, 0).value;
    }
    return unescapeIdent(text);
  }

  function isIdent(value) {
    return /^-?[A-Za-z_\u0080-￿][\w\u0080-￿-]*$/.test(value);
  }

  /* Rename the font everywhere it identifies itself: every [data-fy-font]
   * (and host [font]) attribute selector in any quoting form, and
   * --fy-font-id in any quoting form. Quote style is preserved. */
  /* Font names are trimmed and ASCII-case-insensitive: the runtime stamps
   * the lowercase name in data-fy-font (font-kku.js foldFontName), so a scope
   * or --fy-font-id with capitals would never match. Every name the Studio
   * writes goes through this. */
  function normalizeFontName(value) {
    return String(value == null ? "" : value).trim().replace(/[A-Z]+/g, function (letters) {
      return letters.toLowerCase();
    });
  }

  function renameFont(text, from, to) {
    to = normalizeFontName(to);
    var doc = parse(text);
    var edits = [];
    doc.rules.forEach(function (rule) {
      var prelude = text.slice(rule.preludeStart, rule.preludeEnd);
      for (var index = 0; index < prelude.length; index += 1) {
        var char = prelude[index];
        if (char === "/" && prelude[index + 1] === "*") {
          var close = prelude.indexOf("*/", index + 2);
          index = close < 0 ? prelude.length : close + 1;
          continue;
        }
        if (char !== "[") {
          continue;
        }
        var attribute = readAttribute(prelude, index);
        if (!attribute) {
          continue;
        }
        var attributeName = attribute.name.toLowerCase();
        if ((attributeName === "data-fy-font" || attributeName === "font") && attribute.op === "=" && attribute.value === from) {
          var replacement = attribute.quote ? attribute.quote + String(to).replace(new RegExp("[\\\\" + attribute.quote + "]", "g"), "\\$&") + attribute.quote
            : isIdent(to) ? to : cssString(to);
          edits.push({ start: rule.preludeStart + attribute.valueStart, end: rule.preludeStart + attribute.valueEnd, text: replacement });
        }
        index = attribute.end - 1;
      }
      rule.declarations.forEach(function (declaration) {
        if (declaration.name === "--fy-font-id" && unquote(declaration.value) === from) {
          var quote = declaration.value.trim()[0];
          var next = quote === '"' || quote === "'" ? quote + to + quote : to;
          edits.push({ start: declaration.valueStart, end: declaration.valueEnd, text: next });
        }
      });
    });
    edits.sort(function (a, b) { return b.start - a.start; });
    var out = text;
    var lastStart = Infinity;
    edits.forEach(function (edit) {
      if (edit.end <= lastStart) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
        lastStart = edit.start;
      }
    });
    return out;
  }

  function readMetadata(text) {
    var doc = typeof text === "string" ? parse(text) : text;
    var meta = {};
    doc.rules.forEach(function (rule) {
      if (rule.invalid) {
        return;
      }
      rule.declarations.forEach(function (declaration) {
        if (/^--fy-(font-id|contract|material|expression-mode)$/.test(declaration.name)) {
          meta[declaration.name.slice(5)] = declaration.name === "--fy-font-id" ? unquote(declaration.value) : declaration.value.trim();
        }
      });
    });
    return meta;
  }

  /* Font ids named by [data-fy-font=…] scope selectors, in document order. */
  function scopeFontIds(text) {
    var doc = typeof text === "string" ? parse(text) : text;
    var ids = [];
    doc.rules.forEach(function (rule) {
      var selector = rule.selector;
      for (var index = 0; index < selector.length; index += 1) {
        if (selector[index] === "[") {
          var attribute = readAttribute(selector, index);
          if (attribute) {
            if (attribute.name === "data-fy-font" && attribute.op === "=" && ids.indexOf(attribute.value) < 0) {
              ids.push(attribute.value);
            }
            index = attribute.end - 1;
          }
        }
      }
    });
    return ids;
  }

  // ── Scope targets ──────────────────────────────────────────────────────

  function describeCoverage(coverage) {
    var parts = [];
    if (coverage.jamo.length || coverage.jamoBase.length) {
      parts.push(coverage.jamo.concat(coverage.jamoBase.map(function (base) { return "base " + base; })).join(", "));
    } else if (coverage.anyJamo) {
      parts.push("모든 자모");
    }
    if (coverage.pos.length && !coverage.anyPos) {
      parts.push("slot " + coverage.pos.join(", "));
    }
    return parts.join(" × ");
  }

  /* Does `rule` cover more nodes than the scope means? */
  function sharedCoverage(rule, scope, info) {
    var coverage = ruleCoverage(rule);
    var otherJamo = coverage.anyJamo || coverage.jamoBase.length > 0 ||
      coverage.jamo.some(function (jamo) { return jamo !== info.jamo; });
    var otherPos = coverage.anyPos || coverage.pos.some(function (pos) { return pos !== info.pos; });
    var shared = scope === "slotJamo" ? otherJamo || otherPos : otherJamo;
    return shared ? { coverage: coverage, text: describeCoverage(coverage) } : null;
  }

  function editOf(source, variable, extra) {
    var target = {
      layer: source.layer,
      selector: source.selector,
      variable: variable,
      rule: source.rule,
      existing: source.rule.declarations.filter(function (declaration) { return declaration.name === variable; }).pop() || null,
      mode: "edit",
      baseValue: source.value,
      currentValue: source.value,
      shared: null,
      blocked: null,
      escalation: null,
      note: null
    };
    Object.keys(extra || {}).forEach(function (key) { target[key] = extra[key]; });
    return target;
  }

  function layerKeyByName(doc, layer) {
    var node = doc.layers.find(layer);
    if (node) {
      return layerKeyOf(node);
    }
    return [doc.layers.root.count, Infinity]; // appended after every declared layer
  }

  /* Would a new (or existing) normal declaration in `rule`/`selector` on the
   * node beat `supplier`? */
  function candidateBeats(doc, layer, selector, rule, supplier) {
    if (!supplier || supplier.scope !== "node") {
      return true; // a declaration on the node beats inherited values
    }
    var candidate = {
      important: false,
      layerKey: rule ? rule.layerKey : layerKeyByName(doc, layer),
      specificity: rule ? rule.specificity : selectorSpecificity(selector),
      order: rule ? rule.order : Infinity,
      start: Infinity
    };
    return cascadeCompare(candidate, {
      important: supplier.important,
      layerKey: supplier.rule.layerKey,
      specificity: supplier.specificity,
      order: supplier.rule.order,
      start: supplier.declaration.start
    }) > 0;
  }

  function blockedBy(doc, target, supplier, variable, reason) {
    target.blocked = { by: supplier, reason: reason };
    target.escalation = editableSupplier(supplier.rule) ? editOf(supplier, variable, { escalated: true }) : null;
    return target;
  }

  /* Node-level targets (slotJamo, jamo, context): the node's own value of
   * `variable` is replaced, so the edit starts from what the node sees now. */
  function nodeTarget(doc, spec) {
    var supplier = spec.supplier;
    var base = supplier ? supplier.value : spec.fallbackBase;
    var target = {
      layer: spec.layer,
      selector: spec.selector,
      variable: spec.variable,
      rule: null,
      existing: null,
      mode: "create",
      baseValue: base,
      currentValue: base,
      shared: null,
      blocked: null,
      escalation: null,
      note: null
    };
    var own = findRule(doc, spec.layer, spec.selector, spec.variable);
    function useRule(rule) {
      target.rule = rule;
      target.layer = rule.layer;
      target.selector = rule.selector;
      target.existing = lastDeclaration(rule, spec.variable);
      target.mode = target.existing ? "edit" : "create";
      return target;
    }
    if (supplier && supplier.scope === "node") {
      if (own && supplier.rule === own) {
        return useRule(own);
      }
      if (supplier.important) {
        return blockedBy(doc, target, supplier, spec.variable, "important");
      }
      if (!supplier.rule || supplier.rule.nested || supplier.uncertain) {
        return blockedBy(doc, target, supplier, spec.variable, supplier.rule && supplier.rule.nested ? "nested" : "uncertain");
      }
      var layerOrder = compareKeys(supplier.rule.layerKey, layerKeyByName(doc, spec.layer));
      if (layerOrder > 0) {
        return blockedBy(doc, target, supplier, spec.variable, "higher-layer");
      }
      if (layerOrder === 0 && !spec.createOnly) {
        var shared = sharedCoverage(supplier.rule, spec.scope, spec.info);
        if (!shared || spec.policy !== "split") {
          return editOf(supplier, spec.variable, { shared: shared });
        }
        target.shared = shared;
        target.mode = "split";
      }
      // create (or split) a rule at the scope's level — only if it wins
      if (candidateBeats(doc, spec.layer, spec.selector, own, supplier)) {
        if (own) {
          useRule(own);
        }
        target.mode = target.mode === "edit" ? "edit" : (layerOrder === 0 ? "split" : "create");
        return target;
      }
      if (spec.narrow && candidateBeats(doc, spec.layer, spec.narrow, findRule(doc, spec.layer, spec.narrow, spec.variable), supplier)) {
        var narrowRule = findRule(doc, spec.layer, spec.narrow, spec.variable);
        target.selector = spec.narrow;
        target.note = "공유 규칙보다 구체적이어야 해서 이 slot의 이 자모로 좁혀 분리합니다";
        if (narrowRule) {
          useRule(narrowRule);
        }
        target.mode = target.existing ? "edit" : "split";
        return target;
      }
      return blockedBy(doc, target, supplier, spec.variable, "specificity");
    }
    if (own) {
      useRule(own);
    }
    return target;
  }

  function slotTarget(doc, font, info, property, resolver) {
    var slotVar = "--fy-" + info.pos + "-" + property;
    var scopeSelector = fontScope(font);
    var hostSupplier = resolver
      ? resolver.lookupAt(resolver.host, slotVar)
      : (info.source && info.source.scope === "host" && info.source.variable === slotVar ? info.source : null);
    var base = hostSupplier ? hostSupplier.value : (resolver ? resolver.hostValue(property) : info.value);
    var target;
    if (hostSupplier && editableSupplier(hostSupplier.rule)) {
      target = editOf(hostSupplier, slotVar);
    } else {
      var rule = findRule(doc, "font-kku.font", scopeSelector, slotVar);
      target = {
        layer: rule ? rule.layer : "font-kku.font",
        selector: rule ? rule.selector : scopeSelector,
        variable: slotVar,
        rule: rule,
        existing: null,
        mode: "create",
        baseValue: base,
        currentValue: base,
        shared: null,
        blocked: null,
        escalation: null,
        note: null
      };
    }
    var override = resolver
      ? resolver.overrideBelowHost(slotVar)
      : (info.source && info.source.scope !== "host" && info.source.variable === slotVar ? info.source : null);
    if (override) {
      blockedBy(doc, target, override, slotVar, "node-override");
    } else if (resolver && !hostSupplier) {
      var current = resolver.entry(property).source;
      if (current && current.scope !== "host" && current.variable !== slotVar) {
        target.note = "노드 규칙 L" + current.line + "의 " + current.variable + "가 이 자모에 쓰이고 있어, slot 변수를 새로 선언하면 그 보정이 가려집니다";
      }
    }
    return target;
  }

  /* Family scope: the non-emitted parent slot variable (--fy-tl-top for tlo)
   * on the host. Every member slot that does not declare its own value
   * follows it; when this node's own slot variable is declared, the family
   * value cannot reach it (blocked, escalation edits that declaration). */
  function familyTarget(doc, font, info, property, resolver) {
    var family = slotFamily(info.pos);
    if (!family) {
      return null;
    }
    var familyVar = "--fy-" + family.parent + "-" + property;
    var slotVar = "--fy-" + info.pos + "-" + property;
    var scopeSelector = fontScope(font);
    var hostSupplier = resolver ? resolver.lookupAt(resolver.host, familyVar) : null;
    var base = hostSupplier ? hostSupplier.value : (resolver ? resolver.hostValue(property, family.parent) : (info.value || ""));
    if (base === null && resolver) {
      base = resolver.entry(property).value; // nothing up the family chain: start from what the node shows
    }
    var target;
    if (hostSupplier && editableSupplier(hostSupplier.rule)) {
      target = editOf(hostSupplier, familyVar);
    } else {
      var rule = findRule(doc, "font-kku.font", scopeSelector, familyVar);
      target = {
        layer: rule ? rule.layer : "font-kku.font",
        selector: rule ? rule.selector : scopeSelector,
        variable: familyVar,
        rule: rule,
        existing: null,
        mode: "create",
        baseValue: base,
        currentValue: base,
        shared: null,
        blocked: null,
        escalation: null,
        note: null
      };
    }
    target.family = family;
    var own = resolver ? resolver.lookup(slotVar) : null;
    var below = resolver ? resolver.overrideBelowHost(familyVar) : null;
    if (own) {
      blockedBy(doc, target, own, slotVar, "slot-override");
    } else if (below) {
      blockedBy(doc, target, below, familyVar, "node-override");
    }
    return target;
  }

  /* Where an edit of `property` for the selected node lands, per scope:
   *   family   — the non-emitted parent slot of this slot (tl for tlo): the
   *              host value every member follows unless it declares its own
   *   slot     — the host rule that supplies the slot value (depth-gated host
   *              rules included), else the base host rule
   *   slotJamo — this jamo in this slot: slot variable re-declared on the node
   *   jamo     — this jamo in every slot: --fy-jamo-* offset
   *   context  — this jamo in this slot when the glyph matches `context`:
   *              --fy-ctx-* offset
   * Node-level scopes edit the rule that already supplies the node's value
   * (warning when that rule is shared, e.g. :is(ᅥ, ᅧ)); with
   * options.shared === "split" they add a specific rule that is guaranteed
   * to win (same layer, higher specificity or later order) and starts from
   * the currently resolved value. A target that would lose to the supplier
   * comes back with `blocked` and an `escalation` that edits the supplier.
   *
   * `info` is { pos, jamo, resolver } (resolver from createResolver) or the
   * legacy { pos, jamo, source, value }. Returns { layer, selector,
   * variable, rule, existing, mode: "edit"|"create"|"split", baseValue,
   * currentValue, shared, blocked, escalation, note } or null when the scope
   * cannot hold the property (e.g. size has no offset form). */
  function editTarget(doc, font, info, property, scope, context, options) {
    var opts = options || {};
    var definition = propertyDefinition(property);
    if (!definition || !info || !info.pos) {
      return null;
    }
    var resolver = info.resolver || null;
    var lookup = resolver
      ? resolver.lookup
      : function (name) { return info.source && info.source.variable === name ? info.source : null; };
    var scopeSelector = fontScope(font);
    var slotVar = "--fy-" + info.pos + "-" + property;
    var nodeKey = "[data-fy-pos=" + cssString(info.pos) + "][data-jamo=" + cssString(info.jamo) + "]";
    var target = null;
    if (scope === "family") {
      target = familyTarget(doc, font, info, property, resolver);
      if (!target) {
        return null;
      }
    } else if (scope === "slot") {
      target = slotTarget(doc, font, info, property, resolver);
    } else if (scope === "slotJamo") {
      target = nodeTarget(doc, {
        scope: scope,
        info: info,
        layer: "font-kku.jamo",
        selector: scopeSelector + " " + nodeKey,
        variable: slotVar,
        supplier: lookup(slotVar),
        fallbackBase: resolver ? resolver.entry(property).value : (info.value || ""),
        policy: opts.shared
      });
    } else if (!definition.offset) {
      return null;
    } else if (scope === "jamo") {
      var jamoVar = "--fy-jamo-" + definition.offset;
      target = nodeTarget(doc, {
        scope: scope,
        info: info,
        layer: "font-kku.jamo",
        selector: scopeSelector + " [data-jamo=" + cssString(info.jamo) + "]",
        narrow: scopeSelector + " " + nodeKey,
        variable: jamoVar,
        supplier: lookup(jamoVar),
        fallbackBase: "",
        policy: opts.shared
      });
    } else if (scope === "context" && context) {
      var ctxVar = "--fy-ctx-" + definition.offset;
      target = nodeTarget(doc, {
        scope: scope,
        info: info,
        layer: "font-kku.context",
        selector: scopeSelector + ' [part="glyph"]:has(' + context + ") " + nodeKey,
        variable: ctxVar,
        supplier: lookup(ctxVar),
        fallbackBase: "",
        createOnly: true
      });
    } else {
      return null;
    }
    target.scope = scope;
    target.property = property;
    return target;
  }

  // ── Values ─────────────────────────────────────────────────────────────

  function roundNumber(value, digits) {
    var factor = Math.pow(10, digits);
    var rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  /* Parse "3%", "-0.065em", "0", "calc(-0.065em + 1%)" into unit → number. */
  function parseLengthSum(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) {
      return {};
    }
    var calc = /^calc\((.*)\)$/i.exec(text);
    var body = calc ? calc[1] : text;
    var terms = {};
    var pattern = /\s*([+-])?\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)\s*/gi;
    var consumed = 0;
    var first = true;
    var match;
    while ((match = pattern.exec(body)) !== null && match[0].length) {
      if (match.index !== consumed || (!first && !match[1]) || (first && match[1] === "+" && !calc)) {
        return null;
      }
      var number = parseFloat(match[2]) * (match[1] === "-" ? -1 : 1);
      var unit = match[3].toLowerCase();
      if (!unit && number !== 0) {
        return null;
      }
      unit = unit || "%";
      terms[unit] = (terms[unit] || 0) + number;
      consumed = pattern.lastIndex;
      first = false;
    }
    if (consumed !== body.length || first) {
      return null;
    }
    if (!calc && Object.keys(terms).length > 1) {
      return null;
    }
    return terms;
  }

  function formatLengthSum(terms) {
    var units = Object.keys(terms).filter(function (unit) { return terms[unit] !== 0; });
    if (!units.length) {
      return "0%";
    }
    units.sort(function (a, b) { return a === "%" ? 1 : b === "%" ? -1 : 0; });
    var parts = units.map(function (unit) {
      return String(roundNumber(terms[unit], unit === "%" ? 3 : 4)) + unit;
    });
    if (parts.length === 1) {
      return parts[0];
    }
    return "calc(" + parts.map(function (part, index) {
      if (index === 0) {
        return part;
      }
      return part[0] === "-" ? "- " + part.slice(1) : "+ " + part;
    }).join(" ") + ")";
  }

  /* `value` + delta (in `unit`, default %). Values in other units keep their
   * term and gain a calc() term, so shared em corrections stay exact.
   * Returns null when the value is not a sum of plain lengths. */
  function offsetAdd(value, delta, unit) {
    var terms = parseLengthSum(value);
    if (!terms) {
      return null;
    }
    var key = unit || "%";
    terms[key] = (terms[key] || 0) + delta;
    return formatLengthSum(terms);
  }

  function normalizeValue(value) {
    return cleanText(String(value == null ? "" : value)).replace(/\s*([(),])\s*/g, "$1").trim();
  }

  // ── Text helpers ───────────────────────────────────────────────────────

  /* Changed lines between two texts: common prefix/suffix, then an LCS
   * alignment of the rest; each hunk counts max(removed, added). */
  function lineDiffCount(before, after) {
    var a = String(before).split(/\r?\n/);
    var b = String(after).split(/\r?\n/);
    var start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
      start += 1;
    }
    var endA = a.length;
    var endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA -= 1;
      endB -= 1;
    }
    var n = endA - start;
    var m = endB - start;
    if (!n || !m) {
      return Math.max(n, m);
    }
    if (n * m > 4000000) {
      return Math.max(n, m);
    }
    var table = [];
    for (var i = 0; i <= n; i += 1) {
      table.push(new Uint32Array(m + 1));
    }
    for (var x = n - 1; x >= 0; x -= 1) {
      for (var y = m - 1; y >= 0; y -= 1) {
        table[x][y] = a[start + x] === b[start + y] ? table[x + 1][y + 1] + 1 : Math.max(table[x + 1][y], table[x][y + 1]);
      }
    }
    var count = 0;
    var removed = 0;
    var added = 0;
    var p = 0;
    var q = 0;
    while (p < n || q < m) {
      if (p < n && q < m && a[start + p] === b[start + q]) {
        count += Math.max(removed, added);
        removed = 0;
        added = 0;
        p += 1;
        q += 1;
      } else if (q < m && (p >= n || table[p][q + 1] >= table[p + 1][q])) {
        added += 1;
        q += 1;
      } else {
        removed += 1;
        p += 1;
      }
    }
    return count + Math.max(removed, added);
  }

  function absoluteUrl(raw, base) {
    var value = String(raw).trim();
    if (!value || /^(data|blob|about|javascript):/i.test(value) || value[0] === "#") {
      return null;
    }
    try {
      var resolved = new URL(value, base).href;
      return resolved === value ? null : resolved;
    } catch (error) {
      return null;
    }
  }

  /* Absolutize url(), image-set() strings and @import strings against
   * `base` — for the preview copy only (constructable sheets ignore
   * baseURL). Comments, other strings and everything else stay as is. */
  function rewriteUrls(text, base) {
    var source = String(text);
    var out = "";
    var cursor = 0;
    var imageSetDepth = [];
    var depth = 0;
    var afterImport = false;
    while (cursor < source.length) {
      var char = source[cursor];
      if (char === "/" && source[cursor + 1] === "*") {
        var close = source.indexOf("*/", cursor + 2);
        var end = close < 0 ? source.length : close + 2;
        out += source.slice(cursor, end);
        cursor = end;
        continue;
      }
      if (char === '"' || char === "'") {
        var string = scanString(null, source, cursor, source.length);
        var literal = source.slice(cursor, string.end);
        var inImageSet = imageSetDepth.length && imageSetDepth[imageSetDepth.length - 1] === depth;
        if ((inImageSet || afterImport) && !string.bad) {
          var absolute = absoluteUrl(readStringValue(source, cursor).value, base);
          out += absolute ? cssString(absolute) : literal;
        } else {
          out += literal;
        }
        afterImport = false;
        cursor = string.end;
        continue;
      }
      if (char === "@" && /^@import\b/i.test(source.slice(cursor, cursor + 8))) {
        afterImport = true;
        out += source.slice(cursor, cursor + 7);
        cursor += 7;
        continue;
      }
      if ((char === "u" || char === "U") && isUrlStart(source, cursor)) {
        var url = scanUrl(null, source, cursor, source.length);
        var argStart = cursor + 4;
        while (argStart < source.length && isWs(source[argStart])) {
          argStart += 1;
        }
        var rawUrl;
        var urlEnd;
        if (url) {
          urlEnd = url.end;
          rawUrl = url.bad ? null : unescapeIdent(source.slice(argStart, urlEnd - 1).trim());
        } else {
          var inner = readStringValue(source, argStart);
          var closeParen = inner.end;
          while (closeParen < source.length && isWs(source[closeParen])) {
            closeParen += 1;
          }
          if (source[closeParen] !== ")") {
            out += source.slice(cursor, argStart);
            cursor = argStart;
            continue;
          }
          urlEnd = closeParen + 1;
          rawUrl = inner.value;
        }
        var resolved = rawUrl === null ? null : absoluteUrl(rawUrl, base);
        out += resolved ? "url(" + cssString(resolved) + ")" : source.slice(cursor, urlEnd);
        afterImport = false;
        cursor = urlEnd;
        continue;
      }
      if (/[a-zA-Z-]/.test(char) && (cursor === 0 || !isNameCode(source.charCodeAt(cursor - 1)))) {
        var word = /^(-webkit-)?image-set\(/i.exec(source.slice(cursor, cursor + 20));
        if (word) {
          out += word[0];
          cursor += word[0].length;
          depth += 1;
          imageSetDepth.push(depth);
          continue;
        }
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        if (imageSetDepth.length && imageSetDepth[imageSetDepth.length - 1] === depth) {
          imageSetDepth.pop();
        }
        depth = Math.max(0, depth - 1);
      } else if (char === ";" || char === "{") {
        afterImport = false;
      }
      out += char;
      cursor += 1;
    }
    return out;
  }

  /* Undo/redo of whole CSS texts. begin()/end() fold everything recorded in
   * between (a drag) into one step; the stack keeps at most `limit` steps. */
  function createHistory(limit) {
    var max = limit || 60;
    var undo = [];
    var redo = [];
    var group = null;
    function push(text) {
      undo.push(text);
      while (undo.length > max) {
        undo.shift();
      }
      redo.length = 0;
    }
    return {
      undo: undo,
      redo: redo,
      record: function (before) {
        if (!group) {
          push(before);
        }
      },
      begin: function (current) {
        group = { start: current };
      },
      end: function (current) {
        var open = group;
        group = null;
        if (open && open.start !== current) {
          push(open.start);
          return true;
        }
        return false;
      },
      grouping: function () {
        return Boolean(group);
      },
      back: function (current) {
        if (!undo.length) {
          return null;
        }
        redo.push(current);
        return undo.pop();
      },
      forward: function (current) {
        if (!redo.length) {
          return null;
        }
        undo.push(current);
        return redo.pop();
      },
      clear: function () {
        undo.length = 0;
        redo.length = 0;
        group = null;
      }
    };
  }

  /* Source text of the given at-rules (e.g. font-face, property) — the parts
   * of a font that only work at document level. */
  function extractAtRules(text, names) {
    var doc = typeof text === "string" ? parse(text) : text;
    return doc.atRules.filter(function (block) {
      return names.indexOf(block.atRule) >= 0;
    }).map(function (block) {
      return doc.text.slice(block.preludeStart, block.end) + (block.closed === false ? "}" : "");
    }).join("\n");
  }

  var FontStudioModel = {
    LAYERS: LAYERS,
    LAYER_STATEMENT: LAYER_STATEMENT,
    SLOT_CONTRACT: SLOT_CONTRACT,
    PROPERTIES: PROPERTIES,
    slotFamily: slotFamily,
    pageOnlyVariables: pageOnlyVariables,
    // parsing
    parse: parse,
    diagnostics: diagnostics,
    // selectors
    selectorSpecificity: selectorSpecificity,
    complexSpecificity: complexSpecificity,
    canonicalSelector: canonicalSelector,
    sameSelector: sameSelector,
    splitSelectorList: function (value) { return splitTopLevel(value, ","); },
    subjectCompound: subjectCompound,
    selectorCompounds: selectorCompounds,
    ruleCoverage: ruleCoverage,
    unescapeIdent: unescapeIdent,
    cssString: cssString,
    // cascade
    createResolver: createResolver,
    resolveNode: resolveNode,
    cascadeCompare: cascadeCompare,
    compareLayerKeys: compareKeys,
    // editing
    findRule: findRule,
    setDeclaration: setDeclaration,
    removeDeclaration: removeDeclaration,
    setRuleDeclaration: setRuleDeclaration,
    removeRuleDeclaration: removeRuleDeclaration,
    applyTarget: applyTarget,
    editTarget: editTarget,
    renameFont: renameFont,
    normalizeFontName: normalizeFontName,
    readMetadata: readMetadata,
    scopeFontIds: scopeFontIds,
    fontScope: fontScope,
    // values and text
    offsetAdd: offsetAdd,
    parseLengthSum: parseLengthSum,
    normalizeValue: normalizeValue,
    lineDiffCount: lineDiffCount,
    rewriteUrls: rewriteUrls,
    extractAtRules: extractAtRules,
    createHistory: createHistory
  };

  global.FontStudioModel = FontStudioModel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioModel;
  }
})(typeof window !== "undefined" ? window : globalThis);
