<!-- forge-slug: system-icons-3of3 -->
# 실행 기록 — 시스템 파일 아이콘 (3/3) Windows 구현

## 한 일
- `td-icons/src/pixels.rs`(새, OS 무관): `bgra_to_rgba`·`has_alpha`·`apply_mask_alpha`(AND 마스크로 알파)·`encode_png`(`png` 크레이트). 테스트 7개(4×4 값 단언, PNG 왕복 디코딩, 잘못된 크기, BGRA+마스크→RGBA→PNG 한 줄기).
- `td-icons/src/win.rs`(새, `cfg(windows)`): COM STA 초기화 RAII, `SHGetFileInfoW`(`SHGFI_ICON`+작은/큰 아이콘, 폴더·확장자는 `SHGFI_USEFILEATTRIBUTES`, 경로는 실제 파일), `GetIconInfo`→`GetDIBits`(위에서 아래 32비트 BGRA)→알파 없으면 마스크 적용→PNG. `HICON`·비트맵·DC 해제.
- `service.rs`: 소스 결정을 `icon_source_with`로 나눠 OS별 규칙을 값으로 시험(디스크 위 `exe`·`lnk`·`ico`·`scr`·`cur`는 Windows에서 경로, macOS의 `.app`은 경로). 테스트 1개 추가.
- `docs/07`에 Windows 크기 설명.

## 계획과 실제
- 계획과 같다. 한 가지 더한 것: 계획의 "COM을 요구하지 않는 경로만 쓴다"는 셸 아이콘 처리기(특히 경로 소스의 exe)가 COM을 쓸 수 있어 안전하지 않다고 보고, 호출 스레드에서 STA를 초기화하고 해제하는 방식으로 바꿨다(이미 다른 모드면 건드리지 않음).
- Windows 쪽은 clippy(`x86_64-pc-windows-msvc`, `--tests` 포함)가 한 번에 통과했지만 실제로 실행해 보지는 못했다.

## 검증
- C1 td-icons 16 통과(macOS 9 + 픽셀 7). C2 Windows 타깃 clippy -D warnings 통과, `SHGetFileInfoW`가 소스에 있음. C3 system_icon 5·up_to_date 통과. C4·C5·C6·C7 그대로 통과(vitest 1232 통과·실패 기준선 2개 파일뿐, cargo test desktop 120·td-config 45).
- 남은 확인(사람, Windows 기기): 설정을 켜고 목록에 탐색기와 같은 아이콘이 뜨는지, `.exe`·`.lnk`가 각자의 아이콘인지, COM 초기화 때문에 막히지 않는지.
