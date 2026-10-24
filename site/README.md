# Twin Deck 소개 페이지

이 저장소의 GitHub Pages에서 제공하는 한국어·영어 제품 소개 페이지다. 별도 서비스나 앱 빌드 없이 HTML, CSS, JavaScript만 배포한다. 실제 화면 이미지는 `docs/screenshots/`에서 가져오므로 여기에는 중복 저장하지 않는다.

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
- CSS 스크롤 타임라인을 지원하지 않는 브라우저에서는 기본 화면과 등장 모션을 제공한다. 스크롤을 가로채지 않는다.
- OS의 모션 줄이기를 존중하며, 밝은 화면과 어두운 화면을 지원한다. 화면 전환 선택은 가능할 때만 브라우저에 저장한다.
- 기능 탭은 방향키와 Home/End로 전환한다. 설치 명령 복사가 차단되면 직접 복사할 수 있도록 안내한다.
- JavaScript가 꺼져 있어도 기능 설명과 설치 링크는 읽을 수 있다.

검수할 화면: 데스크톱/모바일, 밝음/어두움, 모션 줄이기, JavaScript 비활성화. 단축키 설명 버튼, 기능 탭의 키보드 이동, 앱 테마 선택, 설치 명령 복사, 섹션 및 외부 링크를 확인한다.

## 소개 페이지 언어

기본 주소에서는 브라우저의 첫 번째 선호 언어가 `ko` 또는 `ko-*`이면 한국어, 나머지는 영어로 표시한다. 상단 `EN` / `한국어` 링크로 직접 고른 언어는 가능할 때 브라우저에 저장한다. 저장소 접근이 막혀도 URL의 `?lang=ko` / `?lang=en` 선택은 동작한다.

- 한국어 고정 주소: <https://gyuha.com/twin-deck/?lang=ko>
- 영어 고정 주소: <https://gyuha.com/twin-deck/en.html>
- 영어 HTML은 `site/index.html`과 `site/english.json`으로 빌드 시 생성한다. 한국어 문구를 추가·변경하면 대응 번역도 갱신해야 하며, 누락되면 빌드가 실패한다.
- 상호작용 중 표시되는 문구는 `site/main.js`의 양쪽 언어를 함께 갱신한다.
- 영어 페이지는 JavaScript 없이도 읽을 수 있다. 자동 언어 선택과 선택 기억에는 JavaScript가 필요하다.
- 스크린샷은 기존 한국어 앱 화면을 공통 사용하며, 영어 안내에 이를 표시한다.
