/* font-studio-provenance.js — 살펴보기 출처 패널 (설계 v1.2 §13.5, PLAN-HANGUL-001 F2)
 *
 * 살펴보기(aside)의 [data-studio-f=provenance] 칸에 고른 자모의 다섯 질문 답을 보인다 — 무엇인가(직접·조합·대체), 어디서 왔나
 * (출처 확인), 어느 규칙이 이겼나(무시한 것과 까닭), 상위 원본을 따라가나, 획 편집·필기 애니메이션·독립 벡터가 되나.
 * 답은 FontStudioProvenanceModel.answer가 낸다: traceOf 기록, 그 기록을 낸 디자인 JSON(지금 디자인일 때만), 그림 문서 참가자
 * (drawings), 노드의 획([part=hoek])·글꼴 조각 잎([part=leaf]).
 * FontStudio.design.renderTrace를 바꿔 끼워 기본 출처 한 줄([data-design-trace], "출처: …")은 그대로 두고 칸을 그린다. 칸은 처음
 * 자모를 고를 때 붙인다(맨 작업실 첫 화면은 그대로). 접힌 한 줄(무엇 · 어디서)이 기본이고 펼치면 다섯 답 — 펼친 칸이 살펴보기의
 * 편집 범위·속성 칸을 화면 밖으로 밀지 않게(펼침은 보는 사람마다 기억). 디자인이 바뀌거나(change) 미리보기를 런타임이 다시
 * 그리면(font-kku:render — 그림 세트가 늦게 실린 때) 고른 자모로 다시 답한다. FontStudio.provenance = { answers(), refresh(), check(), open() }.
 */
(function () {
  "use strict";

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)

  var Studio = window.FontStudio;
  var Model = window.FontStudioProvenanceModel;
  var Design = window.FontStudioDesign;
  var FontKku = window.FontKku;
  if (!Studio || !Model || !FontKku || !Studio.design || !Studio.f || typeof FontKku.traceOf !== "function") {
    return;
  }

  var design = Studio.design;
  var host = Studio.host;
  /* font-kku.js traceOf가 기록을 읽는 노드(DRAWN_NODES) */
  var DRAWN = '[part~="jamo"], [part="content"][data-fy-standalone]';
  var QUESTIONS = [
    { id: "kind", label: "직접·조합·대체" },
    { id: "origin", label: "가져온 곳" },
    { id: "rule", label: "고른 규칙" },
    { id: "follow", label: "상위 원본" },
    { id: "capability", label: "할 수 있는 일" }
  ];
  var BUILTIN = Design && Array.isArray(Design.SVG_SETS) ? Design.SVG_SETS.map(function (entry) { return entry.id; }) : Model.BUILTIN_SETS;
  var OPEN_KEY = "font-kku-studio-provenance-open";
  var panel = null;
  var waiting = false;
  var timer = null;
  /* 깨어 있는 동안의 수명 맥락 — 살펴보기 칸이 보이는 페이지(디자인·고치기)에서만 출처를 그린다(S1). 잠든 동안 고른 자모는
   * 깨면 따라잡는다 */
  var life = null;
  var opened = readOpen();

  /* 펼침 기억은 보는 사람의 편의 — 저장소가 막혀도 접힌 채로 돈다 */
  function readOpen() {
    return Util.readFlag(OPEN_KEY);
  }

  function writeOpen(value) {
    opened = Boolean(value);
    Util.writeFlag(OPEN_KEY, opened);
  }

  function jamoOf(node) {
    return node.getAttribute("data-jamo") || node.getAttribute("data-fy-standalone");
  }

  function roleOf(node) {
    return node.getAttribute("data-fy-role") || (node.hasAttribute("data-fy-standalone") ? "standalone" : null);
  }

  /* 기록 노드 ↔ DOM 노드: traceOf는 그린 노드를 문서 차례로 담는다(기록이 없는 노드는 건너뛴다) — 차례대로 맞추고, 어긋나면
   * 자리·자모가 같은 첫 노드 */
  function traceFor(node, trace) {
    if (!trace || !Array.isArray(trace.nodes) || !trace.nodes.length) {
      return null;
    }
    var nodes = host.querySelectorAll(DRAWN);
    var at = 0;
    for (var index = 0; index < nodes.length && at < trace.nodes.length; index += 1) {
      var entry = trace.nodes[at];
      var same = entry.jamo === jamoOf(nodes[index]) && (entry.pos || null) === nodes[index].getAttribute("data-fy-pos") &&
        entry.role === roleOf(nodes[index]);
      if (same) {
        if (nodes[index] === node) {
          return entry;
        }
        at += 1;
      } else if (nodes[index] === node) {
        break;
      }
    }
    return trace.nodes.filter(function (entry) {
      return entry.pos === node.getAttribute("data-fy-pos") && entry.jamo === jamoOf(node);
    })[0] || null;
  }

  function nodeInfo(node) {
    var glyph = node.closest('[part~="glyph"]');
    return {
      jamo: jamoOf(node),
      roleAttr: roleOf(node),
      pos: node.getAttribute("data-fy-pos"),
      layoutKey: glyph ? glyph.getAttribute("data-layout-key") || "" : "",
      syllable: glyph ? glyph.getAttribute("data-source") || "" : "",
      sprite: node.hasAttribute("data-sprite-jamo-kind") || Boolean(node.querySelector("[data-sprite-jamo-kind]"))
    };
  }

  function hoeksOf(node) {
    return Array.prototype.map.call(node.querySelectorAll(':scope > [part="hoek"]'), function (hoek) {
      var element = hoek.querySelector('[part="element"]');
      var order = hoek.getAttribute("data-hoek");
      return {
        drawing: hoek.getAttribute("data-hoek-drawing"),
        strokeIndex: order === null ? null : Number(order) - 1,
        element: element ? element.getAttribute("data-element") : null,
        alias: element ? element.getAttribute("data-element-drawing") : null
      };
    });
  }

  function leavesOf(node) {
    /* 잘라 그린 문자 잎(data-fy-glyph-slice)은 조각 하나를 여러 잎으로 그린다 — 첫 잎만 센다 */
    return Array.prototype.filter.call(node.querySelectorAll(':scope > [part="leaf"]'), function (leaf) {
      var slice = leaf.getAttribute("data-fy-glyph-slice");
      return !slice || slice === "0";
    }).map(function (leaf) {
      return { path: leaf.getAttribute("data-leaf-path") || "", source: leaf.getAttribute("data-leaf-source") || "", glyph: leaf.textContent };
    });
  }

  /* 모델 입력 — 디자인 JSON은 그 기록을 낸 이름이 지금 디자인일 때만(묶음 편집이 임시 이름을 미리보기 중이면 규칙을 풀지 않는다) */
  function inputs(node, trace) {
    var drawnName = trace && trace.design;
    var current = drawnName && drawnName === design.name() ? design.json() : null;
    var participants = design.participants();
    var match = traceFor(node, trace);
    return {
      node: nodeInfo(node),
      entries: match ? match.requests : [],
      design: current,
      drawings: participants.drawings || null,
      hoeks: hoeksOf(node),
      leaves: leavesOf(node),
      applied: Boolean(design.state && design.state.applied),
      face: host.dataset.fyFace || "",
      designStatus: host.dataset.fyDesignStatus || (trace && trace.designStatus) || "",
      designNote: drawnName && !current ? "미리보기 중인 임시 디자인 " + drawnName + " — 규칙 풀이는 편집을 마친 뒤에" : "",
      builtinSets: BUILTIN
    };
  }

  function mount() {
    if (!panel) {
      panel = Studio.f.mount("provenance", { label: "출처", activate: activate, deactivate: deactivate });
    }
    return panel;
  }

  function activate(ctx) {
    life = ctx;
    panel = panel || ctx.section; // 처음 붙이는 mount() 안에서 깬다 — 돌려받기 전이다
    ctx.listen(design, "change", refreshSoon);
    ctx.listen(host, "font-kku:render", refreshSoon);
    refreshSoon(); // 잠든 동안 고른 자모·바뀐 디자인을 따라잡는다
  }

  function deactivate() {
    life = null;
    clearTimeout(timer);
    timer = null;
    waiting = false;
  }

  function setData(element, values) {
    Object.keys(values).forEach(function (key) {
      var value = values[key];
      if (value === null || value === undefined || value === "") {
        delete element.dataset[key];
      } else {
        element.dataset[key] = Array.isArray(value) ? value.join(" ") : String(value);
      }
    });
  }

  function draw(node, answers) {
    var root = mount();
    /* 다시 그리기 전에 지금 펼침을 읽는다 — toggle 사건은 늦게 오고, 그 사이 칸을 다시 그리면 오지 않는다 */
    var previous = root.querySelector("[data-provenance-fold]");
    if (previous && previous.open !== opened) {
      writeOpen(previous.open);
    }
    var focused = Boolean(previous) && previous.querySelector("summary") === document.activeElement;
    root.textContent = "";
    root.dataset.provenanceState = "answered";
    var fold = document.createElement("details");
    fold.className = "studio-provenance-fold";
    fold.dataset.provenanceFold = "";
    fold.open = opened;
    fold.addEventListener("toggle", function () { writeOpen(fold.open); });
    var summary = document.createElement("summary");
    summary.className = "studio-provenance-summary";
    var title = document.createElement("span");
    title.className = "studio-provenance-title";
    title.textContent = "출처 다섯 질문";
    var brief = document.createElement("span");
    brief.className = "studio-provenance-brief";
    brief.textContent = (jamoOf(node) || "") + " · " + answers.kind.text + " · " + answers.origin.code;
    summary.appendChild(title);
    summary.appendChild(brief);
    var list = document.createElement("dl");
    list.className = "studio-provenance";
    list.dataset.provenance = "";
    QUESTIONS.forEach(function (question) {
      var answer = answers[question.id];
      var item = document.createElement("div");
      item.className = "studio-provenance-item";
      item.dataset.provenanceQ = question.id;
      item.dataset.code = answer.code;
      var term = document.createElement("dt");
      term.textContent = question.label;
      var body = document.createElement("dd");
      var code = document.createElement("code");
      code.className = "studio-provenance-code";
      code.textContent = answer.code;
      var text = document.createElement("span");
      text.className = "studio-provenance-text";
      text.textContent = answer.text;
      body.appendChild(code);
      body.appendChild(text);
      if (answer.detail) {
        var small = document.createElement("small");
        small.textContent = answer.detail;
        body.appendChild(small);
      }
      item.appendChild(term);
      item.appendChild(body);
      list.appendChild(item);
    });
    var by = function (id) { return list.querySelector('[data-provenance-q="' + id + '"]'); };
    setData(by("kind"), { recipe: answers.kind.recipe });
    setData(by("origin"), { source: answers.origin.source, sources: answers.origin.sources, drawing: answers.origin.drawing,
      effectiveSource: answers.origin.effectiveSource });
    setData(by("rule"), { winner: answers.rule.winner, ignored: answers.rule.ignored, unmatched: answers.rule.unmatched,
      winnerSource: answers.rule.winners ? answers.rule.winners.source : "", winnerBundle: answers.rule.winners ? answers.rule.winners.bundle : "" });
    setData(by("follow"), { upstream: answers.follow.upstream, formerly: answers.follow.formerly });
    setData(by("capability"), { stroke: answers.capability.stroke, animation: answers.capability.animation, vector: answers.capability.vector });
    fold.appendChild(summary);
    fold.appendChild(list);
    /* 쉬운 모드(S3)는 한국어 한 줄만 — 다섯 질문(코드·소스 id)은 정밀 모드에서 */
    fold.setAttribute("data-studio-precise", "");
    var easy = document.createElement("p");
    easy.className = "studio-provenance-line";
    easy.dataset.provenanceLine = "";
    easy.setAttribute("data-studio-easy", "");
    easy.textContent = (jamoOf(node) ? jamoOf(node) + " — " : "") + answers.kind.text + " · " + easyOrigin(answers.origin);
    root.appendChild(easy);
    root.appendChild(fold);
    if (focused) {
      summary.focus(); // 키보드로 펼친 채 다시 그려도 초점을 잃지 않게
    }
  }

  /* 쉬운 모드의 '어디서' — 소스 id·세트 이름 없이(S3 화면 말: 개발 식별자 0) */
  var EASY_ORIGIN = {
    "svg-authored": "작업실에서 그린 그림", "svg-detached": "떼어 낸 독립 그림", "svg-builtin": "기본 제공 그림 세트",
    "svg-set": "등록된 그림 세트", primitive: "선·점·원", "sprite-cell": "자소판 칸", "device-glyph": "기기 글꼴 낱자",
    "font-css": "글꼴 CSS", "font-unverified": "기기·웹 글꼴", "font-fallback-suspected": "기기·웹 글꼴(⚠ 대체 글꼴일 수 있음)",
    none: "그린 것 없음"
  };

  function easyOrigin(origin) {
    var text = origin && EASY_ORIGIN[origin.code];
    if (text && origin.glyphs && origin.glyphs.length) {
      text += " · " + origin.glyphs.map(function (glyph) { return glyph.jamo + " → " + glyph.text; }).join(" · ");
    }
    return text || "출처를 알 수 없음";
  }

  function clear() {
    if (panel) {
      panel.textContent = "";
      panel.dataset.provenanceState = "empty";
    }
  }

  function render(node, trace) {
    if (!node || !node.isConnected) {
      clear();
      return null;
    }
    var answers = Model.answer(inputs(node, trace === undefined ? FontKku.traceOf(host) : trace));
    draw(node, answers);
    return answers;
  }

  /* 고른 자모로 다시(기본 출처 한 줄도) — 런타임이 스스로 다시 그린 뒤에는 Studio가 select를 다시 알리지 않는다 */
  function refresh() {
    waiting = false;
    timer = null;
    if (life) {
      life.work();
    }
    var node = Studio.selected();
    if (!node) {
      clear();
      return null;
    }
    var trace = FontKku.traceOf(host);
    base(node, trace);
    return render(node, trace);
  }

  function refreshSoon() {
    if (!waiting && panel && life) {
      waiting = true;
      timer = setTimeout(refresh, 0);
    }
  }

  /* 미리보기의 모든 노드에서 되짚은 이긴 규칙이 기록과 같은가 — 다르면 [{ jamo, pos, path, traced, explained }] */
  function check() {
    var trace = FontKku.traceOf(host);
    var drawnName = trace && trace.design;
    var current = drawnName && drawnName === design.name() ? design.json() : null;
    if (!current) {
      return [];
    }
    var out = [];
    Array.prototype.forEach.call(host.querySelectorAll(DRAWN), function (node) {
      var match = traceFor(node, trace);
      if (match) {
        Model.mismatches(nodeInfo(node), match.requests, current).forEach(function (miss) {
          miss.pos = node.getAttribute("data-fy-pos");
          miss.node = jamoOf(node);
          out.push(miss);
        });
      }
    });
    return out;
  }

  var base = design.renderTrace;
  design.renderTrace = function (node, trace) {
    base(node, trace);
    if (life) {
      render(node, trace);
    }
  };
  design.addBusy(function () { return waiting; });

  Studio.provenance = {
    /* 고른 자모의 다섯 답 { kind, origin, rule, follow, capability, requests } — 고른 것이 없으면 null */
    answers: function () {
      var node = Studio.selected();
      return node ? Model.answer(inputs(node, FontKku.traceOf(host))) : null;
    },
    refresh: refresh,
    check: check,
    /* 다섯 답 펼치기·접기 — 돌려준 값은 펼쳤는지 */
    open: function (value) {
      writeOpen(value !== false);
      var fold = panel && panel.querySelector("[data-provenance-fold]");
      if (fold) {
        fold.open = opened;
      }
      return opened;
    }
  };

  /* 처음 쓸 때 실린다(font-studio-lazy.js — 자모를 고르면). 칸을 붙이면 지금 페이지에서 깨어 고른 자모의 출처를 그린다 */
  mount();
})();
