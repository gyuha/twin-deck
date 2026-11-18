import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { Backend, PreviewTargetDto } from "@twin-deck/ts-client";
import { useTheme } from "../App";
import { StoreContext } from "../state/context";
import { createAppStore } from "../state/store";
import { Preview } from "./Preview";
import { useTextColor, useUiFont } from "./fonts";

/**
 * 메인 창으로 넘기는 키: `preview` 스코프의 탐색·조작 키 중 이 창이 스스로 쓰지 않는 것만이다.
 * ↑ ↓ ← → Enter Space Delete(수식키 없이), Shift+F8, Mod+Y. Esc는 따로 닫는다.
 * Mod+C(선택한 글자 복사)와 PageUp/PageDown(본문 스크롤은 이 창의 일이다)은 넘기지 않고,
 * 오디오·비디오·입력칸·iframe(PDF) 안에서 눌린 키는 그 뷰어가 쓰므로 넘기지 않는다.
 */
function isForwardedKey(e: KeyboardEvent): boolean {
  if (e.target instanceof Element && e.target.closest("audio, video, input, textarea, iframe, [contenteditable]")) return false;
  const bare = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
  if (bare && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "Delete"].includes(e.key)) return true;
  if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "F8") return true;
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "y";
}

/**
 * 별도 미리보기 창의 화면 (이슈 #160). 메인 창 흐름(상태 저장·패널·전역 키·메뉴)을 타지 않고, 메인 창이 보낸 대상의 경로를
 * `backend.preview`로 읽어 앱 안 패널과 같은 내용 렌더러(`Preview`)로 창 전체에 그린다. 키는 Esc(닫기)와, 메인 창으로 넘기는 탐색·조작 키(`isForwardedKey`)만 받는다.
 */
export function PreviewWindow({ backend }: { backend: Backend }) {
  // `init()`을 부르지 않으므로 폴더 목록·감시·상태 저장은 시작하지 않는다. 스토어가 만들면서 건 백엔드 구독(경로 열기·드롭·폴더 변경 등
  // 메인 창 전용 이벤트)은 바로 끊고, 필요한 설정 변경 알림만 아래에서 다시 건다.
  const [app] = useState(() => {
    const a = createAppStore(backend, "/", "/", null);
    a.api.dispose();
    return a;
  });
  const loaded = useStore(app.store, (s) => s.loaded);
  const [ready, setReady] = useState(false);
  const theme = useTheme(loaded.config.behavior.theme);
  useUiFont(loaded.config.behavior.ui_font);
  useTextColor(loaded.config.behavior, theme?.dark ?? false);

  useEffect(() => {
    let seq = 0; // 대상이 빠르게 바뀔 때 늦게 온 이전 응답이 덮어쓰지 않게 한다
    let gone = false;
    const show = async (target: PreviewTargetDto) => {
      const mine = ++seq;
      const base = { path: target.path, name: target.name, isDir: target.is_dir };
      app.store.setState((s) => ({ preview: { ...base, status: "loading" as const, data: s.preview?.data } }));
      try {
        const data = await backend.preview(target.path);
        if (mine === seq) app.store.setState({ preview: { ...base, status: "ready", data } });
      } catch (e) {
        if (mine === seq) app.store.setState({ preview: { ...base, status: "error", error: String(e instanceof Error ? e.message : e) } });
      }
    };
    const off = backend.onPreviewWindowTarget((t) => void show(t));
    const offConfig = backend.onConfigChanged((loaded) => app.store.setState({ loaded }));
    void (async () => {
      app.store.setState({ loaded: await backend.getConfig() });
      if (gone) return;
      setReady(true);
      const first = await backend.previewWindowTarget();
      if (first && seq === 0) void show(first); // 그 사이 이벤트로 이미 대상이 왔다면 그것이 더 새롭다
    })();
    const key = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void backend.previewWindowClose();
      } else if (isForwardedKey(e)) {
        e.preventDefault();
        void backend.previewWindowForwardKey({ key: e.key, code: e.code, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      gone = true;
      off();
      offConfig();
      window.removeEventListener("keydown", key);
      app.api.dispose();
    };
  }, [app, backend]);

  if (!ready) return null;
  return (
    <StoreContext.Provider value={app}>
      <main className="h-full overflow-hidden text-ink">
        <Preview windowed onClose={() => void backend.previewWindowClose()} />
      </main>
    </StoreContext.Provider>
  );
}
