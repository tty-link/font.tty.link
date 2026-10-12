/* font-studio-recipe-catalog.js — 작업실 조립식 목록 거울 (설계 v1.2 §13.3, PLAN-HANGUL-001 F1)
 *
 * scripts/build_studio_recipe_catalog.js가 spec/jamo-recipes.json·spec/authoring-stages.json에서 통째로 만든다 — 손으로 고치지 않는다.
 * 런타임은 조립식 표를 꺼내 주지 않아서 작업실(규칙 모델·조립식 비교·그림 단계)이 이 거울을 읽는다. 정본이 바뀌면
 * node scripts/build_studio_recipe_catalog.js --write. 브라우저(window.FontStudioRecipeCatalog)와 Node(require) 공용, 얼린 객체.
 */
(function (global) {
  "use strict";

  /* BEGIN GENERATED studio-recipe-catalog: scripts/build_studio_recipe_catalog.js from spec/jamo-recipes.json·spec/authoring-stages.json — do not edit by hand. */
  var CATALOG = {
    "versions": {"recipes":"1.0","stages":"1.0"},
    "operations": {"double":"병서 — 같은 자모 둘을 왼쪽·오른쪽에. 대상 획을 앞 조각의 획 수로 나눈다","final-pair":"겹받침 — 두 자음을 받침 자리에. 획 나누기는 double과 같다","compose":"합용 — 두 모음을 한 자모 안에. 획 나누기는 double과 같다","add":"가획 — base 자모(또는 그 위 계통)에서 온 획은 base로, 나머지 획(strokes 조각)은 하나씩 원소로. base가 그려지지 않았으면 base의 조립식으로 다시 내려간다","place":"조각마다 자리를 밝혀 놓는다(at) — strokes(대상 자모의 획 ID 묶음), segments(획 안 마디 \"획ID.번호\"), box(대상 자모 획 범위의 0–1 좌표 상자 — 짝·겹받침 안에서는 그 조각의 자리, 조각은 제 뼈대를 그 상자에 맞춘다). 이체(ㄹ)·가획을 선으로 세우는 기본(ㅎ·ㄹ·ㅂ·ㅍ)이 될 수 있고 — 그때는 그릴 재료가 있을 때만 쓴다 — 나머지는 디자인 규칙이 고르는 대안이다"},
    "recipes": [
      {"id":"double-giyeok","target":"ㄲ","operation":"double","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㄱ"}]},
      {"id":"double-digeut","target":"ㄸ","operation":"double","parts":[{"id":"left","jamo":"ㄷ"},{"id":"right","jamo":"ㄷ"}]},
      {"id":"double-bieup","target":"ㅃ","operation":"double","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅂ"}]},
      {"id":"double-siot","target":"ㅆ","operation":"double","parts":[{"id":"left","jamo":"ㅅ"},{"id":"right","jamo":"ㅅ"}]},
      {"id":"double-jieut","target":"ㅉ","operation":"double","parts":[{"id":"left","jamo":"ㅈ"},{"id":"right","jamo":"ㅈ"}]},
      {"id":"final-giyeok-siot","target":"ㄳ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄱ"},{"id":"right","jamo":"ㅅ"}]},
      {"id":"final-nieun-jieut","target":"ㄵ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅈ"}]},
      {"id":"final-nieun-hieut","target":"ㄶ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄴ"},{"id":"right","jamo":"ㅎ"}]},
      {"id":"final-rieul-giyeok","target":"ㄺ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㄱ"}]},
      {"id":"final-rieul-mieum","target":"ㄻ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅁ"}]},
      {"id":"final-rieul-bieup","target":"ㄼ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅂ"}]},
      {"id":"final-rieul-siot","target":"ㄽ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅅ"}]},
      {"id":"final-rieul-tieut","target":"ㄾ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅌ"}]},
      {"id":"final-rieul-pieup","target":"ㄿ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅍ"}]},
      {"id":"final-rieul-hieut","target":"ㅀ","operation":"final-pair","parts":[{"id":"left","jamo":"ㄹ"},{"id":"right","jamo":"ㅎ"}]},
      {"id":"final-bieup-siot","target":"ㅄ","operation":"final-pair","parts":[{"id":"left","jamo":"ㅂ"},{"id":"right","jamo":"ㅅ"}]},
      {"id":"vowel-ae","target":"ㅐ","operation":"compose","parts":[{"id":"left","jamo":"ㅏ"},{"id":"right","jamo":"ㅣ"}]},
      {"id":"vowel-yae","target":"ㅒ","operation":"compose","parts":[{"id":"left","jamo":"ㅑ"},{"id":"right","jamo":"ㅣ"}]},
      {"id":"vowel-e","target":"ㅔ","operation":"compose","parts":[{"id":"left","jamo":"ㅓ"},{"id":"right","jamo":"ㅣ"}]},
      {"id":"vowel-ye","target":"ㅖ","operation":"compose","parts":[{"id":"left","jamo":"ㅕ"},{"id":"right","jamo":"ㅣ"}]},
      {"id":"vowel-wa","target":"ㅘ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅏ"}]},
      {"id":"vowel-wae","target":"ㅙ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅐ"}]},
      {"id":"vowel-oe","target":"ㅚ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅗ"},{"id":"vertical","jamo":"ㅣ"}]},
      {"id":"vowel-wo","target":"ㅝ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅓ"}]},
      {"id":"vowel-we","target":"ㅞ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅔ"}]},
      {"id":"vowel-wi","target":"ㅟ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅜ"},{"id":"vertical","jamo":"ㅣ"}]},
      {"id":"vowel-ui","target":"ㅢ","operation":"compose","parts":[{"id":"horizontal","jamo":"ㅡ"},{"id":"vertical","jamo":"ㅣ"}]},
      {"id":"kieuk-added","target":"ㅋ","operation":"add","parts":[{"id":"base","jamo":"ㄱ"},{"id":"added","strokes":"rest"}]},
      {"id":"digeut-added","target":"ㄷ","operation":"add","parts":[{"id":"base","jamo":"ㄴ"},{"id":"added","strokes":"rest"}]},
      {"id":"tieut-added","target":"ㅌ","operation":"add","parts":[{"id":"base","jamo":"ㄷ"},{"id":"added","strokes":"rest"}]},
      {"id":"jieut-added","target":"ㅈ","operation":"add","parts":[{"id":"base","jamo":"ㅅ"},{"id":"added","strokes":"rest"}]},
      {"id":"chieut-added","target":"ㅊ","operation":"add","parts":[{"id":"base","jamo":"ㅈ"},{"id":"added","strokes":"rest"}]},
      {"id":"yeorinhieut-added","target":"ㆆ","operation":"add","parts":[{"id":"base","jamo":"ㅇ"},{"id":"added","strokes":"rest"}]},
      {"id":"hieut-added","target":"ㅎ","operation":"add","parts":[{"id":"base","jamo":"ㆆ"},{"id":"added","strokes":"rest"}]},
      {"id":"hieut-circle-o","target":"ㅎ","operation":"place","parts":[{"id":"top","jamo":"ㅗ","at":{"strokes":["dot","h"]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":["ring"]}}]},
      {"id":"hieut-added-lines","target":"ㅎ","operation":"place","parts":[{"id":"cap","jamo":"ㆍ","at":{"strokes":["dot"]}},{"id":"bar","jamo":"ㅡ","at":{"strokes":["h"]}},{"id":"ring","jamo":"ㅇ","at":{"strokes":["ring"]}}]},
      {"id":"rieul-lines","target":"ㄹ","operation":"place","parts":[{"id":"h1","jamo":"ㅡ","at":{"segments":["hv.0"]}},{"id":"v1","jamo":"ㅣ","at":{"segments":["hv.1"]}},{"id":"h2","jamo":"ㅡ","at":{"segments":["h.0"]}},{"id":"v2","jamo":"ㅣ","at":{"segments":["vh.0"]}},{"id":"h3","jamo":"ㅡ","at":{"segments":["vh.1"]}}]},
      {"id":"pieup-lines","target":"ㅍ","operation":"place","parts":[{"id":"top","jamo":"ㅡ","at":{"strokes":["h1"]}},{"id":"left","jamo":"ㅣ","at":{"strokes":["v1"]}},{"id":"right","jamo":"ㅣ","at":{"strokes":["v2"]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":["h2"]}}]},
      {"id":"bieup-lines","target":"ㅂ","operation":"place","parts":[{"id":"left","jamo":"ㅣ","at":{"strokes":["v1"]}},{"id":"right","jamo":"ㅣ","at":{"strokes":["v2"]}},{"id":"middle","jamo":"ㅡ","at":{"strokes":["h1"]}},{"id":"bottom","jamo":"ㅡ","at":{"strokes":["h2"]}}]},
      {"id":"bieup-raised","target":"ㅂ","operation":"place","parts":[{"id":"lower","jamo":"ㅁ","at":{"box":[0,0.46,1,1]}},{"id":"leftExtension","jamo":"ㅣ","at":{"box":[0,0,0,0.46]}},{"id":"rightExtension","jamo":"ㅣ","at":{"box":[1,0,1,0.46]}}]}
    ],
    "defaults": {"ㄲ":"double-giyeok","ㄸ":"double-digeut","ㅃ":"double-bieup","ㅆ":"double-siot","ㅉ":"double-jieut","ㄳ":"final-giyeok-siot","ㄵ":"final-nieun-jieut","ㄶ":"final-nieun-hieut","ㄺ":"final-rieul-giyeok","ㄻ":"final-rieul-mieum","ㄼ":"final-rieul-bieup","ㄽ":"final-rieul-siot","ㄾ":"final-rieul-tieut","ㄿ":"final-rieul-pieup","ㅀ":"final-rieul-hieut","ㅄ":"final-bieup-siot","ㅐ":"vowel-ae","ㅒ":"vowel-yae","ㅔ":"vowel-e","ㅖ":"vowel-ye","ㅘ":"vowel-wa","ㅙ":"vowel-wae","ㅚ":"vowel-oe","ㅝ":"vowel-wo","ㅞ":"vowel-we","ㅟ":"vowel-wi","ㅢ":"vowel-ui","ㅋ":"kieuk-added","ㄷ":"digeut-added","ㅌ":"tieut-added","ㅈ":"jieut-added","ㅊ":"chieut-added","ㆆ":"yeorinhieut-added","ㅎ":"hieut-added-lines","ㄹ":"rieul-lines","ㅂ":"bieup-lines","ㅍ":"pieup-lines"},
    "history": {"ㅎ":"hieut-added"},
    "derivationOnly": {"ㅂ":"ㅁ에서 세로획을 위로 솟게 한 가획 — 획 하나로 떼어지지 않아 add 조립식이 없다. 기본은 선 조립식(place)","ㅍ":"ㅂ에서 온 가획 — 같은 까닭으로 add 조립식이 없다. 기본은 선 조립식(place)"},
    "dot": "ㆍ",
    "stages": {"origin8":["ㄱ","ㄴ","ㅁ","ㅅ","ㅇ","ㆍ","ㅡ","ㅣ"],"basic24":["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ","ㅏ","ㅑ","ㅓ","ㅕ","ㅗ","ㅛ","ㅜ","ㅠ","ㅡ","ㅣ"],"full40":["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ","ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"],"helperOnly":["ㆍ"]},
    "roles": {"initial":["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"],"medial":["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"],"final":["ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]},
    "modernShapes51": ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ","ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ","ㄳ","ㄵ","ㄶ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅄ"]
  };
  /* END GENERATED studio-recipe-catalog */

  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  deepFreeze(CATALOG);
  global.FontStudioRecipeCatalog = CATALOG;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = CATALOG;
  }
})(typeof window !== "undefined" ? window : globalThis);
