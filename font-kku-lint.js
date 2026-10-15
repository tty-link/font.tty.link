/* font-kku-lint.js — 폰트 CSS 계약 v2 린트 (ADR-008 §9, skills/font-kku/references/authoring.md §2.1a)
 *
 * 폰트 CSS 한 파일을 Font Studio 파서(FontStudioModel.parse)로 읽어 계약 위반을
 * 줄 번호와 함께 돌려준다. 판정은 브라우저 캐스케이드와 같은 파서·셀렉터 해석
 * 위에서 한다 — 중첩(@media/@supports/CSS nesting/@layer), 속성 이름 대소문자,
 * 연산자·공백 변형, :is()/:where()/:not()/:has()를 문법으로 읽고 부분 문자열로
 * 추측하지 않는다.
 *
 * Node(scripts/check_css_contract.js, tests)와 file://로 연 Font Studio가 같은
 * 코드를 쓴다. classic script라 JSON을 읽지 않고, 레지스트리 요약(DIGEST)은
 * `node scripts/check_css_contract.js --write`가 아래 생성 블록에 쓴다(--check가
 * stale을 거부한다).
 *
 *   FontKkuLint.lint(cssText, { fileName, digest }) →
 *     [{ severity: "error" | "warning", code, message, line, column }]
 *
 * fileName(예: "sebul.css")을 주면 폰트 id가 파일 이름과 같아야 하고, 그 이름이
 * spec/fonts.json의 alias면 alias shim 문법으로 검사한다. digest는 테스트용
 * 대체 레지스트리다(기본값은 생성 블록).
 */
(function (global) {
  "use strict";

  var Model = global.FontStudioModel || (typeof require === "function" ? require("./font-studio-model.js") : null);

  // BEGIN GENERATED CSS CONTRACT: lint-registry
  // Source: spec/css-variables.json, spec/fonts.json. Regenerate with:
  // node scripts/check_css_contract.js --write
  var DIGEST = {
    registryVersion: "2.1",
    contract: "2",
    layers: ["font-kku.font", "font-kku.jamo", "font-kku.context"],
    aliases: { "classic": "sebul", "default": "sebul", "gothic2": "gothic" },
    slotSuffixes: [
      { suffix: "top", dispatch: "top", type: "length-percentage", roleFallback: true },
      { suffix: "left", dispatch: "left", type: "length-percentage", roleFallback: true },
      { suffix: "size", dispatch: "font-size", type: "length-percentage", roleFallback: true },
      { suffix: "scale-x", dispatch: "scale-x", type: "number", roleFallback: true },
      { suffix: "scale-y", dispatch: "scale-y", type: "number", roleFallback: true },
      { suffix: "rotate", dispatch: "rotate", type: "angle", roleFallback: true },
      { suffix: "weight", dispatch: "weight", type: "font-weight", roleFallback: true },
      { suffix: "stroke", dispatch: "stroke", type: "length", roleFallback: true },
      { suffix: "clip", dispatch: "clip", type: "clip-path", roleFallback: true },
      { suffix: "dilate", dispatch: "dilate", type: "filter", roleFallback: true }
    ],
    pageOnly: [
      "--fy-jamo-depth",
      "--fy-vowel-depth",
      "--fy-coda-depth",
      "--fy-sprite-filter",
      "--fy-vector-stroke",
      "--fy-stroke-depth",
      "--fy-hoek-dx",
      "--fy-hoek-dy",
      "--fy-hoek-rotate",
      "--fy-hoek-scale-x",
      "--fy-hoek-scale-y",
      "--fy-glow",
      "--fy-ink-boxes",
      "--fy-face",
      "--fy-design",
      "--fy-element-width",
      "--fy-element-cap",
      "--fy-element-fill",
      "--fy-selection",
      "--fy-element-outline",
      "--fy-element-weight",
      "--fy-optical-sprite-zoom",
      "--fy-optical-sprite-crop-x",
      "--fy-optical-sprite-crop-y",
      "--fy-optical-sprite-filter",
      "--fy-top",
      "--fy-left",
      "--fy-font-size",
      "--fy-weight",
      "--fy-stroke",
      "--fy-clip",
      "--fy-scale-x",
      "--fy-scale-y",
      "--fy-rotate"
    ],
    /* name: [level, scope, declaredBy, type, status, values?] */
    variables: {
      "--fy-size": ["runtime", "host", "runtime", "length", "stable"],
      "--fy-font-family": ["font", "host", "font", "font-family", "stable"],
      "--fy-font-weight": ["font", "host", "font", "font-weight", "stable"],
      "--fy-font-stroke": ["font", "host", "font", "length", "stable"],
      "--fy-glyph-width": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-glyph-height": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-glyph-gap": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-line-gap": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-word-gap": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-space-width": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-space-count": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-glyph-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-expression-mode": ["font", "host", "font", "keyword", "stable", ["sebeol", "general"]],
      "--fy-font-jamo-depth": ["font", "host", "font", "keyword", "stable", ["atomic", "composite", "syllable"]],
      "--fy-jamo-depth": ["page", "page", "page", "keyword", "stable", ["atomic", "composite", "syllable"]],
      "--fy-font-vowel-depth": ["font", "host", "font", "keyword", "stable", ["split", "whole", "syllable"]],
      "--fy-vowel-depth": ["page", "page", "page", "keyword", "stable", ["split", "whole", "syllable"]],
      "--fy-font-coda-depth": ["font", "host", "font", "keyword", "stable", ["split", "whole"]],
      "--fy-coda-depth": ["page", "page", "page", "keyword", "stable", ["split", "whole"]],
      "--fy-font-id": ["font", "host", "font", "keyword", "stable"],
      "--fy-contract": ["font", "host", "font", "integer", "stable"],
      "--fy-material": ["font", "host", "font", "keyword", "stable"],
      "--fy-seed": ["runtime", "host", "runtime", "number", "stable"],
      "--fy-line-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-word-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-jamo-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-jamo-seed": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-sprite-jamo-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-sprite-zoom": ["font", "host", "font", "number", "stable"],
      "--fy-sprite-crop-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-sprite-crop-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-sprite-filter": ["page", "page", "page", "filter", "stable"],
      "--fy-sprite-row": ["font", "node", "font", "integer", "stable"],
      "--fy-sprite-url": ["font", "host", "font", "url", "stable"],
      "--fy-sprite-url-2x": ["font", "host", "font", "url", "stable"],
      "--fy-sprite-url-3x": ["font", "host", "font", "url", "stable"],
      "--fy-sprite-image": ["font", "host", "font", "image", "stable"],
      "--fy-sprite-cell": ["font", "host", "font", "length", "stable"],
      "--fy-sprite-cols": ["font", "host", "font", "integer", "stable"],
      "--fy-sprite-rows": ["font", "host", "font", "integer", "stable"],
      "--fy-sprite-dilate": ["font", "host", "font", "filter", "stable"],
      "--fy-vector-stroke": ["page", "page", "page", "length", "stable"],
      "--fy-vector-stroke-cells": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-stroke-depth": ["page", "page", "page", "keyword", "stable", ["jamo", "stroke"]],
      "--fy-hoek-dx": ["page", "page", "page", "number", "stable"],
      "--fy-hoek-dy": ["page", "page", "page", "number", "stable"],
      "--fy-hoek-rotate": ["page", "page", "page", "angle", "stable"],
      "--fy-hoek-scale-x": ["page", "page", "page", "number", "stable"],
      "--fy-hoek-scale-y": ["page", "page", "page", "number", "stable"],
      "--fy-hoek-index": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-hoek-order": ["runtime", "node", "runtime", "integer", "stable"],
      "--fy-sprite-paint": ["font", "host", "font", "keyword", "stable", ["image", "mask"]],
      "--fy-font-glow": ["font", "host", "font", "filter", "stable"],
      "--fy-ink-visibility": ["runtime", "node", "runtime", "keyword", "stable", ["visible", "hidden"]],
      "--fy-glow": ["page", "page", "page", "filter", "stable"],
      "--fy-font-ink-boxes": ["font", "host", "font", "keyword", "stable", ["none", "standard"]],
      "--fy-ink-boxes": ["page", "page", "page", "keyword", "stable", ["none", "standard"]],
      "--fy-face-glyph": ["runtime", "node", "runtime", "string", "stable"],
      "--fy-face-size": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-face-x": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-face-y": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-face-scale-x": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-face-scale-y": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-leaf-size": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-leaf-x": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-leaf-y": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-leaf-scale-x": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-leaf-scale-y": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-face-width": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-stamp-density": ["runtime", "node", "runtime", "number", "internal"],
      "--fy-stamp-left": ["runtime", "node", "runtime", "length-percentage", "internal"],
      "--fy-stamp-scale-x": ["runtime", "node", "runtime", "number", "internal"],
      "--fy-stamp-scale-y": ["runtime", "node", "runtime", "number", "internal"],
      "--fy-stamp-size": ["runtime", "node", "runtime", "length", "internal"],
      "--fy-stamp-stroke": ["runtime", "node", "runtime", "length", "internal"],
      "--fy-stamp-top": ["runtime", "node", "runtime", "length-percentage", "internal"],
      "--fy-stamp-weight": ["runtime", "node", "runtime", "font-weight", "internal"],
      "--fy-font-face": ["font", "host", "font", "keyword", "stable", ["device", "element", "svg"]],
      "--fy-face": ["page", "page", "page", "keyword", "stable", ["device", "element", "svg"]],
      "--fy-font-design": ["font", "host", "font", "keyword", "stable"],
      "--fy-font-layout": ["font", "host", "font", "keyword", "stable"],
      "--fy-design": ["page", "page", "page", "keyword", "stable"],
      "--fy-font-element-width": ["font", "host", "font", "length", "stable"],
      "--fy-element-width": ["page", "page", "page", "length", "stable"],
      "--fy-font-element-cap": ["font", "host", "font", "keyword", "stable", ["square", "round", "butt"]],
      "--fy-element-cap": ["page", "page", "page", "keyword", "stable", ["square", "round", "butt"]],
      "--fy-font-element-fill": ["font", "host", "font", "color", "stable"],
      "--fy-element-fill": ["page", "page", "page", "color", "stable"],
      "--fy-selection": ["page", "page", "page", "color", "stable"],
      "--fy-font-element-outline": ["font", "host", "font", "length", "stable"],
      "--fy-element-outline": ["page", "page", "page", "length", "stable"],
      "--fy-element-weight": ["page", "page", "page", "number", "stable"],
      "--fy-el-x": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-y": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-len": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-angle": ["runtime", "node", "runtime", "angle", "stable"],
      "--fy-el-s": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-e": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-k": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-kd": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-cx": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-cy": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-rx": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-ry": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-kx": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-ky": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-density": ["runtime", "node", "runtime", "number", "stable"],
      "--fy-el-w": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-o": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-t": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-d": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-tx": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-ty": ["dispatch", "node", "core", "length", "internal"],
      "--fy-el-bw": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-el-bh": ["runtime", "node", "runtime", "length", "stable"],
      "--fy-sprite-fill": ["font", "host", "font", "image", "stable"],
      "--fy-sprite-rendering": ["font", "host", "font", "keyword", "stable"],
      "--fy-sprite-kinds": ["font", "host", "font", "keyword", "stable"],
      "--fy-optical-sprite-zoom": ["page", "page", "page", "number", "stable"],
      "--fy-optical-sprite-crop-x": ["page", "page", "page", "length-percentage", "stable"],
      "--fy-optical-sprite-crop-y": ["page", "page", "page", "length-percentage", "stable"],
      "--fy-optical-sprite-filter": ["page", "page", "page", "filter", "stable"],
      "--fy-body-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-body-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-body-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-body-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-body-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-body-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-body-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-top": ["page", "page", "page", "length-percentage", "stable"],
      "--fy-left": ["page", "page", "page", "length-percentage", "stable"],
      "--fy-font-size": ["page", "page", "page", "length-percentage", "stable"],
      "--fy-weight": ["page", "page", "page", "font-weight", "stable"],
      "--fy-stroke": ["page", "page", "page", "length", "stable"],
      "--fy-clip": ["page", "page", "page", "clip-path", "stable"],
      "--fy-scale-x": ["page", "page", "page", "number", "stable"],
      "--fy-scale-y": ["page", "page", "page", "number", "stable"],
      "--fy-rotate": ["page", "page", "page", "angle", "stable"],
      "--fy-jamo-dx": ["jamo", "node", "font", "length-percentage", "stable"],
      "--fy-jamo-dy": ["jamo", "node", "font", "length-percentage", "stable"],
      "--fy-jamo-scale-x": ["jamo", "node", "font", "number", "stable"],
      "--fy-jamo-scale-y": ["jamo", "node", "font", "number", "stable"],
      "--fy-jamo-rotate": ["jamo", "node", "font", "angle", "stable"],
      "--fy-ctx-dx": ["context", "node", "font", "length-percentage", "stable"],
      "--fy-ctx-dy": ["context", "node", "font", "length-percentage", "stable"],
      "--fy-ctx-scale-x": ["context", "node", "font", "number", "stable"],
      "--fy-ctx-scale-y": ["context", "node", "font", "number", "stable"],
      "--fy-ctx-rotate": ["context", "node", "font", "angle", "stable"],
      "--fy-content-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-content-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-content-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-content-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-content-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-content-size": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-content-side-bearing": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-content-advance": ["font", "host", "font", "keyword", "stable"],
      "--fy-content-stroke": ["font", "host", "font", "length", "stable"],
      "--fy-cluster-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-cluster-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-cluster-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-cluster-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-cluster-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-cluster-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-cluster-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jung-cluster-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-open-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-open-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-open-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-open-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-open-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jung-cluster-open-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-open-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-closed-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-closed-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-closed-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-closed-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jung-cluster-closed-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jung-cluster-closed-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jung-cluster-closed-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jong-cluster-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-right-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-right-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-right-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-right-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-right-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jong-cluster-right-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-right-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-bottom-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-bottom-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-bottom-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-bottom-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-bottom-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jong-cluster-bottom-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-bottom-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-split-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-split-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-split-scale-x": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-split-scale-y": ["font", "host", "font", "number", "stable"],
      "--fy-jong-cluster-split-rotate": ["font", "host", "font", "angle", "stable"],
      "--fy-jong-cluster-split-origin-x": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-jong-cluster-split-origin-y": ["font", "host", "font", "length-percentage", "stable"],
      "--fy-slot-top": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-role-top": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-slot-left": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-role-left": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-slot-font-size": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-role-font-size": ["dispatch", "node", "core", "length-percentage", "internal"],
      "--fy-slot-scale-x": ["dispatch", "node", "core", "number", "internal"],
      "--fy-role-scale-x": ["dispatch", "node", "core", "number", "internal"],
      "--fy-slot-scale-y": ["dispatch", "node", "core", "number", "internal"],
      "--fy-role-scale-y": ["dispatch", "node", "core", "number", "internal"],
      "--fy-slot-rotate": ["dispatch", "node", "core", "angle", "internal"],
      "--fy-role-rotate": ["dispatch", "node", "core", "angle", "internal"],
      "--fy-slot-weight": ["dispatch", "node", "core", "font-weight", "internal"],
      "--fy-role-weight": ["dispatch", "node", "core", "font-weight", "internal"],
      "--fy-slot-stroke": ["dispatch", "node", "core", "length", "internal"],
      "--fy-role-stroke": ["dispatch", "node", "core", "length", "internal"],
      "--fy-slot-clip": ["dispatch", "node", "core", "clip-path", "internal"],
      "--fy-role-clip": ["dispatch", "node", "core", "clip-path", "internal"],
      "--fy-slot-dilate": ["dispatch", "node", "core", "filter", "internal"],
      "--fy-role-dilate": ["dispatch", "node", "core", "filter", "internal"],
      "--fy-head-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-head-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-head-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-head-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-head-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-head-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-head-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-head-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-head-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-head-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-choseong-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-choseong-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-choseong-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-choseong-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-choseong-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-choseong-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-choseong-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-choseong-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-choseong-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-choseong-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jung-main-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-main-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-main-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-main-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jung-main-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jung-main-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jung-main-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jung-main-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jung-main-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jung-main-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jung-base-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-base-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-base-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-base-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jung-base-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jung-base-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jung-base-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jung-base-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jung-base-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jung-base-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jung-tail-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-tail-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-tail-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jung-tail-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jung-tail-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jung-tail-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jung-tail-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jung-tail-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jung-tail-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jung-tail-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jong-main-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-main-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-main-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-main-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jong-main-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jong-main-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jong-main-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jong-main-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jong-main-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jong-main-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jong-left-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-left-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-left-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-left-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jong-left-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jong-left-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jong-left-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jong-left-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jong-left-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jong-left-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-jong-right-top": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-right-left": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-right-size": ["role", "host", "font", "length-percentage", "stable"],
      "--fy-jong-right-scale-x": ["role", "host", "font", "number", "stable"],
      "--fy-jong-right-scale-y": ["role", "host", "font", "number", "stable"],
      "--fy-jong-right-rotate": ["role", "host", "font", "angle", "stable"],
      "--fy-jong-right-weight": ["role", "host", "font", "font-weight", "stable"],
      "--fy-jong-right-stroke": ["role", "host", "font", "length", "stable"],
      "--fy-jong-right-clip": ["role", "host", "font", "clip-path", "stable"],
      "--fy-jong-right-dilate": ["role", "host", "font", "filter", "stable"],
      "--fy-tc-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tc-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tc-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tc-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tc-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tc-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tc-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tc-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tc-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tc-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-t-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-t-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-t-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-t-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-t-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-t-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-t-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-t-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-t-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-t-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tt-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tt-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tt-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tt-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tt-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tt-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tt-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tt-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tt-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tt-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tlo-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlo-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlo-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlo-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tlo-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tlo-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tlo-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tlo-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tlo-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tlo-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tlc-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlc-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlc-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tlc-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tlc-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tlc-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tlc-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tlc-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tlc-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tlc-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tls-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tls-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tls-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tls-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tls-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tls-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tls-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tls-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tls-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tls-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-ttl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-ttl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-ttl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-ttl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-ttl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-ttl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-ttl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-h-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-h-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-h-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-h-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-h-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-h-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-h-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-h-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-h-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-h-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-hs-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hs-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hs-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hs-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-hs-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-hs-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-hs-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-hs-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-hs-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-hs-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-hts-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hts-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hts-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-hts-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-hts-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-hts-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-hts-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-hts-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-hts-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-hts-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tr-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tr-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tr-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tr-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tr-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tr-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tr-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tr-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tr-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tr-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-tro-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tro-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tro-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-tro-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-tro-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-tro-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-tro-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-tro-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-tro-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-tro-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-trc-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trc-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trc-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trc-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-trc-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-trc-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-trc-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-trc-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-trc-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-trc-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mc-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mc-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mc-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mc-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mc-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mc-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mc-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mc-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mc-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mc-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-m-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-m-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-m-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-m-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-m-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-m-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-m-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-m-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-m-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-m-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mt-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mt-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mt-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mt-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mt-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mt-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mt-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mt-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mt-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mt-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mx-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mx-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mx-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mx-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mx-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mx-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mx-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mx-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mx-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mx-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mw-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mw-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mw-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mw-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mw-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mw-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mw-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mw-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mw-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mw-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mtw-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtw-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtw-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtw-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mtw-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mtw-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mtw-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mtw-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mtw-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mtw-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-xb-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xb-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xb-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xb-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-xb-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-xb-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-xb-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-xb-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-xb-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-xb-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-ml-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ml-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ml-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ml-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-ml-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-ml-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-ml-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-ml-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-ml-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-ml-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-mtl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-mtl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-mtl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-mtl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-mtl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-mtl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-mtl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-mtl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-xt-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xt-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xt-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xt-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-xt-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-xt-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-xt-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-xt-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-xt-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-xt-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-trs-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trs-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trs-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-trs-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-trs-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-trs-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-trs-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-trs-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-trs-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-trs-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-ttr-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttr-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttr-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-ttr-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-ttr-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-ttr-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-ttr-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-ttr-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-ttr-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-ttr-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bs-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bs-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bs-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bs-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bs-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bs-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bs-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bs-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bs-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bs-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-b-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-b-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-b-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-b-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-b-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-b-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-b-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-b-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-b-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-b-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-brs-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brs-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brs-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brs-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-brs-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-brs-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-brs-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-brs-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-brs-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-brs-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bbrs-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrs-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrs-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrs-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bbrs-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bbrs-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bbrs-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bbrs-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bbrs-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bbrs-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bx-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bx-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bx-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bx-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bx-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bx-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bx-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bx-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bx-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bx-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bw-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bw-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bw-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bw-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bw-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bw-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bw-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bw-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bw-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bw-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-brw-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brw-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brw-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brw-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-brw-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-brw-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-brw-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-brw-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-brw-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-brw-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bbw-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbw-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbw-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbw-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bbw-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bbw-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bbw-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bbw-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bbw-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bbw-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-xl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-xl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-xl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-xl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-xl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-xl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-xl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-blr-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-blr-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-blr-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-blr-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-blr-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-blr-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-blr-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-blr-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-blr-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-blr-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bbl-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbl-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbl-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbl-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bbl-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bbl-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bbl-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bbl-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bbl-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bbl-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-xr-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xr-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xr-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-xr-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-xr-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-xr-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-xr-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-xr-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-xr-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-xr-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-br-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-br-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-br-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-br-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-br-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-br-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-br-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-br-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-br-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-br-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-brd-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brd-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brd-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-brd-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-brd-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-brd-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-brd-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-brd-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-brd-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-brd-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-bbrd-top": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrd-left": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrd-size": ["slot", "host", "font", "length-percentage", "stable"],
      "--fy-bbrd-scale-x": ["slot", "host", "font", "number", "stable"],
      "--fy-bbrd-scale-y": ["slot", "host", "font", "number", "stable"],
      "--fy-bbrd-rotate": ["slot", "host", "font", "angle", "stable"],
      "--fy-bbrd-weight": ["slot", "host", "font", "font-weight", "stable"],
      "--fy-bbrd-stroke": ["slot", "host", "font", "length", "stable"],
      "--fy-bbrd-clip": ["slot", "host", "font", "clip-path", "stable"],
      "--fy-bbrd-dilate": ["slot", "host", "font", "filter", "stable"],
      "--fy-blb-top": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-blb-left": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-blb-size": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-blb-scale-x": ["slot", "host", "font", "number", "reserved"],
      "--fy-blb-scale-y": ["slot", "host", "font", "number", "reserved"],
      "--fy-blb-rotate": ["slot", "host", "font", "angle", "reserved"],
      "--fy-blb-weight": ["slot", "host", "font", "font-weight", "reserved"],
      "--fy-blb-stroke": ["slot", "host", "font", "length", "reserved"],
      "--fy-blb-clip": ["slot", "host", "font", "clip-path", "reserved"],
      "--fy-blb-dilate": ["slot", "host", "font", "filter", "reserved"],
      "--fy-brb-top": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-brb-left": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-brb-size": ["slot", "host", "font", "length-percentage", "reserved"],
      "--fy-brb-scale-x": ["slot", "host", "font", "number", "reserved"],
      "--fy-brb-scale-y": ["slot", "host", "font", "number", "reserved"],
      "--fy-brb-rotate": ["slot", "host", "font", "angle", "reserved"],
      "--fy-brb-weight": ["slot", "host", "font", "font-weight", "reserved"],
      "--fy-brb-stroke": ["slot", "host", "font", "length", "reserved"],
      "--fy-brb-clip": ["slot", "host", "font", "clip-path", "reserved"],
      "--fy-brb-dilate": ["slot", "host", "font", "filter", "reserved"],
      "--fy-bb-top": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bb-left": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bb-size": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bb-scale-x": ["slot", "host", "font", "number", "deprecated"],
      "--fy-bb-scale-y": ["slot", "host", "font", "number", "deprecated"],
      "--fy-bb-rotate": ["slot", "host", "font", "angle", "deprecated"],
      "--fy-bb-weight": ["slot", "host", "font", "font-weight", "deprecated"],
      "--fy-bb-stroke": ["slot", "host", "font", "length", "deprecated"],
      "--fy-bb-clip": ["slot", "host", "font", "clip-path", "deprecated"],
      "--fy-bb-dilate": ["slot", "host", "font", "filter", "deprecated"],
      "--fy-bbr-top": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bbr-left": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bbr-size": ["slot", "host", "font", "length-percentage", "deprecated"],
      "--fy-bbr-scale-x": ["slot", "host", "font", "number", "deprecated"],
      "--fy-bbr-scale-y": ["slot", "host", "font", "number", "deprecated"],
      "--fy-bbr-rotate": ["slot", "host", "font", "angle", "deprecated"],
      "--fy-bbr-weight": ["slot", "host", "font", "font-weight", "deprecated"],
      "--fy-bbr-stroke": ["slot", "host", "font", "length", "deprecated"],
      "--fy-bbr-clip": ["slot", "host", "font", "clip-path", "deprecated"],
      "--fy-bbr-dilate": ["slot", "host", "font", "filter", "deprecated"]
    }
  };
  // END GENERATED CSS CONTRACT: lint-registry

  var LAYERS = ["font-kku.font", "font-kku.jamo", "font-kku.context"];
  var FONT_LAYER = LAYERS[0];
  var JAMO_LAYER = LAYERS[1];
  var CONTEXT_LAYER = LAYERS[2];

  /* Every finding code. The message says what to do; the code is stable
   * (tests, Studio data-code, docs). */
  var CODES = {
    syntax: "CSS 구문 오류 — 브라우저가 복구하거나 버리는 부분",
    "layer-statement": "첫 문장은 @layer font-kku.font, font-kku.jamo, font-kku.context; 이다",
    "top-level": "최상위에는 세 레이어 블록과 @font-face만 둔다",
    import: "폰트는 @import를 쓰지 않는다(alias shim만 예외)",
    "alias-shim": "alias shim은 대상 폰트의 @import \"./<대상>.css\"; 한 줄뿐이다",
    "layer-name": "레이어 블록은 font-kku.font / font-kku.jamo / font-kku.context 셋뿐이다",
    "anonymous-layer": "이름 없는 @layer 블록은 쓸 수 없다",
    "nested-layer": "레이어 안에 @layer를 다시 두지 않는다",
    condition: "레이어 안 조건부 그룹은 @media·@supports뿐이다(Studio가 평가할 수 없는 조건 금지)",
    "at-rule": "레이어 안에는 스타일 규칙과 @media·@supports만 둔다",
    nesting: "CSS nesting(중첩 규칙, &)은 쓸 수 없다",
    important: "!important는 쓸 수 없다(레이어 순서가 뒤집혀 페이지 CSS를 이긴다)",
    scope: "모든 셀렉터는 :where([data-fy-font=\"<id>\"])로 시작한다",
    selector: "폰트 셀렉터는 런타임 DOM 계약의 속성과 :is/:where/:not/:has만 쓴다",
    subject: "규칙의 대상은 host이거나 자모 노드다",
    "context-subject": "문맥 규칙의 대상은 조상이 아니라 자모 노드다",
    "layer-mismatch": "규칙은 셀렉터가 정하는 레벨의 레이어에 둔다",
    "custom-property": "폰트가 선언하는 사용자 정의 속성은 등록된 --fy-* 변수뿐이다",
    "unknown-variable": "레지스트리에 없는 --fy-* 변수",
    "page-variable": "페이지 전용 변수는 폰트가 선언하지 않는다",
    "runtime-variable": "런타임이 쓰는 변수는 폰트가 선언하지 않는다",
    "core-variable": "코어 디스패치 변수는 폰트가 선언하지 않는다",
    "retired-slot": "deprecated·reserved slot 변수는 어느 체인에도 없다",
    "variable-scope": "변수의 scope(host/node)와 규칙 대상이 맞아야 한다",
    "variable-layer": "누적 보정 변수는 자기 레벨 레이어에서만 선언한다",
    property: "폰트가 직접 선언하는 속성은 칠하기·글꼴 기능 허용 목록뿐이다",
    "value-type": "값이 레지스트리 type과 맞지 않는다",
    "unitless-zero": "길이 변수에 단위 없는 0을 쓰지 않는다",
    url: "폰트 자산 url()은 폰트 파일 기준 상대 경로(또는 data:)다",
    "font-face": "@font-face에는 font-family와 상대 경로 src가 있어야 한다",
    "font-id": "--fy-font-id와 scope id, 파일 이름이 같아야 한다",
    "font-id-case": "폰트 id(scope·--fy-font-id·파일 이름)는 소문자다 — 런타임이 data-fy-font를 소문자로 찍는다",
    contract: "--fy-contract: 2를 선언한다",
    material: "--fy-material: system | sprite | bundled를 선언한다",
    "sprite-sheet": "sprite 재료는 --fy-sprite-url(또는 --fy-sprite-image)을 선언한다",
    "sprite-kinds": "sprite 재료는 --fy-sprite-kinds를 선언한다"
  };

  // ── DOM contract (skills/font-kku/references/dom-contract.md §2.3·§4·§5) ──

  /* Host output surface a font may add as a condition inside its scope :where. data-fy-face (ADR-024)
   * lets a font paint the element / svg faces apart from its glyph paint — text-shadow and text-stroke
   * do not reach drawn strokes, so a paint-only font gives them colour and --fy-font-* paint there. */
  var HOST_ATTRIBUTES = [
    "data-fy-upgraded", "data-fy-host", "data-fy-expression", "data-fy-vowel-depth", "data-fy-coda-depth",
    "data-fy-material", "data-fy-sprite-kinds", "data-fy-size", "data-fy-spacing", "data-fy-wrap-unit",
    "data-fy-animate", "data-fy-seed", "data-fy-jamo-seeds", "data-fy-face"
  ];
  /* Jamo node attributes. Slot/role/kind conditions belong to the font layer,
   * identity conditions to the jamo layer. */
  var NODE_SLOT_ATTRIBUTES = ["data-fy-pos", "data-fy-role", "data-jamo-role", "data-sprite-jamo-kind"];
  var NODE_IDENTITY_ATTRIBUTES = ["data-jamo", "data-jamo-base", "data-jamo-index", "data-sprite-jamo", "data-sprite-jamo-index"];
  /* Semantic frame of the whole syllable, stamped on the glyph, cluster
   * wrappers and jamo nodes alike: always a context condition. */
  var FRAME_ATTRIBUTES = ["data-fy-axis", "data-fy-open", "data-fy-jong-count"];
  /* Attributes that exist only on wrappers (glyph topology, line/word/space). */
  var WRAPPER_ATTRIBUTES = [
    "data-layout-key", "data-jung-layout", "data-jong-layout", "data-fy-layout-bucket", "data-hangul",
    "data-glyph-kind", "data-glyph-index", "data-source", "data-line-index", "data-word-index",
    "data-space-kind", "data-empty", "data-fy-root", "data-fy-sr"
  ];
  var JAMO_PART_TOKENS = [
    "jamo", "head", "choseong", "jungseong", "jungseong-base", "jungseong-tail", "jongseong",
    "jongseong-left", "jongseong-right"
  ];
  var WRAPPER_PART_TOKENS = [
    "root", "sr-source", "line", "word", "space", "glyph", "glyph-body", "cluster", "jungseong-cluster",
    "jongseong-cluster", "content"
  ];
  /* Sibling-position pseudo-classes: conditions on the neighbourhood. */
  var STRUCTURAL_PSEUDO = [
    "first-child", "last-child", "only-child", "nth-child", "nth-last-child", "first-of-type",
    "last-of-type", "only-of-type", "nth-of-type", "nth-last-of-type", "empty"
  ];
  var SUPPORTED_CONDITIONS = ["media", "supports"];

  // ── Property allowlist ──────────────────────────────────────────────────
  /* The core rules are unlayered, so a font cannot win on any property the
   * core declares, and anything that moves, sizes, transforms, clips, strokes
   * or paints the box of a jamo node (position, inset, margin, padding, size,
   * transform and the individual translate/rotate/scale, zoom, offset-*,
   * writing-mode, direction, spacing, font-size/weight/family, line-height,
   * -webkit-text-stroke(-width), clip-path, mask, background, filter …)
   * belongs to the core and is reached through level variables only. What a
   * font may declare directly is the paint of the glyph ink and, on the host,
   * font features the jamo nodes inherit (the core gives nodes `font: inherit`). */
  var PAINT_PROPERTIES = [
    "color", "-webkit-text-fill-color", "-webkit-text-stroke-color", "text-shadow", "paint-order", "opacity",
    "text-decoration", "text-decoration-line", "text-decoration-color", "text-decoration-style",
    "text-decoration-thickness", "text-decoration-skip-ink", "text-underline-offset", "text-underline-position"
  ];
  var HOST_TEXT_PROPERTIES = [
    "font-feature-settings", "font-variation-settings", "font-kerning", "font-variant", "font-variant-ligatures",
    "font-variant-caps", "font-variant-numeric", "font-variant-east-asian", "font-variant-alternates",
    "font-variant-position", "font-variant-emoji", "font-optical-sizing", "font-synthesis", "font-synthesis-weight",
    "font-synthesis-style", "font-synthesis-small-caps", "font-synthesis-position", "font-palette",
    "font-language-override", "font-style", "font-stretch", "font-width", "text-rendering",
    "-webkit-font-smoothing", "-moz-osx-font-smoothing", "font-smooth"
  ];
  var CORE_GEOMETRY = /^(?:-webkit-)?(?:margin|padding|inset|top|left|right|bottom|position|transform|translate|rotate|scale|zoom|offset|font|font-size|font-weight|font-family|line-height|text-stroke|clip|clip-path|mask|background|filter|backdrop-filter|inline-size|block-size|width|height|min-|max-|overflow|display|writing-mode|direction|letter-spacing|word-spacing|white-space|vertical-align|perspective|contain|content|float|all)/;
  var CORE_OWNED_HINT = "레벨 변수로 코어와 통신합니다 — 위치 --fy-<slot>-top/left·--fy-jamo-dx/dy·--fy-ctx-dx/dy, 크기 --fy-<slot>-size, 변형 --fy-<slot>-scale-x/y·rotate, 굵기·획 --fy-<slot>-weight/stroke·--fy-font-weight/stroke, 잘라내기 --fy-<slot>-clip, sprite 획 --fy-<slot>-dilate";

  // ── Small helpers ──────────────────────────────────────────────────────

  function has(list, value) {
    return list.indexOf(value) >= 0;
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function fontIdFromFile(fileName) {
    if (!fileName) {
      return null;
    }
    var base = String(fileName).split(/[\\/]/).pop();
    return base.replace(/\.css$/i, "");
  }

  /* Font names are trimmed and ASCII-case-insensitive; the runtime stamps
   * the lowercase name in data-fy-font (font-kku.js foldFontName). */
  function foldCase(value) {
    return String(value == null ? "" : value).replace(/[A-Z]+/g, function (letters) { return letters.toLowerCase(); });
  }

  function caseMessage(id, where) {
    return where + " \"" + id + "\"에 대문자가 있습니다 — 런타임은 폰트 이름을 ASCII 소문자로 정규화해 host에 data-fy-font=\"" + foldCase(id) +
      "\"로 찍으므로 대문자 id의 scope는 어떤 host에도 맞지 않습니다. scope·--fy-font-id·파일 이름을 \"" + foldCase(id) + "\"로 씁니다";
  }

  function shorten(text, limit) {
    var value = String(text).replace(/\s+/g, " ").trim();
    var max = limit || 90;
    return value.length > max ? value.slice(0, max - 1) + "…" : value;
  }

  /* Comments removed, strings kept intact. */
  function stripComments(value) {
    var text = String(value);
    var out = "";
    for (var index = 0; index < text.length; index += 1) {
      var char = text[index];
      if (char === "/" && text[index + 1] === "*") {
        var close = text.indexOf("*/", index + 2);
        index = close < 0 ? text.length : close + 1;
        out += " ";
        continue;
      }
      if (char === '"' || char === "'") {
        var end = index + 1;
        while (end < text.length && text[end] !== char) {
          end += text[end] === "\\" ? 2 : 1;
        }
        out += text.slice(index, end + 1);
        index = end;
        continue;
      }
      out += char;
    }
    return out.trim();
  }

  function unquote(value) {
    var text = String(value).trim();
    if (text.length >= 2 && (text[0] === '"' || text[0] === "'") && text[text.length - 1] === text[0]) {
      return text.slice(1, -1);
    }
    return text;
  }

  // ── Value tokens ───────────────────────────────────────────────────────
  /* A small CSS component-value tokenizer: enough to type-check registry
   * values and to find url() and var() anywhere in a value. */

  var NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

  function isNameStart(char) {
    return /[A-Za-z_\u0080-￿\\]/.test(char || "");
  }

  function readName(text, index) {
    var cursor = index;
    while (cursor < text.length) {
      if (text[cursor] === "\\") {
        cursor += 2;
      } else if (/[\w\u0080-￿-]/.test(text[cursor])) {
        cursor += 1;
      } else {
        break;
      }
    }
    return cursor;
  }

  function closingParen(text, open) {
    var depth = 0;
    for (var index = open; index < text.length; index += 1) {
      var char = text[index];
      if (char === "\\") {
        index += 1;
      } else if (char === '"' || char === "'") {
        var end = index + 1;
        while (end < text.length && text[end] !== char) {
          end += text[end] === "\\" ? 2 : 1;
        }
        index = end;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return text.length;
  }

  function tokenize(value) {
    var text = String(value);
    var tokens = [];
    var index = 0;
    while (index < text.length) {
      var char = text[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        var end = index + 1;
        while (end < text.length && text[end] !== char) {
          end += text[end] === "\\" ? 2 : 1;
        }
        tokens.push({ type: "string", value: text.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
      var number = NUMBER.exec(text.slice(index));
      if (number && (/[\d.]/.test(char) || ((char === "+" || char === "-") && /[\d.]/.test(text[index + 1] || "")))) {
        var after = index + number[0].length;
        if (text[after] === "%") {
          tokens.push({ type: "percentage", value: parseFloat(number[0]), raw: number[0] });
          index = after + 1;
        } else if (isNameStart(text[after]) || (text[after] === "-" && isNameStart(text[after + 1]))) {
          var unitEnd = readName(text, after);
          tokens.push({ type: "dimension", value: parseFloat(number[0]), raw: number[0], unit: text.slice(after, unitEnd).toLowerCase() });
          index = unitEnd;
        } else {
          tokens.push({ type: "number", value: parseFloat(number[0]), raw: number[0] });
          index = after;
        }
        continue;
      }
      if (isNameStart(char) || (char === "-" && (isNameStart(text[index + 1]) || text[index + 1] === "-"))) {
        var nameEnd = readName(text, index);
        var name = text.slice(index, nameEnd);
        if (text[nameEnd] === "(") {
          var close = closingParen(text, nameEnd);
          var args = text.slice(nameEnd + 1, close);
          var lower = name.toLowerCase();
          if (lower === "url" || lower === "src") {
            tokens.push({ type: "url", value: unquote(args) });
          } else {
            tokens.push({ type: "function", name: lower, args: args, tokens: tokenize(args) });
          }
          index = close + 1;
        } else {
          tokens.push({ type: "ident", value: name });
          index = nameEnd;
        }
        continue;
      }
      if (char === "#") {
        var hashEnd = readName(text, index + 1);
        tokens.push({ type: "hash", value: text.slice(index + 1, hashEnd) });
        index = Math.max(hashEnd, index + 1);
        continue;
      }
      if (char === ",") {
        tokens.push({ type: "comma" });
      } else if (char === "+" || char === "-" || char === "*" || char === "/") {
        tokens.push({ type: "op", value: char });
      } else {
        tokens.push({ type: "delim", value: char });
      }
      index += 1;
    }
    return tokens;
  }

  function walkTokens(tokens, visit) {
    tokens.forEach(function (token) {
      visit(token);
      if (token.tokens) {
        walkTokens(token.tokens, visit);
      }
    });
  }

  var MATH_FUNCTIONS = [
    "calc", "-webkit-calc", "min", "max", "clamp", "round", "mod", "rem", "abs", "sign", "sin", "cos", "tan",
    "asin", "acos", "atan", "atan2", "pow", "sqrt", "hypot", "log", "exp"
  ];
  var LENGTH_UNITS = [
    "px", "em", "rem", "ex", "rex", "ch", "rch", "cap", "rcap", "ic", "ric", "lh", "rlh", "vw", "vh", "vi", "vb",
    "vmin", "vmax", "svw", "svh", "svi", "svb", "svmin", "svmax", "lvw", "lvh", "lvi", "lvb", "lvmin", "lvmax",
    "dvw", "dvh", "dvi", "dvb", "dvmin", "dvmax", "cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax", "cm", "mm", "q",
    "in", "pt", "pc"
  ];
  var ANGLE_UNITS = ["deg", "rad", "grad", "turn"];
  var CSS_WIDE = ["initial", "inherit", "unset", "revert", "revert-layer"];
  var BASIC_SHAPES = ["inset", "circle", "ellipse", "polygon", "path", "rect", "xywh", "shape"];
  var GEOMETRY_BOXES = ["margin-box", "border-box", "padding-box", "content-box", "fill-box", "stroke-box", "view-box"];
  var FILTER_FUNCTIONS = [
    "blur", "brightness", "contrast", "drop-shadow", "grayscale", "hue-rotate", "invert", "opacity", "saturate", "sepia"
  ];
  var IMAGE_FUNCTIONS = [
    "image-set", "-webkit-image-set", "linear-gradient", "radial-gradient", "conic-gradient",
    "repeating-linear-gradient", "repeating-radial-gradient", "repeating-conic-gradient", "cross-fade", "image"
  ];

  function isMath(token) {
    return token.type === "function" && has(MATH_FUNCTIONS, token.name);
  }

  function isVar(token) {
    return token.type === "function" && token.name === "var";
  }

  function isZero(token) {
    return token.type === "number" && token.value === 0;
  }

  /* Bare zeros summed inside math functions (`calc(x + 0)`): a <number> in a
   * sum with a length makes the whole value invalid at computed time. */
  function zeroSumOperands(tokens) {
    var found = [];
    walkTokens(tokens, function (token) {
      if (!isMath(token)) {
        return;
      }
      var list = token.tokens;
      list.forEach(function (item, index) {
        if (!isZero(item)) {
          return;
        }
        var before = list[index - 1];
        var after = list[index + 1];
        var multiplied = (before && before.type === "op" && (before.value === "*" || before.value === "/")) ||
          (after && after.type === "op" && (after.value === "*" || after.value === "/"));
        if (!multiplied) {
          found.push(item.raw);
        }
      });
    });
    return found;
  }

  /* Relative to the font file (or self-contained data:, or a same-document
   * #fragment). Anything that reaches outside the font package is refused. */
  function urlProblem(url) {
    var value = String(url).trim();
    if (!value) {
      return "빈 url()";
    }
    if (/^data:/i.test(value) || value[0] === "#") {
      return null;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.slice(0, 2) === "//") {
      return "원격·절대 URL " + shorten(value, 60);
    }
    if (value[0] === "/") {
      return "사이트 루트 경로 " + shorten(value, 60);
    }
    return null;
  }

  // ── Findings ───────────────────────────────────────────────────────────

  function createReport() {
    var list = [];
    var seen = {};
    function add(severity, code, message, at) {
      var line = at && at.line ? at.line : 1;
      var column = at && at.column ? at.column : 1;
      var key = code + "@" + line + ":" + column + ":" + message;
      if (seen[key]) {
        return;
      }
      seen[key] = true;
      list.push({ severity: severity, code: code, message: message, line: line, column: column });
    }
    return {
      list: list,
      error: function (code, message, at) { add("error", code, message, at); },
      warning: function (code, message, at) { add("warning", code, message, at); },
      parser: function (entry) {
        list.push({ severity: entry.severity, code: "syntax", detail: entry.code, message: entry.message, line: entry.line, column: entry.column });
      }
    };
  }

  // ── Selector classification ────────────────────────────────────────────

  function scopeText(id) {
    return ':where([data-fy-font="' + (id || "<id>") + '"])';
  }

  /* The first compound of every complex selector: exactly
   * :where([data-fy-font="<id>"] <host attribute conditions>). */
  function readScope(compound, fontId) {
    var expect = scopeText(fontId);
    if (!compound || compound.combinator !== null) {
      return { problem: "셀렉터가 폰트 scope " + expect + "로 시작하지 않습니다" };
    }
    var simples = compound.simples;
    var bare = simples.filter(function (simple) { return simple.kind === "attribute" && simple.name === "data-fy-font"; });
    var startsWithWhere = simples[0] && simples[0].kind === "pseudo-class" && simples[0].name === "where" && simples[0].args !== null;
    if (startsWithWhere && simples.length > 1) {
      return { problem: "scope " + expect + " 뒤에 붙인 조건은 host 조건입니다 — host 조건은 scope :where() 안에 씁니다(특이도 0 유지, 예: :where([data-fy-font=\"…\"][data-fy-vowel-depth=\"syllable\"]))" };
    }
    if (simples.length !== 1 || !startsWithWhere) {
      return {
        problem: bare.length
          ? "scope는 " + expect + "처럼 :where()로 감쌉니다(특이도 0) — 다른 조건을 scope compound에 붙이지 않습니다"
          : "셀렉터가 폰트 scope " + expect + "로 시작하지 않습니다 — 폰트 밖 요소까지 스타일합니다"
      };
    }
    var shapeProblem = "scope :where()에는 [data-fy-font=\"<id>\"]와 host 속성 조건(:not(host 속성) 포함) compound 하나만 씁니다";
    var args = Model.splitSelectorList(simples[0].args);
    var inner = args.length === 1 ? Model.selectorCompounds(args[0]) : [];
    if (inner.length !== 1 || inner[0].combinator !== null) {
      return { problem: shapeProblem };
    }
    /* Host conditions: host attributes, positive or inside :not(). */
    var conditions = [];
    for (var at = 0; at < inner[0].simples.length; at += 1) {
      var simple = inner[0].simples[at];
      if (simple.kind === "attribute") {
        if (simple.name !== "data-fy-font") {
          conditions.push(simple);
        }
        continue;
      }
      if (simple.kind !== "pseudo-class" || simple.name !== "not" || !simple.args) {
        return { problem: shapeProblem };
      }
      var negated = Model.splitSelectorList(simple.args);
      for (var item = 0; item < negated.length; item += 1) {
        var parts = Model.selectorCompounds(negated[item]);
        if (parts.length !== 1 || parts[0].combinator !== null ||
            parts[0].simples.some(function (part) { return part.kind !== "attribute" || part.name === "data-fy-font"; })) {
          return { problem: shapeProblem };
        }
        conditions = conditions.concat(parts[0].simples);
      }
    }
    var fonts = inner[0].simples.filter(function (entry) { return entry.kind === "attribute" && entry.name === "data-fy-font"; });
    if (fonts.length !== 1 || fonts[0].op !== "=" || fonts[0].flag === "i") {
      return { problem: "scope에는 [data-fy-font=\"<id>\"] 조건이 정확히 하나 있어야 합니다(연산자 =, i 플래그 없음)" };
    }
    var id = fonts[0].value;
    if (fontId && foldCase(id) !== foldCase(fontId)) {
      return { id: id, problem: "다른 폰트의 scope [data-fy-font=\"" + id + "\"] — 이 폰트의 scope는 " + expect + "입니다" };
    }
    var caseProblem = /[A-Z]/.test(id) ? caseMessage(id, "scope id") : null;
    for (var index = 0; index < conditions.length; index += 1) {
      if (!has(HOST_ATTRIBUTES, conditions[index].name)) {
        return { id: id, problem: "scope의 host 조건 [" + conditions[index].name + "]는 런타임이 host에 찍는 속성이 아닙니다(허용: " + HOST_ATTRIBUTES.join(", ") + ")" };
      }
    }
    return { id: id, hostConditions: conditions.length, caseProblem: caseProblem };
  }

  function newInfo() {
    return { node: false, wrapper: null, identity: false, slot: false, context: false, problems: [] };
  }

  function describeAttribute(simple) {
    return "[" + simple.name + (simple.op ? simple.op + '"' + simple.value + '"' : "") + "]";
  }

  /* position: "subject" (the element the rule styles), "ancestor" (compounds
   * before it), "has" (inside :has()). negated: inside :not(). */
  function analyzeAttribute(simple, info, position, negated) {
    var name = simple.name;
    var subject = position === "subject" && !negated;
    if (name === "data-fy-font") {
      info.problems.push("[data-fy-font]는 셀렉터 맨 앞 scope :where() 안에만 씁니다");
    } else if (has(HOST_ATTRIBUTES, name)) {
      info.problems.push("host 조건 " + describeAttribute(simple) + "는 scope 안에 씁니다: :where([data-fy-font=\"<id>\"]" + describeAttribute(simple) + ")");
    } else if (name === "part") {
      if (simple.op !== "~=" && simple.op !== "=") {
        info.problems.push("part는 토큰으로 고릅니다: [part~=\"<토큰>\"] (지금 " + describeAttribute(simple) + ")");
        return;
      }
      String(simple.value).split(/\s+/).filter(Boolean).forEach(function (token) {
        if (has(JAMO_PART_TOKENS, token)) {
          if (subject) {
            info.node = true;
          }
          if (token !== "jamo" && position === "subject") {
            info.slot = true;
          }
        } else if (has(WRAPPER_PART_TOKENS, token)) {
          if (subject) {
            info.wrapper = info.wrapper || describeAttribute(simple);
          }
        } else {
          info.problems.push("part 토큰 \"" + token + "\"은 런타임이 쓰지 않습니다");
        }
      });
    } else if (has(NODE_SLOT_ATTRIBUTES, name)) {
      if (subject) {
        info.node = true;
      }
      if (position === "subject") {
        info.slot = true;
      }
    } else if (has(NODE_IDENTITY_ATTRIBUTES, name)) {
      if (subject) {
        info.node = true;
      }
      if (position === "subject") {
        info.identity = true;
      }
    } else if (has(FRAME_ATTRIBUTES, name)) {
      info.context = true;
    } else if (has(WRAPPER_ATTRIBUTES, name)) {
      if (subject) {
        info.wrapper = info.wrapper || describeAttribute(simple);
      }
      info.context = true;
    } else {
      info.problems.push("속성 " + describeAttribute(simple) + "는 런타임이 폰트 DOM에 찍지 않습니다");
    }
  }

  function analyzeSelectorArgument(args, info, position, negated, relative) {
    Model.splitSelectorList(args || "").forEach(function (complex) {
      var compounds = Model.selectorCompounds(complex);
      if (!compounds.length) {
        info.problems.push("빈 셀렉터 인자");
        return;
      }
      if (!relative && compounds[0].combinator !== null) {
        info.problems.push("상대 셀렉터는 :has() 안에서만 씁니다: " + shorten(complex, 40));
      }
      compounds.forEach(function (compound, index) {
        var last = index === compounds.length - 1;
        if (relative) {
          analyzeCompound(compound, info, "has", negated);
        } else if (last) {
          analyzeCompound(compound, info, position, negated);
        } else {
          info.context = true;
          analyzeCompound(compound, info, "ancestor", negated);
        }
      });
      if (!relative && compounds.length > 1) {
        info.context = true;
      }
    });
  }

  function analyzeCompound(compound, info, position, negated) {
    compound.simples.forEach(function (simple) {
      if (simple.kind === "attribute") {
        analyzeAttribute(simple, info, position, negated);
      } else if (simple.kind === "pseudo-class") {
        if (simple.name === "is" || simple.name === "where" || simple.name === "matches") {
          analyzeSelectorArgument(simple.args, info, position, negated, false);
        } else if (simple.name === "not") {
          analyzeSelectorArgument(simple.args, info, position, true, false);
        } else if (simple.name === "has") {
          info.context = true;
          analyzeSelectorArgument(simple.args, info, position, negated, true);
        } else if (has(STRUCTURAL_PSEUDO, simple.name)) {
          info.context = true;
        } else {
          info.problems.push(":" + simple.name + " — 폰트 규칙이 쓸 수 없는 조건입니다(상태·문서 조건은 Studio가 평가하지 못하고 렌더를 폰트 밖에 묶습니다)");
        }
      } else if (simple.kind === "pseudo-element") {
        info.problems.push("::" + simple.name + " — 의사 요소는 자모 노드가 아닙니다");
      } else if (simple.kind === "type" || simple.kind === "class" || simple.kind === "id") {
        var label = simple.kind === "type" ? simple.name : (simple.kind === "class" ? "." : "#") + simple.name;
        info.problems.push(label + " — 폰트는 요소 이름·class·id가 아니라 런타임 DOM 계약의 속성으로 고릅니다");
      } else if (simple.kind === "nesting") {
        info.problems.push("& — CSS nesting은 쓸 수 없습니다");
      } else if (simple.kind === "invalid") {
        info.problems.push("해석할 수 없는 셀렉터 조각 " + shorten(simple.text, 30));
      }
    });
  }

  /* Classify one complex selector against the font grammar. */
  function classifyComplex(complex, fontId) {
    var result = { selector: complex, kind: null, context: false, identity: false, expected: null, problems: [] };
    var compounds = Model.selectorCompounds(complex);
    var scope = readScope(compounds[0], fontId);
    result.scopeId = scope.id || null;
    /* What the declarations are checked against when the selector itself is
     * rejected: a lone compound behaves like a host rule, anything longer
     * like a node rule (the stricter property allowlist). */
    result.guess = compounds.length <= 1 ? "host" : "node";
    if (scope.problem) {
      result.problems.push({ code: "scope", message: scope.problem });
      return result;
    }
    if (scope.caseProblem) {
      result.problems.push({ code: "font-id-case", message: scope.caseProblem });
    }
    if (compounds.length === 1) {
      result.kind = "host";
      result.expected = FONT_LAYER;
      return result;
    }
    if (compounds[1].combinator !== " " && compounds[1].combinator !== ">") {
      result.problems.push({ code: "scope", message: "scope 뒤 결합자 '" + compounds[1].combinator + "' — host의 형제 요소는 폰트 밖입니다" });
      return result;
    }
    var info = newInfo();
    compounds.slice(1, -1).forEach(function (compound) {
      info.context = true;
      analyzeCompound(compound, info, "ancestor", false);
    });
    analyzeCompound(compounds[compounds.length - 1], info, "subject", false);
    info.problems.forEach(function (problem) {
      result.problems.push({ code: "selector", message: problem });
    });
    result.context = info.context;
    result.identity = info.identity;
    if (info.wrapper) {
      result.kind = "wrapper";
      result.problems.push(info.context
        ? {
          code: "context-subject",
          message: "문맥 규칙의 대상이 자모 노드가 아니라 조상 " + info.wrapper + "입니다 — 조상에 선언한 값은 상속으로만 자모에 닿아, " +
            "자모 노드에 직접 선언하는 jamo 레이어 규칙에 레이어와 무관하게 집니다. 셀렉터 끝에 자모 노드([data-fy-pos]·[data-jamo] 등)를 두세요"
        }
        : {
          code: "subject",
          message: "규칙의 대상 " + info.wrapper + "은 wrapper입니다 — 폰트 규칙은 host 또는 자모 노드만 대상으로 합니다(wrapper 배치는 코어 소유)"
        });
      return result;
    }
    if (!info.node) {
      result.kind = "unknown";
      result.problems.push({
        code: "subject",
        message: "셀렉터 끝 compound가 자모 노드를 가리키지 않습니다 — [part~=\"jamo\"]·[data-fy-pos]·[data-fy-role]·[data-jamo]·[data-sprite-jamo-kind] 같은 노드 조건을 두세요"
      });
      return result;
    }
    result.kind = "node";
    result.expected = info.context ? CONTEXT_LAYER : info.identity ? JAMO_LAYER : FONT_LAYER;
    return result;
  }

  function levelReason(classified) {
    if (classified.kind === "host") {
      return "host 규칙";
    }
    if (classified.context) {
      return "문맥 조건(:has()·조상·형제·topology)을 쓴 자모 노드 규칙";
    }
    if (classified.identity) {
      return "자모 조건([data-jamo]·[data-jamo-base]·[data-sprite-jamo] 등)을 쓴 자모 노드 규칙";
    }
    return "slot·role·종류 조건만 쓴 자모 노드 규칙";
  }

  // ── Values ─────────────────────────────────────────────────────────────

  function variableEntry(digest, name) {
    var row = own(digest.variables, name) ? digest.variables[name] : null;
    if (!row) {
      return null;
    }
    return { name: name, level: row[0], scope: row[1], declaredBy: row[2], type: row[3], status: row[4], values: row[5] || null };
  }

  function isLengthType(type) {
    return type === "length" || type === "length-percentage";
  }

  /* Problems of `value` for a registry entry: [{ code, message }]. */
  function checkTypedValue(entry, value) {
    var problems = [];
    var text = stripComments(value);
    var name = entry.name;
    if (!text) {
      problems.push({ code: "value-type", message: name + " 값이 비었습니다" });
      return problems;
    }
    if (has(CSS_WIDE, text.toLowerCase())) {
      return problems;
    }
    var tokens = tokenize(text);
    var zeroNote = " — 코어가 calc()로 더하는 자리에서 단위 없는 0은 숫자라 선언 전체가 무효가 되고, 그렇지 않은 자리에서도 길이 변수의 값은 단위를 붙여 씁니다(0%, 0em, 0px)";
    if (isLengthType(entry.type) || entry.type === "angle") {
      zeroSumOperands(tokens).forEach(function (raw) {
        problems.push({ code: "unitless-zero", message: name + "의 calc() 안에서 단위 없는 " + raw + "을 더합니다" + zeroNote });
      });
    }
    var single = tokens.length === 1 ? tokens[0] : null;
    var dynamic = single && (isMath(single) || isVar(single));
    function typeError(expected) {
      problems.push({ code: "value-type", message: name + ": " + shorten(text, 50) + "는 " + entry.type + " 값이 아닙니다 — " + expected });
    }
    switch (entry.type) {
      case "length":
      case "length-percentage":
        if (dynamic) {
          break;
        }
        if (single && single.type === "number") {
          if (single.value === 0) {
            problems.push({ code: "unitless-zero", message: name + ": 단위 없는 " + single.raw + zeroNote });
          } else {
            typeError("단위가 없습니다(예: " + single.raw + "em)");
          }
        } else if (single && single.type === "dimension" && has(LENGTH_UNITS, single.unit)) {
          break;
        } else if (single && single.type === "percentage" && entry.type === "length-percentage") {
          break;
        } else {
          typeError(entry.type === "length" ? "길이 하나(예: 0.02em)" : "길이나 백분율 하나(예: -3%, 0.1em)");
        }
        break;
      case "number":
        if (!(dynamic || (single && single.type === "number"))) {
          typeError("단위 없는 수 하나");
        }
        break;
      case "integer":
        if (!(dynamic || (single && single.type === "number" && /^[+-]?\d+$/.test(single.raw)))) {
          typeError("정수 하나");
        }
        break;
      case "angle":
        if (!(dynamic || (single && single.type === "dimension" && has(ANGLE_UNITS, single.unit)))) {
          typeError("각도 하나(예: 0deg, -2deg)");
        }
        break;
      case "keyword":
        if (entry.values) {
          if (!(single && single.type === "ident" && has(entry.values, single.value))) {
            typeError("허용 값: " + entry.values.join(" | "));
          }
        } else if (!tokens.every(function (token) { return token.type === "ident" || token.type === "string"; })) {
          typeError("키워드");
        }
        break;
      case "font-weight":
        if (!(dynamic || (single && ((single.type === "number" && single.value >= 1 && single.value <= 1000) ||
            (single.type === "ident" && has(["normal", "bold", "bolder", "lighter"], single.value.toLowerCase())))))) {
          typeError("1–1000 수 또는 normal | bold | bolder | lighter");
        }
        break;
      case "font-family":
        if (!tokens.every(function (token) { return token.type === "ident" || token.type === "string" || token.type === "comma" || isVar(token); })) {
          typeError("글꼴 이름 목록");
        }
        break;
      case "clip-path":
        if (!(tokens.length && (
          (single && single.type === "ident" && single.value.toLowerCase() === "none") ||
          tokens.every(function (token) {
            return token.type === "url" || isVar(token) ||
              (token.type === "function" && has(BASIC_SHAPES, token.name)) ||
              (token.type === "ident" && has(GEOMETRY_BOXES, token.value.toLowerCase()));
          })))) {
          typeError("none, 기본 도형(inset() 등) 또는 url()");
        }
        break;
      case "filter":
        if (!(tokens.length && (
          (single && single.type === "ident" && single.value.toLowerCase() === "none") ||
          tokens.every(function (token) {
            return token.type === "url" || isVar(token) || (token.type === "function" && has(FILTER_FUNCTIONS, token.name));
          })))) {
          typeError("none 또는 filter 함수 목록(drop-shadow() 등)");
        }
        break;
      case "image":
        if (!(single && ((single.type === "ident" && single.value.toLowerCase() === "none") || single.type === "url" || isVar(single) ||
            (single.type === "function" && has(IMAGE_FUNCTIONS, single.name))))) {
          typeError("none, url() 또는 image-set() 같은 이미지 하나");
        }
        break;
      case "url":
        if (!(single && ((single.type === "ident" && single.value.toLowerCase() === "none") || single.type === "url" || isVar(single)))) {
          typeError("none 또는 url(\"./자소판.svg\") — 코어가 <url> | none으로 등록해 문자열·그 밖의 값은 무효가 됩니다");
        }
        break;
      default:
        break;
    }
    return problems;
  }

  // ── Lint ───────────────────────────────────────────────────────────────

  function lintAliasShim(doc, fileName, target, report) {
    var expected = '@import "./' + target + '.css";';
    var items = doc.items.filter(function (item) { return item.type !== "garbage" || String(item.text).trim(); });
    var ok = items.length === 1 && items[0].type === "statement" && items[0].atRule === "import" &&
      items[0].prelude === '"./' + target + '.css"' && doc.errors.length === 0;
    if (!ok) {
      report.error("alias-shim", fileName + "은 " + target + "의 alias shim입니다 — 주석 말고는 " + expected + " 한 줄만 둡니다",
        items[0] || { line: 1, column: 1 });
    }
  }

  function lintTopLevel(doc, report) {
    var items = doc.items;
    var cursor = 0;
    if (items[cursor] && items[cursor].type === "statement" && items[cursor].atRule === "charset") {
      cursor += 1;
    }
    var first = items[cursor];
    var statementOk = first && first.type === "statement" && first.atRule === "layer" &&
      first.layers && first.layers.join(",") === LAYERS.join(",");
    if (!statementOk) {
      report.error("layer-statement", "첫 문장은 @layer " + LAYERS.join(", ") + "; 입니다 — 레이어 순서가 로드 순서에 의존하지 않도록 모든 폰트가 같은 선언을 반복합니다",
        first || { line: 1, column: 1 });
    }
    items.forEach(function (item, index) {
      if (item === first && statementOk) {
        return;
      }
      if (item.type === "garbage") {
        return; // the parser already reported it
      }
      if (item.type === "statement") {
        if (item.atRule === "charset" && index === 0) {
          return;
        }
        if (item.atRule === "import") {
          report.error("import", "@import " + shorten(item.prelude, 50) + " — 폰트는 다른 CSS를 가져오지 않습니다(레이어 밖·원격·다른 폰트 CSS가 폰트 계약을 비껴갑니다). alias shim은 spec/fonts.json의 alias 이름 파일만 가능합니다", item);
        } else {
          report.error("top-level", "최상위 @" + item.atRule + " 문장 — 최상위에는 레이어 순서 선언 하나, 세 레이어 블록, @font-face만 둡니다", item);
        }
        return;
      }
      if (item.kind === "group" && item.atRule === "layer") {
        if (!item.layer || /\(anonymous \d+\)/.test(item.layer)) {
          report.error("anonymous-layer", "이름 없는 @layer 블록 — 규칙은 " + LAYERS.join(" / ") + " 블록에 둡니다", item);
        } else if (!has(LAYERS, item.layer)) {
          report.error("layer-name", "@layer " + item.layer + " — 폰트 레이어는 " + LAYERS.join(" / ") + " 셋뿐입니다", item);
        }
        lintLayerChildren(item.children || [], report);
        return;
      }
      if (item.kind === "group") {
        report.error("top-level", "최상위 @" + item.atRule + " — 조건부 규칙은 레이어 블록 안에 둡니다(@layer font-kku.… { @" + item.atRule + " … })", item);
        return;
      }
      if (item.kind === "rule") {
        report.error("top-level", "레이어 밖 규칙 " + shorten(item.selector, 60) + " — 레이어 밖 규칙은 모든 폰트 레이어를 이기고 페이지 CSS와 겨룹니다. " + LAYERS.join(" / ") + " 안에 두세요", item);
        return;
      }
      if (item.kind === "at-rule" && item.atRule === "font-face") {
        lintFontFace(item, report);
        return;
      }
      report.error("top-level", "최상위 @" + item.atRule + " — 최상위에는 세 레이어 블록과 @font-face만 둡니다", item);
    });
  }

  function lintLayerChildren(children, report) {
    children.forEach(function (child) {
      if (child.type === "garbage") {
        return;
      }
      if (child.type === "statement") {
        report.error(child.atRule === "layer" ? "nested-layer" : "at-rule",
          "레이어 안 @" + child.atRule + " 문장 — 레이어 안에는 스타일 규칙과 @media·@supports만 둡니다", child);
        return;
      }
      if (child.kind === "group") {
        if (child.atRule === "layer") {
          report.error(child.layer && !/\(anonymous \d+\)$/.test(child.layer) ? "nested-layer" : "anonymous-layer",
            "레이어 안의 @layer 블록 — 중첩 레이어는 폰트 레벨 순서(font < jamo < context) 밖에서 순위가 정해집니다", child);
        } else if (!has(SUPPORTED_CONDITIONS, child.atRule)) {
          report.error("condition", "@" + child.atRule + " — Studio가 평가할 수 없는 조건입니다. 폰트의 조건부 그룹은 @media·@supports만 씁니다", child);
        }
        lintLayerChildren(child.children || [], report);
        return;
      }
      if (child.kind === "at-rule") {
        report.error("at-rule", "레이어 안 @" + child.atRule + " — 레이어 안에는 스타일 규칙과 @media·@supports만 둡니다" +
          (child.atRule === "font-face" ? "(@font-face는 최상위에 둡니다)" : ""), child);
      }
    });
  }

  function lintFontFace(block, report) {
    var declarations = block.declarations || [];
    var family = declarations.filter(function (declaration) { return declaration.name.toLowerCase() === "font-family"; })[0];
    var src = declarations.filter(function (declaration) { return declaration.name.toLowerCase() === "src"; })[0];
    if (!family || !src) {
      report.error("font-face", "@font-face에 " + (!family ? "font-family" : "src") + "가 없습니다", block);
    }
    declarations.forEach(function (declaration) {
      if (declaration.important) {
        report.error("important", "@font-face " + declaration.name + "에 !important", declaration);
      }
      lintUrls(declaration, report);
    });
  }

  function lintUrls(declaration, report) {
    walkTokens(tokenize(stripComments(declaration.value)), function (token) {
      if (token.type === "url") {
        var problem = urlProblem(token.value);
        if (problem) {
          report.error("url", declaration.name + ": " + problem + " — 폰트 자산은 폰트 파일 기준 상대 경로(./이름.png)나 data:로 씁니다", declaration);
        }
      }
    });
  }

  function lintReferences(declaration, digest, report) {
    walkTokens(tokenize(stripComments(declaration.value)), function (token) {
      if (!isVar(token)) {
        return;
      }
      var name = String(token.args).split(",")[0].trim();
      if (name.slice(0, 5) !== "--fy-") {
        return;
      }
      var entry = variableEntry(digest, name);
      if (!entry) {
        report.error("unknown-variable", declaration.name + "가 등록되지 않은 " + name + "를 읽습니다(오타?)", declaration);
      } else if (entry.status === "deprecated" || entry.status === "reserved") {
        report.error("retired-slot", declaration.name + "가 " + entry.status + " 변수 " + name + "를 읽습니다 — 어느 체인에도 없습니다", declaration);
      }
    });
  }

  var DECLARER_CODES = { page: "page-variable", runtime: "runtime-variable", core: "core-variable" };
  var DECLARER_REASONS = {
    page: "페이지 작성자 전용 변수입니다 — 폰트가 선언하면 폰트를 import한 페이지가 마지막 말을 하지 못합니다(폰트 레벨 이름: --fy-font-*-depth, --fy-font-weight, --fy-<slot>-clip, --fy-sprite-dilate …)",
    runtime: "런타임(font-kku.js)이 쓰는 값입니다 — 폰트 선언은 런타임 값을 덮어 자모 인덱스·시드가 어긋납니다",
    core: "코어 디스패치 변수입니다 — slot·role 체인(--fy-<slot>-*, --fy-<role>-*)에 쓰세요. 노드에서 직접 쓰면 체인을 끊습니다"
  };

  function lintDeclaration(declaration, rule, subjects, digest, report) {
    if (declaration.important) {
      report.error("important", declaration.name + "에 !important — 중요 선언은 레이어 순서를 뒤집어 레이어 밖 페이지 CSS까지 이깁니다(\"페이지가 항상 이긴다\"가 깨짐)", declaration);
    }
    lintUrls(declaration, report);
    lintReferences(declaration, digest, report);
    var name = declaration.name;
    if (declaration.custom) {
      if (name.slice(0, 5) !== "--fy-") {
        report.error("custom-property", name + " — 폰트는 등록된 --fy-* 변수만 선언합니다", declaration);
        return;
      }
      var entry = variableEntry(digest, name);
      if (!entry) {
        report.error("unknown-variable", name + "는 spec/css-variables.json에 없는 변수입니다(오타?)", declaration);
        return;
      }
      if (entry.declaredBy !== "font") {
        report.error(DECLARER_CODES[entry.declaredBy] || "core-variable", name + " — " + (DECLARER_REASONS[entry.declaredBy] || "폰트가 선언하지 않는 변수입니다"), declaration);
        return;
      }
      if (entry.status === "deprecated" || entry.status === "reserved") {
        report.error("retired-slot", name + " — " + entry.status + " slot이라 노드에 찍히지도, 어느 체인에 들지도 않습니다. placement가 내보내는 slot이나 그 부모 slot을 쓰세요", declaration);
        return;
      }
      if (subjects.host && entry.scope !== "host") {
        report.error("variable-scope", name + "는 자모 노드 변수(scope: node)입니다 — host에 선언하면 모든 자모에 상속되고, 노드 규칙의 같은 변수가 누적이 아니라 대체합니다. 자모 노드 규칙에 선언하세요", declaration);
      }
      if (subjects.node && entry.scope === "host" && entry.level !== "slot" && entry.level !== "role") {
        report.error("variable-scope", name + "는 host 변수(scope: host)입니다 — 자모 노드에서 다시 선언할 수 있는 host 변수는 slot·role 체인 변수(L2)뿐입니다. host 규칙에 선언하세요", declaration);
      }
      if (!rule.nested && entry.level === "jamo" && rule.layer !== JAMO_LAYER && has(LAYERS, rule.layer)) {
        report.error("variable-layer", name + "는 jamo 레벨 누적 보정입니다 — @layer " + JAMO_LAYER + " 규칙에서만 선언합니다(다른 레이어의 선언은 jamo 규칙과 누적되지 않고 대체됩니다; 문맥 보정은 --fy-ctx-*)", declaration);
      }
      if (!rule.nested && entry.level === "context" && rule.layer !== CONTEXT_LAYER && has(LAYERS, rule.layer)) {
        report.error("variable-layer", name + "는 context 레벨 누적 보정입니다 — @layer " + CONTEXT_LAYER + " 규칙에서만 선언합니다(자모 보정은 --fy-jamo-*)", declaration);
      }
      checkTypedValue(entry, declaration.value).forEach(function (problem) {
        report.error(problem.code, problem.message, declaration);
      });
      return;
    }
    var property = name.toLowerCase();
    var paint = has(PAINT_PROPERTIES, property);
    var text = has(HOST_TEXT_PROPERTIES, property);
    if (paint && (subjects.host || subjects.node)) {
      return;
    }
    if (text && subjects.host && !subjects.node) {
      return;
    }
    if (text) {
      report.error("property", name + "는 host 규칙에만 선언합니다 — 코어가 자모 노드에 font: inherit를 주므로 글꼴 기능은 host에서 상속됩니다", declaration);
    } else if (CORE_GEOMETRY.test(property)) {
      report.error("property", name + "는 코어 소유 속성입니다(자모 배치·크기·변형·잘라내기·획·배경·필터) — 레이어 밖 코어 규칙에 지거나, 지지 않는 속성이면 코어 배치를 몰래 바꿉니다. " + CORE_OWNED_HINT, declaration);
    } else {
      report.error("property", name + "는 폰트가 직접 선언할 수 있는 속성이 아닙니다 — 허용: " + PAINT_PROPERTIES.join(", ") + " (host는 글꼴 기능 " + HOST_TEXT_PROPERTIES.slice(0, 3).join(", ") + " 등도)", declaration);
    }
  }

  /* Declarations the runtime reads as metadata: the unconditional host rules
   * of the font layer (last declaration wins, like the cascade). */
  function readMetadataDeclarations(doc, fontId) {
    var meta = {};
    var conditional = {};
    doc.rules.forEach(function (rule) {
      if (rule.invalid || rule.nested || rule.layer !== FONT_LAYER) {
        return;
      }
      var plainHost = Model.splitSelectorList(rule.effectiveSelector).some(function (complex) {
        var compounds = Model.selectorCompounds(complex);
        var scope = compounds.length === 1 ? readScope(compounds[0], fontId) : null;
        return scope && !scope.problem && !scope.hostConditions;
      });
      rule.declarations.forEach(function (declaration) {
        if (plainHost && !rule.conditions.length) {
          meta[declaration.name] = declaration;
        } else {
          conditional[declaration.name] = declaration;
        }
      });
    });
    return { meta: meta, conditional: conditional };
  }

  function lintMetadata(doc, fileId, fontId, digest, report) {
    var found = readMetadataDeclarations(doc, fontId);
    function value(name) {
      return found.meta[name] ? stripComments(found.meta[name].value) : null;
    }
    function where(name) {
      return found.meta[name] || found.conditional[name] || { line: 1, column: 1 };
    }
    function missing(name) {
      return found.conditional[name]
        ? name + "가 조건부 규칙에만 있습니다 — 조건 없는 font 레이어 host 규칙(" + scopeText(fontId) + ")에 선언합니다"
        : name + " 선언이 없습니다 — font 레이어 host 규칙(" + scopeText(fontId) + ")에 선언합니다";
    }
    var id = value("--fy-font-id");
    if (fileId && /[A-Z]/.test(fileId)) {
      report.error("font-id-case", caseMessage(fileId, "파일 이름"), { line: 1, column: 1 });
    }
    if (id === null) {
      report.error("font-id", missing("--fy-font-id"), where("--fy-font-id"));
    } else {
      if (/[A-Z]/.test(unquote(id))) {
        report.error("font-id-case", caseMessage(unquote(id), "--fy-font-id"), where("--fy-font-id"));
      }
      if (fileId && foldCase(unquote(id)) !== foldCase(fileId)) {
        report.error("font-id", "--fy-font-id: " + id + " — 파일 이름과 같아야 합니다(--fy-font-id: " + foldCase(fileId) + ")", where("--fy-font-id"));
      }
    }
    var contract = value("--fy-contract");
    if (contract === null) {
      report.error("contract", missing("--fy-contract"), where("--fy-contract"));
    } else if (contract !== digest.contract) {
      report.error("contract", "--fy-contract: " + contract + " — 이 린트는 계약 " + digest.contract + "를 검사합니다(--fy-contract: " + digest.contract + ")", where("--fy-contract"));
    }
    var material = value("--fy-material");
    if (material === null) {
      report.error("material", missing("--fy-material"), where("--fy-material"));
    } else if (!has(["system", "sprite", "bundled"], material)) {
      report.error("material", "--fy-material: " + material + " — system | sprite | bundled 중 하나입니다", where("--fy-material"));
    }
    if (material === "sprite") {
      if (value("--fy-sprite-url") === null && value("--fy-sprite-image") === null) {
        report.error("sprite-sheet", "sprite 재료는 host에 --fy-sprite-url: url(\"./자소판.svg\")(PNG 다중 배율이면 --fy-sprite-image)을 선언합니다", where("--fy-sprite-url"));
      }
      var kinds = value("--fy-sprite-kinds");
      if (!/^(consonant|vowel|coda-cluster)( (consonant|vowel|coda-cluster))*$/.test((kinds || "").replace(/\s+/g, " "))) {
        report.error("sprite-kinds", "sprite 재료는 --fy-sprite-kinds: consonant vowel [coda-cluster]를 선언합니다(시트에 칸이 있는 종류)", where("--fy-sprite-kinds"));
      }
    }
  }

  function lintRules(doc, fontId, digest, report) {
    doc.nesting.forEach(function (rule) {
      report.error("nesting", "중첩 규칙(CSS nesting) — 폰트 계약은 평평한 규칙만 씁니다. 부모 셀렉터를 풀어 쓴 규칙으로 옮기세요", rule);
    });
    doc.rules.forEach(function (rule) {
      if (rule.invalid) {
        return; // dropped by the browser; the parser reported why
      }
      var subjects = { host: false, node: false };
      if (rule.nested) {
        subjects.node = true; // nesting is an error already; check declarations strictly
      } else {
        var seen = {};
        Model.splitSelectorList(rule.effectiveSelector).forEach(function (complex) {
          var classified = classifyComplex(complex, fontId);
          classified.problems.forEach(function (problem) {
            var key = problem.code + problem.message;
            if (!seen[key]) {
              seen[key] = true;
              report.error(problem.code, problem.message + " · " + shorten(complex, 70), rule);
            }
          });
          var kind = classified.kind === "host" || classified.kind === "node" ? classified.kind : classified.guess;
          subjects[kind] = true;
          if (classified.expected && has(LAYERS, rule.layer) && classified.expected !== rule.layer) {
            report.error("layer-mismatch", shorten(complex, 70) + " — " + levelReason(classified) + "은 @layer " + classified.expected +
              "에 둡니다(지금 " + rule.layer + "). 레이어가 레벨이라 뒤 레이어가 특이도와 무관하게 이깁니다", rule);
          }
        });
      }
      rule.declarations.forEach(function (declaration) {
        if (!declaration.invalid) {
          lintDeclaration(declaration, rule, subjects, digest, report);
        }
      });
    });
  }

  function lint(cssText, options) {
    var opts = options || {};
    var digest = opts.digest || DIGEST;
    var report = createReport();
    if (!Model || !digest) {
      report.error("syntax", "린트를 준비하지 못했습니다(FontStudioModel 또는 생성 블록 없음)", null);
      return report.list;
    }
    var doc = Model.parse(String(cssText == null ? "" : cssText));
    var fileId = fontIdFromFile(opts.fileName);
    doc.errors.forEach(report.parser);
    if (fileId && own(digest.aliases || {}, fileId)) {
      lintAliasShim(doc, fileId + ".css", digest.aliases[fileId], report);
      return sorted(report.list);
    }
    var declaredId = null;
    doc.rules.forEach(function (rule) {
      rule.declarations.forEach(function (declaration) {
        if (declaration.name === "--fy-font-id" && !declaredId) {
          declaredId = unquote(stripComments(declaration.value));
        }
      });
    });
    var fontId = fileId || declaredId || Model.scopeFontIds(doc)[0] || null;
    lintTopLevel(doc, report);
    lintRules(doc, fontId, digest, report);
    lintMetadata(doc, fileId, fontId, digest, report);
    return sorted(report.list);
  }

  function sorted(list) {
    return list.slice().sort(function (a, b) {
      return a.line - b.line || a.column - b.column;
    });
  }

  /* "file:line:column code message" — one line per finding (CLI, errors). */
  function format(findings, fileName) {
    return findings.map(function (entry) {
      return (fileName ? fileName + ":" : "") + entry.line + ":" + entry.column + " " + entry.severity + " " + entry.code + " " + entry.message;
    }).join("\n");
  }

  var FontKkuLint = {
    LAYERS: LAYERS,
    CODES: CODES,
    DIGEST: DIGEST,
    PAINT_PROPERTIES: PAINT_PROPERTIES,
    HOST_TEXT_PROPERTIES: HOST_TEXT_PROPERTIES,
    lint: lint,
    format: format,
    classifySelector: function (complex, fontId) { return classifyComplex(complex, fontId); },
    checkValue: function (name, value, digest) {
      var entry = variableEntry(digest || DIGEST, name);
      return entry ? checkTypedValue(entry, value) : null;
    }
  };

  global.FontKkuLint = FontKkuLint;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuLint;
  }
})(typeof window !== "undefined" ? window : globalThis);
