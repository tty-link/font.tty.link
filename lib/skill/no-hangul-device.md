# 한글 글꼴·입력기 없는 기기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

한글 글꼴도 한글 입력기도 없는 기기(키오스크, 최소 설치 리눅스, 외국 컴퓨터)에서도 한글을 보이고 쓰게 한다.

- **보이기**: 글꼴을 밝히지 않은 글(세벌 고정)과 `sebul`·`gothic`·`malang`은 자모를 CSS 획(원소 재료)으로, 그림 자소 글꼴 `pixel`·`dojang`·`chalk`·`crayon`·`jasu`·`pilgi`·`dunggeun`·`butgeul`·`sprite-system`은 자소판 그림으로, 그림 세트(`jamo-set="pilgi-box"` 등)는 SVG로 그려 기기 글꼴이 필요 없다(`ㅋㅋ` 같은 낱자도). 칠만 다른 꾸러미 글꼴(`neon`·`sticker` 등)과 `--fy-face: device`를 건 글은 기기 글꼴로 그려 이런 기기에서 네모(두부)로 보인다. `FontKku.hasHangulFont()`가 `false`면 꾸러미 글꼴을 빼고 같은 꾸밈 클래스(`kku-look-*`)를 건다.
- **쓰기**: 입력기 `font-kku-ime.js`가 영문 자판 키를 두벌식(`dubeol`)·세벌식 390(`sebeol-390`)·세벌식 최종(`sebeol-final`)으로 받아 유니코드 한글을 조합한다. 한/영 전환은 Shift+Space.
- 기기 글꼴로 그려지는 `<textarea>`·버튼 글은 이런 기기에서 보이지 않는다. 보이는 한글은 폰꾸로 그리고, 화면 글(단추·안내)은 영어로 둔다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.3/font-kku.min.js" data-fonts="sebul sticker" data-addons="looks"></script>
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.3/font-kku-ime.js"></script>

<font-kku size="56" id="title">어서 오세요</font-kku>                <!-- 원소 획: 한글 글꼴 없이도 보인다 -->
<font-kku font="sticker" size="40" id="badge">오늘만 1+1</font-kku>  <!-- 꾸러미: 기기 한글 글꼴로 그린다 -->
<input id="keys" aria-label="Korean text" />

<script>
  if (FontKku.hasHangulFont() === false) {
    // 꾸러미 글꼴 대신 같은 칠을 원소 획에 건다
    const badge = document.getElementById("badge");
    badge.removeAttribute("font");
    badge.classList.add("kku-look-sticker");
  }
  // 입력 칸에 친 영문 키가 한글로 조합된다(값은 진짜 유니코드)
  FontKkuIme.attach(document.getElementById("keys"), {
    layout: "dubeol",
    onChange: (state) => FontKku.refresh(document.getElementById("title"), { text: state.value || " " }),
  });
  FontKkuIme.convert("dkssudgktpdy"); // "안녕하세요"
</script>
```

- `hasHangulFont()`는 판단할 수 없으면 `null`을 돌려준다. `false`일 때만 바꾼다.
- `FontKkuIme.attach()`는 `<textarea>`나 text·search·url·tel·password `<input>`에 붙인다. `type="email"`·`number`처럼 선택이 없는 칸은 `TypeError`로 거절한다. 친 한글은 Cmd/Ctrl+Z로 되돌린다.

완성 예: 폰꾸 사이트의 웹 앱 전광판 `https://font.tty.link/sign.html`과 메모장 `https://font.tty.link/memo.html`. 주소에 `?hangul-font=none`을 붙이면 글꼴 없는 기기처럼 보인다.
