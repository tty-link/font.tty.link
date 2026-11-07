# ADR-015: 글꼴 파일 내보내기 — 조립 결과를 TTF·WOFF로

## Status
Accepted

## Date
2026-10-10

## Context
그림 자소 글꼴(자소판 PNG·SVG)과 벡터 자소는 폰꾸 런타임이 있어야 보인다. "내 손글씨로 글꼴을 만든다"는 쓰임은 결과를 워드·디자인 도구·메신저·다른 사이트에서도 쓰고 싶어 한다. 런타임은 이미 다음을 알고 있다.

- **자모 그림**: 칸 0–100 좌표의 자소판 칸이나 벡터 칸
- **자모가 음절 안 어디에 어떤 크기로 놓이는지**: 글꼴 CSS의 자리 배치를 브라우저가 계산한 결과

이 둘이면 글꼴 파일을 만들 수 있다. 시험(2026-10-10)에서 19자 TTF(5.1KB)가 브라우저에서 런타임과 같은 모양으로 그려졌다.

## Decision

### 1. 선택 모듈 `font-kku-export.js`
- 입력기(ADR-012)처럼 런타임과 분리된 선택 모듈로 npm에 싣는다(`font-kku/export`, `window.FontKkuExport`, `.mjs`·`.d.ts`·`.d.mts`).
- 순수 부분(외곽선 추적·잘림·TrueType·WOFF 작성)은 Node에서도 돈다. `exportFont()`는 브라우저 전용이고 런타임과 글꼴 CSS가 그 문서에 있어야 한다.

### 2. 자리 변환은 런타임이 조립한 결과에서 읽는다
- 숨긴 바탕 요소(측정용 200px)로 글자를 240자씩 조립(`upgradeAll`)한다. 그다음 자모 노드마다 칸 모서리 표식 셋(원점·가로 끝·세로 끝)을 넣고 위치를 한 번에 읽는다(레이아웃 1회).
- 표식은 노드 안에서 `--fy-sprite-crop-*`·`--fy-sprite-zoom`·`--fy-sprite-cell` 식으로 놓이므로 자소판 칸 위치와 정확히 같다. 세 점에서 칸 → 글자 아핀(회전·기울기 포함)이 나온다.
- 칸은 글꼴이 고른 `--fy-sprite-row`와 자모로 정한다(`r<행>-<자모>`). 노드의 `clip-path: inset(…)`(문맥 잘림)은 칸 이름에 붙여 별도 글리프로 만든다.
- 배치를 JS로 다시 구현하지 않는다 — 문맥 규칙(`:has()`)까지 브라우저가 이미 푼 값을 쓴다.

### 3. 칸 외곽선은 래스터에서 딴다(재료 무관)
- 칸을 캔버스에 256px로 그린다. 자소판은 시트 전체를 칸 256px로 한 번 그려 두고 잘라 쓰므로 SVG가 그 해상도로 다시 그려진다. 벡터 칸은 세트 굵기의 SVG로 그린다.
- 알파에서 외곽선을 딴다: 보간 마칭 스퀘어, 닫힌 윤곽 연결(안쪽이 왼쪽이라 바깥·구멍 방향이 반대), RDP 단순화(허용 4/1000em), 작은 조각 제거(칸 단위 0.6²).
- 같은 길이라 손글씨 PNG도 그대로 된다. 외곽선 추적은 직접 구현했다(GPL인 potrace를 쓰지 않아 MIT 유지).
- 자소판은 같은 출처여야 캔버스 픽셀을 읽는다 — `file://`의 자소판은 막히고, 작업실의 편집 중인 자소판은 blob으로 넘긴다.

### 4. 글꼴 구조 — 칸 부품 + 아핀 복합 글리프
- 칸은 단순 글리프(칸 위 y 880 ~ 아래 y −120, UPM 1000, 바깥 시계 방향)다. 음절은 칸 부품을 아핀으로 놓은 TrueType 복합 글리프다.
- 부품 오프셋에는 `UNSCALED_COMPONENT_OFFSET`을 명시한다 — Apple 렌더러는 기본값에서 오프셋에도 배율을 곱한다.
- `hmtx`의 왼쪽 여백은 각 글리프의 xMin과 같게 둔다 — 다르면 렌더러가 외곽선을 옮긴다(시험에서 실제로 깨졌다).
- 공백(U+0020·U+00A0 0.5em — 런타임 `[part="space"]`와 같음, U+3000 1em)을 넣고, 칸이 하나도 없는 글자는 매핑하지 않아 다른 글꼴로 대체되게 한다.
- 표는 `head hhea maxp OS/2 name cmap(4) post(3) glyf loca(long) hmtx`이고 직접 쓴다. WOFF 1.0은 `CompressionStream("deflate")`로 브라우저에서 만든다. WOFF2는 저장소 CLI가 fontTools로 만든다.

### 5. 입구
- API `FontKkuExport.exportFont({ font, jamoSet?, text?, familyName?, postscriptName?, cellSize?, stroke?, sheet?, root?, onProgress? })` → `{ ttf, woff, report }`, `download(bytes, name)`.
- 글꼴 작업실 재료 탭 "글꼴 파일(TTF)로 내보내기": 편집 중인 자소판(원본 캔버스)과 미리보기 shadow root의 글꼴 CSS로 만든다.
- 글꼴 시험대: 그림 자소 글꼴 5종에 "글꼴 파일 받기 (TTF)".
- CLI `scripts/export_font_file.py`: 저장소를 로컬 http로 열고 헤드리스 Chromium에서 내보낸 뒤 fontTools로 검증한다. `--woff2`를 받고, `--compare`는 표본 음절을 런타임과 비교한다(잉크 IoU).

### 6. 넣을 글자가 없으면 거절한다 (2026-10-13 보강)
- 전에는 원소 획 글꼴(`sebul`·`gothic`), 8칸 그림 세트(`frame: "box"`, 재료 `svg`), 기기 글꼴, 문서에 없는 글꼴, 한글 없는 `text`, 빈 자소판에서 `.notdef`와 공백 셋만 든 TTF(800B 안팎)를 성공으로 돌려줬다. `report.missing`만 보고는 알기 어렵고, NFD·라틴 `text`는 `missing`에도 남지 않았다.
- 이제 `exportFont`는 빈 글꼴 대신 `Error`에 `code`를 달아 던진다(`name: "FontKkuExportError"`, `font`, `jamoSet`).
  - `EXPORT_NO_HANGUL`: `text`에 한글 음절·호환 자모가 없다. 빈 문자열도 해당한다(전에는 '주지 않음'으로 보고 11,223자를 만들었다).
  - `EXPORT_FONT_NOT_LOADED`: 글꼴 CSS가 없다(받기 실패·꺼짐·오타).
  - `EXPORT_JAMO_SET_NOT_LOADED`: `jamoSet`이 등록되지 않았다.
  - `EXPORT_UNSUPPORTED_FACE`: 재료가 글꼴 파일이 되지 않는다. 처음에는 그림 자소·벡터 자소가 아닌 재료를 모두 거절해 `error.face`가 `element`·`svg`·`device`·`system` 가운데 하나였다. 2026-11-06부터는 `device`·`system`만 남았다(§7).
  - `EXPORT_NO_GLYPHS`: 쓰는 칸 그림에 잉크가 없다.
- 판정은 11,223자를 조립하기 전에 표본 바탕 요소 하나로 한다(`fontInfo().loaded`·`face`, `data-fy-material`, `FontKku.jamoSets()`). 런타임이 필요할 때 받는 중(`data-fy-font-pending`)이면 도착하거나 `font-kku:loaderror`가 올 때까지 최대 10초 기다린다. 표본은 `position: fixed`라 화면을 어디까지 내렸든 바로 받는다.
- `text`는 NFC로 맞춘 뒤 거른다. 한글이 아니라 넣지 않은 글자는 `report.skipped`에 적는다(공백 제외). `report.glyphs`는 글꼴에 실제로 든 글자 수이고, 칸 그림이 비어 매핑하지 않은 글자도 `report.missing`에 넣는다.
- 사이트 입구(시험대 단추, 작업실 재료 탭)는 `code`를 한글 까닭으로 보여 주고 내려받지 않는다.
- 원소 획(`element`)과 칸 계약 그림 세트(`svg`, `frame: "box"`)를 글꼴 파일로 만드는 길은 2026-11-06에 생겼다(§7). 그 전(0.1.4-rc.4까지)에는 두 재료를 `EXPORT_UNSUPPORTED_FACE`로 거절했다. 그 뒤로 이 코드는 기기 글꼴 재료만 거절하고, 디자인으로 그린 원소·그림 세트 바탕 요소는 `EXPORT_DESIGN_UNSUPPORTED`로 거절한다.

### 7. 원소 획·칸 계약 그림 세트 재료 (2026-11-06 보강)
- 대상: 원소 획 재료(`element` — sebul·gothic·jikgyeol·malang과 글꼴을 밝히지 않은 세벌식)와 칸 계약 그림 세트 재료(`svg` — `jamoSet` pilgi-box·dunggeun-box·butgeul-box처럼 `frame: "box"`인 세트). 두 재료는 자모 노드 안에 획 묶음(`[part="hoek"]`)과 마디(`[part="element"]`)를 둔다. 마디는 CSS 선(`data-element="line"`, 둥근 끝은 `border-radius`), CSS 고리(`ring`, 테두리가 굵기), 그림 상자(`box`, 안에 `<svg part="vector">`) 가운데 하나다.
- 자리 변환: 자소판 칸처럼 마디마다 표식 셋(원점·가로 끝·세로 끝)을 넣고 한 번에 읽어 마디 → 글자 아핀을 얻는다(§2와 같은 길).
- 칸 외곽선은 §3과 같은 추적을 탄다. 그리는 법만 다르다.
  - CSS 선은 둥근 끝까지 캔버스에 그린다. 고리는 바깥 타원에서 테두리 안쪽 타원을 뺀다. 둘 다 칸 전체(256px)에 늘여 그리고 아핀이 비례를 되돌린다.
  - 그림은 `overflow: visible`이라 획의 반 굵기와 viewBox 밖으로 나간 경로도 화면에 보인다. 칸 래스터가 이것을 자르지 않게 viewBox를 내용 상자(`getBBox`)와 획 굵기의 1.25배만큼 넓히고, 상자도 같은 비로 넓힌다.
  - 그림의 획은 `non-scaling-stroke`라 비례를 늘이면 한쪽 굵기가 늘어난다. 그래서 그림은 화면 비례 그대로(긴 쪽이 256px) 그리고, 빈 쪽은 아핀이 맡는다.
- 칸 나눠 쓰기: 비례가 같은 마디(0.5% 단위로 묶는다 — §3의 1/250em 오차 안)는 칸 하나를 나눠 쓰는 복합 글리프 부품이다. 그림 칸은 칸 이름·그림 내용 지문·화면 비례·획 굵기 비로 가른다. ㄲ의 첫·둘째 ㄱ처럼 칸이 같아도 도형이 다르면 다른 칸이다. 칸 이름에는 `@`를 쓰지 않는다 — `report.clipped`가 `@`로 문맥 잘림 칸을 센다(처음 시안은 그림 칸 이름 `ㄱ@bar`를 잘림으로 셌다).
- 원점: 자소판·벡터 칸은 글자 칸(`[part="glyph"]`)이 원점이다. 원소·그림 세트 재료의 글자 칸은 바탕 요소 안에서 0.15em 내려앉아 있어, 같은 원점을 쓰면 글꼴 파일이 런타임보다 그만큼 위에 그려졌다(처음 시안의 잉크 IoU 0.33–0.57). 이 두 재료는 바탕 요소 상자를 원점으로 삼는다(고친 뒤 0.91–0.94).
- 거절: 디자인으로 그린 원소·그림 세트 바탕 요소(`fontInfo().design`)는 `EXPORT_DESIGN_UNSUPPORTED`로 거절하고 `error.design`에 그 디자인 이름을 싣는다. 디자인은 글꼴 소스 잎(기기 글꼴 글자)을 섞을 수 있어, 획만 내보내면 글자가 빠지기 때문이다. 기기 글꼴 재료(`device`, neon 같은 꾸러미 글꼴)는 그대로 `EXPORT_UNSUPPORTED_FACE`다.
- 보고: `report.unclipped`는 획 묶음의 문맥 잘림(`clip-path`)을 적용하지 않은 수다. 마디가 돌아가 있으면 잘림 상자가 칸 좌표에서 직사각형이 아니라서 적용하지 않는다. 자소판·벡터 세트에서는 0이다.
- 입구: API는 그대로다(`exportFont({ font: "gothic" })`, `exportFont({ font: "sebul", jamoSet: "pilgi-box" })`). 작업실 머리 막대 내보내기 ▾의 '글꼴 파일(TTF)'이 원소 획·그림 세트 글꼴에서도 켜진다(`FontStudio.exportDrawnFont(options)`·`FontStudio.drawnExportFace()`). 디자인이 걸린 미리보기(맨 주소의 세벌식 디자인 첫 화면, 디자인으로 건 그림 세트)는 막힌 채다. CLI `scripts/export_font_file.py`는 바뀌지 않았고 `--font sebul`, `--font sebul --jamo-set pilgi-box`가 된다. 사이트 글꼴 시험대 단추는 사이트 작업 때 맞춘다.
- 시험: `tests/font_kku_export.test.js`(가짜 런타임으로 디자인 거절 두 사례), 스모크 `font-export-refusals`(원소 gothic과 그림 세트 sebul + pilgi-box가 '한글' 두 글자 글꼴로 나오고 기기 글꼴 neon만 거절), `tests/test_studio_s2_header.py::test_export_font_menu_covers_element_face`.

## Alternatives Considered
### 자리 배치를 JS 표로 옮겨 브라우저 없이 만들기
- 장점: Node만으로 빌드된다.
- 단점: 자리·자모·문맥 레벨의 CSS 캐스케이드(`:has()` 문맥 규칙, 페이지 변수)를 다시 구현해야 하고, 글꼴 작업실의 편집 중인 CSS를 반영할 수 없다. 브라우저가 이미 푼 값을 읽는 편이 정확하다.

### 벡터 칸은 경로를 직접 외곽선으로(획 확장)
- 장점: 점이 적고 정확하다.
- 단점: 임의 SVG(채움·필터)와 PNG를 함께 다룰 수 없다. 래스터 추적은 모든 재료에 한 길이고, 256px에서 오차는 1/250 em 수준이다. 획 확장은 나중의 최적화로 남긴다.

### 노드마다 변환을 적용한 외곽선(복합 글리프 없이)
- 장점: 벡터 자소의 `non-scaling-stroke`처럼 눌린 자리에서도 획 굵기를 지킨다.
- 단점: 외곽선이 글자마다 따로라 파일이 수십 배 커지고(복합 글리프 WOFF2 약 20KB) 만드는 시간도 길다. 복합 글리프는 시트 방식과 같은 성질(눌린 자리는 획도 눌림)이다.

### potrace(외곽선 추적 라이브러리)
- 단점: GPL이라 MIT 패키지에 넣을 수 없다.

## Consequences
### Positive
- 그림 자소·벡터 자소·손글씨 PNG가 보통 글꼴 파일이 된다. 한글 11,172자 + 호환 자모 51자를 브라우저에서 6–8초에 만든다. TTF 약 0.6MB, WOFF2 16–35KB.
- 런타임 비교(`--compare`, 검정·획 보정 없이): sprite-system 0.941, 벡터 자소 0.946, 도트 0.940, 도장 0.907, sprite-example 0.885.
- 원소 획·칸 계약 그림 세트도 글꼴 파일이 된다(2026-11-06, §7). 측정은 이 기계(M4 10코어), 헤드리스 Chromium, `scripts/export_font_file.py --compare`, 표본 31자다.
  - 런타임 대비 잉크 IoU: sebul 원소 0.929, gothic 원소 0.915, sebul + pilgi-box 0.935, sebul + dunggeun-box 0.942, gothic + butgeul-box 0.911. 자소판·벡터 글꼴의 0.89–0.95와 같은 수준이다. jikgyeol 원소는 원점을 고치기 전에 0.566이었고, 고친 뒤에는 다시 재지 않았다(sebul과 같은 길이다).
  - 전체 11,223자: sebul 원소 50초·TTF 2.0MB·WOFF2 58KB·칸 170개, sebul + pilgi-box 21초·TTF 796KB·WOFF2 66KB·칸 646개.
  - Chromium·Firefox·WebKit 세 엔진에서 같은 글자 수로 나온다. fontTools가 읽고 WOFF2로 다시 저장한다.

### Negative
- 눌린 자리의 획 보정(`--fy-*-dilate`)과 벡터 자소의 `non-scaling-stroke`는 글꼴 파일에 들어가지 않는다.
- 글꼴 파일은 단색이다 — 재료 색·질감 필터의 색은 빠지고 모양(알파)만 남는다.
- 영문·숫자는 넣지 않는다(기기 글꼴로 대체). 힌팅이 없다.
- 원소·그림 세트 재료는 획 묶음의 문맥 잘림(`clip-path`)을 적용하지 않는다. 마디가 돌아가 있으면 칸 좌표에서 직사각형이 아니라서이고, 그 수를 `report.unclipped`로 알린다. 속 빈 획(꾸밈의 outline)은 속이 찬 획으로 나간다.
- 디자인으로 그린 원소·그림 세트 바탕 요소는 거절한다(`EXPORT_DESIGN_UNSUPPORTED`). 작업실의 맨 주소 첫 화면(세벌식 디자인)과 작업실에서 그려 디자인으로 건 그림 세트는 글꼴 파일이 되지 않는다.

### Risks
- 자소판 칸 밖으로 그린 잉크는 칸을 넘어 잘린다(칸 경계 2단위 여백 규칙을 지키면 없다).
- 질감 자소판은 외곽선 점이 많아진다 — `minArea`·`tolerance`로 조절한다.
- 원소 재료는 런타임 조립 자체가 무거워 전체 11,223자에 50초쯤 걸린다(자소판 글꼴은 6–8초). 작업실은 '수십 초'라고 알린다.

## Related Documents
- ADR: [ADR-011 SVG 자소판](./ADR-011-svg-jamo-sheets.md), [ADR-012 한글 입력기](./ADR-012-hangul-ime-and-fontless-devices.md), [ADR-013 벡터 자소](./ADR-013-vector-jamo.md)
- Architecture: [그림 자소 글꼴](../ARCHITECTURE/image-sprite-fonts.md), [글꼴 작업실](../ARCHITECTURE/font-studio.md)

## Change Log
- 2026-10-10: `font-kku-export.js`, 작업실·시험대 입구, `scripts/export_font_file.py`와 함께 Accepted로 기록
- 2026-10-13: §6 — 넣을 글자가 없으면 `code`가 달린 오류로 거절(빈 TTF를 성공으로 돌려주던 결함), 필요할 때 받기 기다림, `text` NFC·`report.skipped`, `report.glyphs`는 든 글자 수. 시험: Node(가짜 런타임), 스모크 `font-export-refusals`, 작업실 빈 자소판, 시험대 단추
- 2026-11-06: §6 마지막 글머리를 고치고 §7(원소 획·칸 계약 그림 세트 재료 — 마디 아핀, CSS 선·고리 그리기, 그림 viewBox 넓히기, 바탕 요소 원점, 디자인 거절과 `error.design`, `report.unclipped`)을 더했다. Consequences에 측정값과 한계. 브랜치 `chore/review-followup-2026-11-06`(2026-11-06 전체 검토 후속)
