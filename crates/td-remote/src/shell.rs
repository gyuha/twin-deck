//! 원격 셸(SSH PTY 채널) 클라이언트. 블로킹 API: 입력은 `write`, 출력·종료는 `events`로 받는다.

use std::sync::mpsc::{channel as std_channel, Receiver};
use std::sync::Arc;

use russh::{client, ChannelMsg, ChannelWriteHalf};

use crate::sftp::{block, client_for, map_ssh, Client, Rt, TIMEOUT};
use crate::{RemoteError, Result, SftpConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellEvent {
    /// 셸이 낸 바이트. UTF-8 글자 중간에서 잘릴 수 있다.
    Output(Vec<u8>),
    /// 셸이 끝났거나 연결이 끊겼다.
    Exit(Option<u32>),
}

pub struct ShellSession {
    rt: Arc<Rt>,
    writer: ChannelWriteHalf<client::Msg>,
    pub events: Receiver<ShellEvent>,
    // 연결을 살려 두려고 들고 있는다.
    _handle: client::Handle<Client>,
}

impl ShellSession {
    /// 접속해 PTY 셸을 연다. 서버가 셸을 허용하지 않으면 `Other`.
    pub fn open(cfg: SftpConfig, cols: u16, rows: u16) -> Result<Self> {
        let rt = Arc::new(Rt(Some(
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .map_err(|e| RemoteError::Other(e.to_string()))?,
        )));
        let (handle, channel) = block(&rt, async {
            let config = Arc::new(client::Config::default());
            let (handler, failure) = client_for(&cfg);
            let mut handle = tokio::time::timeout(
                TIMEOUT,
                client::connect(config, (cfg.host.as_str(), cfg.port), handler),
            )
            .await
            .map_err(|_| RemoteError::Unreachable)?
            .map_err(|e| failure.lock().unwrap().take().unwrap_or_else(|| map_ssh(e)))?;
            let auth = handle
                .authenticate_password(cfg.user.as_str(), cfg.password.as_str())
                .await
                .map_err(map_ssh)?;
            if !auth.success() {
                return Err(RemoteError::Auth);
            }
            let channel = handle.channel_open_session().await.map_err(map_ssh)?;
            channel
                .request_pty(true, "xterm-256color", cols.into(), rows.into(), 0, 0, &[])
                .await
                .map_err(map_ssh)?;
            channel.request_shell(true).await.map_err(map_ssh)?;
            Ok((handle, channel))
        })?;
        let (mut reader, writer) = channel.split();
        let (tx, events) = std_channel();
        // 요청 응답(성공·실패)을 먼저 본다: 실패면 셸이 허용되지 않은 것이다.
        let first = block(&rt, async {
            // pty 요청과 셸 요청의 응답이 차례로 온다. 어느 쪽이든 실패면 셸이 허용되지 않은 것이다.
            let mut replies = 0;
            while replies < 2 {
                match reader.wait().await {
                    Some(ChannelMsg::Success) => replies += 1,
                    Some(ChannelMsg::Failure) => {
                        return Err(RemoteError::Other(
                            "서버가 원격 셸을 허용하지 않습니다".into(),
                        ))
                    }
                    Some(_) => {}
                    None => return Err(RemoteError::Unreachable),
                }
            }
            Ok(())
        });
        first?;
        rt.spawn(async move {
            let mut code = None;
            loop {
                match reader.wait().await {
                    Some(ChannelMsg::Data { data }) => {
                        if tx.send(ShellEvent::Output(data.to_vec())).is_err() {
                            return;
                        }
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => code = Some(exit_status),
                    Some(ChannelMsg::Close) | None => break,
                    Some(_) => {}
                }
            }
            let _ = tx.send(ShellEvent::Exit(code));
        });
        Ok(Self {
            rt,
            writer,
            events,
            _handle: handle,
        })
    }

    pub fn write(&self, data: &[u8]) -> Result<()> {
        let w = &self.writer;
        block(&self.rt, async { w.data(data).await.map_err(map_ssh) })
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let w = &self.writer;
        block(&self.rt, async {
            w.window_change(cols.into(), rows.into(), 0, 0)
                .await
                .map_err(map_ssh)
        })
    }

    /// 셸을 끝낸다(채널을 닫는다).
    pub fn close(&self) {
        let w = &self.writer;
        let _ = block(&self.rt, async { w.close().await });
    }
}
