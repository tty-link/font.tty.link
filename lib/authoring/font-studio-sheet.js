/* font-studio-sheet.js — Font Studio 재료(sprite 시트) 모델 (ADR-009 §3 재료 탭)
 *
 * 캔버스와 무관한 순수 로직: 시트 행 레이아웃과 칸 라벨, 폰트 CSS에서 시트
 * 정보 읽기, 새 sprite 폰트 CSS 템플릿, Sprite Editor v1 프로젝트(ADR-006) 이전.
 * 브라우저(window.FontStudioSheet)와 Node(module.exports) 공용.
 */
(function (global) {
  "use strict";

  var Model = global.FontStudioModel ||
    (typeof require === "function" ? require("./font-studio-model.js") : null);

  /* 런타임 SPRITE_JAMO_TABLES·spec/tables.json과 같은 순서 (tests/font_studio_model.test.js가 대조). */
  var CONSONANTS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  var VOWELS = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
  var CODA_CLUSTERS = ["ㄳ", "ㄵ", "ㄶ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅄ"];
  var KIND_TABLES = { consonant: CONSONANTS, vowel: VOWELS, "coda-cluster": CODA_CLUSTERS };

  /* scripts/build_sprite.py의 확장 행 순서. 행 수가 레이아웃을 정한다.
   * `only`는 그 행에서 런타임이 실제로 쓰는 칸 — 나머지 칸은 비어 있는 게 정상이다
   * (받침이 될 수 없는 ㄸ·ㅃ·ㅉ, 키 큰 초성 문맥 행의 합자 모음 7칸). */
  var ROWS = [
    { kind: "consonant", label: "자음" },
    { kind: "vowel", label: "모음" },
    { kind: "consonant", label: "종성 자음", only: CONSONANTS.filter(function (jamo) { return "ㄸㅃㅉ".indexOf(jamo) < 0; }) },
    { kind: "coda-cluster", label: "겹받침" },
    { kind: "consonant", label: "받침 위·가로모음 초성" },
    { kind: "vowel", label: "키 큰 초성 문맥 합자 모음", only: ["ㅘ", "ㅙ", "ㅚ", "ㅝ", "ㅞ", "ㅟ", "ㅢ"] }
  ];

  var MASTER_CELL = 256;
  var COLS = 21;
  var MIN_ROWS = 2;
  /* Export / preview cell sizes (1x–4x of a 64px cell, the old Sprite Editor scales). */
  var EXPORT_CELLS = [64, 128, 192, 256];
  /* build_sprite.py --scale 1 2 3 variables. */
  var MULTI_SCALE_VARS = { 1: "--fy-sprite-url", 2: "--fy-sprite-url-2x", 3: "--fy-sprite-url-3x" };
  /* 래스터 품질 → --fy-sprite-rendering (빈 값 = 선언 없음 = auto). */
  var RENDERING = { smooth: "", crisp: "crisp-edges", pixel: "pixelated" };
  /* Font-level small-text correction for sheets whose ink sits inside the
   * cell (extracted from a system font): zoom the cell, keep it centred
   * (crop = -(zoom - 1) / 2 em) and darken antialiased edges. */
  var SMALL_TEXT_PRESET = [
    ["--fy-sprite-zoom", "1.35"],
    ["--fy-sprite-crop-x", "-0.175em"],
    ["--fy-sprite-crop-y", "-0.175em"],
    ["--fy-sprite-dilate", "drop-shadow(0 0 0 #17130d)"]
  ];
  /* Page-only optical preset (--fy-optical-sprite-* win over font values;
   * fonts must not declare them — ADR-008). */
  var OPTICAL_SMALL = [
    ["--fy-optical-sprite-zoom", "1.12"],
    ["--fy-optical-sprite-crop-x", "-0.06em"],
    ["--fy-optical-sprite-crop-y", "-0.06em"],
    ["--fy-optical-sprite-filter", "drop-shadow(0 0 0 #17130d)"]
  ];

  function rowLayout(rowCount) {
    return ROWS.slice(0, Math.max(MIN_ROWS, Math.min(rowCount, ROWS.length)));
  }

  /* Is `width`×`height` a sheet of `cols` square cells with a supported row
   * count? Rows and cell size come from the image, never from scaling. */
  function checkSheetSize(width, height, cols) {
    var columns = cols || COLS;
    if (!width || !height) {
      return { ok: false, message: "빈 이미지입니다" };
    }
    if (width % columns !== 0) {
      return { ok: false, message: "PNG 폭 " + width + "px가 " + columns + "열로 나누어떨어지지 않습니다 (" + width + "×" + height + ")" };
    }
    var cell = width / columns;
    if (height % cell !== 0) {
      return { ok: false, message: "PNG 높이 " + height + "px가 정사각형 칸 " + cell + "px의 배수가 아닙니다 (" + width + "×" + height + ")" };
    }
    var rows = height / cell;
    if (rows < MIN_ROWS || rows > ROWS.length) {
      return { ok: false, message: rows + "행 자소판은 지원하지 않습니다 (" + MIN_ROWS + "–" + ROWS.length + "행, 칸 " + cell + "px)" };
    }
    return { ok: true, cell: cell, rows: rows };
  }

  /* --fy-sprite-kinds a sheet of `rows` rows can serve (build_sprite.py rows). */
  function kindsForRows(rows) {
    var kinds = [];
    rowLayout(rows).forEach(function (entry) {
      if (kinds.indexOf(entry.kind) < 0) {
        kinds.push(entry.kind);
      }
    });
    return kinds;
  }

  function cellLabel(layout, row, col) {
    var entry = layout[row];
    if (!entry) {
      return null;
    }
    var label = KIND_TABLES[entry.kind][col];
    return label && (!entry.only || entry.only.indexOf(label) >= 0) ? label : null;
  }

  function labeledCells(layout) {
    var cells = [];
    layout.forEach(function (entry, row) {
      KIND_TABLES[entry.kind].forEach(function (label, col) {
        if (!entry.only || entry.only.indexOf(label) >= 0) {
          cells.push({ row: row, col: col, kind: entry.kind, label: label, rowLabel: entry.label });
        }
      });
    });
    return cells;
  }

  /* Sheet facts declared by a sprite font (ADR-008 §5 variables). */
  function readSpriteInfo(cssText) {
    var doc = Model.parse(cssText);
    var info = { url: null, cols: null, rows: null, kinds: null };
    doc.rules.forEach(function (rule) {
      rule.declarations.forEach(function (declaration) {
        if (declaration.name === "--fy-sprite-url") {
          var match = /url\(\s*(["']?)([^"')]+)\1\s*\)/.exec(declaration.value);
          info.url = match ? match[2] : null;
        } else if (declaration.name === "--fy-sprite-cols") {
          info.cols = parseInt(declaration.value, 10) || null;
        } else if (declaration.name === "--fy-sprite-rows") {
          info.rows = parseInt(declaration.value, 10) || null;
        } else if (declaration.name === "--fy-sprite-kinds") {
          info.kinds = declaration.value.trim().split(/\s+/);
        }
      });
    });
    return info;
  }

  function renderingFor(quality) {
    return Object.prototype.hasOwnProperty.call(RENDERING, quality) ? RENDERING[quality] : "";
  }

  /* --fy-sprite-rendering value → 래스터 품질 (unknown values read as smooth). */
  function qualityFor(rendering) {
    var value = String(rendering || "").trim();
    if (value === "pixelated") {
      return "pixel";
    }
    if (value === "crisp-edges" || value === "-webkit-optimize-contrast") {
      return "crisp";
    }
    return "smooth";
  }

  /* "./a.png" → "./a@2x.png" (build_sprite.py output_path_for_scale); a
   * query or fragment stays at the end. */
  function scaledPath(pathValue, scale) {
    var text = String(pathValue || "sheet.png");
    if (scale === 1) {
      return text;
    }
    var match = /^([^?#]*?)(\.png)?([?#].*)?$/i.exec(text);
    return match[1] + "@" + scale + "x" + (match[2] || "") + (match[3] || "");
  }

  /* A vector sheet (.svg) is redrawn by the browser at every size. The pixel
   * editor rasterizes it, so its edits save as a PNG beside it:
   * "./a.svg" → "./a.png". Other paths are already raster. */
  function isVectorSheet(pathValue) {
    return /\.svg(?:[?#]|$)/i.test(String(pathValue || ""));
  }

  function rasterPath(pathValue) {
    return pathValue ? String(pathValue).replace(/\.svg(?=[?#]|$)/i, ".png") : null;
  }

  function urlValue(pathValue) {
    return "url(" + Model.cssString(pathValue) + ")";
  }

  /* Host declarations for a 1x·2x·3x sheet set: each scale through its
   * registered <url> variable, --fy-sprite-image composing them. */
  function multiScaleDeclarations(pathValue, scales) {
    var list = (scales || [1, 2, 3]).slice().sort();
    if (list[0] !== 1 || list.some(function (scale) { return !MULTI_SCALE_VARS[scale]; })) {
      throw new Error("배율 세트는 1x와 2x·3x만 됩니다");
    }
    var declarations = list.map(function (scale) {
      return [MULTI_SCALE_VARS[scale], "url(" + Model.cssString(scaledPath(pathValue, scale)) + ")"];
    });
    declarations.push(["--fy-sprite-image", "image-set(" + list.map(function (scale) {
      return "var(" + MULTI_SCALE_VARS[scale] + ") " + scale + "x";
    }).join(", ") + ")"]);
    return declarations;
  }

  /* Smallest export cell that covers `cssPx` device pixels, never above the
   * sheet's own cell (a preview never upsamples on "auto"). */
  function autoPreviewCell(cssPx, devicePixelRatio, masterCell) {
    var want = Math.max(1, Number(cssPx) || 0) * (Number(devicePixelRatio) || 1);
    var pick = EXPORT_CELLS.filter(function (cell) { return cell >= want; })[0] || EXPORT_CELLS[EXPORT_CELLS.length - 1];
    return masterCell ? Math.min(pick, masterCell) : pick;
  }

  /* Page CSS for the small-text optical preset. The variables are page-only,
   * so this goes into the page that uses the font, never into the font. */
  function opticalPageCss(fontId) {
    var selector = ":where(font-kku, .font-kku)[data-fy-font=" + Model.cssString(fontId || "my-sprite") + '][data-optical-size="small"]';
    return [
      "/* 페이지 CSS — " + (fontId || "my-sprite") + " 그림 자소 글꼴의 작은 글씨 광학 보정.",
      " * --fy-optical-sprite-*는 페이지 전용 변수라 글꼴 CSS에 넣지 않는다(글꼴 값을 이긴다).",
      ' * 작은 글씨 바탕 요소에 data-optical-size="small"을 붙인다. */',
      selector + " {"
    ].concat(OPTICAL_SMALL.map(function (pair) {
      return "  " + pair[0] + ": " + pair[1] + ";";
    })).concat(["}", ""]).join("\n");
  }

  function sanitizeFontName(value) {
    var name = String(value || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!/^[a-z]/.test(name)) {
      name = "sprite-" + name;
    }
    return name.replace(/-+$/, "") || "sprite-font";
  }

  /* A new 2-row sprite font in the ADR-008 v2 contract — the core paints the
   * sheet, the font only declares it (same shape scripts/build_sprite.py emits). */
  function spriteFontTemplate(name, spritePath) {
    var gate = ':where([data-fy-font="' + name + '"])';
    return [
      "/* " + name + " — 글꼴 작업실에서 만든 그림 자소(sprite) 글꼴.",
      " * 자소판: 자음 19칸(1행) + 모음 21칸(2행), 칸은 1em 정사각형. */",
      "@layer font-kku.font, font-kku.jamo, font-kku.context;",
      "",
      "@layer font-kku.font {",
      "  " + gate + " {",
      "    --fy-font-id: " + name + ";",
      "    --fy-contract: 2;",
      "    --fy-material: sprite;",
      "    --fy-expression-mode: general;",
      "    --fy-glyph-width: 1em;",
      "    --fy-glyph-height: 1.2em;",
      '    --fy-sprite-url: url("' + spritePath + '");',
      "    --fy-sprite-cols: " + COLS + ";",
      "    --fy-sprite-rows: 2;",
      "    --fy-sprite-kinds: consonant vowel;",
      "  }",
      "",
      "  " + gate + ' [data-sprite-jamo-kind="vowel"] { --fy-sprite-row: 1; }',
      "}",
      ""
    ].join("\n");
  }

  /* A relative (or same-origin absolute) asset path that is safe inside
   * url("…"): no quotes, parentheses, backslashes, whitespace or schemes. */
  function safeAssetPath(value) {
    var text = String(value || "");
    return /^[A-Za-z0-9._~%\/-]+$/.test(text) && !/^\/\//.test(text) && text.length <= 200;
  }

  /* Why a v1 variable value cannot be pasted into CSS, or null. Values are
   * written verbatim into a declaration, so anything that could end the
   * declaration/rule, open a comment or load a resource is refused. */
  function unsafeValue(value) {
    var text = String(value);
    if (!text.trim()) {
      return "빈 값";
    }
    if (text.length > 200) {
      return "값이 너무 김";
    }
    if (/[;{}\\<>!\n\r\f]/.test(text) || /\/\*|\*\//.test(text)) {
      return "; { } \\ < > ! 주석은 쓸 수 없음";
    }
    if (/(url|image|image-set|expression|src|attr)\s*\(/i.test(text) || /@/.test(text)) {
      return "url()·image() 같은 자원 참조는 쓸 수 없음";
    }
    var depth = 0;
    for (var index = 0; index < text.length; index += 1) {
      depth += text[index] === "(" ? 1 : text[index] === ")" ? -1 : 0;
      if (depth < 0) {
        return "괄호 짝이 맞지 않음";
      }
    }
    if (depth !== 0) {
      return "괄호 짝이 맞지 않음";
    }
    if ((text.match(/"/g) || []).length % 2 || (text.match(/'/g) || []).length % 2) {
      return "따옴표 짝이 맞지 않음";
    }
    return null;
  }

  /* Sprite Editor v1 project (ADR-006) → { name, css, sheetPng, spritePath,
   * previewText, skipped }. v1 kept the font as a variable map; v2 keeps it
   * as CSS, so the map becomes host declarations in the font layer. Values
   * that are not plain CSS values (or an unsafe sprite path) are skipped and
   * listed, never pasted into the CSS. */
  function migrateV1Project(value) {
    var project = typeof value === "string" ? JSON.parse(value) : value;
    if (!project || project.format !== "font-kku-sprite-project" || project.version !== 1) {
      throw new Error("font-kku-sprite-project v1 파일이 아닙니다");
    }
    if (!project.sheet || !/^data:image\/png;base64,/.test(project.sheet.png || "")) {
      throw new Error("v1 프로젝트에 PNG 자소판이 없습니다");
    }
    var profile = project.profile || {};
    var name = sanitizeFontName(profile.fontName || "sprite-font");
    var skipped = [];
    var spritePath = "./" + name + ".png";
    if (profile.spritePath !== undefined && profile.spritePath !== null && profile.spritePath !== "") {
      if (safeAssetPath(profile.spritePath)) {
        spritePath = String(profile.spritePath);
      } else {
        skipped.push({ variable: "spritePath", reason: "안전하지 않은 경로라 " + spritePath + "로 바꿈" });
      }
    }
    var css = spriteFontTemplate(name, spritePath);
    var variables = profile.variables && typeof profile.variables === "object" ? profile.variables : {};
    Object.keys(variables).sort().forEach(function (variable) {
      if (!/^--fy-[a-z0-9-]+$/.test(variable)) {
        skipped.push({ variable: String(variable).slice(0, 40), reason: "--fy-* 변수 이름이 아님" });
        return;
      }
      if (/^--fy-(top|left|font-size|weight|stroke|scale-x|scale-y|rotate)$/.test(variable)) {
        return; // 페이지 전용 override는 폰트로 옮기지 않는다
      }
      var raw = variables[variable];
      var problem = typeof raw === "string" || typeof raw === "number" ? unsafeValue(raw) : "문자열·숫자가 아님";
      if (problem) {
        skipped.push({ variable: variable, reason: problem });
        return;
      }
      css = Model.setDeclaration(css, "font-kku.font", Model.fontScope(name), variable, String(raw).trim());
    });
    return {
      name: name,
      css: css,
      sheetPng: project.sheet.png,
      spritePath: spritePath,
      previewText: typeof profile.previewText === "string" ? profile.previewText : null,
      skipped: skipped
    };
  }

  var FontStudioSheet = {
    CONSONANTS: CONSONANTS,
    VOWELS: VOWELS,
    CODA_CLUSTERS: CODA_CLUSTERS,
    MASTER_CELL: MASTER_CELL,
    COLS: COLS,
    EXPORT_CELLS: EXPORT_CELLS,
    SMALL_TEXT_PRESET: SMALL_TEXT_PRESET,
    OPTICAL_SMALL: OPTICAL_SMALL,
    rowLayout: rowLayout,
    renderingFor: renderingFor,
    qualityFor: qualityFor,
    scaledPath: scaledPath,
    isVectorSheet: isVectorSheet,
    rasterPath: rasterPath,
    urlValue: urlValue,
    multiScaleDeclarations: multiScaleDeclarations,
    autoPreviewCell: autoPreviewCell,
    opticalPageCss: opticalPageCss,
    checkSheetSize: checkSheetSize,
    kindsForRows: kindsForRows,
    safeAssetPath: safeAssetPath,
    unsafeValue: unsafeValue,
    cellLabel: cellLabel,
    labeledCells: labeledCells,
    readSpriteInfo: readSpriteInfo,
    sanitizeFontName: sanitizeFontName,
    spriteFontTemplate: spriteFontTemplate,
    migrateV1Project: migrateV1Project
  };

  global.FontStudioSheet = FontStudioSheet;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioSheet;
  }
})(typeof window !== "undefined" ? window : globalThis);
