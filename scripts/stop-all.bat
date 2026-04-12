@echo off
rem ═════════════════════════════════════════════════════════════════
rem  stop-all.bat — Windows graceful shutdown for the mega ERP
rem  Author:  Agent-33 (ops swarm)
rem  Related: OPS_RUNBOOK.md section 3.1
rem
rem  Reads PID files from scripts\pids\*.pid and sends a graceful
rem  shutdown signal (taskkill without /F => WM_CLOSE, Node hears
rem  this as SIGINT and runs its shutdown hooks).
rem
rem  Hard-kill (/F) is ONLY used as a last resort after a 30 second
rem  grace window per service.
rem
rem  Usage:
rem     scripts\stop-all.bat
rem     scripts\stop-all.bat --force   (skip grace, hard-kill now)
rem ═════════════════════════════════════════════════════════════════

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "PID_DIR=%SCRIPT_DIR%pids"

set "FORCE=0"
if /i "%~1"=="--force" set "FORCE=1"

if not exist "%PID_DIR%" (
    echo [info] no pid directory at %PID_DIR% — nothing to stop.
    exit /b 0
)

echo.
echo ============================================================
echo  Techno-Kol mega ERP — graceful stop
echo ============================================================
echo.

rem Stop in REVERSE dependency order so dependents go first.
call :stop_one AI-Task-Manager
call :stop_one techno-kol-ops
call :stop_one onyx-ai
call :stop_one onyx-procurement

echo.
echo [done] all services signalled.
echo.
endlocal
exit /b 0

rem ═══════════════════════════════════════════════════════════════
:stop_one
set "SVC=%~1"
set "PIDFILE=%PID_DIR%\%SVC%.pid"

if not exist "%PIDFILE%" (
    echo [skip] %SVC% — no pid file
    goto :eof
)

set /p PID=<"%PIDFILE%"
if "!PID!"=="" (
    echo [skip] %SVC% — empty pid file
    del "%PIDFILE%" 2>nul
    goto :eof
)

rem Check if still alive
tasklist /fi "PID eq !PID!" /nh 2>nul | findstr /i "node.exe" >nul
if errorlevel 1 (
    echo [gone] %SVC% PID=!PID! already exited
    del "%PIDFILE%" 2>nul
    goto :eof
)

if "%FORCE%"=="1" (
    echo [FORCE] %SVC% PID=!PID! — hard kill
    taskkill /PID !PID! /T /F >nul 2>nul
    del "%PIDFILE%" 2>nul
    goto :eof
)

echo [term] %SVC% PID=!PID! — sending graceful close
rem /T = include child tree (Node workers). No /F => WM_CLOSE => SIGINT.
taskkill /PID !PID! /T >nul 2>nul

rem Grace window: poll up to 30 seconds.
set /a "TRIES=0"
:wait_loop
ping -n 2 127.0.0.1 >nul
set /a "TRIES+=1"
tasklist /fi "PID eq !PID!" /nh 2>nul | findstr /i "node.exe" >nul
if errorlevel 1 (
    echo        %SVC% exited after !TRIES! tick(s)
    del "%PIDFILE%" 2>nul
    goto :eof
)
if !TRIES! lss 15 goto wait_loop

echo [warn] %SVC% PID=!PID! still alive after 30s — consider --force
goto :eof
