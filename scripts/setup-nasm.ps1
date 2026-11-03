# aws-lc-sys가 Windows(MSVC)에서 어셈블리를 빌드하려면 NASM이 PATH에 있어야 한다.
# NASM 설치 프로그램은 PATH를 등록하지 않으므로 없으면 설치하고 사용자 PATH에 직접 넣는다.
$dir = 'C:\Program Files\NASM'
if (-not (Test-Path "$dir\nasm.exe")) {
    winget install --id NASM.NASM -e --accept-package-agreements --accept-source-agreements
}
$user = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($user -notmatch [regex]::Escape($dir)) {
    [Environment]::SetEnvironmentVariable('Path', $user.TrimEnd(';') + ';' + $dir, 'User')
    Write-Host 'NASM added to PATH: open a new terminal.'
} else {
    Write-Host 'NASM ok'
}
