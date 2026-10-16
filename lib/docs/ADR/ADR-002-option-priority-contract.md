# ADR-002: 옵션 우선순위 계약 — attribute 지속, JS 옵션은 호출 1회

## Status
Accepted

## Date
2026-07-09

## Context
기존 구현은 `refresh()`가 이전 렌더의 정규화된 옵션(`state.options`)을 새 옵션 위에 병합해 넘겼다. normalizeOptions는 명시적 옵션이 있으면 attribute를 읽지 않으므로, 첫 렌더 이후 attribute/`data-*` 변경이 전부 무시됐다 — `attributeChangedCallback`과 decorator MutationObserver 속성 감시가 사실상 무력화된 critical 버그(심층 리뷰 R-01/R-04). `seed="auto"`도 resolved 값이 승계돼 문서 계약("렌더마다 새 값")과 어긋났다(R-13).

## Decision
- **attribute(custom element) / `data-*`(decorator)가 지속(persistent) 옵션 소스다.** `refresh()`와 재렌더 경로는 매번 attribute를 재독한다. 이전 호출의 해석 결과는 옵션으로 승계되지 않는다.
- **JS 옵션(`render(target, options)` / `refresh(target, options)`)은 해당 호출 1회에만 적용된다.** 지속시키려면 호출자가 attribute로 쓴다.
- 같은 호출 안의 우선순위: 명시적 JS 옵션 > attribute > 기본값. `font`가 `profile`(alias)보다 우선. JS 옵션의 `undefined`·`null`·빈 문자열은 명시가 아니라 attribute로 폴백한다.
- 자동 재렌더(attribute 변경, 원문 변경, font CSS 재해석)도 같은 규칙으로 attribute를 재독한다. 예외는 분리 상태 렌더의 연결 시 완료뿐이다 — 스타일을 해석하지 못한 그 호출을 마치는 것이라 그 호출의 JS 옵션을 쓴다.
- `seed`가 `auto`/`random`이면 렌더마다 새 값으로 재해석한다.
- **decorator의 authored `data-*`와 resolved output을 같은 key에 쓰지 않는다.** `data-font`/`data-profile`/`data-size`/`data-spacing`/`data-wrap-unit`/`data-animate`/`data-seed`는 입력으로 보존하고, 정규화 결과는 `data-fy-font`/`data-fy-profile`/`data-fy-size`/`data-fy-spacing`/`data-fy-wrap-unit`/`data-fy-animate`/`data-fy-seed`에 쓴다.
- custom element는 입력이 `font`/`profile`/`size`/`spacing`/`wrap-unit`/`animate`/`seed`이므로 namespace 충돌이 없다. 모든 `data-fy-*` 정본 출력을 쓰면서 기존 `data-font`/`data-profile`/`data-size`/`data-wrap-unit`/`data-animate`/`data-seed` mirror도 하위 호환으로 유지한다.
- `seed="auto"`/`"random"` 원문은 입력 attribute에 남고, 렌더마다 해석된 숫자는 `data-fy-seed`와 `--fy-seed`에만 정본으로 기록한다.

## Alternatives Considered
### Alternative A — state.options에 사용자 JS 오버라이드를 raw로 보관해 승계
- 설명: 해석 결과가 아닌 raw 오버라이드만 저장하고 매 렌더 attribute와 병합.
- 장점: JS 옵션도 지속되는 "설정" 모델.
- 단점: attribute와 JS 상태 두 개의 지속 소스가 생겨 어느 쪽이 이기는지 추론이 어렵다. SSR/clone 복구 시 JS 상태는 재현 불가.

### Alternative B — attributeChangedCallback에서 변경 key만 명시 전달
- 설명: 변경된 attribute만 `refresh(this, {[key]: newValue})`로 전달.
- 장점: 최소 변경.
- 단점: decorator observer, 수동 `refresh()` 등 다른 경로가 여전히 stale 병합 문제를 갖는다. 계약이 경로마다 달라진다.

## Consequences
### Positive
- 선언적 갱신(`setAttribute`, `data-*` 변경)이 문서 약속대로 동작한다.
- "attribute를 보면 다음 렌더 결과를 안다"는 단일 소스 원칙이 성립한다.
- `seed="auto"` non-deterministic 계약이 복원됐다.
- decorator의 JS 1회 옵션이 입력으로 되기록되어 영구화되거나, 정규화된 `data-profile`이 삭제한 `data-font`를 되살리는 회귀를 막는다.
- CSS와 진단 도구는 authored 입력과 무관하게 canonical `data-fy-*` 출력만 읽으면 된다.

### Negative
- JS 옵션만으로 상태를 유지하던(문서화된 적 없는) 사용 패턴은 attribute를 쓰도록 바꿔야 한다.

### Risks
- 렌더마다 attribute를 재독하므로 옵션 해석 비용이 렌더 경로에 포함된다(현재 규모에서는 무시 가능).

## Related Documents
- Architecture: [browser-runtime-design.md](../ARCHITECTURE/browser-runtime-design.md)
- README: [README.md](../../README.md) §Public API — 옵션 우선순위 계약
- Review: [docs/REVIEW/2026-07-09-deep-review.md](../REVIEW/2026-07-09-deep-review.md) (R-01, R-04, R-13, R-42)

## Change Log
- 2026-09-27: 자동 재렌더 경로를 통일 — font CSS 재해석(restyle)도 attribute를 재독하고 직전 호출의 JS 옵션을 승계하지 않는다(attribute 원문이 그대로인 seed만 해석값 유지). 분리 상태에서 한 렌더를 연결 시 마치는 재렌더는 같은 호출의 완료라 그 호출의 JS 옵션을 쓴다. JS 옵션의 `undefined`·`null`·빈 문자열은 attribute로 폴백(`seed: null`도 동일). opt-in 옵션 `jamo-seeds`/`data-jamo-seeds`/`jamoSeeds`(출력 `data-fy-jamo-seeds`, 켰을 때만) 추가 — 같은 우선순위 규칙을 따른다
- 2026-07-10: decorator 입력과 canonical `data-fy-*` 출력 namespace를 분리하고 custom element legacy mirror 범위를 명시 (TRK-031)
- 2026-07-09: 최초 작성 (TRK-030)
