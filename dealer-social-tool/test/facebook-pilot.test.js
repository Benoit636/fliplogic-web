// Facebook publishing in the pilot: Facebook Login (minimal permissions), every Page locked until the platform
// owner unlocks it (test Page first), Preview → Approve → Publish, then the post is read back and checked.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-fb-'));
Object.assign(process.env, { MEDIA_DIR: mediaDir, PILOT_MODE: '1', ALLOW_SIGNUP: '0', META_APP_ID: 'app123', META_APP_SECRET: 'appsecret', SUPERADMIN_EMAILS: 'owner@platform.example' });

const { openDb, get } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDealerWithAdmin } = await import('../src/services/setup.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const realFetch = globalThis.fetch;
const graphCalls = [];
let lastPublished = null;
// Fake Graph API; everything else goes to the real (local) server.
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== 'graph.facebook.com') return realFetch(url, init);
  let body = init.body;
  if (body instanceof FormData) body = Object.fromEntries([...body.entries()].map(([k, v]) => [k, v instanceof Blob ? { blob: v.type, size: v.size } : v]));
  else if (typeof body === 'string') body = JSON.parse(body);
  graphCalls.push({ method: init.method || 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body });
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.pathname.endsWith('/oauth/access_token')) return json({ access_token: u.searchParams.get('grant_type') ? 'LONG_USER' : 'SHORT_USER' });
  if (u.pathname.endsWith('/me/accounts'))
    return json({ data: [{ id: 'PAGE_TEST', name: 'Social Dealer Test Page', access_token: 'PAGE_TOKEN', instagram_business_account: { id: 'IG1', username: 'testig' } }, { id: 'PAGE_LIVE', name: 'Volkswagen Moncton', access_token: 'LIVE_TOKEN' }] });
  if (u.pathname.endsWith('/PAGE_TEST/photos')) {
    lastPublished = body;
    return json({ id: 'PHOTO1', post_id: 'PAGE_TEST_123' });
  }
  if (u.pathname.endsWith('/PAGE_TEST_123')) return json({ message: lastPublished.caption, permalink_url: 'https://www.facebook.com/PAGE_TEST/posts/123', full_picture: 'https://scontent.example/p.jpg' });
  return json({});
};

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
  globalThis.fetch = realFetch;
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (method, p, body, { raw, type } = {}) => {
    const res = await realFetch(base + p, {
      method,
      redirect: 'manual',
      headers: { 'content-type': type || 'application/json', 'x-requested-with': 'fetch', ...(cookie ? { cookie } : {}) },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, location: res.headers.get('location') };
  };
}
const tokenOf = (url) => new URL(url).searchParams.get('token');

test('Facebook pilot: connect → locked → owner unlocks the test Page → approve → publish → read back and verified', async () => {
  const d = createDealerWithAdmin({ name: 'Volkswagen Moncton', dealerNumber: '001', adminEmail: 'gm@vw.example', profile: { caption_language: 'bilingual', phone: '(506) 555-0100' } });
  const gm = client();
  await gm('POST', `/api/auth/invite/${tokenOf(d.invite_url)}/accept`, { name: 'Gina', password: 'Approve-Every-Post-1' });
  const owner = client();
  const o = createDealerWithAdmin({ name: 'Platform HQ', adminEmail: 'owner@platform.example' });
  await owner('POST', `/api/auth/invite/${tokenOf(o.invite_url)}/accept`, { name: 'Ben', password: 'Platform-Keys-2026' });

  // 1. Connect with Facebook Login: only the 3 permissions needed to post on a Page.
  const start = await gm('POST', '/api/oauth/meta/start');
  assert.equal(start.status, 200);
  const auth = new URL(start.data.url);
  assert.equal(auth.searchParams.get('scope'), 'pages_show_list,pages_read_engagement,pages_manage_posts');
  const cb = await gm('GET', `/oauth/meta/callback?code=CODE&state=${auth.searchParams.get('state')}`);
  const state = decodeURIComponent(cb.location.match(/connect=([^&]+)/)[1]);
  const options = (await gm('GET', `/api/oauth/pending/${encodeURIComponent(state)}`)).data;
  assert.deepEqual(options.map((x) => x.display_name), ['Social Dealer Test Page', 'Volkswagen Moncton'], 'no Instagram during the pilot');
  assert.ok(!JSON.stringify(options).includes('PAGE_TOKEN'), 'Page tokens never reach the browser');
  assert.equal((await gm('POST', `/api/oauth/pending/${encodeURIComponent(state)}/connect`, { indexes: [0, 1] })).data.connected, 2);
  const stored = get(`SELECT access_token FROM accounts WHERE external_id = 'PAGE_TEST'`);
  assert.match(stored.access_token, /^enc1:/, 'Page token stored encrypted');
  const accounts = (await gm('GET', '/api/accounts')).data;
  assert.ok(accounts.every((a) => a.publish_allowed === 0), 'every Page starts locked');
  assert.ok(!JSON.stringify(accounts).includes('PAGE_TOKEN'));
  // The live Page is disabled for publishing; the test Page is the one the dealership publishes to during testing.
  const live = accounts.find((a) => a.external_id === 'PAGE_LIVE');
  await gm('PATCH', `/api/accounts/${live.id}`, { enabled: false });

  // 2. A real vehicle with its page on the dealer's website.
  await gm('PUT', '/api/dealership', { website: 'https://www.vwmoncton.com' });
  const car = await gm('POST', '/api/vehicles', {
    stock_number: '800205V', vin: '19UDE2F79NA800205', year: 2022, make: 'Acura', model: 'ILX', trim: 'Premium', mileage: 63683, price: 24523, condition: 'used',
    photos: ['https://imagescdn.d2cmedia.ca/cb6ad247ac929f3/1919/14465391/1/Acura-ILX-2022.jpg'],
  });
  await gm('PATCH', `/api/vehicles/${car.data.id}`, { detail_url: 'https://www.vwmoncton.com/used/2022-Acura-ILX-id14465391.html' });

  // 3. Preview: bilingual caption from the real data + the vehicle link; branded image uploaded.
  const gen = await gm('POST', '/api/generate', { post_type: 'used_featured', vehicle_id: car.data.id, platforms: ['facebook'], details: {} });
  const post = gen.data.posts[0];
  assert.match(post.content, /2022 Acura ILX Premium/);
  assert.match(post.content, /\$24,523/);
  assert.match(post.content, /24\s523\s\$/);
  assert.match(post.content, /https:\/\/www\.vwmoncton\.com\/used\/2022-Acura-ILX-id14465391\.html/);
  const img = await gm('POST', '/api/media', undefined, { raw: PNG, type: 'image/png' });
  await gm('PATCH', `/api/posts/${post.id}`, { media: [img.data.url] });

  // 4. Approve, then publish: blocked while the Page is locked.
  assert.equal((await gm('POST', `/api/posts/${post.id}/approve`)).data.status, 'approved');
  const locked = await gm('POST', `/api/posts/${post.id}/publish`);
  assert.equal(locked.status, 423);
  assert.match(locked.data.error, /locked/);
  assert.equal(graphCalls.filter((c) => c.path.endsWith('/photos')).length, 0, 'nothing sent to Facebook');

  // 5. Only the platform owner can unlock, by typing the Page name; a live Page needs explicit approval.
  const pages = (await owner('GET', '/api/admin/pages')).data;
  const testPage = pages.find((p) => p.external_id === 'PAGE_TEST');
  const livePage = pages.find((p) => p.external_id === 'PAGE_LIVE');
  assert.equal((await gm('POST', `/api/admin/pages/${testPage.id}/unlock`, { confirm_name: 'Social Dealer Test Page', kind: 'test' })).status, 403, 'the dealership cannot unlock');
  assert.equal((await owner('POST', `/api/admin/pages/${testPage.id}/unlock`, { confirm_name: 'Test', kind: 'test' })).status, 400);
  assert.equal((await owner('POST', `/api/admin/pages/${livePage.id}/unlock`, { confirm_name: 'Volkswagen Moncton', kind: 'live' })).status, 400, 'live needs approve_live');
  const unlocked = await owner('POST', `/api/admin/pages/${testPage.id}/unlock`, { confirm_name: 'Social Dealer Test Page', kind: 'test' });
  assert.deepEqual([unlocked.data.publish_allowed, unlocked.data.is_test, unlocked.data.unlocked_by], [1, 1, 'owner@platform.example']);

  // 6. Publish to the test Page: the image is uploaded directly, then the post is read back and checked.
  const published = await gm('POST', `/api/posts/${post.id}/publish`);
  assert.equal(published.data.status, 'published', published.data.error);
  const upload = graphCalls.find((c) => c.path.endsWith('/PAGE_TEST/photos'));
  assert.deepEqual(upload.body.source, { blob: 'image/png', size: PNG.length });
  assert.equal(upload.body.access_token, 'PAGE_TOKEN', 'decrypted on the server only');
  assert.match(upload.body.caption, /\$24,523/);
  assert.equal(published.data.external_url, 'https://www.facebook.com/PAGE_TEST/posts/123');
  assert.deepEqual(
    [published.data.publish_check.ok, published.data.publish_check.photo, published.data.publish_check.caption, published.data.publish_check.price, published.data.publish_check.link],
    [true, true, true, true, true],
  );
  assert.equal(graphCalls.filter((c) => c.path.includes('PAGE_LIVE')).length, 0, 'nothing ever sent to the live Page');

  // 7. Pointing the unlocked test Page at another Page locks it again.
  const moved = await gm('PATCH', `/api/accounts/${testPage.id}`, { external_id: 'PAGE_LIVE' });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.publish_allowed, 0, 'retargeted Page is locked again');
});
