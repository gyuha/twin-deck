//! 서버의 PTY 셸 채널. `td-terminal`로 셸을 띄우고 출력은 SSH 채널로, 입력·크기 변경은 PTY로 중계한다.

use std::path::Path;

use russh::server::Handle;
use russh::ChannelId;
use td_terminal::{TermEvent, Terminals};

pub struct Shell {
    terms: Terminals,
    id: u32,
}

impl Shell {
    /// 셸을 `root`에서 연다. 출력·종료는 tokio 작업이 SSH 채널로 보낸다.
    pub fn open(
        root: &Path,
        size: (u16, u16),
        handle: Handle,
        channel: ChannelId,
    ) -> Result<Self, td_terminal::TerminalError> {
        let (terms, rx) = Terminals::new();
        let id = terms.open("default", root, size.0, size.1)?;
        // 블로킹 수신(std 채널)을 비동기 쪽으로 순서대로 넘긴다.
        let (tx, mut out) = tokio::sync::mpsc::unbounded_channel();
        std::thread::spawn(move || {
            for ev in rx {
                if tx.send(ev).is_err() {
                    break;
                }
            }
        });
        tokio::spawn(async move {
            while let Some(ev) = out.recv().await {
                match ev {
                    TermEvent::Output { data, .. } => {
                        if handle.data(channel, data).await.is_err() {
                            break;
                        }
                    }
                    TermEvent::Exit { code, .. } => {
                        let _ = handle.exit_status_request(channel, code.unwrap_or(0)).await;
                        let _ = handle.eof(channel).await;
                        let _ = handle.close(channel).await;
                        break;
                    }
                }
            }
        });
        Ok(Self { terms, id })
    }

    pub fn write(&self, data: &[u8]) {
        let _ = self.terms.write(self.id, data);
    }

    pub fn resize(&self, cols: u16, rows: u16) {
        let _ = self.terms.resize(self.id, cols, rows);
    }
}

impl Drop for Shell {
    fn drop(&mut self) {
        let _ = self.terms.close(self.id);
    }
}
