# ADR-025: 한글 조립 디자인 — 세 재료의 공통 해석기, 직접·조합 정책, 글꼴 팔레트

## Status
Proposed (2026-10-12) — 실행은 [리팩토링 계획](../PLAN/hangul-composition-refactor.md)이다. 단계마다 수용 기준을 넘긴 부분부터
Accepted로 바꾼다. 받아들이면 [ADR-024](ADR-024-hangul-principle-rendering.md) §5의 깊이 고정과 원형 목록을 대체한다.

## Date
2026-10-12

## Context

ADR-024(Accepted)까지 폰꾸는 기기 글꼴 배치(`sebul`·`gothic`과 파생)를 무엇으로 채울지 고르는 **재료 축**
(`data-fy-face="element|device|svg"`), 그림이 없는 자모를 찾아 내려가는 **해석 차례**(그림 → 짝 → 가획 조상 → 천지인 → 원소),
그리고 원소 재료 기본값을 갖췄다. 사용자는 그 위에 최종 설계를 따로 정리했다.
- [최종 설계 패키지 v1.0](../PLAN/ponkku-final-design-v1.0/DESIGN.ko.md): 세 모드(Primitive 3·SVG Artwork·Font Glyph), SVG와
  Font의 공통 조합 엔진, 8 → 24 → 40은 렌더러가 아니라 제작 안내, 직접 원본이 있어도 지정한 조합이 우선, 여러 글꼴을
  역할·자모·조각 단위로 섞는 팔레트, 어느 원본과 규칙에서 나왔는지 설명할 수 있는 출처 기록.
- [v1.1](../PLAN/ponkku-final-design-v1.1/DESIGN.ko.md) §25: 저장소와 대조한 의견을 받아 현행 재료 값·해석 차례·표준 잉크
  상자·뼈대를 유지하고 그 위에 정책·조립식·팔레트·기록을 더하는 것으로 고쳤다. 구현 순서는
  [v1.1 구현 계획](../PLAN/ponkku-final-design-v1.1/IMPLEMENTATION-PLAN.ko.md)의 A → F.

두 패키지는 저장소를 보지 않고 썼다(`spec/package-origin.json`의 `repositoryChecked: false`). v1.1은 대조 보고를 근거로 삼았는데,
그 보고에 부정확한 곳이 있었다. 2026-10-12 코드와 다시 대조해 고친 점을 이 ADR의 "v1.1과 다른 점"에 모았다. 패키지는 해시로
고정한 보관본이라 고치지 않는다 — 저장소의 결정은 이 ADR, 실행은 리팩토링 계획이 정본이다.

공개 상태: npm 0.1.0(`ef48fc9`)에는 재료 축도 깊이 변수도 없다. `data-fy-face`·`--fy-face`·`--fy-font-face`·`--fy-draw-depth`는
아직 공개되지 않은 표면이다.

## Decision

### 1. 세 모드와 재료 값 — 이름은 그대로, 대응만 둔다

| 설계 모드 | 재료 값(`data-fy-face`) | 한국어 이름 |
|---|---|---|
| Primitive 3 (`primitive`) | `element` | 원소 재료 |
| SVG Artwork (`svg`) | `svg` | 그림 재료 |
| Font Glyph (`font`) | `device` | 글꼴 글자 재료 — 폰꾸 "글꼴"(sebul·gothic 같은 배치 프로필)과 구분한다 |

공개 DOM·CSS 값은 바꾸지 않는다. 디자인(§2)에 모드가 있으면 그것이 재료 선택의 정본이고, 디자인 JSON의 `mode`는 설계 이름
(`primitive|svg|font`)으로 쓰고 어댑터가 재료 값으로 옮긴다. 한 자모 안의 조각만 다른 재료로 바꾸는 범용 혼합은 v1에 없다
(원소는 모든 모드의 마지막 대체로만 섞인다, §4).

### 2. 디자인 — 구조는 JSON으로 등록하고 CSS는 이름만 고른다

- `FontKku.registerDesign(name, design, { replace? })`: 검증 → 깊은 복사 → 고정. 같은 이름·같은 내용은 그대로 통과, 같은 이름·다른
  내용은 오류 `DESIGN_NAME_TAKEN` — 이름을 맡은 쪽만 `{ replace: true }`로 바꾼다. `FontKku.unregisterDesign(name)`이 등록을 지운다
  (지운 것이 있으면 true). `FontKku.designs()`는 등록된 이름을 등록한 차례로 돌려준다(`jamoSets()`처럼 새 배열). 이름 문법은 자모 세트 이름과 같은 `[a-z0-9-]`이고 CSS 전역 키워드(`inherit`·`initial`·`unset`·
  `revert`·`revert-layer`)와 예약값 `legacy`는 등록할 수 없다(`DESIGN_NAME_INVALID`). 등록·교체·지우기하면 그 이름을 쓰는 바탕 요소가
  다시 그린다(`registerJamo`와 같다) — 지우면 미등록 진단, 다시 등록하면 돌아온다.
- 교체를 `replaceDesign`처럼 따로 두지 않고 등록의 선택지로 둔 까닭: 검증 → 고정 → 다시 그리기가 한 길이라 오류·다시 그리기가 갈라질
  수 없고, "없으면 등록, 있으면 바꾸기"가 한 호출로 분명하다(따로 두면 없는 이름을 바꿀 때 무엇을 할지 정해야 한다). 기본은 엄격하게
  두어 두 스크립트가 같은 이름을 몰래 덮지 않는다. 지우기는 교체의 짝이다 — 작업실처럼 고칠 때마다 다시 등록하는 쪽은 이름 하나를
  바꿔 쓰고, 더 쓰지 않는 디자인은 지워 등록부가 늘지 않는다.
- 검증 규칙은 한 벌이다. `FontKku.validateDesign(design)`이 같은 규칙으로 오류를 모두 모아 `{ ok, errors: [{ code, path, message }] }`를
  돌려주고(던지지 않고 등록하지 않는다), `registerDesign`은 그 `errors[0]`을 던진다(TypeError에 같은 `code`·`path`). 오류 하나가 다른
  규칙을 잇달아 넘어뜨리지 않게 틀린 소스도 선언된 이름으로 보고, 오류가 난 규칙은 충돌 비교에서 뺀다. 코드는 `font-kku.d.ts`의
  `DesignErrorCode` 24개다(세벌 고정 거부는 `DESIGN_FIXED_CONTEXT`·`DESIGN_FIXED_COMPOUND`·`DESIGN_FIXED_VARIATION`).
- 고르기: 글꼴 CSS는 `--fy-font-design`, 페이지는 `--fy-design`(ADR-008의 글꼴·페이지 레벨 관례 — 페이지가 이긴다). 바탕 요소의
  계산된 값을 trim해서 읽는다.

| 계산된 값 | 처리 |
|---|---|
| 없음·빈 값 | 현행 설정(재료·`jamo-set`·글꼴 변수)을 글꼴 하나짜리 디자인으로 읽는 호환 어댑터 |
| `legacy` | 물려받은 디자인 선택을 끊고 호환 어댑터로 |
| 등록된 이름 | 그 디자인. 현행 재료 변수는 구조 선택에 다시 쓰지 않는다 |
| 문법이 틀린 값 | 진단 `DESIGN_TOKEN_INVALID`, 호환 어댑터로 그린다 |
| 미등록 이름 | 진단 `DESIGN_NOT_REGISTERED`, 호환 어댑터로 그린다. 주소·스크립트를 저절로 받지 않는다 |
| 디자인을 받지 않는 글꼴의 바탕 요소 — 그림 자소 재료, 표준 잉크 상자(`--fy-font-ink-boxes`)를 밝히지 않았거나 페이지가 `--fy-ink-boxes: none`으로 끈 글꼴 | 진단 `DESIGN_UNSUPPORTED_FONT`, 지금 설정으로 그린다(전에는 말없이 무시했다). 이름 문법이 틀리면 `DESIGN_TOKEN_INVALID`가 먼저다. 등록·교체가 바꾸지 못하므로 다시 그리지 않는다 |

- 갱신: 처음 계산 + 기존 `FontKku.refresh(target)` + 기존 관찰 경로(속성·글꼴 CSS 로딩)뿐이다. `--fy-design`은 구조를 바꾸는 값으로
  `sameStructure`가 비교한다. CSS를 아무렇게나 바꿔도 즉시 다시 조립된다는 범용 스타일 감시는 약속하지 않는다.
- CSS는 색·굵기·간격·조각 이동 같은 표현을 그대로 맡는다. 팔레트·직접/조합·조립식 선택·조각 binding은 디자인이 맡는다.
- 디자인 JSON의 출발점은 v1.1 `spec/design.schema.json`이다. 저장소 사본은 §6의 토큰 정정을 넣어 `spec/design.schema.json`으로 둔다.

### 3. 순수 해석기와 브라우저 어댑터

```text
바탕 요소의 계산된 스타일·등록된 디자인·자모 세트·글꼴 측정
  └─ 브라우저 어댑터 → 고정된 스냅샷
       └─ resolve(요청, 디자인, 정본, 스냅샷) → 조립 계획 + 필요한 재료(needs) + 출처 기록·진단
            └─ 배치(뼈대·표준 잉크 상자·굵기) → DOM 출력(지금의 hoek/element/::before) 또는 정적 HTML
```

- 해석기는 `document`·Canvas·CSSOM·`FontFaceSet`·시각을 읽지 않는다. 같은 스냅샷과 정본이면 같은 계획이다. 아직 없는 측정은
  `needs`로 돌려주고, 준비 중인 글꼴을 `missing`으로 굳히지 않는다.
- 결과 이름은 **조립 계획**(assembly plan)이다. 설계 패키지의 `RenderPlan`이라는 이름은 쓰지 않는다 — `spec/render-plan.json`
  (ADR-020)이 이미 음절 slot 표시 계획이다.
- 위치: 한 파일 설치를 지키려고 `font-kku.js` 안의 DOM 없는 구역으로 둔다. 시험과 정적 생성기를 위해 연다(이름은 계획 B2에서
  정한다). 물리적 분리(원소 전용 묶음)는 나중이다.

### 4. 정책 — `auto` · `direct` · `compose`

| method | 차례 |
|---|---|
| `auto`(기본) | 직접 원본 → 조립식(기본 또는 지정) → 승인된 같은 자모 대체 소스 → 원소 → 오류. 조립식 안의 자식도 각자 정책을 탄다 |
| `direct` | 직접 원본 → 승인된 같은 자모 대체 소스 → 오류. 분해하지 않는다 |
| `compose` | 지정 조립식 → `onComposeFailure`(기본 `error`, 명시하면 `direct`·`primitive`) |

- **호환:** 디자인 없이 그리는 지금의 `auto`는 그림 → 짝 → 가획 조상 → 천지인 → 원소 그림 → 원형 그림 → CSS 상자 차례를 그대로 낸다. 정본을
  옮겨도(계획 B1) 이 차례와 고른 그림이 바뀌면 안 된다.
- 규칙 `match`는 `jamo`·`role`·`vowelLayout`·`hasFinal`뿐이다(범용 선택자·JS 조건 없음). 소스 우선순위는 v1.1 §8.2 그대로다 —
  조각 binding > 자모+역할+문맥 > 자모+역할 > 자모 > 위 요청에서 상속 > 역할 기본 > 디자인 기본.
- `method`·`recipe`·`bindings`는 **한 묶음**이고 `source`는 따로 고른다. 더 구체적인 규칙이 조립식을 바꾸면 예전 binding을 섞지 않는다.
- 같은 구체성의 규칙이 같은 필드 묶음에 다른 값을 주면 등록할 때 충돌로 거부한다. 배열 순서로 이기지 않는다.
- 빌려 쓴 조각은 맨 위 역할을 지킨다 — 초성 ㅎ 안의 ㅗ는 중성 요청이 아니다(중성 기본 글꼴로 바뀌지 않는다).

### 5. 조립식 정본 — `spec/jamo-recipes.json`

- 조립식: `id`(전역 고유), `target`, `operation`(`add`·`double`·`compose`·`final-pair`·`place`), `parts: [{ id, jamo }]`. 한 target에
  여러 개를 두고 `defaults[target]`이 기본 하나를 가리킨다. 대안은 규칙에서 ID로 고르는 목록이고, 실행 중 차례로 시도하지 않는다.
- 위치 결합은 target × 문맥(`@cho`·`@bar`·`@jong`·머리 음절)마다 정본에 둔다:

| 방식 | 쓰임 |
|---|---|
| `stroke-set` | 대상 뼈대의 획 묶음(대부분 — ㅎ의 위/원, 짝, 겹받침, 겹모음, 가획) |
| `segment-set` | 획 안의 마디 묶음 — ㄹ을 선으로 만들 때(ㄹ 뼈대는 획 3개·마디 5개) |
| `box` | 위 둘과 맞지 않는 예외(ㅂ = ㅁ + 위로 늘인 ㅣㅣ — 세로획이 중간에서 끊기지 않는다) |

- 획 번호는 쓰기 편하게 받되 뼈대 `revision`에 묶고, 정본에는 **안정 획 ID**로 저장한다. `spec/jamo-skeletons.json`에 `revision`과
  획 ID를 더하고 생성기가 지킨다. 획 차례·필기 차례와 ID는 별개다.
- 획 묶음은 **놓을 자리의 참조**다. 원본(그림·글꼴 글자)의 획을 잘라 쓰라는 뜻이 아니다 — 원본 자모를 통째로 그 자리의 잉크
  영역에 맞춘다. 선 하나뿐인 묶음은 중심선 폭이 0이므로 대상 획 굵기를 넣은 상자로 계산한다.
- **기본은 지금 동작을 옮기고, 선 조립식 넷을 올렸다(계획 D, 사용자 승인).** 짝(`JAMO_PAIRS`)은 `double`·`compose`·`final-pair`, 가획 계통
  (`GAHOEK_PARENT`와 `strokes.json` `from`)은 `add`, 천지인은 ㅣ·ㅡ·ㆍ 조각이다. ㅎ·ㄹ·ㅂ·ㅍ의 기본은 `place` 선 조립식이다 — ㅎ = ㆍ + ㅡ + ㅇ
  (`hieut-added-lines`, 원형 8의 세 원본, 제자 계통 ㅎ ← ㆆ ← ㅇ의 `add`는 정본의 `history`가 지킨다), 이체 ㄹ = ㅡ·ㅣ 다섯(`rieul-lines`),
  ㅂ·ㅍ = ㅡ·ㅣ(`bieup-lines`·`pieup-lines` — 가획이 획 하나로 떼어지지 않아 `add`가 없다). **기본 `place`는 그릴 재료(그림 세트·글꼴)가 있을
  때만** 쓴다 — 짝·가획과 같은 조건이라 원소 재료·원소 디자인·기기 글꼴의 출력은 그대로고(ㄹ 획 셋, `data-hoek` 1·2·3), 규칙·binding이 고른
  조립식은 재료 없이도 따른다. 원형 8만 그린 세트는 ㅎ·ㄹ·ㅂ·ㅍ을 CSS 상자가 아니라 그 세트의 ㆍ·ㅡ·ㅣ·ㅇ으로 그리고, 원형 8 미리보기
  (`stagePreview`)는 규칙 없이 보이는 칸만 줄여 실제 세트와 같다. `hieut-circle-o`(ㅗ+ㅇ — 제자가 아니라 모양 재구성, ㅗ는 원형이 아니다)·
  `bieup-raised`(ㅁ + 위로 늘인 ㅣㅣ — 가장 글자 그대로의 가획이지만 ㅁ 그림을 비균일하게 맞춰 붓 세트에서 잉크 +41–51%)는 대안으로 둔다.
  상자 조각의 `box`는 요청 획의 범위에 놓는다(ㅃ·ㄼ·ㅄ 안의 ㅂ은 제 반쪽). ㆆ을 그린 세트가 ㅎ에 그 그림을 쓰려면 규칙으로 `hieut-added`를 고른다.
  검사기는 가획의 기본이 `place`면 `history`에 그 `add`를 요구하고, 이체(ㄹ)·`derivationOnly`(ㅂ·ㅍ)의 기본은 `place`만 받는다.
- `spec/strokes.json`은 획 종류·차례·제자 계통(역사)의 정본으로 남는다. 둘의 관계(획 `from`·`derivation`과 가획 조립식)는 검사기가
  맞춘다. 런타임의 `JAMO_PAIRS`·`GAHOEK_PARENT`·`DRAW_DEPTHS` 손 표는 생성 구간으로 바뀐다.

### 6. 역할·문맥 토큰 (v1.1 정정)

| 디자인 역할 | 런타임 역할(`data-fy-role`) | 그림 문맥 |
|---|---|---|
| `initial` | `choseong` | `@cho`(세로모음 짜임 `right`) · `@bar`(가로모음·섞임모음 짜임 `bottom`·`split-right`, 머리 음절) |
| `medial` | `jung-main` · `jung-base` · `jung-tail` · `jung-cluster` | — |
| `final` | `jong-main` · `jong-left` · `jong-right` · `jong-cluster` | `@jong` |
| `standalone` | 없음 — 지금은 자모 노드가 아니라 글자(`part="content"`) | 표준 상자 없음 |

- `cho`·`bar`·`jong`은 역할이 아니라 그림 칸의 문맥 이름이다. v1.1 `context-aliases.json`의 `jong ↔ final`은 `jongseong`
  계열 ↔ `final`로 읽는다.
- `vowelLayout`은 `right`·`bottom`·`split-right`를 쓰고, v1.0의 `vertical`·`horizontal`·`mixed`는 경계에서 바꾼다.
- **머리 음절**(`head`, 세벌 `--fy-vowel-depth: syllable`)은 초성과 중성을 한 노드에 담는다. 디자인에서는 안쪽 초성에 `initial` 규칙,
  안쪽 모음에 `medial` 규칙을 적용하는 범위 배치(v1.1 §10.6)로 다루고, 맨 위 문자열을 다시 해석하지 않는다. 규칙 찾기는 바깥 음절의
  문맥(짜임·받침 유무)을 그대로 쓰고, 자리만 재귀한다 — 원소·SVG 재료에서 런타임이 그린 뒤 그 글꼴의 받침 없는 음절(고·구·그)을 재서
  두 획 묶음(`data-fy-head-part` `initial`·`medial`)을 그 비례로 옮긴다(ADR-024 §2). 조각마다 다른 글꼴로 묶인 머리를 통째로 맞추지
  않는다(M04).
- **자모 깊이와 조립식:** 자모 깊이(`--fy-vowel-depth`·`--fy-coda-depth`)는 음절 slot에서 노드를 나누고(ㄺ → `jong-left` ㄹ +
  `jong-right` ㄱ), 조립식은 한 노드 안을 나눈다(통짜 ㄺ 안의 `left`·`right`). 조각 binding(`ㄺ.left → 글꼴 B`)은 어느 쪽으로 나뉘어도
  같은 조각에 닿아야 한다. 해석기는 slot으로 나뉜 노드를 조립식 조각 경로로 바꿔 규칙을 찾는다.
- **낱자:** 원소 재료에서도 단독 호환 자모(`ㅋ`·`ㅘ`·`ㄺ`)는 지금 기기 글꼴 글자로 그려진다(2026-10-12 확인). Primitive가 한글 글꼴
  없이 보여야 한다는 계약(P01)을 깨므로, 낱자 역할의 표준 상자·뼈대를 더하고 자모 노드처럼 그린다(계획 C).

### 7. 제작 안내 8 → 24 → 40과 원형

- 8·24·40은 작업실의 제작 목표와 진행률이다. 런타임에는 단계 분기가 없다.
- 원형 8은 훈민정음 기본자 **ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ**다. ADR-024 `origin` 목록(ㆍ 대신 이체 ㄹ)은 이것으로 바뀐다. 이미 그린 ㄹ은
  지우지 않고 여분 원본으로 둔다. 기본 24로 가며 새로 그리는 현대 자모는 17자, 확장 40은 16자를 더한다. ㆍ는 보조 원본으로 따로 센다.
- 점 문자: `spec/strokes.json`과 런타임 획 표는 점의 출처를 `·`(U+00B7)로, 설계는 `ㆍ`(U+318D)로 쓴다. 조립식·디자인의 ID는
  `ㆍ`(U+318D)로 하고, 획 표는 생성기에서 맞춘다(계획 B1).
- 원소 그림 `@dot`·`@line`·`@ring`은 ㆍ·ㅡ/ㅣ·ㅇ의 **원본 별칭**이다(`@line`은 방향 변환으로 ㅡ·ㅣ를 낸다). 세트에 직접 그린 ㆍ·ㅡ·ㅣ·ㅇ이
  있으면 그것이 먼저다 — 그 자모 조각(ㅎ의 ㆍ·ㅡ·ㅇ, ㄹ·ㅂ·ㅍ의 ㅡ·ㅣ)과 ㅣ·ㅡ에서 온 획은 그 그림이다.
- **남은 획(Option E):** 그림이 맡지 않은 획 — 가획의 더한 획(ㅋ·ㄷ·ㅌ·ㅈ·ㅊ), 점에서 온 모음 짧은 획(ㅏ·ㅗ·ㅑ …) — 은 획 하나씩
  긋는다. 세트에 그 종류의 원소 그림이 있으면 그것(출하 세트 출력 그대로), 없으면 **보이는 원형 그림**이다: 선은 ㅡ(마디마다 돌려
  놓는다), 점은 ㆍ(없으면 ㅡ), 동그라미는 ㅇ(문맥 변형이 먼저). 해석기가 보이는 칸(`cells`)으로 고른 그림 열쇠를 획 항목에 싣고
  (`planJamo` `items[].alias`), 그것도 없으면 CSS 상자다. 그래서 원형 8만 그린 세트도 CSS 상자 없이 한 손으로 보인다.
- `site/faces.html`의 "깊이" 비교는 작업실 미리보기 프리셋이 된다 — 보이는 원본 집합을 잠시 줄인 스냅샷이나 명시적 `compose` 규칙을
  같은 해석기에 넘긴다.

### 8. `--fy-draw-depth` 없애기

해석기에는 깊이 입력이 없다. 이 변수(`--fy-font-draw-depth`·`--fy-draw-depth`)는 아직 공개되지 않았으므로, **다음 공개 전에 계획 C를
끝내면 호환 어댑터 없이 지운다**(`DRAW_DEPTHS`, 타입 정의, CSS 변수 정본, 개발 도구 페이지). ADR-024를 담은 공개가 먼저 나가면
v1.1 §25.16 절차(어댑터·진단·전환 기간 뒤 제거)를 따른다.

### 9. 글꼴 팔레트 (글꼴 글자 재료)

- ADR-023 맞춤(잉크 측정 → 글자 크기 우선 맞춤)을 그대로 쓰는 `device` 재료의 확장이다. 글꼴 하나 → 역할별 → 자모별 → 조각별 차례로
  붙인다. 조각마다 글꼴 인스턴스(`family`·`weight`·`style`·`stretch`·가변축)를 가진 잎을 하나씩 낸다.
- 상태는 네 축으로 따로 둔다: 준비(pending·ready·failed), 지원 근거(declared·heuristic·verified-data·unknown), 실제 출처 확신
  (unverified·fallback-suspected·verified), 측정 품질(pixel·metrics·approximate·unavailable). `document.fonts.check()`는 글리프가
  있다는 증명이 아니다. 기준 대체 글꼴과 측정을 비교하는 추정은 `fallback-suspected` 경고까지만 낸다.
- 측정 캐시 열쇠는 인스턴스 + 글자 + 측정 크기 + 방법·환경 + 글꼴 준비 회차다. 디자인 이름으로 나누지 않고, 원본 측정과 역할별 배치를
  다른 캐시에 둔다.
- 글꼴 글자의 외곽선 추출·획 편집·필기 차례는 약속하지 않는다. 글꼴을 저절로 받지 않는다(명시한 소스만).

### 10. 출처 기록

해석기는 계획 B2부터 잎마다(또는 공유 항목으로) 다음을 남긴다: `rootJamo`·`rootRole`·`partPath`, `requestedMethod`·`selectedRecipe`·
`winningRuleIds`, `requestedSource`·`fallbackChain`·`effectiveSource`, 원본·뼈대·디자인 revision, 네 상태 축, `degradedReason`·
`diagnosticCode`. 읽는 곳은 API이고, DOM 속성은 디버그 때만 붙인다. 출처 패널·저장·시각 트리는 작업실(계획 F) 일이다.

### 11. 정적 출력 (P03)

받는 쪽 JS 없이 보이는 원소 재료 HTML은 두 길이다(2026-10-12 정정, [ADR-027](ADR-027-static-element-face.md)).

- **기본 배치(세벌 고정)는 네 언어 정적 렌더러가 직접 낸다.** 세벌 고정에서는 자모 노드의 변환이 도장 배율 하나(`scale(sx, sy)`)라
  굵기 보정(`balanceElementStrokes`)이 계산된 변환에서 재던 값이 도장 표만으로 정해진다 — "배치에 브라우저가 필요하다"는 이 배치에서는
  맞지 않았다. 생성기가 획을 런타임 문자열로 굽고(원소 획 표, 런타임 정답 `spec/element-layer.json`), 렌더러는 붙이기만 한다.
  해석기는 옮기지 않는다: 디자인 없는 원소 경로에서 해석기는 뼈대 획마다 CSS 상자 하나(`oneByOne(null)`)로 접히므로, "같은 해석
  사례를 통과한다"는 조건은 그 경로의 사례(D-PRIMITIVE-GATED)에만 걸리고 원소 획 표가 구성으로 만족한다.
- **그 밖(글꼴을 밝힌 문맥 배치·디자인·그림 세트)은 지금 JS 런타임으로 만든다** — 헤드리스 브라우저에서 그리고, 바탕 요소 DOM(인라인
  수치 변수)과 CSS를 직렬화한다(`scripts/build_static_primitive.py`). 문맥 배치의 slot 변환은 글꼴 CSS의 `:has()` 계단식에서 와서
  서버가 계산할 수 없다. 디자인을 아는 Python·Go·Rust·Ruby 이식(해석기·해석 사례 실행기)은 디자인 API가 안정되고 쓰는 곳이 생길
  때까지 미룬다.

### 12. 원문·접근성 게이트

화면에 안 보이는 `[part="sr-source"]` 노드가 읽히는 글자 하나이고(ADR-003), 그림 루트는 `aria-hidden`이다. 바탕 요소에
`aria-label`·`role`은 쓰지 않는다(2026-10-12 ADR-003 보강 — 이름을 금지하는 일반 역할에 라벨을 달던 것과 작성자 라벨을 덮어쓰던 것을
고쳤다). ㅎ·ㅃ·분해형 입력을 복사하면 원문이 나오는지, 조각이 두 번 읽히지 않는지 시험한다.

고르기와 복사(2026-10-13 ADR-003 보강): 그림은 자모 단위로 고르고 강조한다 — 런타임이 고른 것을 `data-fy-selected`로 비춰 코어 CSS가
글자 칸 띠·자모 상자로 칠한다(원소·그림 재료는 노드 글자가 화면 밖이라 브라우저 강조가 보이지 않는다). 복사는 그림이 아니라 원문이다 — 자모
일부만 고른 음절은 음절 통째, 조각 조립(ㅃ = ㅂ + ㅂ, ㅎ = ㅗ + ㅇ)·겹받침·머리 음절도 원문 글자 하나, 빈칸·줄바꿈은 원문 그대로, NFC.

### 13. 기준선과 의도된 변경

계획 B(정본 옮기기·해석기·등록)는 **출력이 바뀌지 않아야** 통과한다 — HTML 정합, 시각 기준선, 겹침·획 굵기 감사, 재료 비교 페이지가
같다. 계획 D(원형 8·선 조립식)처럼 모양이 바뀌는 일은 바뀐 이유와 전후 시트를 붙여 승인받은 차이로 기록하고, 기준선을 통째로 다시
만들지 않는다. HTML 계약은 두 층이다 — 기존 화이트리스트 직렬화 정합(`spec/html-cases.json`, 원소 노드는 빠진다)과, 새 조합의 의미
계약(소스·조각 ID·좌표, 해석 사례).

## v1.1과 다른 점 (저장소 대조, 2026-10-12)

| v1.1 | 이 ADR | 근거 |
|---|---|---|
| `context-aliases`: 네이티브 역할 `jong ↔ final`만 확정 | 역할은 `choseong`·`jung-*`·`jong-*`(+`head`), `cho`·`bar`·`jong`은 그림 문맥(§6) | `data-fy-role`, `RENDER_ROLES`(생성 구간) |
| 조각 위치 `stroke-set`·`box` | `segment-set` 추가(§5) | ㄹ 뼈대: 획 3개(ㄱ꼴·ㅡ·ㄴ꼴)에 마디 5개 |
| `hieut-added-lines`의 `cap`이 ㅣ | 첫 획은 점 — ㆍ이거나 대상 획 방향을 따른다(§5) | `strokes.json` ㅎ: `dot`(ㅎ) · `h`(ㆆ) · `ring`(ㅇ) |
| 점 = ㆍ | 획 표의 `·`(U+00B7)와 맞춘다(§7) | `HOEK_TABLE`의 천 획 `dot ·` |
| 카탈로그 기본 ㅎ = `hieut-circle-o` | 기본은 ㆍ + ㅡ + ㅇ(`hieut-added-lines`, 계통은 `history`의 가획), ㅗ+ㅇ은 대안(§5) | 원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)이 ㆍ·ㅡ·ㅇ을 그린다, `GAHOEK_PARENT` ㅎ ← ㆆ ← ㅇ, ㅗ는 원형이 아니다 |
| `--fy-draw-depth`는 공개 입력이라 어댑터로 한시 유지 | 아직 공개 전 — 다음 공개 전이면 바로 지운다(§8) | npm 0.1.0에 재료·깊이 표면 없음 |
| 접근성은 `aria-label`·`aria-hidden`뿐이라 미완 | `sr-source` 노드가 읽히는 글자 하나다. 바탕 요소 `aria-label`은 쓰지 않는다(§12, 2026-10-12) | ADR-003, `setHostContract`·`releaseLegacyLabel` |
| `--fy-design`만 | 글꼴 레벨 `--fy-font-design`도(§2) | ADR-008 레벨 관례 |
| `RenderPlan` | 조립 계획(§3) | `spec/render-plan.json`(ADR-020)과 이름 충돌 |
| (없음) | 자모 깊이(slot 분해)와 조립식(노드 안 분해)의 대응(§6) | `jong-left`/`jong-right`, `jung-base`/`jung-tail` |
| (없음) | 낱자가 원소 재료에서도 기기 글꼴 글자(§6) | 2026-10-12 확인: `ㅋ`·`ㅘ`·`ㄺ`이 `part="content"` 글자 |

## Alternatives Considered

### 공개 값을 설계 이름(`primitive`·`font`)으로 바꾸기
- 장점: 설계 문서와 이름이 같다.
- 단점: `font`가 폰꾸 "글꼴"(배치 프로필)·`--fy-font-*` 레벨 접두사와 겹친다. 문서·시험·타입을 바꾸는 비용에 비해 사용자 이득이 없다.

### 구조 설정도 CSS 변수로
- 장점: 지금처럼 CSS 하나로 다룬다.
- 단점: 조각 binding(`ㅃ.right → 글꼴 B`)·규칙 우선순위·충돌 검사를 변수로 표현할 수 없다. 선택만 CSS로 남겼다.

### 모드마다 렌더러, 단계마다 깊이
- 장점: 경로가 단순해 보인다.
- 단점: 같은 조립식·배치를 세 번 만든다. 8·24·40은 원본 목록의 차이일 뿐이라 해석기는 원본이 몇 개든 같아야 한다.

### 패키지 카탈로그를 그대로 실행 정본으로
- 장점: 바로 쓸 수 있어 보인다.
- 단점: 좌표가 없고, 기본 매핑(ㅎ = ㅗ+ㅇ)을 쓰면 지금 출력이 바뀐다. 관계 검토 자료로 두고 정본은 저장소 뼈대에 결합해 새로 만든다.

## Consequences

### Positive
- 원소·그림·글꼴 글자가 한 해석기와 한 배치를 쓴다. 그림 세트가 8자든 13자든 40자든 같은 경로다.
- 있는 원본도 조합으로 바꿀 수 있고(ㅃ = ㅂ + ㅂ), 글꼴을 조각 단위로 섞을 수 있다. 어느 원본과 규칙에서 나왔는지 기록으로 설명된다.
- 손으로 쓰던 짝·가획 표와 깊이 표가 정본 생성물이 되고, 해석 사례로 다른 언어 이식의 기준이 생긴다.
- 원소 재료가 낱자까지 그리면 한글 글꼴 없는 기기에서 `ㅋㅋ` 같은 낱자도 보인다.

### Negative
- 해석이 한 단계 늘어 렌더 비용이 오른다(캐시로 줄인다). 런타임 크기도 는다(예산은 참고값).
- 디자인 JSON이라는 새 표면을 배워야 한다. 디자인 없이 쓰는 지금 방식은 그대로 돈다.
- 글꼴 팔레트는 기기마다 결과가 다르고, 글자 출처를 브라우저에서 증명할 수 없다.

### Risks
- 정본 옮기기가 해석 차례를 미묘하게 바꿀 수 있다 — 출력 무변경 기준선과 해석 사례로 막는다.
- 조각 binding이 slot 분해와 조립식 분해 양쪽에서 같은 조각을 가리키지 못하면 규칙이 깊이에 따라 다르게 걸린다.
- 섞은 글꼴의 굵기·폭이 달라 가독성이 떨어질 수 있다 — 자동 보장하지 않고 미리보기·경고로 다룬다.

## Related Documents
- Design: [최종 설계 v1.1](../PLAN/ponkku-final-design-v1.1/DESIGN.ko.md)(§25 구현 정합), [v1.0](../PLAN/ponkku-final-design-v1.0/DESIGN.ko.md),
  [한글 원리 렌더링 설계안](../PLAN/hangul-principle-rendering.md)
- Plan: [한글 조립 디자인 리팩토링 계획](../PLAN/hangul-composition-refactor.md)
- ADR: [ADR-024](ADR-024-hangul-principle-rendering.md), [ADR-023](ADR-023-device-face-fit.md), [ADR-020](ADR-020-rendering-boundaries-and-recovery.md),
  [ADR-018](ADR-018-stroke-depth.md), [ADR-013](ADR-013-vector-jamo.md), [ADR-008](ADR-008-font-contract-v2.md), [ADR-003](ADR-003-accessibility-contract.md)

## Change Log
- 2026-10-13: §12 고르기와 복사 — root `user-select: none`(10-12)을 런타임이 그린 root에서 풀고 자모 단위 선택·강조와 원문 복사를 런타임이
  맡는다([ADR-003](ADR-003-accessibility-contract.md) 2026-10-13). 정적 HTML은 그대로 원문만 복사된다
- 2026-10-13: §12 세 브라우저 검증 보강 — WebKit 두 겹 강조(바탕 요소 `::selection`), 같은 원문 다시 그리기의 선택 끝 지키기, 두 번·세 번
  누르기의 낱말·문단 고르기([ADR-003](ADR-003-accessibility-contract.md) 2026-10-13)
- 2026-10-12: F 작업실(PLAN-HANGUL-001 F0–F10, 사용자 승인 "모두 진행") — §10의 출처 패널·저장은 작업실이 맡는다: 출처 패널은 기록(`traceOf`)과
  디자인 JSON으로 다섯 질문에 답하고(Q3 규칙 풀이는 해석기의 규칙 고르기를 작업실에 옮긴 거울 — Node·스모크가 기록 rules와 대조), 저장은 디자인
  묶음(`font-kku-design-bundle` v1, `spec/design-bundle.schema.json`, 글꼴 파일 없음)이다. 시각 트리는 따로 만들지 않았다(다섯 답이 대신한다).
  잠금은 `editor.locks`로 확정 — `validateDesign`·정규화가 `editor`를 보지 않아 참가자 대안은 쓰지 않았다. §7의 "작업실 미리보기 프리셋"은
  그리기 탭의 문장 미리보기 둘(지금 디자인 / 원형 8만 — 보이는 칸을 줄인 임시 이름)이다. 런타임·렌더 출력은 그대로이고, 만들지 않은 것:
  위 자모를 따라가는 조각 보정(§5.5, 떼어 낸 독립 SVG에서만), 글꼴 낱자 → SVG(§9 — 외곽선 추출은 약속하지 않는다), 세벌 고정의 자모별 크기·자리
- 2026-10-12: 디자인 JSON `editor.locks = [{ jamo, role?, part? }]`(작업실 잠금, 설계 v1.2 §13.6) — `spec/design.schema.json`·`font-kku.d.ts` `DesignLock`에 더했다. `editor`는 그리기에 쓰지 않는다(정규화가 보지 않고 revision만 바뀐다). 작업실 규칙 모델(PLAN-HANGUL-001 F1)이 쓰는 규칙 이름 `pick-<역할|any>-u<16진>`·`mix-<역할>-u<16진>`은 런타임 규칙 id 문법 안이다
- 2026-10-12: §3 "물리적 분리는 나중"의 경계를 지금 지킨다(설계 v1.2 §15.4) — `scripts/element_edition.js --check`가 원소 판(자르는 자리 10곳, 매니페스트 `scripts/element-edition.json`)에 Canvas·FontFace·SVG 준비가 남지 않음을, 스모크 `element-boundary`가 원소 바탕 요소의 실제 호출 0을 본다. 원소 판은 배포하지 않고 크기만 보고한다(52,761 vs 78,329 B gzip). 배포 여부는 그대로 나중
- 2026-10-12: §11 정정 — 기본 배치(세벌 고정)의 원소 획은 브라우저 없이 정해져 네 언어 정적 렌더러가 직접 낸다([ADR-027](ADR-027-static-element-face.md),
  원소 획 표·`spec/element-layer.json`). 정적 렌더러 이식 조건 "같은 해석 사례"는 디자인 없는 원소 경로(D-PRIMITIVE-GATED)에만 걸리고, 디자인을
  아는 이식은 디자인 API가 안정되고 쓰는 곳이 생길 때까지 미룬다
- 2026-10-12: §2 `FontKku.designs()` — 등록된 디자인 이름 목록(`jamoSets()`와 같은 꼴, 지운 이름은 빠진다). 타입·ESM 내보내기·설명서 API 표
- 2026-10-12: §6 머리 음절 — 규칙은 바깥 음절 문맥, 자리는 그 글꼴의 받침 없는 음절을 잰 범위 배치(ADR-024 §2 `fitHeadSyllables`,
  `data-fy-head-part`). 해석 결과(`traceOf` 요청 ㄱ initial·ㅗ medial horizontal)는 그대로
- 2026-10-12: F 런타임 디자인 API(§2) — 검증 규칙 한 벌에서 오류 전부를 모으는 `FontKku.validateDesign`(코드 24개, `registerDesign`은
  첫 오류를 같은 `code`·`path`로 던진다), 교체 `registerDesign(name, design, { replace: true })`와 지우기 `unregisterDesign(name)`(따로 된
  `replaceDesign`이 아니라 등록의 선택지 — 까닭은 §2), 받지 않는 글꼴의 바탕 요소 진단 `DESIGN_UNSUPPORTED_FONT`(`data-fy-design-status`·
  `fontInfo`·`traceOf`). 해석 사례 F 6건(Node 4·browser 2). 작업실 디자인 패널이 이것을 쓴다 — 오류를 모두 코드·한국어로, 이름 하나
  `studio-design`을 바꿔 써 등록부가 늘지 않고, 받지 않는 글꼴은 런타임 진단을 읽는다(추론 없앰). 0.1.1에 든다
- 2026-10-12: §7 남은 획(Option E, 사용자 승인 "모두 진행") — 원소 그림이 없는 종류의 남은 획을 세트의 보이는 ㅡ(돌려)·ㆍ·ㅇ으로 긋는다.
  해석기가 고른 열쇠를 획 항목에 싣는다(`planJamo` `items[].alias`). 원형 8만 그린 필기·둥근·붓 대역(240자, gothic)의 CSS 상자 964 → 0,
  잉크 0.94–1.07배(필기)·0.93–1.09배(둥근)·0.73–0.98배(붓 — 칠 세트라 제 획 굵기로 가벼워진다). 음절 안 자모 쌍 겹침 > 0.15는 새로 하나
  (둥근 gothic 홫·횇의 ㅘ × 받침 ㅊ 0.146 → 0.170 — 출하 세트의 원형 8 미리보기가 이미 그리는 값과 같고, 원인은 gothic 짜임의 ㅘ + ㅊ 받침).
  원소 그림을 둔 세트·원소·기기 출력은 그대로(조립 기준선 42/42)
- 2026-10-12: F 첫 조각(작업실) — 글꼴 작업실의 디자인 패널: 시작 선택지 셋(선·원 / 직접 그려 / 기존 글꼴), 기본 1.2 세벌 고정 디자인,
  대표 비교 칸, 배치·문맥 규칙 탭·충돌 처리, 디자인 JSON 칸·열기·저장(`<id>.design.json`)·페이지용 코드, 프로젝트·초안의 `design`,
  사전 검사(registerDesign 오류의 줄·칸, 그림 세트 진행률, 글꼴 `identity`·`measurement` 집계), 출처 한 줄(§10의 기록). 런타임은
  바꾸지 않았다 — 오류 전부를 모으는 `validateDesign`, 교체 `replaceDesign`, 받지 않는 글꼴 진단 `DESIGN_UNSUPPORTED_FONT`는 후속이다.
  규칙·binding·조립식 비교 화면, SVG 8 → 24 → 40 그리기 흐름, 팔레트 매트릭스, 그림 묶음은 F에 남았다
- 2026-10-12: §5 계획 D 결정(사용자 승인) — ㅎ·ㄹ·ㅂ·ㅍ의 기본을 선 조립식(`hieut-added-lines`·`rieul-lines`·`bieup-lines`·`pieup-lines`)으로,
  ㅎ의 가획(`hieut-added`)은 정본 `history`로. 기본 `place`는 그릴 재료가 있을 때만(원소·기기 글꼴 출력 그대로), `stagePreview` 원형 8의 선 규칙을
  지웠다. `hieut-circle-o`·`bieup-raised`는 대안으로 두고, `bieup-raised`가 짝 안에서 겹치던 상자 자리를 고쳤다. 조립 기준선은 svg element·origin
  18개 설정만 바뀜(승인 — 원형 8은 ㅎ만, element는 ㅎ 점이 `@dot` 그림 조각·ㄹ 조각 3 → 5)
- 2026-10-12: 최종 설계 v1.2의 배치 계약은 [ADR-026](ADR-026-sebul-fixed-layout.md)으로 — 디자인 형식에 `version: "1.2"`와 `layout { profile, revision }`(1.2는 필수, 세벌 고정이면 문맥 규칙·자리 변주 거부)을 더했다
- 2026-10-12: §9 구현 — 글꼴 팔레트(역할·자모·조각별 글꼴, 조각은 `[part="leaf"]` 잎), 기록의 `identity`(unverified·fallback-suspected)·`measurement`.
  F01–F07 스모크(macOS Chromium). WebKit·Android 확인은 남았다
- 2026-10-12: §7 구현 — `spec/authoring-stages.json`, 원형 8(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ) 미리보기 `FontKku.stagePreview`(그림 없는 ㄹ·ㅂ·ㅍ은 선 조립식), 제작 진행 `FontKku.authoringProgress`
  (그린 ㄹ은 extra, ㆍ는 helper), 기본 제공 세트의 ㆍ 칸. 대안 조립식을 기본으로 올리는 일은 하지 않았다(사용자 결정)
- 2026-10-12: §11 정적 출력 — `scripts/build_static_primitive.py`, JS를 끈 화면이 실시간 렌더와 화소까지 같다(sebul·gothic). P02(코어 CSS에 삼각 함수 없음) 시험
- 2026-10-12: §12 복사 — 관리 root `user-select: none`으로 복사하면 원문만 나온다(전에는 자모 조각 글자가 섞였다). 일반 역할의 `aria-label` 정리는 네 언어
  정적 렌더러와 HTML 정합 계약을 함께 바꿔야 해서 남겨 두었다
- 2026-10-12: §6 낱자 구현 — 표준 상자·뼈대에 호환 자모 51(곧은 꼴), 원소·그림 재료의 `part="content"` 낱자에 `data-fy-standalone`과 획 묶음
- 2026-10-12: §8 실행 — 깊이 고정 `--fy-draw-depth`·`--fy-font-draw-depth`와 `DRAW_DEPTHS`를 없앴다(공개 전, 어댑터 없음). 같은 미리보기는 디자인 svg 소스의 보이는 칸
  `cells`로 한다 — 조립 기준선의 깊이 36개 설정을 `cells` 디자인으로 그려 같음을 확인한 뒤 지웠다
- 2026-10-12: 구현 B3 — `place` 조립식(조각마다 `at.strokes`·`at.segments`·`at.box`, 획 ID는 `spec/strokes.json` 종류 + 같은 종류 차례 번호를 생성기가
  획순 번호로 컴파일)과 대안 6개(`hieut-circle-o`·`hieut-added-lines`·`rieul-lines`·`pieup-lines`·`bieup-lines`·`bieup-raised`), 점(ㆍ)의 `@dot` 별칭.
  요청이 획 표·번호를 들고 다녀 짝 조각 획의 `data-hoek*`가 맞게 됐다(svg element·origin 깊이만 바뀐 승인된 변경)
- 2026-10-12: 구현 B1·B2 — 조립식 정본 `spec/jamo-recipes.json`(생성기 `scripts/build_jamo_recipes.js`, 순환 거부), 해석기·디자인 등록·CSS 선택·
  기록 API(`registerDesign`·`planJamo`·`traceOf`, 실험), 해석 사례 `spec/resolver-cases.json`. 디자인이 없을 때 출력은 그대로다(조립 기준선 42/42).
  §2–4·§6·§10은 구현했고, 위치 결합(§5)·낱자(§6)·원형(§7)·깊이 제거(§8)·팔레트(§9)는 다음 단계다
- 2026-10-12: Proposed — 최종 설계 v1.1을 받아들이고 저장소 대조 정정(역할 토큰, 마디 묶음, ㅎ 첫 획, 점 문자, 기본 조립식, 깊이 변수
  공개 여부, 접근성 현황, 글꼴 레벨 선택, 조립 계획 이름, 자모 깊이 대응, 낱자)을 더했다.
