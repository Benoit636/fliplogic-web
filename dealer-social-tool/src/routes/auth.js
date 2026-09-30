import express from 'express';
import { config, isProduction } from '../config.js';
import {
  signup,
  login,
  destroySession,
  requestPasswordReset,
  resetPassword,
  inviteInfo,
  acceptInvite,
  switchDealership,
  listUserDealerships,
  addDealershipForUser,
  changePassword,
} from '../services/auth.js';
import { getDealershipById } from '../services/dealership.js';
import { entitlements } from '../plans.js';
import { httpError } from '../services/errors.js';

export const SESSION_COOKIE = 'ds_session';

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 30 * 86_400_000,
    path: '/',
  });
}

export const authRoutes = express.Router();

authRoutes.post('/signup', (req, res) => {
  const { name, email, password, dealership_name, timezone } = req.body || {};
  const result = signup({ name, email, password, dealershipName: dealership_name, timezone });
  setSessionCookie(res, result.token);
  res.status(201).json({ user: result.user, dealership_id: result.dealership.id });
});

authRoutes.post('/login', (req, res) => {
  const result = login({ email: req.body?.email, password: req.body?.password, ip: req.ip });
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
});

authRoutes.post('/logout', (req, res) => {
  destroySession(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRoutes.post('/forgot', async (req, res) => {
  await requestPasswordReset(req.body?.email);
  res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
});

authRoutes.post('/reset', (req, res) => {
  const { token } = resetPassword(req.body?.token, req.body?.password);
  setSessionCookie(res, token);
  res.json({ ok: true });
});

authRoutes.get('/invite/:token', (req, res) => {
  const { invite, dealershipName, existingUser } = inviteInfo(req.params.token);
  res.json({ email: invite.email, role: invite.role, dealership_name: dealershipName, existing_user: existingUser, logged_in_as: req.session?.user?.email || null });
});

authRoutes.post('/invite/:token/accept', (req, res) => {
  const { token } = acceptInvite(req.params.token, { name: req.body?.name, password: req.body?.password, sessionUser: req.session?.user });
  setSessionCookie(res, token);
  res.json({ ok: true });
});

// --- the logged-in user ---
export const meRoutes = express.Router();

meRoutes.use((req, res, next) => (req.session ? next() : next(httpError(401, 'Please log in'))));

meRoutes.get('/', (req, res) => {
  const d = req.session.dealershipId ? getDealershipById(req.session.dealershipId) : null;
  res.json({
    user: req.session.user,
    role: req.session.role,
    dealership: d && { id: d.id, name: d.name, plan: d.plan, subscription_status: d.subscription_status, trial_ends_at: d.trial_ends_at, entitlements: entitlements(d) },
    dealerships: listUserDealerships(req.session.user.id),
    product_name: config.productName,
  });
});

meRoutes.post('/switch', (req, res) => {
  switchDealership(req.session, Number(req.body?.dealership_id));
  res.json({ ok: true });
});

meRoutes.post('/dealerships', (req, res) => {
  const d = addDealershipForUser(req.session.user.id, { name: req.body?.name, timezone: req.body?.timezone });
  switchDealership(req.session, d.id);
  res.status(201).json({ id: d.id, name: d.name });
});

meRoutes.post('/password', (req, res) => {
  changePassword(req.session.user.id, req.body?.current_password, req.body?.new_password);
  res.json({ ok: true });
});
