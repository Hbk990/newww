@echo off
REM Checks this installation and says what is wrong. Double-click it.
REM It only reads - it changes nothing.
cd /d "%~dp0"
call npm run doctor
echo.
pause
