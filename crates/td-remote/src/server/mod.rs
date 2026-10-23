//! Twin Deck Remote 서버: 앱 안에서 도는 SSH 서버(비밀번호 인증, 영속 호스트키).
//! 채널 처리(SFTP·셸)는 뒤 단계가 붙인다.

mod host_key;
mod jail;
mod sftp;
mod shell;

use std::collections::HashMap;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use russh::server::{Auth, ChannelOpenHandle, Msg, Server as _, Session};
use russh::{Channel, ChannelId};

use crate::{RemoteError, Result};

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub bind: String,
    /// 0이면 OS가 빈 포트를 고른다(`ServerHandle::local_addr`에 실제 값).
    pub port: u16,
    pub root: PathBuf,
    pub allow_write: bool,
    /// 원격 셸(PTY) 허용. 쓰기 허용과 별개다.
    pub allow_shell: bool,
    pub user: String,
    pub password: String,
    pub host_key_path: PathBuf,
}

/// 켜진 서버. `stop`하거나 버리면 닫힌다.
pub struct ServerHandle {
    pub local_addr: std::net::SocketAddr,
    pub fingerprint: String,
    rt: Option<tokio::runtime::Runtime>,
}

impl ServerHandle {
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        // 비동기 문맥 안에서 버려도 패닉하지 않게 백그라운드로 종료한다.
        if let Some(rt) = self.rt.take() {
            rt.shutdown_background();
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Clone)]
struct Server {
    cfg: Arc<ServerConfig>,
    jail: jail::Jail,
}

impl russh::server::Server for Server {
    type Handler = Handler;
    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> Handler {
        Handler {
            cfg: self.cfg.clone(),
            jail: self.jail.clone(),
            channels: HashMap::new(),
            pty_size: (80, 24),
            shell: None,
        }
    }
}

struct Handler {
    cfg: Arc<ServerConfig>,
    jail: jail::Jail,
    channels: HashMap<ChannelId, Channel<Msg>>,
    pty_size: (u16, u16),
    shell: Option<shell::Shell>,
}

impl russh::server::Handler for Handler {
    type Error = anyhow::Error;

    async fn auth_password(
        &mut self,
        user: &str,
        password: &str,
    ) -> std::result::Result<Auth, Self::Error> {
        if user == self.cfg.user && !self.cfg.password.is_empty() && password == self.cfg.password {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
                partial_success: false,
            })
        }
    }

    async fn channel_open_session(
        &mut self,
        channel: Channel<Msg>,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        self.channels.insert(channel.id(), channel);
        reply.accept().await;
        Ok(())
    }

    async fn channel_eof(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        session.close(channel)?;
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(russh::Pty, u32)],
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        self.pty_size = (
            col_width.min(u16::MAX as u32) as u16,
            row_height.min(u16::MAX as u32) as u16,
        );
        session.channel_success(channel)?;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        // 셸은 PTY 요청 뒤, 허용 설정이 켜져 있을 때, 한 채널에 하나만 연다.
        let ok = self.cfg.allow_shell && self.shell.is_none();
        let shell = if ok {
            // 이 채널의 메시지는 핸들러 콜백(data·window_change)으로 받는다.
            self.channels.remove(&channel);
            shell::Shell::open(self.jail.root(), self.pty_size, session.handle(), channel).ok()
        } else {
            None
        };
        match shell {
            Some(s) => {
                self.shell = Some(s);
                session.channel_success(channel)?;
            }
            None => session.channel_failure(channel)?,
        }
        Ok(())
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        if let Some(s) = &self.shell {
            s.write(data);
        }
        Ok(())
    }

    async fn window_change_request(
        &mut self,
        _channel: ChannelId,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        if let Some(s) = &self.shell {
            s.resize(
                col_width.min(u16::MAX as u32) as u16,
                row_height.min(u16::MAX as u32) as u16,
            );
        }
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel_id: ChannelId,
        name: &str,
        session: &mut Session,
    ) -> std::result::Result<(), Self::Error> {
        match (name, self.channels.remove(&channel_id)) {
            ("sftp", Some(channel)) => {
                session.channel_success(channel_id)?;
                let handler = sftp::SftpHandler::new(self.jail.clone(), self.cfg.allow_write);
                russh_sftp::server::run(channel.into_stream(), handler).await;
            }
            _ => session.channel_failure(channel_id)?,
        }
        Ok(())
    }
}

/// 서버 SSH 설정(이슈 #108). 서버도 `KEEPALIVE_INTERVAL`마다 클라이언트에 keepalive를 보내 NAT·방화벽이 쉬는 연결을 버리지 않게 하고,
/// 3번 연속 답이 없으면 죽은 연결로 보고 정리한다. 그래서 쉬고 있다는 이유만으로 끊는 무활동 제한(russh 기본 600초)은 없앤다 —
/// keepalive를 보내지 않는 클라이언트(옛 버전 Twin Deck, 일반 `sftp`·`ssh`)도 살아 있는 동안은 끊기지 않는다.
fn ssh_config(key: russh::keys::PrivateKey, keepalive: Duration) -> russh::server::Config {
    russh::server::Config {
        auth_rejection_time: Duration::from_millis(300),
        auth_rejection_time_initial: Some(Duration::from_millis(0)),
        keys: vec![key],
        inactivity_timeout: None,
        keepalive_interval: Some(keepalive),
        keepalive_max: 3,
        ..Default::default()
    }
}

/// 서버를 켠다. 바인딩에 실패하면(포트 사용 중 등) 오류.
pub fn start(cfg: ServerConfig) -> Result<ServerHandle> {
    start_with_keepalive(cfg, crate::KEEPALIVE_INTERVAL)
}

/// `keepalive` 간격으로 서버를 켠다(시험은 짧게 쓴다).
fn start_with_keepalive(cfg: ServerConfig, keepalive: Duration) -> Result<ServerHandle> {
    let other = |e: &dyn std::fmt::Display| RemoteError::Other(e.to_string());
    let jail = jail::Jail::new(&cfg.root).map_err(|e| other(&e))?;
    let key = host_key::load_or_create(&cfg.host_key_path)?;
    let fingerprint = host_key::fingerprint(&key);
    let std_listener = TcpListener::bind((cfg.bind.as_str(), cfg.port)).map_err(|e| other(&e))?;
    std_listener.set_nonblocking(true).map_err(|e| other(&e))?;
    let local_addr = std_listener.local_addr().map_err(|e| other(&e))?;
    let rt = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .map_err(|e| other(&e))?;
    let config = ssh_config(key, keepalive);
    let mut server = Server {
        cfg: Arc::new(cfg),
        jail,
    };
    rt.spawn(async move {
        if let Ok(listener) = tokio::net::TcpListener::from_std(std_listener) {
            let _ = server.run_on_socket(Arc::new(config), &listener).await;
        }
    });
    Ok(ServerHandle {
        local_addr,
        fingerprint,
        rt: Some(rt),
    })
}

#[cfg(test)]
mod tests;
