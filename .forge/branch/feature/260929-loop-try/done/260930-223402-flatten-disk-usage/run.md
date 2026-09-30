# Run — flatten-disk-usage (#25)

## 결과
- `td_search::flatten`: `walk`를 재사용해 폴더를 뺀 파일·링크만 스트리밍한다. 심볼릭 링크는 링크 자체를 한 항목으로 내고 따라가지 않으므로 자기 자신을 가리키는 순환 링크가 있어도 끝난다. `Vfs` 기반이라 아카이브 안에서도 같다.
- `td_search::disk_usage`: 대상 폴더의 바로 아래 항목마다 총 크기를 스레드 풀(기본 CPU 수, 최대 8)로 병렬 계산한다. `update_every`(기본 50ms)마다 크기 내림차순 스냅샷을 `on_update`로 보내고 마지막에 최종 스냅샷을 준다. 취소하면 멈추고 부분 합을 마지막 스냅샷으로 주며, 끝나지 않은 항목은 `done: false`다. 아카이브 안에서는 압축 해제 크기를 센다.
- 규칙: 하드 링크는 (장치, inode)로 한 번만 센다(`hardlinks_skipped` 보고), 심볼릭 링크는 따라가지 않고 링크 자체 크기만 센다, 볼륨 경계(`crosses_volume`)는 `UsageOptions::cross_volumes`(기본 false)가 켜져야 넘는다(`volume_skipped` 보고).
- `td-vfs`: `Entry.file_id: Option<FileId{dev, ino, nlink}>` 추가(유닉스에서만 채움, 아카이브 안 항목은 None).
- 테스트(`crates/td-search/tests/usage.rs`, 5개): `flatten_lists_files_only`(폴더 제외, 순환·깨진·폴더 링크가 링크 1항목, 아카이브 안, 취소), `disk_usage_sizes`(알려진 크기 8200바이트 트리를 스레드 1/2/4개로 정확히 계산, 내림차순, 진행 스냅샷 합이 줄지 않음, zip 안에서도 동일), `disk_usage_hardlink_once`(하드 링크 3개가 5000바이트를 한 번만, 심볼릭 링크는 링크 크기), `disk_usage_cancel`(느린 Vfs 래퍼에서 첫 부분 결과에 취소 → 소요 시간이 전체의 절반 미만, 부분 결과의 바이트 = 센 파일 수 × 파일 크기), `disk_usage_volume_boundary_default_off`(기본값 false, 경계 판정 단위 테스트, 장치 번호를 바꿔 보이게 한 Vfs로 실제 순회). 변형 검사: 하드 링크 중복 제거를 끄면 `disk_usage_hardlink_once`, 볼륨 경계 검사를 끄면 경계 테스트가 실패한다.

## 계획과 다른 점
- 볼륨 경계의 실제 다른 볼륨은 테스트 환경에서 만들 수 없어서 장치 번호를 조작하는 `Vfs` 래퍼로 검증했다(fake만 검증). 실제 마운트 지점에서의 동작은 확인하지 못했다.
- 심볼릭 링크는 0바이트가 아니라 링크 자체의 크기(대상 경로 길이)를 센다. `du`와 같은 방식이며 이 결정을 문서화했다.

## 한계
- Windows의 하드 링크 판정(파일 ID)은 구현하지 않았다: `file_id`가 None이라 Windows에서는 하드 링크를 중복으로 센다.
- 스트리밍은 콜백 기반이다. 화면(가상 탭)으로 흘려 보내는 스레드/이벤트 연결은 virtual-tabs-ui에서 한다.
