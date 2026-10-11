# 프레임워크 안내

`font-kku`(폰꾸)는 한글 완성형 음절을 초성·중성·종성으로 나누어 다시 조립하고, CSS·이미지·씨앗값(`seed`)/상태 기반 변형으로 한글 스타일을 코드처럼 만들고 제어할 수 있게 한 런타임이다. 브라우저에서는 DOM + CSS + 그림 자소로, 필요하면 2줄 평문 모드(`text`)로도 같은 분해 구조를 출력할 수 있다. 핵심 구조는 단순하다. `font-kku.js`가 텍스트를 분해하고, 브라우저 모드에서는 DOM을 만들며, `font-kku.css`가 그 DOM을 배치하고, 글꼴 CSS가 실제 모양을 정한다.

이 문서는 세 가지를 한 번에 설명한다.

1. 프레임워크가 무엇을 하는지
2. 브라우저 모드와 평문 모드(`text`)를 실제 페이지에서 어떻게 쓰는지
3. 글꼴을 만들거나 디버깅할 때 어떤 계약을 봐야 하는지

더 세부적인 설계 문서는 아래를 함께 본다.

- [브라우저 런타임 설계](./browser-runtime-design.md)
- [텍스트 분절 모델](./text-segmentation-model.md)
- [스타일 글꼴 체계](./style-profile-system.md)
- [일반 글꼴 그룹 목록](./general-font-group-catalog.md)
- [평문 모드 설계](./text-mode-design.md)

## 1. 어떤 프레임워크인가

`font-kku`는 일반 웹 글꼴 대체제가 아니다. TTF/OTF 파일을 브라우저에 로드하는 방식이 아니라, 한글 음절을 자소 조합으로 다시 그리는 런타임이다. 그래서 다음 상황에 특히 잘 맞는다.

- 한글을 독특하고 개성 있게 표현하고 싶은 경우
- 생성형·인터랙티브 한글 표현이 필요한 경우
- 손글씨나 직접 만든 스타일을 한글 전반으로 빠르게 확장하고 싶은 경우
- 초기 로딩 성능이 중요한 랜딩 페이지나 마이크로사이트
- 한글 글꼴이 없거나 웹 글꼴을 쓰기 어려운 환경
- 터미널 같은 일반 텍스트 환경까지 같은 조합 구조를 확장하고 싶은 경우

반대로 다음과는 성격이 다르다.

- 일반적인 텍스트 그리기 성능과 호환성이 최우선인 운영용 웹 글꼴
- 캔버스/WebGL 기반 그리기 엔진
- 서버에서 그리기나 PDF 출력 중심 시스템

## 2. 런타임을 구성하는 파일

배포 기준으로 필요한 파일은 세 종류다.

| 파일 | 역할 | 필수 여부 |
| --- | --- | --- |
| [`font-kku.js`](../../font-kku.js) | 한글 분해, 텍스트 모델 생성, DOM 그리기, `renderText()` 평문 모드, 전용 태그/전역 API 제공 | 필수 |
| [`font-kku.css`](../../font-kku.css) | 생성된 DOM을 실제 글자처럼 보이게 배치하는 공통 런타임 기본 CSS | 필수 |
| [`profiles/*.css`](../../profiles/sebul.css) | 글꼴별 위치/크기/간격 값 제공 | 최소 1개 필요 |

이 세 파일은 역할이 다르다.

- `font-kku.js` 없이 CSS만 있으면 아무것도 그려지지 않는다.
- `font-kku.css` 없이 글꼴 CSS만 있으면 DOM은 만들어져도 자소가 정상 배치되지 않는다.
- 글꼴 CSS 없이 `font-kku.css`만 있으면 구조는 생기지만 원하는 스타일 값이 없다.

즉 현재 배포 구조에서는 `font-kku.js + font-kku.css + font CSS`를 함께 로드하는 것이 기본 계약이다.

단, `renderText()`로 2줄 평문만 출력할 때는 `font-kku.js`만 있으면 된다. 이 경로는 글꼴 CSS나 브라우저 DOM을 사용하지 않는다.

## 3. 가장 단순한 시작 방법

### 3.1 브라우저 모드

빌드 없이 바로 쓰는 최소 예시는 아래다.

```html
<link rel="stylesheet" href="./font-kku.css" />
<link rel="stylesheet" href="./profiles/sebul.css" />
<script src="./font-kku.js"></script>

<font-kku font="sebul" size="32">광화문</font-kku>
<span class="font-kku" data-font="sebul" data-size="24">안녕하세요</span>
```

로드 순서는 보통 이렇게 잡으면 된다.

1. `font-kku.css`
2. 사용할 글꼴 CSS
3. `font-kku.js`

아래 예제에서 `gothic`을 사용할 때는 `profiles/gothic.css`도 같은 방식으로 로드한다. 바탕 요소의 `font` 이름만 바꾸고 해당 글꼴 CSS를 생략하면 원하는 모양이 적용되지 않는다.

`font-kku.js`는 로드되면 DOMContentLoaded 시점에 자동으로 `bootstrap(document)`를 호출한다. 즉 대부분의 경우 아래를 직접 쓸 필요가 없다.

```js
window.FontKku.define();
window.FontKku.bootstrap(document);
```

이 두 API는 테스트 환경, 수동 초기화, 동적으로 만든 문서에서만 직접 호출하면 된다.

### 3.2 평문 모드

같은 런타임은 2줄 평문 모드(`text`)도 제공한다. 이 모드는 글꼴 CSS 없이도 구조를 빠르게 확인할 수 있다.

```js
const FontKku = require("./font-kku.js");

FontKku.renderText("안녕하세요 반갑습니다").forEach(function (line) {
  console.log(line);
});
```

정리하면 다음과 같다.

- 브라우저 모드: 실제 DOM/CSS 그리기
- 평문 모드: 구조 확인용 2줄 문자열 출력
- 두 모드 모두 같은 `createTextModel()` 분해 결과를 공유한다.

## 4. 기본 사용 방식

바탕 요소를 만드는 방식은 두 가지다.

### 4.1 전용 태그 방식

`<font-kku>`를 직접 쓰는 방식이다.

```html
<font-kku font="sebul" size="32">서울</font-kku>
<font-kku font="gothic" size="48" wrap-unit="line">광화문 광장</font-kku>
```

이 방식에서는 옵션을 일반 속성으로 준다.

- `font`
- `profile` (호환 별칭)
- `size`
- `spacing`
- `wrap-unit`
- `animate`
- `seed`

`<font-kku>`는 `font`, `profile`, `size`, `spacing`, `wrap-unit`, `animate`, `seed`, `jamo-seeds` 속성 변경을 자동 감지해서 다시 그린다. 값이 그대로인 쓰기는 무시하고, 업그레이드(연결) 때는 한 번만 그린다.

### 4.2 클래스 방식

기존 태그에 `class="font-kku"`를 붙이는 방식이다.

```html
<span class="font-kku" data-font="sebul" data-size="28">안녕하세요</span>
<div class="font-kku" data-font="gothic" data-wrap-unit="word">도시의 밤과 서점</div>
```

이 방식에서는 옵션을 `data-*` 속성으로 준다.

- `data-font`
- `data-profile` (호환 별칭)
- `data-size`
- `data-spacing`
- `data-wrap-unit`
- `data-animate`
- `data-seed`

런타임은 클래스 방식 바탕 요소의 텍스트와 위 속성들(과 켜야 동작하는 `data-jamo-seeds`)을 `MutationObserver`로 감시하고, 값이 바뀌면 다시 그린다. 바탕 요소 자신의 속성만 본다 — 생성된 자모 노드에 페이지가 `data-*`를 써도 다시 그리지 않는다. 이 `data-*`는 작성자가 쓴 지속 입력이라 런타임이 덮어쓰지 않는다. 확정된 상태는 별도 `data-fy-font`/`data-fy-profile`/`data-fy-size`/`data-fy-spacing`/`data-fy-wrap-unit`/`data-fy-animate`/`data-fy-seed`에 기록한다.

## 5. 옵션과 기본값

현재 런타임이 읽는 옵션은 아래다.

| 의미 | 전용 태그 | 클래스 방식 | 기본값 |
| --- | --- | --- | --- |
| 글꼴 | `font` | `data-font` | `sebul` |
| 크기 | `size` | `data-size` | `24px` |
| 간격 | `spacing` | `data-spacing` | 없음 |
| 줄바꿈 단위 | `wrap-unit` | `data-wrap-unit` | `word` |
| 움직임 | `animate` | `data-animate` | 없음 |
| 씨앗값 | `seed` | `data-seed` | 없음 |
| 자모별 씨앗값 (켜야 동작) | `jamo-seeds` | `data-jamo-seeds` | 꺼짐 |

### `font`

- 런타임 기본값은 `sebul`이다.
- 정본 기본 파일은 [`profiles/sebul.css`](../../profiles/sebul.css)다.
- `default`와 `classic`은 모두 `sebul`의 하위 호환 별칭이다.
- 문서와 예제에서는 새 이름인 `sebul`을 우선 쓴다.

예시 글꼴은 다음과 같다.

- `sebul`: 기본 세벌식 표현 (둥근 변형)
- `default`: `sebul` 별칭
- `gothic`: 단순 일반 글꼴 표현
- `classic`: `sebul` 별칭
- `gothic2`: `gothic` 별칭, 폐기 예정

별칭은 런타임(JS)이 정규화한다. `font="default"`나 클래스 방식의 `data-font="default"`로 써도 바탕 요소의 정본 `data-fy-font`/`data-fy-profile`에는 `sebul`이 기록되므로, 글꼴 CSS는 `[data-fy-font="sebul"]` 하나로만 적용 범위를 걸면 된다.

중요한 점은 표현 방식이 JS 옵션이 아니라 글꼴 CSS의 `--fy-expression-mode`에서 결정된다는 것이다. 런타임은 그 결과를 바탕 요소의 `data-fy-expression="sebeol|general"`로 정규화한다. `profile` / `data-profile` / `profile` 옵션도 호환 별칭으로 계속 읽는다.

### `size`

- 숫자나 숫자 문자열이면 `px`로 해석된다.
- 예: `24` -> `24px`
- 길이 문자열이면 그대로 사용된다.
- 예: `1.8rem`, `48px`

정규화된 값은 바탕 요소의 `--fy-size`와 `data-fy-size`에 반영된다.

### `spacing`

`spacing`은 현재 두 군데에 같이 들어간다.

- `--fy-space-width`
- `--fy-word-gap`

즉 공백 폭과 단어 간격을 함께 넓히고 싶을 때 쓰는 간단 옵션이다. 더 세밀한 제어가 필요하면 CSS에서 직접 `--fy-space-width`, `--fy-word-gap`, `--fy-glyph-gap`을 따로 잡는다.

### `wrap-unit`

가능한 값은 `glyph | word | line`이다.

- `glyph`: 가장 유연한 줄바꿈. 단어 안의 글자 사이에서도 줄바꿈 가능
- `word`: 단어를 감싼 요소가 한 덩어리로 묶이고 단어 단위로 줄바꿈
- `line`: 명시적 줄 단위 유지. 각 줄을 감싼 요소 안에서는 줄바꿈하지 않음(nowrap)

### `animate`

내장 움직임은 `rise`, `fade`, `stagger`, `bounce`, `wiggle`, `drift`다.

```html
<font-kku font="sebul" animate="rise">안녕하세요</font-kku>
<font-kku font="sebul" animate="bounce">안녕하세요</font-kku>
```

이 값의 확정 출력 `data-fy-animate="<name>"`을 [`font-kku.css`](../../font-kku.css)의 움직임 선택자가 읽어 글자 단위 움직임을 적용한다. 모두 `prefers-reduced-motion: reduce`에서 자동으로 꺼진다. 계약과 움직임을 직접 추가하는 법은 [움직임과 변주](./animation-and-variation.md)를 본다.

### `seed`

바탕 요소마다 그리는 시점에 `--fy-seed`를 주입해 글꼴 CSS가 난수 기반 변형을 쓸 수 있게 한다.

- `seed="auto"` 또는 `seed="random"` — 그릴 때마다 새 `Math.random()` 값
- `seed="0.42"` 또는 `seed="poster-v1"` — 고정값 (재현 가능)
- 생략 — `--fy-seed` 없음

```html
<font-kku font="drift" seed="auto">흔들리는 글자</font-kku>
```

문자열 씨앗값은 런타임이 결정적인 0~1 값으로 해시해 CSS `calc()`에서 바로 쓸 수 있게 한다.

### `jamo-seeds`

켜면(`<font-kku seed="poster-v1" jamo-seeds>`) 그릴 때마다 `FontKku.applyJamoSeeds(host)`를 자동 적용해 자모 노드별 `--fy-jamo-seed`가 다시 그린 뒤에도 유지된다. 바탕 요소의 씨앗값이 키에 들어가므로 씨앗값이 다른 바탕 요소는 다른 자모 씨앗값을 받는다. 브라우저 전용 기능이라 다른 언어 구현의 `render_html`은 이 값을 내보내지 않는다. 자세한 계약은 [움직임과 변주](./animation-and-variation.md)를 본다.

### 조건/상태 기반 변주

별도 규칙 DSL은 없다. 현재 공개 계약은 바탕 요소의 상태와 런타임이 노출하는 데이터 속성/CSS 변수다.

```html
<font-kku font="sebul" size="48" seed="poster-v1" data-state="idle">한글</font-kku>
```

```css
:where(font-kku, .font-kku)[data-state="active"] [part="glyph"] {
  animation-delay: calc(var(--fy-glyph-index, 0) * 60ms);
}

:where(font-kku, .font-kku)[data-state="active"] [part~="jamo"] {
  --fy-rotate: calc((var(--fy-seed, 0.5) - 0.5) * 8deg);
}
```

```js
host.dataset.state = "active";
FontKku.refresh(host, { seed: "poster-v1" });
FontKku.applyJamoSeeds(host);
```

즉 "조건"은 CSS 선택자와 바탕 요소 상태로, "재현 가능한 난수"는 고정 씨앗값(`seed`)과 도우미 함수로 표현한다. 자세한 계약은 [움직임과 변주](./animation-and-variation.md)를 본다.

## 6. JS API 사용법

스크립트를 로드하면 `window.FontKku`가 생긴다.

```js
window.FontKku.define();
window.FontKku.bootstrap(document);
window.FontKku.render(target, options);
window.FontKku.refresh(target, options);
window.FontKku.refreshAll(root);
window.FontKku.loadFont(href, { root });
window.FontKku.fontInfo(host);
window.FontKku.upgrade(target);
window.FontKku.upgradeAll(root);
window.FontKku.decomposeGlyph("왕");
window.FontKku.createTextModel("안녕하세요");
window.FontKku.renderText("안녕하세요");
window.FontKku.isHangulSyllable("가");
window.FontKku.hashSeed("poster-v1");
window.FontKku.applyJamoSeeds(host);
window.FontKku.placementTable;
window.FontKku.version;
```

`placementTable`은 런타임이 실제로 쓰는 짜임 키(layout-key) 9개와 역할별 배치 토큰 배열을 담은, 동결(frozen)된 방어적 복사본이다.

### `render(target, options)`

대상 노드를 즉시 `font-kku` 바탕 요소로 그린다.

```js
const hero = document.querySelector("#hero");

window.FontKku.render(hero, {
  text: "광화문",
  font: "gothic",
  size: 64,
  wrapUnit: "line",
  animate: "rise"
});
```

특징은 다음과 같다.

- `target`이 `<font-kku>`면 전용 태그 방식으로 처리한다.
- 일반 요소면 클래스 방식처럼 처리한다.
- 내부 자식 노드는 관리용 루트 DOM으로 교체된다.
- 원문은 시각적으로 숨긴 `part="sr-source"` 노드(스크린리더·복사용)와 `aria-label`/`data-source`로 유지되고, 관리 루트에는 `aria-hidden="true"`가 붙는다.

### `refresh(target, options)`

이미 그린 바탕 요소를 다시 그린다.

```js
host.dataset.font = "gothic";
window.FontKku.refresh(host);
```

`options.text`를 넘기면 원문도 함께 바꿀 수 있다.

옵션 우선순위 계약: 속성(또는 `data-*`)이 지속 옵션의 출처라서 `refresh()`는 매번 속성을 다시 읽는다. JS `options`는 해당 호출 1회에만 적용되고 다음 그리기로 이어지지 않는다 — 지속시키려면 위 예시처럼 속성을 바꾼다. 원문 변경, 속성 변경, 늦게 도착한 글꼴 CSS로 생기는 자동 다시 그리기도 전부 속성을 다시 읽는다. JS 옵션의 `undefined`·`null`·빈 문자열은 속성 값으로 대체된다. `seed="auto"`는 그릴 때마다 새 값으로 다시 해석되지만, 글꼴 CSS를 다시 해석할 때는 속성이 그대로면 씨앗값을 유지한다.

분리된(detached) 요소에 `render()`하면 글꼴 스타일을 읽을 수 없어 기본 구조로 그린 뒤, 문서에 연결될 때 같은 호출의 옵션으로 해석을 마친다(구조가 다르면 한 번 더 그린다).

### 크기 조절과 스타일 재해석

전용 태그는 `host.setAttribute("size", "48")`, 클래스 방식은 `host.dataset.size = "48"`로
지속 크기를 바꾼다. 자동 갱신되므로 뒤이어 `refresh()`를 부를 필요가 없다. 원문·글꼴·깊이·
자모 세트·해석된 씨앗값 등이 같으면 기존 자모 DOM을 유지한다. `seed="auto"`처럼 씨앗값이
달라지거나 명시적 `render`/`refresh`를 부르면 전체 다시 그리기 경로를 쓴다.

`FontKku.refreshAll(root)`은 CSS 메타데이터를 재해석한다. 구조가 바뀌면 전체를 다시 그리고,
벡터 행만 바뀌면 그 SVG만 교체하며 같은 칸은 유지한다. `<style>` 내용이나
`adoptedStyleSheets` 변경처럼 stylesheet load 이벤트가 없는 변경 후에 호출한다.

자동 로딩 실패를 다시 시도할 때는 `FontKku.retryFont(host)`를 쓴다. 대상 요소 또는 `null`을
돌려주는 요청 API이며 성공을 기다리는 Promise는 아니다. 실패는 `font-kku:loaderror`의
`detail: { kind, name, url, error }`로 관찰한다. 직접 CSS URL을 지정하고 완료를 기다릴 때는
`await FontKku.loadFont(url, { root })`를 쓴다. 자세한 범위는 [브라우저 런타임 설계](browser-runtime-design.md)를 따른다.

### `font-kku:render` 이벤트

매번 그리기를 마치면 바탕 요소에서 `font-kku:render`가 발생한다(`bubbles`, `composed`). `event.detail`은 `{ reason, font, source, resolved }`이고 `reason`은 `render` · `refresh` · `upgrade` · `connect` · `attribute` · `mutation` · `restyle` 중 하나다. 구조가 바뀌거나 명시적으로 `render`/`refresh`하면 관리 DOM이 새로 만들어지므로 후처리를 이 이벤트에서 다시 적용한다. 크기·간격 등 비구조 속성 갱신은 기존 DOM을 유지한 채 이벤트를 보낼 수 있다. 따라서 이벤트를 노드 교체 신호로 가정하지 않고, 후처리는 같은 노드에 반복해도 중복되지 않게 작성한다.

```js
document.addEventListener("font-kku:render", (event) => {
  console.log(event.target, event.detail.reason);
});
```

### `upgrade(target)`

단일 노드를 안전하게 업그레이드한다.

```js
const el = document.querySelector(".font-kku");
window.FontKku.upgrade(el);
```

이 런타임이 이미 관리하는 노드는 중복해서 그리지 않는다. 판단은 런타임 상태로 하므로 `cloneNode(true)`한 바탕 요소나 다른 언어 구현이 만든 정적 HTML처럼 표식(`data-fy-upgraded`)만 있는 바탕 요소는 업그레이드된다.

### `upgradeAll(root)`

컨테이너 아래의 `font-kku, .font-kku`를 한꺼번에 업그레이드한다.

```js
const modal = document.querySelector("#modal");
window.FontKku.upgradeAll(modal);
```

동적으로 HTML 조각을 삽입한 뒤 가장 자주 쓰는 API다.

### `define()` / `bootstrap(root)`

대부분의 페이지에서는 자동 초기화(bootstrap)가 실행되므로 직접 쓸 일이 거의 없다.

- `define()`: `customElements.define("font-kku", ...)`. 문서가 아직 파싱 중일 때(`<head>`에서) 부르면, 파서가 만드는 `<font-kku>`는 텍스트가 들어온 뒤(`DOMContentLoaded`) 그려진다.
- `bootstrap(root)`: `define()` 후 `upgradeAll(root || document)`

일반 `<script src="font-kku.js">`와 ESM `import "font-kku"`를 한 페이지에서 함께 써도 런타임 인스턴스는 하나다(나중에 로드된 쪽이 기존 `window.FontKku`를 쓴다).

### `refreshAll(root)` / `loadFont(href, { root })` / `fontInfo(host)`

- `refreshAll(root?)`: 현재 스타일로 글꼴 메타데이터를 다시 해석해 구조가 바뀐 바탕 요소만 다시 그린다(속성을 다시 읽음). 스타일시트 `load`는 자동 처리되므로 `adoptedStyleSheets`·`<style>` 텍스트 교체 뒤에만 부른다. shadow root 안의 바탕 요소도 포함한다.
- `loadFont(href, { root }?)`: 글꼴 CSS를 `<link>`로 불러온 뒤 바탕 요소를 다시 해석하는 정적 도우미 함수. 같은 URL은 같은 Promise, 실패는 reject(다음 호출이 재시도). shadow root 안의 바탕 요소에 쓸 글꼴은 `{ root: shadowRoot }`로 그 root에 넣는다.
- `fontInfo(host)`: 직전에 그린 결과의 `{ font, id, contract, material, loaded }`.

### `decomposeGlyph(char)`

한글 한 글자가 어떤 구조로 분해되는지 확인할 때 쓴다.

```js
window.FontKku.decomposeGlyph("왕");
```

반환 객체에는 다음 정보가 들어 있다.

- `source`
- `kind`
- `sourceJamo`
- `jamo`
- `display`
- `topology.jungLayout`
- `topology.jongLayout`
- `topology.placementKey`
- `topology.layoutBucket`

CSS 조정이나 디버깅에서 가장 유용한 API 중 하나다.

### `createTextModel(text)`

문장을 줄·단어·공백·글자 세그먼트 트리로 어떻게 정규화하는지 보여준다.

```js
window.FontKku.createTextModel("안녕하세요 반갑습니다");
```

이 API는 줄·단어·공백·글자 세그먼트 구조를 직접 보고 싶을 때 유용하다. `renderText()`와 브라우저 DOM 그리기도 모두 이 모델을 기반으로 한다.

### `renderText(text)`

`renderText(text)`는 현재 공개된 평문 모드 API다. 입력 한 줄마다 항상 2줄 문자열을 반환한다.

```js
window.FontKku.renderText("안녕하세요 반갑습니다");
```

출력 특성은 다음과 같다.

- 글꼴 CSS를 읽지 않는다.
- `font`, `size`, `wrap-unit` 옵션을 사용하지 않는다.
- 브라우저 콘솔과 Node.js 둘 다에서 호출할 수 있다.
- 내부적으로는 `createTextModel()` 결과를 사용하지만, 별도 `renderTextMode(model)` 공개 API는 아직 없다.

## 7. 실제 그리기 과정

런타임은 아래 순서로 동작한다.

1. 입력 텍스트를 줄 단위로 분리한다.
2. 각 줄을 단어와 공백 세그먼트로 정규화한다.
3. 문자마다 글자를 만들고, 한글이면 초/중/종성으로 분해한다.
4. 중성 구조에 따라 세로모음(`right`)·가로모음(`bottom`)·섞임모음(`split-right`) 짜임으로 분류한다.
5. 종성 구조에 따라 민글자(`none`)·홑받침(`single`)·겹받침(`double`)으로 분류한다.
6. 조합 결과로 `placementKey`와 `layoutBucket`를 계산한다.
7. 그 정보를 담은 DOM을 만들고, CSS 변수 분기(dispatch)로 자소를 배치한다.

핵심 분류 결과는 보통 아래처럼 읽으면 된다.

| 짜임 | 예시 | 의미 |
| --- | --- | --- |
| `right:none` | `가` | 세로모음, 민글자 |
| `right:single` | `장` | 세로모음, 홑받침 |
| `right:double` | `밟` | 세로모음, 겹받침 |
| `bottom:none` | `오` | 가로모음, 민글자 |
| `bottom:single` | `울` | 가로모음, 홑받침 |
| `bottom:double` | `흙` | 가로모음, 겹받침 |
| `split-right:none` | `과` | 섞임모음, 민글자 |
| `split-right:single` | `왕` | 섞임모음, 홑받침 |
| `split-right:double` | `괆` | 섞임모음, 겹받침 |

## 8. 생성되는 DOM 구조

한글 글자는 대략 이런 구조로 그려진다.

```html
<font-kku data-fy-upgraded="true" data-fy-host="custom-element" data-fy-font="gothic" data-fy-profile="gothic" data-fy-size="24px" data-fy-wrap-unit="word" data-fy-expression="general" aria-label="왕" data-source="왕">
  <span part="root" data-fy-root="true" aria-hidden="true">
    <span part="line">
      <span part="word">
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
      </span>
    </span>
  </span>
  <span part="sr-source" data-fy-sr="true">왕</span>
</font-kku>
```

관리 루트는 `aria-hidden="true"`로 숨겨지고, 형제 `part="sr-source"` 노드(시각적으로 숨김)가 원문을 담는다.

비한글 글자는 단순하다.

```html
<span part="glyph" data-hangul="false" data-glyph-kind="latin">
  <span part="content">A</span>
</span>
```

### 자주 보게 되는 데이터 속성

| 위치 | 속성 | 의미 |
| --- | --- | --- |
| 바탕 요소 | `data-fy-upgraded` | 런타임이 관리 중인 바탕 요소인지 |
| 바탕 요소 | `data-fy-host` | `custom-element` 또는 `decorator` |
| 바탕 요소 | `data-fy-expression` | 글꼴 CSS가 계산한 표현 방식 |
| 바탕 요소 | `data-fy-font`, `data-fy-profile`, `data-fy-size`, `data-fy-spacing`, `data-fy-wrap-unit`, `data-fy-animate`, `data-fy-seed` | 정본으로 정규화한 옵션 상태 |
| 클래스 방식 바탕 요소 | `data-font`, `data-profile`, `data-size`, `data-spacing`, `data-wrap-unit`, `data-animate`, `data-seed` | 작성자가 쓴 지속 입력 |
| 바탕 요소 | `data-source` | 원문 호환용 속성 |
| 글자 | `data-jung-layout`, `data-jong-layout` | 중성/종성 구조 |
| 글자 | `data-layout-key` | 최종 짜임 키 |
| 글자 | `data-fy-layout-bucket` | `right-open`, `split-closed` 같은 큰 그룹 |
| 글자/본체/묶음/자모 | `data-fy-axis`, `data-fy-open`, `data-fy-jong-count` | 의미 구조 틀 |
| 자모 | `data-jamo`, `data-jamo-role`, `data-fy-role`, `data-fy-pos` | 자소 종류와 위치 토큰 |

## 9. `font-kku.css`와 글꼴 CSS의 역할 분리

이 구분을 정확히 이해해야 글꼴 저작이 쉬워진다.

### `font-kku.css`

공통 엔진 CSS다. 다음을 담당한다.

- 바탕 요소, 줄, 단어, 공백, 글자의 기본 display/layout
- `glyph-body`, 묶음, 자모, content의 절대 위치 지정
- `data-fy-pos` -> `--fy-slot-*` 분기
- `data-fy-role` -> 역할 변수 분기
- 묶음을 감싼 요소의 변형
- `data-fy-wrap-unit`별 줄바꿈 기본 정책
- `data-fy-animate="rise"` 움직임 훅

즉 "이 DOM이 어떻게 글자처럼 작동하는가"를 정의한다.

### 글꼴 CSS

글꼴 CSS는 주로 값을 준다.

- `--fy-expression-mode`
- `--fy-glyph-width`, `--fy-glyph-height`
- `--fy-body-*`
- `--fy-content-*`
- `--fy-tlo-*`, `--fy-trc-*`, `--fy-bbrs-*` 같은 자리 변수
- `--fy-jung-cluster-*`, `--fy-jong-cluster-*` 같은 묶음 변수

즉 "이 글자가 어떤 표정과 비율을 갖는가"를 정의한다.

## 10. 기본 제공 글꼴을 어떻게 이해하면 되나

### `sebul`

- 세벌식 기본 글꼴 (둥근 변형)
- 기준이 되는 예시 글꼴
- `default`, `classic`과 사실상 같은 값

### `gothic`

- 일반 글꼴 표현 방식의 글꼴
- 현재는 한 블록 저작(one-block)을 기준으로 유지
- 더 세분된 자리 변수와 묶음 변수만으로 짜임 차이를 흡수

### `gothic2`

- 더 이상 별도 전략이 아니다
- 현재는 `gothic.css`를 불러오는 폐기 예정 별칭이다

## 11. 새 글꼴을 만드는 방법

가장 쉬운 방법은 기존 글꼴 하나를 복사해서 이름만 바꾸는 것이다.

```css
:where([data-fy-font="poster"]) {
  --fy-expression-mode: general;
  --fy-glyph-width: 1em;
  --fy-glyph-height: 1.24em;
  --fy-body-x: -0.01em;
  --fy-body-y: -0.01em;

  --fy-tlo-top: -2%;
  --fy-tlo-left: -2%;
  --fy-tlo-size: 0.88em;

  --fy-tro-top: 5%;
  --fy-tro-left: 35%;
  --fy-tro-size: 0.92em;

  --fy-brs-top: 40%;
  --fy-brs-left: 5%;
  --fy-brs-size: 0.72em;
}
```

권장 순서는 다음과 같다.

1. 바탕 요소 블록에서 공통 폭, 높이, 본체(body) 값을 먼저 잡는다.
2. 자리 변수로 세로모음(`right`)·가로모음(`bottom`)·섞임모음(`split-right`) 짜임의 큰 차이를 맞춘다.
3. 묶음 변수가 필요할 때만 `jung-cluster`, `jong-cluster`를 조정한다.
4. 정말 필요할 때만 `data-fy-role`, `data-layout-key`, `data-fy-layout-bucket` 선택자를 추가한다.

현재 일반 글꼴 계열의 짜임 분류표는 [일반 글꼴 그룹 목록](./general-font-group-catalog.md)에 정리돼 있다.

## 12. 자주 하는 작업별 사용 패턴

### 정적 HTML 페이지

가장 단순한 경우다.

```html
<link rel="stylesheet" href="./font-kku.css" />
<link rel="stylesheet" href="./profiles/gothic.css" />
<script src="./font-kku.js"></script>

<font-kku font="gothic" size="40">도시의 밤과 서점</font-kku>
```

### 기존 DOM에 점진적으로 붙이기

```html
<h1 id="title" class="font-kku" data-font="sebul" data-size="48">광화문</h1>
```

`font-kku.js` 로드만으로 자동 업그레이드된다.

### 동적으로 삽입한 노드 업그레이드

```js
container.innerHTML = `
  <span class="font-kku" data-font="sebul" data-size="32">새 문장</span>
`;

window.FontKku.upgradeAll(container);
```

### JS로 텍스트를 직접 바꾸기

```js
host.textContent = "새로운 제목";
window.FontKku.refresh(host);
```

텍스트와 옵션을 동시에 바꾸고 싶으면:

```js
window.FontKku.refresh(host, {
  text: "새로운 제목",
  font: "gothic",
  size: 52
});
```

## 13. 흔한 오해와 주의점

### 글꼴 CSS만 로드하면 된다고 생각하는 경우

안 된다. `font-kku.css`가 없으면 런타임 DOM은 만들어져도 자소 배치가 성립하지 않는다.

### 바탕 요소 내부 DOM을 직접 붙잡고 수정하는 경우

런타임은 그릴 때 바탕 요소의 자식을 관리용 루트로 교체한다. 생성된 내부 DOM을 직접 만지는 대신 바탕 요소의 텍스트나 옵션을 바꾸고 `refresh()`를 호출하는 쪽이 안전하다. 생성 노드에 꼭 값을 써야 하면(예: 자모별 씨앗값) 자동으로 다시 그릴 때 지워진다는 전제로 `font-kku:render` 이벤트에서 다시 적용하거나, 자모 씨앗값이라면 `jamo-seeds` 옵션을 쓴다.

### `font`이 곧 표현 방식이라고 생각하는 경우

실제 표현 방식은 글꼴 CSS의 `--fy-expression-mode`가 결정한다. `font`는 글꼴 이름이고, 런타임은 계산 결과를 `data-fy-expression`으로 노출한다.

### `upgradeAll(root)`가 root 자신도 처리한다고 생각하는 경우

`upgradeAll(root)`는 컨테이너 내부의 `font-kku, .font-kku`를 찾는다. root 하나만 업그레이드하려면 `upgrade(root)`를 쓴다.

### 글꼴을 생략하면 예전 `default`가 자동 적용된다고 생각하는 경우

실제 런타임 기본값은 `sebul`이다. `default`와 `classic`은 `sebul`의 별칭일 뿐이므로, 새 코드에서는 `font="sebul"`을 명시하는 편이 낫다.

## 14. 디버깅 방법

### 브라우저에서 구조를 직접 보기

데모 페이지가 가장 빠르다.

- [`site/index.html`](../../site/index.html): 전체 허브
- [`site/basic-text.html`](../../site/basic-text.html): 선언형 사용 기준점 — `sebul` / `gothic` 두 글꼴 비교, 혼합 콘텐츠 포함
- [`site/shape-comparison.html`](../../site/shape-comparison.html): 탈네모꼴/네모꼴 기준 위에서 짜임별 구조 살펴보기
- [`site/layout-modes.html`](../../site/layout-modes.html): `wrap-unit` 비교 + 포스터·배너 크기
- [`site/api-studio.html`](../../site/api-studio.html): JS API 놀이터 — DOM 출력, `renderText()` 2줄 평문, `createTextModel()` JSON을 한 화면에서 본다

### 콘솔에서 분해 결과 확인하기

```js
FontKku.decomposeGlyph("괆");
FontKku.createTextModel("닭을 밟고 흙을 긁다");
FontKku.renderText("외국어를 읽고 왕과 획을 본다");
```

### 개발자 도구에서 확인할 것

- 바탕 요소의 `data-fy-font`, `data-fy-expression`
- 글자의 `data-layout-key`, `data-fy-layout-bucket`
- 자모의 `data-fy-pos`, `data-fy-role`
- 적용된 CSS 변수 값

## 15. 검증 방법

기본 확인 절차는 아래다.

```bash
node --check font-kku.js
node -e "const FontKku=require('./font-kku.js'); console.log(FontKku.renderText('안녕하세요 반갑습니다').join('\n'))"
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python -m pytest tests/test_playwright_smoke.py -q
```

테스트 방법 전체는 [`TESTING.md`](../../TESTING.md)를 본다.

## 16. 한 문장으로 정리하면

`font-kku`는 "JS가 한글을 구조로 분해하고, 브라우저에서는 `font-kku.css`가 그 구조를 배치하고, 필요하면 같은 구조를 2줄 평문 모드(`text`)로도 보여주는" 한글 조형 프레임워크다.
