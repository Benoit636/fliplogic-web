# Launch checklist

The software is built. These steps need **your** identity, accounts, payment details or signatures, so no one
else can do them for you. Rough time for each step is in brackets.

## 0. Before anything else (1–2 days)

- [ ] **Check your employment agreement.** You work at a dealership. Confirm that building and selling software
      on your own time doesn't conflict with it (IP, moonlighting or non-compete clauses). Get written OK from your GM
      if you want to pilot at your own store.
- [ ] **Incorporate.** A provincial or federal corporation keeps the business liability separate from you.
- [ ] **Get a business bank account**, then register for **GST/HST** once revenue approaches C$30,000 per year (or right away, so you can reclaim tax on expenses).
- [ ] **Pick a name and domain.** "Dealer Social" is a working name, so check trademarks (CIPO / USPTO) before
      you spend on branding. Then set `PRODUCT_NAME`, the logo text in `public/*.html`, and your domain.

## 1. Hosting (1 hour)

- [ ] Move `dealer-social-tool/` into its own GitHub repository. Customers' code shouldn't live inside another project.
- [ ] Create a [Render](https://render.com) account → **New → Blueprint** → pick the repo (it reads `render.yaml`).
      Other options: any VPS with `docker compose up -d`.
- [ ] Point `app.yourdomain.com` at it and set `APP_URL=https://app.yourdomain.com`.
- [ ] Set `SUPERADMIN_EMAILS` to your email and `SUPPORT_EMAIL` to your support inbox.
- [ ] Sign up on your own site. You'll see **Admin** in the sidebar.

## 2. AI (15 minutes)

- [ ] Create an account at [console.anthropic.com](https://console.anthropic.com), add billing, and create an API key → `ANTHROPIC_API_KEY`.
- [ ] Set a monthly spend limit in the console as a safety net. Plan limits already cap usage per dealership.

## 3. Payments (1 hour)

- [ ] Create a [Stripe](https://stripe.com) account and complete business verification.
- [ ] In **test mode**: `STRIPE_SECRET_KEY=sk_test_… APP_URL=https://app.yourdomain.com npm run stripe:setup`,
      then paste the printed `STRIPE_PRICE_*` and `STRIPE_WEBHOOK_SECRET` lines into your environment.
- [ ] Do a test purchase with card `4242 4242 4242 4242`. Check that the Billing page shows **Active**, and that `/admin` shows MRR.
- [ ] Repeat with your **live** key when you're ready to charge. Optional: turn on Stripe Tax and set `STRIPE_AUTOMATIC_TAX=1`.
- [ ] Want to charge in CAD? Set `STRIPE_CURRENCY=cad` before running the setup script, and update the prices shown in `src/plans.js`.

## 4. Email (20 minutes)

- [ ] Create a [Resend](https://resend.com) account, verify your domain (DNS records), create an API key → `RESEND_API_KEY`.
- [ ] Set `EMAIL_FROM="Dealer Social <no-reply@yourdomain.com>"`.

## 5. Social network apps (the part that takes longest, so start early)

Every network needs a developer app. The redirect URL for each is `https://app.yourdomain.com/oauth/<name>/callback`.

| Network | Where | What to request | Review time (varies) |
| --- | --- | --- | --- |
| Facebook + Instagram (`meta`) | developers.facebook.com → Business app | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `business_management`. Complete **Business Verification** and **App Review** (screencast of the Connect → publish flow). Add the webhook `https://app.yourdomain.com/webhooks/meta` with `META_VERIFY_TOKEN`. | days to weeks |
| Google Business Profile (`google`) | console.cloud.google.com | Request **Business Profile API** access (a form), enable the Account Management, Business Information and My Business APIs, and create an OAuth client. The `business.manage` scope needs OAuth verification. | days to weeks |
| LinkedIn (`linkedin`) | linkedin.com/developers | Apply for the **Community Management API** (organization posting). | weeks |
| X (`x`) | developer.x.com | A paid API tier is needed for posting at volume. Turn on OAuth 2.0 with scopes `tweet.read tweet.write users.read offline.access`. | same day |
| TikTok (`tiktok`) | developers.tiktok.com | **Content Posting API**, direct post. Verify your media domain. An audit is required before posts can be public. | weeks |

Until an app is approved, only you and your app's test users can connect. That's enough for a pilot dealership.
While you wait, **start with Facebook + Instagram + Google**. They're where dealership customers are.

Tip: the photo URLs you post must be publicly reachable. TikTok also needs them on a domain you've verified with TikTok.

## 6. Legal pages (lawyer, ~C$500–1,500)

- [ ] Fill every `[BRACKETED]` value in `public/legal.html` and have a lawyer review the privacy policy and terms
      (PIPEDA, Quebec Law 25 if you sell there, CASL for marketing emails; state privacy laws for US dealers).
- [ ] Get **tech errors & omissions + cyber insurance** before your first paying customer.

## 7. Go live

- [ ] Run the pilot at one dealership for 30 days in Assist mode. Track posts published, reach, leads flagged and hours saved.
- [ ] Turn those numbers into a one-page case study and add the testimonial to the landing page.
- [ ] Follow the sales plan in `BUSINESS_PLAN.md`.

## Ongoing operations

- Check `/admin` weekly for trials ending, past-due accounts and dealers with 0 posts (churn risk).
- Backups run nightly to `BACKUP_DIR`. Copy them off the server (for example with rclone to S3 or Backblaze) at least weekly.
- Update dependencies monthly: `npm outdated`, then `npm update && npm test`.
- LinkedIn API versions expire after about a year. Bump `LINKEDIN_VERSION` (format YYYYMM) when LinkedIn announces a sunset.
