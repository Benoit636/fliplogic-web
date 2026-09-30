// Platform-owner console: every customer dealership, revenue and usage at a glance.
import { all, get } from '../db.js';
import { PLANS } from '../plans.js';
import { currentPeriod } from './entitlements.js';
import { getDealershipById, updateBilling } from './dealership.js';
import { httpError } from './errors.js';

const monthlyValue = (d) => {
  const plan = PLANS[d.plan];
  if (!plan || !['active', 'past_due'].includes(d.subscription_status)) return 0;
  return d.billing_interval === 'year' ? plan.yearly / 12 : plan.monthly;
};

export function platformOverview() {
  const period = currentPeriod();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const dealerships = all(
    `SELECT d.*,
      (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.dealership_id = d.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email,
      (SELECT COUNT(*) FROM memberships m WHERE m.dealership_id = d.id) AS users,
      (SELECT COUNT(*) FROM accounts a WHERE a.dealership_id = d.id) AS accounts,
      (SELECT COUNT(*) FROM accounts a WHERE a.dealership_id = d.id AND a.mode = 'live') AS live_accounts,
      (SELECT COUNT(*) FROM vehicles v WHERE v.dealership_id = d.id) AS vehicles,
      (SELECT COUNT(*) FROM posts p WHERE p.dealership_id = d.id AND p.status = 'published' AND p.published_at >= ?) AS published_30d,
      (SELECT count FROM usage u WHERE u.dealership_id = d.id AND u.period = ? AND u.metric = 'ai_posts') AS ai_posts_month,
      (SELECT count FROM usage u WHERE u.dealership_id = d.id AND u.period = ? AND u.metric = 'ai_chat_turns') AS ai_chats_month,
      (SELECT MAX(at) FROM activity_log l WHERE l.dealership_id = d.id AND l.actor = 'user') AS last_user_activity
     FROM dealerships d ORDER BY d.created_at DESC`,
    since30,
    period,
    period,
  ).map((d) => ({
    id: d.id,
    name: d.name,
    city: d.city,
    owner_email: d.owner_email,
    plan: d.plan,
    billing_interval: d.billing_interval,
    subscription_status: d.subscription_status,
    trial_ends_at: d.trial_ends_at,
    current_period_end: d.current_period_end,
    stripe_customer_id: d.stripe_customer_id,
    created_at: d.created_at,
    users: d.users,
    accounts: d.accounts,
    live_accounts: d.live_accounts,
    vehicles: d.vehicles,
    published_30d: d.published_30d,
    ai_posts_month: d.ai_posts_month || 0,
    ai_chats_month: d.ai_chats_month || 0,
    last_user_activity: d.last_user_activity,
    mrr: monthlyValue(d),
  }));

  const count = (fn) => dealerships.filter(fn).length;
  const mrr = dealerships.reduce((sum, d) => sum + d.mrr, 0);
  const paying = count((d) => d.mrr > 0);
  return {
    totals: {
      dealerships: dealerships.length,
      paying,
      trialing: count((d) => d.subscription_status === 'trialing'),
      past_due: count((d) => d.subscription_status === 'past_due'),
      canceled: count((d) => ['canceled', 'unpaid'].includes(d.subscription_status)),
      comped: count((d) => d.subscription_status === 'comped'),
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12),
      arpa: paying ? Math.round(mrr / paying) : 0,
      users: get('SELECT COUNT(*) AS n FROM users').n,
      signups_30d: count((d) => d.created_at >= since30),
      published_30d: dealerships.reduce((s, d) => s + d.published_30d, 0),
    },
    dealerships,
  };
}

/** Manual overrides for sales-led deals, pilots and support (comped plans, extended trials). */
export function adminUpdateDealership(id, { plan, subscription_status, extend_trial_days }) {
  const d = getDealershipById(id);
  if (!d) throw httpError(404, 'Dealership not found');
  const patch = {};
  if (plan) patch.plan = plan;
  if (subscription_status) {
    if (!['trialing', 'active', 'comped', 'past_due', 'canceled'].includes(subscription_status)) throw httpError(400, 'Invalid status');
    patch.subscription_status = subscription_status;
  }
  if (extend_trial_days) {
    const base = Math.max(Date.now(), new Date(d.trial_ends_at || Date.now()).getTime());
    patch.trial_ends_at = new Date(base + Number(extend_trial_days) * 86_400_000).toISOString();
    patch.subscription_status = patch.subscription_status || 'trialing';
  }
  return updateBilling(id, patch);
}
