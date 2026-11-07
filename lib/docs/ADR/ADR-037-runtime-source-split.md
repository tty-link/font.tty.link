# ADR-037: 런타임 소스 나누기 — 개발 쪽은 여러 파일, 소비자는 지금처럼 `font-kku.js` 하나

## Status
Proposed (2026-11-06) — 2026-11-06 전체 검토에서 제안. 1단계(구획 주석과 파일 지도)는 같은 날 master에 들어갔다(동작 변화 없음). 2단계(실제 나누기·생성기)는 SSOT의 정본 문장을 바꾸므로 사용자 결정 대상이었고(결정 대기 D27), 2026-11-06 사용자가 기본값(구획 주석 단계까지만)으로 답해 보류다. 다시 하려면 새 결정으로 올린다.

## Date
2026-11-06

## Context
- `font-kku.js`는 12,696줄, 최상위 함수 532개가 IIFE 하나 안에 있다. 가장 긴 함수는 `planRequest` 303줄, `fitSquareSplits` 238줄이다. 2026-11-06까지 구획을 나누는 주석이나 파일 지도가 없어, 사람과 에이전트가 어느 함수가 어느 결정(ADR)에 속하는지 파일 전체를 훑어 찾았다.
- 제품 원칙은 "브라우저 그리기는 빌드 없이 `font-kku.js`와 CSS 파일만 직접 불러서 쓸 수 있다"([ARCHITECTURE](../../ARCHITECTURE.md) Global Constraints)이다. 이 원칙은 **소비자**의 경험이다. 개발 저장소는 이미 코어 CSS의 생성 구간, 사이드카 미러, 꾸밈 CSS 등을 생성기(`scripts/regen.py`)로 만든다.
- [SSOT](../../SSOT.md) Truth Boundaries는 "runtime 동작의 1차 구현 정본은 `font-kku.js`와 `font-kku.css`"라고 적는다. 소스를 나누면 정본이 `src/`가 되고 `font-kku.js`는 생성물이 된다. SSOT는 사용자 요청 없이 고치지 않는다.
- 2026-10-17 엔진 간결화 검토와 2026-10-25 안정화 계획 S7(원소 좌표·잉크 분석의 순수 계산 경계)은 DOM 없는 계산을 떼어 Node 시험을 붙이는 방향을 이미 택했다. 파일이 하나라 순수 함수를 따로 시험하려면 런타임 전체를 `require`해야 한다.

## Decision
두 단계로 간다.

### 1단계 — 구획 주석과 파일 지도(지금, 동작 변화 없음)
- `font-kku.js` 머리에 파일 지도 주석을 두고, 본문을 서른 구획(§1–§30)으로 나누는 한 줄 주석을 넣는다. 구획은 결정(ADR)과 책임을 따른다 — 분해·DOM 그리기·옵션 읽기·기기 글꼴 맞춤·문자 재료·뼈대와 고정 모양·디자인·해석기·원소 노드·머리 음절·네모꼴 나누기 맞춤·측정 공통·스타일 읽기·구조 비교·그리기 일감·관찰·등록부와 refit·고르기와 복사·공개 API·그림자 트리 CSS·글꼴 받기·custom element·평문 모드·씨앗·벡터 자소·자소판 칸 문서·모듈 대기열·한 줄 설치·공개 객체.
- 주석은 `/* ── §NN 제목 ── */` 꼴이라 `grep '§12'`로 바로 간다. `BEGIN GENERATED … END GENERATED` 구간 안에는 넣지 않는다.
- 이 단계는 바이트가 바뀌어 측정 캐시(`tmp/verify-cache`)를 한 번 비운다. 그 밖의 비용은 없다.

### 2단계 — 나누기와 생성기(결정 뒤)
- 소스는 `src/runtime/NN-<구획 이름>.js` 서른 개(1단계 구획과 같다). 각 파일은 IIFE 안의 본문 조각이고 `function`·`var` 선언을 그대로 담는다. 모듈 문법(`import`·`export`)은 쓰지 않는다 — 조각을 이어 붙이면 지금과 같은 하나의 클로저가 된다.
- 생성기 `scripts/build_runtime.js`가 머리(IIFE 시작·VERSION·런타임 하나 보장)·조각들·꼬리(공개 객체·export)를 이어 `font-kku.js`를 쓴다. 첫 생성 결과는 지금 파일과 **바이트가 같아야 한다**(등가 확인). `scripts/generated-outputs.json`에 `runtime` 항목을 더해 `regen.py --check`가 낡음을 잡는다(빠른 층 `Generated outputs`).
- `scripts/bump_version.py`는 `src/runtime/00-head.js`의 `VERSION`을 고치고 생성기를 돌린다. `scripts/element_edition.js`(원소 전용 판 지킴이)와 `check_cdn_min.py`는 생성된 `font-kku.js`를 읽으므로 그대로다.
- `font-kku.mjs`·`.d.ts`·npm `files`·CDN 주소·사이트는 바뀌지 않는다. 소비자가 받는 파일은 지금과 같다.
- 에이전트 작업 경로: 런타임을 고칠 때 `src/runtime/`을 고치고 `node scripts/build_runtime.js`로 다시 만든다. `font-kku.js`를 직접 고친 변경은 `regen.py --check`가 막는다. AGENTS.md와 [리팩터 절차](../NOTES/refactor-workflow.md)에 한 줄 적는다.
- SSOT Truth Boundaries 문장을 "runtime 동작의 1차 구현 정본은 `src/runtime/`(생성물 `font-kku.js`)과 `font-kku.css`"로 고친다 — 사용자 승인 뒤.
- 순수 계산(해석기, 원소 좌표, 잉크 분석, 밀도 굵기 계수)은 나눈 뒤에도 같은 클로저 안이다. Node 시험이 조각 하나만 읽고 싶으면 생성기가 `module.exports`를 붙인 시험용 묶음(`tmp/` 아래, 커밋 안 함)을 내는 선택지를 둔다. 이것은 2단계에 넣지 않고 필요할 때 따로 정한다.

## Alternatives Considered
### A. 지금처럼 한 파일로 두고 주석만(1단계만)
- 설명: 구획 주석과 파일 지도만 둔다.
- 장점: 비용이 거의 없다. 정본 문장과 작업 경로가 그대로다.
- 단점: 532개 함수가 한 파일이라 병렬 에이전트의 충돌이 잦고(2026-10 병렬 작업에서 `font-kku.js`가 가장 많이 충돌한 파일이다), 순수 함수를 따로 시험할 수 없다.

### B. ESM 모듈로 나누고 번들러(rollup·esbuild)로 묶기
- 설명: `src/`를 `import`·`export`로 쓰고 번들러가 IIFE 하나로 묶는다.
- 장점: 표준 도구, 트리 셰이킹, 정적 분석.
- 단점: 개발 의존성(번들러)이 생기고 출력이 지금 파일과 바이트 단위로 같지 않아 등가 확인이 시각·스모크로 바뀐다. 클로저 공유 전역(`STATE`·`REGISTRY` 등 50여 개)을 모듈 사이에 넘기는 작업이 크다. 지금 저장소의 다른 생성기(이어 붙이기 방식)와 결이 다르다.

### C. 이어 붙이기 생성기(채택)
- 설명: 모듈 문법 없이 조각을 이어 붙인다.
- 장점: 첫 결과가 바이트 동일이라 등가가 자명하다. 의존성 없음. 다른 생성기와 같은 틀(`regen.py`).
- 단점: 조각 사이 참조를 도구가 검사하지 않는다(지금도 그렇다). `src/` 조각은 혼자서는 돌지 않는다.

## Consequences
### Positive
- 결정(ADR)별로 코드 자리가 분명해져 읽기·검토·병렬 작업이 쉬워진다. 파일 주인을 구획으로 나눌 수 있다.
- 2단계 뒤에는 순수 계산 조각에 Node 시험을 붙이는 길이 열린다(STABILITY S7의 방향).

### Negative
- 2단계는 작업 경로가 하나 늘어난다(고친 뒤 생성). `regen.py --check`가 잡아 주지만 처음에는 헷갈릴 수 있다.
- `git blame`이 `font-kku.js`에서는 생성 커밋을 가리킨다. 이력은 `src/`에서 본다.

### Risks
- 이어 붙이기 차례가 틀리면 선언 전에 쓰는 코드가 생길 수 있다 — 함수 선언은 호이스팅되고 `var`도 끌어올려지지만 초기화 차례는 바뀐다. 등가 확인(바이트 동일)이 처음에 이것을 막고, 그 뒤에는 조각 차례를 파일 이름 번호로 고정한다.
- 1단계 주석 삽입이 `BEGIN/END GENERATED` 구간 안에 들어가면 생성기 검사가 실패한다 — 구간 밖에만 둔다.

## Related Documents
- Architecture: [ARCHITECTURE.md](../../ARCHITECTURE.md) Global Constraints, [브라우저 런타임 설계](../ARCHITECTURE/browser-runtime-design.md)
- SSOT: [SSOT.md](../../SSOT.md) Truth Boundaries
- Notes: [엔진 간결화 검토(2026-10-17)](../NOTES/engine-simplification-review-2026-10-17.md), [리팩터 절차](../NOTES/refactor-workflow.md), [검증 세 층·측정 캐시](../NOTES/verify-tiers-cache.md)
- Plan: [PLAN-STABILITY-001 S7](../PLAN/stability-followup-2026-10.md)

## Change Log
- 2026-11-06: Proposed. 1단계(구획 주석 §1–§30과 파일 지도)를 같은 날 브랜치에 넣음. 2단계는 결정 대기 D27
- 2026-11-06: 1단계가 master에 병합됨. D27은 기본값(구획 주석 단계까지만)으로 답을 받아 2단계 보류
