# 00. 개요

## 1. 목적

twin-deck은 키보드 중심으로 조작하는 듀얼 패널 파일 탐색기다. 사용자는 두 패널 사이에서 파일을 복사, 이동하고, 액션과 키바인딩으로 거의 모든 동작을 실행한다. 기능 기준은 Marta(https://marta.sh/)이며, macOS 전용인 Marta와 달리 macOS, Windows, Linux를 모두 지원한다.

기술 기준은 Spacedrive v2다. 같은 스택(Tauri 2, React 19, Vite, Tailwind v4, Bun, Rust)을 쓰고, 독립적으로 떼어 낼 수 있는 Spacedrive 소스는 그대로 가져온다. 다만 Spacedrive의 라이브러리, DB, 동기화, P2P 계층은 가져오지 않는다. 이유는 [04-spacedrive-reuse.md](04-spacedrive-reuse.md)에 있다.

## 2. 사용 범위

| 항목 | 확정 내용 |
|---|---|
| 배포/사용 | 개인 및 사내 전용. 외부 배포와 판매는 하지 않는다 |
| 플랫폼 | macOS, Windows, Linux (데스크톱 3종). 모바일은 제외 |
| 재사용 전략 | 새 모노레포에서 Spacedrive 소스를 선별 이식 (ADR-0002) |

배포 범위가 바뀌면(외부 공개, 유료화) 라이선스 검토를 다시 해야 한다. 재검토 조건은 [ADR-0009](adr/0009-license-and-provenance.md)에 있다.

## 3. 성공 기준

성공 기준은 검증 가능한 문장으로만 적는다. 수치 목표는 측정 전에는 가설이며, M2 종료 시점에 실측해서 확정한다.

| 기준 | 검증 방법 |
|---|---|
| 마우스 없이 두 패널 사이의 탐색, 선택, 복사, 이동, 삭제, 이름 변경을 끝낼 수 있다 | 시나리오 테스트: 키보드 입력만으로 실행 |
| [01-feature-spec.md](01-feature-spec.md)의 P0, P1 항목이 macOS, Windows, Linux에서 동작한다 | 3개 OS CI와 수동 체크리스트 |
| 사용자 키맵과 설정을 TOML로 덮어쓸 수 있다 | 설정 로더 단위 테스트, 수동 확인 |
| 대용량 디렉터리(가설: 10만 항목)에서 UI가 멈추지 않는다 | M2 벤치마크로 임계값 확정 |
| Spacedrive에서 가져온 모든 파일의 출처와 라이선스가 추적된다 | `THIRD_PARTY_NOTICES.md` 및 파일 헤더 점검 |

## 4. 범위

**포함**

- 듀얼 패널, 패널별 탭, 다중 창
- 액션 시스템, 키바인딩, Action Bar, Actions Panel
- 파일 작업(복사, 이동, 이름 변경, 새 폴더/파일, 휴지통, 영구 삭제, 복제, 심볼릭 링크)과 작업 큐
- 탐색 보조 기능(Volumes, Favorites, Recent Locations, Hierarchy, Go To Path, Quick Select)
- 표시 모드(Table, 다중 컬럼), 컬럼 설정, 정렬, 숨김 파일
- 아카이브를 폴더처럼 열기, Look Up, Flatten, Disk Usage
- 내장 터미널, CLI 실행 인자
- TOML 설정, Gadgets, 테마, 플러그인(4단계)

**제외**

- Spacedrive의 VDFS 기능 전반: 라이브러리, 태그, 동기화, P2P, 클라우드 스토리지, 벡터 검색, AI
- 모바일 앱
- Marta의 Marco 설정 형식과의 호환 ([ADR-0006](adr/0006-toml-config.md))
- 원격 파일시스템(SFTP, SMB 등). Marta에서 지원하는지 확인하지 못했다 `[알 수 없음]`
- Marta의 소스, 에셋, 테마, 문서 문장 복제

## 5. 확정된 결정 요약

| 결정 | 내용 | ADR |
|---|---|---|
| 스택 정렬 | Spacedrive와 같은 스택 | [0001](adr/0001-stack-alignment.md) |
| 재사용 방식 | 새 모노레포 + 선별 이식 | [0002](adr/0002-monorepo-selective-port.md) |
| 프로세스 모델 | in-process Tauri command/event, 데몬 없음 | [0003](adr/0003-in-process-ipc.md) |
| 데이터 | DB 없음, 라이브 목록 조회 + 파일 감시 | [0004](adr/0004-no-database.md) |
| 아카이브 | `Vfs` trait로 폴더처럼 취급 | [0005](adr/0005-vfs-trait.md) |
| 설정 형식 | TOML | [0006](adr/0006-toml-config.md) |
| 액션 | 단일 액션 레지스트리가 키/버튼/패널의 공통 원천 | [0007](adr/0007-action-registry.md) |
| 플러그인 | Lua(`mlua`) 방식을 기본안으로 하되 4단계로 연기 (Proposed) | [0008](adr/0008-plugin-language.md) |
| 라이선스 | 출처 추적과 재검토 조건 | [0009](adr/0009-license-and-provenance.md) |
| 키 매핑 | Cmd→Ctrl, Opt→Alt 기본 매핑 | [0010](adr/0010-cross-platform-keymap.md) |

## 6. 용어

| 용어 | 의미 |
|---|---|
| 패널(Pane) | 화면의 한 쪽 파일 목록 영역. 항상 두 개이며 하나만 활성 |
| 활성/비활성 패널 | 조작 대상(source)인 패널 / 복사·이동의 대상(target)인 패널 |
| 탭(Tab) | 패널 안의 위치 단위. 위치, 표시 모드, 정렬, 선택, 이력을 각자 가진다 |
| 가상 탭 | 파일시스템 위치가 아닌 결과 화면(예: Disk Usage 결과) |
| 액션(Action) | 이름과 ID를 가진 실행 단위. 키, 버튼, 패널, 플러그인이 모두 액션을 호출한다 |
| Gadget | 설정 파일에 선언하는 외부 명령/앱 실행 액션 |
| Quick Select | 문자를 입력해 목록에서 항목으로 바로 이동하는 기능 |
| VFS | 로컬 파일시스템과 아카이브를 같은 인터페이스로 다루는 추상화 |
| VfsPath | VFS 안의 위치를 식별하는 경로 값 |
| 큐(Operation Queue) | 시간이 걸리는 파일 작업을 순차 실행하는 대기열 |

## 7. 신뢰 수준 표기

| 태그 | 의미 |
|---|---|
| `[높음]` | 코드, 공식 문서, 1차 자료로 직접 확인함 |
| `[중간]` | 불완전한 자료에서 합리적으로 추론함 |
| `[낮음]` | 추측. 실행 전에 검증해야 함 |
| `[알 수 없음]` | 확인하지 못함. 확인해야 할 대상을 함께 적음 |

## 8. 미확인 과제 (착수 전 확인)

1. Spacedrive `packages/interface`, `ts-client`가 `package.json`에서 GPL-3.0이고 루트는 FSL이다. 어느 쪽이 실제로 적용되는지 알 수 없다. [04](04-spacedrive-reuse.md#5-라이선스와-출처-표기)에서 보수적 규칙을 정했다.
2. Marta의 내장 액션 ID 전체와 기본 키맵은 공개 문서에 없다. Marta 설정 편집기의 읽기 전용 기본값에서 확인할 수 있다고 한다. Marta를 설치한 사용자가 그 내용을 확인하면 [05](05-actions-keybindings.md) 카탈로그를 보정할 수 있다.
3. Spacedrive가 쓰는 specta는 git fork(`jamiepine/specta`)다. twin-deck이 업스트림 릴리스로 충분한지는 스캐폴딩 때 확인한다 `[알 수 없음]`.
