import { PLATFORMS } from '../config.js';
import { simulatedAdapter } from './simulated.js';
import { facebookAdapter, instagramAdapter } from './meta.js';

// Live connectors. Platforms missing here can only run in simulated mode for now.
const LIVE_ADAPTERS = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
};

export const liveSupported = (platform) => !!LIVE_ADAPTERS[platform];

export function adapterFor(account) {
  if (!account || account.mode !== 'live') return simulatedAdapter;
  const adapter = LIVE_ADAPTERS[account.platform];
  if (!adapter) {
    throw new Error(`Live publishing to ${PLATFORMS[account.platform]?.label || account.platform} is not available yet — switch the account to simulated mode`);
  }
  return adapter;
}
