@echo off
setlocal
where spicetify >nul 2>nul
if errorlevel 1 goto :missing
if not exist "%~dp0pantalla-letras.js" goto :no_file

set "LEP_DATA="
for /f "delims=" %%I in ('spicetify path userdata 2^>nul') do set "LEP_DATA=%%I"
if not defined LEP_DATA goto :failed

set "LEP_CLI="
for /f "delims=" %%V in ('spicetify --version 2^>nul') do set "LEP_CLI=%%V"
if "%LEP_CLI%"=="2.46.7" (
  powershell.exe -NoProfile -Command "$ini=Join-Path $env:LEP_DATA 'config-xpui.ini'; $entry=Select-String -LiteralPath $ini -Pattern '^\s*spotify_path\s*=\s*(.+)$' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($entry) { $base=$entry.Matches[0].Groups[1].Value.Trim([char]34).Trim(); if ($base) { $exe=Join-Path $base 'Spotify.exe' } }; if (-not $exe) { $exe=Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1 -ExpandProperty Path }; if (-not $exe) { $exe=Join-Path $env:APPDATA 'Spotify/Spotify.exe' }; if (Test-Path -LiteralPath $exe) { $version=(Get-Item -LiteralPath $exe).VersionInfo; if ($version.ProductMajorPart -eq 1 -and ($version.ProductMinorPart -gt 3 -or ($version.ProductMinorPart -eq 3 -and $version.ProductBuildPart -gt 9))) { exit 39 } }"
  if errorlevel 39 goto :unsupported
)

if not exist "%LEP_DATA%\Extensions\." mkdir "%LEP_DATA%\Extensions" || goto :failed
copy /y "%~dp0pantalla-letras.js" "%LEP_DATA%\Extensions\pantalla-letras.js" >nul || goto :failed
spicetify config extensions pantalla-letras.js || goto :failed
spicetify backup apply --no-restart || goto :failed

echo.
echo Instalacion lista. Cierra y vuelve a abrir Spotify cuando quieras.
if /i not "%~1"=="/s" pause
exit /b 0

:unsupported
echo Esta version de Spotify es posterior a las que admite Spicetify 2.46.7.
echo Espera una version compatible de Spicetify antes de instalar la extension.
if /i not "%~1"=="/s" pause
exit /b 2

:missing
echo No se encontro el comando spicetify. Instala primero Spicetify.
goto :failed

:no_file
echo Extrae todo el ZIP para que el archivo JavaScript quede al lado del instalador.

:failed
echo La instalacion no termino. Revisa la salida de Spicetify.
if /i not "%~1"=="/s" pause
exit /b 1
