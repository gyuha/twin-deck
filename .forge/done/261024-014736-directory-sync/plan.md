<!-- forge-slug: directory-sync -->
<!-- task: 205 -->
<!-- tdd: off -->
# 디렉터리 비교와 선택적 양방향 동기화 (이슈 #109)

## 목표 / 비목표
- 목표: 참고 이미지의 경로·옵션·필터·비교 결과를 기존 테마에 맞게 제공하고, 파일별 방향 또는 제외를 정해 확인 뒤 복사한다. 기본은 양쪽 고유 파일과 최신 파일 복사이며 삭제하지 않는다.
- 비목표: 자동 삭제·미러링·주기 동기화·배포. 지원하지 않는 위치나 링크 충돌은 명시적으로 알리고 쓰지 않는다.

## 근거
- GitHub 이슈 #109와 참고 이미지, 2026-10-24 사용자의 권장 범위 승인.
- .forge/CONTEXT.md 전송·전송 진행 창 정의. 관련 ADR 추가 없음.
- 사이트 찾기: `rg -n 'openFind|core.find.open|enqueue_job' apps/desktop/src apps/desktop/src-tauri/src packages/actions/src/defaults.ts`
- 변경 지점: Rust 비교·안전 복사, service/commands/타입 생성, backend/tauri/fake, 액션·store·모달·키보드·메뉴·번역, docs/05 및 기능/화면 문서.

## 완료 정의
- Rust 임시 폴더 테스트: 고유/최신/동일/동일 시각 다른 내용/재귀/필터/종류 충돌/경로 겹침/링크/취소/비교 뒤 변경 보호와 실제 복사. `cargo test -p td-ops directory_sync`, `cargo test -p twin-deck-desktop directory_sync`.
- UI 통합 테스트: 열기, 비교, 옵션 변경 무효화, 방향 변경, 실행 확인 취소, 실행/완료/실패, 필터와 모달 키 격리. `cd apps/desktop && bunx vitest run src/__tests__/directory-sync.test.tsx`.
- 회귀: `cargo test --workspace`, `bun run test`, `bun run typecheck`, `cargo fmt --all --check`, `cargo clippy -p td-ops -p td-queue -p twin-deck-desktop -- -D warnings`.
- UI는 실제 렌더에서 크기·스크롤·포커스를 확인한다.
- 사전 상태: 기능·전용 테스트가 아직 없어 전방 검사는 미충족. 기존 테스트는 회귀 기준으로 실행 결과를 run.md에 기록한다.

## 작업 조각
- [ ] S1. 비교 및 안전 복사 엔진, 브리지·클라이언트 구현 — 완료 기준: 임시 폴더에서 실제 결과와 취소/충돌/변경 보호 테스트 통과.
- [ ] S2. 기존 앱에 비교·방향·확인·진행 UI 통합 — 완료 기준: FakeBackend 통합 테스트와 실제 렌더 점검 통과 (depends: S1; API를 고정한 뒤 UI 작성은 병행 가능).
- [ ] S3. 문서·생성물·회귀 확인 — 완료 기준: 완료 정의 명령 통과 및 한계 기록 (depends: S1,S2).
