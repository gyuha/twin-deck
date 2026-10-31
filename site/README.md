# Twin Deck 소개 페이지

이 저장소의 GitHub Pages에서 제공하는 한국어·영어 제품 소개 페이지다. 별도 서비스나 앱 빌드 없이 HTML, CSS, JavaScript만 배포한다. 실제 화면 이미지는 `docs/screenshots/`에서 가져오므로 여기에는 중복 저장하지 않는다. 소개 페이지는 다크 테마 하나만 제공한다.

확정한 컨셉·기준 시안·레이어·모션·작업 재개 순서는 [사이트 디자인 문서](../docs/12-site-design.md)에, 색상·서체 등 현재 디자인 토큰은 [DESIGN.md](../DESIGN.md)에 정리한다.

## 로컬 확인

저장소 루트에서 실행한다(Node 22 이상).

```sh
node scripts/build-site.mjs
node scripts/check-site.mjs
node --test scripts/site-language.test.mjs
python3 -m http.server 4173 --directory dist/site
```

`http://localhost:4173`에서 확인한다. `site/`를 수정한 뒤 빌드를 다시 실행하고 새로고침한다. 산출물은 gitignored `dist/site/`다. 앱과 Rust 빌드는 필요하지 않다.

## GitHub Pages 설정

저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택한다. `.github/workflows/pages.yml`은 관련 파일이 `main`에 반영되면 페이지를 빌드·검사·배포한다. Actions에서 수동 실행도 가능하다. PR에서는 빌드와 검사만 한다. 앱 릴리스 워크플로와 독립적이며 앱 버전을 올리거나 릴리스를 공개하지 않는다.

배포 주소: <https://gyuha.com/twin-deck/>

공식 설정 안내: <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>

## 유지보수

- 기능 문구와 단축키는 `README.md`와 `docs/05-actions-keybindings.md`를 기준으로 맞춘다.
- 내려받기는 특정 버전의 파일명을 고정하지 않고 최신 GitHub 릴리스로 연결한다. macOS는 Apple Silicon, Windows는 x64임을 표시한다.
- 새 이미지를 쓰면 `scripts/build-site.mjs`의 허용 목록에 추가한다.
- 캐릭터는 `site/assets/courier.webp`(투명 배경), 도시는 `site/assets/night-city.webp`로 분리되어 있다. CSS에서 위치와 크기를 독립적으로 조정한다. 내려받기 영역에서도 같은 도시를 어둡게 재사용해 상단 분위기를 잇는다.
- 브랜드 로고는 기존 앱 아이콘 원본을 그대로 복사한다. 상단 제품 화면은 `docs/screenshots/main.png`이며 생성 이미지에 포함되지 않는다.
- 이미지 생성에는 내장 `image_gen`을 사용했다. 제작 지시는 각각 “선택한 나이트 쿠리어의 정체성·검은 재킷·주황색 스카프를 보존한 투명 캐릭터, UI·문자·배경 제외”, “동일한 검정·주황색의 야간 도시 배경, 우측 문구 공간과 하단 전환 여백 확보, 캐릭터·UI·문자 제외”다.
- 자체 이미지 로딩 후 GSAP 3.12.5와 ScrollTrigger 3.12.5를 cdnjs에서 지연 로드한다. 도시·쿠리어·제품·폴더를 스크롤 카메라로 연결하고 섹션 진입 안무를 더한다. 네이티브 스크롤을 유지하며 pin·휠 가로채기는 없다. CDN이 차단되면 CSS 기본 화면과 기존 상호작용을 유지한다.
- 테마 수는 처음 보일 때 2초 동안 0에서 112까지 카운트업한다. 처음에는 빠르고 끝으로 갈수록 느려진다. 모션 줄이기나 JavaScript 비활성화에서는 최종 숫자를 바로 표시한다.
- 상단 스크린샷 위의 폴더·빛의 궤적·화살표는 독립 SVG다. 폴더는 기존 CSS 모션 경로를 사용하며 GSAP 활성 시 스크롤에 연동된다. CDN 미사용 시 CSS 루프로 대체한다. 모션 줄이기에서는 네 폴더가 곡선 위에 정지하고 CDN을 요청하지 않는다. 비활성 탭에서는 GSAP ticker도 멈춘다.
- 사이트는 시스템 테마와 이전 화면 선택에 관계없이 다크 테마를 사용한다. OS의 모션 줄이기를 존중하고, 화면 밖이나 다른 탭에서는 캐릭터 모션을 멈춘다.
- 기능 탭은 방향키와 Home/End로 전환한다. 설치 명령 복사가 차단되면 직접 복사할 수 있도록 안내한다.
- JavaScript가 꺼져 있어도 기능 설명과 설치 링크는 읽을 수 있다.

검수할 화면: 데스크톱/모바일, 시스템 밝음/어두움에서 다크 유지, 모션 줄이기, JavaScript 비활성화. 단축키 설명 버튼, 기능 탭의 키보드 이동, 설치 명령 복사, 섹션 및 외부 링크를 확인한다.

## 검색·공유 메타 (SEO)

- `<head>`의 `title`·`description`·Open Graph·Twitter 카드·`hreflang`·`canonical`은 `site/index.html`에 한국어로 쓰고, 영어는 `site/english.json`의 번역으로 생성한다. 한국어 페이지는 `https://gyuha.com/twin-deck/`, 영어 페이지는 `https://gyuha.com/twin-deck/en.html`이 대표 주소이며, 두 페이지가 서로를 `hreflang`으로 가리킨다. `x-default`는 언어 자동 선택 주소(기본 주소)다.
- `og:locale`은 영어 페이지에서 `en_US`(대체 `ko_KR`)로 바뀐다. `title`은 60자 이하, `description`은 70~170자로 쓴다(`check-site.mjs`가 검사한다).
- 구조화 데이터(JSON-LD `SoftwareApplication`)는 `scripts/build-site.mjs`가 언어별로 만들어 넣는다. 확인되지 않은 가격·라이선스·버전은 넣지 않는다.
- `sitemap.xml`은 두 언어 주소와 `hreflang`을 담는다. 프로젝트 Pages 하위 경로에서는 `robots.txt`를 크롤러가 읽지 않으므로(도메인 루트만 읽는다) Google Search Console·Bing Webmaster Tools에 `https://gyuha.com/twin-deck/sitemap.xml`을 직접 제출한다.
- 공유 이미지(`og:image`)는 `main.png`(1800×710, 약 2.5:1)다. 소셜 카드의 권장 비율(약 1.91:1)과 달라 일부 서비스에서 좌우가 잘릴 수 있다.

## 소개 페이지 언어

기본 주소에서는 브라우저의 첫 번째 선호 언어가 `ko` 또는 `ko-*`이면 한국어, 나머지는 영어로 표시한다. 상단 `EN` / `한국어` 링크로 직접 고른 언어는 가능할 때 브라우저에 저장한다. 저장소 접근이 막혀도 URL의 `?lang=ko` / `?lang=en` 선택은 동작한다.

- 한국어 고정 주소: <https://gyuha.com/twin-deck/?lang=ko>
- 영어 고정 주소: <https://gyuha.com/twin-deck/en.html>
- 영어 HTML은 `site/index.html`과 `site/english.json`으로 빌드 시 생성한다. 한국어 문구를 추가·변경하면 대응 번역도 갱신해야 하며, 누락되면 빌드가 실패한다.
- 상호작용 중 표시되는 문구는 `site/main.js`의 양쪽 언어를 함께 갱신한다.
- 영어 페이지는 JavaScript 없이도 읽을 수 있다. 자동 언어 선택과 선택 기억에는 JavaScript가 필요하다.
- 영문 페이지는 영어 UI로 찍은 `docs/screenshots/en/`의 같은 이름 스크린샷을 쓴다(`assets/en/`로 배포). 한국어 스크린샷을 바꾸면 영문판도 같은 구도로 다시 찍는다.
  - 촬영 조건은 한국어판과 같다: `/tmp/td-demo` 데모 폴더, `catppuccin-mocha` 테마(테마 예시는 `dracula-default`), 명령줄과 업데이트 확인을 끔, 창 폭 1800에 개발 서버에서만 CSS `zoom: 2`, 높이는 이미지 높이와 같게 둔다. 화면 언어만 `behavior.language = "en"`으로 바꾼다.

## 방문 통계 (Google Analytics 4)

- `gyuha.com` 계정의 **Twin Deck** 전용 속성, **Twin Deck 웹사이트** 스트림을 사용한다. 측정 ID는 `G-6794E26N14`, 스트림 URL은 `https://gyuha.com/twin-deck/`다. 보고 시간대는 대한민국, 통화는 원화다.
- `site/analytics.js`를 한국어·영어 페이지에서 공통으로 불러온다. 공개 HTTPS 도메인의 `/twin-deck/` 경로에서만 태그를 로드하며 로컬 미리보기와 언어 자동 이동 전 페이지는 제외한다.
- GA의 향상된 측정으로 페이지 조회·스크롤·외부 링크 클릭 등을 측정한다. Google 신호와 광고 개인화는 비활성화하고, `twin_deck` 쿠키 접두사와 `/twin-deck/` 경로로 블로그와 쿠키를 분리한다.
- 측정 ID는 공개 태그 식별자이며 비밀키가 아니다. 별도 사용자 ID나 개인정보를 이벤트로 보내지 않는다. 현재 별도의 동의 배너는 없으며, 지역별 동의 요건에 맞춘 운영 정책은 별도로 관리해야 한다.
- 검증: `node --test scripts/site-language.test.mjs scripts/site-analytics.test.mjs && node scripts/build-site.mjs && node scripts/check-site.mjs`. 배포 후 GA의 태그 설치 테스트와 실시간 보고서에서 확인한다. 일반 보고서에는 반영 지연이 있을 수 있다.
