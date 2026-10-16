import { config } from '../config.js';
import { get, run, updateRow, nowIso } from '../db.js';
import { tenantId } from '../tenant.js';
import { isValidTimeZone } from '../time.js';
import { PLAN_KEYS, TRIAL_PLAN, entitlements } from '../plans.js';
import { httpError } from './errors.js';
import { encrypt, decrypt } from '../crypto.js';

/** Feed address shown in the app: just the website it comes from. */
export function maskFeedUrl(stored) {
  const url = decrypt(stored);
  if (!url) return '';
  try {
    return `${new URL(url).origin}/…`;
  } catch {
    return 'saved';
  }
}

/** Dealership as sent to the browser: no billing ids, no feed secret. */
export function presentDealership(d) {
  if (!d) return d;
  const { stripe_customer_id, stripe_subscription_id, inventory_feed_url, ...rest } = d;
  return { ...rest, inventory_feed_url: maskFeedUrl(inventory_feed_url), inventory_feed_configured: !!inventory_feed_url };
}

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
  'inventory_sync_minutes',
  'province',
  'postal_code',
  'brand_color',
  'accent_color',
  'caption_language',
  'call_to_action_fr',
  'compliance_notes_fr',
];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DEALER_NUMBER = /^\d{3,6}$/;

export function getDealershipByNumber(number) {
  return get('SELECT * FROM dealerships WHERE dealer_number = ?', String(number));
}

/** Dealer numbers are zero-padded and sequential: 001, 002, … */
function nextDealerNumber() {
  const max = get('SELECT MAX(CAST(dealer_number AS INTEGER)) AS n FROM dealerships').n || 0;
  return String(max + 1).padStart(3, '0');
}

export function getDealershipById(id) {
  return get('SELECT * FROM dealerships WHERE id = ?', id);
}

/** The dealership of the current request / job. */
export function getDealership() {
  return getDealershipById(tenantId());
}

export function createDealership({ name, timezone, dealerNumber }) {
  if (!name?.trim()) throw httpError(400, 'Dealership name is required');
  let number = nextDealerNumber();
  if (dealerNumber != null && dealerNumber !== '') {
    number = String(dealerNumber).trim();
    if (!DEALER_NUMBER.test(number)) throw httpError(400, 'Dealer number must be 3 to 6 digits, like 001');
    if (getDealershipByNumber(number)) throw httpError(409, `Dealer #${number} already exists`);
  }
  const trialEnds = config.pilotMode ? null : new Date(Date.now() + config.trialDays * 86_400_000).toISOString();
  const { lastInsertRowid } = run(
    `INSERT INTO dealerships (dealer_number, name, timezone, plan, subscription_status, status_changed_at, trial_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    number,
    name.trim(),
    timezone && isValidTimeZone(timezone) ? timezone : 'America/Moncton',
    TRIAL_PLAN,
    config.pilotMode ? 'comped' : 'trialing',
    nowIso(),
    trialEnds,
  );
  return getDealershipById(Number(lastInsertRowid));
}

export function updateDealership(fields) {
  if (fields.autonomy && !['assist', 'autopilot'].includes(fields.autonomy)) throw httpError(400, 'autonomy must be "assist" or "autopilot"');
  if (fields.caption_language && !['en', 'fr', 'bilingual'].includes(fields.caption_language)) throw httpError(400, 'Caption language must be en, fr or bilingual');
  if (fields.autonomy === 'autopilot' && getDealership().require_approval) {
    throw httpError(409, 'Every post needs a Dealer Admin’s approval at this dealership, so full autopilot is off');
  }
  if (fields.autonomy === 'autopilot' && !currentEntitlements().features.autopilot) {
    throw httpError(402, 'Full autopilot is available on the Pro plan and above');
  }
  if (fields.distance_unit && !['km', 'mi'].includes(fields.distance_unit)) throw httpError(400, 'distance_unit must be "km" or "mi"');
  if (fields.timezone && !isValidTimeZone(fields.timezone)) throw httpError(400, 'Unknown time zone');
  if (fields.crm_lead_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.crm_lead_email)) throw httpError(400, 'CRM lead email is not a valid email address');
  if (fields.inventory_feed_url && !/^https?:\/\//i.test(fields.inventory_feed_url)) throw httpError(400, 'Feed URL must start with http(s)://');
  if (fields.name !== undefined && !String(fields.name).trim()) throw httpError(400, 'Dealership name is required');
  if (fields.website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(fields.website)) throw httpError(400, 'Website must be a full address, like https://www.yourdealer.ca');
  for (const key of ['brand_color', 'accent_color']) {
    if (fields[key] && !HEX_COLOR.test(fields[key])) throw httpError(400, 'Brand colours must look like #001E50');
  }
  if (fields.inventory_feed_url && !currentEntitlements().features.inventoryFeed) {
    throw httpError(402, 'Automatic inventory feeds are available on the Pro plan and above');
  }
  const patch = { ...fields };
  if (patch.feed_marks_sold !== undefined) patch.feed_marks_sold = patch.feed_marks_sold ? 1 : 0;
  if (patch.inventory_sync_minutes !== undefined) {
    const m = Number(patch.inventory_sync_minutes);
    if (!Number.isInteger(m) || m < 15 || m > 1440) throw httpError(400, 'Sync every 15 to 1440 minutes');
    patch.inventory_sync_minutes = m;
  }
  // The feed address can contain a private key: stored encrypted, never sent back to the browser in full.
  if (patch.inventory_feed_url !== undefined) patch.inventory_feed_url = patch.inventory_feed_url ? encrypt(String(patch.inventory_feed_url).trim()) : '';
  for (const key of EDITABLE) if (typeof patch[key] === 'string') patch[key] = patch[key].trim().slice(0, 2000);
  updateRow('dealerships', tenantId(), patch, EDITABLE, { tenant: false });
  return getDealership();
}

/** Logo file already validated and stored by services/media.js ('' removes it). */
export function setDealershipLogo(url) {
  updateRow('dealerships', tenantId(), { logo_url: url || '' }, ['logo_url'], { tenant: false });
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

// With require_approval (the default) nothing is ever published without a Dealer Admin's approval.
export const isAutopilot = () => {
  const d = getDealership();
  return !d.require_approval && d.autonomy === 'autopilot' && entitlements(d).features.autopilot;
};

export const currentEntitlements = () => entitlements(getDealership());
