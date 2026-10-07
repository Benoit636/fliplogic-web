# Put Dealer Social online (Render)

This takes about 30 minutes, and you only do it once. When you're done, the app runs at a web address you can open
from any phone or computer, and you can sign up your dealership.

What it costs:
- **Render:** the *Starter* web service plus a 5 GB disk, roughly US$8–10/month. Check render.com/pricing for current prices.
- **Claude API:** pay as you go, typically a few cents per post.

## 1. Give the app its own GitHub repository (2 minutes)

Render deploys a whole repository, so Dealer Social needs its own (separate from fliplogic-web).

1. Go to **github.com/new**.
2. Fill in:
   - Owner: **Benoit636**
   - Repository name: **dealer-social-tool**
   - Visibility: **Private**
3. Leave every *Initialize this repository* box **unchecked** (no README, no .gitignore, no license).
4. Click **Create repository**.

Then ask Claude to push the code into it. Claude copies the `dealer-social-tool/` folder, with its history, so it
sits at the root of the new repo.

<details><summary>Doing it yourself instead</summary>

From a clone of fliplogic-web, on the branch that holds the tool:

```bash
git subtree split --prefix=dealer-social-tool -b dealer-social-standalone
git push https://github.com/Benoit636/dealer-social-tool.git dealer-social-standalone:main
```
</details>

## 2. Get your Claude API key (5 minutes)

1. Go to **console.anthropic.com** and sign up or log in.
2. Open **Settings → Billing** and add a payment method with some credit (US$20 lasts a long time).
3. Open **Settings → Limits** and set a monthly spend limit, for example US$50, as a safety net.
4. Open **API Keys → Create Key** and name it `dealer-social`.
5. Copy the key, which starts with `sk-ant-`. It's only shown once, so keep it somewhere safe.

Without a key the app still works, but posts are written from templates instead of by the AI.

## 3. Deploy on Render (10 minutes)

1. Go to **render.com** and click **Get Started**. Sign up with **GitHub**; that's the easiest way.
2. When Render asks for repository access, allow it to see **Benoit636/dealer-social-tool**.
3. In the Render dashboard, click **New → Blueprint** and pick **dealer-social-tool**.
4. Render reads `render.yaml` and shows one service called **dealer-social**, with a 5 GB disk. It asks for these values:

   | Setting | What to type |
   | --- | --- |
   | `APP_URL` | Leave empty for now. You'll fill it in at step 4. |
   | `SUPERADMIN_EMAILS` | `benoitboudreau@vwmoncton.com` |
   | `SUPPORT_EMAIL` | The email customers should write to (yours, for now) |
   | `ANTHROPIC_API_KEY` | The `sk-ant-…` key from part 2 |
   | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Leave empty. Billing comes later. |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Leave empty. Emails print to the Render log until then. |

   `APP_SECRET` is generated automatically. **Never change or delete it.** It encrypts the dealerships' social
   media logins, and changing it would disconnect every account.
5. Click **Apply** (or **Deploy Blueprint**). The first build takes 3–5 minutes. Wait until the service shows **Live**.

## 4. Tell the app its own address (2 minutes)

1. Open the **dealer-social** service. Its address is at the top, something like `https://dealer-social-xxxx.onrender.com`.
2. Go to **Environment → APP_URL**, paste that address (with `https://` and no trailing `/`), and click **Save changes**.
   The service restarts in about a minute.

The app uses this address in emails, invite links and when connecting Facebook.

*Optional, later:* use your own address, such as `app.yourdomain.com`. In the service, go to **Settings → Custom Domains**,
add the domain, create the DNS record Render shows you, and then change `APP_URL` to the new address.

## 5. Check that it works (5 minutes)

1. Open `https://<your address>/healthz`. It should show `{"ok":true}`.
2. Open `https://<your address>/signup` and create the dealership:
   - Dealership name: **Volkswagen Moncton**
   - Your name, `benoitboudreau@vwmoncton.com`, and a password
3. You land in the app on a 14-day Pro trial. Because your email is in `SUPERADMIN_EMAILS`, you also see **Admin**.
4. Make a test post: **Create Post → Used vehicles → Fresh Arrival**, type a make and model, and tap
   **Write my post**. If the API key is missing or wrong, a yellow *“AI writing is off”* notice shows at the
   bottom of the menu (only admins see it) and posts come from templates.

Next: fill in **Accounts & Settings → Dealership profile**, then connect Facebook (see `LAUNCH_CHECKLIST.md`, section 5).

## Updating the app later

Render redeploys automatically every time new code is pushed to the `main` branch of **dealer-social-tool**. Your
data lives on the disk at `/data` and survives every redeploy.

## If something goes wrong

- **The deploy fails:** open the service, go to **Logs**, and copy the red lines to Claude.
- **"APP_SECRET must be set in production":** the generated value was removed. Restore it if you saved it.
  Otherwise add a new long random value, and reconnect the social accounts.
- **Backups:** a copy of the database is saved every night to `/data/backups` (the last 14 are kept). They sit on
  the same disk, so download one now and then. Render's disk snapshots are a second safety net.
