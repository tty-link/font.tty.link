# Testing

이 문서는 `font-kku` 검증 절차의 정본이다. 테스트 개수, HTML 케이스/노드 수, CSS
변수/자리 수처럼 구현과 함께 변하는 값은 문서에 현재값으로 복제하지 않는다. 다음
기계용 원본과 실행 결과가 권위다.

- 릴리스 단계와 순서: `scripts/verify.py`
- npm 진입점과 Node 테스트 모음: `package.json`
- 선택적 원격 CI 설정: `.github/workflows/ci.yml` (릴리스 관문은 로컬 `npm run verify:release`)
- 음절 내부 겹침 관문 정책: `tests/overlap-policy.json`
- 획 굵기 고르기 관문 정책: `tests/stroke-policy.json`
- HTML 계약: `spec/html-cases.json`
- 원소 획 층 정답(기본 배치의 원소 재료, ADR-027): `spec/element-layer.json`
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
npm run verify            # 일상 — 줄인 측정 표본·측정 캐시
npm run verify:release    # 공개 전 — 전체 표본·씨앗·변주, 캐시를 읽지 않음
```

검증은 세 층이다(2026-10-12).

| 명령 | 층 | 측정 | 쓰는 때 |
|---|---|---|---|
| `npm run verify:fast` | 빠른 계약 | 없음(Node·문서·CSS 계약·사본) | 수정마다 |
| `npm run verify` | 일상 | 모든 단계. 겹침 감사는 표본 `family`·씨앗 첫 하나, 측정 캐시를 읽는다 | 큰 변경을 마칠 때 |
| `npm run verify:release` | 공개 | 모든 단계. 정책 표본(`full`)·씨앗·변주 전부, 측정 캐시를 읽지 않고 새로 쓴다 | npm 공개·사이트 배포 전 |

브라우저 측정은 프로세스 여럿이 동시에 잰다 — 겹침·획 굵기 감사는 240자 세션 하나, 조립 기준선은 설정 하나가 일 하나다 —
`--jobs N`(또는 `FONT_KKU_JOBS`, 기본 코어 수 − 2를 메모리로 제한). 브라우저 스모크는 `pytest-xdist`가 있으면 일꾼 여럿으로
돈다(기본 min(4, 코어 수 / 2)). 감사 도구를 손으로 돌리면 기본이 캐시 읽기(`--cache use`)다 — 공개 판정과 같은 측정은 `--cache refresh`.
측정 캐시(`scripts/measure_cache.py`, `tmp/verify-cache/`, 폴더는 `FONT_KKU_CACHE_DIR`)는 측정 페이지 HTML·그 페이지가
읽는 그림·도구 코드·브라우저·운영체제·라이브러리 판의 해시를 열쇠로 측정값만 둔다. 판정(정책 임계·예외, 기준선 비교)은
늘 다시 한다. 다른 글꼴 CSS는 이름 목록만 열쇠에 넣는다(글꼴 린트가 제 범위 밖 규칙을 막는다) — 그래서 일상 PASS는
공개 PASS가 아니고, 공개 검증은 캐시를 읽지 않는다. 측정 단계는 셸에 남은 `FONT_KKU_FACE`·`FONT_KKU_LAYOUT`을 지우고 돈다.
마지막에 오래 걸린 단계 상위 8개를 찍는다(`Stage timings`).

- 브라우저·그리기 엔진 도구 없이 빠른 계약만(수 초): `npm run verify:fast` — JS/터미널 명령 문법,
  Node 테스트 모음, 문서, 배포 트리 링크, CSS 계약, 사본 동기화. `.venv` 없이 `python3`로 돈다. 릴리스 PASS가 아니다
- 플랫폼 시각 기준선 비교만 생략: `npm run verify -- --skip-visual`
- darwin 실측 겹침 감사만 생략: `npm run verify -- --skip-overlap`
- Playwright가 필요한 HTML/브라우저/정적/시각/겹침 단계를 생략:
  `npm run verify -- --skip-browser`
- 결과를 기계 판독 가능한 증거로 보존(공개 증거는 공개 층):
  `npm run verify:release -- --summary-json tmp/verify-summary.json` — summary의 `tier`와 `releasePass`(공개 층이고 생략이 없을 때만 true)

`--skip-*` 결과는 생략한 범위까지 통과했다는 뜻이 아니다. 생략한 단계는 출력과
summary JSON에 사유와 함께 `SKIPPED`(`ok: null`)로 남고, 마지막 줄도 "PASS with skipped
stages"로 끝난다. 일상 층(`npm run verify`)의 마지막 줄은 "everyday verification: PASS — not a release
PASS"다. 릴리스 판정은 필요한 환경(macOS)에서 생략 없이 통과한 로컬 `npm run verify:release`다.

## 검증 표

`scripts/verify.py`가 아래 순서를 실행한다. 표는 역할 설명이며 단계 추가·삭제의 최종
정본은 스크립트다.

| 단계 | 개별 명령(focused command) | 판정 |
| --- | --- | --- |
| JS/CLI syntax | `node --check font-kku.js && node --check bin/font-kku-text.js` | 두 진입점이 파싱됨 |
| Node contracts | `npm test` | 런타임/명세/패키지/자산/CSS/글꼴 작업실 모델 계약 통과 |
| Documentation | `npm run test:docs` | 현행+보관 문서의 로컬 링크와 현행 문서 계약 검사 통과 |
| Pages build | `python3 scripts/build_pages.py --check` | font.tty.link 배포 트리(루트 `site/`, `lib/` 패키지 파일, `lib/skill/` AI 설명서)의 상대 링크와 공개 주소 링크가 모두 실제 파일을 가리키고, jsDelivr 주소가 지금 이름·버전으로 패키지에 든 파일을 가리킴. 배포 빌드(`--check` 없이)는 npm 공개본과 패키지 파일이 같아야 한다(ADR-022 §6) |
| CSS contract | `node scripts/check_css_contract.js --check` | 레지스트리/기본 CSS/런타임/글꼴/작업실/문서 정합 (별도 단계 — `npm test`도 부른다) |
| Asset copies | `.venv/bin/python scripts/sync_assets.py --check` | 정본→사본 바이트 어긋남 없음 |
| Ink boxes | `python3 scripts/build_ink_boxes.py --check` | 런타임의 표준 자모 잉크 상자 사본이 정본 `spec/jamo-ink-boxes.json`과 같음 (기기 글꼴 맞춤, ADR-023) |
| Sidecar mirror codegen | `node scripts/generate_sidecar_tables.js --check` | 4개 언어의 생성 미러(배치·깊이 덮어쓰기·글꼴 메타·별칭·그림 자소·Unicode 표·기본 배치의 원소 획 표)가 명세와 일치 |
| Element boundary | `node scripts/element_edition.js --check --report` | 원소 재료 경로(순수 코어 + 원소 출력)가 Canvas·FontFace·SVG 준비에 닿지 않음(설계 v1.2 §15.4). 매니페스트 `scripts/element-edition.json`의 자르는 자리로 잘라 본 원소 판이 구문 검사·document 없는 실행·순수 코어 값 대조를 넘고, 원소 판 크기(배포하지 않음)를 전체 판과 따로 보고한다. 브라우저 호출 수는 스모크 `element-boundary` |
| Python renderer | `.venv/bin/python -m pytest renderers/python/tests -q` | 평문/HTML/명세/글꼴 메타데이터 정합 |
| Static tolerance | `.venv/bin/python -m pytest tests/test_static_html_parity.py -q` | 비교 허용오차 규칙 통과 |
| Tooling | `.venv/bin/python -m pytest tests/test_glyph_tools.py tests/test_font_export.py "tests/test_playwright_smoke.py::test_smoke_registration_in_sync" -q` | 글자 측정 도구 import/`--help`/순수 도우미/겹침 정책 판정, `font-kku-export.js`가 쓴 TTF·WOFF를 fontTools가 읽는지(복합 글리프·cmap·lsb·WOFF2 재저장), 스모크 등록 어긋남 없음 |
| Go renderer | `(cd renderers/go && go vet ./... && go test -count=1 ./...)` | vet/test 통과 (`-count=1`: 시험 캐시가 모듈 밖 `spec/*.json` 변경을 보지 않는다) |
| Rust renderer | `(cd renderers/rust && cargo fmt --check && cargo test)` | format/test 통과 |
| Ruby renderer | `(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { \|file\| require_relative file }')` | 평문/HTML/명세·사용자 글꼴 정합 |
| Release packages | `.venv/bin/python scripts/verify.py --package-smoke all` | npm/wheel/gem/crate 격리 소비자 실행 (wheel·gem·crate는 글꼴을 밝히지 않은 기본 출력의 도장·원소 획과 `face="device"`·밝힌 글꼴의 원소 층 없음까지, ADR-027) |
| JS-derived spec | `node scripts/generate_spec_cases.js` | 생성 전후 `tables.json`/`test-cases.json` hash 동일 |
| HTML spec | `.venv/bin/python scripts/generate_html_cases.py` | 생성 전후 `html-cases.json` hash 동일 |
| Browser smoke | `.venv/bin/python -m pytest tests/test_playwright_smoke.py -q -n <jobs>` | file/server 런타임과 데모 화면 통과 (`pytest-xdist`가 있으면 일꾼 여럿 — 일꾼마다 세션 브라우저·정적 서버) |
| Static HTML parity | `.venv/bin/python tests/static_html_parity.py` | 커밋된 HTML 케이스 전체의 DOM/style/geometry 정합 — 글꼴을 밝히지 않은 사례는 원소 획(`[part=hoek]`·`[part=element]`, 정체·마디 변수와 노드의 `--fy-face-width`·`--fy-el-density` 1e-4)까지 (ADR-027) |
| Element layer oracle | `.venv/bin/python scripts/record_element_layer.py --check` | 글꼴을 밝히지 않은 바탕 요소(세벌 고정, 원소 재료)를 런타임이 64px로 그린 획과 노드 밀도 굵기 계수(`--fy-el-density`)가 `spec/element-layer.json`(1.1, 열쇠 125개)과 같음 — 같은 열쇠는 어느 음절에서든 같은 값(세벌 고정 불변식), 숫자는 tolerance 안. 승인된 변경만 `--write` |
| Sprite cell coverage | `.venv/bin/python tests/sprite_cell_coverage.py` | sprite-system과 파생 그림 자소 글꼴마다 11,172자가 고르는 자소판 칸(`r<행>-<자모>`)이 SVG에 모두 있음 — 빈칸은 겹침·획 굵기 감사가 잡지 못한다 |
| Visual regression | `.venv/bin/python tests/visual_regression.py` | 현재 플랫폼 기준선의 픽셀 임계값 통과 |
| Composition baseline | `.venv/bin/python scripts/capture_composition_baseline.py --check --cache use\|refresh` | 원소·그림·기기 글꼴 재료(sebul·gothic·malang × element·device·svg 세 세트 × 네 깊이)가 자모 노드 안에 낸 획·마디·그림 DOM과 인라인 수치 변수가 기준선(`tests/baselines/composition/<환경>.json`, 50자 묶음 해시)과 같음. HTML 정합은 원소 노드를 빼므로 해석기·조립식 정본 변경의 "출력 무변경"은 이것으로 본다(PLAN-HANGUL-001). 승인된 모양 변경만 `--write`, 차이는 `--dump DIR`로 비교 |
| Overlap audit | `.venv/bin/python scripts/glyph_overlap_audit.py --policy tests/overlap-policy.json --tier everyday\|release --cache use\|refresh` | 모든 글꼴의 음절 내부 잉크 겹침이 정책 안 (darwin 전용, 다른 플랫폼은 사유와 함께 SKIPPED). 일상 층은 표본 family·씨앗 하나 |
| Overlap audit (device face) | `… glyph_overlap_audit.py --policy tests/overlap-policy.json --face device --fonts sebul,gothic,malang` | 기본이 원소 재료인 글꼴을 기기 글꼴 재료(페이지 `--fy-face: device`)로도 잰다(ADR-024) |
| Stroke audit | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json` | 자기 획을 가진 글꼴(기반·그림 자소 파생)의 자모·자리별 획 굵기가 고르다 — 가로모음 막대·세로모음 기둥·자음 획이 기준(세로모음 기둥)에서 허용 폭 안, 의도한 차이는 사유와 함께 정책에(재료에 매인 차이는 `face`) (darwin 전용). 재료는 글꼴 기본(sebul·gothic은 원소) |
| Stroke audit (device face) | `… glyph_stroke_audit.py --policy tests/stroke-policy.json --face device --fonts sebul,gothic` | 같은 획 굵기 게이트를 기기 글꼴 재료로 |
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
- 작업실 디자인 모델(`tests/font_studio_design.test.js`): 기본 디자인(1.2 세벌 고정, 런타임 revision)·재료 바꾸기·배치 바꾸기가 만든 디자인을 실제 `registerDesign`으로 등록해 보고, 세벌 고정 충돌(문맥 규칙·통짜 합자 모음·자리 변주)이 런타임 거부와 같은지, 확정 뒤 남는 충돌은 합치지 않는지, 내용 주소 이름, JSON 오류 줄·칸, 비교 칸 자리 세기, 스키마 맨 위 키
- 작업실 F 묶음(`tests/font_studio_f.test.js`가 `tests/studio_f/*.test.js`를 이름 차례로 싣는다 — 새 묶음은 package.json을 고치지 않는다): F0 편집 기록(되돌리기·다시·건너뛰기·한도·참가자 상태 복사본)·묶음 편집(취소하면 기록 없음, commit은 한 줄)·검사 결과 모양 맞추기·임시 등록(`studio-tmp-<n>`을 실제 런타임 `planJamo`로 풀고 `unregisterDesign`으로 지운다, 남의 번호는 건너뜀, 없으면 내용 주소 이름) · F1 조립식 목록 거울(정본 투영·런타임 생성 구간·`--check`)과 규칙 모델(모드 × 배치 × 역할 × 자모 × 방법 전수가 `registerDesign`과 같은 판정, 무작위 300단계 뒤 같은 구체성 충돌 없음, 잠금·씨앗 섞기·소스 빼기, 영향 목록이 ㄱ 칸 지우기에서 ㄱ·ㅋ·ㄲ만) · F2 출처 모델(디자인 31 × 자모 51 × 역할 4 × 짜임 3 × 받침 2의 요청 약 11만에서 Q3 = `planJamo` trace.rules) · F4 그림 문서(실제 `registerJamo`, `sanitizeSvg` 시험 그림 둘, 떼어 내기) · F7 팔레트(준비 상태·기록 셈, `pal-*`가 `withMode`에서 살아남음) · F8 묶음(왕복, 해로운 묶음의 칸마다 거부, 이름 겹침, 사전 검사, `.jamo.js`를 VM으로) · F9 영향 확인을 언제 묻는가
- 한글 입력기(`tests/font_kku_ime.test.js`): 두벌식 표준·세벌식 390·세벌식 최종의 키 표(행 단위 골든), 손으로 친 문장, 합자 모음·겹받침·두벌식 받침 넘김·세벌식 겹초성, 자모 단위 Backspace, 가짜 입력 칸으로 `attach()` 키 경로·한/영 전환·초점 없는 칸 캐럿, 패키지 `exports`/`files`
- 조합 체계(ADR-017, `tests/asset_sync.test.js`): `node scripts/build_looks.js --check`와 같은 대조 — `font-kku-looks.css`·`site/themes-data.js`가 `spec/themes.json`과 꾸러미 글꼴 꾸밈 구간에서 다시 만든 것과 같은지, 레이어 순서 문(`font-kku.look`, `font-kku.motion`), 정본의 깨진 참조·분류 안 된 글꼴·꾸러미 테마 규칙·없는 움직임 훅·변주 목록 불일치 거부, 꾸밈이 칠 속성만 옮기는지와 씨앗 조건 유지, 조합법의 확장 목록, 패키지 `files`/`exports`(`./fx`, 확장 CSS, `spec/themes.json`)
- 한 줄 설치 확장(`tests/font_kku.test.js`): `data-addons`가 `font-kku-looks.css`·`font-kku-motion.css`를 글꼴 뒤에 붙이고 `font-kku-fx.js`를 순서 있는 스크립트로 붙이는지, 이름 접기·중복·모르는 이름 경고, `data-addons`만 있을 때
- 상호작용(`tests/font_kku_fx.test.js`): `typingFrames`·`transitionFrames` 순수 함수, `type`의 지웠다 다시 치기·커서·한 번 도는 움직임 끄기·여러 바탕 요소 줄 나누기·멈춤·움직임 줄이기, `shuffle`의 `jamo-seeds` 켜기·누르기·주기·되돌리기, `scatter`·`magnet`·`replay`, 선언형 `bind`/`unbind`, CommonJS·ESM·타입 선언
- 글꼴 계약 v2 검사(`tests/font_lint.test.js`, `site/font-kku-lint.js`): 기본 제공 글꼴·별칭 shim·작업실 fixture 통과, 텍스트 검사 우회로(중첩 속 규칙, 범위 밖 선택자, 부분 문자열 레이어 판정, 속성 누수, 단위 없는 0 변형, `@import` 면제, 디스패치·런타임 변수, `!important`)가 코드별로 실패, 생성된 레지스트리 요약 최신성

- 배치 프로파일(ADR-026, `tests/layout_cases.test.js`): 설계 v1.2 사례 28개를 모두 node·browser·audit·deferred로 분류하고 node 사례를 실행 — 정본 생성기
  `--check`와 깨진 정본 거부, 디자인 1.2 `layout` 검증(누락·없는 프로파일·revision·세벌 고정의 문맥 규칙·자리 변주), 도장 표(67키, 조합용 자모만,
  ㅘ = ㅗ + ㅏ 조각), 맞춤 규칙이 역할·자모로만 고르는지. 브라우저 사례는 스모크 `fixed-layout`(세 재료 × 11,172음절 불변, 머리 음절 없음, 칸 하나,
  sebul·네모 문맥·이전 디자인·대체·크기·낱자)
- 소개 페이지의 AI 답 세트(`tests/landing_sets.test.js`, `site/landing-ai-sets.js`): 답 HTML의 등록 코드를 그대로 돌려 얻은 칸이 원형 8칸 칸 계약 세트(`frame: "box"`, 고치지 않음 기록)이고 실제 `registerJamo`가 받는지, 그 8칸만으로 현대 자모(초성·중성·받침)가 모두 조립되는지(`planJamo`의 모든 획이 그림이나 그림이 긋는 획), ㄱ 칸이 3,444자에 들어가는지, 프롬프트가 설명서와 원형 8칸을 담는지
- 원소 획 표(ADR-027, `tests/element_table.test.js`): 생성기가 네 언어 미러에 굳히는 기본 배치의 원소 획 — 열쇠 125개(초성 19·홑 중성 14·
  합자 중성 조각 14·종성 27·낱자 51)와 UTF-8 바이트 차례, 값마다 런타임 서식(JS `String()` + 단위), 런타임 실측 정답
  `spec/element-layer.json`과 획·마디·값·노드 밀도 대조(숫자는 tolerance 안). 생성기는 `font-kku.js`의 굵기 보정 함수를 빌려 돌린다 —
  갈라짐 가드: 런타임 셈을 바꾸면 도장 밀도(파이썬 사본 `measure_layout_stamps.py`) 대조가 실패하고, 꼭지 틈을 끄면 ㅎ·ㅊ 열쇠가 따라
  바뀌며, 빌린 함수가 새 도우미·새 선택자를 쓰면 실패한다

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
0.5px, matrix scale/shear는 0.01이다. 글꼴을 밝히지 않은 사례(`implicitFont`)는
원소 재료(ADR-027)라 획·마디 노드도 모으고, host `data-fy-face`·낱자 `data-fy-standalone`·
노드 `--fy-face-width`·획 `data-hoek*`·마디 `data-element`를 정체에 넣으며, 마디 변수
(`--fy-el-*`)는 이름·단위가 같고 수가 1e-4 안이어야 한다. 화소는 스모크
`test_sidecar_element_face_without_js[24·64]`(JS 끈 정적 출력 = 런타임 바탕 요소, `face="device"`는 다름)와
`test_sidecar_element_face_is_device_independent`(기기 한글 글꼴을 바꿔 끼워도 원소 출력은 같고 기기 출력은 달라짐 —
다른 한글 글꼴이 없으면 건너뜀)가 본다. 네 언어 원소 출력은 각 언어 시험이 `spec/element-layer.json`(열쇠 125개)과 대조한다.

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
소개 페이지는 `assert_demo`(제목, 히어로의 세 갈래 — 작업실 `#draw`·AI 문장 복사·`#web`, 처음 받는 글꼴 CSS 몇 장과 움직임 타일까지 내려갈 때 네온 글꼴의 필요할 때 받기, 실제 AI 답 여섯과 느낌마다 답이 있는지, 히어로 문장과 제목 둘째 줄이 고른 세트의 SVG 재료로 그려지는지)와 `assert_landing_problems`(AI 답 세트가 원형 8칸 그대로 등록되고 히어로 문장의 자모 노드가 모두 그 8칸에서 나오는지(`traceOf`), 그린 세트에 `animate`를 붙였다 떼도 SVG 재료·획 그대로인지, 칸마다 글자 수, 자모 지도, 칸을 직접 그으면 세트를 다시 등록하고 바뀐 글자 수를 세고 '내 페이지에 쓰기' 코드가 따라오는지, 한 번에 돌려 그은 닫힌 획이 점으로 줄지 않는지, 가져가기 줄과 브라우저 저장, 화면에 보인 6줄 그대로 돌린 JS 흔들기와 이름 씨앗, 짧은 씨앗 고정, NFD 대조, 390px에서 가로 넘침 없음·8칸이 첫 화면 안·메뉴가 화면 안, 서버 모드에서는 11,172자를 모두 그려 자모 노드가 모두 8칸에서 왔는지와 '작업실에서 이어 그리기'로 작업실이 8칸을 가져오는지)가 본다.
`assert_font_studio_design`은 디자인 패널(설계 v1.2 §13)을 본다: 맨 주소의 첫 화면이 세벌 고정 기본 디자인이고 초안을 쓰지 않는지,
비교 칸이 초성 ㄱ·중성 ㅏ를 한 가지 자리로 재는지, 재료를 바꿔도 배치가 그대로인지, 네모 문맥에서만 문맥 규칙 탭이 열리는지,
문맥 규칙이 있는 디자인을 세벌 고정으로 바꾸면 충돌을 보이고 고를 때까지 적용하지 않는지, 등록 실패 때 마지막 정상 디자인을 두는지,
세벌 고정 도장 노드의 글꼴 CSS 편집을 받지 않는지, 디자인 JSON 저장·1.1 디자인 열기(배치를 끼워 넣지 않음)·초안 복원,
그림 자소 글꼴을 "받지 않음"으로 보이는지.
작업실 F 묶음(계획 F)의 스모크는 `tests/studio_f/smoke_*.py`에 둔다 — `studio_f_checks()`가 맨 위 `assert_*`를 찾아 `run_check`의
`assert_font_studio_f`와 pytest `test_font_studio_f_surface[<이름>]`에 올리므로 공유 파일을 고치지 않고, 등록 드리프트 검사도 그대로다.
F0의 `assert_studio_f_foundation`은 편집 창구를 본다: 붙인 칸이 없으면 탭이 없고 초안·기록을 쓰지 않는지, `edit`이 이름 붙은 기록 한 줄과
되돌리기·다시·`change` 사건을 남기는지, 검사에 걸린 `edit`이 오류를 모두 돌려주고 기록하지 않으며 마지막 정상 디자인을 두는지,
참가자 상태가 되돌리기와 프로젝트에 실리고 프로젝트를 열면 디자인보다 먼저 들어가는지, `lease`·`begin`(미리보기만 → 한 줄 / 취소),
`addBusy`가 `settled()`를 붙드는지, 탭 껍데기가 재료에 따라 칸을 가리는지, 그림 자소 글꼴의 `DESIGN_UNSUPPORTED_FONT`와 `status` 사건.
뒤 묶음의 스모크(모두 페이지 오류·`[hidden]` 새는 것 없음): `assert_studio_f_provenance`(다섯 답, 미리보기 모든 노드에서 `provenance.check()` 빈 것),
`assert_studio_f_recipes`(ㅎ 후보·고르기·되돌리기, 글꼴 두 개의 ㅃ 조각 binding 잎, 잠금이 섞기를 막음, 막힌 원본 후보, 임시 이름 돌려줌),
`assert_studio_f_draw`(실제 마우스 선 하나 = 기록 한 줄, 원형 8 단계·제안·자모 칸, SVG 가져오기 허용 목록, 칸 지우기 영향·되돌리기, 초안 복원 때 세트가 먼저),
`assert_studio_f_draw_detach`(ㅋ 떼기 전·후 잉크 IoU ≥ 0.85 — 런타임 `--fy-el-*` 꼴이 바뀌면 여기서 걸린다, 뗀 뒤 ㄱ을 고쳐도 ㅋ 그대로),
`assert_studio_f_palette`(카드 identity·측정, 매트릭스 19 × 3, 고르기·잠금·같은 씨앗 같은 JSON, 빼기 영향 확인), `assert_studio_f_bundle`(저장 파일 내용,
새 문맥에서 열면 기록이 저장 전과 같음, 해로운 묶음은 아무것도 바꾸지 않음), `assert_studio_f_history`(기록 칸·건너뛰기, 실패한 편집은 기록 없음, 영향 대화상자
취소·적용, JSON 적용의 알림). 글꼴 재료 검사는 macOS 글꼴(Apple SD Gothic Neo)에 기댄다.

`assert_sign_app`·`assert_memo_app`은 웹 앱(ADR-012)을 본다: 실제 키 입력이 두벌식·세벌식으로 조합돼 유니코드 값과
그림 자소 노드(투명 글자 + 실제로 뜨는 자소판)로 그려지는지, 조합 중인 음절 표시·자모 단위 Backspace·한/영 전환, 전광판 주소 상태와
전체 화면, 메모장 줄 이동·선택·되돌리기·화면 자판·저장 복원, 1280/390/360px 가로 넘침, 콘솔 오류. `?hangul-font=none`(글꼴 없는 모드)에서는
화면에 칠해지는 한글 텍스트 노드가 모두 그림 자소 노드인지 훑는다 — 기기 글꼴을 지우지 않고 "기기 글꼴로 칠하는 한글이 없다"를 구조로 검사한다.

`assert_face_svg_stroke`(스모크 `face-svg-stroke`)는 SVG 재료(ADR-024 §4)의 그림 획이 화면에서 바탕 요소의 `--fy-el-w` × 노드의 밀도
굵기 계수 k인지 그림마다 축별로 잰다(화면 획 / k·`--fy-el-w`가 0.97–1.03, 촘촘한 받침이 실제로 가늘어졌는지도) — 세벌 고정·옛 배치(`font="sebul"`)의 `pilgi-box`·`dunggeun-box` 겹받침·홑받침 대조 음절과
원소 미리보기(`@line`·`@ring`, gothic의 흐·흙·읊·훅 포함). 그림 `<svg>`가 노드 배율을 되돌리지 않으면 겹받침 1.61·받침 0.71로 실패한다.
이 비율은 그림의 화면 배율에서 계산하므로 엔진의 `non-scaling-stroke` 해석을 전제한다. 그래서 화소로도 본다(`svg_stroke_pixel_ratios`):
그림 하나만 보이게 찍은 잉크 합 ÷ 같은 그림을 변환 없는 `<svg>`에 같은 화면 상자·`--fy-el-w` 획으로 그려 찍은 잉크 합이 0.95–1.05다
(필기 세벌 고정·둥근 `font="sebul"`의 ㄳ·ㄺ·ㅏ·ㅣ — 되돌림을 빼면 1.52–1.60·0.81–0.89). Playwright Firefox가 설치돼 있으면
(`.venv/bin/python -m playwright install firefox`) `test_face_svg_stroke_firefox`가 같은 검사를 Firefox로 돌고, 없으면 건너뛴다 —
기본 스모크는 Chromium 하나다. 2026-10-12 Firefox 151(Playwright firefox-1532)에서 Chromium·WebKit과 같았다.
고리 그림은 화면 상자가 고리 마디 상자에서 굵기의 절반씩 안쪽(고리 중심선 상자, ±0.1px)이어야 한다 — 테두리 안쪽 상자를 기준으로 하면
기기 화소로 버린 테두리 굵기만큼(72px에서 한쪽 0.4–0.8px), 크기가 `auto`면 viewBox 비율로 커져 아래 ㅡ·ㅜ에 닿는다.

`assert_element_density`(스모크 `element-density`)는 밀도 굵기 계수(ADR-024 §3)를 그려진 DOM에서 다시 잰다. 세벌 고정·`font="sebul"`·
`font="gothic"`의 노드마다 마디의 인라인 자리와 노드 변환으로 같은 방향 평행 마디의 중심 간격 p를 셈해, k = 1이면 p ≥ 1.6t, k < 1이면
p < 1.6t이고 바닥(0.75)이 아니면 p ≥ 1.6·k·t(틈이 가늘어진 획의 0.6배 이상), 가로 마디의 화면 굵기가 k·t인지 본다. ㅎ·ㅊ 꼭지(점 획)는
평행 간격에서 빼고 꼭지 틈으로 세므로, 꼭지가 든 노드는 p가 넉넉해도 k < 1일 수 있다. 세벌 고정의 계수가 도장 값이고 받침 ㄹ·ㅀ과
초성 ㅎ(꼭지 틈)은 가늘고 ㄷ은 1인지, 24px와 48px에서 같은지(L21 — 옛 배치의 머리 음절은 2층 재귀가
화소로 재서 크기마다 자리가 조금 달라 뺀다), 선 그림 세트의 `stroke-width`가 k·t이고 칠 세트(붓)가 든 노드는 1인지도 본다.
계수를 끄면(바닥 1) 옛 배치 받침 ㄹ에서, 도장 값을 코어 CSS가 받지 않으면 세벌 고정 받침 ㄹ에서 실패한다.

`assert_element_cap_gap`(스모크 `element-cap-gap`)은 꼭지 틈(ADR-024 §3)을 그려진 화면 상자로 잰다. 세벌 고정·`font="sebul"`·
`font="gothic"` × 24·48px에서 하·호·화(머리)·홍·좋·낳·않·잃·차·초·최·몇과 낱자 ㅎ·ㅊ의 꼭지와 가로획 사이가 0.6·k·t 이상(계수가
바닥 0.75면 0.4·k·t 이상)이고, ㅎ 동그라미 속이 0.5·k·t 이상 열려 있으며, 틈 ÷ 글자 크기가 두 크기에서 같은지(L21) 본다.
꼭지 틈 열기(`dotShifts`)를 끄면 세벌 고정 초성 ㅎ에서 틈이 0.07px(0.6·k·t는 1.1px)라 실패한다. 바꾸기 전에는 세벌 고정 초성 ㅎ
−0.023em, 받침 ㅎ −0.019em, `font="sebul"` 홍 −0.032em으로 꼭지가 가로획에 붙었다.

`assert_selection_copy`(스모크 `selection-copy`, 고정 페이지 `tests/fixtures/selection/index.html`)는 고르기와 복사(ADR-003 보강
2026-10-13, ADR-025 §12)를 본다. 런타임이 그린 root마다 `data-fy-select="jamo"`·`aria-hidden`·고를 수 있음, 원문 거울은 `user-select: none`,
브라우저 자체 `::selection`은 root 안과 바탕 요소 자신 모두 투명한지(바탕 요소 쪽이 칠하면 WebKit에서 띠가 두 겹이 된다). 실제 마우스로 앞 글 첫 글자부터 글꼴 없는 바탕 요소(세벌 고정·원소)와 사이 글을 지나 `font="sebul"`의
괜(그 자리에 놓인 마지막 아닌 자모의 획)까지 끌면 앞 바탕 요소는 root `"all"`(안쪽 표시 없음), 뷁 `"all"`·빈칸·괜 `"part"`에 포인터 아래 자모까지만
표시되고 띠·자모 상자의 계산된 배경이 칠해지는지. 빛 칠 neon의 나의 첫 자모 위(포인터 아래 맨 위 노드가 그 자모인 곳)까지 끌면 빛 칠 노드가
숨겨져 있어도 빛 `"all"`·나 `"part"`에 첫 자모가 표시되는지(끄는 동안 런타임이 선택 끝을 포인터 아래 자모로 옮긴다). 실제 복사 단축키가 넣은 글이 `앞 글 한글 꽃밭 사이 글 뷁 괜`이고 HTML이 바탕 요소마다 고른 원문
한 줄(런타임 표면 없음), 복사 뒤 선택·root가 그대로, Chromium이면 시스템 클립보드(`navigator.clipboard.readText`)도 같은지. 이어서
\r\n·탭·NFD·\r 원문의 일부(`나\r\n다 한\t라`, `FontKku.sourceRange`의 위치까지), 빛 칠 neon의 자모 상자(`::after` 보임)와 `빛나`, SVG(pilgi-box)에서
꾸밈 방식 제목까지의 블록 줄바꿈, 그림자 트리 안 선택의 강조·복사(`림자`), 바탕 요소를 품은 선택을 둔 채 다시 그린 새 root의 강조, 끝이 바탕 요소 안인 선택을 둔 채
`refresh`해도 같은 자리가 남는지(`한글 꽃밭`, 글자 표시 `part·all·all·part`), 그림 위 두 번 누르기 = 낱말(`괜찮아`)·세 번 = 문단, 페이지가
`mousedown`을 막으면 두 번 눌러도 고르지 않는지, 조상이 `user-select: none`인 바탕 요소는 끌어도·전체 선택해도 고르지·복사하지 않는지, 전체 선택 + 복사의
깨끗한 글(`SELECTION_ALL_TEXT`), `contenteditable`에서 바탕 요소 중간부터 뒤 글까지 잘라내기(클립보드 `낼 글 남는`, 남은 원문 `잘라 `, 뒤 글 지움).
끌기는 정수 좌표로 누른다 — 소수 좌표로 누르면 헤드리스 Chromium이 고르기를 시작하지 않고 캐럿만 옮긴다. 강조는 `selectionchange` 뒤 다음 프레임이라
세 프레임 기다린다. Firefox·WebKit이 설치돼 있으면 `test_selection_copy_engines`가 같은 검사를 돈다(블록 사이 줄바꿈 수만 그 브라우저 직렬화대로 —
`same_page_text`). 범위 → 원문 대응 규칙(자모가 닿으면 음절 통째, 빈칸은 통째로 담길 때, 줄바꿈은 두 줄에 걸칠 때, CRLF·NFD·낱글자 글자 위치, root 뒤
원문 거울을 덮어도 거울 위치로 세지 않음)은 노드 시험(`tests/font_kku.test.js`의 `selection:` 셋, DOM 명세 경계점 비교를 흉내 낸 범위)이 본다.
`assert_design_selection`의 복사 사례(ㅃ 낱자·겹받침·머리 음절, 낱자 하나)는 복사 이벤트(`ClipboardEvent` + `DataTransfer`)로 원문을 본다.

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
  표본은 정책의 `sample`이다: 기본 `full`(초성 19종 × 겹침이 잘 나는 모음·받침 계열 `family` 1,055자와 흔한
  완성형 2,350자의 합집합 2,844자), 출발용 뼈대 `sprite-example`만 사유와 함께 `gate`(51자). 씨앗·변주는 `family`로 잰다.
  일상 층(`npm run verify`, `--tier everyday`)은 표본을 `family`까지, 씨앗·변주 씨앗을 첫 하나로 줄이고 STALE 경고를 내지 않는다
  (재지 않은 음절의 예외는 판정할 수 없다) — 공개 층(`npm run verify:release`)이 정책 그대로 잰다.
  정책 파일은 글꼴별 `maxRatio`(기본 0.15)와 사유가 적힌 `(syllable, pair)` 예외, 예외별 상한
  `maxRatio`(더 나빠지면 실패)를 가진다. 정책에 없는 글꼴, 명세에 없는 정책 글꼴, 예외 밖의 새
  겹침, 예외 상한 초과가 실패다. 임계 아래로 내려온 예외는 `STALE`로 알려 주니 정책에서 지운다.
  측정은 darwin 실측으로 교정돼 있어(`platforms`) 다른 플랫폼에서는 verify가 사유와 함께
  SKIPPED로 기록한다.
- `Stroke audit (fixed layout, element|device)` 단계: `glyph_stroke_audit.py --font sebul --layout fixed --face …`가 세벌 고정의
  획 굵기를 잰다. 원소 재료는 굵기를 스스로 맞추고, 기기 글꼴 재료는 `spec/layout-profiles.json` 맞춤 규칙 `deviceStroke`의 굵기
  보정(도장마다 text-stroke, ㅡ·ㅣ는 그 방향 배율, ㅛ·ㅠ는 두 꼭지가 붙지 않는 `cap`)이 기준 안에 있는지 본다.
- `Stroke audit (svg <세트>)`·`Stroke audit (fixed layout, svg <세트>)` 단계(2026-10-12): 획 굵기 감사의 `--policy --jamo-set <세트>`가
  기기 글꼴 재료에 칸 계약 그림 세트를 걸어 SVG 재료(ADR-024)로 잰다. 기본 제공 세트 셋(`pilgi-box`·`dunggeun-box`·`butgeul-box`) × 두 배치라
  여섯 단계다. 옛 배치는 정책 `jamoSets` 항목의 글꼴로 재고(필기·둥근은 sebul·gothic, 붓은 sebul), `--layout fixed`는 세벌 고정(sebul)으로 잰다.
  판정은 세트 항목의 허용 폭·예외에 글꼴 항목의 `face: "svg"` 예외를 더한다. 세트 예외의 `layout`(legacy|fixed)은 그 배치에서만 쓴다.
  - 필기·둥근은 예외 없이 넘침 0이다. 그림 `<svg>`의 노드 배율 되돌림(코어 CSS)이 빠지면 여기서 걸린다(고치기 전 29·21·32·23).
  - 붓은 그림 자소 글꼴 butgeul과 같은 허용 폭 0.35다. 예외는 받침 ㅎ, 옛 배치의 가로모음 막대(ㅗ·ㅛ·ㅜ·ㅠ·ㅡ — ㅡ는 세벌 고정 revision 2의 긴 기둥 비로 누른 옛 배치 기둥이 가늘어져서)와 가로모음 위 ㄱ이다 —
    채운 붓은 한 그림이라 기본 배치에 맞춰 누른다. gothic은 재지 않는다(gothic 자리 기하를 채운 붓이 그대로 받아 0.35에서도 넘침 40).
  - 단계마다 세션 2–4개, 캐시 없이 약 6–7초다(여섯 단계 약 40초). 일상 층은 측정 캐시를 읽는다.
  - 겹침 감사의 `--jamo-set`은 개발용이다(verify 단계 아님, `--layout fixed`와 함께 쓸 수 있다, 측정 캐시 열쇠에 세트가 들어간다).
  - 그림 획 굵기 계약 자체는 스모크 `face-svg-stroke`가 본다.
- `Overlap audit (fixed layout, element|device)` 단계: `glyph_overlap_audit.py --font sebul --layout fixed --sample full`(일상 층은 `family`)이 글꼴을 밝히지 않은
  바탕 요소의 기본 배치(세벌 고정, ADR-026)를 원소·기기 글꼴 두 재료로 잰다. 정책 예외 없이 기본 임계 15%다 — 도장은 역할·자모마다
  하나라 특정 음절만 고칠 수 없고, 겹침은 `spec/layout-profiles.json`의 역할 상자·맞춤 규칙(프로파일 전체)으로 고친다. 도장을 다시 지을 때는
  `scripts/measure_layout_stamps.py --write`(역할 상자에서 짓는다, 브라우저 없음) 뒤 `node scripts/build_layout_profiles.js --write`,
  값이 바뀌면 프로파일 revision을 올린다(이전 revision 디자인을 받을지는 `accepts`). 이어서 붓 그림 세트(`butgeul-box`)가 도장 배율로
  붓을 미리 누르므로 `node scripts/build_jamo_svg.js --write`, 네 언어 미러·정적 자산·원소 획 정답·HTML 사례를 다시 낸다
  (`generate_sidecar_tables.js --write` → `sync_assets.py` → `record_element_layer.py --write` → `generate_html_cases.py`, ADR-026 §2).
  `npm test`의 `--check`들이 빠진 단계를 잡는다.

- `Legibility audit (fixed layout)` 단계(2026-10-13): `scripts/glyph_legibility_audit.py`가 기본 배치(세벌 고정)가 **읽히는 꼴**인지
  원소·기기 글꼴·SVG 그림(`pilgi-box`) 세 재료로 잰다 — 겹침·획 굵기 감사가 재지 않는 것이다(세벌 고정 revision 1은 두 감사를 넘고도
  받침이 떨어지고 줄이 부딪혀 읽히지 않았다, ADR-026). 표본 1,000자(11자 걸러) + 대표 음절 + 문장 음절을 100px로 하나씩 띄워 그리고
  역할마다 색(초성 빨강·중성 초록·종성 파랑)을 칠해 찍어, 음절마다 역할별 잉크 상자를 화소로 얻는다. 글자 칸·간격·빈칸 폭은 DOM에서 읽고
  40자 줄 격자·문장은 그 상자로 셈한다. 게이트: 칸 밖 잉크 ≤ 0.01em, 위아래 줄·이웃 글자 잉크 틈 ≥ 0.06em, 받침 위 틈 ≥ 0.03em,
  세로 모음 끝–받침 ≤ 0.08em, 초성 아래–받침 위 가운데값 ≤ 0.28em, 낱말 안 틈의 최대 < 낱말 사이의 최소. SVG 그림 세트는 획이 상자 밖으로
  조금 나와 틈 지표를 0.02em 덜 본다. 세 재료 약 30초, 기기 글꼴 재료를 darwin 글꼴로 재므로 획 감사와 같은 플랫폼 조건이다.
  `--font sebul`처럼 글꼴을 밝히면 보고만 한다. 지표의 셈은 `tests/test_glyph_tools.py`가 브라우저 없이 본다(가짜 상자로 통과·실패).
- 검수 시트(게이트 아님): `scripts/review_sheets.py`가 첫 화면 제목(128px, 원소·글자 칸·기기·SVG·네온·스티커), 낱말(112·48px),
  문단(24·48px), 1,000자 격자, 확대 자모 칸(원소·기기), 낱자, 재료 셋, 작은 글씨(16·24px, 1x·2x), 꾸밈 여덟 가지를 그린다.
  `--before <checkout>`이면 그 checkout의 런타임으로 같은 시트를 그려 전·후를 나란히 붙인다. 배치·재료·꾸밈을 바꾸면 이 시트를 **눈으로 본다**
  (점검표 `skills/font-kku/references/legibility.md` §3.1).

### 패키지와 그림 자소 스모크

- npm tarball: CommonJS/ESM, TypeScript, CSS/글꼴/명세 subpath, notice, 터미널 명령
- Python wheel: 새 venv에서 격리 import와 평문/HTML/자산
- Ruby gem: 풀어 놓은 payload와 격리 `GEM_HOME` 설치
- Rust crate: 패키징된 자산과 외부 오프라인 소비자
- 그림 자소 fixture: 다중 배율 PNG 크기, 빈 칸 보고서, SHA-256와 CSS `image-set()`

Go 모듈은 source manifest version 대신 git tag가 배포 버전이다. 배포 시
`renderers/go/v<version>` 태그를 별도 릴리스 절차로 만든다.

버전 번호는 `python3 scripts/bump_version.py <버전>`으로만 바꾼다. 매니페스트 7곳과 문서·사이트·AI
설명서의 CDN 주소를 함께 바꾸고, `Version copies` 단계(`--check`)가 하나라도 다르면 실패한다.
번호 규칙(0.x 동안 패치가 기본, 깨지는 변경만 마이너)과 릴리스 순서는 [ADR-022](docs/ADR/ADR-022-npm-name-and-versioning.md).

복사해 가는 설치 주소는 jsDelivr가 즉석으로 만드는 압축본 `font-kku.min.js`다(ADR-019 §2). verify는 네트워크를
쓰지 않아 그 변환을 보지 못하므로, `npm publish` 뒤 jsDelivr에 새 버전이 보이면 손으로 한 번 돌린다.

```bash
.venv/bin/python scripts/check_cdn_min.py              # 공개본 .min 길 ↔ 저장소 원본: DOM·화소·받은 이름
.venv/bin/python scripts/check_cdn_min.py --simulate   # 공개 전: 같은 판 Terser·clean-css로 로컬 흉내
```

고정 페이지(원소·기기 글꼴·그림 자소·필요할 때 받기·자소 모듈·확장)를 원본과 압축본으로 열어 바탕 요소 DOM(속성
순서 무시)과 화소를 대조하고, 압축 길이 `.min`이 아닌 CSS·JS를 받으면 실패한다. 그 버전이 아직 없으면 SKIP이다.

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

릴리스 관문은 로컬 `npm run verify:release`다. `.github/workflows/ci.yml`은 원격 저장소를 쓸 때
push/pull request에서 코어, 다른 언어 구현 4종, 브라우저/정적/그림 자소/도구, Linux 시각 캡처를
분리 실행하는 선택적 설정이다. Linux 러너에서는 darwin 실측 겹침 감사를 사유와 함께 건너뛰고,
Linux 시각 job은 캡처/업로드 실패를 막지만 픽셀 승인은 수동이다.

- `npm run verify:release`가 macOS에서 생략 없이 통과한다(`SKIPPED` 단계 없음).
- `npm run test:docs`와 `git diff --check`가 통과한다.
- CSS/명세 변경이면 생성물과 다른 언어 구현 4종이 함께 정합한다.
- 글꼴 시각 변경이면 겹침 정책(`tests/overlap-policy.json`)이 새 상태를 정직하게 반영한다.
- 의도된 시각 변경은 기준선 diff를 사람이 검토한다.
- 원격 CI를 돌렸다면 그 결과는 로컬 PASS와 별개로 기록하고 하나를 다른 하나로 표현하지 않는다.
- 실제 패키지 레지스트리 배포/tag와 외부 자산 정책은 별도 릴리스 승인 대상으로 둔다.

과거 실행 수치를 새 릴리스의 증거로 재사용하지 않는다 — 공개 층은 측정 캐시를 읽지 않는다. 현재 판정은 해당 커밋에서 실행한
`npm run verify:release -- --summary-json <path>` 산출물을 쓴다.
