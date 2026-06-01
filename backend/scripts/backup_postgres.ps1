param(
  [string]$OutputDir = "backups",
  [int]$RetentionDays = 7
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL nao configurada no ambiente."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutputDir "gpcredito-$timestamp.dump"

pg_dump $env:DATABASE_URL -Fc -f $file

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $OutputDir -Filter "gpcredito-*.dump" |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

Write-Output "Backup criado: $file"
