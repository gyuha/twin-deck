//! 서버의 SFTP 서브시스템. 모든 경로는 `Jail`을 거치고, `allow_write`가 꺼져 있으면 쓰기 계열을 거부한다.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::PathBuf;

use russh_sftp::protocol::{
    Attrs, Data, File, FileAttributes, Handle, Name, OpenFlags, Status, StatusCode, Version,
};

use super::jail::Jail;

enum Open {
    File(fs::File),
    Dir(PathBuf, bool),
}

pub struct SftpHandler {
    jail: Jail,
    allow_write: bool,
    handles: HashMap<String, Open>,
    next: u32,
}

fn ok(id: u32) -> Status {
    Status {
        id,
        status_code: StatusCode::Ok,
        error_message: "Ok".into(),
        language_tag: "en-US".into(),
    }
}

fn code(e: &std::io::Error) -> StatusCode {
    match e.kind() {
        std::io::ErrorKind::NotFound => StatusCode::NoSuchFile,
        std::io::ErrorKind::PermissionDenied => StatusCode::PermissionDenied,
        _ => StatusCode::Failure,
    }
}

impl SftpHandler {
    pub fn new(jail: Jail, allow_write: bool) -> Self {
        Self {
            jail,
            allow_write,
            handles: HashMap::new(),
            next: 0,
        }
    }

    fn real(&self, virt: &str) -> Result<PathBuf, StatusCode> {
        self.jail.resolve(virt).map_err(|e| code(&e))
    }

    fn writable(&self) -> Result<(), StatusCode> {
        if self.allow_write {
            Ok(())
        } else {
            Err(StatusCode::PermissionDenied)
        }
    }

    fn new_handle(&mut self, open: Open) -> String {
        self.next += 1;
        let h = format!("h{}", self.next);
        self.handles.insert(h.clone(), open);
        h
    }
}

impl russh_sftp::server::Handler for SftpHandler {
    type Error = StatusCode;

    fn unimplemented(&self) -> Self::Error {
        StatusCode::OpUnsupported
    }

    async fn init(&mut self, _v: u32, _e: HashMap<String, String>) -> Result<Version, Self::Error> {
        Ok(Version::new())
    }

    async fn realpath(&mut self, id: u32, path: String) -> Result<Name, Self::Error> {
        Ok(Name {
            id,
            files: vec![File::dummy(Jail::virtual_path(&path))],
        })
    }

    async fn stat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        let m = fs::metadata(self.real(&path)?).map_err(|e| code(&e))?;
        Ok(Attrs {
            id,
            attrs: FileAttributes::from(&m),
        })
    }

    async fn lstat(&mut self, id: u32, path: String) -> Result<Attrs, Self::Error> {
        self.stat(id, path).await
    }

    async fn fstat(&mut self, id: u32, handle: String) -> Result<Attrs, Self::Error> {
        match self.handles.get(&handle) {
            Some(Open::File(f)) => Ok(Attrs {
                id,
                attrs: FileAttributes::from(&f.metadata().map_err(|e| code(&e))?),
            }),
            _ => Err(StatusCode::Failure),
        }
    }

    async fn opendir(&mut self, id: u32, path: String) -> Result<Handle, Self::Error> {
        let real = self.real(&path)?;
        if !real.is_dir() {
            return Err(StatusCode::NoSuchFile);
        }
        Ok(Handle {
            id,
            handle: self.new_handle(Open::Dir(real, false)),
        })
    }

    async fn readdir(&mut self, id: u32, handle: String) -> Result<Name, Self::Error> {
        let Some(Open::Dir(dir, done)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        if *done {
            return Err(StatusCode::Eof);
        }
        *done = true;
        let mut files = Vec::new();
        for e in fs::read_dir(&*dir).map_err(|e| code(&e))?.flatten() {
            // 루트 밖을 가리키는 심볼릭 링크는 목록에서 감춘다.
            if self.jail.resolve_real(&e.path()).is_err() {
                continue;
            }
            let Ok(m) = fs::metadata(e.path()) else {
                continue;
            };
            files.push(File::new(
                e.file_name().to_string_lossy(),
                FileAttributes::from(&m),
            ));
        }
        Ok(Name { id, files })
    }

    async fn open(
        &mut self,
        id: u32,
        filename: String,
        pflags: OpenFlags,
        _a: FileAttributes,
    ) -> Result<Handle, Self::Error> {
        let wants_write = pflags.intersects(
            OpenFlags::WRITE | OpenFlags::APPEND | OpenFlags::CREATE | OpenFlags::TRUNCATE,
        );
        if wants_write {
            self.writable()?;
        }
        let real = self.real(&filename)?;
        let f = fs::OpenOptions::from(pflags)
            .open(&real)
            .map_err(|e| code(&e))?;
        Ok(Handle {
            id,
            handle: self.new_handle(Open::File(f)),
        })
    }

    async fn close(&mut self, id: u32, handle: String) -> Result<Status, Self::Error> {
        self.handles.remove(&handle);
        Ok(ok(id))
    }

    async fn read(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        len: u32,
    ) -> Result<Data, Self::Error> {
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(|e| code(&e))?;
        let mut buf = vec![0u8; len as usize];
        let n = f.read(&mut buf).map_err(|e| code(&e))?;
        if n == 0 {
            return Err(StatusCode::Eof);
        }
        buf.truncate(n);
        Ok(Data { id, data: buf })
    }

    async fn write(
        &mut self,
        id: u32,
        handle: String,
        offset: u64,
        data: Vec<u8>,
    ) -> Result<Status, Self::Error> {
        self.writable()?;
        let Some(Open::File(f)) = self.handles.get_mut(&handle) else {
            return Err(StatusCode::Failure);
        };
        f.seek(SeekFrom::Start(offset)).map_err(|e| code(&e))?;
        f.write_all(&data).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn remove(&mut self, id: u32, filename: String) -> Result<Status, Self::Error> {
        self.writable()?;
        fs::remove_file(self.real(&filename)?).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn mkdir(
        &mut self,
        id: u32,
        path: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        self.writable()?;
        fs::create_dir(self.real(&path)?).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn rmdir(&mut self, id: u32, path: String) -> Result<Status, Self::Error> {
        self.writable()?;
        fs::remove_dir(self.real(&path)?).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn rename(&mut self, id: u32, old: String, new: String) -> Result<Status, Self::Error> {
        self.writable()?;
        fs::rename(self.real(&old)?, self.real(&new)?).map_err(|e| code(&e))?;
        Ok(ok(id))
    }

    async fn setstat(
        &mut self,
        _id: u32,
        _p: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        // 권한·시간 변경은 지원하지 않는다(쓰기 허용 여부와 상관없이 거부).
        Err(StatusCode::PermissionDenied)
    }

    async fn fsetstat(
        &mut self,
        _id: u32,
        _h: String,
        _a: FileAttributes,
    ) -> Result<Status, Self::Error> {
        Err(StatusCode::PermissionDenied)
    }
}
