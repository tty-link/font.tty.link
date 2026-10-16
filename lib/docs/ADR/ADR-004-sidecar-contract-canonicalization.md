# ADR-004: 사이드카 계약 정본화 — html-cases.json 실브라우저 직렬화 + 전각 그리드 spec

## Status
Accepted

## Date
2026-07-09

## Context
spec 정본이 레퍼런스 구현(font-kku.js)보다 낡아 있었다. 2026-03-25 런타임이 renderText를 전각(U+3000) 그리드로 전환한 뒤 `spec/test-cases.json`이 갱신되지 않아 renderText 케이스 전부가 런타임과 불일치했고, JS 테스트는 spec을 로드하지 않아 모순된 두 테스트가 각각 green이었다(R-02/R-20). `render_html`은 4개 언어가 브라우저 DOM 계약(placement/semantic 속성, host 게이트)을 emit하지 않아 배치 CSS가 하나도 걸리지 않는 static HTML을 만들었다(R-03/R-14).

## Decision
- **spec은 JS 레퍼런스 실측에서 재생성한다.** `scripts/generate_spec_cases.js`가 `spec/test-cases.json`(v1.2, decompose 17/renderText 10/grapheme 2)을, `scripts/generate_html_cases.py`가 `spec/html-cases.json`을 만든다. 손 편집하지 않는다.
- **HTML 계약의 정본은 실브라우저 DOM 직렬화다.** 현재 version, case/node 수와 depth coverage는 `spec/html-cases.json`을 직접 읽는다. 각 case는 `parentIndex`/`depth`, layout/placement와 line/word/glyph/jamo/sprite index surface를 고정한다.
- **기능에 영향을 주는 inline style은 정규화된 map으로 계약에 포함한다.** raw `style` 문자열 대신 `--fy-line/word/glyph/jamo/sprite-jamo-index`를 `styles` map으로 기록하고 대응 `data-*-index` attribute와 함께 검증한다.
- **입력과 정규화 출력의 host 표면을 분리한다.** alias 입력은 `<font-kku font="…">`에 원본을 유지하고, canonical font/profile/size/wrap-unit은 `data-fy-*`에 기록한다. 4개 사이드카는 같은 규칙을 emit한다.
- **JS 레퍼런스와 spec을 lockstep으로 묶는다.** `tests/spec_parity.test.js`가 decompose/renderText 전 케이스와 tables 구조를 런타임 실측과 대조한다.
- 4개 사이드카 `render_html`은 브라우저 DOM 계약 전체(conjoining 자모, `data-fy-pos/role/axis/open/jong-count`, layout-key, `sr-source`, aria-hidden root, host `data-fy-upgraded` 계약)를 emit하고, 각 언어 테스트에 html-cases 계약 검사와 테이블 드리프트 검사(하드코딩==`spec/tables.json`)를 둔다.
- 사이드카는 NFC 정규화 뒤 extended grapheme cluster를 glyph로 쓴다. Python/Go/Rust는 `spec/tables.json` `unicode`(레퍼런스 엔진 `Intl.Segmenter`에서 측정) 표를 `scripts/generate_sidecar_tables.js`가 미러한 공유 표 기반 UAX #29 분절기를 쓰고, Ruby는 Onigmo `\X`를 쓴다. NFC는 Python/Ruby가 전체를, Go/Rust는 한글 합성(L+V→LV, LV+T→LVT)만 적용한다. Rust의 `\p{P}` 분류도 같은 spec 표를 쓴다. text mode 비한글 칸의 표시 폭은 `unicode.displayWidth` 표를 5개 구현이 공유한다(런타임 `font-kku.js`는 2열 표만 생성 표지 블록으로 미러). 결합/spacing mark, emoji modifier/tag, ZWJ, regional-indicator pair, ZWNJ가 Indic virama conjunct 결합을 끊는 경계와 Indic conjunct 연결을 회귀 테스트로 고정한다.
- 시각 수준 패리티는 `tests/static_html_parity.py`로 게이트한다. 문서 순서와 `parentIndex`/`depth` identity를 먼저 맞춘 뒤 computed `top`/`left`/`font-size`/`transform`과 `getBoundingClientRect()`의 x/y/width/height를 비교한다. 길이·translation·geometry는 0.5px, 무차원 matrix scale/shear 성분은 0.01 허용오차를 적용한다.
- CI는 JS-derived spec과 browser-derived HTML spec을 각각 재생성한 뒤 `git diff --exit-code`로 드리프트를 차단하고, canonical Markdown 로컬 링크도 검사한다. npm tarball, Python wheel, Ruby gem, Rust crate는 실제 산출물을 임시 격리 consumer에 설치/연결해 API와 bundled asset을 smoke한다.

## Alternatives Considered
### Alternative A — spec을 손으로 관리하고 구현들이 따라가기
- 설명: 기존 방식 유지 + 리뷰로 드리프트 방지.
- 장점: 도구 불필요.
- 단점: 이미 한 번 실패한 방식이다(3개월 이상 드리프트 미탐지). 정본이 실측과 어긋나면 어느 쪽이 맞는지 판정 기준이 없다.

### Alternative B — 사이드카가 기대 HTML을 문자열 golden으로만 검증
- 설명: html-cases 없이 언어별 golden 파일 유지.
- 장점: 구현 단순.
- 단점: 언어별 golden이 서로 어긋나도 탐지 불가. 브라우저 실렌더와의 연결 고리가 없다.

## Consequences
### Positive
- "정본→구현" 방향의 SSOT가 renderText 포맷·HTML DOM 계약·테이블 세 축 모두에서 기계 검증된다.
- 런타임 계약 변경 시 재생성기 실행 → 4개 언어 테스트 red → 이식 순서의 명시적 워크플로가 생긴다.
- HTML 정본이 9개 layout key/23개 placement token, 기능성 glyph-index style, 직계 부모/깊이 계층을 전부 덮으므로, 평면 노드 순서만 우연히 맞는 false-negative까지 줄인다.

### Negative
- Rust/Go `render_html`이 에러 반환형(`Result` / `(string, error)`)으로 바뀌는 파괴적 API 변경을 수반했다.
- spec 변경 시 4개 언어 + JS를 모두 재검증해야 한다(의도된 비용).

### Risks
- html-cases는 생성 시점의 브라우저 직렬화에 고정된다. 런타임 DOM 계약이나 노드 중첩을 바꾸면 반드시 재생성해야 하며, 재생성 없이 코드만 바꾸면 spec parity가 red가 된다(의도된 안전장치).
- 언어별 잔여 한계(Go/Rust의 한글 밖 정준 합성 미적용 — NFD 라틴 악센트 `e`+U+0301 등, Ruby Unicode 15.1 미만의 GB9c 부재, spec 표와 실행 엔진의 Unicode 판 차이)는 spec 케이스 범위 밖 입력에서 차이를 낼 수 있다. 해당 한계는 코드 문서와 known-gap 테스트에 명시한다.

## Related Documents
- Plan: [multi-language-renderers.md](../PLAN/multi-language-renderers.md)
- Testing: [TESTING.md](../../TESTING.md)
- Review: [docs/REVIEW/2026-07-09-deep-review.md](../REVIEW/2026-07-09-deep-review.md) (R-02, R-03, R-14, R-18, R-20, R-26)

## Change Log
- 2026-09-27: 한글 음절 + 뒤 코드포인트 grapheme(`가`+U+0301, `한`+U+302E, `각`+U+11A8)을 5개 구현 모두 cluster 전체의 비한글(`symbol`) glyph로, 폰트명 trim + ASCII 대소문자 무시(canonical 소문자, 사이드카 미지 폰트는 계속 에러), text mode 비한글 칸의 East_Asian_Width 기반 폭 맞춤(`spec/tables.json` v1.3 `unicode.displayWidth`, 런타임 표지 블록까지 생성 미러). spec text v1.4(좁은 비ASCII·방점·emoji 폭 케이스), html v1.7(`fontInput` 필드, 방점/대소문자 케이스). Decision/Risks의 분절 서술을 공유 UAX #29 표 + Go/Rust 한글 전용 NFC로 정정
- 2026-09-27: 사이드카 spec 미러를 `scripts/generate_sidecar_tables.js`(`--write`/`--check`, `npm test`·verify 게이트) 생성물로 전환(폰트 메타·sprite·depth 포함), `spec/tables.json` v1.2에 `spriteJamo`/`jamoDepth`/`unicode`(엔진 `Intl.Segmenter` 측정 표) 추가, Python/Go/Rust가 표 기반 UAX #29 grapheme 규칙 공유·Go/Rust 한글 NFC 합성, html-cases v1.6(어휘 부재 대조, host `--fy-size`, `--fy-space-count`, `data-empty`, CR, override 행·sprite 칸 커버리지), CR `&#13;`·단일 패스 template 치환·unknown mode 에러, `spec/css` CSS 사본 제거. 잔여 한계는 Go/Rust 비한글 NFC, Ruby GB9c(Unicode 15.1 미만)
- 2026-08-13: 후속 depth 계약 확장을 반영하고 변동 case/node 수는 machine spec을 직접 읽도록 정리
- 2026-07-10: TRK-032 — spec text v1.2/html v1.4(12/131), grapheme-capable case와 line/word/jamo/sprite index 기능성 계약 반영
- 2026-07-10: TRK-031 — html-cases v1.3(11케이스/118노드, parentIndex/depth 계층, 9 layout key/23 token), glyph-index 기능성 style, canonical host 출력, Python ZWNJ/Indic grapheme, geometry parity, 격리 package smoke와 CI drift gate 반영
- 2026-07-09: 최초 작성 (TRK-030)
