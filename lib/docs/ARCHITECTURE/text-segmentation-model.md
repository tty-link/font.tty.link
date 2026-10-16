# 텍스트 분절 모델

> Status: Implemented
> Scope: 런타임의 텍스트 단위 구성과 줄바꿈 동작

## 문제 진단

레거시 구현은 텍스트를 순차적으로 읽으면서 다음만 출력한다.

- 글자 노드
- 공백 노드
- `<br/>`

즉, "줄", "단어", "글자"가 서로 다른 계층으로 모델링되지 않는다. 이 구조에서는 다음 제어가 어렵다.

- 글자 단위 줄바꿈
- 단어 단위 줄바꿈
- 강제 줄 유지
- 특정 줄/단어 단위 움직임
- 선택적 다시 그리기

새 런타임은 텍스트를 배치 가능한 세그먼트 트리로 먼저 정규화한 뒤 그려야 한다.

## 목표

다음 세 가지 단위를 런타임의 1급 개념으로 다룬다.

- 줄 (`line`)
- 단어 (`word`)
- 글자 (`glyph`)

여기서 글자(`glyph`)는 사용자 관점의 "글자" 단위이며, 한글은 기본적으로 완성형 음절 하나를 글자 하나로 취급한다. 실제 자소는 글자 내부의 하위 노드다.

## 세그먼트 트리

```ts
type TextModel = {
  lines: LineSegment[];
};

type LineSegment = {
  type: "line";
  index: number;
  children: LineChild[];
};

type LineChild = WordSegment | SpaceSegment;

type WordSegment = {
  type: "word";
  index: number;
  children: GlyphSegment[];
};

type SpaceSegment = {
  type: "space";
  index: number;
  raw: string;
  count: number;
  kind: "space" | "tab" | "nbsp" | "mixed";
};

type GlyphSegment = {
  type: "glyph";
  index: number;
  source: string;
  kind: "hangul" | "latin" | "digit" | "space" | "punctuation" | "symbol";
  jamo?: {
    choseong?: string[];
    jungseong?: string[];
    jongseong?: string[];
  };
  topology?: {
    jungLayout: "right" | "bottom" | "split-right";
    jongLayout: "none" | "single" | "double";
  };
};
```

## 정규화 규칙

### 줄 (`line`)

- 입력 텍스트의 줄바꿈(`\n`, `<br>` 변환 결과)은 명시적 `line` 분리로 보존한다.
- 각 줄은 독립된 그리기 컨테이너가 된다.

### 단어 (`word`)

- 기본 단어 경계는 공백류 문자에서 만든다.
- 단어는 연속된 비공백 글자들만 담는다.
- 단어 뒤 공백 정보는 불리언으로 줄이지 않고 별도 `space` 세그먼트로 보존한다.

### 글자 (`glyph`)

- 글자는 NFC 정규화 뒤의 extended grapheme cluster 하나다.
- 한 코드포인트짜리 한글 완성형 음절은 글자 1개로 처리한 뒤 내부에서 자소를 분해한다. NFC가 음절로 합성하는 조합형 자모열(NFD 한글, `가`+U+11A8 → `각`)도 같다.
- 음절로 시작하지만 코드포인트가 더 붙은 grapheme(`가`+U+0301, 중세 국어 방점 `한`+U+302E, `각`+U+11A8, `가`+U+11F0)은 분해하지 않는다. grapheme 전체를 담는 비한글 글자(`kind: "symbol"`, `data-hangul="false"`, `[part="content"]`)가 되어 뒤 문자가 화면과 평문 모드에서 사라지지 않는다.
- 영문, 숫자, 문장부호도 글자 1개 단위로 유지한다. `latin`/`digit`/`punctuation`은 한 코드포인트 글자에만 붙고, 여러 코드포인트로 된 grapheme(이모지 ZWJ 시퀀스, 결합 악센트 등)은 `symbol`이다.
- 숫자·문장부호의 범위는 실행 언어의 Unicode 판 대신 `spec/tables.json`의 고정된 number/punctuation 표에서 생성한다. 이 분류를 JS와 네 보조 렌더러가 공유한다. NFC·grapheme 분절은 환경별 한계가 남으므로 [언어 공통 렌더 계약](renderer-contracts.md)의 지원 범위를 따른다.

### 공백 (`space`)

- 연속 공백, 탭, NBSP는 `space` 세그먼트로 보존한다.
- `raw`에는 원문 공백 시퀀스를 그대로 저장한다.
- `count`는 시각 폭 계산과 CSS 연결에 쓴다.
- `kind`는 일반 공백/탭/NBSP/혼합(`mixed`)을 구분해 공백 접기(collapse) 정책과 그리기 정책에 쓴다.

## 줄바꿈 모델

줄바꿈 제어는 바탕 요소 속성 또는 JS 옵션으로 노출한다.

```html
<font-kku wrap-unit="glyph">안녕하세요 반갑습니다</font-kku>
<font-kku wrap-unit="word">안녕하세요 반갑습니다</font-kku>
<font-kku wrap-unit="line">안녕하세요
반갑습니다</font-kku>
```

```ts
type WrapUnit = "glyph" | "word" | "line";
```

### `wrap-unit="glyph"`

- 글자 컨테이너가 줄바꿈 가능한 최소 단위다.
- 가장 유연한 줄바꿈.
- 좁은 폭에서도 자연스럽게 축소된다.

### `wrap-unit="word"`

- 단어 컨테이너가 줄바꿈 가능한 최소 단위다.
- `space` 세그먼트는 단어 사이 간격으로 유지된다.
- 단어 안의 글자는 함께 줄을 옮긴다.
- 일반 문장용 기본값 후보.

### `wrap-unit="line"`

- 명시적 줄 단위만 유지한다.
- 자동 줄바꿈은 하지 않거나, 별도 옵션 없이는 비활성화한다.
- 포스터/제목형 레이아웃에 적합하다.

## DOM 구조

그리기 엔진은 다음 계층을 따른다.

아래는 `과A ` 입력의 실제 런타임 출력 구조다(`spec/html-cases.json` 직렬화 케이스들과 동일한 계약 기준으로 구성). 자소 텍스트는 호환 자모가 아니라 조합형 자모(`ᄀ/ᅩ/ᅡ`)이고, 관리 루트는 `aria-hidden`, 원문은 형제 `part="sr-source"` 노드가 담당한다. `aria-label`/`data-source`/`sr-source`는 후행 공백까지 원문을 그대로 보존한다. 가독성을 위해 바탕 요소의 확정 `data-fy-*`·인덱스·그림 자소 속성 일부는 생략했다 — 전체 속성 목록은 README의 DOM 계약 절과 정본 `spec/html-cases.json`을 본다.

```html
<font-kku data-fy-upgraded="true" data-fy-font="sebul" data-source="과A ">
  <span part="root" data-fy-root="true" aria-hidden="true">
    <span part="line" data-line-index="0" style="--fy-line-index: 0">
      <span part="word" data-word-index="0" style="--fy-word-index: 0">
        <span part="glyph" data-source="과" data-hangul="true" data-glyph-kind="hangul"
              data-jung-layout="split-right" data-jong-layout="none"
              data-layout-key="split-right:none" data-glyph-index="0" style="--fy-glyph-index: 0">
          <span part="glyph-body" data-layout-key="split-right:none">
            <span part="jamo choseong" data-jamo="ᄀ" data-fy-pos="tls">ᄀ</span>
            <span part="cluster jungseong-cluster" data-fy-role="jung-cluster">
              <span part="jamo jungseong jungseong-base" data-jamo="ᅩ" data-fy-pos="ml">ᅩ</span>
              <span part="jamo jungseong jungseong-tail" data-jamo="ᅡ" data-fy-pos="trs">ᅡ</span>
            </span>
          </span>
        </span>
        <span part="glyph" data-source="A" data-hangul="false" data-glyph-kind="latin"
              data-glyph-index="1" style="--fy-glyph-index: 1">
          <span part="content">A</span>
        </span>
      </span>
      <span part="space" data-space-kind="space" style="--fy-space-count: 1"></span>
    </span>
  </span>
  <span part="sr-source" data-fy-sr="true">과A </span>
</font-kku>
```

핵심은 다음이다.

- 줄(`line`) 요소: 수직 레이아웃과 명시적 줄 유지
- 단어(`word`) 요소: 단어 단위 줄바꿈 제어
- 공백(`space`) 요소: 연속 공백과 탭 보존
- 글자(`glyph`) 요소: 실제 자소 그리기의 최소 단위
- `sr-source`: 접근성/복사용 원문 노드 (관리 루트는 `aria-hidden="true"`)

### 자모 노드 계약

- 한글 글자는 `part="glyph"` 아래 `part~="glyph-body"`를 두고, 그 자손으로 `part~="jamo"` 노드를 만든다.
- 복합 모음/겹받침은 필요할 때 묶음 요소(`jungseong-cluster` / `jongseong-cluster`)를 먼저 만든다.
- 각 자모 노드는 역할 토큰 하나를 추가로 가진다: `choseong`, `jungseong`, `jongseong`.
- 복합 중성이 두 부분으로 나뉘면 `jungseong-base`, `jungseong-tail` 토큰으로 구분한다.
- 겹받침이 두 부분으로 나뉘면 `jongseong-left`, `jongseong-right` 토큰으로 구분한다.
- 위치 변형은 개별 토큰명 자체가 아니라 글자 짜임 선택자와 CSS 변수 조합으로 제어한다.

예를 들면 레거시의 `tr`와 `ml`은 새 시스템에서 각각 별도 클래스가 아니라 아래 선택자로 표현된다.

- `tr`: `[part~="jungseong"]` 또는 섞임모음 짜임에서는 `[part~="jungseong-tail"]`
- `ml`: `[data-jung-layout="split-right"] [part~="jungseong-base"]`

### 비한글 계약

- 비한글 글자도 똑같이 `[part="glyph"]` 요소로 감싼다.
- 실제 보이는 문자는 단일 자식 노드 `[part="content"]`로 그린다. `content` 텍스트와 `data-source`는 grapheme 전체다(한글 음절에 결합 문자가 붙은 경우 포함).
- 구분은 `.asc`, `.etc` 같은 위치 클래스 대신 글자의 `data-glyph-kind`로 한다.
- 기본 종류(kind)는 `latin`, `digit`, `punctuation`, `symbol`이며, 공백은 글자가 아니라 `[part="space"]` 세그먼트로 처리한다.

## CSS 계약

추천 기본 계약:

- `[part="root"]`: 전체 흐름 컨테이너
- `[part="line"]`: block 또는 flex row
- `[part="word"]`: `inline-flex`
- `[part="space"]`: 줄 처음·끝(원문의 들여쓰기·꼬리 빈칸)은 `inline-block`(폭을 지킨다). 앞뒤가 낱말인 칸은 `inline` + 생성 내용 `" "`(글자 크기 0, 폭은 `word-spacing`)인 접히는 공백 — 보통 글처럼 칸 뒤에서만 줄을 바꾸고 줄 끝에서 폭을 차지하지 않는다(2026-10-13, 옛 `inline-block` 칸은 다음 줄 첫머리에 남아 한 칸 들여 썼다). DOM은 어느 쪽이든 빈 span
- `[part="glyph"]`: `inline-block` 또는 `inline-flex`
- `[part~="glyph-body"]`: 절대 위치 광학 상자
- `[part~="jamo"]`: 절대 위치 한글 자손 노드
- `[part="content"]`: 비한글 글자 내용 노드

`wrap-unit`별 기본 전략:

- `glyph`: 단어 요소는 흐름 그룹만 맡고 글자 사이 줄바꿈 허용
- `word`: 단어 요소에 `white-space: nowrap` 성격을 부여
- `line`: 줄 요소별 block 유지, 내부 자동 줄바꿈 억제

## 성능 전략

- 1차 캐시: 원문 텍스트 -> 세그먼트 트리
- 2차 캐시: 글자 원문 -> 분해 결과
- 현재 구현 캐시: 글자 원문 -> 분해/짜임 결과, 정규화된 텍스트 -> 세그먼트 트리

이 구조면 다음 최적화가 가능하다.

- 텍스트 일부 변경 시 줄/단어 단위 diff
- 같은 글자와 같은 정규화 텍스트가 반복될 때 분해/세그먼트 결과 재사용
- 움직임을 단어 또는 줄 단위로 적용

## 구현 지침

구현 순서는 아래가 맞다.

1. 문자열을 바로 DOM으로 만들지 말고 `TextModel`로 정규화
2. `TextModel`에서 단어와 공백을 따로 보존한 채 `wrap-unit`을 반영해 DOM 생성
3. 글자 내부에서만 자소 분해와 배치 수행
4. 접근성용 원문은 바탕 요소에 유지

## 결론

새 프레임워크는 자소 배치 엔진이면서 동시에 텍스트 세그먼트 엔진이어야 한다. 줄/단어/글자 단위가 먼저 있어야 성능, 줄바꿈, 움직임, 접근성 모두를 안정적으로 제어할 수 있다.
