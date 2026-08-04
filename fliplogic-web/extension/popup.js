import { getConfig, setConfig } from './config.js';

const app = document.getElementById('app');

function sendToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function tryExtract() {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, reason: 'no_tab' };
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'FL_EXTRACT' });
    return result || { ok: false, reason: 'no_response' };
  } catch {
    // No content script on this page — not a supported provider tab.
    return { ok: false, reason: 'unsupported_page' };
  }
}

function renderLogin(error) {
  app.innerHTML = `
    <div class="field">
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="username" />
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" />
    </div>
    <button id="loginBtn" type="button">Log in</button>
    ${error ? `<p class="error">${error}</p>` : ''}
  `;
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) return;
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Logging in…';
    const res = await sendToBackground({ type: 'FL_LOGIN', email, password });
    if (res.ok) {
      init();
    } else {
      renderLogin(res.error);
    }
  });
}

async function openManualEntry() {
  const { appBaseUrl } = await getConfig();
  chrome.tabs.create({ url: `${appBaseUrl}/appraisal/new` });
}

function fallbackNotice(title, body) {
  return `
    <div class="preview">
      <p style="margin:0 0 8px; font-weight:600;">${title}</p>
      <p style="margin:0; color:var(--ink-soft);">${body}</p>
    </div>
    <button id="manualBtn" type="button" class="secondary">Enter appraisal manually</button>
  `;
}

function setCaptureArea(html) {
  document.getElementById('captureArea').innerHTML = html;
}

async function renderCapture(user) {
  app.innerHTML = `
    <div class="status-row">
      <span class="who">Logged in as <b>${user?.email || 'you'}</b></span>
      <button id="logoutBtn" type="button" class="link-btn">Log out</button>
    </div>
    <div id="captureArea"><p class="loading">Checking this tab…</p></div>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await sendToBackground({ type: 'FL_LOGOUT' });
    init();
  });

  const result = await tryExtract();

  if (result.ok) {
    renderPreview(result.payload);
    return;
  }

  if (result.reason === 'not_configured') {
    setCaptureArea(`
      <span class="badge">vAuto capture — coming soon</span>
      ${fallbackNotice(
        'This page is recognized, but capture isn’t wired up yet.',
        result.message || 'The vAuto adapter is still being built against real page markup.'
      )}
    `);
  } else {
    setCaptureArea(fallbackNotice(
      'No appraisal detected on this tab.',
      'Open a completed vAuto appraisal, or enter the details yourself below.'
    ));
  }
  document.getElementById('manualBtn')?.addEventListener('click', openManualEntry);
}

function renderPreview(payload) {
  const rows = [
    ['VIN', payload.vin],
    ['Vehicle', [payload.year, payload.make, payload.model, payload.trim].filter(Boolean).join(' ')],
    ['Mileage', payload.mileage != null ? `${payload.mileage.toLocaleString()} km` : '—'],
    ['Retail range', `$${payload.lowRetail?.toLocaleString()} – $${payload.highRetail?.toLocaleString()}`],
  ];
  setCaptureArea(`
    <div class="preview">
      <dl>
        ${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ?? '—'}</dd>`).join('')}
      </dl>
    </div>
    <button id="submitBtn" type="button">Send to FlipLogic</button>
    <p id="submitError" class="error" hidden></p>
  `);
  document.getElementById('submitBtn').addEventListener('click', async () => {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    const res = await sendToBackground({ type: 'FL_SUBMIT_CAPTURE', payload });
    if (!res.ok) {
      const err = document.getElementById('submitError');
      err.textContent = res.error;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Send to FlipLogic';
    }
    // On success, background.js opens the results tab directly.
  });
}

async function init() {
  app.innerHTML = '<p class="loading">Loading…</p>';
  const status = await sendToBackground({ type: 'FL_STATUS' });
  if (status.ok && status.loggedIn) {
    renderCapture(status.user);
  } else {
    renderLogin();
  }
}

function initSettings() {
  const toggle = document.getElementById('settingsToggle');
  const panel = document.getElementById('settingsPanel');
  toggle.addEventListener('click', async () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const cfg = await getConfig();
      document.getElementById('appBaseUrl').value = cfg.appBaseUrl;
      document.getElementById('apiBaseUrl').value = cfg.apiBaseUrl;
    }
  });
  document.getElementById('saveSettings').addEventListener('click', async () => {
    await setConfig({
      appBaseUrl: document.getElementById('appBaseUrl').value.trim(),
      apiBaseUrl: document.getElementById('apiBaseUrl').value.trim(),
    });
    const saved = document.getElementById('settingsSaved');
    saved.hidden = false;
    setTimeout(() => { saved.hidden = true; }, 1500);
  });
}

init();
initSettings();
