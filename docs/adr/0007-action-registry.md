# ADR-0007. 단일 액션 레지스트리

- 상태: Accepted
- 날짜: 2026-09-29

## 맥락

Marta의 모든 동작은 액션이며, 키 바인딩, Action Bar, Actions Panel(Cmd+Shift+P), Lua 플러그인이 같은 액션 ID로 실행한다. 액션은 컨텍스트에 따라 활성/비활성이 갈린다. Spacedrive는 스코프를 가진 키바인드 레지스트리(`defineKeybind`)를 갖고 있으나 액션이라는 상위 개념은 없다.

## 결정

`@twin-deck/actions`에 단일 레지스트리를 둔다. 액션은 `id`, `title`, `category`, `args`, `isApplicable`, `run`, `scopes`, `defaultKeys`를 갖는다. 모든 실행 경로(키, 버튼, 패널, Gadget, 플러그인)가 `runAction(id, args, context)`를 지난다. 키 입력 처리는 Spacedrive의 키바인드 레지스트리를 이식해 스코프 스택으로 동작시킨다.

## 결과

- 장점: 키 재정의, 버튼 추가, 플러그인 확장이 실행 로직을 건드리지 않는다. 플러그인 API의 원형이 된다.
- 단점: 모든 기능을 액션 형태로 정의해야 하므로 초기 작업이 늘어난다.
- 후속: 액션 카탈로그 확정([05](../05-actions-keybindings.md)), Marta 액션 ID 대조.

## 검토한 대안

| 대안 | 기각 이유 |
|---|---|
| 컴포넌트별 키 핸들러 | 사용자 키 재정의, Actions Panel, 플러그인 지원이 어려움 |
