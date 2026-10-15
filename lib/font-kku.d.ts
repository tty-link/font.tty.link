declare namespace FontKku {
  type FontName = "sebul" | "gothic" | "sprite-example" | (string & {});
  type HostMode = "custom-element" | "decorator";
  type ExpressionMode = "sebeol" | "general";
  /** 자모 분해 깊이 shorthand — 두 longhand 축을 한 번에 정한다. */
  type JamoDepth = "atomic" | "composite" | "syllable";
  /** 합자 모음(ㅘ ㅢ 계열) 처리: 분해 / 통짜 / 초성과 합쳐 완성형 head. */
  type VowelDepth = "split" | "whole" | "syllable";
  /** 겹받침(ㄼ 계열) 처리: 분해 / 통짜. */
  type CodaDepth = "split" | "whole";
  /** decomposeGlyph/createTextModel의 depth 인자: shorthand 또는 축별 지정. */
  type DepthInput = JamoDepth | { vowel?: VowelDepth; coda?: CodaDepth };
  type WrapUnit = "glyph" | "word" | "line";
  type Seed = "auto" | "random" | (string & {}) | number | null;
  type GlyphKind = "hangul" | "latin" | "digit" | "punctuation" | "symbol";
  type JungLayout = "right" | "bottom" | "split-right";
  type JongLayout = "none" | "single" | "double";
  type PlacementKey =
    | "right:none"
    | "right:single"
    | "right:double"
    | "bottom:none"
    | "bottom:single"
    | "bottom:double"
    | "split-right:none"
    | "split-right:single"
    | "split-right:double";

  interface Config {
    /** Set before loading the runtime to disable its initial document scan. */
    bootstrap?: boolean;
    /**
     * 필요할 때 받기(ADR-019)의 기준 주소 — `profiles/<font>.css`·`profiles/<set>.jamo.js`가 그 아래에 있다.
     * 한 줄 설치(`<script src=".../font-kku.js" data-fonts=…>`)는 스크립트 주소에서 스스로 정한다.
     * 번들러·ESM에서 쓸 때만 준다(예: "https://cdn.jsdelivr.net/npm/@tty.link/font-kku@0.1.4-rc.1/").
     */
    fontBase?: string;
    /** false면 아직 받지 않은 글꼴·자소 세트를 스스로 받지 않는다(기본 true). */
    autoload?: boolean;
  }

  type LayoutStamp = readonly [number, number, number, number, number, "initial" | "medial" | "final", number, number, number];

  interface LayoutProfile {
    readonly revision: string;
    /** 이 프로파일이 받아 지금 도장으로 그리는 이전 revision(디자인 진단 `DESIGN_LAYOUT_REVISION_ACCEPTED`). 적지 않은 revision은 거부한다 */
    readonly accepts: readonly string[];
    /** `case-fixed`는 세벌식(짜임마다 도장, ADR-028), `fixed-three`는 직결식(세벌 고정, ADR-026), `adaptive-square`는 네모 문맥 */
    readonly model: "case-fixed" | "fixed-three" | "adaptive-square";
    /** 디자인 규칙 match가 쓸 수 있는 필드. 고정 배치(세벌식·직결식)는 jamo·role뿐 */
    readonly match: readonly string[];
    /** 자리마다 달라지는 변주(display.variationScope: occurrence)를 받는지 */
    readonly occurrence: boolean;
    /** 글자 칸(em) — 폭·높이·간격, space는 낱말 사이(빈칸 하나) 폭(있으면 `--fy-space-width`) */
    readonly cell?: { readonly width: number; readonly height: number; readonly gap: number; readonly space?: number };
    readonly depth?: { readonly vowel: "split"; readonly coda: "whole" };
    /** 그림 문맥 — 직결식은 초성(`bar`), 세벌식은 받침(`sebeol` 겹받침 뼈대). 세벌식 초성은 짜임의 모음 모양을 따른다 */
    readonly draw?: { readonly initial?: "cho" | "bar"; readonly final?: "sebeol" };
    /** 고정 배치 도장의 밀도 굵기 계수를 셈한 원소 굵기(바탕 em, sebul 0.1). 페이지 `--fy-element-width`가 다르면 런타임이 그 굵기로 다시 셈한다 */
    readonly stroke?: number;
    /**
     * 조합용 자모마다 도장(합자 모음은 조각 도장 둘). 세벌식(`case-fixed`)은 `{ 짜임 열쇠: 도장 }` — 열쇠는 모음 모양 `v`·`h`·`c`
     * (세로·가로·합자) + 받침 `0`·`1`·`2`(`"v1"`), 받침과 관계없으면 모양 열쇠 하나(`"v"`). 짜임 열쇠, 모양 열쇠 차례로 찾는다
     */
    readonly stamps?: Readonly<Record<string, LayoutStamp | readonly [LayoutStamp, LayoutStamp]
      | Readonly<Record<string, LayoutStamp | readonly [LayoutStamp, LayoutStamp]>>>>;
  }

  interface FontInfo {
    /** 요청(정규화)된 font 이름 */
    font: string;
    /** font CSS가 선언한 `--fy-font-id`. CSS가 아직 없으면 null */
    id: string | null;
    /** font CSS가 선언한 `--fy-contract` */
    contract: number | null;
    material: "system" | "sprite" | "bundled" | string;
    /**
     * 재료(ADR-024). 글꼴이 표준 잉크 상자(`--fy-font-ink-boxes: standard`)를 밝혀 자모를 그 상자에 그리면
     * `"element"`(원소를 CSS 상자로 — sebul·gothic·malang 기본), `"device"`(기기 한글 글꼴을 맞춰, ADR-023 — 꾸러미 글꼴
     * 기본이고 페이지 `--fy-face: device`로 고른다) 또는 `"svg"`(칸 계약 그림 세트 `jamo-set`). 아니면(그림 자소 재료,
     * 페이지 `--fy-ink-boxes: none`) null.
     */
    face: "element" | "device" | "svg" | null;
    /** 적용된 디자인 이름(ADR-025, `--fy-design`·`--fy-font-design`). 없거나 고르지 못했으면 null */
    design: string | null;
    /** 디자인을 고르지 못한 까닭(`data-fy-design-status`와 같다). 없으면 null */
    designStatus: DesignStatus | null;
    /**
     * 배치 프로파일(ADR-026·028). 글꼴을 밝히지 않은 바탕 요소는 기본 세벌식(`sebul-cases-v1`), 글꼴 CSS가 `--fy-font-layout`을
     * 밝히면 그 배치(`jikgyeol` → 직결식 `sebul-fixed-v1`), 1.2 디자인은 자기 `layout`을 쓴다(디자인이 이긴다).
     * 그 밖의 글꼴을 밝힌 바탕 요소·배치를 적지 않은 이전 디자인·`--fy-design: legacy`는 지금 배치라 null. 디자인이 프로파일이 받아들이는
     * 이전 revision(`accepts`)을 적었으면 `requested`가 그 revision이다 — 그리는 도장은 `revision`이다.
     */
    layout: { profile: string; revision: string; model: "case-fixed" | "fixed-three" | "adaptive-square"; requested?: string } | null;
    /** 요청한 font의 CSS가 host에 도달했는지 (`id === font`), 그리고 바탕 CSS(`font-kku.css`)가 그 host의 root에 닿는지 */
    loaded: boolean;
  }

  /**
   * `render`/`refresh`의 JS 옵션. 이 호출 1회에만 적용되고(ADR-002), 지속시키려면
   * attribute(`data-*`)로 쓴다. `undefined`·`null`·빈 문자열은 attribute 값으로 폴백한다.
   */
  interface RenderOptions {
    text?: string | null;
    font?: FontName | null;
    /** @deprecated Use `font`. */
    profile?: FontName | null;
    size?: string | number | null;
    spacing?: string | number | null;
    wrapUnit?: WrapUnit | null;
    animate?: string | null;
    seed?: Seed;
    /**
     * 렌더마다 `applyJamoSeeds(host, options)`를 자동 적용한다(opt-in, 브라우저 전용).
     * attribute `jamo-seeds` / `data-jamo-seeds`와 같은 옵션. `false`는 이 호출에서 끈다.
     */
    jamoSeeds?: boolean | JamoSeedOptions | null;
    /**
     * 벡터 자소 세트 이름(ADR-013). 그림 자소 배치 글꼴(sprite-system …)을 자소판 대신
     * `registerJamo`로 등록한 자모별 SVG로 그린다. attribute `jamo-set` / `data-jamo-set`와 같다.
     */
    jamoSet?: string | null;
    /**
     * 획 깊이(ADR-018). `"stroke"`면 벡터 자소의 획마다 `part="hoek"` 노드가 이름(종류·들여온 글자·
     * 역할)과 차례를 받는다. 기기 글꼴·자소판은 쪼갤 수 없어 `data-fy-stroke-depth="jamo"`로 알린다.
     * attribute `stroke-depth` / `data-stroke-depth`, 페이지 CSS `--fy-stroke-depth`와 같다.
     */
    strokeDepth?: "jamo" | "stroke" | null;
  }

  /** `font-kku:render` 이벤트가 알려 주는 렌더 이유. */
  type RenderReason =
    | "render"
    | "refresh"
    | "upgrade"
    | "connect"
    | "attribute"
    | "mutation"
    | "restyle";

  interface LoadErrorEventDetail {
    kind: "font" | "jamo-set";
    name: string;
    url: string;
    error: Error;
  }
  type LoadErrorEvent = CustomEvent<LoadErrorEventDetail>;

  interface RenderEventDetail {
    reason: RenderReason;
    /** 렌더에 쓰인 (정규화된) font 이름 */
    font: string;
    /** 렌더한 원문 */
    source: string;
    /** false면 host가 분리된 상태에서 렌더돼 font 스타일을 아직 해석하지 못했다(연결 시 해석). */
    resolved: boolean;
  }

  /** host에서 발생하는 `font-kku:render` 이벤트 (bubbles, composed). */
  type RenderEvent = CustomEvent<RenderEventDetail>;

  interface LoadFontOptions {
    /**
     * stylesheet를 넣을 곳. Document면 그 `<head>`(기본: 현재 document),
     * ShadowRoot면 shadow root 안 — document stylesheet는 shadow tree를 스타일하지 않는다.
     * 바탕 CSS(`font-kku.css`)는 shadow root 안 바탕 요소가 처음 그려질 때 런타임이 그 root 맨 앞에 한 번 넣는다
     * (한 줄 설치가 붙인 주소 → 문서의 font-kku.css 링크 → `FontKkuConfig.fontBase`). iframe 문서에는 넣지 않는다.
     */
    root?: Document | ShadowRoot;
  }

  interface JamoTriple {
    choseong: string[];
    jungseong: string[];
    jongseong: string[];
  }

  /** display 쪽에만 나타난다: syllable depth에서 초성+중성 base를 합친 완성형 음절. */
  interface DisplayTriple extends JamoTriple {
    head?: string[];
    /** head를 만든 base 모음(`data-jamo-base`). head가 있을 때만 있다. */
    headBase?: string;
  }

  interface SourceJamo {
    choseong: string;
    jungseong: string;
    jongseong: string;
  }

  interface Topology {
    jungLayout: JungLayout;
    jongLayout: JongLayout;
    placementKey: PlacementKey;
    layoutBucket:
      | "right-open"
      | "right-closed"
      | "bottom-open"
      | "bottom-closed"
      | "split-open"
      | "split-closed";
  }

  interface BaseGlyph {
    type: "glyph";
    index: number;
    source: string;
    kind: GlyphKind;
    vowelDepth: VowelDepth;
    codaDepth: CodaDepth;
  }

  interface HangulGlyph extends BaseGlyph {
    kind: "hangul";
    sourceJamo: SourceJamo;
    jamo: JamoTriple;
    display: DisplayTriple;
    topology: Topology;
  }

  interface PlainGlyph extends BaseGlyph {
    kind: Exclude<GlyphKind, "hangul">;
  }

  type Glyph = HangulGlyph | PlainGlyph;

  interface WordSegment {
    type: "word";
    index: number;
    children: Glyph[];
  }

  interface SpaceSegment {
    type: "space";
    index: number;
    raw: string;
    count: number;
    kind: "space" | "tab" | "nbsp" | "mixed";
  }

  interface LineSegment {
    type: "line";
    index: number;
    children: Array<WordSegment | SpaceSegment>;
  }

  interface TextModel {
    lines: LineSegment[];
  }

  interface PlacementPlan {
    /** syllable depth에서만 채워진다. */
    readonly head: readonly string[];
    readonly choseong: readonly string[];
    readonly jungseong: readonly string[];
    readonly jongseong: readonly string[];
  }

  type PlacementTable = Readonly<Record<PlacementKey, PlacementPlan>>;
  type PlacementTables = Readonly<Record<JamoDepth, PlacementTable>>;

  interface JamoSeedOptions {
    /** 기본 `--fy-jamo-seed` */
    property?: string;
    salt?: unknown;
    /** key: `jamo|role|index|salt`, host에 해석된 seed가 있으면 `|<seed>`가 붙는다. */
    hash?: (key: string) => number;
  }

  /** 한 칸의 도형: 중심선 경로(획), 채운 외곽선, 타원. 좌표는 칸 0–100. */
  type JamoShape =
    | string
    | { d: string; fill?: boolean }
    | { ellipse: [number, number, number, number]; fill?: boolean };

  /** 칸 계약(`frame: "box"`) 세트의 한 칸: 그림 범위(획 중심선이 닿는 상자, 칸 좌표)와 도형. */
  interface JamoBoxCell {
    box: [number, number, number, number];
    shapes: readonly JamoShape[];
  }

  /**
   * 그림 자소 배치 세트: 칸 키 `r<행>-<호환 자모>`(예: `r0-ㄱ`, `r2-ㅇ`, `r3-ㄺ`) → 도형 하나나 목록.
   * 칸 계약 세트(`frame: "box"`, ADR-024): 키는 호환 자모(문맥 변형 `ㄱ@cho`·`ㄱ@bar`·`ㄱ@jong`)나 원소 그림
   * `@line`·`@dot`·`@ring` → 도형(목록) 또는 `{ box, shapes }`.
   */
  type JamoCells = Record<string, JamoShape | readonly JamoShape[] | JamoBoxCell>;

  interface JamoSetOptions {
    /** 획 굵기(칸 100 기준, 기본 7.2). 채운 도형만 쓰면 0. */
    stroke?: number;
    cap?: "butt" | "round" | "square";
    join?: "miter" | "round" | "bevel";
    /** 칸마다 도형을 spec/strokes.json 획순대로 그렸다 — 획 깊이에서 획마다 이름을 붙인다(ADR-018). */
    hoek?: boolean;
    /**
     * `"box"`면 칸 계약 세트(ADR-024): 기기 글꼴 재료(sebul·gothic과 파생)에 `jamo-set`으로 걸어 자모를 이 그림으로
     * 그린다. 그림이 없는 자모는 짝·가획 조상·천지인·원소 그림·원형 그림(ㅡ·ㆍ·ㅇ)·CSS 상자로 조립한다(일부만 그린 셈 치기는 디자인 소스의 `cells`).
     */
    frame?: "sprite" | "box";
    /** 칸 계약 세트의 기본 그림 범위(칸마다 `box`를 밝히지 않을 때). 기본 [0, 0, 100, 100]. */
    box?: [number, number, number, number];
  }

  /**
   * 바탕 요소가 고른 디자인을 쓰지 못한 까닭(ADR-025 §2, `data-fy-design-status`). 셋 다 지금 설정으로 그린다.
   * - `DESIGN_TOKEN_INVALID`: `--fy-design` 값이 이름 문법이 아니다(소문자·숫자·`-`, `legacy`·CSS 전역 키워드 아님)
   * - `DESIGN_NOT_REGISTERED`: 등록되지 않은 이름 — 등록되는 순간 다시 그린다
   * - `DESIGN_UNSUPPORTED_FONT`: 이 글꼴은 디자인을 받지 않는다 — 그림 자소 재료(`--fy-material: sprite`)이거나 표준 잉크 상자
   *   (`--fy-font-ink-boxes`)를 밝히지 않았거나 페이지가 `--fy-ink-boxes: none`으로 껐다. 등록해도 바뀌지 않는다
   */
  type DesignStatus = "DESIGN_TOKEN_INVALID" | "DESIGN_NOT_REGISTERED" | "DESIGN_UNSUPPORTED_FONT";

  /**
   * 디자인 검증 오류 코드(ADR-025 §2). `validateDesign`이 모으고 `registerDesign`이 첫 오류를 던진다 — 규칙은 한 벌이다.
   * 고정 배치(세벌식 `sebul-cases-v1`·직결식 `sebul-fixed-v1`) 거부는 `DESIGN_FIXED_*`(문맥 규칙·통짜 합자 모음·자리마다 변주).
   */
  type DesignErrorCode =
    | "DESIGN_NOT_OBJECT"
    | "DESIGN_VERSION_INVALID"
    | "DESIGN_MODE_INVALID"
    | "DESIGN_LAYOUT_MISSING"
    | "DESIGN_LAYOUT_UNKNOWN"
    | "DESIGN_LAYOUT_REVISION"
    | "DESIGN_FIXED_VARIATION"
    | "DESIGN_FIXED_CONTEXT"
    | "DESIGN_FIXED_COMPOUND"
    | "DESIGN_SOURCES_EMPTY"
    | "DESIGN_SOURCE_INVALID"
    | "DESIGN_SOURCE_KIND"
    | "DESIGN_SOURCE_UNKNOWN"
    | "DESIGN_METHOD_INVALID"
    | "DESIGN_ROLE_INVALID"
    | "DESIGN_RULE_INVALID"
    | "DESIGN_RULE_ID"
    | "DESIGN_RULE_MATCH"
    | "DESIGN_RULE_EMPTY"
    | "DESIGN_RULE_CONFLICT"
    | "DESIGN_APPLY_INVALID"
    | "DESIGN_RECIPE_INVALID"
    | "DESIGN_BINDING_INVALID"
    | "DESIGN_FALLBACK_INVALID";

  interface DesignError {
    code: DesignErrorCode;
    /** 디자인 JSON 안의 자리(`rules[0].match.hasFinal`·`sources.art.assetSet`, 맨 위는 빈 문자열) */
    path: string;
    /** 영어 설명 — 자리를 앞에 적는다. registerDesign이 던지는 오류 글은 `font-kku: design "<name>" ` + message */
    message: string;
  }

  interface DesignValidation {
    ok: boolean;
    /** registerDesign이 보는 차례 — `errors[0]`이 registerDesign이 던질 오류다 */
    errors: DesignError[];
    /** 받아들이지만 알리는 것 — 지금은 이전 배치 revision(`DESIGN_LAYOUT_REVISION_ACCEPTED`, 지금 도장으로 그린다) */
    warnings: DesignWarning[];
  }

  /** 디자인 진단 코드 — 받아들이지만 알린다(`validateDesign().warnings`, `registerDesign().warnings`, 등록 때 콘솔 경고) */
  type DesignWarningCode = "DESIGN_LAYOUT_REVISION_ACCEPTED";

  interface DesignWarning {
    code: DesignWarningCode;
    path: string;
    message: string;
  }

  /** registerDesign이 던지는 오류: 검증 오류(`DesignErrorCode`), 이름 문법 `DESIGN_NAME_INVALID`, 같은 이름 다른 내용 `DESIGN_NAME_TAKEN` */
  interface DesignRegistrationError extends TypeError {
    code: DesignErrorCode | "DESIGN_NAME_INVALID" | "DESIGN_NAME_TAKEN";
    path: string;
  }

  interface RegisterDesignOptions {
    /** 같은 이름에 다른 내용이 있으면 바꾼다(기본 false — 오류 `DESIGN_NAME_TAKEN`). 그 이름을 고른 바탕 요소가 다시 그린다 */
    replace?: boolean;
  }

  /** 디자인의 원소(primitive)·그림(svg, 등록한 칸 계약 세트)·글꼴 글자(font) 소스(ADR-025). 모드와 같은 종류만 둔다. */
  type DesignSource =
    | { kind: "primitive"; builtin?: string }
    | {
        kind: "svg";
        assetSet: string;
        revision?: string;
        /** 보이는 자모 칸(미리보기 — 원형 8·기본 24만 그린 셈 치기). 원소 그림(@…)은 늘 보인다. 없으면 모두 */
        cells?: string[];
      }
    | { kind: "font"; family: string; weight?: number; style?: string; stretch?: string; sourceMode?: string };

  /** 규칙·조각 binding의 적용값. method·recipe·bindings는 한 묶음(더 구체적인 쪽이 통째로 이긴다), source는 따로 고른다. */
  interface DesignApply {
    source?: string;
    method?: "auto" | "direct" | "compose";
    /** spec/jamo-recipes.json의 조립식 id. compose면 꼭 준다 */
    recipe?: string;
    /** 조립식 조각 id → 그 조각의 적용값 */
    bindings?: Record<string, DesignApply>;
    /** direct일 때 같은 자모를 찾아볼 대체 소스 */
    fallbackSources?: string[];
  }

  interface DesignRule {
    id: string;
    match: {
      /** 현대 호환 자모(51자) */
      jamo: string;
      role?: "initial" | "medial" | "final" | "standalone";
      /** right·bottom·split-right(설계 v1.0의 vertical·horizontal·mixed도 받는다). role과 함께만 */
      vowelLayout?: "right" | "bottom" | "split-right" | "vertical" | "horizontal" | "mixed";
      hasFinal?: boolean;
    };
    apply: DesignApply;
  }

  /** 작업실 잠금(설계 v1.2 §13.6): 자동 섞기 같은 일괄 바꾸기가 건드리지 않는 자모·역할·조각. role이 없으면 모든 역할, part가 없으면 자모 전체 */
  interface DesignLock {
    /** 현대 호환 자모 한 글자 */
    jamo: string;
    role?: "initial" | "medial" | "final" | "standalone";
    /** 조립식 조각 id(spec/jamo-recipes.json) */
    part?: string;
  }

  /** 디자인(ADR-025 §2): 팔레트·규칙·조립식 선택. `registerDesign`으로 등록하고 CSS `--fy-design`으로 고른다. */
  interface Design {
    version?: string;
    id?: string;
    title?: string;
    mode: "primitive" | "svg" | "font";
    sources: Record<string, DesignSource>;
    defaults: { source: string; method?: "auto" | "direct" };
    roleSources?: Partial<Record<"initial" | "medial" | "final" | "standalone", string>>;
    rules?: DesignRule[];
    fallback?: {
      sourceIds?: string[];
      /** auto의 마지막·direct 실패 때 원소로 그릴지(기본 true) */
      allowPrimitive?: boolean;
      /** 지정한 조합의 재료가 없을 때(기본 error) */
      onComposeFailure?: "error" | "direct" | "primitive";
      unverifiedFont?: "allow-with-warning" | "reject";
    };
    /** 작업실 정보(제작 안내 origin8·basic24·full40, 잠금) — 그리기에는 쓰지 않는다 */
    editor?: { authoringTarget?: "origin8" | "basic24" | "full40"; locks?: DesignLock[] };
    display?: { detail?: "jamo" | "parts" | "stroke"; seed?: string; variationScope?: "jamo" | "occurrence" };
  }

  interface JamoPlanOptions {
    /** 등록한 디자인 이름 */
    design?: string;
    /** 디자인 없을 때의 칸 계약 그림 세트 */
    set?: string;
    role?: "initial" | "medial" | "final" | "standalone";
    context?: "cho" | "bar" | "jong" | "";
    layout?: "right" | "bottom" | "split-right";
    hasFinal?: boolean;
    /** 디자인 없을 때 보이는 자모 칸(미리보기). 없으면 모두 */
    cells?: string[];
  }

  interface JamoPlanItem {
    /** 조립식 조각 경로(맨 위 자모면 빈 배열) */
    path: string[];
    source: string;
    method: "auto" | "direct" | "compose";
    recipe: string | null;
    /** 쓴 그림 칸 키. 원소로 긋는 획이면 null */
    drawing: string | null;
    /** 이 항목이 맡은 자모 획 번호(0부터) */
    strokes: number[];
    kind: string | null;
    /** 원소로 긋는 획을 그리는 그림 칸 키 — 원소 그림(@line·@dot·@ring)이 먼저, 그 종류가 없으면 보이는 원형 그림(ㅡ·ㆍ·ㅇ).
     * 그림 항목이거나 그릴 그림이 없으면(CSS 상자) null */
    alias: string | null;
  }

  interface JamoTraceEntry {
    path: string[];
    jamo: string;
    role: string | null;
    source: string;
    method: "auto" | "direct" | "compose";
    recipe: string | null;
    /** 이 요청에 걸린 규칙 id(조각 binding은 "binding") */
    rules: string[];
    result: "direct" | "composed" | "strokes" | "primitive" | "none";
    status: "ok" | "pending" | "degraded" | "error";
    diagnostic: string | null;
    effectiveSource?: string;
  }

  interface JamoPlan {
    jamo: string;
    design: string | null;
    items: JamoPlanItem[];
    trace: JamoTraceEntry[];
  }

  interface HostTrace {
    face: "element" | "device" | "svg" | null;
    design: string | null;
    designStatus: DesignStatus | null;
    nodes: { jamo: string | null; role: string | null; pos: string | null; requests: JamoTraceEntry[] }[];
  }

  interface AuthoringStageProgress {
    stage: "origin8" | "basic24" | "full40";
    /** 그 단계의 현대 자모 수(보조 원본 ㆍ 제외) */
    total: number;
    have: string[];
    missing: string[];
    /** 그 단계 목록 밖에 그린 자모(예: 원형 8 단계에서 이미 그린 ㄹ — 지우지 않는다) */
    extra: string[];
  }

  interface AuthoringProgress {
    stages: AuthoringStageProgress[];
    /** 보조 원본 ㆍ — 원소 그림 @dot은 직접 그린 것으로 세지 않는다 */
    helper: { jamo: string; drawn: boolean };
    /** 아직 남은 첫 단계(다 그렸으면 null) */
    next: "origin8" | "basic24" | "full40" | null;
  }

  /**
   * 범위가 바탕 요소에서 고른 원문(ADR-003) — 복사·잘라내기가 클립보드에 넣는 그 대응이다. 자모 노드에 범위가 닿으면 그 자모를
   * 고른 것이고, 자모 일부만 고른 음절은 음절 통째다.
   */
  interface SourceRange {
    /** 원문(`data-source`) 안 시작 위치. 원문 정규화가 글자 경계를 바꾸는 드문 원문이면 0 */
    start: number;
    /** 원문 안 끝 위치(끝 미포함). 위와 같은 드문 원문이면 원문 길이 */
    end: number;
    /** 고른 원문 — 음절은 NFC, 빈칸·줄바꿈(`\r\n`·`\r` 포함)은 원문 그대로 */
    text: string;
  }

  interface HangulFontProbeOptions {
    /** 확인할 CSS font-family 목록. 기본은 코어 CSS의 기본 글꼴 목록(Apple SD Gothic Neo,
     * Malgun Gothic, Noto Sans CJK KR, sans-serif) — 기기 대체 글꼴까지 따라간다. */
    fontFamily?: string;
    /** 캔버스를 만들 문서(기본 전역 document). 지정하면 결과를 캐시하지 않는다. */
    document?: Document;
  }

  interface API {
    readonly version: string;
    /** atomic 표. 기존 이름 호환용. */
    readonly placementTable: PlacementTable;
    readonly placementTables: PlacementTables;
    /**
     * 배치 프로파일 표(ADR-026·028, spec/layout-profiles.json에서 생성, 얼린 사본). 고정 배치는 `stamps`에 조합용 자모마다 역할 도장
     * `[left %, top %, 글자 크기 em, scale-x, scale-y, 역할, font-weight, text-stroke em, 밀도 굵기 계수 0.75–1]`(합자 모음은 조각 도장 둘)을
     * 둔다 — 세벌식은 짜임마다(`LayoutProfile.stamps`). 밀도 굵기 계수는 원소·그림 재료의 획 굵기에 곱한다(ADR-024 §3).
     */
    readonly layoutProfiles: Readonly<Record<string, LayoutProfile>>;
    /**
     * 고정 배치가 그려진 결과에서도 지켜지는가(설계 v1.2 L22) — 같은 역할·자모(세벌식은 같은 짜임까지) 노드의 계산된 자리·크기·변환이
     * 모두 같으면 stable true. 페이지 CSS가 문맥 선택자로 자모를 옮기면 false와 어긋난 열쇠(drifted — `"initial ᄀ"`, 세벌식
     * `"initial ᄀ v1"`). 고정 배치가 아니면 stable null.
     */
    layoutStability(host: HTMLElement): { layout: string | null; stable: boolean | null; keys: number; nodes: number; drifted: string[] };
    define(): void;
    bootstrap(root?: ParentNode): HTMLElement[];
    /**
     * host를 즉시 렌더한다. 끝나면 host에서 `font-kku:render`(reason `"render"`)가 발생한다.
     * 분리된(detached) host는 font 스타일을 해석할 수 없어, 연결될 때 같은 호출 옵션으로
     * 마저 해석한다.
     */
    render(target: HTMLElement, options?: RenderOptions): HTMLElement;
    /** `render`와 같은 동작. 이벤트 reason은 `"refresh"`. */
    refresh(target: HTMLElement, options?: RenderOptions): HTMLElement;
    /**
     * 현재 스타일로 폰트 메타데이터(depth, expression mode, material, font id)를 다시
     * 해석한다. 구조가 바뀐 host는 attribute를 다시 읽어 재렌더하고(해석된 seed는 유지),
     * font id/contract만 바뀐 host는 DOM을 다시 만들지 않고 `fontInfo()`만 갱신한다.
     * shadow root 안의 host도 포함한다(`root`가 범위를 좁힌다). stylesheet `load`
     * 이벤트는 자동 처리되고, adoptedStyleSheets·`<style>` 텍스트 교체 뒤에는 직접 호출한다.
     * @returns 해석 결과가 바뀐 host 목록
     */
    refreshAll(root?: ParentNode): HTMLElement[];
    /** 현재 URL의 자동 로딩 실패를 지우고 다시 시도한다. 진행 중 요청은 공유한다. */
    retryFont(host: HTMLElement): HTMLElement | null;
    /**
     * font stylesheet를 `<link>`로 삽입(같은 URL의 링크가 이미 로드돼 있으면 재사용)하고
     * load 뒤 `root`의 host를 다시 해석한다. 같은 URL·root의 호출은 대기 중이거나 성공한
     * 동안(링크가 연결돼 있는 동안) 같은 Promise를 돌려준다. 실패하면 삽입한 링크를 지우고
     * reject하며 다음 호출이 다시 시도한다. 서버 동작 없이 정적 파일만 쓴다.
     * @returns load가 끝났을 때 해석 결과가 바뀐 host 목록
     */
    loadFont(href: string, options?: LoadFontOptions): Promise<HTMLElement[]>;
    /** 직전 렌더 시점의 font 메타데이터. 렌더되지 않은 host면 null. */
    fontInfo(host: HTMLElement): FontInfo | null;
    /** 이 런타임이 아직 관리하지 않는 element를 렌더한다(clone·SSR 트리 포함). element가 아니면 null. */
    upgrade(target: unknown): HTMLElement | null;
    /** `root`의 자손 `font-kku, .font-kku`를 한 번에(스타일 읽기를 모아) 업그레이드하고 전부 돌려준다. */
    upgradeAll(root?: ParentNode): HTMLElement[];
    decomposeGlyph(char: string, index?: number, depth?: DepthInput): Glyph;
    createTextModel(text: string, depth?: DepthInput): TextModel;
    isHangulSyllable(char?: string | null): boolean;
    renderText(text: string): string[];
    hashSeed(value: unknown): number;
    /**
     * 각 `[data-jamo]` 노드에 `hash(jamo|role|index|salt[|host seed])`를 CSS 변수로 쓴다.
     * host에 해석된 seed(`data-fy-seed`)가 있으면 key에 들어가 host마다 값이 달라진다.
     * 재렌더가 지우므로 계속 유지하려면 `jamo-seeds` 옵션을 쓴다.
     * @returns 처리한 노드 수
     */
    applyJamoSeeds(
      target: HTMLElement | Document | DocumentFragment,
      options?: JamoSeedOptions,
    ): number;
    /**
     * 이 브라우저가 기기 글꼴로 한글(완성형 음절과 첫가끝 자모)을 그릴 수 있는지.
     * 기기 글꼴 재료 글꼴(sebul·gothic과 파생)은 기기의 한글 글꼴로 자소를 그리므로,
     * false인 기기에서는 그림 자소 글꼴(pixel·sprite-system …)을 쓴다. 캔버스 글자 상자만
     * 재고(픽셀을 읽지 않는다) 결과는 font-family별로 캐시한다. 스스로 실행되지 않는다.
     * @returns 판단할 수 없으면(DOM·캔버스 없음) null
     */
    hasHangulFont(options?: HangulFontProbeOptions): boolean | null;
    /**
     * 벡터 자소 세트를 등록한다(ADR-013). `jamo-set="<name>"`인 바탕 요소가 자소판 대신
     * 자모별 인라인 SVG로 그린다. 같은 이름을 다시 등록하면 바꾸고, 그 세트를 쓰는 바탕
     * 요소를 다시 그린다. 런타임보다 먼저 실린 모듈은 `globalThis.FontKkuJamo`에
     * `[name, cells, options]`를 push한다. 칸을 검증해 틀리면 칸 열쇠를 대며 `TypeError`를 던진다 — 경로는 브라우저가
     * `<path d>`로 읽는 문법이어야 한다(M/m으로 시작, 명령마다 인자 수: M·L·T 2, H·V 1, S·Q 4, C 6, A 7 — 호 깃발은 0/1, Z 0).
     */
    registerJamo(name: string, cells: JamoCells, options?: JamoSetOptions): { name: string; cells: number };
    /** 등록된 벡터 자소 세트 이름 */
    jamoSets(): string[];
    /**
     * 디자인을 등록한다(ADR-025 §2). CSS `--fy-design: <name>`(글꼴은 `--fy-font-design`)을 고른 바탕 요소가 그
     * 디자인의 소스·규칙·조립식으로 그린다. 등록본은 검증한 뒤 고정한다 — 검증에 걸리면 첫 오류를 던진다
     * (`DesignRegistrationError`, `validateDesign(design).errors[0]`과 같은 code·path). 같은 이름·같은 내용은 그대로 통과하고,
     * 같은 이름·다른 내용은 `{ replace: true }`일 때만 바꾼다(아니면 `DESIGN_NAME_TAKEN`). 등록·교체하면 그 이름을 고른
     * 바탕 요소가 다시 그린다.
     */
    registerDesign(name: string, design: Design, options?: RegisterDesignOptions): { name: string; revision: string; warnings?: DesignWarning[] };
    /**
     * 디자인 JSON을 registerDesign과 같은 규칙으로 검사해 오류를 모두 돌려준다(던지지 않고 등록하지 않는다, ADR-025 §2).
     * 이름 문법·같은 이름 충돌은 등록의 일이라 보지 않는다. 디자인은 JSON 데이터라, 자기를 가리키는 고리나 BigInt가 있으면
     * 그 자리를 path로 `DESIGN_NOT_OBJECT` 하나만 돌려준다.
     */
    validateDesign(design: unknown): DesignValidation;
    /**
     * 디자인 등록을 지운다. 그 이름을 고른 바탕 요소는 다시 그려 `DESIGN_NOT_REGISTERED`가 되고, 같은 이름을 다시 등록하면
     * 다시 그린다. 지운 것이 있으면 true. 이름 문법이 틀리면 `DESIGN_NAME_INVALID`를 던진다.
     */
    unregisterDesign(name: string): boolean;
    /** 등록된 디자인 이름(등록한 차례). 부를 때마다 새 배열이고, `unregisterDesign`으로 지운 이름은 빠진다(ADR-025 §2) */
    designs(): string[];
    /** 자모 하나의 조립 계획과 출처 기록(ADR-025, 실험). 화면에 그리지 않는다. */
    planJamo(jamo: string, options?: JamoPlanOptions): JamoPlan;
    /** 그린 바탕 요소의 자모 노드마다 조립 기록(ADR-025, 실험). 원소·그림 재료만 기록이 있다. 그리지 않은 요소는 null */
    traceOf(host: Element): HostTrace | null;
    /**
     * 그림 세트를 덜 그린 셈 치는 미리보기 디자인 JSON(ADR-025 §7, 등록하지 않는다). `registerDesign(name, stagePreview(set, "origin8"))`.
     * 보이는 칸(`cells`)만 줄이고 규칙은 없다 — 그림이 없는 ㅎ은 기본 조립식 ㆍ + ㅡ + ㅇ, ㄹ·ㅂ·ㅍ은 ㅡ·ㅣ 선으로 만들어 그 단계까지 그린 실제 세트와 같다.
     */
    stagePreview(set: string, stage: "full40" | "basic24" | "origin8" | "elements"): Design;
    /** 그림 세트가 원형 8 → 기본 24 → 확장 40 단계마다 그린 자모·남은 자모·단계 밖에 그린 자모(ADR-025 §7) */
    authoringProgress(target: string | string[]): AuthoringProgress;
    /**
     * 범위(`Range`·`StaticRange`)가 바탕 요소에서 고른 원문(ADR-003). 복사·잘라내기는 런타임이 문서마다 알아서 이 대응으로
     * 원문을 넣는다 — 이 함수는 "고른 글 복사" 단추처럼 페이지가 직접 원문을 꺼낼 때 쓴다. 고른 것이 없거나 그린 적 없는 요소면 null.
     */
    sourceRange(host: Element, range: AbstractRange): SourceRange | null;
  }
}

declare const FontKku: FontKku.API;

declare global {
  var FontKkuConfig: FontKku.Config | undefined;
  /** 런타임보다 먼저 실린 벡터 자소 모듈의 등록 대기열 */
  var FontKkuJamo: { push(...entries: [string, FontKku.JamoCells, FontKku.JamoSetOptions?][]): number } | undefined;

  interface Window {
    FontKku: FontKku.API;
    FontKkuConfig?: FontKku.Config;
  }

  interface HTMLElementTagNameMap {
    "font-kku": HTMLElement;
  }

  interface HTMLElementEventMap {
    "font-kku:render": FontKku.RenderEvent;
    "font-kku:loaderror": FontKku.LoadErrorEvent;
  }
}

export = FontKku;
export as namespace FontKku;
