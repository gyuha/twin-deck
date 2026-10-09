# 실행 기록 — 미리보기 용량 한도 설정 (이슈 없음, 사용자 요청)

직접 처리했다.

## 조각별 결과
- S1 td-config 키 `preview.image_max_mb`(10)·`pdf_max_mb`(10)·`audio_max_mb`(20), 정수 MB, 0은 제한 없음 — ✅ `preview_limits_*` 2건(기본값, 0 허용, 음수·문자열·소수·불리언은 경고+기본값)
- S2 Service가 한도를 보관(`Mutex<PreviewLimits>`)하고 `set_preview_limits`로 갱신 — ✅ 모든 경로(디스크, 압축 안 `read_preview_vfs`, `.cbz`)가 현재 한도를 쓴다. `apply_config`(main.rs)가 시작·설정 파일 재읽기·`set_config_value`·`reset_config_value`에서 호출된다. 테스트 4건: 기본 10/10/20 경계, 한도 올림·줄임·0, 압축·cbz, 설정에서 읽은 값
- S3 gen-types, 설정 화면 항목 3개(미리보기 탭, int), ko·en 사전, docs/06 6.10 — ✅ `preview-limits-setting.test.tsx` 3건
- S4 회귀 — ✅

## 벗어난 것
- 계획(C3)은 "바꾼 값이 서비스에 전달된다(FakeBackend)"였지만, 전달은 Rust 쪽 동작이라 Rust 테스트(C2)로 확인하고 UI 테스트는 설정 저장까지만 본다.
- 명령(`set_config_value`)을 통해 서비스에 반영되는 배선은 Tauri State가 필요해 단위 테스트가 없다. `apply_config(` 호출 지점(main.rs 시작·재읽기, commands.rs 두 곳)을 grep으로 확인했다. 실제 앱에서 설정을 바꾸고 큰 PDF를 열어 보는 확인은 하지 않았다.
- 0(제한 없음)은 `u64::MAX`로 바꾼다. 큰 파일은 통째로 base64가 되어 메모리를 많이 쓰므로 설명에 적었다.

## DoD
C1 td-config 2건, C2 desktop 4건, C3 vitest 3건, C4 wiring grep(main 2 호출·commands 2), C5 docs grep 3·i18n 테스트 통과, C6 tsc·vitest 실패 기준선 2개(1079 통과)·cargo test(desktop 82, td-config 34)·clippy·fmt 통과
