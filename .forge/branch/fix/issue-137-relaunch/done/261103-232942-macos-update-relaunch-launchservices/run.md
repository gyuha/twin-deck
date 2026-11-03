# RUN — macOS에서 업데이트 뒤 앱을 LaunchServices로 다시 띄운다 (task 213)
실행: Paseo bridge 역할(bridge#7F59, claude-opus-5-5, auto) · 검토: review 역할(review#2150, codex/gpt-6-sol, 읽기 전용)

- S1 ✓ `relaunch.rs`: `app_bundle_of`, `relaunch_command`. red(3 실패) → green(4 통과) — 커밋 d5c70d0
- S2 ✓ `install_update`: macOS 번들이면 relaunch 명령 spawn 뒤 `app.exit(0)`, 아니면 `app.restart()` — 커밋 d5c70d0
- 제자리 고침 1회(replan-round 1/3, repaired-by: fg-loop): review 지적 반영 — `open -n`(다중 실행에서 다른 인스턴스만 활성화되던 경로), `open` 실패 시 `exec "$3"`(실행 파일 직접 실행) 대체. red(3 실패) → green(6 통과) — 커밋 41b53ca

## Rulings
- review의 [높음] `open` 실패 시 미재시작, [중간] `-n` 없음은 계획 목표("다시 띄운다") 미충족 경로로 보고 같은 작업을 제자리에서 고침.
- review의 [낮음] 종료 지연 시 UI가 '설치 중'에 머무름: 종료를 막는 코드가 없어 이번 범위에서 제외.

## 남은 위험
- 실제 업데이트 뒤 TCC 팝업·드롭 회복은 미확인(제보자 확인 필요). "새로 시작할 때 팝업이 안 뜨는" 경우는 이 수정으로 설명되지 않음.
- `open` 실패 대체 경로로 뜬 경우는 LaunchServices를 거치지 않아 원래 증상이 남을 수 있음. 30초 대기 상한을 넘기면 새 인스턴스가 single-instance로 옛 쪽에 넘겨져 앱이 남지 않을 수 있음(드묾).
