# ADR-027: 정적 렌더러의 원소 재료 — 기본 배치의 원소 획을 표로 굽는다

## Status
Accepted

## Date
2026-10-12

## Context

- **사용자에게 보이는 틈:** 네 언어 정적 렌더러(Python·Go·Rust·Ruby `render_html`)는 글꼴을 밝히지 않은 호출을 기본 배치
  `sebul-fixed-v1`(세벌 고정, [ADR-026](ADR-026-sebul-fixed-layout.md))로 그리지만, 자모는 기기 글꼴 글자를 도장 자리에 놓았다.
  읽는 기기의 한글 글꼴이 Apple SD 산돌고딕 Neo와 비슷할 때만 맞는다 — 기기 글꼴을 AppleMyungjo로 바꿔 끼우면 글·꽃·밭·읽의 자모가
  부딪힌다. 같은 바탕 요소를 브라우저 런타임은 기기와 무관한 원소 획(`[part="hoek"] > [part="element"]`,
  [ADR-024](ADR-024-hangul-principle-rendering.md))으로 그린다(sebul `--fy-font-face: element`).
- **막힌 줄 알았던 것:** [ADR-025](ADR-025-hangul-composition-design.md) §11은 굵기 되돌림(`balanceElementStrokes`)이 계산된 변환을
  재므로 원소 획에 브라우저가 필요하고, 네 언어 이식은 해석기를 옮겨 같은 해석 사례(`spec/resolver-cases.json`)를 통과하는 것이
  조건이라고 적었다. 그러나 세벌 고정에서는 코어 CSS가 자모 노드의 변환을 도장 배율 하나(`scale(--fy-stamp-scale-x, --fy-stamp-scale-y)`,
  회전·자모·문맥 배율 없음)로 두고 글자 크기를 `--fy-stamp-size`로 둔다. 그래서 획 자리와 되돌림(`--fy-el-k`·`kd`·`kx`·`ky` = 1/배율)이
  도장 표만으로 정해진다. 낱자(호환 자모 51)는 변환이 없다.
- **확인(사전 탐침):** 런타임 기본 바탕 요소가 (도장 역할, 자모, 합자 조각) 열쇠마다 넣는 원소 마크업은 5,029음절(노드 16,221)에서
  하나도 바뀌지 않았다 — 열쇠 125개(초성 19 · 홑 중성 14 · 합자 중성 조각 14 · 종성 27 · 낱자 51). 100줄 남짓한 순수 계산으로
  11·16·37·64·100px에서 125/125 바이트 동일, 24px만 낱자 ㅉ `--fy-el-len` 하나가 0.2626 대 0.2625(바탕 요소 크기에 따른 브라우저
  실수 잡음)였다.
- **해석기 이식은 값이 작다:** 디자인 없는 원소 경로에서 `planRequest`는 `oneByOne(null)`(뼈대 획마다 CSS 상자 하나)로 접힌다.
  디자인·그림 세트 해석기(약 800줄, 실험 표시, 하루에도 여러 번 바뀜)를 네 언어로 옮겨도 정적 출력은 그대로이고, Rust는 런타임
  의존성이 없어 디자인 JSON을 직접 파싱해야 한다.

## Decision

### 1. 글꼴을 밝히지 않은 호출은 원소 획이 기본

- **판정은 ADR-026과 같다.** font가 없거나 빈 문자열이고 `FontDefinition`이 없는 호출만 원소 재료다. 공백뿐인 이름·`default`·`sebul`·
  그 밖의 이름과 모든 `FontDefinition`은 기기 글꼴 글자 그대로다(출력 바이트 동일).
- **옵션 하나:** Python `face=`, Ruby `face:`, Go `WithFace`, Rust `HtmlOptions.face`. 값은 정확히 일치해야 한다(대소문자·공백 그대로).

  | 값 | 글꼴을 밝히지 않은 호출 | 글꼴을 밝힌 호출·`FontDefinition` |
  |---|---|---|
  | 없음(Python `None`, Ruby `nil`)·`""` | 원소 | 기기 글꼴 |
  | `"element"` | 원소 | 오류 — 조용히 기기 글꼴로 내리지 않는다 |
  | `"device"` | 기기 글꼴(원소 층만 뺀 출력 = 이 변경 전과 바이트 동일) | 기기 글꼴(옵션 없음과 같음) |
  | 그 밖 | 오류 | 오류 |

- **오류 차례는 네 언어 공통:** mode → 글꼴 이름·정의 → face → 깊이. 모르는 글꼴에 `face="element"`를 주면 "모르는 글꼴"이다.
  Python `ValueError`, Ruby `ArgumentError`(기호 `:element`도), Go `fontkku: face "element" needs the default layout …`·
  `fontkku: unknown face …`, Rust `FontKkuError::UnknownOption { name: "face (element needs the default layout)" | "face" }`
  (새 오류 종류는 없다).
- **0.1.1에 든다.** 0.1.1은 아직 공개 전이고 이미 사이드카 기본을 세벌 고정으로 바꾼다. 같은 공개에서 기본 그림까지 런타임과 맞춘다.

### 2. 원소 획 표 — 생성기가 굽고, 렌더러는 붙이기만

- `scripts/generate_sidecar_tables.js`의 `compileElements()`가 뼈대(`spec/jamo-skeletons.json`)·표준 잉크 상자(`spec/jamo-ink-boxes.json`)·
  획순(`spec/strokes.json`의 `hoekStrokes`)·컴파일된 `sebul-fixed-v1` 도장·`profiles/sebul.css`의 `--fy-font-element-width`로 노드를 짠다.
  셈은 옮겨 적지 않고 런타임 함수를 빌린다: `font-kku.js`의 최상위 선언(`balanceElementNode`·`elementAxes`·`placeElement`·`appendStroke`·
  `densityLines`·`strokeDensity`·`dotSpan`·`dotOpening`·`dotShifts`·`remapUnit`·`hoekRow` 등)을 이름으로 꺼내(`element_edition.js`의
  나누기) 새 vm 문맥에서 돌리고, 그 함수가 닿는 DOM(style의 CSSOM 선언 차례, `[part="element"]`·칠 그림 찾기)만 흉내 낸다. 세벌 고정에서
  `w = 0.1 / 도장 크기`, `m = [sx, 0, 0, sy]`, 도장의 `--fy-stamp-density`, 낱자는 `m = 단위`, `w = 0.1`, 도장 없음(밀도는 런타임 셈)이다.
  그래서 밀도 굵기 계수의 굵기로 놓은 자리와 ㅎ·ㅊ 꼭지 틈(ADR-024 §3)이 런타임과 같은 코드로 표에 온다.
- 네 언어 미러 상수 여섯: `ELEMENT_LAYOUT`(`"sebul-fixed-v1"`), `ELEMENT_FACE_WIDTH`(`"0.865em"`), `ELEMENT_LINE_PROPS`(8),
  `ELEMENT_RING_PROPS`(6), `ELEMENT_DENSITY`(노드가 `--fy-face-width` 뒤에 적는 `--fy-el-density` — 지금은 낱자 ㄻ·ㄼ·ㄾ·ㄿ·ㅃ 0.75,
  ㅞ 0.9571), `ELEMENT_NODES`(열쇠 125개 → 획 → 마디). 어느 언어도 실수를 서식하지 않는다(ADR-026 도장과 같은 방식).
  원소 층은 기본 배치가 `ELEMENT_LAYOUT`일 때만 낸다.
- 가드(생성 거부): 기본 배치가 세벌 고정·자리 변주 없음·초성 그림 문맥 고정, sebul CSS가 원소 재료·standard 잉크 상자·끝 square,
  상자가 1/1000em 격자, 뼈대 획 수 = 획순 행 수 = 런타임 `HOEK_TABLE` 행, 열쇠 125개. 갈라짐 가드: 빌린 선언이 목록 밖 최상위 이름을
  부르면(새 도우미), 흉내 내지 않은 선택자로 DOM을 찾으면, 노드가 `--fy-face-width` 뒤에 `--fy-el-density` 말고 다른 변수를 적으면,
  도장 67개의 밀도(`measure_layout_stamps.py`의 파이썬 사본 `stroke_density`가 셈)가 런타임 `strokeDensity`와 다르면 실패한다.
- 런타임 정답 `spec/element-layer.json` 1.1을 `scripts/record_element_layer.py --write`가 헤드리스 Chromium 64px로 잰다(3,074노드,
  같은 열쇠는 같은 값인지 검사). 획과 노드 밀도(`density`, 열쇠 → `--fy-el-density`)를 적는다. 숫자 허용 차 1e-4.

### 3. 마크업 계약 (런타임 바탕 요소와 같다)

- **host:** `data-fy-layout-model="fixed-three"` 바로 뒤, `data-fy-font` 앞에 `data-fy-face="element"` — 한글이 없는 글에도 쓴다.
  `data-fy-element-cap`은 쓰지 않는다(sebul 끝은 square).
- **도장 붙은 초·중·종성 노드:** 속성은 그대로, 인라인 style 끝에 `--fy-face-width:0.865em`(`ELEMENT_DENSITY`에 열쇠가 있으면 그 뒤
  `--fy-el-density` — 도장 노드는 지금 없다, 밀도는 도장의 `--fy-stamp-density`를 코어 CSS가 받는다). 안쪽은 escape한 노드 글자 뒤에
  빈칸 없이 획. 열쇠는 도장 역할 + 자모(`initial:`·`medial:`·`final:` + `data-jamo`), 합자 모음 조각은
  `medial:<음절의 합자 모음>#<조각>`(0 = ㅗ·ㅜ·ㅡ 조각, 1 = 오른쪽) — 도장 찾기와 같은 짝이다. 세벌 고정의 받침은 언제나 통짜다.
- **획:** `<span part="hoek" data-hoek data-hoek-kind data-hoek-from data-hoek-letter data-hoek-role>` 안에 마디마다 빈
  `<span part="element" data-element="line|ring" style="…">`. 변수는 `ELEMENT_LINE_PROPS`·`ELEMENT_RING_PROPS` 차례, `;`로 잇고
  빈칸·끝 `;` 없음. 속성 escape는 평소 것(`data-hoek-from`에 `·`가 올 수 있다).
- **낱자:** 원문이 정확히 한 코드 포인트 U+3131–U+3163인 비음절 글자는 content만 바뀐다 —
  `<span part="content" data-fy-standalone="ㅋ" style="--fy-face-width:0.865em">ㅋ{획}</span>`. 런타임 굵기 보정이 밀도 굵기 계수를
  노드에 적는 낱자는 그 뒤에 이어 쓴다(`style="--fy-face-width:0.865em;--fy-el-density:0.75"`, ㄻ). glyph 겉 요소는 그대로다.
- textContent·`sr-source`·접근성은 그대로다(획 span이 비어 있다). `spec/html-cases.json`은 1.9 그대로다 — 화이트리스트에
  `data-fy-face`·`data-fy-standalone`·`--fy-face-width`가 없고, 네 언어 파서는 `[part="hoek"]` 하위 트리를 건너뛴다(생성기와 같다).
- CSS·자산·런타임은 바뀌지 않는다. 번들한 코어 CSS에 원소 재료 규칙이 이미 있다.

### 4. 시험

| 층 | 무엇 |
|---|---|
| 표 ↔ 정답 | `tests/element_table.test.js`(npm test): 열쇠 구성·차례, 런타임 표본 값, `spec/element-layer.json`과 값 3,788개·노드 밀도 6개, 갈라짐 가드(런타임 셈을 바꾸면 도장 대조가 실패, 꼭지 틈을 끄면 ㅎ·ㅊ 열쇠 10개가 따라 바뀜, 새 도우미·새 선택자는 실패) |
| 정답 ↔ 런타임 | `record_element_layer.py --check`(verify "Element layer oracle") |
| 언어 ↔ 정답 | 네 언어 시험: 열쇠마다 탐침 글(X+ㅏ, ㅇ+V, ㅇ+합자, 가+T, 낱자 그 자체)로 그려 125/125 대조, 원소 − 층 = `"device"`(조각·정적), 밝힌 글꼴 불변, 오류. 합자 조각 열쇠는 지금 홑 모음 값과 같아 정답 대조로 틀린 열쇠를 못 잡는다 — 언어마다 열쇠별로 다른 가짜 표·열쇠 문법 시험을 둔다 |
| 좌표 | `tests/static_html_parity.py`: 글꼴을 밝히지 않은 사례는 `[part=hoek]`·`[part=element]`도 노드로 모으고 host `data-fy-face`·`data-fy-standalone`·`--fy-face-width`·획 `data-hoek*`·`data-element`를 정체에, 마디 변수(--fy-el-*)와 노드의 `--fy-face-width`부터 끝(`--fy-el-density`)까지는 1e-4 안 |
| 화소 | 스모크 `test_sidecar_element_face_without_js[24·64]`(JS 끈 정적 출력 = 런타임, `"device"` ≠ 런타임), `test_sidecar_element_face_is_device_independent`(기기 글꼴을 바꿔 끼워도 원소 출력은 같고 `"device"`는 달라짐, 다른 한글 글꼴이 없으면 건너뜀) |
| 꾸러미 | verify 패키지 스모크(wheel·gem·crate): 기본 조각에 `data-fy-face="element"`·`part="hoek"`, `"device"`·밝힌 글꼴에는 없음 |

## Alternatives Considered

### A. 해석기 전체 이식 (ADR-025 §11 글자 그대로)
- 설명: `normalizeDesign`·`registerDesign`·`registerJamo`(상자 세트)·`planJamo`/`planRequest`·`stagePreview`를 네 언어로 옮기고
  해석 사례 실행기와 SVG·원소 방출까지.
- 장점: 디자인을 아는 정적 내보내기, 언어마다 해석 사례 실행.
- 단점: 2,500–3,500줄 + 실행기, 실험 API를 계속 따라 고쳐야 한다(같은 날 두 작업 갈래가 고치는 중). Rust JSON 파서, `stableJson`·`fnv1a`
  revision의 UTF-16·JS 수 서식 흉내. 글꼴을 밝힌 문맥 배치(`:has()` 계단식)와 글꼴 소스(글리프 측정)는 서버가 못 한다. 방출 없이는
  출력이 그대로다. 쓰는 곳이 없다.

### B. 해석 사례 실행기만(planJamo 수준)
- 설명: DOM·좌표 없이 계획 절반만 옮겨 노드 해석 사례 34건을 언어마다 돈다.
- 장점: 해석기가 옮길 수 있다는 증명.
- 단점: 1,500줄 이상, A의 변동·Rust 문제 그대로, 정적 출력은 그대로다.

### D. 사이드카는 그대로, `build_static_primitive.py`를 넓히기
- 설명: 헤드리스 도구에 `--design`·`--jamo-set`을 더한다.
- 장점: 40줄 남짓, 디자인·그림 세트·글꼴을 밝힌 배치까지 정확(실제 런타임).
- 단점: 저장소·Playwright·Chromium이 필요하고 pip·gem·crate·Go 서버나 요청 시점에 못 쓴다. 사이드카 출력의 기기 의존은 그대로다.
  (독립 P3 항목으로 남는다.)

### 옵트인(`face="element"`만)
- 설명: 기본은 기기 글꼴, 원하는 호출만 원소.
- 단점: 0.1.1이 이미 사이드카 기본을 바꾸므로 기본 그림만 런타임과 다르게 둘 까닭이 없다. 결정: 기본 원소 + `"device"` 끄기.

## Consequences

### Positive
- `render_html(text)`이 네 언어 모두 브라우저·JS 없이 런타임 기본과 같은 원소 획을 그린다 — 읽는 기기의 한글 글꼴과 무관하다.
  JS 끈 정적 문서가 런타임과 24·64px에서 화소까지 같고, 기기 글꼴을 AppleMyungjo로 바꿔도 화소가 같다.
- 네 언어 출력이 서로 같다: 같은 입력 70호출(html-cases 입력·낱자 51·음절 13개 걸러 표본·경계 글)에서 속성을 정렬한 DOM이
  넷 모두 같고 획 묶음 원문 3,403개가 바이트까지 같다. face·글꼴·정의 조합 63행의 성공·오류 종류도 같다.
- 실험 디자인 API와 무관하다. 해석 사례 D-PRIMITIVE-GATED(디자인 없는 원소 경로)를 구성으로 만족한다.

### Negative
- **사이드카 기본 출력이 더 바뀐다**(0.1.0 → 0.1.1, 같은 공개). host `data-fy-face`, 도장 노드 style 끝 `--fy-face-width`와 획 자식,
  낱자 content가 붙는다. 자모 노드의 글꼴을 다시 꾸미던 호출자는 `face="device"`로 이전 출력을 바이트 그대로 얻는다.
- 출력이 커진다: Python 조각 "한글 ㅋ A" 5,728 → 11,056 B(약 2–2.4배), 11,172음절 전체 27 MB → 65.5 MB(Ruby 27.7 → 67.2 MB),
  그 렌더 시간 Python 0.47 → 0.57 s. 미러는 Python +62KB·Go +69KB·Rust +101KB·Ruby +72KB.
- Rust `HtmlOptions`에 `pub face`가 생겨 `..Default::default()` 없이 모든 필드를 적은 구조체 리터럴은 컴파일되지 않는다(0.x).
- 기본 배치뿐이다. 글꼴을 밝힌 호출(글꼴 CSS의 문맥 배치)과 `FontDefinition`은 기기 글꼴 글자 그대로다 — slot 변환이 글꼴
  CSS의 `:has()` 계단식에서 와 서버가 계산할 수 없다. 그 길은 `scripts/build_static_primitive.py`다.

### Risks
- 페이지 단위 덮어쓰기(`--fy-element-width`, `--fy-scale-x/y`, `--fy-rotate`)는 런타임이 굵기를 다시 맞추지만 정적 출력은 표의 값
  그대로라 획이 잉크 상자에서 조금 벗어날 수 있다. 계약에 적고 약속하지 않는다.
- 뼈대·잉크 상자·도장·원소 폭·원소 수식이 바뀌면 표가 낡는다 — `generate_sidecar_tables.js --check`, `record_element_layer.py --check`,
  `npm test`의 정답 대조, 정적 패리티·화소 스모크가 잡는다. 바꾸면 표와 정답을 함께 다시 만든다.
- 바탕 요소 크기에 따른 브라우저 실수 잡음(±0.0001em)으로 런타임과 모든 크기에서 바이트가 같을 수는 없다. 런타임 대조는 수 허용 차로 한다.

## Related Documents
- Architecture: [언어 공통 렌더 계약 §기본 배치](../ARCHITECTURE/renderer-contracts.md#기본-배치세벌식)
- Plan: [한글 조립 디자인 리팩토링 계획](../PLAN/hangul-composition-refactor.md) F
- ADR: [ADR-026](ADR-026-sebul-fixed-layout.md)(세벌 고정·도장), [ADR-025](ADR-025-hangul-composition-design.md) §11(정적 출력),
  [ADR-024](ADR-024-hangul-principle-rendering.md)(원소 재료), [ADR-023](ADR-023-device-face-fit.md)(표준 잉크 상자), [ADR-022](ADR-022-npm-name-and-versioning.md)(버전)
- Spec: [element-layer.json](../../spec/element-layer.json), [capabilities.json](../../spec/capabilities.json)

## Change Log
- 2026-10-14: ADR-028 — 기본 배치가 세벌식(짜임 고정)이라 원소 획 표 열쇠에 고른 짜임 열쇠 `|<열쇠>`가 붙는다(283개 — 도장 232와 낱자 51).
  표를 굽는 틀(런타임 함수 빌리기, 정답 대조)은 그대로다. 초성 그림 문맥은 짜임의 모음 모양(세로 `@cho`, 가로·합자 `@bar`), 받침은 `@sebeol`
- 2026-10-12: 통합 — 갈래 따로 만든 밀도 굵기 계수·ㅎ·ㅊ 꼭지 틈(ADR-024 §3)을 표에 싣는다. 표와 정답이 그 전 런타임에서 만들어져 도장 밀도가
  1보다 작은 노드와 꼭지 틈 노드의 획 자리가 런타임과 달랐고(열쇠 32개 — 도장 22·낱자 10, 값 533개, 최대 0.0604em·5.92°), 낱자
  ㄻ·ㄼ·ㄾ·ㄿ·ㅃ·ㅞ의 노드 끝 `--fy-el-density`가 없었다. 생성기가 셈을 옮겨 적던 것을 런타임 함수 빌리기로 바꾸고(per-node 본문을 `balanceElementNode`로 떼어 냄 —
  런타임 동작은 같다), 미러 상수 `ELEMENT_DENSITY`, 정답 1.1(`density`), html-cases 낱자 사례 하나(ㄻ ㅃ ㅞ ㅎ ㅊ), 정적 패리티의 노드 끝
  변수 대조를 더했다. 네 언어 `--fy-stamp-density` 없는 옛 마크업 문자열 시험(Python·Go·Rust)을 고쳤다
- 2026-10-12: Accepted(사용자 승인 "모두 진행") — 네 언어 face 옵션과 원소 방출, 오류 차례 통일(mode → 글꼴 → face → 깊이), 정적 패리티에
  원소 노드, 화소·기기 독립 스모크, 패키지 스모크, 계약 문서. 0.1.1에 든다
- 2026-10-12: Proposed — 사전 탐침(열쇠 125개 불변, 계산 재현), 해석기 이식 대신 기본 배치의 원소 획 표(선택지 C). 생성기 표(WP1)·런타임 정답(WP2)
