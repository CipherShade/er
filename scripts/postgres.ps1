param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$pgBase = Join-Path $env:USERPROFILE '.edu-erp-postgres'
$bin = Join-Path $pgBase 'pgsql\bin'
$data = Join-Path $pgBase 'data'
$log = Join-Path $pgBase 'pg.log'

if (-not (Test-Path (Join-Path $bin 'postgres.exe'))) {
  throw "PostgreSQL binaries not found at $bin. Run the one-time setup first."
}

switch ($Action) {
  'start' {
    $existing = Get-Process -Name postgres -ErrorAction SilentlyContinue
    if ($existing) { Write-Output 'PostgreSQL is already running.'; return }
    $proc = Start-Process -FilePath (Join-Path $bin 'postgres.exe') `
      -ArgumentList '-D', "`"$data`"", '-p', '5432' `
      -RedirectStandardOutput (Join-Path $pgBase 'pg.out.log') `
      -RedirectStandardError (Join-Path $pgBase 'pg.err.log') `
      -WindowStyle Hidden -PassThru
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Milliseconds 500
      if ((Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) -and (Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue)) {
        Write-Output "PostgreSQL started (pid $($proc.Id)) and accepting connections on :5432."
        return
      }
    }
    throw 'PostgreSQL did not become ready within 15s. Check the log files.'
  }
  'stop' {
    $existing = Get-Process -Name postgres -ErrorAction SilentlyContinue
    if (-not $existing) { Write-Output 'PostgreSQL is not running.'; return }
    & (Join-Path $bin 'pg_ctl.exe') -D $data stop -m fast | Out-Null
    Write-Output 'PostgreSQL stopped.'
  }
  'status' {
    $env:PGPASSWORD = 'postgrespassword'
    & (Join-Path $bin 'pg_isready.exe') -h localhost -p 5432 -U postgres
  }
}