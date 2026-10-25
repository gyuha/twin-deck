# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

데스크톱 앱(Tauri 2 웹뷰, React 19)과 정적 소개 페이지(`site/`, GitHub Pages)가 이 기록을 공유한다. 두 표면의 방문자 모드는 다르므로(앱은 작업 수행, 소개 페이지는 설득) 표면별 방향은 각 표면의 브리프에서 정한다.

## Users

키보드 중심의 파워 유저. Marta·Total Commander류 듀얼 패널 파일 관리자에 익숙하거나 그런 흐름을 원하는 개발자와 숙련 사용자다. macOS(Apple Silicon)와 Windows(x64)에서 두 폴더를 나란히 놓고 파일을 옮기고, 미리 보고, 찾고, 정리하는 일상 작업을 한다. 마우스 없이 거의 모든 일을 끝내는 것이 이들의 기준이다.

## Product Purpose

두 개의 패널을 나란히 놓고 파일을 옮기고 정리하는 파일 관리자. 액션과 키바인딩으로 복사(`F5`), 이동(`F6`), 미리보기(`→`), 검색, 용량 분석, 탭 전환을 키보드만으로 수행하게 하는 것이 목적이다. 성공은 마우스 없이 탐색·선택·복사·이동·삭제·이름 변경을 끝낼 수 있고, 대용량 폴더에서도 UI가 멈추지 않는 것이다(수치 목표는 측정 전까지 가설).

## Positioning

Marta의 기능 기준을 따르되, macOS 전용인 Marta와 달리 macOS와 Windows에서 같은 경험을 낸다. 키보드 중심 듀얼 패널에 열기 전 미리보기(코드·Markdown·이미지·PDF·동영상·3D·HWP·epub·압축 파일), 용량 트리맵, 이름·내용 검색, 압축 파일을 폴더처럼 열기, 로컬과 SFTP·FTP·SMB 원격을 같은 두 패널로 다루는 점이 한 도구에 모여 있다. TOML 설정, 112가지 색 테마, 글꼴·단축키 설정으로 개인화한다.

## Operating Context

- 복사·이동은 백그라운드 작업 큐로 보내고 진행률·충돌 처리·중단을 제공한다.
- 터미널에서 `td 폴더`로 앱을 열고, 앱 안에 내장 터미널이 있다.
- 설치: macOS는 Homebrew tap(`brew install --cask gyuha/tap/twin-deck`) 또는 GitHub 릴리스 ZIP, Windows는 GitHub 릴리스 NSIS 설치 파일. 업데이트는 앱의 설정 화면에서 직접 확인한다.
- 앱은 Apple·Windows 인증서로 서명하지 않아 첫 실행에 OS 경고가 뜰 수 있다.
- 소개 페이지는 한국어·영어 두 벌이며 `https://gyuha.com/twin-deck/`에 GitHub Actions로 배포된다. 영어 페이지는 한국어 원문과 `site/english.json`이 짝이다.

## Capabilities and Constraints

- UI 문구, 문서, 주석, 테스트 이름은 한국어가 기본이고 영어를 병행한다.
- 지원 OS: macOS(Apple Silicon)와 Windows(x64) 설치 파일을 공개한다. Intel Mac과 Linux용 설치 파일은 없고, Linux는 소스 빌드만 가능하다(Windows·Linux 코드 경로는 macOS에서 컴파일 검증만 한다).
- SMB는 OS 마운트로, SFTP·FTP는 앱 내장 클라이언트로 연결한다. FTPS와 SSH 개인키 인증은 지원하지 않는다.
- 제외: Spacedrive의 VDFS 계열 기능(라이브러리·태그·동기화·P2P·클라우드·AI), 모바일 앱, Marta 설정 형식 호환.
- 소개 페이지는 JavaScript 없이도 기능 설명과 설치 링크를 읽을 수 있어야 하고, 밝은·어두운 화면과 OS의 모션 줄이기를 존중한다.
- 미결정: 서명·공증 도입 여부, Linux 설치 파일 제공 여부.

## Brand Commitments

이름은 "Twin Deck". 핵심 문구는 "두 개의 패널. 하나의 흐름."(영문 "Two panes. One flow." 계열)이다. 앱 아이콘은 `site/assets/icon.png`(붉은 계열 마크)를 쓴다. 소개 페이지는 Apple 제품 소개에서 영감을 얻은 정적 웹이라는 기존 방향이 있다. 이는 현 구현의 출발점으로 기록하며, 이후 시각 결정은 각 표면 작업에서 확인한다.

## Evidence on Hand

- 실제 앱 화면 캡처: `docs/screenshots/`(main, find, treemap, preview-code, preview-cbz, drag-copy, settings, theme-light, theme-dracula). 소개 페이지는 이를 그대로 쓴다.
- 제품 사양: `README.md`, `README.en.md`, `docs/00-overview.md` ~ `11-roadmap.md`, `docs/adr/`.
- 변경 이력: `CHANGELOG.md`, GitHub 릴리스.
- 없는 것: 고객 후기, 사용자 수, 벤치마크 수치(성능 수치는 측정 전 가설), 외부 언론 보도. 이를 지어내지 않는다.
- 주의: `docs/00-overview.md`의 "개인 및 사내 전용, 외부 배포 없음"은 낡았다. 실제로는 공개 배포로 바뀌었고(2026-10-25 사용자 확인) 해당 문서는 아직 갱신되지 않았다.

## Product Principles

1. 키보드가 기본 경로다. 마우스는 보조이며, 새 기능은 먼저 액션과 단축키로 설계한다.
2. 두 패널이 항상 보인다. 출발지와 목적지를 동시에 볼 수 있어야 하고, 작업이 이를 가리지 않는다.
3. 열기 전에 알게 한다. 미리보기, 검색, 용량 분석은 파일을 여는 비용을 줄이기 위해 있다.
4. 작업은 멈추지 않는다. 오래 걸리는 일은 백그라운드로 보내고 결과와 충돌은 명확히 알린다.
5. 소개 문구는 구현된 사실만 말한다. 눈으로 확인하지 못한 동작이나 아직 릴리스되지 않은 변경을 단정하지 않는다.

## Accessibility & Inclusion

소개 페이지는 키보드만으로 모든 상호작용(기능 탭의 방향키·Home/End 이동, 단축키 설명, 테마 선택, 설치 명령 복사)이 가능해야 하고, 한국어와 영어 사용자를 모두 지원한다. 앱의 키 조작 가능성은 제품 성공 기준 그 자체다. 특정 WCAG 등급 요구는 확정되지 않았다.
