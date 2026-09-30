import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { BackendError } from "./backend";
import type { Backend, SearchEvent } from "./backend";
import { commands, events } from "./generated/bindings";
import type { FileInfoDto, JobDto, LoadedState, PreviewDto, Snapshot, JobKindDto, Loaded, QueueItemDto, Result } from "./generated/bindings";

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
  async fileInfo(path: string): Promise<FileInfoDto> {
    return unwrap(await commands.fileInfo(path));
  }
  loadState(): Promise<LoadedState> {
    return commands.loadState();
  }
  async saveState(snapshot: Snapshot) {
    unwrap(await commands.saveState(snapshot));
  }
  async resetState() {
    unwrap(await commands.resetState());
  }
  async newWindow() {
    return unwrap(await commands.newWindow());
  }
  async preview(path: string): Promise<PreviewDto> {
    return unwrap(await commands.previewFile(path));
  }
  globFilter(pattern: string, names: string[]) {
    return commands.globFilter(pattern, names);
  }
  copyText(text: string) {
    return writeText(text);
  }
  async revealPath(path: string) {
    unwrap(await commands.revealPath(path));
  }
  async editPaths(paths: string[]) {
    unwrap(await commands.editPaths(paths));
  }
  async openAsArchive(path: string) {
    return unwrap(await commands.openAsArchive(path));
  }
  async startLookup(root: string, query: string) {
    return unwrap(await commands.startLookup(root, query));
  }
  startFlatten(root: string) {
    return commands.startFlatten(root);
  }
  startDiskUsage(root: string) {
    return commands.startDiskUsage(root);
  }
  async cancelSearch(id: number) {
    await commands.cancelSearch(id);
  }
  onSearchEvent(callback: (event: SearchEvent) => void) {
    const unlisten = [
      events.searchChunk.listen((e) => callback({ type: "chunk", id: e.payload.id, entries: e.payload.entries })),
      events.usageUpdate.listen((e) => callback({ type: "usage", ...e.payload })),
      events.searchDone.listen((e) => callback({ type: "done", id: e.payload.id, summary: e.payload.summary })),
    ];
    return () => {
      for (const u of unlisten) void u.then((fn) => fn());
    };
  }
  listVolumes() {
    return commands.listVolumes();
  }
  async unmountVolume(mountPoint: string) {
    unwrap(await commands.unmountVolume(mountPoint));
  }
  async ejectVolume(mountPoint: string) {
    unwrap(await commands.ejectVolume(mountPoint));
  }
  userDirs() {
    return commands.userDirs();
  }
  async addFavorite(name: string, path: string) {
    unwrap(await commands.addFavorite(name, path));
  }
  getConfig() {
    return commands.getConfig();
  }
  onConfigChanged(callback: (loaded: Loaded) => void) {
    const unlisten = events.configChanged.listen((e) => callback(e.payload.loaded));
    return () => {
      void unlisten.then((fn) => fn());
    };
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
