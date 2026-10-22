/* font-studio-provenance-model.js — 출처 다섯 질문 순수 모델 (설계 v1.2 §13.5, PLAN-HANGUL-001 F2)
 *
 * 고른 자모 노드 하나의 조립 기록(FontKku.traceOf의 requests)과 디자인 JSON으로 살펴보기의 다섯 질문에 답한다.
 * - Q1 kind: 직접 그린 것인가, 조합한 것인가, 대체된 것인가(원본·조합·획·원소 대체·대체 경로·실패·받는 중)
 * - Q2 origin: 어느 원소·SVG 세트·글꼴에서 왔나, 출처가 확인됐나(글꼴은 증명할 수 없어 unverified, 대체 글꼴 의심)
 * - Q3 rule: 어느 규칙이 이겼고 왜 다른 것을 무시했나(binding > 규칙(구체적인 것) > 물려받음 > 역할 기본 > 디자인 기본)
 * - Q4 follow: 상위 원본(ㅋ의 ㄱ)을 따라가나, 독립 원본인가(떼어 낸 SVG는 독립 — 예전 조립식만 적는다)
 * - Q5 capability: 그 조각에서 획 편집·필기 애니메이션·독립 벡터가 되나(원소 획 예, SVG 조각 부분, 글꼴 낱자 아니오)
 * Q3의 규칙 선택은 font-kku-rule-resolution.js를 쓴다. 같은 본문을 런타임에 생성해 그리는 판단과 설명을 맞춘다.
 * 기록의 rules(이긴 규칙 id·"binding")와 같은지 tests/studio_f/provenance_model.test.js가 planJamo로, 스모크가 미리보기의 모든
 * 노드로 대 본다 — 해석기를 바꾸고 여기를 두면 깨진다. DOM 없이 돈다. 브라우저(window.FontStudioProvenanceModel)와 Node 공용.
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-provenance-model: load font-studio-util.js first");
  }

  var Resolution = typeof module !== "undefined" && module.exports ? require("./font-kku-rule-resolution.js") : global.FontKkuRuleResolution;

  /* 작업실이 싣는 내장 칸 계약 그림 세트(font-studio-design-model.js SVG_SETS) */
  var BUILTIN_SETS = ["dunggeun-box", "pilgi-box", "butgeul-box"];
  /* font-kku.js DESIGN_LAYOUTS — 규칙 match.vowelLayout의 별칭 */
  var LAYOUTS = { right: "right", bottom: "bottom", "split-right": "split-right", vertical: "right", horizontal: "bottom", mixed: "split-right" };
  /* font-kku.js DESIGN_NODE_ROLES — 자모 노드 역할(data-fy-role) → 규칙 역할 */
  var NODE_ROLES = { choseong: "initial", head: "initial", "jung-main": "medial", "jung-base": "medial", "jung-tail": "medial",
    "jong-main": "final", "jong-left": "final", "jong-right": "final" };
  /* 완성형 음절의 중성 21·종성 27 → 호환 자모(나뉜 노드의 통짜 자모를 찾을 때 — font-kku.js syllableCompat) */
  var MEDIALS = Util.JUNG;
  var FINALS = Util.JONG;
  var ROLE_LABELS = Util.ROLE_LABELS;
  var LAYOUT_LABELS = { right: "세로 모음", bottom: "가로 모음", "split-right": "섞인 모음" };
  var DIAGNOSTICS = {
    SOURCE_MISSING: "소스에 그 자모 원본이 없음",
    SOURCE_FALLBACK: "승인된 대체 소스의 같은 자모를 씀",
    COMPOSE_SOURCE_MISSING: "조립식의 재료가 없음",
    RECIPE_DEPTH: "조립식이 너무 깊음"
  };
  /* 맨 위 요청이 둘 이상(머리 음절 노드)이면 문제부터 앞세운다 */
  var KIND_RANK = ["pending", "error", "primitive", "degraded", "none", "composed", "strokes", "direct", "unknown"];
  var ORIGIN_RANK = ["font-fallback-suspected", "font-unverified", "svg-detached", "svg-authored", "svg-builtin", "svg-set",
    "primitive", "none", "unknown"];
  var LEVELS = { yes: "예", partial: "부분", no: "아니오" };

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function unique(list) {
    return list.filter(function (value, index) { return value !== null && value !== undefined && value !== "" && list.indexOf(value) === index; });
  }

  function rank(order, code) {
    var index = order.indexOf(code);
    return index < 0 ? order.length : index;
  }

  function roleLabel(role) {
    return ROLE_LABELS[role] || role || "-";
  }

  // ── Q3: 규칙 고르기(런타임 해석기 그대로) ─────────────────────────────

  /* 규칙의 apply·조각 binding 하나 → { source, bundle(method·recipe·bindings 한 묶음), fallbackSources } (font-kku.js normalizeDesignApply) */
  function normalizeApply(apply) {
    var out = { source: null, bundle: null, fallbackSources: null };
    if (!isRecord(apply)) {
      return out;
    }
    if (typeof apply.source === "string") {
      out.source = apply.source;
    }
    if (Array.isArray(apply.fallbackSources)) {
      out.fallbackSources = apply.fallbackSources.slice();
    }
    if (apply.method !== undefined || apply.recipe !== undefined || apply.bindings !== undefined) {
      var bindings = null;
      if (typeof apply.recipe === "string" && isRecord(apply.bindings)) {
        bindings = {};
        Object.keys(apply.bindings).forEach(function (part) {
          bindings[part] = normalizeApply(apply.bindings[part]);
        });
      }
      out.bundle = { method: apply.method === undefined ? "auto" : apply.method, recipe: typeof apply.recipe === "string" ? apply.recipe : null,
        bindings: bindings };
    }
    return out;
  }

  /* 디자인 JSON의 규칙 → 런타임 정규화본과 같은 { id, jamo, role, layout, hasFinal, source, bundle, fallbackSources, specificity } */
  function normalizeRules(design) {
    var rules = isRecord(design) && Array.isArray(design.rules) ? design.rules : [];
    return rules.filter(isRecord).map(function (rule) {
      var match = isRecord(rule.match) ? rule.match : {};
      var apply = normalizeApply(rule.apply);
      var out = {
        id: String(rule.id),
        jamo: match.jamo,
        role: match.role || null,
        layout: match.vowelLayout === undefined ? null : LAYOUTS[match.vowelLayout] || String(match.vowelLayout),
        hasFinal: match.hasFinal === undefined ? null : match.hasFinal,
        source: apply.source,
        bundle: apply.bundle,
        fallbackSources: apply.fallbackSources
      };
      out.specificity = 1 + (out.role ? 1 : 0) + (out.layout ? 1 : 0) + (out.hasFinal === null ? 0 : 1);
      return out;
    });
  }

  /* 같은 자모 규칙이 이 요청에 맞지 않는 까닭(맞으면 null) — font-kku.js ruleFits */
  function misfit(rule, req) {
    if (rule.role && rule.role !== req.rootRole) {
      return roleLabel(rule.role) + "에만 — 지금 " + roleLabel(req.rootRole);
    }
    if (rule.layout && rule.layout !== req.layout) {
      return (LAYOUT_LABELS[rule.layout] || rule.layout) + " 짜임에만 — 지금 " + (LAYOUT_LABELS[req.layout] || req.layout || "-");
    }
    if (rule.hasFinal !== null && rule.hasFinal !== req.hasFinal) {
      return rule.hasFinal ? "받침 있는 글자에만" : "받침 없는 글자에만";
    }
    return null;
  }

  function request(input) {
    var req = isRecord(input) ? input : {};
    return {
      jamo: req.jamo,
      rootRole: req.rootRole || req.role || "",
      layout: req.layout ? LAYOUTS[req.layout] || String(req.layout) : "",
      hasFinal: req.hasFinal === true,
      binding: isRecord(req.binding) ? req.binding : null,
      inherited: req.inherited || null
    };
  }

  function lose(rule, winner) {
    if (winner.kind === "binding") {
      return { id: rule.id, why: "binding wins", text: "조각 binding에 밀림" };
    }
    if (rule.specificity < winner.rule.specificity) {
      return { id: rule.id, why: "lower specificity than " + winner.rule.id,
        text: "구체성 " + rule.specificity + " < " + winner.rule.specificity + " — 규칙 " + winner.rule.id + "에 밀림" };
    }
    return { id: rule.id, why: "same specificity as " + winner.rule.id + ", listed later",
      text: "구체성 같음 — 앞에 적힌 규칙 " + winner.rule.id + "에 밀림" };
  }

  /* ruleWinners(design, request) — 요청 하나의 필드 묶음(source·bundle·fallbackSources)마다 이긴 쪽과 진 쪽.
   * request: { jamo, rootRole, layout, hasFinal, binding(정규화한 조각 값 | null), inherited(위 요청의 소스 | null) }.
   * rules는 기록(trace.rules)이 적는 차례 — 소스를 고른 규칙·binding, 조립을 고른 규칙·binding(기본에서 왔으면 없음). */
  function ruleWinners(design, input) {
    var req = request(input);
    var rules = normalizeRules(design);
    var roleSources = isRecord(design) && isRecord(design.roleSources) ? design.roleSources : {};
    var defaults = isRecord(design) && isRecord(design.defaults) ? design.defaults : {};
    var fallback = isRecord(design) && isRecord(design.fallback) ? design.fallback : {};
    var normalized = { rules: rules, roleSources: roleSources, defaults: defaults, fallback: fallback };
    var same = rules.filter(function (rule) { return rule.jamo === req.jamo; });
    var fits = same.filter(function (rule) { return Resolution.fits(rule, req); });
    var unmatched = same.filter(function (rule) { return misfit(rule, req); }).map(function (rule) {
      return { id: rule.id, why: misfit(rule, req) };
    });
    var ignored = [];
    var losers = function (field, winner) {
      fits.forEach(function (rule) {
        if (rule[field] !== null && rule[field] !== undefined && rule !== winner.rule) {
          var lost = lose(rule, winner);
          lost.field = field;
          ignored.push(lost);
        }
      });
    };

    /* 소스: 조각 binding > 규칙 > 위 요청에서 물려받음 > 역할 기본 > 디자인 기본 */
    var source = Resolution.source(normalized, req);
    if (source.kind === "binding" || source.kind === "rule") {
      losers("source", source);
    }
    var by = source.kind === "rule" ? "rule " + source.winner : source.kind === "binding" ? "binding" : source.kind === "inherited" ?
      "inherited source" : source.winner;
    var byText = source.kind === "rule" ? "규칙 " + source.winner : source.kind === "binding" ? "조각 binding" :
      source.kind === "inherited" ? "위 요청에서 물려받은 소스" : "역할 기본(" + source.winner + ")";
    var below = ["binding", "rule", "inherited", "role", "defaults"].indexOf(source.kind);
    if (below < 2 && req.inherited) {
      ignored.push({ id: "inherited", field: "source", why: "inherited source overridden by " + by, text: "물려받은 소스 " + req.inherited + " — " + byText + "에 밀림" });
    }
    if (below < 3 && typeof roleSources[req.rootRole] === "string") {
      ignored.push({ id: "roleSources." + req.rootRole, field: "source", why: "role default overridden by " + by,
        text: "역할 기본 " + roleSources[req.rootRole] + " — " + byText + "에 밀림" });
    }
    if (below < 4 && defaults.source) {
      ignored.push({ id: "defaults", field: "source", why: "default overridden by " + by, text: "디자인 기본 " + defaults.source + " — " + byText + "에 밀림" });
    }

    /* 조립(method·recipe·bindings 한 묶음): 조각 binding > 규칙 > 디자인 기본 — 위 요청에서 물려받지 않는다 */
    var bundle = Resolution.bundle(normalized, req);
    if (bundle.kind !== "defaults") {
      losers("bundle", bundle);
    }

    /* 대체 소스(직접일 때만 쓴다): 규칙 > fallback.sourceIds — 조각 binding의 fallbackSources는 런타임이 보지 않는다 */
    var fallbacks = Resolution.fallbacks(normalized, req);
    if (fallbacks.kind === "rule") {
      losers("fallbackSources", fallbacks);
    }

    var traced = [];
    if (source.kind === "binding" || source.kind === "rule") {
      traced.push(source.winner);
    }
    if (bundle.kind !== "defaults") {
      traced.push(bundle.winner);
    }
    var primary = source.kind === "binding" || source.kind === "rule" || bundle.kind === "defaults" ? source : bundle;
    var strip = function (entry) {
      return { kind: entry.kind, winner: entry.winner, value: entry.value };
    };
    return {
      source: strip(source),
      bundle: strip(bundle),
      fallbackSources: strip(fallbacks),
      primary: strip(primary),
      rules: traced,
      ignored: ignored,
      unmatched: unmatched
    };
  }

  // ── 기록 → 요청 되짚기 ───────────────────────────────────────────────

  /* 완성형 음절의 통짜 중성·종성(호환 자모) — 나뉜 노드(jung-base·jung-tail·jong-left·jong-right) 요청의 조립식 주인 */
  function wholeJamo(syllable, role) {
    var text = String(syllable || "");
    var code = text.length === 1 ? text.charCodeAt(0) - 0xAC00 : -1;
    if (code < 0 || code > 11171) {
      return "";
    }
    if (role === "medial") {
      return MEDIALS.charAt(Math.floor(code / 28) % 21);
    }
    var jong = code % 28;
    return role === "final" && jong ? FINALS.charAt(jong - 1) : "";
  }

  function layoutOf(node) {
    var key = String(node.layoutKey || "").split(":");
    return {
      layout: node.layout !== undefined ? node.layout : key[0] || "",
      hasFinal: node.hasFinal !== undefined ? node.hasFinal === true : Boolean(key[1]) && key[1] !== "none"
    };
  }

  function isChild(parent, entry) {
    var path = parent.entry.path || [];
    var mine = entry.path || [];
    return mine.length === path.length + 1 && entry.role === parent.entry.role &&
      path.every(function (step, index) { return step === mine[index]; });
  }

  /* requestsFor(node, entries, design) — 기록 요청마다 런타임이 규칙을 맞춘 요청을 되짚는다. 조각 요청은 위 요청의 조립 묶음에서
   * binding을, 위 요청의 소스를 물려받는다(font-kku.js planRequest child). 맨 위 요청이 조각 경로를 들고 있으면(나뉜 노드) 음절의
   * 통짜 중성·종성 요청에서 binding·소스를 가져온다(designRequests). 머리 음절 노드는 맨 위 요청이 역할마다 하나씩이다.
   * node: { roleAttr, layoutKey, syllable } 또는 { layout, hasFinal }(planJamo). → [{ index, entry, req, winners, parent, children, top }] */
  function requestsFor(node, entries, design) {
    var where = layoutOf(isRecord(node) ? node : {});
    var list = Array.isArray(entries) ? entries : [];
    var stack = [];
    var items = [];
    list.forEach(function (entry, index) {
      while (stack.length && !isChild(stack[stack.length - 1], entry)) {
        stack.pop();
      }
      var parent = stack.length ? stack[stack.length - 1] : null;
      var path = (entry.path || []).slice();
      var req = { jamo: entry.jamo, rootRole: entry.role || (node && NODE_ROLES[node.roleAttr]) || "standalone", layout: where.layout,
        hasFinal: where.hasFinal, path: path, binding: null, inherited: null };
      if (parent) {
        var parentBundle = parent.winners ? parent.winners.bundle.value : null;
        req.binding = parentBundle && parentBundle.bindings ? parentBundle.bindings[path[path.length - 1]] || null : null;
        req.inherited = design ? parent.entry.source : null;
      } else if (design && path.length) {
        var whole = wholeJamo(node && node.syllable, req.rootRole);
        if (whole) {
          var top = ruleWinners(design, { jamo: whole, rootRole: req.rootRole, layout: where.layout, hasFinal: where.hasFinal });
          req.whole = whole;
          req.binding = top.bundle.value.bindings ? top.bundle.value.bindings[path[0]] || null : null;
          req.inherited = top.source.value;
        }
      }
      var item = { index: index, entry: entry, req: req, winners: design ? ruleWinners(design, req) : null, parent: parent ? parent.index : null,
        children: [], top: !parent };
      if (parent) {
        parent.children.push(index);
      }
      stack.push(item);
      items.push(item);
    });
    return items;
  }

  /* 되짚은 이긴 규칙이 기록과 다른 요청 — 비면 이 모델이 런타임과 같다 */
  function mismatches(node, entries, design) {
    return requestsFor(node, entries, design).filter(function (item) {
      return item.winners && item.winners.rules.join(" ") !== (item.entry.rules || []).join(" ");
    }).map(function (item) {
      return { path: item.entry.path, jamo: item.entry.jamo, role: item.entry.role, traced: (item.entry.rules || []).slice(), explained: item.winners.rules };
    });
  }

  // ── Q1: 무엇인가 ─────────────────────────────────────────────────────

  function entryKind(entry) {
    if (entry.status === "pending") {
      return "pending";
    }
    if (entry.result === "primitive") {
      return "primitive";
    }
    if (entry.status === "error") {
      return "error";
    }
    if (entry.status === "degraded") {
      return "degraded";
    }
    return ["direct", "composed", "strokes", "none"].indexOf(entry.result) >= 0 ? entry.result : "none";
  }

  function diagnosticText(entry) {
    return entry.diagnostic ? entry.diagnostic + (DIAGNOSTICS[entry.diagnostic] ? "(" + DIAGNOSTICS[entry.diagnostic] + ")" : "") : "";
  }

  function entryText(entry, code) {
    var diagnostic = entry.diagnostic || "";
    switch (code) {
      case "direct":
        return "원본 그대로";
      case "composed":
        return "조합: " + (entry.recipe || "-");
      case "strokes":
        return "획(원소)";
      case "primitive":
        return "원소로 대체" + (diagnostic ? " — " + diagnostic : "");
      case "pending":
        return "그림 세트 받는 중";
      case "degraded":
        return "대체 경로 — " + (diagnostic || "-") + (entry.effectiveSource ? " → " + entry.effectiveSource : "") +
          (entry.result === "direct" ? "의 원본" : entry.result === "composed" ? " 조합" : "");
      case "error":
        return "실패 — " + (diagnostic || "-") + (entry.result === "none" ? " · 그리지 않음" : "");
      default:
        return "그리지 않음";
    }
  }

  function kindAnswer(items, ctx) {
    if (!items.length) {
      return { code: "unknown", text: "출처 확인 불가 — 글꼴 CSS 그림(조립 기록 없음)",
        detail: ctx.designStatus ? "디자인 진단 " + ctx.designStatus : "그림 자소판·기기 글꼴 낱자는 조립하지 않아 기록이 없습니다" };
    }
    var tops = items.filter(function (item) { return item.top; });
    var answers = tops.map(function (item) {
      var code = entryKind(item.entry);
      return { code: code, text: entryText(item.entry, code), item: item };
    });
    var main = answers.slice().sort(function (a, b) { return rank(KIND_RANK, a.code) - rank(KIND_RANK, b.code); })[0];
    var text = answers.length > 1 ? answers.map(function (answer) {
      return answer.item.entry.jamo + " " + answer.text;
    }).join(" · ") : main.text;
    /* 조합 안의 조각 문제(일부만 원소로 대체 — §14.2)는 반드시 알린다 */
    var pieces = items.filter(function (item) { return !item.top && ["pending", "error", "primitive", "degraded"].indexOf(entryKind(item.entry)) >= 0; });
    if (pieces.length) {
      text += " · 조각 " + pieces.map(function (item) {
        return item.entry.path.join("/") + " " + entryText(item.entry, entryKind(item.entry));
      }).join(", ");
    }
    var detail = tops.map(function (item) {
      var entry = item.entry;
      return roleLabel(entry.role) + " " + entry.jamo + " · " + (entry.method || "-") + (entry.recipe ? " " + entry.recipe : "") +
        " → " + (entry.result || "-") + "(" + (entry.status || "-") + ")" + (entry.diagnostic ? " · " + diagnosticText(entry) : "");
    }).join(" / ");
    return { code: main.code, text: text, detail: detail, recipe: main.item.entry.recipe || "" };
  }

  // ── Q2: 어디서 왔나 ──────────────────────────────────────────────────

  function baseKey(key) {
    return String(key || "").split("@")[0];
  }

  function drawingCell(drawings, key) {
    var cells = drawings && isRecord(drawings.cells) ? drawings.cells : null;
    if (!cells) {
      return null;
    }
    return isRecord(cells[key]) ? cells[key] : isRecord(cells[baseKey(key)]) ? cells[baseKey(key)] : null;
  }

  function drawingOrigin(drawings, key) {
    var cell = drawingCell(drawings, key);
    return cell && isRecord(cell.provenance) ? cell.provenance : null;
  }

  /* 그림 세트 하나의 출처: 작업실에서 그린 세트(그림 문서 참가자) → 그린 것·떼어 낸 것, 내장 세트, 그 밖에 등록된 세트 */
  function setOrigin(set, ctx, keys) {
    var shown = keys.length ? " · 그림 " + keys.join(", ") : "";
    if (ctx.drawings && ctx.drawings.set === set) {
      var detached = keys.filter(function (key) {
        var provenance = drawingOrigin(ctx.drawings, key);
        return provenance && provenance.origin === "detached";
      });
      var imported = keys.filter(function (key) {
        var provenance = drawingOrigin(ctx.drawings, key);
        return provenance && provenance.origin === "imported";
      });
      if (detached.length) {
        var from = drawingOrigin(ctx.drawings, detached[0]).from;
        return { code: "svg-detached", set: set, text: "작업실 그림 세트 " + set + " — 떼어 낸 독립 SVG " + detached.join(", ") +
          (isRecord(from) && from.recipe ? "(예전 " + from.recipe + ")" : "") };
      }
      return { code: "svg-authored", set: set, text: "작업실 그림 세트 " + set + " — 직접 그림" + (imported.length ? "(가져온 SVG " + imported.join(", ") + ")" : "") + shown };
    }
    if (ctx.builtinSets.indexOf(set) >= 0) {
      return { code: "svg-builtin", set: set, text: "내장 그림 세트 " + set + shown };
    }
    return { code: "svg-set", set: set, text: "등록된 그림 세트 " + (set || "-") + "(작업실 밖에서 등록)" + shown };
  }

  /* 기록의 요청을 조립 나무의 잎(조각이 없는 요청)으로 — 실제로 그린 쪽이다. 가획 조합(ㅋ = ㄱ 그림 + 획)은 조각 요청 없이 그 요청이 그린다 */
  function leaves(items) {
    return items.filter(function (item) { return !item.children.length; });
  }

  function originOfSource(sourceId, group, ctx) {
    var design = ctx.design;
    var source = design && isRecord(design.sources) ? design.sources[sourceId] : null;
    if (!design) {
      return sourceId === "primitive" ? { code: "primitive", text: "원소(선·점·원) — 글꼴 CSS의 원소 재료" } : setOrigin(sourceId, ctx, ctx.keys);
    }
    if (!isRecord(source)) {
      return { code: "unknown", text: "소스 " + sourceId + " — 디자인에 없음" };
    }
    if (source.kind === "primitive") {
      return { code: "primitive", source: sourceId, text: "원소(선·점·원) 소스 " + sourceId };
    }
    if (source.kind === "svg") {
      var origin = setOrigin(source.assetSet, ctx, ctx.keys);
      origin.source = sourceId;
      return origin;
    }
    if (source.kind === "font") {
      var entries = group.map(function (item) { return item.entry; });
      var suspected = entries.some(function (entry) { return entry.identity === "fallback-suspected"; });
      var unmeasured = entries.some(function (entry) { return entry.measurement === "unavailable"; });
      var name = source.family + (source.weight ? " " + source.weight : "") + (source.style ? " " + source.style : "");
      var origin = {
        code: suspected ? "font-fallback-suspected" : "font-unverified",
        source: sourceId,
        family: source.family,
        weight: source.weight || null,
        measurement: unmeasured ? "unavailable" : entries.some(function (entry) { return entry.measurement === "pixel"; }) ? "pixel" : "",
        text: "글꼴 " + name + " (소스 " + sourceId + ") — " + (suspected ? "⚠ 대체 글꼴 의심(이 기기에 그 글꼴이 없을 수 있음)" :
          "출처 미확인(글꼴 이름만으로 실제 글꼴인지 증명할 수 없음)") + (unmeasured ? " · 잴 수 없음" : "")
      };
      var glyphs = entries.filter(function (entry) { return isRecord(entry.glyph); }).map(function (entry) {
        return { jamo: entry.jamo, role: entry.role, text: entry.glyph.text, candidate: entry.glyph.candidate, selection: entry.glyph.selection };
      });
      if (glyphs.length) {
        origin.glyphs = glyphs;
        origin.text += " · " + glyphs.map(function (glyph) {
          return glyph.jamo + " → " + glyph.text + " (후보 " + glyph.candidate +
            (glyph.selection === "locked" ? ", 잠금" : glyph.selection === "seed" ? ", 씨앗 선택" : glyph.selection === "css" ? ", CSS 선택" : ", 기본 선택") + ")";
        }).join(" · ");
      }
      return origin;
    }
    return { code: "unknown", source: sourceId, text: "소스 " + sourceId + " — 알 수 없는 종류" };
  }

  function originAnswer(items, ctx) {
    if (!items.length) {
      var face = ctx.node.sprite ? { code: "sprite-cell", text: "그림 자소판 칸(글꼴 CSS)" } :
        ctx.face === "device" ? { code: "device-glyph", text: "기기 글꼴 낱자(글꼴 CSS)" } : { code: "font-css", text: "글꼴 CSS" };
      face.text += " — 출처 확인 불가";
      face.detail = ctx.designStatus ? "이 글꼴은 디자인을 받지 않음(" + ctx.designStatus + ")" : "디자인이 그리지 않은 글자는 조립 기록이 없습니다";
      return face;
    }
    var groups = {};
    var order = [];
    var notes = [];
    leaves(items).forEach(function (item) {
      var entry = item.entry;
      if (entry.result === "primitive") {
        notes.push({ code: "primitive", text: entry.jamo + " 원소로 대체(요청 소스 " + entry.source + "에 원본 없음)" });
        return;
      }
      if (entry.result === "none") {
        notes.push({ code: "none", text: entry.jamo + " 그리지 않음(" + (entry.diagnostic || "-") + ")" });
        return;
      }
      var id = entry.effectiveSource || entry.source;
      if (!groups[id]) {
        groups[id] = [];
        order.push(id);
      }
      groups[id].push(item);
    });
    var origins = order.map(function (id) {
      var origin = originOfSource(id, groups[id], ctx);
      var swapped = groups[id].filter(function (item) { return item.entry.effectiveSource; })[0];
      if (swapped) {
        origin.requested = swapped.entry.source;
        origin.text = "요청 소스 " + swapped.entry.source + " 대신 " + origin.text;
      }
      return origin;
    }).concat(notes);
    var main = origins.slice().sort(function (a, b) { return rank(ORIGIN_RANK, a.code) - rank(ORIGIN_RANK, b.code); })[0] ||
      { code: "none", text: "그린 것 없음" };
    return {
      code: main.code,
      text: origins.map(function (origin) { return origin.text; }).filter(function (text, index, all) { return all.indexOf(text) === index; }).join(" + "),
      source: main.source || "",
      sources: unique(order),
      effectiveSource: origins.filter(function (origin) { return origin.requested; }).length ? main.source || "" : "",
      drawing: ctx.keys.join(" "),
      detail: origins.length > 1 ? "조각마다 다른 출처 " + origins.length + "곳" : ""
    };
  }

  // ── Q3: 어느 규칙인가 ────────────────────────────────────────────────

  function winnerText(part, field) {
    var value = field === "bundle" ? (part.value.method || "auto") + (part.value.recipe ? " " + part.value.recipe : "") :
      Array.isArray(part.value) ? "[" + part.value.join(", ") + "]" : part.value || "-";
    var by = part.kind === "rule" ? "규칙 " + part.winner : part.kind === "binding" ? "조각 binding" : part.kind === "inherited" ?
      "위 요청에서 물려받음" : part.kind === "role" ? "역할 기본 " + part.winner : field === "fallbackSources" ? "디자인 fallback.sourceIds" : "디자인 기본";
    return by + " → " + value;
  }

  function ruleAnswer(items, ctx) {
    var tops = items.filter(function (item) { return item.top; });
    if (!ctx.design || !tops.length || !tops[0].winners) {
      return { code: items.length ? "font-css" : "none", winner: "", ignored: [], text: ctx.designNote ||
        (items.length ? "디자인 없음 — 글꼴 CSS 설정(원소 재료)을 따름" : "디자인 없음 — 글꼴 CSS가 그림(규칙 없음)"), detail: "" };
    }
    var main = tops[0];
    var winners = main.winners;
    var text = "소스: " + winnerText(winners.source, "source") + " · 조립: " + winnerText(winners.bundle, "bundle");
    if (main.entry.method === "direct" || winners.bundle.value.method === "direct") {
      text += " · 대체: " + winnerText(winners.fallbackSources, "fallbackSources");
    }
    var ignored = winners.ignored;
    if (ignored.length) {
      text += " · 무시: " + ignored.map(function (lost) { return lost.id + "(" + lost.text + ")"; }).join(", ");
    }
    if (winners.unmatched.length) {
      text += " · 맞지 않음: " + winners.unmatched.map(function (rule) { return rule.id + "(" + rule.why + ")"; }).join(", ");
    }
    if (main.req.whole) {
      text += " · " + main.req.whole + " 조립식의 조각 " + main.req.path.join("/");
    }
    var pieces = items.filter(function (item) { return item !== main && item.winners; }).map(function (item) {
      return (item.entry.path.join("/") || item.entry.jamo) + " " + item.entry.jamo + ": 소스 " + winnerText(item.winners.source, "source") +
        (item.winners.ignored.length ? " (무시 " + item.winners.ignored.map(function (lost) { return lost.id; }).join(", ") + ")" : "");
    });
    return {
      code: winners.primary.kind,
      winner: winners.primary.winner,
      winners: { source: winners.source.winner, bundle: winners.bundle.winner, fallbackSources: winners.fallbackSources.winner },
      ignored: unique(ignored.map(function (lost) { return lost.id; })),
      unmatched: winners.unmatched.map(function (rule) { return rule.id; }),
      text: text,
      detail: pieces.join(" / "),
      explained: winners
    };
  }

  // ── Q4: 상위 원본을 따라가나 ─────────────────────────────────────────

  function followAnswer(items, ctx) {
    if (!items.length) {
      return { code: "independent", upstream: [], text: "글꼴 CSS 그림 — 따라갈 상위 원본 없음", detail: "" };
    }
    var top = items.filter(function (item) { return item.top; })[0];
    var own = top.entry.jamo;
    var ownKeys = ctx.keys.filter(function (key) { return baseKey(key) === own; });
    /* 떼어 낸 독립 SVG — 예전 조립식만 적고 따라가지 않는다(§5.5 detached-artwork) */
    var detached = ctx.drawings ? ownKeys.map(function (key) { return drawingOrigin(ctx.drawings, key); }).filter(function (provenance) {
      return provenance && provenance.origin === "detached";
    })[0] : null;
    if (detached && top.entry.result === "direct") {
      var from = isRecord(detached.from) ? detached.from : {};
      return { code: "independent", upstream: [], formerly: from.recipe || "", text: "독립 SVG" + (from.recipe ? " — 예전 " + from.recipe : "") +
        " · 상위 원본을 고쳐도 바뀌지 않음", detail: "떼어 낸 그림(detached-artwork)은 조각마다 따로 고칩니다" };
    }
    var upstream = [];
    items.forEach(function (item) {
      if (!item.top && !item.children.length && item.entry.result === "direct") {
        upstream.push(item.entry.jamo);
      }
    });
    ctx.keys.concat(ctx.aliases).forEach(function (key) {
      if (baseKey(key) !== own) {
        upstream.push(key.charAt(0) === "@" ? key : baseKey(key));
      }
    });
    ctx.leaves.forEach(function (leaf) {
      if (leaf.glyph && leaf.glyph !== own) {
        upstream.push(leaf.glyph);
      }
    });
    upstream = unique(upstream);
    if (upstream.length) {
      return { code: "follows", upstream: upstream, text: "상위 원본(" + upstream.join(", ") + ")을 따라감 — 그것을 고치면 이 자모도 함께 바뀜",
        detail: top.entry.recipe ? "조립식 " + top.entry.recipe : "그림이 맡지 않은 획은 세트의 그림으로 긋습니다" };
    }
    var source = ctx.design && isRecord(ctx.design.sources) ? ctx.design.sources[top.entry.effectiveSource || top.entry.source] : null;
    if (top.entry.result === "direct") {
      var authored = isRecord(source) && source.kind === "svg" && ctx.drawings && ctx.drawings.set === source.assetSet;
      return { code: "independent", upstream: [], text: (isRecord(source) && source.kind === "font" ? "글꼴 원본 낱자" : authored ? "직접 그린 원본" :
        "그림 세트의 원본") + " — 따라갈 상위 원본 없음", detail: "" };
    }
    if (top.entry.result === "strokes" || top.entry.result === "primitive") {
      return { code: "independent", upstream: [], text: "뼈대 획 — 따라갈 상위 원본 없음", detail: "획은 뼈대 정본(spec/jamo-skeletons.json)에서 옵니다" };
    }
    return { code: "independent", upstream: [], text: "따라갈 상위 원본 없음", detail: "" };
  }

  // ── Q5: 무엇을 할 수 있나 ────────────────────────────────────────────

  function combine(values) {
    var list = unique(values);
    return list.length === 1 ? list[0] : list.length ? "partial" : "no";
  }

  function capabilityAnswer(items, ctx) {
    var pieces = [];
    var fontSource = function (id) {
      var source = ctx.design && isRecord(ctx.design.sources) ? ctx.design.sources[id] : null;
      return isRecord(source) && source.kind === "font";
    };
    if (!items.length) {
      return { code: "no", stroke: "no", animation: ctx.node.sprite || ctx.face === "device" ? "partial" : "no", vector: "no",
        text: "획 편집 아니오 · 필기 애니메이션 부분(자모 단위) · 독립 벡터 아니오 — 글꼴 CSS 그림에는 획 구조가 없음", detail: "" };
    }
    var builtin = function (key) {
      var top = items[0];
      var source = ctx.design && isRecord(ctx.design.sources) ? ctx.design.sources[top.entry.effectiveSource || top.entry.source] : null;
      var set = isRecord(source) && source.kind === "svg" ? source.assetSet : ctx.design ? null : top.entry.source;
      return Boolean(set) && ctx.builtinSets.indexOf(set) >= 0 && !(ctx.drawings && ctx.drawings.set === set) && key;
    };
    ctx.hoeks.forEach(function (hoek) {
      if (hoek.drawing) {
        pieces.push({ type: "svg", key: hoek.drawing, builtin: Boolean(builtin(hoek.drawing)), stroke: "partial", animation: "partial", vector: "yes" });
      } else {
        pieces.push({ type: "stroke", stroke: "yes", animation: "yes", vector: "yes" });
      }
    });
    ctx.leaves.forEach(function (leaf) {
      pieces.push({ type: "font", key: leaf.glyph, stroke: "no", animation: "no", vector: "no" });
    });
    if (!pieces.length && items.some(function (item) { return item.entry.result === "direct" && fontSource(item.entry.effectiveSource || item.entry.source); })) {
      pieces.push({ type: "font", key: items[0].entry.jamo, stroke: "no", animation: "no", vector: "no" });
    }
    if (!pieces.length) {
      return { code: "no", stroke: "no", animation: "no", vector: "no", text: "획 편집 아니오 · 필기 애니메이션 아니오 · 독립 벡터 아니오 — 그린 것 없음",
        detail: "" };
    }
    var out = {
      stroke: combine(pieces.map(function (piece) { return piece.stroke; })),
      animation: combine(pieces.map(function (piece) { return piece.animation; })),
      vector: combine(pieces.map(function (piece) { return piece.vector; }))
    };
    var count = function (type) { return pieces.filter(function (piece) { return piece.type === type; }); };
    var reasons = [];
    if (count("stroke").length) {
      reasons.push("뼈대 획 " + count("stroke").length + "개 — 획마다");
    }
    var svg = count("svg");
    if (svg.length) {
      var keys = unique(svg.map(function (piece) { return piece.key; }));
      reasons.push("그림 " + keys.join(", ") + " — 조각 단위" + (svg.some(function (piece) { return piece.builtin; }) ?
        " — 내장 세트라 독립 SVG로 떼어 내야 고칠 수 있음(detach to edit)" : ""));
    }
    if (count("font").length) {
      reasons.push("글꼴 낱자 " + unique(count("font").map(function (piece) { return piece.key; })).join(", ") +
        " — 획 구조 없음(§6.6), 글꼴에 기대 독립 벡터 아님(§17.3)");
    }
    out.code = out.stroke === "yes" && out.animation === "yes" && out.vector === "yes" ? "yes" :
      out.stroke === "no" && out.animation === "no" && out.vector === "no" ? "no" : "partial";
    out.text = "획 편집 " + LEVELS[out.stroke] + " · 필기 애니메이션 " + LEVELS[out.animation] + " · 독립 벡터 " + LEVELS[out.vector] +
      " — " + reasons.join(" · ");
    out.detail = "";
    out.pieces = pieces.map(function (piece) { return piece.type + (piece.key ? ":" + piece.key : ""); });
    return out;
  }

  // ── 다섯 답 ──────────────────────────────────────────────────────────

  /* answer({ node, entries, design, drawings, hoeks, leaves, applied, face, designStatus, designNote, builtinSets })
   * node: { jamo, roleAttr, pos, stamp, layoutKey, syllable, sprite } — entries: traceOf 노드의 requests — design: 그 기록을 낸 디자인 JSON
   * (없으면 null) — drawings: 참가자 'drawings'의 그림 문서(font-kku-drawing v1, 없으면 null) — hoeks: [{ drawing, strokeIndex, element,
   * alias }] — leaves: 글꼴 조각 잎 [{ path, source, glyph }]. → { kind, origin, rule, follow, capability, requests } 각 { code, text, detail, … } */
  function answer(input) {
    var opts = isRecord(input) ? input : {};
    var node = isRecord(opts.node) ? opts.node : {};
    var design = isRecord(opts.design) ? opts.design : null;
    var entries = Array.isArray(opts.entries) ? opts.entries : [];
    var hoeks = Array.isArray(opts.hoeks) ? opts.hoeks.filter(isRecord) : [];
    var ctx = {
      node: node,
      design: design,
      drawings: isRecord(opts.drawings) ? opts.drawings : null,
      hoeks: hoeks,
      leaves: Array.isArray(opts.leaves) ? opts.leaves.filter(isRecord) : [],
      keys: unique(hoeks.map(function (hoek) { return hoek.drawing; })),
      aliases: unique(hoeks.map(function (hoek) { return hoek.alias; })),
      face: opts.face || "",
      designStatus: opts.designStatus || "",
      designNote: opts.designNote || "",
      builtinSets: Array.isArray(opts.builtinSets) ? opts.builtinSets : BUILTIN_SETS
    };
    var items = requestsFor(node, entries, design);
    return {
      kind: kindAnswer(items, ctx),
      origin: originAnswer(items, ctx),
      rule: ruleAnswer(items, ctx),
      follow: followAnswer(items, ctx),
      capability: capabilityAnswer(items, ctx),
      requests: items.map(function (item) {
        var request = { path: item.entry.path, jamo: item.entry.jamo, role: item.entry.role, source: item.entry.source, result: item.entry.result,
          status: item.entry.status, rules: (item.entry.rules || []).slice(), explained: item.winners ? item.winners.rules : null, top: item.top };
        if (isRecord(item.entry.glyph)) { request.glyph = Object.assign({}, item.entry.glyph); }
        return request;
      })
    };
  }

  var FontStudioProvenanceModel = {
    BUILTIN_SETS: BUILTIN_SETS,
    QUESTIONS: ["kind", "origin", "rule", "follow", "capability"],
    normalizeRules: normalizeRules,
    ruleWinners: ruleWinners,
    requestsFor: requestsFor,
    mismatches: mismatches,
    wholeJamo: wholeJamo,
    entryKind: entryKind,
    answer: answer
  };

  global.FontStudioProvenanceModel = FontStudioProvenanceModel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioProvenanceModel;
  }
})(typeof window !== "undefined" ? window : globalThis);
