# 나만의 꾸밈 글꼴 만들기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

글꼴의 자모 배치는 교정이 필요하므로 새로 만들지 않는다. **기반 글꼴(`sebul`·`gothic`, 또는 글꼴을 밝히지 않은 세벌 고정) 위에 꾸밈 CSS를 얹어** 클래스 하나로 다시 쓰는 "나만의 글꼴"을 만든다. 파일 하나(`my-font.css`)로 저장해 여러 페이지에서 쓴다. 브라우저에서 고르며 만들어 보려면 `https://font.tty.link/fonts.html`의 글꼴 견본에서 **꾸미기**를 누른다(같은 형식의 CSS를 복사·내려받는다).

```css
/* 나만의 꾸밈 글꼴: 딸기 — 기반 sebul. 쓰는 법: <font-kku font="sebul" class="kku-berry">…</font-kku> */
.kku-berry { --fy-element-width: 0.13em; }
.kku-berry :is([part~="choseong"], [part~="head"]) { color: #c2185b; }
.kku-berry :is([part~="jungseong"], [data-fy-head-part="medial"]) { color: #7b1fa2; }
.kku-berry [part~="jongseong"] { color: #f06292; }
.kku-berry [part="glyph"] { filter: drop-shadow(0.04em 0.04em 0 #ffd1e3); }
```

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.3/font-kku.min.js" data-fonts="sebul"></script>
<link rel="stylesheet" href="./my-font.css" />
<font-kku font="sebul" class="kku-berry" size="56">딸기 우유</font-kku>
```

## 재료

모두 페이지 CSS다. 자소 노드 `[part~="jamo"]`, 역할별 `part`([styling.md](https://font.tty.link/lib/skill/styling.md)), 글자 하나 `[part="glyph"]`, 바탕 요소에 준다.

`sebul`·`gothic`·`malang`과 글꼴을 밝히지 않은 글은 기본으로 자모를 **CSS 획**(원소 재료)으로 긋는다. 획은 글자가 아니라 상자라서 글자 칠(`text-shadow`·`-webkit-text-stroke`·`font-weight`)이 듣지 않는다. 글자 칠로 꾸미려면 바탕 요소에 `--fy-face: device`를 주어 기기 한글 글꼴로 그린다(한글 글꼴이 없는 기기에서는 네모로 보인다).

| 하고 싶은 것 | 원소 획(기본) | 기기 글꼴(`--fy-face: device`) |
|---|---|---|
| 초성·중성·받침 색 | `color` (`[part~="choseong"]`, `[part~="head"]`, `[part~="jungseong"]`, `[part~="jongseong"]`). 머리 음절(과·뭐·의) 안 모음 획은 `[data-fy-head-part="medial"]` — 중성 선택자에 함께 쓴다 | 같다(머리는 완성형 글자 하나라 초성 색) |
| 굵기 | 바탕 요소에 `--fy-element-width: 0.13em`(글자 크기 기준, sebul 기본 0.1em·gothic 0.072em) | 바탕 요소에 `--fy-weight: 300~900` |
| 획 끝 | `--fy-element-cap: round`(둥글게)·`butt`(자르기) | — |
| 외곽선만(속 빈 획) | 바탕 요소에 `--fy-element-outline: 0.03em; --fy-element-fill: transparent`(외곽선 색은 `color`). 획이 겹친 자리에 안쪽 선이 보인다(도면의 작도선처럼) | `--fy-stroke: 0.03em` + `-webkit-text-stroke-color` + 자모에 `-webkit-text-fill-color: transparent` |
| 빛번짐(네온) | 바탕 요소에 `--fy-glow: drop-shadow(0 0 0.05em currentColor) drop-shadow(0 0 0.15em currentColor)`(빛 색은 자모 `color`, `none`이면 끈다) | 같다. 관 속 흰 심은 자모 `text-shadow: 0 0 0.04em #fff` |
| 스티커 테두리 | `[part="glyph"] { filter: drop-shadow(0.05em 0 0 #fff) drop-shadow(-0.05em 0 0 #fff) drop-shadow(0 0.05em 0 #fff) drop-shadow(0 -0.05em 0 #fff); }` | 같다(또는 8방향 흰 `text-shadow`) |
| 입체 그림자 | `[part="glyph"] { filter: drop-shadow(0.02em 0.02em 0 색) drop-shadow(0.02em 0.02em 0 색); }` — 겹칠수록 두껍다 | 같다(또는 겹친 `text-shadow`) |
| 손맛 흔들림 | `seed` + `jamo-seeds` 속성 + 변주 클래스 `class="kku-vary-tilt kku-vary-bob"`(꾸밈 확장 `data-addons="looks"`, 겹침 검사를 거친 폭). 너비·색조·농담은 `kku-vary-width`·`kku-vary-hue`·`kku-vary-ink` — [compose.md](https://font.tty.link/lib/skill/compose.md) | 같다. 굵기 흔들림 `kku-vary-weight`는 기기 글꼴만 |
| 움직임 | `animate` 속성 — compose.md | 같다 |

`[part="glyph"]`의 `filter: drop-shadow()`는 두 재료 모두에서 듣는다 — 재료를 모를 때는 이쪽을 쓴다. 꾸밈 클래스(`kku-look-*`)는 재료에 맞춰 알아서 칠하므로, 이미 있는 칠이면 클래스를 먼저 쓴다(compose.md).

## 지킬 것

- 자모 위치(`--fy-top`, `--fy-left`)와 크기는 바꾸지 않는다 — 조립이 무너진다.
- 기울기는 변주 클래스에 맡긴다. 직접 기울일 때는 ±3° 이하, 세로 모음 옆 초성부터 준다 — 자모가 이웃 자모에 쉽게 닿는다(겹침 검사에서 ±3°로도 '꽤'·'셊'의 자모가 15% 넘게 포개졌다).
- 굵기·외곽선은 작은 크기(24px)에서도 획이 뭉치지 않는지 본다. 원소 획은 `--fy-element-width`를 올리면 런타임이 ㄹ·ㅌ·겹받침처럼 획이 촘촘한 자모만 가늘게 해 획 사이를 굵기의 0.3배 넘게 연다(0.13em에서 ㄹ 틈 0.039em) — 그래서 굵게 할수록 그 자모가 다른 획보다 가벼워 보인다. 0.15em를 넘기면 16px과 24px로 그려 본다.
- 넓은 빛번짐은 `text-shadow`가 아니라 `--fy-glow`로 준다. 기기 글꼴에서 `text-shadow`는 글자와 함께 잘려, 모음 일부를 잘라 그리는 세벌·고딕 배치에서 자른 선에 곧게 끊겨 보인다(원소 획에는 아예 듣지 않는다). `--fy-glow`는 자른 뒤에 빛을 그린다.

## 결과 내기

꾸밈 CSS 파일과, 같은 문장을 기반 글꼴 그대로와 나란히 그린 미리보기 HTML을 함께 낸다.
