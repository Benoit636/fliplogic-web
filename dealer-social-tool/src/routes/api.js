import crypto from 'node:crypto';
import express from 'express';
import { PLATFORMS, POST_TYPES, POST_STATUSES, GENERAL_POST_TYPES, config } from '../config.js';
import { OBJECTIVES, FIELDS, IMAGE_LABELS, LANGUAGES } from '../shared/objectives.js';
import { all, logActivity } from '../db.js';
import { tenantId, runWithTenant } from '../tenant.js';
import { validateInventory, latestValidation } from '../services/validation.js';
import { PLANS } from '../plans.js';
import { aiEnabled } from '../ai/client.js';
import { chat, conversationTranscript } from '../ai/agent.js';
import { rewritePost } from '../ai/generator.js';
import { liveSupported } from '../platforms/index.js';
import { getDealership, updateDealership, setDealershipLogo, presentDealership } from '../services/dealership.js';
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../services/accounts.js';
import { listVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle, importVehiclesCsv, syncInventoryFeed, listInventorySyncs } from '../services/inventory.js';
import { maskFeedUrl } from '../services/dealership.js';
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
  markPostedManually,
  isApproved,
} from '../services/posts.js';
import { createPostsFromIdea } from '../services/content.js';
import { publishPost, refreshMetrics } from '../services/publisher.js';
import { listRules, getRule, createRule, updateRule, deleteRule, runRule, rescheduleAllRules } from '../services/autopilot.js';
import {
  listMessages,
  ingestMessage,
  replyToMessage,
  dismissMessage,
  escalateMessage,
  simulateIncoming,
  inboxCounts,
  syncComments,
} from '../services/inbox.js';
import { analyticsSummary } from '../services/analytics.js';
import { usageSummary, requireActive, requireFeature } from '../services/entitlements.js';
import { listTeam, inviteMember, revokeInvite, changeRole, removeMember } from '../services/auth.js';
import { createCheckout, createPortal, stripeEnabled } from '../services/billing.js';
import { oauthStatus, startOAuth, pendingOptions, connectOptions } from '../services/oauth.js';
import { httpError } from '../services/errors.js';
import { savePhoto, cleanMediaList, importRemotePhoto, MAX_PHOTO_BYTES } from '../services/media.js';

/** Routes for the logged-in user's current dealership. Mounted behind requireDealership. */
export const api = express.Router();
const id = (req) => Number(req.params.id);

// Two roles: Dealer Admin (profile, team, inventory, approvals, publishing) and Dealer Staff (create posts, send for approval).
const RANK = { staff: 1, admin: 2 };
const admin = (req, res, next) => {
  if ((RANK[req.session.role] || 0) < RANK.admin) return next(httpError(403, 'Only a Dealer Admin can do this'));
  next();
};

// --- pilot mode: features outside the pilot are switched off on the server, not just hidden ---
const PILOT_OFF = [
  { re: /^\/(inbox|chat)(\/|$)/, methods: 'all' }, // customer messages & personal information; AI chat
  { re: /^\/oauth\/(?!meta\/start$|pending\/)/, methods: 'all' }, // only Facebook can be connected during the pilot
  { re: /^\/accounts$/, methods: 'write' }, // no hand-entered tokens; connect with Facebook Login instead
  { re: /^\/autopilot(\/|$)/, methods: 'write' },
  { re: /^\/billing\/(checkout|portal)$/, methods: 'all' },
  { re: /^\/analytics\/refresh$/, methods: 'all' },
];
api.use((req, res, next) => {
  if (!config.pilotMode) return next();
  const off = PILOT_OFF.find((r) => r.re.test(req.path) && (r.methods === 'all' || req.method !== 'GET'));
  if (off) return next(httpError(403, 'This feature is switched off during the pilot'));
  next();
});

// --- meta ---
api.get('/meta', (req, res) => {
  res.json({
    ai_enabled: aiEnabled(),
    ai_model: aiEnabled() ? config.aiModel : null,
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, { ...p, live_supported: liveSupported(k) }])),
    post_types: POST_TYPES,
    general_post_types: GENERAL_POST_TYPES,
    objectives: OBJECTIVES,
    fields: FIELDS,
    image_labels: IMAGE_LABELS,
    languages: LANGUAGES,
    post_statuses: POST_STATUSES,
    oauth: oauthStatus(),
    billing_enabled: stripeEnabled(),
    plans: PLANS,
    role: req.session.role,
    user: req.session.user,
    product_name: config.productName,
    support_email: config.supportEmail,
    pilot_mode: config.pilotMode,
  });
});

api.get('/dashboard', (req, res) => {
  const now = new Date().toISOString();
  const d = getDealership();
  res.json({
    dealership: presentDealership(d),
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
api.get('/dealership', (req, res) => res.json(presentDealership(getDealership())));
api.put('/dealership', admin, (req, res) => {
  const body = { ...req.body };
  const before = getDealership();
  if (body.inventory_feed_url === '') delete body.inventory_feed_url; // blank = keep the saved feed
  if (body.remove_inventory_feed) body.inventory_feed_url = '';
  delete body.remove_inventory_feed;
  const updated = updateDealership(body);
  if (updated.timezone !== before.timezone) rescheduleAllRules();
  res.json(presentDealership(updated));
});

// Logo: JPG, PNG (transparency kept) or WebP. SVG is refused because it can carry scripts.
api.post('/dealership/logo', admin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PHOTO_BYTES }), (req, res) => {
  res.status(201).json(setDealershipLogo(savePhoto(req.body).url));
});
api.delete('/dealership/logo', admin, (req, res) => res.json(setDealershipLogo('')));

api.get('/accounts', (req, res) => res.json(listAccounts()));
api.post('/accounts', admin, (req, res) => res.status(201).json(createAccount(req.body)));
api.patch('/accounts/:id', admin, (req, res) => res.json(updateAccount(id(req), req.body)));
api.delete('/accounts/:id', admin, (req, res) => {
  deleteAccount(id(req));
  res.status(204).end();
});

// --- one-click connections (OAuth) ---
api.post('/oauth/:provider/start', admin, (req, res) => res.json(startOAuth(req.params.provider, req.session.user.id)));
api.get('/oauth/pending/:state', admin, (req, res) => res.json(pendingOptions(req.params.state)));
api.post('/oauth/pending/:state/connect', admin, (req, res) => res.json(connectOptions(req.params.state, req.body?.indexes || [])));

// --- inventory ---
api.get('/vehicles', (req, res) => res.json(listVehicles(req.query)));
api.get('/vehicles/:id', (req, res) => {
  const v = getVehicle(id(req));
  if (!v) throw httpError(404, 'Vehicle not found');
  res.json(v);
});
api.post('/vehicles', admin, (req, res) => res.status(201).json(createVehicle(req.body)));
api.patch('/vehicles/:id', admin, (req, res) => res.json(updateVehicle(id(req), req.body)));
api.delete('/vehicles/:id', admin, (req, res) => {
  deleteVehicle(id(req));
  res.status(204).end();
});
api.post('/vehicles/import', admin, express.text({ type: '*/*', limit: '10mb' }), (req, res) => {
  const text = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!text) throw httpError(400, 'Send the CSV file contents as the request body');
  const { seenIds, ...result } = importVehiclesCsv(text, { dryRun: req.query.dry_run === '1', markMissingSold: req.query.mark_missing_sold === '1' });
  res.json(result);
});
api.post('/vehicles/sync-feed', admin, async (req, res) => {
  requireFeature('inventoryFeed');
  const d = getDealership();
  if (!d.inventory_feed_url) throw httpError(400, 'Add your inventory feed URL in Settings first');
  try {
    res.json(await syncInventoryFeed(d, { trigger: 'manual' }));
  } catch (err) {
    throw httpError(err.status || 502, err.message);
  }
});
// Website check: compare up to 10 vehicles with their pages on the dealership's site (runs in the background).
const validationsRunning = new Set();
api.post('/inventory/validate', admin, (req, res) => {
  const dealershipId = tenantId();
  if (validationsRunning.has(dealershipId)) return res.status(202).json({ running: true });
  validationsRunning.add(dealershipId);
  const limit = Math.min(10, Math.max(1, Number(req.body?.limit) || 10));
  runWithTenant(dealershipId, () =>
    validateInventory({ limit, actor: req.session.user.email })
      .catch((err) => logActivity('system', 'inventory.validation_failed', err.message))
      .finally(() => validationsRunning.delete(dealershipId)),
  );
  res.status(202).json({ running: true });
});
api.get('/inventory/validation', admin, (req, res) => res.json({ running: validationsRunning.has(tenantId()), report: latestValidation() }));

api.get('/inventory/syncs', admin, (req, res) => {
  const d = getDealership();
  res.json({
    feed_configured: !!d.inventory_feed_url,
    feed: maskFeedUrl(d.inventory_feed_url),
    every_minutes: d.inventory_sync_minutes,
    last_synced_at: d.feed_last_synced_at,
    last_error: d.feed_last_error,
    failures: d.feed_failures,
    syncs: listInventorySyncs(20),
  });
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
  if (p && ['approved', 'scheduled'].includes(p.status) && req.session.role === 'staff') throw httpError(403, 'Ask a Dealer Admin to edit approved posts');
  const body = { ...req.body };
  if (body.media !== undefined) body.media = cleanMediaList(body.media) || [];
  res.json(updatePost(id(req), body));
});
api.delete('/posts/:id', (req, res) => {
  // Anyone can throw away a draft they just generated; deleting anything else needs a manager.
  const post = getPost(id(req));
  if (post && post.status !== 'draft' && RANK[req.session.role] < RANK.admin) throw httpError(403, 'Only a Dealer Admin can delete this post');
  deletePost(id(req));
  res.status(204).end();
});
api.post('/posts/:id/submit', (req, res) => res.json(submitForApproval(id(req))));
// For networks that aren't connected: the manager posts it themselves and records it here.
// Staff can only do this once a Dealer Admin has approved the post; an admin's own "I posted it" approves it.
api.post('/posts/:id/mark-posted', (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  if (!isApproved(post) && req.session.role === 'admin') approvePost(post.id, 'user', req.session.user);
  res.json(markPostedManually(id(req), { url: req.body?.url }));
});
api.post('/posts/:id/approve', admin, (req, res) => res.json(approvePost(id(req), 'user', req.session.user)));
api.post('/posts/:id/reject', admin, (req, res) => res.json(rejectPost(id(req), req.body?.reason)));
api.post('/posts/:id/schedule', admin, (req, res) => res.json(schedulePost(id(req), req.body?.scheduled_at, { approver: req.session.user })));
api.post('/posts/:id/unschedule', admin, (req, res) => res.json(unschedulePost(id(req))));
api.post('/posts/:id/publish', admin, async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  requireActive();
  // Publishing by hand counts as approval.
  if (['draft', 'pending_approval', 'rejected', 'failed'].includes(post.status) || !post.approved_at) approvePost(post.id, 'user', req.session.user);
  res.json(await publishPost(post.id, 'user'));
});
api.post('/posts/:id/rewrite', async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  requireActive();
  res.json(await rewritePost(post, req.body?.instruction || 'Make it better'));
});
api.post('/posts/approve-batch', admin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  res.json(ids.map((pid) => approvePost(Number(pid), 'user', req.session.user)));
});

// --- photos ---
api.post('/media', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: MAX_PHOTO_BYTES }), (req, res) => {
  res.status(201).json(savePhoto(req.body));
});

// Copy an inventory photo from the dealer's website so it can be used in a post image.
api.post('/media/import', async (req, res) => res.status(201).json(await importRemotePhoto(req.body?.url)));

// --- AI content studio ---
api.post('/generate', async (req, res) => {
  const { post_type, platforms, vehicle_id, instructions, scheduled_at, media, details, language } = req.body || {};
  res.status(201).json(
    await createPostsFromIdea({
      postType: post_type,
      platforms: platforms || [],
      vehicleId: vehicle_id,
      instructions,
      scheduledAt: scheduled_at,
      media: cleanMediaList(media),
      details: details && typeof details === 'object' ? details : null,
      language,
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
api.post('/autopilot/rules', admin, (req, res) => res.status(201).json(createRule(req.body)));
api.patch('/autopilot/rules/:id', admin, (req, res) => res.json(updateRule(id(req), req.body)));
api.delete('/autopilot/rules/:id', admin, (req, res) => {
  deleteRule(id(req));
  res.status(204).end();
});
api.post('/autopilot/rules/:id/run', admin, async (req, res) => {
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
api.post('/inbox/:id/escalate', async (req, res) => res.json(await escalateMessage(id(req))));

// --- analytics ---
api.get('/analytics', (req, res) => res.json(analyticsSummary(Math.min(365, Math.max(1, Number(req.query.days || 30))))));
api.post('/analytics/refresh', async (req, res) => res.json({ updated: await refreshMetrics() }));

// --- team ---
api.get('/team', (req, res) => res.json(listTeam(tenantId())));
api.post('/team/invites', admin, async (req, res) => res.status(201).json(await inviteMember(tenantId(), req.session.user, req.body || {})));
api.delete('/team/invites/:id', admin, (req, res) => {
  revokeInvite(tenantId(), id(req));
  res.status(204).end();
});
api.patch('/team/members/:id', admin, (req, res) => {
  changeRole(tenantId(), id(req), req.body?.role);
  res.json(listTeam(tenantId()));
});
api.delete('/team/members/:id', admin, (req, res) => {
  if (id(req) === req.session.user.id) throw httpError(400, "You can't remove yourself");
  removeMember(tenantId(), id(req));
  res.status(204).end();
});

// --- data export (owners can take their data with them) ---
api.get('/export', admin, (req, res) => {
  const t = tenantId();
  const rows = (table) => all(`SELECT * FROM ${table} WHERE dealership_id = ?`, t);
  const dealership = presentDealership(getDealership());
  res.set('Content-Disposition', `attachment; filename="dealer-social-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exported_at: new Date().toISOString(),
    dealership,
    accounts: listAccounts(),
    vehicles: rows('vehicles'),
    posts: rows('posts'),
    autopilot_rules: rows('autopilot_rules'),
    inbox_messages: rows('inbox_messages'),
    activity_log: rows('activity_log'),
  });
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
api.post('/billing/checkout', admin, async (req, res) => res.json(await createCheckout(tenantId(), req.session.user, req.body || {})));
api.post('/billing/portal', admin, async (req, res) => res.json(await createPortal(tenantId())));
