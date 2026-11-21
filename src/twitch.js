// Минимальный клиент Twitch Helix API (app access token + опциональный user token).
import { config } from './config.js';

const HELIX = 'https://api.twitch.tv/helix';

let appTokenCache = { token: '', expiresAt: 0 };

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = body?.message || body?.error || response.statusText;
    const error = new Error(`Twitch API ${response.status}: ${message}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

/** App access token (client_credentials), кэшируется до истечения. */
export async function getAppToken() {
  const now = Date.now();
  if (appTokenCache.token && appTokenCache.expiresAt - 60_000 > now) return appTokenCache.token;

  const params = new URLSearchParams({
    client_id: config.twitch.clientId,
    client_secret: config.twitch.clientSecret,
    grant_type: 'client_credentials',
  });
  const body = await httpJson(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
  appTokenCache = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return appTokenCache.token;
}

async function helix(pathname, { params = {}, method = 'GET', userToken = '', body = null } = {}) {
  const token = userToken || (await getAppToken());
  const url = new URL(`${HELIX}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const doRequest = (bearer) =>
    httpJson(url, {
      method,
      headers: {
        'Client-Id': config.twitch.clientId,
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  try {
    return await doRequest(token);
  } catch (error) {
    // токен мог протухнуть — сбрасываем кэш и пробуем один раз ещё
    if (error.status === 401 && !userToken) {
      appTokenCache = { token: '', expiresAt: 0 };
      return doRequest(await getAppToken());
    }
    throw error;
  }
}

/** Пользователь по логину. */
export async function getUser(login = config.twitch.channel) {
  const data = await helix('/users', { params: { login } });
  return data?.data?.[0] ?? null;
}

/** Текущий стрим канала или null, если офлайн. */
export async function getStream(login = config.twitch.channel) {
  const data = await helix('/streams', { params: { user_login: login } });
  return data?.data?.[0] ?? null;
}

/** Свежий клип канала. */
export async function getLatestClip(broadcasterId, { first = 1 } = {}) {
  const data = await helix('/clips', {
    params: { broadcaster_id: broadcasterId, first, sort: 'desc' },
  });
  const clips = data?.data ?? [];
  return first === 1 ? clips[0] ?? null : clips;
}

/** Клип по id/slug. */
export async function getClipById(id) {
  const clean = String(id).trim().replace(/^https?:\/\/clips\.twitch\.tv\//i, '').split('?')[0];
  const data = await helix('/clips', { params: { id: clean } });
  return data?.data?.[0] ?? null;
}

/**
 * Создать клип прямо сейчас — нужен user token стримера (scope clips:edit).
 * Без user token бросает ошибку с понятным текстом.
 */
export async function createClip(broadcasterId) {
  if (!config.twitch.userToken) {
    throw new Error('нужен TWITCH_USER_TOKEN стримера (scope clips:edit)');
  }
  const data = await helix('/clips', {
    method: 'POST',
    params: { broadcaster_id: broadcasterId },
    userToken: config.twitch.userToken,
  });
  const created = data?.data?.[0];
  if (!created?.id) throw new Error('Twitch не вернул id клипа');
  const editUrl = `https://clips.twitch.tv/edit/${created.id}`;
  return {
    id: created.id,
    edit_url: created.edit_url || editUrl,
    url: editUrl,
  };
}

/** Готовый объект «состояния канала». */
export async function getChannelStatus() {
  const stream = await getStream();
  if (!stream) {
    const user = await getUser();
    return {
      live: false,
      login: config.twitch.channel,
      displayName: user?.display_name || config.twitch.channel,
      avatar: user?.profile_image_url || '',
      title: '',
      game: '',
      viewers: 0,
      startedAt: null,
      url: `https://twitch.tv/${config.twitch.channel}`,
    };
  }
  return {
    live: true,
    login: stream.user_login,
    displayName: stream.user_name,
    avatar: '',
    title: stream.title,
    game: stream.game_name,
    viewers: stream.viewer_count,
    startedAt: stream.started_at,
    thumbnail: (stream.thumbnail_url || '').replace('{width}', '640').replace('{height}', '360'),
    url: `https://twitch.tv/${stream.user_login}`,
  };
}
