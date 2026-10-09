<!-- forge-slug: preview-size-limits -->
<!-- task: 123 -->
<!-- tdd: off -->
# 이미지·PDF·사운드 미리보기 용량 한도를 설정 키로 만든다

## 목표 / 하지 않을 것
- 목표: `preview.image_max_mb`(10)·`preview.pdf_max_mb`(10)·`preview.audio_max_mb`(20), 정수 MB, 0은 제한 없음. td-config 키·검증, `Service`가 현재 한도를 들고(`PreviewLimits` 갱신) 시작·`set_config_value`·설정 파일 재읽기에서 갱신, 모든 미리보기 경로(디스크, 압축 안 `read_preview_vfs`, service.rs의 `image_bytes` 직접 참조)가 그 한도를 씀, 설정 화면 미리보기 탭의 숫자 항목 3개(ko·en 사전, ⓘ 설명), docs/06.
- 하지 않을 것: loop.md의 범위 밖 항목.

## 기준 문서
- 관련 ADR: 없음. 용어: 없음. 완료 정의(DoD): `.forge/loop.md`의 C1~C6.

## 작업 조각
- [ ] S1. td-config 키·검증·기본값과 `preview_limits` 테스트 — 완료 기준: C1
- [ ] S2. Service 한도 보관·갱신 경로와 `preview_limits*` 테스트(모든 경로 사용) — 완료 기준: C2·C4 (depends: S1)
- [ ] S3. gen-types, 설정 화면 항목·사전·문서, `preview-limits-setting` 테스트 — 완료 기준: C3·C5 (depends: S1)
- [ ] S4. 전체 회귀 — 완료 기준: C6 (depends: S2, S3)
