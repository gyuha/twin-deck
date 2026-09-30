# Third-party notices

twin-deck는 Spacedrive 소스를 이식하지 않고 자체 구현한다 (docs/04-spacedrive-reuse.md, 2026-09-29 결정: `sd-fs-watcher`, `sd-task-system`, `keybinds`는 자체 구현).
따라서 현재 저장소에는 Spacedrive에서 가져온 파일이 없다. 이식이 생기면 파일 헤더와 이 문서에 출처와 라이선스를 추가한다 (ADR-0009).

의존 라이브러리(crates.io, npm)의 라이선스는 각 패키지의 매니페스트를 따른다.

## 아카이브 처리에 추가한 의존 라이브러리 (M3)

crates.io에서 받아 쓰는 permissive 라이선스 라이브러리이며 코드를 복사해 온 것은 없다.

| crate | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| zip | 8.6.0 | MIT | ZIP 읽기/쓰기 |
| tar | 0.4.46 | MIT OR Apache-2.0 | tar 읽기 |
| flate2 | 1.1.10 | MIT OR Apache-2.0 | gzip 해제 |
| bzip2 | 0.6.1 | MIT OR Apache-2.0 | bzip2 해제 |
| unicode-normalization | 0.1.25 | MIT OR Apache-2.0 | 한글 NFC/NFD 정규화 |
