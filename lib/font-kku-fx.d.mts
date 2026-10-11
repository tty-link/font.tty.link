/* Types for the ESM entry (font-kku-fx.mjs): the API object is the default
 * export and each member is also a named export. Declarations live in
 * font-kku-fx.d.ts. */
import type { API } from "./font-kku-fx.js";

declare const FontKkuFx: API;
export default FontKkuFx;

export declare const typingFrames: API["typingFrames"];
export declare const transitionFrames: API["transitionFrames"];
export declare const type: API["type"];
export declare const scatter: API["scatter"];
export declare const magnet: API["magnet"];
export declare const shuffle: API["shuffle"];
export declare const replay: API["replay"];
export declare const bind: API["bind"];
export declare const unbind: API["unbind"];

export type {
  API,
  Controller,
  HostTarget,
  MagnetController,
  MagnetOptions,
  ScatterController,
  ScatterOptions,
  ShuffleController,
  ShuffleOptions,
  Transition,
  TypeController,
  TypeOptions,
} from "./font-kku-fx.js";
