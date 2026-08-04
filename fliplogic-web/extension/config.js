// Defaults point at local dev. Override from the popup's settings panel —
// stored per-install in chrome.storage.local under `flCaptureConfig`, so a
// dealer's install can point at production without a code change.
export const DEFAULT_CONFIG = {
  // TODO: confirm and replace with the real production Vercel/Railway URLs.
  appBaseUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:4000',
};

export async function getConfig() {
  const stored = await chrome.storage.local.get('flCaptureConfig');
  return { ...DEFAULT_CONFIG, ...(stored.flCaptureConfig || {}) };
}

export async function setConfig(partial) {
  const current = await getConfig();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ flCaptureConfig: next });
  return next;
}
