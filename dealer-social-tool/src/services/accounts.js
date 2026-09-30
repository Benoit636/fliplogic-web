import { PLATFORMS } from '../config.js';
import { all, get, run, updateRow, logActivity } from '../db.js';
import { httpError } from './errors.js';

const mask = (token) => (token ? `••••${token.slice(-4)}` : '');

function present(row) {
  if (!row) return row;
  const { access_token, ...rest } = row;
  return { ...rest, enabled: !!row.enabled, has_token: !!access_token, token_hint: mask(access_token) };
}

export function listAccounts() {
  return all('SELECT * FROM accounts ORDER BY platform, id').map(present);
}

export function getAccountRaw(id) {
  return get('SELECT * FROM accounts WHERE id = ?', id);
}

/** The enabled account used to publish to a platform (first match wins). */
export function accountForPlatform(platform) {
  return get('SELECT * FROM accounts WHERE platform = ? AND enabled = 1 ORDER BY id LIMIT 1', platform);
}

export function createAccount({ platform, display_name, mode = 'simulated', external_id = '', access_token = '' }) {
  if (!PLATFORMS[platform]) throw httpError(400, `Unknown platform "${platform}"`);
  if (!display_name) throw httpError(400, 'display_name is required');
  if (mode === 'live' && (!external_id || !access_token)) {
    throw httpError(400, 'Live accounts need the page/account ID and an access token');
  }
  const { lastInsertRowid } = run(
    'INSERT INTO accounts (platform, display_name, mode, external_id, access_token) VALUES (?, ?, ?, ?, ?)',
    platform,
    display_name,
    mode,
    external_id,
    access_token,
  );
  logActivity('user', 'account.connected', `${PLATFORMS[platform].label}: ${display_name} (${mode})`);
  return present(getAccountRaw(Number(lastInsertRowid)));
}

export function updateAccount(id, fields) {
  if (!getAccountRaw(id)) throw httpError(404, 'Account not found');
  const patch = { ...fields };
  if (patch.enabled !== undefined) patch.enabled = patch.enabled ? 1 : 0;
  if (patch.access_token === '') delete patch.access_token;
  const merged = { ...getAccountRaw(id), ...patch };
  if (merged.mode === 'live' && (!merged.external_id || !merged.access_token)) {
    throw httpError(400, 'Live accounts need the page/account ID and an access token');
  }
  updateRow('accounts', id, patch, ['display_name', 'mode', 'external_id', 'access_token', 'enabled']);
  return present(getAccountRaw(id));
}

export function deleteAccount(id) {
  run('DELETE FROM accounts WHERE id = ?', id);
}
