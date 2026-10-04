# Windows 설치 파일(NSIS)을 GitHub 릴리스(v<버전>)에 올린다. 버전은 tauri.conf.json에서 읽는다. (gh 로그인 필요)
#
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1 -Mode draft|publish
#   draft   드래프트 배포: 비공개 초안(draft) 릴리스에 이 OS의 파일만 올린다. 공개하지 않고 태그도 만들지 않는다.
#           초안이 없으면 만들고, 있으면 같은 초안에 이 OS의 파일을 더한다(macOS와 Windows를 각자 올릴 때).
#   publish 배포: 이 OS의 파일을 올린 뒤 초안을 공개한다(그때 태그 v<버전>이 만들어진다).
#           macOS용과 Windows용 파일이 모두 올라와 있어야 공개한다. 한쪽만 공개하려면 $env:ALLOW_PARTIAL = "1".
#
# 환경 변수(시험용): $env:DRY_RUN = "1" 이면 GitHub를 바꾸는 명령은 출력만 한다. $env:VERSION_OVERRIDE = "<버전>" 이면 그 버전으로 올린다.
param([Parameter(Mandatory = $true)][ValidateSet("draft", "publish")][string]$Mode)
$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "gh(GitHub CLI)가 필요합니다" }
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$conf = Get-Content apps/desktop/src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$Version = if ($env:VERSION_OVERRIDE) { $env:VERSION_OVERRIDE } else { $conf.version }
$Tag = "v$Version"
$Dry = ($env:DRY_RUN -eq "1")

function Invoke-Gh { param([string[]]$GhArgs)
  if ($Dry) { Write-Host "[DRY_RUN] gh $($GhArgs -join ' ')" } else { & gh @GhArgs; if ($LASTEXITCODE -ne 0) { throw "gh 실패: $($GhArgs -join ' ')" } }
}

# 태그로 릴리스를 찾는다(초안은 태그가 없어도 목록에는 나온다).
function Get-ReleaseInfo {
  $json = gh api "repos/{owner}/{repo}/releases?per_page=100"
  if ($LASTEXITCODE -ne 0) { throw "gh api 실패" }
  $json | ConvertFrom-Json | Where-Object { $_.tag_name -eq $Tag } | Select-Object -First 1
}

if ((git branch --show-current) -ne "main") { throw "main 브랜치에서만 릴리스합니다" }
if (git status --porcelain) { throw "커밋하지 않은 변경이 있습니다" }
git fetch -q origin main
$Sha = (git rev-parse HEAD)
if ($Sha -ne (git rev-parse origin/main)) { throw "origin/main과 다릅니다 (push 또는 pull 먼저)" }

$setup = Get-ChildItem "target\release\bundle\nsis\*_${Version}_*-setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw "v$Version 설치 파일이 없습니다 (task bundle 먼저)" }

$info = Get-ReleaseInfo
if ($info) {
  if (-not $info.draft) { throw "$Tag 는 이미 공개된 릴리스입니다. tauri.conf.json과 Cargo.toml의 버전을 올리세요" }
  # 두 OS의 파일이 같은 커밋에서 빌드됐는지 확인한다.
  if ($info.target_commitish -ne $Sha) {
    throw "초안($Tag)은 $($info.target_commitish.Substring(0,7)) 커밋 기준인데 지금은 $($Sha.Substring(0,7)) 입니다. 같은 커밋에서 빌드하거나 초안을 지우고 다시 만드세요"
  }
  Invoke-Gh @("release", "upload", $Tag, $setup.FullName, "--clobber")
} else {
  # 대상 커밋을 main이 아니라 빌드한 커밋으로 고정한다(공개할 때 태그가 그 커밋에 붙는다).
  Invoke-Gh @("release", "create", $Tag, $setup.FullName, "--draft", "--target", $Sha, "--title", "Twin Deck $Version", "--generate-notes")
}

if ($Mode -eq "draft") {
  Write-Host "드래프트 배포 완료: $Tag (비공개 초안, 태그 없음). 공개하려면 task release"
  exit 0
}

# 배포: 두 OS의 파일이 모두 있어야 공개한다.
$names = @()
if ($Dry) { $names = @($setup.Name) + @($info.assets | ForEach-Object { $_.name }) }
else { $info = Get-ReleaseInfo; $names = @($info.assets | ForEach-Object { $_.name }) }
$hasMac = [bool]($names | Where-Object { $_ -like "*-macos-*" })
$hasWin = [bool]($names | Where-Object { $_ -like "*-setup.exe" })
if ((-not ($hasMac -and $hasWin)) -and $env:ALLOW_PARTIAL -ne "1") {
  Write-Host "공개하지 않았습니다: macOS용($hasMac) Windows용($hasWin) 파일이 모두 있어야 합니다."
  Write-Host "초안에는 이 OS의 파일이 올라가 있습니다. 다른 OS에서 task release:draft 를 한 뒤 다시 task release 하세요."
  Write-Host "한쪽만 공개하려면 `$env:ALLOW_PARTIAL = '1'; task release"
  exit 3
}
if ($Dry) { Write-Host "[DRY_RUN] gh api -X PATCH repos/{owner}/{repo}/releases/<id> -F draft=false" }
else {
  gh api -X PATCH "repos/{owner}/{repo}/releases/$($info.id)" -F draft=false --jq ".html_url"
  if ($LASTEXITCODE -ne 0) { throw "공개 실패" }
}
Write-Host "배포 완료: $Tag"
