/** 저장된 네트워크 연결(SMB·SFTP·FTP·Twin Deck Remote)과 탭을 잇는 순수 함수(이슈 #92·#93). */
import { remoteServerId, splitRemote } from "@twin-deck/ts-client";
import type { Config } from "@twin-deck/ts-client";
import { isInside } from "./volumes";

/** 색을 달리 칠하는 특수 탭의 종류. `remote`는 SFTP·FTP, `twindeck`은 앱 내장 서버(Twin Deck Remote)다. */
export type TabKind = "terminal" | "smb" | "remote" | "twindeck";
export const TAB_KINDS: readonly TabKind[] = ["terminal", "smb", "remote", "twindeck"];

export interface Connection {
  kind: Exclude<TabKind, "terminal">;
  /** 설정의 이모지. 비어 있으면 붙이지 않는다. */
  icon: string;
  /** SMB면 마운트 위치, 원격이면 연결의 루트(`sftp://<id>/`). */
  root: string;
}

type Servers = Pick<Config, "smb" | "remote">;

/**
 * `path`가 놓인 저장된 연결. 원격 경로는 연결 id가 같은 서버 항목이고(항목이 없어도 SFTP·FTP 연결로 본다),
 * 로컬 경로는 `smbMounts`(항목 순서대로의 마운트 위치) 중 경로를 포함하는 가장 긴 것이다. 어디에도 속하지 않으면 null.
 */
export function connectionOf(path: string, config: Servers, smbMounts: readonly (string | null)[]): Connection | null {
  const remote = splitRemote(path);
  if (remote) {
    const server = (config.remote.servers ?? []).find((s) => remoteServerId(s) === remote.id);
    return { kind: server?.protocol === "twindeck" ? "twindeck" : "remote", icon: server?.icon ?? "", root: `${remote.scheme}://${remote.id}/` };
  }
  let best = -1;
  smbMounts.forEach((m, i) => {
    if (m && isInside(path, m) && (best < 0 || m.length > smbMounts[best]!.length)) best = i;
  });
  if (best < 0) return null;
  return { kind: "smb", icon: config.smb.servers?.[best]?.icon ?? "", root: smbMounts[best]! };
}

/** 탭이 특수 탭이면 그 종류와 붙일 이모지. 터미널 탭은 연 위치(원격이면 그 연결)의 이모지를 쓴다. 그 밖의 가상 탭(검색 결과 등)은 일반 탭이다. */
export function tabConnection(
  tab: { path: string; virtual?: { kind: string; base: string } },
  config: Servers,
  smbMounts: readonly (string | null)[],
): { kind: TabKind; icon: string } | null {
  if (tab.virtual?.kind === "terminal") return { kind: "terminal", icon: connectionOf(tab.virtual.base, config, smbMounts)?.icon ?? "" };
  if (tab.virtual) return null;
  return connectionOf(tab.path, config, smbMounts);
}

/** 이모지가 있으면 이름 앞에 한 칸 띄워 붙인다. */
export const withIcon = (icon: string | undefined, label: string) => (icon ? `${icon} ${label}` : label);
