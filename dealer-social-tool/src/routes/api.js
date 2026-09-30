import crypto from 'node:crypto';
import express from 'express';
import { PLATFORMS, POST_TYPES, POST_STATUSES, config } from '../config.js';
import { all } from '../db.js';
import { aiEnabled } from '../ai/client.js';
import { chat, conversationTranscript } from '../ai/agent.js';
import { rewritePost } from '../ai/generator.js';
import { liveSupported } from '../platforms/index.js';
import { getDealership, updateDealership } from '../services/dealership.js';
import { listAccounts, createAccount, updateAccount, deleteAccount } from '../services/accounts.js';
import { listVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle, importVehiclesCsv } from '../services/inventory.js';
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
import { listRules, getRule, createRule, updateRule, deleteRule, runRule } from '../services/autopilot.js';
import { listMessages, ingestMessage, replyToMessage, dismissMessage, escalateMessage, simulateIncoming, inboxCounts, syncComments } from '../services/inbox.js';
import { analyticsSummary } from '../services/analytics.js';
import { httpError } from '../services/errors.js';

export const api = express.Router();
const id = (req) => Number(req.params.id);

// --- meta ---
api.get('/meta', (req, res) => {
  res.json({
    ai_enabled: aiEnabled(),
    ai_model: aiEnabled() ? config.aiModel : null,
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([k, p]) => [k, { ...p, live_supported: liveSupported(k) }])),
    post_types: POST_TYPES,
    post_statuses: POST_STATUSES,
  });
});

api.get('/dashboard', (req, res) => {
  const now = new Date().toISOString();
  res.json({
    dealership: getDealership(),
    post_counts: statusCounts(),
    inbox: inboxCounts(),
    upcoming: listPosts({ status: 'scheduled', from: now, limit: 200 }).reverse().slice(0, 8),
    needs_approval: listPosts({ status: 'pending_approval', limit: 5 }),
    failed: listPosts({ status: 'failed', limit: 5 }),
    analytics: analyticsSummary(7),
    activity: all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 25'),
    accounts: listAccounts(),
    inventory: all(`SELECT status, COUNT(*) AS n FROM vehicles GROUP BY status`),
  });
});

api.get('/activity', (req, res) => {
  res.json(all('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?', Number(req.query.limit || 200)));
});

// --- dealership & accounts ---
api.get('/dealership', (req, res) => res.json(getDealership()));
api.put('/dealership', (req, res) => res.json(updateDealership(req.body)));

api.get('/accounts', (req, res) => res.json(listAccounts()));
api.post('/accounts', (req, res) => res.status(201).json(createAccount(req.body)));
api.patch('/accounts/:id', (req, res) => res.json(updateAccount(id(req), req.body)));
api.delete('/accounts/:id', (req, res) => {
  deleteAccount(id(req));
  res.status(204).end();
});

// --- inventory ---
api.get('/vehicles', (req, res) => res.json(listVehicles(req.query)));
api.get('/vehicles/:id', (req, res) => {
  const v = getVehicle(id(req));
  if (!v) throw httpError(404, 'Vehicle not found');
  res.json(v);
});
api.post('/vehicles', (req, res) => res.status(201).json(createVehicle(req.body)));
api.patch('/vehicles/:id', (req, res) => res.json(updateVehicle(id(req), req.body)));
api.delete('/vehicles/:id', (req, res) => {
  deleteVehicle(id(req));
  res.status(204).end();
});
api.post('/vehicles/import', express.text({ type: '*/*', limit: '5mb' }), (req, res) => {
  const text = typeof req.body === 'string' ? req.body : req.body?.csv;
  if (!text) throw httpError(400, 'Send the CSV file contents as the request body');
  res.json(importVehiclesCsv(text));
});

// --- posts ---
api.get('/posts', (req, res) => res.json(listPosts(req.query)));
api.get('/posts/:id', (req, res) => {
  const p = getPost(id(req));
  if (!p) throw httpError(404, 'Post not found');
  res.json(p);
});
api.post('/posts', (req, res) => res.status(201).json(createPost({ ...req.body, source: 'manual' })));
api.patch('/posts/:id', (req, res) => res.json(updatePost(id(req), req.body)));
api.delete('/posts/:id', (req, res) => {
  deletePost(id(req));
  res.status(204).end();
});
api.post('/posts/:id/submit', (req, res) => res.json(submitForApproval(id(req))));
api.post('/posts/:id/approve', (req, res) => res.json(approvePost(id(req))));
api.post('/posts/:id/reject', (req, res) => res.json(rejectPost(id(req), req.body?.reason)));
api.post('/posts/:id/schedule', (req, res) => res.json(schedulePost(id(req), req.body?.scheduled_at)));
api.post('/posts/:id/unschedule', (req, res) => res.json(unschedulePost(id(req))));
api.post('/posts/:id/publish', async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  // Publishing by hand counts as approval.
  if (['draft', 'pending_approval', 'rejected', 'failed'].includes(post.status)) approvePost(post.id);
  res.json(await publishPost(post.id, 'user'));
});
api.post('/posts/:id/rewrite', async (req, res) => {
  const post = getPost(id(req));
  if (!post) throw httpError(404, 'Post not found');
  res.json(await rewritePost(post, req.body?.instruction || 'Make it better'));
});
api.post('/posts/approve-batch', (req, res) => {
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
  const conversationId = req.body?.conversation_id || crypto.randomUUID();
  const result = await chat(conversationId, message);
  res.json({ conversation_id: conversationId, ...result });
});
api.get('/chat/:conversationId', (req, res) => res.json(conversationTranscript(req.params.conversationId)));

// --- autopilot ---
api.get('/autopilot/rules', (req, res) => res.json(listRules()));
api.post('/autopilot/rules', (req, res) => res.status(201).json(createRule(req.body)));
api.patch('/autopilot/rules/:id', (req, res) => res.json(updateRule(id(req), req.body)));
api.delete('/autopilot/rules/:id', (req, res) => {
  deleteRule(id(req));
  res.status(204).end();
});
api.post('/autopilot/rules/:id/run', async (req, res) => {
  const rule = getRule(id(req));
  if (!rule) throw httpError(404, 'Rule not found');
  res.json(await runRule(rule, 'user'));
});

// --- inbox ---
api.get('/inbox', (req, res) => res.json(listMessages({ ...req.query, lead: req.query.lead === '1' })));
api.post('/inbox', async (req, res) => res.status(201).json(await ingestMessage(req.body)));
api.post('/inbox/simulate', async (req, res) => res.json(await simulateIncoming(Number(req.body?.count || 3))));
api.post('/inbox/sync', async (req, res) => res.json({ added: await syncComments() }));
api.post('/inbox/:id/reply', async (req, res) => res.json(await replyToMessage(id(req), req.body?.text)));
api.post('/inbox/:id/dismiss', (req, res) => res.json(dismissMessage(id(req))));
api.post('/inbox/:id/escalate', (req, res) => res.json(escalateMessage(id(req))));

// --- analytics ---
api.get('/analytics', (req, res) => res.json(analyticsSummary(Math.min(365, Math.max(1, Number(req.query.days || 30))))));
api.post('/analytics/refresh', async (req, res) => res.json({ updated: await refreshMetrics() }));
