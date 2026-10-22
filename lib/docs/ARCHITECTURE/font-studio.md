# 글꼴 작업실

## Purpose
브라우저에서 글꼴 CSS를 만들고 고치는 정적 페이지인 글꼴 작업실(`studio/index.html`)의 구조를 설명한다. 결정 근거는 [ADR-009](../ADR/ADR-009-font-editor-v2.md), 편집 대상인 글꼴 계약은 [ADR-008](../ADR/ADR-008-font-contract-v2.md)이다. 첫 화면의 디자인 패널(세벌식 기본·재료 선택·대표 비교)은 [최종 설계 v1.2](../PLAN/ponkku-final-design-v1.2/DESIGN.ko.md) §13, [ADR-025](../ADR/ADR-025-hangul-composition-design.md)·[ADR-026](../ADR/ADR-026-sebul-fixed-layout.md)·[ADR-028](../ADR/ADR-028-sebeol-cases-and-jikgyeol.md)을 따른다.

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

ESM은 `import { mount } from "@tty.link/font-kku/studio"`로 같은 기능을 쓴다. 기본 작업실 URL은 모듈 위치에서 찾고, 별도 배치에서는 `studioUrl`을 지정한다. `src`는 호스트 페이지 기준으로 절대 주소를 정한다. `font`, `text`, `project`, `timeoutMs`, `draftKey`, `shippedSave`, `page`도 설정할 수 있다. `page`는 처음 열 작업실 페이지(`design` 기본 · `edit` · `sheet` · `review`, 아래 '작업실 페이지')다. `shippedSave: true`는 고친 기본 제공 글꼴을 그 이름 그대로 저장하게 연다 — 저장소 작업실 전용이고, 기본(사이트)은 '이 글꼴로 새 글꼴'로만 저장한다(아래 '새 글꼴로 · 이 글꼴 그대로'). 기본 제한시간은 30초이며 시작과 개별 요청에 적용한다.

반환 핸들의 `ready`가 완료되면 `exportProject()`·`loadProject(project)`·`getCss()`·`setText(text)`·`setBoundaries(boolean)`를 사용할 수 있다. 저장·불러오기는 기존 프로젝트 v2를 사용한다. 기본 초안 키는 유지하며, `draftKey`를 지정하면 서로 다른 초안 공간을 사용한다. `setBoundaries()`는 프레임 내부 미리보기의 경계 표시를 바꾼다. 사용을 마치면 `destroy()`로 프레임과 대기 요청·이벤트를 해제한다. 편집·고르기·검수를 결과와 함께 부리는 `call(이름, …)`·`on(사건, fn)`과 옵션 `mode`는 아래 '자동화 계약 v1'.

UI의 전역 객체·DOM·스타일은 iframe 문서 안에서 격리한다. 호스트의 CSS로 내부 화면을 직접 바꾸는 계약은 제공하지 않는다. 사이트 메뉴와 URL 구성은 호스트가 담당하며, 직접 여는 `studio/index.html`도 classic script로 동작한다.

## 작업실 페이지
2026-10-17 사용자 결정 — 한 페이지에 다섯 갈래 일이 쌓여(미리보기 위끝 1,168px, [작업실 검토](../NOTES/studio-direct-manipulation-review-2026-10-16.md) '화면 구성') 작업실을 페이지로 나눈다.

| 페이지 | 주소 | 보이는 칸 |
|---|---|---|
| 디자인 | `?page=design`(맨 주소) | 디자인 패널(재료 셋·그리기 입구·비교 칸·고급의 글꼴 모양·문맥·JSON·묶음)과 도구 탭(조립식·그리기·떼어 내기·팔레트·편집 기록), 미리보기와 출처 칸. 누르면 고르기만 한다 |
| 고치기 | `?page=edit` | 미리보기와 살펴보기(편집 범위·값·편집 대상·걸린 규칙·출처), 직접 조작(끌기·손잡이 틀·키), 검증, 전역·묶음 변수, 글꼴 CSS 원문 |
| 자소판 | `?page=sheet`(옛 `#studio-material`) | 미리보기와 자소판 편집(그림 자소 글꼴이 아니면 시작 안내 — 새 그림 자소 글꼴은 여기서). v1 그림 자소 프로젝트는 `scripts/convert_sprite_project_v1.js`(S3) |
| 검수 | `?page=review` | 크기별 실제 글자, 판정·메모·다시 검수, 비교 기준 저장과 전후 비교, 저장 환경 확인 |

- 모든 페이지에 머리(페이지 고리 `[data-studio-pages-nav]`, 글꼴 상태, 한 줄 설명)와 머리 막대(글꼴 고르기 ▾ · 열기 · 저장 · 내보내기 ▾ · 되돌리기·다시 — 아래 '머리 막대 (S2)')가 있다.
- 페이지는 주소가 다른 화면이지만 **한 문서**다: 칸마다 `data-studio-pages`로 보이는 페이지를 밝히고 CSS가 나머지를 감춘다(`[data-studio][data-page]`). 페이지 고리는 문서를 다시 싣지 않고 `?page=`만 바꾸어(`history.pushState`, 뒤로 가기 됨) 고친 것·되돌리기 기록·mount 연결이 이어진다. 새 탭으로 열면 그 주소의 새 작업실이다(초안이 있으면 초안 막대). 따로 된 문서로 나누면 그림 세트 등록·프로젝트 조각이 페이지마다 끊긴다 — 모듈이 서로의 상태(디자인 → 그림 세트 → 미리보기)에 기대기 때문이다.
- 디자인 페이지의 비교 칸·그리기 41칸·문장·조립식 후보·팔레트·편집 기록 타이머는 그 페이지(와 탭·펼친 본문)가 보일 때만 그리고 임시 이름을 빌린다. 감춰지면 바탕 요소를 비워 쉬고 `page` 훅·펼치기에서 따라잡는다(2026-10-18 S0). `design.compare()`는 감춰졌을 때 화면 밖 재기 무대에서 잰다. 디자인 자체는 고치기 페이지에서도 미리보기에 걸린다.
- 알림(메시지 줄)은 페이지마다 따로 두고, 다음 편집 동작에서 지운다. 긴 글은 줄바꿈하고, 원문(CSS 변수·규칙 줄)은 접는 '자세히'에 둔다.
- `FontStudio.page()`·`FontStudio.setPage(name)`, 런타임 훅 `FontStudio.on("page", fn)`.

## 구성

| 파일 | 역할 |
|---|---|
| `authoring/font-studio-util.js` | 공용 도구·표(S6, `FontStudioUtil`) — 아래 '공용 도구와 표'. 다른 authoring 파일과 작업실 모듈보다 먼저 싣는다 |
| `authoring/font-studio-model.js` | 문서 모델. 파서(위치 정보 트리, 브라우저식 오류 복구), 특이도, 캐스케이드 해석기, 선언 단위 편집, 이름 바꾸기, 편집 범위 → 규칙·변수 대응, 값 산술, 줄 diff, 미리보기용 URL 절대화, 되돌리기 이력. 브라우저와 Node 공용 |
| `studio/font-studio.js` | 화면. 불러오기/저장(File System Access 포함), shadow root 미리보기, 선택·살펴보기·편집 대상 패널·드래그, 전역·묶음 변수, 초안, 검증(잉크 상자·음절 안 잉크 겹침), 확장 훅(load/select/project/render) |
| `authoring/font-kku-lint.js` | 글꼴 계약 v2 검사([ADR-008 §9](../ADR/ADR-008-font-contract-v2.md)). 모델 파서 위에서 구조·적용 범위·레이어 = 레벨·변수·속성·값·메타데이터를 검사한다. `scripts/check_css_contract.js`와 같은 모듈이고, 레지스트리 요약은 생성 블록이다. 브라우저와 Node 공용 |
| `authoring/font-studio-sheet.js` | 재료 모델. 자소판 행 배치·칸 이름표(행별 사용 칸), 자소판 크기 검사, 글꼴 CSS의 자소판 정보, 새 그림 자소 글꼴 틀, v1 프로젝트 이전(값 검증), 내보내기 칸·배율 이름(`scaledPath`)과 배율 세트 선언(`multiScaleDeclarations`), 래스터 품질 ↔ `--fy-sprite-rendering`, 작은 글씨 프리셋·페이지용 광학 CSS. 브라우저와 Node 공용 |
| `studio/font-studio-material.js` | 재료 탭 화면. 원본 캔버스, 칸 편집 도구(펜·지우개·채우기·직선·사각형, 안내선), 동작 단위 되돌리기·다시, 잉크 비율, 미리보기 blob 덮어쓰기와 다시 샘플링, 내보내기(칸 크기·배율 세트), 래스터 품질·프리셋, PNG 가져오기 검증·행 맞추기, 프로젝트·초안 연동, 그림 자소가 아닌 글꼴용 시작 안내 |
| `authoring/font-studio-design-model.js` | 디자인 모델. 기본 디자인(1.2 세벌식, revision은 런타임 프로파일에서), 재료 바꾸기(`withMode` — 배치 유지, 사라진 소스를 가리키던 규칙 빼기), 배치 바꾸기와 고정 배치 충돌(`withLayout`·`fixedConflicts`·`resolveConflicts` drop/flatten, flatten 충돌은 합치지 않고 보고), 등록 이름 하나(`STUDIO_NAME`), JSON 읽기 오류의 줄·칸(`parseDesignText` — 작은 문법 검사기로 위치를 찾는다), 검사 오류 코드의 한국어 설명(`ERROR_TEXT`·`describeError`·`errorLine`), 파일 이름·페이지용 코드, 비교 칸 자리 세기(`placementReadout`). 브라우저와 Node 공용 |
| `studio/font-studio-design.js` | 디자인 패널 화면. 시작 선택지 셋, 미리보기 적용·접기, 비교 칸(줄마다 shadow root), 글꼴 모양 아래 '이 모양과 맞지 않는 규칙'(막음·경고), 고급(규칙 목록과 더하기·고치기·지우기 칸·JSON), 디자인 JSON 열기·저장·복사·페이지용 코드, 검사 오류 목록(코드·한국어), 받지 않는 글꼴(런타임 진단) 표시, 살펴보기의 출처 한 줄, 프로젝트·초안 연동, 그림 세트 싣기 |
| `authoring/font-studio-transactions.js` | 편집 기록·묶음 편집·임시 등록(계획 F0). 항목마다 바꾸기 전·후 `{ design, participants }`를 드는 이름 붙은 기록(`createStore` — 되돌리기·다시·건너뛰기, 60단계), 미리보기만 하다 한 줄로 남기는 묶음 편집(`createTransaction`), `studio-tmp-<n>` 임시 이름을 돌려 쓰는 등록(`createLeasePool` — `unregisterDesign`이 없으면 내용 주소 이름), 검사 결과 모양 맞추기(`normalizeValidation`), 하나의 기록(`createTimeline` — 갈래 여럿의 편집을 한 시간축에, PLAN-STUDIO-002 S2). 브라우저와 Node 공용 |
| `studio/font-studio-f-shell.js`, `studio/font-studio-f.css` | 디자인 도구 탭 껍데기(계획 F0). `FontStudio.f.mount(id, { label, modes, group })`가 `[data-studio-f=id]` 칸을 돌려주고 탭·재료에 따라 `[hidden]`으로 가린다. 붙인 칸이 없으면 탭 줄도 없다 |
| `authoring/font-studio-recipe-catalog.js`, `scripts/build_studio_recipe_catalog.js` | 조립식 목록 거울(계획 F1, 생성 파일 — 손으로 고치지 않는다). 런타임은 조립식 표를 꺼내 주지 않아 `spec/jamo-recipes.json`·`spec/authoring-stages.json`에서 `--write`로 만들고 `--check`가 낡은 거울을 거부한다 |
| `authoring/font-studio-design-rules.js` | 디자인 규칙 순수 모델(계획 F1, `FontStudioDesignRules`). 자모·역할 칸마다 규칙 하나(`pick-<역할\|any>-u<16진>`·`mix-<역할>-u<16진>`)로 고르기·풀기, 런타임 거부를 미리 거부하는 `choiceAllowed`, 잠금 `editor.locks`, 씨앗 자동 섞기(`autoMix`·`clearMix`), 소스 빼기(`removeSource`), 영향 목록(`impactOf` — 전·후 디자인을 임시 이름으로 등록해 초 19·중 21·종 27·낱자 40의 `planJamo`를 견준다). 브라우저와 Node 공용 |
| `authoring/font-studio-provenance-model.js`, `studio/font-studio-provenance.js`·`.css` | 출처 패널(계획 F2). 순수 모델 `FontStudioProvenanceModel.answer`가 `traceOf` 기록·디자인 JSON·그림 문서로 다섯 질문에 답하고(Q3 규칙 선택은 공통 순수 모듈 `font-kku-rule-resolution.js`를 사용), 칸은 `renderTrace`를 바꿔 끼워 살펴보기 `[data-studio-f=provenance]`에 그린다 |
| `studio/font-studio-recipes.js`·`.css` | 조립식·binding 비교 탭(계획 F3). 자모 칸 하나의 후보(지금·자동·원본·조립식마다)를 임시 이름으로 나란히 그리고 고르기·조각 binding·잠금을 편집 한 줄씩 |
| `authoring/font-studio-draw-model.js` | 그림 문서 순수 모델(계획 F4, `FontStudioDrawModel`). `font-kku-drawing` v1(칸·부분·도형·출처), 새 문서를 돌려주는 칸 편집, `registerJamo` 칸(`toCells`·`register`), SVG 가져오기 허용 목록(`sanitizeSvg`), 경로 변환·범위·`rdp`, 문장 우선 제안(`proposals`), 떼어 내기(`detachFromCapture`). 브라우저와 Node 공용 |
| `studio/font-studio-draw.js`·`.css` | 그리기 8 → 24 → 40 탭(계획 F5). 그림 문서 참가자 `drawings`, 단계 줄(공용 진행률 부품)·제안·자모 41칸·칸 편집기·'원형 8만' 문장 미리보기. 입구는 디자인의 '직접 그려 만들기'(S3) |
| `studio/font-studio-progress.js` | 진행률 부품 하나(S3) — 디자인 칸의 그림 세트 진행률과 그리기 단계 줄 |
| `studio/font-studio-pages.css` | 디자인·자소판·검수 페이지의 쉬운·정밀 보기 모양(S3) |
| `studio/font-studio-draw-detach.js`·`.css` | 조합 자모 떼어 내기(계획 F6). 그리기 탭과 함께 보이는 칸 — 조합·획 자모를 조각마다 독립 SVG 칸으로 |
| `authoring/font-studio-palette-model.js`, `studio/font-studio-palette.js`·`.css` | 글꼴 팔레트 작업대(계획 F7). 순수 모델 `FontStudioPaletteModel`(인스턴스 `pal-<n>`·준비 상태·기록 셈·매트릭스 표본·칸 상태)과 글꼴 재료에서만 보이는 탭 |
| `authoring/font-studio-bundle-model.js`, `studio/font-studio-bundle.js`·`.css`, `spec/design-bundle.schema.json` | 디자인 묶음(계획 F8). 순수 모델 `FontStudioBundleModel`(만들기·읽기 검사·이름 겹침·사전 검사·`.jamo.js`·페이지 코드)과 파일 줄 끝의 칸, 형식 정본 `font-kku-design-bundle` v1 |
| `studio/font-studio-history.js`·`.css` | 편집 기록 칸과 영향 확인 대화상자(계획 F9). 판정·문구는 같은 파일의 DOM 없는 `FontStudioHistoryModel`(Node 공용) |
| `authoring/font-studio-review-model.js`, `studio/font-studio-review.js`·`.css` | 검수 페이지(ADR-031, S0 D9·S3·S5-C). 기록 판 2·지문·항목별 그린 모양 서명, 꾸밈·바탕 바꿔 보기(목록은 지연 싣는 `looks`), 비교 기준과 차이 칠하기 |
| `studio/index.html`, `studio/font-studio.css` | 정적 페이지와 화면 배치 |
| `tests/font_studio_model.test.js`, `tests/helpers/mini_dom.js` | 모델 단위 테스트(`npm test`). DOM 없이 해석기를 돌리는 작은 요소 트리·선택자 매처 |
| `tests/font_lint.test.js` | 검사 단위 테스트(`npm test`): 기본 제공 글꼴·fixture 통과, 텍스트 검사 우회로의 코드별 실패, 생성 블록 최신성 |
| `tests/font_studio_design.test.js` | 디자인 모델 단위 테스트(`npm test`): 도우미가 만든 디자인을 실제 `registerDesign`으로 등록해 보고, 도우미가 미리 찾는 고정 배치 충돌(막는 것)과 원칙 안내(경고)가 런타임 `validateDesign`의 오류(`DESIGN_FIXED_COMPOUND`)·진단(`DESIGN_FIXED_CONTEXT`·`DESIGN_FIXED_VARIATION`)과 같은지, 이름 하나 교체, 오류·진단 코드마다 한국어 설명(`font-kku.d.ts` `DesignErrorCode`·`DesignWarningCode`와 대조), 스키마 맨 위 키 대조 |
| `tests/font_studio_f.test.js`, `tests/studio_f/*.test.js` | 계획 F 단위 테스트(`npm test`) — 모음 파일이 `tests/studio_f/*.test.js`를 이름 차례로 싣는다(새 묶음은 package.json을 고치지 않는다). 모두 실제 런타임(`font-kku.js`)을 Node에서 싣는다: `transactions`(F0 기록·묶음 편집·임시 등록), `recipe_catalog`(거울 = 정본 투영·런타임 생성 구간), `design_rules`(모드 × 배치 × 역할 × 자모 × 방법 전수, 무작위 300단계 뒤 충돌 없음, 영향 목록), `provenance_model`(디자인 31 × 자모 51 × 역할 4 × 짜임 3 × 받침 2에서 Q3 = `planJamo` trace.rules), `draw_model`(칸 편집·등록·`sanitizeSvg`·떼어 내기), `history`(언제 묻는가), `palette_model`(준비 상태·기록 셈·`pal-*`가 `withMode`에서 살아남음), `bundle_model`(왕복·해로운 묶음 거부·이름 겹침·사전 검사·`.jamo.js` VM) |
| `tests/studio_f/smoke_*.py` | 계획 F 스모크 — `playwright_smoke.studio_f_checks()`가 맨 위 `assert_*`를 찾아 `run_check`(`assert_font_studio_f`)와 pytest(`test_font_studio_f_surface`, file·server)에 올린다. `assert_studio_f_foundation`·`_provenance`·`_recipes`·`_draw`·`_draw_detach`·`_palette`·`_bundle`·`_history` |
| `tests/fixtures/studio-f/`, `tests/fixtures/studio-f-bundle/` | SVG 가져오기 시험 그림(`ai-ok.svg`·`malicious.svg`)과 묶음 시험 파일(`origin8`·`malicious` `.fkk-bundle.json`) |
| `tests/fixtures/studio/studio-fixture.css` | 작업실 테스트 전용 고정 글꼴(한 줄 두 선언, 공유 `:is()` 규칙, 자리를 덮는 자모 규칙, 가리는 문맥 규칙, 일부러 겹친 보정) |
| `tests/playwright_smoke.py` `assert_font_studio*` | 실브라우저 흐름 테스트: 값 출처·범위 편집, 범위 결함(H1) 회귀, 포인터·키보드, 초안, 재료, 재료 도구(`assert_font_studio_material_tools`), 자소판 그리기 입구와 `hidden` 요소 노출(`assert_font_studio_entry`), 전역 변수, 겹침 대조와 파일 저장, 검사 경고(`assert_font_studio_lint`), 디자인 패널(`assert_font_studio_design`) |

런타임에서는 공개 API(`render`, `refreshAll`, `fontInfo`)와 디자인 API(`validateDesign`, `registerDesign`의 `{ replace: true }`, `unregisterDesign`, `layoutProfiles`, `traceOf`, `planJamo`, `authoringProgress`, `registerJamo`, `jamoSets` — 실험, npm 0.1.0에는 없고 0.1.1부터)만 쓴다. 등록된 디자인 목록 `designs()`는 있으면 쓰고(임시 이름이 남의 것과 겹치는지), 없으면 `planJamo`가 그 이름을 푸는지로 대신한다. 작업실 전용 훅은 없다. 디자인 API가 없는 런타임(지금 공개 사이트의 npm 0.1.0)에서는 디자인 패널이 숨고(`data-design-state="unavailable"`) 디자인 도구(계획 F)의 칸·창구도 붙지 않으며 나머지는 그대로 돈다.

## 데이터 흐름

1. **불러오기**: 기본 제공 글꼴 목록은 `spec/fonts.json`에서 만든다(22개, 바탕·파생으로 묶음, 별칭은 대상 글꼴로). 머리 막대의 글꼴 고르기 ▾에서 고르면 바로 연다(S2 — 견본 한 줄과 함께). `?font=`는 모든 기본 제공 id를 받고, 모르는 id나 읽지 못한 글꼴은 알리고 기본 글꼴로 연다(2026-10-18 S0 — 전에는 4개뿐이고 파생 id에서 멈췄다). 고친 것이 있으면 다른 글꼴·CSS·프로젝트·파일·초안을 열기 전에 '저장하고 열기 / 버리고 열기 / 취소'를 묻는다(API 열기는 묻지 않음). 기본 제공 글꼴은 `../profiles/<id>.css`, `?src=<url>`은 그 URL을 XHR로 읽는다(`file://`에서 막히면 파일 열기 안내). CSS 파일·프로젝트 JSON은 FileReader로 읽는다. 원문은 **먼저 파싱**하고 성공한 뒤에만 상태를 바꾼다. 구문 오류는 브라우저처럼 복구해 읽고, 구문 오류와 글꼴 계약 검사 결과를 메시지(건수)와 경고 목록(줄 번호·코드)에 보인다(아래 "검사").
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

- **첫 화면**: 주소에 `?font=`·`?src=`·`#studio-material`이 없으면(맨 주소) 기본 디자인 — `version: "1.2"`, 세벌식(`sebul-cases-v1`, revision은 `FontKku.layoutProfiles`에서), 선·원 재료 — 을 미리보기에 건다(`data-fy-layout="sebul-cases-v1"`). 글꼴을 밝히고 들어오면 미리보기는 글꼴 CSS 그대로이고 패널은 머리 줄만 남기고 접힌다(비교 칸은 펼치면 그린다). 시작만으로 초안을 쓰지 않는다.
- **시작 선택지**: 선·원으로 만들기(primitive) / 직접 그려 만들기(svg — 기본 제공 그림 세트 `dunggeun-box`·`pilgi-box`·`butgeul-box`를 작업실이 직접 싣고, 진행률 원형 8·기본 24·확장 40을 `authoringProgress`로 보인다) / 기존 글꼴로 만들기(font — 기본 글꼴과 역할별 글꼴, 비교 칸 기록의 `identity`·`measurement`로 대체 의심·잴 수 없음을 센다). 재료만 바꾸고 배치는 그대로다. 사라진 소스를 가리키던 규칙은 빼고 알린다. PNG 자소판(그림 자소 글꼴)은 디자인과 다른 재료라 재료 탭이 맡는다.
- **비교 칸**: 가 고 과 각 곽(초성 ㄱ) · 가 나 간 난(중성 ㅏ)을 같은 크기로 그린다. 줄마다 따로 된 shadow root가 미리보기와 같은 글꼴 시트를 받고(`FontStudio.addPreviewRoot`), 미리보기 적용 여부와 관계없이 늘 지금 디자인으로 그린다. 대상 자모는 글자 색으로 칠하고, 글자 상자 기준 위치·크기를 재어(0.75px 안은 같은 자리) 몇 곳·몇 가지 자리·머리 음절 몇 곳인지 적는다(`data-count`·`data-variants`·`data-heads`). sebul에서 세벌 고정은 5곳·1가지 / 4곳·1가지, 네모 문맥은 3가지 + 머리 음절 2곳 / 2가지다. 미리보기에서 고른 자모와 같은 역할·자모는 점선으로 보인다.
- **글꼴 모양과 고급(문맥 규칙·JSON)**: 글꼴 모양 단추 세벌식 / 직결식 / 네모꼴은 본문에 있다(S3 — 전에는 고급 안. 글꼴 모양을 적지 않은 1.0·1.1 디자인이면 "지금 모양"이 보이고, 고르기 전에는 글꼴 모양을 끼워 넣지 않는다 — L25). 고급(정밀 모드)에는 모든 규칙의 **규칙 목록**이 있다(S5-B — 전에는 네모꼴에서만 여는 문맥 규칙 칸, 아래 '규칙 목록과 맞지 않는 규칙'). 통짜 합자 모음(`direct`) 규칙이 있는 디자인을 고정 배치(세벌식·직결식)로 바꾸려 하면 그릴 수 없어 막고 "통째 규칙 지우고 바꾸기 / 바꾸지 않기"를 고를 때까지 적용하지 않는다. 문맥 규칙·자리마다 변주는 막지 않는다 — 바꾼 뒤 그 모양의 원칙(`layoutProfiles[id].match`·`occurrence`)을 깨는 규칙을 경고로 보이고 "원칙대로 되돌리기"(조건을 떼어 역할별 값으로)·"문맥 규칙 지우기"를 준다(ADR-030 §5). 둘 다 글꼴 모양 바로 아래 **'이 모양과 맞지 않는 규칙'** 한 칸이다(S5-B — 쉬운 모드에도 보인다). 되돌린 뒤 같은 자모·역할에 다른 값이 남으면 합치지 않고 충돌로 보인다. JSON 칸은 지금 디자인을 그대로 보이고 "JSON 적용"으로 고친다. 고급의 '디자인 되돌리기·다시' 단추는 뺐다(S3 ⚑5 — 편집 기록 칸·Ctrl+Z와 같은 함수). `FontStudio.design.undo()`·`redo()`는 디자인 갈래의 마지막 일로 남고, 차례는 하나의 기록이 글꼴 CSS·자소판·검수와 함께 맞춘다(아래 '하나의 기록').
- **등록 이름**: 하나(`studio-design`)다. 디자인을 고칠 때마다(재료·배치·JSON 적용·되돌리기·다시) 먼저 `validateDesign`으로 검사하고, 통과하면 `registerDesign("studio-design", json, { replace: true })`로 바꿔 등록한다 — 등록부가 늘지 않고, 그 이름을 고른 미리보기·비교 칸은 런타임이 다시 그린다(`data-design-revision`만 바뀐다).
- **실패**: 검사에 걸리면(문법 오류는 줄·칸) 등록하지 않고 미리보기는 마지막 정상 디자인을 두며, 상태를 `invalid`로, 오류 목록과 "마지막 정상 디자인으로"를 보인다. 목록은 오류를 모두 한 줄씩 — 코드(영어 그대로, `li[data-code]`·`data-path`), 한국어 설명(코드마다, `ERROR_TEXT`), 런타임 문구(자리 포함) — 보이고 건수(`data-count`)를 적는다. 실패 표시는 고칠 때까지 남는다(§13.6).
- **고정 글꼴 모양의 손 보정**: 고정 글꼴 모양(세벌식·직결식 — 바탕 요소 `data-fy-layout`의 프로파일 모델로 알아본다)의 역할 노드(초성·중성·종성)를 고르면 살펴보기는 계산된 모양 값(`--fy-shape-*`)을 보이고, 위치·크기(`tr[data-shape="tune"]` — 왼쪽·위·크기·가로·세로 배율)는 값 칸·드래그·방향키로 고치고, 회전·굵기·획 두께·자르기(`tr[data-correction]`)는 자모 보정 `--fy-jamo-*`를 같은 tune 규칙에 적는다(ADR-030 §7 — 코어가 shape 계층에서 바탕 글꼴의 보정을 비우고 tune이 다시 쓴다). 기기 글꼴 획 넓힘(`--fy-shape-stroke`)·밀도(`tr[data-shape="fixed"]`)는 생성 값이라 읽기만 한다. 편집은 글꼴 CSS의 `@layer font-kku.tune` 규칙으로 적고(`Model.shapeTarget`, 첫 문장을 다섯 계층으로 넓힌다), 범위 단추는 원칙 범위(기본 — 세벌식은 '이 짜임의 이 자모'(글자 칸의 모음 모양·받침), 직결식은 '이 자모(모든 자리)', 합자 모음 조각은 그 합자 모음의 조각만), 직결식의 '이 짜임의 이 자모', '이 글자만'(그 음절과 짜임 — 같은 음절은 어디서나 함께)을 보인다(ADR-030 §7). 좁은 범위는 원칙 규칙보다 구체적인 선택자로 이기고 노드가 지금 받는 값에서 시작한다. 원칙 밖 범위(직결식의 이 짜임, 이 글자만)를 고르면 편집 대상 칸이 원칙을 깬다고 알린다(`[data-studio-target-warning="principle"]` — 고친 대로 그리고 `FontKku.layoutStability`가 어긋남으로 보고). 편집 대상 칸(`data-target-state="fixed"`, `[data-studio-target-note="shape-tune"]`)은 범위와 적을 규칙을 보이고, "네모 문맥으로 / 디자인 끄고 글꼴 CSS로"를 다른 길로 함께 보인다. 글꼴 CSS의 자리·역할·자모·문맥 값은 코어의 모양 값 규칙이 덮어 꺼져 있다(2026-10-17까지는 이 노드의 편집을 받지 않았다). 전역 변수의 글자 칸(`--fy-glyph-width/height/gap`)·깊이·묶음 변환은 "고정 배치: 배치 프로파일이 정함"으로 흐리게 보인다.
- **받지 않는 글꼴**: 런타임은 기기 글꼴(system) 재료이면서 표준 잉크 상자(`--fy-font-ink-boxes`)를 밝힌 글꼴에서만 디자인을 읽고, 그 밖(그림 자소 재료, 잉크 상자를 밝히지 않았거나 끈 글꼴)에서 디자인을 고르면 바탕 요소에 `data-fy-design-status="DESIGN_UNSUPPORTED_FONT"`를 남긴다. 작업실은 그 진단을 읽어(짐작하지 않는다) `unsupported`와 까닭(`fontInfo().material`로 그림 자소인지 잉크 상자 없는 글꼴인지)을 보이고, 비교 칸 읽기에 "디자인을 받지 않음"과 `data-design-status`를 붙인다. 미리보기를 끈 채로도 비교 칸(펼쳤을 때)이 같은 진단을 주면 켤 수 없게 한다. 런타임이 아직 디자인을 읽지 않았으면(문서 밖·글꼴 CSS가 오는 중) `pending`이다.
- **출처 한 줄**: 자소를 고르면 선택 칸 아래에 `traceOf`의 첫 요청(디자인·소스·방법·조립식·규칙·상태·글꼴 확인)을 한 줄로 보인다(§13.5 최소 — 다섯 질문은 아래 "디자인 도구"의 출처 패널).
- **파일**: "디자인 JSON 저장"은 JSON 칸의 디자인을 `<id>.design.json`으로 내려받는다(`validateDesign`으로 검사만 하고 등록하지 않는다 — 검사 오류가 있어도 건수·첫 오류 경고와 함께 저장하고, 읽을 수 없는 글은 거부). "디자인 JSON 열기"는 같은 형식을 읽고, 글꼴 프로젝트 파일이면 "프로젝트 열기"로 안내한다. 파일 줄은 정밀 모드에 있다. 디자인의 '페이지용 코드 복사'와 '디자인 JSON 복사'는 뺐다(S3 ⚑5) — 페이지 코드는 머리 막대 '내보내기 ▾ → 내 페이지에 쓰기'(그림 세트 줄까지 든다), JSON은 저장으로.
- **창구**: `FontStudio.design` — `json()`·`text()`·`name()`·`status()`·`setJson`·`setMode(mode, params)`·`setLayout(profile)`·`resolveConflicts(drop|flatten|cancel)`·`setApplied`·`undo`·`redo`·`save`·`fold`·`compare()`·`identity()`·`busy()`. `FontStudio.settled()`가 `busy()`(비교 칸 재기·그림 세트 받기)를 기다린다. DOM 상태는 `[data-studio-design]`의 `data-design-state`(applied·off·invalid·unsupported·pending·unavailable)·`data-design-layout`·`data-design-mode`·`data-design-name`·`data-design-revision`.
- **편집 창구(계획 F0)**: 모든 바꾸기(재료·배치·충돌 정리·JSON 적용·문맥 규칙 지우기·뒤 묶음의 편집)는 한 길(`commit`)을 지나 이름 붙은 기록 한 줄이 된다(`재료: …`·`배치: …`·`JSON 적용` 등, 프로젝트·초안을 열면 비운다). 뒤 묶음의 계약은 `FontStudio.design`의
  `edit(label, mutate, { participants, impact, note, tone })` → `Promise<{ ok, design, errors, impact, cancelled }>`(검사 → `impact`면 영향 처리기(`setImpactHandler`, 기본은 받아들임·`lastImpact()`) → 참가자 → 등록 → 기록 → 적용 → `change` 사건; 검사에 걸리면 기록하지 않고 마지막 정상 디자인을 둔다),
  `begin(label)` → `{ update(mutate, participants), commit(), cancel() }`(update는 미리보기만 — 참가자 `preview`와 임시 이름 — commit에서 한 줄, cancel이면 아무것도 남지 않는다),
  `validate(json)`, `lease(json)` → `{ name, update, release }`(`studio-tmp-<n>`), `participant(name, { get, set, preview? })`(디자인 JSON 밖 상태 — 되돌리기·다시·건너뛰기(`history()`·`jump(id)`)가 함께 되돌리고, 프로젝트·초안의 `design.participants`에 상태가 있는 것만 실린다. 열 때는 디자인보다 먼저 넣고, 늦게 붙는 참가자는 마지막으로 연 상태를 따라잡는다),
  `on/off("change" | "status")`(`change`: `{ json, name, label, cause: edit|undo|redo|jump|restore|json }`), `addBusy(fn)`(`settled()`가 기다린다), 바꿔 끼우는 `renderTrace(node, trace)`, 런타임 기능 `runtime: { validate, replace, unregister, designs }`이다. 프로젝트 형식은 그대로 v2(`participants`만 더한다)

- **진단·저장**(2026-10-18 S0): 런타임 `validateDesign`의 진단(warnings)을 버리지 않는다 — 원칙 안내 칸(FIXED_CONTEXT·FIXED_VARIATION은 런타임 판정, 진단을 주지 않는 옛 런타임은 작업실 사본)과 진단 목록 `ul[data-design-warnings] li[data-severity=warning][data-code]`에 한국어로 보인다. '디자인 JSON 저장'은 복사와 같이 마지막 정상 디자인을 `<id>.design.json`으로 내려받는다. JSON 칸에 적용하지 않은(검사에 걸린) 글이 있으면 저장하지 않고 '적용하고 저장 / 마지막 정상 디자인 저장'을 묻는다(`[data-design-save-choice]`, `design.save(choice)`는 물을 때 `null`). 복사는 그 글을 빼고 알린다.

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
- **그리기 8 → 24 → 40**(F5, §13.3): 그림 문서(`font-kku-drawing` v1, `set: studio-draw-<8hex>`, 칸 `ㄱ`·`ㄱ@bar|@cho|@jong`마다 부분·도형·출처 authored|detached|imported)는 디자인 참가자 `drawings`다 — 상태가 들어올 때마다(편집·되돌리기·열기) 세트를 디자인보다 먼저 `registerJamo`로 다시 등록한다. `start()`는 빈 문서만 만들고(디자인·기록 그대로) 첫 칸을 넣는 편집 하나가 디자인을 그 세트로 돌린다('ㄱ 그리기 · 그림 세트로'), 목표 단계를 다 그리면 `editor.authoringTarget`이 다음 단계로 간다. 화면은 단계 줄(`[data-draw-stage]` have/total, `[data-draw-helper]` ㆍ) · 문장에 나온 자모부터 제안(`[data-draw-proposals]`) · 자모 41칸(`[data-draw-grid]`, `data-status` = 그림 출처 또는 지금 디자인의 `planJamo` 결과) · 칸 편집기(0–100 격자, 기기 글꼴 참고 글자, 선·꺾은선·펜·타원·고르기 — 포인터 한 번이 `begin` → commit 기록 한 줄, Escape 취소, 문맥 칸, 부분 옮기기·크기·지우기, SVG 가져오기는 `sanitizeSvg` 허용 도형만 넣고 버린 것을 목록으로, AI 요청 글 복사) · 문장 미리보기 둘(지금 디자인 / 원형 8만 — 보이는 칸을 그린 칸 ∩ 원형 8로 줄인 lease). 넓은 화면에서는 편집기가 오른쪽 두 줄을 차지하고 문장 미리보기가 자모 칸 아래로 온다. 칸 지우기는 영향 목록을 묻는다. 차례는 막지 않는다(ㅃ을 먼저 그려도 된다). 그림 세트 재료가 아니면 디자인 칸에 들어가는 단추(`[data-draw-entry]`)가 보인다. `FontStudio.draw = { start, attach, open, doc, setCell, removeCell, importSvg, select, selection, movePart, scalePart, removePart, progress, proposals, statuses, statusOf, sentence, tool, on, off, busy }` 편집 칸은 미리보기에서 고른 자모(41칸에 있으면)로 열리고, 칸·제안·문맥 단추·미리보기 새 선택·`draw.select`로만 바뀐다 — 획은 칸을 옮기지 않는다(2026-10-18 S0 D7). 문맥 단추는 바탕·`@bar`·`@jong`이다(만들 길이 없던 `@cho` 이름을 걷었다. API·묶음으로 든 `@cho` 칸은 런타임이 쓰지만 편집기에 단추가 없다).
- **독립 SVG로 떼어 내기**(F6, §13.3): 그리기 탭에서 고른 자모가 조합·획이면 `button[data-draw-detach]`가 보이고, 누르면 지금 그린 모양 그대로 조각마다 독립 SVG 칸(`detached`, `from.recipe`·`from.parts`)으로 편집 하나에 넣는다('<자모> 독립 SVG로'). 문맥마다(바탕 X+ㅣ · @bar X+ㅡ · @jong 으+X, 모음은 홀로) 화면 밖 shadow root 무대에 그려 `[part=hoek]` 조각을 노드 em 인라인 변수(`--fy-el-x/y/bw/bh`·`--fy-el-x/y/len/angle`·`--fy-el-cx/cy/rx/ry`)와 `svg[part=vector]` viewBox로만 읽는다(`getBoundingClientRect`를 쓰지 않는다). @bar·@jong 칸은 바탕 칸과 모양이 다를 때만 저장한다. 그 자모를 compose로 묶는 규칙이 있으면 까닭과 '규칙 빼기' 상자(기본 켬)로 같은 편집에서 뺀다. 그 뒤 위 원본(ㅋ의 ㄱ)을 고쳐도 따라가지 않는다 — 조각 보정은 떼어 낸 그림에서만 한다. `FontStudio.drawDetach = { capture, detach, inspect, target, busy }`
- **글꼴 팔레트**(F7, §6.5·§13.4·§15.5): 항목 = 글꼴 인스턴스(디자인의 font 소스 family·weight·style). 새 id는 `pal-<n>`(가장 큰 n + 1, 뺀 id를 다시 쓰지 않는다)이라 재료 패널 `withMode(font)`의 쓰지 않는 `font-x` 지우기에 걸리지 않는다. 카드(`[data-palette-instance]`의 `data-ready|identity|measurement`)마다 그 인스턴스 하나만 쓰는 lease 미리보기, 준비 상태(`@font-face`로 실렸나 — 로컬 이름은 `local-unverified`, `document.fonts.check()`는 증명으로 쓰지 않는다), 측정·출처 확신(기록의 measurement·identity를 센다). 자모 매트릭스(`[data-palette-matrix][data-role]`, 초성 19 X+ㅏ · 중성 21 ㅇ+X · 종성 27 아+X)는 인스턴스마다 shadow root 하나를 돌려 쓰고, 칸(`[data-palette-cell]`의 `data-chosen|locked|effective|warn`)을 누르면 pick 규칙(다시 누르면 풀기), 행 머리는 잠금. 씨앗 섞기는 `autoMix`(같은 씨앗 같은 JSON, 잠근·고른 칸 건너뜀), 항목 빼기는 `removeSource`를 영향 확인으로. 낱자는 기기 글꼴 경로가 디자인으로 그리지 않아 매트릭스에 두지 않는다. `FontStudio.palette = { instances, add, remove, choose, lock, mix, clearMix, matrix, role, refresh, busy }`
- **묶음**(F8, §13.6·§17.3·§18.1): 디자인 JSON과 그 디자인이 쓰는 작업실 그림을 한 파일 `<id>.fkk-bundle.json`(`font-kku-design-bundle` v1)으로 저장하고 연다 — 디자인 JSON은 그린 세트를 이름으로만 가리켜 혼자서는 다시 그릴 수 없어서다. 글꼴 파일은 싣지 않는다. 열기는 바이트 상한(2MB) → JSON → 맨 위 열쇠 허용 목록 → 꼬리표·`url()`·`javascript:`·`data:` URI·`@import`·`@font-face` 거절 → 그림마다 `normalizeDoc` → `validateDesign`을 모두 통과한 뒤에만 이름 겹침을 풀고(`studio-draw-<새 8hex>`, `assetSet`을 고쳐 씀) 편집 하나 '묶음 열기'로 넣는다 — 걸리면 디자인·그림·기록 그대로이고 까닭을 칸마다 보인다. 사전 검사(`[data-bundle-preflight] li[data-code][data-severity]`)는 역할 쌍 67개를 지금 디자인으로 `planJamo`하고 글꼴 재료는 identity를 센다(reproducible = 오류·원소 대체·글꼴 소스 없음). 페이지용 코드(그림 세트 줄 + `registerDesign` + `--fy-design`, 실험)와 그림 세트 `.jamo.js`(`profiles/*.jamo.js`와 같은 `FontKkuJamo` 줄)를 내보낸다. `FontStudio.bundle = { build, save, open, preflight, snippet, jamoJs, exportJamo, copySnippet, last, busy }`
- **편집 기록·영향 목록**(F9, §13.6): 기록 칸(`ol[data-history-list]`)은 항목마다 이름·지난 시간, 지금 자리(`data-current`)·되돌린 항목(`data-undone`), 맨 위 "처음 상태"를 보이고 누르면 그 자리로 간다(`design.jump`). 검사에 걸린 편집은 기록에 없고 칸이 그렇다고 보인다. `design.setImpactHandler`가 영향을 묻는 편집(`edit`의 `opts.impact` — 소스 빼기·칸 지우기)마다 `impactOf`로 전·후를 견주고, 오류·원소로 떨어짐·그린 원본을 잃음이 있거나 쓰던 소스를 빼면 `dialog[data-impact]`(심각한 차례, 60줄 넘으면 "+n곳 더", 취소가 기본 초점, Esc도 취소)로 묻는다 — 취소하면 디자인·참가자·기록 그대로. 그 밖에는 적용하고 "n개 자모가 바뀜"을 알린다. JSON 적용처럼 묻지 않는 편집이 소스를 빼면 막지 않고 알림 칸(`[data-impact-info]`)에 보인다. `FontStudio.history = { entries, jump, impactOpen, impact, answer, info, open, refresh }`
- **잠금 저장 자리**: `design.editor.locks = [{ jamo, role?, part? }]`. `validateDesign`·정규화가 `editor`를 보지 않아 그리기는 그대로이고 revision만 바뀐다 — 계획의 대안(잠금을 참가자로)은 쓰지 않았다. 조립식·binding 비교와 글꼴 팔레트가 같은 잠금을 읽고, 자동 섞기는 잠근 칸을 건너뛴다

## 편집 범위와 결과

| 범위 | 쓰는 곳 | 변수 | 의미 |
|---|---|---|---|
| 자리 가족 | 부모 자리 값을 공급하는 바탕 요소 규칙(없으면 기본 바탕 요소 규칙) | `--fy-<부모>-*` (예: `--fy-tl-top`) | 대체, 자기 값을 선언한 가족원에는 닿지 않음 |
| 이 자리 모두 | 그 자리 값을 공급하는 바탕 요소 규칙(없으면 기본 바탕 요소 규칙) | `--fy-<slot>-*` | 대체 |
| 이 자리의 이 자모 | 값을 공급하는 자모 규칙, 없으면 `@layer font-kku.jamo` `[data-fy-pos][data-jamo]` | `--fy-<slot>-*` | 대체 |
| 이 자모 어디서나 | 값을 공급하는 자모 규칙, 없으면 `@layer font-kku.jamo` `[data-jamo]` | `--fy-jamo-dx/dy/scale-x/scale-y/rotate/size/weight/stroke/clip` | 누적(크기·비율은 배수), 굵기·자르기는 대체 |
| 같은 짜임 모두 | `@layer font-kku.context` `[part="glyph"][data-layout-key] [data-fy-pos][data-jamo]`(제 규칙, 중립값에서 시작) | `--fy-case-*`(자모와 같은 아홉) | 누적(ADR-035) |
| 문맥 | 같은 조건의 문맥 규칙(예전 작업실이 쓴 `[part="glyph"]:has(이웃)` 꼴 포함), 없으면 `@layer font-kku.context` `[part="glyph"][data-fy-at-<자리>][data-fy-at-<자리>="<자모>"] [data-fy-pos][data-jamo]`(이웃 자모를 글자 칸의 자리 자모로 — 옛 꼴과 특이도가 같다) | `--fy-ctx-*` | 자모와 같다 |
| 이 글자만 | `@layer font-kku.context` `[part="glyph"][data-source] [data-fy-pos][data-jamo]` — 같은 음절은 어디서나 함께 | `--fy-syl-*` | 누적(ADR-035) |

- **범위 사다리**(2026-10-18 S4, [ADR-035](../ADR/ADR-035-scope-ladder.md)): 표는 넓은 것부터다. 좁은 범위가 늘 이긴다 — 보정 범위(이 자모 어디서나·같은 짜임 모두·문맥·이 글자만)는 수준마다 제 변수라 더해지고(굵기·자르기는 좁은 것이 대체), 선택자 특이도와 상관없다. 절대 범위(자리 가족·이 자리 모두·이 자리의 이 자모)는 더 좁은 규칙이 같은 자리 변수를 다시 적으면 가려진다 — 작업실은 거절하고 가린 규칙의 범위 이름과 먹는 가장 가까운 좁은 범위를 보인다('… 범위로 고치기', 거절의 `suggestScope`). 예전 작업실이 같은 짜임·이 글자만에 쓴 `--fy-ctx-*`는 그대로 읽는다.
- **고정 모양의 사다리**: 세벌식 '이 자모 어디서나'(tune 계층 `--fy-jamo-*`, 짜임 속성 없는 선택자 — 모든 짜임에 같은 보정, 원칙을 깨지 않음) < 원칙 범위(= 같은 짜임 모두) < 이 글자만. 직결식은 원칙 범위 = 이 자모 어디서나 < 같은 짜임 모두 < 이 글자만. 넓은 범위는 좁은 손 보정을 뺀 모양 값에서 시작한다.
- **맞춘 자리에서 시작**: 짓는 방식 맞춤(ADR-034 §5)이 옮긴 노드의 자리를 절대 범위에 처음 적으면 지금 보이는 자리(`FontKku.splitFit`)에서 시작하고 가로·세로 위치(배율이 다르면 배율도)를 같은 편집에 함께 적는다. 값 칸의 보이는 값도 그 옮김을 넣는다.
- **보정 범위의 크기·배율은 배수**: 크기 칸·`set`에 em·px 길이를 주면 지금 보이는 크기에 맞춘 배수로 바꾼다. 그 밖(%·배율에 길이)은 `VALUE_INVALID`(kind `factor`).

- **공급 규칙 우선**: 자모·문맥 범위는 지금 그 노드의 값을 공급하는 같은 레이어 규칙을 고친다. 그 규칙이 공유(`:is([data-jamo="ᅥ"], [data-jamo="ᅧ"])`, 여러 자리)이면 공유 경고와 함께 "공유 규칙 고치기 / 이 자모만 새 규칙으로 분리"를 고른다. 분리 규칙은 이기는 것이 보장될 때만 만든다(같은 레이어, 같거나 높은 특이도 + 뒤 순서; 공유 규칙이 자리까지 지정하면 `[data-fy-pos][data-jamo]`로 좁힌다). 새 규칙은 현재 해석값에서 출발한다(대체이므로).
- **가려짐**: 범위의 규칙이 선택한 자모에 보이지 않으면(더 높은 레이어, 더 구체적인 규칙, `!important`, 노드에서 자리 변수를 재선언, 가족원의 자기 자리 값) 편집을 거부하고 이유를 보이며 "대신 L… 규칙 고치기"를 제안한다.
- **반영 확인**: 편집 뒤 선택한 노드의 계산된 변수를 기대값과 비교한다. 다르면 "편집이 반영되지 않았습니다 — … 규칙(또는 글꼴 밖 CSS)이 이 값을 덮음"을 보인다(`data-edit-effect="none"`).
- 드래그와 방향키(0.1%, Shift 1%)는 글자 상자 기준 `%`를 더한다. `%` 리터럴은 그대로, em 값은 em 항을 두고 `%` 항을 더한 `calc()`가 된다. `var()` 같은 식은 살펴보기에서 직접 고친다. 드래그 한 번은 되돌리기 한 단계다(개수·크기는 하나의 기록이 자른다).
- **잉크로 고르기**(2026-10-17, [작업실 검토](../NOTES/studio-direct-manipulation-review-2026-10-16.md) §2): 자모 노드는 글자 칸만 한 em 상자라 뒤 노드가 앞 노드를 덮는다 — 누른 점에 그 자모의 잉크가 있는지로 고른다(`FontStudio.pickAt(x, y)` → `{ nodes, tiers: { ink, near, box } }`). 원소 재료는 획 상자(`[part="element"]`)를 브라우저가 맞히고(`elementsFromPoint`, 회전·둥근 모서리까지), 그림(SVG)은 도형의 `isPointInFill`·`isPointInStroke`, 자소판(배경·마스크 그림)은 그 칸 화소, 글자(기기 글꼴 맞춤의 `::before`, 그 밖의 노드 글자)는 캔버스 한 칸에 그 변환대로 다시 그려 잰다. 그 점에 잉크가 없으면 둘레 3·6·10px(가는 획·그림자 칠), 그래도 없으면 잉크 상자, 끝으로 em 상자 차례. 같은 점을 다시 누르면(또는 Alt+누르기) 그 점 아래 다음 자모로 돈다. 잰 값(같은 점에서 맞게 고른 비율, 평균): 기본 세벌식 0.68 → 0.997, gothic 0.57 → 0.99, sprite-system 0.40 → 0.99, pilgi 0.40 → 0.99, riso(기기 글꼴) 0.59 → 0.98.
- **손잡이 틀**: 고른 자모의 잉크 상자에 틀(`[data-studio-handles]`, 미리보기 위 — 칠하지 않는다)을 두고 오른쪽 아래 손잡이(`[data-studio-handle="size"]`)는 크기(끈 거리 비만큼 배수), 위 손잡이(`rotate`, 위 칸이 모자라면 틀 아래로)는 회전이다. 그 범위에 크기·회전 대상이 없거나 받지 않으면 손잡이를 감추고 까닭을 틀 툴팁(`data-reason`)과 편집 대상 칸에 둔다(`data-size`·`data-rotate` `off`). 키보드 `+`·`−`(1.05배)와 `[`·`]`(1°, Shift 15°)도 같은 값을 고친다.
  - (S4, 2026-10-18) 누르는 상자는 데스크톱 16px, 굵은 포인터(휴대폰) 44px이고 보이는 꼭지(`::before`)는 그 가운데 12·22px — 꼭지 자리는 전과 같다(검토 §3: 12·22px라 작았다).
  - (S4) 회전은 돌린 양을 5°씩(Shift 15°씩) 맞춘다. 돌리는 축은 잡은 점에서 80px(`ROTATE_RADIUS`) 이상 떨어뜨린다 — 작은 글자는 꼭지가 중심에 가까워 같은 (24,16)px 끌기가 −22°·33.5°·42.5°로 튀었다. 이제 반지름이 80px보다 작은 글자는 같은 끌기가 같은 각도다(gothic 의·회·한 모두 15°).
  - (S4) 끄는 동안 말풍선(`[data-studio-handle-tip]`)이 회전 "회전 +15° → 15° (5°씩 · Shift 15°)", 크기 "크기 ×1.10 → 0.68배", 옮기기 "가로 +1.2% · 세로 −0.5%"를 보인다. 뗄 때 숨는다. `FontStudio.dragState()`에 `turn`·`factor`·`tip`.
- **끄는 동안은 시트만**: 끌기·손잡이는 시작할 때 편집 대상을 한 번 정하고, 끄는 동안 그 레이어·선택자·변수만 담은 끌기 시트(글꼴 시트 뒤에 붙는 constructable stylesheet)를 프레임마다 바꾼다 — 글꼴 CSS를 다시 해석하거나 미리보기를 다시 그리지 않는다(`data-render-seq` 그대로, `data-dragging`). 뗄 때 글꼴 CSS에 한 번 적고 시트를 비운다(되돌리기 한 단계, 반영 확인). 위치 %가 글자 칸이 아닌 상자를 기준으로 풀리는 글꼴이 있어 처음 8px 넘게 움직였을 때 실제 움직임으로 축마다 한 번 맞춰 자모가 포인터를 그대로 따라온다. 끌기 한 걸음(움직임 + 두 프레임): gothic 84 → 51ms, 기본 세벌식 99 → 50ms(헤드리스 Chromium, 두 프레임 약 33ms 포함).
- **손가락**: 미리보기는 쪽 넘기기를 받는다(`touch-action: pan-x pan-y`, 전에는 `none`이라 미리보기 위에서 쪽이 넘어가지 않았다). 고른 자모의 글자 칸과 손잡이만 `touch-action: none`이라 손가락으로 끈다. 다른 자모는 두드리면(뗄 때) 고른다 — 그 사이 쪽을 넘기면 고르지 않는다.
- 크기·굵기·획 두께·자르기도 자모·문맥 범위(이 짜임·이 글자만 포함)에서 고친다(ADR-030 §7, 2026-10-17) — 크기는 배수(새 칸 자리 표시 1), 획 두께는 더함(0, 원소·그림 재료의 획 굵기에도), 굵기·자르기는 대체. dilate(그림 자소)만 보정 변수가 없다.
- **기본 범위와 한 손짓 한 대상**(2026-10-18 S0, [PLAN-STUDIO-002](../PLAN/studio-redesign.md)): 네모꼴의 기본 범위는 '이 짜임의 이 자모'(`case`)이고, 그 범위가 그 자모에 없으면 먹는 가장 좁은 범위다. 고정 모양(세벌식·직결식)은 '원칙 범위' 그대로. 끌기·크기·회전과 그 값 칸은 한 편집 계획을 함께 쓴다 — 하나라도 막히면 넷 모두 이유와 함께 거절하고 크기·회전 손잡이를 감춘다(전에는 이동은 거절하고 회전만 바탕 요소 자리 변수에 적어 다른 글자까지 돌았다). '대신 … 고치기'는 넷 모두를 그 규칙으로 보낸다.
- **바뀔 곳**: 고른 범위(마우스를 올린 범위 포함)가 바꿀 미리보기 자모에 점선 상자를 치고 편집 대상 칸에 "미리보기 n곳 · 현대 한글 n자"를 보인다(쉬운 판도 "… 곳이 바뀝니다(점선) · 현대 한글 n자"). 끄는 동안에도 남는다(`[data-studio-affected-layer]`, `[data-studio-affected-count]`, `FontStudio.affected()` — `total`·`totalState`, `[data-studio]`의 `data-affected-total`).
  - (S4, 2026-10-18) 현대 한글 수는 지연 싣는 `studio/font-studio-reach.js`(`FontStudio.reach`)가 센다. 11,172자의 뼈대(글자·몸통·묶음·자모 노드와 그 도장 — 재료 없이)를 화면 밖 문서에 나눠 짓고(1,200자씩 쉬는 틈마다 — 처음 한 번 약 170ms, 원소 71,688개), 편집 대상 규칙의 선택자가 닿는 음절을 센다(한 번 약 4ms). 뼈대는 런타임 자료로 짓는다: `FontKku.createTextModel`(나누기·머리 음절·짜임)과 `FontKku.placementTables`(자리 — 모음 쪽은 모음 나누기, 받침 쪽은 받침 나누기 표). 렌더러의 부분 이름과 같은지는 `tests/test_studio_s4_ui.py`가 실제 그린 DOM과 견준다(나누기 넷·세벌식 첫 화면). 바탕 요소 속성(`data-fy-font`·`data-fy-layout` 등)은 셀 때마다 베끼므로 뼈대는 나누기가 바뀔 때만 다시 짓는다.
  - 바탕 요소 규칙(자리 전체·자리 가족)은 그 자리 변수를 쓰는 자리의 음절로 센다. 더 가까운 자리 값이나 바탕 요소 아래 규칙이 정하는 음절은 뺀다(S5-B, 2026-10-19 — 미리보기 수와 같은 판정, 아래 '규칙 목록과 맞지 않는 규칙'). 미리보기 수가 먼저 보이고 그동안 "현대 한글 세는 중…".
  - 예(gothic 의 회 값 한글, 회의 ᄒ): 이 글자만 1 · 이 짜임의 이 자모(split-right:none, 자리 tls) 7(합자 모음 일곱 × 받침 없음) · 이 자모 어디서나 588(첫소리 ᄒ = 21 모음 × 28 받침, 끝소리 ㅎ은 다른 자모 ᇂ).
- **값 칸 = 지금 보이는 값**(S4, 2026-10-18): 정밀 모드 값 표(머리 '보이는 값')의 칸은 노드가 지금 그리는 값이다 — 규칙에 적힌 값이 아니라 자리 사슬의 값(노드에서 다시 적은 값 포함)에 보정을 합친 값(검토 §3: gothic 세로 위치 칸 −18.4%인데 실제 −20.3%). 셈은 코어 CSS의 합치는 규칙대로 모델의 해석(`resolver.entry` — 값 + `offsets`)에서 한다: 위치·회전·획 두께는 더하고, 크기·배율은 곱하고, 굵기·자르기는 가장 좁은 보정(`offsets`의 마지막)이 대신한다. 칸에 친 값은 '보이게 할 값'이다 — 고른 범위의 대상 값을 (친 값 − 보이는 값)만큼 옮긴다(배수는 비로). 다른 기여가 없으면(대상 값 = 보이는 값) 친 글 그대로 적는다(`0` 같은 단위 없는 값도). 셀 수 없으면(`var()`, 단위 섞인 곱) 전처럼 적힌 값을 보이고 고친다(칸의 `data-value-mode="written"`). 칸 툴팁에 고치는 곳과 지금 적힌 값. 창구: `FontStudio.visibleValue(속성, 값)`, `api.edit({ visible })`. `FontStudio.setValue`·`api.edit({ set })`은 전처럼 적힌 값이다. 고정 모양의 모양 값 칸은 보정이 위치·크기에 더해지지 않아 전과 같다. 한계: 네모꼴의 기본 아닌 나누기 맞춤(런타임이 그림을 옮김)은 셈에 넣지 않는다.
  - 속성 이름은 한국어(가로 위치·세로 위치·크기·가로 배율·세로 배율·회전·굵기·획 두께·자르기·획 넓힘, 변수 접미사는 툴팁). '그릴 문자'·'문자 후보' 줄은 글자로 만들기 글꼴(글꼴 CSS에 `glyph-text`·`glyph-candidate`가 있거나 미리보기 자모가 매핑됨)에서만.
- **머리 음절 안 조각**(S4, 2026-10-18 — 검토 2026-10-16 §3 '의의 ㅇ 노드가 없다'): 머리 음절 노드(나누기 '머리 음절'의 으·호)를 고른 채 같은 점을 다시 누르면 그 안 조각(첫소리 또는 모음 묶음)을 점선으로 보이고 그 자리에 '낱으로 나눠 고치기'를 낸다(`[data-studio-piece]`, 쉬운 모드도). 조각만 고칠 글꼴 CSS 자리는 없어서다. 누르면 짓는 방식의 모음 나누기만 낱 모음으로 바꾸고(받침 나누기·조각 깊이는 그대로 — `FontStudio.composition.set`, 기록 한 줄) 그 글자의 그 자모(의의 ᄋ)를 고른다. 한 번 더 같은 점을 누르면 전처럼 그 점 아래 다음 자모로. 조각 상자는 원소 재료의 획 묶음(`data-fy-head-part`), 묶음이 없는 재료는 머리 음절의 위(첫소리)·아래(모음 — 머리 음절의 모음은 가로 모음)로 가른다. 창구: `FontStudio.piece()`·`choosePiece(x, y)`·`splitPiece()`.
- **되돌리기 단축키**: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z·Ctrl+Y(입력 칸 안에서는 그 칸의 것)는 하나의 기록 전체의 마지막 일이다(`FontStudio.undoLast()`·`redoLast()`, S2 — 아래 '하나의 기록'). 머리 막대의 '되돌리기'·'다시'도 하나의 기록 전체의 마지막 일이고 툴팁에 그 일의 이름을 보인다(S2 머리 막대). 글꼴 모양을 통째로 바꾸는 '네모 문맥으로'·'디자인 끄고 글꼴 CSS로'는 먼저 묻고, 바꾼 뒤 Ctrl+Z로 돌아온다고 알린다.
- **자동화 결과**: `FontStudio.setValue(속성, 값)`은 `{ok, code, message}`를 돌려준다 — `PROPERTY_UNKNOWN`(모르는 속성, `data-edit-effect="refused"`)·`NO_SELECTION`·`NO_TARGET`·`EDIT_BLOCKED`·`EDIT_FAILED`. `undo()`·`redo()`는 `{ok}`.
- 자소를 누르면 미리보기가 초점을 받는다. 범위 라디오(또는 라벨)를 포인터로 고르면 초점이 미리보기로 돌아와 방향키가 자소를 옮긴다. 키보드로 라디오를 오갈 때는 방향키가 라디오를 바꾼다.

## 자동화 계약 v1
2026-10-18 S1([PLAN-STUDIO-002](../PLAN/studio-redesign.md) '자동화 계약 v1', ⚑7). 바깥(호스트 페이지·개발·검수 사이트 [ADR-033](../ADR/ADR-033-dev-review-site.md)·에이전트·나중의 대외 서비스)은 `FontStudio.api`만 쓴다. `window.FontStudio`의 나머지는 시험용 안쪽 창구로 남는다(이름이 바뀔 수 있다).

| 파일 | 역할 |
|---|---|
| `studio/font-studio-api.js` | `FontStudio.api`(얼린 객체, `version: 1`). 화면 편집 함수를 부르고 결과를 모은다 |
| `authoring/font-studio-refusals.js` | 거절 표 `FontStudioRefusals`(authoring `Refusals`) — 코드마다 한국어 한 줄·해결 길·tone. `make(code, params)`·`line(refusal)` |
| `authoring/font-studio-model.js` | `declarationDiff(앞 CSS, 뒤 CSS)`·`contentRev(글)` |
| `studio/font-studio.js` | `FontStudio.apiSupport`(api 모듈만 쓰는 안쪽 창구 — 미리 셈 `capture`, 결과를 돌려주는 `nudge`·`step`, 범위·문맥, 기록 줄, 행위자), 훅 `change`·`mode`, 보기 `mode()`·`setMode()` |
| `studio/bridge.js`, `studio/mount.js` | mount 핸들의 `call(이름, …인자)`·`on(사건, fn)`·`off`, 옵션 `mode` |

**규칙**
- 모든 동작은 Promise로 결과 객체를 돌려준다. 거절은 결과다 — `refused: [{ code, message, hint?, detail? }]`. 거부(예외)는 잘못된 호출(`TypeError`)과 시간 초과(`error.code === "TIMEOUT"`)뿐이다. `on`·`off`만 바로 돈다.
- 화면 알림 한 줄과 `refused[].message`는 거절 표의 같은 항목에서 나온다. 경고 줄은 `"⚠ " + message + "." + (hint ? " " + hint + "." : "")`, 안내(되돌릴 것 없음 등)는 표시 없이. `FontStudio.setValue`의 `{ok, code, message}`(S0 D11)도 같은 표다(`hint`·`detail`을 더함). 비미리 셈 거절은 사람 화면에도 그 줄을 띄우고 `data-edit-effect="refused"`.
- 편집은 화면과 같은 길이다: `visible`은 정밀 모드 값 칸(보이는 값 — S4, `applyVisible`), `set`은 그 범위의 대상 변수에 적을 값(`applyInput`), `nudge`는 방향키(`nudge`), `scale`·`rotate`는 `+ − [ ]` 키(`stepProperty`). 값 칸에 친 값과 `api.edit({ visible })`은 같은 선언 diff·같은 글을 낸다(시험). (S4 전에는 값 칸이 적힌 값이라 `set`과 같았다.)
- **모두 아니면 하나도**: `edit`은 먼저 모든 손짓을 미리 셈한다(`capture` — `commit`이 글꼴을 적용하지 않고 셈한 글만 받아, 다음 손짓이 그 위에서 대상을 정한다). 하나라도 거절되면 아무것도 바꾸지 않고(고른 범위도 되돌린다), 모두 받으면 편집 한 번 = 기록 한 줄로 적용한 뒤 반영 확인(`verifyEdits`)을 한다. `dryRun: true`는 셈만 한다 — 글꼴 CSS·기록·`dirty`·초안·알림·범위가 그대로다. 미리 셈은 계산값을 볼 수 없어 `effect: null`, `overlaps: null`.
- 행위자(`setActor({kind: "human"|"agent", id})`, 기본 `{human, null}`)는 그 문서의 이후 편집 모두(화면 편집 포함)에 붙는다 — CSS 기록 줄, 디자인 기록 줄(api가 줄 id마다 기억), `change` 사건, 검수 기록(`records[항목].actor`, 선택 필드).

**동작**

| 동작 | 모양 | 돌려줌 |
|---|---|---|
| 고르기 | `select({ glyph, jamo, pos? } \| { glyph, node } \| { point: {x, y} })` — glyph는 미리보기 글자 차례(0부터)·음절 글자(`"의"`)·`{ source, nth }`(같은 음절 중 몇째, 기본 0), jamo는 `data-jamo`(`"ᄋ"`), point는 화면 좌표(`pickAt`과 같은 잉크 차례) | `{ ok, refused, selection: { index, source, nth, jamo, pos, node }, candidates, scope: { current, chosen, available: [{id, name}], contexts } }` |
| 편집 | `edit({ scope?, context?, set?, visible?, nudge?: {dx, dy}, rotate?, scale?, dryRun?, note?, timeoutMs? })` — scope는 범위 id 또는 `"default"`(기본 범위로) | `{ applied, dryRun?, refused, changes: [{ layer, selector, property, before, after, line }], affected: { preview, total(현대 한글 음절 수, 셀 수 없으면 null — S4), scope }, lint: { errors, warnings, findings }, overlaps, rev, effect, settled? }` |
| 디자인 | `design.edit(label, mutate, { dryRun, participants, impact })` — 함수를 받으므로 같은 문서 안에서만 | `{ applied, refused, errors, warnings, design, rev }` |
| 그림 | `draw.importSvg({ "ㄱ": svg, … } \| [{ key, svg }] \| 글, { dryRun, label })` — 모두 통과해야 칸 여럿을 편집 한 번으로. 글 하나(AI 답 — 글 + `<svg>` 여럿, S5-A)는 칸 이름(`data-jamo`·`id`·`<title>`·바로 앞 줄)으로 나누고, 이름 모름·겹침·도형 거절이 하나라도 있으면 아무것도 넣지 않는다 | `{ applied, refused, cells: [{ key, ok, shapes, warnings, rejected, index?, state?, from? }], rev }` — 글이면 덩어리마다 `state` new\|overwrite\|unknown\|duplicate\|refused, 거절은 덩어리마다 `SVG_REFUSED` |
| 기록 | `undo()`·`redo()`(Cmd/Ctrl+Z와 같은 `undoLast`·`redoLast`), `history()` | `{ ok, refused, entry: { kind }, rev }`, `{ ok, entries: [{ kind: css\|design\|sheet, label, actor, time, state: done\|undone }] }` — 기록을 하나로 합치는 것은 S2 |
| 사건 | `on(name, fn)` → 그만 듣기 함수, `off(name, fn)` | `change { cause, actor, rev, seq, label?, via? }` · `select`(고른 것이 바뀔 때) · `page { page }` · `mode { mode }` · `settled { seq, rev }` |
| 기다림 | `settled({ timeoutMs })`(기본 30초) | `{ ok, seq, rev }`, 시간이 다 되면 `TIMEOUT`으로 거부 |
| 검사 | `checks({ timeoutMs })`(기본 30초, S5-C) — 읽기만: 글꼴 계약 린트와 음절 안 잉크 겹침. 고치기 페이지 밖에서 미뤄 둔 검증은 청해 `settled()`처럼 기다린다. 편집·기록 줄·`change` 사건 없음 | `{ ok, settled, checksPending, lint: { errors, warnings, findings }, overlaps, rev }` — 시간 안에 끝나지 않으면 `settled: false`, `overlaps: null`(옛 값을 새 값처럼 주지 않는다) |
| 보관 | `snapshot()`(글꼴 묶음과 같은 일의 프로젝트 v2), `load(묶음\|프로젝트\|옛 형식 글, { timeoutMs })`(API 열기는 묻지 않음) | `{ ok, package, project, rev, contentRev }`, `{ ok, refused, settled, rev }` |
| 저장 | `save({ as?: "new"\|"same", name?, force?, quiet? })` — 작업실 '저장'과 같은 길(지금 저장 창구에 묶음 전체). 처음 저장이면 `as`가 있어야 한다. `quiet`는 저장 알림을 띄우지 않는다(자동 저장 — 개발·검수 사이트 고치기 화면) | `{ ok, refused, id, rev, contentRev?, file? }` · 거절이면 `SAVE_NEEDS_CHOICE`(`choices`·`suggestedName`)·`REV_MISMATCH`(`rev`) 등 |
| 행위자 | `setActor({ kind, id })` | `{ ok, actor }` |
| 검수 | `review.record({ key, verdict: pass\|needs-fix\|hold\|null, note?, actor? })`(화면 판정 단추와 같은 길), `review.list()` | `{ ok, refused, record }`, `{ ok, items: [{ key, title, text, status, verdict, note, at, actor }] }` |
| 보기 | `setPage(name)`, `setMode("easy"\|"precise")`, `setText(text)`, `info()` | `{ ok, refused, page }` 등, `info`는 판·글꼴·페이지·보기·행위자·rev·고른 것·범위·속성 이름·사건·원격 동작 목록 |

- `change`의 `cause`: `css`(글꼴 CSS — 편집·되돌리기, `via: edit|undo|redo`), `design`·`drawing`(디자인 바뀜 중 그림 문서가 바뀐 것), `sheet`(자소판 화소 기록이 바뀜), `review`(판정·메모·비교 기준·저장 환경·검수 문장), `load`(불러오기 — 그 사이 모듈이 되살린 것은 따로 내지 않는다). `rev`는 지금 글꼴 CSS의 `contentRev`, `seq`는 문서마다 하나씩 늘어난다. 바뀐 뒤 지금 화면에 필요한 일이 끝나면 `settled` 사건이 온다(`FontStudio.quiet()` — 고치기 페이지 밖에서 미뤄 둔 검증은 청하지 않는다). 검증까지 끝난 것을 기다리려면 `api.settled()`를 부른다. 개발·검수 사이트 자동 저장이 이 사건에 기댄다(PLAN-DEVSITE-001 D2).
- 지연 싣기(S1 모듈 수명): api는 쓰는 모듈(`draw`·`design`·`review`)을 부를 때 찾고, 없으면 `FontStudio.need(이름)`이 있을 때 기다린다. 그래도 없으면 `MODULE_UNAVAILABLE`.
- 다른 출처: `handle.call(이름, …인자)`는 자료만 오가는 동작(`info`·`select`·`edit`·`undo`·`redo`·`history`·`settled`·`checks`·`snapshot`·`load`·`setActor`·`review.record`·`review.list`·`setPage`·`setMode`·`setText`·`setComposition`·`draw.importSvg`)만 받는다 — 목록은 `font-studio-api.js` `REMOTE_METHODS`, `mount.js` `API_METHODS`, `mount.d.ts` `StudioApiCalls`가 같다(`tests/studio_api.test.js`). 사건은 `ready` 뒤부터 온다. 모르는 이름·잘못된 인자는 `TypeError`, 시간 초과는 `code: "TIMEOUT"`.
- 보기(⚑1 기본값): `?mode=` 또는 mount `mode`, 없으면 `shipped-save`(저장소 작업실)는 정밀, 그 밖은 쉬운. S1은 이름(`[data-studio]`의 `data-studio-mode`)과 `mode` 사건만 — 화면은 같다(나누기는 S3).
- 시험: `tests/studio_api.test.js`(거절 표·선언 diff·이름 목록), `tests/studio_mount.test.js`(call·on·mode), `tests/test_studio_api_v1.py`(같은 길·미리 셈·거절 문구·사건·mount).

## 하나의 기록 (S2)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) '하나의 기록', ⚑3(기본값: CSS·디자인·그림·자소판·검수를 한 시간축에). 2026-10-18 S2-A.

- **시간축 하나**: 작업실 문서 하나에 기록 하나다(`authoring/font-studio-transactions.js` `createTimeline`). 줄 하나 = `{ id, kind(갈래), cause, label, actor, time, bytes }`.
  - 갈래: `css`(글꼴 CSS — 값 칸·끌기·키·`api.edit` 손짓 하나), `design`(디자인 기록 한 줄 — 그림 문서가 바뀌면 `cause: drawing`), `sheet`(자소판 화소 한 단계 — 획·칸 작업), `review`(판정·메모·검수 문장·비교 기준·저장 환경), `action`(디자인 끄기).
  - 갈래마다 제 되돌리기 자료를 든다: CSS 글 기록(`Model.createHistory`), 디자인 기록(`createStore`, 참가자 포함), 자소판 조각(건드린 칸의 전·후 화소). 검수·작업실 동작은 자료(전·후 상태, 되돌릴 함수)를 시간축 줄에 맡긴다.
  - 디자인 기록의 줄 id(`h<n>`)는 시간축 줄 id와 같다.
- **두 줄**: 한 것(오래된 것부터)과 되돌린 것(끝이 다음 '다시').
  - Cmd/Ctrl+Z·Shift+Cmd/Ctrl+Z·Ctrl+Y, 편집 기록 칸의 되돌리기·다시, `FontStudio.timeline.undo()`·`api.undo()`는 **전체의 마지막 일**이다.
  - 갈래별 창구 — 디자인 칸 되돌리기·`design.undo()`, 자소판 '그리기 되돌리기'·`material.undo()`, `FontStudio.undo()`(글꼴 CSS) — 는 **그 갈래의 마지막 일**이다(예전 뜻 그대로). 머리 막대의 '되돌리기'·'다시'는 S2 머리 막대부터 전체의 마지막 일이다(전에는 CSS 갈래). 그 줄은 되돌린 것 끝으로 가서 다음 전체 '다시'가 먼저 다시 한다.
  - 새로 기록하면 다시 할 수 있던 것은 모든 갈래에서 버린다(남의 갈래는 `truncate`).
  - 입력 칸(input·textarea·select·contenteditable) 안의 Ctrl+Z는 그 칸의 되돌리기다.
- **크기 상한**: 줄마다 바이트를 센다(CSS는 바꾸기 전 글, 디자인은 전·후 JSON, 자소판은 칸 조각, 검수는 상태 JSON). 기본 192MB·1,000줄을 넘으면 가장 오래된 줄부터 버리고 그 갈래 자료도 함께 버린다(`dropOldest`). 갈래가 제 상한으로 스스로 버리면(자소판 160MB) 시간축에서도 뺀다(`dropOldestOf`). 갈래가 자료를 비우면(새 자소판) 그 갈래 줄을 뺀다(`forget`).
- **비우기**: 다른 글꼴·프로젝트·초안을 열면(`setCss` fresh) 기록을 비운다. 고친 것이 있으면 `guardLoad`가 먼저 묻는다(S0 D12).
- **메모 이어 치기**: 같은 검수 항목의 메모를 이어 치면 줄 하나로 모은다(`mergeKey`).
- **묶음**: `timeline.batch(label, fn)`·`begin/end` 사이의 기록은 줄 하나다. 되돌리기는 거꾸로 하고, 한 조각이라도 실패하면 이미 한 조각을 무른다. 묶음 안 갈래만 따로 되돌리려면 그 갈래에서 뒤에 한 것이 없어야 한다(`ENTRY_BLOCKED`).
- **다른 행위자**: `timeline.receive({ label, actor })`는 이미 바뀐 것을 다시 적용하지 않고 되돌릴 수 없는 줄로 받는다. 되돌리기는 그 앞을 넘지 않는다(개발·검수 사이트 D2가 쓸 최소 창구).
- **저장**: `timeline.serialize()`는 이름·갈래·행위자·시각만 담는다(`font-kku-timeline` v1, 되돌릴 자료 없음). `restore(saved)`는 되돌릴 수 없는 지난 줄로 되살린다. 글꼴 묶음의 '편집 기록(선택)'에 잇는 것은 S2-B 몫이다.
- **편집 기록 칸**(`[data-studio-f=history]`, `font-studio-history.js`)
  - 모든 페이지 맨 아래에 있다(디자인 본문 밖). 첫 줄이 생길 때 붙는다 — 맨 아래라 처음 생겨도 미리보기를 밀지 않는다.
  - 줄마다 갈래 꼬리표(`[data-history-kind]`), 이름, 에이전트 행위자(`[data-history-actor]`), 지난 시간. 되돌릴 수 없는 줄은 `data-locked`.
  - 항목을 누르면 그 자리로(`timeline.jump(id)` — 한 걸음씩), '처음 상태'는 모두 되돌림. 되돌리기·다시 단추는 전체의 마지막 일이고 툴팁에 이름을 보인다(`timeline.peek()`).
  - 지난 시간 타이머(15초)는 칸이 깨어 있고 목록을 펼쳐 둔 동안만 돈다(접힌 한 줄에는 시각이 없다).
- **창구** `FontStudio.timeline`: `lane(name, spec)`·`record(lane, info)`·`receive`·`undo`·`redo`·`undoLane`·`redoLane`·`jump`·`batch`·`begin`·`end`·`forget`·`dropOldestOf`·`entries()`·`index()`·`entry(id)`·`peek()`·`canUndo`·`canRedo`·`canUndoLane`·`canRedoLane`·`bytes()`·`budget()`·`setBudget(bytes)`·`serialize()`·`restore()`·`clear()`·`on(fn)`·`kindText(kind)`. 갈래 spec은 `{ undo(entry), redo(entry), truncate?(), dropOldest?(entry), merge?(prev, next) }`이고, 갈래가 적용하는 동안 들어온 기록은 버린다.
- **자동화 계약**: `api.history()`는 시간축 그대로다 — `{ ok, entries: [{ id, kind, cause, label, actor, time, state, undoable }], index }`. `api.undo()`·`redo()`의 `entry`도 그 줄이다. 행위자는 `api.setActor`로 정한 지금 행위자가 줄마다 남는다.

## 글꼴 묶음과 저장 창구 (S2)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) '저장 창구와 글꼴 묶음', ⚑2 기본값(새로 쓰는 것은 묶음, 옛 형식은 모두 읽는다), [ADR-033 §7](../ADR/ADR-033-dev-review-site.md)(개발·검수 사이트·나중의 대외 서비스가 저장·서빙하는 단위).

**글꼴 묶음** `font-kku-font-package` v1(`authoring/font-studio-package.js`, authoring `Package`) — 글꼴 하나의 모든 것:

| 칸 | 내용 |
|---|---|
| `manifest` | `id`·`name`·`base?: { id, rev? }`(파생 글꼴의 바탕과 판)·`runtime: { version }`·`layouts?`·`contentRev`·`createdAt`·`updatedAt`·`license?` |
| `css` | 그 글꼴 파일에 쓰는 글 그대로(작업실 CSS 파일 저장이 쓰는 `outputCss()`) — 서버는 이 칸만 읽어 글꼴 파일에 쓴다 |
| `sourceCss?` | 고치던 원문 — `css`와 다를 때만('통째로 풀어 저장'을 고른 파생 글꼴). 다시 열면 이것을 고친다 |
| `baseUrl?`·`preview?` | 상대 자산 기준 주소, 미리보기 글 |
| `design?` | `{ json, applied, participants? }` — 그림 문서는 아래 `drawings`로 뺀다(프로젝트 v2에서는 `design.participants.drawings`) |
| `drawings?` | 작업실 그림 문서(`font-kku-drawing` v1) |
| `material?` | 자소판 화소 `{ kind: "sprite", path, sheet: PNG data URL, sheetOmitted? }` |
| `review?`·`environment?` | 검수 기록(판 2)·저장 환경(`font-kku-dependencies` v1, 프로젝트 v2의 `reproducibility`) |
| `history?` | 편집 기록(선택 — 작업실 `FontStudio.timeline.serialize()`가 있을 때. 초안에는 넣지 않는다) |
| `extra?`·모르는 맨 위 칸 | 옛 형식에서 온 모르는 칸은 `extra`, 묶음의 모르는 맨 위 칸은 그 자리에 — 다시 저장해도 남는다(ADR-032 §7) |

- `contentRev`는 글꼴이 그리는 것(CSS·원문·디자인·그림·자소판)의 지문이다. 검수·저장 환경·미리보기 글·시각은 넣지 않는다(판정을 적어도 지문이 바뀌지 않게). 서버 판 번호(`rev`)와 다르다.
- 읽기 `Package.fromAny(글|객체)` → `{ ok, kind, package?, apply?, errors }`:
  - `package` · `project`(v2) · `draft`(판 1·2, 가장 옛 `{ css }`) · `css`는 그 글꼴로 연다.
  - `bundle`(디자인 묶음 v1) · `design`(디자인 JSON)은 글꼴 CSS가 없어 지금 글꼴에 적용한다(묶음 열기·디자인 JSON 열기와 같은 길).
  - 남이 준 디자인·그림 문서는 디자인 묶음과 같은 안전 검사(`scanUnsafe` — 표시 문법·`url()`·`data:`·`@import`)를 거친다. 자소판은 PNG data URL이어야 한다.
  - 검사 코드: `PACKAGE_FORMAT`·`PACKAGE_VERSION`(더 새 판이면 그 작업실에서 열라고 알림)·`PACKAGE_MANIFEST`·`PACKAGE_CSS`·`PACKAGE_DESIGN`·`PACKAGE_DRAWINGS`·`PACKAGE_MATERIAL`·`PACKAGE_FIELD`·`PACKAGE_UNSAFE`·`PACKAGE_JSON`·`PACKAGE_TOO_LARGE`·`PROJECT_FORMAT`.
- 프로젝트 v2와는 손실 없이 오간다(`fromProject`·`toProject`). 작업실 모듈은 지금처럼 `project` 훅으로 프로젝트 칸을 채우고, 묶음은 그것을 감싼다.

**작업실이 쓰는 것**
- '내보내기 ▸ 글꼴 묶음 파일'(전 '프로젝트 저장', `[data-studio-export-project]`)은 묶음 파일 `<id>.font-kku.json`을 쓴다(전에는 프로젝트 v2). 머리 막대의 '열기'(`FontStudio.openFile(File)` → `openAny`)·`FontStudio.openAny(File|글|객체, { label })`는 묶음·프로젝트 v2·초안·디자인 묶음·디자인 JSON·CSS를 알아본다.
- 초안은 같은 열쇠(`font-kku-font-studio-v2`, mount `draftKey`)에 판 2 `{ format: "font-kku-font-studio-draft", version: 2, savedAt, package }`로 쓴다. 판 1(`project`)과 가장 옛 `{ css, baseUrl, text }`도 읽는다. 옆 칸(`:pending`)으로 옮기는 옛 초안은 읽은 그대로 둔다.
- mount `exportProject()`·`loadProject()`·옵션 `project`는 그대로 프로젝트 v2를 주고받는다(사이트 계약). `loadProject`·`project`는 묶음도 받는다. `exportPackage()`는 묶음을 준다.
- 자동화 계약: `api.snapshot()` → `{ ok, package, project, rev(글꼴 CSS 판 — 다른 결과와 같음), contentRev }`, `api.load(묶음|프로젝트|옛 형식 글)`.

**저장 창구**(`studio/font-studio-store.js`) `{ kind, open(id) → { package, rev } | null, save(id, pkg, { ifMatch }) → { ok, rev } | { ok: false, code }, list(), watch(id, cb) → 그만 듣기 }`
- `local`(기본): 묶음 파일 내려받기(파일 핸들이 있으면 그 파일). 정적으로 돈다(ADR-009 §1).
- `http(storeUrl)` — mount `storeUrl`, 주소 `?store-url=`. **저장 창구 HTTP 약속 v1**(개발·검수 사이트 D2가 서버 쪽을 같은 이름으로 만든다):
  - `GET {storeUrl}fonts` → `{ fonts: [{ id, rev, updatedAt, actor }] }`
  - `GET {storeUrl}fonts/<id>` → `{ id, rev, package }` · 404 `{ code: "NOT_FOUND" }`
  - `PUT {storeUrl}fonts/<id>` `{ package }` — `If-Match: "<rev>"`(고칠 때)·`If-None-Match: *`(처음), `X-FKK-CSRF`(쿠키 `fkk_csrf`가 있으면), `X-FKK-Actor`(행위자 id) → `{ id, rev }` · 409 `{ code: "REV_MISMATCH", rev }` · 400 `{ code: "PACKAGE_INVALID", message }` · 401·403
  - 알림: SSE `{origin}/events`의 사건 `store` `{ ns, id, rev, actor }`. 창구가 쓴 판과 다른 이름공간은 받지 않는다.
  - `rev`는 서버가 센다(받은 묶음 바이트의 sha256 앞 16자). 작업실은 세지 않는다.
  - 작업실이 직접 부르므로 같은 출처이거나 CORS가 열려 있어야 한다.
- `relay` — mount `store`(호스트 페이지의 객체 `{ save, open?, list?, watch? }`). 다리(`bridge.js`)가 부름을 부모로 넘긴다(`store`·`store-result`·`store-event` 전갈). `store`와 `storeUrl`은 함께 줄 수 없다.
- 바깥 창구(http·relay)면 시작할 때 창구에서 `?store-font=`(없으면 `font`) 글꼴을 먼저 연다. 없으면 지금처럼 `src`·기본 제공 글꼴을 열고, 처음 저장은 `If-None-Match: *`다. 문서를 다 읽은 뒤에 연다(목록 XHR이 뒤 스크립트보다 먼저 올 수 있다).
- 저장 `FontStudio.save({ as: "new"|"same", name?, force? })` → `Promise<{ ok, id, rev, file?, contentRev } | 거절>`:
  - 처음 저장이고 기본 제공 글꼴이면 `SAVE_NEEDS_CHOICE`(`choices`, `suggestedName` — 예 `my-gothic`)를 돌려준다. `FontStudio.saveNeedsChoice()`가 미리 알려 준다. '이 글꼴 그대로'(`same`)는 저장소 작업실(`shippedSave`)에서만. 그 밖은 '이 글꼴로 새 글꼴'과 같은 길(파생 글꼴)로 새 이름을 만든 뒤 저장한다.
  - `REV_MISMATCH`면 `[data-studio] data-store-conflict="true"`. `reloadFromStore()`로 다시 싣거나 `save({ force: true })`로 덮어쓴다(알림이나 409에서 받은 판을 `If-Match`로).
  - 다른 행위자가 저장했다는 알림이 오면 다시 싣지 않고 알린다(되돌리기 기록이 끊기지 않게).
  - 거절 문구는 거절 표(`authoring/font-studio-refusals.js`)의 `NO_FONT`·`SAVE_NEEDS_CHOICE`·`NAME_INVALID`·`SAME_NAME_BLOCKED`·`STORE_UNAVAILABLE`·`STORE_UNREACHABLE`·`STORE_FORBIDDEN`·`STORE_FAILED`·`REV_MISMATCH`·`STORE_NOT_FOUND`·`PACKAGE_INVALID`·`OPEN_FAILED`에서 나온다.
- `FontStudio.store()` → `{ kind, url, rev, saved, conflict }`. '고친 것이 있습니다' 대화상자의 '저장하고 열기'는 바깥 창구면 그 창구에 저장한 뒤 연다.
- 머리 막대(아래 '머리 막대 (S2)')가 '저장' 하나 = `save()`, '열기' 하나 = `openFile()`, '내보내기 ▾'의 글꼴 묶음 파일 = 묶음 내려받기를 부른다.
- 시험: `tests/font_package.test.js`(형식 판별·손실 없는 왕복·검사 코드·내용 지문·HTTP 창구·local·relay), `tests/test_studio_s2_package.py`(묶음 왕복·자소판 파일·옛 형식·초안 판 2·처음 저장·CSS만 알림·mount `storeUrl`·`store`).

## 머리 막대 (S2)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) '머리 막대 다시 짜기'. 2026-10-18 S2-C. 막대는 `studio/index.html`의 `[data-studio-bar]`, 메뉴·대화상자·상태는 `studio/font-studio-header.js`(+ `font-studio-header.css`), 일은 전처럼 `font-studio.js`가 한다.

| 자리 | 하는 일 | 갈고리 |
|---|---|---|
| 글꼴 고르기 ▾ | `spec/fonts.json`의 22개(바탕·파생 묶음, 지금 글꼴에 표시)마다 견본 한 줄 '한글 꾸미기'. 견본은 메뉴를 처음 열 때 넷씩 그린다(견본마다 그림자 트리에 코어 CSS + 그 글꼴 CSS, `FontKku.loadFont(…, { root })`). 저장 창구가 바깥(http·relay)이면 '내 글꼴(저장 창구)' — `FontStudio.storeList()`. 고르면 바로 연다(고친 것이 있으면 묻는다, D12) | `[data-studio-menu-button=font]`, `[data-studio-font-option=<id>]`, `[data-studio-font-group]`, `[data-studio-store-font=<id>]`, `[data-studio-font-current]` |
| 열기 | 파일 하나 — CSS·글꼴 묶음·프로젝트·초안·디자인 JSON·디자인 묶음(`openAny`, 남이 준 것은 묶음의 안전 검사), 자소판 PNG(그림 자소 글꼴일 때 `material.importPng`, 아니면 까닭). 글꼴이 바뀌는 것만 먼저 묻는다. 쉬운 모드는 막대 단추 대신 글꼴 ▾ 맨 위의 '파일 열기…'(S3) | `[data-studio-open]`(정밀), `[data-studio-open-item]`(쉬운), `[data-studio-open-file]`, `FontStudio.openFile(File)` |
| 저장 | 글꼴 묶음 전체를 저장 창구로(`FontStudio.save`). 처음 저장이고 `saveNeedsChoice()`가 있으면 대화상자: '새 글꼴로'(이름 제안 `my-<id>`) / '이 글꼴 그대로'(저장소 작업실 `shippedSave`에서만). 잘못된 이름·거절은 대화상자 안에 보이고 열어 둔다. 쉬운 모드에서 고를 것이 '새 글꼴로' 하나면 묻지 않고 제안 이름으로 바로(S3 '두 모드') | `[data-studio-save-all]`, `[data-studio-save-dialog]`, `[data-studio-save-option=new\|same]`, `[data-studio-save-name]` |
| 내보내기 ▾ | CSS만 내려받기(빠지는 것을 항목에 미리 — `lostInCss`, 내보낸 뒤 S0 알림도 그대로) · CSS 복사 · CSS를 연결한 파일에 저장(File System Access) · 내 페이지에 쓰기(코드 복사 — 런타임·글꼴 CSS 줄, CSS가 나르지 못하는 디자인·그린 그림 세트가 있으면 그림 세트 줄 + 디자인 등록, `<font-kku font>`) · 글꼴 묶음 파일 · 글꼴 파일(TTF — 그림 자소 글꼴만) · 자소판 PNG(그림 자소 글꼴만) · 그림 세트 `.jamo.js`(그린 칸이 있을 때) · 통째로 풀어 저장(파생 글꼴일 때 체크 칸) | `[data-studio-export-css]`·`[data-studio-copy-css]`·`[data-studio-save]`·`[data-studio-export-page]`·`[data-studio-export-project]`·`[data-studio-export-font]`·`[data-studio-export-sheet]`·`[data-studio-export-jamo]`·`[data-studio-flatten]` |
| 되돌리기·다시 | 하나의 기록 전체의 마지막 일(Cmd/Ctrl+Z와 같은 `undoLast`·`redoLast`). 툴팁·`data-label`은 그 일의 이름(`timeline.peek()`), 할 것이 없으면 꺼진다 | `[data-studio-undo]`, `[data-studio-redo]` |
| 저장 상태 | '저장 안 한 편집'(`dirty`) · '저장함 HH:MM'(바깥 창구면 '저장 창구 …', 판은 툴팁) · '판이 다릅니다'. 창구의 판이 다르거나 다른 행위자가 저장하면 아래 줄에 '창구 판 다시 싣기'(`reloadFromStore` — 고친 것을 버린다)·'내 것으로 덮어쓰기'(`save({ force: true })`) | `[data-studio-store-state][data-state=clean\|dirty\|saved\|conflict]`, `[data-studio-store-conflict-bar]` |
| 그 밖(정밀 자리) | '새 이름 · 파일 연결 · 그 밖'(접힘): 새 이름 칸·'이 글꼴로 새 글꼴'·CSS 파일 연결해 열기('v1 프로젝트 가져오기'는 S3에서 뺐다 — `scripts/convert_sprite_project_v1.js`). 같은 이름 저장을 막을 때(`sameNameBlock`)는 펼치고 새 이름 칸에 초점(쉬운 모드는 '저장'에 초점). 정밀 모드 칸이다(S3). 쉬운/정밀 전환은 `[data-studio-mode-slot]`(S3 '두 모드') | `[data-studio-bar-more]` |

- 막대의 '새 그림 자소 글꼴'(둘째 입구)은 S3에서 뺐다 — 자소판 시작 안내의 '새 그림 자소 글꼴로 그리기 시작'이 같은 함수다. 파생 글꼴의 바탕에 새 판이 있으면 막대에 '바탕 새 판 받기'(`[data-studio-rebase]`)가 보인다. 자소판 안내의 '예제 열기'는 `FontStudio.openShipped(id)`(글꼴 고르기와 같은 길)를 부른다 — 감춘 '불러오기' 갈고리(`[data-studio-load]`)와 `<select data-studio-shipped>`는 없다.
- 메뉴 키: 단추에서 Enter·Space·↓(글꼴은 지금 글꼴, 내보내기는 첫 항목)·↑(끝 항목), 메뉴 안 ↑↓·Home·End, Esc는 닫고 단추로, Tab은 닫는다. 바깥을 누르면 닫는다. 항목을 누르면 그 일을 한 뒤 바로 닫는다(체크 칸은 열어 둔다).
- 휴대폰(700px 이하): 막대 단추·메뉴 항목 44px, 메뉴는 화면 아래 판(`position: fixed`), 저장 상태는 한 줄 차지. 390px에서 가로 넘침이 없다.
- 훅: `catalog`(글꼴 목록이 섰을 때 — 메뉴를 다시 만든다), `font`(`{ id, shipped }` — 지금 연·여는 글꼴). 시험·자동화: `FontStudio.header` `{ open(name), close(), current(), save(options), pageCode(), copyPageCode(), sync() }`, 시험 도우미 `tests/studio_header.py`.
- 시험: `tests/test_studio_s2_header.py`(글꼴 메뉴·견본·묻기, 키보드만, 열기 하나의 형식들, 처음 저장 대화상자, 저장 창구 판 충돌·내 글꼴, 내보내기 항목마다 파일, 되돌리기 툴팁, 휴대폰 폭).

## 두 모드 (S3)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) '두 모드'·'페이지별 보기'(머리·고치기 행)·'화면 말', ⚑1(기본값). 2026-10-18 S3-A. 디자인·자소판·검수 페이지의 쉬운·정밀 보기는 S3-B.

- **장치**: 작업실 뿌리 `[data-studio]`의 `data-studio-mode`(`easy`·`precise`) 하나. 정밀 전용 칸은 `[data-studio-precise]`, 쉬운 전용 칸은 `[data-studio-easy]`로 밝히고 `font-studio.css` 끝의 두 줄이 감춘다. 표시만 바뀌고 데이터·되돌리기·고른 것·페이지·저장은 같다(바꿔도 그대로). 모듈은 수명 훅(`f.mount` `mode`, S1)으로 멈춘다.
- **처음 보기**: 주소 `?mode=`(mount `mode`도 이 주소로 온다) > 이 브라우저에 기억한 사람의 선택(`localStorage` `font-kku-studio-mode`, 못 쓰면 건너뜀) > 저장소 작업실(`shipped-save`·mount `shippedSave`)은 정밀, 그 밖(사이트·서비스)은 쉬운.
- **바꾸기**: 머리 막대의 '쉬운 / 정밀'(`[data-studio-mode-toggle]` radiogroup, `[data-studio-mode-option=easy|precise]`, ←→로 오간다, 휴대폰 44px) → `FontStudio.setMode(name, { remember: true })` — 기억하고, 주소에 `?mode=`가 있으면 그것도 바꾼다(다시 열어도 같다). 자동화 `api.setMode`·mount는 기억하지 않는다. 사건 `mode`.
- **'정밀 모드에서 하기'**(`[data-studio-to-precise]`): 쉬운 화면에서 못 하는 일 자리에 둔다. 고른 것을 그대로 두고 정밀로(기억한다).
- **쉬운 모드만으로 끝난다**(2026-10-18 사용자 원칙 — 모든 기능을 거쳐야만 글꼴을 만들 수 있게 강제하지 않는다): 보기 전환·정밀 칸은 덧붙는 길이고 앞 단계가 아니다.
  - 처음 저장: 고를 것이 '새 글꼴로' 하나뿐이면(사이트·서비스) 묻지 않고 제안 이름 `my-<id>`로 바로 저장한다. 이름은 정밀 모드의 '새 이름'에서 바꾼다. 고를 것이 둘(저장소 작업실)이거나 정밀 모드면 S2 대화상자로 묻는다.
  - 고친 기본 제공 글꼴의 같은 이름 내보내기·복사·파일 저장이 막히면(`sameNameBlock`) 쉬운 모드는 '새 이름' 칸 대신 '저장'으로 이끈다(초점, "'저장'을 누르면 새 글꼴(my-gothic)로 저장되고 그 뒤에 CSS를 내보낼 수 있습니다").

| 자리 | 쉬운 | 정밀에 더하는 것 |
|---|---|---|
| 머리 | 페이지 고리 · 글꼴 ▾(맨 위 '파일 열기…' `[data-studio-open-item]`) · 저장 · 내보내기 ▾ · 되돌리기·다시 · 보기 · 초안 상태 · 경고 한 줄(`[data-studio-diagnostics-summary]` — "글꼴 검사 오류 n건 … 정밀 모드에서 보기") | '열기' 단추 · 상태(글꼴 CSS·계약·재료·줄 바뀜) · 경고 목록(줄·코드) · '새 이름 · 파일 연결 · 그 밖' |
| 고치기 | 쉬운 고치기 판(아래) · 직접 조작(잉크로 고르기·같은 점 다시·끌기·손잡이·키 — 두 모드 같다) · 한 줄 안내 | 범위 여덟 + 문맥 조건 · 공유 규칙 분리 · '대신 … 고치기'(줄 번호) · 편집 대상 칸 · 값 표 전체(출처 열) · 걸린 규칙 · 출처 다섯 질문 · 검증 목록 · 전역·묶음 변수 · CSS 원문 고쳐 쓰기 · 자리·역할·깊이 코드 |

**쉬운 고치기 판**(`[data-studio-easy-edit]`, 고치기 페이지 살펴보기 칸)
- 고른 것: "'의'의 ᄋ (첫소리)" — 자리·역할 코드는 정밀 모드.
- 범위 셋(`input[name=easy-scope]`): '이 글자만'·'같은 짜임 모두'·'이 자모 어디서나'. 뜻을 그 글꼴 모양의 범위로 옮긴다. 없는 뜻은 꺼서 까닭을 보인다. 정밀 모드에서 셋 밖의 범위를 골랐으면 그것을 쓴다고 알린다. 범위에 마우스를 올리면 바뀔 곳 점선(S0 D4).

  | 뜻 | 네모꼴 | 직결식 | 세벌식 |
  |---|---|---|---|
  | 이 글자만 | `glyph` | `glyph` | `glyph` |
  | 같은 짜임 모두 | `case`(짜임이 없는 글자는 꺼짐) | `case` | `principle`(원칙 범위 = 같은 짜임의 같은 자모) |
  | 이 자모 어디서나 | `jamo` | `principle`(원칙 범위 = 같은 역할의 같은 자모 어디서나) | 없음 — 짜임마다 자리가 달라 꺼짐 |

- 바뀔 곳: "고치면 미리보기에서 n곳이 바뀝니다(점선)"(`[data-studio-easy-count]`).
- 막대와 숫자(`[data-studio-easy-range|value=left|top|size|rotate|weight]`): 가로 위치·세로 위치(%)·크기(배)·회전(°)·굵기. 숫자는 **지금 보이는 값**이다. 위치는 그려진 자모 상자의 % 자리(계산된 inset ÷ 담는 상자), 크기는 글자 대비 배수, 회전은 계산된 변환의 각, 굵기는 계산된 굵기. 규칙에 적힌 값(정밀 모드 값 표)과 다를 수 있다 — 검토 §3의 top −18.4%(적힌 값) 대 −20.3%(보이는 값).
  - 고치면 넣은 값과 지금 보이는 값의 차이를 정밀 모드의 끌기·키와 같은 길로 보낸다: 위치 `nudge`(글자 상자 %), 크기·회전 키 한 걸음(`stepResult` — 배수·도 더하기), 굵기 값 칸(`applyInput`). 그래서 값 표에 친 것과 같은 선언 diff를 낸다(한 손짓 = 한 대상).
  - 막대는 끄는 동안 숫자만 따라가고 놓을 때(change) 한 번 고친다(기록 한 줄).
- 경고와 해결 단추(`[data-studio-easy-warning]`): 한국어 한 줄과 단추. 원문(변수·줄 번호·선택자)은 정밀 모드.
  - 가려진 범위 → "⚠ …에 닿지 않습니다." + '앞선 규칙을 대신 고치기'(`[data-studio-easy-escalate]`, 정밀의 '대신 … 고치기'와 같은 길) · '다른 범위 고르기'
  - 대신 고치는 중 → '원래 범위로'(`[data-studio-easy-deescalate]`)
  - 공유 규칙 → '함께 고치기' / '이 자모만 따로'(`[data-studio-easy-shared=edit|split]`)
  - 세벌식·직결식 원칙을 깨는 범위 → 한 줄 안내(막지 않는다, ADR-030 §5)
  - 방금 거절된 편집 → 그 문구 + '정밀 모드에서 하기'
- 검사 한 줄: "검사: 문제 없음" 또는 오류·많이 겹친 곳의 수 — 목록은 정밀 모드.
- **휴대폰(600px 이하)**: 고르면 판이 아래에서 올라온다(`position: fixed`, 높이 52vh 이하, 44px 단추). 문서 아래를 54vh 띄워 판이 미리보기 끝을 가리지 않는다. 새로 고른 글자가 판에 가리면 판 위로 굴린다. '접기'(`[data-studio-easy-fold]`)로 판 몸을 접는다. 정밀 모드에서는 판이 없다(살펴보기 칸이 미리보기 아래).

**화면 말**(쉬운 모드)
- 알림의 '자세히'(`.studio-message-detail` — 변수·줄 번호 원문)를 감춘다(정밀 모드에서 보인다).
- 글꼴 검사 오류 안내(`lintWarning`)·불러오기 요약(`parseSummary`)은 한국어 한 줄과 "정밀 모드에서 볼 수 있습니다"로 짧게(정밀 모드는 첫 오류의 줄·코드까지).
- 고치기 페이지 한 줄 설명은 쉬운·정밀 두 벌(정밀에만 `@layer font-kku.tune`).
- 시험 도우미 `tests/studio_modes.py`의 `dev_identifiers(page)`가 쉬운 화면의 보이는 글에서 개발 식별자를 센다(고치기 페이지는 0개).

**⚑9 글꼴 모양 바꾸기**: '네모 문맥으로'·'디자인 끄고 글꼴 CSS로'는 고치기 페이지 살펴보기에서 뺐다(디자인 페이지가 묻고 부른다). `FontStudio.shapeChange("off" | "square")`는 확인 갈고리(`[data-studio-design-off]`·`[data-studio-design-square]`)를 작업실 안에서 한 번 눌러 화면 단추와 같은 두 처리기(작업실 `confirmShapeChange` — 끄기는 작업실 동작으로 기록, 디자인 패널의 바꾸기)를 탄다. Ctrl+Z가 되돌린다.

- 시험: `tests/test_studio_s3_modes.py`(보기 전환·기억·주소와 mount가 이김, 쉬운 고치기 판의 식별자 0·범위 셋·휴대폰 아래 판과 판 위 두드리기, 쉬운 값과 값 표의 같은 diff, 해결 단추, 쉬운 모드만으로 저장까지, 원문 고쳐 쓰기, ⚑9, 알림 '자세히'). 정밀 기능을 보는 기존 시험·스모크는 `?mode=precise`로 연다.

## 정밀 모드 CSS 원문 (S3)
⚑6(기본값: 넣는다 — 2026-09-24 사용자 결정 'CSS 손 편집이 핵심'). 고치기 페이지 '글꼴 CSS 원문'(`details.studio-source`, 정밀 모드).

- 칸(`[data-studio-source]`)은 고쳐 쓸 수 있다(고정폭, 줄바꿈 없음). 적용은 Ctrl/Cmd+Enter · '적용'(`[data-studio-source-apply]`) · 칸을 떠날 때(change). 적용은 다른 편집과 같은 길(`commit` → `setCss`)이라 하나의 기록 한 줄('원문을 고쳐 적용했습니다'), 미리보기·검사·초안·저장 창구 `change` 사건이 그대로 온다. Cmd/Ctrl+Z(칸 밖)가 되돌린다.
- **구문 오류면 적용하지 않는다**: `Model.parse`의 `error`가 지금 CSS보다 많으면(연 CSS가 이미 브라우저처럼 복구해 읽은 오류는 그 수까지 받는다) 글을 칸에 남기고 오류를 줄 번호와 함께 아래 목록(`[data-studio-source-lint]`, `L<n>` 단추가 그 줄을 고른다)에 보인다. 칸을 떠나도 적용하지 않는다.
- Esc·'되돌림'(`[data-studio-source-revert]`)은 칸을 지금 CSS로.
- 고치는 중(적용 안 한 원문)에는 다른 편집이 와도 칸을 덮지 않는다(초안을 잃지 않게) — 적용·되돌림이 다시 맞춘다. 칸 안의 Ctrl+Z는 칸의 되돌리기다(하나의 기록 아님, S2).
- 상태: 뿌리 `data-source-state=clean|dirty|invalid`, 제목 옆 한 줄. 검사 목록은 적용한 CSS의 글꼴 계약 검사(경고는 막지 않는다 — 작업실 정책)와, 고치는 중이면 그 글의 구문 오류.
- 창구: `FontStudio.applySource()`(칸의 글을 적용 — 구문 오류면 `{ ok: false, code: "SOURCE_INVALID", errors }`), `FontStudio.sourceDirty()`.

## 재료 탭 (그림 자소)
- **입구**: 작업실의 자소판 페이지(`?page=sheet`). 탐색 메뉴의 "자소판 그리기"와 첫 화면의 "자소판 그리기"는 `font-studio.html?font=sprite-example#studio-material`로 연다 — 옛 주소 `#studio-material`도 자소판 페이지로 연다. `#studio-material`이면 탐색 메뉴는 "자소판 그리기"를 현재 페이지로 표시하고, 재료가 준비되면 자소판으로 스크롤한다. 그림 자소가 아닌 글꼴(`--fy-material: system` 등)을 열면 자소판 패널 대신 "sprite-example 열어 그리기 / 새 그림 자소 글꼴로 그리기 시작" 안내가 보인다. "새 그림 자소 글꼴"와 안내 버튼도 자소판으로 스크롤한다.
- `--fy-material: sprite` 글꼴을 열면 `--fy-sprite-url` 자소판을 원본 캔버스로 불러온다. 캔버스는 이미지 원래 크기이고(늘이거나 줄이지 않는다) 칸 크기는 이미지 폭 ÷ `--fy-sprite-cols`, 행 수는 이미지에서 얻는다(자소판 변수는 [ADR-008 §5](../ADR/ADR-008-font-contract-v2.md)). 이미지 행 수가 `--fy-sprite-rows`/`--fy-sprite-kinds`와 다르면 CSS를 맞출지 묻는다.
- 행 배치는 `build_sprite.py`의 확장 순서(자음, 모음, 종성 자음, 겹받침, 받침 위·가로모음 초성, 키 큰 초성 문맥 합자 모음)이고, 행마다 런타임이 실제로 쓰는 칸만 이름표·빈 칸 진단 대상이다.
- 미리보기에서 그림 자소를 클릭하면 그 노드의 계산된 `--fy-sprite-row`와 `data-sprite-jamo-index`로 칸을 고른다.
- **편집 중에는 CSS를 바꾸지 않는다**(2026-10-18 S0 D8): SVG 자소판이어도 화소를 고치는 동안 미리보기는 blob 주소로만 바뀌고 글꼴 CSS의 `--fy-sprite-url`은 그대로다 — 전에는 첫 획에 저장소에 없는 `./<id>.png`로 바꿔 모두 되돌려도 한 줄이 남고 404가 났다. PNG 이름은 'PNG 내보내기'에서 정해지고, 그때 고친 SVG 자소판의 CSS가 `./<이름>.png`를 가리킨다(CSS 되돌리기 한 단계, `exportPng({adopt:false})`로 건너뜀). 크기가 다른 칸에 붙여넣으면 이유와 함께 거절한다. TTF 내보내기 동안 단추를 끄고 진행을 알린다.
- **그리기**: 펜·지우개·페인트 통·직선·사각형(외곽선), 굵기 1–20(64px 칸 기준, 칸 크기에 비례), 색. 쉬운 모드는 펜·지우개·굵기(S3 — '채우기'는 글꼴로 칸을 채우는 단추라 도구 이름을 페인트 통으로). 직선·사각형은 드래그 동안 원래 칸 위에 도형을 다시 그려 보여 준다. 안내선은 격자(중심 십자·3등분)와 참고 글자(참고·채우기 글꼴)를 따로 켜고 끈다. 칸 아래에 선택 칸의 잉크 픽셀(칸 면적 대비 %)과 채운 칸 수(런타임이 쓰는 칸 기준)를 보인다.
- **채우기·비우기**(S3 — 셋·둘을 하나씩): '채우기'는 범위를 고른다(이 칸을 글꼴로 · 빈 칸 모두 글꼴로(기본) · 모든 칸 다시), '비우기'도(이 칸(기본) · 자소판 전체). 모든 칸 다시·자소판 전체는 확인을 받는다. 창구 `material.fill(scope)`·`clear(scope)`.
- **되돌리기·다시**: 획 하나, 페인트 통 한 번, 칸 작업(비우기·글꼴로 채우기·붙여넣기), 자소판 작업(빈 칸 모두 채우기·모든 칸 다시 채우기·자소판 전체 비우기)이 각각 한 단계다. 단계는 건드린 영역의 전후 픽셀을 갖고, 자소판 몫이 160MB를 넘거나 하나의 기록 상한을 넘으면 오래된 것부터 버린다. 새 자소판(PNG 가져오기·다른 글꼴)은 이력을 비운다(시간축에서도 자소판 줄을 뺀다). 자소판 칸의 '그리기 되돌리기'는 자소판 갈래의 마지막 일, Ctrl+Z는 하나의 기록 전체의 마지막 일이다. 전체 다시 채우기·자소판 전체 비우기는 확인을 받는다.
- 편집한 자소판은 `blob:` URL로 만들어 미리보기 바탕 요소의 레이어 밖 `--fy-sprite-url`(과 `-2x`/`-3x`) 덮어쓰기(`[data-studio-host]`)로 적용한다. 글꼴 id를 바꿔도 그대로 맞고, `--fy-sprite-image: image-set(...)`을 선언한 글꼴도 모든 밀도에서 편집 중인 자소판을 보인다. 글꼴 CSS 원문은 바뀌지 않고, 내보낼 때 PNG(`--fy-sprite-url` 파일 이름)와 CSS가 짝을 이룬다. 다른 글꼴을 불러오면 덮어쓰기를 지운다.
- **래스터 품질**: 부드럽게 / 선명한 가장자리 / 픽셀. 고르면 글꼴 바탕 요소에 `--fy-sprite-rendering`(`crisp-edges`·`pixelated`, 부드럽게는 선언을 지워 `auto`)을 쓴다 — 코어 그림 자소 규칙의 `image-rendering`이 이 변수를 읽는다(픽셀 아트 자소판이 확대될 때 번지지 않는다). 같은 방식이 미리보기·내보내기 다시 샘플링(부드럽게는 고품질 보간과 단계적 축소, 나머지는 최근접)과 칸 편집 화면에도 쓰인다. 선택 상자는 CSS가 바뀔 때마다(되돌리기 포함) 글꼴의 값으로 맞춘다.
- **미리보기 PNG 칸**: 화면 고르기는 S3에서 뺐다(⚑5 — 내보내기 PNG 칸과 겹침). 미리보기는 원본 칸이고, `material.setPreviewCell(원본|auto|64…256)`은 시험·자동화 창구로 남는다.
- **글꼴 파일**: "글꼴 파일(TTF)로 내보내기"가 편집 중인 자소판(원본 캔버스, 전체 해상도 blob)과 미리보기 shadow root의 글꼴 CSS로 한글 11,172자 TTF를 만든다(ADR-015, `font-kku-export.js`).
- **내보내기**: PNG 칸(원본 / 64·128·192·256px)으로 PNG 한 장을 내보낸다. "배율 세트 1x·2x·3x 내보내기"는 고른 칸을 1x로 `<이름>.png`·`<이름>@2x.png`·`<이름>@3x.png`(`build_sprite.py --scale 1 2 3`과 같은 이름)를 내려받고, 글꼴 바탕 요소에 `--fy-sprite-url`·`--fy-sprite-url-2x`·`--fy-sprite-url-3x`와 `--fy-sprite-image: image-set(var(--fy-sprite-url) 1x, var(--fy-sprite-url-2x) 2x, var(--fy-sprite-url-3x) 3x)`를 쓴다(편집 한 번 = CSS 되돌리기 한 단계). 원본 칸보다 큰 출력은 늘린 이미지라고 알린다.
- **작은 글씨 보정**: "작은 글씨 그림 자소 프리셋"은 글꼴 레벨 바탕 요소 값 `--fy-sprite-zoom: 1.35`, `--fy-sprite-crop-x/y: -0.175em`, `--fy-sprite-dilate: drop-shadow(0 0 0 #17130d)`를 한 번에 쓰고 "프리셋 해제"는 이 네 선언을 지운다(값은 전역 변수 패널에서 더 고친다). `--fy-optical-sprite-*`는 페이지 전용이라 글꼴에 쓰지 않는다 — "광학 보정 미리보기"는 미리보기 바탕 요소에만 덧씌우고, "페이지용 광학 CSS 복사"는 글꼴을 쓰는 페이지에 넣을 `:where(font-kku, .font-kku)[data-fy-font="<id>"][data-optical-size="small"] { --fy-optical-sprite-* }` 규칙을 복사한다.
- **PNG 가져오기**: 폭이 열 수로 나누어떨어지고 높이가 정사각형 칸의 배수이며 행이 2–6이어야 한다(아니면 거부). 행 수가 CSS와 다르면 "CSS를 자소판에 맞추고 불러오기"를 기다리고, 수락하면 `--fy-sprite-rows`와 `--fy-sprite-kinds`(행 배치가 담는 종류)를 바탕 요소의 캐스케이드 승자 규칙에서(없으면 기본 바탕 요소 규칙에) 고친다.
- `file://`에서 연 자소판은 캔버스가 오염돼 보기 전용이 된다. 'PNG 열기'로 불러오면 편집할 수 있다.
- 새 그림 자소 글꼴은 v2 틀(2행 자소판, `--fy-sprite-kinds: consonant vowel`, 모음 행 선택 규칙 하나)과 기기 글꼴로 채운 자소판에서 시작한다. ADR-006 v1 그림 자소 프로젝트는 `migrateV1Project`로 읽는다 — 화면 입구는 뺐고(S3 ⚑5) `scripts/convert_sprite_project_v1.js <v1.json> [--out 폴더] [--files]`가 글꼴 묶음(작업실 '열기'로 연다)으로 바꾼다. 창구 `material.migrateV1(글)`은 남는다. 자소판 경로와 변수 값은 CSS로 옮기기 전에 검사해 선언·규칙을 끝낼 수 있는 문자(`;{}\<>!`, 주석), 자원 참조(`url(` 등), 짝이 안 맞는 괄호·따옴표가 있으면 옮기지 않고 목록으로 알린다.

## 전역·묶음 변수
리듬(`--fy-glyph-*`, 공백·줄 간격), 글꼴(`--fy-font-family/weight/stroke`), 구조(표현 방식, `--fy-font-jamo-depth`·`--fy-font-vowel-depth`·`--fy-font-coda-depth` — 평이름 깊이 변수는 페이지 전용), 그림 자소(칸·zoom·crop·`--fy-sprite-dilate`·`--fy-sprite-rendering` — `--fy-sprite-filter`는 페이지 전용), 묶음 변수 7종을 바탕 요소 수준에서 편집한다. 바탕 요소의 캐스케이드 승자 규칙(조건·중요도 포함)의 그 줄을 고치고, 없으면 기본 바탕 요소 규칙에 추가한다. 깊이를 바꾸면 `refreshAll`이 구조를 다시 만든다. 고정 글꼴 모양(세벌식·직결식)에서는 깊이 칸 셋이 이 글꼴 CSS의 `@layer font-kku.tune` 바탕 요소 규칙을 보이고 고친다 — font 계층의 깊이(바탕 글꼴의 기본)는 그 모양에 닿지 않으므로 보이지 않고, 비우면 모양의 기본(프로파일 `depth`)이 자리 표시로 보인다(ADR-030 §4). 글자 칸·묶음 변환은 지금처럼 모양이 정해 흐리다.

## 초안
- 불러오기만으로는 초안을 쓰지 않는다. CSS·자소판을 편집하고 400ms 뒤에 저장한다(자소판은 dataURL).
- 초안은 판 2(글꼴 묶음을 담음, S2 — 위 '글꼴 묶음과 저장 창구')로 쓰고, 판 1(프로젝트)과 가장 옛 `{ css }`도 읽는다.
- 시작할 때 남아 있던 초안은 "초안 복원"/"초안 버리기" 전까지 보관한다. 복원하지 않은 채 편집하면 옛 초안을 옆 칸(`…:pending`)으로 옮긴다 — 초안은 최근 두 개까지다. 옮길 공간이 없으면 자동 저장을 멈추고 알린다.
- 용량이 모자라면 자소판을 빼고 다시 저장하고, 그래도 안 되면 상태 표시줄(`[data-studio-draft-status]`)에 실패를 보인다.

## 검증
두 단계 모두 경고 수준의 작성 보조다. 릴리스 판정은 `scripts/glyph_overlap_audit.py`와 페이지 감사가 맡는다.

- **1단계 — 잉크 상자**: canvas 텍스트 측정값으로 자모 잉크 상자를 구해 자리의 scale과 stroke를 반영하고, 음절 간 겹침과 글자 칸 이탈(폭의 12% 초과)을 보여 준다. 원소 재료(획이 CSS 상자)는 글자 측정 대신 그린 획 상자(`[part="element"]`)를 합친다 — 세벌 고정의 좁은 글자 칸에서 글자 측정 근사가 이웃과 겹쳐 보이던 것을 없앤다. 세벌 고정에서 남는 이웃 겹침(기기 글꼴 재료)에는 근사일 수 있다는 말과 판정 도구(겹침 감사 `--layout fixed`)를 붙인다. clip-path·회전은 무시한다.
- **2단계 — 음절 안 잉크 겹침**(ADR-009 §5): 글자마다 자모 노드를 canvas에 다시 그려 알파 마스크를 만든다. 계산된 글꼴·굵기·`-webkit-text-stroke`, 실효 배율, `clip-path: inset()`을 반영하고, 기준선은 Blink처럼 반쪽 leading을 내림해 놓는다. canvas 글자는 페이지 글자보다 가늘게 칠해지므로 알파 64 초과를 잉크로 친다. 그림 자소 노드는 계산된 `background-position`/`background-size`로 자소판 칸을 그린다. 노드 쌍마다 잉크 교집합 ÷ 작은 쪽 잉크 면적이 15%를 넘으면 경고한다. Playwright 검사(`assert_font_studio_checks_and_save`)는 같은 세션·같은 페이지에서 감사 방식(노드 하나만 보이게 한 스크린숏, 50% 잉크)으로 기준을 재 ±6%p 안에서 대조한다.
- 자소판이 canvas를 오염시키거나(`file://`) 자소판을 불러오지 못하면 그 글자의 2단계 판정은 "잴 수 없음"으로 표시하고(`data-overlap-status="partial|unmeasurable"`), "문제 없음"으로 보이지 않는다. 결과는 `FontStudio.overlaps()`로도 읽는다. 겹침용 이미지 캐시는 쓰지 않는 blob URL을 버린다.

## 새 글꼴로 · 이 글꼴 그대로 (ADR-030 §8)
- **새 글꼴로**: '이 글꼴로 새 글꼴'은 기본 제공 글꼴을 파생 글꼴로 만든다 — 작업실 머리말(`/* font-kku studio derived font — <새 id> (바탕: <id> <패키지 판> · <지문>)`), 계층 문장, 바탕을 새 이름으로 옮긴 `BEGIN/END GENERATED` 구간(저장소 파생 글꼴과 같은 표시·같은 셈, `authoring/font-derive.js`), 그 아래 손 보정. 그때까지 고친 것은 손 보정으로 옮긴다(`Model.handEdits`); 지운 선언처럼 옮길 수 없는 것이 있으면 통째로 복사하고 경고한다. 이미 파생 글꼴이면 이름만 바꾸고(구간 그대로), 기본 제공 글꼴이 아닌 글꼴은 통째로 복사한다.
- **바탕 구간 잠금**: 파생 글꼴(작업실이 만든 것과 저장소의 neon 등)을 열면 모델이 구간 안 규칙을 잠근다 — 편집은 구간을 고치지 않고 구간 아래에 이기는 규칙을 만든다(같은 레이어 뒤 규칙). 상태 줄(`[data-studio-derived]`)이 바탕과 판을 보인다.
- **바탕 새 판 받기**(`[data-studio-rebase]`, `FontStudio.rebase()`): 작업실이 만든 파생 글꼴의 구간이 지금 패키지의 바탕(`../profiles/<바탕>.css`)과 다르면 뜬다. 구간만 다시 쓰고 머리말의 판·지문을 새로 한다(손 보정 그대로, 되돌리기 한 단계).
- **통째로 풀어 저장**(`[data-studio-flatten]`): 파생 글꼴일 때 보이는 선택. 켜면 CSS 내보내기·복사·파일 저장이 구간 표시와 머리말을 뗀 한 파일을 낸다(`FontStudio.outputCss()`). 작업 중인 글은 그대로다.
- **이 글꼴 그대로**: 고친 기본 제공 글꼴(`spec/fonts.json`의 글꼴·별칭 이름 — `FontKkuDerive.SHIPPED_FONTS`)은 같은 이름으로 내보내기·복사·파일 저장을 막고 새 이름 칸으로 이끈다(`FontStudio.sameNameBlock()`). 패키지에서 실은 원문 그대로면 막지 않는다. 저장소 작업실은 mount `shippedSave: true` 또는 주소 `?shipped-save=1`로 연다. 프로젝트 저장·초안은 막지 않는다.

## 파일 저장 (File System Access)
- 브라우저에 `showSaveFilePicker`/`showOpenFilePicker`가 있으면 "CSS 파일 연결해 열기"(머리 막대의 '새 이름 · 파일 연결 · 그 밖')·"CSS를 연결한 파일에 저장"(내보내기 ▾) 항목이 보인다.
- "파일에 저장"은 첫 번째에 저장할 파일을 고르고, 그 뒤에는 같은 파일 핸들을 덮어쓴다. "파일 연결해 열기"로 연 파일도 그 핸들로 저장된다. 저장하면 변경 수가 0으로 돌아간다.
- 다른 글꼴을 불러오거나 이름을 바꾸면(새 글꼴로 복제) 핸들을 잊는다 — 다음 저장은 새 파일을 고른다. 사용자가 선택 창을 취소하면 아무 일도 하지 않는다.
- 지원하지 않는 브라우저에서는 두 버튼이 숨고 CSS 내보내기(다운로드)가 그대로 동작한다.

## 공용 도구와 표 (S6)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) S6 '공용 유틸로 중복 줄이기'. 2026-10-19 브랜치 `feat/studio-s6a`. 전에는 모듈마다 손으로 적은 사본이었다([비판 검토](../NOTES/studio-review-2026-10-18.md) §5).
- `authoring/font-studio-util.js`(`window.FontStudioUtil`, Node `require`) 하나가 든다. 얼린 객체라 한 모듈이 다른 모듈의 표를 바꾸지 못한다. 공개 내보내기로 표를 내주던 모듈(`Bundle.ROLE_TEXT`·`DesignRules.EFFECT_TEXT`·`Draw.STAGES` 등)은 사본을 내준다(전처럼 바꿀 수 있다).
  - 자료: `clone`·`stableJson`·`fnv1a`·`hashPair`. 해시·JSON 글은 저장되는 값(판 번호 `contentRev`·묶음과 검수 지문·규칙 id·임시 이름)을 만든다. 글자 하나라도 바꾸면 저장한 기록과 어긋나니 고치지 않는다(`tests/studio_f/util.test.js`가 값을 고정한다).
  - 한글: `CHO`·`JUNG`·`JONG`·`compose`·`decompose`·`ROLE_LABELS`, 디자인 영향 `IMPACT_EFFECTS`·`IMPACT_TEXT`.
  - 그릴 단계: `STAGE_ORDER`·`STAGE_NAMES`·`STAGE_JAMO`(`spec/authoring-stages.json`·조립식 목록 거울과 시험이 대조).
  - 계층: `LAYERS`·`TUNE_LAYER`·`LAYER_STATEMENT`·`TUNE_STATEMENT`(린트 생성 요약 `DIGEST`와 시험이 대조 — 린트 자신은 `DIGEST.layers`를 쓴다).
  - 파생 글꼴 바탕 구간: `DERIVED_BEGIN`·`DERIVED_END`·`derivedSection`(`font-derive.js`의 `parse`와 모델의 `derivedRange`가 함께 쓴다).
  - 화면: `element(태그, 클래스, 글)`·`download(이름, 글|Blob, 형식)`.
- authoring 파일을 브라우저에서 낱으로(classic script) 싣는 쪽은 이 파일을 먼저 싣는다. Node `require`와 `authoring/index.js`·`index.mjs`, 작업실 페이지는 저절로 싣는다. 런타임(`font-kku.js`)과 렌더러는 쓰지 않는다(런타임의 `stableJson`·해시는 제 사본).

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
- 파생 글꼴: `derivedRange(text)` → `{ start, end, base }`(구간, 없으면 null — `parse`가 구간 안 규칙·레이어 블록에 `locked`를 달고 `doc.locked`에 둔다), `handEdits(pristine, edited)` → `{ css, tune, problems }`(고친 것을 바탕 뒤에 붙일 손 보정 레이어 블록으로). 바탕 옮기기·머리말·바탕 새 판 받기·통째로 풀기는 `FontKkuDerive`(`authoring/font-derive.js`: `derive`, `block`, `parse`, `header`, `rebase`, `upToDate`, `flatten`, `retitle`, `digest`, `SHIPPED_FONTS`).
- 값·텍스트: `offsetAdd`, `parseLengthSum`, `normalizeValue`, `lineDiffCount`, `rewriteUrls`, `extractAtRules`, `createHistory`, `slotFamily`, `pageOnlyVariables`.
- 생성 블록: `SLOT_CONTRACT`(부모·역할·출력 여부·기본값), `SLOT_SUFFIXES`(접미사·type·roleFallback), `PAGE_ONLY_VARIABLES`(레지스트리 `declaredBy: page`)는 `check_css_contract.js --write`가 만든다(`--check`가 낡은 블록을 거부). 검사 모듈의 `lint-registry` 블록과 같은 생성기에서 나온다.

`FontKkuLint`(브라우저 `window.FontKkuLint`, Node `require("authoring/font-kku-lint.js")`, 모델 다음에 불러옴): `lint(cssText, { fileName, digest })` → `[{ severity, code, message, line, column }]`, `CODES`(코드 → 설명), `DIGEST`(생성된 레지스트리 요약), `format(findings, fileName)`, `classifySelector(complex, fontId)`(대상 종류·문맥·자모 조건·기대 레이어), `checkValue(name, value)`.

## 한계와 다음 단계
- 옛 Sprite Editor PoC의 자소판 기능은 재료 탭으로 모두 옮겼다(2026-10-09 — 사각형, 다시, 자소판 비우기·전체 다시 채우기, 잉크 비율, 칸 크기·배율 세트 내보내기, 래스터 품질, 미리보기 PNG 칸, 작은 글씨 프리셋, 광학 보정, CSS 복사). PoC의 별도 작업 초안 버튼(Save/Load Draft)은 작업실 자동 초안이, 미리보기 글꼴 원천 전환(그림 자소 / 기본 글꼴 / 이름 지정 글꼴)은 일반 글꼴 편집이 대신한다.
- 2단계 겹침 판정의 canvas 다시 그리기는 브라우저의 텍스트 그리기와 완전히 같지 않다(회전·`inset()` 밖의 clip-path는 반영하지 않는다, 얇게 맞닿은 획은 몇 %p 차이가 난다). 그래서 경고 수준에 두고 릴리스 관문은 Python 감사다.
- `@container`/`@scope` 조건은 평가하지 않고 "미확인"으로 적용한다. 그런 규칙이 값을 공급하면 편집 대상에서 제외하고 알린다.
- 참조 글꼴 IoU 적합은 개발 도구(`scripts/glyph_fit.py` 등)에 남아 있다.
- 규칙 목록 칸은 조각마다의 소스(`bindings`)·대체 소스(`fallbackSources`)를 고르지 않는다 — 고칠 때 잇기만 하고, 새로 줄 때는 조립식 비교(binding)나 JSON 칸으로(S5-B, 2026-10-19 — 전에는 문맥 규칙 탭이 목록·지우기만 하고 더하기는 JSON으로만).
- 디자인 도구(계획 F)가 일부러 만들지 않은 것 — 설계와 부딪히거나 런타임 계약 결정이 먼저다:
  - 위 자모를 따라가는 조각 보정(§5.5 linked-adjustment): 디자인에 조각별 변환이 없다. 조각 보정은 떼어 낸 독립 SVG에서만 한다.
  - 글꼴 낱자 → SVG 바꾸기(§6.6): 제안하지 않는다.
  - `display.detail`, 묶음의 TTF 내보내기·주소(#) 공유(선택 항목).
- 조립식 목록·DOM 떼어 내기·요청 되짚기는 런타임 계약을 따른다. 규칙 선택은 공통 순수 모듈로 합쳤고 시험이 어긋남을 잡는다:
  - 조립식 목록 `authoring/font-studio-recipe-catalog.js`: `build_studio_recipe_catalog.js --check`와 Node 대조(정본 투영·런타임 생성 구간).
  - 출처 패널의 규칙 풀이(`ruleWinners` — 공통 순수 선택기 사용, `designRequests`의 요청 되짚기는 별도): Node 약 11만 요청과 스모크(미리보기 모든 노드)가 `planJamo`·`traceOf`의 rules와 대조.
  - 떼어 내기의 잡기: 런타임 내부 꼴인 노드 em 인라인 변수 `--fy-el-*`와 `svg[part=vector]`를 읽는다. 그림 든 선 원소의 상자 두께는 코어 CSS `--fy-el-t`처럼 `--fy-el-w × --fy-el-k × --fy-el-density`(밀도 굵기 계수 — 촘촘한 자모는 1보다 작다, ADR-024 §3)다. `placeElement` 꼴이 바뀌면 떼어 낸 모양이 말없이 어긋나므로 스모크 `assert_studio_f_draw_detach`가 떼기 전·후 잉크 IoU(0.85 이상)로 지킨다.
- `registerJamo`에는 지우기가 없어 영향 목록의 임시 그림 세트는 고정 이름(`studio-impact-a`·`-b`, 한쪽 세트가 여럿이면 `-a-2` …)을 돌려 쓴다. 임시 디자인은 `unregisterDesign`으로 지운다(없는 런타임이면 내용 주소 이름이 세션 동안 남는다).
- 글꼴 재료 스모크(F2·F3·F7)는 macOS 글꼴(Apple SD Gothic Neo)과 없는 글꼴 이름의 대체 의심에 기댄다. Linux·Android에서는 identity 결과가 다르다.
- 디자인 API(`validateDesign`·`{ replace: true }`·`DESIGN_UNSUPPORTED_FONT`)는 0.1.1부터다. 공개 사이트가 그보다 앞선 판을 쓰는 동안 디자인 패널은 숨는다(`unavailable`).
- 공개 사이트(font.tty.link)는 npm 공개본 런타임을 쓰므로 디자인 API가 들어간 판이 공개되기 전에는 디자인 패널이 숨는다.

## Change Log
- 2026-10-19: S6-C 첫 화면(브랜치 `feat/studio-s6c`) — 머리 막대 바로 아래 미리보기(문장 칸·페이지 안내·파생 글꼴 줄은 그 아래, 알림 한 줄은 막대 안), 쉬운 모드 디자인 '접기'는 정밀로·검수 꾸밈·바탕은 견본 아래, 작업실 스크린숏 기준선 `tests/studio_screens.py`. 위 '첫 화면과 스크린숏 기준선 (S6)'
- 2026-10-19: S6-A 공용 유틸·죽은 코드(브랜치 `feat/studio-s6a`) — 손 사본(자모 표·역할 이름·`clone`·`stableJson`·`fnv1a`·해시 짝·계층 상수·단계 이름·파생 구간 읽기·영향 문구·`download`·요소 만들기)을 `authoring/font-studio-util.js` 하나로, 쓰이지 않는 함수(`openCssFile`·`openProject`·모델 `stripComments`)와 옛 글꼴 모양 물음 길(`askShape`)·CSS 규칙 걷기. 위 '공용 도구와 표'
- 2026-10-19: S6-B 성능(브랜치 `feat/studio-s6b`) — 자소판·검수 화면 모듈을 페이지 무리로(`data-studio-lazy-pages`·`-needs`, `module` 사건, 싣기 전 검수 기록은 그대로 넘김), 값 고침의 `refreshAll` 다시 부르기·감춰진 살펴보기 판 그리기를 걷고 같은 범위 '현대 한글 n자' 다시 세기를 그린 뒤로, 재기 스크립트 `scripts/measure_studio_perf.py`. 위 '모듈 수명과 지연 싣기' S6 절
- 2026-10-19: S5-B 디자인 규칙·고치기 남은 것(브랜치 `feat/studio-s5b`) — 규칙 목록 하나(문맥 규칙 탭을 합침, 목록에서 더하기·고치기·지우기 — 한 번이 기록 한 줄, JSON 길과 같은 디자인), '이 모양과 맞지 않는 규칙' 한 칸(막음·경고, 글꼴 모양 아래 — 쉬운 모드에도), 머리 음절 조각 말풍선이 글자를 가리지 않는 자리(없으면 미리보기 아래 칸), 자리·자리 가족의 '현대 한글 n자'가 가려진 글자를 뺌, 쉬운 모드 그림 세트·규칙 이름은 한국어·건수, 휴대폰 재료 단추
- 2026-10-19: S5-C 검수 다듬기(PLAN-STUDIO-002 S5, 브랜치 `feat/studio-s5c`) — 검수 칸 꾸밈·바탕 바꿔 보기(지연 싣는 `looks`, 판정 기록 `reference.look`·`background`는 참고만), 정밀 모드 차이 칠하기(합성으로 칠하고 서명으로 같은지 말함), 자동화 계약 `checks()`(읽기 전용 린트·겹침 — devsite 일꾼이 안쪽 창구 대신 쓴다)
- 2026-10-19: S5-A 그리기 다듬기(브랜치 `feat/studio-s5a`) — 여러 칸 SVG 한 번에(AI 답을 칸 이름으로 나눠 미리 보고 한 걸음으로, 자동화 계약 `draw.importSvg(글)`), 남은 칸 한 번에 부탁하는 글, 부분 회전, 문장 미리보기 '다 그린 칸만', 쉬운 모드 그리기 칸의 개발 식별자 걷기. 위 '그리기 다듬기 (S5-A)'
- 2026-10-18: S4 편집 범위 화면(S4-B, 브랜치 `feat/studio-s4b`) — 바뀔 곳 "미리보기 n곳 · 현대 한글 n자"(지연 싣는 `font-studio-reach.js`, `api.edit`의 `affected.total`), 손잡이(누르는 상자 16·44px, 회전 5°·Shift 15° 맞춤과 돌리는 축 80px, 끄는 동안 말풍선), 대상이 없는 손잡이도 까닭과 함께 감춤, 정밀 모드 값 칸은 보이는 값(`FontStudio.visibleValue`, `api.edit({ visible })` — `set`은 그대로)과 한국어 속성 이름, '그릴 문자'·'문자 후보'는 글자로 만들기 글꼴에서만, 머리 음절 안 조각과 '낱으로 나눠 고치기'
- 2026-10-18: 짓는 방식(ADR-034, PLAN-COMPOSE-001 C3) — 디자인 머리 아래 접힌 칸: 쉬운 모드 그림 단추 여섯(견본 '화 흙', 못 짓는 프리셋은 까닭과 함께 막음), 정밀 모드 축 셋·지원표·조립식 고리. 디자인이 걸려 있으면 디자인 `composition`, 아니면 글꼴 CSS(`--fy-font-composition` 한 줄, 글꼴 제 낱 깊이와 부딪칠 때만 낱 깊이도, 고정 모양은 tune). `FontStudio.composition`, `setStructureVariables`·`structureValue`, `api.setComposition`·`info().composition`, 거절 `COMPOSITION_INVALID`
- 2026-10-18: S3 두 모드(S3-A) — 머리 막대의 '쉬운 / 정밀'(기억·주소·mount 차례), 쉬운 고치기 판(뜻 범위 셋·지금 보이는 값의 막대와 숫자·한국어 경고와 해결 단추·휴대폰 아래 판), 쉬운 모드 화면 말('자세히' 감춤·짧은 검사 안내·경고 한 줄), 쉬운 모드만으로 저장까지(제안 이름으로 바로), 정밀 모드 CSS 원문 고쳐 쓰기(⚑6), 글꼴 모양 바꾸기 단추를 고치기 페이지에서 뺌(⚑9, `FontStudio.shapeChange`)
- 2026-10-18: S2 머리 막대 — 글꼴 고르기 ▾(22개 견본 + 내 글꼴), 열기 하나, 저장 하나(처음 저장 대화상자), 내보내기 ▾(CSS만·복사·연결한 파일·내 페이지 코드·묶음·TTF·PNG·.jamo.js·통째로 풀기), 되돌리기·다시는 하나의 기록 전체(툴팁), 저장 상태·창구 판 충돌 줄, 새 이름·파일 연결은 접힌 '그 밖'으로. `<select data-studio-shipped>`·`[data-studio-load]`·CSS 열기·프로젝트 열기 칸은 없어짐(열기 하나·`openShipped`)
- 2026-10-18: S2 글꼴 묶음과 저장 창구 — `font-kku-font-package` v1(`authoring/font-studio-package.js`), '프로젝트 저장'·초안이 묶음을 쓰고 옛 형식(프로젝트 v2·초안 판 1·디자인 묶음·디자인 JSON·CSS)을 모두 읽음, 저장 창구(`studio/font-studio-store.js` local·http·relay, 저장 창구 HTTP 약속 v1), `FontStudio.save`·`saveNeedsChoice`·`openAny`·`package`·`store`·`reloadFromStore`, mount `store`·`storeUrl`·`exportPackage`, `api.snapshot`의 `package`·`contentRev`, 거절 표에 저장·열기 코드.
- 2026-10-18: S2 하나의 기록 — 글꼴 CSS·디자인·그림·자소판·검수·디자인 끄기를 한 시간축(`createTimeline`, `FontStudio.timeline`)에. Ctrl+Z·기록 칸은 전체의 마지막 일, 갈래별 단추는 그 갈래의 마지막 일. 개수 60 대신 크기 상한(192MB·1,000줄). 편집 기록 칸을 모든 페이지 맨 아래로, 지난 시간 타이머는 펼쳤을 때만. `api.history()`는 시간축 그대로
- 2026-10-18: S1 자동화 계약 v1 — `FontStudio.api`(결과·거절 코드·사건·미리 셈·제한시간·행위자), 거절 표 `authoring/font-studio-refusals.js`(화면 알림과 같은 줄), 모델 `declarationDiff`·`contentRev`, mount `call`·`on`·`off`·`mode`, 검수 기록의 선택 필드 `actor`, 보기 이름(`data-studio-mode`).
- 2026-10-18: S0 결함 고침([PLAN-STUDIO-002](../PLAN/studio-redesign.md), [비판 검토](../NOTES/studio-review-2026-10-18.md)) — 기본 제공 글꼴 22개와 모르는 id 대체, 네모꼴 기본 범위와 한 손짓 한 대상, 바뀔 곳, 되돌리기 단축키·글꼴 모양 바꾸기 묻기, CSS만 내보낼 때 빠지는 것 알림, `setValue` 결과, 저장 안 한 편집 묻기, 페이지별 알림, 감춰진 페이지 일 멈춤·`compare()` 바로잡기, 런타임 진단 보이기, 디자인 JSON 저장 원본, 그리기 편집 칸 고정, 자소판 편집이 CSS를 바꾸지 않음, 검수 지문·항목별 다시 검수·판정 어휘.
- 2026-10-17: 작업실 페이지(사용자 결정 — 페이지 나누기): 디자인 · 고치기 · 자소판, 한 문서 안 `?page=`, 머리의 페이지 고리와 줄인 파일 막대, 작업실 안내(긴 접는 칸)를 페이지마다 한 줄 설명으로, 디자인·자소판 페이지에서는 누르면 고르기만, mount `page` 옵션, 확장 훅 `page`
- 2026-10-17: 직접 조작(PLAN-STUDIO-001 P0, 작업실 검토 §1·§2·§5·§6·§7) — 잉크로 고르기와 같은 점 다시 누르기, 손잡이 틀(크기·회전)과 `+ − [ ]` 키, 끄는 동안은 끌기 시트만(뗄 때 한 번 적음), 미리보기 쪽 넘기기와 두드려 고르기. 한계 목록의 '고정 글꼴 모양의 굵기 쪽 보정 변수'(4단계 b에서 됨)를 뺌
- 2026-10-17: ADR-030 4단계 c — 저장 두 갈래: '이 글꼴로 새 글꼴'이 기본 제공 글꼴을 파생 글꼴(바탕 구간 + 손 보정)로 만들고 고친 것을 손 보정으로 옮긴다, 바탕 구간 잠금, 바탕 새 판 받기, 통째로 풀어 저장, 고친 기본 제공 글꼴의 같은 이름 저장 막기(mount `shippedSave`로 연다)
- 2026-10-17: ADR-030 3단계 — 고정 모양으로 바꿀 때 막는 것은 통짜 합자 모음 규칙뿐, 문맥 규칙·자리 변주는 받아 원칙 안내 칸("원칙대로 되돌리기"·"문맥 규칙 지우기")에 보인다
- 2026-10-17: ADR-030 2단계 — 고정 글꼴 모양에서 구조 칸의 깊이 셋을 켜고 tune 계층 바탕 요소 규칙에 적는다(전에는 "배치 프로파일이 정함"으로 흐렸다)
- 2026-10-17: 2026-10-14 바꿈의 남은 곳 정정 — 머리말의 기본 디자인을 세벌식으로, 첫 화면 미리보기 바탕 요소의 `data-fy-layout`을 `sebul-cases-v1`로(`assert_font_studio_design`의 맨 주소 단언과 같다)
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

## 검수 페이지와 저장 환경 (ADR-031)

`?page=review`에서 문장을 16·24·48px로 보고 판정(통과 `pass` · 고칠 것 `needs-fix` · 보류 `hold`)과 메모를 남긴다. 판정 없는 항목은 미검수, 그린 모양이 바뀐 항목은 다시 검수다. 보류는 미검수와 따로 센다. 선택한 문장을 고치기 페이지로 보내고 검수로 돌아오면 고치기의 미리보기 문장이 원래대로 돌아온다. 시각은 지역 시간으로 보인다.

지문(2026-10-18 S0 D9, 사용자 결정 ⚑8)은 글꼴 내용(CSS·디자인·자소판·그림 지문)과 런타임·의존성이다. UA·화면 배율·창 크기는 참고(`reference`)로만 남겨 기기를 바꿔도 판정이 그대로다. 내용이 바뀌면 판정마다 적어 둔 그 항목의 그린 모양 서명(`renderSignature` — 화면 밖 48px 무대에서 노드 구조·글자 칸 기준 자리·칠을 읽는다. 그림 자소는 그 칸의 화소)과 견주어 바뀐 항목만 다시 검수가 된다. 같은 주소의 바깥 자산이 내용만 바뀐 것은 서명이 잡지 못한다 — 저장 환경 칸이 '확인 못함'으로 보인다. 기록은 판 2이고 판 1(`pass/fail/pending`)을 읽어 바꾼다(`fail`→`needs-fix`, `pending`→`hold`). 판 2 기록을 옛 작업실이 열면 검수 부분을 버린다.

`authoring/font-studio-review-model.js`는 기록의 검증·지문·판정을 담당한다. 프로젝트와 자동 초안에 선택적 `review`를 저장한다. 옛 프로젝트와 지원하지 않는 검수 기록은 빈 기록으로 열고, 항목별 유효한 판정만 복원한다. 환경 기록이 유효하지 않으면 미확인으로 표시한다.

`authoring/font-studio-reproducibility-model.js`는 런타임 판·배치 revision과 자원 지문을 기록·비교한다. 저장한 `reproducibility`는 열기나 저장으로 갱신되지 않는다. 바뀐 것과 확인할 수 없는 것을 검수 화면에 보이고, 현재 환경을 받아들이는 동작으로만 갱신한다. CSS 복사의 판 고정이나 구간 표시를 푸는 기능은 코어 배치·런타임·외부 자산까지 고정하지 않는다. 같은 의존성이라도 브라우저·기기 글꼴의 화소 동일성을 보장하지 않는다.

**꾸밈·바탕 바꿔 보기(S5-C).** 검수 칸(16·24·48px와 120px 머리글, 기준 칸도)을 테마의 꾸밈(`kku-look-*`, `spec/themes.json` `looks`)과 바탕(`tones`)에 얹어 본다 — 실제 크기·바탕에서 읽히는가를 보는 사람 검수 기준(MEMORY 2026-10-13). 쉬운·정밀 모두에 있다. 바탕의 기본 '꾸밈에 맞춤'은 고른 꾸밈의 바탕(네온 → 어두운 바탕)이고, 꾸밈이 없으면 작업실 바탕 그대로다.
- 보기만 바꾼다. 저장하지 않고 기록 줄·저장 안 한 편집·`change` 사건을 내지 않는다. 그린 모양 서명(화면 밖 무대)에도 들지 않아 꾸밈을 바꿔도 판정이 그대로다.
- 판정을 적으면 본 꾸밈·바탕을 `reference.look`·`reference.background`에 참고로 남긴다(기기 참고와 같은 자리). 이름은 개발·검수 사이트 시트의 `look`·`background`와 같다(테마 id — `neon`, `dark`). 사이트 시트는 꾸밈·바탕이 시트 열쇠에 들어 따로 판정한다 — 작업실은 한 항목 한 판정이다.
- 시험·자동화: `FontStudio.review.view()`·`setView({ look, background })`.

**차이 칠하기(S5-C, 정밀).** 비교 기준이 있으면 '차이 칠하기'를 켤 수 있다. 크기마다 기준과 지금을 같은 자리에 겹쳐 그린다.
- 칠하기는 화소를 읽지 않고 합성으로 한다(`studio/font-studio-review.css`): 층마다 잉크를 검정 실루엣으로 만들고(`brightness(0)`), 기준은 빨강·지금은 파랑으로 물들여 곱한다. 둘 다 있는 잉크는 검정, 기준에만 있으면 빨강, 지금에만 있으면 파랑이다. 같은 문서·같은 크기라 장치 배율도 같다. 꾸밈·바탕은 쓰지 않는다.
- 같은지는 글자마다 그린 모양 서명(색은 빼고, 자소판 칸은 자리만)으로 견줘 "N px에서 다릅니다 — 한 …" 또는 "같습니다"로 말한다. 기준 전용 이름(기준 디자인·그림 세트·글꼴 이름)은 지금 이름으로 맞춘 뒤 견준다. 자소판 그림이 기준과 다르면 서명으로 견주지 못한다고 말하고 칠한 그림을 보게 한다.
- 켤 때 칸을 만들고, 끄면 지금 칸이 글꼴 시트를 놓는다(모듈 수명). 시험·자동화: `FontStudio.review.setDiff(on)`·`diff()` → `{ state: same|different|unknown, sizes, letters }`.

검수의 "비교 기준 저장"은 CSS·디자인·재료의 상태 하나를 저장한다. 기준과 현재를 각각 격리해 같은 실행 환경에서 그린다. 이전 브라우저의 화면을 복원한다는 뜻은 아니다. 보관되지 않은 외부 자소판/그림 세트 등으로 기준을 재현할 수 없으면 비교 불가 이유를 보인다. 비교 기준은 명시적으로 갱신하고 프로젝트·초안에 함께 저장한다.

## 모듈 수명과 지연 싣기 (PLAN-STUDIO-002 S1)

**수명.** `FontStudio.f.mount(id, { …, pages?, mode?, activate?(ctx), deactivate?() })`(`studio/font-studio-f-shell.js`). 모듈이 '깨어 있는' 조건은 넷이다.
- 칸이 `[hidden]`이 아니다(탭·재료 `modes`·`group`은 예전 그대로 가린다).
- 지금 작업실 페이지가 그 칸의 페이지다. `pages`가 없으면 칸을 둘러싼 `[data-studio-pages]`를 따른다.
- 디자인 본문 안의 칸이면 본문이 펼쳐져 있다.
- `mode`가 있으면 작업실 모드가 같다(`[data-studio] data-studio-mode`, 없으면 `precise`).

깨면 `activate(ctx)`, 잠들면 `deactivate()`를 부른다. ctx 도우미로 단 것은 잠들 때 걷힌다.
- `on`·`onRender`: 작업실 훅
- `listen`: DOM 사건, design·draw의 on/off 사건
- `setTimeout`·`setInterval`
- `lease(root, chrome)`: 미리보기 root가 글꼴 시트를 받게 한다. 잠들면 `FontStudio.removePreviewRoot`로 놓는다.
- `work()`: 한 일을 센다.

칸이 없는 모듈은 `f.lifecycle(id, { pages, element?, activate, deactivate })`를 쓴다. 지금 검수(`review`)와 디자인 비교 칸(`compare`)이 이렇게 붙는다. 비교 칸은 수명 보고와 일 세기만 맡긴다. 접기를 바꾼 그 자리에서 `compare()`가 맞아야 해서, 깨고 잠드는 때는 디자인 모듈이 직접 맞춘다.

`onShow`·`onHide`(칸 `[hidden]`이 바뀔 때)는 그대로 돈다. 늦게 싣는 모듈의 탭 자리(`placeholder: true`)를 그 모듈이 같은 id로 붙이면 처리기만 이어받는다.

- 시험·측정 창구: `f.active(id)`, `f.awake()`, `f.workCounts(reset)` → `{ id: { works, flips, active } }`.
- 수명에 올린 것: 그리기(41칸·문장), 독립 SVG, 문자 매핑, 조립식 후보, 글꼴 팔레트, 출처(살펴보기가 보이는 디자인·고치기 페이지), 편집 기록 타이머, 검수 페이지.
- 고치기·자소판 페이지에서 고칠 때 이 모듈들은 타이머·rAF·그리기를 걸지 않는다. 기준 `398091c`에서는 렌더마다 그리기·문자 매핑·출처·조립식·검수·독립 SVG가 타이머를 걸었다(`tests/test_studio_s1_lifecycle.py`).

**검증.** 잉크 상자·음절 안 겹침·손잡이 자리는 고치기 페이지가 보일 때만 렌더마다 돈다(120ms 뒤).
- 다른 페이지에서는 `data-checks-ready="stale"`로 미뤄 둔다. 고치기 페이지로 가거나 `settled()`·`overlaps()`가 청하면 바로 돈다.
- `FontStudio.idle()`은 할 일이 없는지 알려 준다. 글꼴·핵심 시트가 실렸고, 검증이 끝났고(밀렸으면 청한다), 재료·디자인이 바쁘지 않고, 싣는 모듈이 없을 때다.
- `settled()`와 mount 다리(`bridge.js`)가 이 조건을 함께 쓴다. 그래서 `settled()`의 뜻(검증까지 끝남)은 그대로다.
- 구문·글꼴 계약 경고(파일 줄 `[data-studio-diagnostics]`)는 모든 페이지에 보이므로 지금처럼 고칠 때마다 돈다.

**지연 싣기.** `studio/font-studio-lazy.js`가 맡는다.
- 처음 화면에 필요 없는 모듈은 `index.html`에 `<script type="text/x-font-studio-lazy" data-studio-lazy="<무리>" src="…">`로만 적는다. 브라우저는 이 type을 받지 않는다.
- `FontStudio.need(이름) → Promise<모듈>`이 적힌 차례대로 싣는다. 주소는 정적 태그와 같은 문서 기준이라 npm 패키지·mount iframe·file://에서 모두 같다. 두 번 싣지 않는다.
- `FontStudio.loaded(이름?)`, `FontStudio.loading()`, `FontStudio.lazyModules()`.
- 목록이 HTML에 있으니 `check_distribution.py`가 그 주소도 패키지에 있는지 본다.

| 무리 | 스크립트 | 싣는 때 |
|---|---|---|
| `recipes` | `font-studio-recipes.js` | 디자인 페이지에서 자모를 고르면(고른 채 디자인 페이지로 오면) |
| `provenance` | `font-kku-rule-resolution.js`·`font-studio-provenance-model.js`·`font-studio-provenance.js` | 디자인·고치기 페이지에서 자모를 고르면 |
| `draw`(`drawDetach`) | `font-studio-draw.js`·`font-studio-draw-detach.js` | '그리기 8 → 24 → 40' 입구(처음부터 있는 자리 단추), 주소 `#draw`(mount가 넘긴다), 그림 문서가 든 초안·프로젝트·묶음 |
| `palette` | `font-studio-palette-model.js`·`font-studio-palette.js` | '글꼴 팔레트' 탭이 깨면(탭 자리는 처음부터) |
| `export` | `font-kku-export.js` | 자소판의 글꼴 파일(TTF) 내보내기 |
| `reach` | `font-studio-reach.js` | 고치기 페이지에서 자모를 고르면(바뀔 곳의 '현대 한글 n자', S4), `api.edit`의 `affected.total` |
| `looks` | `authoring/themes-data.js`(전역 `FontKkuThemes` — 자료만) | 검수 페이지가 처음 그릴 때(검수 칸의 꾸밈·바탕 목록, S5-C). 꾸밈 CSS `font-kku-looks.css`는 꾸밈을 처음 고를 때 칸마다 붙인다 |
| `material`(S6) | `font-studio-sheet.js`·`font-studio-material.js` | 자소판 페이지가 보이면, 그림 자소 글꼴(`--fy-material: sprite`)을 열면 어느 페이지에서나(미리보기에 거는 고친 자소판과 저장할 그림을 든다), 그 글꼴에 PNG 열기 |
| `review`(S6) | `font-studio-review.js`(모델 `font-studio-review-model.js`·`font-studio-reproducibility-model.js`는 처음부터) | 검수 페이지가 보이면(`material` 다음 — 자소판 바뀜을 받는다), 자동화 계약 `review.*` |

실린 모듈은 이미 고른 자모·마지막으로 연 프로젝트를 따라잡는다. 그림 문서는 디자인이 `restored`에 들고 있다가 그리기 참가자가 붙을 때 넘긴다.

**페이지 무리(S6).** `index.html`의 늦은 태그에 `data-studio-lazy-pages="<페이지 …>"`를 적으면 그 페이지가 보일 때(처음 연 페이지 포함) 싣고, `data-studio-lazy-needs="<무리>"`는 그 무리를 먼저 싣는다. 무리가 실리면 작업실이 `module` 사건(`FontStudio.moduleLoaded(이름)` — `font-studio-lazy.js`만 부른다)을 내고, 자동화 계약은 그때 늦게 온 모듈(자소판 바뀜)에 붙는다. 싣는 동안 `FontStudio.loading()`이 참이라 `settled()`·mount ready가 기다린다.
- 검수 모듈이 아직 없으면 `projectSnapshot()`이 검수 칸을 불러온 그대로 넘긴다(`FontStudioReviewModel.normalize(불러온 review)`, `reproducibility`) — 실리지 않은 모듈은 기록을 바꿀 수 없으니 실렸을 때와 같다. 자소판은 그림 자소 글꼴을 싣는 사이에만 불러온 자소판을 그대로 둔다. 칸 차례는 모듈을 실은 차례와 상관없이 전과 같다(`material` → `design` → `review` → `reproducibility`).
- 그래서 `FontStudio.material`·`FontStudio.review`는 그 페이지(또는 그림 자소 글꼴)가 되기 전에는 없다. 창구로 쓰려면 `await FontStudio.need("material" | "review")`.

**처음부터 싣는 것과 그 까닭.**

| 모듈 | 까닭 |
|---|---|
| 디자인 | 프로젝트·초안의 자료를 가지고 미리보기에 디자인을 건다. (재료·검수는 S6부터 페이지 무리 — 위) |
| 문자 매핑 | 코어 미리보기가 렌더마다 씨앗 속성을 건다 |
| 묶음·편집 기록 | 디자인 페이지 파일 줄·기록 칸이 처음부터 보인다 |
| 그림 모델 | 묶음 모델이 실릴 때 붙잡고, 검수가 기준 그림을 그린다 |
| 조립식 목록 | 디자인 규칙·그리기가 쓴다 |

실패하면 작업실 알림('… 모듈을 싣지 못해 이 기능을 쓸 수 없습니다')을 띄운다. 그 기능만 못 쓰고, 다시 청하면 다시 받는다.

`bridge.js`의 필수 목록은 핵심만이다: `design`·`f`·`idle`(S6 전에는 `material`·`review`도). 조립식·출처·그리기·팔레트·묶음·편집 기록·문자 매핑이 없거나 늦게 실려도 mount는 죽지 않는다.

측정(2026-10-18, M2MINI01 Chromium, 고치기 페이지 `setValue` → 두 프레임, 중앙값 11회). 값 고침 → 렌더는 바뀌지 않았다. 목표(80ms 이하, JS 절반)는 S6이다.

| 항목 | 기준 `398091c` | S1 |
|---|---|---|
| 처음 싣는 스크립트 | 32개 · 1,865,253 B · gzip 511,628 B | 24개 · 1,572,482 B · gzip 425,349 B(−17%) |
| 값 고침 sebul | 약 49ms | 약 49ms |
| 값 고침 gothic | 약 49–50ms | 약 50ms |
| 디자인 페이지 첫 `settled()` | 약 250ms | 약 155ms(검증을 청할 때 바로 돈다) |

**S6 성능(2026-10-19).** 잰 것은 `scripts/measure_studio_perf.py`(정적 서버를 띄워 `--root` 판을 연다, JSON). 검토(2026-10-18 §3)의 '기본·sebul 약 205ms'는 지금 판에서 다시 나오지 않는다 — 글꼴 넷(sebul·gothic·jikgyeol·retro) × 범위 일곱 × 페이지 넷 × 값 칸·`setValue`·쉬운 막대에서 기준 `2ba3018`의 동기 일은 34–50ms였다. S1의 약 49ms는 '`setValue` → 두 프레임'이다. 검증까지(`settled()`)는 고치기 페이지에서 약 170ms이고 그중 120ms는 일부러 미루는 검증(빠르게 이어 치는 값을 모은다)이다. 그래서 S6은 그린 프레임까지(sync·frame1)를 잰다.
- 값 고침 한 번에 하던 일 셋을 걷었다(원인 — CPU 프로필, `--profile`):
  - `renderPreview`가 `FontKku.render(host)` 뒤에 `FontKku.refreshAll(host)`를 다시 불렀다 — 같은 바탕 요소를 다시 읽고 머리 음절·원소 굵기를 다시 맞추기만 했다(약 6ms). 글꼴 22개 × 열기·값 고침·글 바꿈·되돌리기에서 바뀐 것이 없어 뺐다.
  - 감춰진 살펴보기 판을 그렸다 — 정밀 보기에서 쉬운 막대(약 4ms), 쉬운 보기에서 정밀 값 표(약 5ms). 이제 보이는 판만 그리고, 보기·페이지가 바뀌면 그 자리에서 그린다. 정밀 값 표는 정밀 보기면 페이지와 상관없이 그린다(디자인 페이지에서 값 칸을 쓰는 옛 창구).
  - 같은 자모·범위의 '현대 한글 n자' 다시 세기(약 4–8ms)를 그린 뒤로 미뤘다 — 그동안 앞 수를 보인다(깜박임 없음). 새로 고르면 전처럼 곧바로 센다. 셈이 남아 있는 동안 `idle()`이 거짓이라 `settled()`가 기다린다.
- 처음 싣는 JS: 자소판·검수 화면 모듈을 페이지 무리로 미뤘다(위).

| 항목(중앙값 11회, 부하가 섞인 기계에서 기준·S6 번갈아 두 번) | 기준 `2ba3018` | S6 |
|---|---|---|
| 값 고침 → 첫 프레임, sebul 정밀 `setValue` | 40ms | 32ms |
| 같은 것, sebul 쉬운 막대 | 46ms | 34ms |
| 같은 것, gothic 정밀 / 쉬운 | 42 / 50.5ms | 33.5 / 35ms |
| 같은 것, jikgyeol 정밀 / 쉬운 | 51 / 67ms | 38 / 42ms |
| 처음 싣는 JS, 디자인·고치기 페이지 | 31개 · 2,069,123 B · gzip 563,252 B | 28개 · 1,948,763 B · gzip 527,072 B(−6.4%) |
| 처음 싣는 JS, 자소판 페이지 | 31개 · gzip 563,252 B | 30개 · gzip 551,228 B |
| 처음 싣는 JS, 검수 페이지 | 32개 · gzip 571,361 B | 32개 · gzip 574,361 B |

- 목표 'JS를 검토 때 462KB의 절반 이하'는 페이지 무리만으로는 닿지 않는다. 런타임 `font-kku.js`만 gzip 159KB이고, 작업실 코어 `font-studio.js` 90KB·모델 38KB·그림 모델 31KB(묶음 모델이 실릴 때 붙잡는다)·디자인 28KB·린트 24KB가 디자인 페이지에 필요하다. 다음 수는 디자인 묶음·그림 모델을 그 쓰임(묶음 열기·그림)으로 미루는 것과 압축본(.min) 싣기다. 수치는 참고다(MEMORY '예산은 참고만').

## 쉬운 모드 페이지 (S3)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) '페이지별 보기'(디자인·자소판·검수)·'빼기·합치기·숨기기'·⚑5·⚑9. 2026-10-18 S3-B. 모드 장치(뿌리 `data-studio-mode`, 머리 막대 전환, `?mode=`·mount `mode`)와 고치기 페이지는 위 S3-A 절.

- **감추기**: 정밀 전용 칸은 `[data-studio-precise]`, 쉬운 전용은 `[data-studio-easy]`(`font-studio.css`의 두 줄). 표시만이 아니라 모듈도 멈춘다 — `f.mount(id, { mode: "precise" })`인 모듈(조립식·팔레트)은 쉬운 모드에서 탭도 칸도 보이지 않고(`allowed`가 모드를 본다) 깨지 않는다. 비교 칸은 `f.lifecycle("compare", { mode: "precise" })`이고 쉬운 모드에서는 그리지도 재지도 않는다(`design.compare()`는 화면 밖 무대에서 그대로 맞다).
- **아무것도 강요하지 않는다**(2026-10-18 사용자 원칙 — 간단하게도, 원하면 세세하게): 기본값만으로 글꼴이 된다. 재료·글꼴 모양·그림 세트·채우기 범위는 모두 기본값이 있고 고르지 않아도 된다. '직접 그려 만들기'는 묻지 않고 빈 그림 세트로 그리기를 연다 — 원형 8칸만(또는 그보다 적게) 그려도 그리지 않은 칸은 지금처럼 기본 세트·조립식이 대신 그려 저장할 수 있다. 24·40칸·조립식·팔레트는 고를 수 있는 것이지 단계가 아니다. 진행률은 알리기만 하고 막지 않는다.

| 페이지 | 쉬운 모드 | 정밀 모드에 더하는 것 |
|---|---|---|
| 디자인 | 미리보기(위 — 디자인 칸은 미리보기 아래라 도구를 열어도 밀리지 않는다), 재료 셋 그림 단추(선·원 / 직접 그려 / 기존 글꼴), 글꼴 모양 셋(세벌식·직결식·네모꼴), '네모꼴로 바꾸기…'·'디자인 끄고 글꼴 CSS로…'(먼저 묻는다, ⚑9), 그림 세트 진행률·기본 제공 세트, 그리기 탭, 글자로 만들기, 출처 한 줄(한국어), 접힌 글꼴의 '펼치기' | '미리보기에 디자인 적용' 칸, 디자인 칸 '접기'(S6), 비교 칸, 글꼴 확인, 역할마다 다른 글꼴, 조립식·조각 소스 탭, 팔레트 탭(씨앗 섞기), 출처 다섯 질문, 고급(문맥 규칙·원칙 안내·충돌·디자인 JSON), 파일 줄(디자인 JSON 열기·저장, 묶음 사전 검사) |
| 자소판 | 판 보기, 펜·지우개·굵기, 그리기 되돌리기·다시, 채우기 하나(범위)·비우기 하나(범위), PNG 열기, 빈 칸 목록, 내보내기 진행 | 페인트 통·직선·사각형·색, 안내선, 칸 복사·붙여넣기, 참고·채우기 글꼴, 래스터 품질, 내보내기(PNG 칸·배율 세트·TTF), 작은 글씨 보정(프리셋·광학 보정 — 한 줄 안내) |
| 검수 | 항목, 16·24·48px 문장 + 120px 머리글(문장의 첫 낱말), 꾸밈·바탕 바꿔 보기(견본 아래, S5·S6), 통과·고칠 것·보류, 메모, 이 문장 고치기, 추가 문장 | 비교 기준 저장·지우기와 저장한 기준 칸, 저장 환경 |

- **그리기 입구 하나**: '직접 그려 만들기'(`[data-design-start="svg"]`) = `FontStudio.draw.begin()`(그리기 모듈을 늦게 싣고 재료를 그림 세트로 — 이미 그린 세트가 있으면 그 세트 — 바꾼 뒤 빈 그림 문서로 그리기 탭). 늦게 싣기 자리와 모듈의 '그리기 8 → 24 → 40' 입구 줄(`[data-draw-entry]`)은 남지만 보이지 않는다 — 주소 `#draw`·소개 넘김·시험이 그 단추를 누른다. 기본 제공 그림 세트는 그 아래 칸에서 고른다.
- **진행률 부품** `FontStudio.progress`(`studio/font-studio-progress.js`): `render(ol, FontKku.authoringProgress(...), { target, stageAttribute })` → 단계마다 `li.studio-progress-stage[data-stage][data-have][data-total][data-done][data-target]`(이름·n/m·막대), `text(report)` → 한 줄. 디자인 칸(`[data-design-progress]`)과 그리기 단계 줄(`[data-draw-stepper]`, `[data-draw-stage]`도 단다)이 같이 쓴다. 글자로 만들기의 '준비된 자모와 빠진 자모'는 다른 잣대(문자 후보)라 따로다.
- **글꼴 모양 바꾸기 묻기**(⚑9): 디자인 칸 `[data-design-shape-ask="square"|"off"]` → `[data-design-shape-confirm]`의 확인 단추(`[data-studio-design-square]`·`[data-studio-design-off]` — 작업실 갈고리, `FontStudio.shapeChange`와 같은 길)·취소. 끈 뒤에는 '디자인 다시 켜기'. 이미 네모꼴이면 '네모꼴로 바꾸기'는 감춘다.
- **출처**: 쉬운 모드는 `[data-provenance-line]` 한 줄('ㅇ — 획(원소) · 선·점·원' — 소스 id·세트 이름 없이), 정밀 모드는 다섯 질문 접이(`[data-provenance-fold]`)와 원문 한 줄(`[data-design-trace]`).
- **휴대폰**(560px 이하): 자소판 판 전체는 한 칸 약 30px(640px 폭, 칸 안에서 옆으로 민다 — 전에는 21칸이 약 200px), 칸 편집기는 화면 폭 정사각형, 재료 단추는 한 줄에 하나.
- **뺀 것**(⚑5, 원장): 디자인 '페이지용 코드 복사'·'디자인 JSON 복사'·고급 '디자인 되돌리기/다시', 막대 '새 그림 자소 글꼴'(둘째 입구)·'v1 프로젝트 가져오기'(→ 스크립트), 그리기 '지금 디자인' 문장 미리보기(`draw.sentence().current`는 `null`), 자소판 '미리보기 PNG 칸' 고르기. 창구(`design.undo/redo`·`material.migrateV1`·`material.setPreviewCell`·`material.seedMissing/seedAll/clearSheet`)는 남는다.
- **용어**(화면): 배치 → 글꼴 모양, 네모 문맥 → 네모꼴, '(도장)' 없음, binding → 조각 소스, 문자 매핑 → 글자로 만들기(탭·단추), 지금 배치 → 지금 모양. 디자인 모델 `LAYOUT_LABELS`와 오류 문구도 같이.
- 시험: `tests/test_studio_s3_pages.py`(쉬운·정밀 나눔과 모듈 잠, 첫 화면 미리보기 위·개발 식별자 0, 그리기 입구와 미리보기 자리, 진행률 부품, 글꼴 모양 묻기·되돌리기, 출처 한 줄, 뺀 것·v1 변환, 자소판 채우기·비우기, 휴대폰 칸 크기, 검수 쉬운·정밀), `tests/studio_f/convert_sprite_v1.test.js`.

## 첫 화면과 스크린숏 기준선 (S6)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) S6 '정리'·Success Criteria '쉬운 모드 첫 화면'. 2026-10-19 브랜치 `feat/studio-s6c`.

- **머리 막대 바로 아래가 미리보기다.** 디자인·고치기·자소판 페이지의 `.studio-stage` 차례는 미리보기 → 문장 칸('미리보기 문장' `[data-studio-text]`) → 페이지 안내(`.studio-page-intro` — 머리에서 옮김, 디자인 안내와 '자소를 누르면…' 줄은 하나로) → 고치기 페이지 조작 안내 → 파생 글꼴 줄(`[data-studio-derived]` — 막대 안에서 옮김) → 검증(정밀). 검수 페이지는 미리보기가 없다.
- **알림 한 줄**(`[data-studio-message]`)은 막대(`.studio-bar`) 안 되돌리기·다시 옆의 남는 자리다. 데스크톱(701px 이상)은 단추 줄 가운데에 맞추고 두 줄까지는 막대 높이가 그대로라 알림이 미리보기를 밀지 않는다. 휴대폰은 막대 단추 아래 한 줄(두 줄 자리를 늘 비워 둔다 — S0의 '잘리지 않고 밀지 않는' 규칙 그대로).
- **쉬운 모드 첫 화면 조작**: 디자인 칸 '접기'는 펼친 동안 정밀 모드에서만 보인다(미리보기가 위라 접어도 얻는 것이 없다). 주소에 글꼴을 밝혀 접힌 채 연 칸의 '펼치기'는 쉬운 모드에도 있다. 검수의 꾸밈·바탕 고르개는 견본 아래 판정 칸 위다.
- **잰 값**(`tests/studio_modes.py`, 쉬운 모드, 1440×900 · 390×844): 미리보기 위끝은 세 페이지 모두 169 · 269px(전 322 · 420–459). 보이는 조작은 디자인 16 · 11, 고치기 12 · 11, 자소판 14 · 11, 검수 15 · 15(전 디자인 19, 검수 17). 개발 식별자 0. 디자인 1440의 16은 머리 막대 11 + 문장 칸 + 짓는 방식 + 재료 셋이다 — 짓는 방식은 디자인을 끈 글꼴에서도 고르게 디자인 본문 밖(머리 아래)에 있어야 해서 재료 아래로 옮기지 않았다(기능을 줄여 맞추지 않는다, 원칙 9).
- **스크린숏 기준선** `tests/studio_screens.py`: 네 페이지 × 쉬운·정밀 × 1440×900(배율 1)·390×844(배율 2, 터치) = 16장. 새 브라우저 저장소의 첫 화면(기본 글꼴 sebul·기본 문장 — 주소에 글꼴을 밝히지 않는다, 밝히면 디자인 칸이 접혀 열린다), 움직임·캐럿·스크롤 막대 끔, `FontStudio.settled()`·글꼴 도착·검수 꾸밈 목록 준비를 기다려 창만큼 찍는다. 견주는 법은 `tests/visual_regression.py`(바뀐 화소 비율 0.5%)와 같고, 기준선은 `tests/baselines/<platform-key>/studio/`. `--update`로 쓰고(전후 시트를 보고 — 기준선 다시 쓰기는 사용자 결정), `--out <폴더>`는 기준선 없이 지금 화면만 찍는다(시트). 기준선이 없으면 2로 끝난다. 같은 기계에서 세 번 견주어 16/16(최대 0.0003%).
- 시험: `tests/test_studio_s6_screen.py`(네 페이지 × 두 폭의 위끝·조작 수·개발 식별자·가로 넘침, 두 줄 알림이 미리보기를 밀지 않음, '접기'는 정밀·'펼치기'는 쉬운에도).

## 그리기 다듬기 (S5-A)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) S5 '그리기'. 2026-10-19 브랜치 `feat/studio-s5a`. 모두 고르지 않아도 된다(원칙 9) — 칸 하나 그리기·가져오기·요청 글은 그대로다.

- **여러 칸 한 번에**: SVG 가져오기 칸에 AI 답(설명 글 + `<svg>` 여럿, 코드 울타리 포함)을 통째로 붙이고 '칸마다 나눠 가져오기'(`[data-draw-import-split]`)를 누르면 미리 보기(`[data-draw-bundle]`)가 덩어리마다 한 줄(`[data-draw-bundle-row][data-key][data-state]`)을 보인다 — 새 칸 · 그린 칸을 바꿈 · 칸 이름을 읽지 못함 · 앞과 같은 칸 · 가져오지 않음(도형 검사 거절), 도형 수, 버린 것(쉬운 모드는 수만, 정밀 모드는 원문). 칸 이름은 줄마다 고칠 수 있다(`select[data-draw-bundle-key]`, 41칸 × 문맥 칸, '넣지 않음'). 'n칸 넣기'(`[data-draw-bundle-apply]`)는 편집 하나 'SVG n칸 가져오기'(되돌리기 한 번)다. '이 칸에 가져오기'에 SVG가 둘 넘게 들어 있으면 한 칸에 합치지 않고 같은 미리 보기로 간다(전에는 모두 지금 칸에 합쳤고, 글로 시작하는 답은 받지 못했다). 미리 보는 동안 칸이 바뀌면 새 칸·바꿀 칸을 다시 센다.
  - 칸 이름 차례(모델 `splitSvgBundle`): 뿌리 `<svg>`의 `data-jamo` · `data-key` · `data-cell` · `id` · `aria-label` → 안의 `<title>` → 그 SVG 바로 앞 글 줄(빈 줄·코드 울타리는 건너뜀, 주석 표시·마크다운 꾸밈은 걷음). 꼴: `ㄱ` · `ㄱ@bar` · `ㄱ_jong` · `받침 ㄱ` · `가로 모음 위 ㅂ` · `초성 ㄱ:`. `@cho`는 바탕 칸으로 읽는다(편집기에 `@cho` 칸이 없다). 그 자모에 없는 문맥(`ㅏ@jong`)은 이름 모름. 덩어리가 하나이고 이름이 없으면 지금 칸.
  - 도형 검사는 칸마다 `sanitizeSvg` 그대로다. 글 전체 상한 2MB·덩어리 120개(`BUNDLE_LIMITS`).
- **한 번에 부탁하는 글**: '남은 n칸 한 번에 부탁하는 글 복사'(`[data-draw-import-prompt-all]`)는 지금 단계(`authoringProgress().next`)의 남은 칸(원형 8 단계면 ㆍ도)을 한 벌로 그려 달라고 한다(`promptTargets`·`bundlePrompt`). 답의 꼴은 위 가져오기가 읽는 꼴(`<svg data-jamo="…" viewBox="0 0 100 100">` 하나씩)이고 획 굵기는 그림 문서의 `options.stroke`다. 다 그리면 단추를 감춘다. 칸 하나짜리 'AI 요청 글 복사'는 그대로다.
- **부분 회전**: 고른 획 하나만 그 획 그림 범위의 가운데를 축으로 돌린다(`Draw.rotatePart` — 원은 원, 타원은 경로). 부분 줄의 ↺·↻(`[data-draw-part-rotate]`, 15°), 고르기 도구에서 칸 편집기에 초점이 있을 때 `[` `]` 5°·Shift 15°(작업실 고치기의 회전 키와 같은 손). 돌릴 때마다 기록 한 줄이다.
- **다 그린 칸만**: 문장 미리보기 보기 고르기(`[data-draw-sentence-view]`) — '원형 8만 그린 셈'(기본, 전과 같음) / '다 그린 칸만'. 다 그린 칸만은 지금 디자인으로 그리되 미리보기 문장에서 자모 요청이 모두 그린 칸으로 지어지는 글자만 남긴다(`glyphRequests` → `planJamo(role·context·hasFinal)` → `planUsesDrawnOnly`: 기록 줄이 모두 direct·composed이고 direct는 이 그림 세트 소스). 한글 밖 글자는 빼고, 읽기 줄이 "다 그린 칸으로 n자 중 m자 · 아직 못 짓는 글자 …"를 적는다. 그 줄의 그림자 뿌리는 그 보기를 처음 고를 때 만든다(S3 ⚑5 — 쓰지 않는 보기 몫을 늘리지 않는다). 본 미리보기는 바뀌지 않는다.
- **쉬운 모드 화면 말**: 그리기 칸의 세트 이름(`studio-draw-…`)·칸 키(`@bar`·`@jong`)·조립식 이름·도형 검사 원문은 정밀 모드에서만 보인다. 칸 이름은 'ㄱ 가로 모음 위'처럼 한국어다.
- `FontStudio.draw`에 더한 것: `previewBundle(글, assign?)`(바꾸지 않음) · `importBundle(글?, { assign, fallback, label })`(글을 주지 않으면 미리 본 묶음) · `bundle()` · `rotatePart(key, partId, deg)` · `sentenceView(origin8|drawn)` · `drawnText()` · `aiPrompt(key | { all: true })`, `sentence().drawn`. 모델(`authoring/font-studio-draw-model.js`): `splitSvgBundle` · `bundleImport` · `readCellName` · `isCellKey` · `promptTargets` · `bundlePrompt` · `rotatePart` · `glyphRequests` · `planUsesDrawnOnly` · `drawnOnlyText`.
- 시험: `tests/test_studio_s5_draw.py`(붙여넣기 → 미리 보기 → 칸 고르기 → 넣기 한 걸음·되돌리기 한 번, '이 칸에'가 여러 SVG를 합치지 않음, API 글 모두 아니면 아무것도, 한 번에 부탁하는 글의 꼴과 남은 칸, 실제 마우스로 고른 획만 돌리기, 다 그린 칸만, 쉬운 모드 그리기 칸의 개발 식별자 0), `tests/studio_f/draw_bundle.test.js`(모델 7).

## 규칙 목록과 맞지 않는 규칙 (S5-B)
[PLAN-STUDIO-002](../PLAN/studio-redesign.md) S5 '다듬기'(디자인 '문맥 규칙은 목록에서 더하기', '충돌 상자와 원칙 안내는 하나로'). 2026-10-19 브랜치 `feat/studio-s5b`.

- **규칙 목록**(정밀 모드 고급, `[data-design-rules]`): 디자인의 모든 규칙을 한 줄씩 — 갈래(문맥·고름(`pick-`)·섞음(`mix-`)·규칙)·이름(코드)·'조건 → 결과'(한국어, `FontStudioDesignRules.describeRule`)·고치기·지우기(`li[data-rule-id][data-rule-kind]`). 아래 칸(`[data-design-rule-form]`)에서 자모·역할·짜임(세로·가로·합자모음)·받침 → 소스·짓기·조립식(적은 자모를 만드는 것, 기본이 맨 앞)·늘림을 골라 더한다. '고치기'는 같은 칸이 그 규칙을 고친다(이름·자리 그대로, 칸에 없는 `bindings`(조립식이 같을 때)·`fallbackSources`는 잇는다). 한 번 더하기·고치기·지우기가 기록 한 줄이다(`규칙 더하기: <이름>` 등). 이름은 `rule-<역할|any>-u<16진>`(조건이 있으면 `-<짜임>`·`-final`·`-open`).
  - 칸에서 만든 디자인은 JSON에 손으로 적은 것과 같은 꼴이고 같은 `validateDesign`을 지난다. 걸리면 적용하지 않고 칸 아래에 까닭 한 줄(마지막 정상 디자인·JSON 칸은 그대로).
  - 막는 것(`FontStudioDesignRules.addRule`·`updateRule`의 `refused[]` — `{ code, field, message }`): 런타임도 받지 않는 것(`NOT_JAMO`·`CONDITION_NEEDS_ROLE`·`SOURCE_UNKNOWN`·`RECIPE_MISMATCH`·`NO_RECIPE`·`RULE_EMPTY`·`RULE_COLLISION` — 함께 맞는 같은 구체성 규칙이 다른 값, `Design.ruleCollisions`)와 작업실만의 둘(`ROLE_MISMATCH` — 맞을 글자가 없는 역할, `RULE_DUPLICATE` — 같은 조건 규칙이 이미 있음). 거절 표(`font-studio-refusals.js`)가 아니라 모델 문구다 — 자동화 계약 v1에 규칙 목록 조작은 없다(`design.edit`로 JSON).
  - 고정 모양(세벌식·직결식)에서 짜임·받침 조건을 고르면 막지 않고 칸 아래 한 줄로 알린다(`[data-design-rule-condition-note]`) — 더하면 아래 '맞지 않는 규칙'의 경고가 된다(ADR-030 §5).
  - 창구: `FontStudio.design.addRule(spec)`·`updateRule(id, spec)`·`deleteRule(id)`·`editRule(id)` → `{ ok, id, refused, errors }`. 순수 변환은 `authoring/font-studio-design-rules.js`(`ruleFromSpec`·`ruleSpec`·`describeRule`·`ruleKind`·`ruleChoices`).
- **'이 모양과 맞지 않는 규칙'**(`[data-design-mismatch]`, 글꼴 모양 바로 아래 — 쉬운 모드에도): 막음(`[data-design-conflicts][data-severity="block"]` — 고르려는 고정 모양이 그릴 수 없는 통짜 합자 모음 규칙, "통째 규칙 지우고 바꾸기 / 바꾸지 않기")과 경고(`[data-design-principle][data-severity="warn"]` — 지금 모양의 원칙을 깨는 규칙, "원칙대로 되돌리기 / 문맥 규칙 지우기")를 한 칸에. 전에는 둘 다 고급 안(정밀 전용)이라 쉬운 모드에서는 글꼴 모양을 바꿀 수 없다는 알림만 보였다. 줄은 한국어만(`Design.conflictText`·`collisionText` — 'ㄱ(초성)을 가로모음 짜임일 때만 따로 고름'), 규칙 이름·소스 이름은 정밀 모드에서만 덧붙는다. 고급을 억지로 열지 않는다.
- **쉬운 모드 화면 말**: 그림 세트는 한국어 이름(기본 제공 세트 '둥근·필기·붓 그림 세트', 작업실에서 그린 세트 '직접 그린 세트', 그 밖 '등록한 그림 세트') — 기록 줄 이름(`재료: 직접 그려 만들기 (둥근 그림 세트)`)은 두 모드 같고, 알림·세트 칸은 정밀 모드에서만 id를 붙인다. 알림의 규칙 목록은 쉬운 모드에서 건수(통합 담당이 S5-A에서 찾아 넘김). 휴대폰(560px 이하) 재료 단추는 그림 옆 한 칸에 이름·설명(S3 그림이 첫 칸을 잡아 이름이 한 자씩 접혔다).
- **머리 음절 조각 말풍선**(고치기, S4 '낱으로 나눠 고치기'): 미리보기 안 후보(고른 글자 아래·위·옆, 다른 줄 아래·위, 가장자리 — 넓으면 접은 꼴도) 가운데 고른 글자·조각·손잡이와 다른 글자 잉크를 하나도 덮지 않는 가장 가까운 자리에 뜬다. 들 자리가 없으면 미리보기 바로 아래 칸(`[data-studio-piece-dock]`)에 붙는다 — 휴대폰 쉬운 모드(아래 판이 덮음)는 전처럼 쉬운 판의 한 줄만. 전에는 틀 아래·위·오른쪽 차례로 미리보기 안에 드는 첫 자리라 1440에서 회·값·한·글을 가렸다.
- **'현대 한글 n자'의 가려진 글자**: 자리·자리 가족(바탕 요소 규칙)은 더 가까운 자리 값(`--fy-<더 좁은 자리>-*`)이나 바탕 요소 아래 규칙(자모·문맥 규칙의 같은 변수)이 정하는 자모를 뺀다 — 미리보기 수(`nodesAffectedBy`)와 같은 판정. 작업실이 글꼴 CSS 모형을 넘기고(`reach.count(plans, host, { doc })`), 뼈대는 자리별 노드 색인과 (글꼴 CSS·변수·바탕 속성)마다의 결과를 둔다. gothic 공의 ᄀ(tt) '이 자리 모두': 옹의 ᄋ을 '이 자리의 이 자모'로 위치·크기·회전까지 고친 뒤 2,565 → 2,430자(첫소리 ᄋ 135자). 셈 하나 0.3ms(색인 뒤) — 전에는 바탕 요소 규칙 셈마다 노드 2만여 개를 다시 훑어 약 40ms였다.
- 시험: `tests/test_studio_s5_design.py`(목록 더하기·고치기·지우기와 JSON 길 같음·막는 것, 조립식 칸·고정 모양 알림, 맞지 않는 규칙 한 칸 쉬운 1440·390·정밀, 말풍선이 잉크·손잡이를 덮지 않음 1440·390, 가려진 글자 빼기와 미리보기 같음, 쉬운 모드 세트 이름, 휴대폰 재료 단추), `tests/studio_f/rule_list.test.js`.

## 짓는 방식 (ADR-034, C3)
글자를 어떤 덩어리로 지을지 고르는 칸이다([ADR-034](../ADR/ADR-034-composition-modes.md) §0·§6, [PLAN-COMPOSE-001](../PLAN/composition-options.md) C3). 런타임 쪽 뜻(프리셋 표·차례·진단)은 [브라우저 런타임](browser-runtime-design.md) '짓는 방식 (ADR-034)'이다.
- **고르지 않아도 된다**(MEMORY 설계 원칙 5, PLAN-STUDIO-002 원칙 9).
  - 칸 `[data-studio-composition]`은 디자인 머리 바로 아래(디자인 본문 밖)의 접힌 `<details>` 한 줄이다: '짓는 방식 · 모양대로 — 고르지 않아도 됩니다'.
  - 디자인을 접어도(디자인을 끈 글꼴은 본문이 접혀 있다) 보인다. 기본은 '모양대로'이고 지금 출력 그대로다. 저장에 필요하지 않다.
- **쉬운 모드**: 그림 단추 여섯 `[data-composition-preset]` — 모양대로 · 음절로(화 = 호 + ㅏ) · 겹모음 통째로(ㅎ + ㅘ) · 자모로(ㅎ + ㅗ + ㅏ) · 조각으로((ㅗ+ㅇ) + ㅗ + ㅏ) · 원형으로.
  - 단추마다 지금 글꼴·재료·모양으로 '화 흙'을 그린 견본이 있다(그림자 뿌리 + 코어 CSS + `font-kku`, 글꼴 시트는 `ctx.lease`로 받는다).
  - 프리셋 견본은 페이지 수준 `--fy-composition: <프리셋>`으로 그린다(디자인·글꼴 CSS보다 이긴다 — 자모마다 고른 규칙은 그대로 이긴다).
  - '모양대로' 견본은 디자인 길이면 composition만 뺀 임시 등록, 글꼴 CSS 길이면 페이지 수준 '조각 없음 + 글꼴의 기본 나누기'로 그린다.
  - 런타임 진단(`data-fy-composition-status`)에 `COMPOSITION_UNSUPPORTED`가 있으면 그 단추를 막고(`disabled`, `[data-composition-blocked=true]`) 까닭 한 줄을 보인다. 예: 자소판 글꼴의 조각으로·원형으로. 다른 방식으로 몰래 바꾸지 않는다.
  - 고른 단추는 `aria-pressed="true"`, 요약 줄 `[data-composition-summary]`에 이름이 뜬다.
- **정밀 모드**(`[data-composition-precise]`, `[data-studio-precise]`)
  - 축 셋 `[data-composition-axis=vowel|coda|pieces]`: 모음 나누기(모양대로·낱·통짜·머리 음절), 받침 나누기(모양대로·낱·통짜), 조각 깊이(없음·조각·원형). 프리셋 셋과 같지 않으면 '직접 고름'(`custom`)이다.
  - 지금 그리는 축 `[data-composition-now]`(런타임 `fontInfo(host).composition`)를 보인다.
  - '자모마다 조립식 고르기' `[data-composition-recipes]`는 '조립식·조각 소스' 탭을 연다. 고른 자모가 없으면 고르라고 안내한다.
  - 지원표 `[data-composition-support]`: 글꼴 모양(디자인 길이면 세벌식·직결식·네모꼴, 글꼴 CSS 길이면 이 글꼴) × 프리셋을 화면 밖 시험 그림의 진단으로 '됨/막힘'.
- **적는 자리** — 런타임 차례(ADR-034 §3)와 같은 수준에 적는다. 미리보기 바탕 요소는 페이지 변수를 쓰지 않는다.
  - 디자인이 미리보기에 걸려 있으면(`[data-studio-design]` `data-design-state` `applied`·`pending`) 디자인 `composition`에 적는다. 값은 프리셋 이름 하나, 섞이면 빈 축을 뺀 `{ vowel?, coda?, pieces? }`. `design.edit` 한 번 = 디자인 기록 한 줄이고, 글꼴 묶음에 든다.
  - 아니면(디자인을 끈 글꼴·디자인을 받지 않는 자소판 글꼴 — `?font=`로 연 글꼴은 대개 이쪽) 글꼴 CSS에 `--fy-font-composition` 한 줄을 적는다. 런타임 차례가 낱 깊이 > 프리셋 > 줄임 깊이(ADR-034 §3)라 기본 제공 글꼴(줄임 `--fy-font-jamo-depth`만 씀)에서는 이 한 줄로 바뀐다.
    - 글꼴이 제 낱 깊이(`--fy-font-vowel-depth`·`--fy-font-coda-depth`)를 밝혔고 고른 것과 다르면, 누른 것이 먹게 그 낱 깊이도 고른 값으로 적는다. 정밀 모드에서 축을 섞으면(custom) 다른 축만 낱 깊이로 적는다.
    - '모양대로'는 프리셋 줄을 지우고 낱 깊이는 글꼴을 열 때의 값으로 되돌린다 — 사람이 쓴 낱 깊이를 지우지 않는다(원칙 '원하면 세세하게').
    - 고정 글꼴 모양(세벌식·직결식)은 `@layer font-kku.tune` 바탕 요소 규칙에 적는다(`FontStudio.setStructureVariables` — 전역 변수 칸 '구조'와 같은 길, `--fy-font-composition`도 그 칸에 있다).
    - CSS 편집 한 번 = 기록 한 줄이고, 글꼴 파일(CSS)에 실린다.
  - 글꼴 CSS 길에서 조각 깊이만 고르면(나누기는 모양대로) `--fy-font-composition`에 그 깊이와 같은 이름의 프리셋을 적는다. 글꼴의 줄임 이름이 있으면 나누기는 그것이 이긴다.
  - 디자인을 켜고 끄면 적는 자리가 바뀐다 — 다른 자리에 적은 것은 그 자리로 돌아가야 보인다.
- **창구**: `FontStudio.composition`
  - `current()` → `{ preset, spec: { vowel, coda, pieces }, where: design|css, resolved }`
  - `set(값, { label })` → `Promise<{ ok, refused, composition }>`. 모르는 값은 거절 `COMPOSITION_INVALID`.
  - `presets()`(단추 상태), `support()`(지원표), `open(on)`
  - 자동화 계약: `api.setComposition(값)`(자료만 — mount `call` 가능) → `{ ok, refused, composition, rev }`, `api.info().composition`.
- **수명**(S1): 견본은 `f.lifecycle("composition")` — 칸이 펼쳐져 디자인 페이지에 보일 때만 그린다(접으면 견본 칸이 `[hidden]`). 지원표는 `f.lifecycle("composition-support", { mode: "precise" })`.
- 시험: `tests/test_studio_composition.py`
  - 쉬운 견본과 노드 구조, 고르기 한 번 = 기록 한 줄과 Ctrl+Z, 묶음 왕복과 '모양대로'는 필드 없음
  - 글꼴 CSS 길(gothic)과 고정 모양 tune 계층(jikgyeol), 자소판 글꼴의 막힌 단추와 까닭
  - 정밀 축·지원표·조립식 고리, api·mount, 수명과 휴대폰
