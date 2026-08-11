// Defaults point at production. Override from the popup's settings panel —
// stored per-install in chrome.storage.local under `flCaptureConfig`, so a
// local dev install can point at localhost without a code change.
export const DEFAULT_CONFIG = {
  appBaseUrl: 'https://fliplogic-web.vercel.app',
  apiBaseUrl: 'https://fliplogic-backend-production-192d.up.railway.app',
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
