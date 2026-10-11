# ADR-010: 파생 글꼴 생성기와 스크립트 한 줄 설치

## Status
Accepted

## Date
2026-10-09

## Context
제품의 매력은 "글꼴로는 안 나오는 한글 제목"인데, 기본 제공 글꼴 4종은 모두 단정한 검정 글자라 일반 웹 글꼴과 구분되지 않았다. 표현이 다른 글꼴을 늘리려면 두 가지 제약이 있다.

- 글꼴 계약 v2(ADR-008 §9)는 모든 규칙을 `:where([data-fy-font="<id>"])` 하나로 묶는다. 글꼴끼리 상속할 수 없어, 새 글꼴은 교정된 자모 배치(sebul 511줄, sprite-system 657줄)를 통째로 가져야 한다. 손으로 복사하면 기반 글꼴을 다시 교정할 때마다 사본이 어긋난다.
- 기반 배치 없이 꾸밈만 선언한 글꼴은 코어 기본 배치로 그려져 자모가 성기게 흩어진다(2026-10-09 실측) — 표현 글꼴도 교정된 배치 위에 얹어야 한다.

동시에 "붙여서 쓰기"가 어려웠다. 페이지는 `font-kku.css`, 글꼴 CSS, 런타임을 따로 연결해야 했고, AI가 만드는 HTML·블로그처럼 붙여 넣는 환경에서는 태그 셋이 부담이었다.

## Decision

### 1. 파생 글꼴 — 기반 배치는 생성, 꾸밈은 손으로
- `spec/fonts.json`의 글꼴 항목에 `derivedFrom: "<기반 글꼴>"`을 두면 파생 글꼴이다. 표현 모드·자모 깊이는 기반과 같아야 하고(배치가 기반의 것이므로) `sidecar: false`다. 파생의 파생은 거부한다.
- `scripts/build_derived_fonts.js --write`가 `profiles/<id>.css`의 `BEGIN/END GENERATED` 구간에 기반 글꼴을 복사한다: 주석과 레이어 순서 선언을 빼고, scope와 `--fy-font-id`를 바꾸고, 그림 자소 기반이면 자소판 주소를 `./<id>.png`로 바꾸고 `--fy-*-dilate`(검정 획 보정)를 뺀다 — 다시 칠한 자소판에 검정 테두리를 칠하기 때문이다. 구간 밖(머리 주석과 꾸밈)은 보존한다. `build_sprite.py`의 생성 구간 관례와 같다.
- 꾸밈은 같은 레이어에서 구간 뒤에 오므로 같은 특이도의 기반 규칙을 이긴다. 같은 레이어의 같은 변수는 누적이 아니라 대체라서, 꾸밈은 기반이 쓰지 않는 변수만 쓴다(예: `malang`은 sebul이 쓰는 `--fy-jamo-dx/dy`·`--fy-ctx-dy` 대신 `--fy-jamo-rotate`·`--fy-ctx-rotate`).
- 그림 자소 파생 글꼴의 자소판은 `scripts/build_material_sheets.py`가 기반 자소판의 알파를 칸마다 독립으로 다시 칠해 만든다(이웃 칸 번짐 없음, (레시피, 행, 열) 시드로 재현 가능). PNG의 tEXt `font-kku-source`에 기반 자소판 해시를 남기고, 생성기의 `--check`가 기반이 바뀐 뒤 다시 만들지 않은 자소판을 거부한다. **2026-10-09 대체**: 자소판은 [ADR-011](./ADR-011-svg-jamo-sheets.md)의 SVG 생성기(`scripts/build_jamo_svg.js`)가 기반과 같은 획·배치로 재료만 바꿔 그리고, 이 생성기는 자소판 주소를 `./<id>.svg`로 바꾼다.
- `npm test`(`tests/asset_sync.test.js`)가 파생 글꼴과 자소판의 신선도를 검사한다. 린트·계약 검사·겹침 감사는 다른 글꼴과 똑같이 받는다.
- 첫 파생 글꼴 8종: `neon`·`sticker`·`malang`(sebul), `retro`·`saekdong`(gothic), `pixel`·`dojang`·`chalk`(sprite-system).

### 2. 겹침 감사는 칠이 아니라 기하를 잰다
겹침 감사(`scripts/glyph_overlap_audit.py`)는 휘도 128 미만을 잉크로 셌기 때문에, 밝은 색 획(노랑·분홍·흰색)은 보이지 않고 입체 그림자는 겹침으로 잡혔다. 측정 페이지에서 system 재료 자모의 칠(`color`·채움·외곽선 색·`text-shadow`)을 검정 단색으로 되돌리고, 파생 그림 자소 글꼴은 페이지 전용 `--fy-sprite-filter: brightness(0)`로 재료 색을 지운다. 획 보정이 있는 기반 그림 자소 글꼴에는 필터를 주지 않는다(보정이 사라진다). 기존 글꼴 4종의 측정값은 바뀌지 않는다(칠을 선언하지 않으므로).

### 3. 스크립트 한 줄 설치
`data-fonts` 속성을 단 classic `<script>`로 `font-kku.js`를 불러오면, 런타임이 스크립트 주소를 기준으로 `font-kku.css`와 `profiles/<이름>.css`를 `loadFont`로 붙인다.

- 이름은 공백·쉼표로 나누고 `font` 속성과 같은 규칙(ASCII 소문자, 별칭 → canonical)으로 정규화한다. 경로처럼 생긴 이름은 버린다. 빈 값이면 기본 CSS만 붙인다.
- CDN 짧은 주소(파일 이름 없는 `/npm/font-kku@0.4.0`)는 패키지 폴더로 보고 그 아래에서 푼다.
- CSS가 모두 도착하거나 실패할 때까지 관리 root를 `visibility: hidden`으로 가려 조립 전 자소가 보이지 않게 하고, 늦어도 3초 뒤에는 드러낸다.
- `document.currentScript`가 없는 ESM import에서는 동작하지 않는다 — 번들러는 CSS를 import한다. `data-fonts`가 없으면 아무것도 하지 않으므로 기존 페이지의 동작은 그대로다.

## Alternatives Considered
### 꾸밈 묶음(skin)을 글꼴과 별개 개념으로
- 설명: `<font-kku font="sebul" skin="neon">`처럼 페이지 CSS 묶음을 따로 둔다.
- 장점: 배치 복사가 없다.
- 단점: 사용자가 배울 개념이 하나 늘고 `font` 하나로 고르는 단순함이 깨진다. 글꼴 작업실·린트·감사가 다루는 단위(글꼴)와도 어긋난다. 같은 방식은 사용자가 페이지 CSS로 이미 쓸 수 있다(AI 설명서 §5의 "나만의 꾸밈 글꼴").

### 계약에 글꼴 상속(`extends`)을 추가
- 설명: 글꼴 CSS가 다른 글꼴의 scope를 함께 받게 한다.
- 장점: 사본이 없다.
- 단점: 런타임·린트·글꼴 작업실의 값 출처 추적이 모두 두 scope를 알아야 하고, 사이드카 계약과 ADR-008 §9의 단일 scope 문법을 다시 열어야 한다. 생성기는 같은 결과를 계약 변경 없이 낸다.

### `font-kku.auto.js` 같은 별도 로더 파일
- 설명: CSS 주입만 하는 진입점을 따로 배포한다.
- 장점: 런타임 본체가 그대로다.
- 단점: 파일이 하나 더 생기고, 로더와 런타임 버전이 어긋날 수 있다. `loadFont`가 이미 있어 본체에 넣는 비용이 작다.

## Consequences
### Positive
- 기반 글꼴을 다시 교정하면 `--write` 한 번으로 파생 글꼴이 따라간다.
- 페이지·블로그·AI 생성 HTML에 태그 한 줄로 붙인다.
- 겹침 감사가 색 있는 글꼴에서도 기하를 잰다.

### Negative
- 파생 글꼴 파일이 기반 배치를 담아 크다(sebul 파생 약 15KB, sprite-system 파생 약 29KB).
- 그림 자소 파생 글꼴은 자소판 PNG를 하나씩 더 갖는다(도트 2KB, 도장·분필 약 100KB).

### Risks
- 그림 자소 파생 글꼴은 기반 자소판의 출처를 물려받는다. (해소 2026-10-09: 기본 제공 자소판은 직접 그린 SVG가 됐다 — [ADR-011](./ADR-011-svg-jamo-sheets.md).)
- 꾸밈이 기반과 같은 변수를 쓰면 기반의 보정을 조용히 대체한다 — 꾸밈을 쓸 때 기반이 쓰는 `--fy-jamo-*`·`--fy-ctx-*`를 확인한다(authoring 안내).

## Related Documents
- ADR: [ADR-008 글꼴 계약 v2](./ADR-008-font-contract-v2.md)
- Architecture: [스타일 글꼴 체계](../ARCHITECTURE/style-profile-system.md), [그림 자소 글꼴](../ARCHITECTURE/image-sprite-fonts.md), [브라우저 런타임 설계](../ARCHITECTURE/browser-runtime-design.md)
- 용어: [용어집](../GLOSSARY.md)

## Change Log
- 2026-10-09: 재료 자소판 생성기(`build_material_sheets.py`)를 ADR-011의 SVG 생성기로 대체 — 파생 자소판은 같은 획을 다른 재료로 그린다
- 2026-10-09: 파생 글꼴 8종, 재료 자소판 생성기, 겹침 감사 칠 중립화, `data-fonts` 한 줄 설치와 함께 Accepted로 기록
