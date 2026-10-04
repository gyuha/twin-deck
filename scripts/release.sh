#!/usr/bin/env bash
# 번들을 zip으로 묶어 GitHub 릴리스(v<버전>)에 올린다(릴리스가 없으면 만든다). 버전은 tauri.conf.json에서 읽는다.
# 사용: scripts/release.sh   (macOS 전용, gh 로그인 필요)
set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "release는 macOS만 지원합니다" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh(GitHub CLI)가 필요합니다" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_NAME="Twin Deck"
VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' apps/desktop/src-tauri/tauri.conf.json | head -1)"
TAG="v$VERSION"
APP="target/release/bundle/macos/$APP_NAME.app"
ZIP="target/release/bundle/twin-deck-$VERSION-macos-$(uname -m).zip"

[[ "$(git branch --show-current)" == "main" ]] || { echo "main 브랜치에서만 릴리스합니다" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "커밋하지 않은 변경이 있습니다" >&2; exit 1; }
git fetch -q origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "origin/main과 다릅니다 (push 또는 pull 먼저)" >&2; exit 1; }
[[ -d "$APP" ]] || { echo "번들이 없습니다: $APP (task bundle 먼저)" >&2; exit 1; }

rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if gh release view "$TAG" >/dev/null 2>&1; then
  # 이미 만든 릴리스(예: Windows 쪽에서 먼저)에는 이 플랫폼의 파일만 더한다.
  gh release upload "$TAG" "$ZIP" --clobber
else
  gh release create "$TAG" "$ZIP" --target main --title "Twin Deck $VERSION" --generate-notes \
    --notes "서명하지 않은 빌드입니다. macOS에서 처음 열 때 막히면: xattr -dr com.apple.quarantine \"/Applications/$APP_NAME.app\""
fi
echo "릴리스 완료: $TAG"
