@echo off
rem Double-click to start the PicklePro analysis worker on Windows.
rem First run: creates .venv and installs packages (a few minutes).
rem Later runs: checks packages, then starts the worker. Close the window or
rem press Ctrl+C to stop it.

setlocal
cd /d "%~dp0"
title PicklePro worker

rem -- 1. server\.env holds the Supabase URL and service-role key
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo server\.env did not exist, so it was created from .env.example.
  echo Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, save, then run this file again.
  notepad ".env"
  goto :end
)

rem -- 2. Python virtual environment
if not exist ".venv\Scripts\python.exe" (
  echo Creating the Python environment in server\.venv ...
  py -3.12 -m venv .venv 2>nul || py -3 -m venv .venv 2>nul || python -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo.
    echo Could not create the Python environment. Install Python 3.12 from python.org,
    echo tick "Add python.exe to PATH", then run this file again.
    goto :end
  )
)
set "PY=.venv\Scripts\python.exe"

rem -- 3. Packages (quick when already installed)
echo Checking Python packages ...
"%PY%" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto :pipfail
rem Court, ball and person models (about 90 MB, checked against pinned
rem checksums). Files already present are kept; only missing or new models
rem are downloaded. Without them the worker falls back to motion detection.
echo Checking the court, ball and person models ...
"%PY%" -m picklepro.fetch_models
if exist "models\*.pt" (
  echo Model files found in server\models - checking YOLO packages ^(large download the first time^) ...
  "%PY%" -m pip install --disable-pip-version-check -q -r requirements-yolo.txt
  if errorlevel 1 goto :pipfail
)

rem -- 4. Setup check: stops if the web app and worker use different projects
echo.
"%PY%" -m picklepro.worker --check
if errorlevel 1 (
  echo.
  echo Setup check failed. server\.env and ..\.env.local must use the same Supabase project.
  goto :end
)

rem -- 5. Choose the mode
echo.
echo   1 = test_fixture  stores clearly labelled TEST DATA, checks upload + database only
echo   2 = measured      runs computer vision on the uploaded video
choice /c 12 /n /m "Choose mode [1/2]: "
if errorlevel 2 (set "MODE=measured") else (set "MODE=test_fixture")

echo.
echo Starting worker in %MODE% mode. Leave this window open. Ctrl+C stops it.
echo.
"%PY%" -m picklepro.worker --mode %MODE%
goto :end

:pipfail
echo.
echo Package installation failed. Check your internet connection and the messages above.

:end
echo.
pause
endlocal
