# Windows 설치 파일을 GitHub 릴리스(v<버전>)에 올린다. 릴리스가 없으면 만들고, 있으면(macOS에서 먼저 만든 경우) 파일만 추가한다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1   (gh 로그인 필요)
$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "gh(GitHub CLI)가 필요합니다" }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$conf = Get-Content apps/desktop/src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$Version = $conf.version
$Tag = "v$Version"

if ((git branch --show-current) -ne "main") { throw "main 브랜치에서만 릴리스합니다" }
if (git status --porcelain) { throw "커밋하지 않은 변경이 있습니다" }
git fetch -q origin main
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw "origin/main과 다릅니다 (push 또는 pull 먼저)" }

$setup = Get-ChildItem "target\release\bundle\nsis\*_${Version}_*-setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "v$Version 설치 파일이 없습니다 (task bundle 먼저)" }

gh release view $Tag *> $null
if ($LASTEXITCODE -eq 0) {
  gh release upload $Tag $setup.FullName --clobber
} else {
  gh release create $Tag $setup.FullName --target main --title "Twin Deck $Version" --generate-notes
}
if ($LASTEXITCODE -ne 0) { throw "gh 실패" }
Write-Host "릴리스 완료: $Tag ($($setup.Name))"
