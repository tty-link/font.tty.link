/* font-studio-design.js — 작업실 디자인 패널 (설계 v1.2 §13.1–13.2, ADR-025 F, ADR-026)
 *
 * 첫 화면은 세벌 고정 디자인이다: 주소에 글꼴(?font·?src)이나 재료 탭(#studio-material)을 밝히지 않고 들어오면 미리보기 바탕
 * 요소에 기본 디자인(1.2, sebul-fixed-v1, 선·원 재료)을 건다. 밝히고 들어오면 글꼴 CSS 그대로 보이고 디자인은 비교 칸에만 있다.
 * 시작 선택지 셋(선·원 / 직접 그려 / 기존 글꼴)은 재료만 바꾸고 배치를 지킨다. 대표 비교 칸(가 고 과 각 곽 · 가 나 간 난)은
 * 미리보기와 같은 글꼴 시트를 받는 따로 된 shadow root에서 늘 지금 디자인으로 그려, 고정 초성 ㄱ·중성 ㅏ가 몇 가지 자리에
 * 찍히는지 잰다. 고급(배치·문맥·JSON)에서 네모 문맥으로 바꾸면 문맥 규칙 탭이 열리고, 문맥 규칙이 있는 디자인을 세벌 고정으로
 * 되돌리려 하면 충돌을 보이고 고를 때까지 적용하지 않는다.
 *
 * 디자인은 먼저 FontKku.validateDesign으로 검사해 오류를 모두 보이고(코드는 영어 그대로, 흔한 코드는 한국어 설명), 통과하면
 * 이름 하나(studio-design)를 registerDesign(…, { replace: true })로 바꿔 등록한다 — 고치고 되돌려도 등록부가 늘지 않고, 그 이름을
 * 고른 미리보기·비교 칸은 런타임이 다시 그린다. 검사에 걸리면 미리보기는 마지막 정상 디자인을 보이되 실패 표시를 지우지 않는다
 * (§13.6). 그림 자소(sprite) 글꼴과 표준 잉크 상자를 밝히지 않은 글꼴은 디자인을 받지 않는다 — 런타임이 바탕 요소에 남긴
 * DESIGN_UNSUPPORTED_FONT(data-fy-design-status)를 읽어 "받지 않음"으로 보인다.
 *
 * 편집 창구(PLAN-HANGUL-001 F0): 모든 바꾸기는 commit 한 길을 지나 이름 붙은 기록(FontStudioTransactions.createStore)에 남는다.
 * 뒤 묶음(조립식 비교·그리기·팔레트·묶음 파일·편집 기록)은 FontStudio.design.edit/begin으로 바꾸고, 디자인 JSON 밖의 상태(그림
 * 문서 등)는 참가자(participant)로 올려 되돌리기·프로젝트·초안이 디자인과 함께 싣게 한다. 비교·후보 미리보기는 lease(임시 이름)로.
 */
(function () {
  "use strict";

  var Studio = window.FontStudio;
  var Design = window.FontStudioDesign;
  var Tx = window.FontStudioTransactions;
  var FontKku = window.FontKku;
  var section = document.querySelector("[data-studio-design]");
  var studioRoot = document.querySelector("[data-studio]");
  if (!Studio || !Design || !Tx || !section || !studioRoot) {
    return;
  }
  if (!FontKku || typeof FontKku.registerDesign !== "function" || typeof FontKku.validateDesign !== "function" ||
      !FontKku.layoutProfiles || !FontKku.layoutProfiles[Design.FIXED_PROFILE]) {
    section.dataset.designState = "unavailable";
    section.hidden = true;
    return;
  }

  var profiles = FontKku.layoutProfiles;
  var host = Studio.host;
  var params = new URLSearchParams(location.search);
  var HISTORY_LIMIT = 60;
  var COMPARE_SIZE = "44px";
  var UNSUPPORTED = "DESIGN_UNSUPPORTED_FONT";
  var MODE_LABELS = {};
  Design.MATERIALS.forEach(function (entry) { MODE_LABELS[entry.mode] = entry.title; });
  /* 기록(traceOf)의 결과 — 직접 그린 것인가, 조합한 것인가, 대체된 것인가(설계 v1.2 §13.5) */
  var RESULT_LABELS = { direct: "원본 그대로", composed: "조합", strokes: "획(원소)", primitive: "원소로 대체", none: "그리지 않음" };
  var STATUS_LABELS = { pending: "그림 세트 받는 중" };
  var METHOD_LABELS = { auto: "자동", direct: "원본", compose: "조합" };
  var IDENTITY_LABELS = { unverified: "출처 미확인", "fallback-suspected": "대체 글꼴 의심", verified: "확인" };

  var state = {
    json: Design.defaultDesign(profiles),
    /* 맨 주소로 들어오면 미리보기도 디자인을 따른다(설계 v1.2 §13.1·L25 — 밝힌 글꼴·저장한 작업은 그대로) */
    applied: !params.has("src") && !params.has("font") && location.hash !== "#studio-material",
    name: null,
    revision: null,
    status: "",
    reason: "",
    error: null,
    supported: null,
    conflicts: null,
    picked: null,
    loadingSets: {},
    failedSets: {},
    compareTimer: null,
    readouts: {},
    identity: null,
    /* 묶음 편집(begin)이 미리보기 중인 임시 이름 — 있으면 미리보기·비교 칸이 이 이름을 그린다 */
    previewName: null
  };
  /* 이름 붙은 편집 기록 — 항목마다 바꾸기 전·후 { design, participants } */
  var store = Tx.createStore({ limit: HISTORY_LIMIT });
  /* 참가자: 이름 → { get, set, preview? }. restored: 마지막으로 연 프로젝트·초안의 참가자 상태 중 아직 받을 참가자가 없는 것
   * (늦게 붙는 모듈이 따라잡고, 받을 모듈이 없으면 프로젝트를 저장할 때 그대로 싣는다) */
  var participants = {};
  var restored = {};
  var listeners = { change: [], status: [] };
  var busyChecks = [];
  var lastStatus = null;
  var impactHandler = defaultImpactHandler;
  var lastImpact = null;
  var openTransaction = null;
  var runtime = {
    validate: typeof FontKku.validateDesign === "function",
    /* registerDesign의 { replace: true }는 validateDesign·unregisterDesign과 함께 들어왔다(0.1.1 런타임 디자인 API) */
    replace: typeof FontKku.validateDesign === "function",
    unregister: typeof FontKku.unregisterDesign === "function",
    designs: typeof FontKku.designs === "function"
  };
  var leases = Tx.createLeasePool(FontKku, { prefix: Tx.LEASE_PREFIX, pooled: runtime.replace && runtime.unregister });

  function $(selector) {
    return section.querySelector(selector);
  }

  var textarea = $("[data-design-json]");
  var advanced = $("[data-design-advanced]");
  var main = $("[data-design-main]");

  /* 접기 — 글꼴을 밝히고 들어오면(글꼴 CSS 편집) 머리 줄만 두고 접는다. 접힌 동안 비교 칸은 그리지 않는다 */
  function fold(open) {
    var opened = Boolean(open);
    main.hidden = !opened;
    var button = $("[data-design-fold]");
    button.setAttribute("aria-expanded", String(opened));
    button.textContent = opened ? "접기" : "펼치기";
    section.dataset.designFolded = String(!opened);
    if (opened) {
      renderCompare();
    }
    return opened;
  }

  function note(text, tone) {
    var node = $("[data-design-message]");
    node.textContent = text || "";
    node.dataset.tone = tone || "info";
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  }

  // ── 등록과 적용 ────────────────────────────────────────────────────────

  /* 검사 — 런타임 validateDesign(오류 전부)의 돌려준 값을 { ok, errors: [{ code, path, message }] }로 맞춘다 */
  function validate(json) {
    try {
      return Tx.normalizeValidation(FontKku.validateDesign(json));
    } catch (error) {
      return { ok: false, errors: [errorEntry(error)] };
    }
  }

  function errorEntry(error, code) {
    return { code: error && error.code || code || null, path: error && error.path || "", message: error && error.message || String(error) };
  }

  /* 검사(오류 전부) → 이름 하나에 바꿔 등록. 실패하면 { errors: [{ code, path, message }] } */
  function register(json) {
    var check = validate(json);
    if (!check.ok) {
      return { errors: check.errors };
    }
    try {
      return { name: Design.STUDIO_NAME, revision: FontKku.registerDesign(Design.STUDIO_NAME, json, { replace: true }).revision };
    } catch (error) {
      return { errors: [errorEntry(error)] };
    }
  }

  /* 미리보기·비교 칸이 그릴 이름 — 묶음 편집이 미리보기 중이면 그 임시 이름 */
  function drawnName() {
    return state.previewName || state.name;
  }

  function applyToHost() {
    if (state.applied && drawnName()) {
      host.style.setProperty("--fy-design", drawnName());
    } else {
      host.style.removeProperty("--fy-design");
    }
  }

  function rerender() {
    if (Studio.doc()) {
      Studio.rerender(); // → render 훅이 상태를 가리고 비교 칸을 다시 그린다
    }
  }

  // ── 참가자 ───────────────────────────────────────────────────────────

  function has(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
  }

  /* 지금 참가자 상태 묶음(복사본) — 기록 항목의 participants */
  function participantStates() {
    var out = {};
    Object.keys(participants).sort().forEach(function (name) {
      var value = Design.clone(participants[name].get());
      out[name] = value === undefined ? null : value;
    });
    return out;
  }

  /* 참가자 하나에 상태를 넣는다. 참가자가 던지면 화면은 멈추지 않고 페이지 오류로 알린다 */
  function setParticipant(name, value) {
    var entry = participants[name];
    if (!entry) {
      return false;
    }
    try {
      entry.set(value === undefined ? null : Design.clone(value));
      return true;
    } catch (error) {
      setTimeout(function () { throw error; }, 0);
      return false;
    }
  }

  /* 참가자를 target 묶음의 값으로(바뀐 것만). 넣은 이름 목록 */
  function applyParticipants(target) {
    var current = participantStates();
    return Tx.changedParticipants(current, target || {}).filter(function (name) {
      return has(participants, name) && has(target, name) && setParticipant(name, target[name]);
    });
  }

  function emitEvent(name, payload) {
    listeners[name].slice().forEach(function (listener) {
      try {
        listener(payload);
      } catch (error) {
        setTimeout(function () { throw error; }, 0); // 듣는 쪽 오류가 편집을 깨뜨리지 않게 — 페이지 오류로만 알린다
      }
    });
  }

  /* 디자인 하나를 등록해 적용한다. 실패하면 마지막 정상 디자인을 두고 실패를 보인다(text: 그때 JSON 칸에 남길 원문).
   * options: { label(기록 이름), participants({ 이름: 다음 상태 } — 디자인보다 먼저 넣는다: 그림 세트가 디자인보다 먼저 등록되게),
   *            cause(change 사건의 까닭), record(false면 기록하지 않음), edited(false면 초안을 쓰지 않음), note, tone, text, where } */
  function commit(json, options) {
    var opts = options || {};
    if (openTransaction && openTransaction.isOpen()) {
      openTransaction.cancel(); // 묶음 편집 중에 다른 길로 바꾸면 묶음은 버린다(미리보기를 거두고 기록하지 않는다)
    }
    var beforeParticipants = participantStates();
    var touched = opts.participants ? Tx.changedParticipants(beforeParticipants, Tx.mergeParticipants(beforeParticipants, opts.participants))
      .filter(function (name) { return has(participants, name) && setParticipant(name, opts.participants[name]); }) : [];
    var result = register(json);
    if (result.errors) {
      touched.forEach(function (name) { setParticipant(name, beforeParticipants[name]); });
      fail(result.errors, opts.text !== undefined ? opts.text : Design.pretty(json), opts.where);
      return false;
    }
    if (opts.record !== false && state.name && (touched.length || Design.stableJson(json) !== Design.stableJson(state.json))) {
      store.record({
        label: opts.label || "디자인 바꾸기",
        before: { design: state.json, participants: beforeParticipants },
        after: { design: json, participants: participantStates() }
      });
    }
    state.json = Design.clone(json);
    state.name = result.name;
    state.revision = result.revision;
    state.error = null;
    state.conflicts = null;
    ensureSets();
    applyToHost();
    syncForm();
    renderErrors([]);
    if (opts.note) {
      note(opts.note, opts.tone);
    }
    if (opts.edited !== false) {
      Studio.markEdited(); // 초안·프로젝트가 디자인을 싣는다(불러오기만으로는 쓰지 않는다)
    }
    rerender();
    emitEvent("change", { json: Design.clone(state.json), name: state.name, label: opts.label || "", cause: opts.cause || "edit" });
    return true;
  }

  // ── 편집 창구(F0) ─────────────────────────────────────────────────────

  function defaultImpactHandler() {
    return true;
  }

  function editResult(ok, extra) {
    var out = { ok: ok, design: Design.clone(state.json), errors: [], impact: null, cancelled: false };
    Object.keys(extra || {}).forEach(function (key) { out[key] = extra[key]; });
    return out;
  }

  /* 편집 한 번: mutate(draft)가 다음 JSON을 돌려주거나 draft를 고친다. 검사(오류 전부) → (opts.impact면) 영향 처리기에 묻기 →
   * 참가자 넣기 → 등록 → 기록 한 줄 → 적용 → change 사건. 검사에 걸리면 기록하지 않고 마지막 정상 디자인을 둔다(§13.6).
   * opts: { participants: { 이름: 다음 상태 }, impact: true | { sets: { before, after } }, note, tone, cause } */
  function edit(label, mutate, options) {
    var opts = options || {};
    var name = String(label || "디자인 바꾸기");
    var next;
    try {
      var draft = Design.clone(state.json);
      var out = typeof mutate === "function" ? mutate(draft) : mutate;
      next = out === undefined ? draft : Design.clone(out);
    } catch (error) {
      note("⚠ " + name + " — 편집을 만들지 못했습니다: " + (error && error.message || error), "error");
      return Promise.resolve(editResult(false, { errors: [errorEntry(error, "STUDIO_EDIT_FAILED")] }));
    }
    var unknown = Object.keys(opts.participants || {}).filter(function (key) { return !has(participants, key); });
    if (unknown.length) {
      return Promise.resolve(editResult(false, { errors: [{ code: "STUDIO_PARTICIPANT_UNKNOWN", path: "participants." + unknown[0],
        message: "participant " + JSON.stringify(unknown[0]) + " is not registered" }] }));
    }
    var check = validate(next);
    if (!check.ok) {
      fail(check.errors, Design.pretty(next));
      return Promise.resolve(editResult(false, { errors: check.errors }));
    }
    var before = { design: Design.clone(state.json), participants: participantStates() };
    var baseText = Design.stableJson(before);
    var after = { design: next, participants: Tx.mergeParticipants(before.participants, opts.participants) };
    var ctx = null;

    function apply() {
      var ok = commit(next, { label: name, participants: opts.participants, cause: opts.cause || "edit",
        note: opts.note !== undefined ? opts.note : name, tone: opts.tone });
      return editResult(ok, { errors: ok ? [] : (state.error ? state.error.errors : []), impact: ctx });
    }

    if (!opts.impact) {
      return Promise.resolve(apply());
    }
    ctx = { label: name, before: before, after: Design.clone(after),
      sets: opts.impact && typeof opts.impact === "object" && opts.impact.sets ? Design.clone(opts.impact.sets) : null };
    lastImpact = ctx;
    return Promise.resolve().then(function () {
      return impactHandler(Design.clone(ctx));
    }).then(function (accepted) {
      if (accepted === false) {
        note(name + " — 바꾸지 않았습니다.");
        return editResult(false, { cancelled: true, impact: ctx });
      }
      if (Design.stableJson({ design: state.json, participants: participantStates() }) !== baseText) {
        note("⚠ " + name + " — 영향을 확인하는 동안 디자인이 바뀌어 적용하지 않았습니다. 다시 하세요.", "warn");
        return editResult(false, { cancelled: true, impact: ctx,
          errors: [{ code: "STUDIO_EDIT_STALE", path: "", message: "the design changed while the impact was pending" }] });
      }
      return apply();
    });
  }

  /* 묶음 편집: update는 미리보기만(참가자 preview, 디자인은 임시 이름), commit에서 기록 한 줄. 열린 묶음이 있으면 먼저 취소한다 */
  function begin(label) {
    if (openTransaction && openTransaction.isOpen()) {
      openTransaction.cancel();
    }
    var lease = null;
    var previewed = {};

    function cleanup() {
      state.previewName = null;
      applyToHost();
      renderCompare();
      Object.keys(previewed).forEach(function (key) {
        var entry = participants[key];
        if (entry && typeof entry.preview === "function") {
          entry.preview(Design.clone(entry.get()));
        }
      });
    }

    function releaseLease() {
      if (lease) {
        lease.release();
        lease = null;
      }
    }

    var tx = Tx.createTransaction({
      label: label,
      base: { design: state.json, participants: participantStates() },
      preview: function (pending, names) {
        names.forEach(function (key) {
          var entry = participants[key];
          if (entry && typeof entry.preview === "function") {
            previewed[key] = true;
            entry.preview(Design.clone(pending.participants[key]));
          }
        });
        if (Design.stableJson(pending.design) === Design.stableJson(state.json)) {
          if (state.previewName) {
            state.previewName = null;
            applyToHost();
            rerender();
          }
          return { ok: true, errors: [] };
        }
        var check = validate(pending.design);
        if (!check.ok) {
          return { ok: false, errors: check.errors }; // 미리보기는 마지막으로 통과한 묶음 상태에 둔다
        }
        try {
          if (lease) {
            lease.update(pending.design);
          } else {
            lease = leases.lease(pending.design);
          }
        } catch (error) {
          return { ok: false, errors: [errorEntry(error)] };
        }
        state.previewName = lease.name;
        applyToHost();
        rerender();
        return { ok: true, errors: [], name: lease.name };
      },
      commit: function (txLabel, pending) {
        cleanup();
        var running = edit(txLabel, function () { return pending.design; }, { participants: pending.participants });
        return running.then(function (result) {
          if (!result.ok) {
            rerender(); // 적용하지 않았으면 미리보기를 마지막 정상 디자인으로 다시 그린다
          }
          releaseLease();
          return result;
        });
      },
      cancel: function () {
        cleanup();
        rerender();
        releaseLease();
      }
    });
    openTransaction = tx;
    return {
      label: tx.label,
      update: tx.update,
      pending: tx.pending,
      isOpen: tx.isOpen,
      commit: function () { return tx.commit(); },
      cancel: function () { return tx.cancel(); },
      lease: function () { return lease ? lease.name : null; }
    };
  }

  /* 참가자 등록 — spec: { get() → 상태(JSON), set(상태|null), preview?(상태) }. 마지막으로 연 프로젝트·초안에 이 참가자의 상태가
   * 있었으면 따라잡는다. 지우는 함수를 돌려준다 */
  function participant(name, spec) {
    if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/.test(name)) {
      throw new TypeError("font-studio: participant name must match /^[a-z][a-z0-9-]*$/ (got " + JSON.stringify(name) + ")");
    }
    if (!spec || typeof spec.get !== "function" || typeof spec.set !== "function") {
      throw new TypeError("font-studio: participant " + name + " needs get() and set(state)");
    }
    if (has(participants, name)) {
      throw new Error("font-studio: participant " + name + " is already registered");
    }
    participants[name] = { get: spec.get, set: spec.set, preview: typeof spec.preview === "function" ? spec.preview : null };
    if (has(restored, name)) {
      var saved = restored[name];
      delete restored[name];
      setParticipant(name, saved);
    }
    return function unregister() {
      if (participants[name] && participants[name].get === spec.get) {
        delete participants[name];
        return true;
      }
      return false;
    };
  }

  /* 기록의 한 상태로 — 참가자를 먼저(바뀐 것만), 그다음 디자인. 실패하면 기록 자리(previousIndex)와 참가자를 되돌린다 */
  function jumpTo(target, cause, label, previousIndex) {
    var previous = participantStates();
    var setNames = applyParticipants(target.participants);
    var ok = commit(target.design, { record: false, cause: cause, label: label,
      note: (cause === "undo" ? "디자인을 되돌렸습니다" : cause === "redo" ? "디자인을 다시 적용했습니다" : "편집 기록으로 옮겼습니다") +
        (label ? " — " + label : "") + "." });
    if (!ok) {
      store.seek(previousIndex);
      setNames.forEach(function (key) { setParticipant(key, previous[key]); });
    }
    return ok;
  }

  /* errors: [{ code, path, message }](검사 오류 전부) — 문법 오류는 code 없이 한 건 */
  function fail(errors, text, where) {
    state.error = { errors: errors, where: where || "validateDesign" };
    if (typeof text === "string") {
      textarea.value = text;
    }
    renderErrors(errors, where);
    note("⚠ 디자인을 적용하지 못했습니다" + (errors.length > 1 ? "(오류 " + errors.length + "건)" : "") +
      " — 미리보기는 마지막 정상 디자인" + (state.revision ? "(revision " + state.revision + ")" : "") + "입니다: " + Design.errorLine(errors[0]), "error");
    fold(true);
    advanced.open = true;
    syncStatus();
  }

  /* 오류마다 한 줄: 코드(영어 그대로) · 한국어 설명(흔한 코드) · 런타임 문구(자리 포함) */
  function renderErrors(errors, where) {
    var list = $("[data-design-errors]");
    list.textContent = "";
    errors.forEach(function (error) {
      var entry = Design.describeError(error);
      var item = document.createElement("li");
      item.dataset.severity = "error";
      if (entry.code) {
        item.dataset.code = entry.code;
        var code = document.createElement("code");
        code.textContent = entry.code;
        item.appendChild(code);
        item.appendChild(document.createTextNode(" "));
      }
      if (entry.path) {
        item.dataset.path = entry.path;
      }
      if (entry.text) {
        var text = document.createElement("span");
        text.className = "studio-design-error-text";
        text.textContent = entry.text;
        item.appendChild(text);
        item.appendChild(document.createTextNode(" — "));
      }
      var detail = document.createElement("span");
      detail.className = "studio-design-error-detail";
      detail.textContent = entry.message;
      item.appendChild(detail);
      list.appendChild(item);
    });
    if (errors.length && where !== "parse") {
      var hint = document.createElement("li");
      hint.dataset.hint = "";
      hint.textContent = "검사 오류 " + errors.length + "건(FontKku.validateDesign) — 모두 고친 뒤 'JSON 적용'을 다시 누르세요.";
      list.appendChild(hint);
    }
    list.dataset.count = String(errors.length);
    list.hidden = errors.length === 0;
    $("[data-design-revert]").hidden = errors.length === 0;
  }

  /* 받지 않는 까닭 — 런타임 진단(DESIGN_UNSUPPORTED_FONT)이 정본이고, 글꼴 재료(fontInfo.material)로 무엇 때문인지만 풀어 쓴다 */
  function unsupportedReason(target) {
    var info = FontKku.fontInfo(target);
    var material = info && info.material ? info.material : "system";
    return (material !== "system"
      ? "그림 자소(" + material + " 재료) 글꼴은 디자인을 받지 않습니다 — 미리보기는 글꼴의 자소판으로 그립니다"
      : "이 글꼴은 표준 잉크 상자(--fy-font-ink-boxes)를 밝히지 않아 디자인을 받지 않습니다 — sebul·gothic 같은 기본 제공 글꼴을 쓰세요") +
      " (" + UNSUPPORTED + ")";
  }

  /* 바탕 요소 하나가 지금 디자인을 받는가 — 받으면 { ok: true }, 런타임이 받지 않는다고 했으면 { ok: false, reason }, 모르면 null */
  function supportOf(target) {
    if (target.dataset.fyDesignStatus === UNSUPPORTED) {
      return { ok: false, reason: unsupportedReason(target) };
    }
    return drawnName() && target.dataset.fyDesign === drawnName() ? { ok: true, reason: "" } : null;
  }

  /* 미리보기 글꼴이 디자인을 받는가 — 미리보기에 걸었으면 미리보기, 아니면 같은 글꼴로 그린 비교 칸(펼쳤을 때)이 알려 준다 */
  function designSupport() {
    var own = state.applied ? supportOf(host) : null;
    if (own) {
      return own;
    }
    var row = compare[Design.COMPARE_ROWS[0].id];
    return row && !main.hidden && row.host.getAttribute("font") === Studio.state.fontId ? supportOf(row.host) : null;
  }

  /* 렌더마다: 미리보기에 디자인이 실제로 걸렸는지 가린다(applied · off · invalid · unsupported · pending) */
  function classify() {
    var support = designSupport();
    var status = host.dataset.fyDesignStatus || "";
    var drawn = Boolean(drawnName()) && host.dataset.fyDesign === drawnName();
    if (state.error) {
      state.status = "invalid";
      state.reason = "";
    } else if (!state.applied) {
      state.status = "off";
      state.reason = support && !support.ok ? support.reason : "";
    } else if (drawn) {
      state.status = "applied";
      state.reason = "";
    } else if (status === UNSUPPORTED) {
      state.status = "unsupported";
      state.reason = support ? support.reason : unsupportedReason(host);
    } else if (status) {
      state.status = "invalid";
      state.reason = "런타임 진단 " + status;
    } else {
      /* 런타임이 아직 디자인을 읽지 않았다(바탕 요소가 문서 밖이거나 글꼴 CSS가 오는 중) — 받지 않는다고 짐작하지 않는다 */
      state.status = "pending";
      state.reason = "";
    }
    state.supported = support ? support.ok : null;
    syncStatus();
  }

  function syncStatus() {
    var status = state.error ? "invalid" : state.status;
    section.dataset.designState = status || "";
    var apply = $("[data-design-apply]");
    apply.checked = state.applied;
    /* 받지 않는 글꼴에서는 켤 수 없다 — 켠 채로 받지 않는 글꼴을 열었으면 끌 수는 있다 */
    apply.disabled = state.supported === false && !state.applied;
    var reason = $("[data-design-apply-reason]");
    reason.textContent = state.reason || "";
    reason.hidden = !state.reason;
    var summary = status === "invalid" ? "적용 실패 — 마지막 정상 디자인 표시" : state.status === "applied" ? "미리보기에 적용됨"
      : state.status === "off" ? (state.supported === false ? "미리보기는 글꼴 CSS — 이 글꼴은 디자인을 받지 않음" : "미리보기는 글꼴 CSS — 비교 칸만 디자인")
      : state.status === "unsupported" ? "이 글꼴은 디자인을 받지 않음"
      : state.status === "pending" ? "미리보기가 디자인을 읽는 중" : "";
    $("[data-design-summary]").textContent = summary;
    if (status !== lastStatus) {
      lastStatus = status;
      emitEvent("status", { state: status || "", reason: state.reason || "" });
    }
  }

  // ── 재료 · 배치 · 충돌 ─────────────────────────────────────────────────

  function setMode(mode, extra) {
    var paramsFor = extra || (mode === "svg" ? { set: $("[data-design-set]").value || undefined }
      : mode === "font" ? { families: readFamilies() } : null);
    var result = Design.withMode(state.json, mode, paramsFor);
    var set = mode === "svg" ? Design.currentSet(result.design) : null;
    return commit(result.design, {
      label: "재료: " + MODE_LABELS[mode] + (set ? " (" + set + ")" : ""),
      note: MODE_LABELS[mode] + " — 재료를 바꿨습니다(배치 " + Design.layoutLabel(Design.layoutState(result.design, profiles).profile) + " 그대로)" +
        (result.dropped.length ? ". 사라진 소스를 가리키던 규칙 " + result.dropped.join(", ") + "을 뺐습니다" : ""),
      tone: result.dropped.length ? "warn" : "info"
    });
  }

  function readFamilies() {
    var families = { base: $("[data-design-family]").value.trim() };
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-family-role]"), function (input) {
      if (input.value.trim()) {
        families[input.dataset.designFamilyRole] = input.value.trim();
      }
    });
    return families;
  }

  function setLayout(profile) {
    if (!profiles[profile]) {
      note("모르는 배치 프로파일입니다: " + profile, "error");
      return false;
    }
    var result = Design.withLayout(state.json, profile, profiles);
    if (result.conflicts.length) {
      state.conflicts = { profile: profile, conflicts: result.conflicts, collisions: [] };
      fold(true);
      advanced.open = true;
      syncForm();
      note("세벌 고정은 역할·자모로만 고릅니다 — 아래 충돌을 정리하기 전에는 배치를 바꾸지 않습니다.", "warn");
      return false;
    }
    return commit(result.design, { label: "배치: " + Design.layoutLabel(profile), note: Design.layoutLabel(profile) + " 배치로 바꿨습니다" +
      (profiles[profile].model === "fixed-three" ? "." : " — 문맥 규칙 탭이 열렸습니다. 자리·자모·문맥 편집은 살펴보기에서 그대로 합니다.") });
  }

  function resolveConflicts(kind) {
    if (!state.conflicts) {
      return false;
    }
    if (kind === "cancel") {
      state.conflicts = null;
      syncForm();
      note("배치를 바꾸지 않았습니다.");
      return false;
    }
    var result = Design.resolveConflicts(state.json, kind, state.conflicts.profile, profiles);
    if (!result.design) {
      state.conflicts.collisions = result.collisions || [];
      syncForm();
      note("역할별 값으로 확정하면 같은 자모·역할에 다른 값이 남습니다 — 합치지 않았습니다. 규칙을 지우거나 JSON에서 하나를 고르세요.", "error");
      return false;
    }
    var profile = state.conflicts.profile;
    return commit(result.design, {
      label: "충돌 정리: " + (kind === "drop" ? "문맥 규칙 지우기" : "역할별 값으로 확정") + " → " + Design.layoutLabel(profile),
      note: Design.layoutLabel(profile) + " 배치로 바꿨습니다 — " + (kind === "drop" ? "지운 규칙: " + (result.removed.join(", ") || "없음")
        : "역할별 값으로 확정: " + (result.flattened.join(", ") || "없음") + (result.removed.length ? " · 지운 규칙: " + result.removed.join(", ") : ""))
    });
  }

  function setApplied(on) {
    state.applied = Boolean(on);
    applyToHost();
    Studio.markEdited();
    if (state.applied && main.hidden) {
      fold(true);
    }
    note(state.applied ? "미리보기에 디자인을 적용했습니다." : "미리보기는 글꼴 CSS로 그립니다 — 비교 칸은 계속 디자인을 보입니다.");
    rerender();
    if (!Studio.doc()) {
      syncStatus();
    }
    return state.applied;
  }

  /* 되돌리기·다시는 기록 항목의 before·after로 — 참가자도 함께 */
  function undo() {
    var entry = store.current();
    var previousIndex = store.index();
    var target = store.undo();
    return target !== null && jumpTo(target, "undo", entry && entry.label, previousIndex);
  }

  function redo() {
    var entry = store.next();
    var previousIndex = store.index();
    var target = store.redo();
    return target !== null && jumpTo(target, "redo", entry && entry.label, previousIndex);
  }

  /* 기록의 그 항목까지 적용한 상태로(id가 null이면 처음 상태) */
  function jump(id) {
    if (id === undefined) {
      return false;
    }
    var previousIndex = store.index();
    var entry = id === null ? null : store.entry(id);
    var target = store.jump(id);
    return target !== null && jumpTo(target, "jump", entry ? entry.label : "처음 상태", previousIndex);
  }

  /* JSON 칸(또는 넘겨받은 글·객체)을 적용 */
  function setJson(input, label, historyLabel) {
    var text = typeof input === "string" ? input : Design.pretty(input);
    var parsed = Design.parseDesignText(text);
    if (parsed.error) {
      fail([{ code: null, path: "", message: parsed.error.message }], text, "parse");
      return false;
    }
    var legacy = Design.layoutState(parsed.design, profiles).kind === "legacy";
    return commit(parsed.design, {
      text: text,
      label: historyLabel || "JSON 적용",
      cause: "json",
      note: (label || "디자인 JSON을 적용했습니다") +
        (legacy ? " — 배치를 적지 않은 " + (parsed.design.version || "1.0") + " 디자인이라 지금 배치로 그립니다(세벌 고정으로 바꾸지 않음)." : ".")
    });
  }

  /* 프로젝트·초안의 디자인을 연다 — 기록을 비우고, 참가자를 먼저(저장한 상태, 없으면 null) 넣은 뒤 디자인을 적용한다.
   * 받을 참가자가 아직 없는 상태는 restored에 두어 늦게 붙는 참가자가 따라잡는다 */
  function restore(saved, label) {
    if (!saved || typeof saved !== "object" || !saved.json) {
      return false;
    }
    state.applied = saved.applied !== false;
    store.clear();
    var incoming = saved.participants && typeof saved.participants === "object" && !Array.isArray(saved.participants) ? saved.participants : {};
    restored = {};
    Object.keys(incoming).forEach(function (key) {
      if (!has(participants, key)) {
        restored[key] = Design.clone(incoming[key]);
      }
    });
    Object.keys(participants).sort().forEach(function (key) {
      setParticipant(key, has(incoming, key) ? incoming[key] : null);
    });
    return commit(saved.json, { record: false, edited: false, cause: "restore", label: "프로젝트 열기",
      note: label || "프로젝트의 디자인을 열었습니다." });
  }

  // ── 그림 세트 ─────────────────────────────────────────────────────────

  function shippedSet(id) {
    return Design.SVG_SETS.some(function (entry) { return entry.id === id; });
  }

  function registeredSets() {
    return typeof FontKku.jamoSets === "function" ? FontKku.jamoSets() : [];
  }

  /* 디자인이 쓰는 기본 제공 그림 세트를 싣는다(작업실의 font-kku.js는 자동 불러오기를 켜지 않았다). 실리면 런타임이 그 세트를
   * 쓰는 바탕 요소를 다시 그린다. */
  function ensureSets() {
    var sources = state.json.sources || {};
    Object.keys(sources).forEach(function (id) {
      var set = sources[id] && sources[id].kind === "svg" ? sources[id].assetSet : null;
      if (!set || !shippedSet(set) || registeredSets().indexOf(set) >= 0 || state.loadingSets[set] || state.failedSets[set]) {
        return;
      }
      var script = document.createElement("script");
      state.loadingSets[set] = true;
      script.src = new URL("profiles/" + set + ".jamo.js", new URL(".", Studio.coreHref())).href;
      script.addEventListener("load", function () {
        delete state.loadingSets[set];
        syncForm();
        renderCompare();
      });
      script.addEventListener("error", function () {
        delete state.loadingSets[set];
        state.failedSets[set] = true;
        note("그림 세트 " + set + "를 싣지 못했습니다 — 그림이 없는 자모는 원소로 그립니다.", "warn");
        syncForm();
      });
      document.head.appendChild(script);
    });
  }

  function progressText(set) {
    if (state.loadingSets[set]) {
      return "그림 세트 " + set + " 받는 중…";
    }
    if (registeredSets().indexOf(set) < 0 || typeof FontKku.authoringProgress !== "function") {
      return "⚠ 그림 세트 '" + set + "'가 등록되지 않았습니다 — 그림이 없는 자모는 원소로 그리고 기록에 출처를 남깁니다";
    }
    var progress = FontKku.authoringProgress(set);
    var names = { origin8: "원형 8", basic24: "기본 24", full40: "확장 40" };
    return progress.stages.map(function (stage) {
      return names[stage.stage] + " " + stage.have.length + "/" + stage.total;
    }).join(" · ") + (progress.next ? " — 다음 목표 " + names[progress.next] : " — 모두 그림");
  }

  // ── 폼 동기화 ────────────────────────────────────────────────────────

  function fillSetOptions(current) {
    var select = $("[data-design-set]");
    var ids = Design.SVG_SETS.map(function (entry) { return entry.id; });
    registeredSets().forEach(function (id) {
      if (ids.indexOf(id) < 0 && !/^sprite-|^pixel$/.test(id)) {
        ids.push(id);
      }
    });
    if (current && ids.indexOf(current) < 0) {
      ids.push(current);
    }
    var labels = {};
    Design.SVG_SETS.forEach(function (entry) { labels[entry.id] = entry.label; });
    if (select.options.length !== ids.length || ids.some(function (id, index) { return select.options[index].value !== id; })) {
      select.textContent = "";
      ids.forEach(function (id) {
        var option = document.createElement("option");
        option.value = id;
        option.textContent = id + (labels[id] ? " (" + labels[id] + ")" : "");
        select.appendChild(option);
      });
    }
    select.value = current || ids[0];
  }

  function syncForm() {
    var json = state.json;
    var layout = Design.layoutState(json, profiles);
    section.dataset.designMode = json.mode;
    section.dataset.designLayout = layout.profile || "legacy";
    section.dataset.designName = state.name || "";
    section.dataset.designRevision = state.revision || "";
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-start]"), function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.designStart === json.mode));
    });
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-source-for]"), function (panel) {
      panel.hidden = panel.dataset.designSourceFor !== json.mode;
    });
    var set = Design.currentSet(json);
    fillSetOptions(set);
    $("[data-design-progress]").textContent = json.mode === "svg" && set ? progressText(set) : "";
    var families = Design.currentFamilies(json) || {};
    $("[data-design-family]").value = families.base || Design.DEFAULT_FAMILY;
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-family-role]"), function (input) {
      input.value = families[input.dataset.designFamilyRole] || "";
    });
    var chip = $("[data-design-layout-chip]");
    chip.textContent = layout.kind === "legacy" ? "지금 배치 (" + (json.version || "1.0") + " 디자인)"
      : layout.kind === "unknown" ? "모르는 배치 " + layout.profile : Design.layoutLabel(layout.profile);
    chip.dataset.kind = layout.kind;
    Array.prototype.forEach.call(section.querySelectorAll('input[name="design-layout"]'), function (radio) {
      radio.checked = radio.value === (layout.profile || "legacy");
    });
    $("[data-design-legacy-option]").hidden = layout.kind !== "legacy";
    renderContextTab(layout);
    renderConflicts();
    if (!state.error) {
      textarea.value = Design.pretty(json);
    }
    $("[data-design-undo]").disabled = !store.canUndo();
    $("[data-design-redo]").disabled = !store.canRedo();
  }

  function renderContextTab(layout) {
    var tab = $("[data-design-context-tab]");
    tab.hidden = layout.kind === "fixed";
    var list = $("[data-design-context-list]");
    list.textContent = "";
    var rules = Design.contextRules(state.json);
    rules.forEach(function (rule) {
      var item = document.createElement("li");
      item.dataset.ruleId = rule.id;
      var text = document.createElement("span");
      text.textContent = rule.id + " — " + rule.text;
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.designContextDelete = rule.id;
      button.textContent = "지우기";
      item.appendChild(text);
      item.appendChild(button);
      list.appendChild(item);
    });
    $("[data-design-context-empty]").hidden = rules.length > 0;
  }

  function renderConflicts() {
    var box = $("[data-design-conflicts]");
    var list = box.querySelector("ul");
    list.textContent = "";
    if (!state.conflicts) {
      box.hidden = true;
      return;
    }
    state.conflicts.conflicts.forEach(function (conflict) {
      var item = document.createElement("li");
      item.dataset.ruleId = conflict.ruleId || "";
      item.dataset.field = conflict.field;
      item.textContent = Design.describeConflict(conflict);
      list.appendChild(item);
    });
    state.conflicts.collisions.forEach(function (collision) {
      var item = document.createElement("li");
      item.dataset.collision = collision.rules.join(" ");
      item.className = "studio-design-collision";
      item.textContent = "충돌 — " + Design.describeCollision(collision);
      list.appendChild(item);
    });
    box.querySelector("[data-design-conflicts-title]").textContent = Design.layoutLabel(state.conflicts.profile) +
      "(으)로 바꾸려면 아래 " + state.conflicts.conflicts.length + "건을 정리해야 합니다. 고르기 전에는 적용하지 않습니다.";
    box.hidden = false;
  }

  // ── 비교 칸 ─────────────────────────────────────────────────────────

  var compareChrome = new CSSStyleSheet();
  compareChrome.replaceSync([
    ":host { display: block; }",
    "font-kku { display: block; }",
    /* 대표 자모(초성 ㄱ·중성 ㅏ)는 글자 색으로 — 모든 재료가 currentColor로 칠한다 */
    ".studio-compare-target { color: var(--demo-accent, #2447a8); }",
    /* 미리보기에서 고른 자모와 같은 역할·자모 */
    ".studio-compare-picked { outline: 1.5px dashed var(--demo-seal, #d62839); outline-offset: 1px; }"
  ].join("\n"));
  var compare = {};

  function buildCompare() {
    var holder = $("[data-design-compare]");
    Design.COMPARE_ROWS.forEach(function (row) {
      var line = document.createElement("div");
      line.className = "studio-design-row";
      line.dataset.designCompareRow = row.id;
      var label = document.createElement("span");
      label.className = "studio-design-row-label";
      label.textContent = row.label;
      var stage = document.createElement("div");
      stage.className = "studio-design-row-stage";
      var root = stage.attachShadow({ mode: "open" });
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = Studio.coreHref();
      link.addEventListener("load", function () { renderCompare(); }, { once: true });
      root.appendChild(link);
      var compareHost = document.createElement("font-kku");
      compareHost.setAttribute("data-studio-compare", row.id);
      compareHost.setAttribute("size", COMPARE_SIZE);
      compareHost.setAttribute("wrap-unit", "glyph");
      root.appendChild(compareHost);
      root.addEventListener("font-kku:render", scheduleReadout);
      Studio.addPreviewRoot(root, [compareChrome]);
      var output = document.createElement("output");
      output.className = "studio-design-readout";
      output.dataset.designCompareReadout = "";
      output.dataset.row = row.id;
      line.appendChild(label);
      line.appendChild(stage);
      line.appendChild(output);
      holder.appendChild(line);
      compare[row.id] = { row: row, root: root, host: compareHost, output: output };
    });
  }

  /* 비교 칸은 미리보기 적용 여부와 관계없이 늘 지금(마지막 정상) 디자인으로 그린다 */
  function renderCompare() {
    var fontId = Studio.state.fontId;
    if (!fontId || !Studio.doc() || main.hidden) {
      return;
    }
    Design.COMPARE_ROWS.forEach(function (row) {
      var entry = compare[row.id];
      entry.host.setAttribute("font", fontId);
      if (drawnName()) {
        entry.host.style.setProperty("--fy-design", drawnName());
      } else {
        entry.host.style.removeProperty("--fy-design");
      }
      FontKku.render(entry.host, { text: row.text });
      FontKku.refreshAll(entry.host);
    });
    scheduleReadout();
  }

  function scheduleReadout() {
    clearTimeout(state.compareTimer);
    state.compareTimer = setTimeout(measureCompare, 40);
  }

  function measureCompare() {
    state.compareTimer = null;
    var identity = { requests: 0, suspected: 0, unmeasured: 0, unverified: 0 };
    Design.COMPARE_ROWS.forEach(function (row) {
      var entry = compare[row.id];
      var entries = [];
      Array.prototype.forEach.call(entry.host.querySelectorAll('[part~="glyph"]'), function (glyph) {
        var box = glyph.getBoundingClientRect();
        Array.prototype.forEach.call(glyph.querySelectorAll('[part~="jamo"]'), function (node) {
          var rect = node.getBoundingClientRect();
          var role = Design.nodeRole(node.getAttribute("data-fy-role"), node.getAttribute("data-fy-stamp"));
          var jamo = node.getAttribute("data-jamo");
          entries.push({ role: role, jamo: jamo, box: [rect.left - box.left, rect.top - box.top, rect.width, rect.height] });
          node.classList.toggle("studio-compare-target", (role === row.role && jamo === row.jamo) ||
            (role === "head" && Design.headHas(jamo, row)));
          node.classList.toggle("studio-compare-picked", Boolean(state.picked) && role === state.picked.role && jamo === state.picked.jamo);
        });
      });
      var readout = Design.placementReadout(entries, row);
      var layout = entry.host.dataset.fyLayout || "legacy";
      var designed = Boolean(drawnName()) && entry.host.dataset.fyDesign === drawnName();
      var compareStatus = entry.host.dataset.fyDesignStatus || "";
      var label = Design.layoutLabel(layout) + (designed ? "" : compareStatus === UNSUPPORTED ? " — 이 글꼴은 디자인을 받지 않음"
        : " — 디자인이 그려지지 않음" + (compareStatus ? " " + compareStatus : ""));
      entry.output.dataset.designStatus = compareStatus;
      entry.output.dataset.count = String(readout.count);
      entry.output.dataset.variants = String(readout.variants);
      entry.output.dataset.heads = String(readout.heads);
      entry.output.dataset.layout = layout;
      entry.output.dataset.design = designed ? drawnName() : "";
      entry.output.dataset.fixed = String(readout.variants === 1 && readout.heads === 0);
      entry.output.textContent = Design.readoutText(row, readout, label);
      state.readouts[row.id] = { count: readout.count, variants: readout.variants, heads: readout.heads, layout: layout, design: designed };
      var trace = designed && typeof FontKku.traceOf === "function" ? FontKku.traceOf(entry.host) : null;
      (trace ? trace.nodes : []).forEach(function (traced) {
        traced.requests.forEach(function (request) {
          identity.requests += 1;
          if (request.identity === "fallback-suspected") {
            identity.suspected += 1;
          } else if (request.identity === "unverified") {
            identity.unverified += 1;
          }
          if (request.measurement === "unavailable") {
            identity.unmeasured += 1;
          }
        });
      });
    });
    state.identity = identity;
    renderIdentity();
    classify(); // 비교 칸이 받지 않는 글꼴을 알려 주면 꺼진 미리보기의 적용 단추도 막는다
  }

  /* 글꼴 재료의 사전 검사(설계 v1.2 §13.4·§17.4) — 기록의 identity·measurement를 센다. 기기마다 다르다(같은 글꼴 이름도
   * 리눅스·안드로이드에서는 대체 글꼴일 수 있다) */
  function renderIdentity() {
    var output = $("[data-design-identity]");
    if (state.json.mode !== "font" || !state.identity || !state.identity.requests) {
      output.textContent = state.json.mode === "font" ? "글꼴 확인: 비교 칸을 그린 뒤 잽니다" : "";
      delete output.dataset.suspected;
      return;
    }
    var id = state.identity;
    output.dataset.suspected = String(id.suspected);
    output.dataset.unmeasured = String(id.unmeasured);
    output.textContent = "글꼴 확인: 자모 요청 " + id.requests + "건" +
      (id.suspected ? " · ⚠ 대체 글꼴 의심 " + id.suspected + "건(이 기기에 그 글꼴이 없을 수 있음)" : "") +
      (id.unmeasured ? " · ⚠ 잴 수 없음 " + id.unmeasured + "건" : "") +
      (id.unverified ? " · 출처 미확인 " + id.unverified + "건(로컬 글꼴은 이름만으로 확인할 수 없음)" : "");
  }

  function markCompare() {
    Design.COMPARE_ROWS.forEach(function (row) {
      Array.prototype.forEach.call(compare[row.id].host.querySelectorAll('[part~="jamo"]'), function (node) {
        var role = Design.nodeRole(node.getAttribute("data-fy-role"), node.getAttribute("data-fy-stamp"));
        node.classList.toggle("studio-compare-picked", Boolean(state.picked) && role === state.picked.role &&
          node.getAttribute("data-jamo") === state.picked.jamo);
      });
    });
  }

  // ── 살펴보기의 출처 한 줄(§13.5 최소) ────────────────────────────────

  /* 기본 출처 한 줄 — FontStudio.design.renderTrace로 바꿔 끼울 수 있다(출처 패널, F2). trace: FontKku.traceOf(미리보기) */
  function renderTrace(node, traced) {
    var holder = document.querySelector("[data-studio-selection]");
    var old = holder && holder.querySelector("[data-design-trace]");
    if (old) {
      old.remove();
    }
    if (!holder || typeof FontKku.traceOf !== "function") {
      return;
    }
    var trace = traced !== undefined ? traced : FontKku.traceOf(host);
    var match = trace ? trace.nodes.filter(function (entry) {
      return entry.pos === node.getAttribute("data-fy-pos") && entry.jamo === node.getAttribute("data-jamo");
    })[0] : null;
    if (!match || !match.requests.length) {
      return;
    }
    var request = match.requests[0];
    var line = document.createElement("span");
    line.className = "studio-design-trace";
    line.dataset.designTrace = "";
    line.dataset.source = request.source || "";
    line.dataset.status = request.status || "";
    line.dataset.result = request.result || "";
    line.textContent = "출처: " + (trace.design ? "디자인 " + trace.design : "글꼴 설정") + " · 소스 " + (request.source || "-") +
      " · 방법 " + (METHOD_LABELS[request.method] || request.method || "-") + (request.recipe ? " " + request.recipe : "") +
      " → " + (RESULT_LABELS[request.result] || request.result || "-") +
      (request.rules && request.rules.length ? " · 규칙 " + request.rules.join(", ") : "") +
      (request.status && request.status !== "ok" ? " · " + (STATUS_LABELS[request.status] || request.status) : "") +
      (request.identity ? " · " + (IDENTITY_LABELS[request.identity] || request.identity) : "") +
      (request.diagnostic ? " · " + request.diagnostic : "") +
      (match.requests.length > 1 ? " · 조각 " + match.requests.length + "개" : "");
    holder.appendChild(line);
  }

  // ── 파일 ─────────────────────────────────────────────────────────────

  function save() {
    var text = textarea.value;
    var parsed = Design.parseDesignText(text);
    if (parsed.error) {
      note("저장하지 않았습니다 — " + parsed.error.message, "error");
      return null;
    }
    /* 검사만 한다 — 저장은 등록하지 않는다. 오류가 있어도 경고와 함께 저장(글꼴 CSS 검사와 같은 관례) */
    var check = FontKku.validateDesign(parsed.design);
    var name = Design.designFileName(parsed.design);
    var out = Design.pretty(parsed.design) + "\n";
    download(name, out, "application/json");
    note(name + "을 저장했습니다." + (check.ok ? "" : " ⚠ 검사 오류 " + check.errors.length + "건이 있는 채로 저장했습니다: " +
      Design.errorLine(check.errors[0])), check.ok ? "info" : "warn");
    return { name: name, text: out, error: check.ok ? null : Design.errorLine(check.errors[0]), errors: check.errors };
  }

  function openFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      setJson(String(reader.result), file.name + "을 열었습니다", "JSON 열기: " + file.name);
    };
    reader.onerror = function () {
      note(file.name + "을 읽지 못했습니다.", "error");
    };
    reader.readAsText(file);
  }

  function copy(text, what) {
    return Studio.copyText(text).then(function (copied) {
      note(copied ? what + "를 클립보드에 복사했습니다." : "브라우저가 클립보드 쓰기를 막았습니다 — 고급의 디자인 JSON 칸에서 직접 복사하세요.",
        copied ? "info" : "warn");
      return copied;
    });
  }

  // ── 이벤트 ──────────────────────────────────────────────────────────

  function bind() {
    section.addEventListener("click", function (event) {
      var target = event.target;
      var start = target.closest("[data-design-start]");
      if (start) {
        setMode(start.dataset.designStart);
      } else if (target.closest("[data-design-fold]")) {
        fold(main.hidden);
      } else if (target.closest("[data-design-apply-json]")) {
        setJson(textarea.value);
      } else if (target.closest("[data-design-revert]")) {
        state.error = null;
        renderErrors([]);
        syncForm();
        classify();
        note("JSON 칸을 마지막 정상 디자인으로 되돌렸습니다.");
      } else if (target.closest("[data-design-undo]")) {
        undo();
      } else if (target.closest("[data-design-redo]")) {
        redo();
      } else if (target.closest("[data-design-conflicts-drop]")) {
        resolveConflicts("drop");
      } else if (target.closest("[data-design-conflicts-flatten]")) {
        resolveConflicts("flatten");
      } else if (target.closest("[data-design-conflicts-cancel]")) {
        resolveConflicts("cancel");
      } else if (target.closest("[data-design-context-delete]")) {
        var id = target.closest("[data-design-context-delete]").dataset.designContextDelete;
        commit(Design.removeRule(state.json, id), { label: "문맥 규칙 지우기 " + id, note: "문맥 규칙 " + id + "을 지웠습니다." });
      } else if (target.closest("[data-design-save]")) {
        save();
      } else if (target.closest("[data-design-copy]")) {
        copy(Design.pretty(state.json) + "\n", "디자인 JSON");
      } else if (target.closest("[data-design-copy-snippet]")) {
        copy(Design.pageSnippet(state.json), "페이지용 코드(실험 API)");
      }
    });
    section.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches("[data-design-apply]")) {
        setApplied(target.checked);
      } else if (target.matches('input[name="design-layout"]')) {
        if (!setLayout(target.value)) {
          syncForm(); // 바꾸지 않았으면 지금 배치 단추로 돌린다
        }
      } else if (target.matches("[data-design-set]")) {
        setMode("svg", { set: target.value });
      } else if (target.matches("[data-design-family], [data-design-family-role]")) {
        setMode("font", { families: readFamilies() });
      } else if (target.matches("[data-design-open]") && target.files[0]) {
        openFile(target.files[0]);
        target.value = "";
      }
    });
    /* 살펴보기의 세벌 고정 안내 단추(font-studio.js renderFixedTarget) */
    studioRoot.addEventListener("click", function (event) {
      if (event.target.closest("[data-studio-design-square]")) {
        state.applied = true;
        fold(true);
        setLayout(Design.SQUARE_PROFILE);
      } else if (event.target.closest("[data-studio-design-off]")) {
        setApplied(false);
      }
    });
  }

  // ── 훅 ──────────────────────────────────────────────────────────────

  Studio.on("render", function () {
    classify();
    renderCompare();
  });

  Studio.on("load", function (options) {
    if (options && options.design) {
      restore(options.design);
    }
  });

  /* 프로젝트·초안: 디자인과 참가자 상태(상태가 있는 참가자만 — 없으면 participants를 쓰지 않는다. 받을 모듈이 없던 상태는 그대로) */
  Studio.on("project", function (project) {
    project.design = { json: Design.clone(state.json), applied: state.applied };
    var saved = Design.clone(restored) || {};
    var current = participantStates();
    Object.keys(current).forEach(function (key) {
      if (current[key] !== null) {
        saved[key] = current[key];
      }
    });
    if (Object.keys(saved).length) {
      project.design.participants = saved;
    }
  });

  Studio.on("select", function (node) {
    state.picked = { role: Design.nodeRole(node.getAttribute("data-fy-role"), node.getAttribute("data-fy-stamp")), jamo: node.getAttribute("data-jamo") };
    markCompare();
    api.renderTrace(node, typeof FontKku.traceOf === "function" ? FontKku.traceOf(host) : null);
  });

  // ── 시작 ────────────────────────────────────────────────────────────

  buildCompare();
  bind();
  fold(state.applied);
  var booted = register(state.json);
  state.name = booted.name || null;
  state.revision = booted.revision || null;
  applyToHost();
  syncForm();
  syncStatus();
  /* 처음 글꼴이 이 스크립트보다 먼저 실렸으면 지금 디자인으로 다시 그린다. 초안·프로젝트 불러오기를 놓쳤으면 따라잡는다 */
  var missed = Studio.lastLoadOptions();
  if (missed && missed.design) {
    restore(missed.design);
  } else {
    rerender();
  }

  function on(name, listener) {
    if (!has(listeners, name) || typeof listener !== "function") {
      throw new TypeError("font-studio: design.on(" + JSON.stringify(name) + ") — events are change and status");
    }
    listeners[name].push(listener);
    return function () { off(name, listener); };
  }

  function off(name, listener) {
    if (has(listeners, name)) {
      listeners[name] = listeners[name].filter(function (entry) { return entry !== listener; });
    }
  }

  function busy() {
    return Boolean(state.compareTimer) || Object.keys(state.loadingSets).length > 0 || busyChecks.some(function (check) {
      try {
        return Boolean(check());
      } catch (error) {
        return false;
      }
    });
  }

  /* 테스트·자동화·뒤 묶음용 창구 — UI와 같은 경로를 쓴다. edit·begin·participant·lease·on이 뒤 묶음(F1–F9)의 계약이다 */
  var api = {
    state: state,
    json: function () { return Design.clone(state.json); },
    text: function () { return textarea.value; },
    name: function () { return state.name; },
    status: function () { return section.dataset.designState; },
    fold: fold,
    setJson: setJson,
    apply: function () { return setJson(textarea.value); },
    setMode: setMode,
    setLayout: setLayout,
    resolveConflicts: resolveConflicts,
    setApplied: setApplied,
    undo: undo,
    redo: redo,
    save: save,
    restore: restore,
    compare: function () { return Design.clone(state.readouts); },
    identity: function () { return state.identity ? Design.clone(state.identity) : null; },
    busy: busy,
    /* 편집 → Promise<{ ok, design, errors, impact, cancelled }> */
    edit: edit,
    begin: begin,
    validate: validate,
    /* 미리보기용 임시 등록 { name, update(json), release() } — 검사에 걸리면 registerDesign의 오류를 던진다 */
    lease: function (json) { return leases.lease(json); },
    leases: function () { return leases.live(); },
    participant: participant,
    participants: function () { return participantStates(); },
    on: on,
    off: off,
    history: function () { return { entries: store.entries(), index: store.index() }; },
    historyEntry: function (id) { return store.entry(id); },
    jump: jump,
    canUndo: function () { return store.canUndo(); },
    canRedo: function () { return store.canRedo(); },
    setImpactHandler: function (handler) {
      impactHandler = typeof handler === "function" ? handler : defaultImpactHandler;
    },
    lastImpact: function () { return lastImpact ? Design.clone(lastImpact) : null; },
    /* settled()가 기다릴 바쁨 검사 — 지우는 함수를 돌려준다 */
    addBusy: function (check) {
      if (typeof check !== "function") {
        throw new TypeError("font-studio: design.addBusy needs a function");
      }
      busyChecks.push(check);
      return function () { busyChecks = busyChecks.filter(function (entry) { return entry !== check; }); };
    },
    /* 고른 자모의 출처 그리기 — (node, trace)로 부른다. 출처 패널이 바꿔 끼운다 */
    renderTrace: renderTrace,
    defaultRenderTrace: renderTrace,
    runtime: runtime
  };
  Studio.design = api;
})();
