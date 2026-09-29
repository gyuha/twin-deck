import { BackendError, baseName, joinPath, parentPath } from "./backend";
import type { Backend } from "./backend";
import type { ConflictDto, EntryDto, JobDto, JobKindDto, QueueItemDto } from "./generated/bindings";

/** FakeBackend 내부의 복사/이동 결과. */
type OutcomeDto = { type: "done"; path: string } | { type: "skipped" };

interface Node {
  kind: "file" | "dir";
  content: string;
}

const TRASH = "/.trash";

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
    return [...this.nodes.keys()].filter((k) => k === path || k.startsWith(`${path}/`));
  }

  /** 실제 상태 확인용. */
  exists(path: string): boolean {
    return this.nodes.has(path);
  }

  read(path: string): string {
    return this.need(path).content;
  }

  async listDir(path: string, showHidden: boolean): Promise<EntryDto[]> {
    if (this.need(path).kind !== "dir") throw new BackendError(`폴더가 아님: ${path}`);
    const prefix = path === "/" ? "/" : `${path}/`;
    const out: EntryDto[] = [];
    for (const [p, n] of this.nodes) {
      if (p === path || !p.startsWith(prefix) || p.slice(prefix.length).includes("/")) continue;
      const name = baseName(p);
      const hidden = name.startsWith(".");
      if (hidden && !showHidden) continue;
      out.push({ name, path: p, kind: n.kind, size: n.content.length, modifiedMs: 0, hidden });
    }
    out.sort((a, b) => {
      if ((a.kind === "dir") !== (b.kind === "dir")) return a.kind === "dir" ? -1 : 1;
      // Rust의 compare_names와 같은 규칙: NFC + 소문자 후 코드 순서 비교.
      const ka = a.name.normalize("NFC").toLowerCase();
      const kb = b.name.normalize("NFC").toLowerCase();
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return out;
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

  private snapshot(): JobDto[] {
    return [...this.jobs.values()].map((j) => ({ ...j.dto, errors: [...j.dto.errors] }));
  }

  private notifyQueue() {
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
      case "trash":
        await this.trash(item.src);
        break;
      case "delete":
        await this.deletePermanent(item.src);
        break;
    }
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
    if (job.dto.completed >= job.dto.total) this.finish(job);
    this.notifyQueue();
    return true;
  }

  async enqueue(kind: JobKindDto, items: QueueItemDto[]) {
    const id = this.nextJobId++;
    const job: FakeJob = {
      items,
      dto: { id, kind, status: "queued", total: items.length, completed: 0, current: null, errors: [] },
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
      }
      this.finish(job);
      this.notifyQueue();
    }
    return id;
  }

  async queueJobs() {
    return this.snapshot();
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
