import assert from 'node:assert/strict';
import { tenantTest as test } from './helpers.js';
import { computeNextRun, createRule, runRule, runDueRules, getRule } from '../src/services/autopilot.js';
import { updateVehicle } from '../src/services/inventory.js';
import { listPosts } from '../src/services/posts.js';
import { updateDealership, getDealership } from '../src/services/dealership.js';
import { fallbackTriage } from '../src/ai/inbox.js';
import { ingestMessage } from '../src/services/inbox.js';
import { run } from '../src/db.js';

test('computeNextRun uses the dealership time zone, including across DST', () => {
  const tz = 'America/Moncton';
  const wedNoon = new Date('2026-09-30T15:00:00Z'); // Wednesday 12:00 local (UTC-3)
  assert.equal(computeNextRun({ days_of_week: [1], time_of_day: '09:30' }, wedNoon, tz), '2026-10-05T12:30:00.000Z');
  assert.equal(computeNextRun({ days_of_week: [3], time_of_day: '18:00' }, wedNoon, tz), '2026-09-30T21:00:00.000Z');
  assert.equal(computeNextRun({ days_of_week: [3], time_of_day: '09:00' }, wedNoon, tz), '2026-10-07T12:00:00.000Z');
  // Clocks fall back on Nov 1: Monday 09:30 is now UTC-4.
  assert.equal(computeNextRun({ days_of_week: [1], time_of_day: '09:30' }, new Date('2026-10-31T12:00:00Z'), tz), '2026-11-02T13:30:00.000Z');
});

test('rules validate input', (fixtures) => {
  assert.throws(() => createRule({ name: 'x', post_type: 'nope', platforms: ['facebook'] }), /Unknown post type/);
  assert.throws(() => createRule({ name: 'x', post_type: 'promotion', platforms: ['myspace'] }), /platforms/);
  assert.throws(() => createRule({ name: 'x', post_type: 'promotion', platforms: ['facebook'], time_of_day: '25:00' }), /time_of_day/);
});

test('sold-celebration rule picks the sold car once, then skips', async (fixtures) => {
  const rule = createRule({ name: 'Sold', post_type: 'sold_celebration', platforms: ['facebook'] });
  assert.equal((await runRule(rule)).skipped, true);

  updateVehicle(fixtures.suv.id, { status: 'sold' });
  const res = await runRule(rule);
  assert.equal(res.skipped, false);
  assert.equal(res.posts[0].vehicle_id, fixtures.suv.id);
  assert.equal(res.posts[0].status, 'pending_approval');
  assert.equal((await runRule(rule)).skipped, true);
});

test('due rules run from the worker and move their next run forward', async (fixtures) => {
  const rule = createRule({ name: 'Spotlight', post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'] });
  run('UPDATE autopilot_rules SET next_run_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), rule.id);
  await runDueRules();
  assert.equal(listPosts({ status: 'pending_approval' }).length, 2);
  assert.ok(new Date(getRule(rule.id).next_run_at) > new Date());
});

test('fallback triage recognises leads, complaints, spam and praise', (fixtures) => {
  const d = getDealership();
  const t = (text, extra = {}) => fallbackTriage({ text, author: 'Sam Doe', ...extra }, d);
  assert.equal(t('Is this truck still available? What would payments be?').intent, 'lead');
  assert.equal(t('Worst service ever, never again').intent, 'complaint');
  assert.equal(t('Earn $$$ fast https://spam.example').intent, 'spam');
  assert.equal(t('Love this dealership!').intent, 'praise');
  assert.equal(t('Fine', { rating: 1 }).sentiment, 'negative');
  assert.match(t('Love it').suggested_reply, /Sam/);
});

test('autopilot inbox: replies to praise, escalates leads, dismisses spam', async (fixtures) => {
  updateDealership({ autonomy: 'autopilot' });
  const praise = await ingestMessage({ platform: 'facebook', author: 'Ann', text: 'Love this car!' });
  const lead = await ingestMessage({ platform: 'facebook', author: 'Bob', text: 'Do you take trade-ins?' });
  const spam = await ingestMessage({ platform: 'facebook', author: 'bot', text: 'crypto riches https://x.example' });
  assert.equal(praise.status, 'replied');
  assert.equal(lead.status, 'escalated');
  assert.equal(spam.status, 'dismissed');
  assert.equal(await ingestMessage({ platform: 'facebook', author: 'Ann', text: 'dup', external_id: 'c1' }).then((m) => m.status), 'new');
  assert.equal(await ingestMessage({ platform: 'facebook', author: 'Ann', text: 'dup', external_id: 'c1' }), null, 'duplicates are ignored');
});
