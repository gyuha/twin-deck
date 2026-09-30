# 아키텍처 결정 기록 (ADR)

큰 결정은 여기에 한 파일씩 남긴다. 번호는 재사용하지 않고, 결정이 바뀌면 기존 파일을 지우지 않고 상태를 `Superseded by ADR-NNNN`으로 바꾼 뒤 새 ADR을 추가한다.

## 형식

```
# ADR-NNNN. 제목
- 상태: Proposed | Accepted | Superseded by ADR-NNNN
- 날짜: YYYY-MM-DD

## 맥락
## 결정
## 결과 (장점, 단점, 후속 작업)
## 검토한 대안
```

## 목록

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-stack-alignment.md) | Spacedrive와 기술 스택 정렬 | Accepted |
| [0002](0002-monorepo-selective-port.md) | 새 모노레포 + 선별 이식 | Accepted |
| [0003](0003-in-process-ipc.md) | 데몬 없이 in-process IPC | Accepted |
| [0004](0004-no-database.md) | DB 없이 라이브 조회 | Accepted |
| [0005](0005-vfs-trait.md) | `Vfs` trait로 아카이브를 폴더처럼 | Accepted |
| [0006](0006-toml-config.md) | 설정 형식은 TOML | Accepted |
| [0007](0007-action-registry.md) | 단일 액션 레지스트리 | Accepted |
| [0008](0008-plugin-language.md) | 플러그인 언어 (Lua 기본안, 연기) | Proposed |
| [0009](0009-license-and-provenance.md) | 라이선스와 출처 추적 | Accepted |
| [0010](0010-cross-platform-keymap.md) | 크로스플랫폼 키 매핑 | Accepted |
| [0011](0011-specta-pinned-versions.md) | 타입 생성은 tauri-specta 업스트림 고정 버전 | Accepted |
| [0012](0012-archive-path-notation.md) | 아카이브 안 경로 표기 `아카이브!/안/경로` | Accepted |

Accepted는 2026-09-29에 사용자가 설계안을 승인한 결정이다. 세부 사항(버전, 라이브러리 선택)은 각 문서의 "미확인 과제"에 남아 있다.
