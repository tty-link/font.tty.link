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
     * 번들러·ESM에서 쓸 때만 준다(예: "https://cdn.jsdelivr.net/npm/font-kku@0.4.0/").
     */
    fontBase?: string;
    /** false면 아직 받지 않은 글꼴·자소 세트를 스스로 받지 않는다(기본 true). */
    autoload?: boolean;
  }

  interface FontInfo {
    /** 요청(정규화)된 font 이름 */
    font: string;
    /** font CSS가 선언한 `--fy-font-id`. CSS가 아직 없으면 null */
    id: string | null;
    /** font CSS가 선언한 `--fy-contract` */
    contract: number | null;
    material: "system" | "sprite" | "bundled" | string;
    /** 요청한 font의 CSS가 host에 도달했는지 (`id === font`) */
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

  /** 칸 키 `r<행>-<호환 자모>`(예: `r0-ㄱ`, `r2-ㅇ`, `r3-ㄺ`) → 도형 하나나 목록. */
  type JamoCells = Record<string, JamoShape | readonly JamoShape[]>;

  interface JamoSetOptions {
    /** 획 굵기(칸 100 기준, 기본 7.2). 채운 도형만 쓰면 0. */
    stroke?: number;
    cap?: "butt" | "round" | "square";
    join?: "miter" | "round" | "bevel";
    /** 칸마다 도형을 spec/strokes.json 획순대로 그렸다 — 획 깊이에서 획마다 이름을 붙인다(ADR-018). */
    hoek?: boolean;
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
     * `[name, cells, options]`를 push한다.
     */
    registerJamo(name: string, cells: JamoCells, options?: JamoSetOptions): { name: string; cells: number };
    /** 등록된 벡터 자소 세트 이름 */
    jamoSets(): string[];
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
