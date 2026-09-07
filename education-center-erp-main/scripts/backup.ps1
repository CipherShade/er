param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$Filename = ("edu_center_erp_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".dump"),
    [switch]$Gzip
)

<#
.SYNOPSIS
  Logical backup of the Educational Center ERP PostgreSQL database via pg_dump.

.DESCRIPTION
  Creates a compressed (custom-format) logical dump. Requires PostgreSQL client
  tools (pg_dump) on the machine running the script. Store the dump off-host,
  restrict access, and keep multiple dated copies (see docs/deployment.md).

.EXAMPLE
  $env:DATABASE_URL = "postgresql://user:pass@host:5432/db?schema=public"
  powershell -File scripts/backup.ps1
#>

if (-not $DatabaseUrl) {
    Write-Error "DATABASE_URL is required. Set it as an env var or pass -DatabaseUrl."
    exit 1
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    Write-Error "pg_dump not found on PATH. Install PostgreSQL client tools."
    exit 1
}

& pg_dump --format=custom --no-owner --file="$Filename" "$DatabaseUrl"
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Backup written to: $Filename"

if ($Gzip) {
    & gzip "$Filename"
    if ($LASTEXITCODE -ne 0) {
        Write-Error "gzip failed"
        exit $LASTEXITCODE
    }
    Write-Host "Compressed to: $Filename.gz"
}
