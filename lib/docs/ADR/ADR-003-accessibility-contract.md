# ADR-003: 접근성 계약 — sr-source + aria-hidden root, role="text" 폐기

## Status
Accepted

## Date
2026-07-09

## Context
font-kku는 원문 음절을 자소 span 트리로 분해해 light DOM에 렌더링한다. 기존 구현은 host에 비표준 `role="text"` + `aria-label`만 설정했다. `role="text"`는 ARIA 표준에 없는 값이라(WebKit 계열만 인식) 다른 브라우저/스크린리더 조합에서는 generic으로 처리되고, 분해 DOM에 `aria-hidden`이 없어 보조기기가 자소 나열(예: '왕' → ᄋ·ᅩ·ᅡ·ᆼ)을 그대로 읽을 수 있었다. 공백은 텍스트 없는 빈 span이라 복사/낭독에서 단어 경계도 소실됐다(심층 리뷰 R-11).

## Decision
- 관리 root(`part="root"`, `data-fy-root="true"`)에 `aria-hidden="true"`를 부여해 분해 DOM 전체를 보조기기에서 숨긴다.
- root의 형제로 `<span part="sr-source" data-fy-sr="true">`를 신설한다. 원문 텍스트를 담고 시각적으로만 숨긴다(sr-only 패턴). 이 노드가 스크린리더 낭독과 복사의 1차 표면이다. 이 결정 당시 part 토큰은 총 19종이었고, 이후 syllable depth의 `head`가 추가돼 현재 목록은 `skills/font-kku/references/web.md`를 따른다.
  → 2026-10-13 보강: 복사는 런타임이 맡는다. sr-source는 낭독의 유일한 표면이고(그대로), 런타임이 그린 root는 자모 단위로 고르며 복사·잘라내기 때
  런타임이 고른 원문을 클립보드에 넣는다. 런타임 없는 정적 HTML에서만 sr-source가 복사 표면이다. 아래 Change Log 참고.
- `aria-label`과 `data-source`는 호환 표면으로 계속 기록한다. → 2026-10-12 보강: 런타임과 정적 렌더러 넷은 `aria-label`을 쓰지 않는다. `data-source`(보조 기술이 읽지 않는 원문 기록)만 남는다. 아래 Change Log 참고.
- 비표준 `role="text"`는 더 이상 설정하지 않는다.
- 부수 효과: state 없는 관리 DOM(clone, SSR 주입)의 원문 복구 폴백 체인이 `data-source` → `sr-source` → `textContent`로 강화된다.

## Alternatives Considered
### Alternative A — host에 role="img" + aria-label
- 설명: 장식적 텍스트 표현을 이미지 패턴으로 노출.
- 장점: 표준 ARIA 패턴, 구현 단순.
- 단점: 복사(select-copy) 경로를 해결하지 못한다. 텍스트가 이미지로 취급돼 점자 디스플레이·텍스트 조작 보조기기에서 의미가 좁아진다.

### Alternative B — role="text" 유지 + aria-hidden만 추가
- 설명: 기존 표면에 aria-hidden만 보강.
- 장점: 변경 최소.
- 단점: 비표준 role 의존이 남고, generic 요소의 aria-label은 accname 계산에서 무시될 수 있어 낭독이 여전히 불안정하다.

## Consequences
### Positive
- 표준 메커니즘(실제 텍스트 노드)만으로 낭독·복사가 원문 기준으로 동작한다.
- 렌더러 static HTML(`render_html`)도 같은 계약을 emit해 브라우저/사이드카 접근성 표면이 일치한다.

### Negative
- 이 결정으로 DOM 노드가 host당 1개 늘고, 당시 part 계약이 18→19종으로 확장됐다(추가만, 제거 없음). 이후 추가 토큰은 별도 변경 이력이다.

### Risks
- `sr-source`를 시각적으로 숨기는 CSS(`font-kku.css`)가 로드되지 않은 환경에서는 원문이 이중 표시될 수 있다 — base CSS 로드는 이미 DOM mode의 전제 조건이다.

## Related Documents
- Architecture: [browser-runtime-design.md](../ARCHITECTURE/browser-runtime-design.md)
- README: [README.md](../../README.md) §DOM Contract
- Review: [docs/REVIEW/2026-07-09-deep-review.md](../REVIEW/2026-07-09-deep-review.md) (R-11, R-12)

## Change Log
- 2026-07-09: 최초 작성 (TRK-030)
- 2026-10-12: 복사 — 관리 root를 `user-select: none`으로 두어 바탕 요소를 고르면 sr-source(원문)만 복사된다. 전에는 그림 쪽 노드 글자(자모로 쪼갠
  `갑ᆺ` 같은 조각)가 줄바꿈과 함께 원문 앞에 섞였다. 그림 위에 선택 강조는 보이지 않는다([ADR-025](ADR-025-hangul-composition-design.md) §12)
- 2026-10-12 보강(공개 0.1.1): 읽히는 글자는 `[part="sr-source"]` 하나다. 런타임·정적 렌더러 넷 모두 바탕 요소에 `aria-label`도 `role`도 쓰지 않는다.
  - 까닭 1: `<font-kku>`·`span`·`div`(generic)와 `p`(paragraph)는 이름을 금지하는 역할이라 거기 붙인 `aria-label`은 ARIA 위반이다. Chromium 접근성 트리에서 이름이 원문과 sr-source 두 갈래로 잡혔다.
  - 까닭 2: 런타임이 렌더할 때마다 `aria-label`을 써서, 작성자가 붙인 라벨(`<button class="font-kku" aria-label="대화 상자 닫기">`)을 덮어썼다.
  - 이제 버튼·링크·제목의 이름은 sr-source 텍스트에서 계산되고(`확인`, `제목`), 작성자의 `aria-label`·`role`(`role="img"` + 라벨 등)은 건드리지 않는다.
  - 넘겨받기: 정적 렌더러 0.1.0·예전 런타임이 그린 트리를 처음 렌더할 때, 그때 붙인 호환 라벨(`aria-label` = `data-source`, `role` 없음)을 지운다. 남겨 두면 글을 바꾼 뒤에도 옛 글이 읽힌다. `role`이 있거나 라벨이 원문과 다르면 작성자 것이라 둔다.
  - sr-source는 `white-space: pre`다(전에는 `nowrap`). 줄바꿈·연속 공백·탭이 복사와 읽기에 그대로 남는다.
  - 계약: `spec/html-cases.json` 1.8이 `aria-label`·`role`을 어휘에 두고 케이스에 두지 않는다(없어야 함). 노드 시험과 스모크 `accessibility`(Chromium 접근성 트리 이름·한 번 읽기)가 본다.
  - 남은 일: VoiceOver·TalkBack·NVDA 손 확인은 사람이 한다.
- 2026-10-13: 선택·복사 — 10-12의 root `user-select: none`은 원문만 복사되게 했지만 그림 위를 끌면 아무것도 고르지 못했다(강조도 없음). 이제
  런타임이 그린 root(`data-fy-select="jamo"`)는 자모 단위로 고르고, 원문 거울(sr-source)은 선택 밖이며(`user-select: none`), 정적 HTML(런타임 없음)은
  root `user-select: none` 그대로다.
  - 강조: 브라우저 자체 강조는 화면 밖으로 민 노드 글자에 칠해져 보이지 않으므로 코어 CSS가 지운다(`::selection` 투명). 문서마다 `selectionchange`
    하나가 프레임에 한 번 고른 것을 `data-fy-selected`로 비추고 코어 CSS가 칠한다 — 바탕 요소 통째는 root, 음절 통째는 글자 칸 띠, 일부는 고른 자모 상자,
    빈칸은 띠. 색은 페이지 변수 `--fy-selection`(기본 시스템 선택 색, 불투명도 0.6까지 — 밝은·어두운 바탕 모두). 자모 노드에 선택 끝이 닿으면 그 자모를 고른다.
    끌기는 자모 노드 상자로 맞힌다 — 기기 글꼴 맞춤의 `::before`(큰 글자 상자)는 포인터를 받지 않고, 빛 칠로 숨긴 노드는 `::after`가 맞으며, 숨긴 노드 안에
    브라우저가 선택 끝을 두지 못하는 것은 끄는 동안 런타임이 끝을 포인터 아래 자모로 옮겨 메운다.
  - 복사·잘라내기(편집 가능한 곳): 같은 대응으로 원문을 넣는다. 자모 일부만 고른 음절은 음절 통째, 빈칸·줄바꿈(`\r\n`·`\r` 포함)은 원문 그대로, 음절은
    NFC. 바탕 요소 밖 글은 브라우저 직렬화 그대로(범위 끝을 원문 거울로 옮기고 root를 잠깐 `display: none` — `data-fy-select="copy"`). `text/html`은
    바탕 요소마다 고른 원문 한 줄. 같은 대응을 `FontKku.sourceRange(host, range)`가 돌려준다. 그림자 트리 안도 같고, 경계를 넘는 선택은 트리마다 잇는다.
  - 낭독은 그대로다: root `aria-hidden`, 읽히는 글자는 sr-source 하나, 런타임은 `aria-label`·`role`을 쓰지 않는다.
  - 세 브라우저 검증 뒤 보강: 바탕 요소 자신의 `::selection`도 투명(WebKit은 그것으로 그림 둘레 줄 틈을 칠해 띠가 두 겹이었다). 같은 원문을
    다시 그리면(`refresh`·글꼴 늦게 옴) 옛 root 안의 선택 끝을 새 root의 같은 자리로 옮긴다(브라우저는 바탕 요소로 접어 고른 것이 사라졌다).
    그림 위를 두 번 누르면 낱말(`[part="word"]`), 세 번이면 문단(`<font-kku>`는 담은 블록, 꾸밈 방식은 그 바탕 요소) — 브라우저는 자모 하나만(WebKit은 아무것도) 골랐다. 페이지가
    누르기를 막으면(`mousedown` `preventDefault`) 끝 옮기기·두세 번 누르기 고르기를 하지 않고, 단추 안은 고르지 않는다. root는 `user-select: inherit`
    (`auto`는 WebKit에서 페이지가 조상에 준 `none` 아래서도 골랐다 — 사이트 메모 편집면·자판처럼 `none`인 곳), 그런 바탕 요소는 전체 선택이 품어도
    강조·복사에서 뺀다. 고른 자모 상자(`::after`)가 `pointer-events: none`이던 것을 풀었다 — 빛 칠 노드는 그것이 유일한 맞는 자리라 고른
    순간 사라져, 끝 옮기기가 브라우저 끌기와 엇갈렸다(WebKit 스모크가 병렬 실행에서 자주 실패).
  - 시험: 노드 시험(범위 → 원문 대응), 스모크 `selection-copy`(끌어 고르기·강조 노드·실제 복사 단축키 클립보드·그림자·다시 그리기·전체 선택·잘라내기,
    Firefox·WebKit도), `design-selection`의 복사 사례(ㅃ 낱자·겹받침·머리 음절)는 복사 이벤트로 본다([ADR-025](ADR-025-hangul-composition-design.md) §12)
- 2026-10-13 보강(런타임 결함 묶음): 낱말 사이 칸(`[part="space"]`, 앞뒤가 낱말)을 코어 CSS가 생성 내용 `" "`(글자 크기 0, 폭은 `word-spacing`)인
  접히는 공백으로 그린다 — 줄을 바꾼 자리의 칸이 다음 줄 첫머리에 남아 한 칸 들여 쓰던 것을 없앴다. DOM은 그대로(빈 span)이고 생성 내용은 고르거나
  복사되지 않으며 root가 `aria-hidden`이라 읽히지 않는다 — 읽히는 글자는 여전히 sr-source 하나다. 고른 칸의 띠는 진행폭 0인 `::before`라 고르기가
  줄바꿈을 바꾸지 않는다. 줄 끝을 지나 끌어 놓으면(Firefox는 끝을 마지막 글자 내용 맨 앞에 둔다) 포인터가 그 글자 칸 가운데보다 뒤일 때 글자 끝으로
  옮겨 마지막 음절까지 고르고 복사한다. 다시 그리기 묶음은 선택을 쓰기 전에 문서마다 한 번 읽는다(Chromium 배치 강제). 스모크 `space-wrap`(세 엔진),
  `selection-copy`의 끝 너머 끌기, `runtime-lifecycle`의 묶음 선택 읽기
- 2026-10-14: 끄는 선택 맞추기(0.1.3 공개 전 탐색). 낱말 사이 칸이 접히는 공백이 된 뒤 바탕 요소 안에 브라우저가 선택 자리를 둘 곳이 줄어
  세 가지가 깨졌다 — 칸·줄 끝 너머에서 놓으면 다음 음절이 끼고(Chromium·WebKit), 빛 칠(neon)은 끌어 고를 수 없고(숨긴 자모 + 칸에 자리 없음),
  Firefox는 런타임이 옮긴 끝을 `getComposedRanges`가 따라오지 않았다. 런타임은 누른 자리(자모·칸·글자 칸)를 기억해 닻이 바탕 요소 밖으로
  나가면 되돌리고, 끝은 포인터 아래 자모·칸 맨 앞으로, 끝이 글자 맨 앞인데 포인터가 그 글자 앞(칸·위 화면 줄)이면 칸 맨 앞·글자 앞으로(원문 줄의
  첫 글자일 때만 앞 줄 끝) 옮긴다. 범위만으로는 '칸 위에서 놓음'과 '다음 글자 앞쪽에서 놓음'이 같은 끝 자리라 포인터로 가른다. 그림자 트리에
  닿지 않는 선택은 `getRangeAt`을 쓴다. Firefox에서 기기 글꼴·그림 세트의 마지막 글자 앞쪽을 놓으면 빠지던 것도 같이 고쳐졌다. 탐침 api-11·api-15·
  matrix-11, 세 엔진 × 다섯 글꼴 끌기 실험
- 2026-10-14: 끄는 선택 맞추기는 브라우저가 그 누르기로 고르기를 시작했을 때만 한다(`selectstart`가 왔고 막히지 않음). 단추 안, 페이지가
  `selectstart`를 막은 곳(jQuery UI `disableSelection`)에서는 끌어도 고르지 않는다. `selectstart`는 composed가 아니라 그림자 트리 안 누르기는
  그 shadow root에서 듣는다. Firefox는 빛 칠의 숨긴 자모를 누르면 `selectstart` 없이 고르지 않아 그때만 숨긴 자모를 누른 것으로 갈음한다.
  Shift+끌기는 브라우저가 지킨 닻으로 늘이는 것이라 닻을 되돌리지 않는다. 그림자 트리 안 선택의 `anchorNode`·`focusNode`는 Chromium·WebKit이
  호스트 자리로 접어 돌려주므로 닻·끝은 `getComposedRanges`와 `direction`으로 읽고, 읽을 수 없으면 맞추지 않는다. 셋째 탐색이 찾은 앞 고침의
  부작용(그림자 트리 끌기가 앞 글로 뒤집힘 api-18, 단추·selectstart api-19, Shift+끌기 api-20). 탐침 api-18~20 세 엔진
- 2026-10-14: 단추·링크·`draggable` 안을 누른 끌기는 `selectstart`가 와도 맞추지 않는다(WebKit은 draggable 안에서도 보낸다, api-27).
  `selectstart` 없이 자모 안 SVG 그림을 누르면(Firefox 그림 세트) 숨긴 자모처럼 고르기 시작으로 본다(xbrowser-17). 끌지 않은 Shift+누르기도
  놓을 때 끝을 맞춘다 — 낱말 사이 칸을 누르면 브라우저가 끝을 다음 음절에 둔다(api-23). 넷째 탐색, 탐침 세 엔진
- 2026-10-19: 끌어 고르기 다시 설계(사용자 "알려진 버그 개선", 로컬 브랜치). 위 2026-10-14 세 차례의 맞추기는 브라우저가 정한 선택 자리를
  고쳐 쓰는 길이라 재료마다 브라우저 캐럿이 달라(빛 칠의 숨긴 자모, 그림 세트의 SVG, gothic의 겹친 자모 상자, 그림자 트리) 덧댈 때마다 다른
  꼴이 깨졌다(넷째 탐색의 api-21·22·24·25·28, matrix-13·14, xbrowser-18·19). 이제 바탕 요소 안을 마우스로 누르면 끌기를 런타임이 맡는다:
  누를 때 그 자리를 닻으로, 끄는 동안 프레임마다와 놓을 때(와 다음 프레임) 포인터 자리를 끝으로 같은 셈(`dragPoint`)이 선택 자리로 바꿔
  `setBaseAndExtent`로 둔다 — 자모 위면 그 자모 맨 앞, 글자·빈칸의 빈 곳이면 가운데를 기준으로 앞·뒤, 줄 끝 너머·줄 사이면 그 화면 줄에서
  포인터 앞 마지막 단위 뒤, 바탕 요소 밖이면 브라우저 캐럿 자리(`caretPositionFromPoint`·`caretRangeFromPoint`). 맞힘은 열린 그림자 트리
  안까지 내려간다. 누르기만 해도 캐럿을 누른 자리에 둔다(이어지는 Shift+누르기의 닻). Shift+누르기는 있던 닻에서 늘인다. 누른 자리와 포인터가
  둘 다 바탕 요소 밖이면, 또는 닻과 끝이 다른 트리면 브라우저 선택 그대로다. `selectstart`·단추·`draggable`·막힌 누르기 규칙(위)은 그대로다.
  남은 것: WebKit은 그림자 트리에 선택이 가 닿을 보이는 글자가 하나도 없으면 범위를 버린다 — 빛 칠의 기기 글꼴 맞춤 노드를 숨기지 않아 고쳤고(2026-10-21, api-25),
  잉크 상자가 없는 빛 칠만 남는다(api-30). 탐침 api-29(누르기 뒤 Shift+누르기)를 더했다
