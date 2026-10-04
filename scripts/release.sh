#!/usr/bin/env bash
# 번들을 zip으로 묶어 GitHub 릴리스(v<버전>)에 올린다. 버전은 tauri.conf.json에서 읽는다. (macOS 전용, gh 로그인 필요)
#
# 사용: scripts/release.sh draft|publish
#   draft   드래프트 배포: 비공개 초안(draft) 릴리스에 이 OS의 파일만 올린다. 공개하지 않고 태그도 만들지 않는다.
#           초안이 없으면 만들고, 있으면 같은 초안에 이 OS의 파일을 더한다(macOS와 Windows를 각자 올릴 때).
#   publish 배포: 이 OS의 파일을 올린 뒤 초안을 공개한다(그때 태그 v<버전>이 만들어진다).
#           macOS용과 Windows용 파일이 모두 올라와 있어야 공개한다. 한쪽만 공개하려면 ALLOW_PARTIAL=1.
#
# 환경 변수(시험용): DRY_RUN=1 이면 GitHub를 바꾸는 명령은 출력만 한다. VERSION_OVERRIDE=<버전> 이면 그 버전으로 올린다.
set -euo pipefail

MODE="${1:-}"
[[ "$MODE" == "draft" || "$MODE" == "publish" ]] || { echo "사용: $0 draft|publish" >&2; exit 2; }
[[ "$(uname -s)" == "Darwin" ]] || { echo "release는 macOS만 지원합니다" >&2; exit 1; }
command -v gh >/dev/null || { echo "gh(GitHub CLI)가 필요합니다" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APP_NAME="Twin Deck"
VERSION="${VERSION_OVERRIDE:-$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' apps/desktop/src-tauri/tauri.conf.json | head -1)}"
TAG="v$VERSION"
APP="target/release/bundle/macos/$APP_NAME.app"
ZIP="target/release/bundle/twin-deck-$VERSION-macos-$(uname -m).zip"
ZIP_NAME="$(basename "$ZIP")"

run() { if [[ "${DRY_RUN:-}" == "1" ]]; then echo "[DRY_RUN] $*"; else "$@"; fi; }

# 태그로 릴리스를 찾는다(초안은 태그가 없어도 목록에는 나온다). 출력: "id<TAB>draft<TAB>target<TAB>파일,파일"
release_info() {
  gh api "repos/{owner}/{repo}/releases?per_page=100" \
    --jq ".[] | select(.tag_name==\"$TAG\") | [.id, .draft, .target_commitish, ([.assets[].name]|join(\",\"))] | @tsv" | head -1
}

git fetch -q origin main
SHA="$(git rev-parse HEAD)"
# DRY_RUN은 GitHub를 바꾸지 않으므로 저장소 상태 검사는 건너뛴다(스크립트를 고치는 중에도 흐름을 시험할 수 있다).
if [[ "${DRY_RUN:-}" != "1" ]]; then
  [[ "$(git branch --show-current)" == "main" ]] || { echo "main 브랜치에서만 릴리스합니다" >&2; exit 1; }
  [[ -z "$(git status --porcelain)" ]] || { echo "커밋하지 않은 변경이 있습니다" >&2; exit 1; }
  [[ "$SHA" == "$(git rev-parse origin/main)" ]] || { echo "origin/main과 다릅니다 (push 또는 pull 먼저)" >&2; exit 1; }
fi
[[ -d "$APP" ]] || { echo "번들이 없습니다: $APP (task bundle 먼저)" >&2; exit 1; }

INFO="$(release_info || true)"
ID=""; ASSETS=""
if [[ -n "$INFO" ]]; then
  IFS=$'\t' read -r ID DRAFT TARGET ASSETS <<<"$INFO"
  if [[ "$DRAFT" != "true" ]]; then
    echo "$TAG 는 이미 공개된 릴리스입니다. tauri.conf.json과 Cargo.toml의 버전을 올리세요" >&2
    exit 1
  fi
  # 두 OS의 파일이 같은 커밋에서 빌드됐는지 확인한다. 초안의 대상 커밋이 다르면 다른 코드가 한 릴리스에 섞인다.
  if [[ "$TARGET" != "$SHA" ]]; then
    echo "초안($TAG)은 ${TARGET:0:7} 커밋 기준인데 지금은 ${SHA:0:7} 입니다. 같은 커밋에서 빌드하거나 초안을 지우고 다시 만드세요" >&2
    exit 1
  fi
fi

rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
NOTE="서명하지 않은 빌드입니다. macOS에서 처음 열 때 막히면: xattr -dr com.apple.quarantine \"/Applications/$APP_NAME.app\""
if [[ -z "$INFO" ]]; then
  # 대상 커밋을 main이 아니라 빌드한 커밋으로 고정한다(공개할 때 태그가 그 커밋에 붙는다).
  run gh release create "$TAG" "$ZIP" --draft --target "$SHA" --title "Twin Deck $VERSION" --generate-notes --notes "$NOTE"
else
  run gh release upload "$TAG" "$ZIP" --clobber
fi

if [[ "$MODE" == "draft" ]]; then
  echo "드래프트 배포 완료: $TAG (비공개 초안, 태그 없음). 공개하려면 task release"
  exit 0
fi

# 배포: 두 OS의 파일이 모두 있어야 공개한다.
if [[ "${DRY_RUN:-}" == "1" ]]; then
  ASSETS="$ASSETS,$ZIP_NAME"
else
  ASSETS="$(release_info | cut -f4)"
fi
HAS_MAC=0; HAS_WIN=0
[[ ",$ASSETS," == *"-macos-"* ]] && HAS_MAC=1
[[ ",$ASSETS," == *"-setup.exe,"* ]] && HAS_WIN=1
if [[ "$HAS_MAC" != 1 || "$HAS_WIN" != 1 ]] && [[ "${ALLOW_PARTIAL:-}" != "1" ]]; then
  echo "공개하지 않았습니다: macOS용(${HAS_MAC}) Windows용(${HAS_WIN}) 파일이 모두 있어야 합니다 (1 = 있음)." >&2
  echo "초안에는 이 OS의 파일이 올라가 있습니다. 다른 OS에서 task release:draft 를 한 뒤 다시 task release 하세요." >&2
  echo "한쪽만 공개하려면 ALLOW_PARTIAL=1 task release" >&2
  exit 3
fi
[[ -n "$ID" ]] || ID="$(release_info | cut -f1)"
if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "[DRY_RUN] gh api -X PATCH repos/{owner}/{repo}/releases/${ID:-<id>} -F draft=false"
else
  gh api -X PATCH "repos/{owner}/{repo}/releases/$ID" -F draft=false --jq '.html_url'
fi
echo "배포 완료: $TAG"
