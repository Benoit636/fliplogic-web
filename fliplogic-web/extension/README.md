# FlipLogic Capture (browser extension)

Tier 1 of the [integration architecture](../CLAUDE.md): reads a completed
appraisal straight off a provider's own page and sends it into FlipLogic —
no retyping.

## Status: v1.0 — fully verified end-to-end against live vAuto sessions

Every field `adapters/vauto.js` reads has been confirmed against multiple
real, live vAuto appraisals — not just synthetic markup:

- Login (stores a FlipLogic auth token locally, never the dealer's vAuto
  credentials) and the API calls behind it — the backend's CORS policy
  explicitly allows `chrome-extension://` origins for this
- Settings panel to point the extension at any environment (defaults to
  production)
- Detecting whether the current tab has a capture adapter, and falling back
  gracefully to "enter this manually" when it doesn't
- `adapters/vauto.js` reads VIN, year, make/model/trim, mileage, condition
  (confirmed with a real Black Book checkbox selected), vAuto's appraised
  value, reconditioning cost, and the retail range + comparable count
  (from the Competitive Set table) straight off a completed vAuto
  appraisal page. vAuto nests essentially its entire UI in open shadow
  roots — including elements with stable, predictable ids — so every
  lookup goes through a `deepQuerySelector` helper that walks into shadow
  roots instead of plain `document.querySelector`.
- VIN/year/mileage fallbacks (`findVinFromForm`/`findYearFromForm`/
  `findMileageFromForm`) for appraisals where the vehicle isn't marked in
  its own Competitive Set — confirmed against real appraisals that hit
  this case.
- Submitting a captured payload to `POST /api/appraisals/manual` (the same,
  unchanged endpoint the manual-entry form uses) and opening the resulting
  Buy Decision Report in a new tab — confirmed producing correct, internally
  consistent Buy Decision Reports (verdict, max buy price, profit,
  confidence) across multiple real vehicles.

**Known limitation**: appraisals already booked into inventory ("in
stock") render a different page layout without the Competitive Set
tooling this adapter depends on — not supported, and out of scope, since
the buy decision for that vehicle has already been made.

## Load it locally

1. `chrome://extensions` → enable Developer Mode → **Load unpacked** → select
   this `extension/` folder.
2. Click the FlipLogic Capture icon, open Settings, and point it at your
   backend/frontend (defaults to production; override for local dev).
3. Log in with a FlipLogic account.

## Adding a new provider

Add `adapters/<provider>.js` registering itself on `window.FlipLogicAdapters`
(see `adapters/vauto.js` for the shape), list its file in
`manifest.json`'s `content_scripts` alongside its `matches` domain, and wire
it into `content-script.js`. Nothing else changes — not the popup, not the
background worker, not the backend.
