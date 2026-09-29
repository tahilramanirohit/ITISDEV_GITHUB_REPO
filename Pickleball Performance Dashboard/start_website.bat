@echo off
rem Double-click to start the PicklePro website on Windows.
rem First run: installs the website's packages (a few minutes).
rem Later runs: starts straight away and opens http://localhost:5173.
rem Close the window or press Ctrl+C to stop it.

setlocal
cd /d "%~dp0"
title PicklePro website

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org, then run this file again.
  goto :end
)

rem -- .env.local holds the PUBLIC Supabase URL and anon key (never the service-role key)
if not exist ".env.local" (
  copy ".env.example" ".env.local" >nul
  echo .env.local did not exist, so it was created from .env.example.
  echo Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, save, then run this file again.
  notepad ".env.local"
  goto :end
)

rem -- Packages: install when missing or when package-lock.json changed after a git pull
rem node_modules\.picklepro-installed-lock is a copy of package-lock.json from the last install.
if not exist "node_modules\.picklepro-installed-lock" goto :install
fc /b "package-lock.json" "node_modules\.picklepro-installed-lock" >nul 2>nul
if errorlevel 1 goto :install
goto :run

:install
echo Installing the website's packages (first run or after an update) ...
call npm ci
if errorlevel 1 (
  echo.
  echo Package installation failed. Check your internet connection and the messages above.
  goto :end
)
copy /y "package-lock.json" "node_modules\.picklepro-installed-lock" >nul

:run
echo.
echo Starting the website at http://localhost:5173 . Leave this window open. Ctrl+C stops it.
echo.
call npm run dev -- --open

:end
echo.
pause
endlocal
