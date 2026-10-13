//! 운영체제가 파일 종류에 쓰는 아이콘을 PNG로 얻는다(파일 목록의 "시스템 아이콘" 옵션).
//! macOS는 `NSWorkspace`, Windows는 `SHGetFileInfoW`로 얻고, 그 밖의 OS는 아이콘이 없다(`None`).
//! 이 크레이트는 UI·Tauri를 모른다. 어떤 소스로 얻을지(폴더·확장자·경로)는 부르는 쪽이 정한다.

use std::path::Path;

#[cfg(target_os = "macos")]
mod mac;

/// 아이콘을 얻을 곳.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconSource<'a> {
    /// 폴더 일반 아이콘.
    Folder,
    /// 확장자(점 없이, 대소문자 무관)에 연결된 종류 아이콘. 파일이 없어도 얻는다. 비어 있으면 일반 문서 아이콘이다.
    Extension(&'a str),
    /// 실제 파일·폴더의 자기 아이콘(`.app` 번들, `.exe` 같은 것).
    Path(&'a Path),
}

/// 요청할 수 있는 가장 큰 한 변(픽셀). 이보다 크면 `None`이다.
pub const MAX_SIZE: u32 = 512;

/// `source`의 아이콘을 `size_px`×`size_px` PNG로 돌려준다. 크기가 0이거나 `MAX_SIZE`를 넘거나, 이 OS에서 얻을 수 없으면 `None`이다.
pub fn icon_png(source: IconSource, size_px: u32) -> Option<Vec<u8>> {
    if size_px == 0 || size_px > MAX_SIZE {
        return None;
    }
    render(source, size_px)
}

#[cfg(target_os = "macos")]
fn render(source: IconSource, size_px: u32) -> Option<Vec<u8>> {
    mac::render(source, size_px)
}

#[cfg(not(target_os = "macos"))]
fn render(_source: IconSource, _size_px: u32) -> Option<Vec<u8>> {
    None
}

/// 확장자를 점 없이 소문자로 맞춘다.
pub fn normalize_ext(ext: &str) -> String {
    ext.trim_start_matches('.').to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_ext_drops_dot_and_case() {
        assert_eq!(normalize_ext(".TXT"), "txt");
        assert_eq!(normalize_ext("Png"), "png");
        assert_eq!(normalize_ext(""), "");
    }

    #[test]
    fn size_zero_and_too_large_are_none() {
        assert_eq!(icon_png(IconSource::Extension("txt"), 0), None);
        assert_eq!(icon_png(IconSource::Folder, MAX_SIZE + 1), None);
    }

    #[cfg(target_os = "macos")]
    mod macos {
        use super::*;

        const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

        /// PNG의 IHDR에서 (폭, 높이).
        fn dims(png: &[u8]) -> (u32, u32) {
            assert_eq!(&png[..8], &SIGNATURE, "PNG 서명이 아니다");
            assert_eq!(&png[12..16], b"IHDR");
            (
                u32::from_be_bytes(png[16..20].try_into().unwrap()),
                u32::from_be_bytes(png[20..24].try_into().unwrap()),
            )
        }

        fn get(source: IconSource, size: u32) -> Vec<u8> {
            icon_png(source, size).expect("아이콘을 얻지 못했다")
        }

        #[test]
        fn extension_and_folder_icons_are_png_of_requested_size() {
            for size in [32, 64] {
                for source in [
                    IconSource::Extension("txt"),
                    IconSource::Extension("png"),
                    IconSource::Folder,
                ] {
                    assert_eq!(dims(&get(source, size)), (size, size), "{source:?}");
                }
            }
        }

        #[test]
        fn different_kinds_give_different_icons() {
            let txt = get(IconSource::Extension("txt"), 32);
            let png = get(IconSource::Extension("png"), 32);
            let folder = get(IconSource::Folder, 32);
            assert_ne!(txt, png);
            assert_ne!(txt, folder);
            assert_ne!(png, folder);
        }

        #[test]
        fn extension_ignores_case_and_leading_dot() {
            let lower = get(IconSource::Extension("txt"), 32);
            assert_eq!(get(IconSource::Extension("TXT"), 32), lower);
            assert_eq!(get(IconSource::Extension(".txt"), 32), lower);
        }

        #[test]
        fn unknown_and_empty_extensions_get_a_generic_icon() {
            assert_eq!(dims(&get(IconSource::Extension("zzqq"), 32)), (32, 32));
            assert_eq!(dims(&get(IconSource::Extension(""), 32)), (32, 32));
        }

        #[test]
        fn path_source_gives_the_apps_own_icon() {
            let app = Path::new("/System/Applications/Utilities/Terminal.app");
            if !app.exists() {
                return;
            }
            let icon = get(IconSource::Path(app), 64);
            assert_eq!(dims(&icon), (64, 64));
            assert_ne!(icon, get(IconSource::Folder, 64));
        }

        #[test]
        fn missing_path_still_gives_a_generic_icon_or_none_without_panicking() {
            let r = icon_png(IconSource::Path(Path::new("/no/such/file.xyz")), 32);
            if let Some(png) = r {
                assert_eq!(dims(&png), (32, 32));
            }
        }

        #[test]
        fn works_from_many_threads_at_once() {
            let handles: Vec<_> = (0..8)
                .map(|i| {
                    std::thread::spawn(move || {
                        let ext = ["txt", "png", "pdf", "zip"][i % 4];
                        dims(&get(IconSource::Extension(ext), 32))
                    })
                })
                .collect();
            for h in handles {
                assert_eq!(h.join().unwrap(), (32, 32));
            }
        }
    }
}
