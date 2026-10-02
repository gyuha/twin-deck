# 04. Spacedrive 재사용 계획

## 1. 결론

Spacedrive의 `sd-core`는 파일 탐색기의 기반으로 쓰기에 부적합하다. 디렉터리 목록 조회(`core/src/ops/files/query/directory_listing.rs`)가 sea-orm DB에 인덱싱된 위치만 읽고, 복사와 볼륨 관리는 `CoreContext`, `LibraryManager`, `SdPath` 같은 라이브러리 계층 타입에 얽혀 있다 `[높음]`. 따라서 twin-deck은 **독립 크레이트와 독립 프론트엔드 모듈만 그대로 가져오고, 얽힌 부분은 로직만 참고해 새로 쓴다**([ADR-0002](adr/0002-monorepo-selective-port.md)).

Spacedrive에는 듀얼 패널이나 분할 뷰가 없다 `[높음]`(코드 검색 결과 문서와 설계 노트에만 등장). 듀얼 패널은 twin-deck이 새로 만드는 핵심 기능이다.

## 2. 기준점

| 항목 | 값 |
|---|---|
| 저장소 | https://github.com/spacedriveapp/spacedrive |
| 기준 커밋 | `6dfeccf` (2026-07-28), 버전 `2.0.0-alpha.2` |
| 상태 | v2가 `main`. alpha이며 2026-04-19 ~ 07-29 사이 커밋 공백이 있음 |

이식한 코드는 이 커밋을 기준으로 하며, 이식 시점의 커밋 해시를 `THIRD_PARTY_NOTICES.md`에 기록한다. 상류 변경은 자동 동기화하지 않고, 필요할 때 수동으로 비교해 가져온다.

## 3. 재사용 매트릭스

전략은 세 가지다.

- **복사**: 파일을 거의 그대로 가져온다. 경로/이름/라이선스 헤더만 조정한다.
- **포팅**: 로직을 가져오되 의존 타입을 twin-deck 타입으로 바꾼다.
- **참고**: 코드는 가져오지 않고 설계만 참고해 새로 작성한다.

### 3.1 Rust

의존성은 이식 대상 저장소를 받아 `Cargo.toml`에서 직접 확인했다 `[높음]`.

| 대상 | 원본 경로 | 용도 | 의존성 확인 결과 | 전략 |
|---|---|---|---|---|
| `sd-fs-watcher` | `crates/fs-watcher` | 파일 감시(notify 기반, macOS rename 감지). DB/라이브러리 지식 없음 | 다른 `sd-*` 크레이트 의존 없음. workspace 공통 의존성만 사용 | **복사** |
| `sd-task-system` | `crates/task-system` | tokio 기반 범용 작업/워커 시스템 | 다른 `sd-*` 크레이트 의존 없음 | **복사** |
| `sd-images` | `crates/images` | 이미지, heif, pdf, svg 썸네일 | 다른 `sd-*` 의존 없음. `specta`는 optional | **복사** (P2, 썸네일 도입 시) |
| `sd-ffmpeg` | `crates/ffmpeg` | 비디오 썸네일(webp) | `sd-utils`(경로 의존) 필요 | **복사** (P2). FFmpeg 네이티브 의존성이 무겁다. 도입 여부는 M3 결정 |
| `sd-utils` | `crates/utils` | `sd-ffmpeg`가 요구하는 소형 헬퍼 | `thiserror`, `tracing`뿐 | `sd-ffmpeg`와 함께 **복사** |
| `sd-actors` | `crates/actors` | 소형 액터 헬퍼 | 다른 `sd-*` 의존 없음 | 필요할 때만 **복사** |
| `file-opening` 계열 | `apps/tauri/crates/file-opening`, `-macos`, `-windows`, `-linux` | 경로별 앱 목록, 앱으로 열기, 기본 앱으로 열기 | 서로 경로 의존만 있고 다른 `sd-*` 의존 없음. 내부 OS API 크레이트는 미확인 `[알 수 없음]` | **복사** (Open With, M3) |
| 복사 전략 | `core/src/ops/files/copy/` (약 5천 줄) | APFS clone/reflink, 스트리밍 복사, 이동 판정 | `CoreContext`, `SdPath`, `VolumeManager`, `infra::job`에 결합 | **참고 + 포팅**: CoW/스트리밍 로직과 라우팅 아이디어만 |
| 삭제 전략 | `core/src/ops/files/delete/strategy.rs` | `DeleteMode::Trash`(`trash` 3.3.1), 영구, 보안 삭제 | `SdPath`, job prelude에 결합 | **포팅** (얇다) |
| 이름 변경, 폴더 생성 | `ops/files/rename`, `create_folder` | | 라이브러리/DB에 결합 | **참고** (사실상 `std::fs` 호출) |
| 볼륨 감지 | `core/src/volume/detection.rs`, `platform/*` | 플랫폼별 볼륨 감지 | 대체로 독립적으로 보임 `[중간]`. 읽고 확인 필요 | **포팅** |
| 볼륨 매니저 | `core/src/volume/manager.rs` | | DB 엔티티, `LibraryManager`, `Core`에 결합 | **참고** (새로 작성) |
| Ephemeral 인덱스 | `core/src/ops/indexing/ephemeral/` (약 3.6천 줄) | 메모리 상의 arena 기반 비-DB 목록 | 인덱서 상태, 규칙, 파일 타입 레지스트리, job prelude에 결합 | **참고**: 설계만 |
| 디렉터리 목록 조회 | `ops/files/query/directory_listing.rs` | | DB 조회 | **사용 안 함** |
| 검색, 썸네일 사이드카 | `ops/search`, `ops/media/thumbnail` | | 라이브러리/DB 필요 | **사용 안 함** |
| 아카이브, Open With 로직 | (코어에 없음) | | `crates/archive`는 외부 데이터 인덱서이며 zip/tar 처리가 아님 | **새로 작성** |

### 3.2 프론트엔드

| 대상 | 원본 경로 | 확인한 사실 | 전략 |
|---|---|---|---|
| 키바인드 레지스트리 | `packages/interface/src/util/keybinds/` (`index`, `listener`, `platform`, `registry`, `types`, 약 895줄) | 외부 패키지 import 없이 상대 경로만 사용 `[높음]`. 스코프: `global`, `explorer`, `settings`, `mediaViewer`, `tagAssigner`, `quickPreview` | **복사**. 스코프 목록을 twin-deck 스코프로 교체 ([05](05-actions-keybindings.md)) |
| TabManager | `packages/interface/src/components/TabManager/` (`TabBar`, `TabManagerContext`, `TabKeyboardHandler`, `useTabManager`, `TabView`, `TabDefaultsSync`, `TabNavigationSync`) | 외부 결합은 `@spacedrive/primitives`와 `@sd/ts-client` 각 1건 `[높음]`. 탭마다 라우터를 쓰는 구조 | **포팅**: 라우터 제거, 탭 상태 객체로 교체. 패널 두 개용으로 재구성 |
| 탐색기 뷰 | `packages/interface/src/.../explorer/views/` (ListView, GridView, ColumnView, MediaView, SizeView) | `@sd/ts-client` 훅과 `SdPath`에 결합 | **포팅**: ListView(tanstack-table + 가상 스크롤), ColumnView. Grid/Media/Size는 후순위 |
| DragSelect, InlineNameEdit, PathBar, Breadcrumb | 같은 explorer 폴더 | 동일하게 라이브러리 타입에 결합 | **포팅** |
| QuickPreview | `packages/interface/src/.../QuickPreview/` | 비디오, 오디오, 텍스트(prism), 메시 | **포팅** (P1 미리보기, 텍스트/이미지부터) |
| 생성 타입, 훅 | `packages/ts-client` (`client.ts`, `transport.ts`, `useNormalizedQuery` 등, `generated/types.ts`는 5271줄) | 데몬 RPC 전제 | **참고**: 훅 패턴만. twin-deck은 Tauri command 직접 호출 |
| Tauri 명령 | `apps/tauri/src-tauri/src/main.rs` (2251줄): `reveal_file`, `begin_drag`/`end_drag`, `register_keybind`, `get_apps_for_paths`, `open_path_with_app` | `daemon_request`, `subscribe_to_events`는 데몬 전제 | **포팅**: 앞의 명령들만. 데몬 관련 명령은 쓰지 않음 |
| 디자인 시스템 | 별도 저장소 `spacedriveapp/spaceui`(MIT): `@spacedrive/primitives`, `tokens`, `forms`, `ai`, `explorer`(v0.2.3), `icons` | `explorer`는 소형(FileThumb, GridItem, RenameInput, TagPill) | **의존성으로 사용**: `primitives`, `tokens`. 나머지는 필요할 때 |
| 에셋 | `packages/assets` | `package.json`에 GPL-3.0-only 표기 | 필요한 아이콘만 개별 검토 후 복사 |

## 4. 이식 절차

이식은 파일 단위로 추적 가능해야 한다. 아래 절차를 이식 대상마다 반복한다.

```
대상 선정 → 의존성 확인 → 복사 → 라이선스 조정 → 출처 기록 → 빌드/테스트 → 커밋
                ↓ 다른 sd-* 또는 라이브러리 타입에 결합
            전략을 "포팅"으로 변경하고 어댑터 계층에서 격리
```

1. **의존성 확인**: `Cargo.toml`/`package.json`/import를 읽어 다른 `sd-*`, `@sd/*`에 의존하는지 본다. 의존하면 함께 가져올지, 포팅할지 결정한다.
2. **복사 위치**: Rust는 `crates/vendor/<원래 크레이트 이름>/`, TS는 해당 패키지의 `vendor/` 하위. 원래 이름을 유지한다.
3. **workspace 상속 처리**: 이식 대상 크레이트는 `license.workspace = true`, `edition.workspace = true`, 의존성 `{ workspace = true }`를 쓴다. twin-deck 워크스페이스로 옮기면 상속 값이 twin-deck 값으로 바뀌므로 다음을 한다.
   - `license`는 `license = "FSL-1.1-ALv2"`로 **명시**한다(상속 금지). 그렇지 않으면 Spacedrive 코드가 twin-deck 라이선스로 표기된다.
   - 사용하는 `[workspace.dependencies]` 항목을 twin-deck 루트에 같은 버전으로 옮긴다.
4. **출처 기록**: 파일 헤더와 `THIRD_PARTY_NOTICES.md`(5절).
5. **수정 최소화**: 이식 직후 커밋은 "복사 + 최소 조정"만 담는다. 기능 변경은 다음 커밋으로 분리한다. 상류와 비교하기 쉽게 하기 위해서다.
6. **테스트**: 원본이 가진 테스트를 함께 가져와 통과시킨다(`sd-fs-watcher`는 `tempfile`, `tracing-test` 등 dev-dependencies 사용).

## 5. 라이선스와 출처 표기

이 절의 규칙은 개인/사내 전용 사용을 전제로 한다. 배포 범위가 바뀌면 [ADR-0009](adr/0009-license-and-provenance.md)의 재검토 조건이 발동한다.

### 5.1 확인한 사실

| 항목 | 내용 |
|---|---|
| 루트 `LICENSE` | FSL-1.1-ALv2 (Copyright 2026 Spacedrive Technology Inc.). 각 버전 공개 2년 후 Apache 2.0으로 전환 `[높음]` |
| Competing Use | 금지. Spacedrive를 대체하거나 실질적으로 유사한 기능을 제공하는 상업 제품 `[높음]`. 내부 사용, 비상업 교육/연구는 허용 |
| 재배포 조건 | 라이선스 조항(또는 링크)과 저작권 고지를 유지해야 함 `[높음]` |
| Rust 크레이트 | 대부분 `license.workspace = true`(즉 FSL). `core`와 일부 크레이트는 license 필드 없음. `crates/sdk`는 `MIT OR Apache-2.0` `[높음]` |
| TS 패키지 | `packages/interface`, `packages/assets`는 `GPL-3.0-only`, `packages/ts-client`는 `GPL-3.0`로 `package.json`에 표기됨 `[높음]`. 루트 FSL과 충돌하며 어느 쪽이 적용되는지는 알 수 없다 `[알 수 없음]` |
| `spaceui` | MIT (GitHub API 표기, 2026-10-01 재확인. npm 패키지 매니페스트에는 license 필드가 없다) `[높음]` |
| NOTICE 파일 | 없음. 루트 `LICENSE`만 있음 `[높음]` |

### 5.2 twin-deck 규칙

1. **이식한 모든 파일에 헤더를 둔다.**

   ```
   // Adapted from Spacedrive (https://github.com/spacedriveapp/spacedrive)
   // Commit 6dfeccf, path: <원본 경로>
   // License: FSL-1.1-ALv2 (Rust) / GPL-3.0 as declared in package.json (TS)
   // Copyright 2026 Spacedrive Technology Inc.
   ```

2. **루트에 `THIRD_PARTY_NOTICES.md`를 둔다.** 열: 이식 대상, 원본 경로, 원본 커밋, 선언된 라이선스, 전략(복사/포팅), twin-deck 경로, 이식 날짜. FSL 전문을 `licenses/FSL-1.1-ALv2.txt`로 포함한다.
3. **GPL 표기 패키지에서 온 코드는 `gpl-tainted` 태그를 붙인다.** `THIRD_PARTY_NOTICES.md`의 해당 행과 파일 헤더에 표시한다. 대상은 `packages/interface`(키바인드, TabManager, explorer 뷰, QuickPreview)와 `packages/assets`, `packages/ts-client`다. 이렇게 하는 이유는 배포 범위가 넓어질 때 어느 파일을 다시 써야 하는지 즉시 알기 위해서다.
4. **Rust 이식 크레이트의 `license`는 상속하지 않고 `FSL-1.1-ALv2`로 명시한다.**
5. **twin-deck 자체 코드의 라이선스는 이 문서에서 정하지 않는다.** 저장소에 LICENSE 파일이 없다. 사용 범위가 사내 전용이라 지금 결정이 필요하진 않지만, 이식 코드가 섞인 저장소를 사내 외부로 옮길 때는 먼저 정해야 한다.

### 5.3 Marta 관련

Marta는 폐쇄 소스이며 API 문서는 CC BY-ND 4.0이다 `[높음]`. twin-deck은 기능을 구현할 뿐 Marta의 코드, 아이콘, 테마 파일, 문서 문장을 가져오지 않는다. 문서에 인용하는 Marta URL은 출처 표시용이다.

## 6. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| Spacedrive v2가 alpha다 | 상류 API 변경 | 크레이트는 복사본으로 소유하고 상류를 의존성으로 두지 않음 |
| specta가 git fork에 의존한다 | 타입 생성 도구 선택이 불안정 | [03](03-tech-stack.md) 미확인 과제. 스캐폴딩 때 검증 |
| GPL/FSL 표기 충돌 | 배포 시 법적 불확실성 | `gpl-tainted` 태그로 교체 대상을 즉시 식별 |
| 이식 크레이트의 workspace 상속 | 라이선스 오표기, 빌드 실패 | 4절 3항 절차 |
| `apps/tauri/crates/*`는 Spacedrive 워크스페이스 멤버가 아니라 경로 의존으로만 쓰임 | 그대로 빌드되지 않을 수 있음 | 복사 후 twin-deck 워크스페이스에 명시적으로 등록 |
| 상류에 없는 기능(듀얼 패널, 아카이브)이 핵심이다 | 재사용으로 절약되는 범위가 제한적 | 일정에 재사용 효과를 과대 반영하지 않음 ([11](11-roadmap.md)) |

## 7. 미확인 과제

| 항목 | 확인 방법 |
|---|---|
| `file-opening-*` 내부의 OS API 의존성(objc, windows 크레이트 등) | 각 `Cargo.toml` 열람 |
| `volume/detection.rs`, `platform/*`의 독립성 | 소스 열람 후 `crate::` 참조 확인 |
| ~~`@spacedrive/primitives`, `tokens`의 npm 게시 여부와 버전~~ | 확인함(2026-10-01): `tokens` 0.2.3, `primitives` 0.2.4 |
| 키바인드/TabManager 파일의 상대 import 사슬이 어디까지 이어지는지 | 이식 시 import 그래프 확인 |
| GPL 표기 패키지의 실제 적용 라이선스 | Spacedrive 저장소 이슈/커밋 이력 조사 또는 무시하고 `gpl-tainted`로 관리 |
