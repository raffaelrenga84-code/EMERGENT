@echo off
chcp 65001 >nul
echo ===================================================
echo  FAMMY - Download librerie per modalita' offline
echo ===================================================
echo.
echo Sto scaricando React, ReactDOM e Babel nella cartella "vendor"...
echo (Serve internet SOLO per questo passaggio. Una volta finito,
echo  potrai usare FAMMY ovunque senza connessione.)
echo.

set VENDOR_DIR=%~dp0vendor
if not exist "%VENDOR_DIR%" mkdir "%VENDOR_DIR%"

echo [1/3] React...
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://unpkg.com/react@18.2.0/umd/react.production.min.js' -OutFile '%VENDOR_DIR%\react.production.min.js'"
if errorlevel 1 goto :error

echo [2/3] ReactDOM...
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js' -OutFile '%VENDOR_DIR%\react-dom.production.min.js'"
if errorlevel 1 goto :error

echo [3/3] Babel...
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://unpkg.com/@babel/standalone@7.23.0/babel.min.js' -OutFile '%VENDOR_DIR%\babel.min.js'"
if errorlevel 1 goto :error

echo.
echo ===================================================
echo  Tutto pronto! Ora fai doppio clic su fammy.html
echo  La cartella e' completamente autonoma:
echo  puoi copiarla su chiavetta USB, inviarla via email,
echo  e funzionera' senza internet.
echo ===================================================
echo.
pause
goto :eof

:error
echo.
echo ATTENZIONE: errore nel download. Controlla la connessione internet
echo e riprova. Se il problema persiste, scarica manualmente i 3 file
echo elencati nel README.txt e mettili nella cartella "vendor".
echo.
pause
