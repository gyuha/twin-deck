# ADR-0001. Spacedrive와 기술 스택 정렬

- 상태: Accepted
- 날짜: 2026-09-29

## 맥락

요청 사항은 "기술 스펙을 Spacedrive와 동일하게 맞추고 재사용 가능한 소스는 그대로 가져다 쓴다"이다. Spacedrive v2(기준 커밋 `6dfeccf`)는 Rust(Tokio) 코어, Tauri 2 데스크톱 셸, React 19, Vite, Tailwind v4, TanStack Query, Bun, Specta 타입 생성을 쓴다.

## 결정

핵심 스택을 Spacedrive와 같게 한다: Rust + Tokio, Tauri 2, React 19, Vite, Tailwind v4, TanStack Query/Table/Virtual, zustand, Bun, `just`, specta 계열 타입 생성. 버전은 [03](../03-tech-stack.md)의 표를 출발점으로 삼되 착수 시 확인한다.

Spacedrive가 쓰지만 twin-deck 요구에 불필요한 기술(데몬, SeaORM/SQLite, iroh, LanceDB, OpenDAL, wasmer, React Native, react-router)은 채택하지 않는다.

## 결과

- 장점: Spacedrive 코드를 이식할 때 의존성과 관용구가 맞아 변환 비용이 낮다.
- 단점: Spacedrive가 alpha이고 specta가 git fork라 상류의 도구 선택이 불안정하다. twin-deck은 상류를 의존하지 않고 복사본만 소유해 위험을 제한한다.
- 후속: specta 배포본 결정(M0).

## 검토한 대안

| 대안 | 기각 이유 |
|---|---|
| Electron + Node | 요청한 스택 정렬에 반함. Rust 크레이트 이식 불가 |
| Tauri + Svelte/Solid | Spacedrive React 코드 이식 불가 |
