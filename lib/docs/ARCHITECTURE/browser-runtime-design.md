# 브라우저 런타임 설계

> Status: Implemented
> Scope: 유니코드 클라이언트 재작성의 런타임 계약

## 목표

사용자는 별도 프레임워크 설정 없이 브라우저에서 스크립트를 불러오고 `<font-kku>` 태그 또는 `class="font-kku"`가 있는 일반 태그만 작성하면 자동으로 한글 자소 그리기를 쓸 수 있어야 한다.

## 기본 사용 형태

가장 단순한 사용 형태는 아래다.

```html
<link rel="stylesheet" href="./font-kku.css" />
<link rel="stylesheet" href="./profiles/sebul.css" />
<script src="./font-kku.js"></script>

<font-kku>안녕하세요</font-kku>
<font-kku font="sebul" size="24">광화문</font-kku>

<span class="font-kku" data-font="sebul">안녕하세요</span>
<div class="font-kku" data-font="sebul" data-wrap-unit="word">광화문 광장</div>
```

로딩 후 런타임은 전용 태그 `font-kku`를 등록하고, `.font-kku` 선택자에 걸리는 일반 태그도 업그레이드한다.

## 공개 범위

### 1. 선언형 API (Declarative API)

- 바탕 요소 형태:
  - `<font-kku>`
  - `.font-kku` 클래스가 지정된 일반 태그
- 기본 동작: 내부 텍스트를 읽어 자동으로 그리기
- 현재 지원 속성:
  - `font`
  - `profile` (호환 별칭)
  - `size`
  - `spacing`
  - `wrap-unit`
  - `animate`
  - `seed`
  - `jamo-seeds` (켜야 동작하는 boolean, 브라우저 전용 — 아래 옵션 정규화)
  - `jamo-set` (등록된 벡터 자모 세트 선택)
  - `stroke-depth` (`jamo | stroke`, 벡터 자모의 획 단위 표시)

일반 태그 모드에서는 옵션을 `data-*` 속성으로 받는다.

- `data-font`
- `data-profile`
- `data-size`
- `data-spacing`
- `data-wrap-unit`
- `data-animate`
- `data-seed`
- `data-jamo-seeds`
- `data-jamo-set`
- `data-stroke-depth`

클래스 방식의 위 `data-*`는 작성자가 쓴 입력이며 런타임이 정규화 결과로 덮어쓰거나 삭제하지 않는다. 모든 바탕 요소 모드의 확정 출력은 별도 정본 네임스페이스를 쓴다.

- `data-fy-font`, `data-fy-profile`
- `data-fy-size`, `data-fy-spacing` (spacing 설정 시)
- `data-fy-wrap-unit`
- `data-fy-animate` (animate 설정 시)
- `data-fy-seed` (seed 설정 시, 해석된 숫자)
- `data-fy-expression="sebeol|general"`
- `data-fy-material`, `data-fy-sprite-kinds` (글꼴의 `--fy-material`이 `system`이 아닐 때만)
- `data-fy-jamo-seeds="true"` (`jamo-seeds`를 켰을 때만 — 기본 DOM 계약 `spec/html-cases.json`에는 나타나지 않는다)

`data-fy-expression`은 입력 옵션이 아니라 글꼴 CSS의 `--fy-expression-mode`를 런타임이 정규화해 노출하는 출력 속성이다. 전용 태그는 입력이 일반 속성이라 충돌하지 않으므로, 정규화한 값을 되비추는 기존 `data-font`/`data-profile`/`data-size`/`data-wrap-unit`/`data-animate`/`data-seed` 사본도 호환용으로 유지한다. CSS 적용 조건(게이팅)과 진단의 정본은 `data-fy-*`다.

### 옵션 정규화

런타임은 바탕 요소 속성을 내부 옵션으로 정규화할 때 아래 계약을 따른다.

- 우선순위: **속성(또는 `data-*`)이 지속되는 옵션의 출처다.** `refresh()`와 모든 자동 다시 그리기(속성 변경, 원문 변경, 늦게 도착한 글꼴 CSS의 재해석)는 매번 속성을 다시 읽고, JS 옵션(`render`/`refresh`의 `options`)은 해당 호출 1회에만 적용된다. 같은 호출 안에서는 JS 옵션 > 속성 > 기본값. JS 옵션의 `undefined`·`null`·빈 문자열은 "지정 안 함"이라 속성 값으로 돌아간다. ([ADR-002](../ADR/ADR-002-option-priority-contract.md))
- 예외 하나: 바탕 요소가 분리(detached)된 상태에서 한 그리기는 글꼴 스타일을 해석하지 못한 채 끝난다. 연결될 때 그 해석을 마치는 다시 그리기는 **같은 호출의 완료**라 그 호출의 JS 옵션을 그대로 쓴다(아래 요소 생애 주기).
- `font`: 별칭을 정규화한 뒤(`default`/`classic`→`sebul`, `gothic2`→`gothic`) 바탕 요소의 `data-fy-font`/`data-fy-profile`에 기록하고, 정본 `data-fy-font`로 CSS 적용 범위를 건다. 사용자가 쓴 원본 속성/`data-*`는 건드리지 않는다. ([ADR-005](../ADR/ADR-005-font-alias-normalization-and-gating.md))
- `profile`: `font`의 하위 호환 별칭. 입력으로 읽지만 바탕 요소 계약은 `font` 기준으로 정규화한다.
- `expression mode`: 글꼴 CSS가 `--fy-expression-mode`로 선언하며, 런타임은 이를 `data-fy-expression="sebeol|general"`으로 정규화한다.
- `size` / `data-size`:
  - 앞뒤 공백은 무시한다. 예: `" 24"` -> `24px`
  - 숫자만 들어오면 `px`로 해석한다. 예: `24` -> `24px`
  - 유효한 CSS 길이 문자열이면 그대로 사용한다. 예: `1.5rem`, `32px`
  - 정규화 결과를 바탕 요소의 `--fy-size`와 `data-fy-size`에 반영한다.
  - 바탕 요소 기본 스타일은 `font-size: var(--fy-size)`를 사용하고, 글자/자모 배치는 `em` 기반 변수로 따라가게 한다.
  - 레거시처럼 `.ptext_15`, `.ptext_20` 같은 미리 정한 CSS 클래스를 고르지 않는다.
- `spacing`: `data-fy-spacing`과 바탕 요소의 `--fy-space-width`/`--fy-word-gap`으로 정규화
- `wrap-unit`: `glyph | word | line`. 확정 값은 `data-fy-wrap-unit`에 기록하고 기본 CSS도 이 출력을 조건으로 건다.
- `animate`: 글꼴 또는 런타임 움직임 훅 선택값. 확정 값은 `data-fy-animate`에 기록하고 움직임 CSS도 이 출력을 조건으로 건다. 자세한 계약과 자모별 움직임·실시간 변형은 [움직임과 런타임 변주](./animation-and-variation.md) 참조.
- `seed`(씨앗값): `auto` / `random` / 고정 숫자 / 고정 문자열을 받아 바탕 요소의 `--fy-seed`와 `data-fy-seed`로 정규화한다. `auto`/`random` 입력 원문은 그대로 두고 그릴 때마다 새 숫자로 재해석한다. 단 글꼴 스타일 재해석(restyle)은 새 입력이 아니라 구조 보정이라, 속성 원문이 그대로면 직전에 해석된 씨앗값을 유지한다(JS 옵션으로 준 씨앗값은 1회성이라 유지하지 않는다). 분리 상태의 그리기를 연결 시 마치는 다시 그리기도 같은 호출이라 같은 씨앗값을 쓴다.
- `jamo-seeds` / `data-jamo-seeds`: 켜면 그릴 때마다(자동 다시 그리기 포함) `FontKku.applyJamoSeeds(host)`를 적용해 각 자모 노드의 `--fy-jamo-seed`가 다시 그린 뒤에도 유지된다. boolean 속성이라 값 없이 쓰거나 `"true"`/`"on"`이면 켜지고 `"false"`/`"off"`/`"none"`/`"0"`이면 꺼진다. JS 옵션 `jamoSeeds`는 `true`/`false` 또는 `applyJamoSeeds` 옵션 객체(`{ property, salt, hash }`)를 받는다(이 호출 1회). 켰을 때만 바탕 요소에 `data-fy-jamo-seeds="true"`를 찍으므로 기본 DOM 계약은 그대로다. 다른 언어 구현(`render_html`)은 이 속성과 `--fy-jamo-seed`를 내보내지 않는다 — `seed="auto"`처럼 브라우저 전용 값이다.

### 2. 명령형 API (Imperative API)

전역 네임스페이스를 제공한다.

```ts
window.FontKku.define()
window.FontKku.bootstrap(root?)
window.FontKku.render(target, options)
window.FontKku.refresh(target, options?)
window.FontKku.refreshAll(root?)
window.FontKku.loadFont(href, { root }?)  // Promise<HTMLElement[]>
window.FontKku.retryFont(host)     // HTMLElement | null, 현재 주소의 자동 로딩 재시도
window.FontKku.fontInfo(host)      // { font, id, contract, material, loaded } | null
window.FontKku.upgrade(target)
window.FontKku.upgradeAll(root?)
window.FontKku.decomposeGlyph(char)
window.FontKku.createTextModel(text)
window.FontKku.isHangulSyllable(char)
window.FontKku.renderText(text)
window.FontKku.hashSeed(value)
window.FontKku.applyJamoSeeds(target, options?)
window.FontKku.registerJamo(name, cells, options?)
window.FontKku.jamoSets()
window.FontKku.placementTable
window.FontKku.version
```

`hashSeed`/`applyJamoSeeds`의 옵션 상세(`{ property, salt, hash }`)와 세그먼트 순번 인라인 변수 계약은 [움직임과 런타임 변주](./animation-and-variation.md)가 정본이다.

### 3. 그리기 이벤트

모든 그리기(명시적 호출과 자동 다시 그리기) 뒤에 바탕 요소에서 `font-kku:render` `CustomEvent`가 발생한다(`bubbles: true`, `composed: true`). 원문·구조 변경과 명시적 `render`/`refresh`는 관리 DOM을 다시 만든다. 크기·간격·움직임 등 비구조 속성만 바뀌는 자동 갱신은 기존 노드를 유지한다. 벡터 행 변경의 재료 갱신은 SVG만 바꾼다. 후처리는 이 이벤트에서 멱등하게 적용하며, 모든 이벤트가 전체 노드 교체라는 가정은 하지 않는다.

```js
document.addEventListener("font-kku:render", (event) => {
  // event.target: host
  // event.detail: { reason, font, source, resolved }
});
```

- `reason`: `render`(`FontKku.render`) · `refresh`(`FontKku.refresh`) · `upgrade`(`upgrade`/`upgradeAll`/`bootstrap`의 첫 그리기) · `connect`(전용 태그 연결, 분리 상태 그리기의 연결 시 해석, 이동 뒤 재확인) · `attribute`(옵션 속성 변경) · `mutation`(원문 변경) · `restyle`(늦게 도착한 글꼴 CSS, `refreshAll`, `loadFont`)
- `font`: 그리기에 쓰인 정규화된 글꼴 이름, `source`: 원문
- `resolved`: `false`면 바탕 요소가 분리된 상태에서 그려져 글꼴 스타일을 아직 해석하지 못했다(연결 시 해석되고, 결과가 다르면 `connect` 그리기가 한 번 더 온다).
- 글꼴 id/contract처럼 DOM을 바꾸지 않는 메타데이터만 바뀐 재해석은 그리기가 아니므로 이벤트가 없다(`fontInfo()`만 갱신).
- 여러 바탕 요소를 한 번에 그리면 일괄 처리(batch)의 모든 쓰기가 끝난 뒤 바탕 요소 순서대로 발생한다. 리스너에서 바탕 요소 속성을 바꾸면 그 변경은 다음 자동 다시 그리기가 된다.

목적은 다음과 같다.

- 전용 태그를 쓰기 어려운 환경 지원
- 기존 HTML 태그에 점진적 도입 지원
- 동적 콘텐츠 삽입 후 수동 업그레이드 지원
- 테스트와 디버깅 단순화
- 평문 모드 / 씨앗값 도우미 함수 / 분해 결과를 살펴보는 경로 제공
- 런타임이 실제 쓰는 9개 배치 항목을 동결된 방어적 복사본으로 살펴보고 `spec/tables.json`과 대조할 수 있는 경로 제공

## 런타임 계약

### 자동 시작 (bootstrap)

- IIFE 스타일 브라우저 런타임을 제공한다. 빌드 없이 동작하고, CommonJS 환경에는 `module.exports`로 같은 API를 노출한다 (루트 `package.json`은 npm 메타데이터 용도).
- 페이지당 런타임은 하나다. 일반 `<script>`와 ESM 진입점 `font-kku.mjs`(내부에서 `font-kku.js`를 side effect로 import)를 함께 로드하거나 스크립트를 두 번 로드하면, 뒤에 로드된 쪽이 이미 있는 `globalThis.FontKku`를 그대로 쓴다(바탕 요소 상태·observer·stylesheet 리스너가 하나). 버전이 다르면 console 경고를 한 번 남기고 먼저 로드된 런타임을 쓴다.
- 스크립트 로드 시 `customElements.define("font-kku", ...)`를 자동 수행한다.
- DOM 준비 후 기본 선택자 `.font-kku`를 대상으로 자동 업그레이드를 수행한다.
- 이미 등록된 경우 중복 정의를 피한다.

- **한 줄 설치**: `data-fonts` 속성이 있는 일반 `<script>`로 로드되면 스크립트 주소 기준으로 `font-kku.css`와 나열한 글꼴의 `profiles/<이름>.css`를 `loadFont`로 붙인다. 이름은 `font` 속성과 같은 규칙으로 정규화하고, 파일 이름 없는 CDN 짧은 주소는 패키지 폴더로 본다. CSS가 도착(또는 실패)할 때까지 `style[data-font-kku-loader]`가 관리 root를 가리고 늦어도 3초 뒤 걷는다. `document.currentScript`가 없는 ESM에서는 동작하지 않는다([ADR-010](../ADR/ADR-010-derived-fonts-and-script-loader.md)).

자동 등록/문서 스캔이 필요 없는 사용처는 런타임을 불러오기 전에
`globalThis.FontKkuConfig = { bootstrap: false }`를 설정한다. 이 끄기 설정은
`FontKku` API 생성을 막지 않으며, 이후 `FontKku.bootstrap(root)`를 호출하면 같은
등록·업그레이드 파이프라인을 명시적으로 실행한다. 기본값은 하위 호환을 위해 계속
자동 시작이다.

### 변경 종류별 갱신

런타임은 **표시할 노드 자체가 달라지는 변경**, **기존 노드에 적용할 값만 달라지는 변경**, **노드 안의 벡터 그림만 달라지는 변경**을 구분한다. 예를 들어 크기 24px를 32px로 바꿀 때는 이미 있는 `한`의 초성·중성·종성 노드를 그대로 두고 바탕 요소의 크기 값을 고친다. 원문을 `한`에서 `글`로 바꾸면 새 글자 구조를 만든다.

| 입력 또는 계기 | 실제 처리 | 기존 관리 root·자모 노드 |
|---|---|---|
| 첫 업그레이드·첫 연결·첫 `render()` | 원문을 읽고 글자·자모 트리를 생성 | 새로 생성 |
| 원문 텍스트 변경 | 변경된 원문 전체를 모델로 만들고 관리 트리를 교체 | 다시 생성 |
| 정규화된 `font`·`jamo-set`·획 깊이 변경 | 새 옵션과 CSS로 트리를 구성 | 다시 생성 |
| CSS 표현 모드·자모 깊이·재료·지원 자모 종류·마스크 칠·획 깊이 변경 | 스타일을 다시 해석하고 구조 갱신 | 다시 생성 |
| `size`·`spacing`·`wrap-unit`·`animate`의 자동 속성 갱신 | 아래 보존 조건이 맞으면 바탕 요소의 확정 속성·CSS 변수 갱신 | 유지 |
| `refreshAll()`에서 `--fy-sprite-row` 변경 발견 | 선택된 벡터 칸이 달라진 자모의 SVG만 교체·추가·제거 | 자모까지 유지, 해당 SVG는 바뀔 수 있음 |
| `refreshAll()`에서 글꼴 id/contract만 변경 | `fontInfo()`에 쓰는 상태 갱신 | 유지, 렌더 이벤트 없음 |
| 색·위치 등 CSS가 직접 처리하는 값만 변경 | 브라우저가 기존 노드의 스타일을 적용 | 런타임 트리 재생성 없음 |
| 명시적 `render(host, options)`·`refresh(host, options)` | 크기만 전달해도 전체 그리기 파이프라인 실행 | 다시 생성 |

속성 갱신의 보존 조건은 원문·정규화 글꼴·자모 세트·명시/계산된 획 깊이·표현 모드·자모 깊이·재료 메타데이터·씨앗값·자모 씨앗 옵션이 직전과 같고 관리 root가 남아 있는 것이다. 단순히 속성 이름이 `size`라는 이유만으로 항상 재사용하지는 않는다. `seed="auto"`/`"random"`이 다시 해석되거나, 직전 호출의 일회성 JS 옵션에서 속성 값으로 돌아가거나, 움직임에 따른 CSS가 획 구조를 바꾸면 전체 갱신이 필요할 수 있다.

전용 태그의 속성 변경은 기존처럼 동기로 반영한다. 클래스 방식의 `data-*` 변경은 `MutationObserver`가 전달할 때 반영한다. 여러 `setAttribute`를 하나의 새 비동기 배치로 합치는 기능은 추가하지 않았다. 기존 `render(host, { size, spacing, animate })`는 세 옵션을 한 호출에 적용하지만 **전체 그리기 한 번**이며, 값은 그 호출에만 적용된다. 지속 설정은 속성에 쓴다.

`font-kku:render`는 갱신 알림이다. 이벤트가 왔다고 자모 노드가 모두 바뀌었다고 가정하지 않는다. 바탕 요소만 갱신되면 노드에 붙인 리스너와 DOM 참조가 유지되고, SVG만 바뀌면 그 SVG 안에 붙인 후처리는 다시 적용해야 한다. 명시적 `refresh()`는 페이지의 DOM 후처리를 초기화하고 다시 그릴 수 있는 경로로 유지한다.

### 로딩 실패의 격리와 복구

자동 로딩의 CSS 상태는 `(Document 또는 ShadowRoot, 실제 URL)`, 자모 스크립트 상태는 `(Document, 실제 URL)`에 연결된다. 같은 이름이어도 문서·shadow root 또는 기준 주소가 다르면 별도 CSS 요청이다. 자모 세트 등록은 런타임이 공유하므로 모듈 요청은 shadow root별로 중복하지 않는다. 명시적인 `FontKkuConfig.fontBase`가 스크립트 주소에서 추론한 base보다 우선한다.

| 상태·상황 | 처리 |
|---|---|
| 미요청, 필요한 재료가 없음 | 화면 가까운 바탕 요소부터 요청 |
| 같은 URL이 로딩 중이고 링크·스크립트가 연결돼 있음 | 기존 요청을 공유 |
| 해당 URL 실패 | 오류를 기록하고 가림막을 해제; 무한 자동 재시도는 하지 않음 |
| `retryFont(host)` | 현재 주소의 실패 상태를 지우고 자동 로딩 경로로 재진입 |
| 기준 주소 변경 | 바뀐 URL은 새 요청으로 취급; `refresh()`·`refreshAll()` 등으로 다시 확인 |
| 성공한 CSS 링크 또는 로딩 중인 링크·스크립트 제거 | 다음 로딩 확인에서 오래된 상태를 버리고 필요한 요청을 다시 생성 |
| 제거·교체한 요청의 늦은 load/error 이벤트 | 현재 요청 객체와 일치하지 않으면 새 요청 상태를 변경하지 않음 |

`font-kku:loaderror`는 호스트에서 발생하는 bubbling/composed 이벤트이고 `detail`은 `{ kind: 'font' | 'jamo-set', name, url, error }`다. 자모 스크립트를 받았지만 요청한 세트를 등록하지 않은 경우도 실패다. 폰트 CSS와 자모 모듈이 모두 필요하면 독립적으로 요청하며, 하나가 진행 중이어도 다른 요청의 시작을 막지 않는다.

`retryFont`는 대상 요소 또는 `null`을 즉시 반환하며 성공을 기다리는 Promise가 아니다. 관리 중인 바탕 요소와 유효한 자동 로딩 기준 주소가 있어야 하고, 자동 로딩을 껐으면 재시도하지 않는다. 화면 밖 요소는 기존 지연 로딩 정책을 따른다. CSS 도착을 직접 기다리려면 `loadFont(href, { root })`의 Promise를 사용한다. 그 API의 직접 실패는 Promise rejection으로 받는다. 자동 로딩의 오류 이벤트와 혼동하지 않는다.

가림막은 성공·실패 또는 제한 시간 뒤 해제된다. 이는 텍스트를 무기한 가리지 않기 위한 동작이며, 제한 시간 자체가 네트워크 요청의 실패 판정이나 재시도를 뜻하지 않는다. 글꼴 CSS나 자소판 파일이 잘못된 경우의 완전한 시각적 복구까지 보장하지 않으며, 페이지는 오류 이벤트에서 다른 글꼴 선택이나 재시도 표시를 제공할 수 있다.

### 부분 벡터 세트와 재료 갱신

벡터 세트는 `sprite` 재료 글꼴 위에서 적용한다. 호스트의 `data-fy-material="vector"`는 세트를 선택했다는 표시이고, 모든 자모에 SVG가 있다는 뜻은 아니다. 실제 SVG가 생긴 자모에만 `data-fy-vector-cell="r<행>-<자모>"`가 붙는다.

예를 들어 `가나`에 `r0-ㄱ`만 등록하면 `ㄱ`은 그 벡터를 쓰고 `ㄴ`·`ㅏ`는 기반 자소판을 계속 쓴다. 기반 글꼴이 마스크 칠을 쓰면 누락 칸도 같은 마스크 방식으로 표시한다. 기반 글꼴의 지원 자모 종류에 포함되지 않는 노드는 원래 기기 글꼴 대체 표시를 따른다. 대체할 자소판 자체가 없거나 고장 난 경우까지 새 그림을 만들어 주는 기능은 아니다. 빈 세트와 도형이 하나도 없는 칸은 `registerJamo()`에서 오류로 거부한다. 일부 칸만 있는 유효한 세트는 허용한다.

`refreshAll`은 벡터 자모의 계산된 `--fy-sprite-row`를 다시 읽는다. 등록된 새 칸으로 바뀌면 SVG를 바꾸고, 새 칸이 없으면 이전 SVG와 표식을 제거해 자소판 표시로 돌아간다. 같은 칸의 SVG는 유지한다. 색·위치처럼 CSS로 즉시 반영되는 변경까지 모두 DOM 변경으로 보고하지는 않는다. 임의의 CSSOM 변경을 자동으로 감지하는 기능은 아니므로 `<style>` 내용·`adoptedStyleSheets`·직접 지정한 행 변수를 바꾼 뒤에는 필요에 따라 `refreshAll(root)`을 호출한다. 상세 결정은 [ADR-020](../ADR/ADR-020-rendering-boundaries-and-recovery.md)을 따른다.

### 바탕 요소 모드

런타임은 두 가지 바탕 요소 모드를 동일한 내부 파이프라인으로 처리한다.

- 전용 태그 모드: `<font-kku>`
- 클래스 방식: `.font-kku`

클래스 방식에서는 다음 규칙을 따른다.

- 원문은 바탕 요소의 `textContent`에서 읽는다.
- 옵션은 작성자가 쓴 `data-*` 속성에서 읽으며, 그리는 중 이 입력을 정규화 출력으로 덮어쓰거나 삭제하지 않는다.
- 확정 상태는 `data-fy-font`, `data-fy-profile`, `data-fy-size`, `data-fy-spacing`, `data-fy-wrap-unit`, `data-fy-animate`, `data-fy-seed`에 기록한다. CSS는 이 네임스페이스를 기준으로 동작한다.
- 중복 처리 방지는 DOM 표식이 아니라 런타임 상태로 판단한다. `upgrade()`/`upgradeAll()`은 이 런타임이 아직 관리하지 않는 바탕 요소만 그린다. `cloneNode(true)`한 바탕 요소나 다른 언어 구현이 만든 정적 HTML처럼 `data-fy-upgraded="true"`와 관리 DOM은 있지만 상태가 없는 바탕 요소도 업그레이드되고, 원문은 `data-source` → `sr-source` 순으로 복구한다.
- 바탕 요소 자신의 `data-font`, `data-profile`, `data-size`, `data-wrap-unit`, `data-spacing`, `data-animate`, `data-seed`, `data-jamo-seeds`, `data-jamo-set`, `data-stroke-depth` 변경만 다시 그리기 계기로 본다. 값이 그대로인 쓰기와 생성된 자모 노드에 페이지가 쓴 `data-*`는 무시한다.

### 요소 생애 주기

- 전용 태그는 `connectedCallback`에서 처음 그린다. 업그레이드 때 속성마다 호출되는 `attributeChangedCallback`은 첫 그리기 전이라 무시하므로 바탕 요소 하나당 그리기는 한 번이다. `define()`이 문서에 이미 있는 `<font-kku>`를 업그레이드할 때는 그 첫 그리기들을 한 번의 일괄 처리로 모은다(성능 전략).
- 문서가 아직 파싱 중(`document.readyState === "loading"`)이고 자식이 없는 전용 태그 — `<head>`에서 `FontKku.define()`을 부른 뒤 파서가 만든 바탕 요소 — 는 자식 텍스트가 오기 전이라 그리기를 `DOMContentLoaded`까지 미룬다.
- 원문 텍스트나 트리를 결정하는 옵션이 바뀌면 관리 DOM 전체를 다시 생성한다. 비구조 옵션만 바뀌고 위 보존 조건이 맞으면 기존 관리 DOM에 바탕 요소 설정만 반영한다. 관리 root·`sr-source` 옆에 새로 들어온 텍스트/요소 자식(`host.append("추가")`, 파서가 늦게 넣은 텍스트)은 새 입력이라 문서 순서대로 원문에 합쳐진다. 관리 root 안쪽(생성된 자모 노드)의 변경은 원문 변경이 아니다.
- 연결이 끊긴 전용 태그는 observer를 끄고, 다시 연결될 때 그동안 바뀐 속성·원문을 비교해 반영한다. 바뀐 게 없으면(단순 이동) 새 위치의 스타일을 다음 프레임에 다른 바탕 요소와 함께 한 번에 확인하고, 구조가 달라졌을 때만 다시 그린다.
- **분리 상태 그리기.** 분리된(detached) 요소는 computed style이 비어 깊이(depth)·expression mode·재료를 읽을 수 없다. 이런 그리기는 "미해석"으로 표시되고, 같은 글꼴로 이미 해석한 적이 있으면 그 구조를 그대로 쓴다(가상 리스트가 분리한 행의 텍스트를 바꿔 재사용해도 모양이 유지된다). 바탕 요소가 연결되면 해석을 마치고, 결과가 다르면 같은 호출의 옵션으로 한 번 더 그린다(`font-kku:render` reason `connect`). 전용 태그는 `connectedCallback`에서 동기로 처리한다. 클래스 방식은 생애 주기 콜백이 없어, 미해석 바탕 요소가 있는 동안만 문서(와 바탕 요소가 그려진 적 있는 shadow root)의 삽입을 보는 `MutationObserver` 하나와 다음 화면 프레임 확인으로 처리한다. 미해석 바탕 요소는 약하게(WeakRef) 잡고, 남은 게 없으면 observer를 끊는다. `refreshAll()`도 연결된 미해석 바탕 요소를 해석한다.
- 명시적 갱신이 필요하면 `refresh()`로 같은 전체 그리기 파이프라인 실행
- **글꼴 CSS 재해석(restyle).** 글꼴 CSS가 첫 그리기 뒤에 도착하면 stylesheet `load` 이벤트(capture 단계)에서 깊이·expression mode·글꼴 메타데이터(`--fy-font-id`, `--fy-contract`, `--fy-material`, `--fy-sprite-kinds`)를 직전 그리기의 글꼴로 다시 해석한다. DOM 구조를 바꾸는 값(expression mode, 깊이, 재료)이 달라진 바탕 요소만 다시 그리고, 이 다시 그리기는 다른 자동 경로와 같이 속성을 다시 읽는다 — 직전 호출의 JS 옵션은 승계되지 않고(ADR-002), 속성 원문이 그대로인 씨앗값만 해석값을 유지한다. 글꼴 id/contract만 달라졌으면 DOM을 다시 만들지 않고 `fontInfo()` 상태만 갱신한다. 상관없는 stylesheet가 로드돼도 구조가 그대로인 바탕 요소는 건드리지 않는다.
- load 리스너는 자동 시작 때와 첫 그리기 때 문서마다 한 번, 그리고 바탕 요소가 그려진 shadow root마다 한 번 설치된다(`load`는 composed가 아니라 문서 리스너가 shadow root 안 link를 보지 못한다). 그래서 `FontKkuConfig = { bootstrap: false }` 페이지의 `render()`도 늦은 CSS를 받는다. load 이벤트가 없는 스타일 변경(`adoptedStyleSheets`, `<style>` 텍스트 교체)은 `refreshAll(root?)`로 같은 경로를 수동 실행한다. ([ADR-008](../ADR/ADR-008-font-contract-v2.md) §4)
- `refreshAll(root?)`는 querySelectorAll 대신 그려진 바탕 요소 레지스트리(WeakRef)를 돌므로 shadow root 안 바탕 요소도 포함한다. `root`를 주면 그 아래(shadow-including)로 범위를 좁힌다. 반환값은 해석 결과가 바뀐 바탕 요소(전체를 다시 그리거나 벡터 그림을 바꾸거나 `fontInfo()`만 갱신한 바탕 요소)다.
- JS로만 준 글꼴은 1회성이다: `render(el, { font: "x" })` 뒤 `x`의 CSS가 늦게 도착해 구조가 다시 해석되면 속성 기준으로 돌아간다. 늦게 로드할 글꼴은 속성으로 지정하거나 `await FontKku.loadFont(href)` 뒤에 그린다.

클래스 방식에서는 구현된 `MutationObserver`가 작성자가 쓴 `data-*`와 외부 텍스트 변경을 감지한다. 동적으로 삽입된 바탕 요소는 `upgrade()`/`upgradeAll()`로 최초 업그레이드한다.

권장 기본값은 다음과 같다.

- 초기 로드 시 `upgradeAll(document)`
- 바탕 요소 텍스트 변경: `refresh(target)` 또는 observer 기반 자동 감지
- `data-*` 옵션 변경: observer가 감지해 변경 종류에 맞춰 바탕 요소 설정 갱신 또는 전체 다시 그리기

### 원문 보존과 접근성

- 원문 텍스트는 보존한다. ([ADR-003](../ADR/ADR-003-accessibility-contract.md))
- 관리 root(`part="root"`, `data-fy-root="true"`)에는 `aria-hidden="true"`를 부여해 분해 자소 DOM을 보조기기에서 숨긴다.
- root의 형제 `part="sr-source"`(`data-fy-sr="true"`) 노드가 원문 텍스트를 담아 스크린리더 낭독/복사의 1차 대상이 된다 (시각적으로만 숨김).
- `aria-label`과 `data-source`는 호환용으로 계속 기록한다. 비표준 `role="text"`는 사용하지 않는다.
- 상태 없는 관리 DOM(복제, 외부 주입)의 원문 복구는 `data-source` → `sr-source` → `textContent` 순으로 대체한다. observer 콜백은 상태를 전달받아 외부 변경(mutation)에도 원문이 오염되지 않는다.
- 클래스 방식에서도 바탕 요소 원문 의미를 유지해야 한다.

## 그리기 전략

### 유니코드 분해

- 한글 완성형은 유니코드 산술 분해를 사용한다.
- `johab`, `iconv`, 서버 인코딩 변환은 사용하지 않는다.
- 초성/중성/종성 기본 테이블만 유지하고, 복합 모음/복합 받침은 소형 규칙 집합으로 관리한다.

### DOM 모델

- 전체 트리를 새로 만들 때는 문자열 기반 `innerHTML` 조립 대신 DOM API로 노드를 생성한다. 관리 root(`span[part="root"]`) 트리를 문서 밖에서 다 만든 뒤 `sr-source`와 함께 `host.replaceChildren(root, srNode)` 한 번으로 교체한다. 별도 `DocumentFragment`는 쓰지 않는다 — 분리된 span 트리가 같은 역할을 한다. 노드는 바탕 요소의 `ownerDocument`에서 만들어 iframe 안 바탕 요소도 자기 realm의 노드를 받는다.
- 줄/단어/공백/글자(line/word/space/glyph) 세그먼트 트리를 먼저 만들고 그 결과를 DOM으로 그린다.
- 글자를 감싸는 요소와 자소 단위 노드를 분리한다.
- 글꼴 CSS가 제어할 수 있도록 안정적인 `part`, `data-*`, CSS 변수 계약을 제공한다.
- 전용 태그와 클래스 방식이 같은 내부 DOM 계약을 공유해야 한다.
- 일반 글꼴은 현재 `gothic.css`의 한 단계 저작을 기준으로 한다. 바탕 요소 한 블록에서 자리 변수와 묶음 변수를 설정하는 방식이 기본이고, 런타임은 필요할 때 쓸 구조 정보로 글자의 `data-fy-layout-bucket`, `data-layout-key`, `data-fy-axis`, `data-fy-open`, `data-fy-jong-count`, `data-fy-role`을 제공한다. `gothic2.css`는 별도 전략이 아니라 `gothic.css`를 불러오는 하위 호환 별칭이다.
- 한글 글자는 `[part="glyph"] > [part~="glyph-body"] > ...` 계층을 쓰고, 복합 중성은 필요할 때 `jungseong-cluster` 묶음 요소 안에 `jungseong-base` / `jungseong-tail` 자모를 넣는다.
- 겹받침은 필요할 때 `jongseong-cluster` 묶음 요소 안에 `jongseong-left` / `jongseong-right` 자모를 넣는다.
- 비한글 글자는 `[part="glyph"]` 아래 단일 `[part="content"]` 노드를 두고 `data-glyph-kind`로 스타일을 분기한다.

### 분절과 줄바꿈 제어

- 명시적 줄바꿈은 `line` 세그먼트로 유지한다.
- 공백 기반 `word` 세그먼트를 도입해 단어 단위 제어를 가능하게 한다.
- 연속 공백과 NBSP는 별도 `space` 세그먼트로 보존한다.
- 한글 음절과 일반 문자는 `glyph` 세그먼트로 정규화한다.
- 줄바꿈 정책은 `wrap-unit="glyph" | "word" | "line"` 형태로 제공한다.
- 텍스트 정규화·분절과 자모 모델을 만든 뒤 DOM으로 출력한다. 모델의 표시 자모 선택과 DOM의 자리·역할 부여는 공통 생성 계획(`spec/render-plan.json`)을 사용한다. 별도의 공개 렌더 계획 API나 범용 DOM diff를 추가한 것은 아니다.

### 글꼴 모델

- 글꼴 CSS는 바탕 요소 범위에 메타데이터 `--fy-font-id: <name>`, `--fy-contract: 2`, `--fy-material: system | sprite | bundled`를 선언한다([ADR-008](../ADR/ADR-008-font-contract-v2.md) §4). 런타임은 그릴 때 `getComputedStyle(host)`로 깊이·expression mode와 함께 이 값을 읽는다.
- `FontKku.fontInfo(host)`는 직전 그리기 시점의 메타데이터를 돌려준다. `font`는 요청(정규화)된 이름, `id`/`contract`/`material`은 CSS가 선언한 값(아직 없으면 `id`·`contract`는 `null`, `material`은 `"system"`), `loaded`는 `id === font`, 즉 요청한 글꼴의 CSS가 바탕 요소에 도달했는지다. 그려지지 않은 바탕 요소면 `null`이다. 로딩 상태를 DOM 속성으로 찍지 않는 것은 다른 언어 구현의 DOM 계약(html-cases)을 바꾸지 않기 위해서다.
- 재료 노출: 글꼴의 `--fy-material`이 `system`이 아니면 바탕 요소에 `data-fy-material="<material>"`을 찍는다. `sprite`이면 `--fy-sprite-kinds`에서 `consonant`/`vowel`/`coda-cluster`만 골라 `data-fy-sprite-kinds`로 찍는다. 코어의 그림 자소(`sprite`) 재료 규칙이 이 두 속성과 노드의 `data-sprite-jamo-kind`로 칠할 노드를 고른다([그림 자소 글꼴](./image-sprite-fonts.md)). 기기 글꼴(`system`) 재료의 글꼴(sebul, gothic)에서는 두 속성을 지우므로 다른 언어 구현의 DOM 계약(html-cases)은 그대로다. 두 값도 재해석 비교 대상이라 늦게 도착한 그림 자소 글꼴 CSS가 바탕 요소를 다시 그린다.
- `FontKku.loadFont(href, { root }?)`는 정적 stylesheet 로더다. 서버 동작은 없다.
  - `root`는 Document(기본: 현재 document, link는 `<head>`) 또는 ShadowRoot(link는 shadow root 안 — document stylesheet는 shadow tree를 스타일하지 않는다)다.
  - 같은 URL의 `<link rel="stylesheet">`가 `root`에 있고 규칙을 읽을 수 있는 sheet로 이미 로드돼 있으면 재사용하고 곧바로 `refreshAll(root)` 결과로 resolve한다. 아직 로드 중이면 그 load를 기다린다. 로드가 끝났는데 규칙을 읽을 수 없는 링크(실패했거나 — Chromium은 실패한 링크에도 빈 sheet를 준다 — 비어 있거나 cross-origin)는 믿지 않고 새 link로 다시 요청한다.
  - 성공 여부는 이 호출이 붙인 load/error 리스너로 판단한다. load가 끝나면 `refreshAll(root)`를 실행하고 해석 결과가 바뀐 바탕 요소 목록으로 resolve한다(그 사이 stylesheet watcher가 먼저 해석했다면 빈 목록일 수 있다).
  - 같은 URL·`root`의 호출은 대기 중이거나 성공한 동안 **같은 Promise**를 돌려준다. 캐시한 link가 문서에서 빠졌으면(글꼴 전환기가 제거) 새 link를 삽입한다.
  - 실패하면 이 호출이 삽입한 link를 지우고 reject하며, 다음 호출은 다시 요청한다. 문서가 없는 환경(Node)에서는 reject된 Promise를 돌려준다.
- `--fy-contract`가 런타임이 지원하는 값(2)보다 크면 글꼴별로 한 번 console 경고만 하고 그리기는 계속한다.
- 기본 시각 설정은 CSS 글꼴(`font`)로 제공한다.
- `font`는 글꼴 이름이고, 세벌식/일반 구분은 글꼴 CSS가 선언하는 `--fy-expression-mode`가 맡는다.
- 글꼴은 초성/중성/종성 위치, 크기, 각도, 줄/단어/공백/글자 간격을 정의한다.
- size는 글꼴 이름 선택이 아니라 바탕 요소 배율 입력값이다. 기본은 `font-size`와 `em` 기반 변수로 흡수한다.
- 현재 저장소는 CSS 글꼴 `sebul`/`gothic`, 그림 자소 글꼴 `sprite-example`/`sprite-system`, 폐기 예정 별칭 `default`/`classic`/`gothic2`를 포함한다. 활성 글꼴과 기본 깊이(depth)의 기계 정본은 `spec/fonts.json`이다.
- 정규화된 글꼴이 바뀌는 전환은 관리 DOM 전체를 다시 생성하고 정본 바탕 요소 속성과 CSS 적용을 갱신한다. 크기·간격 같은 표시 옵션만 바뀌는 경로와 구분한다.
- 메타데이터 키워드(`--fy-material`, `--fy-sprite-kinds`)는 깊이·expression mode 키워드처럼 대소문자를 구분하지 않는다(`Sprite` → `sprite`).

## 성능 전략

### 구현된 안전장치

- 텍스트를 줄/단어/공백/글자 세그먼트 트리로 정규화
- 음절 분해 결과 캐시
- 세그먼트 트리 캐시
- 자소 배치 토큰 캐시
- `.font-kku` 자동 업그레이드는 전체 DOM 스캔 대신 선택적 선택자 탐색으로 제한
- 전체 갱신 때는 바탕 요소 하나의 관리 DOM을 문서 밖에서 만든 span 트리로 구성하고 `replaceChildren` 한 번으로 교체
- 보존 조건을 만족하는 자동 속성 갱신은 기존 관리 DOM을 재사용하고, 벡터 재료 갱신은 바뀐 칸의 SVG만 교체
- 여러 바탕 요소를 한 번에 그릴 때(`upgradeAll`, `bootstrap`, `define()`의 업그레이드, `refreshAll`, 연결 확인) 모든 바탕 요소의 글꼴 관련 속성을 먼저 쓰고, 모든 바탕 요소의 computed style을 읽은 뒤, DOM을 만든다. 바탕 요소마다 쓰기와 읽기를 번갈아 하면 바탕 요소 수만큼 style 재계산이 강제된다(앞 바탕 요소가 방금 넣은 자모 트리까지 포함).
- 세그먼트 트리 캐시는 항목 수(64)와 총 글자 수(16384자)로 제한하고, 2048자를 넘는 텍스트는 캐시하지 않는다. 내부 그리기 경로는 캐시한 모델을 읽기만 하므로 방어적 복사를 하지 않는다(공개 `createTextModel()` 반환값은 계속 복사본).
- 연결 직후 전체 재측정보다 정적 토큰 기반 배치 우선
- 중복 그리기 방지

### DOM 재사용 측정의 의미

2026-10-11 측정은 첫 렌더를 마친 `한글` 100회 반복(200음절)에 대해 `size` 속성을 20회 바꾸는 동안 `document.createElement`가 몇 번 호출되는지 센 것이다. 이전 구현은 매번 관리 트리를 새로 만들어 총 **20,080회**, 개선 후 같은 조건에서는 **0회**였다. 이 문자열의 기존 트리는 한 번에 1,004개 요소를 만들었으므로 `1,004 × 20 = 20,080`이다. 개선 후에는 처음 만든 요소의 크기 설정만 바뀌었다. 첫 렌더에 필요한 노드 생성은 측정에서 제외돼 있다.

여기서 0은 **그 20회 속성 갱신 동안 새 HTML 요소를 만들지 않았음**을 뜻한다. 화면을 그리는 일이 없어졌거나 메모리·CPU 비용이 0이라는 뜻은 아니다. 옵션 해석, 바탕 요소 속성·스타일 쓰기, 이벤트 전달, 브라우저의 스타일 계산·배치·칠하기는 남는다. 원문·글꼴·구조를 바꾸거나 `refresh()`를 명시적으로 호출하면 노드는 다시 만들어진다. SVG 생성이나 모든 자바스크립트 객체 할당량을 센 측정도 아니다.

같은 단일 실행의 시간은 58.2ms에서 12.2ms로 줄었지만, **CSS를 싣지 않은 빈 Chromium 페이지의 특정 조건**에서 얻은 참고값이다. 실제 글꼴·움직임·긴 문장·기기별 프레임 속도가 같은 비율로 개선된다는 보장은 없다. 이 측정이 직접 확인한 성과는 불필요한 노드 생성 제거와 기존 root 보존이다. 실행 조건과 검증 증거는 [설계 검토 기록](../REVIEW/2026-10-11-design-flexibility-review.md)에 둔다.

### 개선 후보

- 긴 문서에 대한 지연 업그레이드
- 필요 시 `IntersectionObserver` 기반 화면 영역(viewport) 지연 그리기

## 접근성과 안전

- 스크립트 문자열 주입 방식 금지
- 사용자 입력을 HTML로 재해석하지 않는다
- 스크린리더용 원문 텍스트를 유지한다
- 자소 장식 출력이 실패해도 원문 텍스트로 대체할 수 있어야 한다

## 배포 방향

- 1차 배포물 (저장소 루트에 그대로 호스팅):
  - `font-kku.js`
  - `font-kku.css`
  - `profiles/sebul.css`
  - `profiles/default.css` (별칭)
  - `profiles/classic.css` (별칭)
  - `profiles/gothic.css`
  - `profiles/gothic2.css` (폐기 예정 별칭)
  - `profiles/sprite-example.css`
  - `profiles/sprite-example.svg`
  - `profiles/sprite-system.css`
  - `profiles/sprite-system.svg`
- 루트 `package.json`(`font-kku` 0.4.0, `bin/font-kku-text.js`, 조건부
  package export, TypeScript 선언, CSS/글꼴(profiles)/spec subpath 등록)과
  `LICENSE`(MIT)가 있다. CommonJS `require()`와 빌드 없는 ESM 진입점
  `font-kku.mjs`(default + named export)를 실제 tarball 사용처에서 검증한다. 저장소 파일을 직접 로드하는 빌드 없는 배포도 계속
  유지하며 레지스트리 게시는 아직 하지 않았다.
- 기계가 읽는 계약인 `spec/css-variables.json`, `tables.json`,
  `test-cases.json`, `html-cases.json`은 npm package subpath로 공개한다. 내부 자산
  복제용 `spec/asset-mappings.json`은 배포 계약이 아니다.
- 배포 CSS는 원격 글꼴을 참조하지 않는다. `sebul`과 `gothic`은 플랫폼 한글 글꼴
  목록(font stack)을 쓰고 그림 자소 글꼴의 SVG 자소판(직접 그린 그림, ADR-011)은 패키지에 포함한다. 역사적 J해바라기
  비교 스크립트와 라이선스 경계는 `THIRD_PARTY_NOTICES.md`를 따른다.
- 프레임워크 어댑터는 코어 안정화 후 추가

## 브라우저 런타임 범위 밖

- 브라우저 런타임 자체의 서버 DOM 그리기·hydration API. 서버 정적 HTML은 다른 언어 구현의 `render_html`이 공식 경로다.
- Canvas/WebGL 그리기 엔진
- 런타임 내부 편집기 API. 브라우저 저작 도구인 글꼴 작업실(`site/font-studio.html`)은 공개 API만 쓰는 별도 사이트 도구로 제공한다.
- 별도 변주 규칙 엔진/DSL
