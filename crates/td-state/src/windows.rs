/// 새 창의 레이블: `win-2`, `win-3`, … 중 쓰이지 않은 가장 작은 것. (`main`이 1번 창이다.)
pub fn next_window_label(existing: &[String]) -> String {
    (2..)
        .map(|n| format!("win-{n}"))
        .find(|l| !existing.contains(l))
        .expect("무한 반복자")
}

/// Tauri capability의 창 패턴(`main`, `win-*`)이 레이블과 맞는가. 끝의 `*`만 지원한다.
pub fn pattern_matches(pattern: &str, label: &str) -> bool {
    match pattern.strip_suffix('*') {
        Some(prefix) => label.starts_with(prefix),
        None => pattern == label,
    }
}

/// 실제 창을 만드는 쪽. 테스트는 기록하는 fake를 쓴다.
pub trait Spawner {
    fn spawn(&self, label: &str) -> Result<(), String>;
}

/// 겹치지 않는 레이블로 새 창을 연다. 실패하면 오류를 돌려주고 레이블은 쓰이지 않은 것으로 남는다.
pub fn open_new_window<S: Spawner>(spawner: &S, existing: &[String]) -> Result<String, String> {
    let label = next_window_label(existing);
    spawner.spawn(&label)?;
    Ok(label)
}
