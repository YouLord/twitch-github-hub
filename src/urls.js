// Ссылки, которые бот кидает в чат.
import { config } from './config.js';

/** Публичный адрес галереи: GALLERY_PUBLIC_URL (GitHub Pages) или локальный сервер. */
export function getGalleryUrl() {
  if (config.gallery.publicUrl) return config.gallery.publicUrl;
  return `http://localhost:${config.port}/gallery`;
}

/** Публичный адрес оверлея (для OBS). */
export function getOverlayUrl() {
  if (config.overlay.publicUrl) return config.overlay.publicUrl;
  return `http://localhost:${config.port}/overlay`;
}
