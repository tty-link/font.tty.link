export as namespace FontKkuStudio;

/** The existing font-kku-font-project v2 document, including optional editor extensions. */
export interface FontProject {
  format: "font-kku-font-project";
  version: 2;
  font: { css: string; id?: string; baseUrl?: string };
  preview?: { text?: string };
  [key: string]: unknown;
}

/** A font package (font-kku-font-package v1): one font as stored, moved and served — CSS, design, drawings, sprite pixels,
 * review and environment. The editor writes packages and still opens project v2, design bundles, design JSON and CSS.
 * Fields it does not know are kept. */
export interface FontPackage {
  format: "font-kku-font-package";
  version: 1;
  manifest: {
    id: string;
    name: string;
    base?: { id: string; rev?: string };
    runtime: { version: string | null };
    layouts?: Record<string, string>;
    /** Content fingerprint of what the font draws (CSS, design, drawings, sprite pixels) — not the server revision. */
    contentRev: string;
    createdAt: string;
    updatedAt: string;
    license?: string;
  };
  /** The exact text the editor's CSS file save writes for this font. */
  css: string;
  /** The editing source when it differs from `css` (a derived font saved flattened). */
  sourceCss?: string;
  baseUrl?: string;
  preview?: { text?: string };
  design?: { json: Record<string, unknown>; applied: boolean; participants?: Record<string, unknown> };
  drawings?: Record<string, unknown>;
  material?: { kind: "sprite"; path: string; sheet?: string; sheetOmitted?: boolean };
  review?: Record<string, unknown>;
  environment?: Record<string, unknown>;
  history?: unknown;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Result of a store save: `REV_MISMATCH` when the stored revision moved on (409). */
export type StudioStoreSaveResult =
  | { ok: true; rev: string | null }
  | { ok: false; code: string; message?: string; rev?: string | null };

/** A store the editor saves packages through (mount option `store`, called across the frame). */
export interface StudioStore {
  save(id: string, pkg: FontPackage, options: { ifMatch: string | null }): StudioStoreSaveResult | Promise<StudioStoreSaveResult>;
  open?(id: string): { package: FontPackage; rev: string | null } | null | Promise<{ package: FontPackage; rev: string | null } | null>;
  list?(): unknown[] | Promise<unknown[]>;
  /** Report saves made elsewhere: call `listener({ id, rev, actor })`. Return a function that stops it. */
  watch?(id: string, listener: (event: { id: string; rev: string | null; actor?: string | null }) => void): () => void;
}

export interface MountOptions {
  /** URL of the package's studio/index.html. Inferred for classic scripts and ESM. */
  studioUrl?: string | URL;
  font?: string;
  /** Resolved against the host page, so local CSS assets keep their original base URL. */
  src?: string | URL;
  text?: string;
  /** A project v2 or a font package to open. */
  project?: FontProject | FontPackage;
  /** Save and open packages through this page's object (called across the frame). Not together with `storeUrl`. */
  store?: StudioStore;
  /** Save and open packages through the store HTTP contract v1 at this base URL (for example the dev/review site's
   * `/api/v1/store/session:<name>/`). The editor fetches it directly, so it must be same-origin or allow CORS.
   * With a store, the editor first opens `font` from the store and falls back to `src` / the shipped font. */
  storeUrl?: string | URL;
  /** localStorage draft key. Use a distinct key for each independently saved editor.
   * The default is the legacy "font-kku-font-studio-v2"; preserved drafts append ":pending". */
  draftKey?: string;
  /** Startup and each request timeout, in milliseconds. Default: 30000. */
  timeoutMs?: number;
  /** Allow saving an edited shipped font (sebul, gothic, …) under its own name. Default false: an edited
   * shipped font is saved only through "이 글꼴로 새 글꼴", as a derived font that pins the shipped base.
   * Meant for the font-kku repository's own studio. */
  shippedSave?: boolean;
  /** The studio page to open: "design" (default — material, glyph shape, drawing), "edit" (select and drag jamo,
   * edit scopes and values) "sheet" (sprite sheet), or "review" (human review). Switching pages inside the editor keeps the work and the connection. */
  page?: "design" | "edit" | "sheet" | "review";
  /** The view: "easy" or "precise". In this version it only names the view (the editor exposes it as
   * `data-studio-mode` and the `mode` event); the split screens come later. Default: "precise" with
   * `shippedSave: true`, otherwise "easy". */
  mode?: "easy" | "precise";
}

/** One refusal line from the studio's refusal table — the same sentence the editor shows. */
export interface StudioRefusal {
  code: string;
  message: string;
  hint?: string;
  detail?: string;
  /** EDIT_BLOCKED only: the nearest narrower scope id that does reach this jamo (scope ladder, ADR-035). */
  suggestScope?: string;
}

export interface StudioActor {
  kind: "human" | "agent";
  id: string | null;
}

/** A jamo in the preview: glyph order, syllable, its occurrence among equal syllables, jamo, slot, node order. */
export interface StudioSelection {
  index: number;
  source: string;
  nth: number;
  jamo: string;
  pos: string;
  node: number;
}

/** A glyph by preview order, by syllable ("의"), or by { source, nth } (nth defaults to 0). */
export type StudioGlyphRef = number | string | { source: string; nth?: number };

export type StudioSelectRequest =
  | { glyph: StudioGlyphRef; jamo?: string; pos?: string }
  | { glyph: StudioGlyphRef; node: number }
  | { point: { x: number; y: number } };

export interface StudioScopeInfo {
  current: string;
  chosen: boolean;
  available: { id: string; name: string }[];
  contexts: { value: string; label: string }[];
}

export interface StudioSelectResult {
  ok: boolean;
  refused: StudioRefusal[];
  selection: StudioSelection | null;
  candidates: StudioSelection[];
  scope?: StudioScopeInfo;
}

export interface StudioEditRequest {
  /** Scope id (family, slot, slotJamo, jamo, context, case, glyph, principle) or "default". */
  scope?: string;
  /** Context selector from scope.contexts[].value, for the "context" scope. */
  context?: string;
  /** Values for the scope's target variable as written in the font CSS; "" removes the declaration. */
  set?: Record<string, string | number>;
  /** Values the selected jamo should show, as typed in the precise value table (S4): the scope's target moves by the
   *  difference from what the node shows now (factor for size/scale). Without other contributions it is written as typed. */
  visible?: Record<string, string | number>;
  /** Percent of the glyph box, like the arrow keys. */
  nudge?: { dx?: number; dy?: number };
  /** Degrees added, like the [ ] keys. */
  rotate?: number;
  /** Size factor, like the + − keys. */
  scale?: number;
  /** Compute only: nothing in the editor changes. */
  dryRun?: boolean;
  /** History label. */
  note?: string;
  /** How long to wait for the checks after applying (overlaps), in milliseconds. Default 10000. */
  timeoutMs?: number;
}

export interface StudioDeclarationChange {
  layer: string | null;
  selector: string;
  property: string;
  before: string | null;
  after: string | null;
  line: number;
}

export interface StudioEditResult {
  applied: boolean;
  dryRun?: boolean;
  refused: StudioRefusal[];
  changes: StudioDeclarationChange[];
  /** preview: jamo in the preview that change; total: modern syllables (of 11,172) the written rule reaches (null if it
   *  could not be counted); counted before the edit, for the scope in effect. */
  affected: { preview: number; total: number | null; scope?: string };
  lint: { errors: number; warnings: number; findings: unknown[] } | null;
  overlaps: { glyph: string; a: string; b: string; ratio: number }[] | null;
  /** Content revision of the font CSS (same text, same value). */
  rev: string;
  effect?: string | null;
  settled?: boolean;
}

export interface StudioHistoryEntry {
  kind: "css" | "design" | "sheet";
  label: string;
  actor: StudioActor | null;
  time: number | null;
  state: "done" | "undone";
  id?: string;
}

export interface StudioReviewItem {
  key: string;
  title: string;
  text: string;
  status: "pass" | "needs-fix" | "hold" | "unreviewed" | "stale";
  verdict: "pass" | "needs-fix" | "hold" | null;
  note: string;
  at: string;
  actor: StudioActor | null;
}

export interface StudioChangeEvent {
  cause: "css" | "design" | "drawing" | "sheet" | "review" | "load";
  actor: StudioActor;
  rev: string;
  seq: number;
  label?: string;
  via?: string;
}

export interface StudioEvents {
  change: StudioChangeEvent;
  select: StudioSelection;
  page: { page: "design" | "edit" | "sheet" | "review" };
  mode: { mode: "easy" | "precise" };
  settled: { seq: number; rev: string };
}

/** Automation contract v1 methods callable through `handle.call`. Refusals are results, never rejections. */
export type StudioCompositionPreset = "auto" | "syllable" | "whole" | "jamo" | "pieces" | "origins";

/** The studio's composition state: what is chosen (axes, "" = the shape default), where it is written, and what the runtime draws. */
export interface StudioComposition {
  preset: StudioCompositionPreset | "custom";
  spec: { vowel: "" | "split" | "whole" | "syllable"; coda: "" | "split" | "whole"; pieces: "" | "pieces" | "origins" };
  where: "design" | "css";
  resolved: { preset: string; vowel: string; coda: string; pieces: string; status: string | null } | null;
}

export interface StudioApiCalls {
  info(): { ok: true; version: 1; ready: boolean; font: string | null; page: string; mode: string; actor: StudioActor; rev: string | null;
    seq: number; selection: StudioSelection | null; composition: StudioComposition | null; scope: StudioScopeInfo | null; properties: string[];
    events: string[]; remote: string[] };
  select(request: StudioSelectRequest): StudioSelectResult;
  edit(request: StudioEditRequest): StudioEditResult;
  undo(): { ok: boolean; refused: StudioRefusal[]; entry: { kind: string } | null; rev: string };
  redo(): { ok: boolean; refused: StudioRefusal[]; entry: { kind: string } | null; rev: string };
  history(): { ok: true; entries: StudioHistoryEntry[] };
  /** Rejects with code TIMEOUT when the editor does not settle in time. */
  settled(options?: { timeoutMs?: number }): { ok: true; seq: number; rev: string };
  /** Read-only checks: the font contract lint and the in-syllable ink overlaps. Requests checks deferred outside the edit page and
   * waits for them like `settled`; edits nothing and records nothing. When they do not finish in time, `settled` is false and
   * `overlaps` null. */
  checks(options?: { timeoutMs?: number }): { ok: true; settled: boolean; checksPending: boolean | null;
    lint: { errors: number; warnings: number; findings: unknown[] } | null; overlaps: { glyph: string; a: string; b: string; ratio: number }[] | null;
    rev: string };
  /** `package` is the font package; `project` the same work as project v2; `rev` the font CSS revision (as in every result),
   * `contentRev` the package content fingerprint. */
  snapshot(): { ok: true; package: FontPackage | null; project: FontProject; rev: string; contentRev: string | null };
  /** A package or project v2 opens directly; other old formats (draft, design bundle, design JSON, CSS text) go through the editor's file reader. */
  load(project: FontPackage | FontProject | string | Record<string, unknown>, options?: { timeoutMs?: number }):
    { ok: boolean; refused?: StudioRefusal[]; settled?: boolean; rev: string; kind?: string };
  /** The editor's "저장": the whole font package to the current store. The first save of a shipped font needs `as`
   * (otherwise refused with SAVE_NEEDS_CHOICE and `choices`); `quiet` skips the success message (autosave). */
  save(options?: { as?: "new" | "same"; name?: string; force?: boolean | string; quiet?: boolean }):
    { ok: boolean; refused: StudioRefusal[]; id: string | null; rev: string | null; contentRev?: string | null; file?: string | null;
      choices?: string[]; suggestedName?: string | null };
  setActor(actor: { kind: "human" | "agent"; id?: string | null }): { ok: true; actor: StudioActor };
  "review.record"(entry: { key: string; verdict: "pass" | "needs-fix" | "hold" | null; note?: string; actor?: { kind: "human" | "agent"; id?: string | null } }):
    { ok: boolean; refused: StudioRefusal[]; record: Record<string, unknown> | null };
  "review.list"(): { ok: boolean; refused: StudioRefusal[]; items: StudioReviewItem[] };
  setPage(page: "design" | "edit" | "sheet" | "review"): { ok: boolean; refused: StudioRefusal[]; page: string };
  setMode(mode: "easy" | "precise"): { ok: boolean; refused: StudioRefusal[]; mode: string };
  setText(text: string, options?: { timeoutMs?: number }): { ok: true; settled: boolean; glyphs: number };
  /** 짓는 방식(ADR-034): a preset name, the axes, or null (= auto). Written to the design when the preview applies one,
   * otherwise to the font CSS (--fy-font-composition and the split longhands). One history entry. */
  setComposition(value: StudioCompositionPreset | { preset?: StudioCompositionPreset; vowel?: "split" | "whole" | "syllable" | "";
    coda?: "split" | "whole" | ""; pieces?: "none" | "pieces" | "origins" | "" } | null):
    { ok: boolean; refused: StudioRefusal[]; composition: StudioComposition | null; rev: string };
  /** Cells as { key: svg } / [{ key, svg }], or one text (an AI reply holding several <svg>): each <svg> is named by its
   * data-jamo / id / <title> / the line before it. All cells must be named and clean, or nothing changes. One history entry. */
  "draw.importSvg"(cells: Record<string, string> | { key: string; svg: string }[] | string, options?: { dryRun?: boolean; label?: string }):
    { applied: boolean; dryRun?: boolean; refused: StudioRefusal[]; cells: { key: string | null; ok: boolean; shapes: number; warnings: unknown[]; rejected: unknown[];
      index?: number; state?: "new" | "overwrite" | "unknown" | "duplicate" | "skipped" | "refused"; from?: string | null }[]; rev: string };
}

export type StudioApiMethod = keyof StudioApiCalls;

export interface StudioHandle {
  readonly iframe: HTMLIFrameElement;
  readonly ready: Promise<StudioHandle>;
  exportProject(): Promise<FontProject>;
  /** The whole font as a package (font-kku-font-package v1). */
  exportPackage(): Promise<FontPackage>;
  /** Open a project v2 or a font package. */
  loadProject(project: FontProject | FontPackage): Promise<boolean>;
  getCss(): Promise<string>;
  setText(text: string): Promise<boolean>;
  /** Show word, glyph, glyph-body, and space outlines in the editor previews. */
  setBoundaries(enabled: boolean): Promise<boolean>;
  /** Automation contract v1: the same call as the editor's `FontStudio.api` (data-only methods). */
  call<M extends StudioApiMethod>(method: M, ...args: Parameters<StudioApiCalls[M]>): Promise<ReturnType<StudioApiCalls[M]>>;
  /** Listen to editor events after `ready`. Returns a function that stops listening. */
  on<E extends keyof StudioEvents>(event: E, listener: (detail: StudioEvents[E]) => void): () => void;
  off<E extends keyof StudioEvents>(event: E, listener: (detail: StudioEvents[E]) => void): void;
  /** Idempotently release listeners and requests and remove the editor document. */
  destroy(): void;
}

export function mount(container: Element, options?: MountOptions): StudioHandle;
