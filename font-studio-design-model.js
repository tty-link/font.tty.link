/* font-studio-design-model.js — 작업실 디자인 패널의 순수 도우미 (설계 v1.2 §13, ADR-025 F, ADR-026)
 *
 * DOM 없이 디자인 JSON(spec/design.schema.json)을 다룬다. 기본 디자인(세벌 고정), 재료 바꾸기, 배치 바꾸기와 문맥 규칙 충돌,
 * JSON 읽기 오류의 줄·칸, 검증 오류 코드의 한국어 설명, 비교 칸 자리 세기. 정본 검증은 런타임 FontKku.validateDesign(오류 전부)·
 * registerDesign이 한다 — 여기서는 화면이 미리 알려 줄 것만 본다. 작업실은 이름 하나(STUDIO_NAME)를 registerDesign의
 * { replace: true }로 바꿔 쓴다 — 등록부가 늘지 않는다. 브라우저(window.FontStudioDesign)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  /* spec/design.schema.json의 맨 위 속성 — 단위 시험이 스키마와 대조한다 */
  var TOP_KEYS = ["$schema", "version", "id", "title", "mode", "layout", "sources", "defaults", "roleSources", "rules", "fallback",
    "editor", "display"];
  /* 작업실이 등록하는 이름 하나 — 고칠 때마다 registerDesign(STUDIO_NAME, json, { replace: true })로 바꾼다 */
  var STUDIO_NAME = "studio-design";
  var FIXED_PROFILE = "sebul-fixed-v1";
  var SQUARE_PROFILE = "square-context-v1";
  /* 세벌 고정이 조각 둘로 찍는 합자 모음(font-kku.js FIXED_COMPOUND_MEDIALS와 같다) */
  var COMPOUND_MEDIALS = "ㅘㅙㅚㅝㅞㅟㅢ";
  var DEFAULT_FAMILY = "Apple SD Gothic Neo";
  var ROLES = ["initial", "medial", "final"];
  /* 칸 계약 그림 세트(profiles/<id>.jamo.js) — 작업실이 직접 싣는다 */
  var SVG_SETS = [
    { id: "dunggeun-box", label: "둥근" },
    { id: "pilgi-box", label: "필기" },
    { id: "butgeul-box", label: "붓" }
  ];
  /* 설계 v1.2 §13.1 시작 화면의 세 선택지 — "무엇으로 그릴까"만 바꾸고 배치는 그대로 둔다 */
  var MATERIALS = [
    { mode: "primitive", title: "선·원으로 만들기", help: "획을 선·점·원 원소로 그린다. 기기 글꼴 없이 어디서나 같은 모양" },
    { mode: "svg", title: "직접 그려 만들기", help: "SVG 그림 세트. 원형 8부터 기본 24·확장 40으로 늘린다" },
    { mode: "font", title: "기존 글꼴로 만들기", help: "기기·웹 글꼴의 자모를 재료로. 역할마다 다른 글꼴도" }
  ];
  /* 설계 v1.2 §13.2 대표 비교 — 고친 초성 ㄱ·중성 ㅏ가 모든 사용처에 똑같이 찍히는지 */
  var COMPARE_ROWS = [
    { id: "initial", text: "가 고 과 각 곽", role: "initial", jamo: "ᄀ", label: "초성 ㄱ" },
    { id: "medial", text: "가 나 간 난", role: "medial", jamo: "ᅡ", label: "중성 ㅏ" }
  ];
  var LAYOUT_LABELS = { "sebul-fixed-v1": "세벌 고정", "square-context-v1": "네모 문맥", legacy: "지금 배치" };
  var NODE_ROLES = { choseong: "initial", head: "head" };
  var SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  var RESERVED = { legacy: true, inherit: true, initial: true, unset: true, revert: true, "revert-layer": true, none: true };

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  /* 키 차례가 정해진 직렬화 — font-kku.js stableJson과 같다(같은 내용이면 같은 글) */
  function stableJson(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(stableJson).join(",") + "]";
    }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ":" + stableJson(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /* 새 디자인 — 1.2, 세벌 고정, 선·원 재료. revision은 런타임 프로파일에서 읽는다(손으로 적지 않는다) */
  function defaultDesign(profiles) {
    var profile = profiles && profiles[FIXED_PROFILE];
    if (!profile) {
      throw new TypeError("font-studio-design: layout profile " + FIXED_PROFILE + " is not available");
    }
    return {
      version: "1.2",
      id: "my-design",
      title: "내 디자인",
      mode: "primitive",
      layout: { profile: FIXED_PROFILE, revision: profile.revision },
      sources: { primitive: { kind: "primitive" } },
      defaults: { source: "primitive", method: "auto" },
      rules: [],
      fallback: { sourceIds: [], allowPrimitive: true, onComposeFailure: "error", unverifiedFont: "allow-with-warning" }
    };
  }

  /* 배치 상태: fixed(세벌 고정) · square(네모 문맥) · legacy(배치를 적지 않은 1.0·1.1 — 지금 배치) · unknown(모르는 프로파일) */
  function layoutState(design, profiles) {
    var layout = design && design.layout;
    if (!isObject(layout)) {
      return { kind: "legacy", profile: null, revision: null, model: null };
    }
    var info = profiles && profiles[layout.profile];
    if (!info) {
      return { kind: "unknown", profile: layout.profile || null, revision: layout.revision || null, model: null };
    }
    return {
      kind: info.model === "fixed-three" ? "fixed" : "square",
      profile: layout.profile,
      revision: layout.revision,
      model: info.model
    };
  }

  function layoutLabel(profile) {
    return LAYOUT_LABELS[profile || "legacy"] || profile;
  }

  /* 규칙·조각 binding이 가리키는 소스 id 전부 */
  function applySourceIds(apply, out) {
    if (!isObject(apply)) {
      return out;
    }
    if (typeof apply.source === "string") {
      out.push(apply.source);
    }
    if (Array.isArray(apply.fallbackSources)) {
      apply.fallbackSources.forEach(function (id) { out.push(id); });
    }
    if (isObject(apply.bindings)) {
      Object.keys(apply.bindings).forEach(function (part) { applySourceIds(apply.bindings[part], out); });
    }
    return out;
  }

  function ruleSourceIds(rule) {
    return applySourceIds(rule && rule.apply, []);
  }

  function sourceKind(design, id) {
    var source = design && isObject(design.sources) ? design.sources[id] : null;
    return source && source.kind;
  }

  /* 지금 디자인의 그림 세트·글꼴(재료 칸에 보일 값) */
  function currentSet(design) {
    var id = design && design.defaults && design.defaults.source;
    var source = design && isObject(design.sources) ? design.sources[id] : null;
    return source && source.kind === "svg" ? source.assetSet || null : null;
  }

  function currentFamilies(design) {
    if (!design || design.mode !== "font" || !isObject(design.sources)) {
      return null;
    }
    var family = function (id) {
      var source = design.sources[id];
      return source && source.kind === "font" ? source.family : null;
    };
    var out = { base: family(design.defaults && design.defaults.source) };
    ROLES.forEach(function (role) {
      var id = design.roleSources && design.roleSources[role];
      if (id && family(id) && family(id) !== out.base) {
        out[role] = family(id);
      }
    });
    return out;
  }

  function cleanFamily(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function nextFontId(taken) {
    for (var index = 0; index < 26; index += 1) {
      var id = "font-" + String.fromCharCode(97 + index);
      if (!taken[id]) {
        return id;
      }
    }
    var serial = 27;
    while (taken["font-" + serial]) {
      serial += 1;
    }
    return "font-" + serial;
  }

  /* 규칙·대체가 가리키는데 소스에서 빠진 것을 정리한다 — 빠진 규칙 id를 돌려준다 */
  function pruneDangling(next) {
    var dropped = [];
    if (Array.isArray(next.rules)) {
      next.rules = next.rules.filter(function (rule) {
        var keep = ruleSourceIds(rule).every(function (id) { return next.sources[id]; });
        if (!keep) {
          dropped.push(rule && rule.id);
        }
        return keep;
      });
    }
    if (isObject(next.fallback) && Array.isArray(next.fallback.sourceIds)) {
      next.fallback.sourceIds = next.fallback.sourceIds.filter(function (id) { return next.sources[id]; });
    }
    return dropped;
  }

  /* 재료 바꾸기(설계 v1.2 §13.1) — 배치·id·제목·표시는 그대로 둔다. 같은 재료면 기본 소스만 고치고 다른 소스·규칙은 두며,
   * 다른 재료면 소스를 새로 만들고 사라진 소스를 가리키던 규칙을 뺀다(dropped). 1.0·1.1 디자인에 배치를 끼워 넣지 않는다.
   * params — svg: { set }, font: { families: { base, initial?, medial?, final? } } */
  function withMode(design, mode, params) {
    var opts = params || {};
    if (!MATERIALS.some(function (entry) { return entry.mode === mode; })) {
      throw new TypeError("font-studio-design: mode is primitive, svg or font (got " + JSON.stringify(mode) + ")");
    }
    var next = clone(design) || {};
    var same = next.mode === mode && isObject(next.sources);
    var method = next.defaults && next.defaults.method === "direct" ? "direct" : "auto";
    var sources = same ? next.sources : {};
    var base;
    if (mode === "primitive") {
      base = same && sourceKind(next, next.defaults && next.defaults.source) === "primitive" ? next.defaults.source : "primitive";
      sources[base] = sources[base] || { kind: "primitive" };
    } else if (mode === "svg") {
      var set = opts.set || currentSet(next) || SVG_SETS[0].id;
      base = same && sourceKind(next, next.defaults && next.defaults.source) === "svg" ? next.defaults.source : "art";
      sources[base] = Object.assign({}, same ? sources[base] : {}, { kind: "svg", assetSet: set });
      next.editor = Object.assign({}, isObject(next.editor) ? next.editor : {});
      next.editor.authoringTarget = next.editor.authoringTarget || "origin8";
    } else {
      var families = opts.families || currentFamilies(next) || {};
      var main = cleanFamily(families.base) || DEFAULT_FAMILY;
      var byFamily = {};
      var taken = {};
      Object.keys(sources).forEach(function (id) {
        taken[id] = true;
        if (sources[id] && sources[id].kind === "font" && !byFamily[sources[id].family]) {
          byFamily[sources[id].family] = id;
        }
      });
      var used = {};
      var idFor = function (family) {
        if (!byFamily[family]) {
          var id = nextFontId(taken);
          taken[id] = true;
          byFamily[family] = id;
          sources[id] = { kind: "font", family: family };
        }
        used[byFamily[family]] = true;
        return byFamily[family];
      };
      /* 기본 소스는 자리를 지킨다 — 다른 규칙이 그 id를 가리켜도 글꼴만 바뀐다 */
      var current = same && sourceKind(next, next.defaults && next.defaults.source) === "font" ? next.defaults.source : null;
      if (current && sources[current].family !== main && !byFamily[main]) {
        delete byFamily[sources[current].family];
        sources[current] = Object.assign({}, sources[current], { family: main });
        byFamily[main] = current;
      }
      base = idFor(main);
      var roleSources = {};
      ROLES.forEach(function (role) {
        var family = cleanFamily(families[role]);
        if (family && family !== main) {
          roleSources[role] = idFor(family);
        }
      });
      if (isObject(next.roleSources) && next.roleSources.standalone && sources[next.roleSources.standalone]) {
        roleSources.standalone = next.roleSources.standalone;
        used[roleSources.standalone] = true;
      }
      if (Object.keys(roleSources).length) {
        next.roleSources = roleSources;
      } else {
        delete next.roleSources;
      }
      /* 패널이 만든 글꼴 소스(font-x) 가운데 이제 아무도 가리키지 않는 것은 지운다 */
      var referenced = {};
      (next.rules || []).forEach(function (rule) { ruleSourceIds(rule).forEach(function (id) { referenced[id] = true; }); });
      ((next.fallback && next.fallback.sourceIds) || []).forEach(function (id) { referenced[id] = true; });
      Object.keys(sources).forEach(function (id) {
        if (/^font-[a-z0-9]+$/.test(id) && !used[id] && !referenced[id]) {
          delete sources[id];
        }
      });
    }
    if (mode !== "font") {
      delete next.roleSources;
    }
    next.mode = mode;
    next.sources = sources;
    next.defaults = { source: base, method: method };
    return { design: next, dropped: pruneDangling(next) };
  }

  /* 세벌 고정이 받지 않는 것(설계 v1.2 L08·L09·L13): 이웃 모음·받침으로 고르는 규칙, 자리마다 다른 변주, 통짜 합자 모음 */
  function fixedConflicts(design) {
    var out = [];
    (design && Array.isArray(design.rules) ? design.rules : []).forEach(function (rule) {
      var match = rule && isObject(rule.match) ? rule.match : {};
      if (match.vowelLayout !== undefined) {
        out.push({ ruleId: rule.id, field: "vowelLayout", value: match.vowelLayout, jamo: match.jamo, role: match.role || null });
      }
      if (match.hasFinal !== undefined) {
        out.push({ ruleId: rule.id, field: "hasFinal", value: match.hasFinal, jamo: match.jamo, role: match.role || null });
      }
      if (COMPOUND_MEDIALS.indexOf(match.jamo) >= 0 && (!match.role || match.role === "medial") &&
          isObject(rule.apply) && rule.apply.method === "direct") {
        out.push({ ruleId: rule.id, field: "method", value: "direct", jamo: match.jamo, role: match.role || null });
      }
    });
    if (design && isObject(design.display) && design.display.variationScope === "occurrence") {
      out.push({ ruleId: null, field: "variationScope", value: "occurrence", jamo: null, role: null });
    }
    return out;
  }

  /* 충돌 한 줄 설명 */
  function describeConflict(conflict) {
    switch (conflict.field) {
      case "vowelLayout":
        return "규칙 " + conflict.ruleId + " — " + conflict.jamo + "(" + (conflict.role || "역할 없음") + ")을 모음 짜임 " +
          conflict.value + "로 고름";
      case "hasFinal":
        return "규칙 " + conflict.ruleId + " — " + conflict.jamo + "(" + (conflict.role || "역할 없음") + ")을 받침 " +
          (conflict.value ? "있음" : "없음") + "으로 고름";
      case "method":
        return "규칙 " + conflict.ruleId + " — 합자 모음 " + conflict.jamo + "을 통째로(direct) 그림 — 세벌 고정은 조각 둘로 찍는다";
      default:
        return "표시 — 자리마다 다른 변주(display.variationScope: occurrence)";
    }
  }

  /* 배치 바꾸기 — 사용자가 고를 때만 1.2 + layout이 된다(L25: 이전 디자인에 배치를 몰래 끼우지 않는다). 세벌 고정으로 갈 때
   * 문맥 규칙이 있으면 디자인을 돌려주지 않고 충돌만 돌려준다 — 지우거나 역할별 값으로 확정하기 전에는 적용하지 않는다(§13.2). */
  function withLayout(design, profile, profiles) {
    var info = profiles && profiles[profile];
    if (!info) {
      throw new TypeError("font-studio-design: unknown layout profile " + JSON.stringify(profile));
    }
    var conflicts = info.model === "fixed-three" ? fixedConflicts(design) : [];
    if (conflicts.length) {
      return { design: null, conflicts: conflicts };
    }
    var next = clone(design);
    next.version = "1.2";
    next.layout = { profile: profile, revision: info.revision };
    return { design: next, conflicts: [] };
  }

  function specificity(match) {
    return 1 + (match.role ? 1 : 0) + (match.vowelLayout !== undefined ? 1 : 0) + (match.hasFinal !== undefined ? 1 : 0);
  }

  function construction(apply) {
    if (!isObject(apply) || (apply.method === undefined && apply.recipe === undefined && apply.bindings === undefined)) {
      return null;
    }
    return stableJson({ method: apply.method || "auto", recipe: apply.recipe || null, bindings: apply.bindings || null });
  }

  /* 같은 요청에 함께 맞는 두 규칙이 다른 소스·조립을 고르면 런타임이 등록을 거부한다(같은 구체성 충돌) — 그 쌍을 미리 찾는다 */
  function ruleCollisions(rules) {
    var out = [];
    var list = Array.isArray(rules) ? rules : [];
    list.forEach(function (a, i) {
      list.slice(i + 1).forEach(function (b) {
        var ma = isObject(a && a.match) ? a.match : {};
        var mb = isObject(b && b.match) ? b.match : {};
        var together = ma.jamo === mb.jamo && specificity(ma) === specificity(mb) &&
          (!ma.role || !mb.role || ma.role === mb.role) &&
          (ma.vowelLayout === undefined || mb.vowelLayout === undefined || ma.vowelLayout === mb.vowelLayout) &&
          (ma.hasFinal === undefined || mb.hasFinal === undefined || ma.hasFinal === mb.hasFinal);
        if (!together) {
          return;
        }
        var sa = a.apply && a.apply.source;
        var sb = b.apply && b.apply.source;
        if (sa && sb && sa !== sb) {
          out.push({ rules: [a.id, b.id], jamo: ma.jamo, role: ma.role || null, field: "source", values: [sa, sb] });
        }
        var ca = construction(a.apply);
        var cb = construction(b.apply);
        if (ca && cb && ca !== cb) {
          out.push({ rules: [a.id, b.id], jamo: ma.jamo, role: ma.role || null, field: "construction", values: [ca, cb] });
        }
      });
    });
    return out;
  }

  function isConflicting(rule) {
    return fixedConflicts({ rules: [rule] }).length > 0;
  }

  /* 충돌 풀기 — drop: 문맥 규칙·통짜 합자 모음 규칙을 지운다. flatten: 문맥 조건(vowelLayout·hasFinal)만 떼어 역할별 값으로
   * 확정하고 통짜 합자 모음 규칙은 지운다(removed). 떼어 낸 뒤 같은 자모·역할에 다른 값이 남으면 합치지 않고 collisions로
   * 돌려준다(design: null). 자리마다 변주는 둘 다 jamo로 바꾼다. 남은 것을 profile 배치로 바꾼다. */
  function resolveConflicts(design, kind, profile, profiles) {
    if (kind !== "drop" && kind !== "flatten") {
      throw new TypeError("font-studio-design: resolve with drop or flatten (got " + JSON.stringify(kind) + ")");
    }
    var next = clone(design);
    var removed = [];
    var flattened = [];
    if (Array.isArray(next.rules)) {
      next.rules = next.rules.filter(function (rule) {
        if (!isConflicting(rule)) {
          return true;
        }
        var match = rule.match || {};
        var direct = COMPOUND_MEDIALS.indexOf(match.jamo) >= 0 && (!match.role || match.role === "medial") &&
          isObject(rule.apply) && rule.apply.method === "direct";
        if (kind === "drop" || direct) {
          removed.push(rule.id);
          return false;
        }
        delete match.vowelLayout;
        delete match.hasFinal;
        flattened.push(rule.id);
        return true;
      });
    }
    if (isObject(next.display) && next.display.variationScope === "occurrence") {
      next.display.variationScope = "jamo";
    }
    var collisions = kind === "flatten" ? ruleCollisions(next.rules).filter(function (entry) {
      return flattened.indexOf(entry.rules[0]) >= 0 || flattened.indexOf(entry.rules[1]) >= 0;
    }) : [];
    if (collisions.length) {
      return { design: null, removed: removed, flattened: flattened, collisions: collisions };
    }
    var layout = withLayout(next, profile || FIXED_PROFILE, profiles);
    return { design: layout.design, removed: removed, flattened: flattened, collisions: [], conflicts: layout.conflicts };
  }

  function describeCollision(entry) {
    return "규칙 " + entry.rules.join("·") + " — " + entry.jamo + "(" + (entry.role || "역할 없음") + ")에 " +
      (entry.field === "source" ? "다른 소스 " + entry.values.join(" / ") : "다른 조립식") + "을 고름";
  }

  /* 네모 문맥 탭에 보일 문맥 규칙(이웃 모음 짜임·받침으로 고르는 규칙) */
  function contextRules(design) {
    return (design && Array.isArray(design.rules) ? design.rules : []).filter(function (rule) {
      var match = rule && isObject(rule.match) ? rule.match : {};
      return match.vowelLayout !== undefined || match.hasFinal !== undefined;
    }).map(function (rule) {
      var match = rule.match;
      var when = [];
      if (match.vowelLayout !== undefined) {
        when.push("짜임 " + match.vowelLayout);
      }
      if (match.hasFinal !== undefined) {
        when.push(match.hasFinal ? "받침 있음" : "받침 없음");
      }
      var apply = rule.apply || {};
      var what = [];
      if (apply.source) {
        what.push("소스 " + apply.source);
      }
      if (apply.method || apply.recipe) {
        what.push((apply.method || "auto") + (apply.recipe ? " " + apply.recipe : ""));
      }
      return { id: rule.id, text: match.jamo + " " + (match.role || "") + " · " + when.join(" · ") + " → " + (what.join(" · ") || "-") };
    });
  }

  function removeRule(design, id) {
    var next = clone(design);
    next.rules = (next.rules || []).filter(function (rule) { return !rule || rule.id !== id; });
    return next;
  }

  /* 첫 문법 오류의 위치 — 브라우저마다 JSON.parse 오류 글이 다르고(V8의 "Unexpected token …"은 위치가 없다) 줄·칸을 늘 보이려고
   * 작은 검사기로 직접 찾는다. 문법이 맞으면 -1 */
  var NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

  function syntaxOffset(text) {
    var i = 0;
    function fail() {
      throw { offset: i };
    }
    function space() {
      while (i < text.length && " \t\n\r".indexOf(text.charAt(i)) >= 0) {
        i += 1;
      }
    }
    function string() {
      i += 1;
      while (i < text.length) {
        var ch = text.charAt(i);
        if (ch === "\"") {
          i += 1;
          return;
        }
        if (ch < " ") {
          fail();
        }
        i += ch === "\\" ? 2 : 1;
      }
      fail();
    }
    function value() {
      space();
      var ch = text.charAt(i);
      if (ch === "{" || ch === "[") {
        var close = ch === "{" ? "}" : "]";
        i += 1;
        space();
        if (text.charAt(i) === close) {
          i += 1;
          return;
        }
        for (;;) {
          if (close === "}") {
            space();
            if (text.charAt(i) !== "\"") {
              fail();
            }
            string();
            space();
            if (text.charAt(i) !== ":") {
              fail();
            }
            i += 1;
          }
          value();
          space();
          if (text.charAt(i) === ",") {
            i += 1;
            continue;
          }
          if (text.charAt(i) === close) {
            i += 1;
            return;
          }
          fail();
        }
      }
      if (ch === "\"") {
        string();
        return;
      }
      NUMBER.lastIndex = i;
      if (NUMBER.test(text)) {
        i = NUMBER.lastIndex;
        return;
      }
      var words = ["true", "false", "null"];
      for (var index = 0; index < words.length; index += 1) {
        if (text.substr(i, words[index].length) === words[index]) {
          i += words[index].length;
          return;
        }
      }
      fail();
    }
    try {
      value();
      space();
      if (i < text.length) {
        fail();
      }
      return -1;
    } catch (error) {
      if (error && typeof error.offset === "number") {
        return error.offset;
      }
      throw error;
    }
  }

  /* 오류 위치(글자 차례) → 줄·칸. 검사기가 못 찾으면 V8 오류 글의 "line L column C"·"position N"을 쓴다 */
  function errorPosition(message, source) {
    var offset = syntaxOffset(source);
    if (offset < 0) {
      var lineColumn = /line (\d+) column (\d+)/.exec(message);
      if (lineColumn) {
        return { line: Number(lineColumn[1]), column: Number(lineColumn[2]) };
      }
      var position = /position (\d+)/.exec(message);
      if (!position) {
        return { line: null, column: null };
      }
      offset = Number(position[1]);
    }
    var before = source.slice(0, offset).split("\n");
    return { line: before.length, column: before[before.length - 1].length + 1 };
  }

  /* 디자인 JSON 읽기 → { design } | { error: { message, line, column } }. 모양만 본다 — 검증은 registerDesign */
  function parseDesignText(text) {
    var source = String(text == null ? "" : text);
    if (!source.trim()) {
      return { error: { message: "디자인 JSON이 비었습니다", line: null, column: null } };
    }
    var value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      var at = errorPosition(String(error && error.message), source);
      return {
        error: {
          message: "JSON 문법 오류" + (at.line ? " — " + at.line + "줄 " + at.column + "칸" : "") + ": " + (error && error.message),
          line: at.line,
          column: at.column
        }
      };
    }
    if (!isObject(value)) {
      return { error: { message: "디자인 JSON은 객체({ … })여야 합니다", line: 1, column: 1 } };
    }
    if (value.format === "font-kku-font-project") {
      return { error: { message: "글꼴 프로젝트 파일입니다 — 도구 막대의 '프로젝트 열기'로 여세요", line: null, column: null } };
    }
    if (typeof value.mode !== "string" || !isObject(value.sources)) {
      return { error: { message: "디자인 JSON이 아닙니다 — mode와 sources가 있어야 합니다", line: null, column: null } };
    }
    return { design: value };
  }

  /* 런타임 오류 글의 앞머리(작업실 이름) 떼기: 'font-kku: design "studio-design" rules[0]…' → 'rules[0]…' */
  function stripErrorPrefix(text) {
    return String(text == null ? "" : text).replace(/^(TypeError: )?font-kku: design "[^"]*" /, "");
  }

  /* 검증 오류 코드(FontKku.validateDesign·registerDesign, font-kku.d.ts DesignErrorCode)의 한국어 설명. 화면은 코드(영어)와
   * 런타임 문구(자리 포함)를 함께 보인다 — 없는 코드는 런타임 문구만 */
  var ERROR_TEXT = {
    DESIGN_NOT_OBJECT: "디자인 JSON은 객체({ … })여야 합니다",
    DESIGN_VERSION_INVALID: "version은 1.0·1.1·1.2 가운데 하나입니다",
    DESIGN_MODE_INVALID: "mode는 primitive·svg·font 가운데 하나입니다",
    DESIGN_LAYOUT_MISSING: "1.2 디자인은 배치 layout { profile, revision }을 적어야 합니다",
    DESIGN_LAYOUT_UNKNOWN: "모르는 배치 프로파일입니다 — sebul-fixed-v1(세벌 고정)·square-context-v1(네모 문맥)",
    DESIGN_LAYOUT_REVISION: "배치 revision이 런타임 프로파일과 다릅니다 — 배치 단추로 다시 고르면 맞춥니다",
    DESIGN_FIXED_VARIATION: "세벌 고정은 자리마다 다른 변주(display.variationScope: occurrence)를 받지 않습니다",
    DESIGN_FIXED_CONTEXT: "세벌 고정은 역할·자모로만 고릅니다 — 이웃 모음 짜임·받침 조건(vowelLayout·hasFinal)은 네모 문맥에서만",
    DESIGN_FIXED_COMPOUND: "세벌 고정은 합자 모음을 조각 둘로 찍습니다 — 통째로(direct) 그리는 규칙은 네모 문맥에서만",
    DESIGN_SOURCES_EMPTY: "소스(sources)가 하나는 있어야 합니다",
    DESIGN_SOURCE_INVALID: "소스 모양이 틀렸습니다 — id는 글자·숫자로 시작, svg는 assetSet(그림 세트 이름), font는 family",
    DESIGN_SOURCE_KIND: "소스 종류(kind)가 디자인 재료(mode)와 다릅니다",
    DESIGN_SOURCE_UNKNOWN: "sources에 없는 소스를 가리킵니다",
    DESIGN_METHOD_INVALID: "방법(method)이 틀렸습니다 — auto·direct·compose(기본값은 auto·direct), direct는 조립식을 고르지 않습니다",
    DESIGN_ROLE_INVALID: "역할은 initial·medial·final·standalone 가운데 하나입니다",
    DESIGN_RULE_INVALID: "규칙(rules)은 객체의 목록입니다",
    DESIGN_RULE_ID: "규칙마다 겹치지 않는 id가 있어야 합니다",
    DESIGN_RULE_MATCH: "규칙의 match가 틀렸습니다 — jamo는 현대 호환 자모, 짜임·받침 조건은 role과 함께",
    DESIGN_RULE_EMPTY: "규칙의 apply가 아무것도 고르지 않습니다",
    DESIGN_RULE_CONFLICT: "같은 구체성의 두 규칙이 같은 요청에 다른 값을 고릅니다 — 하나를 지우거나 더 좁히세요",
    DESIGN_APPLY_INVALID: "규칙의 apply는 객체여야 합니다",
    DESIGN_RECIPE_INVALID: "조립식(recipe)이 틀렸습니다 — spec/jamo-recipes.json의 id로 그 자모를 짓는 것, compose·bindings에는 꼭",
    DESIGN_BINDING_INVALID: "조각 binding이 그 조립식의 자모 조각이 아닙니다",
    DESIGN_FALLBACK_INVALID: "대체(fallback) 설정이 틀렸습니다 — 소스 목록, onComposeFailure는 error·direct·primitive"
  };

  /* 오류 하나({ code, path, message } — 문법 오류는 code 없이) → 화면에 보일 { code, path, message, text } */
  function describeError(error) {
    var entry = error && typeof error === "object" ? error : { message: String(error) };
    var code = typeof entry.code === "string" ? entry.code : null;
    return { code: code, path: typeof entry.path === "string" ? entry.path : "", message: stripErrorPrefix(entry.message),
      text: code && Object.prototype.hasOwnProperty.call(ERROR_TEXT, code) ? ERROR_TEXT[code] : null };
  }

  /* 한 줄: [CODE] 한국어 — 런타임 문구 */
  function errorLine(error) {
    var entry = describeError(error);
    return (entry.code ? "[" + entry.code + "] " : "") + (entry.text ? entry.text + " — " : "") + entry.message;
  }

  function designFileName(design) {
    var id = design && typeof design.id === "string" && design.id ? design.id : "design";
    return id.replace(/[^A-Za-z0-9._-]+/g, "-") + ".design.json";
  }

  /* 페이지에 쓸 이름 — 디자인 id를 등록 이름 문법(소문자·숫자·-)으로 */
  function pageName(design) {
    var name = String(design && design.id ? design.id : "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    return name && /^[a-z0-9]/.test(name) && !RESERVED[name] ? name : "my-design";
  }

  function pretty(design) {
    return JSON.stringify(design, null, 2);
  }

  /* 페이지용 코드 — registerDesign은 실험 API로 0.1.1부터 있다(npm 0.1.0에는 없다) */
  function pageSnippet(design) {
    var name = pageName(design);
    var json = pretty(design).split("\n").join("\n  ");
    return [
      "<!-- font-kku 디자인(실험 API — font-kku.js 0.1.1부터, npm 0.1.0에는 없다): 런타임 스크립트 다음에 둔다.",
      "     디자인은 표준 잉크 상자를 밝힌 글꼴(sebul·gothic 등)이나 font 속성이 없는 바탕 요소에서 그려진다. -->",
      "<script>",
      "  FontKku.registerDesign(" + JSON.stringify(name) + ", " + json + ");",
      "</script>",
      "<style>",
      "  font-kku, .font-kku { --fy-design: " + name + "; }",
      "</style>",
      ""
    ].join("\n");
  }

  // ── 비교 칸 자리 세기 ──────────────────────────────────────────────

  /* 자모 노드의 역할: 세벌 고정 도장(data-fy-stamp)이 먼저, 아니면 data-fy-role(choseong · jung-* · jong-* · head) */
  function nodeRole(roleAttr, stampAttr) {
    if (stampAttr) {
      return stampAttr;
    }
    var role = String(roleAttr || "");
    if (NODE_ROLES[role]) {
      return NODE_ROLES[role];
    }
    if (/^jung-/.test(role)) {
      return "medial";
    }
    if (/^jong-/.test(role)) {
      return "final";
    }
    return role || null;
  }

  /* 머리 음절(과의 "고")이 대상 자모를 품는가 — 네모 문맥은 초성 ㄱ을 머리 음절 안에 따로 그린다 */
  function headHas(syllable, target) {
    var code = String(syllable || "").charCodeAt(0) - 0xac00;
    if (!(code >= 0 && code < 11172)) {
      return false;
    }
    if (target.role === "initial") {
      return String.fromCharCode(0x1100 + Math.floor(code / 588)) === target.jamo;
    }
    if (target.role === "medial") {
      return String.fromCharCode(0x1161 + Math.floor((code % 588) / 28)) === target.jamo;
    }
    return false;
  }

  /* 비교 칸 한 줄 — entries: [{ role, jamo, box: [x, y, w, h] }](글자 상자 기준 px). 대상 자모가 몇 번 나오고(count) 자리가
   * 몇 가지인지(variants — tolerance px 안이면 같은 자리), 머리 음절로 그려진 곳(heads)이 몇인지 */
  function placementReadout(entries, target, tolerance) {
    var tol = tolerance === undefined ? 0.75 : tolerance;
    var groups = [];
    var count = 0;
    var heads = 0;
    (entries || []).forEach(function (entry) {
      if (entry.role === "head") {
        if (headHas(entry.jamo, target)) {
          heads += 1;
          count += 1;
        }
        return;
      }
      if (entry.role !== target.role || entry.jamo !== target.jamo) {
        return;
      }
      count += 1;
      var box = entry.box;
      var group = groups.filter(function (other) {
        return other.every(function (value, index) { return Math.abs(value - box[index]) <= tol; });
      })[0];
      if (!group) {
        groups.push(box.slice());
      }
    });
    return { count: count, variants: groups.length, heads: heads };
  }

  function readoutText(row, readout, layout) {
    return row.label + " " + readout.count + "곳 · 자리 " + readout.variants + "가지" +
      (readout.heads ? " + 머리 음절 " + readout.heads + "곳" : "") + (layout ? " (" + layout + ")" : "");
  }

  var FontStudioDesign = {
    TOP_KEYS: TOP_KEYS,
    STUDIO_NAME: STUDIO_NAME,
    ERROR_TEXT: ERROR_TEXT,
    FIXED_PROFILE: FIXED_PROFILE,
    SQUARE_PROFILE: SQUARE_PROFILE,
    COMPOUND_MEDIALS: COMPOUND_MEDIALS,
    DEFAULT_FAMILY: DEFAULT_FAMILY,
    SVG_SETS: SVG_SETS,
    MATERIALS: MATERIALS,
    COMPARE_ROWS: COMPARE_ROWS,
    LAYOUT_LABELS: LAYOUT_LABELS,
    SOURCE_ID: SOURCE_ID,
    clone: clone,
    stableJson: stableJson,
    defaultDesign: defaultDesign,
    layoutState: layoutState,
    layoutLabel: layoutLabel,
    ruleSourceIds: ruleSourceIds,
    currentSet: currentSet,
    currentFamilies: currentFamilies,
    withMode: withMode,
    fixedConflicts: fixedConflicts,
    describeConflict: describeConflict,
    withLayout: withLayout,
    ruleCollisions: ruleCollisions,
    resolveConflicts: resolveConflicts,
    describeCollision: describeCollision,
    contextRules: contextRules,
    removeRule: removeRule,
    syntaxOffset: syntaxOffset,
    parseDesignText: parseDesignText,
    stripErrorPrefix: stripErrorPrefix,
    describeError: describeError,
    errorLine: errorLine,
    designFileName: designFileName,
    pageName: pageName,
    pretty: pretty,
    pageSnippet: pageSnippet,
    nodeRole: nodeRole,
    headHas: headHas,
    placementReadout: placementReadout,
    readoutText: readoutText
  };

  global.FontStudioDesign = FontStudioDesign;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioDesign;
  }
})(typeof window !== "undefined" ? window : globalThis);
