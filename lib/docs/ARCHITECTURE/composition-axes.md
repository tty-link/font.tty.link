# 조합 체계 — 여섯 축과 테마

> Status: Implemented
> Scope: 글꼴·꾸밈·변주·움직임·상호작용·바탕 여섯 축, 테마, 정본 `spec/themes.json`과 생성물, 확장 세 파일(`font-kku-looks.css`·`font-kku-motion.css`·`font-kku-fx.js`)의 구조와 경계

## 목표

한글 한 줄의 모양을 서로 독립인 여섯 가지 선택으로 나눈다. 그래서 축마다 하나씩 고르면 조합이 되고, 자주 쓰는 조합에는 이름(테마)을 붙인다. 결정과 대안은 [ADR-017](../ADR/ADR-017-composition-axes-and-themes.md)에 있다. 이 문서는 구조와 쓰는 법이다.

이전에는 글꼴 18종이 한 목록이었다. 그중 대부분이 기반 글꼴에 칠을 얹은 파생 글꼴이었고, 칠을 다른 뼈대에 쓰려면 글꼴을 하나 더 만들어야 했다.

## Related Documents
- ADR: [ADR-017 조합 체계](../ADR/ADR-017-composition-axes-and-themes.md), [ADR-010 파생 글꼴](../ADR/ADR-010-derived-fonts-and-script-loader.md), [ADR-014 마스크 칠](../ADR/ADR-014-sprite-mask-paint.md), [ADR-016 씨앗 반응 글꼴](../ADR/ADR-016-seed-aware-fonts.md)
- Architecture: [스타일 글꼴 체계](./style-profile-system.md), [움직임과 변주](./animation-and-variation.md), [그림 자소 글꼴](./image-sprite-fonts.md)
- Demo: [글꼴 — 테마 갤러리와 조합기](https://font.tty.link/fonts.html), [움직임](https://font.tty.link/effects.html)

## 여섯 축

| 축 | 정하는 것 | 쓰는 법 | 원천 | 목록 |
| --- | --- | --- | --- | --- |
| 글꼴 | 뼈대 — 짜임(자모 배치) × 획(재료·획 표현) | `font="gothic"` | `profiles/*.css` | `spec/themes.json` `fonts` |
| 꾸밈 | 칠 — 색·외곽선·그림자, 자모 역할별 | `class="kku-look-neon"` | `font-kku-looks.css` | `looks` |
| 변주 | 씨앗만큼 자모마다 조금씩 | `seed="auto" jamo-seeds class="kku-vary-tilt"` | `font-kku-looks.css` | `variations` |
| 움직임 | 애니메이션 — 글자 또는 자모 단위 | `animate="wave"` | `font-kku.css`(글자) · `font-kku-motion.css`(자모) | `motions` |
| 상호작용 | 입력 반응 | `data-kku-fx="magnet"` · `FontKkuFx.magnet(host)` | `font-kku-fx.js` | `interactions` |
| 바탕 | 꾸밈이 사는 배경 | 페이지 배경 | — | `tones` |

축은 서로 다른 CSS 속성과 레이어를 쓰므로 겹쳐 걸어도 서로를 덮지 않는다.

| 축 | 손대는 것 |
| --- | --- |
| 글꼴 | 자리·크기·회전(레벨 변수), 자소판 |
| 꾸밈 | 칠 속성(`color`, `-webkit-text-*`, `text-shadow`, `paint-order`), 그림 자소의 마스크 칠과 글자 `filter` |
| 변주 | 페이지 레벨 보정 `--fy-rotate`, 개별 속성 `translate`, `filter`, `opacity` |
| 움직임 | `animation` — 글자 노드의 transform, 자모 노드의 `translate`·`rotate`·`opacity`·`color` |
| 상호작용 | 자모 노드의 인라인 `translate`·`rotate`, 바탕 요소의 `seed`, 다시 그리기 |

### 글꼴 — 짜임 × 획

| 무리 | 글꼴 | 짜임 | 획 |
| --- | --- | --- | --- |
| 세벌·고딕 계열 | `sebul` 세벌, `gothic` 고딕, `malang` 말랑 (글꼴을 밝히지 않으면 `sebul`을 세벌식 배치로, `jikgyeol`은 직결식 배치) | 세벌식 탈네모 / 네모꼴 / 세벌 + 자리별 기울기 | 원소 — CSS 선·원(ADR-024). 페이지 `--fy-face: device`면 기기 한글 글꼴 |
| 그림 자소 | `sprite-system` 그림 자소, `pilgi` 필기, `dunggeun` 둥근, `butgeul` 붓 | 그림 자소 실측(6행 93칸) | 곧은 · 필기 · 둥근 · 붓 (획 뼈대) |
| 획 표현 | `pixel` 도트, `dojang` 도장, `chalk` 분필, `crayon` 크레용, `jasu` 자수 | 그림 자소 실측 | 곧은 획 + `dot`·`stamp`·`chalk`·`crayon`·`stitch` |
| 출발용 | `sprite-example` | 배치 기본값 | 곧은 획 |

그림 자소의 획은 `scripts/build_jamo_svg.js`에서 **획 뼈대**(`SKELETONS`)와 **획 표현**(`TEXTURES`)의 두 차원이다. 어느 뼈대에나 어느 표현이든 `STYLES` 한 줄로 붙고, 배포하는 조합만 글꼴이 된다.

명조(`myeongjo`)는 기기 명조 글꼴을 재료로 고딕 짜임에 얹는 안을 검토했으나 배포하지 않았다. AppleMyungjo에서 겹침 감사 15% 초과 쌍이 206개 나왔고(최대 혹·촉 ㅗ×받침 53.5%), 다른 기기의 명조 글꼴은 치수가 달라 한 배치로 맞출 수 없다. 명조는 명조 기준 글꼴 하나에 자리별로 다시 교정해야 한다.

### 꾸밈 — `kku-look-*`

꾸밈 12종:
- 꾸러미 글꼴 여덟에서 옮긴 것(`from`): `neon` `sticker` `geumbak` `glitch` `retro` `saekdong` `riso` `blueprint`
- 정본에 적은 칠(`paint`): `outline` 외곽선, `pastel` 파스텔, `shadow` 입체, `inju` 인주
- 속 빈 꾸밈(`"hollow": true` — `neon`·`blueprint`·`outline`)은 기기 글꼴에서 글자 외곽선으로 속이 빈다. 그림 자소 글꼴에서는 외곽선 색으로 꽉 채운다(자소판 모양 안에서 색만 바뀐다) — 다만 `outline`은 정본 `sprite.rim`·`sprite.core`로 옅은 속 칠에 글자 단위 테두리(반투명 질감은 먼저 속 색으로 채운 뒤 테 그림자 넷, 화면 1.1px 이상)를 두른다(2026-10-13). 원소·SVG 재료에서는 꾸밈의 `element` 구간대로 옅은 속 칠(`core`)에 자모 하나의 바깥 윤곽(`rim` — 자모 노드 그림자 넷)을 두른다. `outline`은 고른 선 폭 `--kku-look-stroke`(0.04em)와 옅은 채움을 쓴다.
- 원소·SVG 재료의 빛·그림자는 자모마다(`element.glow`, 역할별 가능 — 자모 노드 `--fy-font-glow`)이고 한글 글자의 글자 단위 filter는 `element.glyphFilter`로 바꾼다. 역할 칠은 `element.paint`(불투명 잉크 + 자모 투명도).

```text
:where(.kku-look-X)                         초기화 — 글자색 상속, 그림자 끔, 채움·외곽선 = currentColor,
                                            --fy-sprite-paint: mask, hostVars(--fy-font-stroke)
:where(.kku-look-X) [part~="jamo"]          자모 칠을 상속으로 되돌림(글꼴의 역할 색을 지운다)
:where(.kku-look-X:not([data-fy-material])) …   기기 글꼴: 칠 전부
:where(.kku-look-X[data-fy-material]) …         그림·벡터 자소: color만(속 빈 꾸밈은 외곽선 색으로)
:where(.kku-look-X[data-fy-material]) [part="glyph"]   그림자 → drop-shadow (sprite.glyphFilter)
:where(.kku-look-X:is(element, svg)) …          element 구간: 속 칠·테두리(rim)·자모 빛(--fy-font-glow)·한글 글자 filter
:where(.kku-look-X[data-fy-layout-model="fixed-three"]) [data-fy-stamp]   속 빈 꾸밈의 선 폭(기기 글꼴, 도장 획 보정 대신)
:where(:is(…looks…):is([data-fy-font=…]))   외곽선 폭 되돌리기 — 글꼴이 선언한 --fy-font-stroke
```

- 씨앗 조건(`[data-fy-jamo-seeds="true"]`)이 있는 칠(스티커·글리치의 씨앗 색)은 그 조건을 그대로 단다.
- 그림 자소의 마스크 칠은 런타임이 그릴 때 바탕 요소의 `--fy-sprite-paint`를 읽어 켠다. 그래서 그린 뒤에 `kku-look-*` 클래스를 붙이거나 떼면 `FontKku.refresh(host)`로 다시 그린다. 기기 글꼴은 다시 그리지 않아도 된다.
- 꾸러미 글꼴(`font="neon"`)과 조합(`font="sebul" class="kku-look-neon"`)은 자모 노드의 계산 칠이 같다(씨앗을 켜도 같다).

### 변주 — `kku-vary-*`

| 클래스 | 하는 일 | 식 |
| --- | --- | --- |
| `kku-vary-tilt` | 세로 모음 옆 초성이 기운다. 받침 없는 `tlo`는 시계 방향 0–6°, `tlc`는 ±1.5°. 말랑은 제외(이미 기울인 글꼴) | `--fy-rotate: seed × 6deg` / `(seed − 0.5) × 3deg` |
| `kku-vary-bob` | 초성·head는 위로, 받침은 아래로, 세로 모음은 위아래 | `translate` 초성 0–0.05em, 받침 0–0.04em, 세로 모음 ±0.012em |
| `kku-vary-weight` | 자모마다 획 굵기가 다르다(기기 글꼴만) | `--fy-stroke: max(0, 획 폭 + (seed − 0.3) × 0.03em)` — 말랑의 좁은 자리(셊 15.4%) 때문에 0.04em에서 낮췄다. 획 폭은 외곽선 꾸밈의 `--kku-look-stroke`, 없으면 글꼴의 slot·역할·폰트 레벨 획 폭 |
| `kku-vary-width` | 초성·받침(겹받침 왼쪽 조각)이 좁아진다 | `--fy-scale-x: 1 − seed × 0.1` |
| `kku-vary-hue` | 자모마다 색조가 돈다 | `filter: hue-rotate(±45°)`, 그림 자소는 `--fy-sprite-filter` |
| `kku-vary-ink` | 자모마다 진하기가 다르다 | `opacity: 0.6 + seed × 0.4` |

- `jamo-seeds`를 켠 바탕 요소에서만 움직인다. 값과 폭은 `font-kku-looks.css`가 정본이다.
- 기하 변주(tilt·bob·weight·width)는 `tests/overlap-policy.json` `variations`가 조합 체계 글꼴 전부(starter 제외)에 함께 걸고 씨앗마다 잰다.
- 크기 변주는 두지 않는다. 자모 변형의 기준점이 상자 왼쪽 위라서, 줄여도 잉크가 이웃 쪽으로 끌린다.

### 움직임 — `animate`

| 단위 | 이름 | 원천 |
| --- | --- | --- |
| 글자 | `rise` `fade` `stagger` `bounce` `wiggle` `drift` | `font-kku.css` |
| 자모 | `assemble` `drop` `wave` `flicker` `cycle` `shine` `scroll-assemble` | `font-kku-motion.css` (`@layer font-kku.motion`) |
| 획 | `draw` — 획 깊이(ADR-018)로 벡터 자소를 쪼개 획순대로 긋는다 | `font-kku-motion.css` |

자세한 계약은 [움직임과 변주](./animation-and-variation.md)에 있다.

### 상호작용 — `FontKkuFx`

`type`(두벌식 타자) · `scatter`(흩어졌다 모이기) · `magnet`(커서 자석) · `shuffle`(씨앗 섞기) · `replay` · `bind`/`unbind`. 선언형은 `data-kku-fx="…"`이다. 타입은 `font-kku-fx.d.ts`에 있다.

## 레이어 순서

```text
font-kku.font < font-kku.jamo < font-kku.context < font-kku.look < font-kku.motion < (레이어 밖) 페이지 CSS
코어 font-kku.css 규칙은 레이어 밖이지만 변수로만 자모 자리를 정하므로 칠과 다투지 않는다
```

`font-kku-looks.css`와 `font-kku-motion.css`는 같은 순서 문을 되풀이한다. 그래서 불러온 순서와 무관하게 꾸밈은 글꼴을, 움직임은 꾸밈을 이긴다. 페이지 CSS는 언제나 마지막에 이긴다.

## 정본과 생성물

```text
spec/themes.json ──scripts/build_looks.js──┬─> font-kku-looks.css   (꾸밈 `kku-look-*`·변주 `kku-vary-*`)
profiles/<꾸러미>.css 꾸밈 구간 ──────────┘└─> authoring/themes-data.js  (window.FontKkuThemes, recipes)
```

`--check`(`npm test`)가 대조하는 것:
- 생성물이 최신인가.
- `spec/fonts.json`의 모든 글꼴이 글꼴 축(`fonts`)이나 테마의 `shortcut`에 있는가.
- 테마가 가리키는 축 값이 모두 있는가.
- 꾸러미 테마가 글꼴 하나만으로 된 조합인가.
- 움직임 이름이 `font-kku.css`나 `font-kku-motion.css`에 훅으로 있는가.
- 변주 목록이 생성기의 클래스와 같은가.

조합법(`recipes`)은 테마마다 이것을 풀어 둔다: 글꼴, 클래스, 씨앗(`seed`·`jamoSeeds`), `animate`, `fx`, 필요한 확장(`addons`), 바탕. 사이트의 테마 갤러리·조합기·코드 복사는 이 값으로 HTML을 만든다.

## 쓰는 법

```html
<script src="font-kku.js" data-fonts="sebul crayon" data-addons="looks motion fx"></script>

<!-- 테마 neon-sign -->
<font-kku font="sebul" class="kku-look-neon" animate="flicker">을지로 네온</font-kku>

<!-- 테마 crayon-diary + 섞기 -->
<font-kku font="crayon" seed="auto" jamo-seeds class="kku-vary-tilt kku-vary-bob kku-vary-hue"
          data-kku-fx="shuffle">참 잘했어요</font-kku>
```

- `data-addons`의 `looks`·`motion`은 CSS를 `loadFont`로 붙이고, `fx`는 순서 있는 스크립트로 붙인다. 파서를 막지 않으므로 인라인 코드는 `load` 뒤에 `FontKkuFx`를 부른다.
- 번들러: `@tty.link/font-kku/font-kku-looks.css`, `@tty.link/font-kku/font-kku-motion.css`, `@tty.link/font-kku/fx`, `@tty.link/font-kku/spec/themes.json`.

## 새 축 값을 더할 때

| 더할 것 | 하는 일 |
| --- | --- |
| 새 칠 | `looks`에 `paint`를 더하고 `node scripts/build_looks.js --write` |
| 새 기하·자소판 | 파생 글꼴([ADR-010](../ADR/ADR-010-derived-fonts-and-script-loader.md))을 만든 뒤 `fonts`와 `tests/overlap-policy.json`(`fonts`, `variations.fonts`)에 넣는다 |
| 새 자모 움직임 | `font-kku-motion.css`에 `[data-fy-animate="<이름>"]` 훅(개별 transform 속성, reduced-motion 가드)을 더하고 `motions`에 `source: "motion"`으로 등록한다 |
| 새 테마 | `themes`에 축 값을 적는다. 꾸러미 글꼴과 같은 모양이면 `shortcut`을 단다 |

## 한계

- 그림 자소에서 꾸밈은 색과 글자 단위 그림자만 낸다. 자모 역할별 그림자·속 빈 외곽선은 기기 글꼴에서만 된다.
- 변주 폭은 겹침 감사가 정해 은은하다. 눈에 띄는 무작위는 칠(색조·농담)과 씨앗 반응 글꼴이 낸다.
- 확장 세 파일과 새 글꼴은 npm 첫 공개 버전인 `@tty.link/font-kku@0.1.4-rc.2`에 들어 있다.
