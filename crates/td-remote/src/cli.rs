//! 앱 실행 파일의 데몬 모드 인수(`--serve`, `--listen <주소>`)를 해석한다.

use std::net::SocketAddr;

/// 주소를 지정하지 않으면 이 컴퓨터 안(SSH 터널용)에서만 연다.
pub const DEFAULT_LISTEN: &str = "127.0.0.1:6868";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    pub listen: SocketAddr,
}

impl ServeArgs {
    /// 루프백이 아닌 주소에 열린다. TLS가 없으니 경고해야 한다.
    pub fn external(&self) -> bool {
        !self.listen.ip().is_loopback()
    }
}

/// `--serve`가 없으면 None. 있으면 해석 결과(잘못된 주소면 오류 문구).
pub fn serve_args(args: &[String]) -> Option<Result<ServeArgs, String>> {
    if !args.iter().any(|a| a == "--serve") {
        return None;
    }
    let mut listen = DEFAULT_LISTEN.to_string();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        if let Some(v) = a.strip_prefix("--listen=") {
            listen = v.to_string();
        } else if a == "--listen" {
            match it.next() {
                Some(v) => listen = v.clone(),
                None => {
                    return Some(Err(
                        "--listen 뒤에 주소(예: 100.64.1.2:6868)가 필요하다".into()
                    ))
                }
            }
        }
    }
    Some(
        listen
            .parse()
            .map(|listen| ServeArgs { listen })
            .map_err(|_| format!("--listen 주소를 해석할 수 없음: {listen} (예: 100.64.1.2:6868)")),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn serve가_없으면_데몬_모드가_아니다() {
        assert_eq!(serve_args(&args(&["/tmp"])), None);
        assert_eq!(serve_args(&args(&[])), None);
    }

    #[test]
    fn 기본은_루프백_6868이다() {
        let a = serve_args(&args(&["--serve"])).unwrap().unwrap();
        assert_eq!(a.listen, DEFAULT_LISTEN.parse().unwrap());
        assert!(!a.external());
    }

    #[test]
    fn listen으로_주소를_바꾸면_외부로_본다() {
        for v in [
            args(&["--serve", "--listen", "100.64.1.2:7000"]),
            args(&["--listen=100.64.1.2:7000", "--serve"]),
        ] {
            let a = serve_args(&v).unwrap().unwrap();
            assert_eq!(a.listen, "100.64.1.2:7000".parse().unwrap());
            assert!(a.external());
        }
        let a = serve_args(&args(&["--serve", "--listen", "127.0.0.1:7000"]))
            .unwrap()
            .unwrap();
        assert!(!a.external());
    }

    #[test]
    fn 잘못된_listen은_오류다() {
        assert!(serve_args(&args(&["--serve", "--listen", "abc"]))
            .unwrap()
            .is_err());
        assert!(serve_args(&args(&["--serve", "--listen"]))
            .unwrap()
            .is_err());
    }
}
