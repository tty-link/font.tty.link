# 글꼴 저작·교정 안내

> Status: Implemented
> Scope: 사용자와 AI 에이전트가 `font-kku`용 글꼴을 만들고 교정할 때 따라가는 실무 절차

## 목표

이 문서는 `font-kku`에서 새 글꼴을 만들거나 기존 글꼴을 교정할 때 필요한 실제 작업 절차를 한 곳에 모은다. 기존 문서들은 런타임 계약, CSS 변수 체계, 그림 자소 경로, 데모 페이지를 각각 설명하지만, "어떤 순서로 만들고 무엇을 비교하며 어디까지를 CSS로 해결해야 하는지"는 한 문서에 정리돼 있지 않았다.

이 안내서의 목적은 다음 세 가지다.

- 사람 사용자가 새 글꼴을 빠르게 시작할 수 있게 한다.
- AI 에이전트가 무리하게 런타임을 건드리지 않고 재현 가능한 순서로 교정하게 한다.
- `gothic` 같은 일반 글꼴 계열과 그림 자소 글꼴을 같은 검증 기준으로 다룰 수 있게 한다.

## 관련 문서

- [프레임워크 안내](./framework-guide.md)
- [스타일 글꼴 체계](./style-profile-system.md)
- [일반 글꼴 그룹 목록](./general-font-group-catalog.md)
- [그림 자소 글꼴](./image-sprite-fonts.md)
- [움직임과 변주](./animation-and-variation.md)
- [브라우저 런타임 설계](./browser-runtime-design.md)
- [용어집](../GLOSSARY.md)

## 용어 요약

이 문서가 반복해 쓰는 핵심 용어를 한 곳에 모은다. 전체 한글 용어는 [용어집](../GLOSSARY.md)을 따른다. 더 자세한 정의가 필요하면 `프레임워크 안내`의 `## 7. 실제 그리기 과정`, `## 8. 생성되는 DOM 구조`, `브라우저 런타임 설계`의 `## 그리기 전략 > DOM 모델`을 참조한다.

- **짜임(topology)** — 한 음절의 중성 배치 분류. 런타임이 노출하는 허용 값은 `right` / `bottom` / `split-right` 셋이다.
  - 현재 기본 제공 일반 글꼴 교정에서 가장 자주 보는 축은 `right` / `bottom` / `split-right`다.
  - `right` — 세로모음 짜임(중성이 오른쪽). 예: `가`, `장`, `밟`.
  - `bottom` — 가로모음 짜임(중성이 아래). 예: `오`, `울`, `흙`.
  - `split-right` — 섞임모음 짜임(가로·세로 모음이 섞인 복합 중성). 예: `과`, `왕`, `괆`.
- **받침(coda)** — 한 음절의 받침 구조. 값은 `none`(민글자) / `single`(홑받침) / `double`(겹받침) 셋.
- **짜임 키(layout-key)** — 짜임과 받침의 `topology:coda` 조합. 예: `right:none`, `bottom:single`, `split-right:double`. 글자 노드에 `data-layout-key`로 노출된다.
- **자리(slot)** — 자소를 배치하는 논리 위치. `--fy-<slot>-top`, `--fy-<slot>-left`, `--fy-<slot>-size`, `--fy-<slot>-scale-*`, `--fy-<slot>-rotate`, `--fy-<slot>-weight`, `--fy-<slot>-stroke`, `--fy-<slot>-clip`, `--fy-<slot>-dilate`(그림 자소) 같은 CSS 변수로 조정한다. 배치 토큰과 이름이 같다. 모든 접미사가 자리 → 부모 자리 → 역할 순으로 대체된다.
- **레벨 / 레이어** — 글꼴이 자모 노드를 제어하는 단계(글꼴 → 자리 → 자모 → 문맥)와 그 단계를 담는 cascade layer(`font-kku.font`, `font-kku.jamo`, `font-kku.context`). 정본은 [ADR-008](../ADR/ADR-008-font-contract-v2.md), 요약은 [스타일 글꼴 체계](./style-profile-system.md)의 `글꼴 계약 v2 — 레이어와 레벨` 절.
- **배치 토큰(placement token)** — 글자 안 자소 노드의 `data-fy-pos` 값. 예: `tlo`, `tro`, `mtl`, `bbrs`. 자리 변수 이름의 중간 약어와 대응한다.
- **묶음(cluster)** — 복합 중성(`jungseong-cluster`)과 겹받침(`jongseong-cluster`)을 감싸는 요소. `--fy-jung-cluster-*`, `--fy-jong-cluster-*`로 조정한다.
- **표현 방식(expression mode)** — 글꼴 CSS가 `--fy-expression-mode`로 선언하는 값. **런타임이 인정하는 정규화 출력은 `sebeol` 과 `general` 둘뿐**이다(`font-kku.js`의 `normalizeExpressionMode`). 값을 생략하거나 다른 값을 쓰면 `sebeol`로 돌아가며, `gothic`은 입력 시 `general`로 정규화되는 옛 별칭이다. 정규화 결과는 바탕 요소의 `data-fy-expression`으로 노출된다.

## `data-fy-*` 계약은 어디를 보나

글꼴 CSS가 참조할 런타임 속성이 실제로 부족한지 판정하려면 아래 두 위치의 현재 목록을 먼저 확인한다. 두 문서 모두에 없는 새 속성이 필요하면 그때만 런타임 수정을 제안한다.

- `프레임워크 안내`의 `## 8. 생성되는 DOM 구조 > 자주 보게 되는 데이터 속성` — 바탕 요소·글자·자모 단계별 `data-fy-*` 속성 표.
- `브라우저 런타임 설계`의 `## 그리기 전략 > DOM 모델` — 런타임이 DOM에 다는 속성의 계약.

## 언제 이 문서를 쓰는가

다음 상황이면 이 문서가 기준 문서다.

- 새 CSS 글꼴을 만들고 싶다.
- `profiles/gothic.css` 같은 기존 글꼴을 교정하고 싶다.
- 기기 글꼴 대신 그림 자소로 글꼴을 만들고 싶다.
- AI 에이전트에게 글꼴 조정 작업을 맡기려 한다.
- 데모 페이지와 검증 명령을 어떤 순서로 써야 할지 정하고 싶다.

## 빠른 분기

### 1. 어떤 종류의 글꼴인가

- **CSS 글꼴**
  - 기기의 한글 글꼴 또는 브라우저 기본 글꼴을 재료로 쓴다.
  - 현재 기본 제공되는 기준 글꼴은 `profiles/sebul.css`(둥근 세벌식 기본)과 `profiles/gothic.css`(일반 글꼴).
  - `profiles/default.css`와 `profiles/classic.css`는 `sebul.css`를 import하는 폐기 예정 별칭, `profiles/gothic2.css`는 `gothic.css`를 import하는 폐기 예정 별칭이다. 새 작업은 별칭을 건드리지 않는다.
  - 위치, 크기, 회전, 간격, 묶음 상자를 CSS 변수로 조정한다.

- **그림 자소 글꼴**
  - 자모 그림을 자소판으로 쓴다. 기본 제공 자소판은 획으로 직접 그린 SVG다(ADR-011).
  - `profiles/sprite-example.css` + `profiles/sprite-example.svg` 방식이다.
  - SVG는 `spec/sprite-layout.json`의 자리 상자 안에 그린다(`scripts/build_jamo_svg.js`). PNG는 `scripts/build_sprite.py`로 만든다.

### 2. 어떤 표현 방식인가

- **`sebeol`**
  - 세벌식처럼 자소 분리감이 드러나는 표현.
  - 시작점은 `profiles/sebul.css`.

- **`general`**
  - 일반 글꼴처럼 음절 결속이 중요하고 문장 리듬이 핵심인 표현.
  - 시작점은 `profiles/gothic.css`.
  - 가장 위험한 영역은 섞임모음 짜임(`split-right`)과 문장 수준 잔차다.

## 작업 파일 지도

- 런타임 기본 CSS: `font-kku.css`
- 런타임 JS: `font-kku.js`
- 기준 샘플 글꼴 CSS: `profiles/sebul.css`, `profiles/gothic.css`, `profiles/sprite-example.css`
- 폐기 예정 별칭 글꼴 CSS(수정하지 않음): `profiles/default.css`, `profiles/classic.css`, `profiles/gothic2.css`
- 글꼴 비교 / 기본 샘플 페이지(기본 글): `site/basic-text.html` — 탈네모·네모 기준과 `sebul` / `gothic` 두 글꼴 비교
- 짜임 살펴보기 + 문제 글자 점검 페이지(짜임 비교): `site/shape-comparison.html`
- 즉석 실험 / 평문 구조 비교 / TextModel JSON 페이지(놀이터): `site/api-studio.html`
- 그림 자소 점검 페이지(그림 자소 보기): `site/sprite-demo.html`
- 스모크 테스트: `. .venv/bin/activate && python -m pytest tests/test_playwright_smoke.py -q`

### 로컬에서 데모 페이지 띄우기

`site/*.html`은 상대 경로로 `font-kku.js` / `font-kku.css` / `profiles/*.css`를 불러오므로 정적 서버가 필요하다. 저장소 루트에서 아래 중 하나를 쓴다.

```bash
python3 -m http.server 8000
# 이후 브라우저에서 http://127.0.0.1:8000/site/index.html
```

`file://` 로 직접 열어도 대부분 동작하지만, 일부 브라우저의 CORS 정책에서 자소판 그림이 빠질 수 있으므로 서버 경로를 권장한다. Playwright 스모크 테스트는 내부적으로 `file://`와 `http.server` 두 경로를 모두 검증한다(`--mode both`).

## 공통 원칙

### 1. 구조는 런타임, 모양은 글꼴 CSS가 맡는다

새 글꼴 작업의 기본은 CSS다. 자소의 DOM 구조, 짜임 분류, `data-fy-*` 메타데이터, 배치 토큰은 런타임이 제공한다. 시각 조정 문제를 해결하려고 바로 `font-kku.js`를 바꾸지 않는다.

런타임을 건드리는 조건은 아래 둘 중 하나뿐이다.

- 글꼴 CSS가 참조할 안정 계약이 실제로 부족하다.
- 모든 글꼴이 공유해야 하는 구조적 버그가 재현된다.

### 2. 먼저 바탕 요소 블록 하나로 시작하고, 레벨을 골라 내려간다

특히 CSS 글꼴은 `profiles/gothic.css`처럼 글꼴 레이어의 바탕 요소 블록 하나에서 자리 변수와 묶음 변수만으로 시작하는 편이 좋다. 바탕 요소 블록으로 풀리지 않는 차이만 아래 레벨로 내린다.

작업 순서는 아래를 따른다.

1. 바탕 요소 수준 공통 폭/높이/간격, 글꼴 레벨 굵기·획(`--fy-font-weight`, `--fy-font-stroke`)
2. 자리 변수 (`--fy-tlo-*`, `--fy-trc-*`, `--fy-bbrs-*` 등, weight/stroke 포함) — 깊이 전용 값은 `[data-fy-vowel-depth="syllable"]` 같은 바탕 요소 조건으로 건다
3. 묶음 변수 (`--fy-jung-cluster-*`, `--fy-jong-cluster-*`)
4. 자모별 차이 — `font-kku.jamo` 레이어에서 자리 변수 재선언 또는 `--fy-jamo-*` 오프셋
5. 이웃 조건 — `font-kku.context` 레이어에서 `:has()`·짜임 조건과 `--fy-ctx-*` 오프셋

아래 레벨이 위 레벨을 이기는 것은 선택자 특이도나 파일 위치가 아니라 레이어다. 그래서 "어느 레벨에 쓰는가"만 맞게 고르면 규칙 순서를 신경 쓸 필요가 없다. 대신 **같은 변수는 대체된다**는 점을 기억한다. 자모 규칙과 문맥 규칙이 둘 다 `--fy-jamo-dy`를 쓰면 누적이 아니라 뒤 레이어 값 하나만 남는다. 문맥 보정은 `--fy-ctx-*`에 쓴다.

글꼴은 코어가 소유한 속성(`margin`, `inset`, `transform`, `font-size`, `font-weight`, `-webkit-text-stroke`, `clip-path`, 그림 자소 재료의 `background*`·`filter`·`inline-size`·`block-size`·`width`·`height`·`overflow` 등)과 페이지 전용 변수(`--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`, 깊이 `--fy-jamo-depth`/`--fy-vowel-depth`/`--fy-coda-depth`)를 선언하지 않는다. 글꼴의 기본 자모 깊이는 `--fy-font-jamo-depth`(또는 `--fy-font-vowel-depth`/`--fy-font-coda-depth`)로 선언한다. 자모별 잘라내기는 자모 레이어에서 자리 clip(`--fy-mt-clip` 등)을, 자모 회전은 자리 rotate나 `--fy-jamo-rotate`/`--fy-ctx-rotate`를 쓴다. `node scripts/check_css_contract.js --check`가 이를 검사한다.

### 3. 교정은 항상 고정 샘플 세트로 한다

샘플을 고정하지 않으면 매번 다른 기준으로 보정하게 된다. 한 글자, 단어, 문장 세 단계를 같이 유지한다.

### 4. 움직임과 씨앗값은 교정 중 끈다

교정 단계에서는 `animate`와 `seed`를 끈다. 움직임과 난수는 기준선 비교를 흐린다.

### 5. 실측으로 산출하고, 이미지로 판정한다 (7라운드 도입)

감으로 자리 값을 더듬지 않는다. 교정 라운드의 표준 순서:

1. **원본 실측** — `python scripts/glyph_measure.py [weight]`: 조합형 자모의 잉크
   경계 상자(bbox)를, `scripts/glyph_measure_stems.py`: 모음 세로획(stem)/가로획(bar) 위치를 잰다.
2. **목표 실측** — 같은 스크립트가 기기 글꼴 완성형(native) 음절의 잉크 좌표도 잰다 (네모꼴 목표 영역).
3. **아핀 변환 산출** — 자리별로 `소스 잉크 박스 → 목표 영역` 사상을 풀어
   top/left/size/scale을 계산한다. 이때 **DOM 세로 보정 상수**를 반영한다:
   자모 노드는 line-height:1 줄 상자에 배치되어 캔버스 `textBaseline='top'` 기준보다
   일정량 아래에 그려진다 — darwin/Apple SD Gothic Neo 스택 실측 +0.145em.
   이 상수는 글꼴 스택·플랫폼 종속이므로 스택을 바꾸면 다시 잰다.
4. **정량 관문** — `python scripts/glyph_ink_diff.py --font <font> --assert-max 0.05`:
   그린 잉크 bbox와 완성형(native)의 차이(em)를 모든 글자에 대해 확인한다.
5. **LLM 시각 판정** — `python scripts/glyph_compare.py <outdir>`로
   BEFORE(HEAD)/AFTER/NATIVE 판정 이미지를 만들어 LLM 심사자가 직접 보고
   자연스러움(획 균일·뭉개짐·오독 위험)을 판정한다. 코드 지표는 "배치가 맞는가"만,
   자연스러움은 이미지 판정만 잡는다. 세부 절차는 스킬 저작 문서 §7.1.

아핀 변환 한 번으로 안 되는 자모(세로획 위치 편차, ᅮ 내림획 등)는 자모 레이어의 자모별 보정 패턴
(스킬 저작 문서 §2.6b)으로 흡수하고, 늘이는 비율이 1.4를 넘어야 하는 목표는
목표 쪽을 양보한다 — 획 굵기 불균형이 bbox 오차보다 눈에 먼저 띈다.

## 자리 변수 요약표

기본 제공 `profiles/gothic.css`의 인라인 주석이 1차 정본이다. 아래 표는 거기서 뽑은 요약이며, 정확한 현재 값은 항상 `profiles/gothic.css`를 직접 읽어 확인한다. 축약 형태를 해석할 때 참고용으로 쓴다. 토큰 자체는 `data-fy-pos` 배치 토큰과 같다.

### 초성

| 자리 | 담당 구조 | 예시 |
| ---- | --------- | ---- |
| `t` | 가로모음·민글자 초성 | `오` / `우` / `그`의 ㅇ·ㄱ |
| `tlo` | 세로모음·민글자 초성 | `가` / `저` / `비`의 초성 |
| `tlc` | 세로모음·받침 글자 초성 | `한` / `장` / `읽`의 초성 |
| `tls` | 섞임모음·민글자 초성 | `과` / `왜` / `외` / `의`의 초성 |
| `tt` | 가로모음·받침 글자 초성 | `울` / `늘` / `글`의 ㅇ·ㄴ·ㄱ |
| `ttl` | 섞임모음·받침 글자 초성 | `왕` / `권` / `획`의 초성 |

### 중성

| 자리 | 담당 구조 | 예시 |
| ---- | --------- | ---- |
| `tro` | 세로모음·민글자 중성 | `가` / `저` / `비`의 ㅏ·ㅓ·ㅣ |
| `trc` | 세로모음·받침 글자 중성 | `한` / `장` / `읽`의 ㅏ·ㅣ |
| `trs` | 섞임모음·민글자 세로 부분(tail) | `과` / `왜` / `외` / `의`의 세로 부분 |
| `ttr` | 섞임모음·받침 글자 세로 부분(tail) | `왕` / `획`의 세로 부분 |
| `m` | 가로모음·민글자 중성 | `오` / `우` / `그`의 ㅗ·ㅜ·ㅡ |
| `ml` | 섞임모음·민글자 가로 부분(base) | `과` / `왜` / `의`의 가로 부분 |
| `mt` | 가로모음·받침 글자 중성 | `울` / `늘` / `글`의 ㅜ·ㅡ |
| `mtl` | 섞임모음·받침 글자 가로 부분(base) | `왕` / `권` / `획`의 가로 부분 |

### 종성

| 자리 | 담당 구조 | 예시 |
| ---- | --------- | ---- |
| `b` | 가로모음·홑받침 종성 | `울` / `늘` / `글`의 ㄹ·ㄴ |
| `brs` | 세로모음·홑받침 종성 | `장`의 ㅇ |
| `blr` | 세로모음·겹받침 왼쪽 | `밟` / `읽` / `닭`의 첫 받침 |
| `brd` | 세로모음·겹받침 오른쪽 | `밟`의 ㅂ, `닭`의 ㄱ |
| `bl` | 가로모음·겹받침 왼쪽 | `흙` / `긁`의 ㄹ |
| `br` | 가로모음·겹받침 오른쪽 | `흙` / `긁`의 ㄱ |
| `bbl` | 섞임모음·겹받침 왼쪽 | `괆`의 ㄹ |
| `bbrs` | 섞임모음·홑받침 종성 | `왕` / `획`의 ㅇ·ㄱ |
| `bbrd` | 섞임모음·겹받침 오른쪽 | `괆`의 ㅁ |
| `bb` | 폐기 예정인 옛 하단 중앙 자리 | 현재 배치표에서 쓰지 않음, 새로 저작하지 않음 |

각 자리는 `--fy-<token>-top`, `-left`, `-size`, `-scale-x`, `-scale-y`, `-rotate`, `-weight`, `-stroke`, `-clip`, `-dilate`를 받는다. 자식 자리 값이 없으면 부모 자리 → 역할 순으로 대체된다(scale도 곱하지 않고 대체). 부모 자리는 노드로 출력되지 않고 자식과 역할이 같다: `tc`(t·tt), `tl`(tlo·tlc·tls·ttl), `h`(hs·hts), `tr`(tro·trc), `mc`(m·mt), `mx`(mw·mtw), `xb`(ml·mtl), `xt`(trs·ttr), `bs`(b·brs·bbrs), `bx`(bw·brw·bbw), `xl`(bl·blr·bbl), `xr`(br·brd·bbrd). 정본은 레지스트리의 `parent`·`role`이다. `blb`/`brb`는 예약(reserved), `bb`/`bbr`은 폐기 예정(deprecated)이므로 새 글꼴에서 선언하지 않는다. 전체 변수·상태·기본값 정본은 `spec/css-variables.json`, 검사는 `node scripts/check_css_contract.js --check`, 글꼴 작업실의 자리 계약 갱신은 `--write`를 사용한다. 상세 방향은 [ADR-007](../ADR/ADR-007-css-variable-registry-and-editor-codegen.md)을 본다.

## 추천 샘플 세트

### 최소 스모크 세트

- `가`, `강`, `고`, `곡`, `과`, `왕`, `읽`, `밟`

이 세트만으로도 현재 기본 제공 일반 글꼴에서 핵심인 세 짜임(`right / bottom / split-right`)과 세 받침(`none / single / double`)을 한 번씩 본다.

### 일반 글꼴 고위험 세트

- 낱글자: `오`, `의`, `울`, `왕`, `권`, `획`, `외`, `읽`, `없`, `닭`, `밟`, `흙`, `긁`
- 문장: `오늘의 서울은 따뜻하다`
- 문장: `왕과 권위를 획득하다`
- 문장: `외국어를 읽을 수 없다`
- 문장: `닭을 밟고 흙을 긁다`

### 그림 자소 글꼴 확인 세트

- `광화문 광장`
- `닭을 밟고 흙을 긁다`
- 자모 전 범위를 넓게 쓰는 짧은 단어 5~10개

## 작업 흐름 A. 새 CSS 글꼴 만들기

### 1. 가장 가까운 기존 글꼴을 고른다

- `sebul` 계열이면 `profiles/sebul.css`
- 일반 글꼴 계열이면 `profiles/gothic.css`

완전히 빈 파일에서 시작하지 말고, 가장 가까운 샘플을 복사해 이름만 먼저 바꾼다.

### 2. 바탕 요소 블록을 만든다

```css
@layer font-kku.font, font-kku.jamo, font-kku.context;

@layer font-kku.font {
  :where([data-fy-font="my-font"]) {
    --fy-font-id: my-font;
    --fy-contract: 2;
    --fy-material: system;
    --fy-expression-mode: general;
    --fy-glyph-width: 1em;
    --fy-glyph-height: 1.2em;
    --fy-word-gap: 0.28em;
    --fy-line-gap: 0.12em;
    --fy-space-width: 0.5em;
  }
}
```

첫 줄의 레이어 순서 선언과 메타데이터 세 값(`--fy-font-id`는 파일 이름과 같게)은 검사가 요구한다.

먼저 아래 값만 잡는다.

- `--fy-expression-mode` — 허용 값은 `sebeol` 또는 `general` 둘뿐이다. 다른 값은 런타임이 `sebeol`로 되돌린다.
- `--fy-glyph-width`
- `--fy-glyph-height`
- `--fy-word-gap`
- `--fy-line-gap`
- `--fy-space-width`
- `--fy-font-weight` (CSS 글꼴의 글꼴 레벨 굵기 기본값)
- `--fy-font-stroke` (필요할 때만, 글꼴 레벨 획 보상 기본값)

이 단계에서는 세부 자리 덮어쓰기를 넣지 않는다.

### 3. 역할 기본값을 만든다

바탕 요소 블록에 역할 변수(`--fy-choseong-*`, `--fy-jung-main-*`, `--fy-jong-main-*` 등)로 공통 기준선을 넣는다. 자리 값이 없으면 부모 자리를 거쳐 역할 값으로 대체된다. 전체 스타일 방향은 이 단계에서 정한다.

예:

- 초성을 조금 작게 할지
- 중성을 더 세워 둘지
- 종성을 더 낮고 좁게 둘지

### 4. 짜임별 자리를 맞춘다

이제 세로모음(`right`), 가로모음(`bottom`), 섞임모음(`split-right`), 겹받침(`double coda`)처럼 실제로 깨지는 짜임을 순서대로 맞춘다.

권장 순서:

1. `right:none`
2. `right:single`
3. `bottom:none`
4. `bottom:single`
5. `split-right:none`
6. `split-right:single`
7. `right:double`, `bottom:double`, `split-right:double`

처음부터 겹받침(`double`)이나 문장 보정으로 들어가면 기준선이 흔들린다.

### 5. 묶음 상자를 마지막에 조정한다

복합 중성(`jungseong-cluster`)과 겹받침(`jongseong-cluster`)은 전체 결속을 바꾸므로 초반에 크게 만지지 않는다. 자리가 어느 정도 잡힌 뒤 광학 상자를 살짝 압축하거나 이동한다.

## 작업 흐름 B. 기존 글꼴 교정하기

### 1. 문제를 짜임으로 다시 적는다

막연히 "이상하다"가 아니라 아래 형태로 적는다.

- `split-right:none`에서 초성과 세로 부분(tail) 간격이 넓다
- `split-right:single`에서 종성이 떠 보인다
- `right:none`의 `ㅣ` 계열이 너무 오른쪽이다
- 문장 줄에서 `word gap`이 넓어 문장 폭이 길다

### 2. 문제를 한 단계만 고친다

한 번에 아래 항목 중 하나만 건드린다.

- 공통 폭/높이
- 특정 자리
- 특정 묶음
- 특정 자모(자모 레이어) 또는 이웃 조건(문맥 레이어)

여러 층을 한 번에 고치면 회귀 원인을 모르게 된다.

### 3. 낱글자와 문장을 같이 본다

`오`, `의`, `왕` 같은 낱글자가 좋아 보여도 문장 `오늘의 서울은 따뜻하다`에서 리듬이 깨지면 실패다. 반대로 문장만 맞추다 낱글자가 망가지면 재사용성이 떨어진다.

## 작업 흐름 C. 그림 자소 글꼴 만들기

### 1. 입력 형태를 고른다

- 자모 그림 폴더 기반
- 글꼴 파일을 그려 만드는 방식

### 2. 자소판을 만든다

```bash
python3 scripts/build_sprite.py --from-dir ./glyphs --out my-sprite.png --css-out my-sprite.css --report-out my-sprite.json --font-name my-sprite --scale 1 --scale 2
python3 scripts/build_sprite.py --from-font /path/to/font.ttf --out my-sprite.png --css-out my-sprite.css --font-name my-sprite
```

### 3. 생성된 CSS를 기준선으로 삼는다

`build_sprite.py`는 `/* BEGIN GENERATED: scripts/build_sprite.py … */`와 `/* END GENERATED: scripts/build_sprite.py */` 사이만 다시 쓴다. 적합 결과나 자모·문맥 보정은 이 구간 밖의 레이어 블록에 두면 재생성 때 보존된다. 마커가 없는 기존 파일은 덮어쓰지 않고 실패한다.

생성 구간은 손으로 크게 갈아엎지 말고, 아래만 우선 점검한다.

- 메타데이터(`--fy-font-id`, `--fy-contract: 2`, `--fy-material: sprite`)
- `--fy-sprite-url` — 자소판 경로(`url(...)`, 글꼴 파일 기준 상대 경로). 다중 배율은 `--fy-sprite-url-2x`/`-3x`와 `--fy-sprite-image: image-set(...)`
- `--fy-sprite-cols`, `--fy-sprite-rows` — 자소판 격자. `--fy-sprite-cell`은 기본 `1em`이라 보통 선언하지 않는다
- `--fy-sprite-kinds` — 자소판에 칸이 있는 자모 종류. 겹받침 행이 없으면 `consonant vowel`이라 통짜 겹받침은 글꼴 문자로 대신 그린다
- 종류·자리별 `--fy-sprite-row` — 자소판은 코어의 그림 자소 재료 규칙이 칠하고, 글꼴 규칙은 행 번호만 바꾼다. 글꼴이 `background*`·`filter`·칸 크기를 직접 선언하면 검사가 거부한다
- CSS 상단 해시 주석과 `my-sprite.json` 보고서

`--from-dir` 경로는 일부만 그린 상태여도 동작한다. 빠진 PNG는 투명 칸으로 채워지고 `report-out` JSON에 누락 목록이 남는다. 마감 시점에는 `--fail-on-missing`으로 닫는다.

### 4. 그림 자소 전용 회귀를 본다

아래 현상은 그림 자소 쪽 문제일 가능성이 높다.

- 모든 자모가 한 칸씩 밀려 보임
- 초성/중성/종성 행이 뒤바뀜
- 특정 종성만 비어 보임
- PNG는 맞는데 바탕 요소 크기에 비례해 확대되지 않음

## 데모 페이지 사용 순서

### `site/basic-text.html`

- 기본 비교용(기본 글). `sebul` / `gothic` 두 글꼴과 플랫폼 한글 글꼴의 완성형(native) 문장을 같은 문장에 나란히 올려 새 CSS 글꼴의 첫 인상을 확인한다.
- 구조 스트레스, 혼합 콘텐츠, 크기별 샘플까지 한 페이지에서 본다.

### `site/shape-comparison.html`

- 일반 글꼴(`general`) 교정의 기준 페이지(짜임 비교).
- 낱글자를 짜임 계열(`right` / `bottom` / `split-right`)로 묶어 `sebul` / `gothic`과 플랫폼 완성형(native) 기준을 같이 본다.
- 문제 글자 살펴보기(외/읽/없/닭/밟/흙/긁)와 `layout bucket + layout` 카탈로그 표를 제공한다.

### `site/api-studio.html`

- 글꼴(`font`), 크기(`size`), 줄바꿈 단위(`wrap-unit`), 움직임(`animate`)을 빠르게 바꿔 보는 실험 페이지(놀이터).
- DOM 미리보기, `renderText()` 2줄 평문 출력, `createTextModel()` JSON을 같은 입력으로 나란히 본다.
- 정식 회귀 기준보다는 탐색용이며, 평문 구조 검증 경로를 여기서 같이 처리한다.

### `site/sprite-demo.html`

- 그림 자소 글꼴 전용 확인 페이지(그림 자소 보기).
- 기기 글꼴 기반 결과와 나란히 비교.

## AI 에이전트 작업 규칙

### 1. 먼저 기준 글꼴과 비범위를 적는다

에이전트는 작업 시작 전에 아래를 명시해야 한다.

- 대상 글꼴 이름
- `sebeol` / `general` 중 어떤 모드인지
- CSS 글꼴 / 그림 자소 중 어느 경로인지
- 이번 라운드에서 손대지 않을 범위

### 2. JS 수정은 예외로 취급한다

시각 조정 요청인데 바로 `font-kku.js`를 수정하면 안 된다. `data-fy-*` 계약이 정말 부족한 경우에만 런타임 변경을 제안한다.

### 3. 고정 샘플 세트를 먼저 확보한다

에이전트는 적어도 아래 둘 중 하나를 먼저 고정해야 한다.

- 최소 스모크 세트
- 일반 글꼴 고위험 세트

샘플 없이 조정을 시작하지 않는다.

### 4. 낮은 레벨부터 조정한다

권장 순서:

1. 바탕 요소 폭/높이/간격
2. 자리 변수
3. 묶음 변수
4. 짜임 선택자
5. 문맥·자모 선택자

### 5. 검증까지 마친다

에이전트는 문서나 CSS만 고치고 끝나면 안 된다. 최소한 아래 중 해당 경로를 실행한다.

- `. .venv/bin/activate && python -m pytest tests/test_playwright_smoke.py -q`
- 수동 데모 비교 경로
- 자소판 생성 명령

### 6. 공개 계약이 바뀌면 문서도 함께 맞춘다

새 글꼴을 공개 샘플로 올리거나, 저작 계약을 바꾸거나, 검증 경로를 바꾸면 README 또는 관련 아키텍처 문서를 함께 갱신한다.

## 검증 점검표

### CSS 글꼴

- 새 CSS 파일이 `font-kku.css` 계약 위에서만 동작한다(런타임 JS 수정 없음).
- `node scripts/check_css_contract.js --check` 통과 — 글꼴 계약 v2 검사(`site/font-kku-lint.js`, 문법 정본 [ADR-008 §9](../ADR/ADR-008-font-contract-v2.md): 레이어 순서 선언과 레이어 밖 규칙·중첩·`!important`, 모든 선택자의 소문자 적용 범위(scope), 선택자로 판정한 레이어 = 레벨, 속성 허용 목록, 글꼴이 선언하면 안 되는 변수(레지스트리 `declaredBy`가 page·runtime·core)와 변수 범위(scope), 레지스트리 type과 길이 변수의 단위 없는 `0`, 상대 자산, 메타데이터(그림 자소 글꼴은 `--fy-sprite-url`·`--fy-sprite-kinds`까지))와 `profiles/*.css`·`spec/fonts.json`의 양방향 대응(목록에 없는 글꼴 파일·`@import` 외 내용이 있는 별칭 파일 거부)을 검사한다.
- `animate`와 `seed` 없이 기준선 비교가 된다.
- 고정 샘플 세트(최소 스모크 세트 또는 일반 글꼴 고위험 세트)를 **교정 전/후 같은 페이지·같은 크기로 스크린샷을 찍어 나란히 비교**한다. 낱글자 한 장 + 문장 한 장, 총 2장 이상이 기본이다.
- `. .venv/bin/activate && python -m pytest tests/test_playwright_smoke.py -q` 통과.

### 그림 자소 글꼴

- 자소판 생성 스크립트의 입력 경로와 인자가 작업 로그에 재현 가능한 형태로 남아 있다.
- 그림 자소 행/열 대응이 `sprite-example.css` 계약과 맞다(코어 재료 규칙의 위치 계산식 하나 + 글꼴의 종류·자리·문맥 규칙의 `--fy-sprite-row`, 자소판과 맞는 `--fy-sprite-rows`·`--fy-sprite-kinds`).
- 동일한 문장을 **두 개 이상의 바탕 요소 크기**(예: 24px와 48px)에서 스크린샷을 찍어, 두 이미지에서 자소 위치·비율이 같은 비례로 유지되는지 비교한다.
- `site/sprite-demo.html`에서 기기 글꼴 기준 결과와 나란히 비교한 스크린샷을 남긴다.

### 런타임 계약을 건드렸을 때

- `node --check font-kku.js` 통과.
- `. .venv/bin/activate && python -m pytest tests/test_playwright_smoke.py -q` 통과.
- `프레임워크 안내` 또는 `브라우저 런타임 설계`의 해당 절을 같은 작업에서 갱신.

## 흔한 실패 패턴

- **문장보다 낱글자만 맞춘다**
  - 결과: 문장 리듬이 무너진다.
- **자리가 아니라 선택자부터 늘린다**
  - 결과: CSS가 빠르게 복잡해지고 회귀가 어려워진다.
- **누적을 기대하고 같은 변수를 두 레벨에서 쓴다**
  - 결과: 뒤 레이어 값이 앞 값을 대체한다. 문맥 보정은 `--fy-ctx-*`, 자모 보정은 `--fy-jamo-*`로 분리한다.
- **자모 규칙을 글꼴 레이어에 둔다**
  - 결과: 검사는 통과하지만 같은 레이어의 자리 단위 노드 규칙(`[data-fy-pos]`, 그림 자소 행 선택)과의 우선순위가 특이도·파일 순서에 다시 의존한다. `[data-jamo]`·`[data-jamo-base]` 규칙은 `font-kku.jamo`, `:has()` 규칙은 `font-kku.context`에 둔다.
- **섞임모음 짜임(`split-right`)을 초반에 크게 건드린다**
  - 결과: 다른 짜임 기준선이 같이 흔들린다.
- **교정 중 움직임·씨앗값을 켠다**
  - 결과: 시각 비교가 불안정해진다.
- **그림 자소 문제를 DOM 문제로 오해한다**
  - 결과: 런타임을 잘못 수정하게 된다.

## 권장 완료 정의

새 글꼴이나 교정 라운드는 아래를 만족하면 닫는다.

- 어떤 샘플 세트를 기준으로 맞췄는지 문서나 작업 로그에 남아 있다.
- 고친 짜임이 명확히 적혀 있다.
- 회귀 확인 대상 페이지와 명령이 남아 있다.
- 다음 사람이 같은 기준으로 다시 비교할 수 있다.

### 작업 로그 양식

한 라운드를 닫을 때 최소한 아래 양식으로 작업 로그를 남긴다. 트랙 파일의 `## Notes`, CHANGELOG 항목, PR 설명 어디에 두어도 된다. 핵심은 다음 사람이 같은 기준으로 재현할 수 있는 형태라는 점이다.

```text
대상 font: <name>          # 예: gothic
경로: <css-driven|sprite>   # 예: css-driven
모드: <sebeol|general>      # --fy-expression-mode 값
기준 샘플 세트: <name>      # 예: 일반 글꼴 고위험 세트 (단일 glyph 13개 + 문장 4개)
건드린 topology: <list>     # 예: split-right:none, split-right:single
건드린 slot/cluster: <list> # 예: ttl, ttr, mtl, --fy-jung-cluster-closed-*
건드리지 않은 범위: <list>  # 예: right:double, sprite 경로, runtime JS
비교 방식: <방법>           # 예: shape-comparison.html 교정 전/후 32px·48px 스크린샷 2장
verify: <commands>          # 예: python -m pytest tests/test_playwright_smoke.py -q → pass
후속 이슈: <list or none>
```

## Change Log

- 2026-09-27: 계약 정규화 — 모든 자리 접미사(scale 포함)가 자리 → 부모 자리 → 역할 대체 체인, 자리 접미사에 rotate·clip·dilate 추가, 부모 자리 트리 완성(`tc`/`mc`/`mx`/`xb`/`xt`/`bs`/`bx`/`xl`/`xr`), `--fy-clip`·`--fy-sprite-filter`는 페이지 전용, 검사에 `spec/fonts.json` 역방향 대조 추가
- 2026-09-25: 그림 자소 재료 코어화(ADR-008 §5) 반영 — 생성 CSS 점검 항목을 `--fy-sprite-*` 변수로 교체, 검사의 그림 자소 재료 속성·자소판 변수 항목 추가
- 2026-09-24: 글꼴 계약 v2(ADR-008) 반영 — 레이어·레벨 작업 순서, 바탕 요소 블록 메타데이터, 자리 weight/stroke, 그림 자소 `--fy-sprite-row`와 생성 마커, v2 검사 항목
- 2026-07-10: TRK-032 CSS 변수 레지스트리, active/reserved/deprecated 자리 상태와 계약 검사 명령 반영
- 2026-04-19: 사용자와 AI 에이전트를 위한 글꼴 제작/교정 상세 안내 초안 추가
- 2026-04-19: 에이전트 활용도 보강 — 용어 요약, 자리 변수 요약표, `data-fy-*` 계약 참조 위치, 데모 로컬 서버 명령, `--fy-expression-mode` 허용 값 단언, 글꼴 별칭 분류, 검증 기준을 스크린샷 비교 절차로 구체화, 작업 로그 양식 추가
