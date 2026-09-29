import { BackendError } from "./backend";
import type { Backend } from "./backend";
import { commands, events } from "./generated/bindings";
import type { Result } from "./generated/bindings";

function unwrap<T>(r: Result<T, string>): T {
  if (r.status === "error") throw new BackendError(r.error);
  return r.data;
}

/** Tauri command/event로 Rust 코어를 호출하는 구현. */
export class TauriBackend implements Backend {
  async listDir(path: string, showHidden: boolean) {
    return unwrap(await commands.listDir(path, showHidden));
  }
  async mkdir(path: string) {
    unwrap(await commands.mkdir(path));
  }
  async touch(path: string) {
    unwrap(await commands.touch(path));
  }
  detectConflict(src: string, destDir: string) {
    return commands.detectConflict(src, destDir);
  }
  async copy(src: string, destDir: string, policy: Parameters<Backend["copy"]>[2]) {
    return unwrap(await commands.copyEntry(src, destDir, policy));
  }
  async move(src: string, destDir: string, policy: Parameters<Backend["move"]>[2]) {
    return unwrap(await commands.moveEntry(src, destDir, policy));
  }
  async rename(path: string, newName: string) {
    return unwrap(await commands.renameEntry(path, newName));
  }
  async trash(path: string) {
    unwrap(await commands.trashEntry(path));
  }
  async deletePermanent(path: string) {
    unwrap(await commands.deleteEntry(path));
  }
  async watch(path: string) {
    unwrap(await commands.watchDir(path));
  }
  async unwatch(path: string) {
    unwrap(await commands.unwatchDir(path));
  }
  onDirChanged(callback: (path: string) => void) {
    const unlisten = events.dirChanged.listen((e) => callback(e.payload.path));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }
}
