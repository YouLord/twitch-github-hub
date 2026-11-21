@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
title twitch-github-hub - локальный запуск
cd /d "%~dp0"

echo ============================================================
echo   twitch-github-hub - локальный сервер
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :no_node
for /f "tokens=*" %%v in ('node -v') do echo [i] Node %%v

if not exist ".env" (
  echo [i] .env нет - создаю из .env.example
  copy /y ".env.example" ".env" >nul
  echo [i] Открой .env в блокноте и впиши токены Twitch и GitHub.
  echo     Без токенов всё равно работает - в демо-режиме с мок-данными.
  echo.
)

echo [i] Оверлей:  http://localhost:8787/overlay
echo [i] Галерея:  http://localhost:8787/gallery
echo [i] Ctrl+C - остановить сервер
echo.

start "" "http://localhost:8787/"
node src/server.js
goto :end

:no_node
echo [X] Node.js не установлен.
echo     Скачай LTS-версию: https://nodejs.org/ru
echo     После установки перезапусти этот файл.
start "" "https://nodejs.org/ru"
goto :end

:end
echo.
pause
endlocal
