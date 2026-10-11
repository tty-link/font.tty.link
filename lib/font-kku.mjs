/* ESM entry for font-kku — no build step. The classic runtime in
 * font-kku.js stays the single implementation: this module loads it for its
 * side effect (globalThis.FontKku) and re-exports the same API object. When a
 * classic <script src="font-kku.js"> already ran on the page, the import
 * reuses that instance instead of creating a second one, so both entries
 * share host state, observers and stylesheet listeners. Types: font-kku.d.mts. */
import "./font-kku.js";

const FontKku = globalThis.FontKku;

export default FontKku;
export const {
  version,
  placementTable,
  placementTables,
  define,
  bootstrap,
  render,
  refresh,
  refreshAll,
  retryFont,
  loadFont,
  fontInfo,
  upgrade,
  upgradeAll,
  decomposeGlyph,
  createTextModel,
  isHangulSyllable,
  renderText,
  hashSeed,
  applyJamoSeeds,
  hasHangulFont,
  registerJamo,
  jamoSets
} = FontKku;
