# font-kku

`font-kku`(폰꾸)는 한글 음절을 초성·중성·종성으로 분해해 다시 조립하고, CSS·그림·씨앗값(`seed`)·상태로 자소마다 모양과 움직임을 제어하는 한글 조형 도구입니다. 브라우저 DOM에 그리는 것이 주 경로이고, 같은 명세를 따르는 2줄 평문 모드와 Python/Go/Rust/Ruby 보조 렌더러도 제공합니다.

**사이트** [font.tty.link](https://font.tty.link/) · **npm** [`@tty.link/font-kku`](https://www.npmjs.com/package/@tty.link/font-kku) · **AI 설명서** [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

![글꼴 모음 — 네온·스티커·레트로·색동·말랑·도트·도장·분필과 기본 제공 글꼴 4종](https://font.tty.link/lib/docs/images/font-library.png)

포스터, 제목, 배너, 짧은 강조 문구처럼 조형성과 상호작용이 중요한 글에 잘 맞습니다. 글자마다 관리 DOM을 만들기 때문에 일반 웹 글꼴이나 장문 본문 렌더러를 대신하지는 않습니다.

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.min.js" data-fonts="sebul neon"></script>
<font-kku font="neon" size="64">을지로 네온</font-kku>
```

스크립트 한 줄이 런타임 옆의 `font-kku.css`와 `profiles/<글꼴>.css`를 함께 붙입니다([한 줄 설치](#한-줄-설치)). 주소의 `font-kku.min.js`는 jsDelivr가 즉석으로 만든 압축본이고, 소스를 읽을 때는 `.min`을 뺀 `font-kku.js`입니다.

글꼴 하나에 꾸밈·변주·움직임·상호작용을 클래스와 속성으로 얹어 **조합**할 수도 있습니다. 네온 칠은 세벌에도, 고딕에도, 도트 그림 자소에도 같은 클래스로 걸립니다([조합 — 여섯 축과 테마](#조합--여섯-축과-테마)).

```html
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.min.js" data-fonts="gothic" data-addons="looks motion"></script>
<font-kku font="gothic" class="kku-look-neon" animate="flicker" size="64">을지로 네온</font-kku>
```

### 이럴 때 폰꾸

글꼴 파일은 글자 **그림**을 담고, 폰꾸는 글자를 그리는 **규칙**을 담습니다. 그래서 받을 글꼴 파일이 없고(0개), 11,172자가 모두 같은 모양이며, **같은 글자도 매번 다르게 — 같은 씨앗이면 언제나 똑같이** 그립니다.

| 이런 문제가 있다면 | 폰꾸는 |
|---|---|
| 손글씨 느낌인데 '하하하하'가 도장 찍은 듯 똑같다 · 들어올 때마다 새 표정의 제목을 보여 주고 싶다 · 사람마다 다르지만 다시 열어도 같은 모양이었으면 | 자모마다 씨앗값으로 변주합니다. `seed="auto"`면 매번 새로, `seed="민지"`면 그 이름만의 모양을 언제나 똑같이([씨앗 반응 글꼴](docs/ADR/ADR-016-seed-aware-fonts.md)) |
| 웹폰트를 막는 곳(iOS 잠금 모드·폐쇄망·엄격한 보안 정책)에서 제목이 무너진다 · 한글 글꼴이 없는 기기라 □□□로 나온다 | 기본 재료가 한글 원리대로 CSS로 긋는 획이라 받을 글꼴 파일도, 기기의 한글 글꼴도 필요 없습니다. 그림 자소 글꼴도 기기 글꼴 없이 그립니다 |
| 서브셋 웹폰트(완성형 2,350자)라 닉네임의 '뷁', 이름의 '믜'만 글꼴이 달라진다 | 조합해서 그려 11,172자 모두 같은 모양입니다 |
| 글꼴·효과를 여럿 섞고 싶은데 한글 웹폰트 수십 개는 무겁다 · 예쁜 제목은 결국 이미지로 잘라 붙인다 | 글꼴 하나에 꾸밈·움직임을 클래스로 조합합니다 — 꾸밈 12종이 든 확장 한 장이 gzip 약 5KB. 꾸민 제목도 텍스트라 바로 고치고 화면 읽기·검색에 원문이 남습니다 |
| AI가 만든 문서의 한글이 밋밋하고 매번 다르다 · 웹폰트 주소를 매번 알려 주기 힘들다 | 설명서 링크 하나 + 글꼴 이름. 같은 이름(과 씨앗)은 언제나 같은 모양입니다 |
| 터미널·CI 로그·봇 알림, 마크다운·AI 응답을 순수 텍스트로 낼 때 한글 제목이 묻힌다 | 2줄 평문으로 크게 풀어 씁니다(CLI·Node·Python·Go·Rust·Ruby) |
| 내 손글씨·브랜드 한글 글꼴은 11,172자라 엄두가 안 난다 | 원형 8자(ㄱ ㄴ ㅁ ㅅ ㅇ ㆍ ㅡ ㅣ)만 그려도 나머지를 조립하고, 40칸이면 11,172자를 다 그립니다. TTF·WOFF로도 내보냅니다 |

문제 18가지와 증명 데모·정직한 경계(JS 필요, 제목·강조용, 이메일 본문·옛한글 대상 아님)는 [해결하는 문제와 쓰임](docs/PRD/problems-and-use-cases.md)과 소개 페이지의 '이럴 때 폰꾸'에 있습니다.

### 자소를 무엇으로 그리는가 — 재료

조립 구조는 하나이고 **재료만 다릅니다**. 기본은 원소 획이고, 나머지는 원소 획으로 안 되는 것이 있을 때 고릅니다.

| | **기본 · 원소 획** | **기기 글꼴** | **그림 — 그림 세트·자소판** |
|---|---|---|---|
| 자소 출처 | 한글의 원리대로 CSS로 긋는 획(ㅡ ㅣ ㆍ ○) | 방문자 기기의 한글 글꼴(같은 자리에 맞춰 잼) | 직접 그린 자모 그림 — 자모별 SVG 그림 세트, 또는 40칸 자소판(SVG·PNG) |
| 추가 로딩 | **없음** | **없음** | 세트 모듈 하나, 또는 자소판 1장(기본 제공 SVG는 gzip 약 4KB) |
| 기기마다 | 한글 글꼴이 없는 기기에서도 같은 모양 | 자리는 같고 획 모양은 기기 글꼴을 따름 | 같은 모양 |
| 쓰는 곳 | 글꼴을 밝히지 않은 글(세벌 고정), `sebul`·`gothic`·`malang` | 칠만 다른 꾸러미 글꼴(`neon`·`sticker` …), 또는 페이지 CSS `--fy-face: device` | `jamo-set="pilgi-box"`처럼 세벌·고딕에 거는 그림 세트, 또는 그림 자소 글꼴(`pixel`·`chalk`·`sprite-system` …) |
| 꾸미는 법 | 색·굵기(`--fy-element-width`)·속 빈 획·`drop-shadow` | 글자 칠(외곽선·`text-shadow`·`--fy-weight`) | 색(마스크 칠)·그림 다시 그리기 |

어느 재료든 글꼴은 CSS 파일 하나(+ 상대 경로 자산)입니다. 글꼴 CSS는 `@layer font-kku.font, font-kku.jamo, font-kku.context` 레이어 안에서 자리 → 자모 → 문맥 순으로 값을 좁혀 가며, 레이어 밖에 쓴 페이지 CSS가 언제나 마지막에 이깁니다. 계약은 [ADR-008](docs/ADR/ADR-008-font-contract-v2.md)을 따릅니다.

그림 자소 경로의 핵심은 **만들 부담이 자모 40칸뿐**이라는 점입니다. 11,172자를 쓰지 않고 자음·모음만 그리면 한글 전체가 만들어지므로, 글꼴 제작 도구 없이 웹·앱 캔버스에서 바로 자기 손글씨를 글꼴처럼 쓸 수 있습니다. AI로 생성한 자모 그림도 같은 방식으로 얹습니다.

재료가 다른 글도 한 페이지에서 섞어 쓸 수 있습니다 — 글자마다 `font`(나 `jamo-set`)만 다르게 주면 됩니다.

세벌·고딕 계열의 배치는 자모마다 정해진 표준 잉크 상자를 전제로 하고, 자모는 그 상자에 **한글의 원리대로 그립니다**([ADR-024](docs/ADR/ADR-024-hangul-principle-rendering.md)). 원소 획은 음절이 아닌 낱자 `ㅋㅋ`·`ㅘ`도 획으로 그리고, 획이 촘촘한 자모(ㄹ·ㅌ·겹받침)는 작은 글씨에서 틈이 열리게 조금 가늘게 긋습니다. 기기 글꼴 재료는 기기의 한글 글꼴(macOS의 Apple SD Gothic Neo, Android의 Noto Sans CJK·One UI Sans, Windows의 맑은 고딕)을 자모마다 재서 같은 자리에 맞춥니다([ADR-023](docs/ADR/ADR-023-device-face-fit.md)). 그림 세트는 원소 3개·원형 8자·자모 24자·40자 가운데 그린 만큼만 쓰고 나머지는 짝·가획·천지인과 선 조립(ㅎ = ㆍ + ㅡ + ㅇ)으로 만듭니다. 무엇으로 그리고 어떻게 조립할지는 디자인 JSON으로도 정합니다([디자인 API](#디자인-api-실험)).

## 결과 미리보기

`sebul` — 탈네모꼴 방향의 둥근 세벌식 조합

![sebul로 그린 오늘의 서울은 따뜻하다](https://font.tty.link/lib/tests/baselines/darwin-chromium/sebul-sentence-1.png)

`gothic` — 음절 높이를 묶는 네모꼴 조합

![gothic으로 그린 오늘의 서울은 따뜻하다](https://font.tty.link/lib/tests/baselines/darwin-chromium/gothic-sentence-1.png)

## 빠른 시작

### 한 줄 설치

`data-fonts` 속성을 단 classic `<script>`로 런타임을 불러오면, 스크립트 주소를 기준으로 `font-kku.css`와 나열한 글꼴의 `profiles/<이름>.css`를 처음부터 붙입니다(미리 받기). 나열하지 않은 글꼴은 **필요할 때 받습니다** — 그 글꼴을 쓰는 요소가 화면 가까이 오면 런타임이 CSS 한 장(그림 자소면 자소판도)을 그때 받습니다([ADR-019](docs/ADR/ADR-019-load-on-demand.md)). 그래서 `data-fonts`에는 첫 화면에 보이는 글꼴만 적으면 됩니다. 이름은 공백이나 쉼표로 나누고, 비워 두면 base CSS만 붙입니다. CSS가 도착할 때까지(최대 3초) 조립 전 자소가 보이지 않게 가려 둡니다. 필요할 때 받기를 끄려면 `data-autoload="false"`, 번들러·ESM에서는 `globalThis.FontKkuConfig = { fontBase: "https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/" }`로 자리를 알려 줍니다.

공개 페이지에는 jsDelivr의 `font-kku.min.js`를 씁니다. jsDelivr는 `.min`을 붙인 주소에 원본에서 즉석으로 만든 압축본(소스 맵 포함)을 보내고, 런타임은 그 이름을 보고 CSS·글꼴·확장·자소 모듈도 `.min` 압축본으로 받습니다([ADR-019](docs/ADR/ADR-019-load-on-demand.md) §2). 소스를 읽거나 오류를 따라갈 때는 `.min`을 뺀 `font-kku.js`를 씁니다(CSS·확장도 원본으로 받습니다). unpkg는 압축본을 만들지 않으므로 unpkg에서는 `font-kku.js`를 씁니다. 즉석 압축본에는 SRI(`integrity`)를 걸지 않습니다.

```html
<!-- 저장소나 배포 파일을 같은 폴더 구조로 둔 경우 -->
<script src="./font-kku.js" data-fonts="sebul neon"></script>

<!-- jsDelivr의 npm 패키지 주소 — .min이면 CSS·글꼴·확장도 .min으로 (unpkg는 .min 없이 font-kku.js) -->
<script src="https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.1/font-kku.min.js" data-fonts="sebul neon"></script>
```

`data-addons`를 더하면 같은 자리의 확장도 함께 붙습니다([조합](#조합--여섯-축과-테마)). `data-fonts` 없이 `data-addons`만 써도 됩니다.

| 이름 | 붙는 파일 | 하는 일 |
| --- | --- | --- |
| `looks` | `font-kku-looks.css` | 꾸밈 `kku-look-*`·변주 `kku-vary-*` 클래스 |
| `motion` | `font-kku-motion.css` | 자모 단위 움직임(`animate="wave"` 등) |
| `fx` | `font-kku-fx.js` | 상호작용 `FontKkuFx`, 선언형 `data-kku-fx` |

```html
<script src="./font-kku.js" data-fonts="sebul chalk" data-addons="looks motion fx"></script>
```

확장 스크립트(`fx`)는 파서를 막지 않고 런타임 뒤에 순서대로 실행됩니다. 인라인 코드에서 `FontKkuFx`를 바로 부르려면 `load` 뒤에 부르거나 `font-kku-fx.js`를 직접 `<script>`로 싣습니다.

ES module(`font-kku.mjs`)과 번들러 경로에는 스크립트 태그가 없으므로 아래처럼 CSS를 직접 import합니다.

### 0.1.0에서 올릴 때

0.1.1은 기존 페이지의 출력이 바뀌는 패치입니다. npm `^0.1.0`으로 받는 곳은 저절로 받고, CDN 주소에 판을 박은 페이지(`@0.1.0`)는 주소를 바꿀 때만 바뀝니다. 전체 목록은 [CHANGELOG.md](CHANGELOG.md)의 0.1.1입니다.

- **기본 배치:** 글꼴을 밝히지 않은 `<font-kku>`·`class="font-kku"`가 세벌 고정으로 그립니다([아래](#기본-제공-글꼴과-꾸러미-글꼴)). 예전 배치는 `font="sebul"`을 적습니다.
- **재료:** `sebul`·`gothic`·`malang`과 글꼴을 밝히지 않은 글이 자모를 기기 한글 글꼴 대신 CSS 획(원소 획)으로 긋습니다([재료](#자소를-무엇으로-그리는가--재료)). 원소 획에는 `text-shadow`·`-webkit-text-stroke`·`--fy-weight`가 듣지 않으므로 그림자·테두리는 `[part="glyph"]`의 `filter: drop-shadow(…)`, 굵기는 `--fy-element-width`로 옮깁니다. 0.1.0과 같은 모양은 `font="sebul"`에 페이지 CSS `--fy-face: device`를 더합니다. 꾸러미 글꼴(`neon`·`sticker` …)은 전처럼 기기 글꼴로 그립니다.
- **정적 렌더러:** 글꼴을 밝히지 않은 `render_html(text)`가 세벌 고정과 원소 획을 냅니다. 예전 출력은 `font="sebul"`, 배치는 두고 기기 글꼴 글자만 원하면 `face="device"`([보조 렌더러](#보조-렌더러)).
- **접근성:** 런타임과 정적 렌더러가 바탕 요소에 `aria-label`을 쓰지 않습니다. 원문은 sr-source 하나로 읽히고, 직접 단 `aria-label`·`role`은 그대로 둡니다([접근성](#움직임-변주-접근성)). 원문을 코드에서 읽으려면 `data-source`.
- **새로:** 그림 세트(`jamo-set="pilgi-box"`·`dunggeun-box`·`butgeul-box`), 디자인 API(실험), `FontKku.layoutStability`·`layoutProfiles`, 복사 주소 기본값 `font-kku.min.js`.

### npm / 번들러

루트 패키지는 CommonJS `require()`, 빌드 없는 ESM 진입점(`font-kku.mjs`, default와
named export), TypeScript 선언, CSS·글꼴·spec 서브패스 export를 제공합니다.

```bash
npm install @tty.link/font-kku
# 저장소 checkout에서 시험할 때: npm pack 뒤 npm install /path/to/tty.link-font-kku-0.1.1.tgz
```

```js
import FontKku from "@tty.link/font-kku";
import "@tty.link/font-kku/font-kku.css";
import "@tty.link/font-kku/profiles/sebul.css";

FontKku.renderText("안녕하세요").forEach(console.log);
```

조합 확장은 서브패스로 가져옵니다.

```js
import "@tty.link/font-kku/font-kku-looks.css";   // 꾸밈 kku-look-* · 변주 kku-vary-*
import "@tty.link/font-kku/font-kku-motion.css";  // 자모 움직임
import FontKkuFx from "@tty.link/font-kku/fx";     // 상호작용
import themes from "@tty.link/font-kku/spec/themes.json" with { type: "json" }; // 축 목록과 테마 (Node ESM은 with가 필요, 번들러는 대개 없어도 된다)
```

TypeScript는 별도 `@types` 패키지 없이 `font-kku.d.ts`를 읽습니다. 글꼴 저자는
`@tty.link/font-kku/spec/css-variables.json`, 렌더러 저자는 `tables.json`,
`test-cases.json`, `html-cases.json`을 패키지 서브패스로 가져올 수 있습니다.

### 빌드 없는 정적 사용

CDN 없이 파일을 직접 제공하려면 npm 패키지의 파일을 프로젝트에 복사합니다. 설치했다면
`node_modules/@tty.link/font-kku/`에, 설치하지 않았다면 받은 묶음의 `package/` 폴더에 그대로 들어 있습니다.

```bash
npm pack @tty.link/font-kku
tar -xzf tty.link-font-kku-0.1.1.tgz   # package/ 아래 font-kku.js, font-kku.css, profiles/ …
```

한 줄 설치 대신 CSS를 직접 연결하려면 `font-kku.js`, base CSS, 사용할 글꼴 CSS를 같은 폴더 구조로 둡니다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./font-kku.css" />
    <link rel="stylesheet" href="./profiles/sebul.css" />
    <script src="./font-kku.js" defer></script>
  </head>
  <body>
    <font-kku font="sebul" size="40">광화문</font-kku>
    <h1 class="font-kku" data-font="sebul" data-size="32">안녕하세요</h1>
  </body>
</html>
```

로드 순서는 base CSS → 글꼴 CSS → JavaScript를 권장합니다. 런타임은 문서가 준비되면 전용 태그를 등록하고 `<font-kku>`와 `.font-kku` 바탕 요소를 자동으로 업그레이드합니다. 글꼴 CSS가 첫 그리기 뒤에 도착해도(비동기 `<link>`, 프레임워크의 동적 주입) stylesheet `load` 이벤트에서 글꼴 메타데이터를 다시 해석해 구조를 맞춥니다.

ES module로 쓰려면 classic script 대신 `font-kku.mjs`를 import합니다. module script는 `file://`에서 막히므로 정적 서버로 제공합니다.

```html
<script type="module">
  import FontKku, { renderText } from "./font-kku.mjs";
</script>
```

저장소의 전체 데모는 정적 서버에서 확인하는 편이 안전합니다. 일부 브라우저는 `file://`에서 자소판 그림을 제한합니다.

```bash
python3 -m http.server 8000
# http://127.0.0.1:8000/site/index.html
```

## 두 가지 바탕 요소

새 마크업에는 전용 태그를, 기존 의미 태그를 유지해야 할 때는 클래스 방식을 씁니다.

```html
<!-- 전용 태그: 일반 attribute -->
<font-kku font="sebul" size="48" wrap-unit="line">도시의 밤</font-kku>

<!-- 클래스 방식: class="font-kku" + data-* -->
<h2 class="font-kku" data-font="sebul" data-size="36">서울</h2>
```

| 옵션 | 전용 태그 | 클래스 방식 | 기본값 |
| --- | --- | --- | --- |
| 글꼴 | `font` | `data-font` | 없음 — `sebul`을 세벌 고정 배치로 |
| 크기 | `size` | `data-size` | `24px` |
| 간격 | `spacing` | `data-spacing` | 없음 |
| 줄바꿈 단위 | `wrap-unit` | `data-wrap-unit` | `word` |
| 움직임 | `animate` | `data-animate` | 없음 |
| 변주 씨앗값 | `seed` | `data-seed` | 없음 |

attribute와 `data-*`는 지속 옵션입니다. `FontKku.render()`나 `refresh()`에 넘긴 옵션은 그 호출에만 적용되므로 계속 유지할 값은 바탕 요소의 attribute로 기록합니다. `profile`/`data-profile`은 하위 호환 별칭이며 새 코드는 `font`를 씁니다.

## 조합 — 여섯 축과 테마

글자 모양을 여섯 축으로 나눠 따로 고르고, 고른 조합에 이름을 붙인 것이 **테마**입니다([ADR-017](docs/ADR/ADR-017-composition-axes-and-themes.md), 정본 `spec/themes.json`).

| 축 | 정하는 것 | 쓰는 법 | 고를 수 있는 것 |
| --- | --- | --- | --- |
| 글꼴 | 뼈대 — 짜임(자모 배치) × 획 | `font="sebul"` | 세벌·고딕 계열 — 비움(세벌 고정)·`sebul`·`gothic`·`malang`, 그림 자소 `sprite-system`·`pilgi`·`dunggeun`·`butgeul`, 획 표현 `pixel`·`dojang`·`chalk`·`crayon`·`jasu` |
| 꾸밈 | 칠 — 색·외곽선·그림자, 자모 역할별 | `class="kku-look-neon"` | `neon` `sticker` `geumbak` `glitch` `retro` `saekdong` `riso` `blueprint` `outline` `pastel` `shadow` `inju` |
| 변주 | 씨앗 — 자모마다, 그릴 때마다 조금씩 | `seed="auto" jamo-seeds class="kku-vary-tilt"` | `tilt` 기울기 · `bob` 들썩임 · `weight` 굵기(기기 글꼴) · `width` 너비 · `hue` 색조 · `ink` 농담 · `hoek` 획마다(획 깊이) |
| 움직임 | 애니메이션 — 글자 또는 자모 단위 | `animate="wave"` | 글자: `rise` `fade` `stagger` `bounce` `wiggle` `drift` · 자모(확장): `assemble` `drop` `wave` `flicker` `cycle` `shine` `scroll-assemble` · 획(확장): `draw` |
| 상호작용 | 입력에 반응 | `data-kku-fx="magnet"` | `type` 타자 · `scatter` 흩어졌다 모이기 · `magnet` 커서 자석 · `shuffle` 씨앗 섞기 |
| 바탕 | 꾸밈이 사는 배경 | 페이지 배경 | 밝은·어두운·분홍·종이·칠판·도면·천 |

```html
<script src="font-kku.js" data-fonts="sebul chalk crayon" data-addons="looks motion fx"></script>

<!-- 테마 '고장 난 네온' = 세벌 + 네온 꾸밈 + 깜빡임 + 어두운 바탕 -->
<font-kku font="sebul" class="kku-look-neon" animate="flicker">을지로 네온</font-kku>

<!-- 테마 '칠판 손글씨' = 분필 + 기울기·들썩임 변주(그릴 때마다 새로) + 칠판 바탕 -->
<font-kku font="chalk" seed="auto" jamo-seeds class="kku-vary-tilt kku-vary-bob kku-vary-width">가나다 시간표</font-kku>

<!-- 테마 '크레용 일기'에 섞기 — 누를 때마다 씨앗을 새로 뽑는다 -->
<font-kku font="crayon" seed="auto" jamo-seeds class="kku-vary-tilt kku-vary-hue" data-kku-fx="shuffle">참 잘했어요</font-kku>
```

- **꾸밈**은 글꼴의 칠을 섞지 않고 바꿉니다. 기기 글꼴에는 색·외곽선·그림자를 모두 글자 칠로 칠합니다. 원소 획에는 색과 속 빈 획(`--fy-element-outline`·`--fy-element-fill`)으로, 그림자·테두리는 글자 단위 `drop-shadow`로 칠합니다. 그림 자소에는 마스크 칠([ADR-014](docs/ADR/ADR-014-sprite-mask-paint.md))로 색만 칠하고, 그림자는 글자 단위로 칠합니다. 자소판의 획 질감은 남습니다.
- **변주**는 `seed`와 `jamo-seeds`를 켠 요소에서만 움직입니다. 기울기·들썩임 폭은 모든 조합 글꼴에서 겹침 감사를 통과한 범위이고, 들썩임은 자모가 서로 멀어지는 쪽으로만 움직입니다.
- **움직임**은 글자 단위 여섯 가지가 코어에 있고, 자모 단위 일곱 가지가 `motion` 확장에 있습니다. 둘 다 같은 `animate` 속성으로 고르며, 사용자가 움직임 줄이기를 켜면 멈춥니다.
- **상호작용**은 `fx` 확장의 `FontKkuFx.type(host, ["첫 문장", "둘째 문장"])`처럼 JS로 걸거나, `data-kku-fx`로 선언합니다.
- 레이어 순서는 글꼴(`font-kku.font` → `jamo` → `context`) → 꾸밈(`font-kku.look`) → 움직임(`font-kku.motion`) → 레이어 밖 페이지 CSS입니다. 페이지가 언제나 마지막에 이깁니다.

테마는 35가지입니다. 축을 섞은 조합(`neon-sign` 고장 난 네온, `sticker-pack` 스티커 한 장, `blueprint-assemble` 도면 조립, `crayon-diary` 크레용 일기 …)과, 아래 꾸러미 글꼴·획 표현 글꼴을 그대로 쓰는 테마가 있습니다. 글꼴 페이지의 테마 갤러리와 조합기에서 고르고 코드를 가져갑니다.

## 기본 제공 글꼴과 꾸러미 글꼴

**기본 배치는 세벌 고정입니다**([ADR-026](docs/ADR/ADR-026-sebul-fixed-layout.md)). 글꼴을 밝히지 않은 `<font-kku>`는 세벌 타자기처럼
초성·중성·종성을 역할마다 정해진 자리와 크기로 찍습니다. 같은 초성 ㄱ은 가·고·과·각·곽 어디서나 같은 도장이고, 받침 자리는 늘 비워 둡니다.
ㅘ는 ㅗ 조각과 ㅏ 조각으로 찍습니다. `font="sebul"`처럼 글꼴을 밝히면 그 글꼴의 문맥 배치(모음·받침에 따라 자리가 바뀌는 탈네모꼴)로 그립니다.
배치는 디자인으로도 고릅니다. `registerDesign`에 `version: "1.2"`와 `layout: { profile: "sebul-fixed-v1" | "square-context-v1", revision: "1" }`를 줍니다.

| 이름 | 재료 | 용도 |
| --- | --- | --- |
| `sebul` | CSS 획(원소 재료) — 기기 글꼴·그림 세트로 바꿀 수 있음 | 외부 글꼴 요청 없는 탈네모꼴 방향의 기본 세벌식 조합 |
| `gothic` | CSS 획(원소 재료) — 기기 글꼴·그림 세트로 바꿀 수 있음 | 네모꼴 일반 글꼴 조합 |
| `sprite-example` | 그림 자소 (2행 자소판) | 그림 자소 경로의 실행 가능한 출발용 견본 |
| `sprite-system` | 그림 자소 (6행 자소판) | 기본 자소와 종성·겹받침·문맥별 변형 행을 직접 그린 SVG 자소판에 실측 적합한 배치를 얹은 도달점 예시 |
| `pilgi` 필기 | 그림 자소 (`sprite-system` 짜임) | 획마다 정해진 흔들림·살짝 휜 획·오른쪽으로 기운 손글씨 |
| `dunggeun` 둥근 | 그림 자소 (`sprite-system` 짜임) | 굵고 둥근 끝, 둥글린 모서리 |
| `butgeul` 붓 | 그림 자소 (`sprite-system` 짜임) | 누르며 들어가 빼며 나가는 붓 굵기 변화 |

필기·둥근·붓은 마스크 칠 글꼴이라 `color`나 꾸밈으로 먹색을 바꿉니다.

**파생 글꼴**은 기본 제공 글꼴의 자모 배치를 그대로 물려받고 칠·그림자·기울기·재료만 바꾼 글꼴입니다. 그중 칠만 다른 여덟(`neon`·`sticker`·`geumbak`·`glitch`·`retro`·`saekdong`·`riso`·`blueprint`)은 **꾸러미 글꼴**입니다. `font="neon"`은 `font="sebul" class="kku-look-neon"`과 같은 꾸밈을 쓰고(꾸밈이 그 글꼴의 꾸밈 구간에서 생성됩니다), 확장 없이 CSS 한 장으로 끝납니다. 다만 꾸러미 글꼴은 기기 한글 글꼴로 그리고, `sebul`에 건 꾸밈은 원소 획에 칠합니다(한글 글꼴이 없는 기기에서도 보입니다). 기울기가 다른 `malang`, 획 뼈대가 다른 `pilgi`·`dunggeun`·`butgeul`, 획 표현이 다른 그림 자소 다섯은 글꼴 축의 글꼴입니다. `spec/fonts.json`의 `derivedFrom`이 기반 글꼴을 가리키고, `node scripts/build_derived_fonts.js --write`가 기반 글꼴의 배치를 각 파일의 GENERATED 구간에 복사합니다. 꾸밈은 그 아래에 손으로 씁니다. 기반 글꼴이 다시 교정되면 같은 명령으로 따라가며, `npm test`가 어긋난 파생 글꼴을 거부합니다.

| 이름 | 기반 | 꾸밈 | 바탕 |
| --- | --- | --- | --- |
| `neon` 네온 | `sebul` | 속을 비운 획 + 겹 그림자 빛번짐 (= 꾸밈 `neon`) | 어두운 바탕 |
| `sticker` 스티커 | `sebul` | 역할별 색 + 흰 테두리 + 뜬 그림자 | 색 바탕 |
| `malang` 말랑 | `sebul` | 자리·자모마다 다른 기울기 | 아무 바탕 |
| `retro` 레트로 | `gothic` | 노란 면 + 남색 외곽선 + 두 단 입체 그림자 | 밝은 바탕 |
| `saekdong` 색동 | `gothic` | 초성·중성·받침마다 색동 색 | 밝은 바탕 |
| `geumbak` 금박 | `sebul` | 역할마다 다른 금빛 + 짙은 테두리 + 빛·눌림 그림자 겹 | 어두운 바탕 권장 |
| `glitch` 글리치 | `sebul` | 초성·중성·받침이 저마다 다른 방향으로 청록·자홍 채널이 어긋남 | 어두운 바탕 |
| `riso` 리소 | `gothic` | 분홍·파랑 반투명 잉크 두 판 + 판 어긋남 자국 | 종이색 밝은 바탕 |
| `blueprint` 도면 | `gothic` | 속 빈 선 글자, 역할마다 선 색(흰색·하늘색·노랑)으로 조립 구조가 보임 | 파란 도면 바탕 |
| `pixel` 도트 | `sprite-system` | 획 표현 `dot` — 같은 획을 칸당 20×20 도트로 찍은 자소판, 어느 크기에서나 모서리가 날카롭다 | 밝은 바탕 |
| `dojang` 도장 | `sprite-system` | 획 표현 `stamp` — 붉은 인주 필터로 그린 자소판 | 종이 바탕 |
| `chalk` 분필 | `sprite-system` | 획 표현 `chalk` — 흔들린 가장자리와 가루 결 필터로 그린 흰 자소판 | 칠판 바탕 |
| `crayon` 크레용 | `sprite-system` | 획 표현 `crayon` — 밀랍 질감 자소판을 마스크로 써서 자모마다 다른 크레용 색 | 밝은 바탕 |
| `jasu` 자수 | `sprite-system` | 획 표현 `stitch` — 같은 획을 둥근 실땀(점선)으로 뜨고 실 빛·그림자를 넣은 자소판 | 천(리넨) 바탕 |

그림 자소 글꼴은 자소판 대신 **자모마다 SVG**로도 그립니다(벡터 자소, [ADR-013](docs/ADR/ADR-013-vector-jamo.md)). `jamo-set="sprite-system"`처럼 자모 세트를 고르면 자모 노드마다 인라인 SVG가 들어가, 획이 글자 색(`color`)을 따르고 자리가 눌려도 굵기가 그대로이며 자모마다 색·굵기·끝 모양을 CSS로 바꿉니다. 자모 세트는 코드로 등록합니다 — 기본 세트 `profiles/sprite-system.jamo.js`·`sprite-example.jamo.js`·`pixel.jamo.js`, 또는 `FontKku.registerJamo("brush", { "r0-ㄱ": "M5 12 H45 V28 Q45 54 11 65", … })`.

그림 자소·벡터 자소 글꼴은 **보통 글꼴 파일(TTF·WOFF)로 내보낼 수** 있습니다(`font-kku-export.js`, [ADR-015](docs/ADR/ADR-015-font-file-export.md)) — 런타임이 조립한 자리 변환과 칸 외곽선으로 한글 11,172자를 브라우저에서 몇 초 만에 만들고(WOFF2 약 20KB), 손으로 그린 PNG 자소판도 외곽선을 따서 같은 길로 갑니다. 글꼴 작업실 재료 탭, 글꼴 시험대의 "글꼴 파일 받기", `python scripts/export_font_file.py`에서 씁니다.

기본 제공 자소판은 `scripts/build_jamo_svg.js`가 같은 획 정의를 `spec/sprite-layout.json`의 자리 상자에 놓고 그린 SVG입니다([ADR-011](docs/ADR/ADR-011-svg-jamo-sheets.md)). 자소판 하나는 **획 뼈대**(곧은 `plain`·필기 `pilgi`·둥근 `dunggeun`·붓 `butgeul` — 획을 어떻게 긋는가)와 **획 표현**(민획 `plain`·도트 `dot`·인주 `stamp`·분필 `chalk`·크레용 `crayon`·실땀 `stitch` — 그은 획에 입히는 재료)의 조합이며, 어느 뼈대에나 어느 표현이든 `STYLES` 한 줄로 붙습니다. 벡터라 크게 띄워도 계단이 지지 않습니다. 획 정의를 고친 뒤 `node scripts/build_jamo_svg.js --write`로 다시 그리지 않으면 `npm test`가 실패합니다. 같은 자리 상자 안에 그리면 사람이든 AI 에이전트든 새 자소판이 sprite-system의 보정된 배치를 그대로 씁니다.

`default`와 `classic`은 `sebul`, `gothic2`는 `gothic`의 사용 중단된 별칭입니다. 런타임이 별칭을 canonical `data-fy-font` 값으로 정규화하므로 새 CSS와 예제에서는 canonical 이름만 씁니다.

## JavaScript API

대부분의 정적 페이지는 API 호출 없이 동작합니다. 동적 텍스트나 삽입된 DOM을 다룰 때는 `window.FontKku`를 씁니다.

```js
const host = document.querySelector("font-kku");

FontKku.render(host, {
  text: "광화문",
  font: "sebul",
  size: 64,
  animate: "rise"
});

FontKku.refresh(host, { text: "새 문장" });
```

주요 API는 `render`, `refresh`, `refreshAll`, `loadFont`, `retryFont`, `fontInfo`, `upgrade`, `upgradeAll`, `decomposeGlyph`, `createTextModel`, `renderText`, `hashSeed`, `applyJamoSeeds`, `hasHangulFont`, `registerJamo`·`jamoSets`(그림 세트), `layoutProfiles`·`layoutStability`(배치)입니다. `upgradeAll(root)`는 root의 자손만 처리하므로 root 자신이 바탕 요소라면 `upgrade(root)`를 씁니다. `refreshAll(root?)`는 현재 스타일로 글꼴 메타데이터(depth 등)를 다시 해석해 구조가 바뀐 바탕 요소는 attribute를 다시 읽어 다시 그리고, 벡터 칸의 행만 바뀌면 SVG만 갱신합니다(shadow root 안 포함). `adoptedStyleSheets`나 `<style>` 텍스트 교체처럼 load 이벤트가 없는 스타일 변경 뒤에 호출합니다. `loadFont(href, { root })`는 글꼴 CSS를 `<link>`로 불러온 뒤 바탕 요소를 다시 해석하는 정적 헬퍼로, 같은 URL이면 같은 Promise를 돌려주고 실패하면 reject 후 재시도할 수 있으며, `fontInfo(host)`는 글꼴 CSS가 선언한 `--fy-font-id`·`--fy-contract`·`--fy-material`과 도착 여부(`loaded`), 재료(`face` — `element`·`device`·`svg`), 배치(`layout` — 세벌 고정이면 `{ profile, revision, model }`, 문맥 배치면 `null`), 디자인(`design`·`designStatus`)을 돌려줍니다. `layoutStability(host)`는 세벌 고정이 그려진 결과에서도 지켜지는지(같은 역할·자모가 모두 같은 자리인지) `{ stable, drifted, … }`로 알려 줍니다 — 페이지 CSS가 이웃 자모를 보고 자모를 옮기면 `stable: false`입니다. 런타임이 바탕 요소를 그릴 때마다(자동 다시 그리기 포함) `font-kku:render` 이벤트(`detail.reason`)가 발생하므로, 그린 뒤 DOM 후처리는 이 이벤트에 걸면 됩니다. `jamo-seeds` 속성(클래스 방식은 `data-jamo-seeds`)을 주면 그릴 때마다 바탕 요소의 씨앗값을 반영한 `--fy-jamo-seed`를 자모 노드에 자동으로 다시 겁니다(브라우저 전용). 전체 표면과 옵션 계약은 [Framework Guide](docs/ARCHITECTURE/framework-guide.md)와 [Browser Runtime Design](docs/ARCHITECTURE/browser-runtime-design.md)을 참고하세요.

자동 로딩 실패는 CSS의 root·URL별로 격리됩니다. `FontKku.retryFont(host)`로 현재 글꼴·자모 세트를 다시 요청할 수 있고, 명시적인 `FontKkuConfig.fontBase` 변경은 새 주소를 사용합니다. 실패 시 호스트의 `font-kku:loaderror` 이벤트에서 `{ kind, name, url, error }`를 받을 수 있습니다. 자동 속성 갱신 중 크기·간격·움직임만 바뀌면 기존 자모 DOM을 유지하며, 명시적인 `render()`·`refresh()`는 전체 다시 그리기를 유지합니다.

크기 조절 같은 반복 갱신은 `host.setAttribute("size", "48")`처럼 지속 속성을 바꾸면 됩니다. 원문·글꼴·깊이·해석된 씨앗값 등이 그대로일 때 기존 노드를 재사용합니다. 이어서 `refresh()`를 부르면 전체를 다시 만들므로 보통 추가 호출은 필요 없습니다. `font-kku:render` 이벤트는 DOM을 유지한 갱신에서도 발생하므로 후처리는 같은 노드에 여러 번 적용해도 안전하게 작성합니다.

| 바꾸는 것 | 갱신 방식 |
|---|---|
| 크기·간격·움직임 속성, 구조와 씨앗은 동일 | 기존 DOM에 새 표시 옵션 반영 |
| 본문·글꼴·자모 구조 | 필요한 전체 트리 생성 |
| CSS의 벡터 행 선택 | `refreshAll(host)`로 해당 SVG 갱신 |
| 명시적 `render()`·`refresh()` | 관리 DOM 전체 재생성 |

요소 재사용은 브라우저의 스타일 계산·레이아웃·그리기 비용까지 없애는 것은 아닙니다. 실제 작업량 비교와 해석은 [설계 검토 기록](docs/REVIEW/2026-10-11-design-flexibility-review.md)에 정리했습니다.

부분 벡터 세트는 등록된 칸만 SVG로 바꾸고 나머지는 기반 자소판으로 표시합니다. CSS로 `--fy-sprite-row`를 바꾼 뒤에는 `refreshAll(host)`으로 칸을 다시 선택합니다. 상세 결정은 [ADR-020](docs/ADR/ADR-020-rendering-boundaries-and-recovery.md)을 참고하세요.

모듈을 모델/평문 API 용도로만 가져오거나 초기 DOM 변경 시점을 직접 제어하려면
런타임을 불러오기 전에 자동 bootstrap을 끕니다. 이후 필요한 root에만 수동 호출할 수
있습니다.

```js
globalThis.FontKkuConfig = { bootstrap: false };
const { default: FontKku } = await import("@tty.link/font-kku");
FontKku.bootstrap(document.querySelector("#poster"));
```

브라우저 배포물은 별도 빌드가 필요 없는 IIFE script와 이를 감싼 ESM 진입점(`font-kku.mjs`)이고, Node 진입점은 CommonJS `require()`와 ESM `import`를 모두 제공합니다. 자동 브라우저 회귀는 현재 Playwright Chromium을 기준으로 하며 Firefox/WebKit은 release gate에 포함되지 않습니다(Playwright Firefox가 설치돼 있으면 SVG 재료 획 굵기 검사 하나만 Firefox로도 돕니다).

### 디자인 API (실험)

자모마다 무엇으로 그리고(원소 획·그림 세트·글꼴), 그림이 있어도 조립할지, 어떤 배치로 찍을지를 **디자인** JSON으로 정합니다([ADR-025](docs/ADR/ADR-025-hangul-composition-design.md), 형식 `spec/design.schema.json`). 0.1.1부터 있는 실험 API라 이름과 형식이 바뀔 수 있습니다. 구조는 JSON으로 등록하고 CSS는 이름만 고릅니다.

```html
<script>
  FontKku.registerDesign("mix", {
    version: "1.2",
    layout: { profile: "sebul-fixed-v1", revision: "1" },  // 세벌 고정 — 네모 문맥은 square-context-v1
    mode: "svg",
    sources: { hand: { kind: "svg", assetSet: "pilgi-box" }, round: { kind: "svg", assetSet: "dunggeun-box" } },
    defaults: { source: "hand", method: "auto" },
    roleSources: { final: "round" },
    rules: [{ id: "ppa", match: { jamo: "ㅃ" },
              apply: { method: "compose", recipe: "double-bieup", bindings: { right: { source: "round" } } } }]
  });
</script>
<font-kku style="--fy-design: mix" size="64">뿌리 깊은 나무</font-kku>
```

| API | 하는 일 |
| --- | --- |
| `registerDesign(name, design, { replace? })` | 검사해 등록합니다. 첫 오류를 던집니다(`error.code`·`error.path`). 같은 이름에 다른 내용은 `DESIGN_NAME_TAKEN` — `{ replace: true }`면 바꾸고 그 이름을 고른 글자를 다시 그립니다 |
| `validateDesign(design)` | 같은 규칙으로 검사만 합니다 — `{ ok, errors: [{ code, path, message }] }`, 오류를 모두 돌려주고 던지지 않습니다 |
| `unregisterDesign(name)` · `designs()` | 등록 지우기(그 이름을 쓰던 글자는 `DESIGN_NOT_REGISTERED`) · 등록된 이름 목록 |
| `planJamo(jamo, opts)` · `traceOf(host)` | 자모 하나의 조립 계획 · 그린 바탕 요소의 조각마다 소스·조립식·이긴 규칙·상태 |
| `stagePreview(set, stage)` · `authoringProgress(set)` | 그림 세트를 원형 8·기본 24·확장 40까지만 그린 셈 치는 미리보기 디자인 · 단계마다 그린 자모 |

- `mode`는 `primitive`(원소 획)·`svg`(그림 세트)·`font`(글꼴 팔레트 — 페이지가 실어 둔 글꼴을 역할·자모·조각마다)입니다. 조립식(`double-bieup`, ㅎ = ㆍ + ㅡ + ㅇ의 `hieut-added-lines` …)은 `spec/jamo-recipes.json`에 있습니다.
- 세벌 고정 디자인은 자모·역할로만 고릅니다. 짜임별 규칙(`DESIGN_FIXED_CONTEXT`), 합자 모음 통째 그리기(`DESIGN_FIXED_COMPOUND`), 자리마다 변주(`DESIGN_FIXED_VARIATION`)는 거부합니다. `layout`을 적지 않은 디자인은 문맥 배치로 그립니다.
- 고르지 못하면 지금 설정으로 그리고 바탕 요소의 `data-fy-design-status`로 알립니다: `DESIGN_NOT_REGISTERED`(미등록 이름 — 등록하면 다시 그림), `DESIGN_TOKEN_INVALID`(이름 문법), `DESIGN_UNSUPPORTED_FONT`(그림 자소 글꼴처럼 디자인을 받지 않는 글꼴).
- 브라우저에서 만들려면 [글꼴 작업실](https://font.tty.link/font-studio.html)의 디자인 칸을 씁니다 — 선·원/직접 그린 그림/기존 글꼴 세 가지로 시작하고, 원형 8 → 24 → 40 그리기, 조립식 비교, 출처, 글꼴 팔레트를 거쳐 디자인 JSON·페이지용 코드·묶음 파일로 가져갑니다([글꼴 작업실 설계](docs/ARCHITECTURE/font-studio.md)).

## 평문 모드와 터미널 명령

브라우저 CSS 없이 한글을 2줄 평문으로 분해할 수 있습니다. 이 모드에는 `font`, `size`, 움직임이 적용되지 않습니다.

```js
const FontKku = require("./font-kku.js");

FontKku.renderText("안녕하세요").forEach((line) => console.log(line));
```

```bash
node ./bin/font-kku-text.js "안녕하세요 반갑습니다"
printf "한글\n테스트\n" | node ./bin/font-kku-text.js
font-kku-text --version
```

터미널 명령은 argv, piped stdin, 명시적 stdin 표시 `-`를 지원합니다. 상세 출력 규칙과 `--` 옵션 경계는 [Text Mode Design](docs/ARCHITECTURE/text-mode-design.md)을 참고하세요.

## 한글 글꼴·입력기 없는 기기

한글 글꼴도 한글 입력기도 없는 기기(키오스크, 최소 설치 리눅스, 외국에서 빌린 컴퓨터)에서도 한글을 보이고 쓰게 할 수 있습니다([ADR-012](docs/ADR/ADR-012-hangul-ime-and-fontless-devices.md)).

- **보이기** — 기본 원소 획(글꼴을 밝히지 않은 글, `sebul`·`gothic`·`malang`)은 자소와 낱자(`ㅋㅋ`, 조합 중인 `ㄱ`)를 CSS 획으로, 그림 자소 글꼴(`sprite-system`·`pilgi`·`dunggeun`·`butgeul`·`pixel`·`dojang`·`chalk`·`crayon`·`jasu`)은 자소판 그림으로 칠해 기기 글꼴이 필요 없습니다. 기기 글꼴로 그리는 꾸러미 글꼴(`neon`·`sticker` …)과 `--fy-face: device`만 한글 글꼴이 있어야 합니다 — `FontKku.hasHangulFont()`가 `false`면 꾸러미 글꼴 대신 같은 꾸밈 클래스(`kku-look-*`)를 원소 획에 거세요.
- **쓰기** — 선택 모듈 `font-kku-ime.js`(npm `@tty.link/font-kku/ime`)가 영문 자판의 키를 두벌식 표준·세벌식 390·세벌식 최종 배열대로 받아 유니코드 한글을 조합합니다. `<input>`·`<textarea>`에 `attach()`로 붙이거나, `convert()`로 키 문자열을 한 번에 바꿉니다.

```html
<script src="font-kku-ime.js"></script>
<script>
  FontKkuIme.convert("dkssudgktpdy");                 // "안녕하세요"
  FontKkuIme.attach(document.querySelector("textarea"), { layout: "sebeol-final" });
</script>
```

완성된 예는 사례의 웹 앱 [전광판](https://font.tty.link/sign.html)과 [메모장](https://font.tty.link/memo.html)입니다. 주소에 `?hangul-font=none`을 붙이면 글꼴 없는 기기처럼 보입니다.

## 움직임, 변주, 접근성

코어의 글자 단위 움직임은 `rise`, `fade`, `stagger`, `bounce`, `wiggle`, `drift` 여섯 가지입니다. `motion` 확장(`font-kku-motion.css`)은 자모 단위 움직임 일곱 가지를 더합니다: `assemble` 자모 조립, `drop` 받침 톡, `wave` 물결, `flicker` 깜빡임, `cycle` 색 순환, `shine` 반짝, `scroll-assemble` 스크롤 조립. 그리고 벡터 자소를 획으로 쪼개 획순대로 긋는 `draw` 획순 그리기가 있습니다(획 깊이 `stroke-depth="stroke"`, ADR-018). 한 번 도는 움직임은 다시 그리면(`FontKku.refresh`, `FontKkuFx.replay`) 다시 돌고, 조상에 `data-kku-paused`를 두면 그 자리에 섭니다. 상호작용은 `fx` 확장(`font-kku-fx.js`, npm `@tty.link/font-kku/fx`)의 `FontKkuFx.type`·`scatter`·`magnet`·`shuffle`이 맡습니다.

고정 씨앗값은 재현 가능한 변주를, `auto`/`random`은 그릴 때마다 다른 값을 만듭니다. 자소별 변주는 `jamo-seeds`(또는 `FontKku.applyJamoSeeds()`)와 공개 CSS 변수를 조합하고, 겹침 감사를 통과한 공용 변주 클래스 `kku-vary-tilt`·`bob`·`width`·`hue`·`ink`(`looks` 확장)가 어느 글꼴에나 걸립니다(`weight`는 기기 글꼴, `hoek`은 획 깊이에서).

**씨앗 반응 글꼴**(`malang`·`crayon`·`chalk`·`jasu`·`sticker`·`glitch`)은 글꼴이 직접 씨앗을 읽어 자모마다 기울기·위치·색조를 흔듭니다([ADR-016](docs/ADR/ADR-016-seed-aware-fonts.md)). 켜지 않으면 모양이 그대로이고, 흔들림 폭은 겹침 감사의 씨앗 표본을 통과한 범위입니다.

```html
<font-kku font="crayon" seed="auto" jamo-seeds>하하하하</font-kku>  <!-- 그릴 때마다 새로 -->
<font-kku font="crayon" seed="민지" jamo-seeds>하하하하</font-kku>  <!-- 언제나 같은 모양 -->
```

런타임은 분해된 관리 root를 `aria-hidden="true"`로 숨기고, 형제 `part="sr-source"`에 원문을 보존합니다([ADR-003](docs/ADR/ADR-003-accessibility-contract.md)). 읽히는 글자는 이 노드 하나라 바탕 요소에 `aria-label`을 쓰지 않으며(0.1.1부터 — 정적 렌더러도 같습니다), 직접 붙인 `aria-label`·`role`은 그대로 둡니다. 그래서 `<button class="font-kku">확인</button>`의 이름은 "확인"이고, 바탕 요소를 골라 복사하면 원문만 복사됩니다. 원문을 코드에서 읽을 때는 `data-source`를 씁니다. 다만 바탕 요소 안의 원래 텍스트 DOM은 관리 DOM으로 교체되므로 SEO나 hydration 보장을 과장해서는 안 됩니다. 의미 태그를 유지해야 하면 클래스 방식을 쓰세요. 직접 만든 움직임에는 `prefers-reduced-motion` 가드를 직접 추가해야 합니다.

브라우저 런타임 자체는 서버 DOM/hydration API를 제공하지 않습니다. 서버에서 정적 HTML이 필요하면 아래 보조 렌더러의 `render_html`을 쓰고, 생성한 바탕 요소에 client bootstrap을 중복 적용하지 않습니다.

## 보조 렌더러

Python, Go, Rust, Ruby 구현은 JavaScript 코어를 감싼 것이 아니라 `spec/` 계약을 독립적으로 구현한 보조 렌더러입니다. 모두 2줄 평문과 정적 HTML 출력을 제공합니다. 기본 번들에는 `sebul`·`gothic`이 들어 있고, 호출별 `FontDefinition`으로 사용자 system 글꼴 CSS와 기본 깊이를 전달할 수 있습니다. sprite/vector 재료와 그림 세트, 디자인(`registerDesign`), 자동 URL 로딩, 상호작용은 정적 렌더러에서 지원하지 않습니다.

글꼴을 밝히지 않은 호출(`render_html(text)`, 빈 이름)은 브라우저의 `<font-kku>`처럼 기본 배치 세벌 고정(`sebul-fixed-v1`, [ADR-026](docs/ADR/ADR-026-sebul-fixed-layout.md))으로 그리고, 자모 노드에 런타임과 같은 역할 도장을 씁니다. 자모는 런타임 기본처럼 원소 획으로 그려([ADR-027](docs/ADR/ADR-027-static-element-face.md)) 브라우저·JS 없이도, 읽는 기기에 어떤 한글 글꼴이 있든 같은 모양입니다. 세벌 고정 배치는 두고 기기 글꼴 글자로 그리려면 `face="device"`(Ruby `face: "device"`, Go `WithFace("device")`, Rust `face: "device"`), 0.1.0의 기본값처럼 글꼴의 문맥 배치로 그리려면 `font="sebul"`을 넘기세요.

네 언어 모두 호출별 `FontDefinition`으로 사용자 system 글꼴 CSS와 기본 깊이를 전달할 수 있습니다. Unicode 정책·지원 범위는 [capabilities.json](spec/capabilities.json), API 예제와 생성 절차는 [언어 공통 렌더 계약](docs/ARCHITECTURE/renderer-contracts.md)을 참고하세요.

| 언어 | 평문 API | HTML API |
| --- | --- | --- |
| Python | `font_kku.render_text(text)` | `font_kku.render_html(text, ...)` |
| Go | `fontkku.RenderText(text)` | `fontkku.RenderHTML(...)` |
| Rust | `font_kku::render_text(text)` | `font_kku::render_html(...)` |
| Ruby | `FontKku.render_text(text)` | `FontKku.render_html(...)` |

레지스트리에는 npm 패키지만 공개했습니다. Python·Go·Rust·Ruby 렌더러는 아직 PyPI·Go 모듈 프록시·crates.io·RubyGems에 없으므로 저장소에서 로컬 package와 path dependency로 설치합니다. JavaScript/Python/Rust/Ruby package는 `package.json`의 버전 하나를 함께 쓰고, Go 모듈 버전은 release tag로 부여합니다. 번호 규칙은 [ADR-022](docs/ADR/ADR-022-npm-name-and-versioning.md)를 따릅니다. 설치·패키징과 언어별 한계는 [Multi-language Renderers](docs/PLAN/multi-language-renderers.md)와 [TESTING.md](TESTING.md)를 확인하세요.

## 데모 사이트

공개 사이트는 [https://font.tty.link/](https://font.tty.link/)입니다. 저장소에서는 `site/index.html`을 정적 서버로 엽니다(`python3 -m http.server 8000` → `http://127.0.0.1:8000/site/index.html`). 공개 메뉴는 여섯입니다.

- [소개](https://font.tty.link/): **같은 글자도 매번 다르게** — 이 페이지가 한 번 받은 스크립트·CSS만으로 '하' 다섯 개를 글꼴·꾸밈·변주·움직임이 저마다 다르게 섞는 카드('씨앗만'으로 바꾸면 한 조합에서 씨앗만 다르다). **이럴 때 폰꾸** — 역할별로 거르는 문제 카드 18장과 증명 데모 7종(글꼴이 막힐 때·매번 다른 글꼴·빈 글자 검사·글꼴 파일 계기판·마크다운 → 텍스트·AI로 세 번·이미지 대신 텍스트), 대표 쓰임 셋(웹·AI 에이전트·봇/터미널)과 바로 따라 하는 코드·프롬프트
- [사례](https://font.tty.link/showcase.html): 포스터·블로그·발표 표지·메뉴판·학습지·게임 공지·상장·청첩장·네온 간판·예능 자막·RPG 대화창·그림일기·개발자 밋업 포스터·공방 클래스 완성 템플릿(`site/examples/`) — 열어 보기, HTML 복사·내려받기(런타임 주소는 jsDelivr로 바뀜), 같은 결과를 내는 AI 프롬프트
  - 웹 앱: [전광판](https://font.tty.link/sign.html)·[메모장](https://font.tty.link/memo.html) — 한글 글꼴·입력기 없는 기기에서 영문 자판으로 두벌식·세벌식 한글을 쓴다
- [글꼴](https://font.tty.link/fonts.html): 여섯 축(글꼴·꾸밈·변주·움직임·상호작용·바탕)으로 나눈 **테마 갤러리**(테마 35가지, 조합 배지와 코드 복사)와 축을 하나씩 고르는 **조합기**, 글꼴 축의 견본과 문장·크기·바탕 시험대, 글꼴별 **꾸미기**(그 글꼴을 바탕으로 색·외곽선·그림자·변주·움직임을 바꿔 나만의 꾸밈 글꼴 CSS로 가져가기), **폰꾸로 만드는 글꼴**(꾸미기·뽑기·씨앗 변주·자소판 그리기·SVG/AI·글꼴 파일 내보내기·CSS 고치기·벡터 자소 세트)
- [움직임](https://font.tty.link/effects.html): 자모 단위 움직임(조립·받침 톡·물결·깜빡임·색 순환·반짝·스크롤 조립과 코어 글자 움직임)과 상호작용(두벌식 타자·흩어졌다 모이기·커서 자석·씨앗 섞기) — 카드마다 `data-addons`로 붙이는 짧은 코드
- [문서](https://font.tty.link/docs.html): 설치, 바탕 요소와 속성, 줄바꿈, 꾸미기(CSS), 움직임·변주, 평문·봇, AI와 쓰기, 글꼴 만들기, API·CSS 레퍼런스
- [작업실](https://font.tty.link/font-studio.html): 첫 화면의 **디자인** 칸 — 세벌 고정 기본 디자인에서 선·원/직접 그린 그림/기존 글꼴로 시작하고, 그리기 8 → 24 → 40(칸 편집기·SVG 가져오기), 조립식·binding 비교, 출처, 글꼴 팔레트, 편집 기록과 영향 확인, 디자인 JSON·페이지용 코드·묶음 파일([실험](#디자인-api-실험)). 그 밖에 글꼴 CSS 편집과 [자소판 그리기](https://font.tty.link/font-studio.html?font=sprite-example#studio-material)(재료 탭)

검증·실험용 **개발 도구** 페이지는 메뉴에서 빼고 문서 끝에서 잇습니다: [기본 글](https://font.tty.link/basic-text.html), [줄바꿈](https://font.tty.link/layout-modes.html), [짜임 비교](https://font.tty.link/shape-comparison.html), [놀이터](https://font.tty.link/api-studio.html), [그림 자소 보기](https://font.tty.link/sprite-demo.html), [움직임](https://font.tty.link/animation-catalog.html), [재료와 깊이](https://font.tty.link/faces.html).

## 목적별 문서 지도

| 목적 | 먼저 볼 문서 |
| --- | --- |
| 처음 쓰거나 페이지에 적용 | [Framework Guide](docs/ARCHITECTURE/framework-guide.md) |
| 런타임 수명주기, API, DOM 이해 | [Browser Runtime Design](docs/ARCHITECTURE/browser-runtime-design.md), [Text Segmentation Model](docs/ARCHITECTURE/text-segmentation-model.md) |
| CSS 글꼴 제작·교정 | [Font Authoring and Calibration Guide](docs/ARCHITECTURE/font-authoring-and-calibration-guide.md), [Style Font System](docs/ARCHITECTURE/style-profile-system.md), [글꼴 작업실](docs/ARCHITECTURE/font-studio.md) |
| 그림 자소 글꼴 제작 | [Image Sprite Fonts](docs/ARCHITECTURE/image-sprite-fonts.md), [글꼴 작업실 재료 탭](docs/ARCHITECTURE/font-studio.md) |
| 파생 글꼴과 한 줄 설치 | [ADR-010](docs/ADR/ADR-010-derived-fonts-and-script-loader.md) |
| 글꼴·꾸밈·변주·움직임·상호작용 조합과 테마 | [조합 체계](docs/ARCHITECTURE/composition-axes.md), [ADR-017](docs/ADR/ADR-017-composition-axes-and-themes.md) |
| 기본 배치 세벌 고정, 원소 획, 디자인(실험) | [ADR-026](docs/ADR/ADR-026-sebul-fixed-layout.md), [ADR-024](docs/ADR/ADR-024-hangul-principle-rendering.md), [ADR-025](docs/ADR/ADR-025-hangul-composition-design.md), [글꼴 작업실](docs/ARCHITECTURE/font-studio.md) |
| 접근성(낭독·복사) | [ADR-003](docs/ADR/ADR-003-accessibility-contract.md) |
| 한글 글꼴·입력기 없는 기기, 영문 자판 한글 입력 | [ADR-012](docs/ADR/ADR-012-hangul-ime-and-fontless-devices.md), [문서 · 글꼴·입력기 없는 기기](https://font.tty.link/docs.html#nofont) |
| 움직임과 씨앗값 변주 | [Animation and Variation](docs/ARCHITECTURE/animation-and-variation.md) |
| 터미널 명령과 서버 정적 HTML | [Text Mode Design](docs/ARCHITECTURE/text-mode-design.md), [언어 공통 렌더 계약](docs/ARCHITECTURE/renderer-contracts.md), [ADR-027](docs/ADR/ADR-027-static-element-face.md) |
| 용어 | [용어집](docs/GLOSSARY.md) |
| 전체 구조와 의사결정 | [ARCHITECTURE.md](ARCHITECTURE.md), [ADR.md](ADR.md) |
| 개발·릴리스 검증 | [TESTING.md](TESTING.md) |
| 구현 상태와 다음 작업 | [IMPL_STATUS.md](IMPL_STATUS.md), [TODO_LIST.md](TODO_LIST.md), [CHANGELOG.md](CHANGELOG.md) |
| AI 에이전트의 font-kku 작업 | [font-kku skill](skills/font-kku/SKILL.md) |

## 개발과 검증

문서와 Node 계약의 빠른 검증:

```bash
npm test
npm run test:docs
```

전체 release matrix는 Python 가상환경과 Playwright browser, Go, Rust, Ruby 2.7+ 등의 도구가 필요합니다. 정확한 bootstrap과 개별 명령은 [TESTING.md](TESTING.md)를 기준으로 합니다.

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
npm run verify            # 일상 검증 — 줄인 측정 표본, 측정 캐시
npm run verify:release    # 공개 전 — 전체 표본, 캐시 읽지 않음
```

## 외부 자산과 개인정보

배포 CSS는 원격 웹 글꼴을 불러오지 않습니다. 기본 원소 획(`sebul`·`gothic`·`malang`)은 CSS로
긋고, 꾸러미 글꼴과 `--fy-face: device`는 방문자 기기에 설치된 한글 글꼴을 쓰며, 그림 자소
글꼴과 그림 세트는 패키지에 포함된 상대 경로 자소판(SVG)·자모 모듈만 읽습니다. 따라서 font-kku 자체를 쓸 때 글꼴 CDN으로 방문자 요청이 전달되지
않습니다. 역사적 J해바라기 비교 도구, 자소판의 출처와 배포 자산의 경계는
[Third-party notices](THIRD_PARTY_NOTICES.md)에 기록했습니다.

## License

코드(JavaScript, CSS, 도구, 보조 렌더러)와 기본 제공 자소판(`profiles/*.svg`, 직접 그린 그림)은 모두 [MIT](LICENSE)입니다. 개발 도구가 명시적으로 받는 외부 글꼴의 경계는 [Third-party notices](THIRD_PARTY_NOTICES.md)를 보세요.
