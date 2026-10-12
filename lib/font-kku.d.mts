/* Types for the ESM entry (font-kku.mjs): the runtime API object is the
 * default export and each member is also a named export. The declarations
 * themselves live in font-kku.d.ts (the classic/CommonJS entry); this file
 * only re-exposes them in ES module shape, so a default import works without
 * esModuleInterop/allowSyntheticDefaultImports. */
import type { API } from "./font-kku.js";

declare const FontKku: API;
export default FontKku;

export declare const version: API["version"];
export declare const placementTable: API["placementTable"];
export declare const placementTables: API["placementTables"];
export declare const layoutProfiles: API["layoutProfiles"];
export declare const layoutStability: API["layoutStability"];
export declare const define: API["define"];
export declare const bootstrap: API["bootstrap"];
export declare const render: API["render"];
export declare const refresh: API["refresh"];
export declare const refreshAll: API["refreshAll"];
export declare const retryFont: API["retryFont"];
export declare const loadFont: API["loadFont"];
export declare const fontInfo: API["fontInfo"];
export declare const upgrade: API["upgrade"];
export declare const upgradeAll: API["upgradeAll"];
export declare const decomposeGlyph: API["decomposeGlyph"];
export declare const createTextModel: API["createTextModel"];
export declare const isHangulSyllable: API["isHangulSyllable"];
export declare const renderText: API["renderText"];
export declare const hashSeed: API["hashSeed"];
export declare const applyJamoSeeds: API["applyJamoSeeds"];
export declare const hasHangulFont: API["hasHangulFont"];
export declare const registerJamo: API["registerJamo"];
export declare const jamoSets: API["jamoSets"];
export declare const registerDesign: API["registerDesign"];
export declare const validateDesign: API["validateDesign"];
export declare const unregisterDesign: API["unregisterDesign"];
export declare const designs: API["designs"];
export declare const planJamo: API["planJamo"];
export declare const traceOf: API["traceOf"];
export declare const stagePreview: API["stagePreview"];
export declare const authoringProgress: API["authoringProgress"];

export type {
  API,
  AuthoringProgress,
  AuthoringStageProgress,
  CodaDepth,
  Config,
  DepthInput,
  Design,
  DesignApply,
  DesignError,
  DesignErrorCode,
  DesignLock,
  DesignRegistrationError,
  DesignRule,
  DesignSource,
  DesignStatus,
  DesignValidation,
  DisplayTriple,
  ExpressionMode,
  FontInfo,
  FontName,
  HangulFontProbeOptions,
  JamoBoxCell,
  JamoCells,
  JamoPlan,
  JamoPlanItem,
  JamoPlanOptions,
  JamoTraceEntry,
  HostTrace,
  JamoSetOptions,
  JamoShape,
  Glyph,
  GlyphKind,
  HangulGlyph,
  HostMode,
  JamoDepth,
  JamoSeedOptions,
  JamoTriple,
  JongLayout,
  JungLayout,
  LineSegment,
  LoadFontOptions,
  LoadErrorEvent,
  LoadErrorEventDetail,
  PlacementKey,
  PlacementPlan,
  PlacementTable,
  PlacementTables,
  PlainGlyph,
  RegisterDesignOptions,
  RenderEvent,
  RenderEventDetail,
  RenderOptions,
  RenderReason,
  Seed,
  SourceJamo,
  SpaceSegment,
  TextModel,
  Topology,
  VowelDepth,
  WordSegment,
  WrapUnit,
} from "./font-kku.js";
