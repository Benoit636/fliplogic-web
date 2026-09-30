import { all, get, run, updateRow, parseJson, logActivity, nowIso } from '../db.js';
import { tenantId } from '../tenant.js';
import { httpError } from './errors.js';

const FIELDS = [
  'stock_number',
  'vin',
  'year',
  'make',
  'model',
  'trim',
  'condition',
  'price',
  'mileage',
  'exterior_color',
  'features',
  'photos',
  'status',
];

export function presentVehicle(row) {
  if (!row) return row;
  return { ...row, photos: parseJson(row.photos, []), sold_celebrated: !!row.sold_celebrated };
}

export function vehicleTitle(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}

function normalise(input) {
  const v = {};
  for (const key of FIELDS) if (input[key] !== undefined) v[key] = input[key];
  for (const key of ['year', 'mileage']) {
    if (v[key] !== undefined) v[key] = v[key] === '' || v[key] === null ? null : Math.round(Number(String(v[key]).replace(/[^0-9.]/g, '')));
  }
  if (v.price !== undefined) v.price = v.price === '' || v.price === null ? null : Number(String(v.price).replace(/[^0-9.]/g, ''));
  if (v.condition) {
    const c = String(v.condition).toLowerCase();
    v.condition = c.startsWith('n') ? 'new' : c.startsWith('c') ? 'certified' : 'used';
  }
  if (v.status) {
    const s = String(v.status).toLowerCase();
    if (!['available', 'pending', 'sold'].includes(s)) throw httpError(400, `Invalid status "${v.status}"`);
    v.status = s;
  }
  if (v.photos !== undefined) {
    const list = Array.isArray(v.photos) ? v.photos : String(v.photos).split(/[\s|,]+/);
    v.photos = JSON.stringify(list.map((p) => String(p).trim()).filter(Boolean));
  }
  return v;
}

export function listVehicles({ status, q, limit = 500 } = {}) {
  const where = ['dealership_id = ?'];
  const params = [tenantId()];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push("(make || ' ' || model || ' ' || trim || ' ' || stock_number || ' ' || vin || ' ' || year) LIKE ?");
    params.push(`%${q}%`);
  }
  return all(
    `SELECT * FROM vehicles WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ...params,
    Number(limit),
  ).map(presentVehicle);
}

export function getVehicle(id) {
  return presentVehicle(get('SELECT * FROM vehicles WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

export function createVehicle(input) {
  const v = normalise(input);
  if (!v.make || !v.model) throw httpError(400, 'make and model are required');
  const keys = Object.keys(v);
  const { lastInsertRowid } = run(
    `INSERT INTO vehicles (dealership_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`,
    tenantId(),
    ...keys.map((k) => v[k]),
  );
  return getVehicle(Number(lastInsertRowid));
}

export function updateVehicle(id, input) {
  const existing = getVehicle(id);
  if (!existing) throw httpError(404, 'Vehicle not found');
  const v = normalise(input);
  // Remember the old price so the bot can announce price drops.
  if (v.price != null && existing.price != null && v.price < existing.price) v.previous_price = existing.price;
  if (v.status && v.status !== 'sold') v.sold_celebrated = 0;
  updateRow('vehicles', id, v, [...FIELDS, 'previous_price', 'sold_celebrated']);
  if (v.status === 'sold' && existing.status !== 'sold') logActivity('user', 'vehicle.sold', vehicleTitle(existing));
  return getVehicle(id);
}

export function markVehiclePosted(id) {
  run('UPDATE vehicles SET last_posted_at = ? WHERE id = ? AND dealership_id = ?', nowIso(), id, tenantId());
}

export function deleteVehicle(id) {
  run('DELETE FROM vehicles WHERE id = ? AND dealership_id = ?', id, tenantId());
}

/** Vehicle that has gone the longest without being featured. */
export function nextVehicleToFeature() {
  return presentVehicle(
    get(
      `SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available'
       ORDER BY last_posted_at IS NOT NULL, last_posted_at ASC, created_at DESC LIMIT 1`,
      tenantId(),
    ),
  );
}

export function nextNewArrival() {
  return presentVehicle(
    get(`SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available' AND last_posted_at IS NULL ORDER BY created_at DESC LIMIT 1`, tenantId()),
  );
}

export function nextPriceDrop() {
  return presentVehicle(
    get(
      `SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available' AND previous_price IS NOT NULL AND price < previous_price
       AND (last_posted_at IS NULL OR last_posted_at < updated_at) ORDER BY updated_at DESC LIMIT 1`,
      tenantId(),
    ),
  );
}

export function nextSoldToCelebrate() {
  return presentVehicle(
    get(`SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'sold' AND sold_celebrated = 0 ORDER BY updated_at DESC LIMIT 1`, tenantId()),
  );
}

export function markSoldCelebrated(id) {
  run('UPDATE vehicles SET sold_celebrated = 1 WHERE id = ? AND dealership_id = ?', id, tenantId());
}

// --- CSV import (works with typical DMS / inventory feed exports) ---

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_ALIASES = {
  stock_number: ['stock', 'stock_number', 'stock #', 'stock no', 'stocknumber', 'stock_no'],
  vin: ['vin'],
  year: ['year', 'model year'],
  make: ['make', 'manufacturer'],
  model: ['model'],
  trim: ['trim', 'series'],
  condition: ['condition', 'type', 'new/used', 'new_used'],
  price: ['price', 'internet price', 'selling price', 'sale price', 'list price', 'msrp'],
  mileage: ['mileage', 'miles', 'odometer', 'kilometers', 'km', 'kms'],
  exterior_color: ['color', 'exterior color', 'exterior_color', 'colour', 'exterior colour'],
  features: ['features', 'options', 'description', 'highlights'],
  photos: ['photos', 'photo', 'images', 'image urls', 'image_urls', 'photo urls', 'photo_urls'],
  status: ['status'],
};

export function importVehiclesCsv(text, { actor = 'user' } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw httpError(400, 'CSV needs a header row and at least one vehicle');
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const mapping = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) mapping[field] = idx;
  }
  if (mapping.make === undefined || mapping.model === undefined) {
    throw httpError(400, 'CSV must include Make and Model columns');
  }
  let created = 0;
  let updated = 0;
  const errors = [];
  const seenIds = new Set();
  rows.slice(1).forEach((cells, i) => {
    const input = {};
    for (const [field, idx] of Object.entries(mapping)) input[field] = (cells[idx] ?? '').trim();
    if (!input.status) delete input.status;
    try {
      const existing =
        (input.vin && get('SELECT id FROM vehicles WHERE dealership_id = ? AND vin = ?', tenantId(), input.vin)) ||
        (input.stock_number && get('SELECT id FROM vehicles WHERE dealership_id = ? AND stock_number = ?', tenantId(), input.stock_number));
      if (existing) {
        updateVehicle(existing.id, input);
        seenIds.add(existing.id);
        updated++;
      } else {
        seenIds.add(createVehicle(input).id);
        created++;
      }
    } catch (err) {
      errors.push({ row: i + 2, error: err.message });
    }
  });
  logActivity(actor, 'inventory.imported', `${created} added, ${updated} updated`);
  return { created, updated, errors, seenIds };
}

/**
 * Pull the dealership's inventory feed (CSV URL from their DMS / website provider).
 * Vehicles that disappear from the feed are marked sold, which triggers sold-celebration posts.
 */
export async function syncInventoryFeed(dealer) {
  if (!dealer.inventory_feed_url) return null;
  const res = await fetch(dealer.inventory_feed_url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Feed download failed: HTTP ${res.status}`);
  const text = await res.text();
  const result = importVehiclesCsv(text, { actor: 'feed' });
  let sold = 0;
  // Guard against a broken/empty feed wiping out the whole lot.
  if (dealer.feed_marks_sold && result.seenIds.size >= 3) {
    for (const v of all(`SELECT id FROM vehicles WHERE dealership_id = ? AND status = 'available'`, tenantId())) {
      if (!result.seenIds.has(v.id)) {
        updateVehicle(v.id, { status: 'sold' });
        sold++;
      }
    }
  }
  const summary = `${result.created} added, ${result.updated} updated, ${sold} marked sold${result.errors.length ? `, ${result.errors.length} rows skipped` : ''}`;
  run('UPDATE dealerships SET feed_last_synced_at = ?, feed_last_result = ? WHERE id = ?', nowIso(), summary, tenantId());
  return { ...result, seenIds: undefined, sold, summary };
}
