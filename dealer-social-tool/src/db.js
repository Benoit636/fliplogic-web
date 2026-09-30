import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dealership (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'My Dealership',
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'simulated' CHECK (mode IN ('simulated', 'live')),
  external_id TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_status_sched ON posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS autopilot_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  post_type TEXT NOT NULL,
  platforms TEXT NOT NULL DEFAULT '[]',
  days_of_week TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
  time_of_day TEXT NOT NULL DEFAULT '10:00',
  instructions TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  replied_at TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_conv ON chat_messages(conversation_id, id);

INSERT OR IGNORE INTO dealership (id) VALUES (1);
`;

let db;

export function openDb(file = config.databasePath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
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

export function all(sql, ...params) {
  return getDb().prepare(sql).all(...params);
}

export function get(sql, ...params) {
  return getDb().prepare(sql).get(...params);
}

export function run(sql, ...params) {
  return getDb().prepare(sql).run(...params);
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Build a parameterised UPDATE from a whitelist of columns. */
export function updateRow(table, id, fields, allowed) {
  const keys = Object.keys(fields).filter((k) => allowed.includes(k) && fields[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const hasUpdatedAt = ['posts', 'vehicles', 'dealership'].includes(table);
  run(
    `UPDATE ${table} SET ${sets}${hasUpdatedAt ? ', updated_at = ?' : ''} WHERE id = ?`,
    ...keys.map((k) => fields[k]),
    ...(hasUpdatedAt ? [nowIso()] : []),
    id,
  );
}

export function logActivity(actor, action, details = '') {
  run('INSERT INTO activity_log (actor, action, details) VALUES (?, ?, ?)', actor, action, String(details).slice(0, 1000));
}
