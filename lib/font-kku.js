(function (global) {
  "use strict";

  var VERSION = "0.1.4-rc.4";

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
  /* 짓는 방식(ADR-034): 프리셋 하나 = 음절 나누기(모음·받침) × 조각 깊이(none 자모 그대로 · pieces 다른 자모로 한 번 ·
   * origins 원형 8·천지인까지). auto는 고르지 않음 — 아래 수준(디자인·글꼴·모양)이 정한다. 아무것도 고르지 않으면 지금 출력 그대로다 */
  var COMPOSITION_PRESETS = {
    auto: null,
    syllable: { vowel: "syllable", coda: "whole", pieces: "none" },
    whole: { vowel: "whole", coda: "whole", pieces: "none" },
    jamo: { vowel: "split", coda: "split", pieces: "none" },
    pieces: { vowel: "split", coda: "split", pieces: "pieces" },
    origins: { vowel: "split", coda: "split", pieces: "origins" }
  };
  var COMPOSITION_PIECES = { none: true, pieces: true, origins: true };
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
        placements.head[index],
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
        placements.choseong[index],
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
          placements.jungseong[index],
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
          placements.jungseong[index],
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
          placements.jongseong[index],
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
          placements.jongseong[index],
          glyph,
          RENDER_ROLES.jongMain
        );
        body.appendChild(child);
      });
    }

    node.appendChild(body);
    stampGlyphContext(node, glyph, placements);
    return node;
  }

  /* 글자 칸의 문맥 표면 — 자리마다 그 자리 자모(data-fy-at-<자리>)와 자모 노드 차례의 자모 목록(data-fy-jamos). 글꼴 CSS는
   * 이웃 자모를 조상 자리 :has() 대신 이 속성으로 고른다: Chromium은 페이지의 모든 :has() 무효화를 하나로 합쳐, 조상 자리
   * :has()가 있으면 페이지 :has() 주체 안의 자모 노드가 그 안 class 바꿈마다 다시 계산된다. 한 글자의 자리는 겹치지 않는다 */
  function stampGlyphContext(node, glyph, placements) {
    var jamos = [];
    ["head", "choseong", "jungseong", "jongseong"].forEach(function (role) {
      (glyph.display[role] || []).forEach(function (value, index) {
        node.setAttribute("data-fy-at-" + placements[role][index], value);
        jamos.push(value);
      });
    });
    node.setAttribute("data-fy-jamos", jamos.join(" "));
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

  /* 나누기는 들어올 때 정규화되고(잘못된 값은 기본값), 생성된 표는 나누기 여섯 × 짜임 아홉을 모두 채운다 — 음절의 자모 수와
   * 표의 자리 수가 같다는 것은 tests/spec_parity.test.js "compiled display plans match every Hangul syllable at every depth"가 지킨다.
   * 그래서 대체 자리·대체 짜임을 두지 않는다(엔진 간결화 검토 C4, 2026-10-17). */
  function resolvePlacementPlan(glyph) {
    return PLACEMENT_TABLES_BY_COMBO[glyph.vowelDepth][glyph.codaDepth][glyph.topology.placementKey];
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
    var longVowel = normalizeKeyword(style.getPropertyValue(names.vowel), VOWEL_DEPTHS, null);
    var longCoda = normalizeKeyword(style.getPropertyValue(names.coda), CODA_DEPTHS, null);
    /* vowel·coda는 그 계층의 깊이(낱 이름이 줄임을 이긴다). 짓는 방식은 둘을 따로 본다 — 낱 깊이 > 프리셋 > 줄임 깊이(ADR-034 §3) */
    return {
      vowel: longVowel || (shorthand ? shorthand.vowel : null),
      coda: longCoda || (shorthand ? shorthand.coda : null),
      long: { vowel: longVowel, coda: longCoda },
      shorthand: { vowel: shorthand ? shorthand.vowel : null, coda: shorthand ? shorthand.coda : null }
    };
  }

  /* 짓는 방식 낱말 하나(--fy-composition·--fy-font-composition) → { preset, invalid }. 빈 값·auto는 고르지 않음 */
  function readCompositionToken(style, name) {
    var token = String(style.getPropertyValue(name) || "").trim().toLowerCase();
    if (!token || token === "auto") {
      return { preset: null, invalid: false };
    }
    return own(COMPOSITION_PRESETS, token) ? { preset: token, invalid: false } : { preset: null, invalid: true, token: token };
  }

  /* 디자인의 composition(정규화본: { preset, vowel, coda, pieces } — 셋 중 빈 것은 null) */
  function designCompositionAxes(composition) {
    if (!composition) {
      return null;
    }
    var preset = composition.preset ? COMPOSITION_PRESETS[composition.preset] : null;
    return {
      preset: composition.preset || null,
      vowel: composition.vowel || (preset ? preset.vowel : null),
      coda: composition.coda || (preset ? preset.coda : null),
      pieces: composition.pieces || (preset ? preset.pieces : null)
    };
  }

  /* 짓는 방식 풀기(ADR-034 §3) — 순수 함수(FontKku.resolveComposition). 높은 것부터: 페이지 CSS(낱 깊이 변수 > --fy-composition > 줄임
   * --fy-jamo-depth) > 디자인 composition > 글꼴 CSS(낱 깊이 변수 > --fy-font-composition > 줄임 --fy-font-jamo-depth) > 모양의 기본. 자모마다 고른 디자인 규칙은 조립 계획에서
   * 이 묶음을 다시 이긴다. 입력: { page: { preset, vowel, coda }, design: { preset, vowel, coda, pieces } | null,
   * font: { preset, vowel, coda }, shape: { vowel, coda } } → { vowel, coda, pieces, preset, source }. page·font의 vowel·coda는 낱 깊이
   * 변수 값, 줄임 깊이는 따로 shorthand: { vowel, coda }로 준다(프리셋 아래). preset은 고른 프리셋 이름(결과가 그
   * 프리셋과 같을 때), 프리셋을 골랐는데 깊이 변수가 일부를 바꾸면 "custom", 아무 수준도 고르지 않았으면 null(지금 출력 그대로) */
  function resolveComposition(input) {
    var data = input || {};
    var page = data.page || {};
    var font = data.font || {};
    var shape = data.shape || {};
    var design = data.design ? designCompositionAxes(data.design) : null;
    var pagePreset = page.preset && COMPOSITION_PRESETS[page.preset] ? COMPOSITION_PRESETS[page.preset] : null;
    var fontPreset = font.preset && COMPOSITION_PRESETS[font.preset] ? COMPOSITION_PRESETS[font.preset] : null;
    /* 한 계층 안에서는 낱 깊이(vowel·coda) > 그 계층의 프리셋 > 줄임 깊이(shorthand — 글꼴의 일반 기본). 그래서 글꼴이 줄임 깊이를
     * 밝혀도 같은 글꼴 CSS의 --fy-font-composition이 먹고, 사람이 쓴 낱 깊이는 늘 이긴다 */
    var pageShort = page.shorthand || {};
    var fontShort = font.shorthand || {};
    var pick = function (axis, fallback) {
      var levels = [
        [page[axis], "page"], [pagePreset && pagePreset[axis], "page"], [pageShort[axis], "page"],
        [design && design[axis], "design"],
        [font[axis], "font"], [fontPreset && fontPreset[axis], "font"], [fontShort[axis], "font"],
        [shape[axis], "shape"]
      ];
      for (var i = 0; i < levels.length; i += 1) {
        if (levels[i][0]) { return levels[i]; }
      }
      return [fallback, "shape"];
    };
    var vowel = pick("vowel", DEFAULT_VOWEL_DEPTH);
    var coda = pick("coda", DEFAULT_CODA_DEPTH);
    var pieces = pick("pieces", "none");
    var designChose = Boolean(design && (design.preset || design.vowel || design.coda || design.pieces));
    var source = pagePreset ? "page" : designChose ? "design" : fontPreset ? "font" : null;
    var chosen = source === "page" ? page.preset : source === "design" ? design.preset || "custom" : source === "font" ? font.preset : null;
    var preset = null;
    if (chosen) {
      var table = COMPOSITION_PRESETS[chosen];
      preset = table && table.vowel === vowel[0] && table.coda === coda[0] && table.pieces === pieces[0] ? chosen : "custom";
    }
    return { vowel: vowel[0], coda: coda[0], pieces: pieces[0], preset: preset, source: source };
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
  var FACE_FAILURES = new WeakMap();
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
  function watchFaceLoad(doc, family, text, shape) {
    var fonts = doc && doc.fonts;
    if (!fonts) { return; }
    if (FACE_LOADS[family]) { return "pending"; }
    var names = family.split(",").map(function (name) {
      return name.trim().replace(/^["']|["']$/g, "").toLowerCase();
    });
    var request = (shape || "100px") + " " + family;
    var key = request + "\u0000" + text;
    var failures = FACE_FAILURES.get(fonts);
    if (!failures) { failures = Object.create(null); FACE_FAILURES.set(fonts, failures); }
    var faces = [];
    var waits = [];
    if (typeof fonts.forEach === "function") {
      fonts.forEach(function (face) {
        var name = String(face.family || "").replace(/^["']|["']$/g, "").toLowerCase();
        if (names.indexOf(name) >= 0) {
          faces.push(face);
          if (face.status === "loading" && face.loaded) { waits.push(face.loaded); }
        }
      });
    }
    // A rejected FontFace.load() rejects again immediately. Refit only once for that
    // request; replacing a face or changing its status permits a fresh attempt.
    var failed = failures[key];
    if (failed && failed.length === faces.length && failed.every(function (entry, index) {
      return entry.face === faces[index] && entry.status === faces[index].status;
    })) { return "failed"; }
    delete failures[key];
    if (!waits.length && typeof fonts.check === "function" && typeof fonts.load === "function" &&
        !fonts.check(request, text)) {
      waits.push(fonts.load(request, text));
    }
    if (waits.length && typeof Promise === "function") {
      FACE_LOADS[family] = true;
      var settle = function () {
        delete FACE_LOADS[family];
        refitFaces(doc);
      };
      Promise.all(waits).then(settle, function () {
        failures[key] = faces.map(function (face) { return { face: face, status: face.status }; });
        settle();
      });
      return "pending";
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
  function stampInset(node, expected, profile) {
    var stamp = profile ? shapeStampFor(node, profile) : null;
    var stroke = stamp ? stamp[7] : 0;
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
    var palette = appliedDesign(meta);
    var shapeProfile = fixedLayout(meta);
    Array.prototype.forEach.call(root.querySelectorAll('[part~="jamo"]'), function (node) {
      fitFaceNode(node, meta, doc, reference, palette, shapeProfile, null);
    });
  }

  /* 기기 글꼴 노드 하나(fitFaceNodes). target(노드 em의 [왼, 위, 오른, 아래])이 있으면 표준 잉크 상자 대신 그 상자에 글자를 맞춘다 —
   * 네모꼴에서 글꼴 기본이 아닌 나누기의 조각을 기본 나누기 자리로 옮길 때(fitSquareSplits, ADR-034 §5). 디자인이 없는 노드만 */
  function fitFaceNode(node, meta, doc, reference, palette, shapeProfile, target) {
    var text = node.dataset.jamo;
    var design = mappedDesignNode(node, text, palette) ? null : palette;
    if (node.hasAttribute("data-fy-glyph-mapped")) { clearGlyphMapping(node); }
    var expected = text ? reference[text] : null;
    if (!expected) {
      return;
    }
    var family = meta.family;
    var shape = null;
    if (!design && shapeProfile && fixedWholeLeaves(node, text, meta, shapeProfile, reference, doc)) {
      return;
    }
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
    /* 고정 글꼴 모양의 머리 음절(완성형 머리 글자, ADR-030 §4)은 그리는 굵기(모양 값 font-weight)로 잰다 — 완성형 글자는 굵은 꼴의
     * 잉크 상자가 400보다 0.01–0.02em 넓어(Apple SD 고·호), 400으로 재면 받침 쪽으로 넘친다. 조합용 자모(조각)는 거의 같아 그대로다 */
    if (!design && shapeProfile && / head /.test(" " + node.getAttribute("part") + " ")) {
      var headStamp = shapeStampFor(node, shapeProfile);
      weight = headStamp && headStamp[6] !== 400 ? String(headStamp[6]) : undefined;
    }
    var box = faceBox(doc, family, text, weight, style);
    if (!box || !faceClose(box, expected)) {
      glyph = faceGlyph(text);
      box = glyph === text ? box : faceBox(doc, family, glyph, weight, style);
    }
    if (!box) {
      return;
    }
    var fit = faceFit(box, target || stampInset(node, expected, shapeProfile));
    node.style.setProperty("--fy-face-glyph", JSON.stringify(glyph));
    node.style.setProperty("--fy-face-size", round4(fit.k) + "em");
    node.style.setProperty("--fy-face-scale-x", String(round4(fit.scaleX)));
    node.style.setProperty("--fy-face-scale-y", String(round4(fit.scaleY)));
    /* translate는 ::before의 em(= 노드 em × k)으로 풀리므로 k로 나눈다 */
    node.style.setProperty("--fy-face-x", round4(fit.x) + "em");
    node.style.setProperty("--fy-face-y", round4(fit.y) + "em");
    node.style.setProperty("--fy-face-width", round4(expected[4]) + "em");
  }

  /* 고정 글꼴 모양(세벌식·직결식)의 통짜 모음 노드(기기 글꼴 재료) — 합자 모음 글자 하나는 그 글꼴의 비례(ㅗ 꼭지가 높다)라 모양의
   * 초성과 겹친다. 조각 낱자 둘(ㅗ·ㅣ)을 잎으로 내어 낱 나누기의 조각 자리(fixedPartRegions)에 맞춘다 — 원소·그림 재료의
   * fitFixedParts와 같은 자리. 노드의 text-stroke 절반만큼 안으로 맞춘다(stampInset과 같다). 냈으면 true */
  function fixedWholeLeaves(node, text, meta, profile, reference, doc) {
    var part = " " + (node.getAttribute("part") || "") + " ";
    var split = HANGUL_TABLES.splitJungseong[text];
    if (!split || !/ jungseong /.test(part) || / jungseong-(?:base|tail) /.test(part) || !profile.cell) {
      return false;
    }
    var stamp = shapeStampFor(node, profile);
    var pieces = stamp ? caseStamp(profile.stamps[text], profile.model === "case-fixed" ? layoutCase(node) : "") : null;
    if (!pieces || !Array.isArray(pieces[0])) {
      return false;
    }
    /* 글자 칸 em ↔ 노드 em: 모양 값은 노드 em 상자를 글자 칸 em으로 x = left + size·scale·u로 옮긴다 */
    var origin = function (value) {
      return [value[0] * profile.cell.width / 100, value[1] * profile.cell.height / 100, value[2] * value[3], value[2] * value[4]];
    };
    var whole = origin(stamp);
    var leaves = split.parts.map(function (piece, index) {
      /* 낱 나누기의 그 조각 노드가 그리는 것과 같게 — 조각 값의 text-stroke 절반만큼 안으로 맞춘 상자(stampInset)를 그 조각 자리로 */
      var own = pieces[index];
      var inset = own[7] > 0 ? own[7] / 2 : 0;
      var box0 = reference[piece];
      var expected = [box0[0] + inset, box0[1] + inset, box0[2] - inset, box0[3] - inset];
      var at = origin(own);
      var cell = [at[0] + at[2] * expected[0], at[1] + at[3] * expected[1], at[0] + at[2] * expected[2], at[1] + at[3] * expected[3]];
      var target = [(cell[0] - whole[0]) / whole[2], (cell[1] - whole[1]) / whole[3], (cell[2] - whole[0]) / whole[2], (cell[3] - whole[1]) / whole[3]];
      var glyph = piece;
      var box = faceBox(doc, meta.family, piece);
      if (!box || !faceClose(box, box0)) {
        glyph = faceGlyph(piece);
        box = glyph === piece ? box : faceBox(doc, meta.family, glyph);
      }
      if (!box || !(expected[2] > expected[0] && expected[3] > expected[1] && target[2] > target[0] && target[3] > target[1])) {
        return null;
      }
      /* 획 넓힘: 조각 노드에서 text-stroke는 글자 배율(k)과 함께 커진다 — 잎 글자 크기 대비 같은 비(own[7] / k)로 */
      return [glyph, faceFit(box, target), own[7] / faceFit(box, expected).k];
    });
    if (leaves.some(function (leaf) { return !leaf; })) {
      return false;
    }
    Array.prototype.slice.call(node.querySelectorAll(':scope > [part="leaf"]')).forEach(function (leaf) { node.removeChild(leaf); });
    leaves.forEach(function (entry) {
      var leaf = doc.createElement("span");
      leaf.setAttribute("part", "leaf");
      leaf.textContent = entry[0];
      leaf.style.setProperty("--fy-leaf-size", round4(entry[1].k) + "em");
      leaf.style.setProperty("--fy-leaf-scale-x", String(round4(entry[1].scaleX)));
      leaf.style.setProperty("--fy-leaf-scale-y", String(round4(entry[1].scaleY)));
      leaf.style.setProperty("--fy-leaf-x", round4(entry[1].x) + "em");
      leaf.style.setProperty("--fy-leaf-y", round4(entry[1].y) + "em");
      leaf.style.setProperty("-webkit-text-stroke-width", round4(entry[2]) + "em");
      node.appendChild(leaf);
    });
    node.setAttribute("data-fy-leaves", "");
    node.style.removeProperty("--fy-face-glyph");
    node.style.setProperty("--fy-face-width", round4(reference[text][4]) + "em");
    return true;
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
    var env = { design: design, set: null, sourceId: null, cells: null, geometry: true, trace: [], pieces: meta.compositionPieces || "" };
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

  function mappedFontDesign(design) {
    return design && design.mode === "font" && Object.keys(design.sources).some(function (id) { return Boolean(design.sources[id].glyphs); });
  }

  /* A mapped source that is not reached by this node must not alter its existing font palette path. */
  function mappedDesignNode(node, text, design) {
    if (!mappedFontDesign(design)) { return false; }
    var skeleton = skeletonFor(node, text);
    if (!skeleton) { return Boolean(design.sources[design.defaults.source].glyphs); }
    var requests = designRequests(node, skeleton, design);
    var env = {design: design, geometry: true, trace: []};
    skeleton.forEach(function (group, index) {
      planRequest(Object.assign({}, requests[index], {jamo: group[0], strokes: group[1], context: "", level: 0}), env, []);
    });
    return env.trace.some(function (entry) { return Boolean(design.sources[entry.source].glyphs); });
  }

  var GLYPH_VARIABLES = [
    ["--fy-glyph-candidate", "--fy-glyph-text"], ["--fy-tune-glyph-candidate", "--fy-tune-glyph-text"],
    /* 범위 사다리(ADR-035): 이 글자만 > 문맥 > 같은 짜임 > 자모 — 좁은 수준이 넓은 수준을 이긴다(특이도와 상관없이) */
    ["--fy-syl-glyph-candidate", "--fy-syl-glyph-text"], ["--fy-ctx-glyph-candidate", "--fy-ctx-glyph-text"],
    ["--fy-case-glyph-candidate", "--fy-case-glyph-text"], ["--fy-jamo-glyph-candidate", "--fy-jamo-glyph-text"],
    ["--fy-slot-glyph-candidate", "--fy-slot-glyph-text"], ["--fy-font-glyph-candidate", "--fy-font-glyph-text"]
  ];
  var GLYPH_RESULTS = new WeakMap();
  var GLYPH_ORIGINALS = new WeakMap();
  var GLYPH_RENDER_KEYS = new WeakMap();
  var GLYPH_INK = Object.create(null);
  /* 문자 재료 잎은 읽는 글이 아니라 그리는 재료다(읽는 글은 sr-source). 잎과 측정 탐침·캔버스를 언어 없음(zxx)으로 두어 일반 글꼴
   * 낱말과 대체 글꼴이 같은 글꼴로 풀리게 한다 — lang="ko" 페이지에서 sans-serif가 화면에서는 한글 기본 글꼴, 캔버스에서는 언어
   * 없는 기본 글꼴로 풀려 측정과 그림이 어긋났다(Chromium·WebKit·Firefox 모두). */
  var GLYPH_LANG = "zxx";

  function cssGlyphString(value) {
    var text = String(value || "").trim();
    if (!text) { return null; }
    if (text === "none") { return { disabled: true }; }
    var quote = text.charAt(0);
    if ((quote !== '"' && quote !== "'") || text.charAt(text.length - 1) !== quote) { return { error: "GLYPH_TEXT_INVALID" }; }
    for (var cursor = 1; cursor < text.length - 1; cursor += 1) {
      if (text.charAt(cursor) === quote) { return {error: "GLYPH_TEXT_INVALID"}; }
      if (text.charAt(cursor) === "\\") {
        cursor += 1;
        if (cursor >= text.length - 1) { return {error: "GLYPH_TEXT_INVALID"}; }
      }
    }
    text = text.slice(1, -1).replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[ \n\r\t\f])?|\\(.)/g, function (_match, hex, escaped) {
      var code = hex ? parseInt(hex, 16) : 0;
      return hex ? code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd" : escaped;
    });
    return glyphTextValid(text) ? { text: text } : { error: "GLYPH_TEXT_INVALID" };
  }

  function readGlyphSelection(style) {
    for (var i = 0; i < GLYPH_VARIABLES.length; i += 1) {
      var candidate = String(style.getPropertyValue(GLYPH_VARIABLES[i][0]) || "").trim();
      var text = String(style.getPropertyValue(GLYPH_VARIABLES[i][1]) || "").trim();
      if (candidate) {
        if (candidate === "none") { return { disabled: true }; }
        var id = readIdent(style, GLYPH_VARIABLES[i][0]);
        return DESIGN_SOURCE_ID.test(id) ? {candidate: id} : {error: "GLYPH_CANDIDATE_MISSING"};
      }
      if (text) { return cssGlyphString(text); }
    }
    return null;
  }

  /* 새 문자 재료만의 측정. 기존 한글 맞춤 캐시/크기를 바꾸지 않고 다문자 폭과 실제 글꼴 설정을 잉크 화소로 잰다. */
  function glyphInkBox(doc, source, text, style) {
    var family = source.familyCss || designFamily(source);
    var weightOverride = ["--fy-weight", "--fy-syl-weight", "--fy-ctx-weight", "--fy-case-weight", "--fy-jamo-weight", "--fy-slot-weight", "--fy-role-weight"].some(function (key) {
      return String(style.getPropertyValue(key) || "").trim();
    });
    var weight = weightOverride ? style.fontWeight : source.weight || style.fontWeight || "400";
    var slant = source.style || style.fontStyle || "normal";
    var stretch = canvasStretch(source.stretch || style.fontStretch || "normal");
    if (!stretch) { return { error: "GLYPH_FONT_SETTINGS_UNSUPPORTED" }; }
    var variation = source.variationSettings && Object.keys(source.variationSettings).length ? source.variationSettings : style.fontVariationSettings || "normal";
    if (variation !== "normal" || (style.fontFeatureSettings && style.fontFeatureSettings !== "normal")) {
      return { error: "GLYPH_FONT_SETTINGS_UNSUPPORTED" };
    }
    var letter = style.letterSpacing || "normal";
    var word = style.wordSpacing || "normal";
    var size = parseFloat(style.fontSize) || 16;
    var spacing = function (value) { return value === "normal" ? "0px" : (parseFloat(value) || 0) / size * 100 + "px"; };
    var key = [family, weight, slant, stretch, text, letter, word, size, style.direction, style.fontKerning].join("\u0000");
    var loadStatus = watchFaceLoad(doc, family, text, slant + " " + weight + " 100px");
    if (loadStatus === "pending") { return { error: "GLYPH_FONT_PENDING" }; }
    if (loadStatus === "failed") { return { error: "GLYPH_FONT_LOAD_FAILED" }; }
    if (GLYPH_INK[key]) { return GLYPH_INK[key]; }
    var canvas = doc.createElement("canvas");
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { return { error: "GLYPH_MEASUREMENT_UNAVAILABLE" }; }
    var setup = function () {
      if ("lang" in ctx) { ctx.lang = GLYPH_LANG; }
      ctx.font = slant + " " + weight + " 100px " + family;
      if ("fontStretch" in ctx) { ctx.fontStretch = stretch; }
      if ("letterSpacing" in ctx) { ctx.letterSpacing = spacing(letter); }
      if ("wordSpacing" in ctx) { ctx.wordSpacing = spacing(word); }
      if ("fontKerning" in ctx) { ctx.fontKerning = style.fontKerning || "auto"; }
      ctx.direction = style.direction || "ltr";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    };
    if (stretch !== "normal" && !("fontStretch" in ctx)) { return { error: "GLYPH_FONT_SETTINGS_UNSUPPORTED" }; }
    if ((letter !== "normal" && parseFloat(letter) && !("letterSpacing" in ctx)) ||
        (word !== "normal" && parseFloat(word) && !("wordSpacing" in ctx))) { return {error: "GLYPH_FONT_SETTINGS_UNSUPPORTED"}; }
    setup();
    var metrics = ctx.measureText(text);
    canvas.width = Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight || 0) + Math.max(200, metrics.actualBoundingBoxLeft || 0) + 200);
    var baselineY = Math.max(300, (metrics.actualBoundingBoxAscent || 0) + 100);
    canvas.height = Math.ceil(baselineY + Math.max(200, (metrics.actualBoundingBoxDescent || 0) + 100));
    if (canvas.width > 16384 || canvas.height > 16384 || canvas.width * canvas.height > 16777216) { return {error: "GLYPH_MEASUREMENT_UNAVAILABLE"}; }
    setup();
    var origin = Math.max(200, metrics.actualBoundingBoxLeft || 0);
    ctx.fillText(text, origin, baselineY);
    var pixels;
    try { pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data; } catch (_error) { return { error: "GLYPH_MEASUREMENT_UNAVAILABLE" }; }
    var box = [canvas.width, canvas.height, -1, -1];
    for (var y = 0; y < canvas.height; y += 1) {
      for (var x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) {
          box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x + 1); box[3] = Math.max(box[3], y + 1);
        }
      }
    }
    var parent = doc.body || doc.documentElement;
    var probe = doc.createElement("span");
    probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;font-size:100px;line-height:1;white-space:nowrap";
    probe.setAttribute("lang", GLYPH_LANG);
    applyFontShape(probe, {familyCss: family, weight: weight, style: slant, stretch: stretch});
    var mark = doc.createElement("span");
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    probe.appendChild(doc.createTextNode(text)); probe.appendChild(mark); parent.appendChild(probe);
    var baseline = mark.offsetTop / 100;
    parent.removeChild(probe);
    if (box[0] === 0 || box[1] === 0 || box[2] === canvas.width || box[3] === canvas.height) { return {error: "GLYPH_MEASUREMENT_UNAVAILABLE"}; }
    if (box[2] <= box[0] || box[3] <= box[1] || baseline === null) { return { error: "GLYPH_MEASUREMENT_UNAVAILABLE" }; }
    var result = { box: [(box[0] - origin) / 100, baseline + (box[1] - baselineY) / 100,
      (box[2] - origin) / 100, baseline + (box[3] - baselineY) / 100, metrics.width / 100], source: Object.assign({}, source, {familyCss: family, weight: weight, style: slant, stretch: stretch, letterSpacing: (parseFloat(letter) || 0) / size + "em", wordSpacing: (parseFloat(word) || 0) / size + "em"}) };
    result.ink = glyphInkMask(pixels, canvas.width, box);
    GLYPH_INK[key] = result;
    return result;
  }

  /* 측정한 잉크(100px, 화소 = 0.01em)의 알파와 획 굵기. stemX는 세로 획의 폭(가로로 잰 잉크 길이의 가운데값), stemY는 가로 획의
   * 두께(세로로 잰 길이의 가운데값)다. 반투명 가장자리까지 알파로 더해 화소보다 곱게 잰다. 문자를 획 자리에 맞출 때 쓴다. */
  function glyphInkMask(pixels, stride, box) {
    var left = box[0] - 1, top = box[1] - 1, w = box[2] - box[0] + 2, h = box[3] - box[1] + 2;
    var alpha = new Uint8Array(w * h);
    for (var y = 0; y < h; y += 1) {
      for (var x = 0; x < w; x += 1) { alpha[y * w + x] = pixels[((top + y) * stride + left + x) * 4 + 3]; }
    }
    var median = function (count, length, at) {
      var runs = [];
      for (var i = 0; i < count; i += 1) {
        var sum = 0;
        for (var j = 0; j <= length; j += 1) {
          var value = j < length ? at(i, j) : 0;
          if (value >= 32) { sum += value / 255; } else if (sum) { if (sum >= 0.5) { runs.push(sum); } sum = 0; }
        }
      }
      runs.sort(function (a, b) { return a - b; });
      return runs.length ? runs[Math.floor(runs.length / 2)] / 100 : 0;
    };
    /* 화소 (col, row)는 잉크 상자 왼쪽 위에서 한 화소 바깥(-0.01em)부터다 */
    return { w: w, h: h, alpha: alpha,
      stemX: median(h, w, function (row, col) { return alpha[row * w + col]; }),
      stemY: median(w, h, function (col, row) { return alpha[row * w + col]; }) };
  }

  /* 캔버스 fontStretch는 낱말 값만 받는다. 계산된 백분율을 낱말로 바꾸고, 낱말이 없는 값은 측정할 수 없다(null). */
  var CANVAS_STRETCH = {"50%": "ultra-condensed", "62.5%": "extra-condensed", "75%": "condensed", "87.5%": "semi-condensed",
    "100%": "normal", "112.5%": "semi-expanded", "125%": "expanded", "150%": "extra-expanded", "200%": "ultra-expanded"};
  function canvasStretch(value) {
    var text = String(value).trim().toLowerCase();
    if (CANVAS_STRETCH[text]) { return CANVAS_STRETCH[text]; }
    return Object.keys(CANVAS_STRETCH).some(function (key) { return CANVAS_STRETCH[key] === text; }) ? text : null;
  }

  /* 문자 재료를 자모 자리에 맞추는 셈(ADR-032 §12) — 문자를 그대로 놓지 않고 자모 획을 닮게 고쳐 놓는다. 고친 획의 굵기는
   * 글꼴의 획 굵기(잉크 상자 표의 stroke)에 맞춘다.
   * - 곧은 획 하나(ㅡ·ㅣ·짧은 획·빗금): 획 방향으로 돌려 길이를 획 길이에 맞추고, 글자의 획 두께(stemX·stemY)를 글꼴 획 굵기로
   *   바꾼다. 1의 깃처럼 획 밖으로 나온 모양은 같은 비로 남는다(길이의 0.45배까지). 점(·)은 짧은 획이 된다.
   * - 가로·세로 마디로 된 자모(ㄱ·ㄴ·ㅁ·ㄷ…): 글자를 마디 줄에서 잘라(9분할 늘이기) 마디는 획 굵기로, 그 사이만 늘인다. ¬가
   *   가로·세로 굵기가 같은 ㄱ이 된다. 글자에서 마디를 못 찾으면 자리에 맞춰 늘인다.
   * - 동그라미와 빗금 모양: 통째 자모는 글자 비율을 지켜 넣고(O·0·o가 달라 보인다), 조각은 자리에 맞춰 늘인다.
   * 결과는 잎마다 { fit, clip } — clip은 그 잎이 그릴 글자 부분(글자 em 상자, 없으면 null)이다. */
  function containGlyph(box, target) {
    var k = Math.min((target[2] - target[0]) / (box[2] - box[0]), (target[3] - target[1]) / (box[3] - box[1]));
    return { k: k, scaleX: 1, scaleY: 1, rotate: 0,
      x: ((target[0] + target[2]) / 2 - k * (box[0] + box[2]) / 2) / k,
      y: ((target[1] + target[3]) / 2 - k * (box[1] + box[3]) / 2) / k };
  }

  function lineGlyphFit(measured, segment, axes, stroke) {
    var box = measured.box, ink = measured.ink || {};
    var x1 = axes.x(segment[0]), y1 = axes.y(segment[1]), x2 = axes.x(segment[2]), y2 = axes.y(segment[3]);
    var width = box[2] - box[0], height = box[3] - box[1];
    var length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)) + stroke;
    var upright = height > width * 1.2;
    var own = upright ? height : width;
    var across = upright ? width : height;
    var stem = (upright ? ink.stemX : ink.stemY) || across;
    var along = length / own;
    var cross = Math.min(stroke / stem, Math.max(stroke, length * 0.45) / across);
    var sx = upright ? cross : along;
    var sy = upright ? along : cross;
    var angle = Math.atan2(y2 - y1, x2 - x1) - (upright ? Math.PI / 2 : 0);
    while (angle > Math.PI / 2 + 1e-9) { angle -= Math.PI; }
    while (angle <= -Math.PI / 2 + 1e-9) { angle += Math.PI; }
    if (Math.abs(angle) < 1e-6) { angle = 0; }
    var cos = Math.cos(angle), sin = Math.sin(angle);
    var cx = sx * (box[0] + box[2]) / 2, cy = sy * (box[1] + box[3]) / 2;
    var k = Math.sqrt(sx * sy);
    return { k: k, scaleX: sx / k, scaleY: sy / k, rotate: angle * 180 / Math.PI,
      x: ((x1 + x2) / 2 - (cos * cx - sin * cy)) / k, y: ((y1 + y2) / 2 - (sin * cx + cos * cy)) / k };
  }

  /* 뼈대 마디가 모두 가로·세로면 세로 마디의 x 자리와 가로 마디의 y 자리(0–1). 빗금·동그라미가 있거나 마디가 하나면 null */
  function axisStems(strokes) {
    var xs = [], ys = [], count = 0;
    var add = function (list, value) {
      if (!list.some(function (seen) { return Math.abs(seen - value) < 1e-6; })) { list.push(value); }
    };
    for (var i = 0; i < strokes.length; i += 1) {
      if (!Array.isArray(strokes[i])) { return null; }
      for (var j = 0; j < strokes[i].length; j += 1) {
        var piece = strokes[i][j];
        if (Math.abs(piece[0] - piece[2]) < 1e-6) { add(xs, piece[0]); } else if (Math.abs(piece[1] - piece[3]) < 1e-6) { add(ys, piece[1]); } else { return null; }
        count += 1;
      }
    }
    var order = function (a, b) { return a - b; };
    return count > 1 ? { xs: xs.sort(order), ys: ys.sort(order) } : null;
  }

  /* 한 축의 자르는 줄. 글자 잉크(화소, 바깥 한 화소 포함)에서 뼈대 마디 자리 가까이(글자 폭의 ±25%) 잉크가 가장 많은 획 띠를
   * 찾는다. 목표 쪽 띠는 그 마디 자리를 가운데로, 글자 획 두께가 글꼴 획 굵기가 되는 폭이다. 못 찾으면 null */
  function sliceAxis(profile, stem, positions, low0, high0, map, from, to, stroke) {
    var size = profile.length;
    var band = Math.max(1, Math.round(stem * 100));
    var prefix = [0];
    for (var i = 0; i < size; i += 1) { prefix.push(prefix[i] + profile[i]); }
    var glyph = [1], target = [from], last = 1;
    for (var n = 0; n < positions.length; n += 1) {
      /* 마디 자리는 이 조각 뼈대의 범위 안 비율로 — ㄲ의 왼쪽 ㄱ은 세로 마디가 ㄲ의 0.37이지만 그 ㄱ의 오른쪽 끝이다 */
      var share = high0 - low0 > 1e-6 ? (positions[n] - low0) / (high0 - low0) : 0.5;
      var expect = 1 + share * (size - 2 - band);
      var low = Math.max(last, Math.floor(expect - size * 0.25)), high = Math.min(size - 1 - band, Math.ceil(expect + size * 0.25));
      var most = 0, best = -1, at;
      for (at = low; at <= high; at += 1) { most = Math.max(most, prefix[at + band] - prefix[at]); }
      if (!most) { return null; }
      /* 잉크가 가장 많은 띠(5% 안은 같다고 보고 마디 자리에 가까운 쪽) */
      for (at = low; at <= high; at += 1) {
        if (prefix[at + band] - prefix[at] >= most * 0.95 && (best < 0 || Math.abs(at - expect) < Math.abs(best - expect))) { best = at; }
      }
      var half = band / 100 * (stroke / stem) / 2;
      glyph.push(best, best + band);
      target.push(map(positions[n]) - half, map(positions[n]) + half);
      last = best + band;
    }
    glyph.push(size - 1);
    target.push(to);
    return { glyph: glyph, target: target };
  }

  function slicedGlyphFit(measured, strokes, axes, stroke) {
    var stems = axisStems(strokes);
    var ink = measured.ink;
    if (!stems || !ink || !ink.stemX || !ink.stemY) { return null; }
    var region = strokesRegion(strokes, axes, stroke);
    if (!ink.columns) {
      /* 잉크 합은 글자마다 한 번(측정 캐시에 붙는다) */
      ink.columns = new Float64Array(ink.w); ink.rows = new Float64Array(ink.h);
      for (var y = 0; y < ink.h; y += 1) {
        for (var x = 0; x < ink.w; x += 1) { ink.columns[x] += ink.alpha[y * ink.w + x]; ink.rows[y] += ink.alpha[y * ink.w + x]; }
      }
    }
    var extent = strokesExtent(strokes);
    var cutX = sliceAxis(ink.columns, ink.stemX, stems.xs, extent[0], extent[2], axes.x, region[0], region[2], stroke);
    var cutY = sliceAxis(ink.rows, ink.stemY, stems.ys, extent[1], extent[3], axes.y, region[1], region[3], stroke);
    if (!cutX || !cutY) { return null; }
    var box = measured.box;
    var emX = function (px) { return box[0] - 0.01 + px / 100; };
    var emY = function (px) { return box[1] - 0.01 + px / 100; };
    var cells = [];
    for (var i = 0; i + 1 < cutX.glyph.length; i += 1) {
      for (var j = 0; j + 1 < cutY.glyph.length; j += 1) {
        var gx0 = cutX.glyph[i], gx1 = cutX.glyph[i + 1], gy0 = cutY.glyph[j], gy1 = cutY.glyph[j + 1];
        var tx0 = cutX.target[i], tx1 = cutX.target[i + 1], ty0 = cutY.target[j], ty1 = cutY.target[j + 1];
        if (gx1 - gx0 < 1 || gy1 - gy0 < 1 || tx1 - tx0 <= 1e-4 || ty1 - ty0 <= 1e-4) { continue; }
        var sum = 0;
        for (var row = gy0; row < gy1; row += 1) {
          for (var col = gx0; col < gx1; col += 1) { sum += ink.alpha[row * ink.w + col]; }
        }
        /* 칸 넓이의 3% 아래 잉크는 이웃 획의 번짐이다 */
        if (sum < 255 * Math.max(1, 0.03 * (gx1 - gx0) * (gy1 - gy0))) { continue; }
        var ex0 = emX(gx0), ex1 = emX(gx1), ey0 = emY(gy0), ey1 = emY(gy1);
        var sx = (tx1 - tx0) / (ex1 - ex0), sy = (ty1 - ty0) / (ey1 - ey0), k = Math.sqrt(sx * sy);
        /* 안쪽 자르는 줄은 이웃 칸과 반 화소 겹쳐 틈이 보이지 않게, 잉크 끝에 닿은 바깥쪽은 자르지 않는다(번진 가장자리를 남긴다) */
        var edge = 0.005;
        cells.push({ fit: { k: k, scaleX: sx / k, scaleY: sy / k, rotate: 0, x: (tx0 - sx * ex0) / k, y: (ty0 - sy * ey0) / k },
          clip: [gx0 > 1 ? ex0 - edge : box[0] - 1, gy0 > 1 ? ey0 - edge : box[1] - 1,
            gx1 < ink.w - 1 ? ex1 + edge : box[2] + 1, gy1 < ink.h - 1 ? ey1 + edge : box[3] + 1] });
      }
    }
    return cells.length ? cells : null;
  }

  function glyphFit(measured, target, strokes, axes, stroke, whole) {
    var segment = strokes && strokes.length === 1 && Array.isArray(strokes[0]) && strokes[0].length === 1 ? strokes[0][0] : null;
    if (segment) { return [{ fit: lineGlyphFit(measured, segment, axes, stroke), clip: null }]; }
    var sliced = strokes ? slicedGlyphFit(measured, strokes, axes, stroke) : null;
    if (sliced) { return sliced; }
    if (whole) { return [{ fit: containGlyph(measured.box, target), clip: null }]; }
    var fit = faceFit(measured.box, target);
    fit.rotate = 0;
    return [{ fit: fit, clip: null }];
  }

  function clearGlyphMapping(node) {
    Array.prototype.slice.call(node.querySelectorAll(':scope > [part="leaf"][data-fy-glyph-text]')).forEach(function (leaf) { leaf.remove(); });
    node.removeAttribute("data-fy-glyph-mapped");
    GLYPH_RENDER_KEYS.delete(node);
    var original = GLYPH_ORIGINALS.get(node);
    if (original !== undefined) {
      if (original) { node.style.setProperty("--fy-face-glyph", original); } else { node.style.removeProperty("--fy-face-glyph"); }
      GLYPH_ORIGINALS.delete(node);
    }
  }

  function applyGlyphMappings(host) {
    var state = STATE.get(host);
    var root = state && host.isConnected ? getManagedRoot(host) : null;
    if (!root) { return false; }
    var meta = state.options.fontMeta;
    var design = appliedDesign(meta);
    var summary = { mapped: 0, diagnostics: [] };
    var requested = false;
    var changed = false;
    Array.prototype.forEach.call(root.querySelectorAll('[part~="jamo"], [part="content"]'), function (node) {
      var style = computedStyleFor(node);
      var selection = readGlyphSelection(style);
      var text = node.dataset.jamo || node.dataset.fyStandalone || standaloneJamo(node.textContent);
      if (!text) { return; }
      var mapped = mappedDesignNode(node, text, design);
      var fail = function (code) {
        clearGlyphMapping(node);
        node.setAttribute("data-fy-glyph-status", code);
        summary.diagnostics.push({ jamo: text, code: code });
      };
      node.removeAttribute("data-fy-glyph-status");
      if ((!selection && !mapped) || (selection && selection.disabled)) {
        if (node.hasAttribute("data-fy-glyph-mapped")) { clearGlyphMapping(node); changed = true; }
        return;
      }
      requested = true;
      if (node.getAttribute("part") === "content") { node.setAttribute("data-fy-standalone", text); }
      if (selection && selection.error) { fail(selection.error); return; }
      var reference = inkBoxes(meta.inkBoxes);
      var expected = reference && reference[text];
      if (!expected || meta.material !== "system") { fail("GLYPH_UNSUPPORTED_FONT"); return; }
      if (node.getAttribute("data-fy-role") === "head") { fail("GLYPH_HEAD_UNSUPPORTED"); return; }
      if (fixedLayout(meta) && HANGUL_TABLES.splitJungseong[text] && !/jungseong-(base|tail)/.test(node.getAttribute("part") || "")) {
        fail("GLYPH_LAYOUT_UNSUPPORTED"); return;
      }
      var items = [];
      var env = { design: design, geometry: true, trace: [], seedValue: GLYPH_SEEDS.has(node) ? GLYPH_SEEDS.get(node) : null,
        candidate: selection && selection.candidate || null, pieces: meta.compositionPieces || "" };
      var skeleton = skeletonFor(node, text);
      if (selection && selection.text !== undefined) {
        var cssSourceId = "css";
        var cssSource = {familyCss: style.fontFamily || meta.family};
        if (design && design.mode === "font" && skeleton && skeleton.length) {
          var cssRequest = Object.assign({}, designRequests(node, skeleton, design)[0], {jamo: skeleton[0][0]});
          cssSourceId = requestSource(design, cssRequest, []);
          cssSource = design.sources[cssSourceId];
        }
        items.push({ drawing: selection.text, source: cssSourceId, path: [], glyph: {text: selection.text, candidate: null, selection: "css"},
          target: expected, fontSource: cssSource });
        env.trace.push({path: [], jamo: text, role: DESIGN_NODE_ROLES[node.getAttribute("data-fy-role")] || "standalone",
          source: cssSourceId, method: "direct", recipe: null, rules: [], result: "direct", status: "ok", diagnostic: null, glyph: items[0].glyph});
      } else if (design && design.mode === "font" && skeleton) {
        var requests = designRequests(node, skeleton, design);
        var code = text.charCodeAt(0);
        var context = code >= 0x11A8 && code <= 0x11FF ? "jong" : overBar(node) ? "bar" : "cho";
        skeleton.forEach(function (group, index) {
          planRequest(Object.assign({}, requests[index], {jamo: group[0], strokes: group[1], context: /[ㅏ-ㅣ]/.test(group[0]) ? "" : context, level: 0}), env, items);
        });
      } else { fail("GLYPH_CANDIDATE_MISSING"); return; }
      if (PLAN_TRACES && env.trace.length) { PLAN_TRACES.set(node, env.trace); }
      var problem = env.trace.filter(function (entry) {
        if (entry.status !== "error" && entry.status !== "pending") { return false; }
        return !env.trace.some(function (ancestor) {
          return ancestor.status === "degraded" && ancestor.path.length < entry.path.length &&
            ancestor.path.every(function (part, index) { return part === entry.path[index]; });
        });
      })[0];
      if (problem || !items.length || items.some(function (item) { return !item.drawing; })) {
        fail(problem && problem.diagnostic || "GLYPH_MAPPING_MISSING"); return;
      }
      var table = INK_BOXES[meta.inkBoxes];
      var axes = elementAxes(expected, table.stroke, table.stroke);
      var whole = items.length === 1;
      var ready = [];
      items.forEach(function (item) {
        var source = item.fontSource || design.sources[item.source];
        var measured = glyphInkBox(host.ownerDocument, source, item.drawing, style);
        if (measured.error) { problem = {diagnostic: measured.error}; return; }
        var target = item.target || (whole ? expected : strokesRegion(item.strokes, axes, table.stroke));
        var strokes = item.strokes || (whole && skeleton && skeleton.length === 1 ? skeleton[0][1] : null);
        ready.push({item: item, source: measured.source, cells: glyphFit(measured, target, strokes, axes, table.stroke, whole)});
      });
      if (problem) { fail(problem.diagnostic); return; }
      summary.mapped += 1;
      if (state.options.animate === "draw" || host.getAttribute("animate") === "draw") {
        summary.diagnostics.push({jamo: text, code: "GLYPH_STROKE_ANIMATION_UNSUPPORTED"});
        node.setAttribute("data-fy-glyph-status", "GLYPH_STROKE_ANIMATION_UNSUPPORTED");
      }
      var renderKey = JSON.stringify(ready);
      if (GLYPH_RENDER_KEYS.get(node) === renderKey && node.hasAttribute("data-fy-glyph-mapped")) { return; }
      clearGlyphMapping(node);
      GLYPH_RENDER_KEYS.set(node, renderKey);
      GLYPH_ORIGINALS.set(node, node.style.getPropertyValue("--fy-face-glyph"));
      ready.forEach(function (entry) {
        entry.cells.forEach(function (cell, index) {
          var leaf = host.ownerDocument.createElement("span");
          leaf.setAttribute("part", "leaf");
          leaf.setAttribute("lang", GLYPH_LANG);
          leaf.setAttribute("data-fy-glyph-text", entry.item.drawing);
          if (entry.item.glyph && entry.item.glyph.candidate) { leaf.setAttribute("data-fy-glyph-candidate", entry.item.glyph.candidate); }
          if (entry.cells.length > 1) { leaf.setAttribute("data-fy-glyph-slice", String(index)); }
          leaf.setAttribute("data-leaf-source", entry.item.source);
          leaf.setAttribute("data-leaf-path", entry.item.path.join("/"));
          leaf.textContent = entry.item.drawing;
          applyFontShape(leaf, entry.source);
          leaf.style.letterSpacing = entry.source.letterSpacing;
          leaf.style.wordSpacing = entry.source.wordSpacing;
          leaf.style.setProperty("--fy-leaf-size", round4(cell.fit.k) + "em");
          leaf.style.setProperty("--fy-leaf-scale-x", String(round4(cell.fit.scaleX)));
          leaf.style.setProperty("--fy-leaf-scale-y", String(round4(cell.fit.scaleY)));
          leaf.style.setProperty("--fy-leaf-x", round4(cell.fit.x) + "em"); leaf.style.setProperty("--fy-leaf-y", round4(cell.fit.y) + "em");
          if (cell.fit.rotate) { leaf.style.setProperty("--fy-leaf-rotate", round4(cell.fit.rotate) + "deg"); }
          if (cell.clip) {
            var c = cell.clip.map(function (value) { return round4(value) + "em"; });
            leaf.style.clipPath = "polygon(" + c[0] + " " + c[1] + ", " + c[2] + " " + c[1] + ", " + c[2] + " " + c[3] + ", " + c[0] + " " + c[3] + ")";
          }
          node.appendChild(leaf);
        });
      });
      node.style.setProperty("--fy-face-glyph", JSON.stringify(ready.map(function (entry) { return entry.item.drawing; }).join("")));
      node.setAttribute("data-fy-glyph-mapped", "");
      /* 네모꼴 나누기 맞춤이 이 노드의 조각 자리를 정했으면 새로 낸 잎에도(ADR-034 §5 — 맞춤 뒤에 잎을 다시 낼 수 있다) */
      applySquareLeafMap(node);
      changed = true;
    });
    if (requested) { GLYPH_RESULTS.set(host, summary); } else { GLYPH_RESULTS.delete(host); }
    return changed;
  }

  /* 글꼴 소스의 family·weight·style을 요소에 */
  function applyFontShape(element, source) {
    element.style.fontFamily = source.familyCss || designFamily(source);
    if (source.weight) {
      element.style.fontWeight = String(source.weight);
    }
    if (source.style) {
      element.style.fontStyle = source.style;
    }
    if (source.familyCss && source.stretch) { element.style.fontStretch = source.stretch; }
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
  var SKELETONS = {"ᄀ@cho":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.08,1,0.5,0]]]]],"ᄀ@bar":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᄁ@cho":[["ㄲ",[[[0,0,0.462,0,0.5,0.5],[0.462,0,0.462,0.271,0.5,0.5],[0.462,0.271,0.037,0.902,0.5,0]],[[0.556,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.592,1,0.5,0]]]]],"ᄁ@bar":[["ㄲ",[[[0,0,0.373,0,0.5,0.5],[0.373,0,0.373,1,0.5,0.5]],[[0.627,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᄂ@cho":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄂ@bar":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄃ@cho":[["ㄷ",[[[0,0,0.8,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄃ@bar":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄄ@cho":[["ㄸ",[[[0,0,0.288,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.36,1,0.5,0.5]],[[0.56,0,0.912,0,0.5,0.5]],[[0.56,0,0.56,1,0.5,0.5],[0.56,1,1,1,0.5,0.5]]]]],"ᄄ@bar":[["ㄸ",[[[0,0,0.394,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.394,1,0.5,0.5]],[[0.581,0,1,0,0.5,0.5]],[[0.581,0,0.581,0.975,0.5,0.5],[0.581,0.975,1,0.975,0.5,0.5]]]]],"ᄅ@cho":[["ㄹ",[[[0,0,0.74,0,0.5,0.5],[0.74,0,0.74,0.5,0.5,0.5]],[[0,0.5,0.74,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄅ@bar":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄆ@cho":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᄆ@bar":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᄇ@cho":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄇ@bar":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄈ@cho":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.337,0,0.337,1,0.5,0.5]],[[0,0.46,0.337,0.46,0,0]],[[0,1,0.337,1,0.5,0.5]],[[0.647,0,0.647,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.647,0.46,1,0.46,0,0]],[[0.647,1,1,1,0.5,0.5]]]]],"ᄈ@bar":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.376,0,0.376,1,0.5,0.5]],[[0,0.46,0.376,0.46,0,0]],[[0,1,0.376,1,0.5,0.5]],[[0.624,0,0.624,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.624,0.46,1,0.46,0,0]],[[0.624,1,1,1,0.5,0.5]]]]],"ᄉ@cho":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄉ@bar":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄊ@cho":[["ㅆ",[[[0.219,0.014,0,0.902,0.3,0]],[[0.145,0.316,0.439,0.902,0,0]],[[0.714,0,0.427,1,0.3,0]],[[0.616,0.34,1,1,0,0]]]]],"ᄊ@bar":[["ㅆ",[[[0.215,0.021,0,1,0.3,0]],[[0.142,0.354,0.431,1,0,0]],[[0.756,0,0.512,1,0.3,0]],[[0.673,0.34,1,1,0,0]]]]],"ᄋ@cho":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᄋ@bar":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᄌ@cho":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄌ@bar":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᄍ@cho":[["ㅉ",[[[0,0,0.439,0,0.5,0.5]],[[0.219,0,0,0.899,0.3,0]],[[0.145,0.306,0.439,0.899,0,0]],[[0.412,0,1,0,0.5,0.5]],[[0.706,0,0.412,1,0.3,0]],[[0.606,0.34,1,1,0,0]]]]],"ᄍ@bar":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,1,0.3,0]],[[0.147,0.34,0.445,1,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,1,0.3,0]],[[0.68,0.34,1,1,0,0]]]]],"ᄎ@cho":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᄎ@bar":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᄏ@cho":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.3,0.5,0.5],[1,0.3,0.08,1,0.5,0]],[[0,0.42,1,0.42,0.5,0]]]]],"ᄏ@bar":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ᄐ@cho":[["ㅌ",[[[0,0,0.82,0,0.5,0.5]],[[0,0.48,0.78,0.48,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄐ@bar":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᄑ@cho":[["ㅍ",[[[0.04,0,0.88,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.68,0,0.68,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄑ@bar":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᄒ@cho":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ᄒ@bar":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ᅡ":[["ㅏ",[[[0,0,0,1,0.5,0.5]],[[0,0.43,1,0.43,0,0.5]]]]],"ᅢ":[["ㅐ",[[[0,0,0,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅣ":[["ㅑ",[[[0,0,0,1,0.5,0.5]],[[0,0.29,1,0.29,0,0.5]],[[0,0.59,1,0.59,0,0.5]]]]],"ᅤ":[["ㅒ",[[[0,0,0,1,0.5,0.5]],[[0,0.3,1,0.3,0,0]],[[0,0.58,1,0.58,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅥ":[["ㅓ",[[[0,0.42,1,0.42,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅦ":[["ㅔ",[[[0,0.401,0.348,0.401,0.5,0]],[[0.348,0.01,0.348,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ᅧ":[["ㅕ",[[[0,0.27,1,0.27,0.5,0]],[[0,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅨ":[["ㅖ",[[[0.139,0.261,0.386,0.261,0.5,0]],[[0.139,0.55,0.386,0.55,0.5,0]],[[0.386,0.01,0.386,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ᅩ":[["ㅗ",[[[0.44,0,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ᅪ":[["ㅘ",[[[0.289,0.423,0.289,0.755,0.5,0]],[[0,0.755,0.643,0.755,0.5,0.5]],[[0.809,0,0.809,1,0.5,0.5]],[[0.809,0.43,1,0.43,0,0.5]]]]],"ᅫ":[["ㅙ",[[[0.255,0.443,0.255,0.745,0.5,0]],[[0,0.745,0.567,0.745,0.5,0.5]],[[0.729,0,0.729,1,0.5,0.5]],[[0.729,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅬ":[["ㅚ",[[[0.352,0.443,0.352,0.765,0.5,0]],[[0,0.765,0.782,0.765,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅭ":[["ㅛ",[[[0.3,0,0.3,1,0.5,0]],[[0.58,0,0.58,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ᅮ":[["ㅜ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0.5,1,0,0.5]]]]],"ᅯ":[["ㅝ",[[[0,0.511,0.775,0.511,0.5,0.5]],[[0.372,0.511,0.372,0.941,0,0.5]],[[0.695,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ᅰ":[["ㅞ",[[[0,0.501,0.579,0.501,0.5,0.5]],[[0.278,0.501,0.278,0.912,0,0.5]],[[0.525,0.554,0.749,0.554,0.5,0]],[[0.749,0.02,0.749,0.941,0.5,0.5]],[[0.996,0,0.996,1,0.5,0.5]]]]],"ᅱ":[["ㅟ",[[[0,0.541,0.797,0.541,0.5,0.5]],[[0.383,0.541,0.383,0.961,0,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅲ":[["ㅠ",[[[0,0,1,0,0.5,0.5]],[[0.3,0,0.3,1,0,0.5]],[[0.69,0,0.69,1,0,0.5]]]]],"ᅳ":[["ㅡ",[[[0,0.5,1,0.5,0.5,0.5]]]]],"ᅴ":[["ㅢ",[[[0,0.721,0.782,0.721,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ᅵ":[["ㅣ",[[[0.5,0,0.5,1,0.5,0.5]]]]],"ᆨ":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆩ":[["ㄲ",[[[0,0,0.389,0,0.5,0.5],[0.389,0,0.389,1,0.5,0.5]],[[0.611,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆪ":[["ㄳ",[[[0,0,0.327,0,0.5,0.5],[0.327,0,0.327,1,0.5,0.5]],[[0.748,0,0.496,1,0.3,0]],[[0.662,0.34,1,1,0,0]]]]],"ᆫ":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆬ":[["ㄵ",[[[0,0.03,0,0.909,0.5,0.5],[0,0.909,0.346,0.909,0.5,0.5]],[[0.442,0,1,0,0.5,0.5]],[[0.721,0,0.442,1,0.3,0]],[[0.626,0.34,1,1,0,0]]]]],"ᆭ":[["ㄶ",[[[0,0.143,0,0.971,0.5,0.5],[0,0.971,0.317,0.971,0.5,0.5]],[[0.6,0,0.828,0,0.5,0.5]],[[0.428,0.27,1,0.27,0.5,0.5]],{"ring":[0.714,0.71,0.229,0.29]}]]],"ᆮ":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆯ":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᆰ":[["ㄺ",[[[0,0,0.541,0,0.5,0.5],[0.541,0,0.541,0.486,0.5,0.5]],[[0,0.486,0.541,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.541,0.971,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆱ":[["ㄻ",[[[0,0,0.428,0,0.5,0.5],[0.428,0,0.428,0.5,0.5,0.5]],[[0,0.5,0.428,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.428,1,0.5,0.5]],[[0.631,0,0.631,1,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0.631,1,1,1,0.5,0.5]]]]],"ᆲ":[["ㄼ",[[[0,0.029,0.413,0.029,0.5,0.5],[0.413,0.029,0.413,0.514,0.5,0.5]],[[0,0.514,0.413,0.514,0.5,0.5]],[[0,0.514,0,1,0.5,0.5],[0,1,0.413,1,0.5,0.5]],[[0.617,0,0.617,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.617,0.46,1,0.46,0,0]],[[0.617,1,1,1,0.5,0.5]]]]],"ᆳ":[["ㄽ",[[[0,0,0.383,0,0.5,0.5],[0.383,0,0.383,0.486,0.5,0.5]],[[0,0.486,0.383,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.383,0.971,0.5,0.5]],[[0.757,0,0.515,1,0.3,0]],[[0.675,0.34,1,1,0,0]]]]],"ᆴ":[["ㄾ",[[[0,0,0.421,0,0.5,0.5],[0.421,0,0.421,0.5,0.5,0.5]],[[0,0.5,0.421,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.421,1,0.5,0.5]],[[0.622,0,1,0,0.5,0.5]],[[0.622,0.5,0.977,0.5,0,0.5]],[[0.622,0,0.622,1,0.5,0.5],[0.622,1,1,1,0.5,0.5]]]]],"ᆵ":[["ㄿ",[[[0,0,0.376,0,0.5,0.5],[0.376,0,0.376,0.5,0.5,0.5]],[[0,0.5,0.376,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.376,1,0.5,0.5]],[[0.542,0,1,0,0.5,0.5]],[[0.666,0,0.666,1,0,0]],[[0.876,0,0.876,1,0,0]],[[0.542,1,1,1,0.5,0.5]]]]],"ᆶ":[["ㅀ",[[[0,0.125,0.407,0.125,0.5,0.5],[0.407,0.125,0.407,0.537,0.5,0.5]],[[0,0.537,0.407,0.537,0.5,0.5]],[[0,0.537,0,0.949,0.5,0.5],[0,0.949,0.407,0.949,0.5,0.5]],[[0.67,0,0.859,0,0.5,0.5]],[[0.529,0.27,1,0.27,0.5,0.5]],{"ring":[0.764,0.71,0.189,0.29]}]]],"ᆷ":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ᆸ":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᆹ":[["ㅄ",[[[0,0.029,0,1,0.5,0.5]],[[0.357,0.029,0.357,1,0.5,0.5]],[[0,0.475,0.357,0.475,0,0]],[[0,1,0.357,1,0.5,0.5]],[[0.751,0,0.502,1,0.3,0]],[[0.667,0.34,1,1,0,0]]]]],"ᆺ":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᆻ":[["ㅆ",[[[0.223,0.033,0,0.967,0.3,0]],[[0.147,0.351,0.446,0.967,0,0]],[[0.742,0,0.483,1,0.3,0]],[[0.654,0.34,1,1,0,0]]]]],"ᆼ":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ᆽ":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ᆾ":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ᆿ":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ᇀ":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ᇁ":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ᇂ":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ᆪ@sebeol":[["ㄳ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,1,0.5,0.5]],[[0.78,0,0.56,1,0.3,0]],[[0.705,0.34,1,1,0,0]]]]],"ᆬ@sebeol":[["ㄵ",[[[0,0.03,0,0.909,0.5,0.5],[0,0.909,0.44,0.909,0.5,0.5]],[[0.56,0,1,0,0.5,0.5]],[[0.78,0,0.56,1,0.3,0]],[[0.705,0.34,1,1,0,0]]]]],"ᆭ@sebeol":[["ㄶ",[[[0,0.143,0,0.971,0.5,0.5],[0,0.971,0.44,0.971,0.5,0.5]],[[0.692,0,0.868,0,0.5,0.5]],[[0.56,0.27,1,0.27,0.5,0.5]],{"ring":[0.78,0.71,0.176,0.29]}]]],"ᆰ@sebeol":[["ㄺ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,0.486,0.5,0.5]],[[0,0.486,0.44,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.44,0.971,0.5,0.5]],[[0.56,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ᆱ@sebeol":[["ㄻ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,0.5,0.5,0.5]],[[0,0.5,0.44,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.44,1,0.5,0.5]],[[0.56,0,0.56,1,0.5,0.5]],[[0.56,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0.56,1,1,1,0.5,0.5]]]]],"ᆲ@sebeol":[["ㄼ",[[[0,0.029,0.44,0.029,0.5,0.5],[0.44,0.029,0.44,0.514,0.5,0.5]],[[0,0.514,0.44,0.514,0.5,0.5]],[[0,0.514,0,1,0.5,0.5],[0,1,0.44,1,0.5,0.5]],[[0.56,0,0.56,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.56,0.46,1,0.46,0,0]],[[0.56,1,1,1,0.5,0.5]]]]],"ᆳ@sebeol":[["ㄽ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,0.486,0.5,0.5]],[[0,0.486,0.44,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.44,0.971,0.5,0.5]],[[0.78,0,0.56,1,0.3,0]],[[0.705,0.34,1,1,0,0]]]]],"ᆴ@sebeol":[["ㄾ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,0.5,0.5,0.5]],[[0,0.5,0.44,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.44,1,0.5,0.5]],[[0.56,0,1,0,0.5,0.5]],[[0.56,0.5,0.973,0.5,0,0.5]],[[0.56,0,0.56,1,0.5,0.5],[0.56,1,1,1,0.5,0.5]]]]],"ᆵ@sebeol":[["ㄿ",[[[0,0,0.44,0,0.5,0.5],[0.44,0,0.44,0.5,0.5,0.5]],[[0,0.5,0.44,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.44,1,0.5,0.5]],[[0.56,0,1,0,0.5,0.5]],[[0.679,0,0.679,1,0,0]],[[0.881,0,0.881,1,0,0]],[[0.56,1,1,1,0.5,0.5]]]]],"ᆶ@sebeol":[["ㅀ",[[[0,0.125,0.44,0.125,0.5,0.5],[0.44,0.125,0.44,0.537,0.5,0.5]],[[0,0.537,0.44,0.537,0.5,0.5]],[[0,0.537,0,0.949,0.5,0.5],[0,0.949,0.44,0.949,0.5,0.5]],[[0.692,0,0.868,0,0.5,0.5]],[[0.56,0.27,1,0.27,0.5,0.5]],{"ring":[0.78,0.71,0.177,0.29]}]]],"ᆹ@sebeol":[["ㅄ",[[[0,0.029,0,1,0.5,0.5]],[[0.44,0.029,0.44,1,0.5,0.5]],[[0,0.475,0.44,0.475,0,0]],[[0,1,0.44,1,0.5,0.5]],[[0.78,0,0.56,1,0.3,0]],[[0.706,0.34,1,1,0,0]]]]],"ㄱ":[["ㄱ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄲ":[["ㄲ",[[[0,0,0.389,0,0.5,0.5],[0.389,0,0.389,1,0.5,0.5]],[[0.611,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄳ":[["ㄳ",[[[0,0,0.327,0,0.5,0.5],[0.327,0,0.327,1,0.5,0.5]],[[0.748,0,0.496,1,0.3,0]],[[0.662,0.34,1,1,0,0]]]]],"ㄴ":[["ㄴ",[[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄵ":[["ㄵ",[[[0,0.03,0,0.909,0.5,0.5],[0,0.909,0.346,0.909,0.5,0.5]],[[0.442,0,1,0,0.5,0.5]],[[0.721,0,0.442,1,0.3,0]],[[0.626,0.34,1,1,0,0]]]]],"ㄶ":[["ㄶ",[[[0,0.143,0,0.971,0.5,0.5],[0,0.971,0.317,0.971,0.5,0.5]],[[0.6,0,0.828,0,0.5,0.5]],[[0.428,0.27,1,0.27,0.5,0.5]],{"ring":[0.714,0.71,0.229,0.29]}]]],"ㄷ":[["ㄷ",[[[0,0,1,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄸ":[["ㄸ",[[[0,0,0.394,0,0.5,0.5]],[[0,0,0,1,0.5,0.5],[0,1,0.394,1,0.5,0.5]],[[0.581,0,1,0,0.5,0.5]],[[0.581,0,0.581,0.975,0.5,0.5],[0.581,0.975,1,0.975,0.5,0.5]]]]],"ㄹ":[["ㄹ",[[[0,0,1,0,0.5,0.5],[1,0,1,0.5,0.5,0.5]],[[0,0.5,1,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㄺ":[["ㄺ",[[[0,0,0.541,0,0.5,0.5],[0.541,0,0.541,0.486,0.5,0.5]],[[0,0.486,0.541,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.541,0.971,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]]]]],"ㄻ":[["ㄻ",[[[0,0,0.428,0,0.5,0.5],[0.428,0,0.428,0.5,0.5,0.5]],[[0,0.5,0.428,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.428,1,0.5,0.5]],[[0.631,0,0.631,1,0.5,0.5]],[[0.631,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0.631,1,1,1,0.5,0.5]]]]],"ㄼ":[["ㄼ",[[[0,0.029,0.413,0.029,0.5,0.5],[0.413,0.029,0.413,0.514,0.5,0.5]],[[0,0.514,0.413,0.514,0.5,0.5]],[[0,0.514,0,1,0.5,0.5],[0,1,0.413,1,0.5,0.5]],[[0.617,0,0.617,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.617,0.46,1,0.46,0,0]],[[0.617,1,1,1,0.5,0.5]]]]],"ㄽ":[["ㄽ",[[[0,0,0.383,0,0.5,0.5],[0.383,0,0.383,0.486,0.5,0.5]],[[0,0.486,0.383,0.486,0.5,0.5]],[[0,0.486,0,0.971,0.5,0.5],[0,0.971,0.383,0.971,0.5,0.5]],[[0.757,0,0.515,1,0.3,0]],[[0.675,0.34,1,1,0,0]]]]],"ㄾ":[["ㄾ",[[[0,0,0.421,0,0.5,0.5],[0.421,0,0.421,0.5,0.5,0.5]],[[0,0.5,0.421,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.421,1,0.5,0.5]],[[0.622,0,1,0,0.5,0.5]],[[0.622,0.5,0.977,0.5,0,0.5]],[[0.622,0,0.622,1,0.5,0.5],[0.622,1,1,1,0.5,0.5]]]]],"ㄿ":[["ㄿ",[[[0,0,0.376,0,0.5,0.5],[0.376,0,0.376,0.5,0.5,0.5]],[[0,0.5,0.376,0.5,0.5,0.5]],[[0,0.5,0,1,0.5,0.5],[0,1,0.376,1,0.5,0.5]],[[0.542,0,1,0,0.5,0.5]],[[0.666,0,0.666,1,0,0]],[[0.876,0,0.876,1,0,0]],[[0.542,1,1,1,0.5,0.5]]]]],"ㅀ":[["ㅀ",[[[0,0.125,0.407,0.125,0.5,0.5],[0.407,0.125,0.407,0.537,0.5,0.5]],[[0,0.537,0.407,0.537,0.5,0.5]],[[0,0.537,0,0.949,0.5,0.5],[0,0.949,0.407,0.949,0.5,0.5]],[[0.67,0,0.859,0,0.5,0.5]],[[0.529,0.27,1,0.27,0.5,0.5]],{"ring":[0.764,0.71,0.189,0.29]}]]],"ㅁ":[["ㅁ",[[[0,0,0,1,0.5,0.5]],[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,1,1,1,0.5,0.5]]]]],"ㅂ":[["ㅂ",[[[0,0,0,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅃ":[["ㅃ",[[[0,0,0,1,0.5,0.5]],[[0.376,0,0.376,1,0.5,0.5]],[[0,0.46,0.376,0.46,0,0]],[[0,1,0.376,1,0.5,0.5]],[[0.624,0,0.624,1,0.5,0.5]],[[1,0,1,1,0.5,0.5]],[[0.624,0.46,1,0.46,0,0]],[[0.624,1,1,1,0.5,0.5]]]]],"ㅄ":[["ㅄ",[[[0,0.029,0,1,0.5,0.5]],[[0.357,0.029,0.357,1,0.5,0.5]],[[0,0.475,0.357,0.475,0,0]],[[0,1,0.357,1,0.5,0.5]],[[0.751,0,0.502,1,0.3,0]],[[0.667,0.34,1,1,0,0]]]]],"ㅅ":[["ㅅ",[[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ㅆ":[["ㅆ",[[[0.223,0.033,0,0.967,0.3,0]],[[0.147,0.351,0.446,0.967,0,0]],[[0.742,0,0.483,1,0.3,0]],[[0.654,0.34,1,1,0,0]]]]],"ㅇ":[["ㅇ",[{"ring":[0.5,0.5,0.5,0.5]}]]],"ㅈ":[["ㅈ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0,1,0.3,0]],[[0.33,0.34,1,1,0,0]]]]],"ㅉ":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,1,0.3,0]],[[0.147,0.34,0.445,1,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,1,0.3,0]],[[0.68,0.34,1,1,0,0]]]]],"ㅊ":[["ㅊ",[[[0.28,0,0.72,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],[[0.5,0.27,0,1,0,0]],[[0.33,0.518,1,1,0,0]]]]],"ㅋ":[["ㅋ",[[[0,0,1,0,0.5,0.5],[1,0,1,1,0.5,0.5]],[[0,0.48,1,0.48,0.5,0]]]]],"ㅌ":[["ㅌ",[[[0,0,1,0,0.5,0.5]],[[0,0.5,0.94,0.5,0,0.5]],[[0,0,0,1,0.5,0.5],[0,1,1,1,0.5,0.5]]]]],"ㅍ":[["ㅍ",[[[0,0,1,0,0.5,0.5]],[[0.27,0,0.27,1,0,0]],[[0.73,0,0.73,1,0,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅎ":[["ㅎ",[[[0.3,0,0.7,0,0.5,0.5]],[[0,0.27,1,0.27,0.5,0.5]],{"ring":[0.5,0.71,0.4,0.29]}]]],"ㅏ":[["ㅏ",[[[0,0,0,1,0.5,0.5]],[[0,0.43,1,0.43,0,0.5]]]]],"ㅐ":[["ㅐ",[[[0,0,0,1,0.5,0.5]],[[0,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅑ":[["ㅑ",[[[0,0,0,1,0.5,0.5]],[[0,0.29,1,0.29,0,0.5]],[[0,0.59,1,0.59,0,0.5]]]]],"ㅒ":[["ㅒ",[[[0,0,0,1,0.5,0.5]],[[0,0.3,1,0.3,0,0]],[[0,0.58,1,0.58,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅓ":[["ㅓ",[[[0,0.42,1,0.42,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅔ":[["ㅔ",[[[0,0.401,0.348,0.401,0.5,0]],[[0.348,0.01,0.348,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ㅕ":[["ㅕ",[[[0,0.27,1,0.27,0.5,0]],[[0,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅖ":[["ㅖ",[[[0.139,0.261,0.386,0.261,0.5,0]],[[0.139,0.55,0.386,0.55,0.5,0]],[[0.386,0.01,0.386,0.941,0.5,0.5]],[[1,0,1,1,0.5,0.5]]]]],"ㅗ":[["ㅗ",[[[0.44,0,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅘ":[["ㅘ",[[[0.289,0.423,0.289,0.755,0.5,0]],[[0,0.755,0.643,0.755,0.5,0.5]],[[0.809,0,0.809,1,0.5,0.5]],[[0.809,0.43,1,0.43,0,0.5]]]]],"ㅙ":[["ㅙ",[[[0.255,0.443,0.255,0.745,0.5,0]],[[0,0.745,0.567,0.745,0.5,0.5]],[[0.729,0,0.729,1,0.5,0.5]],[[0.729,0.46,1,0.46,0,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅚ":[["ㅚ",[[[0.352,0.443,0.352,0.765,0.5,0]],[[0,0.765,0.782,0.765,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅛ":[["ㅛ",[[[0.3,0,0.3,1,0.5,0]],[[0.58,0,0.58,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"ㅜ":[["ㅜ",[[[0,0,1,0,0.5,0.5]],[[0.5,0,0.5,1,0,0.5]]]]],"ㅝ":[["ㅝ",[[[0,0.511,0.775,0.511,0.5,0.5]],[[0.372,0.511,0.372,0.941,0,0.5]],[[0.695,0.58,1,0.58,0.5,0]],[[1,0,1,1,0.5,0.5]]]]],"ㅞ":[["ㅞ",[[[0,0.501,0.579,0.501,0.5,0.5]],[[0.278,0.501,0.278,0.912,0,0.5]],[[0.525,0.554,0.749,0.554,0.5,0]],[[0.749,0.02,0.749,0.941,0.5,0.5]],[[0.996,0,0.996,1,0.5,0.5]]]]],"ㅟ":[["ㅟ",[[[0,0.541,0.797,0.541,0.5,0.5]],[[0.383,0.541,0.383,0.961,0,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅠ":[["ㅠ",[[[0,0,1,0,0.5,0.5]],[[0.3,0,0.3,1,0,0.5]],[[0.69,0,0.69,1,0,0.5]]]]],"ㅡ":[["ㅡ",[[[0,0.5,1,0.5,0.5,0.5]]]]],"ㅢ":[["ㅢ",[[[0,0.721,0.782,0.721,0.5,0.5]],[[0.995,0,0.995,1,0.5,0.5]]]]],"ㅣ":[["ㅣ",[[[0.5,0,0.5,1,0.5,0.5]]]]],"고":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.497,0.5,0.5]]]],["ㅗ",[[[0.44,0.645,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"구":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.476,0.5,0.5]]]],["ㅜ",[[[0,0.618,1,0.618,0.5,0.5]],[[0.5,0.618,0.5,1,0,0.5]]]]],"그":[["ㄱ",[[[0.109,0,0.837,0,0.5,0.5],[0.837,0,0.837,0.771,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"꼬":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.483,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.483,0.5,0.5]]]],["ㅗ",[[[0.44,0.635,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"꾸":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.462,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.462,0.5,0.5]]]],["ㅜ",[[[0,0.607,1,0.607,0.5,0.5]],[[0.5,0.607,0.5,1,0,0.5]]]]],"끄":[["ㄲ",[[[0.088,0,0.379,0,0.5,0.5],[0.379,0,0.379,0.761,0.5,0.5]],[[0.577,0,0.869,0,0.5,0.5],[0.869,0,0.869,0.761,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"노":[["ㄴ",[[[0.142,0,0.142,0.395,0.5,0.5],[0.142,0.395,0.869,0.395,0.5,0.5]]]],["ㅗ",[[[0.44,0.573,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"누":[["ㄴ",[[[0.142,0,0.142,0.375,0.5,0.5],[0.142,0.375,0.869,0.375,0.5,0.5]]]],["ㅜ",[[[0,0.544,1,0.544,0.5,0.5]],[[0.5,0.544,0.5,1,0,0.5]]]]],"느":[["ㄴ",[[[0.142,0,0.142,0.69,0.5,0.5],[0.142,0.69,0.869,0.69,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"도":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.437,0.5,0.5],[0.142,0.437,0.869,0.437,0.5,0.5]]]],["ㅗ",[[[0.44,0.603,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"두":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.416,0.5,0.5],[0.142,0.416,0.869,0.416,0.5,0.5]]]],["ㅜ",[[[0,0.574,1,0.574,0.5,0.5]],[[0.5,0.574,0.5,1,0,0.5]]]]],"드":[["ㄷ",[[[0.142,0,0.869,0,0.5,0.5]],[[0.142,0,0.142,0.725,0.5,0.5],[0.142,0.725,0.869,0.725,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"또":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.425,0.5,0.5],[0.098,0.425,0.423,0.425,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.415,0.5,0.5],[0.577,0.415,0.923,0.415,0.5,0.5]]]],["ㅗ",[[[0.44,0.594,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"뚜":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.405,0.5,0.5],[0.098,0.405,0.423,0.405,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.395,0.5,0.5],[0.577,0.395,0.923,0.395,0.5,0.5]]]],["ㅜ",[[[0,0.566,1,0.566,0.5,0.5]],[[0.5,0.566,0.5,1,0,0.5]]]]],"뜨":[["ㄸ",[[[0.098,0,0.423,0,0.5,0.5]],[[0.098,0,0.098,0.716,0.5,0.5],[0.098,0.716,0.423,0.716,0.5,0.5]],[[0.577,0,0.923,0,0.5,0.5]],[[0.577,0,0.577,0.698,0.5,0.5],[0.577,0.698,0.923,0.698,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"로":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.237,0.5,0.5]],[[0.131,0.237,0.891,0.237,0.5,0.5]],[[0.131,0.237,0.131,0.474,0.5,0.5],[0.131,0.474,0.891,0.474,0.5,0.5]]]],["ㅗ",[[[0.44,0.629,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"루":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.226,0.5,0.5]],[[0.131,0.226,0.891,0.226,0.5,0.5]],[[0.131,0.226,0.131,0.453,0.5,0.5],[0.131,0.453,0.891,0.453,0.5,0.5]]]],["ㅜ",[[[0,0.601,1,0.601,0.5,0.5]],[[0.5,0.601,0.5,1,0,0.5]]]]],"르":[["ㄹ",[[[0.131,0,0.891,0,0.5,0.5],[0.891,0,0.891,0.377,0.5,0.5]],[[0.131,0.377,0.891,0.377,0.5,0.5]],[[0.131,0.377,0.131,0.754,0.5,0.5],[0.131,0.754,0.891,0.754,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"모":[["ㅁ",[[[0.142,0,0.142,0.431,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.431,0.5,0.5]],[[0.142,0.431,0.859,0.431,0.5,0.5]]]],["ㅗ",[[[0.44,0.599,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"무":[["ㅁ",[[[0.142,0,0.142,0.411,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.411,0.5,0.5]],[[0.142,0.411,0.859,0.411,0.5,0.5]]]],["ㅜ",[[[0,0.57,1,0.57,0.5,0.5]],[[0.5,0.57,0.5,1,0,0.5]]]]],"므":[["ㅁ",[[[0.142,0,0.142,0.72,0.5,0.5]],[[0.142,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.72,0.5,0.5]],[[0.142,0.72,0.859,0.72,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"보":[["ㅂ",[[[0.131,0,0.131,0.454,0.5,0.5]],[[0.859,0,0.859,0.454,0.5,0.5]],[[0.131,0.209,0.859,0.209,0,0]],[[0.131,0.454,0.859,0.454,0.5,0.5]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"부":[["ㅂ",[[[0.131,0,0.131,0.433,0.5,0.5]],[[0.859,0,0.859,0.433,0.5,0.5]],[[0.131,0.199,0.859,0.199,0,0]],[[0.131,0.433,0.859,0.433,0.5,0.5]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"브":[["ㅂ",[[[0.131,0,0.131,0.738,0.5,0.5]],[[0.859,0,0.859,0.738,0.5,0.5]],[[0.131,0.34,0.859,0.34,0,0]],[[0.131,0.738,0.859,0.738,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"뽀":[["ㅃ",[[[0.098,0,0.098,0.448,0.5,0.5]],[[0.4,0,0.4,0.448,0.5,0.5]],[[0.098,0.206,0.4,0.206,0,0]],[[0.098,0.448,0.4,0.448,0.5,0.5]],[[0.6,0,0.6,0.448,0.5,0.5]],[[0.902,0,0.902,0.448,0.5,0.5]],[[0.6,0.206,0.902,0.206,0,0]],[[0.6,0.448,0.902,0.448,0.5,0.5]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"뿌":[["ㅃ",[[[0.098,0,0.098,0.427,0.5,0.5]],[[0.4,0,0.4,0.427,0.5,0.5]],[[0.098,0.197,0.4,0.197,0,0]],[[0.098,0.427,0.4,0.427,0.5,0.5]],[[0.6,0,0.6,0.427,0.5,0.5]],[[0.902,0,0.902,0.427,0.5,0.5]],[[0.6,0.197,0.902,0.197,0,0]],[[0.6,0.427,0.902,0.427,0.5,0.5]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"쁘":[["ㅃ",[[[0.098,0,0.098,0.734,0.5,0.5]],[[0.4,0,0.4,0.734,0.5,0.5]],[[0.098,0.338,0.4,0.338,0,0]],[[0.098,0.734,0.4,0.734,0.5,0.5]],[[0.6,0,0.6,0.734,0.5,0.5]],[[0.902,0,0.902,0.734,0.5,0.5]],[[0.6,0.338,0.902,0.338,0,0]],[[0.6,0.734,0.902,0.734,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"소":[["ㅅ",[[[0.5,0,0.043,0.454,0.3,0]],[[0.345,0.154,0.957,0.454,0,0]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"수":[["ㅅ",[[[0.5,0,0.043,0.433,0.3,0]],[[0.345,0.147,0.957,0.433,0,0]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"스":[["ㅅ",[[[0.5,0,0.043,0.738,0.3,0]],[[0.345,0.251,0.957,0.738,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"쏘":[["ㅆ",[[[0.228,0.01,0.022,0.459,0.3,0]],[[0.158,0.163,0.434,0.459,0,0]],[[0.745,0,0.512,0.459,0.3,0]],[[0.666,0.156,0.978,0.459,0,0]]]],["ㅗ",[[[0.44,0.618,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쑤":[["ㅆ",[[[0.228,0.009,0.022,0.438,0.3,0]],[[0.158,0.155,0.434,0.438,0,0]],[[0.745,0,0.512,0.438,0.3,0]],[[0.666,0.149,0.978,0.438,0,0]]]],["ㅜ",[[[0,0.59,1,0.59,0.5,0.5]],[[0.5,0.59,0.5,1,0,0.5]]]]],"쓰":[["ㅆ",[[[0.228,0.016,0.022,0.743,0.3,0]],[[0.158,0.263,0.434,0.743,0,0]],[[0.745,0,0.512,0.743,0.3,0]],[[0.666,0.253,0.978,0.743,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"오":[["ㅇ",[{"ring":[0.5,0.227,0.391,0.227]}]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"우":[["ㅇ",[{"ring":[0.5,0.216,0.391,0.216]}]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"으":[["ㅇ",[{"ring":[0.5,0.369,0.391,0.369]}]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"조":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.453,0.3,0]],[[0.345,0.154,0.957,0.453,0,0]]]],["ㅗ",[[[0.44,0.614,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"주":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.432,0.3,0]],[[0.345,0.147,0.957,0.432,0,0]]]],["ㅜ",[[[0,0.586,1,0.586,0.5,0.5]],[[0.5,0.586,0.5,1,0,0.5]]]]],"즈":[["ㅈ",[[[0.043,0,0.957,0,0.5,0.5]],[[0.5,0,0.043,0.738,0.3,0]],[[0.345,0.251,0.957,0.738,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"쪼":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.448,0.3,0]],[[0.147,0.152,0.445,0.448,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.448,0.3,0]],[[0.68,0.152,1,0.448,0,0]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쭈":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.427,0.3,0]],[[0.147,0.145,0.445,0.427,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.427,0.3,0]],[[0.68,0.145,1,0.427,0,0]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"쯔":[["ㅉ",[[[0,0,0.445,0,0.5,0.5]],[[0.222,0,0,0.734,0.3,0]],[[0.147,0.25,0.445,0.734,0,0]],[[0.523,0,1,0,0.5,0.5]],[[0.762,0,0.523,0.734,0.3,0]],[[0.68,0.25,1,0.734,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"초":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.137,0.946,0.137,0.5,0.5]],[[0.5,0.137,0.054,0.506,0,0]],[[0.348,0.262,0.946,0.506,0,0]]]],["ㅗ",[[[0.44,0.652,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"추":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.131,0.946,0.131,0.5,0.5]],[[0.5,0.131,0.054,0.485,0,0]],[[0.348,0.251,0.946,0.485,0,0]]]],["ㅜ",[[[0,0.624,1,0.624,0.5,0.5]],[[0.5,0.624,0.5,1,0,0.5]]]]],"츠":[["ㅊ",[[[0.304,0,0.696,0,0.5,0.5]],[[0.054,0.21,0.946,0.21,0.5,0.5]],[[0.5,0.21,0.054,0.777,0,0]],[[0.348,0.403,0.946,0.777,0,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"코":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.515,0.5,0.5]],[[0.098,0.247,0.859,0.247,0.5,0]]]],["ㅗ",[[[0.44,0.657,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"쿠":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.493,0.5,0.5]],[[0.098,0.237,0.859,0.237,0.5,0]]]],["ㅜ",[[[0,0.63,1,0.63,0.5,0.5]],[[0.5,0.63,0.5,1,0,0.5]]]]],"크":[["ㅋ",[[[0.098,0,0.859,0,0.5,0.5],[0.859,0,0.859,0.783,0.5,0.5]],[[0.098,0.376,0.859,0.376,0.5,0]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"토":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.232,0.825,0.232,0,0.5]],[[0.131,0,0.131,0.464,0.5,0.5],[0.131,0.464,0.869,0.464,0.5,0.5]]]],["ㅗ",[[[0.44,0.621,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"투":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.221,0.825,0.221,0,0.5]],[[0.131,0,0.131,0.443,0.5,0.5],[0.131,0.443,0.869,0.443,0.5,0.5]]]],["ㅜ",[[[0,0.593,1,0.593,0.5,0.5]],[[0.5,0.593,0.5,1,0,0.5]]]]],"트":[["ㅌ",[[[0.131,0,0.869,0,0.5,0.5]],[[0.131,0.373,0.825,0.373,0,0.5]],[[0.131,0,0.131,0.746,0.5,0.5],[0.131,0.746,0.869,0.746,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"포":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.448,0,0]],[[0.677,0,0.677,0.448,0,0]],[[0.098,0.448,0.891,0.448,0.5,0.5]]]],["ㅗ",[[[0.44,0.611,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"푸":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.427,0,0]],[[0.677,0,0.677,0.427,0,0]],[[0.098,0.427,0.891,0.427,0.5,0.5]]]],["ㅜ",[[[0,0.582,1,0.582,0.5,0.5]],[[0.5,0.582,0.5,1,0,0.5]]]]],"프":[["ㅍ",[[[0.098,0,0.891,0,0.5,0.5]],[[0.312,0,0.312,0.734,0,0]],[[0.677,0,0.677,0.734,0,0]],[[0.098,0.734,0.891,0.734,0.5,0.5]]]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]],"호":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.14,0.923,0.14,0.5,0.5]],{"ring":[0.494,0.368,0.343,0.15]}]],["ㅗ",[[[0.44,0.66,0.44,1,0.5,0]],[[0,1,1,1,0.5,0.5]]]]],"후":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.134,0.923,0.134,0.5,0.5]],{"ring":[0.494,0.353,0.343,0.144]}]],["ㅜ",[[[0,0.633,1,0.633,0.5,0.5]],[[0.5,0.633,0.5,1,0,0.5]]]]],"흐":[["ㅎ",[[[0.323,0,0.666,0,0.5,0.5]],[[0.066,0.212,0.923,0.212,0.5,0.5]],{"ring":[0.494,0.558,0.343,0.228]}]],["ㅡ",[[[0,1,1,1,0.5,0.5]]]]]};
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
    /* 배치가 정한 그림 문맥(세벌식 겹받침 @sebeol, ADR-028 §4) — 그 뼈대가 있을 때만 */
    var draw = typeof node.getAttribute === "function" ? node.getAttribute("data-fy-draw") : null;
    return (draw && SKELETONS[text + "@" + draw]) || SKELETONS[text] || null;
  }

  /* BEGIN GENERATED recipes: scripts/build_jamo_recipes.js from spec/jamo-recipes.json — do not edit by hand. */
  /* 그림 제작 안내(ADR-025 §7, spec/authoring-stages.json): 원형 8 → 기본 24 → 확장 40. ㆍ는 보조 원본 */
  var AUTHORING_STAGES = {"origin8":"ㄱㄴㅁㅅㅇㆍㅡㅣ","basic24":"ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ","full40":"ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ","helper":"ㆍ"};
  /* 조립식(ADR-025 §5): id → { target, operation, parts }. 조각은 다른 자모(jamo) 또는 나머지 획(strokes: "rest") */
  var JAMO_RECIPES = {"double-giyeok":{"id":"double-giyeok","target":"ㄲ","operation":"double","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㄱ"}]},"double-digeut":{"id":"double-digeut","target":"ㄸ","operation":"double","parts":[{"id":"left","jamo":"ㄷ"},{"id":"right","jamo":"ㄷ"}]},"double-bieup":{"id":"double-bieup","target":"ㅃ","operation":"double","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅂ"}]},"double-siot":{"id":"double-siot","target":"ㅆ","operation":"double","parts":[{"id":"left","jamo":"ㅅ"},{"id":"right","jamo":"ㅅ"}]},"double-jieut":{"id":"double-jieut","target":"ㅉ","operation":"double","parts":[{"id":"left","jamo":"ㅈ"},{"id":"right","jamo":"ㅈ"}]},"final-giyeok-siot":{"id":"final-giyeok-siot","target":"ㄳ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㅅ"}]},"final-nieun-jieut":{"id":"final-nieun-jieut","target":"ㄵ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅈ"}]},"final-nieun-hieut":{"id":"final-nieun-hieut","target":"ㄶ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅎ"}]},"final-rieul-giyeok":{"id":"final-rieul-giyeok","target":"ㄺ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㄱ"}]},"final-rieul-mieum":{"id":"final-rieul-mieum","target":"ㄻ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅁ"}]},"final-rieul-bieup":{"id":"final-rieul-bieup","target":"ㄼ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅂ"}]},"final-rieul-siot":{"id":"final-rieul-siot","target":"ㄽ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅅ"}]},"final-rieul-tieut":{"id":"final-rieul-tieut","target":"ㄾ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅌ"}]},"final-rieul-pieup":{"id":"final-rieul-pieup","target":"ㄿ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅍ"}]},"final-rieul-hieut":{"id":"final-rieul-hieut","target":"ㅀ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅎ"}]},"final-bieup-siot":{"id":"final-bieup-siot","target":"ㅄ","operation":"final-pair","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅅ"}]},"vowel-ae":{"id":"vowel-ae","target":"ㅐ","operation":"compose","parts":[{"id":"left","jamo":"ㅏ"},{"id":"right","jamo":"ㅣ"}]},"vowel-yae":{"id":"vowel-yae","target":"ㅒ","operation":"compose","parts":[{"id":"left","jamo":"ㅑ"},{"id":"right","jamo":"ㅣ"}]},"vowel-e":{"id":"vowel-e","target":"ㅔ","operation":"compose","parts":[{"id":"left","jamo":"ㅓ"},{"id":"right","jamo":"ㅣ"}]},"vowel-ye":{"id":"vowel-ye","target":"ㅖ","operation":"compose","parts":[{"id":"left","jamo":"ㅕ"},{"id":"right","jamo":"ㅣ"}]},"vowel-wa":{"id":"vowel-wa","target":"ㅘ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅏ"}]},"vowel-wae":{"id":"vowel-wae","target":"ㅙ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅐ"}]},"vowel-oe":{"id":"vowel-oe","target":"ㅚ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅣ"}]},"vowel-wo":{"id":"vowel-wo","target":"ㅝ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅓ"}]},"vowel-we":{"id":"vowel-we","target":"ㅞ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅔ"}]},"vowel-wi":{"id":"vowel-wi","target":"ㅟ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅣ"}]},"vowel-ui":{"id":"vowel-ui","target":"ㅢ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅡ"},{"id":"vertical","jamo":"ㅣ"}]},"kieuk-added":{"id":"kieuk-added","target":"ㅋ","operation":"add","parts":[{"id":"base","jamo":"ㄱ"},{"id":"added","strokes":"rest"}]},"digeut-added":{"id":"digeut-added","target":"ㄷ","operation":"add","parts":[{"id":"base","jamo":"ㄴ"},{"id":"added","strokes":"rest"}]},"tieut-added":{"id":"tieut-added","target":"ㅌ","operation":"add","parts":[{"id":"base","jamo":"ㄷ"},{"id":"added","strokes":"rest"}]},"jieut-added":{"id":"jieut-added","target":"ㅈ","operation":"add","parts":[{"id":"base","jamo":"ㅅ"},{"id":"added","strokes":"rest"}]},"chieut-added":{"id":"chieut-added","target":"ㅊ","operation":"add","parts":[{"id":"base","jamo":"ㅈ"},{"id":"added","strokes":"rest"}]},"yeorinhieut-added":{"id":"yeorinhieut-added","target":"ㆆ","operation":"add","parts":[{"id":"base","jamo":"ㅇ"},{"id":"added","strokes":"rest"}]},"hieut-added":{"id":"hieut-added","target":"ㅎ","operation":"add","parts":[{"id":"base","jamo":"ㆆ"},{"id":"added","strokes":"rest"}]},"hieut-circle-o":{"id":"hieut-circle-o","target":"ㅎ","operation":"place","parts":[{"id":"top","jamo":"ㅗ","at":{"strokes":[0,1]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":[2]}}]},"hieut-added-lines":{"id":"hieut-added-lines","target":"ㅎ","operation":"place","parts":[{"id":"cap","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"bar","jamo":"ㅡ","at":{"strokes":[1]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":[2]}}]},"rieul-lines":{"id":"rieul-lines","target":"ㄹ","operation":"place","parts":[{"id":"h1","jamo":"ㅡ","at":{"segments":[[0,0]]}},{"id":"v1","jamo":"ㅣ","at":{"segments":[[0,1]]}},{"id":"h2","jamo":"ㅡ","at":{"segments":[[1,0]]}},{"id":"v2","jamo":"ㅣ","at":{"segments":[[2,0]]}},{"id":"h3","jamo":"ㅡ","at":{"segments":[[2,1]]}}]},"pieup-lines":{"id":"pieup-lines","target":"ㅍ","operation":"place","parts":[{"id":"top","jamo":"ㅡ","at":{"strokes":[0]}},{"id":"left","jamo":"ㅣ","at":{"strokes":[1]}},{"id":"right","jamo":"ㅣ","at":{"strokes":[2]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":[3]}}]},"bieup-lines":{"id":"bieup-lines","target":"ㅂ","operation":"place","parts":[{"id":"left","jamo":"ㅣ","at":{"strokes":[0]}},{"id":"right","jamo":"ㅣ","at":{"strokes":[1]}},{"id":"middle","jamo":"ㅡ","at":{"strokes":[2]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":[3]}}]},"bieup-raised":{"id":"bieup-raised","target":"ㅂ","operation":"place","parts":[{"id":"lower","jamo":"ㅁ","at":{"box":[0,0.46,1,1]}},{"id":"leftExtension","jamo":"ㅣ","at":{"box":[0,0,0,0.46]}},{"id":"rightExtension","jamo":"ㅣ","at":{"box":[1,0,1,0.46]}}]},"cheonjiin-a":{"id":"cheonjiin-a","target":"ㅏ","operation":"place","parts":[{"id":"stem","jamo":"ㅣ","at":{"strokes":[0]}},{"id":"dot","jamo":"ㆍ","at":{"strokes":[1]}}]},"cheonjiin-ya":{"id":"cheonjiin-ya","target":"ㅑ","operation":"place","parts":[{"id":"stem","jamo":"ㅣ","at":{"strokes":[0]}},{"id":"dot1","jamo":"ㆍ","at":{"strokes":[1]}},{"id":"dot2","jamo":"ㆍ","at":{"strokes":[2]}}]},"cheonjiin-eo":{"id":"cheonjiin-eo","target":"ㅓ","operation":"place","parts":[{"id":"dot","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"stem","jamo":"ㅣ","at":{"strokes":[1]}}]},"cheonjiin-yeo":{"id":"cheonjiin-yeo","target":"ㅕ","operation":"place","parts":[{"id":"dot1","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"dot2","jamo":"ㆍ","at":{"strokes":[1]}},{"id":"stem","jamo":"ㅣ","at":{"strokes":[2]}}]},"cheonjiin-o":{"id":"cheonjiin-o","target":"ㅗ","operation":"place","parts":[{"id":"dot","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"ground","jamo":"ㅡ","at":{"strokes":[1]}}]},"cheonjiin-yo":{"id":"cheonjiin-yo","target":"ㅛ","operation":"place","parts":[{"id":"dot1","jamo":"ㆍ","at":{"strokes":[0]}},{"id":"dot2","jamo":"ㆍ","at":{"strokes":[1]}},{"id":"ground","jamo":"ㅡ","at":{"strokes":[2]}}]},"cheonjiin-u":{"id":"cheonjiin-u","target":"ㅜ","operation":"place","parts":[{"id":"ground","jamo":"ㅡ","at":{"strokes":[0]}},{"id":"dot","jamo":"ㆍ","at":{"strokes":[1]}}]},"cheonjiin-yu":{"id":"cheonjiin-yu","target":"ㅠ","operation":"place","parts":[{"id":"ground","jamo":"ㅡ","at":{"strokes":[0]}},{"id":"dot1","jamo":"ㆍ","at":{"strokes":[1]}},{"id":"dot2","jamo":"ㆍ","at":{"strokes":[2]}}]}};
  /* 자모마다 기본 조립식 — 짝·가획 계통(ADR-024 §5)과 선 조립식(ㅎ = ㆍ + ㅡ + ㅇ, ㄹ·ㅂ·ㅍ = ㅡ·ㅣ). 기본 place는 그릴 재료가 있을 때만 */
  var RECIPE_DEFAULTS = {"ㄲ":"double-giyeok","ㄸ":"double-digeut","ㅃ":"double-bieup","ㅆ":"double-siot","ㅉ":"double-jieut","ㄳ":"final-giyeok-siot","ㄵ":"final-nieun-jieut","ㄶ":"final-nieun-hieut","ㄺ":"final-rieul-giyeok","ㄻ":"final-rieul-mieum","ㄼ":"final-rieul-bieup","ㄽ":"final-rieul-siot","ㄾ":"final-rieul-tieut","ㄿ":"final-rieul-pieup","ㅀ":"final-rieul-hieut","ㅄ":"final-bieup-siot","ㅐ":"vowel-ae","ㅒ":"vowel-yae","ㅔ":"vowel-e","ㅖ":"vowel-ye","ㅘ":"vowel-wa","ㅙ":"vowel-wae","ㅚ":"vowel-oe","ㅝ":"vowel-wo","ㅞ":"vowel-we","ㅟ":"vowel-wi","ㅢ":"vowel-ui","ㅋ":"kieuk-added","ㄷ":"digeut-added","ㅌ":"tieut-added","ㅈ":"jieut-added","ㅊ":"chieut-added","ㆆ":"yeorinhieut-added","ㅎ":"hieut-added-lines","ㄹ":"rieul-lines","ㅂ":"bieup-lines","ㅍ":"pieup-lines"};
  /* 짓는 방식의 조각 깊이(ADR-034 §2): 깊이 → 자모 → 조립식. pieces는 맨 위 자모만 한 번, origins는 조각 안에서도 되풀이 */
  var RECIPE_LEVELS = {"pieces":{"ㅎ":"hieut-circle-o","ㄲ":"double-giyeok","ㄸ":"double-digeut","ㅃ":"double-bieup","ㅆ":"double-siot","ㅉ":"double-jieut","ㄳ":"final-giyeok-siot","ㄵ":"final-nieun-jieut","ㄶ":"final-nieun-hieut","ㄺ":"final-rieul-giyeok","ㄻ":"final-rieul-mieum","ㄼ":"final-rieul-bieup","ㄽ":"final-rieul-siot","ㄾ":"final-rieul-tieut","ㄿ":"final-rieul-pieup","ㅀ":"final-rieul-hieut","ㅄ":"final-bieup-siot","ㅐ":"vowel-ae","ㅒ":"vowel-yae","ㅔ":"vowel-e","ㅖ":"vowel-ye","ㅘ":"vowel-wa","ㅙ":"vowel-wae","ㅚ":"vowel-oe","ㅝ":"vowel-wo","ㅞ":"vowel-we","ㅟ":"vowel-wi","ㅢ":"vowel-ui","ㅋ":"kieuk-added","ㄷ":"digeut-added","ㅌ":"tieut-added","ㅈ":"jieut-added","ㅊ":"chieut-added"},"origins":{"ㅎ":"hieut-added-lines","ㄹ":"rieul-lines","ㅂ":"bieup-lines","ㅍ":"pieup-lines","ㅋ":"kieuk-added","ㄷ":"digeut-added","ㅌ":"tieut-added","ㅈ":"jieut-added","ㅊ":"chieut-added","ㄲ":"double-giyeok","ㄸ":"double-digeut","ㅃ":"double-bieup","ㅆ":"double-siot","ㅉ":"double-jieut","ㄳ":"final-giyeok-siot","ㄵ":"final-nieun-jieut","ㄶ":"final-nieun-hieut","ㄺ":"final-rieul-giyeok","ㄻ":"final-rieul-mieum","ㄼ":"final-rieul-bieup","ㄽ":"final-rieul-siot","ㄾ":"final-rieul-tieut","ㄿ":"final-rieul-pieup","ㅀ":"final-rieul-hieut","ㅄ":"final-bieup-siot","ㅐ":"vowel-ae","ㅒ":"vowel-yae","ㅔ":"vowel-e","ㅖ":"vowel-ye","ㅘ":"vowel-wa","ㅙ":"vowel-wae","ㅚ":"vowel-oe","ㅝ":"vowel-wo","ㅞ":"vowel-we","ㅟ":"vowel-wi","ㅢ":"vowel-ui","ㅏ":"cheonjiin-a","ㅑ":"cheonjiin-ya","ㅓ":"cheonjiin-eo","ㅕ":"cheonjiin-yeo","ㅗ":"cheonjiin-o","ㅛ":"cheonjiin-yo","ㅜ":"cheonjiin-u","ㅠ":"cheonjiin-yu"}};
  /* END GENERATED recipes */

  /* BEGIN GENERATED layouts: scripts/build_layout_profiles.js from spec/layout-profiles.json — do not edit by hand. */
  /* 배치 프로파일(ADR-026·028): 세벌 고정·짜임 고정은 역할 도장(조합용 자모 → [left %, top %, 글자 크기 em, scale-x, scale-y, 역할, font-weight,
   * text-stroke em, 밀도 굵기 계수], 합자 모음은 [ㅗ·ㅜ·ㅡ 조각, 오른쪽 조각] 두 도장. 짜임 고정은 짜임마다 다르면 { 짜임: 도장 } — 짜임은
   * v·h·c(세로·가로·합자 모음) + 0·1·2(받침 없음·홑·겹)), 그림 문맥(draw), 글자 칸(em), 밀도 계수를 셈한 원소 굵기(stroke, em).
   * splits는 새 나누기(ADR-030 §4)의 값 — whole 통짜 모음 노드, head 머리 음절 노드(완성형 머리 글자), coda 겹받침 낱(왼쪽·오른쪽 낱자) */
  var LAYOUT_PROFILES = {"sebul-cases-v1":{"revision":"1","accepts":[],"model":"case-fixed","match":["jamo","role"],"occurrence":false,"cell":{"width":0.954,"height":1.2266,"gap":0,"space":0.32},"depth":{"vowel":"split","coda":"whole"},"draw":{"final":"sebeol"},"stroke":0.1,"stamps":{"ᄀ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0417,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0389,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0362,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0335,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0199,1]},"ᄁ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,1]},"ᄂ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0417,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0389,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0362,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0335,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0199,1]},"ᄃ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0413,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0386,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0359,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0332,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0197,1]},"ᄄ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,1]},"ᄅ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0138,0.7968],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0116,0.8437],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0095,0.7969],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0074,0.8437],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,1]},"ᄆ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0413,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0386,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0359,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0332,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0197,1]},"ᄇ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0192,0.8361],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0169,0.8857],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0146,0.8362],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0124,0.8857],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0011,1]},"ᄈ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0,0.75],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0,0.75],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0,0.75],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0,0.75],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,0.75]},"ᄉ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.041,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0383,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0356,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0329,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0195,1]},"ᄊ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0412,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0384,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0357,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0331,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0196,1]},"ᄋ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0412,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0384,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0357,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0331,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0196,1]},"ᄌ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0412,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0384,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0357,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0331,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0196,1]},"ᄍ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.041,1],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0383,1],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0356,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0329,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0195,1]},"ᄎ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0188,0.8372],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0165,0.8725],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0143,0.8372],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0122,0.8725],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.0012,1]},"ᄏ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0076,0.75],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0055,0.7873],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0035,0.75],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0015,0.7873],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,0.9718]},"ᄐ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.0078,0.7515],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0057,0.7965],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0037,0.7516],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0017,0.7965],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,1]},"ᄑ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.024,0.917],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0215,0.9171],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0192,1],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0168,1],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0.005,0.8703]},"ᄒ":{"c":[-3.2261,-5.4987,0.7113,0.9817,1.0185,"initial",700,0.015,0.8073],"c0":[-3.2261,-5.9729,0.7261,0.9617,1.0399,"initial",700,0.0128,0.8414],"h":[8.9282,-5.4987,0.7414,1.0232,0.9772,"initial",700,0.0107,0.8073],"h0":[8.9282,-5.9729,0.7569,1.0023,0.9976,"initial",700,0.0086,0.8414],"v":[-3.7683,-6.1892,0.8472,0.8649,1.1563,"initial",700,0,1]},"ᅡ":{"v":[24.9748,5.9319,0.7987,1.0732,0.9317,"medial",700,0.0213,1],"v0":[24.9748,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]},"ᅢ":{"v":[25.5738,5.9319,0.8919,1.1985,0.8344,"medial",700,0,1],"v0":[25.5738,5.9082,0.9092,1.1757,0.8505,"medial",700,0,1]},"ᅣ":{"v":[28.5688,5.9319,0.7987,1.0732,0.9317,"medial",700,0.0213,1],"v0":[28.5688,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]},"ᅤ":{"v":[25.5738,5.9319,0.8919,1.1985,0.8344,"medial",700,0,1],"v0":[25.5738,5.9082,0.9092,1.1757,0.8505,"medial",700,0,1]},"ᅥ":{"v":[33.8101,5.9319,0.7987,1.0732,0.9317,"medial",700,0.0213,1],"v0":[33.8101,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]},"ᅦ":{"v":[37.2095,5.9319,0.8184,1.0997,0.9093,"medial",700,0.0135,1],"v0":[37.2095,5.9082,0.8342,1.0789,0.9269,"medial",700,0.0135,1]},"ᅧ":{"v":[33.8101,5.9319,0.7987,1.0732,0.9317,"medial",700,0.0213,1],"v0":[33.8101,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]},"ᅨ":{"v":[37.6927,5.9319,0.8084,1.0862,0.9206,"medial",700,0.0159,0.9978],"v0":[37.6927,5.9082,0.824,1.0656,0.9384,"medial",700,0.0159,0.9978]},"ᅩ":{"h":[1.8886,28.2165,0.7287,1.2333,0.8109,"medial",700,0.0698,1],"h0":[1.8886,29.4394,0.7287,1.2333,0.8109,"medial",700,0.0698,1]},"ᅪ":{"c":[[3.5339,28.2165,0.547,0.9256,1.0803,"medial",700,0.0697,1],[24.9748,5.9224,0.8049,1.0649,0.939,"medial",700,0.0213,1]],"c0":[[3.5339,29.4394,0.547,0.9256,1.0803,"medial",700,0.0697,1],[24.9748,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]]},"ᅫ":{"c":[[3.5339,28.2165,0.547,0.9256,1.0803,"medial",700,0.0697,1],[25.5738,5.9224,0.8989,1.1892,0.8408,"medial",700,0,1]],"c0":[[3.5339,29.4394,0.547,0.9256,1.0803,"medial",700,0.0697,1],[25.5738,5.9082,0.9092,1.1757,0.8505,"medial",700,0,1]]},"ᅬ":{"c":[[3.5339,28.2165,0.547,0.9256,1.0803,"medial",700,0.0697,1],[24.527,5.9295,0.9664,1.0348,0.7731,"medial",700,0,1]],"c0":[[3.5339,29.4394,0.547,0.9256,1.0803,"medial",700,0.0697,1],[24.5266,5.9154,0.9775,1.023,0.782,"medial",700,0,1]]},"ᅭ":{"h":[0.8861,28.6564,0.7173,1.269,0.788,"medial",700,0.0765,1],"h0":[0.8861,29.8792,0.7173,1.269,0.788,"medial",700,0.0765,1]},"ᅮ":{"h":[0.8861,18.5819,0.7334,1.2411,0.8057,"medial",700,0.0698,1],"h0":[0.8861,19.8047,0.7334,1.2411,0.8057,"medial",700,0.0698,1]},"ᅯ":{"c":[[2.9691,18.5819,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[33.8101,5.9224,0.8049,1.0649,0.939,"medial",700,0.0213,1]],"c0":[[2.9691,19.8047,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[33.8101,5.9082,0.8141,1.0529,0.9498,"medial",700,0.0213,1]]},"ᅰ":{"c":[[2.9691,18.5819,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[37.2095,5.9224,0.8248,1.0912,0.9164,"medial",700,0.0135,1]],"c0":[[2.9691,19.8047,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[37.2095,5.9082,0.8342,1.0789,0.9269,"medial",700,0.0135,1]]},"ᅱ":{"c":[[2.9691,18.5819,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[24.527,5.9295,0.9664,1.0348,0.7731,"medial",700,0,1]],"c0":[[2.9691,19.8047,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[24.5266,5.9154,0.9775,1.023,0.782,"medial",700,0,1]]},"ᅲ":{"h":[1.8886,19.4918,0.7206,1.2472,0.8018,"medial",700,0.0731,1],"h0":[1.8886,20.7147,0.7206,1.2472,0.8018,"medial",700,0.0731,1]},"ᅳ":{"h":[1.8886,-9.2987,1.1331,0.7932,1.0086,"medial",700,0,1],"h0":[1.8886,-8.0759,1.1331,0.7932,1.0086,"medial",700,0,1]},"ᅴ":{"c":[[3.5339,-9.2998,0.8505,0.5953,1.3437,"medial",700,0,1],[24.527,5.9295,0.9664,1.0348,0.7731,"medial",700,0,1]],"c0":[[3.5339,-8.077,0.8505,0.5953,1.3437,"medial",700,0,1],[24.5266,5.9154,0.9775,1.023,0.782,"medial",700,0,1]]},"ᅵ":{"v":[24.5264,5.9388,0.9589,1.0429,0.7672,"medial",700,0,1],"v0":[24.5266,5.9154,0.9775,1.023,0.782,"medial",700,0,1]},"ᆨ":{"c":[11.6212,52.8575,0.8472,1.2211,0.819,"final",700,0.0199,1],"h":[-1.0844,52.8575,0.8472,1.2211,0.819,"final",700,0.0199,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0182,1]},"ᆩ":{"c":[2.946,52.8575,0.8472,1.2211,0.819,"final",700,0.0085,1],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0.0085,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0071,1]},"ᆪ":{"c":[-8.217,51.7164,0.8968,1.2299,0.8131,"final",700,0.0135,1],"h":[-9.2653,51.7164,0.8968,1.2299,0.8131,"final",700,0.0135,1],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0.012,1]},"ᆫ":{"c":[5.1148,52.8575,0.8472,1.2211,0.819,"final",700,0.0199,1],"h":[-4.8798,52.8575,0.8472,1.2211,0.819,"final",700,0.0199,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0182,1]},"ᆬ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0.0134,1],"h":[-8.6872,51.7164,0.8968,1.2299,0.8131,"final",700,0.0134,1],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0.0119,1]},"ᆭ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"h":[-8.6872,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.7583]},"ᆮ":{"c":[6.1992,52.8575,0.8472,1.2211,0.819,"final",700,0.0197,1],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0.0197,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0181,1]},"ᆯ":{"c":[5.1148,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0,0.7813]},"ᆰ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"h":[-8.1091,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.75]},"ᆱ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7585],"h":[-8.1091,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7585],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.789]},"ᆲ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"h":[-8.1091,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.7654]},"ᆳ":{"c":[-8.217,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7578],"h":[-10.9995,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7578],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.7881]},"ᆴ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7585],"h":[-8.1091,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.7585],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.789]},"ᆵ":{"c":[-2.4362,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"h":[-8.1091,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.75]},"ᆶ":{"c":[-4.7485,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"h":[-8.6872,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.75],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.75]},"ᆷ":{"c":[6.1992,52.8575,0.8472,1.2211,0.819,"final",700,0.0197,1],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0.0197,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0181,1]},"ᆸ":{"c":[7.2836,52.8575,0.8472,1.2211,0.819,"final",700,0,0.7865],"h":[-3.7954,52.8575,0.8472,1.2211,0.819,"final",700,0,0.7865],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0,0.8197]},"ᆹ":{"c":[-9.3732,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.8203],"h":[-11.5776,51.7164,0.8968,1.2299,0.8131,"final",700,0,0.8203],"v":[-8.217,50.5615,0.9095,1.2127,0.8246,"final",700,0,0.8531]},"ᆺ":{"c":[2.946,52.8575,0.8472,1.2211,0.819,"final",700,0.0195,1],"h":[-3.7954,52.8575,0.8472,1.2211,0.819,"final",700,0.0195,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0179,1]},"ᆻ":{"c":[-0.3072,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"h":[-3.2532,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.018,1]},"ᆼ":{"c":[7.2836,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"h":[-3.2532,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.018,1]},"ᆽ":{"c":[2.946,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0.0196,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.018,1]},"ᆾ":{"c":[2.946,54.8956,0.8472,1.2211,0.819,"final",700,0,0.8018],"h":[-4.3376,54.8956,0.8472,1.2211,0.819,"final",700,0,0.8018],"v":[5.1148,53.7642,0.8596,1.2034,0.831,"final",700,0,0.8254]},"ᆿ":{"c":[7.2836,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"h":[-3.2532,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0,0.75]},"ᇀ":{"c":[6.1992,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"h":[-4.3376,52.8575,0.8472,1.2211,0.819,"final",700,0,0.75],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0,0.75]},"ᇁ":{"c":[4.0304,52.8575,0.8472,1.2211,0.819,"final",700,0.0198,1],"h":[-3.7954,52.8575,0.8472,1.2211,0.819,"final",700,0.0198,1],"v":[5.1148,51.7261,0.8596,1.2034,0.831,"final",700,0.0181,1]},"ᇂ":{"c":[5.1148,54.8956,0.8472,1.2211,0.819,"final",700,0,0.7732],"h":[-3.7954,54.8956,0.8472,1.2211,0.819,"final",700,0,0.7732],"v":[5.1148,53.7642,0.8596,1.2034,0.831,"final",700,0,0.796]}},"splits":{"whole":{"ᅪ":{"c":[0.6811,5.9224,0.8471,1.1207,0.8922,"medial",700,0.0182,1],"c0":[0.6811,5.9082,0.8568,1.108,0.9025,"medial",700,0.0171,1]},"ᅫ":{"c":[-0.3225,5.9224,0.9286,1.2286,0.8139,"medial",700,0.0092,1],"c0":[-0.3225,5.9082,0.9392,1.2147,0.8233,"medial",700,0.0081,1]},"ᅬ":{"c":[-5.3247,5.9224,0.8898,1.1774,0.8494,"medial",700,0.0136,1],"c0":[-5.3247,5.9082,0.9,1.164,0.8592,"medial",700,0.0124,1]},"ᅯ":{"c":[-3.2083,5.9224,0.8939,1.1826,0.8455,"medial",700,0.0129,1],"c0":[-3.2083,5.9082,0.9041,1.1693,0.8553,"medial",700,0.0118,1]},"ᅰ":{"c":[-3.0057,5.9224,0.9446,1.2498,0.8001,"medial",700,0,0.8522],"c0":[-3.0057,5.9082,0.9554,1.2357,0.8094,"medial",700,0,0.8522]},"ᅱ":{"c":[-3.3671,5.9224,0.8503,1.1249,0.8889,"medial",700,0.0181,1],"c0":[-3.3671,5.9082,0.86,1.1122,0.8991,"medial",700,0.0169,1]},"ᅴ":{"c":[-0.3591,4.5759,0.8761,1.0918,0.916,"medial",700,0.015,1],"c0":[-0.3591,4.5307,0.8862,1.0794,0.9264,"medial",700,0.0138,1]}},"head":{"고":{"c":[3.5339,0.5258,0.7037,0.7195,1.3899,"head",700,0.0405,1],"c0":[3.5339,0.4336,0.7115,0.7116,1.4053,"head",700,0.0391,1]},"구":{"c":[3.5339,3.0065,0.6352,0.7971,1.2546,"head",700,0.0532,1],"c0":[3.5339,2.9695,0.6423,0.7883,1.2684,"head",700,0.0517,1]},"그":{"c":[3.5339,0.634,0.6578,0.7697,1.2992,"head",700,0.0496,1],"c0":[3.5339,0.5215,0.6663,0.7599,1.3159,"head",700,0.0478,1]},"꼬":{"c":[3.3271,0.5258,0.7372,0.7537,1.3267,"head",700,0,1],"c0":[3.3271,0.4336,0.7454,0.7454,1.3414,"head",700,0,1]},"꾸":{"c":[3.3271,3.6958,0.6614,0.8401,1.1902,"head",700,0,1],"c0":[3.3271,3.6742,0.6687,0.8309,1.2035,"head",700,0,1]},"끄":{"c":[3.3271,0.634,0.6891,0.8063,1.2402,"head",700,0,1],"c0":[3.3271,0.5215,0.698,0.7961,1.2561,"head",700,0,1]},"노":{"c":[3.4012,1.4873,0.7146,0.7528,1.3284,"head",700,0.0383,1],"c0":[3.4012,1.4165,0.7225,0.7446,1.3432,"head",700,0.037,1]},"누":{"c":[3.4012,4.3685,0.6468,0.8317,1.2024,"head",700,0.0507,1],"c0":[3.4012,4.3618,0.654,0.8226,1.2157,"head",700,0.0492,1]},"느":{"c":[3.4012,2.2426,0.6629,0.8115,1.2324,"head",700,0.0482,1],"c0":[3.4012,2.1718,0.6715,0.8012,1.2481,"head",700,0.0465,1]},"도":{"c":[3.4383,1.7526,0.7024,0.7533,1.3276,"head",700,0.0404,1],"c0":[3.4383,1.6749,0.7103,0.7449,1.3424,"head",700,0.039,1]},"두":{"c":[3.4383,3.7181,0.649,0.8153,1.2266,"head",700,0.0502,1],"c0":[3.4383,3.6846,0.6563,0.8062,1.2402,"head",700,0.0487,1]},"드":{"c":[3.4383,0.836,0.6667,0.7937,1.2598,"head",700,0.0475,1],"c0":[3.4383,0.7179,0.6753,0.7836,1.2763,"head",700,0.0458,1]},"또":{"c":[3.4012,0.9153,0.7134,0.7541,1.3261,"head",700,0,1],"c0":[3.4012,0.8187,0.7214,0.7457,1.3409,"head",700,0,1]},"뚜":{"c":[3.4012,3.7181,0.6544,0.8221,1.2164,"head",700,0,1],"c0":[3.4012,3.6846,0.6617,0.813,1.2301,"head",700,0,1]},"뜨":{"c":[3.4012,0.0579,0.6773,0.7943,1.2589,"head",700,0,1],"c0":[3.4012,-0.0805,0.6861,0.7841,1.2752,"head",700,0,1]},"로":{"c":[3.4012,1.1114,0.7122,0.7554,1.3239,"head",700,0.013,0.7969],"c0":[3.4012,1.0066,0.7203,0.7469,1.3387,"head",700,0.0118,0.8437]},"루":{"c":[3.4012,3.7785,0.6541,0.8225,1.2157,"head",700,0.0214,0.7951],"c0":[3.4012,3.7343,0.6614,0.8134,1.2296,"head",700,0.0202,0.8419]},"르":{"c":[3.4012,1.6826,0.6666,0.807,1.2393,"head",700,0.0199,0.7969],"c0":[3.4012,1.5762,0.6754,0.7965,1.2553,"head",700,0.0185,0.8438]},"모":{"c":[3.4383,0.9153,0.7075,0.7479,1.3371,"head",700,0.0395,1],"c0":[3.4383,0.8187,0.7154,0.7396,1.3521,"head",700,0.0381,1]},"무":{"c":[3.4383,3.7494,0.6451,0.8202,1.2191,"head",700,0.0511,1],"c0":[3.4383,3.7166,0.6523,0.8112,1.2328,"head",700,0.0495,1]},"므":{"c":[3.4383,0.836,0.6667,0.7937,1.2598,"head",700,0.0475,1],"c0":[3.4383,0.7179,0.6753,0.7836,1.2763,"head",700,0.0458,1]},"보":{"c":[3.4754,1.9342,0.6955,0.7481,1.3366,"head",700,0.0204,0.8357],"c0":[3.4754,1.8481,0.7033,0.7398,1.3518,"head",700,0.0192,0.8852]},"부":{"c":[3.4754,4.4573,0.6356,0.8186,1.2216,"head",700,0.0303,0.8368],"c0":[3.4754,4.4285,0.6428,0.8094,1.2354,"head",700,0.029,0.8864]},"브":{"c":[3.4754,0.9398,0.6604,0.7879,1.2693,"head",700,0.0262,0.8351],"c0":[3.4754,0.8139,0.669,0.7777,1.2859,"head",700,0.0247,0.8846]},"뽀":{"c":[3.4012,1.1114,0.7122,0.7554,1.3239,"head",700,0,0.75],"c0":[3.4012,1.0066,0.7203,0.7469,1.3387,"head",700,0,0.75]},"뿌":{"c":[3.4012,3.8017,0.6501,0.8275,1.2086,"head",700,0,0.75],"c0":[3.4012,3.758,0.6575,0.8182,1.2222,"head",700,0,0.75]},"쁘":{"c":[3.4012,0.9398,0.6715,0.8012,1.2483,"head",700,0,0.75],"c0":[3.4012,0.8139,0.6803,0.7908,1.2646,"head",700,0,0.75]},"소":{"c":[3.3271,1.1114,0.7238,0.7677,1.3026,"head",700,0.0366,1],"c0":[3.3271,1.0066,0.732,0.7591,1.3173,"head",700,0.0352,1]},"수":{"c":[3.3271,4.4573,0.6568,0.846,1.1822,"head",700,0.0486,1],"c0":[3.3271,4.4285,0.6643,0.8364,1.1954,"head",700,0.0471,1]},"스":{"c":[3.3271,1.6826,0.6775,0.8202,1.2193,"head",700,0.0452,1],"c0":[3.3271,1.5762,0.6864,0.8095,1.2352,"head",700,0.0435,1]},"쏘":{"c":[0.8044,1.7526,0.7541,0.8088,1.2366,"head",700,0.0316,1],"c0":[0.8044,1.6749,0.7626,0.7997,1.2503,"head",700,0.0303,1]},"쑤":{"c":[0.8044,4.4134,0.6884,0.8859,1.1288,"head",700,0.0424,1],"c0":[0.8044,4.3956,0.6961,0.8761,1.1415,"head",700,0.041,1]},"쓰":{"c":[0.8044,1.5912,0.7104,0.8585,1.1649,"head",700,0.0391,1],"c0":[0.8044,1.4929,0.7197,0.8474,1.1799,"head",700,0.0375,1]},"오":{"c":[3.4754,1.88,0.7004,0.7429,1.3462,"head",700,0.0408,1],"c0":[3.4754,1.7927,0.7083,0.7346,1.3614,"head",700,0.0393,1]},"우":{"c":[3.4754,3.8017,0.6394,0.8137,1.2288,"head",700,0.0523,1],"c0":[3.4754,3.758,0.6466,0.8047,1.2428,"head",700,0.0507,1]},"으":{"c":[3.4754,0.9398,0.6604,0.7879,1.2693,"head",700,0.0487,1],"c0":[3.4754,0.8139,0.669,0.7777,1.2859,"head",700,0.047,1]},"조":{"c":[3.3271,-0.6068,0.7344,0.7566,1.3216,"head",700,0.0349,1],"c0":[3.3271,-0.7506,0.7427,0.7482,1.3365,"head",700,0.0336,1]},"주":{"c":[3.3271,2.4425,0.6688,0.8308,1.2035,"head",700,0.0462,1],"c0":[3.3271,2.3679,0.6763,0.8216,1.2172,"head",700,0.0447,1]},"즈":{"c":[3.3271,-0.6133,0.6927,0.8022,1.2468,"head",700,0.0425,1],"c0":[3.3271,-0.7801,0.7018,0.7918,1.263,"head",700,0.0408,1]},"쪼":{"c":[0.8044,0.2648,0.7638,0.7985,1.2523,"head",700,0.0301,1],"c0":[0.8044,0.1407,0.7724,0.7896,1.2665,"head",700,0.0288,1]},"쭈":{"c":[0.8044,2.4425,0.7006,0.8705,1.1488,"head",700,0.0402,1],"c0":[0.8044,2.3679,0.7085,0.8608,1.1619,"head",700,0.0387,1]},"쯔":{"c":[0.8044,0.1748,0.7203,0.8467,1.1811,"head",700,0.0374,1],"c0":[0.8044,0.0288,0.7297,0.8358,1.1966,"head",700,0.0358,1]},"초":{"c":[3.3271,1.8427,0.7193,0.7725,1.2944,"head",700,0.0148,0.8203],"c0":[3.3271,1.7071,0.7277,0.7636,1.3096,"head",700,0.0136,0.8601]},"추":{"c":[3.3271,3.3608,0.6634,0.8376,1.1937,"head",700,0.0231,0.8194],"c0":[3.3271,3.261,0.6711,0.828,1.2078,"head",700,0.0218,0.8591]},"츠":{"c":[3.3271,1.354,0.6752,0.8229,1.2152,"head",700,0.0219,0.8234],"c0":[3.3271,1.1998,0.6843,0.812,1.2315,"head",700,0.0204,0.8623]},"코":{"c":[3.4754,-0.7013,0.7159,0.7268,1.376,"head",700,0.0066,0.75],"c0":[3.4754,-0.8473,0.724,0.7186,1.3915,"head",700,0.0055,0.7867]},"쿠":{"c":[3.4754,2.4425,0.6471,0.804,1.2438,"head",700,0.0163,0.75],"c0":[3.4754,2.3679,0.6544,0.7951,1.2579,"head",700,0.0152,0.7885]},"크":{"c":[3.4754,-0.7108,0.6755,0.7702,1.2982,"head",700,0.0123,0.75],"c0":[3.4754,-0.8801,0.6843,0.7603,1.3152,"head",700,0.011,0.7877]},"토":{"c":[3.4383,1.7526,0.7024,0.7533,1.3276,"head",700,0.0086,0.7516],"c0":[3.4383,1.6749,0.7103,0.7449,1.3424,"head",700,0.0075,0.7966]},"투":{"c":[3.4383,3.7181,0.649,0.8153,1.2266,"head",700,0.016,0.75],"c0":[3.4383,3.6846,0.6563,0.8062,1.2402,"head",700,0.0149,0.7947]},"트":{"c":[3.4383,1.6597,0.6569,0.8055,1.2416,"head",700,0.0153,0.7516],"c0":[3.4383,1.5631,0.6655,0.7951,1.2575,"head",700,0.0139,0.7965]},"포":{"c":[3.3642,0.7135,0.7205,0.7589,1.3175,"head",700,0.027,0.9175],"c0":[3.3642,0.6254,0.7285,0.7506,1.3321,"head",700,0.0257,0.9176]},"푸":{"c":[3.3642,4.3685,0.6521,0.8385,1.1926,"head",700,0.0383,0.9175],"c0":[3.3642,4.3618,0.6594,0.8293,1.2057,"head",700,0.037,0.9176]},"프":{"c":[3.3642,1.4971,0.6733,0.8121,1.2314,"head",700,0.0351,0.9175],"c0":[3.3642,1.407,0.682,0.8018,1.2472,"head",700,0.0335,0.9176]},"호":{"c":[3.4012,1.6983,0.704,0.7642,1.3086,"head",700,0.0126,0.7855],"c0":[3.4012,1.5708,0.7122,0.7554,1.3237,"head",700,0.0114,0.8241]},"후":{"c":[3.4012,3.9514,0.6493,0.8285,1.2068,"head",700,0.0207,0.7846],"c0":[3.4012,3.8765,0.6568,0.8191,1.2209,"head",700,0.0195,0.8232]},"흐":{"c":[3.4012,1.9689,0.6604,0.8146,1.2274,"head",700,0.0197,0.7892],"c0":[3.4012,1.8407,0.6692,0.8039,1.2439,"head",700,0.0183,0.827]}},"coda":{"ᆪ":{"c":[[-7.0371,51.439,0.7511,1.0077,0.9924,"final",700,0.0345,1],[36.6594,53.7686,0.6216,0.9347,1.0699,"final",700,0.0603,1]],"h":[[-8.0854,51.439,0.7511,1.0077,0.9924,"final",700,0.0345,1],[35.6111,53.7686,0.6216,0.9347,1.0699,"final",700,0.0603,1]],"v":[[-7.0372,50.2762,0.7617,0.9937,1.0065,"final",700,0.0327,1],[36.5849,52.7417,0.6307,0.9243,1.0818,"final",700,0.0581,1]]},"ᆬ":{"c":[[5.1693,52.0521,0.6591,0.9275,1.0781,"final",700,0.0525,1],[40.1577,52.7923,0.6259,0.8966,1.1154,"final",700,0.0595,1]],"h":[[-1.0817,52.0521,0.6591,0.9275,1.0781,"final",700,0.0525,1],[33.9067,52.7923,0.6259,0.8966,1.1154,"final",700,0.0595,1]],"v":[[-0.6117,50.9268,0.668,0.9151,1.0929,"final",700,0.0505,1],[34.3758,51.6771,0.6345,0.8845,1.1307,"final",700,0.0574,1]]},"ᆭ":{"c":[[6.3453,54.6956,0.6159,0.8854,1.1295,"final",700,0.0628,1],[43.9886,54.975,0.5902,0.8921,1.1211,"final",700,0.0276,0.75]],"h":[[0.0943,54.6956,0.6159,0.8854,1.1295,"final",700,0.0628,1],[37.7376,54.975,0.5902,0.8921,1.1211,"final",700,0.0276,0.75]],"v":[[0.5643,53.6775,0.6242,0.8736,1.1445,"final",700,0.0607,1],[38.2068,53.9129,0.5986,0.8796,1.1369,"final",700,0.026,0.7583]]},"ᆰ":{"c":[[5.379,53.2182,0.6172,0.9204,1.0865,"final",700,0.0228,0.75],[39.6874,50.8446,0.6879,0.923,1.0836,"final",700,0.0463,1]],"h":[[-0.2939,53.2182,0.6172,0.9204,1.0865,"final",700,0.0228,0.75],[34.0145,50.8446,0.6879,0.923,1.0836,"final",700,0.0463,1]],"v":[[-0.3337,52.1087,0.6236,0.9044,1.1058,"final",700,0.0217,0.75],[34.225,49.6648,0.6952,0.9067,1.1028,"final",700,0.0449,1]]},"ᆱ":{"c":[[5.4846,52.7719,0.6268,0.8963,1.1159,"final",700,0.0224,0.7585],[40.3372,51.7164,0.6516,0.8935,1.1191,"final",700,0.0537,1]],"h":[[-0.1883,52.7719,0.6268,0.8963,1.1159,"final",700,0.0224,0.7585],[34.6643,51.7164,0.6516,0.8935,1.1191,"final",700,0.0537,1]],"v":[[-0.2245,51.6471,0.6333,0.8803,1.1359,"final",700,0.0212,0.789],[34.8906,50.5615,0.6583,0.8776,1.1393,"final",700,0.0522,1]]},"ᆲ":{"c":[[5.4311,53.5683,0.6221,0.9082,1.1012,"final",700,0.0219,0.75],[39.8942,52.5462,0.6525,0.914,1.0942,"final",700,0.0268,0.8191]],"h":[[-0.2418,53.5683,0.6221,0.9082,1.1012,"final",700,0.0219,0.75],[34.2212,52.5462,0.6525,0.914,1.0942,"final",700,0.0268,0.8191]],"v":[[-0.2802,52.4755,0.6285,0.8923,1.1208,"final",700,0.0208,0.7661],[34.439,51.4149,0.6593,0.8979,1.1138,"final",700,0.0255,0.8521]]},"ᆳ":{"c":[[-1.8039,52.7706,0.6752,0.9651,1.036,"final",700,0.0141,0.7586],[38.306,52.9261,0.6224,0.9043,1.1059,"final",700,0.0601,1]],"h":[[-4.5864,52.7706,0.6752,0.9651,1.036,"final",700,0.0141,0.7586],[35.5235,52.9261,0.6224,0.9043,1.1059,"final",700,0.0601,1]],"v":[[-1.804,51.6483,0.6846,0.9519,1.0507,"final",700,0.0127,0.7889],[38.2408,51.8708,0.6315,0.8941,1.1185,"final",700,0.0579,1]]},"ᆴ":{"c":[[5.4846,52.7719,0.6268,0.8963,1.1159,"final",700,0.0224,0.7585],[40.3372,51.7164,0.6516,0.8935,1.1191,"final",700,0.0181,0.7585]],"h":[[-0.1883,52.7719,0.6268,0.8963,1.1159,"final",700,0.0224,0.7585],[34.6643,51.7164,0.6516,0.8935,1.1191,"final",700,0.0181,0.7585]],"v":[[-0.2245,51.6471,0.6333,0.8803,1.1359,"final",700,0.0212,0.789],[34.8906,50.5615,0.6583,0.8776,1.1393,"final",700,0.017,0.7891]]},"ᆵ":{"c":[[5.2422,52.7719,0.6348,0.9077,1.1018,"final",700,0.0209,0.7585],[41.8149,50.8506,0.6386,0.8572,1.1667,"final",700,0.0192,0.75]],"h":[[-0.4307,52.7719,0.6348,0.9077,1.1018,"final",700,0.0209,0.7585],[36.142,50.8506,0.6386,0.8572,1.1667,"final",700,0.0192,0.75]],"v":[[-0.5388,51.6471,0.6438,0.895,1.1174,"final",700,0.0193,0.7891],[36.0329,49.671,0.6477,0.8452,1.1831,"final",700,0.0176,0.75]]},"ᆶ":{"c":[[1.3034,56.3645,0.6203,0.9742,1.0266,"final",700,0.0223,0.75],[38.8359,54.975,0.6268,0.9474,1.0556,"final",700,0.0207,0.75]],"h":[[-2.6352,56.3645,0.6203,0.9742,1.0266,"final",700,0.0223,0.75],[34.8972,54.975,0.6268,0.9474,1.0556,"final",700,0.0207,0.75]],"v":[[-2.1034,55.3869,0.6267,0.9583,1.0434,"final",700,0.0211,0.75],[35.6433,53.9129,0.6338,0.9312,1.0737,"final",700,0.0195,0.7583]]},"ᆹ":{"c":[[-4.4485,53.1359,0.7054,0.9879,1.0123,"final",700,0.0178,0.8193],[37.7192,52.8937,0.6268,0.9093,1.0996,"final",700,0.059,1]],"h":[[-6.6529,53.1359,0.7054,0.9879,1.0123,"final",700,0.0178,0.8193],[35.5148,52.8937,0.6268,0.9093,1.0996,"final",700,0.059,1]],"v":[[-3.2924,52.0309,0.7153,0.9742,1.0265,"final",700,0.0163,0.852],[38.8089,51.8381,0.6359,0.8991,1.1122,"final",700,0.0569,1]]}}}},"sebul-fixed-v1":{"revision":"3","accepts":["1","2"],"model":"fixed-three","match":["jamo","role"],"occurrence":false,"cell":{"width":0.9169,"height":1.2037,"gap":0,"space":0.32},"depth":{"vowel":"split","coda":"whole"},"draw":{"initial":"bar"},"stroke":0.1,"stamps":{"ᄀ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0534,1],"ᄁ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,1],"ᄂ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0534,1],"ᄃ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0529,1],"ᄄ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,1],"ᄅ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0252,0.8125],"ᄆ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0529,1],"ᄇ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0312,0.8527],"ᄈ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0,0.725],"ᄉ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0525,1],"ᄊ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄋ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄌ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0527,1],"ᄍ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0525,1],"ᄎ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0298,0.8489],"ᄏ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0174,0.7579],"ᄐ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0187,0.7665],"ᄑ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.03,0.8426],"ᄒ":[-2.3317,-5.8325,0.6938,0.9443,1.0589,"initial",700,0.0257,0.8186],"ᅡ":[21.9417,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅢ":[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1],"ᅣ":[25.681,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅤ":[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1],"ᅥ":[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅦ":[34.6709,5.1223,0.8342,1.0789,0.9269,"medial",700,0.0135,1],"ᅧ":[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1],"ᅨ":[35.1737,5.1223,0.824,1.0656,0.9384,"medial",700,0.0159,0.9978],"ᅩ":[2.2846,29.1023,0.7287,1.2333,0.8109,"medial",700,0.0698,1],"ᅪ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[21.9417,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1]],"ᅫ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[22.5649,5.1223,0.9092,1.1757,0.8505,"medial",700,0,1]],"ᅬ":[[3.9965,29.1023,0.547,0.9256,1.0803,"medial",700,0.0697,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅭ":[1.2416,29.5505,0.7173,1.269,0.788,"medial",700,0.0765,1],"ᅮ":[1.2416,19.2839,0.7334,1.2411,0.8057,"medial",700,0.0698,1],"ᅯ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[31.1342,5.1223,0.8141,1.0529,0.9498,"medial",700,0.0213,1]],"ᅰ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[34.6709,5.1223,0.8342,1.0789,0.9269,"medial",700,0.0135,1]],"ᅱ":[[3.4088,19.2839,0.5505,0.9316,1.0734,"medial",700,0.0697,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅲ":[2.2846,20.2112,0.7206,1.2472,0.8018,"medial",700,0.0731,1],"ᅳ":[2.2846,-9.1285,1.1331,0.7932,1.0086,"medial",700,0,1],"ᅴ":[[3.9965,-9.1297,0.8505,0.5953,1.3437,"medial",700,0,1],[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1]],"ᅵ":[21.4753,5.1296,0.9775,1.023,0.782,"medial",700,0,1],"ᆨ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0562,1],"ᆩ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.012,1],"ᆪ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0529,1],"ᆫ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0562,1],"ᆬ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0524,1],"ᆭ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.7328],"ᆮ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0557,1],"ᆯ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0182,0.75],"ᆰ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.7308],"ᆱ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆲ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆳ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.016,0.75],"ᆴ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.0161,0.75],"ᆵ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.75],"ᆶ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0,0.6688],"ᆷ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0557,1],"ᆸ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0183,0.75],"ᆹ":[-5.9841,54.262,0.816,1.2435,0.8042,"final",700,0.016,0.75],"ᆺ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0552,1],"ᆻ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆼ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆽ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0555,1],"ᆾ":[-6.0361,57.0956,0.7808,1.2145,0.8233,"final",700,0.0178,0.75],"ᆿ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0183,0.75],"ᇀ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0184,0.75],"ᇁ":[-6.0361,55.0187,0.7808,1.2145,0.8233,"final",700,0.0559,1],"ᇂ":[-6.0361,57.0956,0.7808,1.2145,0.8233,"final",700,0.0179,0.75]},"splits":{"whole":{"ᅪ":[1.3044,5.1223,0.8336,1.0781,0.9276,"medial",700,0.0282,1],"ᅫ":[0.2913,5.1223,0.9158,1.1842,0.8444,"medial",700,0.0286,1],"ᅬ":[-4.5279,5.1223,0.8723,1.1282,0.8865,"medial",700,0.0291,1],"ᅯ":[-2.5197,5.1223,0.8793,1.1373,0.8794,"medial",700,0.0287,1],"ᅰ":[-2.3834,5.1223,0.9327,1.2062,0.8291,"medial",700,0.0114,0.8522],"ᅱ":[-2.6146,5.1223,0.8336,1.0779,0.9276,"medial",700,0.0287,1],"ᅴ":[0.3254,3.7185,0.8589,1.0462,0.9559,"medial",700,0.0219,1]},"head":{"고":[3.9965,0.4367,0.7063,0.7169,1.395,"head",700,0.04,1],"구":[3.9965,2.9834,0.6376,0.7941,1.2592,"head",700,0.0527,1],"그":[3.9965,0.5401,0.6607,0.7664,1.3047,"head",700,0.049,1],"꼬":[3.9241,0.4367,0.7178,0.7285,1.3727,"head",700,0,1],"꾸":[3.9241,3.6911,0.644,0.812,1.2315,"head",700,0,1],"끄":[3.9241,0.5401,0.6714,0.7788,1.2839,"head",700,0,1],"노":[3.9965,1.4238,0.6959,0.7276,1.3742,"head",700,0.0418,1],"누":[3.9965,4.3817,0.6298,0.804,1.244,"head",700,0.0544,1],"느":[3.9965,2.1935,0.6459,0.7839,1.2757,"head",700,0.0518,1],"도":[3.9965,1.6919,0.6897,0.7341,1.3622,"head",700,0.0428,1],"두":[3.9965,3.7098,0.6372,0.7946,1.2587,"head",700,0.0527,1],"드":[3.9965,0.744,0.655,0.773,1.2935,"head",700,0.05,1],"또":[3.9965,0.8321,0.6947,0.7288,1.372,"head",700,0,1],"뚜":[3.9965,3.7098,0.6372,0.7946,1.2587,"head",700,0,1],"뜨":[3.9965,-0.0559,0.6599,0.7673,1.3033,"head",700,0,1],"로":[3.9965,1.0292,0.6936,0.73,1.3697,"head",700,0.0177,0.8125],"루":[3.9965,3.7678,0.6369,0.795,1.258,"head",700,0.0264,0.8107],"르":[3.9965,1.6107,0.6496,0.7794,1.2828,"head",700,0.0249,0.8125],"모":[3.9965,0.8321,0.6947,0.7288,1.372,"head",700,0.0419,1],"무":[3.9965,3.7419,0.6334,0.7994,1.251,"head",700,0.0536,1],"므":[3.9965,0.744,0.655,0.773,1.2935,"head",700,0.05,1],"보":[3.9965,1.874,0.6886,0.7353,1.3602,"head",700,0.0236,0.8522],"부":[3.9965,4.4647,0.6294,0.8045,1.243,"head",700,0.0338,0.8533],"브":[3.9965,0.8471,0.6543,0.7738,1.2924,"head",700,0.0295,0.8516],"뽀":[3.9965,1.0292,0.6936,0.73,1.3697,"head",700,0,0.7203],"뿌":[3.9965,3.7915,0.6331,0.7998,1.2505,"head",700,0,0.7204],"쁘":[3.9965,0.8471,0.6543,0.7738,1.2924,"head",700,0,0.7203],"소":[3.9241,1.0292,0.7048,0.7419,1.3479,"head",700,0.04,1],"수":[3.9241,4.4647,0.6396,0.8176,1.2232,"head",700,0.0522,1],"스":[3.9241,1.6107,0.6601,0.7922,1.2624,"head",700,0.0487,1],"쏘":[1.6029,1.6919,0.7332,0.7805,1.2814,"head",700,0.035,1],"쑤":[1.6029,4.4237,0.6693,0.855,1.1698,"head",700,0.0461,1],"쓰":[1.6029,1.5203,0.6912,0.8279,1.2077,"head",700,0.0426,1],"오":[3.9965,1.8184,0.6936,0.73,1.3697,"head",700,0.042,1],"우":[3.9965,3.7915,0.6331,0.7998,1.2505,"head",700,0.0536,1],"으":[3.9965,0.8471,0.6543,0.7738,1.2924,"head",700,0.05,1],"조":[3.9241,-0.735,0.7151,0.7312,1.3676,"head",700,0.0383,1],"주":[3.9241,2.3959,0.6512,0.803,1.2454,"head",700,0.0498,1],"즈":[3.9241,-0.7495,0.675,0.7747,1.2907,"head",700,0.046,1],"쪼":[1.6029,0.1598,0.7426,0.7706,1.2978,"head",700,0.0335,1],"쭈":[1.6029,2.3959,0.6812,0.84,1.1905,"head",700,0.0438,1],"쯔":[1.6029,0.0607,0.7008,0.8166,1.2246,"head",700,0.0409,1],"초":[3.9241,1.764,0.7005,0.7465,1.3396,"head",700,0.0192,0.8336],"추":[3.9241,3.3232,0.646,0.8095,1.2355,"head",700,0.0279,0.8327],"츠":[3.9241,1.2597,0.658,0.7947,1.2582,"head",700,0.0265,0.8364],"코":[3.9965,-0.8321,0.7089,0.7142,1.4001,"head",700,0.0084,0.7573],"쿠":[3.9965,2.3959,0.6408,0.7902,1.2656,"head",700,0.0186,0.7591],"크":[3.9965,-0.8497,0.6693,0.7565,1.3217,"head",700,0.0144,0.7583],"토":[3.9965,1.6919,0.6897,0.7341,1.3622,"head",700,0.0123,0.7666],"투":[3.9965,3.7098,0.6372,0.7946,1.2587,"head",700,0.02,0.7649],"트":[3.9965,1.5907,0.6454,0.7845,1.2747,"head",700,0.0192,0.7666],"포":[3.9603,0.6293,0.7015,0.7336,1.3633,"head",700,0.0205,0.8432],"푸":[3.9603,4.3817,0.635,0.8104,1.2339,"head",700,0.0313,0.8431],"프":[3.9603,1.4273,0.656,0.7845,1.2748,"head",700,0.0281,0.8432],"호":[3.9965,1.6195,0.6856,0.7385,1.3542,"head",700,0.0169,0.7984],"후":[3.9965,3.9335,0.6323,0.8008,1.2489,"head",700,0.0254,0.7975],"흐":[3.9965,1.8951,0.6435,0.7868,1.271,"head",700,0.0243,0.8019]},"coda":{"ᆪ":[[-2.727,54.0076,0.6207,0.9254,1.0807,"final",700,0.0741,1],[31.9184,55.8191,0.5979,0.9857,1.0146,"final",700,0.0687,1]],"ᆬ":[[2.6991,54.498,0.559,0.8706,1.1488,"final",700,0.1045,1],[26.2933,54.8702,0.6299,0.9844,1.0158,"final",700,0.0609,1]],"ᆭ":[[4.5792,56.8087,0.4926,0.7821,1.2787,"final",700,0.1568,1],[29.9437,57.2505,0.5933,0.9965,1.0036,"final",700,0.0247,0.7328]],"ᆰ":[[-0.0751,55.63,0.6084,1.007,0.9929,"final",700,0.0254,0.75],[39.5196,53.4624,0.5867,0.8746,1.1434,"final",700,0.0942,1]],"ᆱ":[[0.9015,55.23,0.5919,0.9405,1.0634,"final",700,0.0354,0.75],[35.9978,54.262,0.5855,0.8921,1.1208,"final",700,0.0901,1]],"ᆲ":[[1.1211,55.9269,0.5795,0.9389,1.0649,"final",700,0.0384,0.75],[34.7307,55.023,0.5924,0.9218,1.0847,"final",700,0.0381,0.75]],"ᆳ":[[0.9935,55.2195,0.5895,0.9354,1.0689,"final",700,0.0366,0.75],[35.0067,55.1252,0.5894,0.9426,1.0611,"final",700,0.0785,1]],"ᆴ":[[1.0262,55.23,0.5881,0.9344,1.0703,"final",700,0.0371,0.75],[35.4166,54.262,0.5896,0.8985,1.113,"final",700,0.0423,0.75]],"ᆵ":[[1.9762,55.23,0.5582,0.887,1.1276,"final",700,0.0514,0.75],[33.443,53.468,0.6017,0.8973,1.1143,"final",700,0.0399,0.75]],"ᆶ":[[0.1187,58.3641,0.5571,0.9659,1.0351,"final",700,0.0384,0.7419],[32.3863,57.2505,0.5919,0.994,1.006,"final",700,0.0253,0.7328]],"ᆹ":[[0.1992,55.5302,0.6012,0.9345,1.0699,"final",700,0.0344,0.75],[34.5812,55.0423,0.5999,0.9555,1.0465,"final",700,0.0732,1]]}}},"square-context-v1":{"revision":"1","accepts":[],"model":"adaptive-square","match":["jamo","role","vowelLayout","hasFinal"],"occurrence":true}};
  var LAYOUT_DEFAULT = "sebul-cases-v1";
  /* END GENERATED layouts */

  /* 배치 프로파일(ADR-026·028, 설계 v1.2 §10) — 세벌 고정(fixed-three, 직결식)은 같은 역할의 같은 자모를 어느 음절에서든 같은
   * 도장(자리·크기·그림 문맥)으로 찍는다. 짜임 고정(case-fixed, 세벌식)은 짜임(모음 모양 × 받침)마다 한 도장이다. 둘 다 받침 자리는
   * 늘 비워 두고, 합자 모음은 고정 조각 둘(ㅘ = ㅗ 조각 + ㅏ 조각), 겹받침은 통짜로 그린다(머리 음절 없음). 네모 문맥
   * (adaptive-square)은 글꼴 CSS의 짜임별 slot 배치를 그대로 쓴다. 배치는 디자인이 고르거나 글꼴 CSS가 밝힌다(--fy-font-layout,
   * 페이지 변수는 두지 않는다). 둘 다 없으면 글꼴을 밝히지 않은 바탕 요소만 기본 배치(세벌식)를 쓴다. 글꼴을 밝힌 바탕 요소, 배치를
   * 적지 않은 이전 디자인, --fy-design: legacy는 지금 배치를 지킨다 — 이름이 sebul이라고 다시 분류하지 않는다(설계 v1.2 L16·L25). */
  function fixedLayout(meta) {
    var profile = meta && meta.layout ? LAYOUT_PROFILES[meta.layout] : null;
    return profile && STAMPED_MODELS[profile.model] ? profile : null;
  }

  /* 도장 표를 갖는 배치 — 세벌 고정(fixed-three, 직결식)과 짜임 고정(case-fixed, 세벌식 — ADR-028: 짜임마다 한 도장) */
  var STAMPED_MODELS = { "fixed-three": true, "case-fixed": true };
  var CASE_VOWELS = { right: "v", bottom: "h", "split-right": "c" };
  var CASE_FINALS = { none: "0", single: "1", double: "2" };

  /* 자모 노드가 든 음절의 짜임 열쇠 — 모음 모양(v 세로·h 가로·c 합자) + 받침(0·1·2). 글자 칸의 data-jung-layout·data-jong-layout */
  function layoutCase(node) {
    var frame = typeof node.closest === "function" ? node.closest("[data-jung-layout]") : null;
    if (!frame) {
      return "";
    }
    return (CASE_VOWELS[frame.getAttribute("data-jung-layout")] || "") + (CASE_FINALS[frame.getAttribute("data-jong-layout")] || "0");
  }

  /* 도장 표의 값 — 세벌 고정은 도장(합자 모음은 조각 둘) 그대로, 짜임 고정은 { 짜임: 도장 }에서 짜임 열쇠, 없으면 모음 모양 열쇠 */
  function caseStamp(entry, key) {
    if (!entry || Array.isArray(entry)) {
      return entry || null;
    }
    return entry[key] || entry[key.charAt(0)] || null;
  }

  /* 자모 노드의 모양 값(도장) — 고정 글꼴 모양(세벌식·직결식)의 표에서 찾는다. 값은 조합용 자모(역할이 들어 있다) 하나와 글자
   * 칸의 짜임으로 정해지고 이웃 자모를 보지 않는다. 합자 모음의 조각은 그 합자 모음의 조각 값(ㅘ면 ㅗ 조각·ㅏ 조각)이다 — 조각
   * 글자만 보면 홑모음 ㅗ와 구별되지 않는다. 노드에 적지 않는다 — 그리는 값은 코어 CSS의 모양 값 규칙(@layer font-kku.shape,
   * 같은 정본에서 생성)이 주고(ADR-030 §2), 런타임은 그림 문맥·기기 글꼴 맞춤·밀도 굵기 계수의 셈에만 이 표를 읽는다. */
  function shapeStampFor(node, profile) {
    var key = profile.model === "case-fixed" ? layoutCase(node) : "";
    var part = " " + (node.getAttribute("part") || "") + " ";
    var splits = profile.splits || {};
    /* 새 나누기(ADR-030 §4): 머리 음절 노드는 완성형 머리 글자의 값, 머리 옆 모음은 그 합자 모음의 오른쪽 조각, 겹받침 낱자는
     * 그 겹받침의 왼쪽·오른쪽 낱자 값, 통짜 모음 노드는 합자 모음 하나의 값 */
    if (/ head /.test(part)) {
      return caseStamp(splits.head && splits.head[node.getAttribute("data-jamo")], key);
    }
    var parent = node.parentNode;
    var inCluster = Boolean(parent) && / cluster /.test(" " + (parent.getAttribute("part") || "") + " ");
    if (inCluster || / jungseong-tail /.test(part)) {
      var glyph = node.closest('[part~="glyph"]');
      var code = glyph ? glyph.getAttribute("data-source").charCodeAt(0) - HANGUL_BASE : -1;
      if (code < 0) {
        return null;
      }
      if (/ jongseong /.test(part)) {
        var pair = caseStamp(splits.coda && splits.coda[HANGUL_TABLES.jongseong[code % 28]], key);
        return pair ? pair[/ jongseong-right /.test(part) ? 1 : 0] || null : null;
      }
      var pieces = caseStamp(profile.stamps[HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)]], key);
      if (!pieces || !Array.isArray(pieces[0])) {
        return null;
      }
      return inCluster ? pieces[Array.prototype.indexOf.call(parent.children, node)] || null : pieces[1];
    }
    var jamo = node.getAttribute("data-jamo");
    var stamp = caseStamp(profile.stamps[jamo], key);
    return stamp && Array.isArray(stamp[0]) ? caseStamp(splits.whole && splits.whole[jamo], key) : stamp;
  }

  var SHAPE_NODES = '[part~="choseong"], [part~="jungseong"], [part~="jongseong"], [part~="head"]';

  /* 고정 글꼴 모양이 정한 그림 문맥(직결식 초성 bar, 세벌식 받침 sebeol)을 자모 노드에 적는다 — 뼈대 고르기(skeletonFor)가 읽는다 */
  function markShapeDraw(root, profile) {
    Array.prototype.forEach.call(root.querySelectorAll(SHAPE_NODES), function (node) {
      var stamp = shapeStampFor(node, profile);
      if (stamp && profile.draw[stamp[5]]) {
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
    Array.prototype.forEach.call(host.querySelectorAll(SHAPE_NODES), function (node) {
      var stamp = shapeStampFor(node, profile);
      if (!stamp) {
        return;
      }
      var parent = node.parentNode;
      /* 짜임 고정은 짜임마다 한 도장 — 열쇠에 짜임을 더한다 */
      var key = stamp[5] + " " + node.getAttribute("data-jamo") +
        (profile.model === "case-fixed" ? " " + layoutCase(node) : "");
      var part = " " + (node.getAttribute("part") || "") + " ";
      var inCluster = Boolean(parent) && / cluster /.test(" " + (parent.getAttribute("part") || "") + " ");
      /* 합자 모음 조각·머리 옆 모음은 그 합자 모음, 겹받침 낱자는 그 겹받침까지 열쇠에 넣는다(ㄺ의 ㄹ과 ㄼ의 ㄹ은 자리가 다르다) */
      if (inCluster || / jungseong-tail /.test(part)) {
        var glyph = node.closest('[part~="glyph"]');
        var code = glyph ? glyph.getAttribute("data-source").charCodeAt(0) - HANGUL_BASE : -1;
        var jong = / jongseong /.test(part);
        key += "#" + (inCluster ? Array.prototype.indexOf.call(parent.children, node) : 1) +
          (code < 0 ? "" : jong ? HANGUL_TABLES.jongseong[code % 28] : HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)]);
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

  function glyphTextValid(text) {
    return typeof text === "string" && text.length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(text) &&
      !/[\ud800-\udbff](?![\udc00-\udfff])|(?:^|[^\ud800-\udbff])[\udc00-\udfff]/.test(text);
  }

  function normalizeFontGlyphs(input, check, path, version) {
    if (input === undefined) { return null; }
    if (version !== "2.0") {
      check.fail("DESIGN_GLYPHS_INVALID", path, "font glyph mappings require design version 2.0");
    }
    if (!Array.isArray(input)) {
      check.fail("DESIGN_GLYPHS_INVALID", path, "glyphs is an array of jamo mappings");
      return [];
    }
    var seen = Object.create(null);
    return input.map(function (entry, index) {
      var at = path + "[" + index + "]";
      if (!isRecord(entry) || typeof entry.jamo !== "string" || !/^[\u3131-\u318e]$/.test(entry.jamo) ||
          (entry.role !== undefined && !own(DESIGN_ROLES, entry.role))) {
        check.fail("DESIGN_GLYPHS_INVALID", at, "a glyph mapping names a compatibility jamo and optional role");
        return null;
      }
      if (Object.keys(entry).some(function (key) { return ["jamo", "role", "candidates", "selected", "locked"].indexOf(key) < 0; })) {
        check.fail("DESIGN_GLYPHS_INVALID", at, "unknown glyph mapping field");
      }
      var key = entry.jamo + "|" + (entry.role || "");
      if (seen[key]) { check.fail("DESIGN_GLYPHS_INVALID", at, "duplicate jamo and role mapping"); }
      seen[key] = true;
      var ids = Object.create(null);
      var candidates = Array.isArray(entry.candidates) ? entry.candidates : [];
      if (!candidates.length) { check.fail("DESIGN_GLYPHS_INVALID", at + ".candidates", "candidates is a nonempty array"); }
      var normalized = candidates.map(function (candidate, n) {
        if (!isRecord(candidate) || typeof candidate.id !== "string" || !DESIGN_SOURCE_ID.test(candidate.id) || ids[candidate.id] ||
            !glyphTextValid(candidate.text) || Object.keys(candidate).some(function (key) { return key !== "id" && key !== "text"; })) {
          check.fail("DESIGN_GLYPHS_INVALID", at + ".candidates[" + n + "]", "candidate needs a unique id and nonempty text without controls or invalid surrogates");
          return null;
        }
        ids[candidate.id] = true;
        return { id: candidate.id, text: candidate.text };
      }).filter(Boolean);
      if (entry.selected !== undefined && (typeof entry.selected !== "string" || !ids[entry.selected])) {
        check.fail("DESIGN_GLYPHS_INVALID", at + ".selected", "selected names a candidate in this mapping");
      }
      if (entry.locked !== undefined && typeof entry.locked !== "boolean") {
        check.fail("DESIGN_GLYPHS_INVALID", at + ".locked", "locked is boolean");
      }
      if (entry.locked && !entry.selected) { check.fail("DESIGN_GLYPHS_INVALID", at + ".locked", "a locked mapping requires selected"); }
      return { jamo: entry.jamo, role: entry.role || null, candidates: normalized, selected: entry.selected || null, locked: entry.locked === true };
    }).filter(Boolean);
  }

  /* 디자인 검증·정규화. check가 던지면(registerDesign) 고정한 정규화본, 모으면(validateDesign) null을 돌려준다. */
  function normalizeDesign(name, input, check) {
    if (!isRecord(input)) {
      check.fail("DESIGN_NOT_OBJECT", "", "must be an object");
      return null;
    }
    if (isRecord(input.editor) && own(input.editor, "glyphPreview")) {
      var preview = input.editor.glyphPreview;
      if (input.version !== "2.0" || !isRecord(preview) || typeof preview.seed !== "string" || typeof preview.jamoSeeds !== "boolean" ||
          Object.keys(preview).some(function (key) { return key !== "seed" && key !== "jamoSeeds"; })) {
        check.fail("DESIGN_GLYPHS_INVALID", "editor.glyphPreview", "glyphPreview requires version 2.0 and {seed:string,jamoSeeds:boolean}");
      }
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
    var composition = normalizeDesignComposition(input.composition, check);
    var fixed = layout && STAMPED_MODELS[LAYOUT_PROFILES[layout.profile].model] ? layout.profile : null;
    /* 모양이 밝힌 원칙(layoutProfiles[id].match — 규칙이 고를 수 있는 필드). 그 밖의 조건은 받아 그대로 지키되 알린다(ADR-030 §5) */
    var principle = layout ? LAYOUT_PROFILES[layout.profile].match : null;
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
        if (source.glyphs !== undefined) {
          sources[id].glyphs = normalizeFontGlyphs(source.glyphs, check, where + ".glyphs", input.version);
        }
        if (source.variationSettings !== undefined) {
          if (!isRecord(source.variationSettings) || Object.keys(source.variationSettings).some(function (axis) {
            return typeof source.variationSettings[axis] !== "number" || !isFinite(source.variationSettings[axis]);
          })) { check.fail("DESIGN_SOURCE_INVALID", where + ".variationSettings", "variationSettings maps axis names to finite numbers"); }
          else { sources[id].variationSettings = Object.assign({}, source.variationSettings); }
        }
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
      /* 모양의 원칙(ADR-030 §5, D5): 세벌식·직결식은 역할·자모로만 고른다고 밝혔다 — 이웃 모음·받침으로 고르는 규칙은 거부하지 않고
       * 받아 그대로 지키되(몰래 지우지 않는다) 원칙을 깬다고 알린다. 같은 역할·자모가 짜임에 따라 다른 원본으로 그려진다.
       * 설계 v1.2 L08의 거부를 대신한다 */
      if (principle) {
        ["vowelLayout", "hasFinal"].forEach(function (field) {
          if (match[field] !== undefined && principle.indexOf(field) < 0) {
            check.warn("DESIGN_FIXED_CONTEXT", where + ".match." + field, where + ".match uses " + field + ", but layout " + layout.profile +
              " (" + LAYOUT_PROFILES[layout.profile].model + ") keeps one drawing per jamo and role — the rule applies, so " + (jamo || "the jamo") +
              " is drawn differently by " + field);
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
      composition: composition,
      sources: sources,
      defaults: { source: defaults.source, method: defaultMethod },
      roleSources: roleSources,
      rules: rules,
      fallback: { sourceIds: fallbackIds.slice(), allowPrimitive: fallback.allowPrimitive !== false, onComposeFailure: onFailure }
    });
  }

  /* 배치(ADR-026) — 1.2 디자인은 등록된 프로파일과 revision을 적어야 한다. 적지 않은 1.0·1.1 디자인은 배치를 선택하지 않고 바탕 요소의 다음 설정을 물려받는다(null, ADR-031).
   * revision이 다르면 거부한다 — 다만 프로파일이 받는다고 적은 이전 revision(accepts)은 받아 지금 도장으로 그리고 진단
   * DESIGN_LAYOUT_REVISION_ACCEPTED를 남긴다(validateDesign의 warnings, 등록 때 콘솔 경고 한 번, fontInfo(host).layout.requested).
   * 세벌 고정 revision 1의 도장은 받침이 떨어지고 줄끼리 부딪혀 읽히지 않았다(2026-10-13) — 그 좌표를 지키는 것보다 이미 저장된
   * 디자인이 새 판에서 등록되는 것이 낫다. 자리마다 달라지는 변주(display.variationScope: occurrence)는 그것을 막는다고 밝힌 모양
   * (세벌식·직결식)에서 원칙을 깬다고 알린다(ADR-030 §5 — 설계 v1.2 L09의 거부를 대신한다).
   * 모으는 검사에서 revision만 틀렸으면 그 프로파일로 규칙을 마저 본다. */
  var DESIGN_VERSIONS = { "1.0": true, "1.1": true, "1.2": true, "2.0": true };
  var FIXED_COMPOUND_MEDIALS = "ㅘㅙㅚㅝㅞㅟㅢ";

  /* 짓는 방식(ADR-034 §3): "프리셋" 또는 { preset?, vowel?, coda?, pieces? }. 고르지 않아도 된다(없으면 null — 아래 수준을 물려받는다).
   * auto는 고르지 않은 것과 같다. 어느 판의 디자인에도 더할 수 있다(더하기만 하는 칸) */
  function normalizeDesignComposition(input, check) {
    if (input === undefined || input === null) {
      return null;
    }
    var bad = function (path, message) {
      check.fail("DESIGN_COMPOSITION_INVALID", path, message);
      return null;
    };
    var names = Object.keys(COMPOSITION_PRESETS).join(", ");
    if (typeof input === "string") {
      if (!own(COMPOSITION_PRESETS, input)) {
        return bad("composition", "composition is a preset (" + names + ") or { preset, vowel, coda, pieces }");
      }
      return input === "auto" ? null : { preset: input, vowel: null, coda: null, pieces: null };
    }
    if (!isRecord(input)) {
      return bad("composition", "composition is a preset (" + names + ") or { preset, vowel, coda, pieces }");
    }
    var out = { preset: null, vowel: null, coda: null, pieces: null };
    var ok = true;
    Object.keys(input).forEach(function (key) {
      if (["preset", "vowel", "coda", "pieces"].indexOf(key) < 0) {
        ok = false;
        bad("composition." + key, "composition has preset, vowel, coda and pieces only");
      }
    });
    if (input.preset !== undefined) {
      if (!own(COMPOSITION_PRESETS, input.preset)) {
        ok = false;
        bad("composition.preset", "composition.preset is one of " + names);
      } else if (input.preset !== "auto") {
        out.preset = input.preset;
      }
    }
    [["vowel", VOWEL_DEPTHS, "split, whole or syllable"], ["coda", CODA_DEPTHS, "split or whole"],
      ["pieces", COMPOSITION_PIECES, "none, pieces or origins"]].forEach(function (axis) {
      if (input[axis[0]] === undefined) {
        return;
      }
      if (typeof input[axis[0]] !== "string" || !own(axis[1], input[axis[0]])) {
        ok = false;
        bad("composition." + axis[0], "composition." + axis[0] + " is " + axis[2]);
      } else {
        out[axis[0]] = input[axis[0]];
      }
    });
    return ok && (out.preset || out.vowel || out.coda || out.pieces) ? out : null;
  }

  function normalizeDesignLayout(input, check) {
    if (input.version !== undefined && !own(DESIGN_VERSIONS, input.version)) {
      check.fail("DESIGN_VERSION_INVALID", "version", "version is 1.0, 1.1, 1.2 or 2.0");
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
      check.warn("DESIGN_FIXED_VARIATION", "display.variationScope", "layout " + layout.profile +
        " (" + profile.model + ") keeps one drawing per jamo — per-occurrence variation (display.variationScope) breaks it");
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
      if (state && host.isConnected && state.options.fontMeta &&
          (state.options.fontMeta.design === name || state.options.fontMeta.layoutDesign === name)) {
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
    if (entry.glyph) { copy.glyph = Object.assign({}, entry.glyph); }
    /* 짓는 방식의 조각 깊이로 고른 조립식이면 그 깊이(ADR-034) */
    if (entry.composition) { copy.composition = entry.composition; }
    return copy;
  }

  /* FontKku.planJamo(jamo, options) — 자모 하나의 조립 계획과 출처 기록(ADR-025, 실험). 화면에 그리지 않는다. options:
   * design(등록 이름), set(디자인 없을 때의 칸 계약 그림 세트), role(initial|medial|final — 기본은 자음 initial·모음 medial),
   * context(cho|bar|jong — 기본은 역할에서), layout(right|bottom|split-right), hasFinal, cells(디자인 없을 때 보이는 자모 칸).
   * 획은 자모 획순의 번호(0부터)로 돌려준다. 그림이 맡지 않은 획은 alias가 그 획을 긋는 그림(원소 그림 @…·원형 그림 ㅡ·ㆍ·ㅇ, 없으면 null). */
  function planJamo(jamo, options) {
    var opts = options || {};
    var text = String(jamo === undefined || jamo === null ? "" : jamo).trim();
    var rows = hoekRow(text) || (text === DOT_JAMO ? [["dot", DOT_JAMO]] : null);
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
      seedValue: typeof opts.seedValue === "number" ? opts.seedValue : null,
      candidate: opts.candidate || null,
      trace: [],
      pieces: planPieces(opts, design)
    };
    var out = [];
    planRequest({
      jamo: text,
      rows: rows,
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
        var result = {
          path: item.path.slice(), source: item.source, method: item.method, recipe: item.recipe,
          drawing: item.drawing || null, strokes: item.drawing ? item.strokes.slice() : [item.stroke], kind: item.kind || null,
          alias: item.drawing ? null : item.alias || null
        };
        if (item.glyph) { result.glyph = Object.assign({}, item.glyph); }
        return result;
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

  /* BEGIN GENERATED: scripts/build_rule_resolution.js — rule-resolution */
  var RULE_RESOLUTION = (function () {
    function fits(rule, req) {
      return rule.jamo === req.jamo && (!rule.role || rule.role === req.rootRole) &&
        (!rule.layout || rule.layout === req.layout) && (rule.hasFinal === null || rule.hasFinal === req.hasFinal);
    }

    function winner(design, req, field) {
      var best = null;
      design.rules.forEach(function (rule) {
        if (rule[field] && fits(rule, req) && (!best || rule.specificity > best.specificity)) {
          best = rule;
        }
      });
      return best;
    }

    function choice(kind, name, value, rule) {
      return { kind: kind, winner: name, value: value, rule: rule || null };
    }

    function source(design, req) {
      if (req.binding && req.binding.source) {
        return choice("binding", "binding", req.binding.source);
      }
      var rule = winner(design, req, "source");
      if (rule) { return choice("rule", rule.id, rule.source, rule); }
      if (req.inherited) { return choice("inherited", "inherited", req.inherited); }
      if (design.roleSources[req.rootRole]) {
        return choice("role", "roleSources." + req.rootRole, design.roleSources[req.rootRole]);
      }
      return choice("defaults", "defaults", design.defaults.source || null);
    }

    function bundle(design, req) {
      if (req.binding && req.binding.bundle) {
        return choice("binding", "binding", req.binding.bundle);
      }
      var rule = winner(design, req, "bundle");
      if (rule) { return choice("rule", rule.id, rule.bundle, rule); }
      return choice("defaults", "defaults", { method: design.defaults.method || "auto", recipe: null, bindings: null });
    }

    function fallbacks(design, req) {
      var rule = winner(design, req, "fallbackSources");
      return rule ? choice("rule", rule.id, rule.fallbackSources.slice(), rule) :
        choice("defaults", "fallback.sourceIds", (design.fallback.sourceIds || []).slice());
    }

    return { fits: fits, winner: winner, source: source, bundle: bundle, fallbacks: fallbacks };
  })();
  /* END GENERATED: scripts/build_rule_resolution.js — rule-resolution */

  function winningRule(design, req, field) {
    return RULE_RESOLUTION.winner(design, req, field);
  }

  function requestSource(design, req, why) {
    var choice = RULE_RESOLUTION.source(design, req);
    if (choice.kind === "binding" || choice.kind === "rule") { why.push(choice.winner); }
    return choice.value;
  }

  function requestBundle(design, req, why) {
    var choice = RULE_RESOLUTION.bundle(design, req);
    if (choice.kind === "binding" || choice.kind === "rule") { why.push(choice.winner); }
    return choice.value;
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

  /* 조각 자모의 제 뼈대를 대상 획 묶음의 중심선 범위에 맞춘다(원소 재료의 조립식, ADR-034 §4). 한 축이 0(곧은 획 하나)이면 그 축은
   * 대상의 가운데로, 원은 범위 비로 늘인다 */
  function fitSkeleton(own, target) {
    var from = strokesExtent(own);
    var to = strokesExtent(target);
    var axis = function (a0, a1, b0, b1) {
      var span = a1 - a0;
      return span > 1e-9 ? function (v) { return b0 + (v - a0) / span * (b1 - b0); } : function () { return (b0 + b1) / 2; };
    };
    var sx = from[2] - from[0] > 1e-9 ? (to[2] - to[0]) / (from[2] - from[0]) : 1;
    var sy = from[3] - from[1] > 1e-9 ? (to[3] - to[1]) / (from[3] - from[1]) : 1;
    var mx = axis(from[0], from[2], to[0], to[2]);
    var my = axis(from[1], from[3], to[1], to[3]);
    return own.map(function (stroke) {
      if (stroke.ring) {
        return { ring: [mx(stroke.ring[0]), my(stroke.ring[1]), stroke.ring[2] * sx, stroke.ring[3] * sy] };
      }
      return stroke.map(function (piece) { return [mx(piece[0]), my(piece[1]), mx(piece[2]), my(piece[3]), piece[4], piece[5]]; });
    });
  }

  /* 짓는 방식의 조각 깊이(ADR-034 §2): 그 깊이 표가 이 자모에 조립식을 두고, 자모마다 고른 디자인 규칙·조각 binding이 없을 때만 —
   * pieces는 맨 위 요청만 한 번, origins는 조각 안에서도. 지정한 조합처럼 원본 그림이 있어도 조각으로 짓는다 */
  function levelBundle(env, req, design) {
    var depth = env.pieces;
    if (!depth || !RECIPE_LEVELS[depth] || (depth === "pieces" && req.level > 0) || req.binding) {
      return null;
    }
    var recipe = RECIPE_LEVELS[depth][req.jamo];
    if (!recipe) {
      return null;
    }
    if (design && RULE_RESOLUTION.bundle(design, req).kind !== "defaults") {
      return null;
    }
    return { method: "compose", recipe: recipe, bindings: null, level: depth };
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
  function placedStrokes(req, rows, part, geometry, ownFit) {
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
      /* 원소 재료가 고른 조립식을 따른다(ADR-034 §4 — ADR-025 §5의 "재료 없이도 따른다"): 조각 자모의 제 뼈대 획을 그 획 묶음의
       * 자리(중심선 범위)에 맞춰 긋는다 — ㅎ = ㅗ + ㅇ이면 위는 ㅗ의 점·가로획, 아래는 ㅇ. 그림·글꼴 재료는 지금처럼 그 자리에 그림을
       * 맞춘다. 제 뼈대가 없는 조각(점 ㆍ)은 대상 획 그대로다 */
      if (ownFit && geometry) {
        var mine = ownSkeleton(part.jamo, req.context);
        var mineRows = hoekRow(part.jamo);
        if (mine && mineRows && mine.length === mineRows.length && picked.strokes.length) {
          return { strokes: fitSkeleton(mine, picked.strokes), rows: mineRows.slice(), orders: mineRows.map(function () { return null; }) };
        }
      }
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

  /* planJamo의 조각 깊이: opts.pieces(none·pieces·origins) > opts.composition(프리셋) > 디자인 composition. 모르는 값은 TypeError */
  function planPieces(opts, design) {
    if (opts.pieces !== undefined && opts.pieces !== null) {
      if (!own(COMPOSITION_PIECES, opts.pieces)) {
        throw new TypeError("font-kku: planJamo pieces is none, pieces or origins (got " + JSON.stringify(opts.pieces) + ")");
      }
      return opts.pieces === "none" ? "" : opts.pieces;
    }
    if (opts.composition !== undefined && opts.composition !== null) {
      if (!own(COMPOSITION_PRESETS, opts.composition)) {
        throw new TypeError("font-kku: planJamo composition is a preset (" + Object.keys(COMPOSITION_PRESETS).join(", ") + ")");
      }
      var preset = COMPOSITION_PRESETS[opts.composition];
      return preset && preset.pieces !== "none" ? preset.pieces : "";
    }
    var axes = design ? designCompositionAxes(design.composition) : null;
    return axes && axes.pieces && axes.pieces !== "none" ? axes.pieces : "";
  }

  function fontGlyphChoice(source, req, env) {
    if (!source.glyphs) { return null; }
    var matches = source.glyphs.filter(function (entry) { return entry.jamo === req.jamo && (!entry.role || entry.role === req.rootRole); });
    var mapping = matches.filter(function (entry) { return entry.role; })[0] || matches[0];
    if (!mapping) { return null; }
    var selected = mapping.selected;
    var reason = selected ? "selected" : "default";
    if (mapping.locked) {
      reason = "locked";
    } else if (env.candidate && !req.path.length) {
      selected = env.candidate;
      reason = "css";
    } else if (typeof env.seedValue === "number" && isFinite(env.seedValue)) {
      selected = mapping.candidates[Math.min(mapping.candidates.length - 1, Math.floor(Math.max(0, env.seedValue) * mapping.candidates.length))].id;
      reason = "seed";
    }
    var candidate = selected ? mapping.candidates.filter(function (entry) { return entry.id === selected; })[0] : mapping.candidates[0];
    return candidate ? { text: candidate.text, candidate: candidate.id, selection: reason } : { error: "GLYPH_CANDIDATE_MISSING" };
  }

  function planRequest(req, env, out) {
    var design = env.design;
    var why = [];
    var sourceId = design ? requestSource(design, req, why) : env.sourceId;
    var set = design ? sourceSet(design, sourceId) : env.set;
    var bundle = design ? requestBundle(design, req, why) : AUTO_BUNDLE;
    var leveled = levelBundle(env, req, design);
    if (leveled) {
      bundle = leveled;
    }
    /* 보이는 칸(ADR-025 §7): 디자인 소스의 cells — 그림 세트를 원형 8·기본 24만 그린 셈 치고 미리 보기. 없으면 모두 */
    var visible = function (id) {
      return design ? design.sources[id] && design.sources[id].cells || null : env.cells || null;
    };
    var depth = visible(sourceId);
    var entry = {
      path: req.path, jamo: req.jamo, role: req.rootRole || null, source: sourceId, method: bundle.method,
      recipe: null, rules: why, result: "strokes", status: "ok", diagnostic: null
    };
    if (leveled) {
      entry.composition = leveled.level;
    }
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
        var mapped = mappedStroke(index);
        if (mapped) {
          push(mapped, null);
        } else if (base) {
          push({ drawing: base, strokes: [stroke] }, itemSet);
        } else {
          push(strokeItem(index, itemSet), itemSet);
        }
      });
    };
    var mappedStroke = function (index) {
      var source = design && design.sources[sourceId];
      if (!source || !source.glyphs) { return null; }
      var row = rows[index] || [];
      var compat = row[1] === "ㅣ" || row[1] === "ㅡ" ? row[1] : row[0] === "ring" ? "ㅇ" : row[0] === "dot" ? DOT_JAMO : row[0] === "v" ? "ㅣ" : "ㅡ";
      var choice = fontGlyphChoice(source, Object.assign({}, req, { jamo: compat, path: req.path.concat("stroke-" + index) }), env);
      if (!choice || choice.error) {
        entry.status = "error";
        entry.diagnostic = "GLYPH_MAPPING_MISSING";
        return null;
      }
      return { drawing: choice.text, strokes: [req.strokes[index]], font: true, glyph: choice };
    };
    var direct = function (fromSet, fromSource) {
      var source = design && design.sources[fromSource || sourceId];
      var font = source && source.kind === "font";
      if (font) {
        var glyph = fontGlyphChoice(source, req, env);
        if (source.glyphs && !glyph) {
          if (env.candidate && !req.path.length) {
            entry.status = "error"; entry.result = "none"; entry.diagnostic = "GLYPH_CANDIDATE_MISSING";
            return true;
          }
          return false;
        }
        if (glyph && glyph.error) {
          entry.status = "error";
          entry.result = "none";
          entry.diagnostic = glyph.error;
          return true;
        }
        /* 글꼴 글자 재료(ADR-025 §9): 글꼴에 그 자모가 있다고 보고 낱자를 쓴다 — 실제 글자인지는 측정 뒤 identity로 알린다 */
        entry.result = "direct";
        if (glyph) { entry.glyph = glyph; }
        push({ drawing: glyph ? glyph.text : req.jamo, strokes: req.strokes, font: true, glyph: glyph }, null, fromSource);
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

    if (bundle.method !== "compose" && !req.compose && direct(set)) {
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
    var finishComposition = function (mark) {
      var failed = bundle.method === "compose" && env.trace.slice(first + 1).some(function (traced) {
        return traced.status === "error";
      });
      if (failed && bundle.level) {
        /* 짓는 방식의 조각 깊이로 지을 재료가 없다 — 그 자모는 한 단계 위(자모 그대로)로 두고 까닭을 남긴다(ADR-034 §2·§4, 몰래 바꾸지 않는다) */
        out.length = mark;
        entry.status = "degraded";
        entry.diagnostic = "COMPOSITION_UNSUPPORTED";
        entry.recipe = null;
        if (!direct(set)) {
          entry.result = "strokes";
          oneByOne(set);
        }
        return;
      }
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
    var composeParts = function (picks) {
      var mark = out.length;
      entry.recipe = recipe.id;
      entry.result = "composed";
      recipe.parts.forEach(function (part, index) { planRequest(child(part, picks[index]), env, out); });
      finishComposition(mark);
    };
    if ((material || bundle.recipe) && recipe && PAIR_OPERATIONS[recipe.operation]) {
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
      var ownFit = !material && !/[\u314F-\u3163]/.test(req.jamo);
      composeParts(recipe.parts.map(function (part) { return placedStrokes(req, rows, part, env.geometry, ownFit); }));
      return;
    }
    if (recipe && recipe.operation === "add" && ((!material && bundle.recipe) || bundle.bindings ||
        (design && design.sources[sourceId].glyphs))) {
      var basePart = recipe.parts[0];
      var lineage = [basePart.jamo];
      for (var ancestor = addBase(RECIPE_DEFAULTS[basePart.jamo]); ancestor; ancestor = addBase(RECIPE_DEFAULTS[ancestor])) {
        lineage.push(ancestor);
      }
      var basePick = { strokes: [], rows: [], orders: [] };
      var added = [];
      req.strokes.forEach(function (stroke, index) {
        if (rows[index] && lineage.indexOf(rows[index][1]) >= 0) {
          basePick.strokes.push(stroke);
          basePick.rows.push(rows[index]);
          basePick.orders.push(req.orders ? req.orders[index] : index);
        } else {
          added.push(index);
        }
      });
      if (basePick.strokes.length) {
        var addMark = out.length;
        entry.recipe = recipe.id;
        entry.result = "composed";
        planRequest(child(basePart, basePick), env, out);
        added.forEach(function (index) { push(mappedStroke(index) || strokeItem(index, set), set); });
        finishComposition(addMark);
        return;
      }
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

  /* 네모꼴에서 글꼴 기본이 아닌 통짜 모음을 고르면 그림 세트도 통짜 모음을 조각 그림으로 짓는다 — 합자 모음 칸 그림은 제 비례(ㅗ 꼭지가
   * 높다)라 그 글꼴의 기본 나누기 자리에 놓으면 초성과 겹친다(sebul ㅎ 동그라미가 메워졌다). 고정 모양과 같고, 조각을 기본 나누기의 조각
   * 자리로 옮기는 것은 fitSquareSplits(ADR-034 §5). 기본 나누기가 통짜면 그대로(칸 그림) */
  function squareWholeVowels(host, options) {
    var meta = options.fontMeta;
    if (!meta || fixedLayout(meta) || !options.depthOptions || options.depthOptions.vowel !== "whole") {
      return false;
    }
    var style = computedStyleFor(host);
    return squareFitOn(style) && squareBaseDepth(style).vowel !== "whole";
  }

  /* 지금 짓는 바탕 요소가 squareWholeVowels인지 — 짓는 동안만(renderDocument와 같은 짓기 문맥) */
  var renderSquareWhole = false;

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
      trace: null,
      pieces: meta.compositionPieces || ""
    };
    /* 고정 글꼴 모양(세벌식·직결식)의 통짜 모음 노드는 디자인이 없으면 조각(ㅗ + ㅣ)으로 짓는다 — 그림 세트의 합자 모음 칸은 표준 잉크
     * 상자 비례(ㅗ 꼭지가 높다)라 모양의 초성과 겹친다. 조각 획·그림을 낱 나누기의 조각 자리로 옮기는 것은 fitFixedParts(ADR-030 §4) */
    var fixedWhole = !design && (fixedLayout(meta) || renderSquareWhole) ? function (node, text) {
      return Boolean(HANGUL_TABLES.splitJungseong[text]) && / jungseong /.test(" " + node.getAttribute("part") + " ") &&
        !/ jungseong-(?:base|tail) /.test(" " + node.getAttribute("part") + " ");
    } : null;
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
      var drawnLetters = [];
      skeleton.forEach(function (group, index) {
        var plan = [];
        var dots = [];
        var rest = [];
        var strokes = [];
        var top = requests ? requests[index] : null;
        var first = env.trace.length;
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
          compose: Boolean(fixedWhole && !standalone && fixedWhole(node, text)),
          level: 0
        }, env, plan);
        var whole = plan.length === 1 ? drawnLetterSplit(plan[0], group) : 0;
        plan.forEach(function (item) {
          var hoek = doc.createElement("span");
          hoek.setAttribute("part", "hoek");
          if (head) {
            hoek.setAttribute("data-fy-head-part", index ? "medial" : "initial");
          }
          count += 1;
          if (item.drawing) {
            hoek.setAttribute("data-hoek-drawing", item.drawing);
            appendDrawing(hoek, item.set, item.drawing, item.strokes, axes, doc, whole);
            if (whole) {
              letterGroups.push([index, [hoek.children[0]], [hoek.children[1]]]);
              drawnLetters.push([index, item]);
            }
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
          strokes.push([item.drawing ? -1 : item.index, Array.prototype.slice.call(hoek.children), item.path]);
          node.appendChild(hoek);
        });
        if (dots.length && rest.length) {
          dotGroups.push([dots, rest]);
        }
        /* 짝 조립식(병서·겹받침)으로 지은 묶음 — 그린 낱자·조각의 획은 짝 단계 조각 id(path의 맨 위 요청 다음 칸)로 낱자를 가른다 */
        var traced = env.trace[first];
        var recipe = traced && traced.recipe ? JAMO_RECIPES[traced.recipe] : null;
        /* 채운 도형(붓 칠 세트)은 범위와 함께 늘어나 굵기가 그림에 들어 있다 — 낱자 상자를 좁히면 붓 기둥이 가늘어진다(drawnLetterSplit과 같은 조건).
         * 그린 낱자(drawing)도, 원소 그림으로 그은 획(alias — @line 등)도 */
        var filled = plan.some(function (item) {
          var key = item.drawing || item.alias;
          var cell = key && item.set && item.set.cells ? item.set.cells[key] : null;
          return Boolean(cell && cell.some(function (shape) { return shape.fill; }));
        });
        var pair = !filled && recipe && (recipe.operation === "double" || recipe.operation === "final-pair") ?
          { at: top ? top.path.length : 0, ids: recipe.parts.map(function (part) { return part.id; }) } : null;
        var letters = whole ? null : letterMembers(group[0], group[1].length, strokes, pair);
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
      /* 낱자로 가른 그림의 마디: 뼈대의 낱자 범위를 세트가 밝힌 낱자 범위(parts, 칸 좌표 → 단위 좌표)로 옮긴다 — 낱자 틈 맞춤과
       * 밀도 굵기 계수가 그림의 낱자 자리를 잰다 */
      if (DENSITY_LINES && drawnLetters.length) {
        var lines = DENSITY_LINES.get(node).slice();
        drawnLetters.forEach(function (drawn) {
          /* 쐐기 낱자(ㅆ·ㅉ)는 낱자 틈 맞춤이 건너뛰므로(letterFits) 마디도 옮기지 않는다 — 밀도 굵기 계수가 그대로다 */
          if (!slantedLetters(lines[drawn[0]])) {
            lines[drawn[0]] = drawnLetterLines(lines[drawn[0]], drawn[1]);
          }
        });
        DENSITY_LINES.set(node, lines);
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

  /* 낱자 둘의 마디 — strokes는 묶음의 그린 것마다 [획 차례(그림이면 −1), 마디들, 요청 path]. 획이 모두 제 차례로 하나씩 그려졌으면
   * 획 차례로 가른다(그림 한 장이 두 낱자를 함께 그리면 나눌 수 없다). 묶음이 짝 조립식(병서·겹받침)으로 지어졌으면(pair — { at: 짝
   * 조각 id의 path 차례, ids: [첫 조각 id, 둘째 조각 id] }) 그린 낱자·조각을 그 짝 단계 조각 id로 가른다 — path의 다른 칸은 보지
   * 않는다(ㅂ 조립식의 left·right 기둥). 가를 수 없는 것이 하나라도 있으면 null. [첫 낱자 마디들, 둘째 낱자 마디들] */
  function letterMembers(jamo, count, strokes, pair) {
    var split = letterSplit(jamo);
    if (!split) {
      return null;
    }
    var out = [[], []];
    if (strokes.length === count && strokes.every(function (item, at) { return item[0] === at; })) {
      strokes.forEach(function (item) {
        Array.prototype.push.apply(out[item[0] < split ? 0 : 1], item[1]);
      });
      return out;
    }
    if (!pair || !strokes.every(function (item) {
      var side = item[2] && item[2].length > pair.at ? pair.ids.indexOf(item[2][pair.at]) : -1;
      if (side !== 0 && side !== 1) {
        return false;
      }
      Array.prototype.push.apply(out[side], item[1]);
      return true;
    }) || !out[0].length || !out[1].length) {
      return null;
    }
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
  /* 쐐기 낱자(한 낱자에 빗금 마디가 둘 — ㅅ·ㅈ의 두 다리: ㅆ·ㅉ·ㄳ·ㄵ·ㄽ·ㅄ)는 좁히면 두 다리가 모여 쐐기로 뭉친다 — 발끝이 닿는 것이
   * 보통 꼴이라 낱자 틈 맞춤이 둔다. 빗금 다리가 하나인 세로 모음 옆 ㄱ(까·꺼·끼)은 좁혀도 뭉치지 않아 맞춘다 — 원소 획·그린 낱자
   * (쪼갠 병서 칸, 짝으로 놓은 그린 낱자) 모두 같은 규칙이다. 예전에는 원소 획이 빗금 하나에도 건너뛰어 두 ㄱ이 0.13em 겹쳤다 */
  function slantedLetters(lines) {
    var count = [0, 0];
    return lines.some(function (line) {
      var slanted = (line[7] === 0 || line[7] === 1) && line[4] !== 2 && Math.abs(line[0] - line[2]) > 1e-6 && Math.abs(line[1] - line[3]) > 1e-6;
      return slanted && (count[line[7]] += 1) > 1;
    });
  }

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
      if (!a || !b || slantedLetters(lines) || !(a[0] + a[1] < b[0] + b[1])) {
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

  /* 노드의 간격 마디 — 머리 음절이면 2층 재귀가 옮긴 자리로, 고정 모양의 통짜 모음이면 앞·뒤 조각을 옮긴 자리로(묶음 하나를 앞 조각
   * 마디 수 split에서 가른다 — { split, parts }) */
  function densityGroups(node) {
    var groups = DENSITY_LINES ? DENSITY_LINES.get(node) : null;
    var fits = groups ? DENSITY_FITS.get(node) : null;
    var move = function (line, fit) {
      return fit ? remapUnit({ line: line.slice(0, 4).concat([0, 0]) }, fit[0], fit[1]).line.slice(0, 4).concat(line.slice(4)) : line;
    };
    return !groups ? [] : !fits ? groups : groups.map(function (lines, index) {
      var fit = fits[index];
      if (fit && fit.parts) {
        return lines.map(function (line, at) { return move(line, fit.parts[at < fit.split ? 0 : 1]); });
      }
      return lines.map(function (line) { return move(line, fit); });
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

  /* 그림 하나를 획들의 상자(뼈대 좌표 → 노드 em)에 맞춰 놓는다. split(첫 낱자의 도형 수)이면 낱자마다 원소 하나 — 둘 다 같은
   * 상자·viewBox에 제 낱자의 도형만 담아, 낱자 틈 맞춤(balanceElementNode)이 낱자를 따로 옮길 수 있다 */
  function appendDrawing(hoek, set, key, strokes, axes, doc, split) {
    (split ? [0, 1] : [-1]).forEach(function (letter) {
      var span = doc.createElement("span");
      span.setAttribute("part", "element");
      span.setAttribute("data-element", "box");
      placeElement(span, { box: strokesExtent(strokes) }, axes);
      span.appendChild(boxCell(set, key, doc, letter < 0 ? null : [letter, split]));
      hoek.appendChild(span);
    });
  }

  /* 낱자로 가르는 병서(세트 칸의 parts가 듣는 자모) — 겹받침 칸의 parts는 쓰지 않는다(문서 계약: 병서 칸만) */
  var DRAWN_DOUBLES = "ㄲㄸㅃㅆㅉ";

  /* 칸 계약 세트의 병서 그림(ㄲ·ㄸ·ㅃ·ㅆ·ㅉ 칸 하나가 두 낱자를 함께 그렸다)을 낱자로 가를 수 있으면 첫 낱자의 도형 수, 아니면 0.
   * 묶음 전체를 그 그림 하나가 맡고, 세트가 칸의 낱자 범위(parts)를 밝혔고, 도형이 획마다 하나(획순)이고 채운 도형이 없을 때만 —
   * 그림 한 장은 굵기가 그대로(non-scaling-stroke)인 채 늘어나 좁은 자리(세벌)에서 두 낱자가 붙었다 */
  function drawnLetterSplit(item, group) {
    if (DRAWN_DOUBLES.indexOf(String(group[0]).charAt(0)) < 0) {
      return 0;
    }
    var set = item.drawing && !item.font ? item.set : null;
    var shapes = set && set.frame === "box" && set.cellParts && set.cellParts[item.drawing] ? set.cells[item.drawing] : null;
    var split = shapes && item.strokes === group[1] ? letterSplit(group[0]) : 0;
    if (!split || shapes.length !== strokeCount(group[0]) || shapes.some(function (shape) { return shape.fill; })) {
      return 0;
    }
    return split;
  }

  /* 낱자로 가른 그림 item의 묶음 마디: 낱자마다 마디의 가로 범위를 세트의 낱자 범위(parts — 칸 좌표, 그림 상자 = 획들의 상자)로 옮긴다 */
  function drawnLetterLines(lines, item) {
    var parts = item.set.cellParts[item.drawing];
    var cell = item.set.cellBoxes[item.drawing] || item.set.box;
    var unit = strokesExtent(item.strokes);
    var x = function (v) { return unit[0] + (v - cell[0]) / (cell[2] - cell[0]) * (unit[2] - unit[0]); };
    var extent = function (letter) {
      var xs = [];
      lines.forEach(function (line) {
        if (line[7] === letter) {
          xs.push(line[0], line[2]);
        }
      });
      return xs.length ? [Math.min.apply(null, xs), Math.max.apply(null, xs)] : null;
    };
    var from = [extent(0), extent(1)];
    if (!from[0] || !from[1]) {
      return lines;
    }
    return fitLetterLines(lines, { from: from, to: parts.map(function (part) { return [x(part[0]), x(part[2])]; }) });
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

  /* 칸 계약 그림 하나의 <svg>. viewBox는 세트가 밝힌 그림 범위(box)라 그 범위가 놓일 상자를 채운다. letter([낱자 0|1, 첫 낱자의
   * 도형 수])면 그 낱자의 도형만 */
  function boxCell(set, key, doc, letter) {
    var cache = set.templates ? set.templates.get(doc) : null;
    if (!cache) {
      cache = Object.create(null);
      if (set.templates) {
        set.templates.set(doc, cache);
      }
    }
    var id = letter ? key + "#" + letter[0] : key;
    if (!cache[id]) {
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
      set.cells[key].forEach(function (shape, index) {
        var element;
        if (letter && (index < letter[1] ? 0 : 1) !== letter[0]) {
          return;
        }
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
      cache[id] = svg;
    }
    return cache[id].cloneNode(true);
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
            var stamp = profile ? shapeStampFor(node, profile) : null;
            work.push([node, follow, stamp ? String(stamp[8]) : ""]);
          }
        });
      }
    });
    var reads = work.map(function (item) {
      var style = computedStyleFor(item[0]);
      var match = style ? /matrix\(([^)]+)\)/.exec(style.transform || "") : null;
      var plus = elementPlus(style);
      return {
        m: match ? match[1].split(",").map(Number) : [1, 0, 0, 1],
        /* 획 굵기(바탕 요소에서 굳힌 길이 + 자모 보정의 획 두께 --fy-el-plus, ADR-030 §7)를 노드 em으로 */
        w: style ? (parseFloat(style.getPropertyValue("--fy-el-w")) + plus) / (parseFloat(style.fontSize) || 1) : NaN,
        plus: plus
      };
    });
    work.forEach(function (item, index) {
      /* 획 두께 보정이 있는 고정 모양 노드는 모양 값의 밀도 굵기 계수(프로파일 굵기로 셈했다)를 실제 굵기로 다시 셈한다 */
      balanceElementNode(item[0], reads[index].m, reads[index].w, item[1] || reads[index].plus !== 0, item[2]);
    });
  }

  /* 자모 보정의 획 두께(--fy-jamo-stroke + --fy-case-stroke + --fy-ctx-stroke + --fy-syl-stroke, 코어가 노드에서 길이로 굳힌 --fy-el-plus, px) —
   * 없거나 읽을 수 없으면 0 */
  function elementPlus(style) {
    var plus = style ? parseFloat(style.getPropertyValue("--fy-el-plus")) : NaN;
    return plus > 0 || plus < 0 ? plus : 0;
  }

  /* 노드 하나의 굵기 보정 — m은 노드의 계산된 변환 [a, b, c, d], w는 노드에서 보이는 획 굵기(노드 em), shapeDensity는 고정 글꼴
   * 모양의 밀도 굵기 계수 문자열(코어 CSS가 --fy-shape-density로 같은 값을 준다, 아니면 ""). 밀도 굵기 계수를 정하고
   * (모양 값, 아니면 strokeDensity) 그 굵기로 마디·원·그림 상자를 다시 놓은 뒤(꼭지 틈은 dotShifts), 굵기 되돌림을 적는다.
   * 정적 렌더러의 원소 획 표(scripts/generate_sidecar_tables.js)가 이 함수와 아래 셈을 그대로 빌려 굳힌다(ADR-027) —
   * DOM은 노드·마디의 style과 [part="element"]·칠 그림 찾기만 쓴다. */
  function balanceElementNode(node, m, w, follow, shapeDensity) {
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
    /* 밀도 굵기 계수(--fy-el-density): 모양 값(코어 CSS가 --fy-shape-density에서 받는다), 아니면 뼈대로 셈한다. 모양 값은 그 값을 지은 굵기
     * (프로파일 stroke, sebul 원소 굵기 0.1em)의 셈이라, 페이지가 굵기를 바꾸면(follow) 그 굵기로 다시 셈해 노드에 적는다 —
     * 같은 바탕 요소의 같은 도장은 같은 굵기라 고정성(L01)은 그대로다. 칠 그림(붓 세트)은 굵기가 그림에 있어 1이다.
     * 그 굵기로 다시 놓는다 */
    var stamped = shapeDensity || "";
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
   * 기기 글꼴(완성형 머리 글자)·글꼴 팔레트 잎은 그대로다. 잴 수 없으면 뼈대 쌓기가 남는다. 고정 글꼴 모양(세벌식·직결식, ADR-030 §4)은
   * 시험 음절을 재지 않는다 — 머리를 풀어 그렸을 때의 초성과 ㅗ·ㅜ·ㅡ 조각 자리가 모양 값 표에 있으니 그 두 잉크 자리로 옮긴다
   * (fixedHeadRegions — 머리의 모양 값이 그 두 잉크의 합 상자다). */
  var HEAD_BASE_UNITS = typeof WeakMap === "function" ? new WeakMap() : null;
  var HEAD_PARTS = ["initial", "medial"];

  /* 자리 맞추기 한 번: 고정 모양의 합친 노드 → 네모꼴 머리 음절(2층 재귀) → 네모꼴의 기본이 아닌 나누기(ADR-034 §5, 머리 음절도
   * 기본 나누기가 아니면 그 자리로 다시 옮긴다) */
  function fitHeadSyllables(hosts) {
    fitHeadParts(hosts);
    fitSquareSplits(hosts);
  }

  function fitHeadParts(hosts) {
    if (!ELEMENT_UNITS || !HEAD_BASE_UNITS) {
      return;
    }
    fitFixedParts(hosts);
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
          fitPartSpans(node, box, entry.stroke, regions, HEAD_PARTS.map(function (part) {
            return node.querySelectorAll(':scope > [part="hoek"][data-fy-head-part="' + part + '"] [part="element"]');
          }), null);
        });
      });
    });
  }

  /* 노드 하나의 두 묶음(머리 음절의 초성·모음, 고정 모양 통짜 모음의 앞·뒤 조각)을 regions 비례로 옮긴다 — partSpans는 묶음마다
   * [part="element"] 목록. regions가 없으면(잴 수 없었다) 처음 자리 그대로. lineSplit은 뼈대 묶음 하나를 앞 조각 마디 수에서 가를 때
   * (통짜 모음), 아니면 null(머리 음절 — 뼈대 묶음이 곧 두 묶음). 밀도 굵기 계수는 옮긴 자리의 간격으로 셈한다(DENSITY_FITS) */
  function fitPartSpans(node, box, stroke, regions, partSpans, lineSplit) {
    var targets = regions ? headTargets(regions, box, stroke) : null;
    var axes = elementAxes(box, stroke[0], stroke[1]);
    var fits = partSpans.map(function (spans, index) {
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
    if (DENSITY_FITS) {
      DENSITY_FITS.set(node, lineSplit === null ? fits : [{ split: lineSplit, parts: fits }]);
    }
  }

  /* fitPartSpans와 같은 맞추기를 단위 자리 targets(묶음마다 [x0, y0, x1, y1], elementAxes의 0–1)로 바로 — 네모꼴 나누기 맞춤
   * (fitSquareSplits)은 노드 상자 밖일 수도 있는 자리를 준다. fitPartSpans는 정적 렌더러의 원소 표가 빌려 가는 선언이라
   * (scripts/generate_sidecar_tables.js RUNTIME_ELEMENT_DECLS) 그 몸을 건드리지 않고 따로 둔다 */
  function fitPartTargets(node, box, stroke, targets, partSpans, lineSplit) {
    var axes = elementAxes(box, stroke[0], stroke[1]);
    var fits = partSpans.map(function (spans, index) {
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
    if (DENSITY_FITS) {
      DENSITY_FITS.set(node, lineSplit === null ? fits : [{ split: lineSplit, parts: fits }]);
    }
  }

  /* 고정 글꼴 모양(세벌식·직결식)의 합친 노드 안 자모(ADR-030 §4 — 직결식은 합친 덩어리 안 자모도 다른 곳과 같은 자리). 머리 음절
   * 노드(호)의 초성·모음 두 획 묶음과 통짜 모음 노드(ㅚ)의 앞·뒤 조각 획을, 그 음절을 풀어 그렸을 때(모음 낱)의 노드 자리 — 모양 값 표의
   * 초성·조각 값을 표준 잉크 상자에 건 잉크 — 로 옮긴다. 노드의 모양 값이 그 두 잉크의 합 상자라 시험 음절을 재지 않는다. 획을 조각으로
   * 가르는 것은 획의 속한 자모(data-hoek-letter = ㅗ·ㅜ·ㅡ면 앞 조각) — 그림 한 장으로 그린 자모(칸 계약 세트의 ㅚ 칸)는 가를 수
   * 없어 그대로다. 원소·SVG 재료만(기기 글꼴은 완성 글자 하나) */
  function fitFixedParts(hosts) {
    if (!ELEMENT_UNITS || !HEAD_BASE_UNITS) {
      return;
    }
    var work = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var meta = state && state.options.fontMeta;
      var profile = fixedLayout(meta);
      if (!profile || (meta.face !== "element" && meta.face !== "svg") || !host.isConnected || !profile.cell) {
        return;
      }
      var root = getManagedRoot(host);
      var reference = inkBoxes(meta.inkBoxes);
      if (!root || !reference || typeof root.querySelectorAll !== "function") {
        return;
      }
      var nodes = Array.prototype.filter.call(root.querySelectorAll('[part~="head"], [part~="jungseong"]:not([part~="jungseong-base"]):not([part~="jungseong-tail"])'),
        function (node) {
          return reference[node.getAttribute("data-jamo")] && node.querySelector(':scope > [part="hoek"]') &&
            (/ head /.test(" " + node.getAttribute("part") + " ") || Array.isArray((caseStamp(profile.stamps[node.getAttribute("data-jamo")], "c") || [])[0]));
        });
      if (!nodes.length) {
        return;
      }
      if (unrenderedHost(host)) {
        deferHost(host);
        return;
      }
      nodes.forEach(function (node) {
        work.push({ node: node, profile: profile, reference: reference, stroke: INK_BOXES[meta.inkBoxes].stroke });
      });
    });
    /* 읽기 한 번(노드에서 보이는 획 굵기), 쓰기 한 번 */
    work.forEach(function (item) {
      item.seen = nodeStroke(computedStyleFor(item.node), item.stroke);
    });
    work.forEach(function (item) {
      var node = item.node;
      var text = node.getAttribute("data-jamo");
      var head = / head /.test(" " + node.getAttribute("part") + " ");
      var regions = fixedPartRegions(node, item.profile, item.reference, head);
      if (head) {
        fitPartSpans(node, item.reference[text], item.seen, regions, HEAD_PARTS.map(function (part) {
          return node.querySelectorAll(':scope > [part="hoek"][data-fy-head-part="' + part + '"] [part="element"]');
        }), null);
        return;
      }
      /* 획의 속한 자모 — 원소 획은 data-hoek-letter, 조각 그림은 그 그림의 자모(data-hoek-drawing). 앞 조각은 합자 모음의 ㅗ·ㅜ·ㅡ */
      var split = HANGUL_TABLES.splitJungseong[text];
      var base = split ? JAMO_TO_COMPAT[split.parts[0]] : null;
      var hoeks = node.querySelectorAll(':scope > [part="hoek"]');
      var letterOf = function (hoek) {
        return hoek.getAttribute("data-hoek-letter") || (hoek.getAttribute("data-hoek-drawing") || "").charAt(0);
      };
      var parts = [[], []];
      Array.prototype.forEach.call(hoeks, function (hoek) {
        Array.prototype.push.apply(parts[letterOf(hoek) === base ? 0 : 1], hoek.querySelectorAll('[part="element"]'));
      });
      /* 두 조각으로 갈려야 옮긴다 — 그림 한 장으로 그린 합자 모음(디자인이 고른 ㅚ 칸)은 그대로 */
      if (!base || !parts[0].length || !parts[1].length) {
        return;
      }
      fitPartSpans(node, item.reference[text], item.seen, regions, parts, wholeLineSplit(node, text, base));
    });
  }

  /* 통짜 노드(합자 모음·겹받침) 뼈대의 밀도 마디에서 앞 조각(획의 자모가 lead) 획의 마디 수 — 앞 조각 획이 먼저다 */
  function wholeLineSplit(node, text, lead) {
    var skeleton = skeletonFor(node, text);
    var rows = skeleton && skeleton.length === 1 ? hoekRow(skeleton[0][0]) || [] : [];
    var lineSplit = 0;
    (skeleton && skeleton.length === 1 ? skeleton[0][1] : []).forEach(function (stroke, index) {
      if (rows[index] && rows[index][2] === lead) {
        lineSplit += stroke.ring ? 1 : stroke.length;
      }
    });
    return lineSplit;
  }

  /* 합친 노드 안 두 묶음이 갈 잉크 자리(글자 칸 em) — 머리 음절은 [초성, ㅗ·ㅜ·ㅡ 조각], 통짜 모음은 [앞 조각, 뒤 조각]. 모양 값 표에
   * 없으면 null(처음 자리 그대로) */
  function fixedPartRegions(node, profile, reference, head) {
    var glyph = typeof node.closest === "function" ? node.closest('[part~="glyph"]') : null;
    var code = glyph ? glyph.getAttribute("data-source").charCodeAt(0) - HANGUL_BASE : -1;
    if (code < 0 || code >= 11172) {
      return null;
    }
    var key = profile.model === "case-fixed" ? layoutCase(node) : "";
    var lead = HANGUL_TABLES.choseong[Math.floor(code / 588)];
    var vowel = HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)];
    var pieces = caseStamp(profile.stamps[vowel], key);
    if (!pieces || !Array.isArray(pieces[0])) {
      return null;
    }
    var split = HANGUL_TABLES.splitJungseong[vowel].parts;
    var first = head ? caseStamp(profile.stamps[lead], key) : pieces[0];
    var second = head ? pieces[0] : pieces[1];
    var boxes = head ? [reference[lead], reference[split[0]]] : [reference[split[0]], reference[split[1]]];
    if (!first || !second || !boxes[0] || !boxes[1]) {
      return null;
    }
    var region = function (stamp, box) {
      var x = stamp[0] * profile.cell.width / 100;
      var y = stamp[1] * profile.cell.height / 100;
      var ax = stamp[2] * stamp[3];
      var ay = stamp[2] * stamp[4];
      return [x + ax * box[0], y + ay * box[1], x + ax * box[2], y + ay * box[3]];
    };
    return [region(first, boxes[0]), region(second, boxes[1])];
  }

  /* 네모꼴에서 글꼴 기본이 아닌 음절 나누기 — 나누기 맞춤(ADR-034 §5, ADR-030 §4 "합친 노드 안 자모는 낱 자리와 같다"를 네모꼴에도).
   * 네모꼴 글꼴 CSS는 그 글꼴의 기본 나누기(gothic 모음·받침 낱, sebul 계열 머리 음절 + 받침 통짜)의 자리를 다듬어 두었다. 페이지가 다른
   * 나누기를 고르면 그 나누기에만 쓰는 자리(통짜 모음 mw·mtw, 통짜 받침 bw·brw·bbw, 머리 hs·hts …)는 글꼴이 밝히지 않은 한 코어
   * 기본값이라 통짜 모음이 찌그러지고 겹받침이 작았다(0.1.4-rc.2 알려진 문제). 맞춤은 **기본값**이다(설계 원칙 5 — 간단하게, 원하면
   * 세세하게): 같은 음절을 그 글꼴의 기본 나누기로 그렸을 때의 조각 잉크 자리를 숨은 시험 음절로 재어, 글꼴이 밝히지 않은 자리의
   * 자모를 그 자리에 그린다. 파생 글꼴은 아무것도 고치지 않아도 따라온다. 노드는 그대로다(구조·고르기·꾸밈 선택자, 노드 상자는 고른
   * 나누기의 CSS) — 그리는 것(원소·그림 획, 기기 글꼴 글자·잎)만 옮긴다.
   * - 밝힌 값이 이긴다: 노드의 자리(slot·부모·역할 단계의 top·left·size·scale-x·scale-y)를 글꼴 CSS·다듬기(font-kku.tune)·작업실·페이지
   *   어디서든 밝혔으면 그 노드는 CSS 자리 그대로다(합친 노드는 조각만 제 상자 안에서 기본 나누기 비례로). 자모·짜임·문맥·음절 보정(--fy-jamo-*·
   *   --fy-case-*·--fy-ctx-*·--fy-syl-* — 작업실의 기본 범위 편집)과 페이지 자리 값은 맞춘 자리 위에 걸린다(기준 틀을 그 값 없이 잰다). 기기 글꼴의 굵기·획도
   *   그 자리가 밝히지 않았을 때만 기본 조각의 것을 옮긴다.
   * - 끄기: 페이지 --fy-split-fit: none(글꼴 --fy-font-split-fit) — 맞춤이 아무것도 하지 않는다(글꼴 CSS의 자리 그대로).
   * - 기본 나누기에서도 같은 자리(slot)에 그린 조각, 기본 나누기와 같은 나누기, 합자 모음·겹받침이 없는 음절은 건드리지 않는다(기본
   *   출력 그대로). 고정 글꼴 모양(세벌식·직결식)은 모양 값 표가 맡는다(fitFixedParts). 디자인이 기기 글꼴 노드를 맡으면 그대로.
   * - 조각: 초성 L, 모음 V(홑) 또는 V1·V2(합자 모음 앞·뒤), 받침 T(홑) 또는 T1·T2(겹받침 왼·오른). 기본 나누기에서 조각이 합친 노드
   *   안에 있으면(머리 음절의 L·V1, 통짜 모음의 V1·V2, 통짜 받침의 T1·T2) 그 노드의 잉크 영역을 비례로 나눈다 — 머리는 머리 글자를
   *   받침 없는 음절로 그린 비례를 자르지 않은 상자에(fitHeadSyllables와 같은 셈), 통짜는 모두 낱으로 그린 비례, 겹받침 두 조각은 가로로
   *   뗀다(sideBySide).
   * - 자리는 노드 자기 변환의 돌림·기울임을 뺀 틀에서 잰다(nodeScreen straight — 말랑의 자모 기울기는 CSS가 다시 건다). 원소·그림은
   *   노드 단위 상자를 옮길 자리까지 넓힌다(squareFrame). 글꼴 기본이 아닌 통짜 모음은 그림 세트도 조각 그림으로 짓는다(squareWholeVowels).
   *   기기 글꼴 재기는 fitSquareDevice 길에만 있다(원소 판은 끊는다).
   * - 글꼴의 나누기 조건 규칙(바탕 요소의 [data-fy-vowel-depth="syllable"] 같은)이 닿도록, 기본 나누기 시험 음절을 재는 동안 바탕
   *   요소의 나누기 표시를 기본 나누기로 잠시 바꾼다(같은 일 안에서 되돌린다 — 그려지지 않는다).
   * - 잴 수 없는 조각은 처음 자리 그대로 둔다(다른 나누기로 몰래 바꾸지 않는다). */
  var SQUARE_FITTED = typeof WeakMap === "function" ? new WeakMap() : null;
  var SQUARE_HOSTS = typeof WeakSet === "function" ? new WeakSet() : null;
  /* 맞춘 노드(자리를 밝히지 않아 기준 틀에서 옮긴 노드)의 두 잉크 상자(노드 em) — from: CSS 자리 그대로 그릴 상자, to: 맞춤이 그린 상자.
   * 작업실이 그 노드의 자리를 처음 적을 때 지금 보이는 자리에서 시작하려고 읽는다(FontKku.splitFit, ADR-035 — 자리를 밝히면 맞춤이
   * 꺼져 CSS 자리로 튀던 것) */
  var SQUARE_FIT_BOXES = typeof WeakMap === "function" ? new WeakMap() : null;
  var ATOMIC_DEPTH = { vowel: "split", coda: "split" };

  /* 그 글꼴의 기본 나누기 — 글꼴 CSS의 자리 값을 다듬은 나누기(글꼴 깊이 변수: 낱 이름 > 줄임 이름), 없으면 런타임 기본. 글꼴 CSS의
   * --fy-font-composition은 넣지 않는다 — 그것은 고른 짓는 방식이지(작업실도 사람의 고름을 거기에 적는다) 자리 값을 다듬은 바탕이
   * 아니다. 넣으면 고른 나누기가 '기본'이 되어 맞춤을 건너뛴다(C3 통합에서 정함) */
  function squareBaseDepth(style) {
    var font = readDepthLevel(style, FONT_DEPTH_VARIABLES);
    return { vowel: font.vowel || DEFAULT_VOWEL_DEPTH, coda: font.coda || DEFAULT_CODA_DEPTH };
  }

  /* 나누기 맞춤 켜기(ADR-034 §5) — 페이지 --fy-split-fit > 글꼴 --fy-font-split-fit, 값은 auto(기본)·none. none이면 맞춤이 아무것도
   * 하지 않는다(글꼴 CSS가 주는 자리 그대로). 모르는 값은 그 수준을 고르지 않은 것으로 본다 */
  function squareFitOn(style) {
    var pick = function (name) {
      var token = style ? String(style.getPropertyValue(name) || "").trim().toLowerCase() : "";
      return token === "auto" || token === "none" ? token : "";
    };
    return (pick("--fy-split-fit") || pick("--fy-font-split-fit") || "auto") !== "none";
  }

  /* 완성형 음절 하나의 조각 — 합자 모음·겹받침이면 두 조각(조합용 자모) */
  function syllablePieces(text) {
    var code = text && text.length === 1 ? text.charCodeAt(0) - HANGUL_BASE : -1;
    if (code < 0 || code >= 11172) {
      return null;
    }
    var lead = Math.floor(code / 588);
    var vowel = HANGUL_TABLES.jungseong[Math.floor((code % 588) / 28)];
    var tail = HANGUL_TABLES.jongseong[code % 28];
    var vs = HANGUL_TABLES.splitJungseong[vowel];
    var ts = tail ? HANGUL_TABLES.doubleJongseong[tail] : null;
    return {
      lead: lead,
      vowel: vowel,
      vowelParts: vs ? vs.parts : null,
      tail: tail,
      tailParts: ts ? ts.parts : null,
      /* 머리 글자 — 초성 + 합자 모음의 앞 조각(받침 없음, 머리 음절 노드의 data-jamo) */
      head: vs ? String.fromCharCode(HANGUL_BASE + (lead * 21 + HANGUL_TABLES.jungseong.indexOf(vs.parts[0])) * 28) : ""
    };
  }

  /* 노드 하나가 그리는 조각 이름 — 합친 노드는 둘, 홑 노드는 하나, 묶음(cluster) 노드는 없음 */
  function nodePieces(node, pieces) {
    var role = node.getAttribute("data-fy-role");
    return role === "head" ? ["L", "V1"] : role === "choseong" ? ["L"] :
      role === "jung-main" ? (pieces.vowelParts ? ["V1", "V2"] : ["V"]) : role === "jung-base" ? ["V1"] : role === "jung-tail" ? ["V2"] :
      role === "jong-main" ? (pieces.tailParts ? ["T1", "T2"] : ["T"]) : role === "jong-left" ? ["T1"] : role === "jong-right" ? ["T2"] : [];
  }

  /* 노드 상자를 화면에 놓는 변환(probeRegion과 같은 셈, 돌림·기울임 뺌)의 거꾸로 — 화면 영역을 노드 em 상자로. 잴 수 없으면 null */
  function nodeFrame(node) {
    var style = computedStyleFor(node);
    var width = node.offsetWidth;
    var height = node.offsetHeight;
    var size = style ? parseFloat(style.fontSize) : NaN;
    var rect = typeof node.getBoundingClientRect === "function" ? node.getBoundingClientRect() : null;
    if (!rect || !(width > 0 && height > 0 && size > 0 && rect.width > 0 && rect.height > 0)) {
      return null;
    }
    var screen = nodeScreen(style, width, height, rect, true);
    return function (region) {
      var local = screen.from(region);
      return local ? [local[0] / size, local[1] / size, local[2] / size, local[3] / size] : null;
    };
  }

  /* 노드 em 잉크 상자를 원소 단위 좌표로(headTargets와 같은 약속 — 단위 0–1의 잉크가 그 상자를 채운다) */
  function emUnits(em, box, stroke) {
    var width = box[2] - box[0] - stroke[0];
    var height = box[3] - box[1] - stroke[1];
    if (!(width > 0 && height > 0 && em[2] > em[0] && em[3] > em[1])) {
      return null;
    }
    var unit = [(em[0] - box[0]) / width, (em[1] - box[1]) / height, (em[2] - box[0] - stroke[0]) / width, (em[3] - box[1] - stroke[1]) / height];
    if (unit[2] < unit[0]) { unit[0] = unit[2] = (unit[0] + unit[2]) / 2; }
    if (unit[3] < unit[1]) { unit[1] = unit[3] = (unit[1] + unit[3]) / 2; }
    return unit;
  }

  function glyphBodyRect(glyph) {
    var body = glyph.querySelector('[part~="glyph-body"]') || glyph;
    var rect = body.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  /* 화면 영역 ↔ 글자 몸통 비(0–1) */
  function toBody(region, body) {
    return [(region[0] - body.left) / body.width, (region[1] - body.top) / body.height,
      (region[2] - body.left) / body.width, (region[3] - body.top) / body.height];
  }

  function fromBody(fraction, body) {
    return [body.left + fraction[0] * body.width, body.top + fraction[1] * body.height,
      body.left + fraction[2] * body.width, body.top + fraction[3] * body.height];
  }

  /* 합친 노드의 영역 whole을 조각 영역들(parts, 같은 좌표)의 비례로 나눈다 */
  function splitRegion(whole, parts) {
    if (!whole || parts.some(function (part) { return !part; })) {
      return null;
    }
    var union = [Math.min.apply(null, parts.map(function (p) { return p[0]; })), Math.min.apply(null, parts.map(function (p) { return p[1]; })),
      Math.max.apply(null, parts.map(function (p) { return p[2]; })), Math.max.apply(null, parts.map(function (p) { return p[3]; }))];
    var w = union[2] - union[0];
    var h = union[3] - union[1];
    if (!(w > 0 && h > 0)) {
      return null;
    }
    var x = function (v) { return whole[0] + (v - union[0]) / w * (whole[2] - whole[0]); };
    var y = function (v) { return whole[1] + (v - union[1]) / h * (whole[3] - whole[1]); };
    return parts.map(function (p) { return [x(p[0]), y(p[1]), x(p[2]), y(p[3])]; });
  }

  /* 겹받침 두 조각(왼·오른)을 가로로 떼어 놓는다 — 통짜 받침 글자(ㄺ)는 두 낱자를 나란히 그린 한 글자인데, 낱 받침 자리의 비례는 두
   * 낱자 상자가 가로로 겹친다(sebul 흙·괆 bl×br 15–36%). 겹치거나 통짜 폭의 4%보다 가까우면 두 상자 사이를 그 가운데에서 4%로 연다 */
  var SIDE_GAP = 0.04;
  function sideBySide(split, whole) {
    var width = whole[2] - whole[0];
    var gap = split[1][0] - split[0][2];
    if (!(width > 0) || gap >= SIDE_GAP * width) {
      return split;
    }
    var middle = (split[0][2] + split[1][0]) / 2;
    var left = split[0].slice();
    var right = split[1].slice();
    left[2] = Math.max(left[0] + 0.25 * (left[2] - left[0]), middle - SIDE_GAP * width / 2);
    right[0] = Math.min(right[2] - 0.25 * (right[2] - right[0]), middle + SIDE_GAP * width / 2);
    return [left, right];
  }

  /* 숨은 시험 음절 하나(fitHeadSyllables와 같은 꾸밈 끄기) — 관리 root 안이라 그 바탕 요소의 글꼴·페이지 값이 그대로 닿는다 */
  /* 시험 음절에서 끄는 값 — 페이지 수준 자리 값(--fy-top …)은 기본 나누기의 자리에도, 고른 나누기의 기준 틀에도 넣지 않는다(실제
   * 노드에 그대로 걸린다). 고른 나누기의 기준 틀은 자모·짜임·문맥·음절 보정도 끈다 — 그 보정(작업실의 기본 범위 편집이 쓰는 --fy-case-*도)은
   * 맞춘 자리 위에 실제 노드의 CSS가 다시 건다 */
  var SQUARE_PAGE_VALUES = ["--fy-top", "--fy-left", "--fy-font-size", "--fy-scale-x", "--fy-scale-y", "--fy-rotate"];
  var SQUARE_CORRECTIONS = ["jamo", "case", "ctx", "syl"].reduce(function (list, level) {
    return list.concat(["dx", "dy", "size", "scale-x", "scale-y", "rotate"].map(function (suffix) { return "--fy-" + level + "-" + suffix; }));
  }, []);

  function squareProbe(item, text, depth, tag) {
    var key = text + "|" + depth.vowel + ":" + depth.coda + (tag ? "|" + tag : "");
    if (item.probes[key]) {
      return;
    }
    var neutral = tag === "frame" ? SQUARE_PAGE_VALUES.concat(SQUARE_CORRECTIONS) : SQUARE_PAGE_VALUES;
    var glyph = renderHangulGlyph(decomposeGlyph(text, 0, depth), 0);
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
        neutral.forEach(function (name) { node.style.setProperty(name, "initial"); });
        node.style.setProperty("--fy-face-width", round4(box[4]) + "em");
        var hoek = renderDocument.createElement("span");
        hoek.setAttribute("part", "hoek");
        node.appendChild(hoek);
      }
    });
    item.root.appendChild(glyph);
    item.probes[key] = { glyph: glyph, text: text, nodes: [], body: null, frames: null };
  }

  function squareProbeOf(item, text, depth, tag) {
    return item.probes[text + "|" + depth.vowel + ":" + depth.coda + (tag ? "|" + tag : "")] || null;
  }

  /* 자리 값 단계 — slot → 그 slot의 부모 → 역할(코어 CSS의 차례, spec/css-variables.json slot parent 표와 같다 —
   * tests/test_square_splits.py가 맞춰 본다) */
  var SLOT_CLASSES = {
    t: "tc", tt: "tc", tlo: "tl", tlc: "tl", tls: "tl", ttl: "tl", hs: "h", hts: "h", tro: "tr", trc: "tr", m: "mc", mt: "mc",
    mw: "mx", mtw: "mx", ml: "xb", mtl: "xb", trs: "xt", ttr: "xt", b: "bs", brs: "bs", bbrs: "bs", bw: "bx", brw: "bx", bbw: "bx",
    bl: "xl", blr: "xl", bbl: "xl", br: "xr", brd: "xr", bbrd: "xr"
  };
  var PLACE_PROPERTIES = ["top", "left", "size", "scale-x", "scale-y"];

  /* 노드의 slot 단계에서 밝힌 값(slot·부모·역할 변수 가운데 처음 것) — 글꼴·다듬기(tune)·작업실·페이지 CSS 어디서든. 없으면 "" */
  function slotDeclared(style, node, property) {
    var pos = node.getAttribute("data-fy-pos") || "";
    var role = node.getAttribute("data-fy-role") || "";
    var names = ["--fy-" + pos + "-" + property];
    if (SLOT_CLASSES[pos]) {
      names.push("--fy-" + SLOT_CLASSES[pos] + "-" + property);
    }
    if (role) {
      names.push("--fy-" + role + "-" + property);
    }
    for (var i = 0; style && i < names.length; i += 1) {
      var value = String(style.getPropertyValue(names[i]) || "").trim();
      if (value) {
        return value;
      }
    }
    return "";
  }

  /* 합친 노드 안 조각 자리를 그 노드의 표준 잉크 상자(em)에 비례로 — 조각 영역들의 합 상자가 그 상자를 채운다(fitHeadSyllables와
   * 같은 셈). 글꼴이 그 노드의 자리를 밝혔을 때 */
  function relativeEms(regions, box) {
    if (regions.some(function (region) { return !region; })) {
      return null;
    }
    var union = [Math.min.apply(null, regions.map(function (r) { return r[0]; })), Math.min.apply(null, regions.map(function (r) { return r[1]; })),
      Math.max.apply(null, regions.map(function (r) { return r[2]; })), Math.max.apply(null, regions.map(function (r) { return r[3]; }))];
    var w = union[2] - union[0];
    var h = union[3] - union[1];
    if (!(w > 0 && h > 0)) {
      return null;
    }
    var x = function (v) { return box[0] + (v - union[0]) / w * (box[2] - box[0]); };
    var y = function (v) { return box[1] + (v - union[1]) / h * (box[3] - box[1]); };
    return regions.map(function (r) { return [x(r[0]), y(r[1]), x(r[2]), y(r[3])]; });
  }

  /* 기본 나누기로 그린 음절의 조각 잉크 자리(글자 몸통 비) — { L, V | V1·V2, T | T1·T2 }, 그리고 paint(조각마다 그 조각을 그린 노드의
   * 기기 글꼴 칠, 원소·그림은 null) */
  function squareReference(item, entry) {
    var probe = squareProbeOf(item, entry.text, item.base);
    var out = { paint: {}, pos: {} };
    if (!probe || !probe.body) {
      return out;
    }
    var regionsOf = function (source, names) {
      if (!source || !source.body) {
        return null;
      }
      return names.map(function (name) {
        var hit = source.nodes.filter(function (node) { return node.names.length === 1 && node.names[0] === name && node.region; })[0];
        return hit ? toBody(hit.region, source.body) : null;
      });
    };
    probe.nodes.forEach(function (node) {
      if (!node.region) {
        return;
      }
      node.names.forEach(function (name) {
        out.paint[name] = node.paint;
      });
      var whole = toBody(node.role === "head" && node.open ? node.open : node.region, probe.body);
      if (node.names.length === 1) {
        out[node.names[0]] = whole;
        out.pos[node.names[0]] = node.pos;
        return;
      }
      /* 합친 노드 — 머리는 머리 글자를 받침 없는 음절로 그린 비례(L·V)를 자르지 않은 상자에(fitHeadSyllables와 같은 셈), 통짜는 모두
       * 낱으로 그린 비례를 보이는 잉크 영역에 */
      var parts = node.role === "head" ? regionsOf(squareProbeOf(item, entry.pieces.head, item.base), ["L", "V"]) :
        regionsOf(squareProbeOf(item, entry.text, ATOMIC_DEPTH), node.names);
      var split = parts ? splitRegion(whole, parts) : null;
      if (split && node.names[0] === "T1") {
        split = sideBySide(split, whole);
      }
      if (split) {
        out[node.names[0]] = split[0];
        out[node.names[1]] = split[1];
      }
    });
    return out;
  }

  /* 원소·그림 노드의 획 묶음 — 이름마다 [part="element"] 목록. 묶음이 비면 null(가를 수 없다 — 그림 한 장으로 그린 합자 모음 같은) */
  function squareSpanGroups(node, names, pieces) {
    if (names.length === 1) {
      var all = node.querySelectorAll('[part="element"]');
      return all.length ? [all] : null;
    }
    if (node.getAttribute("data-fy-role") === "head") {
      var head = HEAD_PARTS.map(function (part) {
        return node.querySelectorAll(':scope > [part="hoek"][data-fy-head-part="' + part + '"] [part="element"]');
      });
      return head[0].length && head[1].length ? head : null;
    }
    var lead = JAMO_TO_COMPAT[names[0] === "V1" ? pieces.vowelParts[0] : pieces.tailParts[0]];
    var groups = [[], []];
    Array.prototype.forEach.call(node.querySelectorAll(':scope > [part="hoek"]'), function (hoek) {
      var letter = hoek.getAttribute("data-hoek-letter") || (hoek.getAttribute("data-hoek-drawing") || "").charAt(0);
      Array.prototype.push.apply(groups[letter === lead ? 0 : 1], hoek.querySelectorAll('[part="element"]'));
    });
    return groups[0].length && groups[1].length ? groups : null;
  }

  /* 원소 노드를 옮길 단위 틀 — 표준 잉크 상자와 옮길 자리(노드 em)의 합 상자를 획 굵기의 두 배씩 넓힌다. 한 획 두께의 상자(ㅡ의 높이,
   * ㅣ의 폭)는 그 축의 단위 좌표가 한 점으로 접혀(elementAxes) 그 축으로 옮길 수 없다. 노드의 단위 상자(ELEMENT_UNITS)를 이 틀로 바꿔
   * 굵기 보정(balanceElementStrokes)도 같은 틀로 다시 놓는다 — 되돌릴 때 표준 상자로(restoreSquareNode) */
  function squareFrame(box, ems, stroke) {
    var pad = 2 * Math.max(stroke[0], stroke[1], 0.05);
    var frame = [box[0], box[1], box[2], box[3]];
    ems.forEach(function (em) {
      frame[0] = Math.min(frame[0], em[0]);
      frame[1] = Math.min(frame[1], em[1]);
      frame[2] = Math.max(frame[2], em[2]);
      frame[3] = Math.max(frame[3], em[3]);
    });
    return [frame[0] - pad, frame[1] - pad, frame[2] + pad, frame[3] + pad].concat(box.slice(4));
  }

  /* 기기 글꼴 통짜 노드(합자 모음·겹받침)를 조각 낱자 잎 둘로 — 잎마다 그 조각의 기본 나누기 자리(노드 em)에 맞춘다(fixedWholeLeaves와
   * 같은 잎). 냈으면 잎마다 { glyph, k }, 못 냈으면 false */
  function squareLeaves(node, parts, targets, meta, reference, doc) {
    var leaves = parts.map(function (piece, index) {
      var target = targets[index];
      var box0 = reference[piece];
      var glyph = piece;
      var box = faceBox(doc, meta.family, piece);
      if (!box || !box0 || !faceClose(box, box0)) {
        glyph = faceGlyph(piece);
        box = glyph === piece ? box : faceBox(doc, meta.family, glyph);
      }
      return box && target && target[2] > target[0] && target[3] > target[1] ? [glyph, faceFit(box, target)] : null;
    });
    if (leaves.some(function (leaf) { return !leaf; })) {
      return false;
    }
    Array.prototype.slice.call(node.querySelectorAll(':scope > [part="leaf"]')).forEach(function (leaf) { node.removeChild(leaf); });
    leaves.forEach(function (entry) {
      var leaf = doc.createElement("span");
      leaf.setAttribute("part", "leaf");
      leaf.textContent = entry[0];
      leaf.style.setProperty("--fy-leaf-size", round4(entry[1].k) + "em");
      leaf.style.setProperty("--fy-leaf-scale-x", String(round4(entry[1].scaleX)));
      leaf.style.setProperty("--fy-leaf-scale-y", String(round4(entry[1].scaleY)));
      leaf.style.setProperty("--fy-leaf-x", round4(entry[1].x) + "em");
      leaf.style.setProperty("--fy-leaf-y", round4(entry[1].y) + "em");
      node.appendChild(leaf);
    });
    node.setAttribute("data-fy-leaves", "");
    node.style.removeProperty("--fy-face-glyph");
    node.style.setProperty("--fy-face-width", round4(reference[node.getAttribute("data-jamo")][4]) + "em");
    return leaves.map(function (entry) { return { glyph: entry[0], k: entry[1].k }; });
  }

  /* 기기 글꼴 노드가 ::before로 그리는 글자(--fy-face-glyph, 없으면 data-jamo) */
  function faceGlyphOf(node) {
    var raw = node.style.getPropertyValue("--fy-face-glyph");
    try {
      return raw ? JSON.parse(raw) : node.getAttribute("data-jamo");
    } catch (error) {
      return node.getAttribute("data-jamo");
    }
  }

  /* 기본 나누기로 그린 기기 글꼴 노드의 칠 — 굵기(계산된 font-weight)와 화면에 보이는 획 두께(노드 자기 변환 틀의 px): 글자 줄기
   * (faceStem) × 글자 크기(맞춤 배율 k × 노드 글자 크기, fitFaceNode와 같은 셈) + text-stroke, 그리고 노드 배율. 네모꼴 글꼴은 자리마다
   * 굵기를 보정해 두었다(gothic 받침 낱 800·통짜 400, sebul 머리 음절은 크게 그린 굵은 완성형) — 조각만 옮기면 조각 글자가 기본보다
   * 가볍다. 잴 수 없으면 null */
  function squarePaint(node, meta, reference, doc) {
    var style = computedStyleFor(node);
    var text = node.getAttribute("data-jamo");
    var expected = text ? reference[text] : null;
    var size = style ? parseFloat(style.fontSize) : NaN;
    if (!expected || !(size > 0)) {
      return null;
    }
    var glyph = text;
    var box = faceBox(doc, meta.family, text);
    if (!box || !faceClose(box, expected)) {
      glyph = faceGlyph(text);
      box = glyph === text ? box : faceBox(doc, meta.family, glyph);
    }
    var stem = box ? faceStem(doc, meta.family, style.fontWeight, glyph) : null;
    if (!stem) {
      return null;
    }
    var k = faceFit(box, expected).k;
    return { weight: style.fontWeight, visual: (stem * k * size + (parseFloat(style.webkitTextStrokeWidth) || 0)) * nodeScale(style) };
  }

  /* 노드 자기 변환의 고른 배율(돌림·기울임 뺀 두 축 배율의 기하 평균) */
  function nodeScale(style) {
    var m = /matrix\(([^)]+)\)/.exec(style.transform || "");
    m = m ? m[1].split(",").map(Number) : [1, 0, 0, 1];
    return Math.sqrt(Math.sqrt(m[0] * m[0] + m[1] * m[1]) * Math.sqrt(m[2] * m[2] + m[3] * m[3])) || 1;
  }

  /* 기기 글꼴의 줄기 굵기(em) — 그 굵기로 그린 세로 줄기의 두께(가로로 끊은 잉크 구간의 아래 사분위). 글자 갈래마다 다르다: 굵은
   * 꼴에서 완성형 음절의 줄기가 조합용·호환 자모보다 굵다(Apple SD 700에서 이 0.117em, ᅵ 0.087em, ㅣ 0.097em). 그래서 그 갈래의
   * ㅣ(완성형은 이)로 잰다. 웹 글꼴을 받으면 다시 잰다(refitFaces). 잴 수 없으면 null */
  var FACE_STEMS = Object.create(null);
  var stemCanvas = null;
  function faceStem(doc, family, weight, glyph) {
    var code = glyph ? glyph.charCodeAt(0) : 0;
    var sample = code >= 0xAC00 && code <= 0xD7A3 ? "\uC774" : code >= 0x1100 && code <= 0x11FF ? "\u1175" : "\u3163";
    var shape = String(weight || 400);
    var key = family + "\u0000" + shape + "\u0000" + sample;
    if (key in FACE_STEMS) {
      return FACE_STEMS[key];
    }
    if (!stemCanvas && doc && typeof doc.createElement === "function") {
      var canvas = doc.createElement("canvas");
      canvas.width = 360;
      canvas.height = 360;
      stemCanvas = typeof canvas.getContext === "function" ? canvas.getContext("2d", { willReadFrequently: true }) : null;
    }
    watchFaceLoad(doc, family, sample);
    var stem = null;
    if (stemCanvas) {
      stemCanvas.clearRect(0, 0, 360, 360);
      stemCanvas.font = shape + " 300px " + family;
      stemCanvas.textBaseline = "alphabetic";
      stemCanvas.fillStyle = "#000";
      stemCanvas.fillText(sample, 30, 300);
      var pixels = null;
      try {
        pixels = stemCanvas.getImageData(0, 0, 360, 360).data;
      } catch (error) {
        pixels = null;
      }
      var runs = [];
      for (var y = 0; pixels && y < 360; y += 2) {
        var run = 0;
        for (var x = 0; x <= 360; x += 1) {
          if (x < 360 && pixels[(y * 360 + x) * 4 + 3] >= 128) {
            run += 1;
          } else if (run) {
            runs.push(run);
            run = 0;
          }
        }
      }
      runs.sort(function (a, b) { return a - b; });
      stem = runs.length ? runs[Math.floor(runs.length / 4)] / 300 : null;
    }
    FACE_STEMS[key] = stem;
    return stem;
  }

  /* 옮긴 기기 글꼴 노드에 기본 나누기 조각의 칠을 slot 단계로 준다(--fy-slot-weight·--fy-slot-stroke) — 글꼴이 그 자리의 굵기·획을
   * 밝혔으면(keep.weight·keep.stroke) 그 값이 이긴다(옮기지 않는다). 페이지·문맥·자모 단계(--fy-weight·--fy-stroke …)는 늘 이긴다.
   * 굵기는 첫 조각의 것, 획 두께는 화면 두께가 기본과 같게 text-stroke로 채운다(잎·조각이 여럿이면 그 평균, 모자라지 않으면 0).
   * drawn은 조각마다 그리는 글자 { glyph, k(맞춤 배율) }, frame은 이 노드의 { scale, size } */
  function squareDevicePaint(node, paints, drawn, frame, doc, family, keep) {
    var own = keep || {};
    var ready = paints.length && paints.every(function (paint) { return paint; }) && frame && frame.scale > 0 && frame.size > 0;
    var weight = own.weight || (ready ? paints[0].weight : "");
    var strokes = ready && !own.stroke ? paints.map(function (paint, index) {
      var stem = drawn[index] && drawn[index].k > 0 ? faceStem(doc, family, weight, drawn[index].glyph) : null;
      return stem ? Math.max(0, paint.visual / frame.scale - stem * drawn[index].k * frame.size) : null;
    }) : null;
    if (ready && !own.weight) {
      node.style.setProperty("--fy-slot-weight", weight);
    } else {
      node.style.removeProperty("--fy-slot-weight");
    }
    if (strokes && strokes.every(function (stroke) { return stroke !== null; })) {
      node.style.setProperty("--fy-slot-stroke", round4(strokes.reduce(function (sum, stroke) { return sum + stroke; }, 0) / strokes.length / frame.size) + "em");
    } else {
      node.style.removeProperty("--fy-slot-stroke");
    }
  }

  /* 기기 글꼴 노드 하나를 기본 나누기 자리 ems(조각마다 노드 em)로 — 홑 노드·머리 음절(완성형 머리 글자 하나)은 조각 자리의 합 상자에
   * 글자를, 통짜 노드(합자 모음·겹받침)는 조각 잎 둘을 맞추고 기본 조각의 칠을 옮긴다. 옮겼으면 true. 기기 글꼴 재기(그림판·글꼴
   * 받기)는 이 길에만 있다 — 원소 판(scripts/element-edition.json)은 이 함수와 squarePaint·restoreSquareDevice를 끊는다 */
  function fitSquareDevice(node, target, entry, ems, reference, meta, boxes, doc) {
    var paints = target.names.map(function (name) { return reference.paint[name]; });
    if (target.names.length === 1 || node.getAttribute("data-fy-role") === "head") {
      var em = [Math.min(ems[0][0], (ems[1] || ems[0])[0]), Math.min(ems[0][1], (ems[1] || ems[0])[1]),
        Math.max(ems[0][2], (ems[1] || ems[0])[2]), Math.max(ems[0][3], (ems[1] || ems[0])[3])];
      fitFaceNode(node, meta, doc, boxes, null, null, em);
      var face = { glyph: faceGlyphOf(node), k: parseFloat(node.style.getPropertyValue("--fy-face-size")) };
      squareDevicePaint(node, paints, target.names.map(function () { return face; }), target.frame, doc, meta.family, target.keep);
      return true;
    }
    var drawn = squareLeaves(node, target.names[0] === "V1" ? entry.pieces.vowelParts : entry.pieces.tailParts, ems, meta, boxes, doc);
    if (!drawn) {
      return false;
    }
    squareDevicePaint(node, paints, drawn, target.frame, doc, meta.family, target.keep);
    return true;
  }

  /* 전에 옮긴 기기 글꼴 노드를 표준 맞춤으로(잎·옮긴 칠을 지운다) */
  function restoreSquareDevice(node, meta, reference, doc) {
    Array.prototype.slice.call(node.querySelectorAll(':scope > [part="leaf"]')).forEach(function (leaf) { node.removeChild(leaf); });
    node.removeAttribute("data-fy-leaves");
    node.style.removeProperty("--fy-slot-weight");
    node.style.removeProperty("--fy-slot-stroke");
    fitFaceNode(node, meta, doc, reference, null, null, null);
  }

  /* 디자인이 그리는 기기 글꼴 노드(ADR-034 §5 — 디자인 없는 같은 글꼴·나누기와 같은 자리). 글꼴 팔레트·문자 매핑이 낸 잎은 지우지
   * 않고 조각마다 그 조각의 잉크 영역(디자인 계획의 획 묶음 자리)을 기본 나누기 자리로 옮기는 사상을 잎에 건다(squareLeafMap —
   * 잎을 다시 내도 applySquareLeafMap이 다시 건다). 통째 글자 하나를 그리는 디자인 노드는 그 글꼴로 조각 자리의 합 상자에 맞춘다.
   * 옮겼으면 맞춤 갈래("design-leaves"·"design-face"), 못 했으면 "". 기기 글꼴 길이라 원소 판은 끊는다 */
  var SQUARE_LEAF_MAPS = typeof WeakMap === "function" ? new WeakMap() : null;

  function fitSquareDesign(node, target, ems, meta, boxes, doc) {
    var design = appliedDesign(meta);
    var text = node.getAttribute("data-jamo");
    if (!design || !text || !SQUARE_LEAF_MAPS) {
      return "";
    }
    if (node.hasAttribute("data-fy-glyph-mapped") || node.hasAttribute("data-fy-leaves") || mappedDesignNode(node, text, design)) {
      var map = squareLeafMap(node, text, design, meta, boxes, target.names, ems);
      if (!map) {
        return "";
      }
      SQUARE_LEAF_MAPS.set(node, map);
      applySquareLeafMap(node);
      if (!node.hasAttribute("data-fy-glyph-mapped") && !node.hasAttribute("data-fy-leaves")) {
        /* 문자 매핑을 아직 내지 않았거나(웹 글꼴을 받아 다시 맞추는 중 — 매핑은 맞춤 뒤에 다시 난다) 못 낸 노드는 기기 글자(::before)로
         * 그린다 — 그 글자도 조각 자리의 합 상자에(매핑이 나면 ::before는 그리지 않는다) */
        fitFaceNode(node, meta, doc, boxes, design, null, unionBox(ems));
      }
      return "design-leaves";
    }
    fitFaceNode(node, meta, doc, boxes, design, null, unionBox(ems));
    return node.hasAttribute("data-fy-leaves") ? "" : "design-face";
  }

  /* 디자인 노드를 처음 자리로. fitFaceNode는 문자 매핑을 지우므로 매핑이 있는 노드에는 부르지 않는다(그 노드의 ::before는 그리지 않고,
   * 다음 표준 맞춤이 고친다) */
  function restoreSquareDesign(node, kind, meta, reference, doc) {
    if (kind === "design-leaves") {
      if (SQUARE_LEAF_MAPS) {
        SQUARE_LEAF_MAPS.delete(node);
      }
      applySquareLeafMap(node);
      if (node.hasAttribute("data-fy-glyph-mapped") || node.hasAttribute("data-fy-leaves")) {
        return;
      }
    }
    fitFaceNode(node, meta, doc, reference, appliedDesign(meta), null, null);
  }

  function unionBox(boxes) {
    return [Math.min.apply(null, boxes.map(function (b) { return b[0]; })), Math.min.apply(null, boxes.map(function (b) { return b[1]; })),
      Math.max.apply(null, boxes.map(function (b) { return b[2]; })), Math.max.apply(null, boxes.map(function (b) { return b[3]; }))];
  }

  /* 상자 from(노드 em)을 상자 to로 옮기는 사상 p' = s·p + t, 넓이가 없으면 null */
  function boxMap(from, to) {
    var w = from[2] - from[0];
    var h = from[3] - from[1];
    if (!(w > 0 && h > 0 && to[2] > to[0] && to[3] > to[1])) {
      return null;
    }
    var sx = (to[2] - to[0]) / w;
    var sy = (to[3] - to[1]) / h;
    return { sx: sx, sy: sy, tx: to[0] - sx * from[0], ty: to[1] - sy * from[1] };
  }

  /* 디자인 노드의 조각 사상 — 그 노드를 디자인으로 다시 계획해(문자 매핑·글꼴 팔레트와 같은 계획) 계획 항목마다 잉크 영역(획 묶음
   * 자리, 통째 하나면 표준 잉크 상자)을 내고 조각(이름 names: L·V·V1·V2·T·T1·T2)으로 묶는다. 조각마다 그 영역의 합 상자 → 기본 나누기
   * 자리 ems. 묶을 수 없으면(조각 수가 다른 조립식 따위) 노드 전체를 한 사상으로(모든 영역의 합 → 모든 자리의 합). 잎은 data-leaf-path로
   * 조각을 찾는다 — { byPath: { 경로: 조각 }, maps: [조각마다 사상], all: 한 사상 } */
  function squareLeafMap(node, text, design, meta, boxes, names, ems) {
    var expected = boxes[text];
    var skeleton = expected ? skeletonFor(node, text) : null;
    if (!skeleton || !skeleton.length || ems.length !== names.length) {
      return null;
    }
    var table = INK_BOXES[meta.inkBoxes];
    var axes = elementAxes(expected, table.stroke, table.stroke);
    var requests = designRequests(node, skeleton, design);
    var code = text.charCodeAt(0);
    var context = code >= 0x11A8 && code <= 0x11FF ? "jong" : overBar(node) ? "bar" : "cho";
    var items = [];
    var groupOf = [];
    skeleton.forEach(function (group, index) {
      var before = items.length;
      planRequest(Object.assign({}, requests[index], { jamo: group[0], strokes: group[1], context: /[ㅏ-ㅣ]/.test(group[0]) ? "" : context,
        level: 0 }), { design: design, set: null, sourceId: null, cells: null, geometry: true, trace: [], pieces: meta.compositionPieces || "" }, items);
      for (var i = before; i < items.length; i += 1) {
        groupOf.push(index);
      }
    });
    if (!items.length) {
      return null;
    }
    var regions = items.map(function (item) {
      return items.length === 1 || !item.strokes ? expected : strokesRegion(item.strokes, axes, table.stroke);
    });
    var segments = [];
    items.forEach(function (item) {
      var first = item.path && item.path.length ? item.path[0] : "";
      if (segments.indexOf(first) < 0) {
        segments.push(first);
      }
    });
    var pieceOf = names.length === 1 ? function () { return 0; } :
      skeleton.length === names.length ? function (index) { return groupOf[index]; } :
      skeleton.length === 1 && segments.length === names.length ? function (index) {
        return segments.indexOf(items[index].path && items[index].path.length ? items[index].path[0] : "");
      } : null;
    var all = boxMap(unionBox(regions), unionBox(ems));
    if (!all) {
      return null;
    }
    var out = { byPath: null, maps: null, all: all };
    if (!pieceOf || names.length === 1) {
      return out;
    }
    var grouped = names.map(function () { return []; });
    var byPath = Object.create(null);
    var ambiguous = false;
    items.forEach(function (item, index) {
      var piece = pieceOf(index);
      grouped[piece].push(regions[index]);
      var key = (item.path || []).join("/");
      if (key in byPath && byPath[key] !== piece) {
        ambiguous = true;
      }
      byPath[key] = piece;
    });
    var maps = grouped.map(function (list, piece) { return list.length ? boxMap(unionBox(list), ems[piece]) : null; });
    if (ambiguous || maps.some(function (map) { return !map; })) {
      return out;
    }
    out.byPath = byPath;
    out.maps = maps;
    return out;
  }

  /* 노드의 잎에 조각 사상을 건다(없으면 지운다). 잎의 transform-origin은 잎 상자 왼쪽 위 = 노드 왼쪽 위라, 따로 선 translate·scale은
   * 노드 좌표에서 잎 transform 앞에 걸린다(p' = s·p + t). translate는 잎 글자 크기(노드 em × --fy-leaf-size)로 풀리므로 그 배율로 나눈다 */
  function applySquareLeafMap(node) {
    var map = SQUARE_LEAF_MAPS ? SQUARE_LEAF_MAPS.get(node) : null;
    Array.prototype.forEach.call(node.querySelectorAll(':scope > [part="leaf"]'), function (leaf) {
      if (!map) {
        leaf.style.removeProperty("translate");
        leaf.style.removeProperty("scale");
        return;
      }
      var path = leaf.getAttribute("data-leaf-path") || "";
      var piece = map.byPath && path in map.byPath ? map.byPath[path] : -1;
      var a = piece >= 0 ? map.maps[piece] : map.all;
      var k = parseFloat(leaf.style.getPropertyValue("--fy-leaf-size")) || 1;
      leaf.style.setProperty("translate", round4(a.tx / k) + "em " + round4(a.ty / k) + "em");
      leaf.style.setProperty("scale", round4(a.sx) + " " + round4(a.sy));
    });
  }

  /* 전에 옮긴 노드를 처음 자리로 — 원소·그림은 처음 단위로(머리 음절은 fitHeadSyllables가 이번에 다시 맞췄다), 기기 글꼴은 표준 맞춤으로 */
  function restoreSquareNode(node, meta, reference, doc) {
    var kind = SQUARE_FITTED.get(node);
    SQUARE_FITTED.delete(node);
    if (SQUARE_FIT_BOXES) {
      SQUARE_FIT_BOXES.delete(node);
    }
    var box = reference[node.getAttribute("data-jamo")];
    if (!box) {
      return;
    }
    if (kind === "device") {
      restoreSquareDevice(node, meta, reference, doc);
      return;
    }
    if (kind === "design-leaves" || kind === "design-face") {
      restoreSquareDesign(node, kind, meta, reference, doc);
      return;
    }
    ELEMENT_UNITS.set(node, box);
    if (node.getAttribute("data-fy-role") === "head") {
      return;
    }
    var stroke = INK_BOXES[meta.inkBoxes].stroke;
    var axes = elementAxes(box, stroke, stroke);
    Array.prototype.forEach.call(node.querySelectorAll('[part="element"]'), function (span) {
      var base = HEAD_BASE_UNITS.get(span);
      if (base) {
        placeElement(span, base, axes);
      }
    });
    if (DENSITY_FITS) {
      DENSITY_FITS.delete(node);
    }
  }

  function restoreSquareHost(host, root, meta, reference) {
    SQUARE_HOSTS.delete(host);
    if (!root || !reference) {
      return;
    }
    Array.prototype.forEach.call(root.querySelectorAll("[data-fy-role]"), function (node) {
      if (SQUARE_FITTED.has(node)) {
        restoreSquareNode(node, meta, reference, host.ownerDocument);
      }
    });
  }

  /* 네모꼴 나누기 맞춤이 지금 이 노드를 옮겼으면 { kind, from, to }(노드 em [x0, y0, x1, y1] — from: CSS 자리 그대로의 잉크 상자,
   * to: 맞춤이 그린 잉크 상자), 아니면 null. 자리를 밝힌 노드(맞춤이 조각 비례만 맞춘 노드)도 null — CSS 자리가 그대로 보인다 */
  function splitFit(node) {
    var boxes = node && SQUARE_FIT_BOXES && SQUARE_FITTED && SQUARE_FITTED.has(node) ? SQUARE_FIT_BOXES.get(node) : null;
    return boxes ? { kind: SQUARE_FITTED.get(node), from: boxes.from.slice(), to: boxes.to.slice() } : null;
  }

  function fitSquareSplits(hosts) {
    if (!ELEMENT_UNITS || !HEAD_BASE_UNITS || !SQUARE_FITTED || !SQUARE_HOSTS) {
      return;
    }
    var work = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var meta = state && state.options.fontMeta;
      var depth = state && state.options.depthOptions;
      if (!meta || !depth || !host.isConnected) {
        return;
      }
      var root = getManagedRoot(host);
      var reference = inkBoxes(meta.inkBoxes);
      var usable = root && reference && typeof root.querySelectorAll === "function" && !fixedLayout(meta) &&
        (meta.face === "element" || meta.face === "svg" || meta.face === "device");
      var hostStyle = usable ? computedStyleFor(host) : null;
      var base = usable && squareFitOn(hostStyle) ? squareBaseDepth(hostStyle) : null;
      var glyphs = [];
      if (base && (base.vowel !== depth.vowel || base.coda !== depth.coda)) {
        Array.prototype.forEach.call(root.querySelectorAll('[part~="glyph"]'), function (glyph) {
          var text = glyph.getAttribute("data-source") || "";
          var pieces = syllablePieces(text);
          if (pieces && ((pieces.vowelParts && base.vowel !== depth.vowel) || (pieces.tailParts && base.coda !== depth.coda))) {
            glyphs.push({ glyph: glyph, text: text, pieces: pieces, nodes: [] });
          }
        });
      }
      if (!glyphs.length) {
        if (SQUARE_HOSTS.has(host)) {
          restoreSquareHost(host, root, meta, reference);
        }
        return;
      }
      if (unrenderedHost(host)) {
        deferHost(host);
        return;
      }
      work.push({ host: host, state: state, root: root, meta: meta, reference: reference, base: base, depth: depth, glyphs: glyphs,
        stroke: INK_BOXES[meta.inkBoxes].stroke, probes: Object.create(null), frames: null, pending: [] });
    });
    if (!work.length) {
      return;
    }
    var insert = function (item, add) {
      var outerDocument = renderDocument;
      var outerSprite = renderSpriteMaterial;
      renderDocument = item.host.ownerDocument;
      renderSpriteMaterial = false;
      try {
        item.glyphs.forEach(add);
      } finally {
        renderDocument = outerDocument;
        renderSpriteMaterial = outerSprite;
      }
    };
    var removeProbes = function (probes) {
      Object.keys(probes).forEach(function (key) {
        var glyph = probes[key].glyph;
        if (glyph.parentNode) {
          glyph.parentNode.removeChild(glyph);
        }
      });
    };
    /* 쓰기 0: 고른 나누기의 기준 틀 — 같은 음절을 고른 나누기로, 페이지 값·자모·문맥 보정을 끄고 그린 시험 음절 */
    work.forEach(function (item) {
      var observer = item.state.observer;
      item.pending = observer ? observer.takeRecords() : [];
      insert(item, function (entry) {
        squareProbe(item, entry.text, item.depth, "frame");
      });
    });
    /* 읽기 1(고른 나누기 그대로): 노드마다 밝힌 자리·칠, 획 굵기·배율, 기준 틀 시험 음절의 노드 틀 */
    work.forEach(function (item) {
      var device = item.meta.face === "device";
      item.glyphs.forEach(function (entry) {
        Array.prototype.forEach.call(entry.glyph.querySelectorAll("[data-fy-role]"), function (node) {
          var names = nodePieces(node, entry.pieces);
          var box = names.length ? item.reference[node.getAttribute("data-jamo")] : null;
          if (!box) {
            return;
          }
          var style = computedStyleFor(node);
          entry.nodes.push({ node: node, names: names, box: box,
            declared: PLACE_PROPERTIES.some(function (property) { return slotDeclared(style, node, property) !== ""; }),
            keep: device ? { weight: slotDeclared(style, node, "weight"), stroke: slotDeclared(style, node, "stroke") !== "" } : null,
            seen: device ? null : nodeStroke(style, item.stroke),
            frame: device ? { scale: nodeScale(style), size: parseFloat(style ? style.fontSize : "") } : null });
        });
        var probe = squareProbeOf(item, entry.text, item.depth, "frame");
        if (probe && !probe.frames) {
          probe.body = glyphBodyRect(probe.glyph);
          probe.frames = {};
          Array.prototype.forEach.call(probe.glyph.querySelectorAll("[data-fy-role]"), function (node) {
            probe.frames[node.getAttribute("data-fy-role")] = nodeFrame(node);
          });
        }
      });
    });
    /* 쓰기 1: 기준 틀 시험 음절을 빼고, 바탕 요소의 나누기 표시를 기본 나누기로 잠시 바꿔 시험 음절을 넣는다 — 기본 나누기(그 음절),
     * 합친 노드가 있으면 그 비례를 줄 음절(모두 낱, 머리 글자) */
    work.forEach(function (item) {
      removeProbes(item.probes);
      item.frames = item.probes;
      item.probes = Object.create(null);
      item.saved = [item.host.getAttribute("data-fy-vowel-depth"), item.host.getAttribute("data-fy-coda-depth")];
      item.host.setAttribute("data-fy-vowel-depth", item.base.vowel);
      item.host.setAttribute("data-fy-coda-depth", item.base.coda);
      insert(item, function (entry) {
        squareProbe(item, entry.text, item.base);
        if ((entry.pieces.vowelParts && item.base.vowel === "whole") || (entry.pieces.tailParts && item.base.coda === "whole")) {
          squareProbe(item, entry.text, ATOMIC_DEPTH);
        }
        if (entry.pieces.vowelParts && item.base.vowel === "syllable") {
          squareProbe(item, entry.pieces.head, item.base);
        }
      });
    });
    /* 읽기 2(한 번의 배치 계산): 시험 음절마다 몸통 상자와 노드마다 잉크 영역 */
    work.forEach(function (item) {
      Object.keys(item.probes).forEach(function (key) {
        var probe = item.probes[key];
        var pieces = syllablePieces(probe.text);
        probe.body = glyphBodyRect(probe.glyph);
        Array.prototype.forEach.call(probe.glyph.querySelectorAll("[data-fy-role]"), function (node) {
          var names = pieces ? nodePieces(node, pieces) : [];
          if (names.length) {
            var role = node.getAttribute("data-fy-role");
            /* 머리 음절은 자르지 않은 표준 잉크 상자도 — 기본 머리 맞춤(fitHeadSyllables)이 두 묶음을 그 상자로 옮긴다 */
            probe.nodes.push({ role: role, names: names, pos: node.getAttribute("data-fy-pos"),
              region: probeRegion(node, item.reference, item.meta.face === "device", false, true),
              open: role === "head" ? probeRegion(node, item.reference, item.meta.face === "device", true, true) : null,
              paint: item.meta.face === "device" ? squarePaint(node, item.meta, item.reference, item.host.ownerDocument) : null });
          }
        });
      });
    });
    /* 시험 음절을 빼고 나누기 표시를 되돌린다 */
    work.forEach(function (item) {
      removeProbes(item.probes);
      ["data-fy-vowel-depth", "data-fy-coda-depth"].forEach(function (name, index) {
        if (item.saved[index] === null) {
          item.host.removeAttribute(name);
        } else {
          item.host.setAttribute(name, item.saved[index]);
        }
      });
      var observer = item.state.observer;
      if (observer) {
        observer.takeRecords();
        if (item.pending.length) {
          later(function () { handleHostMutations(item.host, item.pending, observer); });
        }
      }
    });
    /* 맞추기: 노드마다 — 기본 나누기에서도 같은 자리(slot)에 그린 조각은 그 자리의 CSS가 이미 기본이라(나누기 조건 규칙 포함) 그대로.
     * 글꼴 CSS·다듬기·작업실·페이지가 그 노드의 자리(slot·부모·역할 단계의 top·left·size·scale)를 밝히지 않았으면 기준 틀에서 기본
     * 나누기 자리로 — 실제 노드의 자모·문맥 보정은 그 위에 걸린다. 밝혔으면 그 자리 그대로(CSS가 이긴다), 합친 노드는 조각만 제 상자
     * 안에서 기본 나누기 비례로 */
    work.forEach(function (item) {
      var doc = item.host.ownerDocument;
      var fitted = [];
      item.glyphs.forEach(function (entry) {
        var reference = squareReference(item, entry);
        var frame = item.frames ? squareProbeOf({ probes: item.frames }, entry.text, item.depth, "frame") : null;
        entry.nodes.forEach(function (target) {
          var node = target.node;
          var single = target.names.length === 1;
          var head = node.getAttribute("data-fy-role") === "head";
          if (single && reference.pos[target.names[0]] === node.getAttribute("data-fy-pos")) {
            return;
          }
          var ems = null;
          if (!target.declared) {
            var toEm = frame && frame.frames && frame.body ? frame.frames[node.getAttribute("data-fy-role")] : null;
            ems = toEm ? target.names.map(function (name) { return reference[name] ? toEm(fromBody(reference[name], frame.body)) : null; }) : null;
          } else if (!single && !head) {
            ems = relativeEms(target.names.map(function (name) { return reference[name]; }), target.box);
          }
          if (!ems || ems.some(function (em) { return !em; })) {
            return;
          }
          var fitBoxes = !target.declared && SQUARE_FIT_BOXES ? { from: target.box.slice(0, 4), to: unionBox(ems) } : null;
          var remember = function () {
            if (fitBoxes) {
              SQUARE_FIT_BOXES.set(node, fitBoxes);
            } else if (SQUARE_FIT_BOXES) {
              SQUARE_FIT_BOXES.delete(node);
            }
          };
          if (item.meta.face === "device") {
            var kind = appliedDesign(item.meta) ? fitSquareDesign(node, target, ems, item.meta, item.reference, doc) :
              fitSquareDevice(node, target, entry, ems, reference, item.meta, item.reference, doc) ? "device" : "";
            if (kind) {
              SQUARE_FITTED.set(node, kind);
              remember();
              fitted.push(node);
            }
            return;
          }
          var groups = squareSpanGroups(node, target.names, entry.pieces);
          var whole = target.names.length === 2 && !head;
          if (!groups && whole) {
            /* 그림 한 장으로 그린 통짜(그림 세트의 ㅘ·ㄺ 칸 — 통짜를 고른 뜻이 그 그림이다)는 가르지 않고 두 조각 자리의 합 상자에 맞춘다 */
            var all = node.querySelectorAll('[part="element"]');
            groups = all.length ? [all] : null;
            ems = [[Math.min(ems[0][0], ems[1][0]), Math.min(ems[0][1], ems[1][1]), Math.max(ems[0][2], ems[1][2]), Math.max(ems[0][3], ems[1][3])]];
            whole = false;
          }
          var units = squareFrame(target.box, ems, target.seen);
          var placed = ems.map(function (value) { return emUnits(value, units, target.seen); });
          if (!groups || placed.some(function (unit) { return !unit; })) {
            return;
          }
          var lead = whole ? JAMO_TO_COMPAT[target.names[0] === "V1" ? entry.pieces.vowelParts[0] : entry.pieces.tailParts[0]] : null;
          ELEMENT_UNITS.set(node, units);
          fitPartTargets(node, units, target.seen, placed, groups, whole ? wholeLineSplit(node, node.getAttribute("data-jamo"), lead) : null);
          SQUARE_FITTED.set(node, "element");
          remember();
          fitted.push(node);
        });
      });
      /* 이번에 옮기지 않은, 전에 옮긴 노드는 처음 자리로 */
      Array.prototype.forEach.call(item.root.querySelectorAll("[data-fy-role]"), function (node) {
        if (SQUARE_FITTED.has(node) && fitted.indexOf(node) < 0) {
          restoreSquareNode(node, item.meta, item.reference, doc);
        }
      });
      if (fitted.length) {
        SQUARE_HOSTS.add(item.host);
      } else {
        SQUARE_HOSTS.delete(item.host);
      }
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
  function probeRegion(node, reference, device, open, straight) {
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
    /* 자리 자르기: 원소·그림 재료는 획 묶음(hoek)이, 기기 글꼴은 노드가(빛 칠이면 ::before가) 받는다 */
    var clip = open ? [-Infinity, -Infinity, Infinity, Infinity] :
      insetClip(device ? deviceClipStyle(node, style) : computedStyleFor(hoek), width, height);
    var local = [Math.max(box[0] * size, clip[0]), Math.max(box[1] * size, clip[1]),
      Math.min(box[2] * size, clip[2]), Math.min(box[3] * size, clip[3])];
    if (!(local[2] > local[0] && local[3] > local[1])) {
      return null;
    }
    return nodeScreen(style, width, height, rect, straight).to(local);
  }

  /* 노드 상자(px)를 화면에 놓는 변환 — 노드 변환(slot 배율·기울기, 원점 transform-origin)으로 영역의 네 모서리를 옮긴 상자를, 노드
   * 상자를 같은 변환으로 옮긴 상자가 화면 상자(rect)에 오도록 맞춘다(조상의 배율도 여기서 들어간다). straight면 노드 변환의 돌림·기울임을
   * 빼고 축 배율만 쓴다(네모꼴 나누기 맞춤 — 말랑의 자모 기울기 --fy-jamo-rotate는 그 노드에 CSS가 다시 건다. 기울인 상자의 화면 상자를
   * 거쳐 재면 자리가 부푼다). to: 노드 px 영역 → 화면, from: 화면 영역 → 노드 px */
  function nodeScreen(style, width, height, rect, straight) {
    var m = /matrix\(([^)]+)\)/.exec(style.transform || "");
    m = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    var origin = String(style.transformOrigin || "").split(/\s+/).map(parseFloat);
    var ox = origin[0] || 0;
    var oy = origin[1] || 0;
    var linear = straight ? [(m[0] < 0 ? -1 : 1) * Math.sqrt(m[0] * m[0] + m[1] * m[1]), 0, 0,
      (m[3] < 0 ? -1 : 1) * Math.sqrt(m[2] * m[2] + m[3] * m[3])] : m;
    var span = function (t, l, top, r, b) {
      var xs = [];
      var ys = [];
      [[l, top], [r, top], [l, b], [r, b]].forEach(function (p) {
        xs.push(t[0] * (p[0] - ox) + t[2] * (p[1] - oy));
        ys.push(t[1] * (p[0] - ox) + t[3] * (p[1] - oy));
      });
      return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    };
    var frame = span(m, 0, 0, width, height);
    var sx = rect.width / (frame[2] - frame[0] || 1);
    var sy = rect.height / (frame[3] - frame[1] || 1);
    var det = linear[0] * linear[3] - linear[1] * linear[2];
    return {
      to: function (local) {
        var ink = span(linear, local[0], local[1], local[2], local[3]);
        return [rect.left + (ink[0] - frame[0]) * sx, rect.top + (ink[1] - frame[1]) * sy,
          rect.left + (ink[2] - frame[0]) * sx, rect.top + (ink[3] - frame[1]) * sy];
      },
      from: function (region) {
        if (!(Math.abs(det) > 1e-9)) {
          return null;
        }
        var px = [];
        var py = [];
        [[region[0], region[1]], [region[2], region[1]], [region[0], region[3]], [region[2], region[3]]].forEach(function (p) {
          var tx = (p[0] - rect.left) / sx + frame[0];
          var ty = (p[1] - rect.top) / sy + frame[1];
          px.push((linear[3] * tx - linear[2] * ty) / det + ox);
          py.push((-linear[1] * tx + linear[0] * ty) / det + oy);
        });
        return [Math.min.apply(null, px), Math.min.apply(null, py), Math.max.apply(null, px), Math.max.apply(null, py)];
      }
    };
  }

  function deviceClipStyle(node, style) {
    var own = String(style.clipPath || style.webkitClipPath || "none").trim();
    if (own !== "none" || typeof getComputedStyle !== "function") {
      return style;
    }
    var view = node.ownerDocument && node.ownerDocument.defaultView;
    return (view && view.getComputedStyle ? view.getComputedStyle(node, "::before") : getComputedStyle(node, "::before")) || style;
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
    var w = style ? (parseFloat(style.getPropertyValue("--fy-el-w")) + elementPlus(style)) / (parseFloat(style.fontSize) || 1) : NaN;
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

  /* 페이지 > 글꼴 > 기본값, 같은 수준에서는 디자인이 낱 설정을 이긴다. 배치는 재료와 독립으로 고르고, 디자인에서 생략하면
   * 낮은 수준의 배치를 물려받는다. legacy는 디자인만 끊는다 — 문맥 배치는 --fy-layout: square-context-v1로 고른다. */
  function readDesignToken(style) {
    return (readIdent(style, "--fy-design") || readIdent(style, "--fy-font-design")).toLowerCase();
  }

  function designTokenValid(token) {
    var name = normalizeJamoSetName(token);
    return name && !own(DESIGN_RESERVED, name) ? name : null;
  }

  function validFaceToken(token) {
    return token === "device" || token === "element" || token === "svg";
  }

  function readHostDesign(style, meta, implicitFont, jamoSet) {
    var token = readDesignToken(style);
    var pageToken = readIdent(style, "--fy-design").toLowerCase();
    var fontToken = readIdent(style, "--fy-font-design").toLowerCase();
    var pageLayout = readIdent(style, "--fy-layout").toLowerCase();
    var fontLayout = readIdent(style, "--fy-font-layout").toLowerCase();
    var fontDesign = designTokenValid(fontToken) ? DESIGNS[fontToken] : null;
    meta.layoutDesign = token !== "legacy" ? designTokenValid(fontToken) || "" : "";
    meta.layout = own(LAYOUT_PROFILES, fontLayout) ? fontLayout : implicitFont ? LAYOUT_DEFAULT : "";
    if (token !== "legacy" && fontDesign && fontDesign.layout) {
      meta.layout = fontDesign.layout.profile;
      meta.layoutRequested = fontDesign.layout.requested || "";
    }
    if (pageLayout) {
      if (own(LAYOUT_PROFILES, pageLayout)) {
        meta.layout = pageLayout;
        meta.layoutRequested = "";
        meta.layoutDesign = "";
      } else {
        meta.layoutStatus = "LAYOUT_NOT_REGISTERED";
      }
    } else if (fontLayout && !own(LAYOUT_PROFILES, fontLayout) && !(meta.layoutDesign && fontDesign && fontDesign.layout)) {
      meta.layoutStatus = "LAYOUT_NOT_REGISTERED";
    }
    if (token === "legacy") {
      return;
    }
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
    if (pageToken && design.layout) {
      meta.layout = design.layout.profile;
      meta.layoutRequested = design.layout.requested || "";
      meta.layoutDesign = name;
      meta.layoutStatus = "";
    }
    var pageFace = readIdent(style, "--fy-face").toLowerCase();
    if (!pageToken && (validFaceToken(pageFace) || jamoSet)) {
      /* 낮은 수준 디자인의 조립식·원본도 끊는다. face만 바꾸면 뒤의 appliedDesign이 다시 디자인으로 그린다. */
      meta.designStatus = "DESIGN_OVERRIDDEN_BY_PAGE";
      return;
    }
    meta.designRevision = design.revision;
    meta.face = design.face;
    meta.faceRequested = "";
    if (pageToken || !pageFace) {
      meta.faceStatus = "";
    }
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
  /* 디자인 소스의 family는 글꼴 이름이다. CSS 일반 글꼴 낱말(sans-serif 등)은 따옴표로 싸면 그 이름의 글꼴을 찾다 기본 글꼴로
   * 떨어지므로 그대로 둔다. */
  var GENERIC_FAMILY = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/;
  function designFamily(source) {
    var family = String(source.family);
    return (GENERIC_FAMILY.test(family) ? family : JSON.stringify(source.family)) + ", " + FACE_DEFAULT_FAMILY;
  }

  function readHostStyle(host, font, implicitFont, jamoSet) {
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
      faceRequested: "",
      faceStatus: "",
      inkBoxes: "",
      family: "",
      cap: "",
      design: "",
      designRevision: "",
      designStatus: "",
      layout: "",
      layoutDesign: "",
      layoutStatus: "",
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
        var pageFace = readIdent(style, "--fy-face").toLowerCase();
        var fontFace = readIdent(style, "--fy-font-face").toLowerCase();
        var face = validFaceToken(pageFace) ? pageFace : validFaceToken(fontFace) ? fontFace : "device";
        if (pageFace ? !validFaceToken(pageFace) : fontFace && !validFaceToken(fontFace)) {
          meta.faceStatus = "FACE_TOKEN_INVALID";
        }
        meta.face = face === "element" || face === "svg" ? "element" : "device";
        meta.faceRequested = face;
        meta.inkBoxes = boxTable;
        meta.family = String(style.getPropertyValue("--fy-font-family") || "").trim() || FACE_DEFAULT_FAMILY;
        var cap = (readIdent(style, "--fy-element-cap") || readIdent(style, "--fy-font-element-cap")).toLowerCase();
        meta.cap = cap === "round" || cap === "butt" ? cap : "square";
        readHostDesign(style, meta, implicitFont, jamoSet);
        /* 빛 칠은 기기 글꼴의 글자를 ::before로 옮기는 장치다. 원소·SVG 재료는 slot clip을 이미 획 묶음이 받고, 꾸밈은
         * 그린 칠(글자 단위 filter)을 쓴다 — 처음 읽을 때는 data-fy-face가 없어 글자 칠 규칙의 빛 변수가 보여도 끈다. */
        if (meta.face !== "device") {
          meta.glow = "";
        }
      }
    }
    if (!meta.inkBoxes && host.isConnected) {
      refuseHostDesign(style, meta);
      /* 잉크 상자가 없는 재료는 모양 프로파일·맞춘 재료를 적용할 수 없다. 명시한 선택을 말없이 버리지 않는다. */
      var unsupportedLayout = (readIdent(style, "--fy-layout") || readIdent(style, "--fy-font-layout")).toLowerCase();
      if (unsupportedLayout) {
        meta.layoutStatus = own(LAYOUT_PROFILES, unsupportedLayout) ? "LAYOUT_UNSUPPORTED_FONT" : "LAYOUT_NOT_REGISTERED";
      }
      var unsupportedFace = readIdent(style, "--fy-face").toLowerCase();
      if (unsupportedFace) {
        meta.faceStatus = validFaceToken(unsupportedFace) ? "FACE_UNSUPPORTED_FONT" : "FACE_TOKEN_INVALID";
      }
    }
    if (meta.contract !== null && meta.contract > SUPPORTED_FONT_CONTRACT && !CONTRACT_WARNINGS[font]) {
      CONTRACT_WARNINGS[font] = true;
      if (typeof console !== "undefined" && console.warn) {
        console.warn("font-kku: font \"" + font + "\" targets contract " + meta.contract +
          " but this runtime supports " + SUPPORTED_FONT_CONTRACT);
      }
    }
    /* 고정 글꼴 모양(세벌식·직결식)의 음절 나누기(ADR-030 §4): 페이지 깊이 변수 > 고른 모양 위의 보정(글꼴 CSS font-kku.tune 계층의
     * --fy-font-*-depth) > 모양의 기본(프로파일 depth — 모음 낱 + 겹받침 통짜). 바탕 글꼴(sebul)의 기본 나누기는 닿지 않는다 — 코어 CSS가
     * font-kku.shape 계층에서 고정 모양 바탕 요소의 글꼴 깊이 변수를 비운다. 그 규칙이 [data-fy-layout]으로 고르므로, 바탕 요소의 글꼴
     * 모양 표면이 바뀔 때는 먼저 찍고 글꼴 깊이를 다시 읽는다(글꼴 표면 data-fy-font를 찍은 뒤 읽는 것과 같다 — 처음 그릴 때 한 번) */
    var fixed = fixedLayout(meta);
    var shapeSurface = meta.layout && LAYOUT_PROFILES[meta.layout] ? meta.layout : "";
    var stampedSurface = typeof host.getAttribute === "function" ? host.getAttribute("data-fy-layout") || "" : shapeSurface;
    if (stampedSurface !== shapeSurface && (fixed || fixedLayout({ layout: stampedSurface }))) {
      if (shapeSurface) {
        host.setAttribute("data-fy-layout", shapeSurface);
      } else {
        host.removeAttribute("data-fy-layout");
      }
      fontDepth = readDepthLevel(style, FONT_DEPTH_VARIABLES);
    }
    /* 짓는 방식(ADR-034 §3): 페이지(깊이 변수 > --fy-composition) > 디자인 composition > 글꼴(깊이 변수 > --fy-font-composition) >
     * 모양의 기본. 아무 수준도 고르지 않으면 지금의 깊이 차례 그대로다 */
    var pageComposition = readCompositionToken(style, "--fy-composition");
    var fontComposition = readCompositionToken(style, "--fy-font-composition");
    var drawnDesign = meta.design && meta.designRevision && DESIGNS[meta.design] && DESIGNS[meta.design].revision === meta.designRevision ?
      DESIGNS[meta.design] : null;
    var composed = resolveComposition({
      page: { preset: pageComposition.preset, vowel: pageDepth.long.vowel, coda: pageDepth.long.coda, shorthand: pageDepth.shorthand },
      design: drawnDesign ? drawnDesign.composition : null,
      font: { preset: fontComposition.preset, vowel: fontDepth.long.vowel, coda: fontDepth.long.coda, shorthand: fontDepth.shorthand },
      shape: fixed ? fixed.depth : { vowel: DEFAULT_VOWEL_DEPTH, coda: DEFAULT_CODA_DEPTH }
    });
    meta.composition = composed.preset || "";
    meta.compositionPieces = composed.pieces === "none" ? "" : composed.pieces;
    meta.compositionStatus = pageComposition.invalid || fontComposition.invalid ? "COMPOSITION_INVALID" : "";
    return {
      expressionMode: normalizeExpressionMode(style.getPropertyValue("--fy-expression-mode")),
      depthOptions: { vowel: composed.vowel, coda: composed.coda },
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
    if (boxJamoSet(meta, jamoSet)) {
      return Object.assign({}, meta, { face: "svg", glow: "", faceStatus: meta.faceStatus === "FACE_TOKEN_INVALID" ? meta.faceStatus : "" });
    }
    return meta.faceRequested === "svg" && !meta.designRevision ?
      Object.assign({}, meta, { face: "element", glow: "", faceStatus: meta.faceStatus || "SVG_REQUIRES_BOX_SET" }) : meta;
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
      (meta.faceStatus || "") === (options.fontMeta.faceStatus || "") &&
      (style.fontMeta.cap || "") === (options.fontMeta.cap || "") &&
      (style.fontMeta.family || "") === (options.fontMeta.family || "") &&
      (style.fontMeta.design || "") === (options.fontMeta.design || "") &&
      (style.fontMeta.designRevision || "") === (options.fontMeta.designRevision || "") &&
      (style.fontMeta.designStatus || "") === (options.fontMeta.designStatus || "") &&
      (style.fontMeta.layout || "") === (options.fontMeta.layout || "") &&
      (style.fontMeta.layoutDesign || "") === (options.fontMeta.layoutDesign || "") &&
      (style.fontMeta.layoutStatus || "") === (options.fontMeta.layoutStatus || "") &&
      (style.fontMeta.layoutRequested || "") === (options.fontMeta.layoutRequested || "") &&
      (style.fontMeta.composition || "") === (options.fontMeta.composition || "") &&
      (style.fontMeta.compositionPieces || "") === (options.fontMeta.compositionPieces || "") &&
      (style.fontMeta.compositionStatus || "") === (options.fontMeta.compositionStatus || "") &&
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

  /* 옛한글(ADR-032 §2.3, ADR-034 §7): 옛 첫가끝 자모·확장 자모·채움 문자·방점·옛 호환 자모. 짓는 방식은 H6 전까지 옛한글 묶음에 걸지
   * 않는다(지금 출력 그대로) — 그런 글이 있으면 진단만 남긴다 */
  var OLD_HANGUL = /[ᄓ-ᅟᅠᅶ-ᆧᇃ-ᇿꥠ-꥿ힰ-퟿〮〯ㅥ-ㆎ]/;

  /* 짓는 방식의 바탕 요소 진단(공백으로 나눈 코드): COMPOSITION_INVALID 모르는 낱말, COMPOSITION_UNSUPPORTED 조각 깊이를 이 재료로
   * 지을 수 없음(기기 글꼴 낱자·자소판 — 글꼴 디자인이나 원소·그림 재료로), COMPOSITION_OLD_HANGUL 옛한글은 그대로 그림. 고르지 않으면 없다 */
  function compositionStatusFor(meta, source, vectorSet) {
    var codes = [];
    if (meta.compositionStatus) {
      codes.push(meta.compositionStatus);
    }
    if (meta.compositionPieces) {
      var design = meta.designRevision && DESIGNS[meta.design] ? DESIGNS[meta.design] : null;
      var drawn = meta.inkBoxes && !vectorSet && meta.material === "system" &&
        (meta.face === "element" || meta.face === "svg" || (design && design.mode === "font"));
      if (!drawn) {
        codes.push("COMPOSITION_UNSUPPORTED");
      }
    }
    if (meta.composition && typeof source === "string" && OLD_HANGUL.test(source)) {
      codes.push("COMPOSITION_OLD_HANGUL");
    }
    return codes.join(" ");
  }

  /* WebKit은 자모의 개별 translate·rotate가 0으로 돌아와도 움직임 때 넓어진 스크롤 영역을 줄이지 않는다 — 조립(assemble) 뒤 문서
   * 끝에 빈 스크롤이 남는다(docs/NOTES/motion-addon.md). 그 노드나 이미 transform이 있는 조상(glyph-body)의 transform을 바꿔도
   * 소용없고, transform이 없는 조상(음절 상자 part="glyph")의 transform을 바꾸면 그 바탕 요소 전체를 다시 잰다. 그래서 WebKit 엔진
   * (Safari, iOS의 모든 브라우저)에서만, 음절 상자 안 노드의 움직임(animation — 끝나거나 취소되면, translate·rotate·transform
   * transition — 끝나면)이 끝난 프레임에 줄 덩이(part="line", 줄바꿈마다 하나 — 없으면 바탕 요소)마다 음절 상자 하나의 transform을
   * 한 번 바꿨다 같은 작업 안(칠하기 전)에 되돌린다. 상자 하나로 그 줄 덩이만 다시 잰다. transition 취소(transitioncancel)는 듣지
   * 않는다 — WebKit은 transition이 걸린 자모를 animation이 움직이면 프레임마다 취소 사건을 낸다(wave + 흩어지기 뒤 초당 1,600번). 페이지
   * 칠을 건드리지 않게: transform 하나만 CSSOM으로 바꾸고 값·우선순위째 되돌린다(transition은 그대로 — 끄면 그 상자에서 도는 페이지
   * transition이 끝값으로 뛴다. style 속성 글을 setAttribute로 되돌리면 CSP style-src가 막는다). 이미 transform이 있거나 transform을
   * transition하는 상자는 건너뛰고 그 바탕 요소의 다음 상자를 본다. 다른 엔진은 스스로 줄여 아무것도 하지 않는다(강제 배치 비용). */
  var SETTLE_WATCHED = typeof WeakSet === "function" ? new WeakSet() : null;
  var SETTLE_STATE = typeof WeakMap === "function" ? new WeakMap() : null;
  var SETTLE_PROPERTIES = { translate: true, rotate: true, transform: true };

  /* WebKit 엔진인지 — 넓어진 스크롤 영역을 줄이지 않는 엔진. 사용자 에이전트의 AppleWebKit 표지에서 Chromium 계열(Chrome·Edg·OPR·
   * SamsungBrowser — HeadlessChrome 포함)을 뺀다. iOS의 Chrome(CriOS)·Firefox(FxiOS)·Edge(EdgiOS)는 WebKit이라 남는다. */
  function webkitEngine(view) {
    var ua = (view && view.navigator && view.navigator.userAgent) || "";
    return /AppleWebKit\//.test(ua) && !/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(ua);
  }

  /* transform을 transition하는지 — all·transform·-webkit-transform, 시간이나 늦춤이 0보다 크면(시간 0 + 늦춤도 transition이 선다) */
  function transitionsTransform(style) {
    var names = String(style.transitionProperty || "").split(",");
    var times = String(style.transitionDuration || "0s").split(",");
    var delays = String(style.transitionDelay || "0s").split(",");
    return names.some(function (name, i) {
      var trimmed = name.trim();
      return (trimmed === "all" || trimmed === "transform" || trimmed === "-webkit-transform") &&
        (parseFloat(times[i % times.length]) > 0 || parseFloat(delays[i % delays.length]) > 0);
    });
  }

  /* 줄 덩이마다 줄 선 음절 상자 가운데 바꿀 수 있는 첫 상자 하나의 transform을 바꿨다 되돌린다 — font-kku-fx.js settleParents와
   * 같은 규칙. groups: [[상자, …], …] */
  function nudgeBoxes(groups, view) {
    var ready = [];
    groups.forEach(function (boxes) {
      for (var i = 0; i < boxes.length; i += 1) {
        var box = boxes[i];
        if (!box.isConnected || !box.style) {
          continue;
        }
        var style = view.getComputedStyle(box);
        if (style.transform === "none" && !transitionsTransform(style)) {
          ready.push(box);
          return;
        }
      }
    });
    if (!ready.length) {
      return;
    }
    var saved = ready.map(function (box) {
      return [box.hasAttribute("style"), box.style.getPropertyValue("transform"), box.style.getPropertyPriority("transform")];
    });
    ready.forEach(function (box) {
      box.style.setProperty("transform", "translateZ(0)", "important");
    });
    void ready[0].offsetWidth;
    ready.forEach(function (box, i) {
      if (saved[i][1]) {
        box.style.setProperty("transform", saved[i][1], saved[i][2]);
      } else {
        box.style.removeProperty("transform");
      }
      if (!saved[i][0] && box.getAttribute("style") === "") {
        box.removeAttribute("style");
      }
    });
  }

  function enqueueSettle(host, box) {
    var doc = host.ownerDocument;
    var view = doc && doc.defaultView;
    if (!SETTLE_STATE || !view || typeof view.requestAnimationFrame !== "function" || typeof Map !== "function") {
      return;
    }
    var state = SETTLE_STATE.get(doc);
    if (!state) {
      state = { hosts: new Map(), frame: false };
      SETTLE_STATE.set(doc, state);
    }
    var group = (typeof box.closest === "function" && box.closest('[part="line"]')) || host;
    var boxes = state.hosts.get(group);
    if (!boxes) {
      state.hosts.set(group, [box]);
    } else if (boxes.indexOf(box) < 0) {
      boxes.push(box);
    }
    if (!state.frame) {
      state.frame = true;
      view.requestAnimationFrame(function () {
        state.frame = false;
        var groups = [];
        state.hosts.forEach(function (list) {
          groups.push(list);
        });
        state.hosts.clear();
        if (typeof view.getComputedStyle === "function") {
          nudgeBoxes(groups, view);
        }
      });
    }
  }

  function queueSettle(host, event) {
    if (event.type === "transitionend" && !SETTLE_PROPERTIES[event.propertyName]) {
      return;
    }
    var target = event.target;
    var glyph = target && target !== host && typeof target.closest === "function" ? target.closest('[part~="glyph"]') : null;
    if (!glyph || glyph === target || !host.contains(glyph)) {
      return;
    }
    enqueueSettle(host, glyph);
  }

  function watchMotionSettle(host) {
    var view = host.ownerDocument && host.ownerDocument.defaultView;
    /* 창이 없는 문서(떼어 낸 문서·template)에서 그린 바탕 요소는 아직 표시하지 않는다 — 페이지에 옮겨 다시 그릴 때 본다 */
    if (!SETTLE_WATCHED || !view || SETTLE_WATCHED.has(host) || typeof host.addEventListener !== "function") {
      return;
    }
    SETTLE_WATCHED.add(host);
    if (!webkitEngine(view)) {
      return;
    }
    var listener = function (event) {
      queueSettle(host, event);
    };
    ["animationend", "animationcancel", "transitionend"].forEach(function (type) {
      host.addEventListener(type, listener);
    });
  }

  /* 바탕 요소의 class에 꾸밈(kku-look-*)이 있으면 data-fy-look을 찍는다 — 움직임 CSS가 class 부분 일치 대신 이것으로 고른다
   * (class 속성 선택자 뒤의 자손 결합자는 Chromium에서 페이지의 모든 class 바꿈이 그 아래 자모를 다시 계산하게 한다). class
   * 바꿈은 observeHost가 본다 */
  function markLook(host) {
    var look = String(host.getAttribute("class") || "").indexOf("kku-look-") >= 0;
    if (look !== host.hasAttribute("data-fy-look")) {
      if (look) { host.setAttribute("data-fy-look", ""); } else { host.removeAttribute("data-fy-look"); }
    }
  }

  function setHostContract(host, source, options) {
    watchMotionSettle(host);
    markLook(host);
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
    var setStatus = jamoSetStatus(options);
    if (setStatus) {
      host.dataset.fyJamoSetStatus = setStatus;
    } else {
      delete host.dataset.fyJamoSetStatus;
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
    if (fontMeta.faceStatus) {
      host.dataset.fyFaceStatus = fontMeta.faceStatus;
    } else {
      delete host.dataset.fyFaceStatus;
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
    /* 글꼴 모양(ADR-026·030): 프로파일을 쓸 때만 찍는다 — 지금 배치(legacy)는 속성이 없다. 모양의 모델은 바탕 요소에 적지 않는다
     * (ADR-030 D6) — 코어 CSS의 모양 값 규칙이 프로파일 이름으로 고르고, 원칙은 FontKku.layoutProfiles[이름]에서 읽는다 */
    if (fontMeta.layout && LAYOUT_PROFILES[fontMeta.layout]) {
      host.dataset.fyLayout = fontMeta.layout;
    } else {
      delete host.dataset.fyLayout;
    }
    if (fontMeta.layoutStatus) {
      host.dataset.fyLayoutStatus = fontMeta.layoutStatus;
    } else {
      delete host.dataset.fyLayoutStatus;
    }
    /* 짓는 방식(ADR-034): 고른 프리셋(축을 바꿨으면 custom)일 때만 찍는다 — 고르지 않으면 DOM이 지금 그대로다 */
    if (fontMeta.composition) {
      host.dataset.fyComposition = fontMeta.composition;
    } else {
      delete host.dataset.fyComposition;
    }
    var compositionStatus = compositionStatusFor(fontMeta, source, vectorSet);
    if (compositionStatus) {
      host.dataset.fyCompositionStatus = compositionStatus;
    } else {
      delete host.dataset.fyCompositionStatus;
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
        job.options.fontExplicit === state.options.fontExplicit && job.options.jamoSet === state.options.jamoSet) {
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
        previous.options.fontExplicit === job.options.fontExplicit && previous.options.jamoSet === job.options.jamoSet) {
      return {
        expressionMode: previous.options.expressionMode,
        depthOptions: previous.options.depthOptions,
        fontMeta: previous.options.fontMeta,
        strokeDepth: previous.options.styleStrokeDepth,
        resolved: false
      };
    }
    return readHostStyle(job.host, job.options.font, !job.options.fontExplicit, job.options.jamoSet);
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
    paintSpriteCells(jobs.map(function (job) {
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
      markShapeDraw(root, fixed);
    }
    var boxSet = boxJamoSet(options.fontMeta, options.jamoSet);
    options.fontMeta = drawnFaceMeta(options.fontMeta, options.jamoSet);
    if (options.jamoSeeds) {
      prepareJamoSeeds(root, options.jamoSeeds, options.seed === undefined || options.seed === null ? "" : String(options.seed));
    }
    if (options.fontMeta && options.fontMeta.face === "device") {
      fitFaceNodes(root, options.fontMeta, host.ownerDocument);
    } else if (options.fontMeta && (options.fontMeta.face === "element" || options.fontMeta.face === "svg")) {
      renderSquareWhole = squareWholeVowels(host, options);
      try {
        buildElementNodes(root, options.fontMeta, host.ownerDocument, boxSet);
      } finally {
        renderSquareWhole = false;
      }
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

    applyGlyphMappings(host);
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
      markLook(host);
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
        options.fontMeta = drawnFaceMeta(style.fontMeta, options.jamoSet);
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
  /* 다시 해석으로 바뀐 바탕 요소의 차례 번호 — loadFont가 자기 stylesheet 때문에 바뀐 요소를, 자동 다시 맞춤(load 사건 앞의
   * 예약된 restyle)이 먼저 처리했어도 돌려주게 한다 */
  var RESTYLE_SERIAL = 0;
  var HOST_CHANGED_AT = new WeakMap();

  function checkHosts(hosts, reason) {
    var entries = [];
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      if (state && host.isConnected) {
        entries.push({ host: host, state: state, style: null });
      }
    });
    entries.forEach(function (entry) {
      entry.style = readHostStyle(entry.host, entry.state.options.font, !entry.state.options.fontExplicit, entry.state.options.jamoSet);
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
    paintSpriteCells(entries.filter(function (entry) {
      return !rebuilt.has(entry.host);
    }).map(function (entry) { return entry.host; })).forEach(function (host) {
      if (repainted.indexOf(host) < 0) { repainted.push(host); }
    });
    entries.forEach(function (entry) {
      if (!rebuilt.has(entry.host) && applyGlyphMappings(entry.host) && repainted.indexOf(entry.host) < 0) {
        repainted.push(entry.host);
      }
    });
    repainted.forEach(function (host) {
      if (changed.indexOf(host) < 0) { changed.push(host); }
      dispatchRender(host, reason);
    });
    /* A font CSS whose structure matches the default is only metadata here
     * (no rebuild), so the autoload veil is settled for every checked host. */
    entries.forEach(function (entry) {
      autoload(entry.host);
    });
    RESTYLE_SERIAL += 1;
    changed.forEach(function (host) { HOST_CHANGED_AT.set(host, RESTYLE_SERIAL); });
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
    FACE_STEMS = Object.create(null);
    FACE_BASELINES = Object.create(null);
    GLYPH_INK = Object.create(null);
    forEachRegistered(function (host) {
      var state = STATE.get(host);
      var root = state && host.ownerDocument === doc && state.options.fontMeta.face === "device" ? getManagedRoot(host) : null;
      if (root) {
        fitFaceNodes(root, state.options.fontMeta, doc);
        /* 표준 맞춤이 네모꼴 나누기 맞춤을 덮었다 — 받은 글꼴로 다시 잰다 */
        fitSquareSplits([host]);
      }
      if (state && host.ownerDocument === doc) { applyGlyphMappings(host); }
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
       * 따라오지 않는다(끌기 맞춤이 옮긴 끝이 복사에서 빠졌다, 0.1.3 탐색 matrix-11) */
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
     * 건너뛰므로, 끌기를 런타임이 맡는다(steerDrag). 페이지가 누르기를 막으면(pointerdown·mousedown preventDefault — 브라우저도
     * 고르지 않는다) 끝을 옮기지도, 두세 번 누르기로 고르지도 않는다 — 막혔는지는 페이지 듣개가 다 돈 뒤(문서 거품) 본다 */
    var listen = { capture: true, passive: true };
    doc.addEventListener("pointerdown", function (event) {
      var path = typeof event.composedPath === "function" ? event.composedPath() : [];
      var target = path[0] || event.target;
      var jamo = pressedJamo(event);
      var mouse = event.button === 0 && event.pointerType !== "touch";
      SELECT_POINTERS.set(doc, { x: event.clientX, y: event.clientY, from: [event.clientX, event.clientY], down: true,
        armed: false, moved: false, mouse: mouse, jamo: jamo, anchor: mouse ? pressAnchor(doc, event, target) : null,
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
        /* 끄는 동안 프레임마다 맞춘다 — 숨긴 자모를 누르면 Firefox는 범위를 만들지 않아 selectionchange가 오지 않고, 한 번 맞춘 뒤에는
         * 브라우저가 끝을 다시 옮겨도 접히지 않는다(0.1.3 탐색 api-22) */
        if (pointer.armed && pointer.moved) {
          scheduleSelectionMirror(doc);
        }
      }
    }, listen);
    ["pointerup", "pointercancel"].forEach(function (type) {
      doc.addEventListener(type, function (event) {
        var pointer = SELECT_POINTERS.get(doc);
        /* 끌지 않은 Shift+누르기도 선택 끝을 옮기고(낱말 사이 칸을 누르면 브라우저가 끝을 다음 음절에 둔다, 0.1.3 탐색 api-23), 바탕 요소
         * 안을 누르기만 했으면 캐럿을 누른 자리에 둔다 — 빛 칠·그림 세트에서는 브라우저 캐럿이 다음 보이는 글로 가서 이어지는
         * Shift+누르기가 거기서 늘었다 */
        var steer = pointer && pointer.armed && (pointer.moved || pointer.shift || pointer.anchor);
        if (pointer && pointer.down && steer && type === "pointerup") {
          steerDrag(doc, event.clientX, event.clientY);
        }
        if (pointer) {
          pointer.down = false;
          pointer.armed = pointer.armed && type === "pointerup";
          /* 브라우저가 놓기(mouseup 기본 동작)에서 선택을 다시 정할 수 있어 다음 프레임에 한 번 더 옮긴다(두세 번 누르기 고르기는
           * click에서 이 맞춤을 거둔다) */
          pointer.release = Boolean(pointer.armed && steer);
          if (pointer.release) {
            scheduleSelectionMirror(doc);
          }
        }
      }, listen);
    });
    doc.addEventListener("click", function (event) {
      var pointer = SELECT_POINTERS.get(doc);
      if (pointer && pointer.armed) {
        if (event.detail >= 2) {
          pointer.release = false;
        }
        try {
          selectByClicks(doc, event);
        } catch (error) { /* 브라우저가 그 범위를 받지 않으면 브라우저 선택 그대로 */ }
      }
    }, { passive: true });
  }

  /* 누른 자리 — 그린 관리 root 안의 자모·낱말 사이 칸·글자 칸(그 글자의 첫 자모)을 눌렀으면 그 노드(quietPress가 본다).
   * 빛 칠의 숨긴 자모는 맞힘 영역이 좁아 글자 가장자리를 누르면 낱말·줄 노드가 잡힌다 — 그때는 누른 자리를 품은 글자·칸 */
  function pressedJamo(event) {
    var path = typeof event.composedPath === "function" ? event.composedPath() : [];
    var target = path[0] || event.target;
    var element = target && (target.nodeType === 1 ? target : target.parentNode);
    var under = element ? pointerTarget(element, event.clientX, event.clientY) : null;
    return under ? under.node : null;
  }

  /* Firefox가 selectstart 없이 아무것도 고르지 않는 누르기인가 — 빛 칠 자모(matrix-11 — 기기 글꼴 맞춤의 빛 칠 자모는 숨기지 않아도
   * Firefox가 캐럿을 두지 않는다, api-25), 숨긴(visibility) 자모, 그림 세트 자모 안의 SVG 그림(0.1.3 탐색 xbrowser-17). pressSelects가
   * 그때는 이 누르기를 고르기 시작으로 본다 */
  function quietPress(jamo, target) {
    var view = jamo && jamo.ownerDocument ? jamo.ownerDocument.defaultView : null;
    if (!view) {
      return false;
    }
    return (hasPart(jamo, "jamo") && !!jamo.closest("[data-fy-glow]:not([data-fy-material])")) ||
      view.getComputedStyle(jamo).visibility === "hidden" || !!(target && target.namespaceURI === "http://www.w3.org/2000/svg");
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

  // ── 끌어 고르기: 누른 자리와 끝을 한 곳에서(ADR-003 보강, 2026-10-19 다시 설계)
  /* 브라우저가 정한 선택 자리를 고쳐 쓰던 길(누른 자리 되돌리기·끝 옮기기·줄 끝 너머 맞춤)은 재료마다 브라우저 캐럿이 달라(빛 칠의
   * 숨긴 자모, 그림 세트의 SVG, gothic의 겹친 자모 상자, 그림자 트리) 덧댈 때마다 다른 꼴이 깨졌다(0.1.3 탐색 넷, api-21·22·24·25·28,
   * matrix-13·14, xbrowser-18·19). 이제 끌기를 런타임이 맡는다 — 누를 때 그 자리를, 끄는 동안과 놓을 때 포인터 자리를 같은 셈
   * (dragPoint)으로 선택 자리 [노드, 자리]로 바꿔 setBaseAndExtent로 둔다. 그린 관리 root 안이면 그림 상자(자모·글자·빈칸·화면 줄)로,
   * 밖이면 브라우저 캐럿 자리. 누른 자리와 포인터가 둘 다 바탕 요소 밖이면 브라우저 선택 그대로다. */

  /* 포인터 아래 가장 깊은 요소 — 열린 그림자 트리 안까지(문서의 elementFromPoint는 그림자 호스트에서 멈춘다) */
  function deepElementFromPoint(doc, x, y) {
    var hit = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(x, y) : null;
    for (var depth = 0; hit && hit.shadowRoot && typeof hit.shadowRoot.elementFromPoint === "function" && depth < 16; depth += 1) {
      var inner = hit.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === hit) {
        break;
      }
      hit = inner;
    }
    return hit;
  }

  /* 노드를 품은 자모 단위로 고르는 관리 root — 원문 거울이나 바탕 요소 자신이면 그 바탕 요소의 root */
  function selectRootOf(node) {
    var element = node && (node.nodeType === 1 ? node : node.parentNode);
    if (!element || element.nodeType !== 1 || typeof element.closest !== "function") {
      return null;
    }
    var root = element.closest('[part="root"]');
    if (!root) {
      var mirror = element.closest('[part="sr-source"]');
      var host = mirror ? mirror.parentNode : STATE.has(element) ? element : null;
      root = host && STATE.has(host) ? getManagedRoot(host) : null;
    }
    return root && root.getAttribute("data-fy-select") === "jamo" ? root : null;
  }

  /* 브라우저 캐럿 자리 — 바탕 요소 밖 글 */
  function caretPointAt(doc, x, y) {
    try {
      if (typeof doc.caretPositionFromPoint === "function") {
        var position = doc.caretPositionFromPoint(x, y, { shadowRoots: knownShadowRoots(doc) });
        if (position && position.offsetNode) {
          return [position.offsetNode, position.offset];
        }
      }
      if (typeof doc.caretRangeFromPoint === "function") {
        var range = doc.caretRangeFromPoint(x, y);
        if (range) {
          return [range.startContainer, range.startOffset];
        }
      }
    } catch (error) { /* 아래 */ }
    return null;
  }

  /* 글자 안 (x, y)를 품은 자모 — 상자가 겹치면(gothic 받침 칸) 작은 쪽 */
  function jamoAt(glyph, x, y) {
    var found = null;
    var area = Infinity;
    partNodes(glyph, "jamo").forEach(function (jamo) {
      var box = jamo.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom && box.width * box.height < area) {
        area = box.width * box.height;
        found = jamo;
      }
    });
    return found;
  }

  /* root 안 (x, y)의 선택 자리 — 자모 위면 그 자모의 맨 앞(범위가 그 자모에 닿아 그 자모를 고른다), 글자·빈칸의 빈 곳이면 그 가운데를
   * 기준으로 앞·뒤(브라우저 캐럿처럼), 아무것도 품지 않으면(줄 끝 너머·줄 사이·글자 위아래) 그 화면 줄에서 포인터 앞의 마지막 글자·빈칸
   * 뒤 — 줄 앞이면 첫 글자 앞 */
  function pointInRoot(root, x, y, hit) {
    var direct = hit && hit.nodeType === 1 && typeof hit.closest === "function" ? hit.closest('[part~="jamo"]') : null;
    if (direct && root.contains(direct)) {
      return [direct, 0];
    }
    var units = Array.prototype.slice.call(root.querySelectorAll('[part~="glyph"], [part~="space"]'));
    if (!units.length) {
      return [root, 0];
    }
    var boxes = units.map(function (unit) { return unit.getBoundingClientRect(); });
    for (var index = 0; index < units.length; index += 1) {
      var box = boxes[index];
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
        var jamo = hasPart(units[index], "glyph") ? jamoAt(units[index], x, y) : null;
        if (jamo) {
          return [jamo, 0];
        }
        return x < box.left + box.width / 2 ? [units[index].parentNode, nodeIndex(units[index])]
          : [units[index].parentNode, nodeIndex(units[index]) + 1];
      }
    }
    /* 화면 줄: 포인터 높이를 품은 단위들, 없으면 가장 가까운 단위와 가운데 높이가 같은 단위들 */
    var row = [];
    boxes.forEach(function (box, i) {
      if (y >= box.top && y <= box.bottom) {
        row.push(i);
      }
    });
    if (!row.length) {
      var nearest = 0;
      var gap = Infinity;
      boxes.forEach(function (box, i) {
        var distance = y < box.top ? box.top - y : y - box.bottom;
        if (distance < gap) {
          gap = distance;
          nearest = i;
        }
      });
      var middle = (boxes[nearest].top + boxes[nearest].bottom) / 2;
      var half = (boxes[nearest].bottom - boxes[nearest].top) / 2;
      boxes.forEach(function (box, i) {
        if (Math.abs((box.top + box.bottom) / 2 - middle) <= half) {
          row.push(i);
        }
      });
    }
    var before = -1;
    row.forEach(function (i) {
      if (boxes[i].right <= x) {
        before = i;
      }
    });
    var unit = units[before >= 0 ? before : row[0]];
    return [unit.parentNode, nodeIndex(unit) + (before >= 0 ? 1 : 0)];
  }

  /* 포인터 (x, y)의 선택 자리. 고를 수 없는 바탕 요소(user-select: none 조상) 위면 null */
  function dragPoint(doc, x, y) {
    var hit = deepElementFromPoint(doc, x, y);
    var root = selectRootOf(hit);
    var caret = null;
    if (!root) {
      caret = caretPointAt(doc, x, y);
      root = caret ? selectRootOf(caret[0]) : null;
    }
    if (root) {
      return selectableChain(root) ? pointInRoot(root, x, y, hit) : null;
    }
    return caret;
  }

  /* 누를 때 정하는 닻 — 바탕 요소 안을 누르면 그 자리, Shift+누르기면 있던 선택의 닻(브라우저가 누르기로 바꾸기 전), 그 밖은 null
   * (브라우저 닻을 쓴다) */
  function pressAnchor(doc, event, target) {
    if (event.shiftKey) {
      var selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
      if (!selection || !selection.rangeCount) {
        return null;
      }
      var saved = saveSelection(doc, selection);
      var range = saved.ranges.length === 1 ? saved.ranges[0] : null;
      return range ? (saved.backward ? [range.endContainer, range.endOffset] : [range.startContainer, range.startOffset]) : null;
    }
    var root = selectRootOf(target);
    return root && selectableChain(root) ? pointInRoot(root, event.clientX, event.clientY, target) : null;
  }

  /* 끄는 선택을 닻 → 포인터 자리로. 닻도 포인터도 바탕 요소 밖이면 브라우저 선택 그대로, 그림자 경계를 넘으면(트리가 다르면) 그대로 */
  function steerDrag(doc, x, y) {
    var selection = typeof doc.getSelection === "function" ? doc.getSelection() : null;
    var pointer = SELECT_POINTERS.get(doc);
    if (!selection || !pointer || !pressSelects(pointer) || typeof selection.setBaseAndExtent !== "function") {
      return;
    }
    var focus = dragPoint(doc, x, y);
    var anchor = pointer.anchor && pointer.anchor[0].isConnected !== false ? pointer.anchor : null;
    if (!focus || (!(anchor && selectRootOf(anchor[0])) && !selectRootOf(focus[0]))) {
      return;
    }
    if (!anchor) {
      if (!selection.rangeCount) {
        return;
      }
      var ends = selectionEnds(doc, selection, treeOf(focus[0]));
      anchor = ends ? ends.anchor : null;
    }
    if (!anchor || !anchor[0] || treeOf(anchor[0]) !== treeOf(focus[0])) {
      return;
    }
    if (selection.anchorNode === anchor[0] && selection.anchorOffset === anchor[1] &&
        selection.focusNode === focus[0] && selection.focusOffset === focus[1]) {
      return;
    }
    try {
      selection.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1]);
    } catch (error) { /* 브라우저가 받지 않으면 그대로 */ }
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
      steerDrag(doc, pointer.x, pointer.y);
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
  function rangeHtml(doc, range, shadowTexts) {
    var box = doc.createElement("div");
    box.appendChild(range.cloneContents());
    var clones = [];
    (function walk(node) {
      elementChildren(node).forEach(function (child) {
        var shadow = child.getAttribute(COPY_SHADOW_MARK);
        if (shadow !== null) {
          /* 그림자 호스트의 복제는 그림자 트리를 담지 않는다 — 그 트리의 글을 넣는다 */
          child.removeAttribute(COPY_SHADOW_MARK);
          var inner = (shadowTexts || [])[Number(shadow)] || "";
          child.textContent = inner;
          if (/[\n\r\t]| {2}/.test(inner)) {
            child.style.setProperty("white-space", "pre-wrap");
          }
        } else if (/^(script|style|link|template|noscript)$/i.test(child.localName || "")) {
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
    if (segment.tree && segment.tree.nodeType === 11) {
      return { text: treeRangeText(doc, range, own), html: rangeHtml(doc, range) };
    }
    var text;
    var shadows = shadowHostsWithin(mapped, segment.tree);
    var shadowTexts = shadows.map(function (shadowHost) {
      return shadowCopyText(doc, shadowHost, plan);
    });
    roots.forEach(function (root) {
      root.setAttribute("data-fy-select", "copy");
    });
    try {
      if (!shadows.length) {
        text = fixMirrorPieces(selection, mapped, nativeText(selection, mapped, saved), own, saved);
      } else {
        /* 브라우저 직렬화(selection.toString)는 그림자 트리 글을 담지 않는다(세 엔진, 0.1.3 탐색 api-26 — 브라우저 자체 복사는 담는다).
         * 범위를 그림자 호스트에서 나눠 사이마다 직렬화하고 호스트 자리에 그 트리의 글을 끼운다 */
        var pieces = [];
        var cursor = mapped.cloneRange();
        shadows.forEach(function (shadowHost, index) {
          var part = cursor.cloneRange();
          part.setEndBefore(shadowHost);
          pieces.push(partCopyText(selection, part, own, saved));
          pieces.push(shadowTexts[index]);
          cursor.setStartAfter(shadowHost);
        });
        pieces.push(partCopyText(selection, cursor, own, saved));
        text = joinCopyPieces(pieces, shadows);
      }
    } finally {
      roots.forEach(function (root) {
        root.setAttribute("data-fy-select", "jamo");
      });
    }
    shadows.forEach(function (shadowHost, index) {
      shadowHost.setAttribute(COPY_SHADOW_MARK, String(index));
    });
    try {
      return { text: text, html: rangeHtml(doc, mapped, shadowTexts) };
    } finally {
      shadows.forEach(function (shadowHost) {
        shadowHost.removeAttribute(COPY_SHADOW_MARK);
      });
    }
  }

  var COPY_SHADOW_MARK = "data-fy-copy-shadow";

  /* 범위가 통째로 품은 열린 그림자 호스트 — 그 트리의 것만, 바깥 것만, 문서 차례 */
  function shadowHostsWithin(range, tree) {
    var top = range.commonAncestorContainer;
    var start = top && (top.nodeType === 1 || top.nodeType === 11 || top.nodeType === 9) ? top : top && top.parentNode;
    var doc = start ? (start.nodeType === 9 ? start : start.ownerDocument) : null;
    if (!doc || typeof doc.createTreeWalker !== "function") {
      return [];
    }
    var found = [];
    var walker = doc.createTreeWalker(start, 1);
    for (var node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.nodeType === 1 && node.shadowRoot && treeOf(node) === tree && containsNode(range, node) &&
          !found.some(function (outer) { return outer.contains(node); })) {
        found.push(node);
      }
    }
    return found;
  }

  /* 그림자 호스트 안 글 — 그 트리 전체를 treeRangeText로 */
  function shadowCopyText(doc, shadowHost, plan) {
    var shadow = shadowHost.shadowRoot;
    var range = doc.createRange();
    range.setStart(shadow, 0);
    range.setEnd(shadow, shadow.childNodes.length);
    var memo = new Map();
    var picks = plan.hosts.filter(function (host) {
      return treeOf(host) === shadow;
    }).map(wholeSelection).filter(function (pick) {
      return pick && selectableChain(pick.root, memo);
    });
    return treeRangeText(doc, range, picks);
  }

  /* 그림자 트리 안 범위의 글 — 브라우저 직렬화(selection.toString)는 그림자 트리 안 선택을 읽지 못한다(Chromium·WebKit ''). 범위 안 글
   * 노드는 그린 대로(공백 묶음은 하나 — white-space: pre 계열은 그대로), 바탕 요소는 고른 원문, 블록 사이는 줄바꿈 하나. 그 트리 안의
   * 그림자 호스트는 그 트리의 글을 끼운다 */
  function treeRangeText(doc, range, picks) {
    var view = doc.defaultView;
    var style = function (node) {
      return view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(node) : null;
    };
    var out = "";
    var newline = function () {
      if (out && !/\n$/.test(out)) {
        out += "\n";
      }
    };
    var top = range.commonAncestorContainer;
    (function walk(node, pre) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (!range.intersectsNode(child)) {
          continue;
        }
        if (child.nodeType === 3) {
          var data = child.data;
          var from = child === range.startContainer ? range.startOffset : 0;
          var to = child === range.endContainer ? range.endOffset : data.length;
          var piece = data.slice(from, to);
          out += pre ? piece : piece.replace(/[ \t\n\r\f]+/g, " ");
          continue;
        }
        if (child.nodeType !== 1 || /^(script|style|link|template|noscript)$/i.test(child.localName || "")) {
          continue;
        }
        var computed = style(child);
        var display = computed ? computed.display : "inline";
        if (display === "none") {
          continue;
        }
        var block = !/^inline/.test(display) && display !== "contents";
        if (block) {
          newline();
        }
        var pick = pickOf(picks, child);
        if (pick) {
          out += pick.text;
        } else if (child.shadowRoot && containsNode(range, child)) {
          var inner = doc.createRange();
          inner.setStart(child.shadowRoot, 0);
          inner.setEnd(child.shadowRoot, child.shadowRoot.childNodes.length);
          out += treeRangeText(doc, inner, picks.concat(Array.prototype.slice.call(child.shadowRoot.querySelectorAll("*")).filter(function (each) {
            return STATE.has(each);
          }).map(wholeSelection).filter(Boolean)));
        } else if (!STATE.has(child)) {
          walk(child, pre || (computed ? /^pre/.test(computed.whiteSpace) : false));
        }
        if (block) {
          newline();
        }
      }
    })(top.nodeType === 3 ? top.parentNode : top, false);
    return nfc(out.replace(/^[ \n]+|[ \n]+$/g, ""));
  }

  /* 범위 한 조각의 브라우저 직렬화 — 그 조각 안의 바탕 요소 원문을 NFC로 */
  function partCopyText(selection, part, own, saved) {
    if (part.collapsed) {
      return "";
    }
    var inside = own.filter(function (pick) {
      return part.intersectsNode(pick.host);
    });
    return fixMirrorPieces(selection, part, nativeText(selection, part, saved), inside, saved);
  }

  /* 조각을 잇는다 — 그림자 호스트가 블록이면 앞뒤 글과 빈 줄로(브라우저 자체 복사처럼 문단 사이) */
  function joinCopyPieces(pieces, shadows) {
    var view = shadows[0] && shadows[0].ownerDocument ? shadows[0].ownerDocument.defaultView : null;
    var text = pieces[0];
    shadows.forEach(function (shadowHost, index) {
      var display = view && typeof view.getComputedStyle === "function" ? view.getComputedStyle(shadowHost).display : "block";
      var block = !/^inline/.test(display) && display !== "contents";
      [pieces[1 + index * 2], pieces[2 + index * 2]].forEach(function (next) {
        /* 호스트 앞뒤의 공백뿐인 조각(문서 끝의 줄바꿈·들여쓰기 글 노드)은 브라우저 자체 복사처럼 버린다 */
        if (!next || !/\S/.test(next)) {
          return;
        }
        if (block && text && !/\n\n$/.test(text)) {
          text = text.replace(/\n?$/, "\n\n");
        }
        text += block ? next.replace(/^\n+/, "") : next;
      });
    });
    return text;
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
    var info = {
      font: state.options.font,
      id: meta.id || null,
      contract: meta.contract,
      material: meta.material,
      face: meta.face || null,
      faceStatus: meta.faceStatus || null,
      design: meta.designRevision ? meta.design : null,
      designStatus: meta.designStatus || null,
      jamoSetStatus: jamoSetStatus(state.options) || null,
      layout: meta.layout ? fontInfoLayout(meta) : null,
      layoutStatus: meta.layoutStatus || null,
      loaded: Boolean(meta.id) && foldFontName(meta.id) === state.options.font && coreApplies(host)
    };
    /* 짓는 방식(ADR-034): 고른 것이 있을 때만 — 고르지 않은 바탕 요소의 fontInfo는 그대로다 */
    if (meta.composition || meta.compositionStatus) {
      info.composition = { preset: meta.composition || null, vowel: state.options.depthOptions.vowel, coda: state.options.depthOptions.coda,
        pieces: meta.compositionPieces || "none", status: host.dataset && host.dataset.fyCompositionStatus || null };
    }
    var glyphs = GLYPH_RESULTS.get(host);
    if (glyphs) { info.glyphMapping = {mapped: glyphs.mapped, diagnostics: glyphs.diagnostics.map(function (entry) { return Object.assign({}, entry); })}; }
    return info;
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

  /* 확장 CSS(꾸밈·움직임) — 문서에 있으면(한 줄 설치의 data-addons나 페이지 링크) 그림자 트리에도 같은 것을 넣는다 */
  var ADDON_CSS_FILE = /\/(font-kku-(?:looks|motion))(?:\.min)?\.css(?:[?#].*)?$/;

  function addonCssName(link) {
    var match = ADDON_CSS_FILE.exec(link.href || "");
    return match ? match[1] : null;
  }

  /* 문서의 확장 CSS 가운데 그 그림자 트리에 없는 것을 트리 끝에 넣는다 — 코어 CSS(트리 맨 앞)보다 뒤라 레이어 차례(꾸밈·움직임이
   * 글꼴·코어 뒤)가 문서와 같다. 문서 stylesheet는 그림자 트리에 닿지 않아 꾸밈 클래스와 animate가 듣지 않았다(records-10) */
  function ensureAddonCss(root) {
    if (typeof document === "undefined" || typeof document.querySelectorAll !== "function" || typeof root.querySelectorAll !== "function") {
      return;
    }
    var have = Array.prototype.map.call(root.querySelectorAll('link[rel~="stylesheet"]'), addonCssName);
    Array.prototype.forEach.call(document.querySelectorAll('link[rel~="stylesheet"]'), function (link) {
      var name = addonCssName(link);
      if (name && have.indexOf(name) === -1) {
        have.push(name);
        loadStylesheet(link.href, root, false).then(null, function (error) {
          if (typeof console !== "undefined" && console.warn) {
            console.warn(error.message);
          }
        });
      }
    });
  }

  /* 바탕 요소가 그림자 트리 안이고 그 트리에 코어 CSS가 없으면 그 트리 맨 앞에 코어 CSS 링크를 한 번 넣는다(그 트리의 페이지
   * CSS가 뒤에 와서 이긴다). 문서의 확장 CSS도 넣는다. 다른 문서(iframe)에는 넣지 않는다 — 문서마다 제 스크립트 태그로 런타임과
   * CSS를 싣는다. 넣을 수 없으면 root마다 한 번 알린다. 그 root의 첫 그리기 뒤(autoload) 한 번만 본다 — 문서에 붙지 않은 바탕
   * 요소는 스타일을 읽을 수 없어 붙은 뒤(연결·다시 그리기) 본다. 떨어진 채 먼저 기억하면 그 root를 다시 보지 않아 붙인 뒤에도
   * 코어 CSS가 없었다(records-11) */
  function ensureCoreCss(host) {
    var root = rootFor(host);
    if (!root || CORE_CHECKED.has(root) || (typeof document !== "undefined" && root === document)) {
      return;
    }
    if (host.isConnected === false) {
      return;
    }
    CORE_CHECKED.add(root);
    if (root.nodeType === 11) {
      ensureAddonCss(root);
    }
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
    var since = RESTYLE_SERIAL;
    entry.promise = new Promise(function (resolve, reject) {
      function cleanup() {
        link.removeEventListener("load", onLoad);
        link.removeEventListener("error", onError);
      }
      function onLoad() {
        cleanup();
        /* 시트가 적용된 뒤 load 사건 앞에 자동 다시 맞춤이 돌았으면 refreshAll은 빈 목록이다 — 요청 뒤 바뀐 요소를 모두 돌려준다 */
        refreshAll(root);
        resolve(collectHosts(root).filter(function (host) { return (HOST_CHANGED_AT.get(host) || 0) > since; }));
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

  var GLYPH_SEEDS = new WeakMap();

  function jamoSeedValue(jamo, role, index, salt, seed, hash) {
    return hash(jamo + "|" + role + "|" + index + "|" + salt + (seed ? "|" + seed : ""));
  }

  function prepareJamoSeeds(root, options, seed) {
    var opts = options || {};
    var hash = typeof opts.hash === "function" ? opts.hash : hashSeed;
    var salt = opts.salt == null ? "" : String(opts.salt);
    Array.prototype.forEach.call(root.querySelectorAll("[data-jamo]"), function (node, index) {
      var value = jamoSeedValue(node.dataset.jamo, node.dataset.jamoRole || "", index, salt, seed, hash);
      GLYPH_SEEDS.set(node, value);
      node.style.setProperty(opts.property || "--fy-jamo-seed", String(value));
    });
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
      var value = jamoSeedValue(node.dataset.jamo, node.dataset.jamoRole || "", index, saltRaw, seed, hashFn);
      GLYPH_SEEDS.set(node, value);
      node.style.setProperty(property, String(value));
    });
    var hosts = [];
    Array.prototype.forEach.call(nodes, function (node) {
      var host = typeof node.closest === "function" ? node.closest('[data-fy-upgraded="true"]') : null;
      if (host && hosts.indexOf(host) < 0) { hosts.push(host); }
    });
    hosts.forEach(applyGlyphMappings);
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
    var cellParts = Object.create(null);
    var count = 0;
    var cellBox = function (value) {
      var out = Array.isArray(value) && value.length === 4 ? value.map(Number) : null;
      return out && out.every(function (n) { return isFinite(n); }) && out[2] > out[0] && out[3] > out[1] ? out : null;
    };
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
      /* 칸 계약 세트는 칸마다 그림 범위를 따로 밝힐 수 있다: { box: [x0, y0, x1, y1], shapes: [...] }. 병서 칸(ㄲ·ㄸ·ㅃ·ㅆ·ㅉ)은
       * 낱자마다 획 중심선 범위 parts: [[x0, y0, x1, y1], [...]]도 — 런타임이 두 낱자를 따로 옮겨 낱자 틈을 연다 */
      if (frame === "box" && value && !Array.isArray(value) && Array.isArray(value.shapes)) {
        var own = cellBox(value.box);
        if (!own) {
          throw new TypeError("font-kku: box jamo cell " + key + " box is [x0, y0, x1, y1] with x1 > x0 and y1 > y0");
        }
        cellBoxes[key] = own;
        if (value.parts !== undefined && value.parts !== null) {
          var parts = Array.isArray(value.parts) && value.parts.length === 2 ? value.parts.map(cellBox) : null;
          if (!parts || !parts[0] || !parts[1]) {
            throw new TypeError("font-kku: box jamo cell " + key + " parts is two boxes [[x0, y0, x1, y1], [x0, y0, x1, y1]] with x1 > x0 and y1 > y0");
          }
          cellParts[key] = parts;
        }
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
      cellParts: cellParts,
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

  /* 그림 자소 재료는 자소판 칸 계약(frame sprite) 세트만 벡터로 그린다. 칸 계약(frame box) 세트는 칸 키가 달라 그릴 칸이 없다 —
   * 전에는 벡터로 찍고 자소판으로 그렸다. 쓰지 못한 세트는 jamoSetStatus가 까닭을 남긴다. */
  function vectorSetFor(options) {
    if (!options || !options.jamoSet || !options.fontMeta || options.fontMeta.material !== "sprite") {
      return null;
    }
    var set = JAMO_SETS[options.jamoSet];
    return set && set.frame !== "box" ? set : null;
  }

  /* 걸린 그림 세트(jamo-set)를 이 재료가 쓰지 못한 까닭. 세트는 칸 계약이 재료 계열과 맞을 때만 쓴다 — 그림 자소 재료는 frame
   * sprite 세트를 벡터로, 표준 잉크 상자 글꼴은 frame box 세트를 그림 재료로. 디자인이 걸리면 디자인이 그림을 정하므로 묻지
   * 않고, 아직 등록되지 않은 세트는 등록되는 순간 다시 그리므로 까닭이 없다. 전에는 말없이 무시하거나(기기 글꼴 + sprite 세트)
   * 벡터로 찍고 자소판으로 그렸다(그림 자소 + box 세트) — 엔진 간결화 검토 B5(2026-10-17). */
  function jamoSetStatus(options) {
    var meta = options && options.fontMeta;
    if (!meta || meta.designRevision || !options.jamoSet || !JAMO_SETS[options.jamoSet]) {
      return "";
    }
    return vectorSetFor(options) || boxJamoSet(meta, options.jamoSet) ? "" : "JAMO_SET_FRAME_MISMATCH";
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

  /* Firefox(Gecko) 질감 자소판 칸 문서. Gecko는 CSS 그림으로 쓴 SVG 문서를 통째로 다룬다 — 바탕 그림은 그려지는 기기 크기
   * (바탕 크기 × 조상 transform 배율)마다 문서 전체를 메인 스레드에서 래스터하고, 마스크 그림은 노드마다 문서 전체를 기록한다.
   * 질감 자소판은 칸마다 필터(<g filter>)가 있어 칸 493개를 매번 다 걸러, 크기가 여럿인 페이지나 긴 글이 몇 초–몇십 초 멈췄다.
   * 같은 문서의 #svgView 조각도 주소마다 문서를 따로 만들어 같다. 그래서 Gecko에서만, 필터가 있는 SVG 자소판을 한 번 받아
   * 칸마다 그 칸만 든 작은 SVG(같은 <style>·<defs>, viewBox = 칸)를 Blob 주소로 만들어 노드에 --fy-sprite-cell-image로 준다
   * (칠하는 규칙은 런타임이 만든 스타일시트 — SPRITE_CELL_RULES). 칸은 생성기 규약 <g id="r<행>-…" transform="translate(x y)">로 찾는다. 필터가
   * 없는 .svg 자소판은 받은 글 그대로 Blob 그림 하나로 준다(data-fy-sprite-cell="sheet" — spriteCellSheet). 받지 못하거나
   * (CORS 없는 교차 출처, connect-src, 흔히 file://), 규약이 아니거나, Blob 그림을 싣지 못하면(img-src) 자소판 그대로다 — 이때
   * Firefox 콘솔에 오류가 남는다: CORS는 자소판마다(받기), CSP는 img-src면 문서마다 한 줄(.svg 자소판이 있을 때만),
   * connect-src면 .svg 자소판마다 한 줄(필터는 받아야 안다)이고 보고 주소가 있으면 보고. Blob은 칸을 처음 쓸 때 만든다.
   * 칸 그림은 노드에 박히므로, 칠한 뒤 페이지 CSS가 자소판을 바꾸면 코어 CSS가 원문 거울·칸 노드 ::after에 건 짧은 transition의
   * transitionend로 알아채 다시 칠한다(watchSpriteCells). 그 transition(transition-behavior: allow-discrete, Firefox 129–)이 돌지
   * 않으면 칸을 쓰지 않는다. 인쇄는 칠 규칙(@media not print)이 칸을 끄고 자소판 그대로 그린다(인쇄 매체에서는 transition이 돌지 않는다).
   *
   * Chromium(Blink)도 칸 문서를 쓴다(2026-10-22). Blink는 CSS 그림으로 쓴 SVG를 노드마다 칠할 때 문서 전체를 다시 기록한다 — 칸마다
   * 필터가 있는 dojang은 자모 하나에 5–7ms(필터 없는 pilgi 0.6ms)라, 다시 칠할 일(iframe을 transform으로 줄이기)마다 도장 22자가
   * 한 프레임을 0.2초 멈췄다. 칸 하나만 든 문서는 0.03–0.2ms다. 첫 그리기도 같다 — 자모 노드 3,720개 페이지가 PaintImage 11.5초.
   * Gecko와 다른 셋: (1) 필터가 없는 자소판도 칸으로 나눈다(Blink는 필터 없이도 문서 전체를 기록한다 — 통째 Blob은 Gecko만),
   * (2) 칸 그림을 다 실을 때까지 노드를 비워 둔다(wait — 실리기 전에 칸으로 바꾸면 그 프레임에 글자가 빈다, spriteCellLoad).
   * 싣지 못한 칸은 자소판 그대로, (3) 칠 규칙은 런타임 스타일시트가 아니라 코어 CSS에 있다(SPRITE_CELL_RULES 설명). */
  var SPRITE_CELL_SHEETS = new Map();
  var SPRITE_CELL_WATCHED = new WeakSet();
  var SPRITE_CELL_DIRTY = new Set();
  var SPRITE_CELL_EVENTS = /^--fy-sprite-(?:url|image|cols|rows|row|cells)$/;
  var SPRITE_BLOB_IMAGES = new WeakMap();
  var spriteCellScheduled = false;
  var SPRITE_CELL_ENGINE = null;
  var SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg"';

  /* 칸 문서를 쓰는 엔진 — "gecko"(Firefox), "blink"(Chromium), 아니면 "". 코어 CSS의 감시 transition과 같은 문(-moz-·
   * -webkit-app-region은 그 엔진만 받는다)으로 판정한다 */
  function spriteCellEngine(view) {
    if (SPRITE_CELL_ENGINE === null) {
      try {
        var css = (view && view.CSS) || (typeof CSS !== "undefined" ? CSS : null);
        var able = !!(css && typeof css.supports === "function" &&
          css.supports("transition-behavior", "allow-discrete") &&
          typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" &&
          typeof fetch === "function" && typeof DOMParser === "function" && typeof XMLSerializer === "function");
        SPRITE_CELL_ENGINE = !able ? "" :
          css.supports("-moz-appearance", "none") || css.supports("-moz-orient", "inline") ? "gecko" :
            css.supports("-webkit-app-region", "drag") ? "blink" : "";
      } catch (error) {
        SPRITE_CELL_ENGINE = "";
      }
    }
    return SPRITE_CELL_ENGINE;
  }

  /* Trusted Types(require-trusted-types-for 'script')를 거는 페이지에서 DOMParser는 문자열을 받지 않는다 — 자소판마다 위반
   * 보고와 오류가 남았다. 자소판 글은 그림으로만 쓰는 비활성 문서라 런타임만 쥐는 정책 하나(font-kku)로 넘긴다. 정책을 못
   * 만들면(trusted-types 허용 목록에 이름이 없다 — 문서마다 위반 한 번) 칸을 쓰지 않는다 */
  var SPRITE_POLICY;
  function spriteSvgSource(text) {
    var types = typeof trustedTypes !== "undefined" ? trustedTypes : null;
    if (!types || typeof types.createPolicy !== "function") { return text; }
    if (SPRITE_POLICY === undefined) {
      try {
        SPRITE_POLICY = types.createPolicy("font-kku", { createHTML: function (value) { return value; } });
      } catch (error) {
        SPRITE_POLICY = null;
      }
    }
    return SPRITE_POLICY ? SPRITE_POLICY.createHTML(text) : null;
  }

  /* gecko는 필터가 있는 자소판만 칸으로 나누고(필터 없는 것은 whole — 통째 Blob), blink는 모두 나눈다 */
  function splitSpriteSheet(text, cols, rows, engine) {
    var source = spriteSvgSource(text);
    if (source === null) { return null; }
    var doc = new DOMParser().parseFromString(source, "image/svg+xml");
    var svg = doc.documentElement;
    if (!svg || svg.localName !== "svg") { return null; }
    if (engine === "gecko" && !svg.getElementsByTagName("filter").length) { return { head: "", cells: {}, whole: true }; }
    var box = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
    if (box.length !== 4 || box.some(isNaN) || !(box[2] > 0) || !(box[3] > 0)) { return null; }
    /* 칸 문서의 뿌리는 크기·viewBox만 새로 쓴다 — 뿌리 <svg>에 칠(fill·stroke·style·class…)을 둔 자소판은 칸만 떼면 칠을 잃는다.
     * 자소판 그대로. preserveAspectRatio는 옮긴다. */
    var fit = "";
    for (var a = 0; a < svg.attributes.length; a += 1) {
      var attr = svg.attributes[a];
      if (attr.name === "preserveAspectRatio") {
        fit = ' preserveAspectRatio="' + attr.value.replace(/[&"<]/g, "") + '"';
      } else if (!/^(?:xmlns(?::.*)?|width|height|viewBox|x|y|version|baseProfile)$/.test(attr.name)) {
        return null;
      }
    }
    var cw = box[2] / cols;
    var ch = box[3] / rows;
    var width = (parseFloat(svg.getAttribute("width")) || box[2]) / cols;
    var height = (parseFloat(svg.getAttribute("height")) || box[3]) / rows;
    var serializer = new XMLSerializer();
    var groups = Array.prototype.filter.call(svg.querySelectorAll("g[id]"), function (group) {
      return /^r\d+-/.test(group.getAttribute("id"));
    });
    /* 칸을 담은 바깥 그룹이 속성(transform·filter·clip-path…)을 가지거나 칸이 아닌 그림을 함께 담으면 칸만 떼어 그릴 수
     * 없다 — 자소판 그대로 */
    var holders = [];
    for (var g = 0; g < groups.length; g += 1) {
      for (var up = groups[g].parentNode; up && up !== svg; up = up.parentNode) {
        if (up.localName !== "g" || up.attributes.length) { return null; }
        if (holders.indexOf(up) < 0) { holders.push(up); }
      }
    }
    for (var h = 0; h < holders.length; h += 1) {
      for (var kid = holders[h].firstElementChild; kid; kid = kid.nextElementSibling) {
        if (groups.indexOf(kid) < 0 && holders.indexOf(kid) < 0) { return null; }
      }
    }
    /* 칸이 아닌 맨 위 요소(<style>·<defs>·그 밖의 공유 요소)는 칸 문서마다 그대로 싣는다 — 자소판 전체에 깔린 것도 칸에 그대로 보인다 */
    var head = "";
    Array.prototype.forEach.call(svg.childNodes, function (child) {
      if (child.nodeType !== 1 || groups.some(function (group) { return child === group || child.contains(group); })) { return; }
      var source = serializer.serializeToString(child);
      if (child.localName === "style") {
        /* 그림 안 미디어 질의는 그림이 그려지는 크기로 판정한다 — 칸 문서는 칸 하나라 너비 조건을 칸 수로 나눈다. 칸 크기
         * 사각형(.kku-small)은 Gecko가 가는 필터 그룹 결과를 버리지 않게 하는 것인데, 자소판 전체를 래스터할 때 큰 글자 첫
         * 그리기를 2–3배로 늘려 작은 칸에서만 켰다(xbrowser-13). 칸 문서는 칸 하나만 거르므로 Gecko에서는 늘 켠다 — transform으로
         * 줄인 글자도 기둥이 빠지지 않는다(xbrowser-16). 다른 엔진에서는 자소판처럼 끈 채 둔다 */
        source = source.replace(/(min|max)-width\s*:\s*([\d.]+)px/g, function (all, edge, px) {
          return edge + "-width:" + (parseFloat(px) / cols) + "px";
        });
        if (engine === "gecko") { source = source.replace(/<\/style>$/, ".kku-small{display:inline}</style>"); }
      }
      head += source;
    });
    var shared = {};
    (head.match(/\sid="[^"]+"/g) || []).forEach(function (attr) { shared[attr.slice(5, -1)] = true; });
    var cells = {};
    var found = 0;
    for (var i = 0; i < groups.length; i += 1) {
      var move = /^\s*translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)\s*$/.exec(groups[i].getAttribute("transform") || "");
      if (!move) { continue; }
      var col = Math.round((parseFloat(move[1]) - box[0]) / cw);
      var row = Math.round((parseFloat(move[2]) - box[1]) / ch);
      if (col < 0 || col >= cols || row < 0 || row >= rows) { continue; }
      var body = serializer.serializeToString(groups[i]);
      var own = {};
      (body.match(/\sid="[^"]+"/g) || []).forEach(function (attr) { own[attr.slice(5, -1)] = true; });
      /* 칸이 다른 칸 안의 요소를 가리키면(url(#…)·href="#…") 칸만 떼면 빈다 — 자소판 그대로 */
      var refs = body.match(/(?:url\(\s*["']?#|href="#)[^"')\s]+/g) || [];
      for (var r = 0; r < refs.length; r += 1) {
        var ref = refs[r].replace(/^(?:url\(\s*["']?#|href="#)/, "");
        if (!shared[ref] && !own[ref]) { return null; }
      }
      /* 공유 머리(head)는 한 벌만 두고 Blob을 만들 때 잇는다 — 칸마다 붙여 두면 자소판 하나에 수 MB다 */
      cells[row + ":" + col] = [' width="' + width + '" height="' + height + '" viewBox="' + (box[0] + col * cw) + " " +
        (box[1] + row * ch) + " " + cw + " " + ch + '"' + fit + '>', body];
      found += 1;
    }
    return found ? { head: head, cells: cells } : null;
  }

  function spriteCellUrl(entry, key) {
    var cell = entry.split && entry.split.cells[key];
    if (!cell) { return null; }
    if (!entry.urls[key]) {
      entry.urls[key] = URL.createObjectURL(new Blob([SVG_OPEN, cell[0], entry.split.head, cell[1], "</svg>"], { type: "image/svg+xml" }));
    }
    return entry.urls[key];
  }

  /* 경로가 .svg인 자소판만 나누는 동안 비워 둔다(wait). 래스터 그림(.png 등)은 받지 않는다. 그 밖(blob:, 확장자 없음 —
   * 작업실이 고친 PNG 자소판 등)은 받아 보되 그동안 자소판 그대로 그린다(편집할 때마다 글자가 깜빡이지 않게). */
  function spriteSheetKind(url) {
    var path = String(url).replace(/[?#][\s\S]*$/, "");
    if (/\.svgz?$/i.test(path)) { return "svg"; }
    return /\.(png|apng|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path) ? "" : "unknown";
  }

  /* 이 창의 문서가 Blob 그림을 싣는가(CSP img-src) — 창마다 한 번 아주 작은 SVG로 본다 */
  function spriteBlobImages(view) {
    var key = view || window;
    if (!SPRITE_BLOB_IMAGES.has(key)) {
      var url = URL.createObjectURL(new Blob([SVG_OPEN + ' width="1" height="1"/>'], { type: "image/svg+xml" }));
      var image = new ((view && view.Image) || Image)();
      image.src = url;
      SPRITE_BLOB_IMAGES.set(key, Promise.resolve(typeof image.decode === "function" ? image.decode() : null).then(function () {
        return true;
      }, function () {
        return false;
      }).then(function (ok) {
        URL.revokeObjectURL(url);
        return ok;
      }));
    }
    return SPRITE_BLOB_IMAGES.get(key);
  }

  function spriteCellSheet(url, cols, rows, view) {
    var key = url + "|" + cols + "|" + rows;
    if (SPRITE_CELL_SHEETS.has(key)) { return SPRITE_CELL_SHEETS.get(key); }
    var engine = spriteCellEngine(view);
    /* Chromium은 file 주소를 fetch로 받지 않고 콘솔 오류를 남긴다 — file://로 연 페이지의 자소판은 칸 문서 없이 그대로 칠한다.
     * Firefox는 설정에 따라 받는다(Playwright Firefox는 받는다) */
    var kind = engine === "blink" && /^file:/i.test(String(url)) ? null : spriteSheetKind(url);
    var entry = kind ? {
      state: "loading", engine: engine, wait: kind === "svg", split: null, urls: {}, loads: {}, hosts: new Set(), whole: null
    } : null;
    SPRITE_CELL_SHEETS.set(key, entry);
    if (!entry) { return null; }
    fetch(url).then(function (response) {
      var type = (response.headers && response.headers.get("content-type")) || "";
      if (!response.ok || (type && !/svg/i.test(type))) { throw new Error("sprite sheet " + response.status + " " + type); }
      return response.text();
    }).then(function (text) {
      entry.split = splitSpriteSheet(text, cols, rows, entry.engine);
      var first = entry.split && Object.keys(entry.split.cells)[0];
      /* 필터 없는 .svg 자소판(pilgi 등)은 받은 글 그대로 Blob 그림 하나로 칠한다(data-fy-sprite-cell="sheet", 자리·크기는 자소판
       * 그대로). 자소판 주소로 되돌리면 비우는 동안 거둔 CSS 그림을 다시 청해 no-cache 서버·CORS CDN 첫 방문에서 한 왕복 늦고, 그
       * 주소의 그림을 미리 실어 두면 Gecko가 다 받은 그림을 처음 마스크로 칠할 때 자소판 전체를 두 프레임 잇달아 기록해 큰 페이지가
       * 그만큼 더 멈췄다. 새 Blob 그림은 칠한 뒤에 다 실려 한 번 그린다. 문서 밖을 가리키는 자소판(href·url())은 Blob에서 길을 잃어
       * 자소판 그대로 */
      var whole = !first && entry.wait && entry.split && entry.split.whole && !/(?:href\s*=\s*["'](?!#|data:)|url\(\s*(?!["']?\s*(?:#|data:)))/i.test(text);
      if (!first && !whole) { throw new Error("sprite sheet has no cells"); }
      /* 페이지 CSP(img-src)가 blob:을 막으면 칸 그림이 빈칸이 된다 — 창마다 한 번 보고(.svg 자소판을 받았을 때만), 한 칸을
       * 실제로 실어 보고 쓴다. 통째 그림은 미리 싣지 않는다(위) */
      return spriteBlobImages(view).then(function (ok) {
        if (!ok) { throw new Error("blob images blocked"); }
        if (whole) {
          entry.whole = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
          return null;
        }
        var image = new ((view && view.Image) || Image)();
        image.src = spriteCellUrl(entry, first);
        return typeof image.decode === "function" ? image.decode() : null;
      });
    }).then(function () {
      entry.state = entry.whole ? "sheet" : "ready";
    }, function () {
      entry.state = "none";
      entry.split = null;
      if (entry.whole) { URL.revokeObjectURL(entry.whole); }
      entry.whole = null;
      Object.keys(entry.urls).forEach(function (cell) { URL.revokeObjectURL(entry.urls[cell]); });
      entry.urls = {};
    }).then(function () {
      var hosts = Array.from(entry.hosts);
      entry.hosts.clear();
      /* 비워 두었던(wait) 노드가 칸이나 자소판을 받았다 — 렌더 알림(font-kku:render)을 다시 내 잰 쪽이 새 그림을 보게 한다 */
      paintSpriteCells(hosts).forEach(function (host) { dispatchRender(host, "restyle"); });
    });
    return entry;
  }

  /* 코어 CSS가 Gecko에서 원문 거울(바탕 요소의 직계 [part="sr-source"])에 자소판 변수의 짧은 transition을, 칸 노드의 ::after에
   * 자소판·행 변수의 transition을 건다(노드 자신의 transition은 페이지·fx·움직임 줄이기 몫으로 둔다). 바탕 요소마다 한 번
   * transitionend를 붙잡아(캡처 — 다른 문서로 옮겨져도 따라간다) 그 칸을 다음 프레임에 다시 맞춘다. 거울 사건(자소판·칸 수,
   * 처음 그려질 때)도 노드까지 다시 본다 — 조상이 display: none인 동안에는 노드 ::after도 transition이 돌지 않아, 그동안
   * 노드에 건 자소판·행 바꿈은 보일 때 거울의 @starting-style로만 알 수 있다. 이 transition 사건은 런타임 몫이라 페이지로
   * 올려 보내지 않는다(조상에서 transitionend를 듣는 페이지 처리기가 제 transition보다 먼저 불렸다). */
  function watchSpriteCells(host) {
    if (typeof host.addEventListener !== "function" || SPRITE_CELL_WATCHED.has(host)) { return; }
    SPRITE_CELL_WATCHED.add(host);
    host.addEventListener("transitionend", spriteCellTransition, true);
    ["transitionrun", "transitionstart", "transitioncancel"].forEach(function (type) {
      host.addEventListener(type, spriteCellQuiet, true);
    });
  }

  /* font-kku보다 먼저 밝힌 페이지 층의 !important 재설정은 코어 CSS의 감시 transition을 이긴다 — 움직임 줄이기 설정이 칠한 뒤
   * 켜지면 감시가 꺼진 채 칸이 남아 그 뒤 자소판 바꿈을 놓쳤다. 설정이 바뀌면 그 창의 바탕 요소를 다시 칠한다(감시가 꺼졌으면
   * 칸을 거두고 자소판 그대로). 창마다 한 번, 바탕 요소는 약하게 쥔 REGISTRY에서 찾는다. 클래스로 거는 재설정은 알 수 없다 */
  var SPRITE_CELL_MOTION = new WeakSet();

  function watchSpriteMotion(view) {
    if (!view || typeof view.matchMedia !== "function" || SPRITE_CELL_MOTION.has(view)) { return; }
    SPRITE_CELL_MOTION.add(view);
    try {
      view.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", function () {
        var hosts = [];
        forEachRegistered(function (each) {
          if (each.isConnected && each.ownerDocument && each.ownerDocument.defaultView === view) { hosts.push(each); }
        });
        paintSpriteCells(hosts).forEach(function (each) { dispatchRender(each, "restyle"); });
      });
    } catch (error) {
      /* matchMedia 사건 없음 */
    }
  }

  /* 바탕 요소(사건을 듣는 곳)의 원문 거울이 낸 사건이면 1, 관리 root 안 자모 노드(::after)가 낸 사건이면 2, 아니면 0 */
  function spriteCellEvent(event) {
    var host = event.currentTarget;
    var target = event.target;
    if (!SPRITE_CELL_EVENTS.test(event.propertyName || "") || !target || target === host || !STATE.has(host)) { return 0; }
    if (target === getSrSourceNode(host)) { return 1; }
    var root = getManagedRoot(host);
    return root && root.contains(target) ? 2 : 0;
  }

  function spriteCellQuiet(event) {
    if (spriteCellEvent(event)) { event.stopPropagation(); }
  }

  function spriteCellTransition(event) {
    var kind = spriteCellEvent(event);
    if (!kind) { return; }
    event.stopPropagation();
    scheduleSpriteCells(event.currentTarget);
  }

  /* 바탕 요소의 칸을 다음 프레임에 다시 맞춘다(여럿을 한 번에) */
  function scheduleSpriteCells(host) {
    SPRITE_CELL_DIRTY.add(host);
    if (spriteCellScheduled) { return; }
    spriteCellScheduled = true;
    var run = function () {
      spriteCellScheduled = false;
      var hosts = [];
      SPRITE_CELL_DIRTY.forEach(function (each) {
        if (each.isConnected) { hosts.push(each); }
      });
      SPRITE_CELL_DIRTY.clear();
      paintSpriteCells(hosts).forEach(function (each) { dispatchRender(each, "restyle"); });
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  /* Blink: 칸 그림을 실었는가 — "ready"·"loading"·"none"(싣지 못함). 처음 물으면 싣기 시작하고, 다 실리면 기다린 바탕 요소를
   * 다시 칠한다. 실은 Image를 쥐고 있어 CSS가 같은 주소를 곧바로 그린다. 마스크 칠은 CSS가 CORS로 청하므로 같은 방식으로
   * 싣는다(방식이 다르면 다시 받는다) */
  function spriteCellLoad(entry, url, cors, host, view) {
    var key = (cors ? "cors " : "") + url;
    var load = entry.loads[key];
    if (!load) {
      var image = new ((view && view.Image) || Image)();
      if (cors) { image.crossOrigin = "anonymous"; }
      image.src = url;
      load = entry.loads[key] = { state: "loading", image: image, hosts: new Set() };
      Promise.resolve(typeof image.decode === "function" ? image.decode() : null).then(function () {
        load.state = "ready";
      }, function () {
        load.state = "none";
      }).then(function () {
        load.hosts.forEach(function (each) {
          if (each.isConnected) { scheduleSpriteCells(each); }
        });
        load.hosts.clear();
      });
    }
    if (load.state === "loading") { load.hosts.add(host); }
    return load.state;
  }

  /* 원문 거울·칸 노드 ::after의 --fy-sprite-url transition이 실제로 도는가 — 페이지가 덮거나, 이름만 남기고 시간을 0으로 덮거나
   * (층 안 !important 재설정), 숨기면(display: none) 바꿈을 알 수 없다. 목록 값은 이름 수만큼 되풀이된다 */
  function spriteWatched(style) {
    var names = String(style.transitionProperty || "").split(",").map(function (name) { return name.trim(); });
    var at = names.indexOf("--fy-sprite-url");
    if (at < 0 || style.display === "none") { return false; }
    var pick = function (value) {
      var list = String(value || "").split(",");
      return String(list[at % list.length] || "").trim();
    };
    var seconds = function (value) {
      var number = parseFloat(value);
      return isNaN(number) ? 0 : /ms$/.test(value) ? number / 1000 : number;
    };
    return Math.max(seconds(pick(style.transitionDuration)), 0) + seconds(pick(style.transitionDelay)) > 0 &&
      pick(style.transitionBehavior) === "allow-discrete";
  }

  /* 칸 그림(Blob)을 칠하는 규칙은 코어 CSS가 아니라 런타임이 만든 스타일시트(CSSStyleSheet)에 둔다 — Gecko는
   * var(--fy-sprite-cell-image)의 그림을 그 var()를 쓴 스타일시트의 출처로 싣는다. 코어 CSS가 다른 출처(README의 jsDelivr
   * 설치)거나 문서 출처가 불투명하면(sandbox iframe) 이 문서가 만든 blob:을 싣지 못해 글자가 비었다. 만든 스타일시트는
   * 문서 출처라 싣는다. 문서마다 하나를 런타임이 시작할 때 문서에, 칸을 칠할 때 바탕 요소의 트리(그림자 루트)에 붙인다
   * (adoptedStyleSheets — 첫 칠 때 문서에 붙이면 이미 계산한 페이지 스타일을 다시 셌다). 이 스타일시트가 없는 트리의 칸 노드는
   * 코어 CSS가 비워 둔다(자소판 전체를 그리면 몇 초 멈춘다). 원문 거울의 --fy-sprite-cells 1도 여기서 주어, 페이지가
   * adoptedStyleSheets를 바꿔 떼거나 바탕 요소가 다른 트리로 옮겨지면 거울 transition(코어 CSS 0)이 다시 칠하고 다시 붙이게
   * 한다. 인쇄는 자소판 그대로(인쇄 매체에서는 감시 transition이 돌지 않는다). Blink는 이 스타일시트를 쓰지 않는다 — var()의 그림을
   * 문서 출처로 실어 코어 CSS(같은 값, Blink 문)가 칠한다. */
  var SPRITE_CELL_RULES = (function () {
    var size = "calc(var(--fy-sprite-cell, 1em) * var(--fy-optical-sprite-zoom, var(--fy-sprite-zoom, 1)))";
    var crop = "var(--fy-optical-sprite-crop-x, var(--fy-sprite-crop-x, 0em)) var(--fy-optical-sprite-crop-y, var(--fy-sprite-crop-y, 0em))";
    var nodes = function (paint, mark) {
      return ["consonant", "vowel", "coda-cluster"].map(function (kind) {
        return ':where(font-kku, .font-kku):is([data-fy-material="sprite"], [data-fy-material="vector"])' + paint +
          '[data-fy-sprite-kinds~="' + kind + '"] [data-sprite-jamo-kind="' + kind + '"]' + mark + ':not([data-fy-vector-cell])';
      }).join(", ");
    };
    var background = ':not([data-fy-sprite-paint="mask"])';
    var mask = '[data-fy-sprite-paint="mask"]';
    var cell = '[data-fy-sprite-cell]:not([data-fy-sprite-cell="sheet"])';
    return ':where(font-kku, .font-kku)[data-fy-material="sprite"][data-fy-upgraded="true"] > [part="sr-source"] { --fy-sprite-cells: 1; } ' +
      "@media not print { " +
      nodes(background, cell) + " { background-image: var(--fy-sprite-cell-image); background-size: " +
      size + " " + size + "; background-position: " + crop + "; } " +
      nodes(mask, cell) + " { mask-image: var(--fy-sprite-cell-image); mask-size: " + size + " " + size + "; mask-position: " + crop + "; } " +
      nodes(background, '[data-fy-sprite-cell="sheet"]') + " { background-image: var(--fy-sprite-cell-image); } " +
      nodes(mask, '[data-fy-sprite-cell="sheet"]') + " { mask-image: var(--fy-sprite-cell-image); } }";
  }());
  var SPRITE_CELL_STYLES = new WeakMap();

  /* pending이 있으면 붙일 트리만 모은다 — 읽는 동안 붙이면 그 트리 스타일이 무효가 되어 다음 바탕 요소를 읽을 때 스타일을
   * 다시 센다(그림자 루트 200개면 200번) */
  function spriteCellStyles(host, pending) {
    var doc = host.ownerDocument;
    var view = doc && doc.defaultView;
    var root = typeof host.getRootNode === "function" ? host.getRootNode() : doc;
    if (!view || !root || typeof view.CSSStyleSheet !== "function" || !root.adoptedStyleSheets ||
      typeof root.adoptedStyleSheets.indexOf !== "function") { return false; }
    try {
      var sheet = SPRITE_CELL_STYLES.get(doc);
      if (!sheet) {
        sheet = new view.CSSStyleSheet();
        sheet.replaceSync(SPRITE_CELL_RULES);
        SPRITE_CELL_STYLES.set(doc, sheet);
      }
      if (root.adoptedStyleSheets.indexOf(sheet) < 0) {
        if (pending) { pending.set(root, sheet); } else { root.adoptedStyleSheets = root.adoptedStyleSheets.concat([sheet]); }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /* 칸을 바꾼(붙이거나 비우거나 뗀) 바탕 요소를 돌려준다 */
  function paintSpriteCells(hosts) {
    var work = [];
    var adopt = new Map();
    hosts.forEach(function (host) {
      var state = STATE.get(host);
      var view = host.ownerDocument && host.ownerDocument.defaultView;
      if (!state || !host.isConnected || !state.options.fontMeta || state.options.fontMeta.material !== "sprite" ||
        !spriteCellEngine(view)) { return; }
      var root = getManagedRoot(host);
      if (!root || typeof root.querySelectorAll !== "function") { return; }
      var style = computedStyleFor(host);
      watchSpriteCells(host);
      watchSpriteMotion(view);
      var sheet = String(style.getPropertyValue("--fy-sprite-url") || "").trim();
      /* 절대 주소만 받는다 — @property가 등록되기 전(코어 CSS보다 글꼴 CSS가 먼저 온 자동 불러오기)에는 계산값이 글꼴 CSS의 상대
       * 주소 그대로라 페이지 기준으로 잘못 받는다. 코어 CSS가 오면 다시 칠한다(스타일시트 load). */
      var match = /^url\(\s*["']?([a-z][a-z\d+.-]*:[^"')]+)["']?\s*\)$/i.exec(sheet);
      var cols = parseInt(readIdent(style, "--fy-sprite-cols"), 10);
      var rows = parseInt(readIdent(style, "--fy-sprite-rows"), 10);
      /* 바꿈을 알릴 transition이 원문 거울이나 칸 노드 ::after에서 돌지 않으면(페이지가 덮음, 옛 코어 CSS) 칸을 쓰지 않는다 —
       * 자소판 그대로 따라간다. 노드는 첫 노드로 본다 */
      var mirror = getSrSourceNode(host);
      var nodes = root.querySelectorAll("[data-sprite-jamo-kind]");
      var watched = mirror && spriteWatched(computedStyleFor(mirror)) &&
        (!nodes.length || spriteWatched((view || window).getComputedStyle(nodes[0], "::after")));
      var entry = watched && match && !readIdent(style, "--fy-sprite-image") && cols > 0 && rows > 0 && !/^data:/i.test(match[1]) ?
        spriteCellSheet(match[1], cols, rows, view) : null;
      /* 칠 규칙은 칸(Blob)을 칠할 트리에만 붙인다 — 나누는 동안(wait)은 붙이지 않는다. Blink는 코어 CSS가 칠한다(var()의 그림을
       * 문서 출처로 싣는다 — 스타일시트를 붙이지 않으니 페이지가 adoptedStyleSheets를 바꿔도 칸이 그대로다) */
      if (entry && entry.engine === "gecko" && (entry.state === "ready" || entry.state === "sheet") && !spriteCellStyles(host, adopt)) { entry = null; }
      if (entry && entry.state === "loading") { entry.hosts.add(host); }
      var mask = host.getAttribute("data-fy-sprite-paint") === "mask";
      for (var i = 0; i < nodes.length; i += 1) {
        work.push({ host: host, view: view, mask: mask, node: nodes[i], sheet: sheet, entry: entry && entry.state !== "none" ? entry : null });
      }
    });
    var refused = [];
    adopt.forEach(function (sheet, root) {
      try {
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat([sheet]);
      } catch (error) {
        refused.push(root);
      }
    });
    /* 읽기를 모은 뒤 쓴다(스타일 계산 한 번). 노드에서 자소판을 바꾼 페이지 CSS(--fy-sprite-url·--fy-sprite-image)는 그대로 둔다 */
    work.forEach(function (item) {
      if (item.entry && refused.length && refused.indexOf(item.host.getRootNode()) >= 0) { item.entry = null; }
      if (!item.entry) { return; }
      var style = computedStyleFor(item.node);
      if (String(style.getPropertyValue("--fy-sprite-url") || "").trim() !== item.sheet || readIdent(style, "--fy-sprite-image")) {
        item.entry = null;
        return;
      }
      var row = parseInt(style.getPropertyValue("--fy-sprite-row"), 10);
      item.row = isNaN(row) ? 0 : row;
    });
    var changed = [];
    work.forEach(function (item) {
      var index = parseInt(item.node.dataset.spriteJamoIndex, 10);
      var whole = item.entry && item.entry.state === "sheet";
      var cell = whole ? item.entry.whole :
        item.entry && item.entry.state === "ready" && !isNaN(index) ? spriteCellUrl(item.entry, item.row + ":" + index) : null;
      /* Blink는 칸 그림이 다 실린 뒤에 바꾼다 — 그때까지 비워 두고(wait), 싣지 못하면 자소판 그대로 */
      var load = cell && !whole && item.entry.engine === "blink" ? spriteCellLoad(item.entry, cell, item.mask, item.host, item.view) : "ready";
      if (load !== "ready") { cell = null; }
      var image = item.node.style.getPropertyValue("--fy-sprite-cell-image");
      var mark = item.node.getAttribute("data-fy-sprite-cell");
      if (cell) {
        if (image !== 'url("' + cell + '")') { item.node.style.setProperty("--fy-sprite-cell-image", 'url("' + cell + '")'); }
        if (mark !== (whole ? "sheet" : "")) { item.node.setAttribute("data-fy-sprite-cell", whole ? "sheet" : ""); }
      } else if (item.entry && item.entry.wait && (item.entry.state === "loading" || load === "loading")) {
        /* 칸 문서를 만드는 동안(받기 + 나누기, 수십 ms — Blink는 칸 그림을 싣는 동안까지) 자소판 전체를 그리지 않게 비워 둔다 —
         * 그리면 Gecko가 그 사이 크기마다 문서 전체를 래스터해 몇 초 멈추고, Blink는 노드마다 문서 전체를 기록한다. 투명 그림이라
         * 마스크 칠도 칠이 새지 않는다. 받지 못하면 아래 갈래가 지운다. */
        item.node.style.setProperty("--fy-sprite-cell-image", "linear-gradient(transparent, transparent)");
        item.node.setAttribute("data-fy-sprite-cell", "wait");
      } else if (mark !== null) {
        item.node.style.removeProperty("--fy-sprite-cell-image");
        item.node.removeAttribute("data-fy-sprite-cell");
      } else {
        return;
      }
      if (item.node.getAttribute("data-fy-sprite-cell") !== mark ||
        item.node.style.getPropertyValue("--fy-sprite-cell-image") !== image) {
        if (changed.indexOf(item.host) < 0) { changed.push(item.host); }
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
    splitFit: splitFit,
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
    /* 짓는 방식(ADR-034): 프리셋 표(모음·받침 나누기 × 조각 깊이)와 조각 깊이 조립식, 차례를 푸는 순수 함수 */
    compositionPresets: deepFreeze(JSON.parse(JSON.stringify({ presets: COMPOSITION_PRESETS, levels: RECIPE_LEVELS }))),
    resolveComposition: resolveComposition,
    traceOf: traceOf,
    stagePreview: stagePreview,
    authoringProgress: authoringProgress,
    jamoSets: jamoSets,
    sourceRange: sourceRange
  };

  global.FontKku = FontKku;
  drainJamoQueue(global);
  /* Firefox 칸 칠 규칙(SPRITE_CELL_RULES)은 첫 렌더 전에 문서에 붙인다 — 첫 칠 때 붙이면 바탕 요소가 많은 페이지의 스타일을
   * 통째로 다시 세어 첫 그리기가 0.5초쯤 더 멈췄다 */
  try {
    if (typeof document !== "undefined" && document.documentElement && spriteCellEngine(global) === "gecko") {
      spriteCellStyles(document.documentElement);
    }
  } catch (error) {
    /* 첫 칠 때 붙인다 */
  }

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

  /* CDN 짧은 주소(`/npm/@tty.link/font-kku@0.1.4-rc.4`, `unpkg.com/@tty.link/font-kku`)는 파일 이름이 없다 —
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
