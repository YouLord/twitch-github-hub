// Конфиг проекта. Читает .env (без зависимостей) + process.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');

function loadDotenv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadDotenv();

const env = (key, fallback = '') => {
  const value = process.env[key];
  return value === undefined || value === null ? fallback : String(value).trim() || fallback;
};
const num = (key, fallback) => {
  const parsed = Number(env(key, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  port: num('PORT', 8787),
  forceDemo: env('DEMO') === '1' || env('DEMO').toLowerCase() === 'true',
  twitch: {
    clientId: env('TWITCH_CLIENT_ID'),
    clientSecret: env('TWITCH_CLIENT_SECRET'),
    channel: env('TWITCH_CHANNEL').toLowerCase().replace(/^@/, ''),
    botUsername: env('TWITCH_BOT_USERNAME').toLowerCase(),
    botOauth: env('TWITCH_BOT_OAUTH'),
    userToken: env('TWITCH_USER_TOKEN'),
  },
  github: {
    repo: env('GITHUB_REPO'),
    token: env('GITHUB_TOKEN'),
    webhookSecret: env('GITHUB_WEBHOOK_SECRET'),
    windowHours: num('STATS_WINDOW_HOURS', 24),
  },
  gallery: {
    parents: env('GALLERY_PARENTS', 'localhost')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    maxClips: num('GALLERY_MAX_CLIPS', 60),
    publicUrl: env('GALLERY_PUBLIC_URL'),
  },
  overlay: {
    publicUrl: env('OVERLAY_PUBLIC_URL'),
  },
  bot: {
    cooldownSec: num('BOT_COOLDOWN_SEC', 10),
  },
};

export const hasTwitch = () => Boolean(config.twitch.clientId && config.twitch.clientSecret);
export const hasGithub = () => Boolean(config.github.repo);

/** Демо-режим: нет токенов или включён принудительно — отдаём мок-данные. */
export const isDemo = () => config.forceDemo || !hasTwitch() || !hasGithub();

/** 'owner/name' из разных вариантов записи. */
export function parseRepo(value = config.github.repo) {
  const cleaned = String(value)
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const [owner, name] = cleaned.split('/');
  if (!owner || !name) return null;
  return { owner, name, fullName: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` };
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}
