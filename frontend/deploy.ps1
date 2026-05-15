# Script deploy per Vercel (PowerShell)
# Esegui: .\deploy.ps1 "messaggio del commit"

param(
    [string]$CommitMsg
)

if ([string]::IsNullOrEmpty($CommitMsg)) {
    Write-Host ""
    Write-Host "❌ Specifica il messaggio del commit" -ForegroundColor Red
    Write-Host "Uso: .\deploy.ps1 'messaggio del commit'" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "................................" -ForegroundColor Green
Write-Host "|   DEPLOY FAMMY SU VERCEL   |" -ForegroundColor Green
Write-Host "................................" -ForegroundColor Green
Write-Host ""

# Verifica che siamo in un repo git
if (!(Test-Path .git)) {
    Write-Host "❌ Errore: non è un repository git" -ForegroundColor Red
    exit 1
}

# Controlla lo stato
Write-Host "📋 Stato del repo:" -ForegroundColor Cyan
Write-Host ""
git status
Write-Host ""

# Aggiunge file modificati
Write-Host "🔄 Aggiungendo file modificati..." -ForegroundColor Cyan
git add -A

Write-Host "💾 Creando commit: '$CommitMsg'" -ForegroundColor Cyan
Write-Host ""
git commit -m "$CommitMsg"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Errore nel commit" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Pushing su GitHub..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deploy in corso! Vercel sta costruendo l'app..." -ForegroundColor Green
    Write-Host "🌐 Controlla: https://fammy-flame.vercel.app" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "❌ Errore nel push" -ForegroundColor Red
    exit 1
}
