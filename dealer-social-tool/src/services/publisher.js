import { PLATFORMS } from '../config.js';
import { all, logActivity } from '../db.js';
import { adapterFor } from '../platforms/index.js';
import { accountForPlatform } from './accounts.js';
import { composeText, duePosts, getPost, markFailed, markPublished, markPublishing, updateMetrics, validatePost } from './posts.js';
import { httpError } from './errors.js';

export async function publishPost(id, actor = 'system') {
  const post = getPost(id);
  if (!post) throw httpError(404, 'Post not found');
  if (!['scheduled', 'approved'].includes(post.status)) throw httpError(409, `Only approved or scheduled posts can be published (this one is ${post.status})`);
  if (!markPublishing(id)) throw httpError(409, 'Post is already being published');

  try {
    const blocking = validatePost(post).filter((w) => /too long|requires a photo|no text/.test(w));
    if (blocking.length) throw new Error(blocking.join('; '));
    const account = accountForPlatform(post.platform);
    if (!account) throw new Error(`No ${PLATFORMS[post.platform].label} account connected`);
    const result = await adapterFor(account).publish(post, account, composeText(post));
    markPublished(id, result);
    logActivity(actor, 'post.published', `#${id} to ${PLATFORMS[post.platform].label} (${account.display_name}${account.mode === 'simulated' ? ', simulated' : ''})`);
  } catch (err) {
    markFailed(id, err.message);
    logActivity(actor, 'post.failed', `#${id}: ${err.message}`);
  }
  return getPost(id);
}

export async function publishDuePosts() {
  const results = [];
  for (const id of duePosts()) results.push(await publishPost(id, 'scheduler'));
  return results;
}

/** Pull fresh engagement numbers for posts published in the last 30 days. */
export async function refreshMetrics() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = all(`SELECT id FROM posts WHERE status = 'published' AND published_at >= ?`, since);
  let updated = 0;
  for (const { id } of rows) {
    const post = getPost(id);
    const account = accountForPlatform(post.platform);
    try {
      const adapter = adapterFor(account);
      updateMetrics(id, await adapter.fetchMetrics(post, account));
      updated++;
    } catch {
      // Keep the last known numbers if a network call fails.
    }
  }
  return updated;
}
