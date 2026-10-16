"use strict";

/* Optional authoring entry. These models parse and edit data without loading
 * the renderer or setting up a document. Classic scripts keep their existing
 * globals; applications provide a runtime only to operations that need one. */
module.exports = {
  Model: require("./font-studio-model.js"),
  Lint: require("./font-kku-lint.js"),
  Sheet: require("./font-studio-sheet.js"),
  Design: require("./font-studio-design-model.js"),
  RecipeCatalog: require("./font-studio-recipe-catalog.js"),
  DesignRules: require("./font-studio-design-rules.js"),
  Draw: require("./font-studio-draw-model.js"),
  Bundle: require("./font-studio-bundle-model.js"),
  Palette: require("./font-studio-palette-model.js"),
  Provenance: require("./font-studio-provenance-model.js"),
  Transactions: require("./font-studio-transactions.js"),
  Themes: require("./themes-data.js")
};
