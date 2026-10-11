# 그림 자소 글꼴 — 자모를 SVG로 직접 그리기

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

기기 글꼴이 아니라 **직접 그린 자모 그림**으로 한글을 조립한다. 배치는 기본 제공 그림 자소 글꼴 `sprite-system`의 것을 그대로 쓰고 **그림만 바꾼다**. 붓·손글씨·둥근 느낌이면 먼저 기본 제공 `butgeul`(붓)·`pilgi`(필기)·`dunggeun`(둥근)을 써 본다 — 셋 다 `color`로 먹색이 바뀌고 꾸밈(`kku-look-*`)도 걸린다([compose.md](https://font.tty.link/lib/skill/compose.md)). 직접 그리는 길은 둘이다.

- **코드로 그리기(권장)** — 자모마다 SVG 경로를 `FontKku.registerJamo`로 등록한다. HTML 한 장 안에서 끝나고, 자모마다 색·굵기를 CSS로 바꿀 수 있고, 자리가 눌려도 획 굵기가 그대로다.
- **SVG 자소판 파일** — 자모 전체를 SVG 한 장에 그려 `--fy-sprite-url`로 끼운다. 질감 필터(인주·분필 같은)를 쓰려면 이 길이다.

## 칸 — 어디에 그리나

- 칸 키는 `r<행>-<호환 자모>`, 칸 하나는 100×100 좌표다.
- 행: 0 초성(세로 모음 옆 — 가·거의 ㄱ), 1 중성(합자 모음은 통짜), 2 받침, 3 겹받침, 4 초성(가로 모음 위 — 고·그의 ㄱ), 5 합자 모음(키 큰 초성 옆 — 와·위의 ㅘ).
- 자모: 자음 `ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ`, 모음 `ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ`, 겹받침 `ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ`(3행). 받침 행에 ㄸ·ㅃ·ㅉ는 없고, 5행은 합자 모음만 있다.
- **칸은 음절 상자를 그대로 줄인 것이다.** 자모를 칸 가운데가 아니라 음절 안 제자리에 그린다. 칸마다 그릴 자리(잉크 상자 `[x0, y0, x1, y1]`, 두 짝 자음·겹받침·합자 모음은 짝 상자 `parts`)는 `https://font.tty.link/lib/spec/sprite-layout.json`의 `layouts.system`에 있다. 대표값:

| 칸 | 자리 상자 | 뜻 |
|---|---|---|
| `r0-ㄱ` | `[4.7, 8.6, 48.4, 68.8]` | 초성은 왼쪽 위 절반 |
| `r1-ㅏ` | `[63.3, 0, 85.2, 86.7]` | 세로 모음은 오른쪽, 위아래로 길게 |
| `r1-ㅗ` | `[3.9, 35.9, 82.8, 74.2]` | 가로 모음은 가운데 아래, 넓게 |
| `r2-ㄱ` | `[13.3, 57.8, 72.7, 86.7]` | 받침은 아래, 넓고 납작하게 |
| `r4-ㄱ` | `[11.7, 9.4, 71.1, 60.2]` | 가로 모음 위 초성은 위쪽, 넓게 |

- 칸 경계에서 2만큼 안쪽에만 그린다. 굵기는 칸 100 기준 6–9가 읽기 좋다.
- 본보기 획: `https://font.tty.link/lib/profiles/sprite-system.jamo.js` (칸 하나가 한 줄)

## 코드로 그리기 (권장)

```html
<script src="https://font.tty.link/lib/font-kku.js" data-fonts="sprite-system"></script>
<script>
  FontKku.registerJamo("brush", {
    "r0-ㄱ": "M5 12 H45 V28 Q45 54 11 65",          // 경로 문자열 = 획 중심선
    "r1-ㅏ": ["M67 2 V86", "M67 39 H85"],           // 여러 획은 배열
    "r2-ㅇ": [{ ellipse: [43, 70, 27, 12] }],       // 타원
    "r0-ㅇ": [{ d: "M27 12 C5 12 5 66 27 66 C49 66 49 12 27 12 Z", fill: true }]  // 채운 모양(그림·캐릭터)
    // … 나머지 칸도 같은 방식
  }, { stroke: 8, cap: "round", join: "round" });  // 굵기(칸 단위)·끝 모양·꺾임
</script>
<h1><font-kku font="sprite-system" jamo-set="brush" size="72">붓으로 쓴 제목</font-kku></h1>
<style>
  /* 자모마다 색·굵기 — 기기 글꼴과 같은 part 선택자 */
  h1 [part~="choseong"] { color: #1b1b1b; }
  h1 [part~="jungseong"] { color: #b91c1c; --fy-vector-stroke: 0.06em; }
</style>
```

- 일부 칸만 등록해도 된다. 등록된 칸만 SVG로 바뀌고 나머지는 기반 자소판을 쓴다. 빈 세트·빈 도형 배열은 거부한다. CSS의 `--fy-sprite-row`를 바꿨다면 `FontKku.refreshAll(host)`로 해당 SVG를 갱신한다.
- 경로는 SVG 경로 명령(`M L H V C Q Z` …)과 숫자만 쓴다. 마크업(`<path …>`)은 받지 않는다.
- 획 색은 글자 색(`color`)이다. 굵기는 `--fy-vector-stroke`(예: `0.06em`)로, 끝 모양·점선은 `[part="vector"] { stroke-linecap: round; stroke-dasharray: 0 10; }`처럼 일반 SVG CSS로 바꾼다.
- 기본 획을 고쳐 쓰려면 스크립트에 `data-jamo-sets="sprite-system"`을 더해 기본 세트를 불러 `jamo-set="sprite-system"`으로 그리거나, 그 파일을 본떠 새 이름으로 등록한다.

## 획 깊이 — 자모를 획으로

`stroke-depth="stroke"`를 더하면 벡터 자소의 획마다 `part="hoek"` 노드가 된다(하 = 꼭지·가로·동그라미 + 세로·점).

- 획에는 획순 차례(`data-hoek`, `--fy-hoek-order`)와 종류(`data-hoek-kind`: `h` `v` `hv` `vh` `lf` `rf` `dot` `ring`), 제자원리 역할(`data-hoek-role`: 기본자 `base`·가획 `added`·이체 `variant`·천 `heaven`·지 `earth`·인 `person`)이 붙는다.
- 획만 옮기려면 `--fy-hoek-dx`·`--fy-hoek-dy`(칸 0–100 단위)·`--fy-hoek-rotate`.
- 획순대로 긋는 움직임은 `animate="draw"`(`data-addons="motion"`, 속성으로 주면 획 깊이도 저절로 켜진다), 획마다 흔들리는 변주는 `class="kku-vary-hoek"`.
- 직접 등록한 세트는 칸 도형을 획순대로 그리고 `registerJamo(…, { hoek: true })`로 알려야 종류·역할이 붙는다(획순 정본: `https://font.tty.link/lib/spec/strokes.json`).
- 기기 글꼴·자소판은 쪼갤 수 없어 자모 단위로 그린다.

```html
<script src="https://font.tty.link/lib/font-kku.js" data-fonts="sprite-system" data-jamo-sets="sprite-system"></script>
<style>.edu [data-hoek-role="added"] { color: #e63946; }</style>  <!-- 가획만 빨갛게 -->
<font-kku class="edu" font="sprite-system" jamo-set="sprite-system" stroke-depth="stroke">ㄱㅋ ㄴㄷㅌ</font-kku>
```

## SVG 자소판 파일

- `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2100 600" width="2688" height="768">` — 21열 × 6행. 칸마다 `<g id="r행-자모" transform="translate(열×100 행×100)">` 안에 칸 기준 0–100 좌표로 그린다(열 = 위 자모 순서의 번호).
- 굵기·색·질감은 `<style>`과 `<filter>`로 준다. 본보기: `https://font.tty.link/lib/profiles/sprite-system.svg`(획), 같은 폴더의 `dojang.svg`(인주 필터), `pixel.svg`(도트).

```html
<script src="https://font.tty.link/lib/font-kku.js" data-fonts="sprite-system"></script>
<style>
  .kku-brush { --fy-sprite-url: url("./kku-brush.svg"); --fy-sprite-filter: none; }
</style>
<h1><font-kku font="sprite-system" class="kku-brush" size="72">붓으로 쓴 제목</font-kku></h1>
```

- `--fy-sprite-filter: none`은 획이 검정이 아닐 때(색·질감) `sprite-system`의 검정 획 보정을 끈다.

## 획 굵기를 하나로

- 모든 획을 **같은 굵기 하나**로 긋는다(코드로 그리면 `--fy-vector-stroke` 하나, SVG 자소판이면 `stroke-width` 하나). 붓처럼 굵기 변화가 글꼴의 뜻일 때만 달리한다.
- SVG 자소판은 칸이 자리마다 줄고 늘어 **획도 같은 배율로 얇아지고 굵어진다** — 가로모음 위 초성, 받침, 합자 모음 조각처럼 작게 쓰이는 칸은 그만큼 굵게 그린다. 코드로 그리는 벡터 자소는 획 굵기가 자리 배율과 무관해 이 문제가 없다(그래서 권장한다).
- 자리를 맞추려고 자모 하나만 세로로 누르면 그 자모의 가로획만 얇아진다(예: '두'의 ㅜ 막대가 '크'의 ㅡ보다 얇아짐). 누르지 말고 남는 획 끝을 자른다.

## 글꼴 파일로 내보내기

그린 글꼴을 워드·디자인 도구에서 쓰는 보통 글꼴 파일(TTF)로 내려받게 할 수 있다. 페이지가 http(s)로 열려 있어야 한다.

```html
<script src="https://font.tty.link/lib/font-kku-export.js"></script>
<button id="get-font">글꼴 파일 받기</button>
<script>
  document.getElementById("get-font").onclick = async () => {
    const { ttf } = await FontKkuExport.exportFont({ font: "sprite-system", jamoSet: "brush", familyName: "내 붓글씨" });
    FontKkuExport.download(ttf, "my-brush.ttf");   // 한글 11,172자, 몇 초 걸린다
  };
</script>
```

## 확인

- 그린 칸이 없는 자모는 빈칸으로 보인다. 확인 문장 "닭을 밟고 흙을 긁다 · 괜찮아요 · 쳇바퀴 · 꽃잎 · 의자"를 크게(80px 이상) 그려 자모가 빠지거나 겹치지 않는지 본다.
- 획 굵기 확인 문장 "두크 고구그 노누느 · 가고과 · 각간값닭"을 80px와 16px로 그려, 막대·기둥·받침이 한 굵기로 보이는지, 작게 써도 획이 끊기거나 속공간이 메워지지 않는지 본다.
- 결과를 보여 줄 때는 그린 자모(코드나 SVG), 같은 문장을 `sprite-system` 그대로와 나란히 그린 미리보기 HTML을 함께 낸다.
- 브라우저에서 칸을 그리며 만들려면 글꼴 작업실 `https://font.tty.link/font-studio.html?font=sprite-example#studio-material`을 쓴다.
