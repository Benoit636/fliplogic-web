import { config } from '../config.js';
import { get, run, updateRow, nowIso } from '../db.js';
import { tenantId } from '../tenant.js';
import { isValidTimeZone } from '../time.js';
import { PLAN_KEYS, TRIAL_PLAN, entitlements } from '../plans.js';
import { httpError } from './errors.js';

const EDITABLE = [
  'name',
  'brands',
  'website',
  'phone',
  'address',
  'city',
  'brand_voice',
  'default_hashtags',
  'call_to_action',
  'compliance_notes',
  'autonomy',
  'language',
  'distance_unit',
  'timezone',
  'inventory_feed_url',
  'feed_marks_sold',
  'crm_lead_email',
];

export function getDealershipById(id) {
  return get('SELECT * FROM dealerships WHERE id = ?', id);
}

/** The dealership of the current request / job. */
export function getDealership() {
  return getDealershipById(tenantId());
}

export function createDealership({ name, timezone }) {
  if (!name?.trim()) throw httpError(400, 'Dealership name is required');
  const trialEnds = new Date(Date.now() + config.trialDays * 86_400_000).toISOString();
  const { lastInsertRowid } = run(
    `INSERT INTO dealerships (name, timezone, plan, subscription_status, status_changed_at, trial_ends_at)
     VALUES (?, ?, ?, 'trialing', ?, ?)`,
    name.trim(),
    timezone && isValidTimeZone(timezone) ? timezone : 'America/Moncton',
    TRIAL_PLAN,
    nowIso(),
    trialEnds,
  );
  return getDealershipById(Number(lastInsertRowid));
}

export function updateDealership(fields) {
  if (fields.autonomy && !['assist', 'autopilot'].includes(fields.autonomy)) throw httpError(400, 'autonomy must be "assist" or "autopilot"');
  if (fields.autonomy === 'autopilot' && !currentEntitlements().features.autopilot) {
    throw httpError(402, 'Full autopilot is available on the Pro plan and above');
  }
  if (fields.distance_unit && !['km', 'mi'].includes(fields.distance_unit)) throw httpError(400, 'distance_unit must be "km" or "mi"');
  if (fields.timezone && !isValidTimeZone(fields.timezone)) throw httpError(400, 'Unknown time zone');
  if (fields.crm_lead_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.crm_lead_email)) throw httpError(400, 'CRM lead email is not a valid email address');
  if (fields.inventory_feed_url && !/^https?:\/\//i.test(fields.inventory_feed_url)) throw httpError(400, 'Feed URL must start with http(s)://');
  if (fields.inventory_feed_url && !currentEntitlements().features.inventoryFeed) {
    throw httpError(402, 'Automatic inventory feeds are available on the Pro plan and above');
  }
  const patch = { ...fields };
  if (patch.feed_marks_sold !== undefined) patch.feed_marks_sold = patch.feed_marks_sold ? 1 : 0;
  updateRow('dealerships', tenantId(), patch, EDITABLE, { tenant: false });
  return getDealership();
}

/** Billing fields are only changed by Stripe webhooks or the platform admin. */
export function updateBilling(id, fields) {
  if (fields.plan && !PLAN_KEYS.includes(fields.plan)) throw httpError(400, 'Unknown plan');
  const existing = getDealershipById(id);
  if (fields.subscription_status && fields.subscription_status !== existing.subscription_status) fields.status_changed_at = nowIso();
  updateRow(
    'dealerships',
    id,
    fields,
    [
      'plan',
      'billing_interval',
      'subscription_status',
      'status_changed_at',
      'trial_ends_at',
      'current_period_end',
      'stripe_customer_id',
      'stripe_subscription_id',
    ],
    { tenant: false },
  );
  return getDealershipById(id);
}

export function defaultHashtags(dealer = getDealership()) {
  return dealer.default_hashtags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

export const isAutopilot = () => {
  const d = getDealership();
  return d.autonomy === 'autopilot' && entitlements(d).features.autopilot;
};

export const currentEntitlements = () => entitlements(getDealership());
