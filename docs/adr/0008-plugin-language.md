# ADR-0008. 플러그인 언어 (Lua 기본안, 연기)

- 상태: Proposed
- 날짜: 2026-09-29

## 맥락

Marta는 Lua 5.4.7을 번들하고 플러그인을 Lua로 작성한다(`plugin{}`, `action{}`, `isApplicable`, `apply`). Spacedrive는 wasmer 기반 wasm 확장 구조를 갖는다. 플러그인은 요청한 Marta 기능이지만 M4 항목이며 액션 시스템이 먼저 검증되어야 API를 확정할 수 있다. Marta Lua API의 전체 표면은 확인하지 못했다.

## 결정 (잠정)

플러그인 언어의 기본안은 Lua 5.4(`mlua`)로 한다. 다만 M4 착수 전까지 확정하지 않는다. 그때까지 M1~M3에서 액션 레지스트리와 컨텍스트 모델을 검증한다. 확정 시 이 ADR을 Accepted로 바꾸거나 새 ADR로 대체한다.

## 결과

- 장점(Lua 채택 시): Marta 개념과 1:1로 대응하고 Rust 임베딩이 성숙하며 가볍다.
- 단점: Lua 생태계와 타입 안전성의 한계. 샌드박스 설계 부담(`os.execute` 등 차단). Spacedrive의 wasm 구조는 쓰지 않는다.
- 후속: M4에서 API 문서(`docs/plugin-api.md`) 작성, 샌드박스 검증.

## 검토한 대안

| 대안 | 비고 |
|---|---|
| TypeScript/JavaScript 플러그인 (웹뷰 안에서 실행) | 프론트엔드 스택과 일치하지만 샌드박스가 어렵고 Marta 스크립트 개념과 다름 |
| wasm (Spacedrive 방식) | 무겁고 작성 진입 장벽이 높음 |
| 플러그인 미지원 | Gadgets로 대부분의 외부 실행 요구는 충족되나 Marta 패리티 미달 |
