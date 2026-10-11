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
- `data-fy-material="vector"`, `data-fy-jamo-set="<name>"` — sprite font에 `jamo-set`이 걸리고 그 자모 세트가 등록돼 있을 때(ADR-013). 실제 SVG가 있는 노드에만 `data-fy-vector-cell`이 붙고 벡터 규칙이 적용된다. 없는 칸은 기반 자소판을 유지한다. 등록된 칸의 노드마다 `<svg part="vector" data-cell="r<행>-<자모>" viewBox="0 0 100 100" aria-hidden="true">`가 붙는다
- `data-fy-glow="filter"` — 기기 글꼴 바탕 요소에 빛 칠(`--fy-font-glow`/페이지 `--fy-glow`, `none`이 아닌 drop-shadow 목록)이 걸렸을 때([ADR-021](../../../docs/ADR/ADR-021-glow-paint.md)). 코어가 자모 글자를 `::before`로 그리고 slot clip을 거기에 옮기며, 자모 노드는 글자를 숨기고 `filter`로 빛만 그린다. `::before`는 `--fy-ink-visibility`(기본 visible)를 따르므로, 이때 자모 하나를 숨기려면 `opacity`를 쓴다
- `data-fy-stroke-depth="stroke|jamo"` — 획 깊이를 요청했을 때만(§3.4). 벡터 자소면 `stroke`, 획으로 쪼갤 수 없는 재료(기기 글꼴·자소판)면 `jamo`로 되돌린 것을 알린다
- `data-source`
- `aria-label`
- `--fy-size`
- `--fy-space-width`, `--fy-word-gap` (`spacing` 설정 시)
- `--fy-seed` (`seed` 설정 시)

decorator의 `data-font`/`data-profile`/`data-size`/`data-spacing`/`data-wrap-unit`/`data-animate`/`data-seed`는 authored 입력이며 출력이 아니다. custom element는 plain attribute가 입력이므로 기존 normalized `data-font`/`data-profile`/`data-size`/`data-wrap-unit`/`data-animate`/`data-seed` mirror를 호환용으로 추가 출력한다. CSS와 진단 도구는 host 모드에 상관없이 canonical `data-fy-*`를 읽는다.

접근성 메모:

- 관리 root(`part="root"`, `data-fy-root="true"`)에는 `aria-hidden="true"`가 붙어 분해 자소 DOM이 보조기기에서 숨겨진다.
- root의 형제 `part="sr-source"`(`data-fy-sr="true"`) 노드가 원문 텍스트를 담는 1차 스크린리더/복사 표면이다 (시각적으로만 숨김).
- `aria-label` / `data-source`는 호환 표면으로 계속 기록된다. 비표준 `role="text"`는 더 이상 설정하지 않는다.
- state 없는 관리 DOM(clone 등)의 원문 복구는 `data-source` → `sr-source` → `textContent` 순으로 폴백한다.
- SEO/검색 보장은 별도 주장으로 확대하지 않는다.

## 3. Shipped fonts and expression modes

### 3.1 활성 font

- `profiles/sebul.css`
- `profiles/gothic.css`
- `profiles/sprite-example.css`
- `profiles/sprite-system.css` — 종성·겹받침·문맥 변형까지 포함한 6행 sprite
- 파생 글꼴: `neon`·`sticker`·`malang`·`geumbak`·`glitch`(기반 `sebul`), `retro`·`saekdong`·`riso`·`blueprint`(기반 `gothic`), `pixel`·`dojang`·`chalk`·`crayon`·`jasu`·`pilgi`·`dunggeun`·`butgeul`(기반 `sprite-system`). 기반 글꼴과 같은 DOM·자리·depth를 쓰고(배치를 복사했으므로) 칠·그림자·기울기·자소판만 다르다. `sidecar: false`라 사이드카 `render_html`은 지원하지 않는다
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
- `syllable`은 **합자 모음 음절에서만** 동작한다. 그 외 음절은 vowel-depth와 무관하게 동일하고, 초성 slot(`t`/`tt`/`tlo`/`tlc`)을 그대로 쓴다.
- placement는 base(atomic) 표 위에 모음축 override(head/choseong/jungseong 열)와 받침축 override(jongseong 열)를 합성해 만든다 — 두 축이 서로 다른 열만 건드려 어떤 조합도 충돌하지 않는다. 정본은 `spec/tables.json`의 `placement` + `placementVowelOverrides` + `placementCodaOverrides`.

계약상 중요한 성질:

- **topology 계약은 depth와 무관하다.** `data-layout-key` 9키, `data-jung-layout`, `data-jong-layout`, `data-fy-layout-bucket`, semantic frame이 모든 depth 조합에서 동일하다. 달라지는 것은 자모 노드 개수와 `data-fy-pos` 값뿐이다.
- 합자가 한 노드가 되면 `jungseong-cluster` / `jongseong-cluster` wrapper는 생성되지 않는다 (cluster 대상 CSS는 깨지지 않고 미사용이 된다).
- `syllable`의 head 노드는 `part="jamo head"` / `data-jamo-role="head"` / `data-fy-role="head"`이고 `data-jamo`에 **완성형 음절**이 들어간다. 완성형이라 자모 선택자가 없으므로 **base 모음을 `data-jamo-base`(conjoining)로 함께 노출**한다 — CSS가 ㅜ계/ㅗ계 head를 분기하는 표면이다(예: `[data-fy-pos="hs"][data-jamo-base="ᅮ"]`). 자모 테이블에 없는 값이므로 `data-jamo-index`와 sprite 매핑은 붙지 않는다 — 즉 **sprite trail은 syllable의 split 음절을 그릴 수 없다**(시트는 자모 단위다). 나머지 음절은 composite와 같으므로 sprite로 그려진다.
- 논리 정보는 `glyph.jamo`(소스 자모 3벌)에 그대로 남고, depth는 `glyph.display`만 바꾼다. 원문 복구·접근성 표면(`sr-source`, `data-source`)은 depth와 무관하다.
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
| host | `data-fy-font`, `data-fy-profile`, `data-fy-size`, `data-fy-spacing`, `data-fy-wrap-unit`, `data-fy-animate`, `data-fy-seed` | canonical 정규화 옵션 상태 |
| host | `data-fy-material`, `data-fy-sprite-kinds` | font CSS가 선언한 재료와 시트에 칸이 있는 자모 종류(비-`system` font만) |
| decorator host | `data-font`, `data-profile`, `data-size`, `data-spacing`, `data-wrap-unit`, `data-animate`, `data-seed` | authored 지속 입력(런타임이 보존) |
| host | `data-source` | 원문 호환 표면 |
| glyph | `data-hangul`, `data-glyph-kind` | 한글/비한글과 glyph 분류 |
| glyph | `data-jung-layout`, `data-jong-layout` | topology 정보 |
| glyph | `data-layout-key` | 최종 topology key |
| glyph | `data-fy-layout-bucket` | 큰 구조 버킷 |
| glyph/body/cluster/jamo | `data-fy-axis`, `data-fy-open`, `data-fy-jong-count` | semantic frame |
| jamo | `data-jamo` | 실제 conjoining jamo 값 |
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

`*`는 composite, `†`는 syllable depth 전용 token이다 (§3.3 참고). 다른 depth에서는 emit되지 않는다. 디스패치 규칙은 emit되는 token에만 있다.

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
| `mw` | split-open 통짜 중성 (composite 전용, atomic `ml`+`trs` 대응) |
| `mtw` | split-closed 통짜 중성 (composite 전용, atomic `mtl`+`ttr` 대응) |
| `bw` | bottom:double 통짜 겹받침 (composite 전용, atomic `bl`+`br` 대응) |
| `brw` | right:double 통짜 겹받침 (composite 전용, atomic `blr`+`brd` 대응) |
| `bbw` | split-right:double 통짜 겹받침 (composite 전용, atomic `bbl`+`bbrd` 대응) |
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
  한글 자모와 같은 baseline에 앉는다 (`--fy-content-advance`로 고정 칸 opt-in)
- `data-fy-pos` 기반 slot dispatch, `data-fy-role` 기반 role dispatch — `BEGIN/END GENERATED CSS CONTRACT: dispatch` 구간, registry slot 트리에서 생성(emit되는 slot만)
- 자모 노드 배치식 — 절대값은 page ?? slot 체인(slot → 부모 slot → role) ?? font ?? builtin, 보정은 레벨별 누적: 위치 = (page 값 ?? slot 값) + `--fy-jamo-dx/dy` + `--fy-ctx-dx/dy`, 굵기 = `--fy-weight` ?? slot weight ?? `--fy-font-weight`, 획 = `--fy-stroke` ?? slot stroke ?? `--fy-font-stroke`, 잘라내기 = `--fy-clip` ?? slot clip ?? `none`, scale = slot scale × jamo × ctx × page, rotate = slot rotate + jamo + ctx + page
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
- `--fy-content-*`
- `--fy-tlo-*`, `--fy-trc-*`, `--fy-bbrs-*` 등 slot 변수(10종 suffix: top/left/size/scale-x/scale-y/rotate/weight/stroke/clip/dilate), 부모 slot 변수, role 변수
- `--fy-jung-cluster-*`, `--fy-jong-cluster-*` 등 cluster 변수
- 자모 노드 보정: slot 변수 재선언(대체, 잘라내기는 `--fy-<slot>-clip`), `--fy-jamo-dx/dy/scale-x/scale-y/rotate`, `--fy-ctx-dx/dy/scale-x/scale-y/rotate`(누적)
- 필요할 때만 `data-layout-key`, `data-fy-layout-bucket`, `data-fy-role`, `data-fy-pos`, `data-jamo`, `data-jamo-base` selector

font CSS가 하지 않는 것: 코어 소유 속성(`margin`, `inset`, `transform`, `font-size`, `font-weight`, `-webkit-text-stroke`, `clip-path`, sprite 재료의 `background*`·`filter`·`inline-size`·`block-size`·`width`·`height`·`overflow` 등) 선언, 페이지 전용 변수(`--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`)와 런타임·코어 dispatch 변수 선언. `node scripts/check_css_contract.js --check`가 막는다.

원칙 — 레벨을 골라 해당 레이어에 쓴다:

1. font — host 공통값 (`font-kku.font`)
2. slot — slot → 부모 slot → role 변수, cluster 변수, depth 같은 host 조건 (`font-kku.font`)
3. jamo — `[data-jamo]`/`[data-jamo-base]` 규칙의 slot 변수 재선언(대체)과 `--fy-jamo-*`(누적) (`font-kku.jamo`)
4. context — `:has()`·topology 조건의 slot 변수 재선언과 `--fy-ctx-*` (`font-kku.context`)

뒤 레이어가 특이도와 무관하게 이긴다. 같은 변수는 대체되므로 누적 보정은 레벨 전용 오프셋에 쓴다. 레이어 밖의 페이지 CSS는 모든 폰트를 이긴다.

### 9.3 CSS variable registry 경계

- `spec/css-variables.json`은 공개 `--fy-*` surface의 기계 판독 정본이다. 현재 variable/slot 규모는 `node scripts/check_css_contract.js --check` 출력으로 확인한다.
- 각 variable은 `status`, `kind`, `type`, terminal `default`, 적용 surface와 레벨 메타데이터 `level`(font·slot·role·jamo·context·page·runtime·dispatch), `scope`(host·node·page), `declaredBy`(font·page·runtime·core)를 가진다. 폰트는 `declaredBy: font`인 변수만 선언한다. slot은 `role`, `parent`, `status`, `type`, `emitted`, suffix별 default를 추가로 가진다.
- `node scripts/check_css_contract.js --check`는 base CSS 변수 집합/기본값, slot selector dispatch, placement spec의 emitted token, runtime/sprite source(Font Studio sprite 템플릿 포함), skill 문서의 변수명을 검사한다. 이 검사는 `tests/asset_sync.test.js`를 통해 `npm test`에도 포함된다.
- `--check`는 `profiles/*.css`에 폰트 계약 v2 린트(`site/font-kku-lint.js`, 문법 정본 ADR-008 §9 — 구조·scope·레이어 = 레벨·변수 선언 주체와 scope·속성 허용 목록·타입 있는 값과 단위 없는 0·상대 자산·메타데이터)도 적용한다. Font Studio도 같은 린트를 돌린다.
- registry slot을 바꾸면 `node scripts/check_css_contract.js --write`로 `site/font-studio-model.js`의 studio slot-contract marker, `site/font-kku-lint.js`의 lint-registry marker와 `font-kku.css`의 dispatch marker를 갱신한다. marker 밖 Font Studio 코드와 `font-kku.css`의 나머지는 생성하지 않는다.
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

`--kku-step`·`--kku-from`·`--kku-turn`·`--kku-spin`·`--kku-angle`·`--kku-scroll`·`--kku-shine`·`--kku-shine-paint`는 `font-kku-motion.css` 안에서만 쓰는 내부 변수다 — 페이지가 고칠 값이 아니다.

## 10. JS API quick reference

브라우저 런타임이 노출하는 공개 API:

- `FontKku.define()`
- `FontKku.bootstrap(root)`
- `FontKku.render(target, options)`
- `FontKku.refresh(target, options)`
- `FontKku.refreshAll(root)` — font 메타데이터·depth·expression mode를 다시 해석해 구조가 바뀐 host만 attribute를 다시 읽어 재렌더, id/contract만 바뀌면 상태만 갱신. shadow root 안 host 포함 (stylesheet `load`는 자동 처리)
- `FontKku.loadFont(href, { root }?)` — stylesheet `<link>`를 삽입(같은 URL이면 재사용)하고 load 뒤 `refreshAll`. 대기·성공 중에는 같은 Promise, 실패하면 link를 지우고 reject(재호출 시 재시도). `Promise<HTMLElement[]>`
- 이벤트 `font-kku:render` — 모든 렌더(자동 재렌더 포함) 뒤 host에서 발생(bubbles, composed). `detail = { reason, font, source, resolved }`, reason은 `render | refresh | upgrade | connect | attribute | mutation | restyle`
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
- `FontKku.placementTable` (9-key placement table의 frozen defensive copy)
- `FontKku.version`

`upgradeAll(root)`는 `root` 아래 descendant `font-kku, .font-kku`만 업그레이드하고, `root` 자신은 포함하지 않는다.
