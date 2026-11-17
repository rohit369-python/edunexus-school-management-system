@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Frontend dependencies are missing. Run setup-windows.bat first.
  pause
  exit /b 1
)
if not exist "backend\.venv\Scripts\python.exe" (
  echo Backend environment is missing. Run setup-windows.bat first.
  pause
  exit /b 1
)
echo Starting EduNexus backend and frontend...
start "EduNexus API - 127.0.0.1:8000" cmd /k ""%~dp0start-backend-windows.bat""
start "EduNexus Frontend - localhost:8080" cmd /k ""%~dp0start-frontend-windows.bat""
echo.
echo Frontend: http://localhost:8080
echo Backend docs: http://127.0.0.1:8000/docs
echo Backend health: http://127.0.0.1:8000/api/v1/health
echo Keep both terminal windows open. Close them to stop the services.
timeout /t 5 >nul
start "" "http://localhost:8080"
