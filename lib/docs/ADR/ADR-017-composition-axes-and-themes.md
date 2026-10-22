# ADR-017: 조합 체계 — 여섯 축과 테마

## Status
Accepted

## Date
2026-10-10

## Context
- 글꼴 페이지에는 글꼴 18종이 한 줄로 늘어서 있었다. 그런데 그중 대부분은 세벌·고딕·그림 자소 위에 칠(네온·스티커·금박…)을 얹은 파생 글꼴(ADR-010)이었다. 글꼴의 뼈대, 칠, 씨앗 변주, 움직임이 한 목록에 섞여 체계가 없어 보였다.
- 사용자는 "글꼴은 글꼴대로, 효과는 효과대로 여러 가지 만들고 둘을 조합(선택)하는 방식, 아니면 테마처럼 미리 조합한 프리셋"을 요청했다(2026-10-10). 제안한 여섯 축과 테마의 이름·범위를 그대로 승인했다.
- 파생 글꼴은 한 가지 칠을 한 가지 뼈대에만 묶는다. 네온 칠을 고딕이나 그림 자소에 쓰려면 글꼴을 또 하나 만들어야 했다(뼈대 수 × 칠 수). 움직임은 페이지마다 따로 복사한 CSS·JS(`jamo-assemble`, 효과 페이지의 카드별 코드)였다.

## Decision

### 1. 여섯 축과 테마
| 축 | 정하는 것 | 쓰는 법 | 원천 |
|---|---|---|---|
| 글꼴 | 뼈대 — 짜임(자모 배치) × 획(재료·획 표현) | `font="sebul"` | `profiles/*.css` |
| 꾸밈 | 칠 — 색·외곽선·그림자, 자모 역할별 | `class="kku-look-neon"` | `font-kku-looks.css` |
| 변주 | 씨앗 — 자모마다, 그릴 때마다 조금씩 | `seed="auto" jamo-seeds class="kku-vary-tilt"` | `font-kku-looks.css` |
| 움직임 | 애니메이션 — 글자 또는 자모 단위 | `animate="wave"` | `font-kku.css`(글자) · `font-kku-motion.css`(자모) |
| 상호작용 | 입력 반응 — 타자·흩기·자석·섞기 | `data-kku-fx="magnet"` | `font-kku-fx.js` |
| 바탕 | 꾸밈이 사는 배경 | 페이지 배경 | 권장값 |

**테마**는 축을 고른 조합에 붙인 이름이다(`neon-sign` = 세벌 + 네온 꾸밈 + 깜빡임 + 어두운 바탕). 테마는 런타임 옵션이 아니라 조합법이다. 화면과 문서는 같은 결과를 속성·클래스로 풀어 보여 준다.

### 2. 정본 `spec/themes.json`과 생성기
- `spec/themes.json`이 축의 목록(`fonts`·`textures`·`looks`·`variations`·`motions`·`interactions`·`tones`)과 `themes`의 정본이다.
- `scripts/build_looks.js --write`가 이 파일로 두 가지를 만든다. `--check`는 `npm test`가 돈다.
  - `font-kku-looks.css` — 꾸밈·변주 클래스
  - `authoring/themes-data.js` — 데모 사이트용 미러. `file://`에서는 JSON을 fetch할 수 없어서 둔다. 테마마다 풀어 둔 조합법(`recipes`: 글꼴·클래스·씨앗·animate·fx·필요한 확장)이 들어 있다.
- 정본 대조:
  - `spec/fonts.json`의 모든 글꼴은 글꼴 축(`fonts`)에 있거나 어떤 테마의 `shortcut`이어야 한다.
  - 테마가 가리키는 글꼴·꾸밈·변주·움직임·상호작용·바탕은 모두 있어야 한다.
  - 움직임 이름은 `font-kku.css`(core)나 `font-kku-motion.css`(motion)에 `[data-fy-animate="…"]` 규칙이 있어야 한다.
  - 변주 목록은 생성기의 클래스와 같아야 한다.

### 3. 꾸밈 — `kku-look-*`
- **원천은 하나.** 꾸밈은 둘 중 하나다.
  - `from: "<파생 글꼴>"`: 그 글꼴의 손으로 쓴 칠(END GENERATED 뒤 `font-kku.font` 레이어 규칙)을 `:where([data-fy-font="X"])`에서 `:where(.kku-look-X)`로 옮긴다.
  - `paint`: 정본에 적은 칠(`host`·`jamo`·`choseong`·`jungseong`·`jongseong` → 선언).
  - 칠 속성(글꼴 린트의 칠 허용 목록)과 `--fy-font-stroke`만 옮긴다. 자모 레이어의 기하(말랑 기울기, 씨앗 기울기)는 칠이 아니라서 글꼴에 남는다.
  - 씨앗 조건(`[data-fy-jamo-seeds="true"]`)은 그대로 따라간다.
- **레이어.** `@layer font-kku.font, font-kku.jamo, font-kku.context, font-kku.look;` — 꾸밈은 모든 글꼴 레이어 뒤, 레이어 밖 페이지 CSS 앞이다. 페이지가 언제나 마지막 말을 한다.
- **섞지 않고 바꾼다.** 꾸밈마다 먼저 칠을 초기화한다. 바탕 요소는 글자색을 상속하고 그림자를 끈다. 자모 노드는 칠을 상속으로 되돌린다. 그래서 칠이 있는 글꼴(예: 분필)에 꾸밈을 걸어도 두 칠이 섞이지 않는다.
- **재료별로 다르게 칠한다.**
  - 기기 글꼴(`data-fy-material` 없음): 칠 전부.
  - 그림 자소·벡터 자소(`[data-fy-material]`): 색만 칠한다. 바탕 요소에 `--fy-sprite-paint: mask`를 걸어(ADR-014) 자소판 알파는 획 질감으로 남기고 `color`로 채운다. 속 빈 꾸밈(채움이 투명)은 외곽선 색으로 채운다. 그림자는 정본의 `sprite.glyphFilter`를 글자(`[part="glyph"]`)의 `drop-shadow`로 옮긴다. 자모 노드의 filter는 마스크보다 먼저 적용되므로 거기에는 줄 수 없다.
  - 원소·SVG 재료(`[data-fy-face="element|svg"]`, 2026-10-13): 획은 CSS 상자·그림이라 글자 칠이 닿지 않는다. 색은 그림 자소처럼 주고, 그 밖의 칠은 꾸밈의 `element` 구간이 **자모마다** 준다 — 획마다 외곽선을 그리면 겹친 획의 안쪽 선이 보여 ㅂ이 田, ㄹ이 사다리가 되고(네온·도면·외곽선), 글자 단위 그림자 하나로는 역할마다 다른 칠(스티커 테두리·글리치 어긋남)이 사라졌다.
    - `rim`·`core`(속 빈 꾸밈은 필수): 획을 옅은 속 칠(`core`)로 칠하고 자모 노드의 그림자 넷(가로·세로 `rim`)이 겹친 획 전체를 한 덩어리로 넓혀 바깥 윤곽만 그린다. 획은 `rim`의 두 배만큼 좁혀 바깥 굵기가 글꼴 굵기와 같다. 반투명 속은 테두리 그림자까지 옅게 만들어, 꾸밈 바탕색에 미리 섞은 불투명 속을 쓴다(도면).
    - `glow`(문자열 또는 역할별): 자모 노드 filter. 코어가 자모 노드에 `filter: var(--fy-glow, var(--fy-font-glow))`를 획 자르기 뒤에 걸어, 꾸밈은 `--fy-font-glow`로 준다(레이어 안 `filter`는 코어 규칙을 못 이긴다). 빛 색은 자모 색(currentColor)을 따른다.
    - `glyphFilter`: 한글 글자(`[data-hangul="true"]`)의 글자 단위 filter(없으면 `glow`·`rim`이 있을 때 끈다). 비한글 글자는 `sprite.glyphFilter` 그대로.
    - `paint`(역할별 `color`·`opacity`): 불투명 잉크에 자모 단위 투명도 — 반투명 잉크를 획마다 칠하면 겹친 이음매가 진해진다(리소).
    - 세벌 고정(ADR-026)의 기기 글꼴 재료에서는 도장의 text-stroke(굵기 보정)가 글꼴 레벨 외곽선을 이겨, 속 빈 꾸밈이 도장 노드에 자기 선 폭(`--kku-look-stroke` → `--fy-stroke`)을 건다.
- **외곽선 폭은 빈자리만 채운다.** 꾸밈의 `--fy-font-stroke`는 폰트 레벨 획 폭이 없는 글꼴(gothic)의 외곽선이다. 스스로 선언한 글꼴(sebul의 획 굵기 보상 0.014em 등)은 같은 레이어 뒤쪽 규칙이 제 값을 되돌린다.
- **검증.** 꾸러미 글꼴 8종(`neon`·`sticker`·`geumbak`·`glitch`·`retro`·`saekdong`·`riso`·`blueprint`)과 `font="<기반>" class="kku-look-<id>"`의 자모 노드 계산 칠이 씨앗 없이도, 씨앗을 켜도 모두 같다(색·채움·외곽선 색·외곽선 폭·그림자·칠 순서·불투명도).

### 4. 변주 — `kku-vary-*`
- 기울기(`tilt`), 들썩임(`bob`), 굵기(`weight`), 너비(`width`), 색조(`hue`), 농담(`ink`) 여섯 가지다. `jamo-seeds`를 켠 바탕 요소에서만 움직인다. 식은 자모 노드의 `--fy-jamo-seed`(0–1)를 읽는다. 폭의 정본은 `font-kku-looks.css`다.
- 변주는 페이지 레벨 보정만 쓴다(`--fy-rotate`, `--fy-scale-x`, `--fy-stroke`, 개별 속성 `translate`, `filter`, `opacity`). 그래서 글꼴의 자모·문맥 보정에 대체가 아니라 덧셈으로 더해진다.
  - 굵기는 글꼴의 획 폭(slot·역할·폰트 레벨 보상)을 읽어 그 위에 씨앗만큼 더한 값을 `--fy-stroke`로 준다 — sebul의 굵기 보상을 지우지 않는다. 기기 글꼴만이다(그림 자소는 자소판 그림이 획을 정한다, 정본 `materials: ["system"]`).
  - 너비는 초성(완성형 head 포함)과 받침(겹받침은 왼쪽 조각)만 `--fy-scale-x`로 좁힌다. 기준점이 상자 왼쪽이라 오른쪽 모음·받침 조각에서 멀어지고, 그림 자소에도 닿는다.
  - 그림 자소의 색조는 코어가 자모 노드의 filter를 쓰므로 페이지 전용 `--fy-sprite-filter`로 준다. 기기 글꼴·원소 재료의 색조는 그 노드의 `--fy-glow`(색조 + 글꼴·꾸밈의 빛)로 준다 — 꾸밈 레이어의 `filter`는 코어 규칙을 못 이겨 0.1.0부터 돌지 않았다(2026-10-13).
  - 원소·SVG 재료의 굵기는 획 굵기 배수 `--fy-element-weight`(0.91–1.21배)로 준다 — 글자 외곽선이 없다.
- **겹침에서 정한 모양**(`tests/overlap-policy.json`의 `variations`: 기하 변주를 모두 함께 걸고 씨앗 2개로 재며, 판정은 그 글꼴 항목의 임계·예외다):
  - **기울기**: 세로 모음 옆 초성(`tlo`·`tlc`)만 기운다. 처음 안은 세로 모음과 합자 자리까지 ±3°였는데, 고딕 '꽤' 20.4%, 말랑 '셊' 17.2%, 그림 자소 '외' 15.2%가 걸렸다. ±2.5°에서는 굵은 획의 둥근 '쩺' 15.1%가 걸렸다. 그런데 ±2°는 작은 글씨에서 거의 보이지 않았다(검토 R3). 그래서 방향을 정했다. 코어는 자모를 왼쪽 위 모서리 기준으로 돌린다. 시계 방향으로 돌리면 오른쪽은 아래로, 아랫부분은 왼쪽으로 가서 모음에서 멀어진다. 받침 없는 `tlo`는 시계 방향으로만 0–6°, 아래에 받침이 있는 `tlc`는 ±1.5°다.
  - **말랑은 기울기 변주를 받지 않는다**(정본 `variations.tilt.skipFonts` + `skipReason`, 생성 CSS의 `:not([data-fy-font="malang"])`). 초성을 자리마다 이미 최대 ±8° 기울이고 씨앗 기울기도 스스로 더하는 글꼴이라, 더 기울이면 세로 모음에 닿는다('셊' 17.1%).
  - **들썩임**: 자모가 서로 멀어지는 쪽으로만 움직인다. 초성·완성형 head는 위로, 받침은 아래로 움직인다(초성 0–0.05em, 받침 0–0.04em). 세로 모음은 위아래(±0.012em)로 움직이고, 가로 모음 막대는 움직이지 않는다. 대칭 들썩임은 세벌 '홍·옹'의 ㅗ 막대와 받침 ㅇ을 16.8%까지 포갰다.
  - **크기 변주는 두지 않는다.** 자모 변형의 기준점이 상자 왼쪽 위라서, 줄여도 잉크가 위로 끌려 이웃과 포개진다(고딕 '훌' 16%).
- ADR-016 §4(변주는 규칙 API가 아니라 CSS + 씨앗 도우미 + 씨앗 반응 글꼴)를 따른다. `kku-vary-*`는 그 "페이지 CSS" 몫을 감사받은 공용 클래스로 만든 것이다.

### 5. 움직임·상호작용 확장
- `font-kku-motion.css`: 자모 단위 움직임 `assemble`·`drop`·`wave`·`flicker`·`cycle`·`shine`·`scroll-assemble`.
  - 고르는 법은 코어 글자 움직임(`rise`·`fade`·`stagger`·`bounce`·`wiggle`·`drift`)과 같은 `animate` 속성이다.
  - 자모 노드는 개별 속성 `translate`·`rotate`와 `opacity`·`color`로만 움직인다. `transform`은 코어가 자모 자리에 쓴다.
  - 비애니메이션 선언은 `@layer font-kku.motion`(꾸밈 뒤)에 둔다.
  - `prefers-reduced-motion`과 `data-kku-paused`에서 멈춘다.
  - 한 번 도는 움직임은 다시 그리면 다시 돈다.
- `font-kku-fx.js`(`FontKkuFx`, npm `font-kku/fx`): `type`·`scatter`·`magnet`·`shuffle`·`replay`·`bind`. 선언형 `data-kku-fx="…"`는 `DOMContentLoaded`와 바탕 요소의 첫 `font-kku:render`에 자동으로 묶인다.
- 효과 페이지는 '움직임'이 된다(주소 `effects.html`는 그대로). 카드의 '코드 복사'는 이 확장을 쓰는 짧은 형태다.

### 6. 한 줄 설치 확장 `data-addons`
`<script src=".../font-kku.js" data-fonts="sebul" data-addons="looks motion fx">`
- 스크립트 주소 기준으로 `font-kku-looks.css`·`font-kku-motion.css`를 `loadFont`로 붙이고, `font-kku-fx.js`는 순서를 지키는 스크립트로 붙인다.
- 이름은 대소문자를 접고 중복을 버린다. 모르는 이름은 경고하고 버린다. `data-fonts` 없이 `data-addons`만 있어도 동작한다.
- 확장 스크립트는 파서를 막지 않는다. 그래서 인라인 코드가 `FontKkuFx`를 바로 부르려면 `load`를 기다리거나 `font-kku-fx.js`를 직접 `<script>`로 싣는다.

### 7. 글꼴 축 — 짜임 × 획
- 글꼴 축은 뼈대만 담는다.
  - 기기 글꼴: `sebul`·`gothic`·`malang`(세벌 짜임 + 자리별 기울기)
  - 그림 자소: `sprite-system`, 새 획 `pilgi`(필기)·`dunggeun`(둥근)·`butgeul`(붓)
  - 획 표현이 다른 그림 자소: `pixel` 도트·`dojang` 인주·`chalk` 분필·`crayon` 크레용·`jasu` 실땀
  - 출발용 `sprite-example`
- 획 표현(texture)은 `scripts/build_jamo_svg.js`에서 획 뼈대와 독립된 차원이다. 어느 뼈대에나 붙일 수 있고, 배포하는 조합만 글꼴이 된다.
- 기기 명조(`myeongjo`)는 배포하지 않았다. AppleMyungjo를 고딕 짜임에 얹으면 겹침 감사 15% 초과 쌍이 206개(최대 혹·촉 ㅗ×받침 53.5%)이고 세벌 짜임에서는 가로 모음 자리가 어긋난다. 다른 기기의 명조 글꼴은 치수가 달라(나눔명조는 조합용 자모가 없다) 한 배치로 맞출 수 없다. 명조는 기준 글꼴 하나에 자리별로 다시 교정해야 한다.
- 칠만 다른 파생 글꼴(`neon` 등 8종)은 지우지 않는다. 같은 모양을 CSS 한 장으로 내는 `shortcut`으로 테마에 남긴다. 기존 `font="neon"` 페이지와 CDN 주소는 계속 동작한다.
- 새 칠은 파생 글꼴이 아니라 꾸밈(`paint`)으로 더한다.

## Alternatives Considered
### 런타임 `theme="neon-sign"` 옵션
- 장점: 한 단어로 조합 전체를 켠다.
- 단점: 런타임이 테마 목록을 알아야 하고(정본이 JS에 박힘), 새 옵션 표면과 해석 순서(테마 vs 개별 속성)가 생긴다. 조합법을 속성·클래스로 풀어 보여 주는 편이 투명하고, 사용자가 한 축만 바꾸기도 쉽다.

### 칠마다 파생 글꼴을 계속 만든다
- 장점: 글꼴 CSS 한 장으로 끝난다.
- 단점: 뼈대 × 칠만큼 글꼴이 는다. 그림 자소에는 칠을 줄 수 없고, 글꼴 목록이 다시 섞인다.

### 파생 글꼴의 칠을 꾸밈에서 생성한다(방향 반대)
- 장점: 꾸밈이 정본이 된다.
- 단점: 손으로 쓴 글꼴 꾸밈 구간(설명 주석, 씨앗 기하와 같은 자리)이 생성물로 바뀌어 저작 흐름(ADR-010)이 깨진다. 글꼴 → 꾸밈 방향이면 글꼴은 그대로이고, 대조 테스트가 둘의 동등성을 지킨다.

### 꾸밈을 레이어 밖 CSS로 둔다
- 장점: 특이도만으로 이긴다.
- 단점: 페이지 CSS와 같은 층이 되어 페이지가 꾸밈을 덮으려면 특이도 싸움을 해야 한다. 레이어는 "글꼴 < 꾸밈 < 움직임 < 페이지"를 순서로 못 박는다.

### 크기 변주를 기준점 보정과 함께 둔다
- 장점: 크기도 무작위로 달라진다.
- 단점: 자모 노드 상자 안 잉크 중심이 글꼴·자모마다 달라 페이지 레벨에서 기준점을 맞출 수 없다. 겹침 감사를 통과하는 폭에서는 눈에 띄지 않는다.

## Consequences
- 꾸밈 12종 × 기기·그림 자소 글꼴 전부가 조합된다. 새 칠은 정본 한 줄로 더한다.
- 테마는 34개로 시작한다. 파생 글꼴 단축 8종, 뼈대·획 표현 그대로 6종, 축을 섞은 조합 20종이다(새 그림 자소 글꼴의 붓 인주·필기 메모·둥근 스티커와 붓 금박 초대장 포함).
- 꾸밈은 그림 자소에서 색과 글자 단위 그림자만 낸다. 자모 역할별 그림자·속 빈 외곽선은 기기 글꼴만 된다.
- 변주는 감사가 정한 폭이라 은은하다. 눈에 띄는 무작위는 칠(색조·농담)과 씨앗 반응 글꼴이 맡는다.
- 배포 파일이 넷 늘었다(`font-kku-looks.css`·`font-kku-motion.css`·`font-kku-fx.js`·`spec/themes.json`). 이 파일들과 새 글꼴은 아직 공개 전인 0.4.0에 들어 있다. npm 첫 공개(TODO P1) 전에는 jsDelivr 주소(`font-kku@0.4.0`)가 열리지 않으므로, 사이트의 '코드 복사' 결과는 공개 뒤에 그대로 동작한다. 공개 전 시험은 `npm pack` tarball이나 저장소 파일로 한다.

## Related
- [ADR-008](./ADR-008-font-contract-v2.md) 글꼴 계약 v2 — 레이어와 레벨 변수
- [ADR-010](./ADR-010-derived-fonts-and-script-loader.md) 파생 글꼴과 한 줄 설치
- [ADR-014](./ADR-014-sprite-mask-paint.md) 자소판 마스크 칠
- [ADR-016](./ADR-016-seed-aware-fonts.md) 씨앗 반응 글꼴
- `spec/themes.json`, `scripts/build_looks.js`, `font-kku-looks.css`, `font-kku-motion.css`, `font-kku-fx.js`, `tests/overlap-policy.json`

## Change Log
- 2026-10-13: 원소·SVG 재료의 꾸밈 칠을 자모마다(§3 "재료별로 다르게 칠한다" — 꾸밈의 `element` 구간). 속 빈 꾸밈(네온·도면·외곽선)이
  획마다 외곽선을 그려 겹친 획이 상자로 갈라지고(ㅂ → 田, ㄹ → 사다리), 스티커·글리치·리소가 글자 단위 그림자 하나로 역할 칠을 잃던 것
  (사용자 지적 "네온, 스티커도 이상해"). 변주 색조가 기기 글꼴·원소 재료에서 돌지 않던 것(0.1.0부터)과 원소 재료의 굵기 변주,
  세벌 고정 기기 글꼴 재료에서 속 빈 꾸밈의 ㅗ·ㅜ가 막대로 칠해지던 것을 함께 고쳤다.
