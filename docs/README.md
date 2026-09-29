# twin-deck 문서

twin-deck은 **Marta 수준의 기능을 갖춘 크로스플랫폼 듀얼 패널 파일 탐색기**다. 기술 스택은 Spacedrive(v2)에 맞추고, 재사용 가능한 소스는 선별해서 가져온다. 이 폴더는 개발 착수에 필요한 설계 문서 전체다.

## 읽는 순서

문서는 "무엇을 만드는가 → 어떻게 구성하는가 → 무엇을 가져다 쓰는가 → 세부 명세 → 어떻게 진행하는가" 순으로 읽도록 번호를 붙였다. 처음 합류하는 사람은 00 → 02 → 04 → 11 순으로 훑고, 구현 단계에서 해당 명세 문서(01, 05~09)를 찾아본다.

```
00 개요 → 01 기능 명세 → 02 아키텍처 → 03 기술 스택 → 04 Spacedrive 재사용
                                                          ↓
11 로드맵 ← 10 개발 환경 ← 09 플랫폼 지원 ← 08 VFS/파일 작업 ← 07 UI ← 06 설정/플러그인 ← 05 액션/키바인딩
```

## 문서 목록

| 문서 | 내용 |
|---|---|
| [00-overview.md](00-overview.md) | 목표, 범위/비범위, 확정 결정 요약, 용어, 표기 규약 |
| [01-feature-spec.md](01-feature-spec.md) | Marta 기능 패리티 표 (출처, 우선순위, OS별 대응, 미확인 표시) |
| [02-architecture.md](02-architecture.md) | 계층 구조, 크레이트 경계, 상태 모델, IPC/이벤트 흐름 |
| [03-tech-stack.md](03-tech-stack.md) | Spacedrive와 맞춘 스택 버전표와 의도적 차이 |
| [04-spacedrive-reuse.md](04-spacedrive-reuse.md) | 재사용 매트릭스, 이식 절차, 라이선스/출처 표기 규칙 |
| [05-actions-keybindings.md](05-actions-keybindings.md) | 액션 모델, 액션 카탈로그, 기본 키맵, OS별 키 매핑 |
| [06-config-plugins.md](06-config-plugins.md) | TOML 설정 스키마, Gadgets, 테마, 플러그인 API 초안 |
| [07-ui-spec.md](07-ui-spec.md) | 패널, 탭, 표시 모드, 컬럼, 다이얼로그, 큐 UI |
| [08-vfs-file-ops.md](08-vfs-file-ops.md) | VFS, 파일 작업, 작업 큐, 아카이브, Look Up, Disk Usage, Flatten |
| [09-platform-support.md](09-platform-support.md) | macOS/Windows/Linux 차이와 대체 구현 |
| [10-dev-setup.md](10-dev-setup.md) | 리포 구조, 셋업, 빌드/테스트/CI, 작업 규칙 |
| [11-roadmap.md](11-roadmap.md) | 마일스톤과 완료 기준 |
| [adr/](adr/) | 아키텍처 결정 기록 (ADR-0001 ~ 0010) |

## 신뢰 수준 표기

문서 안의 비자명한 주장에는 `[높음]`, `[중간]`, `[낮음]`, `[알 수 없음]` 태그를 붙인다. 기준은 [00-overview.md](00-overview.md#7-신뢰-수준-표기)에 있다. 조사로 확인하지 못한 사항은 추측으로 채우지 않고 `[알 수 없음]` 또는 "미확인"으로 남기며, 착수 전 확인 과제로 각 문서 하단에 모아 둔다.

## 문서 작성 기준

- 조사 기준일: 2026-09-29. Spacedrive 기준 커밋은 `6dfeccf`(2026-07-28, `2.0.0-alpha.2`)이다.
- Marta의 문서 문장, 아이콘, 테마 파일은 복사하지 않는다. 기능 목록은 자체 표현으로 기술하고 출처는 URL로만 남긴다.
