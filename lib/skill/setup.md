# 붙이기 — 스크립트 한 줄과 속성

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

## 스크립트 한 줄

`<head>`나 `<body>` 끝에 넣는다. `data-fonts`에 첫 화면에 보이는 글꼴 이름을 공백으로 나열하면 런타임이 기본 CSS와 그 글꼴 CSS를 처음부터 불러온다. 나열하지 않은 글꼴은 그 글꼴을 쓰는 요소가 화면 가까이 올 때 런타임이 CSS 한 장씩 받는다(필요할 때 받기).

```html
<script src="https://font.tty.link/lib/font-kku.js" data-fonts="neon sticker"></script>
```

| 스크립트 속성 | 하는 일 |
|---|---|
| `data-fonts` | 처음부터 받을 글꼴(공백·쉼표로 나눔). 첫 화면 제목 글꼴은 여기에 적는다 — 받는 동안 잠깐(최대 3초) 가려진다. 비우면 기본 CSS만 붙인다 |
| `data-addons` | 확장: `looks`(꾸밈 `kku-look-*`·변주 `kku-vary-*`), `motion`(자모 움직임), `fx`(타자·흩어지기·자석·섞기). 예: `data-addons="looks motion fx"` |
| `data-jamo-sets` | 벡터 자소 세트를 처음부터 받는다(예: `sprite-system`) — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md) |
| `data-autoload="false"` | 필요할 때 받기를 끈다. 이때는 쓰는 글꼴을 모두 `data-fonts`에 적는다 |

- `data-fonts`에 없는 글꼴도 쓸 수 있다 — 화면에 나올 때 받는다.
- 꾸러미 글꼴(`neon` 등) 여러 개 대신 `font="sebul" class="kku-look-neon"`처럼 꾸밈 클래스를 쓰면 CSS를 덜 받는다([compose.md](https://font.tty.link/lib/skill/compose.md)).
- 런타임은 스크립트 주소를 기준으로 CSS와 글꼴 파일을 받는다. 스크립트 주소를 고치거나 런타임 내용을 페이지에 복사해 넣지 않는다.

## 두 가지 쓰는 법

```html
<!-- 의미 있는 제목은 태그를 그대로 두고 class="font-kku"를 붙인다 — 클래스 방식 (검색·스크린리더에 좋다) -->
<h1 class="font-kku" data-font="neon" data-size="64">가을 신메뉴</h1>

<!-- 장식용 문구는 전용 태그 -->
<font-kku font="sticker" size="40">오늘만 1+1</font-kku>
```

- 클래스 방식은 `class="font-kku"`가 **반드시** 있어야 런타임이 알아본다. 속성은 `data-` 이름(`data-font`, `data-size` …)으로 준다.
- 런타임이 바탕 요소 안의 글자를 자소 노드로 바꾸므로, 꾸밀 요소 안에는 **글자만** 넣는다(다른 태그·아이콘을 섞지 않는다).
- 바탕 요소의 글은 태그에 **붙여서** 쓴다(`<h1 …>가을 신메뉴</h1>`). 태그 안의 줄바꿈·앞뒤 공백은 그대로 줄바꿈이 된다.

## 속성

전용 태그는 왼쪽 이름, 클래스 방식은 `data-` 이름을 쓴다.

| 전용 태그 | 클래스 방식 | 기본값 | 값 |
|---|---|---|---|
| `font` | `data-font` | `sebul` | 글꼴 이름 — [fonts.md](https://font.tty.link/lib/skill/fonts.md) |
| `size` | `data-size` | `24px` | px 숫자(`48`) 또는 CSS 길이(`3rem`, `clamp(36px, 8vw, 72px)`) |
| `spacing` | `data-spacing` | 없음 | 띄어쓰기 폭과 낱말 사이 간격(CSS 길이) |
| `wrap-unit` | `data-wrap-unit` | `word` | 줄바꿈 단위: `word` 낱말 · `glyph` 글자 · `line` 줄 |
| `animate` | `data-animate` | 없음 | 움직임 이름 — [compose.md](https://font.tty.link/lib/skill/compose.md) |
| `seed` | `data-seed` | 없음 | 씨앗: `auto`(그릴 때마다 새로) 또는 고정 글(`"가을축제"`) — [styling.md](https://font.tty.link/lib/skill/styling.md) |
| `jamo-seeds` | `data-jamo-seeds` | 꺼짐 | 붙이면 자모마다 씨앗을 나눠 준다(값 없이 `jamo-seeds`) |
| `jamo-set` | `data-jamo-set` | 없음 | 그림 자소 글꼴을 자모별 SVG(벡터 자소)로 그린다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md) |
| `stroke-depth` | `data-stroke-depth` | 없음 | `stroke`면 벡터 자소를 획 단위로 쪼갠다 — draw-jamo.md |

상호작용은 속성 `data-kku-fx`(두 방식 모두 같은 이름)로 건다 — compose.md.

## 동적으로 바꾸거나 다시 받을 때

- `<font-kku>`는 `host.setAttribute("size", "48")`, 클래스 방식은 `host.dataset.size = "48"`로 크기를 바꾼다. 자동으로 반영되므로 바로 뒤에 `refresh()`를 추가하지 않는다. 원문·글꼴·깊이·해석된 씨앗값이 같으면 기존 자모 요소를 재사용한다.
- 글을 바꿀 때는 바탕 요소의 `textContent`에 새 글을 넣으면 다시 그린다. 그린 뒤의 `textContent`에는 자모가 섞여 있으므로, 지금 글을 읽을 때는 런타임이 적어 둔 `data-source` 속성을 읽는다.
- `FontKku.render()`·`refresh()`를 직접 호출하면 관리 DOM 전체를 새로 만든다. 처음 표시와 본문·구조 변경에도 요소 생성이 필요하다. 요소 재사용은 브라우저의 스타일 계산·배치·그리기 비용까지 없애는 뜻은 아니다.
- 계속 유지할 값은 속성으로 적는다. `render`/`refresh`에 넘긴 옵션은 그 호출 한 번에만 적용된다.
- 자동 글꼴·자모 모듈 로딩에 실패하면 `FontKku.retryFont(host)`로 재시도한다. 실패는 `font-kku:loaderror` 이벤트의 `detail: { kind, name, url, error }`로 확인한다. `retryFont`는 성공을 기다리는 Promise가 아니다. 직접 CSS URL의 완료를 기다리려면 `await FontKku.loadFont(url)`을 쓴다.
- `<style>` 내용·CSS 행 선택처럼 load 이벤트가 없는 변경 뒤에는 `FontKku.refreshAll(host)`로 스타일을 다시 해석한다.
- `font-kku:render`는 기존 DOM을 유지한 갱신에서도 발생한다. 이벤트에서 하는 후처리는 같은 노드에 반복해도 안전하게 작성한다.

## 번들러·ESM에서

`<script>` 한 줄 대신 모듈로 불러오면 런타임이 글꼴 CSS의 자리를 모른다. 먼저 자리를 알려 준다.

```js
globalThis.FontKkuConfig = { fontBase: "https://font.tty.link/lib/" };
```

## 인터넷이 막힌 곳

런타임 주소 대신 파일(`font-kku.js`, `font-kku.css`, `profiles/`, 쓰는 확장 파일)을 같은 폴더 구조로 복사해 `src="./font-kku.js"`로 쓴다.

파일을 페이지와 다른 주소(도메인·포트)에 올려 쓰면 그 서버가 `Access-Control-Allow-Origin` 헤더를 보내야 한다. `crayon`·`pilgi`·`dunggeun`·`butgeul`·`jasu`는 자소판 그림을 CSS 마스크로 칠하는데, 브라우저는 다른 주소의 마스크 그림을 이 헤더 없이는 쓰지 않는다.
