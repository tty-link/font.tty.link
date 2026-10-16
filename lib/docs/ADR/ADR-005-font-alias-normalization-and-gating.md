# ADR-005: font alias의 JS 정규화 이관과 프로필 게이팅 단일화

## Status
Accepted

## Date
2026-07-09

## Context
deprecated alias(`default`/`classic`→`sebul`, `gothic2`→`gothic`)를 CSS 셀렉터 나열로 처리한 탓에 `sebul.css`는 12개 variant짜리 `:where()` 리스트를 rule 블록마다 반복했고(R-40), 프로필 host-gating 관례가 sebul/gothic(4계열 alias 나열)과 sprite-example/sprite-editor 생성물(2계열) 사이에서 갈라져 `<font-kku profile="sprite-example">`은 스타일과 expression-mode가 모두 깨졌다(R-10). 초기 개선은 정규화된 값을 `data-font`/`data-profile`에 되기록했지만, decorator에서는 그 두 속성이 authored 입력이기도 해 JS 1회 옵션과 alias 원문을 영구화하는 새 충돌이 생겼다(F-02/F-03).

## Decision
- **alias 정규화는 런타임(JS)의 책임이다.** `font-kku.js`의 `FONT_ALIASES` 테이블(`default`/`classic`→`sebul`, `gothic2`→`gothic`)이 해석 시점에 정규화하고, host의 canonical `data-fy-font`/`data-fy-profile`에는 정규화된 이름만 기록한다. 사용자가 쓴 원본 attribute(`font="default"`, decorator의 `data-font="default"` 등)는 건드리지 않는다.
- **프로필 게이팅은 `:where([data-fy-font="X"])` 단일 관례로 축약한다.** 런타임이 upgrade 시 모든 host 형태에 canonical resolved font를 stamping하므로 custom element/decorator와 font/profile 입력이 한 출력 key로 매칭된다. sebul/gothic/sprite-example과 build_sprite.py 생성 CSS, Font Studio 새 sprite 폰트 템플릿 모두 같은 관례를 쓴다.
- custom element의 기존 `data-font`/`data-profile` normalized mirror는 호환 표면으로 유지하지만 CSS 게이팅 정본으로 쓰지 않는다. decorator에서는 같은 이름이 authored 입력이므로 두 profile이 동시에 매칭될 수 있기 때문이다.
- deprecated alias CSS 파일(`default.css`/`classic.css`/`gothic2.css`)은 `@import` 하위 호환 수단으로 유지한다.

## Alternatives Considered
### Alternative A — CSS 셀렉터에 alias 계열을 계속 나열
- 설명: 기존 방식 유지, 새 폰트도 4계열+alias 나열.
- 장점: 런타임 무변경.
- 단점: rule마다 12중 셀렉터 복붙, alias 추가 시 전 rule 수정, 생성 도구와의 관례 분열이 그대로 남는다.

### Alternative B — attr 셀렉터(font-kku[font=...]) 계열까지 나열 유지
- 설명: upgrade 전(FOUC) 구간도 CSS로 커버.
- 장점: JS 로드 전에도 host-level 변수가 걸린다.
- 단점: 자소 배치 자체가 JS 렌더 산출물이라 upgrade 전 CSS 매칭의 실익이 없다. 관례가 다시 이원화된다.

## Consequences
### Positive
- `sebul.css`의 12중 셀렉터 5회 반복이 제거되고, 새 폰트/생성 CSS가 한 가지 게이팅 형태만 따른다.
- `<font-kku profile="...">`, deprecated alias 이름 모두 정규화 경로를 타므로 어떤 진입 형태로도 프로필 CSS와 expression-mode가 일관되게 적용된다.
- decorator authored alias와 JS 1회 font override가 공존해도 `data-fy-font` 하나만 매칭되므로 서로 다른 profile rule이 동시에 활성화되지 않는다.

### Negative
- upgrade 전(JS 미로드/미실행) 구간에는 프로필 host 변수가 매칭되지 않는다 — 자소 배치가 어차피 JS 산출물이므로 실질 영향 없음.

### Risks
- 새 alias는 CSS가 아니라 `FONT_ALIASES`에 추가해야 한다는 규칙을 모르면 과거 방식으로 회귀할 수 있다 — 프로필 파일 상단 주석과 본 ADR로 고정.

## Related Documents
- Architecture: [style-profile-system.md](../ARCHITECTURE/style-profile-system.md)
- README: [README.md](../../README.md) §Font Authoring
- Review: [docs/REVIEW/2026-07-09-deep-review.md](../REVIEW/2026-07-09-deep-review.md) (R-10, R-40)

## Change Log
- 2026-09-27: 폰트명과 alias는 trim + ASCII 대소문자 무시, canonical 출력은 소문자(`SEBUL`→`sebul`, ` Gothic2 `→`gothic`). 런타임은 미지 이름도 소문자로 접어 `data-fy-font`에 기록하고(게이트는 소문자 `[data-fy-font="x"]`로 쓴다), `FONT_ALIASES` 조회는 own property만 본다. `fontInfo().loaded`는 `--fy-font-id`를 같은 규칙으로 비교한다. 4개 사이드카도 같은 규칙으로 정규화하고 미지 폰트는 계속 에러다(Rust가 대문자 canonical 이름을 거부하던 차이 제거). `spec/html-cases.json` v1.7의 `fontInput` 케이스가 고정한다
- 2026-09-25: Sprite Editor PoC 제거 — 같은 게이팅 관례를 쓰는 생성 경로를 Font Studio 템플릿으로 갱신
- 2026-07-10: canonical `data-fy-font` 게이트와 decorator authored 입력 보존을 반영 (TRK-031)
- 2026-07-09: 최초 작성 (TRK-030)
