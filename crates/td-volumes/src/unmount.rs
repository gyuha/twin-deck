use std::process::Command;

use crate::detect::{list_volumes, Volume};

#[derive(Debug, thiserror::Error)]
pub enum UnmountError {
    #[error("마운트된 볼륨이 아닙니다: {0}")]
    NotAVolume(String),
    #[error("루트 볼륨은 언마운트할 수 없습니다")]
    Root,
    #[error("이동식/네트워크 드라이브가 아니라서 꺼낼 수 없습니다: {0}")]
    NotRemovable(String),
    #[error("이 OS에서는 지원하지 않습니다")]
    Unsupported,
    #[error("명령 실행 실패: {0}")]
    Command(String),
}

/// 실제 언마운트/추출을 수행한다. 테스트는 fake를 쓴다.
pub trait Unmounter {
    fn unmount(&self, mount_point: &str) -> Result<(), UnmountError>;
    fn eject(&self, mount_point: &str) -> Result<(), UnmountError>;
}

fn run(program: &str, args: &[&str]) -> Result<(), UnmountError> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: 콘솔 창이 깜빡이지 않게 한다
    }
    let out = cmd
        .output()
        .map_err(|e| UnmountError::Command(format!("{program}: {e}")))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(UnmountError::Command(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ))
    }
}

/// Windows 드라이브의 종류. `GetDriveTypeW` 결과를 나눈 것이다.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DriveKind {
    Removable,
    Network,
    Fixed,
    Other,
}

/// `GetDriveTypeW`의 반환 코드(DRIVE_REMOVABLE=2, DRIVE_FIXED=3, DRIVE_REMOTE=4)를 종류로 바꾼다.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn drive_kind_from_code(code: u32) -> DriveKind {
    match code {
        2 => DriveKind::Removable,
        3 => DriveKind::Fixed,
        4 => DriveKind::Network,
        _ => DriveKind::Other,
    }
}

/// Windows에서 `mount_point`(`E:\`)를 꺼낼 명령을 만든다. 이동식은 셸의 꺼내기, 네트워크는 연결 끊기.
/// 고정 디스크와 그 밖의 드라이브는 거부한다.
#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) fn windows_eject_command(
    mount_point: &str,
    kind: DriveKind,
) -> Result<(&'static str, Vec<String>), UnmountError> {
    let bytes = mount_point.as_bytes();
    if bytes.len() < 2 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return Err(UnmountError::NotAVolume(mount_point.to_string()));
    }
    let drive = format!("{}:", mount_point[..1].to_ascii_uppercase());
    match kind {
        DriveKind::Removable => Ok((
            "powershell",
            vec![
                "-NoProfile".into(),
                "-Command".into(),
                format!("(New-Object -comObject Shell.Application).Namespace(17).ParseName('{drive}').InvokeVerb('Eject')"),
            ],
        )),
        DriveKind::Network => Ok(("net", vec!["use".into(), drive, "/delete".into(), "/y".into()])),
        DriveKind::Fixed | DriveKind::Other => Err(UnmountError::NotRemovable(mount_point.to_string())),
    }
}

#[cfg(windows)]
fn windows_unmount(mount_point: &str) -> Result<(), UnmountError> {
    use std::os::windows::ffi::OsStrExt;
    use std::time::{Duration, Instant};

    let wide: Vec<u16> = std::ffi::OsStr::new(mount_point)
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: `wide`는 NUL로 끝나는 유효한 UTF-16 문자열이다.
    let code = unsafe { windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(wide.as_ptr()) };
    let (program, args) = windows_eject_command(mount_point, drive_kind_from_code(code))?;
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    run(program, &args)?;
    // 셸 꺼내기는 사용 중이어도 성공으로 끝난다. 드라이브가 실제로 사라졌는지 잠시 기다려 본다.
    let deadline = Instant::now() + Duration::from_secs(3);
    while std::path::Path::new(mount_point).exists() {
        if Instant::now() >= deadline {
            return Err(UnmountError::Command(format!(
                "{mount_point}: 아직 사용 중이어서 꺼내지 못했습니다. 열려 있는 파일이나 창을 닫고 다시 시도하세요"
            )));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Ok(())
}

#[cfg(not(windows))]
fn windows_unmount(_mount_point: &str) -> Result<(), UnmountError> {
    Err(UnmountError::Unsupported)
}

/// OS 명령을 호출하는 구현 (macOS `diskutil`, Linux `umount`, Windows는 셸 꺼내기/`net use`).
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemUnmounter;

impl Unmounter for SystemUnmounter {
    fn unmount(&self, mount_point: &str) -> Result<(), UnmountError> {
        if cfg!(target_os = "macos") {
            run("diskutil", &["unmount", mount_point])
        } else if cfg!(target_os = "linux") {
            run("umount", &[mount_point])
        } else if cfg!(windows) {
            windows_unmount(mount_point)
        } else {
            Err(UnmountError::Unsupported)
        }
    }

    fn eject(&self, mount_point: &str) -> Result<(), UnmountError> {
        if cfg!(target_os = "macos") {
            run("diskutil", &["eject", mount_point])
        } else if cfg!(target_os = "linux") {
            run("umount", &[mount_point])
        } else if cfg!(windows) {
            windows_unmount(mount_point)
        } else {
            Err(UnmountError::Unsupported)
        }
    }
}

/// 볼륨 목록과 언마운트를 묶은 진입점. 목록에 없는 경로나 루트는 실행하지 않는다.
pub struct Volumes<U: Unmounter> {
    unmounter: U,
    lister: fn() -> Vec<Volume>,
}

impl<U: Unmounter> Volumes<U> {
    pub fn new(unmounter: U) -> Self {
        Self {
            unmounter,
            lister: list_volumes,
        }
    }

    /// 볼륨 목록 함수를 바꾼다(테스트용).
    pub fn with_lister(unmounter: U, lister: fn() -> Vec<Volume>) -> Self {
        Self { unmounter, lister }
    }

    pub fn list(&self) -> Vec<Volume> {
        (self.lister)()
    }

    fn check(&self, mount_point: &str) -> Result<(), UnmountError> {
        if mount_point == "/" {
            return Err(UnmountError::Root);
        }
        if !self.list().iter().any(|v| v.mount_point == mount_point) {
            return Err(UnmountError::NotAVolume(mount_point.to_string()));
        }
        Ok(())
    }

    pub fn unmount(&self, mount_point: &str) -> Result<(), UnmountError> {
        self.check(mount_point)?;
        self.unmounter.unmount(mount_point)
    }

    pub fn eject(&self, mount_point: &str) -> Result<(), UnmountError> {
        self.check(mount_point)?;
        self.unmounter.eject(mount_point)
    }
}

#[cfg(test)]
mod windows_plan_tests {
    use super::*;

    #[test]
    fn 드라이브_종류는_코드로_나눈다() {
        assert_eq!(drive_kind_from_code(2), DriveKind::Removable);
        assert_eq!(drive_kind_from_code(3), DriveKind::Fixed);
        assert_eq!(drive_kind_from_code(4), DriveKind::Network);
        assert_eq!(drive_kind_from_code(5), DriveKind::Other); // CD-ROM
        assert_eq!(drive_kind_from_code(0), DriveKind::Other); // 알 수 없음
        assert_eq!(drive_kind_from_code(6), DriveKind::Other); // RAM 디스크
    }

    #[test]
    fn 이동식은_셸_꺼내기_명령을_만든다() {
        let (program, args) = windows_eject_command("E:\\", DriveKind::Removable).unwrap();
        assert_eq!(program, "powershell");
        let script = args.last().unwrap();
        assert!(
            script.contains("Namespace(17)")
                && script.contains("ParseName('E:')")
                && script.contains("Eject"),
            "{script}"
        );
    }

    #[test]
    fn 네트워크는_연결_끊기_명령을_만든다() {
        let (program, args) = windows_eject_command("Z:\\", DriveKind::Network).unwrap();
        assert_eq!(program, "net");
        assert_eq!(args, ["use", "Z:", "/delete", "/y"]);
    }

    #[test]
    fn 고정_디스크와_기타는_사유와_함께_거부한다() {
        for kind in [DriveKind::Fixed, DriveKind::Other] {
            let err = windows_eject_command("C:\\", kind).unwrap_err();
            assert!(matches!(err, UnmountError::NotRemovable(_)), "{err:?}");
            assert!(err.to_string().contains("C:\\"), "{err}");
        }
    }

    #[test]
    fn 드라이브_문자가_없는_경로는_볼륨이_아니다() {
        assert!(matches!(
            windows_eject_command("/mnt/x", DriveKind::Removable),
            Err(UnmountError::NotAVolume(_))
        ));
        assert!(matches!(
            windows_eject_command("", DriveKind::Network),
            Err(UnmountError::NotAVolume(_))
        ));
    }
}
