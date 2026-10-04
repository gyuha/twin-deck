#!/usr/bin/env bash
# 번들(.app)을 만들어 /Applications에 설치한다. 이미 실행 중이면 종료하고 덮어쓴다.
# 사용: scripts/install.sh [install|uninstall]   (macOS 전용)
set -euo pipefail

[[ "$(uname -s)" == "Darwin" ]] || { echo "install은 macOS만 지원합니다" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="Twin Deck"
SRC="$ROOT/target/release/bundle/macos/$APP_NAME.app"
DEST="${INSTALL_DIR:-/Applications}/$APP_NAME.app"

quit_running() {
  # 설치본만 종료한다. 개발 모드(target/debug)로 띄운 같은 이름의 프로세스는 건드리지 않는다.
  if pgrep -f "$DEST/Contents/MacOS/" >/dev/null; then
    echo "실행 중인 $APP_NAME 종료"
    pkill -f "$DEST/Contents/MacOS/" || true
    sleep 1
  fi
}

case "${1:-install}" in
  install)
    [[ -d "$SRC" ]] || { echo "번들이 없습니다: $SRC (task bundle 먼저)" >&2; exit 1; }
    quit_running
    rm -rf "$DEST"
    ditto "$SRC" "$DEST"
    echo "설치 완료: $DEST"
    ;;
  uninstall)
    quit_running
    rm -rf "$DEST"
    echo "삭제 완료: $DEST (설정은 ~/Library/Application Support/dev.twindeck.app 에 남겨 둡니다)"
    ;;
  *)
    echo "사용: $0 [install|uninstall]" >&2
    exit 2
    ;;
esac
