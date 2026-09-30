# Dealer Social Tool

An AI-run social media manager for car dealerships. The bot writes posts from your real inventory,
plans the calendar, publishes to your social accounts, triages comments/DMs/reviews, and reports on
what's working. You choose how much it does on its own.

> This is a standalone project. It is not related to Fliplogic or Algo+ and shares no code with them.

## What it does

| Area | Features |
| --- | --- |
| 🤖 **AI Assistant** | Chat with the bot ("plan next week", "post our newest arrival", "answer the inbox", "how did we do this month?"). It uses tools to act on inventory, posts, the calendar, the inbox, analytics and autopilot rules. |
| ✍️ **Content Studio** | Pick a post type, vehicle and platforms. The bot writes a version tailored to each network (length, tone, hashtags, photo idea). You can edit, rewrite with AI, approve or schedule it. |
| ✅ **Approvals** | Everything the bot writes waits for your OK in **Assist** mode. You can approve one post or a whole batch, or reject with a reason. |
| 📅 **Calendar & queue** | A month view of scheduled, pending, published and failed posts. A background worker publishes each post when it's due. |
| ⚙️ **Autopilot** | Recurring rules, for example "vehicle spotlight Mon–Sat 10:15 on Facebook + Instagram". The bot picks the right vehicle each time: the one featured least recently, the newest arrival, a price drop, or a sold car to celebrate. **Full autopilot** mode lets it publish and reply without asking. |
| 💬 **Inbox** | Comments, DMs and reviews are triaged: sentiment, intent (lead, question, complaint, praise, spam), priority, and a suggested reply. In autopilot mode the bot answers simple messages. It escalates leads and complaints to a person and dismisses spam. |
| 🚙 **Inventory** | Add vehicles by hand or import a CSV from your DMS (it recognises common column names). When you lower a price it's tracked as a price drop. Marking a car sold queues a celebration post. |
| 📈 **Analytics** | Reach, engagement, clicks and leads, with breakdowns by platform and post type, daily reach, and your top posts. |
| 🏢 **Settings** | Dealership profile and brand voice, the compliance line, default hashtags, post language, km or miles, and your social accounts. |

### Platforms

| Platform | Simulated | Live publishing |
| --- | --- | --- |
| Facebook Page | ✅ | ✅ Graph API (text or photo posts, comment replies, metrics, comment sync, webhooks) |
| Instagram Business | ✅ | ✅ Graph API (image posts, comment replies, metrics, comment sync, webhooks) |
| TikTok, X, LinkedIn, Google Business Profile | ✅ | Not built yet. The adapter interface is in `src/platforms/`. |

**Simulated** accounts run the whole workflow without posting anything real, and they generate realistic
engagement numbers. Use them for demos, training, or to try the bot before you connect real pages.

## Quick start

Requirements: **Node.js 22.5 or newer** (it uses the built-in `node:sqlite`, so there's no database server to install).

```bash
cd dealer-social-tool
npm install
cp .env.example .env        # add your ANTHROPIC_API_KEY to switch on the AI bot
npm run seed                # optional: demo dealership, inventory, accounts and rules
npm start                   # http://localhost:3000
```

Without an `ANTHROPIC_API_KEY`, everything still works. Posts are written from built-in templates, the
inbox uses keyword triage, and only the chat assistant is switched off.

## Configuration (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | — | When set, the dashboard and API require HTTP Basic auth (any username) |
| `DATABASE_PATH` | `./data/dealer-social.db` | SQLite file |
| `ANTHROPIC_API_KEY` | — | Turns on the Claude-powered bot |
| `AI_MODEL` | `claude-opus-5-5` | Claude model used for writing, triage and the assistant |
| `AI_FALLBACKS` | on | Server-side refusal fallback (`fallbacks: "default"`); set `off` to disable |
| `SCHEDULER_INTERVAL_SECONDS` | `30` | How often the worker publishes due posts and runs autopilot rules |
| `META_VERIFY_TOKEN` / `META_APP_SECRET` | — | For the Meta webhook at `/webhooks/meta` (real-time comments; payload signatures are verified) |

Autopilot times use the server's local time zone, so set `TZ`, for example `TZ=America/Moncton`.

## Connecting Facebook & Instagram (live)

1. Create a Meta app with the Pages and Instagram Graph API permissions
   (`pages_manage_posts`, `pages_read_engagement`, `pages_manage_engagement`, `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_comments`).
2. Get a long-lived **Page access token**.
3. In **Settings → Social accounts**, add an account in **Live** mode:
   - Facebook: the Page ID and the Page token.
   - Instagram: the Instagram business account ID and the same Page token.
4. Optional: point a Meta webhook at `https://your-host/webhooks/meta` (fields `feed` and `comments`) with your
   `META_VERIFY_TOKEN`, so comments show up in the inbox in real time. Otherwise the worker syncs them every
   few minutes.

## How the bot stays safe

- **Assist mode** (the default): nothing is published or replied to until a person approves it.
  If the bot edits an approved post, the post goes back for review.
- **Autopilot mode**: the bot publishes on schedule and answers praise and simple questions. It always
  escalates leads, complaints and urgent messages to a person.
- Vehicle posts are built only from inventory data. The bot is told never to invent prices, payments,
  incentives or features. Your compliance line is added whenever a price appears.
- Every action by a person, the bot, autopilot or the scheduler is written to the activity log, which you can see on the dashboard.

## Architecture

```
src/
  server.js            entry point (HTTP server + background worker)
  app.js               Express app, Basic auth, Meta webhooks, error handling
  routes/api.js        REST API used by the dashboard
  db.js                SQLite schema & helpers (node:sqlite)
  ai/
    client.js          Anthropic SDK client, shared request settings, refusal handling
    generator.js       platform-tailored copywriting (structured outputs)
    inbox.js           comment/DM/review triage + suggested replies
    agent.js           the chat bot: manual tool-use loop, append-only history
    tools.js           tools the bot can call (zod-validated)
    fallback.js        template writer used when no API key is set
  services/            dealership, accounts, inventory, posts, content, publisher,
                       autopilot, inbox, analytics, worker
  platforms/           simulated + Meta (Facebook/Instagram) adapters
public/                dashboard (vanilla JS, no build step)
test/                  node:test suite, including a fake Claude API server
```

Post lifecycle: `draft → pending_approval → approved/scheduled → publishing → published`
(or `failed` / `rejected`).

## Tests

```bash
npm test
```

The suite uses in-memory databases and a local fake Messages API, so it never calls Claude or any social network.
