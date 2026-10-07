import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { config, isProduction } from './config.js';
import { get } from './db.js';
import { runWithTenant } from './tenant.js';
import { api } from './routes/api.js';
import { authRoutes, meRoutes, SESSION_COOKIE } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { AiRefusalError } from './ai/client.js';
import { getSession } from './services/auth.js';
import { ingestMessage } from './services/inbox.js';
import { handleWebhook } from './services/billing.js';
import { completeOAuth } from './services/oauth.js';
import { PLANS } from './plans.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Meta signs webhook payloads with the app secret (X-Hub-Signature-256).
function validMetaSignature(req) {
  if (!config.metaAppSecret || !req.rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', config.metaAppSecret).update(req.rawBody).digest('hex')}`;
  const given = String(req.headers['x-hub-signature-256'] || '');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy':
      "default-src 'self'; img-src * data: blob:; media-src *; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  if (isProduction) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProduction) app.set('trust proxy', 1);
  app.use(securityHeaders);

  // Stripe needs the untouched body to verify signatures, so this comes before the JSON parser.
  app.post('/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
    try {
      res.json(await handleWebhook(req.body, req.headers['stripe-signature']));
    } catch (err) {
      next(err);
    }
  });

  app.use(express.json({ limit: '2mb', verify: (req, res, buf) => (req.rawBody = buf) }));
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    req.session = getSession(req.cookies[SESSION_COOKIE]);
    next();
  });

  // CSRF: state-changing API calls must come from our own scripts (custom header forces a CORS preflight).
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
      return res.status(403).json({ error: 'Missing X-Requested-With header' });
    }
    next();
  });

  app.get('/healthz', (req, res) => {
    get('SELECT 1 AS ok');
    res.json({ ok: true });
  });
  app.get('/api/public/plans', (req, res) =>
    res.json({ plans: PLANS, trial_days: config.trialDays, product_name: config.productName, sales_email: config.supportEmail }),
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/admin', adminRoutes);
  app.use(
    '/api',
    (req, res, next) => {
      if (!req.session) return res.status(401).json({ error: 'Please log in' });
      if (!req.session.dealershipId) return res.status(409).json({ error: 'Create or join a dealership first', code: 'no_dealership' });
      runWithTenant(req.session.dealershipId, next);
    },
    api,
  );
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // OAuth redirect target for "Connect" buttons.
  app.get('/oauth/:provider/callback', async (req, res) => {
    if (req.query.error) return res.redirect(`/app#/settings?connect_error=${encodeURIComponent(req.query.error_description || req.query.error)}`);
    try {
      const row = await completeOAuth(req.params.provider, req.query.state, req.query.code);
      res.redirect(`/app#/settings?connect=${encodeURIComponent(row.state)}`);
    } catch (err) {
      res.redirect(`/app#/settings?connect_error=${encodeURIComponent(err.message)}`);
    }
  });

  // Meta webhooks for real-time Facebook/Instagram comments.
  app.get('/webhooks/meta', (req, res) => {
    if (config.metaVerifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.metaVerifyToken) {
      return res.send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
  });
  app.post('/webhooks/meta', async (req, res) => {
    if (!validMetaSignature(req)) return res.sendStatus(403);
    res.sendStatus(200); // acknowledge fast, then process
    for (const entry of req.body?.entry || []) {
      const platform = req.body.object === 'instagram' ? 'instagram' : 'facebook';
      const account = get('SELECT * FROM accounts WHERE platform = ? AND external_id = ? AND mode = ?', platform, String(entry.id), 'live');
      if (!account) continue;
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const isFb = change.field === 'feed' && v.item === 'comment' && v.verb === 'add';
        const isIg = change.field === 'comments';
        if (!isFb && !isIg) continue;
        if (isFb && v.from?.id === account.external_id) continue; // our own replies
        await runWithTenant(account.dealership_id, async () => {
          const parentPost = get('SELECT id FROM posts WHERE dealership_id = ? AND external_id = ?', account.dealership_id, isFb ? v.post_id : v.media?.id);
          await ingestMessage({
            platform,
            kind: 'comment',
            author: isFb ? v.from?.name : v.from?.username,
            text: v.message || v.text || '',
            external_id: isFb ? v.comment_id : v.id,
            post_id: parentPost?.id,
          }).catch(() => {});
        });
      }
    }
  });

  // Pages
  const page = (file) => (req, res) => res.sendFile(path.join(publicDir, file));
  app.get('/', page('landing.html'));
  app.get(['/login', '/signup', '/forgot', '/reset', '/invite'], page('auth.html'));
  app.get(['/privacy', '/terms', '/data-deletion'], page('legal.html'));
  app.get('/app', (req, res) => (req.session ? res.sendFile(path.join(publicDir, 'app.html')) : res.redirect('/login')));
  app.get('/admin', (req, res) => (req.session?.user?.is_superadmin ? res.sendFile(path.join(publicDir, 'admin.html')) : res.redirect('/login')));
  app.use(express.static(publicDir, { index: false }));
  // Uploaded vehicle photos (public so social networks can fetch them; file names are unguessable).
  app.use('/media', express.static(config.mediaDir, { index: false, maxAge: '30d', fallthrough: false }));
  app.use('/shared', express.static(path.join(here, 'shared'), { index: false }));

  app.use((err, req, res, _next) => {
    let status = err.status || 500;
    let message = err.message || 'Something went wrong';
    if (err instanceof AiRefusalError) status = 422;
    else if (err instanceof Anthropic.AuthenticationError) message = 'The AI service key was rejected — contact support';
    else if (err instanceof Anthropic.RateLimitError) {
      status = 429;
      message = 'The AI is busy right now — try again in a minute';
    } else if (err instanceof Anthropic.APIError) {
      status = 502;
      message = 'The AI service had a problem — please try again';
    } else if (err.type === 'entity.parse.failed') {
      status = 400;
      message = 'Invalid JSON';
    }
    if (status >= 500) {
      console.error(err);
      if (isProduction && !(err instanceof Anthropic.APIError)) message = 'Something went wrong — please try again';
    }
    res.status(status).json({ error: message });
  });
  return app;
}
