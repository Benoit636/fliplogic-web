# FlipLogic Capture (browser extension)

Tier 1 of the [integration architecture](../CLAUDE.md): reads a completed
appraisal straight off a provider's own page and sends it into FlipLogic —
no retyping.

## Status: v0.1 — working shell, vAuto adapter not wired up yet

What works today, tested end-to-end against a real backend:

- Login (stores a FlipLogic auth token locally, never the dealer's vAuto
  credentials)
- Settings panel to point the extension at any environment (local, staging,
  production)
- Detecting whether the current tab has a capture adapter, and falling back
  gracefully to "enter this manually" when it doesn't
- Submitting a captured payload to `POST /api/appraisals/manual` (the same,
  unchanged endpoint the manual-entry form uses) and opening the resulting
  Buy Decision Report in a new tab

What's **not** built yet: `adapters/vauto.js` is a placeholder. It doesn't
read real vAuto pages — see the comment at the top of that file for exactly
why, and what's needed to finish it (a DevTools snapshot of a real completed
vAuto appraisal, same as how the AutoTrader comps scraper's selectors were
sourced).

## Load it locally

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select
   this `extension/` folder.
2. Click the FlipLogic Capture icon, open Settings, and point it at your
   backend/frontend (defaults to `localhost`).
3. Log in with a FlipLogic account.

## Adding a new provider

Add `adapters/<provider>.js` registering itself on `window.FlipLogicAdapters`
(see `adapters/vauto.js` for the shape), list its file in
`manifest.json`'s `content_scripts` alongside its `matches` domain, and wire
it into `content-script.js`. Nothing else changes — not the popup, not the
background worker, not the backend.
