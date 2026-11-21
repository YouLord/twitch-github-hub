# Деплой: от папки до работающего стрима

Инструкция рассчитана на то, что ты впервые заливаешь проект. Все команды — в консоли (Terminal / Git Bash / PowerShell).

## 0. Что понадобится

- [git](https://git-scm.com/downloads) (`git --version`)
- [Node.js ≥ 20](https://nodejs.org) (`node -v`)
- аккаунт GitHub
- приложение в [Twitch Dev Console](https://dev.twitch.tv/console/apps)

---

## 1. Проверить локально

```bash
cd twitch-github-hub
cp .env.example .env      # Windows: copy .env.example .env
npm run selfcheck         # 10 офлайн-проверок — должно быть 10/10
npm run demo              # http://localhost:8787/overlay
```

Останавливается через `Ctrl+C`.

---

## 2. Залить на GitHub

### Вариант 0 — Windows: двойной клик (самый простой)

1. Установи [Git for Windows](https://git-scm.com/download/win) и [Node.js LTS](https://nodejs.org/ru), если ещё нет.
2. Двойной клик по **`push-to-github.bat`** в папке проекта.
3. Скрипт сам: сделает `git init`, проверит `.env`, закоммитит, добавит `origin`
   `https://github.com/YouLord/twitch-github-hub.git` и запушит в `main`.
4. Если Git попросит логин — войди в браузере. Если попросит токен — создай
   [здесь](https://github.com/settings/tokens/new?scopes=repo) с галочкой `repo` и вставь в консоль.
5. Дождись **ГОТОВО** и нажми `Enter`.

Логично, что рядом лежит `run-local.bat` — он поднимает сервер локально и открывает оверлей в браузере.

### Вариант А — автоматический скрипт (проще)

Сначала создай пустой репозиторий на GitHub (без README, без .gitignore — они уже есть), потом:

```bash
./scripts/push-to-github.sh git@github.com:USERNAME/twitch-github-hub.git
```

Если есть [gh CLI](https://cli.github.com/), можно вообще без создания репозитория руками:

```bash
./scripts/push-to-github.sh --create twitch-github-hub public
```

### Вариант Б — руками, по шагам

```bash
git init -b main
git status                       # убедись, что .env НЕ в списке файлов
git add -A
git commit -m "feat: twitch × github hub"
git remote add origin git@github.com:USERNAME/twitch-github-hub.git
git branch -M main
git push -u origin main
```

Если раньше пушил по HTTPS:

```bash
git remote set-url origin https://github.com/USERNAME/twitch-github-hub.git
```

**Проверка, что секреты не утекли:**

```bash
git ls-files | grep -x ".env" && echo "ПЛОХО: .env в индексе" || echo "ок: .env не отслеживается"
```

Если `.env` всё-таки попал в коммит:

```bash
git rm --cached .env
git commit -m "chore: убрать .env из репозитория"
git push
# и сразу перегенерируй все токены — они уже в истории
```

---

## 3. Секреты и переменные Actions

GitHub → репозиторий → **Settings → Secrets and variables → Actions**

**Secrets** (зашифрованы):

| Имя | Значение |
|---|---|
| `TWITCH_CLIENT_ID` | из Twitch Dev Console |
| `TWITCH_CLIENT_SECRET` | из Twitch Dev Console |
| `GITHUB_WEBHOOK_SECRET` | если вебхук используешь (опционально) |

**Variables** (открытые):

| Имя | Значение |
|---|---|
| `TWITCH_CHANNEL` | логин канала, например `your_channel` |
| `GALLERY_PARENTS` | `USERNAME.github.io` (для плейлиста клипов) |

Ещё нужно: **Settings → Actions → General → Workflow permissions → Read and write permissions** (иначе Action не сможет коммитить README).

Запустить вручную, чтобы сразу проверить: **Actions → Twitch live → README → Run workflow**.

---

## 4. Галерея на GitHub Pages

1. **Settings → Pages → Source: GitHub Actions**
2. **Actions → Галерея клипов → GitHub Pages → Run workflow**
3. Через минуту страница: `https://USERNAME.github.io/twitch-github-hub/`
4. В `.env` / переменных пропиши `GALLERY_PUBLIC_URL=https://USERNAME.github.io/twitch-github-hub/gallery` — эту ссылку бот кидает в чат по `!clips`

Обновление страницы происходит автоматически, когда меняется `data/clips.json`.

---

## 5. Бот и вебхук (нужен постоянный хост)

Локальный ноутбук не годится: бот должен быть онлайн круглосуточно. Три бесплатных варианта.

### VPS + systemd (надёжнее всего)

```bash
# на сервере
sudo apt update && sudo apt install -y git
git clone https://github.com/USERNAME/twitch-github-hub.git /opt/twitch-hub
cd /opt/twitch-hub
cp .env.example .env && nano .env      # заполнить токены
sudo tee /etc/systemd/system/twitch-hub.service > /dev/null <<'EOF'
[Unit]
Description=twitch-github-hub
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/twitch-hub
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/twitch-hub/.env

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now twitch-hub
sudo journalctl -u twitch-hub -f         # логи
```

### Railway / Fly.io / Render

- Start command: `node src/server.js`
- Порт берётся из `PORT` (Railway сам его подставляет)
- Все переменные из `.env.example` — в панель Environment
- После деплоя проверь `https://<домен>/healthz`

### Локально + ngrok (только для теста вебхука)

```bash
npm start
ngrok http 8787
```

Вебхук в GitHub: `https://<ngrok>/webhook`, content type `application/json`, секрет из `.env`, события — Pushes, PR, Reviews, Issues, Releases, Stars, Forks, Workflow runs.

---

## 6. OBS

1. **Sources → + → Browser**
2. URL: `https://<твой домен>/overlay` (или `http://localhost:8787/overlay` при локальном запуске)
3. Width `500`, Height `320`, «Shutdown source when not visible» — **выключить**
4. Custom CSS не нужен: фон прозрачный, стили встроены

Кастомизация: `?accent=00e5ff`, `?scale=0.85`, `?compact=1`, `?refresh=15`.

> Если открываешь оверлей с GitHub Pages (без своего сервера), добавь `?api=https://<твой-сервер>/api/stats`,
> иначе страница покажет демо-данные: статичному хостингу неоткуда взять живую статистику.

---

## 7. Чек-лист перед стримом

- [ ] `npm run selfcheck` — 10/10
- [ ] `curl -s localhost:8787/healthz` → `"bot": "connected"`
- [ ] В чате `!gh`, `!stats`, `!clip` — отвечают
- [ ] Оверлей в OBS показывает реальные цифры (без «demo data»)
- [ ] Тестовый PR → сообщение в чате
- [ ] Pages открывается, клипы играют
- [ ] `.env` не в репозитории
