# twitch-github-hub

**Четыре полезные штуки на стыке Twitch и GitHub — в одном репозитории, без единой зависимости.**

[![License: MIT](https://img.shields.io/badge/license-MIT-9146ff.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-3ddc97.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![Twitch](https://img.shields.io/badge/Twitch-Helix-9146ff.svg)](https://dev.twitch.tv/docs/api/)

> Работает без токенов в демо-режиме с мок-данными — можно пощупать до подключения API.

<!-- TWITCH:START -->
<!-- Блок обновляется автоматически: .github/workflows/twitch-live.yml -->

### 🔴 Сейчас в эфире · [Your Channel](https://twitch.tv/your_channel)

> **Пишу GitHub-интеграцию для стрима | !gh !stats !clip**
>
> 🎮 Software and Game Development · 👀 1 284 зрителей · ⏱ в эфире 2 ч 14 мин

**[▸ Смотреть стрим](https://twitch.tv/your_channel)**

---

📦 **[octocat/Hello-World](https://github.com/octocat/Hello-World)** · ⭐ 2 741 · 🍴 1 380 · 🐞 12 issues · 🔀 3 PR · TypeScript

📊 За 24 ч: **17** коммитов, **+1 462 / −318** строк · последний коммит 4 мин назад

`octocat: feat(overlay): плавная анимация счётчиков`

<!-- данные демо-режима: заполни секреты репозитория, чтобы включить живую статистику -->

<!-- TWITCH:END -->

---

## Что внутри

| # | Фича | Что делает | Где живёт |
|---|------|-----------|-----------|
| **A** | 🔴 Live-бейдж в README | GitHub Action каждые 10 минут проверяет эфир и переписывает блок выше: название стрима, игра, зрители, аптайм. В офлайне — «последний раз в эфире…» | `.github/workflows/twitch-live.yml` |
| **B** | 🖥️ Оверлей для OBS | Browser Source с живой статистикой репозитория: коммиты за 24 ч, ±строки, звёзды, PR, последний коммит | `public/overlay.html` + `/api/stats` |
| **C** | 🤖 Бот GitHub → чат | Вебхук GitHub присылает событие (PR, релиз, звезда, CI) → бот пишет в Twitch-чат. Плюс команды `!gh`, `!stats`, `!live`, `!clip`, `!clips` | `src/irc.js`, `src/webhook.js`, `src/commands.js` |
| **D** | 🎬 Галерея клипов | Зрители пишут `!clip` → клип попадает в `data/clips.json` → GitHub Pages пересобирает страницу «Highlights» | `src/gallery.js`, `.github/workflows/pages.yml` |

Ноль зависимостей: только стандартная библиотека Node ≥ 20 (`fetch`, `tls`, `http`, `crypto`). Никаких `node_modules`, никаких сюрпризов при деплое.

## Быстрый старт

```bash
git clone https://github.com/USERNAME/twitch-github-hub.git
cd twitch-github-hub

cp .env.example .env      # вписать токены (или оставить пустым — будет демо)
npm run demo              # демо-режим с мок-данными
# или
npm start                 # с реальными данными
```

Открыть:

| Что | Адрес |
|---|---|
| Оверлей | http://localhost:8787/overlay |
| Галерея клипов | http://localhost:8787/gallery |
| Статистика (JSON) | http://localhost:8787/api/stats |
| Сервисная страница | http://localhost:8787/ |

### Оверлей в OBS

1. Sources → **+** → **Browser**
2. URL: `http://localhost:8787/overlay`
3. Ширина `500`, высота `320` (прозрачный фон уже включён)
4. Параметры в URL: `?accent=00e5ff&scale=0.9&compact=1`
5. Если оверлей открыт с GitHub Pages, укажи `?api=https://<твой-сервер>/api/stats` — иначе будут демо-данные

Обновляется само каждые 30 секунд, ничего перезапускать не нужно.

## Токены

### Twitch

1. [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) → **Register Your Application**
2. OAuth Redirect URL: `http://localhost:8787` · Category: *Application Integration*
3. Скопируй **Client ID** и **Client Secret** в `.env`
4. `TWITCH_CHANNEL` — логин канала без `@`

Для бота нужен ещё отдельный аккаунт бота и OAuth-токен чата (`chat:read chat:edit`) — например с [twitchtokengenerator.com](https://twitchtokengenerator.com). Для `!clip` (создание клипа) — `TWITCH_USER_TOKEN` самого стримера со scope `clips:edit`.

### GitHub

1. [Personal access token](https://github.com/settings/tokens) → classic, scope `public_repo` (или fine-grained: *Contents: Read*, *Pull requests: Read*)
2. `GITHUB_REPO=owner/name` — репозиторий, чью статистику показываем
3. `GITHUB_WEBHOOK_SECRET` — любая длинная строка

> Без токена GitHub API отдаёт 60 запросов/час на IP. С токеном — 5000/час.

## Команды бота

| Команда | Что отвечает |
|---|---|
| `!gh` / `!repo` | ссылка на репозиторий, звёзды, открытые PR |
| `!stats` | коммиты и `+/−` строк за окно (по умолчанию 24 ч) |
| `!live` | что сейчас в эфире или приглашение на канал |
| `!clip` | создаёт клип текущего момента и добавляет в галерею |
| `!clip https://clips.twitch.tv/...` | сохраняет чужой клип в галерею |
| `!clips` | ссылка на галерею |
| `!help` | список команд |

Антиспам: общий кулдаун `BOT_COOLDOWN_SEC` (по умолчанию 10 с), у `!clip` — 15 с, персональный кулдаун на ссылки — 20 с.

## Вебхук GitHub → чат

Сервер должен быть доступен из интернета. Локально — через `ngrok`:

```bash
ngrok http 8787
# затем: GitHub → репозиторий → Settings → Webhooks → Add webhook
#   Payload URL: https://<ngrok-домен>/webhook
#   Content type: application/json
#   Secret: тот же, что GITHUB_WEBHOOK_SECRET
#   Events: Pushes, Pull requests, Pull request reviews, Issues, Releases, Stars, Forks, Workflow runs
```

Проверить локально без GitHub:

```bash
BODY='{"action":"published","release":{"tag_name":"v1.0.0","name":"v1.0.0","html_url":"https://github.com/o/r/releases"},"repository":{"full_name":"o/r","html_url":"https://github.com/o/r"}}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/^.* //')"
curl -s -X POST http://localhost:8787/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: release' \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

Без `GITHUB_WEBHOOK_SECRET` подпись не проверяется (удобно для отладки, плохо для продакшена).

## Автоматизация

```bash
npm run update:readme    # обновить блок в README (используется в Actions)
npm run build:gallery    # пересобрать public/gallery.html
npm run selfcheck        # 10 проверок без сети: IRC-парсер, HMAC, события, рендер
```

## Windows: залить одним двойным кликом

В корне проекта лежат два `.bat` — можно вообще не открывать консоль:

| Файл | Что делает |
|---|---|
| **`push-to-github.bat`** | `git init` → коммит → push в `https://github.com/YouLord/twitch-github-hub.git`. Проверяет, что `.env` не утечёт, при первом пуше открывает окно входа GitHub, а если логин не проходит — спрашивает токен и пушит с ним (никуда его не сохраняя) |
| **`run-local.bat`** | запускает сервер, создаёт `.env` из `.env.example`, открывает браузер на `localhost:8787` |

Порядок: двойной клик по `push-to-github.bat` → дождаться строки **ГОТОВО** → `Enter`. Скрипт печатает, что осталось включить в настройках репозитория. Если репозиторий не твой — поменяй `REPO_URL` и `GH_USER` в первых строках файла.

## Деплой

Полная пошаговая инструкция со всеми командами git — в [docs/DEPLOY.md](docs/DEPLOY.md). Коротко:

```bash
./scripts/push-to-github.sh git@github.com:USERNAME/twitch-github-hub.git
```

Дальше в настройках репозитория:

1. **Settings → Secrets and variables → Actions**: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (secrets), `TWITCH_CHANNEL`, `GALLERY_PARENTS` (variables)
2. **Settings → Pages → Source: GitHub Actions** — галерея поедет на `https://USERNAME.github.io/twitch-github-hub/`
3. Бот и вебхук живут на любом постоянно работающем хосте (VPS, Railway, Fly.io) — см. доки

## Структура

```
.
├── src/
│   ├── config.js      # чтение .env без зависимостей
│   ├── twitch.js      # Helix API: эфир, клипы, создание клипа
│   ├── github.js      # REST API: репо, коммиты, ±строки, PR
│   ├── stats.js       # агрегация + кэш 20 с
│   ├── irc.js         # Twitch-чат по IRC-over-TLS (свой парсер)
│   ├── commands.js    # команды бота
│   ├── webhook.js     # HMAC-подпись + формат событий
│   ├── gallery.js     # генератор страницы галереи
│   ├── server.js      # HTTP-сервер, роуты, статика
│   └── mock.js        # демо-данные
├── public/            # оверлей, лендинг, собранная галерея
├── scripts/           # update-readme, build-gallery, selfcheck, push-to-github
├── data/              # clips.json, live.json (генерируются)
├── .github/workflows/ # twitch-live.yml, pages.yml
├── push-to-github.bat # Windows: залить на GitHub двойным кликом
├── run-local.bat      # Windows: запустить сервер двойным кликом
└── docs/DEPLOY.md     # пошаговый деплой
```

## Частые проблемы

<details>
<summary>Оверлей пустой / «demo data» в углу</summary>

Сервер не отдаёт живые данные: проверь `.env` (Twitch ID/Secret и `GITHUB_REPO`) и `curl localhost:8787/healthz`.
</details>

<details>
<summary>Бот подключается, но не отвечает</summary>

Логин бота должен совпадать с владельцем OAuth-токена, токен — с префиксом `oauth:` или без (оба варианта принимаются). Twitch отвечает `Login authentication failed` при протухшем токене — перегенерируй.
</details>

<details>
<summary>Action не коммитит README</summary>

Проверь **Settings → Actions → General → Workflow permissions: Read and write**. Крон на бесплатном плане может срабатывать с задержкой 5–15 минут — это нормально.
</details>

<details>
<summary>Клипы в галерее не проигрываются</summary>

Twitch-плееру нужен домен в `parent`. Для Pages: `GALLERY_PARENTS=USERNAME.github.io`, можно перечислить через запятую несколько доменов.
</details>

## Лицензия

[MIT](LICENSE) © 2026 Twitch GitHub Hub contributors — меняй, форкай, используй на своём стриме. Если хочешь указать себя в копирайте, поправь `LICENSE`.

Не связан с Twitch Interactive, Inc. и GitHub, Inc.
