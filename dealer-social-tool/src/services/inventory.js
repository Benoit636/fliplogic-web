import { all, get, run, getDb, updateRow, parseJson, logActivity, nowIso } from '../db.js';
import { normaliseVehicle, readInventoryCsv, parseCsv } from '../shared/inventory-csv.js';
import { tenantId } from '../tenant.js';
import { assertPublicUrl } from '../net.js';
import { httpError } from './errors.js';

const FIELDS = ['stock_number', 'vin', 'year', 'make', 'model', 'trim', 'condition', 'price', 'mileage', 'exterior_color', 'features', 'photos', 'status'];

export { parseCsv };

export function presentVehicle(row) {
  if (!row) return row;
  return { ...row, photos: parseJson(row.photos, []), sold_celebrated: !!row.sold_celebrated };
}

export function vehicleTitle(v) {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
}

function clean(input, opts) {
  const { vehicle, error } = normaliseVehicle(input || {}, opts);
  if (error) throw httpError(400, error);
  if (vehicle.photos) vehicle.photos = JSON.stringify(vehicle.photos);
  return vehicle;
}

/** Vehicles in this dealership that already use the VIN or stock number. */
function findMatches({ vin, stock_number }, excludeId = 0) {
  const t = tenantId();
  return {
    byVin: vin ? presentVehicle(get('SELECT * FROM vehicles WHERE dealership_id = ? AND vin = ? AND id != ?', t, vin, excludeId)) : undefined,
    byStock: stock_number ? presentVehicle(get('SELECT * FROM vehicles WHERE dealership_id = ? AND stock_number = ? AND id != ?', t, stock_number, excludeId)) : undefined,
  };
}

function assertUnique(v, excludeId) {
  const { byVin, byStock } = findMatches(v, excludeId);
  if (byVin) throw httpError(409, `VIN ${v.vin} is already in inventory: ${vehicleTitle(byVin)}${byVin.stock_number ? ` (stock #${byVin.stock_number})` : ''}`);
  if (byStock) throw httpError(409, `Stock #${v.stock_number} is already used by ${vehicleTitle(byStock)}`);
}

/**
 * Search inventory. Every word must match somewhere (year, make, model, trim, stock #, VIN or colour),
 * so "21 tiguan" or the last digits of a VIN both work. condition: "new" | "used" (used includes certified).
 */
export function listVehicles({ status, condition, q, limit = 500 } = {}) {
  const where = ['dealership_id = ?'];
  const params = [tenantId()];
  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (condition === 'new') where.push(`condition = 'new'`);
  if (condition === 'used') where.push(`condition IN ('used', 'certified')`);
  for (const word of String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push(`(year || ' ' || make || ' ' || model || ' ' || trim || ' ' || stock_number || ' ' || vin || ' ' || exterior_color) LIKE ?`);
    params.push(`%${word.replace(/[%_]/g, '')}%`);
  }
  return all(`SELECT * FROM vehicles WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, ...params, Math.min(2000, Number(limit) || 500)).map(
    presentVehicle,
  );
}

export function getVehicle(id) {
  return presentVehicle(get('SELECT * FROM vehicles WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

export function createVehicle(input) {
  const v = clean(input);
  assertUnique(v);
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
  const v = clean(input, { partial: true });
  assertUnique(v, id);
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

// --- CSV import (DMS / website exports; see shared/inventory-csv.js for the columns understood) ---

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Add new vehicles and update existing ones, matched by VIN first, then stock number, so re-importing
 * tomorrow's export never creates duplicates. With dryRun nothing is saved: you get the same report as a preview.
 * markMissingSold marks available vehicles that aren't in the file as sold (only when the file has 3+ vehicles).
 */
export function importVehiclesCsv(text, { actor = 'user', dryRun = false, markMissingSold = false } = {}) {
  const parsed = readInventoryCsv(text);
  if (parsed.error) throw httpError(400, parsed.error);
  const result = {
    dry_run: dryRun,
    total: parsed.items.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    marked_sold: 0,
    duplicates_in_file: 0,
    errors: [],
    rows: [],
    mapped_columns: parsed.mapped,
    ignored_columns: parsed.ignored,
    warning: null,
  };
  const seenIds = new Set();
  const seenKeys = new Map();
  const report = (row) => result.rows.length < 300 && result.rows.push(row);
  const db = getDb();
  db.exec('BEGIN');
  try {
    for (const { line, vehicle: v, error } of parsed.items) {
      const base = { line, title: v ? vehicleTitle(v) : '', stock_number: v?.stock_number || '', vin: v?.vin || '' };
      const skip = (reason, action = 'error') => {
        result.errors.push({ row: line, error: reason });
        report({ ...base, action, error: reason });
      };
      if (error) {
        skip(error);
        continue;
      }
      const keys = [v.vin && `vin:${v.vin}`, v.stock_number && `stock:${v.stock_number}`].filter(Boolean);
      const firstLine = keys.map((k) => seenKeys.get(k)).find(Boolean);
      if (firstLine) {
        result.duplicates_in_file++;
        skip(`Same vehicle as line ${firstLine}, skipped`, 'duplicate');
        continue;
      }
      keys.forEach((k) => seenKeys.set(k, line));
      const { byVin, byStock } = findMatches(v);
      if (byVin && byStock && byVin.id !== byStock.id) {
        skip(`VIN matches ${vehicleTitle(byVin)} but stock #${v.stock_number} belongs to ${vehicleTitle(byStock)}`);
        continue;
      }
      if (!byVin && byStock && v.vin && byStock.vin && byStock.vin !== v.vin) {
        skip(`Stock #${v.stock_number} is already used by ${vehicleTitle(byStock)} (VIN ${byStock.vin})`);
        continue;
      }
      const existing = byVin || byStock;
      try {
        if (existing) {
          seenIds.add(existing.id);
          const changes = Object.keys(v).filter((k) => !sameValue(existing[k], v[k]));
          if (!changes.length) {
            result.unchanged++;
            report({ ...base, action: 'unchanged' });
          } else {
            updateVehicle(existing.id, v);
            result.updated++;
            report({ ...base, action: 'update', changes });
          }
        } else {
          seenIds.add(createVehicle(v).id);
          result.created++;
          report({ ...base, action: 'create' });
        }
      } catch (err) {
        skip(err.message);
      }
    }
    if (markMissingSold) {
      if (seenIds.size < 3) result.warning = 'Nothing was marked sold: the file has fewer than 3 valid vehicles.';
      else
        for (const row of all(`SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available'`, tenantId())) {
          if (seenIds.has(row.id)) continue;
          updateVehicle(row.id, { status: 'sold' });
          result.marked_sold++;
          report({ line: null, action: 'sold', title: vehicleTitle(row), stock_number: row.stock_number, vin: row.vin });
        }
    }
    if (dryRun) db.exec('ROLLBACK');
    else {
      logActivity(actor, 'inventory.imported', `${result.created} added, ${result.updated} updated, ${result.marked_sold} marked sold, ${result.errors.length} skipped`);
      db.exec('COMMIT');
    }
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ...result, seenIds };
}

/**
 * Pull the dealership's inventory feed (CSV URL from their DMS / website provider).
 * Vehicles that disappear from the feed are marked sold, which triggers sold-celebration posts.
 */
export async function syncInventoryFeed(dealer) {
  if (!dealer.inventory_feed_url) return null;
  await assertPublicUrl(dealer.inventory_feed_url);
  const res = await fetch(dealer.inventory_feed_url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!res.ok) throw new Error(`Feed download failed: HTTP ${res.status}`);
  const text = await res.text();
  // Vehicles that leave the feed are sold (guarded against a broken or empty feed wiping out the lot).
  const result = importVehiclesCsv(text, { actor: 'feed', markMissingSold: !!dealer.feed_marks_sold });
  const sold = result.marked_sold;
  const summary = `${result.created} added, ${result.updated} updated, ${sold} marked sold${result.errors.length ? `, ${result.errors.length} rows skipped` : ''}`;
  run('UPDATE dealerships SET feed_last_synced_at = ?, feed_last_result = ? WHERE id = ?', nowIso(), summary, tenantId());
  return { ...result, seenIds: undefined, sold, summary };
}
