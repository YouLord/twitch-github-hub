// Twitch-чат через обычный IRC-over-TLS (порт 6697). Без зависимостей и без WebSocket.
import tls from 'node:tls';

const HOST = 'irc.chat.twitch.tv';
const PORT = 6697;

function parseTags(raw) {
  const tags = {};
  for (const pair of raw.slice(1).split(';')) {
    const [key, value = ''] = pair.split('=');
    tags[key] = value.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\');
  }
  return tags;
}

/** Разбор одной IRC-строки в объект. Возвращает null, если строка не про сообщение. */
export function parseLine(line) {
  let rest = line;
  let tags = {};
  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    tags = parseTags(rest.slice(0, space));
    rest = rest.slice(space + 1);
  }

  let prefix = '';
  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ');
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }

  const space = rest.indexOf(' ');
  const command = space === -1 ? rest : rest.slice(0, space);
  const paramsRaw = space === -1 ? '' : rest.slice(space + 1);

  // IRC: последний параметр после " :" — это текст
  const trailingIndex = paramsRaw.indexOf(' :');
  const middle = trailingIndex === -1 ? paramsRaw : paramsRaw.slice(0, trailingIndex);
  const trailing = trailingIndex === -1 ? '' : paramsRaw.slice(trailingIndex + 2);
  const params = middle ? middle.split(' ').filter(Boolean) : [];

  if (command !== 'PRIVMSG') {
    return { command, prefix, params, tags, text: trailing, isMessage: false };
  }

  const nick = prefix.split('!')[0];
  return {
    command,
    prefix,
    tags,
    params,
    isMessage: true,
    channel: (params[0] || '').replace(/^#/, ''),
    user: nick,
    displayName: tags['display-name'] || nick,
    text: trailing,
    isBroadcaster:
      Boolean(tags.badges?.includes('broadcaster')) ||
      Boolean(tags['user-id'] && tags['room-id'] && tags['user-id'] === tags['room-id']),
    isMod: tags.mod === '1',
    isVip: tags.vip === '1',
    isSubscriber: tags.subscriber === '1',
  };
}

export class TwitchChat {
  constructor({ username, oauth, channel, onMessage, onReady, logger = console }) {
    this.username = (username || '').toLowerCase();
    this.oauth = (oauth || '').replace(/^oauth:/i, '');
    this.channel = (channel || '').toLowerCase();
    this.onMessage = onMessage || (() => {});
    this.onReady = onReady || (() => {});
    this.logger = logger;

    this.socket = null;
    this.buffer = '';
    this.connected = false;
    this.stopped = false;
    this.reconnectDelay = 1000;
    this.queue = [];
    this.sending = false;
  }

  get configured() {
    return Boolean(this.username && this.oauth && this.channel);
  }

  connect() {
    if (!this.configured) {
      this.logger.warn('[chat] бот не настроен (TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH / TWITCH_CHANNEL)');
      return this;
    }

    this.socket = tls.connect({ host: HOST, port: PORT }, () => {
      this.logger.log(`[chat] подключился к ${HOST}:${PORT}`);
      this.raw('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.raw(`PASS oauth:${this.oauth}`);
      this.raw(`NICK ${this.username}`);
      this.raw(`JOIN #${this.channel}`);
    });

    this.socket.setEncoding('utf8');
    this.socket.setKeepAlive(true, 30_000);

    this.socket.on('data', (chunk) => this.handleData(chunk));
    this.socket.on('error', (error) => this.logger.error(`[chat] сокет: ${error.message}`));
    this.socket.on('close', () => {
      this.connected = false;
      if (this.stopped) return;
      const delay = Math.min(this.reconnectDelay, 30_000);
      this.logger.warn(`[chat] соединение закрыто, переподключение через ${Math.round(delay / 1000)}с`);
      setTimeout(() => this.connect(), delay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    });

    return this;
  }

  handleData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('PING')) {
        this.raw(line.replace('PInG', 'PONG').replace('PING', 'PONG'));
        continue;
      }
      const parsed = parseLine(line);
      if (parsed.command === '001') {
        this.logger.log('[chat] авторизован');
      }
      if (parsed.command === '366') {
        this.connected = true;
        this.reconnectDelay = 1000;
        this.logger.log(`[chat] в канале #${this.channel}`);
        this.onReady();
        continue;
      }
      if (parsed.command === 'NOTICE') {
        this.logger.warn(`[chat] notice: ${parsed.text}`);
        continue;
      }
      if (parsed.isMessage) {
        try {
          this.onMessage(parsed);
        } catch (error) {
          this.logger.error(`[chat] обработчик упал: ${error.message}`);
        }
      }
    }
  }

  raw(line) {
    if (this.socket && !this.socket.destroyed) this.socket.write(`${line}\r\n`);
  }

  /** Сообщение в чат с очередью (Twitch лимит ~20 сообщений / 30 сек). */
  say(text) {
    if (!this.configured || !text) return false;
    const messages = [];
    let rest = String(text).replace(/\s+/g, ' ').trim();
    while (rest.length > 450) {
      const cut = rest.lastIndexOf(' ', 450);
      messages.push(rest.slice(0, cut > 0 ? cut : 450));
      rest = rest.slice(cut > 0 ? cut + 1 : 450);
    }
    if (rest) messages.push(rest);
    this.queue.push(...messages);
    this.pump();
    return true;
  }

  pump() {
    if (this.sending || !this.queue.length) return;
    this.sending = true;
    const message = this.queue.shift();
    this.raw(`PRIVMSG #${this.channel} :${message}`);
    setTimeout(() => {
      this.sending = false;
      this.pump();
    }, 1300);
  }

  stop() {
    this.stopped = true;
    this.socket?.end();
  }
}
