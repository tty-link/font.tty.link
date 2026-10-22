# font-kku · DOM and Surface Contract

`font-kku` skill 내부에서 브라우저 런타임의 안정 계약을 볼 때 기준으로 쓰는 문서다. 외부 아키텍처 문서 없이도 host 옵션, 생성 DOM, `part`, `data-fy-*`, placement token, CSS 책임 분리를 확인할 수 있게 요약한다.

## 1. Runtime file map

- `font-kku.js` — 텍스트 분해, topology 계산, DOM 렌더링, text mode, JS API
- `font-kku.css` — 공통 runtime base CSS. host/line/word/glyph layout, slot dispatch(생성 marker 구간), cluster transform, animation hook. 코어 규칙은 cascade layer 밖에 있다
- `font-kku.mjs` — 빌드 없는 ESM 진입점. `font-kku.js`를 side-effect import하고 같은 API를 default/named export
- `spec/css-variables.json` — 공개 CSS variable와 slot status/type/default registry
- `scripts/check_css_contract.js` — registry ↔ base CSS/runtime/sprite/spec/Font Studio/문서 drift guard와 dispatch·studio slot marker codegen
- `profiles/*.css` — font CSS. 실제 비율, 위치, optical tuning 값

핵심 원칙:

- 구조는 runtime이 책임진다.
- 모양은 font CSS가 책임진다.
- 시각 문제는 먼저 font CSS / host 사용 패턴으로 해결한다.
- `font-kku.js`는 안정 surface 자체가 부족할 때만 건드린다.

## 2. Host modes and option surface

### 2.1 Host modes

- custom element: `<font-kku ...>`
- decorator: 기존 요소에 `class="font-kku"` + `data-*`

### 2.2 읽는 입력 옵션

| 의미 | Custom element | Decorator | 기본값 |
|---|---|---|---|
| font | `font` | `data-font` | `sebul` |
| profile | `profile` | `data-profile` | compat alias only |
| size | `size` | `data-size` | `24px` |
| spacing | `spacing` | `data-spacing` | 없음 |
| wrap unit | `wrap-unit` | `data-wrap-unit` | `word` |
| animate | `animate` | `data-animate` | 없음 |
| seed | `seed` | `data-seed` | 없음 |
| stroke depth | `stroke-depth` | `data-stroke-depth` | 없음(`jamo`) — §3.4, 페이지 CSS `--fy-stroke-depth`로도 고른다(속성이 이긴다) |

중요:

- 새 문서와 새 작업은 `font`를 쓴다. `profile`은 하위 호환 alias다.
- **옵션 우선순위 계약**: attribute(또는 `data-*`)가 지속 옵션 소스다. `refresh()`/재렌더는 매번 attribute를 재독하므로 attribute/`data-*` 변경이 즉시 반영된다. JS 옵션(`render`/`refresh`의 `options`)은 해당 호출 1회에만 적용된다. 같은 호출 안에서는 JS 옵션 > attribute > 기본값. `seed="auto"/"random"`은 렌더마다 새 값.
- font 이름의 deprecated alias(`default`/`classic`→`sebul`, `gothic2`→`gothic`)는 런타임(JS)이 정규화해 `data-fy-font`/`data-fy-profile`에 기록한다. 사용자가 쓴 원본 attribute/`data-*`는 건드리지 않는다.
- font 이름과 alias는 앞뒤 공백을 떼고 **ASCII 대소문자를 가리지 않는다**. canonical 출력은 소문자다(`SEBUL`→`sebul`, ` Gothic2 `→`gothic`). 미지 이름도 소문자로 접어 기록하므로(`My-Font`→`my-font`) font CSS의 게이트는 소문자 `[data-fy-font="my-font"]`로 쓴다. 빈 이름은 기본 font(`sebul`)다. `fontInfo(host).loaded`도 `--fy-font-id`를 같은 규칙으로 비교한다.
- 표현 방식은 `font` 옵션이 아니라 font CSS의 `--fy-expression-mode`가 결정한다.
- 런타임이 인정하는 정규화 expression 출력은 `sebeol` / `general` 둘뿐이다.
- `gothic`은 입력 시 `general`로 정규화되는 legacy alias다.

### 2.3 런타임이 host에 쓰는 출력 surface

- `data-fy-upgraded="true"`
- `data-fy-font-pending` (필요할 때 받기로 글꼴 CSS·자소 모듈을 받는 동안만, ADR-019)
- `data-fy-host="custom-element|decorator"`
- `data-fy-expression="sebeol|general"`
- `data-fy-vowel-depth="split|whole|syllable"`, `data-fy-coda-depth="split|whole"` (해석된 자모 깊이 두 축)
- `data-fy-font`, `data-fy-profile`
- `data-fy-size`
- `data-fy-spacing` (설정한 경우)
- `data-fy-wrap-unit`
- `data-fy-animate` (설정한 경우)
- `data-fy-seed` (설정한 경우, 해석된 숫자)
- `data-fy-material="sprite|bundled"`, `data-fy-sprite-kinds="consonant vowel [coda-cluster]"` — font의 `--fy-material`이 `system`이 아닐 때만(sprite kinds는 sprite 재료일 때만). 코어 sprite 재료 규칙의 게이트다. `system` font(sebul, gothic)에는 붙지 않으므로 사이드카 DOM 계약은 그대로다
- `data-fy-sprite-paint="mask"` — sprite font의 바탕 요소에 `--fy-sprite-paint: mask`가 걸렸을 때(ADR-014). 부분 벡터 세트에서는 누락 칸의 자소판 마스크에 적용된다. 코어 마스크 규칙의 게이트다
- `data-fy-sprite-cell` — Firefox(Gecko, 2026-10-21)와 Chromium(Blink, 2026-10-22)에서 .svg 자소판의 자모 노드에 런타임이 붙인다. `""`이면 노드가 칸 하나만 든 그림(내부 변수 `--fy-sprite-cell-image`, Blob 주소)으로 칠한다 — Gecko가 크기마다 자소판 전체를 다시 거르는 첫 그리기 멈춤을, Blink가 노드를 칠할 때마다 자소판 문서 전체(dojang은 칸마다 필터)를 다시 기록하는 비용(자모 하나 5–8ms)을 피한다. Chromium은 필터 없는 자소판도 칸으로 나누고, 칸 그림을 다 실은 뒤에 노드를 바꾸며(그동안 `"wait"`), 칠하는 규칙이 코어 CSS(Blink만 받는 `@supports (-webkit-app-region: drag)`)에 있다 — Blink는 var() 그림을 문서 출처로 실어 다른 출처 코어 CSS로도 Blob을 그리고, 아래 런타임 스타일시트·`--fy-sprite-cells`·비워 두기는 Firefox 몫이다. Firefox에서 칠하는 규칙은 코어 CSS가 아니라 런타임이 문서마다 만들어 바탕 요소의 트리(문서·그림자 루트)에 붙이는 스타일시트(`adoptedStyleSheets`)에 있다 — Gecko는 var() 그림을 그 var()를 쓴 스타일시트의 출처로 실어, 다른 출처 코어 CSS(CDN)로는 이 문서의 Blob을 싣지 못한다. 런타임은 시작할 때 문서에, 칸을 칠할 때 그림자 루트에 붙인다(Firefox에서는 `document.adoptedStyleSheets`에 처음부터 하나가 있다). 그 스타일시트가 없는 트리(페이지가 `adoptedStyleSheets`를 통째로 바꿔 뗌, 바탕 요소를 다른 트리로 옮김)의 칸 노드는 코어 CSS가 비워 둔다 — 자소판 전체를 그리면 몇 초 멈춘다. 그 스타일시트가 원문 거울에 주는 내부 변수 `--fy-sprite-cells`(1, 코어 0)가 빠지며 거울 transition이 돌아 런타임이 다음 프레임에 다시 칠하고 다시 붙인다. 런타임 출력을 복사한 마크업을 런타임 없이 Firefox에서 그리면 칸 노드가 빈다. `"sheet"`이면 필터 없는 .svg 자소판을 받은 글 그대로 Blob 그림 하나로 칠한다(자리·크기는 자소판 그대로 — Gecko가 미리 받아 둔 마스크 그림을 처음 칠할 때 두 번 기록하는 멈춤과 첫 방문 한 왕복을 피한다). `"wait"`이면 자소판을 받아 나누는 중이라 글자 그림이 비어 있다. 자소판 그림을 읽는 코드(시험·측정)는 `[data-fy-sprite-cell="wait"]`가 없어질 때까지 기다린다. 자소판을 받지 못하거나(CORS·CSP — 그때 Firefox 콘솔에 오류가 남는다: CORS는 자소판마다; CSP는 img-src가 blob:을 막으면 .svg 자소판이 있는 문서마다 한 줄, connect-src가 받기를 막으면 필터 없는 것까지 .svg 자소판마다 한 줄이고 CSP 보고 주소가 있으면 줄마다 보고) 규약이 아니면 붙지 않고 자소판 그대로다. Trusted Types(`require-trusted-types-for 'script'`)를 거는 페이지에서는 런타임이 자소판 글을 제 정책 `font-kku`로 DOMParser에 넘긴다 — `trusted-types` 허용 목록이 그 이름을 빼면 문서마다 위반 한 번에 자소판 그대로다. 칠한 뒤 페이지 CSS가 바탕 요소나 자모 노드의 자소판(`--fy-sprite-url`·`--fy-sprite-image`·칸 수·행)을 바꾸면 런타임이 다시 칠한다 — 코어 CSS가 Gecko·Blink에서 원문 거울(`[part="sr-source"]`)에 그 변수들의 짧은 transition을 `!important`로(그리는 것 없음 — `* { transition: none !important }` 재설정도 이긴다), 자모 노드의 `::after`(가장 낮은 코어 층 `font-kku.font`·특이성 0, transition은 그림 자소판 글꼴의 모든 자모 노드에, 칸 노드는 빈 content도 — 모두 층 안 `!important`, 층 밖 페이지 규칙은 `!important`도 진다)에 자소판·행 변수의 transition을 걸어 알린다 — 노드 자신의 transition은 건드리지 않아 페이지·fx·움직임 줄이기 transition이 층 차례와 상관없이 그대로 돈다. 이 transition 사건(`--fy-sprite-*`)은 런타임이 그린 바탕 요소에서 붙잡아 멈춘다 — 페이지의 버블 처리기에 닿지 않는다(문서·창의 캡처 처리기에는 닿는다; 런타임 출력을 복사한 마크업을 런타임 없이·늦게 그리면 원문 거울 사건이 바탕 요소마다 한 번씩 닿는다). 거울이나 칸 노드 `::after`의 transition이 돌지 않으면(층 안 `!important` 재설정이 거울을 덮음, font-kku보다 먼저 밝힌 페이지 층이 자모 `::after` transition을 덮음, 거울을 숨김, Firefox 128 이하) 칸을 쓰지 않는다 — 그런 재설정이 칠한 뒤에 걸리면 — 움직임 줄이기 설정이 바뀐 것은 런타임이 다시 칠해 따라간다 — 클래스·속성으로 건 것은 다음 렌더까지 바탕 요소·노드 자소판 바꿈을 놓친다. 바탕 요소 안 부분(root·line·glyph)을 숨긴 동안 노드에 건 바꿈도 다시 보일 때 놓친다. 페이지가 Firefox·Chromium 그림 자소판 글꼴 자모 `::after`에 준 transition은 감시 값으로 바뀐다(칸을 쓰지 않는 pilgi·pixel·butgeul·dunggeun 자모도), content는 칸 노드만. 인쇄 매체에서는 칸을 끄고 자소판 그대로 그린다
- `data-fy-material="vector"`, `data-fy-jamo-set="<name>"` — sprite font에 `jamo-set`이 걸리고 그 자모 세트가 등록돼 있으며 자소판 칸 계약(`frame: "sprite"`, 기본)일 때(ADR-013). 실제 SVG가 있는 노드에만 `data-fy-vector-cell`이 붙고 벡터 규칙이 적용된다. 없는 칸은 기반 자소판을 유지한다. 등록된 칸의 노드마다 `<svg part="vector" data-cell="r<행>-<자모>" viewBox="0 0 100 100" aria-hidden="true">`가 붙는다
- `data-fy-jamo-set-status="JAMO_SET_FRAME_MISMATCH"` — 걸린 세트를 이 재료가 쓰지 못했다: 그림 자소 재료에 칸 계약 세트(`frame: "box"`), 또는 표준 잉크 상자 글꼴에 자소판 칸 계약 세트. 지금 설정(자소판, 글꼴 재료)으로 그리고 까닭만 남긴다. `fontInfo(host).jamoSetStatus`도 같은 값이다. 디자인이 걸린 바탕 요소(디자인이 그림을 정한다)와 아직 등록되지 않은 세트(등록되는 순간 다시 그린다)에는 붙지 않는다(2026-10-17, 전에는 앞의 경우를 `vector`로 찍고 자소판으로 그렸고 뒤의 경우는 말없이 무시했다)
- `data-fy-look` — 바탕 요소의 class에 꾸밈(`kku-look-*`)이 있을 때 런타임이 찍는다(그릴 때와 class를 바꿀 때, 2026-10-22). 움직임 확장(`font-kku-motion.css`)의 shine이 꾸밈 갈래를 이것으로 고른다 — `[class*="kku-look-"]` 같은 class 속성 선택자 뒤에 자손 결합자가 오면 Chromium은 페이지 어디서든 class가 바뀔 때 그 아래 자모를 모두 다시 계산한다. 꾸밈 자체(`font-kku-looks.css`)는 그대로 class로 고른다
- `data-fy-glow="filter"` — 기기 글꼴 바탕 요소에 빛 칠(`--fy-font-glow`/페이지 `--fy-glow`, `none`이 아닌 drop-shadow 목록)이 걸렸을 때([ADR-021](../../../docs/ADR/ADR-021-glow-paint.md)). 코어가 자모 글자를 `::before`로 그리고 slot clip을 거기에 옮기며, 자모 노드는 글자를 숨기고(기기 글꼴 맞춤은 `::first-letter` 크기 0, 잉크 상자가 없으면 `visibility: hidden`) `filter`로 빛만 그린다. `::before`는 `--fy-ink-visibility`(기본 visible)를 따르므로, 이때 자모 하나를 숨기려면 `opacity`를 쓴다
- `data-fy-face="element|device|svg"` — 세벌·고딕 계열(기기 글꼴 재료) 바탕 요소의 글꼴이 표준 잉크 상자(`--fy-font-ink-boxes: standard`, 페이지 `--fy-ink-boxes`)를 밝혔을 때 자모를 무엇으로 그리는지([ADR-024](../../../docs/ADR/ADR-024-hangul-principle-rendering.md)). 글꼴 `--fy-font-face`(sebul·gothic·malang은 `element`, 칠만 다른 꾸러미는 `device`), 페이지 `--fy-face`가 이긴다. `fontInfo(host).face`도 같은 값이다. 글꼴 CSS는 이 값을 host 조건으로 scope `:where` 안에 쓸 수 있다 — `:where([data-fy-font="X"][data-fy-face="element"])`(글꼴 린트 `HOST_ATTRIBUTES`). 글자 칠(text-shadow·text-stroke)은 그린 획에 닿지 않으므로 칠만 다른 글꼴이 원소·그림 재료에 색과 `--fy-font-*` 칠을 따로 줄 때 쓴다. 어느 값이든 자모 노드는 표준 전진폭 `--fy-face-width`를 갖고 노드 자기 글자는 제자리에서 `::first-letter`의 글자 크기 0으로 숨긴다(밀어 두면 돌린 자모가 스크롤 영역을 늘렸다). 아래 표현은 모두 `spec/html-cases.json` 직렬화 밖의 런타임 표현층이다(생성기가 `[part="hoek"]` 아래를 건너뛴다). 네 언어 정적 렌더러는 글꼴을 밝히지 않은 호출에서 `element` 표면(host 값, 도장 노드의 `--fy-face-width`와 획, 낱자)을 런타임 문자열 그대로 낸다 — [ADR-027](../../../docs/ADR/ADR-027-static-element-face.md), 정답 `spec/element-layer.json`, `face="device"`면 뺀다.
  - `element`(원소, 기본): 자모 노드 안에 획마다 `<span part="hoek">`(획 깊이와 같은 `data-hoek*`), 마디마다 `<span part="element" data-element="line|ring">`(inline `--fy-el-*`). slot clip은 획 묶음이 받는다. 굵기 `--fy-element-width`·끝 `--fy-element-cap`(`round|butt`면 바탕 요소에 `data-fy-element-cap`)·속 빈 칠 `--fy-element-outline`·`--fy-element-fill`(그림 세트의 획·칠 색도)·자모 노드의 획 굵기 배수 `--fy-element-weight`(기본 1, 변주 굵기).
  - `device`(기기 글꼴, ADR-023): 자모 노드마다 `--fy-face-glyph`·`--fy-face-size`·`--fy-face-x`·`--fy-face-y`·`--fy-face-scale-x`·`--fy-face-scale-y`가 inline으로 붙고 코어가 글자를 `::before`로 그린다. 캔버스를 읽을 수 없으면 값이 없고 조합용 자모를 그대로 그린다.
  - `svg`(그림 세트): 바탕 요소의 `jamo-set`이 칸 계약 세트(`frame: "box"`)일 때. 획 묶음에 쓴 그림 키 `data-hoek-drawing`과 그림 상자 `<span part="element" data-element="box">`, 원소 그림을 쓴 마디에는 `data-element-drawing`이 붙고 그 안에 `<svg part="vector">`가 든다(원소 그림 `@line`·`@dot`·`@ring`, 그 종류가 없으면 세트의 원형 그림 `ㅡ`·`ㆍ`·`ㅇ` — 없으면 속성 없는 CSS 상자). 일부만 그린 셈 치기(미리보기)는 디자인 소스의 `cells`다(ADR-025 — 깊이 고정 변수는 공개 전에 없앴다).
  - 머리 음절(ADR-024 §2): `element`·`svg`에서 `syllable` 깊이의 head 노드는 획 묶음이 둘이고 각 `[part="hoek"]`에 `data-fy-head-part="initial|medial"`(안쪽 초성·모음)이 붙는다. 런타임이 그린 뒤 그 글꼴의 받침 없는 음절(고·구·그)의 초성 t·중성 m 자리를 재서 두 묶음을 그 비례로 옮긴다(`--fy-el-*`) — 재는 동안 관리 root 안에 `data-fy-probe` 음절을 잠깐 넣었다 뺀다(같은 동기 구간, 남지 않는다). 스타일만 바뀐 재해석(`restyle`)에서도 다시 잰다. `spec/html-cases.json` 직렬화 밖이다.
  - 그려지지 않은 바탕 요소(display: none 안)는 굵기 보정·머리 맞춤을 미뤘다가(ResizeObserver) 보이면 다시 하고 `font-kku:render`(`restyle`)를 낸다.
  - 낱자(ADR-025 §6): `element`·`svg`에서 음절이 아닌 호환 자모 글자(`part="content"`, ㄱ–ㅣ)에도 런타임이 `data-fy-standalone="<자모>"`를 찍고 자모 노드처럼 획 묶음을 넣는다(표준 상자 `spec/jamo-ink-boxes.json`의 낱자 51, 뼈대는 곧은 꼴 — 받침 꼴, ㄸ·ㅃ·ㅉ는 가로 모음 위 꼴). 글자는 `text-indent`로 밀어 둔다. `spec/html-cases.json` 직렬화에는 들지 않는다
  - 글꼴 팔레트(ADR-025 §9): 글꼴 글자 재료(`device`)에 글꼴 디자인(`mode: "font"`)이 걸리면 자모 노드마다 고른 글꼴을 inline `font-family`(·`font-weight`·`font-style`)로 두고, 한 노드를 조각마다 다른 글꼴이나 조립식으로 그리면 노드에 `data-fy-leaves`를 찍고 조각마다 `<span part="leaf" data-leaf-source="<소스>" data-leaf-path="<조각 경로>">낱자</span>`(inline `--fy-leaf-size`·`--fy-leaf-x`·`--fy-leaf-y`·`--fy-leaf-scale-x`·`--fy-leaf-scale-y`, 노드 `::before`와 같은 맞춤)를 넣는다. 그 노드는 `::before`를 그리지 않는다
  - 문자 매핑(ADR-032 §12): 측정이 끝난 의미 자모 노드에 `data-fy-glyph-mapped`가 붙고, 그릴 글자마다 `<span part="leaf" lang="zxx" data-fy-glyph-text="<글자>" data-leaf-source data-leaf-path>`가 든다(후보면 `data-fy-glyph-candidate`). 맞춤은 위 `--fy-leaf-*`에 회전 `--fy-leaf-rotate`(곧은 획을 따라 놓을 때)를 더한다. 가로·세로 마디로 된 자모는 글자 하나를 여러 잎으로 잘라 그린다 — 잎마다 `data-fy-glyph-slice="<0부터>"`와 inline `clip-path: polygon(…)`(글자 em)이 붙는다. 잎 수는 글자 수가 아니다. `lang="zxx"`는 일반 글꼴 낱말(`sans-serif` 등)이 측정 캔버스와 같은 글꼴로 풀리게 한다. 읽는 글은 `sr-source`다
- `data-fy-layout="<profile>"` — 글꼴 모양(배치 프로파일, [ADR-026](../../../docs/ADR/ADR-026-sebul-fixed-layout.md)·[ADR-028](../../../docs/ADR/ADR-028-sebeol-cases-and-jikgyeol.md)). 글꼴을 밝히지 않은 바탕 요소는 기본 `sebul-cases-v1`(세벌식, case-fixed), 글꼴 CSS가 `--fy-font-layout`을 밝히면 그 배치(`jikgyeol` → `sebul-fixed-v1` 직결식, fixed-three), 1.2 디자인은 자기 `layout`(디자인이 이긴다). 그 밖의 글꼴을 밝힌 바탕 요소는 지금 배치라 속성이 없다. 배치를 적지 않은 디자인은 다음 출처의 배치를 물려받고, `--fy-design: legacy`는 디자인만 끈다 — 문맥 배치는 `--fy-layout: square-context-v1`로 고른다(ADR-031, 2026-10-18). 모양의 모델(case-fixed·fixed-three·adaptive-square)은 바탕 요소에 적지 않고 `FontKku.layoutProfiles[이름].model`로 읽는다(2026-10-17 `data-fy-layout-model` 없앰, ADR-030 D6). 고정 글꼴 모양(세벌식·직결식)의 기본 자모 깊이는 `split`/`whole`(합자 모음은 조각 둘, 겹받침은 통짜)이고 페이지 깊이 변수와 글꼴 CSS `@layer font-kku.tune`의 `--fy-font-*-depth`로 통짜 모음·머리 음절·겹받침 낱을 고른다(§3.3, ADR-030 §4). 자모 노드(머리 `[part~="head"]` 포함)의 자리·크기·굵기는 코어 CSS의 모양 값 규칙(`@layer font-kku.shape`의 `--fy-shape-*`)이 이 속성·글자 칸의 짜임·자모로 골라 준다(§7) — 런타임은 노드에 값을 적지 않는다. 네 언어 정적 렌더러(`render_html`)도 글꼴을 밝히지 않은 호출(font 없음·빈 문자열, `FontDefinition` 없음)에 같은 표면을 쓴다 — host `font` 속성 없음, `data-fy-layout`은 `data-fy-coda-depth` 바로 뒤, 그 뒤 `data-fy-face="element"`와 원소 획(ADR-027). 자리는 함께 싣는 코어 CSS가 정한다. `spec/html-cases.json`의 `implicitFont` 사례가 이 표면을 정합 계약으로 고정한다(원소 층은 `spec/element-layer.json`)([언어 공통 렌더 계약](../../../docs/ARCHITECTURE/renderer-contracts.md#기본-배치세벌식))
- `data-fy-design="<name>"`, `data-fy-design-status` — 디자인([ADR-025](../../../docs/ADR/ADR-025-hangul-composition-design.md), 실험). 글꼴 `--fy-font-design`·페이지 `--fy-design`이 `FontKku.registerDesign`으로 등록한 이름을 고르면 `data-fy-design`이 붙고 재료(`data-fy-face`)·그림 세트·직접/조합 규칙을 그 디자인이 정한다(같은 페이지 레벨의 `jamo-set`·`--fy-face`보다 우선; 글꼴 레벨 디자인은 페이지 재료가 이김). 고르지 못하면 지금 설정으로 그리고 `data-fy-design-status`에 까닭을 남긴다 — `DESIGN_TOKEN_INVALID`(이름 문법), `DESIGN_NOT_REGISTERED`(미등록·`unregisterDesign`으로 지움 — 등록되는 순간 다시 그린다), `DESIGN_UNSUPPORTED_FONT`(이 글꼴은 디자인을 받지 않는다 — 그림 자소 재료이거나 표준 잉크 상자 `--fy-font-ink-boxes`를 밝히지 않았거나 페이지가 `--fy-ink-boxes: none`으로 껐다. 이름 문법이 틀리면 `DESIGN_TOKEN_INVALID`가 먼저, 등록해도 바뀌지 않는다). `fontInfo(host).designStatus`·`traceOf(host).designStatus`도 같은 값이다. 디자인을 `registerDesign(name, json, { replace: true })`로 바꾸면 그 이름을 고른 바탕 요소가 다시 그린다. `legacy`는 물려받은 선택을 끊는다. 자모 노드 DOM은 같은 꼴(`part="hoek"`·`part="element"`)이고, 어느 조각을 어느 소스·규칙으로 그렸는지는 DOM이 아니라 `FontKku.traceOf(host)`가 돌려준다
- `data-fy-stroke-depth="stroke|jamo"` — 획 깊이를 요청했을 때만(§3.4). 벡터 자소면 `stroke`, 획으로 쪼갤 수 없는 재료(기기 글꼴·자소판)면 `jamo`로 되돌린 것을 알린다
- `data-source`
- `--fy-size`
- `--fy-space-width`, `--fy-word-gap` (`spacing` 설정 시)
- `--fy-seed` (`seed` 설정 시)

decorator의 `data-font`/`data-profile`/`data-size`/`data-spacing`/`data-wrap-unit`/`data-animate`/`data-seed`는 authored 입력이며 출력이 아니다. custom element는 plain attribute가 입력이므로 기존 normalized `data-font`/`data-profile`/`data-size`/`data-wrap-unit`/`data-animate`/`data-seed` mirror를 호환용으로 추가 출력한다. CSS와 진단 도구는 host 모드에 상관없이 canonical `data-fy-*`를 읽는다.

접근성 메모:

- 관리 root(`part="root"`, `data-fy-root="true"`)에는 `aria-hidden="true"`가 붙어 분해 자소 DOM이 보조기기에서 숨겨진다.
- root의 형제 `part="sr-source"`(`data-fy-sr="true"`) 노드가 원문 텍스트를 담는 스크린리더 표면이다(시각적으로만 숨김). 런타임 없는 정적 HTML에서는 복사 표면이기도 하다 — 관리 root가 코어 CSS의 `user-select: none`이라 골라 복사하면 원문만 나온다(강조는 없다).
- 선택·복사(ADR-003 보강 2026-10-13, ADR-025 §12): 런타임이 그린 root에는 `data-fy-select="jamo"`가 붙어 자모 단위로 고른다(코어 CSS `user-select: inherit` — 페이지가 조상에 준 `none`을 지킨다, 원문 거울은 `none`, 브라우저 자체 `::selection`은 투명 — 노드 글자가 화면 밖이라 보이지 않거나 자모 상자끼리 겹친다). 런타임은 문서마다 `selectionchange`·`copy`·`cut` 듣개를 한 번 걸고(렌더 때, 그림자 트리 안 바탕 요소도 문서 듣개가 `getComposedRanges`로 본다), 프레임마다 고른 것을 `data-fy-selected`로 비춘다:
  - root `data-fy-selected="all"` — 바탕 요소 통째. 모든 글자 칸 띠와 빈칸 띠
  - 글자 노드 `"all"` — 음절(낱글자) 통째, 글자 칸 띠(`::before`, 전진폭 = 칸 너비 + `--fy-glyph-gap`이라 이웃 띠와 겹치지 않는다)
  - 글자 노드 `"part"` + 고른 자모 노드마다 `""` — 자모 일부만 고른 음절, 고른 자모 상자(`::after`, 노드 뒤 `z-index: -1`, 잉크 상자 없는 빛 칠이 노드를 숨겨도 `--fy-ink-visibility`로 보인다)
  - 빈칸 노드 `""` — 통째로 담긴 빈칸, 같은 높이 띠
  - 색은 페이지 변수 `--fy-selection`(기본 `rgb(from Highlight r g b / min(alpha, 0.6))` — 시스템 선택 색, 불투명도 0.6까지). 자모 노드에 선택 끝이 닿으면(획 위를 끌면 끝이 획 노드 안에 놓인다) 그 자모를 고른 것으로 친다. 낱글자(기기 글꼴 글자)는 글자 위치로, 줄바꿈은 두 줄에 걸칠 때
  - 끌기가 맞히는 것은 자모 노드 상자다 — 고를 수 있는 root 안에서 기기 글꼴 맞춤의 `::before`·잎(글자 em 상자, 자모 상자보다 훨씬 크다)은 `pointer-events: none`, 빛 칠 노드는 빈 `::after`가 노드 상자를 맞는다(잉크 상자 없는 빛 칠은 노드를 숨긴다)(고른 자모 상자 `::after`도 포인터를 받는다 — 막으면 고른 순간 맞는 자리가 사라져 끝 옮기기가 브라우저 끌기와 엇갈린다). 바탕 요소 안을 마우스로 누르면 끌기를 런타임이 맡는다(2026-10-19) — 누를 때, 끄는 동안(3px 넘게 움직인 뒤) 프레임마다, 놓을 때와 그 다음 프레임에 포인터 자리를 선택 자리로 바꿔 `selection.setBaseAndExtent`로 둔다: 자모 위면 그 자모, 글자·빈칸의 빈 곳이면 그 가운데를 기준으로 앞·뒤, 줄 끝 너머·줄 사이면 그 화면 줄에서 포인터 앞 마지막 글자·빈칸 뒤, 바탕 요소 밖이면 브라우저 캐럿 자리. 숨긴(visibility) 자모·그림 세트 SVG·겹친 자모 상자·열린 그림자 트리 안에서도 같다. 누르기만 하면 캐럿을 누른 자리에 두고, Shift+누르기는 있던 닻에서 늘인다. 누른 자리와 포인터가 둘 다 바탕 요소 밖이면 브라우저 선택 그대로다
  - 복사·잘라내기(편집 가능한 곳)는 같은 대응으로 클립보드에 원문을 넣는다 — 자모 일부만 고른 음절은 음절 통째, 빈칸·줄바꿈(`\r\n`·`\r`)은 원문 그대로, 음절은 NFC, 바탕 요소 밖 글은 브라우저 직렬화. 복사하는 동기 한 순간에만 root가 `data-fy-select="copy"`(`display: none`)이고 원문 거울을 골라 브라우저가 직렬화한다. `text/html`은 바탕 요소마다 고른 원문 한 줄(`data-fy-*`·`data-source`·`<font-kku>`의 `data-*` 거울·런타임 인라인 변수를 지운 껍데기, 빈칸·줄바꿈이 있으면 `white-space: pre-wrap`). 잘라내기는 일부만 고른 바탕 요소를 남은 원문으로 다시 그리고 나머지는 `execCommand("delete")`로 지운다
  - 같은 대응을 `FontKku.sourceRange(host, range)` → `{ start, end, text }`(원문 위치, NFC 글)가 돌려준다
  - 바탕 요소 자신의 `::selection`도 투명하다(코어 CSS, root가 `data-fy-select`일 때 — WebKit은 그것으로 그림 둘레 줄 틈을 칠해 띠가 두 겹이 된다)
  - 같은 원문을 다시 그리면(`refresh`, 글꼴·세트가 늦게 와 다시 그림) 옛 root 안에 있던 선택 끝을 새 root의 같은 자리(자식 차례 길)로 옮긴다. 원문이 바뀌는 다시 그리기(글 바꿈·잘라내기)는 옮기지 않는다
  - 그림 위를 두 번 누르면 그 낱말(`[part="word"]`), 세 번 누르면 문단 — `<font-kku>`는 그것을 담은 블록(코어 CSS가 바탕 요소를 `inline-block`으로 두므로 그 위 첫 블록), 꾸밈 방식은 그 바탕 요소 — 을 고른다 — 노드마다 글자가 따로라 브라우저는 자모 하나만(WebKit은 아무것도) 고른다. 페이지가 `mousedown`을 막으면(`preventDefault`, 문서 거품에서 본다) 끝 옮기기와 두세 번 누르기 고르기를 하지 않고, `button` 안과 `user-select: none` 조상 아래는 고르지 않는다. `user-select: none` 조상 아래 바탕 요소는 전체 선택이 품어도 강조·복사(`text/plain`)에서 빠진다(브라우저와 같다)
  - `data-fy-select`·`data-fy-selected`는 `spec/html-cases.json` 직렬화 밖이다(정적 렌더러는 쓰지 않는다 — 정적 HTML은 원문만 복사된다)
- 런타임과 정적 렌더러는 바탕 요소에 `aria-label`도 `role`도 쓰지 않는다(ADR-003 보강, 2026-10-12). 버튼·링크·제목의 이름은 sr-source 텍스트에서 계산되고, 작성자가 붙인 `aria-label`·`role`은 그대로 둔다. 정적 렌더러 0.1.0·예전 런타임이 붙인 호환 라벨(`aria-label` = `data-source`, `role` 없음)은 넘겨받을 때 지운다. `data-source`는 원문 기록으로 남는다(보조 기술은 읽지 않는다).
- sr-source는 `white-space: pre`라 줄바꿈·연속 공백·탭이 읽기(와 정적 HTML의 복사)에 그대로 남는다.
- state 없는 관리 DOM(clone 등)의 원문 복구는 `data-source` → `sr-source` → `textContent` 순으로 폴백한다.
- SEO/검색 보장은 별도 주장으로 확대하지 않는다.

## 3. Shipped fonts and expression modes

### 3.1 활성 font

- `profiles/sebul.css`
- `profiles/gothic.css`
- `profiles/sprite-example.css`
- `profiles/sprite-system.css` — 종성·겹받침·문맥 변형까지 포함한 6행 sprite
- 파생 글꼴: `neon`·`sticker`·`malang`·`geumbak`·`glitch`·`jikgyeol`(기반 `sebul` — `jikgyeol`은 `--fy-font-layout: sebul-fixed-v1`로 직결식 배치를 고른다), `retro`·`saekdong`·`riso`·`blueprint`(기반 `gothic`), `pixel`·`dojang`·`chalk`·`crayon`·`jasu`·`pilgi`·`dunggeun`·`butgeul`(기반 `sprite-system`). 기반 글꼴과 같은 DOM·자리·depth를 쓰고(배치를 복사했으므로) 칠·그림자·기울기·자소판만 다르다. `sidecar: false`라 사이드카 `render_html`은 지원하지 않는다
- 조합 확장(ADR-017)은 DOM을 바꾸지 않는다. 꾸밈 `kku-look-*`·변주 `kku-vary-*`는 바탕 요소의 class이고, 런타임 출력 `data-fy-material`·`data-fy-jamo-seeds`·`data-fy-font`로 갈래를 고른다(그림 자소에는 바탕 요소의 `--fy-sprite-paint: mask`로 마스크 칠 → `data-fy-sprite-paint="mask"`). 자모 움직임은 같은 `data-fy-animate` 훅, 상호작용(`font-kku-fx.js`)은 자모 노드의 인라인 `translate`·`rotate`와 바탕 요소의 `seed` 속성만 바꾼다

### 3.2 deprecated alias

- `profiles/default.css` -> `sebul`
- `profiles/classic.css` -> `sebul`
- `profiles/gothic2.css` -> `gothic`

새 작업에서는 alias CSS를 수정하지 않는다.

### 3.3 두 개의 독립 축 — expression mode와 jamo depth

폰트 선택에는 서로 **유도 관계가 없는** 두 축이 있다: 디자인 축 `--fy-expression-mode`(sebeol/general)와 메커니즘 축인 자모 깊이. 어느 한쪽이 다른 쪽을 결정하지 않는다.

자모 깊이는 다시 **서로 독립인 두 옵션**으로 이뤄진다. CSS shorthand/longhand 관례를 따른다 — 짧게 한 번에 정할 수도, 축별로 세밀하게 정할 수도 있다.

| 변수 | 값 | 결정하는 것 |
|---|---|---|
| `--fy-font-vowel-depth` / `--fy-vowel-depth` (longhand) | `split` / `whole` / `syllable` | 합자 모음(ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ): 분해 / 통짜 / 초성과 합쳐 완성형 head |
| `--fy-font-coda-depth` / `--fy-coda-depth` (longhand) | `split` / `whole` | 겹받침(11종): 분해 / 통짜 |
| `--fy-font-jamo-depth` / `--fy-jamo-depth` (shorthand) | `atomic`=(split,split) / `composite`=(whole,whole) / `syllable`=(syllable,whole) | 두 축을 한 번에. 같은 레벨 안에서는 **longhand가 이긴다** |

`--fy-font-*` 이름은 **폰트 CSS가** 선언하는 폰트 레벨이고, `font-`가 없는 이름은 **페이지 전용**이다. 해석은 `page longhand ?? page shorthand ?? font longhand ?? font shorthand ?? 기본값`이라 페이지가 폰트의 depth를 항상 이긴다(ADR-008).

공장 기본값은 (split, split) = atomic이고, **폰트별 기본값은 `spec/fonts.json`이 정본**이다. 프로필 CSS의 depth 선언은 spec과 일치해야 contract 게이트를 통과한다. 예시:

| (vowel, coda) | `과` | `봛` | `밟` | `한` |
|---|---|---|---|---|
| (split, split) = atomic | ㄱ+ㅗ+ㅏ | ㅂ+ㅗ+ㅏ+ㄹ+ㅂ | ㅂ+ㅏ+ㄹ+ㅂ | ㅎ+ㅏ+ㄴ |
| (whole, whole) = composite | ㄱ+ㅘ | ㅂ+ㅘ+ㄼ | ㅂ+ㅏ+ㄼ | ㅎ+ㅏ+ㄴ |
| (syllable, whole) = syllable | **고+ㅏ** | **보+ㅏ+ㄼ** | ㅂ+ㅏ+ㄼ | ㅎ+ㅏ+ㄴ |
| (syllable, split) — longhand 조합 | 고+ㅏ | 보+ㅏ+ㄹ+ㅂ | ㅂ+ㅏ+ㄹ+ㅂ | ㅎ+ㅏ+ㄴ |

- `vowel-depth: split` — 표현력 쪽(자모별 색·애니메이션). `whole` — 원본 합자 글리프 충실도. `syllable` — 초성+모음 base를 완성형 음절 head(`data-jamo-role="head"`)로 합치고 tail만 남긴다("과"→"고"+ㅏ). 2010년 ptext 원형이 `$jung_tmp` 분기에서 base/tail을 나누던 그 경계다.
- 고정 글꼴 모양(세벌식·직결식, `data-fy-layout`이 `sebul-cases-v1`·`sebul-fixed-v1`)도 같은 변수로 고른다(ADR-030 §4). 차례는 `page longhand ?? page shorthand ?? tune 계층 font 이름 ?? 프로파일 depth` — 코어 CSS가 shape 계층에서 고정 모양 바탕 요소의 `--fy-font-*-depth`를 비우므로 바탕 글꼴(sebul)의 font 계층 기본(syllable)은 닿지 않고, 글꼴 CSS가 `@layer font-kku.tune`의 바탕 요소 규칙에 쓴 값만 닿는다. 머리·통짜 모음 노드 안 자모는 낱으로 나눴을 때와 같은 자리에 그린다. 정적 렌더러는 아직 기본(split, whole)만 그린다.
- `syllable`은 **합자 모음 음절에서만** 동작한다. 그 외 음절은 vowel-depth와 무관하게 동일하고, 초성 slot(`t`/`tt`/`tlo`/`tlc`)을 그대로 쓴다.
- placement는 base(atomic) 표 위에 모음축 override(head/choseong/jungseong 열)와 받침축 override(jongseong 열)를 합성해 만든다 — 두 축이 서로 다른 열만 건드려 어떤 조합도 충돌하지 않는다. 정본은 `spec/tables.json`의 `placement` + `placementVowelOverrides` + `placementCodaOverrides`.

계약상 중요한 성질:

- **topology 계약은 depth와 무관하다.** `data-layout-key` 9키, `data-jung-layout`, `data-jong-layout`, `data-fy-layout-bucket`, semantic frame이 모든 depth 조합에서 동일하다. 달라지는 것은 자모 노드 개수와 `data-fy-pos` 값뿐이다.
- 합자가 한 노드가 되면 `jungseong-cluster` / `jongseong-cluster` wrapper는 생성되지 않는다 (cluster 대상 CSS는 깨지지 않고 미사용이 된다).
- `syllable`의 head 노드는 `part="jamo head"` / `data-jamo-role="head"` / `data-fy-role="head"`이고 `data-jamo`에 **완성형 음절**이 들어간다. 원소·SVG 재료에서 head 안의 초성·모음 배치는 그 글꼴의 받침 없는 음절(`t`·`m` 자리)을 따른다(`data-fy-head-part`, 위 재료 절) — 기기 글꼴 재료는 완성형 글자 그대로다. 완성형이라 자모 선택자가 없으므로 **base 모음을 `data-jamo-base`(conjoining)로 함께 노출**한다 — CSS가 ㅜ계/ㅗ계 head를 분기하는 표면이다(예: `[data-fy-pos="hs"][data-jamo-base="ᅮ"]`). 자모 테이블에 없는 값이므로 `data-jamo-index`와 sprite 매핑은 붙지 않는다 — 즉 **sprite trail은 syllable의 split 음절을 그릴 수 없다**(시트는 자모 단위다). 나머지 음절은 composite와 같으므로 sprite로 그려진다.
- 깊이와 무관한 원래 자모는 `glyph.sourceJamo`(초성·중성·종성 문자 하나씩, 합자 모음·겹받침 그대로 — 과 = ᄀ·ᅪ·없음)에 남는다. `glyph.jamo`는 나눈 결과라 깊이에 따라 바뀐다(봛: atomic ᅩ·ᅡ / ᆯ·ᆸ, composite ᅪ / ᆲ, syllable ᅩ·ᅡ / ᆲ). `glyph.display`는 실제로 그리는 노드 목록이다(syllable이면 `head`·`headBase`가 더해지고 초성이 빠진다). 원문 복구·접근성 표면(`sr-source`, `data-source`)은 depth와 무관하다.
- 런타임은 `getComputedStyle(host)`로 세 변수를 읽으므로 프로필이 선언하거나 사용자가 인스턴스 단위로 덮어쓸 수 있다. 알 수 없는 값은 각 축의 기본값(`split`)으로 정규화된다. **주의: MutationObserver는 `data-*` 속성만 관찰하므로 depth 변수를 바꾼 뒤에는 `FontKku.refresh(host)`를 호출해야 반영된다** (expression-mode와 같은 특성).
- head 옆의 tail 노드는 단일 중성이어도 `part="jamo jungseong jungseong-tail"` / `data-fy-role="jung-tail"`을 유지한다 — role-tier 폰트의 tail 스타일이 depth와 무관하게 같은 표면을 쓴다.
- text mode(`FontKku.renderText`, `bin/font-kku-text.js`, companion renderer)는 고정 2칸 격자에서 `sourceJamo`로 합자를 다시 쪼개므로 **구조상 atomic 전용**이다. depth 옵션을 받지 않는다.
- JS API의 depth 인자는 shorthand 문자열(`"composite"`)과 축 객체(`{vowel: "syllable", coda: "split"}`) 둘 다 받는다: `decomposeGlyph(char, index, depth)`, `createTextModel(text, depth)`. glyph에는 `vowelDepth`/`codaDepth`로 기록된다.

### 3.4 획 깊이 — 자모 아래 단위(ADR-018)

자모 깊이(§3.3)와 독립인 셋째 축이다. 자모 노드는 그대로 두고 **그 안의 그림을 획으로 쪼갠다** — 자모 노드의 자리·slot·역할 계약과 기존 CSS는 그대로 듣는다.

| 값 | 단위 | 예 |
|---|---|---|
| `jamo` (기본) | 자모 — 지금 그대로 | 하 = ㅎ + ㅏ |
| `stroke` | 획순대로 한 획씩 | 하 = (꼭지 · 가로 · 동그라미) + (세로 · 점) |

- 고르는 법: 속성 `stroke-depth` / `data-stroke-depth`, JS 옵션 `strokeDepth`, 페이지 CSS `--fy-stroke-depth`(꾸밈·움직임 클래스가 이것으로 켠다 — `animate="draw"`, `.kku-vary-hoek`). 속성이 CSS를 이긴다. 알 수 없는 값은 요청 없음이다.
- **벡터 자소만 쪼갠다.** `jamo-set` 세트가 그린 SVG 도형 하나가 곧 획이다. 기기 글꼴·자소판은 글리프·칸 그림을 쪼갤 수 없어 `data-fy-stroke-depth="jamo"`로 알리고 그대로 그린다.
- 획 노드: `[part="vector"]` 아래 도형마다 `part="hoek"`, `data-hoek="<자모 안 차례, 1부터>"`, `pathLength="1"`(대시 1이 획 하나 — 획순 그리기), 인라인 `--fy-hoek-index`(자모 안 차례, 0부터)와 `--fy-hoek-order`(바탕 요소 전체의 읽는 차례: 글자 순서, 한 글자 안에서는 초성 → 중성 → 받침, 자모 안에서는 획순).
- 획 정체성: 세트가 정본 `spec/strokes.json` 획순으로 그렸다고 알리면(`registerJamo` 옵션 `hoek: true`, 기본 모듈은 모두) 칸의 도형 수가 정본과 같을 때 `data-hoek-kind`(`h` 가로·`v` 세로·`hv` ㄱ꼴 꺾임·`vh` ㄴ꼴 꺾임·`lf` 삐침·`rf` 내림·`dot` 꼭지·점·`ring` 동그라미), `data-hoek-from`(그 획을 들여온 글자 — ㅋ의 둘째 획은 `ㅋ`, 첫째는 `ㄱ`), `data-hoek-letter`(획이 속한 홑자모 — ㄼ은 `ㄹ`×3·`ㅂ`×4), `data-hoek-role`(제자원리: 자음 `base` 기본자·`added` 가획·`variant` 이체, 모음 `heaven` 천·`earth` 지·`person` 인)이 붙는다. 정본과 다르게 그린 세트는 차례만 받는다.
- 획 레벨 변수(페이지 전용, 칸 단위 0–100): `--fy-hoek-dx`·`--fy-hoek-dy`(비키기), `--fy-hoek-rotate`, `--fy-hoek-scale-x`·`--fy-hoek-scale-y` — 획 제 상자 가운데를 축으로. 코어 규칙은 `[data-fy-stroke-depth="stroke"] [part="hoek"]`에만 걸린다.
- 기본(`jamo`)의 DOM은 획 깊이 이전과 바이트 같다 — 획 노드 속성은 요청할 때만 붙는다. 같은 바탕 요소에서 `jamo`와 `stroke`의 렌더는 픽셀 같다.
- 긴 글에는 권하지 않는다 — 자모 하나가 획 1–7개가 된다.

## 4. Topology and placement contract

### 4.1 topology

- `right`
- `bottom`
- `split-right`

`split-bottom`은 현재 emit되지 않는다.

### 4.2 coda / jong layout

- `none`
- `single`
- `double`

### 4.3 `data-layout-key`

정확히 9개만 나온다.

- `right:none`
- `right:single`
- `right:double`
- `bottom:none`
- `bottom:single`
- `bottom:double`
- `split-right:none`
- `split-right:single`
- `split-right:double`

### 4.4 semantic frame surface

glyph / glyph-body / cluster / jamo에는 아래 semantic frame이 노출된다.

- `data-fy-axis="right|bottom|split"`
- `data-fy-open="open|closed"`
- `data-fy-jong-count="none|single|double"`

### 4.5 layout bucket surface

구조 기반 selector가 정말 필요할 때만 보조적으로 쓴다.

- `data-fy-layout-bucket="right-open|right-closed|bottom-open|bottom-closed|split-open|split-closed"`

## 5. Stable part tokens

실제 DOM에서 안정적으로 기대할 수 있는 part token은 아래 21종이다.

- 컨테이너: `root`, `line`, `word`, `space`, `glyph`, `glyph-body`, `content`
- 클러스터: `cluster`, `jungseong-cluster`, `jongseong-cluster`
- 자소: `jamo`, `choseong`, `jungseong`, `jungseong-base`, `jungseong-tail`, `jongseong`, `jongseong-left`, `jongseong-right`
- 음절: `head` (syllable depth에서만 — `part="jamo head"`)
- 획: `hoek` (획 깊이 `stroke`의 벡터 자소에서만 — `[part="vector"]` 아래 SVG 도형, §3.4)
- 접근성: `sr-source` (관리 root의 형제, 원문 텍스트, 시각적으로 숨김)

복합 part는 공백 구분 토큰 집합이다. 예:

- `part="jamo jungseong jungseong-tail"`
- `part="cluster jungseong-cluster"`

selector는 기본적으로 `[part~="..."]` 형태를 쓴다.

## 6. DOM shape

### 6.1 Hangul glyph

```html
<span
  part="glyph"
  data-source="왕"
  data-hangul="true"
  data-glyph-kind="hangul"
  data-jung-layout="split-right"
  data-jong-layout="single"
  data-layout-key="split-right:single"
  data-fy-layout-bucket="split-closed"
  data-fy-axis="split"
  data-fy-open="closed"
  data-fy-jong-count="single"
>
  <span part="glyph-body">
    <span part="jamo choseong" data-fy-role="choseong" data-fy-pos="ttl">ᄋ</span>
    <span part="cluster jungseong-cluster" data-fy-role="jung-cluster">
      <span part="jamo jungseong jungseong-base" data-fy-role="jung-base" data-fy-pos="mtl">ᅩ</span>
      <span part="jamo jungseong jungseong-tail" data-fy-role="jung-tail" data-fy-pos="ttr">ᅡ</span>
    </span>
    <span part="jamo jongseong" data-fy-role="jong-main" data-fy-pos="bbrs">ᆼ</span>
  </span>
</span>
```

### 6.2 Plain glyph

```html
<span part="glyph" data-hangul="false" data-glyph-kind="latin">
  <span part="content">A</span>
</span>
```

glyph는 NFC 뒤의 extended grapheme cluster 하나다. 한 코드포인트짜리 완성형 음절만 6.1 Hangul glyph가 된다. 음절로 시작하지만 코드포인트가 더 붙은 cluster(`가`+U+0301, 방점 `한`+U+302E, `각`+U+11A8)는 분해하지 않고 cluster 전체를 담는 plain glyph다. `latin`/`digit`/`punctuation`은 한 코드포인트 glyph에만 붙으므로 여러 코드포인트 cluster는 emoji sequence처럼 `symbol`이다:

```html
<span part="glyph" data-source="한〮" data-hangul="false" data-glyph-kind="symbol">
  <span part="content">한〮</span>
</span>
```

그림 자소 재료 host(`data-fy-material="sprite"`)에서는 한 코드포인트짜리 낱자(호환 자모 `ㅋ`, 단독 첫가끝 자모)가 자소판 표에 있으면 `content` 노드에도 jamo 노드와 같은 `data-sprite-jamo`·`data-sprite-jamo-kind`·`data-sprite-jamo-index`와 `--fy-sprite-jamo-index`가 붙어 코어 sprite 규칙이 칸을 칠한다(ADR-012). 기기 글꼴 재료 host의 plain glyph DOM은 그대로라 사이드카 계약(`spec/html-cases.json`)이 바뀌지 않는다:

```html
<span part="glyph" data-hangul="false" data-glyph-kind="symbol">
  <span part="content" data-sprite-jamo="ㅋ" data-sprite-jamo-kind="consonant" data-sprite-jamo-index="15" style="--fy-sprite-jamo-index: 15">ㅋ</span>
</span>
```

## 7. Common data attributes

| 위치 | 속성 | 의미 |
|---|---|---|
| host | `data-fy-upgraded` | runtime 관리 여부 |
| host | `data-fy-font-pending` | 필요할 때 받기(ADR-019) — 요청한 글꼴 CSS·자소 모듈을 받는 중. 코어 CSS가 `[part="root"]`를 가린다. 도착·실패·3초 뒤 사라진다 |
| host | `data-fy-host` | host mode |
| host | `data-fy-expression` | font CSS가 계산한 표현 방식(디자인 축) |
| host | `data-fy-vowel-depth`, `data-fy-coda-depth` | font CSS가 계산한 자모 분해 깊이의 독립 두 축 |
| host | `data-fy-layout` | 글꼴 모양(배치 프로파일, ADR-026·028·030) — 글꼴을 밝히지 않은 바탕 요소(기본 `sebul-cases-v1`), `--fy-font-layout`을 밝힌 글꼴(`jikgyeol`)과 1.2 디자인. 정적 렌더러도 글꼴을 밝히지 않은 호출에 쓴다(html-cases 1.9) |
| host | `data-fy-font`, `data-fy-profile`, `data-fy-size`, `data-fy-spacing`, `data-fy-wrap-unit`, `data-fy-animate`, `data-fy-seed` | canonical 정규화 옵션 상태 |
| host | `data-fy-material`, `data-fy-sprite-kinds` | font CSS가 선언한 재료와 시트에 칸이 있는 자모 종류(비-`system` font만) |
| decorator host | `data-font`, `data-profile`, `data-size`, `data-spacing`, `data-wrap-unit`, `data-animate`, `data-seed` | authored 지속 입력(런타임이 보존) |
| host | `data-source` | 원문 호환 표면 |
| glyph | `data-hangul`, `data-glyph-kind` | 한글/비한글과 glyph 분류 |
| glyph | `data-jung-layout`, `data-jong-layout` | topology 정보 |
| glyph | `data-layout-key` | 최종 topology key |
| glyph | `data-fy-layout-bucket` | 큰 구조 버킷 |
| glyph | `data-fy-at-<자리>`, `data-fy-jamos` | 문맥 표면(2026-10-22, html-cases 1.12) — 한글 글자 칸에 자모 노드마다 그 자리(`data-fy-pos` 값, 배치 표의 30개)의 자모(`data-fy-at-t="ᄀ"`), 자모 노드 차례의 자모 목록(`data-fy-jamos="ᄀ ᅮ ᆫ"`, 머리 음절은 완성형 글자). 글꼴 CSS는 이웃 자모를 조상 자리 `:has()` 대신 이것으로 고른다: `:has([data-fy-pos="t"][data-jamo="ᄀ"])` → `[data-fy-at-t][data-fy-at-t="ᄀ"]`, `:has([data-jamo="ᆫ"])` → `[data-fy-jamos~="ᆫ"]`(자리 조건과 자모 조건을 하나씩 옮겨 특이도가 같다). Chromium은 페이지의 모든 `:has()` 무효화를 하나로 합쳐, 조상 자리 `:has()`가 있으면 페이지 `:has()` 주체 안의 자모 노드가 그 안 class 바꿈마다 모두 다시 계산된다. 정적 렌더러 넷도 같은 속성을 쓴다 |
| glyph/body/cluster/jamo | `data-fy-axis`, `data-fy-open`, `data-fy-jong-count` | semantic frame |
| jamo | `data-jamo` | 실제 conjoining jamo 값 |
| jamo | (속성 없음) `--fy-shape-left/top/size/scale-x/scale-y/weight/stroke/density` — 코어 CSS가 주는 값 | 고정 글꼴 모양의 모양 값 — 직결식(ADR-026)은 역할·자모마다 한 값, 세벌식(ADR-028)은 짜임(글자 칸 `data-jung-layout`·`data-jong-layout`)마다 한 값(합자 모음 조각은 그 합자 모음의 조각 값). 코어 CSS의 `@layer font-kku.shape` 규칙이 바탕 요소 `data-fy-layout`·짜임·`[part~="choseong"]` 등·`data-jamo`로 고르고, 받는 규칙이 slot 값을 여기서 받으며 글꼴 CSS의 slot·역할·자모·문맥 보정과 자르기를 끈다. 고치려면 뒤 계층 `font-kku.tune`에서 같은 변수를 쓴다(ADR-030 §2). `data-fy-pos`는 정보로 남는다. 2026-10-17까지는 런타임이 `data-fy-stamp`와 인라인 `--fy-stamp-*`로 적었다 |
| jamo | `data-fy-draw="cho\|bar\|sebeol"` | 고정 배치의 그림 문맥 — 직결식 초성은 프로파일이 정한다(`bar`, 모음 짜임을 보지 않음). 세벌식 받침은 `sebeol`(겹받침 세벌식 뼈대 `<자모>@sebeol`이 있으면 그것, 없으면 기본 뼈대)이고 세벌식 초성은 붙지 않는다(모음 짜임을 따른다) |
| jamo/cluster | `data-jamo-role` | `choseong`, `jungseong`, `jongseong`, `jungseong-cluster`, `jongseong-cluster` |
| jamo | `data-fy-role` | `choseong`, `jung-main`, `jung-base`, `jung-tail`, `jong-main`, `jong-left`, `jong-right` |
| jamo | `data-fy-pos` | placement token |
| line/word/glyph/jamo | `data-line-index`, `data-word-index`, `data-glyph-index`, `data-jamo-index` | 순번 surface |
| jamo | `data-sprite-jamo`, `data-sprite-jamo-kind`, `data-sprite-jamo-index` | 이미지 sprite sheet lookup surface (`ㄱ`/`ㅏ`/`ㄼ`, `consonant`/`vowel`/`coda-cluster`, kind별 row-local index). `coda-cluster`는 `coda-depth: whole`의 통짜 겹받침을 4행째에서 찾는다. `sprite-system`의 5·6행은 문맥별 초성/합자 모음 override다 |

인라인 CSS 변수도 같이 주입된다.

- `--fy-line-index`
- `--fy-word-index`
- `--fy-glyph-index`
- `--fy-jamo-index`
- `--fy-sprite-jamo-index`

## 8. Placement token map

### 8.1 전체 token

```text
emit되는 token (data-fy-pos에 찍힌다)
Head:        hs†  hts†
Choseong:    t  tlo  tlc  tls  tt  ttl
Jungseong:   tro  trc  trs  ttr  m  ml  mt  mtl  mw*  mtw*
Jongseong:   b  bl  blr  br  brs  brd  bw*  brw*  bbl  bbrs  bbrd  bbw*

부모 token (emit되지 않음, 자식과 role이 같다 — slot → 부모 → role 체인의 가운데)
tc(t tt)  tl(tlo tlc tls ttl)  h(hs hts)  tr(tro trc)  mc(m mt)  mx(mw mtw)
xb(ml mtl)  xt(trs ttr)  bs(b brs bbrs)  bx(bw brw bbw)  xl(bl blr bbl)  xr(br brd bbrd)

은퇴한 token (emit되지 않고 어느 체인에도 없다)
blb  brb (reserved)   bb  bbr (deprecated)
```

`*`는 통짜(`whole`) 축 전용 token이다 — `mw`·`mtw`는 `vowel-depth: whole`, `bw`·`brw`·`bbw`는 `coda-depth: whole`일 때 나온다. 줄임 `composite`=(whole, whole)만이 아니라 `syllable`=(syllable, whole)도 받침이 통짜라 `bw`·`brw`·`bbw`를 내보낸다(sebul 기본 포함). `†`는 `vowel-depth: syllable` 전용 token이다 (§3.3 참고). 그 축 값이 아니면 emit되지 않는다. 디스패치 규칙은 emit되는 token에만 있다.

selector token은 `active`, `fallback`, `reserved`, `deprecated` 상태를 가진다. 정확한 전체 목록·상태·기본값은 `spec/css-variables.json`, 실제 emit 집합은 `FontKku.placementTables`와 `spec/tables.json`의 placement 표가 정본이다. `node scripts/check_css_contract.js --check`가 이 표면을 서로 대조한다. `FontKku.placementTable`은 atomic 표를 가리키는 기존 이름으로 유지된다.

### 8.2 자주 보는 의미

| Token | 의미 |
|---|---|
| `tlo` | right-open 초성 |
| `tlc` | right-closed 초성 |
| `tls` | split-open 초성 |
| `tt` | bottom-closed 초성 |
| `ttl` | split-closed 초성 |
| `tro` | right-open 중성 |
| `trc` | right-closed 중성 |
| `trs` | split-open tail |
| `ttr` | split-closed tail |
| `m` | bottom-open 중성 |
| `ml` | split-open base |
| `mt` | bottom-closed 중성 |
| `mtl` | split-closed base |
| `b` | bottom:single 종성 |
| `brs` | right:single 종성 |
| `blr`, `brd` | right:double 종성 좌/우 |
| `bl`, `br` | bottom:double 종성 좌/우 |
| `blb`, `brb` | reserved legacy placement (현재 미emit) |
| `bbrs` | split-right:single 종성 |
| `bbl`, `bbrd` | split-right:double 종성 좌/우 |
| `bb`, `bbr` | deprecated legacy placement / 옛 부모 (현재 미emit, 체인 밖 — `bbr`의 역할은 `bs`·`xr`로 옮김) |
| `mw` | split-open 통짜 중성 (`vowel-depth: whole` 전용, atomic `ml`+`trs` 대응) |
| `mtw` | split-closed 통짜 중성 (`vowel-depth: whole` 전용, atomic `mtl`+`ttr` 대응) |
| `bw` | bottom:double 통짜 겹받침 (`coda-depth: whole` 전용 — composite·syllable, atomic `bl`+`br` 대응) |
| `brw` | right:double 통짜 겹받침 (`coda-depth: whole` 전용 — composite·syllable, atomic `blr`+`brd` 대응) |
| `bbw` | split-right:double 통짜 겹받침 (`coda-depth: whole` 전용 — composite·syllable, atomic `bbl`+`bbrd` 대응) |
| `h` | head 공유 부모 (미emit — `hs`/`hts`를 한 번에 잡을 때) |
| `tc`, `tl` | 초성 부모 — 가로모음 위(`t`/`tt`), 세로·합자 모음 옆(`tlo`/`tlc`/`tls`/`ttl`) |
| `tr`, `mc`, `mx` | jung-main 부모 — 세로모음(`tro`/`trc`), 가로모음(`m`/`mt`), 통짜 합자 모음(`mw`/`mtw`) |
| `xb`, `xt` | 합자 모음 조각 부모 — base(`ml`/`mtl`), tail(`trs`/`ttr`) |
| `bs`, `bx` | jong-main 부모 — 홑받침(`b`/`brs`/`bbrs`), 통짜 겹받침(`bw`/`brw`/`bbw`) |
| `xl`, `xr` | 겹받침 조각 부모 — 왼칸(`bl`/`blr`/`bbl`), 오른칸(`br`/`brd`/`bbrd`) |
| `hs` | split 모음의 완성형 head, 받침 없음 (syllable 전용 — 고+ㅏ) |
| `hts` | split 모음의 완성형 head, 받침 있음 (syllable 전용 — 오+ㅏ+ㅇ, 보+ㅏ+ㄼ) |

## 9. CSS responsibility split

### 9.1 `font-kku.css`

공통 엔진 CSS다.

- host, line, word, space, glyph 기본 layout
- `glyph-body`, cluster, jamo absolute positioning
- 비한글 `content`는 static baseline 배치 — `[part="glyph"][data-hangul="false"]`가
  `inline-size: auto`(자연 advance)를 쓰고 `[part="content"]`는 line-height:1 inline-block이라
  한글 자모와 같은 baseline에 앉는다 (`--fy-content-advance`로 고정 칸 opt-in). 비한글·낱자의 선 폭은
  `-webkit-text-stroke-width: var(--fy-content-stroke)` — 글꼴이나 꾸밈이 선언하면 속 빈 한글(도면·외곽선)처럼
  테를 두르고, 선언하지 않으면 대체값이 없어 바탕 요소의 선 폭을 그대로 물려받는다
- `data-fy-pos` 기반 slot dispatch, `data-fy-role` 기반 role dispatch — `BEGIN/END GENERATED CSS CONTRACT: dispatch` 구간, registry slot 트리에서 생성(emit되는 slot만)
- 자모 노드 배치식 — 절대값은 page ?? slot 체인(slot → 부모 slot → role) ?? font ?? builtin, 보정은 레벨별 누적: 위치 = (page 값 ?? slot 값) + `--fy-jamo-dx/dy` + `--fy-case-dx/dy` + `--fy-ctx-dx/dy` + `--fy-syl-dx/dy`(범위 사다리, ADR-035), 크기 = (page ?? slot size) × `--fy-jamo-size` × `--fy-ctx-size`, 굵기 = `--fy-weight` ?? `--fy-ctx-weight` ?? `--fy-jamo-weight` ?? slot weight ?? `--fy-font-weight`, 획 = (`--fy-stroke` ?? slot stroke ?? `--fy-font-stroke`) + `--fy-jamo-stroke` + `--fy-ctx-stroke`(자모·문맥 획 두께는 원소·그림 재료의 획 굵기에도 더한다 — 노드의 `--fy-el-plus`), 잘라내기 = `--fy-clip` ?? `--fy-ctx-clip` ?? `--fy-jamo-clip` ?? slot clip ?? `none`, scale = slot scale × jamo × ctx × page, rotate = slot rotate + jamo + ctx + page. 크기·굵기·획 두께·자르기 보정은 (ADR-030 §7, 2026-10-17). 고정 글꼴 모양 노드는 바탕 글꼴의 자모·문맥 보정을 받지 않고(코어 셋째 `@layer font-kku.shape` 블록이 비운다) `font-kku.tune`의 `--fy-jamo-*`만 받는다
- 레이어 순서 선언 `@layer font-kku.font, font-kku.jamo, font-kku.context;` (코어 규칙 자체는 레이어 밖)
- sprite 재료 규칙 — `[data-fy-material="sprite"][data-fy-sprite-kinds~="<kind>"]` host 아래 `[data-sprite-jamo-kind="<kind>"]` 노드에 시트 칸을 칠한다(칸 크기·`overflow`·`background-*`·`filter`·투명 글자색). 목록에 없는 종류와 sprite 매핑이 없는 노드는 폰트 글자로 폴백
- 마스크 칠 규칙 — `[data-fy-material="sprite"][data-fy-sprite-paint="mask"]` host 아래 종류 노드는 자소판을 `mask-image`(배경 칸과 같은 크기·위치 식)로 쓰고 `background-image: var(--fy-sprite-fill, linear-gradient(currentColor, currentColor))`로 칠한다. 글자는 `-webkit-text-fill-color: transparent`(시트의 `color: transparent`는 마스크가 아닐 때만)
- 벡터 자소 규칙 — `[data-fy-material="vector"]` host 아래 종류 노드는 글자를 `-webkit-text-fill-color: transparent`로 숨기고 `color`는 남긴다. `[part="vector"]`는 칸 크기(× `--fy-sprite-zoom`, `--fy-sprite-crop-*` 위치)로 노드를 덮고, 획은 `currentColor`·`non-scaling-stroke`·굵기 `var(--fy-vector-stroke, --fy-vector-stroke-cells × 0.01em × zoom)`, `[data-fill]` 도형은 `fill: currentColor`
- 그림 자소 낱자 — 같은 게이트 아래 `[part="content"][data-sprite-jamo-kind]`(sprite host의 낱자)는 곁 여백 없는 블록으로 글자 상자 위쪽에 놓여 jamo 노드처럼 칸 하나를 그린다
- cluster wrapper transform — 변형 → jung/jong cluster → generic `--fy-cluster-*` 체인, `BEGIN/END GENERATED CSS CONTRACT: cluster` 구간
- `data-fy-wrap-unit` 줄바꿈 정책
- `data-fy-animate` 기반 내장 animation hook

### 9.2 font CSS

font CSS는 값을 준다. 첫 규칙은 레이어 순서 선언이고, 나머지 규칙은 모두 `font-kku.font` / `font-kku.jamo` / `font-kku.context` 안에 둔다(`docs/ADR/ADR-008-font-contract-v2.md`).

- `data-fy-font="<name>"` canonical host gate
- 메타데이터 `--fy-font-id: <name>`, `--fy-contract: 2`, `--fy-material: system|sprite|bundled`
- `--fy-expression-mode`
- `--fy-glyph-width`, `--fy-glyph-height`
- `--fy-font-weight`, `--fy-font-stroke` (font 레벨 기본값)
- sprite 재료: `--fy-sprite-url`(코어가 `<url>`로 등록 — 폰트 파일 기준 상대 경로), multi-scale `--fy-sprite-url-2x`/`--fy-sprite-url-3x`/`--fy-sprite-image`, `--fy-sprite-cell`, `--fy-sprite-cols`, `--fy-sprite-rows`, `--fy-sprite-kinds`(host), `--fy-sprite-row`(노드), slot 획 보정 `--fy-<slot>-dilate`와 폰트 레벨 기본 `--fy-sprite-dilate`, `--fy-sprite-zoom`/`--fy-sprite-crop-x`/`--fy-sprite-crop-y`. `background*`·`filter`·칸 크기 속성은 코어 소유라 선언하지 않는다
- `--fy-word-gap`, `--fy-line-gap`, `--fy-space-width`
- `--fy-body-*`
- `--fy-content-*` — 비한글 글자 자리·크기·곁 여백·전진폭과 선 폭 `--fy-content-stroke`(§9.1)
- `--fy-tlo-*`, `--fy-trc-*`, `--fy-bbrs-*` 등 slot 변수(10종 suffix: top/left/size/scale-x/scale-y/rotate/weight/stroke/clip/dilate), 부모 slot 변수, role 변수
- `--fy-jung-cluster-*`, `--fy-jong-cluster-*` 등 cluster 변수
- 자모 노드 보정: slot 변수 재선언(대체, 잘라내기는 `--fy-<slot>-clip`), `--fy-jamo-dx/dy/scale-x/scale-y/rotate/size/stroke`, `--fy-ctx-*` 같은 접미사(누적), `--fy-jamo-weight/clip`·`--fy-ctx-weight/clip`(대체) (ADR-030 §7, 2026-10-17)
- 필요할 때만 `data-layout-key`, `data-fy-layout-bucket`, `data-fy-role`, `data-fy-pos`, `data-jamo`, `data-jamo-base` selector

font CSS가 하지 않는 것: 코어 소유 속성(`margin`, `inset`, `transform`, `font-size`, `font-weight`, `-webkit-text-stroke`, `clip-path`, sprite 재료의 `background*`·`filter`·`inline-size`·`block-size`·`width`·`height`·`overflow` 등) 선언, 페이지 전용 변수(`--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`)와 런타임·코어 dispatch 변수 선언. `node scripts/check_css_contract.js --check`가 막는다.

원칙 — 레벨을 골라 해당 레이어에 쓴다:

1. font — host 공통값 (`font-kku.font`)
2. slot — slot → 부모 slot → role 변수, cluster 변수, depth 같은 host 조건 (`font-kku.font`)
3. jamo — `[data-jamo]`/`[data-jamo-base]` 규칙의 slot 변수 재선언(대체)과 `--fy-jamo-*`(누적) (`font-kku.jamo`)
4. context — `:has()`·topology 조건의 slot 변수 재선언과 `--fy-ctx-*`, 같은 짜임 `--fy-case-*`·한 음절 `--fy-syl-*` (`font-kku.context`)

뒤 레이어가 특이도와 무관하게 이긴다. 같은 변수는 대체되므로 누적 보정은 레벨 전용 오프셋에 쓴다. 레이어 밖의 페이지 CSS는 모든 폰트를 이긴다.

### 9.3 CSS variable registry 경계

- `spec/css-variables.json`은 공개 `--fy-*` surface의 기계 판독 정본이다. 현재 variable/slot 규모는 `node scripts/check_css_contract.js --check` 출력으로 확인한다.
- 각 variable은 `status`, `kind`, `type`, terminal `default`, 적용 surface와 레벨 메타데이터 `level`(font·slot·role·jamo·context·page·runtime·dispatch), `scope`(host·node·page), `declaredBy`(font·page·runtime·core)를 가진다. 폰트는 `declaredBy: font`인 변수만 선언한다. slot은 `role`, `parent`, `status`, `type`, `emitted`, suffix별 default를 추가로 가진다.
- `node scripts/check_css_contract.js --check`는 base CSS 변수 집합/기본값, slot selector dispatch, placement spec의 emitted token, runtime/sprite source(Font Studio sprite 템플릿 포함), skill 문서의 변수명을 검사한다. 이 검사는 `tests/asset_sync.test.js`를 통해 `npm test`에도 포함된다.
- `--check`는 `profiles/*.css`에 폰트 계약 v2 린트(`authoring/font-kku-lint.js`, 문법 정본 ADR-008 §9 — 구조·scope·레이어 = 레벨·변수 선언 주체와 scope·속성 허용 목록·타입 있는 값과 단위 없는 0·상대 자산·메타데이터)도 적용한다. Font Studio도 같은 린트를 돌린다.
- registry slot을 바꾸면 `node scripts/check_css_contract.js --write`로 `authoring/font-studio-model.js`의 studio slot-contract marker, `authoring/font-kku-lint.js`의 lint-registry marker와 `font-kku.css`의 dispatch marker를 갱신한다. marker 밖 Font Studio 코드와 `font-kku.css`의 나머지는 생성하지 않는다.
- 따라서 `font-kku.css`(marker 밖)와 font CSS는 계속 직접 저작한다. registry를 CSS 전체 생성기로 오해하거나 marker 안을 손으로 편집하지 않는다.

### 9.4 확장이 쓰는 이름 (data-kku-*, --kku-*)

조합 확장([ADR-017](../../../docs/ADR/ADR-017-composition-axes-and-themes.md))은 런타임 계약(`data-fy-*`, `--fy-*`) 밖의 `kku` 이름을 쓴다. 런타임은 이 이름을 읽거나 쓰지 않는다.

| 이름 | 종류 | 주인 | 뜻 |
|---|---|---|---|
| `kku-look-<id>` | 바탕 요소 class | `font-kku-looks.css` | 꾸밈(칠). `spec/themes.json` `looks` |
| `kku-vary-<id>` | 바탕 요소 class | `font-kku-looks.css` | 변주(씨앗) — 기울기·들썩임·굵기·너비·색조·농담. `jamo-seeds`를 켠 바탕 요소에서만 |
| `data-kku-fx` | 바탕 요소 속성 | `font-kku-fx.js` | 상호작용 이름들(`type` `scatter` `magnet` `shuffle`, 공백 구분) |
| `data-kku-phrases` | 바탕 요소 속성 | `font-kku-fx.js` | `type`이 칠 문장들(`\|` 구분) |
| `data-kku-caret` | 바탕 요소 속성 | `font-kku-fx.js` | `type`이 치는 줄에 붙일 커서 class |
| `data-kku-scatter` | 바탕 요소 속성 | `font-kku-fx.js` | `scatter` 여는 법(`auto` `hover` `click`) |
| `data-kku-shuffle` | 바탕 요소 속성 | `font-kku-fx.js` | `shuffle` 여는 법(`click` `hover`, 숫자면 그 ms마다) |
| `data-kku-paused` | 바탕 요소·조상 속성 | `font-kku-motion.css`, `font-kku-fx.js` | 있으면 자모 움직임과 타자·섞기를 멈춘다(스크롤 조립 제외) |
| `kku-fx-open` | 바탕 요소 class | `font-kku-fx.js` | `scatter`가 흩어진 동안 붙인다 |
| `--kku-motion-duration` | 페이지 변수 | `font-kku-motion.css` | 자모 움직임 한 바퀴 길이 |
| `--kku-motion-stagger` | 페이지 변수 | `font-kku-motion.css` | 글자마다 늦추는 시차 |
| `--kku-cycle-1` … `--kku-cycle-4` | 페이지 변수 | `font-kku-motion.css` | `cycle`이 도는 네 색 |
| `--kku-shine-color` | 페이지 변수 | `font-kku-motion.css` | `shine`의 빛줄기 색 |
| `--kku-look-stroke` | 바탕 요소 변수 | `font-kku-looks.css` | 외곽선 꾸밈의 고른 선 폭(변주 굵기가 이 값에 더한다) |
| `--kku-look-hair` | 바탕 요소 변수 | `font-kku-looks.css` | 꾸밈 테·글자 단위 그림자 오프셋·속 빈 꾸밈 원소 획의 화면 하한(기본 `1.1px` — Firefox는 1화소보다 작은 그림자 오프셋을 버린다). `0px`이면 하한 없이 em 값 그대로(작은 글씨 테가 예전처럼 가늘다) |

`--kku-step`·`--kku-from`·`--kku-turn`·`--kku-spin`·`--kku-angle`·`--kku-scroll`·`--kku-scatter`·`--kku-gather-view`·`--kku-gather-in`·`--kku-gather-end`·`--kku-shine-at`·`--kku-shine-paint`·`--kku-shine-len`·`--kku-shine-pos`·`--kku-shine-half`·`--kku-shine-mix`·`--kku-shine-base`·`--kku-shine-a`·`--kku-shine-w`·`--kku-shine-g`는 `font-kku-motion.css` 안에서만 쓰는 내부 변수다 — 페이지가 고칠 값이 아니다(0.1.2까지의 `--kku-shine`은 `--kku-shine-at`이 되었다).

## 10. JS API quick reference

브라우저 런타임이 노출하는 공개 API:

- `FontKku.define()`
- `FontKku.bootstrap(root)`
- `FontKku.render(target, options)`
- `FontKku.refresh(target, options)`
- `FontKku.refreshAll(root)` — font 메타데이터·depth·expression mode를 다시 해석해 구조가 바뀐 host만 attribute를 다시 읽어 재렌더, id/contract만 바뀌면 상태만 갱신. shadow root 안 host 포함 (stylesheet `load`는 자동 처리)
- `FontKku.loadFont(href, { root }?)` — stylesheet `<link>`를 삽입(같은 URL이면 재사용)하고 load 뒤 `refreshAll`. 대기·성공 중에는 같은 Promise, 실패하면 link를 지우고 reject(재호출 시 재시도). `Promise<HTMLElement[]>`
- 이벤트 `font-kku:render` — 모든 렌더(자동 재렌더 포함) 뒤 host에서 발생(bubbles, composed). `detail = { reason, font, source, resolved }`, reason은 `render | refresh | upgrade | connect | attribute | mutation | restyle` — 숨은 채 그려진 원소·SVG 바탕 요소가 보여 굵기·머리를 다시 맞추면 `restyle`
- opt-in `jamo-seeds`(decorator `data-jamo-seeds`, JS `jamoSeeds`) — 렌더마다 host seed를 반영한 `--fy-jamo-seed`를 자모 노드에 다시 건다. 켜면 host에 `data-fy-jamo-seeds="true"`가 찍힌다(기본 DOM 계약 불변, 사이드카 미지원)
- `FontKku.fontInfo(host)` — 직전 렌더의 `{ font, id, contract, material, loaded }`, 렌더 전이면 `null`
- `FontKku.upgrade(target)`
- `FontKku.upgradeAll(root)`
- `FontKku.decomposeGlyph(char)`
- `FontKku.createTextModel(text)`
- `FontKku.renderText(text)`
- `FontKku.isHangulSyllable(char)`
- `FontKku.hashSeed(value)`
- `FontKku.applyJamoSeeds(host, options)`
- `FontKku.hasHangulFont(options?)` — 기기 글꼴이 완성형 음절과 첫가끝 자모를 그릴 수 있는지(`true`/`false`, 판단 불가면 `null`). 캔버스 글자 상자 비교, 픽셀을 읽지 않고 font-family별 캐시(ADR-012)
- `FontKku.sourceRange(host, range)` — 범위(`Range`·`StaticRange`)가 바탕 요소에서 고른 원문 `{ start, end, text }`(원문 위치, NFC 글) 또는 `null`. 복사·잘라내기가 쓰는 대응과 같다(§2.3 접근성 메모의 선택·복사)
- `FontKku.placementTable` (9-key placement table의 frozen defensive copy)
- `FontKku.version`

`upgradeAll(root)`는 `root` 아래 descendant `font-kku, .font-kku`만 업그레이드하고, `root` 자신은 포함하지 않는다.

## 설정 출처와 진단 (ADR-031, 2026-10-18)

배치는 페이지 디자인 layout → 페이지 `--fy-layout` → 글꼴 디자인 layout → `--fy-font-layout` → 기본값 차례다. 생략된 디자인 layout은 상속한다. `--fy-layout`은 `sebul-cases-v1`, `sebul-fixed-v1`, `square-context-v1`을 받는다. `legacy`는 디자인만 끄며 문맥 배치를 원하면 마지막 값을 명시한다.

페이지 재료·그림 세트는 글꼴 디자인의 재료/조립 적용을 끄되 배치는 유지한다(`DESIGN_OVERRIDDEN_BY_PAGE`). 같은 레벨에서는 디자인이 우선한다. 그림 세트가 없는 svg 재료 요청은 element + `SVG_REQUIRES_BOX_SET`이다. 배치 이름 오류는 `LAYOUT_NOT_REGISTERED`, 지원 불가 배치·재료는 `LAYOUT_UNSUPPORTED_FONT`·`FACE_UNSUPPORTED_FONT`다. 잘못된 재료 값은 `FACE_TOKEN_INVALID`로 알리고 하위의 유효한 설정을 유지한다. 바탕 요소 `data-fy-face-status`·`data-fy-layout-status`와 `fontInfo().faceStatus`·`.layoutStatus`로 읽고 정상일 때는 속성을 없앤다.
