<#
Idempotent installer for Windows PowerShell.
Usage: powershell -ExecutionPolicy Bypass -File ./install_deps.ps1
#>

set -e

function Write-Info($m) { Write-Host "[INFO]  $m" -ForegroundColor Cyan }
function Write-Succ($m) { Write-Host "[OK]    $m" -ForegroundColor Green }
function Write-Err($m) { Write-Host "[ERROR] $m" -ForegroundColor Red }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Err "Python not found on PATH"; exit 2 }

$venvPath = Join-Path $repoRoot '.venv'
$pythonExe = "python"
if (-Not (Test-Path $venvPath)) {
    Write-Info "Creating virtual environment at $venvPath"
    & $pythonExe -m venv $venvPath
}
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
if (-Not (Test-Path $venvPython)) { $venvPython = $pythonExe }

Write-Info "Upgrading pip and installing backend requirements"
& $venvPython -m pip install --upgrade pip | Out-Null
& $venvPython -m pip install -r backend/requirements.txt | Out-Null
Write-Succ "Backend requirements installed"

if (Test-Path "frontend") {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Info "Installing frontend dependencies (npm ci)"
        Push-Location frontend
        npm ci
        Pop-Location
        Write-Succ "Frontend deps installed"
    } else { Write-Err "npm not found on PATH — skipping frontend install" }
} else { Write-Host "[WARN] No frontend directory present; skipping frontend install" -ForegroundColor Yellow }

Write-Succ "All install steps complete"
Pop-Location
