---
name: font-kku-use
description: 웹페이지·블로그·포스터·발표 화면·초대장 같은 HTML을 만들 때 한글 제목과 강조 문구를 font-kku(폰꾸) 글꼴로 꾸미고, 글꼴에 꾸밈·변주·움직임·상호작용을 조합(테마)하고, 브랜드에 맞는 나만의 꾸밈 글꼴(CSS)을 만들고, 자모를 SVG로 직접 그려 그림 자소 글꼴을 만들고, 봇·터미널 출력에서 한글을 두 줄 평문으로 풀어 쓴다. "폰꾸로 꾸며줘", "제목을 네온/스티커/색동/도장 느낌으로", "나만의 한글 글꼴 만들어줘", "붓글씨·크레용 느낌 한글 글꼴을 그려줘", "슬랙 봇 메시지 한글 크게" 같은 요청에 쓴다. 한글 글꼴·한글 입력기가 없는 기기에서 영문 자판으로 한글을 쓰는 화면("두벌식/세벌식 입력", "한글 글꼴 없는 키오스크")에도 쓴다. 본문 글꼴을 바꾸는 용도가 아니다.
---

# 폰꾸로 한글 제목 꾸미기

폰꾸(font-kku)는 한글을 초성·중성·종성으로 나눠 다시 조립해 그리는 런타임이다. 글꼴 파일을 받지 않고 자모를 한글의 원리대로 CSS 획으로 그어(어느 기기에서나 같은 모양) 네온·스티커·색동 같은 제목 글꼴을 만들고, 기기의 한글 글꼴이나 직접 그린 자모 그림(그림 자소)으로도 조립한다. 쓰임은 넷이다.

- **웹 페이지 꾸미기**: HTML의 **제목과 짧은 강조 문구만** 꾸민다. 글꼴 하나에 꾸밈·변주·움직임·상호작용을 클래스와 속성으로 얹어 조합한다.
- **나만의 꾸밈 글꼴 만들기**: 기반 글꼴 위에 색·외곽선·그림자·기울기를 얹은 CSS 한 파일.
- **그림 자소 글꼴 그리기**: 자모를 SVG로 직접 그려 붓글씨·크레용·도장처럼 글꼴로는 안 나오는 모양을 만든다. 한글 글꼴이 없는 기기에서도 같은 모양이다.
- **봇·터미널 출력**: 한글을 2줄 평문으로 풀어 메신저·로그·배너에 넣는다(글자가 커지는 것은 아니다).

## 이 설명서 읽는 법

이 파일은 목차다. 전체 그림과 꼭 지킬 것은 여기 있고, 자세한 내용은 할 일에 맞는 파일을 하나둘 더 열어 읽는다. 모든 파일은 이 파일과 같은 폴더에 있다.

설명서 폴더: `https://font.tty.link/lib/skill/` (늘 최신). 판에 고정된 사본은 npm 패키지 안 `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/skills/font-kku-use/`

| 파일 | 담은 것 | 이럴 때 읽는다 |
|---|---|---|
| [setup.md](https://font.tty.link/lib/skill/setup.md) | 스크립트 한 줄 설치, 두 가지 쓰는 법, 속성 표(글꼴·크기·간격·줄바꿈·움직임·씨앗…), 읽기·복사(접근성), 필요할 때 받기, 동적 변경·재시도·이벤트 | 웹 페이지에 붙일 때 늘 |
| [fonts.md](https://font.tty.link/lib/skill/fonts.md) | 기본 배치 세벌식·직결식(`jikgyeol`)과 `font="sebul"`의 문맥 배치, 재료(원소 획·기기 글꼴·그림 세트), 기본 제공 글꼴 표(분위기·필요한 바탕·어울리는 곳), 꾸러미 글꼴, 글꼴별 색 | 글꼴을 고를 때 |
| [compose.md](https://font.tty.link/lib/skill/compose.md) | 꾸밈 `kku-look-*` · 변주 `kku-vary-*` · 움직임 `animate` · 상호작용 `data-kku-fx` · 이름 있는 조합(테마) | 움직임·효과, "고딕인데 네온처럼" 같은 조합 |
| [styling.md](https://font.tty.link/lib/skill/styling.md) | 페이지 CSS로 초성·중성·받침 색 바꾸기, 네온 색·빛, 씨앗(매번 다르게 · 언제나 같게), 고르기와 복사(자모 단위 강조, 원문 복사, 강조 색) | 색을 바꾸거나 자모마다 다르게 할 때, 고르기·복사가 궁금할 때 |
| [custom-font.md](https://font.tty.link/lib/skill/custom-font.md) | 기반 글꼴 위에 꾸밈 CSS 한 파일로 만드는 나만의 글꼴, 재료 표(기본 원소 획과 기기 글꼴에서 각각 듣는 속성) | "우리 브랜드 글꼴", "나만의 글꼴" |
| [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md) | 자모를 SVG로 그려 그림 자소 글꼴 만들기(칸과 자리 상자, 코드로 그리기, SVG 자소판, 획 깊이), 세벌·고딕에 그림 세트 걸기(원소 3·원형 8·24·40자만 그리고 조립), 디자인 API(실험 — 세트·글꼴 섞기, 조립식, 배치, 검사·교체·진단), 글꼴 작업실에서 그리고 디자인 만들기, 글꼴 파일(TTF) 내보내기, 확인 문장 | "붓글씨·크레용 느낌 글꼴을 그려줘", 디자인 JSON, 글꼴 파일로 받기 |
| [examples.md](https://font.tty.link/lib/skill/examples.md) | 완성 HTML 한 장, 사례 템플릿(주소·쓴 글꼴·볼거리, 요청 글 하나로 AI에게 받은 페이지 둘) | 처음 만들 때 본보기 |
| [terminal.md](https://font.tty.link/lib/skill/terminal.md) | 봇·터미널에서 한글을 2줄 평문으로 풀어 쓰기, 서버에서 JS 없는 정적 HTML(`render_html`) | 슬랙·디스코드 메시지, 로그, 배너, 서버 렌더 |
| [no-hangul-device.md](https://font.tty.link/lib/skill/no-hangul-device.md) | 한글 글꼴·입력기 없는 기기에서 한글 보이기와 쓰기(입력기) | 키오스크, 외국 컴퓨터, 최소 설치 리눅스 |
| [troubleshooting.md](https://font.tty.link/lib/skill/troubleshooting.md) | 자모가 흩어져 보일 때, 글꼴을 못 받을 때, 그림자·굵기가 안 먹을 때, 디자인 진단(`DESIGN_*`), 0.1.0에서 올린 뒤 모양이 바뀌었을 때, 미리보기 화면에서 안 보일 때 | 결과가 이상할 때 |

할 일별로 읽는 순서:

- **웹 페이지 제목 꾸미기**: setup.md → fonts.md. 움직임·효과·테마가 필요하면 compose.md, 색만 바꾸면 styling.md. 처음이면 examples.md의 본보기를 본다.
- **나만의 꾸밈 글꼴**: setup.md → custom-font.md (흔들림·움직임은 compose.md).
- **그림 자소 글꼴 그리기·디자인·글꼴 파일**: setup.md → draw-jamo.md.
- **봇·터미널**: terminal.md 하나.
- **한글 글꼴 없는 기기**: setup.md → no-hangul-device.md.

## 가장 짧은 사용법

링크를 더 열 수 없으면 이것만으로 제목을 꾸민다. `<head>`나 `<body>` 끝에 스크립트 한 줄을 넣고, `data-fonts`에 첫 화면에 보이는 글꼴을 공백으로 나열한다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js" data-fonts="sebul neon sticker"></script>

<!-- 의미 있는 제목: 태그를 그대로 두고 class="font-kku" + data-* (검색·스크린리더에 좋다) -->
<h1 class="font-kku" data-font="neon" data-size="64">가을 신메뉴</h1>

<!-- 장식용 문구: 전용 태그 -->
<font-kku font="sticker" size="40">오늘만 1+1</font-kku>

<!-- 글꼴을 밝히지 않으면 기본 배치 '세벌식' -->
<font-kku size="48">한글 제목</font-kku>
```

- 글꼴을 밝히지 않으면 **세벌식**이다 — 초성·중성·종성을 짜임(모음 모양·받침)마다 정해진 자리·크기로 찍고, 받침 없는 글자는 아래를 비우고 받침 있는 글자는 칸을 다 쓴다(`data-fonts`에는 `sebul`로 적는다). `font="jikgyeol"`(직결식)은 세벌 타자기처럼 같은 자모를 어느 글자에서나 같은 자리·크기로 찍는다 — 0.1.1–0.1.3에서 글꼴을 비운 글의 모양이다. `font="sebul"`을 밝히면 같은 세벌 글꼴을 모음·받침에 따라 자리가 바뀌는 문맥 배치로 그린다(0.1.0의 기본 배치). 0.1.0은 자모를 기기 한글 글꼴로 그렸다 — 0.1.0 페이지의 모양까지 지키려면 `font="sebul"`에 `style="--fy-face: device"`를 더한다(fonts.md「배치」).
- 자주 쓰는 글꼴: `sebul`(둥근 탈네모꼴, 문맥 배치) · `gothic`(단정한 네모꼴) · `neon`(어두운 바탕) · `sticker`(색 바탕) · `malang`(손맛) · `saekdong`(자모마다 다른 색) · `pixel`(도트) · `dojang`(붉은 인주) · `chalk`(칠판 바탕) — 전체 표와 바탕 조건은 fonts.md.
- 크기는 `size`/`data-size`에 px 숫자나 길이(`3rem`, `clamp(…)`)로 준다. 기본 24px.
- 움직임은 `animate="rise"`(`fade`·`stagger`·`bounce`·`wiggle`·`drift`). 자모 단위 움직임과 효과는 compose.md.

## 꼭 지킬 것

- **제목·짧은 강조(1~20자)에만** 쓴다. 본문 문단, 표, 버튼 라벨, 입력창, 긴 목록에는 쓰지 않는다.
- 글꼴마다 맞는 바탕이 있다. `neon`·`chalk`·`glitch`는 어두운 바탕, `blueprint`는 파란 도면 바탕, `sticker`는 색 바탕에 둔다 — 밝은 바탕에 두면 거의 안 보인다(fonts.md).
- 한 페이지에는 글꼴 2~3종까지만 쓴다. 영문·숫자·문장부호는 폰꾸가 조립하지 않고 기기 글꼴로 나온다.
- 큰 제목은 화면 폭을 넘지 않게 글자 수와 크기를 맞춘다(모바일 폭 360px에서 40~48px, 데스크톱 56~96px 정도).
- 꾸밀 요소 안에는 **글자만** 넣는다(다른 태그·아이콘을 섞지 않는다). 글은 태그에 붙여 쓴다(`<h1 …>가을 신메뉴</h1>`) — 태그 안의 줄바꿈·앞뒤 공백은 그대로 줄바꿈이 된다.
- 페이지 CSS에 `span { … }`처럼 **요소 이름만 쓴 선택자**를 두지 않는다 — 런타임이 만든 자소 노드도 `span`이라 조립이 깨진다. 클래스 선택자를 쓴다.
- 바탕 요소에 `font-size`·`line-height`를 직접 주지 않는다. 크기는 `size`/`data-size`로 준다.
- 자모 위치(`--fy-top`, `--fy-left`)와 크기는 바꾸지 않는다 — 조립이 무너진다.
- `sebul`·`gothic`·`malang`과 글꼴을 밝히지 않은 글은 자모를 CSS 획(원소 재료)으로 긋는다. 여기에는 `text-shadow`·`-webkit-text-stroke`·`--fy-weight`가 듣지 않는다 — 그림자·테두리는 `[part="glyph"]`의 `filter: drop-shadow(…)`, 굵기는 `--fy-element-width`로 준다(custom-font.md).
- 화면 낭독기와 복사는 원문을 한 번 읽는다. 같은 글을 `aria-label`로 또 달지 않는다. 다르게 읽혀야 할 때만 직접 단다 — 런타임은 직접 단 `aria-label`·`role`을 그대로 둔다.
- 같은 글은 언제나 같은 모양이다. 자모마다 다르게 흔들려면 씨앗을 켠다(styling.md). 사용자의 '동작 줄이기' 설정에서는 움직임이 저절로 꺼진다.

## 주소

- 런타임: `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/font-kku.min.js` — jsDelivr가 즉석으로 만든 압축본이다. 기본 CSS와 글꼴 CSS(`profiles/<글꼴>.css`)·확장은 런타임이 이 주소를 기준으로 `.min` 압축본으로 받는다. 스크립트 주소를 바꾸지 않는다. 소스를 읽을 때만 `.min`을 뺀 `font-kku.js`를 연다.
- npm 패키지: `@tty.link/font-kku` — 번들러를 쓰는 프로젝트(React·Vue 등)는 `npm install @tty.link/font-kku` 뒤 setup.md의 '번들러·ESM에서'를 따른다. 위 주소는 같은 패키지의 파일이다.
- 확장: 꾸밈·자모 움직임·상호작용은 `data-addons="looks motion fx"`로 붙인다. 입력기 `font-kku-ime.js`, 글꼴 파일 내보내기 `font-kku-export.js`는 스크립트를 따로 넣는다.
- 정본 데이터: 테마 목록 `spec/themes.json`, 그림 자소 칸 자리 `spec/sprite-layout.json`, 획순 `spec/strokes.json`, 글꼴 목록 `spec/fonts.json`, 조립식 `spec/jamo-recipes.json`, 디자인 JSON 형식 `spec/design.schema.json` (모두 런타임과 같은 폴더 아래).
- 전체 설명서(README): `https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/README.md`
- 데모와 사례: `https://font.tty.link/` — 글꼴 보기 `fonts.html`, 사례 `showcase.html`, 효과 `effects.html`, 문서 `docs.html`, 글꼴 작업실 `font-studio.html`(첫 화면의 "디자인" 칸에서 선·원/직접 그린 그림/기존 글꼴로 디자인을 만들고 페이지용 코드를 복사한다 — draw-jamo.md).

## 결과를 낼 때

- 웹 결과는 HTML 파일 하나로 낸다. 런타임은 위 주소 그대로 `<script>`로 불러온다(파일을 복사해 넣지 않는다).
- 쓴 글꼴과 바탕 조건이 맞는지, 모바일 폭에서 제목이 넘치지 않는지 확인한다.
- 미리보기 화면에서 글자가 자모로 흩어져 보이거나 비어 보이면 troubleshooting.md를 본다.
