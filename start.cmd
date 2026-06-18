@echo off
title Kaizen Dashboard
cd /d "%~dp0"

:: Open browser after a short delay (runs in parallel)
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start server — this keeps the window alive
echo.
echo   Kaizen is running at http://localhost:3000
echo   Close this window to stop the server.
echo.
node server.js

:: If node exits unexpectedly, keep window open to see errors
echo.
echo   Server stopped. Press any key to close...
pause >nul
