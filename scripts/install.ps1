# Windows용 설치/삭제. NSIS 설치 파일(task bundle로 만든다)을 조용히 실행한다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1 [install|uninstall]
param([string]$Action = "install")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AppName = "Twin Deck"
$Uninstaller = Join-Path $env:LOCALAPPDATA "$AppName\uninstall.exe"

function Stop-Running {
  # 설치본만 종료한다(개발 모드의 target\debug 프로세스는 건드리지 않는다).
  Get-Process twin-deck-desktop -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -like "$env:LOCALAPPDATA\$AppName\*" } |
    ForEach-Object { Write-Host "실행 중인 $AppName 종료"; $_ | Stop-Process -Force; Start-Sleep -Seconds 1 }
}

switch ($Action) {
  "install" {
    $setup = Get-ChildItem (Join-Path $Root "target\release\bundle\nsis\*-setup.exe") -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) { throw "설치 파일이 없습니다 (task bundle 먼저)" }
    Stop-Running
    Start-Process -FilePath $setup.FullName -ArgumentList "/S" -Wait
    Write-Host "설치 완료: $($setup.Name)"
  }
  "uninstall" {
    if (-not (Test-Path $Uninstaller)) { throw "설치본이 없습니다: $Uninstaller" }
    Stop-Running
    Start-Process -FilePath $Uninstaller -ArgumentList "/S" -Wait
    Write-Host "삭제 완료 (설정은 남겨 둡니다)"
  }
  default { throw "사용: install.ps1 [install|uninstall]" }
}
