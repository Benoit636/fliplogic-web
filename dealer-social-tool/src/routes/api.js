import crypto from 'node:crypto';
import express from 'express';
import { PLATFORMS, POST_TYPES, POST_STATUSES, config } from '../config.js';
import { all } from '../db.js';
import { tenantId } from '../tenant.js';
import { PLANS } from '../plans.js';
import { aiEnabled } from '../ai/client.js';
import { chat, conversationTranscript } from '../ai/agent.js';
import { rewritePost } from '../ai/generator.js';
import { liveSupported } from '../platforms/index.js';
import { getDealership, updateDealership } from '../services/dealership.js';
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../services/accounts.js';
import { listVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle, importVehiclesCsv, syncInventoryFeed } from '../services/inventory.js';
import {
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  submitForApproval,
  approvePost,
  rejectPost,
  schedulePost,
  unschedulePost,
  statusCounts,
} from '../services/posts.js';
import { createPostsFromIdea } from '../services/content.js';
import { publishPost, refreshMetrics } from '../services/publisher.js';
import { listRules, getRule, createRule, updateRule, deleteRule, runRule, rescheduleAllRules } from '../services/autopilot.js';
import { listMessages, ingestMessage, replyToMessage, dismissMessage, escalateMessage, simulateIncoming, inboxCounts, syncComments } from '../services/inbox.js';
import { analyticsSummary } from '../services/analytics.js';
import { usageSummary, requireActive, requireFeature } from '../services/entitlements.js';
import { listTeam, inviteMember, revokeInvite, changeRole, removeMember } from '../services/auth.js';
import { createCheckout, createPortal, stripeEnabled } from '../services/billing.js';
import { oauthStatus, startOAuth, pendingOptions, connectOptions } from '../services/oauth.js';
import { httpError } from '../services/errors.js';

/** Routes for the logged-in user's current dealership. Mounted behind requireDealership. */
export const api = express.Router();
const id = (req) => Number(req.params.id);

const RANK = { staff: 1, manager: 2, owner: 3 };
const role = (min) => (req, res, next) => {
  if ((RANK[req.session.role] || 0) < RANK[min]) return next(httpError(403, `Only a dealership ${min}${min === 'owner' ? '' : ' or owner'} can do this`));
  next();
};
const manager = role('manager');
const owner = role('owner');

// --- meta ---
api.get('/meta', (req, res) => {
  res.json({
    ai_enabled: aiEnabled(),
    ai_model: aiEnabled() ? config.aiModel : null,
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, { ...p, live_supported: liveSupported(k) }])),
    post_types: POST_TYPES,
    post_statuses: POST_STATUSES,
    oauth: oauthStatus(),
    billing_enabled: stripeEnabled(),
    plans: PLANS,
    role: req.session.role,
    user: req.session.user,
    product_name: config.productName,
    support_email: config.supportEmail,
  });
});

api.get('/dashboard', (req, res) => {
  const now = new Date().toISOString();
  const d = getDealership();
  res.json({
    dealership: d,
    subscription: usageSummary(),
    post_counts: statusCounts(),
    inbox: inboxCounts(),
    upcoming: listPosts({ status: 'scheduled', from: now, limit: 200 }).reverse().slice(0, 8),
    needs_approval: listPosts({ status: 'pending_approval', limit: 5 }),
    failed: listPosts({ status: 'failed', limit: 5 }),
    analytics: analyticsSummary(7),
    activity: all('SELECT * FROM activity_log WHERE dealership_id = ? ORDER BY id DESC LIMIT 25', tenantId()),
    accounts: listAccounts(),
    inventory: all(`SELECT status, COUNT(*) AS n FROM vehicles WHERE dealership_id = ? GROUP BY status`, tenantId()),
    checklist: {
      profile: !!(d.phone && d.city && d.brand_voice),
      accounts: listAccounts().length > 0,
      live_account: listAccounts().some((a) => a.mode === 'live'),
      inventory: all('SELECT 1 FROM vehicles WHERE dealership_id = ? LIMIT 1', tenantId()).length > 0,
      first_post: statusCounts().published > 0,
      autopilot: listRules().length > 0,
    },
  });
});

api.get('/activity', (req, res) => {
  res.json(all('SELECT * FROM activity_log WHERE dealership_id = ? ORDER BY id DESC LIMIT ?', tenantId(), Math.min(1000, Number(req.query.limit || 200))));
});

// --- dealership & accounts ---
api.get('/dealership', (req, res) => res.json(getDealership()));
api.put('/dealership', manager, (req, res) => {
  const body = { ...req.body };
  if (body.autonomy && body.autonomy !== getDealership().autonomy && req.session.role !== 'owner') {
    throw httpError(403, 'Only the owner can change the bot autonomy mode');
  }
  const before = getDealership();
  const updated = updateDealership(body);
  if (updated.timezone !== before.timezone) rescheduleAllRules();
  res.json(updated);
});

api.get('/accounts', (req, res) => res.json(listAccounts()));
api.post('/accounts', manager, (req, res) => res.status(201).json(createAccount(req.body)));
api.patch('/accounts/:id', manager, (req, res) => res.json(updateAccount(id(req), req.body)));
api.delete('/accounts/:id', manager, (req, res) => {
  deleteAccount(id(req));
  res.status(204).end();
});

// --- one-click connections (OAuth) ---
api.post('/oauth/:provider/start', manager, (req, res) => res.json(startOAuth(req.params.provider, req.session.user.id)));
api.get('/oauth/pending/:state', manager, (req, res) => res.json(pendingOptions(req.params.state)));
api.post('/oauth/pending/:state/connect', manager, (req, res) => res.json(connectOptions(req.params.state, req.body?.indexes || [])));

// --- inventory ---
api.get('/vehicles', (req, res) => res.json(listVehicles(req.query)));
api.get('/vehicles/:id', (req, res) => {
  const v = getVehicle(id(req));
  if (!v) throw httpError(404, 'Vehicle not found');
  res.json(v);
});
api.post('/vehicles', manager, (req, res) => res.status(201).json(createVehicle(req.body)));
api.patch('/vehicles/:id', manager, (req, res) => res.json(updateVehicle(id(req), req.body)));
api.delete('/vehicles/:id', manager, (req, res) => {
  deleteVehicle(id(req));
  res.status(204).end();
});
api.post('/vehicles/import', manager, express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
  const text = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!text) throw httpError(400, 'Send the CSV file contents as the request body');
  const { seenIds, ...result } = importVehiclesCsv(text);
  res.json(result);
});
api.post('/vehicles/sync-feed', manager, async (req, res) => {
  requireFeature('inventoryFeed');
  const d = getDealership();
  if (!d.inventory_feed_url) throw httpError(400, 'Add your inventory feed URL in Settings first');
  res.json(await syncInventoryFeed(d));
});

// --- posts ---
api.get('/posts', (req, res) => res.json(listPosts(req.query)));
api.get('/posts/:id', (req, res) => {
  const p = getPost(id(req));
  if (!p) throw httpError(404, 'Post not found');
  res.json(p);
});
api.post('/posts', (req, res) => res.status(201).json(createPost({ ...req.body, status: 'draft', source: 'manual' })));
api.patch('/posts/:id', (req, res) => {
  const p = getPost(id(req));
  if (p && ['approved', 'scheduled'].includes(p.status) && req.session.role === 'staff') throw httpError(403, 'Ask a manager to edit approved posts');
  res.json(updatePost(id(req), req.body));
});
api.delete('/posts/:id', manager, (req, res) => {
  deletePost(id(req));
  res.status(204).end();
});
api.post('/posts/:id/submit', (req, res) => res.json(submitForApproval(id(req))));
api.post('/posts/:id/approve', manager, (req, res) => res.json(approvePost(id(req))));
api.post('/posts/:id/reject', manager, (req, res) => res.json(rejectPost(id(req), req.body?.reason)));
api.post('/posts/:id/schedule', manager, (req, res) => res.json(schedulePost(id(req), req.body?.scheduled_at)));
api.post('/posts/:id/unschedule', manager, (req, res) => res.json(unschedulePost(id(req))));
api.post('/posts/:id/publish', manager, async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  requireActive();
  // Publishing by hand counts as approval.
  if (['draft', 'pending_approval', 'rejected', 'failed'].includes(post.status)) approvePost(post.id);
  res.json(await publishPost(post.id, 'user'));
});
api.post('/posts/:id/rewrite', async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  requireActive();
  res.json(await rewritePost(post, req.body?.instruction || 'Make it better'));
});
api.post('/posts/approve-batch', manager, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  res.json(ids.map((pid) => approvePost(Number(pid))));
});

// --- AI content studio ---
api.post('/generate', async (req, res) => {
  const { post_type, platforms, vehicle_id, instructions, scheduled_at, media } = req.body || {};
  res.status(201).json(
    await createPostsFromIdea({
      postType: post_type,
      platforms: platforms || [],
      vehicleId: vehicle_id,
      instructions,
      scheduledAt: scheduled_at,
      media,
      actor: 'user',
      source: 'ai',
    }),
  );
});

// --- AI bot chat ---
api.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) throw httpError(400, 'message is required');
  if (message.length > 4000) throw httpError(400, 'Message is too long');
  const conversationId = String(req.body?.conversation_id || crypto.randomUUID()).slice(0, 64);
  const result = await chat(conversationId, message);
  res.json({ conversation_id: conversationId, ...result });
});
api.get('/chat/:conversationId', (req, res) => res.json(conversationTranscript(req.params.conversationId)));

// --- autopilot ---
api.get('/autopilot/rules', (req, res) => res.json(listRules()));
api.post('/autopilot/rules', manager, (req, res) => res.status(201).json(createRule(req.body)));
api.patch('/autopilot/rules/:id', manager, (req, res) => res.json(updateRule(id(req), req.body)));
api.delete('/autopilot/rules/:id', manager, (req, res) => {
  deleteRule(id(req));
  res.status(204).end();
});
api.post('/autopilot/rules/:id/run', manager, async (req, res) => {
  const rule = getRule(id(req));
  if (!rule) throw httpError(404, 'Rule not found');
  res.json(await runRule(rule, 'user'));
});

// --- inbox ---
api.get('/inbox', (req, res) => res.json(listMessages({ ...req.query, lead: req.query.lead === '1' })));
api.post('/inbox', async (req, res) => res.status(201).json(await ingestMessage(req.body)));
api.post('/inbox/simulate', async (req, res) => res.json(await simulateIncoming(Math.min(10, Number(req.body?.count || 3)))));
api.post('/inbox/sync', async (req, res) => res.json({ added: await syncComments() }));
api.post('/inbox/:id/reply', async (req, res) => res.json(await replyToMessage(id(req), req.body?.text)));
api.post('/inbox/:id/dismiss', (req, res) => res.json(dismissMessage(id(req))));
api.post('/inbox/:id/escalate', (req, res) => res.json(escalateMessage(id(req))));

// --- analytics ---
api.get('/analytics', (req, res) => res.json(analyticsSummary(Math.min(365, Math.max(1, Number(req.query.days || 30))))));
api.post('/analytics/refresh', async (req, res) => res.json({ updated: await refreshMetrics() }));

// --- team ---
api.get('/team', (req, res) => res.json(listTeam(tenantId())));
api.post('/team/invites', owner, async (req, res) => res.status(201).json(await inviteMember(tenantId(), req.session.user, req.body || {})));
api.delete('/team/invites/:id', owner, (req, res) => {
  revokeInvite(tenantId(), id(req));
  res.status(204).end();
});
api.patch('/team/members/:id', owner, (req, res) => {
  changeRole(tenantId(), id(req), req.body?.role);
  res.json(listTeam(tenantId()));
});
api.delete('/team/members/:id', owner, (req, res) => {
  if (id(req) === req.session.user.id) throw httpError(400, "You can't remove yourself");
  removeMember(tenantId(), id(req));
  res.status(204).end();
});

// --- billing ---
api.get('/billing', (req, res) => {
  const d = getDealership();
  res.json({
    ...usageSummary(),
    subscription_status: d.subscription_status,
    trial_ends_at: d.trial_ends_at,
    current_period_end: d.current_period_end,
    billing_interval: d.billing_interval,
    has_billing_account: !!d.stripe_customer_id,
    billing_enabled: stripeEnabled(),
    plans: PLANS,
  });
});
api.post('/billing/checkout', owner, async (req, res) => res.json(await createCheckout(tenantId(), req.session.user, req.body || {})));
api.post('/billing/portal', owner, async (req, res) => res.json(await createPortal(tenantId())));
