<!-- forge-slug: drive-bar-single-row -->
<!-- task: 85 -->
<!-- tdd: on -->
# 드라이브 바를 한 줄로 줄이고 남은 용량·언마운트를 볼륨 버튼 줄 오른쪽 끝에 둔다

## Goal / Non-goals
- Goal: 드라이브 바(`DriveBar.tsx`)의 둘째 줄(현재 볼륨 이름 + `N GB 남음` + `⏏ 언마운트`)을 없애고, 그 내용 중 **남은 용량과 언마운트 버튼을 첫째 줄(볼륨 버튼 줄)의 오른쪽 끝**으로 옮긴다. 언마운트 버튼은 지금처럼 현재 볼륨이 루트가 아닐 때만 나온다. 볼륨 이름 글자는 지운다(지금 있는 볼륨은 볼륨 버튼에서 이미 강조된다). 용량에 마우스를 올리면 전체 용량이 툴팁으로 보이는 것과, 용량을 알 수 없으면(검색 결과 같은 가상 탭, 읽기 실패) 용량을 표시하지 않는 것은 그대로다. 볼륨 버튼이 많아 줄이 넘치면 오른쪽 블록은 다음 줄로 내려가도 오른쪽에 붙는다.
- 요청 경위: 이슈 #22와 별개로, 사용자가 "용량 줄이 의미 없어 보인다"며 지우고 상태 줄 오른쪽 끝에 용량을 두자고 했다가, 줄을 잘못 봤다고 정정해 "드라이브 선택 줄 오른쪽 끝에 남은 용량과 언마운트 버튼"으로 확정했다. **상태 줄(`App.tsx`)은 바꾸지 않는다.**
- Non-goals: 하단 상태 줄 변경, 드라이브 바 전체 삭제, 볼륨이 하나뿐일 때 첫째 줄을 자동으로 숨기기, `Drive Bar` 토글·설정(`show_drive_bar`)·`core.view.drive_bar` 액션·키(`Mod+Shift+D`) 변경, 볼륨 메뉴(`Alt+1`)의 `U`/`E` 키 변경, 용량 표기 형식(`display.size_format`) 변경.

## Source of truth
- Glossary terms: none
- Related ADRs: none
- 이슈 추적: 없음(사용자 직접 요청)
- 사전 확인(작성 시점): `DriveBar.tsx`는 두 `div`로 이루어진다. 첫째 줄은 `role="toolbar"`(`드라이브 (왼쪽/오른쪽 패널)`)에 볼륨 버튼들이고, 둘째 줄은 `role="group"`(`현재 볼륨 (…)`)에 이름·용량·언마운트가 있다. 기존 `drive-bar.test.tsx`(12건)는 이 그룹 안에서 용량(`73.8 GB 남음`, 툴팁 `전체 500.0 GB`)과 `언마운트` 버튼을 찾으므로, 오른쪽 끝 블록에 같은 그룹 이름을 그대로 두면 대부분 수정 없이 통과한다. `grep -c "{current?.name" DriveBar.tsx`는 1.
- Definition of Done (착수 전 기준선: `drive-bar.test.tsx` 12건 통과, `tsc` 0, vitest(pdf-preview 제외) 798건 통과 + `model-formats.test.ts` 1파일은 jsdom에 canvas가 없어 로드 실패하는 기준선 잡음):
  1. `cd apps/desktop && bunx vitest run src/__tests__/drive-bar.test.tsx` 통과, 새로 추가한 `it(`가 4개 이상(기존 12 + 새 ≥4). 값으로 단언한다: (a) 남은 용량 글자(`73.8 GB 남음`)가 **드라이브 툴바 안**에 있다 (red), (b) "현재 볼륨" 그룹의 글자는 용량뿐이고 볼륨 이름이 없다(`textContent`가 `73.8 GB 남음`) (red), (c) 드라이브 바가 한 줄이다: 툴바의 부모 안에 자식이 툴바 하나뿐이다 (red), (d) 루트가 아닌 볼륨(`USB`)이 현재일 때 `⏏ 언마운트` 버튼이 툴바 안의 **마지막 버튼**이고 오른쪽 블록(`ml-auto`)에 있다 (red), (e) 루트가 현재일 때는 언마운트가 없다(회귀 방지, 사전 통과), (f) 용량을 알 수 없으면 용량 글자가 없고 오류도 없다(회귀 방지, 사전 통과). (a)~(d)는 구현 전에 실패(red)해야 한다.
  2. 기존 12건이 의미 변경 없이 통과한다(필요하면 단언 위치만 새 구조에 맞게 고치되 기대 값은 그대로).
  3. `grep -c "{current?.name" apps/desktop/src/ui/DriveBar.tsx` → 0 (착수 전 1).
  4. 회귀 방지(사전 통과가 정상): `cd apps/desktop && bunx tsc --noEmit` 통과, `bunx vitest run --exclude '**/pdf-preview*'`에서 새로 실패하는 파일이 없다(`model-formats.test.ts`는 기준선 잡음).
  5. `DriveBar.tsx`의 위 설명 주석을 새 구조("한 줄: 볼륨 버튼 + 오른쪽 끝에 남은 용량·언마운트")로 고친다 — `grep -c "아랫줄" apps/desktop/src/ui/DriveBar.tsx` → 0 (착수 전 1).

## Work slices
- [ ] S1. 먼저 실패하는 테스트: `drive-bar.test.tsx`에 (a)~(f)를 추가하고 red를 기록한다 — completion criterion: DoD 1의 red 상태((a)~(d) 실패, (e)(f) 통과)
- [ ] S2. `DriveBar.tsx`를 한 줄로 바꾼다: 둘째 줄 `div`를 없애고, 툴바 안에서 볼륨 버튼 뒤에 오른쪽 끝 블록(`ml-auto`, 같은 그룹 이름 `현재 볼륨 (…)`)으로 용량과 언마운트를 둔다. 볼륨 이름 글자는 지우고 주석을 고친다 — completion criterion: DoD 1 green, DoD 2, 3, 5 (depends: S1)
