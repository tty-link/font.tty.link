# ADR-001: 자산 정본-사본 동기화 전략 (sync_assets + --check 게이트)

## Status
Accepted

## Date
2026-07-09

## Context
`font-kku.css`, `profiles/sebul.css`, `profiles/gothic.css`와 static HTML template이 spec(`spec/css/`)과 4개 사이드카 renderer assets(`renderers/{python,go,rust,ruby}`)에 사본으로 존재한다. 수동 복사로 관리하던 기간에 실제 드리프트가 여러 번 발생했다(2026-07-09 심층 리뷰 R-07/R-19/R-24/R-30/R-33: font-kku.css 사본 5벌이 구버전, `spec/css/gothic.css` 커밋 누락, 삭제된 `soft.css`의 유령 매핑으로 Rust 컴파일 실패). "같은 spec을 공유한다"는 제품 주장이 CSS 층에서 깨져 있었다.

## Decision
- 정본은 루트다: `font-kku.css`, `profiles/sebul.css`, `profiles/gothic.css`. static HTML template의 정본은 `spec/css/template.html`.
- `scripts/sync_assets.py`가 정본→사본 복사의 유일한 실행 경로다.
  `spec/asset-mappings.json`이 매핑의 유일한 선언부이며, 스크립트와 Node 회귀가
  이를 함께 읽는다. 사본을 손으로 편집하지 않는다.
- 드리프트는 이중 게이트로 잡는다: `python scripts/sync_assets.py --check`(드리프트 시 exit 1, CI core job에 포함)와 `tests/asset_sync.test.js`(사본 바이트 동일성). sprite 시트 표 vs `spec/tables.json` 드리프트는 `tests/font_studio_model.test.js`가 잡는다.
- 정본 CSS 변경 커밋은 `sync_assets.py` 실행 결과(사본 갱신)를 함께 포함한다.

## Alternatives Considered
### Alternative A — spec/css를 정본으로 삼고 루트를 파생
- 설명: 렌더러가 참조하는 spec 폴더를 원본으로 승격.
- 장점: "spec이 정본"이라는 서술과 표면적으로 일치.
- 단점: 실제 authoring/튜닝은 루트와 데모에서 일어나므로 편집 지점과 정본이 어긋난다. 브라우저 코어가 primary surface라는 제품 경계와도 상충.

### Alternative B — 사본 제거(빌드 시 참조 또는 @import)
- 설명: 렌더러가 저장소 루트를 상대경로로 읽거나 패키징 시점에 주입.
- 장점: 사본 자체가 없어 드리프트 원천 차단.
- 단점: 각 언어 패키지가 독립 설치본으로 동작해야 하므로(assets 동봉 필요) 저장소 밖에서는 성립하지 않는다. Go go:embed, Rust include_str! 모두 파일이 패키지 안에 있어야 한다.

## Consequences
### Positive
- 사본 드리프트가 커밋 전(로컬 테스트)과 커밋 후(CI) 모두에서 기계적으로 잡힌다.
- 렌더러 static HTML이 브라우저 코어와 같은 CSS를 인라인함이 보장된다.

### Negative
- 정본 CSS 변경 시 사본 갱신 커밋 노이즈가 생긴다(파일 15+4곳).

### Risks
- mapping schema version을 바꿀 때 Python loader와 Node 회귀의 지원 버전을 함께
  갱신해야 한다. 값 자체는 JSON 한 곳에만 존재하므로 대상 목록의 이중 기록은 없다.

## Related Documents
- Architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- Testing: [TESTING.md](../../TESTING.md)
- Review: [docs/REVIEW/2026-07-09-deep-review.md](../REVIEW/2026-07-09-deep-review.md) (R-07, R-19, R-24, R-30, R-33)

## Change Log
- 2026-09-27: `spec/css/*.css` 사본 3종 제거(Rust 테스트 fixture로만 쓰였다 — 이제 `renderers/rust/assets`를 읽는다). static HTML template 정본 `spec/css/template.html`은 유지. 사본은 사이드카 assets 4벌
- 2026-09-25: Sprite Editor PoC 제거 — sprite 상수 드리프트 검사 대상을 Font Studio 시트 모델(`tests/font_studio_model.test.js`)로 옮김
- 2026-08-07: 매핑 선언을 `spec/asset-mappings.json` v1.0 단일 소스로 이동
- 2026-07-09: 최초 작성 (TRK-030)
