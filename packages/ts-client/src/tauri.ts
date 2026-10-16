import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { HostKeyError, BackendError, RemoteConnectError, SmbConnectError } from "./backend";
import type { Backend, FileDropEvent, SearchEvent, TerminalEvent } from "./backend";
import { commands, events } from "./generated/bindings";
import type { CliOutcomeDto, CliStatusDto, OpenPathsDto, ConfigValue, ConflictDto, LocationConflict, ExpectedFileDto, FileInfoDto, FindSpecDto, JobDto, LoadedState, PreviewDto, OfficePreviewDto, EpubInfoDto, Snapshot, JobKindDto, Loaded, QueueItemDto, RemoteServer, Result, SmbServer, WriteTextResultDto } from "./generated/bindings";

function unwrap<T>(r: Result<T, string>): T {
  if (r.status === "error") throw new BackendError(r.error);
  return r.data;
}

/** Tauri command/event로 Rust 코어를 호출하는 구현. */
/** Tauri의 드래그 앤 드롭 이벤트 중 우리가 쓰는 모양(물리 좌표). */
type TauriDragDrop =
  | { type: "enter"; paths: string[]; position: { x: number; y: number } }
  | { type: "over"; position: { x: number; y: number } }
  | { type: "drop"; paths: string[]; position: { x: number; y: number } }
  | { type: "leave" };

/** base64 글을 바이트로 푼다(터미널 출력은 UTF-8 글자 중간에서 잘릴 수 있어 바이트로 받는다). */
export function decodeBase64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Tauri 드래그 앤 드롭 이벤트를 `FileDropEvent`로 바꾼다. 물리 좌표를 `scale`(devicePixelRatio)로 나눠 CSS px로 만든다. */
export function toFileDropEvent(payload: TauriDragDrop, scale: number): FileDropEvent {
  if (payload.type === "leave") return { type: "leave", paths: [], x: 0, y: 0 };
  const s = scale > 0 ? scale : 1;
  return {
    type: payload.type,
    paths: payload.type === "over" ? [] : payload.paths,
    x: payload.position.x / s,
    y: payload.position.y / s,
  };
}

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
  normalizeNames(paths: string[]) {
    return commands.normalizeNames(paths);
  }
  async normalizeDir(dir: string) {
    return unwrap(await commands.normalizeDir(dir));
  }
  enqueue(kind: JobKindDto, items: QueueItemDto[]) {
    return commands.enqueueJob(kind, items);
  }
  async enqueueCompress(sources: string[], destDir: string, name?: string) {
    return unwrap(await commands.enqueueCompress(sources, destDir, name ?? null));
  }
  enqueueExtract(src: string, destDir: string) {
    return commands.enqueueExtract(src, destDir, null);
  }
  async createSymlink(src: string, destDir: string, policy: ConflictDto) {
    return unwrap(await commands.createSymlink(src, destDir, policy));
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
  async cliStatus(): Promise<CliStatusDto> {
    return unwrap(await commands.cliStatus());
  }
  async cliInstall(): Promise<CliOutcomeDto> {
    return unwrap(await commands.cliInstall());
  }
  async cliUninstall(): Promise<CliOutcomeDto> {
    return unwrap(await commands.cliUninstall());
  }
  async takeLaunchPaths() {
    return commands.takeLaunchPaths();
  }
  onOpenPaths(callback: (request: OpenPathsDto) => void) {
    const unlisten = events.openPaths.listen((e) => callback(e.payload.request));
    return () => {
      void unlisten.then((fn) => fn());
    };
  }
  async terminalOpen(cwd: string, cols: number, rows: number) {
    return unwrap(await commands.terminalOpen(cwd, cols, rows));
  }
  async terminalOpenRemote(connectionId: string, cols: number, rows: number) {
    return unwrap(await commands.terminalOpenRemote(connectionId, cols, rows));
  }
  async terminalWrite(id: number, data: string) {
    unwrap(await commands.terminalWrite(id, data));
  }
  async terminalResize(id: number, cols: number, rows: number) {
    unwrap(await commands.terminalResize(id, cols, rows));
  }
  async terminalClose(id: number) {
    unwrap(await commands.terminalClose(id));
  }
  onTerminalEvent(callback: (e: TerminalEvent) => void) {
    const offs = [
      events.terminalOutput.listen((e) => callback({ type: "output", id: e.payload.id, data: decodeBase64(e.payload.data) })),
      events.terminalExit.listen((e) => callback({ type: "exit", id: e.payload.id, code: e.payload.code })),
    ];
    return () => {
      for (const u of offs) void u.then((fn) => fn());
    };
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
  async writeTextFile(path: string, text: string, expected: ExpectedFileDto | null): Promise<WriteTextResultDto> {
    return unwrap(await commands.writeTextFile(path, text, expected));
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
  async officePreview(path: string): Promise<OfficePreviewDto> {
    return unwrap(await commands.officePreview(path));
  }
  async systemIcon(path: string, isDir: boolean, size: number): Promise<string | null> {
    return unwrap(await commands.systemIcon(path, isDir, size));
  }
  async epubOpen(path: string): Promise<EpubInfoDto> {
    return unwrap(await commands.epubOpen(path));
  }
  async epubChapter(path: string, index: number): Promise<string> {
    return unwrap(await commands.epubChapter(path, index));
  }
  globFilter(pattern: string, names: string[]) {
    return commands.globFilter(pattern, names);
  }
  fileUrl(path: string) {
    return convertFileSrc(path);
  }
  copyText(text: string) {
    return writeText(text);
  }
  async startNativeDrag(paths: string[]) {
    unwrap(await commands.startNativeDrag(paths));
  }
  async copyImage(path: string) {
    unwrap(await commands.copyImageToClipboard(path));
  }
  async setClipboardFiles(paths: string[]) {
    unwrap(await commands.setClipboardFiles(paths));
  }
  async getClipboardFiles() {
    return unwrap(await commands.getClipboardFiles());
  }
  async revealPath(path: string) {
    unwrap(await commands.revealPath(path));
  }
  async openPath(path: string) {
    unwrap(await commands.openPath(path));
  }
  async editPaths(paths: string[]) {
    unwrap(await commands.editPaths(paths));
  }
  async launchApp(app: string, paths: string[]) {
    unwrap(await commands.launchApp(app, paths));
  }
  async openAsArchive(path: string) {
    return unwrap(await commands.openAsArchive(path));
  }
  async startFind(spec: FindSpecDto) {
    return unwrap(await commands.startFind(spec));
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
  async dirSize(path: string) {
    return unwrap(await commands.dirSize(path));
  }
  async cancelDirSize(path: string) {
    await commands.cancelDirSize(path);
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
  async diskSpace(path: string) {
    return unwrap(await commands.diskSpace(path));
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
    return unwrap(await commands.addFavorite(name, path));
  }
  async removeFavorite(path: string) {
    return unwrap(await commands.removeFavorite(path));
  }
  getConfig() {
    return commands.getConfig();
  }
  async setConfigValue(key: string, value: ConfigValue) {
    return unwrap(await commands.setConfigValue(key, value));
  }
  async resetConfigValue(key: string) {
    return unwrap(await commands.resetConfigValue(key));
  }
  async setSmbServers(servers: SmbServer[]) {
    return unwrap(await commands.setSmbServers(servers));
  }
  async smbConnect(index: number, password: string | null, remember: boolean) {
    const r = unwrap(await commands.smbConnect(index, password, remember));
    if ("failed" in r) throw new SmbConnectError(r.failed.kind, r.failed.message);
    return r.mounted;
  }
  async smbForgetPassword(index: number) {
    unwrap(await commands.smbForgetPassword(index));
  }
  async setRemoteServers(servers: RemoteServer[]) {
    return unwrap(await commands.setRemoteServers(servers));
  }
  async remoteConnect(index: number, password: string | null, remember: boolean, approvedHostKey?: string) {
    const r = unwrap(await commands.remoteConnect(index, password, remember, approvedHostKey ?? null));
    if ("hostKey" in r) throw new HostKeyError(r.hostKey);
    if ("failed" in r) throw new RemoteConnectError(r.failed.kind, r.failed.message);
    return r.connected;
  }
  async remoteDisconnect(index: number) {
    unwrap(await commands.remoteDisconnect(index));
  }
  async remoteConnections() {
    return commands.remoteConnections();
  }
  async remoteForgetPassword(index: number) {
    unwrap(await commands.remoteForgetPassword(index));
  }
  async remoteServerStart() {
    return unwrap(await commands.remoteServerStart());
  }
  async remoteServerStop() {
    return commands.remoteServerStop();
  }
  async remoteServerStatus() {
    return commands.remoteServerStatus();
  }
  async setRemoteServerPassword(password: string) {
    return unwrap(await commands.setRemoteServerPassword(password));
  }
  async revealConfigDir() {
    unwrap(await commands.revealConfigDir());
  }
  async getConfigLocation() {
    return unwrap(await commands.getConfigLocation());
  }
  async configLocationHasFiles(dir: string) {
    return commands.configLocationHasFiles(dir);
  }
  async setConfigLocation(dir: string | null, conflict: LocationConflict) {
    return unwrap(await commands.setConfigLocation(dir, conflict));
  }
  async pickFolder() {
    return unwrap(await commands.pickFolder());
  }
  async pickSaveFile(defaultName: string, extensions: string[]) {
    return unwrap(await commands.pickSaveFile(defaultName, extensions));
  }
  async pickFile(extensions: string[]) {
    return unwrap(await commands.pickFile(extensions));
  }
  async exportConfig(dest: string) {
    unwrap(await commands.exportConfig(dest));
  }
  async importConfig(src: string) {
    return unwrap(await commands.importConfig(src));
  }
  async openReleasesPage() {
    unwrap(await commands.openReleasesPage());
  }
  async openExternalUrl(url: string) {
    unwrap(await commands.openExternalUrl(url));
  }
  async checkUpdate() {
    return unwrap(await commands.checkUpdate());
  }
  async installUpdate() {
    unwrap(await commands.installUpdate());
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
  onFileDrop(callback: (e: FileDropEvent) => void) {
    try {
      const unlisten = getCurrentWebview().onDragDropEvent((e) => callback(toFileDropEvent(e.payload as TauriDragDrop, window.devicePixelRatio || 1)));
      return () => {
        void unlisten.then((fn) => fn(), () => {});
      };
    } catch {
      // 웹뷰 정보가 없는 환경(IPC만 흉내 낸 테스트 등)에서는 받을 이벤트가 없다.
      return () => {};
    }
  }
}
