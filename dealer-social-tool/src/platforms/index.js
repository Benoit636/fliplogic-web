import { PLATFORMS } from '../config.js';
import { simulatedAdapter } from './simulated.js';
import { facebookAdapter, instagramAdapter, metaOAuth } from './meta.js';
import { xAdapter, xOAuth } from './x.js';
import { linkedinAdapter, linkedinOAuth } from './linkedin.js';
import { googleAdapter, googleOAuth } from './google.js';
import { tiktokAdapter, tiktokOAuth } from './tiktok.js';
import { saveTokens } from '../services/accounts.js';

const LIVE_ADAPTERS = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  x: xAdapter,
  linkedin: linkedinAdapter,
  google_business: googleAdapter,
  tiktok: tiktokAdapter,
};

/** OAuth "Connect" providers and which platforms each one can add. */
export const OAUTH_PROVIDERS = {
  meta: { label: 'Facebook & Instagram', platforms: ['facebook', 'instagram'], impl: metaOAuth },
  google: { label: 'Google Business Profile', platforms: ['google_business'], impl: googleOAuth },
  linkedin: { label: 'LinkedIn', platforms: ['linkedin'], impl: linkedinOAuth },
  x: { label: 'X (Twitter)', platforms: ['x'], impl: xOAuth },
  tiktok: { label: 'TikTok', platforms: ['tiktok'], impl: tiktokOAuth },
};

export const liveSupported = (platform) => !!LIVE_ADAPTERS[platform];

export function adapterFor(account) {
  if (!account || account.mode !== 'live') return simulatedAdapter;
  const adapter = LIVE_ADAPTERS[account.platform];
  if (!adapter) throw new Error(`Live publishing to ${PLATFORMS[account.platform]?.label || account.platform} is not available`);
  return adapter;
}

/** Refresh short-lived OAuth tokens (Google 1h, TikTok 24h, X 2h, LinkedIn 60d) shortly before they expire. */
export async function ensureFreshToken(account) {
  if (!account || account.mode !== 'live') return account;
  const adapter = LIVE_ADAPTERS[account.platform];
  if (!adapter?.refresh || !account.refresh_token || !account.token_expires_at) return account;
  if (new Date(account.token_expires_at).getTime() - Date.now() > 5 * 60_000) return account;
  const fresh = await adapter.refresh(account);
  saveTokens(account.id, fresh);
  return { ...account, ...Object.fromEntries(Object.entries(fresh).filter(([, v]) => v)) };
}
