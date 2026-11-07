# 글꼴 모양·재료·디자인 — 지금의 개념 모델

> 상태: 현행 · 마지막 갱신 2026-10-31 · 관련 결정: [ADR-023](../ADR/ADR-023-device-face-fit.md), [ADR-024](../ADR/ADR-024-hangul-principle-rendering.md), [ADR-025](../ADR/ADR-025-hangul-composition-design.md), [ADR-030](../ADR/ADR-030-one-engine-glyph-shapes.md), [ADR-034](../ADR/ADR-034-composition-modes.md), [ADR-035](../ADR/ADR-035-scope-ladder.md), [ADR-032](../ADR/ADR-032-hangul-structure-and-materials.md)(제안)
>
> 요약: 한 글자가 어떤 값으로 그려지는지 한 장에 모은다. 글꼴 = 글꼴 모양 + 재료이고, 그 위에 디자인과 짓는 방식을 원할 때 더한다. 모두 고르지 않아도 되고, 고르지 않으면 지금 출력 그대로다.

## 이 문서가 다루는 것

2026-10의 결정(ADR-024·025·030·034·035)으로 글꼴을 짓는 말이 바뀌었다. 결정은 ADR마다 흩어져 있으므로 이 문서가 지금 유효한 모델 하나로 묶는다.

- 결정의 근거와 대안은 각 ADR에 있다. 이 문서는 결과만 적는다.
- 변수의 전체 목록은 `spec/css-variables.json`이 정본이다. 말뜻은 [용어집](../GLOSSARY.md#글꼴을-짓는-체계)을 따른다.
- 이웃 문서: 글꼴 CSS 문법(레이어·레벨)은 [스타일 글꼴 체계](./style-profile-system.md), 꾸밈·변주·움직임 축은 [조합 체계](./composition-axes.md), 자소판은 [그림 자소 글꼴](./image-sprite-fonts.md), 편집 화면은 [글꼴 작업실](./font-studio.md), 정적 렌더러는 [언어 공통 렌더 계약](./renderer-contracts.md)이다.

## 한 줄 모델

```text
글꼴 = 글꼴 모양(어디에·얼마나 크게·굵게) + 재료(무엇으로 그리나)
       + (선택) 디자인(원본·조립식·모양을 담은 JSON)
       + (선택) 짓는 방식(음절을 몇 조각으로, 자모를 무엇으로)
그 밖의 축 — 꾸밈·변주·움직임·상호작용·바탕 — 은 조합 체계(ADR-017)가 맡는다.
```

| 고르는 것 | 페이지 CSS | 글꼴 CSS | 디자인 JSON | 바탕 요소 표시 | 고르지 않으면 |
| --- | --- | --- | --- | --- | --- |
| 글꼴 모양 | `--fy-layout` | `--fy-font-layout` | `layout` | `data-fy-layout` | 글꼴을 밝히지 않으면 세벌식(`sebul-cases-v1`), 밝히면 그 글꼴 CSS 자신의 모양 |
| 재료 | `--fy-face` | `--fy-font-face` | `sources` | `data-fy-face` | 글꼴이 밝힌 재료. 기본 제공 `sebul`·`gothic`·`malang`·`jikgyeol`은 원소(`element`) |
| 디자인 | `--fy-design` | `--fy-font-design` | — | `data-fy-design-status`(못 고른 까닭) | 디자인 없음 |
| 짓는 방식 | `--fy-composition` | `--fy-font-composition` | `composition` | `data-fy-composition` | `auto`(모양대로) |
| 음절 나누기(세세하게) | `--fy-vowel-depth`·`--fy-coda-depth`·`--fy-jamo-depth` | `--fy-font-vowel-depth` 등 | `composition.vowel`·`coda` | `data-fy-vowel-depth`·`data-fy-coda-depth` | 글꼴·모양의 기본 |

- 페이지 값이 글꼴 값을 이긴다(ADR-031 페이지 우선). 페이지 전용 변수는 글꼴이 쓰지 않는다.
- 푼 결과는 `FontKku.fontInfo(host)`의 `layout`·`face`·`design`·`composition`과 각 `…Status`로 읽는다.
- 원칙: 어떤 것도 필수가 아니다. 스크립트 한 줄과 태그 하나로 완성된 글이 나오고, 위 값은 원할 때 하나씩 더한다(MEMORY 설계 원칙 5, ADR-034 §0).

## 그리는 차례 — 엔진의 길은 하나

어느 모양이든 같은 차례로 그린다(ADR-030 §1).

1. 음절 → 자모 노드: 음절 나누기와 짓는 방식이 노드 수를 정한다.
2. 자리 값: 자리 → 부모 자리 → 역할 → 자모 → 문맥 → 이 글자만의 계층에서 값을 모은다. 고른 모양이 고정 모양이면 그 모양 값이 글꼴 CSS의 자리 값을 대신한다.
3. 재료로 그리기: 원소 획, 글꼴 글자, 그림 세트, 자소판 칸 가운데 하나로 칠한다.

2026-10-17까지 세벌식·직결식은 런타임이 노드마다 인라인으로 적는 **역할 도장**(`data-fy-stamp`, `--fy-stamp-*`)으로 그렸다. 지금은 그 길이 없다. ADR-026·028 본문의 도장 설명은 당시 기록이다.

## 글꼴 모양

| 모양 | id | 모델 | 쓰는 곳 |
| --- | --- | --- | --- |
| 세벌식 | `sebul-cases-v1` | `case-fixed` — 짜임(모음 모양 × 받침)마다 정한 자리·크기 | 글꼴을 밝히지 않은 바탕 요소의 기본 |
| 직결식 | `sebul-fixed-v1` | `fixed-three` — 같은 역할의 같은 자모는 어디서나 같은 자리·크기 | 글꼴 `jikgyeol`(`--fy-font-layout: sebul-fixed-v1`) |
| 네모꼴 | `square-context-v1` | `adaptive-square` — 글꼴 CSS 자신의 자리 값 | `font="sebul"`·`font="gothic"`처럼 글꼴을 밝힌 바탕 요소 |

- 정본은 `spec/layout-profiles.json`이고 공개 사본은 `FontKku.layoutProfiles`다. 고르는 차례는 페이지 디자인 `layout` > `--fy-layout` > 글꼴 디자인 `layout` > `--fy-font-layout` > 기본이다.
- 글꼴을 밝히지 않은 것과 `font="sebul"`을 밝힌 것은 출력이 다르다. 앞은 세벌식 모양, 뒤는 `sebul` 글꼴 CSS의 네모꼴이다. 글꼴을 밝히면서 세벌식을 원하면 `--fy-layout: sebul-cases-v1`을 쓴다.
- 고정 모양(세벌식·직결식)의 값은 코어 `font-kku.css`의 생성 구간이 `@layer font-kku.shape`에 `--fy-shape-*`로 낸다(계산 칸). 사람과 작업실의 보정은 글꼴 CSS의 `@layer font-kku.tune`에 쓴다(손 보정 칸). 계산 칸을 다시 만들어도 손 보정은 남는다(ADR-030 §3).
- 네모꼴은 글꼴 CSS 세 계층의 자리 값 그대로다. 실측 맞춤은 [글꼴 저작·교정 안내](./font-authoring-and-calibration-guide.md)를 따른다.
- 그림 자소판 재료(`--fy-material: sprite`)는 모양을 받지 않는다. 자소판 칸은 음절 1em 상자라 좌표 틀이 다르다. 명시하면 `layoutStatus`가 `LAYOUT_UNSUPPORTED_FONT`다.
- 고정 모양이 원칙(같은 자리)을 지키는지는 엔진이 강제하지 않고 감사와 작업실 안내가 본다(ADR-030 §5, `FontKku.layoutStability(host)`).

### 표현 방식(`--fy-expression-mode`)은 모양을 고르지 않는다

글꼴 CSS가 밝히는 `--fy-expression-mode: sebeol | general`은 글꼴의 표현 성격을 적는 값이다. 런타임은 정규화한 값을 `data-fy-expression`으로 찍고, 다시 그릴지 판단할 때 비교한다. 자리 값은 고르지 않는다. 세벌식 모양은 위 글꼴 모양 값(`--fy-layout`·`--fy-font-layout`)으로 고른다.

## 레이어 차례

```text
@layer font-kku.font, font-kku.jamo, font-kku.context;   ← 글꼴 CSS 세 계층(ADR-008)
@layer font-kku.shape, font-kku.tune;                     ← 코어 font-kku.css가 더하는 모양 계층(ADR-030 §2)
@layer …, font-kku.look;                                  ← font-kku-looks.css(꾸밈·변주)
@layer …, font-kku.motion;                                ← font-kku-motion.css(자모 움직임)
```

코어를 먼저 불러오는 보통의 차례에서 결과는 `font < jamo < context < shape < tune < look < motion < 레이어 밖 페이지 CSS`다.

- 뒤 계층은 특이도와 상관없이 앞 계층을 이긴다. 같은 계층 안에서는 특이도와 파일 순서가 정한다.
- `font-kku.shape`는 고른 고정 모양의 값을 내고, 바탕 글꼴의 자모·문맥·짜임·이 글자만 보정을 비운다. 그 위 `font-kku.tune`의 손 보정만 다시 더해진다.
- 코어가 변수를 실제 속성(`inset`·`transform`·`font-size`·`clip-path` …)으로 바꾸는 소비 규칙은 레이어 밖에 있다. 페이지의 요소 리셋이 자모 자리를 깨지 않게 하려는 것이다. 그래서 글꼴은 변수로만 자모 노드에 닿는다.
- 고정 모양의 손 보정을 쓰는 글꼴 CSS는 첫 문장을 다섯 계층(`font-kku.font, font-kku.jamo, font-kku.context, font-kku.shape, font-kku.tune`)으로 쓴다. 문법 검사는 `authoring/font-kku-lint.js`(ADR-008 §9)다.

## 재료

재료라는 말은 두 층에 쓰인다.

| 층 | 변수 | 값 | 뜻 |
| --- | --- | --- | --- |
| 재료 계열 | `--fy-material` | `system` · `sprite` · `bundled` | 글꼴이 어떤 길로 그려지는지. `sprite`면 자소판 칸으로 칠한다 |
| 재료(축) | `--fy-face`(페이지) · `--fy-font-face`(글꼴) | `element` · `device` · `svg` | 계열 `system` 글꼴의 자모를 무엇으로 그리나(ADR-024) |

- **원소(`element`)**: 획을 CSS 상자(가로선·세로선·원, 점·사선은 파생)로 그린다. 기기 글꼴과 상관없이 어디서나 같은 모양이다.
- **글꼴 글자(`device`)**: 기기·웹 한글 글꼴의 낱자를 표준 잉크 상자에 맞춰 그린다(ADR-023). 칠이 글자 외곽선에 묶인 꾸러미 글꼴(`neon` 등)의 기본이다.
- **그림 세트(`svg`)**: 칸 계약(`frame: "box"`)으로 등록한 자모 세트(`FontKku.registerJamo`, `jamo-set`)를 자모 노드마다 인라인 SVG로 그린다. 그런 세트가 없으면 원소로 그리고 `SVG_REQUIRES_BOX_SET`를 남긴다.
- 재료(축)는 글꼴이 표준 잉크 상자(`--fy-font-ink-boxes: standard`, 페이지 `--fy-ink-boxes`)를 밝힐 때만 정해진다. 차례는 페이지 `--fy-face` > 글꼴 `--fy-font-face` > `device`다. 알 수 없는 이름은 `FACE_TOKEN_INVALID`, 잉크 상자가 없는 글꼴에 명시하면 `FACE_UNSUPPORTED_FONT`다.
- 세 재료가 같은 자리에 그리도록 맞추는 정본은 표준 잉크 상자 `spec/jamo-ink-boxes.json`, 원소의 뼈대는 `spec/jamo-skeletons.json`이다. 정적 렌더러는 원소 획을 `spec/element-layer.json` 표로 받는다(ADR-027).
- 자소판 재료는 [그림 자소 글꼴](./image-sprite-fonts.md)이 다룬다. 표준 잉크 상자·모양·디자인을 받지 않는다.

## 디자인

디자인은 무엇으로 그릴지(원본), 자모를 어떻게 지을지(조립식), 어떤 모양을 입힐지를 담은 JSON이다. 글꼴 CSS와 따로 저장한다(ADR-025).

- 형식: `spec/design.schema.json`. 주요 칸은 `sources`(원본 — 직접 그린 그림·글꼴 글자·원소), `rules`(자모별 `method`: `auto`·`direct`·`compose`, `recipe`), `layout`, `composition`, `editor`다.
- 등록과 검사: `FontKku.registerDesign(name, design)`, `validateDesign`, `unregisterDesign`, `designs()`. 고르기는 페이지 `--fy-design` > 글꼴 `--fy-font-design`이다. `--fy-design: legacy`는 디자인만 끊는다.
- 풀어 보기: `FontKku.planJamo(jamo)`는 자모 하나의 원본·조립식·조각을, `FontKku.traceOf(host)`는 바탕 요소의 출처 기록을 준다.
- 조립식의 정본은 `spec/jamo-recipes.json`이다. 연산은 병서·겹받침·합용·가획·자리 밝힘이다([용어집](../GLOSSARY.md#글꼴을-짓는-체계) '조립식').
- 디자인을 받지 않는 글꼴(자소판 재료, 표준 잉크 상자 없음)에는 `data-fy-design-status="DESIGN_UNSUPPORTED_FONT"`가 붙는다.
- ADR-025는 2026-10-31에 구현된 절(§1–§13)을 수용했다. 남은 제안(조각 보정, 디자인을 아는 정적 렌더러 이식, 글꼴 팔레트의 WebKit·Android 확인 등)은 그 ADR의 Status를 본다.

## 짓는 방식

짓는 방식은 두 축의 묶음이다(ADR-034).

- **나누기**(음절 → 노드): 모음 `split`·`whole`·`syllable`, 받침 `split`·`whole`.
- **조각 깊이**(노드 → 조각): `none`(자모 그대로)·`pieces`(다른 자모로 — ㅎ = ㅗ + ㅇ)·`origins`(원형 8과 천지인까지).

| 프리셋 | 화면 이름 | '화' | 나누기(모음·받침) | 조각 깊이 |
| --- | --- | --- | --- | --- |
| `auto`(기본) | 모양대로 | 모양의 기본 | 모양·글꼴의 기본 | `none` |
| `syllable` | 음절로 | 호 + ㅏ | `syllable` · `whole` | `none` |
| `whole` | 겹모음 통째로 | ㅎ + ㅘ | `whole` · `whole` | `none` |
| `jamo` | 자모로 | ㅎ + ㅗ + ㅏ | `split` · `split` | `none` |
| `pieces` | 조각으로 | (ㅗ + ㅇ) + ㅗ + ㅏ | `split` · `split` | `pieces` |
| `origins` | 원형으로 | (ㆍ + ㅡ + ㅇ) + (ㆍ + ㅡ) + (ㅣ + ㆍ) | `split` · `split` | `origins` |

- 차례(높은 것부터): 자모별 디자인 규칙 > 페이지(낱 깊이 > `--fy-composition` > 줄임 깊이) > 디자인 `composition` > 글꼴(낱 깊이 > `--fy-font-composition` > 줄임 깊이) > 모양의 기본.
- 목록과 풀이는 `FontKku.compositionPresets`, `FontKku.resolveComposition(input)`이다. 조각 깊이별 조립식은 `spec/jamo-recipes.json`의 `levels`가 정한다.
- 못 짓는 칸은 `COMPOSITION_UNSUPPORTED`로 남기고 다른 방식으로 몰래 바꾸지 않는다.
- 세벌식·직결식·네모꼴 모두 같은 나누기를 받는다(ADR-030 §4). 고정 모양은 모양 값 표가 모든 나누기의 자리를 갖는다.
- 나누기 맞춤(네모꼴): 네모꼴 글꼴 CSS는 그 글꼴의 기본 나누기 자리만 다듬어 두었다. 다른 나누기를 고르면 같은 음절을 기본 나누기로 그렸을 때의 조각 잉크 자리에 자모를 그린다. 글꼴·작업실·페이지가 그 노드의 자리를 밝혔으면 맞추지 않는다. 페이지 `--fy-split-fit`(글꼴 `--fy-font-split-fit`) 값 `auto`(기본)·`none`으로 켜고 끈다. 맞춤 전후 잉크 상자는 `FontKku.splitFit(node)`로 읽는다.

## 편집 범위 사다리

좁은 범위가 늘 이긴다(ADR-035). 넓은 것부터:

```text
자리 가족 < 이 자리 모두 < 이 자리의 이 자모 < 이 자모 어디서나 < 같은 짜임 모두 < 문맥 < 이 글자만
family      slot          slotJamo           jamo               case             context  glyph
```

| 수준 | 보정 변수 | 계층 |
| --- | --- | --- |
| 이 자모 어디서나 | `--fy-jamo-*` | `font-kku.jamo` |
| 같은 짜임 모두 | `--fy-case-*` | `font-kku.context` |
| 문맥 | `--fy-ctx-*` | `font-kku.context` |
| 이 글자만 | `--fy-syl-*` | `font-kku.context` |

- 접미사는 모두 같다: `dx`·`dy`, `scale-x`·`scale-y`, `rotate`, `size`, `weight`, `stroke`, `clip`, 문자 매핑 `glyph-text`·`glyph-candidate`.
- 합치는 법(코어 `font-kku.css`): 위치·회전·획 두께는 jamo + case + ctx + syl을 더한다. 크기·비율은 곱한다. 굵기·자르기는 좁은 것이 대체한다(page ?? syl ?? ctx ?? case ?? jamo ?? slot).
- 자리 가족·이 자리 모두·이 자리의 이 자모는 자리 변수를 대체하는 절대 범위다. 더 좁은 규칙이 같은 자리 변수를 다시 적으면 가려진다.
- 고정 모양에서는 원칙 범위 < (직결식) 같은 짜임 모두 < 이 글자만이고, 손 보정은 `font-kku.tune`에 쓴다.
- 레벨 표와 합성 규칙의 자세한 내용은 [스타일 글꼴 체계](./style-profile-system.md#레벨-변수와-합성-규칙), 작업실의 범위 고르기는 [글꼴 작업실](./font-studio.md)을 본다.

## 아직 제안이거나 진행 중인 것

- **ADR-025**(디자인): 해석기·디자인 등록·원형 8 조립·기본 정적 원소 출력은 구현되었다. 조각 보정과 디자인을 아는 정적 렌더러 이식이 남았다. 자세한 범위는 ADR Status와 [PLAN-HANGUL-001](../PLAN/hangul-composition-refactor.md)을 본다.
- **ADR-032**(옛한글과 표현 재료): 문자 매핑의 첫 범위가 구현되었다. 한글 원문을 그대로 두고 그릴 글자만 바꾸며(`--fy-glyph-text`, 디자인 원본의 글자 후보 `sources[].glyphs`), 결과는 `fontInfo(host).glyphMapping`으로 읽는다. 옛한글 문자 구조·관계 자료·의미 ID는 계획이다([용어집](../GLOSSARY.md#한글-구조와-문자-매핑-확장-계획)).
- 그림 자소판 재료에 모양·디자인을 입히는 일은 아직 정하지 않았다(ADR-030 §1).

## 어디에 무엇이

| 무엇 | 정본 |
| --- | --- |
| 글꼴 모양 | `spec/layout-profiles.json` → 코어 `font-kku.css` 생성 구간(`font-kku.shape`) |
| 표준 잉크 상자 · 뼈대 | `spec/jamo-ink-boxes.json`, `spec/jamo-skeletons.json` |
| 정적 렌더러 원소 획 | `spec/element-layer.json` |
| 디자인 형식 · 해석 시험 | `spec/design.schema.json`, `spec/design-bundle.schema.json`, `spec/resolver-cases.json` |
| 조립식 · 조각 깊이 | `spec/jamo-recipes.json` |
| 그릴 범위 | `spec/authoring-stages.json` |
| 변수 목록 | `spec/css-variables.json`(검사 `scripts/check_css_contract.js`) |
| 글꼴 목록 · 기본 나누기 | `spec/fonts.json` |

## Change Log
- 2026-10-31: 새로 씀 — ADR-024·025·030·034·035에 흩어진 지금의 개념 모델(모양 + 재료 + 디자인 + 짓는 방식, 레이어 차례, 범위 사다리)을 한 문서로 묶음(PLAN-DOCS-001)
