# ADR-0011. 타입 생성은 tauri-specta 업스트림 릴리스(고정 버전) 사용

- 상태: Accepted
- 날짜: 2026-09-29

## 맥락

docs/03은 Spacedrive가 specta의 git fork(`jamiepine/specta`)를 쓰며, twin-deck이 업스트림 릴리스로 충분한지 스캐폴딩 때 확인하도록 남겼다. 로컬 툴체인은 rustc 1.88이다.

## 결정

crates.io의 업스트림 릴리스를 정확한 버전으로 고정해서 쓴다: `tauri-specta =2.0.0-rc.21`, `specta =2.0.0-rc.22`, `specta-typescript =0.0.9`. 생성 파일은 `packages/ts-client/src/generated/bindings.ts`에 커밋하고, `cargo test -p twin-deck-desktop bindings_are_up_to_date`가 커밋된 파일과 재생성 결과가 다르면 실패한다(타입 드리프트 방지). 갱신은 `UPDATE_BINDINGS=1`을 붙여 같은 테스트를 실행한다(`just gen-types`).

## 결과

- 확인한 사실: 최신 `rc.25` 계열은 rustc 1.88에서 컴파일되지 않는다(`specta`가 불안정 기능 `debug_closure_helpers`를 사용). `rc.21/rc.22/0.0.9` 조합은 컴파일되고 명령, 이벤트, 타입 생성이 동작한다. fork는 필요하지 않았다.
- 제약: 세 크레이트는 `=`로 고정한다. 툴체인을 올린 뒤 rc.25 이상으로 옮길 때 이 ADR을 갱신한다.
- 제약: specta는 `u64`/`i64`를 TS로 내보내지 않는다. 크기와 시각은 `f64`(JS 숫자)로 전달한다.
- 워크스페이스는 `.cargo/config.toml`의 `incompatible-rust-versions = "fallback"`로 rustc 1.88과 호환되는 의존성 버전을 고른다.

## 검토한 대안

| 대안 | 기각 이유 |
|---|---|
| Spacedrive의 specta git fork | 업스트림 릴리스로 충분해서 불필요 |
| 수기 TS 타입 + 드리프트 테스트 | 생성이 동작하므로 불필요 |
| rc.25 + rustc 업그레이드 | 개발 머신 툴체인을 바꿔야 함 |
