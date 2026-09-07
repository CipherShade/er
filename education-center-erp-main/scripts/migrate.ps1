param(
    [switch]$DryRun
)

<#
.SYNOPSIS
  Apply pending Prisma migrations to the target (production/staging) database.

.DESCRIPTION
  Uses `prisma migrate deploy` — the only safe non-interactive migration command
  for deployed environments. It never resets or drops data and never prompts.
  Requires DATABASE_URL to be set and reachable. Run before starting the web
  service; the service startup also runs it as a safety net.

.EXAMPLE
  $env:DATABASE_URL = "postgresql://user:pass@host:5432/prod?schema=public"
  powershell -File scripts/migrate.ps1
#>

if ($DryRun) {
    Write-Host "Dry-run: would run: prisma migrate deploy"
    exit 0
}

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is required."
    exit 1
}

npm run db:migrate:deploy
if ($LASTEXITCODE -ne 0) {
    Write-Error "Migration deploy failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Migration status:"
npm run db:migrate:status
