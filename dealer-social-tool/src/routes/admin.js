import express from 'express';
import { platformOverview, adminUpdateDealership } from '../services/admin.js';
import { switchDealership } from '../services/auth.js';
import { httpError } from '../services/errors.js';

/** Platform-owner console. Only emails listed in SUPERADMIN_EMAILS get in. */
export const adminRoutes = express.Router();

adminRoutes.use((req, res, next) => (req.session?.user?.is_superadmin ? next() : next(httpError(403, 'Admins only'))));

adminRoutes.get('/overview', (req, res) => res.json(platformOverview()));
adminRoutes.patch('/dealerships/:id', (req, res) => res.json(adminUpdateDealership(Number(req.params.id), req.body || {})));
adminRoutes.post('/dealerships/:id/open', (req, res) => {
  switchDealership(req.session, Number(req.params.id));
  res.json({ ok: true });
});
