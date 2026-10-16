# 글꼴 작업실

## Purpose
브라우저에서 글꼴 CSS를 만들고 고치는 정적 페이지인 글꼴 작업실(`studio/index.html`)의 구조를 설명한다. 결정 근거는 [ADR-009](../ADR/ADR-009-font-editor-v2.md), 편집 대상인 글꼴 계약은 [ADR-008](../ADR/ADR-008-font-contract-v2.md)이다. 첫 화면의 디자인 패널(세벌 고정 기본·재료 선택·대표 비교)은 [최종 설계 v1.2](../PLAN/ponkku-final-design-v1.2/DESIGN.ko.md) §13, [ADR-025](../ADR/ADR-025-hangul-composition-design.md)·[ADR-026](../ADR/ADR-026-sebul-fixed-layout.md)을 따른다.

## 패키지와 삽입 API

공용 모델은 `authoring/`, 독립 UI는 `studio/`에서 관리한다([ADR-029](../ADR/ADR-029-library-authoring-and-site.md), Accepted). 사이트 원본은 별도 저장소에서 이 패키지를 사용한다. 라이브러리 시험은 사이트 checkout 없이 독립 작업실을 연다.

```html
<div id="editor"></div>
<script src="./node_modules/@tty.link/font-kku/studio/mount.js"></script>
<script>
  const editor = FontKkuStudio.mount(document.querySelector("#editor"), {
    font: "gothic",
    draftKey: "my-font-editor"
  });
  editor.ready.then(() => editor.setText("내 글꼴 만들기"));
</script>
```

ESM은 `import { mount } from "@tty.link/font-kku/studio"`로 같은 기능을 쓴다. 기본 작업실 URL은 모듈 위치에서 찾고, 별도 배치에서는 `studioUrl`을 지정한다. `src`는 호스트 페이지 기준으로 절대 주소를 정한다. `font`, `text`, `project`, `timeoutMs`, `draftKey`도 설정할 수 있다. 기본 제한시간은 30초이며 시작과 개별 요청에 적용한다.

반환 핸들의 `ready`가 완료되면 `exportProject()`·`loadProject(project)`·`getCss()`·`setText(text)`·`setBoundaries(boolean)`를 사용할 수 있다. 저장·불러오기는 기존 프로젝트 v2를 사용한다. 기본 초안 키는 유지하며, `draftKey`를 지정하면 서로 다른 초안 공간을 사용한다. `setBoundaries()`는 프레임 내부 미리보기의 경계 표시를 바꾼다. 사용을 마치면 `destroy()`로 프레임과 대기 요청·이벤트를 해제한다.

UI의 전역 객체·DOM·스타일은 iframe 문서 안에서 격리한다. 호스트의 CSS로 내부 화면을 직접 바꾸는 계약은 제공하지 않는다. 사이트 메뉴와 URL 구성은 호스트가 담당하며, 직접 여는 `studio/index.html`도 classic script로 동작한다.

## 구성

| 파일 | 역할 |
|---|---|
| `authoring/font-studio-model.js` | 문서 모델. 파서(위치 정보 트리, 브라우저식 오류 복구), 특이도, 캐스케이드 해석기, 선언 단위 편집, 이름 바꾸기, 편집 범위 → 규칙·변수 대응, 값 산술, 줄 diff, 미리보기용 URL 절대화, 되돌리기 이력. 브라우저와 Node 공용 |
| `studio/font-studio.js` | 화면. 불러오기/저장(File System Access 포함), shadow root 미리보기, 선택·살펴보기·편집 대상 패널·드래그, 전역·묶음 변수, 초안, 검증(잉크 상자·음절 안 잉크 겹침), 확장 훅(load/select/project/render) |
| `authoring/font-kku-lint.js` | 글꼴 계약 v2 검사([ADR-008 §9](../ADR/ADR-008-font-contract-v2.md)). 모델 파서 위에서 구조·적용 범위·레이어 = 레벨·변수·속성·값·메타데이터를 검사한다. `scripts/check_css_contract.js`와 같은 모듈이고, 레지스트리 요약은 생성 블록이다. 브라우저와 Node 공용 |
| `authoring/font-studio-sheet.js` | 재료 모델. 자소판 행 배치·칸 이름표(행별 사용 칸), 자소판 크기 검사, 글꼴 CSS의 자소판 정보, 새 그림 자소 글꼴 틀, v1 프로젝트 이전(값 검증), 내보내기 칸·배율 이름(`scaledPath`)과 배율 세트 선언(`multiScaleDeclarations`), 래스터 품질 ↔ `--fy-sprite-rendering`, 작은 글씨 프리셋·페이지용 광학 CSS. 브라우저와 Node 공용 |
| `studio/font-studio-material.js` | 재료 탭 화면. 원본 캔버스, 칸 편집 도구(펜·지우개·채우기·직선·사각형, 안내선), 동작 단위 되돌리기·다시, 잉크 비율, 미리보기 blob 덮어쓰기와 다시 샘플링, 내보내기(칸 크기·배율 세트), 래스터 품질·프리셋, PNG 가져오기 검증·행 맞추기, 프로젝트·초안 연동, 그림 자소가 아닌 글꼴용 시작 안내 |
| `authoring/font-studio-design-model.js` | 디자인 모델. 기본 디자인(1.2 세벌식, revision은 런타임 프로파일에서), 재료 바꾸기(`withMode` — 배치 유지, 사라진 소스를 가리키던 규칙 빼기), 배치 바꾸기와 고정 배치 충돌(`withLayout`·`fixedConflicts`·`resolveConflicts` drop/flatten, flatten 충돌은 합치지 않고 보고), 등록 이름 하나(`STUDIO_NAME`), JSON 읽기 오류의 줄·칸(`parseDesignText` — 작은 문법 검사기로 위치를 찾는다), 검사 오류 코드의 한국어 설명(`ERROR_TEXT`·`describeError`·`errorLine`), 파일 이름·페이지용 코드, 비교 칸 자리 세기(`placementReadout`). 브라우저와 Node 공용 |
| `studio/font-studio-design.js` | 디자인 패널 화면. 시작 선택지 셋, 미리보기 적용·접기, 비교 칸(줄마다 shadow root), 고급(배치·문맥 규칙 탭·충돌·JSON·되돌리기), 디자인 JSON 열기·저장·복사·페이지용 코드, 검사 오류 목록(코드·한국어), 받지 않는 글꼴(런타임 진단) 표시, 살펴보기의 출처 한 줄, 프로젝트·초안 연동, 그림 세트 싣기 |
| `authoring/font-studio-transactions.js` | 편집 기록·묶음 편집·임시 등록(계획 F0). 항목마다 바꾸기 전·후 `{ design, participants }`를 드는 이름 붙은 기록(`createStore` — 되돌리기·다시·건너뛰기, 60단계), 미리보기만 하다 한 줄로 남기는 묶음 편집(`createTransaction`), `studio-tmp-<n>` 임시 이름을 돌려 쓰는 등록(`createLeasePool` — `unregisterDesign`이 없으면 내용 주소 이름), 검사 결과 모양 맞추기(`normalizeValidation`). 브라우저와 Node 공용 |
| `studio/font-studio-f-shell.js`, `studio/font-studio-f.css` | 디자인 도구 탭 껍데기(계획 F0). `FontStudio.f.mount(id, { label, modes, group })`가 `[data-studio-f=id]` 칸을 돌려주고 탭·재료에 따라 `[hidden]`으로 가린다. 붙인 칸이 없으면 탭 줄도 없다 |
| `authoring/font-studio-recipe-catalog.js`, `scripts/build_studio_recipe_catalog.js` | 조립식 목록 거울(계획 F1, 생성 파일 — 손으로 고치지 않는다). 런타임은 조립식 표를 꺼내 주지 않아 `spec/jamo-recipes.json`·`spec/authoring-stages.json`에서 `--write`로 만들고 `--check`가 낡은 거울을 거부한다 |
| `authoring/font-studio-design-rules.js` | 디자인 규칙 순수 모델(계획 F1, `FontStudioDesignRules`). 자모·역할 칸마다 규칙 하나(`pick-<역할\|any>-u<16진>`·`mix-<역할>-u<16진>`)로 고르기·풀기, 런타임 거부를 미리 거부하는 `choiceAllowed`, 잠금 `editor.locks`, 씨앗 자동 섞기(`autoMix`·`clearMix`), 소스 빼기(`removeSource`), 영향 목록(`impactOf` — 전·후 디자인을 임시 이름으로 등록해 초 19·중 21·종 27·낱자 40의 `planJamo`를 견준다). 브라우저와 Node 공용 |
| `authoring/font-studio-provenance-model.js`, `studio/font-studio-provenance.js`·`.css` | 출처 패널(계획 F2). 순수 모델 `FontStudioProvenanceModel.answer`가 `traceOf` 기록·디자인 JSON·그림 문서로 다섯 질문에 답하고(Q3 규칙 풀이는 런타임 규칙 고르기를 옮긴 것), 칸은 `renderTrace`를 바꿔 끼워 살펴보기 `[data-studio-f=provenance]`에 그린다 |
| `studio/font-studio-recipes.js`·`.css` | 조립식·binding 비교 탭(계획 F3). 자모 칸 하나의 후보(지금·자동·원본·조립식마다)를 임시 이름으로 나란히 그리고 고르기·조각 binding·잠금을 편집 한 줄씩 |
| `authoring/font-studio-draw-model.js` | 그림 문서 순수 모델(계획 F4, `FontStudioDrawModel`). `font-kku-drawing` v1(칸·부분·도형·출처), 새 문서를 돌려주는 칸 편집, `registerJamo` 칸(`toCells`·`register`), SVG 가져오기 허용 목록(`sanitizeSvg`), 경로 변환·범위·`rdp`, 문장 우선 제안(`proposals`), 떼어 내기(`detachFromCapture`). 브라우저와 Node 공용 |
| `studio/font-studio-draw.js`·`.css` | 그리기 8 → 24 → 40 탭(계획 F5). 그림 문서 참가자 `drawings`, 단계 줄·제안·자모 41칸·칸 편집기·문장 미리보기 둘 |
| `studio/font-studio-draw-detach.js`·`.css` | 조합 자모 떼어 내기(계획 F6). 그리기 탭과 함께 보이는 칸 — 조합·획 자모를 조각마다 독립 SVG 칸으로 |
| `authoring/font-studio-palette-model.js`, `studio/font-studio-palette.js`·`.css` | 글꼴 팔레트 작업대(계획 F7). 순수 모델 `FontStudioPaletteModel`(인스턴스 `pal-<n>`·준비 상태·기록 셈·매트릭스 표본·칸 상태)과 글꼴 재료에서만 보이는 탭 |
| `authoring/font-studio-bundle-model.js`, `studio/font-studio-bundle.js`·`.css`, `spec/design-bundle.schema.json` | 디자인 묶음(계획 F8). 순수 모델 `FontStudioBundleModel`(만들기·읽기 검사·이름 겹침·사전 검사·`.jamo.js`·페이지 코드)과 파일 줄 끝의 칸, 형식 정본 `font-kku-design-bundle` v1 |
| `studio/font-studio-history.js`·`.css` | 편집 기록 칸과 영향 확인 대화상자(계획 F9). 판정·문구는 같은 파일의 DOM 없는 `FontStudioHistoryModel`(Node 공용) |
| `studio/index.html`, `studio/font-studio.css` | 정적 페이지와 화면 배치 |
| `tests/font_studio_model.test.js`, `tests/helpers/mini_dom.js` | 모델 단위 테스트(`npm test`). DOM 없이 해석기를 돌리는 작은 요소 트리·선택자 매처 |
| `tests/font_lint.test.js` | 검사 단위 테스트(`npm test`): 기본 제공 글꼴·fixture 통과, 텍스트 검사 우회로의 코드별 실패, 생성 블록 최신성 |
| `tests/font_studio_design.test.js` | 디자인 모델 단위 테스트(`npm test`): 도우미가 만든 디자인을 실제 `registerDesign`으로 등록해 보고, 도우미가 미리 찾는 고정 배치 충돌이 런타임 거부(`validateDesign`의 `DESIGN_FIXED_*` 코드)와 같은지, 이름 하나 교체, 오류 코드마다 한국어 설명(`font-kku.d.ts` `DesignErrorCode`와 대조), 스키마 맨 위 키 대조 |
| `tests/font_studio_f.test.js`, `tests/studio_f/*.test.js` | 계획 F 단위 테스트(`npm test`) — 모음 파일이 `tests/studio_f/*.test.js`를 이름 차례로 싣는다(새 묶음은 package.json을 고치지 않는다). 모두 실제 런타임(`font-kku.js`)을 Node에서 싣는다: `transactions`(F0 기록·묶음 편집·임시 등록), `recipe_catalog`(거울 = 정본 투영·런타임 생성 구간), `design_rules`(모드 × 배치 × 역할 × 자모 × 방법 전수, 무작위 300단계 뒤 충돌 없음, 영향 목록), `provenance_model`(디자인 31 × 자모 51 × 역할 4 × 짜임 3 × 받침 2에서 Q3 = `planJamo` trace.rules), `draw_model`(칸 편집·등록·`sanitizeSvg`·떼어 내기), `history`(언제 묻는가), `palette_model`(준비 상태·기록 셈·`pal-*`가 `withMode`에서 살아남음), `bundle_model`(왕복·해로운 묶음 거부·이름 겹침·사전 검사·`.jamo.js` VM) |
| `tests/studio_f/smoke_*.py` | 계획 F 스모크 — `playwright_smoke.studio_f_checks()`가 맨 위 `assert_*`를 찾아 `run_check`(`assert_font_studio_f`)와 pytest(`test_font_studio_f_surface`, file·server)에 올린다. `assert_studio_f_foundation`·`_provenance`·`_recipes`·`_draw`·`_draw_detach`·`_palette`·`_bundle`·`_history` |
| `tests/fixtures/studio-f/`, `tests/fixtures/studio-f-bundle/` | SVG 가져오기 시험 그림(`ai-ok.svg`·`malicious.svg`)과 묶음 시험 파일(`origin8`·`malicious` `.fkk-bundle.json`) |
| `tests/fixtures/studio/studio-fixture.css` | 작업실 테스트 전용 고정 글꼴(한 줄 두 선언, 공유 `:is()` 규칙, 자리를 덮는 자모 규칙, 가리는 문맥 규칙, 일부러 겹친 보정) |
| `tests/playwright_smoke.py` `assert_font_studio*` | 실브라우저 흐름 테스트: 값 출처·범위 편집, 범위 결함(H1) 회귀, 포인터·키보드, 초안, 재료, 재료 도구(`assert_font_studio_material_tools`), 자소판 그리기 입구와 `hidden` 요소 노출(`assert_font_studio_entry`), 전역 변수, 겹침 대조와 파일 저장, 검사 경고(`assert_font_studio_lint`), 디자인 패널(`assert_font_studio_design`) |

런타임에서는 공개 API(`render`, `refreshAll`, `fontInfo`)와 디자인 API(`validateDesign`, `registerDesign`의 `{ replace: true }`, `unregisterDesign`, `layoutProfiles`, `traceOf`, `planJamo`, `authoringProgress`, `registerJamo`, `jamoSets` — 실험, npm 0.1.0에는 없고 0.1.1부터)만 쓴다. 등록된 디자인 목록 `designs()`는 있으면 쓰고(임시 이름이 남의 것과 겹치는지), 없으면 `planJamo`가 그 이름을 푸는지로 대신한다. 작업실 전용 훅은 없다. 디자인 API가 없는 런타임(지금 공개 사이트의 npm 0.1.0)에서는 디자인 패널이 숨고(`data-design-state="unavailable"`) 디자인 도구(계획 F)의 칸·창구도 붙지 않으며 나머지는 그대로 돈다.

## 데이터 흐름

1. **불러오기**: 기본 제공 글꼴은 `../profiles/<id>.css`, `?src=<url>`은 그 URL을 XHR로 읽는다(`file://`에서 막히면 파일 열기 안내). CSS 파일·프로젝트 JSON은 FileReader로 읽는다. 원문은 **먼저 파싱**하고 성공한 뒤에만 상태를 바꾼다. 구문 오류는 브라우저처럼 복구해 읽고, 구문 오류와 글꼴 계약 검사 결과를 메시지(건수)와 경고 목록(줄 번호·코드)에 보인다(아래 "검사").
2. **미리보기**: 바탕 요소(`<font-kku data-studio-host>`)는 전용 shadow root 안에 있고, 거기에 코어 `font-kku.css`(`<link>`), 선택 표시 스타일시트, 글꼴 스타일시트(constructable), 재료 덮어쓰기가 순서대로 붙는다. 글꼴 CSS가 작업실 화면을 바꿀 수 없다. constructable 스타일시트는 `baseURL`을 무시하므로 미리보기 사본에서만 `url()`·`image-set()` 문자열·`@import`를 글꼴 파일 위치 기준 절대 URL로 바꾼다(`rewriteUrls`, 코어의 `@property --fy-sprite-url` 등록 여부와 무관). `@font-face`·`@property`는 shadow root에서 동작하지 않아 문서 수준 스타일시트로 올린다. 적용 뒤 `FontKku.render` + `FontKku.refreshAll(host)`로 다시 해석한다.
3. **선택**: 미리보기의 자모 노드를 클릭하면 `createResolver`가 노드에서 글자 요소를 거쳐 바탕 요소까지 요소마다 적중 규칙을 모으고, 조건(`matchMedia`/`CSS.supports`, 모르는 조건은 적용하되 "미확인"), `!important`(레이어 순서 반전), 레이어(Cascade 5, 중첩·익명 레이어 포함), 특이도, 원문 순서로 선언의 승자를 가린다. 선택은 글자 번호·원문 글자·자리·자모로 기억한다.
4. **해석 체인**: 속성마다(생성된 자리 계약의 접미사 전부) `--fy-<slot>-*` → 부모 자리 → 역할 → 글꼴 기본값 → 내장값 순으로 첫 공급자를 찾고, 누적 보정(`--fy-jamo-*`, `--fy-ctx-*`)을 따로 보여 준다. 공급자마다 레이어·줄·요소(노드·글자·바탕 요소)·중요도·조건을 표시하고, 최종 계산값(`getComputedStyle`)과 모델 값이 다르면 그 행에 "실제 값이 모델과 다름"을 표시한다(등록된 `@property`는 탐침 요소로 같은 형식으로 비교).
5. **편집**: 범위가 `editTarget`으로 편집 대상(규칙·변수·모드·기준값·공유·가려짐)을 정하고 `applyTarget`이 원문의 그 선언 한 줄만 바꾼다. 살펴보기의 "편집 대상" 패널이 무엇을 고칠지, 공유 규칙인지, 가려져 있는지 미리 보여 준다. 편집 뒤 선택한 자모의 계산값이 기대값과 다르면 경고한다.
6. **디자인**: 맨 주소로 들어오면 미리보기 바탕 요소에 기본 디자인(`--fy-design`, 아래 "디자인")을 건다. 글꼴 CSS를 불러와도 디자인은 그대로이고, 렌더마다 실제로 걸렸는지(`data-fy-design`)를 본다.
7. **저장**: CSS 다운로드(`<font-id>.css`)와 클립보드 복사("CSS 복사" — Clipboard API는 보안 컨텍스트에서만 있으므로 tailnet·LAN의 http 페이지에서는 선택한 textarea + `execCommand("copy")`로, 그것도 막히면 "글꼴 CSS 원문"을 선택해 둔다), 프로젝트 JSON(`format: "font-kku-font-project"`, `version: 2`, CSS 원문 + baseURL + 미리보기 문장 + 자소판 + 디자인 `design: { json, applied }` — 없어도 열린다), `localStorage` 초안(같은 모양). File System Access를 지원하는 브라우저에서는 파일에 직접 저장한다(아래 "파일 저장").

## 검사
- 작업실은 `check_css_contract.js --check`와 같은 검사(`authoring/font-kku-lint.js`, 문법 정본은 [ADR-008 §9](../ADR/ADR-008-font-contract-v2.md))를 CSS가 바뀔 때마다 돌린다 — 불러오기(기본 제공 글꼴·`?src=`·CSS 파일·파일 핸들·프로젝트·초안 복원), 모든 편집, 되돌리기. 파일 이름은 내보낼 이름(`<font-id>.css`)이다.
- 결과는 상단 경고 목록(`[data-studio-diagnostics]`)에 `L<줄> [<코드>] 메시지`로 보인다(항목마다 `data-code`·`data-severity`·`data-line`, 루트에 `data-lint-errors`). 구문 오류도 검사 결과(`syntax`)로 함께 나온다. `FontStudio.lint()`가 같은 목록을 돌려준다.
- "이 글꼴로 새 글꼴"와 "새 그림 자소 글꼴"는 입력한 이름을 trim·소문자로 정규화해(`Model.normalizeFontName`, 그림 자소 글꼴은 `Sheet.sanitizeFontName`) 적용 범위 선택자와 `--fy-font-id`에 쓰고, 이름 입력란과 메시지에 정규화한 이름을 보인다 — 런타임이 `data-fy-font`를 소문자로 찍으므로 대문자 id는 미리보기에도 맞지 않는다(검사 코드 `font-id-case`).
- 경고는 편집을 막지 않는다. CSS 내보내기·파일에 저장·프로젝트 저장도 그대로 진행하되, 오류가 있으면 "글꼴 계약 검사 오류 N건이 있는 채로 …" 경고와 첫 오류를 메시지에 보인다.
- 모델의 `diagnostics(doc)`(구문 오류 + `!important`·중첩·페이지 전용·레이어 밖 경고)는 검사의 부분집합이라 작업실은 검사 모듈을 쓰고, 검사 스크립트가 없을 때만 대신 쓴다. 미리보기 id 판정의 경고(`--fy-font-id` 없음, id와 적용 범위 불일치)도 검사의 `font-id`·`scope` 코드와 겹치므로 검사 문구만 보인다.

## 디자인 (설계 v1.2 §13, ADR-025 F, ADR-026·028)
글꼴 CSS 위에 디자인(구조 설정 JSON, `spec/design.schema.json`)을 얹어 무엇으로 그릴지와 배치를 정한다. 정본 검증은 런타임 `FontKku.validateDesign`(오류 전부)·`registerDesign`이다.

- **첫 화면**: 주소에 `?font=`·`?src=`·`#studio-material`이 없으면(맨 주소) 기본 디자인 — `version: "1.2"`, 세벌식(`sebul-cases-v1`, revision은 `FontKku.layoutProfiles`에서), 선·원 재료 — 을 미리보기에 건다(`data-fy-layout="sebul-fixed-v1"`). 글꼴을 밝히고 들어오면 미리보기는 글꼴 CSS 그대로이고 패널은 머리 줄만 남기고 접힌다(비교 칸은 펼치면 그린다). 시작만으로 초안을 쓰지 않는다.
- **시작 선택지**: 선·원으로 만들기(primitive) / 직접 그려 만들기(svg — 기본 제공 그림 세트 `dunggeun-box`·`pilgi-box`·`butgeul-box`를 작업실이 직접 싣고, 진행률 원형 8·기본 24·확장 40을 `authoringProgress`로 보인다) / 기존 글꼴로 만들기(font — 기본 글꼴과 역할별 글꼴, 비교 칸 기록의 `identity`·`measurement`로 대체 의심·잴 수 없음을 센다). 재료만 바꾸고 배치는 그대로다. 사라진 소스를 가리키던 규칙은 빼고 알린다. PNG 자소판(그림 자소 글꼴)은 디자인과 다른 재료라 재료 탭이 맡는다.
- **비교 칸**: 가 고 과 각 곽(초성 ㄱ) · 가 나 간 난(중성 ㅏ)을 같은 크기로 그린다. 줄마다 따로 된 shadow root가 미리보기와 같은 글꼴 시트를 받고(`FontStudio.addPreviewRoot`), 미리보기 적용 여부와 관계없이 늘 지금 디자인으로 그린다. 대상 자모는 글자 색으로 칠하고, 글자 상자 기준 위치·크기를 재어(0.75px 안은 같은 자리) 몇 곳·몇 가지 자리·머리 음절 몇 곳인지 적는다(`data-count`·`data-variants`·`data-heads`). sebul에서 세벌 고정은 5곳·1가지 / 4곳·1가지, 네모 문맥은 3가지 + 머리 음절 2곳 / 2가지다. 미리보기에서 고른 자모와 같은 역할·자모는 점선으로 보인다.
- **고급 — 배치·문맥·JSON**: 배치 단추 세벌식 / 직결식 / 네모 문맥(배치를 적지 않은 1.0·1.1 디자인이면 "지금 배치"가 보이고, 고르기 전에는 배치를 끼워 넣지 않는다 — L25). 네모 문맥(과 지금 배치)에서만 문맥 규칙 탭이 열린다(규칙 목록과 지우기). 문맥 규칙·통짜 합자 모음 규칙·자리마다 변주가 있는 디자인을 고정 배치(세벌식·직결식)로 바꾸려 하면 충돌 목록을 보이고 "문맥 규칙 지우기 / 역할별 값으로 확정 / 취소"를 고를 때까지 적용하지 않는다. 확정한 뒤 같은 자모·역할에 다른 값이 남으면 합치지 않고 충돌로 보인다. JSON 칸은 지금 디자인을 그대로 보이고 "JSON 적용"으로 고친다. 디자인 되돌리기·다시(60단계)는 글꼴 CSS의 것과 따로 돈다.
- **등록 이름**: 하나(`studio-design`)다. 디자인을 고칠 때마다(재료·배치·JSON 적용·되돌리기·다시) 먼저 `validateDesign`으로 검사하고, 통과하면 `registerDesign("studio-design", json, { replace: true })`로 바꿔 등록한다 — 등록부가 늘지 않고, 그 이름을 고른 미리보기·비교 칸은 런타임이 다시 그린다(`data-design-revision`만 바뀐다).
- **실패**: 검사에 걸리면(문법 오류는 줄·칸) 등록하지 않고 미리보기는 마지막 정상 디자인을 두며, 상태를 `invalid`로, 오류 목록과 "마지막 정상 디자인으로"를 보인다. 목록은 오류를 모두 한 줄씩 — 코드(영어 그대로, `li[data-code]`·`data-path`), 한국어 설명(코드마다, `ERROR_TEXT`), 런타임 문구(자리 포함) — 보이고 건수(`data-count`)를 적는다. 실패 표시는 고칠 때까지 남는다(§13.6).
- **고정 배치 안내**: 고정 배치(세벌식·직결식) 도장 노드(`data-fy-stamp`)를 고르면 살펴보기는 도장 값(`tr[data-property="stamp-*"]`, 읽기 전용)을 보이고 편집 범위를 막는다. 값 칸·드래그·방향키는 원문을 바꾸지 않고 `data-edit-effect="fixed-layout"`과 까닭을 남긴다 — 코어 CSS가 도장으로 글꼴의 자리·역할·자모·문맥 값을 덮어, 고쳐도 화면이 바뀌지 않기 때문이다. "네모 문맥으로 / 디자인 끄고 글꼴 CSS로"를 함께 보인다. 전역 변수의 글자 칸(`--fy-glyph-width/height/gap`)·깊이·묶음 변환은 "고정 배치: 배치 프로파일이 정함"으로 흐리게 보인다.
- **받지 않는 글꼴**: 런타임은 기기 글꼴(system) 재료이면서 표준 잉크 상자(`--fy-font-ink-boxes`)를 밝힌 글꼴에서만 디자인을 읽고, 그 밖(그림 자소 재료, 잉크 상자를 밝히지 않았거나 끈 글꼴)에서 디자인을 고르면 바탕 요소에 `data-fy-design-status="DESIGN_UNSUPPORTED_FONT"`를 남긴다. 작업실은 그 진단을 읽어(짐작하지 않는다) `unsupported`와 까닭(`fontInfo().material`로 그림 자소인지 잉크 상자 없는 글꼴인지)을 보이고, 비교 칸 읽기에 "디자인을 받지 않음"과 `data-design-status`를 붙인다. 미리보기를 끈 채로도 비교 칸(펼쳤을 때)이 같은 진단을 주면 켤 수 없게 한다. 런타임이 아직 디자인을 읽지 않았으면(문서 밖·글꼴 CSS가 오는 중) `pending`이다.
- **출처 한 줄**: 자소를 고르면 선택 칸 아래에 `traceOf`의 첫 요청(디자인·소스·방법·조립식·규칙·상태·글꼴 확인)을 한 줄로 보인다(§13.5 최소 — 다섯 질문은 아래 "디자인 도구"의 출처 패널).
- **파일**: "디자인 JSON 저장"은 JSON 칸의 디자인을 `<id>.design.json`으로 내려받는다(`validateDesign`으로 검사만 하고 등록하지 않는다 — 검사 오류가 있어도 건수·첫 오류 경고와 함께 저장하고, 읽을 수 없는 글은 거부). "디자인 JSON 열기"는 같은 형식을 읽고, 글꼴 프로젝트 파일이면 "프로젝트 열기"로 안내한다. "페이지용 코드 복사"는 `registerDesign` 호출과 `--fy-design` CSS를 실험 표시와 함께 복사한다.
- **창구**: `FontStudio.design` — `json()`·`text()`·`name()`·`status()`·`setJson`·`setMode(mode, params)`·`setLayout(profile)`·`resolveConflicts(drop|flatten|cancel)`·`setApplied`·`undo`·`redo`·`save`·`fold`·`compare()`·`identity()`·`busy()`. `FontStudio.settled()`가 `busy()`(비교 칸 재기·그림 세트 받기)를 기다린다. DOM 상태는 `[data-studio-design]`의 `data-design-state`(applied·off·invalid·unsupported·pending·unavailable)·`data-design-layout`·`data-design-mode`·`data-design-name`·`data-design-revision`.
- **편집 창구(계획 F0)**: 모든 바꾸기(재료·배치·충돌 정리·JSON 적용·문맥 규칙 지우기·뒤 묶음의 편집)는 한 길(`commit`)을 지나 이름 붙은 기록 한 줄이 된다(`재료: …`·`배치: …`·`JSON 적용` 등, 프로젝트·초안을 열면 비운다). 뒤 묶음의 계약은 `FontStudio.design`의
  `edit(label, mutate, { participants, impact, note, tone })` → `Promise<{ ok, design, errors, impact, cancelled }>`(검사 → `impact`면 영향 처리기(`setImpactHandler`, 기본은 받아들임·`lastImpact()`) → 참가자 → 등록 → 기록 → 적용 → `change` 사건; 검사에 걸리면 기록하지 않고 마지막 정상 디자인을 둔다),
  `begin(label)` → `{ update(mutate, participants), commit(), cancel() }`(update는 미리보기만 — 참가자 `preview`와 임시 이름 — commit에서 한 줄, cancel이면 아무것도 남지 않는다),
  `validate(json)`, `lease(json)` → `{ name, update, release }`(`studio-tmp-<n>`), `participant(name, { get, set, preview? })`(디자인 JSON 밖 상태 — 되돌리기·다시·건너뛰기(`history()`·`jump(id)`)가 함께 되돌리고, 프로젝트·초안의 `design.participants`에 상태가 있는 것만 실린다. 열 때는 디자인보다 먼저 넣고, 늦게 붙는 참가자는 마지막으로 연 상태를 따라잡는다),
  `on/off("change" | "status")`(`change`: `{ json, name, label, cause: edit|undo|redo|jump|restore|json }`), `addBusy(fn)`(`settled()`가 기다린다), 바꿔 끼우는 `renderTrace(node, trace)`, 런타임 기능 `runtime: { validate, replace, unregister, designs }`이다. 프로젝트 형식은 그대로 v2(`participants`만 더한다)

## 디자인 도구 (계획 F, 설계 v1.2 §13.3–13.6)
디자인 패널의 첫 조각 위에 붙은 도구다. 모든 바꾸기는 위 편집 창구(`FontStudio.design.edit`/`begin`) 한 길을 지나 이름 붙은 기록 한 줄이 되고, 디자인 JSON 밖 상태(그림 문서)는 참가자로 함께 되돌린다. 런타임·공개 렌더 출력은 바꾸지 않는다 — 공개 계약에 더한 것은 디자인 JSON `editor.locks`(스키마·`font-kku.d.ts` `DesignLock`)와 묶음 형식 `spec/design-bundle.schema.json`뿐이다.

- **탭 껍데기**: `FontStudio.f.mount(id, { label, modes, group, tab, onShow, onHide })`. 디자인 본문의 칸은 탭 하나씩(`[data-studio-f-tabs]` `button[data-studio-f-tab][aria-selected]`, ←·→·Home·End), `group`이면 그 탭과 함께, `tab: false`나 본문 밖 칸은 탭 없이 보인다. `modes`가 있으면 그 재료에서만 보인다(디자인 `change`마다 다시 가린다). 칸은 쓸 일이 생길 때 붙는다 — 맨 작업실 첫 화면은 F 이전과 같다(탭 줄 없음, 초안·기록 쓰지 않음).

  | 칸 | 붙는 때 | 보이는 곳 |
  |---|---|---|
  | `recipes` 조립식·binding | 미리보기에서 처음 자모를 고를 때(또는 `recipes.open`) | 탭 |
  | `draw` 그리기 8 → 24 → 40 | `draw.start()`, 또는 연 프로젝트·초안·묶음에 그림이 있을 때 | 탭, 그림 세트 재료만 |
  | `draw-detach` 독립 SVG로 | 늘(그리기 탭의 무리) | 그리기 탭과 함께 |
  | `palette` 글꼴 팔레트 | 늘 | 탭, 글꼴 재료만 |
  | `history` 편집 기록 | 첫 기록이 생길 때 | 탭 아님 — 도구 칸 아래 늘 |
  | `bundle` 묶음 | 늘 | 파일 줄 끝 |
  | `provenance` 출처 | 처음 자모를 고를 때 | 살펴보기(aside) |

- **조립식·binding 비교**(F3, §13.4): 자모 칸 하나(자모 + 역할 — 고른 노드의 음절에서 읽어 ㅘ의 조각을 골라도 ㅘ, 또는 칸 안 목록 `[data-recipes-target]`·역할 단추)에 후보를 나란히 그린다 — 지금 디자인 · 자동 · 원본 · 그 자모를 만드는 조립식마다 조합. 후보 디자인은 `FontStudioDesignRules.setChoice`로 만들어 임시 이름(`lease`)에 등록하고 비교 칸처럼 따로 된 shadow root에서 그린 뒤, 런타임 기록(`traceOf`, 세벌 고정이 조각 둘로 찍는 칸은 조각 기록과 `planJamo`)을 `[data-recipes-candidate]`의 `data-result|status|recipe|source|method|trace`와 한 줄로 보인다. 원본 후보는 원소 재료("원소 재료에는 원본이 없음")와 세벌 고정의 합자 모음(L13)에서 까닭만 보이고 등록하지 않는다. 고르기·조각 binding(조각마다 소스·방법)·잠금·지우기는 편집 한 줄씩, 규칙은 칸마다 `pick-<역할>-u<16진>` 하나다. 문맥 조건(`vowelLayout`·`hasFinal`)은 만들지 않는다(네모 문맥의 문맥 규칙은 고급의 문맥 탭). 칸은 접힌 한 줄이 기본이고 펼쳤을 때만 후보를 그리며, 접거나 가리면 임시 이름을 돌려준다. `FontStudio.recipes = { open, close, target, candidates, choose, setBinding, lock, clear, leases, sampleText, busy }`
- **출처 패널**(F2, §13.5): 살펴보기에서 고른 자모에 다섯 질문으로 답한다(`[data-provenance-q=kind|origin|rule|follow|capability]`의 `data-code`). 무엇인가(원본·조합·획·원소 대체·대체 경로·실패·받는 중), 어디서 왔나(원소 · 내장/작업실/등록 SVG 세트와 그림 열쇠 · 글꼴은 출처 미확인·대체 글꼴 의심), 어느 규칙이 이겼나(조각 binding > 규칙(구체성) > 물려받음 > 역할 기본 > 디자인 기본 — 진 규칙·밀린 기본과 까닭, `data-winner`·`data-ignored`), 상위 원본을 따라가나(ㅋ → ㄱ, 떼어 낸 SVG는 독립·예전 조립식), 획 편집·필기 애니메이션·독립 벡터가 되나(원소 획 예, SVG 조각 부분 — 내장 세트는 떼어 내야, 글꼴 낱자 아니오 §6.6·§17.3). 기본 출처 한 줄(`[data-design-trace]`)은 그대로 두고 그 아래 접힌 한 줄(무엇 · 어디서)을 펼치면 다섯 답이다. `FontStudio.provenance = { answers, refresh, check, open }` — `check()`는 미리보기 노드의 Q3 풀이가 기록 rules와 같은지 본다
- **그리기 8 → 24 → 40**(F5, §13.3): 그림 문서(`font-kku-drawing` v1, `set: studio-draw-<8hex>`, 칸 `ㄱ`·`ㄱ@bar|@cho|@jong`마다 부분·도형·출처 authored|detached|imported)는 디자인 참가자 `drawings`다 — 상태가 들어올 때마다(편집·되돌리기·열기) 세트를 디자인보다 먼저 `registerJamo`로 다시 등록한다. `start()`는 빈 문서만 만들고(디자인·기록 그대로) 첫 칸을 넣는 편집 하나가 디자인을 그 세트로 돌린다('ㄱ 그리기 · 그림 세트로'), 목표 단계를 다 그리면 `editor.authoringTarget`이 다음 단계로 간다. 화면은 단계 줄(`[data-draw-stage]` have/total, `[data-draw-helper]` ㆍ) · 문장에 나온 자모부터 제안(`[data-draw-proposals]`) · 자모 41칸(`[data-draw-grid]`, `data-status` = 그림 출처 또는 지금 디자인의 `planJamo` 결과) · 칸 편집기(0–100 격자, 기기 글꼴 참고 글자, 선·꺾은선·펜·타원·고르기 — 포인터 한 번이 `begin` → commit 기록 한 줄, Escape 취소, 문맥 칸, 부분 옮기기·크기·지우기, SVG 가져오기는 `sanitizeSvg` 허용 도형만 넣고 버린 것을 목록으로, AI 요청 글 복사) · 문장 미리보기 둘(지금 디자인 / 원형 8만 — 보이는 칸을 그린 칸 ∩ 원형 8로 줄인 lease). 넓은 화면에서는 편집기가 오른쪽 두 줄을 차지하고 문장 미리보기가 자모 칸 아래로 온다. 칸 지우기는 영향 목록을 묻는다. 차례는 막지 않는다(ㅃ을 먼저 그려도 된다). 그림 세트 재료가 아니면 디자인 칸에 들어가는 단추(`[data-draw-entry]`)가 보인다. `FontStudio.draw = { start, attach, open, doc, setCell, removeCell, importSvg, select, selection, movePart, scalePart, removePart, progress, proposals, statuses, statusOf, sentence, tool, on, off, busy }`
- **독립 SVG로 떼어 내기**(F6, §13.3): 그리기 탭에서 고른 자모가 조합·획이면 `button[data-draw-detach]`가 보이고, 누르면 지금 그린 모양 그대로 조각마다 독립 SVG 칸(`detached`, `from.recipe`·`from.parts`)으로 편집 하나에 넣는다('<자모> 독립 SVG로'). 문맥마다(바탕 X+ㅣ · @bar X+ㅡ · @jong 으+X, 모음은 홀로) 화면 밖 shadow root 무대에 그려 `[part=hoek]` 조각을 노드 em 인라인 변수(`--fy-el-x/y/bw/bh`·`--fy-el-x/y/len/angle`·`--fy-el-cx/cy/rx/ry`)와 `svg[part=vector]` viewBox로만 읽는다(`getBoundingClientRect`를 쓰지 않는다). @bar·@jong 칸은 바탕 칸과 모양이 다를 때만 저장한다. 그 자모를 compose로 묶는 규칙이 있으면 까닭과 '규칙 빼기' 상자(기본 켬)로 같은 편집에서 뺀다. 그 뒤 위 원본(ㅋ의 ㄱ)을 고쳐도 따라가지 않는다 — 조각 보정은 떼어 낸 그림에서만 한다. `FontStudio.drawDetach = { capture, detach, inspect, target, busy }`
- **글꼴 팔레트**(F7, §6.5·§13.4·§15.5): 항목 = 글꼴 인스턴스(디자인의 font 소스 family·weight·style). 새 id는 `pal-<n>`(가장 큰 n + 1, 뺀 id를 다시 쓰지 않는다)이라 재료 패널 `withMode(font)`의 쓰지 않는 `font-x` 지우기에 걸리지 않는다. 카드(`[data-palette-instance]`의 `data-ready|identity|measurement`)마다 그 인스턴스 하나만 쓰는 lease 미리보기, 준비 상태(`@font-face`로 실렸나 — 로컬 이름은 `local-unverified`, `document.fonts.check()`는 증명으로 쓰지 않는다), 측정·출처 확신(기록의 measurement·identity를 센다). 자모 매트릭스(`[data-palette-matrix][data-role]`, 초성 19 X+ㅏ · 중성 21 ㅇ+X · 종성 27 아+X)는 인스턴스마다 shadow root 하나를 돌려 쓰고, 칸(`[data-palette-cell]`의 `data-chosen|locked|effective|warn`)을 누르면 pick 규칙(다시 누르면 풀기), 행 머리는 잠금. 씨앗 섞기는 `autoMix`(같은 씨앗 같은 JSON, 잠근·고른 칸 건너뜀), 항목 빼기는 `removeSource`를 영향 확인으로. 낱자는 기기 글꼴 경로가 디자인으로 그리지 않아 매트릭스에 두지 않는다. `FontStudio.palette = { instances, add, remove, choose, lock, mix, clearMix, matrix, role, refresh, busy }`
- **묶음**(F8, §13.6·§17.3·§18.1): 디자인 JSON과 그 디자인이 쓰는 작업실 그림을 한 파일 `<id>.fkk-bundle.json`(`font-kku-design-bundle` v1)으로 저장하고 연다 — 디자인 JSON은 그린 세트를 이름으로만 가리켜 혼자서는 다시 그릴 수 없어서다. 글꼴 파일은 싣지 않는다. 열기는 바이트 상한(2MB) → JSON → 맨 위 열쇠 허용 목록 → 꼬리표·`url()`·`javascript:`·`data:` URI·`@import`·`@font-face` 거절 → 그림마다 `normalizeDoc` → `validateDesign`을 모두 통과한 뒤에만 이름 겹침을 풀고(`studio-draw-<새 8hex>`, `assetSet`을 고쳐 씀) 편집 하나 '묶음 열기'로 넣는다 — 걸리면 디자인·그림·기록 그대로이고 까닭을 칸마다 보인다. 사전 검사(`[data-bundle-preflight] li[data-code][data-severity]`)는 역할 쌍 67개를 지금 디자인으로 `planJamo`하고 글꼴 재료는 identity를 센다(reproducible = 오류·원소 대체·글꼴 소스 없음). 페이지용 코드(그림 세트 줄 + `registerDesign` + `--fy-design`, 실험)와 그림 세트 `.jamo.js`(`profiles/*.jamo.js`와 같은 `FontKkuJamo` 줄)를 내보낸다. `FontStudio.bundle = { build, save, open, preflight, snippet, jamoJs, exportJamo, copySnippet, last, busy }`
- **편집 기록·영향 목록**(F9, §13.6): 기록 칸(`ol[data-history-list]`)은 항목마다 이름·지난 시간, 지금 자리(`data-current`)·되돌린 항목(`data-undone`), 맨 위 "처음 상태"를 보이고 누르면 그 자리로 간다(`design.jump`). 검사에 걸린 편집은 기록에 없고 칸이 그렇다고 보인다. `design.setImpactHandler`가 영향을 묻는 편집(`edit`의 `opts.impact` — 소스 빼기·칸 지우기)마다 `impactOf`로 전·후를 견주고, 오류·원소로 떨어짐·그린 원본을 잃음이 있거나 쓰던 소스를 빼면 `dialog[data-impact]`(심각한 차례, 60줄 넘으면 "+n곳 더", 취소가 기본 초점, Esc도 취소)로 묻는다 — 취소하면 디자인·참가자·기록 그대로. 그 밖에는 적용하고 "n개 자모가 바뀜"을 알린다. JSON 적용처럼 묻지 않는 편집이 소스를 빼면 막지 않고 알림 칸(`[data-impact-info]`)에 보인다. `FontStudio.history = { entries, jump, impactOpen, impact, answer, info, open, refresh }`
- **잠금 저장 자리**: `design.editor.locks = [{ jamo, role?, part? }]`. `validateDesign`·정규화가 `editor`를 보지 않아 그리기는 그대로이고 revision만 바뀐다 — 계획의 대안(잠금을 참가자로)은 쓰지 않았다. 조립식·binding 비교와 글꼴 팔레트가 같은 잠금을 읽고, 자동 섞기는 잠근 칸을 건너뛴다

## 편집 범위와 결과

| 범위 | 쓰는 곳 | 변수 | 의미 |
|---|---|---|---|
| 자리 가족 | 부모 자리 값을 공급하는 바탕 요소 규칙(없으면 기본 바탕 요소 규칙) | `--fy-<부모>-*` (예: `--fy-tl-top`) | 대체, 자기 값을 선언한 가족원에는 닿지 않음 |
| 자리 전체 | 그 자리 값을 공급하는 바탕 요소 규칙(없으면 기본 바탕 요소 규칙) | `--fy-<slot>-*` | 대체 |
| 이 자리의 이 자모 | 값을 공급하는 자모 규칙, 없으면 `@layer font-kku.jamo` `[data-fy-pos][data-jamo]` | `--fy-<slot>-*` | 대체 |
| 이 자모(모든 자리) | 값을 공급하는 자모 규칙, 없으면 `@layer font-kku.jamo` `[data-jamo]` | `--fy-jamo-dx/dy/scale-x/scale-y/rotate` | 누적 |
| 문맥 | 같은 조건의 문맥 규칙, 없으면 `@layer font-kku.context` `[part="glyph"]:has(…) [data-fy-pos][data-jamo]` | `--fy-ctx-dx/dy/scale-x/scale-y/rotate` | 누적 |

- **공급 규칙 우선**: 자모·문맥 범위는 지금 그 노드의 값을 공급하는 같은 레이어 규칙을 고친다. 그 규칙이 공유(`:is([data-jamo="ᅥ"], [data-jamo="ᅧ"])`, 여러 자리)이면 공유 경고와 함께 "공유 규칙 고치기 / 이 자모만 새 규칙으로 분리"를 고른다. 분리 규칙은 이기는 것이 보장될 때만 만든다(같은 레이어, 같거나 높은 특이도 + 뒤 순서; 공유 규칙이 자리까지 지정하면 `[data-fy-pos][data-jamo]`로 좁힌다). 새 규칙은 현재 해석값에서 출발한다(대체이므로).
- **가려짐**: 범위의 규칙이 선택한 자모에 보이지 않으면(더 높은 레이어, 더 구체적인 규칙, `!important`, 노드에서 자리 변수를 재선언, 가족원의 자기 자리 값) 편집을 거부하고 이유를 보이며 "대신 L… 규칙 고치기"를 제안한다.
- **반영 확인**: 편집 뒤 선택한 노드의 계산된 변수를 기대값과 비교한다. 다르면 "편집이 반영되지 않았습니다 — … 규칙(또는 글꼴 밖 CSS)이 이 값을 덮음"을 보인다(`data-edit-effect="none"`).
- 드래그와 방향키(0.1%, Shift 1%)는 글자 상자 기준 `%`를 더한다. `%` 리터럴은 그대로, em 값은 em 항을 두고 `%` 항을 더한 `calc()`가 된다. `var()` 같은 식은 살펴보기에서 직접 고친다. 드래그 한 번은 되돌리기 한 단계(최대 60단계)다.
- size·weight·stroke·clip·dilate에는 보정 변수가 없으므로 자모·문맥 범위에서는 편집할 수 없다.
- 자소를 누르면 미리보기가 초점을 받는다. 범위 라디오(또는 라벨)를 포인터로 고르면 초점이 미리보기로 돌아와 방향키가 자소를 옮긴다. 키보드로 라디오를 오갈 때는 방향키가 라디오를 바꾼다.

## 재료 탭 (그림 자소)
- **입구**: 탐색 메뉴의 "자소판 그리기"와 첫 화면의 "자소판 그리기"는 `font-studio.html?font=sprite-example#studio-material`로 연다. `#studio-material`이면 탐색 메뉴는 "자소판 그리기"를 현재 페이지로 표시하고, 재료가 준비되면 자소판으로 스크롤한다. 그림 자소가 아닌 글꼴(`--fy-material: system` 등)을 열면 자소판 패널 대신 "sprite-example 열어 그리기 / 새 그림 자소 글꼴로 그리기 시작" 안내가 보인다. "새 그림 자소 글꼴"와 안내 버튼도 자소판으로 스크롤한다.
- `--fy-material: sprite` 글꼴을 열면 `--fy-sprite-url` 자소판을 원본 캔버스로 불러온다. 캔버스는 이미지 원래 크기이고(늘이거나 줄이지 않는다) 칸 크기는 이미지 폭 ÷ `--fy-sprite-cols`, 행 수는 이미지에서 얻는다(자소판 변수는 [ADR-008 §5](../ADR/ADR-008-font-contract-v2.md)). 이미지 행 수가 `--fy-sprite-rows`/`--fy-sprite-kinds`와 다르면 CSS를 맞출지 묻는다.
- 행 배치는 `build_sprite.py`의 확장 순서(자음, 모음, 종성 자음, 겹받침, 받침 위·가로모음 초성, 키 큰 초성 문맥 합자 모음)이고, 행마다 런타임이 실제로 쓰는 칸만 이름표·빈 칸 진단 대상이다.
- 미리보기에서 그림 자소를 클릭하면 그 노드의 계산된 `--fy-sprite-row`와 `data-sprite-jamo-index`로 칸을 고른다.
- **그리기**: 펜·지우개·채우기·직선·사각형(외곽선), 굵기 1–20(64px 칸 기준, 칸 크기에 비례), 색. 직선·사각형은 드래그 동안 원래 칸 위에 도형을 다시 그려 보여 준다. 안내선은 격자(중심 십자·3등분)와 참고 글자(참고·채우기 글꼴)를 따로 켜고 끈다. 칸 아래에 선택 칸의 잉크 픽셀(칸 면적 대비 %)과 채운 칸 수(런타임이 쓰는 칸 기준)를 보인다.
- **되돌리기·다시**: 획 하나, 채우기 한 번, 칸 작업(비우기·글꼴로 채우기·붙여넣기), 자소판 작업(빈 칸 모두 채우기·전체 다시 채우기·자소판 전체 비우기)이 각각 한 단계다. 단계는 건드린 영역의 전후 픽셀을 갖고, 60단계·160MB를 넘으면 오래된 것부터 버린다. 새 자소판(PNG 가져오기·다른 글꼴)은 이력을 비운다. 글꼴 CSS의 되돌리기(도구 막대)와는 따로 돈다. 전체 다시 채우기·자소판 전체 비우기는 확인을 받는다.
- 편집한 자소판은 `blob:` URL로 만들어 미리보기 바탕 요소의 레이어 밖 `--fy-sprite-url`(과 `-2x`/`-3x`) 덮어쓰기(`[data-studio-host]`)로 적용한다. 글꼴 id를 바꿔도 그대로 맞고, `--fy-sprite-image: image-set(...)`을 선언한 글꼴도 모든 밀도에서 편집 중인 자소판을 보인다. 글꼴 CSS 원문은 바뀌지 않고, 내보낼 때 PNG(`--fy-sprite-url` 파일 이름)와 CSS가 짝을 이룬다. 다른 글꼴을 불러오면 덮어쓰기를 지운다.
- **래스터 품질**: 부드럽게 / 선명한 가장자리 / 픽셀. 고르면 글꼴 바탕 요소에 `--fy-sprite-rendering`(`crisp-edges`·`pixelated`, 부드럽게는 선언을 지워 `auto`)을 쓴다 — 코어 그림 자소 규칙의 `image-rendering`이 이 변수를 읽는다(픽셀 아트 자소판이 확대될 때 번지지 않는다). 같은 방식이 미리보기·내보내기 다시 샘플링(부드럽게는 고품질 보간과 단계적 축소, 나머지는 최근접)과 칸 편집 화면에도 쓰인다. 선택 상자는 CSS가 바뀔 때마다(되돌리기 포함) 글꼴의 값으로 맞춘다.
- **미리보기 PNG 칸**: 원본 / 자동(미리보기 글자 크기 × devicePixelRatio를 덮는 가장 작은 칸, 원본보다 키우지 않음) / 64·128·192·256px. 내보낼 해상도에서 어떻게 보일지 미리보기에서 확인한다. 원본 캔버스는 그대로다.
- **글꼴 파일**: "글꼴 파일(TTF)로 내보내기"가 편집 중인 자소판(원본 캔버스, 전체 해상도 blob)과 미리보기 shadow root의 글꼴 CSS로 한글 11,172자 TTF를 만든다(ADR-015, `font-kku-export.js`).
- **내보내기**: PNG 칸(원본 / 64·128·192·256px)으로 PNG 한 장을 내보낸다. "배율 세트 1x·2x·3x 내보내기"는 고른 칸을 1x로 `<이름>.png`·`<이름>@2x.png`·`<이름>@3x.png`(`build_sprite.py --scale 1 2 3`과 같은 이름)를 내려받고, 글꼴 바탕 요소에 `--fy-sprite-url`·`--fy-sprite-url-2x`·`--fy-sprite-url-3x`와 `--fy-sprite-image: image-set(var(--fy-sprite-url) 1x, var(--fy-sprite-url-2x) 2x, var(--fy-sprite-url-3x) 3x)`를 쓴다(편집 한 번 = CSS 되돌리기 한 단계). 원본 칸보다 큰 출력은 늘린 이미지라고 알린다.
- **작은 글씨 보정**: "작은 글씨 그림 자소 프리셋"은 글꼴 레벨 바탕 요소 값 `--fy-sprite-zoom: 1.35`, `--fy-sprite-crop-x/y: -0.175em`, `--fy-sprite-dilate: drop-shadow(0 0 0 #17130d)`를 한 번에 쓰고 "프리셋 해제"는 이 네 선언을 지운다(값은 전역 변수 패널에서 더 고친다). `--fy-optical-sprite-*`는 페이지 전용이라 글꼴에 쓰지 않는다 — "광학 보정 미리보기"는 미리보기 바탕 요소에만 덧씌우고, "페이지용 광학 CSS 복사"는 글꼴을 쓰는 페이지에 넣을 `:where(font-kku, .font-kku)[data-fy-font="<id>"][data-optical-size="small"] { --fy-optical-sprite-* }` 규칙을 복사한다.
- **PNG 가져오기**: 폭이 열 수로 나누어떨어지고 높이가 정사각형 칸의 배수이며 행이 2–6이어야 한다(아니면 거부). 행 수가 CSS와 다르면 "CSS를 자소판에 맞추고 불러오기"를 기다리고, 수락하면 `--fy-sprite-rows`와 `--fy-sprite-kinds`(행 배치가 담는 종류)를 바탕 요소의 캐스케이드 승자 규칙에서(없으면 기본 바탕 요소 규칙에) 고친다.
- `file://`에서 연 자소판은 캔버스가 오염돼 보기 전용이 된다. 'PNG 열기'로 불러오면 편집할 수 있다.
- 새 그림 자소 글꼴은 v2 틀(2행 자소판, `--fy-sprite-kinds: consonant vowel`, 모음 행 선택 규칙 하나)과 기기 글꼴로 채운 자소판에서 시작한다. ADR-006 v1 그림 자소 프로젝트는 `migrateV1Project`로 읽는다. 자소판 경로와 변수 값은 CSS로 옮기기 전에 검사해 선언·규칙을 끝낼 수 있는 문자(`;{}\<>!`, 주석), 자원 참조(`url(` 등), 짝이 안 맞는 괄호·따옴표가 있으면 옮기지 않고 목록으로 알린다.

## 전역·묶음 변수
리듬(`--fy-glyph-*`, 공백·줄 간격), 글꼴(`--fy-font-family/weight/stroke`), 구조(표현 방식, `--fy-font-jamo-depth`·`--fy-font-vowel-depth`·`--fy-font-coda-depth` — 평이름 깊이 변수는 페이지 전용), 그림 자소(칸·zoom·crop·`--fy-sprite-dilate`·`--fy-sprite-rendering` — `--fy-sprite-filter`는 페이지 전용), 묶음 변수 7종을 바탕 요소 수준에서 편집한다. 바탕 요소의 캐스케이드 승자 규칙(조건·중요도 포함)의 그 줄을 고치고, 없으면 기본 바탕 요소 규칙에 추가한다. 깊이를 바꾸면 `refreshAll`이 구조를 다시 만든다.

## 초안
- 불러오기만으로는 초안을 쓰지 않는다. CSS·자소판을 편집하고 400ms 뒤에 저장한다(자소판은 dataURL).
- 시작할 때 남아 있던 초안은 "초안 복원"/"초안 버리기" 전까지 보관한다. 복원하지 않은 채 편집하면 옛 초안을 옆 칸(`…:pending`)으로 옮긴다 — 초안은 최근 두 개까지다. 옮길 공간이 없으면 자동 저장을 멈추고 알린다.
- 용량이 모자라면 자소판을 빼고 다시 저장하고, 그래도 안 되면 상태 표시줄(`[data-studio-draft-status]`)에 실패를 보인다.

## 검증
두 단계 모두 경고 수준의 작성 보조다. 릴리스 판정은 `scripts/glyph_overlap_audit.py`와 페이지 감사가 맡는다.

- **1단계 — 잉크 상자**: canvas 텍스트 측정값으로 자모 잉크 상자를 구해 자리의 scale과 stroke를 반영하고, 음절 간 겹침과 글자 칸 이탈(폭의 12% 초과)을 보여 준다. 원소 재료(획이 CSS 상자)는 글자 측정 대신 그린 획 상자(`[part="element"]`)를 합친다 — 세벌 고정의 좁은 글자 칸에서 글자 측정 근사가 이웃과 겹쳐 보이던 것을 없앤다. 세벌 고정에서 남는 이웃 겹침(기기 글꼴 재료)에는 근사일 수 있다는 말과 판정 도구(겹침 감사 `--layout fixed`)를 붙인다. clip-path·회전은 무시한다.
- **2단계 — 음절 안 잉크 겹침**(ADR-009 §5): 글자마다 자모 노드를 canvas에 다시 그려 알파 마스크를 만든다. 계산된 글꼴·굵기·`-webkit-text-stroke`, 실효 배율, `clip-path: inset()`을 반영하고, 기준선은 Blink처럼 반쪽 leading을 내림해 놓는다. canvas 글자는 페이지 글자보다 가늘게 칠해지므로 알파 64 초과를 잉크로 친다. 그림 자소 노드는 계산된 `background-position`/`background-size`로 자소판 칸을 그린다. 노드 쌍마다 잉크 교집합 ÷ 작은 쪽 잉크 면적이 15%를 넘으면 경고한다. Playwright 검사(`assert_font_studio_checks_and_save`)는 같은 세션·같은 페이지에서 감사 방식(노드 하나만 보이게 한 스크린숏, 50% 잉크)으로 기준을 재 ±6%p 안에서 대조한다.
- 자소판이 canvas를 오염시키거나(`file://`) 자소판을 불러오지 못하면 그 글자의 2단계 판정은 "잴 수 없음"으로 표시하고(`data-overlap-status="partial|unmeasurable"`), "문제 없음"으로 보이지 않는다. 결과는 `FontStudio.overlaps()`로도 읽는다. 겹침용 이미지 캐시는 쓰지 않는 blob URL을 버린다.

## 파일 저장 (File System Access)
- 브라우저에 `showSaveFilePicker`/`showOpenFilePicker`가 있으면 "파일 연결해 열기"·"파일에 저장" 버튼이 보인다.
- "파일에 저장"은 첫 번째에 저장할 파일을 고르고, 그 뒤에는 같은 파일 핸들을 덮어쓴다. "파일 연결해 열기"로 연 파일도 그 핸들로 저장된다. 저장하면 변경 수가 0으로 돌아간다.
- 다른 글꼴을 불러오거나 이름을 바꾸면(새 글꼴로 복제) 핸들을 잊는다 — 다음 저장은 새 파일을 고른다. 사용자가 선택 창을 취소하면 아무 일도 하지 않는다.
- 지원하지 않는 브라우저에서는 두 버튼이 숨고 CSS 내보내기(다운로드)가 그대로 동작한다.

## 모델 API (파서·해석기)
`FontStudioModel`(브라우저 `window.FontStudioModel`, Node `require("authoring/font-studio-model.js")`)의 공개 API. CSS 검사(`scripts/check_css_contract.js`)도 이 파서 위에 올릴 수 있게 둔다.

- `parse(text, { seedLayers })` → 문서. 절대 예외를 던지지 않는다.
  - `items`: 최상위 노드. `{ type: "statement", atRule, prelude, layers? }`(`@layer a, b;`는 선언한 전체 이름), `{ type: "block", kind: "group", atRule: "layer"|"media"|"supports"|"container"|…, layer | condition, conditions, children }`, `{ type: "block", kind: "rule", selector, declarations, children }`, `{ type: "block", kind: "at-rule", atRule, declarations | children }`(`@font-face`·`@property`·`@keyframes` 등), `{ type: "garbage" }`. 블록은 `preludeStart/preludeEnd/bodyStart/bodyEnd/end` 오프셋과 `closed`(파일 끝에서 닫았는지), `line/column`을 가진다.
  - `rules`: 모든 스타일 규칙(중첩 포함, 문서 순서). `layer`(전체 이름, 레이어 밖은 `null`, 익명은 `(anonymous N)`), `layerKey`(Cascade 5 비교 키), `conditions: [{ type, text, line }]`, `nested`, `effectiveSelector`(`&` 해석), `specificity`, `order`, `invalid`(무효 사유: `stray-semicolon`, `stray-brace`, `empty`, `invalid-layer-block` …).
  - 선언: `{ name, value, important, custom, start, colon, valueStart, valueEnd, importantStart, contentEnd, end, terminated, line, column, invalid }`. `value`는 끝 주석과 `!important`를 뺀 구간이다.
  - `errors: [{ severity, code, message, offset, line, column }]`(`unclosed-block`, `bad-string`, `bad-url`, `unterminated-comment`, `stray-*`, `no-colon` …), `important`(중요 선언 목록), `nesting`(중첩 규칙 목록), `layerOrder`, `statements`, `atRules`, `groups`, `eol`, `indentUnit`, `position(offset)`.
- `diagnostics(doc)`: 파싱 오류 + 검사식 경고(`important`, `nesting`, `page-only`, `unlayered`).
- 선택자: `selectorSpecificity`, `complexSpecificity`(`:is/:not/:has/:where`, `:nth-child(… of S)`, `:host()`, `::slotted()`, 이스케이프, 따옴표 안 `]`), `canonicalSelector`/`sameSelector`(이스케이프·따옴표·공백 정규화), `splitSelectorList`, `subjectCompound`, `selectorCompounds`(복합 선택자 → 결합자와 compound 목록, 단순 선택자는 `{ kind, name, op, value, flag, args }` — 속성 이름은 소문자·namespace 제거·이스케이프 해석, 검사의 분류 입력), `ruleCoverage`.
- 해석: `createResolver(doc, node, host, { matches, parentOf, evaluateCondition })` → `{ chain, lookup(name), lookupAt(el, name), winnersAt(el), overrideBelowHost(name), entry(property), entries(), hostValue(property, from) }`. `resolveNode(doc, node, host, options)`는 `entries()`. `cascadeCompare`, `compareLayerKeys`.
- 편집: `editTarget(doc, font, { pos, jamo, resolver }, property, scope, context, { shared: "edit"|"split" })` → `{ layer, selector, variable, rule, existing, mode, baseValue, shared, blocked, escalation, note }`; `applyTarget(text, target, value)`; `setDeclaration`/`removeDeclaration`(레이어·선택자로 찾기), `setRuleDeclaration`/`removeRuleDeclaration`(규칙 객체로), `findRule`, `renameFont`(새 이름은 `normalizeFontName` — trim·ASCII 소문자), `normalizeFontName`, `readMetadata`, `scopeFontIds`, `fontScope`.
- 값·텍스트: `offsetAdd`, `parseLengthSum`, `normalizeValue`, `lineDiffCount`, `rewriteUrls`, `extractAtRules`, `createHistory`, `slotFamily`, `pageOnlyVariables`.
- 생성 블록: `SLOT_CONTRACT`(부모·역할·출력 여부·기본값), `SLOT_SUFFIXES`(접미사·type·roleFallback), `PAGE_ONLY_VARIABLES`(레지스트리 `declaredBy: page`)는 `check_css_contract.js --write`가 만든다(`--check`가 낡은 블록을 거부). 검사 모듈의 `lint-registry` 블록과 같은 생성기에서 나온다.

`FontKkuLint`(브라우저 `window.FontKkuLint`, Node `require("authoring/font-kku-lint.js")`, 모델 다음에 불러옴): `lint(cssText, { fileName, digest })` → `[{ severity, code, message, line, column }]`, `CODES`(코드 → 설명), `DIGEST`(생성된 레지스트리 요약), `format(findings, fileName)`, `classifySelector(complex, fontId)`(대상 종류·문맥·자모 조건·기대 레이어), `checkValue(name, value)`.

## 한계와 다음 단계
- 옛 Sprite Editor PoC의 자소판 기능은 재료 탭으로 모두 옮겼다(2026-10-09 — 사각형, 다시, 자소판 비우기·전체 다시 채우기, 잉크 비율, 칸 크기·배율 세트 내보내기, 래스터 품질, 미리보기 PNG 칸, 작은 글씨 프리셋, 광학 보정, CSS 복사). PoC의 별도 작업 초안 버튼(Save/Load Draft)은 작업실 자동 초안이, 미리보기 글꼴 원천 전환(그림 자소 / 기본 글꼴 / 이름 지정 글꼴)은 일반 글꼴 편집이 대신한다.
- 2단계 겹침 판정의 canvas 다시 그리기는 브라우저의 텍스트 그리기와 완전히 같지 않다(회전·`inset()` 밖의 clip-path는 반영하지 않는다, 얇게 맞닿은 획은 몇 %p 차이가 난다). 그래서 경고 수준에 두고 릴리스 관문은 Python 감사다.
- `@container`/`@scope` 조건은 평가하지 않고 "미확인"으로 적용한다. 그런 규칙이 값을 공급하면 편집 대상에서 제외하고 알린다.
- 참조 글꼴 IoU 적합은 개발 도구(`scripts/glyph_fit.py` 등)에 남아 있다.
- 문맥 규칙 탭은 목록·지우기만 하고 더하기는 JSON 칸으로 한다(조립식 비교·팔레트도 문맥 조건을 만들지 않는다).
- 디자인 도구(계획 F)가 일부러 만들지 않은 것 — 설계와 부딪히거나 런타임 계약 결정이 먼저다:
  - 위 자모를 따라가는 조각 보정(§5.5 linked-adjustment): 디자인에 조각별 변환이 없다. 조각 보정은 떼어 낸 독립 SVG에서만 한다.
  - 글꼴 낱자 → SVG 바꾸기(§6.6): 제안하지 않는다.
  - 고정 배치의 자모별 크기·간격·자리: 도장이 맡는다. 작업실은 지금처럼 거부하고 네모 문맥을 안내한다.
  - `display.detail`, 묶음의 TTF 내보내기·주소(#) 공유(선택 항목).
- 런타임을 옮긴 거울 셋은 런타임이 바뀌면 함께 고쳐야 한다. 시험이 어긋남을 잡는다:
  - 조립식 목록 `authoring/font-studio-recipe-catalog.js`: `build_studio_recipe_catalog.js --check`와 Node 대조(정본 투영·런타임 생성 구간).
  - 출처 패널의 규칙 풀이(`ruleWinners` — 런타임 `ruleFits`·`winningRule`·`requestSource`·`requestBundle`·`designRequests`를 옮김): Node 약 11만 요청과 스모크(미리보기 모든 노드)가 `planJamo`·`traceOf`의 rules와 대조.
  - 떼어 내기의 잡기: 런타임 내부 꼴인 노드 em 인라인 변수 `--fy-el-*`와 `svg[part=vector]`를 읽는다. 그림 든 선 원소의 상자 두께는 코어 CSS `--fy-el-t`처럼 `--fy-el-w × --fy-el-k × --fy-el-density`(밀도 굵기 계수 — 촘촘한 자모는 1보다 작다, ADR-024 §3)다. `placeElement` 꼴이 바뀌면 떼어 낸 모양이 말없이 어긋나므로 스모크 `assert_studio_f_draw_detach`가 떼기 전·후 잉크 IoU(0.85 이상)로 지킨다.
- `registerJamo`에는 지우기가 없어 영향 목록의 임시 그림 세트는 고정 이름(`studio-impact-a`·`-b`, 한쪽 세트가 여럿이면 `-a-2` …)을 돌려 쓴다. 임시 디자인은 `unregisterDesign`으로 지운다(없는 런타임이면 내용 주소 이름이 세션 동안 남는다).
- 글꼴 재료 스모크(F2·F3·F7)는 macOS 글꼴(Apple SD Gothic Neo)과 없는 글꼴 이름의 대체 의심에 기댄다. Linux·Android에서는 identity 결과가 다르다.
- 디자인 API(`validateDesign`·`{ replace: true }`·`DESIGN_UNSUPPORTED_FONT`)는 0.1.1부터다. 공개 사이트가 그보다 앞선 판을 쓰는 동안 디자인 패널은 숨는다(`unavailable`).
- 공개 사이트(font.tty.link)는 npm 공개본 런타임을 쓰므로 디자인 API가 들어간 판이 공개되기 전에는 디자인 패널이 숨는다.

## Change Log
- 2026-10-14: 기본 디자인 배치를 세벌식(`sebul-cases-v1`, ADR-028)으로, 배치 단추에 직결식(`sebul-fixed-v1`)을 더함. 고정 배치 안내·충돌은 두 모델(case-fixed·fixed-three)에 같다
- 2026-10-12: 계획 F1–F10 — 디자인 도구 절(탭 껍데기와 칸마다 붙는 때, 조립식·binding 비교, 출처 패널, 그리기 8 → 24 → 40, 독립 SVG, 글꼴 팔레트, 묶음, 편집 기록·영향 목록, 잠금 저장 자리), 구성 표에 실제 모듈·시험·시험 파일, 런타임 API 목록(`planJamo`·`registerJamo`·`unregisterDesign`·있으면 `designs()`), 한계(만들지 않은 것, 거울 셋과 지키는 시험, 임시 세트, macOS 글꼴). 그리기 탭은 넓은 화면에서 문장 미리보기를 자모 칸 아래로 옮겨 편집기 옆 빈자리를 없앴다(1280px 칸 높이 800 → 627px, 390px는 차례 그대로·높이 +4px)
- 2026-10-12: 계획 F0 — 디자인 편집 창구(`edit`·`begin`·`validate`·`lease`·`participant`·`on`·`history`/`jump`·`setImpactHandler`·`addBusy`·`renderTrace`), 이름 붙은 기록(`authoring/font-studio-transactions.js`)이 옛 JSON 스냅샷 기록을 대신한다. 탭 껍데기(`FontStudio.f`)와 칸 일곱, 뒤 묶음 자리 표시 파일, 테스트 모음(`tests/font_studio_f.test.js`·`studio_f_checks()`). 화면은 칸을 붙이기 전까지 그대로
- 2026-10-12: 디자인 패널을 런타임 디자인 API로(ADR-025 F) — 검사는 `validateDesign`(오류를 모두, 코드·한국어·런타임 문구로), 등록은 이름 하나
  `studio-design`을 `{ replace: true }`로 바꿔 써 등록부가 늘지 않는다(내용 주소 이름 `studioName`을 없앴다). 받지 않는 글꼴은 계산된 스타일로
  짐작하지 않고 런타임 진단 `DESIGN_UNSUPPORTED_FONT`를 읽는다(상태 `pending` 추가). 저장은 등록하지 않고 검사만 한다
- 2026-10-12: 디자인 패널(설계 v1.2 §13.1–13.2, ADR-025 F 첫 조각) — 맨 주소의 첫 화면은 세벌 고정 기본 디자인, 시작 선택지 셋(선·원 / 직접 그려 / 기존 글꼴), 대표 비교 칸(가 고 과 각 곽 · 가 나 간 난, 잰 자리 수), 고급의 배치 전환(세벌 고정 ↔ 네모 문맥)·문맥 규칙 탭·충돌 처리·JSON 칸·되돌리기, 디자인 JSON 열기·저장·복사·페이지용 코드, 프로젝트·초안의 `design`, 받지 않는 글꼴 판정, 출처 한 줄. 세벌 고정 도장 노드의 글꼴 CSS 편집 거부 — 전에는 변수만 바뀌고 화면은 그대로인데 "고침"으로 보였다. 1단계 잉크 상자가 원소 재료에서 그린 획 상자를 잰다. 모델 `authoring/font-studio-design-model.js`(+ `tests/font_studio_design.test.js`), 스모크 `assert_font_studio_design`
- 2026-10-09: 옛 Sprite Editor 기능 복원 — 사각형 도구와 도형 미리보기, 동작 단위 되돌리기·다시(자소판 작업 포함), 안내선 켜고 끄기, 잉크 비율, 자소판 전체 비우기·전체 다시 채우기, 래스터 품질(`--fy-sprite-rendering`), 미리보기 PNG 칸, PNG 칸 크기·1x·2x·3x 배율 세트 내보내기(`image-set` CSS 연결), 작은 글씨 프리셋·페이지 전용 광학 보정 미리보기·페이지용 CSS 복사, 도구 막대 "CSS 복사". 그림 자소가 아닌 글꼴에서 빈 자소판 패널 대신 시작 안내, 탐색 메뉴 "자소판 그리기"·`#studio-material` 입구. `hidden` 요소가 컴포넌트 `display` 규칙에 가려 보이던 결함 수정(`demo.css` `[hidden]` 가드)
- 2026-09-27: 글꼴 계약 검사 통합 — `authoring/font-kku-lint.js`(검사 스크립트와 같은 모듈)를 불러오기·편집·저장·내보내기 때 돌려 경고 목록에 코드·줄로 보이고, 저장·내보내기는 막지 않고 경고. 모델에 `selectorCompounds`, 생성 블록에 `SLOT_SUFFIXES`·`PAGE_ONLY_VARIABLES`. 모델 `diagnostics`·id 경고와 겹치는 항목은 검사 문구로 일원화. 새 글꼴·이름 바꾸기는 이름을 trim·소문자로 정규화해 쓴다(런타임 `data-fy-font` 소문자 정규화)
- 2026-09-27: 편집 범위가 값을 공급하는 규칙을 고치도록 수정(공유 경고·분리·가려짐 거부·반영 확인), 파서 재작성(브라우저식 복구, 조건·중요도·중첩·레이어·CRLF·압축 블록), 조상 상속·조건·중요도를 계산하는 해석기, shadow root 미리보기와 URL 절대화, 초안 규칙, 복제 시 파일 핸들 해제, PNG 가져오기 검증, 겹침 판정 보정과 잴 수 없음 표시, 자리 가족 범위와 새 자리 접미사(rotate·clip·dilate), 고정 fixture 글꼴 기반 테스트. 모델 API 절 추가
- 2026-09-25: 2단계 음절 안 잉크 겹침 검증, File System Access 저장 추가. 재료 탭 자소판 변수를 코어화된 `--fy-sprite-*`로 교체
- 2026-09-25: PoC 두 페이지 제거 반영 — PoC 전용 기능은 버렸음을 한계 절에 기록
- 2026-09-24: 1단계 구현과 함께 작성
