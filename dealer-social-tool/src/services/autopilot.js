import { PLATFORM_KEYS, POST_TYPES } from '../config.js';
import { all, get, run, updateRow, parseJson, logActivity, nowIso } from '../db.js';
import { createPostsFromIdea } from './content.js';
import { nextNewArrival, nextPriceDrop, nextSoldToCelebrate, nextVehicleToFeature } from './inventory.js';
import { httpError } from './errors.js';
import { tenantId } from '../tenant.js';
import { localParts, zonedToDate } from '../time.js';
import { getDealership } from './dealership.js';
import { requireRoom } from './entitlements.js';

const VEHICLE_PICKERS = {
  vehicle_spotlight: nextVehicleToFeature,
  new_arrival: nextNewArrival,
  price_drop: nextPriceDrop,
  sold_celebration: nextSoldToCelebrate,
};

export function presentRule(row) {
  if (!row) return row;
  return {
    ...row,
    enabled: !!row.enabled,
    platforms: parseJson(row.platforms, []),
    days_of_week: parseJson(row.days_of_week, []),
  };
}

/** Next run time strictly after `from`, on the dealership's local clock. */
export function computeNextRun(rule, from = new Date(), timeZone = getDealership().timezone) {
  const days = rule.days_of_week?.length ? rule.days_of_week : [0, 1, 2, 3, 4, 5, 6];
  const [hour, minute] = String(rule.time_of_day || '10:00').split(':').map(Number);
  const today = localParts(from, timeZone);
  for (let offset = 0; offset <= 8; offset++) {
    // Noon UTC on the local calendar day avoids DST edge cases when stepping days.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offset, 12));
    const weekday = day.getUTCDay();
    const candidate = zonedToDate({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, timeZone);
    if (candidate > from && days.includes(weekday)) return candidate.toISOString();
  }
  return null;
}

function validate(input) {
  if (input.post_type !== undefined && !POST_TYPES[input.post_type]) throw httpError(400, 'Unknown post type');
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.some((p) => !PLATFORM_KEYS.includes(p))) {
      throw httpError(400, 'platforms must be a non-empty list of known platforms');
    }
  }
  if (input.time_of_day !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time_of_day)) {
    throw httpError(400, 'time_of_day must look like 10:00');
  }
  if (input.days_of_week !== undefined && (!Array.isArray(input.days_of_week) || input.days_of_week.some((d) => !(d >= 0 && d <= 6)))) {
    throw httpError(400, 'days_of_week must be numbers 0 (Sunday) to 6 (Saturday)');
  }
}

export function listRules() {
  return all('SELECT * FROM autopilot_rules WHERE dealership_id = ? ORDER BY id', tenantId()).map(presentRule);
}

export function getRule(id) {
  return presentRule(get('SELECT * FROM autopilot_rules WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

export function createRule(input, actor = 'user') {
  if (!input.name) throw httpError(400, 'name is required');
  if (!input.post_type || !input.platforms) throw httpError(400, 'post_type and platforms are required');
  validate(input);
  requireRoom('autopilotRules', listRules().length, 'autopilot rules');
  const rule = {
    name: input.name,
    post_type: input.post_type,
    platforms: input.platforms,
    days_of_week: input.days_of_week ?? [1, 2, 3, 4, 5, 6],
    time_of_day: input.time_of_day ?? '10:00',
    instructions: input.instructions ?? '',
    enabled: input.enabled === false ? 0 : 1,
  };
  const { lastInsertRowid } = run(
    `INSERT INTO autopilot_rules (dealership_id, name, post_type, platforms, days_of_week, time_of_day, instructions, enabled, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tenantId(),
    rule.name,
    rule.post_type,
    JSON.stringify(rule.platforms),
    JSON.stringify(rule.days_of_week),
    rule.time_of_day,
    rule.instructions,
    rule.enabled,
    computeNextRun(rule),
  );
  logActivity(actor, 'autopilot.rule_created', rule.name);
  return getRule(Number(lastInsertRowid));
}

export function updateRule(id, input, actor = 'user') {
  const existing = getRule(id);
  if (!existing) throw httpError(404, 'Rule not found');
  validate(input);
  const merged = { ...existing, ...input };
  const patch = {
    ...input,
    platforms: input.platforms && JSON.stringify(input.platforms),
    days_of_week: input.days_of_week && JSON.stringify(input.days_of_week),
    enabled: input.enabled === undefined ? undefined : input.enabled ? 1 : 0,
    next_run_at: computeNextRun(merged),
  };
  updateRow('autopilot_rules', id, patch, ['name', 'post_type', 'platforms', 'days_of_week', 'time_of_day', 'instructions', 'enabled', 'next_run_at']);
  logActivity(actor, 'autopilot.rule_updated', merged.name);
  return getRule(id);
}

export function deleteRule(id) {
  run('DELETE FROM autopilot_rules WHERE id = ? AND dealership_id = ?', id, tenantId());
}

export async function runRule(rule, actor = 'autopilot') {
  const picker = VEHICLE_PICKERS[rule.post_type];
  const vehicle = picker ? picker() : null;
  run('UPDATE autopilot_rules SET last_run_at = ?, next_run_at = ? WHERE id = ? AND dealership_id = ?', nowIso(), computeNextRun(rule), rule.id, tenantId());
  logActivity(actor, 'autopilot.run', rule.name);
  if (picker && !vehicle) {
    logActivity(actor, 'autopilot.skipped', `${rule.name}: no matching vehicle right now`);
    return { skipped: true, reason: 'No matching vehicle in inventory' };
  }
  const result = await createPostsFromIdea({
    postType: rule.post_type,
    vehicleId: vehicle?.id,
    platforms: rule.platforms,
    instructions: rule.instructions,
    scheduledAt: nowIso(),
    actor: 'autopilot',
    source: 'autopilot',
  });
  return { skipped: false, ...result };
}

export async function runDueRules(now = new Date()) {
  const due = all(
    `SELECT * FROM autopilot_rules WHERE dealership_id = ? AND enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?`,
    tenantId(),
    now.toISOString(),
  ).map(presentRule);
  const results = [];
  for (const rule of due) {
    try {
      results.push(await runRule(rule));
    } catch (err) {
      logActivity('autopilot', 'autopilot.error', `${rule.name}: ${err.message}`);
    }
  }
  return results;
}

/** Dealerships with at least one rule due, for the worker. */
export function dealershipsWithDueRules(now = new Date()) {
  return all(`SELECT DISTINCT dealership_id FROM autopilot_rules WHERE enabled = 1 AND next_run_at <= ?`, now.toISOString()).map((r) => r.dealership_id);
}

/** Recompute next runs after the dealership changes time zone. */
export function rescheduleAllRules() {
  for (const rule of listRules()) {
    run('UPDATE autopilot_rules SET next_run_at = ? WHERE id = ? AND dealership_id = ?', computeNextRun(rule), rule.id, tenantId());
  }
}
