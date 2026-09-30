import { PLATFORMS } from '../config.js';
import { all, get, run, logActivity, nowIso } from '../db.js';
import { triageMessage } from '../ai/inbox.js';
import { adapterFor, ensureFreshToken } from '../platforms/index.js';
import { accountForPlatform } from './accounts.js';
import { isAutopilot } from './dealership.js';
import { getPost, listPosts } from './posts.js';
import { httpError } from './errors.js';
import { tenantId } from '../tenant.js';
import { forwardLead } from './leads.js';

const present = (row) => row && { ...row, is_lead: !!row.is_lead };

export function listMessages({ status, platform, lead } = {}) {
  const where = ['dealership_id = ?'];
  const params = [tenantId()];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (platform) {
    where.push('platform = ?');
    params.push(platform);
  }
  if (lead) where.push('is_lead = 1');
  return all(
    `SELECT * FROM inbox_messages WHERE ${where.join(' AND ')}
     ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, received_at DESC LIMIT 500`,
    ...params,
  ).map(present);
}

export function getMessage(id) {
  return present(get('SELECT * FROM inbox_messages WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

/** Store an incoming comment/DM/review, let the bot triage it, and auto-handle it in autopilot mode. */
export async function ingestMessage(input) {
  if (!PLATFORMS[input.platform]) throw httpError(400, 'Unknown platform');
  if (!input.text) throw httpError(400, 'text is required');
  if (input.external_id && get('SELECT id FROM inbox_messages WHERE dealership_id = ? AND external_id = ?', tenantId(), input.external_id)) return null;

  const message = { kind: 'comment', author: 'Someone', ...input };
  const post = message.post_id ? getPost(message.post_id) : null;
  if (message.post_id && !post) message.post_id = null;
  let triage;
  try {
    triage = await triageMessage(message, post?.content?.slice(0, 500));
  } catch (err) {
    triage = { sentiment: null, intent: null, priority: 'normal', is_lead: false, suggested_reply: '' };
    logActivity('bot', 'inbox.triage_failed', err.message);
  }

  const { lastInsertRowid } = run(
    `INSERT INTO inbox_messages (dealership_id, platform, kind, author, text, rating, post_id, external_id, sentiment, intent, priority, is_lead, suggested_reply, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tenantId(),
    message.platform,
    message.kind,
    message.author,
    message.text,
    message.rating ?? null,
    message.post_id ?? null,
    message.external_id ?? null,
    triage.sentiment,
    triage.intent,
    triage.priority,
    triage.is_lead ? 1 : 0,
    triage.suggested_reply,
    message.received_at || nowIso(),
  );
  const id = Number(lastInsertRowid);
  logActivity('bot', 'inbox.received', `${PLATFORMS[message.platform].label} ${message.kind} from ${message.author} → ${triage.intent || 'untriaged'}`);

  if (triage.is_lead) {
    await forwardLead(getMessage(id)).catch((err) => logActivity('bot', 'lead.forward_failed', err.message));
  }

  if (isAutopilot()) {
    if (triage.intent === 'spam') dismissMessage(id, 'bot');
    else if (triage.intent === 'lead' || triage.intent === 'complaint' || triage.priority === 'urgent') escalateMessage(id, 'bot');
    else if (triage.suggested_reply && ['praise', 'question'].includes(triage.intent)) {
      await replyToMessage(id, triage.suggested_reply, 'bot').catch((err) => logActivity('bot', 'inbox.reply_failed', err.message));
    }
  }
  return getMessage(id);
}

export async function replyToMessage(id, text, actor = 'user') {
  const message = getMessage(id);
  if (!message) throw httpError(404, 'Message not found');
  if (!text?.trim()) throw httpError(400, 'Reply text is required');
  const account = await ensureFreshToken(accountForPlatform(message.platform));
  if (account?.mode === 'live' && message.external_id) {
    await adapterFor(account).reply(message, account, text);
  }
  run(`UPDATE inbox_messages SET reply = ?, status = 'replied', replied_at = ? WHERE id = ? AND dealership_id = ?`, text, nowIso(), id, tenantId());
  logActivity(actor, 'inbox.replied', `#${id} ${message.author}`);
  return getMessage(id);
}

export function dismissMessage(id, actor = 'user') {
  run(`UPDATE inbox_messages SET status = 'dismissed' WHERE id = ? AND dealership_id = ?`, id, tenantId());
  logActivity(actor, 'inbox.dismissed', `#${id}`);
  return getMessage(id);
}

export async function escalateMessage(id, actor = 'user') {
  run(`UPDATE inbox_messages SET status = 'escalated' WHERE id = ? AND dealership_id = ?`, id, tenantId());
  logActivity(actor, 'inbox.escalated', `#${id}`);
  // A person escalating a message marks it as a lead worth sending to the CRM.
  if (actor === 'user') {
    run('UPDATE inbox_messages SET is_lead = 1 WHERE id = ? AND dealership_id = ?', id, tenantId());
    await forwardLead(getMessage(id)).catch((err) => logActivity('system', 'lead.forward_failed', err.message));
  }
  return getMessage(id);
}

/** Pull new comments on recently published posts from live accounts. */
export async function syncComments() {
  let added = 0;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  for (const post of listPosts({ status: 'published', from: since })) {
    const stored = accountForPlatform(post.platform);
    if (stored?.mode !== 'live' || !post.external_id) continue;
    try {
      const account = await ensureFreshToken(stored);
      const comments = await adapterFor(account).fetchComments(post, account);
      for (const c of comments) {
        if (await ingestMessage({ ...c, platform: post.platform, kind: 'comment', post_id: post.id })) added++;
      }
    } catch (err) {
      logActivity('system', 'inbox.sync_failed', `${post.platform}: ${err.message}`);
    }
  }
  // Google reviews are not attached to posts, so pull them per location.
  const google = accountForPlatform('google_business');
  if (google?.mode === 'live') {
    try {
      const account = await ensureFreshToken(google);
      for (const r of await adapterFor(account).fetchReviews(account)) {
        if (await ingestMessage({ ...r, platform: 'google_business', kind: 'review' })) added++;
      }
    } catch (err) {
      logActivity('system', 'inbox.sync_failed', `google_business: ${err.message}`);
    }
  }
  return added;
}

const SAMPLES = [
  { kind: 'comment', author: 'Jessica Martin', text: 'Is this one still available? What would payments look like?' },
  { kind: 'comment', author: 'Mike Thibodeau', text: 'Beautiful truck 😍 wish I could afford it lol' },
  { kind: 'review', author: 'Sandra Leblanc', rating: 5, text: 'Our salesperson was amazing, no pressure at all. Best car buying experience we have had!' },
  { kind: 'dm', author: 'Kevin Arsenault', text: 'Hi, do you take trade-ins? I have a 2016 Civic with 140k.' },
  { kind: 'review', author: 'Paul Richard', rating: 2, text: 'Waited 3 hours for an oil change even with an appointment. Disappointed.' },
  { kind: 'comment', author: 'crypto_king_88', text: 'Make $5000 a week from home!! DM me for details https://bit.ly/xxxx' },
  { kind: 'comment', author: 'Amy Gallant', text: 'Do you have any hybrids in stock?' },
];

/** Demo helper: drop realistic sample messages into the inbox. */
export async function simulateIncoming(count = 3) {
  const published = listPosts({ status: 'published', limit: 20 });
  const created = [];
  for (let i = 0; i < count; i++) {
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    const post = sample.kind === 'comment' && published.length ? published[Math.floor(Math.random() * published.length)] : null;
    const platform = sample.kind === 'review' ? 'google_business' : post?.platform || 'facebook';
    created.push(await ingestMessage({ ...sample, platform, post_id: post?.id }));
  }
  return created.filter(Boolean);
}

export function inboxCounts() {
  const row = get(
    `SELECT SUM(status = 'new') AS new, SUM(status = 'escalated') AS escalated, SUM(is_lead = 1 AND status != 'dismissed') AS leads
     FROM inbox_messages WHERE dealership_id = ?`,
    tenantId(),
  );
  return { new: row.new || 0, escalated: row.escalated || 0, leads: row.leads || 0 };
}
