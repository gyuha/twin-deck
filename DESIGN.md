---
name: Twin Deck 소개 페이지
description: 실제 앱 화면을 제품처럼 진열하는, 파랑 하나로 말하는 조용한 쇼룸.
colors:
  link-blue: "#0868ce"
  link-blue-deep: "#075bb5"
  link-blue-night: "#77b9ff"
  paper: "#f7f8fa"
  mist: "#eef0f3"
  white: "#ffffff"
  ink: "#202125"
  slate: "#666a72"
  hairline: "#d9dde3"
  night: "#111214"
  night-mist: "#1b1d20"
  night-card: "#24262a"
  night-ink: "#f4f5f7"
  night-slate: "#a4a8b0"
  night-hairline: "#373a40"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(58px, 7.3vw, 96px)"
    fontWeight: 760
    lineHeight: 1.12
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(36px, 5.1vw, 70px)"
    fontWeight: 730
    lineHeight: 1.2
    letterSpacing: "-0.04em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "clamp(25px, 2.6vw, 36px)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif"
    fontSize: "13px"
    fontWeight: 650
    letterSpacing: "-0.02em"
rounded:
  sm: "10px"
  md: "16px"
  card: "28px"
  pill: "100px"
spacing:
  section: "120px"
  section-tablet: "90px"
  section-mobile: "72px"
  gutter: "64px"
  card-padding: "44px"
components:
  button-primary:
    backgroundColor: "{colors.link-blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.link-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "18px"
    padding: "19px 24px"
  keycap:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    width: "94px"
    height: "88px"
  keycap-active:
    textColor: "{colors.link-blue}"
  feature-card:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  tab:
    textColor: "{colors.slate}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
---

# Design System: Twin Deck 소개 페이지

## Overview

**Creative North Star: "조용한 쇼룸"**

소개 페이지는 제품을 설명하기보다 진열한다. 실제 앱 화면이 가장 큰 오브젝트이고, 페이지의 나머지는 그 화면이 잘 보이도록 비켜 서 있다. 큰 여백, 크고 단단한 제목, 차가운 회백 면, 그리고 파랑 하나가 전부다. 장식 일러스트나 사진은 없다. 시선을 끄는 것은 항상 진짜 스크린샷과 키보드 키캡이다.

톤은 Apple 제품 소개에서 영감을 얻은 정적 전시장이다. 차분하고 단정하지만 차갑지 않다. 문장은 짧은 마침표 문장으로 끊고(예: "두 개의 패널. 하나의 흐름."), 제목의 마지막 구절만 색이나 명도를 낮춰 호흡을 만든다. 라이트와 다크 두 화면을 모두 일급으로 지원하며, OS 설정을 따르고 사용자가 직접 고를 수 있다.

기존 구현이 이 체계의 출처이며, 이 문서는 새 세계를 정하지 않고 현재 구현을 기록한다.

**Key Characteristics:**
- 강조색은 파랑 하나. 링크, 주 버튼, 활성 키캡, 제목의 마지막 구절에만 쓴다.
- 구분은 선이 아니라 면의 명도 차이(paper / mist / white)로 한다.
- 그림자는 제품 화면과 키캡에만 있다.
- 한 화면에 한 가지 일만 한다. 섹션당 제목 하나, 보조 문장 하나, 오브젝트 하나.
- 제품 화면은 실제 캡처만 쓴다. 가공한 목업을 쓰지 않는다.

## Colors

차가운 회백 바탕 위에 단 하나의 파랑. 파랑은 클릭할 수 있거나 지금 선택된 것을 뜻하고, 그 밖에는 쓰지 않는다.

### Primary
- **링크 블루** (#0868ce): 주 버튼 바탕, 텍스트 링크, 제목 강조 구절, 활성 키캡, "112" 숫자. 라이트 화면의 유일한 채도 있는 색.
- **링크 블루 딥** (#075bb5): 주 버튼 hover.
- **나이트 블루** (#77b9ff): 다크 화면에서 링크 블루를 대신하는 강조색(링크, 제목 강조 구절, 활성 키캡).

### Neutral (라이트)
- **페이퍼** (#f7f8fa): 페이지 바탕.
- **미스트** (#eef0f3): 교차 섹션 바탕, 기능 카드, 보조 버튼 면.
- **화이트** (#ffffff): 갤러리 면, 선택된 테마 칩, 키캡 상단.
- **잉크** (#202125): 본문·제목. 순수 검정을 쓰지 않는다.
- **슬레이트** (#666a72): 보조 문장, 캡션, 비활성 탭.
- **헤어라인** (#d9dde3): 1px 경계, 키캡 하단 두께.

### Neutral (다크)
- **나이트** (#111214), **나이트 미스트** (#1b1d20), **나이트 카드** (#24262a): 라이트의 paper / mist / white에 대응하는 세 면.
- **나이트 잉크** (#f4f5f7), **나이트 슬레이트** (#a4a8b0), **나이트 헤어라인** (#373a40).

### Named Rules
**The One Blue Rule.** 파랑 외의 채도 있는 색은 없다. 새 강조가 필요하면 색을 더하지 말고 크기, 굵기, 명도로 해결한다.

**The Surface Ladder Rule.** 깊이는 페이퍼 → 미스트 → 화이트(다크는 나이트 → 나이트 미스트 → 나이트 카드) 세 단계 면으로만 만든다. 면 위에 같은 단계의 면을 다시 얹지 않는다.

## Typography

**Display / Body Font:** 시스템 산세리프 — `-apple-system`, `BlinkMacSystemFont`, `Apple SD Gothic Neo`, `Noto Sans KR`, `Malgun Gothic`. 웹폰트를 내려받지 않는다.

**Character:** 플랫폼 본연의 글꼴로 앱과 같은 환경에 있다는 느낌을 준다. 개성은 서체가 아니라 크기 대비와 좁은 자간에서 나온다. 한글은 `word-break: keep-all`과 `text-wrap: balance`로 어절 단위로 끊는다.

### Hierarchy
- **Display** (760, clamp(58px, 7.3vw, 96px), 1.12, -0.045em): 첫 화면 제목 하나. 두 줄이며 둘째 줄은 파랑.
- **Headline** (730, clamp(36px, 5.1vw, 70px), 1.2, -0.04em): 섹션 제목. 두 문장으로 끊고 뒤 문장은 `슬레이트`로 낮추기도 한다.
- **Title** (700, clamp(25px, 2.6vw, 36px), 1.25, -0.03em): 카드와 갤러리 소제목.
- **Body** (400, 16–19px, 1.75): 섹션 보조 문장은 슬레이트. 짧은 줄로 끊는다.
- **Label** (650, 13px, -0.02em): 첫 화면 부제 등 작은 문구. 보조 정보는 13px을 바닥으로 한다.

### Named Rules
**The Tight But Legible Rule.** 자간은 -0.03em ~ -0.045em까지만. 한글 글자가 서로 닿으면 너무 좁은 것이다.

**The Thirteen Floor Rule.** 읽는 글자는 13px 아래로 내리지 않는다(모바일은 11px이 바닥이며 캡션류는 12px).

## Layout

폭 1120px 컨테이너(`min(1120px, 100% - 64px)`)를 중앙에 두고, 태블릿(≤1024px)은 좌우 24px, 모바일(≤767px)은 20px 여백이다. 섹션 세로 여백은 데스크톱 120px, 태블릿 90px, 모바일 72px로 넉넉하다. 한 섹션은 제목 블록 하나와 오브젝트 하나(키캡 + 화면, 갤러리, 카드 그리드, 테마 쇼케이스)로 구성한다. 섹션 바탕은 페이퍼와 미스트를 번갈아 써서 구분선 없이 리듬을 만든다.

기능 카드 그리드는 1.25fr : 1fr의 비대칭 2열이며 모바일에서 1열로 접힌다. 내비게이션은 66px 높이로 상단에 고정하고 모바일에서는 섹션 링크를 숨긴다.

## Elevation & Depth

면 대비가 기본이다. 카드와 섹션은 그림자 없이 색 면과 1px 헤어라인으로 분리한다. 그림자는 두 곳에만 있다: 앱 스크린샷(제품의 무게)과 키캡(누르는 물체의 두께).

### Shadow Vocabulary
- **제품 화면** (`box-shadow: 0 35px 65px -25px #19263840`, 다크 `0 35px 75px -25px #0009`): 스크린샷 아래에만. 큰 오프셋과 음의 퍼짐으로 바닥에 놓인 느낌.
- **키캡** (`0 6px 0 var(--line), 0 10px 18px #00000012, inset 0 1px 0 #ffffff40`): 키 하단 두께를 단단한 줄로 표현. 활성 상태는 4px 눌려 두께가 2px로 줄어든다.

### Named Rules
**The Showroom Light Rule.** 그림자는 제품 화면과 키캡의 것이다. 카드, 버튼, 텍스트에 그림자를 더하지 않는다.

## Shapes

둥근 사각형이 기본 언어이고 반경이 위계를 말한다. 큰 면(카드, 키 영역, 갤러리)은 28px, 키캡은 16px, 버튼과 탭은 알약(100px), 앱 스크린샷은 12–14px로 실제 창 모서리에 가깝게. 모바일에서는 큰 면을 22px로 줄인다. 헤어라인은 1px이며 색 있는 굵은 경계선은 쓰지 않는다. 히어로 뒤의 얇은 타원 궤도선은 유일한 순수 장식이며 매우 옅다.

## Components

### Buttons
- **Shape:** 알약(100px). 다운로드 선택 버튼만 18px 둥근 사각형.
- **Primary:** 링크 블루 바탕 + 흰 글자, 패딩 16px 24px, 굵기 600. 다운로드 버튼은 아래에 작은 부제(Apple Silicon / x64)를 둔다.
- **Hover / Focus:** hover는 3px 떠오르며 딥 블루로. 포커스는 3px 파랑 링(오프셋 6px).
- **Secondary:** 미스트 바탕 + 헤어라인 경계, hover에서 헤어라인 색으로.

### Keycap (signature)
- **Style:** 94×88px, 16px 반경, 흰색에서 미스트로 이어지는 옅은 대각선 면, 하단 6px 두께.
- **State:** hover는 4px 올라가고, 활성은 4px 눌리며 글자가 파랑, 안쪽 1px 파랑 테두리. `:active`는 더 깊이 눌린다. 라벨은 키 아래 13px.

### Cards / Containers
- **Corner Style:** 28px.
- **Background:** 미스트 면(페이퍼 섹션 위) 또는 페이퍼(미스트 섹션 위). 단일 카드 안에 카드를 넣지 않는다.
- **Shadow Strategy:** 없음.
- **Border:** 필요할 때만 1px 헤어라인.
- **Internal Padding:** 44px(태블릿 32px).

### Tabs
- **Style:** 알약. 비활성은 슬레이트 글자, 선택은 잉크 바탕 + 페이퍼 글자(다크에서 반전).
- **State:** 비활성 hover는 미스트 면 + 잉크 글자. 방향키와 Home/End로 이동.

### Navigation
- 66px 고정 헤더, 페이퍼를 84%(다크 88%) 투과해 흐림 처리(스크롤하는 콘텐츠 위에 떠 있기 때문). 링크는 13px 슬레이트, hover에서 잉크. 오른쪽에 언어 전환(EN), 테마 토글(SVG 아이콘), 작은 알약 다운로드 버튼. 모바일에서 섹션 링크는 숨김.

### Theme Showcase
- 앱의 두 테마(Catppuccin Latte, Dracula)를 스크린샷으로 전환해 보여 주는 칩 둘. 선택된 칩은 흰 면 + 헤어라인.

## Do's and Don'ts

### Do:
- **Do** 제품 화면은 `docs/screenshots/`의 실제 캡처를 쓴다.
- **Do** 새 섹션은 제목 블록 하나 + 오브젝트 하나로 만들고, 섹션 바탕은 페이퍼와 미스트를 번갈아 쓴다.
- **Do** 강조가 필요하면 파랑, 크기, 굵기, 명도 중에서 고른다.
- **Do** 모든 상호작용에 hover, 포커스, 눌림을 준다. 포커스 링은 3px 파랑.
- **Do** 전환은 지수형 ease-out(`cubic-bezier(0.16, 1, 0.3, 1)`)을 쓰고, OS의 모션 줄이기를 존중한다.
- **Do** 한국어를 먼저 쓰고 `site/english.json`에 짝 문구를 둔다.

### Don't:
- **Don't** 파랑 외의 강조색을 더하지 않는다. 그라디언트 글자도 쓰지 않는다.
- **Don't** 카드·버튼·텍스트에 그림자를 더하지 않는다(제품 화면과 키캡만).
- **Don't** 구현하지 않은 기능이나 확인하지 못한 동작을 화면·문구로 보여 주지 않는다.
- **Don't** 읽는 글자를 13px 아래로 내리지 않고, 제목 자간을 -0.045em보다 좁히지 않는다.
- **Don't** 카드 안에 카드를 넣거나 같은 크기 아이콘 카드 격자를 새 페이지 뼈대로 쓰지 않는다.
- **Don't** 유니코드 기호를 아이콘 대신 쓰지 않는다(새 아이콘은 SVG).
