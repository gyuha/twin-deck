# RUN — m2-bootstrap-guard
- S1 bootstrap.tsx(`start`, `defaultDeps`)와 얇은 main.tsx — ✅ bootstrap.test.tsx 2 passed (mockIPC: 정상 부팅에서 resolve_directory/list_dir/watch_dir 호출, ACL 거부 시 "시작 실패" alert)
- S2 capabilities_cover_plugins — ✅ 변이 확인: capability에서 core:default를 빼면 이 테스트가 실패함을 확인하고 복원
DoD: cargo test -p twin-deck-desktop 5 passed, bootstrap vitest 2 passed.
