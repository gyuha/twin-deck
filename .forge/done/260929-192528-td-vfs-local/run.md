# RUN — td-vfs
- S1 VfsPath/Vfs trait/에러 — ✅ 계획대로
- S2 LocalFs list/stat/mkdir/create/rename/remove/copy — ✅ 계획대로
- S3 NFD 정렬/접두 일치 — ✅ (`nfd_korean_sort`, `nfd_korean_quick_select`)
- S4 숨김 판별 — ✅ (점 파일 / Windows 속성 cfg 분리)
DoD: cargo test -p td-vfs 4 passed, clippy/fmt exit 0.
