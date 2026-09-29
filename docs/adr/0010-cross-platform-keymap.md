# ADR-0010. 크로스플랫폼 키 매핑

- 상태: Accepted
- 날짜: 2026-09-29

## 맥락

Marta의 기본 키는 macOS의 Cmd/Opt 체계를 전제한다(예: Cmd+G, Opt+1, Cmd+Shift+P). twin-deck은 macOS, Windows, Linux를 지원한다. Cmd 키는 Windows/Linux에 없고, `Alt+F4`, `Alt+Tab`, `Ctrl+W`, `F11` 등 일부 조합은 OS/웹뷰가 선점한다.

## 결정

설정의 키 표기를 OS 중립으로 한다: `Mod`(macOS Cmd, 그 외 Ctrl), `Alt`(macOS Opt), `Shift`, `Ctrl`(실제 Control). 기본 키맵은 macOS에서 Marta의 값을 따르고, Windows/Linux는 `Mod→Ctrl`, `Alt→Alt`로 변환한 뒤 관례가 다른 항목(숨김 파일 `Ctrl+H`, 탭 이동 `Ctrl+PageUp/PageDown` 등)만 예외로 둔다. OS별 재정의는 `[keybindings.<os>]` 섹션으로 한다. OS 예약 조합은 기본 키맵에서 피한다.

## 결과

- 장점: 사용자가 한 설정 파일로 3개 OS를 관리할 수 있다. Marta의 F키 중심 키맵(F5~F8 등)은 OS와 무관하게 그대로 쓴다.
- 단점: `Alt+숫자`, `Ctrl+Alt+P` 등 일부 조합이 Windows/Linux 데스크톱 환경과 충돌할 수 있어 실측이 필요하다. macOS 노트북의 F키는 `fn`이 필요하다.
- 후속: M0/M1에서 웹뷰의 키 수신 실험 표를 만들고 충돌 항목을 조정한다.

## 검토한 대안

| 대안 | 기각 이유 |
|---|---|
| OS별로 완전히 다른 키맵 | 문서와 설정 관리 부담이 크고 사용자 혼란 |
| macOS 키를 그대로(Cmd를 Win 키에 대응) | Windows/Linux에서 Super 키는 OS가 선점 |
