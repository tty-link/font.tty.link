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
  - `EXPORT_UNSUPPORTED_FACE`: 재료가 그림 자소·벡터 자소가 아니다. `error.face`가 `element`·`svg`·`device`·`system` 가운데 하나다.
  - `EXPORT_NO_GLYPHS`: 쓰는 칸 그림에 잉크가 없다.
- 판정은 11,223자를 조립하기 전에 표본 바탕 요소 하나로 한다(`fontInfo().loaded`·`face`, `data-fy-material`, `FontKku.jamoSets()`). 런타임이 필요할 때 받는 중(`data-fy-font-pending`)이면 도착하거나 `font-kku:loaderror`가 올 때까지 최대 10초 기다린다. 표본은 `position: fixed`라 화면을 어디까지 내렸든 바로 받는다.
- `text`는 NFC로 맞춘 뒤 거른다. 한글이 아니라 넣지 않은 글자는 `report.skipped`에 적는다(공백 제외). `report.glyphs`는 글꼴에 실제로 든 글자 수이고, 칸 그림이 비어 매핑하지 않은 글자도 `report.missing`에 넣는다.
- 사이트 입구(시험대 단추, 작업실 재료 탭)는 `code`를 한글 까닭으로 보여 주고 내려받지 않는다.
- 8칸 그림 세트·원소 획을 글꼴 파일로 만드는 길(그림 노드의 칸 아핀을 읽어 `[part=vector]`·`[part=element]`를 래스터로 따기)은 아직 없다. 거절은 그 전까지의 정직한 동작이다.

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

### Negative
- 눌린 자리의 획 보정(`--fy-*-dilate`)과 벡터 자소의 `non-scaling-stroke`는 글꼴 파일에 들어가지 않는다.
- 글꼴 파일은 단색이다 — 재료 색·질감 필터의 색은 빠지고 모양(알파)만 남는다.
- 영문·숫자는 넣지 않는다(기기 글꼴로 대체). 힌팅이 없다.

### Risks
- 자소판 칸 밖으로 그린 잉크는 칸을 넘어 잘린다(칸 경계 2단위 여백 규칙을 지키면 없다).
- 질감 자소판은 외곽선 점이 많아진다 — `minArea`·`tolerance`로 조절한다.

## Related Documents
- ADR: [ADR-011 SVG 자소판](./ADR-011-svg-jamo-sheets.md), [ADR-012 한글 입력기](./ADR-012-hangul-ime-and-fontless-devices.md), [ADR-013 벡터 자소](./ADR-013-vector-jamo.md)
- Architecture: [그림 자소 글꼴](../ARCHITECTURE/image-sprite-fonts.md), [글꼴 작업실](../ARCHITECTURE/font-studio.md)

## Change Log
- 2026-10-10: `font-kku-export.js`, 작업실·시험대 입구, `scripts/export_font_file.py`와 함께 Accepted로 기록
- 2026-10-13: §6 — 넣을 글자가 없으면 `code`가 달린 오류로 거절(빈 TTF를 성공으로 돌려주던 결함), 필요할 때 받기 기다림, `text` NFC·`report.skipped`, `report.glyphs`는 든 글자 수. 시험: Node(가짜 런타임), 스모크 `font-export-refusals`, 작업실 빈 자소판, 시험대 단추
