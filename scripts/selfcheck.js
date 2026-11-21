#!/usr/bin/env node
// Быстрая самопроверка без сети и без токенов: парсинг IRC, подпись вебхука,
// формат событий, рендер галереи, сборка README-блока.
import assert from 'node:assert/strict';
import { parseLine } from '../src/irc.js';
import { verifySignature, formatEvent, eventToChatText } from '../src/webhook.js';
import { renderGallery } from '../src/gallery.js';
import { buildLiveBlock, applyBlock } from './update-readme.js';
import { MOCK_CLIPS, MOCK_STATS } from '../src/mock.js';
import crypto from 'node:crypto';

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push({ ok: true, name });
  } catch (error) {
    results.push({ ok: false, name, error: error.message });
  }
};

test('IRC: парсит PRIVMSG с тегами', () => {
  const line =
    '@badge-info=;badges=broadcaster/1;display-name=Streamer;mod=0;room-id=123;user-id=123;vip=0 ' +
    ':streamer!streamer@streamer.tmi.twitch.tv PRIVMSG #streamer :!gh';
  const msg = parseLine(line);
  assert.equal(msg.isMessage, true);
  assert.equal(msg.user, 'streamer');
  assert.equal(msg.displayName, 'Streamer');
  assert.equal(msg.text, '!gh');
  assert.equal(msg.isBroadcaster, true);
});

test('IRC: парсит модератора и обычного зрителя', () => {
  const mod = parseLine('@mod=1;display-name=Mod :mod!mod@mod.tmi.twitch.tv PRIVMSG #chan :!stats');
  assert.equal(mod.isMod, true);
  const viewer = parseLine('@mod=0;display-name=Вася :v@v.tmi.twitch.tv PRIVMSG #chan :привет');
  assert.equal(viewer.isBroadcaster, false);
  assert.equal(viewer.text, 'привет');
});

test('IRC: PING не считается сообщением', () => {
  const ping = parseLine('PING :tmi.twitch.tv');
  assert.equal(ping.isMessage, false);
  assert.equal(ping.command, 'PING');
});

test('Webhook: подпись sha256 проверяется', () => {
  const secret = 's3cret';
  const body = Buffer.from(JSON.stringify({ hello: 'world' }));
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifySignature(body, good, secret).ok, true);
  assert.equal(verifySignature(body, good, 'wrong').ok, false);
  assert.equal(verifySignature(body, undefined, secret).ok, false);
});

test('Webhook: push превращается в сообщение чата', () => {
  const event = formatEvent('push', {
    ref: 'refs/heads/main',
    pusher: { name: 'octocat' },
    compare: 'https://github.com/o/r/compare/a...b',
    repository: { full_name: 'o/r', html_url: 'https://github.com/o/r' },
    commits: [{ message: 'feat: overlay' }, { message: 'fix: typo' }],
  });
  assert.ok(event);
  assert.match(eventToChatText(event), /octocat запушил в main/);
  assert.match(eventToChatText(event), /\(\+1\)/);
});

test('Webhook: PR, релиз и звезда форматируются', () => {
  const pr = formatEvent('pull_request', {
    action: 'opened',
    pull_request: { number: 7, title: 'feat: bot', user: { login: 'dev' }, html_url: 'https://x/7' },
    repository: { full_name: 'o/r', html_url: 'https://github.com/o/r' },
  });
  assert.match(pr.text, /Новый PR #7/);

  const release = formatEvent('release', {
    action: 'published',
    release: { tag_name: 'v1.0.0', name: 'v1.0.0', html_url: 'https://x/rel' },
    repository: { full_name: 'o/r' },
  });
  assert.match(release.text, /Релиз v1\.0\.0/);

  const star = formatEvent('watch', {
    action: 'started',
    sender: { login: 'fan' },
    repository: { full_name: 'o/r', html_url: 'https://github.com/o/r', stargazers_count: 100 },
  });
  assert.match(star.text, /fan поставил звезду/);

  assert.equal(formatEvent('deployment_status', {}), null);
});

test('Галерея: рендерится с карточками и без внешних ресурсов', () => {
  const html = renderGallery(MOCK_CLIPS, { channel: 'test', parents: ['localhost'], demo: true });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /DEMO/);
  assert.equal((html.match(/class="card"/g) || []).length, MOCK_CLIPS.length);
  assert.ok(!html.includes('<link rel="stylesheet"'), 'не должно быть внешних стилей');
});

test('Галерея: пустое состояние с подсказкой !clip', () => {
  const html = renderGallery([], { channel: 'test' });
  assert.match(html, /Пока пусто/);
  assert.match(html, /!clip/);
});

test('README: блок вставляется между маркерами и обновляется', () => {
  const block = buildLiveBlock({
    channel: { ...MOCK_STATS.channel, live: true, startedAt: new Date(Date.now() - 3600e3).toISOString() },
    repo: MOCK_STATS.repo,
    demo: true,
  });
  const readme = `# Заголовок\n\n<!-- TWITCH:START -->\nстарое\n<!-- TWITCH:END -->\n\n## Дальше\n`;
  const next = applyBlock(readme, block);
  assert.ok(next);
  assert.match(next, /Сейчас в эфире/);
  assert.match(next, /## Дальше/);
  assert.ok(!next.includes('старое'));
});

test('README: офлайн-вариант с lastSeen', () => {
  const block = buildLiveBlock({
    channel: { ...MOCK_STATS.channel, live: false },
    repo: MOCK_STATS.repo,
    lastSeen: { stoppedAt: new Date(Date.now() - 3 * 3600e3).toISOString(), title: 'Вчерашний стрим' },
  });
  assert.match(block, /Офлайн/);
  assert.match(block, /Последний раз в эфире/);
});

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  console.log(`${item.ok ? '✅' : '❌'} ${item.name}${item.ok ? '' : `\n   → ${item.error}`}`);
}
console.log(`\n${results.length - failed.length}/${results.length} проверок прошло`);
process.exit(failed.length ? 1 : 0);
