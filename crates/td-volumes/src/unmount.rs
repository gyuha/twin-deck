use std::process::Command;

use crate::detect::{list_volumes, Volume};

#[derive(Debug, thiserror::Error)]
pub enum UnmountError {
    #[error("마운트된 볼륨이 아닙니다: {0}")]
    NotAVolume(String),
    #[error("루트 볼륨은 언마운트할 수 없습니다")]
    Root,
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
    let out = Command::new(program)
        .args(args)
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

/// OS 명령을 호출하는 구현 (macOS `diskutil`, Linux `umount`).
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemUnmounter;

impl Unmounter for SystemUnmounter {
    fn unmount(&self, mount_point: &str) -> Result<(), UnmountError> {
        if cfg!(target_os = "macos") {
            run("diskutil", &["unmount", mount_point])
        } else if cfg!(target_os = "linux") {
            run("umount", &[mount_point])
        } else {
            Err(UnmountError::Unsupported)
        }
    }

    fn eject(&self, mount_point: &str) -> Result<(), UnmountError> {
        if cfg!(target_os = "macos") {
            run("diskutil", &["eject", mount_point])
        } else if cfg!(target_os = "linux") {
            run("umount", &[mount_point])
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
