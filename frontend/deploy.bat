@echo off
REM Script deploy per Vercel (Windows)
REM Esegui: deploy.bat "messaggio del commit"

if "%1"=="" (
  echo.
  echo [91mX Specifica il messaggio del commit[0m
  echo Uso: deploy.bat "messaggio del commit"
  echo.
  pause
  exit /b 1
)

setlocal enabledelayedexpansion

set COMMIT_MSG=%1

cls
echo.
echo [92m................................[0m
echo [92m^|   DEPLOY FAMMY SU VERCEL   ^|[0m
echo [92m................................[0m
echo.

REM Verifica che siamo in un repo git
if not exist .git (
  echo [91mX Errore: non e un repository git[0m
  pause
  exit /b 1
)

REM Controlla lo stato
echo [94m^> Stato del repo:[0m
echo.
git status
echo.

REM Aggiunge file modificati
echo [94m^> Aggiungendo file modificati...[0m
git add -A

echo [94m^> Creando commit: "%COMMIT_MSG%"[0m
echo.
git commit -m "%COMMIT_MSG%"

if errorlevel 1 (
  echo [91mX Errore nel commit[0m
  pause
  exit /b 1
)

echo.
echo [94m^> Pushing su GitHub...[0m
git push origin main

if errorlevel 1 (
  echo [91mX Errore nel push[0m
  pause
  exit /b 1
) else (
  echo.
  echo [92m✓ Deploy in corso! Vercel sta costruendo l'app...[0m
  echo [92m^> Controlla: https://fammy-flame.vercel.app[0m
  echo.
  pause
)
