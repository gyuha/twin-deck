# RUN — 설정 화면 "F키" 섹션 (fkeys-settings-ui)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 설정 화면 섹션·F키 행(선택 메뉴 + 앱 경로 입력) — ✅ 계획대로. 컨트롤 타입 `fkey`와 `FKeyControl` 컴포넌트 신설. 선택 메뉴 항목: "기본값 (현재: <내장 동작>)" · "해제" · pane 스코프 액션 · "애플리케이션 실행". 인수가 필요한 액션(제목에 "(인수:")은 뺐다 — 인수 없이 걸면 실행 때마다 오류가 나기 때문
- S2 선택·입력 → config 저장 → 키 입력 → 앱 실행 종단 연결 — ✅ 계획대로. T10이 화면 선택 → 경로 입력 → 저장 → F3 입력 → `FakeBackend.launched` 기록까지 한 번에 확인하고, "기본값으로"가 앱 경로까지 비우는 것도 확인
- S3 기존 설정 테스트 갱신과 전체 회귀·품질 확인 — ✅ 계획대로 (`settings.test.tsx`의 섹션 목록에 "F키" 추가: 의도된 변경)

## DoD baseline → after
1. T9, T10: 없음 → 통과 (전진). `fkey-bindings.test.tsx` 12개 전부 통과.
2. `settings.test.tsx` 섹션 목록 단언을 6개 → 7개("폴더 단축키" 다음 "F키")로 갱신, 통과.
3. 전체 완료 조건: C1 typecheck 0 · C2 cargo test --workspace 0, vitest 432 passed·실패는 기존 pdf-preview 1건 · C3 12개 테스트 이름 각각 ✓ · C4 launch_app 3종 ok · C5 fmt 0, clippy 0, up_to_date 0.
4. 실제 앱 UAT(외부 앱이 실제로 뜨는 것)는 자동 검사 범위 밖이라 사람이 확인한다 — 검증 한계로 명시.

## 발견한 것
- "기본값으로" 버튼은 `fkeys.Fn`만 지우면 앱 경로가 남아 있어서, F키 행에서는 `fkey_apps.Fn`도 함께 지운다.
- Radix Select는 빈 문자열 값을 허용하지 않아, 저장값 ""(기본값)을 화면에서만 "default"로 바꿔 쓴다.
- 키 충돌 감지(같은 키를 keybindings.toml이 덮는 경우 설정 화면에 알림)는 비목표라 하지 않았다. 지금은 섹션 설명에 "keybindings.toml이 우선"이라고만 적었다.
