/* font-kku-export — 폰꾸가 조립한 한글을 글꼴 파일(TTF·WOFF)로 내보낸다 (ADR-015).
 *
 * 그림 자소 글꼴(자소판 PNG·SVG)과 벡터 자소(jamo-set)는 자모 그림과 글꼴 CSS의 자리
 * 배치로 한글을 그린다. 이 모듈은 그 둘을 보통 글꼴 파일로 옮긴다 — 런타임 없이 워드·
 * 디자인 도구·다른 사이트에서 쓰는 "내 손글씨 글꼴"이 된다.
 *
 *   1. 자리 변환   숨긴 바탕 요소로 음절을 조립하고, 자모 노드마다 칸 모서리 표식 셋의
 *                  위치를 읽어 칸 → 글자 아핀 변환을 구한다(회전·기울기도 잡힌다).
 *   2. 칸 외곽선   칸 그림을 캔버스에 크게 그리고(자소판 칸, 벡터 칸 모두) 알파에서
 *                  외곽선을 딴다 — 보간 마칭 스퀘어, 닫힌 윤곽 연결, Ramer–Douglas–Peucker
 *                  단순화. 재료와 상관없이 같은 길이라 손글씨 PNG도 된다.
 *   3. 글꼴       칸은 단순 글리프, 음절은 "칸 부품 + 변환" 복합 글리프(TrueType). 문맥
 *                  잘림(clip-path inset)이 걸린 노드는 잘라 낸 외곽선으로 따로 글리프를 만든다.
 *
 * 순수 함수(traceAlpha·simplify·clipToRect·buildTrueType·toWoff)는 Node에서도 돈다.
 * exportFont()는 브라우저 전용이고 폰꾸 런타임(window.FontKku)과 글꼴 CSS가 그 문서에
 * 실려 있어야 한다. 자소판은 같은 출처에서 와야 캔버스 픽셀을 읽을 수 있다(file:// 불가). */
(function (global) {
  "use strict";

  var UPM = 1000;
  /* 칸(0–100)의 위 = y 880, 아래 = y −120 — CJK 글꼴의 표준 em 상자. */
  var CELL_TOP = 880;
  var ASCENT = 1000;
  var DESCENT = 280;
  var SYLLABLE_FIRST = 0xac00;
  var SYLLABLE_LAST = 0xd7a3;
  var COMPAT_JAMO = "ㄱㄲㄳㄴㄵㄶㄷㄸㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅃㅄㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";

  // ── 외곽선 따기 ────────────────────────────────────────────

  /* 보간 마칭 스퀘어. alpha는 width×height 바이트(0–255, 행 우선). 픽셀 좌표(y 아래)의
   * 닫힌 윤곽 목록을 돌려준다. 안쪽이 진행 방향의 왼쪽(화면 좌표)이라 바깥 윤곽과 구멍의
   * 방향이 서로 반대다. threshold는 0–1(기본 0.5). */
  var SEGMENTS = [
    [], [["B", "L"]], [["R", "B"]], [["R", "L"]], [["T", "R"]], null, [["T", "B"]], [["T", "L"]],
    [["L", "T"]], [["B", "T"]], null, [["R", "T"]], [["L", "R"]], [["B", "R"]], [["L", "B"]], []
  ];

  function traceAlpha(alpha, width, height, options) {
    var opts = options || {};
    var threshold = opts.threshold === undefined ? 0.5 : opts.threshold;
    var gw = width + 2;
    var gh = height + 2;
    var grid = new Float32Array(gw * gh);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        grid[(y + 1) * gw + x + 1] = alpha[y * width + x] / 255;
      }
    }
    var cw = gw - 1;
    var hCount = gh * cw;
    var segments = new Map();
    function frac(a, b) {
      var d = b - a;
      if (Math.abs(d) < 1e-6) {
        return 0.5;
      }
      return Math.max(0, Math.min(1, (threshold - a) / d));
    }
    for (var i = 0; i < gh - 1; i += 1) {
      for (var j = 0; j < gw - 1; j += 1) {
        var tl = grid[i * gw + j];
        var tr = grid[i * gw + j + 1];
        var br = grid[(i + 1) * gw + j + 1];
        var bl = grid[(i + 1) * gw + j];
        var index = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
        var list = SEGMENTS[index];
        if (list === null) {
          var center = (tl + tr + br + bl) / 4 >= threshold;
          list = index === 5
            ? (center ? [["T", "L"], ["B", "R"]] : [["T", "R"], ["B", "L"]])
            : (center ? [["R", "T"], ["L", "B"]] : [["L", "T"], ["R", "B"]]);
        }
        for (var s = 0; s < list.length; s += 1) {
          var from = edge(list[s][0]);
          var to = edge(list[s][1]);
          segments.set(from.key, { to: to.key, x: from.x, y: from.y });
        }
      }
    }
    function edge(name) {
      /* 가장자리 키: 가로 변은 0..hCount, 세로 변은 hCount부터. 점은 픽셀 중심 기준(−0.5). */
      if (name === "T") {
        return { key: i * cw + j, x: j + frac(tl, tr) - 0.5, y: i - 0.5 };
      }
      if (name === "B") {
        return { key: (i + 1) * cw + j, x: j + frac(bl, br) - 0.5, y: i + 0.5 };
      }
      if (name === "L") {
        return { key: hCount + i * gw + j, x: j - 0.5, y: i + frac(tl, bl) - 0.5 };
      }
      return { key: hCount + i * gw + j + 1, x: j + 0.5, y: i + frac(tr, br) - 0.5 };
    }
    var contours = [];
    segments.forEach(function (segment, start) {
      if (segment.used) {
        return;
      }
      var points = [];
      var key = start;
      var guard = 0;
      while (guard < 1e7) {
        var current = segments.get(key);
        if (!current || current.used) {
          break;
        }
        current.used = true;
        points.push([current.x, current.y]);
        key = current.to;
        guard += 1;
      }
      if (points.length >= 3) {
        contours.push(points);
      }
    });
    return contours;
  }

  function polygonArea(points) {
    var sum = 0;
    for (var i = 0; i < points.length; i += 1) {
      var a = points[i];
      var b = points[(i + 1) % points.length];
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return sum / 2;
  }

  function rdp(points, epsilon) {
    if (points.length < 3) {
      return points.slice();
    }
    var first = points[0];
    var last = points[points.length - 1];
    var dx = last[0] - first[0];
    var dy = last[1] - first[1];
    var length = Math.hypot(dx, dy);
    var index = -1;
    var max = 0;
    for (var i = 1; i < points.length - 1; i += 1) {
      var p = points[i];
      var distance = length > 1e-9
        ? Math.abs(dy * p[0] - dx * p[1] + last[0] * first[1] - last[1] * first[0]) / length
        : Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    if (max <= epsilon) {
      return [first, last];
    }
    var left = rdp(points.slice(0, index + 1), epsilon);
    var right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  /* 닫힌 윤곽 단순화: 가장 먼 두 점에서 나눠 양쪽을 RDP로. */
  function simplify(points, epsilon) {
    if (points.length <= 4) {
      return points.slice();
    }
    var far = 0;
    var best = -1;
    for (var i = 1; i < points.length; i += 1) {
      var d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
      if (d > best) {
        best = d;
        far = i;
      }
    }
    var a = rdp(points.slice(0, far + 1), epsilon);
    var b = rdp(points.slice(far).concat([points[0]]), epsilon);
    var out = a.slice(0, -1).concat(b.slice(0, -1));
    return out.length >= 3 ? out : points.slice();
  }

  /* 볼록한 사각형으로 다각형 자르기(Sutherland–Hodgman). rect = [x0, y0, x1, y1]. */
  function clipToRect(points, rect) {
    var edges = [
      function (p) { return p[0] >= rect[0]; },
      function (p) { return p[1] >= rect[1]; },
      function (p) { return p[0] <= rect[2]; },
      function (p) { return p[1] <= rect[3]; }
    ];
    var cut = [
      function (a, b) { return lerpAt(a, b, 0, rect[0]); },
      function (a, b) { return lerpAt(a, b, 1, rect[1]); },
      function (a, b) { return lerpAt(a, b, 0, rect[2]); },
      function (a, b) { return lerpAt(a, b, 1, rect[3]); }
    ];
    var output = points;
    for (var e = 0; e < 4 && output.length; e += 1) {
      var input = output;
      output = [];
      for (var i = 0; i < input.length; i += 1) {
        var current = input[i];
        var previous = input[(i + input.length - 1) % input.length];
        var inCurrent = edges[e](current);
        var inPrevious = edges[e](previous);
        if (inCurrent) {
          if (!inPrevious) {
            output.push(cut[e](previous, current));
          }
          output.push(current);
        } else if (inPrevious) {
          output.push(cut[e](previous, current));
        }
      }
    }
    return output;
  }

  function lerpAt(a, b, axis, value) {
    var t = (value - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  /* 알파 → 칸 단위(0–100) 외곽선. 작은 조각(minArea, 칸 단위²)은 버리고, tolerance(글자
   * 단위 — 1/1000 em, 기본 4)만큼 단순화한다. */
  function outlineFromAlpha(alpha, size, options) {
    var opts = options || {};
    var scale = 100 / size;
    var minArea = opts.minArea === undefined ? 0.6 : opts.minArea;
    var epsilon = (opts.tolerance === undefined ? 4 : opts.tolerance) / 10 / scale;
    return traceAlpha(alpha, size, size, opts).map(function (contour) {
      return simplify(contour, Math.max(0.25, epsilon)).map(function (p) {
        return [p[0] * scale, p[1] * scale];
      });
    }).filter(function (contour) {
      return contour.length >= 3 && Math.abs(polygonArea(contour)) >= minArea;
    });
  }

  // ── TrueType ───────────────────────────────────────────────

  function ByteWriter() {
    this.bytes = [];
  }
  ByteWriter.prototype.u8 = function (v) { this.bytes.push(v & 0xff); return this; };
  ByteWriter.prototype.u16 = function (v) { this.bytes.push((v >>> 8) & 0xff, v & 0xff); return this; };
  ByteWriter.prototype.i16 = function (v) { return this.u16(v < 0 ? v + 0x10000 : v); };
  ByteWriter.prototype.u32 = function (v) {
    this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  };
  ByteWriter.prototype.f2dot14 = function (v) {
    return this.i16(Math.max(-32768, Math.min(32767, Math.round(v * 16384))));
  };
  ByteWriter.prototype.tag = function (text) {
    for (var i = 0; i < 4; i += 1) {
      this.u8(text.charCodeAt(i) || 32);
    }
    return this;
  };
  ByteWriter.prototype.pad = function (to) {
    while (this.bytes.length % to) {
      this.bytes.push(0);
    }
    return this;
  };
  ByteWriter.prototype.append = function (array) {
    for (var i = 0; i < array.length; i += 1) {
      this.bytes.push(array[i]);
    }
    return this;
  };
  ByteWriter.prototype.toUint8 = function () {
    return Uint8Array.from(this.bytes);
  };

  function checksum(bytes) {
    var sum = 0;
    for (var i = 0; i < bytes.length; i += 4) {
      var word = ((bytes[i] || 0) << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0);
      sum = (sum + (word >>> 0)) >>> 0;
    }
    return sum >>> 0;
  }

  function utf16be(text) {
    var w = new ByteWriter();
    for (var i = 0; i < text.length; i += 1) {
      w.u16(text.charCodeAt(i));
    }
    return w.bytes;
  }

  function bbox(points) {
    var box = [Infinity, Infinity, -Infinity, -Infinity];
    points.forEach(function (p) {
      box[0] = Math.min(box[0], p[0]);
      box[1] = Math.min(box[1], p[1]);
      box[2] = Math.max(box[2], p[0]);
      box[3] = Math.max(box[3], p[1]);
    });
    return box;
  }

  /* 칸 외곽선(칸 단위, y 아래) → 글자 단위 정수 윤곽(y 위). 바깥은 시계 방향. */
  function cellToFontContours(contours) {
    var converted = contours.map(function (contour) {
      return contour.map(function (p) {
        return [Math.round(p[0] * 10), Math.round(CELL_TOP - p[1] * 10)];
      }).filter(function (p, index, all) {
        var previous = all[(index + all.length - 1) % all.length];
        return index === 0 || p[0] !== previous[0] || p[1] !== previous[1];
      });
    }).filter(function (contour) {
      return contour.length >= 3;
    });
    if (!converted.length) {
      return converted;
    }
    /* 가장 큰 윤곽(바깥)이 시계 방향(면적 음수)이 되도록 — 구멍은 따라서 반시계가 된다. */
    var largest = converted.reduce(function (best, contour) {
      return Math.abs(polygonArea(contour)) > Math.abs(polygonArea(best)) ? contour : best;
    });
    if (polygonArea(largest) > 0) {
      converted = converted.map(function (contour) {
        return contour.slice().reverse();
      });
    }
    return converted;
  }

  function encodeSimpleGlyph(contours) {
    var w = new ByteWriter();
    var points = [];
    contours.forEach(function (contour) {
      points = points.concat(contour);
    });
    if (!points.length) {
      return { bytes: [], box: [0, 0, 0, 0], points: 0, contours: 0 };
    }
    var box = bbox(points);
    w.i16(contours.length).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
    var end = -1;
    contours.forEach(function (contour) {
      end += contour.length;
      w.u16(end);
    });
    w.u16(0); // instructionLength
    var flags = [];
    var xs = new ByteWriter();
    var ys = new ByteWriter();
    var px = 0;
    var py = 0;
    points.forEach(function (p) {
      var dx = p[0] - px;
      var dy = p[1] - py;
      var flag = 0x01; // on-curve
      if (dx === 0) {
        flag |= 0x10;
      } else if (Math.abs(dx) < 256) {
        flag |= 0x02 | (dx > 0 ? 0x10 : 0);
        xs.u8(Math.abs(dx));
      } else {
        xs.i16(dx);
      }
      if (dy === 0) {
        flag |= 0x20;
      } else if (Math.abs(dy) < 256) {
        flag |= 0x04 | (dy > 0 ? 0x20 : 0);
        ys.u8(Math.abs(dy));
      } else {
        ys.i16(dy);
      }
      flags.push(flag);
      px = p[0];
      py = p[1];
    });
    w.append(flags).append(xs.bytes).append(ys.bytes);
    return { bytes: w.bytes, box: box, points: points.length, contours: contours.length };
  }

  function transformBox(box, t) {
    var corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(function (p) {
      return [t.a * p[0] + t.c * p[1] + t.e, t.b * p[0] + t.d * p[1] + t.f];
    });
    return bbox(corners);
  }

  function encodeCompositeGlyph(components, glyphs) {
    var w = new ByteWriter();
    var boxes = components.map(function (component) {
      return transformBox(glyphs[component.glyph].box, component);
    });
    var box = boxes.length ? bbox([].concat.apply([], boxes.map(function (b) { return [[b[0], b[1]], [b[2], b[3]]]; })))
      : [0, 0, 0, 0];
    box = box.map(Math.round);
    w.i16(-1).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
    components.forEach(function (component, index) {
      var a = component.a;
      var b = Math.abs(component.b) < 1e-4 ? 0 : component.b;
      var c = Math.abs(component.c) < 1e-4 ? 0 : component.c;
      var d = component.d;
      /* ARG_1_AND_2_ARE_WORDS | ARGS_ARE_XY_VALUES | ROUND_XY_TO_GRID | UNSCALED_COMPONENT_OFFSET */
      var flags = 0x0001 | 0x0002 | 0x0004 | 0x1000;
      if (index < components.length - 1) {
        flags |= 0x0020;
      }
      var mode = b || c ? 3 : (Math.abs(a - d) > 1e-6 ? 2 : (Math.abs(a - 1) > 1e-6 ? 1 : 0));
      flags |= [0, 0x0008, 0x0040, 0x0080][mode];
      w.u16(flags).u16(component.glyph).i16(Math.round(component.e)).i16(Math.round(component.f));
      if (mode === 1) {
        w.f2dot14(a);
      } else if (mode === 2) {
        w.f2dot14(a).f2dot14(d);
      } else if (mode === 3) {
        w.f2dot14(a).f2dot14(b).f2dot14(c).f2dot14(d);
      }
    });
    return { bytes: w.bytes, box: box };
  }

  function cmapTable(mapping) {
    var codes = Object.keys(mapping).map(Number).filter(function (code) { return code <= 0xffff; }).sort(function (a, b) { return a - b; });
    var segments = [];
    codes.forEach(function (code) {
      var glyph = mapping[code];
      var last = segments[segments.length - 1];
      if (last && code === last.end + 1 && glyph === last.glyph + (code - last.start)) {
        last.end = code;
      } else {
        segments.push({ start: code, end: code, glyph: glyph });
      }
    });
    segments.push({ start: 0xffff, end: 0xffff, glyph: 0, terminal: true });
    var segCount = segments.length;
    var entrySelector = Math.floor(Math.log2(segCount));
    var searchRange = 2 * Math.pow(2, entrySelector);
    var sub = new ByteWriter();
    sub.u16(4).u16(16 + segCount * 8).u16(0).u16(segCount * 2).u16(searchRange).u16(entrySelector).u16(segCount * 2 - searchRange);
    segments.forEach(function (s) { sub.u16(s.end); });
    sub.u16(0);
    segments.forEach(function (s) { sub.u16(s.start); });
    segments.forEach(function (s) { sub.u16(s.terminal ? 1 : (s.glyph - s.start + 0x10000) & 0xffff); });
    segments.forEach(function () { sub.u16(0); });
    var w = new ByteWriter();
    w.u16(0).u16(1).u16(3).u16(1).u32(12).append(sub.bytes);
    return w.bytes;
  }

  function nameTable(names) {
    var records = Object.keys(names).map(Number).sort(function (a, b) { return a - b; }).map(function (id) {
      return { id: id, bytes: utf16be(String(names[id])) };
    });
    var w = new ByteWriter();
    var storage = [];
    w.u16(0).u16(records.length).u16(6 + records.length * 12);
    records.forEach(function (record) {
      w.u16(3).u16(1).u16(0x0409).u16(record.id).u16(record.bytes.length).u16(storage.length);
      storage = storage.concat(record.bytes);
    });
    w.append(storage);
    return w.bytes;
  }

  function longDateTime(w, date) {
    var seconds = Math.floor(date.getTime() / 1000) + 2082844800; // 1904-01-01 기준
    w.u32(Math.floor(seconds / 0x100000000)).u32(seconds >>> 0);
  }

  function asciiName(text) {
    return String(text).replace(/[^A-Za-z0-9-]/g, "").slice(0, 63) || "FontKku";
  }

  /* spec: { familyName, styleName, version, copyright, weightClass, date,
   *   cells: [{ name, contours }]  — 칸 단위(0–100, y 아래) 외곽선
   *   glyphs: [{ codepoint, components: [{ cell, a, b, c, d, e, f }] }] — 글자 단위 변환
   * } → TTF 바이트(Uint8Array). */
  function buildTrueType(spec) {
    var glyphs = [];
    var notdef = encodeSimpleGlyph([
      [[100, -120], [100, 880], [600, 880], [600, -120]],
      [[160, -60], [540, -60], [540, 820], [160, 820]]
    ]);
    glyphs.push(Object.assign({ advance: 600 }, notdef));
    var cellIndex = Object.create(null);
    spec.cells.forEach(function (cell) {
      cellIndex[cell.name] = glyphs.length;
      glyphs.push(Object.assign({ advance: UPM }, encodeSimpleGlyph(cellToFontContours(cell.contours))));
    });
    var mapping = Object.create(null);
    /* 공백: 런타임의 [part="space"]와 같은 0.5em, 전각 공백은 1em. */
    var spaces = spec.spaces || { 32: 500, 160: 500, 12288: UPM };
    Object.keys(spaces).forEach(function (code) {
      mapping[code] = glyphs.length;
      glyphs.push({ advance: spaces[code], bytes: [], box: [0, 0, 0, 0], points: 0, contours: 0 });
    });
    var maxComponents = 0;
    var maxCompositePoints = 0;
    var maxCompositeContours = 0;
    spec.glyphs.forEach(function (glyph) {
      var components = glyph.components.filter(function (component) {
        return cellIndex[component.cell] !== undefined && glyphs[cellIndex[component.cell]].contours > 0;
      }).map(function (component) {
        return Object.assign({}, component, { glyph: cellIndex[component.cell] });
      });
      /* 그릴 칸이 하나도 없는 글자는 매핑하지 않는다 — 다른 글꼴로 대체되게. */
      if (!components.length) {
        return;
      }
      mapping[glyph.codepoint] = glyphs.length;
      var encoded = encodeCompositeGlyph(components, glyphs);
      maxComponents = Math.max(maxComponents, components.length);
      maxCompositePoints = Math.max(maxCompositePoints, components.reduce(function (sum, c) { return sum + glyphs[c.glyph].points; }, 0));
      maxCompositeContours = Math.max(maxCompositeContours, components.reduce(function (sum, c) { return sum + glyphs[c.glyph].contours; }, 0));
      glyphs.push({ advance: UPM, bytes: encoded.bytes, box: encoded.box, composite: true });
    });

    var glyf = new ByteWriter();
    var loca = new ByteWriter();
    glyphs.forEach(function (glyph) {
      loca.u32(glyf.bytes.length);
      glyf.append(glyph.bytes).pad(4);
    });
    loca.u32(glyf.bytes.length);

    var drawn = glyphs.filter(function (glyph) { return glyph.bytes.length; });
    var fontBox = drawn.length ? bbox([].concat.apply([], drawn.map(function (g) { return [[g.box[0], g.box[1]], [g.box[2], g.box[3]]]; })))
      : [0, 0, 0, 0];
    var date = spec.date || new Date(0);
    var family = spec.familyName || "FontKku";
    var style = spec.styleName || "Regular";
    var postscript = spec.postscriptName ? asciiName(spec.postscriptName) : asciiName(family) + "-" + asciiName(style);

    var head = new ByteWriter();
    head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x0009).u16(UPM);
    longDateTime(head, date);
    longDateTime(head, date);
    head.i16(fontBox[0]).i16(fontBox[1]).i16(fontBox[2]).i16(fontBox[3]).u16(0).u16(8).i16(2).i16(1).i16(0);

    var hhea = new ByteWriter();
    var minLsb = Math.min.apply(null, glyphs.map(function (g) { return g.bytes.length ? g.box[0] : 0; }));
    var minRsb = Math.min.apply(null, glyphs.map(function (g) { return g.bytes.length ? g.advance - g.box[2] : 0; }));
    var maxExtent = Math.max.apply(null, glyphs.map(function (g) { return g.bytes.length ? g.box[2] : 0; }));
    hhea.u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0).u16(UPM).i16(minLsb).i16(minRsb).i16(maxExtent)
      .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);

    var maxp = new ByteWriter();
    var simple = glyphs.filter(function (g) { return !g.composite; });
    maxp.u32(0x00010000).u16(glyphs.length)
      .u16(Math.max.apply(null, simple.map(function (g) { return g.points || 0; })))
      .u16(Math.max.apply(null, simple.map(function (g) { return g.contours || 0; })))
      .u16(maxCompositePoints).u16(maxCompositeContours)
      .u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(maxComponents).u16(maxComponents ? 1 : 0);

    var codes = Object.keys(mapping).map(Number).sort(function (a, b) { return a - b; });
    var os2 = new ByteWriter();
    os2.u16(4).i16(UPM).u16(spec.weightClass || 400).u16(5).u16(0)
      .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(300).i16(0)
      .append([2, 0, 5, 0, 0, 0, 0, 0, 0, 0])
      .u32(0).u32(1 << 24).u32(0).u32(0) // ulUnicodeRange2 bit 56: Hangul Syllables
      .tag("FKKU").u16(0x00c0)
      .u16(codes.length ? Math.min(codes[0], 0xffff) : 0).u16(codes.length ? Math.min(codes[codes.length - 1], 0xffff) : 0)
      .i16(CELL_TOP).i16(CELL_TOP - UPM).i16(ASCENT + DESCENT - UPM).u16(ASCENT).u16(DESCENT)
      .u32(1 << 19).u32(0) // 코드 페이지: 한국어(완성형)
      .i16(0).i16(0).u16(0).u16(32).u16(0);

    var hmtx = new ByteWriter();
    glyphs.forEach(function (glyph) {
      hmtx.u16(glyph.advance).i16(glyph.bytes.length ? glyph.box[0] : 0);
    });

    var post = new ByteWriter();
    post.u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

    var names = {
      1: family,
      2: style,
      3: (spec.version || "1.000") + ";" + postscript,
      4: family + (style === "Regular" ? "" : " " + style),
      5: "Version " + (spec.version || "1.000") + "; font-kku export",
      6: postscript
    };
    if (spec.copyright) {
      names[0] = spec.copyright;
    }

    var tables = {
      "OS/2": os2.bytes,
      cmap: cmapTable(mapping),
      glyf: glyf.bytes,
      head: head.bytes,
      hhea: hhea.bytes,
      hmtx: hmtx.bytes,
      loca: loca.bytes,
      maxp: maxp.bytes,
      name: nameTable(names),
      post: post.bytes
    };
    var tags = Object.keys(tables).sort();
    var numTables = tags.length;
    var entrySelector = Math.floor(Math.log2(numTables));
    var searchRange = Math.pow(2, entrySelector) * 16;
    var out = new ByteWriter();
    out.u32(0x00010000).u16(numTables).u16(searchRange).u16(entrySelector).u16(numTables * 16 - searchRange);
    var offset = 12 + numTables * 16;
    var records = tags.map(function (tag) {
      var bytes = tables[tag];
      var record = { tag: tag, bytes: bytes, offset: offset, length: bytes.length, sum: checksum(bytes) };
      offset += Math.ceil(bytes.length / 4) * 4;
      return record;
    });
    records.forEach(function (record) {
      out.tag(record.tag).u32(record.sum).u32(record.offset).u32(record.length);
    });
    records.forEach(function (record) {
      out.append(record.bytes).pad(4);
    });
    var bytes = out.toUint8();
    var headOffset = records.filter(function (r) { return r.tag === "head"; })[0].offset;
    var adjustment = (0xb1b0afba - checksum(bytes)) >>> 0;
    bytes[headOffset + 8] = adjustment >>> 24;
    bytes[headOffset + 9] = (adjustment >>> 16) & 0xff;
    bytes[headOffset + 10] = (adjustment >>> 8) & 0xff;
    bytes[headOffset + 11] = adjustment & 0xff;
    return bytes;
  }

  // ── WOFF ───────────────────────────────────────────────────

  function readU32(bytes, at) {
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  }

  function readU16(bytes, at) {
    return (bytes[at] << 8) | bytes[at + 1];
  }

  async function deflate(bytes) {
    if (typeof CompressionStream !== "function") {
      return null;
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /* TTF → WOFF 1.0(테이블마다 zlib). CompressionStream이 없으면 null. */
  async function toWoff(ttf) {
    if (typeof CompressionStream !== "function") {
      return null;
    }
    var numTables = readU16(ttf, 4);
    var entries = [];
    for (var i = 0; i < numTables; i += 1) {
      var at = 12 + i * 16;
      var tag = String.fromCharCode(ttf[at], ttf[at + 1], ttf[at + 2], ttf[at + 3]);
      var offset = readU32(ttf, at + 8);
      var length = readU32(ttf, at + 12);
      var data = ttf.slice(offset, offset + length);
      var compressed = await deflate(data);
      entries.push({
        tag: tag,
        checksum: readU32(ttf, at + 4),
        origLength: length,
        data: compressed && compressed.length < length ? compressed : data
      });
    }
    var header = 44 + numTables * 20;
    var offset2 = header;
    entries.forEach(function (entry) {
      entry.offset = offset2;
      offset2 += Math.ceil(entry.data.length / 4) * 4;
    });
    var w = new ByteWriter();
    w.tag("wOFF").u32(0x00010000).u32(offset2).u16(numTables).u16(0).u32(ttf.length).u16(1).u16(0)
      .u32(0).u32(0).u32(0).u32(0).u32(0);
    entries.forEach(function (entry) {
      w.tag(entry.tag).u32(entry.offset).u32(entry.data.length).u32(entry.origLength).u32(entry.checksum);
    });
    entries.forEach(function (entry) {
      w.append(entry.data).pad(4);
    });
    return w.toUint8();
  }

  // ── 브라우저: 자리 변환과 칸 그림 ──────────────────────────────

  var SIZE = 200; // 측정용 글자 크기(px) — 글자 단위 = px × 1000 / SIZE

  function parseInset(value, cellPx) {
    /* clip-path: inset(top right bottom left) — 칸 단위(0–100) 사각형. 다른 모양은 무시. */
    var match = /^inset\(([^)]*)\)$/.exec(String(value || "").trim());
    if (!match) {
      return null;
    }
    var parts = match[1].trim().split(/\s+/).map(function (token) {
      if (/%$/.test(token)) {
        return parseFloat(token);
      }
      return parseFloat(token) / cellPx * 100;
    });
    while (parts.length < 4) {
      parts.push(parts.length === 3 ? parts[1] : parts.length === 2 ? parts[0] : parts[0]);
    }
    if (parts.some(function (v) { return !isFinite(v); })) {
      return null;
    }
    return [parts[3], parts[0], 100 - parts[1], 100 - parts[2]];
  }

  var MARKER_STYLE = "position:absolute;width:0;height:0;margin:0;padding:0;border:0;";
  var CROP_X = "var(--fy-optical-sprite-crop-x, var(--fy-sprite-crop-x, 0em))";
  var CROP_Y = "var(--fy-optical-sprite-crop-y, var(--fy-sprite-crop-y, 0em))";
  var CELL_SPAN = "var(--fy-sprite-cell, 1em) * var(--fy-optical-sprite-zoom, var(--fy-sprite-zoom, 1))";

  function marker(doc, left, top) {
    var node = doc.createElement("i");
    node.setAttribute("data-fy-export-marker", "");
    node.style.cssText = MARKER_STYLE + "left:" + left + ";top:" + top + ";";
    return node;
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      (global.requestAnimationFrame || setTimeout)(function () { resolve(); }, 0);
    });
  }

  /* 글자 하나하나를 숨긴 바탕 요소로 조립하고 자모 노드별 칸과 변환을 읽는다. */
  async function captureLayout(options) {
    var FontKku = global.FontKku;
    if (!FontKku || typeof FontKku.upgradeAll !== "function") {
      throw new Error("font-kku-export: load font-kku.js (window.FontKku) first");
    }
    var doc = options.document || global.document;
    var parent = options.root || doc.body;
    var box = doc.createElement("div");
    box.setAttribute("aria-hidden", "true");
    box.style.cssText = "position:absolute;left:-200000px;top:0;width:4000px;visibility:hidden;pointer-events:none;";
    parent.appendChild(box);
    var result = [];
    var sources = Object.create(null);
    var missing = [];
    var batch = options.batch || 240;
    try {
      for (var start = 0; start < options.chars.length; start += batch) {
        var chars = options.chars.slice(start, start + batch);
        var hosts = chars.map(function (ch) {
          var host = doc.createElement("span");
          host.className = "font-kku";
          host.setAttribute("data-font", options.font);
          host.setAttribute("data-size", SIZE + "px");
          if (options.jamoSet) {
            host.setAttribute("data-jamo-set", options.jamoSet);
          }
          host.style.display = "inline-block";
          host.textContent = ch;
          return host;
        });
        box.replaceChildren.apply(box, hosts);
        FontKku.upgradeAll(box);
        /* 1) 노드와 표식 넣기 */
        var work = hosts.map(function (host, index) {
          var kinds = String(host.dataset.fySpriteKinds || "").split(/\s+/);
          var glyph = host.querySelector('[part="glyph"]');
          var nodes = Array.prototype.filter.call(host.querySelectorAll("[data-sprite-jamo-kind]"), function (node) {
            return kinds.indexOf(node.dataset.spriteJamoKind) >= 0;
          });
          return {
            ch: chars[index],
            host: host,
            glyph: glyph,
            material: host.dataset.fyMaterial || "system",
            nodes: nodes.map(function (node) {
              var markers = [
                marker(doc, CROP_X, CROP_Y),
                marker(doc, "calc(" + CROP_X + " + " + CELL_SPAN + ")", CROP_Y),
                marker(doc, CROP_X, "calc(" + CROP_Y + " + " + CELL_SPAN + ")")
              ];
              markers.forEach(function (m) { node.appendChild(m); });
              return { node: node, markers: markers };
            })
          };
        });
        /* 2) 한 번에 읽기 */
        work.forEach(function (item) {
          if (item.material !== "sprite" && item.material !== "vector") {
            missing.push(item.ch);
            return;
          }
          var glyphRect = item.glyph.getBoundingClientRect();
          var fontSize = parseFloat(getComputedStyle(item.glyph).fontSize) || SIZE;
          var k = UPM / fontSize;
          var hostStyle = getComputedStyle(item.host);
          var components = [];
          item.nodes.forEach(function (entry) {
            var style = getComputedStyle(entry.node);
            var row = parseInt(style.getPropertyValue("--fy-sprite-row"), 10) || 0;
            var key = "r" + row + "-" + entry.node.dataset.spriteJamo;
            var pts = entry.markers.map(function (m) {
              var r = m.getBoundingClientRect();
              return [r.left - glyphRect.left, r.top - glyphRect.top];
            });
            var cellPx = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
            var clip = parseInset(style.clipPath, cellPx);
            var cellName = clip ? key + "@" + clip.map(function (v) { return v.toFixed(1); }).join(",") : key;
            if (!sources[cellName]) {
              sources[cellName] = sourceOf(entry.node, item, hostStyle, style, key, clip);
            }
            var x0 = pts[0][0], y0 = pts[0][1], x1 = pts[1][0], y1 = pts[1][1], x2 = pts[2][0], y2 = pts[2][1];
            components.push({
              cell: cellName,
              a: k * (x1 - x0) / UPM,
              b: -k * (y1 - y0) / UPM,
              c: -k * (x2 - x0) / UPM,
              d: k * (y2 - y0) / UPM,
              e: k * x0 + CELL_TOP * k * (x2 - x0) / UPM,
              f: CELL_TOP - k * y0 - CELL_TOP * k * (y2 - y0) / UPM
            });
          });
          if (!components.length) {
            missing.push(item.ch);
          }
          result.push({ codepoint: item.ch.codePointAt(0), components: components });
        });
        if (options.onProgress) {
          options.onProgress(Math.min(1, (start + chars.length) / options.chars.length) * 0.6, "layout");
        }
        await nextFrame();
      }
    } finally {
      box.remove();
    }
    return { glyphs: result, sources: sources, missing: missing };
  }

  function cssUrl(value) {
    var match = /url\(\s*(["']?)([^"')]+)\1\s*\)/.exec(String(value || ""));
    return match ? match[2] : null;
  }

  function sourceOf(node, item, hostStyle, style, key, clip) {
    var svg = node.querySelector(':scope > [part="vector"]');
    if (item.material === "vector" && svg) {
      return { kind: "vector", svg: svg.cloneNode(true), key: key, clip: clip,
        stroke: parseFloat(svg.style.getPropertyValue("--fy-vector-stroke-cells")) };
    }
    var url = cssUrl(style.maskImage || style.webkitMaskImage) || cssUrl(style.backgroundImage);
    return {
      kind: "sheet",
      url: url,
      key: key,
      clip: clip,
      col: parseInt(node.dataset.spriteJamoIndex, 10) || 0,
      row: parseInt(style.getPropertyValue("--fy-sprite-row"), 10) || 0,
      cols: parseInt(hostStyle.getPropertyValue("--fy-sprite-cols"), 10) || 21,
      rows: parseInt(hostStyle.getPropertyValue("--fy-sprite-rows"), 10) || 2
    };
  }

  function loadImage(doc, url) {
    return new Promise(function (resolve, reject) {
      var image = new (doc.defaultView || global).Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("font-kku-export: could not load " + url)); };
      image.src = url;
    });
  }

  var SVG_NS = "http://www.w3.org/2000/svg";

  function vectorCellUrl(source, strokeOverride) {
    var svg = source.svg;
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("width", "100");
    svg.setAttribute("height", "100");
    svg.removeAttribute("style");
    var stroke = strokeOverride || source.stroke || 7.2;
    Array.prototype.forEach.call(svg.children, function (child) {
      if (child.hasAttribute("data-fill")) {
        child.setAttribute("fill", "#000");
        child.setAttribute("stroke", "none");
      } else {
        child.setAttribute("fill", "none");
        child.setAttribute("stroke", "#000");
        child.setAttribute("stroke-width", String(stroke));
      }
    });
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  }

  async function cellOutlines(sources, options) {
    var doc = options.document || global.document;
    var size = options.cellSize || 256;
    var canvas = doc.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    var sheets = Object.create(null);
    var names = Object.keys(sources);
    var cells = [];
    for (var n = 0; n < names.length; n += 1) {
      var source = sources[names[n]];
      context.clearRect(0, 0, size, size);
      if (source.kind === "vector") {
        var vectorImage = await loadImage(doc, vectorCellUrl(source, options.stroke));
        context.drawImage(vectorImage, 0, 0, size, size);
      } else {
        var url = options.sheet || source.url;
        if (!url) {
          continue;
        }
        /* 시트 전체를 칸 size px로 한 번 그려 둔다 — SVG는 그 해상도로 다시 그려져 선명하다. */
        var sheetKey = url + "|" + source.cols + "x" + source.rows;
        if (!sheets[sheetKey]) {
          var image = await loadImage(doc, url);
          var big = doc.createElement("canvas");
          big.width = source.cols * size;
          big.height = source.rows * size;
          var bigContext = big.getContext("2d", { willReadFrequently: true });
          bigContext.drawImage(image, 0, 0, big.width, big.height);
          sheets[sheetKey] = bigContext;
        }
        context.drawImage(sheets[sheetKey].canvas, source.col * size, source.row * size, size, size, 0, 0, size, size);
      }
      var data;
      try {
        data = context.getImageData(0, 0, size, size).data;
      } catch (error) {
        throw new Error("font-kku-export: the jamo sheet must come from the page's origin (open the page over http, not file://)");
      }
      var alpha = new Uint8Array(size * size);
      for (var i = 0; i < alpha.length; i += 1) {
        alpha[i] = data[i * 4 + 3];
      }
      var contours = outlineFromAlpha(alpha, size, options);
      if (source.clip) {
        contours = contours.map(function (contour) {
          return clipToRect(contour, source.clip);
        }).filter(function (contour) {
          return contour.length >= 3 && Math.abs(polygonArea(contour)) >= 0.1;
        });
      }
      cells.push({ name: names[n], contours: contours });
      if (options.onProgress) {
        options.onProgress(0.6 + 0.35 * (n + 1) / names.length, "outline");
      }
    }
    return cells;
  }

  function defaultChars() {
    var chars = COMPAT_JAMO.split("");
    for (var code = SYLLABLE_FIRST; code <= SYLLABLE_LAST; code += 1) {
      chars.push(String.fromCharCode(code));
    }
    return chars;
  }

  /* exportFont({ font, jamoSet?, text?, familyName?, postscriptName?, styleName?, version?, copyright?,
   *   weightClass?, cellSize?, stroke?, sheet?, minArea?, tolerance?, root?, document?, onProgress? })
   * → { ttf, woff, report } (Uint8Array, Uint8Array|null). text가 없으면 한글 음절 11,172자와
   * 호환 자모 51자. */
  async function exportFont(options) {
    var opts = options || {};
    if (!opts.font) {
      throw new TypeError("font-kku-export: exportFont needs { font }");
    }
    var chars = opts.text ? Array.from(new Set(Array.from(String(opts.text)).filter(function (ch) {
      var code = ch.codePointAt(0);
      return (code >= SYLLABLE_FIRST && code <= SYLLABLE_LAST) || COMPAT_JAMO.indexOf(ch) >= 0;
    }))) : defaultChars();
    var layout = await captureLayout(Object.assign({}, opts, { chars: chars }));
    var cells = await cellOutlines(layout.sources, opts);
    var ttf = buildTrueType({
      familyName: opts.familyName || opts.font,
      postscriptName: opts.postscriptName || ("FontKku-" + asciiName(opts.font) + (opts.jamoSet ? "-" + asciiName(opts.jamoSet) : "")),
      styleName: opts.styleName,
      version: opts.version,
      copyright: opts.copyright,
      weightClass: opts.weightClass,
      date: opts.date,
      cells: cells,
      glyphs: layout.glyphs
    });
    var woff = await toWoff(ttf);
    if (opts.onProgress) {
      opts.onProgress(1, "done");
    }
    return {
      ttf: ttf,
      woff: woff,
      report: {
        glyphs: layout.glyphs.length,
        cells: cells.length,
        clipped: cells.filter(function (cell) { return cell.name.indexOf("@") >= 0; }).length,
        missing: layout.missing
      }
    };
  }

  /* 내보낸 바이트를 파일로 내려받게 한다. */
  function download(bytes, filename, doc) {
    var d = doc || global.document;
    var type = /\.woff$/i.test(filename) ? "font/woff" : "font/ttf";
    var url = URL.createObjectURL(new Blob([bytes], { type: type }));
    var link = d.createElement("a");
    link.href = url;
    link.download = filename;
    (d.body || d.documentElement).appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  var FontKkuExport = {
    exportFont: exportFont,
    download: download,
    traceAlpha: traceAlpha,
    simplify: simplify,
    clipToRect: clipToRect,
    outlineFromAlpha: outlineFromAlpha,
    buildTrueType: buildTrueType,
    toWoff: toWoff,
    CELL_TOP: CELL_TOP
  };

  global.FontKkuExport = FontKkuExport;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontKkuExport;
  }
})(typeof window !== "undefined" ? window : globalThis);
