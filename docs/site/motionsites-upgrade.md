# 나이트 쿠리어 · 전달에서 작업대로

## 0. 목표와 재평가
기존 제품 소개 페이지 전체를 개선한다. 대상은 폴더 사이를 반복 이동하는 키보드 사용자다. 분위기는 야간·깊이·추진력. 첫 개선은 번호 장식과 배치 조정에 머물렀다. 정적 화면 평가 8.2점과 별개로 이번 목표인 시그니처의 전달력은 6점으로 재평가한다. 이번 시작 점수는 첫인상/시그니처/서체/구성/색/미디어/모션/모바일/카피/마감 순서로 8/6/8/7/9/7/6/8/8/8 = 7.5다.

## 1. 시그니처와 참고 구조
하나의 카메라 동작으로 ‘도시의 쿠리어가 전달한 파일이 실제 작업대로 정렬되는 장면’을 만든다. 배경은 느리게 확대되고 인물은 왼쪽으로 물러나며 제품 화면은 기울기를 풀고 앞으로 나온다. 스크롤을 멈추면 카메라도 감속해 멈춘다. 고정 구간·휠 가로채기·스크롤 대체 라이브러리 없음. 기존 문구와 버튼이 언제나 읽히는 것이 연출보다 우선이다.

참고 예시는 어두운 다층 장면의 Aetheris Voyage와 Intelligence Layer를 전체 읽었다. 앞 예시의 매체/본문 층 분리와 1초 안무, 뒤 예시의 높이별 구도와 가장자리 암부를 채택한다. 서체·브랜드·문구·레이아웃을 복제하지 않는다. 기법은 scroll.md의 cinematic stage를 고정 구간 없이 축소 적용하고, viewport stagger와 counter-drift를 보조로 사용한다.

## 2. 파일과 의존성
기존 index.html / styles.css / main.js 유지. GSAP 3.12.5와 ScrollTrigger 3.12.5를 main.js가 window.load 후 idle 시점에 순차 로드한다.
- https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js — 72,214 bytes, 로컬 gzip 28,135 bytes
- https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js — 43,380 bytes, 로컬 gzip 17,672 bytes
원문 합계 115,594 bytes, 로컬 gzip 합계 45,807 bytes. 실제 전송 압축은 CDN 응답에 따라 다르다. 첫 화면 이미지보다 먼저 시작하는 요청은 0개, window.load 이후 추가 요청은 2개. 새 이미지·폰트·영상 요청 없음. 기존 main.js 증가분은 별도 검수 결과에 기록한다.

## 3. 미디어 선택
media/MEDIA.md와 sheet-1/2를 직접 확인했다. 1–48번 영상 중 가까운 26번은 인물과 흰 포털이며, 39번은 주황 포털/구름으로 도시와 다른 공간이다. 나머지는 자연·우주·추상색·인물 위주여서 야간 도시 정체성에 적합하지 않다. 선반의 외부 영상·컷아웃은 사용하지 않는다. 사용자가 가진 투명 courier.webp와 night-city.webp, 실제 main.png를 독립 레이어로 활용한다. 원본 비율과 영어 스크린샷은 유지한다.

## 4. 토큰과 기본 화면
배경 #101012, 본문 #f5f1ec, 보조 #b0aaa5, 선 #38312f, 주황 #ff794b. html/body의 첫 규칙에서 배경을 설정한다. 기존 빨간 공식 아이콘과 정자체 Twin Deck 유지. 시스템 산세리프, 키는 시스템 모노. H1 clamp(58px,6.1vw,88px)/800/1.13/-.055em. H2 clamp(40px,6.2vw,88px)/760/1.12/-.045em. 본문 16–19px/1.8, 캡션 최소 12px.

데스크톱 컨테이너 1280px, 좌우 48px. 장면 900px, 본문 우측 45%/위 40px, 제품 위 510px/폭 78%. 궤적은 제품의 왼쪽 4%/폭 62%로 제한해 Tab 안내를 피한다. 1600px 이상 제품 위 530px, 본문 위 60px. 높이 760px 이하는 장면 780px, 캐릭터 550px, 본문 위 16px, H1 64px, 제품 위 470px/폭 72%.

## 5. 카메라 타임라인
GSAP timeline은 hero top top부터 장면 높이의 60% 동안 scrub .65초, easing none. 총 연출 길이는 기존 장면 높이의 60%이며 추가 runway 없음. 시작 상태는 CSS 정적 화면과 거의 같고, 제품만 rotation -5deg/rotationY -9deg/scale .9로 들어온다.
- 배경: yPercent 0→18, scale 1→1.12. 도시의 암부와 하단 fade 유지.
- 캐릭터: x 0→-110px, y 0→130px, 회전 0→-5deg, opacity 1→.35.
- 본문: y 0→-90px. opacity를 줄이지 않아 링크를 계속 읽을 수 있다.
- 제품: 회전 0deg, rotationY 0deg, scale 1.12, y -80px로 정렬.
- 폴더 4개: 기존 SVG offset-path 사용. 시작 거리 8+i×18%, 종료 38+i×18%, opacity 1. CSS 무한 루프와 동시 실행하지 않는다.
모바일은 x -28px/y35px 캐릭터, 본문 -25px, 제품 y-12px/scale1.02, 3D 회전 없음. 스크린샷 비율 보존.

## 6. 아래 섹션
기본 간격은 132px, 모바일 72px. 섹션 머리말은 desktop 1.35fr/.65fr, 32px gap, 제목 왼쪽·설명 오른쪽 아래 정렬, 하단 64px. 모바일은 본래 문서 순서로 블록 표시.
- workflow: 실제 키 체험 유지. 체험판은 scale .94/y70px/opacity .65에서 1/0/1로 등장.
- features: 상하 경계의 진열대, 44px 탭과 주황 선택 밑줄. 갤러리는 x80px/y70px/opacity .65에서 정렬. 이미지는 좌우 28px.
- more: 1px 경계 작업 보드 유지. 각 카드가 홀짝 x -60/+60px에서 제자리로 이동. 섹션 상단 주황→차콜 선.
- personal: 숫자는 clamp(120px,21vw,280px)/500. 설명과 1:1 배치. 화면 폭 92%, 오른쪽 정렬. section top85%→center center 동안 회전3→0deg/scale.92→1, scrub .7초. 기존 카운트업 1회/2초/112 유지.
- download: 기존 도시를 재사용. 내부 scale .94/y70px에서 정렬. 복사·작은 다운로드 버튼 최소 44px.
머리말은 제목 x-45px/설명 x45px, y70px/opacity .65에서 1.05초 power3.out으로 제자리. 모바일 y28px/x0. 진입 top90%, 화면 밖에서는 즉시 완료해 중간 상태가 남지 않으며 재진입은 최종 상태. 종료 후 transform/opacity 인라인 값을 해제한다.

## 7. 점진적 향상과 정리
CSS는 항상 읽을 수 있는 기본 상태다. 두 CDN이 모두 성공한 후에만 cinema-ready를 추가해 겹치는 CSS 애니메이션을 끈다. 각 CDN 6초 timeout/error는 로더에서 처리하며 기존 기능에 전파하지 않는다. 초기 reduced-motion에서는 CDN 요청 자체가 없으며, 동적 설정 변경은 gsap.matchMedia가 context를 revert해 transform을 제거한다. 비활성 탭에서는 GSAP ticker.sleep, 돌아오면 wake/refresh. CSS의 hero 화면 밖 정지는 유지한다. pin 없음. 기존 파일 끝 덮어쓰기 블록은 제거하고 해당 원본 규칙·반응형 조건에 값을 합친다.

## 8. 검증 조건
build-site/check-site/site-language. shoot.py와 실제 스크롤 후 전체 화면을 모두 확인한다. 한영 1440×900/390×844/320×844, 짧은 1440×720, reduced-motion, JavaScript 없음, CDN abort 상태, 동적 reduced 전환, 탭 키보드/키 체험/복사/112 1회 실행. 결과는 /tmp/td-site-shots/cinema 아래. 이전 /tmp/td-site-shots/before와 같은 뷰포트로 비교한다. 실제 Safari/Windows 및 배포 화면 검수는 별도다.

## 9. 검수와 채점
원본 초기 점수 7.3. 첫 개선의 정적 평가 8.2는 이번 재작업에서 시그니처 기준을 강화해 7.5로 재평가했다. 최종: 9/9/8/8/9/9/9/8/8/8 = 8.5, 최저 8(자체 평가). 첫 촬영에서 화면 밖 카드의 중간 변형이 남는 점을 고쳐 onLeave 시 완료하게 했고, 제품이 보이는 동안 카메라가 정렬되도록 구간을 장면 60%로 압축했다. 최종 shoot.py는 오류·실패 요청·깨진 이미지·가로 넘침 없음. 중간 촬영의 자체 이미지 소켓 오류는 동시 검수 종료 후 단독 촬영에서 재현되지 않았다.

main.js 증가분은 원문 5,044 bytes, 로컬 gzip 차이 1,814 bytes다. 새로운 CDN 2개를 포함한 JS 원문 증가량은 120,638 bytes, 로컬 gzip 기준 증가량은 47,621 bytes다. 이는 전송 성능 실측이나 LCP 보장이 아니며 CDN 압축·네트워크에 따라 다르다. 초기 이미지 로딩 전에 추가 CDN 요청은 없으며, 코드상 window.load → idle → 순차 요청이다.

기본·CDN 차단·JS 비활성·모션 줄이기에서도 본문·두 다운로드와 다크 배경을 확인했다. 초기 모션 줄이기는 CDN 미로드, 실행 중 reduced 전환은 cinema-ready 제거·캐릭터 transform none으로 복원한다. 한영 1440/390/320px에서 카메라 값이 스크롤에 따라 달라지고 가로 넘침·JS 예외 없음. workflow F5 체험, 탭 End/Home/방향키, 모든 탭 이미지 decode, 설치 명령 복사, 최종 숫자 112 확인. 실제 Safari/WKWebView·Windows·공개 배포·저속망 LCP 수치는 미확인이다. 기존 앵커와 문구가 유지되어 english.json·scripts/ 변경은 없다.
추가 확인: 1440×720에서 제품과 단축키의 사각형 겹침 없음. ScrollTrigger만 차단한 부분 실패에서도 cinema-ready가 켜지지 않고 기본 화면 유지. 최종 검수에서는 CDN 차단의 예상 네트워크 실패와 앱 JS 예외를 구분했다.

CDN 버전과 SHA-384 SRI 해시는 함께 고정한다. 버전을 올릴 때 원본으로 해시를 다시 계산해 main.js의 integrity도 갱신한다. anonymous CORS와 no-referrer를 적용하며 무결성 오류는 기존 로더의 실패 대체 경로로 처리한다.
