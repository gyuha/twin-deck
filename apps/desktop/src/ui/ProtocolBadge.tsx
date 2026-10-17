import type { ConnectionProtocol } from "../state/store";

/** 연결 종류별 글자와 색. FTP는 암호화되지 않아서 경고색이다. */
const BADGES: Record<ConnectionProtocol, { text: string; color: string }> = {
  smb: { text: "SMB", color: "border-status-info/40 bg-status-info/15 text-status-info" },
  sftp: { text: "SFTP", color: "border-status-success/40 bg-status-success/15 text-status-success" },
  ftp: { text: "FTP", color: "border-status-warning/40 bg-status-warning/15 text-status-warning" },
  twindeck: { text: "Twin Deck", color: "border-accent/40 bg-accent/15 text-accent" },
};

/**
 * 연결 종류(SMB·SFTP·FTP·Twin Deck)를 알리는 작은 알약 배지(shadcn badge 모양). 연결 메뉴의 항목 이름 앞에 붙는다(이슈 #95).
 * 색만으로 구분하지 않도록 글자를 늘 함께 쓰며, 화면 읽기 프로그램도 읽도록 `aria-hidden`을 달지 않는다.
 */
export function ProtocolBadge({ protocol }: { protocol: ConnectionProtocol }) {
  const b = BADGES[protocol];
  return (
    <span data-protocol-badge={protocol} className={`mr-0.5 inline-flex shrink-0 items-center rounded-full border px-2 text-[11px] font-medium leading-4 ${b.color}`}>
      {b.text}
    </span>
  );
}
