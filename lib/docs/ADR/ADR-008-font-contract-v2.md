# ADR-008: 폰트 계약 v2 — cascade layer, 레벨 변수, 메타데이터 해석 시점, ESM 표면

## Status
Accepted

## Date
2026-09-24

## Context
font-kku의 원칙은 두 가지다. (1) 런타임·폰트·편집 도구가 서버나 빌드 없이 정적 JS/CSS로 브라우저에서 완결된다. (2) 다른 사람이 스크립트 한 줄 또는 ESM import 한 줄과 폰트 CSS 파일 하나로 쉽게 가져다 쓰고, JS 수정 없이 자기 폰트를 만들어 배포할 수 있다.

v1의 `--fy-*` 변수 계층(role → 부모 slot → slot → 노드 직접값)은 "상위 개념이 기본을 주고 하위 값이 설정되면 우선한다"는 의도대로 설계돼 있었고, cluster 계층(generic → open/closed/axis)도 같은 원리다. 이 확장점들은 shipped 폰트의 사용량과 무관하게 유지한다. 문제는 계층이 **slot에서 끊겼다**는 점이다. 실제 품질을 만든 자모별·문맥별 보정에 계층 레벨이 없어 폰트들이 우회로를 썼다.

- 셀렉터 특이도로 우선순위 결정 — `[data-fy-pos="bbrs"][data-jamo="ᆫ"]`(0,2,0)가 syllable depth 블록(0,1,0)을 이겨, 파일 위치로는 읽히지 않는 값이 남았다.
- 노드 직접값 `--fy-top`을 `calc(slot ± δ)`로 덮기 — 두 규칙이 같은 변수를 쓰면 누적이 아니라 대체된다. sebul의 trs/ttr ᅥ 규칙은 주석상 "추가로 올린다"였지만 실제로는 일반 ᅥ 보정(−0.07em)을 −0.06em으로 대체했다.
- `margin-*` 보정 — `%`가 폭 기준이고, `--fy-*`만 읽는 적합 도구와 Font Editor가 보지 못했다.
- 획 보상이 노드 직접 `-webkit-text-stroke`, 노드별 `--fy-font-weight`, sprite `drop-shadow`로 갈라져 있었다.

그 결과 Font Editor는 font/slot/cluster 레벨까지만 다루고 shipped 폰트를 온전히 편집하지 못했다. 런타임은 DOM 구조를 바꾸는 폰트 메타데이터(`--fy-jamo-depth` 등)를 렌더 순간에 한 번만 읽어, 늦게 도착한 폰트 CSS를 반영하지 못했다. 패키지에는 ESM 진입점이 없었다.

## Decision

### 1. 레벨과 합성 규칙
폰트가 자모 노드를 제어하는 레벨을 다음으로 고정한다. 아래로 갈수록 우선한다.

| 레벨 | 선언 위치 (폰트 scope `:where([data-fy-font="X"])` 안) | 변수 | 합성 |
|---|---|---|---|
| L1 font | host | `--fy-glyph-*`, `--fy-font-family`, `--fy-font-weight`, `--fy-font-stroke` … | 기본값 |
| L2 slot | host, host 조건(`[data-fy-vowel-depth="syllable"]` 등) | role → 부모 slot → slot: `--fy-<slot>-top/left/size/scale-x/scale-y/rotate/weight/stroke/clip/dilate` | 하위가 **대체** (모든 suffix) |
| L3 jamo | 자모 노드: `[data-jamo="X"]`, `[data-jamo-base="X"]`, 선택적으로 `[data-fy-pos]` | L2 slot 변수의 노드 재선언(대체) + `--fy-jamo-dx/dy/scale-x/scale-y/rotate`(누적), ADR-030 §7부터 `--fy-jamo-size/stroke`(누적)·`--fy-jamo-weight/clip`(대체) | 대체 또는 **누적** |
| L4 context | 자모 노드: `:has()`, topology 등 이웃 조건 | L2 slot 변수 재선언 + `--fy-ctx-dx/dy/scale-x/scale-y/rotate`, ADR-030 §7부터 `--fy-ctx-size/weight/stroke/clip` | L3 위에 대체 또는 **누적** |
| page | 페이지 작성자 CSS·inline style | 절대값 `--fy-top/left/font-size/weight/stroke/clip`, 보정 `--fy-scale-x/scale-y/rotate`, sprite `--fy-sprite-filter`·`--fy-optical-sprite-*` | 절대값은 최종 **대체**, 보정은 **누적** |

- 유일한 규칙: **같은 변수는 대체되고, 누적이 필요한 보정은 레벨 전용 변수로 분리한다.** host에 선언한 값은 상속으로, 노드에 선언한 값은 노드 자신에서 해석되므로 host 값(L1·L2)은 노드 값(L3·L4)을 이길 수 없다. 노드 값끼리는 §2의 레이어가 결정한다.
- 모든 속성의 합성식은 한 모양이다: **절대값 = page ?? slot ?? 부모 slot ?? role ?? font ?? builtin, 보정 = jamo·context·page 레벨 변수의 누적.** role은 어느 속성에서도 곱해지는 인수가 아니라 slot 체인의 마지막 fallback이다.
- 위치: `top = (page ?? slot 체인 top) + jamo-dy + ctx-dy`, `left`도 같다. 보정의 `%`는 slot top/left와 같은 glyph 상자 기준이고 `em`은 노드 글꼴 크기 기준이다. 위치는 `calc()`로 합산되므로 단위 없는 `0`은 쓸 수 없다(린트).
- 크기와 변형: `font-size = page ?? slot 체인 size`. `scale = slot 체인 scale × jamo × ctx × page(--fy-scale-*)`, `rotate = slot 체인 rotate + jamo + ctx + page(--fy-rotate)`. 폰트 레벨 scale 인수는 없다 — v1 문구 "font × role × slot"의 font 인수는 v1에서 폰트가 쓰던 직접 변수 `--fy-scale-x`였고 v2에서 페이지 전용이 됐다. 페이지 scale/rotate는 폰트 기하 위에 얹는 보정(seed variation 등 문서화된 용법)이라 누적으로 남긴다. 2026-09-27 이전 코어는 role scale만 slot scale에 곱했고(Font Studio는 대체로 모델링해 sebul 받침 scale을 틀리게 보였다 — 읽의 blr이 1.293으로 보였지만 실제 1.7223), 그 곱은 sebul slot 값에 접어 넣었다.
- 굵기: `font-weight = page(--fy-weight) ?? slot 체인 weight ?? --fy-font-weight`. 획 보상: `-webkit-text-stroke-width = page(--fy-stroke) ?? slot 체인 stroke ?? --fy-font-stroke`. 잘라내기: `clip-path = page(--fy-clip) ?? slot 체인 clip ?? none` — 폰트의 자모별 잘라내기는 jamo 레이어에서 `--fy-<slot>-clip`을 재선언한다.
- 페이지 작성자 전용 변수(`--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`, depth `--fy-jamo-depth`/`--fy-vowel-depth`/`--fy-coda-depth`)는 폰트가 쓰지 않는다(폰트의 depth는 `--fy-font-*-depth`). 그래서 폰트를 import한 페이지가 항상 마지막 말을 한다. registry의 모든 변수는 `level`(font·slot·role·jamo·context·page·runtime·dispatch)·`scope`(host·node·page)·`declaredBy`(font·page·runtime·core)를 갖고, 린트는 `declaredBy`가 `font`가 아닌 변수를 폰트에서 거부한다.
- 기존 변수는 하나도 제거하지 않았다. 신규 변수는 `spec/css-variables.json`(v2.0, 2026-09-27 정규화로 v2.1)에 등록돼 있다. 역할이 섞였던 부모 `--fy-bbr-*`만 deprecated로 체인 밖에 두고(§3), `--fy-sprite-dilate`는 slot 노드 값에서 폰트 레벨 기본값으로 자리를 옮겼다(§5).

### 2. Cascade layer
- 폰트 규칙은 모두 `font-kku` 레이어 안에 둔다. 모든 폰트 CSS와 `font-kku.css`는 첫 규칙으로 같은 순서 선언을 반복한다(로드 순서와 무관하게 순서가 고정되도록, 멱등).

  ```css
  @layer font-kku.font, font-kku.jamo, font-kku.context;
  ```
- `font-kku.font`: L1·L2 host 규칙과 slot 단위 노드 규칙(`[data-fy-pos]`만 쓰는 규칙, sprite kind별 행 선택). `font-kku.jamo`: L3. `font-kku.context`: L4. 뒤 레이어는 특이도와 무관하게 앞 레이어를 이긴다. 같은 레이어 안에서는 CSS 그대로 특이도가 결정한다(`[data-fy-pos][data-jamo]`가 `[data-jamo]`를 이긴다). 같은 레이어에서 같은 특이도의 두 규칙이 한 노드에 겹치면 파일 순서가 속성별로 승자를 정하므로, 폰트는 그런 규칙의 조건을 서로 배타적으로 쓴다(gothic의 ㅇ/ㅎ 초성 × mtl ㅗ 규칙을 이렇게 정리했다). 같은 레이어의 `[data-jamo]`와 `[data-fy-pos][data-jamo]`가 같은 `--fy-jamo-*`를 쓰면 누적이 아니라 대체다.
- 레이어 밖에 있는 페이지 CSS는 폰트를 항상 이긴다. 페이지는 `@layer reset, font-kku, app;`처럼 font-kku 전체를 자기 레이어 체계 안에 배치할 수 있다.
- **코어의 구조 규칙은 레이어 밖에 둔다.** 코어를 레이어에 넣으면 페이지의 element 리셋(`span { … }`)에 지기 때문이다. 결과적으로 폰트는 코어가 소유한 속성(`margin`, `inset`, `transform`, `font-size`, `font-weight`, `-webkit-text-stroke`, `clip-path`, sprite 재료의 `background-*`·`filter`·`inline-size`·`block-size`·`width`·`height`·`overflow` 등)을 직접 선언할 수 없고 **변수로만 코어와 통신한다**(§5). 폰트가 직접 선언하는 속성은 잉크의 칠(`color` 등)과 host의 글꼴 기능뿐이다(허용 목록, §9).

### 3. slot 트리와 디스패치 생성
- `spec/css-variables.json`의 `slotContract.tokens[]`는 `role`과 `parent`를 갖는다. 트리 규칙(checker 강제): emit되는 slot은 부모가 정확히 하나다. 부모는 emit되지 않고(`status: fallback`), 부모를 갖지 않으며, 모든 자식과 role이 같고, emit되는 자식이 하나 이상이다. 각 slot의 role은 `spec/tables.json` placement에서 유도한 값과 대조한다.

  | 부모 | role | 자식 |
  |---|---|---|
  | `tc` | choseong | `t`, `tt` |
  | `tl` | choseong | `tlo`, `tlc`, `tls`, `ttl` |
  | `h` | head | `hs`, `hts` |
  | `tr` | jung-main | `tro`, `trc` |
  | `mc` | jung-main | `m`, `mt` |
  | `mx` | jung-main | `mw`, `mtw` |
  | `xb` | jung-base | `ml`, `mtl` |
  | `xt` | jung-tail | `trs`, `ttr` |
  | `bs` | jong-main | `b`, `brs`, `bbrs` |
  | `bx` | jong-main | `bw`, `brw`, `bbw` |
  | `xl` | jong-left | `bl`, `blr`, `bbl` |
  | `xr` | jong-right | `br`, `brd`, `bbrd` |

  v1 트리는 불완전·불규칙했다 — `ttl`·`ttr`·`bbl`과 bottom 축 계열에 부모가 없었고, `tr`은 jung-tail(`trs`)을, `bbr`은 jong-main(`bbrs`)과 jong-right(`bbrd`)를 섞었고, emit되는 `bl`/`br`이 부모를 겸해 `--fy-br-*`(bottom:double 오른칸)가 `brs`(각의 ㄱ)로 새어 들어갔다. 섞인 부모 `bbr`은 `bb`와 함께 deprecated(체인 밖, 린트가 거부), `blb`/`brb`는 reserved다. shipped 폰트는 `tl`/`tr`/`h`/`bbr`을 쓰지 않았고 `bl`/`br`을 쓰는 곳은 자식이 같은 suffix를 모두 선언해, 트리 변경은 렌더 등가다.
- slot suffix는 10종이다: `top`, `left`, `size`, `scale-x`, `scale-y`, `rotate`, `weight`, `stroke`, `clip`, `dilate`(sprite 획 보정). 모두 같은 체인 `slot → 부모 slot → role → slot builtin`이고 role 변수도 같은 10종이다. 부모 slot은 builtin을 갖지 않는다(자식 builtin이 체인을 끝낸다).
- `font-kku.css`의 slot·role 디스패치 블록은 레지스트리에서 생성한다(`node scripts/check_css_contract.js --write`, `--check`가 stale을 거부한다). 디스패치 규칙은 **emit되는 slot에만** 둔다 — 부모 변수는 자식 체인 안에서만 읽힌다(v1은 노드가 없는 7개 slot에도 규칙을 냈다). cluster transform 체인(변형 → jung/jong cluster → generic `--fy-cluster-*`)도 `clusterContract`에서 같은 방식으로 생성한다(`cluster` 블록). 나머지 base CSS는 ADR-007대로 손으로 쓴 실행 정본이다.

### 4. 폰트 메타데이터와 해석 시점
- 폰트 CSS는 host scope에 `--fy-font-id: <name>`, `--fy-contract: 2`, `--fy-material: system | sprite | bundled`를 선언한다(린트).
- 런타임은 렌더할 때 depth·expression mode와 함께 메타데이터를 읽는다. stylesheet `load` 이벤트(capture 단계, bootstrap 또는 첫 렌더 때 document와 렌더한 host가 속한 shadow root마다 1회 등록)나 `FontKku.refreshAll()`에서 다시 해석한다. DOM 구조가 바뀌는 host(depth·expression·재료)는 attribute를 다시 읽어 재렌더하고(해석된 seed는 유지, ADR-002), `--fy-font-id`·`--fy-contract`만 바뀐 host는 DOM을 다시 만들지 않고 `fontInfo()` 상태만 갱신한다. DOM에 붙기 전에 렌더한 host는 미해석으로 표시했다가 연결될 때 해석한다.
- **depth의 페이지 우선.** 이전 런타임은 선언된 longhand(`--fy-vowel-depth`/`--fy-coda-depth`)를 shorthand(`--fy-jamo-depth`)보다 선언 출처와 무관하게 우선해, longhand를 선언한 폰트에서는 페이지의 shorthand가 무시됐다(sprite-system — `font_equivalence.py`의 depth 4종이 같은 구성을 네 번 찍었다). 다른 페이지 전용 변수와 같은 이름 규약으로 정리했다: 평이한 이름(`--fy-jamo-depth`/`--fy-vowel-depth`/`--fy-coda-depth`)은 **페이지 레벨**(`declaredBy: page`), 폰트는 **`--fy-font-jamo-depth`/`--fy-font-vowel-depth`/`--fy-font-coda-depth`**로 선언한다(`--fy-weight` ↔ `--fy-font-weight`와 같은 짝). 해석: `page longhand ?? page shorthand ?? font longhand ?? font shorthand ?? 기본값` — 페이지가 폰트의 depth를 항상 이긴다. shipped 폰트는 sebul `--fy-font-jamo-depth: syllable`, sprite-system `--fy-font-jamo-depth: composite`로 옮겼고(렌더 불변), 린트는 폰트의 평이한 이름 선언을 페이지 전용 변수로 거부한다.
- `FontKku.fontInfo(host)`는 직전 렌더의 메타데이터와 `loaded`(요청 폰트의 CSS가 host에 도달했는지)를 돌려준다. 이 상태를 DOM 속성으로 찍지 않는 이유는 사이드카 렌더러의 DOM 계약(html-cases)을 바꾸지 않기 위해서다.
- `FontKku.loadFont(href, { root }?)`는 `<link>`를 삽입(이미 있으면 재사용)하고 load 뒤 모든 host를 다시 해석한다. 대기 중이거나 성공한 link가 연결돼 있는 동안 같은 Promise를 돌려주고, 실패하면 삽입한 link를 지우고 reject해 다음 호출이 재시도한다. `root`로 Document나 ShadowRoot를 지정할 수 있다. 서버 동작은 없다.
- `--fy-contract`가 런타임이 지원하는 값(2)보다 크면 폰트별로 한 번 console 경고만 하고 렌더는 계속한다.

### 5. 폰트 패키지와 재료
- 폰트 = `<name>.css` + 선택적 상대 경로 자산. shipped 폰트의 원격 URL 금지는 `tests/asset_sync.test.js`가 지킨다.
- 재료 `bundled`(상대 경로 woff2 subset)는 계약상 허용하되 shipped 폰트는 아직 쓰지 않는다.
- **sprite 재료는 코어가 칠한다.** `font-kku.css`의 "Sprite material (ADR-008 §5)" 규칙 하나가 시트 배경·칸 크기·위치·필터를 계산하고, 폰트는 변수만 선언한다.

  | 변수 | 선언 위치 | 기본값 | 뜻 |
  |---|---|---|---|
  | `--fy-sprite-url` | host | `none` | 시트 이미지 `url(...)`. 코어가 `@property`로 `<url> \| none` 등록 |
  | `--fy-sprite-url-2x`, `--fy-sprite-url-3x` | host | `none` | multi-scale 배율별 `url(...)`(등록) |
  | `--fy-sprite-image` | host | 없음 | 선언하면 `--fy-sprite-url` 대신 칠한다(`image-set(var(--fy-sprite-url) 1x, var(--fy-sprite-url-2x) 2x)`) |
  | `--fy-sprite-cell` | host | `1em` | 칸 한 변 |
  | `--fy-sprite-cols` | host | `21` | 시트 열 수(가장 긴 행) |
  | `--fy-sprite-rows` | host | `2` | 시트 행 수 |
  | `--fy-sprite-kinds` | host | 없음 | 시트에 칸이 있는 자모 종류(`consonant vowel [coda-cluster]`) |
  | `--fy-sprite-row` | 자모 노드(kind·slot·문맥 규칙) | `0` | 노드가 쓸 행 |
  | `--fy-<slot>-dilate` | host(slot 값), 자모·문맥 노드 재선언 | 없음 | slot 획 보상 `drop-shadow` 목록 — slot 체인(slot → 부모 → role) |
  | `--fy-sprite-dilate` | host | `none` | 폰트 레벨 획 보정(slot 체인이 비었을 때) |
  | `--fy-sprite-rendering` | host | `auto` | 시트 확대·축소 보간(`image-rendering`) — 픽셀 아트 시트는 `pixelated`·`crisp-edges` (2026-10-09 추가) |

  열은 런타임이 주는 `--fy-sprite-jamo-index`다. 작은 글씨 보정 `--fy-sprite-zoom`/`crop-x`/`crop-y`(폰트)와 페이지 전용 프리셋 `--fy-optical-sprite-*`도 같은 규칙이 읽고, 프리셋이 폰트 값을 이긴다. 필터는 `--fy-sprite-filter`(page) → `--fy-optical-sprite-filter`(page) → slot 체인 dilate → `--fy-sprite-dilate`(font) 순이다.
- **URL 해석.** 등록되지 않은 커스텀 프로퍼티 안의 상대 `url()`은 `var()`를 쓰는 스타일시트(코어) 기준으로 풀린다. 그래서 a00d624의 `--fy-sprite-url: url("./sprite-example.png")`는 루트의 `/sprite-example.png`로 풀려 404가 났다(스모크는 부분 문자열만 봐서 통과했다). 코어가 `--fy-sprite-url`·`-2x`·`-3x`를 `<url> | none`으로 등록하면 값이 선언한 파일 기준 절대 URL로 계산된다 — 폰트는 자기 파일 기준 상대 경로, 페이지 override는 그 스타일시트(inline이면 문서) 기준. `image-set()`은 `<url>` 문법이 아니고 `<image>` 등록은 Chromium에서 절대화도 `image-set()`도 되지 않아, multi-scale은 비등록 `--fy-sprite-image`에서 등록된 배율 변수를 `var()`로 묶는다. 스모크는 해석된 경로가 `profiles/<font>.png`로 끝나고 실제로 로드되는지 본다.
- 게이트는 host 속성이다. 런타임은 폰트의 `--fy-material`이 `system`이 **아닐 때만** host에 `data-fy-material`을 찍고, `sprite`이면 `--fy-sprite-kinds`를 걸러 `data-fy-sprite-kinds`로 찍는다. 코어 규칙은 `[data-fy-material="sprite"][data-fy-sprite-kinds~="<kind>"]` 아래의 `[data-sprite-jamo-kind="<kind>"]` 노드만 칠하고, 목록에 없는 종류(예: 2행 시트의 겹받침)와 시트 칸이 없는 노드(syllable depth head)는 폰트 글자로 폴백한다. `system` 폰트(sebul, gothic)에는 두 속성이 없으므로 사이드카 렌더러의 DOM 계약(html-cases)은 바뀌지 않는다.
- 시트 행 선택은 `--fy-sprite-row` 한 변수로 한다. 위치 계산식은 코어 규칙 하나에만 있고, 폰트의 kind·slot·문맥 규칙은 행 번호만 바꾼다(v1의 "base 특이도가 kind 규칙을 이겨 전부 ㄱ 칸" 함정이 구조적으로 사라진다). v1의 폰트 전용 변수(`--sprite-url`, `--sprite-cell`, `--sprite-cols`, `--sprite-render-cell`, `--sprite-crop-*`)는 없어졌다.
- 폰트 린트는 sprite 재료 폰트에 `--fy-sprite-url`과 `--fy-sprite-kinds` 선언을 요구한다.
- `scripts/build_sprite.py`와 `scripts/glyph_sprite_stroke.py`는 이 변수 형식을 내보낸다. `glyph_sprite_stroke.py`는 폰트 **기본 depth**에서 유효한 slot 기하(host 규칙 + 기본 depth 조건 규칙)로 `--fy-<slot>-dilate`를 계산하고, 자모·문맥 층이 size/scale을 재선언한 규칙에는 같은 레이어·셀렉터의 생성 규칙으로 그 노드의 보정을 다시 쓴다(필요 없어지면 `initial`로 체인에 되돌림). `build_sprite.py`는 `BEGIN/END GENERATED` 마커 구간만 교체한다. 그 밖의 보정(자모·문맥 레이어, 적합 결과)은 재생성 때 보존되고, 마커 없는 기존 파일은 덮어쓰지 않는다.
- shipped sprite 폰트 2종(sprite-example, sprite-system)을 이 형식으로 옮기면서 `scripts/font_equivalence.py`로 전 음절 × depth 4종 렌더 등가(차이 0)를 확인했다.

### 6. ESM 표면
- 빌드 없는 `font-kku.mjs`가 기존 스크립트를 side-effect import하고 같은 API 객체를 default와 named export로 내보낸다. 구현 정본은 계속 `font-kku.js` 하나다.
- `package.json` `exports["."]`의 `import` 조건이 `font-kku.mjs`를 가리킨다. `<script src>`와 `require` 경로는 그대로다.

### 7. 브라우저 기준선
shipped 폰트가 이미 `:has()`를 쓰므로 실효 기준선은 `:has()` 지원 브라우저(Chrome 105, Safari 15.4, Firefox 121)다. `@layer`는 이 기준선 안에 있다.

### 8. 이전 증명
shipped 폰트 4종(sebul, gothic, sprite-example, sprite-system)을 v2로 옮기면서 렌더 등가성을 `scripts/font_equivalence.py`로 증명했다. 전 음절 11,172자 × depth 4종(폰트 기본, atomic, composite, syllable)의 모든 자모 노드에 대해 glyph 기준 상자와 렌더 관련 계산 스타일을 v1과 비교해 차이 0이다. 허용 오차 0.035px은 margin을 보정 변수로 옮긴 곳에서 Chromium LayoutUnit(1/64px) 반올림 횟수가 달라진 만큼이다. 의도와 결과가 어긋났던 v1 보정(ᅥ trs/ttr, ᆫ bbrs)도 렌더를 그대로 유지했고, 이제 CSS에서 대체 관계가 드러난다(ᅥ는 jamo 레이어의 `[data-fy-pos][data-jamo]` 규칙이 `--fy-jamo-dy`를 대체).

### 9. 폰트 CSS 문법과 린트
폰트 CSS의 문법을 아래로 고정한다. 린트 하나(`authoring/font-kku-lint.js`)가 `node scripts/check_css_contract.js --check`(`profiles/*.css` 전부), 테스트(`tests/font_lint.test.js`), Font Studio(불러오기·편집·저장·내보내기, ADR-009)에서 같은 판정을 낸다. 린트는 Font Studio 파서(`FontStudioModel.parse`) 위에서 돈다 — 브라우저 캐스케이드와 같은 규칙 트리(중첩·조건·레이어·`!important`)와 셀렉터 구문(`selectorCompounds`: 속성 이름 대소문자 무시, 연산자·공백·이스케이프 정규화, `:is()`/`:where()`/`:not()`/`:has()` 인자)을 읽고 부분 문자열로 추측하지 않는다. 이전 텍스트 린트(`;` 분리와 부분 문자열 판정)는 중첩 규칙 안의 선언, scope 밖 셀렉터, `[data-jamo ="X"]`·`[DATA-JAMO=`·`:HAS(`·형제 결합자·topology 조건, `!important`, 금지 목록 밖의 기하 속성(`translate`, `zoom`, `writing-mode`, `padding` …), `0.0`·`-0`·`0 !important`·crop의 `0`, `@import`만 있는 파일, 디스패치·런타임 변수를 통과시켰다(리뷰에서 실제 렌더로 확인).

- **구조.** 첫 문장은 `@layer font-kku.font, font-kku.jamo, font-kku.context;`(앞에는 `@charset`만 올 수 있다). 모든 스타일 규칙은 세 레이어 블록 중 하나 안에 둔다. 최상위에는 그 밖에 `@font-face`(bundled 재료, 상대 경로 `src`)만 둔다. 레이어 안에는 스타일 규칙과 `@media`·`@supports`(Studio가 평가한다)만 둔다 — `@container`·`@scope`·`@starting-style` 같은 Studio가 평가할 수 없는 조건, 중첩·익명 `@layer`, CSS nesting(`&`, 중첩 규칙), `!important`는 오류다. alias shim(`spec/fonts.json` `aliases`의 이름)은 `@import "./<대상>.css";` 한 줄만 담고, 그 밖의 폰트 파일은 `@import`를 쓰지 않는다(`@import`만 있는 파일도 면제되지 않는다).
- **scope.** 셀렉터 목록의 모든 complex selector는 `:where([data-fy-font="<id>"])`로 시작한다. `<id>`는 `--fy-font-id`이자 파일 이름이고 소문자다 — 런타임은 폰트 이름을 trim·ASCII 소문자로 정규화해 host의 `data-fy-font`에 찍으므로(`font="MyFont"` → `data-fy-font="myfont"`) 대문자가 든 scope는 어떤 host에도 맞지 않는다(`font-id-case`; Font Studio는 새 이름을 소문자로 정규화해 쓴다). host 조건은 같은 `:where` 안에 런타임 host 출력 속성(`data-fy-vowel-depth` 등 `data-fy-*`)으로, 부정은 `:not()`으로 쓴다(`:where([data-fy-font="x"]:not([data-fy-vowel-depth="syllable"]))`). scope 뒤 결합자는 자손(공백, `>`)이다. 셀렉터에는 런타임 DOM 계약의 속성·part 토큰, `:is()`/`:where()`/`:not()`/`:has()`, 형제 위치 의사 클래스만 쓴다 — 요소 이름·class·id·의사 요소·상태 의사 클래스(`:hover` 등)와 런타임이 찍지 않는 속성은 오류다.
- **대상과 레이어 = 레벨.** 셀렉터를 파싱해 대상 compound(셀렉터 끝)와 조건을 분류한다. `:is()`/`:where()`/`:not()`은 분류에서만 풀고(부정 조건도 조건이다), scope 판정에서는 풀지 않는다.

  | 대상과 조건 | 레이어 |
  |---|---|
  | host(scope만, host 조건 포함) | `font-kku.font` |
  | 자모 노드, slot·role·종류 조건만(`[data-fy-pos]`, `[data-fy-role]`, `[data-jamo-role]`, `[data-sprite-jamo-kind]`, 자모 part 토큰) | `font-kku.font` |
  | 자모 노드 + 자모 조건(`[data-jamo]`, `[data-jamo-base]`, `[data-jamo-index]`, `[data-sprite-jamo]`, `[data-sprite-jamo-index]`) | `font-kku.jamo` |
  | 자모 노드 + 문맥 조건(글자 칸의 자리 자모 `[data-fy-at-<자리>]`·자모 목록 `[data-fy-jamos~=]`, `:has()`, 조상·형제 compound, `[data-fy-axis]`·`[data-fy-open]`·`[data-fy-jong-count]`, glyph topology `[data-layout-key]` 등, 형제 위치 의사 클래스) | `font-kku.context` |

  대상은 host이거나 자모 노드다. wrapper(`[part="glyph"]`, cluster 등)를 대상으로 한 규칙은 오류다. 특히 문맥 규칙이 조상 glyph를 대상으로 하면 선언이 상속으로만 자모에 닿아, 자모 노드에 직접 선언한 jamo 레이어 규칙에 레이어와 무관하게 진다(`context-subject`).
  이웃 자모는 글자 칸 속성으로 고른다(2026-10-22): `[part="glyph"][data-fy-at-t][data-fy-at-t="ᄀ"] [data-fy-pos="m"]`. 조상 compound의 `:has()`도 같은 노드를 고르지만 경고(`has-context`)다 — Chromium은 페이지의 모든 `:has()` 무효화 집합을 합쳐, 조상 자리 `:has()`가 하나라도 있으면 페이지 `:has()` 주체 안의 자모 노드가 그 안 바뀜마다 모두 다시 계산된다(dojang·sebul 1,240자모: 속성 하나에 요소 4,961개·66–76ms, 움직임 확장과 함께 14,881개). 대상 compound의 `:has()`(`[part~="jongseong-left"]:has(+ …)`)는 그 노드만 다시 계산해 경고하지 않는다. 런타임이 그리지 않는 자리의 `data-fy-at-*`는 오류다.
- **변수.** 폰트가 선언하는 사용자 정의 속성은 registry에서 `declaredBy: font`인 `--fy-*`뿐이다. page·runtime·core 변수, 미등록 `--fy-*`(읽기 포함), `--fy-`가 아닌 사용자 정의 속성, deprecated·reserved slot 변수는 오류다. scope가 대상과 맞아야 한다: host 규칙은 `scope: host` 변수만, 자모 노드 규칙은 `scope: node` 변수와 L2 체인 변수(slot·role — 노드 재선언은 대체)만 선언한다. 누적 보정은 자기 레이어에서만 선언한다: `--fy-jamo-*`는 `font-kku.jamo`, `--fy-ctx-*`는 `font-kku.context`(다른 레이어의 같은 변수는 누적이 아니라 대체다).
- **값.** registry `type`으로 검사한다(length, length-percentage, number, integer, angle, keyword `values`, font-weight, font-family, clip-path, filter, image, url; `calc()` 같은 수학 함수, `var()`, CSS-wide 키워드는 허용). length·length-percentage 변수에는 단위 없는 0(`0`, `0.0`, `-0`, `+0`, `.0e0`, `calc()` 합의 `0`)을 쓰지 않는다. 코어가 `calc()`로 더하는 위치·crop에서 0은 숫자라 선언 전체가 무효가 되고(`--fy-sprite-crop-x: 0`은 모든 노드에 0번 칸을 칠했고, `--fy-jamo-dy: 0`은 slot 위치를 지웠다), 자리마다 합산 여부를 기억하지 않도록 길이 변수 전체에 한 규칙을 쓴다. 각도는 단위가 필요하다(`0deg`). 폰트 자산 `url()`은 폰트 파일 기준 상대 경로나 `data:`다(원격·사이트 루트 경로 금지).
- **속성.** 코어 규칙은 레이어 밖이라 폰트는 코어가 선언한 속성에서 이길 수 없고, 코어가 선언하지 않은 기하 속성(`translate`/`rotate`/`scale`, `zoom`, `offset-*`, `writing-mode`, `direction`, `letter-spacing`, `min-`/`max-` 크기, `padding` …)은 코어 배치를 몰래 바꾼다. 그래서 금지 목록이 아니라 허용 목록을 쓴다. 자모 노드와 host 모두 잉크의 칠(`color`, `-webkit-text-fill-color`, `-webkit-text-stroke-color`, `text-shadow`, `paint-order`, `opacity`, `text-decoration*`, `text-underline-*`)을, host만 글꼴 기능(`font-feature-settings`, `font-variation-settings`, `font-kerning`, `font-variant*`, `font-optical-sizing`, `font-synthesis*`, `font-palette`, `font-language-override`, `font-style`, `font-stretch`, `text-rendering`, 글꼴 smoothing)을 선언한다 — 코어가 자모 노드에 `font: inherit`를 주므로 글꼴 기능은 host에서 상속된다. 위치·크기·변형·잘라내기·획 폭·배경·필터는 노드에서 코어 소유이고 레벨 변수로만 준다. `background-color`도 배경이라 허용하지 않는다(sprite 칸은 코어가 칠한다). glyph wrapper의 `filter`·`clip-path`는 코어가 선언하지 않고 `transform`은 애니메이션 hook만 쓰지만, wrapper를 대상으로 한 규칙 자체를 허용하지 않는다(음절 전체 변형은 `--fy-body-*`, cluster는 `--fy-*-cluster-*`).
- **메타데이터**(§4, 기존 규칙): 조건 없는 font 레이어 host 규칙에 `--fy-font-id`(파일 이름), `--fy-contract: 2`, `--fy-material`, sprite 재료면 `--fy-sprite-url`(또는 `--fy-sprite-image`)과 `--fy-sprite-kinds`. 폰트 depth는 `--fy-font-*-depth`로 선언한다.
- **모듈과 생성 블록.** `FontKkuLint.lint(cssText, { fileName, digest })` → `[{ severity, code, message, line, column }]`, 코드 목록은 `FontKkuLint.CODES`. classic script라 Node(`require`)와 `file://`로 연 브라우저에서 같이 돈다. 린트가 쓰는 레지스트리 요약(변수별 level·scope·declaredBy·type·status·values, slot suffix와 roleFallback, 페이지 전용 목록, alias, 계약 버전)은 `node scripts/check_css_contract.js --write`가 `BEGIN/END GENERATED CSS CONTRACT: lint-registry` 블록에 쓰고 `--check`가 stale을 거부한다(registry `generatedTargets`). Font Studio 모델의 slot 계약 블록도 같은 생성기에서 `SLOT_SUFFIXES`·`PAGE_ONLY_VARIABLES`를 받는다.
- shipped 폰트 4종과 alias shim 3개는 모두 통과한다. 새 린트가 shipped 폰트에서 잡은 것은 sebul·gothic의 `--fy-word-gap: 0` 하나였고 `0px`로 바꿨다(렌더 불변 — `margin-inline-end`에서 `0`과 `0px`은 같다).

## Alternatives Considered

### Alternative A — 폰트를 JSON 정본으로 두고 CSS를 생성
- 장점: 우선순위와 누적 의미를 생성기가 결정적으로 정한다.
- 단점: CSS를 손으로 쓰고 브라우저에서 바로 편집하는 핵심 경로를 막는다. 제3자 폰트 작성에 도구 의존이 생긴다. 기각.

### Alternative B — 레이어 없이 셀렉터 특이도 규약만 문서화
- 장점: 브라우저 기능 의존이 없다.
- 단점: 규약 위반을 기계적으로 막을 수 없다. 이미 같은 특이도 대체 사고가 여러 번 있었다.

### Alternative C — 코어까지 레이어에 넣기
- 장점: 모든 우선순위가 레이어로 일관된다.
- 단점: 페이지의 element 리셋에 코어 배치가 깨진다. 기각.

### Alternative D — 사용량 기준 변수·DOM hook 축소
- 장점: 표면이 작아 보인다.
- 단점: 세밀한 표현과 제3자 폰트를 위한 확장점을 잃는다. 간결함은 변수 개수가 아니라 규칙 수로 판단한다. 기각.

### Alternative E — 폰트 로딩 상태를 DOM 속성(`data-fy-font-state`)으로 노출
- 장점: CSS로 로딩 중 상태를 스타일링할 수 있다.
- 단점: 사이드카 렌더러 4종과 html-cases 계약이 함께 바뀐다. `fontInfo()`로 같은 정보를 준다. 보류.

## Consequences

### Positive
- 폰트 작성자는 "어느 레벨에 쓰는가"만 고르면 된다. 파일 안 위치나 특이도가 레벨을 넘어 결과를 바꾸지 않는다.
- 모든 보정이 `--fy-*` 변수라 에디터(Font Studio)와 적합 도구가 전 레벨을 읽고 쓸 수 있다(ADR-009의 전제). margin처럼 도구에 보이지 않던 층이 없다.
- import한 페이지는 레이어 밖 CSS 한 줄로 폰트 값을 덮는다.
- 폰트 CSS가 늦게 도착해도 올바른 구조로 수렴하고, ESM/CDN import가 가능하다.
- 폰트 CSS 문법이 하나로 고정됐고(§9), 같은 린트가 `scripts/check_css_contract.js`·테스트·Font Studio에서 돈다(구조·scope·레이어 = 레벨·변수 선언 주체와 scope·속성 허용 목록·타입 있는 값과 단위 없는 0·상대 자산·메타데이터). 적합 도구(`glyph_fit.py`)는 slot 변수와 보정 변수를 모두 튜닝 대상으로 읽는다.

### Negative
- 변수 표면이 336개에서 446개로, 2026-09-27 정규화 뒤 696개(base 640)로 늘었다(slot·role weight/stroke/rotate/clip/dilate, 부모 slot 9개, 보정 변수, cluster generic 티어, 메타데이터, 폰트·페이지 depth 분리). 규칙은 줄었다: 모든 속성이 "절대값은 대체 체인, 보정은 레벨별 누적" 하나다.
- 코어 CSS의 자모 배치 식이 보정 변수 합산으로 길어졌다.
- Font Editor PoC는 v2 폰트를 편집하면 레이어 밖 규칙을 덧붙였다(동작은 맞지만 v2 린트를 통과하지 않는 CSS를 내보냈다). ADR-009의 Font Studio로 교체했고 PoC는 2026-09-25에 제거됐다.

### Risks
- 폰트 CSS가 레이어 순서 선언을 빠뜨리면 순서가 로드 순서에 의존한다 — 린트가 첫 규칙으로 강제한다.
- load 이벤트가 없는 스타일 변경(`adoptedStyleSheets`, `<style>` 텍스트 교체)은 `refreshAll()`을 호출해야 한다(문서화).
- 2026-09-27에 `sprite-system.css`의 획 보상 블록을 현재 기하로 재생성했다(slot 체인 값). 전 음절 비교에서 filter 외 차이 0, 잉크 면적비(native 400 대비) 평균 |비−1| 0.071 → 0.063. tls 보정이 공식상 불필요해져 사라지면서 과/회/획의 잉크가 줄었다 — 재적합 라운드에서 공식(t0·threshold)과 함께 본다.
- Font Studio와 적합 도구는 새 suffix(`rotate`, `clip`, `dilate`)와 부모 slot을 아직 편집 표면에 노출하지 않는다(값 해석 체인은 이미 맞다).

## Open Questions
- sebul의 재료: `system` 유지(현재, 플랫폼별 차이 수용) 또는 `bundled` woff2 subset.
- 사이드카 렌더러(Python/Go/Rust/Ruby) 유지 범위. 이 ADR은 렌더러 수와 무관하게 성립한다.
- 의도와 결과가 어긋났던 v1 보정(ᅥ trs/ttr, ᆫ bbrs)을 의도대로 고칠지. 현재는 렌더 유지(sebul의 ᅥ trs/ttr 주석은 "추가로 올린다"에서 실제 동작인 대체로 고쳤다).
- depth 폰트 레벨 이름(`--fy-font-*-depth`)의 런타임 구현 시점(§4).

## Related Documents
- PRD: [Core Product Scope](../PRD/core-product-scope.md)
- Architecture: [Style Font System](../ARCHITECTURE/style-profile-system.md), [Browser Runtime Design](../ARCHITECTURE/browser-runtime-design.md)
- ADR: [ADR-002 옵션 우선순위](./ADR-002-option-priority-contract.md), [ADR-005 font alias와 게이팅](./ADR-005-font-alias-normalization-and-gating.md), [ADR-007 CSS variable registry](./ADR-007-css-variable-registry-and-editor-codegen.md), [ADR-009 폰트 에디터 v2](./ADR-009-font-editor-v2.md)
- Registry: [css-variables.json](../../spec/css-variables.json)
- Equivalence: [font_equivalence.py](../../scripts/font_equivalence.py)

## Change Log
- 2026-10-22: §9 문맥 조건에 글자 칸의 문맥 표면(`data-fy-at-<자리>`·`data-fy-jamos`, DOM 계약·html-cases 1.12)을 더하고 조상 자리 `:has()`를 경고(`has-context`)로 — 기본 글꼴의 조상 자리 `:has()` 규칙 2,826 개를 같은 특이도의 속성 선택자로 옮겼다(`scripts/migrate_has_context.js`, 자모 노드 계산 값이 모든 음절·나누기에서 같음). 사용자 글꼴의 `:has()`는 그대로 돈다
- 2026-10-18: 범위 사다리([ADR-035](ADR-035-scope-ladder.md)) — context 레벨에 수준 전용 보정 `--fy-case-*`(같은 짜임)·`--fy-syl-*`(한 음절)을 더함(§1 '누적이 필요한 보정은 레벨 전용 변수로'), 합치는 식 jamo + case + ctx + syl, 굵기·자르기 page ?? syl ?? ctx ?? case ?? jamo ?? slot
- 2026-10-09: §5에 `--fy-sprite-rendering`(font·host, 기본 `auto`) 추가 — 코어 sprite 규칙이 `image-rendering: var(--fy-sprite-rendering, auto)`로 읽는다. 폰트는 `image-rendering`을 직접 선언할 수 없으므로(§9 속성 허용 목록) 픽셀 아트 시트의 보간을 변수로 연다. Font Studio 재료 탭의 래스터 품질이 이 변수를 쓴다. 변수 표면 697개(base 641)
- 2026-09-27: 폰트 CSS 문법 고정과 린트 재구축(§9) — 텍스트 휴리스틱 린트를 Font Studio 파서 위의 공유 모듈 `site/font-kku-lint.js`로 교체(checker·테스트·Studio 공용, registry 요약은 `lint-registry` 생성 블록). scope 강제(폰트 id는 소문자 — `font-id-case`), 파싱한 대상·조건으로 레이어 = 레벨 판정, 조상 대상 문맥 규칙 거부, `!important`·CSS nesting·중첩/익명 레이어·평가할 수 없는 조건 금지, 속성은 허용 목록(칠하기, host 글꼴 기능), 변수는 `declaredBy`·scope·레벨 레이어, 값은 registry type과 단위 없는 0 변형, 상대 자산, alias shim 외 `@import` 금지. sebul·gothic `--fy-word-gap: 0` → `0px`(렌더 불변)
- 2026-09-27: depth 페이지 우선 구현 — 평이한 depth 이름은 페이지 레벨, 폰트는 `--fy-font-*-depth`로 선언. 런타임 해석 `page longhand ?? page shorthand ?? font longhand ?? font shorthand ?? 기본값`, shipped 폰트 2종 이전
- 2026-09-27: 계약 정규화 — (1) scale도 slot → 부모 slot → role 대체 체인으로(코어 transform의 role 인수 제거, sebul의 role scale을 slot 값에 접어 전 음절 등가 0), (2) slot suffix에 `rotate`·`clip`·`dilate` 추가와 `--fy-jamo-rotate`/`--fy-ctx-rotate`, (3) slot 트리 완성(부모 9개 신설, `bbr` deprecated, 트리 규칙 checker 강제, 디스패치는 emit되는 slot만), (4) `--fy-clip`·`--fy-sprite-filter`·`--fy-optical-sprite-*` 페이지 전용 — sebul은 slot clip, sprite-example은 `--fy-sprite-dilate`로 이전, (5) `--fy-sprite-url` `@property` 등록으로 a00d624 시트 404 수정 + multi-scale `--fy-sprite-url-2x/-3x`·`--fy-sprite-image`, (6) sprite 획 보상을 slot 체인 값으로 재생성, (7) cluster generic 티어 완성과 cluster 블록 생성, (8) registry v2.1 — 변수마다 `level`/`scope`/`declaredBy`, 린트가 이를 쓴다, (9) `profiles/*.css` ↔ `spec/fonts.json` 역방향 대조, 사이드카 atomic 전용 게이트 제거, (10) sprite-system depth를 shorthand로 선언해 페이지 depth가 이기게 함(일반해는 §4)
- 2026-09-25: sprite 재료 코어화(§5) — 코어 `Sprite material` 규칙, 폰트는 `--fy-sprite-url/cell/cols/rows/kinds/row/dilate` 변수만 선언, 런타임은 `system`이 아닌 폰트에만 host `data-fy-material`·`data-fy-sprite-kinds`를 찍음. 린트가 폰트의 `background*`·`filter`·`inline-size`·`block-size`·`width`·`height`·`overflow` 선언을 막고 sprite 폰트에 `--fy-sprite-url`·`--fy-sprite-kinds`를 요구. sprite 폰트 2종 등가 이전(차이 0). v1 폰트 전용 `--sprite-*` 변수 제거
- 2026-09-25: Font Editor PoC 제거 반영 — Consequences의 PoC 현재형 서술을 과거형으로 정정
- 2026-09-24: 1단계 구현과 함께 Accepted — 레이어·레벨 변수·slot 트리·디스패치 생성·메타데이터·`loadFont`/`fontInfo`, shipped 폰트 4종 등가 이전. 구현 중 결정: L3에 `[data-fy-pos][data-jamo]` 포함, slot 단위 노드 규칙은 font 레이어, 로딩 상태는 DOM 속성 대신 `fontInfo()`, sprite 행은 `--fy-sprite-row`
- 2026-09-24: 0단계 구현 — §4의 stylesheet `load` 재해석과 `refreshAll()`, §6 ESM 진입점
- 2026-09-24: 설계 재검토(정적·import 원칙, 계층 완성) 결과로 Proposed 작성
