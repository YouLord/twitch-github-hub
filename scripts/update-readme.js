#!/usr/bin/env node
// Идея A: обновляет блок в README.md статусом эфира и статистикой GitHub.
// Запуск: node scripts/update-readme.js  (в Actions — по крону каждые 10 минут)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, config, hasTwitch, hasGithub, parseRepo } from '../src/config.js';
import { getChannelStatus } from '../src/twitch.js';
import { getRepoStats } from '../src/github.js';
import { getLiveSnapshot, saveLiveSnapshot } from '../src/store.js';

const README = path.join(ROOT, 'README.md');
const START = '<!-- TWITCH:START -->';
const END = '<!-- TWITCH:END -->';

const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Number(n) || 0);

function humanDuration(fromIso, toMs = Date.now()) {
  if (!fromIso) return '';
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return '';
  const minutes = Math.max(1, Math.round((toMs - start) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `${Math.floor(h / 24)} дн ${h % 24} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function relativeRu(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

/** Собирает markdown-блок между маркерами. */
export function buildLiveBlock({ channel, repo, lastSeen, demo = false, now = Date.now() }) {
  const lines = [];
  lines.push(START);
  lines.push('<!-- Блок обновляется автоматически: .github/workflows/twitch-live.yml -->');
  lines.push('');

  if (channel?.live) {
    const uptime = humanDuration(channel.startedAt, now);
    lines.push(`### 🔴 Сейчас в эфире · [${channel.displayName || channel.login}](${channel.url})`);
    lines.push('');
    lines.push(`> **${channel.title || 'Без названия'}**`);
    lines.push('>');
    lines.push(
      `> 🎮 ${channel.game || '—'} · 👀 ${fmt(channel.viewers)} зрителей${uptime ? ` · ⏱ в эфире ${uptime}` : ''}`,
    );
    lines.push('');
    lines.push(`**[▸ Смотреть стрим](${channel.url})**`);
  } else {
    lines.push(`### 💤 Офлайн`);
    lines.push('');
    const lastText = lastSeen?.stoppedAt
      ? `Последний раз в эфире: ${relativeRu(lastSeen.stoppedAt)}${lastSeen.title ? ` — «${lastSeen.title}»` : ''}`
      : 'Скоро вернусь в эфир — подписывайся, чтобы не пропустить.';
    lines.push(`> ${lastText}`);
    lines.push('>');
    lines.push(`> **[▸ Канал на Twitch](https://twitch.tv/${channel?.login || config.twitch.channel || ''})** · [Подписаться](https://twitch.tv/${channel?.login || config.twitch.channel || ''}/subscribe)`);
  }

  if (repo) {
    const activity = repo.activity || {};
    const last = activity.latestCommit;
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(
      `📦 **[${repo.fullName}](${repo.url})** · ⭐ ${fmt(repo.stars)} · 🍴 ${fmt(repo.forks)} · ` +
        `🐞 ${fmt(repo.openIssues)} issues · 🔀 ${fmt(repo.pullRequests?.count ?? 0)} PR` +
        (repo.language ? ` · ${repo.language}` : ''),
    );
    lines.push('');
    lines.push(
      `📊 За ${activity.windowHours ?? config.github.windowHours} ч: **${fmt(activity.commits)}** коммитов, ` +
        `**+${fmt(activity.additions)} / −${fmt(activity.deletions)}** строк` +
        (last ? ` · последний коммит ${relativeRu(last.date)}` : ''),
    );
    if (last) {
      lines.push('');
      lines.push(`\`${String(last.author)}: ${String(last.message).replace(/[`|]/g, '')}\``);
    }
  }

  if (demo) {
    lines.push('');
    lines.push('<!-- данные демо-режима: заполни секреты репозитория, чтобы включить живую статистику -->');
  }

  lines.push('');
  lines.push(END);
  return lines.join('\n');
}

/** Вставляет блок в README, сохраняя всё остальное. */
export function applyBlock(readmeText, block) {
  const startIndex = readmeText.indexOf(START);
  const endIndex = readmeText.indexOf(END);
  if (startIndex === -1 || endIndex === -1) return null;
  return readmeText.slice(0, startIndex) + block + readmeText.slice(endIndex + END.length);
}

async function main() {
  if (!fs.existsSync(README)) {
    console.error('README.md не найден');
    process.exit(1);
  }

  const readme = fs.readFileSync(README, 'utf8');
  const snapshot = getLiveSnapshot();
  let demo = true;
  let channel = null;
  let repo = null;

  if (hasTwitch()) {
    try {
      channel = await getChannelStatus();
      demo = false;
    } catch (error) {
      console.warn(`[readme] Twitch недоступен: ${error.message}`);
    }
  }

  if (hasGithub()) {
    try {
      repo = await getRepoStats();
      demo = false;
    } catch (error) {
      console.warn(`[readme] GitHub недоступен: ${error.message}`);
    }
  }

  if (demo && !channel && !repo) {
    console.warn('[readme] нет токенов — README не трогаю (заполни .env или секреты Actions)');
    process.exit(0);
  }

  // запоминаем, когда стрим закончился, чтобы в офлайне было «последний раз в эфире…»
  let lastSeen = snapshot?.lastSeen ?? null;
  if (channel?.live) {
    lastSeen = { stoppedAt: null, startedAt: channel.startedAt, title: channel.title, game: channel.game };
  } else if (channel && !channel.live) {
    const wasLive = snapshot?.channel?.live;
    if (wasLive) {
      lastSeen = {
        stoppedAt: snapshot.updatedAt || new Date().toISOString(),
        startedAt: snapshot.channel.startedAt,
        title: snapshot.channel.title,
        game: snapshot.channel.game,
      };
    }
  }

  const block = buildLiveBlock({ channel, repo, lastSeen, demo });
  const next = applyBlock(readme, block);

  if (next === null) {
    console.error(`В README.md нет маркеров ${START} … ${END}`);
    process.exit(1);
  }

  if (next === readme) {
    console.log('[readme] без изменений');
  } else {
    fs.writeFileSync(README, next, 'utf8');
    console.log('[readme] блок обновлён');
  }

  saveLiveSnapshot({
    updatedAt: new Date().toISOString(),
    demo,
    channel: channel ?? null,
    repo: repo
      ? { fullName: repo.fullName, stars: repo.stars, activity: repo.activity }
      : null,
    lastSeen,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[readme] ошибка: ${error.message}`);
    process.exit(1);
  });
}
