// Клиент GitHub REST API + сбор статистики репозитория.
import { config, parseRepo } from './config.js';

const API = 'https://api.github.com';

export async function ghFetch(pathname, { params = {}, method = 'GET' } = {}) {
  const url = new URL(`${API}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'twitch-github-hub',
  };
  if (config.github.token) headers.Authorization = `Bearer ${config.github.token}`;

  const response = await fetch(url, { method, headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`GitHub API ${response.status}: ${body?.message || response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

/** Базовая инфа о репозитории: звёзды, форки, язык, открытые issues/PR. */
export async function getRepo(repo = config.github.repo) {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error(`Некорректный GITHUB_REPO: "${repo}" (нужно owner/name)`);
  const data = await ghFetch(`/repos/${parsed.owner}/${parsed.name}`);
  return {
    fullName: data.full_name,
    url: data.html_url,
    description: data.description || '',
    stars: data.stargazers_count ?? 0,
    forks: data.forks_count ?? 0,
    openIssues: data.open_issues_count ?? 0,
    language: data.language || '',
    defaultBranch: data.default_branch || 'main',
    pushedAt: data.pushed_at,
  };
}

/** Коммиты за последние N часов. */
export async function getCommitsSince(repo = config.github.repo, hours = config.github.windowHours) {
  const parsed = parseRepo(repo);
  if (!parsed) throw new Error('Некорректный GITHUB_REPO');
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const data = await ghFetch(`/repos/${parsed.owner}/${parsed.name}/commits`, {
    params: { since, per_page: 100 },
  });
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    sha: item.sha,
    message: (item.commit?.message || '').split('\n')[0].slice(0, 120),
    author: item.commit?.author?.name || item.author?.login || 'unknown',
    avatar: item.author?.avatar_url || '',
    date: item.commit?.author?.date || '',
    url: item.html_url,
  }));
}

/** ±строк по конкретному коммиту (1 запрос на коммит — поэтому лимитируем). */
export async function getCommitStats(repo = config.github.repo, sha) {
  const parsed = parseRepo(repo);
  if (!parsed) return { additions: 0, deletions: 0 };
  try {
    const data = await ghFetch(`/repos/${parsed.owner}/${parsed.name}/commits/${sha}`);
    return {
      additions: data?.stats?.additions ?? 0,
      deletions: data?.stats?.deletions ?? 0,
    };
  } catch {
    return { additions: 0, deletions: 0 };
  }
}

/** Открытые pull request'ы. */
export async function getOpenPRs(repo = config.github.repo) {
  const parsed = parseRepo(repo);
  if (!parsed) return { count: 0, latest: null };
  const data = await ghFetch(`/repos/${parsed.owner}/${parsed.name}/pulls`, {
    params: { state: 'open', per_page: 10, sort: 'created', direction: 'desc' },
  });
  if (!Array.isArray(data)) return { count: 0, latest: null };
  const latest = data[0]
    ? {
        number: data[0].number,
        title: data[0].title,
        user: data[0].user?.login || '',
        url: data[0].html_url,
      }
    : null;
  return { count: data.length, latest };
}

/** Полная статистика «за окно»: коммиты, ±строки, файлы. */
export async function getActivity(repo = config.github.repo, hours = config.github.windowHours) {
  const commits = await getCommitsSince(repo, hours);
  const withStats = commits.slice(0, 15);
  const stats = await Promise.all(withStats.map((commit) => getCommitStats(repo, commit.sha)));
  let additions = 0;
  let deletions = 0;
  for (const item of stats) {
    additions += item.additions;
    deletions += item.deletions;
  }
  return {
    windowHours: hours,
    commits: commits.length,
    additions,
    deletions,
    latestCommit: commits[0] ?? null,
    recent: commits.slice(0, 5),
  };
}

/** Агрегированная статистика для оверлея и команд бота. */
export async function getRepoStats(repo = config.github.repo, hours = config.github.windowHours) {
  const [info, activity, prs] = await Promise.all([
    getRepo(repo),
    getActivity(repo, hours),
    getOpenPRs(repo),
  ]);
  return { ...info, activity, pullRequests: prs };
}
