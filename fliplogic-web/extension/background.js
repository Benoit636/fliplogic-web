import { getConfig } from './config.js';

// Auth token lives in chrome.storage.local, never the dealer's vAuto
// credentials — the extension only ever authenticates against FlipLogic's
// own API with FlipLogic's own login.
async function getToken() {
  const stored = await chrome.storage.local.get('flAuthToken');
  return stored.flAuthToken || null;
}

async function login(email, password) {
  const { apiBaseUrl } = await getConfig();
  const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  await chrome.storage.local.set({ flAuthToken: data.token, flAuthUser: data.user });
  return data.user;
}

async function logout() {
  await chrome.storage.local.remove(['flAuthToken', 'flAuthUser']);
}

// Submits the payload the content script extracted to the same endpoint
// the manual-entry form already uses — no new backend surface for v1.
async function submitCapture(payload) {
  const token = await getToken();
  if (!token) throw new Error('Not logged in to FlipLogic');

  const { apiBaseUrl } = await getConfig();
  const res = await fetch(`${apiBaseUrl}/api/appraisals/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not create the Buy Decision Report');
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'FL_LOGIN') {
        const user = await login(message.email, message.password);
        sendResponse({ ok: true, user });
      } else if (message.type === 'FL_LOGOUT') {
        await logout();
        sendResponse({ ok: true });
      } else if (message.type === 'FL_STATUS') {
        const token = await getToken();
        const stored = await chrome.storage.local.get('flAuthUser');
        sendResponse({ ok: true, loggedIn: !!token, user: stored.flAuthUser || null });
      } else if (message.type === 'FL_SUBMIT_CAPTURE') {
        const result = await submitCapture(message.payload);
        const { appBaseUrl } = await getConfig();
        await chrome.tabs.create({ url: `${appBaseUrl}/appraisal/${result.id}/results` });
        sendResponse({ ok: true, id: result.id });
      } else {
        sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep the message channel open for the async response
});
