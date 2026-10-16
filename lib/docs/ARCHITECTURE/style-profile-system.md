# 스타일 글꼴 체계

> Status: Implemented
> Scope: CSS로 저작하는 글꼴형 스타일 모델

## 목표

현재 사람이 보는 용어는 `font`다. 런타임은 전용 태그의 `font`, 클래스 방식에 작성자가 쓴 `data-font`, JS `font` 옵션을 우선으로 읽고, 기존 `profile` / `data-profile` / `profile`은 하위 호환 별칭으로만 유지한다. 확정된 글꼴은 두 바탕 요소 모드 모두 정본 `data-fy-font`로 노출한다.

사용자가 런타임 코드를 수정하지 않고도 CSS 파일만으로 자소의 위치, 크기, 각도, 간격을 조절해 서로 다른 "글꼴 파일 같은" 스타일을 만들 수 있어야 한다.

핵심 원칙은 다음이다.

- 구조는 런타임이 책임진다.
- 시각 형태는 글꼴 CSS가 책임진다.
- 글꼴 전환은 가능하면 다시 그리지 않고 CSS만 교체해서 처리한다.

## 개념

새 시스템에서 기존 `theme`보다 더 중요한 단위는 스타일 글꼴(`style font`)이다.

- 런타임: 텍스트 분해, 세그먼트 구성, DOM 생성
- 스타일 글꼴: 초성/중성/종성 위치와 배율, 회전, 간격을 정의하는 CSS 파일
- 글꼴 꾸러미: 여러 글꼴을 묶은 배포 단위

스타일 글꼴은 두 가지 저작 경로로 나뉜다.

- **CSS 글꼴**: 기기에 설치된 한글 글꼴의 자소를 그대로 쓰고 `--fy-*` 변수로 변형만 준다. 이 문서의 기본 대상이다.
- **그림 자소 글꼴**: 자소 그림을 자소판(SVG·PNG)에 올리고, 코어 CSS가 자소 칸을 배경으로 그린다. 글꼴은 `--fy-sprite-*` 변수로 자소판과 행 선택만 선언한다. 상세는 [그림 자소 글꼴](./image-sprite-fonts.md).

두 경로는 같은 DOM 계약을 공유하므로 섞어서 구성할 수 있다.

스타일 글꼴은 [조합 체계](./composition-axes.md)(ADR-017)의 **글꼴 축**(뼈대 = 짜임 × 획)이다. 칠(색·외곽선·그림자)은 꾸밈 축 `kku-look-*`, 씨앗 변주는 변주 축 `kku-vary-*`, 움직임·상호작용은 각자의 확장이 맡는다. 그래서 칠만 다른 새 표현은 새 글꼴이 아니라 `spec/themes.json` `looks`에 더한다. 칠만 다른 기존 파생 글꼴 여덟(`neon` 등)은 꾸러미 글꼴로 남고, 그 꾸밈 구간이 클래스 방식의 원천이다.

사용자 경험은 일반 글꼴을 쓰는 경험과 비슷해야 한다.

```html
<link rel="stylesheet" href="./font-kku.css" />
<link rel="stylesheet" href="./profiles/rounded.css" />
<script src="./font-kku.js"></script>

<font-kku font="rounded">안녕하세요</font-kku>
<span class="font-kku" data-font="rounded">안녕하세요</span>
```

## 왜 CSS 글꼴이어야 하는가

- 시각 조정만으로 바뀌는 경우 JS를 다시 실행할 필요가 없다.
- 사용자가 CSS만 편집해도 새 스타일을 만들 수 있다.
- 글꼴 전환 비용이 낮다.
- 브라우저 개발자 도구로 즉시 조정할 수 있다.

## 런타임 계약

런타임은 글꼴 CSS가 안정적으로 제어할 수 있는 DOM 계약을 제공해야 한다.

### 안정 part 토큰

- `part="root"`
- `part="line"`
- `part="word"`
- `part="space"`
- `part="glyph"`
- `part="glyph-body"`
- `part="cluster"`
- `part="jamo"`
- `part="content"`
- `part="choseong"`
- `part="jungseong"`
- `part="jongseong"`

복합 자소를 위한 추가 토큰도 안정 계약에 포함한다.

- `part="jungseong-base"`
- `part="jungseong-tail"`
- `part="jungseong-cluster"`
- `part="jongseong-left"`
- `part="jongseong-right"`
- `part="jongseong-cluster"`
- `part="head"` (syllable 깊이의 완성형 head 자소)

접근성용 원문 노드도 안정 계약이다 (관리 root의 형제이며 시각적으로 숨김 — 현재 part 토큰은 `head`를 포함해 총 20종).

- `part="sr-source"`

즉, 실제 DOM에서는 `part`가 공백으로 구분된 토큰 집합으로 나타난다.

```html
<span part="glyph" data-jung-layout="split-right" data-jong-layout="none">
  <span part="glyph-body">
    <span part="jamo choseong">ㄱ</span>
    <span part="cluster jungseong-cluster">
      <span part="jamo jungseong jungseong-base">ㅗ</span>
      <span part="jamo jungseong jungseong-tail">ㅏ</span>
    </span>
  </span>
</span>
```

### 안정 data 속성

글자 또는 바탕 요소에 아래 정보를 제공한다.

- 바탕 요소의 정본 확정 옵션: `data-fy-font`, `data-fy-profile`, `data-fy-size`, `data-fy-spacing`(설정 시), `data-fy-wrap-unit`, `data-fy-animate`(설정 시), `data-fy-seed`(설정 시)
- 클래스 방식에 작성자가 쓴 입력: `data-font`, `data-profile`, `data-size`, `data-spacing`, `data-wrap-unit`, `data-animate`, `data-seed` — 런타임이 덮어쓰지 않음
- 전용 태그의 호환용 사본: `data-font`, `data-profile`, `data-size`, `data-wrap-unit`, `data-animate`, `data-seed`
- `data-fy-expression="sebeol|general"`
- `data-fy-layout-bucket="right-open|right-closed|bottom-open|bottom-closed|split-open|split-closed"`
- `data-fy-axis="right|bottom|split"`
- `data-fy-open="open|closed"`
- `data-fy-jong-count="none|single|double"`
- `data-fy-role="choseong|jung-main|jung-base|jung-tail|jong-main|jong-left|jong-right|jung-cluster|jong-cluster"`
- `data-fy-host="custom-element|decorator"`
- `data-hangul="true|false"`
- `data-jung-layout="right|bottom|split-right"`
- `data-jong-layout="none|single|double"`
- `data-glyph-kind="hangul|latin|digit|punctuation|symbol"`
- `data-line-index` / `data-word-index` / `data-glyph-index` / `data-jamo-index` — 세그먼트 순번

세그먼트마다 다음 인라인 CSS 변수도 자동 주입된다: `--fy-line-index`, `--fy-word-index`, `--fy-glyph-index`, `--fy-jamo-index`. 바탕 요소에 씨앗값(`seed`)이 지정되면 `--fy-seed`도 함께 주입된다. 자세한 활용은 [움직임과 변주](./animation-and-variation.md) 참조.

이 정보가 있어야 CSS 글꼴이 음절 구조별로 다른 배치를 줄 수 있다.
현재 기본 제공 일반 글꼴은 `gothic.css`의 한 단계 저작을 기준으로 한다. `sebul.css`와 같이 바탕 요소 한 블록에서 자리 변수만 조절하면 되고, 직접 내보내지지 않는 부모 자리(`--fy-tc-*`, `--fy-tl-*`, `--fy-tr-*`, `--fy-mc-*`, `--fy-bs-*`, `--fy-xl-*`, `--fy-xr-*` …)로 형제 자리의 배치를 한 번에 잡을 수 있다. 부모 자리는 내보내지지 않고 자식과 역할이 같다 — `br`은 `bottom:double`에서 실제로 내보내는 자리라 누구의 부모도 아니다(전에는 `--fy-br-*`가 세로모음 짜임의 홑받침 자리 `brs`로 새어 들어갔다). `--fy-tlo-*`, `--fy-tlc-*`, `--fy-tls-*`, `--fy-tro-*`, `--fy-trc-*`, `--fy-trs-*`, `--fy-brs-*`, `--fy-brd-*`, `--fy-bbrs-*`처럼 더 잘게 나뉜 자리와 `--fy-jung-cluster-open-*`, `--fy-jung-cluster-closed-*`, `--fy-jong-cluster-right-*`, `--fy-jong-cluster-bottom-*`, `--fy-jong-cluster-split-*` 같은 묶음 변수도 같은 한 블록 안에서 바로 쓸 수 있다. 런타임이 노출하는 `data-fy-layout-bucket`, `data-layout-key`, `data-fy-axis`, `data-fy-open`, `data-fy-jong-count`, `data-fy-role`은 구조 기반 선택자가 정말 필요할 때만 쓰는 보조 계약으로 남긴다. `gothic2.css`는 현재 `gothic.css`를 불러오는 하위 호환 별칭이다.

## CSS 변수 계약

글꼴은 CSS 변수를 사용해 변형 값을 주입한다. 현재 구현의 기본 저작 수단은 `data-fy-pos` 배치 토큰에 대응하는 자리 변수다.

바탕 요소를 고르는 조건은 `:where([data-fy-font="이름"])` 한 가지 관례만 쓴다. 런타임이 업그레이드할 때 정본 확정 글꼴 이름을 찍으므로(폐기 예정 별칭 `default`/`classic`/`gothic2`도 `sebul`/`gothic`으로 정규화 — [ADR-005](../ADR/ADR-005-font-alias-normalization-and-gating.md)), 글꼴 CSS는 작성자가 쓴 `data-font`/`data-profile`, 별칭 계열, `font-kku[font=...]` 속성 선택자를 나열할 필요가 없다. 특히 클래스 방식 입력과 `data-fy-font`를 OR 조건으로 함께 쓰면 JS 1회 글꼴 덮어쓰기에서 두 글꼴이 동시에 맞을 수 있으므로 금지한다.

```css
@layer font-kku.font, font-kku.jamo, font-kku.context;

@layer font-kku.font {
  :where([data-fy-font="rounded"]) {
    --fy-font-id: rounded;
    --fy-contract: 2;
    --fy-material: system;
    --fy-expression-mode: general;
    --fy-glyph-width: 1em;
    --fy-glyph-height: 1.25em;
    --fy-word-gap: 0.32em;
    --fy-line-gap: 0.2em;
    --fy-space-width: 0.5em;

    --fy-tlo-top: -2%;
    --fy-tlo-left: -2%;
    --fy-tlo-size: 0.88em;

    --fy-tro-top: 5%;
    --fy-tro-left: 35%;
    --fy-tro-size: 0.92em;

    --fy-brs-top: 40%;
    --fy-brs-left: 5%;
    --fy-brs-size: 0.72em;
  }
}
```

## 글꼴 계약 v2 — 레이어와 레벨

정본 결정은 [ADR-008](../ADR/ADR-008-font-contract-v2.md)이다. 이 절은 글꼴 CSS가 지켜야 할 구조만 요약한다.

### Cascade layer

모든 글꼴 CSS는 첫 규칙으로 같은 순서 선언을 두고, 나머지 규칙을 전부 세 레이어 안에 둔다. 순서 선언은 멱등이라 글꼴마다 반복해도 불러오는 순서와 무관하게 순서가 고정된다.

```css
@layer font-kku.font, font-kku.jamo, font-kku.context;
```

| 레이어 | 담는 규칙 | 선택자 모양 |
| --- | --- | --- |
| `font-kku.font` | 바탕 요소 규칙(글꼴 변수, 역할·부모 자리·자리 변수, `[data-fy-vowel-depth="syllable"]` 같은 바탕 요소 조건)과 자리 단위 노드 규칙(`[data-fy-pos]`만 쓰는 규칙, 그림 자소 종류별 행 선택) | `:where([data-fy-font="X"])`, `… [data-fy-pos="t"]` |
| `font-kku.jamo` | 자모 정체성으로 고르는 규칙 | `[data-jamo]`, `[data-jamo-base]`, 선택적으로 `[data-fy-pos][data-jamo]` |
| `font-kku.context` | 이웃 조건으로 고르는 규칙 | `:has()`, 짜임 조건 |

- 뒤 레이어는 특이도와 무관하게 앞 레이어를 이긴다. 같은 레이어 안에서는 특이도가 정한다(`[data-fy-pos][data-jamo]`가 `[data-jamo]`를 이긴다).
- 레이어 밖에 있는 페이지 CSS는 모든 글꼴을 이긴다. 페이지는 `@layer reset, font-kku, app;`처럼 font-kku 전체를 자기 레이어 체계 안에 배치할 수도 있다.
- `font-kku.css`의 코어 규칙은 레이어 밖에 둔다. 코어를 레이어에 넣으면 페이지의 요소 리셋에 자모 배치가 깨지기 때문이다.
- 조합 확장은 글꼴 레이어 뒤에 붙는다: `font-kku.look`(꾸밈·변주, `font-kku-looks.css`) → `font-kku.motion`(자모 움직임, `font-kku-motion.css`). 두 파일도 전체 순서 문(`@layer font-kku.font, font-kku.jamo, font-kku.context, font-kku.look[, font-kku.motion];`)을 되풀이하므로 불러온 순서와 무관하다. 순서는 글꼴 < 꾸밈 < 움직임 < 레이어 밖 페이지다.
- 꾸밈은 글꼴 린트를 받는 글꼴 CSS가 아니라 확장이다. 그래도 칠 속성과 `--fy-font-stroke`(폰트 레벨 획 폭이 없는 글꼴의 외곽선 — 스스로 선언한 글꼴은 제 값을 되찾는다)만 쓴다. 예외는 그림 자소의 마스크 칠 스위치(`--fy-sprite-paint: mask`)와 글자(`[part="glyph"]`)의 `drop-shadow`다. 자모 자리는 건드리지 않는다.

### 레벨 변수와 합성 규칙

코어 규칙이 레이어 밖에 있으므로 글꼴은 코어가 소유한 속성(`margin`, `inset`, `transform`, `font-size`, `font-weight`, `-webkit-text-stroke`, `clip-path`, 그리고 그림 자소 재료의 `background*`, `filter`, `inline-size`, `block-size`, `width`, `height`, `overflow`)을 선언해도 효과가 없다. 글꼴은 **변수로만** 자모 노드에 닿는다. 자소판도 `--fy-sprite-url`/`--fy-sprite-cell`/`--fy-sprite-cols`/`--fy-sprite-rows`/`--fy-sprite-kinds`(바탕 요소), `--fy-sprite-row`(노드), 자리 획 보정 `--fy-<slot>-dilate`(글꼴 레벨 기본 `--fy-sprite-dilate`)로 선언하고 코어가 칠한다([그림 자소 글꼴](./image-sprite-fonts.md)). 글꼴이 직접 선언하는 속성은 잉크의 칠(`color`, `text-shadow`, `-webkit-text-stroke-color` …)과 바탕 요소의 글꼴 기능(`font-feature-settings` …)뿐이다(허용 목록, 아래 "검사").

| 레벨 | 선언 위치 | 변수 | 합성 |
| --- | --- | --- | --- |
| 글꼴(`font`) | 바탕 요소 | `--fy-glyph-*`, `--fy-font-family`, `--fy-font-weight`, `--fy-font-stroke` … | 기본값 |
| 자리(`slot`) | 바탕 요소, 바탕 요소 조건 | 자리 → 부모 자리 → 역할: `--fy-<slot>-top/left/size/scale-x/scale-y/rotate/weight/stroke/clip/dilate` | 상위(구체)가 대체 |
| 자모(`jamo`) | 자모 노드(`font-kku.jamo`) | 자리 변수의 노드 재선언 + `--fy-jamo-dx/dy/scale-x/scale-y/rotate` | 대체 또는 누적 |
| 문맥(`context`) | 자모 노드(`font-kku.context`) | 자리 변수의 노드 재선언 + `--fy-ctx-dx/dy/scale-x/scale-y/rotate` | 대체 또는 누적 |
| 페이지(`page`) | 페이지 CSS·인라인 스타일 | `--fy-top/left/font-size/weight/stroke/clip`(대체), `--fy-scale-x/scale-y/rotate`(누적 보정), `--fy-sprite-filter`, `--fy-optical-sprite-*` | 최종 |

- 규칙은 하나다. **같은 변수는 대체되고, 누적이 필요한 보정은 레벨 전용 오프셋 변수로 쓴다.** 자모 규칙이 노드에 `--fy-t-left`를 다시 선언하면 자리 값을 대체한다. 바탕 요소 값은 상속으로 내려오므로 노드에 선언한 값을 이길 수 없다.
- 위치는 `(page 값 ?? slot 값) + jamo 오프셋 + context 오프셋`이다. 오프셋의 `%`는 자리 top/left와 같은 글자 상자 기준이고 `em`은 노드 글꼴 크기 기준이다. `calc()`로 합산하므로 위치 계열에 단위 없는 `0`은 쓸 수 없다(`0%`로 쓴다).
- 모든 속성이 같은 규칙을 따른다: **절대값 = 페이지 ?? 자리 ?? 부모 자리 ?? 역할 ?? 글꼴 ?? 내장값, 보정 = 자모·문맥·페이지 레벨 변수의 누적.** 역할은 어느 속성에서도 곱해지지 않는 대체값이다(2026-09 이전 코어는 역할 배율만 자리 배율에 곱했다).
- 배율 = 자리 체인 배율 × 자모 × 문맥 × 페이지(`--fy-scale-*`). 회전 = 자리 체인 회전 + 자모 + 문맥 + 페이지(`--fy-rotate`). 굵기는 `--fy-weight`(페이지) → 자리 체인 weight → `--fy-font-weight`, 획 보상은 `--fy-stroke`(페이지) → 자리 체인 stroke → `--fy-font-stroke`, 잘라내기는 `--fy-clip`(페이지) → 자리 체인 clip → `none` 순으로 해소된다. `--fy-font-weight`는 노드별 덮어쓰기가 아니라 글꼴 레벨 기본값이다.
- 자모별 잘라내기는 자모 레이어에서 자리 clip(`--fy-mt-clip: inset(0 0 31% 0)` 등)을 재선언한다.
- `--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`, 깊이 변수 `--fy-jamo-depth`/`--fy-vowel-depth`/`--fy-coda-depth`는 페이지 작성자 전용이다(글꼴의 깊이는 `--fy-font-*-depth`)(레지스트리 `declaredBy: page`). 글꼴이 쓰지 않으므로 글꼴을 가져다 쓴 페이지가 항상 마지막 말을 한다.
- 같은 레이어 안에서는 특이도가, 같으면 파일 순서가 정한다. 한 노드에 같은 특이도의 두 규칙이 겹쳐 속성별로 값을 나눠 갖지 않게 조건을 서로 배타적으로 쓴다(gothic의 ㅇ/ㅎ 초성 × mtl ㅗ 규칙이 예).

### 메타데이터

글꼴 CSS는 바탕 요소 규칙에 아래 세 값을 선언한다.

- `--fy-font-id: <name>` — 파일 이름과 같다. 런타임은 이 값으로 요청한 글꼴의 CSS가 바탕 요소에 도착했는지 판정한다.
- `--fy-contract: 2` — 글꼴이 따르는 계약 버전. 런타임이 지원하는 값보다 크면 글꼴별로 한 번 경고하고 그리기는 계속한다.
- `--fy-material: system | sprite | bundled` — 재료. 기본 제공 글꼴은 `system`(`sebul`, `gothic`과 그 파생 글꼴)과 `sprite`(`sprite-example`, `sprite-system`과 그 파생 글꼴)만 쓴다. `system`이 아니면 런타임이 바탕 요소에 `data-fy-material`을 찍고, `sprite`이면 `--fy-sprite-kinds`를 `data-fy-sprite-kinds`로 찍어 코어 그림 자소 재료 규칙의 조건으로 쓴다.

런타임은 그릴 때 깊이·표현 모드와 함께 이 값을 읽고, `FontKku.fontInfo(host)`로 돌려준다. 스타일시트 `load`나 `FontKku.refreshAll()`, `FontKku.loadFont(href)` 뒤에 다시 해석한다. 자세한 동작은 [브라우저 런타임 설계](./browser-runtime-design.md)를 본다.

### 검사

글꼴 CSS 문법의 정본은 [ADR-008 §9](../ADR/ADR-008-font-contract-v2.md)다. 검사 모듈 `authoring/font-kku-lint.js`(`FontKkuLint.lint(css, { fileName })`)가 글꼴 작업실 파서 위에서 규칙 트리와 선택자를 문법대로 읽고, `node scripts/check_css_contract.js --check`(모든 `profiles/*.css`와 별칭 shim), `tests/font_lint.test.js`, 글꼴 작업실이 같은 모듈을 쓴다. 강제하는 것:

- 구조: 첫 문장이 레이어 순서 선언, 모든 규칙이 세 레이어 블록 안(최상위에는 그 밖에 `@font-face`만), 레이어 안 조건부 그룹은 `@media`·`@supports`만, 중첩·익명 레이어·CSS nesting·`!important` 금지, `@import`는 별칭 shim의 대상 한 줄만
- 범위: 모든 선택자가 `:where([data-fy-font="<id>"])`로 시작(바탕 요소 조건은 그 `:where` 안, `<id>`는 소문자 — 런타임이 `data-fy-font`를 소문자로 찍는다), 런타임 DOM 계약의 속성과 `:is`/`:where`/`:not`/`:has`만
- 레이어 = 레벨: 파싱한 대상 복합 선택자와 조건으로 판정 — 바탕 요소·자리/역할/종류 조건은 `font`, 자모 조건은 `jamo`, 문맥 조건(`:has()`, 조상·형제, 짜임)은 `context`. 대상은 바탕 요소나 자모 노드(조상 글자를 대상으로 한 문맥 규칙은 오류)
- 변수: 레지스트리 `declaredBy: font`만, 범위(바탕 요소/노드)가 대상과 맞게, `--fy-jamo-*`·`--fy-ctx-*`는 자기 레이어에서만. 미등록·폐기 예정·예약 자리 변수 금지
- 속성: 허용 목록(칠하기 — `color`, `text-shadow`, `-webkit-text-stroke-color`, `opacity`, `text-decoration*` …; 바탕 요소만 글꼴 기능). 위치·크기·변형·잘라내기·획 폭·배경·필터 등은 코어 소유
- 값: 레지스트리 `type` 검사, 길이 변수의 단위 없는 0(`0`, `0.0`, `-0`, `+0`, `calc()` 합의 `0`) 금지, 자산 `url()`은 상대 경로나 `data:`
- 메타데이터 세 값(`--fy-font-id`는 파일 이름과 일치)을 조건 없는 바탕 요소 규칙에. `--fy-material: sprite`이면 `--fy-sprite-url`과 `--fy-sprite-kinds`(`consonant`·`vowel`·`coda-cluster` 목록)도 있다

## 코어 규칙

런타임 기본 스타일은 각 part에 대해 아래처럼 변환을 적용한다. 아래는 `font-kku.css`의 발췌이며 선택자 조건(`:where(font-kku, .font-kku)`)을 생략했다. 정확한 식은 `font-kku.css`가 정본이다.

```css
[part="line"] {
  display: block;
  margin-block-start: var(--fy-line-gap, 0);
}

[part="word"] {
  display: inline-flex;
  vertical-align: top;
  margin-inline-end: var(--fy-word-gap, 0);
}

[part="space"] {
  display: inline-block;
  inline-size: calc(var(--fy-space-count, 1) * var(--fy-space-width, 0.5em));
  block-size: 1px;
}

/* 낱말 사이 칸(앞뒤가 낱말)은 접히는 실제 공백 — 줄을 바꾼 자리에서 보통 글처럼 사라진다(2026-10-13) */
[part="space"]:not(:first-child, :last-child) {
  display: inline;
  word-spacing: calc(var(--fy-space-count, 1) * var(--fy-space-width, 0.5em));
}

[part="space"]:not(:first-child, :last-child)::after {
  content: " ";
  font-size: 0;
  letter-spacing: 0;
}

[part="glyph"] {
  position: relative;
  display: inline-block;
  inline-size: var(--fy-glyph-width, 1em);
  block-size: var(--fy-glyph-height, 1.2em);
}

[part="glyph-body"] {
  position: absolute;
  inset: 0;
}

[part~="jamo"] {
  position: absolute;
}

/* 비한글 content는 static baseline 배치다. glyph 박스는 자연 advance 폭을 쓰고
   (`inline-size: auto`), content는 line-height:1 inline-block이라 한글 자모와
   같은 baseline에 앉는다. `--fy-content-advance`로 고정 칸을 opt-in 할 수 있다. */
[part="glyph"][data-hangul="false"] {
  inline-size: var(--fy-content-advance, auto);
}

[part="content"] {
  display: inline-block;
  line-height: 1;
}

[part~="jungseong-cluster"],
[part~="jongseong-cluster"] {
  position: absolute;
  inset: 0;
}

[part~="jamo"] {
  inset-block-start: calc(
    var(--fy-top, var(--fy-slot-top, var(--fy-role-top, 0%)))
    + var(--fy-jamo-dy, 0%) + var(--fy-ctx-dy, 0%)
  );
  inset-inline-start: calc(
    var(--fy-left, var(--fy-slot-left, var(--fy-role-left, 0%)))
    + var(--fy-jamo-dx, 0%) + var(--fy-ctx-dx, 0%)
  );
  font-weight: var(--fy-weight, var(--fy-slot-weight, var(--fy-role-weight, var(--fy-font-weight, inherit))));
  font-size: var(--fy-font-size, var(--fy-slot-font-size, var(--fy-role-font-size, 1em)));
  -webkit-text-stroke-width: var(--fy-stroke, var(--fy-slot-stroke, var(--fy-role-stroke, var(--fy-font-stroke, 0px))));
  clip-path: var(--fy-clip, var(--fy-slot-clip, var(--fy-role-clip, none)));
}

/* BEGIN GENERATED CSS CONTRACT: dispatch — emit되는 slot마다 한 줄, 부모 slot·role로 fallback */
[data-fy-pos="tlo"] {
  --fy-slot-top: var(--fy-tlo-top, var(--fy-tl-top, var(--fy-role-top, 0%)));
  /* left / font-size / scale-x / scale-y / rotate / weight / stroke / clip / dilate도 같은 모양 */
}

[part~="head"],
[part~="choseong"],
[part~="jungseong"],
[part~="jongseong"] {
  transform:
    scale(var(--fy-slot-scale-x, var(--fy-role-scale-x, 1)), var(--fy-slot-scale-y, var(--fy-role-scale-y, 1)))
    scale(var(--fy-jamo-scale-x, 1), var(--fy-jamo-scale-y, 1))
    scale(var(--fy-ctx-scale-x, 1), var(--fy-ctx-scale-y, 1))
    scale(var(--fy-scale-x, 1), var(--fy-scale-y, 1))
    rotate(var(--fy-slot-rotate, var(--fy-role-rotate, 0deg)))
    rotate(var(--fy-jamo-rotate, 0deg))
    rotate(var(--fy-ctx-rotate, 0deg))
    rotate(var(--fy-rotate, 0deg));
}
```

자리·역할 디스패치 블록(`BEGIN/END GENERATED CSS CONTRACT: dispatch`)은 `spec/css-variables.json`의 자리 트리(`slotContract.tokens[].parent`)에서, 묶음 블록(`… cluster`)은 `clusterContract`에서 `node scripts/check_css_contract.js --write`로 생성하고, `--check`가 낡은 블록을 거부한다. 블록 밖의 기본 CSS는 손으로 쓴 실행 정본이다.

즉, 글꼴 변수는 다음 레벨에 각각 연결된다.

- 바탕 요소: 공통 기본값과 글꼴 선택
- 바탕 요소: `--fy-expression-mode`, `data-fy-expression`
- 바탕 요소: `--fy-size`, `data-fy-size`
- 줄(line): `--fy-line-gap`
- 단어(word): `--fy-word-gap`
- 공백(space): `--fy-space-width`, `--fy-space-count`
- 글자(glyph): `--fy-glyph-width`, `--fy-glyph-height`
- glyph-body / 묶음: 광학 상자 변형(transform)과 origin 변수
- 바탕 요소: 글꼴 레벨 기본값 `--fy-font-weight`, `--fy-font-stroke`와 메타데이터 `--fy-font-id`, `--fy-contract`, `--fy-material`
- 자리 토큰과 부모 자리: `--fy-<token>-top`, `-left`, `-size`, `-scale-x`, `-scale-y`, `-rotate`, `-weight`, `-stroke`, `-clip`, `-dilate`(그림 자소 획 보정)
- 역할 단축 변수: `--fy-head-*`, `--fy-choseong-*`, `--fy-jung-main-*`, `--fy-jung-base-*`, `--fy-jung-tail-*`, `--fy-jong-main-*`, `--fy-jong-left-*`, `--fy-jong-right-*` (자리와 같은 접미사 10종)
- 자모 노드 보정: `--fy-jamo-dx`, `--fy-jamo-dy`, `--fy-jamo-scale-x`, `--fy-jamo-scale-y`, `--fy-jamo-rotate`
- 문맥 노드 보정: `--fy-ctx-dx`, `--fy-ctx-dy`, `--fy-ctx-scale-x`, `--fy-ctx-scale-y`, `--fy-ctx-rotate`
- 페이지 전용 덮어쓰기: `--fy-top`, `--fy-left`, `--fy-font-size`, `--fy-weight`, `--fy-stroke`, `--fy-clip`, `--fy-scale-x`, `--fy-scale-y`, `--fy-rotate`, `--fy-sprite-filter`, `--fy-optical-sprite-*`

### 기계 판독용 CSS 계약

`spec/css-variables.json`은 공개 `--fy-*` 목록과 type/kind/surface/default, 레벨 메타데이터(`level`·`scope`·`declaredBy` — 글꼴이 선언해도 되는지, 페이지 전용인지, 런타임·코어 전용인지), role/family, 자리 트리(`parent`·`role`)와 자리 생애주기 메타데이터를 기록한다. 현재 변수·자리 규모는 `node scripts/check_css_contract.js --check` 출력으로 확인한다. `font-kku.css`는 실제 선택자와 대체값을 실행하는 정본 구현으로 유지하되 자리·역할 디스패치 블록만 레지스트리에서 생성한다. 검사기가 레지스트리와 이름·마지막 대체값을 대조하고, 글꼴 CSS에는 위의 v2 검사를 적용한다.

자리는 `active`/`fallback`/`reserved`/`deprecated`로 나뉜다. 정확한 생애주기와 내보내는 자리 집합은 레지스트리와 배치 spec이 정본이며, 새 글꼴은 deprecated/reserved 토큰을 사용하지 않는다. 글꼴 편집기의 자리 계약과 `font-kku.css` 디스패치 블록은 레지스트리에서 `node scripts/check_css_contract.js --write`로 생성한다(`font-kku.css`를 바꿨으면 `python scripts/sync_assets.py`로 사본도 갱신한다). 자세한 정본 방향은 [ADR-007](../ADR/ADR-007-css-variable-registry-and-editor-codegen.md)을 따른다.

## 레거시 이전 대응표

레거시 위치 클래스는 새 시스템에서 "클래스 이름 1개"로 직접 치환되지 않는다. 새 계약에서는 다음 조합으로 표현한다.

- `part` 토큰: 자소의 역할
- 글자 `data-*`: 음절 짜임
- CSS 변수: 실제 좌표와 배율

즉, 레거시의 `tl`, `tr`, `ml`, `mtl`은 새 시스템에서 선택자 + 변수 조합으로 대응되고, 필요하면 `tlo/tlc/tls`, `tro/trc/trs`, `blr/brs/brd`, `bl/br`, `bbrs/bbrd` 같은 active 상태의 더 잘게 나뉜 자리로 세분할 수 있다.

| 레거시 | 레거시 의미 | 새 선택자 모양 | 비고 |
| --- | --- | --- | --- |
| `tl`, `tlo`, `tlc`, `tls` | 세로모음/섞임모음 짜임의 초성 | `[part~="choseong"]` | `tlo=right-open`, `tlc=right-closed`, `tls=split-open` |
| `tr`, `tro`, `trc`, `trs` | 세로모음 중성 또는 섞임모음 중성의 오른쪽 부분 | `[part~="jungseong"]` 또는 `[part~="jungseong-tail"]` | `tro=right-open`, `trc=right-closed`, `trs=split-open tail` |
| `ml` | 섞임모음 중성의 기본 부분 | `[data-jung-layout="split-right"] [part~="jungseong-base"]` | `ㅘ`, `ㅢ` 같은 경우 |
| `mtl` | 받침이 있을 때 위로 당겨진 섞임모음 중성의 기본 부분 | `[data-fy-pos="mtl"]` 또는 `[data-jung-layout="split-right"][data-jong-layout="single"] [part~="jungseong-base"]` | 위치 이동은 `--fy-mtl-top`(자리) 또는 자모 레이어의 `--fy-jamo-dy`로 조정 |
| `tt/ttl` | 받침 때문에 위로 이동한 초성 | `[data-fy-pos="tt"]`, `[data-fy-pos="ttl"]` 또는 `[data-jong-layout="single"] [part~="choseong"]` | 왼쪽 미세 이동은 `--fy-tt-left` / `--fy-ttl-left`(자리) 또는 `--fy-jamo-dx`로 조정 |
| `blr/brs/brd`, `bl/br`, `bbr/bbrs/bbrd` | 받침 노드 | `[part~="jongseong"]`, 겹받침이면 `[part~="jongseong-right"]` | `brs=right:single`, `blr/brd=right:double`, `bl/br=bottom:double`, `bbrs=split-right:single`, `bbrd=split-right:double-right` |

복합 모음 분리의 핵심은 "중성 노드 2개 생성"이다. 예를 들어 `과`는 아래처럼 그려진다.

```html
<span part="glyph" data-jung-layout="split-right" data-jong-layout="none">
  <span part="glyph-body">
    <span part="jamo choseong">ㄱ</span>
    <span part="cluster jungseong-cluster">
      <span part="jamo jungseong jungseong-base">ㅗ</span>
      <span part="jamo jungseong jungseong-tail">ㅏ</span>
    </span>
  </span>
</span>
```

이때 글꼴 CSS는 `[part="glyph"]`를 기준으로 삼고, 필요하면 `glyph-body` 또는 `jungseong-cluster`에 광학 상자 변형을 준 뒤 `jungseong-base`와 `jungseong-tail` 각각의 자리 변수(`--fy-ml-*`, `--fy-trs-*` 등)를 조정하면 된다. 자모별 차이는 자모 레이어의 자리 변수 재선언이나 `--fy-jamo-*` 오프셋으로 준다. `--fy-top` / `--fy-left`는 페이지 전용이라 글꼴이 쓰지 않는다. 한글 자모 노드는 자손 관계만 보장되고 직계 자식 관계는 보장하지 않는다.

## 짜임별 스타일

모든 한글 음절이 같은 구조는 아니므로, CSS 글꼴은 음절 짜임에 따라 다르게 적용되어야 한다.

예:

- 세로모음 짜임인지(중성이 오른쪽)
- 가로모음 짜임인지(중성이 아래)
- 섞임모음 짜임인지(복합 모음)
- 민글자인지, 홑받침인지, 겹받침인지

짜임 구분의 대부분은 이미 배치 토큰에 들어 있다. 예를 들어 세로모음 중성은 `tro`/`trc`, 섞임모음 중성은 `ml`+`trs`/`mtl`+`ttr`, 겹받침은 `blr`+`brd`/`bl`+`br`/`bbl`+`bbrd`로 내보내지므로 먼저 해당 자리 변수를 바탕 요소에 선언한다. 자리로 표현되지 않는 이웃 조건만 문맥 레이어에서 노드 변수로 준다.

예시:

```css
@layer font-kku.font {
  :where([data-fy-font="rounded"]) {
    --fy-tro-left: 52%;   --fy-tro-top: 14%;    /* 오른쪽형 중성 */
    --fy-ml-left: 14%;    --fy-ml-top: 38%;     /* 분리 중성 base */
    --fy-trs-left: 50%;   --fy-trs-top: 10%;    /* 분리 중성 tail */
    --fy-blr-top: 58%;    --fy-brd-top: 58%;    /* right:double 겹받침 */
    --fy-brd-scale-x: 0.82;
  }
}

@layer font-kku.context {
  /* 초성이 ㅇ일 때만 아래 ㅗ를 내린다 — 같은 slot 값에 누적 */
  :where([data-fy-font="rounded"]) [part="glyph"]:has([part~="choseong"][data-jamo="ᄋ"]) [data-fy-pos="m"][data-jamo="ᅩ"] {
    --fy-ctx-dy: 3%;
  }
}
```

## 복합 모음 그리기 (섞임모음 짜임)

복합 모음(ㅘ,ㅙ,ㅚ,ㅢ 등)은 가로 부분(ㅗ/ㅜ/ㅡ)과 세로 부분(ㅏ/ㅐ/ㅣ)으로 나뉘어 그려진다. 실제 글꼴은 이를 하나로 이어진 글자로 디자인하지만, font-kku는 두 개의 독립 자모를 절대 위치로 배치하므로 시각적 연결이 과제이다.

### 세 가지 기법

| 기법 | CSS 수단 | 효과 |
| --- | --- | --- |
| **겹침 배치** | 가로 부분 `left`↑ + 세로 부분 `left`↓ | 경계 상자 겹침으로 간격 해소 |
| **scaleX 확장** | 가로 부분 자리 `--fy-ml-scale-x: 1.2` | 오른쪽으로 시각 확장 (기준점: 왼쪽 위) |
| **크기 균형** | 가로 부분 작게, 세로 부분 크게 | 실제 고딕체의 비율 모사 |

세 기법을 조합하면 분리된 자모가 하나의 복합 모음처럼 인식된다.

### 예시: 과 (ㄱ + ㅗ + ㅏ, 섞임모음 짜임·민글자)

```
┌─────────────────┐ 1em × 1.2em glyph box
│ ㄱ(tl)          │ top:0%, left:0%, size:0.66em
│   0.66em        │
│                 │
│  ㅗ(ml)←──scaleX:1.2──→  ← left:6%, 오른쪽으로 밀기
│   0.54em×1.2              ← 시각적 오른쪽 끝 ≈ 71%
│        ㅏ(tr)   │ top:2%, left:34%, size:0.66em
│        0.66em   │           ← 세로 파트 왼쪽으로 당기기
│                 │
└─────────────────┘
       ↑ ㅗ 우측 끝(~71%)이 ㅏ 좌측(34%)을 넘어서 겹침 발생
```

### 주의사항

- scaleX/scaleY는 1.2 이하가 적절. 1.5 이상은 눈에 띄는 왜곡 발생.
- 겹침 배치만으로도 효과적. 배율 조정은 보조 수단.
- 섞임모음 짜임의 홑받침·겹받침은 종성 공간 때문에 전체적으로 축소되므로 겹침 여백을 더 빠듯하게 설정.
- 음수 `left` 값도 CSS에서 유효하나, 글자 상자 밖으로 나가므로 주의.

## 비한글 스타일 계약

비한글 문자는 레거시의 `.asc`, `.etc`처럼 별도 레이아웃 클래스를 만들지 않는다. 대신 공통 글자 요소 아래에 content 노드 하나를 두고 종류(kind)로 구분한다.

```html
<span part="glyph" data-hangul="false" data-glyph-kind="latin">
  <span part="content">A</span>
</span>

<span part="glyph" data-hangul="false" data-glyph-kind="symbol">
  <span part="content">◎</span>
</span>
```

- `.asc` -> `[part="glyph"][data-glyph-kind="latin"] [part="content"]`
- `.etc` -> `[part="glyph"][data-glyph-kind="symbol"] [part="content"]`

글꼴은 가능하면 종류 선택자와 바탕 요소 크기를 활용하고, 한글용 짜임 선택자와는 분리해서 다루는 편이 좋다.

## 그룹 레벨 스타일

글꼴은 자소뿐 아니라 그룹 레벨도 조절할 수 있어야 한다.

- 줄(line): 줄 간격, 정렬, 등장 움직임
- 단어(word): 단어 간격, nowrap 정책
- 공백(space): 공백 폭, 연속 공백 표현
- 글자(glyph): 글자 폭, 높이, 기울기, 호버 효과

이 구조가 있으면 "글꼴"뿐 아니라 "글자 움직임 스타일"도 꾸러미로 묶을 수 있다.

## 성능 측면

이 설계의 중요한 장점:

- 글꼴 변경은 가능하면 CSS 재계산만 일으킨다.
- 텍스트 분해 캐시와 DOM 트리를 재사용할 수 있다.
- 글꼴 전환 UI를 가볍게 만들 수 있다.

즉, 자소 위치가 CSS 변수에 묶여 있으면 스타일 실험과 미리보기가 훨씬 싸다.

## 저작 모델

글꼴 제작자는 "어느 레벨에 쓰는가"만 고른다.

1. 글꼴 레벨 바탕 요소 변수 (`--fy-glyph-*`, `--fy-font-*`, 메타데이터)
2. 역할·부모 자리·자리 변수 (바탕 요소 또는 깊이 같은 바탕 요소 조건)
3. 자모 레이어의 자모별 재선언과 `--fy-jamo-*` 오프셋
4. 문맥 레이어의 이웃 조건 규칙과 `--fy-ctx-*` 오프셋

바탕 요소 조건은 정본 `data-fy-font` 하나로 전용 태그와 클래스 방식을 함께 덮는다.

표현이 다른 글꼴은 배치를 새로 교정하지 않고 **파생 글꼴**로 만든다. `spec/fonts.json`의 `derivedFrom`이 기반 글꼴을 가리키고, `scripts/build_derived_fonts.js`가 기반의 배치를 GENERATED 구간에 복사하며, 제작자는 그 아래에 칠·그림자·기울기만 쓴다. 같은 레이어의 같은 변수는 대체되므로 꾸밈은 기반이 쓰지 않는 변수를 쓴다(`neon`·`sticker`·`malang`·`geumbak`·`glitch`는 `sebul`, `retro`·`saekdong`·`riso`·`blueprint`는 `gothic` 기반. [ADR-010](../ADR/ADR-010-derived-fonts-and-script-loader.md)).

파생 글꼴의 꾸밈은 씨앗을 읽을 수 있다(**씨앗 반응 글꼴**, [ADR-016](../ADR/ADR-016-seed-aware-fonts.md)). 씨앗 규칙은 `:where([data-fy-font="<id>"][data-fy-jamo-seeds="true"])` 조건으로 `jamo-seeds`를 켠 바탕 요소에만 닿고, `(var(--fy-jamo-seed, 0.5) - 0.5)` 꼴이라 값이 없으면 0이다. 기하는 기반이 쓰지 않는 자모 레벨 변수로, 칠은 허용 속성으로만 쓰며, 폭은 겹침 감사의 씨앗 표본(`tests/overlap-policy.json` `seeds`)이 정한다. 기본 제공: `malang`·`crayon`·`chalk`·`jasu`·`sticker`·`glitch`.

이를 위해 기본 제공 자산이 필요하다.

- 시작용 글꼴 CSS
- 글꼴 저작 안내서
- 놀이터·견본 페이지
- 샘플 글꼴 2~3종

## 용어

문서 용어는 아래처럼 정리한다.

- `theme`: 색감이나 간단한 분위기 수준
- `style font`: 자소 기하와 배치를 정의하는 글꼴 유사 단위
- `font pack`: 여러 글꼴 CSS 모음

실제 제품에서는 `font`를 공식 용어로 쓰는 편이 명확하다.

## 결론

이 프레임워크는 단순한 그리기 엔진이 아니라 "구조는 JS가, 형태는 CSS가 담당하는 자소 글꼴 엔진"으로 가는 편이 맞다. 그래야 사용자가 CSS 파일을 만들면서 새로운 글자 스타일을 제작할 수 있다.
