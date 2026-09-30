import assert from 'node:assert/strict';
import { tenantTest as test } from './helpers.js';
import { createPostsFromIdea } from '../src/services/content.js';
import { approvePost, composeText, createPost, getPost, schedulePost, updatePost, validatePost, rejectPost } from '../src/services/posts.js';
import { publishDuePosts, publishPost } from '../src/services/publisher.js';
import { updateDealership } from '../src/services/dealership.js';
import { getVehicle } from '../src/services/inventory.js';


test('user-generated posts start as drafts, one per platform, with vehicle photos attached', async (fixtures) => {
  const { posts, engine } = await createPostsFromIdea({ postType: 'vehicle_spotlight', vehicleId: fixtures.truck.id, platforms: ['facebook', 'instagram', 'x'] });
  assert.equal(engine, 'templates');
  assert.deepEqual(posts.map((p) => p.platform), ['facebook', 'instagram', 'x']);
  assert.ok(posts.every((p) => p.status === 'draft'));
  assert.deepEqual(posts[1].media, ['https://img.example/f150.jpg']);
  assert.match(posts[0].content, /F-150/);
  assert.ok(composeText(posts[2]).length <= 280, 'X post fits in 280 characters');
  assert.ok(getVehicle(fixtures.truck.id).last_posted_at, 'vehicle rotation is updated');
});

test('bot-generated posts need approval in assist mode and are scheduled in autopilot mode', async (fixtures) => {
  const when = new Date(Date.now() + 3600_000).toISOString();
  const assist = await createPostsFromIdea({ postType: 'service_tip', platforms: ['facebook'], actor: 'bot', scheduledAt: when });
  assert.equal(assist.posts[0].status, 'pending_approval');

  updateDealership({ autonomy: 'autopilot' });
  const auto = await createPostsFromIdea({ postType: 'service_tip', platforms: ['facebook'], actor: 'bot', scheduledAt: when });
  assert.equal(auto.posts[0].status, 'scheduled');
});

test('approve → schedule → publish on a simulated account', async (fixtures) => {
  const post = createPost({ platform: 'facebook', content: 'Hello Moncton!', hashtags: ['#cars'] });
  assert.equal(approvePost(post.id).status, 'approved');
  const scheduled = schedulePost(post.id, new Date(Date.now() - 1000).toISOString());
  assert.equal(scheduled.status, 'scheduled');

  const [published] = await publishDuePosts();
  assert.equal(published.status, 'published');
  assert.match(published.external_id, /^sim_facebook_/);
  assert.ok(published.metrics.reach > 0);
  assert.throws(() => updatePost(post.id, { content: 'changed' }), /no longer be edited/);
});

test('bot scheduling in assist mode waits for approval', (fixtures) => {
  const post = createPost({ platform: 'facebook', content: 'Draft' });
  const res = schedulePost(post.id, new Date(Date.now() + 60_000).toISOString(), { actor: 'bot', autopilot: false });
  assert.equal(res.status, 'pending_approval');
  assert.equal(approvePost(post.id).status, 'scheduled');
});

test('publishing fails cleanly without an account or with invalid content', async (fixtures) => {
  const x = createPost({ platform: 'x', content: 'Hi', status: 'approved' });
  assert.equal((await publishPost(x.id)).status, 'failed');
  assert.match(getPost(x.id).error, /No X/);

  const ig = createPost({ platform: 'instagram', content: 'No photo', status: 'approved' });
  const failed = await publishPost(ig.id);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /requires a photo/);
});

test('validation flags length, missing media and too many hashtags', (fixtures) => {
  const warnings = validatePost({ platform: 'x', content: 'a'.repeat(300), hashtags: ['#a', '#b', '#c'], media: [] });
  assert.equal(warnings.length, 2);
  assert.deepEqual(validatePost({ platform: 'facebook', content: 'ok', hashtags: [], media: [] }), []);
});

test('rejected posts keep the reason', (fixtures) => {
  const post = createPost({ platform: 'facebook', content: 'meh', status: 'pending_approval' });
  assert.equal(rejectPost(post.id, 'Too salesy').error, 'Too salesy');
});
