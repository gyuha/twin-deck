//! `smb://` URL과 Windows UNC 경로 만들기(순수 함수).

use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use unicode_normalization::UnicodeNormalization;

use crate::SmbTarget;

/// URL 구성 요소에서 그대로 두는 문자: 영숫자와 RFC 3986 unreserved(`-._~`).
/// 그 밖(`;` `@` `:` `/` 공백 `%`, 한글 등)은 모두 퍼센트 인코딩한다.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

fn encode(s: &str) -> String {
    let nfc: String = s.nfc().collect();
    utf8_percent_encode(&nfc, COMPONENT).to_string()
}

/// `smb://[user@]host/share`. 사용자 이름과 공유 이름은 NFC로 맞춘 뒤 퍼센트 인코딩한다.
/// `host`(`host:port` 포함)는 그대로 둔다.
pub fn smb_url(target: &SmbTarget) -> String {
    let user = target
        .user()
        .map(|u| format!("{}@", encode(u)))
        .unwrap_or_default();
    format!("smb://{user}{}/{}", target.host, encode(&target.share))
}

/// Windows UNC 경로 `\\host\share`. 공유 이름은 NFC로 맞춘다.
pub fn unc_path(target: &SmbTarget) -> String {
    let share: String = target.share.nfc().collect();
    format!(r"\\{}\{}", target.host, share)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(host: &str, share: &str, user: Option<&str>) -> SmbTarget {
        SmbTarget {
            host: host.into(),
            share: share.into(),
            user: user.map(Into::into),
        }
    }

    #[test]
    fn 사용자가_없으면_호스트와_공유만() {
        assert_eq!(
            smb_url(&t("nas.local", "media", None)),
            "smb://nas.local/media"
        );
        assert_eq!(smb_url(&t("nas", "media", Some(""))), "smb://nas/media");
    }

    #[test]
    fn 사용자_이름의_세미콜론_골뱅이_콜론을_인코딩한다() {
        assert_eq!(
            smb_url(&t("nas", "media", Some("CORP;kim"))),
            "smb://CORP%3Bkim@nas/media"
        );
        assert_eq!(
            smb_url(&t("nas", "media", Some("kim@corp.com"))),
            "smb://kim%40corp.com@nas/media"
        );
        assert_eq!(smb_url(&t("nas", "m", Some("a:b"))), "smb://a%3Ab@nas/m");
    }

    #[test]
    fn 공유_이름의_공백과_한글을_인코딩한다() {
        assert_eq!(smb_url(&t("nas", "My Share", None)), "smb://nas/My%20Share");
        assert_eq!(
            smb_url(&t("nas", "사진", None)),
            "smb://nas/%EC%82%AC%EC%A7%84"
        );
    }

    #[test]
    fn 한글은_nfc로_맞춘_뒤_인코딩한다() {
        let nfd: String = "사진".nfd().collect();
        assert_ne!(nfd, "사진");
        assert_eq!(
            smb_url(&t("nas", &nfd, None)),
            smb_url(&t("nas", "사진", None))
        );
    }

    #[test]
    fn 호스트의_포트는_그대로_둔다() {
        assert_eq!(smb_url(&t("nas:1445", "m", None)), "smb://nas:1445/m");
    }

    #[test]
    fn unc_경로() {
        assert_eq!(
            unc_path(&t("nas", "My Share", Some("kim"))),
            r"\\nas\My Share"
        );
        let nfd: String = "사진".nfd().collect();
        assert_eq!(unc_path(&t("nas", &nfd, None)), r"\\nas\사진");
    }
}
