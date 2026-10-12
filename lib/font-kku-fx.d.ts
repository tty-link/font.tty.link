/* Types for font-kku-fx.js — 폰꾸 상호작용 확장(ADR-017). 폰꾸 런타임(font-kku.js) 뒤에
 * 붙인다. typingFrames·transitionFrames는 DOM 없이 돌고, 나머지는 브라우저용이다. */
declare namespace FontKkuFx {
  /** 바탕 요소 하나 또는 여럿(`<font-kku>`나 `.font-kku`). */
  /** 바탕 요소 — FontKku.render/refresh와 같은 HTMLElement(<font-kku> 또는 class="font-kku" 요소) */
  type HostTarget = HTMLElement | ArrayLike<HTMLElement>;

  interface Controller {
    readonly hosts: HTMLElement[];
    /** 타이머·이벤트를 떼고 자모 노드에 준 인라인 움직임을 지운다 */
    stop(): void;
  }

  interface Transition {
    /** 그대로 남기는 앞부분 글자 수 */
    keep: number;
    /** 자모 단위로 거꾸로 지우는 화면들. 마지막은 `from.slice(0, keep)` */
    erase: string[];
    /** 이어서 치는 화면들. 마지막은 `to` */
    write: string[];
  }

  interface TypeOptions {
    /** 처음 보일 문장 번호 또는 `"random"`. 기본 0 */
    start?: number | "random";
    /** 다음 문장 고르는 차례: 순서대로(기본) 또는 섞기(같은 문장이 잇따라 나오지 않는다) */
    order?: "sequence" | "shuffle";
    /** 문장을 다 돌면 처음부터. 문장이 둘 이상이면 기본 true */
    loop?: boolean;
    /** 빈 화면에서 첫 문장을 쳐 넣는다. 문장이 하나면 기본 true */
    intro?: boolean;
    /** intro를 시작하기 전 기다림(ms) */
    delay?: number;
    /** 첫 문장을 지우기 시작할 때까지(ms). 기본 2400 */
    firstHold?: number;
    /** 문장을 다 친 뒤 지우기 시작할 때까지(ms). 기본 2200 */
    hold?: number;
    /** 다 지운 뒤 치기 시작할 때까지(ms). 기본 380 */
    gap?: number;
    /** 지우는 한 걸음(ms) 또는 화면별 함수. 기본 26 */
    eraseDelay?: number | ((frame: string) => number);
    /** 치는 한 걸음(ms)을 화면별로. 기본은 사람 손 박자(공백·쉼표·줄바꿈에서 쉰다) */
    typeDelay?: (frame: string) => number;
    /** 지금 치는 줄의 바탕 요소에 붙이는 클래스(커서 모양은 페이지 CSS) */
    caret?: string;
    /** 첫 문장을 지우기 이만큼(ms) 전에 커서를 보인다 */
    caretLead?: number;
    /** 타자를 시작할 때 animate를 어떻게 하나. 기본(생략)은 한 번 도는 움직임(rise·fade·stagger·assemble·drop)만 끈다 —
     * 글을 바꿀 때마다 다시 날아오므로. true면 모두 두고, false면 계속 도는 움직임까지 끈다 */
    keepAnimate?: boolean;
    /** 화면 밖이면 쉬기 위해 지켜볼 요소. 기본 첫 바탕 요소 */
    observe?: Element;
    /** true를 돌려주는 동안 다음 걸음을 미룬다(data-kku-paused·숨은 탭·화면 밖과 함께) */
    paused?: () => boolean;
    /** 새 문장을 고를 때마다 — 제목 요소의 aria-label처럼 페이지가 맡은 이름을 바꾸기 좋은 자리 */
    onPhrase?: (index: number, phrase: string) => void;
  }

  interface TypeController extends Controller {
    /** 지금(또는 쓰고 있는) 문장 번호 */
    readonly index: number;
  }

  interface ScatterOptions {
    /** `"auto"`(기본: 마우스면 올리기, 터치면 누르기) · `"hover"` · `"click"`. Enter·Space는 늘 된다 */
    on?: "auto" | "hover" | "click";
    /** 흩어지는 거리 배수. 기본 1 */
    distance?: number;
    /** 옮기는 시간(ms). 기본 650 */
    duration?: number;
  }

  interface ScatterController extends Controller {
    readonly open: boolean;
    set(open: boolean): void;
    toggle(): boolean;
  }

  interface MagnetOptions {
    /** 커서를 받는 영역. 기본 바탕 요소 */
    area?: Element;
    /** 미는 거리(글자 크기 배수). 기본 1.3 */
    reach?: number;
    /** 미는 힘(글자 크기 배수). 기본 0.55 */
    strength?: number;
  }

  type MagnetController = Controller;

  interface ShuffleOptions {
    /** 섞는 계기. 기본 `"click"`(Enter·Space 포함). null이면 reseed()로만 */
    on?: "click" | "hover" | null;
    /** 이만큼(ms)마다 섞는다. 0(기본)이면 끈다 */
    every?: number;
    /** 새 씨앗을 만드는 함수. 기본 `kku-<무작위>` */
    seed?: () => string;
    /** jamo-seeds가 없으면 켠다. 기본 true */
    jamoSeeds?: boolean;
    onSeed?: (seed: string | null) => void;
  }

  interface ShuffleController extends Controller {
    readonly seed: string | null;
    /** 씨앗을 주면 그것으로, 없으면 새로 뽑아 모든 바탕 요소에 준다 */
    reseed(seed?: string): string;
    /** 처음 씨앗으로 되돌린다(처음에 없었으면 seed 속성을 지운다) */
    reset(): string | null;
  }

  interface API {
    /** 빈 화면에서 text를 두벌식으로 치는 동안의 화면들 */
    typingFrames(text: string): string[];
    /** from에서 to로 자모 단위로 지웠다 다시 치는 화면들 */
    transitionFrames(from: string, to: string): Transition;
    /** 문장들을 자모 단위로 지웠다 다시 친다. 바탕 요소가 여럿이면 문장의 "\n"이 줄을 나눈다 */
    type(target: HostTarget, phrases: string | string[], options?: TypeOptions): TypeController;
    scatter(target: HostTarget, options?: ScatterOptions): ScatterController;
    magnet(target: HostTarget, options?: MagnetOptions): MagnetController;
    shuffle(target: HostTarget, options?: ShuffleOptions): ShuffleController;
    /** 다시 그려 한 번 도는 움직임(assemble·drop …)을 처음부터 */
    replay(target: HostTarget): HTMLElement[];
    /** root(기본 document) 안의 `data-kku-fx` 바탕 요소에 효과를 단다 */
    bind(root?: ParentNode | Element): Element[];
    /** root(기본 전부) 안의 효과를 멈추고 뗀다 */
    unbind(root?: ParentNode | Element): Element[];
  }
}

declare const FontKkuFx: FontKkuFx.API;

declare global {
  interface Window {
    FontKkuFx: FontKkuFx.API;
    FontKkuFxConfig?: { autoBind?: boolean };
  }
}

export = FontKkuFx;
