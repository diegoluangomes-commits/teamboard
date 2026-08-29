# ============================================================
#  TeamSolidez — BACKUP
#  Rode ANTES de aplicar alterações.
#  Cria uma tag no Git e um dump do banco.
#
#  Uso:  powershell -ExecutionPolicy Bypass -File .\backup.ps1
#        powershell -ExecutionPolicy Bypass -File .\backup.ps1 "antes-lgpd"
# ============================================================

param(
    [string]$Nome = ""
)

$ErrorActionPreference = "Stop"

# ── Configuração ────────────────────────────────────────────
$Projeto  = "C:\Users\diego\Downloads\AppDev\teamboard-postgres"
$PastaBkp = "C:\Users\diego\BackupsTeamSolidez"
$PgBin    = "C:\Program Files\PostgreSQL\16\bin"
$ArqData  = Join-Path $PastaBkp ".ultimo-backup"

$DbHost = "dpg-d82ak0bbc2fs73c7cqvg-a.ohio-postgres.render.com"
$DbUser = "teamsolidez_db_user"
$DbName = "teamsolidez_db"
$DbPass = "uOD6zCBoc1KnSHNcf27e6qP5sL0KSKnw"

# ── Preparação ──────────────────────────────────────────────
$Carimbo = Get-Date -Format "yyyyMMdd-HHmm"
if ([string]::IsNullOrWhiteSpace($Nome)) { $Nome = "backup" }
$Tag = "bkp-$Nome-$Carimbo"

if (-not (Test-Path $PastaBkp)) { New-Item -ItemType Directory -Path $PastaBkp | Out-Null }

Write-Host ""
Write-Host "==== BACKUP TEAMSOLIDEZ ====" -ForegroundColor Cyan
Write-Host "Identificacao: $Tag"
Write-Host ""

# ── Aviso se faz mais de 7 dias sem backup ──────────────────
if (Test-Path $ArqData) {
    $ultimaData = [datetime](Get-Content $ArqData)
    $diasPassados = ((Get-Date) - $ultimaData).Days
    if ($diasPassados -ge 7) {
        Write-Host "⚠ Ultimo backup ha $diasPassados dias. Bom que esta fazendo agora!" -ForegroundColor Yellow
        Write-Host ""
    }
}

# ── 1. Tag no Git ───────────────────────────────────────────
Write-Host "[1/2] Criando tag no Git..." -ForegroundColor Yellow
Set-Location $Projeto

$pendentes = git status --porcelain
if ($pendentes) {
    Write-Host "      ATENCAO: ha alteracoes nao commitadas." -ForegroundColor Red
    Write-Host "      A tag marca o ULTIMO COMMIT, nao o que esta na pasta." -ForegroundColor Red
    Write-Host ""
    $r = Read-Host "      Continuar mesmo assim? (S/N)"
    if ($r -ne "S" -and $r -ne "s") { Write-Host "Cancelado."; exit }
}

git tag $Tag
git push origin $Tag
Write-Host "      OK - tag $Tag enviada ao GitHub" -ForegroundColor Green

# ── 2. Dump do banco ────────────────────────────────────────
Write-Host ""
Write-Host "[2/2] Gerando dump do banco (pode levar 1 min)..." -ForegroundColor Yellow

$Arquivo = Join-Path $PastaBkp "$Tag.dump"
$env:PGPASSWORD = $DbPass

& "$PgBin\pg_dump.exe" -h $DbHost -U $DbUser -d $DbName `
    --no-acl --no-owner -F c -f $Arquivo

if (Test-Path $Arquivo) {
    $tam = [math]::Round((Get-Item $Arquivo).Length / 1KB, 0)
    Write-Host "      OK - $Arquivo ($tam KB)" -ForegroundColor Green
    # Registra a data do backup
    Get-Date | Out-File $ArqData -Force
} else {
    Write-Host "      FALHOU - dump nao foi gerado" -ForegroundColor Red
}

# ── Limpeza: mantem os 15 backups mais recentes ─────────────
$antigos = Get-ChildItem $PastaBkp -Filter "*.dump" |
           Sort-Object LastWriteTime -Descending | Select-Object -Skip 15
if ($antigos) {
    $antigos | Remove-Item -Force
    Write-Host ""
    Write-Host "Limpeza: $($antigos.Count) backup(s) antigo(s) removido(s)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "==== BACKUP CONCLUIDO ====" -ForegroundColor Cyan
Write-Host "Para voltar a este ponto:  powershell -ExecutionPolicy Bypass -File .\restaurar.ps1 $Tag"
Write-Host ""
