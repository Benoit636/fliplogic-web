// Phase 3: bilingual captions, post images, manager approval before anything is posted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-media3-'));
process.env.MEDIA_DIR = mediaDir;
process.env.ALLOW_SIGNUP = '0';

const { openDb, get } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDealerWithAdmin, PRESETS } = await import('../src/services/setup.js');
const { writeObjectivePost, BILINGUAL_SEPARATOR, IMAGE_LABELS, OBJECTIVE_BY_KEY } = await import('../src/shared/objectives.js');
const { importRemotePhoto } = await import('../src/services/media.js');
const { runWithTenant } = await import('../src/tenant.js');
const { adminUpdateDealership } = await import('../src/services/admin.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);

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

const realFetch = globalThis.fetch;
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
    return { status: res.status, data };
  };
}
const tokenOf = (url) => new URL(url).searchParams.get('token');

const DEALER = {
  name: 'Volkswagen Moncton',
  phone: '(506) 555-0100',
  distance_unit: 'km',
  compliance_notes: 'Plus HST and licensing.',
  compliance_notes_fr: 'TVH et immatriculation en sus.',
  call_to_action: 'Book your test drive today!',
  call_to_action_fr: 'Réservez votre essai routier dès aujourd’hui!',
  default_hashtags: '#VWMoncton',
};
const GTI = { year: '2022', make: 'Volkswagen', model: 'Golf GTI', mileage: '38500', price: '31900', previous_price: '32900', features: 'DSG\nHarman Kardon' };
const fb = { maxChars: 63206, maxHashtags: 5 };

test('captions in English, French or both; every goal has French copy and an image headline', () => {
  const en = writeObjectivePost({ objectiveKey: 'used_price_drop', details: GTI, dealer: DEALER, platform: 'facebook', rules: fb, language: 'en' });
  const fr = writeObjectivePost({ objectiveKey: 'used_price_drop', details: GTI, dealer: DEALER, platform: 'facebook', rules: fb, language: 'fr' });
  const both = writeObjectivePost({ objectiveKey: 'used_price_drop', details: GTI, dealer: DEALER, platform: 'facebook', rules: fb, language: 'bilingual' });
  assert.match(en.content, /Price drop/);
  assert.doesNotMatch(en.content, /Baisse/);
  assert.match(fr.content, /Baisse de prix/);
  assert.match(fr.content, /31\s900\s\$/, 'French money format');
  assert.match(fr.content, /Réservez votre essai routier/);
  assert.match(fr.content, /TVH et immatriculation en sus/);
  assert.doesNotMatch(fr.content, /Price drop/);
  const [first, second] = both.content.split(BILINGUAL_SEPARATOR);
  assert.match(first, /Price drop/);
  assert.match(second, /Baisse de prix/);
  assert.equal(both.content.match(/555-0100/g).length, 1, 'phone once, after both languages');
  assert.match(both.content, /Plus HST and licensing\.\n\nTVH et immatriculation en sus\./);
  assert.ok(both.hashtags.includes('#UsedCars') && both.hashtags.includes('#VehiculesUsages'));
  const x = writeObjectivePost({ objectiveKey: 'used_price_drop', details: GTI, dealer: DEALER, platform: 'x', rules: { maxChars: 280, maxHashtags: 2 }, language: 'bilingual' });
  assert.ok(!x.content.includes('Baisse') && x.content.length <= 280, 'X stays one language');
  for (const key of Object.keys(OBJECTIVE_BY_KEY)) {
    assert.ok(IMAGE_LABELS[key]?.en && IMAGE_LABELS[key]?.fr, `image headline for ${key}`);
    const post = writeObjectivePost({ objectiveKey: key, details: { make: 'Volkswagen', model: 'Atlas', price: '50000' }, dealer: DEALER, platform: 'facebook', rules: fb, language: 'fr' });
    assert.doesNotMatch(post.content, /\b(the|Book|Call or message)\b/, `${key} French copy has no English left`);
  }
});

test('approval workflow: staff create from inventory → admin approves (recorded) → ready to post', async () => {
  const vw = PRESETS['vw-moncton'];
  const d = createDealerWithAdmin({ name: vw.name, dealerNumber: vw.dealerNumber, adminEmail: 'gm@vw.example', profile: vw.profile });
  assert.equal(d.dealership.caption_language, 'bilingual', 'VW Moncton writes bilingual captions by default');
  assert.equal(d.dealership.require_approval, 1);
  const admin = client();
  await admin('POST', `/api/auth/invite/${tokenOf(d.invite_url)}/accept`, { name: 'Gina Admin', password: 'Approve-Every-Post-1' });
  const inv = await admin('POST', '/api/team/invites', { email: 'sam@vw.example', role: 'staff' });
  const staff = client();
  await staff('POST', `/api/auth/invite/${tokenOf(inv.data.invite_url)}/accept`, { name: 'Sam', password: 'Sales-Floor-2026' });
  const car = await admin('POST', '/api/vehicles', { stock_number: 'U22104', year: 2022, make: 'Volkswagen', model: 'Golf GTI', price: 31900, mileage: 38500 });

  // Staff: create in the dealership's default language (bilingual) from the inventory vehicle.
  const gen = await staff('POST', '/api/generate', { post_type: 'used_featured', vehicle_id: car.data.id, platforms: ['facebook', 'instagram'], details: {} });
  assert.equal(gen.status, 201);
  const [p1, p2] = gen.data.posts;
  assert.equal(p1.language, 'bilingual');
  assert.ok(p1.content.includes(BILINGUAL_SEPARATOR.trim()));
  const fr = await staff('POST', '/api/generate', { post_type: 'used_featured', vehicle_id: car.data.id, platforms: ['facebook'], details: {}, language: 'fr' });
  assert.equal(fr.data.posts[0].language, 'fr');
  assert.match(fr.data.posts[0].content, /en vedette/);

  // The rendered PNG is uploaded and attached with its design.
  const img = await staff('POST', '/api/media', undefined, { raw: PNG, type: 'image/png' });
  assert.equal(img.status, 201);
  const patched = await staff('PATCH', `/api/posts/${p1.id}`, { media: [img.data.url], design: { template: 'bold', size: 'portrait', image: img.data.url } });
  assert.deepEqual(patched.data.media, [img.data.url]);
  assert.equal(patched.data.design.template, 'bold');

  // Staff can't post, approve or publish it themselves.
  assert.equal((await staff('POST', `/api/posts/${p1.id}/mark-posted`)).status, 403);
  assert.equal((await staff('POST', `/api/posts/${p1.id}/approve`)).status, 403);
  assert.equal((await staff('POST', `/api/posts/${p1.id}/publish`)).status, 403);
  assert.equal((await staff('POST', `/api/posts/${p1.id}/submit`)).data.status, 'pending_approval');
  assert.equal((await staff('PATCH', `/api/posts/${p1.id}`, { content: 'sneaky edit' })).status, 200, 'staff may still fix a post waiting for approval');

  // Admin approves: who and when is recorded.
  const approved = await admin('POST', `/api/posts/${p1.id}/approve`);
  assert.equal(approved.data.status, 'approved');
  assert.equal(approved.data.approved_by_name, 'Gina Admin');
  assert.ok(approved.data.approved_at);
  assert.equal((await staff('PATCH', `/api/posts/${p1.id}`, { content: 'changed after approval' })).status, 403, 'approved posts are locked for staff');
  const posted = await staff('POST', `/api/posts/${p1.id}/mark-posted`);
  assert.equal(posted.status, 200, 'staff can post it once approved');
  assert.equal(posted.data.status, 'published');
  assert.match(get('SELECT details FROM activity_log WHERE action = ? ORDER BY id DESC', 'post.approved').details, /by Gina Admin/);

  // Rejected posts lose any approval; an admin's own "I posted it" approves first.
  await staff('POST', `/api/posts/${p2.id}/submit`);
  const rejected = await admin('POST', `/api/posts/${p2.id}/reject`, { reason: 'Use the red one' });
  assert.equal(rejected.data.approved_at, null);
  const own = await admin('POST', `/api/posts/${fr.data.posts[0].id}/mark-posted`);
  assert.equal(own.data.status, 'published');
  assert.equal(own.data.approved_by_name, 'Gina Admin');

  // Full autopilot (posting without approval) is off; only the platform owner can change that.
  assert.equal((await admin('PUT', '/api/dealership', { autonomy: 'autopilot' })).status, 409);
  adminUpdateDealership(d.dealership.id, { require_approval: false });
  assert.equal((await admin('PUT', '/api/dealership', { autonomy: 'autopilot' })).status, 200);
  adminUpdateDealership(d.dealership.id, { require_approval: true });
  assert.equal((await admin('GET', '/api/dealership')).data.autonomy, 'assist');

  // Profile: French call to action / legal line and caption language.
  const prof = await admin('PUT', '/api/dealership', { caption_language: 'fr', call_to_action_fr: 'Passez nous voir!' });
  assert.equal(prof.data.caption_language, 'fr');
  assert.equal((await admin('PUT', '/api/dealership', { caption_language: 'de' })).status, 400);
  const meta = (await staff('GET', '/api/meta')).data;
  assert.equal(meta.image_labels.used_price_drop.fr, 'Baisse de prix');
  assert.equal(meta.languages.bilingual, 'English + Français');
});

test('inventory photos are copied safely so the post image can be saved as PNG', async () => {
  const d = createDealerWithAdmin({ name: 'Photo Motors', adminEmail: 'gm@photo.example' });
  const other = createDealerWithAdmin({ name: 'Other Motors', adminEmail: 'gm@other.example' });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/moved.jpg')) return new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/secret.jpg' } });
    if (String(url).endsWith('/page.html')) return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response(JPG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  try {
    await runWithTenant(d.dealership.id, async () => {
      const a = await importRemotePhoto('http://93.184.216.34/cars/u22104.jpg');
      assert.match(a.url, /^\/media\/\d+\/[\w-]+\.jpg$/);
      const again = await importRemotePhoto('http://93.184.216.34/cars/u22104.jpg');
      assert.equal(again.url, a.url, 'fetched once, then reused');
      assert.equal(calls.length, 1);
      await assert.rejects(importRemotePhoto('http://127.0.0.1/admin.jpg'), /private network/);
      await assert.rejects(importRemotePhoto('http://93.184.216.34/moved.jpg'), /private network/, 'redirects are checked too');
      await assert.rejects(importRemotePhoto('http://93.184.216.34/page.html'), /JPG, PNG or WebP/);
      await assert.rejects(importRemotePhoto('file:///etc/passwd'), /http/);
      assert.equal((await importRemotePhoto(a.url)).url, a.url, 'our own photos pass straight through');
      await runWithTenant(other.dealership.id, async () => {
        await assert.rejects(importRemotePhoto(a.url), /another dealership/);
      });
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
