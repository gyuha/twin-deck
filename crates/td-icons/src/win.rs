//! Windows: `SHGetFileInfoW`로 `HICON`을 얻어 PNG로 낸다. 이 파일은 macOS에서는 컴파일·clippy만 확인한다(실행은 Windows 기기).
//! 크기는 아이콘의 실제 비트맵(작은 아이콘 16, 큰 아이콘 32)을 따른다.

use std::ffi::c_void;
use std::mem::size_of;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, HBITMAP, HDC,
};
use windows::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL, FILE_FLAGS_AND_ATTRIBUTES,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHFILEINFOW, SHGFI_FLAGS, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_SMALLICON,
    SHGFI_USEFILEATTRIBUTES,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

use crate::pixels::{apply_mask_alpha, bgra_to_rgba, encode_png, has_alpha};
use crate::{normalize_ext, IconSource};

fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    s.as_ref().encode_wide().chain(std::iter::once(0)).collect()
}

/// 이 스레드의 COM 초기화(셸의 아이콘 처리기가 요구한다). 이미 다른 모드로 초기화된 스레드면 건드리지 않는다.
struct Com(bool);

impl Com {
    fn init() -> Com {
        // SAFETY: 이 스레드에서 한 번 부르고, 성공했으면 `Drop`에서 짝으로 해제한다.
        Com(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok())
    }
}

impl Drop for Com {
    fn drop(&mut self) {
        if self.0 {
            // SAFETY: `init`이 성공했을 때만 부른다.
            unsafe { CoUninitialize() };
        }
    }
}

pub fn render(source: IconSource, size_px: u32) -> Option<Vec<u8>> {
    let _com = Com::init();
    // 확장자·폴더는 파일이 없어도 종류 아이콘을 얻는다(`SHGFI_USEFILEATTRIBUTES`). 경로는 실제 파일의 자기 아이콘이다.
    let (name, attrs, mut flags) = match source {
        IconSource::Folder => (
            wide("folder"),
            FILE_ATTRIBUTE_DIRECTORY,
            SHGFI_USEFILEATTRIBUTES,
        ),
        IconSource::Extension(ext) => {
            let ext = normalize_ext(ext);
            let name = if ext.is_empty() {
                "file".to_string()
            } else {
                format!("file.{ext}")
            };
            (wide(name), FILE_ATTRIBUTE_NORMAL, SHGFI_USEFILEATTRIBUTES)
        }
        IconSource::Path(p) => (
            wide(Path::new(p)),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            SHGFI_FLAGS(0),
        ),
    };
    flags |= SHGFI_ICON
        | if size_px <= 16 {
            SHGFI_SMALLICON
        } else {
            SHGFI_LARGEICON
        };
    let mut info = SHFILEINFOW::default();
    // SAFETY: `name`은 널로 끝나는 UTF-16이고 `info`는 `SHFILEINFOW` 크기로 넘긴다.
    let got = unsafe {
        SHGetFileInfoW(
            PCWSTR(name.as_ptr()),
            attrs,
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };
    if got == 0 || info.hIcon.is_invalid() {
        return None;
    }
    // SAFETY: `info.hIcon`은 방금 받은 유효한 아이콘이고, 변환이 끝나면 한 번만 해제한다.
    let png = unsafe { icon_to_png(info.hIcon) };
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }
    png
}

/// `HICON`을 PNG로. 색 비트맵이 없는 흑백 아이콘은 지원하지 않는다(`None`).
///
/// # Safety
/// `icon`은 유효한 `HICON`이어야 한다. 이 함수가 만든 비트맵 핸들은 모두 여기서 해제한다.
unsafe fn icon_to_png(icon: HICON) -> Option<Vec<u8>> {
    let mut ii = ICONINFO::default();
    GetIconInfo(icon, &mut ii).ok()?;
    let (color, mask) = (ii.hbmColor, ii.hbmMask);
    let dc = GetDC(None);
    let png = (|| {
        if color.is_invalid() {
            return None;
        }
        let mut bm = BITMAP::default();
        let got = GetObjectW(
            color.into(),
            size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut c_void),
        );
        if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);
        let mut bgra = read_bgra(dc, color, w, h)?;
        if !has_alpha(&bgra) && !mask.is_invalid() {
            // 알파가 없는 오래된 아이콘: AND 마스크로 투명한 곳을 정한다.
            let mask_px = read_bgra(dc, mask, w, h)?;
            apply_mask_alpha(&mut bgra, &mask_px);
        }
        encode_png(w as u32, h as u32, &bgra_to_rgba(&bgra))
    })();
    ReleaseDC(None, dc);
    for bmp in [color, mask] {
        if !bmp.is_invalid() {
            let _ = DeleteObject(bmp.into());
        }
    }
    png
}

/// 비트맵을 위에서 아래로 32비트 BGRA로 읽는다. 줄 수가 모자라면 `None`이다.
unsafe fn read_bgra(dc: HDC, bmp: HBITMAP, w: i32, h: i32) -> Option<Vec<u8>> {
    let mut bi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // 음수: 위에서 아래
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut buf = vec![0u8; (w as usize) * (h as usize) * 4];
    let lines = GetDIBits(
        dc,
        bmp,
        0,
        h as u32,
        Some(buf.as_mut_ptr() as *mut c_void),
        &mut bi,
        DIB_RGB_COLORS,
    );
    (lines == h).then_some(buf)
}
