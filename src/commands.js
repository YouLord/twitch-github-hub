// Команды чат-бота: !gh  !stats  !live  !clip  !clips  !help
import { config } from './config.js';
import { getGalleryUrl } from './urls.js';
import { getStats } from './stats.js';
import { getLatestClip, getUser, createClip, getClipById } from './twitch.js';
import { addClip } from './store.js';

const HELP = [
  '🤖 Команды:',
  '!gh — ссылка на репозиторий и звёзды',
  '!stats — коммиты и ±строки за последние часы',
  '!live — что сейчас в эфире',
  '!clip — сделать клип момента (или дай ссылку на клип: !clip <url>)',
  '!clips — галерея клипов',
].join(' ');

const number = (value) => new Intl.NumberFormat('ru-RU').format(Number(value) || 0);

function shortTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export function createCommandHandler({ say, logger = console }) {
  const cooldowns = new Map();

  const isCoolingDown = (key, seconds) => {
    const now = Date.now();
    const until = cooldowns.get(key) || 0;
    if (until > now) return true;
    cooldowns.set(key, now + seconds * 1000);
    return false;
  };

  return async function handleMessage(message) {
    const text = (message.text || '').trim();
    if (!text.startsWith('!')) return;
    const [rawCommand, ...args] = text.split(/\s+/);
    const command = rawCommand.toLowerCase().slice(1);
    const privileged = message.isBroadcaster || message.isMod;

    try {
      switch (command) {
        case 'gh':
        case 'repo': {
          if (isCoolingDown('gh', config.bot.cooldownSec)) return;
          const { repo } = await getStats();
          const stars = number(repo.stars);
          const prs = repo.pullRequests?.count ?? 0;
          say(`📦 ${repo.fullName} · ⭐ ${stars} · PR: ${prs} · ${repo.language || '—'} → ${repo.url}`);
          break;
        }

        case 'stats': {
          if (isCoolingDown('stats', config.bot.cooldownSec)) return;
          const { repo } = await getStats();
          const activity = repo.activity || {};
          const last = activity.latestCommit;
          const lastText = last ? ` · последний: «${last.message.slice(0, 60)}» (${shortTime(last.date)})` : '';
          say(
            `📊 За ${activity.windowHours || 24}ч: ${number(activity.commits)} коммитов, ` +
              `+${number(activity.additions)} / −${number(activity.deletions)} строк · ` +
              `⭐ ${number(repo.stars)} · issues: ${number(repo.openIssues)}${lastText}`,
          );
          break;
        }

        case 'live': {
          if (isCoolingDown('live', config.bot.cooldownSec)) return;
          const { channel } = await getStats();
          if (channel.live) {
            say(`🔴 В эфире: ${channel.title} · ${channel.game} · 👀 ${number(channel.viewers)} → ${channel.url}`);
          } else {
            say(`💤 Офлайн. Стрим: ${channel.url} — подписывайся, чтобы не пропустить!`);
          }
          break;
        }

        case 'clips':
        case 'gallery': {
          if (isCoolingDown('clips', config.bot.cooldownSec)) return;
          say(`🎬 Галерея клипов: ${getGalleryUrl()}`);
          break;
        }

        case 'clip': {
          // 1) прислали ссылку/ID — сохраняем в галерею
          if (args[0] && (args[0].includes('clips.twitch.tv') || /^[A-Za-z0-9_-]{8,}$/.test(args[0]))) {
            if (!isCoolingDown(`clip:${message.user}`, 20)) {
              const clip = await getClipById(args[0]);
              if (!clip) {
                say(`@${message.displayName}, не нашёл такой клип 🤔`);
                return;
              }
              addClip({
                id: clip.id,
                slug: clip.id,
                title: clip.title,
                creator: clip.creator_name,
                views: clip.view_count,
                duration: clip.duration,
                createdAt: clip.created_at,
                thumbnail: clip.thumbnail_url,
                url: clip.url,
                addedBy: message.displayName,
              });
              say(`🎬 Добавил в галерею: «${clip.title}» → ${getGalleryUrl()}`);
            }
            return;
          }

          // 2) иначе — создать клип текущего момента
          if (!isCoolingDown('clip', 15)) {
            const user = await getUser();
            if (!user) {
              say('Не смог определить канал для клипа 🤔');
              return;
            }
            try {
              const created = await createClip(user.id);
              addClip({
                id: created.id,
                slug: created.id,
                title: `Клип от ${message.displayName}`,
                creator: user.display_name,
                views: 0,
                duration: 30,
                createdAt: new Date().toISOString(),
                thumbnail: '',
                url: created.edit_url,
                addedBy: message.displayName,
              });
              say(`✂️ Клип создан! Появится через минуту: ${created.edit_url} · галерея: ${getGalleryUrl()}`);
            } catch (error) {
              logger.warn(`[bot] clip: ${error.message}`);
              const latest = await getLatestClip(user.id);
              if (latest) {
                say(`✂️ Создать клип не могу (${error.message}). Последний клип: ${latest.url}`);
              } else {
                say(`✂️ Создать клип не могу (${error.message}). Broadcast-модераторы могут клипать вручную!`);
              }
            }
          }
          break;
        }

        case 'commands':
        case 'help': {
          if (isCoolingDown(`help:${message.user}`, privileged ? 0 : 30)) return;
          say(HELP);
          break;
        }

        default:
          // неизвестную команду молча игнорируем, чтобы не спамить
          break;
      }
    } catch (error) {
      logger.error(`[bot] команда !${command} упала: ${error.message}`);
      say(`⚠️ Упс, что-то сломалось на команде !${command}`);
    }
  };
}
