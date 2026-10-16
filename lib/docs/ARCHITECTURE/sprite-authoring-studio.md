# ARCH-SPRITE-001: Sprite Authoring Studio (대체됨)

## Status
[글꼴 작업실](./font-studio.md)로 대체됐다([ADR-009](../ADR/ADR-009-font-editor-v2.md)). 이 문서가 설명하던 `site/sprite-editor.html` PoC는 2026-09-25에 제거됐다. 외부 링크가 끊기지 않도록 파일만 남긴다.

## 현재 경로
- 자소판 편집은 글꼴 작업실(`studio/index.html`)의 **재료 탭**이 맡는다. `--fy-material: sprite` 글꼴을 열면 `--fy-sprite-url` 자소판을 원본 캔버스로 편집하고, 미리보기 자소를 클릭해 칸을 고르며, PNG와 글꼴 CSS를 짝으로 내보낸다. 구조는 [글꼴 작업실](./font-studio.md)의 "재료 탭 (그림 자소)" 절을 본다.
- 작업 상태는 프로젝트 JSON v2(`format: "font-kku-font-project"`, `version: 2`)로 저장한다. 옛 Sprite Editor의 v1 프로젝트([ADR-006](../ADR/ADR-006-sprite-project-schema-v1.md))는 글꼴 작업실의 v1 가져오기(`authoring/font-studio-sheet.js` `migrateV1Project`)로 읽는다.
- 그림 자소 글꼴 형식과 자소판 행 계약은 [그림 자소 글꼴](./image-sprite-fonts.md)이 정본이다.
- PoC에만 있던 그림 자소 다중 배율 PNG 내보내기, 사각형 도구, 광학 크기 프리셋 화면은 제거 당시 옮기지 않았다가 2026-10-09에 재료 탭으로 복원했다(자소판 비우기·전체 다시 채우기, 다시, 잉크 비율, 칸 크기, 래스터 품질, CSS 복사 포함). 탐색 메뉴의 "자소판 그리기"가 재료 탭을 바로 연다.

## 이력
이전 본문(40칸 자소판 편집, schema v1 저장, WYSIWYG CSS 교정, 검증 계약)은 git 이력과 [TRK-032 지난 작업 기록](../../archive/tasks/2026-07/trk-032-post-refactor-product-closure.md)에 남아 있다.

## Related Documents
- Architecture: [글꼴 작업실](./font-studio.md), [그림 자소 글꼴](./image-sprite-fonts.md)
- ADR: [ADR-009 폰트 에디터 v2](../ADR/ADR-009-font-editor-v2.md), [ADR-006 Sprite project schema v1](../ADR/ADR-006-sprite-project-schema-v1.md)
- Plan: [Sprite Authoring Studio (대체됨)](../PLAN/sprite-authoring-studio.md)

## Change Log
- 2026-10-09: PoC 자소판 기능의 글꼴 작업실 재료 탭 복원과 "자소판 그리기" 입구를 현재 경로에 반영
- 2026-09-25: Sprite Editor PoC 제거에 따라 글꼴 작업실을 가리키는 대체 안내로 교체. 이전 본문은 git 이력에 남긴다
- 2026-08-08: 4단계 저작 작업 흐름과 패널 anchor/help를 추가하고, Pointer Events 단일 경로·그리기 범위(draw-scope) 단축키·0값 보존 WYSIWYG 드래그 계약을 명시
- 2026-07-10: TRK-032 전체 로컬 릴리스 검증 통과(green); 원격 통합은 별도 진행
- 2026-07-10: TRK-032 schema v1 JSON·로컬 초안, PNG 가져오기, 이력·편집 도구, 진단과 Node/Playwright 검증 계약 반영
- 2026-07-10: 생성 CSS 관문을 정본 `data-fy-font` 계약으로 동기화
- 2026-05-18: 실제 구현 상태에 맞춰 JSON 저장과 PNG 가져오기를 향후 작업으로 정정
- 2026-04-24: 당시 구현 상태를 반영해 Sprite Editor 완료 범위와 남은 저장·가져오기·진단 축을 명시
- 2026-04-21: 브라우저용 그림 자소 저작 도구(Sprite Authoring Studio)의 첫 아키텍처 계획
