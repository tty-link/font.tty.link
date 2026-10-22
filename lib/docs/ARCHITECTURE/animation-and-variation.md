# 움직임과 런타임 변주

> Status: Implemented
> Scope: 자소 단위 움직임, 순번 변수, 씨앗값(`seed`), 도우미 함수, 바탕 요소 상태 기반 변주의 공개 계약과 조합 확장(자모 움직임 `font-kku-motion.css`, 상호작용 `font-kku-fx.js`, 변주 클래스 `kku-vary-*`)

## 목표

`font-kku`의 DOM 계약은 각 자소를 독립 요소로 노출한다. 이 구조 덕분에 다음 세 가지를 현재 공개 범위로 지원한다.

1. **자소 단위 움직임** — 초성·중성·종성 또는 글자 전체에 서로 다른 움직임을 준다.
2. **순번 기반 변주** — 줄/단어/글자/자모 순번을 CSS `calc()`에 바로 쓴다.
3. **결정적 / 비결정적 변형** — 고정 씨앗값(`seed`)과 도우미 함수로 재현 가능한 결과를 만들거나, `auto`/`random`으로 그릴 때마다 다른 결과를 만든다.

이 문서는 현재 저장소가 실제로 제공하는 변주 계약을 정의한다. 핵심은 별도 규칙 DSL이 아니라, 바탕 요소 상태(class/`data-*`), 세그먼트 순번 변수, 씨앗값(`seed`), 공개 도우미 함수를 조합하는 것이다.

## Related Documents
- Architecture: [브라우저 런타임 설계](./browser-runtime-design.md)
- Architecture: [스타일 글꼴 체계](./style-profile-system.md)
- Architecture: [프레임워크 안내](./framework-guide.md)
- Architecture: [조합 체계 — 여섯 축과 테마](./composition-axes.md), ADR: [ADR-017](../ADR/ADR-017-composition-axes-and-themes.md)
- Demo: [움직임](https://font.tty.link/effects.html) (공개 메뉴 — 자모 움직임·상호작용 카드), [움직임 카탈로그](https://font.tty.link/animation-catalog.html) (개발 도구)

## 공개 계약 요약

| 항목 | 형태 | 역할 | 결정성 |
| --- | --- | --- | --- |
| `animate` / `data-animate` | 바탕 요소 옵션 / 속성 | 코어 글자 훅 6종, `motion` 확장의 자모 훅 7종, 또는 직접 만든 선택자 선택 | 선택자에 따라 고정 |
| `kku-vary-tilt` · `bob` · `weight` · `width` · `hue` · `ink` | 바탕 요소 class (`looks` 확장) | 자모 씨앗값으로 기울기·들썩임·굵기·너비·색조·농담을 주는 공용 변주 | 씨앗값과 같은 결정성 |
| `FontKkuFx` / `data-kku-fx` | JS 확장 (`fx`) / 선언형 속성 | 타자·흩기·자석·씨앗 섞기 상호작용 | 입력에 따름 |
| `data-kku-paused` | 바탕 요소나 조상 속성 | 자모 움직임과 타자를 그 자리에 세움 | — |
| `--fy-line-index`, `--fy-word-index`, `--fy-glyph-index`, `--fy-jamo-index` | 인라인 CSS 변수 | 순번 기반 지연, 파동, 조건 분기 | 결정적 |
| `data-line-index`, `data-word-index`, `data-glyph-index`, `data-jamo-index` | data 속성 | JS/CSS 선택자용 순번 노출 | 결정적 |
| `seed` / `data-seed` / `--fy-seed` | 바탕 요소 옵션 / 속성 / CSS 변수 | 바탕 요소 전체 변주의 기준 씨앗값 | 고정 숫자/문자열이면 결정적, `auto`/`random`이면 비결정적 |
| `FontKku.hashSeed(value)` | JS 도우미 함수 | 문자열을 0~1 범위 씨앗값으로 해시 | 결정적 |
| `FontKku.applyJamoSeeds(host, options)` | JS 도우미 함수 | 각 `[data-jamo]`에 씨앗값 CSS 변수 주입. 바탕 요소 씨앗값이 있으면 키에 들어간다 | 기본은 결정적, `salt`를 주면 새 씨앗값으로 다시 뿌릴 수 있음 |
| `jamo-seeds` / `data-jamo-seeds` / `jamoSeeds` | 바탕 요소 옵션 (켜야 동작) | 그릴 때마다 `applyJamoSeeds`를 자동 적용해 다시 그린 뒤에도 자모 씨앗값 유지 | 바탕 요소 씨앗값과 같은 결정성. 브라우저 전용 |
| `font-kku:render` | 바탕 요소 이벤트 | 그리기(자동 다시 그리기 포함) 뒤 발생, `detail.reason`으로 이유 전달 | — |
| 바탕 요소 class / `data-*` 상태 | DOM 상태 | 입력 상태, hover, 토글, UI 상태에 따른 변주 | 상태 전이에 따름 |

### 중요한 경계

- **현재 공개 계약은 CSS + 바탕 요소 상태 + 도우미 함수다.**
- **별도 규칙 엔진 / DSL은 없다.**
- "조건 기반 변형"은 바탕 요소의 class/`data-*`, 미디어 쿼리, 가상 클래스, 세그먼트 data 속성/CSS 변수를 조합해 구현한다.
- 자모/묶음의 기본 transform은 런타임 CSS가 직접 계산한다. 현재 런타임은 이를 `--fy-base-transform` 같은 합성 변수로 노출하지 않는다.
- 자모 단위의 정적 변주는 `--fy-rotate` / `--fy-scale-*` 같은 공개 변수를 우선 쓰고, transform 기반 움직임은 `[part="glyph"]` 또는 묶음을 감싸는 요소에 우선 준다.

## 현재 지원 범위

### `animate` 옵션

바탕 요소에 `animate="rise"` 속성(또는 클래스 방식의 `data-animate="rise"`)을 주면 런타임이 정본 `data-fy-animate="rise"`를 노출하고, `font-kku.css`의 움직임 훅이 각 글자에 움직임을 적용한다.

```html
<font-kku font="sebul" animate="rise">안녕하세요</font-kku>
```

`font-kku.css`에 포함된 내장 훅은 다음과 같다. 모두 `prefers-reduced-motion: reduce`에서 자동으로 꺼진다.

| 값 | 성격 | 타이밍 |
| --- | --- | --- |
| `rise` | 아래서 위로 + 서서히 나타남, 글자 순차 | 360ms × 글자 × 20ms 지연 |
| `fade` | 단순히 서서히 나타남 | 400ms (순차 지연 없음) |
| `stagger` | 서서히 나타남 + 순차 등장 | 400ms × 글자 × 40ms 지연 |
| `bounce` | 상하 반복 | 1.2s 무한 반복 × 글자 × 80ms 지연 |
| `wiggle` | 좌우 회전 반복 | 1.6s 무한 반복 × 글자 × 60ms 지연 |
| `drift` | 미세한 불규칙 움직임 | 4s 무한 반복 × 글자 순번만큼 시작 시점 이동 |

훅 이름과 기본 타이밍은 공개 계약이다. 글꼴 CSS는 명시도(specificity)를 높여 덮어쓰거나, 새 이름을 `data-fy-animate="<name>"` 선택자로 추가할 수 있다.

### 자모 움직임 확장 — `font-kku-motion.css` (ADR-017)

`data-addons="motion"`(또는 `<link>`)으로 붙이면 같은 `animate` 속성으로 자모 단위 움직임 일곱 가지를 고른다. 모든 규칙은 `@layer font-kku.motion`(꾸밈 `font-kku.look` 뒤) 안에 있어 레이어 밖 페이지 CSS가 이긴다.

| 값 | 이름 | 재생 | 하는 일 |
| --- | --- | --- | --- |
| `assemble` | 자모 조립 | 한 번 | 초성은 왼쪽 위, 중성은 오른쪽, 받침은 아래에서 날아와 맞물린다 |
| `drop` | 받침 톡 | 한 번 | 받침만 위에서 떨어져 두 번 튀고 자리 잡는다 |
| `wave` | 물결 | 반복 | 글자마다, 같은 글자 안에서도 역할마다 다른 박자로 출렁인다 |
| `flicker` | 깜빡임 | 반복 | 단어 둘째 글자(뒤로 세 글자마다)의 받침(없으면 중성)이 끊어질 듯 깜빡인다 |
| `cycle` | 색 순환 | 반복 | 오방색이 초성 → 중성 → 받침으로 시차를 두고 돈다(`--kku-cycle-1`…`4`) |
| `shine` | 반짝 | 반복 | 자모마다 글자 색 위로 빛 띠가 지나간다(`--kku-shine-color`). 원소 재료는 획 상자마다 자모 기준의 띠를 이어 칠하고, 그림 획(그림 세트·벡터 자소)은 띠가 지날 때 자모가 빛 색 쪽으로 번쩍이며, 빛 칠·꾸밈은 밝기가 번쩍인다 |
| `scroll-assemble` | 스크롤 조립 | 스크롤 | 화면을 내릴수록 흩어진 자모가 모인다(`animation-timeline: view()`, 미지원이면 조립된 채). 스크롤 상자의 끝에 가까우면 화면에 다 들어올 때 모이는 진행도로 옮겨 가 문서 끝에서도 다 모인다 |
| `draw` | 획순 그리기 | 한 번 | 획 깊이(ADR-018)를 켜고 벡터 자소의 획(`[part="hoek"]`, `pathLength="1"`)을 `--fy-hoek-order` 차례로 긋는다. 대시는 키프레임 안에만 있어 다 그은 뒤에는 원래 획이다. 쪼갤 수 없는 재료는 자모가 같은 차례로 나타난다 |

- 자모 노드는 개별 속성 `translate`·`rotate`와 `opacity`·`color`로만 움직인다. `transform`은 코어가 자모 자리에 쓰므로 키프레임에 쓰지 않는다.
- 시차는 `--fy-glyph-index`와 역할 단계 `--kku-step`(초성·head 0, 중성 1, 받침 2)으로 준다. `--fy-jamo-index`는 자모 표 번호라 순서로 쓰지 않는다.
- 그림 자소에서 색을 바꾸는 `cycle`·`shine`은 바탕 요소에 마스크 칠을 켜서 자소판 모양에 글자 색을 칠한다. 이동·투명도 움직임은 재료와 무관하다.
- 한 번 도는 움직임은 다시 그리면 다시 돈다 — `FontKku.refresh(host)` 또는 `FontKkuFx.replay(host)`.
- 조절 손잡이: `--kku-motion-duration`, `--kku-motion-stagger`. `data-kku-paused`(바탕 요소나 조상)는 스크롤 조립을 뺀 움직임을 그 자리에 세우고, `prefers-reduced-motion: reduce`는 모두 끈다(레이어 안 `!important` — 획순 그리기의 획까지).

### 상호작용 확장 — `font-kku-fx.js` (`FontKkuFx`, ADR-017)

`data-addons="fx"`(또는 `<script>`, npm `@tty.link/font-kku/fx`)로 붙인다. 모든 호출은 `stop()`이 있는 controller를 돌려준다.

| API | 하는 일 |
| --- | --- |
| `type(target, phrases, options)` | 두벌식으로 치듯 자모 단위로 지웠다 다시 친다(`typingFrames`·`transitionFrames`가 화면 목록을 만든다). 숨은 탭·화면 밖·`data-kku-paused`에서 쉬고, 시작할 때 한 번 도는 `animate`를 뗀다 |
| `scatter(target, { on })` | 올리기·누르기에 자모가 역할 쪽으로 흩어졌다 모인다 |
| `magnet(target, { area, reach, strength })` | 커서 가까운 자모를 끌어당긴다 |
| `shuffle(target, { on, every })` | 누르기·올리기·주기마다 씨앗을 새로 뽑아 다시 그린다(`jamo-seeds`가 없으면 켠다) |
| `replay` · `bind` · `unbind` | 한 번 도는 움직임 다시 · 선언형 `data-kku-fx` 연결·해제 |

선언형 `data-kku-fx="type scatter magnet shuffle"`(보조 속성 `data-kku-phrases`·`data-kku-caret`·`data-kku-scatter`·`data-kku-shuffle`)은 `DOMContentLoaded`와 바탕 요소의 첫 `font-kku:render`에 자동으로 묶인다(`FontKkuFxConfig = { autoBind: false }`로 끔). 타입은 `font-kku-fx.d.ts`.

이동 속성의 소유권은 controller별로 관리한다. 같은 자모에서 자석이 실제로 이동시키는 동안은
`magnet`이 `scatter`보다 우선하고, 같은 효과를 여러 번 연결하면 나중에 만든 활성 controller가
우선한다. 이동값을 합산하지 않으므로 효과 순서나 매 프레임의 이벤트 순서에 따라 결과가 달라지지
않는다. 자석이 돌아오거나 `stop()`하면 여전히 열린 scatter가 즉시 다시 드러난다. 영향 범위 밖의
자석과 아직 움직이지 않은 자석은 다른 효과의 이동값을 차지하지 않는다.

- `translate`·`rotate`·`animation-name`과 transition longhand는 소유권을 함께 해제한다.
  자석은 활성 동안 transition을 끄고, scatter는 자신의 복귀 transition을 유지한다.
- 마지막 소유자가 반환하면 작성자가 원래 지정한 인라인 값과 `!important`를 복원한다.
  인라인 값이 없던 속성은 제거되므로 CSS 변주와 움직임이 다시 적용된다. 코어 `transform`은 유지한다.
  효과 활성 중의 외부 인라인 재작성은 지원하지 않는다. 값을 바꾸려면 controller를 멈춘 뒤 다시 연결한다.
- 여러 scatter가 공유하는 `kku-fx-open` 클래스, scatter·shuffle이 공유하는 자동 `tabindex="0"`는
  마지막 소유자가 해제할 때 반환한다. 기존 작성자의 클래스·tabindex는 보존한다.
- 재렌더 시 이전 자모의 소유권을 해제하고 활성 효과를 새 자모에 적용한다. 자석은 커서를 다시
  움직이지 않아도 새 자모를 측정한다. `stop()`은 반복 호출해도 안전하며 멈춘 scatter는 `set()`으로
  다시 활성화되지 않는다. 새 controller로 다시 연결한다.


### 노출된 순번 속성 + 인라인 CSS 변수

런타임은 세그먼트마다 순번을 data 속성과 인라인 CSS 변수 양쪽으로 노출한다.

| DOM 노드 | data 속성 | CSS 변수 |
| --- | --- | --- |
| `[part="line"]` | `data-line-index` | `--fy-line-index` |
| `[part="word"]` | `data-word-index` | `--fy-word-index` |
| `[part="glyph"]` | `data-glyph-index` | `--fy-glyph-index` |
| `[part~="jamo"]` | `data-jamo-index` | `--fy-jamo-index` |

CSS 변수 경로는 `calc()`에 바로 쓸 수 있어 순차 지연·파동 움직임을 한 줄로 선언할 수 있다.

```css
[part="glyph"] {
  animation-delay: calc(var(--fy-glyph-index, 0) * 60ms);
}
```

### 씨앗값(`seed`) 옵션

바탕 요소에 `seed` 속성(또는 `data-seed`)을 주면 그릴 때 `--fy-seed`가 바탕 요소에 주입된다.

- `seed="auto"` 또는 `seed="random"` — 그릴 때마다 새 `Math.random()` 값
- `seed="0.42"` — 고정 숫자 씨앗값
- `seed="poster-v1"` — 고정 문자열 씨앗값. 런타임이 결정적인 숫자로 해시한다.
- 생략 — `--fy-seed` 제거

```html
<font-kku font="sebul" seed="poster-v1">안녕</font-kku>
<font-kku font="sebul" seed="auto">안녕</font-kku>
```

```js
FontKku.render(host, { text: "안녕", seed: "poster-v1" });
FontKku.render(host, { text: "안녕", seed: "auto" });
```

### 공개 도우미 함수

두 도우미 함수는 결정적 결과를 더 세밀하게 제어할 때 쓴다.

`applyJamoSeeds`는 자모 노드마다 `hash("jamo|role|index|salt")`를 쓰고, 노드가 속한 바탕 요소에 해석된 씨앗값(`data-fy-seed`)이 있으면 키 끝에 `|<seed>`를 붙인다. 그래서 `seed="poster-v1"`과 `seed="other"` 바탕 요소는 같은 텍스트라도 서로 다른 자모 씨앗값을 받고, 씨앗값이 없는 바탕 요소는 예전 키 그대로라 값이 바뀌지 않는다. `hash`를 직접 주면 이 키를 받는다.

```js
FontKku.hashSeed("ᄀ");                       // 0 ~ 1 범위 결정론적 해시
FontKku.applyJamoSeeds(host);                // 각 [data-jamo]에 --fy-jamo-seed 주입
FontKku.applyJamoSeeds(host, { salt: 2026 }); // 같은 자소도 reseed
FontKku.applyJamoSeeds(host, {
  property: "--my-seed",
  hash: function (key) { return FontKku.hashSeed("custom|" + key); }
});
```

## 결정적 vs 비결정적

| 경로 | 입력 | 결과 |
| --- | --- | --- |
| 결정적 바탕 요소 씨앗값 | `seed="0.42"`, `seed="poster-v1"` | 같은 입력/같은 씨앗값이면 같은 `--fy-seed` |
| 결정적 자모 씨앗값 | `FontKku.applyJamoSeeds(host)` | 같은 텍스트/같은 DOM 순서/같은 바탕 요소 씨앗값이면 같은 `--fy-jamo-seed` |
| 그릴 때마다 주입하는 자모 씨앗값 | `jamo-seeds` + 고정 `seed` | 다시 그릴 때(속성·원문 변경, 늦게 도착한 글꼴 CSS)마다 같은 값으로 다시 주입 |
| 새로 뿌린 자모 씨앗값 | `FontKku.applyJamoSeeds(host, { salt: Date.now() })` | 호출할 때마다 새 `--fy-jamo-seed` |
| 비결정적 바탕 요소 씨앗값 | `seed="auto"` / `seed="random"` | 그릴 때마다 새 `Math.random()` |

이 차이를 가장 직접적으로 보는 데모는 [움직임 훅](https://font.tty.link/animation-catalog.html)(사이트 저장소의 `src/animation-catalog.html`)이다. 같은 문자열을 "같은 씨앗값으로 다시 그리기"와 "씨앗값 다시 뽑기"(reseed)로 나란히 보여준다.

## 조건/상태 기반 변주

현재 저장소는 "조건/상태 변화"를 별도 DSL이 아니라 바탕 요소 상태와 CSS 선택자로 처리한다.

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

즉,

- "조건"은 CSS 선택자와 바탕 요소 `data-*`/class
- "상태 변화"는 DOM 상태 변경 + `FontKku.refresh()`
- "생성형"은 고정/`auto` 씨앗값(`seed`)과 도우미 함수

로 풀어쓴다.

## 자소 단위 움직임 예시

각 자모 노드는 독립된 절대 위치(absolute) 요소지만, `transform`에 직접 움직임을 주면 런타임이 계산한 자모 크기/회전(scale/rotate)을 덮어쓴다. 안전한 기본 예시는 `opacity`처럼 transform과 무관한 속성을 쓰고, 이동/회전 기반 움직임은 글자 또는 묶음 단위에서 주는 쪽이 낫다.

### 초성만 차례로 나타나기

```css
@keyframes fy-fade-in-soft {
  from { opacity: 0; }
  to   { opacity: 1; }
}

:where([data-fy-font="play"]) [part~="choseong"] {
  animation: fy-fade-in-soft 0.5s ease both;
  animation-delay: calc(var(--fy-glyph-index, 0) * 40ms);
}
```

### 종성만 서서히 나타나기

```css
@keyframes fy-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

:where([data-fy-font="play"]) [part~="jongseong"] {
  animation: fy-fade-in 0.6s ease-out both;
}
```

### 중성만 맥동

```css
@keyframes fy-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}

:where([data-fy-font="play"]) [part~="jungseong"] {
  animation: fy-pulse 1.1s ease-in-out infinite;
}
```

## 출력마다 다른 얼굴

### 1. 바탕 요소 씨앗값 기반

페이지 CSS(클래스)에서 쓴다. `--fy-rotate`는 페이지 전용 변수라 글꼴 CSS에는 쓰지 않는다(ADR-008).

```css
.drift [part~="jamo"] {
  --fy-rotate: calc((var(--fy-seed, 0.5) - 0.5) * 10deg);
}
```

고정 씨앗값을 쓰면 재현 가능하고, `auto`를 쓰면 그릴 때마다 전체 표정이 달라진다.

### 2. 자모별 씨앗값 기반

```js
FontKku.applyJamoSeeds(host);
```

```css
.seeded [part~="jamo"] {
  --fy-rotate: calc((var(--fy-jamo-seed, 0.5) - 0.5) * 8deg);
}
```

### 3. 새 씨앗값 뿌리기 (reseed)

```js
FontKku.applyJamoSeeds(host, { salt: Date.now() });
```

같은 텍스트라도 매 호출마다 새 표정을 만들고 싶을 때 쓴다.

### 4. 다시 그린 뒤에도 유지 — `jamo-seeds`

`applyJamoSeeds()`가 쓴 값은 생성된 자모 노드에 있어서, 속성·원문 변경이나 늦게 도착한 글꼴 CSS로 바탕 요소가 다시 그려지면 사라진다. 두 가지 방법이 있다.

```html
<!-- opt-in: 렌더마다 applyJamoSeeds(host)를 자동 적용 -->
<font-kku font="seeded" seed="poster-v1" jamo-seeds>한글</font-kku>
<span class="font-kku" data-font="seeded" data-seed="poster-v1" data-jamo-seeds>한글</span>
```

```js
// 직접 다시 적용: 모든 렌더 뒤에 font-kku:render가 발생한다 (bubbles, composed)
document.addEventListener("font-kku:render", (event) => {
  FontKku.applyJamoSeeds(event.target, { salt: "v2" });
});
```

- `jamo-seeds`는 boolean 속성이다. 값 없이 쓰거나 `"true"`/`"on"`이면 켜지고 `"false"`/`"off"`/`"none"`/`"0"`이면 꺼진다. JS 옵션 `jamoSeeds`는 `true`/`false` 또는 `applyJamoSeeds` 옵션 객체(`{ property, salt, hash }`)를 받고, 다른 JS 옵션처럼 그 호출 1회에만 적용된다([ADR-002](../ADR/ADR-002-option-priority-contract.md)).
- 켰을 때만 바탕 요소에 `data-fy-jamo-seeds="true"`가 찍힌다. 기본 DOM 계약(`spec/html-cases.json`)은 바뀌지 않는다.
- **브라우저 전용이다.** 다른 언어 구현(`render_html`)은 `--fy-jamo-seed`와 `data-fy-jamo-seeds`를 내보내지 않는다. `seed="auto"`처럼 런타임이 그릴 때만 생기는 값이므로, 정적 HTML에 자모별 변형이 필요하면 브라우저 런타임으로 그린다.
- `event.detail.reason`은 `render` · `refresh` · `upgrade` · `connect` · `attribute` · `mutation` · `restyle` 중 하나다. 자세한 뜻은 [브라우저 런타임 설계](./browser-runtime-design.md) §그리기 이벤트.

### 5. 씨앗 반응 글꼴 — 글꼴이 씨앗을 읽는다

글꼴 CSS도 `--fy-jamo-seed`를 읽어 변주할 수 있다([ADR-016](../ADR/ADR-016-seed-aware-fonts.md)). 페이지는 속성 둘만 준다.

```html
<font-kku font="crayon" seed="auto" jamo-seeds>하하하하</font-kku>   <!-- 그릴 때마다 새로 -->
<font-kku font="crayon" seed="민지" jamo-seeds>하하하하</font-kku>   <!-- 이름마다 다르고 언제나 같게 -->
```

글꼴 쪽 규칙은 계약 v2 안에서만 쓴다.

```css
@layer font-kku.jamo {
  /* jamo-seeds를 켠 바탕 요소에만 닿는다 — 켜지 않은 페이지의 모양은 그대로 */
  :where([data-fy-font="crayon"][data-fy-jamo-seeds="true"]) [data-jamo] {
    --fy-jamo-rotate: calc((var(--fy-jamo-seed, 0.5) - 0.5) * 5deg);   /* 씨앗 없으면 0 */
    --fy-jamo-dy: calc((0.5 - var(--fy-jamo-seed, 0.5)) * 0.03em);
  }
}
@layer font-kku.font {
  :where([data-fy-font="crayon"][data-fy-jamo-seeds="true"]) [part~="jungseong"] {
    color: hsl(calc(217deg + (var(--fy-jamo-seed, 0.5) - 0.5) * 60deg) 69% 51%);
  }
}
```

- 기하는 기반 글꼴이 쓰지 않는 자모·문맥 레벨 변수로만, 칠은 린트가 허용하는 속성(`color`, `text-shadow` 등)으로만.
- 폭은 겹침 감사의 **씨앗 표본**이 정한다 — 정책 `seeds`의 씨앗마다 다시 재서 어떤 씨앗에서도 임계를 넘지 않아야 한다. 기하 변주는 은은하게, 눈에 띄는 변주는 겹침과 무관한 칠(색조)로.
- 기본 제공 씨앗 반응 글꼴: `malang`, `crayon`, `chalk`, `jasu`, `sticker`, `glitch`.

### 6. 공용 변주 클래스 — `kku-vary-*` (ADR-017)

`looks` 확장(`font-kku-looks.css`)의 변주 클래스는 어느 글꼴에나 걸리는 감사받은 페이지 레벨 변주다. `jamo-seeds`를 켠 바탕 요소(`[data-fy-jamo-seeds="true"]`)에서만 움직인다.

| 클래스 | 하는 일 | 쓰는 것 |
| --- | --- | --- |
| `kku-vary-tilt` | 세로 모음 옆 초성이 기운다(받침 없으면 시계 방향 0–6°, 있으면 ±1.5°, 말랑 제외) | `--fy-rotate` |
| `kku-vary-bob` | 초성·head는 위로, 받침은 아래로, 세로 모음은 위아래로 — 자모가 서로 멀어지는 쪽으로만 | `translate` |
| `kku-vary-weight` | 자모마다 획 굵기가 다르다(기기 글꼴만 — 그림 자소는 자소판이 획을 정한다) | `--fy-stroke`(글꼴 획 폭에 더한 값) |
| `kku-vary-width` | 초성·받침(겹받침 왼쪽 조각)이 좁아진다 | `--fy-scale-x` |
| `kku-vary-hue` | 자모마다 색조가 돈다 | `filter: hue-rotate()`, 그림 자소는 `--fy-sprite-filter` |
| `kku-vary-ink` | 자모마다 진하기가 다르다 | `opacity` |

- 페이지 레벨 보정만 쓰므로 글꼴의 자모·문맥 보정(씨앗 반응 글꼴 포함)에 더해진다.
- 기하 변주(tilt·bob·weight·width)의 폭은 겹침 감사가 정한다. `tests/overlap-policy.json` `variations`가 기하 변주를 모두 함께 걸고, 조합 체계 글꼴 전부에서 씨앗마다 잰다. 대칭 들썩임은 가로 모음 막대와 받침을 포갰고(세벌 홍·옹 16.8%), 세로 모음까지 기울이면 합자 자리가 닿았다(고딕 꽤 20.4%). 그래서 지금의 방향·자리 제한이 생겼다. 크기 변주는 기준점이 상자 왼쪽 위라 잉크가 이웃 쪽으로 끌려 두지 않는다.
- 값의 정본은 `font-kku-looks.css`(생성기 `scripts/build_looks.js`)다.

### 7. 페이지에서 만드는 변주 — 꾸미기·글꼴 뽑기

글꼴 페이지(사이트 저장소의 `src/fonts.html`)의 시험대 '변주'는 모든 견본에 `seed`·`jamo-seeds`를 걸고(씨앗 반응 글꼴만 모양이 바뀐다), 꾸미기 창의 '변주' 묶음은 기울기·크기·굵기·미세 위치·색조 흔들림을 `var(--fy-jamo-seed, 0.5)`로 쓰는 페이지 CSS를 만든다. '글꼴 뽑기'는 뽑기 씨앗 하나로 기반 글꼴과 꾸미기 설정을 결정론적으로 고른다 — 같은 뽑기 번호(`#kku=` 링크)는 같은 결과다.

## 조합

조합 예시는 다음과 같다.

- 자소 단위 움직임 + 글자 순차 지연 → 자소가 차례로 튕기는 파도 효과
- 결정적 바탕 요소 씨앗값 + 결정적 자모 씨앗값 → 매번 같은 결과를 재현해야 하는 포스터/배너
- `seed="auto"` + `salt`를 준 `applyJamoSeeds()` → 상호작용마다 표정이 달라지는 실시간 데모
- [그림 자소 글꼴](./image-sprite-fonts.md) + 자모 움직임 → 움직이는 픽셀/스티커 한글
- 글꼴 + 꾸밈 + 변주 + 움직임 + 상호작용 → 이름 붙은 조합(테마). 정본 `spec/themes.json`, 구조는 [조합 체계](./composition-axes.md)

## 접근성

- **`prefers-reduced-motion: reduce` 대응은 필수.** 내장 훅은 모두 이 미디어 쿼리에서 꺼진다.
  ```css
  @media (prefers-reduced-motion: reduce) {
    :where(font-kku, .font-kku) [part~="jamo"] {
      animation: none !important;
      transition: none !important;
    }
  }
  ```
- **원문 보존.** 변주는 바탕 요소의 sr-source / `data-source`를 바꾸지 않는다.
- **깜빡임 방지.** 내장 훅은 초당 3회 이상의 강한 밝기 점멸을 피한다.

## 구현된 런타임 범위

| ID | 항목 | 반영 위치 |
| --- | --- | --- |
| V-1 | `--fy-line-index` / `--fy-word-index` / `--fy-glyph-index` / `--fy-jamo-index` 인라인 주입 | `font-kku.js` 그리기 파이프라인 |
| V-2 | `seed` 옵션 (`auto` / `random` / 고정 숫자 / 고정 문자열) → `--fy-seed` 주입 | `resolveSeed` + `setHostContract` |
| V-3 | `data-jamo-index` + `--fy-jamo-index` | `createJamoNode` + `resolveJamoIndex` |
| V-4 | 내장 훅 `rise` / `fade` / `stagger` / `bounce` / `wiggle` / `drift` | `font-kku.css` |
| V-5 | `FontKku.hashSeed`, `FontKku.applyJamoSeeds` 공개 도우미 함수 (바탕 요소 씨앗값을 키에 포함) | `font-kku.js` |
| V-6 | 켜야 동작하는 `jamo-seeds`로 그릴 때마다 자모 씨앗값 주입, `font-kku:render` 이벤트 | `font-kku.js` |
| V-7 | 자모 움직임 `assemble` / `drop` / `wave` / `flicker` / `cycle` / `shine` / `scroll-assemble`, 획 움직임 `draw` | `font-kku-motion.css` |
| V-8 | 상호작용 `FontKkuFx` (`type` / `scatter` / `magnet` / `shuffle` / `replay` / `bind`), 선언형 `data-kku-fx` | `font-kku-fx.js` |
| V-9 | 공용 변주 클래스 `kku-vary-tilt` / `bob` / `hue` / `ink`, 겹침 감사 `variations` | `font-kku-looks.css`, `tests/overlap-policy.json` |

## 범위 밖

현재 계약 밖에 있는 항목:

- 별도 규칙 DSL / 규칙 엔진
- GIF/스크린샷 기반 정적 훅 목록
- 씨앗값을 넣은 난수 생성기(RNG) 상태를 별도 런타임 객체로 보존하는 API

## Change Log
- 2026-10-17: 데모 페이지 경로를 사이트 저장소 `src/`로(ADR-029), 움직임 훅 페이지의 단추 이름을 실제 문구로
- 2026-10-11: scatter·magnet 이동 속성의 controller별 소유권, 명시적 우선순위, 작성자 인라인 복원 및 공유 포커스·클래스 수명 계약 추가
- 2026-10-10: 조합 확장(ADR-017) — 자모 움직임 7종(`font-kku-motion.css`), 상호작용 `FontKkuFx`(`font-kku-fx.js`), 공용 변주 클래스 `kku-vary-*`와 변주 겹침 감사 절 추가. "역할별 내장 움직임 라이브러리"를 범위 밖에서 뺌
- 2026-10-10: 씨앗 반응 글꼴(ADR-016)과 글꼴 페이지의 변주·꾸미기·글꼴 뽑기 절 추가, 예시 1·2를 계약 v2에 맞는 페이지 CSS로 정정
- 2026-09-27: `applyJamoSeeds` 키에 바탕 요소 씨앗값 포함(씨앗값 없는 바탕 요소는 값 불변), 켜야 동작하는 `jamo-seeds`/`data-jamo-seeds`/`jamoSeeds`와 `font-kku:render` 이벤트 추가, 브라우저 전용 경계 명시
- 2026-04-19: 결정적/비결정적 계약, 바탕 요소 상태 기반 변주, 고정 문자열 씨앗값 경로 반영
- 2026-04-18: 초안 + 움직임/씨앗값/도우미 함수 범위 정리 시작
