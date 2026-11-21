#!/usr/bin/env bash
# Помощник для заливки проекта на GitHub.
#
#   ./scripts/push-to-github.sh git@github.com:username/twitch-github-hub.git
#   ./scripts/push-to-github.sh https://github.com/username/twitch-github-hub.git
#   ./scripts/push-to-github.sh --create twitch-github-hub      # создать репо через gh CLI
#
# Что делает: git init (если нужно) → проверяет, что .env не попадёт в коммит →
# коммитит → добавляет remote → пушит в main.

set -euo pipefail

GREEN="$(printf '\033[0;32m')"; YELLOW="$(printf '\033[1;33m')"; RED="$(printf '\033[0;31m')"; NC="$(printf '\033[0m')"
info() { echo "${GREEN}▸${NC} $*"; }
warn() { echo "${YELLOW}!${NC} $*"; }
fail() { echo "${RED}✗${NC} $*" >&2; exit 1; }

REMOTE=""
CREATE_NAME=""
VISIBILITY="public"

if [ "${1:-}" = "--create" ]; then
  CREATE_NAME="${2:-twitch-github-hub}"
  VISIBILITY="${3:-public}"
else
  REMOTE="${1:-}"
fi

if [ -z "$REMOTE" ] && [ -z "$CREATE_NAME" ]; then
  cat <<'EOF'
Использование:
  ./scripts/push-to-github.sh git@github.com:USER/REPO.git
  ./scripts/push-to-github.sh --create REPO_NAME [public|private]
EOF
  exit 1
fi

cd "$(dirname "$0")/.."

command -v git >/dev/null || fail "git не установлен"

if [ ! -d .git ]; then
  info "git init (ветка main)"
  git init -b main >/dev/null
fi

# страховка: секреты не должны улететь в публичный репозиторий
if [ -f .env ] && [ -z "$(git check-ignore .env || true)" ]; then
  fail ".env не в .gitignore — добавь его, иначе токены уедут в репозиторий"
fi
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env уже отслеживается git: выполни 'git rm --cached .env' и закоммить"
fi

# git без настроенного автора не даст закоммитить — подставим локально
ensure_identity() {
  if [ -n "$(git config user.email 2>/dev/null || true)" ]; then return; fi
  local name=""
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    name="$(gh api user --jq .login 2>/dev/null || true)"
  fi
  if [ -z "$name" ] && [ -n "$REMOTE" ]; then
    name="$(printf '%s' "$REMOTE" | sed -n 's#.*github\.com[:/]\([^/]*\)/.*#\1#p')"
  fi
  [ -z "$name" ] && name="your-username"
  git config user.name "$name"
  git config user.email "${name}@users.noreply.github.com"
  warn "git-идентичность не настроена → поставил локально: $name <$name@users.noreply.github.com>"
  warn "поправить: git config user.name \"Имя\" && git config user.email \"почта@example.com\""
}

ensure_identity

if [ -n "$(git status --porcelain)" ]; then
  info "коммичу изменения"
  git add -A
  git commit -m "feat: twitch × github hub (оверлей, README-статус, бот, галерея клипов)" >/dev/null
else
  warn "нечего коммитить — рабочее дерево чистое"
fi

if [ -n "$CREATE_NAME" ]; then
  command -v gh >/dev/null || fail "gh CLI не найден. Установи: https://cli.github.com/"
  info "создаю репозиторий $CREATE_NAME ($VISIBILITY) через gh"
  gh repo create "$CREATE_NAME" "--$VISIBILITY" --source=. --remote=origin --push
else
  if git remote get-url origin >/dev/null 2>&1; then
    info "обновляю remote origin → $REMOTE"
    git remote set-url origin "$REMOTE"
  else
    info "добавляю remote origin → $REMOTE"
    git remote add origin "$REMOTE"
  fi
  info "пушу в main"
  git push -u origin main
fi

echo
info "готово 🎉  Дальше:"
echo "   1) в репозитории: Settings → Secrets and variables → Actions"
echo "      TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET (+ переменные TWITCH_CHANNEL, GALLERY_PARENTS)"
echo "   2) Settings → Pages → Source: GitHub Actions"
echo "   3) прочитать docs/DEPLOY.md"
