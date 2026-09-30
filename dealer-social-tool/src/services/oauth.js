// "Connect with Facebook / Google / LinkedIn / X / TikTok" flows.
import { config } from '../config.js';
import { get, run, updateRow } from '../db.js';
import { randomToken, encrypt, decrypt } from '../crypto.js';
import { tenantId } from '../tenant.js';
import { OAUTH_PROVIDERS } from '../platforms/index.js';
import { createAccount, saveTokens } from './accounts.js';
import { httpError } from './errors.js';

const redirectUri = (provider) => `${config.appUrl}/oauth/${provider}/callback`;
const MAX_AGE_MS = 15 * 60_000;

export function oauthStatus() {
  return Object.fromEntries(Object.entries(OAUTH_PROVIDERS).map(([k, p]) => [k, { label: p.label, platforms: p.platforms, configured: p.impl.configured() }]));
}

export function startOAuth(provider, userId) {
  const p = OAUTH_PROVIDERS[provider];
  if (!p) throw httpError(404, 'Unknown provider');
  if (!p.impl.configured()) throw httpError(503, `${p.label} connection is not configured on this server yet`);
  const state = randomToken(24);
  const verifier = p.impl.newVerifier ? p.impl.newVerifier() : '';
  run('INSERT INTO oauth_states (state, dealership_id, user_id, provider, verifier) VALUES (?, ?, ?, ?, ?)', state, tenantId(), userId, provider, verifier);
  return { url: p.impl.authorizeUrl({ state, redirectUri: redirectUri(provider), verifier }) };
}

function loadState(state) {
  const row = get('SELECT * FROM oauth_states WHERE state = ?', state || '');
  if (!row || Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) throw httpError(400, 'This connection link expired — please try again');
  return row;
}

/** OAuth redirect target (no session needed: the state proves who started it). */
export async function completeOAuth(provider, state, code) {
  const row = loadState(state);
  if (row.provider !== provider) throw httpError(400, 'Provider mismatch');
  const options = await OAUTH_PROVIDERS[provider].impl.exchange({ code, redirectUri: redirectUri(provider), verifier: row.verifier });
  run('UPDATE oauth_states SET result = ? WHERE state = ?', encrypt(JSON.stringify(options)), state);
  return row;
}

function optionsFor(state) {
  const row = loadState(state);
  if (row.dealership_id !== tenantId()) throw httpError(403, 'This connection belongs to another dealership');
  return JSON.parse(decrypt(row.result) || '[]');
}

export function pendingOptions(state) {
  return optionsFor(state).map((o, index) => ({
    index,
    platform: o.platform,
    display_name: o.display_name,
    external_id: o.external_id,
    already_connected: !!get('SELECT id FROM accounts WHERE dealership_id = ? AND platform = ? AND external_id = ?', tenantId(), o.platform, o.external_id),
  }));
}

export function connectOptions(state, indexes) {
  const options = optionsFor(state);
  const connected = [];
  for (const i of indexes) {
    const o = options[Number(i)];
    if (!o) continue;
    const existing = get('SELECT id FROM accounts WHERE dealership_id = ? AND platform = ? AND external_id = ?', tenantId(), o.platform, o.external_id);
    if (existing) {
      saveTokens(existing.id, o);
      updateRow('accounts', existing.id, { mode: 'live', display_name: o.display_name, enabled: 1, last_error: null }, ['mode', 'display_name', 'enabled', 'last_error']);
      connected.push(existing.id);
    } else {
      connected.push(createAccount({ ...o, mode: 'live' }).id);
    }
  }
  run('DELETE FROM oauth_states WHERE state = ?', state);
  run('DELETE FROM oauth_states WHERE created_at < ?', new Date(Date.now() - MAX_AGE_MS).toISOString());
  return { connected: connected.length };
}
