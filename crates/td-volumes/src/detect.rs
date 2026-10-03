use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Volume {
    pub name: String,
    pub mount_point: String,
}

/// 사용자에게 보여 줄 의미가 없는 가상/시스템 파일시스템.
const PSEUDO_FS: &[&str] = &[
    "proc",
    "sysfs",
    "devtmpfs",
    "devpts",
    "tmpfs",
    "cgroup",
    "cgroup2",
    "pstore",
    "bpf",
    "debugfs",
    "tracefs",
    "securityfs",
    "configfs",
    "fusectl",
    "mqueue",
    "hugetlbfs",
    "autofs",
    "binfmt_misc",
    "overlay",
    "squashfs",
    "ramfs",
    "efivarfs",
    "rpc_pipefs",
    "nsfs",
];

/// `/proc/self/mountinfo` 내용을 볼륨 목록으로 바꾼다. 순수 함수라 모든 OS에서 테스트할 수 있다.
/// 형식: `id parent major:minor root mountpoint options [optional...] - fstype source superopts`
pub fn parse_mountinfo(text: &str) -> Vec<Volume> {
    let mut out: Vec<Volume> = Vec::new();
    for line in text.lines() {
        let Some((head, tail)) = line.split_once(" - ") else {
            continue;
        };
        let head: Vec<&str> = head.split(' ').collect();
        let tail: Vec<&str> = tail.split(' ').collect();
        if head.len() < 5 || tail.is_empty() {
            continue;
        }
        let mount_point = unescape(head[4]);
        let fstype = tail[0];
        if PSEUDO_FS.contains(&fstype) {
            continue;
        }
        // /run, /snap 같은 시스템 마운트는 숨긴다.
        if ["/run", "/snap", "/sys", "/proc", "/dev", "/boot"]
            .iter()
            .any(|p| mount_point == *p || mount_point.starts_with(&format!("{p}/")))
            && mount_point != "/run/media"
            && !mount_point.starts_with("/run/media/")
        {
            continue;
        }
        if out.iter().any(|v| v.mount_point == mount_point) {
            continue;
        }
        let name = if mount_point == "/" {
            "/".to_string()
        } else {
            Path::new(&mount_point)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| mount_point.clone())
        };
        out.push(Volume { name, mount_point });
    }
    out
}

/// mountinfo는 공백 등을 `\040` 같은 8진수 이스케이프로 쓴다.
fn unescape(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\'
            && i + 3 < b.len()
            && b[i + 1..i + 4].iter().all(|c| (b'0'..=b'7').contains(c))
        {
            let v = u32::from(b[i + 1] - b'0') * 64
                + u32::from(b[i + 2] - b'0') * 8
                + u32::from(b[i + 3] - b'0');
            out.push(v as u8);
            i += 4;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 마운트 플래그에 `MNT_DONTBROWSE`(Finder에 보이지 않음, `nobrowse`)가 있는가. 조회할 수 없으면 숨기지 않는다.
#[cfg(target_os = "macos")]
fn is_hidden_mount(path: &Path) -> bool {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let Ok(c) = CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    let mut st: libc::statfs = unsafe { std::mem::zeroed() };
    // SAFETY: `c`는 NUL로 끝나는 유효한 C 문자열이고 `st`는 쓸 수 있는 statfs 구조체다.
    let rc = unsafe { libc::statfs(c.as_ptr(), &mut st) };
    rc == 0 && st.f_flags & libc::MNT_DONTBROWSE as u32 != 0
}

/// 현재 OS의 마운트된 볼륨. 루트가 항상 첫 항목이다.
pub fn list_volumes() -> Vec<Volume> {
    #[cfg(target_os = "macos")]
    {
        let mut out = vec![Volume {
            name: "/".into(),
            mount_point: "/".into(),
        }];
        if let Ok(rd) = std::fs::read_dir("/Volumes") {
            let mut names: Vec<_> = rd.filter_map(|e| e.ok()).collect();
            names.sort_by_key(|e| e.file_name());
            for e in names {
                let path = e.path();
                // `/Volumes/Macintosh HD` 같은 루트로 가는 심볼릭 링크는 중복이다.
                if std::fs::canonicalize(&path).is_ok_and(|p| p == Path::new("/")) {
                    continue;
                }
                // Recovery, Preboot처럼 Finder에도 보이지 않게 마운트된(nobrowse) 시스템 볼륨은 사용자가 고를 대상이 아니다.
                if path.is_dir() && !is_hidden_mount(&path) {
                    out.push(Volume {
                        name: e.file_name().to_string_lossy().into_owned(),
                        mount_point: path.to_string_lossy().into_owned(),
                    });
                }
            }
        }
        out
    }
    #[cfg(target_os = "linux")]
    {
        let text = std::fs::read_to_string("/proc/self/mountinfo").unwrap_or_default();
        let mut out = parse_mountinfo(&text);
        if !out.iter().any(|v| v.mount_point == "/") {
            out.insert(
                0,
                Volume {
                    name: "/".into(),
                    mount_point: "/".into(),
                },
            );
        }
        out
    }
    #[cfg(windows)]
    {
        // 드라이브 문자. UNC 경로는 아직 다루지 않는다.
        ('A'..='Z')
            .map(|c| format!("{c}:\\"))
            .filter(|p| Path::new(p).exists())
            .map(|p| Volume {
                name: p.clone(),
                mount_point: p,
            })
            .collect()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
    {
        vec![Volume {
            name: "/".into(),
            mount_point: "/".into(),
        }]
    }
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    use super::*;

    #[test]
    fn nobrowse_system_volumes_are_hidden_and_root_is_not() {
        // 실제 마운트 플래그를 읽는다: Data 볼륨은 nobrowse이고 루트는 아니다.
        assert!(is_hidden_mount(Path::new("/System/Volumes/Data")));
        assert!(!is_hidden_mount(Path::new("/")));
        assert!(
            !is_hidden_mount(Path::new("/no/such/path")),
            "조회할 수 없으면 숨기지 않는다"
        );
        // 목록에는 루트가 있고, nobrowse 볼륨은 하나도 없다.
        let vols = list_volumes();
        assert_eq!(vols[0].mount_point, "/");
        assert!(
            vols.iter()
                .all(|v| !is_hidden_mount(Path::new(&v.mount_point))),
            "{vols:?}"
        );
    }
}
