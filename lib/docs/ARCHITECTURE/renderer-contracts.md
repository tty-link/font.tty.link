# 언어 공통 렌더 계약과 사용자 글꼴

## 정본과 경계

- [capabilities.json](../../spec/capabilities.json): 구현별 정규화·분절·출력·사용자 글꼴 지원 범위.
- [render-plan.json](../../spec/render-plan.json): 자모 깊이와 topology를 최종 표시 자리로 합성하는 정책.
- [tables.json](../../spec/tables.json): 한글·배치·Unicode 범위 표.
- [html-cases.json](../../spec/html-cases.json): 브라우저 DOM 구조와 정적 HTML의 검증 표본.

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

정의가 있으면 같은 호출의 `font`보다 우선한다. 호출의 depth longhand > shorthand > 정의의
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
이 기능들은 capability 명세에 브라우저 전용으로 표시한다. 기존 기본 글꼴 호출과 모르는 글꼴
이름의 오류 동작은 유지된다.

## 검증

공유 Unicode 표본, 한글 전수·깊이 조합, DOM/정적 HTML 패리티, 사용자 정의의 validation·
depth override·호출 격리, wheel/gem/crate의 실제 소비자 호출을 검증한다. 한글 전수 검사는 11,172음절 × 6깊이의 실제 표시 개수와 생성 계획을 대조한다. Ruby의 사용자 글꼴 검사는 별도 파일이므로 전체 테스트를 읽는 명령을 사용한다.

```sh
(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { |file| require_relative file }')
```

정본 명령은
[TESTING.md](../../TESTING.md)의 `npm run verify`다.
