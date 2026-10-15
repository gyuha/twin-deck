//! 이미 마운트된 공유 찾기. `td-volumes`의 볼륨 목록은 바꾸지 않고 필요한 조회만 한다.

use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use unicode_normalization::UnicodeNormalization;

use crate::SmbTarget;

/// 비교용 정규화: 퍼센트 디코딩 → NFC → 소문자.
fn norm(s: &str) -> String {
    percent_decode_str(s)
        .decode_utf8_lossy()
        .nfc()
        .collect::<String>()
        .to_lowercase()
}

/// macOS 마운트 원본(`f_mntfromname`, 예: `//user@host/share`, `//host/share`)이 대상과 같은 공유인지.
/// host·share는 대소문자를 무시하고, 퍼센트 인코딩·NFD를 풀어 비교한다.
/// 어느 한쪽에 사용자가 없으면 사용자는 비교하지 않는다.
pub fn mntfrom_matches(from: &str, target: &SmbTarget) -> bool {
    let Some(rest) = from.strip_prefix("//") else {
        return false;
    };
    let Some((authority, share)) = rest.split_once('/') else {
        return false;
    };
    let (user, host) = match authority.rsplit_once('@') {
        // `user:password@host` 꼴도 있다(게스트는 `GUEST:@host`).
        Some((info, host)) => (info.split(':').next().filter(|u| !u.is_empty()), host),
        None => (None, authority),
    };
    let users_match = match (target.user(), user) {
        (Some(a), Some(b)) => norm(a) == norm(b),
        _ => true,
    };
    users_match
        && norm(host) == norm(&target.host)
        && norm(share.trim_end_matches('/')) == norm(&target.share)
}

/// Windows 드라이브의 연결 원본(UNC `\\host\share`)이 대상과 같은 공유인지. 사용자는 UNC에 없다.
pub fn unc_matches(unc: &str, target: &SmbTarget) -> bool {
    let Some(rest) = unc.strip_prefix(r"\\") else {
        return false;
    };
    let Some((host, share)) = rest.split_once('\\') else {
        return false;
    };
    norm(host) == norm(&target.host) && norm(share.trim_end_matches('\\')) == norm(&target.share)
}

/// 대상 공유가 이미 마운트돼 있으면 그 마운트 지점(macOS `/Volumes/..`, Windows `Z:\`).
pub fn find_mounted(target: &SmbTarget) -> Option<PathBuf> {
    imp::find_mounted(target)
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::CStr;
    use std::path::PathBuf;

    use super::mntfrom_matches;
    use crate::SmbTarget;

    pub(super) fn find_mounted(target: &SmbTarget) -> Option<PathBuf> {
        // SAFETY: 버퍼 NULL이면 마운트 개수만 돌려준다.
        let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
        if count <= 0 {
            return None;
        }
        // 그 사이에 마운트가 늘 수 있어 여유를 둔다.
        let cap = count as usize + 8;
        // SAFETY: statfs는 정수·문자 배열만 담은 C 구조체라 0으로 채워도 유효하다.
        let mut buf: Vec<libc::statfs> = vec![unsafe { std::mem::zeroed() }; cap];
        let bytes = (cap * std::mem::size_of::<libc::statfs>()) as libc::c_int;
        // SAFETY: buf는 cap개의 statfs를 담을 수 있고 bytes는 그 크기다.
        let n = unsafe { libc::getfsstat(buf.as_mut_ptr(), bytes, libc::MNT_NOWAIT) };
        if n <= 0 {
            return None;
        }
        buf.truncate(n as usize);
        buf.iter().find_map(|fs| {
            // SAFETY: 커널이 채운 필드는 NUL로 끝나는 C 문자열이다.
            let (ty, from, on) = unsafe {
                (
                    CStr::from_ptr(fs.f_fstypename.as_ptr()),
                    CStr::from_ptr(fs.f_mntfromname.as_ptr()),
                    CStr::from_ptr(fs.f_mntonname.as_ptr()),
                )
            };
            (ty.to_bytes() == b"smbfs" && mntfrom_matches(&from.to_string_lossy(), target))
                .then(|| PathBuf::from(on.to_string_lossy().into_owned()))
        })
    }
}

#[cfg(windows)]
mod imp {
    use std::path::PathBuf;

    use windows_sys::Win32::Foundation::NO_ERROR;
    use windows_sys::Win32::NetworkManagement::WNet::WNetGetConnectionW;
    use windows_sys::Win32::Storage::FileSystem::GetLogicalDrives;

    use super::unc_matches;
    use crate::SmbTarget;

    pub(super) fn find_mounted(target: &SmbTarget) -> Option<PathBuf> {
        // SAFETY: 인자가 없고 드라이브 비트마스크만 돌려준다.
        let mask = unsafe { GetLogicalDrives() };
        (0..26u8).filter(|i| mask & (1 << i) != 0).find_map(|i| {
            let letter = (b'A' + i) as char;
            let local: Vec<u16> = format!("{letter}:").encode_utf16().chain([0]).collect();
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            // SAFETY: local은 NUL로 끝나고, buf는 len개의 u16을 담을 수 있다.
            let code = unsafe { WNetGetConnectionW(local.as_ptr(), buf.as_mut_ptr(), &mut len) };
            if code != NO_ERROR {
                return None;
            }
            let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            let unc = String::from_utf16_lossy(&buf[..end]);
            unc_matches(&unc, target).then(|| PathBuf::from(format!(r"{letter}:\")))
        })
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    use std::path::PathBuf;

    use crate::SmbTarget;

    pub(super) fn find_mounted(_: &SmbTarget) -> Option<PathBuf> {
        None
    }
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
    fn 사용자_포함_원본이_맞으면_참() {
        let target = t("nas.local", "media", Some("kim"));
        assert!(mntfrom_matches("//kim@nas.local/media", &target));
        assert!(!mntfrom_matches("//lee@nas.local/media", &target));
    }

    #[test]
    fn 호스트와_공유는_대소문자를_무시한다() {
        let target = t("NAS.local", "Media", Some("Kim"));
        assert!(mntfrom_matches("//kim@nas.LOCAL/MEDIA", &target));
        assert!(unc_matches(r"\\nas.LOCAL\MEDIA", &target));
    }

    #[test]
    fn 어느_한쪽에_사용자가_없으면_사용자는_비교하지_않는다() {
        assert!(mntfrom_matches(
            "//nas/media",
            &t("nas", "media", Some("kim"))
        ));
        assert!(mntfrom_matches("//kim@nas/media", &t("nas", "media", None)));
        assert!(mntfrom_matches(
            "//GUEST:@nas/media",
            &t("nas", "media", None)
        ));
    }

    #[test]
    fn 퍼센트_인코딩과_nfd를_풀어_비교한다() {
        let nfd: String = "사진".nfd().collect();
        let target = t("nas", "My 사진", Some("CORP;kim"));
        assert!(mntfrom_matches(
            "//CORP%3Bkim@nas/My%20%EC%82%AC%EC%A7%84",
            &target
        ));
        assert!(mntfrom_matches(
            &format!("//CORP;kim@nas/My {nfd}"),
            &target
        ));
        assert!(unc_matches(&format!(r"\\nas\My {nfd}"), &target));
    }

    #[test]
    fn 다른_호스트나_공유면_거짓() {
        let target = t("nas", "media", None);
        assert!(!mntfrom_matches("//other/media", &target));
        assert!(!mntfrom_matches("//nas/media2", &target));
        assert!(!mntfrom_matches("//nas/media/sub", &target));
        assert!(!unc_matches(r"\\nas\other", &target));
        assert!(!unc_matches(r"\\other\media", &target));
    }

    #[test]
    fn 형식이_아니면_거짓() {
        let target = t("nas", "media", None);
        assert!(!mntfrom_matches("/dev/disk1s1", &target));
        assert!(!mntfrom_matches("//nas", &target));
        assert!(!unc_matches("C:", &target));
        assert!(!unc_matches(r"\\nas", &target));
    }

    #[test]
    fn 끝의_구분자는_무시한다() {
        let target = t("nas", "media", None);
        assert!(mntfrom_matches("//nas/media/", &target));
        assert!(unc_matches(r"\\nas\media\", &target));
    }
}
