# ADR-013: 벡터 자소 — 자모마다 인라인 SVG, 코드로 등록하는 자모 세트

## Status
Accepted

## Date
2026-10-10

## Context
자소 재료는 지금까지 셋이었다: 기기 글꼴의 자모(system), 자소판 한 장(sprite — 손글씨 PNG, 직접 그린 SVG). 자소판은 한 장의 그림을 칸마다 배경으로 잘라 쓰므로 다음이 안 된다.

- 자모마다 색·굵기·끝 모양을 CSS로 바꾸기. 그림의 색이 고정이라 `color`가 먹지 않는다.
- 자리가 눌린 칸(받침·겹받침·가로 모음 위 초성)의 획 굵기 유지. 그림이 같이 눌려 얇아지므로 `drop-shadow` 팽창(`--fy-*-dilate`)으로 메웠고, 작은 크기에서 뭉쳤다.
- 파일 없이 코드로 넣기. AI가 HTML 한 장을 만들 때는 SVG 시트를 Blob 주소로 끼우는 우회가 필요했다.

[ADR-011](./ADR-011-svg-jamo-sheets.md)의 획 정의는 이미 칸(0–100) 좌표의 SVG 경로다. 같은 데이터를 자모별로 런타임에 넘기면 위 셋이 풀린다. 시험(2026-10-10)에서 `vector-effect: non-scaling-stroke`와 `em` 굵기로 눌린 자리까지 획이 고르게 유지됨을 확인했고, 크기는 자모별 파일 93개(파일별 gzip 합 19KB)보다 코드 모듈 하나(gzip 약 3KB)가 가장 작았다.

## Decision

### 1. 재료 표면 `vector`
- 바탕 요소에 `jamo-set="<이름>"`(장식형은 `data-jamo-set`)을 주면, 그 이름의 자모 세트가 등록돼 있고 글꼴이 그림 자소 배치(`--fy-material: sprite`)일 때 벡터 자소로 그린다. 런타임은 바탕 요소에 `data-fy-material="vector"`와 `data-fy-jamo-set`을 찍는다 — 코어 sprite 규칙(배경, `color: transparent`)은 꺼진다.
- 배치는 글꼴 CSS 그대로다. 각 자모 노드의 칸은 글꼴이 고른 `--fy-sprite-row`와 자모로 정한다(`r<행>-<호환 자모>`) — 자소판 방식과 같은 칸을 그린다. 그림 자소 글꼴의 낱자(ADR-012)도 같다.
- 렌더 묶음이 끝난 뒤 모든 벡터 노드의 행을 한 번에 읽고(스타일 재계산 1회), 칸 그림을 붙인다: `<svg part="vector" data-cell="r0-ㄱ" viewBox="0 0 100 100" aria-hidden="true">`. 칸 그림은 문서별로 한 번 만들어 복제한다.
- 노드의 글자는 투명하게 남는다(`-webkit-text-fill-color: transparent`) — 선택·복사·스크린리더는 그대로다. `color`는 남으므로 획과 채움이 `currentColor`를 따르고, 페이지 CSS가 기기 글꼴처럼 자모마다 색을 준다.
- 획은 `vector-effect: non-scaling-stroke`, 굵기는 `--fy-vector-stroke`(페이지, 길이) → 세트 굵기 `--fy-vector-stroke-cells`(칸 단위, 런타임이 칸 그림에 적음) × 0.01em × 시트 확대값. 끝 모양·꺾임은 SVG 표현 속성이라 페이지 CSS(`stroke-linecap` 등)가 이긴다. `--fy-sprite-zoom/crop-*`은 칸 위치에 그대로 쓰고, 획 보정(`--fy-*-dilate`)은 쓰지 않는다. 페이지 전용 `--fy-sprite-filter`는 적용된다.

### 2. 자모 세트는 코드로 등록한다
- `FontKku.registerJamo(name, cells, options)` — `cells`는 `"r0-ㄱ"` 같은 칸 키에서 도형 하나나 목록으로: 경로 데이터 문자열(획 중심선), `{ d, fill: true }`(채운 외곽선), `{ ellipse: [cx, cy, rx, ry] }`. `options`: `stroke`(칸 단위, 기본 7.2, 채움만 쓰면 0), `cap`, `join`.
- 마크업은 받지 않는다. 경로 데이터는 SVG 경로 명령과 숫자만 허용하고, 요소는 `createElementNS`로 만든다 — 세트가 스크립트나 외부 참조를 넣을 길이 없다.
- 같은 이름을 다시 등록하면 바꾸고, 그 세트를 쓰는 바탕 요소를 다시 그린다(스타일 변화와 같은 재렌더 — 속성 다시 읽기, 씨앗값 유지). 등록 전에 그려진 바탕 요소는 자소판으로 그려져 있다가 등록되면 바뀐다.
- 런타임보다 먼저 실린 모듈은 `globalThis.FontKkuJamo`(배열)에 `[name, cells, options]`를 push한다. 런타임이 로드되며 대기열을 비우고, 그 뒤 push는 바로 등록한다(전역 `FontKku` 인스턴스로). 잘못된 세트는 경고만 낸다.
- 한 줄 설치 `data-jamo-sets="sprite-system"`은 `profiles/<이름>.jamo.js`를 classic script로 붙이고, 가림막이 그 도착도 기다린다. `FontKku.jamoSets()`는 등록된 이름을 돌려준다.

### 3. 기본 제공 세트
`scripts/build_jamo_svg.js`가 자소판과 같은 획으로 `profiles/<글꼴>.jamo.js`를 낸다 — 질감 필터가 없는 `sprite-system`(8.9KB, gzip 3.3KB), `sprite-example`, `pixel`(채운 도트). 한 칸이 한 줄이라 사람과 AI가 읽고 고칠 수 있다. `dojang`·`chalk`는 SVG 필터 질감이 본질이라 자소판으로 둔다. `npm test`가 `--check`로 모듈이 획 정의와 같은지 본다.

## Alternatives Considered
### 자모별 SVG 파일(칸마다 파일 하나)
- 장점: 파일을 하나씩 그려 넣기 쉽다.
- 단점: 93칸이 요청 93번이고 파일별 gzip 합이 19KB(코드 모듈 3KB)다. 질감 필터가 있으면 파일마다 반복돼 140KB가 된다. 인라인으로 쓰려면 런타임이 파일을 모두 받아 파싱해야 한다.

### SVG 시트를 런타임이 받아 칸을 꺼내 쓰기
- 장점: 시트 하나를 배경(자소판)으로도 인라인(벡터)으로도 쓴다.
- 단점: `fetch`라 `file://`에서 막힌다. 시트의 `<style>`·필터를 옮기는 규칙이 따로 필요하다. 코드 모듈은 `<script src>`로 `file://`에서도 실린다.

### 마크업 문자열 세트
- 장점: 아무 SVG나 붙여 넣는다.
- 단점: DOM 주입이라 스크립트·이벤트 속성·외부 참조를 걸러야 한다. 경로 데이터만 받으면 그 위험이 없고, 채운 외곽선(`fill`)으로 그림·캐릭터도 표현된다.

### 시트를 CSS 마스크로 써서 색만 바꾸기
- 장점: DOM이 늘지 않는다.
- 단점: 색·그라데이션만 되고 굵기·끝 모양·획 움직임은 안 된다. 꾸밈 옵션으로 따로 다룬다(TODO).

## Consequences
### Positive
- 자모마다 색·굵기·끝 모양·대시(점선 LED)·획 그리기 움직임을 CSS로 준다. 도트도 `color`를 따른다.
- 눌린 자리의 획이 얇아지지 않는다 — 획 보정 꼼수가 필요 없다.
- AI가 HTML 한 장 안에 `registerJamo`로 자모를 바로 그려 넣는다. 배치는 `sprite-system`의 보정값을 그대로 쓴다.

### Negative
- 자모마다 SVG 요소가 하나씩 생긴다. 제목에는 문제없지만 긴 본문은 DOM이 늘어난다.
- 칸은 계산된 행으로 고른다. load 이벤트 없는 CSS 변경 뒤에는 `refreshAll(host)`으로 SVG 칸을 다시 선택한다. 같은 칸은 보존하며, 등록되지 않은 칸은 기반 자소판으로 표시한다([ADR-020](ADR-020-rendering-boundaries-and-recovery.md)).

### Risks
- `-webkit-text-fill-color`로 글자를 숨기므로, 페이지가 노드에 `-webkit-text-fill-color`를 주면 원문 글자가 겹쳐 보인다.
- `vector-effect: non-scaling-stroke`의 대시 간격도 화면 단위라, 크기에 따라 점 수가 달라진다.

## Related Documents
- ADR: [ADR-008 글꼴 계약 v2](./ADR-008-font-contract-v2.md), [ADR-011 SVG 자소판](./ADR-011-svg-jamo-sheets.md), [ADR-012 한글 입력기·글꼴 없는 기기](./ADR-012-hangul-ime-and-fontless-devices.md)
- Architecture: [그림 자소 글꼴](../ARCHITECTURE/image-sprite-fonts.md)

## Change Log
- 2026-10-10: 재료 표면 `vector`, `jamo-set`, `registerJamo`·`jamoSets`, `FontKkuJamo` 대기열, `data-jamo-sets`, 기본 제공 세트 3종과 함께 Accepted로 기록
