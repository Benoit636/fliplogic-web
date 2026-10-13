# Pilot setup: Dealer #001 (Volkswagen Moncton)

How the first dealership, its administrator and its staff get their logins. Nobody shares a password:
every person opens their own single-use link and chooses their own.

## Roles

| Role | Can do |
| --- | --- |
| **Dealer Admin** | Everything for their dealership: profile, logo and branding, team (invite, change role, remove), inventory, approving and publishing posts, settings. |
| **Dealer Staff** | Create posts (from inventory or by hand) and send them to a Dealer Admin for approval. Can read the profile and inventory; can't change settings, the team, or publish. |

The platform owner (emails listed in `SUPERADMIN_EMAILS`) also gets the **Admin** console at `/admin` to add more dealerships.

Each dealership's data (profile, logo, team, inventory, posts) is visible only to its own members.

## 1. Create the dealership and its first Dealer Admin

On the server (Render: your service → **Shell**; Docker: `docker compose exec app sh`; locally: in `dealer-social-tool/`):

```bash
npm run create-dealer -- --preset vw-moncton --admin-email you@vwmoncton.com
```

This creates **Volkswagen Moncton as Dealer #001** (Moncton, NB; America/Moncton time zone; km; English and French; VW blue
as the brand colour) and prints a **setup link** for the Dealer Admin:

```
✔ Created Dealer #001: Volkswagen Moncton
Setup link for you@vwmoncton.com (Dealer Admin, single use, expires in 3 days):
  https://your-app-address/invite?token=…
```

- The link works **once** and expires in **3 days**. Only a hash of it is stored.
- No user or password exists until the admin opens the link.
- `APP_URL` must be set to the public `https://` address first, or the link will point to the wrong place.

Lost or expired link? Make a new one (the old one stops working):

```bash
npm run create-dealer -- --invite-admin --number 001 --admin-email you@vwmoncton.com
```

Other dealerships later: `npm run create-dealer -- --name "Smith Motors" --admin-email gm@smith.ca` (gets the next number, 002),
or use **Add a dealership** in the `/admin` console.

## 2. The Dealer Admin finishes the profile

1. Open the setup link, enter your name, and choose a password (10+ characters, not containing your email name).
2. Go to **Accounts & Settings → Dealership profile** and fill in:
   - street address, postal code, phone, website (full address, starting with `https://`);
   - **Logo**: upload a PNG (transparent background is best), JPG or WebP. SVG isn't accepted;
   - main and accent brand colours.
3. Click **Save profile**. The logo appears at the top of the menu.

## 3. Invite staff

1. **More tools → Team → Invite someone**: their work email, role **Dealer Staff** (or **Dealer Admin** for another manager).
2. If email sending is set up (`RESEND_API_KEY`), they get an email. If not, copy the link shown and send it to that person only.
3. They open the link, enter their name and choose their own password. The link works once and expires in 7 days.
4. To remove someone, click **Remove** on the Team page. They lose access immediately.

Forgot password: **Forgot your password?** on the login page emails a reset link (needs `RESEND_API_KEY`).
Without email set up, a Dealer Admin can remove the person and invite them again.

## Security notes

- Self-serve signup is **off** in production (`ALLOW_SIGNUP` unset), so nobody can create a dealership without you.
- Passwords are hashed with scrypt. Sessions are random tokens in an HttpOnly, Secure, SameSite cookie; only their hash is stored.
- Changing your password signs you out on your other devices. Removing a member ends their access right away.
- Repeated wrong passwords are slowed down (10 tries per email per 15 minutes).
- `npm run seed` (fake demo data) refuses to run when `NODE_ENV=production`.
