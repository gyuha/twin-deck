# RUN — td-watch
- S1 DirWatcher API + 50ms 디바운스 — ✅ notify 8 직접 사용, 감시 경로는 canonicalize(macOS /var→/private/var)하고 이벤트는 호출자가 넘긴 원래 경로로 돌려준다
- S2 watch_external_change — ✅ 생성/이름 변경/삭제 각각 수신
- S3 unwatch 후 무이벤트 — ✅ (+ 감시하지 않는 디렉터리 무시 테스트 추가)
DoD: cargo test -p td-watch 3 passed.
