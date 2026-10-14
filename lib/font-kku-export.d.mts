/* Types for the ESM entry (font-kku-export.mjs). Declarations live in
 * font-kku-export.d.ts; this file re-exposes them in ES module shape. */
import type { API } from "./font-kku-export.js";

declare const FontKkuExport: API;
export default FontKkuExport;

export declare const exportFont: API["exportFont"];
export declare const download: API["download"];
export declare const traceAlpha: API["traceAlpha"];
export declare const simplify: API["simplify"];
export declare const clipToRect: API["clipToRect"];
export declare const outlineFromAlpha: API["outlineFromAlpha"];
export declare const buildTrueType: API["buildTrueType"];
export declare const toWoff: API["toWoff"];
export declare const CELL_TOP: API["CELL_TOP"];

export type {
  API,
  Component,
  Contour,
  ExportError,
  ExportErrorCode,
  ExportOptions,
  ExportReport,
  ExportResult,
  FontSpec,
  Point,
} from "./font-kku-export.js";
