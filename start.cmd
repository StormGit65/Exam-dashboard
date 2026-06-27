@echo off
title Kaizen Dashboard
cd /d "%~dp0"

:: Start server
node server.js

:: If node exits unexpectedly, keep window open to see errors
echo.
echo   Server stopped. Press any key to close...
pause >nul
