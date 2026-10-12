/* font-studio-palette-model.js — 글꼴 팔레트 순수 모델 (설계 v1.2 §6.1·§6.5·§13.4·§15.5·§17.4, PLAN-HANGUL-001 F7)
 *
 * DOM 없이 디자인 JSON의 글꼴 소스(팔레트 항목 = 글꼴 인스턴스: family·weight·style·stretch)를 다룬다. 화면(font-studio-palette.js)은
 * 여기서 다음 디자인을 받아 FontStudio.design.edit로 넘기고, 고르기·잠금·섞기·소스 빼기는 디자인 규칙 모델(FontStudioDesignRules)에
 * 맡긴다.
 *
 * - 새 항목 id는 pal-<n>(지금 가장 큰 n + 1 — 뺀 id를 다시 쓰지 않아 섞기 씨앗이 가리키는 항목이 바뀌지 않는다). 재료 패널이 만드는
 *   font-<x>와 겹치지 않아 withMode(font)의 쓰지 않는 font-x 지우기가 팔레트 항목을 건드리지 않는다.
 * - 준비 상태(readiness): 페이지가 @font-face로 실은 웹 글꼴인지(FontFace 목록의 status)만 본다. 로컬 글꼴 이름은 확인할 길이 없어
 *   local-unverified — document.fonts.check()는 증명이 아니라 쓰지 않는다(§6.5).
 * - 출처 확신·측정(aggregate): 런타임 기록(FontKku.traceOf)의 identity(unverified · fallback-suspected)·measurement(pixel ·
 *   unavailable)를 소스마다 센다. 같은 글꼴 이름도 기기마다 다르다.
 * - 자모 매트릭스 표본(matrixSamples): 초성 X+ㅏ · 중성 ㅇ+X · 종성 아+X · 낱자 X.
 *
 * 브라우저(window.FontStudioPaletteModel)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  var Rules = global.FontStudioDesignRules ||
    (typeof require === "function" ? require("./font-studio-design-rules.js") : null);
  if (!Rules) {
    throw new Error("font-studio-palette-model: load font-studio-design-rules.js first");
  }

  var ID_PREFIX = "pal-";
  var ID_PATTERN = /^pal-([1-9][0-9]*)$/;
  /* 재료 패널(font-studio-design-model.js withMode)이 만들고 지우는 글꼴 소스 id */
  var PANEL_ID = /^font-[a-z0-9]+$/;
  /* 현대 자모 차례(유니코드 첫가끝 차례와 같다) — 표본 음절을 만든다 */
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  var JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
  var JONG = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
  var ROLES = ["initial", "medial", "final", "standalone"];
  /* 글꼴 재료가 디자인으로 그리는 역할 — 낱자(호환 자모 글자)는 기기 글꼴 경로가 디자인으로 그리지 않아 매트릭스에 두지 않는다 */
  var MATRIX_ROLES = ["initial", "medial", "final"];
  var ROLE_TEXT = { initial: "초성", medial: "중성", final: "종성", standalone: "낱자" };
  var READINESS = ["web-loaded", "web-loading", "web-failed", "local-unverified"];
  var READINESS_TEXT = {
    "web-loaded": "웹 글꼴 실림",
    "web-loading": "웹 글꼴 받는 중",
    "web-failed": "⚠ 웹 글꼴 받기 실패",
    "local-unverified": "로컬 글꼴(확인 불가)"
  };
  var IDENTITY_TEXT = {
    pending: "출처: 재는 중",
    unknown: "출처: 기록 없음",
    unverified: "출처 미확인",
    "fallback-suspected": "⚠ 대체 글꼴 의심",
    verified: "출처 확인"
  };
  var MEASUREMENT_TEXT = {
    pending: "측정: 재는 중",
    unknown: "측정: 기록 없음",
    pixel: "화소 측정",
    partial: "⚠ 일부만 잼",
    unavailable: "⚠ 잴 수 없음"
  };
  var STYLES = ["normal", "italic", "oblique"];

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function own(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  function sourcesOf(design) {
    return design && isObject(design.sources) ? design.sources : {};
  }

  // ── 인스턴스 ──────────────────────────────────────────────────────────

  /* 인스턴스 이름: family · 굵기 · 모양 · 너비(준 것만) */
  function instanceLabel(instance) {
    var parts = [instance.family];
    if (instance.weight) {
      parts.push(String(instance.weight));
    }
    if (instance.style && instance.style !== "normal") {
      parts.push(instance.style);
    }
    if (instance.stretch && instance.stretch !== "normal") {
      parts.push(instance.stretch);
    }
    return parts.join(" ");
  }

  /* 디자인의 글꼴 소스(팔레트 항목) — 소스 차례 그대로. { id, family, weight, style, stretch, isDefault, roles, palette, label } */
  function instances(design) {
    var sources = sourcesOf(design);
    var defaults = design && isObject(design.defaults) ? design.defaults : {};
    var roleSources = design && isObject(design.roleSources) ? design.roleSources : {};
    return Object.keys(sources).filter(function (id) {
      return sources[id] && sources[id].kind === "font" && typeof sources[id].family === "string";
    }).map(function (id) {
      var source = sources[id];
      var entry = {
        id: id,
        family: source.family,
        weight: typeof source.weight === "number" ? source.weight : null,
        style: typeof source.style === "string" ? source.style : null,
        stretch: typeof source.stretch === "string" ? source.stretch : null,
        isDefault: defaults.source === id,
        roles: ROLES.filter(function (role) { return roleSources[role] === id; }),
        palette: ID_PATTERN.test(id)
      };
      entry.label = instanceLabel(entry);
      return entry;
    });
  }

  /* 다음 팔레트 id — pal-<가장 큰 n + 1>. 어떤 소스 id와도 겹치지 않는다 */
  function nextId(design) {
    var sources = sourcesOf(design);
    var max = 0;
    Object.keys(sources).forEach(function (id) {
      var match = ID_PATTERN.exec(id);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    });
    var serial = max + 1;
    while (own(sources, ID_PREFIX + serial)) {
      serial += 1;
    }
    return ID_PREFIX + serial;
  }

  /* 더할 인스턴스 정리 — family는 필수, weight는 1–1000 정수, style·stretch는 글. 보통(normal)은 적지 않는다 */
  function normalizeSpec(spec) {
    var input = spec || {};
    var family = typeof input.family === "string" ? input.family.trim() : "";
    if (!family) {
      throw new TypeError("font-studio-palette: an instance needs a family name");
    }
    if (/[\u0000-\u001f]/.test(family)) {
      throw new TypeError("font-studio-palette: family " + JSON.stringify(family) + " has control characters");
    }
    var out = { kind: "font", family: family };
    if (input.weight !== undefined && input.weight !== null && input.weight !== "") {
      var weight = Number(input.weight);
      if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
        throw new TypeError("font-studio-palette: weight is an integer 1–1000 (got " + JSON.stringify(input.weight) + ")");
      }
      out.weight = weight;
    }
    if (input.style !== undefined && input.style !== null && input.style !== "") {
      var style = String(input.style).trim();
      if (STYLES.indexOf(style) < 0 && !/^oblique( -?[0-9.]+deg)?$/.test(style)) {
        throw new TypeError("font-studio-palette: style is normal, italic or oblique (got " + JSON.stringify(input.style) + ")");
      }
      if (style !== "normal") {
        out.style = style;
      }
    }
    if (input.stretch !== undefined && input.stretch !== null && input.stretch !== "") {
      var stretch = String(input.stretch).trim();
      if (!stretch) {
        throw new TypeError("font-studio-palette: stretch is a font-stretch value");
      }
      if (stretch !== "normal") {
        out.stretch = stretch;
      }
    }
    return out;
  }

  function sameInstance(a, b) {
    return a.family === b.family && (a.weight || null) === (b.weight || null) && (a.style || null) === (b.style || null) &&
      (a.stretch || null) === (b.stretch || null);
  }

  /* 인스턴스 하나를 더한다 → { design, id, added }. 같은 인스턴스(family·weight·style·stretch)가 이미 있으면 그 id(added: false) */
  function addInstance(design, spec) {
    var source = normalizeSpec(spec);
    var sources = sourcesOf(design);
    var existing = Object.keys(sources).filter(function (id) {
      return sources[id] && sources[id].kind === "font" && sameInstance(sources[id], source);
    })[0];
    var next = clone(design) || {};
    if (existing) {
      return { design: next, id: existing, added: false };
    }
    var id = nextId(design);
    next.sources = Object.assign({}, isObject(next.sources) ? next.sources : {});
    next.sources[id] = source;
    return { design: next, id: id, added: true };
  }

  /* 인스턴스 하나를 뺀다 — 디자인 규칙 모델의 removeSource(그 소스를 고르는 규칙·역할 기본·대체 목록 정리, 기본이면 같은 종류로 옮김) */
  function removeInstance(design, id) {
    var source = sourcesOf(design)[id];
    if (!source || source.kind !== "font") {
      return { ok: false, design: null, reason: "글꼴 소스 " + id + "이 없음", defaultSource: null, droppedRules: [], clearedRoles: [],
        fallbackPruned: [] };
    }
    return Rules.removeSource(design, id);
  }

  /* 그 인스턴스 하나만 쓰는 디자인 — 카드 미리보기와 매트릭스 열이 임시 이름(lease)으로 그린다. 배치·기본 방법·대체 정책은 지금
   * 디자인을 따르고, 규칙·역할 기본은 없다 */
  function leaseDesign(design, id) {
    var source = sourcesOf(design)[id];
    if (!source || source.kind !== "font") {
      throw new TypeError("font-studio-palette: " + JSON.stringify(id) + " is not a font source");
    }
    var out = { version: design.version || "1.2", mode: "font" };
    if (isObject(design.layout)) {
      out.layout = clone(design.layout);
    }
    out.sources = {};
    out.sources[id] = clone(source);
    out.defaults = { source: id, method: design.defaults && design.defaults.method === "direct" ? "direct" : "auto" };
    out.rules = [];
    if (isObject(design.fallback)) {
      out.fallback = clone(design.fallback);
      out.fallback.sourceIds = [];
    }
    return out;
  }

  // ── 준비 상태 ─────────────────────────────────────────────────────────

  function familyKey(family) {
    return String(family == null ? "" : family).trim().replace(/^["']|["']$/g, "").toLowerCase();
  }

  /* 글꼴 이름의 준비 상태 — faces: FontFace 목록(document.fonts 또는 배열). 같은 이름의 @font-face가 하나라도 실렸으면 web-loaded,
   * 받는 중이거나 아직 부르지 않았으면 web-loading, 모두 실패했으면 web-failed, 없으면 local-unverified(로컬 이름은 증명 못 함) */
  function readiness(family, faces) {
    var name = familyKey(isObject(family) ? family.family : family);
    var statuses = [];
    var visit = function (face) {
      if (face && familyKey(face.family) === name) {
        statuses.push(String(face.status || "unloaded"));
      }
    };
    if (faces && typeof faces.forEach === "function") {
      faces.forEach(visit);
    } else if (faces && typeof faces[Symbol.iterator] === "function") {
      Array.from(faces).forEach(visit);
    }
    if (!statuses.length) {
      return "local-unverified";
    }
    if (statuses.indexOf("loaded") >= 0) {
      return "web-loaded";
    }
    if (statuses.some(function (status) { return status === "loading" || status === "unloaded"; })) {
      return "web-loading";
    }
    return "web-failed";
  }

  // ── 출처 확신·측정 ────────────────────────────────────────────────────

  function emptyStats() {
    return { requests: 0, identity: { unverified: 0, "fallback-suspected": 0 }, measurement: { pixel: 0, unavailable: 0 } };
  }

  function count(map, key) {
    map[key] = (map[key] || 0) + 1;
  }

  /* 기록 노드들(traceOf(host).nodes, 여러 바탕 요소를 이어 붙여도 된다) → 소스마다 { requests, identity: { 값: 수 },
   * measurement: { 값: 수 } }. 소스는 실제로 그린 소스(effectiveSource, 없으면 source) */
  function aggregate(nodes) {
    var out = {};
    (nodes || []).forEach(function (node) {
      (node && Array.isArray(node.requests) ? node.requests : []).forEach(function (request) {
        var id = request && (request.effectiveSource || request.source);
        if (!id) {
          return;
        }
        var entry = own(out, id) ? out[id] : (out[id] = emptyStats());
        entry.requests += 1;
        if (request.identity) {
          count(entry.identity, request.identity);
        }
        if (request.measurement) {
          count(entry.measurement, request.measurement);
        }
      });
    });
    return out;
  }

  /* 소스 하나의 셈 → 카드 한 줄: identity(fallback-suspected > unverified > verified, 기록이 없으면 pending, identity가 없으면 unknown),
   * measurement(모두 화소면 pixel, 모두 못 재면 unavailable, 섞이면 partial) */
  function summarize(stats) {
    var entry = stats || emptyStats();
    var identity = entry.identity || {};
    var measurement = entry.measurement || {};
    var out = { requests: entry.requests || 0, identity: "pending", measurement: "pending", suspected: identity["fallback-suspected"] || 0,
      unmeasured: measurement.unavailable || 0 };
    if (!out.requests) {
      return out;
    }
    out.identity = identity["fallback-suspected"] ? "fallback-suspected" : identity.unverified ? "unverified"
      : identity.verified ? "verified" : "unknown";
    var measured = Object.keys(measurement).reduce(function (sum, key) { return sum + measurement[key]; }, 0);
    out.measurement = !measured ? "unknown" : measurement.unavailable === measured ? "unavailable"
      : measurement.unavailable ? "partial" : measurement.pixel ? "pixel" : "unknown";
    return out;
  }

  /* 매트릭스 칸 하나(표본 음절을 그린 바탕 요소의 기록) — 그 역할의 요청만 본다(세벌 고정의 합자 모음은 조각 둘). warn: 대체 글꼴
   * 의심이 먼저, 그다음 잴 수 없음 */
  function cellFlags(nodes, role) {
    var out = { requests: 0, suspected: false, unmeasured: false, warn: "" };
    (nodes || []).forEach(function (node) {
      (node && Array.isArray(node.requests) ? node.requests : []).forEach(function (request) {
        if (!request || request.role !== role) {
          return;
        }
        out.requests += 1;
        if (request.identity === "fallback-suspected") {
          out.suspected = true;
        }
        if (request.measurement === "unavailable") {
          out.unmeasured = true;
        }
      });
    });
    out.warn = out.suspected ? "fallback-suspected" : out.unmeasured ? "unmeasured" : "";
    return out;
  }

  // ── 자모 매트릭스 ─────────────────────────────────────────────────────

  function syllable(cho, jung, jong) {
    return String.fromCharCode(0xAC00 + (cho * 21 + jung) * 28 + jong);
  }

  /* 역할마다 표본: 초성 X+ㅏ(가) · 중성 ㅇ+X(아) · 종성 아+X(악) · 낱자 X. { jamo, role, text, target(첫가끝 자모 · 낱자는 그대로) } */
  function matrixSamples(role) {
    if (ROLES.indexOf(role) < 0) {
      throw new TypeError("font-studio-palette: role is initial, medial, final or standalone (got " + JSON.stringify(role) + ")");
    }
    return Rules.roleJamo(role).map(function (jamo) {
      var text = jamo;
      var target = jamo;
      if (role === "initial") {
        text = syllable(CHO.indexOf(jamo), 0, 0);
        target = String.fromCharCode(0x1100 + CHO.indexOf(jamo));
      } else if (role === "medial") {
        text = syllable(CHO.indexOf("ㅇ"), JUNG.indexOf(jamo), 0);
        target = String.fromCharCode(0x1161 + JUNG.indexOf(jamo));
      } else if (role === "final") {
        text = syllable(CHO.indexOf("ㅇ"), 0, JONG.indexOf(jamo) + 1);
        target = String.fromCharCode(0x11A8 + JONG.indexOf(jamo));
      }
      return { jamo: jamo, role: role, text: text, target: target };
    });
  }

  /* 칸 하나의 상태: chosen — 그 자모·역할 칸의 규칙(고른 것 pick · 섞은 것 mix · 손으로 적은 것 other)이 이 소스를 고르는가,
   * locked — 잠금(자동 섞기가 건너뛴다) */
  function cellState(design, jamo, role, sourceId) {
    var choice = Rules.getChoice(design, jamo, role);
    var chosen = choice.origin !== "none" && choice.source === sourceId;
    return {
      chosen: chosen,
      origin: chosen ? choice.origin : "none",
      ruleId: chosen ? choice.ruleId : null,
      locked: Rules.isLocked(design, { jamo: jamo, role: role })
    };
  }

  /* 매트릭스 한 판: [{ jamo, role, text, target, cells: [{ source, chosen, origin, ruleId, locked }] }] */
  function matrix(design, role, sourceIds) {
    var ids = Array.isArray(sourceIds) ? sourceIds : instances(design).map(function (entry) { return entry.id; });
    return matrixSamples(role).map(function (sample) {
      var row = clone(sample);
      row.cells = ids.map(function (id) {
        var state = cellState(design, sample.jamo, role, id);
        state.source = id;
        return state;
      });
      return row;
    });
  }

  /* 디자인의 섞은 칸 수(mix-* 규칙) */
  function mixCount(design) {
    return (design && Array.isArray(design.rules) ? design.rules : []).filter(function (rule) {
      return rule && String(rule.id).indexOf("mix-") === 0;
    }).length;
  }

  var FontStudioPaletteModel = {
    ID_PREFIX: ID_PREFIX,
    ID_PATTERN: ID_PATTERN,
    PANEL_ID: PANEL_ID,
    ROLES: ROLES,
    MATRIX_ROLES: MATRIX_ROLES,
    ROLE_TEXT: ROLE_TEXT,
    READINESS: READINESS,
    READINESS_TEXT: READINESS_TEXT,
    IDENTITY_TEXT: IDENTITY_TEXT,
    MEASUREMENT_TEXT: MEASUREMENT_TEXT,
    instances: instances,
    instanceLabel: instanceLabel,
    nextId: nextId,
    normalizeSpec: normalizeSpec,
    addInstance: addInstance,
    removeInstance: removeInstance,
    leaseDesign: leaseDesign,
    readiness: readiness,
    aggregate: aggregate,
    summarize: summarize,
    cellFlags: cellFlags,
    matrixSamples: matrixSamples,
    cellState: cellState,
    matrix: matrix,
    mixCount: mixCount
  };

  global.FontStudioPaletteModel = FontStudioPaletteModel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioPaletteModel;
  }
})(typeof window !== "undefined" ? window : globalThis);
