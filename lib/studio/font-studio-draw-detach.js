/* font-studio-draw-detach.js — 조합 자모를 독립 SVG로 (설계 v1.2 §13.3·§5.5, PLAN-HANGUL-001 F6)
 *
 * 그리기 탭(F5)에 붙는 칸 [data-studio-f=draw-detach]. 조립식(가획·겹자모·천지인)이 만든 자모를 조각마다 따로 고칠 수 있는 독립
 * 그림(출처 origin detached)으로 굳혀 그림 문서(디자인 참가자 'drawings')에 넣는다. 그 뒤로 그 자모는 세트의 제 칸을 그대로 쓰고
 * (planJamo 결과 direct) 위 원본(ㅋ의 ㄱ)을 고쳐도 따라가지 않는다 — 조각 보정은 떼어 낸 그림에서만 한다.
 *
 * 잡기(capture): 화면 밖 바탕 요소 하나(그림자 뿌리, Studio.addPreviewRoot)에 지금 디자인으로 문맥마다 표본 음절 하나를 그린다 —
 *   바탕(초성 자리) X+ㅣ · 가로 모음 위(@bar) X+ㅡ · 받침(@jong) 으+X(받침에만 오는 겹받침은 바탕도) · 모음은 낱자.
 *   그 자모 노드의 획([part=hoek])마다 조각 하나: 이름은 그림 키(data-hoek-drawing) 또는 '획 n'. 자리는 런타임이 적은 노드 em
 *   인라인 값(상자 --fy-el-x/y/bw/bh · 선 --fy-el-x/y/len/angle · 고리 --fy-el-cx/cy/rx/ry)과 그림 <svg part=vector>의 viewBox·
 *   도형만 읽는다 — getBoundingClientRect를 쓰지 않아 노드 배율·도장·화면 크기와 무관하다. 조립식 이름은 그 노드의 기록(traceOf).
 *   (이 값들은 font-kku.js placeElement·boxCell의 내부 꼴이다 — 바뀌면 떼어 낸 모양이 어긋나므로 스모크가 잉크 IoU로 지킨다.)
 * 떼기(detach): DrawModel.detachFromCapture로 문맥마다 칸을 만들고, 문맥 칸은 바탕 칸과 모양이 다를 때만 따로 둔다(런타임은 문맥
 *   칸이 없으면 바탕 칸을 그 자리 뼈대 범위에 늘여 쓴다). 이미 그림 그대로(direct)인 문맥은 건드리지 않는다. 편집 하나
 *   ('<자모> 독립 SVG로')가 그림 문서를 바꾼다. 이 자모를 조합으로 묶는 규칙(apply.method compose)이 있으면 독립 그림이 쓰이지
 *   않으므로 같은 편집에서 그 규칙의 조립 지정을 뺄 수 있다(dropComposeRule — 남는 지정이 없으면 규칙째).
 *
 * 하지 않는 것(계획 밖): 위 자모를 따라가는 조각 보정(§5.5 linked-adjustment), 글꼴 낱자 → SVG(§6.6), 고정 배치의 자모별
 * 크기·자리(도장이 맡는다).
 *
 * FontStudio.drawDetach = { capture(jamo, { contexts }) → Promise<잡은 것>, detach(jamo, { contexts, dropComposeRule }) →
 *                           Promise<편집 결과 + { jamo, cells, skipped, dropped, pinned }>, inspect(jamo), target(), busy }
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var syllable = Util.compose;
  var make = Util.element;

  var Studio = window.FontStudio;
  var Draw = window.FontStudioDrawModel;
  var FontKku = window.FontKku;
  if (!Studio || !Draw || !FontKku || !Studio.f || !Studio.draw || !Studio.design || typeof Studio.design.edit !== "function" ||
      typeof Studio.addPreviewRoot !== "function" || typeof FontKku.traceOf !== "function" || typeof FontKku.planJamo !== "function") {
    return;
  }

  var design = Studio.design;
  var draw = Studio.draw;
  var CHO = Util.CHO;
  var JUNG = Util.JUNG;
  var JONG = Util.JONG;
  var FINAL_ONLY = "ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ";
  var DRAWN = '[part~="jamo"], [part="content"][data-fy-standalone]';
  /* 떼어 낼 수 있는 지금 모양 — 조립식이 만든 것(composed)과 원소 획으로 채운 것(strokes) */
  var DETACHABLE = { composed: true, strokes: true };
  var ROLE_TEXT = { base: "기본 획", added: "가획", variant: "이체 획", heaven: "천(ㆍ) 획", earth: "지(ㅡ) 획", person: "인(ㅣ) 획" };
  var CONTEXT_TEXT = { "": "바탕", "@bar": "가로 모음 위", "@jong": "받침" };
  var STATUS_TEXT = { authored: "직접 그림", detached: "독립 그림(떼어 냄)", imported: "가져온 그림", direct: "원본 그대로(다른 세트)",
    composed: "조합", strokes: "원소 획", primitive: "원소로 대체", none: "그리지 않음", error: "그리지 못함" };
  var SAMPLE_SIZE = "120px";
  var LINK_TIMEOUT = 4000;
  /* 문맥 칸이 바탕 칸과 같은 모양인지 — 각자 범위를 0–1000에 늘인 좌표의 차이(0.5%) */
  var SAME_TOLERANCE = 5;

  var section = null;
  var built = false;
  var life = null; // 깨어 있는 동안의 수명 맥락(f.mount activate)
  var els = {};
  var picked = null;
  var renderTimer = null;
  var pending = 0;
  var chain = Promise.resolve();
  var stage = null;

  function fail(code, message) {
    return { code: code, message: message };
  }

  // ── 표본 음절 ─────────────────────────────────────────────────────────

  function isVowel(jamo) {
    return JUNG.indexOf(jamo) >= 0;
  }

  /* 문맥 하나의 표본 { context, key, text, char(그 노드의 조합형 글자 — 모음은 낱자 그대로) } */
  function sampleFor(jamo, context) {
    if (isVowel(jamo)) {
      return { context: "", key: jamo, text: jamo, char: jamo };
    }
    var final = context === "@jong" || (context === "" && FINAL_ONLY.indexOf(jamo) >= 0);
    if (final) {
      return { context: context, key: jamo + context, text: syllable("ㅇ", "ㅡ", jamo),
        char: String.fromCharCode(0x11a8 + JONG.indexOf(jamo)) };
    }
    return { context: context, key: jamo + context, text: syllable(jamo, context === "@bar" ? "ㅡ" : "ㅣ"),
      char: String.fromCharCode(0x1100 + CHO.indexOf(jamo)) };
  }

  /* 고칠 수 있는 문맥(DrawModel.contextsFor) 중 요청한 것만 — 모르는 문맥은 버린다 */
  function contextsOf(jamo, wanted) {
    var all = Draw.contextsFor(jamo);
    if (!Array.isArray(wanted)) {
      return all;
    }
    return all.filter(function (context) { return wanted.indexOf(context) >= 0; });
  }

  /* 미리보기에서 고른 노드(조합형 낱자) → 호환 자모 */
  function compatOf(node) {
    var ch = node && (node.getAttribute("data-jamo") || node.getAttribute("data-fy-standalone")) || "";
    var code = ch.charCodeAt(0);
    if (code >= 0x1100 && code <= 0x1112) {
      return CHO.charAt(code - 0x1100);
    }
    if (code >= 0x1161 && code <= 0x1175) {
      return JUNG.charAt(code - 0x1161);
    }
    if (code >= 0x11a8 && code <= 0x11c2) {
      return JONG.charAt(code - 0x11a8);
    }
    return /^[ㄱ-ㅣ]$/.test(ch) ? ch : null;
  }

  // ── 지금 디자인에서 자모 하나 ─────────────────────────────────────────

  function currentJson() {
    return design.state && design.state.json ? design.state.json : null;
  }

  /* 이 자모를 조합으로 묶는 규칙 id — 문맥 조건과 무관하게 자모가 같고 apply.method가 compose */
  function pinningRules(json, jamo) {
    return (json && Array.isArray(json.rules) ? json.rules : []).filter(function (rule) {
      return rule && rule.match && rule.match.jamo === jamo && rule.apply && rule.apply.method === "compose";
    }).map(function (rule) { return rule.id; });
  }

  /* 떼어 낼 수 있나 — { jamo, status, recipe, allowed, reason, code, pinning, set } (동기, 화면 줄과 API가 함께 쓴다) */
  function inspect(jamo) {
    var out = { jamo: jamo || null, status: "", recipe: "", allowed: false, reason: "", code: null, pinning: [], set: null };
    var json = currentJson();
    var doc = draw.doc();
    out.set = doc ? doc.set : null;
    if (!jamo || !Draw.contextsFor(jamo).length || jamo === Draw.HELPER) {
      out.code = "STUDIO_DETACH_JAMO";
      out.reason = jamo === Draw.HELPER ? "ㆍ는 조합하지 않는 보조 원본입니다" : "자모를 고르세요";
      return out;
    }
    out.pinning = pinningRules(json, jamo);
    if (!json || json.mode !== "svg") {
      out.code = "STUDIO_DETACH_MODE";
      out.reason = "그림 세트(svg) 재료에서만 떼어 냅니다";
      return out;
    }
    if (!doc || Draw.isEmpty(doc)) {
      out.code = "STUDIO_DETACH_NO_DRAWING";
      out.reason = "작업실 그림 세트가 없습니다 — 그리기를 먼저 시작하세요";
      return out;
    }
    var state = typeof draw.statusOf === "function" ? draw.statusOf(jamo) : null;
    out.status = state ? state.status : "";
    out.recipe = state ? state.recipe || "" : "";
    var source = rootSource(jamo, json);
    if (!source || source.kind !== "svg" || source.assetSet !== doc.set) {
      out.code = "STUDIO_DETACH_SOURCE";
      out.reason = "이 자모는 작업실 그림 세트(" + doc.set + ")를 쓰지 않습니다";
      return out;
    }
    if (!DETACHABLE[out.status]) {
      out.code = "STUDIO_DETACH_NOT_COMPOSED";
      out.reason = out.status === "detached" || out.status === "authored" || out.status === "imported"
        ? "조각은 위 칸 편집기에서 따로 고칩니다" : "조합·원소 획일 때만 떼어 냅니다";
      return out;
    }
    out.allowed = true;
    return out;
  }

  function rootSource(jamo, json) {
    try {
      var plan = FontKku.planJamo(jamo, { design: design.name() });
      var root = plan.trace.filter(function (item) { return item.path.length === 0; })[0];
      return root && json.sources ? json.sources[root.source] || null : null;
    } catch (error) {
      return null;
    }
  }

  // ── 화면 밖 무대 ──────────────────────────────────────────────────────

  /* 바탕 요소 하나를 화면 밖(작업실 [data-studio] 밖)에 둔다. 글꼴 시트는 Studio.addPreviewRoot가, 핵심 시트는 <link>가 —
   * 오지 않아도(막힘) 4초에 놓아 settled()를 붙들지 않는다 */
  function ensureStage() {
    if (stage) {
      return stage.ready;
    }
    var box = document.createElement("div");
    box.setAttribute("data-draw-detach-stage", "");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = "position: fixed; left: -10000px; top: 0; inline-size: 1600px; visibility: hidden; pointer-events: none;";
    var root = box.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = Studio.coreHref();
    var ready = new Promise(function (resolve) {
      var done = function () { resolve(); };
      link.addEventListener("load", done, { once: true });
      link.addEventListener("error", done, { once: true });
      setTimeout(done, LINK_TIMEOUT);
    });
    root.appendChild(link);
    var host = document.createElement("font-kku");
    host.setAttribute("size", SAMPLE_SIZE);
    host.setAttribute("wrap-unit", "glyph");
    root.appendChild(host);
    document.body.appendChild(box);
    Studio.addPreviewRoot(root, []);
    stage = { box: box, root: root, host: host, ready: ready };
    return ready;
  }

  function renderSample(text) {
    var host = stage.host;
    host.setAttribute("font", Studio.state.fontId || "untitled");
    host.style.setProperty("--fy-design", design.name());
    FontKku.render(host, { text: text });
    return host;
  }

  function charOf(node) {
    return node.getAttribute("data-jamo") || node.getAttribute("data-fy-standalone") || "";
  }

  function childrenByPart(node, part) {
    return Array.prototype.filter.call(node.children, function (child) {
      return child.getAttribute("part") === part;
    });
  }

  function emOf(span, name) {
    return parseFloat(span.style.getPropertyValue(name));
  }

  /* 그림 <svg part=vector>의 viewBox와 도형(런타임 boxCell이 쓴 path d · ellipse, data-fill은 채운 도형) */
  function vectorCell(span) {
    var svg = childrenByPart(span, "vector")[0];
    if (!svg) {
      return null;
    }
    var shapes = [];
    Array.prototype.forEach.call(svg.children, function (child) {
      var fill = child.hasAttribute("data-fill");
      if (child.localName === "path") {
        var d = child.getAttribute("d") || "";
        shapes.push(fill ? { d: d, fill: true } : d);
      } else if (child.localName === "ellipse") {
        var values = ["cx", "cy", "rx", "ry"].map(function (name) { return Number(child.getAttribute(name)); });
        shapes.push(fill ? { ellipse: values, fill: true } : { ellipse: values });
      }
    });
    return shapes.length ? { viewBox: svg.getAttribute("viewBox"), shapes: shapes } : null;
  }

  /* 선 원소의 그림 상자 두께(노드 em) — 굵기 --fy-el-w(계산값 px ÷ 글자 크기) × 굵기 방향 되돌림 --fy-el-k × 밀도 굵기 계수
   * --fy-el-density(노드 값이 물려 온다 — 도장이면 도장 값, 칠 그림 노드는 1, 없으면 1). font-kku.css 선 원소의 --fy-el-t와 같다 */
  function lineThickness(span) {
    var style = getComputedStyle(span);
    var w = parseFloat(style.getPropertyValue("--fy-el-w")) / (parseFloat(style.fontSize) || 1);
    var k = emOf(span, "--fy-el-k");
    var density = parseFloat(style.getPropertyValue("--fy-el-density"));
    return w > 0 ? w * (isFinite(k) && k > 0 ? k : 1) * (density > 0 ? density : 1) : undefined;
  }

  /* 원소 하나 → detachFromCapture 항목(노드 em). 모르는 꼴은 null */
  function elementItem(span) {
    var type = span.getAttribute("data-element");
    var cell = vectorCell(span);
    var item = null;
    if (type === "box" && cell) {
      item = { type: "box", rect: [emOf(span, "--fy-el-x"), emOf(span, "--fy-el-y"), emOf(span, "--fy-el-bw"), emOf(span, "--fy-el-bh")],
        cell: cell };
      return item.rect.every(isFinite) ? item : null;
    }
    if (type === "line") {
      item = { type: "line", x: emOf(span, "--fy-el-x"), y: emOf(span, "--fy-el-y"), len: emOf(span, "--fy-el-len"),
        angleDeg: emOf(span, "--fy-el-angle") || 0 };
      if (cell) {
        item.cell = cell;
        var w = lineThickness(span);
        if (w !== undefined) {
          item.w = w;
        }
      }
      return [item.x, item.y, item.len].every(isFinite) ? item : null;
    }
    if (type === "ring") {
      item = { type: "ring", cx: emOf(span, "--fy-el-cx"), cy: emOf(span, "--fy-el-cy"), rx: emOf(span, "--fy-el-rx"),
        ry: emOf(span, "--fy-el-ry") };
      if (cell) {
        item.cell = cell;
      }
      return [item.cx, item.cy, item.rx, item.ry].every(isFinite) ? item : null;
    }
    return null;
  }

  /* 노드의 획마다 조각 하나 { id, label, items } — 같은 그림을 두 번 쓰면(ㅃ의 ㅂ 둘) 'ㅂ 2' */
  function piecesOf(node) {
    var seen = {};
    var pieces = [];
    childrenByPart(node, "hoek").forEach(function (hoek, index) {
      var drawing = hoek.getAttribute("data-hoek-drawing");
      var id;
      var label;
      if (drawing) {
        id = Draw.baseOf(drawing) || drawing;
        label = drawing + " 그림";
      } else {
        var order = hoek.getAttribute("data-hoek") || String(index + 1);
        var role = ROLE_TEXT[hoek.getAttribute("data-hoek-role")];
        id = "획 " + order;
        label = role ? "획 " + order + " · " + role : "획 " + order;
      }
      var unique = id;
      var serial = 2;
      while (seen[unique]) {
        unique = id + " " + serial;
        serial += 1;
      }
      seen[unique] = true;
      var items = childrenByPart(hoek, "element").map(elementItem).filter(Boolean);
      if (items.length) {
        pieces.push({ id: unique, label: label, items: items });
      }
    });
    return pieces;
  }

  /* 표본 하나를 그려 그 자모 노드와 기록의 뿌리 요청을 잡는다 */
  function captureSample(sample) {
    var host = renderSample(sample.text);
    var node = Array.prototype.filter.call(host.querySelectorAll(DRAWN), function (item) {
      return charOf(item) === sample.char;
    })[0] || null;
    var trace = FontKku.traceOf(host);
    var entry = trace ? trace.nodes.filter(function (item) { return item.jamo === sample.char; })[0] : null;
    var root = entry ? entry.requests.filter(function (request) { return request.path.length === 0; })[0] : null;
    var row = { context: sample.context, key: sample.key, text: sample.text, found: Boolean(node && root), result: root ? root.result : null,
      status: root ? root.status : null, recipe: root ? root.recipe || null : null, rules: root ? root.rules.slice() : [],
      source: root ? root.source : null, pieces: [] };
    if (node && root) {
      row.pieces = piecesOf(node);
    }
    return row;
  }

  function captureNow(jamo, options) {
    var opts = options || {};
    var info = inspect(jamo);
    var base = { jamo: jamo, set: info.set, design: design.name(), status: info.status, recipe: info.recipe, pinning: info.pinning,
      contexts: [], refused: null };
    if (!info.allowed) {
      base.refused = fail(info.code, info.reason);
      return Promise.resolve(base);
    }
    return ensureStage().then(function () {
      var json = currentJson();
      var doc = draw.doc();
      base.contexts = contextsOf(jamo, opts.contexts).map(function (context) {
        var row = captureSample(sampleFor(jamo, context));
        var source = json && json.sources && row.source ? json.sources[row.source] : null;
        row.ownSet = Boolean(source && source.kind === "svg" && doc && source.assetSet === doc.set);
        return row;
      });
      if (!base.contexts.some(function (row) { return row.found && row.pieces.length; })) {
        base.refused = fail("STUDIO_DETACH_NOT_FOUND", jamo + " 노드를 그리지 못했습니다");
      }
      return base;
    });
  }

  /* 한 번에 하나씩(무대 바탕 요소 하나를 함께 쓴다) */
  function queue(task) {
    pending += 1;
    var run = chain.then(task);
    chain = run.then(function () {}, function () {});
    return run.then(function (value) {
      pending -= 1;
      scheduleRender();
      return value;
    }, function (error) {
      pending -= 1;
      scheduleRender();
      throw error;
    });
  }

  function capture(jamo, options) {
    return queue(function () { return captureNow(String(jamo || ""), options); });
  }

  // ── 떼기 ──────────────────────────────────────────────────────────────

  /* 각자 범위를 0–1000에 늘인 도형 글(한 축이 선 하나면 그 축은 옮기기만) — 런타임은 칸 범위를 자리에 늘이므로 이 글이 같으면
   * 화면 모양도 같다 */
  function normalizedShapes(cell) {
    var shapes = [];
    cell.parts.forEach(function (part) {
      shapes = shapes.concat(part.shapes);
    });
    var box = Draw.boundsOf(shapes);
    var axis = function (a, b) {
      return b - a > 1e-6 ? [1000 / (b - a), -a * 1000 / (b - a)] : [1, 500 - a];
    };
    var xs = axis(box[0], box[2]);
    var ys = axis(box[1], box[3]);
    return JSON.stringify(Draw.transformShapes(shapes, [xs[0], 0, 0, ys[0], xs[1], ys[1]], { precision: 2 }));
  }

  function sameShape(a, b) {
    if (a.parts.length !== b.parts.length) {
      return false;
    }
    var left = normalizedShapes(a);
    var right = normalizedShapes(b);
    var number = /-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi;
    if (left.replace(number, "#") !== right.replace(number, "#")) {
      return false;
    }
    var xs = left.match(number) || [];
    var ys = right.match(number) || [];
    return xs.length === ys.length && xs.every(function (value, index) {
      return Math.abs(Number(value) - Number(ys[index])) <= SAME_TOLERANCE;
    });
  }

  /* 조합으로 묶는 규칙에서 조립 지정(method·recipe·bindings)을 뺀다 — 남는 지정이 없으면(fit만) 규칙째 */
  function dropCompose(draft, ids) {
    if (!ids.length || !Array.isArray(draft.rules)) {
      return [];
    }
    var dropped = [];
    draft.rules = draft.rules.filter(function (rule) {
      if (!rule || ids.indexOf(rule.id) < 0) {
        return true;
      }
      dropped.push(rule.id);
      ["method", "recipe", "bindings"].forEach(function (key) {
        delete rule.apply[key];
      });
      return Object.keys(rule.apply).some(function (key) { return key !== "fit"; });
    });
    return dropped;
  }

  /* 그 세트의 보이는 칸 목록이 있으면 떼어 낸 자모를 더한다(빈 목록은 그림 세트가 빈 문서였을 때의 표시 — 지운다) */
  function showJamo(draft, set, jamo) {
    Object.keys(draft.sources || {}).forEach(function (id) {
      var source = draft.sources[id];
      if (!source || source.kind !== "svg" || source.assetSet !== set || !Array.isArray(source.cells)) {
        return;
      }
      if (!source.cells.length) {
        delete source.cells;
      } else if (source.cells.indexOf(jamo) < 0) {
        source.cells.push(jamo);
      }
    });
  }

  function refusal(jamo, captured, error) {
    var reason = error || captured.refused;
    return { ok: false, design: design.json(), errors: [{ code: reason.code || "STUDIO_DETACH_FAILED", path: "cells." + jamo,
      message: reason.message || String(reason) }], impact: null, cancelled: false, jamo: jamo, cells: [], skipped: [], dropped: [],
      pinned: captured ? captured.pinning : [] };
  }

  function detachNow(jamo, options) {
    var opts = options || {};
    return captureNow(jamo, opts).then(function (captured) {
      if (captured.refused) {
        note("⚠ " + jamo + " — " + captured.refused.message, "warn");
        return refusal(jamo, captured);
      }
      var doc = draw.doc();
      var from = { set: doc.set, revision: Draw.cellsRevision(doc) };
      var at = new Date().toISOString();
      var cells = {};
      var keys = [];
      var skipped = [];
      var baseCell = null;
      try {
        captured.contexts.forEach(function (row) {
          if (!row.found || !row.pieces.length) {
            skipped.push({ context: row.context, key: row.key, reason: "not-found" });
            return;
          }
          if (!row.ownSet) {
            skipped.push({ context: row.context, key: row.key, reason: "other-source" });
            return;
          }
          if (!DETACHABLE[row.result]) {
            skipped.push({ context: row.context, key: row.key, reason: row.result || "none" });
            return;
          }
          var cell = Draw.detachFromCapture({ key: row.key, pieces: row.pieces, recipe: row.recipe, from: from }, { at: at });
          if (row.context === "") {
            baseCell = cell;
          } else if (baseCell && sameShape(baseCell, cell)) {
            skipped.push({ context: row.context, key: row.key, reason: "same-as-base" });
            return;
          }
          cells[row.key] = cell;
          keys.push(row.key);
        });
      } catch (error) {
        note("⚠ " + jamo + " — 떼어 내지 못했습니다: " + (error && error.message || error), "error");
        return refusal(jamo, captured, { code: "STUDIO_DETACH_FAILED", message: String(error && error.message || error) });
      }
      if (!keys.length) {
        note("⚠ " + jamo + " — 떼어 낼 조합 문맥이 없습니다", "warn");
        return refusal(jamo, captured, { code: "STUDIO_DETACH_NOT_COMPOSED", message: "no composed context to detach" });
      }
      var next = doc;
      keys.forEach(function (key) {
        next = Draw.setCell(next, key, cells[key]);
      });
      var drop = opts.dropComposeRule === true ? captured.pinning.slice() : [];
      var dropped = [];
      var label = jamo + " 독립 SVG로";
      var pinnedLeft = captured.pinning.filter(function (id) { return drop.indexOf(id) < 0; });
      var why = pinnedLeft.length ? " — 조합 규칙이 있어 독립 그림이 쓰이지 않음(" + pinnedLeft.join(", ") + ")" : "";
      return design.edit(label, function (draft) {
        dropped = dropCompose(draft, drop);
        showJamo(draft, next.set, jamo);
        return draft;
      }, { participants: { drawings: next },
        note: label + ": " + keys.join(" · ") + (dropped.length ? " · 조합 규칙 " + drop.join(", ") + " 지움" : "") + why,
        tone: why ? "warn" : undefined }).then(function (result) {
        if (result.ok) {
          note(jamo + "을(를) 독립 그림으로 떼어 냈습니다 — " + keys.map(function (key) {
            var context = key.slice(jamo.length);
            return key + (CONTEXT_TEXT[context] ? "(" + CONTEXT_TEXT[context] + ")" : "");
          }).join(" · ") + ". 위 원본을 고쳐도 따라가지 않습니다" + (dropped.length ? " · 조합 규칙 " + dropped.join(", ") + "의 조립 지정을 지웠습니다" : "") +
            why + ".", why ? "warn" : "info");
        }
        return Object.assign({}, result, { jamo: jamo, cells: result.ok ? keys : [], skipped: skipped, dropped: result.ok ? dropped : [],
          pinned: result.ok ? pinnedLeft : captured.pinning });
      });
    });
  }

  function detach(jamo, options) {
    return queue(function () { return detachNow(String(jamo || ""), options); });
  }

  // ── 화면 ──────────────────────────────────────────────────────────────

  function note(text, tone) {
    if (els.note) {
      els.note.textContent = text || "";
      els.note.dataset.tone = tone || "info";
    }
  }

  function target() {
    if (picked) {
      return picked;
    }
    var selection = draw.selection();
    return selection && selection.jamo ? selection.jamo : null;
  }

  function build() {
    if (built || !section) {
      return;
    }
    built = true;
    section.classList.add("studio-draw-detach");
    var head = make("div", "studio-draw-detach-head");
    head.appendChild(make("h4", "studio-draw-detach-title", "독립 SVG로 떼어 내기"));
    head.appendChild(make("p", "studio-draw-detach-hint",
      "조립식이 만든 자모를 조각마다 고칠 수 있는 그림으로 굳힙니다. 떼어 낸 뒤에는 위 원본(ㅋ의 ㄱ 등)을 고쳐도 따라가지 않습니다."));
    section.appendChild(head);
    els.status = make("p", "studio-draw-detach-status");
    els.status.dataset.drawDetachStatus = "";
    section.appendChild(els.status);
    var row = make("div", "studio-draw-detach-row");
    els.row = row;
    els.button = make("button", "studio-draw-detach-button");
    els.button.type = "button";
    els.button.dataset.drawDetach = "";
    els.button.hidden = true;
    row.appendChild(els.button);
    els.rule = make("label", "studio-draw-detach-rule");
    els.rule.dataset.drawDetachRule = "";
    els.rule.hidden = true;
    els.drop = make("input");
    els.drop.type = "checkbox";
    els.drop.checked = true;
    els.drop.dataset.drawDetachDrop = "";
    els.rule.appendChild(els.drop);
    els.ruleText = make("span", "", "");
    els.rule.appendChild(els.ruleText);
    row.appendChild(els.rule);
    section.appendChild(row);
    els.note = make("p", "studio-draw-detach-note");
    els.note.dataset.drawDetachNote = "";
    els.note.setAttribute("role", "status");
    section.appendChild(els.note);
    els.button.addEventListener("click", function () {
      var jamo = section.dataset.jamo;
      if (!jamo) {
        return;
      }
      els.button.disabled = true;
      detach(jamo, { dropComposeRule: !els.rule.hidden && els.drop.checked }).then(function (result) {
        els.button.disabled = false;
        if (result.ok) {
          draw.select(jamo, "");
        }
      }, function (error) {
        els.button.disabled = false;
        note("⚠ " + (error && error.message || error), "error");
      });
    });
  }

  function render() {
    renderTimer = null;
    if (!built || !life) {
      return;
    }
    life.work();
    var jamo = target();
    var info = inspect(jamo);
    section.dataset.jamo = jamo || "";
    section.dataset.status = info.status || "";
    section.dataset.code = info.code || "";
    var state = info.status ? STATUS_TEXT[info.status] || info.status : "";
    els.status.textContent = !jamo ? "그리기 칸이나 미리보기에서 자모를 고르세요." :
      jamo + " — " + (state ? "지금 " + state + (info.recipe ? "(" + info.recipe + ")" : "") : "") +
      (info.allowed ? " · 떼어 내면 조각마다 고칠 수 있습니다" : info.reason ? (state ? " · " : "") + info.reason : "");
    els.button.hidden = !info.allowed;
    els.button.textContent = (jamo || "") + " 독립 SVG로";
    els.rule.hidden = !(info.allowed && info.pinning.length);
    els.row.hidden = els.button.hidden && els.rule.hidden;
    els.ruleText.textContent = "조합 규칙 " + info.pinning.join(", ") + "의 조립 지정 지우기 — 조합 규칙이 있어 독립 그림이 쓰이지 않음";
  }

  function scheduleRender() {
    if (!renderTimer && built && life) {
      renderTimer = setTimeout(render, 0);
    }
  }

  function onShow(node) {
    section = section || node;
    build();
  }

  /* 깨어 있을 때만 그린다(그리기 탭이 보이고 디자인 페이지이고 본문이 펼쳐져 있을 때 — f-shell 수명, S1). 잠들면 밀린 그리기를 버리고,
   * 깨면 그사이 고른 자모로 다시 그린다 */
  function activate(ctx) {
    life = ctx;
    build();
    scheduleRender();
  }

  function deactivate() {
    life = null;
    clearTimeout(renderTimer);
    renderTimer = null;
  }

  /* 그리기 탭을 따르는 칸(탭 없음) — 그 탭이 보일 때만 보인다. 그리기가 붙기 전에는 아무것도 보이지 않는다 */
  section = Studio.f.mount("draw-detach", { label: "독립 SVG로", group: "draw", modes: ["svg"], onShow: onShow,
    activate: activate, deactivate: deactivate });

  draw.on("select", function (event) {
    picked = event && event.jamo ? event.jamo : null;
    scheduleRender();
  });
  draw.on("change", scheduleRender);
  design.on("change", scheduleRender);
  Studio.on("select", function (node) {
    var jamo = node ? compatOf(node) : null;
    if (jamo) {
      picked = jamo;
      scheduleRender();
    }
  });
  design.addBusy(function () {
    return pending > 0 || Boolean(renderTimer);
  });

  Studio.drawDetach = {
    /* 문맥마다 잡은 조각 → Promise<{ jamo, set, design, status, recipe, pinning, contexts: [{ context, key, text, found, result,
     * status, recipe, rules, source, ownSet, pieces }], refused }> */
    capture: capture,
    /* 독립 그림으로 → Promise<design.edit 결과 + { jamo, cells(넣은 칸 키), skipped, dropped(지운 조합 규칙), pinned(남은 조합 규칙) }>.
     * options: { contexts([""|"@bar"|"@jong"] 중), dropComposeRule } */
    detach: detach,
    inspect: function (jamo) { return inspect(jamo === undefined ? target() : jamo); },
    target: target,
    busy: function () { return pending > 0 || Boolean(renderTimer); }
  };
})();
