# FlipLogic Capture (browser extension)

Tier 1 of the [integration architecture](../CLAUDE.md): reads a completed
appraisal straight off a provider's own page and sends it into FlipLogic —
no retyping.

## Status: v0.3 — logs in and reads real fields against a live vAuto session

What works today, confirmed against a real logged-in vAuto session (not
just synthetic markup):

- Login (stores a FlipLogic auth token locally, never the dealer's vAuto
  credentials) and the API calls behind it — the backend's CORS policy
  explicitly allows `chrome-extension://` origins for this
- Settings panel to point the extension at any environment (defaults to
  production)
- Detecting whether the current tab has a capture adapter, and falling back
  gracefully to "enter this manually" when it doesn't
- `adapters/vauto.js` reads VIN, year, make/model/trim, mileage, condition,
  vAuto's appraised value, reconditioning cost, and the retail range +
  comparable count (from the Competitive Set table) straight off a
  completed vAuto appraisal page. vAuto nests essentially its entire UI in
  open shadow roots — including elements with stable, predictable ids — so
  every lookup goes through a `deepQuerySelector` helper that walks into
  shadow roots instead of plain `document.querySelector`.
- Submitting a captured payload to `POST /api/appraisals/manual` (the same,
  unchanged endpoint the manual-entry form uses) and opening the resulting
  Buy Decision Report in a new tab. Payload field names are confirmed to
  match that endpoint's validation schema exactly.

Not yet confirmed: a full successful submit-and-view-the-report run against
a real appraisal (extraction was fixed and pushed but the next live capture
attempt hasn't been reported back yet) — treat the next capture as a dry
run and check the result against the appraisal by hand.

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
