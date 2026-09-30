import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';
import { computeNextRun, createRule, runRule, runDueRules, getRule } from '../src/services/autopilot.js';
import { updateVehicle } from '../src/services/inventory.js';
import { listPosts } from '../src/services/posts.js';
import { updateDealership, getDealership } from '../src/services/dealership.js';
import { fallbackTriage } from '../src/ai/inbox.js';
import { ingestMessage } from '../src/services/inbox.js';
import { run } from '../src/db.js';

let fixtures;
beforeEach(() => {
  fixtures = setupDb();
});

test('computeNextRun finds the next allowed weekday and time', () => {
  const from = new Date(2026, 8, 30, 12, 0); // Wednesday noon, local time
  const next = new Date(computeNextRun({ days_of_week: [1], time_of_day: '09:30' }, from));
  assert.equal(next.getDay(), 1);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 30);
  const sameDay = new Date(computeNextRun({ days_of_week: [3], time_of_day: '18:00' }, from));
  assert.equal(sameDay.getDate(), 30);
});

test('rules validate input', () => {
  assert.throws(() => createRule({ name: 'x', post_type: 'nope', platforms: ['facebook'] }), /Unknown post type/);
  assert.throws(() => createRule({ name: 'x', post_type: 'promotion', platforms: ['myspace'] }), /platforms/);
  assert.throws(() => createRule({ name: 'x', post_type: 'promotion', platforms: ['facebook'], time_of_day: '25:00' }), /time_of_day/);
});

test('sold-celebration rule picks the sold car once, then skips', async () => {
  const rule = createRule({ name: 'Sold', post_type: 'sold_celebration', platforms: ['facebook'] });
  assert.equal((await runRule(rule)).skipped, true);

  updateVehicle(fixtures.suv.id, { status: 'sold' });
  const res = await runRule(rule);
  assert.equal(res.skipped, false);
  assert.equal(res.posts[0].vehicle_id, fixtures.suv.id);
  assert.equal(res.posts[0].status, 'pending_approval');
  assert.equal((await runRule(rule)).skipped, true);
});

test('due rules run from the worker and move their next run forward', async () => {
  const rule = createRule({ name: 'Spotlight', post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'] });
  run('UPDATE autopilot_rules SET next_run_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), rule.id);
  await runDueRules();
  assert.equal(listPosts({ status: 'pending_approval' }).length, 2);
  assert.ok(new Date(getRule(rule.id).next_run_at) > new Date());
});

test('fallback triage recognises leads, complaints, spam and praise', () => {
  const d = getDealership();
  const t = (text, extra = {}) => fallbackTriage({ text, author: 'Sam Doe', ...extra }, d);
  assert.equal(t('Is this truck still available? What would payments be?').intent, 'lead');
  assert.equal(t('Worst service ever, never again').intent, 'complaint');
  assert.equal(t('Earn $$$ fast https://spam.example').intent, 'spam');
  assert.equal(t('Love this dealership!').intent, 'praise');
  assert.equal(t('Fine', { rating: 1 }).sentiment, 'negative');
  assert.match(t('Love it').suggested_reply, /Sam/);
});

test('autopilot inbox: replies to praise, escalates leads, dismisses spam', async () => {
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
