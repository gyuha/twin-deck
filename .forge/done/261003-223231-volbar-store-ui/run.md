# RUN — 드라이브 바: 볼륨 선택·언마운트·남은 용량 표시 (volbar-store-ui)

실행 방식: 메인 세션에서 직접 실행(Dynamic Workflow 없음, `running.md` 없음).

## 슬라이스별 결과
- S1 `lib/volumes.ts`(`volumeOf`, `isInside`)와 단위 테스트 — ✅ 계획대로 (경로 경계 규칙: `/Volumes/USB2`는 `/Volumes/USB` 밖)
- S2 스토어: `volumes`/`diskSpace` 상태, `refreshVolumes`, `selectVolume`, `unmountVolume`, 갱신 시점 — ✅ 계획대로. 갱신 시점은 (a) 활성 탭 위치가 바뀔 때(스토어 구독: 이동·탭 전환·복원), (b) `reloadAll`(파일 작업 뒤 남은 용량), (c) 앱 시작, (d) 창 포커스 복귀. 언마운트는 먼저 시도하고 성공했을 때만 볼륨 안의 모든 탭(배경 탭 포함)을 홈으로 옮긴다
- S3 `DriveBar.tsx`와 `Pane` 연결 — ✅ 계획대로 (윗줄 볼륨 버튼 + 아랫줄 현재 볼륨/남은 용량/언마운트). 계획에 없던 변경: `formatSize`는 10 이상이면 소수점을 버려(`74 GB`) 이미지의 `73.8 G 남음`과 달라서 용량 전용 `formatSpace`(항상 소수 한 자리)를 `lib/format.ts`에 추가하고 단위 테스트를 붙였다
- S4 전체 회귀·품질 확인과 기존 테스트 영향 점검 — ⚠ 기존 `bootstrap.test.tsx`(Tauri IPC 모킹)가 새로 생긴 시작 시 `list_volumes` 호출에 `null`을 받아 실패했다. 의도된 변경이라 그 테스트의 모킹에 `list_volumes → []`를 추가했다(기대값은 그대로)

## DoD baseline → after
1. `drive-bar.test.tsx`: 없음 → D1~D9 9개 모두 통과 (전진).
2. D4/D5는 표시 글자(`73.8 GB 남음`, `1.5 GB 남음`)를, D6은 언마운트 기록·홈 이동·목록에서 빠짐을, D8은 실패 알림·패널 불이동을 단언.
3. `volumes.test.ts` 3개 통과(가장 긴 접두, 경로 경계, null).
4. 전체 완료 조건: C1 typecheck 0 · C2 cargo test --workspace 0, vitest 462 passed·실패는 기존 pdf-preview 1건 · C3 9개 이름 각각 ✓ · C4 disk_space 2종 ok · C5 fmt 0, clippy 0, up_to_date 0.
5. 실제 앱 UAT(외장 디스크를 꽂고 마운트·언마운트·용량 확인)는 자동 검사 범위 밖이라 사람이 확인한다 — 검증 한계로 명시.

## 발견한 것
- 앞 작업에서 `coalesce_batches…` 테스트가 부하 중 한 번 불안정하게 실패했다(이번 작업의 전체 실행에서는 통과).
- 추출(eject)은 드라이브 바에 넣지 않았다(비목표). 기존 Alt+1 볼륨 메뉴의 E 키로 쓸 수 있다.
- 마운트 목록 변화(외부에서 꽂고 뽑음)는 창이 포커스를 얻을 때만 갱신한다. 실시간 감시는 하지 않는다.
