# 실행 기록 — 설정 화면 (Spacedrive primitives, 즉시 저장) (part 2/2)

실행 방식: fg-next all 드라이브 안에서 워크플로우 없이 직접 실행. TDD on — 조각마다 실패하는 테스트를 먼저 썼다. 브랜치 `feature/spacedrive-design-tokens`, 이번 드라이브는 작업 트리에 앞 작업 변경이 남아 있어 커밋하지 않았다.

## 조각별 결과
- S1 td-config 키 쓰기/지우기(`toml_edit`) — ✅ 계획대로 (`set_user_value`/`reset_user_value`, 테스트 4개: 주석·다른 키 보존, 파일·테이블 생성, 빈 테이블 정리, 문법 오류 거부)
- S2 Tauri 명령·bindings·ts-client — ⚠ 2건: ① specta가 `i64`(BigInt)를 거부해 `ConfigValue::Int`를 `i32`로 했다 ② `reveal_config_dir` 명령을 추가했다(계획의 "설정 폴더 열기 버튼"에 필요했다). 쓰기 명령은 새 `Loaded`를 응답으로 돌려주고 `ConfigStore::refresh`가 즉시 다시 읽는다
- S3 primitives 설치, `@source`, 액션 `core.settings.open`(Mod+,)과 `settings` 스코프 — ⚠ 계획에 없던 필수 작업 1건: primitives가 쓰는 radix 변형(`radix-state-checked:` 등 9종)을 Tailwind v4가 몰라서 스위치가 켜져도 색이 안 바뀐다. `index.css`에 `@custom-variant`를 정의하고, 빠진 것이 없는지 보는 가드 테스트를 추가했다(정의 전 실패 → 후 통과)
- S4 설정 화면(섹션 5개, 항목 14개, 기본값으로, 설정 폴더 열기, 문법 오류 상태) — ⚠ 2건: ① primitives의 `Select`가 트리거에 `aria-label`을 넘기지 않아 접근성 이름은 항목 그룹이 맡는다 ② "기본값으로"는 "사용자 파일에 그 키가 있을 때"가 아니라 "현재 값이 기본값과 다를 때"로 판단한다(별도 명령 없이 번들된 기본값과 비교). 사용자가 기본값과 같은 값을 파일에 명시해 둔 경우에는 버튼이 안 보인다
- S5 THIRD_PARTY_NOTICES, docs/07, docs/01 — ✅ 계획대로 (CFG-12 행 추가)

## DoD (baseline → after)
1. `cargo test -p td-config user_value` — 0개 실행 → 4 passed
2. `bun run --cwd apps/desktop test -- settings` — 파일 없음 → 15 passed
3. `@spacedrive/primitives` in package.json — 0 → 1
4. `core.settings.open` in defaults.ts — 0 → 2 (액션 정의와 기본 키)
5. `toml_edit` in td-config Cargo.toml — 0 → 1
6. `cargo test --workspace` — 통과 → 통과 (회귀 방지)
7. `bun run test` — desktop 280 → 296 통과 (설정 화면 15 + radix 변형 가드 1), ts-client 42 → 44
8. typecheck/fmt/clippy — 0 → 0 (회귀 방지)
9. `cargo test -p twin-deck-desktop up_to_date` — 통과 → 통과 (새 명령 추가 후 bindings 재생성)
10. 실제 앱 UAT — 미실시 (사람이 `Cmd+,`로 열어 보는 확인)

## 계획 대비 차이·판단
- 테스트 환경: jsdom에 Radix가 쓰는 포인터 캡처 API가 없어 `test-setup.ts`에 호출만 막는 shim을 넣었다. 실제 브라우저 동작은 검증하지 못한다.
- `Select`의 드롭다운과 스위치의 시각 상태(켜짐 색, 선택 강조)는 jsdom으로 볼 수 없다. 결과 CSS에 `data-state=checked`, `data-highlighted` 규칙이 들어간 것까지만 확인했다.
- 입력창은 Enter나 포커스 이탈로 저장하고, 빈 값은 저장하지 않고 원래 값으로 되돌린다.
- 미확인: 실제 Tauri 앱에서의 동작. 특히 ① `config.toml`에 쓴 뒤 주석이 남는지(단위 테스트는 통과) ② 설정을 바꿨을 때 화면 반영(명령 응답으로 직접 적용하므로 이벤트에 의존하지 않는다) ③ 테마·스위치의 실제 모양.
