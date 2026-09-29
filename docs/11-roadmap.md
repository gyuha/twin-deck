# 11. 로드맵

## 1. 원칙

마일스톤은 날짜가 아니라 **완료 기준**으로 정의한다. 기간 추정은 근거가 없어 적지 않는다. 각 마일스톤은 앞 마일스톤 위에 쌓이며, 완료 기준을 만족하지 못하면 다음으로 넘어가지 않는다.

우선순위는 [01](01-feature-spec.md)의 P0~P3와 일치한다. Spacedrive 재사용으로 절약되는 범위는 파일 감시, 작업 시스템, 키바인드, 탭/목록 UI의 골격 정도이며 듀얼 패널, 액션 시스템, 아카이브, Look Up은 새로 만든다. 그래서 일정에 재사용 효과를 크게 반영하지 않는다([04](04-spacedrive-reuse.md)).

```mermaid
flowchart LR
    M0["M0 스캐폴딩"] --> M1["M1 MVP (P0)"]
    M1 --> M2["M2 패리티 핵심 (P1)"]
    M2 --> M3["M3 고급 기능 (P2)"]
    M3 --> M4["M4 확장 (P3)"]
    M4 --> M5["M5 안정화/배포"]

    classDef start fill:#e5e7eb,stroke:#4b5563,color:#111
    classDef core fill:#dcfce7,stroke:#16a34a,color:#111
    classDef adv fill:#dbeafe,stroke:#2563eb,color:#111
    classDef ext fill:#f3e8ff,stroke:#9333ea,color:#111
    classDef ship fill:#fef3c7,stroke:#d97706,color:#111
    class M0 start
    class M1,M2 core
    class M3 adv
    class M4 ext
    class M5 ship
```

## 2. 마일스톤

### M0. 스캐폴딩

목표: 3개 OS에서 빈 앱이 뜨고, 이식 파이프라인이 검증된다.

| 작업 | 참고 |
|---|---|
| 워크스페이스, 툴체인, `justfile` | [10](10-dev-setup.md) |
| Tauri 2 + React 19 + Vite + Tailwind v4 최소 앱 | [03](03-tech-stack.md) |
| specta 타입 생성 시험 | 업스트림/fork 결정 |
| `sd-fs-watcher`, `sd-task-system`, `@twin-deck/keybinds` 이식 | [04](04-spacedrive-reuse.md) |
| `THIRD_PARTY_NOTICES.md`, 라이선스 헤더 규칙 적용 | |
| CI 3개 OS | |
| 웹뷰 키 입력 실험 표 | [09](09-platform-support.md) |

완료 기준:
- `just dev`가 macOS, Windows, Linux에서 창을 띄운다.
- `just check`, `just test`가 CI 3개 OS에서 통과한다.
- 이식한 두 크레이트의 원본 테스트가 통과한다.
- 웹뷰가 F5~F8, `Ctrl/Cmd+W`, F11, F12를 받는지에 대한 OS별 결과 표가 있다.

### M1. MVP (P0)

목표: 키보드로 두 패널을 오가며 기본 파일 작업을 한다.

| 영역 | 항목 (기능 ID) |
|---|---|
| 패널/탭 | 듀얼 패널, Tab 전환, 패널별 탭 (PANE-01, 02, 04) |
| 탐색 | 방향키/Home/End/Page, 열기/상위, 브레드크럼 (NAV-01, 03, 12) |
| 선택 | 전체/해제, Shift 반전, Quick Select (SEL-01, 02, 05) |
| 파일 작업 | 새 폴더/파일, 복사, 이동, 이름 변경, 휴지통, 영구 삭제, 숨김 표시 (OP-01~07, 17) |
| 액션 | 액션 레지스트리, 컨텍스트 조건, 기본 키맵 (ACT-02) |
| 코어 | `td-vfs`(로컬), `td-ops`, 파일 감시 반영 |

완료 기준:
- 마우스 없이 "폴더 이동 → 파일 선택 → 비활성 패널로 복사/이동 → 이름 변경 → 삭제"를 macOS, Windows, Linux에서 끝낼 수 있다(시나리오 테스트).
- 파일이 다른 프로그램에서 바뀌면 목록이 갱신된다.
- 이름 충돌 시 큐/다이얼로그가 덮어쓰기/건너뛰기/이름 바꿈을 처리한다.
- 한글 파일 이름(macOS NFD)이 정렬과 Quick Select에서 정상 동작한다.
- P0 항목 중 미완료가 있으면 그 목록과 사유가 문서에 기록되어 있다.

### M2. 패리티 핵심 (P1)

목표: 일상 사용이 가능한 수준의 Marta 핵심 기능.

| 영역 | 항목 |
|---|---|
| 큐 | Operation Queue UI, 일시정지/중단 (Q-01~03) |
| 탐색 보조 | Volumes, Favorites, Recent, Hierarchy, Go To Path (NAV-07~11) |
| 표시 | 다중 컬럼(1~3), 컬럼 설정, 정렬, 날짜/크기 포맷 (CFG-05~08) |
| 작업 | 복제, 비활성 패널로 복사/이동, 정보, 경로 복사, 파일 관리자에서 보기 (OP-08, 10, 14~16) |
| 보기 | 미리보기(텍스트/이미지), 테마 light/dark (VIEW-01, CFG-03) |
| 설정 | TOML 로딩/병합/감시/검증, 키바인딩 설정 (CFG-02) |
| 액션 UI | Action Bar, Actions Panel (PANE-07, ACT-01, ACT-03) |
| 상태 | 재시작 복원, 다중 창 (PANE-03, 05) |

완료 기준:
- 10만 항목 디렉터리(가설 규모)의 열기와 스크롤, 정렬 시간을 측정해 임계값을 정하고 문서에 기록한다. 임계값을 넘으면 원인 분석 후 다음 단계로 간다.
- 사용자 `keybindings.toml`로 기본 바인딩을 바꾸고 해제할 수 있다.
- 3개 OS에서 Volumes 메뉴가 실제 마운트를 보여 주고 언마운트가 동작한다.
- 큐에서 진행 중인 복사를 일시정지, 재개, 중단할 수 있다.
- 설정 파일 오류가 앱을 죽이지 않고 경고로 표시된다.

### M3. 고급 기능 (P2)

| 영역 | 항목 |
|---|---|
| 아카이브 | ZIP 읽기/쓰기, 중첩, 편집 되쓰기, tar/rar 읽기 (ARC-01~04) |
| 검색 | Look Up(라이브 순회), Flatten, Disk Usage, 가상 탭 (FIND-01~06, PANE-06) |
| 터미널 | 내장 터미널, cwd 동기화, 외부 터미널 (TERM-01~05) |
| 열기 | Open With (`file-opening-*`) (NAV-04) |
| 기타 | CLI 인수 (CLI-01), 압축/추출, 심볼릭 링크, 폰트 설정, 튜토리얼 (OP-11, 12, CFG-04, 11), 드래그 앤 드롭 |
| 선택 항목 | 썸네일(`sd-images`, 필요 시 `sd-ffmpeg`) |

완료 기준:
- ZIP 파일을 폴더처럼 열고, 안의 파일을 다른 패널로 복사하고, 안의 파일을 편집한 뒤 저장하면 아카이브에 반영된다.
- Look Up이 이름/종류/크기/날짜 조건과 Marta의 연산자 별칭을 처리한다. 지원하지 않는 변수는 경고를 낸다.
- 터미널이 패널 위치와 양방향 동기화된다(지원 셸 목록을 문서에 기록).

### M4. 확장 (P3)

| 항목 |
|---|
| Gadgets (CFG-09) |
| Lua 플러그인 (CFG-10, ADR-0008 확정), `docs/plugin-api.md` |
| 설정 내장 편집기 (CFG-01) |
| 사용자 테마 형식, Marta 5종에 대응하는 테마 (CFG-03) |
| Run Action (ACT-04) |

완료 기준:
- Gadget으로 외부 명령/앱을 선택 항목과 함께 실행할 수 있다.
- 예제 Lua 플러그인이 액션을 등록하고 `isApplicable`에 따라 활성/비활성 된다.
- 플러그인이 샌드박스 밖 실행 함수를 호출하면 차단된다.

### M5. 안정화와 배포

| 항목 |
|---|
| OS별 수동 체크리스트 전체 수행, 성능 재측정 |
| 접근성 점검 (키보드, 스크린 리더, 대비) |
| 패키징: `.dmg`(서명/공증), `.msi`/NSIS, `.AppImage`/`.deb` |
| 이식 코드 라이선스 재점검, 배포 범위 재확인 ([ADR-0009](adr/0009-license-and-provenance.md)) |
| 사용자 문서 |

완료 기준: 3개 OS 설치 패키지가 만들어지고, 수동 체크리스트의 P0/P1 항목이 모두 통과한다.

## 3. 마일스톤 간 의존

| 선행 | 후행 | 이유 |
|---|---|---|
| M0 이식 파이프라인 | M1 파일 감시, 큐 | `sd-fs-watcher`, `sd-task-system` 사용 |
| M1 액션 레지스트리 | M4 플러그인 | 플러그인 API의 원형 |
| M1 `td-vfs` 로컬 | M3 아카이브 | 같은 trait에 구현체 추가 |
| M2 설정 로더 | M4 Gadgets, 내장 편집기 | 같은 설정 계층 사용 |
| M2 벤치마크 | M3 Look Up/Disk Usage | 스트리밍/워커 구조 검증 |

## 4. 위험

| 위험 | 영향 마일스톤 | 대응 |
|---|---|---|
| WebKitGTK/WebView2 동작 차이 | M1~ | M0 실험 표, 3개 OS CI |
| Marta 원본 동작 미확인 항목이 많음 | M1~M3 | [01](01-feature-spec.md) 미확인 과제 목록. Marta를 설치한 사람이 대조 |
| `sd-task-system`이 큐 요구와 맞지 않음 | M1 | M0/M1 초기에 API 확인. 안 맞으면 자체 큐 작성으로 전환하고 ADR로 기록 |
| 한글 정규화 문제 | M1 | M1 완료 기준에 포함 |
| 사용 범위가 사내 밖으로 확장 | M5 | ADR-0009 재검토 조건 |
| 재사용 효과 과대 추정 | 전체 | 일정에 반영하지 않음 |

## 5. 착수 전 미확인 과제 통합

각 문서 하단의 과제 중 착수를 막을 수 있는 항목만 모았다.

| 항목 | 문서 | 확인 시점 |
|---|---|---|
| specta 업스트림/fork | [03](03-tech-stack.md) | M0 |
| `@spacedrive/primitives`, `tokens` npm 게시 여부 | [03](03-tech-stack.md), [04](04-spacedrive-reuse.md) | M0 |
| `sd-task-system`의 일시정지/중단/순차 실행 지원 | [02](02-architecture.md), [08](08-vfs-file-ops.md) | M0~M1 |
| 웹뷰의 F키/예약 조합 수신 | [05](05-actions-keybindings.md), [09](09-platform-support.md) | M0 |
| Marta 기본 키맵과 액션 ID 대조 | [05](05-actions-keybindings.md) | M1 이전 |
