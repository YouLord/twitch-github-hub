// Простое JSON-хранилище: клипы (галерея) и последние события вебхука.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config, ensureDataDir } from './config.js';

const CLIPS_FILE = path.join(DATA_DIR, 'clips.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const LIVE_FILE = path.join(DATA_DIR, 'live.json');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[store] не смог прочитать ${path.basename(file)}: ${error.message}`);
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return value;
}

// ── Клипы ─────────────────────────────────────────────────────
export function getClips() {
  const data = readJson(CLIPS_FILE, { clips: [] });
  return Array.isArray(data.clips) ? data.clips : [];
}

export function saveClips(clips) {
  return writeJson(CLIPS_FILE, { updatedAt: new Date().toISOString(), clips });
}

/** Добавить клип (без дублей по id/slug). */
export function addClip(clip) {
  const clips = getClips();
  const key = clip.id || clip.slug;
  if (clips.some((item) => (item.id || item.slug) === key)) return clips;
  const next = [{ ...clip, addedAt: new Date().toISOString() }, ...clips].slice(
    0,
    Number(config.gallery.maxClips) || 60,
  );
  saveClips(next);
  return next;
}

export function removeClip(id) {
  const next = getClips().filter((item) => (item.id || item.slug) !== id);
  saveClips(next);
  return next;
}

// ── События GitHub (вебхук) ───────────────────────────────────
export function getEvents() {
  const data = readJson(EVENTS_FILE, { events: [] });
  return Array.isArray(data.events) ? data.events : [];
}

export function addEvent(event) {
  const next = [{ ...event, at: new Date().toISOString() }, ...getEvents()].slice(0, 50);
  try {
    writeJson(EVENTS_FILE, { events: next });
  } catch (error) {
    console.warn(`[store] не смог сохранить событие: ${error.message}`);
  }
  return next;
}

// ── Снимок live-статуса (пишет GitHub Action) ─────────────────
export function saveLiveSnapshot(snapshot) {
  return writeJson(LIVE_FILE, snapshot);
}

export function getLiveSnapshot() {
  return readJson(LIVE_FILE, null);
}
