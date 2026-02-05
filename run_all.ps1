<#
Run everything: setup, start backend + frontend, run tests/build/lint, then stop services.
Usage (PowerShell):
  ./run_all.ps1

Notes:
 - Requires Python and Node/npm installed on PATH.
 - On first run it will create a virtualenv at `./.venv` and install backend requirements.
 - Frontend dependencies are installed into `./frontend/node_modules` when missing.
#>

set -e

function Write-Info($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-Succ($msg) { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoRoot

Write-Info "Starting full-run at $(Get-Date)"

# 1) Check prerequisites
Write-Info "Checking prerequisites..."
$python = (Get-Command python -ErrorAction SilentlyContinue)
$npm = (Get-Command npm -ErrorAction SilentlyContinue)
if (-not $python) { Write-Err "Python not found on PATH. Install Python and re-run."; exit 2 }
if (-not $npm) { Write-Warn "npm not found on PATH. Frontend steps will be skipped." }

# 2) Setup Python virtualenv and install backend requirements
$venvPath = Join-Path $repoRoot '.venv'
$pythonExe = "python"
if (-Not (Test-Path $venvPath)) {
    Write-Info "Creating virtual environment at $venvPath"
    & $pythonExe -m venv $venvPath
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to create venv"; exit 3 }
}
$venvPython = Join-Path $venvPath 'Scripts\python.exe'
if (-Not (Test-Path $venvPython)) { $venvPython = $pythonExe }

Write-Info "Upgrading pip and installing backend requirements"
& $venvPython -m pip install --upgrade pip | Out-Null
& $venvPython -m pip install -r backend/requirements.txt | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Err "Failed to install backend requirements"; exit 4 }

# 3) Install frontend deps if npm is available
$didInstallFrontendDeps = $false
if ($npm) {
    if (-Not (Test-Path "frontend\node_modules")) {
        Write-Info "Installing frontend dependencies..."
        Push-Location frontend
        npm install
        if ($LASTEXITCODE -ne 0) { Write-Warn "`npm install` failed; frontend tasks may fail" }
        Pop-Location
        $didInstallFrontendDeps = $true
    } else { Write-Info "Frontend dependencies present" }
}

# 4) Start backend and frontend in background
$processes = @{}

Write-Info "Starting backend (uvicorn)"
$backendScript = Join-Path $repoRoot 'backend/run.py'
$backendProcess = Start-Process -FilePath $venvPython -ArgumentList @($backendScript) -NoNewWindow -PassThru
$processes['backend'] = $backendProcess
Write-Info "Backend started (PID $($backendProcess.Id))"

$frontendProcess = $null
if ($npm) {
    Write-Info "Starting frontend (next dev)"
    # Use npm --prefix to run in frontend; run in a detached process
    $frontendProcess = Start-Process -FilePath "npm" -ArgumentList @("--prefix","frontend","run","dev") -NoNewWindow -PassThru
    $processes['frontend'] = $frontendProcess
    Write-Info "Frontend started (PID $($frontendProcess.Id))"
}

# 5) Wait for services to be healthy (poll)
function Wait-For-Url($url, $timeoutSec) {
    $end = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $end) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

$backendReady = Wait-For-Url "http://127.0.0.1:8000/docs" 20
if ($backendReady) { Write-Succ "Backend responded at /docs" } else { Write-Warn "Backend did not respond in time" }

$frontendReady = $false
if ($npm) {
    $frontendReady = Wait-For-Url "http://127.0.0.1:3000" 30
    if ($frontendReady) { Write-Succ "Frontend responded at :3000" } else { Write-Warn "Frontend did not respond in time" }
}

# 6) Run tests and builds
$exitCode = 0

Write-Info "Running backend tests (pytest)"
& $venvPython -m pytest -q
if ($LASTEXITCODE -eq 0) { Write-Succ "Backend tests passed" } else { Write-Err "Backend tests failed"; $exitCode = 1 }

if ($npm) {
    Write-Info "Building frontend (next build)"
    Push-Location frontend
    npm run build
    if ($LASTEXITCODE -eq 0) { Write-Succ "Frontend build succeeded" } else { Write-Err "Frontend build failed"; $exitCode = 1 }
    Pop-Location

    Write-Info "Running frontend linter"
    npm --prefix frontend run lint
    if ($LASTEXITCODE -eq 0) { Write-Succ "Frontend lint passed" } else { Write-Warn "Frontend lint had issues"; $exitCode = 1 }
}

# 7) Stop background processes
Write-Info "Stopping background processes"
foreach ($k in $processes.Keys) {
    $p = $processes[$k]
    if ($p -and -not $p.HasExited) {
        Write-Info "Stopping $k (PID $($p.Id))"
        try { $p.Kill() ; Start-Sleep -Milliseconds 200 } catch { Write-Warn "Could not kill $k: $_" }
    }
}

Write-Info "Summary:"
if ($backendReady) { Write-Succ "Backend was reachable" } else { Write-Warn "Backend was not reachable" }
if ($npm) {
    if ($frontendReady) { Write-Succ "Frontend was reachable" } else { Write-Warn "Frontend was not reachable" }
}
if ($exitCode -eq 0) { Write-Succ "All steps succeeded" } else { Write-Err "Some steps failed (exit code $exitCode)" }

Pop-Location
exit $exitCode
