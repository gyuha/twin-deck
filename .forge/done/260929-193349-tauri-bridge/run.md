# RUN — tauri-bridge
- S1 Rust 위임 계층 `service.rs` (Tauri 비의존) — ✅ 단위 테스트 3개 (tempdir, fake 휴지통, 감시 이벤트)
- S2 command/event 등록 + 앱 상태 — ✅ 감시 수신 스레드가 `DirChanged` 이벤트를 emit
- S3 타입 생성 — ✅ tauri-specta 업스트림이 동작. 단 rc.25는 rustc 1.88에서 실패 → rc.21/rc.22/0.0.9 고정. ADR-0011 기록, `bindings_are_up_to_date` 드리프트 테스트
- S4 @twin-deck/ts-client — ✅ Backend 포트, TauriBackend, 인메모리 FakeBackend(Rust와 같은 충돌 규칙), vitest 6 passed
⚠ TauriBackend는 실제 Tauri 런타임에서 호출하는 테스트가 없다(타입 검사만). 브리지 왕복은 M1 수동 확인 대상.
