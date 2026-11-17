@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo EduNexus - install dependencies
echo ========================================
where node >nul 2>nul || (echo ERROR: Node.js is missing. Install Node.js 22 LTS first. & pause & exit /b 1)
where npm >nul 2>nul || (echo ERROR: npm is missing. Reinstall Node.js with npm included. & pause & exit /b 1)
where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python Launcher 'py' is missing. Install Python 3.11+ with the launcher.
  pause
  exit /b 1
)
py -3.11 --version >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python 3.11 was not found. Install Python 3.11 or newer.
  pause
  exit /b 1
)
echo [1/3] Installing frontend packages...
call npm ci
if errorlevel 1 (echo ERROR: npm ci failed. Check your internet connection and package lock. & pause & exit /b 1)
echo [2/3] Creating backend virtual environment...
if not exist "backend\.venv\Scripts\python.exe" py -3.11 -m venv backend\.venv
if errorlevel 1 (echo ERROR: Could not create Python virtual environment. & pause & exit /b 1)
echo [3/3] Installing backend packages...
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 (echo ERROR: pip upgrade failed. & pause & exit /b 1)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 (echo ERROR: Backend dependency installation failed. & pause & exit /b 1)
echo.
echo Setup completed. Double-click start-windows.bat to launch EduNexus.
pause
