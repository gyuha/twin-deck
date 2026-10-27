<!-- forge-slug: tab-close-overflow-143 -->
<!-- task: 208 -->
<!-- tdd: off -->
<!-- playbook: bug-fix -->
<!-- eval: S2 -->
# 닫기 버튼을 켠 탭에 긴 폴더 이름이 오면 패널이 창보다 넓어지는 문제를 고친다 (이슈 #143)

## 목표 / 하지 않을 것
- 목표: `tab_close_button = true`일 때 긴 탭 이름이 패널의 최소 너비를 키워 두 패널(과 창 전체 내용)이 창보다 넓어지는 문제를 없앤다. 탭 이름은 닫기 버튼이 꺼져 있을 때처럼 말줄임으로 줄어든다.
- 하지 않을 것: 탭 디자인 변경, 경로 줄(Breadcrumb) 변경, push·PR·이슈 댓글.

## 근거
- 용어: 없음
- 관련 ADR: 없음
- 원인(추론): 닫기 버튼이 켜지면 탭이 `relative flex min-w-24 flex-1` 래퍼(`apps/desktop/src/ui/TabBar.tsx:232`)로 감싸진다. 이 래퍼는 넘침을 잘라 내지 않아 탭 이름 전체 길이가 최소 너비로 올라가고, `PaneSplit`의 바깥 박스(`flex min-h-0 flex-1`, `min-w-0` 없음)가 그만큼 넓어진다. 닫기 버튼이 없을 때의 탭 버튼은 `truncate`라 문제가 없다(측정: 격리 인스턴스, `tab_close_button = false`에서 넘치지 않음).
- 완료 정의(DoD):
  1. loop.md C1 — 수정 뒤 격리 인스턴스 캡처에서 넘치지 않는다(수정 전에는 넘침: `/tmp/td-iso143/close.png`).
  2. loop.md C2 — 밑줄형+닫기 버튼, 칸형+닫기 버튼 끔도 넘치지 않는다.
  3. S2의 회귀 테스트가 수정 전 코드에서는 실패하고 수정 뒤 통과한다(red → green).
  4. `cd apps/desktop && bunx vitest run` 전체 통과, `bunx tsc --noEmit` 통과.

## 작업 쪼개기
- [ ] S1. 닫기 버튼 래퍼가 탭 이름 길이만큼 넓어지지 않게 한다. 우선 래퍼(칸형·밑줄형 공통 부분 포함)에 넘침 잘라 내기를 더해 원인 자리에서 막고, 그것만으로 C1이 통과하지 않으면 `PaneSplit` 바깥 박스에 `min-w-0`를 더한다. 닫기 버튼(✕)이 가려지지 않는지 함께 본다. — 완료 기준: DoD 1, 2
- [ ] S2. `apps/desktop/src/__tests__/`에 회귀 테스트를 더한다: `tab_close_button = true` 칸형 탭의 래퍼가 넘침을 잘라 내는 클래스를 가진다(S1에서 실제로 쓴 수정에 맞춘다). — 완료 기준: DoD 3 (depends: S1)
- [ ] S3. 전체 vitest와 tsc를 돌린다. — 완료 기준: DoD 4 (depends: S2)
