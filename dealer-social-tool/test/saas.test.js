// Multi-dealership SaaS behaviour: isolation, auth, plan limits, billing, HTTP API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPERADMIN_EMAILS = 'boss@platform.example';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_m';
process.env.STRIPE_PRICE_STARTER_MONTHLY = 'price_starter_m';

const { tenantTest, setupDb, addDealership } = await import('./helpers.js');
const { enterTenant } = await import('../src/tenant.js');
const { listVehicles, getVehicle } = await import('../src/services/inventory.js');
const { createPost, getPost, listPosts, approvePost } = await import('../src/services/posts.js');
const { publishPost } = await import('../src/services/publisher.js');
const { createAccount, listAccounts, getAccountRaw } = await import('../src/services/accounts.js');
const { updateBilling, getDealership } = await import('../src/services/dealership.js');
const { consumeAiPosts, usageCount } = await import('../src/services/entitlements.js');
const { createPostsFromIdea } = await import('../src/services/content.js');
const auth = await import('../src/services/auth.js');
const billing = await import('../src/services/billing.js');
const { outbox } = await import('../src/services/mailer.js');
const { get } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { platformOverview } = await import('../src/services/admin.js');

tenantTest('dealerships never see each other’s data', async (a) => {
  const postA = createPost({ platform: 'facebook', content: 'A only' });
  const b = addDealership('owner@b.example', 'B Motors');
  assert.equal(listVehicles().length, 2);
  assert.equal(listPosts().length, 0);
  assert.equal(getPost(postA.id), undefined);
  assert.equal(getVehicle(a.truck.id), undefined);
  assert.throws(() => createPost({ platform: 'facebook', content: 'x', vehicle_id: a.truck.id }), /not found/);
  enterTenant(a.dealership.id);
  assert.equal(getPost(postA.id).content, 'A only');
  assert.notEqual(a.dealership.id, b.dealership.id);
});

tenantTest('access tokens are encrypted at rest', () => {
  const acct = createAccount({ platform: 'x', display_name: '@dealer', mode: 'live', external_id: '123', access_token: 'secret-token-abcd' });
  const row = get('SELECT access_token FROM accounts WHERE id = ?', acct.id);
  assert.match(row.access_token, /^enc1:/);
  assert.equal(getAccountRaw(acct.id).access_token, 'secret-token-abcd');
  assert.equal(acct.token_hint, '••••abcd');
});

tenantTest('plan limits: accounts, AI posts, features', async (a) => {
  updateBilling(a.dealership.id, { plan: 'starter', subscription_status: 'active' });
  createAccount({ platform: 'x', display_name: '@x' });
  assert.equal(listAccounts().length, 3);
  assert.throws(() => createAccount({ platform: 'linkedin', display_name: 'in' }), /includes 3 social accounts/);

  consumeAiPosts(148);
  await createPostsFromIdea({ postType: 'service_tip', platforms: ['facebook', 'instagram'] });
  assert.equal(usageCount('ai_posts'), 150);
  await assert.rejects(createPostsFromIdea({ postType: 'service_tip', platforms: ['facebook'] }), /Monthly AI post limit/);

  const { updateDealership } = await import('../src/services/dealership.js');
  assert.throws(() => updateDealership({ autonomy: 'autopilot' }), /Pro plan/);
});

tenantTest('expired trials stop publishing but keep data readable', async (a) => {
  const post = createPost({ platform: 'facebook', content: 'hi' });
  approvePost(post.id);
  updateBilling(a.dealership.id, { trial_ends_at: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(publishPost(post.id), /trial has ended/);
  assert.equal(getPost(post.id).status, 'approved');
});

tenantTest('signup, login, password reset and invites', async (a) => {
  assert.throws(() => auth.signup({ email: 'owner@test.example', password: 'password123', dealershipName: 'Dup' }), /already exists/);
  assert.throws(() => auth.signup({ email: 'bad', password: 'password123', dealershipName: 'X' }), /valid email/);
  assert.throws(() => auth.login({ email: 'owner@test.example', password: 'wrong' }), /Wrong email/);
  const { token } = auth.login({ email: 'OWNER@test.example', password: 'password123' });
  const session = auth.getSession(token);
  assert.equal(session.dealershipId, a.dealership.id);
  assert.equal(session.role, 'owner');

  await auth.requestPasswordReset('owner@test.example');
  const resetToken = outbox.at(-1).text.match(/token=([\w-]+)/)[1];
  auth.resetPassword(resetToken, 'newpassword1');
  assert.equal(auth.getSession(token), null, 'old sessions are revoked');
  assert.throws(() => auth.resetPassword(resetToken, 'again12345'), /invalid or has expired/);
  auth.login({ email: 'owner@test.example', password: 'newpassword1' });

  const { invite_url } = await auth.inviteMember(a.dealership.id, a.user, { email: 'rep@test.example', role: 'staff' });
  const inviteToken = new URL(invite_url).searchParams.get('token');
  const accepted = auth.acceptInvite(inviteToken, { name: 'Rep', password: 'password123' });
  const repSession = auth.getSession(accepted.token);
  assert.equal(repSession.role, 'staff');
  assert.equal(repSession.dealershipId, a.dealership.id);
  assert.throws(() => auth.removeMember(a.dealership.id, a.user.id), /at least one owner/);
});

tenantTest('Stripe webhooks keep the subscription in sync (idempotently)', async (a) => {
  const fakeStripe = {
    webhooks: {
      constructEvent(body, sig) {
        if (sig !== 'good') throw new Error('bad signature');
        return JSON.parse(body);
      },
    },
  };
  billing.setStripeClient(fakeStripe);
  const sub = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    metadata: { dealership_id: String(a.dealership.id) },
    items: { data: [{ price: { id: 'price_starter_m' }, current_period_end: 1893456000 }] },
  };
  const event = (id, type, object) => Buffer.from(JSON.stringify({ id, type, data: { object } }));
  await assert.rejects(billing.handleWebhook(event('evt_0', 'customer.subscription.updated', sub), 'bad'), /Invalid signature/);

  await billing.handleWebhook(event('evt_1', 'customer.subscription.updated', sub), 'good');
  let d = getDealership();
  assert.equal(d.plan, 'starter');
  assert.equal(d.subscription_status, 'active');
  assert.equal(d.stripe_customer_id, 'cus_1');
  assert.equal(d.current_period_end, '2030-01-01T00:00:00.000Z');

  const dup = await billing.handleWebhook(event('evt_1', 'customer.subscription.updated', { ...sub, status: 'canceled' }), 'good');
  assert.equal(dup.duplicate, true);

  await billing.handleWebhook(event('evt_2', 'customer.subscription.deleted', { ...sub, metadata: {}, status: 'canceled' }), 'good');
  d = getDealership();
  assert.equal(d.subscription_status, 'canceled');
  assert.equal(d.stripe_subscription_id, null);

  const overview = platformOverview();
  assert.equal(overview.totals.dealerships, 1);
});

tenantTest('leads are forwarded to the CRM as ADF/XML once', async (a) => {
  const { updateDealership } = await import('../src/services/dealership.js');
  const { ingestMessage, escalateMessage } = await import('../src/services/inbox.js');
  updateDealership({ crm_lead_email: 'leads@crm.example' });
  const post = createPost({ platform: 'facebook', content: 'F-150!', vehicle_id: a.truck.id });
  const before = outbox.length;
  const lead = await ingestMessage({ platform: 'facebook', author: 'Jess <Martin>', text: 'Is this still available? Price?', post_id: post.id });
  assert.equal(lead.is_lead, true);
  assert.ok(lead.forwarded_at);
  const mail = outbox.at(-1);
  assert.equal(outbox.length, before + 1);
  assert.equal(mail.to, 'leads@crm.example');
  assert.match(mail.text, /<\?adf version="1.0"\?>/);
  assert.match(mail.text, /<name part="full">Jess &lt;Martin&gt;<\/name>/);
  assert.match(mail.text, /<model>F-150<\/model>/);
  await escalateMessage(lead.id);
  assert.equal(outbox.length, before + 1, 'not forwarded twice');

  const question = await ingestMessage({ platform: 'facebook', author: 'Amy', text: 'Are you open Sunday?' });
  assert.equal(question.is_lead, false);
  await escalateMessage(question.id);
  assert.equal(outbox.length, before + 2, 'escalating by hand forwards it');
});

tenantTest('monthly results email goes out once on the 1st, local time', async () => {
  const { sendMonthlyReports } = await import('../src/services/reports.js');
  const firstOfMonth = new Date('2026-11-01T13:00:00Z'); // 09:00 in Moncton
  const before = outbox.length;
  assert.equal(await sendMonthlyReports(firstOfMonth), 1);
  assert.match(outbox.at(-1).subject, /results this month/);
  assert.equal(await sendMonthlyReports(firstOfMonth), 0, 'only once per month');
  assert.equal(await sendMonthlyReports(new Date('2026-11-02T13:00:00Z')), 0);
  assert.equal(outbox.length, before + 1);
});

// ---- HTTP level ----
let server;
let base;
before(async () => {
  setupDb();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
}

test('HTTP: signup → dashboard, CSRF header, roles, admin', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/dashboard')).status, 401);
  assert.equal((await anon('GET', '/app')).status, 302);
  assert.equal((await anon('GET', '/')).status, 200);
  assert.equal((await anon('GET', '/healthz')).data.ok, true);

  const noCsrf = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403);

  const owner = client();
  const signup = await owner('POST', '/api/auth/signup', { name: 'Pat', email: 'pat@dealer.example', password: 'password123', dealership_name: 'Pat Auto' });
  assert.equal(signup.status, 201);
  const dash = await owner('GET', '/api/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.data.dealership.name, 'Pat Auto');
  assert.equal(dash.data.subscription.plan, 'pro');
  assert.equal(dash.data.subscription.active, true);

  const inv = await owner('POST', '/api/team/invites', { email: 'staff@dealer.example', role: 'staff' });
  assert.equal(inv.status, 201);
  const staff = client();
  const token = new URL(inv.data.invite_url).searchParams.get('token');
  assert.equal((await staff('GET', `/api/auth/invite/${token}`)).data.dealership_name, 'Pat Auto');
  assert.equal((await staff('POST', `/api/auth/invite/${token}/accept`, { name: 'Sam', password: 'password123' })).status, 200);
  assert.equal((await staff('GET', '/api/me')).data.role, 'staff');
  assert.equal((await staff('POST', '/api/vehicles', { make: 'Kia', model: 'Soul' })).status, 403);
  assert.equal((await staff('POST', '/api/billing/checkout', { plan: 'pro' })).status, 403);
  const draft = await staff('POST', '/api/generate', { post_type: 'service_tip', platforms: ['facebook'] });
  assert.equal(draft.status, 201);
  assert.equal((await staff('POST', `/api/posts/${draft.data.posts[0].id}/approve`)).status, 403);
  assert.equal((await owner('POST', `/api/posts/${draft.data.posts[0].id}/approve`)).status, 200);

  assert.equal((await owner('GET', '/api/admin/overview')).status, 403);
  const boss = client();
  await boss('POST', '/api/auth/signup', { name: 'Boss', email: 'boss@platform.example', password: 'password123', dealership_name: 'Platform Demo' });
  const overview = await boss('GET', '/api/admin/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.data.totals.dealerships >= 2);

  const logout = await owner('POST', '/api/auth/logout');
  assert.equal(logout.status, 200);
});
