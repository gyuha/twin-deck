//! Windows 전용: 미리보기 처리기(`IPreviewHandler`)를 앱 창의 자식 창 안에 띄운다 (ADR-0015).
//! 처리기는 STA 스레드에서 다뤄야 하고 그 스레드에 메시지 루프가 있어야 하므로, 창마다 전용 스레드 하나가 처리기와 자식 창을 모두 맡는다.
//! 명령은 큐에 넣고 스레드 메시지로 깨운다. 처리기가 멈춰도 앱 스레드는 멈추지 않는다(호출하는 쪽은 시간 제한을 두고 기다린다).

use std::collections::VecDeque;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use windows::core::{Interface, GUID, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, WHITE_BRUSH};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, IStream, CLSCTX_INPROC_SERVER,
    CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED, STGM_READ, STGM_SHARE_DENY_WRITE,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Registry::{RegGetValueW, HKEY_CLASSES_ROOT, RRF_RT_REG_SZ};
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Shell::PropertiesSystem::{IInitializeWithFile, IInitializeWithStream};
use windows::Win32::UI::Shell::{IPreviewHandler, SHCreateStreamOnFileEx};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetClassNameW, GetMessageW,
    GetWindow, GetWindowRect, IsWindowVisible, MoveWindow, PeekMessageW, PostThreadMessageW,
    RegisterClassW, SetWindowPos, ShowWindow, TranslateMessage, GW_CHILD, GW_HWNDNEXT, HWND_TOP,
    MSG, PM_NOREMOVE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_HIDE, SW_SHOWNA, WM_APP,
    WM_LBUTTONDOWN, WM_MBUTTONDOWN, WM_PARENTNOTIFY, WM_QUIT, WM_RBUTTONDOWN, WM_USER, WNDCLASSW,
    WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
};

use crate::preview_handler::{failure_context, find_handler_clsid, PxRect};

const WM_COMMANDS: u32 = WM_APP + 1;
const FILE_ATTRIBUTE_NORMAL: u32 = 0x80;
/// 처리기가 문서를 읽고 그리기를 마칠 때까지 기다리는 최대 시간.
const SHOW_TIMEOUT: Duration = Duration::from_secs(20);

/// 진단용: 환경변수 `TWIN_DECK_PREVIEW_LOG`가 가리키는 파일에 한 줄 덧붙인다. 없으면 아무것도 하지 않는다.
fn dbg(msg: &str) {
    if let Some(path) = std::env::var_os("TWIN_DECK_PREVIEW_LOG") {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(f, "{msg}");
        }
    }
}

/// 진단용: `parent` 아래 자식 창을 위(앞)에서 아래(뒤) 순서로 적는다.
fn dump_children(parent: HWND, host: HWND) {
    if std::env::var_os("TWIN_DECK_PREVIEW_LOG").is_none() {
        return;
    }
    // SAFETY: 창 핸들을 읽기만 한다.
    unsafe {
        let mut cur = GetWindow(parent, GW_CHILD).ok();
        let mut i = 0;
        while let Some(h) = cur {
            let mut name = [0u16; 128];
            let n = GetClassNameW(h, &mut name) as usize;
            let mut r = RECT::default();
            let _ = GetWindowRect(h, &mut r);
            dbg(&format!(
                "  z{i} {:?}{} class={} visible={} rect=({},{})-({},{})",
                h.0,
                if h == host { " [host]" } else { "" },
                String::from_utf16_lossy(&name[..n]),
                IsWindowVisible(h).as_bool(),
                r.left,
                r.top,
                r.right,
                r.bottom
            ));
            cur = GetWindow(h, GW_HWNDNEXT).ok();
            i += 1;
        }
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// `HKEY_CLASSES_ROOT\<key>`의 기본값(문자열).
fn registry_default(key: &str) -> Option<String> {
    let key = wide(key);
    let mut size = 0u32;
    // SAFETY: `key`는 NUL로 끝나는 UTF-16 문자열이고, 첫 호출은 크기만 묻는다.
    unsafe {
        RegGetValueW(
            HKEY_CLASSES_ROOT,
            PCWSTR(key.as_ptr()),
            PCWSTR::null(),
            RRF_RT_REG_SZ,
            None,
            None,
            Some(&mut size),
        )
    }
    .ok()
    .ok()?;
    let mut buf = vec![0u16; (size as usize).div_ceil(2).max(1)];
    // SAFETY: `buf`는 `size`바이트 이상이다.
    unsafe {
        RegGetValueW(
            HKEY_CLASSES_ROOT,
            PCWSTR(key.as_ptr()),
            PCWSTR::null(),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    }
    .ok()
    .ok()?;
    let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    Some(String::from_utf16_lossy(&buf[..len]))
}

/// 이 파일 확장자에 등록된 미리보기 처리기 CLSID. 없으면 None.
pub fn handler_for(path: &str) -> Option<String> {
    let ext = std::path::Path::new(path).extension()?.to_str()?;
    find_handler_clsid(ext, &registry_default)
}

/// 파일의 `Zone.Identifier`(인터넷 출처 표시)에서 영역을 읽는다. 표시가 없거나 읽지 못하면 None.
fn zone_of(path: &str) -> Option<u32> {
    crate::preview_handler::parse_zone_id(
        &std::fs::read_to_string(format!("{path}:Zone.Identifier")).ok()?,
    )
}

/// 인터넷에서 받아 Office가 미리보기를 막는 파일인가.
pub fn is_blocked(path: &str) -> bool {
    zone_of(path).is_some_and(crate::preview_handler::zone_blocks_preview)
}

/// 파일의 차단 표시(`Zone.Identifier`)를 지운다. 탐색기 파일 속성의 "차단 해제"와 같다. 파일 내용은 건드리지 않는다.
pub fn unblock(path: &str) -> Result<(), String> {
    let p = std::path::Path::new(path);
    if !p.is_file() {
        return Err(format!("{path}: 파일이 아닙니다"));
    }
    match std::fs::remove_file(format!("{path}:Zone.Identifier")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), // 이미 표시가 없다
        Err(e) => Err(format!("{path}: 차단을 해제하지 못했습니다: {e}")),
    }
}

enum Cmd {
    Show {
        parent: isize,
        clsid: String,
        path: String,
        rect: PxRect,
        reply: Sender<Result<(), String>>,
    },
    SetRect(PxRect),
    SetVisible(bool),
    Close,
}

struct Shared {
    queue: Mutex<VecDeque<Cmd>>,
    thread_id: u32,
}

/// 창 하나의 미리보기 호스트. 만들 때 전용 스레드를 띄운다. 버리면 스레드가 끝난다.
pub struct Host {
    shared: Arc<Shared>,
}

/// 호스트 창의 "클릭됨" 알림을 받는 쪽(앱이 웹뷰로 키보드 포커스를 되찾는다). 프로세스에 하나뿐이라 전역이다.
type ClickCallback = Arc<dyn Fn() + Send + Sync>;
static ON_CLICK: OnceLock<Mutex<Option<ClickCallback>>> = OnceLock::new();

fn on_click_slot() -> &'static Mutex<Option<ClickCallback>> {
    ON_CLICK.get_or_init(|| Mutex::new(None))
}

unsafe extern "system" fn host_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if msg == WM_PARENTNOTIFY {
        let event = (wparam.0 & 0xFFFF) as u32;
        if event == WM_LBUTTONDOWN || event == WM_RBUTTONDOWN || event == WM_MBUTTONDOWN {
            // 문서를 눌러 키보드 포커스가 처리기 창으로 넘어갔다. 앱이 곧바로 되찾게 알린다(키는 늘 앱에 남는다).
            let cb = on_click_slot().lock().ok().and_then(|g| g.clone());
            if let Some(cb) = cb {
                std::thread::spawn(move || cb());
            }
        }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

fn register_class() -> Result<PCWSTR, String> {
    static NAME: OnceLock<Vec<u16>> = OnceLock::new();
    let name = NAME.get_or_init(|| wide("TwinDeckPreviewHost"));
    // SAFETY: 모듈 핸들과 창 프로시저는 프로세스가 사는 동안 유효하다. 이미 등록돼 있으면 두 번째 등록은 실패하지만 무해하다.
    unsafe {
        let hinst = GetModuleHandleW(None).map_err(|e| e.to_string())?;
        let class = WNDCLASSW {
            lpfnWndProc: Some(host_proc),
            hInstance: hinst.into(),
            lpszClassName: PCWSTR(name.as_ptr()),
            hbrBackground: HBRUSH(GetStockObject(WHITE_BRUSH).0),
            ..Default::default()
        };
        RegisterClassW(&class);
    }
    Ok(PCWSTR(name.as_ptr()))
}

/// 호스트 창을 형제 창(웹뷰) 중 맨 위로 올린다. 웹뷰가 포커스를 받으며 자기 창을 올리면 처리기가 그 뒤로 가려지기 때문이다.
fn bring_to_top(host: HWND) {
    // SAFETY: 이 스레드가 만든 창이다. 움직이거나 크기를 바꾸거나 활성화하지 않고 z-순서만 올린다.
    unsafe {
        let _ = SetWindowPos(
            host,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

fn to_rect(r: PxRect) -> RECT {
    RECT {
        left: 0,
        top: 0,
        right: r.width,
        bottom: r.height,
    }
}

/// 스레드 안에서만 쓰는 처리기와 호스트 창.
struct Active {
    handler: IPreviewHandler,
    host: HWND,
}

impl Active {
    fn close(self) {
        // SAFETY: 이 스레드(STA)에서 만든 처리기와 창이다.
        unsafe {
            let _ = self.handler.Unload();
            let _ = DestroyWindow(self.host);
        }
    }
}

/// 처리기를 띄우지 못했을 때 오류 앞에 붙는 말(서로게이트 → 프로세스 안 재시도 여부를 가린다).
const LAUNCH_FAILED: &str = "미리보기 처리기를 띄우지 못했습니다";

/// 처리기를 어디서 실행하나.
#[derive(Clone, Copy)]
enum Scope {
    /// 서로게이트(`prevhost`)로 프로세스 밖에서. 탐색기가 쓰는 방식이고 처리기가 멈춰도 앱이 안전하다.
    Surrogate,
    /// 이 앱 프로세스 안에서. 서로게이트로 못 띄우거나 그리지 못하는 처리기를 위한 두 번째 시도다.
    InProcess,
}

impl Scope {
    fn label(self) -> &'static str {
        match self {
            Scope::Surrogate => "프로세스 밖",
            Scope::InProcess => "프로세스 안",
        }
    }
}

fn create_handler(clsid: &str, scope: Scope) -> Result<IPreviewHandler, String> {
    let guid = GUID::try_from(clsid.trim_matches(['{', '}']))
        .map_err(|e| format!("처리기 ID가 잘못됐습니다: {e}"))?;
    let ctx = match scope {
        Scope::Surrogate => CLSCTX_LOCAL_SERVER,
        Scope::InProcess => CLSCTX_INPROC_SERVER,
    };
    // SAFETY: STA로 초기화한 스레드에서 부른다.
    unsafe {
        CoCreateInstance::<_, IPreviewHandler>(&guid, None, ctx)
            .map_err(|e| format!("{LAUNCH_FAILED}: {e}"))
    }
}

/// 처리기 하나를 `scope`로 띄워 `host` 안에 문서를 그린다. 실패하면 처리기를 내린다.
fn try_start(
    scope: Scope,
    host: HWND,
    clsid: &str,
    path: &str,
    rect: PxRect,
) -> Result<IPreviewHandler, String> {
    let handler = create_handler(clsid, scope)?;
    let drawn = (|| {
        initialize(&handler, path)?;
        // SAFETY: 이 STA 스레드가 만든 처리기와 창이다.
        unsafe {
            handler
                .SetWindow(host, &to_rect(rect))
                .map_err(|e| format!("미리보기 창을 연결하지 못했습니다: {e}"))?;
            handler
                .DoPreview()
                .map_err(|e| format!("문서를 그리지 못했습니다: {e}"))
        }
    })();
    match drawn {
        Ok(()) => Ok(handler),
        Err(e) => {
            // SAFETY: 위에서 만든 처리기다.
            unsafe {
                let _ = handler.Unload();
            }
            Err(e)
        }
    }
}

/// 처리기가 지원하는 방식(파일 → 스트림)으로 파일을 넘긴다.
fn initialize(handler: &IPreviewHandler, path: &str) -> Result<(), String> {
    let w = wide(path);
    // SAFETY: `w`는 NUL로 끝나는 경로이고, 인터페이스는 같은 STA 스레드에서 쓴다.
    unsafe {
        if let Ok(init) = handler.cast::<IInitializeWithFile>() {
            return init
                .Initialize(PCWSTR(w.as_ptr()), STGM_READ.0)
                .map_err(|e| format!("문서를 열지 못했습니다: {e}"));
        }
        if let Ok(init) = handler.cast::<IInitializeWithStream>() {
            let stream: IStream = SHCreateStreamOnFileEx(
                PCWSTR(w.as_ptr()),
                (STGM_READ | STGM_SHARE_DENY_WRITE).0,
                FILE_ATTRIBUTE_NORMAL,
                false,
                None,
            )
            .map_err(|e| format!("문서를 열지 못했습니다: {e}"))?;
            return init
                .Initialize(&stream, STGM_READ.0)
                .map_err(|e| format!("문서를 열지 못했습니다: {e}"));
        }
    }
    Err("이 처리기는 지원하지 않는 초기화 방식입니다".into())
}

fn show(
    active: &mut Option<Active>,
    class: PCWSTR,
    parent: isize,
    clsid: &str,
    path: &str,
    rect: PxRect,
) -> Result<(), String> {
    if let Some(a) = active.take() {
        a.close();
    }
    // SAFETY: 부모 창은 앱의 창이고, 자식 창과 처리기는 모두 이 STA 스레드가 만들고 정리한다.
    unsafe {
        let host = CreateWindowExW(
            Default::default(),
            class,
            PCWSTR::null(),
            WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
            rect.x,
            rect.y,
            rect.width.max(1),
            rect.height.max(1),
            Some(HWND(parent as *mut _)),
            None,
            GetModuleHandleW(None).ok().map(Into::into),
            None,
        )
        .map_err(|e| format!("미리보기 창을 만들지 못했습니다: {e}"))?;
        // 프로세스 밖(서로게이트)에서 먼저 시도한다. 서로게이트를 아예 띄우지 못했을 때만 프로세스 안에서 한 번 더 시도한다.
        // 서로게이트에서 문서를 그리지 못한 처리기를 앱 프로세스 안에 올리면 앱이 같이 죽을 수 있어 그때는 다시 시도하지 않는다.
        let mut notes = Vec::new();
        let mut started = None;
        for scope in [Scope::Surrogate, Scope::InProcess] {
            match try_start(scope, host, clsid, path, rect) {
                Ok(handler) => {
                    started = Some(handler);
                    break;
                }
                Err(e) => {
                    let could_not_launch = e.starts_with(LAUNCH_FAILED);
                    notes.push(format!("{}: {e}", scope.label()));
                    if !could_not_launch {
                        break;
                    }
                }
            }
        }
        let started = started
            .ok_or_else(|| format!("{} [{}]", notes.join(" / "), failure_context(clsid, rect)));
        dbg(&format!(
            "show path={path} clsid={clsid} rect={rect:?} result={:?}",
            started.as_ref().err()
        ));
        match started {
            Ok(handler) => {
                let _ = ShowWindow(host, SW_SHOWNA);
                bring_to_top(host);
                dbg(&format!(
                    "shown host={:?} visible={}",
                    host.0,
                    IsWindowVisible(host).as_bool()
                ));
                dump_children(HWND(parent as *mut _), host);
                *active = Some(Active { handler, host });
                Ok(())
            }
            Err(e) => {
                let _ = DestroyWindow(host);
                Err(e)
            }
        }
    }
}

fn run_thread(shared_tx: Sender<Arc<Shared>>) {
    // SAFETY: 이 스레드의 COM 초기화는 아래 `CoUninitialize`와 짝이다.
    let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    // 스레드 메시지 큐는 첫 메시지 함수 호출 때 만들어진다. 호출 쪽이 보내기 전에 만들어 두지 않으면 깨우는 메시지가 사라진다.
    let mut msg = MSG::default();
    // SAFETY: 큐만 만들고 메시지는 꺼내지 않는다.
    unsafe {
        let _ = PeekMessageW(&mut msg, None, WM_USER, WM_USER, PM_NOREMOVE);
    }
    let shared = Arc::new(Shared {
        queue: Mutex::new(VecDeque::new()),
        thread_id: unsafe { GetCurrentThreadId() },
    });
    let _ = shared_tx.send(shared.clone());
    let class = register_class();
    let mut active: Option<Active> = None;
    // SAFETY: 표준 메시지 루프다. 명령은 스레드 메시지(`hwnd`가 없음)로 깨운다.
    unsafe {
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            if msg.hwnd.0.is_null() && msg.message == WM_COMMANDS {
                loop {
                    let Some(cmd) = shared.queue.lock().ok().and_then(|mut q| q.pop_front()) else {
                        break;
                    };
                    match cmd {
                        Cmd::Show {
                            parent,
                            clsid,
                            path,
                            rect,
                            reply,
                        } => {
                            let r = match &class {
                                Ok(c) => show(&mut active, *c, parent, &clsid, &path, rect),
                                Err(e) => Err(e.clone()),
                            };
                            let _ = reply.send(r);
                        }
                        Cmd::SetRect(rect) => {
                            if let Some(a) = &active {
                                let _ = MoveWindow(
                                    a.host,
                                    rect.x,
                                    rect.y,
                                    rect.width.max(1),
                                    rect.height.max(1),
                                    true,
                                );
                                bring_to_top(a.host);
                                let _ = a.handler.SetRect(&to_rect(rect));
                            }
                        }
                        Cmd::SetVisible(v) => {
                            if let Some(a) = &active {
                                let _ = ShowWindow(a.host, if v { SW_SHOWNA } else { SW_HIDE });
                                if v {
                                    bring_to_top(a.host);
                                }
                            }
                        }
                        Cmd::Close => {
                            if let Some(a) = active.take() {
                                a.close();
                            }
                        }
                    }
                }
                continue;
            }
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        if let Some(a) = active.take() {
            a.close();
        }
        if com.is_ok() {
            CoUninitialize();
        }
    }
}

impl Host {
    pub fn new() -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();
        std::thread::Builder::new()
            .name("preview-handler-host".into())
            .spawn(move || run_thread(tx))
            .map_err(|e| e.to_string())?;
        let shared = rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| "미리보기 호스트를 시작하지 못했습니다".to_string())?;
        Ok(Self { shared })
    }

    fn send(&self, cmd: Cmd) {
        if let Ok(mut q) = self.shared.queue.lock() {
            q.push_back(cmd);
        }
        // SAFETY: 스레드 ID는 `run_thread`가 알려 준 호스트 스레드의 것이다. 메시지 큐가 아직 없으면 실패하지만 곧 명령을 처리한다.
        unsafe {
            let _ = PostThreadMessageW(self.shared.thread_id, WM_COMMANDS, WPARAM(0), LPARAM(0));
        }
    }

    /// 처리기로 `path`를 `parent`(앱 창 핸들) 위 `rect` 자리에 띄운다. 그리기를 마칠 때까지 기다린다.
    pub fn show(
        &self,
        parent: isize,
        clsid: &str,
        path: &str,
        rect: PxRect,
        on_click: Arc<dyn Fn() + Send + Sync>,
    ) -> Result<(), String> {
        if let Ok(mut slot) = on_click_slot().lock() {
            *slot = Some(on_click);
        }
        let (reply, rx) = mpsc::channel();
        self.send(Cmd::Show {
            parent,
            clsid: clsid.to_string(),
            path: path.to_string(),
            rect,
            reply,
        });
        rx.recv_timeout(SHOW_TIMEOUT)
            .map_err(|_| "미리보기 처리기가 시간 안에 문서를 그리지 못했습니다".to_string())?
    }

    pub fn set_rect(&self, rect: PxRect) {
        self.send(Cmd::SetRect(rect));
    }

    pub fn set_visible(&self, visible: bool) {
        self.send(Cmd::SetVisible(visible));
    }

    pub fn close(&self) {
        self.send(Cmd::Close);
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        // SAFETY: 호스트 스레드에 종료 메시지를 보낸다. 스레드는 처리기를 내리고 끝난다.
        unsafe {
            let _ = PostThreadMessageW(self.shared.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use td_archive::{Source, ZipEdit};
    use windows::core::w;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumChildWindows, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
    };

    const CONTENT_TYPES: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#;
    const RELS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#;
    const DOCUMENT: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>미리보기 처리기 시험 문서</w:t></w:r></w:p></w:body></w:document>"#;

    fn make_docx(dir: &std::path::Path) -> std::path::PathBuf {
        let path = dir.join("sample.docx");
        let mut zip = ZipEdit::create(&path).unwrap();
        zip.add_file(
            "[Content_Types].xml",
            Source::Bytes(CONTENT_TYPES.as_bytes().to_vec()),
        );
        zip.add_file("_rels/.rels", Source::Bytes(RELS.as_bytes().to_vec()));
        zip.add_file(
            "word/document.xml",
            Source::Bytes(DOCUMENT.as_bytes().to_vec()),
        );
        zip.commit().unwrap();
        path
    }

    unsafe extern "system" fn count_child(_: HWND, lparam: LPARAM) -> windows::core::BOOL {
        *(lparam.0 as *mut usize) += 1;
        true.into()
    }

    fn children_of(parent: HWND) -> usize {
        let mut n = 0usize;
        // SAFETY: `n`은 열거가 끝날 때까지 살아 있다.
        unsafe {
            let _ = EnumChildWindows(
                Some(parent),
                Some(count_child),
                LPARAM(&mut n as *mut usize as isize),
            );
        }
        n
    }

    /// 실제 Windows 미리보기 처리기(Office가 있으면 docx에 등록돼 있다)로 문서를 그려 본다. 처리기가 없으면 건너뛴다.
    #[test]
    fn 실제_처리기로_docx를_그린다() {
        let tmp = tempfile::tempdir().unwrap();
        let docx = make_docx(tmp.path());
        let path = docx.to_string_lossy().into_owned();
        let Some(clsid) = handler_for(&path) else {
            eprintln!("docx 미리보기 처리기가 등록돼 있지 않아 건너뜁니다");
            return;
        };
        // 앱의 메인 스레드처럼, 부모 창은 메시지를 처리하는 전용 스레드가 소유한다(자식 창을 만들면 부모에게 동기 메시지가 간다).
        let (tx, rx) = mpsc::channel();
        let pump = std::thread::spawn(move || {
            // SAFETY: 이 스레드가 만들고 이 스레드의 메시지 루프로 처리하는 시험용 최상위 창이다.
            unsafe {
                let parent = CreateWindowExW(
                    Default::default(),
                    w!("STATIC"),
                    w!("preview-host-test"),
                    WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                    0,
                    0,
                    900,
                    700,
                    None,
                    None,
                    None,
                    None,
                )
                .expect("시험용 부모 창");
                let _ = tx.send((parent.0 as isize, GetCurrentThreadId()));
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let _ = DestroyWindow(parent);
            }
        });
        let (parent_raw, pump_thread) = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let parent = HWND(parent_raw as *mut _);
        let host = Host::new().unwrap();
        let rect = PxRect {
            x: 10,
            y: 20,
            width: 600,
            height: 400,
        };
        let shown = host.show(parent.0 as isize, &clsid, &path, rect, Arc::new(|| {}));
        assert!(shown.is_ok(), "처리기가 문서를 그리지 못했다: {shown:?}");
        assert!(children_of(parent) >= 1, "부모 창 아래에 호스트 창이 없다");
        host.set_rect(PxRect {
            x: 0,
            y: 0,
            width: 300,
            height: 200,
        });
        host.set_visible(false);
        host.set_visible(true);
        host.close();
        // 정리: 호스트 스레드가 처리기를 내릴 시간을 준다.
        std::thread::sleep(Duration::from_millis(500));
        drop(host);
        // SAFETY: 부모 창 스레드에 종료 메시지를 보낸다.
        unsafe {
            let _ = PostThreadMessageW(pump_thread, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        pump.join().unwrap();
    }

    /// 화면의 `(left, top, w, h)` 영역에서 흰색이 아닌 픽셀의 비율. 로그인한 데스크톱이 필요하다.
    fn non_white_ratio(left: i32, top: i32, w: i32, h: i32) -> f64 {
        use windows::Win32::Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
            DIB_RGB_COLORS, SRCCOPY,
        };
        // SAFETY: 화면 DC에서 지정한 영역만 비트맵으로 복사해 읽는다. 만든 GDI 개체는 모두 정리한다.
        unsafe {
            let screen = GetDC(None);
            let mem = CreateCompatibleDC(Some(screen));
            let bmp = CreateCompatibleBitmap(screen, w, h);
            let old = SelectObject(mem, bmp.into());
            let _ = BitBlt(
                mem,
                0,
                0,
                w,
                h,
                Some(screen),
                left,
                top,
                SRCCOPY | CAPTUREBLT,
            );
            let mut info = BITMAPINFO::default();
            info.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut px = vec![0u8; (w * h * 4) as usize];
            GetDIBits(
                mem,
                bmp,
                0,
                h as u32,
                Some(px.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS,
            );
            SelectObject(mem, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            let total = (w * h) as f64;
            let non_white = px
                .chunks_exact(4)
                .filter(|c| c[0] < 240 || c[1] < 240 || c[2] < 240)
                .count() as f64;
            non_white / total
        }
    }

    /// 처리기가 자식 창에 **실제로 픽셀을 그리는지** 시험 창 영역만 캡처해 본다(Office와 로그인한 데스크톱이 필요하므로 기본은 건너뜀).
    /// `cargo test -p twin-deck-desktop pixels -- --ignored --nocapture`
    #[test]
    #[ignore = "화면을 캡처한다. 로그인한 데스크톱과 Office가 있을 때 --ignored로 실행"]
    fn 처리기가_자식_창에_픽셀을_그린다() {
        // `TWIN_DECK_TEST_DPI=1`이면 실제 앱처럼 Per-Monitor v2 DPI 인식으로 올린다(처리기 프로세스와 DPI 방식이 다를 때를 확인한다).
        if std::env::var_os("TWIN_DECK_TEST_DPI").is_some() {
            // SAFETY: 창을 만들기 전에 프로세스 기본값을 정한다.
            unsafe {
                let _ = windows::Win32::UI::HiDpi::SetProcessDpiAwarenessContext(
                    windows::Win32::UI::HiDpi::DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                );
            }
        }
        let tmp = tempfile::tempdir().unwrap();
        // `TWIN_DECK_TEST_DOC`로 시험할 파일을 바꿀 수 있다(큰 파일, 인터넷에서 받은 파일 같은 경우를 확인할 때).
        let path = std::env::var("TWIN_DECK_TEST_DOC")
            .unwrap_or_else(|_| make_docx(tmp.path()).to_string_lossy().into_owned());
        let Some(clsid) = handler_for(&path) else {
            eprintln!("처리기가 없어 건너뜁니다");
            return;
        };
        let (tx, rx) = mpsc::channel();
        let pump = std::thread::spawn(move || {
            // SAFETY: 이 스레드가 만들고 처리하는 최상위 시험 창(항상 위, 테두리 없음)이다.
            unsafe {
                let parent = CreateWindowExW(
                    windows::Win32::UI::WindowsAndMessaging::WS_EX_TOPMOST,
                    w!("STATIC"),
                    w!("preview-host-pixels"),
                    windows::Win32::UI::WindowsAndMessaging::WS_POPUP | WS_VISIBLE,
                    50,
                    50,
                    1500,
                    1200,
                    None,
                    None,
                    None,
                    None,
                )
                .expect("시험용 부모 창");
                let _ = tx.send((parent.0 as isize, GetCurrentThreadId()));
                let mut msg = MSG::default();
                while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                let _ = DestroyWindow(parent);
            }
        });
        let (parent_raw, pump_thread) = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        let host = Host::new().unwrap();
        // `TWIN_DECK_TEST_RECT=1018x900`처럼 영역 크기를 바꿀 수 있다.
        let (width, height) = std::env::var("TWIN_DECK_TEST_RECT")
            .ok()
            .and_then(|v| {
                v.split_once('x')
                    .and_then(|(w, h)| Some((w.parse().ok()?, h.parse().ok()?)))
            })
            .unwrap_or((600, 400));
        let rect = PxRect {
            x: 20,
            y: 30,
            width,
            height,
        };
        let shown = host.show(parent_raw as isize, &clsid, &path, rect, Arc::new(|| {}));
        eprintln!("show 결과 = {shown:?}");
        shown.expect("처리기가 문서를 그리지 못했다");
        std::thread::sleep(Duration::from_millis(2500)); // 처리기가 그릴 시간
        let ratio = non_white_ratio(50 + rect.x, 50 + rect.y, rect.width, rect.height);
        eprintln!("흰색이 아닌 픽셀 비율 = {:.4}", ratio);
        host.close();
        std::thread::sleep(Duration::from_millis(300));
        drop(host);
        // SAFETY: 부모 창 스레드에 종료 메시지를 보낸다.
        unsafe {
            let _ = PostThreadMessageW(pump_thread, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        pump.join().unwrap();
        assert!(
            ratio > 0.001,
            "처리기 영역에 그려진 것이 없다(흰색 비율만 {ratio:.4})"
        );
    }

    fn mark_from_web(path: &std::path::Path, zone: u32) {
        std::fs::write(
            format!("{}:Zone.Identifier", path.display()),
            format!(
                "[ZoneTransfer]
ZoneId={zone}
"
            ),
        )
        .unwrap();
    }

    #[test]
    fn 인터넷에서_받은_파일은_막힌_것으로_보고_차단_해제로_표시만_지운다() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("받은 파일 (1).xlsx");
        std::fs::write(&file, b"content").unwrap();
        let path = file.to_string_lossy().into_owned();
        assert!(!is_blocked(&path), "표시가 없으면 막히지 않는다");
        mark_from_web(&file, 3);
        assert!(is_blocked(&path), "ZoneId=3(인터넷)은 막힌다");
        mark_from_web(&file, 1);
        assert!(!is_blocked(&path), "ZoneId=1(인트라넷)은 막지 않는다");
        mark_from_web(&file, 3);
        unblock(&path).unwrap();
        assert!(!is_blocked(&path), "차단 해제 뒤에는 막히지 않는다");
        assert_eq!(
            std::fs::read(&file).unwrap(),
            b"content",
            "파일 내용은 그대로다"
        );
        unblock(&path).expect("이미 표시가 없어도 오류가 아니다");
    }

    #[test]
    fn 차단_해제는_파일이_아니면_거부한다() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(unblock(&tmp.path().to_string_lossy()).is_err());
        assert!(unblock(&tmp.path().join("nope.xlsx").to_string_lossy()).is_err());
    }

    #[test]
    fn 등록이_없는_확장자는_처리기가_없다() {
        assert_eq!(handler_for(r"C:\x\file.twindeck-no-such-ext"), None);
        assert_eq!(handler_for(r"C:\x\noextension"), None);
    }
}
