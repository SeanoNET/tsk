$ErrorActionPreference = "Stop"

$Repo = "SeanoNET/tsk"

if ($env:TSK_VERSION) {
    $Version = $env:TSK_VERSION
} else {
    $Release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Version = $Release.tag_name -replace '^v', ''
}

$Artifact = "tsk-windows-x64.exe"
$Url = "https://github.com/$Repo/releases/download/v$Version/$Artifact"
$InstallDir = "$env:LOCALAPPDATA\tsk"
$ExePath = "$InstallDir\tsk.exe"

Write-Host "Installing tsk v$Version..."

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Invoke-WebRequest -Uri $Url -OutFile $ExePath -UseBasicParsing

# Add to PATH if not present
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$UserPath;$InstallDir", "User")
    $env:PATH = "$env:PATH;$InstallDir"
    Write-Host "Added $InstallDir to user PATH."
}

Write-Host "Installed tsk to $ExePath"
Write-Host "Run 'tsk --version' to verify."
