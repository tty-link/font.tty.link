/* Human review records (ADR-031, PLAN-STUDIO-002 ⚑8 — 2026-10-18 user decision).
 * A verdict keeps two pieces of evidence:
 * - fingerprint: the font content (CSS, design, material/drawing data) and the runtime/dependency fingerprints. No device.
 * - render: a signature of the item's own rendered glyph nodes. When the content changes, only items whose rendering
 *   changed need a new review.
 * Browser, screen scale and viewport are kept as reference only (`reference`) and never invalidate a verdict. So are the
 * look and background the reviewer chose to see the item on (`reference.look`, `reference.background` — the devsite sheet's
 * `look`·`background` names: a theme look id such as "neon", a theme tone id such as "dark"; PLAN-STUDIO-002 S5-C).
 * Vocabulary: pass(통과) · needs-fix(고칠 것) · hold(보류); a record without a verdict is unreviewed(미검수).
 * Version-1 records (pass/fail/pending, fingerprint over content + browser + scale + session) are read and converted:
 * fail → needs-fix, pending → hold. */
(function (global) {
  "use strict";

  var Util = global.FontStudioUtil || (typeof require === "function" ? require("./font-studio-util.js") : null);
  if (!Util) {
    throw new Error("font-studio-review-model: load font-studio-util.js first");
  }
  var VERSION = 2;
  var SAMPLES = [
    { id: "words", title: "대표 낱말", text: "한글 조형 의 왕 읽 흙 괆" },
    { id: "shapes", title: "짜임과 받침", text: "가 각 간 고 곡 곤 과 곽 관 의 읽 값 흙" },
    { id: "pairs", title: "헷갈리는 글자", text: "가 카 나 다 마 바 자 차 아 어 오 우 브 보" },
    { id: "paragraph", title: "문장과 띄어쓰기", text: "작은 글씨도 또렷하게 읽힙니다. 한글의 모양과 낱말 사이를 살펴봅니다." }
  ];
  var VERDICTS = ["pass", "needs-fix", "hold"];
  var LEGACY_VERDICTS = { fail: "needs-fix", pending: "hold" };
  var LABELS = { pass: "통과", "needs-fix": "고칠 것", hold: "보류", unreviewed: "미검수", stale: "다시 검수" };
  var clone = Util.clone;
  function stable(value) {
    if (Array.isArray(value)) { return "[" + value.map(stable).join(",") + "]"; }
    if (value && typeof value === "object") {
      return "{" + Object.keys(value).sort().filter(function (key) { return value[key] !== undefined; }).map(function (key) {
        return JSON.stringify(key) + ":" + stable(value[key]);
      }).join(",") + "}";
    }
    return JSON.stringify(value);
  }
  function digest(prefix, text) {
    var pair = Util.hashPair(text);
    return prefix + "-" + pair[0] + "-" + pair[1] + "-" + text.length;
  }
  /* Known verdict or a version-1 alias → the current word; anything else → undefined. */
  function verdict(value) {
    if (typeof value !== "string") { return undefined; }
    if (VERDICTS.indexOf(value) >= 0) { return value; }
    return Object.prototype.hasOwnProperty.call(LEGACY_VERDICTS, value) ? LEGACY_VERDICTS[value] : undefined;
  }
  /* Font content + runtime evidence. The caller passes runtime/dependency facts only — never the device. */
  function fingerprint(project, runtime) {
    var font = project.font || {};
    return digest("review-v2", stable({ font: { id: font.id, css: font.css }, design: project.design || null,
      material: project.material || null, runtime: runtime || null }));
  }
  /* Version-1 rule (content + the observed browser, scale and session), kept only to read old records. */
  function legacyFingerprint(project, environment) {
    return digest("review-v1", stable({ font: project.font, design: project.design || null, material: project.material || null, environment: environment || null }));
  }
  /* Signature of one item's rendering: the caller describes the rendered glyph nodes as text lines. */
  function renderSignature(lines) {
    return digest("render-v1", (lines || []).join("\n"));
  }
  function evidenceOf(current) {
    return typeof current === "string" ? { fingerprint: current } : current || {};
  }
  var VIEW_ID = /^[a-z][a-z0-9-]{0,39}$/;
  function reference(value) {
    if (!value || typeof value !== "object") { return null; }
    var scale = Number(value.scale);
    var out = {
      browser: typeof value.browser === "string" ? value.browser.slice(0, 300) : "",
      scale: isFinite(scale) && scale > 0 ? Math.round(scale * 1000) / 1000 : null,
      viewport: typeof value.viewport === "string" ? value.viewport.slice(0, 40) : ""
    };
    // 본 꾸밈·바탕(참고만) — 고르지 않았으면 적지 않는다
    if (typeof value.look === "string" && VIEW_ID.test(value.look)) { out.look = value.look; }
    if (typeof value.background === "string" && VIEW_ID.test(value.background)) { out.background = value.background; }
    return out;
  }
  /* Who recorded the verdict (FontStudio.api.setActor / review.record) — { kind: "human"|"agent", id }. Older records have none. */
  function actorOf(value) {
    if (!value || typeof value !== "object" || (value.kind !== "human" && value.kind !== "agent")) { return null; }
    return { kind: value.kind, id: typeof value.id === "string" ? value.id.slice(0, 100) : null };
  }
  function previous(value) {
    var status = value && verdict(value.status);
    return status ? { status: status, note: String(value.note || "").slice(0, 4000), at: String(value.at || "") } : null;
  }
  function normalize(value) {
    var result = { version: VERSION, selected: "words", customText: "", records: {} };
    if (!value || (value.version !== 1 && value.version !== VERSION)) { return result; }
    result.customText = typeof value.customText === "string" ? value.customText.slice(0, 500) : "";
    var ids = SAMPLES.map(function (s) { return s.id; }).concat(["custom"]);
    if (ids.indexOf(value.selected) >= 0) { result.selected = value.selected; }
    ids.forEach(function (id) {
      var record = value.records && value.records[id];
      if (!record || typeof record.fingerprint !== "string") { return; }
      // A version-2 record may hold a note before any verdict (status null = unreviewed).
      var status = value.version === VERSION && record.status === null ? null : verdict(record.status);
      if (status === undefined) { return; }
      result.records[id] = {
        status: status, fingerprint: record.fingerprint,
        render: typeof record.render === "string" ? record.render.slice(0, 120) : "",
        text: typeof record.text === "string" ? record.text.slice(0, 500) : "",
        note: typeof record.note === "string" ? record.note.slice(0, 4000) : "",
        at: typeof record.at === "string" ? record.at : "",
        reference: reference(record.reference),
        previous: previous(record.previous)
      };
      var who = actorOf(record.actor);
      if (who) { result.records[id].actor = who; }
    });
    var baseline = value.baseline;
    if (baseline && baseline.font && typeof baseline.font.css === "string") {
      result.baseline = {
        font: { css: baseline.font.css, id: String(baseline.font.id || "untitled"), baseUrl: String(baseline.font.baseUrl || "") },
        design: clone(baseline.design || null), material: clone(baseline.material || null),
        at: String(baseline.at || ""), directSets: Array.isArray(baseline.directSets) ? baseline.directSets.filter(function (name) { return typeof name === "string"; }).slice(0, 3) : [], hostStyle: typeof baseline.hostStyle === "string" ? baseline.hostStyle : ""
      };
    }
    return result;
  }
  function samples(value) {
    var result = clone(SAMPLES);
    if (value.customText.trim()) { result.push({ id: "custom", title: "내 문장", text: value.customText }); }
    return result;
  }
  /* Does this record's status depend on the item's current render signature? Only when it holds a verdict for the same
   * text and the content evidence differs (or cannot be trusted because a dependency is unverified). */
  function needsRender(record, current, text) {
    var evidence = evidenceOf(current);
    return Boolean(record && record.status && record.text === text && record.render &&
      (evidence.unverified || record.fingerprint !== evidence.fingerprint));
  }
  /* unreviewed · stale · pass · needs-fix · hold. `current` is { fingerprint, render?, unverified? } (a string is the
   * fingerprint). Same content → the verdict stands; otherwise the item's own rendering decides. */
  function status(record, current, text) {
    if (!record || !record.status) { return "unreviewed"; }
    if (record.text !== text) { return "stale"; }
    var evidence = evidenceOf(current);
    if (!evidence.unverified && evidence.fingerprint && record.fingerprint === evidence.fingerprint) { return record.status; }
    if (record.render && evidence.render && record.render === evidence.render) { return record.status; }
    return "stale";
  }
  /* Record a verdict (or, with verdict null, a note before any verdict) for `sample`. Version-1 words are accepted.
   * `actor` ({ kind, id }) is optional and kept on the record. */
  function mark(value, sample, current, verdictValue, note, at, actor) {
    var next = verdictValue === null ? null : verdict(verdictValue);
    if (next === undefined) { throw new Error("Unknown review verdict"); }
    var evidence = evidenceOf(current);
    var result = normalize(value), old = result.records[sample.id];
    var render = typeof evidence.render === "string" ? evidence.render : "";
    var redrawn = old && (old.render && render ? old.render !== render : old.fingerprint !== evidence.fingerprint);
    result.records[sample.id] = {
      status: next, fingerprint: String(evidence.fingerprint || ""), render: render, text: sample.text,
      note: String(note || "").slice(0, 4000), at: at || new Date().toISOString(), reference: reference(evidence.reference),
      previous: old && old.status && (redrawn || old.status !== next) ? { status: old.status, note: old.note, at: old.at } : old && old.previous || null
    };
    var who = actorOf(actor);
    if (who) { result.records[sample.id].actor = who; }
    return result;
  }
  /* A version-1 record that is still current under its own rule takes the version-2 evidence; its verdict, note and
   * time stay. */
  function adopt(record, current) {
    var evidence = evidenceOf(current), next = clone(record);
    next.fingerprint = String(evidence.fingerprint || "");
    next.render = typeof evidence.render === "string" ? evidence.render : "";
    next.reference = reference(evidence.reference);
    return next;
  }
  var api = { VERSION: VERSION, SAMPLES: SAMPLES, VERDICTS: VERDICTS, LABELS: LABELS, verdict: verdict, normalize: normalize,
    fingerprint: fingerprint, legacyFingerprint: legacyFingerprint, renderSignature: renderSignature, samples: samples,
    needsRender: needsRender, status: status, mark: mark, adopt: adopt, actorOf: actorOf };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  global.FontStudioReviewModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
