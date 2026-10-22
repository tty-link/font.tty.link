/* font-studio-material.js — Font Studio 재료 탭: sprite 시트 편집 (ADR-009 §3)
 *
 * 편집 중인 폰트가 --fy-material: sprite이면 폰트 CSS의 --fy-sprite-url 시트를
 * 마스터 캔버스로 불러와 칸 단위로 그린다. 편집은 blob URL로 미리보기에 즉시
 * 반영되고(미리보기 host의 레이어 밖 --fy-sprite-url override — 폰트 id가 바뀌어도
 * 그대로 맞는다), 편집하는 동안 글꼴 CSS의 --fy-sprite-url은 그대로다(저장소에 없는 PNG
 * 주소로 바꾸지 않는다 — D8). PNG 이름은 내보낼 때 정해지고, 그때 CSS가 그 PNG를 가리켜
 * 내보낸 PNG와 CSS가 짝을 이룬다. 시트는 원래 크기 그대로 쓴다
 * (drawImage로 늘이거나 줄이지 않는다). 행 수가 --fy-sprite-rows와 다르면 CSS를
 * 맞출지 묻는다. 미리보기·내보내기만 고른 칸 크기로 다시 샘플링한다.
 *
 * sprite가 아닌 폰트를 열면 시트 대신 "sprite 폰트로 그리기 시작" 안내를 보인다.
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var download = Util.download;

  var Studio = window.FontStudio;
  var Sheet = window.FontStudioSheet;
  var root = document.querySelector("[data-studio-material-panel]");
  var intro = document.querySelector("[data-studio-material-intro]");
  if (!Studio || !Sheet || !root || !intro) {
    return;
  }

  var EDIT_SIZE = 320;
  /* 자소판 화소 기록 — 단계(획·칸 비우기·붙여넣기)마다 바뀐 칸 조각의 전·후. 개수·전체 크기는 하나의 기록(FontStudio.timeline,
   * PLAN-STUDIO-002 S2)이 자르고, 자소판 몫은 아래 바이트로도 자른다(자르면 시간축에서도 뺀다) */
  var HISTORY_LIMIT = 100000;
  var HISTORY_BYTES = 160 * 1024 * 1024; // 시트 전체 단계는 크다 — 개수와 함께 바이트로도 자른다
  var DEFAULT_SEED_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
  var EXAMPLE_FONT = "sprite-example";
  var DOWNLOAD_GAP_MS = 250;

  var master = document.createElement("canvas");
  var masterContext = master.getContext("2d", { willReadFrequently: true });
  var overview = root.querySelector("[data-material-sheet]");
  var guide = root.querySelector("[data-material-guide]");
  var cellCanvas = root.querySelector("[data-material-cell]");
  var state = {
    active: false,
    editable: false,
    layout: Sheet.rowLayout(2),
    cols: Sheet.COLS,
    cellPx: Sheet.MASTER_CELL,
    spritePath: null,
    vectorSheet: false,
    sourceEdited: false, // 캔버스가 CSS가 가리키는 자소판과 달라졌는가(되돌리기 기록 밖의 까닭: 프로젝트·초안 자소판, PNG 열기, 새 글꼴, 잘린 기록)
    fontId: null,
    selected: { row: 0, col: 0 },
    tool: "pen",
    guides: { grid: true, reference: true },
    quality: "smooth",
    previewCell: "native",
    exportCell: "native",
    optical: false,
    history: [],
    redo: [],
    clipboard: null,
    objectUrl: null,
    publishing: false,
    exporting: false,
    fontJobs: 0,
    loading: false,
    pending: null,
    publishCount: 0,
    reveal: location.hash === "#studio-material",
    override: new CSSStyleSheet(),
    opticalSheet: new CSSStyleSheet()
  };
  var changeListeners = []; // Studio.material.onChange — 자소판 화소가 미리보기에 닿을 때
  var infoCache = { css: null, info: null };

  function $(selector) {
    return root.querySelector(selector);
  }

  // ── Sheet loading ──────────────────────────────────────────────────────

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("자소판 이미지를 불러오지 못했습니다: " + src)); };
      image.src = src;
    });
  }

  function forgetHistory() {
    state.history = [];
    state.redo = [];
    timelineCall("forget", "sheet");
    syncHistoryButtons();
  }

  /* 하나의 기록 — 작업실 시간축(FontStudio.timeline)에 자소판 갈래로 붙는다. 시간축이 없으면(옛 껍데기) 제 기록만 쓴다 */
  function timelineCall(method) {
    var timeline = Studio.timeline;
    if (!timeline || typeof timeline[method] !== "function") {
      return undefined;
    }
    return timeline[method].apply(timeline, Array.prototype.slice.call(arguments, 1));
  }

  function resetMaster(rows, cellPx) {
    state.layout = Sheet.rowLayout(rows);
    state.cellPx = cellPx;
    master.width = state.cols * cellPx;
    master.height = state.layout.length * cellPx;
    masterContext.clearRect(0, 0, master.width, master.height);
    forgetHistory();
  }

  /* The sheet at its own size: the master canvas is exactly the image, so
   * no row is squashed or stretched. Rows come from the image. */
  function useImage(image) {
    var width = image.naturalWidth || image.width;
    var height = image.naturalHeight || image.height;
    var cellPx = Math.max(1, Math.round(width / state.cols));
    state.layout = Sheet.rowLayout(Math.max(1, Math.round(height / cellPx)));
    state.cellPx = cellPx;
    master.width = width;
    master.height = height;
    masterContext.clearRect(0, 0, width, height);
    masterContext.drawImage(image, 0, 0);
    try {
      masterContext.getImageData(0, 0, 1, 1);
      state.editable = true;
    } catch (error) {
      // file:// 이미지는 캔버스를 오염시킨다 — 보기만 하고 편집은 PNG 열기로 연다
      state.editable = false;
    }
    forgetHistory();
    redraw();
  }

  function sheetInfo() {
    var css = Studio.css();
    if (infoCache.css !== css) {
      infoCache = { css: css, info: Sheet.readSpriteInfo(css) };
    }
    return infoCache.info;
  }

  /* Sheet grid vs the font's --fy-sprite-rows/kinds: a mismatch is offered
   * as a CSS change instead of silently squashing the preview. */
  function offerReconcile(image, check, label, onAccept) {
    var info = sheetInfo();
    var rows = info.rows || 2;
    var kinds = info.kinds || [];
    var wantKinds = Sheet.kindsForRows(check.rows);
    var kindsMatch = wantKinds.length === kinds.length && wantKinds.every(function (kind) { return kinds.indexOf(kind) >= 0; });
    if (check.rows === rows && kindsMatch) {
      return false;
    }
    state.pending = { image: image, rows: check.rows, kinds: wantKinds, label: label, onAccept: onAccept };
    $("[data-material-pending-text]").textContent = label + ": " + check.rows + "행 자소판(칸 " + check.cell + "px)인데 글꼴 CSS는 " +
      "--fy-sprite-rows: " + rows + (kindsMatch ? "" : ", --fy-sprite-kinds: " + (kinds.join(" ") || "(없음)")) +
      "입니다. 그대로 쓰면 미리보기가 늘어나거나 찌그러집니다. CSS를 --fy-sprite-rows: " + check.rows +
      ", --fy-sprite-kinds: " + wantKinds.join(" ") + "로 바꾸고 불러올까요? (추가 행을 쓰는 문맥 규칙은 따로 써야 합니다)";
    $("[data-material-pending]").hidden = false;
    root.dataset.importState = "pending";
    return true;
  }

  function clearPending() {
    state.pending = null;
    $("[data-material-pending]").hidden = true;
  }

  function acceptPending() {
    var pending = state.pending;
    if (!pending) {
      return false;
    }
    clearPending();
    Studio.setHostVariables([
      ["--fy-sprite-rows", String(pending.rows)],
      ["--fy-sprite-kinds", pending.kinds.join(" ")]
    ], "--fy-sprite-rows: " + pending.rows + ", --fy-sprite-kinds: " + pending.kinds.join(" ") + "로 맞췄습니다.");
    pending.onAccept();
    root.dataset.importState = "imported";
    return true;
  }

  /* Without a sprite font there is nothing to draw on: the panel gives way
   * to an intro that opens one (the old Sprite Editor's entry point). */
  function showIntro(meta) {
    intro.hidden = state.active;
    if (!state.active) {
      intro.querySelector("[data-material-intro-font]").textContent = Studio.state.fontId || meta["font-id"] || "(이름 없음)";
      intro.querySelector("[data-material-intro-kind]").textContent = meta.material || "(없음)";
    }
  }

  function activate(css, material) {
    var meta = window.FontStudioModel.readMetadata(css);
    state.active = meta.material === "sprite";
    root.hidden = !state.active;
    showIntro(meta);
    clearPending();
    publish(null); // 이전 폰트의 시트 override는 새 폰트에 남기지 않는다
    setOptical(state.optical && state.active);
    if (!state.active) {
      return Promise.resolve();
    }
    syncQuality();
    var info = Sheet.readSpriteInfo(css);
    state.fontId = Studio.state.fontId || meta["font-id"];
    state.cols = info.cols || Sheet.COLS;
    // SVG 자소판은 그대로 읽어 캔버스에 올리고, 픽셀로 고친 것은 'PNG 내보내기'로 옆의 PNG에 저장한다.
    state.vectorSheet = Sheet.isVectorSheet(info.url);
    state.sourceEdited = Boolean(material && material.sheet);
    state.spritePath = Sheet.rasterPath(info.url) || "./" + state.fontId + ".png";
    var source = material && material.sheet
      ? material.sheet
      : new URL(info.url || state.spritePath, Studio.state.baseUrl).href;
    state.loading = true;
    return loadImage(source).then(function (image) {
      state.loading = false;
      useImage(image);
      if (material && material.sheet) {
        publish();
      } else {
        publish(null);
      }
      var check = Sheet.checkSheetSize(image.naturalWidth, image.naturalHeight, state.cols);
      if (!check.ok) {
        Studio.message(state.spritePath + ": " + check.message + " — 미리보기 칸이 어긋납니다.", "warn");
      } else {
        offerReconcile(image, check, state.spritePath, function () { publish(); });
      }
      if (!state.editable) {
        Studio.message("자소판이 file://에서 열려 브라우저가 픽셀 편집을 막습니다. 'PNG 열기'로 " +
          state.spritePath + "을 선택하면 편집할 수 있습니다.", "warn");
      } else if (state.vectorSheet) {
        Studio.message(info.url + "은 SVG 자소판입니다 — 어느 크기에서나 선명하게 다시 그려집니다. 여기서 픽셀로 고친 것은 " +
          "'PNG 내보내기'로 " + state.spritePath + "에 저장하고 그때 글꼴 CSS가 그 파일을 가리킵니다. 획 자체를 고치려면 SVG를 직접 편집하세요.");
      }
    }, function () {
      state.loading = false;
      resetMaster(info.rows || 2, Sheet.MASTER_CELL);
      state.editable = true;
      state.sourceEdited = true;
      redraw();
      Studio.message(state.spritePath + "을 찾지 못해 빈 자소판으로 시작합니다.", "warn");
    });
  }

  function reveal() {
    if (!state.reveal) {
      return;
    }
    state.reveal = false;
    var target = document.getElementById("studio-material");
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  // ── Resampling (preview / export only — the master keeps its size) ─────

  function previewCell() {
    if (state.previewCell === "native") {
      return state.cellPx;
    }
    if (state.previewCell === "auto") {
      var fontPx = parseFloat(getComputedStyle(Studio.host).fontSize) || 84;
      return Sheet.autoPreviewCell(fontPx, window.devicePixelRatio || 1, state.cellPx);
    }
    return Number(state.previewCell) || state.cellPx;
  }

  function exportCell() {
    return state.exportCell === "native" ? state.cellPx : Number(state.exportCell) || state.cellPx;
  }

  /* The sheet at `cell` px per cell. Smooth quality halves large reductions
   * step by step (one big drawImage step aliases); crisp/pixel sample the
   * nearest pixel. */
  function resampled(cell) {
    if (cell === state.cellPx) {
      return master;
    }
    var width = state.cols * cell;
    var height = state.layout.length * cell;
    var smoothing = state.quality === "smooth";
    var source = master;
    if (smoothing) {
      while (source.width > width * 2 && source.height > height * 2 && source.width % 2 === 0 && source.height % 2 === 0) {
        var half = document.createElement("canvas");
        half.width = source.width / 2;
        half.height = source.height / 2;
        var halfContext = half.getContext("2d");
        halfContext.imageSmoothingEnabled = true;
        halfContext.imageSmoothingQuality = "high";
        halfContext.drawImage(source, 0, 0, half.width, half.height);
        source = half;
      }
    }
    var out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    var context = out.getContext("2d");
    context.imageSmoothingEnabled = smoothing;
    if (smoothing) {
      context.imageSmoothingQuality = "high";
    }
    context.drawImage(source, 0, 0, width, height);
    return out;
  }

  function toBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("PNG를 만들지 못했습니다"));
        }
      }, "image/png");
    });
  }

  // ── Publishing to the preview ──────────────────────────────────────────

  var publishTimer = null;

  function schedulePublish() {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publish, 120);
  }

  /* Unlayered override of the sheet URLs on the preview host (keyed on the
   * host, not the font id, so renaming keeps it): wins over the font layers
   * without touching the font CSS. -2x/-3x are overridden too, so a font
   * with --fy-sprite-image: image-set(...) previews the edited sheet at every
   * density. `null` removes the override. */
  function publish(clear) {
    clearTimeout(publishTimer);
    publishTimer = null;
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      Studio.forgetImage(state.objectUrl);
      state.objectUrl = null;
    }
    if (clear === null || !state.active) {
      Studio.removeOverlay(state.override);
      notifyChange();
      return;
    }
    state.publishing = true;
    var cell = previewCell();
    toBlob(resampled(cell)).then(function (blob) {
      state.publishing = false;
      if (state.objectUrl) {
        URL.revokeObjectURL(state.objectUrl);
        Studio.forgetImage(state.objectUrl);
      }
      state.objectUrl = URL.createObjectURL(blob);
      var url = "url(" + JSON.stringify(state.objectUrl) + ")";
      state.override.replaceSync("[data-studio-host] { --fy-sprite-url: " + url + "; --fy-sprite-url-2x: " + url +
        "; --fy-sprite-url-3x: " + url + "; }");
      Studio.addOverlay(state.override);
      state.publishCount += 1;
      root.dataset.published = String(state.publishCount);
      root.dataset.previewCell = String(cell);
      notifyChange();
    }, function () {
      state.publishing = false;
    });
  }

  /* 자소판 화소가 미리보기에 닿았다(덮어쓰기를 바꾸거나 뗐다) — 글꼴 CSS는 그대로라 작업실 render 사건이 없다.
   * 검수 페이지처럼 화소에 기대는 모듈이 받는다. 처리기 하나가 던져도 나머지는 받는다. */
  function notifyChange() {
    changeListeners.forEach(function (listener) {
      try {
        listener();
      } catch (error) {
        setTimeout(function () { throw error; }, 0);
      }
    });
  }

  /* Page-only optical preset on the preview host (never written to the font). */
  function setOptical(on) {
    if (on) {
      state.opticalSheet.replaceSync("[data-studio-host] { " + Sheet.OPTICAL_SMALL.map(function (pair) {
        return pair[0] + ": " + pair[1] + ";";
      }).join(" ") + " }");
      Studio.addOverlay(state.opticalSheet);
    } else {
      Studio.removeOverlay(state.opticalSheet);
    }
    root.dataset.optical = String(Boolean(on));
  }

  // ── Drawing views ──────────────────────────────────────────────────────

  function redraw() {
    drawOverview();
    drawCell();
    renderMissing();
    var source = state.active ? sheetInfo().url : null;
    $("[data-material-summary]").textContent = state.cols + "×" + state.layout.length + " 칸 · " +
      state.cellPx + "px · " + (source && source !== state.spritePath ? source + " (PNG 내보내기 " + state.spritePath + ")" : state.spritePath) +
      (state.editable ? "" : " · 보기 전용");
    root.dataset.editable = String(state.editable);
  }

  function drawOverview() {
    var cell = Math.floor(overview.clientWidth / state.cols) || 32;
    overview.width = cell * state.cols;
    overview.height = cell * state.layout.length;
    var context = overview.getContext("2d");
    context.clearRect(0, 0, overview.width, overview.height);
    context.drawImage(master, 0, 0, overview.width, overview.height);
    context.strokeStyle = "rgba(36, 71, 168, 0.18)";
    context.lineWidth = 1;
    for (var col = 0; col <= state.cols; col += 1) {
      context.beginPath();
      context.moveTo(col * cell + 0.5, 0);
      context.lineTo(col * cell + 0.5, overview.height);
      context.stroke();
    }
    for (var row = 0; row <= state.layout.length; row += 1) {
      context.beginPath();
      context.moveTo(0, row * cell + 0.5);
      context.lineTo(overview.width, row * cell + 0.5);
      context.stroke();
    }
    context.strokeStyle = "#bd3a2a";
    context.lineWidth = 2;
    context.strokeRect(state.selected.col * cell + 1, state.selected.row * cell + 1, cell - 2, cell - 2);
    var labels = $("[data-material-rows]");
    labels.textContent = "";
    state.layout.forEach(function (entry, index) {
      var item = document.createElement("li");
      item.style.blockSize = cell + "px";
      item.textContent = (index + 1) + " " + entry.label;
      labels.appendChild(item);
    });
  }

  function cellRect(row, col) {
    return { x: col * state.cellPx, y: row * state.cellPx, w: state.cellPx, h: state.cellPx };
  }

  function sheetRect() {
    return { x: 0, y: 0, w: master.width, h: master.height };
  }

  function drawGuides(label) {
    var context = guide.getContext("2d");
    context.clearRect(0, 0, EDIT_SIZE, EDIT_SIZE);
    if (state.guides.reference && label) {
      drawGlyph(context, label, 0, 0, EDIT_SIZE, $("[data-material-family]").value || DEFAULT_SEED_FAMILY, "rgba(36, 71, 168, 0.16)");
    }
    if (state.guides.grid) {
      context.save();
      context.lineWidth = 1;
      context.setLineDash([6, 6]);
      context.strokeStyle = "rgba(36, 71, 168, 0.35)";
      context.beginPath();
      context.moveTo(EDIT_SIZE / 2 + 0.5, 0);
      context.lineTo(EDIT_SIZE / 2 + 0.5, EDIT_SIZE);
      context.moveTo(0, EDIT_SIZE / 2 + 0.5);
      context.lineTo(EDIT_SIZE, EDIT_SIZE / 2 + 0.5);
      context.stroke();
      context.strokeStyle = "rgba(36, 71, 168, 0.16)";
      context.beginPath();
      [1, 2].forEach(function (step) {
        var offset = Math.round(EDIT_SIZE * step / 3) + 0.5;
        context.moveTo(offset, 0);
        context.lineTo(offset, EDIT_SIZE);
        context.moveTo(0, offset);
        context.lineTo(EDIT_SIZE, offset);
      });
      context.stroke();
      context.restore();
    }
  }

  function drawCell() {
    guide.width = guide.height = cellCanvas.width = cellCanvas.height = EDIT_SIZE;
    var label = Sheet.cellLabel(state.layout, state.selected.row, state.selected.col);
    drawGuides(label);
    var context = cellCanvas.getContext("2d");
    context.clearRect(0, 0, EDIT_SIZE, EDIT_SIZE);
    context.imageSmoothingEnabled = state.quality === "smooth";
    var rect = cellRect(state.selected.row, state.selected.col);
    context.drawImage(master, rect.x, rect.y, rect.w, rect.h, 0, 0, EDIT_SIZE, EDIT_SIZE);
    $("[data-material-cell-label]").textContent = (label || "(빈 칸)") + " · " +
      state.layout[state.selected.row].label + " " + (state.selected.col + 1) + "번째";
    renderCoverage();
  }

  /* Glyph drawn the way the runtime places a jamo in a 1em box with
   * line-height 1, so seeded cells line up with system-font rendering. */
  function drawGlyph(context, text, x, y, size, family, color) {
    context.save();
    context.font = "400 " + size + "px " + family;
    context.fillStyle = color;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    var metrics = context.measureText(text);
    var ascent = metrics.fontBoundingBoxAscent;
    var descent = metrics.fontBoundingBoxDescent;
    context.fillText(text, x + (size - metrics.width) / 2, y + (size - (ascent + descent)) / 2 + ascent);
    context.restore();
  }

  // ── Coverage ───────────────────────────────────────────────────────────

  function inkPixels(row, col) {
    var rect = cellRect(row, col);
    var data = masterContext.getImageData(rect.x, rect.y, rect.w, rect.h).data;
    var count = 0;
    for (var index = 3; index < data.length; index += 4) {
      count += data[index] > 8 ? 1 : 0;
    }
    return count;
  }

  function cellIsEmpty(row, col) {
    var rect = cellRect(row, col);
    var data = masterContext.getImageData(rect.x, rect.y, rect.w, rect.h).data;
    for (var index = 3; index < data.length; index += 4) {
      if (data[index] > 8) {
        return false;
      }
    }
    return true;
  }

  function missingCells() {
    if (!state.editable) {
      return [];
    }
    return Sheet.labeledCells(state.layout).filter(function (cell) {
      return cellIsEmpty(cell.row, cell.col);
    });
  }

  function coverage() {
    if (!state.editable) {
      return null;
    }
    var pixels = inkPixels(state.selected.row, state.selected.col);
    var total = Sheet.labeledCells(state.layout).length;
    return {
      pixels: pixels,
      percent: Math.round(pixels * 1000 / (state.cellPx * state.cellPx)) / 10,
      filled: total - missingCells().length,
      total: total
    };
  }

  function renderCoverage() {
    var node = $("[data-material-coverage]");
    var value = coverage();
    node.textContent = value
      ? "잉크 " + value.pixels + "px (" + value.percent + "%) · 채운 칸 " + value.filled + " / " + value.total
      : "보기 전용 — 잉크를 잴 수 없습니다";
    root.dataset.coverage = value ? String(value.pixels) : "";
  }

  function renderMissing() {
    var list = $("[data-material-missing]");
    list.textContent = "";
    var missing = missingCells();
    root.dataset.missing = String(missing.length);
    if (!missing.length) {
      list.textContent = state.editable ? "빈 칸 없음" : "";
      return;
    }
    list.textContent = "빈 칸 " + missing.length + "개: " + missing.slice(0, 40).map(function (cell) {
      return cell.label + "(" + (cell.row + 1) + "행)";
    }).join(" ") + (missing.length > 40 ? " …" : "");
  }

  // ── History (그리기 되돌리기·다시) ──────────────────────────────────────
  /* A step is one user action — a stroke, a fill, a cell op, or a sheet-wide
   * op — with the before/after pixels of every region it touched. */

  function beginStep(rects, label) {
    return {
      label: label,
      selected: { row: state.selected.row, col: state.selected.col },
      regions: rects.map(function (rect) {
        return { x: rect.x, y: rect.y, w: rect.w, h: rect.h, before: masterContext.getImageData(rect.x, rect.y, rect.w, rect.h), after: null };
      })
    };
  }

  function sameImage(a, b) {
    var left = a.data;
    var right = b.data;
    if (left.length !== right.length) {
      return false;
    }
    for (var index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  }

  function stepBytes(step) {
    return step.regions.reduce(function (total, region) { return total + region.w * region.h * 8; }, 0);
  }

  function syncHistoryButtons() {
    $("[data-material-undo]").disabled = state.history.length === 0;
    $("[data-material-redo]").disabled = state.redo.length === 0;
    root.dataset.history = state.history.length + "/" + state.redo.length;
  }

  /* Does the canvas differ from the sheet the font CSS points at? Steps in the history, or a reason outside it. */
  function sheetEdited() {
    return state.sourceEdited || state.history.length > 0;
  }

  /* D8: editing never rewrites --fy-sprite-url (the preview shows the edits through the blob override). The PNG name
   * is decided when the PNG is exported: an edited vector (.svg) sheet then points the font at the exported PNG, so
   * the CSS and the PNG pair up. The SVG file itself is left as it was. */
  function adoptExportedSheet() {
    var url = sheetInfo().url;
    if (!sheetEdited() || !Sheet.isVectorSheet(url)) {
      return false;
    }
    return Studio.setHostVariables([["--fy-sprite-url", Sheet.urlValue(state.spritePath)]],
      "편집한 자소판을 " + basename(state.spritePath) + "로 내보내고 글꼴 CSS의 --fy-sprite-url을 " + state.spritePath +
      "로 바꿨습니다 — 'CSS 내보내기'로 CSS도 함께 저장해 두 파일을 같은 폴더에 두세요.");
  }

  /* Identity of the pixels of one cell (the review page reads sprite cells by it), or null when unreadable. */
  function cellSignature(row, col) {
    if (!state.active || !state.editable || row < 0 || col < 0 || row >= state.layout.length || col >= state.cols) {
      return null;
    }
    var rect = cellRect(row, col);
    return Sheet.pixelSignature(masterContext.getImageData(rect.x, rect.y, rect.w, rect.h).data, state.cellPx);
  }

  /* Records the step unless it changed nothing; a new step clears redo. */
  function commitStep(step) {
    step.regions.forEach(function (region) {
      region.after = masterContext.getImageData(region.x, region.y, region.w, region.h);
    });
    if (step.regions.every(function (region) { return sameImage(region.before, region.after); })) {
      return false;
    }
    state.history.push(step);
    state.redo = [];
    timelineCall("record", "sheet", { label: step.label || "자소판", cause: "sheet", bytes: stepBytes(step) });
    var bytes = state.history.reduce(function (total, entry) { return total + stepBytes(entry); }, 0);
    while (state.history.length > 1 && (state.history.length > HISTORY_LIMIT || bytes > HISTORY_BYTES)) {
      bytes -= stepBytes(state.history.shift());
      state.sourceEdited = true; // 잘린 단계는 되돌릴 수 없다 — 모두 되돌려도 원래 자소판이 아니다
      timelineCall("dropOldestOf", "sheet");
    }
    syncHistoryButtons();
    return true;
  }

  function applyStep(step, which) {
    step.regions.forEach(function (region) {
      masterContext.putImageData(region[which], region.x, region.y);
    });
    state.selected = { row: step.selected.row, col: step.selected.col };
    changed();
    syncHistoryButtons();
  }

  function undoStep() {
    var step = state.history.pop();
    if (!step) {
      return false;
    }
    state.redo.push(step);
    applyStep(step, "before");
    Studio.message("되돌렸습니다: " + step.label);
    return true;
  }

  function redoStep() {
    var step = state.redo.pop();
    if (!step) {
      return false;
    }
    state.history.push(step);
    applyStep(step, "after");
    Studio.message("다시 적용했습니다: " + step.label);
    return true;
  }

  timelineCall("lane", "sheet", {
    undo: undoStep,
    redo: redoStep,
    truncate: function () {
      state.redo = [];
      syncHistoryButtons();
    },
    dropOldest: function () {
      state.history.shift();
      state.sourceEdited = true; // 잘린 단계는 되돌릴 수 없다
      syncHistoryButtons();
    }
  });

  /* 자소판 되돌리기·다시(자소판 칸 단추·FontStudio.material.undo/redo) — 자소판 갈래의 마지막 일. 시간축이 차례를 맞춘다 */
  function undoSheet() {
    var result = timelineCall("undoLane", "sheet");
    return result === undefined ? undoStep() : Boolean(result.ok);
  }

  function redoSheet() {
    var result = timelineCall("redoLane", "sheet");
    return result === undefined ? redoStep() : Boolean(result.ok);
  }

  // ── Editing ────────────────────────────────────────────────────────────

  function requireEditable() {
    if (!state.editable) {
      Studio.message("이 자소판은 보기 전용입니다. 'PNG 열기'로 불러오면 편집할 수 있습니다.", "warn");
      return false;
    }
    return true;
  }

  function changed() {
    redraw();
    schedulePublish();
    Studio.markEdited(); // 시트 편집도 초안에 들어간다
  }

  /* One undoable action over `rects`. */
  function edit(rects, label, apply) {
    if (!requireEditable()) {
      return false;
    }
    var step = beginStep(rects, label);
    apply();
    var recorded = commitStep(step);
    changed();
    return recorded;
  }

  function selectedRect() {
    return cellRect(state.selected.row, state.selected.col);
  }

  function selectCell(row, col) {
    state.selected = {
      row: Math.max(0, Math.min(state.layout.length - 1, row)),
      col: Math.max(0, Math.min(state.cols - 1, col))
    };
    redraw();
  }

  function withCellClip(callback) {
    var rect = selectedRect();
    masterContext.save();
    masterContext.beginPath();
    masterContext.rect(rect.x, rect.y, rect.w, rect.h);
    masterContext.clip();
    callback(rect);
    masterContext.restore();
  }

  function toMaster(point) {
    var rect = selectedRect();
    var scale = rect.w / EDIT_SIZE;
    return { x: rect.x + point.x * scale, y: rect.y + point.y * scale };
  }

  function brushSize() {
    return Number($("[data-material-size]").value) * state.cellPx / 64;
  }

  function strokeLine(from, to, erase) {
    withCellClip(function () {
      masterContext.globalCompositeOperation = erase ? "destination-out" : "source-over";
      masterContext.strokeStyle = $("[data-material-color]").value;
      masterContext.lineWidth = brushSize();
      masterContext.lineCap = "round";
      masterContext.lineJoin = "round";
      masterContext.beginPath();
      var a = toMaster(from);
      var b = toMaster(to);
      masterContext.moveTo(a.x, a.y);
      masterContext.lineTo(b.x + 0.01, b.y);
      masterContext.stroke();
    });
  }

  /* Line / rectangle outline from `from` to `to` in the selected cell. */
  function drawShape(tool, from, to) {
    withCellClip(function () {
      masterContext.globalCompositeOperation = "source-over";
      masterContext.strokeStyle = $("[data-material-color]").value;
      masterContext.lineWidth = brushSize();
      masterContext.lineCap = "round";
      masterContext.lineJoin = "round";
      var a = toMaster(from);
      var b = toMaster(to);
      masterContext.beginPath();
      if (tool === "rect") {
        masterContext.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      } else {
        masterContext.moveTo(a.x, a.y);
        masterContext.lineTo(b.x + 0.01, b.y);
        masterContext.stroke();
      }
    });
  }

  function floodFill(point) {
    var rect = selectedRect();
    var size = rect.w;
    var image = masterContext.getImageData(rect.x, rect.y, size, size);
    var data = image.data;
    var start = toMaster(point);
    var sx = Math.min(size - 1, Math.max(0, Math.floor(start.x - rect.x)));
    var sy = Math.min(size - 1, Math.max(0, Math.floor(start.y - rect.y)));
    var hex = $("[data-material-color]").value;
    var fill = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
    var origin = (sy * size + sx) * 4;
    var target = [data[origin], data[origin + 1], data[origin + 2], data[origin + 3]];
    var same = function (offset) {
      return Math.abs(data[offset] - target[0]) + Math.abs(data[offset + 1] - target[1]) +
        Math.abs(data[offset + 2] - target[2]) + Math.abs(data[offset + 3] - target[3]) < 64;
    };
    if (target.every(function (value, index) { return value === fill[index]; })) {
      return;
    }
    var stack = [[sx, sy]];
    var seen = new Uint8Array(size * size);
    while (stack.length) {
      var next = stack.pop();
      var x = next[0];
      var y = next[1];
      if (x < 0 || y < 0 || x >= size || y >= size || seen[y * size + x]) {
        continue;
      }
      var offset = (y * size + x) * 4;
      seen[y * size + x] = 1;
      if (!same(offset)) {
        continue;
      }
      data[offset] = fill[0];
      data[offset + 1] = fill[1];
      data[offset + 2] = fill[2];
      data[offset + 3] = fill[3];
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    masterContext.putImageData(image, rect.x, rect.y);
  }

  function seedCell(row, col) {
    var label = Sheet.cellLabel(state.layout, row, col);
    if (!label) {
      return false;
    }
    var rect = cellRect(row, col);
    masterContext.clearRect(rect.x, rect.y, rect.w, rect.h);
    drawGlyph(masterContext, label, rect.x, rect.y, rect.w, $("[data-material-family]").value || DEFAULT_SEED_FAMILY, "#000");
    return true;
  }

  function seedMissing() {
    if (!requireEditable()) {
      return false;
    }
    var missing = missingCells();
    if (!missing.length) {
      Studio.message("빈 칸이 없습니다.");
      return false;
    }
    return edit([sheetRect()], "빈 칸 " + missing.length + "개 글꼴로 채우기", function () {
      missing.forEach(function (cell) { seedCell(cell.row, cell.col); });
    });
  }

  function seedAll(options) {
    if (!(options && options.confirmed) && !window.confirm("자소판의 모든 칸을 글꼴 글자로 다시 채울까요? 그린 칸도 덮어씁니다. '그리기 되돌리기'로 되돌릴 수 있습니다.")) {
      return false;
    }
    return edit([sheetRect()], "전체 다시 채우기", function () {
      Sheet.labeledCells(state.layout).forEach(function (cell) { seedCell(cell.row, cell.col); });
    });
  }

  function clearSheet(options) {
    if (!(options && options.confirmed) && !window.confirm("자소판 전체를 비울까요? '그리기 되돌리기'로 되돌릴 수 있습니다.")) {
      return false;
    }
    return edit([sheetRect()], "자소판 전체 비우기", function () {
      masterContext.clearRect(0, 0, master.width, master.height);
    });
  }

  // ── Raster quality and presets (font CSS edits) ────────────────────────

  function syncQuality() {
    state.quality = Sheet.qualityFor(Studio.hostValue("--fy-sprite-rendering"));
    $("[data-material-quality]").value = state.quality;
  }

  function setQuality(quality) {
    var value = Sheet.renderingFor(quality);
    Studio.setHostVariables([["--fy-sprite-rendering", value]],
      "래스터 품질: " + (value ? "--fy-sprite-rendering: " + value : "--fy-sprite-rendering 선언을 지웠습니다 (auto)") +
      " — 미리보기·PNG 다시 샘플링도 이 방식을 씁니다.");
    state.quality = Sheet.qualityFor(value);
    $("[data-material-quality]").value = state.quality;
    drawCell();
    schedulePublish();
  }

  function applySmallPreset() {
    var changedCss = Studio.setHostVariables(Sheet.SMALL_TEXT_PRESET,
      "작은 글씨 그림 자소 프리셋: " + Sheet.SMALL_TEXT_PRESET.map(function (pair) { return pair[0] + " " + pair[1]; }).join(", ") +
      " (글꼴 레벨 바탕 요소 값 — 전역·묶음 변수 패널에서 더 고칠 수 있습니다)");
    if (!changedCss) {
      Studio.message("작은 글씨 그림 자소 프리셋이 이미 적용돼 있습니다.");
    }
    return changedCss;
  }

  function resetPreset() {
    var changedCss = Studio.setHostVariables(Sheet.SMALL_TEXT_PRESET.map(function (pair) { return [pair[0], ""]; }),
      "프리셋 변수(" + Sheet.SMALL_TEXT_PRESET.map(function (pair) { return pair[0]; }).join(", ") + ") 선언을 지웠습니다.");
    if (!changedCss) {
      Studio.message("지울 프리셋 변수가 없습니다.");
    }
    return changedCss;
  }

  // ── New font / import / export ─────────────────────────────────────────

  function basename(pathValue) {
    return String(pathValue || "sheet.png").split(/[?#]/)[0].split("/").pop() || "sheet.png";
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* One PNG at `cell` px per cell → { name, cell, width, height, size, css }. The sheet's own name (no
   * `opts.name`) also points an edited vector sheet's CSS at it (`css: true`) — the export decides the PNG name. */
  function exportPng(options) {
    var opts = options || {};
    var cell = opts.cell || exportCell();
    var name = opts.name || basename(state.spritePath);
    var canvas = resampled(cell);
    return toBlob(canvas).then(function (blob) {
      if (opts.download !== false) {
        download(name, blob);
      }
      var css = !opts.name && opts.adopt !== false ? adoptExportedSheet() : false;
      return { name: name, cell: cell, width: canvas.width, height: canvas.height, size: blob.size, css: css };
    });
  }

  function upscaleNote(cell) {
    return cell > state.cellPx ? " — 원본 칸 " + state.cellPx + "px보다 커서 늘린 이미지입니다" : "";
  }

  /* 글꼴 파일(ADR-015): 편집 중인 자소판(원본 캔버스 전체 해상도)과 미리보기의 글꼴 CSS로
   * 한글 11,172자 TTF를 만든다. 측정용 바탕 요소는 미리보기 shadow root에 붙여 편집 중인
   * CSS가 그대로 걸리게 한다. options.text로 일부만, download: false면 내려받지 않는다. */
  function exportFontFile(options) {
    var opts = options || {};
    /* 글꼴 파일 모듈은 처음 쓸 때 싣는다(font-studio-lazy.js 'export') */
    if (!window.FontKkuExport && typeof Studio.need === "function" && !exportFontFile.waited) {
      state.exporting = true;
      fontJob(1);
      exportStatus("글꼴 파일 모듈을 싣는 중…");
      var finish = function () { state.exporting = false; fontJob(-1); };
      return Studio.need("export").then(function () {
        finish();
        exportFontFile.waited = true;
        try {
          return exportFontFile(options);
        } finally {
          exportFontFile.waited = false;
        }
      }, function (error) {
        finish();
        exportStatus("글꼴 파일 모듈을 싣지 못했습니다.");
        throw error;
      });
    }
    if (!window.FontKkuExport) {
      Studio.message("font-kku-export.js가 실리지 않아 글꼴 파일을 만들 수 없습니다.", "error");
      return Promise.reject(new Error("font-kku-export.js is not loaded"));
    }
    state.exporting = true;
    fontJob(1);
    exportStatus("글꼴 파일을 만드는 중…");
    Studio.message("글꼴 파일(TTF)을 만드는 중입니다 — 한글 11,172자라 몇 초 걸립니다. 끝나면 내려받습니다.");
    return toBlob(master).then(function (blob) {
      var sheetUrl = URL.createObjectURL(blob);
      return window.FontKkuExport.exportFont({
        font: Studio.state.fontId || state.fontId,
        familyName: Studio.state.fontId || state.fontId,
        text: opts.text,
        root: Studio.shadowRoot,
        sheet: sheetUrl,
        onProgress: function (fraction) {
          exportStatus("글꼴 파일을 만드는 중… " + Math.round(fraction * 100) + "%");
        }
      }).then(function (result) {
        URL.revokeObjectURL(sheetUrl);
        return result;
      }, function (error) {
        URL.revokeObjectURL(sheetUrl);
        throw error;
      });
    }).then(function (result) {
      state.exporting = false;
      fontJob(-1);
      var name = (Studio.state.fontId || state.fontId || "font-kku") + ".ttf";
      if (opts.download !== false) {
        window.FontKkuExport.download(result.ttf, name);
      }
      var summary = name + " · " + result.report.glyphs.toLocaleString() + "자 · " + Math.round(result.ttf.length / 1024) + "KB" +
        (result.report.missing.length ? " · 칸이 비어 뺀 글자 " + result.report.missing.length + "개" : "");
      exportStatus(summary);
      Studio.message("글꼴 파일을 만들었습니다: " + summary);
      root.dataset.exportedFont = result.report.glyphs + "/" + result.ttf.length;
      delete root.dataset.exportError;
      return result;
    }, function (error) {
      state.exporting = false;
      fontJob(-1);
      /* 내보낼 글자가 없으면 내보내기 모듈이 code를 단 오류로 거절한다 — 빈 파일을 내려받지 않고 까닭을 보인다 */
      var text = exportErrorText(error);
      exportStatus(text);
      root.dataset.exportError = (error && error.code) || "error";
      Studio.message(text, "error");
      throw error;
    });
  }

  var FACE_NAMES = { element: "원소 획", svg: "8칸 그림 세트(SVG)", device: "기기 글꼴", system: "기기 글꼴" };

  function exportErrorText(error) {
    switch (error && error.code) {
      case "EXPORT_NO_GLYPHS":
        return "자소판 칸이 비어 있어 글꼴 파일을 만들지 않았습니다 — 자소를 그린 뒤 다시 내보내세요.";
      case "EXPORT_FONT_NOT_LOADED":
        return "미리보기에 글꼴 CSS가 아직 걸리지 않았습니다 — 잠시 뒤 다시 내보내세요.";
      case "EXPORT_JAMO_SET_NOT_LOADED":
        return "그림 세트가 아직 등록되지 않아 글꼴 파일을 만들지 않았습니다.";
      case "EXPORT_UNSUPPORTED_FACE":
        return "이 글꼴은 " + (FACE_NAMES[error.face] || error.face || "다른 재료") +
          "로 그려 글꼴 파일이 되지 않습니다 — 그림 자소(자소판) 글꼴만 내보냅니다.";
      case "EXPORT_NO_HANGUL":
        return "내보낼 한글이 없습니다.";
      default:
        return "글꼴 파일을 만들지 못했습니다: " + (error && error.message);
    }
  }

  function exportStatus(text) {
    $("[data-material-export-status]").textContent = text;
  }

  /* TTF 내보내기(약 8초) 동안 단추를 막고 바쁨을 알린다. 겹친 호출(자동화)은 마지막이 끝날 때 푼다. */
  function fontJob(delta) {
    state.fontJobs = Math.max(0, state.fontJobs + delta);
    var button = $("[data-material-export-font]");
    var busy = state.fontJobs > 0;
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    root.dataset.exportingFont = String(busy);
  }

  /* 1x·2x·3x set (build_sprite.py --scale 1 2 3 names) and the CSS that
   * reaches it: --fy-sprite-url(-2x/-3x) + --fy-sprite-image: image-set(...). */
  function exportSet(options) {
    var opts = options || {};
    var base = exportCell();
    var results = [];
    state.exporting = true;
    return [1, 2, 3].reduce(function (chain, scale) {
      return chain.then(function () {
        return exportPng({ cell: base * scale, name: basename(Sheet.scaledPath(state.spritePath, scale)), download: opts.download });
      }).then(function (result) {
        results.push(result);
        return opts.download === false ? null : wait(DOWNLOAD_GAP_MS);
      });
    }, Promise.resolve()).then(function () {
      state.exporting = false;
      Studio.setHostVariables(Sheet.multiScaleDeclarations(state.spritePath),
        "배율 세트를 내보내고 CSS에 --fy-sprite-url-2x/-3x와 --fy-sprite-image: image-set(...)을 연결했습니다.");
      publish(); // @2x/@3x 파일은 아직 폰트 옆에 없다 — 미리보기는 모든 밀도에서 편집 중인 시트를 쓴다
      exportStatus(results.map(function (result) { return result.name + " " + result.width + "×" + result.height; }).join(" · ") +
        upscaleNote(base * 3));
      root.dataset.exported = results.map(function (result) { return result.width + "x" + result.height; }).join(",");
      return results;
    }, function (error) {
      state.exporting = false;
      Studio.message(error.message, "error");
      throw error;
    });
  }

  /* The new font's name is trimmed, lower-cased and sanitized (the runtime
   * stamps lowercase names in data-fy-font); the name field shows it. */
  function newSpriteFont(name) {
    var fontName = Sheet.sanitizeFontName(name || "my-sprite");
    var field = document.querySelector("[data-studio-new-name]");
    if (field) {
      field.value = fontName;
    }
    state.reveal = true;
    var css = Sheet.spriteFontTemplate(fontName, "./" + fontName + ".png");
    Studio.loadFontText(css, { material: { blank: true } });
    return fontName;
  }

  function openExample() {
    state.reveal = true;
    Studio.openShipped(EXAMPLE_FONT); // 머리 막대의 글꼴 고르기와 같은 길(고친 것이 있으면 묻는다)
  }

  function readDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  /* PNG → sheet. Rows and columns come from the image size and the cell
   * size; impossible grids are rejected, and a row count that differs from
   * --fy-sprite-rows waits for the user to update the CSS. Resolves to
   * "imported" | "pending" | "rejected". */
  function importPng(file) {
    state.loading = true;
    return readDataUrl(file).then(loadImage).then(function (image) {
      state.loading = false;
      var check = Sheet.checkSheetSize(image.naturalWidth, image.naturalHeight, state.cols);
      if (!check.ok) {
        Studio.message(file.name + ": " + check.message + " — 불러오지 않았습니다.", "error");
        root.dataset.importState = "rejected";
        return "rejected";
      }
      var apply = function () {
        useImage(image);
        state.sourceEdited = true;
        publish();
        Studio.markEdited();
        Studio.message(file.name + " 자소판(" + state.cols + "×" + check.rows + ", 칸 " + check.cell + "px)를 불러왔습니다.");
      };
      if (offerReconcile(image, check, file.name, apply)) {
        Studio.message(file.name + ": 자소판 행 수가 글꼴 CSS와 달라 확인을 기다립니다.", "warn");
        return "pending";
      }
      clearPending();
      apply();
      root.dataset.importState = "imported";
      return "imported";
    }, function (error) {
      state.loading = false;
      Studio.message(file.name + "을 이미지로 읽지 못했습니다: " + (error && error.message || error), "error");
      root.dataset.importState = "rejected";
      return "rejected";
    });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────

  function onStudioLoad(options) {
    var css = Studio.css();
    var material = options && options.material;
    activate(css, material && material.sheet ? material : null).then(function () {
      if (material && material.blank) {
        resetMaster(2, Sheet.MASTER_CELL);
        state.editable = true;
        state.sourceEdited = true;
        Sheet.labeledCells(state.layout).forEach(function (cell) {
          seedCell(cell.row, cell.col);
        });
        redraw();
        publish();
        Studio.message(state.fontId + " 그림 자소 글꼴을 기기 글꼴로 채운 자소판에서 시작합니다. 칸을 골라 다시 그리세요.");
      }
      reveal();
    });
  }

  Studio.on("load", onStudioLoad);
  /* 처음 글꼴은 이 스크립트보다 먼저 도착할 수 있다(캐시가 빠른 정적 서버에서 앞 스크립트가 받은 CSS가 이 파일을
   * 받는 사이에 적용된다) — 이미 실린 글꼴이 있으면 그 불러오기를 같은 옵션(초안의 자소판 등)으로 지금 받고, 초안이면
   * 자소판이 든 상태로 다시 저장한다(놓친 사이에 자소판 없이 저장됐을 수 있다). */
  if (Studio.css()) {
    var missed = Studio.lastLoadOptions() || {};
    onStudioLoad(missed);
    if (missed.material) {
      Studio.draftSoon();
    }
  }

  /* Every CSS change (edits, undo/redo) re-renders: keep the quality select
   * on what the font declares. */
  Studio.on("render", function () {
    state.fontId = Studio.state.fontId;
    if (state.active) {
      syncQuality();
    }
  });

  Studio.on("select", function (node) {
    if (!state.active || !node.hasAttribute("data-sprite-jamo")) {
      return;
    }
    var row = parseInt(getComputedStyle(node).getPropertyValue("--fy-sprite-row"), 10) || 0;
    selectCell(row, parseInt(node.getAttribute("data-sprite-jamo-index"), 10) || 0);
  });

  Studio.on("project", function (project) {
    if (state.active && state.editable) {
      project.material = { kind: "sprite", path: state.spritePath, sheet: master.toDataURL("image/png") };
    }
  });

  overview.addEventListener("click", function (event) {
    var box = overview.getBoundingClientRect();
    var cell = box.width / state.cols;
    selectCell(Math.floor((event.clientY - box.top) / cell), Math.floor((event.clientX - box.left) / cell));
  });

  var stroke = null;

  function pointFrom(event) {
    var box = cellCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) * EDIT_SIZE / box.width,
      y: (event.clientY - box.top) * EDIT_SIZE / box.height
    };
  }

  /* 페인트 통(전에는 '채우기') — S3에서 '채우기'는 글꼴로 칸을 채우는 단추 하나가 되어 이름이 겹쳤다 */
  var TOOL_LABELS = { pen: "펜", eraser: "지우개", fill: "페인트 통", line: "직선", rect: "사각형" };

  cellCanvas.addEventListener("pointerdown", function (event) {
    if (!requireEditable()) {
      return;
    }
    var point = pointFrom(event);
    var rect = selectedRect();
    var label = TOOL_LABELS[state.tool] + " · " + (Sheet.cellLabel(state.layout, state.selected.row, state.selected.col) || "빈 칸");
    if (state.tool === "fill") {
      edit([rect], label, function () { floodFill(point); });
      return;
    }
    stroke = { tool: state.tool, start: point, last: point, step: beginStep([rect], label) };
    if (stroke.tool === "line" || stroke.tool === "rect") {
      stroke.base = stroke.step.regions[0].before; // 도형은 드래그 동안 원래 칸 위에 다시 그린다
    } else {
      strokeLine(point, point, stroke.tool === "eraser");
    }
    cellCanvas.setPointerCapture(event.pointerId);
    drawCell();
  });

  function shapeTo(point) {
    var rect = selectedRect();
    masterContext.putImageData(stroke.base, rect.x, rect.y);
    drawShape(stroke.tool, stroke.start, point);
  }

  cellCanvas.addEventListener("pointermove", function (event) {
    if (!stroke) {
      return;
    }
    var point = pointFrom(event);
    if (stroke.tool === "line" || stroke.tool === "rect") {
      shapeTo(point);
    } else {
      strokeLine(stroke.last, point, stroke.tool === "eraser");
    }
    stroke.last = point;
    drawCell();
  });

  function endStroke(event) {
    if (!stroke) {
      return;
    }
    if (stroke.tool === "line" || stroke.tool === "rect") {
      shapeTo(pointFrom(event));
    }
    var step = stroke.step;
    stroke = null;
    commitStep(step);
    changed();
  }

  cellCanvas.addEventListener("pointerup", endStroke);
  cellCanvas.addEventListener("pointercancel", endStroke);

  root.addEventListener("change", function (event) {
    if (event.target.name === "material-tool") {
      state.tool = event.target.value;
    }
  });

  $("[data-material-size]").addEventListener("input", function (event) {
    $("[data-material-size-output]").textContent = event.target.value;
  });

  $("[data-material-guide-grid]").addEventListener("change", function (event) {
    state.guides.grid = event.target.checked;
    drawCell();
  });

  $("[data-material-guide-reference]").addEventListener("change", function (event) {
    state.guides.reference = event.target.checked;
    drawCell();
  });

  $("[data-material-family]").addEventListener("change", drawCell);

  $("[data-material-undo]").addEventListener("click", undoSheet);
  $("[data-material-redo]").addEventListener("click", redoSheet);

  /* 칸 하나 비우기·글꼴로 채우기 — 단추 하나에 범위 고르기(S3 '채우기 셋·비우기 둘 → 각 하나') */
  function clearCell() {
    var rect = selectedRect();
    return edit([rect], "칸 비우기", function () {
      masterContext.clearRect(rect.x, rect.y, rect.w, rect.h);
    });
  }

  function seedSelected() {
    return edit([selectedRect()], "글꼴로 칸 채우기", function () {
      seedCell(state.selected.row, state.selected.col);
    });
  }

  /* scope: cell(이 칸) · missing(빈 칸 모두, 기본) · all(그린 칸도 다시 — 묻는다) */
  function fill(scope, options) {
    var which = scope || "missing";
    if (which === "cell") {
      return seedSelected();
    }
    if (which === "all") {
      return seedAll(options);
    }
    return seedMissing();
  }

  /* scope: cell(이 칸, 기본) · sheet(자소판 전체 — 묻는다) */
  function clear(scope, options) {
    return scope === "sheet" ? clearSheet(options) : clearCell();
  }

  $("[data-material-fill]").addEventListener("click", function () {
    fill($("[data-material-fill-scope]").value);
  });
  $("[data-material-clear]").addEventListener("click", function () {
    clear($("[data-material-clear-scope]").value);
  });

  $("[data-material-copy]").addEventListener("click", function () {
    if (requireEditable()) {
      var rect = selectedRect();
      state.clipboard = masterContext.getImageData(rect.x, rect.y, rect.w, rect.h);
      $("[data-material-paste]").disabled = false;
    }
  });

  function pasteCell() {
    if (!state.clipboard) {
      return false;
    }
    var problem = Sheet.pasteProblem(state.clipboard.width, state.clipboard.height, state.cellPx);
    if (problem) {
      Studio.message(problem, "warn");
      root.dataset.paste = "size";
      return false;
    }
    var rect = selectedRect();
    root.dataset.paste = "pasted";
    return edit([rect], "칸 붙여넣기", function () {
      masterContext.putImageData(state.clipboard, rect.x, rect.y);
    });
  }

  $("[data-material-paste]").addEventListener("click", pasteCell);

  $("[data-material-open-png]").addEventListener("change", function (event) {
    if (event.target.files[0]) {
      importPng(event.target.files[0]);
    }
    event.target.value = "";
  });

  $("[data-material-pending-accept]").addEventListener("click", acceptPending);
  $("[data-material-pending-cancel]").addEventListener("click", function () {
    clearPending();
    root.dataset.importState = "cancelled";
    Studio.message("자소판을 바꾸지 않았습니다.");
  });

  $("[data-material-quality]").addEventListener("change", function (event) {
    setQuality(event.target.value);
  });

  /* '미리보기 PNG 칸' 고르기는 뺐다(S3 ⚑5 — 내보내기 PNG 칸과 겹침). 미리보기는 원본 칸(setPreviewCell은 시험·자동화 창구로 남는다) */

  $("[data-material-export-cell]").addEventListener("change", function (event) {
    state.exportCell = event.target.value;
  });

  $("[data-material-export-png]").addEventListener("click", function () {
    if (!requireEditable()) {
      return;
    }
    exportPng().then(function (result) {
      exportStatus(result.name + " " + result.width + "×" + result.height + " · 칸 " + result.cell + "px · " + state.quality + upscaleNote(result.cell));
      root.dataset.exported = result.width + "x" + result.height;
    }, function (error) {
      Studio.message(error.message, "error");
    });
  });

  $("[data-material-export-set]").addEventListener("click", function () {
    if (requireEditable()) {
      exportSet().catch(function () {});
    }
  });

  $("[data-material-export-font]").addEventListener("click", function () {
    if (requireEditable() && !state.fontJobs) {
      exportFontFile().catch(function () {});
    }
  });

  $("[data-material-preset-small]").addEventListener("click", applySmallPreset);
  $("[data-material-preset-reset]").addEventListener("click", resetPreset);

  $("[data-material-optical-preview]").addEventListener("change", function (event) {
    state.optical = event.target.checked;
    setOptical(state.optical && state.active);
    Studio.message(state.optical
      ? "광학 보정(--fy-optical-sprite-*)을 미리보기에만 적용했습니다. 글꼴 CSS에는 들어가지 않습니다 — 쓰려면 '페이지용 광학 CSS 복사'로 페이지에 넣으세요."
      : "광학 보정 미리보기를 껐습니다.");
  });

  $("[data-material-copy-optical]").addEventListener("click", function () {
    var css = Sheet.opticalPageCss(Studio.state.fontId);
    Studio.copyText(css).then(function (copied) {
      Studio.message(copied
        ? "페이지용 광학 CSS를 복사했습니다. 글꼴을 쓰는 페이지의 스타일시트에 넣고, 작은 글씨 바탕 요소에 data-optical-size=\"small\"을 붙이세요."
        : "브라우저가 클립보드 쓰기를 막았습니다. 페이지용 광학 CSS: " + css.replace(/\s+/g, " "), copied ? "info" : "warn");
    });
  });

  intro.querySelector("[data-material-open-example]").addEventListener("click", openExample);
  intro.querySelector("[data-material-start-new]").addEventListener("click", function () {
    newSpriteFont(document.querySelector("[data-studio-new-name]").value.trim());
  });

  /* 막대의 '새 그림 자소 글꼴'(둘째 입구)과 'v1 프로젝트 가져오기'는 뺐다(S3 ⚑5) — 새 글꼴은 위 시작 안내, v1 그림 자소 프로젝트는
   * scripts/convert_sprite_project_v1.js가 글꼴 묶음으로 바꾼다(작업실 '열기'로 연다) */

  /* 테스트·자동화용: UI와 같은 경로를 쓴다. */
  Studio.material = {
    state: state,
    master: master,
    selectCell: selectCell,
    paint: function (points, tool) {
      var kind = tool || "pen";
      return edit([selectedRect()], TOOL_LABELS[kind] + " (자동화)", function () {
        if (kind === "line" || kind === "rect") {
          drawShape(kind, points[0], points[points.length - 1]);
          return;
        }
        for (var index = 1; index < points.length; index += 1) {
          strokeLine(points[index - 1], points[index], kind === "eraser");
        }
      });
    },
    inkPixels: inkPixels,
    cellSignature: cellSignature,
    onChange: function (listener) { changeListeners.push(listener); },
    edited: sheetEdited,
    paste: pasteCell,
    coverage: coverage,
    missing: missingCells,
    undo: undoSheet,
    redo: redoSheet,
    seedMissing: seedMissing,
    seedAll: function () { return seedAll({ confirmed: true }); },
    clearSheet: function () { return clearSheet({ confirmed: true }); },
    /* 단추 하나 + 범위(S3): fill('cell'|'missing'|'all'), clear('cell'|'sheet') — 묻는 것(all·sheet)은 묻지 않고 */
    fill: function (scope) { return fill(scope, { confirmed: true }); },
    clear: function (scope) { return clear(scope, { confirmed: true }); },
    setQuality: setQuality,
    setPreviewCell: function (value) { state.previewCell = String(value); publish(); },
    setExportCell: function (value) { state.exportCell = String(value); },
    exportPng: exportPng,
    exportSet: exportSet,
    exportFontFile: exportFontFile,
    applySmallPreset: applySmallPreset,
    resetPreset: resetPreset,
    setOptical: function (on) { state.optical = Boolean(on); setOptical(state.optical && state.active); },
    newSpriteFont: newSpriteFont,
    openExample: openExample,
    importPng: importPng,
    acceptPending: acceptPending,
    pending: function () { return state.pending ? { rows: state.pending.rows, kinds: state.pending.kinds.slice() } : null; },
    busy: function () { return Boolean(publishTimer) || state.publishing || state.loading || state.exporting; },
    /* v1 그림 자소 프로젝트 — 화면 입구는 뺐지만(S3 ⚑5, 스크립트로) 자동화 창구는 남긴다 */
    migrateV1: function (text) {
      var migrated = Sheet.migrateV1Project(text);
      Studio.loadFontText(migrated.css, { previewText: migrated.previewText, material: { sheet: migrated.sheetPng } });
      return migrated.name;
    }
  };
})();
