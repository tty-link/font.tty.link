# 페이지 CSS로 더 꾸미기 · 씨앗 · 고르기와 복사

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

## 자소 고르기 — `part`

페이지 CSS가 글꼴보다 항상 이긴다. 런타임이 만든 자소 노드는 `part` 속성으로 고른다.

| 선택자 | 고르는 것 |
|---|---|
| `[part~="jamo"]` | 모든 자소 |
| `[part~="choseong"]` | 초성 |
| `[part~="head"]` | 초성과 모음 앞쪽을 한 덩어리로 그린 머리(`font="sebul"`·`malang`이 '과'를 '고'+ㅏ로 그릴 때, 세벌식·직결식에는 없다) — 초성 색을 바꿀 때 함께 고른다 |
| `[data-fy-head-part="medial"]` | 머리 안의 모음 획 묶음(원소 획·그림 세트) — 중성 색을 바꿀 때 함께 고르면 과의 ㅗ가 고의 ㅗ와 같은 색이다(기기 글꼴 재료의 머리는 완성형 글자 하나라 초성 색) |
| `[part="glyph"]` | 글자 하나(자모를 모두 담는다) — 그림자·테두리를 `filter: drop-shadow()`로 줄 때 |
| `[part~="jungseong"]` | 중성(모음) |
| `[part~="jongseong"]` | 받침 |

```css
/* 초성·중성·받침 색 바꾸기 */
.title :is([part~="choseong"], [part~="head"]) { color: #e63946; }
.title :is([part~="jungseong"], [data-fy-head-part="medial"]) { color: #1d4ed8; }
.title [part~="jongseong"] { color: #f59e0b; }

/* 네온 색 바꾸기 — 관은 color(기기 글꼴 neon은 외곽선 색도), 빛은 글자의 drop-shadow */
.title [part~="jamo"] { color: #3dffc0; -webkit-text-stroke-color: #7cf7d4; }
.title [part="glyph"] { filter: drop-shadow(0 0 0.05em #3dffc0) drop-shadow(0 0 0.16em #3dffc0); }

/* 크레용 색 바꾸기 — 크레용은 자소판을 마스크로 써서 color가 그대로 크레용 색이 된다 */
.title [part~="jungseong"] { color: #8e44ad; }
```

- 선택자는 바탕 요소의 클래스(`.title`)에서 시작한다. `span { … }`처럼 요소 이름만 쓰지 않는다.
- 자모 위치(`--fy-top`, `--fy-left`)와 크기는 바꾸지 않는다 — 조립이 무너진다.
- 네온 빛번짐은 둘이다. 꾸러미 `font="neon"`(기기 글꼴)은 자모를 자른 뒤에 그리는 빛 칠 `--fy-glow`(drop-shadow 목록, 빛 색은 자모 `color`)이고, 원소 획에 건 `kku-look-neon`(글꼴을 비우거나 `sebul`·`gothic`)은 `[part="glyph"]`의 `filter`다. 위 예처럼 둘 다 적으면 어느 쪽이든 바뀐다. 빛을 끄려면 바탕 요소에 `--fy-glow: none`과 `[part="glyph"] { filter: none; }`.
- 자모 `text-shadow`는 글자와 함께 잘리므로 넓은 빛에 쓰지 않는다(원소 획에는 아예 듣지 않는다). 네온 자모 하나를 숨길 때는 `visibility` 대신 `opacity: 0`을 쓴다.
- 색·외곽선·그림자·굵기 같은 재료 전체 표(원소 획과 기기 글꼴에서 각각 듣는 것)는 [custom-font.md](https://font.tty.link/lib/skill/custom-font.md).

자소마다 무작위로 살짝 기울이기:

```html
<font-kku font="sebul" size="56" seed="poster" jamo-seeds class="wobble">말랑 젤리</font-kku>
<style>
  .wobble [part~="jamo"] { --fy-rotate: calc((var(--fy-jamo-seed, 0.5) - 0.5) * 6deg); }
</style>
```

직접 기울일 때는 ±3° 이하로 둔다 — 자모가 이웃 자모에 쉽게 닿는다. 더 흔들려면 겹침을 검사한 변주 클래스(`kku-vary-tilt` 등, [compose.md](https://font.tty.link/lib/skill/compose.md))를 쓴다.

## 매번 다르게 · 언제나 같게 (씨앗)

**씨앗 반응 글꼴**(`malang` 말랑, `crayon` 크레용, `chalk` 분필, `jasu` 자수, `sticker` 스티커, `glitch` 글리치)은 `seed`와 `jamo-seeds`를 주면 자모마다 기울기·위치·색조가 조금씩 달라진다. 켜지 않으면 기본 모양 그대로다.

```html
<!-- 그릴 때마다 새 표정 -->
<font-kku font="crayon" seed="auto" jamo-seeds>오늘의 일기</font-kku>
<!-- 같은 씨앗은 언제나 같은 모양 — 문서를 다시 만들어도 똑같다 -->
<font-kku font="sticker" seed="가을축제" jamo-seeds>가을 축제</font-kku>
<!-- 사람마다 다르게: 씨앗에 이름 -->
<font-kku font="malang" seed="민지" jamo-seeds>민지</font-kku>
```

- 사용자가 "매번 다르게", "손글씨처럼 들쭉날쭉", "살아 있는 느낌"을 원하면 `seed="auto"`, "다시 만들어도 같게", "통일감"을 원하면 의미 있는 고정 씨앗(문서 이름·행사 이름)을 쓴다.
- 다른 글꼴은 씨앗만 줘서는 모양이 그대로다. 어느 글꼴이든 흔들려면 변주 클래스(`kku-vary-*`, compose.md)를 함께 준다 — 기울기·들썩임·너비·색조·농담(굵기 `weight`는 기기 글꼴에서만, 획마다 `hoek`은 획 깊이에서)이고, 폭은 겹침 검사를 통과한 범위다.
- 자모의 씨앗값은 CSS에서 `var(--fy-jamo-seed)`(0~1)로 읽는다.

## 고르기와 복사

폰꾸로 그린 글자도 마우스로 끌어 고를 수 있다. 자모 단위로 골라지고, 복사하면 클립보드에는 **완성된 한글 원문**이 들어간다.

- 끄는 동안 고른 자모가 강조된다 — 음절을 다 고르면 글자 칸이 띠로, 일부만 고르면 고른 자모만 상자로 칠해진다. 앞뒤 보통 글과 이어 골라도 띠가 이어진다.
- 복사하면 자모 일부만 고른 음절도 그 음절 통째로 들어간다(`한`의 ㅎ만 골라도 `한`). 빈칸·줄바꿈은 원문 그대로다. 페이지 전체 선택 + 복사도 깨끗한 글이 된다.
- 그린 글자 위를 두 번 누르면 낱말, 세 번 누르면 문단이 골라진다.
- 강조 색은 `--fy-selection`으로 바꾼다. 기본은 기기의 선택 색이다.

```css
/* 어두운 바탕의 네온 제목 — 강조를 보라색 반투명으로 */
.night-title { --fy-selection: rgb(180 120 255 / 0.45); }
```

- 고른 글을 버튼으로 복사할 때는 `FontKku.sourceRange(요소, getSelection().getRangeAt(0))?.text`가 원문이다.
- 스크립트 없이 저장한 정적 HTML(정적 렌더러 출력)은 그림을 고를 수 없고, 골라 복사하면 원문만 나온다.
