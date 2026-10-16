# Pilot runbook: Dealer #001 (Volkswagen Moncton)

Everything needed to run the pilot: what's in it, putting it online, the first administrator, staff, inventory,
the daily posting routine, the iPhone/desktop check, and data and backups.
Nobody shares a password: every person opens their own single-use link and chooses their own.

## 0. What the pilot includes

| On | Off during the pilot (`PILOT_MODE=1`) |
| --- | --- |
| Dealership profile, logo and branding | Instagram, LinkedIn and other connections |
| Dealer Admin and Dealer Staff logins | Inbox (comments, messages, reviews: customers' personal information) and CRM lead forwarding |
| Inventory: hourly feed sync or CSV import, website check, vehicle → post | AI chat assistant, autopilot rules |
| Posts with branded PNG images, English / French / both | Billing and trials (pilot dealerships are complimentary) |
| Manager approval, then a ready-to-post kit, or publishing to one Facebook Page once the platform owner unlocks it | Analytics |

Facebook: see [`INVENTORY_AND_FACEBOOK.md`](INVENTORY_AND_FACEBOOK.md). A connected Page stays locked until the platform
owner unlocks it (a test Page first; the live Page only with the dealership's explicit approval).

The "off" features are switched off on the **server**, not just hidden. No customer personal information is collected:
inventory imports keep only vehicle columns, and the only thing read from Facebook is the dealership's own published post, to check it.

## Roles

| Role | Can do |
| --- | --- |
| **Dealer Admin** | Everything for their dealership: profile, logo and branding, team (invite, change role, remove), inventory, approving posts, settings. |
| **Dealer Staff** | Create posts (from inventory or by hand) and send them for approval; post approved posts by hand. Can read the profile and inventory; can't approve, or change settings, inventory or the team. |

The platform owner (emails listed in `SUPERADMIN_EMAILS`) also gets the **Admin** console at `/admin` to add more dealerships.

## 1. Put it online (platform owner, once)

Follow [`DEPLOY.md`](DEPLOY.md) (Render, about 30 minutes). `render.yaml` already sets `PILOT_MODE=1` and keeps the
database, photos and backups on a persistent disk at `/data`. Set these in Render → **Environment**:

| Setting | Value |
| --- | --- |
| `APP_URL` | The public `https://` address of the app |
| `SUPERADMIN_EMAILS` | Your email |
| `PILOT_MODE` | `1` (already set by `render.yaml`) |
| `SESSION_IDLE_HOURS` | Optional. Default 336 (14 days); `12` if staff share showroom computers |
| `ANTHROPIC_API_KEY` | Optional. Without it, captions come from the built-in English/French templates |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional. Without them, invite links are shown on screen to copy, and password resets aren't emailed |

Leave `ALLOW_SIGNUP` unset (nobody can create a dealership by themselves).

Then open Render → your service → **Shell** and run:

```bash
npm run check
```

It must print no ✖ lines. The server runs the same check every time it starts and refuses to start in production
with a real problem (for example a missing or short `APP_SECRET`, or a folder it can't write).

## 2. Create the dealership and its first Dealer Admin

In the same Shell (Docker: `docker compose exec app sh`; locally: in `dealer-social-tool/`):

```bash
npm run create-dealer -- --preset vw-moncton --admin-email you@vwmoncton.com
```

This creates **Volkswagen Moncton as Dealer #001** (Moncton, NB; America/Moncton time zone; km; captions in English +
French; VW blue as the brand colour; complimentary during the pilot) and prints a **setup link** for the Dealer Admin:

```
✔ Created Dealer #001: Volkswagen Moncton
Setup link for you@vwmoncton.com (Dealer Admin, single use, expires in 3 days):
  https://your-app-address/invite?token=…
```

- The link works **once** and expires in **3 days**. Only a hash of it is stored.
- No user or password exists until the admin opens the link.

Lost or expired link? Make a new one (the old one stops working):

```bash
npm run create-dealer -- --invite-admin --number 001 --admin-email you@vwmoncton.com
```

Other dealerships later: `npm run create-dealer -- --name "Smith Motors" --admin-email gm@smith.ca` (gets the next number, 002),
or use **Add a dealership** in the `/admin` console.

## 3. The Dealer Admin finishes the profile

1. Open the setup link, enter your name, and choose a password (10+ characters, not containing your email name).
2. Go to **Accounts & Settings → Dealership profile** and fill in:
   - street address, postal code, phone, website (full address, starting with `https://`);
   - **Logo**: upload a PNG (transparent background is best), JPG or WebP. SVG isn't accepted;
   - main and accent brand colours;
   - the English and French call to action and legal line (the legal line is added whenever a price is shown).
3. Click **Save profile**. The logo appears at the top of the menu and on every post image.

## 4. Invite staff

1. **More tools → Team → Invite someone**: their work email, role **Dealer Staff** (or **Dealer Admin** for another manager).
2. If email is set up, they get an email. If not, copy the link shown and send it to that person only (text or email).
3. They open the link, enter their name and choose their own password. The link works once and expires in 7 days.
4. To remove someone, click **Remove** on the Team page. They lose access immediately.

Give each new person [`STAFF_QUICK_START.md`](STAFF_QUICK_START.md) (one page).

Forgot password: **Forgot your password?** on the login page emails a reset link (needs `RESEND_API_KEY`).
Without email set up, a Dealer Admin removes the person and invites them again.

## 5. Load the inventory (Dealer Admin)

Best: an automatic feed from the website provider, synced every hour. See
[`INVENTORY_AND_FACEBOOK.md`](INVENTORY_AND_FACEBOOK.md) (includes the email to send D2C Media). Until then, use CSV:


1. Export the vehicle inventory from your DMS or website provider as **CSV** (in Excel: *File → Save As → CSV*).
   English and French column names both work, and so do Excel's semicolon-separated files.
2. **Inventory → Import CSV**, choose the file. You see a **preview** first (new / updated / no change / skipped,
   and why) and nothing is saved until you click **Import**.
3. Run the same import again whenever the inventory changes (daily is ideal). Vehicles are matched by **VIN**, then
   **stock #**, so they are updated, never duplicated. Tick *Mark vehicles that aren't in this file as sold* to retire
   vehicles that have left the lot (it only runs when the file has at least 3 vehicles).
4. Columns read: stock #, VIN, year, make, model, trim, mileage/odometer, price, new/used, colour, features, photos
   (links separated by `|`, spaces or commas). **Every other column is ignored and never saved**, so a DMS export that
   includes customer or salesperson names is safe to use. An example file is on the import screen.
5. Add or fix a vehicle by hand with **+ Add vehicle** / **Edit**, including photos taken on the phone.

## 6. The daily routine: create, approve, post

Nothing is posted until a **Dealer Admin approves it**. Until a Facebook Page is connected and unlocked, approved
posts are posted by hand with a ready-to-post kit.

**Dealer Staff (about 1–2 minutes, on a phone):**
1. **Create Post** → type the stock # in *Or start from a vehicle in stock* → tap the vehicle → pick the goal
   (Fresh Arrival, Price Drop…). Add or change a photo if you like.
2. **Create my post.** You get a branded **post image** (logo, photo, price, phone and website) and captions
   for Facebook, Instagram and LinkedIn. Choose the language (**English**, **Français** or **EN + FR**), the image
   style (**Showcase**, **Bold**, **Clean**) and size (**Square**, **Portrait**, **Story**). Edit the text if needed.
3. **Send for approval.**

**Dealer Admin:**
1. **Approvals** shows each post with its image. **Approve** (your name and the time are recorded) or **Reject** with a reason.
2. **My Posts → Ready to post → Ready to post…**: **Copy caption**, **Save image**, **Open Facebook/Instagram/LinkedIn**,
   paste and post, then tap **I posted it**. Staff can do this step too once the post is approved.
3. A Dealer Admin creating their own post clicks **Approve & post it** and goes straight to the kit.

**Download PNG** on the review screen saves the image at full size (1080×1080, 1080×1350 or 1080×1920).

## 7. iPhone and desktop check (first week)

Automated checks pass on desktop Chrome and on iPhone, iPad and Android screen sizes. Real devices still need a
5-minute check, because iPhone Safari handles photos and downloads its own way. Do this once on a real iPhone and once on a computer:

| # | Do this | Expected |
| --- | --- | --- |
| 1 | iPhone Safari: open the app address, log in, tap **Share → Add to Home Screen** | A "DS" icon on the home screen that opens the app |
| 2 | **Create Post → Used → Fresh Arrival**, type make and model, **Add photos → Take Photo** | The photo appears in the grid within a few seconds |
| 3 | **Add photos → Photo Library**, pick 2 photos | Both appear; the first is the cover |
| 4 | **Create my post** | The post image appears within 1–2 seconds |
| 5 | Switch **Français**, then **Bold**, **Portrait** | Captions become French; the image redraws |
| 6 | **Download PNG** | iPhone: the share sheet opens → **Save Image** → the image is in Photos at full quality |
| 7 | **Send for approval** (staff) / **Approve & post it** (admin) | "Sent for approval" / the ready-to-post kit |
| 8 | In the kit: **Copy caption**, then paste in Notes | The full caption, hashtags included |
| 9 | In the kit: **Save image** | Same as step 6 |
| 10 | Computer (Chrome, Edge or Safari): repeat 2, 4, 6, 7 | Photos upload from files; **Download PNG** saves a .png to Downloads |

If a photo is refused as "HEIC": pick it again from the Photos picker (it converts to JPG), or set
**Settings → Camera → Formats → Most Compatible** on that iPhone.

## 8. Data, backups and support

- Everything (database, photos, post images, nightly backups) lives on the `/data` disk and survives redeploys.
- A backup of the database is written every night to `/data/backups` (the last 14 are kept). Download one now and then:
  they're on the same disk.
- **Accounts & Settings → Your data → Export everything** downloads the dealership's data as JSON (Dealer Admin).
- Every sign-in, approval, rejection, import and post is recorded in the dealership's activity log.

## Security notes

- Self-serve signup is **off** in production (`ALLOW_SIGNUP` unset), so nobody can create a dealership without you.
- Passwords are hashed with scrypt. Sessions are random tokens in an HttpOnly, Secure, SameSite cookie; only their hash is stored.
- Sessions end after 14 days without activity (`SESSION_IDLE_HOURS`) and always after 30 days.
- Changing your password signs you out on your other devices. Removing a member ends their access right away.
- Repeated wrong passwords are slowed down (10 tries per email per 15 minutes).
- Photo uploads are checked by their content (JPG, PNG or WebP only), and photos copied from websites are fetched
  only from public addresses.
- `npm run seed` (fake demo data) refuses to run when `NODE_ENV=production`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The server won't start | Render → **Logs**: the ✖ lines say what to fix (usually `APP_SECRET`). |
| Setup or invite link "invalid or expired" | Links work once and expire (admin 3 days, staff 7 days). Make a new one. |
| Links point to `localhost` | Set `APP_URL` to the public `https://` address, then make a new link. |
| "Couldn't use that photo" | The photo's website refused the download. Save the photo and add it with **Add photos**. |
| A CSV row is skipped | The preview shows why (bad VIN, missing make/model, duplicate in the file…). Fix the row or the vehicle. |
