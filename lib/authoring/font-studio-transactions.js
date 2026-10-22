/* font-studio-transactions.js — 작업실 디자인 편집의 기록·묶음·임시 등록 (설계 v1.2 §13.6, PLAN-HANGUL-001 F0)
 *
 * DOM 없이 셋을 맡는다. (1) 이름 붙은 편집 기록(createStore): 항목마다 바꾸기 전·후 상태 { design, participants }를 통째로
 * 들고, 되돌리기·다시·건너뛰기가 그 상태를 돌려준다 — 참가자(그림 문서처럼 디자인 JSON 밖에 사는 상태)가 디자인과 함께 되돌아간다.
 * (2) 묶음 편집(createTransaction): 끌기처럼 여러 번 바뀌는 동작을 미리보기만 하다가 commit에서 기록 한 줄로 남긴다. 취소하면
 * 아무것도 남지 않는다. (3) 임시 등록(createLeasePool): 비교·후보 미리보기용 디자인을 studio-tmp-<n> 이름에 바꿔 등록하고,
 * 다 쓰면 지운다(FontKku.unregisterDesign이 없으면 내용 주소 이름 studio-tmp-<fnv>에 남긴다). 검사 결과 모양 맞추기
 * (normalizeValidation)도 여기 둔다. (4) 하나의 기록(createTimeline, PLAN-STUDIO-002 S2): 글꼴 CSS·디자인·그림·자소판·검수 편집을
 * 한 시간축에 이름 붙은 줄로 쌓는다. 브라우저(window.FontStudioTransactions)와 Node(require) 공용.
 */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-transactions: load font-studio-util.js first");
  }
  var clone = Util.clone;
  var stableJson = Util.stableJson;
  var fnv1a = Util.fnv1a;
  var isObject = Util.isObject;

  var DEFAULT_LIMIT = 60;
  var LEASE_PREFIX = "studio-tmp";

  // ── 편집 기록 ─────────────────────────────────────────────────────────

  /* 항목: { id, label, at, before: { design, participants }, after: { … } }. pointer는 마지막으로 적용된 항목(-1이면 처음 상태).
   * 새 항목을 남기면 pointer 뒤(다시 할 수 있던 항목)는 버린다. limit을 넘으면 가장 오래된 항목부터 버린다. */
  function createStore(options) {
    var limit = Math.max(1, Math.floor((options && options.limit) || DEFAULT_LIMIT));
    /* 상한을 넘어 스스로 버린 항목마다(하나의 기록이 같은 줄을 뺀다) */
    var onDrop = options && typeof options.onDrop === "function" ? options.onDrop : null;
    var list = [];
    var pointer = -1;
    var serial = 0;

    function light(entry) {
      return entry ? { id: entry.id, label: entry.label, at: entry.at } : null;
    }

    function find(id) {
      for (var index = 0; index < list.length; index += 1) {
        if (list[index].id === id) {
          return index;
        }
      }
      return -1;
    }

    /* index 자리로 옮기고 그때 상태를 돌려준다(-1이면 첫 항목의 before) */
    function stateAt(index) {
      if (index < 0) {
        return list.length ? clone(list[0].before) : null;
      }
      return clone(list[index].after);
    }

    return {
      record: function (entry) {
        if (!entry || !isObject(entry.before) || !isObject(entry.after)) {
          throw new TypeError("font-studio-transactions: record needs { label, before, after }");
        }
        list.length = pointer + 1;
        serial += 1;
        var stored = {
          id: "h" + serial,
          label: String(entry.label || ""),
          at: typeof entry.at === "number" ? entry.at : Date.now(),
          before: clone(entry.before),
          after: clone(entry.after)
        };
        list.push(stored);
        while (list.length > limit) {
          var dropped = list.shift();
          if (onDrop) {
            onDrop(light(dropped));
          }
        }
        pointer = list.length - 1;
        return light(stored);
      },
      /* 되돌린다 — 되돌린 항목의 before(없으면 null) */
      undo: function () {
        if (pointer < 0) {
          return null;
        }
        pointer -= 1;
        return clone(list[pointer + 1].before);
      },
      /* 다시 — 다시 한 항목의 after(없으면 null) */
      redo: function () {
        if (pointer >= list.length - 1) {
          return null;
        }
        pointer += 1;
        return clone(list[pointer].after);
      },
      /* 그 항목까지 적용한 상태로 — 그 항목의 after. id가 null이면 처음 상태(첫 항목의 before). 모르는 id면 null(그대로) */
      jump: function (id) {
        var index = id === null ? -1 : find(id);
        if ((index < 0 && id !== null) || !list.length) {
          return null;
        }
        pointer = index;
        return stateAt(index);
      },
      /* 실패한 되돌리기·건너뛰기를 무를 때 — 상태는 돌려주지 않는다 */
      seek: function (index) {
        pointer = Math.max(-1, Math.min(list.length - 1, index));
        return pointer;
      },
      entry: function (id) {
        var index = find(id);
        return index < 0 ? null : clone(list[index]);
      },
      entries: function () {
        return list.map(light);
      },
      current: function () {
        return light(list[pointer] || null);
      },
      next: function () {
        return light(list[pointer + 1] || null);
      },
      index: function () {
        return pointer;
      },
      size: function () {
        return list.length;
      },
      canUndo: function () {
        return pointer >= 0;
      },
      canRedo: function () {
        return pointer < list.length - 1;
      },
      /* 다시 할 수 있던 항목을 버린다(하나의 기록에서 다른 갈래가 새로 기록했을 때) */
      truncate: function () {
        var dropped = list.length - (pointer + 1);
        list.length = pointer + 1;
        return dropped;
      },
      /* 가장 오래된 항목 하나를 버린다(하나의 기록의 크기 상한) — 지금 자리는 그대로 */
      dropOldest: function () {
        if (!list.length) {
          return null;
        }
        var dropped = list.shift();
        pointer = Math.max(-1, pointer - 1);
        return light(dropped);
      },
      clear: function () {
        list.length = 0;
        pointer = -1;
      }
    };
  }

  // ── 하나의 기록(PLAN-STUDIO-002 S2) ────────────────────────────────────

  var TIMELINE_BUDGET = 192 * 1024 * 1024;
  var TIMELINE_LIMIT = 1000;
  var LANE_PREFIX = { css: "c", design: "h", sheet: "s", review: "r", action: "a", group: "g", remote: "x" };

  function positive(value, fallback) {
    return typeof value === "number" && isFinite(value) && value > 0 ? value : fallback;
  }

  /* 작업실 문서 하나의 편집 시간축(PLAN-STUDIO-002 '하나의 기록'). 갈래(lane)마다 제 되돌리기 자료를 들고(글꼴 CSS 글·디자인 기록·
   * 자소판 화소 조각) 시간축은 차례·이름·행위자·시각·크기를 든다. 자료를 시간축 항목(data)에 맡기는 갈래도 있다(검수·작업실 동작).
   * - 두 줄: done(오래된 것부터)과 undone(끝이 다음 '다시'). 전체 되돌리기(undo)는 done 끝, 갈래 되돌리기(undoLane)는 그 갈래의 done
   *   마지막 — 갈래 자료의 맨 위와 늘 같다(예전 갈래별 단추와 같은 뜻). 새 기록은 undone을 모두 버린다(남의 갈래는 truncate).
   * - 크기(bytes)·개수 상한을 넘으면 가장 오래된 done부터 버린다(그 갈래의 dropOldest). 갈래가 스스로 버리면 dropOldestOf·forget.
   * - 묶음(begin/end, batch): 그 사이 기록은 항목 하나(parts)다 — 되돌리기는 거꾸로, 하나라도 실패하면 이미 한 것을 무른다.
   * - 다른 행위자의 바뀜(receive)·저장한 기록 되살리기(restore)는 되돌릴 수 없는 줄이다(되돌리기가 그 앞을 넘지 않는다).
   * lane spec: { undo(entry) → bool, redo(entry) → bool, truncate?(), dropOldest?(entry), merge?(prev, next) }.
   * 되돌리는 동안(갈래가 적용 중) 들어온 기록은 버린다 — 적용이 다시 기록을 남기지 않게. */
  function createTimeline(options) {
    var opts = options || {};
    var budget = positive(opts.budget, TIMELINE_BUDGET);
    var limit = Math.max(1, Math.floor(positive(opts.limit, TIMELINE_LIMIT)));
    var now = typeof opts.now === "function" ? opts.now : Date.now;
    var lanes = {};
    var done = [];
    var undone = [];
    var serial = 0;
    var listeners = [];
    var open = null; // 열린 묶음 { label, cause, actor, depth, parts }
    var applying = 0;

    function nextId(lane) {
      serial += 1;
      return (LANE_PREFIX[lane] || "t") + serial;
    }

    function lanesOf(entry) {
      if (!entry.parts) {
        return [entry.lane];
      }
      var seen = [];
      entry.parts.forEach(function (part) {
        if (seen.indexOf(part.lane) < 0) {
          seen.push(part.lane);
        }
      });
      return seen;
    }

    function light(entry, where) {
      return {
        id: entry.id,
        kind: entry.savedKind || entry.lane,
        lanes: lanesOf(entry),
        cause: entry.cause,
        label: entry.label,
        actor: clone(entry.actor),
        time: entry.time,
        bytes: entry.bytes,
        undoable: entry.undoable !== false,
        state: where
      };
    }

    function notify(type, entry) {
      var event = { type: type, entry: entry ? light(entry, undone.indexOf(entry) >= 0 ? "undone" : "done") : null };
      listeners.slice().forEach(function (listener) {
        try {
          listener(event);
        } catch (error) {
          setTimeout(function () { throw error; }, 0); // 듣는 쪽 오류가 기록을 깨뜨리지 않게
        }
      });
    }

    function sizeOf(info) {
      if (typeof info.bytes === "number" && isFinite(info.bytes)) {
        return Math.max(0, Math.round(info.bytes));
      }
      if (info.data !== undefined) {
        try {
          return (JSON.stringify(info.data) || "").length * 2;
        } catch (error) {
          return 64;
        }
      }
      return 64;
    }

    function call(name, method, entry) {
      var lane = lanes[name];
      if (!lane || typeof lane[method] !== "function") {
        return method === "undo" || method === "redo" ? false : undefined;
      }
      return lane[method](entry);
    }

    function opposite(direction) {
      return direction === "undo" ? "redo" : "undo";
    }

    /* 항목 하나를 적용한다(묶음은 되돌리기면 거꾸로). 하나라도 실패하면 이미 적용한 조각을 무르고 false */
    function apply(entry, direction) {
      if (entry.undoable === false) {
        return false;
      }
      var parts = entry.parts ? entry.parts.slice() : [entry];
      if (direction === "undo") {
        parts.reverse();
      }
      applying += 1;
      try {
        for (var index = 0; index < parts.length; index += 1) {
          var ok = false;
          try {
            ok = call(parts[index].lane, direction, parts[index]) !== false;
          } catch (error) {
            setTimeout(function () { throw error; }, 0);
            ok = false;
          }
          if (!ok) {
            for (var back = index - 1; back >= 0; back -= 1) {
              try {
                call(parts[back].lane, opposite(direction), parts[back]);
              } catch (error) {
                setTimeout(function () { throw error; }, 0);
              }
            }
            return false;
          }
        }
        return true;
      } finally {
        applying -= 1;
      }
    }

    /* 다시 할 수 있던 것을 버린다 — 기록한 갈래(except)는 스스로 버렸다 */
    function discardUndone(except) {
      if (!undone.length) {
        return;
      }
      var names = [];
      undone.forEach(function (entry) {
        lanesOf(entry).forEach(function (name) {
          if (names.indexOf(name) < 0 && (except || []).indexOf(name) < 0) {
            names.push(name);
          }
        });
      });
      undone = [];
      names.forEach(function (name) { call(name, "truncate"); });
    }

    function total() {
      return done.reduce(function (sum, entry) { return sum + entry.bytes; }, 0);
    }

    /* 상한을 넘으면 가장 오래된 done부터 버린다(늘 마지막 하나는 남긴다) */
    function trim() {
      var sum = total();
      var dropped = 0;
      while ((sum > budget || done.length > limit) && done.length > 1) {
        var old = done.shift();
        sum -= old.bytes;
        (old.parts || [old]).forEach(function (part) { call(part.lane, "dropOldest", part); });
        dropped += 1;
      }
      if (dropped) {
        notify("drop", null);
      }
      return dropped;
    }

    function merge(last, entry) {
      var lane = lanes[entry.lane];
      if (lane && typeof lane.merge === "function") {
        lane.merge(last, entry);
      } else if (isObject(last.data) && isObject(entry.data) && "after" in entry.data) {
        last.data.after = entry.data.after;
      }
      last.label = entry.label || last.label;
      last.time = entry.time;
      last.actor = entry.actor || last.actor;
      last.bytes = sizeOf({ data: last.data, bytes: lane && typeof lane.bytes === "function" ? lane.bytes(last) : undefined });
    }

    function commitEntry(entry, except) {
      discardUndone(except);
      var last = done[done.length - 1];
      if (entry.mergeKey && last && !last.parts && last.lane === entry.lane && last.mergeKey === entry.mergeKey && last.undoable !== false) {
        merge(last, entry);
        trim();
        notify("merge", last);
        return light(last, "done");
      }
      done.push(entry);
      trim();
      notify("record", entry);
      return light(entry, "done");
    }

    function make(laneName, info) {
      var data = info || {};
      return {
        id: data.id ? String(data.id) : nextId(laneName),
        lane: laneName,
        cause: String(data.cause || laneName),
        label: String(data.label || ""),
        actor: data.actor ? clone(data.actor) : null,
        time: typeof data.time === "number" ? data.time : now(),
        bytes: sizeOf(data),
        data: data.data,
        mergeKey: data.mergeKey ? String(data.mergeKey) : null,
        undoable: data.undoable !== false
      };
    }

    function record(laneName, info) {
      if (applying) {
        return null; // 되돌리는 중 갈래가 남긴 기록 — 적용이 기록을 다시 쓰지 않게
      }
      if (typeof laneName !== "string" || (!lanes[laneName] && laneName !== "remote")) {
        throw new TypeError("font-studio-transactions: timeline.record needs a registered lane (got " + JSON.stringify(laneName) + ")");
      }
      var entry = make(laneName, info);
      if (open) {
        open.parts.push(entry);
        return light(entry, "pending");
      }
      return commitEntry(entry, [laneName]);
    }

    function begin(label, info) {
      if (open) {
        open.depth += 1;
        return false;
      }
      var data = info || {};
      open = { label: String(label || ""), cause: data.cause || null, actor: data.actor ? clone(data.actor) : null, depth: 1, parts: [] };
      return true;
    }

    function end() {
      if (!open) {
        return null;
      }
      open.depth -= 1;
      if (open.depth > 0) {
        return null;
      }
      var batch = open;
      open = null;
      if (!batch.parts.length) {
        return null;
      }
      if (batch.parts.length === 1) {
        var only = batch.parts[0];
        if (batch.label) {
          only.label = batch.label;
        }
        return commitEntry(only, [only.lane]);
      }
      var group = {
        id: nextId("group"),
        lane: "group",
        parts: batch.parts,
        cause: String(batch.cause || batch.parts[batch.parts.length - 1].cause),
        label: batch.label || batch.parts[batch.parts.length - 1].label,
        actor: batch.actor || clone(batch.parts[0].actor),
        time: batch.parts[0].time,
        bytes: batch.parts.reduce(function (sum, part) { return sum + part.bytes; }, 0),
        mergeKey: null,
        undoable: true
      };
      return commitEntry(group, lanesOf(group));
    }

    /* fn 안의 기록을 항목 하나로. fn이 Promise를 돌려주면 끝난 뒤 닫는다 */
    function batch(label, fn, info) {
      begin(label, info);
      var result;
      try {
        result = fn();
      } catch (error) {
        end();
        throw error;
      }
      if (result && typeof result.then === "function") {
        return result.then(function (value) { end(); return value; }, function (error) { end(); throw error; });
      }
      end();
      return result;
    }

    function failure(code, entry) {
      return { ok: false, code: code, entry: entry ? light(entry, undone.indexOf(entry) >= 0 ? "undone" : "done") : null };
    }

    function undo() {
      if (open) {
        return failure("BATCH_OPEN");
      }
      var entry = done[done.length - 1];
      if (!entry || entry.undoable === false) {
        return failure("NOTHING_TO_UNDO", entry);
      }
      if (!apply(entry, "undo")) {
        return failure("UNDO_FAILED", entry);
      }
      done.pop();
      undone.push(entry);
      notify("undo", entry);
      return { ok: true, entry: light(entry, "undone") };
    }

    function redo() {
      if (open) {
        return failure("BATCH_OPEN");
      }
      var entry = undone[undone.length - 1];
      if (!entry) {
        return failure("NOTHING_TO_REDO");
      }
      if (!apply(entry, "redo")) {
        return failure("REDO_FAILED", entry);
      }
      undone.pop();
      done.push(entry);
      notify("redo", entry);
      return { ok: true, entry: light(entry, "done") };
    }

    function lastIndex(list, name, from) {
      for (var index = from === undefined ? list.length - 1 : from; index >= 0; index -= 1) {
        if (lanesOf(list[index]).indexOf(name) >= 0) {
          return index;
        }
      }
      return -1;
    }

    /* 묶음을 갈래 하나로 무를 수 있나 — 그 묶음의 갈래 모두에서 그 뒤에 한 것이 없어야 한다 */
    function free(list, index) {
      var names = lanesOf(list[index]);
      for (var later = index + 1; later < list.length; later += 1) {
        if (lanesOf(list[later]).some(function (name) { return names.indexOf(name) >= 0; })) {
          return false;
        }
      }
      return true;
    }

    /* 그 갈래의 마지막 일(갈래별 단추·FontStudio.undo 같은 예전 창구) */
    function undoLane(name) {
      if (open) {
        return failure("BATCH_OPEN");
      }
      var index = lastIndex(done, name);
      if (index < 0 || done[index].undoable === false) {
        return failure("NOTHING_TO_UNDO", index < 0 ? null : done[index]);
      }
      var entry = done[index];
      if (entry.parts && !free(done, index)) {
        return failure("ENTRY_BLOCKED", entry);
      }
      if (!apply(entry, "undo")) {
        return failure("UNDO_FAILED", entry);
      }
      done.splice(index, 1);
      undone.push(entry);
      notify("undo", entry);
      return { ok: true, entry: light(entry, "undone") };
    }

    function redoLane(name) {
      if (open) {
        return failure("BATCH_OPEN");
      }
      var index = lastIndex(undone, name);
      if (index < 0) {
        return failure("NOTHING_TO_REDO");
      }
      var entry = undone[index];
      if (entry.parts && !free(undone, index)) {
        return failure("ENTRY_BLOCKED", entry);
      }
      if (!apply(entry, "redo")) {
        return failure("REDO_FAILED", entry);
      }
      undone.splice(index, 1);
      done.push(entry);
      notify("redo", entry);
      return { ok: true, entry: light(entry, "done") };
    }

    function position(list, id) {
      for (var index = 0; index < list.length; index += 1) {
        if (list[index].id === id) {
          return index;
        }
      }
      return -1;
    }

    /* 그 항목까지 적용한 상태로(null이면 처음 상태) — 한 걸음씩 되돌리거나 다시 한다. 막히면 그 자리에서 멈추고 실패를 돌려준다 */
    function jump(id) {
      var result = { ok: true, steps: 0 };
      var step;
      if (id === null) {
        while (done.length && done[done.length - 1].undoable !== false) {
          step = undo();
          if (!step.ok) {
            return step;
          }
          result.steps += 1;
        }
        return result;
      }
      var at = position(done, id);
      if (at >= 0) {
        while (done.length - 1 > at) {
          step = undo();
          if (!step.ok) {
            return step;
          }
          result.steps += 1;
        }
        return result;
      }
      if (position(undone, id) < 0) {
        return failure("ENTRY_UNKNOWN");
      }
      while (position(undone, id) >= 0) {
        step = redo();
        if (!step.ok) {
          return step;
        }
        result.steps += 1;
      }
      return result;
    }

    /* 갈래가 제 자료를 모두 비웠다 — 그 갈래 줄(묶음 안 조각 포함)을 뺀다 */
    function forget(name) {
      var changed = false;
      function strip(list) {
        return list.filter(function (entry) {
          if (entry.parts) {
            var kept = entry.parts.filter(function (part) { return part.lane !== name; });
            if (kept.length !== entry.parts.length) {
              changed = true;
              entry.parts = kept;
              entry.bytes = kept.reduce(function (sum, part) { return sum + part.bytes; }, 0);
            }
            return kept.length > 0;
          }
          if (entry.lane === name) {
            changed = true;
            return false;
          }
          return true;
        });
      }
      done = strip(done);
      undone = strip(undone);
      if (changed) {
        notify("forget", null);
      }
      return changed;
    }

    /* 갈래가 제 가장 오래된 일을 스스로 버렸다(제 상한) — 시간축에서도 그 갈래의 가장 오래된 줄을 뺀다 */
    function dropOldestOf(name) {
      for (var index = 0; index < done.length; index += 1) {
        var entry = done[index];
        if (lanesOf(entry).indexOf(name) < 0) {
          continue;
        }
        if (entry.parts && entry.parts.length > 1) {
          entry.parts = entry.parts.filter(function (part, at) {
            return part.lane !== name || entry.parts.slice(0, at).some(function (other) { return other.lane === name; });
          });
          entry.bytes = entry.parts.reduce(function (sum, part) { return sum + part.bytes; }, 0);
        } else {
          done.splice(index, 1);
        }
        notify("drop", null);
        return true;
      }
      return false;
    }

    /* 다른 행위자가 이미 바꾼 것을 다시 적용하지 않고 줄로만 받는다 — 되돌릴 수 없고, 되돌리기는 그 앞을 넘지 않는다 */
    function receive(info) {
      var data = info || {};
      var entry = make("remote", { label: data.label || "다른 행위자가 바꿈", cause: data.cause || "remote", actor: data.actor,
        time: data.time, bytes: 64, undoable: false });
      return commitEntry(entry, []);
    }

    function entries() {
      return done.map(function (entry) { return light(entry, "done"); })
        .concat(undone.slice().reverse().map(function (entry) { return light(entry, "undone"); }));
    }

    /* 저장할 기록 — 이름·행위자·시각만(되돌릴 자료는 싣지 않는다). 되살리면 되돌릴 수 없는 지난 줄이 된다 */
    function serialize() {
      return {
        format: "font-kku-timeline",
        version: 1,
        entries: done.map(function (entry) {
          return { kind: entry.savedKind || entry.lane, cause: entry.cause, label: entry.label, actor: clone(entry.actor), time: entry.time };
        })
      };
    }

    function restore(saved) {
      done = [];
      undone = [];
      open = null;
      var list = saved && saved.format === "font-kku-timeline" && Array.isArray(saved.entries) ? saved.entries : [];
      list.forEach(function (item) {
        if (!isObject(item)) {
          return;
        }
        var entry = make("remote", { label: item.label, cause: item.cause || item.kind || "remote", actor: item.actor,
          time: typeof item.time === "number" ? item.time : undefined, bytes: 64, undoable: false });
        /* 되살린 줄은 되돌릴 수 없지만 원래 갈래를 지킨다 — 다시 저장해도 기록이 같다(저장 → 열기 → 저장 왕복) */
        if (typeof item.kind === "string" && item.kind !== "remote") {
          entry.savedKind = item.kind;
        }
        done.push(entry);
      });
      notify("restore", null);
      return done.length;
    }

    lanes.remote = { undo: function () { return false; }, redo: function () { return false; } };

    return {
      lane: function (name, spec) {
        if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name) || name === "group" || name === "remote") {
          throw new TypeError("font-studio-transactions: timeline lane name must match /^[a-z][a-z0-9-]*$/ (got " + JSON.stringify(name) + ")");
        }
        if (!spec || typeof spec.undo !== "function" || typeof spec.redo !== "function") {
          throw new TypeError("font-studio-transactions: timeline lane " + name + " needs undo(entry) and redo(entry)");
        }
        lanes[name] = spec;
        return function unregister() {
          if (lanes[name] === spec) {
            delete lanes[name];
            return true;
          }
          return false;
        };
      },
      lanes: function () {
        return Object.keys(lanes).filter(function (name) { return name !== "remote"; }).sort();
      },
      record: record,
      receive: receive,
      begin: begin,
      end: end,
      batch: batch,
      batching: function () { return Boolean(open); },
      applying: function () { return applying > 0; },
      undo: undo,
      redo: redo,
      undoLane: undoLane,
      redoLane: redoLane,
      jump: jump,
      forget: forget,
      dropOldestOf: dropOldestOf,
      entries: entries,
      index: function () { return done.length - 1; },
      size: function () { return done.length + undone.length; },
      bytes: total,
      budget: function () { return budget; },
      setBudget: function (bytes) {
        budget = positive(bytes, TIMELINE_BUDGET);
        trim();
        return budget;
      },
      limit: function () { return limit; },
      canUndo: function () { return done.length > 0 && done[done.length - 1].undoable !== false && !open; },
      canRedo: function () { return undone.length > 0 && !open; },
      canUndoLane: function (name) {
        var index = lastIndex(done, name);
        return index >= 0 && done[index].undoable !== false;
      },
      canRedoLane: function (name) { return lastIndex(undone, name) >= 0; },
      /* 되돌리기·다시 단추의 이름(툴팁) */
      peek: function () {
        var last = done[done.length - 1];
        var next = undone[undone.length - 1];
        return { undo: last && last.undoable !== false ? last.label : null, redo: next ? next.label : null };
      },
      entry: function (id) {
        var at = position(done, id);
        if (at >= 0) {
          return light(done[at], "done");
        }
        at = position(undone, id);
        return at >= 0 ? light(undone[at], "undone") : null;
      },
      serialize: serialize,
      restore: restore,
      clear: function () {
        done = [];
        undone = [];
        open = null;
        notify("clear", null);
      },
      on: function (listener) {
        listeners.push(listener);
        return function off() {
          listeners = listeners.filter(function (entry) { return entry !== listener; });
        };
      }
    };
  }

  // ── 검사 결과 ─────────────────────────────────────────────────────────

  function normalizeError(error) {
    if (typeof error === "string") {
      return { code: null, path: "", message: error };
    }
    var value = error || {};
    return {
      code: value.code || null,
      path: typeof value.path === "string" ? value.path : "",
      message: value.message !== undefined ? String(value.message) : String(error)
    };
  }

  /* validateDesign의 돌려준 값을 { ok, errors: [{ code, path, message }], warnings: [{ code, path, message }] }로 — 배열·
   * { ok, errors, warnings }·{ valid, errors }·불리언. warnings는 받아들이지만 알릴 진단(런타임 DesignWarningCode — 예전 런타임은
   * 내지 않아 빈 목록)이다. 통과하지 못한 디자인의 진단도 버리지 않는다 */
  function normalizeValidation(result) {
    if (result === true || result === undefined || result === null) {
      return { ok: true, errors: [], warnings: [] };
    }
    if (result === false) {
      return { ok: false, errors: [{ code: null, path: "", message: "invalid design" }], warnings: [] };
    }
    if (Array.isArray(result)) {
      return { ok: result.length === 0, errors: result.map(normalizeError), warnings: [] };
    }
    var errors = Array.isArray(result.errors) ? result.errors.map(normalizeError) : [];
    var warnings = Array.isArray(result.warnings) ? result.warnings.map(normalizeError) : [];
    var ok = "ok" in result ? Boolean(result.ok) : "valid" in result ? Boolean(result.valid) : errors.length === 0;
    if (!ok && !errors.length) {
      errors.push({ code: null, path: "", message: "invalid design" });
    }
    return { ok: ok, errors: ok ? [] : errors, warnings: warnings };
  }

  /* 런타임이 진단(warnings)을 내는가 — validateDesign이 돌려준 값으로(0.1.1 이후 { ok, errors, warnings }) */
  function reportsWarnings(result) {
    return Boolean(result) && typeof result === "object" && !Array.isArray(result) && Array.isArray(result.warnings);
  }

  // ── 참가자 상태 ───────────────────────────────────────────────────────

  /* base에 덮어쓸 참가자 상태를 얹은 새 묶음 */
  function mergeParticipants(base, overrides) {
    var out = clone(base || {}) || {};
    Object.keys(overrides || {}).forEach(function (name) {
      out[name] = clone(overrides[name]);
      if (out[name] === undefined) {
        out[name] = null;
      }
    });
    return out;
  }

  /* 두 묶음에서 값이 다른 참가자 이름(어느 쪽에만 있는 이름도) */
  function changedParticipants(a, b) {
    var left = a || {};
    var right = b || {};
    var names = Object.keys(left).concat(Object.keys(right).filter(function (name) { return !(name in left); }));
    return names.filter(function (name) {
      return stableJson(left[name]) !== stableJson(right[name]);
    }).sort();
  }

  // ── 묶음 편집 ─────────────────────────────────────────────────────────

  /* options: { label, base: { design, participants }, preview(pending, names) → 결과, commit(label, pending) → 결과|Promise,
   *            cancel(base, { noop }) }. update는 미리보기만 하고, commit은 바뀐 것이 있을 때만 options.commit을 한 번 부른다. */
  function createTransaction(options) {
    var opts = options || {};
    var base = {
      design: clone(opts.base && opts.base.design),
      participants: clone(opts.base && opts.base.participants) || {}
    };
    var pending = { design: clone(base.design), participants: {} };
    var open = true;

    function snapshot() {
      return { design: clone(pending.design), participants: clone(pending.participants) };
    }

    function changed() {
      return stableJson(pending.design) !== stableJson(base.design) ||
        Object.keys(pending.participants).some(function (name) {
          return stableJson(pending.participants[name]) !== stableJson(base.participants[name]);
        });
    }

    return {
      label: String(opts.label || ""),
      isOpen: function () {
        return open;
      },
      pending: snapshot,
      changed: changed,
      /* mutate(draft)는 다음 JSON을 돌려주거나 draft를 고치고 undefined. participants: { 이름: 다음 상태 } */
      update: function (mutate, participants) {
        if (!open) {
          return { ok: false, closed: true, errors: [] };
        }
        if (typeof mutate === "function") {
          var draft = clone(pending.design);
          var next = mutate(draft);
          pending.design = next === undefined ? draft : clone(next);
        }
        var names = Object.keys(participants || {});
        names.forEach(function (name) {
          pending.participants[name] = clone(participants[name]);
          if (pending.participants[name] === undefined) {
            pending.participants[name] = null;
          }
        });
        return typeof opts.preview === "function" ? opts.preview(snapshot(), names) : { ok: true, errors: [] };
      },
      commit: function () {
        if (!open) {
          return Promise.resolve({ ok: false, closed: true, errors: [] });
        }
        open = false;
        if (!changed()) {
          if (typeof opts.cancel === "function") {
            opts.cancel(clone(base), { noop: true });
          }
          return Promise.resolve({ ok: true, noop: true, cancelled: false, design: clone(base.design), errors: [], impact: null });
        }
        return Promise.resolve(typeof opts.commit === "function" ? opts.commit(this.label, snapshot()) : { ok: true, errors: [] });
      },
      cancel: function () {
        if (!open) {
          return { ok: false, closed: true, errors: [] };
        }
        open = false;
        if (typeof opts.cancel === "function") {
          opts.cancel(clone(base), { noop: false });
        }
        return { ok: false, cancelled: true, design: clone(base.design), errors: [], impact: null };
      }
    };
  }

  // ── 임시 등록 ─────────────────────────────────────────────────────────

  /* runtime: FontKku(registerDesign·unregisterDesign). unregisterDesign이 있으면 studio-tmp-<n> 이름을 돌려 쓴다(registerDesign
   * { replace: true }로 바꿔 쓰고 release에서 지운다). 새 번호가 이미 다른 쪽에 등록돼 있으면(designs() 또는 planJamo로 확인)
   * 건너뛴다 — 남의 디자인을 바꿔 쓰지 않는다. unregisterDesign이 없으면 내용 주소 이름 studio-tmp-<fnv>에 남기고 release는
   * 하지 않는다. 디자인이 검사에 걸리면 registerDesign의 오류(code·path)를 그대로 던진다. */
  function createLeasePool(runtime, options) {
    var opts = options || {};
    var prefix = opts.prefix || LEASE_PREFIX;
    var pooled = Boolean(runtime) && typeof runtime.unregisterDesign === "function" && opts.pooled !== false;
    var free = [];
    var live = {};
    var serial = 0;

    function addressed(json) {
      return prefix + "-" + fnv1a(stableJson(json));
    }

    /* 그 이름이 이미 등록돼 있는가 — FontKku.designs()(이름 또는 { name } 목록)가 있으면 그것, 없으면 planJamo가 푸는지 */
    function taken(name) {
      if (typeof runtime.designs === "function") {
        return (runtime.designs() || []).some(function (entry) {
          return (typeof entry === "string" ? entry : entry && entry.name) === name;
        });
      }
      if (typeof runtime.planJamo === "function") {
        try {
          runtime.planJamo("ㅇ", { design: name });
          return true;
        } catch (error) {
          return false;
        }
      }
      return false;
    }

    function fresh() {
      var name;
      do {
        serial += 1;
        name = prefix + "-" + serial;
      } while (taken(name) && serial < 10000);
      return name;
    }

    function lease(json) {
      if (!runtime || typeof runtime.registerDesign !== "function") {
        throw new TypeError("font-studio-transactions: lease needs FontKku.registerDesign");
      }
      if (!pooled) {
        var fixed = { name: addressed(json) };
        runtime.registerDesign(fixed.name, json);
        fixed.update = function (next) {
          var name = addressed(next);
          runtime.registerDesign(name, next);
          fixed.name = name;
          return name;
        };
        fixed.release = function () { return false; };
        return fixed;
      }
      var name = free.length ? free.shift() : fresh();
      try {
        runtime.registerDesign(name, json, { replace: true });
      } catch (error) {
        free.unshift(name);
        throw error;
      }
      var released = false;
      live[name] = true;
      return {
        name: name,
        update: function (next) {
          if (released) {
            throw new Error("font-studio-transactions: lease " + name + " is released");
          }
          runtime.registerDesign(name, next, { replace: true });
          return name;
        },
        release: function () {
          if (released) {
            return false;
          }
          released = true;
          delete live[name];
          runtime.unregisterDesign(name);
          free.push(name);
          return true;
        }
      };
    }

    return {
      pooled: pooled,
      lease: lease,
      live: function () {
        return Object.keys(live).sort();
      }
    };
  }

  var FontStudioTransactions = {
    DEFAULT_LIMIT: DEFAULT_LIMIT,
    LEASE_PREFIX: LEASE_PREFIX,
    clone: clone,
    stableJson: stableJson,
    fnv1a: fnv1a,
    createStore: createStore,
    TIMELINE_BUDGET: TIMELINE_BUDGET,
    TIMELINE_LIMIT: TIMELINE_LIMIT,
    createTimeline: createTimeline,
    normalizeValidation: normalizeValidation,
    reportsWarnings: reportsWarnings,
    mergeParticipants: mergeParticipants,
    changedParticipants: changedParticipants,
    createTransaction: createTransaction,
    createLeasePool: createLeasePool
  };

  global.FontStudioTransactions = FontStudioTransactions;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = FontStudioTransactions;
  }
})(typeof window !== "undefined" ? window : globalThis);
