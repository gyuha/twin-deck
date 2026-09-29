fn main() {
    // frontendDist가 없으면 generate_context!가 실패하므로 빈 디렉터리를 보장한다.
    let _ = std::fs::create_dir_all("../dist");
    tauri_build::build();
}
