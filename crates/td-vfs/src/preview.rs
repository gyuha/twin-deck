//! 미리보기용 읽기 (VIEW-01): 텍스트는 앞부분만, 이미지는 data URL로, 그 밖은 종류만 판별한다.

use std::fs::{self, File};
use std::io::Read;

use base64::Engine;

use crate::{Result, VfsError, VfsPath};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewKind {
    Text,
    Image,
    /// 사운드 파일. 한도 안이면 `data:audio/...;base64,...`로 싣는다(재생은 화면이 한다).
    Audio,
    /// PDF. 한도 안이면 `data:application/pdf;base64,...`로 싣는다.
    Pdf,
    Directory,
    /// 텍스트도 이미지도 아니다(바이너리 등). 종류와 크기만 보여 준다.
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preview {
    pub kind: PreviewKind,
    /// 텍스트의 앞부분.
    pub text: Option<String>,
    /// 파일이 읽은 양보다 크다(텍스트를 잘랐거나 이미지가 너무 커서 싣지 않았다).
    pub truncated: bool,
    pub size: u64,
    /// `data:image/png;base64,...`. 이미지가 한도 안일 때만.
    pub data_url: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct PreviewLimits {
    pub text_bytes: usize,
    pub image_bytes: u64,
    pub pdf_bytes: u64,
    pub audio_bytes: u64,
}

impl Default for PreviewLimits {
    fn default() -> Self {
        Self {
            text_bytes: 64 * 1024,
            image_bytes: 10 * 1024 * 1024,
            pdf_bytes: 10 * 1024 * 1024,
            audio_bytes: 20 * 1024 * 1024,
        }
    }
}

/// 확장자로 이미지 MIME을 판별한다. 이미지가 아니면 None.
pub fn image_mime(name: &str) -> Option<&'static str> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

/// 확장자로 오디오 MIME을 판별한다. 오디오가 아니면 None.
pub fn audio_mime(name: &str) -> Option<&'static str> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "weba" => "audio/webm",
        _ => return None,
    })
}

/// 이미지 바이트를 `data:image/…;base64,…`로 만든다. 이름의 확장자가 이미지가 아니면 None.
pub fn image_data_url(name: &str, bytes: &[u8]) -> Option<String> {
    let mime = image_mime(name)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{b64}"))
}

/// 경로(심볼릭 링크는 따라간다)의 미리보기를 읽는다. 파일 전체를 읽지 않는다.
pub fn read_preview(path: &VfsPath, limits: PreviewLimits) -> Result<Preview> {
    let meta = fs::metadata(path.as_path()).map_err(|e| VfsError::io(path, e))?;
    let size = meta.len();
    let base = |kind| Preview {
        kind,
        text: None,
        truncated: false,
        size,
        data_url: None,
    };
    if meta.is_dir() {
        return Ok(base(PreviewKind::Directory));
    }
    let name = path.file_name().unwrap_or_default();

    if let Some(mime) = image_mime(&name) {
        if size > limits.image_bytes {
            return Ok(Preview {
                truncated: true,
                ..base(PreviewKind::Image)
            });
        }
        let bytes = fs::read(path.as_path()).map_err(|e| VfsError::io(path, e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(Preview {
            data_url: Some(format!("data:{mime};base64,{b64}")),
            ..base(PreviewKind::Image)
        });
    }

    if let Some(mime) = audio_mime(&name) {
        if size > limits.audio_bytes {
            return Ok(Preview {
                truncated: true,
                ..base(PreviewKind::Audio)
            });
        }
        let bytes = fs::read(path.as_path()).map_err(|e| VfsError::io(path, e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(Preview {
            data_url: Some(format!("data:{mime};base64,{b64}")),
            ..base(PreviewKind::Audio)
        });
    }

    if name.to_ascii_lowercase().ends_with(".pdf") {
        if size > limits.pdf_bytes {
            return Ok(Preview {
                truncated: true,
                ..base(PreviewKind::Pdf)
            });
        }
        let bytes = fs::read(path.as_path()).map_err(|e| VfsError::io(path, e))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        return Ok(Preview {
            data_url: Some(format!("data:application/pdf;base64,{b64}")),
            ..base(PreviewKind::Pdf)
        });
    }

    // 최대 text_bytes + 3바이트를 읽어, 잘린 자리가 여러 바이트 글자의 중간이어도 앞부분을 온전히 보여 준다.
    let mut buf = Vec::new();
    File::open(path.as_path())
        .and_then(|f| f.take(limits.text_bytes as u64 + 3).read_to_end(&mut buf))
        .map_err(|e| VfsError::io(path, e))?;
    let cut = buf.len().min(limits.text_bytes);
    let truncated = size > limits.text_bytes as u64;
    if buf[..cut].contains(&0) {
        return Ok(base(PreviewKind::Other));
    }
    // 앞부분이 유효한 UTF-8이면 텍스트. 잘림 때문에 끝이 깨진 경우만 허용한다.
    let text = match std::str::from_utf8(&buf[..cut]) {
        Ok(s) => s,
        Err(e) if truncated && e.error_len().is_none() => {
            std::str::from_utf8(&buf[..e.valid_up_to()]).unwrap_or("")
        }
        Err(_) => return Ok(base(PreviewKind::Other)),
    };
    Ok(Preview {
        text: Some(text.to_string()),
        truncated,
        ..base(PreviewKind::Text)
    })
}
