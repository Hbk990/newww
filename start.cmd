@echo off
REM Starts the system. Double-click it. Ctrl+C in this window stops it.
cd /d "%~dp0"

docker start showroom-db >nul 2>&1

echo.
echo   Starting in: %CD%
echo   When it stops printing, open  http://localhost:5173
echo.
echo     username:  owner
echo     password:  Showroom-Test-2026
echo.
echo   Press Ctrl+C here to stop it.
echo.
call npm run dev
pause
