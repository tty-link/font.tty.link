# ADR-009: 폰트 에디터 v2 — 계약 v2 위의 정적 단일 스튜디오

## Status
Accepted (계획한 항목 모두 구현: CSS 편집, 재료 탭, 전역·cluster 변수, PoC 두 페이지 제거, 2단계 잉크 겹침 검증, File System Access 저장)

## Date
2026-09-24

## Context
브라우저에서 폰트를 직접 만들고 고치는 것은 font-kku의 핵심 기능이다. 작성 당시 두 도구(`site/font-editor.*`, 약 3,000줄; `site/sprite-editor.*`, 약 3,700줄)는 PoC로 만들어졌고 다음 한계가 있다.

- Font Editor는 CSS 텍스트를 블록 단위로 잘라 선언을 upsert한다. 편집 가능한 레벨은 font 변수, slot 변수, cluster 변수까지다. 자모·문맥 보정(셀렉터 재선언, `--fy-top` calc, `margin`, `:has()`)을 다루지 못해 shipped 폰트(sebul, gothic, sprite-system)를 온전히 편집할 수 없다.
- 값이 어디서 왔는지 보여 주지 않는다. 계층형 변수 구조의 장점(상위 기본값 + 하위 우선)을 작성자가 눈으로 확인할 수단이 없다.
- Sprite Studio는 별도 project 모델(ADR-006)로 동작하고, CSS 폰트 편집과 연결되지 않는다.
- 겹침·충돌 같은 품질 판정은 Python/Playwright 개발 도구(`scripts/glyph_overlap_audit.py` 등)에만 있어 폰트 작성자가 쓸 수 없다.

ADR-008이 모든 보정을 레벨별 `--fy-*` 변수와 고정된 cascade layer로 표현하게 하므로, 에디터가 전 레벨을 읽고 쓸 수 있는 전제가 생긴다.

## Decision

### 1. 범위와 원칙
- 하나의 정적 스튜디오 페이지로 CSS 폰트 편집과 sprite 재료 편집을 통합한다. 서버, 빌드, 계정이 없다.
- `file://`로 열어도 동작하도록 classic script로 작성한다(ES module은 `file://`에서 CORS로 막힌다).
- 라이브러리의 공개 API와 공개 폰트 계약만 사용한다(직접 써보는 첫 사용자). 에디터 전용 private hook을 런타임에 추가하지 않는다.
- 산출물은 ADR-008 폰트 패키지(`<name>.css` + 상대 경로 자산)다. 손으로 쓴 CSS와 에디터 산출물은 같은 형식이다.
- 초기 범위는 repo-local authoring utility였다. 2026-10-16 [ADR-029](ADR-029-library-authoring-and-site.md)로 공용 제작 모델과 독립 작업실을 같은 npm 패키지의 선택 모듈로 배포하도록 확장했다. 정적·공개 API 사용·CSS 왕복 편집 원칙은 유지한다.

### 2. 문서 모델과 round-trip
- `authoring/font-studio-model.js`가 폰트 CSS를 위치 정보가 있는 트리(최상위 문장, `@layer`·`@media`·`@supports` 그룹, 규칙, 선언의 시작·값·끝 offset, 줄 번호, 특이도)로 파싱한다. 주석·문자열·괄호·`url()` 토큰을 인식하는 손 파서이고 Node에서도 돌아 단위 테스트가 가능하다.
- 파서는 **브라우저와 같게 복구한다**(CSS Syntax 3): 파일 끝에서 열린 블록을 닫고, 줄바꿈에서 끝난 문자열은 그 선언을 무효로 하고, 떠돌이 `;`·`}`는 다음 셀렉터에 붙어 그 규칙을 무효로 한다. 절대 예외를 던지지 않고 오류를 줄 번호와 함께 돌려준다. 규칙마다 레이어(중첩·익명 레이어는 Cascade 5 순위), 조건(`@media`/`@supports`/`@container`), 중첩 여부(CSS nesting의 `&` 해석)를, 선언마다 `!important`를 기록한다. 선언 값은 끝의 주석과 `!important`를 뺀 구간이라, 값을 고쳐도 근거 주석과 중요도가 남는다. `{}` 블록을 담은 사용자 정의 속성 값도 한 선언이다.
- 폰트 계약이 금지하는 `!important`·CSS nesting, 폰트가 선언한 페이지 전용 변수는 스튜디오가 린트식 경고(줄 번호)로 보여 준다. 캐스케이드 모델은 이것들도 정확히 계산한다(중요 선언은 레이어 순서가 뒤집힘).
- **편집은 원문을 다시 쓰지 않고 해당 선언만 바꾼다.** 기존 선언은 값 구간만 교체하고, 없으면 규칙 끝(한 줄 규칙은 같은 줄)에, 규칙이 없으면 해당 레이어 블록 끝에(닫는 `}`가 내용과 같은 줄에 있는 압축·한 줄 블록은 그 블록 안 같은 줄에), 레이어 블록이 없으면 파일 끝에 v2 형식으로 추가한다. 줄바꿈은 파일의 것(CRLF 포함)을 따른다. 값을 비우면 그 줄을 지우고, 빈 규칙은 규칙째 지운다. 같은 선택자의 규칙이 여럿이면 그 변수를 이미 선언한 규칙(캐스케이드가 쓰는 규칙)을 고친다. 새 선언을 만들 곳으로는 조건부(`@media` 안)·중첩·무효 규칙을 고르지 않는다. 셀렉터 비교는 CSS 이스케이프와 따옴표 형식을 정규화한다.
- 그래서 주석(조형 근거), 서식, 손으로 쓴 규칙, 에디터가 이해하지 못하는 규칙이 바이트 단위로 보존되고, 같은 편집을 두 번 적용해도 결과가 같다. shipped 폰트 4종에서 모든 선언을 자기 값으로 다시 쓰면 원문과 바이트 동일하다(테스트).
- CSSOM은 편집 모델이 아니라 미리보기(constructable stylesheet)에만 쓴다. CSSOM은 주석을 버리고 서식을 재정렬하기 때문이다.
- v1 폰트 자동 이전 명령은 두지 않는다. shipped 폰트는 ADR-008 이전에서 등가성 검사로 옮겼고, 제3자 v1 폰트는 v2 린트 메시지를 따라 옮긴다.

### 3. 편집 UX
- **라이브 미리보기**: 편집 중인 폰트를 constructable stylesheet로 적용해 편집 즉시 반영한다. 미리보기는 코어 CSS와 함께 **전용 shadow root** 안에 있어, 폰트 CSS가 스튜디오 UI를 바꿀 수 없다(`@font-face`·`@property`만 문서 수준으로 올린다). constructable sheet는 `baseURL`을 무시하므로 미리보기 사본에서만 `url()`·`image-set()`·`@import`를 폰트 파일 위치 기준 절대 URL로 바꾼다. 저장하는 CSS는 원문 그대로다.
- **값 해석 체인**: 미리보기에서 자모를 클릭하면 각 속성(생성된 slot 계약의 접미사 전부 — top, left, size, scale, rotate, weight, stroke, clip, dilate)이 어느 레벨·어느 규칙·어느 요소(노드, glyph 래퍼, host)에서 왔는지 DevTools Computed 패널처럼 보여 준다. 모델은 조건(미리보기에서 `matchMedia`/`CSS.supports`로 평가, Node에서는 평가 함수 주입), `!important`, 레이어, 특이도, 노드에서 host까지의 상속을 브라우저와 같게 계산한다. 최종값은 `getComputedStyle`로 읽고, 모델 값과 다르면(보존 블록·페이지 CSS가 개입) 그 행에 "실제 값이 모델과 다름"을 표시한다.
- **적용 범위 선택**: 드래그·방향키·숫자 입력 전에 범위를 고른다.
  - slot 가족: 방출되지 않는 부모 slot(`tl` → tlo·tlc·tls·ttl)의 host 값. 자기 slot 값을 선언한 가족원에게는 닿지 않는다
  - slot 전체: 현재 그 slot 값을 공급하는 host 규칙(depth 조건 host 규칙 포함)의 `--fy-<slot>-*`, 없으면 기본 host 규칙
  - 이 slot의 이 자모: jamo 레이어 `[data-fy-pos][data-jamo]` 규칙에 slot 변수 재선언(대체)
  - 이 자모(모든 slot): jamo 레이어 `[data-jamo]` 규칙의 `--fy-jamo-dx/dy/scale-x/scale-y/rotate`(누적)
  - 문맥: context 레이어 `[part="glyph"]:has(<같은 글자의 다른 자소>) [data-fy-pos][data-jamo]` 규칙의 `--fy-ctx-*`(누적). 조건은 선택한 글자 안의 다른 자소에서 고른다.
- **편집은 값을 실제로 공급하는 규칙에 한다**(2026-09-27): 범위가 가리키는 변수를 지금 공급하는 규칙이 있으면 그 규칙을 고친다. 그 규칙이 다른 자모·slot과 공유된 규칙(`:is(ᅥ, ᅧ)` 등)이면 경고하고 "공유 규칙 고치기 / 이 자모만 새 규칙으로 분리"를 고르게 한다. 분리 규칙은 반드시 이기도록(같은 레이어, 같거나 높은 특이도에 뒤 순서 — 필요하면 이 slot의 이 자모로 좁힌다) 만들고 현재 해석값에서 출발한다. 범위의 규칙이 더 높은 레이어·더 구체적인 규칙·`!important`·노드 재선언에 가려 선택한 자모에 보이지 않으면 편집을 거부하고 경고하며 "대신 그 규칙 고치기"를 제안한다. 편집 뒤에는 선택한 자모의 계산값을 기대값과 비교해, 반영되지 않았으면 "편집이 반영되지 않았습니다 — … 규칙(또는 폰트 밖 CSS)이 이 값을 덮음"을 보인다.
  - 드래그·방향키는 길이의 합으로 된 값을 옮긴다. `%` 리터럴은 그대로 더하고, em 값은 em 항을 유지한 채 `%` 항을 더한다(`calc(-0.065em + 1%)`). `var()` 같은 식은 숫자 입력으로 고친다.
  - 드래그 한 번(누름→뗌)은 되돌리기 한 단계이고, 되돌리기는 60단계까지 둔다. 자소를 누르면 미리보기가 초점을 받고, 범위 라디오를 포인터로 고른 뒤에도 초점이 미리보기로 돌아와 방향키가 자소를 옮긴다. 선택은 글자·slot·자모로 기억해 구조가 바뀌어도(깊이 변경) 같은 자모를 유지한다.
- **새 폰트**: 빈 템플릿이나 기존 폰트 복제로 시작한다. 폰트 이름을 바꾸면 scope 셀렉터(모든 따옴표 형식의 `[data-fy-font]`)와 `--fy-font-id`(따옴표 여부 무관)가 함께 바뀌고, 연결된 파일 핸들을 잊는다(복제본이 원본 파일을 덮지 않게). `--fy-font-id`가 없으면 이전 폰트 id를 빌리지 않고 scope 셀렉터에서 id를 얻거나 `untitled`로 두고 경고한다.
- **재료 탭**: 재료를 `system`, `sprite`, `bundled` 중에서 고른다. `sprite`이면 당시 Sprite Studio의 칸 그리기(21×2 시트, 브러시, PNG import/export)를 이 탭으로 옮긴다. sprite가 아닌 폰트에서는 시트 대신 sprite 폰트를 여는 안내를 보이고, nav "Sprite 그리기"(`?font=sprite-example#studio-material`)가 그리기 칸으로 바로 데려간다(2026-10-09).

### 4. 저장
- 기본 산출물: 폰트 CSS와 자산(PNG, woff2) 다운로드.
- 작업 상태: project JSON v2(`format: "font-kku-font-project"`, `version: 2`) = 폰트 CSS 원문 + 재료 자산 + UI 상태 최소 집합. ADR-006 v1 sprite project는 명시적 migration으로 읽는다.
- `localStorage` 초안(용량 초과 시 알리고 다운로드 경로 유지). 지원 브라우저에서는 File System Access API로 파일에 직접 저장한다.
- **초안 규칙(2026-09-27)**: 불러오기만으로는 초안을 쓰지 않고 사용자가 편집한 뒤에만 저장한다(시트 편집 포함, 시트는 dataURL). 시작할 때 남아 있던 초안은 복원하거나 버릴 때까지 보관한다 — 복원하지 않은 채 새로 편집하면 옛 초안을 옆 칸으로 옮기고(초안은 최근 두 개까지) 옮길 공간이 없으면 자동 저장을 멈추고 알린다. 용량이 모자라면 시트를 빼고 다시 저장하고, 그래도 실패하면 상태 표시줄에 실패를 보인다.
- **구현(2026-09-25)**: `showSaveFilePicker`/`showOpenFilePicker`가 있는 브라우저에서만 "파일 연결해 열기"·"파일에 저장" 버튼이 보인다. 첫 저장은 파일을 고르고, 이후 저장은 같은 핸들을 덮어쓴다. 다른 폰트를 불러오거나 이름을 바꾸면 핸들을 잊는다. 지원하지 않는 브라우저에서는 CSS 내보내기(다운로드)가 그대로 유일한 경로다.

### 5. 내장 검증 (단계적)
- 1단계(구현): 잉크 상자 기반 음절 간 충돌·글자 칸 이탈 경고. 노드 상자는 em 상자라 쓸모가 없어, canvas 텍스트 metrics(`actualBoundingBox*`, `fontBoundingBox*`)로 잉크 상자를 구하고 slot scale과 stroke를 반영한다. sprite 재료는 셀 상자를 쓴다. clip-path와 회전은 무시하므로 경고 수준이다.
- 2단계(구현): 음절 내부 잉크 겹침. `system`/`bundled` 재료는 노드별 계산된 font, weight, `-webkit-text-stroke`, 실효 배율(`getBoundingClientRect` ÷ offset 크기), `clip-path: inset()`으로 canvas에 다시 그려 잉크 마스크를 만들고, `sprite` 재료는 시트 칸을 그린다. Python 감사(`glyph_overlap_audit.py`)와 같은 판정 기준(교집합 / 작은 쪽 면적, 임계 15%)을 쓴다. 기준선은 Blink처럼 반쪽 leading을 내림해 놓고(`FontHeight::AddLeading`), canvas 글자가 페이지 글자보다 가늘게 칠해지므로 알파 64를 넘는 칸을 잉크로 친다. Playwright 검사는 같은 세션·같은 페이지에서 감사와 같은 방식(노드 하나만 보이게 한 스크린숏, 50% 잉크)으로 기준을 재서 ±6%p 안에서 대조한다(플랫폼 글꼴에 묶인 고정 수치 없음). sprite 시트가 canvas를 오염시키거나(`file://`) 시트를 불러오지 못하면 그 글자는 잴 수 없다고 표시한다("문제 없음"으로 보이지 않는다). 경고 수준의 작성 보조이고 release 게이트는 Python 감사다.
- 참조 폰트 IoU 적합은 개발 도구에 남긴다. 에디터로 옮길지는 이후에 결정한다.

### 6. 기존 도구 처리
- v2 스튜디오가 기존 기능(Font Editor의 slot/cluster 편집과 CSS diff, Sprite Studio의 시트 편집과 export)을 모두 대체하면 두 PoC 페이지를 제거한다. 그 전까지 PoC는 동결한다(버그 수정만).
- 스튜디오의 slot 계약(부모·기본값)은 `check_css_contract.js --write`가 레지스트리에서 `authoring/font-studio-model.js`에 생성한다(`file://`에서 JSON을 읽을 수 없으므로 로딩 대신 생성). PoC의 slot contract 블록은 PoC 제거 때 함께 없앤다.
- **처리 결과(2026-09-25)**: 두 PoC 페이지(`site/font-editor.*`, `site/sprite-editor.*`, `site/sprite-editor-project.js`)와 PoC 전용 테스트를 제거했다. 이력은 git에 남는다. PoC에만 있던 sprite 다중 배율(1x/2x) PNG 내보내기, 사각형 도구, 광학 크기 프리셋 UI는 이때 옮기지 않았다가 2026-10-09에 재료 탭으로 복원했다 — 배율 세트는 ADR-008의 `--fy-sprite-url-2x/-3x`·`--fy-sprite-image`로 CSS에 연결하고, 광학 프리셋은 폰트 레벨 작은 글씨 프리셋과 페이지 전용 `--fy-optical-sprite-*` 미리보기·페이지 CSS 복사로 나눴다. PoC slot contract 생성 블록도 함께 없앴고, ADR-006 v1 프로젝트는 스튜디오의 v1 가져오기로만 읽는다.
- `file://`에서는 브라우저가 shipped 폰트 CSS 읽기를 막을 수 있다(XHR 사용, 막히면 파일 열기 안내). 정적 서버로 열면 제약이 없다.

## Alternatives Considered

### Alternative A — 기존 두 PoC를 점진 개선
- 장점: 당장 작업량이 작다.
- 단점: 정규식 upsert 모델과 분리된 두 project 모델 위에서는 자모·문맥 레벨, 값 출처 표시, 재료 통합이 모두 구조적으로 어렵다.

### Alternative B — JSON 모델을 정본으로 두고 CSS를 내보내기만 함
- 장점: 편집 모델이 단순하다.
- 단점: 손으로 쓴 CSS를 다시 열 수 없다. 에디터와 손 작성이 서로 다른 형식이 된다. 기각.

### Alternative C — ES module + 번들러 기반 앱
- 장점: 코드 구성이 쉽다.
- 단점: `file://` 실행이 깨지고 빌드 단계가 생긴다. 정적·무빌드 원칙과 충돌한다. 기각.

## Consequences

### Positive
- shipped 폰트를 포함한 모든 v2 폰트를 브라우저에서 전 레벨 편집할 수 있다.
- 손 작성과 에디터가 같은 파일을 번갈아 편집해도 보존 블록과 주석이 유지된다.
- 폰트 작성자가 품질 판정(충돌, 겹침)을 도구 설치 없이 쓴다.
- 도구 두 개가 하나로 줄어든다.

### Negative
- ADR-008 코어 구현과 shipped 폰트 이전이 선행되어야 한다.
- 잉크 겹침의 canvas 재현은 브라우저 텍스트 렌더와 완전히 같지 않다. 판정은 경고 수준으로 두고, release 게이트는 기존 Python 감사를 유지한다.
- Playwright smoke 테스트(`tests/playwright_smoke.py`의 editor 구간)를 새로 작성해야 한다.

### Risks
- 보존 블록이 관리 변수를 덮으면 값 해석 체인과 실제 렌더가 어긋난다. 불일치를 표시하고 "보존 블록이 이 값을 덮음" 경고를 보여 준다(2026-09-27 구현: 인스펙터 행의 불일치 표시, 편집 뒤 "편집이 반영되지 않았습니다" 경고).
- `file://` 환경에서 일부 API(File System Access, 일부 폰트 로딩)가 제한될 수 있다. 다운로드 경로를 항상 유지한다.

## Related Documents
- PRD: [Core Product Scope](../PRD/core-product-scope.md)
- ADR: [ADR-006 Sprite project schema v1](./ADR-006-sprite-project-schema-v1.md), [ADR-007 CSS variable registry](./ADR-007-css-variable-registry-and-editor-codegen.md), [ADR-008 폰트 계약 v2](./ADR-008-font-contract-v2.md)
- Architecture: [Font Studio](../ARCHITECTURE/font-studio.md), [Sprite Authoring Studio (superseded)](../ARCHITECTURE/sprite-authoring-studio.md), [Font Authoring and Calibration Guide](../ARCHITECTURE/font-authoring-and-calibration-guide.md)

## Change Log
- 2026-10-16: ADR-029에 따라 작업실 배포 범위를 선택형 라이브러리 UI로 확장하고 사이트 페이지 구성과 분리
- 2026-10-09: 재료 탭에 이전 Sprite Editor 기능 복원(§3·§6) — 사각형 도구와 도형 미리보기, 동작 단위 되돌리기·다시(시트 작업 포함), 안내선 토글, 잉크 coverage, 시트 전체 비우기·전체 다시 채우기, 래스터 품질(ADR-008 `--fy-sprite-rendering`), 미리보기 PNG 칸, PNG 칸 크기·1x·2x·3x 배율 세트 내보내기와 `image-set` CSS 연결, 작은 글씨 프리셋(폰트 레벨)·광학 보정 미리보기와 페이지 CSS 복사(페이지 전용), 툴바 CSS 복사(보안 컨텍스트가 아니면 textarea 폴백). 입구: sprite가 아닌 폰트의 시작 안내, nav "Sprite 그리기". `hidden` 요소가 컴포넌트 `display` 규칙에 가려 화면에 남던 결함(빈 시트 패널·가짜 초안 막대) 수정
- 2026-09-27: 편집·해석 결함 수정 — 범위 편집이 값을 실제로 공급하는 규칙(공유 `:is()` 규칙 포함)을 고치고, 공유 경고와 분리 선택지, 이길 수 없는 편집의 거부와 "대신 고치기", 편집 뒤 반영 확인 경고를 추가(§3). 파서를 CSS Syntax 오류 복구·조건·`!important`·중첩·익명/중첩 레이어·CRLF·압축 블록·값 뒤 주석까지 다루도록 다시 쓰고 해석 모델이 조건·중요도·조상 요소 상속을 계산(§2·§3). 초안은 편집 뒤에만 쓰고 복원·버리기 전까지 보관, 시트 포함, 저장 실패 표시(§4). 이름을 바꾸면 파일 핸들을 잊음. PNG 가져오기는 이미지 크기에서 행·칸을 얻고 불가능한 격자를 거부, 행 수가 다르면 `--fy-sprite-rows/kinds`를 맞출지 묻고 늘이지 않음. 미리보기를 shadow root로 격리하고 상대 URL을 절대화. 2단계 겹침의 기준선·잉크 임계 보정과 잴 수 없음 표시, Playwright 대조를 같은 세션의 스크린숏 기준으로 교체. 계약 변경 반영: 생성된 slot 계약의 새 접미사(rotate·clip·dilate)와 방출되지 않는 부모 slot을 쓰는 "slot 가족" 범위, 전역 패널의 `--fy-sprite-dilate`·`--fy-font-*-depth`
- 2026-09-25: 계획한 항목 구현 완료 — §5 2단계 음절 내부 잉크 겹침(canvas 재렌더, `glyph_overlap_audit.py`와 같은 기준, sebul 참조값 대조), §4 File System Access 저장(파일 연결해 열기·파일에 저장, 미지원 브라우저는 다운로드). 재료 탭 미리보기 override는 ADR-008 §5 코어화에 따라 `--fy-sprite-url`로 바뀜
- 2026-09-25: PoC 두 페이지(Font Editor, Sprite Editor)와 PoC 전용 테스트 제거(§6 처리 결과). sprite 다중 배율 PNG 내보내기, 사각형 도구, 광학 프리셋 UI는 버렸다. ADR-006은 이 ADR로 Superseded. 남은 일: 2단계 잉크 겹침 검증, File System Access 저장
- 2026-09-24: 재료 탭 구현 — sprite 시트를 마스터 캔버스로 편집(펜·지우개·채우기·직선, 칸 되돌리기·비우기·복사·붙여넣기, 시스템 글꼴로 칸 채우기와 참고 가이드), 미리보기 자소 클릭 → 계산된 `--fy-sprite-row`/인덱스로 칸 선택, 편집은 페이지 수준 `--sprite-url` blob override로 즉시 반영, 행별 사용 칸 기준 빈 칸 진단, PNG 열기·내보내기, 프로젝트 v2에 시트 포함, 새 sprite 폰트(v2 템플릿 + 글꼴로 채운 시트), ADR-006 v1 프로젝트 이전(변수 표 → font 레이어 host 선언). 전역·cluster 변수 패널 추가(선언한 host 규칙의 그 줄을 고침)
- 2026-09-24: 1단계 구현과 함께 Accepted — `site/font-studio.html`(문서 모델·값 해석 체인·범위 편집·드래그/방향키·되돌리기·새 이름 복제·CSS/프로젝트 v2 저장·초안·잉크 상자 검증). 남은 일: 재료 탭(sprite 시트 편집, ADR-006 v1 migration), cluster·전역 변수 편집, 2단계 잉크 겹침 검증, File System Access 저장, PoC 두 페이지 제거
- 2026-09-24: 설계 재검토(브라우저 편집은 핵심 기능, 기존 에디터는 PoC) 결과로 Proposed 작성
