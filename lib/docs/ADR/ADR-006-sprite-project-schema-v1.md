# ADR-006: Sprite Editor project schema v1과 local persistence 계약

## Status
Superseded by ADR-009

## Date
2026-07-10

## Context
Sprite Authoring Studio는 bitmap sheet, CSS profile, preview 설정과 WYSIWYG patch를 여러 세션에 걸쳐 다시 편집해야 한다. 브라우저 내부 state를 그대로 JSON으로 내보내면 DOM/canvas 객체와 임시 필드가 섞이고, 필드 변경 시 과거 project를 조용히 잘못 읽을 수 있다. PNG import는 여러 해상도를 받아 master canvas로 정규화하지만 project import는 편집 상태 전체를 복원하므로 더 엄격한 계약이 필요하다.

## Decision
- project 파일은 `format: "font-kku-sprite-project"`, `version: 1`을 갖는 versioned JSON object다.
- `sheet`는 항상 21×2, 256px cell의 `5376×512` master PNG data URL을 저장한다. 일반 PNG import는 master/legacy/compatible 21:2 sheet를 받아 master로 정규화한 뒤 project에 넣는다.
- `profile`은 명시적 allowlist와 `--fy-*` 변수 map만 저장한다. DOM node, object URL, history stack과 임시 UI state는 저장하지 않는다.
- 선택 cell과 brush state를 저장하고, WYSIWYG patch는 profile 변수에서 canonical 순서로 파생한다.
- project import는 알 수 없는 format/version, master가 아닌 project sheet, 유효하지 않은 PNG payload를 명시적 오류로 거부한다. 새 version은 별도 migration을 추가하기 전까지 자동 추측하지 않는다.
- JSON export/import와 `localStorage` draft는 같은 serializer/parser를 사용한다. draft key는 schema version을 포함한 `font-kku-sprite-editor-project-v1`이다.
- 이 형식은 repo-local Sprite Authoring Studio의 persistence 계약이다. `font-kku.js` runtime DOM/API나 npm browser-core 계약에는 포함되지 않는다.

## Alternatives Considered
### Alternative A — Editor state 전체를 그대로 JSON 직렬화
- 장점: 구현량이 적고 새 필드가 자동으로 포함된다.
- 단점: 임시 상태와 private 구현이 파일 형식으로 굳고, 과거 파일을 안전하게 검증할 수 없다.

### Alternative B — PNG/CSS만 저장하고 project 형식은 두지 않음
- 장점: 공개 포맷이 단순하다.
- 단점: preview/brush/선택 상태와 structured profile을 잃어 authoring session을 온전히 재개할 수 없다.

### Alternative C — 서버 또는 IndexedDB 전용 저장
- 장점: 큰 데이터와 migration을 중앙 관리하기 쉽다.
- 단점: file:// 단독 실행과 repo-local utility 범위를 깨고 서버·계정 범위를 새로 만든다.

## Consequences
### Positive
- export file과 local draft가 한 parser/validator를 공유해 round trip 결과가 결정적이다.
- 향후 schema 변경을 version 단위 migration으로 다룰 수 있다.
- PNG import의 해상도 유연성과 project import의 상태 정확성을 분리한다.

### Negative
- schema에 새 profile 필드를 추가할 때 allowlist와 테스트를 함께 갱신해야 한다.
- PNG data URL을 포함하므로 project JSON 크기가 크다.

### Risks
- v1 파일을 장기간 공개 호환으로 오해할 수 있다. 문서에서 repo-local authoring 계약임을 유지하고, version 변경은 명시적 migration과 함께 한다.
- localStorage 용량 제한으로 큰 draft 저장이 실패할 수 있다. UI는 save 실패를 사용자에게 알리고 JSON download 경로를 유지한다.

## Related Documents
- Architecture: [Font Studio](../ARCHITECTURE/font-studio.md) (v1 프로젝트 이전), [Sprite Authoring Studio (superseded)](../ARCHITECTURE/sprite-authoring-studio.md)
- ADR: [ADR-009 폰트 에디터 v2](./ADR-009-font-editor-v2.md)
- Architecture: [Image Sprite Fonts](../ARCHITECTURE/image-sprite-fonts.md)
- Plan: [TRK-032 historical track](../../archive/tasks/2026-07/trk-032-post-refactor-product-closure.md)
- Implementation: v1 편집기 serializer/parser `site/sprite-editor-project.js`는 제거됨(git 이력). 현재 v1 읽기는 [font-studio-sheet.js](../../authoring/font-studio-sheet.js)의 `migrateV1Project`
- Tests: v1 전용 `tests/sprite_editor_project.test.js`는 제거됨. 현재 v1 이전 회귀는 [font_studio_model.test.js](../../tests/font_studio_model.test.js)

## Change Log
- 2026-09-25: ADR-009로 Superseded — Sprite Editor PoC 제거와 함께 v1 편집기와 serializer/parser(`site/sprite-editor-project.js`, `localStorage` draft key 포함)를 없앴다. 기존 v1 프로젝트 파일은 Font Studio 재료 탭의 v1 가져오기(`site/font-studio-sheet.js` `migrateV1Project`)가 읽어 v2 프로젝트(`font-kku-font-project`)로 옮긴다(시트는 그대로, 변수 표는 font 레이어 host 선언으로, 페이지 전용 override는 버림). v1 파일을 새로 쓰는 경로는 없다
- 2026-07-10: TRK-032 schema v1 구현과 함께 Accepted
