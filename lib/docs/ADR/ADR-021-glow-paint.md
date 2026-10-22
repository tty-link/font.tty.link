# ADR-021: 빛 칠 — 자른 획 밖으로 빛을 그린다

## Status
Accepted

## Date
2026-10-11

## Context

세벌 배치는 자모 일부를 slot `clip-path`로 자른다(노·두·유의 ㅗ·ㅜ 꼭지나 내림획, 워의 ㅓ, 계의 ㅖ).
기기 글꼴 자모 노드는 글자만 든 잎 요소라 칠과 clip이 한 요소에 있고, CSS는 한 요소에서
그림자·`filter`를 clip보다 먼저 그린다. 그래서 네온처럼 넓은 빛번짐(`text-shadow` 0.3–0.6em)이 자른 선에서
곧게 끊겨, 행사 포스터 '노'의 ㅗ 위에 어두운 상자가 보였다(사용자 지적, 두 차례).

먼저 넓은 빛을 빼고 남은 빛을 자르는 쪽 반대로 미는 완화를 넣었지만, 세로획이 자른 선에 닿아 있어
104px 제목에서는 남은 빛(0.26em ≈ 27px)도 끊겨 보였다. 막힌 대안:

- `mask` + `mask-clip: no-clip` — Chrome이 테두리 상자에서 마스크를 자른다.
- `filter: url(data:…svg#id)`로 글자 묶음에 빛 — WebKit(Safari)이 data: 필터를 무시한다.
- 같은 노드의 `filter: drop-shadow()` — clip보다 먼저 그려져 똑같이 잘린다.
- 자모마다 안쪽 노드를 하나 더 두는 DOM — 공개 DOM 계약과 네 정적 renderer가 바뀐다.

## Decision

1. **빛은 잘린 글자의 부모가 그린다.** 글꼴이 빛번짐을 `--fy-font-glow`(페이지는 `--fy-glow`, drop-shadow
   목록)로 주면 런타임이 바탕 요소에 `data-fy-glow="filter"`를 찍는다(`--fy-sprite-paint` → `data-fy-sprite-paint`와
   같은 길, 꾸밈 class가 바뀌면 다시 읽는다). 코어는 기기 글꼴(`:not([data-fy-material])`) 자모에서
   - 글자를 `::before { content: attr(data-jamo) }`가 그리고 slot clip(`--fy-clip`·slot·role 체인)도 `::before`가 받는다.
   - 자모 노드는 자기 글자를 숨기고 clip 없이 `filter: var(--fy-glow, var(--fy-font-glow))`로
     빛만 그린다 — `filter`는 자른 뒤의 `::before` 모양을 둘러싼다. 기기 글꼴 맞춤(`data-fy-face="device"`, ADR-023)이면 노드
     글자는 이미 `::first-letter { font-size: 0 }`이라 노드를 숨기지 않는다(2026-10-21 — WebKit은 그림자 트리에 선택이 가 닿을
     보이는 글자가 하나도 없으면 범위를 버린다, 탐침 api-25. 숨긴 노드의 잎(통짜 나누기·글꼴 팔레트)도 숨김을 물려받아
     사라졌다, matrix-15). `visibility: hidden`은 잉크 상자가 없는 빛 칠(`--fy-ink-boxes: none`)에만 남는다. 숨긴 노드 안에서 다시 보이는 것은
     `visibility`뿐이라(`::first-line`으로 노드 글자만 지우는 길은 WebKit이 `::before`까지 지워 막혔다) `::before`는
     `visibility: var(--fy-ink-visibility, visible)`이다. 글자를 가리는 쪽 — 글꼴 받는 동안의 root(`data-fy-font-pending`,
     첫 로드 가림막)와 측정 도구 — 은 `--fy-ink-visibility: hidden`도 함께 내린다.
   - 칠(color·외곽선·`text-shadow`·움직임의 배경 띠)은 `::before`가 물려받는다(`background-image`·`background-clip`은
     `inherit`로 넘긴다). DOM·`textContent`·`part`는 그대로다. 바탕 트리는 `aria-hidden`이라 생성 글자를 두 번 읽지 않는다.
2. **표시가 없으면 같은 노드에서 그린다.** 코어 자모 규칙이 `filter: var(--fy-glow, var(--fy-font-glow, none))`를 늘
   걸어, 런타임 없는 정적 HTML에서도 빛은 나온다(그때는 예전처럼 자른 선에서 잘린다).
3. **빛 색은 자모의 `color`를 따른다.** 글꼴 린트는 host 변수를 자모 노드에서 다시 선언하지 못하게 하므로
   역할별 빛 변수를 두지 않고, `drop-shadow`의 색을 `currentColor`와 `color-mix(… currentColor N%, transparent)`로 쓴다.
   neon은 자모 `color`가 빛(초성·받침 분홍, 중성 하늘색), `-webkit-text-stroke-color`가 관, 좁은 `text-shadow`가
   관 속 흰 심이다. 꾸밈 생성기는 `--fy-font-glow`를 칠로 옮겨 `kku-look-neon`도 같다.
4. **페이지 계약.** 네온 빛 색은 자모 `color`로, 빛 모양은 `--fy-glow`로 바꾸고, `--fy-glow: none`이면 끈다
   (바탕 요소에 두면 빛 칠 자체가 꺼지고, 자모에 두면 그 자모의 빛만 꺼진다). 자모 `text-shadow`는 이제
   `::before`의 칠이라 자른 선에서 잘린다 — 넓은 빛은 `--fy-glow`로 준다.

## Consequences

- neon·`kku-look-neon`의 자른 모음이 빛째 자연스럽다. Chrome·WebKit 모두 같은 결과다.
- 꾸밈이 걸린 `shine`은 `filter`를 애니메이션하므로 키프레임이 `brightness() saturate()` 뒤에 빛 값을 이어 붙인다.
  페이지가 `--fy-glow: none`을 주면 그 번쩍임 키프레임은 무효가 되어 번쩍임 없이 그린다.
- 빛 칠 글꼴(`data-fy-glow`, neon)의 `shine`도 같은 번쩍임(`kku-shine-glint`)이다(2026-10-13). 글자 모양으로 오린 바탕의
  띠(`background-clip: text`)는 `::before`가 물려받지만 관 속 흰 심(`text-shadow`)이 그 위를 덮어 화소 변화가 0이었다.
  페이지가 `--fy-glow: none`으로 빛 칠을 끄면 기기 글꼴의 띠로 돌아간다.
- 페이지가 자모 `filter`를 직접 쓰면 빛을 덮는다(페이지가 이긴다).
- 빛 칠 글꼴에서 페이지가 자모 하나를 `visibility: hidden`으로 숨기면 노드 글자만 숨고 `::before`는 남는다.
  자모를 숨길 때는 `opacity: 0`(움직임·효과가 쓰는 방식)이나 `--fy-ink-visibility: hidden`을 쓴다.
- 측정 도구(겹침·획 굵기 감사, 적합·풀이 도구)는 잴 자모만 남길 때 `visibility`를 비우고(코어 값을 따름)
  `--fy-ink-visibility`를 함께 바꾸며, 칠을 검정으로 되돌릴 때 빛 `filter`도 끈다 — 빛 칠 상태 그대로의 기하를 잰다.
- 자소판·벡터 재료는 빛 칠 대상이 아니다(그림 자소의 네온 꾸밈은 글자 묶음 `drop-shadow` 그대로).
- 예전에 자모 `text-shadow`로 네온 빛을 바꾸던 페이지(사례 neon-sign, tty.link neon-bugs)는 `color`로 옮겼다.
