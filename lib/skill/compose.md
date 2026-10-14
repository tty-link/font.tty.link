# 조합하기 — 꾸밈 · 변주 · 움직임 · 상호작용 (테마)

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

글자 모양은 여섯 축의 조합이다: **글꼴**(`font`) · **꾸밈**(`class="kku-look-…"`) · **변주**(`seed` + `jamo-seeds` + `class="kku-vary-…"`) · **움직임**(`animate`) · **상호작용**(`data-kku-fx`) · **바탕**(페이지 배경). 축마다 하나씩 고르면 된다. 자주 쓰는 조합에는 이름(테마)이 있다. 움직이는 모습은 `https://font.tty.link/effects.html`에서 본다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.3/font-kku.min.js" data-fonts="sebul gothic chalk" data-addons="looks motion fx"></script>

<!-- 고장 난 네온: 세벌 + 네온 꾸밈 + 깜빡임 (어두운 바탕) -->
<h1 class="font-kku kku-look-neon" data-font="sebul" data-animate="flicker" data-size="64">을지로 네온</h1>
<!-- 색동 물결: 고딕 + 색동 꾸밈 + 물결 -->
<font-kku font="gothic" class="kku-look-saekdong" animate="wave" size="48">한글날 잔치</font-kku>
<!-- 칠판 손글씨: 분필 + 기울기·들썩임 변주, 그릴 때마다 새로 (칠판 바탕) -->
<font-kku font="chalk" seed="auto" jamo-seeds class="kku-vary-tilt kku-vary-bob kku-vary-width" size="48">가나다 시간표</font-kku>
<!-- 누를 때마다 다시 섞기 -->
<font-kku font="sebul" class="kku-look-sticker kku-vary-tilt" seed="auto" jamo-seeds data-kku-fx="shuffle">스티커 한 장</font-kku>
```

| 축 | 고를 수 있는 것 | 확장(`data-addons`) |
|---|---|---|
| 꾸밈 `kku-look-` | `neon` 네온 · `sticker` 스티커 · `geumbak` 금박 · `glitch` 글리치 · `retro` 레트로 · `saekdong` 색동 · `riso` 리소 · `blueprint` 도면 · `outline` 외곽선 · `pastel` 파스텔 · `shadow` 입체 · `inju` 인주 (그림 자소 글꼴에서 `outline`은 옅은 속에 글자 테두리를 두르고, 속 빈 `neon`·`blueprint`는 관 색으로 채운다) | `looks` |
| 변주 `kku-vary-` | `tilt` 기울기 · `bob` 들썩임 · `weight` 굵기(기기 글꼴만) · `width` 너비 · `hue` 색조 · `ink` 농담 · `hoek` 획마다 흔들기(획 깊이) (`seed`와 `jamo-seeds`가 있어야 움직인다) | `looks` |
| 움직임 `animate` | 글자: `rise` `fade` `stagger` `bounce` `wiggle` `drift` · 자모: `assemble` 자모 조립 · `drop` 받침 톡 · `wave` 물결 · `flicker` 깜빡임 · `cycle` 색 순환 · `shine` 반짝 · `scroll-assemble` 스크롤 조립 · `draw` 획순 그리기 | 자모 움직임만 `motion` |
| 상호작용 `data-kku-fx` | `type` 두벌식 타자(`data-kku-phrases="첫 문장\|둘째 문장"`) · `scatter` 흩어졌다 모이기 · `magnet` 커서 자석 · `shuffle` 씨앗 섞기 | `fx` |

## 조합 요령

- **조합이 필요하면 조합한다.** "고딕인데 네온처럼", "도트 글자에 레트로 색", "붓글씨를 인주색으로"처럼 글꼴과 칠·움직임을 따로 말하면 꾸러미 글꼴을 찾지 말고 `font` + 꾸밈 `kku-look-*` + `animate`로 만든다. 꾸러미 글꼴은 그 칠이 그 글꼴에 맞을 때 쓰는 지름길이다 — `font="neon"`은 확장 없이 CSS 한 장이고 기기 한글 글꼴로 그린다. 같은 칠을 `class="kku-look-neon"`으로 글꼴을 비운 세벌 고정이나 `sebul`·`gothic`에 걸면 CSS 획(원소 재료)에 칠해 한글 글꼴이 없는 기기에서도 보인다.
- 꾸밈은 글꼴의 칠을 **바꾼다**(섞지 않는다). 그림 자소 글꼴(`pixel`·`chalk`·`pilgi`…)에서는 색과 글자 그림자(외곽선은 글자 테두리)만 바뀌고 획 질감은 남는다.
- 꾸밈마다 어울리는 바탕이 있다 — `neon`·`geumbak`·`glitch`는 어두운 바탕, `blueprint`는 파란 도면 바탕, `sticker`는 색 바탕, `riso`·`inju`는 종이색 바탕.
- 변주는 은은하다(겹치지 않는 범위). 눈에 띄는 무작위는 `hue`·`ink`와 씨앗 반응 글꼴([styling.md](https://font.tty.link/lib/skill/styling.md))로 낸다.
- `draw` 획순 그리기는 그림 자소 글꼴의 벡터 자소(`font="sprite-system" jamo-set="sprite-system"` 등)에서만 획 단위로 움직이고, 원소 획·그림 세트(`jamo-set="pilgi-box"` 등)에서는 자모 단위로 나타난다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)의 획 깊이.
- 움직임은 사용자의 '동작 줄이기' 설정에서 저절로 꺼진다.

## 상호작용을 JS로 걸 때

- 선언형 `data-kku-fx`는 저절로 붙는다.
- JS로 걸 때는 `data-addons`로 붙인 `font-kku-fx.js`가 늦게 실행되므로 `load` 뒤에 부른다.

```js
window.addEventListener("load", () => {
  FontKkuFx.type(document.querySelector("#hello"), ["첫 문장", "둘째 문장"]);
});
```

- scatter와 magnet을 함께 쓰면 활성 magnet이 우선한다. magnet을 멈추면 남아 있는 scatter 상태가 다시 적용되고, 마지막 효과를 멈추면 원래 inline 스타일과 `!important`가 복원된다. 두 효과의 이동량을 더하는 방식은 아니다.

## 이름 있는 조합(테마)

`neon-sign` 고장 난 네온, `sticker-pack` 스티커 한 장, `glitch-shuffle` 글리치 섞기, `gold-invite` 붓 금박 초대장, `saekdong-wave` 색동 물결, `saekdong-magnet` 색동 자석, `blueprint-assemble` 도면 조립, `riso-zine` 리소 진, `outline-wiggle` 선 글자 흔들, `pastel-drop` 파스텔 받침 톡, `shadow-type` 입체 타자, `pixel-retro` 도트 오락실, `chalk-hand` 칠판 손글씨, `crayon-diary` 크레용 일기, `stamp-ink` 도장 농담, `stitch-saekdong` 색동 자수, `neon-dots` 도트 네온, `brush-stamp` 붓 인주, `pilgi-note` 필기 메모, `round-sticker` 둥근 스티커 …

전체 목록과 조합법(어떤 글꼴·꾸밈·변주·움직임·상호작용·바탕인지)은 `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.3/spec/themes.json`의 `themes`에 있다. 테마 이름은 속성이 아니다 — 그 조합을 위 속성과 클래스로 적는다.
