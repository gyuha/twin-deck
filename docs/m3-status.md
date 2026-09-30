# M3(P2) 일부 구현 상태

2026-09-30 기준. 근거는 각 행의 테스트 파일이며, 모두 로컬 macOS(Apple M1 Max, macOS 26.4.1)에서 실행한 결과다. Windows와 Linux에서는 실행하지 않았고, 실제 Tauri 창에서 앱을 띄워 확인하지도 못했다 `[알 수 없음]`. 상태 열의 `done`은 "이 행의 테스트가 통과한다"는 뜻이지 "실제 앱에서 확인했다"는 뜻이 아니다. 실제 OS 부작용(외부 편집기 실행, Windows 링크 권한, 다른 볼륨)과 UI가 붙는 백엔드는 fake로만 검증했고 비고에 `fake만 검증`이라고 적었다. 아카이브 동작은 시스템 `unzip`/`zip`/`tar`와 교차 검증했다(자기 채점 방지).

이번 범위는 ZIP 아카이브(ARC), 검색/분석과 가상 탭(FIND, PANE-06), 압축·추출·심볼릭 링크(OP-11/12)다.

## P2 항목

| ID | 상태 | 검증 테스트 | 비고 |
|---|---|---|---|
| ARC-01 | done | crates/td-archive/tests/write.rs, crates/td-archive/tests/read.rs, crates/td-archive/tests/composite.rs, apps/desktop/src/__tests__/archive-nav.test.tsx | ZIP 계열(zip, jar, war, aar, apk, nupkg, klib, sublime-package)과 설정 `file_systems.zip.additional_extensions`. 읽기는 `zip_read_external_zip_cli`(시스템 `zip`이 만든 zip), 쓰기는 `zip_write_roundtrip_unzip_t`(시스템 `unzip -t`). 쓸 때마다 zip 전체를 다시 쓴다(큰 폴더를 넣으면 느림). 열 때 항목 목록을 메모리에 올린다. 암호화·zip64 읽기는 다루지 않음. **UI는 fake 백엔드 위에서만 검증** |
| ARC-02 | done | crates/td-archive/tests/read.rs, crates/td-archive/tests/write.rs | tar, tar.gz(tgz), tar.bz2 읽기 전용(`tar_gz_read`, `archive_readonly_errors`). **rar 미지원**, xar/cab/shar/lzh/cpio/iso/rpm/ar도 미지원(범위 밖). 시스템 `tar`로 만든 파일을 읽는다 |
| ARC-03 | done | crates/td-archive/tests/write.rs, crates/td-archive/tests/edit.rs, apps/desktop/src-tauri/src/service.rs | 중첩 열기(`archive_nested_read`)와 바깥까지 되쓰기(`archive_nested_write_back`), 열어 둔 파일의 변경 감시 + 되쓰기(`archive_edit_writes_back`: 제자리 저장과 원자적 저장 모두, `unzip -p`로 확인). **외부 편집기 실행은 fake만 검증**(서비스 테스트 `editing_an_archive_file_writes_back_through_the_launcher`). 편집기 종료 감지는 없고 세션은 앱이 끝날 때까지(또는 임시 파일이 사라질 때까지) 300ms 간격으로 확인한다 |
| ARC-04 | done | crates/td-archive/tests/composite.rs, apps/desktop/src/__tests__/archive-nav.test.tsx | Open As(`core.open.as_archive`, 기본 키 없음): 확장자와 무관하게 내용(매직 바이트)으로 zip/tar 계열 판별. 등록은 세션 동안만 유지(재시작하면 `x.bin!` 탭은 일반 경로로 취급되어 상위 폴더로 옮겨짐). **UI는 fake 백엔드에서 검증**(fake는 `PK` 시작 여부로 흉내) |
| FIND-01 | done | crates/td-search/tests/lookup.rs, apps/desktop/src/__tests__/lookup-ui.test.tsx | 전역(`Mod+P`, 홈 아래)과 현재 폴더(`Mod+Alt+P`, 아카이브 안이면 그 안)를 라이브 순회로. 스트리밍·취소(`lookup_live_search`, `lookup_cancel`). 인덱스·Spotlight 없음. **UI는 fake 백엔드에서 검증**(fake의 질의 해석은 이름 부분 일치 수준) |
| FIND-02 | done | crates/td-search/tests/lookup.rs | 간단 조건 14종(Folder, File, Archive, Disk Image, Text, RTF, HTML, XML, Source Code, Image, Video, Audio, Executable, ZIP)을 확장자와 유닉스 실행 권한 비트로 판별. Application, Bundle은 판별하지 않고 미지원 경고(`lookup_unsupported_variable_warns`) |
| FIND-03 | done | crates/td-search/tests/lookup.rs, apps/desktop/src/__tests__/lookup-ui.test.tsx | Name, Content(1 MiB 이하 텍스트 파일만), Size, Modified, Created, Kind와 AND 결합. UTI, Author, Title, Album, Genre 등은 오류 없이 "지원하지 않음" 경고. 문법 오류는 바이트 위치와 함께. 문법과 가정은 ADR-0013 |
| FIND-04 | done | crates/td-search/tests/lookup.rs | `=` `==` `is` `equals` / `!=` `isNot` / `contains` `has` / `like` `~=` / `startsWith` / `endsWith`가 한 연산자로 정규화(`lookup_operator_aliases`). **`like`/`~=`의 의미는 Marta에서 확인하지 못해 glob으로 가정**(ADR-0013). 크기·날짜 비교(`<` `<=` `>` `>=`)는 twin-deck 확장 |
| FIND-05 | done | crates/td-search/tests/usage.rs, apps/desktop/src/__tests__/virtual-tabs.test.tsx | Flatten: 파일만(폴더 제외), 심볼릭 링크는 링크 자체 1항목이며 따라가지 않아 순환 링크가 있어도 끝난다, 아카이브 안 동작(`flatten_lists_files_only`). Marta가 폴더를 포함하는지는 확인하지 못함. **UI는 fake 백엔드에서 검증** |
| FIND-06 | done | crates/td-search/tests/usage.rs, apps/desktop/src/__tests__/virtual-tabs.test.tsx | Disk Usage: 병렬 계산, 크기 내림차순 부분 결과, 취소, 하드 링크 한 번만(`disk_usage_hardlink_once`, 유닉스), 심볼릭 링크는 링크 크기만, 볼륨 경계는 옵션(`cross_volumes`) 기본 false. 아카이브 안은 압축 해제 크기. **볼륨 경계는 장치 번호를 조작한 `Vfs` 래퍼로만 검증(fake만 검증, 실제 다른 마운트 미확인)**. Windows 하드 링크 판정(파일 ID)은 미구현 |
| PANE-06 | done | apps/desktop/src/__tests__/virtual-tabs.test.tsx, apps/desktop/src/__tests__/lookup-ui.test.tsx | 가상 탭(Look Up/Flatten/Disk Usage): 위치 없는 탭, 진행 표시와 Esc 취소, 항목 선택·복사·이동·휴지통·삭제·이름 변경이 원래 위치에 적용, 해당 폴더로 이동(새 탭), 닫으면 결과 폐기(저장 상태에 넣지 않음). **UI는 fake 백엔드에서 검증**, 실제 Tauri 이벤트 전달·스레드 타이밍은 서비스 테스트(`lookup_flatten_and_usage_stream_through_the_service`)까지만 |
| OP-11 | done | crates/td-archive/tests/compress.rs, crates/td-ops/tests/archive_ops.rs, crates/td-queue/tests/queue.rs, apps/desktop/src/__tests__/compress-symlink.test.tsx | 압축(`core.compress`)과 추출(`core.extract`, `core.extract.to_inactive`)이 큐 작업. `compress_extract_roundtrip_external`: 우리 zip을 `unzip -tq`/`unzip`/`tar`로 풀어 원본과 일치, 시스템 `zip`이 만든 zip을 우리 추출로 풀어 일치. 안전 추출(경로 탈출·절대 경로·백슬래시·링크 거부, `zip_slip_rejected`), 중단하면 흔적을 남기지 않음, 원본은 지우지 않음. 압축할 때 심볼릭 링크는 건너뜀(보고). 아카이브 안 항목 압축과 아카이브 안 아카이브 추출은 안 됨. **UI는 fake 백엔드에서 검증** |
| OP-12 | done | crates/td-ops/tests/archive_ops.rs, crates/td-vfs/tests/symlink_error.rs, apps/desktop/src/__tests__/compress-symlink.test.tsx | `symlink_create`(유닉스: 링크·대상·충돌 3종·폴더 링크), `symlink_error_message`(Windows 오류 코드 1314 등 → 원인과 안내). **Windows에서의 실제 링크 생성과 권한 오류는 실행하지 못했고 오류 코드 표 테스트만 검증(fake만 검증)**. UI는 fake 백엔드 |

## 종단 시나리오

- 키보드만: apps/desktop/src/__tests__/keyboard-scenario-m3.test.tsx — zip 열기 → 안의 파일을 반대편으로 복사 → 로컬 파일을 zip 안으로 복사 → 상위로 나오기(커서가 그 zip에) → Look Up으로 찾기 → 가상 탭에서 복사 → Disk Usage → 압축 → 추출. 백엔드는 인메모리 `FakeBackend`. 마우스 조작 없음.
- M1·M2 시나리오(keyboard-scenario.test.tsx, keyboard-scenario-m2.test.tsx)도 그대로 통과한다.

## docs/11 M3 완료 기준 대조

| 기준 | 결과 |
|---|---|
| ZIP 파일을 폴더처럼 열고, 안의 파일을 다른 패널로 복사하고, 안의 파일을 편집한 뒤 저장하면 아카이브에 반영된다 | 충족 (ARC-01, 03). 열기·복사는 Rust에서 시스템 `unzip`/`zip`/`tar`로 교차 검증. 편집 후 저장 반영은 임시 파일 변경을 감시해 되쓰는 것까지 검증했고 **외부 편집기의 실제 실행은 fake** |
| Look Up이 이름/종류/크기/날짜 조건과 Marta의 연산자 별칭을 처리한다. 지원하지 않는 변수는 경고를 낸다 | 충족 (FIND-01~04). 별칭의 의미 차이(`like`/`~=`)는 확인하지 못한 가정(ADR-0013) |
| 터미널이 패널 위치와 양방향 동기화된다(지원 셸 목록을 문서에 기록) | **범위 밖 — 구현하지 않음** |

## 범위 밖 (이번에 구현하지 않은 M3 항목과 결정)

- 내장 터미널, cwd 동기화, 외부 터미널 (TERM-01~05)
- Open With (NAV-04)
- CLI 인수 (CLI-01)
- 썸네일 (`sd-images`, `sd-ffmpeg`)
- 드래그 앤 드롭
- 폰트 설정, 튜토리얼 (CFG-04, CFG-11)
- rar를 포함해 tar 계열 외 읽기 전용 형식 (xar, cab, shar, lzh/lha, cpio, iso, rpm, ar) — ARC-02는 tar/tar.gz/tar.bz2만
- Spotlight(mdfind) 백엔드, 인덱스
- Spacedrive 코드 이식 (자체 구현), 원격 push, Windows/Linux 실행 검증

## 알려진 한계와 후속

- 실제 Tauri 런타임에서 검색·분석 이벤트(`SearchChunk`, `UsageUpdate`, `SearchDone`) 왕복, 편집 세션의 되쓰기, 큐의 압축·추출을 실행해 보지 못했다. 각 계층을 따로 검증했을 뿐이며, 이전에 이 종류의 공백 때문에 앱이 빈 화면이 된 적이 있어(권한 누락) 부팅 경로에는 IPC 모킹 테스트와 capability 검사 테스트를 유지한다. 실제 창 확인을 대신하지는 못한다.
- 아카이브에 쓰는 동작은 매번 zip 전체를 다시 쓴다. 폴더를 통째로 넣으면 파일 수만큼 다시 쓴다(일괄 쓰기는 후속 과제).
- 아카이브 경로는 파일 감시 대상이 아니고, 아카이브 안의 미리보기(`preview`)도 아직 연결하지 않았다. 편집 되쓰기로 내용이 바뀌어도 그 패널은 자동으로 새로고침되지 않는다.
- macOS `zip`은 한글 이름을 UTF-8 플래그 없이 저장하고 구형 `unzip -Z1`은 비ASCII 이름을 깨뜨리며 bsdtar는 이름을 NFD로 돌려준다. 그래서 이름 검증은 bsdtar + NFC 정규화, 무결성은 `unzip -t`로 나눴다. 이 도구들이 Linux/Windows에서 같은 결과를 내는지는 확인하지 못했다.
- 테스트 환경 관찰: 이 머신의 `fseventsd`가 유휴에서도 CPU ~100%로 밀려 있어, 큰 폴더를 만드는 테스트(`large_dir_100k_list`) 직후 `td-watch` 통합 테스트가 이벤트를 30초 넘게 받지 못하는 경우가 재현됐다. 테스트가 이벤트가 없으면 같은 폴더에 표식 파일을 써서 다시 알리도록 견고하게 만들었다. 애플리케이션의 목록 갱신(`td-watch`)에는 폴링 폴백이 없어서, 같은 조건이면 실제 앱에서도 목록 갱신이 늦을 수 있다.
- 자체 정의한 기본 키(Look Up `Mod+P`/`Mod+Alt+P`)는 docs/05의 "키 확인" 항목이며, 웹뷰가 이 조합을 받는지 실험하지 못했다. `core.flatten`, `core.disk_usage`, `core.compress`, `core.extract`, `core.file.symlink`, `core.open.as_archive`, `core.reveal_in_tab`, `core.search.cancel`은 기본 키가 없고 Actions Panel로 실행한다.
