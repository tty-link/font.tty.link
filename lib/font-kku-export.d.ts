/* Types for font-kku-export.js (ADR-015): 폰꾸가 조립한 한글을 글꼴 파일로 내보낸다. */
declare namespace FontKkuExport {
  /** 픽셀 좌표(y 아래) 또는 칸 단위(0–100) 점 */
  type Point = [number, number];
  type Contour = Point[];

  interface ExportOptions {
    /** 그림 자소 배치 글꼴 id(sprite-system, pixel, …). 그 글꼴 CSS가 문서에 실려 있어야 한다. */
    font: string;
    /** 벡터 자소 세트 이름(jamo-set). 주면 자모별 SVG 칸을 그린다. */
    jamoSet?: string;
    /** 이 글자만 내보낸다. 기본은 한글 음절 11,172자와 호환 자모 51자. */
    text?: string;
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
    glyphs: number;
    cells: number;
    clipped: number;
    /** 칸이 없어 내보내지 못한 글자 */
    missing: string[];
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
