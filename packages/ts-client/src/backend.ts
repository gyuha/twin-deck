import type { ConfigValue, ConflictDto, DiskSpaceDto, EntryDto, FindSpecDto, FileInfoDto, JobDto, JobKindDto, Loaded, LoadedState, PreviewDto, QueueItemDto, SearchStartDto, SearchSummaryDto, Snapshot, UserDirsDto, VolumeDto } from "./generated/bindings";

/** Look Up / Flatten / Disk Usage가 스트리밍으로 보내는 이벤트. 작업마다 마지막은 `done`이다. */
export type SearchEvent =
  | { type: "chunk"; id: number; entries: EntryDto[] }
  /** Disk Usage의 크기 내림차순 전체 스냅샷. `done`이면 최종 결과다. `size`는 항목의 총 크기. */
  | { type: "usage"; id: number; items: EntryDto[]; done: boolean; totalBytes: number; files: number }
  | { type: "done"; id: number; summary: SearchSummaryDto };

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
  /** 압축 (OP-11): `sources`를 `destDir`의 ZIP 하나로 묶는 작업을 큐에 넣는다. 이름이 겹치면 번호를 붙이고 원본은 그대로 둔다. */
  enqueueCompress(sources: string[], destDir: string, name?: string): Promise<number>;
  /** 추출 (OP-11): 아카이브 `src`를 `destDir` 아래 아카이브 이름의 새 폴더에 안전하게 푸는 작업을 큐에 넣는다. */
  enqueueExtract(src: string, destDir: string): Promise<number>;
  /** 심볼릭 링크 만들기 (OP-12). 만든 링크의 경로, 정책이 건너뛰기라 만들지 않았으면 null. */
  createSymlink(src: string, destDir: string, policy: ConflictDto): Promise<string | null>;
  queueJobs(): Promise<JobDto[]>;
  queuePause(id: number): Promise<void>;
  queueResume(id: number): Promise<void>;
  queueAbort(id: number): Promise<void>;
  /** 끝난 작업을 목록에서 지운다. */
  queueClearFinished(): Promise<void>;
  /** 파일 정보 대화상자용 상세 정보. */
  fileInfo(path: string): Promise<FileInfoDto>;
  /** 이 창이 마지막으로 저장한 상태 (PANE-05). 없거나 읽을 수 없으면 snapshot이 null이고 경고가 올 수 있다. */
  loadState(): Promise<LoadedState>;
  saveState(snapshot: Snapshot): Promise<void>;
  /** 저장된 상태를 모두 지우고 앱을 종료한다. */
  resetState(): Promise<void>;
  /** 새 창을 열고 그 창의 레이블을 돌려준다 (PANE-03). */
  newWindow(): Promise<string>;
  /** 미리보기: 텍스트 앞부분, 이미지 data URL, 종류 판별. */
  preview(path: string): Promise<PreviewDto>;
  /** glob 패턴과 일치하는 이름의 인덱스 (Select Group). */
  globFilter(pattern: string, names: string[]): Promise<number[]>;
  /** 클립보드에 텍스트를 쓴다. */
  copyText(text: string): Promise<void>;
  /** 운영체제 파일 클립보드에 파일 경로 목록을 쓴다(Finder/탐색기에 붙여 넣을 수 있다). 빈 목록이면 비운다. */
  setClipboardFiles(paths: string[]): Promise<void>;
  /** 운영체제 파일 클립보드에 든 파일 경로(지금 있는 것만). 파일이 없으면 빈 목록. */
  getClipboardFiles(): Promise<string[]>;
  /** 파일 관리자에서 항목을 보여 준다. */
  revealPath(path: string): Promise<void>;
  /** 파일을 운영체제 기본 프로그램으로 실행한다. */
  openPath(path: string): Promise<void>;
  /** 설정한 편집기로 항목을 연다. */
  editPaths(paths: string[]): Promise<void>;
  /** 지정한 애플리케이션으로 항목(들)을 연다. 앱은 경로를 인수로 받는다. */
  launchApp(app: string, paths: string[]): Promise<void>;
  /** 확장자와 무관하게 파일을 아카이브로 연다 (ARC-04). 아카이브 루트 경로(`파일!`)를 돌려준다. */
  openAsArchive(path: string): Promise<string>;
  /** Look Up을 시작한다. 질의가 문법에 어긋나면 위치가 든 메시지로 거부된다. 결과는 `onSearchEvent`로 온다. */
  startLookup(root: string, query: string): Promise<SearchStartDto>;
  /** 파일 찾기(기본 탭의 조건). 잘못된 정규식 같은 조건 오류는 거부된다. 결과는 `onSearchEvent`로 온다. */
  startFind(spec: FindSpecDto): Promise<SearchStartDto>;
  /** `root` 아래의 모든 파일을 평면 목록으로 흘려 보낸다. */
  startFlatten(root: string): Promise<number>;
  /** `root`의 하위 항목별 총 크기를 계산해 크기 내림차순 스냅샷으로 흘려 보낸다. */
  startDiskUsage(root: string): Promise<number>;
  /** 실행 중인 검색/순회를 취소한다. 취소돼도 `done` 이벤트는 온다. */
  cancelSearch(id: number): Promise<void>;
  onSearchEvent(callback: (event: SearchEvent) => void): () => void;
  /** 마운트된 볼륨. 루트가 첫 항목이다. */
  listVolumes(): Promise<VolumeDto[]>;
  /** 경로가 놓인 파일시스템의 남은 용량과 전체 용량(바이트). 조회할 수 없으면 거부된다. */
  diskSpace(path: string): Promise<DiskSpaceDto>;
  /** 언마운트/추출. 루트나 목록에 없는 경로는 거부된다. */
  unmountVolume(mountPoint: string): Promise<void>;
  ejectVolume(mountPoint: string): Promise<void>;
  /** `~`와 `${user.*}` 확장에 쓰는 사용자 폴더. */
  userDirs(): Promise<UserDirsDto>;
  /** 즐겨찾기를 config.toml에 덧붙인다(설정 감시가 재로딩한다). */
  addFavorite(name: string, path: string): Promise<void>;
  /** 현재 설정(기본값 병합 결과)과 키바인딩, 경고. */
  getConfig(): Promise<Loaded>;
  /** 설정 화면: 사용자 config.toml의 키 하나(`behavior.theme` 같은 점 표기)를 쓰고, 새로 병합된 설정을 돌려준다. */
  setConfigValue(key: string, value: ConfigValue): Promise<Loaded>;
  /** 설정 화면: 사용자 config.toml에서 키를 지워 기본값으로 되돌리고, 새로 병합된 설정을 돌려준다. */
  resetConfigValue(key: string): Promise<Loaded>;
  /** 설정 폴더를 파일 관리자로 연다. */
  revealConfigDir(): Promise<void>;
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
