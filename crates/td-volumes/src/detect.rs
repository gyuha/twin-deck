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
                if path.is_dir() {
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
