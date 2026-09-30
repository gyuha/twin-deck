# Run — compress-extract-symlink (#27)

## 결과
- `td_archive::compress`: 로컬 파일/폴더를 ZIP 하나로 압축(임시 파일 → 원자적 이름 붙이기, 중단·실패해도 반쯤 쓴 파일이 남지 않음, 대상이 이미 있으면 거부, 같은 이름의 최상위 항목이 둘이면 오류, 압축 파일 자신은 넣지 않음, 권한·수정 시각 보존, 빈 폴더 포함, 심볼릭 링크는 넣지 않고 `skipped_links`로 보고). `Archive::extract_all_with`는 진행/중단 콜백을 받고 파일의 수정 시각과 권한(setuid 제외)을 복원한다.
- `td-ops`: `Ops::compress_with`(기본 이름: 하나면 확장자를 뺀 이름/폴더 이름, 여러 개면 압축 위치의 폴더 이름 + `.zip`), `Ops::extract_with`(아카이브 이름에서 확장자를 뗀 새 폴더, 중단·실패 시 만들다 만 폴더 삭제, 확장자로 형식을 모르면 내용으로 판별), `Ops::symlink`(충돌 정책 적용, 폴더 링크 지원). 세 가지 모두 충돌 시 Skip/Overwrite/Rename을 따른다.
- `td-vfs::symlink_error_message(windows, code)`: Windows 오류 코드(1314 권한 없음 → 개발자 모드/관리자 안내, 5, 50, 183/80, 3, 87)와 유닉스 errno를 안내 문구로 바꾸는 순수 함수. `LocalFs::symlink`가 알려진 원인은 이 문구로 오류를 낸다(이미 있음/없음은 기존 오류 종류 유지).
- `td-queue`: `JobKind::Compress`/`Extract`, `Item::new` + `extra`/`name`. 항목마다 진행 이벤트, 중단 지원. Tauri: `enqueue_compress`, `enqueue_extract`, `create_symlink` 명령(바인딩 재생성).
- UI: `core.compress`, `core.extract`(선택한 아카이브 옆 새 폴더), `core.extract.to_inactive`(반대편 패널 폴더 아래), `core.file.symlink`(반대편 패널에 링크, 겹치면 충돌 대화상자). 기본 키는 없다(Actions Panel로 실행). 큐 팝업에 "압축"/"추출"로 보인다. 아카이브 안 항목 압축, 검색 결과 탭에서의 압축, 아카이브 안 링크·추출 대상은 안내하고 하지 않는다.
- 테스트: `compress_extract_roundtrip_external`(우리 zip을 `unzip -tq`/`unzip`/`tar`로 풀어 원본과 바이트 일치·실행 권한 확인, 시스템 `zip -qr -X`로 만든 zip을 우리 추출로 풀어 일치, 한글 이름·빈 폴더·깊은 중첩·300KB 파일), `compress_edge_cases`(중단 시 흔적 없음 등), `compress_skips_symlinks_and_reports_them`, td-ops `archive_ops` 6개(이름·충돌·안전 추출·zip-slip 거부·중단 시 폴더 삭제·`symlink_create`), `symlink_error_message`, td-queue `queue_runs_compress_and_extract_jobs`, 서비스 `compress_extract_and_symlink_through_the_service`, UI `compress-symlink.test.tsx` 13개. 변형 검사: 실패 시 폴더 정리 제거 → 추출 중단 테스트, 권한 복원 제거 → 왕복 테스트, 추출 대상 필터 제거 → 2개, 링크 아카이브 가드 제거 → 1개 실패.

## 계획과 다른 점 / 발견
- 계획의 "추출: 그 옆 폴더 또는 `core.extract`가 비활성 패널로"는 두 액션(`core.extract`, `core.extract.to_inactive`)으로 나눴다.
- td-ops가 td-archive에 의존한다(압축·추출은 로컬 파일의 아카이브 작업이라 `Vfs` 밖이다). td-archive는 테스트에서 td-ops를 쓰므로 dev-dependency 순환이 생기는데 cargo가 허용하고 정상 빌드된다.
- 시스템 `unzip`으로 푼 한글 이름은 구형 Info-ZIP이 깨뜨릴 수 있어, 이름이 든 검증은 bsdtar로, 바이트/권한 검증은 `unzip`(ASCII 이름)으로 나눴다.

## 한계 (fake만 검증 / 미확인)
- 압축 파일의 이름 규칙(확장자 뗀 이름, 여러 개면 폴더 이름)은 Marta 동작을 확인하지 못한 twin-deck의 결정이다.
- 아카이브 안의 아카이브는 추출하지 못한다(먼저 밖으로 꺼내야 한다). 아카이브 안의 항목 압축도 마찬가지다. 심볼릭 링크가 든 zip/tar는 안전상 추출을 거부한다(기존 규칙). 압축할 때 링크는 건너뛴다.
- Windows에서의 실제 링크 생성과 권한 오류 코드는 실행해 보지 못했다: `symlink_error_message` 표 테스트만 검증했다. UI 흐름은 fake 백엔드 위에서 검증했고 실제 Tauri 창에서는 확인하지 못했다.
- 진행 이벤트는 파일 단위다(큰 파일 하나의 내부 진행률은 없다).
