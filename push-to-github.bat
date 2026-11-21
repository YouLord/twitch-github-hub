@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions
title twitch-github-hub - заливка на GitHub
cd /d "%~dp0"

set "REPO_URL=https://github.com/YouLord/twitch-github-hub.git"
set "GH_USER=YouLord"
set "GH_REPO=twitch-github-hub"
set "BRANCH=main"

echo ============================================================
echo   twitch-github-hub  to  GitHub
echo   %REPO_URL%
echo ============================================================
echo.

rem ---------- 1. есть ли git ----------
where git >nul 2>&1
if errorlevel 1 goto :no_git
for /f "tokens=*" %%v in ('git --version') do echo [i] %%v
echo.

rem ---------- 2. инициализация репозитория ----------
if not exist ".git" (
  echo [i] git init
  git init -b %BRANCH% >nul 2>&1
  if not exist ".git" git init >nul 2>&1
)

rem ---------- 3. автор коммита ----------
git config user.email >nul 2>&1
if errorlevel 1 (
  echo [i] git-идентичность не настроена, ставлю локально: %GH_USER%
  git config user.name "%GH_USER%" >nul
  git config user.email "%GH_USER%@users.noreply.github.com" >nul
)

rem ---------- 4. защита секретов ----------
if exist ".env" (
  git check-ignore -q .env
  if errorlevel 1 goto :env_leak
  echo [i] .env найден и игнорируется - хорошо, токены не уедут
)

rem ---------- 5. коммит ----------
git add -A
git diff --cached --quiet
if errorlevel 1 (
  echo [i] коммичу файлы
  git commit -m "feat: twitch x github hub - overlay, README live status, chat bot, clip gallery" >nul
) else (
  echo [i] новых изменений нет - всё уже в истории
)

rem ---------- 6. remote ----------
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin "%REPO_URL%"
) else (
  git remote set-url origin "%REPO_URL%"
)
echo [i] origin -> %REPO_URL%
git branch -M %BRANCH% >nul 2>&1

rem ---------- 7. первый push ----------
echo.
echo [i] пушу ветку %BRANCH% ...
echo     Если откроется окно входа GitHub - войди в аккаунт %GH_USER%
echo.
git push -u origin %BRANCH%
if not errorlevel 1 goto :success

rem ---------- 8. на GitHub уже что-то есть? подтянем ----------
echo.
echo [!] push не прошёл. Пробую подтянуть то, что уже есть на GitHub ...
git fetch origin %BRANCH%
if errorlevel 1 goto :ask_token
git rev-parse --verify origin/%BRANCH% >nul 2>&1
if errorlevel 1 goto :ask_token
git pull --rebase --allow-unrelated-histories -X theirs origin %BRANCH%
if errorlevel 1 goto :ask_token
git push -u origin %BRANCH%
if not errorlevel 1 goto :success

rem ---------- 9. нужен токен ----------
:ask_token
echo.
echo ------------------------------------------------------------
echo  Похоже, нужен токен доступа - обычный логин по паролю
echo  GitHub больше не принимает.
echo.
echo  1. Открой: https://github.com/settings/tokens/new?scopes=repo
echo  2. Note: twitch-github-hub   Expiration: 30 days   Scope: repo
echo  3. Generate token и скопируй строку вида ghp_xxxxx
echo.
echo  Токен нигде не сохранится: он уйдёт только в адрес этого push.
echo ------------------------------------------------------------
echo.
set "TOKEN="
set /p "TOKEN=Вставь токен и нажми Enter: "
if "%TOKEN%"=="" goto :fail

git push -u "https://x-access-token:%TOKEN%@github.com/%GH_USER%/%GH_REPO%.git" %BRANCH%
if errorlevel 1 goto :fail
git branch --set-upstream-to=origin/%BRANCH% %BRANCH% >nul 2>&1
goto :success

:success
echo.
echo ============================================================
echo   ГОТОВО - код на GitHub
echo   https://github.com/%GH_USER%/%GH_REPO%
echo ============================================================
echo.
echo  Что сделать дальше - 5 минут:
echo   1. Settings - Secrets and variables - Actions
echo      добавить TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET
echo   2. Там же вкладка Variables: TWITCH_CHANNEL и GALLERY_PARENTS=%GH_USER%.github.io
echo   3. Settings - Actions - General - Workflow permissions:
echo      выбрать Read and write permissions
echo   4. Settings - Pages - Source: GitHub Actions
echo.
echo  Подробно: docs\DEPLOY.md
echo.
start "" "https://github.com/%GH_USER%/%GH_REPO%
goto :end

:no_git
echo [X] Git не установлен.
echo     Скачай: https://git-scm.com/download/win
echo     Установи с настройками по умолчанию и запусти этот файл снова.
start "" "https://git-scm.com/download/win"
goto :end

:env_leak
echo [X] Файл .env существует, но НЕ игнорируется git.
echo     Токены уехали бы в публичный репозиторий - останавливаюсь.
echo     Проверь строку ".env" в .gitignore и запусти снова.
goto :end

:fail
echo.
echo [X] Не удалось запушить.
echo     Проверь, что:
echo       - репозиторий https://github.com/%GH_USER%/%GH_REPO% существует
echo       - токен скопирован целиком и не просрочен
echo       - есть доступ к интернету
echo     Логи git покажут точную причину.

:end
echo.
pause
endlocal
