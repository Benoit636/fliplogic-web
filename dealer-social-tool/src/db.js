import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { tenantId, hasTenant } from './tenant.js';

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

// Append-only list of schema migrations. Never edit a migration that has shipped; add a new one.
const MIGRATIONS = [
  // 1: multi-dealership SaaS schema
  `
  DROP TABLE IF EXISTS dealership; -- single-tenant v0.1 prototype table

  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    last_login_at TEXT
  );

  CREATE TABLE dealerships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brands TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    brand_voice TEXT NOT NULL DEFAULT 'Friendly, upbeat and trustworthy. Local and community-focused. Never pushy.',
    default_hashtags TEXT NOT NULL DEFAULT '',
    call_to_action TEXT NOT NULL DEFAULT 'Book your test drive today!',
    compliance_notes TEXT NOT NULL DEFAULT 'Prices exclude taxes and fees. Vehicle subject to prior sale.',
    autonomy TEXT NOT NULL DEFAULT 'assist' CHECK (autonomy IN ('assist', 'autopilot')),
    language TEXT NOT NULL DEFAULT 'English',
    distance_unit TEXT NOT NULL DEFAULT 'km' CHECK (distance_unit IN ('km', 'mi')),
    timezone TEXT NOT NULL DEFAULT 'America/Moncton',
    inventory_feed_url TEXT NOT NULL DEFAULT '',
    feed_marks_sold INTEGER NOT NULL DEFAULT 1,
    feed_last_synced_at TEXT,
    feed_last_result TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'pro',
    billing_interval TEXT NOT NULL DEFAULT 'month',
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    status_changed_at TEXT,
    trial_ends_at TEXT,
    current_period_end TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE memberships (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, dealership_id)
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dealership_id INTEGER REFERENCES dealerships(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    expires_at TEXT NOT NULL
  );

  CREATE TABLE invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    role TEXT NOT NULL DEFAULT 'staff',
    token_hash TEXT NOT NULL UNIQUE,
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    verifier TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE usage (
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    metric TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dealership_id, period, metric)
  );

  CREATE TABLE stripe_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT ${NOW}
  );

  DROP TABLE IF EXISTS accounts;
  CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    display_name TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'simulated' CHECK (mode IN ('simulated', 'live')),
    external_id TEXT NOT NULL DEFAULT '',
    access_token TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL DEFAULT '',
    token_expires_at TEXT,
    last_error TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_accounts_tenant ON accounts(dealership_id, platform);

  DROP TABLE IF EXISTS vehicles;
  CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    stock_number TEXT NOT NULL DEFAULT '',
    vin TEXT NOT NULL DEFAULT '',
    year INTEGER,
    make TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    trim TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL DEFAULT 'used' CHECK (condition IN ('new', 'used', 'certified')),
    price REAL,
    mileage INTEGER,
    exterior_color TEXT NOT NULL DEFAULT '',
    features TEXT NOT NULL DEFAULT '',
    photos TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'pending', 'sold')),
    previous_price REAL,
    sold_celebrated INTEGER NOT NULL DEFAULT 0,
    last_posted_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_vehicles_tenant ON vehicles(dealership_id, status);

  DROP TABLE IF EXISTS posts;
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    post_type TEXT NOT NULL DEFAULT 'custom',
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    hashtags TEXT NOT NULL DEFAULT '[]',
    media TEXT NOT NULL DEFAULT '[]',
    image_idea TEXT NOT NULL DEFAULT '',
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    source TEXT NOT NULL DEFAULT 'manual',
    batch_id TEXT,
    scheduled_at TEXT,
    published_at TEXT,
    external_id TEXT,
    external_url TEXT,
    error TEXT,
    metrics TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_posts_tenant ON posts(dealership_id, status, scheduled_at);
  CREATE INDEX idx_posts_due ON posts(status, scheduled_at);

  DROP TABLE IF EXISTS autopilot_rules;
  CREATE TABLE autopilot_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    post_type TEXT NOT NULL,
    platforms TEXT NOT NULL DEFAULT '[]',
    days_of_week TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
    time_of_day TEXT NOT NULL DEFAULT '10:00',
    instructions TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  DROP TABLE IF EXISTS inbox_messages;
  CREATE TABLE inbox_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'dm', 'review', 'mention')),
    author TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL,
    rating INTEGER,
    post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    external_id TEXT,
    sentiment TEXT,
    intent TEXT,
    priority TEXT,
    is_lead INTEGER NOT NULL DEFAULT 0,
    suggested_reply TEXT,
    reply TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'replied', 'dismissed', 'escalated')),
    received_at TEXT NOT NULL DEFAULT ${NOW},
    replied_at TEXT
  );
  CREATE INDEX idx_inbox_tenant ON inbox_messages(dealership_id, status);

  DROP TABLE IF EXISTS activity_log;
  CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER REFERENCES dealerships(id) ON DELETE CASCADE,
    at TEXT NOT NULL DEFAULT ${NOW},
    actor TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_activity_tenant ON activity_log(dealership_id, id);

  DROP TABLE IF EXISTS chat_messages;
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE INDEX idx_chat_conv ON chat_messages(dealership_id, conversation_id, id);
  `,
];

let db;

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get().v;
  for (let v = current + 1; v <= MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v - 1]);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDb(file = config.databasePath) {
  if (db) db.close();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate();
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export function closeDb() {
  if (db) db.close();
  db = undefined;
}

export const nowIso = () => new Date().toISOString();

export const all = (sql, ...params) => getDb().prepare(sql).all(...params);
export const get = (sql, ...params) => getDb().prepare(sql).get(...params);
export const run = (sql, ...params) => getDb().prepare(sql).run(...params);

export function transaction(fn) {
  getDb().exec('BEGIN');
  try {
    const result = fn();
    getDb().exec('COMMIT');
    return result;
  } catch (err) {
    getDb().exec('ROLLBACK');
    throw err;
  }
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const TIMESTAMPED = ['posts', 'vehicles', 'dealerships'];

/**
 * Parameterised UPDATE from a whitelist of columns. Tenant tables are always
 * restricted to the current dealership.
 */
export function updateRow(table, id, fields, allowed, { tenant = table !== 'dealerships' } = {}) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const stamp = TIMESTAMPED.includes(table);
  run(
    `UPDATE ${table} SET ${sets}${stamp ? ', updated_at = ?' : ''} WHERE id = ?${tenant ? ' AND dealership_id = ?' : ''}`,
    ...keys.map((k) => fields[k]),
    ...(stamp ? [nowIso()] : []),
    id,
    ...(tenant ? [tenantId()] : []),
  );
}

export function logActivity(actor, action, details = '') {
  run(
    'INSERT INTO activity_log (dealership_id, actor, action, details) VALUES (?, ?, ?, ?)',
    hasTenant() ? tenantId() : null,
    actor,
    action,
    String(details).slice(0, 1000),
  );
}

/** Vacuum the live database into a timestamped backup file and keep the latest `keep`. */
export function backupDatabase(dir = config.backupDir, keep = 14) {
  if (config.databasePath === ':memory:') return null;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `dealer-social-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  getDb().prepare('VACUUM INTO ?').run(file);
  const backups = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) fs.rmSync(path.join(dir, old));
  return file;
}
