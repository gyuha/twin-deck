<!-- forge-slug: audio-preview -->
<!-- task: 50 -->
<!-- generated-by: fg-loop-initial -->
<!-- tdd: off -->
# 사운드 파일 미리보기 (재생 UI, 클릭하면 재생)

## Goal / Non-goals
- Goal: mp3·wav·ogg·oga·opus·flac·m4a·aac·weba 파일의 미리보기를 열면 자동 재생 없이 오디오 재생 UI(`<audio controls preload="metadata">`)가 뜨고, 재생 버튼을 클릭하면 재생된다. 한도(20MiB) 초과는 안내만, 웹뷰가 못 푸는 형식은 `error` 이벤트로 안내 문구를 보인다. 닫으면 Blob URL을 해제하고 재생도 멈춘다.
- Non-goals: 재생 목록, 파형·태그, 스트리밍, 비디오, 코덱 변환.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- Definition of Done: C1~C5(loop.md). 새 Rust 테스트 `audio` 3개 이상, `audio-preview.test.tsx` 6개 이상, 실제 앱에서 mp3·wav 재생 UI와 클릭 재생 확인, 전체 검사 통과.

## Work slices
- [ ] S1. `td-vfs`에 `PreviewKind::Audio`, `audio_mime`, `PreviewLimits.audio_bytes`(20MiB)와 `read_preview`의 오디오 분기, 테스트를 추가한다 — completion criterion: `cargo test -p td-vfs`의 audio 테스트 통과
- [ ] S2. `service.rs`의 DTO(`PreviewKindDto::Audio`)와 매핑, 바인딩 재생성, FakeBackend의 오디오 MIME — completion criterion: `up_to_date`와 서비스 테스트 통과, `tsc` 오류 없음 (depends: S1)
- [ ] S3. `AudioView`(Blob URL, `controls`, `preload=metadata`, 자동 재생 없음, 오류 안내)와 `Preview` 연결, `audio-preview.test.tsx` — completion criterion: 새 vitest 통과 (depends: S2)
- [ ] S4. 실제 앱에서 mp3·wav(·ogg) 재생 UI와 클릭 재생을 캡처로 확인한다 — completion criterion: C3 (depends: S3)
