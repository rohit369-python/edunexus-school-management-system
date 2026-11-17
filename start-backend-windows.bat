@echo off
setlocal
cd /d "%~dp0backend"
set DATABASE_URL=sqlite:///./edunexus.db
set JWT_SECRET=local-development-access-secret-change-before-deployment
set JWT_REFRESH_SECRET=local-development-refresh-secret-change-before-deployment
set SEED_ON_STARTUP=1
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
