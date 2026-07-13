<#
================================================================================
 compare-schemas.ps1
 Compares the STRUCTURE (tables, columns, types, nullability) of two PostgreSQL
 databases -- e.g. DigitalOcean (DO) vs Neon -- ignoring the data inside them.

 What it does:
   1. Computes a single schema hash on each database and compares them.
   2. If the hashes match  -> prints "IDENTICAL" and stops.
      If they differ       -> exports the full column list from both and shows
                              exactly which columns differ.

 Requirements:
   - PostgreSQL client tools installed (psql on PATH).
       Install:  winget install PostgreSQL.PostgreSQL
   - Two connection strings (keep the ?sslmode=require suffix).

 Usage (PowerShell, from anywhere):
   ./compare-schemas.ps1 `
       -DoUrl   "postgresql://doadmin:PW@DO_HOST:25060/defaultdb?sslmode=require" `
       -NeonUrl "postgresql://USER:PW@NEON_HOST/DBNAME?sslmode=require"

 Read-only: this script only runs SELECTs. It never modifies either database.
================================================================================
#>

param(
    [Parameter(Mandatory = $true)] [string] $DoUrl,
    [Parameter(Mandatory = $true)] [string] $NeonUrl,
    [string] $OutDir = "."
)

$ErrorActionPreference = "Stop"

# --- Ensure psql is available ------------------------------------------------
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'psql' not found on PATH." -ForegroundColor Red
    Write-Host "Install it with:  winget install PostgreSQL.PostgreSQL" -ForegroundColor Yellow
    exit 1
}

# --- Queries -----------------------------------------------------------------
$hashQuery = @"
SELECT md5(string_agg(
         table_name || '|' || column_name || '|' || data_type || '|' || is_nullable,
         ',' ORDER BY table_name, ordinal_position))
FROM information_schema.columns
WHERE table_schema='public';
"@

# Query 3 wrapped in \copy so psql writes a CSV file directly.
$colsCopy = @"
\copy (SELECT table_name, column_name, data_type, coalesce(character_maximum_length::text,'') AS len, is_nullable, coalesce(column_default,'') AS dflt FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position) TO STDOUT WITH CSV HEADER
"@

function Get-SchemaHash([string]$url, [string]$label) {
    Write-Host "Hashing $label schema..." -ForegroundColor Cyan
    # -t tuples only, -A unaligned  -> returns just the hash string
    $h = (psql $url -t -A -c $hashQuery).Trim()
    if ([string]::IsNullOrWhiteSpace($h)) {
        throw "Could not read schema from $label. Check the connection string / SSL."
    }
    return $h
}

# --- 1. Compare hashes -------------------------------------------------------
$doHash   = Get-SchemaHash $DoUrl   "DO"
$neonHash = Get-SchemaHash $NeonUrl "Neon"

Write-Host ""
Write-Host "DO   schema hash : $doHash"
Write-Host "Neon schema hash : $neonHash"
Write-Host ""

if ($doHash -eq $neonHash) {
    Write-Host "RESULT: IDENTICAL  -- both databases have the same structure." -ForegroundColor Green
    exit 0
}

Write-Host "RESULT: DIFFERENT  -- exporting full column lists to find the mismatch..." -ForegroundColor Yellow

# --- 2. Export both column lists and diff ------------------------------------
$doCsv   = Join-Path $OutDir "schema_do.csv"
$neonCsv = Join-Path $OutDir "schema_neon.csv"

psql $DoUrl   -c $colsCopy | Out-File -FilePath $doCsv   -Encoding utf8
psql $NeonUrl -c $colsCopy | Out-File -FilePath $neonCsv -Encoding utf8

Write-Host ""
Write-Host "Differences (<= only in DO,  => only in Neon):" -ForegroundColor Yellow
$diff = Compare-Object (Get-Content $doCsv) (Get-Content $neonCsv)

if ($null -eq $diff) {
    Write-Host "  (no line differences -- mismatch is likely column ORDER or a type-format subtlety)" -ForegroundColor DarkGray
} else {
    $diff | ForEach-Object {
        $side = if ($_.SideIndicator -eq "<=") { "DO  " } else { "Neon" }
        Write-Host ("  [{0}] {1}" -f $side, $_.InputObject)
    }
}

Write-Host ""
Write-Host "Full CSVs saved:" -ForegroundColor Cyan
Write-Host "  $doCsv"
Write-Host "  $neonCsv"
Write-Host "Tip: open both in VS Code and use 'Compare Active File With...' for a visual diff."
exit 1
