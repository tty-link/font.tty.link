/* font-kku-ime — 영문 자판으로 한글을 조합하는 입력기 (ADR-012).
 *
 * 기기에 한글 입력기(OS IME)가 없을 때, 영문(QWERTY) 자판의 키 입력을 두벌식·세벌식
 * 배열대로 받아 유니코드 한글 음절을 직접 조합한다. 폰꾸 런타임(font-kku.js)과는
 * 독립이라 따로 불러 쓴다 — 조합한 글은 보통 문자열이고, 그리기는 폰꾸가 맡는다.
 *
 * 두 층으로 나뉜다.
 *   순수 함수   createComposer(layout) · convert(keys, layout) · keyMap(layout) ·
 *               lookup(layout, key) — DOM 없이 Node에서도 돈다
 *   DOM 연결    attach(field, options) — <input>·<textarea>의 keydown을 가로채
 *               조합 중인 글자를 필드 값에 직접 써 넣는다. 초점이 있으면
 *               document.execCommand("insertText")로 써서 Cmd/Ctrl+Z로 되돌릴 수 있다
 *
 * 배열은 물리 키 위치(QWERTY) 기준이다. 키 → 자모 표는 libhangul
 * (hangul/hangulkeyboard.h의 hangul_keyboard_table_2 / _390 / _3final, LGPL-2.1)과
 * 같은 값을 가진다 — 표는 사실 정보라 값만 옮겨 적었고 코드는 가져오지 않았다.
 * 조합 규칙:
 *   두벌식 표준(KS X 5002)  같은 자음을 두 번 쳐도 된소리가 되지 않는다(Shift로만).
 *                           받침 뒤에 모음이 오면 받침(겹받침이면 뒤 자음)이 다음
 *                           음절의 초성으로 넘어간다: 갑+ㅏ → 가바, 값+ㅏ → 갑사
 *   세벌식 390 · 최종       초성·중성·종성 키가 따로라 넘김이 없다. 같은 초성 두 번은
 *                           된소리(ㄱㄱ → ㄲ), 같은 종성 ㄱㄱ·ㅅㅅ은 ㄲ·ㅆ 받침
 *   공통                    합자 모음 7종(ㅘㅙㅚㅝㅞㅟㅢ), 겹받침 11종. Backspace는 조합
 *                           중인 음절을 친 순서의 역순으로 자모 하나씩 지운다
 * 지원하지 않는 것: 세벌식 모아치기(순서 무관 입력), 초성끼리 겹받침 만들기(ㄱ+ㅅ → ㄳ
 * 단독), 옛한글. */
(function (global) {
  "use strict";

  var SYLLABLE_BASE = 0xac00;
  var CHO_BASE = 0x1100;
  var JUNG_BASE = 0x1161;
  var JONG_BASE = 0x11a7;

  /* 호환 자모(U+3131~) — 조합 중인 낱자와 자판 표시에 쓴다. */
  var CHO_COMPAT = [
    0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145,
    0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e
  ];
  var JUNG_COMPAT_BASE = 0x314f;
  var JONG_COMPAT = [
    0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139, 0x313a,
    0x313b, 0x313c, 0x313d, 0x313e, 0x313f, 0x3140, 0x3141, 0x3142, 0x3144, 0x3145,
    0x3146, 0x3147, 0x3148, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e
  ];
  /* 초성 번호 → 종성 번호. 0은 받침이 될 수 없는 자음(ㄸ ㅃ ㅉ). */
  var CHO_TO_JONG = [1, 2, 4, 7, 0, 8, 16, 17, 0, 19, 20, 21, 22, 0, 23, 24, 25, 26, 27];
  var JONG_TO_CHO = (function () {
    var table = [];
    CHO_TO_JONG.forEach(function (jong, cho) {
      if (jong) {
        table[jong] = cho;
      }
    });
    return table;
  })();
  /* [앞, 뒤, 결과] — 번호는 각 자리의 표 번호(초성 0~18, 중성 0~20, 종성 1~27). */
  var JUNG_COMPOUNDS = [[8, 0, 9], [8, 1, 10], [8, 20, 11], [13, 4, 14], [13, 5, 15], [13, 20, 16], [18, 20, 19]];
  var JONG_CLUSTERS = [
    [1, 19, 3], [4, 22, 5], [4, 27, 6], [8, 1, 9], [8, 16, 10], [8, 17, 11],
    [8, 19, 12], [8, 25, 13], [8, 26, 14], [8, 27, 15], [17, 19, 18]
  ];
  var SEBEOL_JONG_DOUBLES = [[1, 1, 2], [19, 19, 20]];
  var SEBEOL_CHO_DOUBLES = [[0, 0, 1], [3, 3, 4], [7, 7, 8], [9, 9, 10], [12, 12, 13]];

  /* 키 → 값. 값은 첫가끝 자모(초성 U+1100~, 중성 U+1161~, 종성 U+11A8~) 또는 기호이고,
   * 표에 없는 키는 자기 글자 그대로다. 두벌식 자음은 초성 코드로 적는다(받침 여부는
   * 조합기가 정한다). 출처: libhangul hangulkeyboard.h. */
  var LAYOUT_KEYS = {
    dubeol: {
      "A": 0x1106, "B": 0x1172, "C": 0x110e, "D": 0x110b, "E": 0x1104, "F": 0x1105, "G": 0x1112, "H": 0x1169,
      "I": 0x1163, "J": 0x1165, "K": 0x1161, "L": 0x1175, "M": 0x1173, "N": 0x116e, "O": 0x1164, "P": 0x1168,
      "Q": 0x1108, "R": 0x1101, "S": 0x1102, "T": 0x110a, "U": 0x1167, "V": 0x1111, "W": 0x110d, "X": 0x1110,
      "Y": 0x116d, "Z": 0x110f, "a": 0x1106, "b": 0x1172, "c": 0x110e, "d": 0x110b, "e": 0x1103, "f": 0x1105,
      "g": 0x1112, "h": 0x1169, "i": 0x1163, "j": 0x1165, "k": 0x1161, "l": 0x1175, "m": 0x1173, "n": 0x116e,
      "o": 0x1162, "p": 0x1166, "q": 0x1107, "r": 0x1100, "s": 0x1102, "t": 0x1109, "u": 0x1167, "v": 0x1111,
      "w": 0x110c, "x": 0x1110, "y": 0x116d, "z": 0x110f
    },
    "sebeol-390": {
      "!": 0x11bd, "'": 0x1110, "/": 0x1169, "0": 0x110f, "1": 0x11c2, "2": 0x11bb, "3": 0x11b8, "4": 0x116d,
      "5": 0x1172, "6": 0x1163, "7": 0x1168, "8": 0x1174, "9": 0x116e, ";": 0x1107, "<": 0x0032, ">": 0x0033,
      "A": 0x11ae, "B": 0x0021, "C": 0x11b1, "D": 0x11b0, "E": 0x11bf, "F": 0x11a9, "G": 0x002f, "H": 0x0027,
      "I": 0x0038, "J": 0x0034, "K": 0x0035, "L": 0x0036, "M": 0x0031, "N": 0x0030, "O": 0x0039, "P": 0x003e,
      "Q": 0x11c1, "R": 0x1164, "S": 0x11ad, "T": 0x003b, "U": 0x0037, "V": 0x11b6, "W": 0x11c0, "X": 0x11b9,
      "Y": 0x003c, "Z": 0x11be, "a": 0x11bc, "b": 0x116e, "c": 0x1166, "d": 0x1175, "e": 0x1167, "f": 0x1161,
      "g": 0x1173, "h": 0x1102, "i": 0x1106, "j": 0x110b, "k": 0x1100, "l": 0x110c, "m": 0x1112, "n": 0x1109,
      "o": 0x110e, "p": 0x1111, "q": 0x11ba, "r": 0x1162, "s": 0x11ab, "t": 0x1165, "u": 0x1103, "v": 0x1169,
      "w": 0x11af, "x": 0x11a8, "y": 0x1105, "z": 0x11b7
    },
    "sebeol-final": {
      "!": 0x11a9, "\"": 0x00b7, "#": 0x11bd, "$": 0x11b5, "%": 0x11b4, "&": 0x201c, "'": 0x1110, "(": 0x0027,
      ")": 0x007e, "*": 0x201d, "-": 0x0029, "/": 0x1169, "0": 0x110f, "1": 0x11c2, "2": 0x11bb, "3": 0x11b8,
      "4": 0x116d, "5": 0x1172, "6": 0x1163, "7": 0x1168, "8": 0x1174, "9": 0x116e, ":": 0x0034, ";": 0x1107,
      "<": 0x002c, "=": 0x003e, ">": 0x002e, "?": 0x0021, "@": 0x11b0, "A": 0x11ae, "B": 0x003f, "C": 0x11bf,
      "D": 0x11b2, "E": 0x11ac, "F": 0x11b1, "G": 0x1164, "H": 0x0030, "I": 0x0037, "J": 0x0031, "K": 0x0032,
      "L": 0x0033, "M": 0x0022, "N": 0x002d, "O": 0x0038, "P": 0x0039, "Q": 0x11c1, "R": 0x11b6, "S": 0x11ad,
      "T": 0x11b3, "U": 0x0036, "V": 0x11aa, "W": 0x11c0, "X": 0x11b9, "Y": 0x0035, "Z": 0x11be, "[": 0x0028,
      "\\": 0x003a, "]": 0x003c, "^": 0x003d, "_": 0x003b, "`": 0x002a, "a": 0x11bc, "b": 0x116e, "c": 0x1166,
      "d": 0x1175, "e": 0x1167, "f": 0x1161, "g": 0x1173, "h": 0x1102, "i": 0x1106, "j": 0x110b, "k": 0x1100,
      "l": 0x110c, "m": 0x1112, "n": 0x1109, "o": 0x110e, "p": 0x1111, "q": 0x11ba, "r": 0x1162, "s": 0x11ab,
      "t": 0x1165, "u": 0x1103, "v": 0x1169, "w": 0x11af, "x": 0x11a8, "y": 0x1105, "z": 0x11b7, "{": 0x0025,
      "|": 0x005c, "}": 0x002f, "~": 0x203b
    }
  };

  var LAYOUTS = {
    dubeol: { id: "dubeol", kind: "dubeol", name: "두벌식 표준", nameEn: "Dubeolsik (KS X 5002)" },
    "sebeol-390": { id: "sebeol-390", kind: "sebeol", name: "세벌식 390", nameEn: "Sebeolsik 390" },
    "sebeol-final": { id: "sebeol-final", kind: "sebeol", name: "세벌식 최종", nameEn: "Sebeolsik Final (3-91)" }
  };
  var LAYOUT_ALIASES = {
    "2": "dubeol", "2set": "dubeol", "dubeolsik": "dubeol", "ks": "dubeol",
    "390": "sebeol-390", "3-90": "sebeol-390", "sebeolsik-390": "sebeol-390",
    "3final": "sebeol-final", "3-91": "sebeol-final", "final": "sebeol-final", "sebeolsik-final": "sebeol-final"
  };
  var DEFAULT_LAYOUT = "dubeol";

  /* 물리 키 행(QWERTY) — keyMap()과 KeyboardEvent.code 해석이 같이 쓴다. */
  var KEY_ROWS = [
    { plain: "`1234567890-=", shift: "~!@#$%^&*()_+" },
    { plain: "qwertyuiop[]\\", shift: "QWERTYUIOP{}|" },
    { plain: "asdfghjkl;'", shift: "ASDFGHJKL:\"" },
    { plain: "zxcvbnm,./", shift: "ZXCVBNM<>?" }
  ];
  var PUNCTUATION_CODES = {
    "`": "Backquote", "-": "Minus", "=": "Equal", "[": "BracketLeft", "]": "BracketRight",
    "\\": "Backslash", ";": "Semicolon", "'": "Quote", ",": "Comma", ".": "Period", "/": "Slash"
  };

  function codeForKey(plain) {
    if (/^[a-z]$/.test(plain)) {
      return "Key" + plain.toUpperCase();
    }
    if (/^[0-9]$/.test(plain)) {
      return "Digit" + plain;
    }
    return PUNCTUATION_CODES[plain];
  }

  var CODE_TO_KEYS = (function () {
    var table = {};
    KEY_ROWS.forEach(function (row) {
      for (var i = 0; i < row.plain.length; i += 1) {
        table[codeForKey(row.plain[i])] = [row.plain[i], row.shift[i]];
      }
    });
    return table;
  })();

  function normalizeLayout(name) {
    var key = String(name == null || name === "" ? DEFAULT_LAYOUT : name).trim().toLowerCase();
    var id = LAYOUTS[key] ? key : LAYOUT_ALIASES[key];
    if (!id) {
      throw new RangeError("font-kku-ime: unknown layout \"" + name + "\" (dubeol, sebeol-390, sebeol-final)");
    }
    return id;
  }

  /* 값 코드의 자리: { role: "cho"|"jung"|"jong", index } 또는 null(기호). */
  function classify(code) {
    if (code >= CHO_BASE && code <= 0x1112) {
      return { role: "cho", index: code - CHO_BASE };
    }
    if (code >= JUNG_BASE && code <= 0x1175) {
      return { role: "jung", index: code - JUNG_BASE };
    }
    if (code >= 0x11a8 && code <= 0x11c2) {
      return { role: "jong", index: code - JONG_BASE };
    }
    return null;
  }

  function compatOf(info) {
    if (!info) {
      return "";
    }
    if (info.role === "cho") {
      return String.fromCharCode(CHO_COMPAT[info.index]);
    }
    if (info.role === "jung") {
      return String.fromCharCode(JUNG_COMPAT_BASE + info.index);
    }
    return String.fromCharCode(JONG_COMPAT[info.index]);
  }

  function combine(table, first, second) {
    for (var i = 0; i < table.length; i += 1) {
      if (table[i][0] === first && table[i][1] === second) {
        return table[i][2];
      }
    }
    return -1;
  }

  function splitCluster(jong) {
    for (var i = 0; i < JONG_CLUSTERS.length; i += 1) {
      if (JONG_CLUSTERS[i][2] === jong) {
        return [JONG_CLUSTERS[i][0], JONG_CLUSTERS[i][1]];
      }
    }
    return null;
  }

  // ── 조합 버퍼 ────────────────────────────────────────────
  /* 조합 중인 음절 하나. keys는 이 음절을 만든 입력 값 코드의 순서 — Backspace는 마지막
   * 입력을 빼고 나머지를 다시 조합한다(자모 단위 지우기). */
  function emptyBuffer() {
    return { cho: -1, jung: -1, jong: 0, keys: [] };
  }

  function bufferText(buffer) {
    if (buffer.cho >= 0 && buffer.jung >= 0) {
      return String.fromCharCode(SYLLABLE_BASE + (buffer.cho * 21 + buffer.jung) * 28 + buffer.jong);
    }
    if (buffer.cho >= 0) {
      return String.fromCharCode(CHO_COMPAT[buffer.cho]);
    }
    if (buffer.jung >= 0) {
      return String.fromCharCode(JUNG_COMPAT_BASE + buffer.jung);
    }
    if (buffer.jong > 0) {
      return String.fromCharCode(JONG_COMPAT[buffer.jong]);
    }
    return "";
  }

  function isEmpty(buffer) {
    return buffer.cho < 0 && buffer.jung < 0 && buffer.jong === 0;
  }

  function restart(buffer, field, index, code) {
    var commit = bufferText(buffer);
    buffer.cho = -1;
    buffer.jung = -1;
    buffer.jong = 0;
    buffer.keys = [code];
    buffer[field] = index;
    return commit;
  }

  /* 두벌식: 자음 키는 초성 코드로 오고 자리는 여기서 정한다. 돌려주는 값은 확정된 글. */
  function stepDubeol(buffer, code, info) {
    var last = buffer.keys.length ? classify(buffer.keys[buffer.keys.length - 1]) : null;
    if (info.role === "cho") {
      if (buffer.cho >= 0 && buffer.jung >= 0) {
        var asJong = CHO_TO_JONG[info.index];
        if (buffer.jong === 0 && asJong) {
          buffer.jong = asJong;
          buffer.keys.push(code);
          return "";
        }
        /* 받침이 있으면 마지막 입력은 그 받침 자음이다(모음이 오면 넘김으로 끝난다).
         * 홑받침 위에서만 겹받침이 된다 — 같은 자음 두 번은 된소리가 아니다. */
        var cluster = buffer.jong && asJong ? combine(JONG_CLUSTERS, buffer.jong, asJong) : -1;
        if (cluster >= 0) {
          buffer.jong = cluster;
          buffer.keys.push(code);
          return "";
        }
      }
      return restart(buffer, "cho", info.index, code);
    }

    /* 모음 */
    if (buffer.jong > 0) {
      /* 받침 넘김: 겹받침이면 뒤 자음만, 홑받침이면 받침 전체가 다음 음절 초성이 된다. */
      var parts = splitCluster(buffer.jong);
      var moved;
      if (parts) {
        buffer.jong = parts[0];
        moved = parts[1];
      } else {
        moved = buffer.jong;
        buffer.jong = 0;
      }
      var movedKey = buffer.keys.pop();
      var commit = bufferText(buffer);
      buffer.cho = JONG_TO_CHO[moved];
      buffer.jung = info.index;
      buffer.jong = 0;
      buffer.keys = [movedKey, code];
      return commit;
    }
    if (buffer.jung >= 0) {
      var compound = last && last.role === "jung" ? combine(JUNG_COMPOUNDS, buffer.jung, info.index) : -1;
      if (compound >= 0) {
        buffer.jung = compound;
        buffer.keys.push(code);
        return "";
      }
      return restart(buffer, "jung", info.index, code);
    }
    buffer.jung = info.index;
    buffer.keys.push(code);
    return "";
  }

  /* 세벌식: 키가 자리를 정한다. 넘김이 없고, 앞 자리가 이미 지났으면 새 음절을 연다. */
  function stepSebeol(buffer, code, info) {
    if (info.role === "cho") {
      if (buffer.cho >= 0 && buffer.jung < 0 && buffer.jong === 0) {
        var doubled = combine(SEBEOL_CHO_DOUBLES, buffer.cho, info.index);
        if (doubled >= 0 && buffer.keys.length === 1) {
          buffer.cho = doubled;
          buffer.keys.push(code);
          return "";
        }
      }
      if (isEmpty(buffer)) {
        buffer.cho = info.index;
        buffer.keys.push(code);
        return "";
      }
      return restart(buffer, "cho", info.index, code);
    }

    if (info.role === "jung") {
      if (buffer.jong === 0) {
        if (buffer.jung < 0) {
          buffer.jung = info.index;
          buffer.keys.push(code);
          return "";
        }
        /* 종성이 없으면 마지막 입력은 늘 중성이다 — 홑모음 위에서만 합자가 된다 */
        var compound = combine(JUNG_COMPOUNDS, buffer.jung, info.index);
        if (compound >= 0) {
          buffer.jung = compound;
          buffer.keys.push(code);
          return "";
        }
      }
      return restart(buffer, "jung", info.index, code);
    }

    /* 종성 */
    var withSyllable = buffer.cho >= 0 && buffer.jung >= 0;
    var loneJong = buffer.cho < 0 && buffer.jung < 0 && buffer.jong > 0;
    if (withSyllable && buffer.jong === 0) {
      buffer.jong = info.index;
      buffer.keys.push(code);
      return "";
    }
    if ((withSyllable || loneJong) && buffer.jong > 0) {
      var lastJong = classify(buffer.keys[buffer.keys.length - 1]);
      var single = lastJong && lastJong.role === "jong" && lastJong.index === buffer.jong;
      var merged = single ? combine(JONG_CLUSTERS.concat(SEBEOL_JONG_DOUBLES), buffer.jong, info.index) : -1;
      if (merged >= 0) {
        buffer.jong = merged;
        buffer.keys.push(code);
        return "";
      }
    }
    if (isEmpty(buffer)) {
      buffer.jong = info.index;
      buffer.keys.push(code);
      return "";
    }
    return restart(buffer, "jong", info.index, code);
  }

  function step(kind, buffer, code) {
    var info = classify(code);
    return kind === "dubeol" ? stepDubeol(buffer, code, info) : stepSebeol(buffer, code, info);
  }

  function replay(kind, keys) {
    var buffer = emptyBuffer();
    keys.forEach(function (code) {
      step(kind, buffer, code);
    });
    return buffer;
  }

  // ── 공개: 순수 함수 ──────────────────────────────────────

  function lookupCode(layoutId, key) {
    var table = LAYOUT_KEYS[layoutId];
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
  }

  /* 키 하나가 이 배열에서 내는 값. { key, value, role, compat } — role은 cho/jung/jong
   * 또는 null(기호·그대로). 키가 한 글자가 아니면 null. */
  function lookup(layout, key) {
    var id = normalizeLayout(layout);
    if (typeof key !== "string" || key.length !== 1) {
      return null;
    }
    var code = lookupCode(id, key);
    var value = code === null ? key : String.fromCharCode(code);
    var info = code === null ? null : classify(code);
    return {
      key: key,
      value: value,
      role: info ? info.role : null,
      compat: info ? compatOf(info) : value
    };
  }

  /* 조합기 하나. key(ch)는 { commit, composing }을 돌려준다 — commit은 확정된 글,
   * composing은 아직 조합 중인 음절(없으면 ""). 배열에 없는 글자(공백·숫자·기호)는
   * 조합을 끝내고 그대로 확정한다. */
  function createComposer(layout) {
    var id = normalizeLayout(layout);
    var kind = LAYOUTS[id].kind;
    var buffer = emptyBuffer();

    function key(ch) {
      var text = String(ch == null ? "" : ch);
      var code = text.length === 1 ? lookupCode(id, text) : null;
      var info = code === null ? null : classify(code);
      if (info) {
        var commit = step(kind, buffer, code);
        return { commit: commit, composing: bufferText(buffer) };
      }
      var flushed = bufferText(buffer);
      buffer = emptyBuffer();
      return { commit: flushed + (code === null ? text : String.fromCharCode(code)), composing: "" };
    }

    function backspace() {
      if (!buffer.keys.length) {
        return { handled: false, composing: "" };
      }
      var keys = buffer.keys.slice(0, -1);
      buffer = replay(kind, keys);
      return { handled: true, composing: bufferText(buffer) };
    }

    function flush() {
      var text = bufferText(buffer);
      buffer = emptyBuffer();
      return text;
    }

    return {
      layout: id,
      key: key,
      backspace: backspace,
      flush: flush,
      peek: function () {
        return bufferText(buffer);
      },
      reset: function () {
        buffer = emptyBuffer();
      }
    };
  }

  /* 키 문자열을 한 번에 한글로 바꾼다. "\b"는 Backspace(조합 중이면 자모 하나, 아니면
   * 확정된 글자 하나를 지운다). 예: convert("dkssudgktpdy") === "안녕하세요". */
  function convert(keys, layout) {
    var composer = createComposer(layout);
    var out = [];
    Array.from(String(keys == null ? "" : keys)).forEach(function (ch) {
      if (ch === "\b") {
        if (!composer.backspace().handled) {
          out.pop();
        }
        return;
      }
      Array.prototype.push.apply(out, Array.from(composer.key(ch).commit));
    });
    return out.join("") + composer.flush();
  }

  /* 화면 자판용 표: 행마다 키 목록. 키는 { code, key, shiftKey, plain, shift } —
   * plain·shift는 lookup() 결과. */
  function keyMap(layout) {
    var id = normalizeLayout(layout);
    return KEY_ROWS.map(function (row) {
      var keys = [];
      for (var i = 0; i < row.plain.length; i += 1) {
        keys.push({
          code: codeForKey(row.plain[i]),
          key: row.plain[i],
          shiftKey: row.shift[i],
          plain: lookup(id, row.plain[i]),
          shift: lookup(id, row.shift[i])
        });
      }
      return keys;
    });
  }

  /* KeyboardEvent → QWERTY 글자. 물리 키(code) 기준이라 Caps Lock과 OS 자판 배열
   * (AZERTY 등)에 흔들리지 않는다. code가 없으면(일부 화면 키보드) key가 출력 가능한
   * ASCII 한 글자일 때만 쓴다. */
  function keyFromEvent(event) {
    if (!event) {
      return null;
    }
    if (event.code) {
      /* 숫자판(Numpad*)처럼 표에 없는 물리 키는 배열과 무관하게 그대로 둔다 */
      var pair = CODE_TO_KEYS[event.code];
      return pair ? pair[event.shiftKey ? 1 : 0] : null;
    }
    if (typeof event.key === "string" && /^[\x21-\x7e]$/.test(event.key)) {
      return event.key;
    }
    return null;
  }

  // ── 공개: DOM 연결 ───────────────────────────────────────

  var MODIFIER_KEYS = { Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1, AltGraph: 1, Fn: 1, OS: 1 };

  function isToggleEvent(event) {
    if (event.key === "HangulMode" || event.code === "Lang1" || event.key === "Lang1") {
      return true;
    }
    return (event.key === " " || event.code === "Space") && event.shiftKey &&
      !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  function dispatchInput(field, data) {
    var view = (field.ownerDocument && field.ownerDocument.defaultView) || global;
    var event = null;
    try {
      event = typeof view.InputEvent === "function"
        ? new view.InputEvent("input", { bubbles: true, inputType: "insertText", data: data })
        : null;
    } catch (error) {
      event = null;
    }
    if (!event) {
      event = new view.Event("input", { bubbles: true });
    }
    event.fontKkuIme = true;
    field.dispatchEvent(event);
  }

  /* 선택 API(selectionStart·setSelectionRange·setRangeText)를 쓰는 칸인가. email·number·date 같은
   * <input>은 setRangeText 메서드는 있어도 선택이 없어 selectionStart가 null이고(예전 브라우저는 읽기가
   * 던진다) 쓰면 InvalidStateError가 난다. */
  function selectable(field) {
    try {
      return typeof field.selectionStart === "number";
    } catch (error) {
      return false;
    }
  }

  /* <input>·<textarea> 하나에 입력기를 붙인다. options:
   *   layout     배열 id(기본 dubeol)
   *   mode       "hangul"(기본) | "latin"
   *   onChange   (state, reason) — 필드 값·조합 구간·모드가 바뀔 때마다
   * 한/영 전환은 Shift+Space, 한/영 키(HangulMode/Lang1), controller.toggleMode().
   * OS 입력기가 조합 중인 키(isComposing)는 건드리지 않는다.
   * 선택이 없는 칸(type=email·number·date …)은 TypeError로 거절한다 — 조합 구간을 바꿔 쓸 수 없다. */
  function attach(field, options) {
    if (!field || typeof field.setRangeText !== "function") {
      throw new TypeError("font-kku-ime: attach() needs an <input> or <textarea>");
    }
    if (!selectable(field)) {
      throw new TypeError("font-kku-ime: attach() needs a text field that supports selection — <input type=\"" +
        field.type + "\"> does not (use type text, search, url, tel or password, or a <textarea>)");
    }
    var opts = options || {};
    var composer = createComposer(opts.layout);
    var mode = opts.mode === "latin" ? "latin" : "hangul";
    var range = null;
    var doc = field.ownerDocument;

    /* 초점이 없는 칸의 선택 영역은 브라우저가 문서 선택을 따라 처음으로 돌려놓을 수 있다
     * (화면 키보드가 초점 없이 넣을 때, Chrome). 입력기가 마지막으로 둔 캐럿을 기억해 두고,
     * 초점이 없고 값이 그대로면 그 자리를 쓴다. */
    var caretHint = null;

    /* 초점 확인 — shadow root 안이면 document.activeElement는 바깥 host라 그 root에 묻는다 */
    function focused() {
      var root = typeof field.getRootNode === "function" ? field.getRootNode() : doc;
      return (root && root.activeElement !== undefined ? root.activeElement : doc.activeElement) === field;
    }

    /* 붙인 뒤 type이 선택 없는 값(email 등)으로 바뀌면 키를 가로채지 않고 브라우저에 넘긴다 —
     * 가로채면 쓰지 못해 친 글이 사라진다. 경고는 한 번만. */
    var warnedSelection = false;

    function editable() {
      if (field.readOnly || field.disabled) {
        return false;
      }
      if (!selectable(field)) {
        if (!warnedSelection && typeof console !== "undefined" && console.warn) {
          warnedSelection = true;
          console.warn("font-kku-ime: <input type=\"" + field.type + "\"> does not support selection; keys go to the browser untouched");
        }
        composer.reset();
        range = null;
        return false;
      }
      return true;
    }

    function remember(caret) {
      caretHint = { value: field.value, caret: caret };
    }

    function selection() {
      if (!focused() && caretHint && caretHint.value === field.value) {
        return { start: caretHint.caret, end: caretHint.caret };
      }
      return { start: field.selectionStart, end: field.selectionEnd };
    }

    function snapshot() {
      return {
        value: field.value,
        selectionStart: field.selectionStart,
        selectionEnd: field.selectionEnd,
        composing: range ? { start: range.start, end: range.end, text: field.value.slice(range.start, range.end) } : null,
        mode: mode,
        layout: composer.layout
      };
    }

    function emit(reason) {
      if (typeof opts.onChange === "function") {
        opts.onChange(snapshot(), reason);
      }
    }

    /* 조합 구간이 아직 유효한가 — 캐럿이 옮겨졌거나 값이 밖에서 바뀌었으면 조합을
     * 끝난 것으로 본다(글은 이미 필드에 들어 있다). */
    function syncRange() {
      if (!range) {
        composer.reset();
        return false;
      }
      var text = composer.peek();
      var caret = selection();
      if (!text || caret.start !== range.end || caret.end !== range.end ||
          field.value.slice(range.start, range.end) !== text) {
        composer.reset();
        range = null;
        return false;
      }
      return true;
    }

    function endComposition(reason) {
      var had = Boolean(range);
      composer.reset();
      range = null;
      if (had) {
        emit(reason || "commit");
      }
    }

    /* 바꿀 구간: 유효한 조합 구간이 있으면 그 구간, 없으면 지금 선택 영역. 조합기를
     * 움직이기 전에 정해야 한다(움직인 뒤에는 필드 글과 조합기 글이 다르다). */
    function target() {
      if (syncRange()) {
        return { start: range.start, end: range.end, composing: true };
      }
      var caret = selection();
      return { start: caret.start, end: caret.end, composing: false };
    }

    /* 입력기가 execCommand로 쓰는 중인가 — 그 사이 브라우저가 내는 beforeinput(WebKit)·input은
     * 입력기 자신의 것이라 다시 조합하지 않는다. */
    var writing = false;

    /* 필드의 [start, end)를 text로 바꾸고 캐럿을 caret에 둔다. 초점이 있으면
     * document.execCommand("insertText" | "delete")로 쓴다 — 브라우저가 되돌리기 기록에 남겨
     * Cmd/Ctrl+Z·Shift+Z가 듣는다(setRangeText는 기록을 남기지 않고 지운다). 초점이 없거나(화면
     * 키보드) 명령이 듣지 않으면(페이지가 beforeinput을 막음, 칸이 글을 거름) setRangeText로
     * 물러선다. 어느 쪽이든 input 이벤트는 한 번이다 — 명령이면 브라우저의 진짜 이벤트,
     * setRangeText면 입력기가 만든 이벤트(둘 다 event.fontKkuIme === true). */
    function replace(start, end, text, caret) {
      var before = field.value;
      var expected = before.slice(0, start) + text + before.slice(end);
      var native = false;
      if (focused() && typeof doc.execCommand === "function" && (text || start !== end)) {
        writing = true;
        try {
          field.setSelectionRange(start, end);
          native = doc.execCommand(text ? "insertText" : "delete", false, text) === true;
        } catch (error) {
          native = false;
        } finally {
          writing = false;
        }
        if (native && field.value !== expected) {
          native = false;
          if (field.value !== before) {
            /* 명령이 다른 글을 냈다 — 기대한 값으로 맞춘다(되돌리기 기록은 잃는다) */
            field.value = before;
          }
        }
      }
      if (!native) {
        field.setRangeText(text, start, end, "end");
      }
      field.setSelectionRange(caret, caret);
      remember(caret);
      if (!native) {
        dispatchInput(field, text);
      }
    }

    function write(at, commit, composing) {
      var text = commit + composing;
      var caret = at.start + text.length;
      /* 조합 구간은 쓰기 전에 정한다 — 명령이 내는 input 이벤트 안에서 state()가 새 값과 맞게 */
      range = composing ? { start: at.start + commit.length, end: caret } : null;
      replace(at.start, at.end, text, caret);
      emit("input");
    }

    /* maxlength: setRangeText는 이 속성을 보지 않는다. 넘치는 키는 버리고 조합 중이던
     * 음절은 그대로 확정한다(브라우저가 한도에서 타자를 무시하는 것과 같다). */
    function fits(at, text) {
      var max = field.maxLength;
      return !(max >= 0 && field.value.length - (at.end - at.start) + text.length > max);
    }

    function feed(ch) {
      var text = String(ch == null ? "" : ch);
      if (!text || !editable()) {
        return;
      }
      var at = target();
      if (mode !== "hangul" || text.length !== 1 || !/^[\x21-\x7e]$/.test(text)) {
        /* 조합 중인 글은 이미 필드에 있다 — 확정하고 그 뒤에 넣는다 */
        composer.reset();
        range = null;
        var place = at.composing ? { start: at.end, end: at.end } : at;
        if (fits(place, text)) {
          write(place, text, "");
        }
        return;
      }
      var result = composer.key(text);
      if (!fits(at, result.commit + result.composing)) {
        composer.reset();
        range = null;
        emit("commit");
        return;
      }
      write(at, result.commit, result.composing);
    }

    function backspace() {
      if (syncRange()) {
        var result = composer.backspace();
        var start = range.start;
        var end = range.end;
        var caret = start + result.composing.length;
        range = result.composing ? { start: start, end: caret } : null;
        replace(start, end, result.composing, caret);
        emit("input");
        return true;
      }
      return false;
    }

    function deleteBackward() {
      if (!editable()) {
        return;
      }
      if (backspace()) {
        return;
      }
      var current = selection();
      var start = current.start;
      var end = current.end;
      if (start === end) {
        if (start === 0) {
          return;
        }
        /* 서로게이트 쌍을 반으로 자르지 않는다 */
        var before = field.value.slice(0, start);
        var chars = Array.from(before);
        start = before.length - chars[chars.length - 1].length;
      }
      replace(start, end, "", start);
      emit("input");
    }

    function setMode(next) {
      var value = next === "latin" ? "latin" : "hangul";
      if (value === mode) {
        return;
      }
      endComposition("commit");
      mode = value;
      emit("mode");
    }

    /* 이 키를 keydown에서 브라우저에 넘겼는지 — 넘긴 키(숫자판·AltGr 글자)의 beforeinput은
     * 배열로 바꾸지 않는다. keyCode 229(키 정보 없는 화면 키보드)만 beforeinput이 맡는다. */
    var lastKeydown = "none";

    function onKeyDown(event) {
      lastKeydown = event.keyCode === 229 || event.key === "Unidentified" || event.key === "Process"
        ? "unidentified" : "native";
      if (event.defaultPrevented || !editable()) {
        return;
      }
      if (event.isComposing) {
        endComposition("commit");
        return;
      }
      if (event.keyCode === 229) {
        return;
      }
      if (isToggleEvent(event)) {
        event.preventDefault();
        setMode(mode === "hangul" ? "latin" : "hangul");
        return;
      }
      if (MODIFIER_KEYS[event.key]) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        endComposition("commit");
        return;
      }
      if (event.key === "Backspace") {
        if (backspace()) {
          event.preventDefault();
        }
        return;
      }
      var ch = mode === "hangul" ? keyFromEvent(event) : null;
      if (ch === null) {
        endComposition("commit");
        return;
      }
      event.preventDefault();
      feed(ch);
    }

    /* 화면 키보드 등 keydown 없이 들어온 글(모바일 insertText). */
    function onBeforeInput(event) {
      if (writing) {
        return;
      }
      var source = lastKeydown;
      lastKeydown = "none";
      if (source === "native" || !editable()) {
        return;
      }
      if (mode !== "hangul" || event.isComposing || event.inputType !== "insertText" ||
          typeof event.data !== "string" || !/^[\x21-\x7e]$/.test(event.data) || !event.cancelable) {
        return;
      }
      event.preventDefault();
      feed(event.data);
    }

    function onInput(event) {
      if (writing) {
        /* execCommand가 낸 진짜 input — 입력기가 만든 이벤트와 같은 표시를 단다 */
        event.fontKkuIme = true;
        return;
      }
      if (event.fontKkuIme) {
        return;
      }
      syncRange();
      emit("input");
    }

    function onSelect() {
      emit("select");
    }

    /* 문서의 selectionchange는 이 필드에 초점이 있을 때만 */
    function onSelectionChange() {
      if (focused()) {
        emit("select");
      }
    }

    function onPointer() {
      endComposition("commit");
    }

    function onBlur() {
      endComposition("commit");
      emit("blur");
    }

    function onFocus() {
      emit("focus");
    }

    function onComposition() {
      endComposition("commit");
    }

    var listeners = [
      [field, "keydown", onKeyDown],
      [field, "beforeinput", onBeforeInput],
      [field, "input", onInput],
      [field, "select", onSelect],
      [field, "keyup", onSelect],
      [field, "mousedown", onPointer],
      [field, "blur", onBlur],
      [field, "focus", onFocus],
      [field, "compositionstart", onComposition],
      [doc, "selectionchange", onSelectionChange]
    ];
    listeners.forEach(function (entry) {
      entry[0].addEventListener(entry[1], entry[2]);
    });

    return {
      field: field,
      getMode: function () {
        return mode;
      },
      setMode: setMode,
      toggleMode: function () {
        setMode(mode === "hangul" ? "latin" : "hangul");
        return mode;
      },
      getLayout: function () {
        return composer.layout;
      },
      setLayout: function (layout) {
        var next = createComposer(layout);
        endComposition("commit");
        composer = next;
        emit("layout");
        return composer.layout;
      },
      /* 화면 키보드: 키 하나(QWERTY 글자, " ", "\n")를 누른 것처럼 넣는다 */
      feed: feed,
      /* 화면 키보드의 ←: 조합 중이면 자모 하나, 아니면 캐럿 앞 글자 하나 */
      backspace: deleteBackward,
      commit: function () {
        endComposition("commit");
      },
      state: snapshot,
      detach: function () {
        endComposition("commit");
        listeners.forEach(function (entry) {
          entry[0].removeEventListener(entry[1], entry[2]);
        });
      }
    };
  }

  var FontKkuIme = {
    layouts: Object.freeze(Object.keys(LAYOUTS).map(function (id) {
      return Object.freeze({ id: id, kind: LAYOUTS[id].kind, name: LAYOUTS[id].name, nameEn: LAYOUTS[id].nameEn });
    })),
    defaultLayout: DEFAULT_LAYOUT,
    normalizeLayout: normalizeLayout,
    createComposer: createComposer,
    convert: convert,
    lookup: lookup,
    keyMap: keyMap,
    keyFromEvent: keyFromEvent,
    attach: attach
  };

  global.FontKkuIme = FontKkuIme;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuIme;
  }
})(typeof window !== "undefined" ? window : globalThis);
