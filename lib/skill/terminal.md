# 봇·터미널에서 한글 풀어 쓰기 · 서버 정적 HTML

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

브라우저 없이 한글을 2줄 평문으로 풀어 쓴다. figlet 같은 배너 도구에는 한글 글꼴이 없어 그 대신 메신저 알림, 배포 로그, 터미널 배너에 넣는다. 글자가 커지는 것이 아니라 풀어 쓰는 것이니 결과를 설명할 때 "크게"라고 하지 않는다. 글꼴·크기·색은 적용되지 않는다.

```text
ㅂㅐ　ㅍ　오ㅏ　ㄹ
　　　ㅗ　　ㄴ　ㅛ
```

(위는 "배포 완료"를 푼 결과다.)

## Node — 런타임 파일 하나로

설치 없이 런타임 파일 하나를 받아 쓴다. 같은 파일이 브라우저와 Node 둘 다에서 돈다.

```bash
curl -sO https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.2/font-kku.js
node -e 'console.log(require("./font-kku.js").renderText("배포 완료").join("\n"))'
```

```js
// Node 봇 (슬랙·디스코드): 고정폭으로 보이도록 코드 블록으로 감싼다
const { renderText } = require("./font-kku.js");
const big = renderText("배포 완료").join("\n");
await say("```\n" + big + "\n```");
```

npm 패키지 `@tty.link/font-kku`로 설치한 곳에서는 `require("@tty.link/font-kku")`로 부르고, 명령줄에서 `npx font-kku-text "배포 완료"`로 쓴다. 설치하지 않은 곳(CI 등)에서는 `npx -p @tty.link/font-kku font-kku-text "배포 완료"`처럼 패키지를 밝힌다 — `npx font-kku-text`만 쓰면 npm이 이름이 같은 다른 패키지를 찾는다.

## Python

Python 패키지 `font_kku`는 아직 PyPI에 올리지 않았다 — `pip install`로 받지 않는다(같은 이름의 다른 패키지를 받을 수 있다). 폰꾸 저장소의 `renderers/python`을 설치한 곳에서만 쓰고, 그 밖에서는 위 Node 방법을 쓴다.

```python
from font_kku import render_text
message = "```\n" + "\n".join(render_text("배포 완료")) + "\n```"
```

## 요령

- 출력은 초성·중성을 윗줄, 받침·가로모음을 아랫줄에 두는 2줄이다. 고정폭 글꼴(코드 블록, 터미널)에서 줄이 가장 잘 맞는다.
- 한 줄에 10~15자 안쪽이 읽기 좋다.

## 서버에서 JS 없는 정적 HTML — `render_html`

같은 보조 렌더러(Python·Go·Rust·Ruby, 저장소 `renderers/`에서 설치 — 레지스트리에는 아직 없다)는 브라우저 없이 바탕 요소 HTML을 만든다. 받는 쪽은 JS가 없어도 되고 CSS만 있으면 된다. 브라우저 런타임은 서버 렌더를 하지 않는다 — 웹 페이지에는 보통 런타임 `<script>`를 쓴다.

```python
from font_kku import render_html
page = render_html("한글 제목", size=64)                        # CSS를 넣은 문서 한 장
part = render_html("한글 제목", size=64, mode="fragment")       # 요소만
```

- 글꼴을 밝히지 않으면 브라우저의 `<font-kku>`처럼 **세벌 고정 + 원소 획**이다 — 읽는 기기의 한글 글꼴과 무관하게 같은 모양.
- `face="device"`(Ruby `face: "device"`, Go `WithFace("device")`, Rust `HtmlOptions.face`)는 같은 자리에 기기 한글 글꼴 글자를 놓는다(출력이 가볍다). `font="sebul"`·`"gothic"`을 밝히면 그 글꼴의 문맥 배치이고 기기 글꼴 글자다 — `font="sebul"`이 0.1.0의 기본 출력과 같다. 정적 출력의 `font="sebul"`은 기기 글꼴 글자라 브라우저 `<font-kku font="sebul">`(원소 획)과 획 모양이 다르다.
- `fragment`를 넣는 페이지에는 CSS 두 장을 붙인다: `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.2/font-kku.min.css`와 `…/profiles/sebul.min.css`(`gothic`이면 `gothic.min.css`).
- 정적 출력에는 그림 자소 글꼴·그림 세트·디자인·움직임·상호작용이 없다(`sebul`·`gothic`만). 만든 요소에 브라우저 런타임을 다시 돌리지 않는다.
