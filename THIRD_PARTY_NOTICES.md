# Third-party notices

twin-deck는 Spacedrive 소스를 이식하지 않고 자체 구현한다 (docs/04-spacedrive-reuse.md, 2026-09-29 결정: `sd-fs-watcher`, `sd-task-system`, `keybinds`는 자체 구현).
따라서 현재 저장소에는 Spacedrive에서 가져온 파일이 없다. 이식이 생기면 파일 헤더와 이 문서에 출처와 라이선스를 추가한다 (ADR-0009).

의존 라이브러리(crates.io, npm)의 라이선스는 각 패키지의 매니페스트를 따른다.

## 아카이브 처리에 추가한 의존 라이브러리 (M3)

crates.io에서 받아 쓰는 permissive 라이선스 라이브러리이며 코드를 복사해 온 것은 없다.

| crate | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| zip | 8.6.0 | MIT | ZIP 읽기/쓰기 |
| tar | 0.4.46 | MIT OR Apache-2.0 | tar 읽기 |
| flate2 | 1.1.10 | MIT OR Apache-2.0 | gzip 해제 |
| bzip2 | 0.6.1 | MIT OR Apache-2.0 | bzip2 해제 |
| unicode-normalization | 0.1.25 | MIT OR Apache-2.0 | 한글 NFC/NFD 정규화 |

2026-09-30 기준으로 M3에서 새로 들어온 외부 crate는 위 표가 전부다. 이후에 만든 `td-search`(Look Up, Flatten, Disk Usage)와 압축·추출·편집 세션은 이 crate들과 표준 라이브러리만 쓰고 별도 의존을 더하지 않았다. 테스트는 시스템 `unzip`, `zip`, `tar`(macOS 기본 도구)를 실행해 교차 검증하지만 그 코드를 포함하거나 배포하지 않는다.

## 파일 아이콘 (Material Icon Theme)

`packages/material-icons/`에 [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)의 SVG 아이콘과 매핑 매니페스트를 복사해 두었다. 파일 목록의 형식별 아이콘에 쓴다. 파일은 수정하지 않았고, 복사 범위와 갱신 방법은 `packages/material-icons/ORIGIN.md`에 있다.

| 항목 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| material-icon-theme (SVG 1,199개 + `manifest.json`) | 5.38.1 | MIT | `packages/material-icons/` (라이선스 원문: `LICENSE`) |

## 디자인 토큰 (spaceui)

앱의 색·테마·글자 크기 체계와 설정 화면의 컨트롤은 Spacedrive의 디자인 시스템 저장소 [spaceui](https://github.com/spacedriveapp/spaceui)가 npm에 게시한 토큰 패키지를 의존성으로 쓴다. 코드를 복사하지 않았다. Spacedrive 본 저장소(`spacedriveapp/spacedrive`)에서는 아무것도 가져오지 않았다.

| npm 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| @spacedrive/primitives | 0.2.4 | MIT (spaceui 저장소 표기. 패키지 매니페스트에는 license 필드가 없다) | 설정 화면의 Switch, Select, Input, Button (radix 기반) |
| @spacedrive/tokens | 0.2.3 | MIT (spaceui 저장소 표기, 2026-10-01 GitHub API로 확인. 패키지 매니페스트에는 license 필드가 없다) | 색 토큰, 테마 7종(dark, light, midnight, noir, slate, nord, mocha), 글자 크기 체계 |

## 미리보기·설정 화면에 더한 npm 라이브러리 (v0.5.1 이후)

3D 모델·Office 문서 미리보기와 글자색 설정 화면을 위해 `apps/desktop/package.json`에 더한 npm 패키지다. 코드를 복사해 온 것은 없고, 버전과 라이선스는 설치된 각 패키지의 `package.json`(`license` 필드)에서 읽었다. 라이선스 호환성에 대한 법률 판단이 아니라 출처 기록이다.

| npm 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| three | 0.186.1 | MIT | 3D 모델 미리보기(렌더러와 STL·OBJ·PLY·FBX·glTF·3MF·USDZ·GCode 로더) |
| occt-import-js | 0.0.23 | LGPL-2.1 | STEP·IGES 읽기. 안에 든 OpenCascade(Open CASCADE Technology) 컴파일 결과(`occt-import-js.wasm`)를 수정 없이 별도 wasm 파일로 불러온다. 라이선스 원문은 패키지의 `dist/license.occt.txt`·`dist/license.occt-import-js.txt`, 소스는 https://github.com/kovacsv/occt-import-js |
| mammoth | 1.13.0 | BSD-2-Clause | docx 미리보기(HTML 변환) |
| xlsx (SheetJS) | 0.20.3 | Apache-2.0 | xlsx 미리보기. npm이 아니라 SheetJS CDN 타르볼(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`)에서 받는다 |
| jszip | 3.10.2 | MIT OR GPL-3.0-or-later | pptx 미리보기(압축 해제) |
| dompurify | 3.4.16 | MPL-2.0 OR Apache-2.0 | docx 미리보기 HTML 정화 |
| react-colorful | 5.8.1 | MIT | 설정 화면의 글자색 색상환 |

### Draco 디코더 (번들 자산)

`apps/desktop/public/draco/`의 `draco_decoder.js`·`draco_decoder.wasm`·`draco_wasm_wrapper.js`는 Draco 압축 glTF를 읽는 디코더로, Google Draco(https://github.com/google/draco, Apache-2.0)의 빌드 결과다. 이 저장소에서 `draco_decoder.wasm`을 설치된 `three/examples/jsm/libs/draco/gltf/draco_decoder.wasm`과 비교했고 같은 파일이다(SHA-1 앞 12자리 `11866a8962e6`). 수정하지 않았다. 테스트가 쓰는 npm 패키지 `draco3d`(1.5.7, Apache-2.0)와는 별개다.
