import { archiveRoot, isArchivePath } from "./archive";
import { BackendError, baseName, joinPath, parentPath } from "./backend";
import type { Backend, SearchEvent } from "./backend";
import type {
  ConfigValue,
  ConflictDto,
  EntryDto,
  FileInfoDto,
  JobDto,
  JobKindDto,
  Loaded,
  LoadedState,
  PreviewDto,
  QueueItemDto,
  SearchStartDto,
  Snapshot,
  UserDirsDto,
  VolumeDto,
  DiskSpaceDto,
  UpdateInfoDto,
  FindSpecDto,
  ExpectedFileDto,
  WriteTextResultDto,
} from "./generated/bindings";
import { globMatch } from "./glob";
import defaultConfigJson from "./generated/default-config.json";

/** Rust가 만든 내장 기본 설정(무경고, 사용자 바인딩 없음). */
const getPath = (obj: Record<string, unknown>, key: string): unknown =>
  key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

const setPath = (obj: Record<string, unknown>, key: string, value: unknown) => {
  const parts = key.split(".");
  const leaf = parts.pop()!;
  const parent = parts.reduce<Record<string, unknown>>((o, k) => (o[k] ??= {}) as Record<string, unknown>, obj);
  if (value === undefined) delete parent[leaf];
  else parent[leaf] = value;
};

export const defaultLoaded = (): Loaded => structuredClone(defaultConfigJson) as Loaded;

/** FakeBackend 내부의 복사/이동 결과. */
type OutcomeDto = { type: "done"; path: string } | { type: "skipped" };

interface Node {
  kind: "file" | "dir";
  /** 심볼릭 링크이면 가리키는 경로(목록에서는 `symlink`로 보인다). */
  link?: string;
  content: string;
  modifiedMs?: number;
  createdMs?: number;
}

const TRASH = "/.trash";

interface FakeSearch {
  kind: "chunk" | "usage";
  entries: EntryDto[];
  pos: number;
  finished: boolean;
  warnings: string[];
}

interface FakeJob {
  dto: JobDto;
  items: QueueItemDto[];
}

/** 인메모리 파일시스템. UI 테스트용이며 Rust 쪽 충돌 정책과 같은 규칙을 따른다. */
export class FakeBackend implements Backend {
  private nodes = new Map<string, Node>([["/", { kind: "dir", content: "" }]]);
  private watched = new Set<string>();
  private listeners = new Set<(path: string) => void>();
  /** 휴지통으로 간 원래 경로들. */
  readonly trashed: string[] = [];
  /**
   * `instant`: 큐에 넣는 즉시 모두 실행한다(기본).
   * `manual`: `advance()`를 부를 때마다 항목 하나씩 실행한다(진행/일시정지/중단 테스트용).
   */
  queueMode: "instant" | "manual" = "instant";
  /** 테스트에서 바꿀 수 있는 볼륨 목록. 언마운트하면 목록에서 빠진다. */
  volumes: VolumeDto[] = [
    { name: "/", mountPoint: "/" },
    { name: "USB", mountPoint: "/Volumes/USB" },
  ];
  /** 테스트용: 마운트 경로별 용량(바이트). 없는 볼륨의 경로는 조회가 거부된다. */
  diskSpaces: Record<string, DiskSpaceDto> = {};
  /** 클립보드에 쓴 텍스트, 파일 관리자로 보여 준 경로, 편집기로 연 경로 묶음. */
  readonly clipboard: string[] = [];
  readonly revealed: string[] = [];
  readonly edited: string[][] = [];
  readonly opened: string[] = [];
  /** 테스트용: `launchApp` 호출 기록. */
  readonly launched: { app: string; paths: string[] }[] = [];
  /** 저장된 창 상태(테스트가 미리 넣거나 앱이 저장한 것)와 저장 이력, 로드 경고. */
  storedState: Snapshot | null = null;
  readonly savedStates: Snapshot[] = [];
  stateWarning: string | null = null;
  /** `resetState`가 불렸는지(=앱이 종료되는 상황). */
  stateReset = false;
  readonly windowsOpened: string[] = [];
  newWindowError: string | null = null;
  readonly unmounted: string[] = [];
  readonly ejected: string[] = [];
  userDirsValue: UserDirsDto = {
    home: "/home/a",
    downloads: "/home/a/docs",
    documents: null,
    desktop: null,
    pictures: null,
    music: null,
    movies: null,
  };
  private loaded: Loaded = defaultLoaded();
  private configListeners = new Set<(l: Loaded) => void>();
  private jobs = new Map<number, FakeJob>();
  private nextJobId = 1;
  private queueListeners = new Set<(jobs: JobDto[]) => void>();

  /** 테스트 준비용: 경로에 폴더(끝이 `/`) 또는 파일을 만든다. 부모는 자동 생성. */
  seed(entries: Record<string, string | null>): this {
    for (const [path, content] of Object.entries(entries)) {
      if (content === null) this.ensureDir(path);
      else {
        this.ensureDir(parentPath(path) ?? "/");
        this.nodes.set(path, { kind: "file", content });
      }
    }
    return this;
  }

  private ensureDir(path: string) {
    let cur = "";
    for (const part of path.split("/").filter(Boolean)) {
      cur = `${cur}/${part}`;
      if (!this.nodes.has(cur)) this.nodes.set(cur, { kind: "dir", content: "" });
    }
  }

  private notify(...paths: (string | null)[]) {
    for (const p of paths) {
      if (p && this.watched.has(p)) this.listeners.forEach((l) => l(p));
    }
  }

  private need(path: string): Node {
    const n = this.nodes.get(path);
    if (!n) throw new BackendError(`찾을 수 없음: ${path}`);
    return n;
  }

  private subtree(path: string): string[] {
    // 아카이브 파일(`x.zip`)은 안쪽 항목(`x.zip!/…`)과 한 덩어리로 움직인다.
    const inArchive = this.nodes.get(path)?.kind === "file";
    return [...this.nodes.keys()].filter(
      (k) => k === path || k.startsWith(`${path}/`) || (inArchive && (k === `${path}!` || k.startsWith(`${path}!/`))),
    );
  }

  /** 실제 상태 확인용. */
  exists(path: string): boolean {
    return this.nodes.has(path);
  }

  read(path: string): string {
    return this.need(path).content;
  }

  private dto(path: string, n: Node, size = n.content.length): EntryDto {
    const name = baseName(path);
    return {
      name,
      path,
      kind: n.link ? "symlink" : n.kind,
      size,
      modifiedMs: n.modifiedMs ?? 0,
      createdMs: n.createdMs ?? 0,
      mode: n.kind === "dir" ? 0o755 : 0o644,
      hidden: name.startsWith("."),
      linkIsDir: !!n.link && this.nodes.get(n.link)?.kind === "dir",
    };
  }

  /** 테스트용: `path`에 `target`을 가리키는 심볼릭 링크를 만든다. 대상이 없어도(끊어진 링크) 만들 수 있다. */
  seedLink(path: string, target: string) {
    this.nodes.set(path, { kind: "file", content: "", link: target });
    return this;
  }

  async listDir(path: string, showHidden: boolean): Promise<EntryDto[]> {
    // 폴더를 가리키는 링크는 대상 폴더의 내용을 링크 경로 아래 항목으로 보여 준다(실제 파일시스템처럼).
    const node = this.need(path);
    const real = node.link && this.nodes.get(node.link)?.kind === "dir" ? node.link : path;
    if (this.need(real).kind !== "dir") throw new BackendError(`폴더가 아님: ${path}`);
    const prefix = real === "/" ? "/" : `${real}/`;
    const out: EntryDto[] = [];
    for (const [rp, n] of this.nodes) {
      if (rp === real || !rp.startsWith(prefix) || rp.slice(prefix.length).includes("/")) continue;
      const p = real === path ? rp : `${path}/${rp.slice(prefix.length)}`;
      const name = baseName(p);
      // `x.zip!`는 아카이브 안쪽을 여는 가상 위치라서 부모 목록에는 나오지 않는다.
      if (name.endsWith("!") && this.nodes.get(p.slice(0, -1))?.kind === "file") continue;
      const hidden = name.startsWith(".");
      if (hidden && !showHidden) continue;
      out.push(this.dto(p, n));
    }
    // Rust의 compare_names와 같은 규칙: NFC + 소문자 후 코드 순서 비교. 키는 한 번만 계산한다.
    const keyed = out.map((e) => ({ e, k: e.name.normalize("NFC").toLowerCase() }));
    keyed.sort((a, b) => {
      if ((a.e.kind === "dir") !== (b.e.kind === "dir")) return a.e.kind === "dir" ? -1 : 1;
      return a.k < b.k ? -1 : a.k > b.k ? 1 : 0;
    });
    return keyed.map((x) => x.e);
  }

  async mkdir(path: string) {
    if (this.nodes.has(path)) throw new BackendError(`이미 존재함: ${path}`);
    this.ensureDir(path);
    this.notify(parentPath(path));
  }

  async touch(path: string) {
    if (this.nodes.has(path)) throw new BackendError(`이미 존재함: ${path}`);
    this.need(parentPath(path) ?? "/");
    this.nodes.set(path, { kind: "file", content: "" });
    this.notify(parentPath(path));
  }

  async detectConflict(src: string, destDir: string) {
    const dest = joinPath(destDir, baseName(src));
    return this.nodes.has(dest) ? dest : null;
  }

  private resolveDest(src: string, destDir: string, policy: ConflictDto): string | null {
    const name = baseName(src);
    const dest = joinPath(destDir, name);
    if (!this.nodes.has(dest)) return dest;
    if (policy === "skip") return null;
    if (policy === "overwrite") {
      if (dest === src) throw new BackendError(`같은 파일을 덮어쓸 수 없습니다: ${dest}`);
      this.subtree(dest).forEach((k) => this.nodes.delete(k));
      return dest;
    }
    const dot = name.lastIndexOf(".");
    for (let n = 1; ; n++) {
      const numbered = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      const candidate = joinPath(destDir, numbered);
      if (!this.nodes.has(candidate)) return candidate;
    }
  }

  private guardInside(src: string, destDir: string) {
    if (this.need(src).kind === "dir" && (destDir === src || destDir.startsWith(`${src}/`))) {
      throw new BackendError(`대상이 원본 자신이거나 그 하위입니다: ${destDir}`);
    }
  }

  /** `writeTextFile`이 받은 쓰기 기록(경로·글자). 테스트가 저장 횟수와 내용을 확인한다. */
  readonly writes: { path: string; text: string }[] = [];
  private mtime = 1_000_000;

  async writeTextFile(path: string, text: string, expected: ExpectedFileDto | null): Promise<WriteTextResultDto> {
    const n = this.nodes.get(path);
    if (!n || n.kind !== "file") throw new Error(`${path}: 파일이 없습니다`);
    const size = n.content.length;
    const modifiedMs = n.modifiedMs ?? 0;
    if (expected && (expected.size !== size || expected.modifiedMs !== modifiedMs)) return { saved: false, size, modifiedMs };
    n.content = text;
    n.modifiedMs = ++this.mtime;
    this.writes.push({ path, text });
    return { saved: true, size: text.length, modifiedMs: n.modifiedMs };
  }

  /** 밖에서 파일이 바뀐 것을 흉내 낸다(내용과 수정 시각을 바꾼다). */
  externalWrite(path: string, content: string): void {
    const n = this.nodes.get(path);
    if (!n || n.kind !== "file") throw new Error(`${path}: 파일이 없습니다`);
    n.content = content;
    n.modifiedMs = ++this.mtime;
  }

  async fileInfo(path: string): Promise<FileInfoDto> {
    const n = this.need(path);
    const prefix = path === "/" ? "/" : `${path}/`;
    const children = [...this.nodes.keys()].filter(
      (k) => k !== path && k.startsWith(prefix) && !k.slice(prefix.length).includes("/"),
    ).length;
    return {
      name: baseName(path) || "/",
      path,
      kind: n.kind,
      size: n.content.length,
      createdMs: n.createdMs ?? 0,
      modifiedMs: n.modifiedMs ?? 0,
      accessedMs: n.modifiedMs ?? 0,
      mode: n.kind === "dir" ? 0o755 : 0o644,
      linkTarget: null,
      childCount: n.kind === "dir" ? children : null,
    };
  }

  async loadState(): Promise<LoadedState> {
    return { snapshot: this.storedState ? structuredClone(this.storedState) : null, warning: this.stateWarning };
  }

  async saveState(snapshot: Snapshot) {
    this.storedState = structuredClone(snapshot);
    this.savedStates.push(structuredClone(snapshot));
  }

  async resetState() {
    this.storedState = null;
    this.stateReset = true;
  }

  /** Rust `next_window_label`과 같은 규칙: win-2, win-3, … 중 쓰이지 않은 가장 작은 것. */
  async newWindow() {
    if (this.newWindowError) throw new BackendError(this.newWindowError);
    let n = 2;
    while (this.windowsOpened.includes(`win-${n}`)) n++;
    const label = `win-${n}`;
    this.windowsOpened.push(label);
    return label;
  }

  /** Rust `dir_preview`와 같은 규칙(폴더 먼저·이름순, `├── └── │` 가지, 깊이 3·200줄 상한)의 트리 텍스트. */
  private dirTree(root: string): string {
    const lines: string[] = [];
    const walk = (dir: string, prefix: string, depth: number) => {
      const base = dir === "/" ? "/" : `${dir}/`;
      const kids = [...this.nodes.entries()]
        .filter(([p]) => p !== dir && p.startsWith(base) && !p.slice(base.length).includes("/"))
        .map(([p, n]) => ({ name: p.slice(base.length), dir: n.kind === "dir" }))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      kids.forEach((k, i) => {
        if (lines.length >= 200) return;
        const last = i === kids.length - 1;
        lines.push(`${prefix}${last ? "└── " : "├── "}${k.name}${k.dir ? "/" : ""}`);
        if (k.dir && depth + 1 < 3) walk(`${base}${k.name}`, prefix + (last ? "    " : "│   "), depth + 1);
      });
    };
    walk(root, "", 0);
    return (lines.length ? lines.join("\n") : "(빈 폴더)") + "\n";
  }

  /** Rust `read_preview`와 같은 규칙(확장자로 이미지 판별, NUL이 있으면 Other, 64KB 초과는 잘림)을 흉내 낸다. */
  async preview(path: string): Promise<PreviewDto> {
    const n = this.need(path);
    const base = { text: null, truncated: false, size: n.content.length, dataUrl: null };
    if (n.kind === "dir") return { ...base, kind: "text", text: this.dirTree(path) };
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext];
    if (mime) return { ...base, kind: "image", dataUrl: `data:${mime};base64,${btoa(n.content)}` };
    const audio = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac", weba: "audio/webm" }[ext];
    if (audio) return { ...base, kind: "audio", dataUrl: `data:${audio};base64,${btoa(n.content)}` };
    if (["mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi"].includes(ext)) return { ...base, kind: "video" };
    if (ext === "pdf") return { ...base, kind: "pdf", dataUrl: `data:application/pdf;base64,${btoa(n.content)}` };
    if (n.content.includes("\u0000")) return { ...base, kind: "other" };
    const limit = 64 * 1024;
    return { ...base, kind: "text", text: n.content.slice(0, limit), truncated: n.content.length > limit };
  }

  async globFilter(pattern: string, names: string[]) {
    return names.flatMap((n, i) => (globMatch(pattern, n) ? [i] : []));
  }

  fileUrl(path: string) {
    return `fake-asset://localhost${path}`;
  }

  async copyText(text: string) {
    this.clipboard.push(text);
  }

  /** 창 밖으로 끌어 간 파일 목록들(`startNativeDrag` 호출 기록). */
  nativeDrags: string[][] = [];

  async startNativeDrag(paths: string[]) {
    this.nativeDrags.push([...paths]);
  }

  /** 운영체제 파일 클립보드(메모리). 테스트가 직접 채워 "다른 앱에서 복사한 파일"을 흉내 낼 수 있다. */
  fileClipboard: string[] = [];

  async setClipboardFiles(paths: string[]) {
    this.fileClipboard = [...paths];
  }

  async getClipboardFiles() {
    return this.fileClipboard.filter((p) => this.nodes.has(p));
  }

  async revealPath(path: string) {
    this.need(path);
    this.revealed.push(path);
  }

  async openPath(path: string) {
    this.need(path);
    this.opened.push(path);
  }

  async launchApp(app: string, paths: string[]) {
    for (const p of paths) this.need(p);
    this.launched.push({ app, paths: [...paths] });
  }

  async editPaths(paths: string[]) {
    if (!this.loaded.config.environment.text_editor.trim()) {
      throw new BackendError("환경 설정 [environment] text_editor가 비어 있습니다");
    }
    paths.forEach((p) => this.need(p));
    this.edited.push(paths);
  }

  /** Open As로 열기로 한 파일들. Rust 쪽의 세션 등록을 흉내 낸다. */
  readonly openedAsArchive: string[] = [];

  async openAsArchive(path: string) {
    if (this.need(path).kind !== "file") throw new BackendError(`파일이 아님: ${path}`);
    // 실제 구현은 매직 바이트로 판별한다. 여기서는 내용이 `PK`(zip 시그니처)로 시작하면 아카이브로 본다.
    if (!this.need(path).content.startsWith("PK")) throw new BackendError(`${path}: 아카이브로 열 수 있는 형식이 아닙니다`);
    this.openedAsArchive.push(path);
    const root = archiveRoot(path);
    if (!this.nodes.has(root)) this.nodes.set(root, { kind: "dir", content: "" });
    return root;
  }

  // ---- Look Up / Flatten / Disk Usage 흉내 ----
  // 실제 질의 문법과 순회 규칙은 Rust `td-search` 테스트가 검증한다. 여기서는 UI 흐름을 확인하기에 충분한 만큼만 흉내 낸다
  // (이름 부분 일치, `Name contains/is …`, 지원하지 않는 변수 경고).

  /**
   * `instant`: 시작하는 순간 결과를 모두 보낸다. 실제 앱처럼 응답(id)보다 이벤트가 먼저 도착하는 순서다.
   * `manual`: `stepSearch()`를 부를 때마다 항목 하나(Disk Usage는 스냅샷 하나)씩 보낸다.
   */
  searchMode: "instant" | "manual" = "instant";
  /** 시작한 검색/순회의 기록: [종류, 시작 위치, 질의]. */
  readonly searchesStarted: Array<[string, string, string]> = [];
  private searches = new Map<number, FakeSearch>();
  private nextSearchId = 1;
  private searchListeners = new Set<(e: SearchEvent) => void>();

  private emitSearch(e: SearchEvent) {
    this.searchListeners.forEach((l) => l(e));
  }

  onSearchEvent(callback: (event: SearchEvent) => void) {
    this.searchListeners.add(callback);
    return () => void this.searchListeners.delete(callback);
  }

  /** `root` 아래의 노드. 파일 옆의 `x.zip!` 가상 위치 안쪽은 (root가 아카이브 안이 아니면) 훑지 않는다. */
  private below(root: string): Array<[string, Node]> {
    this.need(root);
    const prefix = root === "/" ? "/" : `${root}/`;
    const skipArchives = !isArchivePath(root);
    return [...this.nodes].filter(([k]) => {
      if (!k.startsWith(prefix) || k === root) return false;
      return !(skipArchives && /(^|\/)[^/]*!(\/|$)/.test(k.slice(prefix.length)));
    });
  }

  private register(kind: FakeSearch["kind"], entries: EntryDto[], warnings: string[] = []): number {
    const id = this.nextSearchId++;
    this.searches.set(id, { kind, entries, pos: 0, finished: false, warnings });
    if (this.searchMode === "instant") this.deliverAll(id);
    return id;
  }

  private finishSearch(id: number, cancelled: boolean) {
    const s = this.searches.get(id);
    if (!s || s.finished) return;
    s.finished = true;
    this.emitSearch({
      type: "done",
      id,
      summary: { visited: s.entries.length, matched: s.entries.length, unreadable: 0, cancelled, warnings: s.warnings },
    });
  }

  private usageEvent(id: number, s: FakeSearch, count: number, done: boolean): SearchEvent {
    const items = s.entries.slice(0, count);
    return { type: "usage", id, items, done, totalBytes: items.reduce((n, e) => n + e.size, 0), files: items.length };
  }

  private deliverAll(id: number) {
    const s = this.searches.get(id)!;
    if (s.kind === "usage") {
      this.emitSearch(this.usageEvent(id, s, Math.ceil(s.entries.length / 2), false));
      this.emitSearch(this.usageEvent(id, s, s.entries.length, true));
    } else {
      for (let i = 0; i < s.entries.length; i += 50) {
        this.emitSearch({ type: "chunk", id, entries: s.entries.slice(i, i + 50) });
      }
    }
    this.finishSearch(id, false);
  }

  /** 수동 모드: 실행 중인 가장 오래된 검색을 한 걸음 진행한다. 진행했으면 true. */
  async stepSearch(): Promise<boolean> {
    const found = [...this.searches].find(([, s]) => !s.finished);
    if (!found) return false;
    const [id, s] = found;
    if (s.kind === "usage") {
      s.pos++;
      const done = s.pos >= s.entries.length;
      this.emitSearch(this.usageEvent(id, s, done ? s.entries.length : s.pos, done));
      if (done) this.finishSearch(id, false);
    } else if (s.pos < s.entries.length) {
      this.emitSearch({ type: "chunk", id, entries: [s.entries[s.pos++]] });
      if (s.pos >= s.entries.length) this.finishSearch(id, false);
    } else {
      this.finishSearch(id, false);
    }
    return true;
  }

  async startLookup(root: string, query: string): Promise<SearchStartDto> {
    const q = query.trim();
    if (!q) throw new BackendError("질의가 비었습니다 (위치 0)");
    this.searchesStarted.push(["lookup", root, q]);
    const unsupported = /^(uti|author|title|album|genre)\s*(=|is|contains|has)\b/i.exec(q);
    const warnings = unsupported ? [`${unsupported[1]}: 이 백엔드(라이브 순회)에서 지원하지 않습니다`] : [];
    const named = /^name\s+(contains|has|is|=|==|equals)\s+"?(.+?)"?$/i.exec(q);
    const [exact, needle] = named ? [/^(is|=|==|equals)$/i.test(named[1]), named[2]] : [false, q.replace(/^"(.*)"$/, "$1")];
    const wanted = needle.normalize("NFC").toLowerCase();
    const entries = unsupported
      ? []
      : this.below(root)
          .filter(([k]) => {
            const name = baseName(k).normalize("NFC").toLowerCase();
            return exact ? name === wanted : name.includes(wanted);
          })
          .map(([k, n]) => this.dto(k, n));
    return { id: this.register("chunk", entries, warnings), warnings };
  }

  /**
   * 파일 찾기. Rust `td_search::Finder`와 같은 규칙을 메모리 파일시스템에서 구현한다:
   * 마스크는 `;` 토큰(와일드카드 없으면 부분 일치/정확히 같음), 정규식, 제외 마스크(항상 glob, 정확히 같음),
   * 깊이(0 = 시작 폴더 바로 아래만), 선택 항목만, 심볼릭 링크 따라가기(순환 방지), 파일 안 텍스트(invert 포함).
   */
  async startFind(spec: FindSpecDto): Promise<SearchStartDto> {
    const fold = (s: string) => s.normalize("NFC").toLowerCase();
    const tokens = (m: string) => m.split(";").map((t) => t.trim()).filter(Boolean);
    const build = (src: string, flags: string, what: string) => {
      try {
        return new RegExp(src, flags);
      } catch (e) {
        throw new BackendError(`${what} 정규식 오류: ${e instanceof Error ? e.message : e}`);
      }
    };
    const nameRe = spec.regex && spec.mask.trim() ? build(spec.mask.trim(), "i", "파일 마스크") : null;
    const textRe = spec.text?.regex ? build(spec.text.pattern, spec.text.caseSensitive ? "" : "i", "텍스트") : null;
    if (spec.text && !spec.text.pattern) throw new BackendError("찾을 텍스트가 비었습니다");
    const maskTokens = tokens(spec.mask);
    const wild = (t: string) => /[*?[]/.test(t);
    const nameOk = (name: string) => {
      if (nameRe) return nameRe.test(name.normalize("NFC"));
      if (maskTokens.length === 0) return true;
      return maskTokens.some((t) => (wild(t) ? globMatch(t, name) : spec.substring ? fold(name).includes(fold(t)) : fold(name) === fold(t)));
    };
    const excluded = (mask: string, name: string) => tokens(mask).some((t) => (wild(t) ? globMatch(t, name) : fold(name) === fold(t)));
    const textOk = (node: Node) => {
      const t = spec.text;
      if (!t) return true;
      if (node.kind !== "file" || node.content.slice(0, 8192).includes("\0")) return false;
      const has = textRe ? textRe.test(node.content) : t.caseSensitive ? node.content.includes(t.pattern) : node.content.toLowerCase().includes(t.pattern.toLowerCase());
      return has !== t.invert;
    };
    this.searchesStarted.push(["find", (spec.onlyItems ?? spec.roots).join(";"), JSON.stringify(spec)]);

    const found: EntryDto[] = [];
    const seen = new Set<string>();
    const target = (path: string, node: Node): [string, Node] => (node.link && spec.followSymlinks ? [node.link, this.nodes.get(node.link) ?? node] : [path, node]);
    const consider = (path: string, node: Node) => {
      const name = baseName(path);
      if (!nameOk(name) || excluded(spec.excludeFiles, name)) return;
      if (!textOk(target(path, node)[1])) return;
      found.push(this.dto(path, node));
    };
    const walk = (dir: string, depth: number) => {
      if (spec.followSymlinks) {
        if (seen.has(dir)) return;
        seen.add(dir);
      }
      const prefix = dir === "/" ? "/" : `${dir}/`;
      const children = this.below(dir).filter(([k]) => !k.slice(prefix.length).includes("/"));
      for (const [path, node] of children) {
        const [real, resolved] = target(path, node);
        const isDir = resolved.kind === "dir" && (!node.link || spec.followSymlinks);
        if (isDir && excluded(spec.excludeDirs, baseName(path))) continue;
        consider(path, node);
        if (isDir && (spec.maxDepth === null || depth < spec.maxDepth)) walk(real, depth + 1);
      }
    };
    if (spec.onlyItems) {
      for (const p of spec.onlyItems) {
        const node = this.need(p);
        if (node.kind === "dir") walk(p, 0);
        else consider(p, node);
      }
    } else {
      for (const r of spec.roots) walk(r, 0);
    }
    return { id: this.register("chunk", found), warnings: [] };
  }

  async startFlatten(root: string) {
    this.searchesStarted.push(["flatten", root, ""]);
    const entries = this.below(root)
      .filter(([, n]) => n.kind === "file")
      .map(([k, n]) => this.dto(k, n));
    return this.register("chunk", entries);
  }

  async startDiskUsage(root: string) {
    this.searchesStarted.push(["usage", root, ""]);
    const prefix = root === "/" ? "/" : `${root}/`;
    const below = this.below(root);
    const items = below
      .filter(([k]) => !k.slice(prefix.length).includes("/"))
      .map(([k, n]) => {
        const total = below
          .filter(([f, fn]) => fn.kind === "file" && (f === k || f.startsWith(`${k}/`)))
          .reduce((sum, [, fn]) => sum + fn.content.length, 0);
        return this.dto(k, n, total);
      })
      .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
    return this.register("usage", items);
  }

  async cancelSearch(id: number) {
    this.finishSearch(id, true);
  }

  /** 테스트용: `dirSize`가 계산하는 데 걸리는 시간(밀리초). 0이면 바로 끝난다. 취소를 시험하려고 늘린다. */
  dirSizeDelayMs = 0;
  /** 테스트용: 계산 중 취소를 확인하는 간격(밀리초). 늘리면 취소 결과가 늦게 돌아오는 경쟁을 만들 수 있다. */
  dirSizePollMs = 10;
  /** 테스트용: `dirSize`를 호출한 경로들(호출 순서대로). */
  dirSizeCalls: string[] = [];
  private dirSizeCancelled = new Set<string>();

  /** 폴더 아래 파일 크기(내용 길이)의 합. 폴더가 아니면 거부한다. 취소되면 null이다. */
  async dirSize(path: string): Promise<number | null> {
    this.dirSizeCalls.push(path);
    const node = this.need(path);
    if (node.kind !== "dir") throw new BackendError(`폴더가 아닙니다: ${path}`);
    this.dirSizeCancelled.delete(path);
    for (let waited = 0; waited < this.dirSizeDelayMs; waited += this.dirSizePollMs) {
      await new Promise((r) => setTimeout(r, this.dirSizePollMs));
      if (this.dirSizeCancelled.has(path)) {
        this.dirSizeCancelled.delete(path);
        return null;
      }
    }
    return [...this.nodes].filter(([k, n]) => k.startsWith(`${path}/`) && n.kind === "file" && !k.includes("!")).reduce((sum, [, n]) => sum + n.content.length, 0);
  }

  async cancelDirSize(path: string) {
    this.dirSizeCancelled.add(path);
  }

  async listVolumes() {
    return this.volumes.map((v) => ({ ...v }));
  }

  /** 경로가 속한 볼륨(가장 긴 마운트 경로 접두)의 용량. 값이 없으면 거부한다. */
  async diskSpace(path: string): Promise<DiskSpaceDto> {
    const inside = (mp: string) => mp === "/" || path === mp || path.startsWith(`${mp}/`);
    const mp = Object.keys(this.diskSpaces)
      .filter(inside)
      .sort((a, b) => b.length - a.length)[0];
    if (mp === undefined) throw new BackendError(`용량을 알 수 없음: ${path}`);
    return { ...this.diskSpaces[mp] };
  }

  private checkVolume(mountPoint: string) {
    if (mountPoint === "/") throw new BackendError("루트 볼륨은 언마운트할 수 없습니다");
    if (!this.volumes.some((v) => v.mountPoint === mountPoint)) {
      throw new BackendError(`마운트된 볼륨이 아닙니다: ${mountPoint}`);
    }
  }

  async unmountVolume(mountPoint: string) {
    this.checkVolume(mountPoint);
    this.unmounted.push(mountPoint);
    this.volumes = this.volumes.filter((v) => v.mountPoint !== mountPoint);
  }

  async ejectVolume(mountPoint: string) {
    this.checkVolume(mountPoint);
    this.ejected.push(mountPoint);
    this.volumes = this.volumes.filter((v) => v.mountPoint !== mountPoint);
  }

  async userDirs() {
    return { ...this.userDirsValue };
  }

  /** 실제 구현처럼 config.toml에 덧붙인 뒤 재로딩되는 것을 흉내 낸다. */
  async addFavorite(name: string, path: string) {
    this.setConfig((l) => {
      (l.config.favorites ??= []).push({ kind: "item", name, path, items: [] });
    });
    return structuredClone(this.loaded);
  }

  async removeFavorite(path: string) {
    this.setConfig((l) => {
      const drop = (list: { path?: string | null; items?: { path: string }[] }[]): boolean => {
        const i = list.findIndex((f) => f.path === path);
        if (i >= 0) {
          list.splice(i, 1);
          return true;
        }
        return list.some((f) => f.items && drop(f.items));
      };
      drop((l.config.favorites ??= []) as never);
    });
    return structuredClone(this.loaded);
  }

  async getConfig() {
    return structuredClone(this.loaded);
  }

  /** 설정 화면 쓰기를 흉내 낸다: 점 표기 키에 값을 넣고 구독자에게도 알린다. */
  async setConfigValue(key: string, value: ConfigValue) {
    this.setConfig((l) => setPath(l.config as unknown as Record<string, unknown>, key, value.value));
    return structuredClone(this.loaded);
  }

  /** 기본값에서 그 키의 값을 가져와 되돌린다. */
  async resetConfigValue(key: string) {
    const fallback = getPath(defaultLoaded().config as unknown as Record<string, unknown>, key);
    this.setConfig((l) => setPath(l.config as unknown as Record<string, unknown>, key, fallback));
    return structuredClone(this.loaded);
  }

  /** 테스트용: 설정 폴더 열기를 누른 횟수. */
  configDirRevealed = 0;
  async revealConfigDir() {
    this.configDirRevealed += 1;
  }

  /** 테스트용: 다음 업데이트 확인 결과. 기본은 새 버전 없음. */
  updateScenario: { info: UpdateInfoDto | null; checkError?: string; installError?: string } = { info: null };
  /** 테스트용: `checkUpdate`/`installUpdate` 호출 횟수. */
  updateCalls = { check: 0, install: 0 };
  async checkUpdate() {
    this.updateCalls.check += 1;
    if (this.updateScenario.checkError) throw new BackendError(this.updateScenario.checkError);
    return this.updateScenario.info;
  }
  async installUpdate() {
    this.updateCalls.install += 1;
    if (this.updateScenario.installError) throw new BackendError(this.updateScenario.installError);
  }

  /** 테스트용: 파일의 수정·생성 시각을 지정한다. */
  setTimes(path: string, times: { modifiedMs?: number; createdMs?: number }) {
    Object.assign(this.need(path), times);
  }

  /** 테스트용: 설정을 고치고 구독자에게 알린다(파일 감시 재로딩을 흉내 낸다). */
  setConfig(change: (l: Loaded) => void) {
    change(this.loaded);
    const snap = structuredClone(this.loaded);
    this.configListeners.forEach((l) => l(snap));
  }

  onConfigChanged(callback: (loaded: Loaded) => void) {
    this.configListeners.add(callback);
    return () => void this.configListeners.delete(callback);
  }

  private snapshot(): JobDto[] {
    return [...this.jobs.values()].map((j) => ({ ...j.dto, errors: [...j.dto.errors] }));
  }

  /** 테스트용: false면 큐 변경 알림을 보내지 않는다(실제 앱에서 이벤트가 오지 않는 상황). */
  queueEvents = true;

  private notifyQueue() {
    if (!this.queueEvents) return;
    const snap = this.snapshot();
    this.queueListeners.forEach((l) => l(snap));
  }

  private async runItem(kind: JobKindDto, item: QueueItemDto) {
    switch (kind) {
      case "copy":
        await this.copy(item.src, item.destDir!, item.policy);
        break;
      case "move":
        await this.move(item.src, item.destDir!, item.policy);
        break;
      case "duplicate":
        this.duplicate(item.src);
        break;
      case "trash":
        await this.trash(item.src);
        break;
      case "delete":
        await this.deletePermanent(item.src);
        break;
      case "compress":
        this.compress(this.compressSources.get(item)?.sources ?? [item.src], item.destDir!, this.compressSources.get(item)?.name);
        break;
      case "extract":
        this.extract(item.src, item.destDir!);
        break;
    }
  }

  // ---- 압축/추출/심볼릭 링크 흉내 (실제 zip 동작은 Rust 테스트가 검증한다) ----
  private compressSources = new WeakMap<QueueItemDto, { sources: string[]; name?: string }>();
  /** 링크를 만들 수 없는 상황(예: Windows 권한 오류)을 흉내 내는 테스트용 오류 문구. */
  symlinkError: string | null = null;

  async enqueueCompress(sources: string[], destDir: string, name?: string) {
    const item: QueueItemDto = { src: sources[0], destDir, policy: "rename" };
    this.compressSources.set(item, { sources, name });
    return this.enqueue("compress", [item]);
  }

  async enqueueExtract(src: string, destDir: string) {
    return this.enqueue("extract", [{ src, destDir, policy: "rename" }]);
  }

  /** 겹치지 않는 이름: `이름` → `이름 (1)` (확장자가 있으면 그 앞에 번호). */
  private freeName(dir: string, name: string): string {
    if (!this.nodes.has(joinPath(dir, name))) return name;
    const dot = name.lastIndexOf(".");
    for (let n = 1; ; n++) {
      const numbered = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
      if (!this.nodes.has(joinPath(dir, numbered))) return numbered;
    }
  }

  /** Rust `default_zip_name`과 같은 규칙: 하나면 그 이름(파일은 확장자 제외), 여럿이면 압축 위치의 폴더 이름. */
  private compress(sources: string[], destDir: string, name?: string) {
    sources.forEach((s) => this.need(s));
    this.need(destDir);
    const first = this.need(sources[0]);
    const one = baseName(sources[0]);
    const dot = one.lastIndexOf(".");
    const stem = sources.length === 1 ? (first.kind === "dir" || dot <= 0 ? one : one.slice(0, dot)) : baseName(destDir) || "archive";
    const dest = joinPath(destDir, this.freeName(destDir, name ?? `${stem}.zip`));
    // 결과는 `PK`로 시작하는 파일이고, 안쪽(`dest!`)에 원본 사본이 있어 아카이브로 열 수 있다.
    this.nodes.set(dest, { kind: "file", content: "PK" });
    this.nodes.set(`${dest}!`, { kind: "dir", content: "" });
    for (const s of sources) {
      for (const k of this.subtree(s)) {
        this.nodes.set(`${dest}!/${baseName(s)}${k.slice(s.length)}`, { ...this.nodes.get(k)! });
      }
    }
    this.notify(destDir);
  }

  /** 아카이브(`<경로>!` 아래) 안의 파일 수. 아카이브가 아니면 0. */
  private archiveFileCount(src: string): number {
    const root = `${src}!/`;
    return [...this.nodes].filter(([k, n]) => k.startsWith(root) && n.kind === "file").length;
  }

  private extract(src: string, destDir: string) {
    if (this.need(src).kind !== "file" || !this.nodes.has(`${src}!`)) throw new BackendError(`아카이브가 아닙니다: ${src}`);
    this.need(destDir);
    const file = baseName(src);
    const stem = file.replace(/\.(tar\.gz|tar\.bz2|tgz|tbz2|tbz|tar)$/i, "").replace(/\.[^.]+$/, "") || `${file} 추출`;
    const dest = joinPath(destDir, this.freeName(destDir, stem));
    this.nodes.set(dest, { kind: "dir", content: "" });
    const root = `${src}!`;
    for (const [k, n] of [...this.nodes]) {
      if (k.startsWith(`${root}/`)) this.nodes.set(dest + k.slice(root.length), { ...n });
    }
    this.notify(destDir);
  }

  async createSymlink(src: string, destDir: string, policy: ConflictDto) {
    this.need(src);
    this.need(destDir);
    if (this.symlinkError) throw new BackendError(this.symlinkError);
    const dest = this.resolveDest(src, destDir, policy);
    if (dest === null) return null;
    this.nodes.set(dest, { kind: "file", content: "", link: src });
    this.notify(destDir);
    return dest;
  }

  /** Rust `td_ops::duplicate_name`과 같은 규칙: `a.txt` → `a copy.txt` → `a copy 2.txt`. */
  private duplicate(src: string) {
    this.need(src);
    const name = baseName(src);
    const dir = parentPath(src) ?? "/";
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let dest: string;
    for (let n = 1; ; n++) {
      dest = joinPath(dir, n === 1 ? `${stem} copy${ext}` : `${stem} copy ${n}${ext}`);
      if (!this.nodes.has(dest)) break;
    }
    for (const k of this.subtree(src)) this.nodes.set(dest + k.slice(src.length), { ...this.nodes.get(k)! });
    this.notify(dir);
  }

  private finish(job: FakeJob) {
    job.dto.current = null;
    job.dto.status = job.dto.errors.length ? "failed" : "done";
  }

  /** 수동 모드: 실행할 수 있는 가장 오래된 작업의 항목 하나를 실행한다. 실행했으면 true. */
  async advance(): Promise<boolean> {
    const job = [...this.jobs.values()].find((j) => ["queued", "running"].includes(j.dto.status));
    if (!job) return false;
    job.dto.status = "running";
    const item = job.items[job.dto.completed];
    job.dto.current = item.src;
    try {
      await this.runItem(job.dto.kind, item);
    } catch (e) {
      job.dto.errors.push({ path: item.src, message: e instanceof Error ? e.message : String(e) });
    }
    job.dto.completed += 1;
    job.dto.filesDone = job.dto.kind === "extract" ? Math.min(job.dto.filesTotal ?? 0, job.dto.filesDone + this.archiveFileCount(item.src)) : job.dto.filesDone + 1;
    if (job.dto.completed >= job.dto.total) this.finish(job);
    this.notifyQueue();
    return true;
  }

  async enqueue(kind: JobKindDto, items: QueueItemDto[]) {
    const id = this.nextJobId++;
    const job: FakeJob = {
      items,
      dto: { id, kind, status: "queued", total: items.length, completed: 0, filesTotal: kind === "extract" ? items.reduce((n, i) => n + this.archiveFileCount(i.src), 0) : ["copy", "move", "delete", "trash"].includes(kind) ? items.length : null, filesDone: 0, bytesTotal: null, bytesDone: 0, current: null, errors: [] },
    };
    this.jobs.set(id, job);
    this.notifyQueue();
    if (this.queueMode === "instant") {
      job.dto.status = "running";
      for (const item of items) {
        job.dto.current = item.src;
        try {
          await this.runItem(kind, item);
        } catch (e) {
          job.dto.errors.push({ path: item.src, message: e instanceof Error ? e.message : String(e) });
        }
        job.dto.completed += 1;
        job.dto.filesDone = kind === "extract" ? Math.min(job.dto.filesTotal ?? 0, job.dto.filesDone + this.archiveFileCount(item.src)) : job.dto.filesDone + 1;
      }
      this.finish(job);
      this.notifyQueue();
    }
    return id;
  }

  async queueJobs() {
    return this.snapshot();
  }

  /** 테스트용: 작업이 지금 복사 중인 파일의 바이트 진행을 알린 것처럼 만든다(실제 백엔드는 복사 중에 채운다). */
  reportBytes(id: number, done: number, total: number) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.dto.bytesDone = done;
    j.dto.bytesTotal = total;
    this.notifyQueue();
  }

  async queuePause(id: number) {
    const j = this.jobs.get(id);
    if (j && ["queued", "running"].includes(j.dto.status)) j.dto.status = "paused";
    this.notifyQueue();
  }

  async queueResume(id: number) {
    const j = this.jobs.get(id);
    if (j?.dto.status === "paused") j.dto.status = j.dto.completed > 0 ? "running" : "queued";
    this.notifyQueue();
  }

  async queueAbort(id: number) {
    const j = this.jobs.get(id);
    if (j && !["done", "failed", "aborted"].includes(j.dto.status)) {
      j.dto.status = "aborted";
      j.dto.current = null;
    }
    this.notifyQueue();
  }

  async queueClearFinished() {
    for (const [id, j] of this.jobs) {
      if (["done", "failed", "aborted"].includes(j.dto.status)) this.jobs.delete(id);
    }
    this.notifyQueue();
  }

  onQueueChanged(callback: (jobs: JobDto[]) => void) {
    this.queueListeners.add(callback);
    return () => void this.queueListeners.delete(callback);
  }

  async copy(src: string, destDir: string, policy: ConflictDto): Promise<OutcomeDto> {
    this.need(src);
    this.need(destDir);
    this.guardInside(src, destDir);
    const dest = this.resolveDest(src, destDir, policy);
    if (dest === null) return { type: "skipped" };
    for (const k of this.subtree(src)) {
      this.nodes.set(dest + k.slice(src.length), { ...this.nodes.get(k)! });
    }
    this.notify(destDir);
    return { type: "done", path: dest };
  }

  async move(src: string, destDir: string, policy: ConflictDto): Promise<OutcomeDto> {
    this.need(src);
    this.guardInside(src, destDir);
    if (parentPath(src) === destDir) return { type: "skipped" };
    const dest = this.resolveDest(src, destDir, policy);
    if (dest === null) return { type: "skipped" };
    for (const k of this.subtree(src)) {
      this.nodes.set(dest + k.slice(src.length), this.nodes.get(k)!);
      this.nodes.delete(k);
    }
    this.notify(destDir, parentPath(src));
    return { type: "done", path: dest };
  }

  async rename(path: string, newName: string) {
    if (!newName || /[/\\\0]/.test(newName) || newName === "." || newName === "..") {
      throw new BackendError(`잘못된 이름: ${newName}`);
    }
    this.need(path);
    const parent = parentPath(path) ?? "/";
    const dest = joinPath(parent, newName);
    if (this.nodes.has(dest)) throw new BackendError(`이미 존재함: ${dest}`);
    for (const k of this.subtree(path)) {
      this.nodes.set(dest + k.slice(path.length), this.nodes.get(k)!);
      this.nodes.delete(k);
    }
    this.notify(parent);
    return dest;
  }

  async trash(path: string) {
    this.need(path);
    if (isArchivePath(path)) throw new BackendError(`${path}: 아카이브 안에서는 휴지통을 쓸 수 없습니다 (영구 삭제만 가능)`);
    this.ensureDir(TRASH);
    this.trashed.push(path);
    for (const k of this.subtree(path)) {
      this.nodes.set(TRASH + k, this.nodes.get(k)!);
      this.nodes.delete(k);
    }
    this.notify(parentPath(path));
  }

  async deletePermanent(path: string) {
    this.need(path);
    this.subtree(path).forEach((k) => this.nodes.delete(k));
    this.notify(parentPath(path));
  }

  async watch(path: string) {
    this.watched.add(path);
  }

  async unwatch(path: string) {
    this.watched.delete(path);
  }

  onDirChanged(callback: (path: string) => void) {
    this.listeners.add(callback);
    return () => void this.listeners.delete(callback);
  }
}
