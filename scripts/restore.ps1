param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [switch]$Verify
)

<#
.SYNOPSIS
  Restore a pg_dump custom-format backup into a target PostgreSQL database.

.DESCRIPTION
  Restores into the target database pointed to by DATABASE_URL. This is DESTRUCTIVE
  to the target database. Always restore into a fresh/empty database first, verify
  (migration status + smoke test), and confirm an approved maintenance window plus a
  fresh rollback backup before restoring over live data. See docs/deployment.md.

.EXAMPLE
  $env:DATABASE_URL = "postgresql://user:pass@host:5432/edu_center_erp_restore?schema=public"
  powershell -File scripts/restore.ps1 -BackupFile ./edu_center_erp_20260101.dump -Verify
#>

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}
if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL is required. Set it as an env var or pass -DatabaseUrl."
    exit 1
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    Write-Error "pg_restore not found on PATH. Install PostgreSQL client tools."
    exit 1
}

& pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DatabaseUrl" "$BackupFile"
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_restore failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Restore completed from: $BackupFile"

if ($Verify) {
    Write-Host "Verify Prisma migration state with:  npm run db:migrate:status"
    Write-Host "Then smoke-test login, check-in, settlement, and shift close."
}
