# ADR-026: 세벌 고정 배치 — 배치 프로파일과 기본 세벌

## Status
Accepted (2026-10-12) — 최종 설계 v1.2(`docs/PLAN/ponkku-final-design-v1.2/`)의 배치 계약(§10)을 저장소에 들였다.
[ADR-025](ADR-025-hangul-composition-design.md)(디자인·해석기)의 디자인 형식에 배치를 더한다.

## Date
2026-10-12

## Context

사용자는 v1.2에서 기본 글꼴을 세벌 고정으로 정했다(`sources/fixed-layout-requirements.ko.md`). "세벌식 글꼴은 예전 세벌식
타자기처럼 초성·중성·종성이 각각 정해진 위치에 정해진 크기로 그대로 찍히는 거야. 일반 글꼴은 네모꼴이어서 같은 초성이라도
글자에 따라 위치와 크기가 달라지고 도깨비불 현상도 있다. 기본 글꼴은 세벌로, 비교적 심플하고 한글 원리에 맞게."

설계의 계약은 다음과 같다.
- 세벌 고정(`fixed-three`): 같은 역할의 같은 자모는 11,172음절 어디서나 같은 원본·조립식·모양·최종 변환이다(L01).
- 받침 자리는 비워 두고 재중앙정렬하지 않는다(L07).
- 디자인 규칙은 자모·역할로만 고르고, 문맥 조건과 자리 변주는 등록을 거부한다(L08·L09).
- 네모 문맥(`adaptive-square`)은 지금의 짜임별 배치를 쓰는 선택 모델이다(L15).
- 이름이 sebul이라고 고정으로 다시 분류하지 않는다(L16). 새 화면과 새 디자인의 기본은 세벌 고정이고, 이미 저장된 것은 그대로다(L25).

지금 sebul은 이 불변식을 만족하지 않는다. 2026-10-12에 잰 초성 ㄱ의 slot은 짜임마다 다르다(가 `tlo`, 각 `tlc`, 고 `t`).
과·곽은 기본 자모 깊이(syllable)에서 머리 음절 "고"로 그린다. sebul CSS에는 이웃 자모를 보는 `:has()` 규칙도 있다(ㅖ 자르기,
ㅜ 아래 받침 ㅇ). 그래서 sebul을 세벌 고정으로 등록할 수 없고, 별도의 고정 배치를 만든다(설계 §20.4).

## Decision

### 1. 배치 프로파일 정본 — `spec/layout-profiles.json`

프로파일은 둘이다.

| 프로파일 | 모델 | 규칙 match | 배치 |
|---|---|---|---|
| `sebul-fixed-v1`@1 (기본) | `fixed-three` | jamo·role | 역할 도장 67개, 글자 칸 0.96 × 1.17em(간격 −0.095em) |
| `square-context-v1`@1 | `adaptive-square` | jamo·role·vowelLayout·hasFinal | 글꼴 CSS의 짜임별 slot 그대로(새 좌표 없음) |

`scripts/build_layout_profiles.js`가 정본을 검사하고, 런타임 표 `LAYOUT_PROFILES`(`font-kku.js` 생성 구간)와 프로파일별
글자 칸 CSS(`font-kku.css` 생성 구간)를 만든다. 공개 사본은 얼린 `FontKku.layoutProfiles`다.

### 2. 세벌 고정의 도장 — sebul에서 빌려 띠에 맞춘다

도장은 새로 지어내지 않고 교정을 마친 sebul 배치에서 잰다(`scripts/measure_layout_stamps.py`, 브라우저).

- **대표 문맥 하나: "곽" 짜임(합자 모음 + 받침).** 가장 비좁은 짜임이다. 초성은 초성 + ㅘ + ㄱ에서 재고, 받침은 ㄱ + ㅝ + 받침에서
  잰다. 겹받침은 ㄱ + ㅡ + 겹받침에서 재고 홑받침 가운데로 옮긴다. 모두 합자 모음은 조각으로, 겹받침은 통짜로 그린 지금 배치다.
- **홑모음은 조각 자리를 빌린다.** 세벌 타자기가 ㅘ를 ㅗ 글쇠와 ㅏ 글쇠로 찍듯 ㅗ는 ㅘ의 ㅗ 조각, ㅏ는 ㅘ의 ㅏ 조각,
  ㅜ·ㅓ는 ㅝ, ㅡ는 ㅢ, ㅐ·ㅔ·ㅣ는 ㅙ·ㅞ·ㅚ에서 빌린다. 조각이 없는 ㅑ·ㅒ·ㅕ·ㅖ·ㅛ·ㅠ는 닮은 모음의 자리를 쓴다. 그래서
  가·고·과·각·곽이 한 틀의 부분집합이다.
- **합자 모음은 조각 도장 둘이다**(ㅘ = ㅗ 조각 + ㅏ 조각, 설계 L12의 "fixed piece placements"). 통짜(composite) 합자 모음은 sebul이
  교정하지 않아 모양이 무너졌다. 겹받침은 통짜로 그린다. 머리 음절은 쓰지 않는다(L14).
- **맞춤 규칙(`derive.fit`)** — 측정값을 세벌 고정의 띠에 맞춘다. 규칙은 역할·자모로만 고른다.
  - 초성을 0.05em 올린다.
  - ㅗ·ㅛ(와 ㅘ·ㅙ·ㅚ의 첫 조각)는 잉크를 0.26–0.5em 띠에 맞춘다. 아래가 막힌 초성(ㅎ·ㄹ·ㅂ·ㅇ) 속으로 내림획이 올라가지 않는다.
  - ㅜ·ㅠ(와 ㅝ·ㅞ·ㅟ의 첫 조각)는 0.29–0.56em 띠에 맞춘다.
  - ㅕ·ㅖ는 곁가지가 초성에 닿아 0.09em 오른쪽으로 옮긴다.
  - ㅐ·ㅒ(와 ㅙ의 ㅐ 조각)는 기기 글꼴 재료에서 왼쪽 기둥이 초성에 붙어 0.025em 오른쪽으로 옮긴다.
  - 기기 글꼴 재료의 획 굵기: ㅡ는 세로 배율을 가운데를 두고 0.61배로, ㅗ·ㅛ·ㅜ·ㅠ는 text-stroke(0.09·0.07em)로 두껍게 한다.
    font-weight는 쓰지 않는다 — 굵기가 하나뿐인 글꼴(Android Noto Sans CJK KR Regular)에서는 듣지 않는다.
  - 모든 도장을 0.07em 내린다. 초성 잉크가 바탕 요소 위로 삐져나와 `overflow: hidden` 상자에서 잘렸기 때문이다.
    받침 아래 빈자리 안에서 옮겨, 잉크가 위아래 모두 바탕 요소 상자 안에 든다.
  - 마지막으로 원소·그림 재료의 밀도 굵기 계수(`density`, ADR-024 §3)를 도장마다 셈한다. 그 자모의 뼈대(초성은 `draw` 문맥)를
    도장 배율로 놓아 같은 방향으로 마주 보는 평행 마디의 최소 중심 간격 p(바탕 em, 점·동그라미 획 빼고)를 재고
    k = clamp(p / (1.6·t), 0.75, 1)이다(t는 sebul 원소 굵기 0.1em). 받침 ㄹ 0.82(가로획 틈 0.031 → 0.058em), ㅌ 0.77, 초성 ㄹ 0.77,
    초성 ㅋ·ㅌ·ㅃ와 ㄻ·ㄼ·ㄾ·ㄿ 0.75다. ㅎ·ㅊ 꼭지(점 획)는 꼭지 틈으로 센다(`squeeze` 0.8 — 가로획 너머를 0.8배까지 눌러도
    1.6t로 못 여는 만큼): 초성 ㅎ 0.79·ㅊ 0.82, 받침 ㅎ 0.82·ㅊ 0.85·ㄶ 0.82. 나머지 45개는 1이다. 옛 배치의 굵기 보정과 같은 셈이라
    이웃을 보지 않는다(L26).
  - 받침은 모두 잉크 윗선 0.62em에 매단다. 받침이 없어도 그 줄은 비워 둔다.
- 잰 값(`measured`)이 그 revision의 좌표다. sebul CSS가 바뀌어도 저절로 따라가지 않는다. 다시 재서 바꾸면 revision을 올린다
  (`measure_layout_stamps.py --check`가 어긋남을 알린다).
- 손으로 고칠 자리는 `nudge`(자모마다 em 이동)다. 특정 음절만 고치는 길은 없다(L26).

도장 하나는 `[left %, top %, 글자 크기 em, scale-x, scale-y, 역할, font-weight, text-stroke em, 밀도 굵기 계수]`이다.

### 3. 런타임 — 디자인이 배치를 고르고, 글꼴을 밝히지 않으면 세벌 고정

- **배치는 디자인이 고른다.** 따로 `--fy-layout`을 두지 않는다(설계 §12.3).
  - 1.2 디자인은 `layout: { profile, revision }`이 필수다.
  - 프로파일이 없거나 revision이 다르면 등록을 거부한다. 같은 이름의 최신 좌표를 끌어오지 않는다.
  - 세벌 고정이면 `match.vowelLayout`·`match.hasFinal`과 `display.variationScope: "occurrence"`도 거부한다.
  - 세벌 고정이면 합자 모음(ㅘ·ㅙ·ㅚ·ㅝ·ㅞ·ㅟ·ㅢ)을 통째로 그리라는 규칙(`method: "direct"`)도 거부한다. 합자 모음은 고정 조각
    둘이라 지킬 수 없기 때문이다(L13). 몰래 조각으로 바꾸지 않는다. 조각마다 원본을 고르는 조립식 규칙은 받는다.
  - 배치를 적지 않은 1.0·1.1 디자인은 지금 배치(legacy)로 그린다.
- **디자인이 없는 바탕 요소는 글꼴을 밝혔는지에 따라 갈린다.**
  - 글꼴을 밝히지 않았으면(`font`·`profile`·`data-font` 없음) 기본 배치 `sebul-fixed-v1`을 쓴다.
  - 글꼴을 밝혔거나(`font="sebul"` 포함) `--fy-design: legacy`를 주면 지금 배치다. 고르지 못한 디자인 이름은 디자인이 없는 경우와 같다.
- **세벌 고정으로 그릴 때:**
  - 자모 깊이는 프로파일 값(합자 모음 split, 겹받침 whole)이 이긴다.
  - 렌더가 자모 노드에 도장을 적는다. 값은 인라인 `--fy-stamp-left/top/size/scale-x/scale-y/weight/stroke/density`이고, 표시는
    `data-fy-stamp="initial|medial|final"`이다. 합자 모음 조각은 그 합자 모음의 조각 도장을 쓴다.
  - 초성에는 그림 문맥 `data-fy-draw`를 적는다. 원소·그림 재료의 초성 꼴은 모음 짜임 대신 이 값으로 정해진다.
  - 코어 CSS(`[data-fy-layout-model="fixed-three"] [data-fy-stamp]`)는 slot 값을 도장에서 받는다. 글꼴 CSS의 slot·역할·자모·문맥
    보정과 자르기, 묶음 변환은 끈다. 이 값들은 이웃 자모에 따라 달라지기 때문이다. 페이지 변수(`--fy-top`·`--fy-scale-x` 같은)는 그대로 받는다.
- **공개 표면:**
  - 바탕 요소: `data-fy-layout`(프로파일), `data-fy-layout-model`. 지금 배치면 둘 다 없다. HTML 정합 계약
    (`spec/html-cases.json` 1.9)은 이 표면과 도장을 어휘에 넣고 글꼴을 밝히지 않은 사례 6건을 더했다(글꼴을 밝힌 사례는 그대로).
  - `FontKku.fontInfo(host).layout`: `{ profile, revision, model }` 또는 null.
  - `FontKku.layoutProfiles`.
  - `FontKku.layoutStability(host)`: 그려진 결과에서도 같은 역할·자모 노드의 계산된 자리·크기·변환이 모두 같은지 →
    `{ layout, stable, keys, nodes, drifted }`. 페이지 CSS가 문맥 선택자로 자모를 옮기면 `stable: false`와 어긋난 열쇠(`"initial ᄀ"`)를
    돌려준다. 지금 배치면 `stable: null`(L22).
- 세 재료(원소·기기 글꼴·SVG 그림 세트)가 같은 도장을 쓴다(L10). 재료가 바뀌어도 배치는 바뀌지 않는다. 그림이 없어 원소로
  대체될 때도 같다(L11).

### 4. 시험과 감사

- **`tests/layout_cases.test.js`:** 설계의 사례 28개를 모두 분류한다(node 10 · browser 14 · audit 1 · deferred 3).
  node 사례는 이 파일에서 실행한다. 정본 생성기 검사, 디자인 검증, 도장 표 불변(67키, 조합용 자모만, ㅘ = ㅗ + ㅏ)을 본다.
- **Playwright `assert_fixed_layout`:** 세 재료로 11,172음절을 그려 같은 역할·자모 노드의 계산값·인라인 값·하위 그림이 모두
  같은지 본다(74키 = 초성 19 + 홑모음 14 + 합자 조각 14 + 받침 27). 문맥 CSS를 몰래 넣으면 실패하는 것을 확인했다.
  머리 음절 없음, 글자 칸 하나, sebul·네모 문맥·이전 디자인·대체·크기·낱자 사례도 함께 본다.
- **겹침 감사:** `scripts/glyph_overlap_audit.py --layout fixed`. 공개 검증(`npm run verify:release`)이 원소·기기 글꼴 두 재료로 full 표본(2,844자)을, 일상 검증(`npm run verify`)은 family 표본(1,055자)을 잰다.
  2026-10-12 기준 15% 초과는 0건이다. 맞춤 규칙 전에는 292건이었다.
- **정적 출력:** `scripts/build_static_primitive.py --font default`가 세벌 고정을 JS 없이 낸다. 도장이 인라인 변수라 그대로 실린다.
- **네 언어 정적 렌더러:** 글꼴을 밝히지 않은 `render_html` 호출이 같은 도장을 쓴다. html-cases의 `implicitFont` 사례 6건이 도장 열쇠
  74개를 모두 그리고, 네 언어 시험이 속성·style을 부재까지 대조하며, `tests/static_html_parity.py`가 런타임과 좌표를 비교한다.
  그 호출은 원소 획도 런타임처럼 그린다 — [ADR-027](ADR-027-static-element-face.md)(원소 획 표, `spec/element-layer.json`).
- **조립 기준선**(글꼴을 밝힌 42설정)은 그대로 통과한다. 지금 배치는 바뀌지 않았다.

### 5. 화면

- 소개 페이지 첫 제목과 세벌·네온·스티커 칩은 글꼴을 밝히지 않아 세벌 고정이다(L25).
- 재료 페이지(`site/faces.html`)에 "배치" 칸을 더했다. 가·고·과·각·곽 · 가·나·간·난을 세벌 고정과 세벌 문맥으로 비교한다(설계 §13.2).
- 글꼴 작업실(`site/font-studio.html`)의 첫 화면도 세벌 고정이다. 맨 주소로 들어오면 미리보기에 기본 1.2 디자인(세벌 고정, 선·원 재료)을
  걸고, 디자인 패널의 비교 칸이 지금 디자인으로 초성 ㄱ·중성 ㅏ의 자리 수를 잰다. 네모 문맥은 고급에서 고르고, 문맥 규칙이 있는
  디자인을 세벌 고정으로 되돌리면 충돌을 보이고 고를 때까지 적용하지 않는다(§13.2). 글꼴(`?font=`·`?src=`)을 밝히고 들어오면 지금
  배치 그대로다. 도장 노드의 글꼴 CSS 편집은 화면을 바꾸지 못하므로 받지 않는다([작업실 문서](../ARCHITECTURE/font-studio.md) "디자인").

## Alternatives Considered

- **sebul을 세벌 고정으로 다시 분류:** 불변식이 깨져 있어 안 된다(L16).
- **역할마다 slot 토큰 하나만 쓰기(문맥 대신 대표 토큰):** 글꼴 CSS의 자모 보정이 그대로 걸려 가장 쉽다. 하지만 `:has()` 규칙이
  이웃 자모에 따라 값을 바꿔 고정성이 깨진다.
- **무리별 잉크 영역에 표준 잉크 상자 합집합을 맞추기:** 첫 시안이다. 가로 모음·받침이 납작하게 눌리고 ㅘ가 초성과 겹쳤다.
- **"곡" 짜임(가로 모음 + 받침)에서 빌리기:** 겹침이 2,051건으로 더 나빴다.
- **합자 모음 통짜(composite):** sebul이 교정하지 않아 무너졌다.

## Consequences

- **npm 0.1.0과 출력이 다르다.** 글꼴을 밝히지 않은 `<font-kku>`는 이제 세벌 고정으로 그린다. `font="sebul"`을 밝힌 페이지는
  그대로다. 다음 공개 버전의 변경 사항에 적는다.
- **네 언어 정적 렌더러도 기본 배치를 그린다.** Python·Go·Rust·Ruby `render_html`에서 글꼴을 밝히지 않은 호출(font 없음·빈 문자열,
  `FontDefinition` 없음)은 런타임과 같은 판정(`Boolean(authoredFont)`)으로 세벌 고정이다. host에 `font` 속성이 없고
  `data-fy-layout(-model)`가 붙으며, 깊이는 split/whole이고(깊이 인자는 검사만), 자모 노드에 도장이 붙는다.
  - 도장은 `generate_sidecar_tables.js`가 `build_layout_profiles.js`의 `tables()`에서 런타임이 쓰는 문자열 그대로 네 언어 미러에 싣는다. 언어마다
    수를 다시 서식하지 않는다. 도장을 다시 재면 미러와 html-cases도 다시 만든다(`npm test`가 낡음을 잡는다).
  - 공백뿐인 이름·`default`·`sebul`과 모든 `FontDefinition`은 글꼴을 밝힌 것이라 출력이 바이트 단위로 그대로다.
  - 사이드카 호출자에게는 기본 출력이 바뀐다. 이전처럼 그리려면 `font="sebul"`을 넘긴다. 다음 공개 버전의 변경 사항에 적는다.
  - 정적 출력의 그림은 [ADR-027](ADR-027-static-element-face.md)이 정한다 — 세벌 고정에서는 원소 획이 도장 표만으로 정해져, 생성기가
    구운 원소 획 표로 런타임 기본과 같은 원소 획을 그린다(`face="device"`면 기기 글꼴 글자를 도장 자리에). 기기 글꼴 잉크 맞춤(ADR-023)은
    여전히 브라우저가 필요하다(설계 §12.6 — 일차 parity는 논리 계획·좌표, 원소 층은 `spec/element-layer.json`과 화소 스모크로 더 본다).
- **기기 글꼴 재료의 획 굵기는 맞춤 규칙으로 보정한다.** 띠에 맞추려고 세로를 줄인 모음은 막대가 가늘어지고(ㅗ 61%), ㅢ 조각을
  빌린 ㅡ는 두꺼웠다(163%). 규칙이 ㅡ의 세로 배율(가운데 고정)과 ㅗ·ㅛ·ㅜ·ㅠ의 text-stroke를 바꿔 획 굵기 감사
  (`glyph_stroke_audit.py --layout fixed`, verify 단계)를 넘긴다. 굵기가 하나뿐인 Android 글꼴에서도 ㅜ 막대가 ㅡ의 90%다.
  원소·그림 재료는 굵기를 스스로 맞춰 영향이 없다.
- **다른 브라우저·기기:** WebKit(Safari 엔진)에서 세 재료 × 11,172자 불변, 팔레트 F01–F07·B4가 통과했다. Android 글꼴(Roboto +
  Noto Sans CJK KR) 흉내 환경에서 기기 글꼴 재료가 흩어지지 않고 macOS와 자모 잉크 차이가 0.032em 이내다. 실기기 확인은 공개 뒤다.
- **사례 28개를 모두 실행한다**(node 11, browser 16, audit 1, deferred 0). 미뤘던 셋은 이렇게 닫았다:
  - L18(도장 캐시 epoch): 도장은 표 조회라 따로 캐시가 없다. 대신 도장이 한 프로파일 revision에 속함을 시험한다 — 네모 프로파일은 도장이 없고,
    다른 revision에 묶인 디자인은 거부하고, 도장 표는 얼어 있다(Node).
  - L19(글꼴 준비 epoch): 받침이 생기거나 같은 글을 다시 그려도 이미 잰 자모의 기기 글꼴 잉크를 다시 재지 않는다 — 캔버스 읽기 횟수로 본다(스모크).
  - L22(strict-stable 인증): `FontKku.layoutStability(host)`. 문맥 CSS를 몰래 넣으면 `stable: false`로 잡는다(스모크).

## Related Documents
- Design: [최종 설계 v1.2](../PLAN/ponkku-final-design-v1.2/DESIGN.ko.md) §10·§12.3·§13·§20.4·§21.3, [구현 인계](../PLAN/ponkku-final-design-v1.2/IMPLEMENTATION-PLAN.ko.md)
- Plan: [한글 조립 디자인 리팩토링 계획](../PLAN/hangul-composition-refactor.md) §L
- ADR: [ADR-027](ADR-027-static-element-face.md)(정적 렌더러의 원소 재료), [ADR-025](ADR-025-hangul-composition-design.md),
  [ADR-024](ADR-024-hangul-principle-rendering.md), [ADR-023](ADR-023-device-face-fit.md), [ADR-008](ADR-008-font-contract-v2.md)

## Change Log
- 2026-10-12: 정적 렌더러의 그림은 [ADR-027](ADR-027-static-element-face.md)로 — 글꼴을 밝히지 않은 `render_html` 호출이 원소 획 표로 런타임과 같은
  원소 획을 그린다(`face="device"`면 이전 출력). "원소 획은 브라우저가 필요하다"를 세벌 고정에서 고쳤다.
- 2026-10-12: 공개 전 조정(revision 1 그대로) — 맞춤 규칙 `density`에 꼭지 틈(`squeeze` 0.8, ADR-024 §3)을 더했다. 초성·받침 ㅎ·ㅊ과
  ㄶ 도장 다섯의 계수가 1 → 0.79–0.85이고, 측정 페이지가 계수를 그려 ㄶ·ㅊ·ㅎ 받침의 top이 0.006% 안으로 움직였다. 네 언어 미러와
  html-cases(도장 값만)를 다시 냈다. 사용자 승인 "모두 진행"(2026-10-12)
- 2026-10-12: 공개 전 조정(revision 1 그대로) — 맞춤 규칙 `density`(밀도 굵기 계수, ADR-024 §3)를 마지막 규칙으로 더하고 도장에 아홉째
  값을 실었다(인라인 `--fy-stamp-density`, 코어 CSS가 `--fy-el-density`로). 17개 도장이 1보다 작다. 측정 페이지(옛 sebul)도 계수를
  그리므로 다시 잰 도장의 자리가 겹받침·받침 ㄹ·ㅂ·ㅋ·ㅌ에서 0.0003em 안으로 움직였다. html-cases 1.9의 도장 어휘(공개 전)와 네 언어
  미러·시험을 같이 바꿨다. 스모크 `element-density`가 그려진 DOM으로 다시 잰다. 사용자 승인 "모두 진행"(2026-10-12)
- 2026-10-12: 네 언어 정적 렌더러의 기본 배치 — 미러(`generate_sidecar_tables.js`가 `layout-profiles.json`을 읽음), 글꼴을 밝히지 않은
  `render_html` 호출의 세벌 고정, html-cases 1.9(배치 어휘·`implicitFont` 사례 6건), 정적 패리티 35/35, 패키지 스모크.
  "네 언어 정적 렌더러는 배치 프로파일을 아직 모른다" 결과를 닫았다.
- 2026-10-12: §5 화면에 글꼴 작업실 — 첫 화면이 세벌 고정 기본 디자인, 대표 비교 칸, 네모 문맥 전환과 충돌 처리, 도장 노드 편집 거부.
- 2026-10-12: 미룬 사례 L18·L19·L22를 시험으로 닫았다. 공개 진단 `FontKku.layoutStability(host)`(L22).
- 2026-10-12: 공개 전 좌표 조정(revision 1 그대로 — 아직 공개되지 않았다). 기기 글꼴 획 굵기(ㅡ 세로 배율, ㅗ·ㅛ·ㅜ·ㅠ text-stroke —
  굵기 하나뿐인 Android 글꼴에서도 듣게 font-weight 대신), ㅐ·ㅒ 0.025em 오른쪽, 모든 도장 0.07em 아래(잉크가 바탕 요소 상자 안에 — 스모크가 본다).
  세벌 고정 디자인의 통짜 합자 모음 규칙 거부(L13). 획 굵기 감사 `--layout fixed`(verify 단계). WebKit·Android(흉내) 확인. 팔레트 글꼴 확인이
  실어 받은 웹 글꼴(@font-face loaded)을 대체 의심으로 보지 않는다.
- 2026-10-12: Accepted. 배치 프로파일 정본·생성기·측정기, 세벌 고정 런타임(도장·그림 문맥·코어 CSS), 디자인 1.2 `layout` 검증,
  기본 배치(글꼴을 밝히지 않은 바탕 요소), 사례 시험·11,172자 불변 스모크·겹침 감사, 소개 페이지와 재료 페이지 비교 칸.
