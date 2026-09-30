# Run — virtual-tabs-ui (#26)

## 결과
- Rust: `Service`가 Look Up / Flatten / Disk Usage를 별도 스레드로 시작(`start_lookup/start_flatten/start_disk_usage`)하고 `cancel_search`로 취소한다. 결과는 채널(`SearchMsg`)로 나오고 main.rs가 Tauri 이벤트 `SearchChunk`(200개 또는 50ms 묶음), `UsageUpdate`(크기 내림차순 전체 스냅샷), `SearchDone`(정상·취소 모두 마지막)으로 전달한다. 질의 문법 오류는 위치가 든 문자열로, 지원하지 않는 변수는 시작 응답의 경고로 온다. `bindings.ts` 재생성.
- TS: `Backend`에 `startLookup/startFlatten/startDiskUsage/cancelSearch/onSearchEvent`, `TauriBackend` 구현, `FakeBackend`(즉시 모드는 응답보다 이벤트가 먼저 도착하는 순서를 흉내, 수동 모드는 `stepSearch()`로 한 걸음씩).
- 스토어: `TabState.virtual`(종류, 제목, 시작 위치, 작업 id, 진행/취소, 경고, 요약). 결과는 새 탭으로 열리고 탭을 닫으면 작업 취소+결과 폐기, 저장 상태(스냅샷)에는 넣지 않는다, 파일 감시 대상이 아니다. 실제 위치로 나가는 `navigate`는 작업을 취소하고 일반 탭으로 바꾼다. Look Up 다이얼로그(`core.lookup.global` Mod+P = 홈 아래, `core.lookup.folder` Mod+Alt+P = 현재 위치, 아카이브 안이면 그 안), `core.flatten`, `core.disk_usage`(인수 `src`, `~` 확장), `core.search.cancel`, `core.reveal_in_tab`. Esc: 선택이 없고 진행 중이면 취소, 아니면 선택 해제.
- 가상 탭 항목은 일반 항목처럼 선택·복사·이동·휴지통·영구 삭제·이름 변경이 된다(원래 위치에 적용). 삭제/이동/휴지통 뒤에는 실제로 사라졌는지 확인해 결과에서 뺀다. 결과 탭에는 새로 만들 수 없고, 반대편 패널이 결과 탭이면 복사·이동 대상이 될 수 없다는 안내가 나온다. Return: 폴더/아카이브는 들어가고 일반 파일은 그 폴더를 새 탭으로 연다.
- 테스트: 서비스 `lookup_flatten_and_usage_stream_through_the_service`(아카이브 안 포함), `cancel_search_stops_a_running_job`; UI `lookup-ui.test.tsx` 12개, `virtual-tabs.test.tsx` 20개(모두 키보드). 변형 검사: 재확인 제거 → 3개, 대상 가드 제거 → 1개, 스냅샷 필터 제거 → 1개 실패.

## 계획과 다른 점 / 발견
- 처음에는 결과가 정렬될 때 커서가 "처음 도착한 항목"을 따라가서 사용자가 움직이지 않았는데도 커서가 맨 위에서 벗어났다. 커서가 맨 위이면 그대로 두고, 아니면 같은 항목을 따라가도록 고쳤다(테스트로 고정).
- `core.select.none`이 선택이 있을 때만 실행 가능하도록 정의돼 있어 Esc가 진행 중 취소로 이어지지 않았다. 검색 중이면 실행 가능하게 바꿨다.
- 테마 가드 테스트가 새로 쓴 색(`blue-700`, `amber-800`)의 다크 대응 부재를 잡아 기존 토큰(`blue-800`, `red-700`)으로 바꿨다.
- Disk Usage 결과는 폴더도 총 크기를 표시하도록 `cellText`에 옵션을 더했고, 폴더 우선 정렬을 적용하지 않는다.

## 한계 (fake만 검증)
- FakeBackend의 Look Up 질의 해석은 이름 부분 일치/`Name contains|is`/미지원 변수 경고 수준의 흉내다. 실제 질의 문법·순회는 Rust 테스트가 검증한다. UI 테스트는 fake 백엔드 위에서 돌았고 실제 Tauri 창(이벤트 전달, 스레드 타이밍)은 확인하지 못했다.
- 결과 탭에서 정렬을 바꾸면 폴더 우선 정렬이 적용된다. Look Up 전역 범위는 사용자 홈(홈을 알 수 없으면 `/`)이며 전체 파일시스템 옵션은 없다.
- 가상 탭 결과는 재시작하면 사라진다(저장하지 않는다).

## 봉인 중 발견한 불안정 요인 (수정함)
- `td-watch` 통합 테스트가 워크스페이스 실행에서 계속 실패했다. `WAIT`를 30초로 늘려도 실패해서 단순 지연이 아님을 확인했다: 이 머신의 `fseventsd`가 유휴에서도 CPU ~100%이고, 직전에 `td-vfs`의 10만 파일 테스트(`large_dir`)가 돌면 이벤트가 30초 넘게 오지 않는 경우가 재현됐다(유휴에서는 항상 통과, `large_dir` 직후 3번 중 1번 실패). 테스트의 `expect_event`가 3초 안에 이벤트가 없으면 같은 폴더에 표식 파일을 써서 다시 알리도록 바꿨고(상한 30초), `large_dir` 직후 4/4 통과했다. 검사하는 내용(감시 폴더의 변경이 원래 경로로 도착)은 그대로다. 라우팅 규칙은 OS 이벤트 없는 `route_event` 테스트가 결정적으로 검증한다.
