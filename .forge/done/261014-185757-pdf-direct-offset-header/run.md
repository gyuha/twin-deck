# 실행 기록 — PDF 직접 열기: 맨 앞이 %PDF가 아닌 파일은 기존 데이터 경로로 보낸다 (이슈: 포트폴리오 PDF 미리보기 깨짐)

fg-next all 구동 중 직접 실행했다(tdd on).

## 슬라이스별 결과
- S1 먼저 실패하는 테스트 — ✅ 계획대로. `pdf_direct_falls_back_to_data_when_header_is_not_first`와 `pdf_direct_falls_back_still_applies_the_size_limit`가 수정 전 코드에서 모두 실패했다(직접 열기로만 응답해 `data_url`이 없고 한도도 무시).
- S2 `Service::preview`에 `starts_with_pdf_header`(앞 4바이트가 `%PDF`) 조건 — ✅ 계획대로. 기존 희소 파일 테스트에는 `%PDF-` 머리를 써 넣었다(계획된 조정).
- S3 `docs/06-config-plugins.md` 설명과 코드 주석 — ✅ 계획대로.

## DoD baseline → after
1. `cargo test … pdf_direct_falls_back`: 0건 → 2건 통과(수정 전 코드에서는 2건 실패, red→green 확인).
2. `cargo test … pdf_direct`: 2건 통과 → 4건 통과.
3. `up_to_date`: 2건 통과 → 2건 통과(회귀 방어).
4. `clippy -p twin-deck-desktop -- -D warnings`·`fmt --check`: 통과 → 통과(회귀 방어). 데스크톱 크레이트 전체 122건 통과.
5. `grep -c '%PDF' docs/06`: 0 → 1.

## 계획과 다른 점
- 없음(계획에 적은 기존 테스트 조정 포함).

## 남은 한계
- 실제 앱(WKWebView)에서 이 PDF가 보이는지는 자동 테스트로 증명하지 못했다. `pdf_direct = true`인 상태에서 `/Users/gyuha/Downloads/윤성현 님 이력서/윤성현 님 포트폴리오.pdf`를 미리보기해 직접 확인해야 한다(앱 재시작 필요: Rust 변경).
- 맨 앞이 `%PDF`가 아닌 PDF가 `pdf_max_mb`(기본 10MB)를 넘으면 직접 열기를 못 쓰고 "너무 큼" 안내가 뜬다.
- 이번 구동은 작업 트리에 계획 파일(미추적)이 있어 작업마다 커밋하지 않았다.
