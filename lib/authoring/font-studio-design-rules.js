/* font-studio-design-rules.js — 디자인 규칙 순수 모델 — 고르기·잠금·자동 섞기·소스 빼기·영향 목록 (설계 v1.2 §8.4·§13.3–13.6, PLAN-HANGUL-001 F1)
 *
 * DOM 없이 디자인 JSON(spec/design.schema.json)의 규칙을 다룬다. 화면(조립식 비교·글꼴 팔레트·기록)은 여기서 다음 디자인을 받아
 * FontStudio.design.edit로 넘긴다. 정본 검증은 런타임(validateDesign·registerDesign)이다.
 *
 * - 고르기(choice): 자모·역할 칸 하나에 규칙 하나 — pick-<역할|any>-u<16진>(사용자가 고름) · mix-<역할>-u<16진>(자동 섞기). 같은 칸에
 *   같은 구체성 규칙이 둘 남지 않는다(런타임 충돌). 문맥 조건(vowelLayout·hasFinal)은 만들지 않는다(고정 배치 L08).
 * - 잠금: design.editor.locks = [{ jamo, role?, part? }] — 그리기는 보지 않는다(revision만 바뀐다). 자동 섞기가 건너뛴다.
 * - 자동 섞기(§8.4 seed): 런타임에는 없다 — 씨앗에서 칸마다 소스를 골라 mix-* 규칙으로 적는다. 같은 씨앗이면 같은 디자인.
 * - 소스 빼기: 그 소스에 기대는 규칙·역할 기본·대체 목록을 정리하고, 기본 소스면 같은 종류 다른 소스로 옮긴다(없으면 거부).
 * - 영향 목록(impactOf): 바꾸기 전·후 디자인을 임시 이름으로 등록해 자모·역할마다 planJamo 기록을 견준다.
 * - 규칙 목록(PLAN-STUDIO-002 S5-B): 화면 칸(자모·역할·짜임·받침 → 소스·짓기·조립식·늘림)과 규칙 JSON 사이 — addRule·updateRule·
 *   describeRule. 칸에서 더한 규칙은 JSON에 손으로 적은 것과 같은 꼴이다.
 *
 * 조립식 목록은 거울(font-studio-recipe-catalog.js, 생성)에서 읽는다. 브라우저(window.FontStudioDesignRules)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-design-rules: load font-studio-util.js first");
  }
  var clone = Util.clone;
  var stableJson = Util.stableJson;
  var fnv1a = Util.fnv1a;
  var isObject = Util.isObject;

  var Catalog = global.FontStudioRecipeCatalog ||
    (typeof require === "function" ? require("./font-studio-recipe-catalog.js") : null);
  if (!Catalog) {
    throw new Error("font-studio-design-rules: load font-studio-recipe-catalog.js first");
  }

  var ROLES = ["initial", "medial", "final", "standalone"];
  var MIX_ROLES = ["initial", "medial", "final"];
  var METHODS = ["auto", "direct", "compose"];
  /* 고정 배치가 조각 둘로 찍는 합자 모음(font-kku.js FIXED_COMPOUND_MEDIALS와 같다) */
  var COMPOUND_MEDIALS = "ㅘㅙㅚㅝㅞㅟㅢ";
  /* 런타임 규칙 id 문법(font-kku.js DESIGN_SOURCE_ID) — 한글은 못 쓰니 자모는 u3131처럼 적는다 */
  var RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  var ORIGIN_PREFIX = { pick: "pick-", mix: "mix-" };
  /* 영향 목록의 심각한 차례 */
  var EFFECTS = Util.IMPACT_EFFECTS.slice();
  var EFFECT_TEXT = Object.assign({}, Util.IMPACT_TEXT);
  var STATUS_RANK = { ok: 0, pending: 1, degraded: 2, error: 3 };
  var RESULT_RANK = { direct: 3, composed: 2, strokes: 1, primitive: 0, none: -1 };
  var IMPACT_PREFIX = "studio-impact";
  var CHOICE_FIELDS = ["source", "method", "recipe", "bindings", "fallbackSources", "fit"];

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  /* mulberry32 — 씨앗 하나에서 [0, 1) 수열 */
  function prng(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roleOrNull(role) {
    if (role === undefined || role === null || role === "any") {
      return null;
    }
    if (ROLES.indexOf(role) < 0) {
      throw new TypeError("font-studio-design-rules: role is initial, medial, final, standalone or null (got " + JSON.stringify(role) + ")");
    }
    return role;
  }

  function checkJamo(jamo) {
    if (typeof jamo !== "string" || jamo.length !== 1) {
      throw new TypeError("font-studio-design-rules: jamo is one compatibility jamo (got " + JSON.stringify(jamo) + ")");
    }
    return jamo;
  }

  // ── 조립식 목록 ───────────────────────────────────────────────────────

  function recipeById(id) {
    for (var index = 0; index < Catalog.recipes.length; index += 1) {
      if (Catalog.recipes[index].id === id) {
        return Catalog.recipes[index];
      }
    }
    return null;
  }

  function defaultRecipe(jamo) {
    return own(Catalog.defaults, jamo) ? Catalog.defaults[jamo] : null;
  }

  /* 그 자모를 만드는 조립식 — 런타임 기본이 맨 앞, 나머지는 정본 차례. { id, target, operation, parts, isDefault } */
  function recipesFor(jamo) {
    var preferred = defaultRecipe(jamo);
    var list = Catalog.recipes.filter(function (recipe) { return recipe.target === jamo; }).map(function (recipe) {
      var copy = clone(recipe);
      copy.isDefault = recipe.id === preferred;
      return copy;
    });
    return list.filter(function (recipe) { return recipe.isDefault; }).concat(list.filter(function (recipe) { return !recipe.isDefault; }));
  }

  function recipe(id) {
    var found = recipeById(id);
    return found ? clone(found) : null;
  }

  /* 조립식의 조각(모르는 조립식이면 null) */
  function partsOf(recipeId) {
    var found = recipeById(recipeId);
    return found ? clone(found.parts) : null;
  }

  /* 조각마다 소스·조립을 따로 줄 수 있는(binding) 조각 id — 자모 조각만 */
  function bindableParts(recipeId) {
    var parts = partsOf(recipeId) || [];
    return parts.filter(function (part) { return part.jamo !== undefined; }).map(function (part) { return part.id; });
  }

  /* 역할마다 자모: 초성 19 · 중성 21 · 종성 27 · 낱자(standalone) 40(확장 40) · 역할 없음(null) 현대 자모 51 */
  function roleJamo(role) {
    var key = roleOrNull(role);
    if (key === null) {
      return Catalog.modernShapes51.slice();
    }
    return key === "standalone" ? Catalog.stages.full40.slice() : Catalog.roles[key].slice();
  }

  /* 자모·역할 칸의 규칙 이름: pick-initial-u3131 · mix-final-u3131 · pick-any-u3131(역할 없음) */
  function ruleId(kind, jamo, role) {
    if (!own(ORIGIN_PREFIX, kind)) {
      throw new TypeError("font-studio-design-rules: rule kind is pick or mix (got " + JSON.stringify(kind) + ")");
    }
    var code = checkJamo(jamo).charCodeAt(0).toString(16);
    return ORIGIN_PREFIX[kind] + (roleOrNull(role) || "any") + "-u" + ("0000" + code).slice(-4);
  }

  // ── 고르기 ────────────────────────────────────────────────────────────

  /* 그 칸(자모·역할이 같고 문맥 조건이 없는) 규칙인가 — 같은 구체성으로 함께 맞는 규칙들 */
  function inSlot(rule, jamo, role) {
    var match = rule && isObject(rule.match) ? rule.match : null;
    return Boolean(match) && match.jamo === jamo && (match.role || null) === role &&
      match.vowelLayout === undefined && match.hasFinal === undefined;
  }

  function slotRules(design, jamo, role) {
    var key = roleOrNull(role);
    return (design && Array.isArray(design.rules) ? design.rules : []).filter(function (rule) { return inSlot(rule, jamo, key); });
  }

  function originOf(rules) {
    if (!rules.length) {
      return "none";
    }
    if (rules.some(function (rule) { return String(rule.id).indexOf(ORIGIN_PREFIX.pick) === 0; })) {
      return "pick";
    }
    return rules.every(function (rule) { return String(rule.id).indexOf(ORIGIN_PREFIX.mix) === 0; }) ? "mix" : "other";
  }

  /* 칸에 적힌 선택(덜 구체적인 규칙·기본에서 오는 값은 넣지 않는다 — 그건 planJamo가 푼다). 같은 구체성 규칙이 여럿이면
   * 런타임처럼 필드 묶음(source · 조립 method·recipe·bindings · fallbackSources)마다 먼저 적힌 쪽 */
  function getChoice(design, jamo, role) {
    var rules = slotRules(design, jamo, role);
    var out = { ruleId: null, ruleIds: [], origin: originOf(rules), source: null, method: null, recipe: null, bindings: null,
      fallbackSources: null, fit: null };
    var picked = rules.filter(function (rule) { return String(rule.id).indexOf(ORIGIN_PREFIX.pick) === 0; })[0];
    out.ruleId = picked ? picked.id : rules.length ? rules[0].id : null;
    out.ruleIds = rules.map(function (rule) { return rule.id; });
    var bundled = false;
    rules.forEach(function (rule) {
      var apply = isObject(rule.apply) ? rule.apply : {};
      if (out.source === null && typeof apply.source === "string") {
        out.source = apply.source;
      }
      if (!bundled && (apply.method !== undefined || apply.recipe !== undefined || apply.bindings !== undefined)) {
        bundled = true;
        out.method = apply.method === undefined ? "auto" : apply.method;
        out.recipe = apply.recipe === undefined ? null : apply.recipe;
        out.bindings = isObject(apply.bindings) ? clone(apply.bindings) : null;
      }
      if (out.fallbackSources === null && Array.isArray(apply.fallbackSources)) {
        out.fallbackSources = apply.fallbackSources.slice();
      }
      if (out.fit === null && typeof apply.fit === "string") {
        out.fit = apply.fit;
      }
    });
    return out;
  }

  /* 빈 값·빈 조각 binding을 떨군 적용값(아무것도 없으면 null) */
  function cleanApply(apply) {
    if (!isObject(apply)) {
      return null;
    }
    var out = {};
    if (typeof apply.source === "string" && apply.source) {
      out.source = apply.source;
    }
    if (typeof apply.method === "string" && apply.method) {
      out.method = apply.method;
    }
    if (typeof apply.recipe === "string" && apply.recipe) {
      out.recipe = apply.recipe;
    }
    if (isObject(apply.bindings)) {
      var bindings = {};
      Object.keys(apply.bindings).sort().forEach(function (part) {
        var value = cleanApply(apply.bindings[part]);
        if (value) {
          bindings[part] = value;
        }
      });
      if (Object.keys(bindings).length) {
        out.bindings = bindings;
      }
    }
    if (Array.isArray(apply.fallbackSources)) {
      var seen = {};
      var list = apply.fallbackSources.filter(function (id) {
        var keep = typeof id === "string" && id && !seen[id];
        seen[id] = true;
        return keep;
      });
      if (list.length) {
        out.fallbackSources = list;
      }
    }
    if (typeof apply.fit === "string" && apply.fit) {
      out.fit = apply.fit;
    }
    return Object.keys(out).length ? out : null;
  }

  /* 고른 것이 없는 적용값 — 비었거나 fit만 남음(런타임 DESIGN_RULE_EMPTY) */
  function emptyApply(apply) {
    return !apply || Object.keys(apply).every(function (key) { return key === "fit"; });
  }

  function uniqueId(rules, id) {
    var taken = {};
    rules.forEach(function (rule) { taken[rule && rule.id] = true; });
    var candidate = id;
    var serial = 2;
    while (taken[candidate]) {
      candidate = id + "-" + serial;
      serial += 1;
    }
    return candidate;
  }

  /* 칸 규칙들을 rule 하나로 바꾼다(rule이 null이면 지운다) — 첫 칸 규칙 자리에 둔다 */
  function replaceSlot(design, jamo, role, rule) {
    var next = clone(design) || {};
    var rules = Array.isArray(next.rules) ? next.rules : [];
    var at = -1;
    var kept = [];
    rules.forEach(function (entry) {
      if (inSlot(entry, jamo, role)) {
        if (at < 0) {
          at = kept.length;
        }
        return;
      }
      kept.push(entry);
    });
    if (rule) {
      rule.id = uniqueId(kept, rule.id);
      kept.splice(at < 0 ? kept.length : at, 0, rule);
    }
    if (kept.length || Array.isArray(next.rules)) {
      next.rules = kept;
    }
    return next;
  }

  /* 칸 하나를 고른다. choice: { jamo, role, source?, method?, recipe?, bindings?, fallbackSources? } — 준 필드만 바꾸고(null이면
   * 지운다) 나머지는 칸에 적힌 값을 잇는다. 칸의 규칙(섞은 것·손으로 적은 것 모두)은 rule 하나로 합친다 — 고르면 그 칸의 섞인
   * 소스도 고른 값으로 굳는다. 조립 묶음 맞추기: recipe만 주면 compose, direct면 recipe·bindings를 떼고, compose에 recipe가
   * 없으면 자모의 기본 조립식, 조립식에 없는 조각 binding은 뗀다. 남는 것이 없으면 칸을 비운다. 잠금은 보지 않는다(화면이 본다).
   * options.origin: pick(기본) | mix */
  function setChoice(design, choice, options) {
    var origin = (options && options.origin) || "pick";
    if (!own(ORIGIN_PREFIX, origin)) {
      throw new TypeError("font-studio-design-rules: origin is pick or mix (got " + JSON.stringify(origin) + ")");
    }
    var input = choice || {};
    var jamo = checkJamo(input.jamo);
    var role = roleOrNull(input.role);
    var current = getChoice(design, jamo, role);
    var next = {};
    CHOICE_FIELDS.forEach(function (field) {
      next[field] = own(input, field) ? (input[field] === undefined ? null : clone(input[field])) : current[field];
    });
    if (next.method !== null && METHODS.indexOf(next.method) < 0) {
      throw new TypeError("font-studio-design-rules: method is auto, direct or compose (got " + JSON.stringify(next.method) + ")");
    }
    if (next.method === "direct") {
      next.recipe = null;
      next.bindings = null;
    }
    if (next.method === null && (next.recipe || next.bindings)) {
      next.method = "compose";
    }
    if (next.method === "compose" && !next.recipe) {
      /* 기본이 없고 대안만 있는 자모(천지인 ㅏ = ㅣ + ㆍ 등, ADR-034 조각 깊이)는 그 첫 대안 — 조합(compose)에는 조립식이 꼭 있다 */
      var first = recipesFor(jamo)[0];
      next.recipe = defaultRecipe(jamo) || (first ? first.id : null);
    }
    if (next.recipe && isObject(next.bindings)) {
      var allowed = bindableParts(next.recipe);
      Object.keys(next.bindings).forEach(function (part) {
        if (allowed.indexOf(part) < 0) {
          delete next.bindings[part];
        }
      });
    } else {
      next.bindings = null;
    }
    var apply = cleanApply(next);
    if (emptyApply(apply)) {
      return replaceSlot(design, jamo, role, null);
    }
    var match = { jamo: jamo };
    if (role) {
      match.role = role;
    }
    return replaceSlot(design, jamo, role, { id: ruleId(origin, jamo, role), match: match, apply: apply });
  }

  function clearChoice(design, jamo, role) {
    return replaceSlot(design, checkJamo(jamo), roleOrNull(role), null);
  }

  function fixedLayout(design, profiles) {
    var layout = design && isObject(design.layout) ? design.layout : null;
    var info = layout && profiles ? profiles[layout.profile] : null;
    // 고정 배치 — 직결식(fixed-three)과 세벌식(case-fixed, ADR-028)
    return Boolean(info) && (info.model === "fixed-three" || info.model === "case-fixed");
  }

  /* 그 칸에 그 방법을 고를 수 있는가: { ok, code, reason, warning? }. 거부(ok: false)는 런타임도 등록하지 않는 것 — 다만 ROLE_MISMATCH는
   * 작업실만의 거부다(맞을 곳이 없는 규칙, 런타임 거부를 다 본 뒤에 본다). 원소 재료의 direct는 등록은 되지만 그릴 원본이 없어
   * 오류로 그린다 — 경고(warning). */
  function choiceAllowed(design, profiles, jamo, role, method) {
    var key = roleOrNull(role);
    if (METHODS.indexOf(method) < 0) {
      return { ok: false, code: "METHOD_INVALID", reason: "방법은 자동(auto)·원본(direct)·조합(compose) 가운데 하나" };
    }
    if (Catalog.modernShapes51.indexOf(jamo) < 0) {
      return { ok: false, code: "NOT_JAMO", reason: JSON.stringify(jamo) + "은 현대 호환 자모가 아님" };
    }
    if (method === "compose" && !recipesFor(jamo).length) {
      return { ok: false, code: "NO_RECIPE", reason: jamo + "을 만드는 조립식이 없음 — 원본(direct)이나 자동(auto)으로" };
    }
    if (method === "direct" && fixedLayout(design, profiles) && COMPOUND_MEDIALS.indexOf(jamo) >= 0 && (key === null || key === "medial")) {
      return { ok: false, code: "FIXED_COMPOUND", reason: "고정 배치는 합자 모음 " + jamo + "을 조각 둘로 찍어 통째로(원본) 그리지 못함 — " +
        "조각마다 원본을 고르는 조합(compose)으로, 또는 네모 문맥 배치에서" };
    }
    if (key !== null && roleJamo(key).indexOf(jamo) < 0) {
      return { ok: false, code: "ROLE_MISMATCH", reason: jamo + "은 " + Util.ROLE_LABELS[key] +
        "에 오지 않음" };
    }
    if (method === "direct" && design && design.mode === "primitive") {
      return { ok: true, code: "PRIMITIVE_DIRECT", warning: true, reason: "원소 재료에는 원본이 없음 — 원본(direct)을 고르면 오류로 원소가 대신 긋는다" };
    }
    return { ok: true, code: null, reason: null };
  }

  // ── 잠금 ──────────────────────────────────────────────────────────────

  function normalizeLock(target) {
    var input = target || {};
    var lock = { jamo: checkJamo(input.jamo) };
    var role = roleOrNull(input.role);
    if (role) {
      lock.role = role;
    }
    if (input.part !== undefined && input.part !== null) {
      if (typeof input.part !== "string" || !input.part) {
        throw new TypeError("font-studio-design-rules: lock part is a recipe part id (got " + JSON.stringify(input.part) + ")");
      }
      lock.part = input.part;
    }
    return lock;
  }

  function lockKey(lock) {
    return lock.jamo + "|" + (lock.role || "") + "|" + (lock.part || "");
  }

  /* design.editor.locks — 틀린 항목은 건너뛴다 */
  function locks(design) {
    var list = design && isObject(design.editor) && Array.isArray(design.editor.locks) ? design.editor.locks : [];
    var out = [];
    list.forEach(function (entry) {
      try {
        out.push(normalizeLock(entry));
      } catch (error) {
        // 손으로 고친 JSON의 틀린 잠금은 없는 셈 친다
      }
    });
    return out;
  }

  /* 역할 없는 잠금은 모든 역할을, 조각 없는 잠금은 자모 전체(모든 조각)를 잠근다. 조각만 잠그면 자모 칸 자체는 잠기지 않는다 */
  function isLocked(design, target) {
    var probe = normalizeLock(target);
    return locks(design).some(function (lock) {
      return lock.jamo === probe.jamo && (!lock.role || lock.role === (probe.role || null)) &&
        (!lock.part || lock.part === (probe.part || null));
    });
  }

  /* 잠금 켜기·끄기 — 같은 대상만 더하고 뺀다. 차례를 정해(자모·역할·조각) 같은 잠금이면 같은 JSON. 다 빠지면 editor.locks를 지운다 */
  function setLock(design, target, on) {
    var lock = normalizeLock(target);
    var key = lockKey(lock);
    var list = locks(design).filter(function (entry) { return lockKey(entry) !== key; });
    if (on !== false) {
      list.push(lock);
    }
    list.sort(function (a, b) {
      return lockKey(a) < lockKey(b) ? -1 : lockKey(a) > lockKey(b) ? 1 : 0;
    });
    var next = clone(design) || {};
    var editor = isObject(next.editor) ? next.editor : {};
    if (list.length) {
      editor.locks = list;
    } else {
      delete editor.locks;
    }
    if (Object.keys(editor).length) {
      next.editor = editor;
    } else {
      delete next.editor;
    }
    return next;
  }

  // ── 자동 섞기 ─────────────────────────────────────────────────────────

  /* mix-* 규칙을 지운다(options.roles가 있으면 그 역할만) — 고른 칸(pick)·손으로 적은 규칙은 그대로 */
  function clearMix(design, options) {
    var roles = options && Array.isArray(options.roles) ? options.roles : null;
    var next = clone(design) || {};
    if (Array.isArray(next.rules)) {
      next.rules = next.rules.filter(function (rule) {
        var mixed = rule && String(rule.id).indexOf(ORIGIN_PREFIX.mix) === 0;
        return !mixed || (roles !== null && roles.indexOf(rule.match && rule.match.role) < 0);
      });
    }
    return next;
  }

  /* 자동 섞기(설계 v1.2 §8.4) — 씨앗·역할·자모마다 따로 뽑아 잠금·고른 칸이 다른 칸의 뽑기를 흔들지 않는다. 그 역할의 기본
   * 소스(roleSources → defaults.source)와 같은 소스를 뽑은 칸은 규칙을 적지 않는다. 먼저 그 역할의 mix-*를 지우고 다시 뽑는다.
   * options: { seed, sourceIds(기본: 디자인의 모든 소스), roles(기본 초·중·종성), scope: "jamo" } */
  function autoMix(design, options) {
    var opts = options || {};
    var scope = opts.scope === undefined ? "jamo" : opts.scope;
    if (scope !== "jamo") {
      throw new TypeError("font-studio-design-rules: autoMix scope is jamo (got " + JSON.stringify(scope) + ")");
    }
    var sources = design && isObject(design.sources) ? design.sources : {};
    var ids = Array.isArray(opts.sourceIds) ? opts.sourceIds : Object.keys(sources);
    var seen = {};
    ids = ids.filter(function (id) {
      if (!own(sources, id)) {
        throw new TypeError("font-studio-design-rules: autoMix source " + JSON.stringify(id) + " is not in sources");
      }
      var keep = !seen[id];
      seen[id] = true;
      return keep;
    });
    var roles = Array.isArray(opts.roles) ? opts.roles.map(roleOrNull) : MIX_ROLES.slice();
    if (roles.some(function (role) { return role === null; })) {
      throw new TypeError("font-studio-design-rules: autoMix roles name initial, medial, final or standalone");
    }
    var seed = String(opts.seed === undefined || opts.seed === null ? "" : opts.seed);
    var next = clearMix(design, { roles: roles });
    var rules = Array.isArray(next.rules) ? next.rules : [];
    var defaults = isObject(next.defaults) ? next.defaults : {};
    roles.forEach(function (role) {
      var base = (isObject(next.roleSources) && next.roleSources[role]) || defaults.source;
      roleJamo(role).forEach(function (jamo) {
        if (!ids.length || isLocked(next, { jamo: jamo, role: role }) || slotRules(next, jamo, role).length) {
          return;
        }
        var draw = prng(parseInt(fnv1a(seed + "|" + role + "|" + jamo), 16))();
        var source = ids[Math.floor(draw * ids.length)];
        if (source === base) {
          return;
        }
        rules.push({ id: uniqueId(rules, ruleId("mix", jamo, role)), match: { jamo: jamo, role: role }, apply: { source: source } });
      });
    });
    if (rules.length || Array.isArray(next.rules)) {
      next.rules = rules;
    }
    return next;
  }

  // ── 소스 빼기 ─────────────────────────────────────────────────────────

  /* 적용값이 그 소스를 고르는가(source — 조각 binding 안까지) */
  function picksSource(apply, id) {
    if (!isObject(apply)) {
      return false;
    }
    if (apply.source === id) {
      return true;
    }
    return isObject(apply.bindings) && Object.keys(apply.bindings).some(function (part) { return picksSource(apply.bindings[part], id); });
  }

  /* 대체 목록(fallbackSources)에 그 소스가 있는가(조각 binding 안까지) */
  function listsFallback(apply, id) {
    if (!isObject(apply)) {
      return false;
    }
    if (Array.isArray(apply.fallbackSources) && apply.fallbackSources.indexOf(id) >= 0) {
      return true;
    }
    return isObject(apply.bindings) && Object.keys(apply.bindings).some(function (part) { return listsFallback(apply.bindings[part], id); });
  }

  /* 대체 목록에서만 그 소스를 뺀다(조각 binding 안까지) */
  function withoutFallback(apply, id) {
    if (!isObject(apply)) {
      return apply;
    }
    var out = clone(apply);
    if (Array.isArray(out.fallbackSources)) {
      out.fallbackSources = out.fallbackSources.filter(function (entry) { return entry !== id; });
    }
    if (isObject(out.bindings)) {
      Object.keys(out.bindings).forEach(function (part) { out.bindings[part] = withoutFallback(out.bindings[part], id); });
    }
    return cleanApply(out);
  }

  /* 소스 하나를 뺀다 — 그 소스를 고르는 규칙(조각 binding 포함)은 지우고(droppedRules), 대체 목록에서만 쓰면 그 자리만 뺀다. 역할 기본
   * (clearedRoles)·fallback.sourceIds(fallbackPruned)도 정리한다. 기본 소스면 같은 종류의 첫 남은 소스로 옮기고, 없으면 거부한다.
   * { ok, design, reason, defaultSource, droppedRules, clearedRoles, fallbackPruned } */
  function removeSource(design, id) {
    var out = { ok: false, design: null, reason: null, defaultSource: null, droppedRules: [], clearedRoles: [], fallbackPruned: [] };
    var sources = design && isObject(design.sources) ? design.sources : {};
    if (!own(sources, id)) {
      out.reason = "소스 " + id + "이 없음";
      return out;
    }
    var next = clone(design);
    var kind = sources[id] && sources[id].kind;
    var defaults = isObject(next.defaults) ? next.defaults : {};
    if (defaults.source === id) {
      var replacement = Object.keys(sources).filter(function (key) {
        return key !== id && sources[key] && sources[key].kind === kind;
      })[0];
      if (!replacement) {
        out.reason = "기본 소스 " + id + "을 빼면 같은 종류(" + kind + ") 소스가 남지 않음";
        return out;
      }
      defaults.source = replacement;
      out.defaultSource = replacement;
    }
    delete next.sources[id];
    if (Array.isArray(next.rules)) {
      next.rules = next.rules.filter(function (rule) {
        if (rule && picksSource(rule.apply, id)) {
          out.droppedRules.push(rule.id);
          return false;
        }
        return true;
      }).filter(function (rule) {
        if (!rule || !listsFallback(rule.apply, id)) {
          return true;
        }
        var apply = withoutFallback(rule.apply, id);
        if (emptyApply(apply)) {
          out.droppedRules.push(rule.id);
          return false;
        }
        rule.apply = apply;
        return true;
      });
    }
    if (isObject(next.roleSources)) {
      Object.keys(next.roleSources).forEach(function (role) {
        if (next.roleSources[role] === id) {
          delete next.roleSources[role];
          out.clearedRoles.push(role);
        }
      });
      if (!Object.keys(next.roleSources).length) {
        delete next.roleSources;
      }
    }
    if (isObject(next.fallback) && Array.isArray(next.fallback.sourceIds) && next.fallback.sourceIds.indexOf(id) >= 0) {
      next.fallback.sourceIds = next.fallback.sourceIds.filter(function (entry) { return entry !== id; });
      out.fallbackPruned.push(id);
    }
    out.ok = true;
    out.design = next;
    return out;
  }

  // ── 영향 목록 ─────────────────────────────────────────────────────────

  /* 기록 비교에 쓰는 것 — 규칙 id(왜)·방법 이름·글꼴 확인(환경)은 빼고 그려지는 것만 */
  function entryShape(entry) {
    return {
      path: (entry.path || []).join("."),
      jamo: entry.jamo,
      source: entry.effectiveSource || entry.source || null,
      recipe: entry.recipe || null,
      result: entry.result || null,
      status: entry.status || null,
      diagnostic: entry.diagnostic || null
    };
  }

  function rootOf(trace) {
    return (trace || []).filter(function (entry) { return !entry.path || !entry.path.length; })[0] || (trace || [])[0] || null;
  }

  /* 영향 줄의 요약: 뿌리 요청의 { source, method, recipe, result, status, diagnostic } */
  function summarizeTrace(trace) {
    var root = rootOf(trace);
    if (!root) {
      return { source: null, method: null, recipe: null, result: "none", status: "error", diagnostic: null };
    }
    return {
      source: root.effectiveSource || root.source || null,
      method: root.method || null,
      recipe: root.recipe || null,
      result: root.result || null,
      status: root.status || null,
      diagnostic: root.diagnostic || null
    };
  }

  function worstStatus(trace) {
    return (trace || []).reduce(function (worst, entry) {
      return Math.max(worst, own(STATUS_RANK, entry.status) ? STATUS_RANK[entry.status] : 0);
    }, 0);
  }

  function countResult(trace, result) {
    return (trace || []).filter(function (entry) { return entry.result === result; }).length;
  }

  function sourceSet(trace) {
    var set = {};
    (trace || []).forEach(function (entry) {
      var source = entry.effectiveSource || entry.source;
      if (source) {
        set[source] = true;
      }
    });
    return Object.keys(set).sort().join(",");
  }

  /* 같은 자모·역할의 바꾸기 전·후 기록 → 영향(없으면 null). 차례: 오류가 새로 남 > 원소로 떨어짐 > 그린 원본을 잃음(뿌리나
   * 남은 조각이 direct에서 벗어남) > 덜 그려짐(상태가 나빠지거나 뿌리 결과가 direct > composed > strokes > primitive 차례로 내려감) >
   * 소스 바뀜 > 그 밖에 바뀜 */
  function effectOf(beforeTrace, afterTrace) {
    var before = (beforeTrace || []).map(entryShape);
    var after = (afterTrace || []).map(entryShape);
    if (stableJson(before) === stableJson(after)) {
      return null;
    }
    if (worstStatus(afterTrace) === STATUS_RANK.error && worstStatus(beforeTrace) < STATUS_RANK.error) {
      return "error";
    }
    if (countResult(afterTrace, "primitive") > countResult(beforeTrace, "primitive")) {
      return "primitive";
    }
    var afterByPath = {};
    after.forEach(function (entry) { afterByPath[entry.path] = entry; });
    var lost = before.some(function (entry) {
      return entry.result === "direct" && own(afterByPath, entry.path) && afterByPath[entry.path].result !== "direct";
    });
    if (lost) {
      return "lost-original";
    }
    var rootBefore = summarizeTrace(beforeTrace);
    var rootAfter = summarizeTrace(afterTrace);
    var rank = function (result) { return own(RESULT_RANK, result) ? RESULT_RANK[result] : -1; };
    if (worstStatus(afterTrace) > worstStatus(beforeTrace) || rank(rootAfter.result) < rank(rootBefore.result)) {
      return "degraded";
    }
    if (sourceSet(afterTrace) !== sourceSet(beforeTrace)) {
      return "source-changed";
    }
    return "changed";
  }

  /* 기본 대상: 초성 19 · 중성 21 · 종성 27 · 낱자 40 */
  function impactPairs() {
    var pairs = [];
    ROLES.forEach(function (role) {
      roleJamo(role).forEach(function (jamo) { pairs.push({ jamo: jamo, role: role }); });
    });
    return pairs;
  }

  function registeredDesign(runtime, name) {
    if (typeof runtime.designs === "function") {
      return (runtime.designs() || []).some(function (entry) {
        return (typeof entry === "string" ? entry : entry && entry.name) === name;
      });
    }
    try {
      runtime.planJamo("ㅇ", { design: name });
      return true;
    } catch (error) {
      return false;
    }
  }

  /* 한쪽 그림 세트들을 고정 임시 이름에 등록한다 — studio-impact-a(·-a-2 …)/-b. registerJamo는 지우는 길이 없어 이름을 돌려 쓴다.
   * 값: 칸 지도 또는 { cells, options }. 칸이 없으면 등록할 수 없어(런타임도 같다) 등록되지 않은 이름으로 돌린다 */
  function registerSets(runtime, sets, letter) {
    var map = {};
    if (!isObject(sets)) {
      return map;
    }
    Object.keys(sets).sort().forEach(function (name, index) {
      var value = sets[name];
      var cells = isObject(value) && isObject(value.cells) ? value.cells : value;
      var options = isObject(value) && isObject(value.cells) && isObject(value.options) ? value.options : {};
      if (!isObject(cells) || !Object.keys(cells).length) {
        map[name] = IMPACT_PREFIX + "-empty";
        return;
      }
      if (typeof runtime.registerJamo !== "function") {
        throw new TypeError("font-studio-design-rules: impactOf sets need FontKku.registerJamo");
      }
      var scratch = IMPACT_PREFIX + "-" + letter + (index ? "-" + (index + 1) : "");
      runtime.registerJamo(scratch, cells, Object.assign({ frame: "box" }, options));
      map[name] = scratch;
    });
    return map;
  }

  function withSets(design, map) {
    var next = clone(design);
    if (next && isObject(next.sources)) {
      Object.keys(next.sources).forEach(function (id) {
        var source = next.sources[id];
        if (source && source.kind === "svg" && own(map, source.assetSet)) {
          source.assetSet = map[source.assetSet];
        }
      });
    }
    return next;
  }

  function planTrace(runtime, name, pair) {
    try {
      return runtime.planJamo(pair.jamo, { design: name, role: pair.role }).trace;
    } catch (error) {
      return [{ path: [], jamo: pair.jamo, role: pair.role, source: null, method: null, recipe: null, rules: [], result: "none",
        status: "error", diagnostic: error && error.code ? error.code : "PLAN_FAILED" }];
    }
  }

  /* 영향 목록(설계 v1.2 §13.6) — 바꾸기 전·후 디자인을 내용 주소 이름 studio-impact-<fnv>로 등록하고(이미 있으면 그대로, 새로
   * 등록한 것은 unregisterDesign이 있으면 끝에 지운다) 자모·역할마다 planJamo 기록을 견준다. change.sets: { before: { 세트: 칸 },
   * after: { … } } — 그 세트 이름을 쓰는 svg 소스를 임시 세트로 돌려 아직 등록하지 않은 그림(칸 지우기 같은)을 미리 본다.
   * options.pairs: [{ jamo, role }](기본: 초성 19 · 중성 21 · 종성 27 · 낱자 40). 바뀐 것만 심각한 차례로:
   * [{ jamo, role, before: { source, method, recipe, result, status, diagnostic }, after: { … }, effect }] */
  function impactOf(change, runtime, options) {
    if (!runtime || typeof runtime.registerDesign !== "function" || typeof runtime.planJamo !== "function") {
      throw new TypeError("font-studio-design-rules: impactOf needs FontKku (registerDesign, planJamo)");
    }
    var input = change || {};
    var sets = isObject(input.sets) ? input.sets : {};
    var beforeJson = withSets(input.before, registerSets(runtime, sets.before, "a"));
    var afterJson = withSets(input.after, registerSets(runtime, sets.after, "b"));
    var pairs = options && Array.isArray(options.pairs) ? options.pairs : impactPairs();
    var fresh = [];
    var nameFor = function (json) {
      var name = IMPACT_PREFIX + "-" + fnv1a(stableJson(json));
      if (fresh.indexOf(name) < 0 && !registeredDesign(runtime, name)) {
        runtime.registerDesign(name, json);
        fresh.push(name);
      }
      return name;
    };
    var rows = [];
    try {
      var beforeName = nameFor(beforeJson);
      var afterName = nameFor(afterJson);
      pairs.forEach(function (pair) {
        var role = roleOrNull(pair.role);
        var target = { jamo: checkJamo(pair.jamo), role: role || undefined };
        var beforeTrace = planTrace(runtime, beforeName, target);
        var afterTrace = planTrace(runtime, afterName, target);
        var effect = effectOf(beforeTrace, afterTrace);
        if (effect) {
          rows.push({ jamo: target.jamo, role: role, before: summarizeTrace(beforeTrace), after: summarizeTrace(afterTrace), effect: effect });
        }
      });
    } finally {
      if (typeof runtime.unregisterDesign === "function") {
        fresh.forEach(function (name) { runtime.unregisterDesign(name); });
      }
    }
    var order = Catalog.modernShapes51;
    rows.sort(function (a, b) {
      return EFFECTS.indexOf(a.effect) - EFFECTS.indexOf(b.effect) ||
        ROLES.indexOf(a.role) - ROLES.indexOf(b.role) ||
        order.indexOf(a.jamo) - order.indexOf(b.jamo);
    });
    return rows;
  }

  // ── 규칙 목록(PLAN-STUDIO-002 S5-B) ─────────────────────────────────────
  /* 디자인 페이지 정밀 모드의 규칙 목록 하나 — 문맥 규칙 탭을 합쳤다. 모든 규칙을 한 줄씩(조건 → 결과) 보이고, 목록에서 더하기·
   * 고치기·지우기를 한다(전에는 JSON으로만 더했다). 여기는 화면 칸(spec)과 규칙 JSON 사이의 순수 변환이다 — 칸에서 더한 규칙은
   * JSON에 손으로 적은 규칙과 같은 꼴이고(같은 validateDesign 결과), 정본 검사는 런타임이다. 막는 것은 런타임도 받지 않는 것과
   * 작업실만의 둘(맞을 곳이 없는 역할·자모 ROLE_MISMATCH, 같은 조건 규칙이 이미 있음 RULE_DUPLICATE)이다.
   * spec: { jamo, role|null, vowelLayout|null, hasFinal: true|false|null, source|null, method|null, recipe|null, fit|null } */
  var ROLE_LABEL = Object.assign({}, Util.ROLE_LABELS);
  /* 짜임(용어집 '세로모음 · 가로모음 · 합자모음 짜임') — 설계 v1.0 이름(vertical·horizontal·mixed)은 런타임이 받아 바꾼다 */
  var VOWEL_LAYOUTS = ["right", "bottom", "split-right"];
  var VOWEL_LAYOUT_LABEL = { right: "세로모음", bottom: "가로모음", "split-right": "합자모음", vertical: "세로모음", horizontal: "가로모음",
    mixed: "합자모음" };
  var METHOD_LABEL = { auto: "자동", direct: "원본 그대로", compose: "조합" };
  var FIT_LABEL = { "preserve-aspect": "비율 지킴", "allow-anisotropic": "가로·세로 따로 늘림" };
  var FITS = ["preserve-aspect", "allow-anisotropic"];
  var SPEC_FIELDS = ["jamo", "role", "vowelLayout", "hasFinal", "source", "method", "recipe", "fit"];

  /* 규칙의 갈래 — context(짜임·받침 조건) · pick(조립식·팔레트에서 고름) · mix(자동 섞기) · rule(그 밖, 손으로·목록에서) */
  function ruleKind(rule) {
    var match = rule && isObject(rule.match) ? rule.match : {};
    if (match.vowelLayout !== undefined || match.hasFinal !== undefined) {
      return "context";
    }
    var id = String(rule && rule.id || "");
    return id.indexOf(ORIGIN_PREFIX.pick) === 0 ? "pick" : id.indexOf(ORIGIN_PREFIX.mix) === 0 ? "mix" : "rule";
  }

  /* 규칙 → 화면 칸 값(없는 것은 null) */
  function ruleSpec(rule) {
    var match = rule && isObject(rule.match) ? rule.match : {};
    var apply = rule && isObject(rule.apply) ? rule.apply : {};
    return {
      id: rule && typeof rule.id === "string" ? rule.id : null,
      jamo: typeof match.jamo === "string" ? match.jamo : null,
      role: typeof match.role === "string" ? match.role : null,
      vowelLayout: typeof match.vowelLayout === "string" ? match.vowelLayout : null,
      hasFinal: typeof match.hasFinal === "boolean" ? match.hasFinal : null,
      source: typeof apply.source === "string" ? apply.source : null,
      method: typeof apply.method === "string" ? apply.method : null,
      recipe: typeof apply.recipe === "string" ? apply.recipe : null,
      fit: typeof apply.fit === "string" ? apply.fit : null
    };
  }

  /* 한 줄 설명(한국어) — { when, what, kind }. 소스·조립식 이름은 코드 그대로(정밀 모드 화면) */
  function describeRule(rule) {
    var spec = ruleSpec(rule);
    var apply = rule && isObject(rule.apply) ? rule.apply : {};
    var when = [spec.jamo || "?", spec.role ? ROLE_LABEL[spec.role] || spec.role : "모든 역할"];
    if (spec.vowelLayout) {
      when.push((VOWEL_LAYOUT_LABEL[spec.vowelLayout] || spec.vowelLayout) + " 짜임");
    }
    if (spec.hasFinal !== null) {
      when.push(spec.hasFinal ? "받침 있음" : "받침 없음");
    }
    var what = [];
    if (spec.source) {
      what.push("소스 " + spec.source);
    }
    if (spec.method || spec.recipe) {
      what.push((METHOD_LABEL[spec.method || "auto"] || spec.method) + (spec.recipe ? " " + spec.recipe : ""));
    }
    if (isObject(apply.bindings) && Object.keys(apply.bindings).length) {
      what.push("조각 " + Object.keys(apply.bindings).length + "개 따로");
    }
    if (Array.isArray(apply.fallbackSources) && apply.fallbackSources.length) {
      what.push("대신 " + apply.fallbackSources.join("·"));
    }
    if (spec.fit) {
      what.push(FIT_LABEL[spec.fit] || spec.fit);
    }
    return { when: when.join(" · "), what: what.join(" · ") || "-", kind: ruleKind(rule) };
  }

  function refusal(code, field, message) {
    return { code: code, field: field, message: message };
  }

  function emptyField(value) {
    return value === undefined || value === null || value === "";
  }

  /* 칸 값 → 규칙의 match·apply. 거절은 refused[]({ code, field, message } — 한국어). keep: 고치는 규칙(칸에 없는 bindings·
   * fallbackSources를 잇는다 — bindings는 조립식이 같을 때만) */
  function ruleFromSpec(design, spec, keep) {
    var input = spec || {};
    var refused = [];
    var jamo = typeof input.jamo === "string" ? input.jamo.trim() : "";
    if (jamo.length !== 1 || Catalog.modernShapes51.indexOf(jamo) < 0) {
      refused.push(refusal("NOT_JAMO", "jamo", jamo ? "'" + jamo + "'은(는) 현대 호환 자모 하나가 아닙니다 — ㄱ·ㅏ·ㄳ처럼 한 글자로" : "자모를 적으세요"));
    }
    var role = emptyField(input.role) || input.role === "any" ? null : input.role;
    if (role !== null && ROLES.indexOf(role) < 0) {
      refused.push(refusal("ROLE_INVALID", "role", "역할은 초성·중성·종성·낱자 가운데 하나입니다"));
      role = null;
    } else if (role !== null && !refused.length && roleJamo(role).indexOf(jamo) < 0) {
      refused.push(refusal("ROLE_MISMATCH", "role", jamo + "은(는) " + ROLE_LABEL[role] + "에 오지 않습니다 — 맞을 글자가 없는 규칙"));
    }
    var layout = emptyField(input.vowelLayout) ? null : input.vowelLayout;
    if (layout !== null && !own(VOWEL_LAYOUT_LABEL, layout)) {
      refused.push(refusal("LAYOUT_INVALID", "vowelLayout", "짜임은 세로모음·가로모음·합자모음 가운데 하나입니다"));
      layout = null;
    }
    var hasFinal = input.hasFinal === true || input.hasFinal === "true" ? true : input.hasFinal === false || input.hasFinal === "false" ? false : null;
    if ((layout !== null || hasFinal !== null) && role === null) {
      refused.push(refusal("CONDITION_NEEDS_ROLE", "role", "짜임·받침 조건은 역할이 있어야 합니다 — 역할을 고르세요"));
    }
    var source = emptyField(input.source) ? null : String(input.source);
    var sources = design && isObject(design.sources) ? design.sources : {};
    if (source !== null && !own(sources, source)) {
      refused.push(refusal("SOURCE_UNKNOWN", "source", "디자인에 없는 소스입니다: " + source));
    }
    var method = emptyField(input.method) ? null : input.method;
    if (method !== null && METHODS.indexOf(method) < 0) {
      refused.push(refusal("METHOD_INVALID", "method", "짓기는 자동·원본 그대로·조합 가운데 하나입니다"));
      method = null;
    }
    var recipeId = emptyField(input.recipe) ? null : String(input.recipe);
    var fit = emptyField(input.fit) ? null : input.fit;
    if (fit !== null && FITS.indexOf(fit) < 0) {
      refused.push(refusal("FIT_INVALID", "fit", "늘림은 비율 지킴·가로·세로 따로 늘림 가운데 하나입니다"));
      fit = null;
    }
    if (method === "direct") {
      recipeId = null; // 원본은 조립식을 쓰지 않는다(런타임 스키마)
    }
    if (method === null && recipeId !== null) {
      method = "compose";
    }
    var known = jamo.length === 1 ? recipesFor(jamo).map(function (entry) { return entry.id; }) : [];
    if (recipeId !== null && known.indexOf(recipeId) < 0) {
      refused.push(refusal("RECIPE_MISMATCH", "recipe", "조립식 " + recipeId + "은(는) " + (jamo || "이 자모") + "을(를) 만들지 않습니다"));
    }
    if (method === "compose" && recipeId === null) {
      recipeId = defaultRecipe(jamo) || known[0] || null;
      if (recipeId === null && jamo.length === 1) {
        refused.push(refusal("NO_RECIPE", "method", jamo + "을(를) 만드는 조립식이 없습니다 — 자동이나 원본 그대로로"));
      }
    }
    var apply = {};
    if (source !== null) {
      apply.source = source;
    }
    if (method !== null) {
      apply.method = method;
    }
    if (recipeId !== null) {
      apply.recipe = recipeId;
    }
    var kept = keep && isObject(keep.apply) ? keep.apply : null;
    if (kept && isObject(kept.bindings) && recipeId !== null && kept.recipe === recipeId) {
      apply.bindings = clone(kept.bindings);
    }
    if (kept && Array.isArray(kept.fallbackSources) && kept.fallbackSources.length) {
      apply.fallbackSources = kept.fallbackSources.slice();
    }
    if (fit !== null) {
      apply.fit = fit;
    }
    if (!refused.length && emptyApply(apply)) {
      refused.push(refusal("RULE_EMPTY", "source", "결과를 하나 이상 고르세요 — 소스·짓기·조립식"));
    }
    if (refused.length) {
      return { match: null, apply: null, refused: refused };
    }
    var match = { jamo: jamo };
    if (role !== null) {
      match.role = role;
    }
    if (layout !== null) {
      match.vowelLayout = layout;
    }
    if (hasFinal !== null) {
      match.hasFinal = hasFinal;
    }
    return { match: match, apply: apply, refused: [] };
  }

  /* 같은 조건(자모·역할·짜임·받침)인가 */
  function sameMatch(a, b) {
    var ma = isObject(a) ? a : {};
    var mb = isObject(b) ? b : {};
    return ma.jamo === mb.jamo && (ma.role || null) === (mb.role || null) && ma.vowelLayout === mb.vowelLayout && ma.hasFinal === mb.hasFinal;
  }

  /* 새 규칙 이름 — rule-<역할|any>-u<16진>(조건이 있으면 -<짜임>·-final·-open) */
  function listRuleId(rules, match) {
    var code = ("0000" + match.jamo.charCodeAt(0).toString(16)).slice(-4);
    var id = "rule-" + (match.role || "any") + "-u" + code + (match.vowelLayout ? "-" + match.vowelLayout : "") +
      (match.hasFinal === true ? "-final" : match.hasFinal === false ? "-open" : "");
    return uniqueId(rules, id);
  }

  /* 같은 요청에 함께 맞는 같은 구체성 규칙이 다른 값을 고르는가(런타임이 등록을 거부한다) — 디자인 모델의 ruleCollisions로 */
  function collisionsOf(rules, id) {
    var Model = global.FontStudioDesign || (typeof require === "function" ? require("./font-studio-design-model.js") : null);
    if (!Model || typeof Model.ruleCollisions !== "function") {
      return [];
    }
    return Model.ruleCollisions(rules).filter(function (entry) { return entry.rules.indexOf(id) >= 0; });
  }

  function listRefused(design, refused, extra) {
    var out = { design: null, id: null, refused: refused, collisions: [] };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  /* 목록에서 규칙 하나 더하기 → { design, id, refused, collisions }. 끝에 붙인다(JSON에 손으로 적는 차례와 같다) */
  function addRule(design, spec) {
    var built = ruleFromSpec(design, spec, null);
    if (built.refused.length) {
      return listRefused(design, built.refused);
    }
    var rules = design && Array.isArray(design.rules) ? design.rules : [];
    var same = rules.filter(function (rule) { return rule && sameMatch(rule.match, built.match); })[0];
    if (same) {
      return listRefused(design, [refusal("RULE_DUPLICATE", "jamo", "같은 조건의 규칙 " + same.id + "이(가) 이미 있습니다 — 그 줄을 고치세요")],
        { existing: same.id });
    }
    var next = clone(design) || {};
    next.rules = Array.isArray(next.rules) ? next.rules : [];
    var id = listRuleId(next.rules, built.match);
    next.rules.push({ id: id, match: built.match, apply: built.apply });
    var collisions = collisionsOf(next.rules, id);
    if (collisions.length) {
      return listRefused(design, [refusal("RULE_COLLISION", "jamo", "함께 맞는 같은 구체성 규칙과 값이 다릅니다 — 조건을 더 좁히거나 그 규칙을 고치세요")],
        { collisions: collisions });
    }
    return { design: next, id: id, refused: [], collisions: [] };
  }

  /* 목록의 규칙 하나 고치기(이름·자리 그대로) → { design, id, refused, collisions } */
  function updateRule(design, id, spec) {
    var rules = design && Array.isArray(design.rules) ? design.rules : [];
    var index = -1;
    rules.forEach(function (rule, at) {
      if (index < 0 && rule && rule.id === id) {
        index = at;
      }
    });
    if (index < 0) {
      return listRefused(design, [refusal("RULE_UNKNOWN", "id", "없는 규칙입니다: " + id)]);
    }
    var built = ruleFromSpec(design, spec, rules[index]);
    if (built.refused.length) {
      return listRefused(design, built.refused);
    }
    var same = rules.filter(function (rule, at) { return at !== index && rule && sameMatch(rule.match, built.match); })[0];
    if (same) {
      return listRefused(design, [refusal("RULE_DUPLICATE", "jamo", "같은 조건의 규칙 " + same.id + "이(가) 이미 있습니다 — 그 줄을 고치세요")],
        { existing: same.id });
    }
    var next = clone(design);
    next.rules[index] = { id: id, match: built.match, apply: built.apply };
    var collisions = collisionsOf(next.rules, id);
    if (collisions.length) {
      return listRefused(design, [refusal("RULE_COLLISION", "jamo", "함께 맞는 같은 구체성 규칙과 값이 다릅니다 — 조건을 더 좁히거나 그 규칙을 고치세요")],
        { collisions: collisions });
    }
    return { design: next, id: id, refused: [], collisions: [] };
  }

  /* 화면 칸의 고를 거리 — 역할마다 자모, 자모마다 조립식(기본이 맨 앞) */
  function ruleChoices(jamo) {
    var key = typeof jamo === "string" && jamo.length === 1 ? jamo : null;
    return {
      roles: ROLES.slice(),
      vowelLayouts: VOWEL_LAYOUTS.slice(),
      methods: METHODS.slice(),
      fits: FITS.slice(),
      recipes: key ? recipesFor(key).map(function (entry) { return { id: entry.id, isDefault: entry.isDefault }; }) : []
    };
  }

  var FontStudioDesignRules = {
    ROLES: ROLES,
    MIX_ROLES: MIX_ROLES,
    METHODS: METHODS,
    COMPOUND_MEDIALS: COMPOUND_MEDIALS,
    RULE_ID: RULE_ID,
    EFFECTS: EFFECTS,
    EFFECT_TEXT: EFFECT_TEXT,
    IMPACT_PREFIX: IMPACT_PREFIX,
    catalog: Catalog,
    fnv1a: fnv1a,
    stableJson: stableJson,
    recipesFor: recipesFor,
    defaultRecipe: defaultRecipe,
    recipe: recipe,
    partsOf: partsOf,
    bindableParts: bindableParts,
    roleJamo: roleJamo,
    ruleId: ruleId,
    slotRules: slotRules,
    getChoice: getChoice,
    setChoice: setChoice,
    clearChoice: clearChoice,
    choiceAllowed: choiceAllowed,
    locks: locks,
    isLocked: isLocked,
    setLock: setLock,
    autoMix: autoMix,
    clearMix: clearMix,
    removeSource: removeSource,
    summarizeTrace: summarizeTrace,
    effectOf: effectOf,
    impactPairs: impactPairs,
    impactOf: impactOf,
    /* 규칙 목록(PLAN-STUDIO-002 S5-B) */
    ROLE_LABEL: ROLE_LABEL,
    VOWEL_LAYOUTS: VOWEL_LAYOUTS,
    VOWEL_LAYOUT_LABEL: VOWEL_LAYOUT_LABEL,
    METHOD_LABEL: METHOD_LABEL,
    FIT_LABEL: FIT_LABEL,
    SPEC_FIELDS: SPEC_FIELDS,
    ruleKind: ruleKind,
    ruleSpec: ruleSpec,
    describeRule: describeRule,
    ruleFromSpec: ruleFromSpec,
    addRule: addRule,
    updateRule: updateRule,
    ruleChoices: ruleChoices
  };

  global.FontStudioDesignRules = FontStudioDesignRules;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioDesignRules;
  }
})(typeof window !== "undefined" ? window : globalThis);
