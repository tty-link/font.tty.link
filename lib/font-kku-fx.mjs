/* ESM entry for font-kku-fx — no build step. font-kku-fx.js stays the single
 * implementation: this module loads it for its side effect
 * (globalThis.FontKkuFx) and re-exports the same API object, so a classic
 * <script> (data-addons="fx") and an import share one instance and bind
 * declarative hosts once. Types: font-kku-fx.d.mts. */
import "./font-kku-fx.js";

const FontKkuFx = globalThis.FontKkuFx;

export default FontKkuFx;
export const {
  typingFrames,
  transitionFrames,
  type,
  scatter,
  magnet,
  shuffle,
  replay,
  bind,
  unbind
} = FontKkuFx;
