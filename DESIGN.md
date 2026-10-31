---
name: Twin Deck 소개 페이지
description: 어두운 도시의 나이트 쿠리어와 두 패널 사이의 주황색 파일 흐름.
colors:
  background: "#101012"
  surface: "#18181b"
  card: "#202023"
  text: "#f5f1ec"
  muted: "#b0aaa5"
  accent: "#ff794b"
  accent-hover: "#ff946c"
  line: "#38312f"
  trail-light: "#ffcd8d"
  folder-light: "#ffe7b8"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(58px, 6.1vw, 88px)"
    fontWeight: 800
    lineHeight: 1.13
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(40px, 6.2vw, 88px)"
    fontWeight: 760
    lineHeight: 1.12
    letterSpacing: "-0.045em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(26px, 2.6vw, 36px)"
    lineHeight: 1.28
    letterSpacing: "-0.035em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    lineHeight: 1.8
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "13px"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "14px"
rounded:
  key-small: "5px"
  tab: "6px"
  button: "7px"
  key: "8px"
  product: "10px"
  panel: "12px"
spacing:
  section: "132px"
  section-mobile: "72px"
  gutter: "48px"
  gutter-mobile: "20px"
  card-padding: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#1b100c"
    rounded: "{rounded.button}"
    padding: "15px 23px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "#121214b3"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "15px 23px"
  keycap:
    textColor: "{colors.text}"
    rounded: "{rounded.key}"
    width: "86px"
    height: "72px"
  keycap-active:
    textColor: "{colors.accent}"
  feature-card:
    backgroundColor: "#171719"
    rounded: "{rounded.panel}"
    padding: "{spacing.card-padding}"
  tab:
    textColor: "{colors.muted}"
    rounded: "{rounded.tab}"
    padding: "12px 22px"
  tab-selected:
    backgroundColor: "#ff794b10"
    textColor: "{colors.accent}"
---

# Design System: Twin Deck 소개 페이지

## Overview

**나이트 쿠리어**. 어두운 도시, 주황색 스카프의 캐릭터, 두 패널 사이의 빛나는 파일 흐름으로 키보드 중심 파일 관리를 표현한다. 사용자가 다섯 시안 중 3번을 선택했고, 기존 로고 유지·다크 전용·이미지 분리·실제 앱 화면 사용을 확정했다.

컨셉의 기준 시안과 구현 구조는 [docs/12-site-design.md](docs/12-site-design.md)에 있다. 이 파일은 현재 사이트의 토큰과 표현 원칙을 기록한다. 이전 파란색 쇼룸·라이트/다크 전환 디자인은 더 이상 기준이 아니다. 앱 내부 테마는 이 문서의 적용 대상이 아니다.

## Colors

`site/styles.css`의 `:root`가 구현 값의 출처다. 검정·차콜 면, 따뜻한 흰색 글자, 주황색 `#ff794b`를 페이지 전체에서 일관되게 쓴다. 하단은 같은 도시를 어둡게 재사용해 끝낸다. 배경의 낮은 채도 변화는 허용하지만 다른 강조색의 섹션으로 전환하지 않는다.

기존 브랜드 아이콘의 빨간색은 공식 이미지 그대로 보존한다. 아이콘을 CSS 색으로 다시 그리지 않는다. 실제 앱 스크린샷 내부의 테마색도 그대로 보존한다.

폴더 효과는 주황색에서 밝은 살구색·크림색으로 이어지는 빛을 쓴다. 사용자가 기준 이미지의 발광 효과를 명시적으로 요청한 경우이므로 이 레이어의 빛을 일반적인 장식 금지 규칙으로 제거하지 않는다.

## Typography

본문·제목은 운영체제의 한국어 시스템 산세리프를 사용한다. 키캡에는 `ui-monospace, SFMono-Regular, Consolas, monospace`를 사용하며 웹폰트를 새로 내려받지 않는다.

첫 화면 제목은 두 줄, 둘째 줄은 주황색이다. 본문은 보통 15–19px, 짧은 캡션·환경 표시는 최소 12px이다. 모바일에서도 작은 보조 정보를 12px 아래로 줄이지 않는다. 한글은 어절 단위로 줄을 바꾸고 영어에서도 제목·버튼이 넘치지 않게 한다.

테마 수는 숫자와 라벨을 별도 요소로 두고, `.theme-count`에 `tabular-nums`와 `min-width: 3ch`를 적용한다. 라벨용 작은 글자 스타일이 숫자에 상속되지 않게 한다.

## Layout

컨테이너는 최대 1280px, 기본 좌우 여백 48px, 모바일은 20px이다. 내비게이션은 데스크톱 76px, 모바일 64px이며 고정된다. 섹션 간격은 기본 132px, 모바일 72px이다. 상세 분기는 현재 미디어 쿼리를 따른다.

데스크톱 첫 화면은 왼쪽 캐릭터·아래 실제 앱 화면과 오른쪽 제목·다운로드로 구성한다. 모바일에서는 문구·다운로드를 앞에 두고 캐릭터·앱 화면을 아래로 연결한다. SVG는 제품 화면을 기준으로 함께 축소하되 다운로드·단축키를 덮지 않도록 검수한다.

기존 앵커·기능 설명·한영 전환·다운로드 흐름을 유지한다. 기능 카드의 12열 그리드는 모바일에서 1열로 접힌다. 갤러리의 앱 화면이 아래 테두리와 맞닿는 것은 의도한 진열 방식이며, 설명 텍스트는 충분한 안쪽 여백을 둔다.

## Elevation & Depth

어두운 면의 미세한 차이와 얇은 경계가 기본이다. 제품 화면은 중립적인 그림자로 떠 있는 느낌을 주고, 키캡은 단단한 하단 두께로 누르는 물체임을 드러낸다.

주황색 광원은 캐릭터·도시와 폴더 이동 궤적에 집중한다. 모든 카드·본문·버튼에 발광을 확장하지 않는다. 효과는 이미지에 굽지 않고 독립된 SVG로 유지한다.

## Shapes

패널은 12px, 앱 화면은 10px, 키캡은 8px, 버튼은 7px, 탭은 6px, 작은 키캡은 5px 반경을 사용한다. 네이티브 앱 스크린샷과 공식 로고의 형태는 자산 자체를 따른다.

## Components

- **브랜드:** 공식 빨간 앱 아이콘과 정자체 `Twin Deck`. 새 사선 심벌·이탤릭 워드마크·주황색 아이콘으로 교체하지 않는다.
- **이미지:** 배경·투명 캐릭터·기존 앱 스크린샷을 각각 분리한다. 작은 WebP는 같은 이미지의 축소본이다.
- **주 버튼:** 주황색 바탕과 짙은 글자. Windows 버튼은 어두운 면과 경계로 구분한다. 포커스는 주황색 2px, 오프셋 6px이다.
- **폴더 흐름:** 폴더 네 개, 주황색 빛의 곡선, 도착 화살표. CDN 미사용 상태에서는 6초 주기의 CSS 경로 모션이며 클릭·접근성 탐색을 방해하지 않는다.
- **테마 수:** 첫 진입 때 2초 동안 0 → 112, `1 - (1 - t)^3`으로 감속. 같은 페이지에서 반복하지 않는다.
- **캐릭터:** CDN 미사용 상태에서는 7초 주기의 작은 CSS 호흡 모션이다. 눈·스카프의 개별 애니메이션이 구현된 것으로 설명하지 않는다.
- **모션 대체:** 화면 밖과 비활성 탭에서는 반복 모션을 멈춘다. 모션 줄이기에서는 폴더·캐릭터는 정지하고 숫자는 최종값을 표시한다. JavaScript 없이도 내용·다운로드·최종 숫자를 읽을 수 있다.

## Do's and Don'ts

- 컨셉을 수정하기 전에 기준 문서·시안·현재 소스를 함께 확인한다.
- 실제 기능과 단축키·플랫폼 지원은 제품 문서를 따른다.
- 스크린샷의 두 패널과 가로세로 비율을 보존하고 새 공개 자산은 빌드 허용 목록에 등록한다.
- 모바일, 영어, 모션 줄이기, 키보드 조작, 가로 넘침을 검수한다.
- 시안에 그려진 가상 UI를 실제 제품 화면으로 사용하지 않는다.
- 라이트 전환·파란색 강조·새 로고를 되살리지 않는다.
- 임시 검수 캡처와 탈락 시안을 저장소에 계속 쌓지 않는다.

## 전달에서 작업대로: 스크롤 카메라

GSAP 3.12.5와 ScrollTrigger 3.12.5를 cdnjs에서 이미지 load 이후 idle 시점에 순차 로드한다. CDN 파일 원문 합계 115,594 bytes, 로컬 gzip 합계 45,807 bytes이며 요청은 2개다. 외부 미디어·폰트는 없다. 미디어 선반은 직접 확인했으나 야간 도시와 맞는 무인 영상이 없어 자체 배경·쿠리어·실제 제품 화면을 사용한다.

시그니처는 도시의 전달 장면이 정면의 작업 화면으로 바뀌는 카메라다. hero의 top top부터 장면 높이의 60% 동안 scrub .65초. 배경 y18%/scale1.12, 캐릭터 x-110px/y130px/회전-5deg/opacity.35, 제품은 회전-5deg·Y회전-9deg·scale.9에서 정면·scale1.12·y-80px로 바뀐다. 폴더는 기존 경로 위에서 시작 8+i×18% → 종료 38+i×18%로 이동한다. 궤적 폭은 제품의 62%, 왼쪽 4%로 제한해 Tab 안내를 피한다. 모바일은 인물 x-28px/y35px, 제품 y-12px/scale1.02, 3D 회전 없이 움직인다. pin과 추가 스크롤 길이는 없다.

섹션 제목은 최대 88px, 머리말은 1.35fr/.65fr 두 열로 제목과 설명을 나눈다. 제목/설명은 x-45/+45px에서 정렬, 기능 화면은 x80px에서 등장한다. 1.05초 power3.out, 화면 밖 완료/재진입 최종 상태 유지, 완료 후 inline transform/opacity 해제. 모바일은 x0/y28px. 보조 기능은 1px 경계의 작업 보드이며 카드가 좌우에서 정렬된다. 테마 숫자는 최대 280px/500, 화면은 폭92% 오른쪽 정렬, 회전3→0deg/scale.92→1을 scrub .7초로 연결한다.

정적 CSS는 항상 콘텐츠를 표시한다. CDN 두 파일이 성공한 뒤에만 cinema-ready로 중복 CSS 모션을 끈다. 실패하면 기존 CSS 장면과 모든 기능을 유지한다. 초기 모션 줄이기에서는 CDN을 요청하지 않고 동적으로 켜도 matchMedia의 context revert로 정지 상태를 복원한다. 비활성 탭에서는 GSAP ticker를 멈추며 기존 CSS의 화면 밖 중단도 유지한다. 링크·탭·복사·카운트업은 CDN과 독립적이다. 한영 문구를 추가하지 않아 번역 사전은 그대로다.

상세 실제 값과 검증 기록: [개선 스펙](docs/site/motionsites-upgrade.md).
