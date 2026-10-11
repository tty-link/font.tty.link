/* ESM entry for font-kku-export — no build step. font-kku-export.js stays the
 * single implementation: this module loads it for its side effect
 * (globalThis.FontKkuExport) and re-exports the same API object. Types:
 * font-kku-export.d.mts. */
import "./font-kku-export.js";

const FontKkuExport = globalThis.FontKkuExport;

export default FontKkuExport;
export const {
  exportFont,
  download,
  traceAlpha,
  simplify,
  clipToRect,
  outlineFromAlpha,
  buildTrueType,
  toWoff,
  CELL_TOP
} = FontKkuExport;
