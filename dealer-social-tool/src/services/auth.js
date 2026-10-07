import { config } from '../config.js';
import { all, get, run, nowIso, transaction } from '../db.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../crypto.js';
import { runWithTenant } from '../tenant.js';
import { createDealership, getDealershipById } from './dealership.js';
import { requireRoom } from './entitlements.js';
import { sendEmail } from './mailer.js';
import { httpError } from './errors.js';

const SESSION_DAYS = 30;
const ROLES = ['owner', 'manager', 'staff'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u) => u && { id: u.id, email: u.email, name: u.name, is_superadmin: isSuperadmin(u) };

export const isSuperadmin = (user) => !!user && config.superadminEmails.includes(String(user.email).toLowerCase());

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
}

function checkEmail(email) {
  if (!EMAIL_RE.test(String(email || ''))) throw httpError(400, 'Enter a valid email address');
}

export function getUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', String(email).trim());
}

function createUser({ email, name, password }) {
  checkEmail(email);
  checkPassword(password);
  if (getUserByEmail(email)) throw httpError(409, 'An account with this email already exists — log in instead');
  const { lastInsertRowid } = run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', email.trim(), (name || '').trim(), hashPassword(password));
  return get('SELECT * FROM users WHERE id = ?', Number(lastInsertRowid));
}

export function createSession(userId, dealershipId = null) {
  const token = randomToken();
  const dealership = dealershipId ?? get('SELECT dealership_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1', userId)?.dealership_id ?? null;
  run(
    'INSERT INTO sessions (token_hash, user_id, dealership_id, expires_at) VALUES (?, ?, ?, ?)',
    sha256(token),
    userId,
    dealership,
    new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
  );
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), userId);
  return token;
}

/** Resolve a session cookie into the user, their current dealership and role. */
export function getSession(token) {
  if (!token) return null;
  const s = get('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', sha256(token), nowIso());
  if (!s) return null;
  const user = get('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!user) return null;
  let membership = s.dealership_id ? get('SELECT * FROM memberships WHERE user_id = ? AND dealership_id = ?', user.id, s.dealership_id) : null;
  if (!membership && !(isSuperadmin(user) && s.dealership_id)) {
    membership = get('SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1', user.id) || null;
    run('UPDATE sessions SET dealership_id = ? WHERE token_hash = ?', membership?.dealership_id ?? null, s.token_hash);
  }
  // Superadmins may open any dealership for support.
  const dealershipId = membership?.dealership_id ?? (isSuperadmin(user) ? s.dealership_id : null);
  return { tokenHash: s.token_hash, user: publicUser(user), dealershipId, role: membership?.role || (isSuperadmin(user) && dealershipId ? 'owner' : null) };
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function switchDealership(session, dealershipId) {
  const allowed =
    get('SELECT 1 FROM memberships WHERE user_id = ? AND dealership_id = ?', session.user.id, dealershipId) ||
    (session.user.is_superadmin && getDealershipById(dealershipId));
  if (!allowed) throw httpError(403, 'You are not a member of that dealership');
  run('UPDATE sessions SET dealership_id = ? WHERE token_hash = ?', dealershipId, session.tokenHash);
}

export function listUserDealerships(userId) {
  return all(`SELECT d.id, d.name, m.role FROM memberships m JOIN dealerships d ON d.id = m.dealership_id WHERE m.user_id = ? ORDER BY d.name`, userId);
}

export function signup({ name, email, password, dealershipName, timezone }) {
  if (!dealershipName?.trim()) throw httpError(400, 'Dealership name is required');
  const { user, dealership } = transaction(() => {
    const user = createUser({ email, name, password });
    const dealership = createDealership({ name: dealershipName, timezone });
    run('INSERT INTO memberships (user_id, dealership_id, role) VALUES (?, ?, ?)', user.id, dealership.id, 'owner');
    return { user, dealership };
  });
  sendEmail({
    to: user.email,
    subject: `Welcome to ${config.productName}`,
    text: `Hi ${user.name || 'there'},\n\nYour ${config.trialDays}-day free trial for ${dealership.name} has started. Connect your social accounts, add your inventory, and let the AI do the rest.`,
    actionUrl: `${config.appUrl}/app`,
    actionLabel: 'Open your dashboard',
  }).catch(() => {});
  return { user: publicUser(user), dealership, token: createSession(user.id, dealership.id) };
}

/** Add another rooftop for an existing user (dealer groups). */
export function addDealershipForUser(userId, { name, timezone }) {
  return transaction(() => {
    const dealership = createDealership({ name, timezone });
    run('INSERT INTO memberships (user_id, dealership_id, role) VALUES (?, ?, ?)', userId, dealership.id, 'owner');
    return dealership;
  });
}

// Simple in-memory brute-force protection per email and per IP.
const attempts = new Map();
export function throttle(key, max = 10) {
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60_000 };
  if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + 15 * 60_000 });
  entry.count++;
  attempts.set(key, entry);
  if (entry.count > max) throw httpError(429, 'Too many attempts. Try again in 15 minutes.');
}

export function login({ email, password, ip = '' }) {
  throttle(`email:${String(email).toLowerCase()}`);
  if (ip) throttle(`ip:${ip}`, 60); // dealerships share one office IP
  const user = getUserByEmail(email || '');
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) throw httpError(401, 'Wrong email or password');
  attempts.delete(`email:${String(email).toLowerCase()}`);
  return { user: publicUser(user), token: createSession(user.id) };
}

export async function requestPasswordReset(email) {
  const user = getUserByEmail(email || '');
  if (!user) return; // don't reveal which emails exist
  const token = randomToken();
  run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, new Date(Date.now() + 3600_000).toISOString());
  await sendEmail({
    to: user.email,
    subject: 'Reset your password',
    text: 'Someone (hopefully you) asked to reset your password. This link works for one hour.',
    actionUrl: `${config.appUrl}/reset?token=${token}`,
    actionLabel: 'Choose a new password',
  });
}

export function resetPassword(token, password) {
  checkPassword(password);
  const row = get('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', sha256(token || ''), nowIso());
  if (!row) throw httpError(400, 'This reset link is invalid or has expired');
  transaction(() => {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), row.user_id);
    run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', nowIso(), row.token_hash);
    run('DELETE FROM sessions WHERE user_id = ?', row.user_id); // log out everywhere
  });
  return { token: createSession(row.user_id) };
}

export function changePassword(userId, current, next) {
  const user = get('SELECT * FROM users WHERE id = ?', userId);
  if (!verifyPassword(String(current || ''), user.password_hash)) throw httpError(400, 'Current password is incorrect');
  checkPassword(next);
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), userId);
}

// ---- team ----

export function listTeam(dealershipId) {
  const members = all(
    `SELECT u.id, u.email, u.name, m.role, m.created_at, u.last_login_at FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.dealership_id = ? ORDER BY m.created_at`,
    dealershipId,
  );
  const invites = all(
    `SELECT id, email, role, expires_at, created_at FROM invites WHERE dealership_id = ? AND accepted_at IS NULL AND expires_at > ? ORDER BY id DESC`,
    dealershipId,
    nowIso(),
  );
  return { members, invites };
}

export async function inviteMember(dealershipId, inviter, { email, role = 'staff' }) {
  checkEmail(email);
  if (!ROLES.includes(role)) throw httpError(400, 'Unknown role');
  const team = listTeam(dealershipId);
  runWithTenant(dealershipId, () => requireRoom('users', team.members.length + team.invites.length, 'team members'));
  if (team.members.some((m) => m.email.toLowerCase() === email.toLowerCase())) throw httpError(409, 'Already a member');
  const token = randomToken();
  run(
    'INSERT INTO invites (dealership_id, email, role, token_hash, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    dealershipId,
    email.trim(),
    role,
    sha256(token),
    inviter.id,
    new Date(Date.now() + 7 * 86_400_000).toISOString(),
  );
  const dealer = getDealershipById(dealershipId);
  const url = `${config.appUrl}/invite?token=${token}`;
  const { delivered } = await sendEmail({
    to: email,
    subject: `${inviter.name || inviter.email} invited you to ${dealer.name} on ${config.productName}`,
    text: `You've been invited to help manage ${dealer.name}'s social media as ${role}. The invite is valid for 7 days.`,
    actionUrl: url,
    actionLabel: 'Accept invite',
  });
  return { invite_url: url, emailed: delivered };
}

export function inviteInfo(token) {
  const invite = get('SELECT * FROM invites WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?', sha256(token || ''), nowIso());
  if (!invite) throw httpError(400, 'This invite is invalid or has expired');
  const dealer = getDealershipById(invite.dealership_id);
  return { invite, dealershipName: dealer.name, existingUser: !!getUserByEmail(invite.email) };
}

/** Accept an invite as a new user (name + password) or as the logged-in user with the same email. */
export function acceptInvite(token, { name, password, sessionUser } = {}) {
  const { invite } = inviteInfo(token);
  const user = transaction(() => {
    let user = getUserByEmail(invite.email);
    if (user) {
      const ok = (sessionUser && sessionUser.id === user.id) || (password && verifyPassword(password, user.password_hash));
      if (!ok) throw httpError(401, 'Log in with this email to accept the invite');
    } else {
      user = createUser({ email: invite.email, name, password });
    }
    run('INSERT OR IGNORE INTO memberships (user_id, dealership_id, role) VALUES (?, ?, ?)', user.id, invite.dealership_id, invite.role);
    run('UPDATE invites SET accepted_at = ? WHERE id = ?', nowIso(), invite.id);
    return user;
  });
  return { token: createSession(user.id, invite.dealership_id), dealershipId: invite.dealership_id };
}

export function revokeInvite(dealershipId, inviteId) {
  run('DELETE FROM invites WHERE id = ? AND dealership_id = ?', inviteId, dealershipId);
}

function ownerCount(dealershipId) {
  return get(`SELECT COUNT(*) AS n FROM memberships WHERE dealership_id = ? AND role = 'owner'`, dealershipId).n;
}

export function changeRole(dealershipId, userId, role) {
  if (!ROLES.includes(role)) throw httpError(400, 'Unknown role');
  const m = get('SELECT * FROM memberships WHERE dealership_id = ? AND user_id = ?', dealershipId, userId);
  if (!m) throw httpError(404, 'Member not found');
  if (m.role === 'owner' && role !== 'owner' && ownerCount(dealershipId) === 1) throw httpError(400, 'A dealership needs at least one owner');
  run('UPDATE memberships SET role = ? WHERE dealership_id = ? AND user_id = ?', role, dealershipId, userId);
}

export function removeMember(dealershipId, userId) {
  const m = get('SELECT * FROM memberships WHERE dealership_id = ? AND user_id = ?', dealershipId, userId);
  if (!m) throw httpError(404, 'Member not found');
  if (m.role === 'owner' && ownerCount(dealershipId) === 1) throw httpError(400, 'A dealership needs at least one owner');
  run('DELETE FROM memberships WHERE dealership_id = ? AND user_id = ?', dealershipId, userId);
  run('UPDATE sessions SET dealership_id = NULL WHERE user_id = ? AND dealership_id = ?', userId, dealershipId);
}
