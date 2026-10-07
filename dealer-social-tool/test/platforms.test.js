// Live network adapters and the OAuth connect flow, against a stubbed fetch.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_ID = 'gid';
process.env.GOOGLE_CLIENT_SECRET = 'gsecret';

const { tenantTest } = await import('./helpers.js');
const { facebookAdapter, instagramAdapter } = await import('../src/platforms/meta.js');
const { xAdapter } = await import('../src/platforms/x.js');
const { linkedinAdapter } = await import('../src/platforms/linkedin.js');
const { googleAdapter } = await import('../src/platforms/google.js');
const { tiktokAdapter } = await import('../src/platforms/tiktok.js');
const { ensureFreshToken, OAUTH_PROVIDERS } = await import('../src/platforms/index.js');
const { createAccount, getAccountRaw, listAccounts } = await import('../src/services/accounts.js');
const oauth = await import('../src/services/oauth.js');
const { createPost, approvePost } = await import('../src/services/posts.js');
const { publishPost } = await import('../src/services/publisher.js');

let calls;
let replies;
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  replies = [];
  globalThis.fetch = async (url, init = {}) => {
    const body =
      init.body && (init.headers?.['content-type'] === 'application/json' ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body)));
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body });
    const next = replies.shift() || { body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status || 200, headers: { 'content-type': 'application/json', ...(next.headers || {}) } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const account = (extra = {}) => ({ id: 1, external_id: 'EXT', access_token: 'TOKEN', ...extra });
const post = (extra = {}) => ({ id: 9, content: 'Hi', media: [], metrics: {}, ...extra });

test('Facebook: text posts go to /feed, photo posts to /photos', async () => {
  replies.push({ body: { id: 'PAGE_POST' } });
  const r = await facebookAdapter.publish(post(), account(), 'Hello');
  assert.match(calls[0].url, /\/EXT\/feed$/);
  assert.deepEqual(calls[0].body, { message: 'Hello', access_token: 'TOKEN' });
  assert.equal(r.external_id, 'PAGE_POST');

  replies.push({ body: { id: 'PHOTO', post_id: 'PAGE_PHOTO_POST' } });
  const r2 = await facebookAdapter.publish(post({ media: ['https://img/1.jpg'] }), account(), 'Hello');
  assert.match(calls[1].url, /\/EXT\/photos$/);
  assert.equal(calls[1].body.url, 'https://img/1.jpg');
  assert.equal(r2.external_id, 'PAGE_PHOTO_POST');
});

test('Instagram: container then publish, needs an image', async () => {
  await assert.rejects(instagramAdapter.publish(post(), account(), 'x'), /need an image/);
  replies.push({ body: { id: 'CONTAINER' } }, { body: { id: 'MEDIA' } }, { body: { permalink: 'https://instagram.com/p/abc' } });
  const r = await instagramAdapter.publish(post({ media: ['https://img/1.jpg'] }), account(), 'Caption');
  assert.match(calls[0].url, /\/EXT\/media$/);
  assert.equal(calls[1].body.creation_id, 'CONTAINER');
  assert.equal(r.external_url, 'https://instagram.com/p/abc');
});

test('Graph API errors surface with the API message', async () => {
  replies.push({ status: 400, body: { error: { message: 'Invalid OAuth access token', code: 190 } } });
  await assert.rejects(facebookAdapter.publish(post(), account(), 'x'), /Invalid OAuth access token/);
});

test('X: posts a tweet with a bearer user token', async () => {
  replies.push({ body: { data: { id: '123' } } });
  const r = await xAdapter.publish(post(), account(), 'Tweet!');
  assert.equal(calls[0].url, 'https://api.x.com/2/tweets');
  assert.equal(calls[0].headers.authorization, 'Bearer TOKEN');
  assert.deepEqual(calls[0].body, { text: 'Tweet!' });
  assert.equal(r.external_url, 'https://x.com/i/web/status/123');
});

test('LinkedIn: versioned Posts API with escaped commentary and hashtags', async () => {
  replies.push({ status: 201, body: {}, headers: { 'x-restli-id': 'urn:li:share:1' } });
  const r = await linkedinAdapter.publish(post(), account({ external_id: '555' }), 'New (2025) arrival! #VW');
  assert.equal(calls[0].url, 'https://api.linkedin.com/rest/posts');
  assert.match(calls[0].headers['LinkedIn-Version'], /^\d{6}$/);
  assert.equal(calls[0].body.author, 'urn:li:organization:555');
  assert.equal(calls[0].body.commentary, 'New \\(2025\\) arrival! {hashtag|\\#|VW}');
  assert.equal(r.external_id, 'urn:li:share:1');
});

test('Google Business Profile: local post with photo and website button', async () => {
  replies.push({ body: { name: 'accounts/1/locations/2/localPosts/3', searchUrl: 'https://g.page/x' } });
  await googleAdapter.publish(
    post({ media: ['https://img/1.jpg'], link_url: 'https://dealer.example' }),
    account({ external_id: 'accounts/1/locations/2' }),
    'Update',
  );
  assert.equal(calls[0].url, 'https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts');
  assert.equal(calls[0].body.topicType, 'STANDARD');
  assert.deepEqual(calls[0].body.media, [{ mediaFormat: 'PHOTO', sourceUrl: 'https://img/1.jpg' }]);
  assert.deepEqual(calls[0].body.callToAction, { actionType: 'LEARN_MORE', url: 'https://dealer.example' });
});

test('Google reviews become inbox items (only unanswered ones)', async () => {
  replies.push({
    body: {
      reviews: [
        {
          name: 'accounts/1/locations/2/reviews/a',
          reviewer: { displayName: 'Ann' },
          starRating: 'FIVE',
          comment: 'Great!',
          createTime: '2026-09-01T00:00:00Z',
        },
        { name: 'accounts/1/locations/2/reviews/b', starRating: 'ONE', reviewReply: { comment: 'Sorry' } },
      ],
    },
  });
  const reviews = await googleAdapter.fetchReviews(account({ external_id: 'accounts/1/locations/2' }));
  assert.deepEqual(
    reviews.map((r) => [r.author, r.rating]),
    [['Ann', 5]],
  );
});

test('TikTok: photo carousel direct post, video when the URL is an mp4', async () => {
  replies.push({ body: { data: { publish_id: 'p1' }, error: { code: 'ok' } } });
  const r = await tiktokAdapter.publish(post({ media: ['https://cdn/1.jpg', 'https://cdn/2.jpg'] }), account(), 'Caption');
  assert.match(calls[0].url, /post\/publish\/content\/init/);
  assert.equal(calls[0].body.media_type, 'PHOTO');
  assert.deepEqual(calls[0].body.source_info.photo_images, ['https://cdn/1.jpg', 'https://cdn/2.jpg']);
  assert.equal(r.external_id, 'p1');

  replies.push({ body: { data: { publish_id: 'v1' }, error: { code: 'ok' } } });
  await tiktokAdapter.publish(post({ media: ['https://cdn/clip.mp4'] }), account(), 'Video');
  assert.match(calls[1].url, /post\/publish\/video\/init/);

  replies.push({ body: { error: { code: 'access_token_invalid', message: 'bad token' } } });
  await assert.rejects(tiktokAdapter.publish(post({ media: ['https://cdn/1.jpg'] }), account(), 'x'), /bad token/);
});

tenantTest('expiring tokens are refreshed before publishing, and stored encrypted', async () => {
  const acct = createAccount({
    platform: 'google_business',
    display_name: 'Store',
    mode: 'live',
    external_id: 'accounts/1/locations/2',
    access_token: 'old',
    refresh_token: 'refresh-me',
    token_expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  replies.push({ body: { access_token: 'fresh', expires_in: 3600 } });
  const fresh = await ensureFreshToken(getAccountRaw(acct.id));
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].body.refresh_token, 'refresh-me');
  assert.equal(fresh.access_token, 'fresh');
  assert.equal(getAccountRaw(acct.id).access_token, 'fresh');
  assert.equal(getAccountRaw(acct.id).refresh_token, 'refresh-me');

  // A live publish failure is recorded on the account for the Settings page.
  const p = createPost({ platform: 'google_business', content: 'Hi' });
  approvePost(p.id);
  replies.push({ status: 403, body: { error: { message: 'The caller does not have permission' } } });
  const failed = await publishPost(p.id);
  assert.equal(failed.status, 'failed');
  assert.match(listAccounts().find((a) => a.id === acct.id).last_error, /permission/);
});

tenantTest('OAuth connect: start → callback → pick pages → live accounts', async () => {
  OAUTH_PROVIDERS.fake = {
    label: 'Fake',
    platforms: ['facebook', 'instagram'],
    impl: {
      configured: () => true,
      authorizeUrl: ({ state, redirectUri }) => `https://auth.example/?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      exchange: async ({ code }) => [
        { platform: 'facebook', external_id: 'PAGE1', display_name: `Page (${code})`, access_token: 'page-token' },
        { platform: 'instagram', external_id: 'IG1', display_name: '@page', access_token: 'page-token' },
      ],
    },
  };
  const { url } = oauth.startOAuth('fake', 1);
  const state = new URL(url).searchParams.get('state');
  assert.match(decodeURIComponent(url), /\/oauth\/fake\/callback/);
  await oauth.completeOAuth('fake', state, 'CODE');
  const options = oauth.pendingOptions(state);
  assert.deepEqual(
    options.map((o) => o.display_name),
    ['Page (CODE)', '@page'],
  );
  assert.equal(JSON.stringify(options).includes('page-token'), false, 'tokens never reach the browser');
  const before = listAccounts().length;
  oauth.connectOptions(state, [0]);
  const live = listAccounts().filter((a) => a.mode === 'live');
  assert.equal(listAccounts().length, before + 1);
  assert.equal(live[0].external_id, 'PAGE1');
  assert.throws(() => oauth.pendingOptions(state), /expired/);
  assert.throws(() => oauth.startOAuth('meta', 1), /not configured/);
  delete OAUTH_PROVIDERS.fake;
});
