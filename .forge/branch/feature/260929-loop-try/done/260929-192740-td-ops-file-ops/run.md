# RUN — td-ops
- S1 작업 계획/충돌 정책 타입 — ⚠ 별도 plan 구조체 없이 `Ops` 메서드 + `ConflictPolicy`로 단순화(YAGNI)
- S2 복사/이동/이름 변경/mkdir/touch — ✅ (이동은 rename 실패 시 복사+삭제 폴백)
- S3 충돌 3종 + 자기 하위 거부 — ✅ 추가로 같은 파일 덮어쓰기(SameFile) 방어
- S4 휴지통(trait)/영구 삭제 — ✅ `SystemTrash`는 실제 휴지통을 테스트하지 않음(fake만 검증)
- S5 scenario.rs — ✅
부수: td-vfs trait에 read_link/symlink 추가.
DoD: cargo test -p td-ops 12 passed (지정 테스트 전부 존재).
