import type { EntryDto, JobDto, JobKindDto, Loaded, QueueItemDto, UserDirsDto, VolumeDto } from "./generated/bindings";

/** Rust 쪽이 돌려준 오류 문자열을 감싼 예외. */
export class BackendError extends Error {}

/**
 * UI가 파일시스템에 접근하는 유일한 통로.
 * 실제 앱은 `TauriBackend`, UI 테스트는 `FakeBackend`를 쓴다.
 */
export interface Backend {
  /** 폴더 먼저, 이름순으로 정렬된 목록. */
  listDir(path: string, showHidden: boolean): Promise<EntryDto[]>;
  mkdir(path: string): Promise<void>;
  touch(path: string): Promise<void>;
  /** `destDir`에 `src`와 같은 이름이 이미 있으면 그 경로. */
  detectConflict(src: string, destDir: string): Promise<string | null>;
  rename(path: string, newName: string): Promise<string>;
  /** 복사/이동/휴지통/삭제를 작업 큐에 넣는다. 작업 id를 돌려준다. */
  enqueue(kind: JobKindDto, items: QueueItemDto[]): Promise<number>;
  queueJobs(): Promise<JobDto[]>;
  queuePause(id: number): Promise<void>;
  queueResume(id: number): Promise<void>;
  queueAbort(id: number): Promise<void>;
  /** 끝난 작업을 목록에서 지운다. */
  queueClearFinished(): Promise<void>;
  /** 마운트된 볼륨. 루트가 첫 항목이다. */
  listVolumes(): Promise<VolumeDto[]>;
  /** 언마운트/추출. 루트나 목록에 없는 경로는 거부된다. */
  unmountVolume(mountPoint: string): Promise<void>;
  ejectVolume(mountPoint: string): Promise<void>;
  /** `~`와 `${user.*}` 확장에 쓰는 사용자 폴더. */
  userDirs(): Promise<UserDirsDto>;
  /** 즐겨찾기를 config.toml에 덧붙인다(설정 감시가 재로딩한다). */
  addFavorite(name: string, path: string): Promise<void>;
  /** 현재 설정(기본값 병합 결과)과 키바인딩, 경고. */
  getConfig(): Promise<Loaded>;
  /** 설정 파일이 바뀔 때마다 호출된다. 문법 오류면 이전 유효 설정과 경고가 온다. */
  onConfigChanged(callback: (loaded: Loaded) => void): () => void;
  /** 큐 상태가 바뀔 때마다 전체 스냅샷과 함께 호출된다. */
  onQueueChanged(callback: (jobs: JobDto[]) => void): () => void;
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  /** 감시 중인 디렉터리가 바뀌면 호출된다. 구독 해제 함수를 돌려준다. */
  onDirChanged(callback: (path: string) => void): () => void;
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

export function parentPath(path: string): string | null {
  const i = path.lastIndexOf("/");
  if (i < 0) return null;
  return i === 0 ? (path.length > 1 ? "/" : null) : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * `~`, `~/x`, `${user.downloads}/x` 같은 경로를 실제 경로로 바꾼다.
 * 필요한 사용자 폴더를 알 수 없으면 null. 변수가 없는 경로는 그대로 돌려준다.
 */
export function expandPath(path: string, dirs: UserDirsDto): string | null {
  if (path === "~") return dirs.home;
  if (path.startsWith("~/")) return dirs.home ? dirs.home + path.slice(1) : null;
  const m = /^\$\{user\.(home|downloads|documents|desktop|pictures|music|movies)\}(.*)$/.exec(path);
  if (m) {
    const base = dirs[m[1] as keyof UserDirsDto];
    return base ? base + m[2] : null;
  }
  return path;
}
