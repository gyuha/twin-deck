// 터미널 화면 엔진. Ghostty의 VT 엔진(ghostty-web, WASM)으로 그리고, 테스트에서는 이 모듈을 가짜로 바꾼다.

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

/** ghostty-web을 처음 쓸 때 불러 초기화하고(wasm은 JS 안에 내장돼 있다) 엔진을 만든다. */
export async function createTerminalEngine(): Promise<TerminalEngine> {
  const { init, Terminal, FitAddon } = await import("ghostty-web");
  await init();
  const term = new Terminal({ fontSize: 13, fontFamily: "ui-monospace, Menlo, Consolas, monospace", cursorBlink: true });
  const fit = new FitAddon();
  term.loadAddon(fit);
  return {
    open(el) {
      term.open(el);
      fit.fit();
      fit.observeResize();
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
      fit.dispose();
      term.dispose();
    },
  };
}
