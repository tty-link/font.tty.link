/* Types for the ESM entry (font-kku-ime.mjs): the API object is the default
 * export and each member is also a named export. Declarations live in
 * font-kku-ime.d.ts. */
import type { API } from "./font-kku-ime.js";

declare const FontKkuIme: API;
export default FontKkuIme;

export declare const layouts: API["layouts"];
export declare const defaultLayout: API["defaultLayout"];
export declare const normalizeLayout: API["normalizeLayout"];
export declare const createComposer: API["createComposer"];
export declare const convert: API["convert"];
export declare const lookup: API["lookup"];
export declare const keyMap: API["keyMap"];
export declare const keyFromEvent: API["keyFromEvent"];
export declare const attach: API["attach"];

export type {
  API,
  AttachOptions,
  BackspaceResult,
  ChangeReason,
  ComposeResult,
  Composer,
  Controller,
  FieldState,
  KeyCap,
  KeyValue,
  LayoutId,
  LayoutInfo,
  LayoutInput,
  Mode,
  Role,
} from "./font-kku-ime.js";
