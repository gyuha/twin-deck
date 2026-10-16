# run — Twin Deck Remote 설정 키와 브리지 (4/7)

bridge-wiring-author 에이전트에 위임해 실행하고, 결과는 직접 다시 돌려 확인했다.

- S1 설정 구조체·기본값·검증 — ✅ `[remote_server]` enabled=false·bind=127.0.0.1·port=2222·root=""·allow_write=false·allow_shell=false·user=twindeck. td-config 테스트 3개 추가
- S2 `Service` 시작·정지·상태·비밀번호 — ✅ 키체인 계정 `twindeck-remote-server`, `SecretStore` 주입, 앱 시작 시 enabled면 자동 켜기
- S3 Tauri 명령 → bindings → backend.ts → tauri.ts → fake.ts — ✅ `remoteServerStart/Stop/Status`, `setRemoteServerPassword`

DoD baseline → after:
- `cargo test -p twin-deck-desktop up_to_date` : 통과 → 통과(재생성 후)
- `cargo test -p twin-deck-desktop remote_server` : 0개 → 4 passed
- clippy -D warnings (td-remote·td-config·twin-deck-desktop), fmt --check, tsc, vitest 전체(1378 통과): 통과
- ⚠ 계획의 `grep -c 'enabled = true\|0.0.0.0' default.toml → 0`은 계획 오류였다: 기존 `global_hotkey_enabled = true`가 걸려 1이다(규칙 (a): 파일 전체를 소유하지 않는 정확 개수). `[remote_server]` 절에는 해당 문자열이 없음을 직접 확인했다.

참고·한계:
- `apps/desktop/src/i18n/rust.ts`에 새 Rust 한글 문구를 등록했다(`i18n-rust-messages` 테스트 요구). 이전 part에서 빠져 있던 문구 3개도 함께.
- 수신 주소는 `local_addr` 하나만 돌려준다(0.0.0.0 바인드의 로컬 IP 나열은 안 함). 비밀번호를 바꿔도 이미 켜진 서버에는 다음 켤 때부터 적용.
- 키체인은 실제로 접근해 보지 않았다(서비스 테스트는 가짜 저장소).
- vitest `preview.test.tsx` 한 건이 첫 실행에 한 번 떨어졌다가 재실행에 통과(간헐).
