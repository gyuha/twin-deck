// 터미널 화면 엔진. xterm.js로 그리고, 테스트에서는 이 모듈을 가짜로 바꾼다.
import { installImeBridge } from "./imeBridge";
import type { TerminalColors } from "./themeColors";
import { findUrls } from "./terminalLinks";

export interface TerminalEngine {
  /**
   * 화면을 `el` 안에 그리고 `el` 크기에 맞춘다. 이미 열린 엔진에 다른 `el`로 다시 부르면 화면(스크롤 내용 포함)을 그대로 두고
   * 새 `el`로 옮겨 붙인다 — 터미널 탭을 다른 패널로 옮길 때 쓴다(이슈 #96).
   */
  open(el: HTMLElement): void;
  /** pty가 낸 바이트(또는 글)를 화면에 쓴다. */
  write(data: Uint8Array | string): void;
  /** 사용자의 입력(키 입력을 글로 바꾼 것). */
  onData(cb: (data: string) => void): void;
  /** 화면의 칸 수가 바뀌었다(처음 맞출 때 포함). */
  onResize(cb: (size: { cols: number; rows: number }) => void): void;
  readonly cols: number;
  readonly rows: number;
  /** 테마 색(배경·글자·커서·ANSI 색)을 바꾼다(이슈 #118). 이미 그려진 글자도 새 색으로 다시 그려진다. */
  setTheme(colors: TerminalColors): void;
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

/**
 * xterm.js를 처음 쓸 때 불러 엔진을 만든다. `fontFamily`는 터미널 글꼴 설정이며 패널 크기에 맞춰 칸 수를 조절한다.
 * 화면에 보이는 주소(`http`·`https`)를 Ctrl(macOS는 Cmd)+클릭하면 `openLink`를 부른다(이슈 #107).
 */
export async function createTerminalEngine(fontFamily = "", openLink: (url: string) => void = () => {}, colors?: TerminalColors): Promise<TerminalEngine> {
  const initialFont = terminalFontFamily(fontFamily);
  const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit"), import("@xterm/xterm/css/xterm.css")]);
  await loadFont(initialFont);
  const term = new Terminal({ fontSize: 13, fontFamily: initialFont, cursorBlink: true, ...(colors ? { theme: colors } : {}) });
  const fit = new FitAddon();
  term.loadAddon(fit);
  let observer: ResizeObserver | null = null;
  let removeIme: (() => void) | null = null;
  /** 지금 화면이 붙어 있는 자리. 처음 `open`하기 전에는 null. */
  let host: HTMLElement | null = null;
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
  // 한 줄(줄 바꿈으로 이어진 줄은 따로 본다)에서 주소를 찾는다. 글자 위치를 칸 번호로 바꿀 때 넓은 글자(한글)가 두 칸을 차지하는 것을 반영한다.
  term.registerLinkProvider({
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      if (!line) return callback(undefined);
      let text = "";
      const cellOf: number[] = [];
      for (let x = 0; x < line.length; x++) {
        const cell = line.getCell(x);
        if (!cell || cell.getWidth() === 0) continue;
        const chars = cell.getChars() || " ";
        for (let i = 0; i < chars.length; i++) cellOf.push(x);
        text += chars;
      }
      const links = findUrls(text).map(({ start, end, url }) => ({
        text: url,
        range: { start: { x: cellOf[start] + 1, y }, end: { x: cellOf[end - 1] + 1, y } },
        activate: (e: MouseEvent) => {
          if (e.ctrlKey || e.metaKey) openLink(url);
        },
      }));
      callback(links.length ? links : undefined);
    },
  });
  return {
    open(el) {
      if (host === el) return;
      const reattach = host !== null;
      // 옛 자리에 걸어 둔 한글 입력 브리지와 크기 관찰자는 풀고 새 자리에 다시 건다.
      removeIme?.();
      observer?.disconnect();
      host = el;
      // 한글 조합은 xterm이 아니라 직접 받는다(WebKit에서 모음이 빠지는 문제). 확정된 글은 일반 입력과 같은 길로 보낸다.
      removeIme = installImeBridge(el, (text) => sendData(text));
      if (reattach) {
        // xterm은 한 번만 열 수 있다. 이미 그려진 화면(element)을 새 자리로 옮겨 붙인다.
        if (term.element) el.appendChild(term.element);
      } else {
        term.open(el);
      }
      fit.fit();
      if (reattach && term.rows > 0) term.refresh(0, term.rows - 1);
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
    setTheme(next) {
      term.options.theme = next;
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
