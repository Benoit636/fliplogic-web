import { PLATFORMS } from '../config.js';
import { all, logActivity } from '../db.js';
import { adapterFor, ensureFreshToken } from '../platforms/index.js';
import { getDealership } from './dealership.js';
import { requireActive } from './entitlements.js';
import { accountForPlatform, recordAccountError } from './accounts.js';
import { composeText, duePosts, getPost, markFailed, markPublished, markPublishing, updateMetrics, validatePost, assertPromotable } from './posts.js';
import { httpError } from './errors.js';
import { tenantId } from '../tenant.js';
import { absoluteMediaUrl } from './media.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { run } from '../db.js';
import { moneyAmounts } from '../ai/claims.js';

/** Our own uploaded image (/media/<dealership>/<file>), read from disk so it can be uploaded directly. */
function localPhoto(url) {
  const m = /^\/media\/(\d+)\/([\w-]+\.(jpg|png|webp))$/.exec(url || '');
  if (!m || Number(m[1]) !== tenantId()) return null;
  const file = path.join(config.mediaDir, m[1], m[2]);
  if (!fs.existsSync(file)) return null;
  return { buffer: fs.readFileSync(file), type: { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[m[3]], name: m[2] };
}

/** After publishing, compare what the network shows with what we sent: photo, caption, price, inventory link. */
function recordPublishCheck(post, sent, shown) {
  const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const prices = moneyAmounts(sent);
  const link = post.brief?.details?.detail_url || '';
  const check = {
    checked_at: new Date().toISOString(),
    photo: !!shown.has_picture,
    caption: squash(shown.message) === squash(sent),
    price: prices.length ? prices.every((n) => moneyAmounts(shown.message).some((m) => Math.abs(m - n) < 0.01)) : null,
    link: link ? String(shown.message || '').includes(link) : null,
    permalink: shown.permalink_url || '',
  };
  check.ok = check.photo && check.caption && check.price !== false && check.link !== false;
  run('UPDATE posts SET publish_check = ? WHERE id = ? AND dealership_id = ?', JSON.stringify(check), post.id, tenantId());
  logActivity('system', check.ok ? 'post.verified' : 'post.verify_failed', `#${post.id}: photo ${check.photo ? 'ok' : 'missing'}, caption ${check.caption ? 'ok' : 'differs'}${check.price === null ? '' : `, price ${check.price ? 'ok' : 'differs'}`}${check.link === null ? '' : `, link ${check.link ? 'ok' : 'missing'}`}`);
}

export async function publishPost(id, actor = 'system') {
  const post = getPost(id);
  if (!post) throw httpError(404, 'Post not found');
  if (!['scheduled', 'approved'].includes(post.status)) throw httpError(409, `Only approved or scheduled posts can be published (this one is ${post.status})`);
  if (getDealership().require_approval && !post.approved_at) throw httpError(403, 'A Dealer Admin needs to approve this post before it’s published');
  try {
    assertPromotable(post);
  } catch (err) {
    markFailed(id, err.message); // e.g. a scheduled post whose vehicle sold in the meantime
    throw err;
  }
  requireActive();
  // Real Pages stay locked until the platform owner unlocks them (test Page first, live Page only with explicit approval).
  const target = accountForPlatform(post.platform);
  if (target && target.mode === 'live' && !target.publish_allowed) {
    throw httpError(423, `${target.display_name} is locked: the platform owner must unlock this Page before anything is published to it.`);
  }
  if (!markPublishing(id)) throw httpError(409, 'Post is already being published');

  try {
    const blocking = validatePost(post).filter((w) => /too long|requires a photo|no text/.test(w));
    if (blocking.length) throw new Error(blocking.join('; '));
    let account = accountForPlatform(post.platform);
    if (!account) throw new Error(`No ${PLATFORMS[post.platform].label} account connected`);
    try {
      account = await ensureFreshToken(account);
      const outgoing = { ...post, media: post.media.map(absoluteMediaUrl), link_url: getDealership().website, photoFile: localPhoto(post.media[0]) };
      const text = composeText(post);
      const result = await adapterFor(account).publish(outgoing, account, text);
      markPublished(id, result);
      if (result.shown) recordPublishCheck(post, text, result.shown);
      if (account.last_error) recordAccountError(account.id, null);
    } catch (err) {
      if (account.mode === 'live') recordAccountError(account.id, err.message);
      throw err;
    }
    logActivity(
      actor,
      'post.published',
      `#${id} to ${PLATFORMS[post.platform].label} (${account.display_name}${account.mode === 'simulated' ? ', simulated' : ''})`,
    );
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
  const rows = all(`SELECT id FROM posts WHERE dealership_id = ? AND status = 'published' AND published_at >= ?`, tenantId(), since);
  let updated = 0;
  for (const { id } of rows) {
    const post = getPost(id);
    if (!post.external_id) continue; // posted by hand: we have no way to read its numbers
    try {
      const account = await ensureFreshToken(accountForPlatform(post.platform));
      const adapter = adapterFor(account);
      updateMetrics(id, await adapter.fetchMetrics(post, account));
      updated++;
    } catch {
      // Keep the last known numbers if a network call fails.
    }
  }
  return updated;
}
