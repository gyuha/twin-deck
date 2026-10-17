<!-- forge-slug: server-icon-emoji-picker -->
<!-- task: 195 -->
<!-- tdd: off -->
# 연결 항목의 아이콘 칸을 누르면 이모지 선택 팝업이 뜨게 한다 (frimousse)

## Goal / Non-goals
- Goal: 서버 편집 창(SMB·SFTP·FTP·Twin Deck Remote 공용 `IconField`)에서 **아이콘 칸을 누르면(클릭·포커스)** 칸 근처에 **팝업**(화면 위에 떠서 편집 창의 크기·스크롤을 바꾸지 않는다)으로 이모지 선택기가 뜬다. 선택기는 라이브러리 `frimousse`로 만들고 전체 이모지·검색·한국어를 지원한다. 이모지 데이터는 앱에 포함해(인터넷 요청 없이) 오프라인에서도 된다. 이모지를 누르면 아이콘이 바뀌고 팝업이 닫히며 포커스가 칸으로 돌아온다. "지우기"로 비운다. `Esc`는 팝업만 닫고(편집 창은 그대로), 바깥을 누르면 닫힌다. 칸에 직접 입력하거나 OS 선택기로 넣는 방식도 그대로 된다. 이미 만든 인라인 격자 구현은 팝업으로 교체하고 `lib/emojiList.ts`는 쓰지 않게 되므로 지운다.
- Non-goals: `frimousse` 외 새 의존성. CDN(외부 주소)에서 이모지 데이터 받기. 최근 사용·피부색 선택 UI 꾸미기(기본 제공되는 것은 써도 되지만 따로 만들지 않는다). Rust·Tauri 명령·`Backend` 인터페이스·생성 바인딩 변경. 아이콘 저장 형식·표시 위치 변경(이슈 #93 그대로). 버전·CHANGELOG·커밋·push.

## Source of truth
- Glossary terms: none
- Related ADRs: none (`docs/07-ui-spec.md`의 "연결 아이콘(이슈 #93)", `Settings.tsx`의 `IconField`·`lastGrapheme`)
- Definition of Done:
  1. `cd apps/desktop && bunx vitest run src/__tests__/icon-emoji-picker.test.tsx` 종료 코드 0, 테스트 9개 이상 통과 (현재 시험은 인라인 격자 기준이라 이 검사의 사전 상태는 **실패**다). 시험은 최소 이 아홉을 단언한다: (a) SFTP 편집 창에서 아이콘 칸을 클릭하면 이름이 "이모지 선택"인 팝업이 뜨고, 팝업은 칸을 감싼 편집 창 레이아웃의 자손이 아니라 `document.body`로 포털돼 렌더되며 `position: fixed`다 (b) 팝업 안에 이모지 버튼이 나온다(80개 이상은 요구하지 않는다 — 가상 목록은 보이는 만큼만 그린다) (c) 이모지를 고르면 칸의 값이 그 이모지가 되고 저장 후 `remote.servers[i].icon`에 들어간다 (d) 고르면 팝업이 닫히고 포커스가 아이콘 칸으로 돌아온다 (e) 팝업이 열린 채 `Esc` → 팝업만 닫히고 편집 창은 남으며, 한 번 더 `Esc`를 누르면 편집 창이 닫힌다 (f) 팝업 밖("표시 이름" 칸)을 누르면 닫힌다 (g) "지우기" → 칸이 비고 저장 후 `icon`이 비어 있다 (h) SMB 편집 창에서도 같은 팝업이 뜨고 고른 이모지가 `smb.servers[i].icon`에 저장된다 (i) 검색 칸에 한국어 낱말(UI 언어 ko 기준, 예: "정원" — 데이터상 🏡의 라벨이 "정원이 있는 집"이다)을 치면 목록이 그 낱말에 맞는 이모지(🏡)로 걸러지고 맞지 않는 것(😀)은 사라진다. 시험은 `fetch`를 가짜로 바꿔 `apps/desktop/public/emojibase/`의 실제 파일을 돌려주고, 팝업이 요청한 주소를 모아 **모두 `/emojibase/`로 시작하고 `http(s)://` 외부 주소가 하나도 없음**을 단언한다(오프라인 보장).
  2. 기존 `network-icons-tab-colors.test.tsx`가 수정 없이 통과한다 (회귀 가드: 지금도 통과한다 — 직접 입력해 마지막 자소만 남기는 동작).
  3. 저장소 루트에서 `bun run test` 종료 코드 0, desktop 통과 수가 1483 이상 (회귀 가드: 지금 1483 통과·1 skipped. 인라인 격자용 시험이 팝업 시험으로 바뀌어도 이 수 아래로 내려가지 않는다).
  4. `cd apps/desktop && bunx tsc --noEmit` 종료 코드 0 (회귀 가드).
  5. 범위: `git diff --name-only dce6ef7 -- crates apps/desktop/src-tauri packages/ts-client/src` 출력이 비어 있다(회귀 가드).
  6. 의존성·크기: `grep -c '"frimousse"' apps/desktop/package.json` = 1 이고, `git diff dce6ef7 -- apps/desktop/package.json`에서 `+`로 추가된 의존성 줄이 `frimousse` 하나뿐이며, `du -sk apps/desktop/public/emojibase | cut -f1` ≤ 3072 이다(앱에 넣는 이모지 데이터가 3MB 이하 — 전체 `emojibase-data` 52MB를 통째로 넣지 않는다). 사전 상태: 의존성 0·디렉터리 없음.
  7. 문서: `grep -c "이모지 선택 팝업" docs/07-ui-spec.md` ≥ 1, `grep -c "이모지 선택 팝업" README.md` ≥ 1, `grep -ci "emoji picker popup" README.en.md` ≥ 1, `grep -c "frimousse" THIRD_PARTY_NOTICES.md` ≥ 1 (사전 상태: 넷 다 0 — 현재 인라인 방식 문구는 "이모지 선택기"라서 이 정확한 문구에 걸리지 않는다). README 한·영은 한 쌍이라 함께 고친다.

## Work slices
- [ ] S1. `bun add frimousse`(`apps/desktop`)로 의존성을 추가하고, 이모지 데이터를 앱에 포함한다: `emojibase-data`는 설치하지 않고(52MB) 필요한 언어(`ko`, `en`)의 데이터·메시지 JSON만 `apps/desktop/public/emojibase/<locale>/`에 넣는다. 필요한 파일 이름과 경로 형식은 `frimousse`의 타입(`emojibaseUrl`, `EmojiDataResolver`)과 소스를 읽어 확인하고, 파일 출처·버전을 `apps/desktop/public/emojibase/README.md`에 한 줄로 적는다. 실제 크기를 재서 run.md에 적는다 — completion criterion: DoD 6
- [ ] S2. `Settings.tsx`의 `IconField`를 팝업으로 바꾼다: 칸 클릭·포커스로 열고, 칸 근처에 `position: fixed`로 `document.body`에 포털해 편집 창(`z-50`) 위에 그린다(화면이 늘어나거나 스크롤이 생기지 않는다). 선택기는 `frimousse`를 쓰고 `emojibaseUrl="/emojibase"`(또는 resolver)로 데이터를 앱에서 읽으며 로케일은 UI 언어(`ko`/`en`)를 따른다. 선택·"지우기"·`Esc`(편집 창으로 번지지 않게)·바깥 클릭·포커스 복귀·선택 직후 재오픈 방지(현재 구현의 `skipOpen`)를 유지한다. 두 사용처(SMB·원격)가 같은 컴포넌트를 쓴다. i18n 키 정리: 쓰지 않는 `emoji.group.*`은 지우고 검색 칸 이름 등 필요한 문구를 ko·en에 더한다. `lib/emojiList.ts`를 지운다 — completion criterion: DoD 1의 (a)(c)~(h)
  (depends: S1)
- [ ] S3. `icon-emoji-picker.test.tsx`를 DoD 1의 아홉 시험으로 다시 쓴다(`fetch` 가짜는 `/emojibase/`만 실제 파일로 돌려주고 요청 주소를 기록한다). `frimousse`의 가상 목록이 jsdom(레이아웃 없음)에서 안 그려지면 시험 쪽 `ResizeObserver`·크기 shim을 최소로 더한다 — 제품 코드를 시험에 맞춰 바꾸지 않는다 — completion criterion: DoD 1
  (depends: S2)
- [ ] S4. 문서: `docs/07-ui-spec.md`의 "연결 아이콘(이슈 #93)" 항목과 `README.md`·`README.en.md`(192행 근처)를 팝업·검색·오프라인 포함 데이터로 고친다. 오프라인 이모지 데이터 출처는 `THIRD_PARTY_NOTICES.md`에 `frimousse`(MIT)와 Emojibase 데이터 라이선스를 적는다 — completion criterion: DoD 7
