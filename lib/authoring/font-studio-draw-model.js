/* font-studio-draw-model.js — 그림 문서·칸·SVG 가져오기 검사·변환·진행·제안 순수 모델 (설계 v1.2 §13.3·§18.1·§18.4, PLAN-HANGUL-001 F4)
 *
 * DOM 없이 작업실이 직접 그리는 칸 계약 그림 세트(ADR-024)를 다룬다. 브라우저(window.FontStudioDrawModel)와 Node(require) 공용.
 *
 * 그림 문서(font-kku-drawing v1) — 작업실 프로젝트·묶음 안에 사는 참가자 상태다. 디자인 JSON에는 세트 이름(assetSet)만 들어간다.
 *   { format: "font-kku-drawing", version: 1, set: "studio-draw-<8hex>", options: { frame: "box", stroke, cap, join },
 *     cells: { "ㄱ" | "ㄱ@bar" | "ㄱ@jong" | "ㆍ" …: { parts: [{ id, label, shapes: [shape] }],
 *                                                  provenance: { origin: authored|detached|imported, from?: { recipe, parts, set, revision }, at } } } }
 *   shape는 런타임 registerJamo 문법 그대로다: "M…"(중심선 획) · { d, fill: true }(채운 윤곽) · { ellipse: [cx, cy, rx, ry], fill? }.
 *   좌표는 0–100 칸이다. 원소 그림 @line·@dot·@ring은 사람이 고치는 칸이 아니라 받지 않는다.
 *
 * 고치는 함수(setCell·removeCell·setPart·removePart·movePart·scalePart·transformPart)는 받은 문서를 건드리지 않고 새 문서를 돌려준다 —
 * 편집 기록(font-studio-transactions.js)이 전·후를 통째로 들고 있어서다. 잘못된 입력은 TypeError로 거절한다.
 *
 * toCells(doc)는 registerJamo 칸 { key: { box, shapes } }를 낸다. box는 그림 범위(획 중심선이 닿는 상자, 굵기가 없는 축은 획 굵기만큼
 * 넓힘)라 런타임이 그 범위를 자모 자리에 맞춘다(scripts/build_jamo_svg.js boxCell과 같은 규칙). 빈 문서는 등록하지 않는다(register → false).
 *
 * sanitizeSvg(text)는 AI·사람이 준 SVG 글을 허용 목록만 도형으로 읽는다(§18.1). DOMParser 없이 글자를 직접 훑으므로 Node에서 시험한다.
 * 스크립트·이벤트 속성·foreignObject·글자(text)·그림(image)·참조(use·href)·스타일·url()·외부 참조는 버리고 rejected·warnings에 적는다.
 * 나가는 도형은 다시 읽은 숫자로만 쓴 경로라 원문의 글자가 섞이지 않는다. 바이트·명령 수·중첩 깊이에 상한을 둔다(§18.4).
 *
 * 차림(F5 그리기·F6 떼어 내기·F8 묶음이 쓴다):
 *   문서   createDoc(seed?) · normalizeDoc(json) → { ok, doc, errors: [{ path, message }] } · isEmpty · cellKeys · originOf(doc, jamo)
 *          setCell(doc, key, 도형들 | 부분들 | 칸, { origin, from, at, group, label }) · removeCell · setPart(doc, key, id|null, 도형들)
 *          removePart · movePart(doc, key, id, dx, dy) · scalePart(doc, key, id, sx, sy?, [ox, oy]?) · rotatePart(doc, key, id, deg, [ox, oy]?)
 *          · transformPart(doc, key, id, 행렬)
 *   런타임 toCells · registerOptions · register(doc, FontKku) → { name, cells } | false · progress(doc, FontKku) · docRevision · cellsRevision
 *   기하   normalizeShape · parsePath · serializePath · transformSegments · transformShapes(shapes, 행렬) · boundsOf · ellipseData ·
 *          rdp(points, tol) · polylineData · freehandData · Matrix.{translate, scale, rotate, multiply, invert, apply}
 *   가져오기 sanitizeSvg(text, { maxBytes, maxCommands }) → { ok, shapes, warnings: [글], rejected: [{ code, element, attribute?, message }],
 *          refused: null | { code, message }, viewBox, commands }
 *          · 여러 칸 한 번에(S5-A) splitSvgBundle(AI 답) → { ok, blocks: [{ index, svg, key, from, label, note, closed }], refused } ·
 *          bundleImport(doc, AI 답, { assign, fallback }) → { ok, complete, rows: [{ key, state: new|overwrite|unknown|duplicate|skipped|
 *          refused, shapes, warnings, rejected }], cells } · readCellName · isCellKey · promptTargets(progress) · bundlePrompt(칸들, { stroke })
 *   다 그린 칸만(S5-A) glyphRequests(글자) · planUsesDrawnOnly(planJamo 결과, fromDoc) · drawnOnlyText(글, canDraw) → { text, total, kept, dropped }
 *   제안   proposals({ progress, statuses, sentence, limit }) → [{ jamo, reason, count, status, stage }] · sentenceCounts ·
 *          contextsFor(jamo) → ["", "@bar", "@jong"] 꼴 · keysFor(jamo)
 *   떼기   detachFromCapture({ key, pieces: [{ id, label, items }], recipe, from: { set, revision } }, { margin, at }) → 칸
 *          item: { type: "box", rect: [x, y, w, h], cell: { viewBox, shapes } } | { type: "line", x, y, len, angleDeg, cell?, w? } |
 *                { type: "ring", cx, cy, rx, ry, cell? } — 모두 노드 em(font-kku.js placeElement의 --fy-el-* 값)
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-draw-model: load font-studio-util.js first");
  }
  var clone = Util.clone;
  var stableJson = Util.stableJson;
  var fnv1a = Util.fnv1a;
  var isObject = Util.isObject;
  var utf8Length = Util.utf8Length;

  var FORMAT = "font-kku-drawing";
  var VERSION = 1;
  var SET_PREFIX = "studio-draw-";
  var DRAW_SET = /^studio-draw-[0-9a-f]{8}$/;
  /* 런타임 JAMO_SET_NAME */
  var SET_NAME = /^[a-z0-9][a-z0-9-]*$/;
  /* 런타임 JAMO_BOX_KEY에서 원소 그림(@line·@dot·@ring)을 뺀 것 — 사람이 고치는 칸 */
  var EDITABLE_KEY = /^[ㄱ-ㆎ](?:@(?:cho|bar|jong))?$/;
  var ELEMENT_KEY = /^@(?:line|dot|ring)$/;
  /* 런타임 JAMO_PATH_DATA — 나가는 경로가 이 문법을 넘지 않는지 마지막에 다시 본다 */
  var PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
  var CAPS = { butt: true, round: true, square: true };
  var JOINS = { miter: true, round: true, bevel: true };
  var ORIGINS = { authored: true, detached: true, imported: true };
  var DEFAULT_OPTIONS = { frame: "box", stroke: 8, cap: "round", join: "round" };
  /* §18.4 상한. maxCommands는 SVG 가져오기 한 번·칸 하나의 경로 명령 수 */
  var LIMITS = { maxBytes: 200000, maxCommands: 2000, maxCells: 400, maxParts: 64, maxShapes: 256, maxDepth: 32, maxCoordinate: 10000 };
  var PRECISION = 3;
  var HELPER = "ㆍ";
  var STAGES = Util.STAGE_ORDER.slice();
  var STAGE_LABELS = Object.assign({}, Util.STAGE_NAMES);
  /* 제안 차례: 문장에 많이 나오는 것 → 지금 모양이 덜 된 것(그리지 않음·원소로 대체 → 원소 획 → 조합) → 단계 차례 */
  var STATUS_RANK = { none: 0, primitive: 0, error: 0, strokes: 1, composed: 2 };
  var STATUS_TEXT = { none: "그리지 않음", primitive: "원소로 대체", error: "그리지 못함", strokes: "원소 획", composed: "조합",
    direct: "원본 그대로", authored: "직접 그림", detached: "독립 그림", imported: "가져온 그림" };

  // ── 한글 자모 표(유니코드 배열) ───────────────────────────────────────

  var CHO = Util.CHO;
  var JUNG = Util.JUNG;
  var JONG = " " + Util.JONG; // 0번은 받침 없음 — 음절 셈(index % 28)이 바로 쓴다
  /* 겹자모가 품는 자모 — 문장 세기에서 ㅃ은 ㅂ도, ㄺ은 ㄹ·ㄱ도 쓴다(조립식이 그 그림을 빌린다) */
  var PARTS_OF = {
    "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ",
    "ㄳ": "ㄱㅅ", "ㄵ": "ㄴㅈ", "ㄶ": "ㄴㅎ", "ㄺ": "ㄹㄱ", "ㄻ": "ㄹㅁ", "ㄼ": "ㄹㅂ", "ㄽ": "ㄹㅅ", "ㄾ": "ㄹㅌ", "ㄿ": "ㄹㅍ",
    "ㅀ": "ㄹㅎ", "ㅄ": "ㅂㅅ",
    "ㅐ": "ㅏㅣ", "ㅒ": "ㅑㅣ", "ㅔ": "ㅓㅣ", "ㅖ": "ㅕㅣ", "ㅘ": "ㅗㅏ", "ㅙ": "ㅗㅐ", "ㅚ": "ㅗㅣ", "ㅝ": "ㅜㅓ", "ㅞ": "ㅜㅔ",
    "ㅟ": "ㅜㅣ", "ㅢ": "ㅡㅣ"
  };
  var FINAL_ONLY = "ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ";
  var INITIAL_ONLY = "ㄸㅃㅉ";

  function fail(message) {
    throw new TypeError("font-studio-draw: " + message);
  }

  /* 칸 단위 숫자 글 — precision 자리에서 반올림, -0은 0 */
  function fmt(value, precision) {
    var p = Math.pow(10, precision === undefined ? PRECISION : precision);
    var rounded = Math.round(value * p) / p;
    return String(rounded === 0 ? 0 : rounded);
  }

  // ── 변환 행렬 [a, b, c, d, e, f] (SVG matrix: x' = a·x + c·y + e, y' = b·x + d·y + f) ─────────

  var IDENTITY = [1, 0, 0, 1, 0, 0];

  /* m1 · m2 — m2를 먼저, m1을 나중에 적용한다(SVG transform 목록의 왼쪽이 바깥) */
  function multiply(m1, m2) {
    return [
      m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }

  function invert(m) {
    var det = m[0] * m[3] - m[1] * m[2];
    if (!det || !isFinite(det)) {
      fail("matrix is not invertible");
    }
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }

  function applyPoint(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  function translate(tx, ty) {
    return [1, 0, 0, 1, tx, ty || 0];
  }

  function scale(sx, sy, cx, cy) {
    var m = [sx, 0, 0, sy === undefined ? sx : sy, 0, 0];
    return cx === undefined ? m : multiply(translate(cx, cy), multiply(m, translate(-cx, -cy)));
  }

  function rotate(deg, cx, cy) {
    var r = deg * Math.PI / 180;
    var m = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
    return cx === undefined ? m : multiply(translate(cx, cy || 0), multiply(m, translate(-cx, -(cy || 0))));
  }

  function near(a, b) {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  }

  /* 닮음 변환(회전·고른 확대·뒤집기·옮기기)인가 — 호(A)와 원이 모양 그대로 옮겨 간다 */
  function isSimilarity(m) {
    return near(m[0] * m[2] + m[1] * m[3], 0) && near(m[0] * m[0] + m[1] * m[1], m[2] * m[2] + m[3] * m[3]);
  }

  var Matrix = {
    IDENTITY: IDENTITY,
    multiply: multiply,
    invert: invert,
    apply: applyPoint,
    translate: translate,
    scale: scale,
    rotate: rotate,
    isSimilarity: isSimilarity
  };

  // ── 경로 읽기·쓰기 ─────────────────────────────────────────────────

  var ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  var NUMBER_AT = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  var SEPARATOR = /[\s,]/;

  /* 경로 데이터 → 절대 좌표 마디 [{ c: M|L|C|Q|A|Z, p: [...] }] 와 명령 수. H·V는 L로, S·T는 반사한 조절점을 채운 C·Q로 편다.
   * 문법이 틀리면 TypeError. limit을 넘으면 그 자리에서 멈춘다(큰 글을 끝까지 읽지 않게). */
  function readPath(d, limit) {
    var text = String(d === undefined || d === null ? "" : d);
    var length = text.length;
    var at = 0;
    var segments = [];
    var commands = 0;
    var cx = 0;
    var cy = 0;
    var sx = 0;
    var sy = 0;
    var lastControl = null;
    var lastKind = "";
    var previous = "";

    function skip() {
      while (at < length && SEPARATOR.test(text.charAt(at))) {
        at += 1;
      }
    }
    function number() {
      skip();
      NUMBER_AT.lastIndex = at;
      var match = NUMBER_AT.exec(text);
      if (!match) {
        fail("path data has a bad number near " + JSON.stringify(text.slice(at, at + 12)));
      }
      at = NUMBER_AT.lastIndex;
      var value = Number(match[0]);
      if (!isFinite(value)) {
        fail("path data number is not finite");
      }
      return value;
    }
    function flag() {
      skip();
      var ch = text.charAt(at);
      if (ch !== "0" && ch !== "1") {
        fail("path arc flag must be 0 or 1 near " + JSON.stringify(text.slice(at, at + 12)));
      }
      at += 1;
      return ch === "1" ? 1 : 0;
    }

    skip();
    while (at < length) {
      var ch = text.charAt(at);
      var command;
      if (ARG_COUNT[ch.toUpperCase()] !== undefined && /[A-Za-z]/.test(ch)) {
        command = ch;
        at += 1;
      } else if (previous && previous.toUpperCase() !== "Z" && /[0-9.+-]/.test(ch)) {
        command = previous === "M" ? "L" : previous === "m" ? "l" : previous;
      } else {
        fail("path data has an unexpected " + JSON.stringify(ch));
      }
      var upper = command.toUpperCase();
      var relative = command !== upper;
      if (!segments.length && upper !== "M") {
        fail("path data must start with M");
      }
      commands += 1;
      if (limit !== undefined && commands > limit) {
        return { segments: segments, commands: commands, truncated: true };
      }
      var ox = relative ? cx : 0;
      var oy = relative ? cy : 0;
      var x;
      var y;
      if (upper === "M") {
        x = number() + ox;
        y = number() + oy;
        segments.push({ c: "M", p: [x, y] });
        cx = sx = x;
        cy = sy = y;
        lastKind = "";
      } else if (upper === "L" || upper === "H" || upper === "V") {
        x = upper === "V" ? cx : number() + ox;
        y = upper === "H" ? cy : number() + oy;
        segments.push({ c: "L", p: [x, y] });
        cx = x;
        cy = y;
        lastKind = "";
      } else if (upper === "C" || upper === "S") {
        var x1;
        var y1;
        if (upper === "C") {
          x1 = number() + ox;
          y1 = number() + oy;
        } else {
          x1 = lastKind === "C" ? 2 * cx - lastControl[0] : cx;
          y1 = lastKind === "C" ? 2 * cy - lastControl[1] : cy;
        }
        var x2 = number() + ox;
        var y2 = number() + oy;
        x = number() + ox;
        y = number() + oy;
        segments.push({ c: "C", p: [x1, y1, x2, y2, x, y] });
        lastControl = [x2, y2];
        lastKind = "C";
        cx = x;
        cy = y;
      } else if (upper === "Q" || upper === "T") {
        var qx;
        var qy;
        if (upper === "Q") {
          qx = number() + ox;
          qy = number() + oy;
        } else {
          qx = lastKind === "Q" ? 2 * cx - lastControl[0] : cx;
          qy = lastKind === "Q" ? 2 * cy - lastControl[1] : cy;
        }
        x = number() + ox;
        y = number() + oy;
        segments.push({ c: "Q", p: [qx, qy, x, y] });
        lastControl = [qx, qy];
        lastKind = "Q";
        cx = x;
        cy = y;
      } else if (upper === "A") {
        var rx = Math.abs(number());
        var ry = Math.abs(number());
        var phi = number();
        var large = flag();
        var sweep = flag();
        x = number() + ox;
        y = number() + oy;
        segments.push({ c: "A", p: [rx, ry, phi, large, sweep, x, y] });
        cx = x;
        cy = y;
        lastKind = "";
      } else {
        segments.push({ c: "Z", p: [] });
        cx = sx;
        cy = sy;
        lastKind = "";
      }
      previous = command;
      skip();
    }
    if (!segments.length) {
      fail("path data is empty");
    }
    return { segments: segments, commands: commands, truncated: false };
  }

  function parsePath(d) {
    return readPath(d).segments;
  }

  function serializePath(segments, precision) {
    return segments.map(function (segment) {
      if (segment.c === "Z") {
        return "Z";
      }
      return segment.c + segment.p.map(function (value, index) {
        return segment.c === "A" && (index === 3 || index === 4) ? String(value) : fmt(value, precision);
      }).join(" ");
    }).join("");
  }

  /* 호(A) 하나 → 3차 곡선 조각들(90° 이하씩). SVG 1.1 부록 F.6 끝점 → 중심 변환 */
  function arcToCubics(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
    if (x1 === x2 && y1 === y2) {
      return [];
    }
    if (!rx || !ry) {
      return [[x1, y1, x2, y2, x2, y2]];
    }
    var phi = phiDeg * Math.PI / 180;
    var cos = Math.cos(phi);
    var sin = Math.sin(phi);
    var hx = (x1 - x2) / 2;
    var hy = (y1 - y2) / 2;
    var xp = cos * hx + sin * hy;
    var yp = -sin * hx + cos * hy;
    var lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    var num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    var den = rx * rx * yp * yp + ry * ry * xp * xp;
    var coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den));
    var cxp = coef * rx * yp / ry;
    var cyp = -coef * ry * xp / rx;
    var cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    var cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    var angle = function (ux, uy, vx, vy) {
      return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    };
    var t1 = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    var dt = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && dt > 0) {
      dt -= 2 * Math.PI;
    } else if (sweep && dt < 0) {
      dt += 2 * Math.PI;
    }
    var count = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
    var step = dt / count;
    var k = 4 / 3 * Math.tan(step / 4);
    var point = function (ux, uy) {
      var px = rx * ux;
      var py = ry * uy;
      return [cos * px - sin * py + cx, sin * px + cos * py + cy];
    };
    var out = [];
    for (var index = 0; index < count; index += 1) {
      var a1 = t1 + index * step;
      var a2 = a1 + step;
      var c1 = Math.cos(a1);
      var s1 = Math.sin(a1);
      var c2 = Math.cos(a2);
      var s2 = Math.sin(a2);
      var q1 = point(c1 - k * s1, s1 + k * c1);
      var q2 = point(c2 + k * s2, s2 - k * c2);
      var end = point(c2, s2);
      out.push([q1[0], q1[1], q2[0], q2[1], end[0], end[1]]);
    }
    out[out.length - 1][4] = x2;
    out[out.length - 1][5] = y2;
    return out;
  }

  /* 마디들을 행렬로 옮긴다. 닮음 변환이면 호는 호로(반지름·기울기·방향 깃발), 아니면 3차 곡선으로 편다 */
  function transformSegments(segments, m) {
    var similar = isSimilarity(m);
    var det = m[0] * m[3] - m[1] * m[2];
    var out = [];
    var cur = [0, 0];
    var start = [0, 0];
    segments.forEach(function (segment) {
      var p = segment.p;
      if (segment.c === "M" || segment.c === "L") {
        out.push({ c: segment.c, p: applyPoint(m, p[0], p[1]) });
        cur = [p[0], p[1]];
        if (segment.c === "M") {
          start = cur;
        }
      } else if (segment.c === "C") {
        out.push({ c: "C", p: applyPoint(m, p[0], p[1]).concat(applyPoint(m, p[2], p[3]), applyPoint(m, p[4], p[5])) });
        cur = [p[4], p[5]];
      } else if (segment.c === "Q") {
        out.push({ c: "Q", p: applyPoint(m, p[0], p[1]).concat(applyPoint(m, p[2], p[3])) });
        cur = [p[2], p[3]];
      } else if (segment.c === "A") {
        if (!p[0] || !p[1]) {
          out.push({ c: "L", p: applyPoint(m, p[5], p[6]) });
        } else if (similar) {
          var s = Math.sqrt(Math.abs(det));
          var phi = p[2] * Math.PI / 180;
          var vx = m[0] * Math.cos(phi) + m[2] * Math.sin(phi);
          var vy = m[1] * Math.cos(phi) + m[3] * Math.sin(phi);
          out.push({ c: "A", p: [p[0] * s, p[1] * s, Math.atan2(vy, vx) * 180 / Math.PI, p[3], det < 0 ? 1 - p[4] : p[4]]
            .concat(applyPoint(m, p[5], p[6])) });
        } else {
          arcToCubics(cur[0], cur[1], p[0], p[1], p[2], p[3], p[4], p[5], p[6]).forEach(function (q) {
            out.push({ c: "C", p: applyPoint(m, q[0], q[1]).concat(applyPoint(m, q[2], q[3]), applyPoint(m, q[4], q[5])) });
          });
        }
        cur = [p[5], p[6]];
      } else {
        out.push({ c: "Z", p: [] });
        cur = start;
      }
    });
    return out;
  }

  /* 마디들의 점(끝점·조절점 — 조절점 껍질). 호는 3차 곡선으로 편 점 */
  function segmentPoints(segments) {
    var points = [];
    var cur = [0, 0];
    var start = [0, 0];
    segments.forEach(function (segment) {
      var p = segment.p;
      if (segment.c === "A") {
        arcToCubics(cur[0], cur[1], p[0], p[1], p[2], p[3], p[4], p[5], p[6]).forEach(function (q) {
          points.push([q[0], q[1]], [q[2], q[3]], [q[4], q[5]]);
        });
        points.push([p[5], p[6]]);
        cur = [p[5], p[6]];
      } else if (segment.c === "Z") {
        cur = start;
      } else {
        for (var index = 0; index < p.length; index += 2) {
          points.push([p[index], p[index + 1]]);
        }
        cur = [p[p.length - 2], p[p.length - 1]];
        if (segment.c === "M") {
          start = cur;
        }
      }
    });
    return points;
  }

  // ── 도형 ───────────────────────────────────────────────────────────

  var KAPPA = 0.5522847498307936;

  function ellipseSegments(cx, cy, rx, ry) {
    var kx = KAPPA * rx;
    var ky = KAPPA * ry;
    return [
      { c: "M", p: [cx + rx, cy] },
      { c: "C", p: [cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry] },
      { c: "C", p: [cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy] },
      { c: "C", p: [cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry] },
      { c: "C", p: [cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy] },
      { c: "Z", p: [] }
    ];
  }

  /* 도형 하나를 런타임 문법으로 맞춘다 — "M…" · { d, fill: true } · { ellipse, fill? }. 다른 표기({ type: "path", d } ·
   * { type: "ellipse", cx, cy, rx, ry } · { ellipse: { cx, … } })도 받는다. 틀리면 TypeError(where를 앞에) */
  function normalizeShape(shape, where) {
    var label = where || "shape";
    var item = typeof shape === "string" ? { d: shape } : shape;
    if (!isObject(item)) {
      fail(label + " must be path data or { d } / { ellipse }");
    }
    var fill = item.fill === true;
    if (typeof item.d === "string") {
      var d = item.d.trim();
      if (!d || !PATH_DATA.test(d)) {
        fail(label + " path data may only hold SVG path commands and numbers");
      }
      readPath(d);
      return fill ? { d: d, fill: true } : d;
    }
    var values = null;
    if (Array.isArray(item.ellipse) && item.ellipse.length === 4) {
      values = item.ellipse.map(Number);
    } else if (isObject(item.ellipse)) {
      values = [item.ellipse.cx, item.ellipse.cy, item.ellipse.rx, item.ellipse.ry].map(Number);
    } else if (item.type === "ellipse") {
      values = Array.isArray(item.values) ? item.values.map(Number) : [item.cx, item.cy, item.rx, item.ry].map(Number);
    }
    if (values) {
      if (values.length !== 4 || !values.every(isFinite) || values[2] < 0 || values[3] < 0) {
        fail(label + " ellipse is [cx, cy, rx, ry] with finite numbers and rx, ry >= 0");
      }
      return fill ? { ellipse: values, fill: true } : { ellipse: values };
    }
    fail(label + " must be path data or { d } / { ellipse: [cx, cy, rx, ry] }");
  }

  function shapeKind(shape) {
    return typeof shape === "string" || typeof shape.d === "string" ? "path" : "ellipse";
  }

  function shapeData(shape) {
    return typeof shape === "string" ? shape : shape.d;
  }

  function shapeCommands(shape) {
    return shapeKind(shape) === "path" ? readPath(shapeData(shape)).commands : 1;
  }

  /* 도형들의 그림 범위 [x0, y0, x1, y1](조절점 껍질, 타원은 cx±rx). 도형이 없으면 null */
  function boundsOf(shapes) {
    var box = [Infinity, Infinity, -Infinity, -Infinity];
    var add = function (x, y) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    };
    (shapes || []).forEach(function (raw) {
      var shape = normalizeShape(raw);
      if (shapeKind(shape) === "path") {
        segmentPoints(parsePath(shapeData(shape))).forEach(function (point) {
          add(point[0], point[1]);
        });
      } else {
        var e = shape.ellipse;
        add(e[0] - e[2], e[1] - e[3]);
        add(e[0] + e[2], e[1] + e[3]);
      }
    });
    return box[0] === Infinity ? null : box;
  }

  /* 도형들을 행렬로 옮긴다. 타원은 축이 그대로면 타원, 아니면 경로로 바꾼다(원은 닮음 변환에서 원). options.precision(기본 3) */
  function transformShapes(shapes, matrix, options) {
    var precision = options && options.precision !== undefined ? options.precision : PRECISION;
    var m = matrix || IDENTITY;
    if (m.length !== 6 || !m.every(isFinite)) {
      fail("matrix is [a, b, c, d, e, f] with finite numbers");
    }
    return (shapes || []).map(function (raw, index) {
      var shape = normalizeShape(raw, "shapes[" + index + "]");
      var fill = shape.fill === true;
      if (shapeKind(shape) === "path") {
        var d = serializePath(transformSegments(parsePath(shapeData(shape)), m), precision);
        return fill ? { d: d, fill: true } : d;
      }
      var e = shape.ellipse;
      var center = applyPoint(m, e[0], e[1]);
      var radii = null;
      if (near(m[1], 0) && near(m[2], 0)) {
        radii = [Math.abs(m[0]) * e[2], Math.abs(m[3]) * e[3]];
      } else if (near(m[0], 0) && near(m[3], 0)) {
        radii = [Math.abs(m[2]) * e[3], Math.abs(m[1]) * e[2]];
      } else if (e[2] === e[3] && isSimilarity(m)) {
        var s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        radii = [s * e[2], s * e[3]];
      }
      if (radii) {
        var values = [center[0], center[1], radii[0], radii[1]].map(function (value) {
          return Number(fmt(value, precision));
        });
        return fill ? { ellipse: values, fill: true } : { ellipse: values };
      }
      var path = serializePath(transformSegments(ellipseSegments(e[0], e[1], e[2], e[3]), m), precision);
      return fill ? { d: path, fill: true } : path;
    });
  }

  /* 타원 하나를 경로로 — 회전·기울이기 전에 쓰거나 화면이 경로만 다룰 때 */
  function ellipseData(cx, cy, rx, ry, precision) {
    return serializePath(ellipseSegments(cx, cy, rx, ry), precision);
  }

  // ── 손 그림 ─────────────────────────────────────────────────────────

  function pointXY(point) {
    return Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point.x), Number(point.y)];
  }

  /* Ramer–Douglas–Peucker. points는 [[x, y]] 또는 [{ x, y }], 받은 점 그대로(같은 꼴) 줄여 돌려준다. 되부름 없이 쌓기로 */
  function rdp(points, tolerance) {
    var list = Array.isArray(points) ? points : [];
    if (list.length < 3) {
      return list.slice();
    }
    var tol = Math.max(0, Number(tolerance) || 0);
    var xy = list.map(pointXY);
    var keep = new Array(list.length);
    keep[0] = keep[list.length - 1] = true;
    var stack = [[0, list.length - 1]];
    while (stack.length) {
      var range = stack.pop();
      var a = xy[range[0]];
      var b = xy[range[1]];
      var dx = b[0] - a[0];
      var dy = b[1] - a[1];
      var len = Math.sqrt(dx * dx + dy * dy);
      var worst = -1;
      var at = -1;
      for (var index = range[0] + 1; index < range[1]; index += 1) {
        var p = xy[index];
        var distance = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
          : Math.sqrt((p[0] - a[0]) * (p[0] - a[0]) + (p[1] - a[1]) * (p[1] - a[1]));
        if (distance > worst) {
          worst = distance;
          at = index;
        }
      }
      if (worst > tol && at > 0) {
        keep[at] = true;
        stack.push([range[0], at], [at, range[1]]);
      }
    }
    return list.filter(function (point, index) {
      return keep[index];
    });
  }

  /* 점들 → 경로 데이터. 열린 선(closed면 Z). smooth면 Catmull–Rom을 3차 곡선으로 */
  function polylineData(points, options) {
    var opts = options || {};
    var xy = (points || []).map(pointXY).filter(function (p) {
      return isFinite(p[0]) && isFinite(p[1]);
    });
    if (!xy.length) {
      fail("polyline needs at least one point");
    }
    var precision = opts.precision === undefined ? PRECISION : opts.precision;
    var segments = [{ c: "M", p: xy[0] }];
    if (xy.length === 1) {
      segments.push({ c: "L", p: xy[0] });
    } else if (!opts.smooth || xy.length < 3) {
      xy.slice(1).forEach(function (p) {
        segments.push({ c: "L", p: p });
      });
    } else {
      for (var index = 0; index < xy.length - 1; index += 1) {
        var p0 = xy[Math.max(0, index - 1)];
        var p1 = xy[index];
        var p2 = xy[index + 1];
        var p3 = xy[Math.min(xy.length - 1, index + 2)];
        segments.push({ c: "C", p: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
          p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]] });
      }
    }
    if (opts.closed) {
      segments.push({ c: "Z", p: [] });
    }
    return serializePath(segments, precision);
  }

  /* 손 그림 한 획 — rdp로 줄이고(tolerance 기본 0.8칸) 부드럽게(smooth 기본 true) */
  function freehandData(points, options) {
    var opts = options || {};
    var reduced = rdp(points, opts.tolerance === undefined ? 0.8 : opts.tolerance);
    return polylineData(reduced, { smooth: opts.smooth !== false, closed: opts.closed, precision: opts.precision });
  }

  // ── 그림 문서 ──────────────────────────────────────────────────────

  function randomHex() {
    var cryptoApi = global.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      var buffer = new Uint32Array(1);
      cryptoApi.getRandomValues(buffer);
      return ("0000000" + buffer[0].toString(16)).slice(-8);
    }
    return ("0000000" + Math.floor(Math.random() * 0x100000000).toString(16)).slice(-8);
  }

  /* 새 그림 세트 이름 studio-draw-<8hex>. seed가 있으면 그 글의 fnv1a(같은 seed → 같은 이름), 없으면 무작위 */
  function newSetName(seed) {
    if (typeof seed === "string" && DRAW_SET.test(seed)) {
      return seed;
    }
    return SET_PREFIX + (seed === undefined || seed === null ? randomHex() : fnv1a(String(seed)));
  }

  function isEditableKey(key) {
    return typeof key === "string" && EDITABLE_KEY.test(key);
  }

  function baseOf(key) {
    return String(key).split("@")[0];
  }

  function checkKey(key) {
    if (typeof key === "string" && ELEMENT_KEY.test(key)) {
      fail("cell " + key + " is a shared element drawing, not an editable jamo cell");
    }
    if (!isEditableKey(key)) {
      fail("cell key is a compatibility jamo with an optional @cho, @bar or @jong (got " + JSON.stringify(key) + ")");
    }
  }

  function normalizeOptions(input) {
    var options = Object.assign({}, DEFAULT_OPTIONS, isObject(input) ? input : {});
    if (options.frame !== "box") {
      fail("drawing options.frame is \"box\"");
    }
    var stroke = Number(options.stroke);
    if (!isFinite(stroke) || stroke < 0 || stroke > 50) {
      fail("drawing options.stroke is a width in cell units (0–50)");
    }
    if (!CAPS[options.cap] || !JOINS[options.join]) {
      fail("drawing options.cap is butt|round|square and join is miter|round|bevel");
    }
    return { frame: "box", stroke: stroke, cap: String(options.cap), join: String(options.join) };
  }

  function cleanPartId(value) {
    var text = typeof value === "string" ? value.trim() : "";
    return text && text.length <= 64 && !/[\u0000-\u001f<>"'`&]/.test(text) ? text : null;
  }

  function cleanLabel(value, fallback) {
    var text = typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) : "";
    return text || fallback;
  }

  function nextPartNumber(parts) {
    var top = 0;
    parts.forEach(function (part) {
      var match = /^p(\d+)$/.exec(part.id);
      if (match) {
        top = Math.max(top, Number(match[1]));
      }
    });
    return top + 1;
  }

  function normalizeShapes(shapes, where) {
    if (!Array.isArray(shapes)) {
      fail(where + " shapes must be a list");
    }
    if (shapes.length > LIMITS.maxShapes) {
      fail(where + " has more than " + LIMITS.maxShapes + " shapes");
    }
    return shapes.map(function (shape, index) {
      return normalizeShape(shape, where + "[" + index + "]");
    });
  }

  function normalizeParts(parts, where) {
    if (!Array.isArray(parts)) {
      fail(where + " parts must be a list");
    }
    if (parts.length > LIMITS.maxParts) {
      fail(where + " has more than " + LIMITS.maxParts + " parts");
    }
    var seen = {};
    var out = [];
    parts.forEach(function (part, index) {
      if (!isObject(part)) {
        fail(where + ".parts[" + index + "] must be { id, label, shapes }");
      }
      var shapes = normalizeShapes(part.shapes, where + ".parts[" + index + "]");
      var id = cleanPartId(part.id);
      if (!id || seen[id]) {
        id = null;
      }
      out.push({ id: id, label: cleanLabel(part.label, ""), shapes: shapes });
      if (id) {
        seen[id] = true;
      }
    });
    var serial = nextPartNumber(out.filter(function (part) { return part.id; }));
    out.forEach(function (part, index) {
      if (!part.id) {
        while (seen["p" + serial]) {
          serial += 1;
        }
        part.id = "p" + serial;
        seen[part.id] = true;
        serial += 1;
      }
      part.label = part.label || "획 " + (index + 1);
    });
    return out;
  }

  function normalizeProvenance(input, where) {
    var source = isObject(input) ? input : {};
    var origin = source.origin === undefined ? "authored" : source.origin;
    if (!ORIGINS[origin]) {
      fail(where + " provenance.origin is authored, detached or imported (got " + JSON.stringify(origin) + ")");
    }
    var out = { origin: origin, at: typeof source.at === "string" && source.at.length <= 40 ? source.at : new Date().toISOString() };
    if (source.from !== undefined && source.from !== null) {
      if (!isObject(source.from)) {
        fail(where + " provenance.from must be an object");
      }
      var from = {};
      ["recipe", "set", "revision"].forEach(function (field) {
        var value = source.from[field];
        if (value !== undefined && value !== null) {
          if (typeof value !== "string" || value.length > 120 || /[\u0000-\u001f<>]/.test(value)) {
            fail(where + " provenance.from." + field + " must be a short string");
          }
          from[field] = value;
        }
      });
      if (source.from.parts !== undefined) {
        if (!Array.isArray(source.from.parts) || source.from.parts.length > LIMITS.maxParts ||
          !source.from.parts.every(function (id) { return typeof id === "string" && id.length <= 64; })) {
          fail(where + " provenance.from.parts must be a list of short strings");
        }
        from.parts = source.from.parts.slice();
      }
      out.from = from;
    }
    return out;
  }

  /* 칸 하나의 상한 — 명령 수(한 칸에 너무 긴 경로가 들어 화면이 멈추지 않게)와 좌표 범위(칸에서 터무니없이 먼 점) */
  function checkCellLimits(parts, where) {
    var total = 0;
    var shapes = [];
    parts.forEach(function (part) {
      part.shapes.forEach(function (shape) {
        total += shapeCommands(shape);
        shapes.push(shape);
      });
    });
    if (total > LIMITS.maxCommands) {
      fail(where + " has " + total + " path commands (limit " + LIMITS.maxCommands + ")");
    }
    var box = boundsOf(shapes);
    if (box && box.some(function (value) { return Math.abs(value) > LIMITS.maxCoordinate; })) {
      fail(where + " has coordinates beyond ±" + LIMITS.maxCoordinate + " cell units");
    }
  }

  function normalizeCell(input, where) {
    if (!isObject(input)) {
      fail(where + " must be { parts, provenance }");
    }
    var parts = normalizeParts(input.parts, where);
    checkCellLimits(parts, where);
    return { parts: parts, provenance: normalizeProvenance(input.provenance, where) };
  }

  function isDoc(value) {
    return isObject(value) && value.format === FORMAT;
  }

  /* 그림 문서를 검사하고 맞춘다(묶음·프로젝트에서 읽은 것). { ok, doc, errors: [{ path, message }] } — 첫 오류에서 멈추지 않고
   * 칸마다 하나씩 모은다. 빈 부분(parts: [])인 칸은 버린다 */
  function normalizeDoc(input) {
    var errors = [];
    var note = function (path, error) {
      errors.push({ path: path, message: String(error && error.message || error).replace(/^font-studio-draw: /, "") });
    };
    if (!isObject(input)) {
      return { ok: false, doc: null, errors: [{ path: "", message: "drawing must be an object" }] };
    }
    if (input.format !== FORMAT) {
      note("format", "format is " + JSON.stringify(FORMAT));
    }
    if (input.version !== VERSION) {
      note("version", "version is " + VERSION);
    }
    var set = typeof input.set === "string" ? input.set.trim().toLowerCase() : "";
    if (!SET_NAME.test(set)) {
      note("set", "set is lowercase letters, digits and '-' (got " + JSON.stringify(input.set) + ")");
    }
    var options = null;
    try {
      options = normalizeOptions(input.options);
    } catch (error) {
      note("options", error);
    }
    var cells = {};
    if (!isObject(input.cells)) {
      note("cells", "cells must be an object");
    } else {
      var keys = Object.keys(input.cells);
      if (keys.length > LIMITS.maxCells) {
        note("cells", "more than " + LIMITS.maxCells + " cells");
      }
      keys.slice(0, LIMITS.maxCells).forEach(function (key) {
        try {
          checkKey(key);
          var cell = normalizeCell(input.cells[key], "cells." + key);
          if (cell.parts.some(function (part) { return part.shapes.length; })) {
            cells[key] = cell;
          }
        } catch (error) {
          note("cells." + key, error);
        }
      });
    }
    if (errors.length) {
      return { ok: false, doc: null, errors: errors };
    }
    return { ok: true, doc: { format: FORMAT, version: VERSION, set: set, options: options, cells: cells }, errors: [] };
  }

  /* 새 그림 문서. seed: 없음(무작위 세트 이름) · 글(그 글의 fnv1a 이름, studio-draw-<8hex>이면 그대로) · 문서 꼴 객체(검사해 맞춘다) */
  function createDoc(seed) {
    if (isObject(seed)) {
      var input = Object.assign({ format: FORMAT, version: VERSION, cells: {} }, seed);
      input.set = input.set === undefined ? newSetName() : input.set;
      var result = normalizeDoc(input);
      if (!result.ok) {
        fail("bad drawing — " + result.errors.map(function (error) { return error.path + ": " + error.message; }).join("; "));
      }
      return result.doc;
    }
    return { format: FORMAT, version: VERSION, set: newSetName(seed), options: clone(DEFAULT_OPTIONS), cells: {} };
  }

  function ensureDoc(doc) {
    if (!isDoc(doc) || !isObject(doc.cells)) {
      fail("expected a font-kku-drawing doc");
    }
    return doc;
  }

  function copyDoc(doc) {
    return clone(ensureDoc(doc));
  }

  function cellHasShapes(cell) {
    return Boolean(cell && Array.isArray(cell.parts) && cell.parts.some(function (part) {
      return Array.isArray(part.shapes) && part.shapes.length;
    }));
  }

  /* 그린 칸 키(차례대로) — 도형이 하나도 없는 칸은 세지 않는다 */
  function cellKeys(doc) {
    ensureDoc(doc);
    return Object.keys(doc.cells).filter(function (key) {
      return cellHasShapes(doc.cells[key]);
    }).sort();
  }

  function isEmpty(doc) {
    return !doc || !isObject(doc.cells) || !cellKeys(doc).length;
  }

  function looksLikeParts(list) {
    return list.length > 0 && list.every(function (item) {
      return isObject(item) && Array.isArray(item.shapes);
    });
  }

  /* 칸을 통째로 둔다. value: 도형 목록(도형마다 부분 하나 — opts.group이면 부분 하나로) · 부분 목록 [{ id, label, shapes }] ·
   * 칸 { parts, provenance }. opts: { origin, from, at, label }(provenance — 칸 값에 있으면 그것을 먼저). 도형이 없으면 칸을 지운다 */
  function setCell(doc, key, value, options) {
    var next = copyDoc(doc);
    checkKey(key);
    var opts = options || {};
    var parts;
    var provenance = null;
    if (isObject(value) && Array.isArray(value.parts)) {
      parts = value.parts;
      provenance = isObject(value.provenance) ? value.provenance : null;
    } else if (Array.isArray(value) && looksLikeParts(value)) {
      parts = value;
    } else if (Array.isArray(value)) {
      var shapes = value;
      parts = opts.group ? [{ id: "p1", label: cleanLabel(opts.label, "획 1"), shapes: shapes }]
        : shapes.map(function (shape, index) {
          return { id: "p" + (index + 1), label: "획 " + (index + 1), shapes: [shape] };
        });
    } else if (value === null || value === undefined) {
      parts = [];
    } else {
      parts = [{ id: "p1", label: cleanLabel(opts.label, "획 1"), shapes: [value] }];
    }
    var where = "cells." + key;
    var cleaned = normalizeParts(parts, where).filter(function (part) {
      return part.shapes.length;
    });
    if (!cleaned.length) {
      delete next.cells[key];
      return next;
    }
    checkCellLimits(cleaned, where);
    var meta = Object.assign({}, provenance || {});
    ["origin", "from", "at"].forEach(function (field) {
      if (opts[field] !== undefined && !(provenance && provenance[field] !== undefined)) {
        meta[field] = opts[field];
      }
    });
    next.cells[key] = { parts: cleaned, provenance: normalizeProvenance(meta, where) };
    return next;
  }

  function removeCell(doc, key) {
    var next = copyDoc(doc);
    delete next.cells[key];
    return next;
  }

  function findPart(doc, key, partId) {
    var cell = doc.cells[key];
    if (!cell) {
      fail("no cell " + JSON.stringify(key));
    }
    for (var index = 0; index < cell.parts.length; index += 1) {
      if (cell.parts[index].id === partId) {
        return { cell: cell, index: index };
      }
    }
    fail("cell " + key + " has no part " + JSON.stringify(partId));
  }

  /* 부분 하나를 바꾸거나(같은 id) 더한다(없는 id·null). value: 도형 목록 또는 { label, shapes }. 칸의 출처는 그대로 둔다 —
   * 없던 칸이면 직접 그림(authored)으로 만든다 */
  function setPart(doc, key, partId, value, options) {
    var next = copyDoc(doc);
    checkKey(key);
    var opts = options || {};
    var shapes = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.shapes) ? value.shapes : [value];
    var label = isObject(value) && !Array.isArray(value) && typeof value.label === "string" ? value.label : opts.label;
    var cell = next.cells[key] || { parts: [], provenance: normalizeProvenance({ origin: opts.origin, from: opts.from, at: opts.at }, "cells." + key) };
    var index = -1;
    cell.parts.forEach(function (part, at) {
      if (part.id === partId) {
        index = at;
      }
    });
    var id = index >= 0 ? partId : cleanPartId(partId) || "p" + nextPartNumber(cell.parts);
    var part = { id: id, label: cleanLabel(label, index >= 0 ? cell.parts[index].label : "획 " + (cell.parts.length + 1)), shapes: shapes };
    if (index >= 0) {
      cell.parts[index] = part;
    } else {
      cell.parts.push(part);
    }
    return setCell(next, key, cell);
  }

  function removePart(doc, key, partId) {
    var next = copyDoc(doc);
    var found = findPart(next, key, partId);
    found.cell.parts.splice(found.index, 1);
    return setCell(next, key, found.cell);
  }

  function transformPart(doc, key, partId, matrix) {
    var next = copyDoc(doc);
    var found = findPart(next, key, partId);
    var part = found.cell.parts[found.index];
    part.shapes = transformShapes(part.shapes, matrix);
    return setCell(next, key, found.cell);
  }

  function movePart(doc, key, partId, dx, dy) {
    return transformPart(doc, key, partId, translate(Number(dx) || 0, Number(dy) || 0));
  }

  /* 부분 하나만 돌린다(S5-A 부분 회전) — deg는 시계 방향(화면 y가 아래), 기준점(origin [x, y])이 없으면 그 부분 그림 범위의 가운데.
   * 원은 원으로, 타원은 경로로 바뀐다(transformShapes) */
  function rotatePart(doc, key, partId, deg, origin) {
    ensureDoc(doc);
    var found = findPart(doc, key, partId);
    var angle = Number(deg);
    if (!isFinite(angle)) {
      fail("rotation angle must be a finite number of degrees");
    }
    var center = origin;
    if (!center) {
      var box = boundsOf(found.cell.parts[found.index].shapes) || [50, 50, 50, 50];
      center = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    }
    return transformPart(doc, key, partId, rotate(angle, center[0], center[1]));
  }

  /* 부분을 늘인다 — 기준점(origin [x, y])이 없으면 그 부분 그림 범위의 가운데 */
  function scalePart(doc, key, partId, sx, sy, origin) {
    ensureDoc(doc);
    var found = findPart(doc, key, partId);
    var fx = Number(sx);
    var fy = sy === undefined || sy === null ? fx : Number(sy);
    if (!isFinite(fx) || !isFinite(fy) || !fx || !fy) {
      fail("scale factors must be finite and non-zero");
    }
    var center = origin;
    if (!center) {
      var box = boundsOf(found.cell.parts[found.index].shapes) || [50, 50, 50, 50];
      center = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
    }
    return transformPart(doc, key, partId, scale(fx, fy, center[0], center[1]));
  }

  function cellShapes(cell) {
    var shapes = [];
    (cell && cell.parts || []).forEach(function (part) {
      (part.shapes || []).forEach(function (shape) {
        shapes.push(shape);
      });
    });
    return shapes;
  }

  /* 그림 범위를 최소 굵기만큼 넓힌다 — 한 축이 선 하나면 그 축은 획 굵기(build_jamo_svg.js boxCell의 widen) */
  function widenBox(box, thickness) {
    var widen = function (a, b) {
      return b - a < thickness ? [(a + b) / 2 - thickness / 2, (a + b) / 2 + thickness / 2] : [a, b];
    };
    var xs = widen(box[0], box[2]);
    var ys = widen(box[1], box[3]);
    return [xs[0], ys[0], xs[1], ys[1]].map(function (value) {
      return Number(fmt(value));
    });
  }

  /* registerJamo 칸 { key: { box, shapes } } — 도형 없는 칸은 뺀다 */
  function toCells(doc) {
    ensureDoc(doc);
    var thickness = Math.max(Number(doc.options && doc.options.stroke) || 0, 1);
    var cells = {};
    cellKeys(doc).forEach(function (key) {
      var shapes = cellShapes(doc.cells[key]).map(function (shape) {
        return normalizeShape(shape, key);
      });
      cells[key] = { box: widenBox(boundsOf(shapes), thickness), shapes: clone(shapes) };
    });
    return cells;
  }

  function registerOptions(doc) {
    var options = normalizeOptions(ensureDoc(doc).options);
    return { frame: "box", stroke: options.stroke, cap: options.cap, join: options.join };
  }

  /* 런타임에 세트로 등록한다. 빈 문서는 등록하지 않고 false(registerJamo는 칸이 하나도 없으면 거절한다) */
  function register(doc, FontKku) {
    if (isEmpty(doc)) {
      return false;
    }
    var runtime = FontKku || global.FontKku;
    if (!runtime || typeof runtime.registerJamo !== "function") {
      fail("register needs FontKku.registerJamo");
    }
    return runtime.registerJamo(doc.set, toCells(doc), registerOptions(doc));
  }

  /* 문서 전체의 내용 주소(출처·시각 포함) — 키 차례와 무관 */
  function docRevision(doc) {
    return fnv1a(stableJson(ensureDoc(doc)));
  }

  /* 그려지는 내용만의 주소(세트에 들어가는 칸·옵션) — 같은 이름의 다른 세트인지 가릴 때 */
  function cellsRevision(doc) {
    return fnv1a(stableJson({ cells: toCells(doc), options: registerOptions(doc) }));
  }

  /* 자모의 그림 출처 — 바탕 칸(문맥 없는 키)이 먼저, 없으면 문맥 칸. 그리지 않았으면 null */
  function originOf(doc, jamo) {
    ensureDoc(doc);
    var keys = [jamo, jamo + "@cho", jamo + "@bar", jamo + "@jong"].filter(function (key) {
      return cellHasShapes(doc.cells[key]);
    });
    return keys.length ? doc.cells[keys[0]].provenance.origin : null;
  }

  // ── 진행·제안 ──────────────────────────────────────────────────────

  /* FontKku.authoringProgress(그린 칸 키) — 문맥 칸(ㄱ@jong)도 그 자모를 그린 셈이다 */
  function progress(doc, FontKku) {
    var runtime = FontKku || global.FontKku;
    if (!runtime || typeof runtime.authoringProgress !== "function") {
      fail("progress needs FontKku.authoringProgress");
    }
    return runtime.authoringProgress(cellKeys(doc));
  }

  /* 문장 속 자모 횟수 { jamo: n } — 음절은 초·중·종성으로, 겹자모는 품은 자모도 센다(ㅃ → ㅃ·ㅂ, ㅙ → ㅙ·ㅗ·ㅐ·ㅏ·ㅣ) */
  function sentenceCounts(sentence) {
    var counts = {};
    var add = function (jamo) {
      var seen = {};
      var walk = function (item) {
        if (seen[item]) {
          return;
        }
        seen[item] = true;
        counts[item] = (counts[item] || 0) + 1;
        (PARTS_OF[item] || "").split("").forEach(walk);
      };
      walk(jamo);
    };
    String(sentence || "").split("").forEach(function (ch) {
      var code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        var index = code - 0xac00;
        add(CHO.charAt(Math.floor(index / 588)));
        add(JUNG.charAt(Math.floor((index % 588) / 28)));
        if (index % 28) {
          add(JONG.charAt(index % 28));
        }
      } else if (code >= 0x3131 && code <= 0x318e) {
        add(ch);
      } else if (code >= 0x1100 && code <= 0x1112) {
        add(CHO.charAt(code - 0x1100));
      } else if (code >= 0x1161 && code <= 0x1175) {
        add(JUNG.charAt(code - 0x1161));
      } else if (code >= 0x11a8 && code <= 0x11c2) {
        add(JONG.charAt(code - 0x11a8 + 1));
      }
    });
    return counts;
  }

  function statusFrom(statuses, jamo) {
    if (!statuses) {
      return null;
    }
    var value = typeof statuses === "function" ? statuses(jamo) : statuses[jamo];
    if (isObject(value)) {
      value = value.status || value.result || null;
    }
    return typeof value === "string" ? value : null;
  }

  /* 다음에 그릴 자모 제안 [{ jamo, reason, count, status, stage }]. 후보는 다음 단계(progress.next)의 남은 자모(원형 8 단계면
   * 그리지 않은 ㆍ도), 단계가 다 찼으면 남은 것 없음(ㆍ만). 차례: 문장 횟수(많이) → 지금 모양(그리지 않음·원소로 대체 → 원소 획 →
   * 조합 → 그 밖) → 단계 차례. statuses: { jamo: 상태 | { status } } 또는 함수 */
  function proposals(input) {
    var opts = input || {};
    var state = opts.progress;
    if (!isObject(state) || !Array.isArray(state.stages)) {
      fail("proposals needs { progress } from FontKku.authoringProgress");
    }
    var stage = state.next;
    var row = null;
    state.stages.forEach(function (item) {
      if (item.stage === stage) {
        row = item;
      }
    });
    var candidates = row ? row.missing.slice() : [];
    var helperMissing = state.helper && !state.helper.drawn;
    if (helperMissing && (stage === "origin8" || !stage)) {
      candidates.push(state.helper.jamo || HELPER);
    }
    var counts = sentenceCounts(opts.sentence);
    var list = candidates.map(function (jamo, order) {
      var status = statusFrom(opts.statuses, jamo);
      var count = counts[jamo] || 0;
      var reason = (count ? "문장에 " + count + "번" : jamo === HELPER ? "보조 원본(천지인 점)" :
        (STAGE_LABELS[stage] || "다음 단계") + " 목표") + (status && STATUS_TEXT[status] ? " · 지금 " + STATUS_TEXT[status] : "");
      return {
        jamo: jamo, reason: reason, count: count, status: status, stage: stage || null,
        rank: status && STATUS_RANK[status] !== undefined ? STATUS_RANK[status] : 3, order: order
      };
    });
    list.sort(function (a, b) {
      return b.count - a.count || a.rank - b.rank || a.order - b.order;
    });
    var limit = opts.limit === undefined ? list.length : Math.max(0, Math.floor(opts.limit));
    return list.slice(0, limit).map(function (item) {
      return { jamo: item.jamo, reason: item.reason, count: item.count, status: item.status, stage: item.stage };
    });
  }

  /* 자모의 고칠 수 있는 문맥 칸(키 뒤 꼬리) — 모음·ㆍ [""], 자음 ["", "@bar", "@jong"], 초성에만 오는 ㄸ·ㅃ·ㅉ ["", "@bar"],
   * 받침에만 오는 겹받침 ["", "@jong"](바탕 칸이 받침 자리 그림이다) */
  function contextsFor(jamo) {
    var text = String(jamo || "");
    if (text.length !== 1 || !/[ㄱ-ㆎ]/.test(text)) {
      return [];
    }
    var code = text.charCodeAt(0);
    if ((code >= 0x314f && code <= 0x3163) || text === HELPER) {
      return [""];
    }
    if (FINAL_ONLY.indexOf(text) >= 0) {
      return ["", "@jong"];
    }
    if (INITIAL_ONLY.indexOf(text) >= 0) {
      return ["", "@bar"];
    }
    if (CHO.indexOf(text) >= 0) {
      return ["", "@bar", "@jong"];
    }
    return [""];
  }

  function keysFor(jamo) {
    return contextsFor(jamo).map(function (suffix) {
      return jamo + suffix;
    });
  }

  // ── 떼어 내기(조립된 자모 → 독립 그림) ───────────────────────────────

  function viewBoxOf(value) {
    var list = Array.isArray(value) ? value.map(Number) : String(value || "").trim().split(/[\s,]+/).map(Number);
    if (list.length !== 4 || !list.every(isFinite) || list[2] <= 0 || list[3] <= 0) {
      fail("captured cell viewBox is \"x y width height\" with a positive size");
    }
    return list;
  }

  /* 상자 [x, y, w, h]에 viewBox를 늘여 채우는 행렬(preserveAspectRatio="none" — 런타임 boxCell과 같다) */
  function fitMatrix(viewBox, rect) {
    var sx = rect[2] / viewBox[2];
    var sy = rect[3] / viewBox[3];
    return [sx, 0, 0, sy, rect[0] - viewBox[0] * sx, rect[1] - viewBox[1] * sy];
  }

  function capturedShapes(cell, where) {
    if (!isObject(cell) || !Array.isArray(cell.shapes)) {
      fail(where + " cell needs { viewBox, shapes }");
    }
    return cell.shapes.map(function (shape, index) {
      return normalizeShape(shape, where + ".shapes[" + index + "]");
    });
  }

  /* 화면 조각 하나(노드 em 좌표) → 중심선 도형들(em). box: 그림 <svg>를 rect에 늘여 놓은 것. line: 시작점(x, y)·길이·각(도) —
   * 원소 그림(cell)이 있으면 마디 길이 × 굵기(w em, 없으면 그림 비율) 상자에 놓고 돌린다(font-kku.css 선 원소). ring: 중심·반지름 —
   * 그림이 있으면 고리의 중심선 상자에 늘인다 */
  function itemShapes(item, where) {
    if (!isObject(item)) {
      fail(where + " must be a captured element");
    }
    var num = function (value, name) {
      var n = Number(value);
      if (!isFinite(n)) {
        fail(where + "." + name + " must be a finite number");
      }
      return n;
    };
    if (item.type === "box") {
      var rect = Array.isArray(item.rect) ? item.rect.map(Number) : null;
      if (!rect || rect.length !== 4 || !rect.every(isFinite)) {
        fail(where + ".rect is [x, y, width, height] in em");
      }
      return transformShapes(capturedShapes(item.cell, where), fitMatrix(viewBoxOf(item.cell.viewBox), rect), { precision: 6 });
    }
    if (item.type === "line") {
      var x = num(item.x, "x");
      var y = num(item.y, "y");
      var len = num(item.len, "len");
      var angle = num(item.angleDeg !== undefined ? item.angleDeg : item.angle || 0, "angleDeg");
      if (!item.cell) {
        var r = angle * Math.PI / 180;
        return ["M" + fmt(x, 6) + " " + fmt(y, 6) + "L" + fmt(x + len * Math.cos(r), 6) + " " + fmt(y + len * Math.sin(r), 6)];
      }
      var box = viewBoxOf(item.cell.viewBox);
      var thickness = item.w !== undefined ? num(item.w, "w") : len * box[3] / box[2];
      var local = fitMatrix(box, [0, -thickness / 2, len, thickness]);
      return transformShapes(capturedShapes(item.cell, where), multiply(translate(x, y), multiply(rotate(angle), local)), { precision: 6 });
    }
    if (item.type === "ring") {
      var cx = num(item.cx, "cx");
      var cy = num(item.cy, "cy");
      var rx = Math.abs(num(item.rx, "rx"));
      var ry = Math.abs(num(item.ry, "ry"));
      if (!item.cell) {
        return [{ ellipse: [cx, cy, rx, ry] }];
      }
      return transformShapes(capturedShapes(item.cell, where), fitMatrix(viewBoxOf(item.cell.viewBox), [cx - rx, cy - ry, 2 * rx, 2 * ry]),
        { precision: 6 });
    }
    fail(where + ".type is box, line or ring (got " + JSON.stringify(item.type) + ")");
  }

  /* 화면에서 잡은 조립 자모 → 독립 칸 { parts, provenance }. capture: { key, pieces: [{ id, label, items: [...] }], recipe, from: { set,
   * revision } }. 모든 조각의 중심선 범위를 비율 그대로 칸(0–100, 안쪽 여백 margin 기본 10)에 맞춘다 — 런타임이 칸 범위를 자모 자리에
   * 다시 늘이므로 모양은 그대로다. 조각마다 부분 하나, 출처는 detached */
  function detachFromCapture(capture, options) {
    if (!isObject(capture) || !Array.isArray(capture.pieces)) {
      fail("detachFromCapture needs { key, pieces: [{ id, label, items }] }");
    }
    if (capture.key !== undefined) {
      checkKey(capture.key);
    }
    var margin = options && options.margin !== undefined ? Number(options.margin) : 10;
    var pieces = capture.pieces.map(function (piece, index) {
      var where = "pieces[" + index + "]";
      if (!isObject(piece) || !Array.isArray(piece.items)) {
        fail(where + " needs { id, label, items }");
      }
      var shapes = [];
      piece.items.forEach(function (item, at) {
        itemShapes(item, where + ".items[" + at + "]").forEach(function (shape) {
          shapes.push(shape);
        });
      });
      return { id: piece.id, label: piece.label, shapes: shapes };
    }).filter(function (piece) {
      return piece.shapes.length;
    });
    var all = [];
    pieces.forEach(function (piece) {
      all = all.concat(piece.shapes);
    });
    var box = boundsOf(all);
    if (!box) {
      fail("captured pieces have no shapes");
    }
    var size = Math.max(box[2] - box[0], box[3] - box[1]);
    var k = size > 0 ? (100 - 2 * margin) / size : 1;
    var fit = [k, 0, 0, k, 50 - (box[0] + box[2]) / 2 * k, 50 - (box[1] + box[3]) / 2 * k];
    var ids = {};
    var parts = pieces.map(function (piece, index) {
      var id = cleanPartId(piece.id);
      if (!id || ids[id]) {
        id = "p" + (index + 1);
      }
      ids[id] = true;
      return { id: id, label: cleanLabel(piece.label, cleanLabel(piece.id, "조각 " + (index + 1))), shapes: transformShapes(piece.shapes, fit) };
    });
    var from = isObject(capture.from) ? capture.from : {};
    var provenance = {
      origin: "detached",
      from: { recipe: capture.recipe || null, parts: parts.map(function (part) { return part.id; }) },
      at: options && typeof options.at === "string" ? options.at : new Date().toISOString()
    };
    if (provenance.from.recipe === null) {
      delete provenance.from.recipe;
    }
    if (typeof from.set === "string") {
      provenance.from.set = from.set;
    }
    if (typeof from.revision === "string") {
      provenance.from.revision = from.revision;
    }
    return normalizeCell({ parts: parts, provenance: provenance }, "cells." + (capture.key || "?"));
  }

  // ── SVG 가져오기 검사(§18.1) ─────────────────────────────────────────

  var SHAPE_ELEMENTS = { path: true, line: true, polyline: true, polygon: true, rect: true, circle: true, ellipse: true };
  var CONTAINER_ELEMENTS = { svg: true, g: true };
  /* 버리고 rejected에 적는 요소 — 무엇이 위험한지 사람이 알게 */
  var REJECT_ELEMENTS = {
    script: ["script", "<script> 제거 — 스크립트는 받지 않음"],
    foreignobject: ["foreign-object", "<foreignObject> 제거 — HTML 끼워 넣기는 받지 않음"],
    text: ["text", "<text> 제거 — 글꼴에 기대는 글자는 받지 않음(도형으로 바꿔 넣기)"],
    tspan: ["text", "<tspan> 제거 — 글꼴에 기대는 글자는 받지 않음"],
    textpath: ["text", "<textPath> 제거 — 글꼴에 기대는 글자는 받지 않음"],
    image: ["image", "<image> 제거 — 그림 파일·외부 자원은 받지 않음"],
    use: ["reference", "<use> 제거 — 참조로 그리는 도형은 받지 않음(도형을 직접 넣기)"],
    style: ["style", "<style> 제거 — 스타일시트는 받지 않음"],
    iframe: ["foreign-object", "<iframe> 제거 — 끼워 넣기는 받지 않음"],
    a: ["reference", "<a> 제거 — 링크와 그 안의 도형은 받지 않음"]
  };
  /* 조용히 건너뛰는 요소(설명·메타데이터) */
  var QUIET_ELEMENTS = { title: true, desc: true, metadata: true };
  /* 받지만 그림과 무관해 조용히 넘기는 속성 */
  var QUIET_ATTRIBUTES = {
    id: true, "class": true, xmlns: true, version: true, baseprofile: true, "stroke-width": true, "stroke-linecap": true,
    "stroke-linejoin": true, "stroke-miterlimit": true, "fill-rule": true, "clip-rule": true, "fill-opacity": true,
    "stroke-opacity": true, opacity: true, color: true, "vector-effect": true, "shape-rendering": true, preserveaspectratio: true,
    role: true, focusable: true, "enable-background": true, overflow: true, "xml:space": true, "xml:lang": true, lang: true
  };
  var GEOMETRY_ATTRIBUTES = {
    d: true, points: true, x: true, y: true, x1: true, y1: true, x2: true, y2: true, width: true, height: true, cx: true, cy: true,
    r: true, rx: true, ry: true, viewbox: true, transform: true, fill: true, stroke: true, display: true, visibility: true
  };

  function decodeEntities(value) {
    return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, function (all, body) {
      if (body.charAt(0) === "#") {
        var code = body.charAt(1) === "x" || body.charAt(1) === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" }[body];
    });
  }

  /* 길이: 숫자(px 꼬리 허용). 다른 단위(%·em·mm…)는 NaN — 그 요소를 건너뛴다 */
  function readLength(value) {
    if (value === undefined) {
      return undefined;
    }
    var match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px)?\s*$/.exec(value);
    return match ? Number(match[1]) : NaN;
  }

  function readNumbers(value) {
    var text = String(value || "").trim();
    if (!text) {
      return [];
    }
    var out = [];
    var at = 0;
    while (at < text.length) {
      while (at < text.length && SEPARATOR.test(text.charAt(at))) {
        at += 1;
      }
      if (at >= text.length) {
        break;
      }
      NUMBER_AT.lastIndex = at;
      var match = NUMBER_AT.exec(text);
      if (!match) {
        return null;
      }
      out.push(Number(match[0]));
      at = NUMBER_AT.lastIndex;
    }
    return out;
  }

  /* transform 목록 → 행렬. matrix·translate·scale·rotate·skewX·skewY만. 모르는 꼴이면 null */
  function readTransform(value) {
    var text = String(value || "").trim();
    var m = IDENTITY;
    var pattern = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/gy;
    var at = 0;
    while (at < text.length) {
      pattern.lastIndex = at;
      var match = pattern.exec(text);
      if (!match) {
        return null;
      }
      at = pattern.lastIndex;
      var args = readNumbers(match[2]);
      if (!args || !args.every(isFinite)) {
        return null;
      }
      var name = match[1];
      var step;
      if (name === "matrix" && args.length === 6) {
        step = args;
      } else if (name === "translate" && (args.length === 1 || args.length === 2)) {
        step = translate(args[0], args[1] || 0);
      } else if (name === "scale" && (args.length === 1 || args.length === 2)) {
        step = scale(args[0], args.length === 2 ? args[1] : args[0]);
      } else if (name === "rotate" && (args.length === 1 || args.length === 3)) {
        step = args.length === 3 ? rotate(args[0], args[1], args[2]) : rotate(args[0]);
      } else if ((name === "skewX" || name === "skewY") && args.length === 1) {
        var t = Math.tan(args[0] * Math.PI / 180);
        step = name === "skewX" ? [1, 0, t, 1, 0, 0] : [1, t, 0, 1, 0, 0];
      } else {
        return null;
      }
      m = multiply(m, step);
    }
    return m;
  }

  function isNonePaint(value) {
    var text = String(value).trim().toLowerCase();
    return text === "none" || text === "transparent";
  }

  /* SVG 글 → { ok, shapes, warnings, rejected, refused, viewBox, commands }. 도형은 0–100 칸 좌표(viewBox를 비율 그대로 가운데에
   * 맞춤 — 없으면 width·height, 그것도 없으면 그림 범위). warnings는 사람이 읽을 한국어 글(rejected도 모두 들어간다),
   * rejected는 [{ code, element, attribute?, message }]. 상한을 넘거나 읽을 수 없으면 refused { code, message }이고 도형은 없다.
   * 경로 데이터만 준 글(M…)도 칸 좌표 그대로 받는다. options: { maxBytes, maxCommands, maxDepth, precision } */
  function sanitizeSvg(text, options) {
    var opts = Object.assign({ maxBytes: LIMITS.maxBytes, maxCommands: LIMITS.maxCommands, maxDepth: LIMITS.maxDepth,
      precision: PRECISION }, options || {});
    var result = { ok: false, shapes: [], warnings: [], rejected: [], refused: null, viewBox: null, commands: 0 };
    var warned = {};
    var warn = function (message) {
      if (warned[message]) {
        warned[message].count += 1;
        return;
      }
      warned[message] = { count: 1, index: result.warnings.length };
      result.warnings.push(message);
    };
    var reject = function (code, element, attribute, message) {
      var entry = { code: code, element: element };
      if (attribute) {
        entry.attribute = attribute;
      }
      entry.message = message;
      result.rejected.push(entry);
      warn(message);
    };
    var refuse = function (code, message) {
      result.refused = { code: code, message: message };
      result.shapes = [];
      result.ok = false;
      return finish();
    };
    var finish = function () {
      Object.keys(warned).forEach(function (message) {
        if (warned[message].count > 1) {
          result.warnings[warned[message].index] = message + " (" + warned[message].count + "곳)";
        }
      });
      return result;
    };

    if (typeof text !== "string") {
      return refuse("not-text", "SVG 글이 아님");
    }
    var bytes = utf8Length(text);
    if (bytes > opts.maxBytes) {
      return refuse("too-large", "SVG가 너무 큼 — " + bytes + "바이트(상한 " + opts.maxBytes + ")");
    }
    var source = text.replace(/^﻿/, "");
    var trimmed = source.trim();
    if (!trimmed) {
      return refuse("empty", "빈 글");
    }

    var collected = [];
    var budget = function (count) {
      result.commands += count;
      return result.commands <= opts.maxCommands;
    };
    var tooMany = function () {
      return refuse("too-many-commands", "경로 명령이 너무 많음 — " + result.commands + "개 넘음(상한 " + opts.maxCommands + ")");
    };

    if (trimmed.charAt(0) !== "<") {
      if (!PATH_DATA.test(trimmed)) {
        return refuse("not-svg", "<svg>도 경로 데이터도 아님");
      }
      var bare;
      try {
        bare = readPath(trimmed, opts.maxCommands);
      } catch (error) {
        return refuse("bad-path", "경로 데이터를 읽지 못함 — " + error.message.replace(/^font-studio-draw: /, ""));
      }
      if (bare.truncated || !budget(bare.commands)) {
        result.commands = Math.max(result.commands, bare.commands);
        return tooMany();
      }
      warn("SVG가 아니라 경로 데이터로 읽음 — 칸 좌표(0–100) 그대로");
      result.viewBox = [0, 0, 100, 100];
      result.shapes = [serializePath(bare.segments, opts.precision)];
      result.ok = true;
      return finish();
    }

    var stack = [];
    var at = 0;
    var length = source.length;
    var rootBox = null;
    var rootSize = null;
    var NAME_AT = /<([A-Za-z_][\w:.-]*)/y;
    var ATTR_AT = /\s*([^\s=>\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/y;
    var CLOSE_AT = /<\/\s*([^\s>]+)\s*>/y;

    var localName = function (name) {
      var lower = name.toLowerCase();
      var colon = lower.indexOf(":");
      return { prefix: colon >= 0 ? lower.slice(0, colon) : "", local: colon >= 0 ? lower.slice(colon + 1) : lower };
    };

    /* 속성 하나 — 위험한 것은 skip이어도 적는다. 받은 값은 frame.attrs에 */
    var checkAttribute = function (element, rawName, value, frame) {
      var name = rawName.toLowerCase();
      var colon = name.indexOf(":");
      var local = colon >= 0 ? name.slice(colon + 1) : name;
      if (/^on/.test(local)) {
        reject("event-attribute", element, rawName, rawName + " 속성 제거 — 이벤트 속성은 받지 않음");
        return;
      }
      if (local === "href" || local === "src") {
        reject("reference", element, rawName, rawName + " 속성 제거 — 외부·내부 참조는 받지 않음");
        return;
      }
      if (local === "style") {
        reject("style", element, rawName, "style 속성 제거 — 임의 CSS는 받지 않음(fill·stroke 속성으로 쓰기)");
        return;
      }
      if (name === "xmlns" || name.indexOf("xmlns:") === 0) {
        return;
      }
      if (/url\s*\(/i.test(value)) {
        reject("url", element, rawName, rawName + "의 url() 제거 — 외부·내부 참조는 받지 않음");
        if (local === "fill" || local === "stroke") {
          frame.attrs[local] = "currentColor";
        }
        return;
      }
      if (/javascript\s*:/i.test(value)) {
        reject("javascript", element, rawName, rawName + " 속성 제거 — javascript: 값은 받지 않음");
        return;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())) {
        reject("external", element, rawName, rawName + " 속성 제거 — 외부 주소는 받지 않음");
        return;
      }
      if (colon >= 0 && name.indexOf("xml:") !== 0) {
        return;
      }
      if (QUIET_ATTRIBUTES[name] || /^(?:data|aria)-/.test(name)) {
        return;
      }
      if (GEOMETRY_ATTRIBUTES[name]) {
        frame.attrs[name] = value;
        return;
      }
      if (!frame.skip) {
        warn(rawName + " 속성 무시 — 그림 칸에 쓰지 않음");
      }
    };

    var push = function (shape, frame, commands) {
      if (!budget(commands)) {
        return false;
      }
      collected.push({ shape: shape, ctm: frame.ctm });
      return true;
    };

    /* 도형 요소 하나 → 도형(그 요소 좌표). 칠·윤곽은 이어받은 fill·stroke로: 윤곽이 있으면 중심선, 없고 칠만 있으면 채운 윤곽.
     * line·polyline은 늘 중심선 */
    var emitShape = function (local, frame) {
      var a = frame.attrs;
      var fill = a.fill !== undefined ? a.fill : frame.fill;
      var stroke = a.stroke !== undefined ? a.stroke : frame.stroke;
      var painted = { fill: fill === undefined || fill === null ? true : !isNonePaint(fill),
        stroke: stroke === undefined || stroke === null ? false : !isNonePaint(stroke) };
      var line = local === "line" || local === "polyline";
      var filled = !line && !painted.stroke && painted.fill;
      if (!line && !painted.stroke && !painted.fill) {
        warn("<" + local + "> 건너뜀 — fill·stroke가 모두 none");
        return true;
      }
      if (!line && painted.stroke && painted.fill && a.fill !== undefined && !isNonePaint(a.fill)) {
        warn("<" + local + "> 윤곽선(stroke)으로 읽음 — 칠(fill)은 버림");
      }
      var lengths = {};
      var bad = false;
      ["x", "y", "x1", "y1", "x2", "y2", "width", "height", "cx", "cy", "r", "rx", "ry"].forEach(function (key) {
        var value = readLength(a[key]);
        if (value !== undefined && !isFinite(value)) {
          bad = true;
        }
        lengths[key] = value;
      });
      if (bad) {
        warn("<" + local + "> 건너뜀 — 단위가 있는 길이는 받지 않음(숫자·px만)");
        return true;
      }
      var get = function (key) {
        return lengths[key] === undefined ? 0 : lengths[key];
      };
      var asPath = function (segments) {
        var d = serializePath(segments, 9);
        return filled ? { d: d, fill: true } : d;
      };
      var asEllipse = function (values) {
        return filled ? { ellipse: values, fill: true } : { ellipse: values };
      };
      if (local === "path") {
        if (a.d === undefined || !a.d.trim()) {
          return true;
        }
        var parsed;
        try {
          parsed = readPath(a.d, opts.maxCommands - result.commands);
        } catch (error) {
          warn("<path> 건너뜀 — 경로 데이터를 읽지 못함");
          return true;
        }
        if (parsed.truncated) {
          result.commands += parsed.commands;
          return false;
        }
        return push(asPath(parsed.segments), frame, parsed.commands);
      }
      if (local === "line") {
        return push(asPath([{ c: "M", p: [get("x1"), get("y1")] }, { c: "L", p: [get("x2"), get("y2")] }]), frame, 2);
      }
      if (local === "polyline" || local === "polygon") {
        var numbers = readNumbers(a.points);
        if (!numbers || numbers.length < 4) {
          warn("<" + local + "> 건너뜀 — points를 읽지 못함");
          return true;
        }
        var segments = [];
        for (var index = 0; index + 1 < numbers.length; index += 2) {
          segments.push({ c: index ? "L" : "M", p: [numbers[index], numbers[index + 1]] });
        }
        if (local === "polygon") {
          segments.push({ c: "Z", p: [] });
        }
        return push(asPath(segments), frame, segments.length);
      }
      if (local === "rect") {
        var w = get("width");
        var h = get("height");
        if (!(w > 0) || !(h > 0)) {
          return true;
        }
        var x = get("x");
        var y = get("y");
        var rx = lengths.rx;
        var ry = lengths.ry;
        rx = rx === undefined ? ry : rx;
        ry = ry === undefined ? rx : ry;
        rx = Math.min(Math.max(rx || 0, 0), w / 2);
        ry = Math.min(Math.max(ry || 0, 0), h / 2);
        var rect = rx > 0 && ry > 0 ? [
          { c: "M", p: [x + rx, y] }, { c: "L", p: [x + w - rx, y] }, { c: "A", p: [rx, ry, 0, 0, 1, x + w, y + ry] },
          { c: "L", p: [x + w, y + h - ry] }, { c: "A", p: [rx, ry, 0, 0, 1, x + w - rx, y + h] }, { c: "L", p: [x + rx, y + h] },
          { c: "A", p: [rx, ry, 0, 0, 1, x, y + h - ry] }, { c: "L", p: [x, y + ry] }, { c: "A", p: [rx, ry, 0, 0, 1, x + rx, y] },
          { c: "Z", p: [] }
        ] : [{ c: "M", p: [x, y] }, { c: "L", p: [x + w, y] }, { c: "L", p: [x + w, y + h] }, { c: "L", p: [x, y + h] }, { c: "Z", p: [] }];
        return push(asPath(rect), frame, rect.length);
      }
      if (local === "circle" || local === "ellipse") {
        var erx = local === "circle" ? get("r") : lengths.rx === undefined ? lengths.ry : lengths.rx;
        var ery = local === "circle" ? get("r") : lengths.ry === undefined ? lengths.rx : lengths.ry;
        if (!(erx > 0) || !(ery > 0)) {
          return true;
        }
        return push(asEllipse([get("cx"), get("cy"), erx, ery]), frame, 1);
      }
      return true;
    };

    var openElement = function (rawName, attrs, selfClosing) {
      var parent = stack[stack.length - 1] || null;
      var names = localName(rawName);
      var local = names.local;
      var frame = {
        name: rawName,
        skip: parent ? parent.skip : false,
        ctm: parent ? parent.ctm : IDENTITY,
        fill: parent ? parent.fill : undefined,
        stroke: parent ? parent.stroke : undefined,
        attrs: {}
      };
      if (stack.length >= opts.maxDepth) {
        return "depth";
      }
      var rule = REJECT_ELEMENTS[local];
      if (rule) {
        reject(rule[0], rawName, null, rule[1]);
        frame.skip = true;
      } else if (names.prefix && names.prefix !== "svg") {
        frame.skip = true;
      } else if (QUIET_ELEMENTS[local]) {
        frame.skip = true;
      } else if (!SHAPE_ELEMENTS[local] && !CONTAINER_ELEMENTS[local]) {
        if (!frame.skip) {
          warn("<" + rawName + "> 건너뜀 — 지원하지 않는 요소");
        }
        frame.skip = true;
      }
      attrs.forEach(function (attr) {
        checkAttribute(rawName, attr[0], attr[1], frame);
      });
      if (!frame.skip) {
        var a = frame.attrs;
        if (a.display !== undefined && a.display.trim().toLowerCase() === "none") {
          warn("<" + rawName + "> 건너뜀 — display=\"none\"");
          frame.skip = true;
        }
      }
      if (!frame.skip) {
        if (local === "svg") {
          if (!parent && !rootBox && !rootSize) {
            var vb = frame.attrs.viewbox !== undefined ? readNumbers(frame.attrs.viewbox) : null;
            if (vb && vb.length === 4 && vb.every(isFinite) && vb[2] > 0 && vb[3] > 0) {
              rootBox = vb;
            } else {
              if (frame.attrs.viewbox !== undefined) {
                warn("viewBox를 읽지 못함");
              }
              var sw = readLength(frame.attrs.width);
              var sh = readLength(frame.attrs.height);
              if (sw > 0 && sh > 0) {
                rootSize = [0, 0, sw, sh];
              }
            }
          } else if (parent) {
            warn("안쪽 <svg>는 묶음(g)처럼 읽음 — viewBox·위치 무시");
          }
        }
        if (frame.attrs.transform !== undefined) {
          var m = readTransform(frame.attrs.transform);
          if (!m) {
            warn("<" + rawName + "> 건너뜀 — 읽을 수 없는 transform");
            frame.skip = true;
          } else {
            frame.ctm = multiply(frame.ctm, m);
          }
        }
      }
      if (!frame.skip) {
        if (frame.attrs.fill !== undefined) {
          frame.fill = frame.attrs.fill;
        }
        if (frame.attrs.stroke !== undefined) {
          frame.stroke = frame.attrs.stroke;
        }
        if (SHAPE_ELEMENTS[local] && !emitShape(local, frame)) {
          return "commands";
        }
      }
      if (!selfClosing) {
        stack.push(frame);
        /* script·style 안의 글은 태그로 읽지 않는다 — 닫는 태그까지 건너뛴다 */
        if (local === "script" || local === "style") {
          var close = source.toLowerCase().indexOf("</" + rawName.toLowerCase(), at);
          at = close < 0 ? length : close;
        }
      }
      return null;
    };

    while (at < length) {
      var lt = source.indexOf("<", at);
      if (lt < 0) {
        break;
      }
      if (source.startsWith("<!--", lt)) {
        var endComment = source.indexOf("-->", lt + 4);
        at = endComment < 0 ? length : endComment + 3;
        continue;
      }
      if (source.startsWith("<![CDATA[", lt)) {
        var endData = source.indexOf("]]>", lt + 9);
        at = endData < 0 ? length : endData + 3;
        continue;
      }
      if (/^<!doctype/i.test(source.slice(lt, lt + 9))) {
        var scan = lt + 9;
        var bracket = false;
        while (scan < length && (source.charAt(scan) !== ">" || bracket)) {
          if (source.charAt(scan) === "[") {
            bracket = true;
          } else if (source.charAt(scan) === "]") {
            bracket = false;
          }
          scan += 1;
        }
        reject("doctype", "!DOCTYPE", null, "DOCTYPE 무시 — 엔티티 선언·외부 문서 정의는 받지 않음");
        at = scan + 1;
        continue;
      }
      if (source.startsWith("<?", lt)) {
        var endPi = source.indexOf("?>", lt + 2);
        if (/^<\?xml-stylesheet/i.test(source.slice(lt, lt + 16))) {
          reject("stylesheet", "?xml-stylesheet", null, "<?xml-stylesheet?> 제거 — 외부 스타일시트는 받지 않음");
        }
        at = endPi < 0 ? length : endPi + 2;
        continue;
      }
      if (source.charAt(lt + 1) === "/") {
        CLOSE_AT.lastIndex = lt;
        var closing = CLOSE_AT.exec(source);
        if (!closing) {
          return refuse("malformed", "닫는 태그를 읽지 못함");
        }
        at = CLOSE_AT.lastIndex;
        for (var depth = stack.length - 1; depth >= 0; depth -= 1) {
          if (stack[depth].name === closing[1]) {
            stack.length = depth;
            break;
          }
        }
        continue;
      }
      NAME_AT.lastIndex = lt;
      var opening = NAME_AT.exec(source);
      if (!opening) {
        at = lt + 1;
        continue;
      }
      at = NAME_AT.lastIndex;
      var attrs = [];
      var selfClosing = false;
      var closed = false;
      while (at < length) {
        while (at < length && /\s/.test(source.charAt(at))) {
          at += 1;
        }
        if (source.charAt(at) === ">") {
          at += 1;
          closed = true;
          break;
        }
        if (source.startsWith("/>", at)) {
          at += 2;
          selfClosing = true;
          closed = true;
          break;
        }
        ATTR_AT.lastIndex = at;
        var attr = ATTR_AT.exec(source);
        if (!attr || ATTR_AT.lastIndex === at) {
          return refuse("malformed", "<" + opening[1] + "> 속성을 읽지 못함");
        }
        at = ATTR_AT.lastIndex;
        var raw = attr[2] !== undefined ? attr[2] : attr[3] !== undefined ? attr[3] : attr[4] !== undefined ? attr[4] : "";
        attrs.push([attr[1], decodeEntities(raw)]);
      }
      if (!closed) {
        return refuse("malformed", "<" + opening[1] + "> 태그가 닫히지 않음");
      }
      var outcome = openElement(opening[1], attrs, selfClosing);
      if (outcome === "depth") {
        return refuse("too-deep", "요소가 너무 깊이 겹침(상한 " + opts.maxDepth + ")");
      }
      if (outcome === "commands") {
        return tooMany();
      }
    }

    if (!collected.length) {
      return refuse("no-shapes", "그릴 도형이 없음");
    }
    /* viewBox(또는 width·height, 없으면 그림 범위)를 비율 그대로 0–100 칸 가운데에 */
    var frameBox = rootBox || rootSize;
    if (!frameBox) {
      var placed = collected.map(function (item) {
        return transformShapes([item.shape], item.ctm, { precision: 9 })[0];
      });
      var bounds = boundsOf(placed);
      var pad = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) * 0.1 || 1;
      frameBox = [bounds[0] - pad, bounds[1] - pad, bounds[2] - bounds[0] + 2 * pad, bounds[3] - bounds[1] + 2 * pad];
      warn("viewBox가 없어 그림 범위를 칸에 맞춤");
    }
    result.viewBox = frameBox.slice();
    var k = 100 / Math.max(frameBox[2], frameBox[3]);
    var toCell = [k, 0, 0, k, (100 - frameBox[2] * k) / 2 - frameBox[0] * k, (100 - frameBox[3] * k) / 2 - frameBox[1] * k];
    collected.forEach(function (item) {
      var shape = transformShapes([item.shape], multiply(toCell, item.ctm), { precision: opts.precision })[0];
      var box = boundsOf([shape]);
      if (!box || box.some(function (value) { return Math.abs(value) > LIMITS.maxCoordinate; })) {
        warn("칸에서 너무 먼 도형 건너뜀");
        return;
      }
      var data = typeof shape === "string" ? shape : shape.d;
      if (data !== undefined && !PATH_DATA.test(data)) {
        return;
      }
      result.shapes.push(shape);
    });
    if (!result.shapes.length) {
      return refuse("no-shapes", "그릴 도형이 없음");
    }
    result.ok = true;
    return finish();
  }

  // ── 여러 칸 SVG 한 번에 · 한 번에 부탁하는 글 (PLAN-STUDIO-002 S5-A) ─────────────
  /* AI 답(설명 글 + <svg> 여럿)을 통째로 받아 칸마다 나눈다. 칸 이름은 차례로 본다: 뿌리 <svg>의 data-jamo · data-key · data-cell ·
   * id · aria-label → 안의 <title> → 그 SVG 바로 앞 글 줄(코드 울타리 ``` 와 빈 줄은 건너뜀). 이름 꼴은 'ㄱ' · 'ㄱ@bar' · 'ㄱ_jong' ·
   * '받침 ㄱ' · '초성 ㄱ:'이다. @cho는 바탕 칸(편집기의 'ㄱ')으로 읽는다. 도형 검사는 칸마다 sanitizeSvg 그대로다. */

  var BUNDLE_LIMITS = { maxBytes: 2000000, maxBlocks: 120 };
  var CONTEXT_SUFFIX = { cho: "", bar: "@bar", jong: "@jong" };
  var CONTEXT_NAMES = { "": "바탕", "@bar": "가로 모음 위", "@jong": "받침" };
  var NAME_ATTRIBUTES = ["data-jamo", "data-key", "data-cell", "id", "aria-label"];

  /* 칸 이름이 편집기가 고치는 칸인가 — 자모마다 contextsFor가 내는 꼬리만(@cho·원소 그림 칸은 아님) */
  function isCellKey(key) {
    var parts = splitCellKey(key);
    return Boolean(parts) && contextsFor(parts.jamo).indexOf(parts.context) >= 0;
  }

  function splitCellKey(key) {
    var text = String(key || "");
    if (!EDITABLE_KEY.test(text)) {
      return null;
    }
    var at = text.indexOf("@");
    return at < 0 ? { jamo: text, context: "" } : { jamo: text.slice(0, at), context: text.slice(at) };
  }

  /* 글 한 토막(속성 값·제목·글 줄)에서 칸 이름 → { key, note } | null(자모가 없음). 고칠 수 없는 문맥이면 key null과 까닭 */
  function readCellName(text) {
    var source = String(text || "");
    var match = /([ㄱ-ㆎ])(?:\s*[@_:.\-]?\s*(cho|bar|jong)(?![a-z]))?/i.exec(source);
    if (!match) {
      return null;
    }
    var jamo = match[1];
    var context = match[2] ? CONTEXT_SUFFIX[match[2].toLowerCase()] : null;
    var note = "";
    if (context === null) {
      context = /받침|종성|끝소리/.test(source) ? "@jong" : /가로\s*모음|위\s*꼴|위에\s*놓/.test(source) ? "@bar" : "";
    } else if (match[2].toLowerCase() === "cho") {
      note = jamo + "의 초성 칸은 바탕 칸(" + jamo + ")으로 넣음";
    }
    var key = jamo + context;
    if (contextsFor(jamo).indexOf(context) < 0) {
      return { key: null, note: jamo + "에는 " + (CONTEXT_NAMES[context] || context) + " 칸이 없음" };
    }
    return { key: key, note: note };
  }

  function readAttributes(tag) {
    var out = {};
    var pattern = /([^\s=<>\/"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/g;
    var match;
    while ((match = pattern.exec(tag))) {
      var value = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
      out[match[1].toLowerCase()] = decodeEntities(value);
    }
    return out;
  }

  /* 여는 태그 끝(>)의 자리 — 따옴표 안의 >는 건너뛴다 */
  function tagEnd(source, from) {
    var quote = "";
    for (var at = from; at < source.length; at += 1) {
      var ch = source.charAt(at);
      if (quote) {
        if (ch === quote) {
          quote = "";
        }
      } else if (ch === "\"" || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        return at;
      }
    }
    return -1;
  }

  function svgOpenAt(lower, from) {
    var pattern = /<svg(?=[\s>\/])/g;
    pattern.lastIndex = from;
    var match = pattern.exec(lower);
    return match ? match.index : -1;
  }

  /* 바로 앞 글에서 이름 줄 — 마지막 글 줄(코드 울타리·빈 줄 빼고). 주석 표시와 마크다운 꾸밈은 걷는다 */
  function labelLine(text) {
    var lines = String(text || "").replace(/<!--|-->/g, "\n").split(/\r?\n/);
    for (var index = lines.length - 1; index >= 0; index -= 1) {
      var line = lines[index].trim();
      if (!line || /^(`{3,}|~{3,})\s*[\w-]*$/.test(line)) {
        continue;
      }
      return line.replace(/^[#>*\-+\s\d.)]+/, "").replace(/[*`_]+/g, "").trim();
    }
    return "";
  }

  /* AI 답 → SVG 덩어리 [{ index, svg, key, from, label, note, closed }] — 이름을 읽지 못하면 key null. 바깥 <svg>만 덩어리다(안쪽 <svg>는
   * 그 덩어리 안). { ok, blocks, refused } */
  function splitSvgBundle(text, options) {
    var opts = Object.assign({}, BUNDLE_LIMITS, options || {});
    if (typeof text !== "string") {
      return { ok: false, blocks: [], refused: { code: "not-text", message: "SVG 글이 아님" } };
    }
    var bytes = utf8Length(text);
    if (bytes > opts.maxBytes) {
      return { ok: false, blocks: [], refused: { code: "too-large", message: "글이 너무 큼 — " + bytes + "바이트(상한 " + opts.maxBytes + ")" } };
    }
    var source = text.replace(/^﻿/, "");
    var lower = source.toLowerCase();
    var blocks = [];
    var at = 0;
    var previousEnd = 0;
    while (at < source.length) {
      var open = svgOpenAt(lower, at);
      if (open < 0) {
        break;
      }
      if (blocks.length >= opts.maxBlocks) {
        return { ok: false, blocks: [], refused: { code: "too-many", message: "SVG가 너무 많음 — 상한 " + opts.maxBlocks + "개" } };
      }
      var openEnd = tagEnd(source, open);
      var end = -1;
      if (openEnd >= 0 && source.charAt(openEnd - 1) === "/") {
        end = openEnd + 1; // <svg … />
      } else if (openEnd >= 0) {
        var depth = 1;
        var scan = openEnd + 1;
        while (scan < source.length && depth > 0) {
          var nextOpen = svgOpenAt(lower, scan);
          var nextClose = lower.indexOf("</svg", scan);
          if (nextClose < 0) {
            break;
          }
          if (nextOpen >= 0 && nextOpen < nextClose) {
            var innerEnd = tagEnd(source, nextOpen);
            if (innerEnd < 0) {
              break;
            }
            if (source.charAt(innerEnd - 1) !== "/") {
              depth += 1;
            }
            scan = innerEnd + 1;
            continue;
          }
          var closeEnd = source.indexOf(">", nextClose);
          scan = closeEnd < 0 ? source.length : closeEnd + 1;
          depth -= 1;
        }
        end = depth === 0 ? scan : -1;
      }
      var stop = end < 0 ? source.length : end;
      var block = { index: blocks.length, svg: source.slice(open, stop), key: null, from: null, label: "", note: "", closed: end >= 0 };
      var attrs = openEnd >= 0 ? readAttributes(source.slice(open + 4, openEnd)) : {};
      var named = null;
      NAME_ATTRIBUTES.some(function (name) {
        if (attrs[name] !== undefined) {
          var read = readCellName(attrs[name]);
          if (read) {
            named = { read: read, from: name, label: attrs[name] };
            return true;
          }
        }
        return false;
      });
      if (!named) {
        var title = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(block.svg);
        var titleRead = title ? readCellName(decodeEntities(title[1])) : null;
        if (titleRead) {
          named = { read: titleRead, from: "title", label: title[1].trim() };
        }
      }
      if (!named) {
        var line = labelLine(source.slice(previousEnd, open));
        var lineRead = line ? readCellName(line) : null;
        if (lineRead) {
          named = { read: lineRead, from: "text", label: line };
        }
      }
      if (named) {
        block.key = named.read.key;
        block.from = named.from;
        block.label = named.label.slice(0, 80);
        block.note = named.read.note || "";
      }
      blocks.push(block);
      previousEnd = stop;
      at = stop;
    }
    return { ok: blocks.length > 0, blocks: blocks, refused: blocks.length ? null : { code: "no-svg", message: "<svg>가 없음" } };
  }

  /* 덩어리마다 도형 검사와 넣을 칸 → { ok, complete, rows: [{ index, key, from, label, note, state, shapes, warnings, rejected,
   * refused }], cells: { 칸: 도형들 }, refused }. state: new(새 칸) · overwrite(그린 칸을 바꿈) · unknown(칸 이름 모름) ·
   * duplicate(앞 덩어리와 같은 칸 — 건너뜀) · refused(도형 검사에서 거절). options: { assign: { 덩어리 차례: 칸 | "" }(사람이 고른 칸,
   * ""는 넣지 않음), fallback(덩어리가 하나이고 이름이 없을 때 그 칸 — 편집기의 지금 칸), limits(sanitizeSvg 상한) }.
   * complete: 모든 덩어리가 new·overwrite(자동화 계약은 이때만 넣는다) */
  function bundleImport(doc, text, options) {
    var opts = options || {};
    var split = splitSvgBundle(text, opts.bundleLimits);
    var out = { ok: false, complete: false, rows: [], cells: {}, refused: split.refused };
    if (!split.ok) {
      return out;
    }
    var assign = isObject(opts.assign) ? opts.assign : {};
    var seen = {};
    split.blocks.forEach(function (block) {
      var key = block.key;
      var from = block.from;
      var skipped = false;
      if (Object.prototype.hasOwnProperty.call(assign, block.index)) {
        key = assign[block.index] || null;
        from = "chosen";
        skipped = !assign[block.index];
      } else if (!key && split.blocks.length === 1 && opts.fallback && isCellKey(opts.fallback)) {
        key = opts.fallback;
        from = "selected";
      }
      var row = { index: block.index, key: key && isCellKey(key) ? key : null, from: from, label: block.label, note: block.note,
        state: "new", shapes: 0, warnings: [], rejected: [], refused: null };
      var result = block.closed ? sanitizeSvg(block.svg, opts.limits) : { ok: false, shapes: [], warnings: [], rejected: [],
        refused: { code: "malformed", message: "</svg>로 닫히지 않음" } };
      row.warnings = result.warnings;
      row.rejected = result.rejected;
      row.shapes = result.shapes.length;
      if (!result.ok) {
        row.state = "refused";
        row.refused = result.refused;
      } else if (skipped) {
        row.state = "skipped";
      } else if (!row.key) {
        row.state = "unknown";
      } else if (seen[row.key]) {
        row.state = "duplicate";
      } else {
        seen[row.key] = true;
        row.state = doc && doc.cells && cellHasShapes(doc.cells[row.key]) ? "overwrite" : "new";
        out.cells[row.key] = result.shapes;
      }
      out.rows.push(row);
    });
    out.ok = Object.keys(out.cells).length > 0;
    out.complete = out.rows.every(function (row) {
      return row.state === "new" || row.state === "overwrite";
    });
    return out;
  }

  /* 한 번에 부탁할 칸 — 지금 단계(progress.next)의 남은 자모(원형 8 단계면 그리지 않은 ㆍ도), 단계 목록 차례. 다 그렸으면 [] */
  function promptTargets(state) {
    if (!isObject(state) || !Array.isArray(state.stages)) {
      fail("promptTargets needs { progress } from FontKku.authoringProgress");
    }
    var row = null;
    state.stages.forEach(function (item) {
      if (item.stage === state.next) {
        row = item;
      }
    });
    var keys = row ? row.missing.slice() : [];
    if (state.helper && !state.helper.drawn && (state.next === "origin8" || !state.next)) {
      keys.push(state.helper.jamo || HELPER);
    }
    return keys;
  }

  /* 칸 여럿을 한 번에 그려 달라는 글 — 답의 꼴은 splitSvgBundle이 읽는 꼴(뿌리 <svg>의 data-jamo). options: { stroke } */
  function bundlePrompt(keys, options) {
    var list = (keys || []).filter(isCellKey);
    if (!list.length) {
      fail("bundlePrompt needs at least one editable cell key");
    }
    var stroke = options && Number(options.stroke) > 0 ? Number(options.stroke) : DEFAULT_OPTIONS.stroke;
    var n = list.length;
    var named = list.map(function (key) {
      var parts = splitCellKey(key);
      return parts.context ? key + "(" + parts.jamo + "의 " + CONTEXT_NAMES[parts.context] + " 꼴)" : key;
    });
    var lines = [
      "한글 자모 " + n + "개를 SVG로 그려 주세요: " + named.join(" "),
      "- 자모마다 <svg data-jamo=\"…\" viewBox=\"0 0 100 100\"> … </svg> 하나씩, 모두 " + n + "개. data-jamo에는 위 이름을 그대로 적습니다" +
        " — 예: <svg data-jamo=\"" + list[0] + "\" viewBox=\"0 0 100 100\">",
      "- " + n + "개가 한 벌로 보이게: 굵기·획 끝·크기·손맛을 같게. 자모가 칸을 거의 채우게.",
      "- 안에는 path·line·polyline·polygon·rect·circle·ellipse와 g(transform은 translate·scale·rotate·matrix)만",
      "- 획은 중심선: fill=\"none\" stroke=\"#000\" stroke-width=\"" + stroke + "\" stroke-linecap=\"round\" (채운 모양은 fill만)",
      "- 글자(text)·그림(image)·use·style·script·외부 참조·url() 없이, 획 하나에 요소 하나"
    ];
    if (list.indexOf(HELPER) >= 0) {
      lines.push("- ㆍ는 천지인의 점(아래아)입니다 — 칸 가운데 작은 점이나 짧은 획 하나.");
    }
    if (list.some(function (key) { return key.indexOf("@") > 0; })) {
      lines.push("- @bar는 가로 모음(ㅗ·ㅡ 계열) 위에 놓이는 납작한 꼴, @jong은 받침 자리 꼴입니다.");
    }
    lines.push("- 설명 없이 SVG " + n + "개만 차례로 답해 주세요.");
    return lines.join("\n");
  }

  // ── 다 그린 칸만 보기 (S5-A) ─────────────────────────────────────

  var HORIZONTAL_VOWELS = "ㅗㅛㅜㅠㅡ";

  /* 글자 하나의 자모 요청 [{ jamo, role, context, hasFinal }] — 음절은 초·중·종성(초성은 가로 모음 앞이면 bar 문맥), 호환 자모는
   * 낱자 하나. 한글이 아니면 null */
  function glyphRequests(ch) {
    var code = String(ch || "").charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      var index = code - 0xac00;
      var vowel = JUNG.charAt(Math.floor((index % 588) / 28));
      var final = index % 28 ? JONG.charAt(index % 28) : "";
      var list = [
        { jamo: CHO.charAt(Math.floor(index / 588)), role: "initial", context: HORIZONTAL_VOWELS.indexOf(vowel) >= 0 ? "bar" : "cho", hasFinal: Boolean(final) },
        { jamo: vowel, role: "medial", context: "", hasFinal: Boolean(final) }
      ];
      if (final) {
        list.push({ jamo: final, role: "final", context: "jong", hasFinal: true });
      }
      return list;
    }
    if (code >= 0x3131 && code <= 0x318e) {
      var isVowel = code >= 0x314f && code <= 0x3163;
      if (FINAL_ONLY.indexOf(ch) >= 0) {
        return [{ jamo: ch, role: "final", context: "jong", hasFinal: true }];
      }
      return [{ jamo: ch, role: isVowel ? "medial" : "initial", context: isVowel ? "" : "cho", hasFinal: false }];
    }
    return null;
  }

  /* planJamo 결과가 그린 칸만으로 지어지는가 — 모든 기록 줄이 direct·composed이고, direct는 fromDoc(소스 id)가 참 */
  function planUsesDrawnOnly(plan, fromDoc) {
    var trace = plan && Array.isArray(plan.trace) ? plan.trace : [];
    return trace.length > 0 && trace.every(function (entry) {
      if (entry.result === "composed") {
        return true;
      }
      return entry.result === "direct" && typeof fromDoc === "function" && Boolean(fromDoc(entry.effectiveSource || entry.source));
    });
  }

  /* 다 그린 칸으로 지을 수 있는 글자만 남긴 글 → { text, total, kept, dropped: [못 짓는 한글 글자, 처음 나온 차례] }. 한글이 아닌 글자
   * (기기 글꼴로 그림)도 빼고, 빈칸은 하나로 모은다. canDraw(요청) → 참/거짓 */
  function drawnOnlyText(text, canDraw) {
    var kept = [];
    var dropped = [];
    var total = 0;
    var count = 0;
    Array.from(String(text || "")).forEach(function (ch) {
      if (/\s/.test(ch)) {
        kept.push(ch === "\n" ? "\n" : " ");
        return;
      }
      var requests = glyphRequests(ch);
      if (!requests) {
        return;
      }
      total += 1;
      if (requests.every(function (request) { return Boolean(canDraw(request)); })) {
        kept.push(ch);
        count += 1;
      } else if (dropped.indexOf(ch) < 0) {
        dropped.push(ch);
      }
    });
    var out = kept.join("").replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
    return { text: out, total: total, kept: count, dropped: dropped };
  }

  var FontStudioDrawModel = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    SET_PREFIX: SET_PREFIX,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    LIMITS: LIMITS,
    STAGES: STAGES,
    STAGE_LABELS: STAGE_LABELS,
    STATUS_TEXT: STATUS_TEXT,
    HELPER: HELPER,
    Matrix: Matrix,
    stableJson: stableJson,
    fnv1a: fnv1a,
    // 문서
    createDoc: createDoc,
    normalizeDoc: normalizeDoc,
    isDoc: isDoc,
    isEmpty: isEmpty,
    newSetName: newSetName,
    isEditableKey: isEditableKey,
    baseOf: baseOf,
    cellKeys: cellKeys,
    setCell: setCell,
    removeCell: removeCell,
    setPart: setPart,
    removePart: removePart,
    movePart: movePart,
    scalePart: scalePart,
    rotatePart: rotatePart,
    transformPart: transformPart,
    originOf: originOf,
    toCells: toCells,
    registerOptions: registerOptions,
    register: register,
    docRevision: docRevision,
    cellsRevision: cellsRevision,
    // 기하
    normalizeShape: normalizeShape,
    parsePath: parsePath,
    readPath: readPath,
    serializePath: serializePath,
    transformSegments: transformSegments,
    arcToCubics: arcToCubics,
    transformShapes: transformShapes,
    boundsOf: boundsOf,
    ellipseData: ellipseData,
    rdp: rdp,
    polylineData: polylineData,
    freehandData: freehandData,
    // 가져오기·진행·제안·떼어 내기
    sanitizeSvg: sanitizeSvg,
    // 여러 칸 한 번에·한 번에 부탁하는 글·다 그린 칸만 보기(S5-A)
    BUNDLE_LIMITS: BUNDLE_LIMITS,
    CONTEXT_NAMES: CONTEXT_NAMES,
    isCellKey: isCellKey,
    readCellName: readCellName,
    splitSvgBundle: splitSvgBundle,
    bundleImport: bundleImport,
    promptTargets: promptTargets,
    bundlePrompt: bundlePrompt,
    glyphRequests: glyphRequests,
    planUsesDrawnOnly: planUsesDrawnOnly,
    drawnOnlyText: drawnOnlyText,
    progress: progress,
    sentenceCounts: sentenceCounts,
    proposals: proposals,
    contextsFor: contextsFor,
    keysFor: keysFor,
    detachFromCapture: detachFromCapture
  };

  global.FontStudioDrawModel = FontStudioDrawModel;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioDrawModel;
  }
})(typeof window !== "undefined" ? window : globalThis);
