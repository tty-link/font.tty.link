/* ESM entry for the same optional authoring models as index.js. The classic
 * implementations remain usable from a script tag and require no renderer. */
import "./font-studio-model.js";
import "./font-kku-lint.js";
import "./font-studio-sheet.js";
import "./font-studio-design-model.js";
import "./font-studio-recipe-catalog.js";
import "./font-studio-design-rules.js";
import "./font-studio-draw-model.js";
import "./font-studio-bundle-model.js";
import "./font-studio-palette-model.js";
import "./font-studio-provenance-model.js";
import "./font-studio-transactions.js";
import "./themes-data.js";

export const Model = globalThis.FontStudioModel;
export const Lint = globalThis.FontKkuLint;
export const Sheet = globalThis.FontStudioSheet;
export const Design = globalThis.FontStudioDesign;
export const RecipeCatalog = globalThis.FontStudioRecipeCatalog;
export const DesignRules = globalThis.FontStudioDesignRules;
export const Draw = globalThis.FontStudioDrawModel;
export const Bundle = globalThis.FontStudioBundleModel;
export const Palette = globalThis.FontStudioPaletteModel;
export const Provenance = globalThis.FontStudioProvenanceModel;
export const Transactions = globalThis.FontStudioTransactions;
export const Themes = globalThis.FontKkuThemes;

export default {
  Model, Lint, Sheet, Design, RecipeCatalog, DesignRules, Draw, Bundle, Palette,
  Provenance, Transactions, Themes
};
