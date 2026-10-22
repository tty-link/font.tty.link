# 평문 모드 설계

> Status: Implemented
> Scope: 터미널 환경용 2줄 자소 분리 평문 출력기

## 왜 필요한가

영문 콘솔 환경은 FIGlet 같은 도구로 2~3줄짜리 큰 글자를 손쉽게 만들 수 있었지만, 한글은 초·중·종성이 한 칸 안에서 결합되는 구조라서 ASCII 아트로는 잘 표현되지 않았다. 평문 모드는 같은 분해 엔진이 만든 자소 정보를 **평문 2줄 레이아웃으로 풀어 써서**, SSH·터미널 명령·로그·서버 배너·MOTD 같은 텍스트 전용 환경에서도 한글이 "그림처럼" 읽히게 한다. 브라우저와 한글 논리 자모·topology를 공유하므로 분해 결과를 빠르게 확인할 수 있다. 평문은 atomic 논리 분해에 이 문서의 격자를 적용하고, DOM은 글꼴 depth의 표시 계획을 적용하므로 최종 표시 단위는 다를 수 있다.

## 목표

한글 완성형 음절을 자소 단위로 분해해 입력 줄마다 **2줄 평문 텍스트**로 출력하는 평문 출력기를 제공한다. 브라우저 DOM이 아닌 터미널(stdout) 환경에서 자소 배치를 시각적으로 확인할 수 있게 한다.

## Related Documents
- Architecture: [텍스트 분절 모델](./text-segmentation-model.md)
- Architecture: [브라우저 런타임 설계](./browser-runtime-design.md)
- Architecture: [스타일 글꼴 체계](./style-profile-system.md)
- Architecture: [언어 공통 렌더 계약](./renderer-contracts.md)
- Machine-readable contract: [구현별 지원 범위](../../spec/capabilities.json)

## 2줄 레이아웃 모델

각 음절은 **2행 × 2자 폭**의 열(column)로 그려진다.

```
Line 1 (상단):  초성·중성 또는 부분 합자
Line 2 (하단):  종성 또는 하단 모음
```

한 줄 입력은 정확히 2줄이고, N줄 입력은 위/아래 줄 쌍을 순서대로 이어 2N줄을 반환한다.

### 예시

입력: `안녕하세요 봔갑습니다`

```
ㅇㅏ ㄴㅕ ㅎㅏ ㅅㅔ ㅇ    보ㅏ ㄱㅏ 스  ㄴㅣ ㄷㅏ
  ㄴ  ㅇ          ㅛ      ㄴ  ㅂ  ㅂ
```

- `안`(세로모음+종성): L1 = `ㅇㅏ`, L2 = `  ㄴ`
- `요`(가로모음, 종성 없음): L1 = `ㅇ `, L2 = ` ㅛ`
- `봔`(섞임모음+종성): L1 = `보ㅏ` (ㅂ+ㅗ 합자 + ㅏ), L2 = `  ㄴ`
- `습`(가로모음+종성): L1 = `스 ` (ㅅ+ㅡ 합자), L2 = ` ㅂ`

## 축별 배치 규칙

`jungLayout`(세로모음 `right` / 가로모음 `bottom` / 섞임모음 `split-right`)과 `jongLayout`(민글자 `none` / 홑받침 `single` / 겹받침 `double`)의 조합으로 각 칸의 내용이 정해진다.

### 세로모음 짜임 (ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ ㅕ ㅖ ㅣ)

초성과 중성이 좌우로 붙는 구조.

| 종성 | Line 1 | Line 2 |
|------|--------|--------|
| 민글자 | `초` `중` | (빈칸) |
| 홑받침 | `초` `중` | ` ` `종` |
| 겹받침 | `초` `중` | `종左` `종右` |

예: `가` → `ㄱㅏ` / `    `, `강` → `ㄱㅏ` / `  ㅇ`, `읽` → `ㅇㅣ` / `ㄹㄱ`

### 가로모음 짜임 (ㅗ ㅛ ㅜ ㅠ ㅡ)

초성 아래에 중성이 위치하는 구조.

| 종성 | Line 1 | Line 2 |
|------|--------|--------|
| 민글자 | `초` ` ` | ` ` `중` |
| 홑받침 | `초중` (합자) ` ` | ` ` `종` |
| 겹받침 | `초중` (합자) ` ` | `종左` `종右` |

종성이 있으면 초+중을 한 칸짜리 합자로 압축하여 Line 1에 놓고, Line 2를 종성에 쓴다.
종성이 없으면 초와 중을 Line 1/Line 2로 분리하여 수직 배치를 살린다.

예: `요` → `ㅇ ` / ` ㅛ`, `습` → `스 ` / ` ㅂ`, `옥` → `오 ` / ` ㄱ`

합자: `초+중`을 유니코드 완성형 음절로 조합한다 (종성 없는 음절). 예: ㅅ+ㅡ → 스, ㅇ+ㅗ → 오.

### 섞임모음 짜임 (ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ ㅢ)

복합 모음을 base + tail로 나눠 초+base를 합자로 만든다.

| 종성 | Line 1 | Line 2 |
|------|--------|--------|
| 민글자 | `초base` (합자) `tail` | (빈칸) |
| 홑받침 | `초base` (합자) `tail` | ` ` `종` |
| 겹받침 | `초base` (합자) `tail` | `종左` `종右` |

합자: 초+base_중을 종성 없는 음절로 조합한다. 예: ㅂ+ㅗ → 보, ㄱ+ㅜ → 구, ㅎ+ㅗ → 호.

예: `봔`(ㅂ+ㅘ+ㄴ) → `보ㅏ` / `  ㄴ`, `환`(ㅎ+ㅘ+ㄴ) → `호ㅏ` / `  ㄴ`, `권`(ㄱ+ㅝ+ㄴ) → `구ㅓ` / `  ㄴ`, `의`(ㅇ+ㅢ) → `으ㅣ` / `    `

## 간격 규칙

출력 격자는 전각 공백(U+3000, `　`) 기준이다.

| 구분 | 간격 |
|------|------|
| 음절 사이 | 전각 공백 1자 |
| 단어 경계 (원문 띄어쓰기) | 원문 공백이 이어진 길이만큼 전각 공백 N자 (연속 공백/탭 길이 보존) |

## 비한글 문자

| 종류 | 열 폭 | Line 1 | Line 2 |
|------|------|--------|--------|
| ASCII 인쇄 문자 | 2 (전각 변환 후) | 전각 문자로 변환 (`A`→`Ａ`) | 전각 공백 1칸 |
| 전각·넓은 문자 (漢, `Ａ`, 이모지) | 2 | 문자 그대로 | 전각 공백 1칸 |
| 좁은 비ASCII (`ệ`, `ש`, `ｶ`, `±`) | 1 | 문자 + ASCII 공백 1개 | 전각 공백 1칸 |
| 0열 grapheme (ZWSP 등) | 0 | 문자 + ASCII 공백 2개 | 전각 공백 1칸 |
| 넓은 grapheme (`한`+U+302E 방점) | 4 | 문자 그대로 | 전각 공백 2칸 |

ASCII U+0021–U+007E는 U+FEE0을 더한 전각 문자로 바꾼다(grapheme의 첫 코드포인트만, 뒤 결합 문자는 유지). 그 밖의 비한글 grapheme은 Line 1에 원문을 둔다. 비한글 칸은 grapheme의 **표시 폭**(터미널 열 수)을 덮는 전각 칸 수(최소 1칸 = 2열)를 차지하고, 홀수 폭은 Line 1 뒤에 ASCII 공백을 채운다. 그래서 모든 글자 칸의 윗줄과 아랫줄이 같은 열 폭을 가져 뒤따르는 받침 열이 밀리지 않는다(`Việt 한` → 두 줄 모두 20열). 한글·ASCII 출력은 이 규칙 이전과 바이트 단위로 같다.

### 표시 폭 규칙

코드포인트 폭은 wcwidth(glibc) 관례다. 표는 `spec/tables.json`의 `unicode.displayWidth`가 정본이다.

- **0열**: General_Category Mn/Me/Cf/Cc(U+00AD SOFT HYPHEN 제외)와 조합형 중성·종성 U+1160–U+11FF, U+D7B0–U+D7FF(앞의 초성에 붙는다)
- **2열**: East_Asian_Width W/F. JS RegExp에 EAW 속성이 없어 Python `unicodedata`로 측정한다(`eastAsianWidthVersion`, 현재 16.0.0). Python UCD보다 새 문자도 넓게 잡히도록 엔진의 `\p{Ideographic}`과 `\p{Emoji_Presentation}`(Regional Indicator 제외)을 더한다(표의 `version`, 현재 17.0). 0열이 우선한다.
- **1열**: 그 밖의 전부 — East_Asian_Width A(모호) 포함

grapheme 폭은 코드포인트 폭의 합이다. 단, Extended_Pictographic이나 Regional Indicator로 시작하는 여러 코드포인트로 된 grapheme(ZWJ 시퀀스, 피부색 수식자, 국기 RI 쌍, VS16 `❤️`, 태그 국기)은 이모지 한 개로 **2열**이다 — U+FE0E(텍스트 표현)가 있으면 합 규칙을 따른다(`❤︎` = 1열).

런타임(font-kku.js)은 0열 판정과 Extended_Pictographic을 엔진 RegExp로 하고, 2열 표만 `node scripts/generate_sidecar_tables.js --write`가 `BEGIN/END GENERATED display-width` 표지 사이에 복제한다. 다른 언어 구현 4종은 같은 표 전체를 생성된 복제본으로 가진다.

## 그리기 파이프라인

기존 `TextModel` 세그먼트 트리를 그대로 재사용한다.

```
입력 문자열
  ↓ createTextModel()
TextModel (lines → words → glyphs)
  ↓ internal text renderer
string[2]  (Line 1, Line 2)
```

1. `createTextModel(text)` — 기존 세그먼트 파서 사용
2. 내부 평문 출력기 — 각 글자를 짜임/종성 규칙에 따라 2줄 열로 변환
3. 합자 생성: `composePartialSyllable(cho, jung)` — 유니코드 수식으로 종성 없는 음절 조합

### 합자 공식

초성 인덱스 `L`과 중성 인덱스 `V`로부터 종성 없는 음절을 생성한다:

```
syllable = 0xAC00 + (L × 588) + (V × 28)
```

이 공식은 기존 분해 엔진의 역연산이다.

### grapheme 분절 경계

각 구현은 아래 범위로 입력을 정규화하고 grapheme을 글자 단위로 삼는다. NFC 지원 범위와 Unicode 판은 완전히 같지 않다.

- JavaScript 런타임은 엔진 NFC와 `Intl.Segmenter`를 쓴다. `Intl.Segmenter`가 없는 환경에서는 코드포인트 단위로 나눈다.
- Python/Go/Rust는 같은 표 기반 UAX #29 분절기(GB3–GB999, GB9c Indic conjunct, GB11 emoji ZWJ, GB12/13 RI 쌍)를 공유한다. 표는 `spec/tables.json`의 `unicode`(`node scripts/generate_spec_cases.js --refresh-unicode`가 레퍼런스 엔진의 `Intl.Segmenter`에서 코드포인트마다 측정)를 `scripts/generate_sidecar_tables.js`가 언어별 생성 파일로 복제한 것이다. ZWNJ가 Indic conjunct 결합을 끊는 경계도 테스트한다(`क्‍ष`는 한 글자, `क्‌ष`는 두 글자).
- NFC는 Python이 `unicodedata`로 전체를 적용한다. **Go/Rust는 한글 합성만** 한다(L+V→LV, LV+T→LVT). NFD 라틴 악센트처럼 그 밖의 정준 합성이 필요한 입력은 분해된 채 한 글자가 된다(`e`+U+0301 → `ｅ́`, 브라우저는 `é `). Go/Rust 테스트가 이 결과를 알려진 한계로 고정한다.
- Ruby는 `String#each_grapheme_cluster`(Onigmo `\X`)와 `unicode_normalize(:nfc)`를 쓴다. Ruby가 Unicode 15.1 미만(Ruby 3.3은 15.0)이면 GB9c가 없어 `क्ष`가 두 글자로 나뉘며, Ruby 테스트가 알려진 한계로 고정한다.

### glyph 분류와 Unicode 판

숫자·문장부호 분류는 5개 구현 모두 `spec/tables.json`의 `unicode.number`/`unicode.punctuation` 범위를 사용한다. 명세 Unicode 판은 `spec/capabilities.json`과 함께 검증한다. 실행 언어의 Unicode 데이터가 오래되어도 U+11DE0처럼 명세에 포함된 숫자는 `digit`이고, 명세 밖의 미래 문자는 갱신 전까지 `symbol`이다. 이 정책은 분류를 고정하며, 위 정규화·분절 차이나 앞 절의 터미널 폭 계산 한계를 없애지는 않는다.

**한 코드포인트짜리 완성형 음절만 분해한다.** 음절로 시작하지만 코드포인트가 더 붙은 grapheme(`가`+U+0301, 중세 국어 방점 `한`+U+302E, `각`+U+11A8, `가`+U+11F0)은 분해하지 않고 grapheme 전체를 담는 비한글 글자(`kind: "symbol"` — 여러 코드포인트로 된 grapheme의 공통 분류)가 된다. 평문 모드에서는 위 비한글 칸 규칙을 따른다(`가́` → `가́` / `　`, `한〮`은 4열). NFC가 음절로 합성하는 조합형 자모열(`가`+U+11A8 → `각`, NFD `한글`)은 그대로 분해한다.

## 다른 언어 구현의 HTML 계약과 검증

`renderers/{python,go,rust,ruby}`의 `render_html`은 평문과 논리 분해 표를 공유하고, JS DOM과는 추가로 **생성된 표시 계획과 의미 역할**을 공유한다. `spec/render-plan.json`의 규칙에 따라 생성기가 3개 모음 깊이 × 2개 받침 깊이 × 9개 topology의 자리 배열을 미리 합성한다. 출력기는 head 자리의 유무와 중성·종성 자리 수를 읽어 합자/cluster 표시를 결정한다. 평문 출력은 이 HTML 자리 배열을 적용하지 않고 이 문서의 2줄 규칙을 유지한다.

각 언어는 원문 정규화·분절, 자모 텍스트/합자 생성, HTML escaping·직렬화, CSS 자산 읽기를 맡는다. 선택 source/condition의 지원 어휘는 생성기가 검증하고 `data-fy-role` 및 cluster 역할 값은 생성한다. 새로운 선택 연산은 명세와 언어별 출력기를 함께 확장해야 한다.

정적 HTML에 사용자 CSS를 넣으려면 네 언어의 호출별 `FontDefinition`을 사용한다. 이름·표현 모드·기본 깊이·CSS를 명시하며 system 재료만 지원한다. 이 정의는 HTML 호출에만 적용되고 평문 출력의 폰트 옵션을 추가하지 않는다. 예제와 지원 범위는 [사용자 글꼴 계약](./renderer-contracts.md#호출별-사용자-글꼴)을 따른다.

정본 `spec/html-cases.json`은 실브라우저 직렬화 결과이며 다음을 기계적으로 고정한다. 버전·케이스·노드 수는 이 파일과 검증 명령의 출력이 정본이다.

- 각 자손 노드의 문서 순서상 직계 부모 `parentIndex`(`-1`은 바탕 요소)와 `depth`
- 9개 `data-layout-key` 조합과 배치 토큰 23개 전체
- `glyph`/`glyph-body`의 중성/종성 짜임과 의미 틀(semantic frame)
- 줄/단어/글자/자모/그림 자소 인덱스 `data-*`와 움직임/그림 자소 분기가 쓰는 대응 `--fy-*-index`
- 원래 `font` 입력과 정본 `data-fy-font/profile/size/wrap-unit` 출력
- `sr-source`, `aria-hidden` 관리 루트, 조합형 자모/그림 자소용 자모 속성

정적/런타임 비교는 커밋된 모든 HTML 케이스를 대상으로 한다. 선택 노드의 문서 순서와 `parentIndex`/`depth` 일치, 계산된 `top`/`left`/`font-size`/`transform`, `getBoundingClientRect()`의 x/y/width/height를 함께 검사한다. 길이·행렬 이동·기하는 0.5px, 무차원 행렬 확대/기울임 성분은 0.01까지 허용한다.

릴리스 검증(release verify)은 소스 트리 안에서 import가 성공하는지만 보지 않는다. npm tarball은 임시 사용 프로젝트에 설치해 `require()`, 번들 CSS, 터미널 명령 bin과 정확한 `왕` 출력을 확인하고, Python wheel은 새 venv, Ruby gem은 격리된 `GEM_HOME`, Rust crate는 풀어낸 패키지를 참조하는 외부 crate에서 각각 API/HTML/자산을 스모크 검사한다.

## API

### JavaScript

```js
// 기본 사용
const [line1, line2] = FontKku.renderText("안녕하세요");
console.log(line1);
console.log(line2);

// 구조 확인
const model = FontKku.createTextModel("안녕하세요 반갑습니다");
console.log(model);
```

현재 공개 API는 `FontKku.renderText(text)`다. 설계상 모델 → 평문 단계는 분리돼 있지만, 현재 구현은 별도 공개 API `renderTextMode(model)`를 노출하지 않고 `renderText(text)` 내부에 포함한다.

브라우저 데모는 놀이터(사이트 저장소의 `src/api-studio.html`, 공개판 `https://font.tty.link/api-studio.html`) 한 페이지에서 확인한다. DOM 미리보기, 2줄 평문 출력, TextModel 요약, 예제 입력(개행 포함 / 복합모음 / 단순 인사)과 터미널 명령 예제를 함께 제공한다.

### 터미널 명령

```bash
node ./bin/font-kku-text.js "안녕하세요 반갑습니다"
echo "한글 테스트" | node ./bin/font-kku-text.js
```

터미널 명령 진입점은 [`bin/font-kku-text.js`](../../bin/font-kku-text.js)다. 내부적으로는 `FontKku.renderText()`를 그대로 호출하므로 DOM·평문 모드·터미널 명령이 같은 분해 규칙을 공유한다.

- argv 입력: `node ./bin/font-kku-text.js "안녕하세요 반갑습니다"`
- stdin 입력: `printf "안녕하세요 반갑습니다\n" | node ./bin/font-kku-text.js`
- stdin 경로는 셸이 붙이는 마지막 개행 1개를 자동으로 제거해 예상치 못한 빈 줄 쌍이 생기지 않게 한다.
- 알 수 없는 옵션은 종료 코드 2와 stderr 사용법을 내며, `--` 뒤의 `-leading` 같은 인자는 옵션이 아니라 본문으로 그린다. 두 경로 모두 Node 회귀 테스트에 포함된다.

## 터미널 호환성 고려

### 문자 폭

- **호환 자모** (ㅇ, ㅏ, ㄴ 등 U+3131–U+318E): 대부분 터미널에서 전각 (2열)
- **한글 자모** (ᄋ, ᅡ, ᆫ 등 U+1100–U+11FF): 터미널에 따라 1열 또는 2열로 달라짐
- **완성형 음절** (가, 보, 스 등 U+AC00–U+D7AF): 전각 (2열)

기본 구현은 **호환 자모** (U+3131–U+318E)를 사용한다. 합자는 **완성형 음절** (U+AC00–U+D7AF)을 사용한다. 두 형태 모두 전각이므로 열 정렬이 자연스럽다.

### 열 폭 계산

호환 자모와 완성형 음절 모두 터미널 2열이므로:

- 음절 열 = 2자 × 2열 = **4열**
- 음절 간 공백 = 전각 공백 1자 = **2열**
- 단어 경계 = 원문 공백이 이어진 길이 × 2열 (연속 공백 보존)
- 비한글 글자 = 표시 폭을 짝수로 올린 열 수 (최소 2) — 윗줄은 ASCII 공백으로, 아랫줄은 전각 공백으로 채운다

표시 폭은 wcwidth 관례(코드포인트 폭의 합)를 따르므로 grapheme cluster를 한 칸으로 그리는 터미널(mode 2027 계열)에서는 결합 문자가 붙은 넓은 grapheme(`한〮` 등)이 좁게 보일 수 있다. East_Asian_Width A(모호) 문자를 2열로 그리는 CJK 터미널 설정에서도 차이가 날 수 있다.

## 제한 사항

- 명시적 줄바꿈은 지원한다. 입력에 `\n`이 있으면 각 줄마다 2줄 쌍을 순서대로 출력한다.
- 색상/스타일은 1차 구현에서 제외한다. ANSI 이스케이프 지원은 향후 확장.
- 글꼴 기반 위치 보정은 평문 모드에 해당하지 않는다. 순수 자소 분리만 수행한다.

## Change Log
- 2026-10-17: 놀이터 페이지 경로를 사이트 저장소 `src/`로(ADR-029)
- 2026-10-11: 고정 Unicode 숫자·문장부호 분류, 생성된 HTML 표시 계획·의미 역할, 호출별 `FontDefinition`과 평문/HTML 책임 경계 반영
- 2026-09-27: 비한글 칸 표시 폭 규칙(East_Asian_Width 기반, `spec/tables.json` v1.3 `unicode.displayWidth`) — 좁은 비ASCII가 받침 열을 밀던 문제 수정, 한글 음절 + 뒤 코드포인트 grapheme을 비한글 글자로 그림, Go/Rust 분절 서술을 공유 UAX #29 표 + 한글 전용 NFC로 갱신 (spec text v1.4, html v1.7)
- 2026-07-10: TRK-032 — ASCII로 시작하는 grapheme의 나머지 보존, spec text v1.2/html v1.4와 줄/단어/자모/그림 자소 인덱스 속성 반영
- 2026-07-10: TRK-031 — Python ZWNJ/Indic grapheme 분절, Go/Rust 코드포인트 한계, html-cases v1.3 계층 계약, 글자 인덱스(glyph-index) 기능성 스타일, 기하 일치와 격리 패키지 스모크 반영
- 2026-07-09: TRK-030 — 전각(U+3000) 격자 기준 간격/열 폭 서술 정정, 연속 공백 길이 보존 반영 (spec v1.1 renderText 케이스와 동시 갱신)
- 2026-04-19: `bin/font-kku-text.js` 터미널 명령 진입점 추가, argv/stdin 경로와 마지막 개행 처리 규칙 문서화
- 2026-03-21: 초안 작성
- 2026-03-24: 공개 API 기준으로 문서 정합성 갱신 (`renderText()` 중심)
