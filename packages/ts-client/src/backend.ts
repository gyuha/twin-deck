import type { ConflictDto, EntryDto, OutcomeDto } from "./generated/bindings";

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
  copy(src: string, destDir: string, policy: ConflictDto): Promise<OutcomeDto>;
  move(src: string, destDir: string, policy: ConflictDto): Promise<OutcomeDto>;
  rename(path: string, newName: string): Promise<string>;
  trash(path: string): Promise<void>;
  deletePermanent(path: string): Promise<void>;
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
