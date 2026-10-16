# Inventory feed, website check and Facebook publishing

The setup for Volkswagen Moncton (Dealer #001), and the same steps for every dealership after it.

| Step | Who | Status for VW Moncton |
| --- | --- | --- |
| 1. Get an authorized inventory feed | Dealership asks its website provider (D2C Media) | Waiting for the feed address |
| 2. Save the feed and run the first sync | Dealer Admin | After step 1 |
| 3. Check 10 vehicles against the website | Dealer Admin | After step 2 |
| 4. Create the Meta app | Platform owner | To do |
| 5. Connect and unlock a **test** Facebook Page, then publish a test post | Platform owner + Dealer Admin | After step 4 |
| 6. Unlock the live VW Moncton Page | Platform owner, **only with the dealership's explicit approval** | Not before steps 1–5 pass |

## 1. Get an authorized inventory feed

Social Dealer reads inventory **only** from a feed the dealership is authorized to share. It does not scrape the
website to import vehicles.

vwmoncton.com runs on **D2C Media**. D2C Media already produces inventory feeds for its dealers, for example the
**Facebook automotive inventory (vehicle catalog) feed**, which carries every field we need. Email this to the
dealership's D2C Media account manager (from a dealership address):

> **Subject:** Inventory feed for Volkswagen Moncton – Social Dealer
>
> Hello,
>
> Volkswagen Moncton uses Social Dealer to create its social media posts. Please give us a feed URL for our
> new, used and demonstrator inventory. Either of these works:
>
> - the Facebook / Meta automotive inventory (vehicle catalog) feed you already produce for dealers, or
> - an XML or CSV export.
>
> For each vehicle it needs: stock number, VIN, year, make, model, trim, mileage (km), selling price, new / used /
> demo, availability, photo URLs, and the vehicle detail page URL on vwmoncton.com.
>
> A private URL (with a key, or a username and password) is fine. It will be read about once an hour.
>
> Thank you,

**Formats read automatically:** the Meta automotive catalog feed (XML or CSV), and XML/CSV exports with English or
French column names. Demonstrators (`DEMO`) are imported as new vehicles marked **Demo**. Only vehicle fields are
saved; every other column is ignored.

## 2. Save the feed and run the first sync

1. **Accounts & Settings → Inventory feed address**: paste the URL and click **Save profile**.
   - It is stored **encrypted** on the server and never shown in full again (only `https://host/…`).
   - A username and password can go in the URL (`https://user:password@host/feed.xml`).
   - **Check the feed every** is 60 minutes by default (15–1440).
2. **Inventory → Inventory feed → Sync now.** The panel shows how many vehicles were added, updated and removed.
3. After that the feed is read automatically on schedule. If it fails, the next tries slow down (up to 8× the interval)
   and the error is shown in the panel.

**Sold or removed vehicles:** a vehicle that disappears from the feed, or that the feed marks sold / out of stock,
is marked **sold** and shows **Removed from feed**. Its unapproved posts are withdrawn, and posts can't be created,
approved or published for it. If it comes back, it is restored. Vehicles added by hand are never removed by the feed.
As a safety net, a feed with fewer than 3 vehicles, or one that is missing more than half the stock, removes nothing
and shows a warning instead.

## 3. Check 10 vehicles against the website

**Inventory → ✓ Check 10 vehicles against the website** (Dealer Admin), or on the server:

```bash
npm run validate-inventory -- --number 001 --limit 10
```

For each vehicle it opens the vehicle's page **on the dealership's own website** (the address saved in the profile),
and compares **VIN, stock #, trim, price, km, photos and availability**. The result is a pass/fail report, kept in
Social Dealer. It reads one page every 10 seconds (or slower if the website's `robots.txt` asks), follows
`robots.txt`, and identifies itself as `SocialDealerBot`. A vehicle whose page is gone (404) fails on availability.

What each result means:
- **✓ pass**: the same value on both.
- **✗ fail**: different values: fix the feed or the website before posting that vehicle.
- **… missing**: the value is on the website but not in Social Dealer (or the other way).
- **– not shown**: the website page doesn't show this value, so it can't be compared.

## 4. Create the Meta app (platform owner, once)

1. Go to **developers.facebook.com → My Apps → Create app**, type **Business**, name it *Social Dealer*.
2. Add the **Facebook Login for Business** product.
   Valid OAuth redirect URI: `https://<your app address>/oauth/meta/callback`.
3. During the pilot the app only asks for `pages_show_list`, `pages_read_engagement` and `pages_manage_posts`.
   Instagram and Messenger are not requested.
4. **App settings → Basic**: copy the **App ID** and **App secret** into the server's environment
   (`META_APP_ID`, `META_APP_SECRET`; on Render: *Environment*). Never put them in the website or in a file in Git.
5. While the app is in *Development* mode only people with a role on the app (add yourself and the Dealer Admin
   under **App roles**) can connect Pages. That is enough for the pilot. *App Review* is needed later for other
   dealerships.

## 5. Test Facebook Page first

1. In Facebook, create a Page that nobody follows, for example **Social Dealer Test Page**.
2. In Social Dealer (Dealer Admin): **Accounts & Settings → Facebook Page → Connect Facebook Page**, and choose the
   test Page. It shows **🔒 Locked — waiting for the platform owner**: nothing can be published to it yet.
3. Platform owner: **Admin → Facebook Pages → Unlock as test Page**, and type the Page name to confirm.
4. Make a post from a real vehicle: **Create Post → stock # → goal → Create my post → Approve & publish now**
   (Preview → Approve → Publish). The image is uploaded to the Page with the caption and the vehicle's website link.
5. After publishing, Social Dealer reads the post back from Facebook and checks it: **photo**, **caption**,
   **price** and **inventory link**. The result is shown on the done screen ("Facebook shows: ✓ photo · ✓ text · ✓ price · ✓ vehicle link").
   Open the post on the Page and compare it with the vehicle on vwmoncton.com.

## 6. The live VW Moncton Page

Only after the steps above have passed, and **only with the dealership's explicit approval**:
**Admin → Facebook Pages → Unlock live Page…**, type the Page name, and confirm the approval.
Every post still needs a Dealer Admin's approval before it is published. **Lock** stops publishing at once.

A Page that is unlocked is locked again automatically if its Page ID, token or mode is changed.

## Security

- Feed URLs, Page tokens and app secrets are kept on the server only, encrypted with `APP_SECRET`
  (AES-256-GCM). They are never sent to the browser.
- Each dealership only sees its own inventory, posts, Pages and reports.
- AI captions can only use numbers, prices, offers and financing that are in the vehicle's data or typed by staff.
  A caption that mentions anything else is replaced by the standard template, and the review screen warns
  "Check the facts".
