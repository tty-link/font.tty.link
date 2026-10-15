# 그림 자소 글꼴 — 자모를 SVG로 직접 그리기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

기기 글꼴이 아니라 **직접 그린 자모 그림**으로 한글을 조립한다. 배치는 기본 제공 그림 자소 글꼴 `sprite-system`의 것을 그대로 쓰고 **그림만 바꾼다**. 붓·손글씨·둥근 느낌이면 먼저 기본 제공 `butgeul`(붓)·`pilgi`(필기)·`dunggeun`(둥근)을 써 본다 — 셋 다 `color`로 먹색이 바뀌고 꾸밈(`kku-look-*`)도 걸린다([compose.md](https://font.tty.link/lib/skill/compose.md)). 직접 그리는 길은 셋이다.

- **코드로 그리기(권장)** — 자모마다 SVG 경로를 `FontKku.registerJamo`로 등록한다. HTML 한 장 안에서 끝나고, 자모마다 색·굵기를 CSS로 바꿀 수 있고, 자리가 눌려도 획 굵기가 그대로다.
- **SVG 자소판 파일** — 자모 전체를 SVG 한 장에 그려 `--fy-sprite-url`로 끼운다. 질감 필터(인주·분필 같은)를 쓰려면 이 길이다.
- **세벌·고딕에 그림 세트 걸기(가장 적게 그린다)** — 세벌식(글꼴을 비운 기본)·`jikgyeol`·`sebul`·`gothic`의 배치는 그대로 두고 자모 그림만 바꾼다. 원소 그림 3개, 원형 8자, 자모 24자, 40자 가운데 원하는 만큼 그리면 나머지는 런타임이 조립한다 — 아래 「세벌·고딕에 그림 세트 걸기」. 브라우저에서 그리려면 글꼴 작업실(아래 「글꼴 작업실에서」).

## 칸 — 어디에 그리나

- 칸 키는 `r<행>-<호환 자모>`, 칸 하나는 100×100 좌표다.
- 행: 0 초성(세로 모음 옆 — 가·거의 ㄱ), 1 중성(합자 모음은 통짜), 2 받침, 3 겹받침, 4 초성(가로 모음 위 — 고·그의 ㄱ), 5 합자 모음(키 큰 초성 옆 — 와·위의 ㅘ).
- 자모: 자음 `ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ`, 모음 `ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ`, 겹받침 `ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ`(3행). 받침 행에 ㄸ·ㅃ·ㅉ는 없고, 5행은 합자 모음만 있다.
- **칸은 음절 상자를 그대로 줄인 것이다.** 자모를 칸 가운데가 아니라 음절 안 제자리에 그린다. 칸마다 그릴 자리(잉크 상자 `[x0, y0, x1, y1]`, 두 짝 자음·겹받침·합자 모음은 짝 상자 `parts`)는 `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/spec/sprite-layout.json`의 `layouts.system`에 있다. 대표값:

| 칸 | 자리 상자 | 뜻 |
|---|---|---|
| `r0-ㄱ` | `[4.7, 8.6, 48.4, 68.8]` | 초성은 왼쪽 위 절반 |
| `r1-ㅏ` | `[63.3, 0, 85.2, 86.7]` | 세로 모음은 오른쪽, 위아래로 길게 |
| `r1-ㅗ` | `[3.9, 35.9, 82.8, 74.2]` | 가로 모음은 가운데 아래, 넓게 |
| `r2-ㄱ` | `[13.3, 57.8, 72.7, 86.7]` | 받침은 아래, 넓고 납작하게 |
| `r4-ㄱ` | `[11.7, 9.4, 71.1, 60.2]` | 가로 모음 위 초성은 위쪽, 넓게 |

- 칸 경계에서 2만큼 안쪽에만 그린다. 굵기는 칸 100 기준 6–9가 읽기 좋다.
- 본보기 획: `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/profiles/sprite-system.jamo.js` (칸 하나가 한 줄)

## 코드로 그리기 (권장)

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sprite-system"></script>
<script>
  FontKku.registerJamo("brush", {
    "r0-ㄱ": "M5 12 H45 V28 Q45 54 11 65",          // 경로 문자열 = 획 중심선
    "r1-ㅏ": ["M67 2 V86", "M67 39 H85"],           // 여러 획은 배열
    "r2-ㅇ": [{ ellipse: [43, 70, 27, 12] }],       // 타원
    "r0-ㅇ": [{ d: "M27 12 C5 12 5 66 27 66 C49 66 49 12 27 12 Z", fill: true }]  // 채운 모양(그림·캐릭터)
    // … 나머지 칸도 같은 방식
  }, { stroke: 8, cap: "round", join: "round" });  // 굵기(칸 단위)·끝 모양·꺾임
</script>
<h1><font-kku font="sprite-system" jamo-set="brush" size="72">붓으로 쓴 제목</font-kku></h1>
<style>
  /* 자모마다 색·굵기 — 기기 글꼴과 같은 part 선택자 */
  h1 [part~="choseong"] { color: #1b1b1b; }
  h1 [part~="jungseong"] { color: #b91c1c; --fy-vector-stroke: 0.06em; }
</style>
```

- 일부 칸만 등록해도 된다. 등록된 칸만 SVG로 바뀌고 나머지는 기반 자소판을 쓴다. 빈 세트·빈 도형 배열은 거부한다. CSS의 `--fy-sprite-row`를 바꿨다면 `FontKku.refreshAll(host)`로 해당 SVG를 갱신한다.
- 경로는 SVG 경로 명령(`M L H V C Q Z` …)과 숫자만 쓴다. 마크업(`<path …>`)은 받지 않는다.
- 획 색은 글자 색(`color`)이다. 굵기는 `--fy-vector-stroke`(예: `0.06em`)로, 끝 모양·점선은 `[part="vector"] { stroke-linecap: round; stroke-dasharray: 0 10; }`처럼 일반 SVG CSS로 바꾼다.
- 기본 획을 고쳐 쓰려면 스크립트에 `data-jamo-sets="sprite-system"`을 더해 기본 세트를 불러 `jamo-set="sprite-system"`으로 그리거나, 그 파일을 본떠 새 이름으로 등록한다.

## 세벌·고딕에 그림 세트 걸기 — 적게 그리고 조립하기

세벌·고딕 계열(글꼴을 비운 세벌식, `sebul`·`gothic`과 파생)에 **칸 계약 세트**(`frame: "box"`)를 `jamo-set`으로 걸면 자모를 그 그림으로 그린다. 자리는 배치(세벌식·직결식 도장이나 글꼴 CSS)가 정하므로 그림은 **글자 모양만** 담는다.

- 칸 값은 `{ box: [x0, y0, x1, y1], shapes: [...] }` — `box`는 그 그림의 **획 중심선이 닿는 범위**(칸 좌표 0–100)다. 런타임이 이 범위를 자모의 표준 자리에 맞춘다. 범위를 밝히지 않으면 칸 전체 `[0, 0, 100, 100]`이다.
- 키: 호환 자모 `ㄱ`…`ㅣ`(문맥 변형 `ㄱ@cho` 세로 모음 옆 초성·`ㄱ@bar` 가로 모음 위 초성·`ㄱ@jong` 받침), 원소 그림 `@line`(획 하나 — 가로가 길이, 세로가 굵기)·`@dot`(짧은 획)·`@ring`(고리).
- 획은 중심선 경로로 그린다(굵기는 페이지 CSS `--fy-element-width`, 글꼴 기본 sebul 0.1em). 채운 도형은 `{ d, fill: true }`.
- 채운 도형은 그림 범위와 함께 늘어난다 — 받침처럼 표준 자리보다 납작하게 그린 칸은 화면에서 세로로 늘어 가로획이 굵어진다. 굵기를 고르게 하려면 획(중심선)으로 그리거나, 범위를 그 자모의 표준 자리 비율에 가깝게 그린다(기본 제공 `butgeul-box`는 생성기가 늘어날 비만큼 붓을 미리 누른다).

그리지 않은 자모는 런타임이 이 차례로 만든다 — 그래서 **그린 만큼이 깊이**다.

| 그릴 것 | 개수 | 나머지 |
|---|---|---|
| 원소 그림 `@line` `@dot` `@ring` | 3 | 모든 자모를 획 하나씩 조립 |
| 원형 8 — 기본자 `ㄱ ㄴ ㅁ ㅅ ㅇ` + 천지인 `ㆍ ㅡ ㅣ` (+ 원소 그림) | 8 | 가획(ㅋ = ㄱ + 획, ㅌ = ㄷ + 획), ㅎ = ㆍ + ㅡ + ㅇ, 이체 ㄹ과 ㅂ·ㅍ은 ㅡ·ㅣ 선, 천지인(ㅏ = ㅣ + 점) |
| 자음 14 `ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ` + 모음 10 `ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ` | 24 | 쌍자음(ㄲ = ㄱ + ㄱ), 이중모음(ㅐ = ㅏ + ㅣ, ㅘ = ㅗ + ㅏ), 겹받침(ㄺ = ㄹ + ㄱ) |
| 자음 19 + 모음 21 | 40 | 겹받침만 |

그림이 맡지 않은 획(ㅋ의 더한 획, ㅏ·ㅗ의 점)은 원소 그림 `@line`·`@dot`·`@ring`으로 긋고, 그 그림이 없으면 세트의 `ㅡ`(돌려서)·`ㆍ`·`ㅇ`으로 긋는다 — 원형 8만 그려도 CSS 상자 없이 한 손으로 보인다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul"></script>
<script>
  FontKku.registerJamo("my-hand", {
    "@line": { box: [10, 45, 90, 55], shapes: ["M10 50 C30 46 70 54 90 50"] },
    "@dot":  { box: [38, 45, 62, 55], shapes: ["M38 50 H62"] },
    "@ring": { box: [10, 10, 90, 90], shapes: [{ ellipse: [50, 50, 40, 40] }] },
    "ㅇ":    { box: [10, 10, 90, 90], shapes: [{ ellipse: [50, 50, 40, 38] }] }
  }, { frame: "box", cap: "round", join: "round" });
</script>
<font-kku jamo-set="my-hand" size="64">한글 손글씨</font-kku>   <!-- 세벌식 -->
<font-kku font="sebul" jamo-set="my-hand" size="64">한글 손글씨</font-kku>   <!-- 세벌 문맥 -->
```

- 기본 제공 세트: `pilgi-box`(필기)·`dunggeun-box`(둥근)·`butgeul-box`(붓) — `<font-kku jamo-set="butgeul-box">`. 스크립트 주소 옆 `profiles/<이름>.jamo.js`에서 받는다.
- 같은 세트를 덜 그린 셈 치고 보기(미리보기): `FontKku.registerDesign("o8", FontKku.stagePreview("dunggeun-box", "origin8"))` 뒤 `--fy-design: o8`(단계 `full40`·`basic24`·`origin8`·`elements`). 돌려받는 디자인에는 `layout`이 없어 문맥 배치로 그린다 — 세벌식으로 보려면 `{ ...FontKku.stagePreview("dunggeun-box", "origin8"), version: "1.2", layout: { profile: "sebul-cases-v1", revision: "1" } }`를 등록한다. 직접 쓰려면 디자인 소스에 보이는 칸 `cells`를 준다. 세트가 단계마다 무엇을 그렸는지는 `FontKku.authoringProgress("dunggeun-box")`(ㆍ는 보조 원본으로 따로). 아래 디자인 절.
- 그림 없이도 된다: 세벌식·`sebul`·`gothic`은 기본으로 획을 CSS 상자로 그린다(원소 재료 — 받을 파일 0, 어느 기기에서나 같은 모양). 굵기 `--fy-element-width`, 끝 `--fy-element-cap: round`. 기기 한글 글꼴로 그리려면 `--fy-face: device`.

## 디자인 — 그림 세트·글꼴을 섞고, 있는 그림도 조립하기 (실험)

자모마다 무엇으로 그리고(원소 획·그림 세트·글꼴), 그림이 있어도 조립할지, 어떤 배치로 찍을지를 디자인으로 정한다. 0.1.1부터 있는 **실험 API**다 — 이름과 형식이 바뀔 수 있으니 결과를 낼 때 "실험 기능"이라고 밝힌다. 디자인은 JSON으로 등록하고 CSS가 이름만 고른다(`--fy-design: <이름>`).

```html
<script>
  FontKku.registerDesign("mix", {
    version: "1.2",
    layout: { profile: "sebul-cases-v1", revision: "1" },   // 세벌식으로 찍는다
    mode: "svg",
    sources: { hand: { kind: "svg", assetSet: "pilgi-box" }, round: { kind: "svg", assetSet: "dunggeun-box" } },
    defaults: { source: "hand", method: "auto" },
    roleSources: { final: "round" },
    rules: [
      // ㅃ는 그림이 있어도 ㅂ + ㅂ으로, 오른쪽 ㅂ만 둥근 세트로
      { id: "ppa", match: { jamo: "ㅃ" },
        apply: { method: "compose", recipe: "double-bieup", bindings: { right: { source: "round" } } } }
    ]
  });
</script>
<font-kku style="--fy-design: mix" size="64">뿌리 깊은 나무</font-kku>
```

- `mode`와 소스: `"primitive"`(원소 획, 소스 `{ kind: "primitive" }`) · `"svg"`(그림 세트, `{ kind: "svg", assetSet: "pilgi-box" }` — 등록한 `frame: "box"` 세트 이름도 된다) · `"font"`(글꼴 팔레트, `{ kind: "font", family: "Nanum Myeongjo", weight: 700 }` — 페이지가 `@font-face`나 설치 글꼴로 미리 실어 둔다. 폰꾸는 글꼴 파일을 받지 않는다). 소스마다 이름을 붙이고 `defaults.source`(기본)·`roleSources`(`initial`·`medial`·`final`·`standalone` 역할마다)·규칙이 이름으로 고른다.
- 배치: `version: "1.2"`와 `layout`을 적으면 그 배치로 찍는다 — `sebul-cases-v1`(세벌식, 기본), `sebul-fixed-v1`(직결식) 또는 `square-context-v1`(네모 문맥, 글꼴 CSS의 짜임별 자리). revision은 `FontKku.layoutProfiles[프로파일].revision`(지금 세벌식 `"1"`, 직결식 `"3"`)이다. `layout`을 적지 않은 디자인은 글꼴을 비운 바탕 요소에서도 문맥 배치로 그린다.
- 고정 배치(세벌식·직결식) 디자인은 자모·역할로만 고른다(짜임은 배치가 맡는다). 짜임에 따른 규칙(`match.vowelLayout`·`match.hasFinal` — `DESIGN_FIXED_CONTEXT`), 합자 모음(ㅘ·ㅝ·ㅢ …)을 통째로 그리라는 `method: "direct"`(`DESIGN_FIXED_COMPOUND` — 합자 모음은 조각 둘로 찍는다), 자리마다 다른 변주(`DESIGN_FIXED_VARIATION`)는 등록이 거부된다.
- `method`: `auto`(그림 → 조립 → 원소, 기본) · `direct`(그 그림만, 없으면 `fallback.sourceIds`의 같은 자모까지) · `compose`(그림이 있어도 `recipe`로 조립).
- 조립식 id와 조각 이름은 `spec/jamo-recipes.json`: 쌍자음 `double-*`(left·right), 겹받침 `final-*`, 이중모음 `vowel-*`(left·right 또는 horizontal·vertical), 가획 `*-added`, 선 조립식 — `hieut-added-lines`(ㅎ = ㆍ + ㅡ + ㅇ, cap·bar·ring), `rieul-lines`(ㄹ을 ㅡ·ㅣ 다섯으로, h1·v1·h2·v2·h3), `bieup-lines`·`pieup-lines`(ㅂ·ㅍ을 ㅡ·ㅣ로, left·right·middle·bottom / top·left·right·bottom). 이 넷은 ㅎ·ㄹ·ㅂ·ㅍ의 기본인데 그림 세트·글꼴처럼 그릴 재료가 있을 때만 쓴다(원소 재료는 획 그대로). 대안은 규칙으로만 고른다 — `hieut-circle-o`(ㅎ = ㅗ 모양 윗부분 + ㅇ, top·ring), `bieup-raised`(ㅂ = ㅁ + 위로 늘인 ㅣㅣ, lower·leftExtension·rightExtension), `hieut-added`(ㅎ = ㆆ 그림 + 점 — 제자 계통, ㆆ을 그린 세트에서). 점(ㆍ)은 세트에 칸이 없으면 `@dot`으로 그린다.
- 규칙은 `match: { jamo, role: "initial"|"medial"|"final"|"standalone", vowelLayout: "right"|"bottom"|"split-right", hasFinal }`로 좁힌다. `vowelLayout`·`hasFinal`은 `role`과 함께 쓰고(없으면 `DESIGN_RULE_MATCH`) 고정 배치 디자인에서는 쓰지 못한다. 더 구체적인 규칙이 이기고, 같은 구체성으로 다르게 고르면 등록이 실패한다.
- 고른 결과는 `FontKku.traceOf(host)`(조각마다 소스·규칙·status), 미리 보기는 `FontKku.planJamo("ㅃ", { design: "mix" })`.
- 등록 전에 검사: `FontKku.validateDesign(json)` → `{ ok, errors: [{ code, path, message }] }` — 틀린 곳을 모두 돌려주고 던지지 않는다(예: `DESIGN_SOURCE_UNKNOWN` `defaults.source`). `registerDesign`은 그 첫 오류를 던진다(`error.code`·`error.path`). 디자인 JSON을 만들어 줄 때는 `validateDesign`의 `ok`를 먼저 본다.
- 고친 디자인을 같은 이름에 다시 걸기: `FontKku.registerDesign("mix", json, { replace: true })` — 그 이름을 쓰는 글자가 다시 그려진다. `replace` 없이 다른 내용을 같은 이름에 등록하면 `DESIGN_NAME_TAKEN`. 지우기는 `FontKku.unregisterDesign("mix")`(그 이름을 쓰던 글자는 `DESIGN_NOT_REGISTERED`가 된다), 등록된 이름 목록은 `FontKku.designs()`.
- 이름은 소문자·숫자·`-`만 쓰고 `-`로 시작하지 않는다(대문자는 소문자로 바뀐다 — `Mix`는 `mix`와 같은 이름). `legacy`·`none`과 CSS 전역 키워드(`inherit` 등)는 이름이 될 수 없다(`DESIGN_NAME_INVALID`).
- `--fy-design: legacy`는 위에서 물려받은 디자인을 끊는다. 고르지 못하면 지금 설정으로 그리고 `data-fy-design-status`(= `FontKku.fontInfo(host).designStatus`)로 알린다: `DESIGN_NOT_REGISTERED`(등록하지 않은 이름 — 등록하면 다시 그린다), `DESIGN_TOKEN_INVALID`(이름 문법), `DESIGN_UNSUPPORTED_FONT`(디자인을 받지 않는 글꼴 — 그림 자소 글꼴 `pixel`·`sprite-*`·`butgeul`·`pilgi`·`dunggeun` 등과 표준 잉크 상자가 없는 글꼴. 디자인은 `sebul`·`gothic`·`malang`·꾸러미 글꼴이나 `font`를 밝히지 않은 `<font-kku>`에 건다).

글꼴 팔레트 — 기본은 한 글꼴, 모음만 다른 글꼴로:

```html
<script>
  FontKku.registerDesign("palette", {
    version: "1.2",
    layout: { profile: "sebul-cases-v1", revision: "1" },
    mode: "font",
    sources: { A: { kind: "font", family: "Nanum Myeongjo" }, B: { kind: "font", family: "Pretendard", weight: 700 } },
    defaults: { source: "A" },
    roleSources: { medial: "B" }
  });
</script>
<font-kku style="--fy-design: palette" size="64">뿌리 깊은 나무</font-kku>
```

## 글꼴 작업실에서 — 그리고, 섞고, 디자인 JSON 가져가기

사람이 브라우저에서 직접 만들 때는 글꼴 작업실 `https://font.tty.link/font-studio.html`을 알려 준다. 첫 화면의 **디자인** 칸이 세벌식 기본 디자인으로 열린다.

- 시작 선택지 셋: **선·원으로 만들기**(원소 획) · **직접 그려 만들기**(그림 세트 — 기본 제공 세트에서 시작하거나 **그리기 8 → 24 → 40**으로 원형 8자부터 칸 편집기에 그린다, SVG 가져오기와 AI에 줄 요청 글 복사가 있다) · **기존 글꼴로 만들기**(글꼴 팔레트 — 역할·자모마다 글꼴을 고르고 씨앗으로 섞는다).
- 미리보기에서 자모를 고르면 조립식 후보를 나란히 비교하고(조립식·binding), 그 자모가 무엇으로 어디서 그려졌는지(출처) 답한다. 조합으로 그려진 자모는 "독립 SVG로" 떼어 고칠 수 있다.
- 고급 — 배치(세벌식·직결식·네모 문맥)·문맥 규칙·디자인 JSON 편집. 편집 기록(되돌리기·다시)과 바꾸기 전 영향 확인이 있다.
- 가져가기: **디자인 JSON 저장·복사**, **페이지용 코드 복사**(`registerDesign` + `--fy-design` 한 덩어리), **묶음**(`<이름>.fkk-bundle.json` — 디자인과 직접 그린 그림을 한 파일로, 그림 세트는 `.jamo.js`로도 내보낸다).
- AI가 할 일: 사용자가 작업실에서 복사한 페이지용 코드나 디자인 JSON을 받으면 런타임 `<script>`(위 주소) 뒤에 넣고 `validateDesign`으로 검사한다. 직접 그린 세트(`studio-draw-…`)를 쓰는 디자인은 묶음 칸의 페이지용 코드(그림 세트 줄이 함께 든다)나 내보낸 `.jamo.js`를 함께 싣는다. 코드에 `profiles/<세트>.jamo.js` 줄이 있으면 기본 제공 세트다 — 런타임이 필요할 때 받으므로 지우거나, 남기려면 `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/profiles/<세트>.jamo.js`로 바꾼다.

## 획 깊이 — 자모를 획으로

`stroke-depth="stroke"`를 더하면 벡터 자소의 획마다 `part="hoek"` 노드가 된다(하 = 꼭지·가로·동그라미 + 세로·점).

- 획에는 획순 차례(`data-hoek`, `--fy-hoek-order`)와 종류(`data-hoek-kind`: `h` `v` `hv` `vh` `lf` `rf` `dot` `ring`), 제자원리 역할(`data-hoek-role`: 기본자 `base`·가획 `added`·이체 `variant`·천 `heaven`·지 `earth`·인 `person`)이 붙는다.
- 획만 옮기려면 `--fy-hoek-dx`·`--fy-hoek-dy`(칸 0–100 단위)·`--fy-hoek-rotate`.
- 획순대로 긋는 움직임은 `animate="draw"`(`data-addons="motion"`, 속성으로 주면 획 깊이도 저절로 켜진다), 획마다 흔들리는 변주는 `class="kku-vary-hoek"`.
- 직접 등록한 세트는 칸 도형을 획순대로 그리고 `registerJamo(…, { hoek: true })`로 알려야 종류·역할이 붙는다(획순 정본: `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/spec/strokes.json`).
- 기본 원소 획(글꼴을 비운 세벌식, `sebul`·`gothic`)은 `stroke-depth` 없이도 획마다 `part="hoek"` 노드이고 같은 `data-hoek-role`·`data-hoek-kind`가 붙는다 — 아래 예의 가획 칠하기는 `<font-kku class="edu">ㄱㅋ ㄴㄷㅌ</font-kku>`에서도 된다. 다만 `draw`는 자모 단위로 나타난다.
- 기기 글꼴·자소판은 쪼갤 수 없어 자모 단위로 그린다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sprite-system" data-jamo-sets="sprite-system"></script>
<style>.edu [data-hoek-role="added"] { color: #e63946; }</style>  <!-- 가획만 빨갛게 -->
<font-kku class="edu" font="sprite-system" jamo-set="sprite-system" stroke-depth="stroke">ㄱㅋ ㄴㄷㅌ</font-kku>
```

## SVG 자소판 파일

- `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2100 600" width="2688" height="768">` — 21열 × 6행. 칸마다 `<g id="r행-자모" transform="translate(열×100 행×100)">` 안에 칸 기준 0–100 좌표로 그린다(열 = 위 자모 순서의 번호).
- 굵기·색·질감은 `<style>`과 `<filter>`로 준다. 본보기: `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/profiles/sprite-system.svg`(획), 같은 폴더의 `dojang.svg`(인주 필터), `pixel.svg`(도트).
- 질감 필터는 **칸마다** 건다: `<filter id="t" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">`를 두고 칸 안쪽을 `<g id="r0-ㄱ" transform="translate(0 0)"><g filter="url(#t)">…</g></g>`로 싼다. 자소판 전체를 감싼 그룹 하나에 걸면 Safari·iPhone(WebKit)이 큰 글자에서 그 그룹을 통째로 그리지 않고(필터 영역이 버퍼 한계를 넘는다), 작아도 첫 그리기에 수십 초 멈춘다.
- 도트처럼 화소에 맞출 그림은 `shape-rendering: crispEdges`를 `<style>` 안 `@media (min-width: 840px) { … }`에 둔다(자소판이 칸 40px 이상으로 그려질 때만). 작은 글자에서 화소에 맞추면 한 화소보다 작은 도트 줄이 통째로 빠진다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sprite-system"></script>
<style>
  .kku-brush { --fy-sprite-url: url("./kku-brush.svg"); --fy-sprite-filter: none; }
</style>
<h1><font-kku font="sprite-system" class="kku-brush" size="72">붓으로 쓴 제목</font-kku></h1>
```

- `--fy-sprite-filter: none`은 획이 검정이 아닐 때(색·질감) `sprite-system`의 검정 획 보정을 끈다.

## 획 굵기를 하나로

- 모든 획을 **같은 굵기 하나**로 긋는다(코드로 그리면 `--fy-vector-stroke` 하나, SVG 자소판이면 `stroke-width` 하나). 붓처럼 굵기 변화가 글꼴의 뜻일 때만 달리한다.
- SVG 자소판은 칸이 자리마다 줄고 늘어 **획도 같은 배율로 얇아지고 굵어진다** — 가로모음 위 초성, 받침, 합자 모음 조각처럼 작게 쓰이는 칸은 그만큼 굵게 그린다. 코드로 그리는 벡터 자소는 획 굵기가 자리 배율과 무관해 이 문제가 없다(그래서 권장한다).
- 자리를 맞추려고 자모 하나만 세로로 누르면 그 자모의 가로획만 얇아진다(예: '두'의 ㅜ 막대가 '크'의 ㅡ보다 얇아짐). 누르지 말고 남는 획 끝을 자른다.

## 글꼴 파일로 내보내기

그린 글꼴을 워드·디자인 도구에서 쓰는 보통 글꼴 파일(TTF)로 내려받게 할 수 있다. 페이지가 http(s)로 열려 있어야 한다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku-export.js"></script>
<button id="get-font">글꼴 파일 받기</button>
<script>
  document.getElementById("get-font").onclick = async () => {
    const { ttf } = await FontKkuExport.exportFont({ font: "sprite-system", jamoSet: "brush", familyName: "내 붓글씨" });
    FontKkuExport.download(ttf, "my-brush.ttf");   // 한글 11,172자, 몇 초 걸린다
  };
</script>
```

- 그림 자소(자소판)·벡터 자소 글꼴만 글꼴 파일이 된다. 세벌·고딕에 건 8칸 그림 세트(`frame: "box"`)와 원소 획 글꼴은 `exportFont`가 빈 파일 대신 오류로 거절한다(`error.code === "EXPORT_UNSUPPORTED_FACE"`). 거절하면 `error.code`를 보고 화면에 까닭을 쓴다. 코드 목록은 문서 「글꼴 파일로 내보내기」에 있다.

## 확인

- 그린 칸이 없는 자모는 빈칸으로 보인다. 확인 문장 "닭을 밟고 흙을 긁다 · 괜찮아요 · 쳇바퀴 · 꽃잎 · 의자"를 크게(80px 이상) 그려 자모가 빠지거나 겹치지 않는지 본다.
- 획 굵기 확인 문장 "두크 고구그 노누느 · 가고과 · 각간값닭"을 80px와 16px로 그려, 막대·기둥·받침이 한 굵기로 보이는지, 작게 써도 획이 끊기거나 속공간이 메워지지 않는지 본다.
- 결과를 보여 줄 때는 그린 자모(코드나 SVG), 같은 문장을 `sprite-system` 그대로와 나란히 그린 미리보기 HTML을 함께 낸다.
- 브라우저에서 그리며 만들려면 글꼴 작업실을 쓴다 — 세벌·고딕에 거는 그림 세트는 첫 화면 디자인 칸의 "그리기 8 → 24 → 40"(위 「글꼴 작업실에서」), 자소판(PNG·SVG 한 장)은 재료 탭 `https://font.tty.link/font-studio.html?font=sprite-example#studio-material`.
