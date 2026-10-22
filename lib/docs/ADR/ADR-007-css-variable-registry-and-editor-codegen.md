# ADR-007: CSS variable registry와 editor slot contract codegen

## Status
Accepted

## Date
2026-07-10

## Context
`font-kku.css`의 fallback dispatch와 runtime/sprite 공개 표면은 계속 확장된다. 변수 이름·기본값·slot 상태가 base CSS, runtime, profile, 두 editor와 문서에 분산돼 있어 오타나 placement 변경이 조용히 drift할 수 있었다. 특히 `bb`와 과거 bottom-double token이 현재 placement에서 emit되는 slot처럼 문서화되어 있었다.

## Decision
- `spec/css-variables.json` v1.0을 공개 CSS variable inventory와 metadata의 machine-readable registry로 둔다.
- `font-kku.css`는 실제 fallback/기본값을 실행하는 canonical CSS 구현으로 유지한다. `scripts/check_css_contract.js --check`가 registry와 base CSS 변수 이름·terminal fallback을 대조한다.
- registry는 runtime/sprite 전용 variable, role/family expansion과 slot 상태를 기록한다. 현재 개수는 checker 출력이 정본이다.
- slot 상태는 `active`(runtime placement에서 emit), `fallback`, `reserved`, `deprecated`로 구분한다. 정확한 집합과 emitted 여부는 registry와 placement spec을 직접 읽는다.
- `site/font-editor.js`의 slot contract block은 registry에서 생성한다. `node scripts/check_css_contract.js --write`가 marker 사이를 갱신하고 `--check`가 stale block을 거부한다.
- checker는 `spec/tables.json` placement, editor sample token, runtime/sprite surface와 지정 문서가 registry 밖 변수를 쓰지 않는지도 검증한다.
- CI/release entry는 `npm test`의 asset/CSS contract test로 이 checker를 실행한다. 정본 수정 후에는 `--write`와 전체 Node suite를 함께 실행한다.

## Alternatives Considered
### Alternative A — `font-kku.css`에서 모든 metadata를 추론
- 장점: 파일 하나만 수정한다.
- 단점: status/type/surface/deprecation과 runtime-only 변수를 CSS 사용처만으로 안정적으로 표현할 수 없다.

### Alternative B — registry에서 base CSS 전체를 생성
- 장점: 완전한 단방향 codegen이 된다.
- 단점: selector와 중첩 fallback 구조까지 JSON으로 옮겨 CSS authoring 가독성과 기존 정본 소유권을 크게 바꾼다.

### Alternative C — 문서 표와 리뷰만 유지
- 장점: 도구가 단순하다.
- 단점: 이미 여러 사본과 editor sample이 drift한 경로를 자동 차단하지 못한다.

## Consequences
### Positive
- 변수 이름, 기본값, surface와 slot lifecycle을 기계 검증한다.
- 에디터의 slot 계약이 registry와 자동으로 동기화된다(현재 대상은 Font Studio의 `authoring/font-studio-model.js`).
- deprecated `bb`, reserved `blb`/`brb`가 신규 authoring 대상으로 오인되지 않는다.

### Negative
- base CSS 변수 또는 placement token 변경 시 registry와 generated block도 같은 변경에 포함해야 한다.
- registry와 CSS는 서로 다른 역할의 정본이므로 checker가 release gate여야 한다.

### Risks
- registry를 base CSS 생성기로 오해할 수 있다. registry는 inventory/metadata, `font-kku.css`는 실행 구현이라는 경계를 문서에 유지한다.

## Related Documents
- Architecture: [Style Font System](../ARCHITECTURE/style-profile-system.md)
- Authoring: [Font Authoring and Calibration Guide](../ARCHITECTURE/font-authoring-and-calibration-guide.md)
- Registry: [css-variables.json](../../spec/css-variables.json)
- Checker: [check_css_contract.js](../../scripts/check_css_contract.js)
- Plan: [TRK-032 historical track](../../archive/tasks/2026-07/trk-032-post-refactor-product-closure.md)

## Change Log
- 2026-09-25: PoC 제거 — `site/font-editor.js`와 그 slot-contract 생성 블록을 PoC와 함께 없앴다. `--write`/`--check`의 생성 대상은 이제 `font-kku.css`의 dispatch 블록과 `site/font-studio-model.js`의 studio slot contract(`studio-slot-contract` marker)다. Decision의 font-editor 문구는 당시 기록으로 남긴다
- 2026-09-24: ADR-008 폰트 계약 v2 — registry v2.0(slot `parent`, weight/stroke, 보정·메타데이터 변수). base CSS의 slot·role 디스패치 블록은 이제 registry에서 생성한다(`--write`/`--check`). 나머지 base CSS는 손으로 쓴 실행 정본으로 유지
- 2026-08-13: depth/head 확장 뒤에도 유지되도록 변동 variable/slot 수를 checker 출력으로 위임
- 2026-07-10: TRK-032 registry/checker/editor codegen 구현과 함께 Accepted
