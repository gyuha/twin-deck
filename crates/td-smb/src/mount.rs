//! OS에 SMB 공유를 마운트한다. macOS는 NetFS, Windows는 WNet API.
//! 비밀번호는 API 인자로만 넘긴다(명령줄에 싣지 않는다 — `ps`로 보이지 않게).

use std::path::PathBuf;

use crate::{SmbError, SmbTarget};

/// 공유를 마운트하고 마운트 지점을 돌려준다.
pub trait Mounter {
    /// 블로킹 함수다. 네트워크 상태에 따라 수 초 이상 걸릴 수 있으니 UI 스레드에서 부르지 않는다.
    fn mount(&self, target: &SmbTarget, password: Option<&str>) -> Result<PathBuf, SmbError>;
}

/// 실제 OS 마운트. macOS는 `/Volumes` 아래, Windows는 빈 드라이브 문자에 연결한다.
/// 그 밖의 OS는 `Unsupported`. 인증 창 같은 시스템 UI는 띄우지 않는다.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemMounter;

impl Mounter for SystemMounter {
    fn mount(&self, target: &SmbTarget, password: Option<&str>) -> Result<PathBuf, SmbError> {
        imp::mount(target, password)
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::ffi::c_int;
    use std::path::PathBuf;
    use std::ptr;

    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFMutableDictionary, CFMutableDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};
    use core_foundation::url::{CFURLRef, CFURL};
    use core_foundation_sys::url::CFURLCreateWithString;

    use crate::url::smb_url;
    use crate::{SmbError, SmbTarget};

    #[link(name = "NetFS", kind = "framework")]
    extern "C" {
        fn NetFSMountURLSync(
            url: CFURLRef,
            mountpath: CFURLRef,
            user: CFStringRef,
            passwd: CFStringRef,
            open_options: CFMutableDictionaryRef,
            mount_options: CFMutableDictionaryRef,
            mountpoints: *mut CFArrayRef,
        ) -> c_int;
    }

    // NetFS.h의 CFSTR 매크로 값.
    const UI_OPTION_KEY: &str = "UIOption"; // kNAUIOptionKey
    const UI_OPTION_NO_UI: &str = "NoUI"; // kNAUIOptionNoUI
    const USE_GUEST_KEY: &str = "Guest"; // kNetFSUseGuestKey

    // NetFS.h의 계정·비밀번호 정책 오류.
    const ENETFSACCOUNTRESTRICTED: c_int = -5999;
    const ENETFSPWDNEEDSCHANGE: c_int = -5998;
    const ENETFSPWDPOLICY: c_int = -5997;

    pub(super) fn map_error(code: c_int) -> SmbError {
        match code {
            libc::EAUTH
            | libc::EACCES
            | ENETFSACCOUNTRESTRICTED
            | ENETFSPWDNEEDSCHANGE
            | ENETFSPWDPOLICY => SmbError::Auth,
            libc::EHOSTUNREACH
            | libc::ENETUNREACH
            | libc::ETIMEDOUT
            | libc::EHOSTDOWN
            | libc::ECONNREFUSED
            | libc::ENOENT => SmbError::Unreachable,
            _ => SmbError::Other(format!(
                "NetFS 오류 {code} ({})",
                std::io::Error::from_raw_os_error(code)
            )),
        }
    }

    pub(super) fn mount(target: &SmbTarget, password: Option<&str>) -> Result<PathBuf, SmbError> {
        let url_str = CFString::new(&smb_url(target));
        // SAFETY: url_str은 살아 있는 CFString이다. 반환값은 Create 규칙이라 소유권을 가져가며,
        // NULL이면(잘못된 URL) 감싸지 않는다.
        let url = unsafe {
            let raw =
                CFURLCreateWithString(ptr::null(), url_str.as_concrete_TypeRef(), ptr::null());
            if raw.is_null() {
                return Err(SmbError::Other(format!("잘못된 SMB 주소: {url_str}")));
            }
            CFURL::wrap_under_create_rule(raw)
        };

        let user = target.user().map(CFString::new);
        let password = password.map(CFString::new);

        let mut open_options: CFMutableDictionary<CFString, CFType> = CFMutableDictionary::new();
        open_options.set(
            CFString::new(UI_OPTION_KEY),
            CFString::new(UI_OPTION_NO_UI).as_CFType(),
        );
        if user.is_none() {
            open_options.set(
                CFString::new(USE_GUEST_KEY),
                CFBoolean::true_value().as_CFType(),
            );
        }

        let mut mountpoints: CFArrayRef = ptr::null();
        // SAFETY: 모든 CF 인자는 이 함수가 끝날 때까지 살아 있는 객체이거나 NULL이다(NetFS는 NULL을
        // 허용한다: mountpath NULL → /Volumes, user/passwd NULL → 게스트·저장된 자격 증명).
        // mountpoints는 성공 시 Create 규칙의 CFArray로 채워지며 아래에서 소유권을 가져간다.
        let code = unsafe {
            NetFSMountURLSync(
                url.as_concrete_TypeRef(),
                ptr::null(),
                user.as_ref()
                    .map_or(ptr::null(), |u| u.as_concrete_TypeRef()),
                password
                    .as_ref()
                    .map_or(ptr::null(), |p| p.as_concrete_TypeRef()),
                open_options.as_concrete_TypeRef(),
                ptr::null_mut(),
                &mut mountpoints,
            )
        };
        // 실패해도 배열이 채워졌을 수 있으니 먼저 소유권을 가져가 해제되게 한다.
        let mountpoints = (!mountpoints.is_null()).then(|| {
            // SAFETY: NetFS가 돌려준 NULL 아닌 CFArray(Create 규칙). 원소는 CFString이다.
            unsafe { CFArray::<CFString>::wrap_under_create_rule(mountpoints) }
        });
        if code != 0 {
            return Err(map_error(code));
        }
        mountpoints
            .as_ref()
            .and_then(|a| a.get(0).map(|s| PathBuf::from(s.to_string())))
            .ok_or_else(|| SmbError::Other("마운트 지점을 받지 못했습니다".into()))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn 인증_오류_코드는_auth() {
            for code in [libc::EAUTH, libc::EACCES, -5999, -5998, -5997] {
                assert_eq!(map_error(code), SmbError::Auth, "{code}");
            }
        }

        #[test]
        fn 네트워크_오류_코드는_unreachable() {
            for code in [
                libc::EHOSTUNREACH,
                libc::ENETUNREACH,
                libc::ETIMEDOUT,
                libc::EHOSTDOWN,
                libc::ECONNREFUSED,
                libc::ENOENT,
            ] {
                assert_eq!(map_error(code), SmbError::Unreachable, "{code}");
            }
        }

        #[test]
        fn 그_밖의_코드는_other() {
            assert!(matches!(map_error(libc::EINVAL), SmbError::Other(m) if m.contains("22")));
        }
    }
}

/// WNet 오류 코드(winerror.h). macOS에서도 매핑을 시험하려고 숫자로 둔다.
#[cfg(any(windows, test))]
mod win_codes {
    pub const ERROR_ACCESS_DENIED: u32 = 5;
    pub const ERROR_BAD_NETPATH: u32 = 53;
    pub const ERROR_BAD_NET_NAME: u32 = 67;
    pub const ERROR_INVALID_PASSWORD: u32 = 86;
    pub const ERROR_NO_NET_OR_BAD_PATH: u32 = 1203;
    pub const ERROR_LOGON_FAILURE: u32 = 1326;

    use crate::SmbError;

    pub fn map_error(code: u32) -> SmbError {
        match code {
            ERROR_ACCESS_DENIED | ERROR_LOGON_FAILURE | ERROR_INVALID_PASSWORD => SmbError::Auth,
            ERROR_BAD_NETPATH | ERROR_NO_NET_OR_BAD_PATH | ERROR_BAD_NET_NAME => {
                SmbError::Unreachable
            }
            _ => SmbError::Other(format!(
                "Windows 오류 {code} ({})",
                std::io::Error::from_raw_os_error(code as i32)
            )),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn windows_오류_코드_매핑() {
            for code in [
                ERROR_ACCESS_DENIED,
                ERROR_LOGON_FAILURE,
                ERROR_INVALID_PASSWORD,
            ] {
                assert_eq!(map_error(code), SmbError::Auth, "{code}");
            }
            for code in [
                ERROR_BAD_NETPATH,
                ERROR_NO_NET_OR_BAD_PATH,
                ERROR_BAD_NET_NAME,
            ] {
                assert_eq!(map_error(code), SmbError::Unreachable, "{code}");
            }
            assert!(matches!(map_error(1219), SmbError::Other(m) if m.contains("1219")));
        }
    }
}

#[cfg(windows)]
mod imp {
    use std::path::PathBuf;
    use std::ptr;

    use windows_sys::Win32::Foundation as F;
    use windows_sys::Win32::NetworkManagement::WNet::{
        WNetUseConnectionW, CONNECT_LOCALDRIVE, CONNECT_REDIRECT, NETRESOURCEW, RESOURCETYPE_DISK,
    };

    use super::win_codes::{self, map_error};
    use crate::url::unc_path;
    use crate::{SmbError, SmbTarget};

    // 숫자로 둔 코드가 windows-sys 값과 같은지 컴파일 때 확인한다.
    const _: () = {
        assert!(win_codes::ERROR_ACCESS_DENIED == F::ERROR_ACCESS_DENIED);
        assert!(win_codes::ERROR_BAD_NETPATH == F::ERROR_BAD_NETPATH);
        assert!(win_codes::ERROR_BAD_NET_NAME == F::ERROR_BAD_NET_NAME);
        assert!(win_codes::ERROR_INVALID_PASSWORD == F::ERROR_INVALID_PASSWORD);
        assert!(win_codes::ERROR_NO_NET_OR_BAD_PATH == F::ERROR_NO_NET_OR_BAD_PATH);
        assert!(win_codes::ERROR_LOGON_FAILURE == F::ERROR_LOGON_FAILURE);
    };

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub(super) fn mount(target: &SmbTarget, password: Option<&str>) -> Result<PathBuf, SmbError> {
        let unc = unc_path(target);
        let mut remote = wide(&unc);
        let user = target.user().map(wide);
        let password = password.map(wide);

        // SAFETY: NETRESOURCEW는 정수와 포인터만 담은 C 구조체라 0으로 채워도 유효하다.
        let mut res: NETRESOURCEW = unsafe { std::mem::zeroed() };
        res.dwType = RESOURCETYPE_DISK;
        // lpLocalName NULL + CONNECT_REDIRECT → 시스템이 빈 드라이브 문자를 고른다.
        res.lpRemoteName = remote.as_mut_ptr();

        let mut access = [0u16; 64];
        let mut size = access.len() as u32;
        let mut result = 0u32;
        // SAFETY: res·remote·user·password·access는 호출 동안 살아 있고, 문자열은 NUL로 끝난다.
        // size는 access 버퍼의 u16 개수다.
        let code = unsafe {
            WNetUseConnectionW(
                ptr::null_mut(),
                &res,
                password.as_ref().map_or(ptr::null(), |p| p.as_ptr()),
                user.as_ref().map_or(ptr::null(), |u| u.as_ptr()),
                CONNECT_REDIRECT,
                access.as_mut_ptr(),
                &mut size,
                &mut result,
            )
        };
        if code != F::NO_ERROR {
            return Err(map_error(code));
        }
        if result & CONNECT_LOCALDRIVE == 0 {
            return Ok(PathBuf::from(unc));
        }
        let len = access.iter().position(|&c| c == 0).unwrap_or(access.len());
        let drive = String::from_utf16_lossy(&access[..len]);
        Ok(PathBuf::from(format!(r"{drive}\")))
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod imp {
    use std::path::PathBuf;

    use crate::{SmbError, SmbTarget};

    pub(super) fn mount(_: &SmbTarget, _: Option<&str>) -> Result<PathBuf, SmbError> {
        Err(SmbError::Unsupported)
    }
}
