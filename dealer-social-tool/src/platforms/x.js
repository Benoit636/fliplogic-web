// X (Twitter) API v2 with OAuth 2.0 user-context tokens (PKCE). Text posts, replies and public metrics.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { request, expiresAt } from './http.js';

const API = 'https://api.x.com/2';
const basicAuth = () => `Basic ${Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64')}`;

export const xAdapter = {
  async publish(post, account, text) {
    const { body } = await request(`${API}/tweets`, { method: 'POST', token: account.access_token, json: { text } });
    const id = body.data.id;
    return { external_id: id, external_url: `https://x.com/i/web/status/${id}`, metrics: {} };
  },
  async fetchMetrics(post, account) {
    const { body } = await request(`${API}/tweets/${post.external_id}?tweet.fields=public_metrics`, { token: account.access_token });
    const m = body.data?.public_metrics || {};
    return {
      ...post.metrics,
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      impressions: m.impression_count ?? post.metrics?.impressions ?? 0,
      reach: m.impression_count ?? post.metrics?.reach ?? 0,
    };
  },
  async reply(message, account, text) {
    return request(`${API}/tweets`, { method: 'POST', token: account.access_token, json: { text, reply: { in_reply_to_tweet_id: message.external_id } } });
  },
  async fetchComments() {
    return []; // Reading replies needs a paid X API tier; replies arrive via the inbox manually for now.
  },
  async refresh(account) {
    const { body } = await request(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { authorization: basicAuth() },
      form: { grant_type: 'refresh_token', refresh_token: account.refresh_token, client_id: config.xClientId },
    });
    return { access_token: body.access_token, refresh_token: body.refresh_token, token_expires_at: expiresAt(body.expires_in) };
  },
};

export const xOAuth = {
  configured: () => !!(config.xClientId && config.xClientSecret),
  newVerifier: () => crypto.randomBytes(32).toString('base64url'),
  authorizeUrl({ state, redirectUri, verifier }) {
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const url = new URL('https://x.com/i/oauth2/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.xClientId,
      redirect_uri: redirectUri,
      scope: 'tweet.read tweet.write users.read offline.access',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return url.toString();
  },
  async exchange({ code, redirectUri, verifier }) {
    const { body } = await request(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { authorization: basicAuth() },
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier, client_id: config.xClientId },
    });
    const me = await request(`${API}/users/me`, { token: body.access_token });
    return [
      {
        platform: 'x',
        external_id: me.body.data.id,
        display_name: `@${me.body.data.username}`,
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        token_expires_at: expiresAt(body.expires_in),
      },
    ];
  },
};
