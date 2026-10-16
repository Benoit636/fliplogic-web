// PILOT_MODE=1: only the pilot features are on; social connections, inbox (customer data), AI chat, autopilot and billing are off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-pilot-'));
process.env.MEDIA_DIR = mediaDir;
process.env.PILOT_MODE = '1';
process.env.ALLOW_SIGNUP = '0';

const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDealerWithAdmin, PRESETS } = await import('../src/services/setup.js');

let server;
let base;
before(async () => {
  openDb(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, p, body) => {
    const res = await fetch(base + p, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, location: res.headers.get('location') };
  };
}

test('pilot mode: complimentary dealership, pilot features on, everything else off on the server', async () => {
  const vw = PRESETS['vw-moncton'];
  const d = createDealerWithAdmin({ name: vw.name, dealerNumber: vw.dealerNumber, adminEmail: 'gm@vw.example', profile: vw.profile });
  assert.equal(d.dealership.subscription_status, 'comped', 'no trial clock during the pilot');
  assert.equal(d.dealership.trial_ends_at, null);
  const admin = client();
  await admin('POST', `/api/auth/invite/${new URL(d.invite_url).searchParams.get('token')}/accept`, { name: 'Gina', password: 'Pilot-Ready-2026' });
  assert.equal((await admin('GET', '/api/meta')).data.pilot_mode, true);

  // On: inventory, posts, approval.
  const car = await admin('POST', '/api/vehicles', { make: 'Volkswagen', model: 'Taos', stock_number: 'T1' });
  assert.equal(car.status, 201);
  const gen = await admin('POST', '/api/generate', { post_type: 'used_fresh_arrival', vehicle_id: car.data.id, platforms: ['facebook'], details: {} });
  assert.equal(gen.status, 201);
  assert.equal((await admin('POST', `/api/posts/${gen.data.posts[0].id}/approve`)).status, 200);
  assert.equal((await admin('POST', `/api/posts/${gen.data.posts[0].id}/mark-posted`)).data.status, 'published');
  assert.equal((await admin('GET', '/api/accounts')).status, 200);

  // Off: social connections, inbox (customer personal information), AI chat, autopilot changes, billing.
  for (const [method, p, body] of [
    ['POST', '/api/oauth/google/start'],
    ['POST', '/api/oauth/linkedin/start'],
    ['POST', '/api/accounts', { platform: 'facebook', display_name: 'VW', mode: 'live' }],
    ['GET', '/api/inbox'],
    ['POST', '/api/inbox', { platform: 'facebook', author: 'Jane Customer', text: 'Is it available?' }],
    ['POST', '/api/inbox/simulate', { count: 2 }],
    ['POST', '/api/chat', { message: 'hi' }],
    ['POST', '/api/autopilot/rules', { name: 'x', post_type: 'service_tip' }],
    ['POST', '/api/billing/checkout', { plan: 'pro' }],
  ]) {
    const r = await admin(method, p, body);
    assert.equal(r.status, 403, `${method} ${p} is off`);
    assert.match(r.data.error, /switched off during the pilot/);
  }
  // Facebook is the one network that can be connected during the pilot (not set up on this test server).
  assert.match((await admin('POST', '/api/oauth/meta/start')).data.error, /not configured/);
  assert.equal((await fetch(`${base}/webhooks/meta`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"object":"page","entry":[]}' })).status, 403);
  const cb = await admin('GET', '/oauth/meta/callback?code=x&state=y');
  assert.doesNotMatch(cb.location, /Only%20Facebook/, 'Facebook callback is allowed');
  assert.match((await admin('GET', '/oauth/google/callback?code=x&state=y')).location, /Only%20Facebook%20can%20be%20connected/);
});

test('configuration check stops an unsafe production start', async () => {
  const { spawnSync } = await import('node:child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-check-'));
  const run = (env) =>
    spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/preflight.js'], {
      env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_PATH: `${tmp}/db.sqlite`, MEDIA_DIR: `${tmp}/m`, BACKUP_DIR: `${tmp}/b`, ...env },
      encoding: 'utf8',
    });
  const bad = run({ APP_SECRET: 'short', APP_URL: 'http://example.com', ALLOW_SIGNUP: '1' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /APP_SECRET is too short/);
  assert.match(bad.stdout, /APP_URL is http/);
  assert.match(bad.stdout, /ALLOW_SIGNUP is on/);
  const good = run({ APP_SECRET: 'x'.repeat(48), APP_URL: 'https://social.example.ca', PILOT_MODE: '1', SUPERADMIN_EMAILS: 'me@example.ca' });
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, /Pilot mode is ON/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
