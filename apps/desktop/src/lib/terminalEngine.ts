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

/** 설정 `behavior.terminal_font`가 비었거나 지정한 글꼴이 없을 때 쓰는 고정폭 글꼴. */
export const DEFAULT_TERMINAL_FONT = "ui-monospace, Menlo, Consolas, monospace";

/** 사용자 글꼴을 못 찾더라도 비고정폭 기본 글꼴로 떨어져 칸 폭이 늘어나지 않게 한다. */
export function terminalFontFamily(font: string): string {
  return font.trim() ? `${font.trim()}, ${DEFAULT_TERMINAL_FONT}` : DEFAULT_TERMINAL_FONT;
}

/** 실제 글꼴이 준비된 뒤 xterm이 문자 칸을 측정하게 한다. 로드 실패 시에는 대체 글꼴로 계속 연다. */
async function loadFont(font: string): Promise<void> {
  try {
    // 화면 문구가 아닌 영문·한글 글리프 로드 표본이다.
    await document.fonts?.load(`13px ${font}`, "MW\uD55C\uAE00");
  } catch {
    // 없는 글꼴이나 잘못된 CSS 명세 때문에 터미널 전체가 열리지 않는 일은 막는다.
  }
}

/** xterm.js를 처음 쓸 때 불러 엔진을 만든다. `fontFamily`는 터미널 글꼴 설정이며 패널 크기에 맞춰 칸 수를 조절한다. */
export async function createTerminalEngine(fontFamily = ""): Promise<TerminalEngine> {
  const initialFont = terminalFontFamily(fontFamily);
  const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/xterm/css/xterm.css")]);
  await loadFont(initialFont);
  const term = new Terminal({ fontSize: 13, fontFamily: initialFont, cursorBlink: true });
  const fit = new FitAddon();
  term.loadAddon(fit);
  let observer: ResizeObserver | null = null;
  let removeIme: (() => void) | null = null;
  let sendData: (data: string) => void = () => {};
  let disposed = false;
  let fontRequest = 0;
  // macOS의 Cmd+Backspace(줄 처음까지 지우기): Terminal.app은 이 시스템 명령을 Ctrl+U로 셸에 보내지만, xterm.js는 이 키를 바이트로 바꾸지 않는다(이슈 #63).
  // 한글 입력 브리지와 같은 길(`sendData`)로 보내고, xterm이 다시 처리하지 않게 막는다. 지워지는 범위는 셸의 ^U 설정을 따른다.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== "keydown" || e.isComposing || e.key !== "Backspace" || !e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return true;
    e.preventDefault();
    sendData("\x15");
    return false;
  });
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
      const family = terminalFontFamily(font);
      const request = ++fontRequest;
      void loadFont(family).then(() => {
        if (disposed || request !== fontRequest) return;
        term.options.fontFamily = family;
        fit.fit();
        if (term.rows > 0) term.refresh(0, term.rows - 1);
      });
    },
    focus: () => term.focus(),
    dispose: () => {
      disposed = true;
      observer?.disconnect();
      removeIme?.();
      fit.dispose();
      term.dispose();
    },
  };
}
