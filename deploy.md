# 배포

Twin Deck의 새 버전을 만들어 GitHub 릴리스에 올리는 방법입니다. 앱을 만드는 사람을 위한 문서이고, 사용하는 사람은 [README](README.md)만 보면 됩니다.

배포 파일은 OS마다 그 OS에서 만듭니다(macOS는 macOS에서, Windows는 Windows에서). 두 OS의 파일을 한 비공개 초안에 모은 뒤, 둘 다 있을 때 공개합니다. 공개하면 태그가 만들어지고 Homebrew tap도 새 버전으로 바뀝니다.

## 배포 순서

1. 버전을 정하고 `CHANGELOG.md`에 그 버전의 항목을 씁니다. 같은 커밋에서 `apps/desktop/src-tauri/tauri.conf.json`과 `apps/desktop/src-tauri/Cargo.toml`(와 `Cargo.lock`)의 `version`을 올리고 push합니다. 변경 사항을 쓰는 방법은 [AGENTS.md](AGENTS.md)의 "릴리스 노트(변경 사항 기록)"에 있습니다.
2. 각 OS에서 `task release:draft`를 실행합니다. 번들을 만들어 비공개 초안 릴리스에 올립니다. 공개하지 않고 태그도 만들지 않습니다.
3. 초안에 macOS용과 Windows용 파일이 모두 올라온 뒤 `task release`를 실행합니다. 초안을 공개하고(태그 생성) Homebrew tap의 Cask를 새 버전으로 갱신합니다. 한쪽 OS 파일만 있으면 공개하지 않고 멈춥니다.

```
CHANGELOG 쓰기 + 버전 올리기 → push → 각 OS에서 task release:draft → task release → 공개 + tap 갱신
                                                        ↓ macOS·Windows 파일 중 하나라도 없으면
                                                   공개하지 않고 종료 (코드 3)
```

공개는 되돌릴 수 없습니다. 공개 흐름의 전체 단계와 실패했을 때 다시 하는 방법은 [AGENTS.md](AGENTS.md)의 "릴리스 공개 흐름"에 있습니다.

## 명령

```sh
task release:draft  # 드래프트 배포: 이 OS의 파일을 비공개 초안에 올린다(공개·태그 없음. gh 로그인 필요)
task release        # 배포: 이 OS의 파일을 올리고 공개한다(macOS·Windows 파일이 모두 있을 때만, 태그가 만들어진다)
```

## 앱 안 업데이트와 서명 키

앱의 "업데이트 확인"(설정 화면 위쪽 버튼, 또는 `Mod+Shift+P`로 연 액션 패널에서 "업데이트")은 GitHub 최신 릴리스의 `latest.json`을 읽어 새 버전이면 설치합니다. 자동으로 확인하지는 않습니다.

- 업데이트 파일은 서명 키로 서명합니다. 키는 한 번 만들어 두세요: `bunx tauri signer generate -w ~/.tauri/twin-deck.key`. 출력되는 **공개 키**는 `apps/desktop/src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 들어 있습니다(키를 새로 만들면 이 값도 바꿔야 합니다). **비밀 키와 비밀번호는 저장소에 넣지 마세요.** 비밀 키를 잃으면 이미 설치된 앱은 새 업데이트를 받지 못합니다.
- 배포 전에 `CHANGELOG.md`에 그 버전의 변경 사항을 적어야 합니다(없으면 `task release:draft`·`task release`가 빌드 전에 멈춥니다). 적은 내용은 GitHub 릴리스 본문과 앱의 "업데이트 확인" 창에 그대로 나옵니다.
- `task release`로 공개하면 자체 Homebrew tap([gyuha/homebrew-tap](https://github.com/gyuha/homebrew-tap))의 Cask도 새 버전으로 갱신됩니다(`scripts/update-tap.mjs`가 공개 ZIP의 sha256을 GitHub 값과 대조한 뒤 push). 공개는 됐는데 tap 갱신만 실패했다면 `node scripts/update-tap.mjs <버전>`으로 다시 실행하세요(이미 반영돼 있으면 아무것도 바꾸지 않습니다). 흐름은 AGENTS.md의 "릴리스 공개 흐름"에 있습니다.
- `task release:draft` / `task release`는 `TAURI_SIGNING_PRIVATE_KEY` 환경변수(키 파일 경로 또는 내용. 비밀번호가 있으면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)의 키로 업데이트용 파일과 `.sig`를 만들어 함께 올리고, 올라온 `latest.json`에 이 OS의 항목을 합칩니다. 평소의 `task bundle`·`task install`은 키 없이 됩니다.
- 한쪽 OS 파일만 올라간 버전은 `latest.json`에 그 OS 항목이 없어서, 그 OS의 앱은 그 버전을 업데이트로 받지 않습니다.
