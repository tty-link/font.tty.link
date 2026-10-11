# 다른 언어 구현

> 과거 계획 기록: 구현 순서와 완료 결정을 보존한다. 현재 계약과 검증 상태는
> [`spec/`](../../spec/), [IMPL_STATUS.md](../../IMPL_STATUS.md), [TESTING.md](../../TESTING.md)를 따른다.
> Source: [평문 모드 설계](../ARCHITECTURE/text-mode-design.md), [텍스트 분절 모델](../ARCHITECTURE/text-segmentation-model.md)
> 현재 확장 계약: [언어 공통 렌더 계약과 사용자 글꼴](../ARCHITECTURE/renderer-contracts.md) — capability, 고정 문자 분류, 공통 렌더 계획, 호출별 FontDefinition.
> Status: 구현 완료 / 4개 언어 검증 통과 (2026-07-10, TRK-031) · 다른 언어용 표 사본 생성·grapheme 표 공유 (2026-09-27)

## 목표

font-kku의 한글 자소 분해 + 그리기를 Python, Go, Rust, Ruby 같은 여러 프로그래밍 언어에서 쓸 수 있는 라이브러리(다른 언어 구현)로 제공한다. 각 구현은 입력 텍스트를 받아 HTML 문자열 또는 2줄 평문을 돌려준다.

## 작업 항목

### 1단계: 정본 추출
- [x] (P0) spec/tables.json — font-kku.js에서 테이블 데이터 추출 (TRK-030에서 배치 9개 layout-key + 조합형 자모 병렬 배열 추가)
- [x] (P0) `spec/test-cases.json` — text/decompose/grapheme 계약과 재생성기 `scripts/generate_spec_cases.js`
- [x] (P0) `spec/html-cases.json` — 브라우저가 직렬화한 계층, 짜임/배치, index 속성/style 계약. 버전과 현재 규모는 파일 자체가 정본
  - Track: TRK-015, TRK-030, TRK-031, TRK-032

### 2단계: Python 구현
- [x] (P0) renderers/python/ 패키지 구조 및 분해 엔진
- [x] (P0) render_text() — 2줄 평문 모드
- [x] (P0) render_html() — 정적 HTML 문자열 생성 (TRK-030에서 브라우저 DOM 계약 전체를 출력하도록 갱신)
- [x] (P1) NFC 정규화 + 의존성 없는 extended grapheme 분절 — ZWJ emoji, modifier/tag, 결합/spacing mark, regional-indicator 쌍, Indic virama conjunct를 유지하고 ZWNJ 차단 경계를 분리 (TRK-031)
- [x] (P1) spec/test-cases.json 기반 자동 테스트
  - Track: TRK-016, TRK-031

### 3단계: 추가 언어
- [x] (P2) Go 구현 — `go test ./...` 통과. TRK-030에서 `go:embed` 전환(CWD 의존/오류 삼킴 제거), 모듈 경로를 저장소 경로로 교정(현재 `github.com/tty-link/font-kku/renderers/go`), 알 수 없는 글꼴은 명시적 오류. TRK-031에서 글자 종류(glyph kind)를 JS 계약(ASCII latin / Unicode number / Unicode punctuation)과 동기화
- [x] (P2) Rust 구현 — `cargo test` 통과. TRK-030에서 `soft.css` 잔재 제거로 컴파일 복구, `render_html`이 `Result<String, FontKkuError>` 반환, `cargo publish --dry-run` 통과. TRK-031에서 별칭 원본/정본 바탕 요소 출력과 글자 인덱스(glyph-index)·짜임 계약 동기화
- [x] (P2) Ruby 구현 — `ruby -I lib test/test_spec.rb` 통과. TRK-030에서 soft 테스트 제거, 알 수 없는 글꼴은 `ArgumentError`, JS와 바이트 단위 render_text 교차검증

## 완료 기준

- spec/tables.json이 font-kku.js의 모든 테이블을 포함한다 — 충족 (자소판 표·깊이 어휘·Unicode grapheme 표 포함. 언어별 사본은 `scripts/generate_sidecar_tables.js`가 생성하고 `--check`와 각 언어의 spec 대조 테스트가 어긋남을 막는다)
- Python 구현이 spec/test-cases.json의 모든 케이스를 통과한다 — 충족
- 4개 `render_html`이 현재 `spec/html-cases.json`의 DOM 계층/속성/index style 계약을 통과한다 — 충족
- 정적 HTML과 런타임의 계층·computed style·위치와 크기가 커밋된 모든 HTML 케이스에서 분리 허용오차를 통과한다 — 충족
- 실제 배포 산출물을 소비자와 격리해 검증한다 — 충족 (npm tarball 설치 + 터미널 명령, Python wheel 새 venv, Ruby gem 격리 `GEM_HOME`, Rust crate 외부 소비자)

## Current Verification State

공식 현재 상태는 루트 [TESTING.md](../../TESTING.md)의 `npm run verify`로 재현한다. 이
명령은 언어별 테스트, 정적 HTML 일치 검사, 생성물·패키지 소비자 검증을 한 번에 실행하며
성공한 로컬 검증과 원격 CI 상태를 구분한다. 개별 구현만 좁혀 확인할 때는 다음을 쓴다.

- Python: `. .venv/bin/activate && python -m pytest renderers/python/tests`
- Go: `(cd renderers/go && go test ./...)`
- Rust: `(cd renderers/rust && cargo test)`
- Ruby: `(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { |file| require_relative file }')`
- 정적 허용오차 단위 테스트: `. .venv/bin/activate && python -m pytest tests/test_static_html_parity.py -q`
- 정적 HTML 일치 검사: `. .venv/bin/activate && python tests/static_html_parity.py`

과거 `soft.css` 걸림돌은 TRK-030에서 해소됐다. `render_html`은 계층·배치/의미 정보·줄/단어/글자/자소/그림 자소 인덱스·접근성·정본 바탕 요소 계약을 출력한다. `tests/static_html_parity.py`는 식별 계층, computed style과 실제 위치·크기를 비교한다. 버전은 4개 패키지 모두 0.4.0이고 CI에는 언어별 job, spec 어긋남 검사, 문서 링크 검사와 격리 패키지 스모크 검사가 구성돼 있다.

다른 언어 구현용 spec 사본(자모·배치·덮어쓰기·그림 자소·깊이·글꼴 메타·Unicode 표)은 손으로 복사하지 않고 `node scripts/generate_sidecar_tables.js --write`로 생성한다. Python/Go/Rust는 같은 표 기반 UAX #29 grapheme 규칙을 공유하고, 표는 기준 엔진의 `Intl.Segmenter`에서 측정한다(`spec/tables.json` `unicode`).

문서화된 잔여 한계 (후속 큐 [TODO_LIST.md](../../TODO_LIST.md) 참조, 각 언어 테스트가 알려진 한계로 고정):

- Go/Rust는 한글 NFC 합성만 한다. NFD 라틴 악센트 등 그 밖의 정준 합성은 적용하지 않는다 (NFC 입력이면 차이 없음)
- Ruby는 Onigmo `\X`를 쓰므로 Unicode 15.1 미만 Ruby에서는 GB9c가 없어 Devanagari virama conjunct(`क्ष`)가 나뉜다
- 글꼴 이름 대소문자 규칙은 언어마다 다르다(런타임 결정 대기 중): Python/Go/Ruby는 소문자화, Rust는 별칭만 대소문자 무시

빈 글꼴 이름→`sebul` 기본값은 한계가 아니라 JS 기준 구현(`normalizeFontName`)과 4개 구현 공통의 정상 계약이다. Python·Ruby는 이를 회귀 테스트로 고정하고 있다 (2026-07-10 정합성 검토 DS-02로 재분류).
