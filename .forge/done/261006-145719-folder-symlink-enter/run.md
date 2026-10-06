# run — 폴더를 가리키는 심볼릭 링크로 Enter·오른쪽 클릭 열기·→로 들어간다

워크플로우 없이 직접 TDD로 실행했다. 테스트(Rust 1개, UI 6개)를 먼저 써서 빨간 상태를 확인한 뒤 구현했다.

## 슬라이스 결과
- S1 `EntryDto`에 `link_is_dir`(`linkIsDir`)를 더하고 `From<&Entry>`에서 링크일 때만 `fs::metadata`(링크를 끝까지 따라감)로 판정, `task gen-types`, `fake.ts` — ✅ 계획대로
- S2 폴더 들어가기 경로를 폴더 링크에도 적용: `open()`(Enter·더블클릭·오른쪽 클릭 "열기"가 모두 이 함수), 패널 `→` 분기 — ✅ 계획대로(`isFolderEntry` 헬퍼 한 곳)

## 계획과 달라진 점
- 필수 필드라서 `EntryDto`를 직접 만드는 곳 4개에 `link_is_dir: false`를 넣었다: `From<&UsageItem>`(디스크 사용량 결과), 10만 항목 DTO 성능 테스트, 그리고 TS 쪽 테스트 도우미 2곳(`bench.test.tsx`, `lib.test.ts`).
- 오른쪽 클릭 메뉴의 "열기"와 더블클릭은 별도 수정이 필요 없었다. 둘 다 `open()`을 부르기 때문이다. 계획에 적은 "`cursorIsDir` 컨텍스트"는 어느 액션의 활성 조건에도 쓰이지 않아서 건드리지 않았다.
- `FakeBackend`에 테스트용 `seedLink`를 더하고, 폴더 링크의 `listDir`이 대상 폴더의 내용을 링크 경로 아래 항목으로 돌려주게 했다(실제 파일시스템처럼).
- 링크의 링크(`to_link_to_dir`)도 끝까지 따라가 폴더면 true로 판정하고 테스트로 고정했다.
- DoD 3의 일반 폴더·파일 링크·끊어진 링크 테스트는 구현 전에도 통과했다(회귀 방지). 구현 전 실패한 전진 검사는 폴더 링크 경로 4개다.

## DoD baseline → after
1. `cargo test -p twin-deck-desktop link_is_dir` — 0 tests → 1 passed (구현 전 컴파일 실패)
2. `task gen-types` 후 `up_to_date` 통과, `bindings.ts`에 `linkIsDir` 1건
3. `vitest -t "폴더 심볼릭 링크"` — 0 → 6 passed (구현 전 4개 실패, 2개는 회귀 방지로 통과)
4. `tsc`, clippy, fmt 통과, `cargo test -p twin-deck-desktop` 41 passed, 전체 vitest 667 통과 / 1 실패(`pdf-preview` 기준선)

## 남은 불확실성 / 한계
- 파일을 가리키는 링크는 여전히 `Enter`로 열리지 않는다(사용자 결정으로 이번 범위 밖).
- 실제 macOS iCloud `CloudDocs` 같은 링크와 Windows의 디렉터리 심볼릭 링크·정션은 확인하지 못했다. Windows 정션은 Rust `is_symlink()`가 false를 돌려줄 수 있어 이 경로를 타지 않을 수 있다 [중간].
- 링크를 폴더 링크로 판정하는 `fs::metadata`는 링크가 있을 때만 한 번 더 호출한다(링크가 아주 많은 폴더에서의 비용은 측정하지 못했다).
