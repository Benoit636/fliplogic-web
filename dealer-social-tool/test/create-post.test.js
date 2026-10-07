// The New/Used "Create Post" flow: objectives, briefs, photos, manual posting.
import assert from 'node:assert/strict';
import { tenantTest as test } from './helpers.js';
import { createPostsFromIdea } from '../src/services/content.js';
import { getPost, markPostedManually, approvePost } from '../src/services/posts.js';
import { refreshMetrics, publishPost } from '../src/services/publisher.js';
import { savePhoto, cleanMediaList, absoluteMediaUrl } from '../src/services/media.js';
import { OBJECTIVE_LIST, writeObjectivePost, missingFields } from '../src/shared/objectives.js';
import { createAccount } from '../src/services/accounts.js';

const used = {
  year: '2021',
  make: 'Honda',
  model: 'Civic',
  trim: 'EX',
  mileage: '64000',
  price: '23995',
  previous_price: '25995',
  stock_number: 'R2404',
  features: 'Sunroof\nHeated seats',
};

test('used objective posts are written from typed details, without an inventory record', async () => {
  const { posts } = await createPostsFromIdea({
    postType: 'used_price_drop',
    details: used,
    platforms: ['facebook', 'instagram', 'linkedin'],
    media: ['/media/1/abc.jpg'],
  });
  assert.equal(posts.length, 3);
  const fb = posts[0];
  assert.equal(fb.status, 'draft');
  assert.equal(fb.vehicle_id, null);
  assert.deepEqual(fb.media, ['/media/1/abc.jpg']);
  assert.match(fb.content, /Was \$25,995, now \$23,995/);
  assert.equal(fb.brief.condition, 'used');
  assert.equal(fb.brief.objective, 'used_price_drop');
  assert.equal(fb.brief.details.stock_number, 'R2404');
});

test('each objective reads differently and never says "aged"', () => {
  const dealer = { name: 'Test Motors', call_to_action: 'Call us!', compliance_notes: 'Plus tax.' };
  const hooks = new Set();
  for (const o of OBJECTIVE_LIST) {
    const r = writeObjectivePost({
      objectiveKey: o.key,
      details: { ...used, payment: '$189 bi-weekly' },
      dealer,
      platform: 'facebook',
      rules: { maxChars: 63206, maxHashtags: 5 },
    });
    hooks.add(r.content.split('\n')[0]);
    assert.doesNotMatch(r.content, /\baged\b/i);
    assert.match(r.content, /Plus tax\./, `${o.key} adds the compliance line when pricing is shown`);
  }
  assert.equal(hooks.size, OBJECTIVE_LIST.length - 1, 'every objective opens with its own hook (manager specials share one)');
  const x = writeObjectivePost({ objectiveKey: 'used_fresh_arrival', details: used, dealer, platform: 'x', rules: { maxChars: 280, maxHashtags: 2 } });
  assert.ok(x.content.length + x.hashtags.join(' ').length + 2 <= 280);
});

test('required details are checked before spending an AI post', async () => {
  assert.deepEqual(missingFields('used_featured', { make: 'Ford' }), ['Model']);
  assert.deepEqual(missingFields('new_trade_up_event', {}), []);
  await assert.rejects(createPostsFromIdea({ postType: 'used_featured', details: { make: 'Ford' }, platforms: ['facebook'] }), /Please add: Model/);
});

test('inventory vehicles prefill the details', async (fx) => {
  const { posts } = await createPostsFromIdea({
    postType: 'used_featured',
    vehicleId: fx.truck.id,
    details: { notes: 'Winter tires included' },
    platforms: ['facebook'],
  });
  assert.equal(posts[0].vehicle_id, fx.truck.id);
  assert.equal(posts[0].brief.details.model, 'F-150');
  assert.equal(posts[0].brief.details.notes, 'Winter tires included');
  assert.deepEqual(posts[0].media, ['https://img.example/f150.jpg']);
});

test('photos: only real JPG/PNG/WebP files are stored', () => {
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const { url } = savePhoto(jpg);
  assert.match(url, /^\/media\/\d+\/[\w-]+\.jpg$/);
  assert.throws(() => savePhoto(Buffer.from('<svg onload=alert(1)></svg>')), /not a JPG/);
  assert.throws(() => savePhoto(Buffer.alloc(0)), /Upload a JPG/);
  assert.deepEqual(cleanMediaList([url, 'javascript:alert(1)', '/etc/passwd', 'https://cdn.example/a.jpg']), [url, 'https://cdn.example/a.jpg']);
  assert.match(absoluteMediaUrl(url), /^http:\/\/localhost:\d+\/media\//);
});

test('posting by hand is recorded honestly: no invented engagement', async () => {
  const { posts } = await createPostsFromIdea({ postType: 'used_trade_in', details: used, platforms: ['linkedin'] });
  const p = markPostedManually(posts[0].id, { url: 'https://www.linkedin.com/feed/update/1' });
  assert.equal(p.status, 'published');
  assert.equal(p.external_id, null);
  await refreshMetrics();
  assert.deepEqual(getPost(p.id).metrics, {});
  assert.throws(() => markPostedManually(p.id), /already published/);
});

test('live publishing sends full photo addresses to the network', async () => {
  createAccount({ platform: 'linkedin', display_name: 'Test Motors', mode: 'live', external_id: '42', access_token: 'tok' });
  const { posts } = await createPostsFromIdea({
    postType: 'new_model_spotlight',
    details: { model: 'ID.4', make: 'Volkswagen' },
    platforms: ['linkedin'],
    media: ['/media/1/x.jpg'],
  });
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response('{}', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } });
  };
  try {
    approvePost(posts[0].id);
    const r = await publishPost(posts[0].id);
    assert.equal(r.status, 'published');
    assert.equal(r.external_id, 'urn:li:share:9');
    assert.match(sent.commentary, /ID\.4|ID\\\.4/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
