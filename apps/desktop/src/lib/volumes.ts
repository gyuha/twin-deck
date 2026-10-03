import type { VolumeDto } from "@twin-deck/ts-client";

/** `path`가 마운트 경로 `mountPoint` 자체이거나 그 안쪽인가. 문자열 접두가 아니라 경로 경계로 판단한다(`/Volumes/USB2`는 `/Volumes/USB` 밖). */
export function isInside(path: string, mountPoint: string): boolean {
  if (mountPoint === "/") return true;
  const mp = mountPoint.replace(/\/+$/, "");
  return path === mp || path.startsWith(`${mp}/`);
}

/** 경로가 놓인 볼륨: 경로를 포함하는 마운트 경로 중 가장 긴 것. 어느 것에도 속하지 않으면 null. */
export function volumeOf(path: string, volumes: readonly VolumeDto[]): VolumeDto | null {
  let best: VolumeDto | null = null;
  for (const v of volumes) {
    if (isInside(path, v.mountPoint) && (best === null || v.mountPoint.length > best.mountPoint.length)) best = v;
  }
  return best;
}
