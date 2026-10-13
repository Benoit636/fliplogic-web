// Pilot setup (Phase 1): Dealer #001, profile & logo, Dealer Admin / Dealer Staff logins, isolation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-media-'));
process.env.MEDIA_DIR = mediaDir;
process.env.ALLOW_SIGNUP = '0'; // pilot: no self-serve signup
process.env.SUPERADMIN_EMAILS = 'platform@owner.example';

const { openDb, get, MIGRATIONS } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createDealerWithAdmin, inviteDealerAdmin, PRESETS } = await import('../src/services/setup.js');
const auth = await import('../src/services/auth.js');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

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
  return async (method, p, body, { raw, type } = {}) => {
    const res = await fetch(base + p, {
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

test('migration 4 turns owners and managers into Dealer Admins and numbers existing dealerships', () => {
  const db = new DatabaseSync(':memory:');
  for (const sql of MIGRATIONS.slice(0, 3)) db.exec(sql);
  db.exec(`INSERT INTO users (email, password_hash) VALUES ('o@x.ca','h'), ('m@x.ca','h'), ('s@x.ca','h');
    INSERT INTO dealerships (name) VALUES ('Old Motors');
    INSERT INTO memberships (user_id, dealership_id, role) VALUES (1,1,'owner'), (2,1,'manager'), (3,1,'staff');
    INSERT INTO invites (dealership_id, email, role, token_hash, expires_at) VALUES (1,'n@x.ca','manager','t','2099-01-01');`);
  db.exec(MIGRATIONS[3]);
  assert.deepEqual(
    db.prepare('SELECT role FROM memberships ORDER BY user_id').all().map((r) => r.role),
    ['admin', 'admin', 'staff'],
  );
  assert.equal(db.prepare('SELECT role FROM invites').get().role, 'admin');
  assert.equal(db.prepare('SELECT dealer_number FROM dealerships').get().dealer_number, '001');
  assert.throws(() => db.exec(`INSERT INTO memberships (user_id, dealership_id, role) VALUES (3, 1, 'owner')`), /CHECK|UNIQUE|constraint/);
});

test('pilot: Dealer #001, admin and staff logins, roles, logo and isolation', async () => {
  // Self-serve signup is closed during the pilot.
  const anon = client();
  assert.equal((await anon('GET', '/api/public/plans')).data.signup_open, false);
  const closed = await anon('POST', '/api/auth/signup', { name: 'X', email: 'x@y.ca', password: 'longpassword1', dealership_name: 'X' });
  assert.equal(closed.status, 403);

  // Platform owner creates Volkswagen Moncton as Dealer #001 with a single-use admin link.
  const vw = PRESETS['vw-moncton'];
  const created = createDealerWithAdmin({ name: vw.name, dealerNumber: vw.dealerNumber, adminEmail: 'gm@vwmoncton.example', profile: vw.profile });
  assert.equal(created.dealership.dealer_number, '001');
  assert.equal(created.dealership.name, 'Volkswagen Moncton');
  assert.equal(created.dealership.province, 'NB');
  assert.equal(created.dealership.timezone, 'America/Moncton');
  assert.throws(() => createDealerWithAdmin({ name: 'Dup', dealerNumber: '001', adminEmail: 'a@b.ca' }), /already exists/);
  assert.throws(() => createDealerWithAdmin({ name: 'No email', adminEmail: 'nope' }), /valid admin email/);
  assert.equal(get('SELECT COUNT(*) AS n FROM users').n, 0, 'no account or password is created until the admin accepts');

  // The admin chooses their own password; weak ones are refused.
  const admin = client();
  const token = tokenOf(created.invite_url);
  const info = await admin('GET', `/api/auth/invite/${token}`);
  assert.equal(info.data.role_label, 'Dealer Admin');
  assert.equal((await admin('POST', `/api/auth/invite/${token}/accept`, { name: 'Gina', password: 'short' })).status, 400);
  assert.equal((await admin('POST', `/api/auth/invite/${token}/accept`, { name: 'Gina', password: 'gm-vwmoncton-2026' })).status, 400, 'no email name in password');
  assert.equal((await admin('POST', `/api/auth/invite/${token}/accept`, { name: 'Gina', password: 'Tiguan-Spring-2026' })).status, 200);
  assert.equal((await client()('POST', `/api/auth/invite/${token}/accept`, { name: 'Eve', password: 'another-pass-123' })).status, 400, 'links work once');
  const me = (await admin('GET', '/api/me')).data;
  assert.equal(me.role, 'admin');
  assert.equal(me.role_label, 'Dealer Admin');
  assert.equal(me.dealership.dealer_number, '001');
  assert.equal(me.can_add_dealership, false);
  assert.equal((await admin('POST', '/api/me/dealerships', { name: 'Side store' })).status, 403);

  // Profile and branding.
  const profile = await admin('PUT', '/api/dealership', {
    address: '1 Example Way',
    postal_code: 'E1A 0A1',
    phone: '(506) 555-0100',
    website: 'https://www.vwmoncton.example',
    brand_color: '#001e50',
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.data.postal_code, 'E1A 0A1');
  assert.equal((await admin('PUT', '/api/dealership', { brand_color: 'blue' })).status, 400);
  assert.equal((await admin('PUT', '/api/dealership', { website: 'not a site' })).status, 400);
  assert.equal((await admin('PUT', '/api/dealership', { name: '  ' })).status, 400);

  // Logo: PNG kept as PNG; SVG and fake images refused.
  const logo = await admin('POST', '/api/dealership/logo', undefined, { raw: PNG, type: 'image/png' });
  assert.equal(logo.status, 201);
  assert.match(logo.data.logo_url, /^\/media\/\d+\/[\w-]+\.png$/);
  const served = await fetch(base + logo.data.logo_url);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);
  assert.equal((await admin('POST', '/api/dealership/logo', undefined, { raw: '<svg onload="alert(1)"/>', type: 'image/svg+xml' })).status, 400);
  assert.equal((await admin('POST', '/api/dealership/logo', undefined, { raw: Buffer.from('not really a png at all'), type: 'image/png' })).status, 400);

  // Staff get their own login by invite.
  const inv = await admin('POST', '/api/team/invites', { email: 'sam@vwmoncton.example', role: 'staff' });
  assert.equal(inv.status, 201);
  const staff = client();
  assert.equal((await staff('POST', `/api/auth/invite/${tokenOf(inv.data.invite_url)}/accept`, { name: 'Sam', password: 'Golf-R-Weekend-9' })).status, 200);
  const staffMe = (await staff('GET', '/api/me')).data;
  assert.equal(staffMe.role, 'staff');
  assert.equal(staffMe.role_label, 'Dealer Staff');
  assert.equal((await staff('GET', '/api/dealership')).data.name, 'Volkswagen Moncton', 'staff can read the profile');
  assert.equal((await staff('PUT', '/api/dealership', { phone: '1' })).status, 403);
  assert.equal((await staff('POST', '/api/dealership/logo', undefined, { raw: PNG, type: 'image/png' })).status, 403);
  assert.equal((await staff('DELETE', '/api/dealership/logo')).status, 403);
  assert.equal((await staff('POST', '/api/team/invites', { email: 'friend@x.ca' })).status, 403);
  assert.equal((await staff('PATCH', `/api/team/members/${staffMe.user.id}`, { role: 'admin' })).status, 403);
  assert.equal((await staff('POST', '/api/vehicles', { make: 'VW', model: 'Golf' })).status, 403);
  const draft = await staff('POST', '/api/generate', { post_type: 'service_tip', platforms: ['facebook'] });
  assert.equal(draft.status, 201);
  assert.equal((await staff('POST', `/api/posts/${draft.data.posts[0].id}/publish`)).status, 403, 'staff cannot publish');

  // Old role names from older clients are mapped; unknown roles are refused.
  assert.equal((await admin('POST', '/api/team/invites', { email: 'mgr@vwmoncton.example', role: 'manager' })).status, 201);
  assert.equal((await admin('GET', '/api/team')).data.invites.find((i) => i.email === 'mgr@vwmoncton.example').role, 'admin');
  assert.equal((await admin('POST', '/api/team/invites', { email: 'x@vwmoncton.example', role: 'superuser' })).status, 400);
  // The last Dealer Admin can't be demoted.
  assert.equal((await admin('PATCH', `/api/team/members/${me.user.id}`, { role: 'staff' })).status, 400);

  // A second dealership is isolated from the first.
  const other = createDealerWithAdmin({ name: 'Other Motors', adminEmail: 'boss@other.example' });
  assert.equal(other.dealership.dealer_number, '002');
  const otherAdmin = client();
  await otherAdmin('POST', `/api/auth/invite/${tokenOf(other.invite_url)}/accept`, { name: 'Olu', password: 'Different-Pass-77' });
  assert.equal((await admin('POST', '/api/vehicles', { make: 'Volkswagen', model: 'Atlas', stock_number: 'VW1' })).status, 201);
  assert.equal((await otherAdmin('GET', '/api/dealership')).data.name, 'Other Motors');
  assert.equal((await otherAdmin('GET', '/api/dealership')).data.logo_url, '');
  assert.equal((await otherAdmin('GET', '/api/vehicles')).data.length, 0);
  assert.equal((await otherAdmin('GET', '/api/team')).data.members.length, 1);
  assert.equal((await otherAdmin('POST', '/api/me/switch', { dealership_id: created.dealership.id })).status, 403);
  assert.equal((await otherAdmin('GET', `/api/posts/${draft.data.posts[0].id}`)).status, 404);

  // Removing a staff member cuts their access immediately.
  assert.equal((await admin('DELETE', `/api/team/members/${staffMe.user.id}`)).status, 204);
  assert.equal((await staff('GET', '/api/dashboard')).status, 409);

  // Changing your password signs out your other devices.
  const adminPhone = client();
  await adminPhone('POST', '/api/auth/login', { email: 'gm@vwmoncton.example', password: 'Tiguan-Spring-2026' });
  assert.equal((await adminPhone('GET', '/api/me')).status, 200);
  assert.equal((await admin('POST', '/api/me/password', { current_password: 'Tiguan-Spring-2026', new_password: 'Atlas-Summer-2027' })).status, 200);
  assert.equal((await admin('GET', '/api/me')).status, 200, 'this device stays logged in');
  assert.equal((await adminPhone('GET', '/api/me')).status, 401, 'other devices are signed out');

  // A lost link can be replaced; the old one stops working.
  const again = inviteDealerAdmin('002', 'second@other.example');
  const again2 = inviteDealerAdmin('002', 'second@other.example');
  assert.equal((await anon('GET', `/api/auth/invite/${tokenOf(again.invite_url)}`)).status, 400);
  assert.equal((await anon('GET', `/api/auth/invite/${tokenOf(again2.invite_url)}`)).status, 200);
  assert.throws(() => inviteDealerAdmin('999', 'a@b.ca'), /No dealership/);
});

test('platform owner can add a dealership from the admin console', async () => {
  const created = createDealerWithAdmin({ name: 'Platform HQ', adminEmail: 'platform@owner.example' });
  const boss = client();
  assert.equal((await boss('POST', `/api/auth/invite/${tokenOf(created.invite_url)}/accept`, { name: 'Ben', password: 'Founder-Console-1' })).status, 200);
  const r = await boss('POST', '/api/admin/dealerships', { name: 'Smith Motors', admin_email: 'gm@smith.example' });
  assert.equal(r.status, 201);
  assert.match(r.data.dealership.dealer_number, /^\d{3}$/);
  assert.match(r.data.invite_url, /\/invite\?token=/);
  assert.equal((await client()('POST', '/api/admin/dealerships', { name: 'Nope', admin_email: 'a@b.ca' })).status, 403);
  assert.equal((await boss('POST', '/api/me/dealerships', { name: 'Superadmin can add' })).status, 201);
  assert.equal(auth.ROLE_LABELS.staff, 'Dealer Staff');
});

test('inventory over HTTP: admin previews and imports a CSV, staff search and pick vehicles but cannot import', async () => {
  const d = createDealerWithAdmin({ name: 'CSV Motors', adminEmail: 'gm@csv.example' });
  const admin = client();
  await admin('POST', `/api/auth/invite/${tokenOf(d.invite_url)}/accept`, { name: 'Gm', password: 'Inventory-Boss-1' });
  const csv = 'Stock #,VIN,Year,Make,Model,Trim,Mileage,Price,New/Used,Photos\nV1,3VV2B7AX5RM000001,2024,Volkswagen,Tiguan,Comfortline,12,39995,New,https://img/1.jpg\nU2,,2021,Volkswagen,Golf,GTI,50000,28995,Used,';
  const preview = await admin('POST', '/api/vehicles/import?dry_run=1', undefined, { raw: csv, type: 'text/plain' });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.created, 2);
  assert.equal((await admin('GET', '/api/vehicles?status=all')).data.length, 0, 'preview saves nothing');
  const done = await admin('POST', '/api/vehicles/import', undefined, { raw: csv, type: 'text/plain' });
  assert.equal(done.data.created, 2);
  assert.equal((await admin('POST', '/api/vehicles/import', undefined, { raw: csv, type: 'text/plain' })).data.unchanged, 2);
  assert.equal((await admin('POST', '/api/vehicles', { make: 'VW', model: 'Golf', stock_number: 'u2' })).status, 409);

  const inv = await admin('POST', '/api/team/invites', { email: 'rep@csv.example', role: 'staff' });
  const staff = client();
  await staff('POST', `/api/auth/invite/${tokenOf(inv.data.invite_url)}/accept`, { name: 'Rep', password: 'Sales-Floor-123' });
  const found = await staff('GET', '/api/vehicles?status=available&condition=new&q=tig');
  assert.deepEqual(found.data.map((v) => v.stock_number), ['V1']);
  assert.equal((await staff('POST', '/api/vehicles/import?dry_run=1', undefined, { raw: csv, type: 'text/plain' })).status, 403);
  assert.equal((await staff('PATCH', `/api/vehicles/${found.data[0].id}`, { price: 1 })).status, 403);
  // Staff create a post straight from the vehicle; it goes to the approval queue.
  const post = await staff('POST', '/api/generate', { post_type: 'new_vehicle_arrival', vehicle_id: found.data[0].id, platforms: ['facebook'], details: {} });
  assert.equal(post.status, 201);
  assert.match(post.data.posts[0].content, /Tiguan/);
  assert.equal(post.data.posts[0].vehicle_id, found.data[0].id);
  assert.equal((await client()('GET', '/api/vehicles')).status, 401);
});
