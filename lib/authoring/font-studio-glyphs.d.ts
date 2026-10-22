import type FontKku = require("../font-kku.js");

declare namespace FontStudioGlyphs {
  type Role = "initial" | "medial" | "final" | "standalone";
  interface Candidate { id: string; text: string; }
  interface Mapping { jamo: string; role?: Role; candidates: Candidate[]; selected?: string; locked?: boolean; }
  interface Target { jamo: string; role?: Role; }
  interface Error { code: string; path: string; message: string; }
  interface Stage {
    id: "origin8" | "basic24" | "full40"; title: string; total: number; ready: number; direct: number; composed: number; fallback: number;
    missing: Array<{ jamo: string; role: Role; reason: string }>;
  }
  interface Progress {
    stages: Stage[];
    items: Array<{ jamo: string; role: Role; status: "missing" | "direct" | "composed" | "fallback"; reason: string; plan: unknown }>;
    complete: boolean;
  }
  const VERSION: "2.0";
  const STAGES: Readonly<Record<"origin8" | "basic24" | "full40", string>>;
  function normalize(design: FontKku.Design): { ok: boolean; design: FontKku.Design; errors: Error[] };
  function create(design: FontKku.Design, sourceId: string, options?: { family?: string }): FontKku.Design;
  function getMapping(design: FontKku.Design, sourceId: string, jamo: string, role?: Role): Mapping | null;
  function withMapping(design: FontKku.Design, sourceId: string, mapping: Mapping): FontKku.Design;
  function update(design: FontKku.Design, sourceId: string, target: Target, patch: Partial<Omit<Mapping, "selected">> & { selected?: string | null }): FontKku.Design;
  function remove(design: FontKku.Design, sourceId: string, target: Target): FontKku.Design;
  function removeMapping(design: FontKku.Design, sourceId: string, jamo: string, role?: Role): FontKku.Design;
  function capability(design: FontKku.Design, target: string): { supported: boolean; code: string | null; reason: string };
  function progress(design: FontKku.Design, runtime: {
    registerDesign(name: string, design: FontKku.Design, options?: { replace?: boolean }): unknown;
    planJamo(jamo: string, options: Record<string, unknown>): unknown;
  }, options?: { name?: string; seedValue?: number }): Progress;
}
export = FontStudioGlyphs;
export as namespace FontStudioGlyphs;
