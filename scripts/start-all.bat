@echo off
rem ═════════════════════════════════════════════════════════════════
rem  start-all.bat — Windows launcher for the Techno-Kol mega ERP
rem  Author:  Agent-33 (ops swarm)
rem  Related: OPS_RUNBOOK.md section 2.1
rem
rem  Starts every long-running service in its own cmd window so logs
rem  are visible. Writes PID files to scripts\pids\<service>.pid so
rem  stop-all.bat can shut them down gracefully.
rem
rem  Usage:
rem     cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"
rem     scripts\start-all.bat
rem ═════════════════════════════════════════════════════════════════

setlocal EnableDelayedExpansion

rem -- Resolve the repo root relative to this script ---------------
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
pushd "%ROOT%" >nul

set "PID_DIR=%SCRIPT_DIR%pids"
set "LOG_DIR=%SCRIPT_DIR%logs"
if not exist "%PID_DIR%" mkdir "%PID_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo ============================================================
echo  Techno-Kol mega ERP — starting all services
echo  Root: %CD%
echo ============================================================
echo.

rem -- Preflight: require .env for every managed service -----------
set "MISSING="
if not exist "onyx-procurement\.env"  set "MISSING=!MISSING! onyx-procurement"
if not exist "onyx-ai\.env"           set "MISSING=!MISSING! onyx-ai"
if not exist "techno-kol-ops\.env"    set "MISSING=!MISSING! techno-kol-ops"
if not exist "AI-Task-Manager\.env"   set "MISSING=!MISSING! AI-Task-Manager"

if defined MISSING (
    echo [ERROR] Missing .env file(s) for:!MISSING!
    echo         Copy .env.example to .env in each project and fill in values.
    echo         Aborting start-all.
    popd >nul
    exit /b 1
)

rem -- Preflight: Node must be on PATH -----------------------------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] node not found on PATH. Install Node.js ^>=20.
    popd >nul
    exit /b 1
)

rem ═══════════════════════════════════════════════════════════════
rem  Helper macro — we cannot define a real function in a .bat file
rem  that also writes PID files, so we repeat the pattern inline.
rem
rem  For each service we:
rem    1. start a titled cmd window running npm start
rem    2. wait a moment, then capture the PID of the newest node.exe
rem       started under that window by parsing tasklist
rem    3. write the PID to scripts\pids\<service>.pid
rem ═══════════════════════════════════════════════════════════════

rem -------- 1. onyx-procurement (port 3100) -----------------------
echo [1/4] Starting onyx-procurement on port 3100 ...
start "ONYX-PROCUREMENT :3100" /D "%ROOT%\onyx-procurement" cmd /k "npm start"
call :sleep 3
call :capture_pid "ONYX-PROCUREMENT :3100" onyx-procurement

rem -------- 2. onyx-ai (port 3200) --------------------------------
echo [2/4] Starting onyx-ai on port 3200 ...
start "ONYX-AI :3200" /D "%ROOT%\onyx-ai" cmd /k "npm start"
call :sleep 3
call :capture_pid "ONYX-AI :3200" onyx-ai

rem -------- 3. techno-kol-ops (port 5000) -------------------------
echo [3/4] Starting techno-kol-ops on port 5000 ...
start "TECHNO-KOL-OPS :5000" /D "%ROOT%\techno-kol-ops" cmd /k "npm start"
call :sleep 3
call :capture_pid "TECHNO-KOL-OPS :5000" techno-kol-ops

rem -------- 4. AI-Task-Manager (pnpm workspace, port 8080) --------
echo [4/4] Starting AI-Task-Manager on port 8080 ...
start "AI-TASK-MANAGER :8080" /D "%ROOT%\AI-Task-Manager" cmd /k "pnpm -r --if-present --parallel run start"
call :sleep 3
call :capture_pid "AI-TASK-MANAGER :8080" AI-Task-Manager

echo.
echo ============================================================
echo  All services launched. PID files in: %PID_DIR%
echo  To stop gracefully:  scripts\stop-all.bat
echo  Dev SPA (optional):  cd payroll-autonomous ^&^& npm run dev
echo ============================================================
echo.

popd >nul
endlocal
exit /b 0

rem ═══════════════════════════════════════════════════════════════
rem  Subroutines
rem ═══════════════════════════════════════════════════════════════

:sleep
rem %1 = seconds
ping -n %1 127.0.0.1 >nul
goto :eof

:capture_pid
rem %1 = window title (quoted)
rem %2 = service name (used for pid file)
set "TITLE=%~1"
set "SVC=%~2"
set "PIDFILE=%PID_DIR%\%SVC%.pid"

rem The titled cmd window hosts a node child. Find the cmd by title,
rem then find node children whose parent is that cmd.pid.
for /f "tokens=2 delims=," %%a in ('tasklist /v /fi "WINDOWTITLE eq %TITLE%" /fo csv /nh 2^>nul') do (
    set "PARENT=%%~a"
)
if not defined PARENT (
    echo   [warn] could not capture parent PID for %SVC%
    goto :eof
)

rem Find node.exe whose parent PID matches %PARENT% using wmic.
for /f "skip=1 tokens=1" %%p in ('wmic process where "name='node.exe' and ParentProcessId=%PARENT%" get ProcessId 2^>nul') do (
    if not "%%p"=="" (
        > "%PIDFILE%" echo %%p
        echo   [ok]   %SVC% PID=%%p   (^> %PIDFILE%)
        goto :eof
    )
)
echo   [warn] %SVC% started but PID not yet visible — try again in a few seconds.
goto :eof
