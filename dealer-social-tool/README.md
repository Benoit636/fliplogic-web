# Dealer Social

**An AI social media manager for car dealerships, sold as a monthly subscription.**

Each dealership signs up, connects its social pages and inventory, and the AI bot writes, schedules and
publishes posts. It also triages comments, DMs and Google reviews and reports on results. You (the platform
owner) see every customer, your revenue and usage in an admin console. Stripe handles billing.

> This is a standalone product. It is not related to Fliplogic or Algo+ and shares no code with them.

- **Business model, pricing and go-to-market:** [`docs/BUSINESS_PLAN.md`](docs/BUSINESS_PLAN.md)
- **Step-by-step launch checklist (accounts to create, keys to paste):** [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md)

## What's in the product

| For dealerships | For you (the platform owner) |
| --- | --- |
| 🤖 AI assistant that plans, writes, schedules, publishes and reports | 🌐 Marketing site with pricing at `/` |
| ✍️ Content studio: one idea, one post per network | 🧾 Self-serve signup with a 14-day free trial (no card needed) |
| ✅ Approval queue, or full autopilot | 💳 Stripe Checkout, Customer Portal, signed webhooks and proration |
| 📅 Calendar and recurring autopilot rules, on the dealer's own time zone | 📊 `/admin`: MRR, ARR, trials, past-due accounts, usage per dealership |
| 💬 Inbox triage for comments, DMs and Google reviews, with lead detection and suggested replies | 🎁 Comp plans, extend trials, open any dealership for support |
| 🚙 Inventory from CSV or an auto-synced feed. Price-drop, new-arrival and sold automations | 📏 Plan limits and usage metering (AI posts, assistant messages, accounts, seats) |
| 📈 Analytics by network and post type | 🔐 Data isolated per dealership, tokens encrypted, CSRF protection and security headers |
| 👥 Team roles (owner, manager, staff), invites, and multiple rooftops per login | 📨 Transactional email: welcome, invites, password reset, trial ending |
| ⬇️ Data export at any time | 💾 Nightly database backups, Docker and Render deploy files |

### Networks

| Network | One-click connect | Publish | Metrics | Inbox |
| --- | --- | --- | --- | --- |
| Facebook Pages | ✅ Facebook Login | ✅ text and photo | ✅ | ✅ comments (sync and webhooks), replies |
| Instagram Business | ✅ (with Facebook) | ✅ photo | ✅ | ✅ comments, replies |
| Google Business Profile | ✅ Google OAuth | ✅ local posts | — | ✅ **reviews**, replies |
| LinkedIn Company Page | ✅ LinkedIn OAuth | ✅ text | ✅ | — |
| X | ✅ OAuth 2.0 (PKCE) | ✅ text | ✅ | — (reading replies needs a paid X API tier) |
| TikTok | ✅ TikTok Login | ✅ photo carousel or video | — | — |

Every network also has a **simulated** mode. It runs the whole workflow without posting anything, which is useful for demos and trials.
A **Connect** button only turns on once you add that network's app keys to `.env`. See the launch checklist.

### Plans (edit in `src/plans.js`)

| | Starter $149/mo | Pro $299/mo | Elite $499/mo |
| --- | --- | --- | --- |
| Social accounts | 3 | 6 | 20 |
| Team members | 3 | 10 | 50 |
| AI-written posts per month | 150 | 600 | 2,000 |
| AI assistant messages per month | — | 1,500 | 5,000 |
| Autopilot rules | 2 (drafts only) | 15 | 100 |
| Full autopilot and auto-replies | — | ✅ | ✅ |
| Inventory feed auto-sync | — | ✅ | ✅ |

Yearly billing costs 10× the monthly price (two months free). Every signup gets a 14-day trial of Pro.

## Run it locally

Requires **Node.js 22.5 or newer**. It uses the built-in SQLite (`node:sqlite`), so there's no database server to install.

```bash
cd dealer-social-tool
npm install
cp .env.example .env
npm run seed      # demo dealership. Log in with demo@example.com / demo12345
npm start         # http://localhost:3000
```

Add `SUPERADMIN_EMAILS=demo@example.com` to `.env` to see the `/admin` console with the demo login.

The app works without any keys. Posts come from templates, the inbox uses keyword triage, billing shows plans
but can't take payment yet, and emails are printed to the console. Each key you add turns on the real thing:

| Key | Turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude writing, AI inbox triage and the AI assistant |
| `STRIPE_SECRET_KEY` (+ `npm run stripe:setup`) | Paid subscriptions |
| `RESEND_API_KEY` | Real emails |
| `META_*`, `GOOGLE_*`, `LINKEDIN_*`, `X_*`, `TIKTOK_*` | The Connect buttons for each network |

## Deploy

Pick one:

- **Render:** once this folder is its own repository, `render.yaml` is a ready-made Blueprint (Docker, a persistent disk, a health check and a generated `APP_SECRET`).
- **Any VPS:** `docker compose up -d`, with Caddy or Nginx in front for HTTPS.
- **Any Node host:** `npm ci --omit=dev && NODE_ENV=production npm start`, with `DATABASE_PATH` on persistent storage.

In production, `APP_SECRET` is required. It encrypts your customers' social tokens, so never change it after launch.
The worker writes a database backup to `BACKUP_DIR` every night and keeps 14. Copy them off the server as well.

SQLite on one server comfortably handles hundreds of dealerships. The data layer sits in `src/db.js` if you ever need to move to Postgres.

## Architecture

```
src/
  server.js / app.js     HTTP server, sessions, CSRF check, security headers, webhooks, pages
  tenant.js              per-request dealership context (AsyncLocalStorage)
  plans.js               plans, limits and entitlement rules
  db.js                  SQLite schema migrations, helpers, backups
  crypto.js              scrypt passwords, AES-GCM token encryption
  time.js                time-zone math for schedules
  routes/                auth, dealership API, admin API
  ai/                    Claude client, copywriter, inbox triage, the agent with its tools, template fallback
  services/              auth, billing (Stripe), entitlements, dealership, accounts, inventory (+ feed),
                         posts, content, publisher, autopilot, inbox, analytics, admin, oauth, mailer, worker
  platforms/             Meta, Google, LinkedIn, X, TikTok and simulated adapters (+ token refresh)
public/                  landing, auth, app, admin and legal pages (vanilla JS, no build step)
scripts/stripe-setup.js  creates Stripe products, prices, the portal and the webhook in one go
test/                    node:test suite, with fake Claude and Stripe
```

Post lifecycle: `draft → pending_approval → approved/scheduled → publishing → published` (or `failed` / `rejected`).

## Tests

```bash
npm test
```

The tests cover data isolation between dealerships, authentication, invites, password reset, plan limits, trial
expiry, Stripe webhook syncing and idempotency, token encryption, roles over HTTP, CSRF, the AI agent loop
(against a fake Claude API), scheduling across daylight-saving changes, CSV import and publishing.
