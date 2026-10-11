/* ESM entry for font-kku-ime — no build step. font-kku-ime.js stays the single
 * implementation: this module loads it for its side effect
 * (globalThis.FontKkuIme) and re-exports the same API object, so a classic
 * <script> and an import share one instance. Types: font-kku-ime.d.mts. */
import "./font-kku-ime.js";

const FontKkuIme = globalThis.FontKkuIme;

export default FontKkuIme;
export const {
  layouts,
  defaultLayout,
  normalizeLayout,
  createComposer,
  convert,
  lookup,
  keyMap,
  keyFromEvent,
  attach
} = FontKkuIme;
