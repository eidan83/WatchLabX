@echo off
cd /d "%~dp0"
set PORT=8774
echo.
echo ================================================
echo   WatchLabX v0.2.0 - Mobile Sessions Build
echo   Serving THIS folder on port %PORT%
echo ================================================
echo.
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/?v=0.2.0"
  py -m http.server %PORT% --bind 127.0.0.1
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/?v=0.2.0"
  python -m http.server %PORT% --bind 127.0.0.1
  goto :end
)
echo Python 3 was not found.
pause
:end
