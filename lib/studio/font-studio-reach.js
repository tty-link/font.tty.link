/* font-studio-reach.js — 편집이 닿는 현대 한글 수(PLAN-STUDIO-002 S4 '바뀔 곳 미리 보이기')
 *
 * 범위에 마우스를 올리거나 끄는 동안 "미리보기 n곳 · 현대 한글 n자"를 보인다. 미리보기 수는 작업실이 미리보기 노드로 센다. 이 파일은
 * 현대 한글 11,172자 모두의 뼈대(자모 노드의 자리·짜임·도장)를 화면 밖 문서(inert document)에 한 번 지어 두고, 편집 대상 규칙의
 * 선택자가 닿는 음절을 센다.
 * - 뼈대는 런타임이 그리는 길과 같은 자료로 짓는다: FontKku.createTextModel(나누기·머리 음절·짜임), FontKku.placementTables(자리 —
 *   모음 쪽은 모음 나누기, 받침 쪽은 받침 나누기 표에서), 렌더러의 부분 이름(renderHangulGlyph와 같은 part·data-* — 시험
 *   tests/test_studio_s4_ui.py가 실제 그린 DOM과 맞는지 본다). 재료(원소·그림·기기 글꼴 맞춤)는 짓지 않는다 — 셈에 쓰이지 않는다.
 * - 바탕 요소의 속성(data-fy-font·data-fy-layout 등)은 셀 때마다 미리보기 바탕 요소에서 베낀다. 그래서 짓는 방식·글꼴 모양을 바꿔도
 *   뼈대는 나누기(모음·받침)가 바뀔 때만 다시 짓는다.
 * - 바탕 요소 규칙(자리 전체·자리 가족)은 그 자리 변수를 쓰는 자리의 자모 노드로 센다. 작업실이 글꼴 CSS 모형(doc)을 주면 더 가까운
 *   자리 값이나 바탕 요소 아래 규칙이 정하는 자모는 뺀다(S5-B — 미리보기 수와 같은 판정).
 * - 짓기는 나눠서 한다(한 번에 SLICE자, 쉬는 틈마다) — 작업실이 멈추지 않는다. 처음 한 번 수백 ms, 그 뒤 셈은 선택자 하나에 수 ms.
 * 창구: FontStudio.reach — count(plans, host, { doc }?) → Promise<{ total, ms }>, countNow(plans, host, { doc }?) → { total } | null(아직 짓는 중),
 *   warm(host) → Promise, stats() → { built, depth, buildMs, elements }
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  if (!Studio || !window.FontKku || typeof FontKku.createTextModel !== "function" || !FontKku.placementTables) {
    return;
  }

  var FIRST = 0xAC00;
  var COUNT = 11172;
  var SLICE = 1200;
  var SIDE_TABLE = { split: "atomic", whole: "composite", syllable: "syllable" };
  var RENDER_ROLES = { head: "head", choseong: "choseong", jungMain: "jung-main", jungBase: "jung-base", jungTail: "jung-tail",
    jungCluster: "jung-cluster", jongMain: "jong-main", jongLeft: "jong-left", jongRight: "jong-right", jongCluster: "jong-cluster" };

  var inert = document.implementation.createHTMLDocument("font-studio-reach");
  var skeleton = null; // { key, host, root, glyphs, done, promise, buildMs, elements }

  function depthOf(host) {
    var vowel = host && host.getAttribute("data-fy-vowel-depth");
    var coda = host && host.getAttribute("data-fy-coda-depth");
    return { vowel: vowel === "whole" || vowel === "syllable" ? vowel : "split", coda: coda === "whole" ? "whole" : "split" };
  }

  function keyOf(depth) {
    return depth.vowel + "/" + depth.coda;
  }

  /* 나누기 한 쌍의 자리 표 — 모음 쪽(head·choseong·jungseong)은 모음 나누기, 받침 쪽(jongseong)은 받침 나누기에서 */
  function placementFor(depth) {
    var tables = FontKku.placementTables;
    var vowelSide = tables[SIDE_TABLE[depth.vowel]] || tables.atomic;
    var codaSide = tables[SIDE_TABLE[depth.coda]] || tables.atomic;
    var out = {};
    Object.keys(vowelSide).forEach(function (key) {
      var row = vowelSide[key];
      out[key] = { head: row.head || [], choseong: row.choseong || [], jungseong: row.jungseong || [],
        jongseong: (codaSide[key] && codaSide[key].jongseong) || [] };
    });
    return out;
  }

  function span(part) {
    var node = inert.createElement("span");
    node.setAttribute("part", part);
    return node;
  }

  function frame(node, topology, role) {
    var jung = topology.jungLayout;
    node.setAttribute("data-fy-axis", jung === "split-right" ? "split" : (jung || "default"));
    node.setAttribute("data-fy-open", topology.jongLayout === "none" ? "open" : "closed");
    node.setAttribute("data-fy-jong-count", topology.jongLayout || "none");
    if (role) {
      node.setAttribute("data-fy-role", role);
    }
    return node;
  }

  function layoutAttrs(node, topology) {
    node.setAttribute("data-jung-layout", topology.jungLayout);
    node.setAttribute("data-jong-layout", topology.jongLayout);
    node.setAttribute("data-layout-key", topology.placementKey);
    node.setAttribute("data-fy-layout-bucket", topology.layoutBucket || "default");
  }

  function jamoNode(part, value, role, pos, topology, semantic) {
    var node = span(part);
    node.setAttribute("data-jamo", value);
    node.setAttribute("data-jamo-role", role);
    if (pos) {
      node.setAttribute("data-fy-pos", pos);
    }
    return frame(node, topology, semantic);
  }

  function cluster(part, role, topology, semantic) {
    var node = span("cluster " + part);
    node.setAttribute("data-jamo-role", role + "-cluster");
    node.setAttribute("data-layout-key", topology.placementKey);
    node.setAttribute("data-fy-layout-bucket", topology.layoutBucket || "default");
    return frame(node, topology, semantic);
  }

  /* 렌더러의 renderHangulGlyph와 같은 꼴(재료·스프라이트 도장 없이) */
  function glyphNode(glyph, places) {
    var topology = glyph.topology;
    var plan = places[topology.placementKey];
    var display = glyph.display;
    var node = span("glyph");
    node.setAttribute("data-glyph-kind", glyph.kind);
    node.setAttribute("data-hangul", "true");
    node.setAttribute("data-source", glyph.source);
    layoutAttrs(node, topology);
    frame(node, topology);
    var body = span("glyph-body");
    layoutAttrs(body, topology);
    frame(body, topology);
    (display.head || []).forEach(function (value, index) {
      var child = jamoNode("jamo head", value, "head", plan.head[index], topology, RENDER_ROLES.head);
      if (display.headBase) {
        child.setAttribute("data-jamo-base", display.headBase);
      }
      body.appendChild(child);
    });
    (display.choseong || []).forEach(function (value, index) {
      body.appendChild(jamoNode("jamo choseong", value, "choseong", plan.choseong[index], topology, RENDER_ROLES.choseong));
    });
    var jung = display.jungseong || [];
    if (jung.length > 1) {
      var jungCluster = cluster("jungseong-cluster", "jungseong", topology, RENDER_ROLES.jungCluster);
      jung.forEach(function (value, index) {
        jungCluster.appendChild(jamoNode(index === 0 ? "jamo jungseong jungseong-base" : "jamo jungseong jungseong-tail", value, "jungseong",
          plan.jungseong[index], topology, index === 0 ? RENDER_ROLES.jungBase : RENDER_ROLES.jungTail));
      });
      body.appendChild(jungCluster);
    } else {
      var hasHead = (display.head || []).length > 0;
      jung.forEach(function (value, index) {
        body.appendChild(jamoNode(hasHead ? "jamo jungseong jungseong-tail" : "jamo jungseong", value, "jungseong", plan.jungseong[index],
          topology, hasHead ? RENDER_ROLES.jungTail : RENDER_ROLES.jungMain));
      });
    }
    var jong = display.jongseong || [];
    if (jong.length > 1) {
      var jongCluster = cluster("jongseong-cluster", "jongseong", topology, RENDER_ROLES.jongCluster);
      jong.forEach(function (value, index) {
        jongCluster.appendChild(jamoNode(index === 0 ? "jamo jongseong jongseong-left" : "jamo jongseong jongseong-right", value, "jongseong",
          plan.jongseong[index], topology, index === 0 ? RENDER_ROLES.jongLeft : RENDER_ROLES.jongRight));
      });
      body.appendChild(jongCluster);
    } else {
      jong.forEach(function (value, index) {
        body.appendChild(jamoNode("jamo jongseong", value, "jongseong", plan.jongseong[index], topology, RENDER_ROLES.jongMain));
      });
    }
    node.appendChild(body);
    /* 글자 칸의 문맥 표면(런타임 stampGlyphContext와 같다) — 글꼴 CSS의 이웃 자모 조건이 이것으로 고른다 */
    var jamos = [];
    ["head", "choseong", "jungseong", "jongseong"].forEach(function (role) {
      (display[role] || []).forEach(function (value, index) {
        node.setAttribute("data-fy-at-" + plan[role][index], value);
        jamos.push(value);
      });
    });
    node.setAttribute("data-fy-jamos", jamos.join(" "));
    return node;
  }

  function modelGlyphs(depth) {
    var text = "";
    for (var code = 0; code < COUNT; code += 1) {
      text += String.fromCharCode(FIRST + code);
    }
    var model = FontKku.createTextModel(text, { vowel: depth.vowel, coda: depth.coda });
    var out = [];
    (function walk(node) {
      if (node.type === "glyph") {
        out.push(node);
        return;
      }
      (node.children || node.lines || []).forEach(walk);
    })({ children: model.lines });
    return out;
  }

  function later(fn) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: 60 });
    } else {
      setTimeout(fn, 0);
    }
  }

  /* 뼈대를 (다시) 짓는다 — 나누기 한 쌍마다 하나. 나눠 지어 끝나면 promise가 풀린다 */
  function build(depth) {
    var key = keyOf(depth);
    if (skeleton && skeleton.key === key) {
      return skeleton;
    }
    var started = performance.now();
    var host = inert.createElement("span");
    var root = span("root");
    root.setAttribute("data-fy-root", "true");
    host.appendChild(root);
    var entry = { key: key, depth: depth, host: host, root: root, glyphs: [], done: false, promise: null, buildMs: 0, elements: 0 };
    skeleton = entry;
    var glyphs = modelGlyphs(depth);
    var places = placementFor(depth);
    var index = 0;
    entry.promise = new Promise(function (resolve) {
      function step() {
        if (skeleton !== entry) {
          resolve(entry);
          return;
        }
        var stop = Math.min(glyphs.length, index + SLICE);
        var fragment = inert.createDocumentFragment();
        for (; index < stop; index += 1) {
          var node = glyphNode(glyphs[index], places);
          entry.glyphs.push(node);
          fragment.appendChild(node);
        }
        root.appendChild(fragment);
        if (index < glyphs.length) {
          later(step);
          return;
        }
        entry.done = true;
        entry.buildMs = Math.round(performance.now() - started);
        entry.elements = host.getElementsByTagName("*").length;
        resolve(entry);
      }
      step();
    });
    return entry;
  }

  /* 미리보기 바탕 요소의 속성을 뼈대 바탕 요소에 — 선택자의 글꼴 범위(:where([data-fy-font=…][data-fy-layout=…]))가 같게 */
  function copyHost(entry, live) {
    var target = entry.host;
    Array.prototype.slice.call(target.attributes).forEach(function (attribute) {
      if (!live.hasAttribute(attribute.name)) {
        target.removeAttribute(attribute.name);
      }
    });
    Array.prototype.forEach.call(live.attributes, function (attribute) {
      if (attribute.name !== "style" && target.getAttribute(attribute.name) !== attribute.value) {
        target.setAttribute(attribute.name, attribute.value);
      }
    });
  }

  function safeAll(scope, selector) {
    try {
      return scope.querySelectorAll(selector);
    } catch (error) {
      return null;
    }
  }

  function safeMatches(element, selector) {
    try {
      return element.matches(selector);
    } catch (error) {
      return false;
    }
  }

  // ── 가려진 글자 빼기(S5-B) ─────────────────────────────────────────────
  /* 바탕 요소 규칙(이 자리 모두·자리 가족)으로 고쳐도 더 가까운 자리 값(--fy-<더 좁은 자리>-*)이나 바탕 요소 아래 규칙(자모·문맥 규칙의
   * 같은 변수)이 정하는 자모는 바뀌지 않는다 — 미리보기 수(작업실 nodesAffectedBy)와 같은 판정을 뼈대에 한다. 글꼴 CSS 규칙 중 그
   * 변수를 적는 것만 골라 선택자마다 한 번 뼈대에서 찾고(querySelectorAll), 자모마다 자기와 조상(바탕 요소 아래)의 표를 본다.
   * 조건(@media·@supports)은 작업실 해석기와 같은 셈 — 거짓이면 뺀다(모르면 있는 셈). 결과는 글꼴 CSS·변수·나누기·바탕 속성마다 둔다 */
  var maskCache = typeof WeakMap === "function" ? new WeakMap() : null;

  function conditionFalse(rule) {
    return (rule.conditions || []).some(function (condition) {
      try {
        if (condition.type === "media" && typeof window.matchMedia === "function") {
          return !window.matchMedia(condition.text || "all").matches;
        }
        if (condition.type === "supports" && window.CSS && typeof window.CSS.supports === "function") {
          return !window.CSS.supports(condition.text);
        }
      } catch (error) {
        return false;
      }
      return condition.type === "starting-style";
    });
  }

  function hostSignature(host) {
    return Array.prototype.map.call(host.attributes, function (attribute) {
      return attribute.name === "style" ? "" : attribute.name + "=" + attribute.value;
    }).join("|");
  }

  /* 뼈대의 자리별 자모 노드와 그 글자 — 처음 셀 때 한 번(바탕 요소 규칙 셈이 자리마다 묶음으로 본다) */
  function slotIndex(entry) {
    if (!entry.byPos) {
      var byPos = {};
      Array.prototype.forEach.call(entry.root.querySelectorAll('[part~="jamo"][data-fy-pos]'), function (node) {
        var pos = node.getAttribute("data-fy-pos");
        var list = byPos[pos] || (byPos[pos] = { nodes: [], glyphs: [] });
        list.nodes.push(node);
        list.glyphs.push(node.closest('[part="glyph"]'));
      });
      entry.byPos = byPos;
    }
    return entry.byPos;
  }

  /* 바탕 요소 규칙 plan(자리 slot, 속성 key)이 바꾸는 글자들(겹칠 수 있음) — doc을 주면 더 가까운 자리 값·바탕 요소 아래 규칙이
   * 정하는 자모는 뺀다. 글꼴 CSS(doc)·변수·바탕 속성마다 둔다(뼈대는 나누기마다 따로) */
  function hostReach(entry, plan, doc, slot, key, slotChain) {
    var cacheKey = plan.variable + "\n" + hostSignature(entry.host);
    var store = null;
    if (doc && maskCache) {
      store = maskCache.get(doc);
      if (!store) {
        store = new Map();
        maskCache.set(doc, store);
      }
      cacheKey = entry.key + "\n" + cacheKey;
    } else if (!doc) {
      store = entry.plainCache || (entry.plainCache = new Map());
    }
    if (store && store.has(cacheKey)) {
      return store.get(cacheKey);
    }
    var byPos = slotIndex(entry);
    var positions = Object.keys(byPos).filter(function (pos) { return slotChain(pos).indexOf(slot) >= 0; });
    var out = [];
    var rules = doc && Array.isArray(doc.rules) ? doc.rules : null;
    if (!rules) {
      positions.forEach(function (pos) { Array.prototype.push.apply(out, byPos[pos].glyphs); });
    } else {
      /* 자리마다 더 가까운 자리 변수 */
      var closerOf = {};
      var wanted = {};
      wanted[plan.variable] = true;
      positions.forEach(function (pos) {
        var chain = slotChain(pos);
        var at = chain.indexOf(slot);
        closerOf[pos] = chain.slice(0, at < 0 ? 0 : at).map(function (name) { return "--fy-" + name + "-" + key; });
        closerOf[pos].forEach(function (name) { wanted[name] = true; });
      });
      var hostVars = {};
      var below = new Map(); // 바탕 요소 아래 요소 → { 변수: true }
      rules.forEach(function (rule) {
        if (!rule || rule.invalid || !Array.isArray(rule.declarations) || conditionFalse(rule)) {
          return;
        }
        var names = rule.declarations.filter(function (declaration) {
          return declaration && !declaration.invalid && wanted[declaration.name];
        }).map(function (declaration) { return declaration.name; });
        if (!names.length) {
          return;
        }
        var selector = rule.effectiveSelector || rule.selector;
        if (safeMatches(entry.host, selector)) {
          names.forEach(function (name) { hostVars[name] = true; });
        }
        Array.prototype.forEach.call(safeAll(entry.host, selector) || [], function (element) {
          var table = below.get(element);
          if (!table) {
            table = {};
            below.set(element, table);
          }
          names.forEach(function (name) { table[name] = true; });
        });
      });
      positions.forEach(function (pos) {
        var closer = closerOf[pos];
        if (closer.some(function (name) { return hostVars[name]; })) {
          return; // 이 자리 자모는 모두 더 가까운 자리 값을 받는다
        }
        var list = byPos[pos];
        if (!below.size) {
          Array.prototype.push.apply(out, list.glyphs);
          return;
        }
        list.nodes.forEach(function (node, index) {
          for (var element = node; element && element !== entry.host; element = element.parentElement) {
            var table = below.get(element);
            if (table && (table[plan.variable] || closer.some(function (name) { return table[name]; }))) {
              return; // 바탕 요소 아래 규칙이 정한다
            }
          }
          out.push(list.glyphs[index]);
        });
      });
    }
    if (store) {
      store.set(cacheKey, out);
    }
    return out;
  }

  /* 한 규칙(plan)이 닿는 음절 차례를 seen에 — 바탕 요소 규칙은 그 자리 변수가 닿는 자리(더 좁은 규칙이 정하는 자모는 빼고 — doc을
   * 주면), 노드 규칙은 선택자 */
  function mark(entry, plan, seen, slotChain, doc) {
    if (!plan || !plan.selector) {
      return;
    }
    var nodes;
    if (safeMatches(entry.host, plan.selector)) {
      var match = /^--fy-([a-z0-9]+)-(.+)$/.exec(plan.variable || "");
      var slot = match ? match[1] : null;
      if (!slot) {
        return;
      }
      hostReach(entry, plan, doc, slot, match[2], slotChain).forEach(function (glyph) {
        if (glyph) {
          seen.add(glyph);
        }
      });
      return;
    } else {
      nodes = safeAll(entry.root, plan.selector);
      if (!nodes) {
        return;
      }
    }
    Array.prototype.forEach.call(nodes, function (node) {
      var glyph = node.closest('[part="glyph"]');
      if (glyph) {
        seen.add(glyph);
      }
    });
  }

  var lastQuery = null; // 시험: 마지막 셈 { plans, live, doc } — 어느 음절을 셌는지 explainLast로 다시 본다

  function tally(entry, plans, live, slotChain, doc) {
    return tallySet(entry, plans, live, slotChain, doc).size;
  }

  function tallySet(entry, plans, live, slotChain, doc) {
    lastQuery = { plans: plans, live: live, doc: doc };
    copyHost(entry, live);
    var seen = new Set();
    var keys = {};
    (plans || []).forEach(function (plan) {
      if (!plan) {
        return;
      }
      var key = plan.selector + "\n" + plan.variable;
      if (!keys[key]) {
        keys[key] = true;
        mark(entry, plan, seen, slotChain, doc);
      }
    });
    return seen;
  }

  var chainOf = function (pos) { return [pos]; };

  Studio.reach = {
    /* 작업실이 자리 사슬(--fy-<자리>-* → 부모 자리)을 알려 준다 */
    setSlotChain: function (fn) {
      if (typeof fn === "function") {
        chainOf = fn;
      }
    },
    warm: function (live) {
      return live ? build(depthOf(live)).promise : Promise.resolve(null);
    },
    /* 지금 셀 수 있으면 { total }, 뼈대를 짓는 중이면 null. options.doc(작업실의 글꼴 CSS 모형)을 주면 바탕 요소 규칙에서 더 좁은
     * 규칙이 정하는 자모를 뺀다(S5-B) */
    countNow: function (plans, live, options) {
      if (!live) {
        return null;
      }
      var entry = build(depthOf(live));
      if (!entry.done) {
        return null;
      }
      return { total: tally(entry, plans, live, chainOf, options && options.doc) };
    },
    count: function (plans, live, options) {
      if (!live) {
        return Promise.resolve({ total: null, ms: 0 });
      }
      var entry = build(depthOf(live));
      return entry.promise.then(function (ready) {
        if (ready !== skeleton) {
          return Studio.reach.count(plans, live, options);
        }
        var started = performance.now();
        var total = tally(ready, plans, live, chainOf, options && options.doc);
        return { total: total, ms: Math.round((performance.now() - started) * 10) / 10 };
      });
    },
    stats: function () {
      return skeleton ? { built: skeleton.done, depth: skeleton.key, buildMs: skeleton.buildMs, elements: skeleton.elements,
        glyphs: skeleton.glyphs.length } : { built: false, depth: null, buildMs: 0, elements: 0, glyphs: 0 };
    },
    /* 시험: 마지막 셈이 센 음절(글자들, 차례대로) — 미리보기 수와 같은 판정인지 견준다. 뼈대가 없으면 null */
    explainLast: function () {
      if (!lastQuery || !skeleton || !skeleton.done) {
        return null;
      }
      var seen = tallySet(skeleton, lastQuery.plans, lastQuery.live, chainOf, lastQuery.doc);
      return skeleton.glyphs.filter(function (glyph) { return seen.has(glyph); }).map(function (glyph) { return glyph.getAttribute("data-source"); });
    },
    /* 시험: 뼈대의 한 음절(차례·글자) — 실제 그린 DOM과 견준다 */
    skeletonOf: function (source, live) {
      var entry = skeleton;
      if (!entry || !entry.done || (live && entry.key !== keyOf(depthOf(live)))) {
        return null;
      }
      var code = source.charCodeAt(0) - FIRST;
      return code >= 0 && code < COUNT ? entry.glyphs[code] : null;
    }
  };
})();
