/* 소개 '8칸 만들기'에 싣는 AI 답 — 프롬프트 원문과, 그 프롬프트로 AI가 돌려준 HTML 답 원문.
 *
 * 답은 받은 그대로 둔다(고치지 않음). 소개 페이지는 답 HTML 안의 등록 코드(<script>)를 그대로 돌려 칸을 얻고
 * (FontKku.registerJamo를 가로채 이름만 바꾼다), 답이 정한 획 굵기(--fy-element-width)를 그대로 쓴다. 그래서 여기
 * 적힌 답과 화면의 글꼴이 갈리지 않는다. tests/landing_sets.test.js가 답마다 원형 8칸(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)을
 * 칸 계약(frame: "box")으로 등록하는지 확인한다.
 *
 * 기록: 모델·어디서·날짜·몇 번째 시도·고쳤는지. 새 답(다른 AI, 사람이 그린 세트)을 실을 때도 같은 칸을 채운다.
 * 2026-10-13 답 여섯은 모두 Claude Code 안의 Claude Opus 5.5가 이 저장소의 설명서(draw-jamo.md)를 읽고, 화면에 그려 보기 전에
 * 한 번에 쓴 것이다. 처음 셋은 같은 프롬프트(느낌 '굵은 마커')로 두 번, 느낌만 바꿔(붓펜) 한 번. 풍선·가는 펜 둘은 소개 페이지
 * 리뷰를 고치던 다른 대화에서 앞의 세 답을 본 뒤에 썼다. 풍선 첫 답은 획이 뭉쳐 읽기 어려웠고, 같은 대화에서 고쳐 달라는 부탁
 * (followup)에 한 번 더 답했다 — 두 답 모두 싣는다. ChatGPT·Claude.ai 대화창(링크만 줌)에서 받은 답은 아직 없다. */
(function () {
  "use strict";

  var GUIDE = "https://font.tty.link/lib/skill/SKILL.md";

  /* 프롬프트 — feel만 바꿔 쓴다. 소개 페이지의 'AI에게 맡길 문장 복사'도 이 글을 복사한다. */
  function prompt(feel) {
    return [
      "이 설명서를 읽고 따라 해 줘: " + GUIDE,
      "",
      "폰꾸로 세상에 없던 한글 글꼴을 하나 만들어 줘.",
      "느낌: " + feel,
      "",
      "- draw-jamo.md의 「세벌·고딕에 그림 세트 걸기」대로 원형 8칸 ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ만 SVG 경로로 그려 줘. 나머지 자모와 한글 11,172자는 폰꾸가 조립해.",
      "- FontKku.registerJamo(\"my-font\", { \"ㄱ\": { box, shapes }, … }, { frame: \"box\", cap: \"round\", join: \"round\" })로 등록하고, 획은 중심선 경로로.",
      "- 답은 HTML 한 장: 런타임 스크립트 한 줄, 등록 코드, '다람쥐 헌 쳇바퀴에 타고파'를 <font-kku font=\"sebul\" jamo-set=\"my-font\" size=\"64\">로 크게. 획 굵기는 --fy-element-width로."
    ].join("\n");
  }

  var MARKER = "굵은 마커로 삐뚤빼뚤하게 쓴 손글씨";
  var BRUSH = "붓펜으로 휘갈겨 쓴 글씨, 획 끝이 길게 빠지게";
  var BALLOON = "동글동글 부푼 풍선처럼 굵고 둥근 글씨";
  var PEN = "가는 펜으로 또박또박 쓴 단정한 글씨";

  var sets = [
    {
      id: "claude-marker-1",
      by: "Claude Opus 5.5",
      where: "Claude Code — 설명서를 읽고",
      date: "2026-10-13",
      attempt: "1번째 답",
      edited: false,
      feel: MARKER,
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>삐뚤 마커 — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #fffdf6; color: #1d1d1f; }',
        '  .marker { --fy-element-width: 0.13em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 원형 8칸만 그린다 — 나머지 자모(ㅋ·ㄷ·ㅂ·ㅎ·ㅏ·ㅗ·쌍자음·겹받침 …)는 폰꾸가 조립한다',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [10, 12, 88, 90], shapes: ["M10 17 C28 11 52 19 86 13 C89 38 84 64 72 90"] },',
        '    "ㄴ": { box: [12, 10, 90, 88], shapes: ["M15 10 C12 36 18 62 14 84 C38 90 66 80 90 86"] },',
        '    "ㅁ": { box: [12, 12, 88, 88], shapes: [',
        '      "M14 14 C12 40 17 62 13 88",',
        '      "M14 14 C38 9 62 18 86 12 C88 38 83 62 87 86",',
        '      "M13 88 C36 84 60 90 87 86"',
        '    ] },',
        '    "ㅅ": { box: [10, 10, 90, 90], shapes: ["M54 10 C48 38 36 66 10 90", "M47 48 C58 64 72 80 90 86"] },',
        '    "ㅇ": { box: [12, 12, 88, 88], shapes: ["M52 13 C76 9 90 30 88 52 C87 76 68 90 46 88 C24 86 11 68 13 46 C15 26 32 12 58 15"] },',
        '    "ㆍ": { box: [36, 42, 64, 58], shapes: ["M37 52 C44 42 58 46 63 52"] },',
        '    "ㅡ": { box: [6, 44, 94, 58], shapes: ["M6 54 C28 44 52 58 72 49 C80 46 88 50 94 47"] },',
        '    "ㅣ": { box: [42, 6, 58, 94], shapes: ["M52 6 C46 30 56 52 49 72 C46 82 50 90 48 94"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="marker" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    },
    {
      id: "claude-marker-2",
      by: "Claude Opus 5.5",
      where: "Claude Code — 같은 프롬프트로 다시",
      date: "2026-10-13",
      attempt: "2번째 답",
      edited: false,
      feel: MARKER,
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>꾸불 마커 — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #fff; color: #222; }',
        '  .wobble { --fy-element-width: 0.12em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 손이 떨린 듯 꾸불꾸불한 마커 — 원형 8칸, 나머지는 조립',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [8, 10, 90, 92], shapes: ["M8 20 C24 8 46 22 70 12 C78 9 86 12 88 16 C84 44 90 70 70 92"] },',
        '    "ㄴ": { box: [10, 8, 92, 90], shapes: ["M18 8 C10 30 20 58 12 82 C10 90 30 86 46 88 C62 90 78 80 92 84"] },',
        '    "ㅁ": { box: [10, 10, 90, 90], shapes: [',
        '      "M16 14 C10 36 18 66 12 90",',
        '      "M16 12 C40 16 60 6 84 14 C92 34 82 60 90 88",',
        '      "M12 90 C34 82 64 94 90 86"',
        '    ] },',
        '    "ㅅ": { box: [8, 8, 92, 92], shapes: ["M50 8 C52 32 38 64 8 88", "M44 44 C54 70 76 78 92 92"] },',
        '    "ㅇ": { box: [10, 10, 90, 90], shapes: ["M48 10 C70 8 92 26 90 50 C88 80 62 92 40 88 C18 84 8 60 14 40 C20 20 40 10 60 16"] },',
        '    "ㆍ": { box: [34, 40, 66, 60], shapes: ["M36 50 C40 40 60 40 64 50 C60 60 42 60 36 50"] },',
        '    "ㅡ": { box: [4, 42, 96, 60], shapes: ["M4 50 C20 60 34 40 50 50 C66 60 80 42 96 52"] },',
        '    "ㅣ": { box: [40, 4, 60, 96], shapes: ["M48 4 C58 24 40 40 50 56 C60 72 42 84 52 96"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="wobble" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    },
    {
      id: "claude-brush-1",
      by: "Claude Opus 5.5",
      where: "Claude Code — 느낌만 바꿔서",
      date: "2026-10-13",
      attempt: "1번째 답",
      edited: false,
      feel: BRUSH,
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>휘갈긴 붓펜 — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #f7f3ea; color: #111; }',
        '  .brushpen { --fy-element-width: 0.09em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 붓펜으로 빠르게 — 획 끝을 길게 뺀다. 원형 8칸만, 나머지는 조립',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [6, 10, 92, 94], shapes: ["M6 22 C30 12 60 10 88 14 C92 15 92 18 90 22 C80 50 60 76 30 94"] },',
        '    "ㄴ": { box: [8, 6, 94, 90], shapes: ["M20 6 C18 30 14 56 16 74 C18 88 40 86 60 82 C74 79 86 78 94 70"] },',
        '    "ㅁ": { box: [10, 10, 92, 90], shapes: [',
        '      "M14 16 C14 40 16 64 18 86",',
        '      "M14 14 C40 10 66 10 86 14 C90 40 88 64 84 84",',
        '      "M18 86 C40 84 64 84 92 88"',
        '    ] },',
        '    "ㅅ": { box: [6, 6, 94, 94], shapes: ["M56 6 C54 30 40 62 6 90", "M40 50 C56 64 76 76 94 94"] },',
        '    "ㅇ": { box: [10, 10, 90, 90], shapes: ["M58 12 C34 6 12 26 12 50 C12 76 34 90 54 88 C78 86 90 64 86 40 C83 24 70 12 50 14"] },',
        '    "ㆍ": { box: [36, 38, 64, 62], shapes: ["M38 40 C48 44 58 52 62 60"] },',
        '    "ㅡ": { box: [4, 40, 96, 62], shapes: ["M4 56 C30 46 60 42 86 44 C92 45 96 50 92 54"] },',
        '    "ㅣ": { box: [40, 4, 62, 96], shapes: ["M54 4 C52 32 50 60 50 84 C50 92 46 96 42 94"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="brushpen" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    },
    {
      id: "claude-balloon-1",
      by: "Claude Opus 5.5",
      where: "Claude Code — 앞의 세 답을 본 뒤, 다른 대화에서",
      date: "2026-10-13",
      attempt: "1번째 답",
      edited: false,
      feel: BALLOON,
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>풍선 — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #fff7fb; color: #2a1a3a; }',
        '  .balloon { --fy-element-width: 0.18em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 풍선처럼 부푼 글씨 — 모서리를 모두 둥글리고 획을 아주 굵게. 원형 8칸만, 나머지는 조립',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [14, 18, 86, 88], shapes: ["M14 18 H60 Q86 18 86 44 V88"] },',
        '    "ㄴ": { box: [14, 12, 86, 84], shapes: ["M14 12 V58 Q14 84 40 84 H86"] },',
        '    "ㅁ": { box: [14, 14, 86, 86], shapes: ["M38 14 H62 Q86 14 86 38 V62 Q86 86 62 86 H38 Q14 86 14 62 V38 Q14 14 38 14 Z"] },',
        '    "ㅅ": { box: [12, 12, 88, 86], shapes: ["M50 12 C48 50 36 72 12 86", "M50 12 C52 50 64 72 88 86"] },',
        '    "ㅇ": { box: [10, 14, 90, 86], shapes: [{ ellipse: [50, 50, 40, 36] }] },',
        '    "ㆍ": { box: [38, 46, 62, 54], shapes: ["M38 50 H62"] },',
        '    "ㅡ": { box: [8, 46, 92, 54], shapes: ["M8 52 Q50 44 92 52"] },',
        '    "ㅣ": { box: [46, 8, 54, 92], shapes: ["M50 8 Q54 50 50 92"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="balloon" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    },
    {
      id: "claude-balloon-2",
      by: "Claude Opus 5.5",
      where: "Claude Code — 같은 대화에서 말로 고쳐 달라고 한 번 더",
      date: "2026-10-13",
      attempt: "2번째 답(고쳐 달라는 부탁에)",
      edited: false,
      feel: BALLOON,
      followup: "획이 뭉쳐서 '다'가 '디'처럼 보여. 굵기를 조금 줄이고 ㅏ·ㅗ의 짧은 획(ㆍ)을 더 길게 해 줘.",
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>풍선 (고친 판) — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #fff7fb; color: #2a1a3a; }',
        '  .balloon { --fy-element-width: 0.15em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 고친 판 — 굵기 0.18em → 0.15em, 짧은 획 ㆍ를 두 배 가까이 길게, ㅁ·ㅇ 속을 조금 더 넓게',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [14, 18, 86, 88], shapes: ["M14 18 H60 Q86 18 86 44 V88"] },',
        '    "ㄴ": { box: [14, 12, 86, 84], shapes: ["M14 12 V58 Q14 84 40 84 H86"] },',
        '    "ㅁ": { box: [12, 12, 88, 88], shapes: ["M36 12 H64 Q88 12 88 36 V64 Q88 88 64 88 H36 Q12 88 12 64 V36 Q12 12 36 12 Z"] },',
        '    "ㅅ": { box: [12, 12, 88, 86], shapes: ["M50 12 C48 50 36 72 12 86", "M50 12 C52 50 64 72 88 86"] },',
        '    "ㅇ": { box: [8, 12, 92, 88], shapes: [{ ellipse: [50, 50, 42, 38] }] },',
        '    "ㆍ": { box: [26, 46, 74, 54], shapes: ["M26 50 H74"] },',
        '    "ㅡ": { box: [8, 46, 92, 54], shapes: ["M8 52 Q50 44 92 52"] },',
        '    "ㅣ": { box: [46, 8, 54, 92], shapes: ["M50 8 Q54 50 50 92"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="balloon" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    },
    {
      id: "claude-pen-1",
      by: "Claude Opus 5.5",
      where: "Claude Code — 앞의 세 답을 본 뒤, 다른 대화에서",
      date: "2026-10-13",
      attempt: "1번째 답",
      edited: false,
      feel: PEN,
      answer: [
        '<!doctype html>',
        '<html lang="ko">',
        '<head>',
        '<meta charset="utf-8">',
        '<title>가는 펜 — 폰꾸 그림 세트</title>',
        '<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>',
        '<style>',
        '  body { margin: 0; padding: 48px 24px; background: #fbfaf7; color: #1b2a44; }',
        '  .fine-pen { --fy-element-width: 0.05em; }',
        '</style>',
        '</head>',
        '<body>',
        '<script>',
        '  // 가는 펜으로 또박또박 — 획은 거의 곧게, 끝만 살짝 흐르게. 원형 8칸만, 나머지는 조립',
        '  FontKku.registerJamo("my-font", {',
        '    "ㄱ": { box: [12, 13, 86, 90], shapes: ["M12 16 C40 14 64 13 86 14 C84 40 80 66 72 90"] },',
        '    "ㄴ": { box: [15, 10, 90, 86], shapes: ["M16 10 C15 40 15 64 16 86 C40 86 66 85 90 84"] },',
        '    "ㅁ": { box: [15, 13, 85, 86], shapes: [',
        '      "M16 14 C15 40 16 64 16 86",',
        '      "M16 14 C40 13 64 13 84 14 C85 40 85 64 84 86",',
        '      "M16 86 C40 86 62 86 84 86"',
        '    ] },',
        '    "ㅅ": { box: [10, 10, 90, 90], shapes: ["M52 10 C46 40 32 68 10 90", "M48 46 C58 66 72 80 90 88"] },',
        '    "ㅇ": { box: [13, 13, 87, 87], shapes: [{ ellipse: [50, 50, 37, 37] }] },',
        '    "ㆍ": { box: [40, 47, 60, 53], shapes: ["M40 51 C46 49 54 49 60 50"] },',
        '    "ㅡ": { box: [6, 47, 94, 53], shapes: ["M6 51 C34 49 66 49 94 50"] },',
        '    "ㅣ": { box: [47, 6, 53, 94], shapes: ["M50 6 C51 34 51 66 50 94"] }',
        '  }, { frame: "box", cap: "round", join: "round" });',
        '</script>',
        '<h1><font-kku class="fine-pen" font="sebul" jamo-set="my-font" size="64">다람쥐 헌 쳇바퀴에 타고파</font-kku></h1>',
        '</body>',
        '</html>'
      ].join("\n")
    }
  ];

  /* 답 HTML의 등록 코드를 그대로 돌려 칸을 얻는다 — registerJamo를 가로채 받은 인자를 돌려준다(그리지 않는다).
   * 굵기는 답의 <style>이 정한 --fy-element-width. */
  function read(set) {
    var scripts = [];
    set.answer.replace(/<script>([\s\S]*?)<\/script>/g, function (match, body) {
      scripts.push(body);
      return match;
    });
    var captured = null;
    var stub = {
      registerJamo: function (name, cells, options) {
        captured = { name: name, cells: cells, options: options || {} };
        return { name: name, cells: Object.keys(cells).length };
      }
    };
    scripts.forEach(function (body) {
      /* eslint-disable-next-line no-new-func */
      new Function("FontKku", body)(stub);
    });
    var width = /--fy-element-width:\s*([0-9.]+em)/.exec(set.answer);
    return captured ? { cells: captured.cells, options: captured.options, width: width ? width[1] : "" } : null;
  }

  function byId(id) {
    for (var i = 0; i < sets.length; i += 1) {
      if (sets[i].id === id) {
        return sets[i];
      }
    }
    return null;
  }

  var api = { GUIDE: GUIDE, MARKER: MARKER, BRUSH: BRUSH, BALLOON: BALLOON, PEN: PEN, prompt: prompt, sets: sets, read: read, byId: byId };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.FontKkuLandingSets = api;
    /* 런타임 바로 뒤에 실리므로 지금 등록한다 — 이 세트를 쓰는 바탕 요소가 처음부터 그 그림으로 그려진다 */
    if (window.FontKku && typeof window.FontKku.registerJamo === "function") {
      sets.forEach(function (set) {
        var answer = read(set);
        if (answer) {
          window.FontKku.registerJamo(set.id, answer.cells, answer.options);
        }
      });
    }
  }
})();
