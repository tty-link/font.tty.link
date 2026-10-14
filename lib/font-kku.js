(function (global) {
  "use strict";

  var VERSION = "0.1.3";

  /* 페이지당 런타임은 하나다. classic <script>와 ESM 진입점(이 파일을 side
   * effect로 import한다)이 함께 로드되면 두 인스턴스가 host 상태·observer·
   * stylesheet 리스너를 따로 가져 서로의 host를 모른다. custom element
   * 레지스트리처럼 먼저 로드된 쪽이 이기고, 버전이 다르면 한 번 경고한다. */
  var EXISTING_RUNTIME = global && global.FontKku;
  if (EXISTING_RUNTIME &&
      typeof EXISTING_RUNTIME.render === "function" &&
      typeof EXISTING_RUNTIME.renderText === "function" &&
      typeof EXISTING_RUNTIME.version === "string") {
    if (EXISTING_RUNTIME.version !== VERSION && typeof console !== "undefined" && console.warn) {
      console.warn("font-kku: runtime " + EXISTING_RUNTIME.version +
        " is already loaded; this copy (" + VERSION + ") reuses it");
    }
    /* 이 사본을 실은 한 줄 설치 태그가 부른 글꼴·확장·세트(data-fonts·data-addons·data-jamo-sets)는 이미 실린 런타임에
     * 넘긴다 — 그 고리가 없는 옛 런타임이면 무시된다고 알린다 */
    var laterTag = typeof document !== "undefined" ? document.currentScript : null;
    if (laterTag && typeof laterTag.getAttribute === "function" && laterTag.src &&
        (laterTag.getAttribute("data-fonts") !== null || laterTag.getAttribute("data-addons") !== null ||
          laterTag.getAttribute("data-jamo-sets") !== null)) {
      var takeTag = typeof Symbol === "function" ? EXISTING_RUNTIME[Symbol.for("font-kku.scriptTag")] : null;
      if (typeof takeTag === "function") {
        takeTag(laterTag, VERSION);
      } else if (typeof console !== "undefined" && console.warn) {
        console.warn("font-kku: runtime " + EXISTING_RUNTIME.version + " is already loaded and ignores data-fonts, " +
          "data-addons and data-jamo-sets on another font-kku.js tag — put them on the first tag");
      }
    }
    if (typeof module !== "undefined" && module.exports) {
      module.exports = EXISTING_RUNTIME;
    }
    return;
  }

  var STATE = new WeakMap();
  var GLYPH_CACHE = new Map();
  /* 캐시 키에 depth 조합이 들어가므로 조합을 섞어 쓰는 페이지에서는 실효
   * 용량이 조합 수만큼 나뉜다. LRU라 정확성에는 영향이 없고, 통상 페이지는
   * 한 조합만 쓴다 — 6조합을 동시에 섞는 극단 케이스를 위해 넉넉히 잡는다. */
  var GLYPH_CACHE_MAX = 4096;
  var MODEL_CACHE = new Map();
  var MODEL_CACHE_MAX = 64;
  /* 모델 한 개는 글자당 수백 바이트다. 긴 host를 키 입력마다 다시 그리는
   * 에디터가 64벌을 붙잡지 않도록 항목 수와 함께 총 글자 수로도 묶는다. 긴
   * 텍스트는 그대로 반복되는 일이 드물어 캐시하지 않는다. */
  var MODEL_CACHE_MAX_CHARS = 16384;
  var MODEL_CACHE_ENTRY_MAX_CHARS = 2048;
  var modelCacheChars = 0;
  var DEFAULT_FONT = "sebul";
  var DEFAULT_EXPRESSION_MODE = "sebeol";
  /* 자모 분해 깊이는 서로 독립인 두 옵션이다: 합자 모음(ㅘ ㅢ 계열)을 어떻게
   * 그릴지와 겹받침(ㄼ 계열)을 어떻게 그릴지. --fy-jamo-depth는 두 값을 한 번에
   * 정하는 shorthand이고, longhand가 선언되면 shorthand보다 우선한다. */
  var DEFAULT_VOWEL_DEPTH = "split";
  var DEFAULT_CODA_DEPTH = "split";
  var VOWEL_DEPTHS = { split: true, whole: true, syllable: true };
  var CODA_DEPTHS = { split: true, whole: true };
  var JAMO_DEPTH_SHORTHANDS = {
    atomic: { vowel: "split", coda: "split" },
    composite: { vowel: "whole", coda: "whole" },
    syllable: { vowel: "syllable", coda: "whole" }
  };
  var SUPPORTED_FONT_CONTRACT = 2;
  var CONTRACT_WARNINGS = {};
  var FONT_ALIASES = {
    "default": "sebul",
    "classic": "sebul",
    "gothic2": "gothic"
  };

  var HANGUL_BASE = 0xac00;
  var HANGUL_END = 0xd7a3;
  var HANGUL_TABLES = {
    choseong: [
      "ᄀ", "ᄁ", "ᄂ", "ᄃ", "ᄄ", "ᄅ", "ᄆ", "ᄇ", "ᄈ", "ᄉ",
      "ᄊ", "ᄋ", "ᄌ", "ᄍ", "ᄎ", "ᄏ", "ᄐ", "ᄑ", "ᄒ"
    ],
    jungseong: [
      "ᅡ", "ᅢ", "ᅣ", "ᅤ", "ᅥ", "ᅦ", "ᅧ", "ᅨ", "ᅩ", "ᅪ",
      "ᅫ", "ᅬ", "ᅭ", "ᅮ", "ᅯ", "ᅰ", "ᅱ", "ᅲ", "ᅳ", "ᅴ", "ᅵ"
    ],
    jongseong: [
      "", "ᆨ", "ᆩ", "ᆪ", "ᆫ", "ᆬ", "ᆭ", "ᆮ", "ᆯ", "ᆰ",
      "ᆱ", "ᆲ", "ᆳ", "ᆴ", "ᆵ", "ᆶ", "ᆷ", "ᆸ", "ᆹ", "ᆺ",
      "ᆻ", "ᆼ", "ᆽ", "ᆾ", "ᆿ", "ᇀ", "ᇁ", "ᇂ"
    ],
    splitJungseong: {
      "ᅪ": { parts: ["ᅩ", "ᅡ"], display: ["ᅩ", "ᅡ"], layout: "split-right" },
      "ᅫ": { parts: ["ᅩ", "ᅢ"], display: ["ᅩ", "ᅢ"], layout: "split-right" },
      "ᅬ": { parts: ["ᅩ", "ᅵ"], display: ["ᅩ", "ᅵ"], layout: "split-right" },
      "ᅯ": { parts: ["ᅮ", "ᅥ"], display: ["ᅮ", "ᅥ"], layout: "split-right" },
      "ᅰ": { parts: ["ᅮ", "ᅦ"], display: ["ᅮ", "ᅦ"], layout: "split-right" },
      "ᅱ": { parts: ["ᅮ", "ᅵ"], display: ["ᅮ", "ᅵ"], layout: "split-right" },
      "ᅴ": { parts: ["ᅳ", "ᅵ"], display: ["ᅳ", "ᅵ"], layout: "split-right" }
    },
    bottomJungseong: {
      "ᅩ": true,
      "ᅭ": true,
      "ᅮ": true,
      "ᅲ": true,
      "ᅳ": true
    },
    doubleJongseong: {
      "ᆪ": { parts: ["ᆨ", "ᆺ"], display: ["ᆨ", "ᆺ"], layout: "double" },
      "ᆬ": { parts: ["ᆫ", "ᆽ"], display: ["ᆫ", "ᆽ"], layout: "double" },
      "ᆭ": { parts: ["ᆫ", "ᇂ"], display: ["ᆫ", "ᇂ"], layout: "double" },
      "ᆰ": { parts: ["ᆯ", "ᆨ"], display: ["ᆯ", "ᆨ"], layout: "double" },
      "ᆱ": { parts: ["ᆯ", "ᆷ"], display: ["ᆯ", "ᆷ"], layout: "double" },
      "ᆲ": { parts: ["ᆯ", "ᆸ"], display: ["ᆯ", "ᆸ"], layout: "double" },
      "ᆳ": { parts: ["ᆯ", "ᆺ"], display: ["ᆯ", "ᆺ"], layout: "double" },
      "ᆴ": { parts: ["ᆯ", "ᇀ"], display: ["ᆯ", "ᇀ"], layout: "double" },
      "ᆵ": { parts: ["ᆯ", "ᇁ"], display: ["ᆯ", "ᇁ"], layout: "double" },
      "ᆶ": { parts: ["ᆯ", "ᇂ"], display: ["ᆯ", "ᇂ"], layout: "double" },
      "ᆹ": { parts: ["ᆸ", "ᆺ"], display: ["ᆸ", "ᆺ"], layout: "double" }
    }
  };
  var SPRITE_JAMO_TABLES = {
    consonant: [
      "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
      "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
    ],
    vowel: [
      "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
      "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
    ],
    // 겹받침 통짜(coda-depth: whole) 칸 — 시트 4행째(선택 확장). 종성 순서.
    codaCluster: [
      "ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ"
    ]
  };
  /* BEGIN GENERATED render-plan */
  var COMPOSED_PLACEMENT = {"split:split":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bl","br"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["blr","brd"]},"split-right:none":{"head":[],"choseong":["tls"],"jungseong":["ml","trs"],"jongseong":[]},"split-right:single":{"head":[],"choseong":["ttl"],"jungseong":["mtl","ttr"],"jongseong":["bbrs"]},"split-right:double":{"head":[],"choseong":["ttl"],"jungseong":["mtl","ttr"],"jongseong":["bbl","bbrd"]}},"split:whole":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bw"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brw"]},"split-right:none":{"head":[],"choseong":["tls"],"jungseong":["ml","trs"],"jongseong":[]},"split-right:single":{"head":[],"choseong":["ttl"],"jungseong":["mtl","ttr"],"jongseong":["bbrs"]},"split-right:double":{"head":[],"choseong":["ttl"],"jungseong":["mtl","ttr"],"jongseong":["bbw"]}},"whole:split":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bl","br"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["blr","brd"]},"split-right:none":{"head":[],"choseong":["tls"],"jungseong":["mw"],"jongseong":[]},"split-right:single":{"head":[],"choseong":["ttl"],"jungseong":["mtw"],"jongseong":["bbrs"]},"split-right:double":{"head":[],"choseong":["ttl"],"jungseong":["mtw"],"jongseong":["bbl","bbrd"]}},"whole:whole":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bw"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brw"]},"split-right:none":{"head":[],"choseong":["tls"],"jungseong":["mw"],"jongseong":[]},"split-right:single":{"head":[],"choseong":["ttl"],"jungseong":["mtw"],"jongseong":["bbrs"]},"split-right:double":{"head":[],"choseong":["ttl"],"jungseong":["mtw"],"jongseong":["bbw"]}},"syllable:split":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bl","br"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["blr","brd"]},"split-right:none":{"head":["hs"],"choseong":[],"jungseong":["trs"],"jongseong":[]},"split-right:single":{"head":["hts"],"choseong":[],"jungseong":["ttr"],"jongseong":["bbrs"]},"split-right:double":{"head":["hts"],"choseong":[],"jungseong":["ttr"],"jongseong":["bbl","bbrd"]}},"syllable:whole":{"bottom:none":{"head":[],"choseong":["t"],"jungseong":["m"],"jongseong":[]},"bottom:single":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["b"]},"bottom:double":{"head":[],"choseong":["tt"],"jungseong":["mt"],"jongseong":["bw"]},"right:none":{"head":[],"choseong":["tlo"],"jungseong":["tro"],"jongseong":[]},"right:single":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brs"]},"right:double":{"head":[],"choseong":["tlc"],"jungseong":["trc"],"jongseong":["brw"]},"split-right:none":{"head":["hs"],"choseong":[],"jungseong":["trs"],"jongseong":[]},"split-right:single":{"head":["hts"],"choseong":[],"jungseong":["ttr"],"jongseong":["bbrs"]},"split-right:double":{"head":["hts"],"choseong":[],"jungseong":["ttr"],"jongseong":["bbw"]}}};
  var RENDER_ROLES = {"head":"head","choseong":"choseong","jungMain":"jung-main","jungBase":"jung-base","jungTail":"jung-tail","jungCluster":"jung-cluster","jongMain":"jong-main","jongLeft":"jong-left","jongRight":"jong-right","jongCluster":"jong-cluster"};
  /* END GENERATED render-plan */

  /* 6조합 전부를 미리 합성해 둔다 (렌더 경로에서 합성 비용 없음). */
  var PLACEMENT_TABLES_BY_COMBO = {};
  Object.keys(VOWEL_DEPTHS).forEach(function (vowelDepth) {
    PLACEMENT_TABLES_BY_COMBO[vowelDepth] = {};
    Object.keys(CODA_DEPTHS).forEach(function (codaDepth) {
      PLACEMENT_TABLES_BY_COMBO[vowelDepth][codaDepth] =
        COMPOSED_PLACEMENT[vowelDepth + ":" + codaDepth];
    });
  });

  function createPublicPlacementTable(table) {
    var copy = {};
    Object.keys(table).forEach(function (key) {
      var entry = table[key];
      copy[key] = Object.freeze({
        head: Object.freeze((entry.head || []).slice()),
        choseong: Object.freeze(entry.choseong.slice()),
        jungseong: Object.freeze(entry.jungseong.slice()),
        jongseong: Object.freeze(entry.jongseong.slice())
      });
    });
    return Object.freeze(copy);
  }

  /* Public consumers can inspect the placement contract without receiving a
   * mutable reference to the table used by the renderer. The three named
   * presets remain the documented surface; other combos are internal. */
  var PUBLIC_PLACEMENT_TABLE = createPublicPlacementTable(
    PLACEMENT_TABLES_BY_COMBO.split.split
  );
  var PUBLIC_PLACEMENT_TABLES = Object.freeze({
    atomic: PUBLIC_PLACEMENT_TABLE,
    composite: createPublicPlacementTable(PLACEMENT_TABLES_BY_COMBO.whole.whole),
    syllable: createPublicPlacementTable(PLACEMENT_TABLES_BY_COMBO.syllable.whole)
  });

  /* Hand-written copies replace the previous JSON round-trip clone.
   * The copied shapes are fixed (glyph/model trees below), so shallow
   * object copies plus array slices are enough to keep cache entries
   * isolated from caller mutation. */

  function copyJamoTriple(triple) {
    var copy = {
      choseong: triple.choseong.slice(),
      jungseong: triple.jungseong.slice(),
      jongseong: triple.jongseong.slice()
    };
    /* `head` only exists on the display side of syllable depth, so it is copied
     * when present instead of being forced onto every triple. */
    if (triple.head) {
      copy.head = triple.head.slice();
    }
    if (triple.headBase) {
      copy.headBase = triple.headBase;
    }
    return copy;
  }

  function copyGlyph(glyph) {
    var copy = {
      type: glyph.type,
      index: glyph.index,
      source: glyph.source,
      kind: glyph.kind,
      vowelDepth: glyph.vowelDepth,
      codaDepth: glyph.codaDepth
    };

    if (glyph.sourceJamo) {
      copy.sourceJamo = {
        choseong: glyph.sourceJamo.choseong,
        jungseong: glyph.sourceJamo.jungseong,
        jongseong: glyph.sourceJamo.jongseong
      };
    }
    if (glyph.jamo) {
      copy.jamo = copyJamoTriple(glyph.jamo);
    }
    if (glyph.display) {
      copy.display = copyJamoTriple(glyph.display);
    }
    if (glyph.topology) {
      copy.topology = {
        jungLayout: glyph.topology.jungLayout,
        jongLayout: glyph.topology.jongLayout,
        placementKey: glyph.topology.placementKey,
        layoutBucket: glyph.topology.layoutBucket
      };
    }

    return copy;
  }

  function copyModel(model) {
    return {
      lines: model.lines.map(function (line) {
        return {
          type: line.type,
          index: line.index,
          children: line.children.map(function (child) {
            if (child.type === "word") {
              return {
                type: child.type,
                index: child.index,
                children: child.children.map(copyGlyph)
              };
            }
            return {
              type: child.type,
              index: child.index,
              raw: child.raw,
              count: child.count,
              kind: child.kind
            };
          })
        };
      })
    };
  }

  /* Bounded LRU access: reads refresh recency, writes evict the oldest key. */

  function cacheGet(cache, key) {
    if (!cache.has(key)) {
      return undefined;
    }
    var value = cache.get(key);
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(cache, key, value, maxSize) {
    if (cache.has(key)) {
      cache.delete(key);
    } else if (cache.size >= maxSize) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, value);
  }

  function normalizeExpressionMode(value) {
    var normalized = String(value || "").trim().toLowerCase();
    if (normalized === "general" || normalized === "gothic") {
      return "general";
    }
    return DEFAULT_EXPRESSION_MODE;
  }

  /* Jamo depth is the decomposition axis and is independent of the expression
   * mode: expression mode declares the design (sebeol vs general), depth
   * declares how many nodes a cluster jamo becomes. Neither derives the other,
   * so any font may pick any combination. */
  function normalizeKeyword(value, allowed, fallback) {
    var normalized = String(value == null ? "" : value).trim().toLowerCase();
    return allowed[normalized] ? normalized : fallback;
  }

  /* 입력은 shorthand 문자열("atomic"|"composite"|"syllable") 또는
   * {vowel, coda} 객체를 받는다. 항상 정규화된 {vowel, coda}로 통일한다. */
  function normalizeDepthOptions(depth) {
    if (depth && typeof depth === "object") {
      return {
        vowel: normalizeKeyword(depth.vowel, VOWEL_DEPTHS, DEFAULT_VOWEL_DEPTH),
        coda: normalizeKeyword(depth.coda, CODA_DEPTHS, DEFAULT_CODA_DEPTH)
      };
    }
    var shorthand = JAMO_DEPTH_SHORTHANDS[String(depth == null ? "" : depth).trim().toLowerCase()];
    return shorthand
      ? { vowel: shorthand.vowel, coda: shorthand.coda }
      : { vowel: DEFAULT_VOWEL_DEPTH, coda: DEFAULT_CODA_DEPTH };
  }

  function depthCacheKey(options) {
    return options.vowel + "/" + options.coda;
  }

  function isHangulSyllable(char) {
    var code = char && char.codePointAt ? char.codePointAt(0) : undefined;
    return code !== undefined && code >= HANGUL_BASE && code <= HANGUL_END;
  }

  function codeInRanges(code, ranges) {
    var low = 0;
    var high = ranges.length - 1;
    while (low <= high) {
      var mid = (low + high) >>> 1;
      if (code < ranges[mid][0]) { high = mid - 1; }
      else if (code > ranges[mid][1]) { low = mid + 1; }
      else { return true; }
    }
    return false;
  }

  function classifyGlyphKind(char) {
    /* Only a grapheme that is exactly one precomposed syllable decomposes. A
     * syllable followed by further code points (가+U+0301, 한+U+302E 방점,
     * 각+U+11A8) is a non-Hangul glyph that keeps the whole cluster, so the
     * trailing marks are drawn instead of surviving only in data-source.
     * Like every multi-code-point cluster it is classified "symbol". */
    if (typeof char === "string" && char.length === 1 && isHangulSyllable(char)) {
      return "hangul";
    }

    if (/^[A-Za-z]$/u.test(char)) {
      return "latin";
    }

    var code = typeof char === "string" && Array.from(char).length === 1 ? char.codePointAt(0) : -1;
    if (codeInRanges(code, GLYPH_NUMBER_RANGES)) {
      return "digit";
    }

    if (codeInRanges(code, GLYPH_PUNCTUATION_RANGES)) {
      return "punctuation";
    }

    return "symbol";
  }

  function resolveJungseong(jungseong, vowelDepth) {
    var split = HANGUL_TABLES.splitJungseong[jungseong];
    if (split) {
      if (!COMPOSED_PLACEMENT[vowelDepth + ":split"]["split-right:none"].head.length &&
          COMPOSED_PLACEMENT[vowelDepth + ":split"]["split-right:none"].jungseong.length === 1) {
        /* The layout stays split-right: the cluster vowel still occupies the
         * bottom and the right band, it is simply drawn as one glyph. */
        return {
          source: jungseong,
          parts: [jungseong],
          display: [jungseong],
          layout: split.layout
        };
      }

      /* split과 syllable 모두 base/tail 분해가 필요하다 — syllable은 display
       * 단계에서 base를 초성과 합쳐 head로 만든다. */
      return {
        source: jungseong,
        parts: split.parts.slice(),
        display: split.display.slice(),
        layout: split.layout
      };
    }

    return {
      source: jungseong,
      parts: [jungseong],
      display: [jungseong],
      layout: HANGUL_TABLES.bottomJungseong[jungseong] ? "bottom" : "right"
    };
  }

  function resolveJongseong(jongseong, codaDepth) {
    if (!jongseong) {
      return {
        source: "",
        parts: [],
        display: [],
        layout: "none"
      };
    }

    if (HANGUL_TABLES.doubleJongseong[jongseong]) {
      var pair = HANGUL_TABLES.doubleJongseong[jongseong];
      if (COMPOSED_PLACEMENT["split:" + codaDepth]["right:double"].jongseong.length === 1) {
        /* The layout stays double: the coda band still carries two consonants,
         * pre-shaped by the source font into one glyph. */
        return {
          source: jongseong,
          parts: [jongseong],
          display: [jongseong],
          layout: pair.layout
        };
      }

      return {
        source: jongseong,
        parts: pair.parts.slice(),
        display: pair.display.slice(),
        layout: pair.layout
      };
    }

    return {
      source: jongseong,
      parts: [jongseong],
      display: [jongseong],
      layout: "single"
    };
  }

  function resolveLayoutBucket(jung, jong) {
    var openness = jong.layout === "none" ? "open" : "closed";

    if (jung.layout === "right") {
      return "right-" + openness;
    }

    if (jung.layout === "bottom") {
      return "bottom-" + openness;
    }

    if (jung.layout === "split-right") {
      return "split-" + openness;
    }

    return "default";
  }

  function resolveSemanticAxis(jungLayout) {
    if (jungLayout === "split-right") {
      return "split";
    }
    return jungLayout || "default";
  }

  function resolveSemanticOpenState(jongLayout) {
    return jongLayout === "none" ? "open" : "closed";
  }

  function resolveSemanticFrame(glyph) {
    var topology = glyph && glyph.topology ? glyph.topology : {};
    return {
      axis: resolveSemanticAxis(topology.jungLayout),
      open: resolveSemanticOpenState(topology.jongLayout),
      jongCount: topology.jongLayout || "none"
    };
  }

  function applySemanticFrame(node, glyph, semanticRole) {
    if (!node) {
      return node;
    }

    var frame = resolveSemanticFrame(glyph);
    node.dataset.fyAxis = frame.axis;
    node.dataset.fyOpen = frame.open;
    node.dataset.fyJongCount = frame.jongCount;
    if (semanticRole) {
      node.dataset.fyRole = semanticRole;
    }
    return node;
  }

  function getPlacementKey(jungLayout, jongLayout) {
    return jungLayout + ":" + jongLayout;
  }

  /* split/whole render one node per (resolved) jamo. syllable folds the
   * choseong and the *base* of a split vowel into a precomposed syllable
   * ("과" → "고" + ㅏ); a syllable without a split vowel is untouched and keeps
   * its choseong node ("밟" → ㅂ + ㅏ + ㄼ). `head` lives on the display side,
   * not on the logical `jamo` triple: the source jamo are unchanged, only what
   * gets drawn differs. */
  function resolveDisplay(vowelDepth, choseongIndex, choseong, jung, jong) {
    var plan = COMPOSED_PLACEMENT[vowelDepth + ":split"][getPlacementKey(jung.layout, jong.layout)];
    if (!plan.head.length) {
      return {
        choseong: [choseong],
        jungseong: jung.display.slice(),
        jongseong: jong.display.slice()
      };
    }

    var baseJungIndex = HANGUL_TABLES.jungseong.indexOf(jung.parts[0]);
    return {
      head: [composePartialSyllable(choseongIndex, baseJungIndex)],
      /* head는 완성형이라 자모 선택자가 없다 — base 모음을 별도 표면으로 노출해
       * CSS가 ㅜ계/ㅗ계 head를 분기할 수 있게 한다 (data-jamo-base). */
      headBase: jung.parts[0],
      choseong: [],
      jungseong: jung.parts.slice(1),
      jongseong: jong.display.slice()
    };
  }

  function decomposeGlyph(char, index, depth) {
    var glyphIndex = index || 0;
    var depthOptions = normalizeDepthOptions(depth);
    /* Depth changes the decomposition, so it has to be part of the cache
     * identity — otherwise the first depth to render a syllable would pin it. */
    var cacheKey = depthCacheKey(depthOptions) + " " + char;
    var cached = cacheGet(GLYPH_CACHE, cacheKey);
    if (cached) {
      var cachedCopy = copyGlyph(cached);
      cachedCopy.index = glyphIndex;
      return cachedCopy;
    }

    var kind = classifyGlyphKind(char);
    if (kind !== "hangul") {
      var plainGlyph = {
        type: "glyph",
        index: glyphIndex,
        source: char,
        kind: kind,
        vowelDepth: depthOptions.vowel,
        codaDepth: depthOptions.coda
      };
      cacheSet(GLYPH_CACHE, cacheKey, plainGlyph, GLYPH_CACHE_MAX);
      return copyGlyph(plainGlyph);
    }

    var syllableIndex = char.charCodeAt(0) - HANGUL_BASE;
    var choseongIndex = Math.floor(syllableIndex / (21 * 28));
    var jungseongIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
    var jongseongIndex = syllableIndex % 28;

    var choseong = HANGUL_TABLES.choseong[choseongIndex];
    var jungseong = HANGUL_TABLES.jungseong[jungseongIndex];
    var jongseong = HANGUL_TABLES.jongseong[jongseongIndex];
    var jung = resolveJungseong(jungseong, depthOptions.vowel);
    var jong = resolveJongseong(jongseong, depthOptions.coda);
    var placementKey = getPlacementKey(jung.layout, jong.layout);
    var layoutBucket = resolveLayoutBucket(jung, jong);

    var glyph = {
      type: "glyph",
      index: glyphIndex,
      source: char,
      kind: kind,
      vowelDepth: depthOptions.vowel,
      codaDepth: depthOptions.coda,
      sourceJamo: {
        choseong: choseong,
        jungseong: jung.source,
        jongseong: jong.source
      },
      jamo: {
        choseong: [choseong],
        jungseong: jung.parts.slice(),
        jongseong: jong.parts.slice()
      },
      display: resolveDisplay(depthOptions.vowel, choseongIndex, choseong, jung, jong),
      topology: {
        jungLayout: jung.layout,
        jongLayout: jong.layout,
        placementKey: placementKey,
        layoutBucket: layoutBucket
      }
    };

    cacheSet(GLYPH_CACHE, cacheKey, glyph, GLYPH_CACHE_MAX);
    return copyGlyph(glyph);
  }

  function getSpaceKind(raw) {
    if (/^[ ]+$/u.test(raw)) {
      return "space";
    }
    if (/^\t+$/u.test(raw)) {
      return "tab";
    }
    if (/^\u00a0+$/u.test(raw)) {
      return "nbsp";
    }
    return "mixed";
  }

  function isInlineSpace(char) {
    return char === " " || char === "\t" || char === "\u00a0";
  }

  function createWord(chars, index, depth) {
    return {
      type: "word",
      index: index,
      children: chars.map(function (char, glyphIndex) {
        return decomposeGlyph(char, glyphIndex, depth);
      })
    };
  }

  function createSpace(raw, index) {
    return {
      type: "space",
      index: index,
      raw: raw,
      count: raw.length,
      kind: getSpaceKind(raw)
    };
  }

  var GRAPHEME_SEGMENTER = null;

  function segmentGraphemes(raw) {
    if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
      if (!GRAPHEME_SEGMENTER) {
        GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      }
      return Array.from(GRAPHEME_SEGMENTER.segment(raw), function (entry) {
        return entry.segment;
      });
    }
    return Array.from(raw);
  }

  function segmentLine(raw, index, depth) {
    var children = [];
    var wordBuffer = [];
    var spaceBuffer = "";
    var childIndex = 0;

    function flushWord() {
      if (!wordBuffer.length) {
        return;
      }
      children.push(createWord(wordBuffer, childIndex, depth));
      childIndex += 1;
      wordBuffer = [];
    }

    function flushSpace() {
      if (!spaceBuffer) {
        return;
      }
      children.push(createSpace(spaceBuffer, childIndex));
      childIndex += 1;
      spaceBuffer = "";
    }

    segmentGraphemes(raw).forEach(function (char) {
      if (isInlineSpace(char)) {
        flushWord();
        spaceBuffer += char;
      } else {
        flushSpace();
        wordBuffer.push(char);
      }
    });

    flushWord();
    flushSpace();

    return {
      type: "line",
      index: index,
      children: children
    };
  }

  function cacheModel(key, model, chars) {
    if (chars > MODEL_CACHE_ENTRY_MAX_CHARS) {
      return;
    }
    if (MODEL_CACHE.has(key)) {
      modelCacheChars -= MODEL_CACHE.get(key).chars;
      MODEL_CACHE.delete(key);
    }
    while (MODEL_CACHE.size && (MODEL_CACHE.size >= MODEL_CACHE_MAX ||
        modelCacheChars + chars > MODEL_CACHE_MAX_CHARS)) {
      var oldest = MODEL_CACHE.keys().next().value;
      modelCacheChars -= MODEL_CACHE.get(oldest).chars;
      MODEL_CACHE.delete(oldest);
    }
    MODEL_CACHE.set(key, { model: model, chars: chars });
    modelCacheChars += chars;
  }

  /* Internal: returns the (possibly cached) model itself. Render paths only
   * read it, so they skip the defensive copy that public callers get. */
  function buildTextModel(text, depth) {
    var normalized = String(text == null ? "" : text);
    if (typeof String.prototype.normalize === "function") {
      normalized = normalized.normalize("NFC");
    }
    normalized = normalized.replace(/\r\n?/gu, "\n");

    var depthOptions = normalizeDepthOptions(depth);
    var cacheKey = depthCacheKey(depthOptions) + " " + normalized;
    var cached = cacheGet(MODEL_CACHE, cacheKey);
    if (cached) {
      return cached.model;
    }

    var model = {
      lines: normalized.split("\n").map(function (line, index) {
        return segmentLine(line, index, depthOptions);
      })
    };

    cacheModel(cacheKey, model, normalized.length);
    return model;
  }

  function createTextModel(text, depth) {
    return copyModel(buildTextModel(text, depth));
  }

  /* The document the current render builds nodes in (the host's own
   * document, so hosts inside iframes get nodes of their realm). */
  var renderDocument = null;

  /* Whether the host being rendered paints jamo from a sprite sheet. Only then
   * does a standalone jamo (ㅋ, a composing ㄱ — a non-Hangul glyph) get the
   * sprite surface, so system-material DOM (and the sidecar contract,
   * spec/html-cases.json) is unchanged. */
  var renderSpriteMaterial = false;

  function createSpan(part, text) {
    var node = (renderDocument || document).createElement("span");
    node.setAttribute("part", part);
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function createClusterNode(part, glyph, role) {
    var node = createSpan("cluster " + part);
    node.dataset.jamoRole = role + "-cluster";
    if (glyph.topology) {
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    return applySemanticFrame(node, glyph, role === "jungseong" ? RENDER_ROLES.jungCluster : RENDER_ROLES.jongCluster);
  }

  function createGlyphBodyNode(glyph) {
    var node = createSpan("glyph-body");
    if (glyph.topology) {
      node.dataset.jungLayout = glyph.topology.jungLayout;
      node.dataset.jongLayout = glyph.topology.jongLayout;
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    return applySemanticFrame(node, glyph);
  }

  function resolveJamoIndex(value, role) {
    if (role === "choseong") return HANGUL_TABLES.choseong.indexOf(value);
    if (role === "jungseong") return HANGUL_TABLES.jungseong.indexOf(value);
    if (role === "jongseong") return HANGUL_TABLES.jongseong.indexOf(value);
    return -1;
  }

  function resolveSpriteJamo(value) {
    var compat = JAMO_TO_COMPAT[value] || value;
    var consonantIndex = SPRITE_JAMO_TABLES.consonant.indexOf(compat);
    if (consonantIndex >= 0) {
      return { value: compat, kind: "consonant", index: consonantIndex };
    }

    var vowelIndex = SPRITE_JAMO_TABLES.vowel.indexOf(compat);
    if (vowelIndex >= 0) {
      return { value: compat, kind: "vowel", index: vowelIndex };
    }

    var clusterIndex = SPRITE_JAMO_TABLES.codaCluster.indexOf(compat);
    if (clusterIndex >= 0) {
      return { value: compat, kind: "coda-cluster", index: clusterIndex };
    }

    return null;
  }

  function createJamoNode(part, value, role, pos, glyph, semanticRole) {
    var node = createSpan(part, value);
    node.dataset.jamo = value;
    node.dataset.jamoRole = role;
    node.dataset.fyPos = pos;
    var jamoIndex = resolveJamoIndex(value, role);
    if (jamoIndex >= 0) {
      node.dataset.jamoIndex = String(jamoIndex);
      node.style.setProperty("--fy-jamo-index", String(jamoIndex));
    }
    stampSpriteJamo(node, value);
    return applySemanticFrame(node, glyph, semanticRole);
  }

  function stampSpriteJamo(node, value) {
    var spriteJamo = resolveSpriteJamo(value);
    if (spriteJamo) {
      node.dataset.spriteJamo = spriteJamo.value;
      node.dataset.spriteJamoKind = spriteJamo.kind;
      node.dataset.spriteJamoIndex = String(spriteJamo.index);
      node.style.setProperty("--fy-sprite-jamo-index", String(spriteJamo.index));
    }
    return spriteJamo;
  }

  function renderHangulGlyph(glyph, glyphIndex) {
    var node = createSpan("glyph");
    var body = createGlyphBodyNode(glyph);
    var placements = resolvePlacementPlan(glyph);
    node.dataset.glyphKind = glyph.kind;
    node.dataset.hangul = "true";
    node.dataset.glyphIndex = String(glyphIndex);
    node.dataset.source = glyph.source;
    node.style.setProperty("--fy-glyph-index", String(glyphIndex));

    if (glyph.topology) {
      node.dataset.jungLayout = glyph.topology.jungLayout;
      node.dataset.jongLayout = glyph.topology.jongLayout;
      node.dataset.layoutKey = glyph.topology.placementKey;
      node.dataset.fyLayoutBucket = glyph.topology.layoutBucket || "default";
    }
    applySemanticFrame(node, glyph);

    (glyph.display.head || []).forEach(function (value, index) {
      var child = createJamoNode(
        "jamo head",
        value,
        "head",
        (placements.head || [])[index] || "h",
        glyph,
        RENDER_ROLES.head
      );
      if (glyph.display.headBase) {
        child.dataset.jamoBase = glyph.display.headBase;
      }
      body.appendChild(child);
    });

    (glyph.display.choseong || []).forEach(function (value, index) {
      var child = createJamoNode(
        "jamo choseong",
        value,
        "choseong",
        placements.choseong[index] || "tl",
        glyph,
        RENDER_ROLES.choseong
      );
      body.appendChild(child);
    });

    if ((glyph.display.jungseong || []).length > 1) {
      var jungCluster = createClusterNode(
        "jungseong-cluster",
        glyph,
        "jungseong"
      );

      (glyph.display.jungseong || []).forEach(function (value, index) {
        var part = index === 0
          ? "jamo jungseong jungseong-base"
          : "jamo jungseong jungseong-tail";
        var child = createJamoNode(
          part,
          value,
          "jungseong",
          placements.jungseong[index] || "tr",
          glyph,
          index === 0 ? RENDER_ROLES.jungBase : RENDER_ROLES.jungTail
        );
        jungCluster.appendChild(child);
      });

      body.appendChild(jungCluster);
    } else {
      /* 단일 중성이라도 head 옆의 tail은 의미상 tail이다 — role-tier 폰트의
       * --fy-jung-tail-*과 [part~="jungseong-tail"] 스타일이 vowel-depth와
       * 무관하게 같은 표면을 유지해야 한다. */
      var hasHead = (glyph.display.head || []).length > 0;
      (glyph.display.jungseong || []).forEach(function (value, index) {
        var child = createJamoNode(
          hasHead ? "jamo jungseong jungseong-tail" : "jamo jungseong",
          value,
          "jungseong",
          placements.jungseong[index] || "tr",
          glyph,
          hasHead ? RENDER_ROLES.jungTail : RENDER_ROLES.jungMain
        );
        body.appendChild(child);
      });
    }

    if ((glyph.display.jongseong || []).length > 1) {
      var jongCluster = createClusterNode(
        "jongseong-cluster",
        glyph,
        "jongseong"
      );

      (glyph.display.jongseong || []).forEach(function (value, index) {
        var part = index === 0
          ? "jamo jongseong jongseong-left"
          : "jamo jongseong jongseong-right";
        var child = createJamoNode(
          part,
          value,
          "jongseong",
          placements.jongseong[index] || "br",
          glyph,
          index === 0 ? RENDER_ROLES.jongLeft : RENDER_ROLES.jongRight
        );
        jongCluster.appendChild(child);
      });

      body.appendChild(jongCluster);
    } else {
      (glyph.display.jongseong || []).forEach(function (value, index) {
        var child = createJamoNode(
          "jamo jongseong",
          value,
          "jongseong",
          placements.jongseong[index] || "br",
          glyph,
          RENDER_ROLES.jongMain
        );
        body.appendChild(child);
      });
    }

    node.appendChild(body);
    return node;
  }

  function renderPlainGlyph(glyph, glyphIndex) {
    var node = createSpan("glyph");
    node.dataset.glyphKind = glyph.kind;
    node.dataset.hangul = "false";
    node.dataset.glyphIndex = String(glyphIndex);
    node.dataset.source = glyph.source;
    node.style.setProperty("--fy-glyph-index", String(glyphIndex));
    var content = createSpan("content", glyph.source);
    /* A lone jamo (compatibility ㄱ or a conjoining jamo by itself) has a cell
     * in the sheet: in a sprite host it carries the same data-sprite-jamo*
     * surface as a jamo node, so the core sprite rule paints the cell instead
     * of a system-font glyph (which is tofu on a device without Hangul). */
    if (renderSpriteMaterial && glyph.source.length === 1) {
      stampSpriteJamo(content, glyph.source);
    }
    node.appendChild(content);
    return node;
  }

  function resolvePlacementPlan(glyph) {
    var key = glyph.topology && glyph.topology.placementKey
      ? glyph.topology.placementKey
      : "right:none";
    var vowelTables = PLACEMENT_TABLES_BY_COMBO[glyph.vowelDepth] ||
      PLACEMENT_TABLES_BY_COMBO[DEFAULT_VOWEL_DEPTH];
    var table = vowelTables[glyph.codaDepth] || vowelTables[DEFAULT_CODA_DEPTH];

    return table[key] || table["right:none"];
  }

  function renderGlyph(glyph, glyphIndex) {
    return glyph.kind === "hangul"
      ? renderHangulGlyph(glyph, glyphIndex)
      : renderPlainGlyph(glyph, glyphIndex);
  }

  function renderTextModel(text, depth) {
    var root = createSpan("root");
    var model = buildTextModel(text, depth);
    var glyphIndex = 0;

    model.lines.forEach(function (line) {
      var lineNode = createSpan("line");
      lineNode.dataset.lineIndex = String(line.index);
      lineNode.style.setProperty("--fy-line-index", String(line.index));

      if (!line.children.length) {
        lineNode.dataset.empty = "true";
      }

      line.children.forEach(function (child) {
        if (child.type === "word") {
          var wordNode = createSpan("word");
          wordNode.dataset.wordIndex = String(child.index);
          wordNode.style.setProperty("--fy-word-index", String(child.index));

          child.children.forEach(function (glyph) {
            wordNode.appendChild(renderGlyph(glyph, glyphIndex));
            glyphIndex += 1;
          });

          lineNode.appendChild(wordNode);
          return;
        }

        var spaceNode = createSpan("space");
        spaceNode.dataset.spaceKind = child.kind;
        spaceNode.style.setProperty("--fy-space-count", String(child.count));
        lineNode.appendChild(spaceNode);
      });

      root.appendChild(lineNode);
    });

    return root;
  }

  function normalizeLength(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value + "px" : fallback;
    }
    var str = String(value).trim();
    if (!str) {
      return fallback;
    }
    if (/^\d+(\.\d+)?$/u.test(str)) {
      return str + "px";
    }
    return str;
  }

  /* Node type checks instead of `instanceof HTMLElement`: hosts in a
   * same-origin iframe belong to another realm and fail instanceof. */
  function isElementNode(node) {
    return Boolean(node) && node.nodeType === 1;
  }

  function inferHostMode(target) {
    return String(target.localName || target.tagName || "").toLowerCase() === "font-kku"
      ? "custom-element"
      : "decorator";
  }

  /* Persistent option inputs (ADR-002): a custom element reads the plain
   * attribute, a decorator the data-* attribute of the same name. */
  var OPTION_KEYS = ["font", "profile", "size", "spacing", "wrap-unit", "animate", "seed", "jamo-seeds", "jamo-set", "stroke-depth"];
  var DECORATOR_OPTION_ATTRIBUTES = OPTION_KEYS.map(function (key) {
    return "data-" + key;
  });
  var DATASET_KEYS = {
    "font": "font",
    "profile": "profile",
    "size": "size",
    "spacing": "spacing",
    "wrap-unit": "wrapUnit",
    "animate": "animate",
    "seed": "seed",
    "jamo-seeds": "jamoSeeds",
    "jamo-set": "jamoSet",
    "stroke-depth": "strokeDepth"
  };

  function readRawOption(host, mode, key) {
    if (mode === "custom-element") {
      return host.getAttribute(key);
    }
    var value = host.dataset ? host.dataset[DATASET_KEYS[key]] : undefined;
    return value === undefined ? null : value;
  }

  function readOption(host, mode, key) {
    if (key === "font" || key === "profile") {
      return readRawOption(host, mode, "font") || readRawOption(host, mode, "profile") || null;
    }
    var value = readRawOption(host, mode, key);
    /* jamo-seeds is a boolean attribute: presence (even empty) matters. */
    return key === "jamo-seeds" ? value : value || null;
  }

  /* Raw option inputs as one comparable string. A re-render is due only
   * when this differs from the inputs of the last render — setting an
   * attribute to its current value, or the attribute callbacks a custom
   * element upgrade replays, never re-render. */
  function snapshotOptions(host, mode) {
    return OPTION_KEYS.map(function (key) {
      var value = readRawOption(host, mode, key);
      return value === null ? "\u0000" : value;
    }).join("\u0001");
  }

  function resolveSeed(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    var str = String(value).trim();
    if (str === "auto" || str === "random") {
      return Math.random();
    }
    var num = Number(str);
    if (Number.isFinite(num)) {
      return num;
    }
    return hashSeed(str);
  }

  /* Font names and aliases are trimmed and ASCII-case-insensitive; the
   * canonical name is lowercase ("SEBUL" -> "sebul", "Gothic2" -> "gothic"),
   * unknown names included, so a [data-fy-font="x"] gate is predictable.
   * Deprecated alias names resolve to their shipped font. Author input stays
   * untouched; the resolved data-fy-* surface is normalized instead. */
  function foldFontName(value) {
    return String(value == null ? "" : value).trim().replace(/[A-Z]+/g, function (letters) {
      return letters.toLowerCase();
    });
  }

  function normalizeFontName(value) {
    var name = foldFontName(value);
    if (!name) {
      return DEFAULT_FONT;
    }
    return Object.prototype.hasOwnProperty.call(FONT_ALIASES, name) ? FONT_ALIASES[name] : name;
  }

  /* An empty JS option (undefined, null, "") falls back to the attribute. */
  function isBlank(value) {
    return value === undefined || value === null || value === "";
  }

  var JAMO_SEEDS_OFF = { "false": true, "off": true, "none": true, "0": true };

  /* Opt-in per-render jamo seeding. The attribute is boolean ("false",
   * "off", "none", "0" turn it off); the JS option also accepts
   * applyJamoSeeds options ({ property, salt, hash }). */
  function normalizeJamoSeeds(value) {
    if (value === undefined || value === null || value === false) {
      return null;
    }
    if (value === true) {
      return {};
    }
    if (typeof value === "object") {
      return value;
    }
    return JAMO_SEEDS_OFF[String(value).trim().toLowerCase()] ? null : {};
  }

  /* ADR-002: attributes are the persistent source, JS options apply to this
   * call only. `previous` is passed by style re-resolution: it keeps the seed
   * its unchanged attribute input resolved to, so seed="auto" does not
   * re-roll because a stylesheet arrived. A seed from a one-shot JS option is
   * not kept. */
  function normalizeOptions(host, mode, options, previous) {
    var next = options || {};
    var seedFromOption = !isBlank(next.seed);
    var seedInput = seedFromOption ? next.seed : readOption(host, mode, "seed");
    var keepSeed = previous && !seedFromOption && previous.seedFromAttribute &&
      previous.seedInput === seedInput;
    var spacing = normalizeLength(
      isBlank(next.spacing) ? readOption(host, mode, "spacing") : next.spacing, "");

    var authoredFont = next.font || next.profile || readOption(host, mode, "font");
    return {
      font: normalizeFontName(authoredFont || DEFAULT_FONT),
      /* 글꼴을 밝히지 않은 바탕 요소만 기본 배치(세벌 고정)를 쓴다 — ADR-026 */
      fontExplicit: Boolean(authoredFont),
      size: normalizeLength(isBlank(next.size) ? readOption(host, mode, "size") : next.size, "24px"),
      spacing: spacing || undefined,
      wrapUnit: next.wrapUnit || readOption(host, mode, "wrap-unit") || "word",
      animate: next.animate || readOption(host, mode, "animate") || undefined,
      seed: keepSeed ? previous.seed : resolveSeed(seedInput),
      seedInput: seedInput === undefined ? null : seedInput,
      seedFromAttribute: !seedFromOption,
      jamoSeeds: normalizeJamoSeeds(
        isBlank(next.jamoSeeds) ? readOption(host, mode, "jamo-seeds") : next.jamoSeeds),
      jamoSet: normalizeJamoSetName(isBlank(next.jamoSet) ? readOption(host, mode, "jamo-set") : next.jamoSet),
      strokeDepth: normalizeStrokeDepth(isBlank(next.strokeDepth) ? readOption(host, mode, "stroke-depth") : next.strokeDepth),
      hostMode: mode
    };
  }

  function setDataIfChanged(host, key, value) {
    if (host.dataset[key] !== value) {
      host.dataset[key] = value;
    }
  }

  function setResolvedFontSurface(host, font, hostMode) {
    setDataIfChanged(host, "fyFont", font);
    setDataIfChanged(host, "fyProfile", font);

    /* A custom element reads plain attributes (`font`/`profile`), so its
     * historical normalized data-* output remains unambiguous and compatible.
     * A decorator reads data-* as author input and must never overwrite it. */
    if (hostMode === "custom-element") {
      setDataIfChanged(host, "font", font);
      setDataIfChanged(host, "profile", font);
    }
  }

  function readIdent(style, name) {
    return String(style.getPropertyValue(name) || "").trim().replace(/^["']|["']$/g, "");
  }

  function computedStyleFor(host) {
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") {
      return view.getComputedStyle(host);
    }
    return getComputedStyle(host);
  }

  /* Everything the runtime reads from font CSS, in one computed-style pass.
   * Call only after the font surface has been stamped: profile CSS gates on
   * data-fy-font, so reading earlier would resolve against the previous font.
   * - structure: --fy-expression-mode and the jamo depth — font level
   *   --fy-font-jamo-depth (shorthand) / --fy-font-vowel-depth /
   *   --fy-font-coda-depth, page level the same names without "font-"
   *   (page beats font; within a level a declared longhand wins)
   * - metadata (ADR-008): --fy-font-id tells whether the requested font's CSS
   *   has arrived, --fy-contract which contract it targets, --fy-material and
   *   --fy-sprite-kinds gate the core sprite painting. Keywords are
   *   case-insensitive like the depth keywords. */
  /* Jamo depth at one level: the plain names are the page level, the
   * --fy-font-* names the font level (like --fy-weight / --fy-font-weight).
   * Within a level a declared longhand wins over the shorthand. */
  var PAGE_DEPTH_VARIABLES = { shorthand: "--fy-jamo-depth", vowel: "--fy-vowel-depth", coda: "--fy-coda-depth" };
  var FONT_DEPTH_VARIABLES = { shorthand: "--fy-font-jamo-depth", vowel: "--fy-font-vowel-depth", coda: "--fy-font-coda-depth" };

  function readDepthLevel(style, names) {
    var shorthand = JAMO_DEPTH_SHORTHANDS[
      String(style.getPropertyValue(names.shorthand) || "").trim().toLowerCase()
    ];
    return {
      vowel: normalizeKeyword(style.getPropertyValue(names.vowel), VOWEL_DEPTHS, shorthand ? shorthand.vowel : null),
      coda: normalizeKeyword(style.getPropertyValue(names.coda), CODA_DEPTHS, shorthand ? shorthand.coda : null)
    };
  }

  /* 기기 글꼴 맞춤(ADR-023). 기기 글꼴 재료(sebul·gothic과 파생)의 배치는 자모마다 정해진 표준 잉크 상자
   * (spec/jamo-ink-boxes.json, 글꼴이 --fy-font-ink-boxes: standard로 밝힌다)에 놓인 자모를 전제로 교정돼 있다.
   * 그래서 어느 기기에서나 자모마다 그 기기 글꼴의 잉크 상자를 재서 표준 상자로 옮기는 값을 노드에 적고,
   * ::before가 낱자(호환 자모)로 그린다 — 기기마다 다른 한글 글꼴(Apple SD·Noto Sans CJK·One UI Sans·맑은 고딕)이
   * 같은 자리에 조합된다. 표는 faceTexts() 차례의 [왼, 위, 오른, 아래] 1/1000em 압축 사본이다. */
  /* BEGIN GENERATED ink-boxes: scripts/build_ink_boxes.py from spec/jamo-ink-boxes.json — do not edit by hand. */
  var INK_BOXES = {
    standard: {
      advance: 0.865,
      stroke: 0.075,
      boxes: "160,210,670,660 140,210,750,660 170,210,730,660 170,200,720,670 150,200,730,670 160,190,730,680 170,200,720,670 170,190,710,670 " +
        "150,190,730,670 130,190,750,680 90,200,780,680 160,190,710,670 140,190,750,670 90,190,780,680 140,150,750,710 160,190,710,670 " +
        "170,200,720,670 140,210,740,670 150,160,730,700 380,10,660,870 290,10,580,870 340,10,620,870 290,10,580,870 270,10,550,870 " +
        "210,10,610,870 270,10,550,870 210,10,620,870 40,210,830,650 50,10,840,870 50,10,760,870 100,10,730,870 50,210,830,670 " +
        "50,410,830,850 80,10,780,870 70,10,790,870 90,10,780,870 40,400,830,850 40,590,830,660 60,30,750,840 400,10,480,880 " +
        "160,210,670,660 140,210,750,660 120,210,800,670 170,210,730,660 160,200,750,680 160,200,750,690 170,200,720,670 160,190,730,680 " +
        "150,200,750,660 150,200,750,670 150,200,750,670 150,200,800,680 150,200,750,670 150,200,750,670 140,200,770,690 170,200,720,670 " +
        "170,190,710,670 150,200,810,680 130,190,750,680 90,200,780,680 160,190,710,670 140,190,750,670 140,150,750,710 160,190,710,670 " +
        "170,200,720,670 140,210,740,670 150,160,730,700 40,80,830,740 40,60,830,870 40,90,830,740 40,80,830,740 40,50,830,870 " +
        "40,90,830,740 40,70,830,750 40,40,830,870 40,70,830,750 40,60,830,760 40,40,830,860 40,80,830,750 40,70,830,760 " +
        "40,40,830,860 40,90,830,750 40,60,830,760 40,30,830,860 40,60,830,750 40,70,830,760 40,40,830,870 40,80,830,750 " +
        "40,50,830,760 40,20,830,870 40,70,830,750 40,60,830,760 40,30,830,870 40,70,830,750 40,60,830,760 40,20,830,870 " +
        "40,60,830,750 40,60,830,760 40,30,830,870 40,70,830,750 40,50,830,750 40,30,830,870 40,70,830,750 40,80,830,760 " +
        "40,50,830,870 40,90,830,750 40,70,830,760 40,50,830,870 40,80,830,750 40,20,830,760 40,0,830,870 40,30,830,760 " +
        "40,80,830,750 40,50,830,870 40,90,830,740 40,60,830,760 40,40,830,860 40,70,830,760 40,80,830,760 40,40,830,870 " +
        "40,80,830,750 40,30,830,770 40,0,830,870 40,30,830,760 160,210,670,660 120,210,750,660 120,210,800,670 170,210,730,660 " +
        "160,200,750,680 140,180,750,690 170,200,720,670 150,200,730,670 160,190,730,680 140,200,750,660 140,200,750,670 140,200,750,670 " +
        "150,200,800,680 140,200,750,670 150,200,760,670 120,180,760,690 170,200,720,670 170,190,710,670 150,190,730,670 150,200,810,680 " +
        "130,190,750,680 90,200,780,680 160,190,710,670 140,190,750,670 90,190,780,680 140,150,750,710 160,190,710,670 170,200,720,670 " +
        "140,210,740,670 150,160,730,700 380,10,660,870 290,10,580,870 340,10,620,870 290,10,580,870 270,10,550,870 210,10,610,870 " +
        "270,10,550,870 210,10,620,870 40,210,830,650 50,10,840,870 50,10,760,870 100,10,730,870 50,210,830,670 50,410,830,850 " +
        "80,10,780,870 70,10,790,870 90,10,780,870 40,400,830,850 40,590,830,660 60,30,750,840 400,10,480,880"
    }
  };
  /* END GENERATED ink-boxes */
  var INK_DECODED = Object.create(null);

  /* 기기 글꼴 자모 노드에 들어가는 글자: 조합용 초성 19·중성 21·종성 27과, 합자 모음을 음절 깊이로 그릴 때의
   * 머리 음절(초성 × ㅗ·ㅜ·ㅡ, 받침 없음) 57. 생성기와 같은 차례다. */
  function faceTexts() {
    var texts = [];
    var i;
    for (i = 0; i < 19; i += 1) { texts.push(String.fromCharCode(0x1100 + i)); }
    for (i = 0; i < 21; i += 1) { texts.push(String.fromCharCode(0x1161 + i)); }
    for (i = 0; i < 27; i += 1) { texts.push(String.fromCharCode(0x11A8 + i)); }
    for (i = 0; i < 19; i += 1) {
      [8, 13, 18].forEach(function (vowel) {
        texts.push(String.fromCharCode(0xAC00 + (i * 21 + vowel) * 28));
      });
    }
    /* 낱자(호환 자모 ㄱ–ㅣ, ADR-025 §6) */
    for (i = 0x3131; i <= 0x3163; i += 1) { texts.push(String.fromCharCode(i)); }
    return texts;
  }

  /* 표준 상자 표 이름(지금은 standard) → { 글자: [왼쪽, 위, 오른쪽, 아래, 전진폭] }. 모르는 이름이면 null. */
  function inkBoxes(name) {
    if (!Object.prototype.hasOwnProperty.call(INK_BOXES, name)) {
      return null;
    }
    if (!INK_DECODED[name]) {
      var data = INK_BOXES[name];
      var numbers = data.boxes.split(/[ ,]/);
      var boxes = Object.create(null);
      faceTexts().forEach(function (text, index) {
        var at = index * 4;
        boxes[text] = [numbers[at] / 1000, numbers[at + 1] / 1000, numbers[at + 2] / 1000, numbers[at + 3] / 1000,
          data.advance];
      });
      INK_DECODED[name] = boxes;
    }
    return INK_DECODED[name];
  }

  var FACE_DEFAULT_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
  var FACE_BOXES = Object.create(null);
  var FACE_BASELINES = Object.create(null);
  var FACE_LOADS = Object.create(null);
  var faceCanvas = null;

  function faceBaseline(doc, family) {
    if (family in FACE_BASELINES) {
      return FACE_BASELINES[family];
    }
    var parent = doc && (doc.body || doc.documentElement);
    if (!parent || typeof doc.createElement !== "function") {
      return null;
    }
    var probe = doc.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;" +
      "font-size:100px;font-weight:400;font-style:normal;line-height:1;white-space:nowrap";
    probe.style.fontFamily = family;
    var mark = doc.createElement("span");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    probe.appendChild(doc.createTextNode("ᄀ"));
    probe.appendChild(mark);
    parent.appendChild(probe);
    var baseline = mark.offsetTop / 100;
    parent.removeChild(probe);
    FACE_BASELINES[family] = baseline;
    return baseline;
  }

  /* 글자 하나의 잉크 상자 [왼쪽, 위, 오른쪽, 아래, 전진폭](em). 잴 수 없거나 잉크가 없으면 null.
   * 잉크는 캔버스에 100px로 그려 화소를 훑는다 — WebKit의 measureText는 actualBoundingBox 좌우를 잉크가
   * 아니라 전진폭으로 돌려준다. 칸은 기준점 왼쪽 0.4em·위 1.4em부터 2em × 2em, 알파 절반 이상이 잉크다. */
  function faceBox(doc, family, text, weight, style) {
    var shape = (style && style !== "normal" ? style + " " : "") + (weight || 400);
    var key = family + "\u0000" + text + (shape === "400" ? "" : "\u0000" + shape);
    if (key in FACE_BOXES) {
      return FACE_BOXES[key];
    }
    var box = null;
    if (!faceCanvas && doc && typeof doc.createElement === "function") {
      var canvas = doc.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      faceCanvas = typeof canvas.getContext === "function" ? canvas.getContext("2d", { willReadFrequently: true }) : null;
    }
    var baseline = faceCanvas ? faceBaseline(doc, family) : null;
    watchFaceLoad(doc, family, text);
    if (faceCanvas && baseline !== null) {
      faceCanvas.clearRect(0, 0, 200, 200);
      faceCanvas.font = shape + " 100px " + family;
      faceCanvas.textBaseline = "alphabetic";
      faceCanvas.fillStyle = "#000";
      faceCanvas.fillText(text, 40, 140);
      var pixels = null;
      try {
        pixels = faceCanvas.getImageData(0, 0, 200, 200).data;
      } catch (error) {
        pixels = null;
      }
      var minX = 200;
      var minY = 200;
      var maxX = -1;
      var maxY = -1;
      for (var y = 0; pixels && y < 200; y += 1) {
        for (var x = 0; x < 200; x += 1) {
          if (pixels[(y * 200 + x) * 4 + 3] >= 128) {
            if (x < minX) { minX = x; }
            if (x > maxX) { maxX = x; }
            if (y < minY) { minY = y; }
            maxY = y;
          }
        }
      }
      if (maxX > minX && maxY > minY) {
        box = [(minX - 40) / 100, baseline + (minY - 140) / 100, (maxX + 1 - 40) / 100,
          baseline + (maxY + 1 - 140) / 100, faceCanvas.measureText(text).width / 100];
      }
    }
    FACE_BOXES[key] = box;
    return box;
  }

  /* 아직 받는 중인 웹 글꼴이면 지금은 대체 글꼴로 재고, 받은 뒤 다시 잰다. 받는 중인 글꼴은 document.fonts의
   * FontFace 상태로 본다 — WebKit의 fonts.check()는 받는 중에도 true를 돌려준다(기준선 탐침이 받기를 건다). */
  function watchFaceLoad(doc, family, text) {
    var fonts = doc && doc.fonts;
    if (!fonts || FACE_LOADS[family]) {
      return;
    }
    var names = family.split(",").map(function (name) {
      return name.trim().replace(/^["']|["']$/g, "").toLowerCase();
    });
    var waits = [];
    if (typeof fonts.forEach === "function") {
      fonts.forEach(function (face) {
        var name = String(face.family || "").replace(/^["']|["']$/g, "").toLowerCase();
        if (face.status === "loading" && names.indexOf(name) >= 0 && face.loaded) {
          waits.push(face.loaded);
        }
      });
    }
    if (!waits.length && typeof fonts.check === "function" && typeof fonts.load === "function" &&
        !fonts.check("100px " + family, text)) {
      waits.push(fonts.load("100px " + family, text));
    }
    if (waits.length && typeof Promise === "function") {
      FACE_LOADS[family] = true;
      var settle = function () {
        delete FACE_LOADS[family];
        refitFaces(doc);
      };
      Promise.all(waits).then(settle, settle);
    }
  }

  function faceGlyph(text) {
    return JAMO_TO_COMPAT[text] || text;
  }

  var FACE_SAME = 0.02;
  function faceClose(box, expected) {
    for (var i = 0; i < 4; i += 1) {
      if (Math.abs(box[i] - expected[i]) > FACE_SAME) {
        return false;
      }
    }
    return true;
  }

  /* x' = s·x + t가 이 글꼴의 낱자 상자를 기준 상자로 옮긴다. 고른 배율 k = √(sx·sy)는 글자 크기로 줘서
   * 외곽선·굵기가 작은 글자를 메우지 않게 하고, 남은 가로·세로 비만 scale로 준다. */
  /* 글자 하나(잉크 상자 box)를 기대 상자(em)에 맞추는 값: 고른 배율 k = √(sx·sy)는 글자 크기, 남은 가로·세로 비는 scale, 옮김은
   * k로 나눈 em(글자 크기가 k인 요소 안에서 풀린다) */
  function faceFit(box, expected) {
    var sx = (expected[2] - expected[0]) / (box[2] - box[0]);
    var sy = (expected[3] - expected[1]) / (box[3] - box[1]);
    var k = Math.sqrt(sx * sy);
    return { k: k, scaleX: sx / k, scaleY: sy / k, x: (expected[0] - sx * box[0]) / k, y: (expected[1] - sy * box[1]) / k };
  }

  /* 세벌 고정 도장(ADR-026)의 기기 글꼴 노드는 도장의 text-stroke(획 굵기 보정, 노드 em)가 잉크를 바깥으로 절반씩 넓힌다. 그
   * 넓힘까지 표준 상자에 들게 상자를 절반만큼 안으로 줄여 맞춘다 — 원소 재료와 같은 잉크 자리라 이웃 자모·글자 칸에 닿지 않는다.
   * 도장 값만 보므로 같은 도장은 어디서나 같은 맞춤이다(L01). 도장이 없거나 획이 0이면 그대로다. */
  function stampInset(node, expected) {
    var stroke = node.hasAttribute("data-fy-stamp") ? parseFloat(node.style.getPropertyValue("--fy-stamp-stroke")) : 0;
    var half = stroke > 0 ? stroke / 2 : 0;
    if (!half || expected[2] - expected[0] <= 2 * half || expected[3] - expected[1] <= 2 * half) {
      return expected;
    }
    return [expected[0] + half, expected[1] + half, expected[2] - half, expected[3] - half, expected[4]];
  }

  function fitFaceNodes(root, meta, doc) {
    var reference = inkBoxes(meta.inkBoxes);
    if (!reference || typeof root.querySelectorAll !== "function") {
      return;
    }
    var design = appliedDesign(meta);
    Array.prototype.forEach.call(root.querySelectorAll('[part~="jamo"]'), function (node) {
      var text = node.dataset.jamo;
      var expected = text ? reference[text] : null;
      if (!expected) {
        return;
      }
      var family = meta.family;
      var shape = null;
      if (design) {
        /* 글꼴 팔레트(ADR-025 §9): 자모 하나가 한 글꼴의 통째 글자면 그 글꼴로 노드를 맞추고, 조각마다 다른 글꼴이거나 조립식이면
         * 조각마다 잎([part="leaf"])을 낸다 */
        shape = fontPlan(node, text, expected, meta, design, doc);
        if (!shape) {
          return;
        }
        family = designFamily(shape);
      }
      /* 그 글꼴의 조합용 자모가 이미 표준 상자에 있으면(±FACE_SAME em) 그 글자를 그대로 맞추고, 아니면(Noto Sans CJK
       * 같은 위치형) 낱자로 바꾼다 — 표준 상자를 낸 글꼴(Apple SD)에서는 원래 렌더와 같다. */
      var glyph = text;
      var weight = shape ? shape.weight : undefined;
      var style = shape ? shape.style : undefined;
      var box = faceBox(doc, family, text, weight, style);
      if (!box || !faceClose(box, expected)) {
        glyph = faceGlyph(text);
        box = glyph === text ? box : faceBox(doc, family, glyph, weight, style);
      }
      if (!box) {
        return;
      }
      var fit = faceFit(box, stampInset(node, expected));
      node.style.setProperty("--fy-face-glyph", JSON.stringify(glyph));
      node.style.setProperty("--fy-face-size", round4(fit.k) + "em");
      node.style.setProperty("--fy-face-scale-x", String(round4(fit.scaleX)));
      node.style.setProperty("--fy-face-scale-y", String(round4(fit.scaleY)));
      /* translate는 ::before의 em(= 노드 em × k)으로 풀리므로 k로 나눈다 */
      node.style.setProperty("--fy-face-x", round4(fit.x) + "em");
      node.style.setProperty("--fy-face-y", round4(fit.y) + "em");
      node.style.setProperty("--fy-face-width", round4(expected[4]) + "em");
    });
  }

  /* 글꼴 팔레트의 자모 노드 하나. 통째 글자 하나면 그 글꼴 소스를 돌려주고(호출한 쪽이 맞춘다), 잎을 냈으면 null. 잎은
   * 조립 계획의 조각마다 그 글꼴의 낱자를 조각 자리(뼈대 획 묶음의 잉크 영역)에 맞춘다 — ADR-023 맞춤과 같은 셈이다. */
  function fontPlan(node, text, expected, meta, design, doc) {
    Array.prototype.slice.call(node.querySelectorAll(':scope > [part="leaf"]')).forEach(function (leaf) { node.removeChild(leaf); });
    node.removeAttribute("data-fy-leaves");
    node.style.removeProperty("--fy-face-glyph");
    var skeleton = skeletonFor(node, text);
    if (!skeleton) {
      applyFontShape(node, design.sources[design.defaults.source]);
      return design.sources[design.defaults.source];
    }
    var env = { design: design, set: null, sourceId: null, cells: null, geometry: true, trace: [] };
    var requests = designRequests(node, skeleton, design);
    var code = text.charCodeAt(0);
    var context = code >= 0x11A8 && code <= 0x11FF ? "jong" : code >= 0xAC00 ? "bar" : "";
    if (code >= 0x1100 && code <= 0x1112) {
      context = overBar(node) ? "bar" : "cho";
    }
    var items = [];
    skeleton.forEach(function (group, index) {
      var top = requests[index];
      planRequest({
        jamo: group[0], strokes: group[1], context: /[\u314F-\u3163]/.test(group[0]) ? "" : context,
        rootJamo: top.rootJamo, rootRole: top.rootRole, layout: top.layout, hasFinal: top.hasFinal,
        path: top.path, binding: top.binding, inherited: top.inherited, level: 0
      }, env, items);
    });
    if (PLAN_TRACES) {
      PLAN_TRACES.set(node, env.trace);
    }
    var sources = items.map(function (item) { return item.source; }).filter(function (id, i, all) { return all.indexOf(id) === i; });
    var single = items.length === skeleton.length && sources.length === 1 && items.every(function (item, index) {
      return item.font && item.drawing === skeleton[index][0];
    });
    if (single) {
      var source = design.sources[sources[0]];
      applyFontShape(node, source);
      noteFontIdentity(env.trace, doc, source, text);
      return source;
    }
    var table = INK_BOXES[meta.inkBoxes];
    var axes = elementAxes(expected, table.stroke, table.stroke);
    items.forEach(function (item) {
      if (!item.font) {
        return;
      }
      var sourceOf = design.sources[item.source];
      var box = faceBox(doc, designFamily(sourceOf), item.drawing, sourceOf.weight, sourceOf.style);
      if (!box) {
        return;
      }
      var fit = faceFit(box, strokesRegion(item.strokes, axes, table.stroke));
      var leaf = doc.createElement("span");
      leaf.setAttribute("part", "leaf");
      leaf.setAttribute("data-leaf-source", item.source);
      leaf.setAttribute("data-leaf-path", item.path.join("/"));
      leaf.textContent = item.drawing;
      applyFontShape(leaf, sourceOf);
      leaf.style.setProperty("--fy-leaf-size", round4(fit.k) + "em");
      leaf.style.setProperty("--fy-leaf-scale-x", String(round4(fit.scaleX)));
      leaf.style.setProperty("--fy-leaf-scale-y", String(round4(fit.scaleY)));
      leaf.style.setProperty("--fy-leaf-x", round4(fit.x) + "em");
      leaf.style.setProperty("--fy-leaf-y", round4(fit.y) + "em");
      node.appendChild(leaf);
      noteFontIdentity(env.trace.filter(function (entry) { return entry.path === item.path && entry.source === item.source; }), doc, sourceOf, item.drawing);
    });
    node.setAttribute("data-fy-leaves", "");
    node.style.setProperty("--fy-face-width", round4(expected[4]) + "em");
    return null;
  }

  /* 뼈대 획 묶음(0–1)의 잉크 영역(em) — 중심선 상자를 획 굵기의 절반만큼 넓힌다 */
  function strokesRegion(strokes, axes, stroke) {
    var box = strokesExtent(strokes);
    return [axes.x(box[0]) - stroke / 2, axes.y(box[1]) - stroke / 2, axes.x(box[2]) + stroke / 2, axes.y(box[3]) + stroke / 2];
  }

  /* 글꼴 소스의 family·weight·style을 요소에 */
  function applyFontShape(element, source) {
    element.style.fontFamily = designFamily(source);
    if (source.weight) {
      element.style.fontWeight = String(source.weight);
    }
    if (source.style) {
      element.style.fontStyle = source.style;
    }
  }

  /* 출처 확신(ADR-025 §9): 브라우저에서 글꼴의 실제 글자인지 증명할 수 없다 — 기본 대체 글꼴과 잉크가 같으면 대체 의심 */
  function noteFontIdentity(entries, doc, source, glyph) {
    var box = faceBox(doc, designFamily(source), glyph, source.weight, source.style);
    var fallback = faceBox(doc, FACE_DEFAULT_FAMILY, glyph, source.weight, source.style);
    var same = box && fallback && box.every(function (value, index) { return Math.abs(value - fallback[index]) < 0.001; });
    var isDefault = FACE_DEFAULT_FAMILY.indexOf(JSON.stringify(source.family)) >= 0;
    var suspected = same && !isDefault && !loadedWebFont(doc, source.family);
    entries.forEach(function (entry) {
      entry.measurement = box ? "pixel" : "unavailable";
      entry.identity = suspected ? "fallback-suspected" : "unverified";
    });
  }

  /* 페이지가 @font-face로 실어 받기를 마친 글꼴인가 — 그 글꼴이 기본 대체 글꼴과 윤곽이 같아도(Android에서 Noto Sans KR을 웹 글꼴로
   * 실으면 기기의 대체 글꼴도 Noto다) 대체로 의심하지 않는다. 이름만 있고 @font-face가 없는 글꼴은 잉크 비교를 그대로 쓴다. */
  function loadedWebFont(doc, family) {
    var fonts = doc && doc.fonts;
    var name = String(family).replace(/^["']|["']$/g, "").toLowerCase();
    var found = false;
    if (fonts && typeof fonts.forEach === "function") {
      fonts.forEach(function (face) {
        if (!found && face.status === "loaded" && String(face.family).replace(/^["']|["']$/g, "").toLowerCase() === name) {
          found = true;
        }
      });
    }
    return found;
  }

  /* 원소 재료(ADR-024) — 자모 노드 안에 획마다 [part="hoek"](획순·종류·출처·역할은 획 깊이와 같은 data-hoek*),
   * 그 안에 마디마다 선분 상자나 원을 둔다. 자리는 뼈대 정본(spec/jamo-skeletons.json)의 표준 잉크 상자 좌표이고,
   * 굵기·끝·칠은 CSS다. 초성은 문맥(세로 모음 옆 cho·가로 모음 위 bar)에 따라 뼈대가 다르다. */
  /* BEGIN GENERATED skeletons: scripts/build_jamo_skeletons.js from spec/jamo-skeletons.json — do not edit by hand. */
  var SKELETONS = {"ᄀ@cho":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.08,1,0.5,0]]]]],"ᄀ@bar":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᄁ@cho":[["ㄲ",[[[0,0,0.462,0,0.5,0.5],[0.462,0,0.462,0.271,0.5,0.5],[0.462,0.271,0.037,0.902,0.5,0]],[[0.556,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.592,1,0.5,0]]]]],"ᄁ@bar":[["ㄲ",[[[0,0,0.373,0,0.5,0.5],[0.373,0,0.373,1,0.5,0.5]],[[0.627,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᄂ@cho":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄂ@bar":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄃ@cho":[["ㄷ",[[[0,0,0.8,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄃ@bar":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄄ@cho":[["ㄸ",[[[0,0,0.288,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.36,1,0.5,0.5]],[[0.56,0,0.912,0,0.5,0.5]],[[0.56,0,0.56,1,0.5,0.5],[0.56,1,1,1,0.5,0.5]]]]],"ᄄ@bar":[["ㄸ",[[[0,0,0.394,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.394,1,0.5,0.5]],[[0.581,0,1,0,0.5,0.5]],[[0.581,0,0.581,0.975,0.5,0.5],[0.581,0.975,1,0.975,0.5,0.5]]]]],"ᄅ@cho":[["ㄹ",[[[0,0,0.74,0,0.5,0.5],[0.74,0,0.74,0.5,0.5,0.5]],[[0,0.5,0.74,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄅ@bar":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄆ@cho":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᄆ@bar":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᄇ@cho":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄇ@bar":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄈ@cho":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.337,0,0.337,1,0.5,0.5]],[[0,0.46,0.337,0.46,0,0]],[[0,1,0.337,1,0.5,0.5]],[[0.647,0,0.647,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.647,0.46,1,0.46,0,0]],[[0.647,1,1,1,0.5,0.5]]]]],"ᄈ@bar":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.376,0,0.376,1,0.5,0.5]],[[0,0.46,0.376,0.46,0,0]],[[0,1,0.376,1,0.5,0.5]],[[0.624,0,0.624,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.624,0.46,1,0.46,0,0]],[[0.624,1,1,1,0.5,0.5]]]]],"ᄉ@cho":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄉ@bar":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄊ@cho":[["ㅆ",[[[0.219,0.014,0,0.902,0.3,0]],[[0.145,0.316,0.439,0.902,0,0]],[[0.714,0,0.427,1,0.3,0]],[[0.616,0.34,1,1,0,0]]]]],"ᄊ@bar":[["ㅆ",[[[0.215,0.021,0,1,0.3,0]],[[0.142,0.354,0.431,1,0,0]],[[0.756,0,0.512,1,0.3,0]],[[0.673,0.34,1,1,0,0]]]]],"ᄋ@cho":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᄋ@bar":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᄌ@cho":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄌ@bar":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄍ@cho":[["ㅉ",[[[0,0,0.439,0,0.5,0.5]],[[0.219,0,0,0.899,0.3,0]],[[0.145,0.306,0.439,0.899,0,0]],[[0.412,0,1,0,0.5,0.5]],[[0.706,0,0.412,1,0.3,0]],[[0.606,0.34,1,1,0,0]]]]],"ᄍ@bar":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,1,0.3,0]],[[0.147,0.34,0.445,1,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,1,0.3,0]],[[0.68,0.34,1,1,0,0]]]]],"ᄎ@cho":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᄎ@bar":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᄏ@cho":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.08,1,0.5,0]],[[0,0.42,1,0.42,0.5,0]]]]],"ᄏ@bar":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ᄐ@cho":[["ㅌ",[[[0,0,0.82,0,0.5,0.5]],[[0,0.48,0.78,0.48,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄐ@bar":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄑ@cho":[["ㅍ",[[[0.04,0,0.88,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.68,0,0.68,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄑ@bar":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄒ@cho":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ᄒ@bar":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ᅡ":[["ㅏ",[[[0,0,0,1,0.5,0.5]],[[0,0.43,1,0.43,0,0.5]]]]],"ᅢ":[["ㅐ",[[[0,0,0,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅣ":[["ㅑ",[[[0,0,0,1,0.5,0.5]],[[0,0.29,1,0.29,0,0.5]],[[0,0.59,1,0.59,0,0.5]]]]],"ᅤ":[["ㅒ",[[[0,0,0,1,0.5,0.5]],[[0,0.3,1,0.3,0,0]],[[0,0.58,1,0.58,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅥ":[["ㅓ",[[[0,0.42,1,0.42,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅦ":[["ㅔ",[[[0,0.401,0.348,0.401,0.5,0]],[[0.348,0.01,0.348,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ᅧ":[["ㅕ",[[[0,0.27,1,0.27,0.5,0]],[[0,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅨ":[["ㅖ",[[[0.139,0.261,0.386,0.261,0.5,0]],[[0.139,0.55,0.386,0.55,0.5,0]],[[0.386,0.01,0.386,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ᅩ":[["ㅗ",[[[0.44,0,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ᅪ":[["ㅘ",[[[0.289,0.423,0.289,0.755,0.5,0]],[[0,0.755,0.643,0.755,0.5,0.5]],[[0.809,0,0.809,1,0.5,0.5]],[[0.809,0.43,1,0.43,0,0.5]]]]],"ᅫ":[["ㅙ",[[[0.255,0.443,0.255,0.745,0.5,0]],[[0,0.745,0.567,0.745,0.5,0.5]],[[0.729,0,0.729,1,0.5,0.5]],[[0.729,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅬ":[["ㅚ",[[[0.352,0.443,0.352,0.765,0.5,0]],[[0,0.765,0.782,0.765,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅭ":[["ㅛ",[[[0.3,0,0.3,1,0.5,0]],[[0.58,0,0.58,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ᅮ":[["ㅜ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0.5,1,0,0.5]]]]],"ᅯ":[["ㅝ",[[[0,0.511,0.775,0.511,0.5,0.5]],[[0.372,0.511,0.372,0.941,0,0.5]],[[0.695,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅰ":[["ㅞ",[[[0,0.501,0.579,0.501,0.5,0.5]],[[0.278,0.501,0.278,0.912,0,0.5]],[[0.525,0.554,0.749,0.554,0.5,0]],[[0.749,0.02,0.749,0.941,0.5,0.5]],[[0.996,0,0.996,1,0.5,0.5]]]]],"ᅱ":[["ㅟ",[[[0,0.541,0.797,0.541,0.5,0.5]],[[0.383,0.541,0.383,0.961,0,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅲ":[["ㅠ",[[[0,0,1,0,0.5,0.5]],[[0.3,0,0.3,1,0,0.5]],[[0.69,0,0.69,1,0,0.5]]]]],"ᅳ":[["ㅡ",[[[0,0.5,1,0.5,0.5,0.5]]]]],"ᅴ":[["ㅢ",[[[0,0.721,0.782,0.721,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅵ":[["ㅣ",[[[0.5,0,0.5,1,0.5,0.5]]]]],"ᆨ":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆩ":[["ㄲ",[[[0,0,0.389,0,0.5,0.5],[0.389,0,0.389,1,0.5,0.5]],[[0.611,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆪ":[["ㄳ",[[[0,0,0.327,0,0.5,0.5],[0.327,0,0.327,1,0.5,0.5]],[[0.748,0,0.496,1,0.3,0]],[[0.662,0.34,1,1,0,0]]]]],"ᆫ":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆬ":[["ㄵ",[[[0,0.03,0,0.909,0.5,0.5],[0,0.909,0.346,0.909,0.5,0.5]],[[0.442,0,1,0,0.5,0.5]],[[0.721,0,0.442,1,0.3,0]],[[0.626,0.34,1,1,0,0]]]]],"ᆭ":[["ㄶ",[[[0,0.143,0,0.971,0.5,0.5],[0,0.971,0.317,0.971,0.5,0.5]],[[0.6,0,0.828,0,0.5,0.5]],[[0.428,0.27,1,0.27,0.5,0.5]],{"ring":[0.714,0.71,0.229,0.29]}]]],"ᆮ":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆯ":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆰ":[["ㄺ",[[[0,0,0.541,0,0.5,0.5],[0.541,0,0.541,0.486,0.5,0.5]],[[0,0.486,0.541,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.541,0.971,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆱ":[["ㄻ",[[[0,0,0.428,0,0.5,0.5],[0.428,0,0.428,0.5,0.5,0.5]],[[0,0.5,0.428,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.428,1,0.5,0.5]],[[0.631,0,0.631,1,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0.631,1,1,1,0.5,0.5]]]]],"ᆲ":[["ㄼ",[[[0,0.029,0.413,0.029,0.5,0.5],[0.413,0.029,0.413,0.514,0.5,0.5]],[[0,0.514,0.413,0.514,0.5,0.5]],[[0,0.514,0,1,0.5,0.5],[0,1,0.413,1,0.5,0.5]],[[0.617,0,0.617,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.617,0.46,1,0.46,0,0]],[[0.617,1,1,1,0.5,0.5]]]]],"ᆳ":[["ㄽ",[[[0,0,0.383,0,0.5,0.5],[0.383,0,0.383,0.486,0.5,0.5]],[[0,0.486,0.383,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.383,0.971,0.5,0.5]],[[0.757,0,0.515,1,0.3,0]],[[0.675,0.34,1,1,0,0]]]]],"ᆴ":[["ㄾ",[[[0,0,0.421,0,0.5,0.5],[0.421,0,0.421,0.5,0.5,0.5]],[[0,0.5,0.421,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.421,1,0.5,0.5]],[[0.622,0,1,0,0.5,0.5]],[[0.622,0.5,0.977,0.5,0,0.5]],[[0.622,0,0.622,1,0.5,0.5],[0.622,1,1,1,0.5,0.5]]]]],"ᆵ":[["ㄿ",[[[0,0,0.376,0,0.5,0.5],[0.376,0,0.376,0.5,0.5,0.5]],[[0,0.5,0.376,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.376,1,0.5,0.5]],[[0.542,0,1,0,0.5,0.5]],[[0.666,0,0.666,1,0,0]],[[0.876,0,0.876,1,0,0]],[[0.542,1,1,1,0.5,0.5]]]]],"ᆶ":[["ㅀ",[[[0,0.125,0.407,0.125,0.5,0.5],[0.407,0.125,0.407,0.537,0.5,0.5]],[[0,0.537,0.407,0.537,0.5,0.5]],[[0,0.537,0,0.949,0.5,0.5],[0,0.949,0.407,0.949,0.5,0.5]],[[0.67,0,0.859,0,0.5,0.5]],[[0.529,0.27,1,0.27,0.5,0.5]],{"ring":[0.764,0.71,0.189,0.29]}]]],"ᆷ":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᆸ":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᆹ":[["ㅄ",[[[0,0.029,0,1,0.5,0.5]],[[0.357,0.029,0.357,1,0.5,0.5]],[[0,0.475,0.357,0.475,0,0]],[[0,1,0.357,1,0.5,0.5]],[[0.751,0,0.502,1,0.3,0]],[[0.667,0.34,1,1,0,0]]]]],"ᆺ":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᆻ":[["ㅆ",[[[0.223,0.033,0,0.967,0.3,0]],[[0.147,0.351,0.446,0.967,0,0]],[[0.742,0,0.483,1,0.3,0]],[[0.654,0.34,1,1,0,0]]]]],"ᆼ":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᆽ":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᆾ":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᆿ":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ᇀ":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᇁ":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᇂ":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ㄱ":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄲ":[["ㄲ",[[[0,0,0.389,0,0.5,0.5],[0.389,0,0.389,1,0.5,0.5]],[[0.611,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄳ":[["ㄳ",[[[0,0,0.327,0,0.5,0.5],[0.327,0,0.327,1,0.5,0.5]],[[0.748,0,0.496,1,0.3,0]],[[0.662,0.34,1,1,0,0]]]]],"ㄴ":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄵ":[["ㄵ",[[[0,0.03,0,0.909,0.5,0.5],[0,0.909,0.346,0.909,0.5,0.5]],[[0.442,0,1,0,0.5,0.5]],[[0.721,0,0.442,1,0.3,0]],[[0.626,0.34,1,1,0,0]]]]],"ㄶ":[["ㄶ",[[[0,0.143,0,0.971,0.5,0.5],[0,0.971,0.317,0.971,0.5,0.5]],[[0.6,0,0.828,0,0.5,0.5]],[[0.428,0.27,1,0.27,0.5,0.5]],{"ring":[0.714,0.71,0.229,0.29]}]]],"ㄷ":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄸ":[["ㄸ",[[[0,0,0.394,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.394,1,0.5,0.5]],[[0.581,0,1,0,0.5,0.5]],[[0.581,0,0.581,0.975,0.5,0.5],[0.581,0.975,1,0.975,0.5,0.5]]]]],"ㄹ":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄺ":[["ㄺ",[[[0,0,0.541,0,0.5,0.5],[0.541,0,0.541,0.486,0.5,0.5]],[[0,0.486,0.541,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.541,0.971,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄻ":[["ㄻ",[[[0,0,0.428,0,0.5,0.5],[0.428,0,0.428,0.5,0.5,0.5]],[[0,0.5,0.428,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.428,1,0.5,0.5]],[[0.631,0,0.631,1,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0.631,1,1,1,0.5,0.5]]]]],"ㄼ":[["ㄼ",[[[0,0.029,0.413,0.029,0.5,0.5],[0.413,0.029,0.413,0.514,0.5,0.5]],[[0,0.514,0.413,0.514,0.5,0.5]],[[0,0.514,0,1,0.5,0.5],[0,1,0.413,1,0.5,0.5]],[[0.617,0,0.617,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.617,0.46,1,0.46,0,0]],[[0.617,1,1,1,0.5,0.5]]]]],"ㄽ":[["ㄽ",[[[0,0,0.383,0,0.5,0.5],[0.383,0,0.383,0.486,0.5,0.5]],[[0,0.486,0.383,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.383,0.971,0.5,0.5]],[[0.757,0,0.515,1,0.3,0]],[[0.675,0.34,1,1,0,0]]]]],"ㄾ":[["ㄾ",[[[0,0,0.421,0,0.5,0.5],[0.421,0,0.421,0.5,0.5,0.5]],[[0,0.5,0.421,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.421,1,0.5,0.5]],[[0.622,0,1,0,0.5,0.5]],[[0.622,0.5,0.977,0.5,0,0.5]],[[0.622,0,0.622,1,0.5,0.5],[0.622,1,1,1,0.5,0.5]]]]],"ㄿ":[["ㄿ",[[[0,0,0.376,0,0.5,0.5],[0.376,0,0.376,0.5,0.5,0.5]],[[0,0.5,0.376,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.376,1,0.5,0.5]],[[0.542,0,1,0,0.5,0.5]],[[0.666,0,0.666,1,0,0]],[[0.876,0,0.876,1,0,0]],[[0.542,1,1,1,0.5,0.5]]]]],"ㅀ":[["ㅀ",[[[0,0.125,0.407,0.125,0.5,0.5],[0.407,0.125,0.407,0.537,0.5,0.5]],[[0,0.537,0.407,0.537,0.5,0.5]],[[0,0.537,0,0.949,0.5,0.5],[0,0.949,0.407,0.949,0.5,0.5]],[[0.67,0,0.859,0,0.5,0.5]],[[0.529,0.27,1,0.27,0.5,0.5]],{"ring":[0.764,0.71,0.189,0.29]}]]],"ㅁ":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ㅂ":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅃ":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.376,0,0.376,1,0.5,0.5]],[[0,0.46,0.376,0.46,0,0]],[[0,1,0.376,1,0.5,0.5]],[[0.624,0,0.624,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.624,0.46,1,0.46,0,0]],[[0.624,1,1,1,0.5,0.5]]]]],"ㅄ":[["ㅄ",[[[0,0.029,0,1,0.5,0.5]],[[0.357,0.029,0.357,1,0.5,0.5]],[[0,0.475,0.357,0.475,0,0]],[[0,1,0.357,1,0.5,0.5]],[[0.751,0,0.502,1,0.3,0]],[[0.667,0.34,1,1,0,0]]]]],"ㅅ":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ㅆ":[["ㅆ",[[[0.223,0.033,0,0.967,0.3,0]],[[0.147,0.351,0.446,0.967,0,0]],[[0.742,0,0.483,1,0.3,0]],[[0.654,0.34,1,1,0,0]]]]],"ㅇ":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ㅈ":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ㅉ":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,1,0.3,0]],[[0.147,0.34,0.445,1,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,1,0.3,0]],[[0.68,0.34,1,1,0,0]]]]],"ㅊ":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ㅋ":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ㅌ":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㅍ":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅎ":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ㅏ":[["ㅏ",[[[0,0,0,1,0.5,0.5]],[[0,0.43,1,0.43,0,0.5]]]]],"ㅐ":[["ㅐ",[[[0,0,0,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅑ":[["ㅑ",[[[0,0,0,1,0.5,0.5]],[[0,0.29,1,0.29,0,0.5]],[[0,0.59,1,0.59,0,0.5]]]]],"ㅒ":[["ㅒ",[[[0,0,0,1,0.5,0.5]],[[0,0.3,1,0.3,0,0]],[[0,0.58,1,0.58,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅓ":[["ㅓ",[[[0,0.42,1,0.42,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅔ":[["ㅔ",[[[0,0.401,0.348,0.401,0.5,0]],[[0.348,0.01,0.348,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ㅕ":[["ㅕ",[[[0,0.27,1,0.27,0.5,0]],[[0,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅖ":[["ㅖ",[[[0.139,0.261,0.386,0.261,0.5,0]],[[0.139,0.55,0.386,0.55,0.5,0]],[[0.386,0.01,0.386,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ㅗ":[["ㅗ",[[[0.44,0,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅘ":[["ㅘ",[[[0.289,0.423,0.289,0.755,0.5,0]],[[0,0.755,0.643,0.755,0.5,0.5]],[[0.809,0,0.809,1,0.5,0.5]],[[0.809,0.43,1,0.43,0,0.5]]]]],"ㅙ":[["ㅙ",[[[0.255,0.443,0.255,0.745,0.5,0]],[[0,0.745,0.567,0.745,0.5,0.5]],[[0.729,0,0.729,1,0.5,0.5]],[[0.729,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅚ":[["ㅚ",[[[0.352,0.443,0.352,0.765,0.5,0]],[[0,0.765,0.782,0.765,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅛ":[["ㅛ",[[[0.3,0,0.3,1,0.5,0]],[[0.58,0,0.58,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅜ":[["ㅜ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0.5,1,0,0.5]]]]],"ㅝ":[["ㅝ",[[[0,0.511,0.775,0.511,0.5,0.5]],[[0.372,0.511,0.372,0.941,0,0.5]],[[0.695,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅞ":[["ㅞ",[[[0,0.501,0.579,0.501,0.5,0.5]],[[0.278,0.501,0.278,0.912,0,0.5]],[[0.525,0.554,0.749,0.554,0.5,0]],[[0.749,0.02,0.749,0.941,0.5,0.5]],[[0.996,0,0.996,1,0.5,0.5]]]]],"ㅟ":[["ㅟ",[[[0,0.541,0.797,0.541,0.5,0.5]],[[0.383,0.541,0.383,0.961,0,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅠ":[["ㅠ",[[[0,0,1,0,0.5,0.5]],[[0.3,0,0.3,1,0,0.5]],[[0.69,0,0.69,1,0,0.5]]]]],"ㅡ":[["ㅡ",[[[0,0.5,1,0.5,0.5,0.5]]]]],"ㅢ":[["ㅢ",[[[0,0.721,0.782,0.721,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅣ":[["ㅣ",[[[0.5,0,0.5,1,0.5,0.5]]]]],"고":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.497,0.5,0.5]]]],["ㅗ",[[[0.44,0.645,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"구":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.476,0.5,0.5]]]],["ㅜ",[[[0,0.618,1,0.618,0.5,0.5]],[[0.5,0.618,0.5,1,0,0.5]]]]],"그":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.771,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"꼬":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.483,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.483,0.5,0.5]]]],["ㅗ",[[[0.44,0.635,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"꾸":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.462,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.462,0.5,0.5]]]],["ㅜ",[[[0,0.607,1,0.607,0.5,0.5]],[[0.5,0.607,0.5,1,0,0.5]]]]],"끄":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.761,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.761,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"노":[["ㄴ",[[[0.142,0,0.142,0.395,0.5,0.5],[0.142,0.395,0.869,0.395,0.5,0.5]]]],["ㅗ",[[[0.44,0.573,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"누":[["ㄴ",[[[0.142,0,0.142,0.375,0.5,0.5],[0.142,0.375,0.869,0.375,0.5,0.5]]]],["ㅜ",[[[0,0.544,1,0.544,0.5,0.5]],[[0.5,0.544,0.5,1,0,0.5]]]]],"느":[["ㄴ",[[[0.142,0,0.142,0.69,0.5,0.5],[0.142,0.69,0.869,0.69,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"도":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.437,0.5,0.5],[0.142,0.437,0.869,0.437,0.5,0.5]]]],["ㅗ",[[[0.44,0.603,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"두":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.416,0.5,0.5],[0.142,0.416,0.869,0.416,0.5,0.5]]]],["ㅜ",[[[0,0.574,1,0.574,0.5,0.5]],[[0.5,0.574,0.5,1,0,0.5]]]]],"드":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.725,0.5,0.5],[0.142,0.725,0.869,0.725,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"또":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.425,0.5,0.5],[0.098,0.425,0.423,0.425,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.415,0.5,0.5],[0.577,0.415,0.923,0.415,0.5,0.5]]]],["ㅗ",[[[0.44,0.594,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"뚜":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.405,0.5,0.5],[0.098,0.405,0.423,0.405,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.395,0.5,0.5],[0.577,0.395,0.923,0.395,0.5,0.5]]]],["ㅜ",[[[0,0.566,1,0.566,0.5,0.5]],[[0.5,0.566,0.5,1,0,0.5]]]]],"뜨":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.716,0.5,0.5],[0.098,0.716,0.423,0.716,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.698,0.5,0.5],[0.577,0.698,0.923,0.698,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"로":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.237,0.5,0.5]],[[0.131,0.237,0.891,0.237,0.5,0.5]],[[0.131,0.237,0.131,0.474,0.5,0.5],[0.131,0.474,0.891,0.474,0.5,0.5]]]],["ㅗ",[[[0.44,0.629,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"루":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.226,0.5,0.5]],[[0.131,0.226,0.891,0.226,0.5,0.5]],[[0.131,0.226,0.131,0.453,0.5,0.5],[0.131,0.453,0.891,0.453,0.5,0.5]]]],["ㅜ",[[[0,0.601,1,0.601,0.5,0.5]],[[0.5,0.601,0.5,1,0,0.5]]]]],"르":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.377,0.5,0.5]],[[0.131,0.377,0.891,0.377,0.5,0.5]],[[0.131,0.377,0.131,0.754,0.5,0.5],[0.131,0.754,0.891,0.754,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"모":[["ㅁ",[[[0.142,0,0.142,0.431,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.431,0.5,0.5]],[[0.142,0.431,0.859,0.431,0.5,0.5]]]],["ㅗ",[[[0.44,0.599,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"무":[["ㅁ",[[[0.142,0,0.142,0.411,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.411,0.5,0.5]],[[0.142,0.411,0.859,0.411,0.5,0.5]]]],["ㅜ",[[[0,0.57,1,0.57,0.5,0.5]],[[0.5,0.57,0.5,1,0,0.5]]]]],"므":[["ㅁ",[[[0.142,0,0.142,0.72,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.72,0.5,0.5]],[[0.142,0.72,0.859,0.72,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"보":[["ㅂ",[[[0.131,0,0.131,0.454,0.5,0.5]],[[0.859,0,0.859,0.454,0.5,0.5]],[[0.131,0.209,0.859,0.209,0,0]],[[0.131,0.454,0.859,0.454,0.5,0.5]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"부":[["ㅂ",[[[0.131,0,0.131,0.433,0.5,0.5]],[[0.859,0,0.859,0.433,0.5,0.5]],[[0.131,0.199,0.859,0.199,0,0]],[[0.131,0.433,0.859,0.433,0.5,0.5]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"브":[["ㅂ",[[[0.131,0,0.131,0.738,0.5,0.5]],[[0.859,0,0.859,0.738,0.5,0.5]],[[0.131,0.34,0.859,0.34,0,0]],[[0.131,0.738,0.859,0.738,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"뽀":[["ㅃ",[[[0.098,0,0.098,0.448,0.5,0.5]],[[0.4,0,0.4,0.448,0.5,0.5]],[[0.098,0.206,0.4,0.206,0,0]],[[0.098,0.448,0.4,0.448,0.5,0.5]],[[0.6,0,0.6,0.448,0.5,0.5]],[[0.902,0,0.902,0.448,0.5,0.5]],[[0.6,0.206,0.902,0.206,0,0]],[[0.6,0.448,0.902,0.448,0.5,0.5]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"뿌":[["ㅃ",[[[0.098,0,0.098,0.427,0.5,0.5]],[[0.4,0,0.4,0.427,0.5,0.5]],[[0.098,0.197,0.4,0.197,0,0]],[[0.098,0.427,0.4,0.427,0.5,0.5]],[[0.6,0,0.6,0.427,0.5,0.5]],[[0.902,0,0.902,0.427,0.5,0.5]],[[0.6,0.197,0.902,0.197,0,0]],[[0.6,0.427,0.902,0.427,0.5,0.5]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"쁘":[["ㅃ",[[[0.098,0,0.098,0.734,0.5,0.5]],[[0.4,0,0.4,0.734,0.5,0.5]],[[0.098,0.338,0.4,0.338,0,0]],[[0.098,0.734,0.4,0.734,0.5,0.5]],[[0.6,0,0.6,0.734,0.5,0.5]],[[0.902,0,0.902,0.734,0.5,0.5]],[[0.6,0.338,0.902,0.338,0,0]],[[0.6,0.734,0.902,0.734,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"소":[["ㅅ",[[[0.5,0,0.043,0.454,0.3,0]],[[0.345,0.154,0.957,0.454,0,0]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"수":[["ㅅ",[[[0.5,0,0.043,0.433,0.3,0]],[[0.345,0.147,0.957,0.433,0,0]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"스":[["ㅅ",[[[0.5,0,0.043,0.738,0.3,0]],[[0.345,0.251,0.957,0.738,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"쏘":[["ㅆ",[[[0.228,0.01,0.022,0.459,0.3,0]],[[0.158,0.163,0.434,0.459,0,0]],[[0.745,0,0.512,0.459,0.3,0]],[[0.666,0.156,0.978,0.459,0,0]]]],["ㅗ",[[[0.44,0.618,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쑤":[["ㅆ",[[[0.228,0.009,0.022,0.438,0.3,0]],[[0.158,0.155,0.434,0.438,0,0]],[[0.745,0,0.512,0.438,0.3,0]],[[0.666,0.149,0.978,0.438,0,0]]]],["ㅜ",[[[0,0.59,1,0.59,0.5,0.5]],[[0.5,0.59,0.5,1,0,0.5]]]]],"쓰":[["ㅆ",[[[0.228,0.016,0.022,0.743,0.3,0]],[[0.158,0.263,0.434,0.743,0,0]],[[0.745,0,0.512,0.743,0.3,0]],[[0.666,0.253,0.978,0.743,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"오":[["ㅇ",[{"ring":[0.5,0.227,0.391,0.227]}]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"우":[["ㅇ",[{"ring":[0.5,0.216,0.391,0.216]}]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"으":[["ㅇ",[{"ring":[0.5,0.369,0.391,0.369]}]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"조":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.453,0.3,0]],[[0.345,0.154,0.957,0.453,0,0]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"주":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.432,0.3,0]],[[0.345,0.147,0.957,0.432,0,0]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"즈":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.738,0.3,0]],[[0.345,0.251,0.957,0.738,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"쪼":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.448,0.3,0]],[[0.147,0.152,0.445,0.448,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.448,0.3,0]],[[0.68,0.152,1,0.448,0,0]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쭈":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.427,0.3,0]],[[0.147,0.145,0.445,0.427,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.427,0.3,0]],[[0.68,0.145,1,0.427,0,0]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"쯔":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.734,0.3,0]],[[0.147,0.25,0.445,0.734,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.734,0.3,0]],[[0.68,0.25,1,0.734,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"초":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.137,0.946,0.137,0.5,0.5]],[[0.5,0.137,0.054,0.506,0,0]],[[0.348,0.262,0.946,0.506,0,0]]]],["ㅗ",[[[0.44,0.652,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"추":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.131,0.946,0.131,0.5,0.5]],[[0.5,0.131,0.054,0.485,0,0]],[[0.348,0.251,0.946,0.485,0,0]]]],["ㅜ",[[[0,0.624,1,0.624,0.5,0.5]],[[0.5,0.624,0.5,1,0,0.5]]]]],"츠":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.21,0.946,0.21,0.5,0.5]],[[0.5,0.21,0.054,0.777,0,0]],[[0.348,0.403,0.946,0.777,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"코":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.515,0.5,0.5]],[[0.098,0.247,0.859,0.247,0.5,0]]]],["ㅗ",[[[0.44,0.657,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쿠":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.493,0.5,0.5]],[[0.098,0.237,0.859,0.237,0.5,0]]]],["ㅜ",[[[0,0.63,1,0.63,0.5,0.5]],[[0.5,0.63,0.5,1,0,0.5]]]]],"크":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.783,0.5,0.5]],[[0.098,0.376,0.859,0.376,0.5,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"토":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.232,0.825,0.232,0,0.5]],[[0.131,0,0.131,0.464,0.5,0.5],[0.131,0.464,0.869,0.464,0.5,0.5]]]],["ㅗ",[[[0.44,0.621,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"투":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.221,0.825,0.221,0,0.5]],[[0.131,0,0.131,0.443,0.5,0.5],[0.131,0.443,0.869,0.443,0.5,0.5]]]],["ㅜ",[[[0,0.593,1,0.593,0.5,0.5]],[[0.5,0.593,0.5,1,0,0.5]]]]],"트":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.373,0.825,0.373,0,0.5]],[[0.131,0,0.131,0.746,0.5,0.5],[0.131,0.746,0.869,0.746,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"포":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.448,0,0]],[[0.677,0,0.677,0.448,0,0]],[[0.098,0.448,0.891,0.448,0.5,0.5]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"푸":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.427,0,0]],[[0.677,0,0.677,0.427,0,0]],[[0.098,0.427,0.891,0.427,0.5,0.5]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"프":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.734,0,0]],[[0.677,0,0.677,0.734,0,0]],[[0.098,0.734,0.891,0.734,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"호":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.14,0.923,0.14,0.5,0.5]],{"ring":[0.494,0.368,0.343,0.15]}]],["ㅗ",[[[0.44,0.66,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"후":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.134,0.923,0.134,0.5,0.5]],{"ring":[0.494,0.353,0.343,0.144]}]],["ㅜ",[[[0,0.633,1,0.633,0.5,0.5]],[[0.5,0.633,0.5,1,0,0.5]]]]],"흐":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.212,0.923,0.212,0.5,0.5]],{"ring":[0.494,0.558,0.343,0.228]}]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]]};
  /* END GENERATED skeletons */

  /* 초성이 가로 모음 위에 앉는가 — 가로 모음(bottom)과 합자 모음(split-right, 과·워·의의 초성은 ㅗ·ㅜ·ㅡ 위)이다 */
  function overBar(node) {
    /* 세벌 고정은 초성 그림 문맥을 프로파일이 하나로 정한다(data-fy-draw) — 모음 짜임을 보지 않는다 */
    var draw = typeof node.getAttribute === "function" ? node.getAttribute("data-fy-draw") : null;
    if (draw) {
      return draw === "bar";
    }
    var glyph = typeof node.closest === "function" ? node.closest('[part~="glyph"]') : null;
    return Boolean(glyph && /^(?:bottom|split)/.test(glyph.getAttribute("data-layout-key") || ""));
  }

  function skeletonFor(node, text) {
    var code = text.charCodeAt(0);
    if (text.length === 1 && code >= 0x1100 && code <= 0x1112) {
      return SKELETONS[text + (overBar(node) ? "@bar" : "@cho")] || null;
    }
    return SKELETONS[text] || null;
  }

  /* BEGIN GENERATED recipes: scripts/build_jamo_recipes.js from spec/jamo-recipes.json — do not edit by hand. */
  /* 그림 제작 안내(ADR-025 §7, spec/authoring-stages.json): 원형 8 → 기본 24 → 확장 40. ㆍ는 보조 원본 */
  var AUTHORING_STAGES = {"origin8":"ㄱㄴㅁㅅㅇㆍㅡㅣ","basic24":"ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ","full40":"ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ","helper":"ㆍ"};
  /* 조립식(ADR-025 §5): id → { target, operation, parts }. 조각은 다른 자모(jamo) 또는 나머지 획(strokes: "rest") */
  var JAMO_RECIPES = {"double-giyeok":{"id":"double-giyeok","target":"ㄲ","operation":"double","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㄱ"}]},"double-digeut":{"id":"double-digeut","target":"ㄸ","operation":"double","parts":[{"id":"left","jamo":"ㄷ"},{"id":"right","jamo":"ㄷ"}]},"double-bieup":{"id":"double-bieup","target":"ㅃ","operation":"double","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅂ"}]},"double-siot":{"id":"double-siot","target":"ㅆ","operation":"double","parts":[{"id":"left","jamo":"ㅅ"},{"id":"right","jamo":"ㅅ"}]},"double-jieut":{"id":"double-jieut","target":"ㅉ","operation":"double","parts":[{"id":"left","jamo":"ㅈ"},{"id":"right","jamo":"ㅈ"}]},"final-giyeok-siot":{"id":"final-giyeok-siot","target":"ㄳ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㅅ"}]},"final-nieun-jieut":{"id":"final-nieun-jieut","target":"ㄵ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅈ"}]},"final-nieun-hieut":{"id":"final-nieun-hieut","target":"ㄶ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅎ"}]},"final-rieul-giyeok":{"id":"final-rieul-giyeok","target":"ㄺ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㄱ"}]},"final-rieul-mieum":{"id":"final-rieul-mieum","target":"ㄻ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅁ"}]},"final-rieul-bieup":{"id":"final-rieul-bieup","target":"ㄼ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅂ"}]},"final-rieul-siot":{"id":"final-rieul-siot","target":"ㄽ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅅ"}]},"final-rieul-tieut":{"id":"final-rieul-tieut","target":"ㄾ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅌ"}]},"final-rieul-pieup":{"id":"final-rieul-pieup","target":"ㄿ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅍ"}]},"final-rieul-hieut":{"id":"final-rieul-hieut","target":"ㅀ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅎ"}]},"final-bieup-siot":{"id":"final-bieup-siot","target":"ㅄ","operation":"final-pair","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅅ"}]},"vowel-ae":{"id":"vowel-ae","target":"ㅐ","operation":"compose","parts":[{"id":"left","jamo":"ㅏ"},{"id":"right","jamo":"ㅣ"}]},"vowel-yae":{"id":"vowel-yae","target":"ㅒ","operation":"compose","parts":[{"id":"left","jamo":"ㅑ"},{"id":"right","jamo":"ㅣ"}]},"vowel-e":{"id":"vowel-e","target":"ㅔ","operation":"compose","parts":[{"id":"left","jamo":"ㅓ"},{"id":"right","jamo":"ㅣ"}]},"vowel-ye":{"id":"vowel-ye","target":"ㅖ","operation":"compose","parts":[{"id":"left","jamo":"ㅕ"},{"id":"right","jamo":"ㅣ"}]},"vowel-wa":{"id":"vowel-wa","target":"ㅘ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅏ"}]},"vowel-wae":{"id":"vowel-wae","target":"ㅙ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅐ"}]},"vowel-oe":{"id":"vowel-oe","target":"ㅚ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅣ"}]},"vowel-wo":{"id":"vowel-wo","target":"ㅝ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅓ"}]},"vowel-we":{"id":"vowel-we","target":"ㅞ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅔ"}]},"vowel-wi":{"id":"vowel-wi","target":"ㅟ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅣ"}]},"vowel-ui":{"id":"vowel-ui","target":"ㅢ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅡ"},{"id":"vertical","jamo":"ㅣ"}]},"kieuk-added":{"id":"kieuk-added","target":"ㅋ","operation":"add","parts":[{"id":"base","jamo":"ㄱ"},{"id":"added","strokes":"rest"}]},"digeut-added":{"id":"digeut-added","target":"ㄷ","operation":"add","parts":[{"id":"base","jamo":"ㄴ"},{"id":"added","strokes":"rest"}]},"tieut-added":{"id":"tieut-added","target":"ㅌ","operation":"add","parts":[{"id":"base","jamo":"ㄷ"},{"id":"added","strokes":"rest"}]},"jieut-added":{"id":"jieut-added","target":"ㅈ","operation":"add","parts":[{"id":"base","jamo":"ㅅ"},{"id":"added","strokes":"rest"}]},"chieut-added":{"id":"chieut-added","target":"ㅊ","operation":"add","parts":[{"id":"base","jamo":"ㅈ"},{"id":"added","strokes":"rest"}]},"yeorinhieut-added":{"id":"yeorinhieut-added","target":"ㆆ","operation":"add","parts":[{"id":"base","jamo":"ㅇ"},{"id":"added","strokes":"rest"}]},"hieut-added":{"id":"hieut-added","target":"ㅎ","operation":"add","parts":[{"id":"base","jamo":"ㆆ"},{"id":"added","strokes":"rest"}]},"hieut-circle-o":{"id":"hieut-circle-o","target":"ㅎ","operation":"place","parts":[{"id":"top","jamo":"ㅗ","at":{"strokes":[0,1]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":[2]}}]},"hieut-added-lines":{"id":"hieut-added-lines","target":"ㅎ","operation":"place","parts":[{"id":"cap","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"bar","jamo":"ㅡ","at":{"strokes":[1]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":[2]}}]},"rieul-lines":{"id":"rieul-lines","target":"ㄹ","operation":"place","parts":[{"id":"h1","jamo":"ㅡ","at":{"segments":[[0,0]]}},{"id":"v1","jamo":"ㅣ","at":{"segments":[[0,1]]}},{"id":"h2","jamo":"ㅡ","at":{"segments":[[1,0]]}},{"id":"v2","jamo":"ㅣ","at":{"segments":[[2,0]]}},{"id":"h3","jamo":"ㅡ","at":{"segments":[[2,1]]}}]},"pieup-lines":{"id":"pieup-lines","target":"ㅍ","operation":"place","parts":[{"id":"top","jamo":"ㅡ","at":{"strokes":[0]}},{"id":"left","jamo":"ㅣ","at":{"strokes":[1]}},{"id":"right","jamo":"ㅣ","at":{"strokes":[2]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":[3]}}]},"bieup-lines":{"id":"bieup-lines","target":"ㅂ","operation":"place","parts":[{"id":"left","jamo":"ㅣ","at":{"strokes":[0]}},{"id":"right","jamo":"ㅣ","at":{"strokes":[1]}},{"id":"middle","jamo":"ㅡ","at":{"strokes":[2]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":[3]}}]},"bieup-raised":{"id":"bieup-raised","target":"ㅂ","operation":"place","parts":[{"id":"lower","jamo":"ㅁ","at":{"box":[0,0.46,1,1]}},{"id":"leftExtension","jamo":"ㅣ","at":{"box":[0,0,0,0.46]}},{"id":"rightExtension","jamo":"ㅣ","at":{"box":[1,0,1,0.46]}}]}};
  /* 자모마다 기본 조립식 — 짝·가획 계통(ADR-024 §5)과 선 조립식(ㅎ = ㆍ + ㅡ + ㅇ, ㄹ·ㅂ·ㅍ = ㅡ·ㅣ). 기본 place는 그릴 재료가 있을 때만 */
  var RECIPE_DEFAULTS = {"ㄲ":"double-giyeok","ㄸ":"double-digeut","ㅃ":"double-bieup","ㅆ":"double-siot","ㅉ":"double-jieut","ㄳ":"final-giyeok-siot","ㄵ":"final-nieun-jieut","ㄶ":"final-nieun-hieut","ㄺ":"final-rieul-giyeok","ㄻ":"final-rieul-mieum","ㄼ":"final-rieul-bieup","ㄽ":"final-rieul-siot","ㄾ":"final-rieul-tieut","ㄿ":"final-rieul-pieup","ㅀ":"final-rieul-hieut","ㅄ":"final-bieup-siot","ㅐ":"vowel-ae","ㅒ":"vowel-yae","ㅔ":"vowel-e","ㅖ":"vowel-ye","ㅘ":"vowel-wa","ㅙ":"vowel-wae","ㅚ":"vowel-oe","ㅝ":"vowel-wo","ㅞ":"vowel-we","ㅟ":"vowel-wi","ㅢ":"vowel-ui","ㅋ":"kieuk-added","ㄷ":"digeut-added","ㅌ":"tieut-added","ㅈ":"jieut-added","ㅊ":"chieut-added","ㆆ":"yeorinhieut-added","ㅎ":"hieut-added-lines","ㄹ":"rieul-lines","ㅂ":"bieup-lines","ㅍ":"pieup-lines"};
  /* END GENERATED recipes */

  /* BEGIN GENERATED layouts: scripts/build_layout_profiles.js from spec/layout-profiles.json — do not edit by hand. */
  /* 배치 프로파일(ADR-026): 세벌 고정은 역할 도장(조합용 자모 → [left %, top %, 글자 크기 em, scale-x, scale-y, 역할, font-weight, text-stroke em,
   * 밀도 굵기 계수], 합자 모음은 [ㅗ·ㅜ·ㅡ 조각, 오른쪽 조각] 두 도장), 초성 그림 문맥, 글자 칸(em), 밀도 계수를 셈한 원소 굵기(stroke, em) */
  var LAYOUT_PROFILES = {"sebul-fixed-v1":{"revision":"3","accepts":["1","2"],"model":"fixed-three","match":["jamo","role"],"occurrence":false,"cell":{"width":0.9169,"height":1.2037,"gap":0,"space":0.32},"depth":{"vowel":"split","coda":"whole"},"draw":{"initial":"bar"},"stroke":0.1,"stamps":{"ᄀ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0534,1],"ᄁ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,1],"ᄂ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0534,1],"ᄃ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0529,1],"ᄄ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,1],"ᄅ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0252,0.8125],"ᄆ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0529,1],"ᄇ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0312,0.8527],"ᄈ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,0.725],"ᄉ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0525,1],"ᄊ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄋ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄌ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄍ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0525,1],"ᄎ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0298,0.8489],"ᄏ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0174,0.7579],"ᄐ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0187,0.7665],"ᄑ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.03,0.8426],"ᄒ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0257,0.8186],"ᅡ":[21.9417,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅢ":[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1],"ᅣ":[25.681,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅤ":[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1],"ᅥ":[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅦ":[34.6709,5.1223,0.8342,1.0789,0.9269,"medial",700,0.0135,1],"ᅧ":[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅨ":[35.1737,5.1223,0.824,1.0656,0.9384,"medial",700,0.0159,0.9978],"ᅩ":[2.2846,29.1023,0.7287,1.2333,0.8109,"medial",700,0.0698,1],"ᅪ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[21.9417,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1]],"ᅫ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1]],"ᅬ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅭ":[1.2416,29.5505,0.7173,1.269,0.788,"medial",700,0.0765,1],"ᅮ":[1.2416,19.2839,0.7334,1.2411,0.8057,"medial",700,0.0698,1],"ᅯ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1]],"ᅰ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[34.6709,5.1223,0.8342,1.0789,0.9269,"medial",700,0.0135,1]],"ᅱ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅲ":[2.2846,20.2112,0.7206,1.2472,0.8018,"medial",700,0.0731,1],"ᅳ":[2.2846,-9.1285,1.1331,0.7932,1.0086,"medial",700,0,1],"ᅴ":[[3.9965,-9.1297,0.8505,0.5953,1.3437,"medial",700,0,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅵ":[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1],"ᆨ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0562,1],"ᆩ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.012,1],"ᆪ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0529,1],"ᆫ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0562,1],"ᆬ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0524,1],"ᆭ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.7328],"ᆮ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0557,1],"ᆯ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0182,0.75],"ᆰ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.7308],"ᆱ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆲ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆳ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.016,0.75],"ᆴ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆵ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.75],"ᆶ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.6688],"ᆷ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0557,1],"ᆸ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0183,0.75],"ᆹ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.016,0.75],"ᆺ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0552,1],"ᆻ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆼ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆽ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆾ":[-6.0361,57.0956,0.7808,1.2145,0.8233,"final",700,0.0178,0.75],"ᆿ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0183,0.75],"ᇀ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0184,0.75],"ᇁ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0559,1],"ᇂ":[-6.0361,57.0956,0.7808,1.2145,0.8233,"final",700,0.0179,0.75]}},"square-context-v1":{"revision":"1","accepts":[],"model":"adaptive-square","match":["jamo","role","vowelLayout","hasFinal"],"occurrence":true}};
  var LAYOUT_DEFAULT = "sebul-fixed-v1";
  /* END GENERATED layouts */

  /* 배치 프로파일(ADR-026, 설계 v1.2 §10) — 세벌 고정(fixed-three)은 같은 역할의 같은 자모를 어느 음절에서든 같은 도장(자리·크기·
   * 그림 문맥)으로 찍는다. 받침 자리는 늘 비워 두고, 합자 모음은 고정 조각 둘(ㅘ = ㅗ 조각 + ㅏ 조각), 겹받침은 통짜로 그린다
   * (머리 음절 없음). 네모 문맥
   * (adaptive-square)은 글꼴 CSS의 짜임별 slot 배치를 그대로 쓴다. 배치는 디자인이 고르고(따로 --fy-layout을 두지 않는다),
   * 디자인이 없으면 글꼴을 밝히지 않은 바탕 요소만 기본 세벌 고정을 쓴다. 글꼴을 밝힌 바탕 요소, 배치를 적지 않은 이전 디자인,
   * --fy-design: legacy는 지금 배치를 지킨다 — 이름이 sebul이라고 고정으로 다시 분류하지 않는다(설계 v1.2 L16·L25). */
  function fixedLayout(meta) {
    var profile = meta && meta.layout ? LAYOUT_PROFILES[meta.layout] : null;
    return profile && profile.model === "fixed-three" ? profile : null;
  }

  /* 자모 노드마다 역할 도장을 적는다 — 값은 조합용 자모(역할이 들어 있다) 하나로 정해지고 이웃 자모를 보지 않는다. 합자 모음의
   * 조각은 그 합자 모음의 조각 도장(ㅘ면 ㅗ 조각·ㅏ 조각)을 쓴다 — 조각 글자만 보면 홑모음 ㅗ와 구별되지 않는다. 밀도 굵기
   * 계수(--fy-stamp-density)는 굵기 보정이 노드마다 하는 셈을 미리 한 값이다(strokeDensity). */
  function stampLayout(root, profile) {
    Array.prototype.forEach.call(root.querySelectorAll('[part~="choseong"], [part~="jungseong"], [part~="jongseong"]'), function (node) {
      var stamp = profile.stamps[node.getAttribute("data-jamo")];
      var cluster = node.parentNode && / cluster /.test(" " + (node.parentNode.getAttribute("part") || "") + " ");
      if (cluster) {
        var glyph = node.closest('[part~="glyph"]');
        var code = glyph ? glyph.getAttribute("data-source").charCodeAt(0) - HANGUL_BASE : -1;
        var pieces = code >= 0 ? profile.stamps[HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)]] : null;
        var index = Array.prototype.indexOf.call(node.parentNode.children, node);
        stamp = pieces && Array.isArray(pieces[0]) ? pieces[index] : null;
      }
      if (!stamp) {
        return;
      }
      node.setAttribute("data-fy-stamp", stamp[5]);
      node.style.setProperty("--fy-stamp-left", stamp[0] + "%");
      node.style.setProperty("--fy-stamp-top", stamp[1] + "%");
      node.style.setProperty("--fy-stamp-size", stamp[2] + "em");
      node.style.setProperty("--fy-stamp-scale-x", String(stamp[3]));
      node.style.setProperty("--fy-stamp-scale-y", String(stamp[4]));
      node.style.setProperty("--fy-stamp-weight", String(stamp[6]));
      node.style.setProperty("--fy-stamp-stroke", stamp[7] + "em");
      node.style.setProperty("--fy-stamp-density", String(stamp[8]));
      if (profile.draw[stamp[5]]) {
        node.setAttribute("data-fy-draw", profile.draw[stamp[5]]);
      }
    });
  }

  var PUBLIC_LAYOUT_PROFILES = deepFreeze(JSON.parse(JSON.stringify(LAYOUT_PROFILES)));

  /* FontKku.layoutStability(host) — 세벌 고정이 그려진 결과에서도 지켜지는가(설계 v1.2 L22). 런타임은 역할·자모마다 도장 하나를
   * 적지만, 페이지 CSS가 문맥 선택자(예: [data-layout-key^="bottom"] …)나 !important로 자모 노드를 옮기면 같은 역할·자모가 음절마다
   * 다른 자리에 그려진다. 바탕 요소 안의 도장 노드를 역할·자모(합자 모음 조각은 그 합자 모음과 조각 차례)로 묶어 계산된 자리·크기·
   * 변환이 모두 같은지 본다 — 다르면 stable false와 어긋난 열쇠를 돌려준다. 세벌 고정이 아니면 stable은 null(검사할 약속이 없다). */
  function layoutStability(host) {
    var state = STATE.get(host);
    var meta = state && state.options.fontMeta;
    var profile = fixedLayout(meta);
    if (!profile) {
      return { layout: meta && meta.layout ? meta.layout : null, stable: null, keys: 0, nodes: 0, drifted: [] };
    }
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    var seen = Object.create(null);
    var drifted = [];
    var nodes = 0;
    Array.prototype.forEach.call(host.querySelectorAll("[data-fy-stamp]"), function (node) {
      var parent = node.parentNode;
      var key = node.getAttribute("data-fy-stamp") + " " + node.getAttribute("data-jamo");
      if (parent && / cluster /.test(" " + (parent.getAttribute("part") || "") + " ")) {
        var glyph = node.closest('[part~="glyph"]');
        var code = glyph ? glyph.getAttribute("data-source").charCodeAt(0) - HANGUL_BASE : -1;
        key += "#" + Array.prototype.indexOf.call(parent.children, node) +
          (code >= 0 ? HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)] : "");
      }
      var cs = view ? view.getComputedStyle(node) : null;
      var value = cs ? [cs.top, cs.left, cs.fontSize, cs.transform].join("|") : "";
      nodes += 1;
      if (!(key in seen)) {
        seen[key] = value;
      } else if (seen[key] !== value && drifted.indexOf(key) < 0) {
        drifted.push(key);
      }
    });
    return { layout: meta.layout, stable: drifted.length === 0, keys: Object.keys(seen).length, nodes: nodes, drifted: drifted };
  }

  function strokeCount(jamo) {
    var row = hoekRow(jamo);
    return row ? row.length : 0;
  }

  /* 세트에서 쓸 수 있는 그림 키(문맥 변형이 먼저). allowed는 보이는 자모 칸(null이면 모두) — 원소 그림(@…)은 늘 보인다.
   * 없으면 null. */
  function boxDrawing(set, jamo, context, allowed) {
    if (!set) {
      return null;
    }
    if (jamo.charAt(0) !== "@" && allowed !== null && allowed !== undefined && allowed.indexOf(jamo) < 0) {
      return null;
    }
    var key = context && set.cells[jamo + "@" + context] ? jamo + "@" + context : jamo;
    return set.cells[key] ? key : null;
  }

  /* 디자인(ADR-025 §2) — 팔레트·규칙·조립식 선택을 담은 구조 설정. JSON으로 등록하고(FontKku.registerDesign) CSS가 이름만
   * 고른다(글꼴 --fy-font-design, 페이지 --fy-design). 등록본은 검증한 뒤 고정한다 — 원래 객체를 바꿔도 따라가지 않는다. */
  var DESIGNS = Object.create(null);
  var DESIGN_FACES = { primitive: "element", svg: "svg", font: "device" };
  var DESIGN_METHODS = { auto: true, direct: true, compose: true };
  var DESIGN_ROLES = { initial: true, medial: true, final: true, standalone: true };
  /* 짜임은 지금 이름(right·bottom·split-right). 설계 v1.0의 vertical·horizontal·mixed는 받아서 바꾼다 */
  var DESIGN_LAYOUTS = { right: "right", bottom: "bottom", "split-right": "split-right", vertical: "right", horizontal: "bottom", mixed: "split-right" };
  var DESIGN_FAILURES = { error: true, direct: true, primitive: true };
  /* CSS 전역 키워드와 legacy(디자인 선택을 끊는 예약값)는 디자인 이름이 될 수 없다 */
  var DESIGN_RESERVED = { legacy: true, inherit: true, initial: true, unset: true, revert: true, "revert-layer": true, none: true };
  var DESIGN_SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  /* 디자인을 고른 바탕 요소가 디자인을 받지 못하는 까닭(그림 자소 재료, 표준 잉크 상자를 밝히지 않았거나 끈 글꼴) */
  var DESIGN_UNSUPPORTED = "DESIGN_UNSUPPORTED_FONT";

  /* 표 찾기는 자기 키만 — 디자인 JSON의 값("constructor" 같은)이 Object.prototype을 집지 않게 */
  function own(table, key) {
    return typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function designFail(name, message) {
    return new TypeError("font-kku: design \"" + name + "\" " + message);
  }

  function codedError(error, code, path) {
    error.code = code;
    error.path = path;
    return error;
  }

  /* 검증 규칙은 한 벌이다(normalizeDesign). 규칙이 어긴 곳을 check.fail(code, path, message)로 알리면 registerDesign의
   * 검사(collect 아님)는 바로 던지고 — 첫 오류, TypeError에 code·path — validateDesign의 검사(collect)는 모아 두고 다음 규칙으로
   * 간다. 모으는 쪽에서 오류 하나가 다른 규칙을 잇달아 넘어뜨리지 않게, 틀린 소스도 선언된 이름으로 보고(가리키는 규칙을 다시
   * 탓하지 않는다) 오류가 난 규칙은 충돌 비교에서 뺀다. 던지는 쪽의 첫 오류는 모으는 쪽의 errors[0]과 같다. */
  function designCheck(name, collect) {
    var errors = [];
    var warnings = [];
    return {
      collect: collect,
      errors: errors,
      warnings: warnings,
      fail: function (code, path, message) {
        if (!collect) {
          throw codedError(designFail(name, message), code, path);
        }
        errors.push({ code: code, path: path, message: message });
      },
      /* 받아들이지만 알릴 것(진단) — 던지지 않는다 */
      warn: function (code, path, message) {
        warnings.push({ code: code, path: path, message: message });
      }
    };
  }

  /* 키 차례가 정해진 직렬화 — 같은 내용이면 같은 revision */
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

  function fnv1a(text) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul ? Math.imul(hash, 0x01000193) >>> 0 : (hash * 0x01000193) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  /* 규칙의 apply가 무엇이든 고르는가 — 소스·대체·조립 묶음 가운데 하나라도 */
  function designApplyGiven(apply) {
    return apply.source !== undefined || apply.fallbackSources !== undefined || apply.method !== undefined ||
      apply.recipe !== undefined || apply.bindings !== undefined;
  }

  /* 대체 소스 목록(fallbackSources·fallback.sourceIds) — 배열이고 소스 이름만 */
  function checkSourceList(check, path, list, hasSource) {
    if (!Array.isArray(list)) {
      check.fail("DESIGN_FALLBACK_INVALID", path, path + " lists sources");
      return false;
    }
    var unknown = list.filter(function (id) { return !hasSource(id); });
    if (unknown.length) {
      check.fail("DESIGN_SOURCE_UNKNOWN", path, path + " lists sources (" + unknown.map(function (id) {
        return JSON.stringify(id);
      }).join(", ") + " not in sources)");
      return false;
    }
    return true;
  }

  /* 조각 binding·규칙 적용값 하나: { source, method, recipe, bindings } — 조립식(method/recipe/bindings)은 한 묶음이다.
   * jamo는 이 적용값이 그리는 자모(모르면 null — 조립식 대상 대조를 건너뛴다) */
  function normalizeDesignApply(check, where, apply, jamo, hasSource) {
    var out = { source: null, bundle: null, fallbackSources: null };
    if (!isRecord(apply)) {
      check.fail("DESIGN_APPLY_INVALID", where, where + " must be an object");
      return out;
    }
    if (apply.source !== undefined) {
      if (hasSource(apply.source)) {
        out.source = apply.source;
      } else {
        check.fail("DESIGN_SOURCE_UNKNOWN", where + ".source", where + ".source " + JSON.stringify(apply.source) + " is not in sources");
      }
    }
    if (apply.fallbackSources !== undefined && checkSourceList(check, where + ".fallbackSources", apply.fallbackSources, hasSource)) {
      out.fallbackSources = apply.fallbackSources.slice();
    }
    if (apply.method !== undefined || apply.recipe !== undefined || apply.bindings !== undefined) {
      var method = apply.method === undefined ? "auto" : apply.method;
      if (!own(DESIGN_METHODS, method)) {
        check.fail("DESIGN_METHOD_INVALID", where + ".method", where + ".method is auto, direct or compose");
      }
      var recipe = null;
      if (apply.recipe !== undefined) {
        recipe = own(JAMO_RECIPES, apply.recipe) ? JAMO_RECIPES[apply.recipe] : null;
        if (!recipe) {
          check.fail("DESIGN_RECIPE_INVALID", where + ".recipe", where + ".recipe " + JSON.stringify(apply.recipe) + " is not a jamo recipe");
        } else if (jamo !== null && recipe.target !== jamo) {
          check.fail("DESIGN_RECIPE_INVALID", where + ".recipe", where + ".recipe " + apply.recipe + " builds " + recipe.target + ", not " + jamo);
          recipe = null;
        }
      } else if (method === "compose") {
        check.fail("DESIGN_RECIPE_INVALID", where + ".recipe", where + " composes without a recipe");
      }
      var bindings = null;
      if (apply.bindings !== undefined) {
        if (!recipe) {
          if (apply.recipe === undefined) {
            check.fail("DESIGN_RECIPE_INVALID", where + ".bindings", where + ".bindings needs a recipe");
          }
        } else if (!isRecord(apply.bindings)) {
          check.fail("DESIGN_BINDING_INVALID", where + ".bindings", where + ".bindings maps parts of " + recipe.id + " to values");
        } else {
          bindings = Object.create(null);
          Object.keys(apply.bindings).forEach(function (partId) {
            var part = recipe.parts.filter(function (p) { return p.id === partId && p.jamo; })[0];
            if (!part) {
              check.fail("DESIGN_BINDING_INVALID", where + ".bindings." + partId, where + ".bindings." + partId + " is not a jamo part of " + recipe.id);
              return;
            }
            bindings[partId] = normalizeDesignApply(check, where + ".bindings." + partId, apply.bindings[partId], part.jamo, hasSource);
          });
        }
      }
      if (method === "direct" && (apply.recipe !== undefined || apply.bindings !== undefined)) {
        check.fail("DESIGN_METHOD_INVALID", where + ".method", where + " is direct but names a recipe");
      }
      out.bundle = { method: method, recipe: recipe ? recipe.id : null, bindings: bindings };
    }
    return out;
  }

  /* 디자인은 JSON 데이터다 — 자기를 가리키는 고리(작업실 상태 객체를 그대로 넘긴 경우 등)나 BigInt가 있으면 그 자리를 돌려준다.
   * revision은 입력 전체의 직렬화(stableJson)라 고리를 만나면 스택이 넘친다. 같은 객체를 여러 곳에서 가리키는 것(고리 아님)은 괜찮다 */
  function designDataProblem(value, path, ancestors) {
    if (typeof value === "bigint") {
      return { path: path, message: "is a BigInt" };
    }
    if (!value || typeof value !== "object") {
      return null;
    }
    if (ancestors.indexOf(value) >= 0) {
      return { path: path, message: "refers back to itself" };
    }
    ancestors.push(value);
    var list = Array.isArray(value);
    var keys = list ? value.map(function (item, index) { return index; }) : Object.keys(value);
    var found = null;
    for (var i = 0; i < keys.length && !found; i += 1) {
      found = designDataProblem(value[keys[i]], list ? path + "[" + keys[i] + "]" : (path ? path + "." : "") + keys[i], ancestors);
    }
    ancestors.pop();
    return found;
  }

  /* 디자인 검증·정규화. check가 던지면(registerDesign) 고정한 정규화본, 모으면(validateDesign) null을 돌려준다. */
  function normalizeDesign(name, input, check) {
    if (!isRecord(input)) {
      check.fail("DESIGN_NOT_OBJECT", "", "must be an object");
      return null;
    }
    var data = designDataProblem(input, "", []);
    if (data) {
      check.fail("DESIGN_NOT_OBJECT", data.path, (data.path || "the design") + " " + data.message + " — a design is plain JSON data");
      return null;
    }
    var face = own(DESIGN_FACES, input.mode) ? DESIGN_FACES[input.mode] : null;
    if (!face) {
      check.fail("DESIGN_MODE_INVALID", "mode", "mode is primitive, svg or font");
    }
    var layout = normalizeDesignLayout(input, check);
    var fixed = layout && LAYOUT_PROFILES[layout.profile].model === "fixed-three" ? layout.profile : null;
    var sources = Object.create(null);
    /* 선언된 소스 이름 — 틀린 소스도 이름은 선언된 것이라, 가리키는 쪽을 다시 탓하지 않는다 */
    var declared = Object.create(null);
    var hasSource = function (id) { return typeof id === "string" && declared[id] === true; };
    var sourceIds = input.sources && typeof input.sources === "object" ? Object.keys(input.sources) : [];
    if (!sourceIds.length) {
      check.fail("DESIGN_SOURCES_EMPTY", "sources", "needs at least one source");
    }
    sourceIds.forEach(function (id) {
      declared[id] = true;
    });
    sourceIds.forEach(function (id) {
      var source = input.sources[id];
      var where = "sources." + id;
      if (!DESIGN_SOURCE_ID.test(id) || !source || typeof source !== "object") {
        check.fail("DESIGN_SOURCE_INVALID", where, "source " + JSON.stringify(id) + " is an object under a letter/digit id");
        return;
      }
      if (face && source.kind !== input.mode) {
        check.fail("DESIGN_SOURCE_KIND", where + ".kind", "source " + id + " is " + JSON.stringify(source.kind) + " in a " + input.mode + " design");
        return;
      }
      if (source.kind === "svg") {
        var set = normalizeJamoSetName(source.assetSet);
        if (!set) {
          check.fail("DESIGN_SOURCE_INVALID", where + ".assetSet", "svg source " + id + " names a jamo set in assetSet");
        }
        /* cells: 보이는 자모 칸(미리보기 — 원형 8만 그린 셈 치기 같은). 원소 그림(@…)은 늘 보인다 */
        var cells = null;
        if (source.cells !== undefined) {
          if (!Array.isArray(source.cells) || !source.cells.every(function (cell) { return own(HOEK_TABLE, cell) || cell === DOT_JAMO; })) {
            check.fail("DESIGN_SOURCE_INVALID", where + ".cells", "svg source " + id + " cells lists compatibility jamo");
          } else {
            cells = source.cells.slice();
          }
        }
        sources[id] = { id: id, kind: "svg", set: set, cells: cells };
      } else if (source.kind === "font") {
        if (typeof source.family !== "string" || !source.family.trim()) {
          check.fail("DESIGN_SOURCE_INVALID", where + ".family", "font source " + id + " needs a family");
          return;
        }
        /* weight·style을 주지 않으면 글꼴 CSS(자리마다 굵기 보정)를 그대로 따른다 */
        sources[id] = { id: id, kind: "font", family: source.family.trim(), weight: source.weight || null,
          style: source.style || null, stretch: source.stretch || null };
      } else {
        sources[id] = { id: id, kind: "primitive" };
      }
    });
    var defaults = input.defaults || {};
    if (!hasSource(defaults.source)) {
      check.fail("DESIGN_SOURCE_UNKNOWN", "defaults.source", "defaults.source names a source");
    }
    var defaultMethod = defaults.method === undefined ? "auto" : defaults.method;
    if (defaultMethod !== "auto" && defaultMethod !== "direct") {
      check.fail("DESIGN_METHOD_INVALID", "defaults.method", "defaults.method is auto or direct");
    }
    var roleSources = Object.create(null);
    var roleInput = input.roleSources || {};
    Object.keys(roleInput).forEach(function (role) {
      if (!own(DESIGN_ROLES, role) || !hasSource(roleInput[role])) {
        check.fail(own(DESIGN_ROLES, role) ? "DESIGN_SOURCE_UNKNOWN" : "DESIGN_ROLE_INVALID", "roleSources." + role,
          "roleSources." + role + " names a role (initial, medial, final, standalone) and a source");
        return;
      }
      roleSources[role] = roleInput[role];
    });
    var rulesInput = input.rules || [];
    if (!Array.isArray(rulesInput)) {
      check.fail("DESIGN_RULE_INVALID", "rules", "rules is a list of rules");
      rulesInput = [];
    }
    var seen = Object.create(null);
    var rules = [];
    var ruleIndex = [];
    rulesInput.forEach(function (rule, index) {
      var where = "rules[" + index + "]";
      var before = check.errors.length;
      if (!isRecord(rule)) {
        check.fail("DESIGN_RULE_INVALID", where, where + " must be an object");
        return;
      }
      if (!DESIGN_SOURCE_ID.test(rule.id || "") || seen[rule.id]) {
        check.fail("DESIGN_RULE_ID", where + ".id", where + " needs a unique id");
      } else {
        seen[rule.id] = true;
      }
      var match = rule.match || {};
      var jamo = own(HOEK_TABLE, match.jamo) ? match.jamo : null;
      if (!jamo) {
        check.fail("DESIGN_RULE_MATCH", where + ".match.jamo", where + ".match.jamo is a modern compatibility jamo");
      }
      if (match.role !== undefined && !own(DESIGN_ROLES, match.role)) {
        check.fail("DESIGN_ROLE_INVALID", where + ".match.role", where + ".match.role is initial, medial, final or standalone");
      }
      if (match.vowelLayout !== undefined && !own(DESIGN_LAYOUTS, match.vowelLayout)) {
        check.fail("DESIGN_RULE_MATCH", where + ".match.vowelLayout", where + ".match.vowelLayout is right, bottom or split-right");
      }
      if (match.hasFinal !== undefined && typeof match.hasFinal !== "boolean") {
        check.fail("DESIGN_RULE_MATCH", where + ".match.hasFinal", where + ".match.hasFinal is true or false");
      }
      if ((match.vowelLayout !== undefined || match.hasFinal !== undefined) && match.role === undefined) {
        check.fail("DESIGN_RULE_MATCH", where + ".match.role", where + ".match narrows by layout only with a role");
      }
      /* 세벌 고정은 역할·자모로만 고른다 — 이웃 모음·받침으로 고르는 규칙은 몰래 지우지 않고 등록을 거부한다(설계 v1.2 L08) */
      if (fixed) {
        ["vowelLayout", "hasFinal"].forEach(function (field) {
          if (match[field] !== undefined) {
            check.fail("DESIGN_FIXED_CONTEXT", where + ".match." + field, where + ".match uses " + field + ", but layout " + fixed +
              " is fixed-three and matches jamo and role only");
          }
        });
      }
      var apply = normalizeDesignApply(check, where + ".apply", rule.apply, jamo, hasSource);
      if (isRecord(rule.apply) && !designApplyGiven(rule.apply)) {
        check.fail("DESIGN_RULE_EMPTY", where + ".apply", where + ".apply sets nothing");
      }
      /* 세벌 고정은 합자 모음을 고정 조각 둘(ㅘ = ㅗ 조각 + ㅏ 조각)로 찍는다 — 통짜로 그리라는 규칙은 지킬 수 없어 몰래 조각으로
       * 바꾸지 않고 등록을 거부한다(설계 v1.2 L13). 조각마다 원본을 고르는 조립식 규칙은 그대로 받는다. */
      if (fixed && jamo && FIXED_COMPOUND_MEDIALS.indexOf(jamo) >= 0 && (!match.role || match.role === "medial") &&
          isRecord(rule.apply) && rule.apply.method === "direct") {
        check.fail("DESIGN_FIXED_COMPOUND", where + ".apply.method", where + " draws " + jamo + " whole (direct), but layout " + fixed +
          " stamps compound vowels as fixed pieces — choose sources per piece with its compose recipe, or use square-context-v1");
      }
      if (check.errors.length !== before) {
        return;
      }
      var normalized = {
        id: rule.id,
        jamo: jamo,
        role: match.role || null,
        layout: match.vowelLayout === undefined ? null : DESIGN_LAYOUTS[match.vowelLayout],
        hasFinal: match.hasFinal === undefined ? null : match.hasFinal,
        source: apply.source,
        bundle: apply.bundle,
        fallbackSources: apply.fallbackSources
      };
      normalized.specificity = 1 + (normalized.role ? 1 : 0) + (normalized.layout ? 1 : 0) + (normalized.hasFinal === null ? 0 : 1);
      rules.push(normalized);
      ruleIndex.push(index);
    });
    /* 같은 구체성으로 함께 맞을 수 있는 두 규칙이 같은 필드 묶음에 다른 값을 주면 등록하지 않는다(배열 차례로 이기지 않는다) */
    rules.forEach(function (a, i) {
      rules.slice(i + 1).forEach(function (b, offset) {
        var together = a.jamo === b.jamo && a.specificity === b.specificity &&
          (!a.role || !b.role || a.role === b.role) && (!a.layout || !b.layout || a.layout === b.layout) &&
          (a.hasFinal === null || b.hasFinal === null || a.hasFinal === b.hasFinal);
        if (!together) {
          return;
        }
        var where = "rules[" + ruleIndex[i + 1 + offset] + "]";
        if (a.source && b.source && a.source !== b.source) {
          check.fail("DESIGN_RULE_CONFLICT", where, "rules " + a.id + " and " + b.id + " pick different sources for the same request");
        }
        if (a.bundle && b.bundle && stableJson(a.bundle) !== stableJson(b.bundle)) {
          check.fail("DESIGN_RULE_CONFLICT", where, "rules " + a.id + " and " + b.id + " pick different constructions for the same request");
        }
      });
    });
    var fallback = input.fallback || {};
    var fallbackIds = fallback.sourceIds === undefined ? [] : fallback.sourceIds;
    checkSourceList(check, "fallback.sourceIds", fallbackIds, hasSource);
    var onFailure = fallback.onComposeFailure === undefined ? "error" : fallback.onComposeFailure;
    if (!own(DESIGN_FAILURES, onFailure)) {
      check.fail("DESIGN_FALLBACK_INVALID", "fallback.onComposeFailure", "fallback.onComposeFailure is error, direct or primitive");
    }
    if (check.collect) {
      return null;
    }
    var json = stableJson(input);
    return deepFreeze({
      name: name,
      revision: fnv1a(json),
      mode: input.mode,
      face: face,
      layout: layout,
      sources: sources,
      defaults: { source: defaults.source, method: defaultMethod },
      roleSources: roleSources,
      rules: rules,
      fallback: { sourceIds: fallbackIds.slice(), allowPrimitive: fallback.allowPrimitive !== false, onComposeFailure: onFailure }
    });
  }

  /* 배치(ADR-026) — 1.2 디자인은 등록된 프로파일과 revision을 적어야 한다. 적지 않은 1.0·1.1 디자인은 지금 배치로 그린다(null).
   * revision이 다르면 거부한다 — 다만 프로파일이 받는다고 적은 이전 revision(accepts)은 받아 지금 도장으로 그리고 진단
   * DESIGN_LAYOUT_REVISION_ACCEPTED를 남긴다(validateDesign의 warnings, 등록 때 콘솔 경고 한 번, fontInfo(host).layout.requested).
   * 세벌 고정 revision 1의 도장은 받침이 떨어지고 줄끼리 부딪혀 읽히지 않았다(2026-10-13) — 그 좌표를 지키는 것보다 이미 저장된
   * 디자인이 새 판에서 등록되는 것이 낫다. 세벌 고정은 자리마다 달라지는 변주도 받지 않는다(L09).
   * 모으는 검사에서 revision만 틀렸으면 그 프로파일로 규칙을 마저 본다. */
  var DESIGN_VERSIONS = { "1.0": true, "1.1": true, "1.2": true };
  var FIXED_COMPOUND_MEDIALS = "ㅘㅙㅚㅝㅞㅟㅢ";

  function normalizeDesignLayout(input, check) {
    if (input.version !== undefined && !own(DESIGN_VERSIONS, input.version)) {
      check.fail("DESIGN_VERSION_INVALID", "version", "version is 1.0, 1.1 or 1.2");
    }
    if (input.layout === undefined) {
      if (input.version === "1.2") {
        check.fail("DESIGN_LAYOUT_MISSING", "layout", "a 1.2 design names its layout { profile, revision }");
      }
      return null;
    }
    var layout = input.layout;
    var profile = isRecord(layout) && own(LAYOUT_PROFILES, layout.profile) ? LAYOUT_PROFILES[layout.profile] : null;
    if (!profile) {
      check.fail("DESIGN_LAYOUT_UNKNOWN", isRecord(layout) ? "layout.profile" : "layout",
        "layout.profile names a layout profile (" + Object.keys(LAYOUT_PROFILES).join(", ") + ")");
      return null;
    }
    var requested = null;
    if (layout.revision !== profile.revision) {
      if (typeof layout.revision === "string" && profile.accepts.indexOf(layout.revision) >= 0) {
        requested = layout.revision;
        check.warn("DESIGN_LAYOUT_REVISION_ACCEPTED", "layout.revision", "layout " + layout.profile + " revision " +
          JSON.stringify(layout.revision) + " is drawn with revision " + JSON.stringify(profile.revision) + " stamps — save the design with revision " +
          JSON.stringify(profile.revision));
      } else {
        check.fail("DESIGN_LAYOUT_REVISION", "layout.revision", "layout " + layout.profile + " has revision " + JSON.stringify(profile.revision) +
          ", not " + JSON.stringify(layout.revision));
      }
    }
    if (!profile.occurrence && isRecord(input.display) && input.display.variationScope === "occurrence") {
      check.fail("DESIGN_FIXED_VARIATION", "display.variationScope", "layout " + layout.profile +
        " is fixed-three and takes no per-occurrence variation (display.variationScope)");
    }
    return requested ? { profile: layout.profile, revision: profile.revision, requested: requested } :
      { profile: layout.profile, revision: profile.revision };
  }

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  function designName(name) {
    var normalized = normalizeJamoSetName(name);
    if (!normalized || own(DESIGN_RESERVED, normalized)) {
      throw codedError(new TypeError("font-kku: a design name is lowercase letters, digits and '-', not legacy or a CSS keyword (got " +
        JSON.stringify(name) + ")"), "DESIGN_NAME_INVALID", "");
    }
    return normalized;
  }

  /* FontKku.validateDesign(design) — registerDesign과 같은 규칙으로 디자인 JSON을 검사해 오류를 모두 돌려준다(던지지 않고, 등록하지
   * 않는다): { ok, errors: [{ code, path, message }] }. 차례는 registerDesign이 보는 차례 — errors[0]이 registerDesign이 던질 오류다.
   * 이름 문법·같은 이름 충돌은 등록의 일이라 보지 않는다. */
  function validateDesign(design) {
    var check = designCheck("", true);
    normalizeDesign("", design, check);
    return { ok: check.errors.length === 0, errors: check.errors.slice(), warnings: check.warnings.slice() };
  }

  /* FontKku.registerDesign(name, design, options) — 이름은 자모 세트 이름과 같은 문법. 검증에 걸리면 첫 오류를 던진다(TypeError에
   * code·path — validateDesign의 errors[0]). 같은 이름·같은 내용은 그대로 통과하고, 다른 내용은 덮어쓰지 않는다(DESIGN_NAME_TAKEN) —
   * 이름을 맡은 쪽만 options.replace: true로 바꾼다. 등록·교체하면 그 이름을 고른 바탕 요소가 다시 그린다. { name, revision }. */
  function registerDesign(name, design, options) {
    var registered = designName(name);
    var check = designCheck(registered, false);
    var normalized = normalizeDesign(registered, design, check);
    var result = { name: registered, revision: normalized.revision };
    if (check.warnings.length) {
      result.warnings = check.warnings.slice();
    }
    var existing = DESIGNS[registered];
    if (existing) {
      if (existing.revision === normalized.revision) {
        return result;
      }
      if (!(options && options.replace === true)) {
        throw codedError(designFail(registered, "is already registered with other content — register it with { replace: true } to replace it"),
          "DESIGN_NAME_TAKEN", "");
      }
    }
    DESIGNS[registered] = normalized;
    check.warnings.forEach(function (warning) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(designFail(registered, warning.message).message);
      }
    });
    rerenderDesignHosts(registered);
    return result;
  }

  /* FontKku.unregisterDesign(name) — 등록을 지운다. 그 이름을 고른 바탕 요소는 다시 그려 미등록(DESIGN_NOT_REGISTERED)이 되고,
   * 같은 이름을 다시 등록하면 다시 그린다. 지운 것이 있으면 true, 없던 이름이면 false. */
  function unregisterDesign(name) {
    var registered = designName(name);
    if (!DESIGNS[registered]) {
      return false;
    }
    delete DESIGNS[registered];
    rerenderDesignHosts(registered);
    return true;
  }

  /* FontKku.designs() — 등록된 디자인 이름(등록한 차례, jamoSets처럼 새 배열). 지운 이름은 빠진다 */
  function designs() {
    return Object.keys(DESIGNS);
  }

  /* 그 이름을 고른 바탕 요소(등록됐든 미등록 진단이든)를 다시 그린다. 디자인을 받지 않는 바탕 요소는 이름을 들고 있지 않다. */
  function rerenderDesignHosts(name) {
    var jobs = [];
    forEachRegistered(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected && state.options.fontMeta && state.options.fontMeta.design === name) {
        jobs.push(createRenderJob(host, undefined, "restyle", { keepSeed: true }));
      }
    });
    if (jobs.length) {
      runRenderJobs(jobs);
    }
  }

  /* 그림 제작 안내(ADR-025 §7) — 원형 8 → 기본 24 → 확장 40은 렌더러나 깊이가 아니라 작업실의 제작 목표다. 두 도우미:
   * stagePreview는 같은 세트를 덜 그린 셈 치는 디자인 JSON(등록하지 않는다), authoringProgress는 세트가 단계마다 무엇을 그렸는지. */
  var PREVIEW_STAGES = { full40: true, basic24: true, origin8: true, elements: true };

  /* FontKku.stagePreview(set, stage) — stage: full40(모두) · basic24 · origin8 · elements(원소 그림 @…만). 보이는 칸(cells)만 줄인다 —
   * 그림이 없는 ㅎ·ㄹ·ㅂ·ㅍ은 기본 조립식(ㆍ + ㅡ + ㅇ, ㅡ·ㅣ 선)이 만들어 그 단계까지 그린 실제 세트와 같다. */
  function stagePreview(setName, stage) {
    var name = normalizeJamoSetName(setName);
    if (!name) {
      throw new TypeError("font-kku: stagePreview needs a jamo set name (got " + JSON.stringify(setName) + ")");
    }
    if (!PREVIEW_STAGES[stage]) {
      throw new TypeError("font-kku: stage is full40, basic24, origin8 or elements (got " + JSON.stringify(stage) + ")");
    }
    var source = { kind: "svg", assetSet: name };
    if (stage !== "full40") {
      source.cells = stage === "elements" ? [] : AUTHORING_STAGES[stage].split("");
    }
    return { mode: "svg", sources: { s: source }, defaults: { source: "s", method: "auto" } };
  }

  /* FontKku.authoringProgress(set | cellKeys) — 단계마다 그린 자모(have)·남은 자모(missing)·그 단계 밖에 그린 것(extra). 원형 8에서
   * 빠진 ㄹ을 그렸으면 지우지 않고 extra로 센다. ㆍ는 보조 원본이라 따로(helper) — 원소 그림 @dot은 직접 그린 ㆍ로 세지 않는다. */
  function authoringProgress(target) {
    var keys;
    if (Array.isArray(target)) {
      keys = target.map(String);
    } else {
      var set = JAMO_SETS[normalizeJamoSetName(target)];
      if (!set) {
        throw new TypeError("font-kku: authoringProgress needs a registered jamo set or a list of cell keys (got " + JSON.stringify(target) + ")");
      }
      keys = Object.keys(set.cells);
    }
    var drawn = Object.create(null);
    keys.forEach(function (key) {
      if (key.charAt(0) !== "@") {
        drawn[key.split("@")[0]] = true;
      }
    });
    var helper = AUTHORING_STAGES.helper;
    var stages = ["origin8", "basic24", "full40"].map(function (stage) {
      var list = AUTHORING_STAGES[stage].split("");
      return {
        stage: stage,
        total: list.filter(function (jamo) { return helper.indexOf(jamo) < 0; }).length,
        have: list.filter(function (jamo) { return drawn[jamo] && helper.indexOf(jamo) < 0; }),
        missing: list.filter(function (jamo) { return !drawn[jamo] && helper.indexOf(jamo) < 0; }),
        extra: Object.keys(drawn).filter(function (jamo) { return list.indexOf(jamo) < 0 && helper.indexOf(jamo) < 0; })
      };
    });
    var next = stages.filter(function (stage) { return stage.missing.length; })[0];
    return {
      stages: stages,
      helper: { jamo: helper, drawn: Boolean(drawn[helper]) },
      next: next ? next.stage : null
    };
  }

  function copyTraceEntry(entry) {
    var copy = {
      path: entry.path.slice(), jamo: entry.jamo, role: entry.role, source: entry.source, method: entry.method,
      recipe: entry.recipe, rules: entry.rules.slice(), result: entry.result, status: entry.status, diagnostic: entry.diagnostic
    };
    if (entry.effectiveSource) {
      copy.effectiveSource = entry.effectiveSource;
    }
    if (entry.identity) {
      copy.identity = entry.identity;
      copy.measurement = entry.measurement;
    }
    return copy;
  }

  /* FontKku.planJamo(jamo, options) — 자모 하나의 조립 계획과 출처 기록(ADR-025, 실험). 화면에 그리지 않는다. options:
   * design(등록 이름), set(디자인 없을 때의 칸 계약 그림 세트), role(initial|medial|final — 기본은 자음 initial·모음 medial),
   * context(cho|bar|jong — 기본은 역할에서), layout(right|bottom|split-right), hasFinal, cells(디자인 없을 때 보이는 자모 칸).
   * 획은 자모 획순의 번호(0부터)로 돌려준다. 그림이 맡지 않은 획은 alias가 그 획을 긋는 그림(원소 그림 @…·원형 그림 ㅡ·ㆍ·ㅇ, 없으면 null). */
  function planJamo(jamo, options) {
    var opts = options || {};
    var text = String(jamo === undefined || jamo === null ? "" : jamo).trim();
    var rows = hoekRow(text);
    if (!rows) {
      throw new TypeError("font-kku: planJamo needs a modern compatibility jamo (got " + JSON.stringify(jamo) + ")");
    }
    var design = null;
    if (opts.design !== undefined && opts.design !== null) {
      design = DESIGNS[normalizeJamoSetName(opts.design)] || null;
      if (!design) {
        throw new TypeError("font-kku: design " + JSON.stringify(opts.design) + " is not registered");
      }
    }
    var set = null;
    if (!design && opts.set !== undefined && opts.set !== null) {
      set = JAMO_SETS[normalizeJamoSetName(opts.set)] || null;
      if (!set || set.frame !== "box") {
        throw new TypeError("font-kku: planJamo set is a registered box-frame jamo set (got " + JSON.stringify(opts.set) + ")");
      }
    }
    var vowel = /[ㅏ-ㅣ]/.test(text);
    var role = opts.role || (vowel ? "medial" : "initial");
    var env = {
      design: design,
      set: set,
      sourceId: design ? null : set ? set.name : "primitive",
      cells: !design && Array.isArray(opts.cells) ? opts.cells.map(String) : null,
      trace: []
    };
    var out = [];
    planRequest({
      jamo: text,
      strokes: rows.map(function (row, index) { return index; }),
      context: opts.context !== undefined ? String(opts.context) : vowel ? "" : role === "final" ? "jong" : "cho",
      rootJamo: text,
      rootRole: role,
      layout: opts.layout ? DESIGN_LAYOUTS[opts.layout] || String(opts.layout) : "",
      hasFinal: opts.hasFinal === true,
      path: [],
      binding: null,
      inherited: null,
      level: 0
    }, env, out);
    return {
      jamo: text,
      design: design ? design.name : null,
      items: out.map(function (item) {
        return {
          path: item.path.slice(), source: item.source, method: item.method, recipe: item.recipe,
          drawing: item.drawing || null, strokes: item.drawing ? item.strokes.slice() : [item.stroke], kind: item.kind || null,
          alias: item.drawing ? null : item.alias || null
        };
      }),
      trace: env.trace.map(copyTraceEntry)
    };
  }

  /* FontKku.traceOf(host) — 그린 바탕 요소의 자모 노드마다 조립 기록(ADR-025 §10, 실험). 원소·그림 재료만 기록이 있다. */
  function traceOf(host) {
    var state = host ? STATE.get(host) : null;
    if (!state) {
      return null;
    }
    var meta = state.options.fontMeta || {};
    var root = getManagedRoot(host);
    var nodes = [];
    if (root && PLAN_TRACES) {
      Array.prototype.forEach.call(root.querySelectorAll(DRAWN_NODES), function (node) {
        var entries = PLAN_TRACES.get(node);
        if (entries) {
          nodes.push({
            jamo: node.getAttribute("data-jamo") || node.getAttribute("data-fy-standalone"),
            role: node.getAttribute("data-fy-role") || (node.hasAttribute("data-fy-standalone") ? "standalone" : null),
            pos: node.getAttribute("data-fy-pos"),
            requests: entries.map(copyTraceEntry)
          });
        }
      });
    }
    return { face: meta.face || null, design: meta.designRevision ? meta.design : null, designStatus: meta.designStatus || null, nodes: nodes };
  }

  /* ── 해석기(ADR-025 §3–4) ─────────────────────────────────────
   * DOM 없이 자모 하나의 조립 계획을 낸다. 요청은 { jamo, strokes(뼈대 획 — 계획은 개수와 차례만 본다), context(cho·bar·jong),
   * rootJamo·rootRole·layout·hasFinal(규칙 맞추기), path(조각 경로), binding(위 조립식이 이 조각에 준 값), inherited(위 요청의
   * 소스), level }. 환경은 { design(없으면 지금 설정 그대로), set·sourceId·depth(디자인 없을 때의 그림 세트와 그리는 깊이), trace }.
   * 결과 항목은 원소 출력이 받는 { drawing, strokes } · { stroke, kind, index, alias }에 그림 세트(set)와 출처(path·source·method·recipe)를
   * 더한 것이다. 디자인이 없으면 ADR-024 §5 차례 그대로다 — 그림 → 짝 → 가획 조상 → 천지인 → 원소 그림 → 원형 그림 → CSS 상자. */
  var PLAN_LEVELS = 12;
  var AUTO_BUNDLE = { method: "auto", recipe: null, bindings: null };
  var PAIR_OPERATIONS = { double: true, "final-pair": true, compose: true };
  var PLAN_TRACES = typeof WeakMap === "function" ? new WeakMap() : null;

  function ruleFits(rule, req) {
    return rule.jamo === req.jamo && (!rule.role || rule.role === req.rootRole) &&
      (!rule.layout || rule.layout === req.layout) && (rule.hasFinal === null || rule.hasFinal === req.hasFinal);
  }

  /* 필드 묶음(source·bundle·fallbackSources)마다 가장 구체적인 규칙 — 같은 구체성의 충돌은 등록 때 막았다 */
  function winningRule(design, req, field) {
    var best = null;
    design.rules.forEach(function (rule) {
      if (rule[field] && ruleFits(rule, req) && (!best || rule.specificity > best.specificity)) {
        best = rule;
      }
    });
    return best;
  }

  /* 소스 우선순위(v1.1 §8.2): 조각 binding > 규칙(구체적인 것부터) > 위 요청에서 상속 > 역할 기본 > 디자인 기본 */
  function requestSource(design, req, why) {
    if (req.binding && req.binding.source) {
      why.push("binding");
      return req.binding.source;
    }
    var rule = winningRule(design, req, "source");
    if (rule) {
      why.push(rule.id);
      return rule.source;
    }
    return req.inherited || design.roleSources[req.rootRole] || design.defaults.source;
  }

  /* 조립(method·recipe·bindings)은 한 묶음 — 더 구체적인 쪽이 통째로 이긴다. 위 요청에서 물려받지 않는다 */
  function requestBundle(design, req, why) {
    if (req.binding && req.binding.bundle) {
      why.push("binding");
      return req.binding.bundle;
    }
    var rule = winningRule(design, req, "bundle");
    if (rule) {
      why.push(rule.id);
      return rule.bundle;
    }
    return design.defaults.method === "auto" ? AUTO_BUNDLE : { method: design.defaults.method, recipe: null, bindings: null };
  }

  function sourceSet(design, sourceId) {
    var source = design.sources[sourceId];
    return source && source.kind === "svg" ? JAMO_SETS[source.set] || null : null;
  }

  /* 가획 조립식의 base(그 위 계통은 자모마다 기본 조립식을 따라 올라간다) */
  function addBase(recipeId) {
    var recipe = recipeId ? JAMO_RECIPES[recipeId] : null;
    return recipe && recipe.operation === "add" ? recipe.parts[0].jamo : null;
  }

  var DOT_JAMO = "\u318D";

  /* 호환 자모 → 조합용 자모(초성·중성·종성) — 상자 조각이 제 뼈대를 찾을 때 */
  var CONJOINING_OF = null;
  function conjoiningOf(compat, kind) {
    if (!CONJOINING_OF) {
      CONJOINING_OF = { initial: {}, medial: {}, final: {} };
      [["initial", 0x1100, 0x1112], ["medial", 0x1161, 0x1175], ["final", 0x11A8, 0x11C2]].forEach(function (range) {
        for (var code = range[1]; code <= range[2]; code += 1) {
          var conj = String.fromCharCode(code);
          if (JAMO_TO_COMPAT[conj]) {
            CONJOINING_OF[range[0]][JAMO_TO_COMPAT[conj]] = conj;
          }
        }
      });
    }
    return CONJOINING_OF[kind][compat] || null;
  }

  /* 조각 자모의 제 뼈대(한 묶음) — 모음은 중성, 받침 문맥이면 종성, 아니면 초성(@cho·@bar) */
  function ownSkeleton(compat, context) {
    var vowel = /[\u314F-\u3163]/.test(compat);
    var key = vowel ? conjoiningOf(compat, "medial") :
      context === "jong" ? conjoiningOf(compat, "final") : (conjoiningOf(compat, "initial") || "") + (context === "bar" ? "@bar" : "@cho");
    var groups = key ? SKELETONS[key] : null;
    return groups && groups.length === 1 ? groups[0][1] : null;
  }

  /* 획 묶음의 중심선 범위 [x0, y0, x1, y1](뼈대 0–1 좌표, 원은 중심 ± 반지름) */
  function strokesExtent(strokes) {
    var box = [Infinity, Infinity, -Infinity, -Infinity];
    strokes.forEach(function (stroke) {
      (stroke.ring ? [[stroke.ring[0] - stroke.ring[2], stroke.ring[1] - stroke.ring[3], stroke.ring[0] + stroke.ring[2], stroke.ring[1] + stroke.ring[3]]] : stroke)
        .forEach(function (piece) {
          box[0] = Math.min(box[0], piece[0], piece[2]);
          box[1] = Math.min(box[1], piece[1], piece[3]);
          box[2] = Math.max(box[2], piece[0], piece[2]);
          box[3] = Math.max(box[3], piece[1], piece[3]);
        });
    });
    return box;
  }

  function strokeIntoBox(stroke, box) {
    var x = function (u) { return box[0] + u * (box[2] - box[0]); };
    var y = function (v) { return box[1] + v * (box[3] - box[1]); };
    if (stroke.ring) {
      return { ring: [x(stroke.ring[0]), y(stroke.ring[1]), stroke.ring[2] * (box[2] - box[0]), stroke.ring[3] * (box[3] - box[1])] };
    }
    return stroke.map(function (piece) { return [x(piece[0]), y(piece[1]), x(piece[2]), y(piece[3]), piece[4], piece[5]]; });
  }

  /* place 조각의 자리(ADR-025 §5): strokes는 대상 획 묶음, segments는 획 안 마디, box는 대상 뼈대 좌표의 상자에 조각 자모의 제
   * 뼈대를 맞춘다. 획 묶음은 놓을 자리의 참조다 — 원본의 획을 잘라 쓰라는 뜻이 아니다. 계획만 낼 때(geometry 없음)는 번호만.
   * box의 0–1은 노드가 아니라 요청 획의 범위다 — 맨 위 ㅂ은 노드 그대로, ㅃ·ㄼ·ㅄ 안의 ㅂ·머리 음절의 ㅂ은 제 자리 */
  function placedStrokes(req, rows, part, geometry) {
    var at = part.at;
    var orders = req.orders || req.strokes.map(function (stroke, index) { return index; });
    var picked = { strokes: [], rows: [], orders: [] };
    if (at.strokes || at.segments) {
      (at.strokes || at.segments).forEach(function (ref) {
        var index = at.strokes ? ref : ref[0];
        var stroke = req.strokes[index];
        picked.strokes.push(at.segments && geometry && Array.isArray(stroke) ? [stroke[ref[1]]] : stroke);
        picked.rows.push(rows[index]);
        picked.orders.push(orders[index]);
      });
      return picked;
    }
    var own = geometry ? ownSkeleton(part.jamo, req.context) : null;
    var box = at.box;
    if (own) {
      var range = strokesExtent(req.strokes);
      var x = function (u) { return range[0] + u * (range[2] - range[0]); };
      var y = function (v) { return range[1] + v * (range[3] - range[1]); };
      box = [x(at.box[0]), y(at.box[1]), x(at.box[2]), y(at.box[3])];
    }
    picked.rows = hoekRow(part.jamo) || [];
    picked.strokes = picked.rows.map(function (row, index) {
      return own ? strokeIntoBox(own[index], box) : index;
    }).filter(function (stroke) { return stroke !== undefined; });
    picked.orders = picked.rows.map(function () { return null; });
    return picked;
  }

  function planRequest(req, env, out) {
    var design = env.design;
    var why = [];
    var sourceId = design ? requestSource(design, req, why) : env.sourceId;
    var set = design ? sourceSet(design, sourceId) : env.set;
    var bundle = design ? requestBundle(design, req, why) : AUTO_BUNDLE;
    /* 보이는 칸(ADR-025 §7): 디자인 소스의 cells — 그림 세트를 원형 8·기본 24만 그린 셈 치고 미리 보기. 없으면 모두 */
    var visible = function (id) {
      return design ? design.sources[id] && design.sources[id].cells || null : env.cells || null;
    };
    var depth = visible(sourceId);
    var entry = {
      path: req.path, jamo: req.jamo, role: req.rootRole || null, source: sourceId, method: bundle.method,
      recipe: null, rules: why, result: "strokes", status: "ok", diagnostic: null
    };
    if (design && design.sources[sourceId].kind === "svg" && !set) {
      entry.status = "pending";
    }
    /* 조립할 재료가 있는가 — 그림 세트, 또는 글꼴(조각마다 낱자) */
    var material = set || (design && design.sources[sourceId].kind === "font");
    var first = env.trace.length;
    env.trace.push(entry);
    var push = function (item, itemSet, itemSource) {
      item.set = itemSet;
      item.path = req.path;
      item.source = itemSource || sourceId;
      item.method = bundle.method;
      item.recipe = entry.recipe;
      out.push(item);
    };
    var rows = req.rows || hoekRow(req.jamo) || [];
    /* 그림이 맡지 않은 획의 그림 열쇠(ADR-025 §7): 세트의 원소 그림(@line·@dot·@ring)이 먼저, 그 종류가 없으면 보이는 원형
     * 그림 — 선은 ㅡ(마디마다 돌려 놓는다), 점은 ㆍ(없으면 ㅡ), 동그라미는 ㅇ. 원형 8만 그린 세트의 가획·짧은 모음 획도 그 세트의
     * 손으로 그린다. 없으면 null(CSS 상자) */
    var strokeAlias = function (itemSet, index) {
      var kind = rows[index] && rows[index][0];
      if (!itemSet) {
        return null;
      }
      if (kind === "ring" || (req.strokes[index] && req.strokes[index].ring)) {
        return boxDrawing(itemSet, "@ring", "", null) || boxDrawing(itemSet, "ㅇ", req.context, depth);
      }
      return (kind === "dot" ? boxDrawing(itemSet, "@dot", "", null) : null) || boxDrawing(itemSet, "@line", "", null) ||
        (kind === "dot" ? boxDrawing(itemSet, DOT_JAMO, "", depth) : null) || boxDrawing(itemSet, "ㅡ", "", depth);
    };
    var strokeItem = function (index, itemSet) {
      return { stroke: req.strokes[index], kind: rows[index] && rows[index][0], index: index,
        order: req.orders ? req.orders[index] : index, row: rows[index] || null, alias: strokeAlias(itemSet, index) };
    };
    var oneByOne = function (itemSet) {
      req.strokes.forEach(function (stroke, index) {
        var from = rows[index] ? rows[index][1] : "";
        /* 천지인 — ㅣ·ㅡ에서 온 획은 그 그림 */
        var base = from === "ㅣ" || from === "ㅡ" ? boxDrawing(itemSet, from, "", depth) : null;
        if (base) {
          push({ drawing: base, strokes: [stroke] }, itemSet);
        } else {
          push(strokeItem(index, itemSet), itemSet);
        }
      });
    };
    var direct = function (fromSet, fromSource) {
      var font = design && design.sources[fromSource || sourceId].kind === "font";
      if (font) {
        /* 글꼴 글자 재료(ADR-025 §9): 글꼴에 그 자모가 있다고 보고 낱자를 쓴다 — 실제 글자인지는 측정 뒤 identity로 알린다 */
        entry.result = "direct";
        push({ drawing: req.jamo, strokes: req.strokes, font: true }, null, fromSource);
        return true;
      }
      /* 점(ㆍ)은 세트에 칸이 없으면 원소 그림 @dot을 쓴다(ADR-025 §7) */
      var cells = fromSource ? visible(fromSource) : depth;
      var key = boxDrawing(fromSet, req.jamo, req.context, cells) ||
        (req.jamo === DOT_JAMO ? boxDrawing(fromSet, "@dot", "", cells) : null);
      if (key) {
        entry.result = "direct";
        push({ drawing: key, strokes: req.strokes }, fromSet, fromSource);
      }
      return Boolean(key);
    };
    if (req.level > PLAN_LEVELS) {
      entry.status = "error";
      entry.diagnostic = "RECIPE_DEPTH";
      oneByOne(null);
      return;
    }

    if (bundle.method !== "compose" && direct(set)) {
      return;
    }
    if (bundle.method === "direct") {
      /* 직접: 승인된 대체 소스의 같은 자모까지만 — 분해하지 않는다 */
      var rule = winningRule(design, req, "fallbackSources");
      var fallbacks = (rule && rule.fallbackSources) || design.fallback.sourceIds;
      for (var f = 0; f < fallbacks.length; f += 1) {
        if (fallbacks[f] !== sourceId && direct(sourceSet(design, fallbacks[f]), fallbacks[f])) {
          entry.status = "degraded";
          entry.diagnostic = "SOURCE_FALLBACK";
          entry.effectiveSource = fallbacks[f];
          return;
        }
      }
      entry.status = "error";
      entry.diagnostic = "SOURCE_MISSING";
      entry.result = "none";
      if (design.fallback.allowPrimitive) {
        entry.result = "primitive";
        oneByOne(null);
      }
      return;
    }

    var recipe = JAMO_RECIPES[bundle.recipe || RECIPE_DEFAULTS[req.jamo]] || null;
    var child = function (part, picked) {
      return {
        jamo: part.jamo,
        strokes: picked.strokes,
        rows: picked.rows,
        orders: picked.orders,
        context: req.context,
        rootJamo: req.rootJamo,
        rootRole: req.rootRole,
        layout: req.layout,
        hasFinal: req.hasFinal,
        path: req.path.concat(part.id),
        binding: bundle.bindings ? bundle.bindings[part.id] || null : null,
        inherited: design ? sourceId : null,
        level: req.level + 1
      };
    };
    var composeParts = function (picks) {
      var mark = out.length;
      entry.recipe = recipe.id;
      entry.result = "composed";
      recipe.parts.forEach(function (part, index) {
        planRequest(child(part, picks[index]), env, out);
      });
      var failed = bundle.method === "compose" && env.trace.slice(first + 1).some(function (traced) {
        return traced.status === "error";
      });
      if (failed) {
          /* 지정한 조합의 재료가 없다 — 실패 정책(v1.1 §7.3): error는 그대로 알리고, direct·primitive는 명시했을 때만 */
          entry.status = "error";
          entry.diagnostic = "COMPOSE_SOURCE_MISSING";
          var onFailure = design.fallback.onComposeFailure;
        if (onFailure !== "error") {
          out.length = mark;
          entry.status = "degraded";
          entry.recipe = null;
          if (!(onFailure === "direct" && direct(set))) {
            entry.result = "primitive";
            oneByOne(null);
          }
        }
      }
    };
    if (material && recipe && PAIR_OPERATIONS[recipe.operation]) {
      var count = strokeCount(recipe.parts[0].jamo);
      if (count && count < req.strokes.length) {
        composeParts([0, 1].map(function (index) {
          var from = index ? count : 0;
          var to = index ? req.strokes.length : count;
          return {
            strokes: req.strokes.slice(from, to),
            rows: rows.slice(from, to),
            orders: (req.orders || req.strokes.map(function (stroke, i) { return i; })).slice(from, to)
          };
        }));
        return;
      }
    }
    /* 기본 place(ㅎ·ㄹ·ㅂ·ㅍ의 선 조립식)는 짝·가획처럼 그릴 재료가 있을 때만 — 원소 재료·원소 디자인은 획 그대로다.
     * 규칙·binding이 고른 조립식은 재료 없이도 따른다 */
    if (recipe && recipe.operation === "place" && (material || bundle.recipe)) {
      composeParts(recipe.parts.map(function (part) { return placedStrokes(req, rows, part, env.geometry); }));
      return;
    }
    if (material && recipe && recipe.operation === "add") {
      /* 가장 가까운 그린 가획 조상: 그 조상과 그 위 계통에서 온 획은 조상 그림 하나로, 나머지는 하나씩 */
      for (var parent = addBase(recipe.id); parent; parent = addBase(RECIPE_DEFAULTS[parent])) {
        var lineage = [parent];
        for (var up = addBase(RECIPE_DEFAULTS[parent]); up; up = addBase(RECIPE_DEFAULTS[up])) {
          lineage.push(up);
        }
        var parentKey = set ? boxDrawing(set, parent, req.context, depth) : parent;
        if (parentKey) {
          var mine = [];
          var rest = [];
          req.strokes.forEach(function (stroke, index) {
            (rows[index] && lineage.indexOf(rows[index][1]) >= 0 ? mine : rest).push(index);
          });
          if (mine.length) {
            entry.recipe = recipe.id;
            entry.result = "composed";
            push({ drawing: parentKey, strokes: mine.map(function (index) { return req.strokes[index]; }), font: !set }, set);
            rest.forEach(function (index) {
              push(strokeItem(index, set), set);
            });
            return;
          }
        }
      }
    }
    oneByOne(set);
  }

  /* 디자인이 걸린 바탕 요소에서 자모 노드의 묶음(뼈대 그룹)마다 규칙을 맞출 맨 위 요청(ADR-025 §6). 역할은 노드의 data-fy-role,
   * 짜임·받침은 음절 상자의 data-layout-key다. 자모 깊이가 slot으로 나눈 노드(jung-base·jung-tail·jong-left·jong-right)와 머리 음절의
   * 모음은 그 겹모음·겹받침 조립식의 조각으로 본다 — 통짜 노드 안에서 나뉠 때와 같은 조각 binding이 닿는다. */
  var DESIGN_NODE_ROLES = {
    choseong: "initial", head: "initial", "jung-main": "medial", "jung-base": "medial", "jung-tail": "medial",
    "jong-main": "final", "jong-left": "final", "jong-right": "final"
  };

  function syllableCompat(glyph) {
    var text = glyph ? glyph.getAttribute("data-source") || "" : "";
    var code = text.length === 1 ? text.charCodeAt(0) - 0xAC00 : -1;
    if (code < 0 || code > 11171) {
      return null;
    }
    var jong = code % 28;
    return {
      medial: faceGlyph(String.fromCharCode(0x1161 + Math.floor(code / 28) % 21)),
      final: jong ? faceGlyph(String.fromCharCode(0x11A7 + jong)) : ""
    };
  }

  function designRequests(node, skeleton, design) {
    var role = node.getAttribute("data-fy-role") || "";
    var glyph = typeof node.closest === "function" ? node.closest('[part~="glyph"]') : null;
    var key = (glyph && glyph.getAttribute("data-layout-key") || "").split(":");
    var layout = key[0] || "";
    var hasFinal = Boolean(key[1]) && key[1] !== "none";
    var parts = syllableCompat(glyph);
    return skeleton.map(function (group, index) {
      var rootRole = role === "head" && index > 0 ? "medial" : DESIGN_NODE_ROLES[role] || "standalone";
      var req = { rootJamo: group[0], rootRole: rootRole, layout: layout, hasFinal: hasFinal, path: [], binding: null, inherited: null };
      var whole = parts && (rootRole === "medial" ? parts.medial : rootRole === "final" ? parts.final : "");
      var at = role === "jung-tail" || role === "jong-right" ? 1 :
        role === "jung-base" || role === "jong-left" || (role === "head" && index > 0) ? 0 : -1;
      if (whole && whole !== group[0] && at >= 0) {
        var wholeReq = { jamo: whole, rootJamo: whole, rootRole: rootRole, layout: layout, hasFinal: hasFinal, binding: null, inherited: null };
        var bundle = requestBundle(design, wholeReq, []);
        var recipe = JAMO_RECIPES[bundle.recipe || RECIPE_DEFAULTS[whole]];
        var part = recipe && recipe.parts[at];
        if (part && part.jamo === group[0]) {
          req.rootJamo = whole;
          req.path = [part.id];
          req.binding = bundle.bindings ? bundle.bindings[part.id] || null : null;
          req.inherited = requestSource(design, wholeReq, []);
        }
      }
      return req;
    });
  }

  /* 낱자로 그릴 글자: 호환 자모 하나(ㄱ–ㅣ) */
  function standaloneJamo(text) {
    var code = text && text.length === 1 ? text.charCodeAt(0) : 0;
    return code >= 0x3131 && code <= 0x3163 ? text : "";
  }

  var DRAWN_NODES = '[part~="jamo"], [part="content"][data-fy-standalone]';

  function appliedDesign(meta) {
    var design = meta && meta.design ? DESIGNS[meta.design] : null;
    return design && design.revision === meta.designRevision ? design : null;
  }

  function buildElementNodes(root, meta, doc, set) {
    var reference = inkBoxes(meta.inkBoxes);
    var table = INK_BOXES[meta.inkBoxes];
    if (!reference || !doc || typeof root.querySelectorAll !== "function") {
      return;
    }
    var design = appliedDesign(meta);
    var env = {
      design: design,
      set: design ? null : set,
      sourceId: design ? null : set ? set.name : "primitive",
      cells: null,
      geometry: true,
      trace: null
    };
    Array.prototype.forEach.call(root.querySelectorAll('[part~="jamo"], [part="content"]'), function (node) {
      /* 낱자(ADR-025 §6): 음절이 아닌 호환 자모 글자도 자모 노드처럼 그린다 — data-fy-standalone이 표시다 */
      var standalone = node.getAttribute("part") === "content";
      var text = standalone ? standaloneJamo(node.textContent) : node.dataset.jamo;
      var box = text ? reference[text] : null;
      var skeleton = box ? skeletonFor(node, text) : null;
      if (!skeleton) {
        return;
      }
      if (standalone) {
        node.setAttribute("data-fy-standalone", text);
      }
      /* 처음에는 기준 획 굵기로 놓는다 — 굵기 보정(balanceElementStrokes)이 실제 굵기로 다시 놓는다 */
      if (ELEMENT_UNITS) {
        ELEMENT_UNITS.set(node, box);
      }
      if (DENSITY_LINES) {
        DENSITY_LINES.set(node, densityLines(skeleton));
        DENSITY_FITS.delete(node);
      }
      var axes = elementAxes(box, table.stroke, table.stroke);
      /* 그림의 문맥 변형: 초성은 세로 모음 옆(cho)·가로 모음 위(bar), 종성은 받침(jong), 머리 음절의 초성은 bar */
      var code = text.charCodeAt(0);
      var context = code >= 0x11A8 && code <= 0x11FF ? "jong" : code >= 0xAC00 ? "bar" : "";
      if (code >= 0x1100 && code <= 0x1112) {
        context = overBar(node) ? "bar" : "cho";
      }
      /* 낱자 자음은 뼈대와 같이 곧은 꼴 — 받침 칸(@jong), 받침이 될 수 없는 ㄸ·ㅃ·ㅉ는 가로 모음 위 칸(@bar). 세트가 낱자 칸(@solo —
       * 같은 꼴을 낱자 상자의 비로 그린 칸, 칠 세트의 붓이 세로로 늘어 뭉치지 않게)을 밝혔으면 그 칸이 먼저다 */
      if (standalone && code <= 0x314E) {
        context = set && set.cells && set.cells[text + "@solo"] ? "solo" : "ㄸㅃㅉ".indexOf(text) >= 0 ? "bar" : "jong";
      }
      node.style.setProperty("--fy-face-width", round4(box[4]) + "em");
      var count = 0;
      var requests = design ? designRequests(node, skeleton, design) : null;
      /* 머리 음절(과의 고)은 획 묶음 둘 — 어느 묶음(초성·모음)의 획인지 data-fy-head-part로 적는다. 2층 재귀(fitHeadSyllables)가
       * 묶음마다 옮긴다 */
      var head = !standalone && node.getAttribute("data-fy-role") === "head";
      env.trace = [];
      var dotGroups = [];
      var letterGroups = [];
      skeleton.forEach(function (group, index) {
        var plan = [];
        var dots = [];
        var rest = [];
        var strokes = [];
        var top = requests ? requests[index] : null;
        planRequest({
          jamo: group[0],
          strokes: group[1],
          context: /[\u314F-\u3163]/.test(group[0]) ? "" : context,
          rootJamo: top ? top.rootJamo : group[0],
          rootRole: top ? top.rootRole : "",
          layout: top ? top.layout : "",
          hasFinal: top ? top.hasFinal : false,
          path: top ? top.path : [],
          binding: top ? top.binding : null,
          inherited: top ? top.inherited : null,
          level: 0
        }, env, plan);
        plan.forEach(function (item) {
          var hoek = doc.createElement("span");
          hoek.setAttribute("part", "hoek");
          if (head) {
            hoek.setAttribute("data-fy-head-part", index ? "medial" : "initial");
          }
          count += 1;
          if (item.drawing) {
            hoek.setAttribute("data-hoek-drawing", item.drawing);
            appendDrawing(hoek, item.set, item.drawing, item.strokes, axes, doc);
          } else {
            hoek.setAttribute("data-hoek", String((item.order === null || item.order === undefined ? item.index : item.order) + 1));
            var role = item.row;
            if (role) {
              hoek.setAttribute("data-hoek-kind", role[0]);
              hoek.setAttribute("data-hoek-from", role[1]);
              hoek.setAttribute("data-hoek-letter", role[2]);
              hoek.setAttribute("data-hoek-role", role[3]);
            }
            appendStroke(hoek, item.set, item.stroke, item.alias, axes, doc);
          }
          var dot = !item.drawing && item.row && item.row[0] === "dot";
          Array.prototype.forEach.call(hoek.children, function (span) {
            (dot ? dots : rest).push(span);
          });
          strokes.push([item.drawing ? -1 : item.index, Array.prototype.slice.call(hoek.children)]);
          node.appendChild(hoek);
        });
        if (dots.length && rest.length) {
          dotGroups.push([dots, rest]);
        }
        var letters = letterMembers(group[0], group[1].length, strokes);
        if (letters) {
          letterGroups.push([index, letters[0], letters[1]]);
        }
      });
      if (DOT_GROUPS) {
        DOT_GROUPS.set(node, dotGroups);
      }
      if (LETTER_GROUPS) {
        LETTER_GROUPS.set(node, letterGroups);
      }
      if (PLAN_TRACES) {
        PLAN_TRACES.set(node, env.trace);
      }
    });
  }

  /* 원소 자리(ADR-024): 마디·원·그림 상자는 단위 좌표(표준 잉크 상자를 획 굵기의 절반만큼 줄인 상자의 0–1)로 기억하고,
   * 놓을 때 그 굵기를 정한다 — 처음에는 기준 굵기, 굵기 보정 뒤에는 노드에서 실제로 보이는 굵기. 그래서 굵기(페이지
   * --fy-element-width)나 slot 배율이 어떻든 잉크가 표준 상자 안에 머문다. */
  var ELEMENT_UNITS = typeof WeakMap === "function" ? new WeakMap() : null;

  function elementAxes(box, tx, ty) {
    var axis = function (a, b, t) { return b - a > t ? [a + t / 2, b - t / 2] : [(a + b) / 2, (a + b) / 2]; };
    var xs = axis(box[0], box[2], tx);
    var ys = axis(box[1], box[3], ty);
    return {
      box: box,
      tx: tx,
      ty: ty,
      x: function (u) { return xs[0] + u * (xs[1] - xs[0]); },
      y: function (v) { return ys[0] + v * (ys[1] - ys[0]); }
    };
  }

  /* 밀도 굵기 계수(ADR-024 §3): 마주 보는 평행 마디의 중심 간격 p가 획 굵기 t의 (1 + r)배보다 좁으면 노드의 획을
   * k = clamp(p / ((1 + r)·t), 0.75, 1)배로 한다(r 0.6 — 틈이 굵기의 0.6배는 남는다). 세벌 고정 받침 ㄹ의 틈 0.031em이 작은
   * 글씨에서 메워졌다. p는 뼈대 마디(묶음마다, 점·동그라미 획 빼고)에 노드 변환을 건 em이라 글자 크기와 무관하다(L21).
   * 0.75는 획 굵기 감사의 허용 폭(25%)이다. 세벌 고정 도장은 같은 셈을 미리 해 둔다(scripts/measure_layout_stamps.py).
   * 꼭지 틈: ㅎ·ㅊ 꼭지(점 획)와 가로획의 중심 간격은 뼈대 상자의 27%라 획이 상자의 1/4.7보다 굵으면 붙는다(세벌 고정 ㅎ은
   * 1/3.8–1/4.0). 너머 획을 너머 높이의 0.8배까지 눌러 1.6t로 열고(dotShifts), 모자라면 가늘게 한다(dotDensity).
   * 낱자 틈(병서·겹받침): ㄲ·ㄸ·ㅃ·ㅆ·ㅉ와 겹받침은 낱자 둘이 나란하다. 뼈대의 낱자 사이(ㄲ은 상자 폭의 0.254)는 획 굵기를 모르는
   * 비율이라, 세벌 고정 초성(상자 0.3em, 굵기 0.1em)에서 둘째 ㄱ의 가로획 시작이 첫 ㄱ 기둥에 붙어 ㄲ이 ㅠ처럼 읽혔다. 놓을 굵기로
   * 두 낱자 잉크 사이를 재서 0.4t(LETTER_GAP — 더 넓히면 ㄸ의 ㄷ 속이 메워진다)보다 좁으면 두 낱자를 바깥쪽 끝을 둔 채 안쪽에서 좁힌다(letterFits) —
   * 낱자 속 틈(ㅃ의 ㅂ 기둥 사이)보다 넓히지는 않고(ㅃ은 기둥 넷이 고르게 선다), 낱자는 제 폭의 0.6배까지만 좁힌다. 그래도 0.3t보다
   * 좁으면 아래 최소 틈이 그만큼 가늘게 한다.
   * 최소 틈: 0.75 하한에 걸려도 획 사이가 굵기의 0.3배(DENSITY_MIN_GAP)보다 좁으면 그 틈이 날 때까지 더 가늘게 한다(0.5까지) —
   * 페이지가 굵기를 올리면(--fy-element-width: 0.13em) ㄹ·ㅌ 가로획 사이가 막혔다. 읽히는 것이 굵기 고름보다 먼저다. */
  var DENSITY_GAP = 0.6;
  var DENSITY_FLOOR = 0.75;
  var DENSITY_MIN_GAP = 0.3;
  var DENSITY_HARD_FLOOR = 0.5;
  var DOT_SQUEEZE = 0.8;
  var LETTER_KEEP = 0.6;
  var LETTER_GAP = 0.4;
  var DENSITY_LINES = typeof WeakMap === "function" ? new WeakMap() : null;
  /* 머리 음절은 2층 재귀가 묶음마다 옮긴다 — 묶음마다 [옮기기 전 범위, 옮긴 범위] */
  var DENSITY_FITS = typeof WeakMap === "function" ? new WeakMap() : null;
  /* 자모 노드마다 점 획이 있는 묶음의 [점 획 마디들, 나머지 마디·원·그림 상자들] */
  var DOT_GROUPS = typeof WeakMap === "function" ? new WeakMap() : null;
  /* 자모 노드마다 낱자 둘이 나란한 묶음의 [묶음 차례, 첫 낱자 마디들, 둘째 낱자 마디들] */
  var LETTER_GROUPS = typeof WeakMap === "function" ? new WeakMap() : null;

  var ringBox = function (r) { return [r[0] - r[2], r[1] - r[3], r[0] + r[2], r[1] + r[3]]; };

  /* 병서·겹받침은 낱자 둘이 나란하다 — 첫 낱자의 획 수(아니면 0). 획표의 속한 자모가 바뀌는 곳(겹받침 ㄳ = ㄱ | ㅅ), 아니면 같은
   * 획이 두 번 되풀이되는 절반(병서 ㄲ = ㄱ | ㄱ)이다. 자음만 본다 — 합자 모음의 조각은 세벌 고정에서 노드가 따로다 */
  function letterSplit(jamo) {
    var code = String(jamo).charCodeAt(0);
    var rows = code >= 0x3131 && code <= 0x314E ? hoekRow(jamo) : null;
    if (!rows || rows.length < 2) {
      return 0;
    }
    for (var i = 1; i < rows.length; i += 1) {
      if (rows[i][2] !== rows[0][2]) {
        return i;
      }
    }
    var half = rows.length / 2;
    var key = function (list) { return list.map(function (row) { return row.join(" "); }).join(","); };
    return rows.length % 2 === 0 && key(rows.slice(0, half)) === key(rows.slice(half)) ? half : 0;
  }

  /* 낱자 둘의 마디 — strokes는 묶음의 획마다 [획 차례, 마디들]. 획이 모두 제 차례로 하나씩 그려졌을 때만(그림 한 장이 두 낱자를
   * 함께 그리면 나눌 수 없다) [첫 낱자 마디들, 둘째 낱자 마디들] */
  function letterMembers(jamo, count, strokes) {
    var split = letterSplit(jamo);
    if (!split || strokes.length !== count || strokes.some(function (item, at) { return item[0] !== at; })) {
      return null;
    }
    var out = [[], []];
    strokes.forEach(function (item) {
      Array.prototype.push.apply(out[item[0] < split ? 0 : 1], item[1]);
    });
    return out;
  }

  /* 뼈대의 획 묶음마다 마디 [x1, y1, x2, y2, 종류, 시작 늘이기, 끝 늘이기, 낱자](단위 좌표) — 종류 0 선분, 1 점 획, 2 동그라미
   * (범위 상자), 낱자는 병서·겹받침의 0(첫)·1(둘째), 아니면 −1 */
  function densityLines(skeleton) {
    return skeleton.map(function (group) {
      var rows = hoekRow(group[0]) || [];
      var split = letterSplit(group[0]);
      var lines = [];
      group[1].forEach(function (stroke, index) {
        var kind = rows[index] && rows[index][0];
        var letter = split ? (index < split ? 0 : 1) : -1;
        if (stroke.ring) {
          lines.push(ringBox(stroke.ring).concat([2, 0, 0, letter]));
          return;
        }
        stroke.forEach(function (piece) {
          lines.push([piece[0], piece[1], piece[2], piece[3], kind === "dot" ? 1 : kind === "ring" ? 2 : 0, piece[4] || 0, piece[5] || 0, letter]);
        });
      });
      return lines;
    });
  }

  /* 마주 보는 평행 마디(선분만)의 최소 중심 간격 — 굵기 w보다 길게 마주 보는 쌍만, 한 줄 위의 마디는 빼고. axes는 놓을 자리,
   * m은 노드 변환. 없으면 Infinity */
  function facingPitch(lines, axes, m, w) {
    var best = Infinity;
    var point = function (u, v) {
      var x = axes.x(u);
      var y = axes.y(v);
      return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
    };
    var placed = lines.filter(function (line) { return !line[4]; })
      .map(function (line) { return [point(line[0], line[1]), point(line[2], line[3])]; });
    placed.forEach(function (a, i) {
      var ax = a[1][0] - a[0][0];
      var ay = a[1][1] - a[0][1];
      var la = Math.sqrt(ax * ax + ay * ay);
      placed.slice(i + 1).forEach(function (b) {
        var bx = b[1][0] - b[0][0];
        var by = b[1][1] - b[0][1];
        var lb = Math.sqrt(bx * bx + by * by);
        if (la < 1e-6 || lb < 1e-6 || Math.abs(ax * by - ay * bx) / (la * lb) > 0.05) {
          return;
        }
        var ux = ax / la;
        var uy = ay / la;
        var gap = Math.abs(ux * ((b[0][1] + b[1][1]) / 2 - a[0][1]) - uy * ((b[0][0] + b[1][0]) / 2 - a[0][0]));
        var s0 = ux * (b[0][0] - a[0][0]) + uy * (b[0][1] - a[0][1]);
        var s1 = ux * (b[1][0] - a[0][0]) + uy * (b[1][1] - a[0][1]);
        var facing = Math.min(la, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1));
        if (gap > 1e-4 && facing > w) {
          best = Math.min(best, gap);
        }
      });
    });
    return best;
  }

  /* 마디 하나의 잉크 가로 범위(노드 em, 변환 뒤) — 굵기 t(노드에서 보이는 굵기)와 끝 늘이기를 넣는다 */
  function inkSpanX(line, axes, m, t) {
    var point = function (u, v) {
      var x = axes.x(u);
      var y = axes.y(v);
      return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
    };
    if (line[4] === 2) {
      var xs = [point(line[0], line[1])[0], point(line[2], line[1])[0], point(line[0], line[3])[0], point(line[2], line[3])[0]];
      return [Math.min.apply(null, xs) - t / 2, Math.max.apply(null, xs) + t / 2];
    }
    var p = point(line[0], line[1]);
    var q = point(line[2], line[3]);
    var dx = q[0] - p[0];
    var dy = q[1] - p[1];
    var length = Math.sqrt(dx * dx + dy * dy);
    var ux = length > 1e-9 ? dx / length : 1;
    var uy = length > 1e-9 ? dy / length : 0;
    var a = p[0] - ux * line[5] * t;
    var b = q[0] + ux * line[6] * t;
    var side = Math.abs(uy) * t / 2;
    return [Math.min(a, b) - side, Math.max(a, b) + side];
  }

  /* 낱자 맞춤 하나로 묶음의 마디를 옮긴다 — 첫 낱자는 왼쪽 끝을, 둘째 낱자는 오른쪽 끝을 둔 채 가로로 좁힌다 */
  function fitLetterLines(lines, fit) {
    var move = function (x, from, to) {
      var span = from[1] - from[0];
      return span > 1e-6 ? to[0] + (x - from[0]) * (to[1] - to[0]) / span : (to[0] + to[1]) / 2;
    };
    return lines.map(function (line) {
      if (line[7] !== 0 && line[7] !== 1) {
        return line;
      }
      var from = fit.from[line[7]];
      var to = fit.to[line[7]];
      return [move(line[0], from, to), line[1], move(line[2], from, to), line[3]].concat(line.slice(4));
    });
  }

  /* 두 낱자 잉크 사이 — 첫 낱자 오른쪽 끝에서 둘째 낱자 왼쪽 끝까지(노드 em) */
  function letterGap(lines, axes, m, t) {
    var right = -Infinity;
    var left = Infinity;
    lines.forEach(function (line) {
      if (line[7] === 0 || line[7] === 1) {
        var span = inkSpanX(line, axes, m, t);
        right = line[7] === 0 ? Math.max(right, span[1]) : right;
        left = line[7] === 1 ? Math.min(left, span[0]) : left;
      }
    });
    return left - right;
  }

  /* 낱자 틈 맞춤 — 묶음마다 { group, from: [[첫 낱자 왼, 오른], [둘째 …]], to } (단위 가로 범위). 굵기 t로 놓은 두 낱자 잉크 사이가
   * min(0.4t, 낱자 속 틈)보다 좁으면 안쪽에서 좁힌다(낱자 폭의 0.6배까지). 첫 낱자가 왼쪽인 묶음만 */
  function letterFits(groups, axes, m, t) {
    var out = [];
    groups.forEach(function (lines, index) {
      var extent = function (letter) {
        var xs = [];
        lines.forEach(function (line) {
          if (line[7] === letter) {
            xs.push(line[0], line[2]);
          }
        });
        return xs.length ? [Math.min.apply(null, xs), Math.max.apply(null, xs)] : null;
      };
      var a = extent(0);
      var b = extent(1);
      /* 빗금 획이 있는 낱자(ㅅ·ㅈ — ㅆ·ㅉ·ㄳ·ㄵ·ㄽ·ㅄ)는 좁히면 두 다리가 모여 쐐기로 뭉친다 — 발끝이 닿는 것이 보통 꼴이라 둔다 */
      var slanted = lines.some(function (line) {
        return (line[7] === 0 || line[7] === 1) && line[4] !== 2 && Math.abs(line[0] - line[2]) > 1e-6 && Math.abs(line[1] - line[3]) > 1e-6;
      });
      if (!a || !b || slanted || !(a[0] + a[1] < b[0] + b[1])) {
        return;
      }
      var fit = function (d) { return { group: index, from: [a, b], to: [[a[0], a[1] - d], [b[0] + d, b[1]]] }; };
      var enough = function (d) {
        var moved = fitLetterLines(lines, fit(d));
        var inner = Math.min(
          facingPitch(moved.filter(function (line) { return line[7] === 0; }), axes, m, t),
          facingPitch(moved.filter(function (line) { return line[7] === 1; }), axes, m, t)) - t;
        return letterGap(moved, axes, m, t) >= Math.min(LETTER_GAP * t, inner) - 1e-9;
      };
      if (enough(0)) {
        return;
      }
      var most = (1 - LETTER_KEEP) * Math.min(a[1] - a[0], b[1] - b[0]);
      var low = 0;
      var high = most;
      if (enough(most)) {
        for (var step = 0; step < 24; step += 1) {
          var middle = (low + high) / 2;
          if (enough(middle)) {
            high = middle;
          } else {
            low = middle;
          }
        }
      }
      out.push(fit(high));
    });
    return out;
  }

  /* 꼭지 틈의 자리 — dot은 점 마디, items는 묶음의 마디(densityLines 꼴). 가로(세로) 점 마디와 마주 보는 평행 선분이 있고
   * 그 선분 폭 아래의 획(겹받침 ㄶ·ㅀ의 옆 자모는 빼고)이 모두 그 너머면 { axis, dot, face, far, moved: items 차례 } */
  function dotSpan(dot, items) {
    var axis = Math.abs(dot[1] - dot[3]) < 1e-6 ? 1 : Math.abs(dot[0] - dot[2]) < 1e-6 ? 0 : -1;
    var across = 1 - axis;
    var range = function (item) { return [Math.min(item[across], item[across + 2]), Math.max(item[across], item[across + 2])]; };
    var overlap = function (a, b) { return Math.min(a[1], b[1]) - Math.max(a[0], b[0]); };
    var at = dot[axis];
    var face = null;
    items.forEach(function (item) {
      if (axis >= 0 && !item[4] && Math.abs(item[axis] - item[axis + 2]) < 1e-6 && overlap(range(dot), range(item)) > 1e-6 &&
          Math.abs(item[axis] - at) > 1e-6 && (!face || Math.abs(item[axis] - at) < Math.abs(face[axis] - at))) {
        face = item;
      }
    });
    if (!face) {
      return null;
    }
    var line = face[axis];
    var down = line > at;
    var far = line;
    var moved = [];
    var beyond = items.every(function (item, index) {
      if (item[4] === 1 || overlap(range(face), range(item)) < -1e-6) {
        return true;
      }
      var a = Math.min(item[axis], item[axis + 2]);
      var b = Math.max(item[axis], item[axis + 2]);
      far = down ? Math.max(far, b) : Math.min(far, a);
      moved.push(index);
      return down ? a >= line - 1e-6 : b <= line + 1e-6;
    });
    return beyond && Math.abs(far - line) > 1e-6 ? { axis: axis, dot: at, face: line, far: far, moved: moved } : null;
  }

  /* 꼭지 틈을 열 간격(단위)과 그 굵기 배율 — 너머를 0.8배까지 눌러 닿는 간격 reach에서 reach·(H − t') ≥ 1.6t'. axes는 놓을 자리 */
  function dotOpening(span, axes) {
    var t = span.axis ? axes.ty : axes.tx;
    var inner = span.axis ? axes.y(1) - axes.y(0) : axes.x(1) - axes.x(0);
    var reach = Math.abs(span.face - span.dot) + (1 - DOT_SQUEEZE) * Math.abs(span.far - span.face);
    return { open: inner > 0 ? Math.min((1 + DENSITY_GAP) * t / inner, reach) : 0,
      k: t > 0 ? reach * (inner + t) / ((1 + DENSITY_GAP + reach) * t) : 1 };
  }

  /* 노드 하나의 밀도 굵기 계수 — groups는 묶음마다 마디, axes는 굵기 w 그대로 놓은 자리, m은 노드 변환 [a, b, c, d], w는 노드에서
   * 보이는 획 굵기(노드 em). 마주 보는 길이가 굵기보다 짧은 쌍(모서리에서 스치는 마디)과 한 줄 위의 마디는 세지 않는다.
   * 점 획은 꼭지 틈(dotOpening)으로 센다. 병서·겹받침은 낱자 틈을 맞춘(letterFits) 자리에서 잰다. 마지막으로 가장 좁은 획
   * 사이(평행 마디·두 낱자 사이·꼭지 틈)가 최소 틈(굵기의 0.3배)이 날 때까지 0.5까지 더 가늘게 한다 */
  function strokeDensity(groups, axes, m, w) {
    var fits = letterFits(groups, axes, m, w);
    var placed = groups.map(function (lines, index) {
      var fit = fits.filter(function (item) { return item.group === index; })[0];
      return fit ? fitLetterLines(lines, fit) : lines;
    });
    var best = Infinity;
    var limit = 1;
    var spans = [];
    placed.forEach(function (lines) {
      best = Math.min(best, facingPitch(lines, axes, m, w));
      lines.forEach(function (line) {
        var span = line[4] === 1 ? dotSpan(line, lines) : null;
        if (span) {
          spans.push(span);
          limit = Math.min(limit, dotOpening(span, axes).k);
        }
      });
    });
    var k = Math.max(DENSITY_FLOOR, Math.min(1, limit, best === Infinity ? 1 : best / ((1 + DENSITY_GAP) * w)));
    if ((best === Infinity && !spans.length && !fits.length) || !axes.box) {
      return k;
    }
    /* 최소 틈 — 굵기 k·w로 다시 놓은 자리에서 가장 좁은 획 사이(꼭지 틈은 dotShifts가 열 수 있는 만큼 연 자리) */
    var narrowest = function (scale) {
      var at = elementAxes(axes.box, scale * axes.tx, scale * axes.ty);
      var gap = Infinity;
      placed.forEach(function (lines) {
        gap = Math.min(gap, facingPitch(lines, at, m, w) - scale * w);
      });
      fits.forEach(function (fit) {
        gap = Math.min(gap, letterGap(placed[fit.group], at, m, scale * w));
      });
      spans.forEach(function (span) {
        var t = span.axis ? at.ty : at.tx;
        var inner = span.axis ? at.y(1) - at.y(0) : at.x(1) - at.x(0);
        gap = Math.min(gap, (dotOpening(span, at).open * inner - t) * w / (span.axis ? axes.ty : axes.tx));
      });
      return gap;
    };
    var floor = DENSITY_MIN_GAP * w;
    if (narrowest(k) >= floor) {
      return k;
    }
    if (narrowest(DENSITY_HARD_FLOOR) < floor) {
      return DENSITY_HARD_FLOOR;
    }
    var low = DENSITY_HARD_FLOOR;
    var high = k;
    for (var step = 0; step < 24; step += 1) {
      var middle = (low + high) / 2;
      if (narrowest(middle) >= floor) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return low;
  }

  /* 꼭지 틈을 연다 — 놓인 단위 좌표(머리 음절이면 2층 재귀가 옮긴 자리)에서 마주 보는 마디가 놓을 굵기의 1.6배보다 가까우면
   * 너머 획을 너머 끝을 둔 채 눌러 옮긴다. [{ spans, from, to }](remapUnit 범위) */
  function dotShifts(node, axes) {
    var out = [];
    ((DOT_GROUPS && DOT_GROUPS.get(node)) || []).forEach(function (group) {
      var spans = group[0].concat(group[1]);
      var items = spans.map(function (span, index) {
        var unit = ELEMENT_UNITS.get(span);
        return !unit ? null : unit.ring ? ringBox(unit.ring).concat([2]) : unit.box ? unit.box.concat([2]) :
          unit.line.slice(0, 4).concat([index < group[0].length ? 1 : 0]);
      });
      group[0].forEach(function (dot, index) {
        var span = items.indexOf(null) < 0 && items[index][4] === 1 ? dotSpan(items[index], items) : null;
        var open = span ? dotOpening(span, axes).open : 0;
        if (!span || !(open > Math.abs(span.face - span.dot) + 1e-6)) {
          return;
        }
        var from = [0, 0, 1, 1];
        var to = [0, 0, 1, 1];
        var face = span.dot + (span.face > span.dot ? open : -open);
        from[span.axis] = Math.min(span.face, span.far);
        from[span.axis + 2] = Math.max(span.face, span.far);
        to[span.axis] = Math.min(face, span.far);
        to[span.axis + 2] = Math.max(face, span.far);
        out.push({ spans: span.moved.map(function (at) { return spans[at]; }), from: from, to: to });
      });
    });
    return out;
  }

  /* 노드의 간격 마디 — 머리 음절이면 2층 재귀가 옮긴 자리로 */
  function densityGroups(node) {
    var groups = DENSITY_LINES ? DENSITY_LINES.get(node) : null;
    var fits = groups ? DENSITY_FITS.get(node) : null;
    return !groups ? [] : !fits ? groups : groups.map(function (lines, index) {
      var fit = fits[index];
      return fit ? lines.map(function (line) { return remapUnit({ line: line.slice(0, 4).concat([0, 0]) }, fit[0], fit[1]).line.slice(0, 4).concat(line.slice(4)); }) : lines;
    });
  }

  /* base: ELEMENT_UNITS에 남길 단위(꼭지 틈은 옮기기 전 것) */
  function placeElement(span, unit, axes, base) {
    var x = axes.x;
    var y = axes.y;
    if (unit.ring) {
      span.style.setProperty("--fy-el-cx", round4(x(unit.ring[0])) + "em");
      span.style.setProperty("--fy-el-cy", round4(y(unit.ring[1])) + "em");
      span.style.setProperty("--fy-el-rx", round4(unit.ring[2] * (x(1) - x(0))) + "em");
      span.style.setProperty("--fy-el-ry", round4(unit.ring[3] * (y(1) - y(0))) + "em");
    } else if (unit.box) {
      /* 한 축이 선 하나라 두께가 없으면 그 굵기만큼 넓힌다 */
      var left = x(unit.box[0]);
      var top = y(unit.box[1]);
      var width = x(unit.box[2]) - left;
      var height = y(unit.box[3]) - top;
      if (width < axes.tx) { left -= (axes.tx - width) / 2; width = axes.tx; }
      if (height < axes.ty) { top -= (axes.ty - height) / 2; height = axes.ty; }
      span.style.setProperty("--fy-el-x", round4(left) + "em");
      span.style.setProperty("--fy-el-y", round4(top) + "em");
      span.style.setProperty("--fy-el-bw", round4(width) + "em");
      span.style.setProperty("--fy-el-bh", round4(height) + "em");
    } else {
      var x1 = x(unit.line[0]);
      var y1 = y(unit.line[1]);
      var dx = x(unit.line[2]) - x1;
      var dy = y(unit.line[3]) - y1;
      span.style.setProperty("--fy-el-x", round4(x1) + "em");
      span.style.setProperty("--fy-el-y", round4(y1) + "em");
      span.style.setProperty("--fy-el-len", round4(Math.sqrt(dx * dx + dy * dy)) + "em");
      span.style.setProperty("--fy-el-angle", round4(Math.atan2(dy, dx) * 180 / Math.PI) + "deg");
    }
    if (ELEMENT_UNITS) {
      ELEMENT_UNITS.set(span, base || unit);
    }
  }

  /* 그림 하나를 획들의 상자(뼈대 좌표 → 노드 em)에 맞춰 놓는다. */
  function appendDrawing(hoek, set, key, strokes, axes, doc) {
    var span = doc.createElement("span");
    span.setAttribute("part", "element");
    span.setAttribute("data-element", "box");
    placeElement(span, { box: strokesExtent(strokes) }, axes);
    span.appendChild(boxCell(set, key, doc));
    hoek.appendChild(span);
  }

  /* 획 하나: 마디마다 그림 열쇠(alias — 원소 그림 @line·@dot·@ring 또는 원형 그림 ㅡ·ㆍ·ㅇ, 해석기가 보이는 칸으로 고른다)를
   * 마디 길이 × 획 굵기 상자에 돌려 놓는다(동그라미는 고리 상자). 열쇠가 없으면 CSS 상자 */
  function appendStroke(hoek, set, stroke, alias, axes, doc) {
    (stroke.ring ? [stroke] : stroke).forEach(function (piece) {
      var span = doc.createElement("span");
      span.setAttribute("part", "element");
      if (piece.ring) {
        span.setAttribute("data-element", "ring");
        placeElement(span, { ring: piece.ring }, axes);
      } else {
        span.setAttribute("data-element", "line");
        placeElement(span, { line: piece }, axes);
        span.style.setProperty("--fy-el-s", String(piece[4]));
        span.style.setProperty("--fy-el-e", String(piece[5]));
      }
      if (set && alias) {
        span.setAttribute("data-element-drawing", alias);
        span.appendChild(boxCell(set, alias, doc));
      }
      hoek.appendChild(span);
    });
  }

  /* 칸 계약 그림 하나의 <svg>. viewBox는 세트가 밝힌 그림 범위(box)라 그 범위가 놓일 상자를 채운다. */
  function boxCell(set, key, doc) {
    var cache = set.templates ? set.templates.get(doc) : null;
    if (!cache) {
      cache = Object.create(null);
      if (set.templates) {
        set.templates.set(doc, cache);
      }
    }
    if (!cache[key]) {
      var svg = doc.createElementNS(SVG_NS, "svg");
      var b = set.cellBoxes[key] || set.box;
      svg.setAttribute("part", "vector");
      svg.setAttribute("viewBox", b[0] + " " + b[1] + " " + (b[2] - b[0]) + " " + (b[3] - b[1]));
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("data-cell", key);
      svg.setAttribute("stroke-linecap", set.cap);
      svg.setAttribute("stroke-linejoin", set.join);
      set.cells[key].forEach(function (shape) {
        var element;
        if (shape.type === "path") {
          element = doc.createElementNS(SVG_NS, "path");
          element.setAttribute("d", shape.d);
        } else {
          element = doc.createElementNS(SVG_NS, "ellipse");
          ["cx", "cy", "rx", "ry"].forEach(function (attribute, index) {
            element.setAttribute(attribute, String(shape.values[index]));
          });
        }
        if (shape.fill) {
          element.setAttribute("data-fill", "");
        }
        svg.appendChild(element);
      });
      cache[key] = svg;
    }
    return cache[key].cloneNode(true);
  }

  /* slot이 자모를 가로·세로로 다르게 늘여도 획 굵기가 고르게: 노드의 실제 변환에서 획의 굵기 방향(법선)과
   * 길이 방향이 늘어난 배율을 재서 그만큼 되돌린다(--fy-el-k 굵기, --fy-el-kd 끝 늘이기). SVG 재료의 그림 <svg>도
   * 같은 값으로 되돌린다(font-kku.css) — non-scaling-stroke가 노드 변환을 빼지 않아서다. 획이 촘촘한 노드는 밀도 굵기
   * 계수(--fy-el-density)로 가늘게 한다(strokeDensity). 노드마다 계산된 스타일을 한 번씩 읽으므로 일괄 렌더가 끝난 뒤
   * 한꺼번에 한다. */
  function balanceElementStrokes(hosts) {
    var work = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var face = state && state.options.fontMeta.face;
      if (!state || (face !== "element" && face !== "svg") || !host.isConnected) {
        return;
      }
      /* 그려지지 않은 바탕 요소(display: none 안 — 닫힌 탭·접힌 칸)는 변환이 none이라 배율 1로 굳는다. 보일 때 다시 맞춘다 */
      if (unrenderedHost(host)) {
        deferHost(host);
        return;
      }
      var root = getManagedRoot(host);
      /* 세벌 고정 도장의 밀도 계수는 프로파일 굵기(stroke, 바탕 em)로 셈했다 — 바탕 요소의 실제 굵기가 다르면 노드마다 다시 셈한다 */
      var profile = fixedLayout(state.options.fontMeta);
      var hostStyle = profile ? computedStyleFor(host) : null;
      var follow = Boolean(hostStyle) && typeof profile.stroke === "number" &&
        Math.abs(parseFloat(hostStyle.getPropertyValue("--fy-el-w")) / (parseFloat(hostStyle.fontSize) || 1) - profile.stroke) > 1e-4;
      if (root) {
        Array.prototype.forEach.call(root.querySelectorAll(DRAWN_NODES), function (node) {
          if (node.querySelector('[part="element"]')) {
            work.push([node, follow]);
          }
        });
      }
    });
    var reads = work.map(function (item) {
      var style = computedStyleFor(item[0]);
      var match = style ? /matrix\(([^)]+)\)/.exec(style.transform || "") : null;
      return {
        m: match ? match[1].split(",").map(Number) : [1, 0, 0, 1],
        /* 획 굵기(바탕 요소에서 굳힌 길이)를 노드 em으로 */
        w: style ? parseFloat(style.getPropertyValue("--fy-el-w")) / (parseFloat(style.fontSize) || 1) : NaN
      };
    });
    work.forEach(function (item, index) {
      balanceElementNode(item[0], reads[index].m, reads[index].w, item[1]);
    });
  }

  /* 노드 하나의 굵기 보정 — m은 노드의 계산된 변환 [a, b, c, d], w는 노드에서 보이는 획 굵기(노드 em). 밀도 굵기 계수를 정하고
   * (도장 값, 아니면 strokeDensity) 그 굵기로 마디·원·그림 상자를 다시 놓은 뒤(꼭지 틈은 dotShifts), 굵기 되돌림을 적는다.
   * 정적 렌더러의 원소 획 표(scripts/generate_sidecar_tables.js)가 이 함수와 아래 셈을 그대로 빌려 굳힌다(ADR-027) —
   * DOM은 노드·마디의 style과 [part="element"]·칠 그림 찾기만 쓴다. */
  function balanceElementNode(node, m, w, follow) {
    var stretch = function (ux, uy) {
      var vx = m[0] * ux + m[2] * uy;
      var vy = m[1] * ux + m[3] * uy;
      return Math.sqrt(vx * vx + vy * vy) || 1;
    };
    var box = ELEMENT_UNITS ? ELEMENT_UNITS.get(node) : null;
    var axes = box && w > 0 ? elementAxes(box, w / stretch(1, 0), w / stretch(0, 1)) : null;
    /* 낱자 틈(병서·겹받침) — 요청 굵기 w로 놓은 자리에서 정한다(밀도 계수의 셈과 같은 자리). 그림 한 장이 두 낱자를 함께 그린
     * 묶음(칸 계약 세트의 ㄲ@bar)은 옮길 수 없어 낱자로 나누지 않는다 */
    var members = LETTER_GROUPS ? LETTER_GROUPS.get(node) || [] : [];
    var groups = axes ? densityGroups(node).map(function (lines, index) {
      return members.some(function (member) { return member[0] === index; }) ? lines :
        lines.map(function (line) { return line[7] === 0 || line[7] === 1 ? line.slice(0, 7).concat([-1]) : line; });
    }) : [];
    var letters = axes ? letterFits(groups, axes, m, w) : [];
    /* 밀도 굵기 계수(--fy-el-density): 도장 값(코어 CSS가 도장에서 받는다), 아니면 뼈대로 셈한다. 도장 값은 도장을 지은 굵기
     * (프로파일 stroke, sebul 원소 굵기 0.1em)의 셈이라, 페이지가 굵기를 바꾸면(follow) 그 굵기로 다시 셈해 노드에 적는다 —
     * 같은 바탕 요소의 같은 도장은 같은 굵기라 고정성(L01)은 그대로다. 칠 그림(붓 세트)은 굵기가 그림에 있어 1이다.
     * 그 굵기로 다시 놓는다 */
    var stamped = node.style.getPropertyValue("--fy-stamp-density");
    var density = 1;
    if (node.querySelector('[part="vector"] > [data-fill]')) {
      if (stamped) {
        node.style.setProperty("--fy-el-density", "1");
      } else {
        node.style.removeProperty("--fy-el-density");
      }
    } else if (stamped && !(follow && axes)) {
      density = parseFloat(stamped) || 1;
      node.style.removeProperty("--fy-el-density");
    } else {
      density = axes ? round4(strokeDensity(groups, axes, m, w)) : 1;
      if (density < 1 || stamped) {
        node.style.setProperty("--fy-el-density", String(density));
      } else {
        node.style.removeProperty("--fy-el-density");
      }
    }
    if (axes && density < 1) {
      axes = elementAxes(box, density * w / stretch(1, 0), density * w / stretch(0, 1));
    }
    var shifts = axes ? dotShifts(node, axes) : [];
    Array.prototype.forEach.call(node.querySelectorAll('[part="element"]'), function (span) {
      var unit = axes ? ELEMENT_UNITS.get(span) : null;
      if (unit) {
        var moved = unit;
        letters.forEach(function (fit) {
          members.forEach(function (member) {
            var side = member[0] !== fit.group ? -1 : member[1].indexOf(span) >= 0 ? 0 : member[2].indexOf(span) >= 0 ? 1 : -1;
            if (side >= 0) {
              moved = remapUnit(moved, [fit.from[side][0], 0, fit.from[side][1], 1], [fit.to[side][0], 0, fit.to[side][1], 1]);
            }
          });
        });
        shifts.forEach(function (shift) {
          if (shift.spans.indexOf(span) >= 0) {
            moved = remapUnit(moved, shift.from, shift.to);
          }
        });
        placeElement(span, moved, axes, unit);
      }
      var type = span.getAttribute("data-element");
      if (type === "ring") {
        span.style.setProperty("--fy-el-kx", String(round4(1 / stretch(1, 0))));
        span.style.setProperty("--fy-el-ky", String(round4(1 / stretch(0, 1))));
        return;
      }
      /* 그림 상자(box)는 돌리지 않은 마디와 같다 — --fy-el-kd(1/가로 배율)·--fy-el-k(1/세로 배율)로 그림 <svg>를 되돌린다 */
      var angle = type === "line" ? (parseFloat(span.style.getPropertyValue("--fy-el-angle")) * Math.PI / 180 || 0) : 0;
      span.style.setProperty("--fy-el-k", String(round4(1 / stretch(-Math.sin(angle), Math.cos(angle)))));
      span.style.setProperty("--fy-el-kd", String(round4(1 / stretch(Math.cos(angle), Math.sin(angle)))));
    });
  }

  /* 머리 음절의 2층 재귀(한글 원리 렌더링 §10, ADR-024 §2). 음절 깊이의 합자 모음(과 = 고 + ㅏ)은 머리 음절 노드 하나에 초성·모음
   * 두 획 묶음(data-fy-head-part initial·medial)을 그린다. 뼈대의 머리는 글꼴과 무관한 쌓기 근사라, 그려진 뒤 그 글꼴이 받침 없는
   * 음절("고")을 짜는 모양 — 초성 t·중성 m 자리, 자모·문맥 규칙, 자르기 — 을 숨은 시험 음절로 재서 두 묶음을 머리 상자 안에서 그
   * 비례로 옮긴다. 글꼴 CSS가 바뀌면(restyle) 다시 재므로 머리도 따라온다. 옮기는 것은 자리뿐이다 — 디자인 규칙은 바깥 음절의
   * 문맥으로 이미 골랐다(ADR-025 §6, 설계 v1.1 §10.6 범위 배치: 맨 위 문자열을 다시 풀지 않는다). 원소·SVG 재료만 —
   * 세벌 고정(머리 없음)·기기 글꼴(완성형 머리 글자)·글꼴 팔레트 잎은 그대로다. 잴 수 없으면 뼈대 쌓기가 남는다. */
  var HEAD_BASE_UNITS = typeof WeakMap === "function" ? new WeakMap() : null;
  var HEAD_PARTS = ["initial", "medial"];

  function fitHeadSyllables(hosts) {
    if (!ELEMENT_UNITS || !HEAD_BASE_UNITS) {
      return;
    }
    var work = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var meta = state && state.options.fontMeta;
      if (!meta || (meta.face !== "element" && meta.face !== "svg") || fixedLayout(meta) || !host.isConnected) {
        return;
      }
      var root = getManagedRoot(host);
      var reference = inkBoxes(meta.inkBoxes);
      if (!root || !reference || typeof root.querySelectorAll !== "function") {
        return;
      }
      var texts = Object.create(null);
      Array.prototype.forEach.call(root.querySelectorAll('[data-fy-role="head"]'), function (node) {
        var text = node.getAttribute("data-jamo");
        if (reference[text] && node.querySelector(':scope > [part="hoek"][data-fy-head-part]')) {
          (texts[text] = texts[text] || []).push(node);
        }
      });
      if (!Object.keys(texts).length || typeof root.getBoundingClientRect !== "function") {
        return;
      }
      if (unrenderedHost(host)) {
        deferHost(host);
        return;
      }
      work.push({ host: host, state: state, root: root, reference: reference, stroke: INK_BOXES[meta.inkBoxes].stroke,
        texts: texts, probes: Object.create(null), pending: [] });
    });
    if (!work.length) {
      return;
    }
    /* 쓰기: 바탕 요소마다 머리 글자마다 받침 없는 음절 하나를 관리 root 안에 숨겨 둔다 — 그 바탕 요소의 글꼴·페이지 값이 그대로
     * 닿는다. 움직임·변주는 끈다. 노드 안 빈 획 하나가 자리 자르기(--fy-slot-clip)를 푼다 */
    work.forEach(function (item) {
      var observer = item.state.observer;
      item.pending = observer ? observer.takeRecords() : [];
      var outerDocument = renderDocument;
      var outerSprite = renderSpriteMaterial;
      renderDocument = item.host.ownerDocument;
      renderSpriteMaterial = false;
      try {
        Object.keys(item.texts).forEach(function (text) {
          var glyph = renderHangulGlyph(decomposeGlyph(text, 0, item.state.options.depthOptions), 0);
          glyph.setAttribute("data-fy-probe", "");
          quietProbe(glyph);
          glyph.style.setProperty("position", "absolute", "important");
          glyph.style.setProperty("inset-inline-start", "0");
          glyph.style.setProperty("inset-block-start", "0");
          glyph.style.setProperty("visibility", "hidden", "important");
          glyph.style.setProperty("pointer-events", "none");
          Array.prototype.forEach.call(glyph.querySelectorAll('[part~="glyph-body"], [part~="jamo"]'), function (node) {
            quietProbe(node);
            var box = node.getAttribute("part") === "glyph-body" ? null : item.reference[node.getAttribute("data-jamo")];
            if (box) {
              node.style.setProperty("--fy-face-width", round4(box[4]) + "em");
              var hoek = renderDocument.createElement("span");
              hoek.setAttribute("part", "hoek");
              node.appendChild(hoek);
            }
          });
          item.root.appendChild(glyph);
          item.probes[text] = glyph;
        });
      } finally {
        renderDocument = outerDocument;
        renderSpriteMaterial = outerSprite;
      }
    });
    /* 읽기: 한 번의 배치 계산으로 시험 음절마다 초성·중성의 잉크 영역(표준 잉크 상자 ∩ 자르기, 화면 좌표) */
    var probes = [];
    work.forEach(function (item) {
      Object.keys(item.probes).forEach(function (text) {
        var glyph = item.probes[text];
        var regions = [glyph.querySelector('[part~="choseong"]'), glyph.querySelector('[part~="jungseong"]')].map(function (node) {
          return node ? probeRegion(node, item.reference) : null;
        });
        item.probes[text] = regions[0] && regions[1] ? regions : null;
        probes.push(glyph);
      });
      /* 머리 노드마다 실제 획 굵기(노드 em, 가로·세로) — 굵기 보정(balanceElementStrokes)과 같은 셈이라 그 단위 상자에 맞춘다 */
      Object.keys(item.texts).forEach(function (text) {
        item.texts[text] = item.texts[text].map(function (node) {
          return { node: node, stroke: nodeStroke(computedStyleFor(node), item.stroke) };
        });
      });
    });
    probes.forEach(function (glyph) {
      glyph.parentNode.removeChild(glyph);
    });
    work.forEach(function (item) {
      var observer = item.state.observer;
      if (observer) {
        /* 시험 음절을 넣고 뺀 기록은 버리고, 그 앞에 쌓여 있던 기록은 원래대로 넘긴다 */
        observer.takeRecords();
        if (item.pending.length) {
          later(function () { handleHostMutations(item.host, item.pending, observer); });
        }
      }
    });
    /* 맞추기: 두 영역의 합집합을 머리의 표준 잉크 상자로 옮긴 영역에 묶음마다 획을 옮긴다 */
    work.forEach(function (item) {
      Object.keys(item.texts).forEach(function (text) {
        var box = item.reference[text];
        var regions = item.probes[text];
        item.texts[text].forEach(function (entry) {
          var node = entry.node;
          var targets = regions ? headTargets(regions, box, entry.stroke) : null;
          var axes = elementAxes(box, entry.stroke[0], entry.stroke[1]);
          var fits = HEAD_PARTS.map(function (part, index) {
            var spans = node.querySelectorAll(':scope > [part="hoek"][data-fy-head-part="' + part + '"] [part="element"]');
            var bases = Array.prototype.map.call(spans, function (span) {
              var base = HEAD_BASE_UNITS.get(span) || ELEMENT_UNITS.get(span);
              HEAD_BASE_UNITS.set(span, base);
              return base;
            });
            var extent = unitsExtent(bases);
            Array.prototype.forEach.call(spans, function (span, at) {
              if (bases[at]) {
                placeElement(span, targets && extent ? remapUnit(bases[at], extent, targets[index]) : bases[at], axes);
              }
            });
            return targets && extent ? [extent, targets[index]] : null;
          });
          /* 밀도 굵기 계수는 옮긴 자리의 간격으로 셈한다 */
          if (DENSITY_FITS) {
            DENSITY_FITS.set(node, fits);
          }
        });
      });
    });
  }

  /* 시험 음절 노드의 움직임·변주(페이지 레벨 translate·rotate·scale)와 음절·몸통 변환을 끈다 — 자모 노드의 자리(slot 변환)만 잰다 */
  function quietProbe(node) {
    ["animation", "transition", "translate", "rotate", "scale"].forEach(function (name) {
      node.style.setProperty(name, "none", "important");
    });
    if (!/(^| )jamo( |$)/.test(node.getAttribute("part") || "")) {
      node.style.setProperty("transform", "none", "important");
    }
  }

  /* 자모 노드 하나의 잉크 영역(화면 좌표): 표준 잉크 상자(em)를 획 묶음 자리 자르기(inset)로 자르고 노드 상자에서 화면으로 옮긴다 */
  function probeRegion(node, reference) {
    var box = reference[node.getAttribute("data-jamo")];
    var hoek = node.querySelector(':scope > [part="hoek"]');
    var style = box && hoek ? computedStyleFor(node) : null;
    var width = node.offsetWidth;
    var height = node.offsetHeight;
    var size = style ? parseFloat(style.fontSize) : NaN;
    var rect = style ? node.getBoundingClientRect() : null;
    if (!rect || !(width > 0 && height > 0 && size > 0 && rect.width > 0 && rect.height > 0)) {
      return null;
    }
    var clip = insetClip(computedStyleFor(hoek), width, height);
    var local = [Math.max(box[0] * size, clip[0]), Math.max(box[1] * size, clip[1]),
      Math.min(box[2] * size, clip[2]), Math.min(box[3] * size, clip[3])];
    if (!(local[2] > local[0] && local[3] > local[1])) {
      return null;
    }
    /* 노드 변환(slot 배율·기울기, 원점 transform-origin)으로 영역의 네 모서리를 옮긴 상자 — 노드 상자를 같은 변환으로 옮긴
     * 상자가 화면 상자(rect)에 오도록 맞춘다(조상의 배율도 여기서 들어간다) */
    var m = /matrix\(([^)]+)\)/.exec(style.transform || "");
    m = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    var origin = String(style.transformOrigin || "").split(/\s+/).map(parseFloat);
    var ox = origin[0] || 0;
    var oy = origin[1] || 0;
    var span = function (l, t, r, b) {
      var xs = [];
      var ys = [];
      [[l, t], [r, t], [l, b], [r, b]].forEach(function (p) {
        xs.push(m[0] * (p[0] - ox) + m[2] * (p[1] - oy));
        ys.push(m[1] * (p[0] - ox) + m[3] * (p[1] - oy));
      });
      return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    };
    var frame = span(0, 0, width, height);
    var ink = span(local[0], local[1], local[2], local[3]);
    var sx = rect.width / (frame[2] - frame[0] || 1);
    var sy = rect.height / (frame[3] - frame[1] || 1);
    return [rect.left + (ink[0] - frame[0]) * sx, rect.top + (ink[1] - frame[1]) * sy,
      rect.left + (ink[2] - frame[0]) * sx, rect.top + (ink[3] - frame[1]) * sy];
  }

  /* 계산된 clip-path가 inset(위 오른 아래 왼 [round …])이면 노드 상자(px) 안의 [왼, 위, 오른, 아래], 아니면 자르지 않음 —
   * 다른 모양(polygon 같은)은 자르지 않은 영역으로 잰다 */
  function insetClip(style, width, height) {
    var open = [-Infinity, -Infinity, Infinity, Infinity];
    var match = style ? /^inset\(([^()]*)\)$/.exec(String(style.clipPath || style.webkitClipPath || "").trim()) : null;
    var values = match ? match[1].split(/\s+round\s+/)[0].trim().split(/\s+/) : [];
    if (!values.length || values.length > 4) {
      return open;
    }
    var side = [values[0], values[1] || values[0], values[2] || values[0], values[3] || values[1] || values[0]];
    var length = function (token, size) {
      return /^-?[\d.]+(?:e-?\d+)?(?:px)?$/i.test(token) ? parseFloat(token) :
        /^-?[\d.]+(?:e-?\d+)?%$/i.test(token) ? parseFloat(token) / 100 * size : NaN;
    };
    var top = length(side[0], height);
    var right = length(side[1], width);
    var bottom = length(side[2], height);
    var left = length(side[3], width);
    return [top, right, bottom, left].some(isNaN) ? open : [left, top, width - right, height - bottom];
  }

  /* 두 영역(화면)의 합집합을 머리 상자 box(em)로 옮긴 영역을 획 중심선의 단위 좌표(elementAxes의 0–1, 실제 획 굵기 stroke =
   * [가로, 세로] em로 줄인 상자)로 — 묶음마다 [x0, y0, x1, y1]. 단위 0–1의 잉크가 그 영역을 채운다. 획 굵기보다 얇은 축은 가운데 한 줄 */
  function headTargets(regions, box, stroke) {
    var union = [Math.min(regions[0][0], regions[1][0]), Math.min(regions[0][1], regions[1][1]),
      Math.max(regions[0][2], regions[1][2]), Math.max(regions[0][3], regions[1][3])];
    var width = box[2] - box[0] - stroke[0];
    var height = box[3] - box[1] - stroke[1];
    if (!(union[2] > union[0] && union[3] > union[1] && width > 0 && height > 0)) {
      return null;
    }
    var x = function (v) { return (v - union[0]) / (union[2] - union[0]) * (box[2] - box[0]); };
    var y = function (v) { return (v - union[1]) / (union[3] - union[1]) * (box[3] - box[1]); };
    return regions.map(function (region) {
      var unit = [x(region[0]) / width, y(region[1]) / height, (x(region[2]) - stroke[0]) / width, (y(region[3]) - stroke[1]) / height];
      if (unit[2] < unit[0]) { unit[0] = unit[2] = (unit[0] + unit[2]) / 2; }
      if (unit[3] < unit[1]) { unit[1] = unit[3] = (unit[1] + unit[3]) / 2; }
      return unit;
    });
  }

  /* 노드에서 보이는 획 굵기(노드 em, [가로, 세로]) — 굵기 보정과 같다: 바탕 요소에서 굳힌 --fy-el-w를 노드 변환이 그 방향으로
   * 늘인 배율로 나눈다. 읽을 수 없으면 기준 굵기 */
  function nodeStroke(style, fallback) {
    var match = style ? /matrix\(([^)]+)\)/.exec(style.transform || "") : null;
    var m = match ? match[1].split(",").map(Number) : [1, 0, 0, 1];
    var w = style ? parseFloat(style.getPropertyValue("--fy-el-w")) / (parseFloat(style.fontSize) || 1) : NaN;
    var sx = Math.sqrt(m[0] * m[0] + m[1] * m[1]) || 1;
    var sy = Math.sqrt(m[2] * m[2] + m[3] * m[3]) || 1;
    return w > 0 ? [w / sx, w / sy] : [fallback, fallback];
  }

  /* 단위 좌표 묶음(마디·원·그림 상자)의 범위 [x0, y0, x1, y1] */
  function unitsExtent(units) {
    var extent = [Infinity, Infinity, -Infinity, -Infinity];
    units.forEach(function (unit) {
      var points = !unit ? [] : unit.ring ? [[unit.ring[0] - unit.ring[2], unit.ring[1] - unit.ring[3]], [unit.ring[0] + unit.ring[2], unit.ring[1] + unit.ring[3]]] :
        unit.box ? [[unit.box[0], unit.box[1]], [unit.box[2], unit.box[3]]] : [[unit.line[0], unit.line[1]], [unit.line[2], unit.line[3]]];
      points.forEach(function (point) {
        extent[0] = Math.min(extent[0], point[0]);
        extent[1] = Math.min(extent[1], point[1]);
        extent[2] = Math.max(extent[2], point[0]);
        extent[3] = Math.max(extent[3], point[1]);
      });
    });
    return extent[2] >= extent[0] ? extent : null;
  }

  /* 단위 하나를 범위 from에서 to로 축마다 옮긴다(범위가 한 줄이면 to의 가운데) — 원의 반지름은 축 배율만큼, 마디 끝 늘이기는 그대로 */
  function remapUnit(unit, from, to) {
    var scale = function (axis) {
      var span = from[axis + 2] - from[axis];
      return span > 1e-6 ? (to[axis + 2] - to[axis]) / span : 0;
    };
    var move = function (value, axis) {
      var span = from[axis + 2] - from[axis];
      return span > 1e-6 ? to[axis] + (value - from[axis]) * scale(axis) : (to[axis] + to[axis + 2]) / 2;
    };
    if (unit.ring) {
      return { ring: [move(unit.ring[0], 0), move(unit.ring[1], 1), unit.ring[2] * scale(0), unit.ring[3] * scale(1)] };
    }
    if (unit.box) {
      return { box: [move(unit.box[0], 0), move(unit.box[1], 1), move(unit.box[2], 0), move(unit.box[3], 1)] };
    }
    return { line: [move(unit.line[0], 0), move(unit.line[1], 1), move(unit.line[2], 0), move(unit.line[3], 1), unit.line[4], unit.line[5]] };
  }

  /* 그려지지 않은 바탕 요소(첫 음절 상자에 화면 상자가 없다 — display: none 안). 상자를 잴 수 없는 환경이면 그려졌다고 본다 */
  function unrenderedHost(host) {
    var root = getManagedRoot(host);
    var glyph = root && typeof root.querySelector === "function" ? root.querySelector('[part~="glyph"]') : null;
    return Boolean(glyph) && typeof glyph.getClientRects === "function" && glyph.getClientRects().length === 0;
  }

  /* 미룬 맞춤: 그려지지 않은 바탕 요소는 첫 음절 상자를 ResizeObserver로 지켜보다가 상자가 생기면 머리 재귀·굵기 보정을 다시 하고
   * font-kku:render(restyle)를 낸다. ResizeObserver가 없으면 예전처럼(굵기 배율 1, 머리는 뼈대 쌓기) 남는다. */
  var DEFERRED_TARGETS = typeof Map === "function" ? new Map() : null;
  var DEFERRED_BY_HOST = typeof WeakMap === "function" ? new WeakMap() : null;
  var DEFER_OBSERVERS = typeof WeakMap === "function" ? new WeakMap() : null;

  function deferHost(host) {
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    var Observer = view && view.ResizeObserver;
    var root = getManagedRoot(host);
    var target = root ? root.querySelector('[part~="glyph"]') : null;
    if (typeof Observer !== "function" || !DEFERRED_TARGETS || !DEFERRED_BY_HOST || !DEFER_OBSERVERS || !target) {
      return;
    }
    /* 다시 그려졌거나 문서에서 빠진 바탕 요소의 옛 음절 상자는 놓는다 */
    DEFERRED_TARGETS.forEach(function (entry, node) {
      if (!node.isConnected) {
        entry.observer.unobserve(node);
        DEFERRED_TARGETS.delete(node);
      }
    });
    if (DEFERRED_BY_HOST.get(host) === target && DEFERRED_TARGETS.has(target)) {
      return;
    }
    var observer = DEFER_OBSERVERS.get(view);
    if (!observer) {
      observer = new Observer(resumeDeferred);
      DEFER_OBSERVERS.set(view, observer);
    }
    DEFERRED_BY_HOST.set(host, target);
    DEFERRED_TARGETS.set(target, { host: host, observer: observer });
    observer.observe(target);
  }

  function resumeDeferred(entries) {
    var ready = [];
    entries.forEach(function (entry) {
      var target = entry.target;
      var deferred = DEFERRED_TARGETS.get(target);
      var rect = entry.contentRect;
      if (!deferred || !rect || (!rect.width && !rect.height)) {
        return;
      }
      deferred.observer.unobserve(target);
      DEFERRED_TARGETS.delete(target);
      var host = deferred.host;
      if (DEFERRED_BY_HOST.get(host) === target) {
        DEFERRED_BY_HOST.delete(host);
      }
      if (STATE.get(host) && host.isConnected && host.contains(target) && ready.indexOf(host) < 0) {
        ready.push(host);
      }
    });
    if (ready.length) {
      fitHeadSyllables(ready);
      balanceElementStrokes(ready);
      ready.forEach(function (host) {
        dispatchRender(host, "restyle");
      });
    }
  }

  /* 지금 하던 일을 마친 뒤(마이크로태스크) */
  function later(callback) {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(callback);
    } else if (typeof Promise === "function") {
      Promise.resolve().then(callback);
    } else {
      setTimeout(callback, 0);
    }
  }

  function round4(value) {
    return Math.round(value * 10000) / 10000;
  }

  /* 디자인 고르기(ADR-025 §2): 페이지 --fy-design이 글꼴 --fy-font-design을 이긴다. legacy는 물려받은 선택을 끊고 지금 설정으로
   * 그린다. 등록된 디자인이면 재료(face)와 글꼴 글자의 family를 디자인이 정하고, 깊이 고정은 쓰지 않는다. 고르지 못한 이름은
   * 지금 설정으로 그리고 진단을 남긴다(data-fy-design-status) — 미등록 이름은 등록되는 순간 다시 그린다. */
  function readDesignToken(style) {
    return (readIdent(style, "--fy-design") || readIdent(style, "--fy-font-design")).toLowerCase();
  }

  function designTokenValid(token) {
    var name = normalizeJamoSetName(token);
    return name && !own(DESIGN_RESERVED, name) ? name : null;
  }

  function readHostDesign(style, meta, implicitFont) {
    var token = readDesignToken(style);
    if (token === "legacy") {
      return;
    }
    /* 디자인을 고르지 못하면 배치는 디자인이 없는 경우와 같다 */
    meta.layout = implicitFont ? LAYOUT_DEFAULT : "";
    if (!token) {
      return;
    }
    var name = designTokenValid(token);
    if (!name) {
      meta.designStatus = "DESIGN_TOKEN_INVALID";
      return;
    }
    meta.design = name;
    var design = DESIGNS[name];
    if (!design) {
      meta.designStatus = "DESIGN_NOT_REGISTERED";
      return;
    }
    meta.layout = design.layout ? design.layout.profile : "";
    meta.layoutRequested = design.layout && design.layout.requested ? design.layout.requested : "";
    meta.designRevision = design.revision;
    meta.face = design.face;
    if (design.mode === "font") {
      meta.family = designFamily(design.sources[design.defaults.source]);
    }
  }

  /* 디자인을 받지 않는 바탕 요소 — 그림 자소 재료(sprite·vector)이거나 표준 잉크 상자를 밝히지 않은(페이지 --fy-ink-boxes: none으로
   * 끈) 글꼴. 디자인을 고르면 지금 설정으로 그리고 까닭을 DESIGN_UNSUPPORTED_FONT로 남긴다(전에는 말없이 무시했다). 이름 문법이
   * 틀렸으면 그 진단이 먼저고, legacy는 고른 것이 아니다. 이름은 들고 있지 않는다 — 등록·교체가 이 바탕 요소를 바꾸지 못한다. */
  function refuseHostDesign(style, meta) {
    var token = readDesignToken(style);
    if (token && token !== "legacy") {
      meta.designStatus = designTokenValid(token) ? DESIGN_UNSUPPORTED : "DESIGN_TOKEN_INVALID";
    }
  }

  /* 글꼴 소스를 CSS font-family 값으로 — 이름은 따옴표로 감싸고, 기기에 없으면 기본 한글 글꼴로 */
  function designFamily(source) {
    return JSON.stringify(source.family) + ", " + FACE_DEFAULT_FAMILY;
  }

  function readHostStyle(host, font, implicitFont) {
    var style = computedStyleFor(host);
    /* page longhand ?? page shorthand ?? font longhand ?? font shorthand ?? 기본값
     * — 페이지가 폰트의 depth를 항상 이긴다(ADR-008 §1 page 레벨). */
    var pageDepth = readDepthLevel(style, PAGE_DEPTH_VARIABLES);
    var fontDepth = readDepthLevel(style, FONT_DEPTH_VARIABLES);
    var contract = parseInt(readIdent(style, "--fy-contract"), 10);
    var meta = {
      id: readIdent(style, "--fy-font-id"),
      contract: isNaN(contract) ? null : contract,
      material: readIdent(style, "--fy-material").toLowerCase() || "system",
      spriteKinds: "",
      spritePaint: "",
      glow: "",
      face: "",
      inkBoxes: "",
      family: "",
      cap: "",
      design: "",
      designRevision: "",
      designStatus: "",
      layout: "",
      layoutRequested: ""
    };
    if (meta.material === "sprite") {
      /* 시트에 칸이 있는 자모 종류. 코어 sprite 재료 규칙이 이 목록으로 게이트해,
       * 칸이 없는 종류(예: 2행 시트의 겹받침)는 원본 글자로 폴백된다. */
      meta.spriteKinds = readIdent(style, "--fy-sprite-kinds").toLowerCase().split(/\s+/).filter(function (kind) {
        return kind === "consonant" || kind === "vowel" || kind === "coda-cluster";
      }).join(" ");
      /* 마스크 칠: 자소판을 마스크로 쓰고 칠은 CSS(--fy-sprite-fill, 기본 글자 색)로. */
      meta.spritePaint = readIdent(style, "--fy-sprite-paint").toLowerCase() === "mask" ? "mask" : "";
    }
    if (meta.material === "system") {
      /* 빛 칠(ADR-021): 기기 글꼴이 빛번짐을 filter로 주면 글자는 ::before가 그리고 slot clip을
       * 받아, 자른 선에서 빛이 끊기지 않는다. 페이지 --fy-glow가 글꼴 값을 이기고 none이면 끈다. */
      var glow = readIdent(style, "--fy-glow") || readIdent(style, "--fy-font-glow");
      meta.glow = glow && glow.toLowerCase() !== "none" ? "filter" : "";
      /* 기기 글꼴 맞춤(ADR-023): 글꼴이 표준 잉크 상자를 밝히면 어느 기기에서나 맞춘다. 페이지
       * --fy-ink-boxes가 글꼴 값을 이기고 none이면 끈다(기기 글꼴의 조합용 자모를 그대로 그린다). */
      var boxTable = (readIdent(style, "--fy-ink-boxes") || readIdent(style, "--fy-font-ink-boxes")).toLowerCase();
      if (inkBoxes(boxTable) && host.isConnected) {
        /* 재료(ADR-024): device — 기기 글꼴의 낱자를 맞춘다, element — 원소(획)를 CSS 상자로 그린다.
         * 페이지 --fy-face가 글꼴 값을 이긴다. */
        var face = (readIdent(style, "--fy-face") || readIdent(style, "--fy-font-face")).toLowerCase();
        meta.face = face === "element" ? "element" : "device";
        meta.inkBoxes = boxTable;
        meta.family = String(style.getPropertyValue("--fy-font-family") || "").trim() || FACE_DEFAULT_FAMILY;
        var cap = (readIdent(style, "--fy-element-cap") || readIdent(style, "--fy-font-element-cap")).toLowerCase();
        meta.cap = cap === "round" || cap === "butt" ? cap : "square";
        readHostDesign(style, meta, implicitFont);
        /* 빛 칠은 기기 글꼴의 글자를 ::before로 옮기는 장치다. 원소·SVG 재료는 slot clip을 이미 획 묶음이 받고, 꾸밈은
         * 그린 칠(글자 단위 filter)을 쓴다 — 처음 읽을 때는 data-fy-face가 없어 글자 칠 규칙의 빛 변수가 보여도 끈다. */
        if (meta.face !== "device") {
          meta.glow = "";
        }
      }
    }
    if (!meta.inkBoxes && host.isConnected) {
      refuseHostDesign(style, meta);
    }
    if (meta.contract !== null && meta.contract > SUPPORTED_FONT_CONTRACT && !CONTRACT_WARNINGS[font]) {
      CONTRACT_WARNINGS[font] = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("font-kku: font \"" + font + "\" targets contract " + meta.contract +
          " but this runtime supports " + SUPPORTED_FONT_CONTRACT);
      }
    }
    /* 세벌 고정은 합자 모음을 고정 조각으로, 겹받침을 통짜로 그린다 — 깊이 변수보다 앞선다 */
    var fixed = fixedLayout(meta);
    return {
      expressionMode: normalizeExpressionMode(style.getPropertyValue("--fy-expression-mode")),
      depthOptions: fixed ? { vowel: fixed.depth.vowel, coda: fixed.depth.coda } : {
        vowel: pageDepth.vowel || fontDepth.vowel || DEFAULT_VOWEL_DEPTH,
        coda: pageDepth.coda || fontDepth.coda || DEFAULT_CODA_DEPTH
      },
      fontMeta: meta,
      strokeDepth: normalizeStrokeDepth(style.getPropertyValue("--fy-stroke-depth")),
      resolved: host.isConnected === true
    };
  }

  /* Values that change the generated DOM. Font id/contract only feed
   * fontInfo(), so a change there updates state without a rebuild. */
  /* 칸 계약 그림 세트(jamo-set)가 걸린 기기 글꼴 재료는 SVG 그림으로 그린다(ADR-024). 빛 칠은 기기 글꼴 재료만 쓴다. */
  function boxJamoSet(meta, jamoSet) {
    return meta && meta.face && !meta.designRevision && jamoSet && JAMO_SETS[jamoSet] && JAMO_SETS[jamoSet].frame === "box" ? JAMO_SETS[jamoSet] : null;
  }

  function drawnFaceMeta(meta, jamoSet) {
    return boxJamoSet(meta, jamoSet) ? Object.assign({}, meta, { face: "svg", glow: "" }) : meta;
  }

  function sameStructure(style, options) {
    var meta = drawnFaceMeta(style.fontMeta, options.jamoSet);
    return style.expressionMode === options.expressionMode &&
      style.depthOptions.vowel === options.depthOptions.vowel &&
      style.depthOptions.coda === options.depthOptions.coda &&
      style.fontMeta.material === options.fontMeta.material &&
      style.fontMeta.spriteKinds === options.fontMeta.spriteKinds &&
      (style.fontMeta.spritePaint || "") === (options.fontMeta.spritePaint || "") &&
      (meta.glow || "") === (options.fontMeta.glow || "") &&
      (meta.face || "") === (options.fontMeta.face || "") &&
      (style.fontMeta.cap || "") === (options.fontMeta.cap || "") &&
      (style.fontMeta.family || "") === (options.fontMeta.family || "") &&
      (style.fontMeta.design || "") === (options.fontMeta.design || "") &&
      (style.fontMeta.designRevision || "") === (options.fontMeta.designRevision || "") &&
      (style.fontMeta.designStatus || "") === (options.fontMeta.designStatus || "") &&
      (style.fontMeta.layout || "") === (options.fontMeta.layout || "") &&
      (style.strokeDepth || null) === (options.styleStrokeDepth || null);
  }

  function getManagedRoot(host) {
    var children = host.children || [];
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (isElementNode(child) && child.dataset && child.dataset.fyRoot === "true") {
        return child;
      }
    }
    return null;
  }

  function getSrSourceNode(host) {
    var children = host.children || [];
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (isElementNode(child) && child.dataset && child.dataset.fySr === "true") {
        return child;
      }
    }
    return null;
  }

  /* The source text the host's children currently stand for.
   * - no managed root: the children were replaced wholesale → textContent
   * - managed root: the recorded source (runtime state, else data-source,
   *   else the sr-source mirror for a clone or SSR tree without state) —
   *   never the decomposed jamo text. Text or element children added beside
   *   the root and sr-source nodes (host.append("…"), text the HTML parser
   *   delivers after an early upgrade) are new input and join the source in
   *   document order. */
  function readLiveSource(host, state) {
    var root = getManagedRoot(host);
    if (!root) {
      return host.textContent || "";
    }
    var srNode = getSrSourceNode(host);
    var base;
    if (state) {
      base = state.source;
    } else if (host.dataset && host.dataset.source !== undefined) {
      base = host.dataset.source;
    } else {
      base = srNode ? srNode.textContent || "" : "";
    }

    var nodes = host.childNodes || host.children || [];
    var before = "";
    var after = "";
    var seenManaged = false;
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node === root || node === srNode) {
        seenManaged = true;
        continue;
      }
      if (node.nodeType !== 1 && node.nodeType !== 3) {
        continue;
      }
      if (seenManaged) {
        after += node.textContent || "";
      } else {
        before += node.textContent || "";
      }
    }
    return before + base + after;
  }

  function setHostContract(host, source, options) {
    host.dataset.fyUpgraded = "true";
    host.dataset.fyHost = options.hostMode;
    host.dataset.fyExpression = options.expressionMode;
    var depthOptions = options.depthOptions ||
      { vowel: DEFAULT_VOWEL_DEPTH, coda: DEFAULT_CODA_DEPTH };
    host.dataset.fyVowelDepth = depthOptions.vowel;
    host.dataset.fyCodaDepth = depthOptions.coda;
    setResolvedFontSurface(host, options.font, options.hostMode);
    /* 재료 표면은 system이 아닐 때만 찍는다 — system 폰트(사이드카가 렌더하는
     * sebul/gothic)의 DOM 계약은 그대로다. */
    var fontMeta = options.fontMeta || { material: "system", spriteKinds: "" };
    /* 벡터 자소(ADR-013): 등록된 자모 세트가 있으면 그림 자소 배치 폰트를 자소판 대신
     * 자모별 SVG로 그린다. 누락 칸은 코어 sprite 규칙으로 폴백한다. */
    var vectorSet = vectorSetFor(options);
    if (vectorSet) {
      host.dataset.fyMaterial = "vector";
      host.dataset.fyJamoSet = vectorSet.name;
    } else if (fontMeta.material !== "system") {
      host.dataset.fyMaterial = fontMeta.material;
    } else {
      delete host.dataset.fyMaterial;
    }
    if (!vectorSet) {
      delete host.dataset.fyJamoSet;
    }
    /* 획 깊이(ADR-018): 요청이 있을 때만 찍는다 — 벡터 자소면 stroke, 획으로 쪼갤 수 없는
     * 재료(기기 글꼴·자소판)면 jamo로 되돌린 것을 알린다. */
    if ((options.strokeDepth || options.styleStrokeDepth) === "stroke") {
      host.dataset.fyStrokeDepth = vectorSet ? "stroke" : "jamo";
    } else {
      delete host.dataset.fyStrokeDepth;
    }
    if (fontMeta.spritePaint === "mask") {
      host.dataset.fySpritePaint = "mask";
    } else {
      delete host.dataset.fySpritePaint;
    }
    if (fontMeta.glow) {
      host.dataset.fyGlow = fontMeta.glow;
    } else {
      delete host.dataset.fyGlow;
    }
    if (fontMeta.face) {
      host.dataset.fyFace = fontMeta.face;
    } else {
      delete host.dataset.fyFace;
    }
    /* 디자인(ADR-025): 적용된 이름은 data-fy-design, 고르지 못한 까닭은 data-fy-design-status */
    if (fontMeta.designRevision) {
      host.dataset.fyDesign = fontMeta.design;
    } else {
      delete host.dataset.fyDesign;
    }
    if (fontMeta.designStatus) {
      host.dataset.fyDesignStatus = fontMeta.designStatus;
    } else {
      delete host.dataset.fyDesignStatus;
    }
    /* 배치(ADR-026): 프로파일을 쓸 때만 찍는다 — 지금 배치(legacy)는 속성이 없다 */
    var layout = fontMeta.layout ? LAYOUT_PROFILES[fontMeta.layout] : null;
    if (layout) {
      host.dataset.fyLayout = fontMeta.layout;
      host.dataset.fyLayoutModel = layout.model;
    } else {
      delete host.dataset.fyLayout;
      delete host.dataset.fyLayoutModel;
    }
    if ((fontMeta.face === "element" || fontMeta.face === "svg") && fontMeta.cap && fontMeta.cap !== "square") {
      host.dataset.fyElementCap = fontMeta.cap;
    } else {
      delete host.dataset.fyElementCap;
    }
    if (fontMeta.spriteKinds) {
      host.dataset.fySpriteKinds = fontMeta.spriteKinds;
    } else {
      delete host.dataset.fySpriteKinds;
    }
    host.dataset.fySize = options.size;
    host.dataset.fyWrapUnit = options.wrapUnit;

    if (options.spacing) {
      host.dataset.fySpacing = options.spacing;
    } else {
      delete host.dataset.fySpacing;
    }

    if (options.animate) {
      host.dataset.fyAnimate = options.animate;
    } else {
      delete host.dataset.fyAnimate;
    }

    /* Opt-in browser-only surface: absent unless jamo seeding is enabled, so
     * the default DOM contract (spec/html-cases.json) is unchanged. */
    if (options.jamoSeeds) {
      host.dataset.fyJamoSeeds = "true";
    } else {
      delete host.dataset.fyJamoSeeds;
    }

    if (options.hostMode === "custom-element") {
      host.dataset.size = options.size;
      host.dataset.wrapUnit = options.wrapUnit;
      if (options.animate) {
        host.dataset.animate = options.animate;
      } else {
        delete host.dataset.animate;
      }
    }

    host.style.setProperty("--fy-size", options.size);
    if (options.spacing) {
      host.style.setProperty("--fy-space-width", options.spacing);
      host.style.setProperty("--fy-word-gap", options.spacing);
    } else {
      host.style.removeProperty("--fy-space-width");
      host.style.removeProperty("--fy-word-gap");
    }

    if (options.seed !== null && options.seed !== undefined) {
      host.style.setProperty("--fy-seed", String(options.seed));
      host.dataset.fySeed = String(options.seed);
      if (options.hostMode === "custom-element") {
        host.dataset.seed = String(options.seed);
      }
    } else {
      host.style.removeProperty("--fy-seed");
      delete host.dataset.fySeed;
      if (options.hostMode === "custom-element") {
        delete host.dataset.seed;
      }
    }

    host.dataset.source = source;
    /* 접근성(ADR-003 보강, 2026-10-12): 읽히는 글자는 화면에 숨긴 [part="sr-source"] 하나다 — 런타임은 aria-label도 role도 쓰지
     * 않는다. 이름을 금지하는 역할(<font-kku>·span·div의 generic, p의 paragraph)에 aria-label을 붙이면 ARIA 위반이고 화면 낭독기에
     * 따라 두 번 읽히며, 작성자가 붙인 라벨(aria-label="대화 상자 닫기")을 덮어썼다. 작성자의 aria-label·role은 건드리지 않는다.
     * data-source는 원문 기록(보조 기술이 읽지 않는다)으로 남는다. */
  }

  /* 정적 렌더러·예전 런타임이 그려 둔 트리를 처음 넘겨받을 때, 그때 붙였던 호환 라벨(aria-label = data-source, role 없음)을
   * 지운다 — 남겨 두면 글을 바꾼 뒤에도 옛 글이 읽힌다. 작성자가 role을 붙였거나 라벨이 원문과 다르면 작성자 것이라 둔다. */
  function releaseLegacyLabel(host) {
    if (host.hasAttribute("role") || host.dataset.source === undefined) {
      return;
    }
    if (host.getAttribute("aria-label") === host.dataset.source) {
      host.removeAttribute("aria-label");
    }
  }

  // ── Render pipeline ────────────────────────────────────────

  /* Every render — explicit or automatic — is a job:
   *   reason   why it runs; reported by the `font-kku:render` event
   *   options  normalized options (ADR-002)
   *   source   the text to render
   *   style    font style resolution (readHostStyle); null until resolved */
  function createRenderJob(host, options, reason, extra) {
    var state = STATE.get(host);
    var mode = inferHostMode(host);
    var text = options ? options.text : undefined;
    var job = {
      host: host,
      reason: reason,
      options: normalizeOptions(host, mode, options,
        extra && extra.keepSeed && state ? state.options : null),
      source: text === undefined || text === null ? readLiveSource(host, state) : String(text),
      style: null
    };
    if (extra && extra.style && state && job.options.font === state.options.font &&
        job.options.fontExplicit === state.options.fontExplicit) {
      job.style = extra.style;
    }
    return job;
  }

  /* A detached host has no computed style: every font variable reads empty,
   * which would freeze the default structure. Keep what the host already
   * resolved for the same font (a recycled row keeps its shape) and mark the
   * render unresolved; it is verified when the host is connected. */
  function resolveJobStyle(job) {
    var previous = STATE.get(job.host);
    if (!job.host.isConnected && previous && previous.options.font === job.options.font &&
        previous.options.fontExplicit === job.options.fontExplicit) {
      return {
        expressionMode: previous.options.expressionMode,
        depthOptions: previous.options.depthOptions,
        fontMeta: previous.options.fontMeta,
        strokeDepth: previous.options.styleStrokeDepth,
        resolved: false
      };
    }
    return readHostStyle(job.host, job.options.font, !job.options.fontExplicit);
  }

  /* Batched: stamp every host's font surface, then read every host's style,
   * then build and write. Reading between writes would force one style
   * recalculation per host (each including the previous host's new jamo
   * tree); this order needs one. Render events fire after all writes so a
   * listener never sees a half-applied batch. */
  function runRenderJobs(jobs) {
    jobs.forEach(function (job) {
      if (!job.style) {
        setResolvedFontSurface(job.host, job.options.font, job.options.hostMode);
      }
    });
    jobs.forEach(function (job) {
      if (!job.style) {
        job.style = resolveJobStyle(job);
      }
    });
    /* 선택도 쓰기 전에 문서마다 한 번 읽는다 — Chromium은 선택이 없을 때(새로 연 페이지) rangeCount를 읽을 때마다 앞 바탕 요소가
     * 더럽힌 배치를 다시 계산해, 바탕 요소마다 읽으면 묶음 하나가 배치를 N번 강제한다. 같은 원문을 다시 그리는 바탕 요소가 있을 때만 */
    var selections = new Map();
    jobs.forEach(function (job) {
      var previous = STATE.get(job.host);
      var doc = job.host.ownerDocument;
      if (doc && !selections.has(doc) && previous && previous.source === job.source && getManagedRoot(job.host)) {
        selections.set(doc, selectionSnapshot(doc));
      }
    });
    jobs.forEach(function (job) {
      commitRenderJob(job, selections.get(job.host.ownerDocument) || null);
    });
    /* 넣은 뒤 한꺼번에: 머리 음절 2층 재귀(자리) → 원소 굵기 보정(굵기) → 벡터 칠 → 알림 */
    fitHeadSyllables(jobs.map(function (job) {
      return job.host;
    }));
    balanceElementStrokes(jobs.map(function (job) {
      return job.host;
    }));
    paintVectorJamo(jobs.map(function (job) {
      return job.host;
    }));
    jobs.forEach(function (job) {
      dispatchRender(job.host, job.reason);
    });
    jobs.forEach(function (job) {
      autoload(job.host);
    });
    /* 고른 채 다시 그린 바탕 요소(새 root)에 강조를 다시 비춘다 */
    jobs.forEach(function (job) {
      refreshSelectionMarks(job.host.ownerDocument);
    });
    return jobs.map(function (job) {
      return job.host;
    });
  }

  function sameJamoSeedOptions(left, right) {
    if (left === right) { return true; }
    if (!left || !right) { return false; }
    var keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(function (key) { return left[key] === right[key]; });
  }

  function commitRenderJob(job, selection) {
    var host = job.host;
    var previous = STATE.get(host);
    if (!previous && getManagedRoot(host)) {
      releaseLegacyLabel(host);
    }
    if (previous && previous.observer) {
      previous.observer.disconnect();
      previous.observer = undefined;
    }

    var style = job.style;
    var options = Object.assign({}, job.options, {
      expressionMode: style.expressionMode,
      depthOptions: style.depthOptions,
      fontMeta: style.fontMeta,
      styleStrokeDepth: style.strokeDepth || null
    });

    /* Presentation-only attribute edits retain the managed tree and its event
     * listeners. Explicit render/refresh still rebuild as their contract promises. */
    var reuse = previous && job.reason === "attribute" && previous.source === job.source &&
      previous.options.font === options.font && previous.options.fontExplicit === options.fontExplicit &&
      previous.options.jamoSet === options.jamoSet &&
      previous.options.strokeDepth === options.strokeDepth && sameStructure(style, previous.options) &&
      sameJamoSeedOptions(previous.options.jamoSeeds, options.jamoSeeds) && previous.options.seed === options.seed &&
      getManagedRoot(host);
    if (reuse) {
      /* 칸 계약 그림 세트가 걸린 트리는 SVG 재료로 지었다 — 움직임(animate) 같은 속성만 바꿔도 data-fy-face를 그대로 둔다.
       * 날것의 글꼴 값(element)을 다시 찍으면 SVG 획 규칙이 풀려 경로가 검게 채워진다. */
      options.fontMeta = drawnFaceMeta(options.fontMeta, options.jamoSet);
      setHostContract(host, job.source, options);
      previous.options = options;
      previous.snapshot = snapshotOptions(host, options.hostMode);
      previous.unresolved = !style.resolved;
      observeHost(host, previous);
      return previous;
    }

    /* The tree is built detached and swapped in with one replaceChildren. */
    var outerDocument = renderDocument;
    var outerSprite = renderSpriteMaterial;
    renderDocument = host.ownerDocument || null;
    renderSpriteMaterial = Boolean(options.fontMeta) && options.fontMeta.material === "sprite";
    var root;
    var srNode;
    try {
      root = renderTextModel(job.source, options.depthOptions);
      srNode = createSpan("sr-source", job.source);
    } finally {
      renderDocument = outerDocument;
      renderSpriteMaterial = outerSprite;
    }
    root.dataset.fyRoot = "true";
    root.setAttribute("aria-hidden", "true");
    /* 런타임이 그린 root만 자모 단위로 고른다 — 정적 HTML(런타임 없음)은 코어 CSS의 user-select: none 그대로다(선택·복사 절) */
    root.dataset.fySelect = "jamo";
    srNode.dataset.fySr = "true";
    var fixed = fixedLayout(options.fontMeta);
    if (fixed) {
      stampLayout(root, fixed);
    }
    var boxSet = boxJamoSet(options.fontMeta, options.jamoSet);
    options.fontMeta = drawnFaceMeta(options.fontMeta, options.jamoSet);
    if (options.fontMeta && options.fontMeta.face === "device") {
      fitFaceNodes(root, options.fontMeta, host.ownerDocument);
    } else if (options.fontMeta && (options.fontMeta.face === "element" || options.fontMeta.face === "svg")) {
      buildElementNodes(root, options.fontMeta, host.ownerDocument, boxSet);
    }

    setHostContract(host, job.source, options);
    var kept = previous && previous.source === job.source ? keepSelectionPoints(host, selection) : null;
    host.replaceChildren(root, srNode);
    if (kept) {
      restoreSelectionPoints(kept, root);
    }

    var state = {
      source: job.source,
      options: options,
      hostMode: options.hostMode,
      snapshot: snapshotOptions(host, options.hostMode),
      unresolved: !style.resolved,
      observer: undefined
    };
    STATE.set(host, state);

    if (options.jamoSeeds) {
      applyJamoSeeds(host, options.jamoSeeds);
    }
    observeHost(host, state);
    registerHost(host);
    if (state.unresolved) {
      trackPending(host);
    } else {
      untrackPending(host);
    }
    return state;
  }

  var RENDER_EVENT = "font-kku:render";

  /* Render notifications also cover presentation-only attribute updates and
   * vector repaints that preserve the managed root. This event (bubbles, composed) tells the page every time,
   * with the reason: render | refresh | upgrade | connect | attribute |
   * mutation | restyle. */
  function dispatchRender(host, reason) {
    var state = STATE.get(host);
    if (!state || typeof host.dispatchEvent !== "function") {
      return;
    }
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    var EventCtor = (view && view.CustomEvent) ||
      (typeof CustomEvent === "function" ? CustomEvent : null);
    if (!EventCtor) {
      return;
    }
    host.dispatchEvent(new EventCtor(RENDER_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        reason: reason,
        font: state.options.font,
        source: state.source,
        resolved: !state.unresolved
      }
    }));
  }

  function rerender(host, reason, text) {
    return runRenderJobs([
      createRenderJob(host, text === undefined ? undefined : { text: text }, reason)
    ])[0];
  }

  // ── Change detection ───────────────────────────────────────

  var CUSTOM_ELEMENT_CLASS = null;

  function isOwnCustomElement(host) {
    return CUSTOM_ELEMENT_CLASS !== null && host instanceof CUSTOM_ELEMENT_CLASS;
  }

  /* childList/characterData catch source edits. Option attributes are
   * watched here for decorators (and for <font-kku> hosts this runtime did
   * not upgrade, e.g. inside an iframe); the custom element class handles its
   * own through attributeChangedCallback. Only the host's own attributes
   * count — page code writing data-* onto generated jamo nodes is not an
   * option change. The host's class is watched on every host: a class can
   * carry render-time font metadata (a kku-look-* class switches sprite mask
   * paint through --fy-sprite-paint, ADR-017), so a class change re-resolves
   * the host's style and re-renders only when that metadata changed. */
  function observeHost(host, state) {
    if (typeof MutationObserver !== "function") {
      return;
    }
    if (state.observer) {
      state.observer.disconnect();
    }
    var config = { childList: true, subtree: true, characterData: true, attributes: true };
    if (state.hostMode === "decorator") {
      config.attributeFilter = DECORATOR_OPTION_ATTRIBUTES.concat("class");
    } else if (!isOwnCustomElement(host)) {
      config.attributeFilter = OPTION_KEYS.concat("class");
    } else {
      config.attributeFilter = ["class"];
    }
    var observer = new MutationObserver(function (mutations) {
      handleHostMutations(host, mutations, observer);
    });
    observer.observe(host, config);
    state.observer = observer;
  }

  function handleHostMutations(host, mutations, observer) {
    var state = STATE.get(host);
    if (!state || state.observer !== observer) {
      return;
    }
    var optionTouched = false;
    var classTouched = false;
    mutations.forEach(function (mutation) {
      if (mutation.type === "attributes" && mutation.target === host) {
        if (mutation.attributeName === "class") {
          classTouched = true;
        } else {
          optionTouched = true;
        }
      }
    });
    if (optionTouched && snapshotOptions(host, state.hostMode) !== state.snapshot) {
      rerender(host, "attribute");
      return;
    }
    var liveSource = readLiveSource(host, state);
    if (liveSource !== state.source) {
      rerender(host, "mutation", liveSource);
      return;
    }
    if (classTouched) {
      checkHosts([host], "restyle");
    }
  }

  /* Compare a fresh style resolution with the last render.
   * Returns false (unchanged), true (only fontInfo metadata changed; state
   * updated in place, no rebuild) or a render job to run. */
  function reconcileHostStyle(host, state, style, reason) {
    var wasUnresolved = state.unresolved;
    state.unresolved = false;
    untrackPending(host);
    registerHost(host);
    var options = state.options;
    if (sameStructure(style, options)) {
      if (style.fontMeta.id !== options.fontMeta.id ||
          style.fontMeta.contract !== options.fontMeta.contract) {
        options.fontMeta = style.fontMeta;
        return true;
      }
      return false;
    }
    if (wasUnresolved) {
      /* The last render ran detached, so its style was never resolved:
       * finish that same call, JS options included. */
      return {
        host: host,
        reason: reason,
        options: options,
        source: state.source,
        style: style
      };
    }
    /* A style change is an automatic re-render like any other: attributes
     * are re-read and one-shot JS options are not carried over (ADR-002);
     * the seed its unchanged attribute resolved to is kept. */
    return createRenderJob(host, undefined, reason, { keepSeed: true, style: style });
  }

  /* Batched style check: read every host first, then re-render. */
  function checkHosts(hosts, reason) {
    var entries = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected) {
        entries.push({ host: host, state: state, style: null });
      }
    });
    entries.forEach(function (entry) {
      entry.style = readHostStyle(entry.host, entry.state.options.font, !entry.state.options.fontExplicit);
    });
    var changed = [];
    var jobs = [];
    entries.forEach(function (entry) {
      var outcome = reconcileHostStyle(entry.host, entry.state, entry.style, reason);
      if (outcome) {
        changed.push(entry.host);
        if (outcome !== true) {
          jobs.push(outcome);
        }
      }
    });
    runRenderJobs(jobs);
    /* Row selection changes SVG content without changing the jamo tree. */
    var rebuilt = new Set(jobs.map(function (job) { return job.host; }));
    /* slot 값이 바뀌어도 자모 구조가 같으면 다시 만들지 않으므로 머리 음절 자리와 원소 굵기만 다시 맞춘다 — 글꼴 CSS를 고치면
     * 머리도 따라온다 */
    fitHeadSyllables(entries.filter(function (entry) {
      return !rebuilt.has(entry.host);
    }).map(function (entry) { return entry.host; }));
    balanceElementStrokes(entries.filter(function (entry) {
      return !rebuilt.has(entry.host);
    }).map(function (entry) { return entry.host; }));
    var repainted = paintVectorJamo(entries.filter(function (entry) {
      return !rebuilt.has(entry.host);
    }).map(function (entry) { return entry.host; }));
    repainted.forEach(function (host) {
      if (changed.indexOf(host) < 0) { changed.push(host); }
      dispatchRender(host, reason);
    });
    /* A font CSS whose structure matches the default is only metadata here
     * (no rebuild), so the autoload veil is settled for every checked host. */
    entries.forEach(function (entry) {
      autoload(entry.host);
    });
    return changed;
  }

  // ── Host registry and stylesheet watching ──────────────────

  var HAS_WEAKREF = typeof WeakRef === "function";

  function makeRef(node) {
    return HAS_WEAKREF ? new WeakRef(node) : { deref: function () { return node; } };
  }

  /* Rendered hosts, weakly held. refreshAll() walks this instead of
   * querySelectorAll, which cannot see into shadow roots. */
  var REGISTRY = new Set();
  var REGISTERED = new WeakSet();
  var registryPruneAt = 1024;

  function forEachRegistered(visit) {
    REGISTRY.forEach(function (ref) {
      var host = ref.deref();
      if (!host) {
        REGISTRY.delete(ref);
        return;
      }
      visit(host);
    });
  }

  var WATCHED_ROOTS = new WeakSet();
  var KNOWN_SHADOW_ROOTS = new Set();
  var KNOWN_SHADOW_ROOT_SET = new WeakSet();

  function registerHost(host) {
    if (host.ownerDocument) {
      watchStylesheets(host.ownerDocument);
      watchSelection(host.ownerDocument);
    }
    var rootNode = typeof host.getRootNode === "function" ? host.getRootNode() : null;
    if (rootNode && rootNode.nodeType === 11 && rootNode.host) {
      /* link `load` is not composed: a shadow root's stylesheets are only
       * seen by a listener on that root. */
      watchStylesheets(rootNode);
      rememberShadowRoot(rootNode);
    }
    if (!HAS_WEAKREF || REGISTERED.has(host)) {
      return;
    }
    REGISTERED.add(host);
    REGISTRY.add(makeRef(host));
    if (REGISTRY.size > registryPruneAt) {
      forEachRegistered(function () {});
      registryPruneAt = Math.max(1024, REGISTRY.size * 2);
    }
  }

  var shadowRootPruneAt = 256;

  function rememberShadowRoot(root) {
    if (KNOWN_SHADOW_ROOT_SET.has(root)) {
      return;
    }
    KNOWN_SHADOW_ROOT_SET.add(root);
    KNOWN_SHADOW_ROOTS.add(makeRef(root));
    if (KNOWN_SHADOW_ROOTS.size > shadowRootPruneAt) {
      KNOWN_SHADOW_ROOTS.forEach(function (ref) {
        if (!ref.deref()) {
          KNOWN_SHADOW_ROOTS.delete(ref);
        }
      });
      shadowRootPruneAt = Math.max(256, KNOWN_SHADOW_ROOTS.size * 2);
    }
    if (connectObserver) {
      observeConnections(root);
    }
    /* selectstart도 composed가 아니어서 그림자 트리 안 누르기는 이 root에서만 들린다 */
    root.addEventListener("selectstart", noteSelectStart, { capture: true, passive: true });
  }

  /* Shadow-including containment: hosts inside shadow roots count as
   * descendants of the shadow host and of the document. */
  function composedContains(scope, node) {
    if (scope.nodeType === 9) {
      return node.ownerDocument === scope && node.isConnected === true;
    }
    var current = node;
    while (current) {
      if (current === scope) {
        return true;
      }
      current = current.parentNode || (current.nodeType === 11 ? current.host : null) || null;
    }
    return false;
  }

  function collectHosts(scope) {
    var hosts = [];
    var seen = new Set();
    function add(node) {
      if (node && !seen.has(node)) {
        seen.add(node);
        hosts.push(node);
      }
    }
    if (isElementNode(scope) && STATE.has(scope)) {
      add(scope);
    }
    if (HAS_WEAKREF) {
      forEachRegistered(function (host) {
        if (composedContains(scope, host)) {
          add(host);
        }
      });
    } else if (typeof scope.querySelectorAll === "function") {
      Array.prototype.forEach.call(scope.querySelectorAll('[data-fy-upgraded="true"]'), add);
    }
    return hosts;
  }

  var restyleScheduled = false;
  var RESTYLE_DOCUMENTS = [];

  function scheduleRestyle(doc) {
    if (doc && RESTYLE_DOCUMENTS.indexOf(doc) < 0) {
      RESTYLE_DOCUMENTS.push(doc);
    }
    if (restyleScheduled) {
      return;
    }
    restyleScheduled = true;
    var run = function () {
      restyleScheduled = false;
      RESTYLE_DOCUMENTS.splice(0).forEach(function (target) {
        refreshAll(target);
      });
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  function handleStylesheetLoad(event) {
    var target = event.target;
    var tag = target && target.tagName;
    if (tag === "STYLE" || (tag === "LINK" && /(^|\s)stylesheet(\s|$)/i.test(target.rel || ""))) {
      scheduleRestyle(target.ownerDocument);
    }
  }

  /* `load` does not bubble, so listen in the capture phase — once per
   * document and per shadow root a host was rendered in (installed lazily on
   * render, so bootstrap:false pages are covered too). Stylesheets that change
   * without a load event (adoptedStyleSheets, edited <style> text) need an
   * explicit FontKku.refreshAll(). */
  function watchStylesheets(root) {
    if (!root || typeof root.addEventListener !== "function" || WATCHED_ROOTS.has(root)) {
      return;
    }
    WATCHED_ROOTS.add(root);
    root.addEventListener("load", handleStylesheetLoad, true);
  }

  /* 웹 글꼴이 다 받아지기 전에 잰 잉크 상자는 대체 글꼴의 것이다(ADR-023). 글꼴을 받으면(watchFaceLoad가
   * 기다린 글꼴) 다시 재서 맞춘 노드의 값을 고친다. loadingdone 이벤트는 WebKit이 보내지 않아 쓰지 않는다. */
  function refitFaces(doc) {
    FACE_BOXES = Object.create(null);
    FACE_BASELINES = Object.create(null);
    forEachRegistered(function (host) {
      var state = STATE.get(host);
      var root = state && host.ownerDocument === doc && state.options.fontMeta.face === "device" ? getManagedRoot(host) : null;
      if (root) {
        fitFaceNodes(root, state.options.fontMeta, doc);
      }
    });
  }

  // ── Pending resolution (hosts rendered while detached) ─────

  /* A render done while the host was detached cannot resolve font style.
   * Such hosts wait here until they are connected:
   * - custom elements resolve in connectedCallback;
   * - decorators have no lifecycle hook, so while anything is pending one
   *   MutationObserver watches the documents (and known shadow roots) for
   *   insertions, and an animation frame check covers the common
   *   "render, then append" sequence.
   * Hosts are weakly held; the observer disconnects when nothing is pending. */
  var PENDING = new Set();
  var PENDING_REFS = new WeakMap();
  var connectObserver = null;
  var connectObserved = null;
  var pendingFrame = false;

  function trackPending(host) {
    schedulePendingCheck();
    if (PENDING_REFS.has(host)) {
      return;
    }
    var ref = makeRef(host);
    PENDING_REFS.set(host, ref);
    PENDING.add(ref);
    startWatchingConnections(host.ownerDocument);
  }

  function untrackPending(host) {
    var ref = PENDING_REFS.get(host);
    if (!ref) {
      return;
    }
    PENDING_REFS.delete(host);
    PENDING.delete(ref);
    if (!PENDING.size) {
      stopWatchingConnections();
    }
  }

  function observeConnections(root) {
    if (!connectObserver || !root || connectObserved.has(root)) {
      return;
    }
    connectObserved.add(root);
    connectObserver.observe(root, { childList: true, subtree: true });
  }

  function startWatchingConnections(doc) {
    if (typeof MutationObserver !== "function") {
      return;
    }
    if (!connectObserver) {
      connectObserver = new MutationObserver(flushPending);
      connectObserved = new WeakSet();
      KNOWN_SHADOW_ROOTS.forEach(function (ref) {
        var root = ref.deref();
        if (!root) {
          KNOWN_SHADOW_ROOTS.delete(ref);
          return;
        }
        observeConnections(root);
      });
    }
    if (doc && doc.nodeType === 9) {
      observeConnections(doc);
    }
  }

  function stopWatchingConnections() {
    if (connectObserver) {
      connectObserver.disconnect();
      connectObserver = null;
      connectObserved = null;
    }
  }

  function schedulePendingCheck() {
    if (pendingFrame || typeof requestAnimationFrame !== "function") {
      return;
    }
    pendingFrame = true;
    requestAnimationFrame(function () {
      pendingFrame = false;
      flushPending();
    });
  }

  function flushPending() {
    var hosts = [];
    PENDING.forEach(function (ref) {
      var host = ref.deref();
      if (!host) {
        PENDING.delete(ref);
      } else if (host.isConnected) {
        hosts.push(host);
      }
    });
    if (hosts.length) {
      checkHosts(hosts, "connect");
    }
    if (!PENDING.size) {
      stopWatchingConnections();
    }
  }

  // ── Selection and copy (ADR-003 보강, ADR-025 §12) ─────────

  /* 그린 글자는 자모 단위로 고른다. 런타임이 그린 관리 root(data-fy-select="jamo")만 고를 수 있고 — 런타임 없는 정적 HTML은
   * 코어 CSS의 user-select: none 그대로라 복사하면 원문 거울(sr-source)이 나온다 — 원문 거울은 선택 밖이다. 브라우저 자체
   * 강조는 화면 밖으로 민 노드 글자(원소·그림·기기 글꼴 맞춤)에 칠해져 보이지 않거나 겹치므로 코어 CSS가 지우고, 문서마다
   * selectionchange 하나가 프레임에 한 번 고른 자모를 data-fy-selected로 비춘다 — 바탕 요소 통째는 root 하나("all"),
   * 음절 통째는 글자 칸 띠("all"), 일부는 고른 자모 상자("part" 글자 안 자모마다 ""). 자모 노드에 선택 끝이 닿으면 그 자모를
   * 고른 것으로 친다(노드 글자는 화면 밖이라 브라우저의 글자 위치는 늘 노드 글자 뒤다).
   * 복사·잘라내기(편집 가능한 곳)는 같은 대응으로 원문을 넣는다: 자모 일부만 고른 음절은 음절 통째, 빈칸·줄바꿈(\r\n·\r도)은
   * 원문 그대로, 음절은 NFC. 바탕 요소 밖 글은 브라우저 직렬화를 그대로 쓴다 — 범위 끝을 원문 거울 안으로 옮기고 관리 root를
   * 잠깐 display: none(data-fy-select="copy")으로 둔 채 selection.toString()을 읽은 뒤 선택을 되돌린다. */
  var SELECT_LINE_BREAK = /\r\n|\r|\n/g;
  var SELECT_UNITS = new WeakMap();
  var SELECT_WATCHED = new WeakSet();
  var SELECT_MARKS = new WeakMap();
  var SELECT_FRAMES = [];
  var SELECT_POINTERS = new WeakMap();
  var SELECT_HOST_STYLES = ["--fy-size", "--fy-space-width", "--fy-word-gap", "--fy-seed"];
  var SELECT_ELEMENT_MIRRORS = ["data-font", "data-profile", "data-size", "data-wrap-unit", "data-animate", "data-seed"];

  function nfc(text) {
    return typeof text.normalize === "function" ? text.normalize("NFC") : text;
  }

  /* 원문을 그린 차례의 단위로 — 글자(glyph, 자소 글자 하나), 빈칸 묶음(space), 줄바꿈(break). 단위마다 원문 안 [start, end).
   * 그린 DOM은 NFC·\n으로 고친 글로 만들므로(buildTextModel) 원문 쪽 자리를 따로 센다. */
  function sourceUnits(source) {
    var units = [];
    var lines = [];
    var from = 0;
    var match;
    SELECT_LINE_BREAK.lastIndex = 0;
    while ((match = SELECT_LINE_BREAK.exec(source))) {
      lines.push([from, match.index, match.index + match[0].length]);
      from = match.index + match[0].length;
    }
    lines.push([from, source.length, source.length]);
    lines.forEach(function (line, index) {
      var at = line[0];
      var space = -1;
      segmentGraphemes(source.slice(line[0], line[1])).forEach(function (grapheme) {
        if (isInlineSpace(grapheme)) {
          if (space < 0) {
            space = at;
          }
        } else {
          if (space >= 0) {
            units.push({ kind: "space", start: space, end: at });
            space = -1;
          }
          units.push({ kind: "glyph", start: at, end: at + grapheme.length });
        }
        at += grapheme.length;
      });
      if (space >= 0) {
        units.push({ kind: "space", start: space, end: at });
      }
      if (index < lines.length - 1) {
        units.push({ kind: "break", start: line[1], end: line[2] });
      }
    });
    return units;
  }

  function elementChildren(node) {
    return Array.prototype.filter.call(node.childNodes || [], function (child) {
      return child.nodeType === 1;
    });
  }

  function nodeIndex(node) {
    var parent = node.parentNode;
    return parent ? Array.prototype.indexOf.call(parent.childNodes, node) : 0;
  }

  function hasPart(node, token) {
    return (" " + (node.getAttribute("part") || "") + " ").indexOf(" " + token + " ") >= 0;
  }

  /* 관리 root의 그린 노드를 원문 단위와 같은 차례로 — 글자 노드, 빈칸 노드, 줄 사이(root 안 위치) */
  function drawnUnits(root) {
    var units = [];
    elementChildren(root).filter(function (node) {
      return hasPart(node, "line");
    }).forEach(function (line, index) {
      if (index) {
        units.push({ kind: "break", node: root, offset: nodeIndex(line) });
      }
      elementChildren(line).forEach(function (child) {
        if (hasPart(child, "space")) {
          units.push({ kind: "space", node: child });
        } else if (hasPart(child, "word")) {
          elementChildren(child).forEach(function (glyph) {
            if (hasPart(glyph, "glyph") && !glyph.hasAttribute("data-fy-probe")) {
              units.push({ kind: "glyph", node: glyph });
            }
          });
        }
      });
    });
    return units;
  }

  function sameKinds(units, drawn) {
    return units.length === drawn.length && units.every(function (unit, index) {
      return unit.kind === drawn[index].kind;
    });
  }

  /* 원문 단위표. 원문 그대로 센 표가 그린 DOM과 어긋나면(정규화가 글자 경계를 바꾸는 드문 원문) 그린 글(NFC·\n)로 센 표를 쓴다 —
   * 그때 위치는 원문 위치가 아니다(exact: false). */
  function unitTable(host, state, drawn) {
    var cached = SELECT_UNITS.get(host);
    if (!cached || cached.source !== state.source) {
      cached = { source: state.source, exact: null, drawn: null };
      SELECT_UNITS.set(host, cached);
    }
    if (!cached.exact) {
      cached.exact = { text: state.source, units: sourceUnits(state.source), exact: true };
    }
    if (!drawn || sameKinds(cached.exact.units, drawn)) {
      return cached.exact;
    }
    if (!cached.drawn) {
      var text = nfc(state.source).replace(/\r\n?/g, "\n");
      cached.drawn = { text: text, units: sourceUnits(text), exact: false };
    }
    return sameKinds(cached.drawn.units, drawn) ? cached.drawn : null;
  }

  /* 범위가 노드를 통째로 담는가(노드 앞뒤 위치가 모두 범위 안) */
  function containsNode(range, node) {
    var parent = node.parentNode;
    if (!parent) {
      return false;
    }
    var index = nodeIndex(node);
    return range.comparePoint(parent, index) === 0 && range.comparePoint(parent, index + 1) === 0;
  }

  function samePoint(range, end, node, offset) {
    return end
      ? range.endContainer === node && range.endOffset === offset
      : range.startContainer === node && range.startOffset === offset;
  }

  /* 노드 안 글자를 한 자라도 고르는가 — 화면에 보이는 글자(기기 글꼴 낱글자)에만 쓴다 */
  function textCovered(range, node) {
    var texts = [];
    (function walk(current) {
      Array.prototype.forEach.call(current.childNodes || [], function (child) {
        if (child.nodeType === 3) {
          texts.push(child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    })(node);
    if (!texts.length) {
      return range.intersectsNode(node);
    }
    return texts.some(function (text) {
      var length = (text.data || "").length;
      var after = range.comparePoint(text, length);
      var before = range.comparePoint(text, 0);
      return length > 0 && after >= 0 && !(after === 0 && samePoint(range, false, text, length)) &&
        before <= 0 && !(before === 0 && samePoint(range, true, text, 0));
    });
  }

  function partNodes(node, token) {
    var found = [];
    (function walk(current) {
      elementChildren(current).forEach(function (child) {
        if (hasPart(child, token)) {
          found.push(child);
        } else {
          walk(child);
        }
      });
    })(node);
    return found;
  }

  /* 그린 단위마다 고름: 글자는 자모 노드 하나라도 닿으면(일부면 "part"), 낱글자는 글자 하나라도(그린 낱자는 닿기만 해도),
   * 빈칸은 통째로 담길 때, 줄바꿈은 두 줄에 걸칠 때 */
  function pickDrawn(range, drawn) {
    var picked = [];
    drawn.forEach(function (unit, index) {
      var node = unit.node;
      if (unit.kind === "break") {
        if (range.comparePoint(node, unit.offset) === 0 && !samePoint(range, false, node, unit.offset) &&
            !samePoint(range, true, node, unit.offset)) {
          picked.push({ index: index, kind: "break" });
        }
        return;
      }
      if (!range.intersectsNode(node)) {
        return;
      }
      if (containsNode(range, node)) {
        picked.push({ index: index, kind: unit.kind, node: node, state: "all" });
        return;
      }
      if (unit.kind === "space") {
        return;
      }
      var jamo = partNodes(node, "jamo");
      if (jamo.length) {
        var touched = jamo.filter(function (each) {
          return range.intersectsNode(each);
        });
        if (touched.length) {
          picked.push({ index: index, kind: "glyph", node: node, state: touched.length === jamo.length ? "all" : "part", jamo: touched });
        }
        return;
      }
      var content = partNodes(node, "content")[0];
      if (content && (content.hasAttribute("data-fy-standalone") ? range.intersectsNode(content) : textCovered(range, content))) {
        picked.push({ index: index, kind: "glyph", node: node, state: "all" });
      }
    });
    return picked;
  }

  /* 원문 거울 글자 안에서만 고른 범위(코드가 고른 범위)는 원문 위치 그대로다. 그린 root를 지나 거울을 덮는 범위는 그린 쪽으로
   * 센다 — 거울은 root 뒤에 있어 root 안에서 시작해 바탕 요소 밖으로 나가는 범위가 늘 덮는다 */
  function pickMirror(range, host) {
    var text = mirrorText(host);
    return text && range.startContainer === text && range.endContainer === text && range.endOffset > range.startOffset
      ? [range.startOffset, range.endOffset] : null;
  }

  function wholeSelection(host) {
    var state = STATE.get(host);
    var root = getManagedRoot(host);
    if (!state || !root || !state.source) {
      return null;
    }
    return {
      host: host, root: root, state: state, exact: true, whole: true,
      start: 0, end: state.source.length, text: nfc(state.source), marks: [[root, "all"]]
    };
  }

  /* 바탕 요소 하나에서 범위가 고른 원문: start·end는 원문 위치, text는 NFC, marks는 강조할 노드 */
  function hostSelection(host, range) {
    var state = STATE.get(host);
    var root = getManagedRoot(host);
    if (!state || !root || !state.source || range.collapsed) {
      return null;
    }
    if (containsNode(range, root)) {
      return wholeSelection(host);
    }
    var inRoot = range.intersectsNode(root);
    var mirror = pickMirror(range, host);
    if (!inRoot && !mirror) {
      return null;
    }
    var drawn = drawnUnits(root);
    var table = unitTable(host, state, drawn);
    if (!table) {
      return wholeSelection(host);
    }
    var chosen = [];
    var marks = [];
    function mark(pick) {
      chosen[pick.index] = true;
      if (pick.node) {
        marks.push([pick.node, pick.kind === "space" ? "" : pick.state]);
      }
      (pick.state === "part" ? pick.jamo : []).forEach(function (node) {
        marks.push([node, ""]);
      });
    }
    if (inRoot) {
      pickDrawn(range, drawn).forEach(mark);
    }
    if (mirror && table.exact) {
      table.units.forEach(function (unit, index) {
        if (!chosen[index] && unit.start < mirror[1] && unit.end > mirror[0]) {
          mark({ index: index, kind: unit.kind, node: drawn[index].kind === "break" ? null : drawn[index].node, state: "all" });
        }
      });
    }
    var first = chosen.indexOf(true);
    if (first < 0) {
      return null;
    }
    var last = chosen.lastIndexOf(true);
    var start = table.units[first].start;
    var end = table.units[last].end;
    return {
      host: host, root: root, state: state, exact: table.exact, whole: false,
      start: table.exact ? start : 0, end: table.exact ? end : state.source.length,
      text: nfc(table.text.slice(start, end)), marks: marks
    };
  }

  /* 공개: 범위(Range·StaticRange)가 바탕 요소에서 고른 원문 — 복사가 쓰는 대응. 고른 것이 없으면 null */
  function sourceRange(host, range) {
    if (!isElementNode(host) || !range) {
      return null;
    }
    var live = range;
    if (typeof range.comparePoint !== "function") {
      var doc = host.ownerDocument;
      if (!doc || typeof doc.createRange !== "function") {
        return null;
      }
      live = doc.createRange();
      try {
        live.setStart(range.startContainer, range.startOffset);
        live.setEnd(range.endContainer, range.endOffset);
      } catch (error) {
        return null;
      }
    }
    var picked;
    try {
      picked = hostSelection(host, live);
    } catch (error) {
      return null;
    }
    return picked ? { start: picked.start, end: picked.end, text: picked.text } : null;
  }

  // ── 선택 범위와 그림자 트리

  function treeOf(node) {
    return typeof node.getRootNode === "function" ? node.getRootNode() : node.ownerDocument;
  }

  function hostOfTree(tree) {
    return tree && tree.nodeType === 11 && tree.host ? tree.host : null;
  }

  function treeChain(node) {
    var chain = [];
    var tree = treeOf(node);
    while (tree) {
      chain.push(tree);
      var host = hostOfTree(tree);
      tree = host ? treeOf(host) : null;
    }
    return chain;
  }

  /* 노드를 담은 그 트리의 노드 — 바탕 요소 자신이거나, 그것을 그림자 안에 품은 그림자 호스트 */
  function anchorIn(tree, node) {
    var current = node;
    while (current) {
      var own = treeOf(current);
      if (own === tree) {
        return current;
      }
      current = hostOfTree(own);
    }
    return null;
  }

  function knownShadowRoots(doc) {
    var roots = [];
    KNOWN_SHADOW_ROOTS.forEach(function (ref) {
      var root = ref.deref();
      if (root && root.host && root.host.ownerDocument === doc) {
        roots.push(root);
      }
    });
    return roots;
  }

  /* 선택 범위를 그림자 경계까지 본다(getComposedRanges) — 없으면 문서 범위 */
  function composedRanges(doc, selection) {
    var ranges = [];
    for (var index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index));
    }
    if (typeof selection.getComposedRanges === "function") {
      var roots = knownShadowRoots(doc);
      var composed = null;
      try {
        composed = Array.prototype.slice.call(selection.getComposedRanges({ shadowRoots: roots }));
      } catch (error) {
        try {
          composed = Array.prototype.slice.call(selection.getComposedRanges.apply(selection, roots));
        } catch (ignored) { /* 아래 */ }
      }
      /* 그림자 트리에 닿지 않는 선택이면 getRangeAt 그대로 — Firefox의 getComposedRanges는 extend·setBaseAndExtent로 옮긴 끝을
       * 따라오지 않는다(steerSelection이 옮긴 끝이 복사에서 빠졌다, 0.1.3 탐색 matrix-11) */
      if (composed && !(composed.length === ranges.length && ranges.concat(composed).every(function (range) {
        return inDocumentTree(doc, range.startContainer) && inDocumentTree(doc, range.endContainer);
      }))) {
        return composed;
      }
    }
    return ranges;
  }

  function inDocumentTree(doc, node) {
    return typeof node.getRootNode === "function" ? node.getRootNode() === doc : true;
  }

  function liveSegment(doc, startNode, startOffset, endNode, endOffset) {
    var range = doc.createRange();
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
    } catch (error) {
      return null;
    }
    return range.collapsed ? null : { tree: treeOf(startNode), range: range };
  }

  /* 그림자 경계를 넘는 범위를 트리 하나씩의 살아 있는 범위로 나눈다(문서 차례) — 시작 쪽 트리의 끝까지, 공통 트리의 가운데,
   * 끝 쪽 트리의 처음부터 */
  function treeSegments(doc, range) {
    var startChain = treeChain(range.startContainer);
    var endChain = treeChain(range.endContainer);
    var common = null;
    for (var index = 0; index < startChain.length && !common; index += 1) {
      if (endChain.indexOf(startChain[index]) >= 0) {
        common = startChain[index];
      }
    }
    if (!common) {
      return [];
    }
    var head = [];
    var tail = [];
    var start = [range.startContainer, range.startOffset];
    while (treeOf(start[0]) !== common) {
      var tree = treeOf(start[0]);
      head.push(liveSegment(doc, start[0], start[1], tree, tree.childNodes.length));
      var host = hostOfTree(tree);
      start = [host.parentNode, nodeIndex(host) + 1];
    }
    var end = [range.endContainer, range.endOffset];
    while (treeOf(end[0]) !== common) {
      var endTree = treeOf(end[0]);
      tail.unshift(liveSegment(doc, endTree, 0, end[0], end[1]));
      var endHost = hostOfTree(endTree);
      end = [endHost.parentNode, nodeIndex(endHost)];
    }
    return head.concat([liveSegment(doc, start[0], start[1], end[0], end[1])], tail).filter(Boolean);
  }

  function selectionHosts(doc) {
    var hosts = [];
    function add(host) {
      if (host.ownerDocument === doc && host.isConnected && STATE.has(host) && hosts.indexOf(host) < 0) {
        hosts.push(host);
      }
    }
    if (HAS_WEAKREF) {
      forEachRegistered(add);
    } else if (typeof doc.querySelectorAll === "function") {
      Array.prototype.forEach.call(doc.querySelectorAll('[data-fy-upgraded="true"]'), add);
    }
    return hosts;
  }

  /* 지금 선택이 고른 바탕 요소들 — 트리 조각마다, 그 트리의 바탕 요소는 자모 단위로, 조각이 통째로 품은 그림자 안의 것은 통째로 */
  function selectionPlan(doc) {
    var selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
    if (!selection || !selection.rangeCount) {
      return null;
    }
    var segments = [];
    composedRanges(doc, selection).forEach(function (range) {
      segments = segments.concat(treeSegments(doc, range));
    });
    var hosts = segments.length ? selectionHosts(doc) : [];
    if (!hosts.length) {
      return null;
    }
    var picks = [];
    var memo = new Map();
    segments.forEach(function (segment) {
      hosts.forEach(function (host) {
        var anchor = anchorIn(segment.tree, host);
        var pick = null;
        try {
          if (anchor === host) {
            pick = hostSelection(host, segment.range);
          } else if (anchor && containsNode(segment.range, anchor)) {
            pick = wholeSelection(host);
          }
        } catch (error) {
          pick = null;
        }
        /* 페이지가 조상에 user-select: none을 준 바탕 요소는 브라우저처럼 고르지도 복사하지도 않는다(전체 선택이 품어도) */
        if (pick && selectableChain(pick.root, memo)) {
          pick.segment = segment;
          pick.nested = anchor !== host;
          picks.push(pick);
        }
      });
    });
    return { selection: selection, segments: segments, picks: picks, hosts: hosts };
  }

  // ── 강조 거울

  function watchSelection(doc) {
    if (!doc || doc.nodeType !== 9 || SELECT_WATCHED.has(doc) || typeof doc.addEventListener !== "function") {
      return;
    }
    SELECT_WATCHED.add(doc);
    doc.addEventListener("selectionchange", function () {
      scheduleSelectionMirror(doc);
    });
    doc.addEventListener("copy", handleClipboardEvent);
    doc.addEventListener("cut", handleClipboardEvent);
    /* 마우스로 끄는 동안 포인터 자리를 기억한다 — 빛 칠 노드처럼 숨긴(visibility) 자모 안에는 브라우저가 선택 끝을 두지 못해 다음 빈칸으로
     * 건너뛰므로, 포인터 아래 자모로 끝을 옮긴다(steerSelection). 페이지가 누르기를 막으면(pointerdown·mousedown preventDefault — 브라우저도
     * 고르지 않는다) 끝을 옮기지도, 두세 번 누르기로 고르지도 않는다 — 막혔는지는 페이지 듣개가 다 돈 뒤(문서 거품) 본다 */
    var listen = { capture: true, passive: true };
    doc.addEventListener("pointerdown", function (event) {
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      var target = path[0] || event.target;
      var jamo = pressedJamo(event);
      SELECT_POINTERS.set(doc, { x: event.clientX, y: event.clientY, from: [event.clientX, event.clientY], down: true,
        armed: false, moved: false, mouse: event.button === 0 && event.pointerType !== "touch", jamo: jamo,
        quiet: quietPress(jamo, target), inert: inertPress(target), shift: event.shiftKey, start: null });
    }, listen);
    doc.addEventListener("selectstart", noteSelectStart, listen);
    doc.addEventListener("mousedown", function (event) {
      var pointer = SELECT_POINTERS.get(doc);
      if (pointer) {
        pointer.armed = pointer.mouse && !event.defaultPrevented;
      }
    }, { passive: true });
    doc.addEventListener("pointermove", function (event) {
      var pointer = SELECT_POINTERS.get(doc);
      if (pointer && pointer.down) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.moved = pointer.moved || Math.abs(pointer.x - pointer.from[0]) + Math.abs(pointer.y - pointer.from[1]) > 3;
        /* 숨긴 자모를 누르면 Firefox는 범위를 만들지 않아 selectionchange가 오지 않는다 — 비어 있으면 끄는 동안 직접 맞춘다 */
        var selection = pointer.jamo && pointer.armed && pointer.moved && typeof doc.getSelection === "function" ? doc.getSelection() : null;
        if (selection && (!selection.rangeCount || selection.isCollapsed)) {
          scheduleSelectionMirror(doc);
        }
      }
    }, listen);
    ["pointerup", "pointercancel"].forEach(function (type) {
      doc.addEventListener(type, function (event) {
        var pointer = SELECT_POINTERS.get(doc);
        /* 끌지 않은 Shift+누르기도 선택 끝을 옮긴다 — 낱말 사이 칸을 누르면 브라우저가 끝을 다음 음절에 둔다(0.1.3 탐색 api-23) */
        if (pointer && pointer.down && pointer.armed && (pointer.moved || pointer.shift) && type === "pointerup") {
          steerSelection(doc, event.clientX, event.clientY);
        }
        if (pointer) {
          pointer.down = false;
          pointer.armed = pointer.armed && type === "pointerup";
          /* 끌었으면: 브라우저가 놓기(mouseup 기본 동작)에서 선택을 다시 정할 수 있어 다음 프레임에 한 번 더 옮긴다 */
          pointer.release = pointer.armed && (pointer.moved || pointer.shift);
          if (pointer.release) {
            scheduleSelectionMirror(doc);
          }
        }
      }, listen);
    });
    doc.addEventListener("click", function (event) {
      var pointer = SELECT_POINTERS.get(doc);
      if (pointer && pointer.armed) {
        try {
          selectByClicks(doc, event);
        } catch (error) { /* 브라우저가 그 범위를 받지 않으면 브라우저 선택 그대로 */ }
      }
    }, { passive: true });
  }

  /* 누른 자리 — 그린 관리 root 안의 자모·낱말 사이 칸·글자 칸(그 글자의 첫 자모)을 눌렀으면 그 노드(steerSelection이 닻을 되돌릴 때 쓴다).
   * 빛 칠의 숨긴 자모는 맞힘 영역이 좁아 글자 가장자리를 누르면 낱말·줄 노드가 잡힌다 — 그때는 누른 자리를 품은 글자·칸 */
  function pressedJamo(event) {
    var path = typeof event.composedPath === "function" ? event.composedPath() : [];
    var target = path[0] || event.target;
    var element = target && (target.nodeType === 1 ? target : target.parentNode);
    var under = element ? pointerTarget(element, event.clientX, event.clientY) : null;
    return under ? under.node : null;
  }

  /* Firefox가 selectstart 없이 아무것도 고르지 않는 누르기인가 — 빛 칠처럼 숨긴(visibility) 자모(matrix-11), 그림 세트 자모 안의
   * SVG 그림(0.1.3 탐색 xbrowser-17). pressSelects가 그때는 이 누르기를 고르기 시작으로 본다 */
  function quietPress(jamo, target) {
    var view = jamo && jamo.ownerDocument ? jamo.ownerDocument.defaultView : null;
    if (!view) {
      return false;
    }
    return view.getComputedStyle(jamo).visibility === "hidden" || !!(target && target.namespaceURI === "http://www.w3.org/2000/svg");
  }

  /* 누른 자리가 단추·링크·끌 수 있는 요소 안인가(그림자 경계 너머까지) — 브라우저는 거기서 끌면 글을 고르지 않는다. WebKit은
   * draggable 안을 눌러도 selectstart를 보낸다(0.1.3 탐색 api-27) */
  function inertPress(target) {
    for (var current = target && target.nodeType === 1 ? target : target && target.parentNode; current && current.nodeType === 1;
      current = composedParent(current)) {
      if (current.localName === "button" || (current.localName === "a" && current.hasAttribute("href")) ||
          current.getAttribute("draggable") === "true") {
        return true;
      }
    }
    return false;
  }

  function noteSelectStart(event) {
    var node = event.target;
    var doc = node && (node.nodeType === 9 ? node : node.ownerDocument);
    var pointer = doc ? SELECT_POINTERS.get(doc) : null;
    if (pointer && pointer.down) {
      pointer.start = event;
    }
  }

  /* 이 누르기로 브라우저가 고르기를 시작했나 — selectstart가 왔고 막히지 않았으면. 단추·링크·draggable 안처럼 브라우저가 고르지 않는
   * 곳, 페이지가 selectstart를 막은 곳(jQuery UI disableSelection)에서는 끌어도 런타임이 고르지 않는다(0.1.3 탐색 api-19·27). 막혔는지는
   * 끄는 동안 본다(페이지 듣개가 다 돈 뒤). selectstart 없이 바탕 요소 자모를 눌렀으면 quietPress일 때만. 바탕 요소 밖을 누르고 끌어
   * 들어오는 고르기는 그대로 맞춘다 */
  function pressSelects(pointer) {
    if (pointer.inert) {
      return false;
    }
    return pointer.start ? !pointer.start.defaultPrevented : !pointer.jamo || pointer.quiet;
  }

  /* 선택의 닻과 끝 [노드, 자리] — 그림자 트리 안 선택이면 Chromium·WebKit은 anchorNode·focusNode를 호스트 자리(문서 트리)로 접어
   * 돌려준다(0.1.3 탐색 api-18). 그때는 getComposedRanges와 direction으로 읽고, 읽을 수 없으면 null */
  function selectionEnds(doc, selection, tree) {
    var anchor = [selection.anchorNode, selection.anchorOffset];
    var focus = [selection.focusNode, selection.focusOffset];
    if (tree === doc || (anchor[0] && anchor[0].getRootNode() === tree)) {
      return { anchor: anchor, focus: focus };
    }
    var range = typeof selection.getComposedRanges === "function" ? composedRanges(doc, selection)[0] : null;
    if (!range || (inDocumentTree(doc, range.startContainer) && inDocumentTree(doc, range.endContainer))) {
      return null;
    }
    var start = [range.startContainer, range.startOffset];
    var end = [range.endContainer, range.endOffset];
    return selection.direction === "backward" ? { anchor: end, focus: start } : { anchor: start, focus: end };
  }

  /* root 안에서 (x, y)를 품은 글자·낱말 사이 칸 */
  function unitAt(root, x, y) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }
    var units = root.querySelectorAll('[part~="glyph"], [part~="space"]');
    for (var index = 0; index < units.length; index += 1) {
      var box = units[index].getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        return units[index];
      }
    }
    return null;
  }

  /* 포인터 아래 선택 대상 — 그린 관리 root 안의 자모, 낱말 사이 칸, 또는 글자 칸(빛 칠의 숨긴 자모 위에서 Firefox는 자모 대신 글자
   * 칸을 돌려준다 — 그 글자의 첫 자모). 고를 수 없는 곳이면 null */
  function pointerTarget(hit, x, y) {
    var node = hit && typeof hit.closest === "function" ? hit.closest('[part~="jamo"], [part~="space"], [part~="glyph"]') : null;
    if (!node && typeof x === "number" && hit && typeof hit.closest === "function") {
      node = unitAt(hit.closest('[part="root"]'), x, y);
    }
    var root = node ? node.closest('[part="root"]') : null;
    if (!root || root.getAttribute("data-fy-select") !== "jamo" || !selectableChain(root)) {
      return null;
    }
    if (hasPart(node, "glyph")) {
      node = partNodes(node, "jamo")[0] || null;
    }
    return node ? { node: node, root: root, space: hasPart(node, "space") } : null;
  }

  /* 자모를 누르고 끄는데 닻이 그 바탕 요소 밖이면 — 빛 칠은 자모 글자를 숨기고(visibility) 낱말 사이 칸은 접히는 공백이라 바탕 요소
   * 안에 브라우저가 선택 자리를 둘 곳이 없다(0.1.3 탐색 matrix-11) — 닻을 누른 자모로, 끝을 포인터 아래 대상(없으면 브라우저 끝)으로.
   * Shift+누르기는 브라우저가 있던 닻을 지켜 늘이는 것이라 두고(탐색 api-20), 닻을 읽을 수 없으면 두지 않는다 */
  function anchorPressed(doc, selection, pointer, under) {
    var pressed = pointer && !pointer.shift ? pointer.jamo : null;
    var root = pressed && pressed.isConnected !== false ? pressed.closest('[part="root"]') : null;
    var ends = root && selection.rangeCount ? selectionEnds(doc, selection, root.getRootNode()) : null;
    var anchor = ends ? ends.anchor[0] : null;
    if (!root || (selection.rangeCount && !ends) || (anchor && (anchor === root || root.contains(anchor))) || !selectableChain(root)) {
      return false;
    }
    var target = under ? [under.node, 0] : ends && ends.focus[0] ? ends.focus : [pressed, 0];
    try {
      selection.setBaseAndExtent(pressed, 0, target[0], target[1]);
      return true;
    } catch (error) {
      return false;
    }
  }

  /* 끄는 선택의 끝을 포인터 아래로 — 자모·칸이면 그 맨 앞(이미 그 안이면 그대로), 글자 칸의 빈 곳이면 steerPastGlyph, 그래도
   * 끝이 그 글자의 자모 밖이면 첫 자모 */
  function steerSelection(doc, x, y) {
    var selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
    if (!selection || typeof doc.elementFromPoint !== "function") {
      return;
    }
    var pointer = SELECT_POINTERS.get(doc);
    if (pointer && !pressSelects(pointer)) {
      return;
    }
    var hit = doc.elementFromPoint(x, y);
    var under = pointerTarget(hit);
    var pressed = pointer && pointer.down ? pointer.jamo : null;
    /* 끄는 중이면 접힌 선택도 맞춘다 — 누른 직후 첫 맞춤은 포인터가 아직 누른 글자 위라 닻과 끝이 같은 자리다 */
    if (anchorPressed(doc, selection, pointer, under) || !selection.rangeCount || (selection.isCollapsed && !pressed)) {
      return;
    }
    var focus = selection.focusNode;
    var direct = hit && typeof hit.closest === "function" && hit.closest('[part~="jamo"], [part~="space"]');
    if (!direct && steerPastGlyph(selection, x, y, hit)) {
      return;
    }
    if (!under || !focus || under.node === focus || under.node.contains(focus)) {
      return;
    }
    if (!direct) {
      var glyph = under.node.closest('[part~="glyph"]');
      if (glyph && partNodes(glyph, "jamo").some(function (each) { return each === focus || each.contains(focus); })) {
        return;
      }
    }
    try {
      selection.extend(under.node, 0);
    } catch (error) { /* 브라우저가 받지 않으면 그대로 */ }
  }

  /* 노드 자리가 글자 내용의 맨 앞인가(글자 안 첫 자식들을 따라 내려간 0 자리) */
  function atGlyphStart(glyph, node, offset) {
    if (offset !== 0) {
      return false;
    }
    for (var current = node; current && current !== glyph; current = current.parentNode) {
      if (current.previousSibling) {
        return false;
      }
    }
    return current === glyph;
  }

  /* 포인터가 자모 위가 아닌 곳(줄 끝 너머, 글자 칸의 빈 곳, 낱말 사이 칸)에서 놓였을 때 — 앞으로 고르는 중이고 끝이 글자 내용의
   * 맨 앞에 있으면 포인터 자리로 그 글자를 넣을지 정한다.
   * - 포인터가 그 글자 칸 가운데보다 뒤(같은 줄): Firefox는 끝을 마지막 글자의 맨 앞(glyph·glyph-body의 0 자리)에 두어 그 음절이
   *   강조·복사에서 빠진다 — 보통 글처럼 그 글자까지 고른다.
   * - 포인터가 그 글자 앞(같은 줄의 낱말 사이 칸, 앞 줄 끝 너머): 낱말 사이 칸이 접히는 공백이 된 뒤(0.1.3) Chromium·WebKit은 끝을
   *   다음 음절 첫 자모의 0 자리에 두어 그 음절이 강조·복사에 꼈다(0.1.3 탐색 api-1) — 끝을 그 칸 맨 앞(0.1.2와 같은 자리)이나 앞 줄
   *   끝으로 옮긴다. 범위만으로는 '글자 앞쪽 위에서 놓음'(그 글자를 고른다)과 가를 수 없어 포인터 자리로 가른다 */
  function steerPastGlyph(selection, x, y, hit) {
    var focus = selection.focusNode;
    var element = focus && (focus.nodeType === 1 ? focus : focus.parentNode);
    var glyph = element && typeof element.closest === "function" ? element.closest('[part="glyph"]') : null;
    var root = glyph ? glyph.closest('[part="root"]') : null;
    if (!root || root.getAttribute("data-fy-select") !== "jamo" || !atGlyphStart(glyph, focus, selection.focusOffset)) {
      return false;
    }
    var range = selection.getRangeAt(0);
    if (range.endContainer !== focus || range.endOffset !== selection.focusOffset || range.collapsed) {
      return false;
    }
    var box = glyph.getBoundingClientRect();
    var target = null;
    if (y >= box.top && y <= box.bottom && x >= box.left + box.width / 2) {
      target = [glyph, glyph.childNodes.length];
    } else if (y < box.top || (y <= box.bottom && x < box.left)) {
      /* 포인터가 위 화면 줄이면: 그 글자가 원문 줄의 첫 글자일 때만 앞 원문 줄 끝 — 같은 원문 줄이 화면에서 접힌 것이면 앞 줄로 가면
       * 선택이 닻 앞으로 뒤집힌다(WebKit, 0.1.3 탐색 api-15). 그때는 그 글자 앞(앞에 낱말 사이 칸이 있으면 그 칸 맨 앞)이다 */
      var space = hit && typeof hit.closest === "function" ? hit.closest('[part~="space"]') : null;
      var line = glyph.closest('[part~="line"]');
      var previous = y < box.top && line && atGlyphStart(line, glyph, 0) ? line.previousElementSibling : null;
      var word = glyph.parentNode;
      var prior = !glyph.previousSibling && word ? word.previousSibling : null;
      var before = prior && prior.nodeType === 1 && hasPart(prior, "space") ? prior : null;
      target = space && root.contains(space) ? [space, 0]
        : previous && hasPart(previous, "line") ? [previous, previous.childNodes.length]
        : before ? [before, 0]
        : [glyph.parentNode, nodeIndex(glyph)];
    }
    if (!target || !selectableChain(root)) {
      return false;
    }
    try {
      selection.extend(target[0], target[1]);
      return true;
    } catch (error) {
      return false; /* 브라우저가 받지 않으면 그대로 */
    }
  }

  function scheduleSelectionMirror(doc) {
    if (SELECT_FRAMES.indexOf(doc) >= 0) {
      return;
    }
    SELECT_FRAMES.push(doc);
    var view = doc.defaultView;
    var run = function () {
      SELECT_FRAMES.splice(SELECT_FRAMES.indexOf(doc), 1);
      mirrorSelection(doc);
    };
    if (view && typeof view.requestAnimationFrame === "function") {
      view.requestAnimationFrame(run);
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function refreshSelectionMarks(doc) {
    var marks = doc && SELECT_MARKS.get(doc);
    if (marks && marks.size) {
      scheduleSelectionMirror(doc);
    }
  }

  /* 같은 원문을 다시 그릴 때 옛 root 안에 있던 선택 끝을 새 root의 같은 자리(자식 차례 길)로 옮긴다 — 노드를 바꾸면 브라우저가
   * 그 끝을 바탕 요소로 접어 고른 것이 사라진다 */
  function pointPath(root, node, offset) {
    if (!node || (node !== root && !root.contains(node))) {
      return null;
    }
    var path = [];
    for (var current = node; current !== root; current = current.parentNode) {
      path.unshift(nodeIndex(current));
    }
    return { path: path, offset: offset };
  }

  /* 다시 그리기 묶음이 쓰기 전에 한 번 읽은 선택(runRenderJobs) — 범위 하나일 때만 끝 둘을 기억한다 */
  function selectionSnapshot(doc) {
    var selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
    if (!selection || typeof selection.setBaseAndExtent !== "function" || selection.rangeCount !== 1) {
      return null;
    }
    return {
      selection: selection,
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
  }

  function keepSelectionPoints(host, snapshot) {
    var old = getManagedRoot(host);
    if (!old || !snapshot) {
      return null;
    }
    var anchor = pointPath(old, snapshot.anchorNode, snapshot.anchorOffset);
    var focus = pointPath(old, snapshot.focusNode, snapshot.focusOffset);
    return anchor || focus ? { snapshot: snapshot, anchor: anchor, focus: focus } : null;
  }

  /* 이 바탕 요소 밖의 끝 — 묶음 앞에서 읽은 자리. 앞서 다시 그린 바탕 요소가 그 노드를 떼어 냈으면(원문이 바뀌어 옮기지 못한 끝)
   * 브라우저가 접은 지금 자리를 읽는다 */
  function outsidePoint(snapshot, end) {
    var node = snapshot[end + "Node"];
    if (node && node.isConnected === false) {
      return [snapshot.selection[end + "Node"], snapshot.selection[end + "Offset"]];
    }
    return [node, snapshot[end + "Offset"]];
  }

  function pointIn(root, point) {
    if (!point.path) {
      return point;
    }
    var node = root;
    for (var index = 0; index < point.path.length; index += 1) {
      var child = node.childNodes[point.path[index]];
      if (!child) {
        return [node, node.childNodes.length];
      }
      node = child;
    }
    return [node, Math.min(point.offset, node.nodeType === 3 ? node.data.length : node.childNodes.length)];
  }

  function restoreSelectionPoints(kept, root) {
    var snapshot = kept.snapshot;
    var anchor = kept.anchor ? pointIn(root, kept.anchor) : outsidePoint(snapshot, "anchor");
    var focus = kept.focus ? pointIn(root, kept.focus) : outsidePoint(snapshot, "focus");
    try {
      snapshot.selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1]);
      /* 같은 묶음의 다음 바탕 요소는 옮긴 끝을 본다(선택을 다시 읽지 않는다) */
      snapshot.anchorNode = anchor[0];
      snapshot.anchorOffset = anchor[1];
      snapshot.focusNode = focus[0];
      snapshot.focusOffset = focus[1];
    } catch (error) { /* 끝 노드가 사라졌으면 브라우저가 접은 대로 둔다 */ }
  }

  /* 두 번 누르면 낱말, 세 번 누르면 문단 — 자모 노드마다 글자가 따로라 브라우저는 자모 하나만(WebKit은 아무것도) 고른다. 고를 수 없는 곳
   * (단추 안, user-select: none 조상)은 그대로 둔다 */
  function selectByClicks(doc, event) {
    var target = typeof event.composedPath === "function" ? event.composedPath()[0] : event.target;
    var root = event.detail >= 2 && event.button === 0 && target && typeof target.closest === "function"
      ? target.closest('[part="root"]') : null;
    var selection = root && root.getAttribute("data-fy-select") === "jamo" && typeof doc.getSelection === "function"
      ? doc.getSelection() : null;
    if (!selection || root.closest("button") || !selectableChain(root)) {
      return;
    }
    if (event.detail === 2) {
      var word = target.closest('[part="word"]');
      if (word && root.contains(word)) {
        selection.setBaseAndExtent(word, 0, word, word.childNodes.length);
      }
      return;
    }
    /* 꾸밈 방식은 바탕 요소가 제 글(제목·문단)을 가진다. <font-kku>는 글 속 조각이라(코어 CSS가 inline-block) 그것을 담은 블록 */
    var host = root.parentNode;
    var view = doc.defaultView;
    var block = host.localName === "font-kku" ? composedParent(host) : host;
    while (block && block.nodeType === 1 && view && /^(inline|contents)$/.test(view.getComputedStyle(block).display)) {
      block = composedParent(block);
    }
    if (block === host) {
      selection.setBaseAndExtent(host, 0, host, host.childNodes.length);
    } else if (!block || block.nodeType !== 1 || block === doc.body || block === doc.documentElement) {
      selection.setBaseAndExtent(root, 0, root, root.childNodes.length);
    } else {
      selection.selectAllChildren(block);
    }
  }

  function composedParent(node) {
    var parent = node.parentNode;
    return parent && parent.nodeType === 11 ? parent.host : parent;
  }

  /* 노드와 조상(그림자 경계 너머까지) 어디에도 user-select: none이 없는가 — Firefox는 계산값이 이어받지 않아 조상까지 본다. memo는 한 번 셈에서 조상을 나눠 쓴다 */
  function selectableChain(node, memo) {
    var view = node && node.nodeType === 1 && node.ownerDocument ? node.ownerDocument.defaultView : null;
    if (!view) {
      return true;
    }
    if (memo && memo.has(node)) {
      return memo.get(node);
    }
    var style = view.getComputedStyle(node);
    var parent = composedParent(node);
    var result = (style.userSelect || style.webkitUserSelect) !== "none" && (!parent || selectableChain(parent, memo));
    if (memo) {
      memo.set(node, result);
    }
    return result;
  }

  function mirrorSelection(doc) {
    var pointer = SELECT_POINTERS.get(doc);
    if (pointer && pointer.armed && ((pointer.moved && pointer.down) || pointer.release)) {
      pointer.release = false;
      steerSelection(doc, pointer.x, pointer.y);
    }
    var plan = selectionPlan(doc);
    var next = new Map();
    (plan ? plan.picks : []).forEach(function (pick) {
      pick.marks.forEach(function (entry) {
        next.set(entry[0], entry[1]);
      });
    });
    var previous = SELECT_MARKS.get(doc) || new Map();
    previous.forEach(function (value, node) {
      if (!next.has(node)) {
        node.removeAttribute("data-fy-selected");
      }
    });
    next.forEach(function (value, node) {
      if (node.getAttribute("data-fy-selected") !== value) {
        node.setAttribute("data-fy-selected", value);
      }
    });
    SELECT_MARKS.set(doc, next);
  }

  // ── 복사·잘라내기

  function handleClipboardEvent(event) {
    var doc = this && this.nodeType === 9 ? this : null;
    if (!doc || event.defaultPrevented || !event.clipboardData) {
      return;
    }
    var origin = typeof event.composedPath === "function" ? event.composedPath()[0] : event.target;
    if (origin && /^(INPUT|TEXTAREA)$/.test(origin.tagName || "")) {
      return;
    }
    var plan = selectionPlan(doc);
    if (!plan || !plan.picks.length) {
      return;
    }
    var cut = event.type === "cut";
    if (cut && !planEditable(plan)) {
      return;
    }
    var copied;
    try {
      copied = copyFromPlan(doc, plan);
    } catch (error) {
      return;
    }
    event.clipboardData.setData("text/plain", copied.text);
    if (copied.html) {
      event.clipboardData.setData("text/html", copied.html);
    }
    event.preventDefault();
    if (cut) {
      try {
        cutFromPlan(doc, plan);
      } catch (error) { /* 복사는 끝났다 — 지우지 못하면 둔다 */ }
    }
  }

  function planEditable(plan) {
    var segment = plan.segments[0];
    var node = segment && segment.range.commonAncestorContainer;
    if (node && node.nodeType !== 1) {
      node = node.parentNode;
    }
    return Boolean(node && node.isContentEditable);
  }

  function saveSelection(doc, selection) {
    var ranges = composedRanges(doc, selection);
    var live = [];
    for (var index = 0; index < selection.rangeCount; index += 1) {
      live.push(selection.getRangeAt(index).cloneRange());
    }
    var backward = selection.direction === "backward";
    if (selection.direction === undefined && ranges.length === 1 && selection.anchorNode) {
      backward = selection.anchorNode === ranges[0].endContainer && selection.anchorOffset === ranges[0].endOffset &&
        !(ranges[0].startContainer === ranges[0].endContainer && ranges[0].startOffset === ranges[0].endOffset);
    }
    return { ranges: ranges, live: live, backward: backward, changed: false };
  }

  function restoreSelection(selection, saved) {
    try {
      if (saved.ranges.length === 1 && typeof selection.setBaseAndExtent === "function") {
        var range = saved.ranges[0];
        if (saved.backward) {
          selection.setBaseAndExtent(range.endContainer, range.endOffset, range.startContainer, range.startOffset);
        } else {
          selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
        }
        return;
      }
    } catch (error) { /* 아래 */ }
    selection.removeAllRanges();
    saved.live.forEach(function (range) {
      selection.addRange(range);
    });
  }

  /* 브라우저 직렬화 — 고른 범위를 잠깐 바꿔 읽는다(되돌리는 것은 copyFromPlan) */
  function nativeText(selection, range, saved) {
    saved.changed = true;
    if (typeof selection.setBaseAndExtent === "function") {
      selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
    } else {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return selection.toString();
  }

  function mirrorText(host) {
    var mirror = getSrSourceNode(host);
    return mirror && mirror.firstChild && mirror.firstChild.nodeType === 3 ? mirror.firstChild : null;
  }

  function boundaryHost(node, hosts, tree) {
    for (var index = 0; index < hosts.length; index += 1) {
      var host = hosts[index];
      if (treeOf(host) === tree && (host === node || host.contains(node))) {
        return host;
      }
    }
    return null;
  }

  function pickOf(picks, host) {
    for (var index = 0; index < picks.length; index += 1) {
      if (picks[index].host === host) {
        return picks[index];
      }
    }
    return null;
  }

  /* 범위 끝을 원문 거울의 원문 위치로 옮긴다 */
  function moveIntoMirror(range, end, host, offset) {
    var text = mirrorText(host);
    if (text) {
      var at = Math.max(0, Math.min(offset, text.data.length));
      if (end) {
        range.setEnd(text, at);
      } else {
        range.setStart(text, at);
      }
    } else if (end) {
      range.setEndBefore(host);
    } else {
      range.setStartAfter(host);
    }
  }

  function looseText(text) {
    return text.replace(/ /g, " ").replace(/\r/g, "\n");
  }

  /* 브라우저 직렬화 안의 원문 조각을 NFC 원문으로 바꾼다 — 원문이 NFC가 아니거나 브라우저가 고쳐 쓰는 글자(NBSP·\r, Firefox)가
   * 있을 때만. 조각 자리는 범위 시작부터 그 조각 첫 글자까지 직렬화한 길이다(블록 사이 줄바꿈까지 같은 셈). */
  function fixMirrorPieces(selection, mapped, text, picks, saved) {
    var edits = [];
    picks.forEach(function (pick) {
      var piece = pick.state.source.slice(pick.start, pick.end);
      var mirror = mirrorText(pick.host);
      if (!piece || !mirror || (pick.exact && piece === pick.text && !/[ \r]/.test(piece))) {
        return;
      }
      var first = segmentGraphemes(piece)[0].length;
      var prefix = mapped.cloneRange();
      prefix.setEnd(mirror, Math.min(pick.start + first, mirror.data.length));
      var at = nativeText(selection, prefix, saved).length - first;
      if (at >= 0 && looseText(text.slice(at, at + piece.length)) === looseText(piece)) {
        edits.push([at, piece.length, pick.text]);
      }
    });
    edits.sort(function (left, right) {
      return right[0] - left[0];
    }).forEach(function (edit) {
      text = text.slice(0, edit[0]) + edit[2] + text.slice(edit[0] + edit[1]);
    });
    return text;
  }

  /* 복사한 HTML에서 런타임 표면(data-fy-*·data-source, <font-kku>의 data-* 거울, 런타임 인라인 변수)을 지운다. 빈칸·줄바꿈은
   * pre-wrap으로 지킨다 — 붙여 넣은 곳에 런타임이 있으면 그 <font-kku>가 같은 글꼴로 다시 그린다 */
  function stripRuntime(element, text) {
    var mirrors = element.localName === "font-kku" ? SELECT_ELEMENT_MIRRORS : [];
    Array.prototype.slice.call(element.attributes || []).forEach(function (attribute) {
      if (/^data-fy-/.test(attribute.name) || attribute.name === "data-source" || mirrors.indexOf(attribute.name) >= 0) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.style) {
      SELECT_HOST_STYLES.forEach(function (name) {
        element.style.removeProperty(name);
      });
      if (/[\n\r\t]| {2}|^ | $/.test(text)) {
        element.style.setProperty("white-space", "pre-wrap");
      }
      if (!element.getAttribute("style")) {
        element.removeAttribute("style");
      }
    }
  }

  function isHostClone(element) {
    return elementChildren(element).some(function (child) {
      return child.hasAttribute("data-fy-root") || child.hasAttribute("data-fy-sr");
    });
  }

  /* 범위의 HTML — 바탕 요소마다 그린 트리 대신 고른 원문(원문 거울 조각, NFC) 한 줄. 스크립트·스타일 요소는 뺀다 */
  function rangeHtml(doc, range) {
    var box = doc.createElement("div");
    box.appendChild(range.cloneContents());
    var clones = [];
    (function walk(node) {
      elementChildren(node).forEach(function (child) {
        if (/^(script|style|link|template|noscript)$/i.test(child.localName || "")) {
          node.removeChild(child);
        } else if (isHostClone(child)) {
          clones.push(child);
        } else {
          walk(child);
        }
      });
    })(box);
    clones.forEach(function (clone) {
      var mirror = elementChildren(clone).filter(function (child) {
        return child.hasAttribute("data-fy-sr");
      })[0];
      var text = nfc(mirror ? mirror.textContent || "" : "");
      if (!text) {
        clone.parentNode.removeChild(clone);
        return;
      }
      clone.textContent = text;
      stripRuntime(clone, text);
    });
    return box.innerHTML;
  }

  function shellHtml(doc, pick) {
    var shell = pick.host.cloneNode(false);
    shell.textContent = pick.text;
    stripRuntime(shell, pick.text);
    var box = doc.createElement("div");
    box.appendChild(shell);
    return box.innerHTML;
  }

  function copySegment(doc, selection, segment, plan, saved) {
    var range = segment.range;
    var own = plan.picks.filter(function (pick) {
      return pick.segment === segment && !pick.nested;
    });
    var startHost = boundaryHost(range.startContainer, plan.hosts, segment.tree);
    var endHost = boundaryHost(range.endContainer, plan.hosts, segment.tree);
    var startPick = startHost ? pickOf(own, startHost) : null;
    var endPick = endHost ? pickOf(own, endHost) : null;
    if (startHost && startHost === endHost) {
      return { text: startPick ? startPick.text : "", html: startPick ? shellHtml(doc, startPick) : "" };
    }
    var mapped = range.cloneRange();
    if (startHost) {
      moveIntoMirror(mapped, false, startHost, startPick ? startPick.start : STATE.get(startHost).source.length);
    }
    if (endHost) {
      moveIntoMirror(mapped, true, endHost, endPick ? endPick.end : 0);
    }
    var roots = plan.picks.filter(function (pick) {
      return pick.segment === segment;
    }).map(function (pick) {
      return pick.root;
    });
    [startHost, endHost].forEach(function (host) {
      var root = host ? getManagedRoot(host) : null;
      if (root && roots.indexOf(root) < 0) {
        roots.push(root);
      }
    });
    var text;
    roots.forEach(function (root) {
      root.setAttribute("data-fy-select", "copy");
    });
    try {
      text = fixMirrorPieces(selection, mapped, nativeText(selection, mapped, saved), own, saved);
    } finally {
      roots.forEach(function (root) {
        root.setAttribute("data-fy-select", "jamo");
      });
    }
    return { text: text, html: rangeHtml(doc, mapped) };
  }

  function copyFromPlan(doc, plan) {
    var selection = plan.selection;
    var saved = saveSelection(doc, selection);
    var texts = [];
    var htmls = [];
    try {
      plan.segments.forEach(function (segment) {
        var piece = copySegment(doc, selection, segment, plan, saved);
        texts.push(piece.text);
        htmls.push(piece.html);
      });
    } finally {
      if (saved.changed) {
        restoreSelection(selection, saved);
      }
    }
    return { text: texts.join(""), html: htmls.join("") };
  }

  function collapseBeside(selection, host, after) {
    if (host.parentNode) {
      selection.collapse(host.parentNode, nodeIndex(host) + (after ? 1 : 0));
    }
  }

  /* 잘라내기(편집 가능한 곳): 복사한 뒤 고른 것을 지운다 — 일부만 고른 바탕 요소는 남은 원문으로 다시 그리고(남는 글이 없으면
   * 바탕 요소째), 나머지는 브라우저 지우기(execCommand delete — 되돌리기 기록)로 */
  function cutFromPlan(doc, plan) {
    if (plan.segments.length !== 1) {
      return;
    }
    var selection = plan.selection;
    var segment = plan.segments[0];
    var range = segment.range;
    var own = plan.picks.filter(function (pick) {
      return !pick.nested;
    });
    var startHost = boundaryHost(range.startContainer, plan.hosts, segment.tree);
    var endHost = boundaryHost(range.endContainer, plan.hosts, segment.tree);
    var middle = range.cloneRange();
    var redraw = [];
    [[startHost, true], [endHost, false]].forEach(function (entry) {
      var host = entry[0];
      var pick = host ? pickOf(own, host) : null;
      if (!host) {
        return;
      }
      var source = STATE.get(host).source;
      var rest = !pick ? source : startHost === endHost ? source.slice(0, pick.start) + source.slice(pick.end)
        : entry[1] ? source.slice(0, pick.start) : source.slice(pick.end);
      if (!rest) {
        if (entry[1]) {
          middle.setStartBefore(host);
        } else {
          middle.setEndAfter(host);
        }
        return;
      }
      if (entry[1]) {
        middle.setStartAfter(host);
      } else {
        middle.setEndBefore(host);
      }
      if (rest !== source && !redraw.some(function (item) { return item[0] === host; })) {
        redraw.push([host, rest]);
      }
    });
    if (!middle.collapsed) {
      selection.setBaseAndExtent(middle.startContainer, middle.startOffset, middle.endContainer, middle.endOffset);
      var deleted = false;
      try {
        deleted = doc.execCommand("delete", false);
      } catch (error) {
        deleted = false;
      }
      if (!deleted) {
        middle.deleteContents();
      }
    }
    redraw.forEach(function (item) {
      rerender(item[0], "mutation", item[1]);
    });
    if (redraw.length && redraw[0][0].parentNode) {
      collapseBeside(selection, redraw[0][0], redraw[0][0] === startHost);
    }
  }

  // ── Public render surface ──────────────────────────────────

  function renderWithReason(target, options, reason) {
    if (!isElementNode(target)) {
      throw new TypeError("font-kku: render target must be an element");
    }
    return runRenderJobs([createRenderJob(target, options || {}, reason)])[0];
  }

  /* Contract (ADR-002): attributes are the persistent option source. JS
   * options apply to this call only — previously resolved options are never
   * merged back in, so attribute/data-* changes are re-read on every render
   * and seed="auto" re-resolves to a fresh value per render. Every automatic
   * re-render (attribute, text mutation, style re-resolution) re-reads the
   * attributes the same way. `refresh` is the same operation under the name
   * used for already-rendered hosts. */
  function render(target, options) {
    return renderWithReason(target, options, "render");
  }

  function refresh(target, options) {
    return renderWithReason(target, options, "refresh");
  }

  /* Upgrade decisions use this runtime's state, not DOM markers: a clone or
   * an SSR tree carries data-fy-upgraded without being managed. */
  function upgrade(target) {
    if (!isElementNode(target)) {
      return null;
    }
    if (STATE.has(target)) {
      return target;
    }
    return runRenderJobs([createRenderJob(target, undefined, "upgrade")])[0];
  }

  function upgradeAll(root) {
    var scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope || typeof scope.querySelectorAll !== "function") {
      return [];
    }
    var hosts = Array.prototype.slice.call(scope.querySelectorAll("font-kku, .font-kku"));
    runRenderJobs(hosts.filter(function (host) {
      return !STATE.has(host);
    }).map(function (host) {
      return createRenderJob(host, undefined, "upgrade");
    }));
    return hosts;
  }

  /* Font CSS declares structure-changing metadata (--fy-jamo-depth,
   * --fy-expression-mode, --fy-material) that is read at render time. A
   * stylesheet that arrives after the first render (async <link>, framework
   * injection) would otherwise leave the host in the default structure.
   * Re-resolve against the current styles; hosts whose structure changed are
   * re-rendered (attributes re-read, resolved seed kept), hosts whose font
   * id/contract changed get updated fontInfo() without a rebuild, and hosts
   * rendered while detached are finished with their original call options.
   * Covers hosts inside shadow roots; `root` narrows the scope
   * (shadow-including). Returns the hosts whose resolution changed. */
  function refreshAll(root) {
    var scope = root || (typeof document !== "undefined" ? document : null);
    if (!scope) {
      return [];
    }
    return checkHosts(collectHosts(scope), "restyle");
  }

  /* 배치 — 디자인이 받아들인 이전 revision을 적었으면 requested로 알린다(그리는 도장은 revision) */
  function fontInfoLayout(meta) {
    var profile = LAYOUT_PROFILES[meta.layout];
    var out = { profile: meta.layout, revision: profile.revision, model: profile.model };
    if (meta.layoutRequested) {
      out.requested = meta.layoutRequested;
    }
    return out;
  }

  /* Font metadata as resolved at the last render. `loaded` is false while the
   * requested font's CSS (its --fy-font-id) has not reached the host. */
  function fontInfo(host) {
    var state = STATE.get(host);
    if (!state) {
      return null;
    }
    var meta = state.options.fontMeta;
    return {
      font: state.options.font,
      id: meta.id || null,
      contract: meta.contract,
      material: meta.material,
      face: meta.face || null,
      design: meta.designRevision ? meta.design : null,
      designStatus: meta.designStatus || null,
      layout: meta.layout ? fontInfoLayout(meta) : null,
      loaded: Boolean(meta.id) && foldFontName(meta.id) === state.options.font && coreApplies(host)
    };
  }

  // ── 코어 CSS가 바탕 요소의 root에 닿는가(그림자 트리·다른 문서) ──

  /* 문서 stylesheet는 그림자 트리를 스타일하지 않는다. 코어 CSS(font-kku.css — 원문 거울 숨김, inline-block, 자모 배치)가 없는
   * root에서는 원문 거울과 자모 글자가 겹친 평문으로 깨진다. 원문 거울의 position: absolute(코어 규칙)로 본다 — 한 번 닿은 root는
   * 기억한다. 스타일을 읽을 수 없는 곳(분리된 바탕 요소, Node 흉내 DOM)은 닿는 것으로 친다. */
  var CORE_SEEN = new WeakSet();
  var CORE_CHECKED = new WeakSet();
  var CORE_CSS_FILE = /\/font-kku(?:\.min)?\.css(?:[?#].*)?$/;

  function coreApplies(host) {
    var root = rootFor(host);
    if (root && CORE_SEEN.has(root)) {
      return true;
    }
    var mirror = getSrSourceNode(host);
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    if (!mirror || host.isConnected === false || !view || typeof view.getComputedStyle !== "function") {
      return true;
    }
    var position = view.getComputedStyle(mirror).getPropertyValue("position");
    if (!position || position === "absolute") {
      if (position && root) {
        CORE_SEEN.add(root);
      }
      return true;
    }
    return false;
  }

  function coreLinkIn(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return null;
    }
    return Array.prototype.find.call(root.querySelectorAll('link[rel~="stylesheet"]'), function (link) {
      return CORE_CSS_FILE.test(link.href || "");
    }) || null;
  }

  /* 넣을 코어 CSS 주소 — 한 줄 설치가 붙인 것, 문서에 페이지가 붙인 것, fontBase 차례 */
  function coreCssHref() {
    if (CORE_CSS_HREF) {
      return CORE_CSS_HREF;
    }
    var link = typeof document !== "undefined" ? coreLinkIn(document) : null;
    if (link) {
      return link.href;
    }
    var base = autoloadBase();
    return base ? base + (AUTOLOAD.min ? "font-kku.min.css" : "font-kku.css") : null;
  }

  /* 바탕 요소가 그림자 트리 안이고 그 트리에 코어 CSS가 없으면 그 트리 맨 앞에 코어 CSS 링크를 한 번 넣는다(그 트리의 페이지
   * CSS가 뒤에 와서 이긴다). 다른 문서(iframe)에는 넣지 않는다 — 문서마다 제 스크립트 태그로 런타임과 CSS를 싣는다. 넣을 수 없으면
   * root마다 한 번 알린다. 그 root의 첫 그리기 뒤(autoload) 한 번만 본다 */
  function ensureCoreCss(host) {
    var root = rootFor(host);
    if (!root || CORE_CHECKED.has(root) || (typeof document !== "undefined" && root === document)) {
      return;
    }
    CORE_CHECKED.add(root);
    if (coreLinkIn(root) || coreApplies(host)) {
      return;
    }
    var warn = function (message) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(message);
      }
    };
    if (root.nodeType === 11) {
      var href = coreCssHref();
      if (href) {
        loadStylesheet(href, root, true).then(null, function (error) {
          warn(error.message);
        });
        return;
      }
      warn("font-kku: a host inside a shadow root has no font-kku.css — add <link rel=\"stylesheet\" href=\".../font-kku.css\"> " +
        "to that shadow root, or load font-kku.js with data-fonts so the runtime can add it");
      return;
    }
    warn("font-kku: a host in another document (an iframe) has no font-kku.css — load font-kku.js with its own script tag " +
      "(data-fonts) in that document");
  }

  // ── loadFont ───────────────────────────────────────────────

  var FONT_LOADS = new WeakMap();

  function findStylesheetLink(root, absolute) {
    if (typeof root.querySelectorAll !== "function") {
      return null;
    }
    return Array.prototype.find.call(
      root.querySelectorAll('link[rel~="stylesheet"]'),
      function (link) { return link.href === absolute; }
    ) || null;
  }

  /* A link whose load already settled has a sheet — but Chromium also gives
   * a failed link an empty sheet, so only a readable sheet with rules counts
   * as loaded. Anything else (failed, empty, or cross-origin and therefore
   * unreadable) is requested again through a fresh link; a successful
   * cross-origin sheet then comes from the HTTP cache. */
  function linkLooksLoaded(link) {
    if (!link.sheet) {
      return false;
    }
    try {
      return link.sheet.cssRules.length > 0;
    } catch (error) {
      return false;
    }
  }

  /* Share a Promise per URL/root while its link remains connected. Links go
   * into the document head or ShadowRoot; load refreshes that root, error
   * removes the owned link and rejects so the next call can retry. */
  function loadFont(href, options) {
    var root = (options && options.root) || (typeof document !== "undefined" ? document : null);
    if (!root || (root.nodeType !== 9 && root.nodeType !== 11)) {
      return Promise.reject(new Error("font-kku: loadFont needs a Document or ShadowRoot"));
    }
    return loadStylesheet(href, root, false);
  }

  /* first: 그림자 트리 맨 앞에 넣는다(코어 CSS — 그 트리의 페이지·글꼴 CSS가 뒤에 온다) */
  function loadStylesheet(href, root, first) {
    var doc = root.nodeType === 9 ? root : root.ownerDocument;
    var absolute = new URL(href, doc.baseURI).href;
    var loads = FONT_LOADS.get(root);
    if (!loads) {
      loads = new Map();
      FONT_LOADS.set(root, loads);
    }
    var cached = loads.get(absolute);
    if (cached && cached.link.isConnected) {
      return cached.promise;
    }
    loads.delete(absolute);

    var entry = { link: null, promise: null };
    var link = findStylesheetLink(root, absolute);
    if (link && linkLooksLoaded(link)) {
      entry.link = link;
      entry.promise = Promise.resolve(refreshAll(root));
      loads.set(absolute, entry);
      return entry.promise;
    }
    /* A still-loading author link is awaited; a settled one without rules
     * (failed) is not trusted — a fresh link retries the request. */
    var owned = !link || Boolean(link.sheet);
    if (owned) {
      link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = absolute;
    }
    entry.link = link;
    entry.promise = new Promise(function (resolve, reject) {
      function cleanup() {
        link.removeEventListener("load", onLoad);
        link.removeEventListener("error", onError);
      }
      function onLoad() {
        cleanup();
        resolve(refreshAll(root));
      }
      function onError() {
        cleanup();
        if (loads.get(absolute) === entry) {
          loads.delete(absolute);
        }
        if (owned && link.parentNode) {
          link.parentNode.removeChild(link);
        }
        reject(new Error("font-kku: failed to load font stylesheet " + absolute));
      }
      link.addEventListener("load", onLoad);
      link.addEventListener("error", onError);
    });
    loads.set(absolute, entry);
    if (owned) {
      if (root.nodeType === 9) {
        (doc.head || doc.documentElement).appendChild(link);
      } else if (first) {
        root.insertBefore(link, root.firstChild);
      } else {
        root.appendChild(link);
      }
    }
    return entry.promise;
  }

  // ── Autoload (fonts and vector jamo sets on demand) ────────

  /* ADR-019/020: fetch missing font CSS and jamo modules near the viewport.
   * fontBase overrides the script URL; autoload:false disables fetching.
   * data-fy-font-pending hides incomplete jamo until success, error or timeout.
   * CSS requests are scoped by root/URL; modules by document/URL. */
  /* off: 첫 한 줄 설치 태그가 data-autoload="false"로 껐다 — 뒤 태그가 다시 켜지 않는다(0.1.3 탐색 api-3) */
  var AUTOLOAD = { base: null, min: false, off: false };
  var AUTOLOAD_MARGIN = "800px 0px";
  var AUTOLOAD_REVEAL_MS = 3000;
  var AUTOLOAD_REQUESTS = new WeakMap();
  var AUTOLOAD_TIMERS = typeof WeakMap === "function" ? new WeakMap() : null;
  var autoloadObserver = null;

  function autoloadBase() {
    var config = global && global.FontKkuConfig;
    if (config && config.autoload === false) {
      return null;
    }
    if (config && config.fontBase && typeof document !== "undefined") {
      try {
        return new URL(String(config.fontBase), document.baseURI).href.replace(/\/?$/, "/");
      } catch (error) {
        return null;
      }
    }
    return AUTOLOAD.base;
  }

  function autoloadRequests(root) {
    var requests = AUTOLOAD_REQUESTS.get(root);
    if (!requests) { requests = Object.create(null); AUTOLOAD_REQUESTS.set(root, requests); }
    return requests;
  }

  function autoloadUrl(base, name, isSet) {
    return base + "profiles/" + name + (isSet ?
      (AUTOLOAD.min ? ".jamo.min.js" : ".jamo.js") : (AUTOLOAD.min ? ".min.css" : ".css"));
  }

  function autoloadNeeds(host) {
    var state = STATE.get(host);
    if (!state || state.unresolved || host.isConnected === false) {
      return null;
    }
    var options = state.options;
    var meta = options.fontMeta || {};
    var font = options.font;
    var base = autoloadBase();
    if (!base) { return null; }
    var root = rootFor(host);
    var fontUrl = autoloadUrl(base, font, false);
    var requests = autoloadRequests(root);
    var fontRequest = requests[fontUrl];
    if (fontRequest && (fontRequest.status === "ready" || fontRequest.status === "loading")) {
      var loads = FONT_LOADS.get(root);
      var loaded = loads && loads.get(fontUrl);
      if ((loaded && !loaded.link.isConnected) || (!loaded && fontRequest.status === "ready")) {
        delete requests[fontUrl];
        fontRequest = null;
      }
    }
    var needFont = font && !(meta.id && foldFontName(meta.id) === font) &&
      SCRIPT_LOADER_FONT_NAME.test(font) && (!fontRequest || fontRequest.status === "loading") ? font : null;
    var set = options.jamoSet;
    /* 디자인의 그림 소스 가운데 아직 없는 세트도 받는다(한 번에 하나 — 등록되면 다시 그리며 다음을 본다) */
    var design = appliedDesign(meta);
    if (design) {
      set = Object.keys(design.sources).map(function (id) { return design.sources[id]; }).filter(function (source) {
        return source.kind === "svg" && !JAMO_SETS[source.set];
      }).map(function (source) { return source.set; })[0] || null;
    }
    var setUrl = autoloadUrl(base, set, true);
    var scripts = autoloadRequests(host.ownerDocument);
    var setRequest = scripts[setUrl];
    if (setRequest && setRequest.status === "loading" && setRequest.node && !setRequest.node.isConnected) {
      delete scripts[setUrl];
      setRequest = null;
    }
    var needSet = set && !JAMO_SETS[set] && SCRIPT_LOADER_FONT_NAME.test(set) &&
      (!setRequest || setRequest.status === "loading") ? set : null;
    return needFont || needSet ? { font: needFont, set: needSet } : null;
  }

  function settleAutoload(host) {
    if (AUTOLOAD_TIMERS && AUTOLOAD_TIMERS.has(host)) {
      clearTimeout(AUTOLOAD_TIMERS.get(host));
      AUTOLOAD_TIMERS.delete(host);
    }
    if (typeof host.hasAttribute === "function" && host.hasAttribute("data-fy-font-pending")) {
      host.removeAttribute("data-fy-font-pending");
    }
  }

  function nearViewport(host) {
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    if (typeof host.getBoundingClientRect !== "function" || !view || !view.innerHeight) {
      return true;
    }
    var rect = host.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      /* Not rendered (display: none — a closed tab, a collapsed panel): wait
       * for the IntersectionObserver to see it appear. */
      return false;
    }
    return rect.bottom > -800 && rect.top < view.innerHeight + 800;
  }

  function autoload(host) {
    if (!host || typeof host.setAttribute !== "function") {
      return;
    }
    ensureCoreCss(host);
    var base = autoloadBase();
    var needs = base ? autoloadNeeds(host) : null;
    if (!needs) {
      settleAutoload(host);
      if (!base) {
        noteMissingJamoSet(host);
      }
      return;
    }
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    var IO = view && view.IntersectionObserver;
    if (typeof IO !== "function" || nearViewport(host)) {
      fetchFor(host, needs, base);
      return;
    }
    if (!autoloadObserver) {
      autoloadObserver = new IO(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) {
            return;
          }
          autoloadObserver.unobserve(entry.target);
          var later = autoloadBase() && autoloadNeeds(entry.target);
          if (later) {
            fetchFor(entry.target, later, autoloadBase());
          } else {
            settleAutoload(entry.target);
          }
        });
      }, { rootMargin: AUTOLOAD_MARGIN });
    }
    autoloadObserver.observe(host);
  }

  /* 받을 곳이 없는데(필요할 때 받기 기준 주소 없음 — 속성 없는 <script>, autoload:false) 등록되지 않은 jamo-set을 쓴 바탕
   * 요소 — 원소·기기 글꼴로 조용히 그려진다. load 뒤 가리개를 걷는 시간(AUTOLOAD_REVEAL_MS)이 지나도 등록되지 않았으면 세트 이름마다
   * 한 번 알린다. load 직후에 보면 타이머·fetch 뒤 registerJamo로 곧 등록할 세트에도 틀린 경고를 냈다(0.1.3 탐색 api-4) */
  var MISSING_SET_NOTED = Object.create(null);

  function noteMissingJamoSet(host) {
    var state = STATE.get(host);
    var set = state && state.options.jamoSet;
    var doc = host.ownerDocument;
    var view = doc && doc.defaultView;
    if (!set || JAMO_SETS[set] || MISSING_SET_NOTED[set] || !view || typeof view.setTimeout !== "function") {
      return;
    }
    MISSING_SET_NOTED[set] = true;
    function check() {
      view.setTimeout(function () {
        if (!JAMO_SETS[set] && typeof console !== "undefined" && console.warn) {
          console.warn('font-kku: jamo set "' + set + '" is not registered — add data-jamo-sets="' + set +
            '" to the font-kku.js script tag, load profiles/' + set + ".jamo.js, or call FontKku.registerJamo(\"" + set + "\", …)");
        }
      }, AUTOLOAD_REVEAL_MS);
    }
    if (doc.readyState === "complete") {
      check();
    } else {
      view.addEventListener("load", check, { once: true });
    }
  }

  function rootFor(host) {
    var root = typeof host.getRootNode === "function" ? host.getRootNode() : null;
    return root && (root.nodeType === 9 || root.nodeType === 11) ? root : host.ownerDocument;
  }

  /* Failure is scoped to the actual request. A different base/root is a new
   * request; retryFont explicitly retries the same address without a busy loop. */
  function failAutoload(root, url, name, kind, error) {
    autoloadRequests(root)[url] = { status: "error", error: error };
    if (typeof console !== "undefined" && console.warn) {
      var prefix = kind === "font" ? 'font-kku: font "' : 'font-kku: jamo set "';
      console.warn(prefix + name + '" was not found at ' + url);
    }
    forEachRegistered(function (other) {
      var state = STATE.get(other);
      if (!state || (kind === "font" ? rootFor(other) !== root || state.options.font !== name :
          other.ownerDocument !== root || state.options.jamoSet !== name)) { return; }
      if (autoloadUrl(autoloadBase(), name, kind === "jamo-set") !== url) { return; }
      settleAutoload(other);
      var view = other.ownerDocument && other.ownerDocument.defaultView;
      var EventCtor = (view && view.CustomEvent) || (typeof CustomEvent === "function" ? CustomEvent : null);
      if (EventCtor) {
        other.dispatchEvent(new EventCtor("font-kku:loaderror", { bubbles: true, composed: true,
          detail: { kind: kind, name: name, url: url, error: error } }));
      }
    });
  }

  function retryFont(host) {
    var state = host && STATE.get(host);
    var base = autoloadBase();
    if (!state || !base) { return null; }
    [[rootFor(host), state.options.font, false], [host.ownerDocument, state.options.jamoSet, true]].forEach(function (item) {
      var requests = autoloadRequests(item[0]);
      var url = autoloadUrl(base, item[1], item[2]);
      if (requests[url] && requests[url].status !== "loading") { delete requests[url]; }
    });
    autoload(host);
    return host;
  }

  /* Hide the host while its request is on the way (offscreen hosts are only
   * hidden once they come near and their request starts). */
  function markPending(host) {
    if (host.hasAttribute("data-fy-font-pending")) {
      return;
    }
    host.setAttribute("data-fy-font-pending", "");
    if (AUTOLOAD_TIMERS) {
      AUTOLOAD_TIMERS.set(host, setTimeout(function () {
        settleAutoload(host);
      }, AUTOLOAD_REVEAL_MS));
    }
  }

  function fetchFor(host, needs, base) {
    markPending(host);
    var root = rootFor(host);
    if (needs.font) {
      var href = autoloadUrl(base, needs.font, false);
      var requests = autoloadRequests(root);
      if (!requests[href]) {
        var request = requests[href] = { status: "loading" };
        loadFont(href, { root: root }).then(function () {
          if (requests[href] !== request) { return; }
          request.status = "ready";
          forEachRegistered(function (other) { if (rootFor(other) === root) { autoload(other); } });
        }, function (error) {
          if (requests[href] !== request) { return; }
          failAutoload(root, href, needs.font, "font", error);
        });
      }
    }
    if (needs.set) {
      var doc = host.ownerDocument;
      var src = autoloadUrl(base, needs.set, true);
      var scripts = autoloadRequests(doc);
      if (!scripts[src]) {
        var tag = doc.createElement("script");
        var scriptRequest = scripts[src] = { status: "loading", node: tag };
        tag.src = src;
        tag.async = false;
        tag.addEventListener("error", function () {
          if (scripts[src] !== scriptRequest) { return; }
          if (tag.parentNode) { tag.parentNode.removeChild(tag); }
          failAutoload(doc, src, needs.set, "jamo-set", new Error("font-kku: failed to load jamo set " + src));
        });
        tag.addEventListener("load", function () {
          if (scripts[src] !== scriptRequest) { return; }
          if (!JAMO_SETS[needs.set]) {
            if (tag.parentNode) { tag.parentNode.removeChild(tag); }
            failAutoload(doc, src, needs.set, "jamo-set", new Error("font-kku: module did not register " + needs.set));
            return;
          }
          scriptRequest.status = "ready";
          forEachRegistered(function (other) { if (other.ownerDocument === doc) { autoload(other); } });
        });
        (doc.head || doc.documentElement).appendChild(tag);
      }
    }
  }

  // ── Custom element and bootstrap ───────────────────────────

  var DEFINE_BATCH = null;
  var PARSE_DEFERRED = [];
  var PARSE_LISTENING = new WeakSet();

  /* A parser-created <font-kku> is connected when its start tag is parsed,
   * before its text. Rendering then would record an empty source. */
  function awaitingParse(host) {
    var doc = host.ownerDocument;
    return Boolean(doc) && doc.readyState === "loading" && !host.firstChild;
  }

  function flushParseDeferred() {
    var ready = [];
    PARSE_DEFERRED = PARSE_DEFERRED.filter(function (host) {
      if (host.ownerDocument && host.ownerDocument.readyState === "loading") {
        return true;
      }
      if (ready.indexOf(host) < 0) {
        ready.push(host);
      }
      return false;
    });
    runRenderJobs(ready.filter(function (host) {
      return host.isConnected && !STATE.has(host);
    }).map(function (host) {
      return createRenderJob(host, undefined, "connect");
    }));
  }

  function deferUntilParsed(host) {
    PARSE_DEFERRED.push(host);
    var doc = host.ownerDocument;
    if (!PARSE_LISTENING.has(doc)) {
      PARSE_LISTENING.add(doc);
      doc.addEventListener("DOMContentLoaded", function () {
        PARSE_LISTENING.delete(doc);
        flushParseDeferred();
      }, { once: true });
    }
  }

  function connectCustomElement(host) {
    var state = STATE.get(host);
    if (!state) {
      if (awaitingParse(host)) {
        deferUntilParsed(host);
      } else if (DEFINE_BATCH) {
        DEFINE_BATCH.push(host);
      } else {
        runRenderJobs([createRenderJob(host, undefined, "connect")]);
      }
      return;
    }
    /* Reconnected: catch up on what changed while the observer was off. */
    if (snapshotOptions(host, state.hostMode) !== state.snapshot) {
      rerender(host, "attribute");
      return;
    }
    var liveSource = readLiveSource(host, state);
    if (liveSource !== state.source) {
      rerender(host, "mutation", liveSource);
      return;
    }
    if (!state.observer) {
      observeHost(host, state);
    }
    if (state.unresolved) {
      /* Rendered while detached: resolve now, synchronously. */
      checkHosts([host], "connect");
    } else {
      /* Moved: the new place may style it differently. Checked in a batch
       * with every other host connected in this frame. */
      trackPending(host);
    }
  }

  function define() {
    if (typeof customElements === "undefined" || typeof HTMLElement === "undefined" ||
        customElements.get("font-kku")) {
      return;
    }

    var FontKkuElement = class FontKkuElement extends HTMLElement {
      static get observedAttributes() {
        return OPTION_KEYS.slice();
      }

      connectedCallback() {
        connectCustomElement(this);
      }

      disconnectedCallback() {
        var state = STATE.get(this);
        if (state && state.observer) {
          state.observer.disconnect();
          state.observer = undefined;
        }
      }

      /* The first render reads every attribute, so callbacks before it (the
       * upgrade replays one per attribute) are skipped, as are writes that
       * leave the option inputs as they were. A change while disconnected is
       * picked up on reconnect. */
      attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) {
          return;
        }
        var state = STATE.get(this);
        if (!state || !this.isConnected) {
          return;
        }
        if (snapshotOptions(this, state.hostMode) !== state.snapshot) {
          rerender(this, "attribute");
        }
      }
    };

    CUSTOM_ELEMENT_CLASS = FontKkuElement;
    /* define() upgrades every <font-kku> already in the document; batch
     * their first renders (see runRenderJobs). */
    DEFINE_BATCH = [];
    try {
      customElements.define("font-kku", FontKkuElement);
    } finally {
      var batch = DEFINE_BATCH;
      DEFINE_BATCH = null;
      runRenderJobs(batch.filter(function (host) {
        return !STATE.has(host);
      }).map(function (host) {
        return createRenderJob(host, undefined, "connect");
      }));
    }
  }

  function bootstrap(root) {
    if (typeof document === "undefined") {
      return [];
    }
    define();
    watchStylesheets(document);
    return upgradeAll(root || document);
  }

  function shouldAutoBootstrap() {
    var config = global && global.FontKkuConfig;
    return !(config && config.bootstrap === false);
  }

  // ── Text Mode Renderer ──────────────────────────────────────

  var JAMO_TO_COMPAT = {
    "\u1100": "\u3131", "\u1101": "\u3132", "\u1102": "\u3134", "\u1103": "\u3137", "\u1104": "\u3138",
    "\u1105": "\u3139", "\u1106": "\u3141", "\u1107": "\u3142", "\u1108": "\u3143", "\u1109": "\u3145",
    "\u110A": "\u3146", "\u110B": "\u3147", "\u110C": "\u3148", "\u110D": "\u3149", "\u110E": "\u314A",
    "\u110F": "\u314B", "\u1110": "\u314C", "\u1111": "\u314D", "\u1112": "\u314E",
    "\u1161": "\u314F", "\u1162": "\u3150", "\u1163": "\u3151", "\u1164": "\u3152", "\u1165": "\u3153",
    "\u1166": "\u3154", "\u1167": "\u3155", "\u1168": "\u3156", "\u1169": "\u3157", "\u116A": "\u3158",
    "\u116B": "\u3159", "\u116C": "\u315A", "\u116D": "\u315B", "\u116E": "\u315C", "\u116F": "\u315D",
    "\u1170": "\u315E", "\u1171": "\u315F", "\u1172": "\u3160", "\u1173": "\u3161", "\u1174": "\u3162",
    "\u1175": "\u3163",
    "\u11A8": "\u3131", "\u11A9": "\u3132", "\u11AA": "\u3133", "\u11AB": "\u3134", "\u11AC": "\u3135",
    "\u11AD": "\u3136", "\u11AE": "\u3137", "\u11AF": "\u3139", "\u11B0": "\u313A", "\u11B1": "\u313B",
    "\u11B2": "\u313C", "\u11B3": "\u313D", "\u11B4": "\u313E", "\u11B5": "\u313F", "\u11B6": "\u3140",
    "\u11B7": "\u3141", "\u11B8": "\u3142", "\u11B9": "\u3144", "\u11BA": "\u3145", "\u11BB": "\u3146",
    "\u11BC": "\u3147", "\u11BD": "\u3148", "\u11BE": "\u314A", "\u11BF": "\u314B", "\u11C0": "\u314C",
    "\u11C1": "\u314D", "\u11C2": "\u314E"
  };

  var FW_SP = "\u3000";

  /* BEGIN GENERATED display-width: scripts/generate_sidecar_tables.js mirrors
   * spec/tables.json unicode.displayWidth.wide here. Do not edit by hand. */
  var DISPLAY_WIDE_RANGES = [
    "1100-115F 231A-231B 2329-232A 23E9-23EC 23F0 23F3 25FD-25FE 2614-2615",
    "2630-2637 2648-2653 267F 268A-268F 2693 26A1 26AA-26AB 26BD-26BE",
    "26C4-26C5 26CE 26D4 26EA 26F2-26F3 26F5 26FA 26FD",
    "2705 270A-270B 2728 274C 274E 2753-2755 2757 2795-2797",
    "27B0 27BF 2B1B-2B1C 2B50 2B55 2E80-2E99 2E9B-2EF3 2F00-2FD5",
    "2FF0-3029 302E-303E 3041-3096 309B-30FF 3105-312F 3131-318E 3190-31E5 31EF-321E",
    "3220-3247 3250-A48C A490-A4C6 A960-A97C AC00-D7A3 F900-FAFF FE10-FE19 FE30-FE52",
    "FE54-FE66 FE68-FE6B FF01-FF60 FFE0-FFE6 16FE0-16FE3 16FF0-16FF6 17000-18CD5 18CFF-18D1E",
    "18D80-18DF2 1AFF0-1AFF3 1AFF5-1AFFB 1AFFD-1AFFE 1B000-1B122 1B132 1B150-1B152 1B155",
    "1B164-1B167 1B170-1B2FB 1D300-1D356 1D360-1D376 1F004 1F0CF 1F18E 1F191-1F19A",
    "1F200-1F202 1F210-1F23B 1F240-1F248 1F250-1F251 1F260-1F265 1F300-1F320 1F32D-1F335 1F337-1F37C",
    "1F37E-1F393 1F3A0-1F3CA 1F3CF-1F3D3 1F3E0-1F3F0 1F3F4 1F3F8-1F43E 1F440 1F442-1F4FC",
    "1F4FF-1F53D 1F54B-1F54E 1F550-1F567 1F57A 1F595-1F596 1F5A4 1F5FB-1F64F 1F680-1F6C5",
    "1F6CC 1F6D0-1F6D2 1F6D5-1F6D8 1F6DC-1F6DF 1F6EB-1F6EC 1F6F4-1F6FC 1F7E0-1F7EB 1F7F0",
    "1F90C-1F93A 1F93C-1F945 1F947-1F9FF 1FA70-1FA7C 1FA80-1FA8A 1FA8E-1FAC6 1FAC8 1FACD-1FADC",
    "1FADF-1FAEA 1FAEF-1FAF8 20000-2FFFD 30000-3FFFD"
  ].join(" ");
  var GLYPH_NUMBER_RANGES = [[48,57],[178,179],[185,185],[188,190],[1632,1641],[1776,1785],[1984,1993],[2406,2415],[2534,2543],[2548,2553],[2662,2671],[2790,2799],[2918,2927],[2930,2935],[3046,3058],[3174,3183],[3192,3198],[3302,3311],[3416,3422],[3430,3448],[3558,3567],[3664,3673],[3792,3801],[3872,3891],[4160,4169],[4240,4249],[4969,4988],[5870,5872],[6112,6121],[6128,6137],[6160,6169],[6470,6479],[6608,6618],[6784,6793],[6800,6809],[6992,7001],[7088,7097],[7232,7241],[7248,7257],[8304,8304],[8308,8313],[8320,8329],[8528,8578],[8581,8585],[9312,9371],[9450,9471],[10102,10131],[11517,11517],[12295,12295],[12321,12329],[12344,12346],[12690,12693],[12832,12841],[12872,12879],[12881,12895],[12928,12937],[12977,12991],[42528,42537],[42726,42735],[43056,43061],[43216,43225],[43264,43273],[43472,43481],[43504,43513],[43600,43609],[44016,44025],[65296,65305],[65799,65843],[65856,65912],[65930,65931],[66273,66299],[66336,66339],[66369,66369],[66378,66378],[66513,66517],[66720,66729],[67672,67679],[67705,67711],[67751,67759],[67835,67839],[67862,67867],[68028,68029],[68032,68047],[68050,68095],[68160,68168],[68221,68222],[68253,68255],[68331,68335],[68440,68447],[68472,68479],[68521,68527],[68858,68863],[68912,68921],[68928,68937],[69216,69246],[69405,69414],[69457,69460],[69573,69579],[69714,69743],[69872,69881],[69942,69951],[70096,70105],[70113,70132],[70384,70393],[70736,70745],[70864,70873],[71248,71257],[71360,71369],[71376,71395],[71472,71483],[71904,71922],[72016,72025],[72688,72697],[72784,72812],[73040,73049],[73120,73129],[73184,73193],[73552,73561],[73664,73684],[74752,74862],[90416,90425],[92768,92777],[92864,92873],[93008,93017],[93019,93025],[93552,93561],[93824,93846],[94196,94198],[118000,118009],[119488,119507],[119520,119539],[119648,119672],[120782,120831],[123200,123209],[123632,123641],[124144,124153],[124401,124410],[125127,125135],[125264,125273],[126065,126123],[126125,126127],[126129,126132],[126209,126253],[126255,126269],[127232,127244],[130032,130041]];
  var GLYPH_PUNCTUATION_RANGES = [[33,35],[37,42],[44,47],[58,59],[63,64],[91,93],[95,95],[123,123],[125,125],[161,161],[167,167],[171,171],[182,183],[187,187],[191,191],[894,894],[903,903],[1370,1375],[1417,1418],[1470,1470],[1472,1472],[1475,1475],[1478,1478],[1523,1524],[1545,1546],[1548,1549],[1563,1563],[1565,1567],[1642,1645],[1748,1748],[1792,1805],[2039,2041],[2096,2110],[2142,2142],[2404,2405],[2416,2416],[2557,2557],[2678,2678],[2800,2800],[3191,3191],[3204,3204],[3572,3572],[3663,3663],[3674,3675],[3844,3858],[3860,3860],[3898,3901],[3973,3973],[4048,4052],[4057,4058],[4170,4175],[4347,4347],[4960,4968],[5120,5120],[5742,5742],[5787,5788],[5867,5869],[5941,5942],[6100,6102],[6104,6106],[6144,6154],[6468,6469],[6686,6687],[6816,6822],[6824,6829],[6990,6991],[7002,7008],[7037,7039],[7164,7167],[7227,7231],[7294,7295],[7360,7367],[7379,7379],[8208,8231],[8240,8259],[8261,8273],[8275,8286],[8317,8318],[8333,8334],[8968,8971],[9001,9002],[10088,10101],[10181,10182],[10214,10223],[10627,10648],[10712,10715],[10748,10749],[11513,11516],[11518,11519],[11632,11632],[11776,11822],[11824,11855],[11858,11869],[12289,12291],[12296,12305],[12308,12319],[12336,12336],[12349,12349],[12448,12448],[12539,12539],[42238,42239],[42509,42511],[42611,42611],[42622,42622],[42738,42743],[43124,43127],[43214,43215],[43256,43258],[43260,43260],[43310,43311],[43359,43359],[43457,43469],[43486,43487],[43612,43615],[43742,43743],[43760,43761],[44011,44011],[64830,64831],[65040,65049],[65072,65106],[65108,65121],[65123,65123],[65128,65128],[65130,65131],[65281,65283],[65285,65290],[65292,65295],[65306,65307],[65311,65312],[65339,65341],[65343,65343],[65371,65371],[65373,65373],[65375,65381],[65792,65794],[66463,66463],[66512,66512],[66927,66927],[67671,67671],[67871,67871],[67903,67903],[68176,68184],[68223,68223],[68336,68342],[68409,68415],[68505,68508],[68974,68974],[69293,69293],[69328,69328],[69461,69465],[69510,69513],[69703,69709],[69819,69820],[69822,69825],[69952,69955],[70004,70005],[70085,70088],[70093,70093],[70107,70107],[70109,70111],[70200,70205],[70313,70313],[70612,70613],[70615,70616],[70731,70735],[70746,70747],[70749,70749],[70854,70854],[71105,71127],[71233,71235],[71264,71276],[71353,71353],[71484,71486],[71739,71739],[72004,72006],[72162,72162],[72255,72262],[72346,72348],[72350,72354],[72448,72457],[72673,72673],[72769,72773],[72816,72817],[73463,73464],[73539,73551],[73727,73727],[74864,74868],[77809,77810],[92782,92783],[92917,92917],[92983,92987],[92996,92996],[93549,93551],[93847,93850],[94178,94178],[113823,113823],[121479,121483],[124415,124415],[125278,125279]];
  /* END GENERATED display-width */

  /* Terminal column width (wcwidth convention, spec/tables.json
   * unicode.displayWidth): combining/format/control code points and the
   * conjoining Hangul jungseong/jongseong take no column, the wide table takes
   * two, everything else one. The zero-width classes come from the engine's
   * RegExp like the rest of the runtime's Unicode classification; East Asian
   * Width has no RegExp property, so the wide table is a generated mirror. */
  var ZERO_WIDTH_CHAR = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]$/u;
  var emojiClusterBase;
  var displayWideRanges = null;

  /* Compiled on first use: a \p{Extended_Pictographic} literal would be a
   * parse error for the whole runtime on engines older than the property.
   * Those engines have no Intl.Segmenter either, so they never produce a
   * multi-code-point cluster and the emoji rule has nothing to decide. */
  function startsEmojiCluster(char) {
    if (emojiClusterBase === undefined) {
      try {
        emojiClusterBase = new RegExp("^[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}]$", "u");
      } catch (error) {
        emojiClusterBase = null;
      }
    }
    return emojiClusterBase !== null && emojiClusterBase.test(char);
  }

  function isDisplayWide(code) {
    if (!displayWideRanges) {
      displayWideRanges = DISPLAY_WIDE_RANGES ? DISPLAY_WIDE_RANGES.split(" ").map(function (token) {
        var bounds = token.split("-");
        var first = parseInt(bounds[0], 16);
        return [first, bounds.length > 1 ? parseInt(bounds[1], 16) : first];
      }) : [];
    }
    var low = 0;
    var high = displayWideRanges.length - 1;
    while (low <= high) {
      var mid = (low + high) >> 1;
      if (code < displayWideRanges[mid][0]) {
        high = mid - 1;
      } else if (code > displayWideRanges[mid][1]) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  }

  function codePointColumns(char) {
    var code = char.codePointAt(0);
    if ((code !== 0xAD && ZERO_WIDTH_CHAR.test(char)) ||
        (code >= 0x1160 && code <= 0x11FF) || (code >= 0xD7B0 && code <= 0xD7FF)) {
      return 0;
    }
    return isDisplayWide(code) ? 2 : 1;
  }

  /* Columns one grapheme occupies: the sum of its code points, except that a
   * multi-code-point cluster led by an Extended_Pictographic or a Regional
   * Indicator (ZWJ sequence, modifier, flag, VS16, tag sequence) is one emoji
   * (two columns) unless U+FE0E asks for text presentation. */
  function graphemeColumns(text) {
    var chars = Array.from(text);
    if (chars.length > 1 && text.indexOf("\uFE0E") < 0 && startsEmojiCluster(chars[0])) {
      return 2;
    }
    return chars.reduce(function (sum, char) {
      return sum + codePointColumns(char);
    }, 0);
  }

  function toCompat(jamo) {
    return JAMO_TO_COMPAT[jamo] || jamo;
  }

  function toFullWidth(ch) {
    var code = ch.charCodeAt(0);
    if (code >= 0x21 && code <= 0x7E) {
      return String.fromCharCode(code + 0xFEE0) + ch.slice(1);
    }
    return ch;
  }

  function composePartialSyllable(choIndex, jungIndex) {
    return String.fromCharCode(HANGUL_BASE + choIndex * 21 * 28 + jungIndex * 28);
  }

  /* A non-Hangul cell spans as many fullwidth (two-column) cells as its
   * grapheme needs, at least one. An odd width is padded with ASCII spaces on
   * the top row, so both rows of every cell have the same column width. */
  function renderPlainGlyphTextMode(glyph) {
    var top = toFullWidth(glyph.source);
    var columns = graphemeColumns(top);
    var cells = Math.max(1, Math.ceil(columns / 2));
    return {
      top: top + " ".repeat(cells * 2 - columns),
      bottom: FW_SP.repeat(cells)
    };
  }

  function renderGlyphTextMode(glyph) {
    if (glyph.kind !== "hangul") {
      return renderPlainGlyphTextMode(glyph);
    }

    var syllableIndex = glyph.source.charCodeAt(0) - HANGUL_BASE;
    var choIndex = Math.floor(syllableIndex / (21 * 28));
    var jungIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
    var jungLayout = glyph.topology.jungLayout;
    var jongLayout = glyph.topology.jongLayout;
    var cho = glyph.sourceJamo.choseong;
    var jung = glyph.sourceJamo.jungseong;
    var jong = glyph.sourceJamo.jongseong;
    var top, bottom;

    if (jungLayout === "right") {
      top = toCompat(cho) + toCompat(jung);
      if (jongLayout === "none") {
        bottom = FW_SP + FW_SP;
      } else if (jongLayout === "single") {
        bottom = FW_SP + toCompat(jong);
      } else {
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    } else if (jungLayout === "bottom") {
      if (jongLayout === "none") {
        top = toCompat(cho);
        bottom = toCompat(jung);
      } else if (jongLayout === "single") {
        var partial = composePartialSyllable(choIndex, jungIndex);
        top = partial;
        bottom = toCompat(jong);
      } else {
        var partial = composePartialSyllable(choIndex, jungIndex);
        top = partial + FW_SP;
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    } else {
      var split = HANGUL_TABLES.splitJungseong[jung];
      var baseJungIndex = HANGUL_TABLES.jungseong.indexOf(split.parts[0]);
      var partial = composePartialSyllable(choIndex, baseJungIndex);
      top = partial + toCompat(split.parts[1]);
      if (jongLayout === "none") {
        bottom = FW_SP + FW_SP;
      } else if (jongLayout === "single") {
        bottom = FW_SP + toCompat(jong);
      } else {
        var dj = HANGUL_TABLES.doubleJongseong[jong];
        bottom = toCompat(dj.parts[0]) + toCompat(dj.parts[1]);
      }
    }

    return { top: top, bottom: bottom };
  }

  function renderLineTextMode(line) {
    var topParts = [];
    var bottomParts = [];

    line.children.forEach(function (child, childIndex) {
      if (child.type === "word") {
        if (childIndex > 0 && line.children[childIndex - 1].type !== "space") {
          topParts.push(FW_SP);
          bottomParts.push(FW_SP);
        }
        child.children.forEach(function (glyph, glyphIndex) {
          if (glyphIndex > 0) {
            topParts.push(FW_SP);
            bottomParts.push(FW_SP);
          }
          var rendered = renderGlyphTextMode(glyph);
          topParts.push(rendered.top);
          bottomParts.push(rendered.bottom);
        });
      } else if (child.type === "space") {
        for (var spaceIndex = 0; spaceIndex < child.count; spaceIndex += 1) {
          topParts.push(FW_SP);
          bottomParts.push(FW_SP);
        }
      }
    });

    return { top: topParts.join(""), bottom: bottomParts.join("") };
  }

  /* Text mode draws on a fixed two-cell grid and rebuilds the cluster split
   * from sourceJamo, so it is atomic by construction. Depth is deliberately not
   * an option here: accepting one that changes nothing would be a trap. */
  function renderText(text) {
    var model = buildTextModel(text);
    var output = [];

    model.lines.forEach(function (line) {
      var pair = renderLineTextMode(line);
      output.push(pair.top);
      output.push(pair.bottom);
    });

    return output;
  }

  // ── Seed helpers ───────────────────────────────────────────

  function hashSeed(value) {
    var str = String(value == null ? "" : value);
    var h = 2166136261;
    for (var i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000000) / 1000000;
  }

  /* The resolved seed of the host a jamo node belongs to ("" without one). */
  function hostSeedOf(node, target) {
    var host = typeof node.closest === "function" ? node.closest('[data-fy-upgraded="true"]') : null;
    if (!host && isElementNode(target) && target.dataset && target.dataset.fyUpgraded === "true") {
      host = target;
    }
    return host && host.dataset.fySeed !== undefined ? host.dataset.fySeed : "";
  }

  /* Per-jamo seed: hash of jamo | role | index | salt, plus "| host seed"
   * when the host has a resolved seed. Hosts with different seeds therefore
   * get different jamo seeds; a host without a seed keeps the historical
   * key, so its values are unchanged. */
  function applyJamoSeeds(target, options) {
    var type = target && target.nodeType;
    if (!(type === 1 || type === 9 || type === 11) || typeof target.querySelectorAll !== "function") {
      return 0;
    }
    var opts = options || {};
    var property = opts.property || "--fy-jamo-seed";
    var hashFn = typeof opts.hash === "function" ? opts.hash : hashSeed;
    var saltRaw = opts.salt == null ? "" : String(opts.salt);
    var nodes = target.querySelectorAll("[data-jamo]");
    Array.prototype.forEach.call(nodes, function (node, index) {
      var seed = hostSeedOf(node, target);
      var key = node.dataset.jamo + "|" + (node.dataset.jamoRole || "") + "|" + index + "|" + saltRaw +
        (seed ? "|" + seed : "");
      node.style.setProperty(property, String(hashFn(key)));
    });
    return nodes.length;
  }

  // ── Vector jamo (ADR-013) ──────────────────────────────────

  /* A jamo set draws each jamo as an inline SVG instead of a sheet cell. It is
   * registered in code (FontKku.registerJamo, or a module pushed onto
   * globalThis.FontKkuJamo before the runtime loads) and picked per host with
   * jamo-set="<name>" (data-jamo-set on a decorator). It works on fonts with a
   * sprite layout: the font's CSS still places every node and chooses its
   * --fy-sprite-row; the set supplies the drawing of each cell "r<row>-<jamo>"
   * in a 0–100 cell. Shapes are path data or ellipses, built with
   * createElementNS — a set never injects markup. */
  /* BEGIN GENERATED hoek: scripts/build_jamo_svg.js --write from spec/strokes.json (ADR-018).
   * 자모마다 획순대로 "종류 들여온-글자 속한-자모 역할"을 쉼표로 잇는다. */
  var HOEK_TABLE = {
    "ㄱ": "hv ㄱ ㄱ base",
    "ㄲ": "hv ㄱ ㄱ base,hv ㄱ ㄱ base",
    "ㄳ": "hv ㄱ ㄱ base,lf ㅅ ㅅ base,rf ㅅ ㅅ base",
    "ㄴ": "vh ㄴ ㄴ base",
    "ㄵ": "vh ㄴ ㄴ base,h ㅈ ㅈ added,lf ㅅ ㅈ base,rf ㅅ ㅈ base",
    "ㄶ": "vh ㄴ ㄴ base,dot ㅎ ㅎ added,h ㆆ ㅎ added,ring ㅇ ㅎ base",
    "ㄷ": "h ㄷ ㄷ added,vh ㄴ ㄷ base",
    "ㄸ": "h ㄷ ㄷ added,vh ㄴ ㄷ base,h ㄷ ㄷ added,vh ㄴ ㄷ base",
    "ㄹ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant",
    "ㄺ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,hv ㄱ ㄱ base",
    "ㄻ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,v ㅁ ㅁ base,hv ㅁ ㅁ base,h ㅁ ㅁ base",
    "ㄼ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,v ㅂ ㅂ added,v ㅂ ㅂ added,h ㅂ ㅂ added,h ㅂ ㅂ added",
    "ㄽ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,lf ㅅ ㅅ base,rf ㅅ ㅅ base",
    "ㄾ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,h ㄷ ㅌ added,h ㅌ ㅌ added,vh ㄴ ㅌ base",
    "ㄿ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,h ㅍ ㅍ added,v ㅍ ㅍ added,v ㅍ ㅍ added,h ㅍ ㅍ added",
    "ㅀ": "hv ㄹ ㄹ variant,h ㄹ ㄹ variant,vh ㄹ ㄹ variant,dot ㅎ ㅎ added,h ㆆ ㅎ added,ring ㅇ ㅎ base",
    "ㅁ": "v ㅁ ㅁ base,hv ㅁ ㅁ base,h ㅁ ㅁ base",
    "ㅂ": "v ㅂ ㅂ added,v ㅂ ㅂ added,h ㅂ ㅂ added,h ㅂ ㅂ added",
    "ㅃ": "v ㅂ ㅂ added,v ㅂ ㅂ added,h ㅂ ㅂ added,h ㅂ ㅂ added,v ㅂ ㅂ added,v ㅂ ㅂ added,h ㅂ ㅂ added,h ㅂ ㅂ added",
    "ㅄ": "v ㅂ ㅂ added,v ㅂ ㅂ added,h ㅂ ㅂ added,h ㅂ ㅂ added,lf ㅅ ㅅ base,rf ㅅ ㅅ base",
    "ㅅ": "lf ㅅ ㅅ base,rf ㅅ ㅅ base",
    "ㅆ": "lf ㅅ ㅅ base,rf ㅅ ㅅ base,lf ㅅ ㅅ base,rf ㅅ ㅅ base",
    "ㅇ": "ring ㅇ ㅇ base",
    "ㅈ": "h ㅈ ㅈ added,lf ㅅ ㅈ base,rf ㅅ ㅈ base",
    "ㅉ": "h ㅈ ㅈ added,lf ㅅ ㅈ base,rf ㅅ ㅈ base,h ㅈ ㅈ added,lf ㅅ ㅈ base,rf ㅅ ㅈ base",
    "ㅊ": "dot ㅊ ㅊ added,h ㅈ ㅊ added,lf ㅅ ㅊ base,rf ㅅ ㅊ base",
    "ㅋ": "hv ㄱ ㅋ base,h ㅋ ㅋ added",
    "ㅌ": "h ㄷ ㅌ added,h ㅌ ㅌ added,vh ㄴ ㅌ base",
    "ㅍ": "h ㅍ ㅍ added,v ㅍ ㅍ added,v ㅍ ㅍ added,h ㅍ ㅍ added",
    "ㅎ": "dot ㅎ ㅎ added,h ㆆ ㅎ added,ring ㅇ ㅎ base",
    "ㅏ": "v ㅣ ㅏ person,dot · ㅏ heaven",
    "ㅐ": "v ㅣ ㅏ person,dot · ㅏ heaven,v ㅣ ㅣ person",
    "ㅑ": "v ㅣ ㅑ person,dot · ㅑ heaven,dot · ㅑ heaven",
    "ㅒ": "v ㅣ ㅑ person,dot · ㅑ heaven,dot · ㅑ heaven,v ㅣ ㅣ person",
    "ㅓ": "dot · ㅓ heaven,v ㅣ ㅓ person",
    "ㅔ": "dot · ㅓ heaven,v ㅣ ㅓ person,v ㅣ ㅣ person",
    "ㅕ": "dot · ㅕ heaven,dot · ㅕ heaven,v ㅣ ㅕ person",
    "ㅖ": "dot · ㅕ heaven,dot · ㅕ heaven,v ㅣ ㅕ person,v ㅣ ㅣ person",
    "ㅗ": "dot · ㅗ heaven,h ㅡ ㅗ earth",
    "ㅘ": "dot · ㅗ heaven,h ㅡ ㅗ earth,v ㅣ ㅏ person,dot · ㅏ heaven",
    "ㅙ": "dot · ㅗ heaven,h ㅡ ㅗ earth,v ㅣ ㅏ person,dot · ㅏ heaven,v ㅣ ㅣ person",
    "ㅚ": "dot · ㅗ heaven,h ㅡ ㅗ earth,v ㅣ ㅣ person",
    "ㅛ": "dot · ㅛ heaven,dot · ㅛ heaven,h ㅡ ㅛ earth",
    "ㅜ": "h ㅡ ㅜ earth,dot · ㅜ heaven",
    "ㅝ": "h ㅡ ㅜ earth,dot · ㅜ heaven,dot · ㅓ heaven,v ㅣ ㅓ person",
    "ㅞ": "h ㅡ ㅜ earth,dot · ㅜ heaven,dot · ㅓ heaven,v ㅣ ㅓ person,v ㅣ ㅣ person",
    "ㅟ": "h ㅡ ㅜ earth,dot · ㅜ heaven,v ㅣ ㅣ person",
    "ㅠ": "h ㅡ ㅠ earth,dot · ㅠ heaven,dot · ㅠ heaven",
    "ㅡ": "h ㅡ ㅡ earth",
    "ㅢ": "h ㅡ ㅡ earth,v ㅣ ㅣ person",
    "ㅣ": "v ㅣ ㅣ person"
  };
  /* END GENERATED hoek */

  /* Stroke depth (ADR-018): "jamo" (default) keeps a jamo whole; "stroke"
   * names every stroke of a vector jamo — part="hoek" with its order
   * (data-hoek, --fy-hoek-index within the jamo, --fy-hoek-order across the
   * host in reading order) and, for sets drawn in the stroke order of
   * spec/strokes.json (option hoek: true), its kind, source letter, owning
   * jamo and role. Device fonts and sheets cannot split a jamo, so they keep
   * "jamo" and report it. */
  var STROKE_DEPTHS = { jamo: true, stroke: true };
  var HOEK_ROWS = Object.create(null);

  function normalizeStrokeDepth(value) {
    if (isBlank(value)) {
      return null;
    }
    var depth = String(value).trim().toLowerCase();
    return STROKE_DEPTHS[depth] ? depth : null;
  }

  function hoekRow(jamo) {
    if (!HOEK_ROWS[jamo] && HOEK_TABLE[jamo]) {
      HOEK_ROWS[jamo] = HOEK_TABLE[jamo].split(",").map(function (stroke) {
        return stroke.split(" ");
      });
    }
    return HOEK_ROWS[jamo] || null;
  }

  var JAMO_SETS = Object.create(null);
  var JAMO_SET_NAME = /^[a-z0-9][a-z0-9-]*$/;
  var JAMO_CELL_KEY = /^r([0-9])-([\u3131-\u318e])$/;
  /* 칸 계약(ADR-024): 호환 자모(문맥 변형 @cho·@bar·@jong·@solo — @solo는 낱자) 또는 원소 그림 @line·@dot·@ring */
  var JAMO_BOX_KEY = /^(?:[\u3131-\u318e](?:@(?:cho|bar|jong|solo))?|@(?:line|dot|ring))$/;
  var JAMO_PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
  var VECTOR_CAPS = { butt: true, round: true, square: true };
  var VECTOR_JOINS = { miter: true, round: true, bevel: true };
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEFAULT_VECTOR_STROKE = 7.2;

  function normalizeJamoSetName(value) {
    if (isBlank(value)) {
      return null;
    }
    var name = String(value).trim().toLowerCase();
    return JAMO_SET_NAME.test(name) ? name : null;
  }

  /* 경로 문법 — 브라우저가 <path d>를 읽는 규칙(SVG 2 경로 문법, Chromium 파서의 쉼표 처리): M/m으로 시작하고, 명령마다 인자 수
   * (M·L·T 2, H·V 1, S·Q 4, C 6, A 7 — 호 깃발 둘은 0/1 한 글자, Z 0)의 묶음이 하나 이상 온다. 명령 없이 이어진 묶음은 앞 명령을
   * 되풀이한다(M 뒤는 L). 숫자 뒤에만 쉼표 하나. 틀린 경로를 등록하면 그릴 때 콘솔 오류가 나고 그 자모가 빈다 — 등록에서 막는다 */
  var PATH_ARITY = { m: 2, l: 2, t: 2, h: 1, v: 1, s: 4, q: 4, c: 6, a: 7, z: 0 };
  var PATH_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
  var PATH_SPACE = /[ \t\n\r\f]/;

  function pathDataProblem(d) {
    var at = 0;
    var command = "";
    function spaces() {
      while (at < d.length && PATH_SPACE.test(d.charAt(at))) {
        at += 1;
      }
    }
    function separator() {
      spaces();
      if (d.charAt(at) === ",") {
        at += 1;
        spaces();
      }
    }
    function group(name) {
      for (var index = 0; index < PATH_ARITY[name]; index += 1) {
        if (name === "a" && (index === 3 || index === 4)) {
          if (d.charAt(at) !== "0" && d.charAt(at) !== "1") {
            return false;
          }
          at += 1;
        } else {
          var match = PATH_NUMBER.exec(d.slice(at));
          if (!match) {
            return false;
          }
          at += match[0].length;
        }
        separator();
      }
      return true;
    }
    spaces();
    if (!/^[Mm]$/.test(d.charAt(at))) {
      return "it must start with M or m";
    }
    while (at < d.length) {
      var char = d.charAt(at);
      var name = char.toLowerCase();
      if (/[A-Za-z]/.test(char)) {
        if (!Object.prototype.hasOwnProperty.call(PATH_ARITY, name)) {
          return "\"" + char + "\" is not a path command at " + at;
        }
        command = char;
        at += 1;
        spaces();
        if (name !== "z" && !group(name)) {
          return "\"" + char + "\" needs " + PATH_ARITY[name] + (name === "a" ? " values (flags 0 or 1)" : " numbers") +
            " at " + at;
        }
      } else {
        var repeat = command.toLowerCase();
        if (!repeat || repeat === "z") {
          return "a number without a command at " + at;
        }
        if (!group(repeat === "m" ? "l" : repeat)) {
          return "an incomplete \"" + command + "\" at " + at;
        }
      }
    }
    return null;
  }

  function normalizeJamoShape(shape, where) {
    var item = typeof shape === "string" ? { d: shape } : shape;
    if (!item || typeof item !== "object") {
      throw new TypeError("font-kku: " + where + " must be path data or { d } / { ellipse }");
    }
    var fill = item.fill === true;
    if (typeof item.d === "string") {
      var d = item.d.trim();
      if (!d || !JAMO_PATH_DATA.test(d)) {
        throw new TypeError("font-kku: " + where + " path data may only hold SVG path commands and numbers");
      }
      var problem = pathDataProblem(d);
      if (problem) {
        throw new TypeError("font-kku: " + where + " path data is not valid SVG path syntax — " + problem +
          " (" + JSON.stringify(d.length > 40 ? d.slice(0, 40) + "…" : d) + ")");
      }
      return { type: "path", d: d, fill: fill };
    }
    if (Array.isArray(item.ellipse) && item.ellipse.length === 4) {
      var values = item.ellipse.map(Number);
      if (!values.every(function (value) { return isFinite(value); }) || values[2] < 0 || values[3] < 0) {
        throw new TypeError("font-kku: " + where + " ellipse is [cx, cy, rx, ry] with finite numbers");
      }
      return { type: "ellipse", values: values, fill: fill };
    }
    throw new TypeError("font-kku: " + where + " must be path data or { d } / { ellipse: [cx, cy, rx, ry] }");
  }

  /* registerJamo(name, cells, options) — cells maps "r<row>-<호환 자모>" (e.g.
   * "r0-ㄱ") to one shape or a list: "M5 12 H45 V28" (a stroked centerline),
   * { d, fill: true } (a filled outline) or { ellipse: [cx, cy, rx, ry] }.
   * options: stroke (width in cell units, default 7.2; 0 for fill-only sets),
   * cap (butt|round|square), join (miter|round|bevel), hoek (true when every
   * cell lists its strokes in the order of spec/strokes.json — stroke depth
   * then names each stroke). Re-registering a name
   * replaces it; hosts using it re-render. Returns { name, cells }. */
  function registerJamo(name, cells, options) {
    var setName = normalizeJamoSetName(name);
    if (!setName) {
      throw new TypeError("font-kku: a jamo set name is lowercase letters, digits and '-' (got " + JSON.stringify(name) + ")");
    }
    if (!cells || typeof cells !== "object" || Array.isArray(cells)) {
      throw new TypeError("font-kku: registerJamo(\"" + setName + "\") needs a cell map like { \"r0-ㄱ\": \"M5 12 H45 V28\" }");
    }
    var opts = options || {};
    var stroke = opts.stroke === undefined || opts.stroke === null ? DEFAULT_VECTOR_STROKE : Number(opts.stroke);
    if (!isFinite(stroke) || stroke < 0) {
      throw new TypeError("font-kku: jamo set stroke is a width in cell units (0–100)");
    }
    var cap = opts.cap === undefined ? "butt" : String(opts.cap);
    var join = opts.join === undefined ? "miter" : String(opts.join);
    if (!VECTOR_CAPS[cap] || !VECTOR_JOINS[join]) {
      throw new TypeError("font-kku: jamo set cap is butt|round|square and join is miter|round|bevel");
    }
    var frame = opts.frame === "box" ? "box" : "sprite";
    var box = Array.isArray(opts.box) && opts.box.length === 4 ? opts.box.map(Number) : [0, 0, 100, 100];
    if (!box.every(function (value) { return isFinite(value); }) || box[2] <= box[0] || box[3] <= box[1]) {
      throw new TypeError("font-kku: jamo set box is [x0, y0, x1, y1] with x1 > x0 and y1 > y0");
    }
    var map = Object.create(null);
    var cellBoxes = Object.create(null);
    var count = 0;
    Object.keys(cells).forEach(function (key) {
      if (frame === "box") {
        if (!JAMO_BOX_KEY.test(key)) {
          throw new TypeError("font-kku: box jamo cell \"" + key + "\" must be a compatibility jamo (ㄱ, ㄱ@cho, ㄱ@bar, ㄱ@jong) or @line, @dot, @ring");
        }
      } else {
        var match = JAMO_CELL_KEY.exec(key);
        if (!match || !resolveSpriteJamo(match[2])) {
          throw new TypeError("font-kku: jamo cell \"" + key + "\" must be r<row>-<compatibility jamo>, e.g. r0-ㄱ");
        }
      }
      var value = cells[key];
      /* 칸 계약 세트는 칸마다 그림 범위를 따로 밝힐 수 있다: { box: [x0, y0, x1, y1], shapes: [...] } */
      if (frame === "box" && value && !Array.isArray(value) && Array.isArray(value.shapes)) {
        var own = Array.isArray(value.box) && value.box.length === 4 ? value.box.map(Number) : null;
        if (!own || !own.every(function (n) { return isFinite(n); }) || own[2] <= own[0] || own[3] <= own[1]) {
          throw new TypeError("font-kku: box jamo cell " + key + " box is [x0, y0, x1, y1] with x1 > x0 and y1 > y0");
        }
        cellBoxes[key] = own;
        value = value.shapes;
      }
      map[key] = (Array.isArray(value) ? value : [value]).map(function (shape, index) {
        return normalizeJamoShape(shape, key + "[" + index + "]");
      });
      if (!map[key].length) {
        throw new TypeError("font-kku: jamo cell " + key + " needs at least one shape");
      }
      count += 1;
    });
    if (!count) {
      throw new TypeError("font-kku: a jamo set needs at least one cell");
    }
    JAMO_SETS[setName] = {
      name: setName,
      frame: frame,
      box: box,
      cellBoxes: cellBoxes,
      stroke: stroke,
      cap: cap,
      join: join,
      hoek: opts.hoek === true,
      cells: map,
      templates: typeof WeakMap === "function" ? new WeakMap() : null
    };
    rerenderJamoSetHosts(setName);
    return { name: setName, cells: count };
  }

  function jamoSets() {
    return Object.keys(JAMO_SETS);
  }

  function vectorSetFor(options) {
    if (!options || !options.jamoSet || !options.fontMeta || options.fontMeta.material !== "sprite") {
      return null;
    }
    return JAMO_SETS[options.jamoSet] || null;
  }

  /* A set registered after its hosts rendered (a module that loads later)
   * re-renders them like a style change: attributes re-read, seed kept. */
  function designUsesSet(design, setName) {
    return Boolean(design) && Object.keys(design.sources).some(function (id) {
      return design.sources[id].kind === "svg" && design.sources[id].set === setName;
    });
  }

  function rerenderJamoSetHosts(setName) {
    var jobs = [];
    forEachRegistered(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected && (state.options.jamoSet === setName || designUsesSet(appliedDesign(state.options.fontMeta), setName))) {
        jobs.push(createRenderJob(host, undefined, "restyle", { keepSeed: true }));
      }
    });
    if (jobs.length) {
      runRenderJobs(jobs);
    }
  }

  function vectorCell(set, key, doc, hoek) {
    var shapes = set.cells[key];
    if (!shapes || !doc || typeof doc.createElementNS !== "function") {
      return null;
    }
    var cache = set.templates ? set.templates.get(doc) : null;
    if (!cache) {
      cache = Object.create(null);
      if (set.templates) {
        set.templates.set(doc, cache);
      }
    }
    var cacheKey = hoek ? key + "|hoek" : key;
    /* The stroke table names a cell's strokes only when the set follows the
     * stroke order and the cell has exactly that many shapes. */
    var strokes = hoek && set.hoek ? hoekRow(key.slice(key.indexOf("-") + 1)) : null;
    if (strokes && strokes.length !== shapes.length) {
      strokes = null;
    }
    if (!cache[cacheKey]) {
      var svg = doc.createElementNS(SVG_NS, "svg");
      svg.setAttribute("part", "vector");
      svg.setAttribute("viewBox", "0 0 100 100");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      svg.setAttribute("data-cell", key);
      /* Presentation attributes: page CSS (stroke-linecap …) still wins. */
      svg.setAttribute("stroke-linecap", set.cap);
      svg.setAttribute("stroke-linejoin", set.join);
      if (svg.style && typeof svg.style.setProperty === "function") {
        svg.style.setProperty("--fy-vector-stroke-cells", String(set.stroke));
      }
      shapes.forEach(function (shape, index) {
        var element;
        if (shape.type === "path") {
          element = doc.createElementNS(SVG_NS, "path");
          element.setAttribute("d", shape.d);
        } else {
          element = doc.createElementNS(SVG_NS, "ellipse");
          ["cx", "cy", "rx", "ry"].forEach(function (attribute, index) {
            element.setAttribute(attribute, String(shape.values[index]));
          });
        }
        if (shape.fill) {
          element.setAttribute("data-fill", "");
        }
        if (hoek) {
          /* pathLength 1: a dash of 1 is the whole stroke (draw motion). */
          element.setAttribute("part", "hoek");
          element.setAttribute("data-hoek", String(index + 1));
          element.setAttribute("pathLength", "1");
          if (strokes) {
            element.setAttribute("data-hoek-kind", strokes[index][0]);
            element.setAttribute("data-hoek-from", strokes[index][1]);
            element.setAttribute("data-hoek-letter", strokes[index][2]);
            element.setAttribute("data-hoek-role", strokes[index][3]);
          }
          if (element.style && typeof element.style.setProperty === "function") {
            element.style.setProperty("--fy-hoek-index", String(index));
          }
        }
        svg.appendChild(element);
      });
      cache[cacheKey] = svg;
    }
    return cache[cacheKey].cloneNode(true);
  }

  /* After a batch is committed: read every vector node's row (one style
   * recalculation for the batch), then append the cell drawings. The row is
   * the font's --fy-sprite-row, so contexts that switch rows (bottom-vowel
   * initials, codas, clusters) draw the same cell the sheet would. */
  function paintVectorJamo(hosts) {
    var work = [];
    var changed = [];
    var hoekHosts = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var set = state ? vectorSetFor(state.options) : null;
      if (!set || !host.isConnected) {
        return;
      }
      var root = getManagedRoot(host);
      if (!root || typeof root.querySelectorAll !== "function") {
        return;
      }
      var kinds = String(state.options.fontMeta.spriteKinds || "").split(/\s+/);
      var hoek = host.dataset.fyStrokeDepth === "stroke";
      var nodes = root.querySelectorAll("[data-sprite-jamo-kind]");
      for (var i = 0; i < nodes.length; i += 1) {
        if (kinds.indexOf(nodes[i].dataset.spriteJamoKind) >= 0) {
          work.push({ node: nodes[i], host: host, set: set, doc: host.ownerDocument, key: null, hoek: hoek });
        }
      }
      if (hoek) {
        hoekHosts.push(root);
      }
    });
    work.forEach(function (item) {
      var style = computedStyleFor(item.node);
      var row = style ? parseInt(style.getPropertyValue("--fy-sprite-row"), 10) : 0;
      item.key = "r" + (isNaN(row) ? 0 : row) + "-" + item.node.dataset.spriteJamo;
    });
    work.forEach(function (item) {
      var previous = item.node.querySelector('[part="vector"]');
      if (previous && previous.getAttribute("data-cell") === item.key) {
        return;
      }
      var svg = vectorCell(item.set, item.key, item.doc, item.hoek);
      if (previous) { item.node.removeChild(previous); }
      if (svg) {
        item.node.appendChild(svg);
        item.node.dataset.fyVectorCell = item.key;
      } else {
        delete item.node.dataset.fyVectorCell;
      }
      if ((previous || svg) && changed.indexOf(item.host) < 0) { changed.push(item.host); }
    });
    /* Reading order across the host: glyphs in order, and in a glyph the
     * jamo nodes as built (initial → vowel → coda), each in stroke order. */
    hoekHosts.forEach(function (root) {
      var strokes = root.querySelectorAll('[part="hoek"]');
      for (var i = 0; i < strokes.length; i += 1) {
        if (strokes[i].style && typeof strokes[i].style.setProperty === "function") {
          strokes[i].style.setProperty("--fy-hoek-order", String(i));
        }
      }
    });
    return changed;
  }

  /* Modules may load before the runtime: they push [name, cells, options]
   * onto globalThis.FontKkuJamo. Drain the queue, then make later pushes
   * register directly. */
  function drainJamoQueue(scope) {
    var queue = scope.FontKkuJamo;
    var pending = Array.isArray(queue) ? queue.slice() : [];
    scope.FontKkuJamo = {
      push: function () {
        Array.prototype.forEach.call(arguments, function (entry) {
          registerQueuedJamo(scope, entry);
        });
        return 0;
      }
    };
    pending.forEach(function (entry) {
      registerQueuedJamo(scope, entry);
    });
  }

  /* The global runtime is the canonical one (a second copy reuses it), so a
   * queued set goes to whichever instance window.FontKku is now. */
  function registerQueuedJamo(scope, entry) {
    var api = scope.FontKku && typeof scope.FontKku.registerJamo === "function" ? scope.FontKku : FontKku;
    try {
      api.registerJamo(entry[0], entry[1], entry[2]);
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn(error.message);
      }
    }
  }

  // ── Device Hangul font probe ───────────────────────────────

  /* Can this browser draw Hangul with a device font? System-material fonts
   * (sebul, gothic and their derived fonts) draw every jamo node with the
   * device's Hangul font, so on a device without one they show tofu; sprite
   * fonts paint their sheet and keep working. The probe compares the glyph
   * box (canvas measureText) of a syllable and of a conjoining jamo with the
   * box of an unassigned code point nearby: a missing glyph is drawn as the
   * same notdef/tofu box (or a same-sized hex box) as the unassigned one, a
   * real glyph is not. Text metrics only — no pixel readback. Returns true or
   * false, or null when it cannot tell (no DOM/canvas, e.g. Node, or an engine
   * without actualBoundingBox metrics). Never runs on its own; the answer is
   * cached per font-family string. */
  var HANGUL_FONT_PROBES = [["가", "힤"], ["ᄀ", "͸"]];
  var DEFAULT_PROBE_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
  var HANGUL_FONT_CACHE = {};

  function measureGlyphBox(context, char) {
    var metrics = context.measureText(char);
    if (!metrics || typeof metrics.actualBoundingBoxAscent !== "number") {
      return null;
    }
    return [
      metrics.width,
      metrics.actualBoundingBoxLeft,
      metrics.actualBoundingBoxRight,
      metrics.actualBoundingBoxAscent,
      metrics.actualBoundingBoxDescent
    ].map(function (value) {
      return Math.round(value * 10);
    }).join(",");
  }

  function probeHangulFont(family, doc) {
    var context = null;
    try {
      var canvas = doc.createElement("canvas");
      context = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    } catch (error) {
      context = null;
    }
    if (!context || typeof context.measureText !== "function") {
      return null;
    }
    context.font = "64px " + family;
    for (var i = 0; i < HANGUL_FONT_PROBES.length; i += 1) {
      var glyph = measureGlyphBox(context, HANGUL_FONT_PROBES[i][0]);
      var missing = measureGlyphBox(context, HANGUL_FONT_PROBES[i][1]);
      if (glyph === null || missing === null) {
        return null;
      }
      if (glyph === missing) {
        return false;
      }
    }
    return true;
  }

  function hasHangulFont(options) {
    var opts = options || {};
    var family = opts.fontFamily ? String(opts.fontFamily) : DEFAULT_PROBE_FAMILY;
    var doc = opts.document || (typeof document !== "undefined" ? document : null);
    if (!doc || typeof doc.createElement !== "function") {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(HANGUL_FONT_CACHE, family) && !opts.document) {
      return HANGUL_FONT_CACHE[family];
    }
    var result = probeHangulFont(family, doc);
    if (result !== null && !opts.document) {
      HANGUL_FONT_CACHE[family] = result;
    }
    return result;
  }

  // ── Public API ─────────────────────────────────────────────

  var FontKku = {
    version: VERSION,
    placementTable: PUBLIC_PLACEMENT_TABLE,
    placementTables: PUBLIC_PLACEMENT_TABLES,
    layoutProfiles: PUBLIC_LAYOUT_PROFILES,
    layoutStability: layoutStability,
    define: define,
    bootstrap: bootstrap,
    render: render,
    refresh: refresh,
    refreshAll: refreshAll,
    retryFont: retryFont,
    loadFont: loadFont,
    fontInfo: fontInfo,
    upgrade: upgrade,
    upgradeAll: upgradeAll,
    decomposeGlyph: decomposeGlyph,
    createTextModel: createTextModel,
    isHangulSyllable: isHangulSyllable,
    renderText: renderText,
    hashSeed: hashSeed,
    applyJamoSeeds: applyJamoSeeds,
    hasHangulFont: hasHangulFont,
    registerJamo: registerJamo,
    registerDesign: registerDesign,
    validateDesign: validateDesign,
    unregisterDesign: unregisterDesign,
    designs: designs,
    planJamo: planJamo,
    traceOf: traceOf,
    stagePreview: stagePreview,
    authoringProgress: authoringProgress,
    jamoSets: jamoSets,
    sourceRange: sourceRange
  };

  global.FontKku = FontKku;
  drainJamoQueue(global);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKku;
  }

  // ── Script-tag loader ──────────────────────────────────────

  /* 한 줄 설치: `<script src=".../font-kku.js" data-fonts="sebul neon">`.
   * data-fonts 속성이 있는 classic script로 로드되면 스크립트 URL 기준으로 base CSS
   * (font-kku.css)와 나열한 폰트(profiles/<name>.css)를 loadFont로 붙인다. 이름은
   * 공백·쉼표로 나누고 host의 font 속성과 같은 규칙으로 정규화한다(alias →
   * canonical). 빈 값이면 base CSS만 붙인다. 같은 URL의 link가 이미 있으면 loadFont가
   * 재사용한다. CSS가 모두 도착(또는 실패)할 때까지 관리 root를 visibility로 가려
   * 조립 전 자모가 보이지 않게 하고, 늦어도 SCRIPT_LOADER_REVEAL_MS 뒤에는 드러낸다.
   * ESM import에는 currentScript가 없어 동작하지 않는다 — 번들러는 CSS를 import한다.
   * data-addons="looks motion fx"는 같은 자리의 확장(ADR-017)을 함께 붙인다 — 꾸밈·변주
   * 클래스(font-kku-looks.css), 자모 움직임(font-kku-motion.css), 상호작용(font-kku-fx.js).
   * data-fonts 없이 data-addons나 data-jamo-sets만 있어도 base CSS와 확장·세트 모듈을 붙이고 필요할 때 받기를 켠다
   * (<link>로 CSS를 붙인 페이지도 data-jamo-sets로 세트를 받는다). */
  var SCRIPT_LOADER_REVEAL_MS = 3000;
  var SCRIPT_LOADER_ADDONS = {
    looks: { css: "font-kku-looks.css" },
    motion: { css: "font-kku-motion.css" },
    fx: { js: "font-kku-fx.js" }
  };
  var SCRIPT_LOADER_FONT_NAME = /^[a-z0-9][a-z0-9-]*$/;

  function scriptLoaderFonts(value) {
    var names = [];
    String(value).split(/[\s,]+/).forEach(function (raw) {
      if (!foldFontName(raw)) {
        return;
      }
      var name = normalizeFontName(raw);
      if (SCRIPT_LOADER_FONT_NAME.test(name) && names.indexOf(name) === -1) {
        names.push(name);
      }
    });
    return names;
  }

  /* data-addons 이름 → 붙일 확장. 대소문자를 접고 중복·모르는 이름은 버린다(모르는 이름은 경고). */
  function scriptLoaderAddons(value) {
    var names = [];
    String(value).split(/[\s,]+/).forEach(function (raw) {
      var name = raw.trim().toLowerCase();
      if (!name || names.indexOf(name) !== -1) {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(SCRIPT_LOADER_ADDONS, name)) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("font-kku: unknown addon \"" + name + "\" (looks, motion, fx)");
        }
        return;
      }
      names.push(name);
    });
    return names;
  }

  /* 한 줄 설치 속성 — 셋 가운데 하나라도 있으면 로더가 돈다(data-jamo-sets만 있어도 기본 CSS와 세트 모듈) */
  function scriptLoaderRequested(script) {
    return Boolean(script) && typeof script.getAttribute === "function" && Boolean(script.src) &&
      (script.getAttribute("data-fonts") !== null || script.getAttribute("data-addons") !== null ||
        script.getAttribute("data-jamo-sets") !== null);
  }

  /* CDN 짧은 주소(`/npm/@tty.link/font-kku@0.1.3`, `unpkg.com/@tty.link/font-kku`)는 파일 이름이 없다 —
   * 패키지 디렉터리로 보고 그 아래에서 푼다. */
  function scriptLoaderBase(src) {
    var base = new URL(src);
    if (!/\.[cm]?js$/i.test(base.pathname)) {
      base.pathname = base.pathname.replace(/\/?$/, "/");
    }
    return base;
  }

  /* 이 런타임을 실은 스크립트 주소 — 둘째 한 줄 설치 태그의 판이 다르면 그 태그가 부른 글꼴·확장을 이 판 자리에서 받는다 */
  var OWN_SCRIPT_SRC = typeof document !== "undefined" && document.currentScript && document.currentScript.src
    ? document.currentScript.src : null;
  /* 코어 CSS 주소 — 한 줄 설치가 붙인 것. 그림자 트리에 코어를 넣을 때 쓴다(ensureCoreCss) */
  var CORE_CSS_HREF = null;

  /* later: 런타임이 이미 실린 페이지의 둘째 태그(아래 SCRIPT_TAG_HOOK). 문서 전체 가리개를 씌우지 않고(이미 그린 글자가
   * 숨는다 — 새 글꼴을 기다리는 바탕 요소는 필요할 때 받기가 저마다 가린다), 필요할 때 받기 기준 주소가 없을 때만 정한다.
   * from: 태그 대신 이 주소 기준으로 받는다(판이 다른 둘째 태그) */
  function loadFromScriptTag(script, later, from) {
    /* 첫 태그가 끈 받기는 그 태그에 data-fonts 등이 없어도 기억한다 — 뒤 태그가 다시 켜지 않게(0.1.3 탐색 api-3·api-17) */
    if (!later && script && typeof script.getAttribute === "function" && script.getAttribute("data-autoload") === "false") {
      AUTOLOAD.off = true;
    }
    if (!scriptLoaderRequested(script)) {
      return [];
    }
    var doc = script.ownerDocument || document;
    var base = scriptLoaderBase(from || script.src);
    /* font-kku.min.js(jsDelivr는 .min을 붙이면 압축본을 만들어 보낸다)로 실렸으면 CSS·확장·
     * 모듈도 .min 이름으로 받는다. */
    var min = /\.min\.js$/i.test(base.pathname);
    function named(file) {
      return min ? file.replace(/(\.jamo)?\.(css|js)$/, "$1.min.$2") : file;
    }
    if (script.getAttribute("data-autoload") !== "false" && !(later && (AUTOLOAD.base || AUTOLOAD.off))) {
      AUTOLOAD.base = new URL(".", base).href;
      AUTOLOAD.min = min;
    }
    var addons = scriptLoaderAddons(script.getAttribute("data-addons") || "");
    var coreHref = new URL(named("font-kku.css"), base).href;
    if (!CORE_CSS_HREF) {
      CORE_CSS_HREF = coreHref;
    }
    var hrefs = [coreHref].concat(
      scriptLoaderFonts(script.getAttribute("data-fonts") || "").map(function (name) {
        return new URL(named("profiles/" + name + ".css"), base).href;
      }),
      addons.filter(function (name) { return SCRIPT_LOADER_ADDONS[name].css; }).map(function (name) {
        return new URL(named(SCRIPT_LOADER_ADDONS[name].css), base).href;
      })
    );
    /* data-jamo-sets="sprite-system": 벡터 자소 모듈(profiles/<name>.jamo.js)도 붙인다. */
    var jamoSrcs = scriptLoaderFonts(script.getAttribute("data-jamo-sets") || "").filter(function (name) {
      return !JAMO_SETS[name];
    }).map(function (name) {
      return new URL(named("profiles/" + name + ".jamo.js"), base).href;
    }).concat(addons.filter(function (name) { return SCRIPT_LOADER_ADDONS[name].js; }).map(function (name) {
      return new URL(named(SCRIPT_LOADER_ADDONS[name].js), base).href;
    })).filter(function (src) {
      /* 이미 받는 중이거나 받은 모듈(앞 태그·필요할 때 받기)은 다시 붙이지 않는다 */
      var known = autoloadRequests(doc)[src];
      return !known || known.status === "error";
    });
    jamoSrcs.forEach(function (src) {
      autoloadRequests(doc)[src] = { status: "loading" };
    });
    var veil = null;
    if (!later) {
      veil = doc.createElement("style");
      veil.setAttribute("data-font-kku-loader", "");
      veil.textContent = ':where(font-kku, .font-kku) [part="root"] { visibility: hidden; --fy-ink-visibility: hidden; }';
      (doc.head || doc.documentElement).appendChild(veil);
    }
    var pending = hrefs.length + jamoSrcs.length;
    var timer = setTimeout(reveal, SCRIPT_LOADER_REVEAL_MS);
    function reveal() {
      clearTimeout(timer);
      if (veil && veil.parentNode) {
        veil.parentNode.removeChild(veil);
      }
    }
    function settle() {
      pending -= 1;
      if (pending === 0) {
        reveal();
      }
    }
    hrefs.forEach(function (href) {
      loadFont(href, { root: doc }).then(settle, function (error) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(error.message);
        }
        settle();
      });
    });
    jamoSrcs.forEach(function (src) {
      var tag = doc.createElement("script");
      tag.src = src;
      tag.async = false;
      var request = autoloadRequests(doc)[src];
      request.node = tag;
      var setMatch = /\/([^/]+)\.jamo(?:\.min)?\.js$/.exec(new URL(src).pathname);
      function failed(error) {
        if (autoloadRequests(doc)[src] !== request) { settle(); return; }
        if (tag.parentNode) { tag.parentNode.removeChild(tag); }
        if (setMatch) {
          failAutoload(doc, src, setMatch[1], "jamo-set", error);
        } else {
          autoloadRequests(doc)[src] = { status: "error", error: error };
          if (typeof console !== "undefined" && console.warn) {
            console.warn("font-kku: script " + src + " failed to load");
          }
        }
        settle();
      }
      tag.addEventListener("load", function () {
        if (autoloadRequests(doc)[src] !== request) { settle(); return; }
        if (setMatch && !JAMO_SETS[setMatch[1]]) {
          failed(new Error("font-kku: module did not register " + setMatch[1]));
          return;
        }
        request.status = "ready";
        settle();
      });
      tag.addEventListener("error", function () {
        failed(new Error("font-kku: failed to load script " + src));
      });
      (doc.head || doc.documentElement).appendChild(tag);
    });
    return hrefs.concat(jamoSrcs);
  }

  /* 둘째 한 줄 설치 태그(블로그 글·위젯마다 붙인 태그) — 그 사본은 맨 위에서 이 런타임을 넘겨받고 끝나므로, 자기 태그를
   * 이 고리로 넘긴다. 같은 판이면 그 태그 주소로, 판이 다르면 이 런타임을 실은 주소로 글꼴·확장·세트를 받는다(다른 판 CSS를
   * 섞지 않는다). 심볼은 Symbol.for라 사본끼리 같다 */
  if (typeof Symbol === "function") {
    Object.defineProperty(FontKku, Symbol.for("font-kku.scriptTag"), {
      value: function (script, version) {
        return loadFromScriptTag(script, true, version !== VERSION && OWN_SCRIPT_SRC ? OWN_SCRIPT_SRC : null);
      }
    });
  }

  if (typeof document !== "undefined") {
    loadFromScriptTag(document.currentScript);
  }

  /* Consumers that only need the pure text/model APIs can set
   * `globalThis.FontKkuConfig = { bootstrap: false }` before loading the
   * runtime, then call `FontKku.bootstrap(root)` explicitly if needed. */
  if (typeof document !== "undefined" && shouldAutoBootstrap()) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        bootstrap(document);
      }, { once: true });
    } else {
      bootstrap(document);
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
