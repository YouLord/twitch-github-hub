// GitHub-вебхук: проверка подписи + превращение события в сообщение для чата.
import crypto from 'node:crypto';

/** Проверка X-Hub-Signature-256 (HMAC-SHA256 от сырого тела). */
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret) return { ok: true, reason: 'secret не задан — проверка отключена' };
  if (!signatureHeader) return { ok: false, reason: 'нет заголовка X-Hub-Signature-256' };

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signatureHeader).trim(), 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'подпись не совпала' };
  return { ok: crypto.timingSafeEqual(a, b), reason: 'подпись не совпала' };
}

const cut = (text = '', max = 70) =>
  String(text).replace(/\s+/g, ' ').trim().slice(0, max) + (String(text).length > max ? '…' : '');

/**
 * GitHub event → { icon, type, text, url } или null, если событие не показываем.
 */
export function formatEvent(eventName, payload = {}) {
  const repoFullName = payload.repository?.full_name || '';
  const repoUrl = payload.repository?.html_url || '';

  switch (eventName) {
    case 'push': {
      const commits = payload.commits || [];
      if (!commits.length) return null;
      const branch = (payload.ref || '').replace('refs/heads/', '');
      const first = cut(commits[0].message, 60);
      const more = commits.length > 1 ? ` (+${commits.length - 1})` : '';
      return {
        icon: '📝',
        type: 'push',
        text: `${payload.pusher?.name || 'кто-то'} запушил в ${branch}: ${first}${more}`,
        url: payload.compare || `${repoUrl}/commits/${branch}`,
        repo: repoFullName,
      };
    }

    case 'pull_request': {
      const pr = payload.pull_request || {};
      const action = payload.action;
      if (!['opened', 'reopened', 'closed'].includes(action)) return null;
      if (action === 'closed' && !pr.merged) {
        return {
          icon: '🚫',
          type: 'pull_request',
          text: `PR #${pr.number} закрыт без мержа: ${cut(pr.title)}`,
          url: pr.html_url,
          repo: repoFullName,
        };
      }
      const merged = action === 'closed';
      return {
        icon: merged ? '✅' : '🔀',
        type: 'pull_request',
        text: merged
          ? `PR #${pr.number} смержен: ${cut(pr.title)}`
          : `Новый PR #${pr.number} от ${pr.user?.login}: ${cut(pr.title)}`,
        url: pr.html_url,
        repo: repoFullName,
      };
    }

    case 'pull_request_review': {
      const review = payload.review || {};
      if (review.state !== 'approved') return null;
      return {
        icon: '👍',
        type: 'review',
        text: `${review.user?.login} аппрувнул PR #${payload.pull_request?.number}: ${cut(payload.pull_request?.title)}`,
        url: review.html_url,
        repo: repoFullName,
      };
    }

    case 'issues': {
      const issue = payload.issue || {};
      if (!['opened', 'closed'].includes(payload.action)) return null;
      return {
        icon: payload.action === 'opened' ? '🐞' : '✔️',
        type: 'issues',
        text: `Issue #${issue.number} ${payload.action === 'opened' ? 'создан' : 'закрыт'}: ${cut(issue.title)}`,
        url: issue.html_url,
        repo: repoFullName,
      };
    }

    case 'release': {
      if (payload.action !== 'published') return null;
      const release = payload.release || {};
      return {
        icon: '🚀',
        type: 'release',
        text: `Релиз ${release.tag_name}: ${cut(release.name || release.tag_name)}`,
        url: release.html_url,
        repo: repoFullName,
      };
    }

    case 'watch':
    case 'star': {
      if (payload.action !== 'started' && eventName === 'star' && payload.action !== 'created') return null;
      return {
        icon: '⭐',
        type: 'star',
        text: `${payload.sender?.login || 'кто-то'} поставил звезду (всего ${payload.repository?.stargazers_count ?? '—'})`,
        url: `${repoUrl}/stargazers`,
        repo: repoFullName,
      };
    }

    case 'fork': {
      return {
        icon: '🍴',
        type: 'fork',
        text: `${payload.sender?.login || 'кто-то'} форкнул репозиторий`,
        url: payload.forkee?.html_url || repoUrl,
        repo: repoFullName,
      };
    }

    case 'workflow_run': {
      const run = payload.workflow_run || {};
      if (run.conclusion === 'success' && payload.action === 'completed') {
        return {
          icon: '🟢',
          type: 'ci',
          text: `CI зелёный: ${cut(run.name, 40)} (${run.head_branch})`,
          url: run.html_url,
          repo: repoFullName,
        };
      }
      if (run.conclusion === 'failure' && payload.action === 'completed') {
        return {
          icon: '🔴',
          type: 'ci',
          text: `CI упал: ${cut(run.name, 40)} (${run.head_branch})`,
          url: run.html_url,
          repo: repoFullName,
        };
      }
      return null;
    }

    default:
      return null;
  }
}

/** Строка для чата из события. */
export function eventToChatText(event, { withRepo = true } = {}) {
  const repo = withRepo && event.repo ? ` · ${event.repo}` : '';
  return `${event.icon} ${event.text}${repo} → ${event.url}`;
}
