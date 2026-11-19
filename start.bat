@REM start.bat | SignalFLoor | One-click Windows launcher exposing LAN host for phone companion sync & browser open
@echo off
setlocal
pushd "%~dp0"

title SignalFloor Dev Launcher (LAN Host Enabled)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js / npm.cmd was not found on PATH. Install Node.js LTS first.
  popd
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies for SignalFloor...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    popd
    pause
    exit /b 1
  )
)

set "VITE_CONFIG_NATIVE_IGNORE_WARNING=true"
echo Starting SignalFloor on localhost AND your local Wi-Fi network...
echo Open the "Phone / LAN" button in the top bar for the QR code to connect your phone on the same Wi-Fi.
call npm.cmd run dev -- --host --open

if errorlevel 1 (
  echo.
  echo [ERROR] SignalFloor exited with an error.
  pause
)

popd
endlocal
