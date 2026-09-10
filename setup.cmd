@echo off
REM ---------------------------------------------------------------------------
REM  Sets the system up on this PC. Double-click it.
REM
REM  The line below moves to the folder this file sits in, so it does not matter
REM  where it is run from. Being in the wrong folder is the commonest way a
REM  setup fails, and it fails with an error that names npm, not the real cause.
REM ---------------------------------------------------------------------------
cd /d "%~dp0"

echo.
echo   Car Showroom - setup
echo   Folder: %CD%
echo.

echo   [1/3] Database
docker start showroom-db >nul 2>&1
if not errorlevel 1 goto dbready
echo         Creating a new database container on port 3307...
docker run --name showroom-db -e MYSQL_ROOT_PASSWORD=devpassword -p 3307:3306 -d mysql:8
if errorlevel 1 goto nodocker
:dbready

echo.
echo   [2/3] Installing - this takes a few minutes
call npm ci
if errorlevel 1 goto failed

echo.
echo   [3/3] Building the database and loading the practice showroom
call npm run setup -- --big --db "mysql://root:devpassword@127.0.0.1:3307/carshowroom"
if errorlevel 1 goto failed

echo.
echo   Done. Double-click start.cmd to run it.
echo.
pause
exit /b 0

:nodocker
echo.
echo   Could not start a database with Docker.
echo   Open Docker Desktop, wait for the whale icon to turn green,
echo   then run this again.
echo.
pause
exit /b 1

:failed
echo.
echo   Setup stopped. The reason is printed above this line.
echo.
pause
exit /b 1
