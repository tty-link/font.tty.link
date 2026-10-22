/* 글꼴 묶음(font package, PLAN-STUDIO-002 '저장 창구와 글꼴 묶음' S2, ADR-033 §7) — 글꼴 하나를 저장·옮기·서빙하는 단위.
 *
 *   { format: "font-kku-font-package", version: 1,
 *     manifest: { id, name, base?: { id, rev? }, runtime: { version }, layouts?, contentRev, createdAt, updatedAt, license? },
 *     css,          // 그 글꼴 파일에 쓰는 글 그대로(작업실 CSS 파일 저장이 쓰는 outputCss)
 *     sourceCss?,   // 고치던 원문 — css와 다를 때만('통째로 풀어 저장'을 고른 파생 글꼴). 다시 열면 이것을 고친다
 *     baseUrl?, preview?: { text },
 *     design?: { json, applied, participants? },   // 디자인과 참가자 상태(그림 문서는 아래 drawings로 뺀다)
 *     drawings?,    // 작업실 그림 문서(font-kku-drawing v1)
 *     material?: { kind: "sprite", path, sheet: "data:image/png;base64,…", sheetOmitted? },  // 자소판 화소
 *     review?, environment?,   // 검수 기록(판 2)·저장 환경(font-kku-dependencies v1)
 *     history?,     // 편집 기록(선택 — 작업실 FontStudio.timeline이 있을 때)
 *     extra?: { … } // 옛 형식에서 온, 이 판이 모르는 칸 — 그대로 둔다
 *     …모르는 맨 위 칸도 그대로 둔다(ADR-032 §7 — 버리지 않는다) }
 *
 * 옛 형식을 모두 읽는다: 작업실 프로젝트 v2(font-kku-font-project), 초안(font-kku-font-studio-draft v1·v2, 더 옛 { css }),
 * 디자인 묶음 v1(font-kku-design-bundle — 글꼴 CSS가 없어 지금 글꼴에 '적용할 것'으로), 디자인 JSON(1.x·2.0 — 같은 뜻), CSS 글.
 * 새로 쓰는 것은 묶음이다(⚑2). 프로젝트 v2와는 손실 없이 오간다(toProject·fromProject) — 작업실 모듈은 지금처럼 프로젝트 칸을 채운다.
 * 브라우저와 Node 공용, 문서·렌더러 없이 돈다. */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-package: load font-studio-util.js first");
  }
  var clone = Util.clone;
  var isObject = Util.isObject;

  var FORMAT = "font-kku-font-package";
  var VERSION = 1;
  var PROJECT_FORMAT = "font-kku-font-project";
  var PROJECT_VERSION = 2;
  var DRAFT_FORMAT = "font-kku-font-studio-draft";
  var BUNDLE_FORMAT = "font-kku-design-bundle";
  var EXTENSION = ".font-kku.json";
  var LIMITS = { maxBytes: 32000000, maxCss: 4000000, maxErrors: 40 };
  /* 묶음이 아는 맨 위 칸 — 나머지는 모르는 칸으로 그대로 둔다 */
  var KNOWN = ["format", "version", "manifest", "css", "sourceCss", "baseUrl", "preview", "design", "drawings", "material", "review",
    "environment", "history", "extra"];
  /* 프로젝트 v2가 아는 칸 — 나머지는 extra로 */
  var PROJECT_KNOWN = ["format", "version", "font", "preview", "design", "material", "review", "reproducibility"];
  var FONT_KNOWN = ["id", "css", "baseUrl"];
  var ID = /^[a-z][a-z0-9-]*$/;

  function has(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function stable(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(stable).join(",") + "]";
    }
    if (isObject(value)) {
      return "{" + Object.keys(value).sort().filter(function (key) { return value[key] !== undefined; }).map(function (key) {
        return JSON.stringify(key) + ":" + stable(value[key]);
      }).join(",") + "}";
    }
    return value === undefined ? "null" : JSON.stringify(value);
  }

  function digest(prefix, text) {
    var pair = Util.hashPair(text);
    return prefix + "-" + pair[0] + pair[1] + "-" + text.length;
  }

  function utf8Length(text) {
    var bytes = 0;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function bundleModel() {
    return global.FontStudioBundleModel || (typeof require === "function" ? safeRequire("./font-studio-bundle-model.js") : null);
  }

  function safeRequire(path) {
    try {
      return require(path);
    } catch (error) {
      return null;
    }
  }

  /* CSS 글에서 --fy-font-id(없으면 scope 셀렉터의 글꼴 이름) — 이름 없는 CSS를 묶음으로 옮길 때 */
  function cssFontId(css) {
    var text = String(css || "");
    var declared = /--fy-font-id\s*:\s*["']?([A-Za-z][A-Za-z0-9-]*)["']?\s*[;}]/.exec(text);
    if (declared) {
      return declared[1].toLowerCase();
    }
    var scoped = /\[data-fy-font\s*=\s*["']?([A-Za-z][A-Za-z0-9-]*)["']?\s*\]/.exec(text);
    return scoped ? scoped[1].toLowerCase() : null;
  }

  function cssFontName(css) {
    var named = /--fy-font-name\s*:\s*["']([^"'\n]{1,80})["']/.exec(String(css || ""));
    return named ? named[1] : null;
  }

  /* 내용 지문 — 글꼴이 그리는 것(CSS·원문·디자인·그림·자소판). 검수·저장 환경·편집 기록·미리보기 글·시각은 넣지 않는다(검수를 적어도
   * 지문이 바뀌지 않게). 서버 판 번호(rev)와 다르다 — 그것은 서버가 받은 바이트로 센다 */
  function contentRev(pkg) {
    var value = isObject(pkg) ? pkg : {};
    return digest("pkg", stable({
      css: typeof value.css === "string" ? value.css : "",
      sourceCss: typeof value.sourceCss === "string" ? value.sourceCss : null,
      design: value.design === undefined ? null : value.design,
      drawings: value.drawings === undefined ? null : value.drawings,
      material: isObject(value.material) ? { kind: value.material.kind || null, path: value.material.path || null, sheet: value.material.sheet || null } : null
    }));
  }

  function error(code, path, message) {
    return { code: code, path: path || "", message: message };
  }

  /* 그 판이 모르는 맨 위 칸 */
  function unknownKeys(value, known) {
    return Object.keys(value).filter(function (key) { return known.indexOf(key) < 0; });
  }

  /* 남이 준 자료의 안전 검사 — 디자인·그림 문서는 디자인 묶음과 같은 검사(scanUnsafe: 표시 문법·url()·data:·@import 등)를 거친다.
   * CSS는 글꼴 계약 검사가, 자소판은 PNG data URL인지, 검수·저장 환경은 그 모델의 normalize가 본다 */
  function unsafeErrors(pkg) {
    var Bundle = bundleModel();
    var errors = [];
    if (!Bundle || typeof Bundle.scanUnsafe !== "function") {
      return errors;
    }
    if (pkg.design !== undefined) {
      Bundle.scanUnsafe(pkg.design && pkg.design.json, "design", 0, errors, true);
    }
    if (pkg.drawings !== undefined && pkg.drawings !== null) {
      Bundle.scanUnsafe(pkg.drawings, "drawings", 0, errors, false);
    }
    return errors.slice(0, LIMITS.maxErrors).map(function (entry) {
      return error("PACKAGE_UNSAFE", entry.path, entry.message);
    });
  }

  /* 묶음 검사 → { ok, package, errors: [{ code, path, message }] } — 고치지 않는다(모르는 칸은 그대로) */
  function validate(input, options) {
    var opts = options || {};
    var errors = [];
    if (!isObject(input)) {
      return { ok: false, package: null, errors: [error("PACKAGE_FORMAT", "", "글꼴 묶음은 JSON 객체여야 합니다")] };
    }
    if (input.format !== FORMAT) {
      errors.push(error("PACKAGE_FORMAT", "format", "글꼴 묶음(" + FORMAT + ")이 아닙니다"));
    }
    if (input.version !== VERSION) {
      errors.push(error("PACKAGE_VERSION", "version", typeof input.version === "number" && input.version > VERSION
        ? "더 새 작업실이 만든 묶음입니다(판 " + input.version + ") — 그 작업실에서 여세요"
        : "모르는 묶음 판입니다(" + JSON.stringify(input.version) + ")"));
    }
    if (!isObject(input.manifest)) {
      errors.push(error("PACKAGE_MANIFEST", "manifest", "manifest가 없습니다"));
    } else {
      if (typeof input.manifest.id !== "string" || !ID.test(input.manifest.id)) {
        errors.push(error("PACKAGE_MANIFEST", "manifest.id", "글꼴 id는 소문자로 시작하는 a-z, 0-9, - 조합이어야 합니다"));
      }
      ["name", "createdAt", "updatedAt", "contentRev", "license"].forEach(function (key) {
        if (input.manifest[key] !== undefined && input.manifest[key] !== null && typeof input.manifest[key] !== "string") {
          errors.push(error("PACKAGE_MANIFEST", "manifest." + key, key + "는 글이어야 합니다"));
        }
      });
      if (input.manifest.base !== undefined && input.manifest.base !== null &&
        !(isObject(input.manifest.base) && typeof input.manifest.base.id === "string")) {
        errors.push(error("PACKAGE_MANIFEST", "manifest.base", "base는 { id, rev? }여야 합니다"));
      }
    }
    if (typeof input.css !== "string") {
      errors.push(error("PACKAGE_CSS", "css", "글꼴 CSS(css)가 없습니다"));
    } else if (input.css.length > LIMITS.maxCss) {
      errors.push(error("PACKAGE_TOO_LARGE", "css", "글꼴 CSS가 너무 큽니다(" + input.css.length + "자)"));
    }
    if (input.sourceCss !== undefined && typeof input.sourceCss !== "string") {
      errors.push(error("PACKAGE_CSS", "sourceCss", "sourceCss는 글이어야 합니다"));
    }
    if (input.design !== undefined && input.design !== null && !(isObject(input.design) && isObject(input.design.json))) {
      errors.push(error("PACKAGE_DESIGN", "design", "design은 { json, applied, participants? }여야 합니다"));
    }
    if (input.drawings !== undefined && input.drawings !== null && !isObject(input.drawings)) {
      errors.push(error("PACKAGE_DRAWINGS", "drawings", "drawings는 그림 문서 객체여야 합니다"));
    }
    if (input.material !== undefined && input.material !== null) {
      var material = input.material;
      if (!isObject(material) || (material.sheet !== undefined && material.sheet !== null &&
          !(typeof material.sheet === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]*$/.test(material.sheet)))) {
        errors.push(error("PACKAGE_MATERIAL", "material", "자소판은 { kind, path, sheet: PNG data URL }이어야 합니다"));
      }
    }
    ["review", "environment", "preview", "extra"].forEach(function (key) {
      if (input[key] !== undefined && input[key] !== null && !isObject(input[key])) {
        errors.push(error("PACKAGE_FIELD", key, key + "는 객체여야 합니다"));
      }
    });
    if (!errors.length && opts.scan !== false) {
      errors = errors.concat(unsafeErrors(input));
    }
    return { ok: errors.length === 0, package: errors.length ? null : input, errors: errors.slice(0, LIMITS.maxErrors) };
  }

  /* 작업실 프로젝트 v2 → 묶음. options: { css(내보낼 글 — 없으면 원문), id, name, base, runtime: { version, layouts }, createdAt, now,
   * license, history, keep(모르는 맨 위 칸 — 앞서 연 묶음에서) } */
  function fromProject(project, options) {
    var opts = options || {};
    var source = isObject(project) ? project : {};
    var font = isObject(source.font) ? source.font : {};
    var editing = typeof font.css === "string" ? font.css : "";
    var css = typeof opts.css === "string" ? opts.css : editing;
    var id = opts.id || font.id || cssFontId(editing) || "font";
    var now = opts.now || new Date().toISOString();
    var runtime = isObject(opts.runtime) ? opts.runtime : {};
    var pkg = { format: FORMAT, version: VERSION, manifest: null, css: css };
    if (editing !== css) {
      pkg.sourceCss = editing;
    }
    if (typeof font.baseUrl === "string" && font.baseUrl) {
      pkg.baseUrl = font.baseUrl;
    }
    if (isObject(source.preview)) {
      pkg.preview = clone(source.preview);
    }
    if (isObject(source.design)) {
      var design = clone(source.design);
      if (isObject(design.participants) && has(design.participants, "drawings")) {
        if (design.participants.drawings !== null) {
          pkg.drawings = design.participants.drawings;
        }
        delete design.participants.drawings;
        if (!Object.keys(design.participants).length) {
          delete design.participants;
        }
      }
      pkg.design = design;
    }
    if (isObject(source.material)) {
      pkg.material = clone(source.material);
    }
    if (isObject(source.review)) {
      pkg.review = clone(source.review);
    }
    if (isObject(source.reproducibility)) {
      pkg.environment = clone(source.reproducibility);
    }
    if (opts.history !== undefined && opts.history !== null) {
      pkg.history = clone(opts.history);
    }
    var extra = {};
    unknownKeys(source, PROJECT_KNOWN).forEach(function (key) { extra[key] = clone(source[key]); });
    var fontExtra = {};
    unknownKeys(font, FONT_KNOWN).forEach(function (key) { fontExtra[key] = clone(font[key]); });
    if (Object.keys(fontExtra).length) {
      extra.font = fontExtra;
    }
    if (isObject(opts.extra)) {
      Object.keys(opts.extra).forEach(function (key) {
        if (!has(extra, key)) {
          extra[key] = clone(opts.extra[key]);
        }
      });
    }
    if (Object.keys(extra).length) {
      pkg.extra = extra;
    }
    if (isObject(opts.keep)) {
      Object.keys(opts.keep).forEach(function (key) {
        if (KNOWN.indexOf(key) < 0 && !has(pkg, key)) {
          pkg[key] = clone(opts.keep[key]);
        }
      });
    }
    var manifest = {
      id: id,
      name: opts.name || cssFontName(editing) || id,
      runtime: { version: runtime.version && runtime.version !== "unknown" ? String(runtime.version) : null },
      contentRev: null,
      createdAt: opts.createdAt || now,
      updatedAt: now
    };
    if (isObject(opts.base) && typeof opts.base.id === "string") {
      manifest.base = { id: opts.base.id };
      if (opts.base.rev) {
        manifest.base.rev = String(opts.base.rev);
      }
    }
    if (isObject(runtime.layouts) && Object.keys(runtime.layouts).length) {
      manifest.layouts = {};
      Object.keys(runtime.layouts).sort().forEach(function (name) { manifest.layouts[name] = String(runtime.layouts[name]); });
    }
    if (typeof opts.license === "string" && opts.license) {
      manifest.license = opts.license;
    }
    pkg.manifest = manifest;
    manifest.contentRev = contentRev(pkg);
    return pkg;
  }

  /* 묶음 → 작업실 프로젝트 v2(작업실이 여는 길). extra는 제자리로 돌려놓는다 — 다시 묶음으로 옮기면 같다 */
  function toProject(pkg) {
    var value = isObject(pkg) ? pkg : {};
    var manifest = isObject(value.manifest) ? value.manifest : {};
    var extra = isObject(value.extra) ? value.extra : {};
    var font = { id: manifest.id, css: typeof value.sourceCss === "string" ? value.sourceCss : value.css };
    if (typeof value.baseUrl === "string" && value.baseUrl) {
      font.baseUrl = value.baseUrl;
    }
    if (isObject(extra.font)) {
      Object.keys(extra.font).forEach(function (key) {
        if (!has(font, key)) {
          font[key] = clone(extra.font[key]);
        }
      });
    }
    var project = { format: PROJECT_FORMAT, version: PROJECT_VERSION, font: font, preview: isObject(value.preview) ? clone(value.preview) : {} };
    if (isObject(value.design) || (value.drawings !== undefined && value.drawings !== null)) {
      var design = isObject(value.design) ? clone(value.design) : null;
      if (design) {
        if (value.drawings !== undefined && value.drawings !== null) {
          design.participants = isObject(design.participants) ? design.participants : {};
          design.participants.drawings = clone(value.drawings);
        }
        project.design = design;
      }
    }
    if (isObject(value.material)) {
      project.material = clone(value.material);
    }
    if (isObject(value.review)) {
      project.review = clone(value.review);
    }
    if (isObject(value.environment)) {
      project.reproducibility = clone(value.environment);
    }
    Object.keys(extra).forEach(function (key) {
      if (key !== "font" && !has(project, key)) {
        project[key] = clone(extra[key]);
      }
    });
    return project;
  }

  /* 묶음이 모르는 맨 위 칸(다시 저장할 때 그대로 돌려놓는다) */
  function keptFields(pkg) {
    var kept = {};
    if (isObject(pkg)) {
      unknownKeys(pkg, KNOWN).forEach(function (key) { kept[key] = clone(pkg[key]); });
    }
    return kept;
  }

  function parseJson(input) {
    if (typeof input !== "string") {
      return { value: input, text: null };
    }
    var text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    var trimmed = text.trim();
    if (trimmed[0] !== "{" && trimmed[0] !== "[") {
      return { value: undefined, text: text, css: true };
    }
    try {
      return { value: JSON.parse(text), text: text };
    } catch (err) {
      /* {로 시작하는 CSS는 없다 — JSON 문법 오류로 알린다 */
      return { value: undefined, text: text, jsonError: err };
    }
  }

  /* 무엇인가 → "package" | "project" | "draft" | "bundle" | "design" | "css" | "unknown" */
  function detect(input) {
    var parsed = parseJson(input);
    if (parsed.css) {
      return "css";
    }
    var value = parsed.value;
    if (!isObject(value)) {
      return "unknown";
    }
    if (value.format === FORMAT) {
      return "package";
    }
    if (value.format === PROJECT_FORMAT) {
      return "project";
    }
    if (value.format === DRAFT_FORMAT) {
      return "draft";
    }
    if (value.format === BUNDLE_FORMAT) {
      return "bundle";
    }
    if (typeof value.mode === "string" && isObject(value.sources)) {
      return "design";
    }
    if (typeof value.css === "string" && value.format === undefined) {
      return "draft"; // 가장 옛 초안 { css, baseUrl, text }
    }
    return "unknown";
  }

  /* 초안 → 묶음. v2 { package }, v1 { project }, 그 전 { css, baseUrl, text } */
  function fromDraft(value, options) {
    if (!isObject(value)) {
      return { ok: false, errors: [error("DRAFT_FORMAT", "", "초안이 아닙니다")] };
    }
    if (value.format === DRAFT_FORMAT && value.version === 2 && isObject(value.package)) {
      var checked = validate(value.package, { scan: false });
      return checked.ok ? { ok: true, package: checked.package, savedAt: value.savedAt || null, errors: [] } : { ok: false, errors: checked.errors };
    }
    var project = null;
    if (value.format === DRAFT_FORMAT && isObject(value.project) && isObject(value.project.font) && typeof value.project.font.css === "string") {
      project = value.project;
    } else if (value.format === undefined && typeof value.css === "string") {
      project = { format: PROJECT_FORMAT, version: PROJECT_VERSION, font: { css: value.css, baseUrl: value.baseUrl }, preview: { text: value.text } };
    }
    if (!project) {
      return { ok: false, errors: [error("DRAFT_FORMAT", "", "읽을 수 없는 초안입니다")] };
    }
    return { ok: true, package: fromProject(project, options), savedAt: value.savedAt || null, errors: [] };
  }

  /* 초안으로 쓸 것(같은 열쇠 font-kku-font-studio-v2 — 옛 작업실도 읽던 열쇠) */
  function toDraft(pkg, savedAt) {
    return { format: DRAFT_FORMAT, version: 2, savedAt: savedAt || new Date().toISOString(), package: pkg };
  }

  /* 무엇이든 읽기 → { ok, kind, package?, apply?, savedAt?, errors }.
   * - package·project·draft·css → package(그대로 열 묶음)
   * - bundle·design → apply({ bundle } | { design }) — 글꼴 CSS가 없어 지금 글꼴에 적용한다(작업실 묶음 열기·디자인 JSON 열기)
   * options: fromProject의 것(css 열기의 id·runtime 등) */
  function fromAny(input, options) {
    var opts = options || {};
    var text = typeof input === "string" ? input : null;
    if (text !== null && utf8Length(text) > LIMITS.maxBytes) {
      return { ok: false, kind: "unknown", errors: [error("PACKAGE_TOO_LARGE", "", "파일이 너무 큽니다(" + utf8Length(text) + "바이트)")] };
    }
    var parsed = parseJson(input);
    if (parsed.jsonError) {
      return { ok: false, kind: "unknown", errors: [error("PACKAGE_JSON", "", "JSON 문법 오류: " + parsed.jsonError.message)] };
    }
    var kind = detect(input);
    var value = parsed.value;
    if (kind === "css") {
      var css = parsed.text;
      return { ok: true, kind: kind, package: fromProject({ font: { css: css, id: cssFontId(css) || undefined } }, opts), errors: [] };
    }
    if (kind === "package") {
      var checked = validate(value);
      return { ok: checked.ok, kind: kind, package: checked.package, errors: checked.errors };
    }
    if (kind === "project") {
      if (value.version !== PROJECT_VERSION || !isObject(value.font) || typeof value.font.css !== "string") {
        return { ok: false, kind: kind, errors: [error("PROJECT_FORMAT", "", "font-kku-font-project v2 파일이 아닙니다")] };
      }
      var pkg = fromProject(value, opts);
      var scan = unsafeErrors(pkg);
      return { ok: scan.length === 0, kind: kind, package: scan.length ? null : pkg, errors: scan };
    }
    if (kind === "draft") {
      var draft = fromDraft(value, opts);
      return { ok: draft.ok, kind: kind, package: draft.package || null, savedAt: draft.savedAt || null, errors: draft.errors };
    }
    if (kind === "bundle") {
      return { ok: true, kind: kind, apply: { bundle: value, text: text }, errors: [] };
    }
    if (kind === "design") {
      return { ok: true, kind: kind, apply: { design: value, text: text }, errors: [] };
    }
    return { ok: false, kind: "unknown", errors: [error("PACKAGE_FORMAT", "", "글꼴 묶음·프로젝트·디자인 묶음·디자인 JSON·CSS가 아닙니다")] };
  }

  /* 저장 파일 이름 */
  function fileName(pkg) {
    var id = pkg && isObject(pkg.manifest) && typeof pkg.manifest.id === "string" && pkg.manifest.id ? pkg.manifest.id : "font";
    return id.replace(/[^A-Za-z0-9._-]+/g, "-") + EXTENSION;
  }

  function serialize(pkg) {
    return JSON.stringify(pkg, null, 2) + "\n";
  }

  /* 두 묶음이 같은가(시각 updatedAt·createdAt은 보지 않는다) */
  function same(a, b) {
    function strip(pkg) {
      var copy = clone(pkg) || {};
      if (isObject(copy.manifest)) {
        delete copy.manifest.updatedAt;
        delete copy.manifest.createdAt;
      }
      return stable(copy);
    }
    return strip(a) === strip(b);
  }

  var FontStudioPackage = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    PROJECT_FORMAT: PROJECT_FORMAT,
    PROJECT_VERSION: PROJECT_VERSION,
    DRAFT_FORMAT: DRAFT_FORMAT,
    BUNDLE_FORMAT: BUNDLE_FORMAT,
    EXTENSION: EXTENSION,
    LIMITS: LIMITS,
    KNOWN: KNOWN.slice(),
    detect: detect,
    validate: validate,
    fromProject: fromProject,
    toProject: toProject,
    fromDraft: fromDraft,
    toDraft: toDraft,
    fromAny: fromAny,
    keptFields: keptFields,
    contentRev: contentRev,
    cssFontId: cssFontId,
    fileName: fileName,
    serialize: serialize,
    same: same,
    stableJson: stable
  };

  global.FontStudioPackage = FontStudioPackage;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioPackage;
  }
})(typeof window !== "undefined" ? window : globalThis);
