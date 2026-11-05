<#
.SYNOPSIS
  Démarrage du projet Noël 2026 sous Windows 11 (Docker Desktop).

.EXAMPLE
  .\scripts\dev.ps1            # mode développement, rechargement automatique  -> http://localhost:8080
  .\scripts\dev.ps1 -Mode full # version complète (image de production)        -> http://localhost:8080
  .\scripts\dev.ps1 -Mode demo # développement + planning accéléré (DEMO_MODE)
  .\scripts\dev.ps1 -Mode seed # charge des données de démonstration (version full démarrée)
  .\scripts\dev.ps1 -Mode logs # suit les logs
  .\scripts\dev.ps1 -Mode stop # arrête tout
#>
param(
  [ValidateSet("dev", "full", "demo", "seed", "logs", "stop")]
  [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker n'est pas installé ou pas dans le PATH. Installez Docker Desktop : https://www.docker.com/products/docker-desktop/"
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Error "Docker Desktop n'est pas démarré." }

New-Item -ItemType Directory -Force -Path "media/videos" | Out-Null

function Wait-Healthy([string]$Url) {
  Write-Host "Attente du serveur sur $Url ..." -ForegroundColor DarkGray
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$Url/api/health"
      if ($r.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}

function Show-Urls {
  Write-Host ""
  Write-Host "  Accueil          http://localhost:8080/" -ForegroundColor Yellow
  Write-Host "  Maître du jeu    http://localhost:8080/admin   (mot de passe de dev : noel2026)" -ForegroundColor Yellow
  Write-Host "  Télévision       http://localhost:8080/tv" -ForegroundColor Yellow
  Write-Host "  Lutins           http://localhost:8080/lutins" -ForegroundColor Yellow
  Write-Host "  État             http://localhost:8080/status" -ForegroundColor Yellow
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress
  if ($ip) { Write-Host "  Depuis le téléphone (même Wi-Fi) : http://${ip}:8080/admin  (pare-feu Windows à autoriser)" -ForegroundColor DarkYellow }
  Write-Host ""
}

switch ($Mode) {
  "dev" {
    Show-Urls
    docker compose -f compose.dev.yml up --build
  }
  "demo" {
    $env:DEMO_MODE = "true"
    Show-Urls
    docker compose -f compose.dev.yml up --build
  }
  "full" {
    docker compose up --build -d
    if (Wait-Healthy "http://localhost:8080") { Show-Urls } else { docker compose logs --tail 50 app; Write-Error "Le serveur ne répond pas." }
  }
  "seed" {
    docker compose exec app python -m app.cli seed-demo
  }
  "logs" {
    docker compose logs -f
  }
  "stop" {
    docker compose -f compose.dev.yml down
    docker compose down
  }
}
