/* Types for font-kku-export.js (ADR-015): 폰꾸가 조립한 한글을 글꼴 파일로 내보낸다. */
declare namespace FontKkuExport {
  /** 픽셀 좌표(y 아래) 또는 칸 단위(0–100) 점 */
  type Point = [number, number];
  type Contour = Point[];

  interface ExportOptions {
    /** 그림 자소 배치 글꼴 id(sprite-system, pixel, …). 그 글꼴 CSS가 문서에 실려 있어야 한다 —
     * 런타임이 필요할 때 받는 중이면 도착을 기다린다. 원소 획(sebul·gothic)·기기 글꼴·8칸 그림 세트는
     * `EXPORT_UNSUPPORTED_FACE`로 거절한다. */
    font: string;
    /** 벡터 자소 세트 이름(jamo-set). 주면 자모별 SVG 칸을 그린다. 등록되지 않았으면 `EXPORT_JAMO_SET_NOT_LOADED`. */
    jamoSet?: string;
    /** 이 글자만 내보낸다(NFC로 맞춘 뒤 한글 음절·호환 자모만 — 나머지는 report.skipped). 주지 않으면
     * (undefined·null) 한글 음절 11,172자와 호환 자모 51자. 빈 문자열처럼 한글이 없으면 `EXPORT_NO_HANGUL`. */
    text?: string | null;
    familyName?: string;
    /** ASCII PostScript 이름(기본 FontKku-<font>[-<jamoSet>]) — 여러 글꼴을 함께 설치해도 겹치지 않게 */
    postscriptName?: string;
    styleName?: string;
    version?: string;
    copyright?: string;
    weightClass?: number;
    /** 칸 래스터 크기(px, 기본 256). 클수록 외곽선이 정밀하고 느리다. */
    cellSize?: number;
    /** 벡터 자소 획 굵기(칸 단위). 기본은 세트 굵기. */
    stroke?: number;
    /** 자소판 주소를 바꿔 쓴다(작업실에서 고친 자소판의 blob 주소 등). */
    sheet?: string;
    /** 버릴 작은 조각의 넓이(칸 단위², 기본 0.6). 질감 자소판은 키운다. */
    minArea?: number;
    /** 외곽선 단순화 허용 오차(글자 단위 1/1000 em, 기본 4). */
    tolerance?: number;
    /** 측정용 바탕 요소를 붙일 곳(작업실 미리보기의 shadow root 등). */
    root?: Node;
    document?: Document;
    date?: Date;
    onProgress?(fraction: number, stage: "layout" | "outline" | "done"): void;
  }

  interface ExportReport {
    /** 글꼴에 든(그려진) 글자 수 — 공백 셋은 세지 않는다. 0이면 exportFont가 `EXPORT_NO_GLYPHS`로 거절한다. */
    glyphs: number;
    cells: number;
    clipped: number;
    /** 칸이 없거나 칸 그림이 비어 내보내지 못한 글자(글꼴에 매핑하지 않아 다른 글꼴로 대체된다) */
    missing: string[];
    /** text에서 한글 음절·호환 자모가 아니라 넣지 않은 글자(영문·숫자·기호, 공백 제외) */
    skipped: string[];
  }

  /** exportFont가 내보낼 글자가 하나도 없을 때 던지는 오류의 code. 빈 TTF를 성공으로 돌려주지 않는다. */
  type ExportErrorCode =
    /** text에 한글 음절(U+AC00–D7A3)·호환 자모가 없다(빈 문자열 포함, NFC로 맞춘 뒤) */
    | "EXPORT_NO_HANGUL"
    /** 그 글꼴 CSS가 문서(root)에 없다 — 필요할 때 받기가 실패했거나 꺼졌거나, 글꼴 id 오타 */
    | "EXPORT_FONT_NOT_LOADED"
    /** jamoSet이 등록되지 않았다(profiles/<set>.jamo.js·FontKku.registerJamo) */
    | "EXPORT_JAMO_SET_NOT_LOADED"
    /** 재료가 그림 자소·벡터 자소가 아니다 — error.face: "element"(원소 획) · "svg"(8칸 그림 세트) · "device" · "system" */
    | "EXPORT_UNSUPPORTED_FACE"
    /** 쓰는 칸 그림에 잉크가 없다(빈 자소판, 읽지 못한 자소판) */
    | "EXPORT_NO_GLYPHS";

  interface ExportError extends Error {
    name: "FontKkuExportError";
    code: ExportErrorCode;
    font: string;
    jamoSet: string | null;
    /** EXPORT_UNSUPPORTED_FACE: 그 글꼴이 그리는 재료 */
    face?: string | null;
    /** EXPORT_NO_HANGUL: 넣지 않은 글자 */
    skipped?: string[];
    /** EXPORT_NO_GLYPHS: 그리지 못한 글자 */
    missing?: string[];
  }

  interface ExportResult {
    ttf: Uint8Array;
    /** CompressionStream이 없으면 null */
    woff: Uint8Array | null;
    report: ExportReport;
  }

  interface Component {
    cell: string;
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  }

  interface FontSpec {
    familyName?: string;
    postscriptName?: string;
    styleName?: string;
    version?: string;
    copyright?: string;
    weightClass?: number;
    date?: Date;
    /** codepoint → advance(글자 단위). 기본 공백 500, 전각 공백 1000 */
    spaces?: Record<number, number>;
    cells: { name: string; contours: Contour[] }[];
    glyphs: { codepoint: number; components: Component[] }[];
  }

  interface API {
    /** 그릴 글자가 하나도 없으면 {@link ExportError}(code)로 거절한다. */
    exportFont(options: ExportOptions): Promise<ExportResult>;
    download(bytes: Uint8Array, filename: string, document?: Document): void;
    traceAlpha(alpha: ArrayLike<number>, width: number, height: number, options?: { threshold?: number }): Contour[];
    simplify(points: Contour, epsilon: number): Contour;
    clipToRect(points: Contour, rect: [number, number, number, number]): Contour;
    outlineFromAlpha(alpha: ArrayLike<number>, size: number, options?: { threshold?: number; minArea?: number; tolerance?: number }): Contour[];
    buildTrueType(spec: FontSpec): Uint8Array;
    toWoff(ttf: Uint8Array): Promise<Uint8Array | null>;
    /** 칸 위 = y 880, 아래 = y −120 (글자 단위) */
    readonly CELL_TOP: number;
  }
}

declare const FontKkuExport: FontKkuExport.API;

declare global {
  interface Window {
    FontKkuExport: FontKkuExport.API;
  }
}

export = FontKkuExport;
export as namespace FontKkuExport;
