import { PLATFORMS, POST_TYPES } from '../config.js';
import { listPosts } from './posts.js';

const METRICS = ['reach', 'impressions', 'likes', 'comments', 'shares', 'clicks', 'leads'];

const emptyTotals = () => Object.fromEntries([['posts', 0], ...METRICS.map((m) => [m, 0])]);

function add(target, post) {
  target.posts++;
  for (const m of METRICS) target[m] += Number(post.metrics?.[m] || 0);
}

function withRates(t) {
  const engagements = t.likes + t.comments + t.shares;
  return { ...t, engagements, engagement_rate: t.reach ? +((engagements / t.reach) * 100).toFixed(2) : 0 };
}

export function analyticsSummary(days = 30) {
  const from = new Date(Date.now() - days * 86_400_000).toISOString();
  const posts = listPosts({ status: 'published', from, limit: 5000 });

  const totals = emptyTotals();
  const byPlatform = {};
  const byType = {};
  const daily = {};
  for (const post of posts) {
    add(totals, post);
    add((byPlatform[post.platform] ??= emptyTotals()), post);
    add((byType[post.post_type] ??= emptyTotals()), post);
    const day = (post.published_at || post.created_at).slice(0, 10);
    add((daily[day] ??= emptyTotals()), post);
  }

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const d = daily[day] || emptyTotals();
    series.push({ day, posts: d.posts, reach: d.reach, engagements: d.likes + d.comments + d.shares });
  }

  const score = (p) => (p.metrics?.likes || 0) + 2 * (p.metrics?.comments || 0) + 3 * (p.metrics?.shares || 0);
  const top = [...posts].sort((a, b) => score(b) - score(a)).slice(0, 5);

  return {
    days,
    totals: withRates(totals),
    by_platform: Object.entries(byPlatform).map(([platform, t]) => ({ platform, label: PLATFORMS[platform]?.label, ...withRates(t) })),
    by_type: Object.entries(byType).map(([type, t]) => ({ type, label: POST_TYPES[type], ...withRates(t) })),
    series,
    top_posts: top.map((p) => ({
      id: p.id,
      platform: p.platform,
      post_type: p.post_type,
      title: p.title,
      content: p.content.slice(0, 160),
      metrics: p.metrics,
      external_url: p.external_url,
    })),
  };
}
