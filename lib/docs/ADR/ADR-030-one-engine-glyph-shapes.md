# ADR-030: 한 엔진 — 세벌식·직결식을 글꼴 모양 값으로

## Status
Accepted (2026-10-17) — 2026-10-16 사용자 결정 둘을 받아 쓰고(Proposed), 1단계를 브랜치 `refactor/one-engine-step1`에서 구현해 사용자 승인으로 master에 합쳤다(`15c24eb`). 2단계도 브랜치 `feat/one-engine-step2`에서 구현해 사용자 승인으로 합쳤다(`9f656bc`). 정적 렌더러 4언어 이식도 브랜치 `feat/one-engine-step2-static`에서 끝내 사용자 승인으로 합쳤다(`1efda48`). 3단계(원칙 경고)도 브랜치 `feat/one-engine-step3`에서 구현해 사용자 승인으로 합쳤다(`2b69447`). 4단계도 a(편집 범위 둘, `338077c`)·b(보정 값, `db133df`)·c(저장 두 갈래, `ec57e10`)를 사용자 승인으로 합쳐 네 단계를 모두 마쳤다(아래 Change Log). 계획은 [PLAN-STUDIO-001](../PLAN/composition-modes-and-human-review.md).
[ADR-026](ADR-026-sebul-fixed-layout.md)의 배치 모델(`fixed-three`)·역할 도장과 [ADR-028](ADR-028-sebeol-cases-and-jikgyeol.md)의 짜임 고정(`case-fixed`) 도장 경로를 대신한다. 두 ADR의 모양 값(역할 상자, 짜임, 맞춤 규칙, revision)은 그대로 정본으로 남는다.

## Date
2026-10-16

## Context

사용자 결정(2026-10-16):
- "세벌식은 그냥 여러 글꼴 모양 중 하나로 해야해. 네모꼴이든 세벌식글꼴이던 동일한 엔진인데 표현을 어떻게 하느냐에 따라 달라지는거지."
- "세벌 직결식에서도 모두 지원하게 해줘." — 머리 음절(호+ㅣ)·통짜(ㅎ+ㅚ)·낱(ㅎ+ㅗ+ㅣ), 겹받침 통짜·낱.

같은 원칙을 2026-08-10에도 정했다 — "세벌과 고딕은 내부 메커니즘 차이가 아니라 디자인(글꼴 철학) 차이"([자모 깊이 축](../NOTES/depth-axis.md)).

지금 구조는 이 원칙과 다르다. 엔진에 길이 둘 있다.

| | 네모 문맥(`adaptive-square`) — sebul·gothic 등 | 세벌식(`case-fixed`)·직결식(`fixed-three`) |
|---|---|---|
| 자리 값 | 글꼴 CSS의 자리·역할·자모·문맥 변수(`@layer font-kku.font, font-kku.jamo, font-kku.context`) | 런타임이 노드마다 인라인으로 적는 도장 `--fy-stamp-*`(`font-kku.js` `stampLayout`) |
| 글꼴 CSS 보정 | 받는다 | 계층 밖 코어 규칙이 자리·역할·자모·문맥 보정과 자르기를 모두 끈다(`font-kku.css` 도장 규칙, 묶음 변환 `transform: none`) |
| 값의 정본 | 글꼴 CSS(`profiles/*.css`) | `spec/layout-profiles.json` → `font-kku.js` 생성 표 `LAYOUT_PROFILES` |
| 음절 나누기 | 글꼴 CSS `--fy-vowel-depth`·`--fy-coda-depth` | 프로파일 `depth`로 낱 모음 + 통짜 겹받침 고정(도장 표가 합자 모음 조각만 갖는다) |
| 작업실 편집 | 된다 | 거부한다(`stamped()`·`refuseFixed()`), 전역 변수 흐림 |
| 손 교정 | 글꼴 CSS 어디나 | 자모마다 em 이동 `nudge`뿐(ADR-026 L26) |

결과:
- 기본 첫 화면에서 끌어 고칠 수 없다([작업실 검토](../NOTES/studio-direct-manipulation-review-2026-10-16.md) 1번).
- 세벌식·직결식에서는 '회'를 호+ㅣ나 ㅎ+ㅚ로 지을 수 없다.
- 세벌식이 글꼴의 한 모양이 아니라 엔진의 모드로 보인다 — 문서·화면에서 '배치'가 재료·글꼴과 다른 축으로 따로 선다.

## Decision

### 1. 글꼴 모양은 값이다 — 엔진의 길은 하나다

- **글꼴 모양**(이하 모양)은 자모 노드를 어디에, 얼마나 크게·굵게 놓는지의 값 묶음이다. 세벌식·직결식·sebul의 네모꼴·gothic의 네모꼴은 모두 모양이다. 재료(선·원·SVG·기존 글꼴)와 따로 고른다. 그림 자소판 재료(`--fy-material: sprite`)는 지금 표준 잉크 상자·글꼴 모양·디자인을 받지 않는다 — 자소판 칸은 음절 1em 상자라 좌표 틀이 다르다(ADR-011 §1, `font-kku.js` 디자인을 받지 않는 바탕 요소). 자소판도 모양을 받게 할지는 이 ADR 밖의 과제다([엔진 간결화 검토](../NOTES/engine-simplification-review-2026-10-17.md)).
- 엔진은 어떤 모양이든 같은 차례로 그린다: 음절 → 자모 노드(음절 나누기) → 자리 값(자리 → 역할 → 자모 → 문맥 계층) → 재료로 그리기.
- 도장 경로를 없앤다. `stampLayout`, 계층 밖 도장 규칙, `data-fy-layout-model`에 따른 분기, 작업실의 도장 노드 편집 거부가 사라진다.
- 식별자는 호환을 위해 그대로 쓴다: 모양 id는 지금 배치 프로파일 id(`sebul-cases-v1`·`sebul-fixed-v1`·`square-context-v1`), 디자인 `layout`, 글꼴 `--fy-font-layout`, 바탕 요소 `data-fy-layout`. 화면·문서는 '배치' 대신 '글꼴 모양'이라 쓴다([용어집](../GLOSSARY.md)).

### 2. 모양 값은 같은 변수 계층의 CSS로 낸다

- 코어 계층 차례를 `font-kku.font, font-kku.jamo, font-kku.context, font-kku.shape, font-kku.tune`으로 넓힌다.
  - `font-kku.shape`: 생성된 모양 값. 고른 모양(바탕 요소 `data-fy-layout`)이 글꼴 자신의 모양이 아니면 그 값이 글꼴 CSS의 자리 값을 대신하고, 글꼴 자신의 자모·문맥 보정을 0으로 되돌린다. 지금 도장 규칙이 하던 일을 같은 계층 안에서 한다.
  - `font-kku.tune`: 고른 모양 위의 보정. 작업실에서 세벌식·직결식 자모를 고치면 여기에 적는다(내 글꼴 CSS의 `@layer font-kku.tune`). 다른 글꼴의 보정과 같은 범위(자리·자모·문맥)를 쓴다.
- 세벌식의 짜임(모음 모양 세로·가로·합자 × 받침 없음·홑·겹)은 글자 칸의 `data-jung-layout`·`data-jong-layout`으로 고르는 문맥 값이다. 직결식은 짜임을 가리지 않는 역할·자모 값이다. 값은 지금 도장과 같다 — 짜임 열쇠 → 모양 열쇠 → 열쇠 없는 값 차례(`caseStamp`)를 생성기가 규칙 차례로 옮긴다.
- 런타임이 그릴 때 모양 값을 읽어야 하는 곳은 1단계에서 모두 찾아 같은 정본의 표로 셈하거나 계산된 값을 읽는다. 지금 아는 곳: 기기 글꼴 맞춤의 획 넓힘(`stampInset`), 밀도 굵기 계수(`--fy-el-density`), 받침 그림 문맥(`data-fy-draw`), 원소 획 표 열쇠(짜임 열쇠 `|v` 등), `layoutStability`.

### 3. 원본은 다른 글꼴과 같은 형식 — 계산 칸과 손 보정 칸

- 세벌식·직결식도 다른 글꼴처럼 **글꼴 파일 하나**가 원본이다(사용자 결정 2026-10-17 — "세벌식이던 네모꼴이던 그냥 글꼴 동일한 방식으로"). 글꼴 파일은 두 칸으로 나뉜다.
  - **계산 칸**: 도구가 다시 써도 되는 값. 세벌식·직결식은 역할 상자 짓기(`scripts/measure_layout_stamps.py`, 지금의 `derive`·`measured`)가 쓴다. 다른 글꼴은 실측 맞춤 도구(`glyph_fit*` 등)가 쓸 수 있다.
  - **손 보정 칸**: 사람과 작업실이 쓰는 값(`@layer font-kku.tune`). 계산 칸을 다시 써도 지워지지 않는다. 작업실은 어느 값이 손으로 고친 것인지 보인다.
- 지금의 `nudge`(자모마다 em 이동, ADR-026 L26)는 손 보정 칸의 '이 자모(모든 짜임) 이동'으로 옮긴다. `spec/layout-profiles.json`은 계산 칸의 입력(역할 상자·맞춤 규칙)과 공개 사본 `FontKku.layoutProfiles`의 원본으로 남고, 손 보정을 담지 않는다.
- 생성기는 같은 원본에서 정적 렌더러 4언어 표를 낸다(계산 칸 + 손 보정 칸을 합친 값). 런타임 인라인 도장은 내지 않는다.
- (정함, 2026-10-17 1단계) 계산 칸은 코어 CSS `font-kku.css`의 생성 구간 `layouts`(`@layer font-kku.shape`)에 둔다 — 세벌식·직결식 모양은 sebul·jikgyeol 글꼴에 묶이지 않고 디자인이 고르면 어느 글꼴 위에도 입히는 모양이라, 글꼴 파일마다 같은 값을 복사하지 않는다. 손 보정 칸은 글꼴 파일의 `@layer font-kku.tune`이다(지금은 위치·크기 다섯 변수, level tune).

### 4. 음절 나누기는 모든 모양에서 된다

- 모양마다 지원하는 나누기를 모두 갖는다: 모음 낱(`split`)·통짜(`whole`)·머리 음절(`syllable`) × 겹받침 통짜(`whole`)·낱(`split`).
- 세벌식·직결식의 새 값은 같은 역할 상자 짓기로 낸다.
  - 통짜 모음 노드(ㅚ) = 지금 두 조각(ㅗ·ㅣ) 값의 합 상자.
  - 머리 음절 노드(호) = 초성 값과 가로 모음 값의 합 상자. 안쪽 두 묶음(`data-fy-head-part`)은 그 비례로 옮긴다(ADR-024 §2).
  - 겹받침 낱(ㄹ+ㄱ) = 지금 겹받침 안 조각 자리.
  - (정함, 2026-10-17 2단계 구현) 합친 노드(머리·통짜 모음) 안의 자모는 낱 나누기의 노드와 같은 자리다 — 뼈대·기기 글꼴·그림 세트의 합자 모음은 표준 잉크 상자 비례(ㅗ 꼭지가 높다)라 합 상자에 맞추기만 하면 초성과 겹친다. 원소·SVG 재료는 획(조각 그림)을 옮기고, 그림 세트는 통짜 모음을 조각 그림으로 짓고, 기기 글꼴 통짜 모음은 조각 낱자 둘(잎)로 그린다. 기기 글꼴 머리는 완성형 머리 글자 하나다. 값은 정본 프로파일의 `splits`, 규칙은 코어 CSS의 둘째 `@layer font-kku.shape` 블록이다([노트](../NOTES/one-engine-step2-adr030.md)).
- 나누기를 정하는 차례: 바탕 요소의 페이지 변수(`--fy-vowel-depth`·`--fy-coda-depth`·`--fy-jamo-depth`) > 고른 모양 위의 보정(`font-kku.tune`의 바탕 요소 규칙) > 고른 모양의 기본(프로파일 `depth` — 세벌식·직결식은 지금처럼 낱 + 통짜) > 글꼴 CSS의 기본(`spec/fonts.json`). 모양을 바꿔 입히지 않은 글꼴(네모꼴)은 지금처럼 글꼴 CSS 기본이 정한다.
  - (정함, 2026-10-17 2단계 구현) tune 계층의 보정은 글꼴 레벨 이름 그대로(`--fy-font-vowel-depth` 등, 등록부 `tune: true`)다. 코어 CSS가 shape 계층에서 고정 모양 바탕 요소의 글꼴 깊이 변수를 비워 바탕 글꼴의 기본이 닿지 않게 하고, tune 계층이 다시 쓴다. 고정 모양에서는 글꼴 CSS의 기본(넷째)이 쓰이지 않는다.
- 기본 출력(세벌식, 낱 + 통짜)은 바뀌지 않는다. 새 나누기의 값은 검수 시트로 보이고 승인받은 뒤 기준선에 넣는다.

### 5. 모양의 원칙은 검사가 지킨다

- "직결식은 같은 역할의 같은 자모가 어디서나 같은 자리"(사용자 2026-10-14 "최대한 … 동일한 위치에"), "세벌식은 같은 짜임 안에서 같은 자리"는 엔진이 강제하지 않는다.
- `FontKku.layoutStability(host)`가 그려진 결과로 원칙을 잰다(모양이 원칙을 밝힌 경우). 감사·스모크는 지금처럼 기본 출력에서 원칙을 확인한다.
- 디자인 등록에서 원칙에 어긋나는 규칙(직결식·세벌식의 문맥 조건, 자리 변주 — ADR-026 L08·L09)은 거부 대신 경고로 바꾼다(`validateDesign` 경고 코드). 작업실은 경고와 "원칙대로 되돌리기"를 보인다. — 결정 D5.
- 작업실의 끌기 기본 범위를 모양의 원칙에 맞춘다: 직결식은 '이 자모(모든 짜임)', 세벌식은 '이 짜임의 이 자모', 네모꼴은 지금처럼 고른 범위.
- (정함, 2026-10-17 3단계 구현) 원칙은 프로파일 표(`layoutProfiles[id].match`·`occurrence`)로 판정한다 — 세벌식·직결식 모두 `match: ["jamo", "role"]`라 짜임·받침 조건(`DESIGN_FIXED_CONTEXT`)과 자리 변주(`DESIGN_FIXED_VARIATION`)는 진단(`DesignWarningCode`)이고 규칙은 그대로 지킨다. 그릴 수 없는 통짜 합자 모음(`DESIGN_FIXED_COMPOUND`)은 오류로 남는다. 작업실은 막는 칸(통짜 규칙만)과 원칙 안내 칸("원칙대로 되돌리기"·"문맥 규칙 지우기")을 나눈다. 끌기 범위는 1단계에서 이미 원칙대로다([노트](../NOTES/one-engine-step3-adr030.md)).

### 6. 호환

- 저장된 디자인(`layout` 적음)·페이지(`font="jikgyeol"`, 글꼴 없는 바탕 요소)는 같은 모양으로 열린다. 1단계의 수용 기준은 출력 차이 0이다.
- 사라지는 공개 표면: `data-fy-stamp`, `--fy-stamp-*`, `data-fy-layout-model`(모양이 원칙을 밝히는 다른 표시로 대신할지는 1단계에서 정한다). 0.1.x 패치 판에 싣고 CHANGELOG에 예전 출력을 지키는 법을 적는다(MEMORY "버전은 작게").
- 정적 렌더러 4언어의 출력 HTML도 같은 차례로 바뀐다(인라인 도장 대신 생성 CSS). `spec/html-cases.json` 정합 시험이 두 쪽을 함께 묶는다.

### 7. 모든 글꼴이 같은 편집 범위와 값

- 세벌식이든 네모꼴이든 고칠 수 있는 범위와 값이 같다(사용자 2026-10-17 "세벌식이여도 손으로 모두 다 고칠 수 있어야").
- 범위: 자리 가족 · 자리 전체 · 이 자리의 이 자모 · 이 자모(모든 자리) · 문맥 · **이 짜임의 이 자모**(새) · **이 글자만**(새 — 음절 하나, `[part="glyph"][data-source]`).
- 값: 위치 · 크기 · 가로세로 비율 · 회전 · 굵기 · 획 두께 · 자르기. 지금 엔진은 어느 글꼴이든 '이 자모'·'문맥' 범위에 크기·굵기·획 두께·자르기 보정 변수가 없다([작업실 검토](../NOTES/studio-direct-manipulation-review-2026-10-16.md) 5번) — 엔진 공통으로 보정 변수를 더한다(예: `--fy-jamo-size`·`--fy-jamo-weight`·`--fy-jamo-stroke`, `--fy-ctx-*` 같은 꼴). 이름과 누적·대체 규칙은 1단계 뒤 별도 변경으로 정하고 `spec/css-variables.json`에 등록한다.
- '이 글자만'과 '이 짜임의 이 자모'는 모양의 원칙(직결식 "같은 자리")을 깰 수 있다 — §5대로 막지 않고 알린다.
- (정함, 2026-10-17 4단계 b 구현 — 사용자 "선·원 재료 굵기까지 함께") 보정 값: `--fy-jamo-size`·`--fy-ctx-size`(크기 배수), `--fy-jamo-weight`·`--fy-ctx-weight`(굵기 대체 — 기기 글꼴 font-weight, 자리 굵기와 같은 뜻), `--fy-jamo-stroke`·`--fy-ctx-stroke`(획 두께 더함 — 기기 글꼴 외곽선과 원소·그림 재료의 획 굵기 둘 다, 코어가 노드에서 `--fy-el-plus`로 굳히고 런타임 굵기 맞춤이 따라온다), `--fy-jamo-clip`·`--fy-ctx-clip`(자르기 대체). 합치는 차례는 페이지 > 문맥 > 자모 > 자리. 고정 모양은 바탕 글꼴의 자모·문맥 보정을 받지 않는다 — 비우는 규칙을 계층 밖에서 셋째 `@layer font-kku.shape` 블록으로 옮겨 tune 계층이 같은 `--fy-jamo-*`를 다시 쓴다(위치·크기·비율은 모양 값 `--fy-shape-*` 그대로). 한계: 기기 글꼴 맞춤의 표준 상자 넓힘은 모양 값의 획 넓힘만 본다 — tune의 획 두께 보정만큼 잉크가 상자 밖으로 번질 수 있다([노트](../NOTES/one-engine-step4-adr030.md)).
- (정함, 2026-10-17 4단계 범위) 두 범위는 기존 보정 자리에 쓴다 — 네모꼴은 `@layer font-kku.context`의 `--fy-ctx-*`(선택자 `[part="glyph"][data-layout-key]`·`[part="glyph"][data-source]`), 고정 모양은 `@layer font-kku.tune`의 `--fy-shape-*`(원칙 범위 선택자에 짜임·음절 속성을 더해 특이도로 이긴다). '이 글자만'은 같은 음절이면 어디서나 함께다. 새 공개 변수는 없다([노트](../NOTES/one-engine-step4-adr030.md)).

### 8. 고친 것을 저장하는 두 갈래

- **새 글꼴로**(작업실 기본): "바탕 글꼴(판 고정) + 손 보정"으로 저장한다. 바탕 글꼴은 id와 판(모양 revision)으로 가리킨다 — 바탕의 새 판이 나와도 복사한 바탕 CSS 원문은 그대로이고, "바탕 새 판 받기"로 갱신한다. 런타임·코어 CSS·그림 자산까지 고정하는 것은 아니다([ADR-031](ADR-031-explicit-options-and-review-evidence.md)). 완전히 따로 쓰려면 "통째로 풀어 저장"(구간 표시를 뺀 CSS; 외부 의존성은 남음)을 고른다. 작업실의 "이 글꼴로 새 글꼴"이 이 길이다.
- **이 글꼴 그대로**(기본 제공 글꼴 다듬기): 고친 값이 저장소에 있는 그 글꼴의 손 보정 칸에 들어간다. 다음 판의 출력이 바뀌므로 전후 시트를 보고 승인한 뒤 반영한다(지금 규칙). 사이트 이용자의 작업실에서는 이 길을 열지 않는다.
- 파생 글꼴(`spec/fonts.json` `derivedFrom`)과 같은 뜻이다 — 새 글꼴은 바탕 글꼴의 파생 글꼴이고, 손 보정 칸만 가진다.
- (정함, 2026-10-17 4단계 c — 사용자 "파생 글꼴과 같은 꼴", "저장소 작업실에서만") 새 글꼴 파일은 저장소 파생 글꼴과 같은 꼴이다: 작업실 머리말(바탕 id·패키지 판·바탕 원문 지문 — FNV-1a 16진 8자), 계층 문장, 바탕을 새 이름으로 옮긴 `BEGIN/END GENERATED` 구간, 그 아래 손 보정 레이어 블록. 바탕 옮기기 셈은 `authoring/font-derive.js` 하나이고 `scripts/build_derived_fonts.js`도 그것을 쓴다(저장소 파생 글꼴 18개의 구간이 바이트까지 같다). 판은 모양 revision이 아니라 **구간 복사로** 고정한다 — 바탕이 바뀌어도 파일은 그대로이고, 머리말의 판·지문은 어느 바탕을 옮겼는지 가리는 표지다.
  - 작업실은 구간 안 규칙을 잠근다: 고치지 않고, 새 규칙도 구간 밖 손 보정 쪽에 이기는 규칙으로 만든다(같은 레이어의 뒤 규칙). 저장소 파생 글꼴(neon 등)을 열어도 같다.
  - 기본 제공 글꼴을 고친 뒤 '이 글꼴로 새 글꼴'을 누르면 그때까지 고친 선언을 손 보정으로 옮긴다(`FontStudioModel.handEdits` — 같은 레이어·같은 선택자의 뒤 규칙; 한 요소에 함께 맞을 수 있는 같은 특이도 뒤 규칙이 같은 변수를 선언하면 그 선언도 옮겨 차례를 지킨다). 지운 선언·규칙, 조건·중첩 규칙의 변경, `!important`, 규칙 밖 글의 변경은 옮길 수 없어 통째로 복사하고 알린다. 이미 파생 글꼴이면 이름만 바꾼다. 기본 제공 글꼴이 아닌 글꼴(사용자 파일)은 전처럼 통째로 복사한다.
  - '바탕 새 판 받기': 작업실이 만든 파생 글꼴의 바탕 구간이 지금 패키지의 바탕과 다르면 단추가 뜨고, 구간만 다시 쓴다(손 보정 그대로, 머리말의 판·지문을 새로, 되돌리기 한 단계). 그림 자소판 바탕을 옮기는 저장소 파생 글꼴은 생성기가 자소판 주소·굵기 보정까지 다루므로 작업실이 다시 쓰지 않는다.
  - '통째로 풀어 저장': 파생 글꼴의 내보내기·복사·파일 저장에 거는 선택 — 구간 표시와 작업실 머리말을 뗀 한 파일. 규칙은 그대로다.
  - '이 글꼴 그대로': 고친 기본 제공 글꼴(`spec/fonts.json`의 글꼴·별칭 이름)은 같은 이름으로 내보내기·복사·파일 저장을 막고 '새 이름'으로 이끈다. 고치지 않았으면 막지 않는다. 저장소 작업실은 mount 옵션 `shippedSave: true`(바로 열 때 `?shipped-save=1`)로 연다. 프로젝트 저장·초안은 막지 않는다(작업 파일).

## Alternatives Considered

### Alternative A — 도장을 두고 작업실만 도장을 고치게 한다
- 설명: 런타임 도장은 그대로 두고, 작업실이 도장 노드를 끌면 정본(`spec/layout-profiles.json`)이나 디자인의 도장 보정을 고친다.
- 장점: 런타임·정적 렌더러를 덜 바꾼다.
- 단점: 엔진의 길이 둘로 남는다(사용자 결정과 다르다). 글꼴 CSS 보정·편집 범위가 도장 쪽에 따로 있어야 하고, 내 글꼴 CSS로 세벌식을 고칠 수 없다.

### Alternative B — 세벌식·직결식을 따로 된 글꼴 CSS 파일로 만든다
- 설명: 모양 값을 `profiles/sebeol.css` 같은 생성 글꼴 CSS의 font·jamo·context 계층에 그대로 넣고, 디자인 `layout`은 바탕 글꼴을 고르는 것으로 바꾼다.
- 장점: 모든 모양이 글자 그대로 '글꼴'이다. 새 계층이 없다.
- 단점: 재료가 다른 글꼴(gothic 재료 + 세벌식 모양)을 짓는 길이 사라지거나 새 규칙이 든다. 저장된 디자인의 `layout` 뜻이 바뀐다. 기본 바탕 요소(sebul 재료 + 세벌식)의 출력 등가를 지키기 어렵다.

### Alternative C — 지금대로(ADR-026·028)
- 단점: 사용자 결정과 다르고, 음절 나누기·작업실 편집이 막힌 채로 남는다.

## Consequences

### Positive
- 엔진·작업실·문서에서 세벌식이 여러 모양 중 하나로 보인다. 화면의 '배치' 축 특별 취급이 사라진다.
- 기본 첫 화면에서도 끌어 고칠 수 있다. 사람 교정이 쓰는 자리가 하나가 된다.
- 어느 모양에서나 '회'의 네 길을 쓸 수 있다.

### Negative
- 런타임·코어 CSS·정적 렌더러 4언어·작업실·감사가 함께 바뀐다(아래 영향 범위).
- 생성 CSS가 커진다(지금 도장 232개 + 원소 획 열쇠 283개, 새 나누기만큼 더). 전송 예산은 참고값이다(MEMORY).

### Risks
- 계층 차례가 어긋나면 바탕 글꼴(sebul)의 문맥 규칙(`:has()`, 자르기)이 세벌식 값과 섞인다 — `font-kku.shape`가 되돌리는 변수 목록을 지금 도장 규칙과 같게 시작하고, 조립 기준선·`layoutStability`로 확인한다.
- 페이지 CSS(계층 밖)가 자모 보정 변수를 직접 쓰면 이제 모양 값 위에 얹힌다(지금은 도장 규칙과 순서로 다퉜다). 공개 계약상 페이지 변수만 받는다고 적고 스모크로 확인한다.
- 노드마다 인라인 값 대신 규칙 맞춤이 늘어 그리기가 느려질 수 있다 — 1단계에서 1,000자 그리기 시간을 전후로 잰다.
- 런타임이 도장 값을 읽던 곳을 빠뜨리면 기기 글꼴 맞춤·밀도가 말없이 어긋난다 — §2의 목록을 1단계 첫 일로 전수 조사한다.

## 영향 범위 (2026-10-16 grep)
- 런타임·코어: `font-kku.js`(`stampLayout`·`caseStamp`·`layoutCase`·`stampInset`·`fitFaceNodes`·`layoutStability`·생성 구간 `LAYOUT_PROFILES`), `font-kku.css`(도장 규칙·묶음 변환·생성 구간), `font-kku.d.ts`·`.d.mts`, `font-kku-looks.css`
- 생성기·정본: `scripts/build_layout_profiles.js`, `scripts/measure_layout_stamps.py`, `scripts/generate_sidecar_tables.js`, `scripts/record_element_layer.py`, `scripts/element_edition.js`, `scripts/build_looks.js`, `scripts/generate_html_cases.py`, `spec/layout-profiles.json`·`element-layer.json`·`html-cases.json`·`css-variables.json`
- 정적 렌더러: `renderers/{python,go,ruby,rust}`의 표·`render_html`·자산 CSS·시험
- 제작·작업실: `authoring/font-kku-lint.js`·`font-studio-design-model.js`·`font-studio-bundle-model.js`, `studio/font-studio*.js`(도장 거부·흐림·출처·조립식·팔레트)
- 시험: `tests/layout_cases.test.js`·`spec_parity.test.js`·`element_table.test.js`·`font_studio_design.test.js`·`static_html_parity.py`·`playwright_smoke.py`·`tests/studio_f/*`·`tests/probes/records/records-13.py`
- 문서: ADR-026·027·028, `docs/ARCHITECTURE/font-studio.md`·`renderer-contracts.md`·`composition-axes.md`, `skills/font-kku*`, README, GLOSSARY

## 단계
1. **등가 리팩터**: §1–3, §6(계산 칸만 옮기고 손 보정 칸은 비어 있다). 출력 차이 0(조립 기준선 `scripts/capture_composition_baseline.py --check`, 시각 기준선, `spec/html-cases.json` 정합, 가독성·겹침·획 굵기 감사, `layoutStability`). 작업실의 도장 거부를 없애고 `font-kku.tune`에 쓰게 한다.
2. **새 나누기**: §4. 세벌식·직결식의 통짜·머리 음절·겹받침 낱 값, 감사, 검수 시트 → 사용자 승인 → 기준선.
3. **원칙 경고**: §5(D5 답에 따라).
4. **모든 글꼴의 같은 편집**: §7 보정 변수·새 범위 두 개, §8 저장 두 갈래(작업실). 기본 출력은 바뀌지 않는다(보정 변수의 기본값은 효과 없음).

## Decision Points
- (끝남) D5 원칙에 어긋나는 디자인 규칙을 거부에서 경고로 — 경고로 바꾼다(사용자 2026-10-17 "기본으로 진행").
- (끝남) D6 `data-fy-layout-model` — 없앤다. 모양이 밝히는 원칙은 `FontKku.layoutProfiles[id].rules`로 읽는다(사용자 2026-10-17 "기본으로 진행").
- 병합 전 목록: 사라지는 공개 표면(§6), 정적 렌더러 출력 변화, 새 계층 두 개의 이름, §7 새 보정 변수 이름.
- (끝남) 2단계 병합 전 목록 — 여섯 모두 기본값대로(사용자 2026-10-17 "진행"): ① 새 나누기의 모양 값(전후 시트), ② 합친 노드 안 자모를 낱 자리로(통짜·낱이 그림으로 같아진다, 기본값: 그대로), ③ 나누기 차례의 tune 계층 표면(글꼴 레벨 이름, 코어 CSS가 고정 모양에서 비운다), ④ 공개 표면 더함(`FontKku.layoutProfiles[id].splits`, 역할 `head`, 둘째 shape 블록), ⑤ 크기·속도(런타임 gzip +9KB·코어 CSS +8KB, 예산 124·28KB, 기기 글꼴 1,000자 그리기 약 +25% — 새 나누기 노드에만 표시 속성을 붙여 줄이는 안은 고르지 않았다), ⑥ 정적 렌더러는 승인 뒤 이식.
- (끝남) 사람 교정을 저장하는 자리(PLAN-STUDIO-001 D3) — 철회. 세벌식도 다른 글꼴과 같은 글꼴 파일(§3)이고, 저장은 새 글꼴 / 이 글꼴 그대로 두 갈래(§8, 사용자 동의 2026-10-17).

## Related Documents
- Plan: [PLAN-STUDIO-001](../PLAN/composition-modes-and-human-review.md)
- ADR: [ADR-017](ADR-017-composition-axes-and-themes.md), [ADR-024](ADR-024-hangul-principle-rendering.md), [ADR-025](ADR-025-hangul-composition-design.md), [ADR-026](ADR-026-sebul-fixed-layout.md), [ADR-027](ADR-027-static-element-face.md), [ADR-028](ADR-028-sebeol-cases-and-jikgyeol.md)
- Architecture: [작업실](../ARCHITECTURE/font-studio.md), [렌더러 계약](../ARCHITECTURE/renderer-contracts.md)
- 노트: [자모 깊이 축](../NOTES/depth-axis.md), [세벌식 짜임 배치](../NOTES/sebeol-cases-adr028.md), [작업실 검토](../NOTES/studio-direct-manipulation-review-2026-10-16.md)
- 용어: [용어집](../GLOSSARY.md) "글꼴을 짓는 체계"

## Change Log
- 2026-10-18: §7 4단계 '두 범위는 기존 보정 자리에 쓴다 … 새 공개 변수는 없다'를 [ADR-035](ADR-035-scope-ladder.md)가 대신한다 — 네모꼴의 같은 짜임·이 글자만은 `--fy-case-*`·`--fy-syl-*`, 세벌식 '이 자모 어디서나'(tune `--fy-jamo-*`), 고정 모양의 넓은 범위는 좁은 손 보정을 뺀 모양 값에서 시작
- 2026-10-16: Proposed — 사용자 결정(세벌식은 글꼴 모양 중 하나, 세벌식·직결식도 모든 나누기)으로 도장 경로 제거, 모양 값의 계층·정본·생성, 나누기 차례, 원칙을 검사로, 호환·영향 범위·단계를 적음.
- 2026-10-17: D5(경고)·D6(없앰)을 기본안대로 정함(사용자 "기본으로 진행"), 1단계 시작.
- 2026-10-17: Accepted — 사용자 승인("병합해줘")으로 1단계를 master에 로컬 병합(`15c24eb`). 병합 전 목록 다섯은 모두 기본값대로 받았다: 세 표면 없앰, 새 표면(`font-kku.shape`·`font-kku.tune`, `--fy-shape-*`, 손 보정 변수 다섯, 린트 다섯 계층 문장, `data-fy-layout`), 작업실의 세벌식·직결식 편집, 코어 CSS gzip 예산 20KB·그리기 시간 +3–15%, 정적 렌더러의 옛 이름은 남기고 다음 판에서 폐기 예고.
- 2026-10-17: 1단계 구현(브랜치 `refactor/one-engine-step1`, 병합 전). 런타임 `stampLayout`과 인라인 도장을 걷고 `build_layout_profiles.js`가 모양 값 규칙(`@layer font-kku.shape`, `--fy-shape-*` 여덟)과 받는 규칙을 생성한다. 런타임은 그림 문맥(`data-fy-draw`)·기기 글꼴 맞춤 획 넓힘·밀도 굵기 계수·원소 획 열쇠·`layoutStability`에만 정본 표를 읽는다(§2 목록 전수). `data-fy-stamp`·`--fy-stamp-*`·`data-fy-layout-model` 없앰(D6). 정적 렌더러 4언어는 그 셋을 내지 않고 `data-fy-draw`만(`spec/html-cases.json` 1.10). 작업실은 고정 글꼴 모양 노드의 위치·크기를 글꼴 CSS의 `@layer font-kku.tune`에 적는다(범위는 원칙대로 하나 — 세벌식 이 짜임의 이 자모, 직결식 이 자모). 등록부에 level tune, 린트가 tune 블록과 다섯 계층 문장을 받는다. 출력 차이 0: 11,172자 × 다섯 재료 등가 탐침 노드 36,841·획 약 33만 개 차이 0, 조립 직렬화 42개 바이트 같음(기준선 그대로), 정적·런타임 시각 정합 36/36, 시각 회귀 8/8, 일상 verify PASS. 1,000자 그리기(중앙값, 두 번): 원소 세벌식 약 890 → 910ms, 기기 글꼴 150–169 → 184ms, 직결식 845 → 920ms. 코어 CSS gzip 예산 16 → 20KB(19.5KB). 경위·함정은 [노트](../NOTES/one-engine-step1-adr030.md).
- 2026-10-17: 사용자 동의로 §3을 "다른 글꼴과 같은 글꼴 파일(계산 칸 + 손 보정 칸)"으로 고치고, §7(모든 글꼴의 같은 편집 범위·값, 엔진 공통 보정 변수, '이 짜임의 이 자모'·'이 글자만')·§8(저장 두 갈래: 새 글꼴 / 이 글꼴 그대로)을 더함. D3 철회.
- 2026-10-17: 2단계 구현(브랜치 `feat/one-engine-step2`, 병합 전). 세벌식·직결식의 통짜 모음 7·머리 음절 57·겹받침 낱 11 값을 같은 정본(`splits`)에서 짓고, 런타임이 나누기 차례(페이지 > tune > 모양 기본)대로 그린다. 합친 노드 안 자모는 낱 자리(§4). 작업실 깊이 칸이 tune 계층에 적는다. 겹침(4% 넘는 쌍 0)·가독성(18 조합)·획 굵기 감사 PASS, 스모크 `fixed-shape-splits`. 기본 출력은 그대로(코어 CSS 첫 shape 블록 바이트 같음). [노트](../NOTES/one-engine-step2-adr030.md).
- 2026-10-17: 2단계를 사용자 승인("진행")으로 master에 로컬 병합(`9f656bc`). 병합 전 목록 여섯은 모두 기본값대로 받았다: 시트의 값, 합친 노드 안 자모는 낱 자리, tune 계층의 나누기 표면, 공개 표면 더함(`splits`·역할 `head`·둘째 shape 블록), 예산 124·28KB와 기기 글꼴 그리기 약 +25%(표시 속성 안은 고르지 않음), 정적 렌더러는 뒤이어 이식.
- 2026-10-17: 2단계 정적 렌더러 이식(브랜치 `feat/one-engine-step2-static`, 사용자 승인 "위 내용대로 진행"으로 master 로컬 병합 `1efda48` — 정적 출력 변화·새 공개 이름·새 나누기 값 22 고침 모두 기본값대로). 미러에 `splits`, 원소 획 표에 통짜 모음·머리 음절·겹받침 낱자 열쇠(283 → 477 — 합친 노드 안 자리는 런타임 `fitFixedParts`를 빌려 굳힘, 런타임 정답 1.2와 값 모두 같음), html-cases 1.11. 네 언어의 글꼴을 밝히지 않은 `render_html`이 깊이 인자를 따른다(없으면 모양 기본 — 출력 그대로). 이식 중 찾은 값 짓기 차례 결함을 고침: 새 나누기 값을 기기 글꼴 획 굵기 규칙(ㅡ·ㅣ 조각을 가늘게 함) 뒤의 잉크에서 짓는다 — ㅡ 머리 음절 19자·통짜 ㅚ·ㅟ·ㅢ 값이 크기 1% 안에서 바뀜. [노트](../NOTES/one-engine-step2-adr030.md).
- 2026-10-17: 3단계 구현(브랜치 `feat/one-engine-step3`), 사용자 "다음 진행"으로 master 로컬 병합(`2b69447`) — 병합 전 목록 다섯 모두 기본값. D5대로 문맥 조건·자리 변주를 거부에서 진단으로(규칙은 지킨다, 판정은 프로파일 표 `match`·`occurrence`), `DesignErrorCode` 24 → 22·`DesignWarningCode` +2. 작업실은 원칙 안내 칸과 "원칙대로 되돌리기", 막는 칸은 통짜 합자 모음만. [노트](../NOTES/one-engine-step3-adr030.md).
- 2026-10-17: 4단계 a — 작업실 편집 범위 '이 짜임의 이 자모'·'이 글자만'을 모든 글꼴에(기존 보정 자리, 새 공개 변수 없음), 사용자 승인으로 master 로컬 병합(`338077c`). 4단계 b는 선·원 재료 획 굵기까지 함께 하기로(사용자 2026-10-17).
- 2026-10-17: 4단계 b — 자모·문맥 보정의 크기·굵기·획 두께·자르기(선·원 재료 획 굵기까지), 고정 모양 tune의 자모 보정, 사용자 "이어서 진행"으로 master 로컬 병합(`db133df`, 병합 전 목록 모두 기본값).
- 2026-10-17: 4단계 c — 사용자 "진행"으로 master 로컬 병합(`ec57e10`, 병합 전 목록 여섯(저장 형식, 사이트 같은 이름 저장 막기, 판 고정은 구간 복사로, 고친 것 옮기기 규칙, 공개 표면 더함, 저장소 파생 글꼴 구간 잠금) 모두 기본값). §8 저장 두 갈래(사용자 "파생 글꼴과 같은 꼴", "저장소 작업실에서만"). 공용 바탕 옮기기 `authoring/font-derive.js`(`@tty.link/font-kku/authoring` `Derive`), 작업실의 바탕 구간 잠금·고친 것 손 보정으로 옮기기·바탕 새 판 받기·통째로 풀어 저장, 사이트 기본에서 고친 기본 제공 글꼴의 같은 이름 저장 막기, mount 옵션 `shippedSave`. [노트](../NOTES/one-engine-step4-adr030.md).
