# 확인과 문제 해결

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

| 보이는 것 | 까닭과 할 일 |
|---|---|
| 안드로이드·윈도우에서만 자모 자리가 어긋나 보인다 | `sebul`·`gothic`은 기본으로 자모를 CSS 획(원소 재료)으로 그려 기기와 무관하다 — `FontKku.fontInfo(요소).face`가 `"element"`인지 본다. 기기 글꼴로 그리는 글(꾸러미 글꼴, `--fy-face: device`)은 런타임이 그 기기의 한글 글꼴을 재서 맞춘다: 페이지 CSS가 `--fy-ink-boxes: none`을 주지 않았는지, `face`가 `"device"`인지 본다. 캔버스 읽기를 막는 브라우저(지문 방지)에서는 맞추지 못한다 |
| 원소 재료의 획이 너무 가늘거나 굵다 | 페이지 CSS `--fy-element-width`(바탕 요소 글자 크기 기준, sebul 기본 0.1em·gothic 0.072em). 굵기를 바꿔도 잉크는 같은 자리 안에 머문다. 끝은 `--fy-element-cap: round`·`butt` |
| 원소 재료의 속 빈 꾸밈(네온·도면·외곽선)에 획이 겹친 안쪽 선이 보인다 | 원소 재료는 획마다 그려 겹친 자리의 테두리가 보인다(도면의 작도선처럼). 매끈한 속 빈 글자가 필요하면 그 글에 `--fy-face: device` |
| `text-shadow`·`-webkit-text-stroke`·`--fy-weight`가 안 먹는다 | 글꼴을 비운 글과 `sebul`·`gothic`·`malang`은 자모를 CSS 획(원소 재료)으로 그려 글자 칠이 듣지 않는다. 그림자·테두리는 `[part="glyph"] { filter: drop-shadow(…) }`, 굵기는 `--fy-element-width`, 속 빈 획은 `--fy-element-outline` + `--fy-element-fill: transparent` — [custom-font.md](https://font.tty.link/lib/skill/custom-font.md). 글자 칠을 꼭 써야 하면 `--fy-face: device` |
| 0.1.0으로 만든 페이지에서 제목 모양이 바뀌었다(같은 자모가 늘 같은 자리, 받침 자리가 빈다, 획 모양이 다르다, 그림자·굵기가 사라졌다) | 0.1.1부터 글꼴을 밝히지 않은 `<font-kku>`·`class="font-kku"`가 세벌 고정이고, `sebul`·`gothic`·`malang`은 자모를 기기 한글 글꼴 대신 CSS 획(원소 재료)으로 긋는다. 예전 배치는 `font="sebul"`(`data-font="sebul"`), 예전 모양까지는 거기에 `--fy-face: device` — 그러면 `text-shadow`·`--fy-weight`도 다시 듣는다([fonts.md](https://font.tty.link/lib/skill/fonts.md)「배치」). CDN 주소에 판을 박아 두었으면(`@0.1.0`) 직접 올리기 전까지 바뀌지 않는다 |
| 0.1.1에서 0.1.2로 올리니 글꼴을 밝히지 않은 제목 모양이 바뀌었다(받침이 붙고 세로 모음이 길다) | 정상. 세벌 고정 배치를 다시 지었다(revision 2) — 받침이 음절에 붙고 줄끼리 겹치지 않는다. 되돌리는 옵션은 없다. 저장한 디자인의 `layout.revision: "1"`은 그대로 받고 경고 `DESIGN_LAYOUT_REVISION_ACCEPTED`를 남긴다 |
| 바탕 요소의 `aria-label`이 없어졌다 | 정상(0.1.1부터). 낭독기는 원문을 sr-source 하나로 한 번 읽고, 버튼·링크 이름도 원문에서 정해진다. 직접 단 `aria-label`·`role`은 그대로 둔다 — [setup.md](https://font.tty.link/lib/skill/setup.md)「읽기·복사」. 원문을 코드에서 읽으려면 `data-source` |
| `--fy-design`을 걸었는데 그대로다 | 바탕 요소의 `data-fy-design-status`(= `FontKku.fontInfo(host).designStatus`)를 본다. `DESIGN_NOT_REGISTERED` — 그 이름을 아직 `registerDesign`하지 않았다(등록하면 바로 다시 그린다). `DESIGN_TOKEN_INVALID` — 이름 문법(소문자·숫자·`-`). `DESIGN_UNSUPPORTED_FONT` — 그림 자소 글꼴(`pixel`·`butgeul`·`sprite-system` …)이나 표준 잉크 상자가 없는 글꼴이라 디자인을 받지 않는다. 글꼴을 비우거나 `sebul`·`gothic`에 건다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)「디자인」 |
| `registerDesign`이 오류를 던진다 | `error.code`·`error.path`를 본다. 모두 보려면 `FontKku.validateDesign(json).errors`. `DESIGN_NAME_TAKEN` — 같은 이름에 다른 내용(`{ replace: true }`로 바꾼다). `DESIGN_FIXED_CONTEXT`·`DESIGN_FIXED_COMPOUND`·`DESIGN_FIXED_VARIATION` — 세벌 고정 디자인에 짜임별 규칙·합자 모음 통째 그리기·자리마다 변주. `DESIGN_LAYOUT_MISSING` — `version: "1.2"`에 `layout`이 없다. `DESIGN_LAYOUT_REVISION` — `layout.revision`이 `FontKku.layoutProfiles[프로파일].revision`과 다르다. `DESIGN_RULE_MATCH` — `match.vowelLayout`·`hasFinal`에 `role`이 없다. `DESIGN_NAME_INVALID` — 이름에 `_`·빈칸·한글이 있거나 `-`로 시작하거나, `legacy`·`none`·CSS 전역 키워드다 |
| 세벌 고정인데 같은 자모가 글자마다 다르게 놓인다 | 페이지 CSS가 이웃 자모나 짜임을 보고 자모를 옮겼다. `FontKku.layoutStability(host)`의 `drifted`가 어긋난 자모를 알려 준다 |
| 제목이 자모가 흩어진 채(ㄱㅏ ㅇ…)로 보인다 | CSS가 붙지 않았다. 글꼴 이름이 맞는지(콘솔에 "was not found" 경고), 스크립트 주소가 맞는지, `data-fonts`나 `data-addons`가 있는 한 줄 설치로 불렀는지 본다 — [setup.md](https://font.tty.link/lib/skill/setup.md) |
| 글자가 전혀 안 그려지고 원래 글만 보인다 | 런타임 스크립트를 받지 못했다. 주소 오타, 또는 외부 스크립트를 막는 화면(아래 "미리보기 화면") |
| 글꼴 CSS를 받다 실패한다 | `font-kku:loaderror` 이벤트의 `detail: { kind, name, url, error }`로 원인을 보고 `FontKku.retryFont(host)`로 다시 받는다 |
| `kku-look-*`·`kku-vary-*`가 안 먹는다 | 스크립트에 `data-addons="looks"`가 없다 |
| 자모 움직임(`assemble`·`wave`·`flicker`…)이 안 움직인다 | `data-addons="motion"`이 없다. 또는 사용자의 '동작 줄이기' 설정이 켜져 있다(정상) |
| `data-kku-fx`·`FontKkuFx`가 안 된다 | `data-addons="fx"`가 없거나, JS로 건 호출이 `load` 전에 돌았다 — [compose.md](https://font.tty.link/lib/skill/compose.md) |
| 자모가 어긋나거나 겹친다 | 페이지 CSS의 `span { … }` 같은 요소 이름 선택자, 바탕 요소에 직접 준 `font-size`·`line-height`, 자모 `--fy-top`·`--fy-left` 변경을 지운다 |
| 글자가 네모(두부)로 보인다 | 기기에 한글 글꼴이 없는데 기기 글꼴로 그리는 글(꾸러미 글꼴 `neon`·`sticker` …, `--fy-face: device`)이다 — 글꼴을 비우거나 `sebul`에 같은 꾸밈 클래스(`kku-look-*`)를 걸거나 그림 자소 글꼴로 바꾼다([no-hangul-device.md](https://font.tty.link/lib/skill/no-hangul-device.md)) |
| 네온·분필·글리치가 거의 안 보인다 | 바탕이 밝다. 어두운 바탕(또는 어두운 띠) 위에 둔다 — [fonts.md](https://font.tty.link/lib/skill/fonts.md) |
| 그림 자소 글꼴에서 일부 자모가 빈칸이다 | 그 칸을 그리지 않았다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)의 확인 문장으로 본다 |
| `crayon`·`pilgi`·`dunggeun`·`butgeul`·`jasu`만 안 보인다 | 런타임 파일을 직접 올린 서버가 `Access-Control-Allow-Origin` 헤더를 보내지 않는다(마스크 그림은 이 헤더가 있어야 쓴다) — [setup.md](https://font.tty.link/lib/skill/setup.md)의 "인터넷이 막힌 곳" |
| 그린 글자를 끌어도 골라지지 않는다 | 런타임이 그 페이지에서 돌지 않았다 — 스크립트 없이 저장한 정적 HTML이면 정상이다(골라 복사하면 원문만 나온다). 아니면 페이지 CSS가 바탕 요소나 그 조상에 `user-select: none`을 주지 않았는지 본다 |
| 복사하면 자모 조각(`ᄒ`·`ᅡ`·`ᆫ`)이 줄바꿈과 섞여 나온다 | 페이지의 다른 복사 처리기가 먼저 `getSelection().toString()`으로 클립보드를 채웠다. 그 처리기를 지우거나, 원문은 `FontKku.sourceRange(요소, 범위)`로 읽는다 — [styling.md](https://font.tty.link/lib/skill/styling.md)의 "고르기와 복사" |
| 첫 화면 제목이 잠깐 비었다 나타난다 | `data-fonts`의 글꼴을 받는 동안(최대 3초) 조립 전 자모를 가려 둔다(정상) |

## 미리보기 화면에서 안 보일 때

대화형 AI의 미리보기(캔버스·아티팩트)나 온라인 편집기는 바깥 주소의 스크립트·스타일시트를 막기도 한다. 폰꾸 런타임은 스크립트를 받은 뒤 같은 주소에서 CSS(`<link rel="stylesheet">`)와 글꼴 파일을 더 받으므로, 스크립트만 열려 있고 스타일시트가 막혀 있으면 자모가 흩어진 채 보인다.

- HTML 파일로 저장해 브라우저에서 직접 열면 대개 해결된다.
- 결과를 낼 때 "미리보기에서 안 보이면 파일로 저장해 브라우저에서 여세요"를 덧붙인다.

## 확인 순서

1. 콘솔 경고("was not found", "failed to load font stylesheet")를 본다.
2. 바탕 요소에 `data-fy-font`가 붙었는지 본다 — 붙었으면 런타임은 돌았다. 배치·재료·디자인은 `data-fy-layout`(세벌 고정이면 `sebul-fixed-v1`)·`data-fy-face`·`data-fy-design-status`, 한 번에 보려면 `FontKku.fontInfo(host)`.
3. 모바일 폭 360px에서 제목이 넘치지 않는지 본다.
