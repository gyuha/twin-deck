import type { VolumeDto } from "@twin-deck/ts-client";

/**
 * `path`가 마운트 경로 `mountPoint` 자체이거나 그 안쪽인가. 문자열 접두가 아니라 경로 경계로 판단한다(`/Volumes/USB2`는 `/Volumes/USB` 밖).
 * Windows 드라이브(`C:\`)는 `\`와 `/`를 모두 구분자로 보고 대소문자를 가리지 않는다. macOS는 OS가 주는 NFD 마운트 경로와 UI의 NFC 경로를 같게 본다.
 */
export function isInside(path: string, mountPoint: string): boolean {
  if (mountPoint === "/") return true;
  const drive = /^[A-Za-z]:/.test(mountPoint);
  const norm = (t: string) => (drive ? t.toLowerCase() : t.normalize("NFC"));
  const mp = norm(mountPoint).replace(drive ? /[\\/]+$/ : /\/+$/, "");
  const p = norm(path);
  if (p === mp) return true;
  const next = p.charAt(mp.length);
  return p.startsWith(mp) && (next === "/" || (drive && next === "\\"));
}

/** 경로가 놓인 볼륨: 경로를 포함하는 마운트 경로 중 가장 긴 것. 어느 것에도 속하지 않으면 null. */
export function volumeOf(path: string, volumes: readonly VolumeDto[]): VolumeDto | null {
  let best: VolumeDto | null = null;
  for (const v of volumes) {
    if (isInside(path, v.mountPoint) && (best === null || v.mountPoint.length > best.mountPoint.length)) best = v;
  }
  return best;
}
