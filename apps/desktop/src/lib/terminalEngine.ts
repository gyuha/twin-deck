// 터미널 화면 엔진. xterm.js로 그리고, 테스트에서는 이 모듈을 가짜로 바꾼다.
import { installImeBridge } from "./imeBridge";

export interface TerminalEngine {
  /** 화면을 `el` 안에 그리고 `el` 크기에 맞춘다. */
  open(el: HTMLElement): void;
  /** pty가 낸 바이트(또는 글)를 화면에 쓴다. */
  write(data: Uint8Array | string): void;
  /** 사용자의 입력(키 입력을 글로 바꾼 것). */
  onData(cb: (data: string) => void): void;
  /** 화면의 칸 수가 바뀌었다(처음 맞출 때 포함). */
  onResize(cb: (size: { cols: number; rows: number }) => void): void;
  readonly cols: number;
  readonly rows: number;
  /** 글꼴을 바꾸고 칸 수를 다시 맞춘다. */
  setFontFamily(font: string): void;
  focus(): void;
  dispose(): void;
}

/** 설정 `behavior.preview_font`가 비었을 때 쓰는 글꼴(미리보기 본문의 `font-mono`와 같은 계열). */
export const DEFAULT_TERMINAL_FONT = "ui-monospace, Menlo, Consolas, monospace";

/** xterm.js를 처음 쓸 때 불러 엔진을 만든다. `fontFamily`는 미리보기 글꼴 설정이고 비면 기본 글꼴이다. 패널 크기가 바뀌면 칸 수를 다시 맞춘다. */
export async function createTerminalEngine(fontFamily = ""): Promise<TerminalEngine> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/xterm/css/xterm.css")]);
  const term = new Terminal({ fontSize: 13, fontFamily: fontFamily.trim() || DEFAULT_TERMINAL_FONT, cursorBlink: true });
  const fit = new FitAddon();
  term.loadAddon(fit);
  let observer: ResizeObserver | null = null;
  let removeIme: (() => void) | null = null;
  let sendData: (data: string) => void = () => {};
  return {
    open(el) {
      // 한글 조합은 xterm이 아니라 직접 받는다(WebKit에서 모음이 빠지는 문제). 확정된 글은 일반 입력과 같은 길로 보낸다.
      removeIme = installImeBridge(el, (text) => sendData(text));
      term.open(el);
      fit.fit();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => fit.fit());
        observer.observe(el);
      }
    },
    write: (data) => term.write(data),
    onData: (cb) => {
      sendData = cb;
      term.onData(cb);
    },
    onResize: (cb) => void term.onResize(cb),
    get cols() {
      return term.cols;
    },
    get rows() {
      return term.rows;
    },
    setFontFamily(font) {
      term.options.fontFamily = font.trim() || DEFAULT_TERMINAL_FONT;
      fit.fit();
      if (term.rows > 0) term.refresh(0, term.rows - 1); // 새 글꼴로 이미 그린 줄을 다시 그린다
    },
    focus: () => term.focus(),
    dispose: () => {
      observer?.disconnect();
      removeIme?.();
      fit.dispose();
      term.dispose();
    },
  };
}
