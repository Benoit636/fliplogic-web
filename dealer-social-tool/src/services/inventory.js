import { all, get, run, getDb, updateRow, parseJson, logActivity, nowIso } from '../db.js';
import { normaliseVehicle, readInventory, parseCsv } from '../shared/inventory-csv.js';
import { decrypt } from '../crypto.js';
import { tenantId } from '../tenant.js';
import { assertPublicUrl } from '../net.js';
import { httpError } from './errors.js';

const FIELDS = ['stock_number', 'vin', 'year', 'make', 'model', 'trim', 'condition', 'price', 'mileage', 'exterior_color', 'features', 'photos', 'status', 'detail_url', 'is_demo'];

export { parseCsv };

export function presentVehicle(row) {
  if (!row) return row;
  return { ...row, photos: parseJson(row.photos, []), sold_celebrated: !!row.sold_celebrated, is_demo: !!row.is_demo };
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
    where.push(`(COALESCE(year, '') || ' ' || make || ' ' || model || ' ' || trim || ' ' || stock_number || ' ' || vin || ' ' || exterior_color) LIKE ?`);
    params.push(`%${word.replace(/[%_]/g, '')}%`);
  }
  return all(`SELECT * FROM vehicles WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`, ...params, Math.min(2000, Number(limit) || 500)).map(
    presentVehicle,
  );
}

export function getVehicle(id) {
  return presentVehicle(get('SELECT * FROM vehicles WHERE id = ? AND dealership_id = ?', id, tenantId()));
}

export function createVehicle(input, { source = 'manual' } = {}) {
  const v = { ...clean(input), source, last_seen_at: source === 'manual' ? null : nowIso() };
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

/** Posts for a vehicle that has left the inventory can't be approved or published any more. */
function withdrawPostsFor(vehicleId, reason) {
  run(
    `UPDATE posts SET status = 'rejected', error = ?, approved_by = NULL, approved_by_name = NULL, approved_at = NULL, updated_at = ?
     WHERE dealership_id = ? AND vehicle_id = ? AND post_type != 'sold_celebration' AND status IN ('draft', 'pending_approval', 'approved', 'scheduled', 'failed')`,
    reason,
    nowIso(),
    tenantId(),
    vehicleId,
  );
}

/**
 * Add new vehicles and update existing ones, matched by VIN first, then stock number, so re-importing
 * tomorrow's export never creates duplicates. With dryRun nothing is saved: you get the same report as a preview.
 * markMissingSold: imported/feed vehicles that are no longer in the file are marked sold ("removed"), their open
 * posts are withdrawn, and they come back automatically if they reappear. Vehicles added by hand are never touched.
 * Guard: nothing is removed when the file has fewer than 3 vehicles or would remove more than half the lot at once.
 */
export function importVehiclesCsv(text, { actor = 'user', dryRun = false, markMissingSold = false, source = 'csv', maxRemovalShare = 0.5 } = {}) {
  const parsed = readInventory(text);
  if (parsed.error) throw httpError(400, parsed.error);
  const result = {
    dry_run: dryRun,
    format: parsed.format,
    total: parsed.items.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    marked_sold: 0,
    restored: 0,
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
  const now = nowIso();
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
          // Back in the feed after being removed: available again (unless the feed says otherwise).
          if (existing.removed_at && v.status === undefined) {
            v.status = 'available';
            result.restored++;
          }
          const changes = Object.keys(v).filter((k) => !sameValue(existing[k], k === 'is_demo' ? !!v[k] : v[k]));
          if (!changes.length) {
            result.unchanged++;
            report({ ...base, action: 'unchanged' });
          } else {
            updateVehicle(existing.id, v);
            result.updated++;
            report({ ...base, action: 'update', changes });
          }
          run(`UPDATE vehicles SET last_seen_at = ?, removed_at = NULL, source = CASE WHEN source = 'manual' THEN source ELSE ? END WHERE id = ? AND dealership_id = ?`, now, source, existing.id, tenantId());
        } else {
          seenIds.add(createVehicle(v, { source }).id);
          result.created++;
          report({ ...base, action: 'create' });
        }
      } catch (err) {
        skip(err.message);
      }
    }
    if (markMissingSold) {
      const imported = all(`SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available' AND source != 'manual'`, tenantId());
      const missing = imported.filter((row) => !seenIds.has(row.id));
      if (seenIds.size < 3) result.warning = 'Nothing was marked as removed: the file has fewer than 3 valid vehicles.';
      else if (missing.length > 5 && missing.length > imported.length * maxRemovalShare)
        result.warning = `Nothing was marked as removed: ${missing.length} of ${imported.length} vehicles are missing from the file, which looks like an incomplete feed.`;
      else
        for (const row of missing) {
          updateVehicle(row.id, { status: 'sold' });
          run('UPDATE vehicles SET removed_at = ? WHERE id = ? AND dealership_id = ?', now, row.id, tenantId());
          withdrawPostsFor(row.id, 'Vehicle is no longer in the inventory (sold or removed), so this post was withdrawn.');
          result.marked_sold++;
          report({ line: null, action: 'sold', title: vehicleTitle(row), stock_number: row.stock_number, vin: row.vin });
        }
    }
    if (dryRun) db.exec('ROLLBACK');
    else {
      logActivity(
        actor,
        'inventory.imported',
        `${result.created} added, ${result.updated} updated, ${result.marked_sold} removed, ${result.errors.length} skipped${result.warning ? ` (${result.warning})` : ''}`,
      );
      db.exec('COMMIT');
    }
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ...result, seenIds };
}

const MAX_FEED_BYTES = 50 * 1024 * 1024;

/** Download a feed: public hosts only (redirects re-checked), "user:pass@" sent as Basic auth, 50 MB max. */
export async function downloadFeed(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The feed address is not a valid URL');
  }
  const headers = { accept: 'text/csv, application/xml, text/xml, text/plain, */*' };
  if (url.username) {
    headers.authorization = `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`;
    url.username = '';
    url.password = '';
  }
  const host = url.host;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(url.href);
    const res = await fetch(url, { redirect: 'manual', headers: url.host === host ? headers : { accept: headers.accept }, signal: AbortSignal.timeout(60_000) });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new Error(`Feed download failed: HTTP ${res.status}`);
    if (Number(res.headers.get('content-length') || 0) > MAX_FEED_BYTES) throw new Error('The feed is larger than 50 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FEED_BYTES) throw new Error('The feed is larger than 50 MB');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('windows-1252').decode(buf);
    }
  }
  throw new Error('The feed address redirects too many times');
}

/**
 * Pull the dealership's inventory feed (Facebook/Meta catalog XML or CSV, or a provider CSV/XML export).
 * Every run is recorded in inventory_syncs. Vehicles that leave the feed are removed from promotion.
 */
export async function syncInventoryFeed(dealer, { trigger = 'schedule' } = {}) {
  const url = decrypt(dealer.inventory_feed_url);
  if (!url) return null;
  const started = nowIso();
  const { lastInsertRowid } = run('INSERT INTO inventory_syncs (dealership_id, started_at, trigger) VALUES (?, ?, ?)', tenantId(), started, trigger);
  const syncId = Number(lastInsertRowid);
  try {
    const text = await downloadFeed(url);
    const result = importVehiclesCsv(text, { actor: 'feed', markMissingSold: !!dealer.feed_marks_sold, source: 'feed' });
    const summary = `${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged, ${result.marked_sold} removed${result.errors.length ? `, ${result.errors.length} skipped` : ''}${result.warning ? `. ${result.warning}` : ''}`;
    run(
      `UPDATE inventory_syncs SET finished_at = ?, ok = 1, format = ?, total = ?, created = ?, updated = ?, unchanged = ?, removed = ?, skipped = ?, message = ? WHERE id = ?`,
      nowIso(),
      result.format,
      result.total,
      result.created,
      result.updated,
      result.unchanged,
      result.marked_sold,
      result.errors.length,
      summary,
      syncId,
    );
    run(`UPDATE dealerships SET feed_last_synced_at = ?, feed_last_result = ?, feed_last_error = '', feed_failures = 0 WHERE id = ?`, started, summary, tenantId());
    return { ...result, seenIds: undefined, sold: result.marked_sold, summary };
  } catch (err) {
    const message = err.message || 'Feed sync failed';
    run('UPDATE inventory_syncs SET finished_at = ?, ok = 0, message = ? WHERE id = ?', nowIso(), message, syncId);
    run('UPDATE dealerships SET feed_last_synced_at = ?, feed_last_error = ?, feed_failures = feed_failures + 1 WHERE id = ?', started, message, tenantId());
    logActivity('feed', 'inventory.sync_failed', message);
    throw err;
  }
}

export function listInventorySyncs(limit = 20) {
  return all('SELECT * FROM inventory_syncs WHERE dealership_id = ? ORDER BY id DESC LIMIT ?', tenantId(), limit);
}
