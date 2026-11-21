// Сборка статистики для оверлея/API: Twitch + GitHub + события, с кэшем и фолбэком на мок.
import { config, isDemo, hasTwitch, hasGithub } from './config.js';
import { getChannelStatus } from './twitch.js';
import { getRepoStats } from './github.js';
import { getEvents, getLiveSnapshot } from './store.js';
import { MOCK_STATS } from './mock.js';

const CACHE_MS = 20_000;
let cache = { at: 0, value: null, pending: null };

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`таймаут: ${label}`)), ms)),
  ]);
}

/** Живые данные. Ошибки отдельных источников не ломают ответ целиком. */
export async function collectLive() {
  const now = new Date().toISOString();
  const [channelRes, repoRes] = await Promise.allSettled([
    hasTwitch() ? withTimeout(getChannelStatus(), 8000, 'twitch') : Promise.reject(new Error('нет Twitch-кредов')),
    hasGithub() ? withTimeout(getRepoStats(), 12_000, 'github') : Promise.reject(new Error('нет GITHUB_REPO')),
  ]);

  const channel =
    channelRes.status === 'fulfilled' ? channelRes.value : MOCK_STATS.channel;
  const repo = repoRes.status === 'fulfilled' ? repoRes.value : MOCK_STATS.repo;

  if (channelRes.status === 'rejected') console.warn(`[stats] Twitch: ${channelRes.reason.message}`);
  if (repoRes.status === 'rejected') console.warn(`[stats] GitHub: ${repoRes.reason.message}`);

  return {
    demo: channelRes.status === 'rejected' || repoRes.status === 'rejected',
    partial:
      channelRes.status === 'rejected' ? ['twitch'] : repoRes.status === 'rejected' ? ['github'] : [],
    updatedAt: now,
    channel,
    repo: {
      ...repo,
      activity: repo.activity ?? MOCK_STATS.repo.activity,
      pullRequests: repo.pullRequests ?? MOCK_STATS.repo.pullRequests,
    },
    events: getEvents().slice(0, 5).length ? getEvents().slice(0, 5) : MOCK_STATS.events,
  };
}

/** Кэшированный снапшот для оверлея (чтобы OBS не долбил API каждую секунду). */
export async function getStats({ force = false } = {}) {
  if (isDemo()) {
    return {
      ...MOCK_STATS,
      demo: true,
      updatedAt: new Date().toISOString(),
      events: [...getEvents().slice(0, 5), ...MOCK_STATS.events].slice(0, 5),
      snapshot: getLiveSnapshot(),
      config: { channel: config.twitch.channel || MOCK_STATS.channel.login, repo: config.github.repo || MOCK_STATS.repo.fullName },
    };
  }

  const fresh = Date.now() - cache.at < CACHE_MS;
  if (!force && fresh && cache.value) return cache.value;
  if (cache.pending) return cache.pending;

  cache.pending = collectLive()
    .then((value) => {
      cache = { at: Date.now(), value, pending: null };
      return value;
    })
    .catch((error) => {
      cache.pending = null;
      if (cache.value) return cache.value;
      throw error;
    });

  return cache.pending;
}

export function invalidateStats() {
  cache = { at: 0, value: null, pending: null };
}

/** Только live-статус канала (для бота). */
export async function getChannelQuick() {
  if (!hasTwitch()) return MOCK_STATS.channel;
  try {
    return await withTimeout(getChannelStatus(), 8000, 'twitch');
  } catch {
    return MOCK_STATS.channel;
  }
}
