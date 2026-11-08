@echo off
rem PicklePro video analyzer: ONE button to turn it ON or OFF (Windows).
rem   Double-click while it's OFF -> start_worker.bat opens in a new window and turns it ON.
rem   Double-click while it's ON  -> the analyzer and its window are closed (OFF).
rem Put a shortcut to this file on the Desktop. See docs\WINDOWS_ANALYZER.md.

setlocal
cd /d "%~dp0"

rem Is the analyzer already running? (any python.exe running "picklepro.worker", not the quick setup check)
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*picklepro.worker*' -and $_.CommandLine -notlike '*--check*' }) { exit 0 } else { exit 1 }"
if %errorlevel%==0 goto :turn_off

:turn_on
echo Turning the PicklePro analyzer ON in a new window ...
echo In that window, press 2 (measured) when it asks for the mode, then leave it open.
start "PicklePro worker" cmd /c start_worker.bat
timeout /t 5 >nul
goto :eof

:turn_off
echo The analyzer is ON. Turning it OFF ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*picklepro.worker*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
rem Close the analyzer's window too (start_worker.bat titles it "PicklePro worker").
taskkill /fi "WINDOWTITLE eq PicklePro worker*" /t /f >nul 2>&1
echo.
echo The PicklePro analyzer is now OFF.
timeout /t 5 >nul
