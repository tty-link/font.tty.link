# 확인과 문제 해결

목차: [SKILL.md](https://font.tty.link/lib/skill/SKILL.md)

| 보이는 것 | 까닭과 할 일 |
|---|---|
| 제목이 자모가 흩어진 채(ㄱㅏ ㅇ…)로 보인다 | CSS가 붙지 않았다. 글꼴 이름이 맞는지(콘솔에 "was not found" 경고), 스크립트 주소가 맞는지, `data-fonts`나 `data-addons`가 있는 한 줄 설치로 불렀는지 본다 — [setup.md](https://font.tty.link/lib/skill/setup.md) |
| 글자가 전혀 안 그려지고 원래 글만 보인다 | 런타임 스크립트를 받지 못했다. 주소 오타, 또는 외부 스크립트를 막는 화면(아래 "미리보기 화면") |
| 글꼴 CSS를 받다 실패한다 | `font-kku:loaderror` 이벤트의 `detail: { kind, name, url, error }`로 원인을 보고 `FontKku.retryFont(host)`로 다시 받는다 |
| `kku-look-*`·`kku-vary-*`가 안 먹는다 | 스크립트에 `data-addons="looks"`가 없다 |
| 자모 움직임(`assemble`·`wave`·`flicker`…)이 안 움직인다 | `data-addons="motion"`이 없다. 또는 사용자의 '동작 줄이기' 설정이 켜져 있다(정상) |
| `data-kku-fx`·`FontKkuFx`가 안 된다 | `data-addons="fx"`가 없거나, JS로 건 호출이 `load` 전에 돌았다 — [compose.md](https://font.tty.link/lib/skill/compose.md) |
| 자모가 어긋나거나 겹친다 | 페이지 CSS의 `span { … }` 같은 요소 이름 선택자, 바탕 요소에 직접 준 `font-size`·`line-height`, 자모 `--fy-top`·`--fy-left` 변경을 지운다 |
| 글자가 네모(두부)로 보인다 | 기기에 한글 글꼴이 없다 — 그림 자소 글꼴로 바꾼다([no-hangul-device.md](https://font.tty.link/lib/skill/no-hangul-device.md)) |
| 네온·분필·글리치가 거의 안 보인다 | 바탕이 밝다. 어두운 바탕(또는 어두운 띠) 위에 둔다 — [fonts.md](https://font.tty.link/lib/skill/fonts.md) |
| 그림 자소 글꼴에서 일부 자모가 빈칸이다 | 그 칸을 그리지 않았다 — [draw-jamo.md](https://font.tty.link/lib/skill/draw-jamo.md)의 확인 문장으로 본다 |
| `crayon`·`pilgi`·`dunggeun`·`butgeul`·`jasu`만 안 보인다 | 런타임 파일을 직접 올린 서버가 `Access-Control-Allow-Origin` 헤더를 보내지 않는다(마스크 그림은 이 헤더가 있어야 쓴다) — [setup.md](https://font.tty.link/lib/skill/setup.md)의 "인터넷이 막힌 곳" |
| 첫 화면 제목이 잠깐 비었다 나타난다 | `data-fonts`의 글꼴을 받는 동안(최대 3초) 조립 전 자모를 가려 둔다(정상) |

## 미리보기 화면에서 안 보일 때

대화형 AI의 미리보기(캔버스·아티팩트)나 온라인 편집기는 바깥 주소의 스크립트·스타일시트를 막기도 한다. 폰꾸 런타임은 스크립트를 받은 뒤 같은 주소에서 CSS(`<link rel="stylesheet">`)와 글꼴 파일을 더 받으므로, 스크립트만 열려 있고 스타일시트가 막혀 있으면 자모가 흩어진 채 보인다.

- HTML 파일로 저장해 브라우저에서 직접 열면 대개 해결된다.
- 결과를 낼 때 "미리보기에서 안 보이면 파일로 저장해 브라우저에서 여세요"를 덧붙인다.

## 확인 순서

1. 콘솔 경고("was not found", "failed to load font stylesheet")를 본다.
2. 바탕 요소에 `data-fy-font`가 붙었는지 본다 — 붙었으면 런타임은 돌았다.
3. 모바일 폭 360px에서 제목이 넘치지 않는지 본다.
