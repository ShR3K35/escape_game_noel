<#
.SYNOPSIS
  Lance les tests sous Windows, sans rien installer d'autre que Docker Desktop.

.EXAMPLE
  .\scripts\test.ps1          # backend (pytest) + frontend (typecheck + Vitest)
  .\scripts\test.ps1 -E2E     # + tests de bout en bout Playwright contre la version complète
.NOTES
  Les tests E2E réinitialisent la partie : ne pas les lancer pendant la soirée.
#>
param([switch]$E2E)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
$failed = @()

Write-Host "`n=== Backend : pytest ===" -ForegroundColor Cyan
docker compose -f compose.dev.yml build backend
docker compose -f compose.dev.yml run --rm --no-deps backend sh -c "ruff check app tests && pytest"
if ($LASTEXITCODE -ne 0) { $failed += "backend" }

Write-Host "`n=== Frontend : typecheck + Vitest ===" -ForegroundColor Cyan
docker compose -f compose.dev.yml run --rm --no-deps frontend sh -c "npm ci --no-audit --no-fund && npm run typecheck && npm test"
if ($LASTEXITCODE -ne 0) { $failed += "frontend" }

if ($E2E) {
  Write-Host "`n=== End-to-end : Playwright ===" -ForegroundColor Cyan
  docker compose up --build -d
  $ok = $false
  for ($i = 0; $i -lt 60; $i++) {
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:8080/api/health").StatusCode -eq 200) { $ok = $true; break } } catch { Start-Sleep 2 }
  }
  if (-not $ok) { $failed += "e2e (serveur injoignable)" }
  else {
    $pwVersion = (Get-Content frontend/package-lock.json -Raw | ConvertFrom-Json).packages.'node_modules/@playwright/test'.version
    docker run --rm --ipc=host -v "${PWD}/frontend:/work" -w /work `
      -e E2E_BASE_URL=http://host.docker.internal:8080 `
      "mcr.microsoft.com/playwright:v$pwVersion-noble" sh -c "npm ci --no-audit --no-fund && npx playwright test"
    if ($LASTEXITCODE -ne 0) { $failed += "e2e" }
  }
}

if ($failed.Count) { Write-Host "`nÉCHEC : $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "`nTous les tests sont passés." -ForegroundColor Green
