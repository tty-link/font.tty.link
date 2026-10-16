# 그림 자소 글꼴

> Status: Implemented
> Scope: 그림 자소를 활용한 글꼴 저작 경로

## 목표

`font-kku`의 글꼴 저작 경로는 두 갈래다.

1. **CSS 글꼴** — 기기에 설치된 한글 글꼴의 자소를 그대로 쓰고 `--fy-*` 변수로 위치·크기·변형을 조정한다. 현재 브라우저 기본 제공 글꼴은 `sebul`, `gothic`이다.
2. **그림 자소 글꼴** — 자음·모음 그림을 한 장(자소판, SVG 또는 PNG)에 늘어놓고, 코어 CSS가 런타임이 만든 각 자소 노드에 해당 자소 칸만 배경으로 칠한다. 글꼴은 자소판과 행 선택을 `--fy-sprite-*` 변수로만 선언한다.

이 문서는 두 번째 경로의 설계 계약을 정의한다.

## Related Documents
- Architecture: [브라우저 런타임 설계](./browser-runtime-design.md)
- Architecture: [스타일 글꼴 체계](./style-profile-system.md)
- Architecture: [움직임과 변주](./animation-and-variation.md)

## 왜 별도 경로가 필요한가

- **한글 글꼴이 없는 환경 대응.** 임베디드 기기, 독자 OS, 한글 기본 글꼴이 빠진 브라우저에서도 자소판 한 장만 올려 두면 한글이 온전히 그려진다.
- **제작 비용의 자릿수 하락.** 전통 글꼴 파일은 완성형 음절 11,172자를 각각 그려야 한다. 그림 자소 경로는 자음 19 + 모음 21 = **40개 자소 그림** 만으로 같은 범위를 감당한다. 초성과 종성의 같은 자음은 같은 칸을 공유한다.
- **벡터 바깥의 표현.** 픽셀 아트, 손글씨 스캔, 스티커, 사진 콜라주 등 **자소 형태를 벗어난 디자인**까지 허용한다. 자소 자리를 그림·아이콘·사물로 자유롭게 바꿀 수 있다.

## 런타임 계약

런타임은 각 자소 노드에 아래 안정 속성을 부여한다.

| 속성 | 값 예시 | 용도 |
| --- | --- | --- |
| `data-jamo` | `ᄀ`, `ᅡ`, `ᆼ` | 유니코드 조합형 자모 (U+1100–U+11FF) |
| `data-jamo-role` | `choseong` / `jungseong` / `jongseong` | 자모의 문법적 역할 |
| `data-jamo-index` | `0` ~ `18` / `0` ~ `20` / `1` ~ `27` | 해당 역할 표 안의 정수 인덱스 |
| `--fy-jamo-index` | (동일 값의 CSS 변수) | 기존 역할 기반 CSS 계산용 |
| `data-sprite-jamo` | `ㄱ`, `ㅏ`, `ㅇ` | 자소판에서 찾을 호환 자모 |
| `data-sprite-jamo-kind` | `consonant` / `vowel` / `coda-cluster` | 자소판 행 분기 (`coda-cluster` = `coda-depth: whole`의 통짜 겹받침 11종) |
| `data-sprite-jamo-index` | 자음 `0` ~ `18`, 모음 `0` ~ `20`, 겹받침 `0` ~ `10` | 종류(kind)별 행 안의 열 인덱스 |
| `--fy-sprite-jamo-index` | (동일 값의 CSS 변수) | 코어 그림 자소 재료 규칙의 열 계산용 |
| `data-fy-role` | `choseong`, `jung-base`, `jung-tail`, `jong-main`, `jong-left`, `jong-right` | 세분화된 그리기 역할 |
| `data-fy-pos` | `tlo`, `tlc`, `ml`, `bbrs` 등 | 배치 자리 토큰 |

그림 자소(`sprite`) 재료 글꼴의 바탕 요소에는 `data-fy-material="sprite"`와 `data-fy-sprite-kinds`(글꼴의 `--fy-sprite-kinds`)가 추가로 붙는다. 이 두 속성은 `--fy-material`이 `system`이 아닌 글꼴에만 찍힌다.

그림 자소 경로는 `data-sprite-jamo-kind` + `--fy-sprite-jamo-index`를 조합해 쓴다. 예를 들어 `광`은 DOM상 `ᄀ / ᅩ / ᅡ / ᆼ`으로 분해되지만, 그림 자소 조회는 `ㄱ / ㅗ / ㅏ / ㅇ` 네 칸을 가져온다. `data-jamo-index`는 기존 역할 기반 계약으로 계속 남기지만, 기본 자소판 좌표 계산에는 쓰지 않는다.

## 저작 계약

### 자소판 배치

권장 구조:

1. **단일 이미지.** 자음 19개, 모음 21개를 일정한 격자에 정렬. SVG를 권장한다 — 어느 크기에서나 다시 그려 선명하고, 굵기·색·질감이 SVG 안의 스타일이다(아래 "SVG로 그리는 자소판"). PNG도 된다.
2. **투명 배경.** 자소 외 영역은 alpha 0.
3. **고정 경계 상자.** 실제 잉크 크기는 달라도 칸 크기는 통일한다. 코어는 `--fy-sprite-cell` × 열·행 번호로 칸을 찾는다.

예시 배치 (칸 크기 64px 가정):

```
row 0: 자음  ㄱ ㄲ ㄴ ㄷ ... ㅎ      (19 cells)
row 1: 모음  ㅏ ㅐ ㅑ ㅒ ... ㅣ      (21 cells)
```

선택 확장 행 — 행 2: 종성 전용 형태(자음 순서, `[part~="jongseong"]` 분기), 행 3: 통짜 겹받침 ㄳ~ㅄ(종류 `coda-cluster`), 행 4: 가로모음 문맥 초성, 행 5: 키 큰 초성 문맥의 합자 모음. 확장 행이 없는 자소판에서는 종성이 자음 행을 공유하고, 통짜 겹받침은 `--fy-sprite-kinds`에서 `coda-cluster`를 빼 원래 글꼴로 되돌린다. 문맥 행은 완성 음절에서 추출한 형태 차이를 자리의 아핀 변형만으로 복원할 수 없을 때 고른다. 실제 6행 계약은 `profiles/sprite-system.css`, 추출 규칙은 `scripts/extract_sprite_from_syllables.py` 참고.

### 기본 CSS 계약 (글꼴 계약 v2)

그림 자소 글꼴도 CSS 글꼴과 같은 글꼴 계약 v2([ADR-008](../ADR/ADR-008-font-contract-v2.md))를 따른다. 첫 규칙은 레이어 순서 선언이고, 바탕 요소 규칙에 `--fy-material: sprite`를 포함한 메타데이터를 둔다.

**자소판은 코어가 칠한다.** `font-kku.css`의 그림 자소 재료 규칙 하나가 칸 크기(`inline-size`/`block-size`), `overflow`, `background-*`, `filter`, 투명 글자색을 맡고, 글꼴은 변수만 선언한다(ADR-008 §5).

| 변수 | 선언 위치 | 기본값 | 뜻 |
| --- | --- | --- | --- |
| `--fy-sprite-url` | 바탕 요소 (필수) | `none` | 자소판 이미지 `url(...)`. 코어가 `@property`로 `<url> \| none` 등록 — 상대 경로는 **선언한 CSS 파일 기준**으로 풀린다 |
| `--fy-sprite-url-2x` / `--fy-sprite-url-3x` | 바탕 요소 | `none` | 다중 배율 자소판의 배율별 `url(...)`(등록 `<url>`). `--fy-sprite-image`에서만 쓴다 |
| `--fy-sprite-image` | 바탕 요소 | 없음 | 선언하면 `--fy-sprite-url` 대신 칠한다. 다중 배율용 `image-set(var(--fy-sprite-url) 1x, var(--fy-sprite-url-2x) 2x)` |
| `--fy-sprite-kinds` | 바탕 요소 (필수) | 없음 | 자소판에 칸이 있는 자모 종류. `consonant vowel` 또는 `consonant vowel coda-cluster` |
| `--fy-sprite-cell` | 바탕 요소 | `1em` | 칸 한 변. `em` 기반이라 바탕 요소 크기에 비례 |
| `--fy-sprite-cols` | 바탕 요소 | `21` | 자소판 열 수(가장 긴 행 = 모음) |
| `--fy-sprite-rows` | 바탕 요소 | `2` | 자소판 행 수 |
| `--fy-sprite-row` | 자모 노드 | `0` | 노드가 쓸 행(종류·자리·문맥 규칙이 고른다) |
| `--fy-<slot>-dilate` | 바탕 요소(자리 값), 자모·문맥 노드 재선언 | 없음 | 자리별 획 보정 `drop-shadow` 목록. 다른 자리 값과 같은 대체 순서(자리 → 부모 자리 → 역할)이고 `scripts/glyph_sprite_stroke.py`가 생성한다 |
| `--fy-sprite-dilate` | 바탕 요소 | `none` | 글꼴 수준 획 보정. 자리 대체 순서가 비어 있을 때 쓰인다(`--fy-font-stroke`에 대응) |
| `--fy-sprite-rendering` | 바탕 요소 | `auto` | 자소판을 확대·축소할 때의 보간(코어가 `image-rendering`으로 읽는다). 픽셀 아트 자소판은 `pixelated`(또는 `crisp-edges`) |

**URL 해석.** 등록되지 않은 CSS 사용자 지정 속성 안의 상대 `url()`은 `var()`를 *쓰는* 스타일시트(코어 `font-kku.css`) 기준으로 풀린다 — a00d624에서 자소판이 루트 경로로 풀려 404가 난 원인이다. 코어가 `--fy-sprite-url`(과 `-2x`/`-3x`)을 `<url> | none`으로 등록해 두었으므로 값은 선언한 파일 기준 절대 URL로 계산된다. 글꼴은 `./my-sprite.png`처럼 자기 파일 기준으로 쓰고, 페이지 스타일시트나 인라인 style의 덮어쓰기는 그 페이지 기준으로 풀린다(http·`file://` 모두). `image-set()`은 `<url>` 문법에 맞지 않으므로 `--fy-sprite-image`에 두고, 그 안의 URL은 등록된 배율 변수로만 참조한다(비등록 변수 안의 상대 URL은 다시 코어 기준으로 풀린다).

**획 보정.** 필터 값은 `--fy-sprite-filter`(페이지 전용) → `--fy-optical-sprite-filter`(페이지 전용 사전 설정) → 자리 대체 순서 `--fy-<slot>-dilate` → 부모 자리 → 역할 → 글꼴 수준 `--fy-sprite-dilate` 순으로 대체된다. 글꼴은 `--fy-sprite-filter`를 선언하지 않는다(검사가 거부) — 선언하면 자기 자리 보정과 페이지의 덮어쓰기를 모두 가린다. 작은 글씨용 사전 설정 `--fy-optical-sprite-zoom/crop-x/crop-y`도 페이지 전용이라 글꼴의 `--fy-sprite-zoom/crop-*`를 이긴다.

열은 런타임이 주는 `--fy-sprite-jamo-index`, 행은 글꼴이 고르는 `--fy-sprite-row`다. 위치 계산식은 코어 규칙 하나에만 있고 종류·자리·문맥 규칙은 행 번호만 바꾼다. 그래서 v1처럼 "기본 규칙의 `background-position`이 특이도로 종류 규칙을 이겨 전부 첫 칸(ㄱ)이 칠해지는" 함정이 구조적으로 생기지 않는다.

**적용 조건.** 런타임은 글꼴의 `--fy-material`이 `system`이 아닐 때만 바탕 요소에 `data-fy-material`을 찍고, `sprite`이면 `--fy-sprite-kinds`에서 알려진 종류만 골라 `data-fy-sprite-kinds`로 찍는다. 코어 규칙은 `[data-fy-material="sprite"][data-fy-sprite-kinds~="<kind>"]` 바탕 요소 아래의 `[data-sprite-jamo-kind="<kind>"]` 노드만 칠한다. 목록에 없는 종류(예: 2행 자소판의 통짜 겹받침)와 자소판 칸이 없는 노드(`syllable` 깊이의 완성형 머리 노드)는 규칙 밖이라 글꼴 글자로 되돌아간다. `system` 재료 글꼴에는 두 속성이 붙지 않으므로 다른 언어 구현의 DOM 계약은 그대로다.

**낱자.** 그림 자소 재료 바탕 요소에서는 한 코드포인트짜리 낱자(호환 자모 `ㅋ`, 조합 중인 `ㄱ`, 단독 첫가끝 자모)도 자소판 표에 있으면 `[part="content"]` 노드에 같은 `data-sprite-jamo*` 표면이 붙어 칸으로 칠해진다. 칸은 글자 상자 위쪽에 곁 여백 없이 놓이므로 음절 안 자리의 모양(ㄱ은 왼쪽 위)으로 보인다. 한글 글꼴이 없는 기기에서도 낱자가 두부로 보이지 않게 하려는 것이다([ADR-012](../ADR/ADR-012-hangul-ime-and-fontless-devices.md)). 기기 글꼴 재료에는 붙지 않는다.

```css
@layer font-kku.font, font-kku.jamo, font-kku.context;

@layer font-kku.font {
  :where([data-fy-font="pixel"]) {
    --fy-font-id: pixel;
    --fy-contract: 2;
    --fy-material: sprite;
    --fy-expression-mode: general;
    --fy-glyph-width: 1em;
    --fy-glyph-height: 1.2em;
    --fy-sprite-url: url("./sprites/pixel-jamo.png");
    --fy-sprite-cols: 21;                 /* 가장 긴 row(모음) 기준 */
    --fy-sprite-rows: 2;
    --fy-sprite-kinds: consonant vowel;   /* 겹받침 칸이 없으니 글자로 폴백 */
    --fy-sprite-dilate: none;             /* optional: 폰트 레벨 drop-shadow(...) 획 보정 */
  }

  /* 행 선택 — kind별로 행 번호만 준다(자음은 기본값 0행) */
  :where([data-fy-font="pixel"]) [data-sprite-jamo-kind="vowel"] { --fy-sprite-row: 1; }
}
```

종류·자리 단위 행 선택(`[data-fy-pos]`, `[part~="jongseong"]`)과 자리 획 보정 값(`--fy-<slot>-dilate`)은 `font-kku.font` 레이어, 자모별 규칙은 `font-kku.jamo` 레이어, `:has()` 문맥 전환(예: `sprite-system`의 6행째)은 `font-kku.context` 레이어에 둔다. 글꼴은 `background*`, `filter`, `inline-size`, `block-size`, `width`, `height`, `overflow`를 직접 선언하지 않는다 — 레이어 밖 코어 규칙에 지므로 v2 검사(`scripts/check_css_contract.js`)가 거부한다. 위치·크기·굵기도 CSS 글꼴과 같이 자리·자모·문맥 수준 변수로만 준다. v1의 글꼴 전용 변수(`--sprite-url`, `--sprite-cell`, `--sprite-cols`, `--sprite-render-cell`, `--sprite-crop-*`)는 쓰지 않는다.

바로 동작하는 템플릿은 [`profiles/sprite-example.css`](../../profiles/sprite-example.css)에 있다.

`data-fy-font`는 런타임이 별칭과 바탕 요소 모드를 해석한 정본 출력이다. 클래스 방식에서 작성자가 쓴 `data-font`는 입력으로 보존되므로, 그림 자소 CSS가 이를 직접 적용 조건으로 쓰면 JS 1회성 글꼴 덮어쓰기와 충돌할 수 있다.

`--fy-sprite-zoom`과 `--fy-sprite-crop-x/y`는 칸 내부 여백 보정용이다. 글꼴 파일에서 추출한 그림 자소는 실제 획이 64px 칸보다 작게 들어가는 경우가 많아 작은 본문 크기에서 약하게 보인다. 이때 `--fy-sprite-zoom: 1.2`부터 `1.5` 정도로 키우고 crop 값을 `-(zoom - 1) / 2em` 근처로 두면 칸 중심을 유지하면서 실제 획을 더 크게 표시할 수 있다. `--fy-sprite-dilate: drop-shadow(0 0 0 #17130d)`(글꼴 수준)는 안티에일리어싱 가장자리를 조금 더 진하게 만드는 저위험 보정이다. 칸을 꽉 채워 직접 그린 그림 자소는 기본값 `1` / `0em` / `none`을 유지한다.

### 빌드 도우미 계약

`scripts/build_sprite.py`는 이제 "샘플 생성기"가 아니라 저작 파이프라인의 기준 도구다.

- `--from-dir <dir>` — `consonants/`, `vowels/` 하위 PNG를 읽는다.
- `--report-out <file>` — missing-jamo, 생성된 파일, SHA-256 해시를 JSON으로 남긴다.
- `--css-out <file>` — 생성 CSS를 `/* BEGIN GENERATED: scripts/build_sprite.py … */`와 `/* END GENERATED: scripts/build_sprite.py */` 마커 사이에 쓴다. 대상 파일에 마커가 있으면 그 구간만 교체하고 구간 밖(자모·문맥 레이어 블록, 적합 결과)은 그대로 둔다. 마커 없는 기존 파일은 작성자가 쓴 CSS로 보고 덮어쓰지 않는다. `scripts/extract_sprite_from_syllables.py`도 같은 쓰기 경로를 쓴다.
- `--fail-on-missing` — 빠진 PNG가 하나라도 있으면 0이 아닌 코드로 종료한다.
- `--scale 1 --scale 2 --scale 3` — 다중 배율 PNG 세트를 만들고 CSS에는 배율별 `--fy-sprite-url`/`--fy-sprite-url-2x`/`--fy-sprite-url-3x`와 그것을 묶는 `--fy-sprite-image: image-set(...)`을 기록한다(1x 필수, 2x·3x까지).

저장소 안에서 재현할 수 있는 검증 입력은 [`tests/fixtures/sprite-partial`](../../tests/fixtures/sprite-partial/)이다.

```bash
python3 scripts/build_sprite.py \
  --from-dir tests/fixtures/sprite-partial \
  --out tmp/sprite-partial.png \
  --css-out tmp/sprite-partial.css \
  --report-out tmp/sprite-partial.json \
  --font-name sprite-partial \
  --scale 1 --scale 2
```

이 검증용 입력(fixture)은 자음 `ㄱ`과 모음 `ㅏ` PNG만 포함하므로, 보고서에 missing-jamo가 명시적으로 기록된다. 즉 "부분 저작 중에도 투명한 대체 칸으로 미리 자소판을 만들고, 필요하면 엄격한 검증으로 마무리한다"는 흐름을 저장소만으로 재현할 수 있다.

### 역할별 분기

기본 자소판은 초성과 종성의 같은 자음을 공유한다. 종성 전용 형태가 필요하면 자소판에 확장 행을 두고 행 번호만 바꾼다. 열은 런타임 인덱스 그대로다.

```css
@layer font-kku.font {
  /* 종성 row(3행째) — part 토큰으로 고르는 slot 단위 규칙 */
  :where([data-fy-font="pixel"]) [part~="jongseong"][data-sprite-jamo-kind="consonant"] { --fy-sprite-row: 2; }
}

@layer font-kku.jamo {
  /* 특정 자모만 다른 시트를 쓴다 — 시트 URL과 행 번호만 바꾸고 위치식은 코어 규칙이 계산한다 */
  :where([data-fy-font="pixel"]) [data-sprite-jamo="ㅇ"][data-jamo-role="choseong"] {
    --fy-sprite-url: url("./sprites/pixel-jamo-cho.png");
    --fy-sprite-row: 0;
  }
}
```

자모별 규칙은 `font-kku.jamo` 레이어에 있으므로 특이도와 무관하게 `font-kku.font` 레이어의 종류 규칙을 이긴다. 확장 행을 쓰면 바탕 요소의 `--fy-sprite-rows`를 자소판과 맞춘다. 통짜 겹받침 행을 두면 `--fy-sprite-kinds`에 `coda-cluster`를 넣는다. 다른 자소판도 같은 격자(`--fy-sprite-cols`/`--fy-sprite-rows`)여야 한다.

## 혼합 글꼴

그림 자소 경로와 CSS 변수 경로는 **같은 DOM 계약** 위에서 동작하므로 부분 혼용이 가능하다.

- 자음만 그림 자소, 모음은 기기 글꼴
- 특정 자소 몇 개만 그림/아이콘으로 교체 (예: `ㅇ`만 동그란 일러스트)
- 짜임 분류(`data-fy-layout-bucket`)별로 다른 자소판 (예: `split-closed`만 별도 자소판)

혼합 구성은 레이어로 층을 나눈다. 종류·자리 단위 행 선택은 `font-kku.font`, 자모별 교체는 `font-kku.jamo`, 이웃 조건 교체는 `font-kku.context`에 둔다. 뒤 레이어가 특이도와 무관하게 이기므로 선언 순서에 기대지 않는다. 종류 단위 혼용(예: 자음만 그림 자소)은 `--fy-sprite-kinds`에서 그 종류만 남기면 된다. 코어 규칙은 목록에 있는 종류의 `[data-sprite-jamo-kind]` 노드만 칠하므로 나머지는 원래 글꼴 글자로 되돌아간다.

## SVG로 그리는 자소판 — 자리 상자와 획 정의

기본 제공 자소판은 직접 그린 SVG다([ADR-011](../ADR/ADR-011-svg-jamo-sheets.md)). 같은 방식으로 사람이나 AI 에이전트가 새 그림 자소 글꼴을 그릴 수 있다.

- **칸 형식.** 칸 하나는 한 변 100인 정사각형이고, 시트는 21열 × 행 수다(`viewBox="0 0 2100 600"`이면 6행). 칸은 `<g id="r<행>-<자모>" transform="translate(<열×100> <행×100>)">`이고 그 안의 좌표는 칸 기준 0–100이다. 칸은 음절 1em 상자를 그대로 줄인 것이라 자모를 **음절 안 제자리에** 그린다(가운데 정렬이 아니다).
- **자리 상자.** `spec/sprite-layout.json`이 칸마다 자모 잉크가 차지할 상자 `[x0, y0, x1, y1]`과 짝 상자(`parts` — 두 짝 자음·겹받침·합자 모음)를 준다. `system` 배치(6행)는 `sprite-system`의 보정된 자리 배치가 전제하는 위치라, 같은 상자 안에 그린 자소판은 `sprite-system.css`의 배치를 그대로 쓴다(파생 글꼴처럼 배치를 복사하고 자소판 주소만 바꾼다). `starter` 배치(2행)는 낱자를 칸 가운데 둔 입문용이다. `node scripts/build_jamo_svg.js --guide system out.svg`가 상자를 그린 안내 SVG를 낸다.
- **가장자리 여백.** 칸 경계에서 2단위 안쪽에만 그린다. 브라우저는 늘린 자소판을 다시 래스터화하며 이웃 칸을 한두 픽셀 섞어 읽어, 경계에 닿은 잉크는 옆 글자 밑에 가는 줄로 비친다.
- **획 정의와 생성기.** `scripts/build_jamo_svg.js`의 `SHAPES`가 자모별 획 중심선을 자리 상자(획 두께 절반만큼 줄인 상자)의 0–1 좌표로 정의한다(`"M0 0 H1 V1"`, 끝 늘이기 `s`·`e`, 타원). 문맥별 모양(세로 모음 옆 초성 `cho`, 가로 모음 위 초성 `bar`, 받침 `jong`, 낱자 `solo`)을 둘 수 있다. `STYLES`가 글꼴별 굵기·색·끝 모양과 두 차원을 고른다. **획 뼈대**(`SKELETONS` — 같은 획을 어떻게 긋는가: `plain` 곧은 획, `pilgi` 획마다 정해진 흔들림·살짝 휜 획·오른쪽 기울기, `dunggeun` 굵고 둥근 끝·둥글린 모서리, `butgeul` 누르며 들어가 빼며 나가는 굵기 변화의 채운 윤곽)와 **획 표현**(`TEXTURES` — 그은 획에 입히는 재료: `plain`, `dot` 도트 격자, `stamp` 인주, `chalk` 분필, `crayon` 밀랍, `stitch` 실땀)이다. 어느 뼈대에나 어느 표현이든 붙고(`STYLES` 한 줄), 흔들림은 뼈대·행·자모·획 번호에서 정해지는 의사난수라 같은 뼈대는 언제나 같은 그림이다. `dot`·`stitch`는 중심선을 다시 긋는 재료라 붓 뼈대에는 붓 윤곽 대신 중심선을 쓴다. `--write`로 다시 그리고, `npm test`가 `--check`로 자소판이 획 정의와 같은지 본다.
- **획순 표.** 벡터 자소 모듈은 `HOEK_SHAPES`로 그려 칸의 도형 하나가 정본 `spec/strokes.json`의 획 하나다(획 깊이, ADR-018). 자소판 SVG는 `SHAPES` 그대로다. 생성기 `--check`가 모듈 칸마다 획 수를 정본과 대조하고 런타임 획순 표도 함께 확인한다.
- **확인.** 새 자소판은 겹침 감사(`scripts/glyph_overlap_audit.py --font <id> --sample full` — 흔한 2,350자 포함)로 이웃 자모와 닿지 않는지 본다. 자리 상자 안의 내부 비례(ㄹ 윗부분 폭, ㅖ 곁가지 길이 등)가 상자를 꽉 채우면 받침 문맥에서 닿을 수 있다.

## 벡터 자소 — 자모마다 SVG 하나 (`jamo-set`)

자소판을 칸마다 배경으로 자르는 대신, 자모 노드마다 인라인 SVG를 넣어 그릴 수 있다([ADR-013](../ADR/ADR-013-vector-jamo.md)). 배치는 그림 자소 글꼴의 것을 그대로 쓰고, 그림은 코드로 등록한 **자모 세트**가 준다.

```html
<script src=".../font-kku.js" data-fonts="sprite-system" data-jamo-sets="sprite-system"></script>
<font-kku font="sprite-system" jamo-set="sprite-system">한글</font-kku>

<script>
  FontKku.registerJamo("brush", {
    "r0-ㄱ": "M8 12 H44 V30 Q44 54 12 65",        // 칸 키 r<행>-<호환 자모>, 칸 0–100의 획 중심선
    "r1-ㅏ": ["M67 2 V86", "M67 39 H85"],
    "r2-ㅇ": [{ ellipse: [43, 70, 27, 12] }],     // 타원, { d, fill: true }는 채운 외곽선
  }, { stroke: 8, cap: "round" });               // 굵기(칸 단위)·끝 모양·꺾임
</script>
<font-kku font="sprite-system" jamo-set="brush">붓글씨</font-kku>
```

- 바탕 요소는 `data-fy-material="vector"`, `data-fy-jamo-set`을 받고, 목록의 종류 노드마다 `<svg part="vector" data-cell="r0-ㄱ">`이 붙는다. 칸은 글꼴이 고른 `--fy-sprite-row`로 정하므로 자소판과 같은 칸이다. 실제 SVG가 있는 자모에만 `data-fy-vector-cell`을 붙이고, 세트에 없는 칸은 기반 자소판으로 표시한다(마스크 칠 포함). 기반 자소판에도 없는 칸까지 새로 만들어 주지는 않는다. 빈 세트·빈 도형 배열은 등록 오류다.
- CSS의 `--fy-sprite-row`를 바꾼 뒤 `FontKku.refreshAll(host)`을 호출하면 바뀐 칸의 SVG만 갱신한다. 같은 칸은 유지하고, 누락된 행으로 바뀌면 자소판 표시로 돌아간다. 전체 초기화가 필요하면 `FontKku.refresh(host)`를 쓴다.
- 획은 글자 색(`color`)을 따르고 `non-scaling-stroke`라 자리가 눌려도 굵기가 그대로다. 굵기는 페이지의 `--fy-vector-stroke`(길이)가 바꾸고, 끝 모양·꺾임·대시는 `[part="vector"]`에 일반 SVG CSS(`stroke-linecap`, `stroke-dasharray` …)로 준다.
- 런타임보다 먼저 실린 모듈은 `globalThis.FontKkuJamo`에 `[name, cells, options]`를 push한다. 늦게 등록된 세트는 그 세트를 쓰는 바탕 요소를 다시 그린다.
- 기본 제공 세트는 `profiles/sprite-system.jamo.js`, `sprite-example.jamo.js`, `pixel.jamo.js`(`scripts/build_jamo_svg.js`가 자소판과 같은 획으로 낸다). 도장·분필은 질감 필터 때문에 자소판으로만 쓴다.
- 자모마다 SVG가 생기므로 제목·짧은 글에 쓴다. 긴 본문은 자소판이 가볍다.

## 마스크 칠 — 자소판에 CSS 색 입히기

`--fy-sprite-paint: mask`(글꼴이나 페이지, 바탕 요소)를 주면 자소판을 그림이 아니라 마스크로 쓰고, 칠은 `--fy-sprite-fill`(`<image>`, 기본 `linear-gradient(currentColor, currentColor)` — 글자 색)이 한다([ADR-014](../ADR/ADR-014-sprite-mask-paint.md)). 런타임이 바탕 요소에 `data-fy-sprite-paint="mask"`를 찍고 코어 규칙이 `mask-image`·`mask-size`·`mask-position`을 배경 칸과 같은 식으로 준다.

```css
.mask-tint { --fy-sprite-paint: mask; }
.mask-tint [part~="choseong"] { color: #e63946; }
.mask-tint [part~="jungseong"] { --fy-sprite-fill: linear-gradient(#2563eb, #22d3ee); }
```

- 손으로 그린 PNG 손글씨에도 자모마다 색·그라데이션·무늬를 준다. 알파의 질감(도장의 인주 빠짐)은 남고 색만 바뀐다.
- 필터는 마스크 전에 적용되므로 획 보정(`--fy-*-dilate`)은 효과가 없다. 굵기까지 바꾸려면 벡터 자소를 쓴다.
- 질감 SVG 필터를 쓴 자소판을 마스크로 크게 늘리면 가로 줄무늬가 보일 수 있다(크레용은 밀랍 결로 읽혀 남겼고, 먹 질감 시도는 이 때문에 거뒀다).
- 질감 필터는 칸마다 건다(칸 `<g>` 안쪽 `<g filter>`, 필터 영역 = 칸 하나). 자소판 전체에 걸면 필터 영역이 자소판 크기(글자 크기 × 21열 × 행 수)라 WebKit이 버퍼 한계(약 4096²)를 넘는 크기에서 그룹을 통째로 그리지 않았고(분필·크레용 33px 이상 빈칸), 넘지 않아도 크기마다 자소판 전체를 다시 걸러 첫 그리기에 수십 초 멈췄다(2026-10-13). 도트 자소판의 화소 맞춤(`crispEdges`)은 SVG 안 미디어 쿼리로 칸 40px 이상일 때만 켠다 — 작은 글자에서 한 화소보다 작은 도트 줄이 빠졌다.
- **꾸밈**(`kku-look-*` 클래스, [조합 체계](./composition-axes.md))은 그림 자소 바탕 요소에 마스크 칠을 켜고 역할별 `color`만 칠한다. 속 빈 꾸밈(네온·도면)은 외곽선 색으로 채우고, 그림자는 글자(`[part="glyph"]`)의 `drop-shadow`로 옮긴다(자모 노드의 filter는 마스크 전에 적용돼 잘린다). 런타임은 그릴 때 `--fy-sprite-paint`를 읽으므로, 그린 뒤 클래스 방식을 바꾸면 `FontKku.refresh(host)`가 필요하다.

## 글꼴 파일로 내보내기

그림 자소 글꼴과 벡터 자소는 보통 글꼴 파일(TTF·WOFF)로 내보낼 수 있다([ADR-015](../ADR/ADR-015-font-file-export.md)). 런타임 없이 워드·디자인 도구·다른 사이트에서 쓴다.

```html
<script src=".../font-kku.js" data-fonts="sprite-system"></script>
<script src=".../font-kku-export.js"></script>
<script>
  const { ttf, woff, report } = await FontKkuExport.exportFont({ font: "sprite-system", familyName: "내 손글씨" });
  FontKkuExport.download(ttf, "my-hangul.ttf");          // 11,172자 + 호환 자모, 6–8초
</script>
```

- **자리 변환**: 런타임이 조립한 결과에서 읽는다(숨긴 바탕 요소, 자모 노드마다 칸 모서리 표식 셋). 문맥 잘림 노드는 따로 글리프가 된다.
- **칸 외곽선**: 칸을 256px로 그려 알파에서 딴다(보간 마칭 스퀘어 + RDP). 자소판 PNG·SVG, 벡터 칸 모두 같은 길이다. 자소판은 같은 출처여야 한다(`file://` 불가).
- **음절**: 칸 부품 + 아핀 복합 글리프다. WOFF2는 약 20KB(`scripts/export_font_file.py --woff2`).
- **입구**: 글꼴 작업실 재료 탭 "글꼴 파일(TTF)로 내보내기"(편집 중인 자소판), 글꼴 시험대의 "글꼴 파일 받기", 저장소 CLI `python scripts/export_font_file.py --font pixel --out tmp/pixel.ttf --woff2 tmp/pixel.woff2 --compare`.
- **한계**: 글꼴 파일은 단색이다. 획 보정과 벡터 자소의 `non-scaling-stroke`는 들어가지 않고, 영문·숫자는 넣지 않는다.

## 재료만 바꾼 자소판 — 파생 그림 자소 글꼴

같은 자소판 격자와 배치를 두고 획 뼈대나 획 표현만 바꾸려면 파생 글꼴을 쓴다. 획 뼈대가 다른 `pilgi`(필기)·`dunggeun`(둥근)·`butgeul`(붓)은 획 표현 없이(`plain`) 그린 마스크 칠 글꼴이라, 색은 글꼴 CSS의 `color`(먹색)나 페이지 CSS나 꾸밈 `kku-look-*`이 칠한다. 필기는 기울기가 이웃 칸으로 번져 점이 찍히지 않게 칸 안으로 잉크를 가둔다. 붓은 채운 윤곽이라 자소판이 다른 것보다 크다(약 98KB, 나머지 15–21KB). 자소판은 `scripts/build_jamo_svg.js`가 기반과 같은 획·자리 상자로 재료만 바꿔 그린다(도트: 칸당 20×20 격자에 중심선을 1도트로 찍고 짝 상자 안쪽으로 한 도트 겹친 굵은 도트, 자수: 둥근 실땀 점선 획, 인주·분필·밀랍·실: SVG 필터). 글꼴 CSS의 배치는 `scripts/build_derived_fonts.js`가 기반에서 복사하며, 자소판 주소를 `./<id>.svg`로 바꾸고 검정 획 보정(`--fy-*-dilate`)은 색 자소판에 테두리를 칠하므로 뺀다. 도트는 칸마다 따로 격자에 붙으므로 반올림 보정(받침·가로 모음 위 초성·통짜 합자 모음 이동)을 `pixel.css` 꾸밈 블록에 둔다. 크레용은 자소판의 알파(밀랍 질감)만 쓰고 색은 글꼴 CSS가 역할마다 칠한다(마스크 칠, [ADR-014](../ADR/ADR-014-sprite-mask-paint.md)). 기본 제공 파생 글꼴은 `pixel`·`dojang`·`chalk`·`crayon`·`jasu`·`pilgi`·`dunggeun`·`butgeul`(기반 `sprite-system`)이다([ADR-010](../ADR/ADR-010-derived-fonts-and-script-loader.md)). 셋 모두 기본 겹침 감사(family 표본, 15%)를 예외 없이 통과하고 TTF로 내보내진다.

## 접근성

- 원문 텍스트는 화면에 숨긴 `part="sr-source"` 노드와 `data-source`에 보존되므로 스크린리더가 그대로 읽는다.
- 이미지를 불러오지 못했을 때 기본 텍스트가 드러나도록 `color: transparent`를 권장한다(`font-size: 0`은 복사·붙여넣기 호환성이 떨어짐).
- `prefers-contrast: more` 미디어 쿼리에서는 그림 자소 대신 CSS 변수 글꼴로 되돌리는 분기를 권장한다.

## 크기와 고해상도

- `--fy-sprite-cell`(기본 `1em`)을 `em` 기반으로 두면 바탕 요소의 `--fy-size` 변화에 자동으로 비례한다.
- 코어 그림 자소 재료 규칙은 `inline-size` / `block-size`를 `--fy-sprite-cell`로 고정해 투명 텍스트의 글자 메트릭이 PNG 표시 영역을 자르지 않게 한다.
- `scripts/build_sprite.py --scale 1 --scale 2 --scale 3`는 `out.png`, `out@2x.png`, `out@3x.png`를 만들고 CSS에는 등록 URL 변수 세 개와 `--fy-sprite-image: image-set(var(--fy-sprite-url) 1x, …)`를 기록한다.
- 글꼴 작업실 재료 탭(`studio/index.html`, 메뉴 "자소판 그리기")은 불러온 자소판을 그 해상도 그대로 원본 캔버스로 편집한다. 내보내기는 PNG 칸 크기(원본·64·128·192·256px)를 고르거나 1x·2x·3x 배율 세트(`build_sprite.py --scale 1 2 3`과 같은 `@2x`/`@3x` 이름)를 내려받고 글꼴에 `--fy-sprite-url-2x/-3x`·`--fy-sprite-image: image-set(...)`을 연결한다. 래스터 품질은 `--fy-sprite-rendering`과 다시 샘플링 방식을 함께 정한다. 작은 글씨 보정은 글꼴 수준 사전 설정(`--fy-sprite-zoom/crop-*/dilate`)과 페이지 전용 `--fy-optical-sprite-*`(미리보기에만 덧씌움, 페이지 CSS 복사)로 나뉜다. 구조는 [글꼴 작업실](./font-studio.md)의 재료 탭 절을 본다.
- 작은 글씨 가독성 보정은 글꼴 수준 그림 자소 표시 변수(`--fy-sprite-zoom`, `--fy-sprite-crop-x/y`, `--fy-sprite-dilate`)로 글꼴 CSS에 선언하고, 글꼴 작업실 전역 변수 패널의 그림 자소 항목에서 편집한다. 페이지 전용 `--fy-optical-sprite-*` 사전 설정과 `--fy-sprite-filter`는 글꼴 값을 항상 이긴다.
- SVG 자소판은 배율 세트가 필요 없다 — 브라우저가 표시 크기에 맞춰 다시 그린다. 래스터 품질(`--fy-sprite-rendering`)은 PNG에만 뜻이 있다.
- 고해상도 PNG(2× / 3×)를 쓰더라도 `background-size`는 논리 칸 크기(`em`)와 선택적 crop/zoom 변수로 계산하므로 자연스러운 배율이 보장된다.
- 대안으로 WebP / AVIF 자소판을 써서 파일 크기를 줄일 수 있다. 런타임은 파일 형식을 가리지 않는다.

## 제한 사항

- `data-jamo`는 조합형 자모(U+1100–U+11FF)이고, `data-sprite-jamo`는 자소판용 호환 자모(U+3131–U+318E)이다. 그림 자소 좌표 계산에는 `data-sprite-*` 속성을 쓴다.
- 평문 모드(`renderText()`)는 그림 자소 경로를 쓰지 않는다. 순수 자소 평문 출력 전용이다.
- 브라우저 캐시가 없는 첫 그리기에서는 자소판을 불러오는 동안 대체 글자가 잠깐 보일 수 있다. 필요하면 바탕 요소에 `visibility: hidden`을 두고 `onload`에서 해제하는 패턴을 쓴다.
- 로컬 한글 글꼴 자동 탐색은 아직 없다. `--from-font`는 명시적 경로를 넘겨야 한다.

## 구현된 런타임 공개 범위

- **`data-sprite-jamo-*` + `--fy-sprite-jamo-index` 노출** — 완료. 자음·모음·통짜 겹받침의 종류별 행 안 인덱스를 노출한다.
- **코어 그림 자소 재료 규칙** — `font-kku.css`의 "Sprite material (ADR-008 §5)" 규칙과 런타임이 바탕 요소에 찍는 `data-fy-material`/`data-fy-sprite-kinds`(`system`이 아닌 글꼴만). 글꼴은 `--fy-sprite-*` 변수만 선언한다.
- **시작용 그림 자소 템플릿** — [`profiles/sprite-example.css`](../../profiles/sprite-example.css) + [`profiles/sprite-example.svg`](../../profiles/sprite-example.svg) (가는 둥근 획의 낱자, 2행).
- **실사용 수준 그림 자소 예제** — [`profiles/sprite-system.css`](../../profiles/sprite-system.css) + [`profiles/sprite-system.svg`](../../profiles/sprite-system.svg). 종성·겹받침·두 문맥 행을 포함하는 6행 자소판에 실측 적합한 배치를 얹었다.
- **SVG 자소판 생성기** — [`scripts/build_jamo_svg.js`](../../scripts/build_jamo_svg.js) + 자리 상자 [`spec/sprite-layout.json`](../../spec/sprite-layout.json). 기본 제공 자소판(획 뼈대 × 획 표현)을 그리고 `--guide`로 안내 SVG를 낸다.
- **PNG 빌드 도우미** — [`scripts/build_sprite.py`](../../scripts/build_sprite.py). 칸별 PNG 그림이나 글꼴 파일에서 래스터 자소판을 만든다. 두 가지 입력 모드 + 검증/보고서/다중 배율(글꼴 파일은 재배포가 허용된 것만 쓴다):
  ```bash
  # 자모 이미지 디렉토리(consonants/vowels)에서 생성 + report + multi-scale
  python3 scripts/build_sprite.py --from-dir ./glyphs --out my-sprite.png --css-out my-sprite.css --report-out my-sprite.json --font-name my-sprite --scale 1 --scale 2

  # 폰트 파일에서 렌더링(starter 샘플 재생성용)
  python3 scripts/build_sprite.py --from-font /path/to/font.ttf --out my-sprite.png --css-out my-sprite.css --font-name my-sprite

  # missing-jamo를 에러로 취급
  python3 scripts/build_sprite.py --from-dir ./glyphs --out my-sprite.png --fail-on-missing
  ```
- **그림 자소 보기** — [`site/sprite-demo.html`](https://font.tty.link/sprite-demo.html): 기기 글꼴과 `sprite-example`/`sprite-system` 그림 자소 경로를 비교한다.
- **브라우저 저작 도구** — [글꼴 작업실](./font-studio.md) 재료 탭([`studio/index.html`](https://font.tty.link/font-studio.html)): 자소판을 원본 캔버스로 편집(펜·지우개·채우기·직선, 칸 복사·붙여넣기, 기기 글꼴로 칸 채우기), 미리보기 자소 클릭으로 칸 선택, blob 덮어쓰기로 즉시 미리보기, 행별 사용 칸 기준 빈 칸 진단, PNG·CSS·프로젝트 JSON v2 내보내기, ADR-006 v1 프로젝트 가져오기.

## 향후 개선안

- **로컬 글꼴 자동 탐색.** 실행 환경에서 쓸 수 있는 한글 글꼴을 자동으로 찾아 `--from-font` 기본값으로 쓴다.

## Change Log
- 2026-10-10: 획 뼈대 × 획 표현(`SKELETONS` × `TEXTURES`) 생성기 절, 새 그림 자소 글꼴 `pilgi`·`dunggeun`·`butgeul`, 그림 자소에 거는 꾸밈 `kku-look-*`(ADR-017) 추가
- 2026-10-10: 글꼴 파일로 내보내기(ADR-015) 절 추가
- 2026-10-10: 마스크 칠(ADR-014) — `--fy-sprite-paint: mask`, `--fy-sprite-fill` 절 추가
- 2026-10-10: 벡터 자소(ADR-013) — `jamo-set`, `FontKku.registerJamo`, 재료 표면 `vector`, 기본 제공 자모 세트 모듈 절 추가
- 2026-10-09: 기본 제공 자소판을 직접 그린 SVG로 교체(ADR-011) — "SVG로 그리는 자소판"(칸 형식·자리 상자·가장자리 여백·획 정의) 절 추가, 파생 자소판을 SVG 생성기 기준으로 갱신, `build_material_sheets.py` 제거
- 2026-10-09: `--fy-sprite-rendering`(자소판 보간) 계약 추가, 글꼴 작업실 재료 탭의 칸 크기·배율 세트 내보내기·래스터 품질·작은 글씨 보정 설명 갱신
- 2026-09-27: 계약 정규화 — 코어가 `--fy-sprite-url`(+`-2x`/`-3x`)을 `<url>`로 등록해 자소판이 글꼴 파일 기준으로 풀린다(a00d624 404 수정), 다중 배율은 `--fy-sprite-image`. 획 보정은 자리 대체 순서 `--fy-<slot>-dilate`(글꼴 수준 기본 `--fy-sprite-dilate`), `--fy-sprite-filter`·`--fy-optical-sprite-*`는 페이지 전용. `sprite-system` 보정 블록을 기본 깊이의 자리 기하로 재생성
- 2026-09-25: 그림 자소 재료 코어화(ADR-008 §5) 반영 — 코어 규칙이 자소판을 칠하고 글꼴은 `--fy-sprite-url/kinds/cell/cols/rows/row/dilate`만 선언, 바탕 요소 `data-fy-material`·`data-fy-sprite-kinds` 적용 조건, v1 `--sprite-*` 예시 제거
- 2026-09-25: 옛 PoC 페이지 Sprite Editor 제거 — 저작 도구 항목과 편집기 배율·광학 설명을 글꼴 작업실 재료 탭 기준으로 교체
- 2026-09-24: 글꼴 계약 v2(ADR-008) 반영 — 레이어·메타데이터, `--fy-sprite-row` 행 선택과 단일 위치식, `build_sprite.py` 생성 마커 보존 규칙
- 2026-08-13: 기본 제공 `sprite-system`의 6행(기본·종성·겹받침·문맥) 계약과 런타임/데모 공개 범위 반영
- 2026-07-10: TRK-032 Sprite Studio 스키마 v1 저장/가져오기, 기록·도구·터치·진단과 검증 경로 반영
- 2026-07-10: 그림 자소 CSS의 바탕 요소 적용 조건을 정본 `data-fy-font`로 전환
- 2026-04-24: 기본 제공 CSS 글꼴 목록을 `sebul`/`gothic` 기준으로 정정하고 그림 자소 편집기의 현재 구현/남은 항목을 추가
- 2026-04-21: 자소판 계약을 초/중/종 3행에서 자음/모음 2행으로 바꾸고 `data-sprite-jamo-*` 조회 속성을 추가
- 2026-04-19: 빌드 도우미에 missing-jamo 보고, `--fail-on-missing`, 다중 배율 출력, CSS 해시 주석/image-set 경로를 반영
- 2026-04-18: 초안
