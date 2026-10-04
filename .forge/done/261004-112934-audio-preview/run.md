# RUN — 사운드 파일 미리보기 (audio-preview)

워크플로 없이 직접 실행했다(작은 작업).

- S1 `td-vfs`: `PreviewKind::Audio`, `audio_mime`(mp3·wav·ogg·oga·opus·flac·m4a·aac·weba), `PreviewLimits.audio_bytes`(20MiB), 테스트 4개 — ✅ 계획대로
- S2 `service.rs` DTO(`Audio`)와 테스트, 바인딩 재생성, FakeBackend의 오디오 MIME — ✅ 계획대로
- S3 `AudioView`(Blob URL, `controls`, `preload=metadata`, 자동 재생 없음, 오류 안내, 닫거나 넘기면 pause)와 `Preview` 연결, `audio-preview.test.tsx` 8개 — ✅ 계획대로
- S4 실제 앱 확인 — ✅ (아래)

## DoD baseline → after
- td-vfs `audio` 테스트: 0 → 4개 통과, 서비스 `preview_dto_maps_audio` 통과, `up_to_date` 통과, `PreviewKindDto`에 `"audio"`
- audio-preview.test.tsx: 0 → 8개 통과, vitest 전체 544 통과·실패 1(기존 `pdf-preview`), `tsc` 오류 없음
- `cargo test --workspace`·fmt·clippy 통과
- 실제 앱(격리 인스턴스, `ffmpeg`로 만든 3초 무음 mp3·wav·ogg(Opus)): 미리보기를 열면 재생 UI가 뜨고 ▶ `00:00`/`00:03`(ogg는 `00:04`)로 재생되지 않은 채 있음. mp3의 재생 버튼을 마우스로 클릭하면 일시정지 아이콘과 진행 표시로 바뀜(클릭하면 재생). ogg(Opus)도 웹뷰가 풀어 길이가 표시됨.

## 어긋난 점
- 첫 실제 확인에서, mp3를 클릭해 재생 중인 상태로 ↓로 넘기자 ogg 미리보기가 클릭 없이 재생되는 것이 한 번 보였다. 재생 중이던 요소가 사라져도 소리 자원이 남아 다음 요소에서 이어지는 현상으로 보인다. `AudioView`가 닫을 때·다른 파일로 넘어갈 때 `pause()`, `src` 제거, `load()`를 하도록 고치자(정리 시점에 ref가 비어 있어서 효과 시작 때 요소를 붙잡아 둠) 같은 순서를 다시 해도 재생되지 않았다. 이 동작은 `pause` 호출을 단언하는 테스트로 고정했다.
- jsdom의 `Blob`에는 `text()`가 없어서(기존 `pdf-preview` 테스트가 실패하는 이유) 새 테스트는 `FileReader`로 읽었다.
- 테스트가 `ffmpeg`에 `libvorbis`가 없어 Opus(Ogg)로 만든 파일을 썼다. Ogg Vorbis는 이 웹뷰에서 시험하지 못했다.
- 소리는 확인하지 못했다(무음 파일, 화면 상태로만 확인). README의 미리보기 항목에 사운드 설명을 한 줄 더했다.
