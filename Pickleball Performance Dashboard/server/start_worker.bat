@echo off
rem Windows helper: set up the Python environment (first run only) and start
rem the PicklePro analysis worker. Double-click it, or run it from any folder.
rem Pass "test_fixture" as the first argument to store canned TEST DATA results.
setlocal
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=measured"

where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")

if not exist ".venv\Scripts\python.exe" (
  echo Creating the Python environment in .venv ...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo.
    echo Could not create it. Install Python 3.10 or newer from https://www.python.org/downloads/
    echo and tick "Add python.exe to PATH" in the installer, then run this again.
    goto :end
  )
)

if not exist ".venv\installed.txt" (
  echo Installing requirements. The first time takes a few minutes ...
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo Installing requirements failed. See the error above.
    goto :end
  )
  echo ok> ".venv\installed.txt"
)

rem Ball, player and court models: needed for rallies and shot types.
rem Set SKIP_MODELS=1 before running to use the basic motion detector only.
if "%SKIP_MODELS%"=="1" goto :models_done
if exist ".venv\models_installed.txt" goto :models_done
echo.
echo Installing the model runtime: PyTorch for NVIDIA GPUs plus Ultralytics.
echo This is a large download, about 3 GB, and only happens once.
for %%C in (cu130 cu128 cu126) do (
  ".venv\Scripts\python.exe" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/%%C && goto :torch_ok
)
echo No NVIDIA build of PyTorch could be installed; installing the standard build, which runs on the CPU and is slower.
".venv\Scripts\python.exe" -m pip install torch torchvision
if errorlevel 1 goto :models_failed
:torch_ok
".venv\Scripts\python.exe" -m pip install -r requirements-yolo.txt
if errorlevel 1 goto :models_failed
".venv\Scripts\python.exe" -m picklepro.fetch_models
if errorlevel 1 goto :models_failed
echo ok> ".venv\models_installed.txt"
goto :models_done
:models_failed
echo.
echo Setting up the models failed; see the error above. Run this again to retry,
echo or set SKIP_MODELS=1 to start without ball tracking.
goto :end
:models_done
".venv\Scripts\python.exe" -c "import torch; print('GPU for analysis:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none, using the CPU')" 2>nul

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo Created server\.env. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
  echo from Supabase: Project Settings, API. Use the service_role or secret key,
  echo not the anon key. Save the file, close Notepad, then run this again.
  notepad ".env"
  goto :end
)

findstr /r /c:"^SUPABASE_SERVICE_ROLE_KEY=..*" ".env" >nul
if errorlevel 1 (
  echo SUPABASE_SERVICE_ROLE_KEY is empty in server\.env. Opening it in Notepad.
  notepad ".env"
  goto :end
)
findstr /r /c:"^SUPABASE_URL=https://..*" ".env" >nul
if errorlevel 1 (
  echo SUPABASE_URL is empty in server\.env. Opening it in Notepad.
  notepad ".env"
  goto :end
)

echo.
echo Starting the worker in %MODE% mode. Keep this window open while you use the app.
echo Press Ctrl+C to stop it.
echo.
".venv\Scripts\python.exe" -m picklepro.worker --mode %MODE%

:end
echo.
pause
