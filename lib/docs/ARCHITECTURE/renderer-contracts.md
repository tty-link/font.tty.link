# 언어 공통 렌더 계약과 사용자 글꼴

## 정본과 경계

- [capabilities.json](../../spec/capabilities.json): 구현별 정규화·분절·출력·사용자 글꼴 지원 범위.
- [render-plan.json](../../spec/render-plan.json): 자모 깊이와 topology를 최종 표시 자리로 합성하는 정책.
- [tables.json](../../spec/tables.json): 한글·배치·Unicode 범위 표.
- [html-cases.json](../../spec/html-cases.json): 브라우저 DOM 구조와 정적 HTML의 검증 표본.
- [layout-profiles.json](../../spec/layout-profiles.json): 배치 프로파일. 글꼴을 밝히지 않은 호출의 기본 배치와 세벌 고정 도장([아래](#기본-배치세벌-고정)).
- [element-layer.json](../../spec/element-layer.json): 기본 배치의 원소 획 층 런타임 정답(ADR-027). 생성기 원소 획 표와 네 언어 원소 출력이 대조한다.

렌더 파이프라인은 텍스트 정규화/분절 → TextModel → 깊이·topology별 표시 계획 → DOM/HTML 출력이다.
생성기가 기본 placement와 두 깊이축의 override를 합성한다. JS와 네 언어 출력기는 생성된 최종
slot 배열을 읽어 head 합성, 모음 분리, 겹받침 분리 여부를 판단한다. 원문과 논리 자모는 유지한다.
HTML escaping과 실제 DOM/문자열 출력은 각 구현의 책임이며 평문 모드는 고유한 2줄 격자를 쓴다.

### 표시 계획이 공유하는 것

계획의 키는 `vowelDepth:codaDepth`이고 각 키 아래 topology 9종의 `head`·`choseong`·`jungseong`·`jongseong` 자리 배열이 있다. 3개 모음 깊이 × 2개 받침 깊이로 총 54개 행을 생성한다. 예를 들어 섞임모음에서 `syllable` 깊이는 head 자리를 만들고 초성 자리를 비우며 중성 tail 한 자리를 남긴다. `split`은 초성과 두 중성 자리를 사용한다. 겹받침의 `split`/`whole`도 최종 종성 자리 수 2/1로 결정된다.

| 책임 | 구현 위치 |
|---|---|
| 기본 placement와 깊이축 override의 합성 | `spec/render-plan.json` + 생성기 한 곳 |
| 자모·cluster의 `data-fy-role` 값 | 명세의 `emission`에서 생성한 `RENDER_ROLES` 상당의 언어별 상수 |
| head/분리/통짜 선택 | 각 출력기가 생성된 자리 배열의 유무·개수를 읽음 |
| 원문 정규화·분절과 텍스트 모델 | 각 언어 구현, 아래 Unicode 지원 범위 적용 |
| 선택한 자모 텍스트와 합자의 실제 생성 | 각 언어 구현의 표 조회·유니코드 수식 |
| HTML escaping, DOM/문자열 직렬화, CSS 읽기 | 각 언어 출력기 |
| 평문의 2줄 격자·간격·열 폭 | 별도 평문 출력기, [평문 모드 설계](./text-mode-design.md) |

`emission`의 source/condition은 출력기들이 지원하는 제한된 선택 어휘다. 생성기는 이 어휘와 역할 값을 검증하므로 지원하지 않는 선택식을 명세에 넣으면 생성을 거부한다. 역할 값과 배치 변경은 공통 생성 경로를 따르고, 새로운 자모 선택 연산은 명세와 네 언어·JS 구현을 함께 확장한다. 범용 식 인터프리터나 모든 출력 코드의 자동 생성까지 제공하는 구조는 아니다.

정본을 바꾸면 다음 순서로 생성하고 검증한다.

```sh
node scripts/generate_sidecar_tables.js --write
node scripts/generate_spec_cases.js
npm test
```

배치 프로파일(`spec/layout-profiles.json`)을 바꾸면 `node scripts/build_layout_profiles.js --write` 뒤에 위 미러 생성과 `.venv/bin/python scripts/generate_html_cases.py`(글꼴을 밝히지 않은 사례가 기록한 도장)를 함께 돌린다.

`--check`는 생성물 어긋남을 실패로 처리한다. 생성 블록을 손으로 수정하지 않는다. `generate_spec_cases.js`는 authored placement를 기존 명세에서 보존하여, 아직 생성하지 않은 명세 편집을 이전 런타임 값으로 덮어쓰지 않는다. Unicode 판을 바꿀 때는 `generate_spec_cases.js --refresh-unicode`로 표를 명시적으로 갱신하고 capability의 Unicode 판도 맞춘 뒤 위 생성·검증을 수행한다.

## Unicode 정책

숫자(`N*`)·문장부호(`P*`) 분류는 `tables.json`의 고정된 Unicode 범위를 사용한다. 따라서
기기의 Unicode 버전이 달라도 같은 단일 코드포인트는 같은 `data-glyph-kind`를 받는다.
명세에 없는 미래 문자는 명세를 갱신하기 전까지 symbol이다. ASCII latin과 완성형 한글의
분류는 기존대로 유지하며, 여러 코드포인트로 이뤄진 grapheme은 단일 문자로 분해하지 않는다.

정규화와 분절 전체가 모든 환경에서 같다는 의미는 아니다.

| 구현 | 정규화 | 분절 |
|---|---|---|
| JS | 엔진 NFC | Intl.Segmenter, 없으면 코드포인트 |
| Python | Python Unicode 데이터의 NFC | 공통 명세 UAX #29 표 |
| Go·Rust | 한글 NFC 합성, 그 밖의 정준 조합은 보존 | 공통 명세 UAX #29 표 |
| Ruby | 엔진 NFC | 엔진 grapheme 분절, 구형 Unicode의 GB9c 제한 |

지원 Unicode 판과 정규화·분절이 일치하는 입력 범위에서 언어 간 출력 동등성을 검증한다. 예를 들어 Go/Rust의 `e` + U+0301은 일반 NFC를 적용하지 않아 평문에서 `ｅ́`가 되고, 전체 NFC를 적용한 JS/Python은 `é`로 출력한다. 구형 Ruby의 Indic conjunct 분절 차이도 테스트에서 known gap으로 고정한다. glyph 분류가 고정됐다는 사실만으로 임의 Unicode 문자열의 전체 출력이 같다고 가정하면 안 된다. 남은 정규화/분절 차이는
[후속 큐](../../TODO_LIST.md)와 capability 명세에 명시한다.

## 기본 배치(세벌 고정)

브라우저 런타임처럼 네 언어 정적 렌더러도 글꼴을 밝히지 않은 호출을 기본 배치 `sebul-fixed-v1`(세벌 고정,
[ADR-026](../ADR/ADR-026-sebul-fixed-layout.md))로 그린다. `generate_sidecar_tables.js`가 정본의 도장을 런타임이 쓰는
문자열 그대로(JS `String()` + 단위) 네 언어 미러에 싣는다. 언어마다 수를 다시 서식하지 않으므로 값이 바이트 단위로 같다.

| 언어 | 글꼴을 밝히지 않은 호출 | 그림 옵션(face, [ADR-027](../ADR/ADR-027-static-element-face.md)) |
|---|---|---|
| Python | `render_html(text)`, `font=None`, `font=""` | `face=None`·`""`(자동)·`"element"`·`"device"` |
| Ruby | `FontKku.render_html(text)`, `font: nil`, `font: ""` | `face: nil`·`""`(자동)·`"element"`·`"device"` (문자열만) |
| Go | `WithFont` 없음, `WithFont("")` | `WithFace("")`(자동, 기본)·`WithFace("element")`·`WithFace("device")` |
| Rust | `font: ""` — `HtmlOptions::default()`, `render_html(text, "", ..)` | `HtmlOptions.face`: `""`(자동, 기본)·`"element"`·`"device"` |

- **판정은 런타임 `fontExplicit = Boolean(authoredFont)`와 같다.** `FontDefinition`이 없고 font가 없거나 빈 문자열일 때만
  밝히지 않은 것이다. 공백뿐인 이름(`" "`), 별칭 `default`, `sebul`, 그 밖의 이름, 모든 `FontDefinition`은 밝힌 것이다.
  이들은 글꼴 CSS의 문맥 배치(지금 배치) 그대로이고, 출력도 이 변경 전과 바이트 단위로 같다.
- **글꼴은 기본 글꼴 `sebul`이다.** `data-fy-font`·`data-fy-profile`·`data-font`·`data-profile`이 `sebul`이고, static
  문서는 지금처럼 `font-kku.css` + `sebul.css`를 싣는다.
- **깊이는 프로파일 깊이(합자 모음 `split`, 겹받침 `whole`)가 이긴다.** 깊이 인자(`jamo_depth`·`vowel_depth`·`coda_depth`)는
  검사하되(모르는 값은 여전히 오류) 무시한다. 런타임이 `--fy-jamo-depth`를 무시하는 것과 같다. 그래서 합자 모음은 두 조각의
  `jungseong-cluster`, 겹받침은 통짜 `jongseong` 하나이고 머리 음절이 없다.
- **바탕 요소:** `font` 속성을 쓰지 않는다(`font=""`도 쓰지 않는다). `data-fy-coda-depth` 바로 뒤에
  `data-fy-layout="sebul-fixed-v1"`·`data-fy-layout-model="fixed-three"`를 쓴다.
- **자모 노드:** 초성·중성·종성 노드마다 다른 속성 뒤에 `data-fy-stamp="initial|medial|final"`을 쓴다. 프로파일이 그 역할의
  그림 문맥을 정했으면 `data-fy-draw`도 쓴다(지금은 초성의 `bar`). 인라인 style에는 색인 변수 뒤에
  `--fy-stamp-left/top/size/scale-x/scale-y/weight/stroke/density` 여덟을 붙인다(density는 원소·그림 재료의 밀도 굵기 계수 — 아래
  원소 출력에서는 코어 CSS가 획 굵기에 곱하고, `face="device"`의 기기 글꼴 글자에는 닿지 않는다). 합자 모음 조각은 그 음절 합자 모음의 조각
  도장이다(0 = ㅗ·ㅜ·ㅡ 조각, 1 = 오른쪽 조각). cluster 묶음, 비한글 glyph, 낱자(`ㅋ`)에는 도장이 없다.
- **그림(원소 재료, [ADR-027](../ADR/ADR-027-static-element-face.md)):** 런타임 기본처럼 기기 글꼴과 무관한 원소 획을 그린다.
  세벌 고정에서는 자모 노드의 변환이 도장 배율 하나라 굵기 되돌림이 도장 표만으로 정해진다 — `generate_sidecar_tables.js`가 획을
  런타임 문자열 그대로 굽고(`ELEMENT_NODES` 열쇠 125개: 초성 19·홑 중성 14·합자 중성 조각 14·종성 27·낱자 51), 렌더러는 붙이기만 한다.
  생성기는 셈을 옮겨 적지 않고 `font-kku.js`의 굵기 보정 함수(`balanceElementNode`·`strokeDensity`·`dotShifts` 등)를 이름으로 꺼내 그대로
  돌린다 — 획 자리는 밀도 굵기 계수(도장 값, 낱자는 런타임 셈)의 굵기로 놓고 ㅎ·ㅊ 꼭지 틈을 연 자리다. 빌린 함수가 목록 밖 도우미를
  부르거나, 도장의 밀도(`measure_layout_stamps.py` 파이썬 사본이 셈)가 런타임 `strokeDensity`와 다르면 생성기가 실패한다.
  1. host: `data-fy-layout-model` 바로 뒤에 `data-fy-face="element"`(한글이 없어도). `data-fy-element-cap`은 없다.
  2. 도장 붙은 노드: 인라인 style 끝에 `--fy-face-width:0.865em`(`ELEMENT_DENSITY`에 열쇠가 있으면 그 뒤 `--fy-el-density` — 지금은
     없다, 도장 노드는 `--fy-stamp-density`를 코어 CSS가 받는다), 글자 바로 뒤에 `[part="hoek"]`(`data-hoek`·`-kind`·`-from`·
     `-letter`·`-role`) > 빈 `[part="element"]`(`data-element="line|ring"`, 변수는 `ELEMENT_LINE_PROPS`·`ELEMENT_RING_PROPS` 차례).
     열쇠는 도장 역할:자모, 합자 모음 조각은 `medial:<합자 모음>#<조각>`.
  3. 낱자(원문이 호환 자모 U+3131–U+3163 한 코드 포인트인 비음절 글자): content에 `data-fy-standalone`·`style="--fy-face-width:0.865em"`·획.
     런타임 굵기 보정이 밀도 굵기 계수를 노드에 적는 낱자(ㄻ·ㄼ·ㄾ·ㄿ·ㅃ 0.75, ㅞ 0.9571 — `ELEMENT_DENSITY`)는 style이
     `--fy-face-width:0.865em;--fy-el-density:<k>`다. glyph 겉 요소는 그대로다.

  `face="device"`는 원소 층(위 셋)만 뺀 출력이고 원소 재료 이전 출력과 바이트가 같다. 글꼴을 밝힌 호출·`FontDefinition`은 언제나 기기
  글꼴 글자이고 `"element"`를 주면 오류다(조용히 내리지 않는다). 그 밖의 값도 오류이고, 오류 차례는 mode → 글꼴 이름·정의 → face → 깊이다.
  CSS·자산은 바뀌지 않았다(코어 CSS에 원소 재료 규칙이 이미 있다). 한계: 페이지가 `--fy-element-width`·`--fy-scale-x/y`·`--fy-rotate`를
  덮어쓰면 런타임은 굵기를 다시 맞추지만 정적 출력은 표 값 그대로다. 기기 글꼴 잉크 맞춤(ADR-023)은 브라우저가 필요하고, 글꼴을 밝힌
  문맥 배치를 JS 없이 원소 획으로 내려면 `scripts/build_static_primitive.py`를 쓴다.
- **패리티:**
  1. DOM 계약: `spec/html-cases.json`(1.9)의 `implicitFont` 사례 7건이 도장 열쇠 74개(초성 19·홑모음 14·합자 모음 조각 14·
     받침 27)와 밀도·꼭지 틈 낱자(ㄻ ㅃ ㅞ ㅎ ㅊ)를 그린다. 네 언어 시험이 바탕 요소·노드 속성과 기능성 style을 부재까지 대조한다.
  2. 좌표: `tests/static_html_parity.py`가 같은 사례를 런타임과 계산 위치·변환·경계 상자로 비교한다. `data-fy-layout`·
     `data-fy-stamp`는 노드 정체에 넣는다. 글꼴을 밝히지 않은 사례는 `[part="hoek"]`·`[part="element"]`도 노드로 모으고
     host `data-fy-face`·`data-fy-standalone`·`--fy-face-width`·획 `data-hoek*`·`data-element`를 정체에, 마디 변수(`--fy-el-*`)와
     노드의 `--fy-face-width`부터 끝(`--fy-el-density`)까지는 차례·이름·단위가 같고 수가 1e-4 안인지 비교한다.
  3. 원소 층: `spec/element-layer.json`(1.1, 런타임 64px 정답 — 획과 노드 밀도 굵기 계수 `density`, 수 허용 차 1e-4)을 생성기 표
     (`tests/element_table.test.js`)와 네 언어 시험(열쇠 125/125, 노드 style 끝, 원소 − 층 = `"device"`)이 대조한다. 화소: 스모크 `test_sidecar_element_face_without_js`(JS 끈 정적 출력 =
     런타임, 24·64px)와 `test_sidecar_element_face_is_device_independent`(기기 글꼴을 바꿔도 같다).

  html-cases(1.9)는 원소 층을 기록하지 않는다 — 화이트리스트에 `data-fy-face`·`--fy-face-width`·`data-fy-standalone`이 없고, 파서는
  `[part="hoek"]` 하위 트리를 건너뛴다(획 span이 비어 textContent는 그대로). 설계 v1.2 §12.6대로 일차 parity는 논리 계획·좌표이고,
  원소 층은 위 3이 따로 본다. 기기 글꼴(`"device"`)의 픽셀 동일성은 약속하지 않는다.
- **이전 기본값:** 이 변경 전에는 글꼴을 밝히지 않은 호출이 `sebul` 지금 배치였다. 그 출력을 유지하려면 `font="sebul"`
  (Ruby `font: "sebul"`, Go `WithFont("sebul")`, Rust `font: "sebul"`)을 넘긴다. Python·Ruby·Go는 예전 기본값과 바이트가
  같고, 예전 Go `WithFont("")`·Rust 빈 이름은 host `font` 속성 값(`""` → `"sebul"`)만 다르다. 세벌 고정 배치는 두되 기기 글꼴 글자로
  그리려면 `face="device"`(Ruby `face: "device"`, Go `WithFace("device")`, Rust `face: "device"`)를 넘긴다.

## 호출별 사용자 글꼴

기본 포함 글꼴 외의 CSS를 서버 정적 HTML에 적용하려면 `FontDefinition`을 전달한다. 전역
레지스트리를 변경하지 않으므로 서로 다른 요청에서 같은 이름의 다른 글꼴도 격리된다.

| 필드 | 계약 |
|---|---|
| name | trim + ASCII 소문자화, `[a-z][a-z0-9-]*`; 기본 포함 글꼴과 alias 이름은 예약 |
| css | 직접 제공하는 CSS 문자열. 정적 문서에 삽입하며 fragment에는 포함하지 않음 |
| expression_mode | `sebeol`(기본) 또는 `general` |
| vowel_depth | `split`(기본), `whole`, `syllable` |
| coda_depth | `split`(기본), `whole` |
| material | `system`만 지원. sprite/vector 요청은 오류 |

정의가 있으면 같은 호출의 `font`보다 우선하고, 정의는 언제나 글꼴을 밝힌 것이라 기본 배치를 쓰지 않는다. 호출의 depth longhand > shorthand > 정의의
기본 depth 순으로 해석한다. Python/Ruby는 생성 시 기본값을 적용하고, Rust는 `Default::default()`로 기본값을 채운다. Go는 생략한 메타데이터의 빈 문자열을 검증 시 기본값으로 해석한다. 이름 예약은 현재 기본 포함 글꼴(`sebul`, `gothic`)과 alias에 적용한다.

CSS와 메타데이터는 작성자가 일치시켜 전달해야 한다. 브라우저
CSS 파서나 계산 스타일은 서버에 없으며, 이 API는 CSS 정제기가 아니다. HTML style 경계를
깨는 `</style`이 포함되면 거부한다. CSS의 상대 URL은 결과 문서의 위치를 기준으로 해석된다.

Python:

```python
from pathlib import Path
from font_kku import FontDefinition, render_html

font = FontDefinition("poster", Path("poster.css").read_text(),
                      expression_mode="general", vowel_depth="whole")
html = render_html("광화문", font_definition=font)
```

Ruby:

```ruby
require "font_kku"

font = FontKku::FontDefinition.new(name: "poster", css: File.read("poster.css"),
                                    expression_mode: "general", vowel_depth: "whole")
html = FontKku.render_html("광화문", font_definition: font)
```

Go:

```go
font := fontkku.FontDefinition{Name: "poster", CSS: cssText,
    ExpressionMode: "general", VowelDepth: "whole"}
html, err := fontkku.RenderHTML("광화문", fontkku.WithFontDefinition(font))
```

Rust:

```rust
let font = font_kku::FontDefinition {
    name: "poster", css: css_text, expression_mode: "general",
    vowel_depth: "whole", ..Default::default()
};
let html = font_kku::render_html_with_options("광화문", &font_kku::HtmlOptions {
    font_definition: Some(&font), ..Default::default()
})?;
```

브라우저 벡터 세트 등록, 자동 URL 로딩, 상호작용 효과를 정적 renderer로 옮기는 API는 아니다.
이 기능들은 capability 명세에 브라우저 전용으로 표시한다. 모르는 글꼴 이름의 오류 동작은 유지된다.

## 검증

공유 Unicode 표본, 한글 전수·깊이 조합, DOM/정적 HTML 패리티(글꼴을 밝히지 않은 기본 배치와 원소 획 포함), 원소 획 층 정답, 사용자 정의의 validation·
depth override·호출 격리, wheel/gem/crate의 실제 소비자 호출(기본 배치의 도장·원소 획, `face="device"`)을 검증한다. 한글 전수 검사는 11,172음절 × 6깊이의 실제 표시 개수와 생성 계획을 대조한다. Ruby의 사용자 글꼴 검사는 별도 파일이므로 전체 테스트를 읽는 명령을 사용한다.

```sh
(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { |file| require_relative file }')
```

정본 명령은
[TESTING.md](../../TESTING.md)의 `npm run verify:release`다.
