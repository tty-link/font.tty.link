# 봇·터미널에서 한글 크게

목차: [SKILL.md](https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/skills/font-kku-use/SKILL.md)

브라우저 없이 한글을 2줄 평문으로 풀어 크게 보여 준다. 메신저 알림, 배포 로그, 터미널 배너에서 강조할 때 쓴다. 글꼴·크기·색은 적용되지 않는다.

```text
ㅂㅐ　ㅍ　오ㅏ　ㄹ
　　　ㅗ　　ㄴ　ㅛ
```

(위는 "배포 완료"를 푼 결과다.)

## Node — 런타임 파일 하나로

설치 없이 런타임 파일 하나를 받아 쓴다. 같은 파일이 브라우저와 Node 둘 다에서 돈다.

```bash
curl -sO https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.js
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
