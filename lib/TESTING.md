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
`verify.py`는 `.ruby-version`의 Ruby가 rbenv·asdf에 깔려 있으면 셸 설정 없이도 그 Ruby로 Ruby·gem 단계를 돈다(사전 점검이 쓰는 Ruby를 찍는다).
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
| `npm run verify:fast` | 빠른 계약 | 없음(브라우저·렌더러 도구 없음 — 검증 표의 `fast` 단계) | 수정마다 |
| `npm run verify` | 일상 | 모든 단계. 겹침 감사는 표본 `family`·씨앗 첫 하나, 측정 캐시를 읽는다 | 큰 변경을 마칠 때 |
| `npm run verify:release` | 공개 | 모든 단계. 정책 표본(`full`)·씨앗·변주 전부, 측정 캐시를 읽지 않고 새로 쓴다. 스모크는 두 모드·세 엔진. 직전 공개판 대비 검수 시트, 헷갈리는 짝 감사·매트릭스 탐침(보고만) | npm 공개·사이트 배포 전 |

브라우저 측정은 프로세스 여럿이 동시에 잰다 — 겹침·획 굵기 감사는 240자 세션 하나, 조립 기준선은 설정 하나가 일 하나다 —
`--jobs N`(또는 `FONT_KKU_JOBS`, 기본은 기계 슬롯 수 K). 브라우저 스모크는 `pytest-xdist`가 있으면 일꾼 여럿으로
돈다(기본 min(4, 코어 수 / 2)). 브라우저 측정과 스모크는 기계 전체 슬롯(`scripts/machine_slots.py`, `~/.cache/font-kku/slots`,
K = `FONT_KKU_SLOTS`, 기본 코어 수 − 2와 메모리 ÷ 1.5GB 중 작은 값, 0이면 끔)을 나눠 쓴다 — worktree·에이전트가 여럿이어도
기계 전체에서 K개를 넘지 않는다. 빈 슬롯이 없으면 '측정 슬롯 기다림'을 찍고 기다리고, 도구는 `jobs N (slots N/K)`를 찍는다.
스모크는 브라우저를 쓰는 시험마다 슬롯 하나를 잡고 놓는다. 누가 쥐었는지는 `python3 scripts/machine_slots.py`로 본다.
감사 도구를 손으로 돌리면 기본이 캐시 읽기(`--cache use`)다 — 공개 판정과 같은 측정은 `--cache refresh`.
측정 캐시(`scripts/measure_cache.py`)는 본 checkout의 `tmp/verify-cache/`다 — git worktree도 같은 폴더를 쓴다
(`git rev-parse --git-common-dir`, 폴더는 `FONT_KKU_CACHE_DIR`로 바꾼다). 측정 페이지 HTML·그 페이지가
읽는 그림·도구 코드(브라우저 고르기 `tests/browser_launch.py` 포함, 스모크 파일은 들지 않는다)·브라우저·운영체제·라이브러리 판의
해시를 열쇠로 측정값만 둔다. 판정(정책 임계·예외, 기준선 비교)은
늘 다시 한다. 다른 글꼴 CSS는 이름 목록만 열쇠에 넣는다(글꼴 린트가 제 범위 밖 규칙을 막는다) — 그래서 일상 PASS는
공개 PASS가 아니고, 공개 검증은 캐시를 읽지 않는다. 측정 단계는 셸에 남은 `FONT_KKU_FACE`·`FONT_KKU_LAYOUT`을 지우고 돈다.
마지막에 오래 걸린 단계 상위 8개를 찍는다(`Stage timings`).

- 브라우저·그리기 엔진 도구 없이 빠른 계약만(수 초): `npm run verify:fast` — 아래 검증 표에서 층이 `fast`인 단계.
  `.venv` 없이 `python3`로 돈다. 릴리스 PASS가 아니다
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

아래 표는 `scripts/verify.py`의 단계 목록에서 만든다. 손으로 고치지 않는다.
단계를 더하거나 판정 글을 고치면 `scripts/verify.py`(`stage_catalog`·`STAGE_DOCS`)를 고치고
`python3 scripts/verify.py --write-stage-table`로 다시 쓴다. 표가 낡으면 `npm run test:docs`가 실패한다.
돌리지 않고 단계만 보려면 `python3 scripts/verify.py --list-stages [--tier fast|everyday|release] [--markdown]`.

<!-- BEGIN GENERATED: verify.py --list-stages -->
단계 수: fast 11 · everyday 49 · release 52. 번호는 공개 층 차례다 — 다른 층의 번호(`--from <번호>`)는 `--list-stages --tier <층>`.

| # | 단계 | 층 | 개별 명령 | 판정 |
| --- | --- | --- | --- | --- |
| 1 | JS syntax | fast·everyday·release | `node --check font-kku.js` | `font-kku.js`가 파싱됨 |
| 2 | CLI syntax | fast·everyday·release | `node --check bin/font-kku-text.js` | `bin/font-kku-text.js`가 파싱됨 |
| 3 | Node tests | fast·everyday·release | `npm test` | 런타임/명세/패키지/자산/CSS/글꼴 작업실 모델 계약 통과 |
| 4 | Markdown links | fast·everyday·release | `npm run test:docs` | 현행+보관 문서의 로컬 링크와 현행 문서 계약 통과 — 이 표가 `--list-stages --markdown` 출력과 같은지도 본다 |
| 5 | Pages build links | fast·everyday·release | `python3 scripts/build_pages.py --check` | font.tty.link 배포 트리(루트 `site/`, `lib/` 패키지 파일, `lib/skill/` AI 설명서)의 상대 링크와 공개 주소 링크가 모두 실제 파일을 가리키고, jsDelivr 주소가 지금 이름·버전으로 패키지에 든 파일을 가리킴. 배포 빌드(`--check` 없이)는 npm 공개본과 패키지 파일이 같아야 한다(ADR-022 §6) |
| 6 | CSS contract | fast·everyday·release | `node scripts/check_css_contract.js --check` | 레지스트리/기본 CSS/런타임/글꼴/작업실/문서 정합 (별도 단계 — `npm test`도 부른다) |
| 7 | Vendored asset sync | fast·everyday·release | `python3 scripts/sync_assets.py --check` | 정본→사본 바이트 어긋남 없음 |
| 8 | Version copies | fast·everyday·release | `python3 scripts/bump_version.py --check` | 패키지 매니페스트 7곳과 문서·사이트·AI 설명서의 CDN 주소가 `package.json` 버전과 같음(ADR-022) |
| 9 | Ink boxes | fast·everyday·release | `python3 scripts/build_ink_boxes.py --check` | 런타임의 표준 자모 잉크 상자 사본이 정본 `spec/jamo-ink-boxes.json`과 같음 (기기 글꼴 맞춤, ADR-023) |
| 10 | Sidecar spec mirror codegen | fast·everyday·release | `node scripts/generate_sidecar_tables.js --check` | 4개 언어의 생성 미러(배치·깊이 덮어쓰기·글꼴 메타·별칭·그림 자소·Unicode 표·기본 배치의 원소 획 표)가 명세와 일치 |
| 11 | Element boundary | fast·everyday·release | `node scripts/element_edition.js --check --report` | 원소 재료 경로(순수 코어 + 원소 출력)가 Canvas·FontFace·SVG 준비에 닿지 않음(설계 v1.2 §15.4). 매니페스트 `scripts/element-edition.json`의 자르는 자리로 잘라 본 원소 판이 구문 검사·document 없는 실행·순수 코어 값 대조를 넘고, 원소 판 크기(배포하지 않음)를 전체 판과 따로 보고한다. 브라우저 호출 수는 스모크 `element-boundary` |
| 12 | Python renderer tests | everyday·release | `.venv/bin/python -m pytest renderers/python/tests -q` | 평문/HTML/명세/글꼴 메타데이터 정합 |
| 13 | Static parity tolerance unit tests | everyday·release | `.venv/bin/python -m pytest tests/test_static_html_parity.py -q` | 비교 허용오차 규칙 통과 |
| 14 | Tooling unit tests | everyday·release | `.venv/bin/python -m pytest tests/test_glyph_tools.py tests/test_font_export.py tests/test_verify_tools.py tests/test_confusable_audit.py tests/test_matrix_probe.py tests/test_build_pages.py tests/test_playwright_smoke.py::test_smoke_registration_in_sync tests/test_playwright_smoke.py::test_missing_engine_policy -q` | 글자 측정 도구 import/`--help`/순수 도우미/겹침 정책 판정, `font-kku-export.js`가 쓴 TTF·WOFF를 fontTools가 읽는지(복합 글리프·cmap·lsb·WOFF2 재저장), verify·공개 관문의 순수 도우미(`tests/test_verify_tools.py`), 헷갈리는 짝 감사·매트릭스 탐침의 순수 도우미, 기계 슬롯·공유 캐시, font.tty.link 배포 폴더 보호(`tests/test_build_pages.py`), 스모크 등록 어긋남 없음과 엔진 요구 정책 |
| 15 | Go vet | everyday·release | `(cd renderers/go && go vet ./...)` | vet 통과 |
| 16 | Go tests | everyday·release | `(cd renderers/go && go test -count=1 ./...)` | test 통과 (`-count=1`: 시험 캐시가 모듈 밖 `spec/*.json` 변경을 보지 않는다) |
| 17 | Rust format | everyday·release | `(cd renderers/rust && cargo fmt --check)` | `cargo fmt` 형식 그대로 |
| 18 | Rust tests | everyday·release | `(cd renderers/rust && cargo test)` | test 통과 |
| 19 | Ruby tests | everyday·release | `(cd renderers/ruby && ruby -I lib -e 'Dir["test/test_*.rb"].sort.each { \|file\| require_relative file }')` | 평문/HTML/명세·사용자 글꼴 정합 (`.ruby-version`의 Ruby로 — 아래 gem 스모크와 같은 Ruby) |
| 20 | Package smoke (npm) | everyday·release | `.venv/bin/python scripts/verify.py --package-smoke npm` | npm tarball을 격리 소비자에 설치: CommonJS/ESM, TypeScript, CSS/글꼴/명세 subpath, notice, 터미널 명령 |
| 21 | Package smoke (python) | everyday·release | `.venv/bin/python scripts/verify.py --package-smoke python` | wheel을 새 venv에 격리 설치: 평문/HTML/자산, 글꼴을 밝히지 않은 기본 출력의 도장·원소 획과 `face="device"`·밝힌 글꼴의 원소 층 없음(ADR-027) |
| 22 | Package smoke (ruby) | everyday·release | `.venv/bin/python scripts/verify.py --package-smoke ruby` | gem payload와 격리 `GEM_HOME` 설치 — 호환 점검·설치·실행이 같은 cwd·env의 같은 Ruby(`.ruby-version`). 기본 출력 계약은 wheel과 같음 |
| 23 | Package smoke (rust) | everyday·release | `.venv/bin/python scripts/verify.py --package-smoke rust` | crate에 실린 자산·생성 표와 외부 오프라인 소비자. 기본 출력 계약은 wheel과 같음 |
| 24 | JS-derived spec regeneration | everyday·release | `node scripts/generate_spec_cases.js` | 생성 전후 `tables.json`/`test-cases.json` hash 동일 |
| 25 | Browser-derived HTML spec regeneration | everyday·release | `.venv/bin/python scripts/generate_html_cases.py` | 생성 전후 `html-cases.json` hash 동일 |
| 26 | Browser smoke | everyday·release | `[공개 층: FONT_KKU_SMOKE_MODES=both FONT_KKU_REQUIRE_ENGINES=1] .venv/bin/python -m pytest tests/test_playwright_smoke.py -q --durations=15 -n <jobs>` | server 런타임과 데모 화면 통과 — file:// 갈림이 있는 검사(`FILE_DIFFERS`, 7개)만 file 모드도 (`pytest-xdist`가 있으면 일꾼 여럿 — 일꾼마다 세션 브라우저·정적 서버). 공개 층은 모든 검사를 두 모드로, 다른 엔진이 꼭 있어야 한다(`FONT_KKU_SMOKE_MODES=both`, `FONT_KKU_REQUIRE_ENGINES=1`). 느린 검사 15개를 함께 보인다(`--durations=15`) |
| 27 | Static HTML parity | everyday·release | `.venv/bin/python tests/static_html_parity.py` | 커밋된 HTML 케이스 전체의 DOM/style/geometry 정합 — 글꼴을 밝히지 않은 사례는 원소 획(`[part=hoek]`·`[part=element]`, 정체·마디 변수와 노드의 `--fy-face-width`·`--fy-el-density` 1e-4)까지 (ADR-027) |
| 28 | Element layer oracle | everyday·release | `.venv/bin/python scripts/record_element_layer.py --check` | 글꼴을 밝히지 않은 바탕 요소(세벌식, 원소 재료)를 런타임이 64px로 그린 획과 노드 밀도 굵기 계수(`--fy-el-density`)가 `spec/element-layer.json`과 같음 — 같은 열쇠(짜임까지)는 어느 음절에서든 같은 값(고정 배치 불변식), 숫자는 tolerance 안. 승인된 변경만 `--write` |
| 29 | Sprite cell coverage | everyday·release | `.venv/bin/python tests/sprite_cell_coverage.py` | sprite-system과 파생 그림 자소 글꼴마다 11,172자가 고르는 자소판 칸(`r<행>-<자모>`)이 SVG에 모두 있음 — 빈칸은 겹침·획 굵기 감사가 잡지 못한다 |
| 30 | Visual regression | everyday·release | `.venv/bin/python tests/visual_regression.py` | 현재 플랫폼 기준선(`tests/baselines/<환경>/`)의 픽셀 임계값 통과 |
| 31 | Composition baseline | everyday·release | `.venv/bin/python scripts/capture_composition_baseline.py --check --cache use\|refresh` | 원소·그림·기기 글꼴 재료(sebul·gothic·malang × element·device·svg 세 세트 × 네 깊이)가 자모 노드 안에 낸 획·마디·그림 DOM과 인라인 수치 변수가 기준선(`tests/baselines/composition/<환경>.json`, 50자 묶음 해시)과 같음. HTML 정합은 원소 노드를 빼므로 해석기·조립식 정본 변경의 "출력 무변경"은 이것으로 본다(PLAN-HANGUL-001). 승인된 모양 변경만 `--write`, 차이는 `--dump DIR`로 비교 |
| 32 | Overlap audit | everyday·release | `.venv/bin/python scripts/glyph_overlap_audit.py --policy tests/overlap-policy.json --tier everyday\|release --cache use\|refresh` | 모든 글꼴의 음절 내부 잉크 겹침이 정책(`tests/overlap-policy.json`) 안 — 직결식(`jikgyeol`)도 여기서 (darwin 전용, 다른 플랫폼은 사유와 함께 SKIPPED). 일상 층은 표본 family·씨앗 하나 |
| 33 | Overlap audit (device face) | everyday·release | `.venv/bin/python scripts/glyph_overlap_audit.py --policy tests/overlap-policy.json --tier everyday\|release --face device --fonts sebul,gothic,malang --cache use\|refresh` | 기본이 원소 재료인 글꼴을 기기 글꼴 재료(페이지 `--fy-face: device`)로도 잰다(ADR-024) |
| 34 | Overlap audit (fixed layout, element) | everyday·release | `.venv/bin/python scripts/glyph_overlap_audit.py --font sebul --layout fixed --sample family\|full --face element --cache use\|refresh` | 글꼴을 밝히지 않은 바탕 요소의 기본 배치(세벌식, ADR-028)를 원소 재료로 — 정책 예외 없이 기본 임계 15%. 일상 층은 표본 family |
| 35 | Overlap audit (fixed layout, device) | everyday·release | `.venv/bin/python scripts/glyph_overlap_audit.py --font sebul --layout fixed --sample family\|full --face device --cache use\|refresh` | 같은 세벌식 겹침을 기기 글꼴 재료로 |
| 36 | Stroke audit | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --cache use\|refresh` | 자기 획을 가진 글꼴(기반·그림 자소 파생)의 자모·자리별 획 굵기가 고르다 — 가로모음 막대·세로모음 기둥·자음 획이 기준(세로모음 기둥)에서 허용 폭 안, 의도한 차이는 사유와 함께 정책(`tests/stroke-policy.json`)에 (darwin 전용). 재료는 글꼴 기본 |
| 37 | Stroke audit (device face) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --face device --fonts sebul,gothic --cache use\|refresh` | 같은 획 굵기 게이트를 기기 글꼴 재료로 |
| 38 | Stroke audit (fixed layout, element) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --layout fixed --face element --cache use\|refresh` | 기본 배치(세벌식)의 획 굵기 — 원소 재료는 굵기를 스스로 맞춘다. 판정은 정책 `fixedLayout` 절(사선 다리 예외) |
| 39 | Stroke audit (fixed layout, device) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --layout fixed --face device --cache use\|refresh` | 세벌식 기기 글꼴 재료의 굵기 보정(`spec/layout-profiles.json` 맞춤 규칙 `deviceStroke`)이 기준 안 |
| 40 | Stroke audit (svg pilgi-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set pilgi-box --cache use\|refresh` | 칸 계약 그림 세트 `pilgi-box`를 SVG 재료로, 정책 `jamoSets` 항목의 글꼴(옛 배치)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 41 | Stroke audit (fixed layout, svg pilgi-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set pilgi-box --layout fixed --cache use\|refresh` | 칸 계약 그림 세트 `pilgi-box`를 SVG 재료로, 기본 배치(세벌식)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 42 | Stroke audit (svg dunggeun-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set dunggeun-box --cache use\|refresh` | 칸 계약 그림 세트 `dunggeun-box`를 SVG 재료로, 정책 `jamoSets` 항목의 글꼴(옛 배치)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 43 | Stroke audit (fixed layout, svg dunggeun-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set dunggeun-box --layout fixed --cache use\|refresh` | 칸 계약 그림 세트 `dunggeun-box`를 SVG 재료로, 기본 배치(세벌식)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 44 | Stroke audit (svg butgeul-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set butgeul-box --cache use\|refresh` | 칸 계약 그림 세트 `butgeul-box`를 SVG 재료로, 정책 `jamoSets` 항목의 글꼴(옛 배치)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 45 | Stroke audit (fixed layout, svg butgeul-box) | everyday·release | `.venv/bin/python scripts/glyph_stroke_audit.py --policy tests/stroke-policy.json --jamo-set butgeul-box --layout fixed --cache use\|refresh` | 칸 계약 그림 세트 `butgeul-box`를 SVG 재료로, 기본 배치(세벌식)에서 — 그림 획이 화면에서 `--fy-el-w`인지, 붓 세트는 허용 폭·예외로 |
| 46 | Legibility audit (fixed layout) | everyday·release | `.venv/bin/python scripts/glyph_legibility_audit.py` | 기본 배치(세벌식)가 읽히는 꼴인지 원소·기기 글꼴·SVG(`pilgi-box`) 세 재료로 — 칸 밖 잉크, 위아래 줄·이웃 글자 틈, 받침 틈, 낱말 안 틈 < 낱말 사이 (darwin 전용) |
| 47 | Legibility audit (jikgyeol) | everyday·release | `.venv/bin/python scripts/glyph_legibility_audit.py --font jikgyeol --face element` | 직결식(`font="jikgyeol"`, `sebul-fixed-v1`)이 같은 게이트를 넘는지 원소 재료로 (darwin 전용) |
| 48 | Sprite pipeline fixture | everyday·release | `.venv/bin/python scripts/verify.py --sprite-smoke` | PNG/report/CSS/hash 값 정합 |
| 49 | Whitespace errors | everyday·release | `git diff --check` | 작업 트리·인덱스의 공백 오류 없음(`git diff --check`) |
| 50 | Release review sheets | release (everyday `--sheets`) | `.venv/bin/python scripts/review_sheets.py --before tmp/release-baseline/<latest>/package --font <(없음)·sebul·gothic·pixel> --sections hero,para,small,looks --out tmp/review-sheets/<HEAD>/<글꼴>` | 직전 공개판(npm `latest`)과 지금 트리의 검수 시트를 나란히 그린다 — 기본 배치·sebul·gothic·pixel × 제목·문단·작은 글씨·꾸밈. 판정하지 않는다. 시트 경로·sha256은 summary `reviewSheets`, 공개 승인 요청에 붙여 사용자가 본다. 레지스트리에 닿지 않으면 SKIPPED(공개 판정 아님) |
| 51 | Confusable pairs audit | release · 보고만 | `.venv/bin/python scripts/glyph_confusable_audit.py --fonts all --report --out tmp/confusable/release --before tmp/release-baseline/<latest>/package` | 헷갈리는 짝 21쌍(`tests/confusable-pairs.json`)을 글꼴 21개+기본 배치 × 16·24·32px × 화면 배율 1·2로 그려 기기 글꼴 대비 구별성 `rel`과 직전 공개판 대비 변화를 낸다. 보고만 — `tmp/confusable/release/sheet.png`를 실제 크기로 보고 공개 승인 요청에 붙인다(제안 경고: `rel` < 0.2, 직전 판보다 30% 넘게 떨어짐). 1px보다 좁은 낱자 틈은 못 본다 |
| 52 | Matrix probe | release · 보고만 | `.venv/bin/python tests/matrix_probe.py --report --require-engines --jobs 2 --out tmp/matrix-probe/release` | 세 엔진 × 글꼴 22 × 꾸밈 12 × 16·48px, 움직임 14 × 재료에서 빈칸·꾸밈 무변화·엔진 차·움직임 무변화·움직임 줄이기 위반을 찾는다. 보고만 — 모양은 판정하지 않는다. `tmp/matrix-probe/release/contact-sheet.png`와 `pages/*.png`를 눈으로 본다 |
<!-- END GENERATED -->

`npm run verify:fast`는 위 표에서 층에 `fast`가 있는 단계만 돈다(표 맨 앞).

- `--keep-going`: 실패해도 끝까지 돈다. 끝에 실패한 단계 목록을 찍고 `FAIL`로 끝난다(exit 1). 기본은 첫 실패에서 멈춘다.
- `--from <단계 이름|번호>`: 앞 단계를 `SKIPPED`(사유 `--from`)로 남기고 그 단계부터 돈다. 번호는 `--list-stages --tier <층>`의 번호다.
  묶음 안 이름(예: `Install Ruby gem in isolation`)을 주면 그 묶음 처음부터 돈다. 공개 판정이 아니다.
- `--sheets`: 일상 층에서도 `Release review sheets`를 돈다.
- summary JSON에는 `git`(HEAD·브랜치·`git status --porcelain` 줄 수), 공개 층의 `pack`(npm pack integrity·shasum·파일 수),
  `reviewSheets`(시트 경로·sha256), `reports`(보고만 하는 단계)가 실린다. 공개 층은 `--summary-json` 없이도
  `tmp/verify-summary.json`을 쓴다. 작업 트리가 깨끗하지 않거나 `--from`을 쓰면 `releasePass`는 false다(까닭은 `releaseBlockers`).
- `npm publish`는 `prepublishOnly`로 `python3 scripts/release_gate.py`를 먼저 부른다. 그 summary가 지금 HEAD·tarball과 맞는지 보고
  공개 승인 보고를 찍는다.

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
- 작업실 디자인 모델(`tests/font_studio_design.test.js`): 기본 디자인(1.2 세벌식, 런타임 revision)·재료 바꾸기·배치 바꾸기가 만든 디자인을 실제 `registerDesign`으로 등록해 보고, 고정 배치 충돌(문맥 규칙·통짜 합자 모음·자리 변주)이 런타임 거부와 같은지, 확정 뒤 남는 충돌은 합치지 않는지, 내용 주소 이름, JSON 오류 줄·칸, 비교 칸 자리 세기, 스키마 맨 위 키
- 작업실 F 묶음(`tests/font_studio_f.test.js`가 `tests/studio_f/*.test.js`를 이름 차례로 싣는다 — 새 묶음은 package.json을 고치지 않는다): F0 편집 기록(되돌리기·다시·건너뛰기·한도·참가자 상태 복사본)·묶음 편집(취소하면 기록 없음, commit은 한 줄)·검사 결과 모양 맞추기·임시 등록(`studio-tmp-<n>`을 실제 런타임 `planJamo`로 풀고 `unregisterDesign`으로 지운다, 남의 번호는 건너뜀, 없으면 내용 주소 이름) · F1 조립식 목록 거울(정본 투영·런타임 생성 구간·`--check`)과 규칙 모델(모드 × 배치 × 역할 × 자모 × 방법 전수가 `registerDesign`과 같은 판정, 무작위 300단계 뒤 같은 구체성 충돌 없음, 잠금·씨앗 섞기·소스 빼기, 영향 목록이 ㄱ 칸 지우기에서 ㄱ·ㅋ·ㄲ만) · F2 출처 모델(디자인 31 × 자모 51 × 역할 4 × 짜임 3 × 받침 2의 요청 약 11만에서 Q3 = `planJamo` trace.rules) · F4 그림 문서(실제 `registerJamo`, `sanitizeSvg` 시험 그림 둘, 떼어 내기) · F7 팔레트(준비 상태·기록 셈, `pal-*`가 `withMode`에서 살아남음) · F8 묶음(왕복, 해로운 묶음의 칸마다 거부, 이름 겹침, 사전 검사, `.jamo.js`를 VM으로) · F9 영향 확인을 언제 묻는가
- 한글 입력기(`tests/font_kku_ime.test.js`): 두벌식 표준·세벌식 390·세벌식 최종의 키 표(행 단위 골든), 손으로 친 문장, 합자 모음·겹받침·두벌식 받침 넘김·세벌식 겹초성, 자모 단위 Backspace, 가짜 입력 칸으로 `attach()` 키 경로·한/영 전환·초점 없는 칸 캐럿, 패키지 `exports`/`files`
- 조합 체계(ADR-017, `tests/asset_sync.test.js`): `node scripts/build_looks.js --check`와 같은 대조 — `font-kku-looks.css`·`site/themes-data.js`가 `spec/themes.json`과 꾸러미 글꼴 꾸밈 구간에서 다시 만든 것과 같은지, 레이어 순서 문(`font-kku.look`, `font-kku.motion`), 정본의 깨진 참조·분류 안 된 글꼴·꾸러미 테마 규칙·없는 움직임 훅·변주 목록 불일치 거부, 꾸밈이 칠 속성만 옮기는지와 씨앗 조건 유지, 조합법의 확장 목록, 패키지 `files`/`exports`(`./fx`, 확장 CSS, `spec/themes.json`)
- 한 줄 설치 확장(`tests/font_kku.test.js`): `data-addons`가 `font-kku-looks.css`·`font-kku-motion.css`를 글꼴 뒤에 붙이고 `font-kku-fx.js`를 순서 있는 스크립트로 붙이는지, 이름 접기·중복·모르는 이름 경고, `data-addons`만 있을 때
- 상호작용(`tests/font_kku_fx.test.js`): `typingFrames`·`transitionFrames` 순수 함수, `type`의 지웠다 다시 치기·커서·한 번 도는 움직임 끄기·여러 바탕 요소 줄 나누기·멈춤·움직임 줄이기, `shuffle`의 `jamo-seeds` 켜기·누르기·주기·되돌리기, `scatter`·`magnet`·`replay`, 선언형 `bind`/`unbind`, CommonJS·ESM·타입 선언
- 글꼴 계약 v2 검사(`tests/font_lint.test.js`, `site/font-kku-lint.js`): 기본 제공 글꼴·별칭 shim·작업실 fixture 통과, 텍스트 검사 우회로(중첩 속 규칙, 범위 밖 선택자, 부분 문자열 레이어 판정, 속성 누수, 단위 없는 0 변형, `@import` 면제, 디스패치·런타임 변수, `!important`)가 코드별로 실패, 생성된 레지스트리 요약 최신성

- 배치 프로파일(ADR-026, `tests/layout_cases.test.js`): 설계 v1.2 사례 28개를 모두 node·browser·audit·deferred로 분류하고 node 사례를 실행 — 정본 생성기
  `--check`와 깨진 정본 거부, 디자인 1.2 `layout` 검증(누락·없는 프로파일·revision·고정 배치의 문맥 규칙·자리 변주), 도장 표(67키, 조합용 자모만,
  ㅘ = ㅗ + ㅏ 조각), 맞춤 규칙이 역할·자모로만 고르는지. 브라우저 사례는 스모크 `fixed-layout`(세 재료 × 11,172음절 불변, 머리 음절 없음, 칸 하나,
  sebul·네모 문맥·이전 디자인·대체·크기·낱자)
- 소개 페이지의 AI 답 세트(`tests/landing_sets.test.js`, `site/landing-ai-sets.js`): 답 HTML의 등록 코드를 그대로 돌려 얻은 칸이 원형 8칸 칸 계약 세트(`frame: "box"`, 고치지 않음 기록)이고 실제 `registerJamo`가 받는지, 그 8칸만으로 현대 자모(초성·중성·받침)가 모두 조립되는지(`planJamo`의 모든 획이 그림이나 그림이 긋는 획), ㄱ 칸이 3,444자에 들어가는지, 프롬프트가 설명서와 원형 8칸을 담는지
- 원소 획 표(ADR-027, `tests/element_table.test.js`): 생성기가 네 언어 미러에 굳히는 기본 배치(세벌식)의 원소 획 — 열쇠 283개(도장 짜임·조각마다
  232와 낱자 51, 짜임 열쇠 접미사 `|v0`·`|h` …)와 UTF-8 바이트 차례, 값마다 런타임 서식(JS `String()` + 단위), 런타임 실측 정답
  `spec/element-layer.json`과 획·마디·값·노드 밀도 대조(숫자는 tolerance 안). 생성기는 `font-kku.js`의 굵기 보정 함수를 빌려 돌린다 —
  갈라짐 가드: 런타임 셈을 바꾸면 도장 밀도(파이썬 사본 `measure_layout_stamps.py`) 대조가 실패하고, 꼭지 틈을 끄면 ㅎ·ㅊ 열쇠가 따라
  바뀌며, 빌린 함수가 새 도우미·새 선택자를 쓰면 실패한다

- 0.1.3 준비 런타임 감사 고침(2026-10-13, [노트](docs/NOTES/runtime-fixes-0.1.3.md)): `tests/font_kku.test.js` — `data-jamo-sets`만 있는 한 줄 설치(기본 CSS·세트 모듈·필요할 때 받기), 둘째 한 줄 설치 태그 넘겨받기(중복 없음, 판이 다르면 먼저 실린 판 자리), `registerJamo` 경로 문법(깨진 꼴 10 × 그림·칸 계약, 맞는 꼴 11), 디자인 고리·BigInt(`DESIGN_NOT_OBJECT`와 path, `registerDesign`도 같은 오류), CLI EPIPE(읽는 쪽이 먼저 닫으면 종료 0·빈 stderr). `tests/font_kku_export.test.js` — 가짜 런타임으로 거절 코드 다섯과 `report.skipped`, 필요할 때 받기 기다림·loaderror에서 멈춤, 표본 바탕 요소 지우기. `tests/font_kku_ime.test.js` — 선택 없는 칸 거절과 붙인 뒤 `type` 바뀜, 초점 있는 칸의 `execCommand` 경로(명령 차례·선택 범위·키 하나에 표시된 `input` 한 번·`state()`), 초점 없음·명령 거절·페이지가 막은 `beforeinput`의 `setRangeText` 대체. `tests/asset_sync.test.js` — 꾸밈의 빛 리셋·머리 모음·그림 자소 테·테 하한, 꾸러미 글꼴의 그린 칠 구간, 질감 자소판은 칸마다 필터(영역 = 칸 하나), 도트는 `@media (min-width)` 안에서만 `crispEdges`, 움직임 확장의 재료별 shine·움직임 줄이기 `!important`·스크롤 조립 타임라인, 레지스트리 772/704. `tests/layout_cases.test.js` — revision 3, `accepts ["1","2"]`. `tests/element_table.test.js` — 초성 ㄲ 둘째 ㄱ이 첫 기둥과 떨어짐. 가독성 감사 단위 시험 `test_legibility_gate_flags_short_stems_of_o_and_u`(`tests/test_glyph_tools.py`). `generate_sidecar_tables.js`는 67 도장의 런타임 `strokeDensity`와 파이썬 사본(낱자 틈 0.4t·최소 틈 0.3t)이 어긋나면 실패한다

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
다른 한글 글꼴이 없으면 건너뜀)가 본다. 네 언어 원소 출력은 각 언어 시험이 `spec/element-layer.json`(열쇠 283개)과 대조한다.

### 브라우저 스모크

`tests/test_playwright_smoke.py`가 런타임과 데모 화면을 실브라우저로 확인한다. 기본은 server 모드이고, file:// 길이 따로 있는 검사만
file 모드도 돈다(아래 '모드').
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
`assert_font_studio_design`은 디자인 패널(설계 v1.2 §13)을 본다: 맨 주소의 첫 화면이 세벌식 기본 디자인이고 초안을 쓰지 않는지,
비교 칸이 초성 ㄱ·중성 ㅏ를 한 가지 자리로 재는지, 재료를 바꿔도 배치가 그대로인지, 네모 문맥에서만 문맥 규칙 탭이 열리는지,
문맥 규칙이 있는 디자인을 고정 배치로 바꾸면 충돌을 보이고 고를 때까지 적용하지 않는지, 등록 실패 때 마지막 정상 디자인을 두는지,
고정 배치 도장 노드의 글꼴 CSS 편집을 받지 않는지, 디자인 JSON 저장·1.1 디자인 열기(배치를 끼워 넣지 않음)·초안 복원,
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
굵기 계수 k인지 그림마다 축별로 잰다(화면 획 / k·`--fy-el-w`가 0.97–1.03, 촘촘한 받침이 실제로 가늘어졌는지도) — 세벌식·옛 배치(`font="sebul"`)의 `pilgi-box`·`dunggeun-box` 겹받침·홑받침 대조 음절과
원소 미리보기(`@line`·`@ring`, gothic의 흐·흙·읊·훅 포함). 그림 `<svg>`가 노드 배율을 되돌리지 않으면 겹받침 1.61·받침 0.71로 실패한다.
이 비율은 그림의 화면 배율에서 계산하므로 엔진의 `non-scaling-stroke` 해석을 전제한다. 그래서 화소로도 본다(`svg_stroke_pixel_ratios`):
그림 하나만 보이게 찍은 잉크 합 ÷ 같은 그림을 변환 없는 `<svg>`에 같은 화면 상자·`--fy-el-w` 획으로 그려 찍은 잉크 합이 0.95–1.05다
(필기 세벌식·둥근 `font="sebul"`의 ㄳ·ㄺ·ㅏ·ㅣ — 되돌림을 빼면 1.52–1.60·0.81–0.89). Playwright Firefox가 설치돼 있으면
(`.venv/bin/python -m playwright install firefox`) `test_face_svg_stroke_firefox`가 같은 검사를 Firefox로 돌고, 없으면 건너뛴다 —
기본 스모크는 Chromium 하나다. 2026-10-12 Firefox 151(Playwright firefox-1532)에서 Chromium·WebKit과 같았다.
고리 그림은 화면 상자가 고리 마디 상자에서 굵기의 절반씩 안쪽(고리 중심선 상자, ±0.1px)이어야 한다 — 테두리 안쪽 상자를 기준으로 하면
기기 화소로 버린 테두리 굵기만큼(72px에서 한쪽 0.4–0.8px), 크기가 `auto`면 viewBox 비율로 커져 아래 ㅡ·ㅜ에 닿는다.

`assert_element_density`(스모크 `element-density`)는 밀도 굵기 계수(ADR-024 §3)를 그려진 DOM에서 다시 잰다. 세벌식·`font="sebul"`·
`font="gothic"`의 노드마다 마디의 인라인 자리와 노드 변환으로 같은 방향 평행 마디의 중심 간격 p를 셈해, k = 1이면 p ≥ 1.6t, k < 1이면
p < 1.6t이고 바닥(0.75)이 아니면 p ≥ 1.6·k·t(틈이 가늘어진 획의 0.6배 이상), 가로 마디의 화면 굵기가 k·t인지 본다. ㅎ·ㅊ 꼭지(점 획)는
평행 간격에서 빼고 꼭지 틈으로 세므로, 꼭지가 든 노드는 p가 넉넉해도 k < 1일 수 있다. 세벌식의 계수가 도장 값이고 받침 ㄹ·ㅀ과
초성 ㅎ(꼭지 틈)은 가늘고 ㄷ은 1인지, 24px와 48px에서 같은지(L21 — 옛 배치의 머리 음절은 2층 재귀가
화소로 재서 크기마다 자리가 조금 달라 뺀다), 선 그림 세트의 `stroke-width`가 k·t이고 칠 세트(붓)가 든 노드는 1인지도 본다.
계수를 끄면(바닥 1) 옛 배치 받침 ㄹ에서, 도장 값을 코어 CSS가 받지 않으면 세벌식 받침 ㄹ에서 실패한다.

`assert_element_cap_gap`(스모크 `element-cap-gap`)은 꼭지 틈(ADR-024 §3)을 그려진 화면 상자로 잰다. 세벌식·`font="sebul"`·
`font="gothic"` × 24·48px에서 하·호·화(머리)·홍·좋·낳·않·잃·차·초·최·몇과 낱자 ㅎ·ㅊ의 꼭지와 가로획 사이가 0.6·k·t 이상(계수가
바닥 0.75면 0.4·k·t 이상)이고, ㅎ 동그라미 속이 0.5·k·t 이상 열려 있으며, 틈 ÷ 글자 크기가 두 크기에서 같은지(L21) 본다.
꼭지 틈 열기(`dotShifts`)를 끄면 세벌식 초성 ㅎ에서 틈이 0.07px(0.6·k·t는 1.1px)라 실패한다. 바꾸기 전에는 세벌식 초성 ㅎ
−0.023em, 받침 ㅎ −0.019em, `font="sebul"` 홍 −0.032em으로 꼭지가 가로획에 붙었다.

`assert_selection_copy`(스모크 `selection-copy`, 고정 페이지 `tests/fixtures/selection/index.html`)는 고르기와 복사(ADR-003 보강
2026-10-13, ADR-025 §12)를 본다. 런타임이 그린 root마다 `data-fy-select="jamo"`·`aria-hidden`·고를 수 있음, 원문 거울은 `user-select: none`,
브라우저 자체 `::selection`은 root 안과 바탕 요소 자신 모두 투명한지(바탕 요소 쪽이 칠하면 WebKit에서 띠가 두 겹이 된다). 실제 마우스로 앞 글 첫 글자부터 글꼴 없는 바탕 요소(세벌식·원소)와 사이 글을 지나 `font="sebul"`의
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

0.1.3 준비 런타임 감사 스모크(2026-10-13, 모두 고치기 전 코드에서 실패하는 것을 확인했다):
`space-wrap`(`tests/fixtures/space-wrap`, `test_space_wrap_engines[firefox|webkit]`) — 7폭 × 꾸밈 5에서 줄 첫머리 들여쓰기·넘침 없음, 가운데(±0.75px)·오른쪽·양쪽 정렬, 칸 1·2개·nbsp·탭 폭, 맨 앞 빈칸 폭 유지, 고르기가 줄바꿈을 바꾸지 않음, 고른 칸의 글자 높이 띠.
`sprite-mask-seams`(`tests/fixtures/sprite-mask-seams`, DSF 1·2, `test_sprite_mask_seams_engines`) — 칸 가운데 점만 찍은 자소판을 마스크 칠·보통 칠로 그려 노드 가장자리 1px 띠의 가장 어두운 화소가 같아야 한다(옛 CSS WebKit 27–66 대 0).
`layout-readability` — 세벌식 ㅗ·ㅜ 꼭지·다리 ≥ 0.14em, 세벌식·sebul·malang 원소 ㄲ·ㄸ·ㅃ·ᆩ 낱자 틈 ≥ 0.03em(ㅃ 0.02), 기기 재료 쌍자음 획 넓힘 줄임, `--fy-element-width: 0.13em`의 '를' 틈 ≥ 0.3t와 인라인 밀도, 옛 sebul ㅞ 머리 0.82(sebul 기기·neon), `butgeul-box` 낱자 `@solo` 늘이기 0.85–1.2(하위 검사 14개 모두 0.1.2에서 실패).
`look-paint`(Chromium server — `both`면 file도, `test_look_paint_engines[firefox|webkit]`는 server) — 과의 머리 모음 = 고의 ㅗ 색, neon + 다른 꾸밈의 빛 없음, 벡터 칸 글자 획 0, 그림 자소 외곽선의 테·옅은 속(옅은 화소 ≥ 4배), 도면 비한글 선, 16·24px 테 × 노드 배율 ≥ 0.98px와 진한 잉크 비 ≥ 0.35, 꾸러미 글꼴 + 칸 계약 세트의 그린 칠.
`sprite-jamo-gaps` — 노드마다 따로 찍은 잉크로 그림 자소 9종 놓·좋·뭏·읗의 받침 ㅎ 틈 ≥ 0.01em, 꽤·꽥·꽹(그림 자소)·꽤·꿰·꽥·꿴(gothic 원소·기기·dunggeun-box)의 ㄲ → ㅐ·ㅔ 기둥 틈 ≥ 0.01em.
`sprite-sheet-engines`(`test_sprite_sheet_engines[firefox|webkit]`, WebKit file://에서는 crayon을 건너뛴다) — chalk·crayon·dojang·jasu 24/48/96/160px 잉크, pixel 16px와 64px를 ¼로 줄인 꼴의 차 ≤ 0.42.
`motion-materials`(`test_motion_materials_engines[firefox|webkit]`) — 기본·sebul·neon·pilgi·벡터 세트·pilgi-box의 shine 화소 변화 ≥ 1%, 움직임 줄이기에서 도는 움직임 0·획순 그리기 획 다 보임·칠 그대로, 문서 끝과 스크롤 없는 상자의 scroll-assemble이 끝에서 모임(animation-timeline이 없는 Firefox는 건너뜀).
`font-export-refusals`(faces.html, server는 필요할 때 받는 chalk와 NFD) — 원소·SVG·기기 재료, 오타 글꼴, 없는 세트, 빈 자소판, 한글 없는 `text`의 거절 코드. `test_ime_attach_engines[browser|firefox|webkit]`(set_content) — email·number 거절, 거절된 칸의 기본 입력, text → email 바뀜, `dkssud` → 안녕과 표시된 `input` 6번, 되돌리기·다시 하기.
그 밖에 `selection-copy`는 꾸밈 방식 h2를 왼끝에서 오른끝 +30px까지 끌기(Firefox 마지막 음절), `runtime-lifecycle`은 묶음당 선택 읽기 ≤ 1(바탕 요소 40개)과 그림자 트리 코어 CSS 링크·iframe 경고 한 번, `font-studio-material-tools`는 빈 자소판 내보내기 `EXPORT_NO_GLYPHS`, `public-pages`(server)는 fonts.html 내보내기 거절 문구, `element-density`는 계수 0.5–1(0.75 밑은 틈 ≥ 0.3t)을 본다.

스모크 검사 목록은 `tests/playwright_smoke.py`의 `run_check()`(명령줄 `--mode both`)와 pytest
쪽 래퍼 함수에 각각 있다. `test_smoke_registration_in_sync`(AST, 브라우저 없음)가 최상위
`assert_*` 화면 검사가 두 목록에 모두 등록됐는지와 두 목록이 같은지 확인한다. 새
`assert_*` 검사를 추가하면 두 곳에 등록한다 — 다른 `assert_*`만 부르는 도우미는 예외다.

**모드.** 기본 스모크는 server 모드만 돈다. file:// 길이 따로 있는 검사만 늘 두 모드를 돈다(`FILE_DIFFERS`: `assert_demo`,
`assert_public_pages`, `assert_showcase_page`, `assert_landing_problems`, `assert_font_studio_material`, `assert_runtime_lifecycle`,
`assert_font_export_refusals`). 나머지는 두 모드에서 같은 코드를 두 번 돌 뿐이었다. `FONT_KKU_SMOKE_MODES=both`면 모든 검사를
두 모드로 돈다. `npm run verify:release`가 이 값을 준다. 시험 id는 그대로다(`server-…`, 남긴 것은 `file-…`).
`verify`의 스모크 단계는 `--durations=15`로 느린 검사 15개를 함께 보인다.
`test_smoke_registration_in_sync`가 `FILE_DIFFERS`를 검사 안의 file 갈림 줄(`label == "server"`, `location.protocol`,
`url.startswith("file:")`)과 맞춰 본다. WebKit과 함께 묻는 줄은 그 엔진에서만 갈리므로 세지 않는다.
수집 수(2026-10-13): 바꾸기 전 147개 → 기본 90개(file 7개), `both` 149개(예전 147개와 id·차례가 같고 새 시험 둘).

file 모드의 Chromium은 `--allow-file-access-from-files`로 뜬다. 그래서 실제 file:// 제약을 보지 못한다.
`test_real_file_url_without_flag`가 그 깃발 없이 띄워 문서가 말한 것을 본다: CSS 획 글꼴(바탕 요소·`sebul`)이 그려지고,
`font-kku.mjs`(module script)는 막히고, 사례 페이지는 목록·고쳐 쓰기 대신 정적 서버 안내를 보인다.
Chromium은 깃발이 없어도 file:// 자소판(배경·마스크 칠)을 그린다. 그래서 자소판은 이 시험에서 단언하지 않는다.

**엔진.** Firefox·WebKit이 없으면 엔진 검사(`test_*_engines`, `test_face_svg_stroke_firefox`)는 건너뛴다.
`FONT_KKU_REQUIRE_ENGINES=1`이면 건너뛰지 않고 설치 안내와 함께 실패한다. 엔진 검사는 `engine_params`(매개변수)와
`run_engine`(몸통)을 함께 쓴다. 모드는 다른 검사와 같다(기본 server).

**느린 기기 흉내.** `FONT_KKU_SMOKE_CPU_THROTTLE=N`이면 스모크가 여는 모든 Chromium 페이지에 CDP
`Emulation.setCPUThrottlingRate(N)`을 건다(새 창·새 문맥·팝업 포함, 페이지를 옮겨도 남는다). 기계에 부하를 주지 않고 부하에 약한
검사를 재현한다. 렌더러 주 스레드만 늦춘다. 정적 서버·pytest·합성기는 그대로라, 병렬 부하에서만 나는 실패는 재현되지 않을 수 있다.

```bash
FONT_KKU_JOBS=1 FONT_KKU_SMOKE_CPU_THROTTLE=4 .venv/bin/python -m pytest tests/test_playwright_smoke.py -q -k "server-showcase"
```

**검사를 쓸 때.** 고정 sleep 뒤 한 번 읽지 않는다. 늦게 서는 상태는 `poll(page, js, ok)`로 기다린다. 조건이 설 때까지 다시 읽고,
끝내 안 서면 마지막 값으로 실패한다. `wait_for_function`도 된다. '없어야 한다'는 검사(오류 없음, 움직임 없음)는 기다려서
통과시키지 않는다. `settle(page, ms)`(화면이 두 번 그려진 뒤 ms)로 기다린 뒤 한 번 읽는다.

#### 알려진 간헐 실패

실패를 '원래 있던 간헐 실패(pre-existing flaky)'로 넘기려면, 기준 커밋에서 같은 시험 id를 CPU 늦춤으로 재현하고 그 횟수(n/m)를
적는다. 재현하지 못하면 간헐 실패로 보고하지 않는다. 고칠 실패로 다루거나 '재현 못 함'으로 적고 원인을 찾는다.
재현했거나 본 간헐 실패는 아래 표에 적는다. 상태 기다리기로 고치면 '고침'과 날짜를 적는다.

| 시험 id | 증상 | 재현 조건 | 상태 |
|---|---|---|---|
| `test_page_surface[server-showcase]` | `showcase.html#apps at 1280px should land at its scroll margin (top 57, margin 64)`, 390px에서 top −53 | CPU 늦춤 4, 일꾼 1. 기준 fb971d8에서 4번 중 3번 실패(top 57–58) | 고침 2026-10-13. 페이지 경합이었다 — 처음 맞춘 뒤 카드가 서며 목표가 7–157px 밀렸고, 8초를 기다려도 다시 맞추지 않았다. `#new`는 고쳐 쓰기 미리보기 틀이 297px 줄었다 몇 초 뒤 다시 늘어 밀렸다. `site/showcase.js` `holdJump`가 사용자가 손대기 전까지 15초 동안 프레임마다 다시 맞춘다. 시험은 8초 동안 제자리 두 번을 기다린다. 고친 뒤 CPU 늦춤 4로 5/5 |
| `test_page_surface[server-fonts-themes]` | `closing the customizer must restore the composer hash` | 병렬 부하(load 약 45)에서 6번 중 1번. CPU 늦춤 8로 3/3 통과(재현 못 함) | 고침 2026-10-13. 시험이 조합기 해시 쓰기(200ms 늦춤)·대화상자 close 사건(늦게 옴)과 경합했다. 지금 조합의 해시가 선 뒤 열고, 닫은 뒤 되돌아오기를 기다린다 |
| `test_font_studio_f_surface[server-assert_studio_f_draw_detach]` | IoU 0.069 | 병렬 부하에서 기준 3번 중 1번. CPU 늦춤 4·8로 재현 못 함 | 고침(추정) 2026-10-13. 무대 코어 CSS가 4초 안에 안 와도 찍었다. 이제 안 오면 '코어 CSS 없음'으로 실패한다. 그 뒤 통합 일상 verify(`-n 4`, load 약 4)에서 IoU 0.000이 한 번 났다(뗀 뒤 사진에 잉크 없음, 혼자·CPU 늦춤 4·6으로 8/8 통과) — 뗀 뒤 사진은 IoU가 설 때까지 8초 동안 다시 찍는다 |
| `test_page_surface[server-effects]` | `the cursor magnet should push nearby jamo, moved 0` | 병렬 부하. CPU 늦춤 4·8로 재현 못 함 | 고침 2026-10-13. 400ms sleep 대신 밀릴 때까지 기다린다(다시 재생의 2.6초 sleep도 상태 기다리기로) |
| `test_page_surface[server-public-pages]` | `fonts did not arrive for visible hosts` | 병렬 부하. CPU 늦춤 4로 재현 못 함 | 고침 2026-10-13. 훑어 내릴 때 자리마다 화면이 그려지기를 기다린다(관찰자는 그릴 때만 잰다). 고친 뒤 CPU 늦춤 4로 5/5 |
| 위 셋(fonts-themes·effects·draw_detach) 중 하나 | `Page.wait_for_function: Timeout 30000ms exceeded` | 고친 뒤 CPU 늦춤 4 묶음 16번 중 1번(다른 에이전트 부하가 있던 때). 시험 id를 남기지 못했다 | 열림. 다시 나면 `--tb=short` 출력으로 id를 적는다 |
| `test_runtime_lifecycle_contract[file]` | `shadow root font resolution mismatch … 'loadFont': False` | 병렬 부하(load 약 20)의 묶음 실행에서 1번. 혼자·CPU 늦춤 4로 6/6 통과. 2026-10-14 `verify:release`(5fa07c7)에서 1번 — 기준 78fa3d6과 5fa07c7을 트리마다 4개씩 함께 CPU 늦춤 8(load 약 10)로 돌려 각 2/20 실패(같은 증상), 혼자 CPU 늦춤 4로 둘 다 8/8 통과 | 열림. `loadFont(href, {root})`의 돌려준 목록(`refreshAll`)이 그 root의 stylesheet 자동 다시 맞춤과 경합하는 듯하다(런타임) |

### 글자 측정 도구와 겹침 릴리스 관문

- 글꼴 파일 내보내기(ADR-015): `tests/font_kku_export.test.js`(외곽선 추적·잘림·TTF 표·체크섬·WOFF), `tests/test_font_export.py`(fontTools 읽기), 스모크(작업실 재료 탭 내보내기, 글꼴 시험대 도트 글꼴 11,223자 내려받기 — 서버 모드), 수동 전체 검증 `python scripts/export_font_file.py --font <id> --out tmp/x.ttf --woff2 tmp/x.woff2 --compare`(표본 음절 런타임 대비 잉크 IoU)
- `tests/test_glyph_tools.py`: 모든 `scripts/glyph_*.py`의 import와 `--help`(새 도구 자동 포함),
  측정 하네스 안전장치(네트워크 글꼴 URL 금지, 고정 페이지 경로 금지, 캐시 누락·알 수 없는
  글꼴 실패, 레지스트리 기반 적합 변수), 순수 도우미, 겹침 정책 판정, 기계 슬롯(두 프로세스가 K=2를 나눠 씀, 끔·중첩·상한,
  못 쓰는 폴더), 캐시 폴더가 worktree에서 본 checkout을 가리킴, 측정 도구가 스모크 파일을 싣지 않고 스모크만 고쳐도 열쇠가 그대로임.
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
- `Stroke audit (fixed layout, element|device)` 단계: `glyph_stroke_audit.py --font sebul --layout fixed --face …`가 세벌식의
  획 굵기를 잰다. 원소 재료는 굵기를 스스로 맞추고, 기기 글꼴 재료는 `spec/layout-profiles.json` 맞춤 규칙 `deviceStroke`의 굵기
  보정(도장마다 text-stroke, ㅡ·ㅣ는 그 방향 배율, ㅛ·ㅠ는 두 꼭지가 붙지 않는 `cap`)이 기준 안에 있는지 본다.
- `Stroke audit (svg <세트>)`·`Stroke audit (fixed layout, svg <세트>)` 단계(2026-10-12): 획 굵기 감사의 `--policy --jamo-set <세트>`가
  기기 글꼴 재료에 칸 계약 그림 세트를 걸어 SVG 재료(ADR-024)로 잰다. 기본 제공 세트 셋(`pilgi-box`·`dunggeun-box`·`butgeul-box`) × 두 배치라
  여섯 단계다. 옛 배치는 정책 `jamoSets` 항목의 글꼴로 재고(필기·둥근은 sebul·gothic, 붓은 sebul), `--layout fixed`는 세벌식(sebul)으로 잰다.
  판정은 세트 항목의 허용 폭·예외에 글꼴 항목의 `face: "svg"` 예외를 더한다. 세트 예외의 `layout`(legacy|fixed)은 그 배치에서만 쓴다.
  - 필기·둥근은 예외 없이 넘침 0이다. 그림 `<svg>`의 노드 배율 되돌림(코어 CSS)이 빠지면 여기서 걸린다(고치기 전 29·21·32·23).
  - 붓은 그림 자소 글꼴 butgeul과 같은 허용 폭 0.35다. 예외는 받침 ㅎ, 옛 배치의 가로모음 막대(ㅗ·ㅛ·ㅜ·ㅠ·ㅡ — ㅡ는 세벌 고정 revision 2의 긴 기둥 비로 누른 옛 배치 기둥이 가늘어져서)와 가로모음 위 ㄱ이다 —
    채운 붓은 한 그림이라 기본 배치에 맞춰 누른다. gothic은 재지 않는다(gothic 자리 기하를 채운 붓이 그대로 받아 0.35에서도 넘침 40).
  - 단계마다 세션 2–4개, 캐시 없이 약 6–7초다(여섯 단계 약 40초). 일상 층은 측정 캐시를 읽는다.
  - 겹침 감사의 `--jamo-set`은 개발용이다(verify 단계 아님, `--layout fixed`와 함께 쓸 수 있다, 측정 캐시 열쇠에 세트가 들어간다).
  - 그림 획 굵기 계약 자체는 스모크 `face-svg-stroke`가 본다.
- `Overlap audit (fixed layout, element|device)` 단계: `glyph_overlap_audit.py --font sebul --layout fixed --sample full`(일상 층은 `family`)이 글꼴을 밝히지 않은
  바탕 요소의 기본 배치(세벌식, ADR-028)를 원소·기기 글꼴 두 재료로 잰다. 정책 예외 없이 기본 임계 15%다 — 도장은 짜임·역할·자모마다
  하나라 특정 음절만 고칠 수 없고, 겹침은 `spec/layout-profiles.json`의 역할 상자·맞춤 규칙(프로파일 전체)으로 고친다. 도장을 다시 지을 때는
  `scripts/measure_layout_stamps.py --write`(역할 상자에서 짓는다, 브라우저 없음) 뒤 `node scripts/build_layout_profiles.js --write`,
  값이 바뀌면 프로파일 revision을 올린다(이전 revision 디자인을 받을지는 `accepts`). 붓 그림 세트(`butgeul-box`)는 직결식
  (`sebul-fixed-v1`) 도장 배율로 붓을 미리 누르므로 직결식 도장을 바꿨으면 `node scripts/build_jamo_svg.js --write`. 직결식(`jikgyeol`)의
  겹침은 정책 단계 `Overlap audit`가 잰다. 이어서 네 언어 미러·정적 자산·원소 획 정답·HTML 사례를 다시 낸다
  (`generate_sidecar_tables.js --write` → `sync_assets.py` → `record_element_layer.py --write` → `generate_html_cases.py`, ADR-026 §2).
  `npm test`의 `--check`들이 빠진 단계를 잡는다.

- `Legibility audit (fixed layout)` 단계(2026-10-13): `scripts/glyph_legibility_audit.py`가 기본 배치(세벌식)가 **읽히는 꼴**인지
  원소·기기 글꼴·SVG 그림(`pilgi-box`) 세 재료로 잰다 — 겹침·획 굵기 감사가 재지 않는 것이다(세벌 고정 revision 1은 두 감사를 넘고도
  받침이 떨어지고 줄이 부딪혀 읽히지 않았다, ADR-026). 표본 1,000자(11자 걸러) + 대표 음절 + 문장 음절을 100px로 하나씩 띄워 그리고
  역할마다 색(초성 빨강·중성 초록·종성 파랑)을 칠해 찍어, 음절마다 역할별 잉크 상자를 화소로 얻는다. 글자 칸·간격·빈칸 폭은 DOM에서 읽고
  40자 줄 격자·문장은 그 상자로 셈한다. 게이트: 칸 밖 잉크 ≤ 0.01em, 위아래 줄·이웃 글자 잉크 틈 ≥ 0.06em, 받침 위 틈 ≥ 0.03em,
  세로 모음 끝–받침 ≤ 0.08em, 초성 아래–받침 위 가운데값 ≤ 0.28em, 낱말 안 틈의 최대 < 낱말 사이의 최소. SVG 그림 세트는 획이 상자 밖으로
  조금 나와 틈 지표를 0.02em 덜 본다. 세 재료 약 30초, 기기 글꼴 재료를 darwin 글꼴로 재므로 획 감사와 같은 플랫폼 조건이다.
  `Legibility audit (jikgyeol)`은 직결식(`font="jikgyeol"`)을 원소 재료로 같은 게이트에 건다 — 고정 배치를 고르는 글꼴은 게이트,
  그 밖의 글꼴을 밝힌 문맥 배치는 보고만 한다(2026-10-14).
  `--font sebul`처럼 글꼴을 밝히면 보고만 한다. 지표의 셈은 `tests/test_glyph_tools.py`가 브라우저 없이 본다(가짜 상자로 통과·실패).
- 검수 시트(게이트 아님): `scripts/review_sheets.py`가 첫 화면 제목(128px, 원소·글자 칸·기기·SVG·네온·스티커), 낱말(112·48px),
  문단(24·48px), 1,000자 격자, 확대 자모 칸(원소·기기), 낱자, 재료 셋, 작은 글씨(16·24px, 1x·2x), 꾸밈 여덟 가지를 그린다.
  `--before <checkout>`이면 그 checkout의 런타임으로 같은 시트를 그려 전·후를 나란히 붙인다. 배치·재료·꾸밈을 바꾸면 이 시트를 **눈으로 본다**
  (점검표 `skills/font-kku/references/legibility.md` §3.1).

### 헷갈리는 짝 감사(보고만)

- `FONT_KKU_JOBS=1 .venv/bin/python scripts/glyph_confusable_audit.py --fonts all --before tmp/release-baseline/<직전 판>/package --report`
  (`verify:release`의 `Confusable pairs audit` 단계가 같은 것을 `--out tmp/confusable/release`로 돈다).
- 짝 21쌍(`tests/confusable-pairs.json`)을 기본 배치·글꼴 21개 × 16·24·32px × 화면 배율 1·2로 그린다. `rel` = 한쪽에만 있는 잉크
  (1 장치 화소 어긋남은 용서) ÷ 기기 글꼴의 같은 짝. 일부만: `--fonts fixed,sebul --sizes 24 --dsf 1`.
- 판정하지 않는다. `--report`는 언제나 0이다. 결과는 `tmp/confusable/<시각>/report.json`과 `sheet.png`다.
- `sheet.png`를 열어 걸린 짝(제안: `rel` < 0.2, 직전 공개판보다 30% 넘게 떨어짐)을 실제 크기로 본다. 공개 승인을 청할 때 함께 보인다.
- 1px보다 좁은 낱자 틈(ㄲ·ㄸ·ㅃ)은 못 본다. 확대 시트로 본다. 교정 경위는 [confusable-audit.md](docs/NOTES/confusable-audit.md).
- 순수 도우미 시험 `tests/test_confusable_audit.py`(브라우저 없음)는 `Tooling unit tests` 단계에 있다.

### 매트릭스 탐침(보고만, 공개 층)

- `tests/matrix_probe.py`는 세 엔진에서 글꼴 22(`nofont` = font 속성 없는 기본 배치 포함) × 꾸밈 12 × 16·48px와 움직임 14 × 재료
  셋(원소·`jamo-set="pilgi-box"`·pixel)을 그려 "안 그려짐·안 바뀜"을 찾는다. 모양은 판정하지 않는다.
- 돌리기: `.venv/bin/python tests/matrix_probe.py --report --jobs 2`(전체 135페이지 약 100초, 스스로 127.0.0.1 빈 포트에 저장소를 띄운다).
  일부만: `--engines webkit --fonts chalk,crayon --looks none --motions none`. 움직임만: `--fonts none --materials all`.
  `verify:release`의 `Matrix probe` 단계는 `--require-engines`로 돌아 엔진이 없으면 `engine:missing`으로 남긴다(보고만).
- 보기: `tmp/matrix-probe/<시각>/contact-sheet.png`(걸린 칸 | 견줄 칸)와 `pages/*.png`를 눈으로 본다. 수치가 깨끗해도 페이지 그림을
  본다 — 잉크를 더하는 결함(칸 테두리)은 판정으로 안 잡힌다.
- 하한은 `tests/matrix-probe-floors.json`(fb971d8에서 잰 최솟값의 절반). 다시 재기: `--calibrate` → `<out>/floors.calibrated.json`.
  경위는 [matrix-probe.md](docs/NOTES/matrix-probe.md). 순수 도우미 시험 `tests/test_matrix_probe.py`는 `Tooling unit tests` 단계에 있다.

### 공개 전 탐침과 탐색(보고만)

- `FONT_KKU_JOBS=1 .venv/bin/python tests/probes/run.py --shots` — 0.1.2 런타임 감사에서 확인된 결함 37건을 탐침 33개로 다시 잰다.
  기준 주소는 기본 `http://127.0.0.1:8470`이고 `--base`나 `FONT_KKU_PROBE_BASE`로 바꾼다. 실패해도 끝 코드 0이고, `--strict`면 1,
  주소에 닿지 않으면 2다. 결과는 `tmp/probes/<시각>/report.json`, 시트는 `shots/`에 남는다. 일꾼 1개로 1–2분이다.
- 실패한 탐침은 고쳤던 결함이 돌아온 것이다. 곧 이번 판의 새 회귀다.
- 직전 공개판(npm `gitHead`) 이후 런타임 영역(배치·꾸밈·자소판·움직임·API)이 바뀌었으면 `.claude/workflows/runtime-defect-sweep.js`를
  args `{base, since, out}`로 돌리고 `python3 tests/probes/merge_sweep.py <out>`로 모은다. 이번 판에서 새로 생긴 high가 0건일 때 승인을 청한다.
  절차는 [runtime-sweep.md](docs/NOTES/runtime-sweep.md), 새 탐침 쓰는 법은 [tests/probes/README.md](tests/probes/README.md)
  (결함이 있는 판에서 실패하고 고친 판에서 통과해야 한다).

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

- 검증 층과 명령의 정본은 이 문서다. 다른 문서(노트·상태·설명서)는 다시 적지 않고 이 문서를 가리킨다.
- 공개 순서와 승인 요청 틀의 정본은 [ADR-022 §6](docs/ADR/ADR-022-npm-name-and-versioning.md)이다.
- 사용자 결정을 기다리는 것과 공개판 알려진 문제는 [TODO_LIST.md](TODO_LIST.md)의 '결정 대기'·'공개판 알려진 문제'에
  모은다. 노트에만 두지 않는다.
- '끝냈다'·'확인했다' 기록에는 확인한 범위(페이지·글꼴·엔진·크기)를 함께 적는다. 범위를 넘어 믿게 하지 않는다.

## CI와 릴리스 점검표

릴리스 관문은 로컬 `npm run verify:release`다. 공개 순서(번호 올리기 → 그 커밋에서 `verify:release` → 공개 전 탐색 점검 →
`release_gate` 보고 → 사용자 승인 → `npm publish` → `check_cdn_min` → 사이트 배포)와 공개 승인 요청 틀(여섯 칸)은
[ADR-022 §6](docs/ADR/ADR-022-npm-name-and-versioning.md)이 정본이다. 여기에는 판정에 쓰는 점검만 둔다.
`.github/workflows/ci.yml`은 원격 저장소를 쓸 때 push/pull request에서 코어, 다른 언어 구현 4종,
브라우저/정적/그림 자소/도구, Linux 시각 캡처를 분리 실행하는 선택적 설정이다. Linux 러너에서는 darwin 실측
겹침 감사를 사유와 함께 건너뛰고, Linux 시각 job은 캡처/업로드 실패를 막지만 픽셀 승인은 수동이다.

- 공개할 바로 그 커밋에서 `npm run verify:release`가 macOS에서 생략 없이 통과한다(`SKIPPED` 단계 없음). summary가
  git HEAD·트리 더러움·pack 무결성을 함께 적어 그 커밋에 묶인다.
- 공개 층 단계 'Release review sheets'가 직전 공개판 대비 전후 시트를 만들고 summary `reviewSheets`에 경로를 적는다.
  모양은 판정하지 않는다 — 사용자가 본다.
- `npm publish` 앞에서 package.json `prepublishOnly`의 `scripts/release_gate.py`가 summary와 HEAD를 대조하고 승인 보고를
  찍는다. 승인을 청하기 전에 `npm run prepublishOnly`로 먼저 돌려 본다. 공개 승인 요청에는 그 보고 ①–⑥과 `Release review sheets`
  시트(summary `reviewSheets`)를 붙여 사용자에게 보인다. 에이전트가 시트를 본 것으로 대신하지 않는다.
- 검증 뒤 문서(*.md)만 바뀌었으면 관문이 목록을 보이고 넘긴다. `spec/*.json`이 바뀌었으면 HEAD에서 `npm run verify:fast`를 돌린 뒤
  사용자 승인을 받아 `FONT_KKU_RELEASE_OVERRIDE=<까닭>`으로 넘기고, 그 까닭을 CHANGELOG 공개 줄에 적는다. 런타임·그 밖의 패키지
  파일(package.json 포함)이 바뀌었으면 `verify:release`를 다시 돈다.
- 공개 승인 요청 전에 탐침(`tests/probes/run.py`)을 돌린다. 런타임이 바뀌었으면 탐색 워크플로도 — 이번 판의 새 high 0건(위 '공개 전 탐침과 탐색').
- `npm run test:docs`와 `git diff --check`가 통과한다.
- CSS/명세 변경이면 생성물과 다른 언어 구현 4종이 함께 정합한다.
- 글꼴 시각 변경이면 겹침 정책(`tests/overlap-policy.json`)이 새 상태를 정직하게 반영한다. 새 예외는 승인 요청에 보인다.
- 의도된 시각 변경은 기준선 diff와 전후 시트를 사용자가 본다. 에이전트·LLM 판정단이 본 것으로 대신하지 않는다.
- 원격 CI를 돌렸다면 그 결과는 로컬 PASS와 별개로 기록하고 하나를 다른 하나로 표현하지 않는다.
- 실제 패키지 레지스트리 배포/tag와 외부 자산 정책은 따로 사용자 승인을 받는다. 공개한 커밋은 npm `gitHead`
  (`npm view <패키지>@<버전> gitHead`)로 안다. 로컬 git tag는 사용자가 청할 때만 만든다.

과거 실행 수치를 새 릴리스의 증거로 재사용하지 않는다 — 공개 층은 측정 캐시를 읽지 않는다. 현재 판정은 공개할 커밋에서
실행한 `npm run verify:release`가 쓴 `tmp/verify-summary.json`이다(`releasePass`, `git.head`, `pack.integrity`).
