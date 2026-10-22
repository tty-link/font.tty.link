/* 작업실 거절 표(PLAN-STUDIO-002 '자동화 계약 v1', 원칙 6 — 화면 거절 문구와 API 거절 코드는 같은 표에서 나온다).
 *
 * 코드 하나 = { tone, text(params) → 한 줄(한국어, 끝 마침표 없음), hint?(params) → 해결 길(끝 마침표 없음) }.
 * - make(code, params) → { code, message, hint?, detail?, suggestScope? } — FontStudio.api의 refused[] 한 줄, FontStudio.setValue의 { code, message }
 * - line(refusal) → 화면 알림 한 줄: warn·error는 "⚠ " + message + "." + (hint ? " " + hint + "." : ""), info는 "⚠" 없이
 * 모르는 코드는 던진다(오타로 말없는 거절을 만들지 않는다). 브라우저와 Node 공용, 문서·렌더러 없이 돈다. */
(function (global) {
  "use strict";

  function text(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  var CODES = {
    PROPERTY_UNKNOWN: {
      tone: "warn",
      text: function (p) { return "모르는 속성입니다: " + text(p.property); }
    },
    NO_SELECTION: {
      tone: "warn",
      text: function () { return "고른 자모가 없습니다"; },
      hint: function () { return "미리보기에서 자모를 고르세요"; }
    },
    TARGET_NOT_FOUND: {
      tone: "warn",
      text: function (p) {
        return p.what === "jamo" ? "그 글자에 " + text(p.jamo) + " 자모가 없습니다"
          : p.what === "point" ? "그 자리에 고를 자모가 없습니다"
          : "미리보기에 그 글자가 없습니다" + (p.glyph ? ": " + text(p.glyph) : "");
      }
    },
    NO_TARGET: {
      tone: "warn",
      /* action: "위치를 옮길"처럼 동사까지 — 없으면 "<속성 이름>을(를) 고칠" */
      text: function (p) { return "이 범위에서는 " + (p.action ? text(p.action) : text(p.name) + "을(를) 고칠") + " 수 없습니다"; },
      hint: function () { return "범위를 바꾸세요"; }
    },
    SCOPE_UNAVAILABLE: {
      tone: "warn",
      text: function (p) { return "이 자모에는 '" + text(p.scopeName || p.scope) + "' 범위가 없습니다"; },
      hint: function (p) { return p.available ? "쓸 수 있는 범위: " + text(p.available) : "다른 범위를 고르세요"; }
    },
    CONTEXT_UNAVAILABLE: {
      tone: "warn",
      text: function () { return "이 자모에는 그 문맥이 없습니다"; },
      hint: function () { return "같은 글자에 있는 다른 자모를 문맥으로 고르세요"; }
    },
    EDIT_BLOCKED: {
      tone: "warn",
      /* reason: 가려진 까닭 문장(작업실의 refusalText), escalation: '대신 고치기' 길이 있는가, narrower: 이 자모에 먹는 가장 가까운
       * 좁은 범위의 이름(범위 사다리, ADR-035 — 결과의 suggestScope에 그 범위 id) */
      text: function (p) { return text(p.reason) || "다른 규칙이 이 값을 정해 고칠 수 없습니다"; },
      hint: function (p) {
        if (p.narrower) {
          return "'" + text(p.narrower) + "' 범위로 고치면 이 자모에 보입니다" + (p.escalation ? " — 또는 '대신 … 규칙 고치기'를 누르세요" : "");
        }
        return p.escalation ? "'대신 … 규칙 고치기'를 누르거나 범위를 바꾸세요" : "범위를 바꾸세요";
      }
    },
    EDIT_FAILED: {
      tone: "error",
      text: function () { return "편집하지 못했습니다"; }
    },
    VALUE_INVALID: {
      tone: "warn",
      /* kind: "move"(끌기·방향키) | "step"(크기·회전 키) | "value"(값을 셈할 수 없음) | "factor"(배수 보정 칸에 수도 크기 길이도 아닌 값 —
       * 이 자모 어디서나·같은 짜임 모두·문맥·이 글자만의 크기·배율은 배수다, ADR-035) */
      text: function (p) {
        return p.kind === "move" ? text(p.name) + " 값이 길이의 합이 아니라 끌거나 키로 옮길 수 없습니다"
          : p.kind === "step" ? text(p.name) + " 값은 키로 셈할 수 없습니다"
          : p.kind === "factor" ? "이 범위의 " + text(p.name) + "은(는) 배수로 적습니다" + (p.value !== undefined ? ": " + text(p.value) : "")
          : text(p.name) + " 값을 셈할 수 없습니다" + (p.value !== undefined ? ": " + text(p.value) : "");
      },
      hint: function (p) {
        return p.kind === "factor" ? "수(예: 1.1)를 적으세요 — 크기는 em·px 길이도 받아 지금 보이는 크기에 맞춘 배수로 바꿉니다"
          : "값 칸에서 직접 고치세요";
      }
    },
    MODULE_UNAVAILABLE: {
      tone: "warn",
      text: function (p) { return "이 기능을 아직 쓸 수 없습니다" + (p.module ? " (" + text(p.module) + ")" : ""); },
      hint: function () { return "작업실이 다 열린 뒤 다시 하세요"; }
    },
    NOT_READY: {
      tone: "warn",
      text: function (p) { return text(p.what || "작업실") + "이(가) 아직 준비되지 않았습니다"; },
      hint: function () { return "잠시 뒤 다시 하세요"; }
    },
    NOTHING_TO_UNDO: {
      tone: "info",
      text: function () { return "되돌릴 것이 없습니다"; }
    },
    NOTHING_TO_REDO: {
      tone: "info",
      text: function () { return "다시 할 것이 없습니다"; }
    },
    /* 하나의 기록(PLAN-STUDIO-002 S2) — 되돌리기·다시·건너뛰기가 막힌 까닭 */
    UNDO_FAILED: {
      tone: "warn",
      text: function () { return "되돌리지 못했습니다"; },
      hint: function () { return "편집 기록에서 그 앞 항목을 누르거나 다시 고치세요"; }
    },
    REDO_FAILED: {
      tone: "warn",
      text: function () { return "다시 하지 못했습니다"; }
    },
    ENTRY_BLOCKED: {
      tone: "warn",
      text: function () { return "이 일은 여러 갈래를 함께 바꿨고 그 뒤에 한 일이 있어 따로 되돌릴 수 없습니다"; },
      hint: function () { return "Ctrl+Z(⌘Z)로 차례대로 되돌리세요"; }
    },
    ENTRY_UNKNOWN: {
      tone: "warn",
      text: function () { return "편집 기록에 없는 항목입니다"; }
    },
    BATCH_OPEN: {
      tone: "info",
      text: function () { return "한 번에 묶어 고치는 중입니다"; },
      hint: function () { return "끝난 뒤 다시 하세요"; }
    },
    NO_CHANGE: {
      tone: "info",
      text: function () { return "바꿀 것이 없습니다"; }
    },
    PAGE_UNKNOWN: {
      tone: "warn",
      text: function (p) { return "모르는 작업실 페이지입니다: " + text(p.page); },
      hint: function () { return "design · edit · sheet · review 중 하나를 쓰세요"; }
    },
    MODE_UNKNOWN: {
      tone: "warn",
      text: function (p) { return "모르는 보기입니다: " + text(p.mode); },
      hint: function () { return "easy(쉬운) · precise(정밀) 중 하나를 쓰세요"; }
    },
    PROJECT_INVALID: {
      tone: "error",
      text: function (p) { return "프로젝트를 열지 못했습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    },
    DESIGN_INVALID: {
      tone: "warn",
      text: function (p) { return "디자인 검사에 걸려 적용하지 않았습니다" + (p.first ? " — " + text(p.first) : ""); }
    },
    DESIGN_CANCELLED: {
      tone: "info",
      text: function () { return "영향을 확인하고 바꾸지 않았습니다"; }
    },
    SVG_REFUSED: {
      tone: "warn",
      text: function (p) { return text(p.key) + " 칸의 SVG를 가져오지 않았습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    },
    SAMPLE_UNKNOWN: {
      tone: "warn",
      text: function (p) { return "검수 항목이 없습니다: " + text(p.key); }
    },
    VERDICT_UNKNOWN: {
      tone: "warn",
      text: function (p) { return "모르는 판정입니다: " + text(p.verdict); },
      hint: function () { return "pass(통과) · needs-fix(고칠 것) · hold(보류) 중 하나를 쓰세요"; }
    },
    /* 글꼴 묶음·저장 창구(PLAN-STUDIO-002 S2) — FontStudio.save·openAny·reloadFromStore */
    NO_FONT: {
      tone: "warn",
      text: function () { return "연 글꼴이 없습니다"; }
    },
    SAVE_NEEDS_CHOICE: {
      tone: "info",
      text: function (p) { return "처음 저장입니다 — 기본 제공 글꼴 " + text(p.font) + "을 새 글꼴로 저장할지 정하세요"; },
      hint: function (p) { return p.suggestedName ? "새 이름 예: " + text(p.suggestedName) : ""; }
    },
    /* 짓는 방식(ADR-034, PLAN-COMPOSE-001 C3) — FontStudio.composition.set·api.setComposition */
    COMPOSITION_INVALID: {
      tone: "warn",
      text: function (p) { return "짓는 방식 값을 알 수 없습니다: " + text(p.value); },
      hint: function () { return "모양대로·음절로·겹모음 통째로·자모로·조각으로·원형으로 가운데 하나, 또는 모음·받침 나누기와 조각 깊이를 고르세요"; }
    },
    SOURCE_INVALID: {
      tone: "warn",
      text: function (p) { return "원문에 구문 오류가 " + text(p.count) + "건 있어 적용하지 않았습니다"; },
      hint: function () { return "원문 칸 아래 목록에서 그 줄을 고치거나 Esc로 되돌리세요"; }
    },
    NAME_INVALID: {
      tone: "warn",
      text: function (p) { return "새 글꼴 이름을 쓸 수 없습니다: " + text(p.name); },
      hint: function () { return "소문자로 시작하는 a-z, 0-9, - 조합으로 쓰세요"; }
    },
    SAME_NAME_BLOCKED: {
      tone: "warn",
      text: function (p) { return p.reason ? text(p.reason).replace(/[.。]\s*$/, "") : "기본 제공 글꼴 " + text(p.font) + "은 같은 이름으로 저장하지 않습니다"; },
      hint: function (p) { return p.reason ? "" : "새 글꼴로 저장하세요"; }
    },
    STORE_UNAVAILABLE: {
      tone: "error",
      text: function () { return "저장 창구가 준비되지 않았습니다"; }
    },
    STORE_UNREACHABLE: {
      tone: "error",
      text: function (p) { return "저장 창구에 닿지 못했습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    },
    STORE_FORBIDDEN: {
      tone: "error",
      text: function (p) { return "저장 권한이 없습니다" + (p.reason ? " — " + text(p.reason) : ""); },
      hint: function () { return "이 기기를 짝 맺거나 권한이 있는 곳에서 저장하세요"; }
    },
    STORE_FAILED: {
      tone: "error",
      text: function (p) { return "저장하지 못했습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    },
    REV_MISMATCH: {
      tone: "warn",
      text: function (p) { return "다른 곳에서 먼저 바뀌어 저장하지 않았습니다" + (p.actor ? " (" + text(p.actor) + ")" : ""); },
      hint: function () { return "다시 싣거나 덮어쓰세요"; }
    },
    STORE_NOT_FOUND: {
      tone: "warn",
      text: function (p) { return "저장 창구에 " + text(p.font) + "이 없습니다"; }
    },
    PACKAGE_INVALID: {
      tone: "error",
      text: function (p) { return "글꼴 묶음을 열 수 없습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    },
    OPEN_FAILED: {
      tone: "error",
      text: function (p) { return (p.file ? text(p.file) + "을 " : "") + "열지 못했습니다" + (p.reason ? " — " + text(p.reason) : ""); }
    }
  };

  var LIST = Object.keys(CODES);

  function has(code) {
    return Object.prototype.hasOwnProperty.call(CODES, code);
  }

  /* 거절 한 줄. params.detail(원문: 변수·규칙 줄)은 그대로 실린다 — 화면에서는 접는 '자세히'로 */
  function make(code, params) {
    if (!has(code)) {
      throw new Error("font-studio-refusals: unknown refusal code " + JSON.stringify(code));
    }
    var p = params || {};
    var entry = CODES[code];
    var out = { code: code, message: entry.text(p) };
    var hint = entry.hint ? entry.hint(p) : "";
    if (hint) {
      out.hint = hint;
    }
    if (p.detail) {
      out.detail = String(p.detail);
    }
    if (p.narrowerScope) {
      out.suggestScope = String(p.narrowerScope);
    }
    return out;
  }

  function tone(code) {
    return has(code) ? CODES[code].tone : "warn";
  }

  /* 화면 알림의 본문 한 줄(‘자세히’ 원문은 빼고) */
  function line(refusal) {
    if (!refusal || !refusal.code) {
      return "";
    }
    var warn = tone(refusal.code) !== "info";
    return (warn ? "⚠ " : "") + refusal.message + "." + (refusal.hint ? " " + refusal.hint + "." : "");
  }

  var api = { CODES: LIST, has: has, make: make, tone: tone, line: line };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.FontStudioRefusals = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
