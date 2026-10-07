# RUN — 새 의존성과 번들 자산의 라이선스 고지를 채운다 (리뷰 M)

- S1 고지 추가 — ✅ `THIRD_PARTY_NOTICES.md`에 "미리보기·설정 화면에 더한 npm 라이브러리" 표(three·occt-import-js·mammoth·xlsx·jszip·dompurify·react-colorful)와 "Draco 디코더" 절을 추가

## DoD
1. `grep -ci`: three 2 · mammoth 1 · xlsx 1 · jszip 1 · react-colorful 1 · dompurify 1 · opencascade 1 · draco 2 (착수 전 일부 0)
2. 표의 버전·라이선스를 설치된 `node_modules/<패키지>/package.json`과 대조(실행 결과): three 0.186.1 MIT · mammoth 1.13.0 BSD-2-Clause · xlsx 0.20.3 Apache-2.0 · jszip 3.10.2 (MIT OR GPL-3.0-or-later) · react-colorful 5.8.1 MIT · dompurify 3.4.16 (MPL-2.0 OR Apache-2.0) · occt-import-js 0.0.23 LGPL-2.1 — 모두 일치
3. `public/draco/draco_decoder.wasm`이 `three/examples/jsm/libs/draco/gltf/draco_decoder.wasm`과 같은 파일임을 SHA-1로 확인(`11866a8962e6…`)

## 한계·메모
- Draco 디코더의 원 출처(Google Draco, Apache-2.0)는 `draco3d` 패키지의 저장소 표기와 three 번들 동일성으로 적었다. 이 저장소가 어디서 복사했는지의 기록은 커밋 메시지에도 없다.
- LGPL-2.1(OpenCascade wasm)의 재배포 의무(소스 제공·재링크 가능성)가 실제로 충족되는지는 판단하지 않았다. 출처와 라이선스 원문 위치만 적었다.
- 기존 표에 없던 `highlight.js`·`react-markdown`·`@tanstack/react-virtual` 등 v0.5.1 이전 의존성은 이번 범위가 아니어서 채우지 않았다.
