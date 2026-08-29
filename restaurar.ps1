# ============================================================
#  TeamSolidez — RESTAURAR
#  Volta o codigo para uma tag de backup.
#
#  Uso:  .\restaurar.ps1                 (lista as tags)
#        .\restaurar.ps1 bkp-nome-data   (restaura o codigo)
#        .\restaurar.ps1 bkp-nome-data -ComBanco   (codigo + banco)
# ============================================================

param(
    [string]$Tag = "",
    [switch]$ComBanco
)

$ErrorActionPreference = "Stop"

$Projeto  = "C:\Users\diego\Downloads\AppDev\teamboard-postgres"
$PastaBkp = "C:\Users\diego\BackupsTeamSolidez"
$PgBin    = "C:\Program Files\PostgreSQL\16\bin"

$DbHost = "dpg-d82ak0bbc2fs73c7cqvg-a.ohio-postgres.render.com"
$DbUser = "teamsolidez_db_user"
$DbName = "teamsolidez_db"
$DbPass = "uOD6zCBoc1KnSHNcf27e6qP5sL0KSKnw"

Set-Location $Projeto

# ── Sem parâmetro: apenas lista os backups ──────────────────
if ([string]::IsNullOrWhiteSpace($Tag)) {
    Write-Host ""
    Write-Host "==== BACKUPS DISPONIVEIS ====" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Tags no Git (codigo):" -ForegroundColor Yellow
    git tag --sort=-creatordate | Select-Object -First 15 | ForEach-Object { Write-Host "   $_" }
    Write-Host ""
    Write-Host "Dumps do banco:" -ForegroundColor Yellow
    if (Test-Path $PastaBkp) {
        Get-ChildItem $PastaBkp -Filter "*.dump" |
            Sort-Object LastWriteTime -Descending | Select-Object -First 10 |
            ForEach-Object { Write-Host "   $($_.BaseName)  ($([math]::Round($_.Length/1KB,0)) KB)" }
    } else { Write-Host "   (nenhum)" }
    Write-Host ""
    Write-Host "Para restaurar:  .\restaurar.ps1 NOME-DA-TAG" -ForegroundColor Green
    Write-Host ""
    exit
}

# ── Confirmação ─────────────────────────────────────────────
Write-Host ""
Write-Host "==== RESTAURAR TEAMSOLIDEZ ====" -ForegroundColor Cyan
Write-Host "Tag: $Tag"
if ($ComBanco) { Write-Host "Inclui restauracao do BANCO DE DADOS" -ForegroundColor Red }
Write-Host ""
Write-Host "O codigo atual sera substituido pelo da tag." -ForegroundColor Yellow
$r = Read-Host "Confirmar? (digite SIM)"
if ($r -ne "SIM") { Write-Host "Cancelado."; exit }

# ── 1. Restaura o código ────────────────────────────────────
Write-Host ""
Write-Host "[1/2] Restaurando codigo..." -ForegroundColor Yellow

git fetch --tags
git checkout $Tag -- .
git add -A
git commit -m "revert: restaurado a partir de $Tag"
git push

Write-Host "      OK - codigo restaurado e enviado. O Render vai redeployar." -ForegroundColor Green

# ── 2. Restaura o banco (opcional) ──────────────────────────
if ($ComBanco) {
    $Arquivo = Join-Path $PastaBkp "$Tag.dump"
    if (-not (Test-Path $Arquivo)) {
        Write-Host ""
        Write-Host "[2/2] Dump nao encontrado: $Arquivo" -ForegroundColor Red
        Write-Host "      O codigo foi restaurado, mas o banco NAO." -ForegroundColor Red
        exit
    }

    Write-Host ""
    Write-Host "[2/2] Restaurando banco..." -ForegroundColor Yellow
    Write-Host "      ATENCAO: os dados atuais serao SOBRESCRITOS." -ForegroundColor Red
    $r2 = Read-Host "      Confirmar restauracao do banco? (digite SIM)"
    if ($r2 -ne "SIM") { Write-Host "      Banco nao alterado."; exit }

    $env:PGPASSWORD = $DbPass
    & "$PgBin\pg_restore.exe" -h $DbHost -U $DbUser -d $DbName `
        --clean --if-exists --no-acl --no-owner $Arquivo

    Write-Host "      OK - banco restaurado" -ForegroundColor Green
}

Write-Host ""
Write-Host "==== RESTAURACAO CONCLUIDA ====" -ForegroundColor Cyan
Write-Host "Aguarde ~1 min o deploy do Render e teste o sistema."
Write-Host ""
