# 앱 아이콘

원본은 `source/03-interlock-refined-v2.png`(1254×1254 RGB)다. 선택한 Library 최신 파일(`libfile_d2980a3a4938819182856a60f00ebc86`)의 바이트를 그대로 보존한다.

- 원본 SHA-256: `866dd86bc14d999965e1ea3be8998ae154767192583df90f5a7e2659b985076e`
- 빨강 바탕, 크림화이트 두 도형과 기존 곡선·질감·비율은 변경하지 않는다.
- 원본의 흰 모서리는 불투명 배경이다. 네 모서리와 연결된 저채도 바깥 배경에만 알파를 적용한다. RGB 값과 내부 크림화이트 도형은 유지한다.
- macOS는 1024×1024 투명 캔버스에 그림을 824×824로 놓는다(각 변 100픽셀 여백). Dock에서 다른 앱과 크기를 맞추기 위한 여백이며, 그림 자체를 다시 마스킹하거나 도형 간 비율을 바꾸지 않는다.
- Windows·일반 PNG에는 추가 여백을 넣지 않는다.

## 생성

macOS에서 기존 Bun 의존성과 Xcode Command Line Tools의 Swift를 사용한다. 새 패키지 설치는 필요 없다.

```sh
task icons
# 또는 저장소 루트에서
swift scripts/generate-icons.swift
```

전처리는 AppKit으로 알파·캔버스만 준비하고, 리사이즈·ICNS·ICO 생성은 설치된 Tauri CLI(`tauri icon`)가 담당한다. 임시 모바일 아이콘은 프로젝트에 복사하지 않는다.

| 파일 | 용도·크기 |
|---|---|
| `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` | 일반 데스크톱 PNG(32·64·128·256) |
| `icon.ico` | Windows, 16·24·32·48·64·256 |
| `Square*Logo.png`, `StoreLogo.png` | 기존 Windows 자산, 이름에 표시된 크기 및 StoreLogo 50 |
| `icon.icns` | macOS 번들, 16·32·64·128·256·512·1024 |
| `icon.png` | 실행 중 macOS Dock 아이콘, 512×512(동일 여백) |

`tauri.conf.json`의 `bundle.icon`은 PNG·ICNS·ICO를 가리킨다. `src/main.rs::set_dock_icon()`은 이 디렉터리의 `icon.png`를 포함하므로 개발 실행과 번들 실행에도 같은 아이콘이 적용된다. 별도 트레이 아이콘은 없다. 저장소 루트의 이전 원본 `icon.png`는 이 원본 경로로 대체했다.
