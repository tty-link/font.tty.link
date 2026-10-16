export as namespace FontKkuStudio;

/** The existing font-kku-font-project v2 document, including optional editor extensions. */
export interface FontProject {
  format: "font-kku-font-project";
  version: 2;
  font: { css: string; id?: string; baseUrl?: string };
  preview?: { text?: string };
  [key: string]: unknown;
}

export interface MountOptions {
  /** URL of the package's studio/index.html. Inferred for classic scripts and ESM. */
  studioUrl?: string | URL;
  font?: string;
  /** Resolved against the host page, so local CSS assets keep their original base URL. */
  src?: string | URL;
  text?: string;
  project?: FontProject;
  /** localStorage draft key. Use a distinct key for each independently saved editor.
   * The default is the legacy "font-kku-font-studio-v2"; preserved drafts append ":pending". */
  draftKey?: string;
  /** Startup and each request timeout, in milliseconds. Default: 30000. */
  timeoutMs?: number;
}

export interface StudioHandle {
  readonly iframe: HTMLIFrameElement;
  readonly ready: Promise<StudioHandle>;
  exportProject(): Promise<FontProject>;
  loadProject(project: FontProject): Promise<boolean>;
  getCss(): Promise<string>;
  setText(text: string): Promise<boolean>;
  /** Show word, glyph, glyph-body, and space outlines in the editor previews. */
  setBoundaries(enabled: boolean): Promise<boolean>;
  /** Idempotently release listeners and requests and remove the editor document. */
  destroy(): void;
}

export function mount(container: Element, options?: MountOptions): StudioHandle;
