// 터미널 화면 엔진. xterm.js로 그리고, 테스트에서는 이 모듈을 가짜로 바꾼다.

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
  focus(): void;
  dispose(): void;
}

/** xterm.js를 처음 쓸 때 불러 엔진을 만든다. 패널 크기가 바뀌면 칸 수를 다시 맞춘다. */
export async function createTerminalEngine(): Promise<TerminalEngine> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/xterm/css/xterm.css")]);
  const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, Menlo, Consolas, monospace", cursorBlink: true });
  const fit = new FitAddon();
  term.loadAddon(fit);
  let observer: ResizeObserver | null = null;
  return {
    open(el) {
      term.open(el);
      fit.fit();
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => fit.fit());
        observer.observe(el);
      }
    },
    write: (data) => term.write(data),
    onData: (cb) => void term.onData(cb),
    onResize: (cb) => void term.onResize(cb),
    get cols() {
      return term.cols;
    },
    get rows() {
      return term.rows;
    },
    focus: () => term.focus(),
    dispose: () => {
      observer?.disconnect();
      fit.dispose();
      term.dispose();
    },
  };
}
