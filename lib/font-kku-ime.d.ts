/* Types for font-kku-ime.js — 영문 자판으로 한글을 조합하는 입력기(ADR-012).
 * 폰꾸 런타임과 독립인 선택 모듈이다. 조합기는 DOM 없이 돌고, attach()만 브라우저용이다.
 * attach()는 초점이 있는 칸에 execCommand("insertText")로 써서 Cmd/Ctrl+Z로 되돌릴 수 있다. */
declare namespace FontKkuIme {
  /** 두벌식 표준(KS X 5002), 세벌식 390, 세벌식 최종(3-91). */
  type LayoutId = "dubeol" | "sebeol-390" | "sebeol-final";
  /** 배열 id 또는 별칭(`"2"`, `"390"`, `"3-91"`, `"final"` …). 대소문자·앞뒤 공백 무시. */
  type LayoutInput = LayoutId | "2" | "390" | "3-90" | "3-91" | "3final" | "final" | (string & {});
  /** 키가 내는 자모의 자리. 기호·그대로 넘기는 키는 null. */
  type Role = "cho" | "jung" | "jong";
  type Mode = "hangul" | "latin";
  type ChangeReason = "input" | "select" | "commit" | "mode" | "layout" | "focus" | "blur";

  interface LayoutInfo {
    readonly id: LayoutId;
    readonly kind: "dubeol" | "sebeol";
    readonly name: string;
    readonly nameEn: string;
  }

  interface KeyValue {
    /** QWERTY 글자 */
    key: string;
    /** 이 배열에서 내는 값 — 첫가끝 자모(U+1100~) 또는 기호, 표에 없으면 key 그대로 */
    value: string;
    role: Role | null;
    /** 화면에 보일 글자 — 자모면 호환 자모(U+3131~), 아니면 value */
    compat: string;
  }

  interface KeyCap {
    /** KeyboardEvent.code (`KeyQ`, `Digit1`, `Semicolon` …) */
    code: string;
    key: string;
    shiftKey: string;
    plain: KeyValue;
    shift: KeyValue;
  }

  interface ComposeResult {
    /** 확정된 글 */
    commit: string;
    /** 아직 조합 중인 음절(없으면 "") */
    composing: string;
  }

  interface BackspaceResult {
    /** 조합 중인 음절이 있어 자모 하나를 지웠는지. false면 호출한 쪽이 앞 글자를 지운다 */
    handled: boolean;
    composing: string;
  }

  interface Composer {
    readonly layout: LayoutId;
    key(ch: string): ComposeResult;
    backspace(): BackspaceResult;
    /** 조합 중인 음절을 확정해 돌려주고 비운다 */
    flush(): string;
    peek(): string;
    reset(): void;
  }

  interface FieldState {
    value: string;
    selectionStart: number | null;
    selectionEnd: number | null;
    /** 필드 값 안의 조합 구간 */
    composing: { start: number; end: number; text: string } | null;
    mode: Mode;
    layout: LayoutId;
  }

  interface AttachOptions {
    layout?: LayoutInput | null;
    mode?: Mode;
    onChange?: (state: FieldState, reason: ChangeReason) => void;
  }

  interface Controller {
    readonly field: HTMLInputElement | HTMLTextAreaElement;
    getMode(): Mode;
    setMode(mode: Mode): void;
    toggleMode(): Mode;
    getLayout(): LayoutId;
    setLayout(layout: LayoutInput): LayoutId;
    /** 화면 키보드: QWERTY 글자 하나, `" "`, `"\n"`을 누른 것처럼 넣는다 */
    feed(key: string): void;
    /** 조합 중이면 자모 하나, 아니면 캐럿 앞 글자(또는 선택 영역)를 지운다 */
    backspace(): void;
    /** 조합 중인 음절을 확정한다(글은 이미 필드에 있다) */
    commit(): void;
    state(): FieldState;
    detach(): void;
  }

  interface API {
    readonly layouts: readonly LayoutInfo[];
    readonly defaultLayout: "dubeol";
    /** 별칭을 배열 id로. 모르는 이름은 RangeError */
    normalizeLayout(layout?: LayoutInput | null): LayoutId;
    createComposer(layout?: LayoutInput | null): Composer;
    /** 키 문자열을 한글로. `"\b"`는 Backspace. `convert("dkssudgktpdy") === "안녕하세요"` */
    convert(keys: string, layout?: LayoutInput | null): string;
    lookup(layout: LayoutInput | null | undefined, key: string): KeyValue | null;
    /** 화면 자판 행(숫자 줄부터 4행) */
    keyMap(layout?: LayoutInput | null): KeyCap[][];
    /** KeyboardEvent → QWERTY 글자(물리 키 기준). 배열과 무관한 키면 null */
    keyFromEvent(event: Pick<KeyboardEvent, "code" | "key" | "shiftKey">): string | null;
    /** 입력기를 붙인다. 선택이 없는 칸(`type="email"`·`number`·`date` …, selectionStart가 null)은 TypeError로
     * 거절한다 — text·search·url·tel·password `<input>`이나 `<textarea>`에 붙인다. 붙인 뒤 type이 그런 값으로
     * 바뀌면 키를 가로채지 않고 브라우저에 넘긴다(경고 한 번).
     *
     * 초점이 있는 칸에는 `document.execCommand("insertText" | "delete")`로 써서 브라우저 되돌리기 기록에 남는다 —
     * Cmd/Ctrl+Z·Shift+Z가 듣는다(Chromium·Firefox는 키 하나씩, WebKit은 이어 친 글을 한 번에). 초점이 없는 칸(화면
     * 키보드)이나 명령이 듣지 않으면 `setRangeText`로 쓰고, 그때는 브라우저가 되돌리기 기록을 비운다. 어느 쪽이든
     * 키 하나에 `input` 이벤트는 한 번이다(`event.fontKkuIme === true`). 표시는 창(window) 캡처 단계에서 달아 attach 전에 단
     * 듣개와 조상 캡처 듣개도 본다(페이지가 창에 먼저 단 캡처 듣개만 앞선다). */
    attach(field: HTMLInputElement | HTMLTextAreaElement, options?: AttachOptions): Controller;
  }
}

declare const FontKkuIme: FontKkuIme.API;

declare global {
  interface Window {
    FontKkuIme: FontKkuIme.API;
  }
}

export = FontKkuIme;
export as namespace FontKkuIme;
