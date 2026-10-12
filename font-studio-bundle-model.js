/* font-studio-bundle-model.js — 디자인 묶음 파일 순수 모델 (설계 v1.2 §13.6·§17.3·§18.1·§18.4, PLAN-HANGUL-001 F8)
 *
 * 묶음(font-kku-design-bundle v1, spec/design-bundle.schema.json)은 디자인 JSON과 그 디자인이 쓰는 작업실 그림(font-kku-drawing v1)을
 * 한 파일에 싣는다 — 디자인 JSON에는 그림 세트 이름(assetSet)만 있어서 혼자서는 다시 그릴 수 없다. 글꼴 파일은 싣지 않는다(§17.3):
 * 글꼴 재료는 이름(family)만 적고, 사전 검사가 "글꼴에 기댐"으로 알린다.
 *   { format: "font-kku-design-bundle", version: 1, createdAt, runtime: { version, layouts: { 프로파일: revision } },
 *     design, drawings: [그림 문서], preflight: { items: [{ code, severity, jamo?, role?, detail }], reproducible } }
 *
 * 읽기(parseBundle)는 남이 준 파일을 믿지 않는다(§18.1): 바이트 상한 → JSON → 맨 위 열쇠 허용 목록 → 모든 글·열쇠에서 꼬리표·url()·
 * javascript:·data: URI·@font-face 거절 → 그림마다 FontStudioDrawModel.normalizeDoc(경로 문법·명령·칸·부분 상한)으로 다시 검사 →
 * (runtime을 주면) 디자인을 FontKku.validateDesign으로 검사. 오류는 모두 모아 { code, path, message }로 돌려주고 등록하지 않는다 —
 * 등록은 화면이 다 통과한 뒤 한 번에 한다(실패한 열기가 반만 들어가지 않게).
 *
 * 차림:
 *   build({ design, drawings, runtimeInfo, preflight, createdAt }) → 묶음 · serialize(묶음) → 글 · fileName(묶음) → <id>.fkk-bundle.json
 *   parseBundle(글 | 객체, { maxBytes, runtime }) → { ok, bundle, errors }
 *   resolveNames(묶음, 등록된 세트 { 이름: cellsRevision | null } | [이름], { reserved }) → { bundle, renamed: [{ from, to }] }
 *   runtimeInfo(FontKku) · rolePairs() · collectPlans(FontKku, 디자인 이름, 쌍?) → [{ jamo, role, trace, items } | { jamo, role, error }]
 *   preflight({ design, plans, identity, drawings, shippedSets, profiles, runtimeLayouts }) → { items, reproducible } · summary(사전 검사)
 *   jamoJs(그림 문서) → profiles/*.jamo.js 줄 꼴 글 · snippet(design, 그림 문서 | null, { name }) → 페이지용 코드(실험)
 *
 * 브라우저(window.FontStudioBundleModel)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  var Draw = global.FontStudioDrawModel || (typeof require === "function" ? require("./font-studio-draw-model.js") : null);
  var Design = global.FontStudioDesign || (typeof require === "function" ? require("./font-studio-design-model.js") : null);
  if (!Draw || !Design) {
    throw new Error("font-studio-bundle-model: load font-studio-draw-model.js and font-studio-design-model.js first");
  }

  var FORMAT = "font-kku-design-bundle";
  var VERSION = 1;
  var EXTENSION = ".fkk-bundle.json";
  var TOP_KEYS = ["format", "version", "createdAt", "runtime", "design", "drawings", "preflight"];
  var REQUIRED_KEYS = ["format", "version", "design", "drawings"];
  var LIMITS = { maxBytes: 2000000, maxDrawings: 8, maxItems: 500, maxDepth: 48, maxErrors: 60, maxText: 2000 };
  /* 기본 제공 칸 계약 그림 세트 — 디자인이 이름으로 가리키면 페이지가 profiles/<세트>.jamo.js를 싣는다 */
  var SHIPPED_SETS = (Design.SVG_SETS || []).map(function (entry) { return entry.id; });
  /* 묶음의 그림이 이 이름을 쓰면 늘 새 이름으로 — profiles/*.jamo.js의 세트(기본 제공 + 그림 자소 글꼴 세트) */
  var RESERVED_SETS = SHIPPED_SETS.concat(["pixel", "sprite-example", "sprite-system"]);
  var DRAW_SET = /^studio-draw-[0-9a-f]{8}$/;
  var ROLES = ["initial", "medial", "final", "standalone"];
  var ROLE_TEXT = { initial: "초성", medial: "중성", final: "종성", standalone: "낱자" };
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  var JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  var JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  var SEVERITIES = ["error", "warning", "info"];
  /* 사전 검사 코드 — 차례가 목록 차례다. severity는 기본값(항목이 바꿀 수 있다: 대체 소스·실패 정책으로 그린 것은 경고) */
  var CODES = {
    "source-unresolved": { severity: "error", text: "세트를 풀 수 없음" },
    "drawing-missing": { severity: "error", text: "그림이 묶음에 없음" },
    "layout-revision-mismatch": { severity: "error", text: "배치 revision이 다름" },
    "source-missing": { severity: "error", text: "소스에 자모가 없음" },
    "compose-failed": { severity: "error", text: "조합 실패" },
    "primitive-fallback": { severity: "warning", text: "원소로 대체" },
    "font-fallback-suspected": { severity: "warning", text: "대체 글꼴 의심" },
    "font-unverified": { severity: "warning", text: "글꼴 출처 미확인" },
    "font-dependency": { severity: "info", text: "글꼴에 기댐 — 묶음에 글꼴 파일 없음" },
    "builtin-set-reference": { severity: "info", text: "기본 제공 그림 세트를 씀" },
    "drawing-included": { severity: "info", text: "그림을 함께 실음" }
  };
  var CODE_ORDER = Object.keys(CODES);
  /* 남이 준 묶음에서 받지 않는 글 — 꼬리표(<script …)·CSS 자원(url()·@import·@font-face)·스크립트 주소·data: URI(글꼴·그림 데이터) */
  var UNSAFE_TEXT = [
    { pattern: /<\s*[A-Za-z!\/?]/, what: "markup" },
    { pattern: /url\s*\(/i, what: "url()" },
    { pattern: /javascript\s*:/i, what: "javascript:" },
    { pattern: /\bdata\s*:\s*[a-z-]+\/[a-z0-9.+-]+/i, what: "data: URI" },
    { pattern: /@(?:import|font-face)\b/i, what: "CSS at-rule" }
  ];
  var CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function has(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  function fail(message) {
    throw new TypeError("font-studio-bundle: " + message);
  }

  /* FNV-1a 32비트, 소문자 16진 8자리 — font-studio-draw-model.js fnv1a와 같다 */
  function fnv1a(text) {
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ("0000000" + hash.toString(16)).slice(-8);
  }

  function utf8Length(text) {
    var bytes = 0;
    for (var index = 0; index < text.length; index += 1) {
      var code = text.charCodeAt(index);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function setName(value) {
    return String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  }

  function jsonPath(base, key) {
    if (typeof key === "number") {
      return base + "[" + key + "]";
    }
    return /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key) || /^[ㄱ-ㆎ](?:@[a-z]+)?$/.test(key) ? (base ? base + "." : "") + key
      : base + "[" + JSON.stringify(key) + "]";
  }

  // ── 런타임 정보 · 표본 ──────────────────────────────────────────────

  /* { version, layouts: { 프로파일: revision(글) } } — 묶음을 만든 런타임. 열 때 지금 런타임과 견준다 */
  function runtimeInfo(FontKku) {
    var runtime = FontKku || global.FontKku || {};
    var layouts = {};
    var profiles = runtime.layoutProfiles || {};
    Object.keys(profiles).sort().forEach(function (name) {
      if (profiles[name] && profiles[name].revision !== undefined) {
        layouts[name] = String(profiles[name].revision);
      }
    });
    return { version: String(runtime.version || ""), layouts: layouts };
  }

  /* 사전 검사가 planJamo로 푸는 역할 쌍 — 초성 19 · 중성 21 · 종성 27 */
  function rolePairs() {
    var out = [];
    [[CHO, "initial"], [JUNG, "medial"], [JONG, "final"]].forEach(function (row) {
      row[0].split("").forEach(function (jamo) {
        out.push({ jamo: jamo, role: row[1] });
      });
    });
    return out;
  }

  /* 등록된 디자인 이름으로 역할 쌍마다 FontKku.planJamo — 던지면 그 쌍에 error를 적는다 */
  function collectPlans(FontKku, name, pairs) {
    var runtime = FontKku || global.FontKku;
    if (!runtime || typeof runtime.planJamo !== "function") {
      fail("collectPlans needs FontKku.planJamo");
    }
    return (pairs || rolePairs()).map(function (pair) {
      try {
        var plan = runtime.planJamo(pair.jamo, { design: name, role: pair.role });
        return { jamo: pair.jamo, role: pair.role, trace: plan.trace || [], items: plan.items || [] };
      } catch (error) {
        return { jamo: pair.jamo, role: pair.role, error: String(error && error.message || error) };
      }
    });
  }

  // ── 사전 검사 ───────────────────────────────────────────────────────

  function sourceKind(design, id) {
    var source = design && isObject(design.sources) ? design.sources[id] : null;
    return source && source.kind ? source.kind : null;
  }

  function cellCount(doc) {
    return Draw.cellKeys(doc).length;
  }

  function makeItem(code, fields) {
    var item = { code: code, severity: fields && fields.severity || CODES[code].severity };
    if (fields && fields.jamo) {
      item.jamo = fields.jamo;
    }
    if (fields && fields.role) {
      item.role = fields.role;
    }
    item.detail = fields && fields.detail ? String(fields.detail) : "";
    return item;
  }

  /* 사전 검사(설계 v1.2 §17.3–17.4) — 이 묶음만으로 다른 페이지가 같은 모양을 그릴 수 있는가.
   * input: { design, plans(collectPlans), identity({ requests, suspected, unverified, unmeasured } 또는 기록 요청 목록),
   *          drawings, shippedSets, profiles(FontKku.layoutProfiles), runtimeLayouts(묶음을 만든 런타임의 revision) }
   * reproducible = 오류 없음 · 원소 대체 없음 · 글꼴 소스 없음 */
  function preflight(input) {
    var opts = input || {};
    var design = isObject(opts.design) ? opts.design : {};
    var sources = isObject(design.sources) ? design.sources : {};
    var shipped = Array.isArray(opts.shippedSets) ? opts.shippedSets.map(setName) : SHIPPED_SETS;
    var drawings = (opts.drawings || []).filter(function (doc) { return Draw.isDoc(doc) && !Draw.isEmpty(doc); });
    var bySet = {};
    drawings.forEach(function (doc) {
      bySet[setName(doc.set)] = doc;
    });
    var items = [];
    var seen = {};
    var unresolvedSources = {};
    var add = function (code, fields, key) {
      var id = code + "|" + (key !== undefined ? key : (fields && fields.jamo || "") + "|" + (fields && fields.role || "") + "|" + (fields && fields.detail || ""));
      if (!seen[id] && items.length < LIMITS.maxItems) {
        seen[id] = true;
        items.push(makeItem(code, fields));
      }
    };

    // 소스마다 — 그림 세트는 묶음에 실렸나·기본 제공인가, 글꼴은 이름만
    var usedSets = {};
    Object.keys(sources).sort().forEach(function (id) {
      var source = sources[id] || {};
      if (source.kind === "font") {
        add("font-dependency", { detail: id + " · " + String(source.family || "") +
          (source.weight ? " " + source.weight : "") + (source.style && source.style !== "normal" ? " " + source.style : "") });
      } else if (source.kind === "svg") {
        var set = setName(source.assetSet);
        usedSets[set] = true;
        if (bySet[set]) {
          add("drawing-included", { detail: set + " · 칸 " + cellCount(bySet[set]) + "개 (소스 " + id + ")" }, set);
        } else if (shipped.indexOf(set) >= 0) {
          add("builtin-set-reference", { detail: set + " (소스 " + id + ") — 페이지가 profiles/" + set + ".jamo.js를 싣는다" }, set);
        } else if (DRAW_SET.test(set)) {
          unresolvedSources[id] = true;
          add("drawing-missing", { detail: set + " (소스 " + id + ") — 작업실 그림인데 묶음에 그림 문서가 없다" }, set);
        } else {
          unresolvedSources[id] = true;
          add("source-unresolved", { detail: set + " (소스 " + id + ") — 묶음에도 기본 제공 세트에도 없다(페이지가 따로 등록해야 함)" }, set);
        }
      }
    });
    drawings.forEach(function (doc) {
      var set = setName(doc.set);
      if (!usedSets[set]) {
        add("drawing-included", { detail: set + " · 칸 " + cellCount(doc) + "개 (디자인이 쓰지 않음)" }, set);
      }
    });

    // 배치 — 디자인의 revision과 지금 런타임, 묶음을 만든 런타임과 지금 런타임
    var layout = isObject(design.layout) ? design.layout : null;
    var profiles = isObject(opts.profiles) ? opts.profiles : null;
    if (layout && profiles) {
      var profile = profiles[layout.profile];
      if (!profile) {
        add("layout-revision-mismatch", { detail: "배치 " + layout.profile + "가 이 런타임에 없다" });
      } else if (String(profile.revision) !== String(layout.revision)) {
        add("layout-revision-mismatch", { detail: "디자인은 " + layout.profile + " revision " + layout.revision + ", 이 런타임은 " + profile.revision });
      } else if (isObject(opts.runtimeLayouts) && has(opts.runtimeLayouts, layout.profile) &&
        String(opts.runtimeLayouts[layout.profile]) !== String(profile.revision)) {
        add("layout-revision-mismatch", { severity: "warning",
          detail: "묶음을 만든 런타임은 " + layout.profile + " revision " + opts.runtimeLayouts[layout.profile] + ", 이 런타임은 " + profile.revision });
      }
    }

    // 자모마다 — 런타임 계획(planJamo)의 기록
    (opts.plans || []).forEach(function (plan) {
      var at = { jamo: plan.jamo, role: plan.role };
      if (plan.error) {
        add("source-unresolved", { jamo: plan.jamo, role: plan.role, detail: "계획을 세우지 못함: " + plan.error });
        return;
      }
      var primitive = false;
      (plan.trace || []).forEach(function (entry) {
        var part = entry.path && entry.path.length ? "조각 " + entry.path.join(".") + "(" + entry.jamo + ") · " : "";
        var detail = function (text) {
          return { jamo: at.jamo, role: at.role, detail: part + text };
        };
        if (entry.status === "pending" && !unresolvedSources[entry.source]) {
          add("source-unresolved", { jamo: at.jamo, role: at.role, severity: "warning", detail: part + "소스 " + entry.source + "의 세트를 받는 중 — 다시 검사" });
        }
        if (entry.diagnostic === "SOURCE_MISSING") {
          add("source-missing", detail("소스 " + entry.source + "에 " + entry.jamo + " 그림이 없다(직접)"));
        } else if (entry.diagnostic === "SOURCE_FALLBACK") {
          add("source-missing", Object.assign(detail("소스 " + entry.source + " 대신 " + entry.effectiveSource + "에서"), { severity: "warning" }));
        }
        if (entry.diagnostic === "COMPOSE_SOURCE_MISSING" || entry.diagnostic === "RECIPE_DEPTH") {
          add("compose-failed", Object.assign(detail((entry.recipe ? "조립식 " + entry.recipe + " · " : "") + entry.diagnostic +
            (entry.status === "error" ? "" : " — 실패 정책으로 그림")), { severity: entry.status === "error" ? "error" : "warning" }));
        }
        if (entry.result === "primitive" && sourceKind(design, entry.source) !== "primitive") {
          primitive = true;
          add("primitive-fallback", detail("원소로 그림"));
        }
      });
      /* 획(strokes)으로 그린 자모 안에서 그림도 원형 그림(ㅡ·ㆍ·ㅇ)도 맡지 않은 획 — CSS 상자로 긋는다(재료 세트에 없는 모양) */
      if (!primitive) {
        var boxes = (plan.items || []).filter(function (item) {
          return item.drawing === null && !item.alias && !item.font && item.strokes &&
            sourceKind(design, item.source) !== "primitive" && sourceKind(design, item.source) !== null;
        });
        if (boxes.length) {
          var strokes = boxes.reduce(function (sum, item) { return sum + item.strokes.length; }, 0);
          add("primitive-fallback", { jamo: at.jamo, role: at.role, detail: "획 " + strokes + "개를 원소(CSS 상자)로 — 세트에 그 획의 그림이 없다" });
        }
      }
    });

    // 글꼴 출처 — 기기마다 다르다(같은 이름도 리눅스·안드로이드에서는 대체 글꼴일 수 있다)
    var identity = opts.identity;
    if (Array.isArray(identity)) {
      identity.forEach(function (request) {
        if (request && request.identity === "fallback-suspected") {
          add("font-fallback-suspected", { jamo: request.jamo, role: request.role, detail: "이 기기에 그 글꼴이 없을 수 있다" });
        } else if (request && (request.identity === "unverified" || request.measurement === "unavailable")) {
          add("font-unverified", { jamo: request.jamo, role: request.role,
            detail: request.measurement === "unavailable" ? "잴 수 없음" : "로컬 글꼴은 이름만으로 확인할 수 없다" });
        }
      });
    } else if (isObject(identity)) {
      if (identity.suspected) {
        add("font-fallback-suspected", { detail: "자모 요청 " + identity.suspected + "건 — 이 기기에 그 글꼴이 없을 수 있다" });
      }
      if (identity.unverified || identity.unmeasured) {
        add("font-unverified", { detail: [identity.unverified ? "출처 미확인 " + identity.unverified + "건(로컬 글꼴은 이름만으로 확인할 수 없음)" : "",
          identity.unmeasured ? "잴 수 없음 " + identity.unmeasured + "건" : ""].filter(Boolean).join(" · ") });
      }
    }

    var order = items.map(function (item, index) { return { item: item, index: index }; });
    order.sort(function (a, b) {
      return SEVERITIES.indexOf(a.item.severity) - SEVERITIES.indexOf(b.item.severity) ||
        CODE_ORDER.indexOf(a.item.code) - CODE_ORDER.indexOf(b.item.code) || a.index - b.index;
    });
    var sorted = order.map(function (entry) { return entry.item; });
    var reproducible = !sorted.some(function (item) {
      return item.severity === "error" || item.code === "primitive-fallback" || item.code === "font-dependency";
    });
    return { items: sorted, reproducible: reproducible };
  }

  /* { error, warning, info, reproducible } */
  function summary(result) {
    var out = { error: 0, warning: 0, info: 0, reproducible: Boolean(result && result.reproducible) };
    (result && result.items || []).forEach(function (item) {
      if (has(out, item.severity)) {
        out[item.severity] += 1;
      }
    });
    return out;
  }

  function describeItem(item) {
    var entry = CODES[item.code];
    var where = item.jamo ? item.jamo + (item.role ? "(" + ROLE_TEXT[item.role] + ")" : "") + " · " : "";
    return (entry ? entry.text : item.code) + " — " + where + (item.detail || "");
  }

  // ── 만들기 ─────────────────────────────────────────────────────────

  function cleanText(value, limit) {
    return typeof value === "string" && value.length <= (limit || LIMITS.maxText) && !CONTROL.test(value);
  }

  /* 사전 검사 값을 맞춘다 — 만들 때와 읽을 때 같은 꼴(undefined 열쇠 없이) */
  function normalizePreflight(input, errors, base) {
    var where = base || "preflight";
    var note = function (path, message) {
      if (errors) {
        errors.push({ code: "BUNDLE_PREFLIGHT", path: path, message: message });
      } else {
        fail(path + ": " + message);
      }
    };
    if (!isObject(input) || !Array.isArray(input.items)) {
      note(where, "preflight is { items: [...], reproducible }");
      return null;
    }
    if (input.items.length > LIMITS.maxItems) {
      note(where + ".items", "more than " + LIMITS.maxItems + " items");
      return null;
    }
    var items = [];
    input.items.forEach(function (raw, index) {
      var path = where + ".items[" + index + "]";
      if (!isObject(raw) || typeof raw.code !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(raw.code) || SEVERITIES.indexOf(raw.severity) < 0) {
        note(path, "item is { code, severity: error|warning|info, jamo?, role?, detail }");
        return;
      }
      var item = { code: raw.code, severity: raw.severity };
      if (raw.jamo !== undefined && raw.jamo !== null) {
        if (typeof raw.jamo !== "string" || raw.jamo.length !== 1) {
          note(path + ".jamo", "jamo is one character");
          return;
        }
        item.jamo = raw.jamo;
      }
      if (raw.role !== undefined && raw.role !== null) {
        if (ROLES.indexOf(raw.role) < 0) {
          note(path + ".role", "role is initial|medial|final|standalone");
          return;
        }
        item.role = raw.role;
      }
      if (raw.detail !== undefined && !cleanText(raw.detail, 400)) {
        note(path + ".detail", "detail is a short string");
        return;
      }
      item.detail = raw.detail || "";
      items.push(item);
    });
    return { items: items, reproducible: input.reproducible === true };
  }

  function normalizeRuntime(input, errors) {
    var note = function (path, message) {
      if (errors) {
        errors.push({ code: "BUNDLE_RUNTIME", path: path, message: message });
      } else {
        fail(path + ": " + message);
      }
    };
    if (!isObject(input)) {
      note("runtime", "runtime is { version, layouts }");
      return null;
    }
    if (!cleanText(input.version, 40)) {
      note("runtime.version", "runtime.version is a short string");
      return null;
    }
    var layouts = {};
    if (input.layouts !== undefined) {
      if (!isObject(input.layouts) || Object.keys(input.layouts).length > 32) {
        note("runtime.layouts", "runtime.layouts is { profile: revision }");
        return null;
      }
      var bad = Object.keys(input.layouts).filter(function (name) {
        return !/^[a-z0-9][a-z0-9-]*$/.test(name) || !cleanText(String(input.layouts[name]), 40) ||
          (typeof input.layouts[name] !== "string" && typeof input.layouts[name] !== "number");
      });
      if (bad.length) {
        note("runtime.layouts." + bad[0], "layout revisions are short strings");
        return null;
      }
      Object.keys(input.layouts).sort().forEach(function (name) {
        layouts[name] = String(input.layouts[name]);
      });
    }
    return { version: input.version, layouts: layouts };
  }

  /* 묶음 만들기. drawings의 빈 문서는 뺀다(세트로 등록할 수 없다). 그림은 normalizeDoc으로 맞춘다 — 잘못된 그림이면 TypeError */
  function build(input) {
    var opts = input || {};
    if (!isObject(opts.design)) {
      fail("build needs a design object");
    }
    var drawings = [];
    (Array.isArray(opts.drawings) ? opts.drawings : opts.drawings ? [opts.drawings] : []).forEach(function (doc, index) {
      if (!doc || (Draw.isDoc(doc) && Draw.isEmpty(doc))) {
        return;
      }
      var checked = Draw.normalizeDoc(doc);
      if (!checked.ok) {
        fail("drawings[" + index + "] — " + checked.errors.map(function (error) { return error.path + ": " + error.message; }).join("; "));
      }
      drawings.push(checked.doc);
    });
    if (drawings.length > LIMITS.maxDrawings) {
      fail("more than " + LIMITS.maxDrawings + " drawings");
    }
    var design = clone(opts.design);
    var runtime = normalizeRuntime(opts.runtimeInfo || runtimeInfo(null));
    var checks = opts.preflight ? normalizePreflight(opts.preflight) : preflight({ design: design, drawings: drawings });
    return {
      format: FORMAT,
      version: VERSION,
      createdAt: typeof opts.createdAt === "string" ? opts.createdAt : new Date().toISOString(),
      runtime: runtime,
      design: design,
      drawings: drawings,
      preflight: checks
    };
  }

  function serialize(bundle) {
    return JSON.stringify(bundle, null, 2) + "\n";
  }

  function fileName(bundle) {
    var id = bundle && bundle.design && typeof bundle.design.id === "string" && bundle.design.id ? bundle.design.id : "design";
    return id.replace(/[^A-Za-z0-9._-]+/g, "-") + EXTENSION;
  }

  // ── 읽기 ──────────────────────────────────────────────────────────

  /* 모든 글·열쇠를 훑는다 — 받지 않는 글(UNSAFE_TEXT)·제어 문자·너무 깊은 중첩 */
  function scanUnsafe(value, path, depth, errors) {
    if (errors.length >= LIMITS.maxErrors) {
      return;
    }
    if (depth > LIMITS.maxDepth) {
      errors.push({ code: "BUNDLE_TOO_DEEP", path: path, message: "nesting deeper than " + LIMITS.maxDepth });
      return;
    }
    var check = function (text, where) {
      for (var index = 0; index < UNSAFE_TEXT.length; index += 1) {
        if (UNSAFE_TEXT[index].pattern.test(text)) {
          errors.push({ code: "BUNDLE_UNSAFE_TEXT", path: where, message: UNSAFE_TEXT[index].what + " is not accepted in a bundle" });
          return;
        }
      }
      if (CONTROL.test(text)) {
        errors.push({ code: "BUNDLE_UNSAFE_TEXT", path: where, message: "control characters are not accepted in a bundle" });
      }
    };
    if (typeof value === "string") {
      check(value, path);
    } else if (Array.isArray(value)) {
      value.forEach(function (item, index) {
        scanUnsafe(item, jsonPath(path, index), depth + 1, errors);
      });
    } else if (isObject(value)) {
      Object.keys(value).forEach(function (key) {
        var where = jsonPath(path, key);
        check(key, where);
        scanUnsafe(value[key], where, depth + 1, errors);
      });
    }
  }

  /* 디자인 검사 — validateDesign(오류 전부)이 있으면 그것, 없으면 registerDesign을 내용 주소 이름으로 해 본다 */
  function checkDesign(design, runtime) {
    if (typeof runtime.validateDesign === "function") {
      var result = runtime.validateDesign(design);
      var list = Array.isArray(result) ? result : result && Array.isArray(result.errors) ? result.errors : [];
      return list.map(function (error) {
        return { code: error.code || "DESIGN_INVALID", path: "design" + (error.path ? "." + error.path : ""), message: String(error.message || error) };
      });
    }
    try {
      runtime.registerDesign("studio-bundle-check-" + fnv1a(Draw.stableJson(design)), design);
      return [];
    } catch (error) {
      return [{ code: error && error.code || "DESIGN_INVALID", path: "design" + (error && error.path ? "." + error.path : ""),
        message: String(error && error.message || error) }];
    }
  }

  /* 남이 준 묶음 읽기 → { ok, bundle, errors: [{ code, path, message }] }. options: { maxBytes, runtime(FontKku — 디자인 검사) } */
  function parseBundle(input, options) {
    var opts = options || {};
    var maxBytes = opts.maxBytes || LIMITS.maxBytes;
    var errors = [];
    var done = function () {
      return { ok: false, bundle: null, errors: errors.slice(0, LIMITS.maxErrors) };
    };
    var text = typeof input === "string" ? input : null;
    var value = input;
    if (text === null) {
      try {
        text = JSON.stringify(input);
      } catch (error) {
        errors.push({ code: "BUNDLE_JSON", path: "", message: "the bundle is not JSON data" });
        return done();
      }
    }
    if (typeof text !== "string") {
      errors.push({ code: "BUNDLE_FORMAT", path: "", message: "the bundle is a JSON object" });
      return done();
    }
    var bytes = utf8Length(text);
    if (bytes > maxBytes) {
      errors.push({ code: "BUNDLE_TOO_LARGE", path: "", message: "the bundle is " + bytes + " bytes (limit " + maxBytes + ")" });
      return done();
    }
    if (typeof input === "string") {
      try {
        value = JSON.parse(text);
      } catch (error) {
        errors.push({ code: "BUNDLE_JSON", path: "", message: "JSON syntax error: " + (error && error.message || error) });
        return done();
      }
    }
    if (!isObject(value)) {
      errors.push({ code: "BUNDLE_FORMAT", path: "", message: "the bundle is a JSON object" });
      return done();
    }
    if (value.format !== FORMAT) {
      errors.push({ code: "BUNDLE_FORMAT", path: "format", message: "format is " + JSON.stringify(FORMAT) + " (got " + JSON.stringify(value.format) + ")" });
      return done();
    }
    if (value.version !== VERSION) {
      errors.push({ code: "BUNDLE_VERSION", path: "version", message: "version " + VERSION + " is the only bundle version (got " + JSON.stringify(value.version) + ")" });
      return done();
    }
    Object.keys(value).forEach(function (key) {
      if (TOP_KEYS.indexOf(key) < 0) {
        errors.push({ code: "BUNDLE_UNKNOWN_KEY", path: jsonPath("", key), message: "unknown bundle field — a bundle never carries font files or other data" });
      }
    });
    REQUIRED_KEYS.forEach(function (key) {
      if (!has(value, key)) {
        errors.push({ code: "BUNDLE_FORMAT", path: key, message: key + " is required" });
      }
    });
    /* 받지 않는 글이 있어도 멈추지 않고 나머지(그림·디자인 검사)도 모은다 — 무엇을 고칠지 한 번에 보이게 */
    scanUnsafe(value, "", 0, errors);
    if (errors.some(function (error) { return error.code === "BUNDLE_TOO_DEEP"; })) {
      return done(); // 너무 깊은 값은 더 훑지 않는다(복사·검사가 스택을 넘지 않게)
    }

    var bundle = { format: FORMAT, version: VERSION };
    if (has(value, "createdAt")) {
      if (!cleanText(value.createdAt, 64)) {
        errors.push({ code: "BUNDLE_FORMAT", path: "createdAt", message: "createdAt is a short date string" });
      }
      bundle.createdAt = value.createdAt;
    }
    if (has(value, "runtime")) {
      bundle.runtime = normalizeRuntime(value.runtime, errors);
    }
    if (!isObject(value.design)) {
      errors.push({ code: "BUNDLE_DESIGN", path: "design", message: "design is a design JSON object (spec/design.schema.json)" });
    } else {
      bundle.design = clone(value.design);
    }
    bundle.drawings = [];
    if (!Array.isArray(value.drawings)) {
      errors.push({ code: "BUNDLE_DRAWINGS", path: "drawings", message: "drawings is a list of font-kku-drawing docs" });
    } else if (value.drawings.length > LIMITS.maxDrawings) {
      errors.push({ code: "BUNDLE_DRAWINGS", path: "drawings", message: "more than " + LIMITS.maxDrawings + " drawings" });
    } else {
      var sets = {};
      value.drawings.forEach(function (raw, index) {
        var where = "drawings[" + index + "]";
        var checked = Draw.normalizeDoc(raw);
        if (!checked.ok) {
          checked.errors.forEach(function (error) {
            errors.push({ code: "BUNDLE_DRAWING", path: where + (error.path ? "." + error.path : ""), message: error.message });
          });
          return;
        }
        if (Draw.isEmpty(checked.doc)) {
          errors.push({ code: "BUNDLE_DRAWING", path: where + ".cells", message: "a drawing has at least one drawn cell" });
          return;
        }
        if (has(sets, checked.doc.set)) {
          errors.push({ code: "BUNDLE_DRAWING", path: where + ".set", message: "set " + checked.doc.set + " appears twice" });
          return;
        }
        sets[checked.doc.set] = true;
        bundle.drawings.push(checked.doc);
      });
    }
    if (has(value, "preflight")) {
      bundle.preflight = normalizePreflight(value.preflight, errors);
    }
    if (bundle.design && opts.runtime) {
      try {
        checkDesign(bundle.design, opts.runtime).forEach(function (error) {
          errors.push(error);
        });
      } catch (error) {
        errors.push({ code: "BUNDLE_DESIGN", path: "design", message: "design check failed: " + (error && error.message || error) });
      }
    }
    if (errors.length) {
      return done();
    }
    /* 그림 세트 이름은 normalizeDoc이 소문자로 맞췄다 — 디자인의 assetSet도 같은 이름으로 */
    var drawn = {};
    bundle.drawings.forEach(function (doc) { drawn[doc.set] = true; });
    var sources = isObject(bundle.design.sources) ? bundle.design.sources : {};
    Object.keys(sources).forEach(function (id) {
      var source = sources[id];
      if (isObject(source) && source.kind === "svg" && typeof source.assetSet === "string" && source.assetSet !== setName(source.assetSet) &&
        drawn[setName(source.assetSet)]) {
        source.assetSet = setName(source.assetSet);
      }
    });
    return { ok: true, bundle: bundle, errors: [] };
  }

  /* 이름 겹침 — 묶음의 그림 세트 이름이 이미 다른 내용으로 등록되어 있거나(내용을 모르면 다르다고 본다) 기본 제공 세트 이름이면
   * studio-draw-<새 8hex>로 바꾸고 디자인 소스의 assetSet을 고쳐 쓴다. 같은 내용이면 그대로 둔다(다시 등록해도 같다).
   * registered: { 세트: cellsRevision | null } 또는 [세트]. options.reserved(기본 RESERVED_SETS) */
  function resolveNames(bundle, registered, options) {
    var out = clone(bundle);
    var known = {};
    if (Array.isArray(registered)) {
      registered.forEach(function (name) { known[setName(name)] = null; });
    } else if (isObject(registered)) {
      Object.keys(registered).forEach(function (name) {
        known[setName(name)] = registered[name] === null || registered[name] === undefined ? null : String(registered[name]);
      });
    }
    (options && Array.isArray(options.reserved) ? options.reserved : RESERVED_SETS).forEach(function (name) {
      if (!has(known, setName(name))) {
        known[setName(name)] = null;
      }
    });
    var taken = {};
    (out.drawings || []).forEach(function (doc) { taken[doc.set] = true; });
    var renamed = [];
    (out.drawings || []).forEach(function (doc) {
      var name = doc.set;
      if (!has(known, name)) {
        return;
      }
      var revision = Draw.cellsRevision(doc);
      if (known[name] === revision) {
        return;
      }
      var next;
      var attempt = 0;
      do {
        next = Draw.newSetName(name + "#" + revision + (attempt ? "#" + attempt : ""));
        attempt += 1;
      } while (has(known, next) || taken[next]);
      taken[next] = true;
      doc.set = next;
      var sources = out.design && isObject(out.design.sources) ? out.design.sources : {};
      Object.keys(sources).forEach(function (id) {
        var source = sources[id];
        if (isObject(source) && source.kind === "svg" && setName(source.assetSet) === name) {
          source.assetSet = next;
        }
      });
      renamed.push({ from: name, to: next });
    });
    return { bundle: out, renamed: renamed };
  }

  // ── 내보내기 ───────────────────────────────────────────────────────

  /* <script> 안에 넣어도 꼬리표가 닫히지 않게 — JSON의 < > & 와 줄 구분 문자를 \u 꼴로(JS로는 같은 글이다) */
  function scriptJson(value, indent) {
    return JSON.stringify(value, null, indent).replace(/[<>&\u2028\u2029]/g, function (char) {
      return "\\u" + ("0000" + char.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  /* profiles/*.jamo.js와 같은 꼴 — font-kku.js 앞이든 뒤든 싣는다(런타임이 FontKkuJamo 줄을 읽어 registerJamo) */
  function jamoJs(doc) {
    if (!Draw.isDoc(doc) || Draw.isEmpty(doc)) {
      fail("jamoJs needs a drawing with at least one drawn cell");
    }
    var cells = Draw.toCells(doc);
    var keys = Object.keys(cells).sort();
    return [
      "/* 폰꾸 칸 계약 그림 세트 · " + doc.set + " — font-kku 작업실에서 그린 자모(font-kku-drawing v1, 실험).",
      " * font-kku.js 앞이나 뒤에 싣는다 — 런타임이 FontKkuJamo 줄을 읽어 registerJamo로 등록한다. 칸은 { box: 그림 범위(획 중심선), shapes }.",
      " * 그리지 않은 자모는 짝·가획·천지인·원소로 조립한다. 디자인 소스는 { kind: \"svg\", assetSet: \"" + doc.set + "\" }. */",
      "(globalThis.FontKkuJamo = globalThis.FontKkuJamo || []).push([" + scriptJson(doc.set) + ", {",
      keys.map(function (key) { return scriptJson(key) + ": " + scriptJson(cells[key]); }).join(",\n"),
      "}, " + scriptJson(Draw.registerOptions(doc)) + "]);",
      ""
    ].join("\n");
  }

  /* 페이지용 코드(실험): 그림 세트 줄 + registerDesign + --fy-design. 디자인이 기본 제공 세트를 쓰면 그 파일을 싣는 줄을 적어 둔다 */
  function snippet(design, doc, options) {
    var name = options && options.name ? String(options.name) : Design.pageName(design);
    var json = scriptJson(design, 2).split("\n").join("\n  ");
    var shipped = [];
    var sources = design && isObject(design.sources) ? design.sources : {};
    Object.keys(sources).sort().forEach(function (id) {
      var set = sources[id] && sources[id].kind === "svg" ? setName(sources[id].assetSet) : "";
      if (SHIPPED_SETS.indexOf(set) >= 0 && shipped.indexOf(set) < 0) {
        shipped.push(set);
      }
    });
    var lines = [
      "<!-- font-kku 디자인 묶음(실험 API — font-kku.js 0.1.1부터, npm 0.1.0에는 없다): 그림 세트 + 디자인. 런타임 스크립트 다음에 둔다 — 기본 제공 그림 세트 줄은 파일을 직접 둔 경우이고, 한 줄 설치(data-fonts)로 실은 런타임은 그 세트를 스스로 받는다.",
      "     디자인은 표준 잉크 상자를 밝힌 글꼴(sebul·gothic 등)이나 font 속성이 없는 바탕 요소에서 그려진다. 글꼴 재료는 글꼴 파일을 싣지 않는다. -->"
    ];
    shipped.forEach(function (set) {
      lines.push("<script src=\"profiles/" + set + ".jamo.js\"></script>");
    });
    lines.push("<script>");
    if (doc && Draw.isDoc(doc) && !Draw.isEmpty(doc)) {
      lines.push("  " + jamoJs(doc).trim().split("\n").join("\n  "));
    }
    lines.push("  FontKku.registerDesign(" + scriptJson(name) + ", " + json + ");");
    lines.push("</script>");
    lines.push("<style>");
    lines.push("  font-kku, .font-kku { --fy-design: " + name + "; }");
    lines.push("</style>");
    lines.push("");
    return lines.join("\n");
  }

  var FontStudioBundleModel = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    EXTENSION: EXTENSION,
    TOP_KEYS: TOP_KEYS,
    REQUIRED_KEYS: REQUIRED_KEYS,
    LIMITS: LIMITS,
    CODES: CODES,
    CODE_ORDER: CODE_ORDER,
    SEVERITIES: SEVERITIES,
    SHIPPED_SETS: SHIPPED_SETS,
    RESERVED_SETS: RESERVED_SETS,
    ROLE_TEXT: ROLE_TEXT,
    runtimeInfo: runtimeInfo,
    rolePairs: rolePairs,
    collectPlans: collectPlans,
    preflight: preflight,
    summary: summary,
    describeItem: describeItem,
    build: build,
    serialize: serialize,
    fileName: fileName,
    parseBundle: parseBundle,
    resolveNames: resolveNames,
    jamoJs: jamoJs,
    snippet: snippet
  };

  global.FontStudioBundleModel = FontStudioBundleModel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioBundleModel;
  }
})(typeof window !== "undefined" ? window : globalThis);
