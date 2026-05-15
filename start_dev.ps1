# AyuScout V2 — Windows Unified Startup Script
# ================================================
# Usage: Right-click → "Run with PowerShell"  OR  .\start_dev.ps1
#
# What it does:
#   1. Kills any zombie Python/uvicorn processes on common backend ports
#   2. Starts backend (python start.py) in a new terminal window
#   3. Starts frontend (npm run dev) in another terminal window
#   4. Shows health check URLs

$ErrorActionPreference = "Continue"
$BACKEND_PORTS = @(8080, 8081, 8082, 8083, 8000)
$SCRIPT_DIR   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND_DIR  = Join-Path $SCRIPT_DIR "backend"
$FRONTEND_DIR = Join-Path $SCRIPT_DIR "signalrx-dashboard"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AyuScout V2 — Dev Startup" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── Step 1: Kill zombie Python processes on backend ports ───
Write-Host "`n[1/3] Cleaning up stale processes on backend ports..." -ForegroundColor Yellow
foreach ($port in $BACKEND_PORTS) {
    $result = netstat -ano 2>$null | Select-String ":$port\s.*LISTENING"
    if ($result) {
        $result | ForEach-Object {
            $parts = ($_.Line -split '\s+' | Where-Object { $_ -ne '' })
            if ($parts.Count -ge 5) {
                $pid = $parts[4]
                if ($pid -match '^\d+$' -and [int]$pid -ne 0) {
                    try {
                        Stop-Process -Id ([int]$pid) -Force -ErrorAction SilentlyContinue
                        Write-Host "   ✅ Killed PID $pid on port $port" -ForegroundColor Green
                    } catch {}
                }
            }
        }
    }
}
Start-Sleep -Milliseconds 800

# ── Step 2: Start backend in new terminal ───────────────────
Write-Host "`n[2/3] Starting backend (python start.py)..." -ForegroundColor Yellow
$backendCmd = "cd '$BACKEND_DIR'; python -X utf8 start.py; Read-Host 'Backend stopped -- press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal

Write-Host "   ✅ Backend terminal launched" -ForegroundColor Green
Start-Sleep -Seconds 3    # give backend time to bind

# ── Step 3: Start frontend in new terminal ──────────────────
Write-Host "`n[3/3] Starting frontend (npm run dev)..." -ForegroundColor Yellow
$frontendCmd = "cd '$FRONTEND_DIR'; npm run dev; Read-Host 'Frontend stopped — press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal

Write-Host "   ✅ Frontend terminal launched" -ForegroundColor Green

# ── Summary ─────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   ✅  Backend  → http://localhost:8080" -ForegroundColor Green
Write-Host "   ✅  API Docs → http://localhost:8080/docs" -ForegroundColor Green
Write-Host "   ✅  Frontend → http://localhost:5173" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Both services started in separate windows." -ForegroundColor White
Write-Host "Close those windows to stop the services." -ForegroundColor Gray
Write-Host ""
