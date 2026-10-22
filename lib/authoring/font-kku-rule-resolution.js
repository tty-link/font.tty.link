/* 조립 규칙의 순수 선택기. 런타임에는 같은 본문을 생성해 한 파일 설치를 유지한다.
 * 입력은 검증·정규화된 디자인/요청이다. 파싱과 한국어 설명은 호출자의 책임이다. */
(function (global) {
  "use strict";

  /* BEGIN SHARED RULE RESOLUTION */
  var RULE_RESOLUTION = (function () {
    function fits(rule, req) {
      return rule.jamo === req.jamo && (!rule.role || rule.role === req.rootRole) &&
        (!rule.layout || rule.layout === req.layout) && (rule.hasFinal === null || rule.hasFinal === req.hasFinal);
    }

    function winner(design, req, field) {
      var best = null;
      design.rules.forEach(function (rule) {
        if (rule[field] && fits(rule, req) && (!best || rule.specificity > best.specificity)) {
          best = rule;
        }
      });
      return best;
    }

    function choice(kind, name, value, rule) {
      return { kind: kind, winner: name, value: value, rule: rule || null };
    }

    function source(design, req) {
      if (req.binding && req.binding.source) {
        return choice("binding", "binding", req.binding.source);
      }
      var rule = winner(design, req, "source");
      if (rule) { return choice("rule", rule.id, rule.source, rule); }
      if (req.inherited) { return choice("inherited", "inherited", req.inherited); }
      if (design.roleSources[req.rootRole]) {
        return choice("role", "roleSources." + req.rootRole, design.roleSources[req.rootRole]);
      }
      return choice("defaults", "defaults", design.defaults.source || null);
    }

    function bundle(design, req) {
      if (req.binding && req.binding.bundle) {
        return choice("binding", "binding", req.binding.bundle);
      }
      var rule = winner(design, req, "bundle");
      if (rule) { return choice("rule", rule.id, rule.bundle, rule); }
      return choice("defaults", "defaults", { method: design.defaults.method || "auto", recipe: null, bindings: null });
    }

    function fallbacks(design, req) {
      var rule = winner(design, req, "fallbackSources");
      return rule ? choice("rule", rule.id, rule.fallbackSources.slice(), rule) :
        choice("defaults", "fallback.sourceIds", (design.fallback.sourceIds || []).slice());
    }

    return { fits: fits, winner: winner, source: source, bundle: bundle, fallbacks: fallbacks };
  })();
  /* END SHARED RULE RESOLUTION */

  global.FontKkuRuleResolution = RULE_RESOLUTION;
  if (typeof module !== "undefined" && module.exports) { module.exports = RULE_RESOLUTION; }
})(typeof window !== "undefined" ? window : globalThis);
