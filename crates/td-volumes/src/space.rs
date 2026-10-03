/// 경로가 놓인 파일시스템의 용량(바이트).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiskSpace {
    /// 일반 사용자가 쓸 수 있는 남은 양.
    pub free: u64,
    pub total: u64,
}

/// `path`가 속한 파일시스템의 남은 용량과 전체 용량. 경로가 없거나 조회할 수 없으면 오류.
// statvfs 필드 타입은 OS마다 다르다(macOS의 블록 수는 u32, Linux는 u64). 캐스트가 한쪽에서는 불필요해 보여도 이식에 필요하다.
#[cfg(unix)]
#[allow(clippy::unnecessary_cast)]
pub fn disk_space(path: &str) -> Result<DiskSpace, String> {
    use std::ffi::CString;

    let c = CString::new(path).map_err(|_| format!("{path}: 경로에 NUL 문자가 있습니다"))?;
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c`는 NUL로 끝나는 유효한 C 문자열이고 `st`는 쓸 수 있는 statvfs 구조체다.
    let rc = unsafe { libc::statvfs(c.as_ptr(), &mut st) };
    if rc != 0 {
        return Err(format!("{path}: {}", std::io::Error::last_os_error()));
    }
    let unit = st.f_frsize as u64;
    Ok(DiskSpace {
        free: (st.f_bavail as u64).saturating_mul(unit),
        total: (st.f_blocks as u64).saturating_mul(unit),
    })
}

#[cfg(not(unix))]
pub fn disk_space(_path: &str) -> Result<DiskSpace, String> {
    Err("이 OS에서는 용량 조회를 지원하지 않습니다".into())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn disk_space_reports_total_and_free() {
        // 흉내가 아니라 실제 statvfs 호출이다: 임시 폴더가 놓인 파일시스템의 값을 본다.
        let tmp = tempfile::tempdir().unwrap();
        let s = disk_space(tmp.path().to_str().unwrap()).unwrap();
        assert!(s.total > 0, "전체 용량이 0이다: {s:?}");
        assert!(s.free > 0, "남은 용량이 0이다: {s:?}");
        assert!(s.free <= s.total, "남은 양이 전체보다 크다: {s:?}");
    }

    #[test]
    fn disk_space_missing_path_is_error() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("nope");
        let err = disk_space(missing.to_str().unwrap()).unwrap_err();
        assert!(err.contains("nope"), "{err}");
        assert!(disk_space("a\0b").is_err());
    }
}
