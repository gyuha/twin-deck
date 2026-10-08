//! macOS Quick Look(`qlmanage -p -o`)으로 Office 문서의 HTML 미리보기를 만든다 (ADR-0014).
//! `qlmanage`는 없는 경로나 망가진 파일에서 끝나지 않을 수 있고, 미리보기를 못 만들어도 종료 코드가 0이다.
//! 그래서 파일이 있는지 먼저 확인하고, 시간 제한을 두고, 결과는 `Preview.html`이 생겼는지로 판단한다.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tempfile::TempDir;

const CANT: &str = "Quick Look으로 미리 볼 수 없습니다";

/// Quick Look이 만든 미리보기. `html`은 `Preview.html` 원문이고, 그 안의 `AttachmentN.*` 참조는 `dir` 폴더에 있다.
/// 여러 시트 xlsx면 `sheets`에 시트가 순서대로 들어 있고(둘 이상), 이때 `html`은 JS로 탭을 바꾸는 껍데기라 쓰지 않는다.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuickLookDto {
    pub html: String,
    pub dir: String,
    pub sheets: Vec<QuickLookSheetDto>,
}

/// 여러 시트 xlsx의 시트 하나. `html`의 첨부 참조도 `QuickLookDto::dir` 폴더에 있다.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuickLookSheetDto {
    pub name: String,
    pub html: String,
}

pub struct QuickLook {
    program: PathBuf,
    timeout: Duration,
    current: Mutex<Current>,
}

/// 마지막 요청의 상태. 요청은 한 번에 하나만 살아 있다.
#[derive(Default)]
struct Current {
    /// 가장 최근 요청의 순번. 프런트가 보낸 순번이라 들어온 순서와 달라도 된다(Tauri는 명령을 스레드 풀에서 돌린다).
    /// 기다리던 요청이 끝났을 때 이 값이 바뀌어 있으면 새 요청에 밀린 것이다.
    latest: f64,
    child: Option<Arc<Mutex<Child>>>,
    /// 지금 보여 주는 결과의 임시 폴더. 첨부 그림을 이 폴더에서 읽으므로 다음 결과가 올 때까지 남긴다.
    shown: Option<TempDir>,
}

const CANCELLED: &str = "취소되었습니다";

impl QuickLook {
    pub fn new(program: impl Into<PathBuf>, timeout: Duration) -> Self {
        Self {
            program: program.into(),
            timeout,
            current: Mutex::default(),
        }
    }

    /// `path` 문서의 미리보기를 만든다. `seq`는 요청 순번이다(클수록 최근).
    /// 더 큰 순번의 요청이 오면 돌고 있던 요청은 멈추고 취소 오류로 끝나고, 늦게 들어온 작은 순번의 요청은 띄우지 않는다.
    pub fn preview(&self, path: &Path, seq: f64) -> Result<QuickLookDto, String> {
        let file = existing_file(path)
            .ok_or_else(|| format!("파일을 찾을 수 없습니다: {}", path.display()))?;
        {
            let mut cur = self.current.lock().unwrap();
            if seq < cur.latest {
                return Err(CANCELLED.into());
            }
            cur.latest = seq;
            if let Some(old) = cur.child.take() {
                let _ = old.lock().unwrap().kill(); // 이전 요청은 기다리던 쪽이 거둔다
            }
        }
        let out = tempfile::tempdir().map_err(|e| e.to_string())?;
        let child = Command::new(&self.program)
            .args(["-p", "-o"])
            .arg(out.path())
            .arg(&file)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("{CANT} ({e})"))?;
        let child = Arc::new(Mutex::new(child));
        {
            let mut cur = self.current.lock().unwrap();
            if cur.latest != seq {
                // 띄우는 사이에 더 새 요청이 들어왔다
                let mut c = child.lock().unwrap();
                let _ = c.kill();
                let _ = c.wait();
                return Err(CANCELLED.into());
            }
            cur.child = Some(child.clone());
        }
        let finished = self.wait(&child);
        let mut cur = self.current.lock().unwrap();
        if cur.latest != seq {
            return Err(CANCELLED.into());
        }
        cur.child = None;
        if !finished {
            return Err(format!("{CANT} (시간 초과)"));
        }
        let dto = read_output(out.path())?;
        cur.shown = Some(out); // 이전 결과의 임시 폴더는 여기서 지워진다
        Ok(dto)
    }

    /// 자식이 끝날 때까지 기다린다. 시간 제한을 넘기면 끝내고 `false`.
    fn wait(&self, child: &Mutex<Child>) -> bool {
        let deadline = Instant::now() + self.timeout;
        loop {
            let mut c = child.lock().unwrap();
            if !matches!(c.try_wait(), Ok(None)) {
                return true;
            }
            if Instant::now() >= deadline {
                let _ = c.kill();
                let _ = c.wait();
                return false;
            }
            drop(c);
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

/// 실제로 있는 파일 경로. NFC로 없으면 NFD로 다시 찾는다(macOS SMB 공유는 NFC 한글 경로를 못 찾는다).
fn existing_file(path: &Path) -> Option<PathBuf> {
    if path.is_file() {
        return Some(path.to_path_buf());
    }
    td_vfs::nfd_path(path).filter(|p| p.is_file())
}

/// qlmanage 출력 폴더에서 미리보기를 읽는다.
fn read_output(out: &Path) -> Result<QuickLookDto, String> {
    let page = find_preview(out).ok_or(CANT)?;
    let html = read_text(&page)?;
    let dir = page.parent().unwrap_or(out);
    let sheets = sheet_tabs(&html)
        .into_iter()
        .filter_map(|(name, file)| {
            // 탭 링크는 출력 폴더 안의 파일 이름이어야 한다(경로가 섞이면 버린다).
            let plain = Path::new(&file)
                .file_name()
                .is_some_and(|n| n == file.as_str());
            let html = read_text(&dir.join(&file)).ok().filter(|_| plain)?;
            Some(QuickLookSheetDto { name, html })
        })
        .collect();
    Ok(QuickLookDto {
        sheets,
        html,
        dir: dir.to_string_lossy().into_owned(),
    })
}

/// 여러 시트 xlsx의 탭 껍데기에서 (시트 이름, 시트 본문 파일)을 탭 순서대로 뽑는다. 탭이 없으면 빈 목록.
/// 구조(실측): `<div class="TabHeader">이름</div><a href="AttachmentN.html"></a>`가 탭마다 하나씩 있다.
fn sheet_tabs(shell: &str) -> Vec<(String, String)> {
    const HEADER: &str = "class=\"TabHeader\">";
    let mut out = Vec::new();
    let mut rest = shell;
    while let Some(i) = rest.find(HEADER) {
        rest = &rest[i + HEADER.len()..];
        let Some(end) = rest.find("</div>") else {
            break;
        };
        let name = unescape(&rest[..end]);
        rest = &rest[end..];
        let Some(h) = rest.find("href=\"") else { break };
        rest = &rest[h + "href=\"".len()..];
        let Some(q) = rest.find('"') else { break };
        out.push((name, unescape(&rest[..q])));
        rest = &rest[q..];
    }
    out
}

/// QL이 시트 이름에 쓰는 HTML 엔티티를 푼다.
fn unescape(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn read_text(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{CANT} ({e})"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// `<폴더>/*.qlpreview/Preview.html`. 폴더 이름은 파일 이름에서 오므로 만들지 않고 찾는다.
fn find_preview(out: &Path) -> Option<PathBuf> {
    std::fs::read_dir(out)
        .ok()?
        .flatten()
        .map(|e| e.path().join("Preview.html"))
        .find(|p| p.is_file())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// `qlmanage` 대신 쓸 셸 스크립트를 만든다. 인자는 `-p -o <폴더> <경로>` 순서로 들어온다.
    fn script(dir: &Path, body: &str) -> PathBuf {
        let p = dir.join("fake-qlmanage");
        std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    fn doc(dir: &Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    }

    fn alive(pid: &str) -> bool {
        std::process::Command::new("kill")
            .args(["-0", pid.trim()])
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success()
    }

    /// 스크립트가 남긴 pid 파일이 생길 때까지 기다린다.
    fn wait_pid(path: &Path) -> String {
        for _ in 0..200 {
            if let Ok(s) = std::fs::read_to_string(path) {
                if s.ends_with('\n') {
                    return s;
                }
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("pid 파일이 생기지 않았습니다: {}", path.display());
    }

    #[test]
    fn quicklook_missing_path_fails_without_running_qlmanage() {
        let t = tempfile::tempdir().unwrap();
        let marker = t.path().join("ran");
        let prog = script(t.path(), &format!("touch '{}'", marker.display()));
        let ql = QuickLook::new(prog, Duration::from_secs(5));
        let err = ql.preview(&t.path().join("없음.docx"), 1.0).unwrap_err();
        assert!(err.contains("찾을 수 없습니다"), "{err}");
        assert!(
            !marker.exists(),
            "없는 경로로 qlmanage를 부르면 끝나지 않을 수 있다"
        );
    }

    #[test]
    fn quicklook_timeout_kills_the_child() {
        let t = tempfile::tempdir().unwrap();
        let pid = t.path().join("pid");
        let prog = script(
            t.path(),
            &format!("echo $$ > '{}'; exec sleep 5", pid.display()),
        );
        // 병렬 테스트 부하에서도 스크립트가 pid를 쓸 시간은 준다(300ms로는 쓰기 전에 끝나 버린 적이 있다).
        let ql = QuickLook::new(prog, Duration::from_secs(2));
        let err = ql.preview(&doc(t.path(), "a.docx"), 1.0).unwrap_err();
        assert!(err.contains("시간 초과"), "{err}");
        assert!(
            !alive(&wait_pid(&pid)),
            "시간이 지나면 qlmanage를 끝내야 한다"
        );
    }

    #[test]
    fn quicklook_new_request_cancels_the_running_one() {
        let t = tempfile::tempdir().unwrap();
        let pid = t.path().join("pid");
        // slow.docx는 끝나지 않고, 나머지는 바로 미리보기를 만든다.
        let prog = script(
            t.path(),
            &format!(
                r#"case "$4" in
  *slow.docx) echo $$ > '{}'; exec sleep 5 ;;
  *) mkdir -p "$3/b.docx.qlpreview" && echo '<p>둘째</p>' > "$3/b.docx.qlpreview/Preview.html" ;;
esac"#,
                pid.display()
            ),
        );
        let ql = Arc::new(QuickLook::new(prog, Duration::from_secs(10)));
        let slow = doc(t.path(), "slow.docx");
        let first = {
            let ql = ql.clone();
            std::thread::spawn(move || ql.preview(&slow, 1.0))
        };
        let first_pid = wait_pid(&pid);
        let second = ql.preview(&doc(t.path(), "b.docx"), 2.0).unwrap();
        assert!(second.html.contains("둘째"), "{}", second.html);
        let err = first.join().unwrap().unwrap_err();
        assert!(err.contains("취소"), "{err}");
        assert!(
            !alive(&first_pid),
            "새 요청이 오면 이전 qlmanage를 끝내야 한다"
        );
    }

    #[test]
    fn quicklook_without_preview_html_fails_even_on_exit_zero() {
        let t = tempfile::tempdir().unwrap();
        // 망가진 파일에서 qlmanage는 "did not produce any preview"만 찍고 0으로 끝난다.
        let prog = script(t.path(), "echo 'did not produce any preview'; exit 0");
        let ql = QuickLook::new(prog, Duration::from_secs(5));
        let err = ql.preview(&doc(t.path(), "bad.docx"), 1.0).unwrap_err();
        assert!(err.contains("미리 볼 수 없습니다"), "{err}");
    }

    #[test]
    fn quicklook_returns_preview_html_and_attachment_dir() {
        let t = tempfile::tempdir().unwrap();
        let prog = script(
            t.path(),
            r#"d="$3/a.docx.qlpreview"; mkdir -p "$d" && echo '<img src="Attachment1.png">' > "$d/Preview.html" && echo png > "$d/Attachment1.png""#,
        );
        let ql = QuickLook::new(prog, Duration::from_secs(5));
        let r = ql.preview(&doc(t.path(), "a.docx"), 1.0).unwrap();
        assert!(r.html.contains(r#"src="Attachment1.png""#), "{}", r.html);
        assert!(
            Path::new(&r.dir).join("Attachment1.png").is_file(),
            "{}",
            r.dir
        );
    }

    #[test]
    fn quicklook_keeps_only_the_latest_result_dir() {
        let t = tempfile::tempdir().unwrap();
        let prog = script(
            t.path(),
            r#"d="$3/x.qlpreview"; mkdir -p "$d" && echo '<p>x</p>' > "$d/Preview.html""#,
        );
        let ql = QuickLook::new(prog, Duration::from_secs(5));
        let first = ql.preview(&doc(t.path(), "a.docx"), 1.0).unwrap();
        assert!(
            Path::new(&first.dir).is_dir(),
            "보여 주는 동안은 첨부 폴더가 남아 있어야 한다"
        );
        let second = ql.preview(&doc(t.path(), "b.docx"), 2.0).unwrap();
        assert!(Path::new(&second.dir).is_dir());
        assert!(
            !Path::new(&first.dir).exists(),
            "다음 결과가 오면 이전 임시 폴더를 지운다"
        );
    }

    #[test]
    fn quicklook_older_request_arriving_late_does_not_cancel_the_newer_one() {
        // Tauri는 명령을 스레드 풀에서 돌려, 나중에 보낸 요청이 먼저 들어올 수 있다(개발 모드의 StrictMode는 같은 파일을 두 번 보낸다).
        let t = tempfile::tempdir().unwrap();
        let pid = t.path().join("pid");
        let older_ran = t.path().join("older-ran");
        let prog = script(
            t.path(),
            &format!(
                r#"case "$4" in
  *new.docx) echo $$ > '{}'; sleep 1; mkdir -p "$3/n.qlpreview" && echo '<p>새 요청</p>' > "$3/n.qlpreview/Preview.html" ;;
  *) touch '{}' ;;
esac"#,
                pid.display(),
                older_ran.display()
            ),
        );
        let ql = Arc::new(QuickLook::new(prog, Duration::from_secs(10)));
        let newer = {
            let ql = ql.clone();
            let p = doc(t.path(), "new.docx");
            std::thread::spawn(move || ql.preview(&p, 2.0))
        };
        wait_pid(&pid);
        let err = ql.preview(&doc(t.path(), "old.docx"), 1.0).unwrap_err();
        assert!(err.contains("취소"), "{err}");
        assert!(
            !older_ran.exists(),
            "순번이 낮은 요청은 qlmanage를 띄우지 않는다"
        );
        let r = newer.join().unwrap().unwrap();
        assert!(r.html.contains("새 요청"), "{}", r.html);
    }

    /// 실측한 여러 시트 xlsx의 QL 출력 구조를 본뜬다: 탭 껍데기(Preview.html) + 시트마다 AttachmentN.html.
    fn sheets_output(dir: &Path) {
        let d = dir.join("t.xlsx.qlpreview");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(
            d.join("Preview.html"),
            r#"<html><head><script src="Attachment7.js"></script></head><body onload="initTabViewsInPage();"><div id="wrapper"><iframe id="SheetFrame" src="Attachment2.html"></iframe></div><div class="TabView" id="tabs"><div class="TabViewItem selected"><div class="TabHeader">첫시트</div><a href="Attachment2.html"></a></div><div class="TabViewItem"><div class="TabHeader">둘째 &amp; 셋</div><a href="Attachment5.html"></a></div></div></body></html>"#,
        )
        .unwrap();
        std::fs::write(
            d.join("Attachment2.html"),
            "<table><tr><td>첫 시트 값</td></tr></table>",
        )
        .unwrap();
        std::fs::write(
            d.join("Attachment5.html"),
            "<table><tr><td>둘째 시트 값</td></tr></table>",
        )
        .unwrap();
    }

    #[test]
    fn quicklook_sheets_are_read_from_the_tab_shell_in_order() {
        let t = tempfile::tempdir().unwrap();
        sheets_output(t.path());
        let r = read_output(t.path()).unwrap();
        let names: Vec<_> = r.sheets.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["첫시트", "둘째 & 셋"]);
        assert!(
            r.sheets[0].html.contains("첫 시트 값"),
            "{}",
            r.sheets[0].html
        );
        assert!(
            r.sheets[1].html.contains("둘째 시트 값"),
            "{}",
            r.sheets[1].html
        );
    }

    #[test]
    fn quicklook_sheets_empty_without_tabs() {
        let t = tempfile::tempdir().unwrap();
        let d = t.path().join("one.xlsx.qlpreview");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(
            d.join("Preview.html"),
            "<table><tr><td>한 시트</td></tr></table>",
        )
        .unwrap();
        let r = read_output(t.path()).unwrap();
        assert!(
            r.sheets.is_empty(),
            "탭이 없으면 시트 목록 없이 문서 하나다"
        );
        assert!(r.html.contains("한 시트"));
    }

    #[test]
    fn quicklook_sheets_ignore_tab_links_outside_the_output_dir() {
        let t = tempfile::tempdir().unwrap();
        let d = t.path().join("x.xlsx.qlpreview");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(
            d.join("Preview.html"),
            r#"<div class="TabHeader">a</div><a href="../../etc/passwd"></a><div class="TabHeader">b</div><a href="Attachment2.html"></a><div class="TabHeader">c</div><a href="Attachment3.html"></a>"#,
        )
        .unwrap();
        std::fs::write(d.join("Attachment2.html"), "<p>b</p>").unwrap();
        std::fs::write(d.join("Attachment3.html"), "<p>c</p>").unwrap();
        let r = read_output(t.path()).unwrap();
        let names: Vec<_> = r.sheets.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["b", "c"], "출력 폴더 밖을 가리키는 탭은 버린다");
    }

    /// 실제 `qlmanage`로 저장소의 합성 2시트 xlsx를 미리 본다.
    #[cfg(target_os = "macos")]
    #[test]
    fn quicklook_sheets_real_qlmanage_two_sheet_xlsx() {
        let t = tempfile::tempdir().unwrap();
        let x = t.path().join("두 시트.xlsx");
        std::fs::write(&x, include_bytes!("../fixtures/quicklook/two-sheets.xlsx")).unwrap();
        let ql = QuickLook::new("/usr/bin/qlmanage", Duration::from_secs(10));
        let r = ql.preview(&x, 1.0).unwrap();
        let names: Vec<_> = r.sheets.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["첫시트", "둘째 & 셋"]);
        assert!(
            r.sheets[0].html.contains("첫 시트 값"),
            "{}",
            r.sheets[0].html
        );
    }

    /// 실제 `qlmanage`로 `textutil`이 만든 docx·doc을 미리 본다.
    #[cfg(target_os = "macos")]
    #[test]
    fn quicklook_real_qlmanage_renders_docx_and_doc() {
        let t = tempfile::tempdir().unwrap();
        let txt = t.path().join("문서.txt");
        std::fs::write(&txt, "Quick Look sample sentence\n").unwrap();
        let ql = QuickLook::new("/usr/bin/qlmanage", Duration::from_secs(10));
        for (seq, fmt) in [(1.0, "docx"), (2.0, "doc")] {
            let out = t.path().join(format!("문서.{fmt}"));
            let ok = std::process::Command::new("textutil")
                .args(["-convert", fmt, "-output"])
                .arg(&out)
                .arg(&txt)
                .status()
                .unwrap()
                .success();
            assert!(ok, "textutil -convert {fmt}");
            let r = ql
                .preview(&out, seq)
                .unwrap_or_else(|e| panic!("{fmt}: {e}"));
            assert!(
                r.html.contains("Quick Look sample sentence"),
                "{fmt}: {}",
                r.html
            );
        }
    }
}
