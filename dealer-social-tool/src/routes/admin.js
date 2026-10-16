import express from 'express';
import { platformOverview, adminUpdateDealership } from '../services/admin.js';
import { switchDealership } from '../services/auth.js';
import { createDealerWithAdmin, inviteDealerAdmin } from '../services/setup.js';
import { listPages, unlockPage, lockPage } from '../services/admin.js';
import { httpError } from '../services/errors.js';

/** Platform-owner console. Only emails listed in SUPERADMIN_EMAILS get in. */
export const adminRoutes = express.Router();

adminRoutes.use((req, res, next) => (req.session?.user?.is_superadmin ? next() : next(httpError(403, 'Admins only'))));

adminRoutes.get('/overview', (req, res) => res.json(platformOverview()));
// New dealership + single-use setup link for its first Dealer Admin.
adminRoutes.post('/dealerships', (req, res) => {
  const { name, dealer_number, admin_email } = req.body || {};
  const r = createDealerWithAdmin({ name, dealerNumber: dealer_number || undefined, adminEmail: admin_email });
  res.status(201).json({ dealership: { id: r.dealership.id, dealer_number: r.dealership.dealer_number, name: r.dealership.name }, invite_url: r.invite_url });
});
adminRoutes.post('/dealerships/:number/admin-invite', (req, res) => {
  res.status(201).json({ invite_url: inviteDealerAdmin(req.params.number, req.body?.admin_email).invite_url });
});
// Facebook Pages: every connected Page is locked until the platform owner unlocks it (test Page or live Page).
adminRoutes.get('/pages', (req, res) => res.json(listPages()));
adminRoutes.post('/pages/:id/unlock', (req, res) => res.json(unlockPage(Number(req.params.id), { ...req.body, by: req.session.user.email })));
adminRoutes.post('/pages/:id/lock', (req, res) => res.json(lockPage(Number(req.params.id), req.session.user.email)));
adminRoutes.patch('/dealerships/:id', (req, res) => res.json(adminUpdateDealership(Number(req.params.id), req.body || {})));
adminRoutes.post('/dealerships/:id/open', (req, res) => {
  switchDealership(req.session, Number(req.params.id));
  res.json({ ok: true });
});
