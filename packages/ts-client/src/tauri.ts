import { BackendError } from "./backend";
import type { Backend } from "./backend";
import { commands, events } from "./generated/bindings";
import type { JobDto, JobKindDto, QueueItemDto, Result } from "./generated/bindings";

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
  async rename(path: string, newName: string) {
    return unwrap(await commands.renameEntry(path, newName));
  }
  enqueue(kind: JobKindDto, items: QueueItemDto[]) {
    return commands.enqueueJob(kind, items);
  }
  queueJobs() {
    return commands.queueJobs();
  }
  async queuePause(id: number) {
    await commands.queuePause(id);
  }
  async queueResume(id: number) {
    await commands.queueResume(id);
  }
  async queueAbort(id: number) {
    await commands.queueAbort(id);
  }
  async queueClearFinished() {
    await commands.queueClearFinished();
  }
  async watch(path: string) {
    unwrap(await commands.watchDir(path));
  }
  async unwatch(path: string) {
    unwrap(await commands.unwatchDir(path));
  }
  onQueueChanged(callback: (jobs: JobDto[]) => void) {
    const unlisten = events.queueChanged.listen((e) => callback(e.payload.jobs));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }
  onDirChanged(callback: (path: string) => void) {
    const unlisten = events.dirChanged.listen((e) => callback(e.payload.path));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }
}
