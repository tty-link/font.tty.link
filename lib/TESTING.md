# Testing

이 문서는 `font-kku` 검증 절차의 정본이다. 테스트 개수, HTML 케이스/노드 수, CSS
변수/자리 수처럼 구현과 함께 변하는 값은 문서에 현재값으로 복제하지 않는다. 다음
기계용 원본과 실행 결과가 권위다.

- 릴리스 단계와 순서: `scripts/verify.py`
- npm 진입점과 Node 테스트 모음: `package.json`
- 선택적 원격 CI 설정: `.github/workflows/ci.yml` (릴리스 관문은 로컬 `npm run verify`)
- 음절 내부 겹침 관문 정책: `tests/overlap-policy.json`
- 획 굵기 고르기 관문 정책: `tests/stroke-policy.json`
- HTML 계약: `spec/html-cases.json`
- CSS 변수/자리 계약: `spec/css-variables.json` + `scripts/check_css_contract.js --check`
- 글꼴 메타: `spec/fonts.json`

날짜가 붙은 과거 수치는 `CHANGELOG.md`, `docs/REVIEW/`, `archive/`의 당시 기록일 뿐
현재 통과 증거가 아니다. 현재 증거가 필요하면 아래 명령을 다시 실행한다.

## Bootstrap

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
```

전체 패키지 스모크 검사에는 PATH의 Ruby 2.7 이상과 Node/npm, Go, Rust/Cargo가 필요하다.
macOS 시스템 Ruby가 2.6이면 지원 Ruby를 먼저 활성화한다 — 저장소 루트 `.ruby-version`을
rbenv/asdf가 읽는다(예: `PATH="$HOME/.rbenv/versions/$(cat .ruby-version)/bin:$PATH"`).
`verify.py`는 실행할 단계의 도구와 Python 모듈을 사전 점검에서 검사하고, 전제가 빠지면
실제 관문 전에 빠진 목록과 해결 방법을 출력하고 exit 2로 끝난다(traceback 없음).

## 정본 진입점

```bash
npm run verify
```

- 브라우저·그리기 엔진 도구 없이 빠른 계약만(수 초): `npm run verify:fast` — JS/터미널 명령 문법,
  Node 테스트 모음, 문서, 배포 트리 링크, CSS 계약, 사본 동기화. `.venv` 없이 `python3`로 돈다. 릴리스 PASS가 아니다
- 플랫폼 시각 기준선 비교만 생략: `npm run verify -- --skip-visual`
- darwin 실측 겹침 감사만 생략: `npm run verify -- --skip-overlap`
- Playwright가 필요한 HTML/브라우저/정적/시각/겹침 단계를 생략:
  `npm run verify -- --skip-browser`
- 결과를 기계 판독 가능한 증거로 보존:
  `npm run verify -- --summary-json tmp/verify-summary.json`

`--skip-*` 결과는 생략한 범위까지 통과했다는 뜻이 아니다. 생략한 단계는 출력과
summary JSON에 사유와 함께 `SKIPPED`(`ok: null`)로 남고, 마지막 줄도 "PASS with skipped
stages"로 끝난다. 릴리스 판정은 필요한 환경(macOS)에서 생략 없이 통과한 로컬
`npm run verify`다.

## 검증 표

`scripts/verify.py`가 아래 순서를 실행한다. 표는 역할 설명이며 단계 추가·삭제의 최종
정본은 스크립트다.

| 단계 | 개별 명령(focused command) | 판정 |
| --- | --- | --- |
| JS/CLI syntax | `node --check font-kku.js && node --check bin/font-kku-text.js` | 두 진입점이 파싱됨 |
| Node contracts | `npm test` | 런타임/명세/패키지/자산/CSS/글꼴 작업실 모델 계약 통과 |
| Documentation | `npm run test:docs` | 현행+보관 문서의 로컬 링크와 현행 문서 계약 검사 통과 |
| Pages build | `python3 scripts/build_pages.py --check` | font.tty.link 배포 트리(루트 `site/`, `lib/` 패키지 파일, `lib/skill/` AI 설명서)의 상대 링크와 공개 주소 링크가 모두 실제 파일을 가리킴 |
| CSS contract | `node scripts/check_css_contract.js --check` | 레지스트리/기본 CSS/런타임/글꼴/작업실/문서 정합 (별도 단계 — `npm test`도 부른다) |
| Asset copies | `.venv/bin/python scripts/sync_assets.py --check` | 정본→사본 바이트 어긋남 없음 |
| Sidecar mirror codegen | `node scripts/generate_sidecar_tables.js --check` | 4개 언어의 생성 미러(배치·깊이 덮어쓰기·글꼴 메타·별칭·그림 자소·Unicode 표)가 명세와 일치 |
| Python renderer | `.venv/bin/python -m pytest renderers/python/tests -q` | 평문/HTML/명세/글꼴 메타데이터 정합 |
| Static tolerance | `.venv/bin/python -m pytest tests/test_static_html_parity.py -q` | 비교 허용오차 규칙 통과 |
| Tooling | `.venv/bin/python -m pytest tests/test_glyph_tools.py tests/test_font_export.py "tests/test_playwright_smoke.py::test_smoke_registration_in_sync" -q` | 글자 측정 도구 import/`--help`/순수 도우미/겹침 정책 판정, `font-kku-export.js`가 쓴 TTF·WOFF를 fontTools가 읽는지(복합 글리프·cmap·lsb·WOFF2 재저장), 스모크 등록 어긋남 없음 |
| Go renderer | `(cd renderers/go && go vet ./... && go test ./...)` | vet/test 통과 |
| Rust renderer | `(cd renderers/rust && cargo fmt --check && cargo test)` | format/test 통과 |
| Ruby renderer | `(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { \|file\| require_relative file }')` | 평문/HTML/명세·사용자 글꼴 정합 |
| Release packages | `.venv/bin/python scripts/verify.py --package-smoke all` | npm/wheel/gem/crate 격리 소비자 실행 |
| JS-derived spec | `node scripts/generate_spec_cases.js` | 생성 전후 `tables.json`/`test-cases.json` hash 동일 |
| HTML spec | `.venv/bin/python scripts/generate_html_cases.py` | 생성 전후 `html-cases.json` hash 동일 |
| Browser smoke | `.venv/bin/python -m pytest tests/test_playwright_smoke.py -q` | file/server 런타임과 데모 화면 통과 |
| Static HTML parity | `.venv/bin/python tests/static_html_parity.py` | 커밋된 HTML 케이스 전체의 DOM/style/geometry 정합 |
| Sprite cell coverage | `.venv/bin/python tests/sprite_cell_coverage.py` | sprite-system과 파생 그림 자소 글꼴마다 11,172자가 고르는 자소판 칸(`r<행>-<자모>`)이 SVG에 모두 있음 — 빈칸은 겹침·획 굵기 감사가 잡지 못한다 |
| Visual regression | `.venv/bin/python tests/visual_regression.py` | 현재 플랫폼 기준선의 픽셀 임계값 통과 |
| Overlap audit | `.venv/bin/python scripts/glyph_overlap_audit.py --policy tests/overlap-policy.json` | 모든 글꼴의 음절 내부 잉크 겹침이 정책 안 (darwin 전용, 다른 플랫폼은 사유와 함께 SKIPPED) |
| Stroke audit | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json` | 자기 획을 가진 글꼴(기반·그림 자소 파생)의 자모·자리별 획 굵기가 고르다 — 가로모음 막대·세로모음 기둥·자음 획이 기준(세로모음 기둥)에서 허용 폭 안, 의도한 차이는 사유와 함께 정책에 (darwin 전용) |
| Sprite fixture | `.venv/bin/python scripts/verify.py --sprite-smoke` | PNG/report/CSS/hash 값 정합 |
| Whitespace | `git diff --check` | 공백 오류 없음 |

`npm run verify:fast`는 위 표의 앞 일곱 줄(JS/CLI syntax, Node contracts, Documentation, Pages
build, CSS contract, Asset copies, Sidecar mirror codegen)만 돈다.

JS/HTML 생성기는 출력 파일을 수정할 수 있다. `verify.py`는 실행 전후 hash를 비교해
어긋남을 실패로 처리한다. 개별 명령을 직접 실행했다면 생성물 diff를 따로
확인한다.

브라우저 단계는 기본적으로 Playwright Chromium을 쓴다.

- `FONT_KKU_CHROME_PATH`: Chrome/Chromium 실행 파일 절대경로
- `FONT_KKU_CHROME_CHANNEL`: `chrome`, `chrome-beta`, `msedge` 같은 채널

## 관문이 다루는 범위

### Node/명세/자산

- Unicode 분해, 짜임과 배치 표
- NFC/grapheme, 공백 run, 평문 모드와 터미널 명령
- 전용 태그/클래스 방식 옵션 우선순위와 정본 `data-fy-*`
- 캐시 방어적 복사와 자동 등록(bootstrap) 끄기
- 자모 깊이와 글자 캐시 식별
- 패키지 version/export/type/bin 공개 범위
- CSS 레지스트리, 글꼴 메타데이터와 그림 자소 상수 어긋남
- 글꼴 작업실 모델(`tests/font_studio_model.test.js`): CSS 파싱·왕복 변환·편집 범위, 자소판 표, 새 그림 자소 글꼴 템플릿과 v1 그림 자소 프로젝트 가져오기
- 한글 입력기(`tests/font_kku_ime.test.js`): 두벌식 표준·세벌식 390·세벌식 최종의 키 표(행 단위 골든), 손으로 친 문장, 합자 모음·겹받침·두벌식 받침 넘김·세벌식 겹초성, 자모 단위 Backspace, 가짜 입력 칸으로 `attach()` 키 경로·한/영 전환·초점 없는 칸 캐럿, 패키지 `exports`/`files`
- 조합 체계(ADR-017, `tests/asset_sync.test.js`): `node scripts/build_looks.js --check`와 같은 대조 — `font-kku-looks.css`·`site/themes-data.js`가 `spec/themes.json`과 꾸러미 글꼴 꾸밈 구간에서 다시 만든 것과 같은지, 레이어 순서 문(`font-kku.look`, `font-kku.motion`), 정본의 깨진 참조·분류 안 된 글꼴·꾸러미 테마 규칙·없는 움직임 훅·변주 목록 불일치 거부, 꾸밈이 칠 속성만 옮기는지와 씨앗 조건 유지, 조합법의 확장 목록, 패키지 `files`/`exports`(`./fx`, 확장 CSS, `spec/themes.json`)
- 한 줄 설치 확장(`tests/font_kku.test.js`): `data-addons`가 `font-kku-looks.css`·`font-kku-motion.css`를 글꼴 뒤에 붙이고 `font-kku-fx.js`를 순서 있는 스크립트로 붙이는지, 이름 접기·중복·모르는 이름 경고, `data-addons`만 있을 때
- 상호작용(`tests/font_kku_fx.test.js`): `typingFrames`·`transitionFrames` 순수 함수, `type`의 지웠다 다시 치기·커서·한 번 도는 움직임 끄기·여러 바탕 요소 줄 나누기·멈춤·움직임 줄이기, `shuffle`의 `jamo-seeds` 켜기·누르기·주기·되돌리기, `scatter`·`magnet`·`replay`, 선언형 `bind`/`unbind`, CommonJS·ESM·타입 선언
- 글꼴 계약 v2 검사(`tests/font_lint.test.js`, `site/font-kku-lint.js`): 기본 제공 글꼴·별칭 shim·작업실 fixture 통과, 텍스트 검사 우회로(중첩 속 규칙, 범위 밖 선택자, 부분 문자열 레이어 판정, 속성 누수, 단위 없는 0 변형, `@import` 면제, 디스패치·런타임 변수, `!important`)가 코드별로 실패, 생성된 레지스트리 요약 최신성

정확한 케이스 목록과 현재 개수는 `npm test` 출력과 테스트 소스를 본다.

### HTML/정적 동등성

`spec/html-cases.json`은 브라우저 런타임이 실제 생성한 DOM의 기계용 SSOT다. 버전,
케이스 수, 노드 수, 깊이별 포함 범위를 문서에 다시 적지 않는다. 생성기와 4개 다른 언어 구현
테스트가 다음을 고정한다.

- 바탕 요소 입력과 정본 출력 namespace
- 자손의 문서 순서, `parentIndex`와 `depth`
- 짜임 키, 배치/의미 속성, part 토큰
- 줄/단어/글자/자모/그림 자소 index 속성과 기능성 style
- 깊이별 head/composite/split 노드 구조

`tests/static_html_parity.py`는 커밋된 케이스 전체에서 Python 구현과 런타임의
계산 스타일과 geometry를 비교한다. 길이·이동·경계 geometry 허용오차는
0.5px, matrix scale/shear는 0.01이다.

### 브라우저 스모크

`tests/test_playwright_smoke.py`가 file/server 모드에서 런타임과 데모 화면을 실브라우저로 확인한다.
글꼴 작업실 흐름(`assert_font_studio`, `assert_font_studio_material`, `assert_font_studio_globals`)도 여기서 돌며,
결과 CSS를 글꼴 계약 v2 검사로 확인한다.
작업실 검사는 기본 제공 글꼴의 튜닝값에 묶이지 않도록 고정 fixture 글꼴(`tests/fixtures/studio/studio-fixture.css`)로
돌고, 고정 sleep 대신 `FontStudio.settled()`를 기다린다. `assert_font_studio_checks_and_save`는 작업실의
음절 안 잉크 겹침 판정(canvas 다시 그리기)을 같은 세션·같은 페이지에서 감사와 같은 스크린샷 방식으로 잰
참조값과 ±6%p 안에서 대조하고(플랫폼 상수 없음), 모의 `showSaveFilePicker`로 첫 저장만 파일을 고르고
다음 저장은 같은 핸들을 덮어쓰며 이 글꼴로 새 글꼴을 시작한(`data-studio-rename`) 뒤에는 새 파일을 고르는지 확인한다.
`assert_font_studio_lint`는 작업실이 같은 검사기(`site/font-kku-lint.js`)를 불러오기·편집·저장·내보내기 때 돌리는지 본다:
계약을 깨는 편집이 경고 목록에 코드·줄과 함께 뜨고, 저장·내보내기는 막지 않되 경고하며, 작업실과
`check_css_contract.js`의 판정 코드가 같다.
`assert_font_studio_material_tools`는 옛 Sprite Editor 페이지에서 옮긴 재료 탭 기능(사각형·직선, 동작 단위 되돌리기·다시하기와 자소판 작업
한 단계, 채움 현황, 래스터 품질 → `--fy-sprite-rendering`/`image-rendering`과 CSS 되돌리기 동기화, 미리보기·내보내기 칸 크기,
1x·2x·3x 세트의 이름·크기·`image-set` CSS와 blob 미리보기, 작은 글씨 사전 설정, 페이지 전용 광학 보정, CSS·광학 CSS 복사)을,
`assert_font_studio_entry`는 기기 글꼴 재료를 쓰는 글꼴에서 자소판 대신 시작 안내가 보이고 `hidden` 요소가 화면에 남지 않는지,
안내 버튼과 `#studio-material` 입구가 자소판으로 데려가는지 본다.

`assert_sign_app`·`assert_memo_app`은 웹 앱(ADR-012)을 본다: 실제 키 입력이 두벌식·세벌식으로 조합돼 유니코드 값과
그림 자소 노드(투명 글자 + 실제로 뜨는 자소판)로 그려지는지, 조합 중인 음절 표시·자모 단위 Backspace·한/영 전환, 전광판 주소 상태와
전체 화면, 메모장 줄 이동·선택·되돌리기·화면 자판·저장 복원, 1280/390/360px 가로 넘침, 콘솔 오류. `?hangul-font=none`(글꼴 없는 모드)에서는
화면에 칠해지는 한글 텍스트 노드가 모두 그림 자소 노드인지 훑는다 — 기기 글꼴을 지우지 않고 "기기 글꼴로 칠하는 한글이 없다"를 구조로 검사한다.

스모크 검사 목록은 `tests/playwright_smoke.py`의 `run_check()`(명령줄 `--mode both`)와 pytest
쪽 래퍼 함수에 각각 있다. `test_smoke_registration_in_sync`(AST, 브라우저 없음)가 최상위
`assert_*` 화면 검사가 두 목록에 모두 등록됐는지와 두 목록이 같은지 확인한다. 새
`assert_*` 검사를 추가하면 두 곳에 등록한다 — 다른 `assert_*`만 부르는 도우미는 예외다.

### 글자 측정 도구와 겹침 릴리스 관문

- 글꼴 파일 내보내기(ADR-015): `tests/font_kku_export.test.js`(외곽선 추적·잘림·TTF 표·체크섬·WOFF), `tests/test_font_export.py`(fontTools 읽기), 스모크(작업실 재료 탭 내보내기, 글꼴 시험대 도트 글꼴 11,223자 내려받기 — 서버 모드), 수동 전체 검증 `python scripts/export_font_file.py --font <id> --out tmp/x.ttf --woff2 tmp/x.woff2 --compare`(표본 음절 런타임 대비 잉크 IoU)
- `tests/test_glyph_tools.py`: 모든 `scripts/glyph_*.py`의 import와 `--help`(새 도구 자동 포함),
  측정 하네스 안전장치(네트워크 글꼴 URL 금지, 고정 페이지 경로 금지, 캐시 누락·알 수 없는
  글꼴 실패, 레지스트리 기반 적합 변수), 순수 도우미, 겹침 정책 판정.
- `Overlap audit` 단계: `scripts/glyph_overlap_audit.py --policy tests/overlap-policy.json`이
  `spec/fonts.json`의 모든 글꼴을 그려 음절 안 노드 쌍의 잉크 교집합 / 작은 쪽 면적을 잰다.
  씨앗 반응 글꼴(ADR-016)은 정책 `seeds`의 씨앗마다(바탕 요소에 `seed` + `jamo-seeds`) 한 번씩 더 재서 쌍마다
  가장 큰 비율로 판정한다 — 6종 × 씨앗 4개라 이 단계가 수 분 늘어난다.
  정책의 `variations` 절(ADR-017)은 기하 변주 클래스(`kku-vary-tilt`·`kku-vary-bob`·`kku-vary-weight`·`kku-vary-width`, `font-kku-looks.css`)를 모두 함께 건
  채 씨앗마다 다시 잰다. 대상은 조합 체계의 글꼴(`spec/themes.json` `fonts`, starter 제외) 전부이고 판정은 그 글꼴 항목의
  임계·예외다. 정책은 `spec/themes.json`의 기하 변주 목록·글꼴 목록과 대조되므로, 새 기하 변주나 새 글꼴을 더하면
  `variations`도 고친다.
  표본은 정책의 `sample`이다: 기본 `family`(초성 19종 × 겹침이 잘 나는 모음·받침 계열, 약 1,050자 —
  교정용 48자 밖에 숨은 겹침을 잡는다, 글꼴당 약 15초), 출발용 뼈대 `sprite-example`만 사유와 함께 `gate`(48자).
  정책 파일은 글꼴별 `maxRatio`(기본 0.15)와 사유가 적힌 `(syllable, pair)` 예외, 예외별 상한
  `maxRatio`(더 나빠지면 실패)를 가진다. 정책에 없는 글꼴, 명세에 없는 정책 글꼴, 예외 밖의 새
  겹침, 예외 상한 초과가 실패다. 임계 아래로 내려온 예외는 `STALE`로 알려 주니 정책에서 지운다.
  측정은 darwin 실측으로 교정돼 있어(`platforms`) 다른 플랫폼에서는 verify가 사유와 함께
  SKIPPED로 기록한다.

### 패키지와 그림 자소 스모크

- npm tarball: CommonJS/ESM, TypeScript, CSS/글꼴/명세 subpath, notice, 터미널 명령
- Python wheel: 새 venv에서 격리 import와 평문/HTML/자산
- Ruby gem: 풀어 놓은 payload와 격리 `GEM_HOME` 설치
- Rust crate: 패키징된 자산과 외부 오프라인 소비자
- 그림 자소 fixture: 다중 배율 PNG 크기, 빈 칸 보고서, SHA-256와 CSS `image-set()`

Go 모듈은 source manifest version 대신 git tag가 배포 버전이다. 배포 시
`renderers/go/v<version>` 태그를 별도 릴리스 절차로 만든다.

## Font authoring checks

글꼴 교정 도구는 플랫폼·기준 글꼴에 의존하므로 겹침 감사(`Overlap audit` 단계) 외에는
자동 릴리스 검증 표에 넣지 않는다. CSS/그림 자소 시각 변경에는 관련 항목을 골라 실행하고 결과를
작업 로그에 남긴다.

```bash
node scripts/check_css_contract.js --check
.venv/bin/python -m pytest tests/test_playwright_smoke.py -q
.venv/bin/python scripts/glyph_ink_diff.py --font <font> --assert-max 0.05
.venv/bin/python scripts/glyph_metrics.py --font <font>
.venv/bin/python scripts/glyph_solve_head.py --font <font> --check
.venv/bin/python scripts/glyph_audit_pages.py
.venv/bin/python scripts/glyph_overlap_audit.py --font <font>
```

- `glyph_audit_pages.py`: 데모 페이지의 이웃 음절 충돌·잘림. 저장소 루트 정적 서버를
  빈 포트에 직접 띄운다(이미 띄운 서버는 `--base http://127.0.0.1:8000`)
- `glyph_overlap_audit.py`: 한 음절 내부 자소 간 과도한 잉크 겹침. `--font`는 한 글꼴의
  원시 측정, `--policy tests/overlap-policy.json`은 릴리스 관문 판정. 교정으로 겹침이 바뀌면
  정책의 예외(사유·상한)를 같은 변경에서 갱신한다
- `glyph_ink_diff.py`/`glyph_metrics.py`/`glyph_solve_head.py`: bbox, 구조, head 상자
- 시각 기준선 변경: `tests/visual_regression.py --update` 후 이미지 diff 수동 검토

측정 하네스(`scripts/glyph_fit_lib.py`)는 모든 글자 측정 도구가 공유한다. 요청한 기준 family가
실제로 그려지는지 폭 대조로 검증하고, 기준 family를 주지 않으면 native stack이 실제로 풀린
family를 stderr에 기록한다. 대체 글꼴로 떨어지면 측정하지 않고 exit 2로 실패한다. 페이지는 실행마다
임시 디렉터리에 써서 병렬 실행이 서로 덮어쓰지 않는다. 글꼴 목록은 `spec/fonts.json`,
적합 대상 변수는 `spec/css-variables.json`, 글자 상자는 그려진 바탕 요소의 계산 스타일에서 읽는다.

외부 기준 웹 글꼴(예: `--ref-family JSunflower`)은 `tmp/webfonts/`(git 미추적 로컬 캐시,
`FONT_KKU_WEBFONT_CACHE`로 재지정)에서만 읽는다. 측정 도구는 네트워크에서 글꼴을 받지 않고,
캐시가 없으면 어떤 파일이 없는지 말하고 실패한다. 캐시는 명시적으로 채운다:

```bash
.venv/bin/python scripts/glyph_fit_lib.py webfonts           # 캐시 상태
.venv/bin/python scripts/glyph_fit_lib.py webfonts --fetch   # 누락 파일 다운로드 (네트워크)
```

기본 제공 글꼴 검증(sebul `--ref-family "Apple SD Gothic Neo"`, gothic native stack)과 릴리스 관문인
겹침 감사는 기기 글꼴만 쓰므로 캐시가 필요 없다.

### 글꼴 계약 리팩터 동등성

글꼴 계약 구조를 바꾸는 리팩터(보정을 다른 레벨·레이어로 옮기기, 변수 체계 변경,
선언 위치 이동)는 그린 결과가 같아야 한다. `scripts/font_equivalence.py`가 전후
스냅샷으로 이를 노드 단위로 증명한다.

```bash
.venv/bin/python scripts/font_equivalence.py snapshot --out tmp/eq-before.json.gz   # 변경 전
.venv/bin/python scripts/font_equivalence.py snapshot --out tmp/eq-after.json.gz    # 변경 후
.venv/bin/python scripts/font_equivalence.py compare tmp/eq-before.json.gz tmp/eq-after.json.gz
```

- 전 한글 음절 11,172자를 기본 제공 글꼴 × 깊이(글꼴 기본, atomic, composite,
  syllable)로 실브라우저에서 그리고, 자모 노드마다 글자 기준 상자와 그리기 관련 계산
  스타일을 비교한다. `snapshot --fonts`로 대상 글꼴을 좁힐 수 있다.
- `margin`·`inset`처럼 같은 결과를 다른 경로로 낼 수 있는 속성은 비교하지 않고 그
  결과인 노드 상자를 비교한다.
- 기본 허용오차 0.035px은 Chromium LayoutUnit(1/64px) 반올림 차이분이다. exit code
  0은 동일, 1은 차이 있음.
- 교정 라운드처럼 그리기 결과를 의도적으로 바꾸는 작업에는 쓰지 않는다. 계약·리팩터 변경의
  증명 도구이며 `npm run verify` 릴리스 단계가 아니다.

자동 검증 표와 수동 저작 검사를 혼동하지 않는다. 새 검사가 릴리스를 막아야 한다면
`scripts/verify.py`에 넣고, 플랫폼 종속 수동 검사라면 이 절과 스킬의 저작 안내에 둔다.

## 문서 정책

`npm run test:docs`는 다음 두 검사를 실행한다.

- `check_markdown_links.js`: 루트, `docs/`, `skills/`, `tasks/`, `archive/` 링크. archive
  본문은 당시 기록이지만 이동 후에도 탐색 링크는 유효해야 한다.
- `check_document_contracts.js`: 현행 안내 문서가 과거 HTML/CSS/테스트 수치를 현재 계약처럼
  복제하지 않는지, 기본 제공 글꼴과 `sprite-system` 행 계약이 빠지지 않았는지 검사한다.

`brainstorming/`은 사람 전용이므로 자동 문서 검사와 에이전트 수정 대상에서 제외한다.
`docs/REVIEW/`와 `archive/`의 날짜가 붙은 수치는 당시 증거이며 현재 사실이 아니다.

## CI와 릴리스 점검표

릴리스 관문은 로컬 `npm run verify`다. `.github/workflows/ci.yml`은 원격 저장소를 쓸 때
push/pull request에서 코어, 다른 언어 구현 4종, 브라우저/정적/그림 자소/도구, Linux 시각 캡처를
분리 실행하는 선택적 설정이다. Linux 러너에서는 darwin 실측 겹침 감사를 사유와 함께 건너뛰고,
Linux 시각 job은 캡처/업로드 실패를 막지만 픽셀 승인은 수동이다.

- `npm run verify`가 macOS에서 생략 없이 통과한다(`SKIPPED` 단계 없음).
- `npm run test:docs`와 `git diff --check`가 통과한다.
- CSS/명세 변경이면 생성물과 다른 언어 구현 4종이 함께 정합한다.
- 글꼴 시각 변경이면 겹침 정책(`tests/overlap-policy.json`)이 새 상태를 정직하게 반영한다.
- 의도된 시각 변경은 기준선 diff를 사람이 검토한다.
- 원격 CI를 돌렸다면 그 결과는 로컬 PASS와 별개로 기록하고 하나를 다른 하나로 표현하지 않는다.
- 실제 패키지 레지스트리 배포/tag와 외부 자산 정책은 별도 릴리스 승인 대상으로 둔다.

과거 실행 수치를 새 릴리스의 증거로 재사용하지 않는다. 현재 판정은 해당 커밋에서 실행한
`npm run verify -- --summary-json <path>` 산출물을 쓴다.
