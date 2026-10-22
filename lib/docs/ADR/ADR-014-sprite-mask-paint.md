# ADR-014: 자소판 마스크 칠 — 그림 자소에 CSS 색 입히기

## Status
Accepted

## Date
2026-10-10

## Context
그림 자소(자소판)는 그림의 색이 그대로 보인다. 코어 sprite 규칙이 노드 글자를 `color: transparent`로 숨기고 칸을 배경으로 칠하므로, 페이지가 `[part~="choseong"] { color: … }`를 줘도 아무것도 바뀌지 않았다. 색을 바꾸는 길은 페이지 전용 `--fy-sprite-filter`(색 행렬·`hue-rotate` 같은 필터)뿐이었다. 손으로 그린 PNG 손글씨를 브랜드 색으로 쓰거나 자모마다 다른 색을 주기 어려웠다.

[ADR-013](./ADR-013-vector-jamo.md)의 벡터 자소는 색·굵기를 모두 CSS로 바꾸지만, 자모 그림이 경로 데이터여야 한다. PNG 손글씨와 질감 필터가 있는 SVG 자소판(도장·분필)에는 못 쓴다.

## Decision
- 글꼴이나 페이지가 바탕 요소에 `--fy-sprite-paint: mask`를 주면(기본 `image`), 런타임이 그림 자소 글꼴의 바탕 요소에 `data-fy-sprite-paint="mask"`를 찍는다. 값은 렌더할 때 읽고, 바뀌면 다시 그린다(재료·종류와 같은 구조 값). 벡터 자소(`jamo-set`)가 걸리면 쓰지 않는다.
  - 정정(2026-10-17): 2026-10-11 [ADR-020](./ADR-020-rendering-boundaries-and-recovery.md)의 부분 벡터 세트 대체 표시부터는 벡터 자소가 걸려도 `data-fy-sprite-paint="mask"`를 찍는다. 마스크는 벡터 SVG를 그린 칸(`data-fy-vector-cell`)에만 걸리지 않고, 세트에 없어 기반 자소판으로 그리는 칸에는 그대로 걸린다(코어 규칙 `:not([data-fy-vector-cell])`, 스모크 `assert_design_regressions`의 `maskFallback`).
- 코어 규칙은 그 바탕 요소의 자소 노드에서 자소판을 마스크로 쓴다. `mask-image`·`mask-size`·`mask-position`은 배경 칸 계산과 같은 식이다(`-webkit-` 접두 포함). 칠은 `background-image: var(--fy-sprite-fill, linear-gradient(currentColor, currentColor))`다.
  - 자소판의 알파만 모양으로 쓰므로 색은 CSS가 정한다. 기본은 글자 색이라 페이지가 기기 글꼴처럼 자모마다 `color`를 준다.
  - `--fy-sprite-fill`(글꼴·페이지, `<image>`)로 그라데이션·무늬·그림을 준다.
- 글자는 `-webkit-text-fill-color: transparent`로 숨긴다. 시트 규칙의 `color: transparent`는 마스크가 아닌 바탕 요소에만 걸리도록 떼어 냈다.
  - 정정(2026-10-21): 칠만 투명하게 두면 글자 모양대로 그리는 것이 남는다 — 꾸밈의 글자 획(outline·neon `-webkit-text-stroke`)이 마스크 안에 숨은 기기 글꼴 자모를 비치고, 이미지 칠에서는 페이지 `text-shadow`·`--fy-stroke`가 기기 글꼴 자모의 그림자·윤곽을 그렸다. 그림이 칠하는 노드(이미지·마스크 칠)의 자기 글자는 모든 엔진에서 `::first-letter { font-size: 0 }`이다(탐침 matrix-16). 강제 색에서는 칠 그라디언트가 지워지므로 마스크 칠을 `CanvasText`로 칠한다.
- 레지스트리 `--fy-sprite-paint`(font·host, keyword `image|mask`, 런타임이 읽음), `--fy-sprite-fill`(font·host, image). 701(644).

## Alternatives Considered
### CSS 스타일 쿼리(`@container style(--fy-sprite-paint: mask)`)
- 장점: 런타임이 값을 읽지 않아도 된다.
- 단점: 일부 브라우저(Firefox)가 사용자 지정 속성 스타일 쿼리를 지원하지 않는다. 재료·종류처럼 런타임이 바탕 요소에 찍는 기존 방식과도 어긋난다.

### `--fy-sprite-filter`로 색 바꾸기만 안내
- 장점: 계약 변경이 없다.
- 단점: 필터로는 원하는 색을 정확히 내기 어렵고, 그라데이션·무늬는 불가능하다. 자모마다 다르게 주기도 번거롭다.

## Consequences
### Positive
- PNG 손글씨·SVG 자소판 모두 자모마다 색·그라데이션·무늬·그림을 CSS로 입힌다. DOM은 늘지 않는다.
- 도장·분필처럼 알파에 질감이 있는 자소판은 질감을 유지한 채 색만 바뀐다.

### Negative
- 필터는 마스크 전에 적용되므로 획 보정(`--fy-*-dilate`)이 효과가 없다. 눌린 자리의 획이 자소판 그대로 가늘다. 굵기까지 바꾸려면 벡터 자소를 쓴다.
- 자소판의 원래 색(여러 색으로 그린 손글씨)은 잃는다 — 마스크는 알파만 본다.

### Risks
- 오래된 브라우저(접두 없는 `mask-*` 이전)는 `-webkit-` 접두 속성에 기댄다.

## Related Documents
- ADR: [ADR-008 글꼴 계약 v2](./ADR-008-font-contract-v2.md), [ADR-011 SVG 자소판](./ADR-011-svg-jamo-sheets.md), [ADR-013 벡터 자소](./ADR-013-vector-jamo.md)
- Architecture: [그림 자소 글꼴](../ARCHITECTURE/image-sprite-fonts.md)

## Change Log
- 2026-10-10: `--fy-sprite-paint: mask`, `--fy-sprite-fill`, 코어 마스크 규칙과 함께 Accepted로 기록
- 2026-10-13: WebKit(Safari·iPhone)이 마스크 칠 노드 상자 가장자리 화소에 칠을 비쳐 자모마다 옅은 칸 테두리선이 생겼다(원래 칠은 상자 전체
  `background-size: 100% 100%`). 코어 규칙이 칠을 상자보다 화면 한 화소씩 안쪽(`calc(100% - 2 * max(1%, 1px))`, 2배 화면은 0.5px)에 가운데로
  깐다. 기본 자소판은 칸 가장자리 1%가 비어 있어(측정: pilgi·dunggeun·butgeul·crayon·jasu·pixel·sprite-system) 큰 글자에서는 잉크가 그대로이고,
  작은 글자(노드 상자 100 화면 화소 미만)에서는 상자 가장자리 한 화소 안의 잉크 끝만 빠진다. `--fy-sprite-fill` 이미지도 같은 안쪽 상자에 맞는다.
  스모크 `sprite-mask-seams`(시험 판 — 칸 가운데 점, 마스크 칠 대 보통 칠, 배율 1·2, Firefox·WebKit도)
- 2026-10-17: 문서 정정 — "벡터 자소가 걸리면 쓰지 않는다"는 2026-10-11(ADR-020, 커밋 `0d8103a`) 뒤로 사실이 아니다. 런타임은 벡터 자소가 있어도 마스크 칠을 찍고(`font-kku.js` 바탕 요소 상태), 코어 마스크 규칙은 벡터로 그린 칸만 뺀다(`font-kku.css` `:not([data-fy-vector-cell])`). 결정은 그대로이고 Decision 첫 항목에 정정 문장을 붙였다
