# RUN — preview-and-theme
- S1 Rust 미리보기 — ✅ `td_vfs::read_preview`(텍스트 앞 64KB만 읽음·잘린 글자 경계 처리·NUL/잘못된 UTF-8은 Other·이미지는 10MB 이하만 data URL·폴더). `preview_text_reads_prefix_only`(1MB 파일에서 앞부분만, 정확히 앞부분과 일치), `preview_image_data_url`, `preview_other_dir_and_errors`. Tauri `preview_file` + FakeBackend.
- S2 미리보기 UI, Space 재배정 — ✅ `core.preview`(Space, Mod+Y), `preview` 스코프(모달; Space/Esc/Mod+Y 닫기, ↑↓/←→로 이전·다음 항목 + 커서 이동), 늦게 온 응답이 화면을 덮지 않도록 요청 순번 관리. 선택 토글은 `Insert`와 `Shift+Space`로 옮김(맥 노트북에는 Insert가 없어서). 영향받은 M1/M2 테스트 8곳을 `{Insert}`로 수정. 오디오/비디오/구문 강조는 범위 밖.
- S3 테마 — ✅ `behavior.theme` = light | dark | system(Rust가 허용값 검증, 그 밖은 경고+light — 사용자 정의 테마는 P3). `<html data-theme>`에 반영, system은 `prefers-color-scheme`을 따르고 OS 설정이 바뀌면 추종, 설정 변경 즉시 반영. 컴포넌트를 고치지 않도록 다크는 Tailwind 색 변수를 덮어쓰는 방식(`theme.css`). 흰 표면은 `bg-white` 대신 `bg-(--td-surface)`(다크에서 `text-white`가 어두워지면 안 되므로).
  가드 테스트: 컴포넌트가 쓰는 모든 색 유틸리티(neutral/blue/red/green/amber/yellow)가 다크 블록에 정의됐는지, `bg-white` 직접 사용이 없는지를 기계로 검사.
- 테스트가 잡은 것: 가드 정규식이 `border-l-4`를 색으로 오인(색 계열 이름으로 한정), 삭제 후 미리보기 오류 재현 시도는 목록이 즉시 갱신돼 재현 안 됨(백엔드가 던지도록 재현).
⚠ 미검증: 실제 웹뷰에서의 색 대비(WCAG AA는 M2 테마 확정 때 검증한다고 docs에 있음 — 이번에는 검증하지 않았다), 다크 색상값이 눈으로 보기에 적절한지, 큰 이미지의 렌더링 성능.
⚠ 한계: 이미지 미리보기는 파일 전체를 base64로 IPC에 싣는다(10MB 상한). 그 이상은 "너무 커서 볼 수 없음".
DoD: td-vfs preview 3, td-config 8, desktop cargo 10, desktop vitest 172(preview 10, theme 8).
