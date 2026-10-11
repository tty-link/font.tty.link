# 나만의 꾸밈 글꼴 만들기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

글꼴의 자모 배치는 교정이 필요하므로 새로 만들지 않는다. **기반 글꼴(`sebul` 또는 `gothic`) 위에 꾸밈 CSS를 얹어** 클래스 하나로 다시 쓰는 "나만의 글꼴"을 만든다. 파일 하나(`my-font.css`)로 저장해 여러 페이지에서 쓴다. 브라우저에서 고르며 만들어 보려면 `https://font.tty.link/fonts.html`의 글꼴 견본에서 **꾸미기**를 누른다(같은 형식의 CSS를 복사·내려받는다).

```css
/* 나만의 글꼴: 딸기 — 기반 sebul. 쓰는 법: <font-kku font="sebul" class="kku-berry">…</font-kku> */
.kku-berry { --fy-weight: 800; }
.kku-berry :is([part~="choseong"], [part~="head"]) { color: #c2185b; }
.kku-berry [part~="jungseong"] { color: #7b1fa2; }
.kku-berry [part~="jongseong"] { color: #f06292; }
.kku-berry [part~="jamo"] { text-shadow: 0.04em 0.04em 0 #ffd1e3; }
```

```html
<script src="https://font.tty.link/lib/font-kku.js" data-fonts="sebul"></script>
<link rel="stylesheet" href="./my-font.css" />
<font-kku font="sebul" class="kku-berry" size="56">딸기 우유</font-kku>
```

## 재료

모두 페이지 CSS다. 자소 노드 `[part~="jamo"]`나 역할별 `part`([styling.md](https://font.tty.link/lib/skill/styling.md))에 준다.

| 하고 싶은 것 | 쓰는 것 |
|---|---|
| 초성·중성·받침 색 | `color` (`[part~="choseong"]`, `[part~="head"]`, `[part~="jungseong"]`, `[part~="jongseong"]`) |
| 굵기 | 바탕 요소에 `--fy-weight: 300~900` |
| 외곽선 | `--fy-stroke: 0.03em` + `-webkit-text-stroke-color` |
| 속 빈 글자(네온) | `-webkit-text-fill-color: transparent` + 외곽선 + `text-shadow` 빛번짐 |
| 스티커 테두리 | 8방향 흰 `text-shadow` (`0.05em 0 #fff, -0.05em 0 #fff, 0 0.05em #fff, …`) |
| 입체 그림자 | 같은 방향으로 겹친 `text-shadow` (`0.02em 0.02em 0 색, 0.04em 0.04em 0 색, …`) |
| 손맛 흔들림 | `seed` + `jamo-seeds` 속성 + 변주 클래스 `class="kku-vary-tilt kku-vary-bob"`(꾸밈 확장 `data-addons="looks"`, 겹침 검사를 거친 폭). 굵기·너비·색조·농담은 `kku-vary-weight`·`kku-vary-width`·`kku-vary-hue`·`kku-vary-ink` — [compose.md](https://font.tty.link/lib/skill/compose.md) |
| 움직임 | `animate` 속성 — compose.md |

## 지킬 것

- 자모 위치(`--fy-top`, `--fy-left`)와 크기는 바꾸지 않는다 — 조립이 무너진다.
- 기울기는 변주 클래스에 맡긴다. 직접 기울일 때는 ±3° 이하, 세로 모음 옆 초성부터 준다 — 자모가 이웃 자모에 쉽게 닿는다(겹침 검사에서 ±3°로도 '꽤'·'셊'의 자모가 15% 넘게 포개졌다).
- 굵기·외곽선은 작은 크기(24px)에서도 획이 뭉치지 않는지 본다.
- 빛번짐(`text-shadow`)은 가깝게 둔다. 모음 일부를 잘라 그리는 글꼴은 넓은 빛번짐이 자른 선에서 곧게 끊겨 보인다.

## 결과 내기

꾸밈 CSS 파일과, 같은 문장을 기반 글꼴 그대로와 나란히 그린 미리보기 HTML을 함께 낸다.
