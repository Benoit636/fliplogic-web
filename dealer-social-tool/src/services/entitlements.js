// Plan limits and billing status checks. Throw 402 so the UI can show an upgrade prompt.
import { get, run } from '../db.js';
import { tenantId } from '../tenant.js';
import { currentEntitlements } from './dealership.js';
import { httpError } from './errors.js';

const FEATURE_NAMES = {
  assistant: 'The AI assistant',
  autopilot: 'Full autopilot',
  inventoryFeed: 'Automatic inventory feeds',
};

export const currentPeriod = (d = new Date()) => d.toISOString().slice(0, 7);

export function usageCount(metric, period = currentPeriod()) {
  return get('SELECT count FROM usage WHERE dealership_id = ? AND period = ? AND metric = ?', tenantId(), period, metric)?.count || 0;
}

export function addUsage(metric, n = 1, period = currentPeriod()) {
  run(
    `INSERT INTO usage (dealership_id, period, metric, count) VALUES (?, ?, ?, ?)
     ON CONFLICT (dealership_id, period, metric) DO UPDATE SET count = count + excluded.count`,
    tenantId(),
    period,
    metric,
    n,
  );
}

export function requireActive() {
  const e = currentEntitlements();
  if (!e.active) throw httpError(402, e.reason || 'Your subscription is not active');
  return e;
}

export function requireFeature(feature) {
  const e = requireActive();
  if (!e.features[feature]) throw httpError(402, `${FEATURE_NAMES[feature] || feature} is available on the Pro plan and above`);
  return e;
}

/** Reserve AI post generations against the monthly allowance. */
export function consumeAiPosts(n) {
  const e = requireActive();
  const used = usageCount('ai_posts');
  if (used + n > e.limits.aiPostsPerMonth) {
    throw httpError(402, `Monthly AI post limit reached (${used}/${e.limits.aiPostsPerMonth}). Upgrade your plan for more.`);
  }
  addUsage('ai_posts', n);
}

export function requireRoom(limitKey, currentCount, label) {
  const e = requireActive();
  if (currentCount >= e.limits[limitKey]) {
    throw httpError(402, `Your ${e.planName} plan includes ${e.limits[limitKey]} ${label}. Upgrade to add more.`);
  }
}

export function usageSummary() {
  const e = currentEntitlements();
  const count = (sql) => get(sql, tenantId()).n;
  return {
    ...e,
    usage: {
      aiPostsThisMonth: usageCount('ai_posts'),
      aiChatsThisMonth: usageCount('ai_chat_turns'),
      socialAccounts: count('SELECT COUNT(*) AS n FROM accounts WHERE dealership_id = ?'),
      users: count('SELECT COUNT(*) AS n FROM memberships WHERE dealership_id = ?'),
      autopilotRules: count('SELECT COUNT(*) AS n FROM autopilot_rules WHERE dealership_id = ?'),
    },
  };
}
