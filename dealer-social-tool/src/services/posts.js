import { PLATFORMS, POST_TYPES, POST_STATUSES } from '../config.js';
import { all, get, run, updateRow, parseJson, logActivity, nowIso } from '../db.js';
import { httpError } from './errors.js';
import { isAutopilot } from './dealership.js';
import { tenantId } from '../tenant.js';

export function presentPost(row) {
  if (!row) return row;
  const post = {
    ...row,
    hashtags: parseJson(row.hashtags, []),
    media: parseJson(row.media, []),
    metrics: parseJson(row.metrics, {}),
    brief: parseJson(row.brief, {}),
  };
  post.warnings = validatePost(post);
  return post;
}

/** Final text sent to the network: body + hashtags that are not already in it. */
export function composeText(post) {
  const tags = (post.hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`));
  const missing = tags.filter((t) => !post.content.toLowerCase().includes(t.toLowerCase()));
  return missing.length ? `${post.content.trim()}\n\n${missing.join(' ')}` : post.content.trim();
}

export function validatePost(post) {
  const rules = PLATFORMS[post.platform];
  const warnings = [];
  if (!rules) return [`Unknown platform ${post.platform}`];
  const text = composeText(post);
  if (!post.content.trim()) warnings.push('Post has no text');
  if (text.length > rules.maxChars) warnings.push(`${text.length}/${rules.maxChars} characters — too long for ${rules.label}`);
  if (rules.requiresMedia && !(post.media || []).length) warnings.push(`${rules.label} requires a photo or video`);
  if ((post.hashtags || []).length > rules.maxHashtags && rules.maxHashtags >= 0) {
    warnings.push(`${post.hashtags.length} hashtags — ${rules.label} works best with ${rules.maxHashtags} or fewer`);
  }
  return warnings;
}

export function listPosts({ status, platform, from, to, vehicle_id, batch_id, limit = 500 } = {}) {
  const where = ['dealership_id = ?'];
  const params = [tenantId()];
  if (status) {
    const statuses = String(status).split(',');
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (platform) {
    where.push('platform = ?');
    params.push(platform);
  }
  if (vehicle_id) {
    where.push('vehicle_id = ?');
    params.push(Number(vehicle_id));
  }
  if (batch_id) {
    where.push('batch_id = ?');
    params.push(batch_id);
  }
  if (from) {
    where.push('COALESCE(published_at, scheduled_at, created_at) >= ?');
    params.push(from);
  }
  if (to) {
    where.push('COALESCE(published_at, scheduled_at, created_at) <= ?');
    params.push(to);
  }
  return all(
    `SELECT * FROM posts WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(scheduled_at, published_at, created_at) DESC, id DESC LIMIT ?`,
    ...params,
    Number(limit),
  ).map(presentPost);
}

export function getPost(id) {
  return presentPost(get('SELECT * FROM posts WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

function requirePost(id) {
  const post = getPost(id);
  if (!post) throw httpError(404, `Post ${id} not found`);
  return post;
}

function checkDate(value) {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(400, `Invalid date "${value}"`);
  return d.toISOString();
}

function checkVehicle(vehicleId) {
  if (vehicleId && !get('SELECT id FROM vehicles WHERE id = ? AND dealership_id = ?', vehicleId, tenantId())) {
    throw httpError(400, `Vehicle ${vehicleId} not found`);
  }
}

export function createPost(input, actor = 'user') {
  if (!PLATFORMS[input.platform]) throw httpError(400, `Unknown platform "${input.platform}"`);
  checkVehicle(input.vehicle_id);
  const postType = POST_TYPES[input.post_type] ? input.post_type : 'custom';
  const status = input.status && POST_STATUSES.includes(input.status) ? input.status : 'draft';
  const { lastInsertRowid } = run(
    `INSERT INTO posts (dealership_id, platform, post_type, title, content, hashtags, media, image_idea, vehicle_id, status, source, batch_id, scheduled_at, brief)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tenantId(),
    input.platform,
    postType,
    input.title || '',
    input.content || '',
    JSON.stringify(input.hashtags || []),
    JSON.stringify(input.media || []),
    input.image_idea || '',
    input.vehicle_id || null,
    status,
    input.source || 'manual',
    input.batch_id || null,
    checkDate(input.scheduled_at),
    JSON.stringify(input.brief || {}),
  );
  const post = getPost(Number(lastInsertRowid));
  logActivity(actor, 'post.created', `#${post.id} ${PLATFORMS[post.platform].label} ${post.post_type} (${post.status})`);
  return post;
}

const LOCKED = ['publishing', 'published'];

export function updatePost(id, fields, actor = 'user') {
  const post = requirePost(id);
  if (LOCKED.includes(post.status)) throw httpError(409, `Post is ${post.status} and can no longer be edited`);
  const patch = { ...fields };
  if (patch.hashtags) patch.hashtags = JSON.stringify(patch.hashtags);
  if (patch.media) patch.media = JSON.stringify(patch.media);
  if (patch.scheduled_at !== undefined) patch.scheduled_at = checkDate(patch.scheduled_at);
  if (patch.platform && !PLATFORMS[patch.platform]) throw httpError(400, 'Unknown platform');
  checkVehicle(patch.vehicle_id);
  updateRow('posts', id, patch, ['platform', 'post_type', 'title', 'content', 'hashtags', 'media', 'image_idea', 'vehicle_id', 'scheduled_at']);
  // The bot editing an approved post sends it back for human review in assist mode.
  if (actor === 'bot' && !isAutopilot() && ['approved', 'scheduled'].includes(post.status)) {
    setStatus(id, 'pending_approval');
  }
  logActivity(actor, 'post.edited', `#${id}`);
  return getPost(id);
}

export function deletePost(id, actor = 'user') {
  const post = requirePost(id);
  if (post.status === 'publishing') throw httpError(409, 'Post is being published right now');
  run('DELETE FROM posts WHERE id = ? AND dealership_id = ?', id, tenantId());
  logActivity(actor, 'post.deleted', `#${id}`);
}

function setStatus(id, status, extra = {}) {
  updateRow('posts', id, { status, ...extra }, ['status', 'scheduled_at', 'error', 'published_at', 'external_id', 'external_url', 'metrics']);
}

export function submitForApproval(id, actor = 'user') {
  const post = requirePost(id);
  if (!['draft', 'rejected', 'failed'].includes(post.status)) throw httpError(409, `Cannot submit a ${post.status} post`);
  setStatus(id, 'pending_approval', { error: null });
  logActivity(actor, 'post.submitted', `#${id}`);
  return getPost(id);
}

/** Approve a post. If it has a future time it is queued, otherwise it waits in "approved". */
export function approvePost(id, actor = 'user') {
  const post = requirePost(id);
  if (LOCKED.includes(post.status)) throw httpError(409, `Post is already ${post.status}`);
  const status = post.scheduled_at ? 'scheduled' : 'approved';
  setStatus(id, status, { error: null });
  logActivity(actor, 'post.approved', `#${id}${post.scheduled_at ? ` for ${post.scheduled_at}` : ''}`);
  return getPost(id);
}

export function rejectPost(id, reason = '', actor = 'user') {
  const post = requirePost(id);
  if (LOCKED.includes(post.status)) throw httpError(409, `Post is already ${post.status}`);
  setStatus(id, 'rejected', { error: reason || null });
  logActivity(actor, 'post.rejected', `#${id} ${reason}`);
  return getPost(id);
}

/**
 * Put a post on the calendar. Humans approve by scheduling; the bot only
 * gets straight to "scheduled" when the dealership runs in autopilot mode.
 */
export function schedulePost(id, scheduledAt, { actor = 'user', autopilot = false } = {}) {
  const post = requirePost(id);
  if (LOCKED.includes(post.status)) throw httpError(409, `Post is already ${post.status}`);
  const when = checkDate(scheduledAt) || nowIso();
  const approved = actor === 'user' || autopilot || ['approved', 'scheduled'].includes(post.status);
  setStatus(id, approved ? 'scheduled' : 'pending_approval', { scheduled_at: when, error: null });
  logActivity(actor, approved ? 'post.scheduled' : 'post.submitted', `#${id} for ${when}`);
  return getPost(id);
}

export function unschedulePost(id, actor = 'user') {
  const post = requirePost(id);
  if (!['scheduled', 'approved', 'failed'].includes(post.status)) throw httpError(409, `Cannot unschedule a ${post.status} post`);
  setStatus(id, 'draft', { scheduled_at: null });
  logActivity(actor, 'post.unscheduled', `#${id}`);
  return getPost(id);
}

export function markPublishing(id) {
  // Atomic claim so two workers never publish the same post.
  const res = run(
    `UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND dealership_id = ? AND status IN ('scheduled', 'approved')`,
    nowIso(),
    id,
    tenantId(),
  );
  return res.changes === 1;
}

export function markPublished(id, { external_id, external_url, metrics }) {
  setStatus(id, 'published', {
    published_at: nowIso(),
    external_id: external_id || null,
    external_url: external_url || null,
    metrics: JSON.stringify(metrics || {}),
    error: null,
  });
}

/**
 * The manager posted it themselves (the network isn't connected to Dealer Social).
 * No external_id is stored, so no engagement numbers are invented for it.
 */
export function markPostedManually(id, { url = '' } = {}, actor = 'user') {
  const post = requirePost(id);
  if (LOCKED.includes(post.status)) throw httpError(409, `Post is already ${post.status}`);
  if (url && !/^https?:\/\//i.test(url)) throw httpError(400, 'Link must start with http(s)://');
  setStatus(id, 'published', { published_at: nowIso(), external_id: null, external_url: url || null, metrics: '{}', error: null });
  logActivity(actor, 'post.posted_manually', `#${id} on ${PLATFORMS[post.platform].label}`);
  return getPost(id);
}

export function markFailed(id, error) {
  setStatus(id, 'failed', { error: String(error).slice(0, 500) });
}

export function updateMetrics(id, metrics) {
  run('UPDATE posts SET metrics = ? WHERE id = ? AND dealership_id = ?', JSON.stringify(metrics), id, tenantId());
}

export function duePosts(now = nowIso()) {
  return all(`SELECT id FROM posts WHERE dealership_id = ? AND status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at`, tenantId(), now).map(
    (r) => r.id,
  );
}

/** Dealerships that have posts due, for the worker. */
export function dealershipsWithDuePosts(now = nowIso()) {
  return all(`SELECT DISTINCT dealership_id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ?`, now).map((r) => r.dealership_id);
}

export function statusCounts() {
  const counts = Object.fromEntries(POST_STATUSES.map((s) => [s, 0]));
  for (const row of all('SELECT status, COUNT(*) AS n FROM posts WHERE dealership_id = ? GROUP BY status', tenantId())) counts[row.status] = row.n;
  return counts;
}
