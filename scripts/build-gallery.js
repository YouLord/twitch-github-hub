#!/usr/bin/env node
// Идея D: собирает статическую страницу галереи клипов → public/gallery.html
// Запуск: node scripts/build-gallery.js [--demo]
import fs from 'node:fs';
import path from 'node:path';
import { config, PUBLIC_DIR, parseRepo } from '../src/config.js';
import { getClips } from '../src/store.js';
import { renderGallery } from '../src/gallery.js';
import { MOCK_CLIPS } from '../src/mock.js';

const demoBuild = process.argv.includes('--demo');
const clips = getClips();
const list = clips.length ? clips : demoBuild ? MOCK_CLIPS : [];

const html = renderGallery(list, {
  channel: config.twitch.channel || 'your_channel',
  channelUrl: `https://twitch.tv/${config.twitch.channel || 'your_channel'}`,
  repoUrl: parseRepo()?.url || '',
  parents: config.gallery.parents,
  demo: demoBuild || (list.length > 0 && list.every((clip) => clip.demo)),
});

const out = path.join(PUBLIC_DIR, 'gallery.html');
fs.mkdirSync(PUBLIC_DIR, { recursive: true });
fs.writeFileSync(out, html, 'utf8');

console.log(`[gallery] собрано: ${path.relative(process.cwd(), out)} · клипов: ${list.length}`);
if (!list.length) {
  console.log('[gallery] клипов нет — страница покажет пустое состояние (это нормально на старте)');
}
