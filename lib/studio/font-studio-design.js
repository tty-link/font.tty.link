/* font-studio-design.js — 작업실 디자인 패널 (설계 v1.2 §13.1–13.2, ADR-025 F, ADR-026)
 *
 * 첫 화면은 세벌식 디자인이다: 주소에 글꼴(?font·?src)이나 재료 탭(#studio-material)을 밝히지 않고 들어오면 미리보기 바탕
 * 요소에 기본 디자인(1.2, sebul-cases-v1 세벌식, 선·원 재료)을 건다. 밝히고 들어오면 글꼴 CSS 그대로 보이고 디자인은 비교 칸에만 있다.
 * 시작 선택지 셋(선·원 / 직접 그려 / 기존 글꼴)은 재료만 바꾸고 글꼴 모양을 지킨다('직접 그려'는 그리기 입구와 하나 — 빈 그림
 * 세트로 그리기를 연다, PLAN-STUDIO-002 S3). 글꼴 모양 셋(세벌식·직결식·네모꼴)은 본문에 있다(전에는 '고급' 안). 대표 비교 칸
 * (가 고 과 각 곽 · 가 나 간 난, 정밀 모드)은 미리보기와 같은 글꼴 시트를 받는 따로 된 shadow root에서 늘 지금 디자인으로 그려,
 * 고정 초성 ㄱ·중성 ㅏ가 몇 가지 자리에 찍히는지 잰다. 네모꼴로 바꾸면 고급의 문맥 규칙 칸이 열리고, 문맥 규칙이 있는 디자인을
 * 세벌식·직결식으로 되돌리려 하면 충돌을 보이고 고를 때까지 적용하지 않는다. 쉬운 모드(S3)에서는 비교 칸을 그리지도 재지도
 * 않는다(compare()는 화면 밖 무대에서 잰다).
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

  var Util = window.FontStudioUtil; // authoring/font-studio-util.js — 공용 도구·표(S6)
  var download = Util.download;
  var make = Util.element;

  var Studio = window.FontStudio;
  var Design = window.FontStudioDesign;
  var Tx = window.FontStudioTransactions;
  /* 규칙 목록(S5-B)의 순수 변환 — 없으면(옛 호스트 쪽 HTML) 규칙 목록 칸만 감춘다 */
  var Rules = window.FontStudioDesignRules || null;
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
  /* 디자인 기록의 개수 상한은 하나의 기록(FontStudio.timeline)이 크기로 정한다 — 스스로는 자르지 않게 넉넉히(자르면 시간축에서도 뺀다) */
  var HISTORY_LIMIT = 100000;
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
    /* 원칙대로 되돌리기에서 조건을 떼면 남는 같은 자모·역할의 다른 값(합치지 않는다) */
    principleCollisions: [],
    picked: null,
    loadingSets: {},
    failedSets: {},
    compareTimer: null,
    readouts: {},
    identity: null,
    /* 묶음 편집(begin)이 미리보기 중인 임시 이름 — 있으면 미리보기·비교 칸이 이 이름을 그린다 */
    previewName: null,
    /* 지금(마지막 정상) 디자인의 런타임 진단(validateDesign warnings — 받아들이지만 알릴 것). 원칙 안내 칸이 맡는 코드 밖은
     * 진단 목록([data-design-warnings])에 보인다 */
    warnings: [],
    /* 런타임이 진단을 내는가(마지막 검사로 안다) — 내지 않는 예전 런타임이면 원칙 안내는 작업실 사본(principleWarnings)으로 */
    warningsReported: false
  };
  /* 이름 붙은 편집 기록 — 항목마다 바꾸기 전·후 { design, participants } */
  var store = Tx.createStore({ limit: HISTORY_LIMIT, onDrop: function () { timelineCall("dropOldestOf", "design"); } });
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

  /* 런타임 진단 목록(D13) — 오류 목록([data-design-errors]) 바로 뒤, 같은 꼴 */
  var warningList = document.createElement("ul");
  warningList.className = "studio-diagnostics";
  warningList.dataset.designWarnings = "";
  warningList.dataset.count = "0";
  warningList.setAttribute("aria-label", "디자인 진단 — 받아들였지만 알릴 것");
  warningList.hidden = true;
  $("[data-design-errors]").insertAdjacentElement("afterend", warningList);

  /* 저장 물음(D14) — JSON 칸에 적용하지 않은(또는 검사에 걸린) 글이 있을 때 '디자인 JSON 저장'이 묻는다. 알림 칸 바로 뒤 */
  var saveChoice = document.createElement("div");
  saveChoice.className = "studio-design-principle";
  saveChoice.dataset.designSaveChoice = "";
  saveChoice.setAttribute("role", "status");
  saveChoice.hidden = true;
  var saveChoiceText = document.createElement("p");
  saveChoiceText.dataset.designSaveChoiceText = "";
  var saveChoiceButtons = document.createElement("div");
  saveChoiceButtons.className = "studio-design-buttons";
  [["data-design-save-apply", "적용하고 저장"], ["data-design-save-last", "마지막 정상 디자인 저장"]].forEach(function (pair) {
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute(pair[0], "");
    button.textContent = pair[1];
    saveChoiceButtons.appendChild(button);
  });
  saveChoice.appendChild(saveChoiceText);
  saveChoice.appendChild(saveChoiceButtons);
  $("[data-design-message]").insertAdjacentElement("afterend", saveChoice);

  /* 접기 — 글꼴을 밝히고 들어오면(글꼴 CSS 편집) 머리 줄만 두고 접는다. 접힌 동안 비교 칸은 그리지 않는다 */
  function fold(open) {
    var opened = Boolean(open);
    main.hidden = !opened;
    var button = $("[data-design-fold]");
    button.setAttribute("aria-expanded", String(opened));
    button.textContent = opened ? "접기" : "펼치기";
    section.dataset.designFolded = String(!opened);
    syncCompare();
    return opened;
  }

  function note(text, tone) {
    var node = $("[data-design-message]");
    node.textContent = text || "";
    node.dataset.tone = tone || "info";
  }

  // ── 등록과 적용 ────────────────────────────────────────────────────────

  /* 검사 — 런타임 validateDesign(오류 전부)의 돌려준 값을 { ok, errors: [{ code, path, message }], warnings: [...] }로 맞춘다.
   * 진단(warnings)은 버리지 않는다(D13) */
  function validate(json) {
    try {
      var raw = FontKku.validateDesign(json);
      state.warningsReported = Tx.reportsWarnings(raw);
      return Tx.normalizeValidation(raw);
    } catch (error) {
      return { ok: false, errors: [errorEntry(error)], warnings: [] };
    }
  }

  function errorEntry(error, code) {
    return { code: error && error.code || code || null, path: error && error.path || "", message: error && error.message || String(error) };
  }

  /* 검사(오류 전부) → 이름 하나에 바꿔 등록. 실패하면 { errors: [{ code, path, message }] }, 통과하면 진단도 함께 */
  function register(json) {
    var check = validate(json);
    if (!check.ok) {
      return { errors: check.errors, warnings: check.warnings };
    }
    try {
      return { name: Design.STUDIO_NAME, revision: FontKku.registerDesign(Design.STUDIO_NAME, json, { replace: true }).revision,
        warnings: check.warnings };
    } catch (error) {
      return { errors: [errorEntry(error)], warnings: [] };
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
      var afterParticipants = participantStates();
      var recorded = store.record({
        label: opts.label || "디자인 바꾸기",
        before: { design: state.json, participants: beforeParticipants },
        after: { design: json, participants: afterParticipants }
      });
      /* 하나의 기록(PLAN-STUDIO-002 S2) — 디자인 기록 한 줄이 시간축 한 줄이다(id가 같다). 그림 문서가 바뀌었으면 까닭은 drawing */
      var drew = Tx.changedParticipants(beforeParticipants, afterParticipants).indexOf("drawings") >= 0;
      timelineCall("record", "design", { id: recorded.id, label: recorded.label, cause: drew ? "drawing" : "design",
        bytes: (Design.stableJson({ design: state.json, participants: beforeParticipants }).length +
          Design.stableJson({ design: json, participants: afterParticipants }).length) * 2 });
    }
    state.json = Design.clone(json);
    state.name = result.name;
    state.revision = result.revision;
    state.warnings = result.warnings || [];
    state.error = null;
    state.conflicts = null;
    state.principleCollisions = [];
    hideSaveChoice(); // 고른 것이 바뀌었다 — 저장할지 물은 것은 다시 묻는다
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
    var out = { ok: ok, design: Design.clone(state.json), errors: [], warnings: ok ? Design.clone(state.warnings) : [], impact: null,
      cancelled: false };
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
      return Promise.resolve(editResult(false, { errors: check.errors, warnings: check.warnings }));
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

  /* 진단 한 줄: 코드(영어 그대로) · 한국어 설명(없으면 fallback, 그것도 없으면 빼기) · 런타임 문구(자리 포함) */
  function diagnosticItem(entry, severity, fallback) {
    var item = document.createElement("li");
    item.dataset.severity = severity;
    if (entry.code) {
      item.dataset.code = entry.code;
      item.appendChild(make("code", null, entry.code));
      item.appendChild(document.createTextNode(" "));
    }
    if (entry.path) {
      item.dataset.path = entry.path;
    }
    var text = entry.text || fallback;
    if (text) {
      item.appendChild(make("span", "studio-design-error-text", text));
      item.appendChild(document.createTextNode(" — "));
    }
    item.appendChild(make("span", "studio-design-error-detail", entry.message));
    return item;
  }

  /* 오류마다 한 줄(diagnosticItem) */
  function renderErrors(errors, where) {
    var list = $("[data-design-errors]");
    list.textContent = "";
    errors.forEach(function (error) {
      list.appendChild(diagnosticItem(Design.describeError(error), "error", null));
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
    renderWarnings();
  }

  /* 지금 디자인의 런타임 진단(D13) — 원칙 안내 칸이 맡는 코드(DESIGN_FIXED_CONTEXT·DESIGN_FIXED_VARIATION) 밖의 것을 한 줄씩:
   * 코드(영어 그대로) · 한국어 설명(WARNING_TEXT) · 런타임 문구. 적용하지 못한 편집이 있으면(오류 목록이 보이면) 감춘다 */
  function renderWarnings() {
    var list = warningList;
    list.textContent = "";
    var shown = state.error ? [] : state.warnings.filter(function (warning) {
      return Design.PRINCIPLE_CODES.indexOf(warning.code) < 0;
    });
    shown.forEach(function (warning) {
      list.appendChild(diagnosticItem(Design.describeError(warning), "warning", "런타임 진단"));
    });
    list.dataset.count = String(shown.length);
    list.hidden = shown.length === 0;
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
    return row && compareShown() && row.host.getAttribute("font") === Studio.state.fontId ? supportOf(row.host) : null;
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
    syncShapeActions();
    if (status !== lastStatus) {
      lastStatus = status;
      emitEvent("status", { state: status || "", reason: state.reason || "" });
    }
  }

  // ── 재료 · 배치 · 충돌 ─────────────────────────────────────────────────

  /* 그림 세트의 화면 이름(S5-B — 쉬운 모드 화면 말에 세트 id가 나오지 않게, tests/studio_modes.py): 기본 제공 세트는 한국어 이름,
   * 작업실에서 그린 세트(studio-draw-…)는 '직접 그린 세트', 그 밖에 등록한 세트는 '등록한 그림 세트'. 기록 줄 이름은 모드와 상관없이
   * 이 이름이고(되돌리기 단추·편집 기록 칸은 두 모드 모두에 보인다), 알림은 정밀 모드에서만 id를 덧붙인다(setText) */
  function setName(id) {
    var shipped = Design.SVG_SETS.filter(function (entry) { return entry.id === id; })[0];
    return shipped ? shipped.label + " 그림 세트" : /^studio-draw-/.test(String(id)) ? "직접 그린 세트" : "등록한 그림 세트";
  }

  function setText(id) {
    return setName(id) + (studioMode() === "easy" ? "" : "(" + id + ")");
  }

  function setMode(mode, extra) {
    var paramsFor = extra || (mode === "svg" ? { set: $("[data-design-set]").value || undefined }
      : mode === "font" ? { families: readFamilies() } : null);
    var result = Design.withMode(state.json, mode, paramsFor);
    var set = mode === "svg" ? Design.currentSet(result.design) : null;
    var dropped = result.dropped.length ? ruleNames(result.dropped) : "";
    return commit(result.design, {
      label: "재료: " + MODE_LABELS[mode] + (set ? " (" + setName(set) + ")" : ""),
      note: MODE_LABELS[mode] + (set ? " · " + setText(set) : "") + " — 재료를 바꿨습니다(글꼴 모양 " +
        Design.layoutLabel(Design.layoutState(result.design, profiles).profile) + " 그대로)" +
        (dropped ? ". 사라진 소스를 가리키던 규칙 " + dropped + "을 뺐습니다" : ""),
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
      note("모르는 글꼴 모양입니다: " + profile, "error");
      return false;
    }
    var result = Design.withLayout(state.json, profile, profiles);
    if (result.conflicts.length) {
      /* 막음 — '이 모양과 맞지 않는 규칙' 칸(글꼴 모양 바로 아래, 쉬운 모드에도)이 고르게 한다 */
      state.conflicts = { profile: profile, conflicts: result.conflicts, collisions: [] };
      fold(true);
      syncForm();
      note("세벌식·직결식은 합자 모음을 조각 둘로 그립니다 — 통째로 그리는 규칙을 정리하기 전에는 글꼴 모양을 바꾸지 않습니다(글꼴 모양 아래 '이 모양과 맞지 않는 규칙' 칸에서 고르세요).", "warn");
      return false;
    }
    /* 모양의 원칙을 깨는 문맥 규칙·자리 변주는 막지 않는다 — 바꾼 뒤 원칙 안내 칸이 "원칙대로 되돌리기"를 보인다(ADR-030 §5).
     * 몇 건인지는 런타임 진단으로 센다(예전 런타임이면 작업실 사본) */
    var warned = principleList(result.design, profile).length;
    if (warned) {
      fold(true);
    }
    return commit(result.design, { label: "글꼴 모양: " + Design.layoutLabel(profile), tone: warned ? "warn" : undefined,
      note: "글꼴 모양을 " + Design.layoutLabel(profile) + "(으)로 바꿨습니다" + (warned ? " — 규칙 " + warned +
        "건이 이 모양의 원칙을 깹니다(그대로 그립니다). 글꼴 모양 아래 '이 모양과 맞지 않는 규칙' 칸에서 되돌릴 수 있습니다."
        : Design.FIXED_MODELS[profiles[profile].model] ? "." : " — 짜임·받침 조건 규칙(문맥 규칙)은 고급의 규칙 목록에서 더합니다. 자리·자모·문맥 편집은 고치기 페이지에서 합니다.") });
  }

  /* 알림의 규칙 목록 — 정밀 모드는 이름, 쉬운 모드는 건수(쉬운 모드 화면 말에 규칙 이름이 없다, S5-B) */
  function ruleNames(ids) {
    if (!ids.length) {
      return "없음";
    }
    return studioMode() === "easy" ? ids.length + "건" : ids.join(", ");
  }

  /* 원칙대로 되돌리기(ADR-030 §5) — 지금 모양에서 원칙을 깨는 규칙을 flatten(조건 떼기)·drop(지우기)으로 정리한다 */
  function resolvePrinciple(kind) {
    var profile = Design.layoutState(state.json, profiles).profile;
    if (!profile || !profiles[profile] || !principleList(state.json, profile, state.warnings).length) {
      return false;
    }
    var result = Design.resolveConflicts(state.json, kind, profile, profiles);
    if (!result.design) {
      state.principleCollisions = result.collisions || [];
      syncForm();
      note("조건을 떼면 같은 자모·역할에 다른 값이 남습니다 — 합치지 않았습니다. 규칙을 지우거나 JSON에서 하나를 고르세요.", "error");
      return false;
    }
    return commit(result.design, {
      label: (kind === "drop" ? "원칙: 문맥 규칙 지우기" : "원칙대로 되돌리기") + " (" + Design.layoutLabel(profile) + ")",
      note: kind === "drop" ? "지운 규칙: " + ruleNames(result.removed)
        : "원칙대로 되돌렸습니다 — 조건을 뗀 규칙: " + ruleNames(result.flattened) +
          (result.removed.length ? " · 지운 규칙: " + ruleNames(result.removed) : "")
    });
  }

  function resolveConflicts(kind) {
    if (!state.conflicts) {
      return false;
    }
    if (kind === "cancel") {
      state.conflicts = null;
      syncForm();
      note("글꼴 모양을 바꾸지 않았습니다.");
      return false;
    }
    /* 막는 것은 통째(direct) 합자 모음 규칙뿐이다 — 그것만 지우고, 원칙을 깨는 문맥 규칙은 두고 원칙 안내 칸이 보인다(ADR-030 §5) */
    var result = Design.resolveConflicts(state.json, "compound", state.conflicts.profile, profiles);
    var profile = state.conflicts.profile;
    var warned = result.design ? principleList(result.design, profile).length : 0;
    return commit(result.design, {
      label: "충돌 정리: 통째 규칙 지우기 → " + Design.layoutLabel(profile), tone: warned ? "warn" : undefined,
      note: "글꼴 모양을 " + Design.layoutLabel(profile) + "(으)로 바꿨습니다 — 지운 규칙: " + ruleNames(result.removed) +
        (warned ? " · 규칙 " + warned + "건이 이 모양의 원칙을 깹니다(글꼴 모양 아래 '이 모양과 맞지 않는 규칙' 칸)" : "")
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

  /* 되돌리기·다시는 기록 항목의 before·after로 — 참가자도 함께. 하나의 기록의 design 갈래가 부른다 */
  function storeUndo() {
    var entry = store.current();
    var previousIndex = store.index();
    var target = store.undo();
    return target !== null && jumpTo(target, "undo", entry && entry.label, previousIndex);
  }

  function storeRedo() {
    var entry = store.next();
    var previousIndex = store.index();
    var target = store.redo();
    return target !== null && jumpTo(target, "redo", entry && entry.label, previousIndex);
  }

  /* 하나의 기록 — 작업실 시간축(FontStudio.timeline)에 디자인 갈래로 붙는다. 시간축이 없으면(옛 작업실 껍데기) 제 기록만 쓴다 */
  function timelineCall(method) {
    var timeline = Studio.timeline;
    if (!timeline || typeof timeline[method] !== "function") {
      return undefined;
    }
    return timeline[method].apply(timeline, Array.prototype.slice.call(arguments, 1));
  }

  /* 고급의 '디자인 되돌리기·다시' 단추는 뺐다(S3 ⚑5 — 편집 기록 칸·Ctrl+Z와 같은 함수). 옛 호스트 쪽 HTML에 단추가 남아 있으면
   * 그 단추만 맞춘다 */
  function syncHistoryButtons() {
    var undoButton = $("[data-design-undo]");
    var redoButton = $("[data-design-redo]");
    if (undoButton) {
      undoButton.disabled = !store.canUndo();
    }
    if (redoButton) {
      redoButton.disabled = !store.canRedo();
    }
  }

  timelineCall("lane", "design", {
    undo: storeUndo,
    redo: storeRedo,
    truncate: function () {
      store.truncate();
      syncHistoryButtons();
    },
    dropOldest: function () {
      store.dropOldest();
      syncHistoryButtons();
    }
  });

  /* 디자인 되돌리기·다시(디자인 칸 단추·FontStudio.design.undo/redo) — 디자인 갈래의 마지막 일. 시간축이 차례를 맞춘다 */
  function undo() {
    var result = timelineCall("undoLane", "design");
    return result === undefined ? storeUndo() : Boolean(result.ok);
  }

  function redo() {
    var result = timelineCall("redoLane", "design");
    return result === undefined ? storeRedo() : Boolean(result.ok);
  }

  /* 디자인 기록의 그 항목까지 적용한 상태로(id가 null이면 처음 상태) — 디자인 갈래를 한 걸음씩 */
  function jump(id) {
    if (id === undefined) {
      return false;
    }
    var entries = store.entries();
    var targetIndex = -1;
    if (id !== null) {
      targetIndex = entries.map(function (entry) { return entry.id; }).indexOf(id);
      if (targetIndex < 0) {
        return false;
      }
    } else if (!entries.length) {
      return false;
    }
    if (!Studio.timeline) {
      var previousIndex = store.index();
      var entry = id === null ? null : store.entry(id);
      var target = store.jump(id);
      return target !== null && jumpTo(target, "jump", entry ? entry.label : "처음 상태", previousIndex);
    }
    while (store.index() > targetIndex) {
      if (!undo()) {
        return false;
      }
    }
    while (store.index() < targetIndex) {
      if (!redo()) {
        return false;
      }
    }
    return true;
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
        (legacy ? " — 글꼴 모양을 적지 않은 " + (parsed.design.version || "1.0") + " 디자인이라 지금 모양으로 그립니다(세벌식·직결식으로 바꾸지 않음)." : ".")
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
    timelineCall("forget", "design");
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
        note(setText(set) + "을(를) 싣지 못했습니다 — 그림이 없는 자모는 원소로 그립니다.", "warn");
        syncForm();
      });
      document.head.appendChild(script);
    });
  }

  /* 그림 세트 진행률 — 그리기 탭과 같은 부품(FontStudio.progress, S3 '진행률 3벌 → 1'). 받는 중·등록 안 됨은 글 한 줄 */
  function renderProgress(holder, set) {
    holder.textContent = "";
    if (!set) {
      return;
    }
    if (state.loadingSets[set]) {
      holder.textContent = setText(set) + " 받는 중…";
      return;
    }
    if (registeredSets().indexOf(set) < 0 || typeof FontKku.authoringProgress !== "function") {
      holder.textContent = "⚠ " + setText(set) + "이(가) 등록되지 않았습니다 — 그림이 없는 자모는 선·원으로 그리고 기록에 출처를 남깁니다";
      return;
    }
    var report = FontKku.authoringProgress(set);
    if (Studio.progress) {
      var list = document.createElement("ol");
      Studio.progress.render(list, report, { target: report.next });
      holder.appendChild(list);
    }
    var next = document.createElement("p");
    next.className = "studio-progress-next";
    next.textContent = Studio.progress ? Studio.progress.text(report) : "";
    holder.appendChild(next);
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
    var mode = studioMode();
    if (select.options.length !== ids.length || select.dataset.mode !== mode ||
        ids.some(function (id, index) { return select.options[index].value !== id; })) {
      select.textContent = "";
      ids.forEach(function (id) {
        var option = document.createElement("option");
        option.value = id;
        /* 쉬운 모드는 한국어 이름만(S5-B), 정밀 모드는 id(이름) */
        option.textContent = mode === "easy" ? (labels[id] ? labels[id] : setName(id)) : id + (labels[id] ? " (" + labels[id] + ")" : "");
        select.appendChild(option);
      });
      select.dataset.mode = mode;
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
    renderProgress($("[data-design-progress]"), json.mode === "svg" ? set : null);
    var families = Design.currentFamilies(json) || {};
    $("[data-design-family]").value = families.base || Design.DEFAULT_FAMILY;
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-family-role]"), function (input) {
      input.value = families[input.dataset.designFamilyRole] || "";
    });
    var chip = $("[data-design-layout-chip]");
    chip.textContent = layout.kind === "legacy" ? "지금 모양 (" + (json.version || "1.0") + " 디자인)"
      : layout.kind === "unknown" ? "모르는 글꼴 모양" : Design.layoutLabel(layout.profile);
    chip.dataset.kind = layout.kind;
    Array.prototype.forEach.call(section.querySelectorAll('input[name="design-layout"]'), function (radio) {
      radio.checked = radio.value === (layout.profile || "legacy");
    });
    syncShapeActions();
    $("[data-design-legacy-option]").hidden = layout.kind !== "legacy";
    renderRules(layout);
    renderMismatch(layout);
    if (!state.error) {
      textarea.value = Design.pretty(json);
    }
    syncHistoryButtons();
  }

  // ── 규칙 목록(S5-B — 문맥 규칙 탭을 합침) ────────────────────────────
  /* 모든 규칙을 한 줄씩: 이름(코드) · 조건 → 결과 · 고치기 · 지우기. 아래 칸에서 더하고, '고치기'를 누르면 같은 칸이 그 규칙을 고친다.
   * 한 번 더하기·고치기·지우기가 기록 한 줄이다. 칸에서 만든 디자인은 JSON에 손으로 적은 것과 같은 꼴이고 같은 검사(validateDesign)를
   * 지난다 — 검사에 걸리면 적용하지 않고 칸 아래에 까닭을 보인다(마지막 정상 디자인과 JSON 칸은 그대로) */
  var KIND_LABELS = { context: "문맥", pick: "고름", mix: "섞음", rule: "규칙" };
  var SOURCE_KIND_LABELS = { primitive: "선·원", svg: "그림 세트", font: "글꼴" };
  var ruleForm = {
    form: $("[data-design-rule-form]"),
    editing: null
  };

  function ruleField(name) {
    return ruleForm.form.querySelector("[data-design-rule-" + name + "]");
  }

  function renderRules(layout) {
    var box = $("[data-design-rules]");
    if (!box) {
      return;
    }
    if (!Rules || !ruleForm.form) {
      box.hidden = true;
      return;
    }
    var list = $("[data-design-rule-list]");
    list.textContent = "";
    var rules = state.json && Array.isArray(state.json.rules) ? state.json.rules : [];
    rules.forEach(function (rule) {
      if (!rule || typeof rule !== "object") {
        return;
      }
      var described = Rules.describeRule(rule);
      var item = document.createElement("li");
      item.dataset.ruleId = rule.id;
      item.dataset.ruleKind = described.kind;
      if (ruleForm.editing === rule.id) {
        item.dataset.editing = "true";
      }
      var kind = document.createElement("span");
      kind.className = "studio-design-rule-kind";
      kind.textContent = KIND_LABELS[described.kind] || "규칙";
      var name = document.createElement("code");
      name.textContent = rule.id;
      var text = document.createElement("span");
      text.className = "studio-design-rule-text";
      text.textContent = described.when + " → " + described.what;
      var edit = document.createElement("button");
      edit.type = "button";
      edit.dataset.designRuleEdit = rule.id;
      edit.textContent = "고치기";
      var remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.designRuleDelete = rule.id;
      remove.textContent = "지우기";
      item.appendChild(kind);
      item.appendChild(name);
      item.appendChild(text);
      item.appendChild(edit);
      item.appendChild(remove);
      list.appendChild(item);
    });
    $("[data-design-rules-empty]").hidden = list.children.length > 0;
    if (ruleForm.editing && !rules.some(function (rule) { return rule && rule.id === ruleForm.editing; })) {
      stopEditingRule(); // 고치던 규칙이 사라졌다(되돌리기·JSON 적용)
    }
    syncRuleForm(layout);
  }

  function fillOptions(select, entries, value) {
    var key = entries.map(function (entry) { return entry[0] + "\n" + entry[1]; }).join("\u0000");
    if (select.dataset.optionsKey !== key) {
      select.textContent = "";
      entries.forEach(function (entry) {
        var option = document.createElement("option");
        option.value = entry[0];
        option.textContent = entry[1];
        select.appendChild(option);
      });
      select.dataset.optionsKey = key;
    }
    select.value = entries.some(function (entry) { return entry[0] === value; }) ? value : entries.length ? entries[0][0] : "";
  }

  /* 칸의 고를 거리를 지금 디자인·자모에 맞춘다 — 소스는 디자인의 소스, 조립식은 적은 자모를 만드는 것 */
  function syncRuleForm(layout) {
    var form = ruleForm.form;
    var sources = state.json && state.json.sources ? state.json.sources : {};
    var sourceEntries = [["", "그대로(기본 소스)"]].concat(Object.keys(sources).map(function (id) {
      var kind = sources[id] && sources[id].kind;
      var detail = kind === "svg" ? sources[id].assetSet : kind === "font" ? sources[id].family : "";
      return [id, id + " (" + (SOURCE_KIND_LABELS[kind] || kind || "?") + (detail ? " " + detail : "") + ")"];
    }));
    fillOptions(ruleField("source"), sourceEntries, ruleField("source").value);
    var jamo = ruleField("jamo").value.trim();
    var method = ruleField("method").value;
    var recipes = Rules.ruleChoices(jamo).recipes;
    var recipeEntries = [["", recipes.length ? "기본 조립식" : "없음"]].concat(recipes.map(function (entry) {
      return [entry.id, entry.id + (entry.isDefault ? " (기본)" : "")];
    }));
    fillOptions(ruleField("recipe"), recipeEntries, ruleField("recipe").value);
    ruleField("recipe").disabled = method === "direct" || !recipes.length;
    var profile = (layout || Design.layoutState(state.json, profiles)).profile;
    var info = profile && profiles[profile];
    var allowed = info && Array.isArray(info.match) ? info.match : null;
    var asked = [];
    if (ruleField("layout").value && allowed && allowed.indexOf("vowelLayout") < 0) {
      asked.push("짜임");
    }
    if (ruleField("final").value && allowed && allowed.indexOf("hasFinal") < 0) {
      asked.push("받침");
    }
    var note = ruleField("condition-note");
    note.hidden = !asked.length;
    note.textContent = asked.length ? Design.layoutLabel(profile) + "은 규칙을 역할·자모로만 고르는 모양입니다 — " + asked.join("·") +
      " 조건을 더하면 그대로 그리고 '이 모양과 맞지 않는 규칙'에 경고를 보입니다." : "";
    form.querySelector("[data-design-rule-form-title]").textContent = ruleForm.editing ? "규칙 고치기 — " + ruleForm.editing : "규칙 더하기";
    form.querySelector("[data-design-rule-submit]").textContent = ruleForm.editing ? "고친 대로 적용" : "더하기";
    form.querySelector("[data-design-rule-cancel]").hidden = !ruleForm.editing;
  }

  function readRuleForm() {
    return {
      jamo: ruleField("jamo").value.trim(),
      role: ruleField("role").value || null,
      vowelLayout: ruleField("layout").value || null,
      hasFinal: ruleField("final").value === "" ? null : ruleField("final").value === "true",
      source: ruleField("source").value || null,
      method: ruleField("method").value || null,
      recipe: ruleField("recipe").disabled ? null : ruleField("recipe").value || null,
      fit: ruleField("fit").value || null
    };
  }

  function ruleMessage(text, tone) {
    var node = ruleField("message");
    node.textContent = text || "";
    node.dataset.tone = tone || "info";
  }

  function startEditingRule(id) {
    var rule = (state.json.rules || []).filter(function (entry) { return entry && entry.id === id; })[0];
    if (!rule) {
      return false;
    }
    var spec = Rules.ruleSpec(rule);
    ruleForm.editing = id;
    ruleField("jamo").value = spec.jamo || "";
    ruleField("role").value = spec.role || "";
    ruleField("layout").value = spec.vowelLayout ? ({ vertical: "right", horizontal: "bottom", mixed: "split-right" })[spec.vowelLayout] || spec.vowelLayout : "";
    ruleField("final").value = spec.hasFinal === null ? "" : String(spec.hasFinal);
    ruleField("method").value = spec.method || "";
    ruleField("fit").value = spec.fit || "";
    syncRuleForm();
    ruleField("source").value = spec.source || "";
    ruleField("recipe").value = spec.recipe || "";
    ruleMessage("");
    renderRules();
    ruleField("jamo").focus();
    return true;
  }

  function stopEditingRule() {
    ruleForm.editing = null;
    ruleForm.form.reset();
    ruleMessage("");
  }

  /* 칸에서 만든 디자인을 검사하고 적용한다 — 걸리면 적용하지 않고 칸 아래에 */
  function commitRule(next, label, done) {
    var check = validate(next);
    if (!check.ok) {
      var first = check.errors[0] ? Design.describeError(check.errors[0]) : null;
      ruleMessage("적용하지 않았습니다 — " + (first ? (first.text ? first.text + ": " : "") + first.message : "디자인 검사 오류") +
        (check.errors.length > 1 ? " 외 " + (check.errors.length - 1) + "건" : ""), "error");
      return { ok: false, refused: [], errors: check.errors };
    }
    var ok = commit(next, { label: label, cause: "design", note: done });
    return { ok: ok, refused: [], errors: [] };
  }

  function refusedResult(result) {
    var first = result.refused[0];
    var collision = result.collisions && result.collisions[0];
    ruleMessage("⚠ " + first.message + (collision ? " (" + Design.describeCollision(collision) + ")" : ""), "warn");
    return { ok: false, refused: result.refused, collisions: result.collisions || [], errors: [] };
  }

  /* 규칙 더하기·고치기·지우기 → { ok, id, refused, errors } — 화면 칸과 FontStudio.design.addRule/updateRule/deleteRule이 같은 길 */
  function addRule(spec) {
    var result = Rules.addRule(state.json, spec || {});
    if (result.refused.length) {
      return refusedResult(result);
    }
    var outcome = commitRule(result.design, "규칙 더하기: " + result.id, "규칙 " + result.id + "을(를) 더했습니다.");
    outcome.id = result.id;
    if (outcome.ok) {
      ruleForm.form.reset();
      ruleMessage("더했습니다: " + result.id, "info");
      syncRuleForm();
    }
    return outcome;
  }

  function updateRule(id, spec) {
    var result = Rules.updateRule(state.json, id, spec || {});
    if (result.refused.length) {
      return refusedResult(result);
    }
    var outcome = commitRule(result.design, "규칙 고치기: " + id, "규칙 " + id + "을(를) 고쳤습니다.");
    outcome.id = id;
    if (outcome.ok) {
      stopEditingRule();
      ruleMessage("고쳤습니다: " + id, "info");
      renderRules();
    }
    return outcome;
  }

  function deleteRule(id) {
    if (!(state.json.rules || []).some(function (rule) { return rule && rule.id === id; })) {
      return { ok: false, id: id, refused: [{ code: "RULE_UNKNOWN", field: "id", message: "없는 규칙입니다: " + id }], errors: [] };
    }
    var outcome = commitRule(Design.removeRule(state.json, id), "규칙 지우기: " + id, "규칙 " + id + "을(를) 지웠습니다.");
    outcome.id = id;
    if (outcome.ok && ruleForm.editing === id) {
      stopEditingRule();
    }
    return outcome;
  }

  function submitRuleForm() {
    var spec = readRuleForm();
    return ruleForm.editing ? updateRule(ruleForm.editing, spec) : addRule(spec);
  }

  /* 디자인 하나가 지금 모양의 원칙을 깨는 규칙 — 런타임 진단이 정본이고(D13), 진단을 내지 않는 예전 런타임이면 작업실 사본
   * (principleWarnings, 같은 판정)으로. warnings를 주지 않으면 그 디자인을 검사해 진단을 얻는다 */
  function principleList(json, profile, warnings) {
    if (!profile || !profiles[profile]) {
      return [];
    }
    var found = warnings;
    if (found === undefined) {
      found = validate(json).warnings;
    }
    return state.warningsReported ? Design.principleFromWarnings(json, found) : Design.principleWarnings(json, profile, profiles);
  }

  /* '이 모양과 맞지 않는 규칙' 한 칸(S5-B — 충돌 상자와 원칙 안내를 합침, ADR-030 §5). 글꼴 모양 단추 바로 아래라 쉬운 모드에도 보인다.
   * 막음(data-severity="block"): 고르려는 고정 모양이 그릴 수 없는 규칙(통짜 합자 모음) — 고를 때까지 글꼴 모양을 바꾸지 않는다.
   * 경고(data-severity="warn"): 지금 모양이 밝힌 원칙(역할·자모로만 고름, 자리마다 변주 없음)을 깨는 규칙 — 그대로 그리고 되돌리는 길.
   * 줄마다 한국어 한 줄이고, 규칙 이름은 정밀 모드에서만 보인다(쉬운 모드 화면 말에 코드가 없다) */
  function mismatchItem(text, ruleId, extra) {
    var item = document.createElement("li");
    if (ruleId) {
      var name = document.createElement("code");
      name.setAttribute("data-studio-precise", "");
      name.textContent = ruleId;
      item.appendChild(name);
      item.appendChild(document.createTextNode(" "));
    }
    var line = document.createElement("span");
    line.textContent = text;
    item.appendChild(line);
    if (extra) {
      var detail = document.createElement("span");
      detail.setAttribute("data-studio-precise", "");
      detail.className = "studio-design-mismatch-detail";
      detail.textContent = " (" + extra + ")";
      item.appendChild(detail);
    }
    return item;
  }

  function collisionItem(collision) {
    var item = mismatchItem("충돌 — " + Design.collisionText(collision), collision.rules.join("·"),
      collision.field === "source" ? collision.values.join(" / ") : null);
    item.dataset.collision = collision.rules.join(" ");
    item.className = "studio-design-collision";
    return item;
  }

  function renderPrinciple(layout) {
    var box = $("[data-design-principle]");
    var list = box.querySelector("ul");
    list.textContent = "";
    var warnings = principleList(state.json, layout.profile, state.warnings);
    if (!warnings.length) {
      box.hidden = true;
      return 0;
    }
    warnings.forEach(function (warning) {
      var item = mismatchItem(Design.conflictText(warning), warning.ruleId);
      item.dataset.ruleId = warning.ruleId || "";
      item.dataset.field = warning.field;
      list.appendChild(item);
    });
    (state.principleCollisions || []).forEach(function (collision) {
      list.appendChild(collisionItem(collision));
    });
    box.querySelector("[data-design-principle-title]").textContent = "경고 — " + Design.layoutLabel(layout.profile) +
      "은 규칙을 역할·자모로만 고르고 자리마다 변주하지 않는 모양입니다. 아래 " + warnings.length +
      "건은 이 원칙을 깹니다 — 규칙은 그대로 그립니다.";
    box.hidden = false;
    return warnings.length;
  }

  function renderConflicts() {
    var box = $("[data-design-conflicts]");
    var list = box.querySelector("ul");
    list.textContent = "";
    if (!state.conflicts) {
      box.hidden = true;
      return 0;
    }
    state.conflicts.conflicts.forEach(function (conflict) {
      var item = mismatchItem(Design.conflictText(conflict), conflict.ruleId);
      item.dataset.ruleId = conflict.ruleId || "";
      item.dataset.field = conflict.field;
      list.appendChild(item);
    });
    state.conflicts.collisions.forEach(function (collision) {
      list.appendChild(collisionItem(collision));
    });
    box.querySelector("[data-design-conflicts-title]").textContent = "막음 — " + Design.layoutLabel(state.conflicts.profile) +
      "(으)로 바꾸려면 아래 " + state.conflicts.conflicts.length + "건을 정리해야 합니다(이 모양은 그릴 수 없습니다). 고르기 전에는 바꾸지 않습니다.";
    box.hidden = false;
    return state.conflicts.conflicts.length;
  }

  function renderMismatch(layout) {
    var blocked = renderConflicts();
    var warned = renderPrinciple(layout);
    var box = $("[data-design-mismatch]");
    box.hidden = !blocked && !warned;
    box.dataset.blocked = String(blocked);
    box.dataset.warned = String(warned);
  }

  // ── 비교 칸 ─────────────────────────────────────────────────────────

  var compareChrome = new CSSStyleSheet();
  compareChrome.replaceSync([
    ":host { display: block; }",
    "font-kku { display: block; }",
    /* 대표 자모(초성 ㄱ·중성 ㅏ)는 글자 색으로 — 모든 재료가 currentColor로 칠한다 */
    ".studio-compare-target { color: var(--studio-accent, #2447a8); }",
    /* 미리보기에서 고른 자모와 같은 역할·자모 */
    ".studio-compare-picked { outline: 1.5px dashed var(--studio-seal, #d62839); outline-offset: 1px; }"
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
      if (parked) {
        parked.add(compareHost); // 아직 그리지 않았다 — 처음 그릴 때까지 쉰다
      }
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

  /* 비교 칸이 보이는가 — 디자인 페이지이고 본문이 펼쳐져 있을 때만 잴 수 있다(감춰진 칸의 getBoundingClientRect는 0, D10) */
  function compareShown() {
    return !main.hidden && (typeof Studio.page !== "function" || Studio.page() === "design") && studioMode() !== "easy";
  }

  /* 작업실 모드(S3) — 비교 칸·고급은 정밀 모드에서만 */
  function studioMode() {
    return studioRoot.dataset.studioMode || "precise";
  }

  /* 쉬고 있는 비교 바탕 요소(비우고 디자인 이름을 뗀 것) — 다시 그릴 때까지 또 비우지 않는다 */
  var parked = typeof WeakSet === "function" ? new WeakSet() : null;

  /* 비교 바탕 요소 하나를 지금 디자인으로 그린다 */
  function drawCompareHost(target, row) {
    if (parked) {
      parked.delete(target);
    }
    target.setAttribute("font", Studio.state.fontId);
    if (Studio.glyphs) { Studio.glyphs.applyPreviewOptions(target, state.json); }
    if (drawnName()) {
      target.style.setProperty("--fy-design", drawnName());
    } else {
      target.style.removeProperty("--fy-design");
    }
    FontKku.render(target, { text: row.text });
    FontKku.refreshAll(target);
  }

  /* 쉬게 둔다 — 비우고 디자인 이름을 떼어, 디자인을 고칠 때마다 런타임이 감춰진 칸을 다시 그리지 않게 한다 */
  function parkCompareHost(target) {
    if (parked && parked.has(target)) {
      return;
    }
    target.style.removeProperty("--fy-design");
    FontKku.render(target, { text: "" });
    if (parked) {
      parked.add(target);
    }
  }

  /* 비교 칸은 미리보기 적용 여부와 관계없이 늘 지금(마지막 정상) 디자인으로 그린다. 보이지 않으면 그리지 않는다 — 보이면 따라잡는다 */
  function renderCompare() {
    if (!Studio.state.fontId || !Studio.doc()) {
      return;
    }
    if (!compareShown()) {
      parkCompare();
      return;
    }
    if (compareLife) {
      compareLife.work();
    }
    Design.COMPARE_ROWS.forEach(function (row) {
      drawCompareHost(compare[row.id].host, row);
    });
    scheduleReadout();
  }

  /* 비교 칸의 수명 보고(f-shell, S1) — 깨고 잠드는 때는 이 파일이 직접 맞춘다(compareShown: 디자인 페이지·본문 펼침). 접기를 바꾼 그
   * 자리에서 compare()가 맞으려면 펼치기가 곧바로 다시 그려야 해서다. 껍데기는 이 스크립트 뒤에 실리니 처음 훅에서 붙인다 */
  var compareLife = null;

  function wireCompare() {
    if (!compareLife && Studio.f && typeof Studio.f.lifecycle === "function") {
      compareLife = Studio.f.lifecycle("compare", { pages: ["design"], mode: "precise", element: $("[data-design-compare]") });
    }
  }

  function parkCompare() {
    clearTimeout(state.compareTimer);
    state.compareTimer = null;
    Design.COMPARE_ROWS.forEach(function (row) {
      parkCompareHost(compare[row.id].host);
    });
  }

  /* 페이지·접기가 바뀌면 — 보이면 지금 디자인으로 다시 그려 재고, 감춰지면 쉬게 둔다 */
  function syncCompare() {
    if (compareShown()) {
      renderCompare();
    } else {
      parkCompare();
    }
  }

  function scheduleReadout() {
    clearTimeout(state.compareTimer);
    state.compareTimer = compareShown() ? setTimeout(measureCompare, 40) : null;
  }

  /* 비교 바탕 요소 하나의 자리 읽기 — mark면 대표 자모·고른 자모를 칠한다 */
  function readCompareHost(target, row, mark) {
    var entries = [];
    Array.prototype.forEach.call(target.querySelectorAll('[part~="glyph"]'), function (glyph) {
      var box = glyph.getBoundingClientRect();
      Array.prototype.forEach.call(glyph.querySelectorAll('[part~="jamo"]'), function (node) {
        var rect = node.getBoundingClientRect();
        var role = Design.nodeRole(node.getAttribute("data-fy-role"));
        var jamo = node.getAttribute("data-jamo");
        entries.push({ role: role, jamo: jamo, box: [rect.left - box.left, rect.top - box.top, rect.width, rect.height] });
        if (mark) {
          node.classList.toggle("studio-compare-target", (role === row.role && jamo === row.jamo) ||
            (role === "head" && Design.headHas(jamo, row)));
          node.classList.toggle("studio-compare-picked", Boolean(state.picked) && role === state.picked.role && jamo === state.picked.jamo);
        }
      });
    });
    var readout = Design.placementReadout(entries, row);
    var layout = target.dataset.fyLayout || "legacy";
    var designed = Boolean(drawnName()) && target.dataset.fyDesign === drawnName();
    return { readout: readout, layout: layout, designed: designed, status: target.dataset.fyDesignStatus || "",
      value: { count: readout.count, variants: readout.variants, heads: readout.heads, layout: layout, design: designed } };
  }

  /* 화면 밖 재기 무대 — 비교 칸이 감춰졌을 때(다른 페이지·접힘) compare()가 부르면 그때만 그려 재고 다시 쉬게 둔다. 페이지가 감추지
   * 않는 자리(작업실 바탕 바로 아래, 화면 밖·보이지 않게)라 크기를 잴 수 있다. 글꼴 시트는 비교 칸과 같은 것을 받는다 */
  var probe = null;

  function buildProbe() {
    var stage = document.createElement("div");
    stage.setAttribute("aria-hidden", "true");
    stage.setAttribute("data-design-compare-probe", "");
    stage.style.cssText = "position:absolute;left:-100000px;top:0;inline-size:640px;visibility:hidden;pointer-events:none;";
    var root = stage.attachShadow({ mode: "open" });
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = Studio.coreHref();
    probe = { stage: stage, root: root, hosts: {}, ready: false };
    var done = function () { probe.ready = true; };
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 4000); // 시트가 오지 않아도(막힘) settled()를 붙들지 않는다 — 그리기 문장 칸과 같은 관례
    root.appendChild(link);
    Design.COMPARE_ROWS.forEach(function (row) {
      var probeHost = document.createElement("font-kku");
      probeHost.setAttribute("size", COMPARE_SIZE);
      probeHost.setAttribute("wrap-unit", "glyph");
      root.appendChild(probeHost);
      if (parked) {
        parked.add(probeHost);
      }
      probe.hosts[row.id] = probeHost;
    });
    Studio.addPreviewRoot(root, [compareChrome]);
    studioRoot.appendChild(stage);
  }

  /* 비교 칸 자리 읽기 — 보이면 비교 칸에서(재기가 밀려 있으면 지금), 감춰져 있으면 화면 밖 무대에서. 감춰진 칸에서 잰 값은 내지 않는다 */
  function compareNow() {
    if (compareShown()) {
      if (state.compareTimer) {
        clearTimeout(state.compareTimer);
        measureCompare();
      }
      return Design.clone(state.readouts);
    }
    if (!Studio.state.fontId || !Studio.doc() || !probe) {
      return Design.clone(state.readouts);
    }
    var out = {};
    Design.COMPARE_ROWS.forEach(function (row) {
      var probeHost = probe.hosts[row.id];
      drawCompareHost(probeHost, row);
      out[row.id] = readCompareHost(probeHost, row, false).value;
      parkCompareHost(probeHost);
    });
    return out;
  }

  function measureCompare() {
    state.compareTimer = null;
    if (!compareShown()) {
      return; // 감춰진 동안 잰 값은 0이다 — 보이면 다시 그려 잰다(page 훅·펼치기)
    }
    var identity = { requests: 0, suspected: 0, unmeasured: 0, unverified: 0 };
    Design.COMPARE_ROWS.forEach(function (row) {
      var entry = compare[row.id];
      var read = readCompareHost(entry.host, row, true);
      var readout = read.readout;
      var layout = read.layout;
      var designed = read.designed;
      var compareStatus = read.status;
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
      state.readouts[row.id] = read.value;
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
        var role = Design.nodeRole(node.getAttribute("data-fy-role"));
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
    line.setAttribute("data-studio-precise", "");
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

  /* JSON 칸에 마지막 정상 디자인과 다른 글이 있는가(D14) — null(같음) · { kind: unapplied | invalid, errors } */
  function pendingText() {
    var current = Design.textState(textarea.value, state.json);
    if (current.state === "clean") {
      return null;
    }
    if (current.state === "unreadable") {
      return { kind: "invalid", errors: [{ code: null, path: "", message: current.error.message }] };
    }
    var check = validate(current.design);
    return check.ok ? { kind: "unapplied", errors: [] } : { kind: "invalid", errors: check.errors };
  }

  function hideSaveChoice() {
    if (saveChoice) {
      saveChoice.hidden = true;
      delete saveChoice.dataset.kind;
    }
  }

  function askSave(pending, text) {
    saveChoice.dataset.kind = pending.kind;
    saveChoiceText.textContent = text || (pending.kind === "invalid"
      ? "⚠ JSON 칸의 글은 검사에 걸려(오류 " + pending.errors.length + "건 — " + Design.errorLine(pending.errors[0]) +
        ") 적용되지 않았습니다. 저장은 마지막 정상 디자인(미리보기에 보이는 것)을 씁니다 — 칸을 고쳐 적용하고 저장하거나, 마지막 정상 디자인을 저장하세요."
      : "⚠ JSON 칸에 적용하지 않은 고침이 있습니다. 저장은 마지막 정상 디자인(미리보기에 보이는 것)을 씁니다 — 칸의 글을 적용하고 저장할까요, 마지막 정상 디자인을 저장할까요?");
    saveChoice.hidden = false;
    note("저장하지 않았습니다 — 아래에서 무엇을 저장할지 고르세요.", "warn");
  }

  /* 마지막 정상 디자인(복사와 같은 출처)을 <id>.design.json으로 내려받는다 */
  function writeDesign(extra) {
    var name = Design.designFileName(state.json);
    var out = Design.pretty(state.json) + "\n";
    download(name, out, "application/json");
    note(name + "을 저장했습니다 — 마지막 정상 디자인" + (state.revision ? "(revision " + state.revision + ")" : "") + (extra || "") + ".");
    return { name: name, text: out, error: null, errors: [], source: "applied" };
  }

  /* 디자인 JSON 저장(D14) — 늘 마지막 정상 디자인을 저장한다(복사와 같다). JSON 칸에 적용하지 않은 글이 있으면 저장하지 않고 묻는다:
   * choice "apply" — 칸의 글을 적용하고(검사·등록·기록 한 줄) 저장, 걸리면 저장하지 않는다 · "last" — 마지막 정상 디자인을 저장.
   * 저장했으면 { name, text, error: null, errors: [], source }, 아니면 null */
  function save(choice) {
    var pending = pendingText();
    if (!pending) {
      hideSaveChoice();
      return writeDesign();
    }
    if (choice === "last") {
      hideSaveChoice();
      return writeDesign(" — JSON 칸의 " + (pending.kind === "invalid" ? "검사에 걸린" : "적용하지 않은") + " 글은 저장하지 않았습니다");
    }
    if (choice === "apply") {
      if (!setJson(textarea.value)) {
        askSave(pending.kind === "invalid" ? pending : { kind: "invalid", errors: state.error ? state.error.errors : [] },
          "⚠ JSON 칸의 글을 적용하지 못해 저장하지 않았습니다 — 아래 오류를 고친 뒤 다시 '적용하고 저장'을 누르거나, 마지막 정상 디자인을 저장하세요.");
        return null;
      }
      hideSaveChoice();
      return writeDesign(" — JSON 칸의 글을 적용했습니다");
    }
    askSave(pending);
    return null;
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

  // ── 그리기 입구 · 글꼴 모양 끄기(S3) ─────────────────────────────────

  /* '직접 그려 만들기' = 그리기 입구(하나로 합침) — 그리기 모듈(늦게 싣기)을 싣고 begin(): 재료를 그림 세트로 바꾸고 빈 그림 문서로
   * 그리기 탭을 연다. 싣지 못하면 재료만 그림 세트로(전과 같은 길) */
  function startDrawing() {
    var run = function () {
      if (Studio.draw && typeof Studio.draw.begin === "function") {
        Studio.draw.begin();
      } else {
        setMode("svg");
      }
    };
    if (Studio.draw || typeof Studio.need !== "function") {
      run();
      return;
    }
    Studio.need("draw").then(run, function () { setMode("svg"); });
  }

  /* 글꼴 모양을 통째로 바꾸기 전에 묻는다(⚑9, 검토 D5 — 고치기 페이지에서 옮겨 옴): 네모꼴로 바꾸기 · 디자인 끄기. 확인 단추는
   * [data-studio-design-square]·[data-studio-design-off]라 작업실이 작업실 동작으로 기록하고(Ctrl+Z) 이 파일의 studioRoot 처리기가 바꾼다 */
  var SHAPE_QUESTIONS = {
    square: "네모꼴로 바꾸면 모든 글자의 자리·크기가 모음·받침에 따라 바뀝니다(글꼴 모양이 바뀝니다). 바꿀까요? 바꾼 뒤에도 Ctrl+Z(⌘Z)로 되돌릴 수 있습니다.",
    off: "디자인을 끄면 미리보기의 모든 글자를 글꼴 CSS의 자리·크기로 다시 그립니다(글꼴 모양이 바뀝니다). 끌까요? 끈 뒤에도 Ctrl+Z(⌘Z)로 되돌릴 수 있습니다."
  };

  /* 지금 묻는 것("square"|"off") 또는 null */
  function shapeAsking() {
    var box = $("[data-design-shape-confirm]");
    return box.hidden ? null : box.dataset.kind || null;
  }

  function askShape(kind) {
    var box = $("[data-design-shape-confirm]");
    box.hidden = !kind;
    box.dataset.kind = kind || "";
    $("[data-design-shape-question]").textContent = kind ? SHAPE_QUESTIONS[kind] : "";
    Array.prototype.forEach.call(box.querySelectorAll("[data-design-shape-kind]"), function (button) {
      button.hidden = button.dataset.designShapeKind !== kind;
    });
    Array.prototype.forEach.call(section.querySelectorAll("[data-design-shape-ask]"), function (button) {
      button.setAttribute("aria-expanded", String(button.dataset.designShapeAsk === kind));
    });
  }

  function syncShapeActions() {
    var off = !state.applied;
    var square = Design.layoutState(state.json, profiles).profile === Design.SQUARE_PROFILE;
    section.querySelector('[data-design-shape-ask="off"]').hidden = off;
    section.querySelector('[data-design-shape-ask="square"]').hidden = square && !off;
    $("[data-design-shape-on]").hidden = !off || state.supported === false;
    var asking = shapeAsking();
    if ((asking === "off" && off) || (asking === "square" && square && !off)) {
      askShape(null);
    }
  }

  // ── 이벤트 ──────────────────────────────────────────────────────────

  function bind() {
    section.addEventListener("click", function (event) {
      var target = event.target;
      var start = target.closest("[data-design-start]");
      if (start) {
        if (start.dataset.designStart === "svg") {
          startDrawing();
        } else {
          setMode(start.dataset.designStart);
        }
      } else if (target.closest("[data-design-shape-ask]")) {
        var kind = target.closest("[data-design-shape-ask]").dataset.designShapeAsk;
        askShape(shapeAsking() === kind ? null : kind);
      } else if (target.closest("[data-design-shape-cancel]")) {
        askShape(null);
        note("글꼴 모양을 바꾸지 않았습니다.");
      } else if (target.closest("[data-design-shape-on]")) {
        setApplied(true);
        note("디자인을 다시 켰습니다 — 미리보기는 디자인으로 그립니다.");
      } else if (target.closest("[data-studio-design-off], [data-studio-design-square]")) {
        askShape(null); // 확인 — 바꾸기는 아래 studioRoot 처리기와 작업실(font-studio.js confirmShapeChange)이 한다
      } else if (target.closest("[data-design-fold]")) {
        fold(main.hidden);
      } else if (target.closest("[data-design-apply-json]")) {
        setJson(textarea.value);
      } else if (target.closest("[data-design-revert]")) {
        state.error = null;
        hideSaveChoice();
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
      } else if (target.closest("[data-design-conflicts-cancel]")) {
        resolveConflicts("cancel");
      } else if (target.closest("[data-design-principle-flatten]")) {
        resolvePrinciple("flatten");
      } else if (target.closest("[data-design-principle-drop]")) {
        resolvePrinciple("drop");
      } else if (target.closest("[data-design-rule-edit]")) {
        startEditingRule(target.closest("[data-design-rule-edit]").dataset.designRuleEdit);
      } else if (target.closest("[data-design-rule-delete]")) {
        deleteRule(target.closest("[data-design-rule-delete]").dataset.designRuleDelete);
      } else if (target.closest("[data-design-rule-cancel]")) {
        stopEditingRule();
        renderRules();
      } else if (target.closest("[data-design-save]")) {
        save();
      } else if (target.closest("[data-design-save-apply]")) {
        save("apply");
      } else if (target.closest("[data-design-save-last]")) {
        save("last");
      }
    });
    section.addEventListener("change", function (event) {
      var target = event.target;
      if (target.matches("[data-design-apply]")) {
        setApplied(target.checked);
      } else if (target.matches('input[name="design-layout"]')) {
        if (!setLayout(target.value)) {
          syncForm(); // 바꾸지 않았으면 지금 글꼴 모양 단추로 돌린다
        }
      } else if (target.matches("[data-design-set]")) {
        setMode("svg", { set: target.value });
      } else if (target.matches("[data-design-family], [data-design-family-role]")) {
        setMode("font", { families: readFamilies() });
      } else if (target.matches("[data-design-open]") && target.files[0]) {
        openFile(target.files[0]);
        target.value = "";
      } else if (target.closest("[data-design-rule-form]")) {
        syncRuleForm(); // 짓기·짜임·받침을 바꾸면 조립식 칸·원칙 안내 줄을 맞춘다
      }
    });
    if (ruleForm.form) {
      ruleForm.form.addEventListener("submit", function (event) {
        event.preventDefault();
        submitRuleForm();
      });
      ruleForm.form.addEventListener("input", function (event) {
        if (event.target.matches("[data-design-rule-jamo]")) {
          syncRuleForm(); // 적은 자모를 만드는 조립식으로
        }
      });
    }
    /* 살펴보기의 고정 배치 안내 단추(font-studio.js renderFixedTarget) */
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

  /* 디자인 페이지가 감춰지면 비교 칸을 쉬게 두고(그리지도 재지도 않는다 — 감춰진 칸의 크기는 0, D10), 보이면 지금 디자인으로
   * 다시 그려 잰다. 감춰진 동안 compare()는 화면 밖 무대에서 잰다 */
  Studio.on("page", function () {
    wireCompare();
    syncCompare();
  });

  if (typeof MutationObserver === "function") {
    new MutationObserver(function () {
      wireCompare();
      syncCompare();
      /* 모드마다 다른 화면 말(그림 세트 이름) — 세트 칸·진행 줄을 다시 쓴다 */
      fillSetOptions(Design.currentSet(state.json));
      renderProgress($("[data-design-progress]"), state.json.mode === "svg" ? Design.currentSet(state.json) : null);
    }).observe(studioRoot, { attributes: true, attributeFilter: ["data-studio-mode"] });
  }

  Studio.on("render", function () {
    wireCompare();
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
    state.picked = { role: Design.nodeRole(node.getAttribute("data-fy-role")), jamo: node.getAttribute("data-jamo") };
    markCompare();
    api.renderTrace(node, typeof FontKku.traceOf === "function" ? FontKku.traceOf(host) : null);
  });

  // ── 시작 ────────────────────────────────────────────────────────────

  buildCompare();
  buildProbe();
  bind();
  fold(state.applied);
  var booted = register(state.json);
  state.name = booted.name || null;
  state.revision = booted.revision || null;
  state.warnings = booted.warnings || [];
  renderWarnings();
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
    return Boolean(state.compareTimer) || Boolean(probe && !probe.ready) || Object.keys(state.loadingSets).length > 0 ||
      busyChecks.some(function (check) {
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
    resolvePrinciple: resolvePrinciple,
    /* 규칙 목록(S5-B) — 화면 칸과 같은 길. spec: { jamo, role, vowelLayout, hasFinal, source, method, recipe, fit } →
     * { ok, id, refused: [{ code, field, message }], errors(validateDesign) } */
    addRule: addRule,
    updateRule: updateRule,
    deleteRule: deleteRule,
    editRule: startEditingRule,
    setApplied: setApplied,
    undo: undo,
    redo: redo,
    /* 디자인 JSON 저장 — choice: undefined(칸에 적용하지 않은 글이 있으면 묻고 null) · "apply"(적용하고 저장) · "last"(마지막 정상 디자인) */
    save: save,
    /* 지금 디자인의 런타임 진단(validateDesign warnings) */
    warnings: function () { return Design.clone(state.warnings); },
    restore: restore,
    /* 비교 칸 자리 { initial, medial: { count, variants, heads, layout, design } } — 어느 페이지에서나 지금 디자인의 값(D10) */
    compare: compareNow,
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
