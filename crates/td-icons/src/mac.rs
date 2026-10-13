//! macOS: `NSWorkspace`가 주는 `NSImage`를 `NSBitmapImageRep`에 원하는 크기로 그려 PNG로 낸다.

use std::path::Path;
use std::ptr;
use std::sync::Mutex;

use objc2::rc::autoreleasepool;
use objc2::runtime::AnyObject;
use objc2::AllocAnyThread;
use objc2_app_kit::{
    NSBitmapImageFileType, NSBitmapImageRep, NSDeviceRGBColorSpace, NSGraphicsContext, NSImage,
    NSImageInterpolation, NSWorkspace,
};
use objc2_foundation::{NSDictionary, NSPoint, NSRect, NSSize, NSString};

use crate::{normalize_ext, IconSource};

/// AppKit 그리기는 한 번에 하나씩만 한다(여러 스레드의 그래픽 상태가 섞이지 않게). 아이콘은 서비스가 캐시하므로 부담이 작다.
static DRAW: Mutex<()> = Mutex::new(());

#[allow(deprecated)] // iconForFileType은 확장자 문자열을 그대로 받는 쉬운 길이다(UTType 대안은 별도 의존성이 필요하다)
fn icon_image(source: IconSource) -> Option<objc2::rc::Retained<NSImage>> {
    let ws = NSWorkspace::sharedWorkspace();
    Some(match source {
        IconSource::Folder => ws.iconForFileType(&NSString::from_str("public.folder")),
        IconSource::Extension(ext) => {
            let ext = normalize_ext(ext);
            let ty = if ext.is_empty() {
                "public.data"
            } else {
                ext.as_str()
            };
            ws.iconForFileType(&NSString::from_str(ty))
        }
        IconSource::Path(p) => ws.iconForFile(&NSString::from_str(path_str(p)?)),
    })
}

fn path_str(p: &Path) -> Option<&str> {
    p.to_str()
}

pub fn render(source: IconSource, size_px: u32) -> Option<Vec<u8>> {
    let _guard = DRAW.lock().unwrap_or_else(|e| e.into_inner());
    autoreleasepool(|_| {
        let image = icon_image(source)?;
        let n = size_px as isize;
        // SAFETY: 평면 포인터를 null로 주면 비트맵이 자기 메모리를 할당한다. 인자는 8비트 RGBA 한 평면이다.
        let rep = unsafe {
            NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
                NSBitmapImageRep::alloc(),
                ptr::null_mut(),
                n,
                n,
                8,
                4,
                true,
                false,
                NSDeviceRGBColorSpace,
                0,
                0,
            )
        }?;
        let ctx = NSGraphicsContext::graphicsContextWithBitmapImageRep(&rep)?;
        NSGraphicsContext::saveGraphicsState_class();
        NSGraphicsContext::setCurrentContext(Some(&ctx));
        ctx.setImageInterpolation(NSImageInterpolation::High);
        image.drawInRect(NSRect::new(
            NSPoint::new(0.0, 0.0),
            NSSize::new(size_px as f64, size_px as f64),
        ));
        ctx.flushGraphics();
        NSGraphicsContext::restoreGraphicsState_class();
        let props = NSDictionary::<NSString, AnyObject>::new();
        // SAFETY: 속성 사전은 비어 있다.
        let data =
            unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) }?;
        Some(data.to_vec())
    })
}
