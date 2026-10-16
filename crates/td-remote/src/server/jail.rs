//! 서버가 노출하는 폴더(루트)에 요청 경로를 가둔다. `..`·절대경로·심볼릭 링크로 루트 밖으로 나가는 요청은 거부한다.

use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Jail {
    root: PathBuf,
}

impl Jail {
    /// `root`는 존재하는 폴더여야 한다(실제 경로로 바꿔 기억한다).
    pub fn new(root: &Path) -> io::Result<Self> {
        Ok(Self {
            root: root.canonicalize()?,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 클라이언트의 `/` 표기 경로를 `/a/b` 꼴로 정리한다. `..`은 루트 위로 올라가지 못하고 루트에서 멈춘다.
    pub fn virtual_path(virt: &str) -> String {
        let mut parts: Vec<&str> = Vec::new();
        for p in virt.split('/').filter(|p| !p.is_empty() && *p != ".") {
            if p == ".." {
                parts.pop();
            } else {
                parts.push(p);
            }
        }
        format!("/{}", parts.join("/"))
    }

    /// 이미 실제 경로인 항목이 심볼릭 링크를 풀어도 루트 안인지 확인한다.
    pub fn resolve_real(&self, real: &Path) -> io::Result<PathBuf> {
        let canon = real.canonicalize()?;
        if canon.starts_with(&self.root) {
            Ok(canon)
        } else {
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        }
    }

    /// 요청 경로의 실제 경로. 심볼릭 링크를 풀었을 때 루트 밖이면 `PermissionDenied`.
    /// 아직 없는 경로(새 파일)는 가장 가까운 기존 상위 폴더로 검사한다.
    pub fn resolve(&self, virt: &str) -> io::Result<PathBuf> {
        let virt = Self::virtual_path(virt);
        let real = self.root.join(virt.trim_start_matches('/'));
        let mut probe = real.as_path();
        loop {
            match probe.symlink_metadata() {
                Ok(_) => {
                    let canon = probe.canonicalize()?;
                    if !canon.starts_with(&self.root) {
                        return Err(io::Error::from(io::ErrorKind::PermissionDenied));
                    }
                    return Ok(real);
                }
                Err(e) if e.kind() == io::ErrorKind::NotFound => match probe.parent() {
                    Some(p) => probe = p,
                    None => return Err(io::Error::from(io::ErrorKind::PermissionDenied)),
                },
                Err(e) => return Err(e),
            }
        }
    }
}
