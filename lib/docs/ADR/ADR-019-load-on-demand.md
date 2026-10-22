# ADR-019: 필요할 때 받기 — 글꼴 CSS·자소판을 화면에 나올 때 받는다

## Status
Accepted

## Date
2026-10-11

## Context
- 한 줄 설치(ADR-010) `data-fonts`는 적힌 글꼴의 CSS를 **처음에 모두** 붙였다. 소개 페이지는 글꼴 19종을 적어 글꼴 CSS 19장과 그림 자소판 8장을 받았다. 원본 1,865KB, gzip 349KB였다.
- 사용자 지적(2026-10-11): "16종을 다 받을 필요가 있나? 필요할 때 동적으로 받으면 안 되나? 지금 설계가 최선인지, 최적화 여지가 없는지 검토하라."
- 실측(gzip -9) 결과 무게의 절반 이상은 그림 자소판이었다.

| 항목 | gzip |
|---|---|
| 그림 자소판 8장 | 194KB |
| 그중 붓 한 장 | 93KB(가독성 교정 보정 칸 포함) |
| 런타임 | 32KB |
| 글꼴 CSS | 한 장 4–12KB |

- 그림 자소판은 그 글꼴 CSS가 걸려야 브라우저가 받는다. 그러니 글꼴 CSS를 늦추면 자소판도 따라서 늦춰진다.

## Decision
### 1. 런타임이 필요할 때 받는다
- **기준 주소**
  - 한 줄 설치로 실린 런타임(`data-fonts`나 `data-addons`가 있는 `<script>`)은 스크립트 주소를 글꼴 자리로 삼는다.
  - 번들러·ESM은 `FontKkuConfig.fontBase`로 알려 준다.
  - `data-autoload="false"` 또는 `FontKkuConfig.autoload = false`면 끈다.
- **무엇을 받나**
  - 바탕 요소가 아직 받지 않은 글꼴(`fontInfo().loaded === false`)을 요청하면 `profiles/<font>.css` 한 장을 받는다.
  - 등록되지 않은 벡터 자소 세트(`jamo-set`)는 `profiles/<set>.jamo.js`를 받는다.
- **언제 받나**
  - 화면 가까이(위아래 800px) 있는 요소는 바로 받는다.
  - 그 밖의 요소는 `IntersectionObserver`로 기다렸다가 다가올 때 받는다.
  - 크기가 0인 요소(닫힌 탭·접힌 패널, `display: none`)는 보일 때 받는다.
- **받는 동안**: 바탕 요소에 `data-fy-font-pending`을 단다. 코어 CSS가 조립 전 자모를 `visibility: hidden`으로 가리고, 자리는 그대로 둔다. 도착·실패·3초 경과 중 먼저 오는 때에 뗀다.
- **한 번만 받기**: 같은 주소는 문서·shadow root마다 한 번만 받는다. 런타임의 진행 중 표 + `loadFont`가 맡는다.
- **실패하면**: 경고와 `font-kku:loaderror`를 남기고 가림막을 해제한다. 실패는 CSS의 root·URL별(자모 모듈은 document·URL별)로 관리하며, 같은 주소를 무한 반복하지 않는다. 기준 주소가 바뀌거나 `FontKku.retryFont(host)`를 호출하면 다시 시도한다([ADR-020](ADR-020-rendering-boundaries-and-recovery.md)).
- `data-fonts`의 뜻은 '처음부터 받을 글꼴(미리 받기)'이 된다. 첫 화면에 보이는 글꼴만 적는다. 기존 페이지는 그대로 동작한다. 적힌 것은 미리 받고, 적히지 않은 것도 이제는 받는다.

### 2. `.min` 이름
- 런타임이 `font-kku.min.js`로 실렸으면 CSS·확장·자소 모듈도 `.min` 이름으로 받는다.
- jsDelivr는 `.min`을 붙인 주소에 압축본을 만들어 보낸다. 저장소에는 빌드 단계를 두지 않는다(ESM 진입점과 같은 원칙).

### 3. 페이지는 꾸밈 클래스로
- 칠만 다른 꾸러미 글꼴(네온·금박 …)은 이미 받은 세벌·고딕에 `kku-look-*`를 거는 편이 CSS를 덜 받는다(ADR-017).
- 소개 첫 화면의 글꼴 칩이 그렇게 바뀌었다.

### 4. 자소판 줄이기
- 붓의 채운 윤곽은 상대 좌표(`l`·`a`)와 짧은 숫자로 쓴다.
- 일직선 위의 점은 Ramer–Douglas–Peucker(칸 100의 0.06)로 덜어낸다.
- 붓 자소판: 원본 353KB → 251KB, gzip 93KB → 47KB. 전후 렌더 IoU는 0.991이다(차이는 가장자리 안티에일리어싱).

### 5. 크기 측정 — 필요할 때 최적화 목표를 정한다
2026-10-18 사용자 결정으로 상시 gzip 상한을 없앴다. `tests/asset_sync.test.js`는 런타임·CSS·글꼴·자소판의 gzip -9 바이트를 보고만 한다. 크기가 늘어도 검증을 실패시키지 않으며, 상한 인상 사유도 요구하지 않는다.

기능 개발 중에는 크기에 맞추기 위한 변경을 하지 않는다. 추후 최적화가 필요할 때 측정값을 바탕으로 그 작업의 목표 크기와 대상 자산을 정한다.

### 결과(소개 페이지, Chromium 실측)
| | 전 | 후 |
|---|---|---|
| 처음 열었을 때 | 글꼴 CSS 19 + 자소판 8, 원본 1,865KB | 글꼴 CSS 2 + 자소판 0, 원본 321KB |
| 끝까지 내렸을 때 | 같음 | 화면에 나온 것만(CSS 15·자소판 9) |

계기판(소개 '받은 글꼴 파일')은 '지금까지 받은 것'으로 바뀌었고, 확장(꾸밈·움직임·상호작용)도 센다.

## Alternatives Considered
### 파생 글꼴이 기반 글꼴 배치를 복사하지 않고 공유한다
- 파생 글꼴 CSS는 기반 배치를 통째로 복사한다(ADR-010). 그래서 원본 16–52KB인데 gzip은 한 장 4–5KB다.
- 기반 CSS를 `[data-fy-base]`로도 맞게 하고 파생 CSS가 그것을 끌어오면 줄일 수 있다. 그러나 다음 대가가 따른다.
  - 글꼴 계약(ADR-008 §9, 글꼴마다 자기 범위)이 바뀐다.
  - 두 장의 도착 순서를 런타임이 다뤄야 한다.
- 필요할 때 받기 뒤로는 한 페이지가 받는 파생 글꼴이 몇 장뿐이고, 꾸밈 클래스(§3)가 같은 일을 CSS 0장으로 한다. 그래서 하지 않는다.

### 저장소에 압축본(dist/*.min.*)을 둔다
- 빌드 단계와 사본 드리프트가 생긴다. jsDelivr 자동 압축과 CDN의 brotli/gzip으로 충분하다.

### 화면과 무관하게 즉시 받는다
- 구현은 단순하다. 그러나 그림 자소판은 CSS가 걸리는 순간 받으므로, 화면 밖 그림 자소 글꼴이 모두 자소판을 끌어온다. 소개 페이지에서 첫 화면 1.5MB였다.

## Consequences
- 한 줄 설치만 쓰면 페이지는 미리 받을 글꼴만 적고, 나머지는 쓰는 만큼 받는다.
- 화면 밖에서 처음 그려진 요소는 그 자리에 올 때 받는다. 아주 빠르게 지나가 화면 가까이에 머문 적이 없는 요소는 다시 올 때 받는다.
- 브라우저 스모크는 페이지를 사람 속도로 훑어 내린 뒤 보이는 요소의 글꼴을 확인한다(`scroll_and_wait_fonts`).
- 새 출력 속성 `data-fy-font-pending`([dom-contract.md](../../skills/font-kku/references/dom-contract.md)).

## Related
- [ADR-010](./ADR-010-derived-fonts-and-script-loader.md) 파생 글꼴과 한 줄 설치
- [ADR-017](./ADR-017-composition-axes-and-themes.md) 조합 체계(꾸밈 클래스)
- `font-kku.js` Autoload 절, `font-kku.css` `[data-fy-font-pending]`, `tests/asset_sync.test.js` 크기 측정

## Change Log
- 2026-10-18: 사용자 지시에 따라 gzip 강제 한도를 제거하고 측정 보고만 유지. 목표 크기는 추후 최적화 작업에서 정한다.
- 2026-10-12: 문서·사이트·AI 설명서의 복사 주소 기본값을 `font-kku.min.js`로 바꿨다(사용자 승인 "모두 진행"). 0.1.1을 jsDelivr와 같은 판(Terser 5.48.0·clean-css 5.3.3)으로 흉내 낸 실측(`scripts/check_cdn_min.py --simulate`): 런타임 gzip 78,329 → 40,812 B, `profiles/sebul.css` 11,804 → 2,825 B, 첫 화면 `data-fonts="sebul neon"`(런타임·바탕 CSS·두 글꼴) 107,496 → 60,152 B(−44%). 바탕 `font-kku.css`와 `font-kku-motion.css`는 clean-css 5.3.3이 `@property` 서술자(`syntax`·`inherits`·`initial-value`)를 몰라 경고하므로 jsDelivr가 원본을 보낸다(안전, 0.1.0도 같다). 원소·기기 글꼴·그림 자소·필요할 때 받기·자소 모듈·확장의 DOM과 화소가 원본과 같다. 공개 뒤에는 같은 스크립트를 네트워크로 돌린다(ADR-022 §6). unpkg는 압축본을 만들지 않고, 즉석 압축본에는 SRI를 걸지 않는다.
- 2026-10-13: 한 줄 설치 시작 조건에 `data-jamo-sets`를 더했다 — 셋(`data-fonts`·`data-addons`·`data-jamo-sets`) 가운데 하나만 있어도 바탕 CSS·세트
  모듈을 붙이고 필요할 때 받기를 켠다(`<link>`로 CSS를 붙인 페이지도). 받을 곳이 없는데 등록되지 않은 `jamo-set`을 쓴 바탕 요소는 `load` 뒤 세트 이름마다
  한 번 경고한다. 런타임이 이미 실린 페이지의 둘째 한 줄 설치 태그는 그 사본이 `Symbol.for("font-kku.scriptTag")` 고리로 기존 런타임에 넘긴다 —
  이미 받는 중이거나 받은 CSS·모듈은 다시 받지 않고, 문서 전체 가리개를 다시 씌우지 않으며, 기준 주소가 없을 때만 정하고, 판이 다르면 먼저 실린 판
  자리에서 받는다(고리가 없는 옛 런타임이면 경고만). 그림자 트리 안 바탕 요소가 처음 그려지면 그 트리에 코어 CSS가 닿는지(원문 거울의
  `position: absolute`) 보고, 없으면 그 트리 맨 앞에 코어 CSS 링크를 한 번 넣는다(한 줄 설치 주소 → 문서의 font-kku.css 링크 → `fontBase`).
  iframe 문서에는 넣지 않고 경고만 한다(문서마다 제 스크립트 태그). `fontInfo(host).loaded`는 코어 CSS가 닿지 않으면 false다
- 2026-10-14: 0.1.3 공개 전 탐색(api-3·api-4)으로 두 가지를 고쳤다. 첫 한 줄 설치 태그가 `data-autoload="false"`로 끈 필요할 때 받기를 뒤 태그가 다시 켜지 않는다. 받을 곳이 없는 등록되지 않은 `jamo-set` 경고는 `load` 직후가 아니라 가리개를 걷는 시간(3초) 뒤에 본다 — 타이머·fetch 뒤 `registerJamo`로 곧 등록할 세트에 틀린 경고를 냈다(우리 사이트 `sprite-demo`에서도).
