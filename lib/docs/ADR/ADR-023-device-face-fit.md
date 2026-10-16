# ADR-023: 기기 글꼴 맞춤 — 표준 잉크 상자에 자모를 맞춘다

## Status
Accepted

## Date
2026-10-11

## Context

기기 글꼴 재료(`sebul`·`gothic`과 파생 글꼴 11종)의 배치 값(slot·자모·문맥)은 macOS의 Apple SD Gothic Neo가
그리는 조합용 자모(U+1100–11FF)의 잉크 자리에 맞춰 잰 값이다(round7–8 실측). 배치 값은 자모 글자의 **상자**를
놓을 뿐이고, 그 상자 안 어디에 잉크가 찍히는지는 글꼴이 정한다. 그래서 다른 한글 글꼴이 그리면 같은 배치 값에서
잉크가 다른 곳에 찍힌다.

사용자가 Android(삼성 폰)에서 font.tty.link 소개 페이지 제목의 자모 조합이 어긋난다고 알려 왔다. Android는 스택
`"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`의 이름이 하나도 맞지 않아 `sans-serif`가
쓰인다. 줄 상자의 기준선은 Roboto가 정하고, 한글은 시스템 대체 글꼴(삼성 One UI Sans KR, 그 밖 Noto Sans CJK)이
그린다. Chromium에 Roboto와 Noto Sans CJK KR을 실어 재현했다.

- 기준선이 0.04em 내려간다(Roboto ascent·descent 0.928/0.244 vs Apple SD 0.9/0.3).
- Noto Sans CJK의 조합용 자모는 음절 안 제자리에 작게 놓인 **위치형** 모양이다. 세벌·고딕이 완전히 흩어졌다.

글꼴마다 위치를 따로 두는 길(`local()` 별칭 + `size-adjust`·`ascent-override`, 플랫폼별 교정 블록)은 글꼴 전체의 크기와
기준선만 맞추거나, 기기 글꼴을 모두 알아야 한다. 사유 글꼴(One UI Sans)은 잴 수도 없다. 필요한 것은 특정 글꼴이 아니라
**자모마다 잉크가 놓일 표준 자리**다.

## Decision

1. **표준 잉크 상자를 정본으로 둔다.** `spec/jamo-ink-boxes.json`은 기기 글꼴 자모 노드에 들어가는 글자 124개(조합용 초성 19·
   중성 21·종성 27과, 합자 모음을 음절 깊이로 그릴 때의 머리 음절 57)마다 잉크가 차지할 [왼쪽, 위, 오른쪽, 아래](em, 노드 왼쪽 위
   원점)와 전진폭·기준 획 굵기를 담는다. 값의 출처는 Apple SD Gothic Neo(2026-10-11, `scripts/build_ink_boxes.py --measure`)이지만,
   이제는 이 표가 정본이고 글꼴 CSS의 배치는 이 상자를 전제로 한다. 런타임은 생성 구간(`build_ink_boxes.py --write`)의
   압축 사본을 쓰고, verify `Ink boxes`가 둘을 대조한다.
2. **글꼴이 표준 상자를 밝힌다.** 기기 글꼴 재료의 글꼴 CSS는 `--fy-font-ink-boxes: standard`를 선언한다(`sebul`·`gothic`, 파생
   글꼴은 생성기가 복사). 페이지의 `--fy-ink-boxes`가 이기고 `none`이면 끈다 — 기기 글꼴의 조합용 자모를 그대로 그린다.
3. **어느 기기에서나 맞춘다.** 기기 글꼴이 무엇이든(Apple SD·Noto Sans CJK·One UI Sans·맑은 고딕) 바탕 요소에
   `data-fy-face="device"`를 찍고, 자모 노드마다 그 글꼴의 잉크 상자를 재서 표준 상자로 옮기는 값을 inline 변수로 적는다 —
   `--fy-face-glyph`(그릴 글자), `--fy-face-size`, `--fy-face-x`·`-y`, `--fy-face-scale-x`·`-y`, `--fy-face-width`.
   코어 CSS는 이 바탕 요소의 기기 글꼴 자모를 이렇게 그린다.
   - 글자는 `::before`가 그린다. 그 글꼴의 조합용 자모가 이미 표준 상자에 있으면(네 변 ±0.02em) 그 글자를, 아니면 **낱자(호환
     자모, ㄱ·ㅏ)** 를 그린다 — 낱자는 어느 글꼴에서나 제 크기의 온전한 모양이다(ADR-024 §6). 머리 음절은 그 음절 그대로다.
   - 낱자 상자 C를 표준 상자 R로 옮기는 x' = s·x + t에서, 고른 배율 k = √(sx·sy)는 `::before`의 글자 크기로 준다. 남은
     가로·세로 비만 `scale`로 준다. transform만으로 키우면 외곽선(`--fy-font-stroke`)과 굵기가 함께 커져 작은 글자의 획을 메운다.
   - 자모 노드는 표준 전진폭(`--fy-face-width`)을 갖는다. slot clip(퍼센트 inset)은 노드 상자에서 맞춘 뒤의 글자를 자른다.
   - 노드 자기 글자는 제자리에서 `::first-letter { font-size: 0 }`으로 숨긴다(2026-10-13). `visibility`로 숨기면 `::before`가
     조상의 숨김을 따르지 못한다(소개 페이지에서 높이를 잡는 숨은 문장이 그대로 보였다). 처음에는 `text-indent`로 시작 쪽 화면 밖
     (−9999em)에 밀었는데, 자모나 바탕 요소가 돌면(기울기 변주·말랑·회전한 제목) 밀어 둔 글자가 아래쪽 스크롤 영역을 수만 px
     늘렸다(소개 페이지 2.8천 px, 움직임 목록 23만 px). 색으로는 숨길 수 없다 — `::first-letter`는 `-webkit-text-fill-color`를
     받지 않아 꾸밈이 채움 색을 주면 비쳤다.
   - 세벌 고정(ADR-026)의 도장 노드는 도장 text-stroke(획 굵기 보정)의 절반만큼 표준 상자를 안으로 줄여 맞춘다 — 획 넓힘까지 표준
     상자 안이라 원소 재료와 같은 잉크 자리다(`stampInset`, 뷁·쀍·꿩의 뭉침).
   - 빛 칠(ADR-021)과 겹치면 숨김과 clip은 빛 칠대로 둔다(노드 `visibility`, `::before`의 clip).
4. **재는 법.** 잉크 상자는 캔버스에 400·100px로 그린 화소를 훑어 잰다(알파 절반 이상). WebKit의 `measureText`는
   actualBoundingBox의 좌우를 잉크가 아니라 전진폭으로 돌려준다. 기준선은 `line-height: 1` 줄 상자의 DOM 탐침으로 잰다(첫 글꼴의
   ascent·descent가 정한다). 결과는 글꼴 목록과 글자별로 캐시한다.
5. **웹 글꼴은 받은 뒤 다시 잰다.** 받는 중인 글꼴은 `document.fonts`의 FontFace 상태(`loading`)로 찾아 기다린 뒤 캐시를 비우고
   맞춘 노드의 값을 다시 적는다. WebKit은 `loadingdone`을 보내지 않고, 받는 중에도 `fonts.check()`가 true여서 둘 다 쓰지 않는다.
6. `fontInfo(host).face`가 `"device"` 또는 null이다(재료 축은 ADR-024에서 `element`를 더했다).

## Consequences

- Android·Windows·Linux·macOS 어디서나 세벌·고딕과 파생 글꼴(네온·스티커·말랑·금박·글리치·레트로·색동·리소·도면)이 같은
  자리로 조합된다. 획 모양은 그 기기 글꼴의 낱자다. 꾸밈(외곽선·그림자·그라데이션·빛)과 씨앗 변주는 `::before`가 물려받는다.
- macOS에서도 같은 경로로 그린다. Apple SD의 조합용 자모는 표준 상자 그대로라 원래 렌더와 같다(시각 기준선 차이 0). `spec/html-cases.json`은 속성 화이트리스트로 직렬화하므로 `data-fy-face`·`--fy-face-*`는 계약 밖의
  런타임 표현층이다. 정적 renderer 출력(런타임 없음)은 맞추지 않는다.
- 처음 보는 글자마다 캔버스 화소를 한 번 읽는다(200×200).
- 캔버스 읽기를 막는 환경(지문 방지)에서는 잴 수 없어 노드에 값을 적지 못한다. 그때는 조합용 자모를 그대로 그린다(예전 모양).
- 빛 칠과 겹친 바탕 요소의 clip은 맞추기 전 좌표에서 자른다. 표준 상자와 많이 다른 글꼴에서는 자른 선이 조금 어긋날 수 있다.
- 페이지가 `--fy-font-family`를 다른 한글 웹 글꼴로 바꿔도 표준 자리에 맞춘다. 자기 글꼴의 조합용 자모에 맞춰 배치를 다시
  잰 글꼴 CSS는 `--fy-font-ink-boxes: none`을 선언한다.
- 런타임 gzip이 약 4KB 늘었다(전송 예산 40KB → 46KB, 예산은 참고값).
- 실기기 확인이 남았다. One UI Sans KR(삼성)은 사유 글꼴이라 재현하지 못했다. Roboto+Noto Sans CJK(Chromium·WebKit)와
  macOS의 다른 한글 글꼴(AppleMyungjo)로 확인했고, 뒤의 것은 Playwright 스모크가 지킨다(음절 잉크 0.05em 이내).
- 이 표준 상자가 자모와 음절 사이의 약속이 되어, 기기 글꼴 말고 다른 재료(CSS 원소, SVG 그림)도 같은 상자에 맞춰 그릴 수 있다 —
  [한글 원리 렌더링 설계안](../PLAN/hangul-principle-rendering.md).

## Alternatives Considered

### 교정 기준 글꼴과 다를 때만 맞추기
- 처음 구현은 표본 5자로 Apple SD와 같은 글꼴인지 보고 다를 때만 맞췄다. macOS DOM이 바이트 그대로라는 장점이 있었다.
- 하지만 "기준 글꼴"이라는 개념이 설계에 남고, 기기마다 경로가 둘로 갈린다. 사용자 결정(2026-10-11)으로 항상 맞추고,
  기준을 글꼴이 아닌 표준 상자 표로 바꿨다.

### `local()` 별칭 + `size-adjust`·`ascent-override`
- 글꼴 전체의 크기와 기준선만 맞춘다. Noto Sans CJK처럼 자모마다 자리가 다른 글꼴은 못 맞춘다.
- 기기 글꼴을 이름으로 알아야 한다. Android는 대체 글꼴을 이름으로 내주지 않는다.

### 플랫폼별 교정 블록
- 플랫폼과 제조사마다 배치 값을 따로 잰다. 사유 글꼴은 잴 수 없고, 교정을 고칠 때마다 블록이 늘어난다.

### 한글 웹 글꼴을 함께 배포
- 어느 기기에서나 같은 모양이다. 하지만 외부 요청이 없고 글꼴 파일을 받지 않는다는 제품 원칙에 어긋난다.

### 조합용 자모를 그대로 두고 상자만 맞추기
- Noto Sans CJK의 조합용 자모는 작다. 상자를 키우면 외곽선과 굵기가 획 사이를 메워 검은 네모가 되었다.

### 노드를 `visibility: hidden`으로 숨기고 `::before`만 보이기(빛 칠 방식)
- `::before`가 조상의 `visibility`를 따르지 못해, 숨은 문장과 글꼴을 받는 동안의 가림이 새었다.

### 노드 자기 글자를 `text-indent: -9999em`으로 밀기(0.1.0–0.1.1)
- 자모나 바탕 요소가 돌면 밀어 둔 글자가 아래쪽 스크롤 영역을 늘렸고, 빛 filter 영역도 그 글자까지 넓어져 느렸다(2026-10-13).
  `::first-letter`의 글자 색으로 숨기기도 안 된다 — `-webkit-text-fill-color`를 받지 않아 꾸밈이 채움 색을 주면 비쳤다.
