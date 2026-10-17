import { RUST_REMOTE_DISCONNECTED } from "../i18n";

/**
 * 원격 연결이 끊겨서 목록을 못 읽는 오류인가(이슈 #98). Rust가 보내는 문구(`RUST_REMOTE_DISCONNECTED`)로 알아본다.
 * 권한 없음 같은 다른 오류는 끊김이 아니다.
 */
export const isRemoteDisconnected = (message: string | null | undefined): boolean => !!message && RUST_REMOTE_DISCONNECTED.some((m) => message.includes(m));
