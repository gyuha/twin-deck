import type { Backend } from "@twin-deck/ts-client";
import { createTerminalEngine } from "./terminalEngine";
import type { TerminalEngine } from "./terminalEngine";
import type { TerminalColors } from "./themeColors";

/**
 * 터미널 세션(pty)마다 화면 엔진(xterm)과 pty 출력 구독을 하나씩 들고 있는다(이슈 #96).
 * 화면을 그리는 `TerminalView`는 패널마다 마운트되므로, 탭을 다른 패널로 옮기면 옛 패널의 뷰는 사라지고 새 패널의 뷰가 생긴다.
 * 엔진을 뷰에 두면 그때마다 화면(스크롤 내용)이 사라지므로, 엔진과 구독은 여기 두고 뷰는 붙었다 떨어지기만 한다.
 * 어느 뷰에도 붙어 있지 않게 되면(탭을 닫았거나 셸이 끝났다) 엔진을 해제하고 구독을 푼다.
 */
export interface TerminalState {
  ready: boolean;
  error: string | null;
}

export interface TerminalHandle {
  /** 이 세션의 화면을 `host` 안에 그린다. 이미 다른 자리에 붙어 있으면 그대로 옮겨 붙인다. 엔진이 준비되기 전이면 준비되는 대로 붙인다. */
  attach(host: HTMLElement): void;
  /** 테마 색을 바꾼다. 엔진이 준비되기 전이면 준비되는 대로 그 색으로 연다. */
  setTheme(colors: TerminalColors): void;
  /** 준비된 엔진(준비 전이면 null). */
  engine(): TerminalEngine | null;
  /** 이 뷰가 더는 이 세션을 쓰지 않는다. 다른 뷰가 이어 받지 않으면 다음 틱에 엔진을 해제한다. */
  release(): void;
}

interface Session {
  /** 지금 이어진 pty 세션 번호. 원격 셸을 다시 연결하면 같은 화면이 새 번호로 옮겨 온다(`rebindTerminal`). */
  id: number;
  engine: TerminalEngine | null;
  /** 가장 최근에 받은 테마 색. 엔진이 열릴 때 쓴다. */
  colors: TerminalColors | undefined;
  state: TerminalState;
  /** 엔진이 준비되기 전에 온 출력. */
  pending: Uint8Array[];
  host: HTMLElement | null;
  refs: number;
  disposed: boolean;
  off: () => void;
  watchers: Set<(s: TerminalState) => void>;
}

// 백엔드마다 세션 번호가 겹칠 수 있으므로(시험은 시험마다 새 백엔드가 1번부터 시작한다) 백엔드별로 나눈다.
const registry = new WeakMap<Backend, Map<number, Session>>();

function sessionsOf(backend: Backend): Map<number, Session> {
  let m = registry.get(backend);
  if (!m) registry.set(backend, (m = new Map()));
  return m;
}

function notify(s: Session, patch: Partial<TerminalState>) {
  s.state = { ...s.state, ...patch };
  s.watchers.forEach((w) => w(s.state));
}

function open(backend: Backend, id: number, font: string, colors?: TerminalColors): Session {
  const s: Session = { id, engine: null, colors, state: { ready: false, error: null }, pending: [], host: null, refs: 0, disposed: false, off: () => {}, watchers: new Set() };
  s.off = backend.onTerminalEvent((e) => {
    if (e.type !== "output" || e.id !== s.id) return;
    if (s.engine) s.engine.write(e.data);
    else s.pending.push(e.data);
  });
  createTerminalEngine(font, (url) => void backend.openExternalUrl(url).catch(() => {}), s.colors).then(
    (eng) => {
      if (s.disposed) return eng.dispose();
      s.engine = eng;
      eng.onData((data) => void backend.terminalWrite(s.id, data).catch(() => {}));
      eng.onResize(({ cols, rows }) => void backend.terminalResize(s.id, cols, rows).catch(() => {}));
      for (const chunk of s.pending) eng.write(chunk);
      s.pending = [];
      if (s.host) place(backend, s, s.host);
      notify(s, { ready: true });
    },
    (e) => !s.disposed && notify(s, { error: String(e instanceof Error ? e.message : e) }),
  );
  return s;
}

/** 엔진을 `host`에 붙이고(처음이면 열고, 다른 자리에서 왔으면 옮기고) 맞춘 크기를 셸에 알린다. */
function place(backend: Backend, s: Session, host: HTMLElement) {
  const eng = s.engine;
  if (!eng) return;
  eng.open(host);
  // 열자마자 맞춘 크기를 셸에 알린다(처음 크기 80x24는 임시였다).
  void backend.terminalResize(s.id, eng.cols, eng.rows).catch(() => {});
}

function dispose(backend: Backend, s: Session) {
  s.disposed = true;
  s.off();
  s.engine?.dispose();
  s.engine = null;
  sessionsOf(backend).delete(s.id);
}

/**
 * 끊긴 원격 셸을 다시 연결해 새 세션 `to`가 열렸을 때, 옛 세션 `from`의 화면(엔진)을 새 번호로 옮긴다(이슈 #98).
 * 이전 화면이 남고 그 아래로 새 셸의 출력이 이어진다. 옛 세션이 없으면(화면이 아직 열리지 않았다) 아무것도 하지 않는다.
 */
export function rebindTerminal(backend: Backend, from: number, to: number) {
  const sessions = sessionsOf(backend);
  const s = sessions.get(from);
  if (!s) return;
  sessions.delete(from);
  s.id = to;
  sessions.set(to, s);
  if (s.engine) void backend.terminalResize(to, s.engine.cols, s.engine.rows).catch(() => {});
}

/**
 * 세션 `id`의 화면을 쓰기 시작한다. 이미 있으면(다른 패널의 뷰가 쓰던 것) 같은 엔진을 이어 받는다.
 * `watch`는 준비·오류 상태가 바뀔 때 불린다(지금 상태로도 한 번 불린다).
 */
export function acquireTerminal(backend: Backend, id: number, font: string, watch: (s: TerminalState) => void, colors?: TerminalColors): TerminalHandle {
  const sessions = sessionsOf(backend);
  const s = sessions.get(id) ?? open(backend, id, font, colors);
  sessions.set(id, s);
  s.refs++;
  s.watchers.add(watch);
  watch(s.state);
  let released = false;
  return {
    attach(host) {
      s.host = host;
      place(backend, s, host);
    },
    setTheme(next) {
      s.colors = next;
      s.engine?.setTheme(next);
    },
    engine: () => s.engine,
    release() {
      if (released) return;
      released = true;
      s.watchers.delete(watch);
      s.refs--;
      // 같은 커밋에서 다른 패널의 뷰가 바로 이어 받는 경우(탭 이동)를 위해 한 틱 기다렸다가, 아무도 쓰지 않을 때만 해제한다.
      setTimeout(() => {
        if (s.refs === 0 && !s.disposed) dispose(backend, s);
      }, 0);
    },
  };
}
