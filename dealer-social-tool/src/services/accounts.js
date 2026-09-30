import { PLATFORMS } from '../config.js';
import { all, get, run, updateRow, logActivity } from '../db.js';
import { tenantId } from '../tenant.js';
import { encrypt, decrypt } from '../crypto.js';
import { httpError } from './errors.js';
import { requireRoom } from './entitlements.js';

const mask = (token) => (token ? `••••${token.slice(-4)}` : '');

function present(row) {
  if (!row) return row;
  const { access_token, refresh_token, ...rest } = row;
  const token = decrypt(access_token);
  return { ...rest, enabled: !!row.enabled, has_token: !!token, token_hint: mask(token) };
}

/** Internal: account with decrypted credentials, for adapters only. */
function withSecrets(row) {
  if (!row) return row;
  return { ...row, access_token: decrypt(row.access_token), refresh_token: decrypt(row.refresh_token) };
}

export function listAccounts() {
  return all('SELECT * FROM accounts WHERE dealership_id = ? ORDER BY platform, id', tenantId()).map(present);
}

export function getAccountRaw(id) {
  return withSecrets(get('SELECT * FROM accounts WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

/** The enabled account used to publish to a platform (first match wins). */
export function accountForPlatform(platform) {
  return withSecrets(get('SELECT * FROM accounts WHERE dealership_id = ? AND platform = ? AND enabled = 1 ORDER BY id LIMIT 1', tenantId(), platform));
}

export function createAccount({
  platform,
  display_name,
  mode = 'simulated',
  external_id = '',
  access_token = '',
  refresh_token = '',
  token_expires_at = null,
}) {
  if (!PLATFORMS[platform]) throw httpError(400, `Unknown platform "${platform}"`);
  if (!display_name) throw httpError(400, 'display_name is required');
  if (mode === 'live' && (!external_id || !access_token)) {
    throw httpError(400, 'Live accounts need the page/account ID and an access token');
  }
  requireRoom('socialAccounts', listAccounts().length, 'social accounts');
  const { lastInsertRowid } = run(
    `INSERT INTO accounts (dealership_id, platform, display_name, mode, external_id, access_token, refresh_token, token_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    tenantId(),
    platform,
    display_name,
    mode,
    external_id,
    encrypt(access_token),
    encrypt(refresh_token),
    token_expires_at,
  );
  logActivity('user', 'account.connected', `${PLATFORMS[platform].label}: ${display_name} (${mode})`);
  return present(get('SELECT * FROM accounts WHERE id = ?', Number(lastInsertRowid)));
}

export function updateAccount(id, fields) {
  const existing = getAccountRaw(id);
  if (!existing) throw httpError(404, 'Account not found');
  const patch = { ...fields };
  if (patch.enabled !== undefined) patch.enabled = patch.enabled ? 1 : 0;
  if (!patch.access_token) delete patch.access_token;
  const merged = { ...existing, ...patch };
  if (merged.mode === 'live' && (!merged.external_id || !merged.access_token)) {
    throw httpError(400, 'Live accounts need the page/account ID and an access token');
  }
  if (patch.access_token) patch.access_token = encrypt(patch.access_token);
  updateRow('accounts', id, patch, ['display_name', 'mode', 'external_id', 'access_token', 'enabled']);
  return present(get('SELECT * FROM accounts WHERE id = ?', id));
}

/** Store refreshed OAuth credentials (called by platform adapters). */
export function saveTokens(id, { access_token, refresh_token, token_expires_at }) {
  updateRow(
    'accounts',
    id,
    {
      access_token: access_token ? encrypt(access_token) : undefined,
      refresh_token: refresh_token ? encrypt(refresh_token) : undefined,
      token_expires_at,
    },
    ['access_token', 'refresh_token', 'token_expires_at'],
  );
}

export function recordAccountError(id, error) {
  updateRow('accounts', id, { last_error: error ? String(error).slice(0, 300) : null }, ['last_error']);
}

export function deleteAccount(id) {
  run('DELETE FROM accounts WHERE id = ? AND dealership_id = ?', id, tenantId());
}
