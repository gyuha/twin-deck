# RUN — 릴리스 스크립트가 이미 있는 초안의 본문을 덮어쓰지 않게 한다 (리뷰 L)

- S1 두 스크립트와 AGENTS.md — ✅ 초안이 이미 있으면 `gh release edit`를 하지 않는다(처음 만들 때만 본문을 채운다). AGENTS.md "릴리스 공개 흐름" 2단계 문구를 맞췄다

## DoD (정적 검증)
1. `bash -n scripts/release.sh` 통과, `gh release edit` 문자열: release.sh 1 → 0, release.ps1은 `"edit"` 호출 1 → 0
2. AGENTS.md: "본문을 같은 내용으로 맞춘다" → "본문은 건드리지 않는다"
3. `bun test scripts/` 28건 통과

## 한계·메모
- 이 작업은 grep·구문 검사로만 검증했다. `gh` 실제 호출은 안전상 하지 않았고, DRY_RUN으로도 초안 존재 분기를 재현하지 못했다(`release_info`가 실제 `gh api`를 부른다). 변경은 `else` 분기에서 한 줄을 지운 것이라 위험은 작지만 실행 검증은 아니다.
- 트레이드오프: 초안을 만든 뒤 CHANGELOG를 고쳐도 초안 본문은 갱신되지 않는다(`latest.json`의 notes는 계속 CHANGELOG에서 만든다). 초안 본문과 `latest.json` notes가 어긋날 수 있어 AGENTS.md에 직접 고치거나 초안을 지우고 다시 만들라고 적었다.
