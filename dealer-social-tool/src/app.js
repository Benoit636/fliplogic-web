import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { api } from './routes/api.js';
import { AiRefusalError } from './ai/client.js';
import { ingestMessage } from './services/inbox.js';
import { get } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function basicAuth(req, res, next) {
  if (!config.adminPassword) return next();
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  const password = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  const a = Buffer.from(password);
  const b = Buffer.from(config.adminPassword);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Dealer Social Tool"').status(401).send('Authentication required');
}

// Meta signs webhook payloads with the app secret (X-Hub-Signature-256).
function validMetaSignature(req) {
  if (!config.metaAppSecret || !req.rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', config.metaAppSecret).update(req.rawBody).digest('hex')}`;
  const given = String(req.headers['x-hub-signature-256'] || '');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb', verify: (req, res, buf) => (req.rawBody = buf) }));

  // Meta webhooks (public; verified with META_VERIFY_TOKEN).
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
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const isFb = change.field === 'feed' && v.item === 'comment' && v.verb === 'add';
        const isIg = change.field === 'comments';
        if (!isFb && !isIg) continue;
        const parentPost = get('SELECT id FROM posts WHERE external_id = ?', isFb ? v.post_id : v.media?.id);
        await ingestMessage({
          platform: isFb ? 'facebook' : 'instagram',
          kind: 'comment',
          author: isFb ? v.from?.name : v.from?.username,
          text: v.message || v.text || '',
          external_id: isFb ? v.comment_id : v.id,
          post_id: parentPost?.id,
        }).catch(() => {});
      }
    }
  });

  app.use(basicAuth);
  app.use('/api', api);
  app.use(express.static(path.join(here, '..', 'public')));

  app.use((err, req, res, _next) => {
    let status = err.status || 500;
    let message = err.message || 'Something went wrong';
    if (err instanceof AiRefusalError) status = 422;
    else if (err instanceof Anthropic.AuthenticationError) message = 'The Claude API key was rejected — check ANTHROPIC_API_KEY';
    else if (err instanceof Anthropic.RateLimitError) {
      status = 429;
      message = 'The AI is rate limited right now — try again in a minute';
    } else if (err instanceof Anthropic.APIError) {
      status = 502;
      message = `AI service error: ${err.message}`;
    }
    if (status >= 500) console.error(err);
    res.status(status).json({ error: message });
  });
  return app;
}
