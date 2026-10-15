//! Twin Deck Remote 서버: 앱 안에서 도는 SSH 서버(비밀번호 인증, 영속 호스트키).
//! 채널 처리(SFTP·셸)는 뒤 단계가 붙인다.

mod host_key;
mod jail;
mod sftp;

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
        }
    }
}

struct Handler {
    cfg: Arc<ServerConfig>,
    jail: jail::Jail,
    channels: HashMap<ChannelId, Channel<Msg>>,
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

/// 서버를 켠다. 바인딩에 실패하면(포트 사용 중 등) 오류.
pub fn start(cfg: ServerConfig) -> Result<ServerHandle> {
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
    let config = russh::server::Config {
        auth_rejection_time: Duration::from_millis(300),
        auth_rejection_time_initial: Some(Duration::from_millis(0)),
        keys: vec![key],
        ..Default::default()
    };
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
