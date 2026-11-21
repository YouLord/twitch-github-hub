// Единый сервер: API для оверлея, галерея, приём GitHub-вебхуков и чат-бот.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config, isDemo, hasTwitch, PUBLIC_DIR, parseRepo } from './config.js';
import { getStats, invalidateStats, getChannelQuick } from './stats.js';
import { getClips, addClip, getEvents, addEvent } from './store.js';
import { renderGallery } from './gallery.js';
import { verifySignature, formatEvent, eventToChatText } from './webhook.js';
import { TwitchChat } from './irc.js';
import { createCommandHandler } from './commands.js';
import { MOCK_CLIPS } from './mock.js';
import { getGalleryUrl } from './urls.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const json = (res, status, data) => {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

const html = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
};

function serveStatic(res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('тело запроса слишком большое'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Чат-бот ────────────────────────────────────────────────────
const chat = new TwitchChat({
  username: config.twitch.botUsername,
  oauth: config.twitch.botOauth,
  channel: config.twitch.channel,
  onMessage: null,
});
const handleCommand = createCommandHandler({ say: (text) => chat.say(text) });
chat.onMessage = (message) => handleCommand(message);

// ── Роутер ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Hub-Signature-256,X-GitHub-Event',
    });
    res.end();
    return;
  }

  try {
    // ── страницы ──
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      if (serveStatic(res, 'index.html')) return;
      return html(res, 200, '<h1>twitch-github-hub</h1>');
    }

    if (req.method === 'GET' && pathname === '/overlay') {
      if (serveStatic(res, 'overlay.html')) return;
      return html(res, 404, 'нет public/overlay.html');
    }

    if (req.method === 'GET' && (pathname === '/gallery' || pathname === '/gallery.html')) {
      const clips = isDemo() && !getClips().length ? MOCK_CLIPS : getClips();
      const repo = parseRepo();
      return html(
        res,
        200,
        renderGallery(clips, {
          channel: config.twitch.channel || 'your_channel',
          channelUrl: `https://twitch.tv/${config.twitch.channel || 'your_channel'}`,
          repoUrl: repo?.url || '',
          parents: config.gallery.parents,
          demo: isDemo(),
        }),
      );
    }

    // ── API ──
    if (req.method === 'GET' && pathname === '/api/stats') {
      const force = url.searchParams.get('force') === '1';
      return json(res, 200, await getStats({ force }));
    }

    if (req.method === 'GET' && pathname === '/api/live') {
      return json(res, 200, { updatedAt: new Date().toISOString(), channel: await getChannelQuick() });
    }

    if (req.method === 'GET' && pathname === '/api/clips') {
      return json(res, 200, {
        updatedAt: new Date().toISOString(),
        demo: isDemo(),
        clips: isDemo() && !getClips().length ? MOCK_CLIPS : getClips(),
      });
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      return json(res, 200, { events: getEvents() });
    }

    if (req.method === 'POST' && pathname === '/api/clips') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.id) return json(res, 400, { error: 'нужен id клипа' });
      const clips = addClip(body);
      return json(res, 201, { ok: true, count: clips.length });
    }

    if (req.method === 'GET' && pathname === '/healthz') {
      return json(res, 200, {
        ok: true,
        demo: isDemo(),
        bot: chat.configured ? (chat.connected ? 'connected' : 'connecting') : 'not-configured',
        gallery: getGalleryUrl(),
        uptime: Math.round(process.uptime()),
      });
    }

    // ── GitHub webhook → Twitch-чат ──
    if (req.method === 'POST' && pathname === '/webhook') {
      const raw = await readBody(req);
      const signature = req.headers['x-hub-signature-256'];
      if (!verifySignature(raw, signature, config.github.webhookSecret).ok) {
        console.warn('[webhook] отклонено: подпись не совпала');
        return json(res, 401, { error: 'bad signature' });
      }

      const eventName =
        req.headers['x-github-event'] || url.searchParams.get('event') || 'unknown';
      let payload = {};
      try {
        payload = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        return json(res, 400, { error: 'bad json' });
      }

      const event = formatEvent(eventName, payload);
      if (!event) return json(res, 200, { ok: true, skipped: `событие "${eventName}" не показываем` });

      addEvent({ id: `${eventName}-${Date.now()}`, ...event });
      invalidateStats();

      const text = eventToChatText(event, { withRepo: true });
      const delivered = chat.say(text);
      console.log(`[webhook] ${eventName}: ${event.text}`);

      return json(res, 200, { ok: true, event, sentToChat: delivered });
    }

    // ── статика ──
    if (req.method === 'GET' && serveStatic(res, pathname)) return;

    return json(res, 404, { error: 'not found', path: pathname });
  } catch (error) {
    console.error(`[server] ${req.method} ${pathname}: ${error.message}`);
    return json(res, 500, { error: error.message });
  }
});

server.listen(config.port, '0.0.0.0', () => {
  const base = `http://localhost:${config.port}`;
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │        twitch-github-hub is running         │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log(`  Оверлей для OBS : ${base}/overlay`);
  console.log(`  Галерея клипов  : ${base}/gallery`);
  console.log(`  API статистики  : ${base}/api/stats`);
  console.log(`  Вебхук GitHub   : POST ${base}/webhook`);
  console.log(`  Режим           : ${isDemo() ? 'ДЕМО (мок-данные)' : 'живые данные'}`);
  if (isDemo()) {
    console.log('  → заполни .env (cp .env.example .env), чтобы включить реальные данные');
  }
  console.log('');

  if (hasTwitch() && chat.configured) {
    chat.connect();
  } else {
    console.log('  [chat] бот не запущен — нет TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[server] останавливаюсь…');
    chat.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}
