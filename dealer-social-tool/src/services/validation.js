// Inventory validation: compare imported vehicles with the dealership's own website.
// Reads the standard schema.org vehicle data that dealer websites (D2C Media and most others) publish on each
// vehicle page. Only the dealership's own site, only pages robots.txt allows, with its crawl delay, one page per vehicle.
import { all, get, run, logActivity, parseJson } from '../db.js';
import { tenantId } from '../tenant.js';
import { assertPublicUrl } from '../net.js';
import { getDealership } from './dealership.js';
import { presentVehicle, vehicleTitle } from './inventory.js';
import { httpError } from './errors.js';

const USER_AGENT = 'SocialDealerBot/1.0 (inventory check for the dealership; one page per vehicle)';
const decodeHtml = (s) =>
  String(s ?? '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' })[e]);

// ---------- robots.txt ----------

/** Rules for our bot from robots.txt: the most specific matching group, else "*". */
export function parseRobots(text, agent = 'socialdealerbot') {
  const groups = [];
  let current = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = [m[0], m[1].toLowerCase(), m[2].trim()];
    if (key === 'user-agent') {
      if (!current || current.rules.length || current.delay != null) groups.push((current = { agents: [], rules: [], delay: null }));
      current.agents.push(value.toLowerCase());
    } else if (current && (key === 'disallow' || key === 'allow')) current.rules.push({ allow: key === 'allow', path: value });
    else if (current && key === 'crawl-delay') current.delay = Number(value) || null;
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && agent.includes(a))) || groups.find((g) => g.agents.includes('*'));
  return { rules: mine?.rules || [], delaySeconds: mine?.delay ?? null };
}

const ruleMatches = (pattern, path) => {
  if (!pattern) return false;
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  return re.test(path);
};
/** Longest matching rule wins; Allow wins ties (Google's rules). */
export function robotsAllows(robots, path) {
  let best = null;
  for (const r of robots.rules) {
    if (!ruleMatches(r.path, path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ---------- reading a vehicle page ----------

async function fetchPublic(url, { accept = 'text/html' } = {}) {
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current.href);
    const res = await fetch(current, { redirect: 'manual', headers: { 'user-agent': USER_AGENT, accept }, signal: AbortSignal.timeout(30_000) });
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      text = new TextDecoder('windows-1252').decode(buf);
    }
    return { status: res.status, text, url: current.href };
  }
  throw new Error('Too many redirects');
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isVehicleType = (t) => asArray(t).some((x) => ['Car', 'Vehicle', 'MotorizedBicycle', 'Motorcycle'].includes(x));

/** schema.org vehicle data + stock number from a vehicle page. */
export function readVehiclePage(html) {
  let vehicle = null;
  for (const block of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const nodes = asArray(data).flatMap((d) => [d, ...asArray(d['@graph'])]);
    vehicle = nodes.find((n) => n && (n.vehicleIdentificationNumber || isVehicleType(n['@type']))) || vehicle;
    if (vehicle) break;
  }
  const text = decodeHtml(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const stockMatch = text.match(/\b(?:Stock|Stock\s*#|Stock\s*No\.?|No\.?\s*de\s*stock|Inventaire)\s*:?\s*#?\s*([A-Z0-9][A-Z0-9-]{2,19})\b/i);
  if (!vehicle) return { found: false, stock_number: stockMatch?.[1] || '' };
  const offer = asArray(vehicle.offers)[0] || {};
  const images = asArray(vehicle.image).map((i) => (typeof i === 'string' ? i : i?.url || i?.contentUrl)).filter(Boolean);
  const availability = String(offer.availability || '').replace(/^https?:\/\/schema\.org\//, '');
  return {
    found: true,
    name: decodeHtml(vehicle.name || ''),
    vin: String(vehicle.vehicleIdentificationNumber || '').toUpperCase(),
    stock_number: String(vehicle.sku && /[A-Z]/i.test(vehicle.sku) ? vehicle.sku : stockMatch?.[1] || '').toUpperCase(),
    year: Number(vehicle.vehicleModelDate || vehicle.modelDate) || null,
    make: decodeHtml(vehicle.brand?.name || vehicle.brand || vehicle.manufacturer?.name || ''),
    model: decodeHtml(typeof vehicle.model === 'string' ? vehicle.model : vehicle.model?.name || ''),
    trim: decodeHtml(vehicle.vehicleConfiguration || ''),
    mileage: Number(vehicle.mileageFromOdometer?.value ?? vehicle.mileageFromOdometer) || null,
    price: offer.price != null && offer.price !== '' ? Number(String(offer.price).replace(/[^0-9.]/g, '')) : null,
    currency: offer.priceCurrency || '',
    availability,
    images,
  };
}

// ---------- comparing ----------

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const photoKey = (url) => {
  try {
    return new URL(url).pathname.replace(/\/(\d+)\/[^/]+$/, '/$1').toLowerCase();
  } catch {
    return String(url);
  }
};

/** Field-by-field result: pass | fail | missing (not in our data) | not_shown (not on the website). */
export function compareVehicle(ours, site) {
  const checks = {};
  const set = (field, status, detail = '') => (checks[field] = { status, ...(detail ? { detail } : {}) });
  const both = (field, a, b, same, show = (x) => x) => {
    if (a == null || a === '') return set(field, 'missing', `Not in our data${b != null && b !== '' ? ` (website: ${show(b)})` : ''}`);
    if (b == null || b === '') return set(field, 'not_shown', 'Not published on the vehicle page');
    return same(a, b) ? set(field, 'pass') : set(field, 'fail', `Ours: ${show(a)} · Website: ${show(b)}`);
  };
  both('vin', ours.vin, site.vin, (a, b) => a.toUpperCase() === b.toUpperCase());
  both('stock_number', ours.stock_number, site.stock_number, (a, b) => norm(a) === norm(b));
  both('trim', ours.trim, site.trim || site.name, (a, b) => norm(b).includes(norm(a)) || norm(a).includes(norm(b)));
  const money = (n) => `$${Number(n).toLocaleString('en-CA')}`;
  both('price', ours.price, site.price, (a, b) => Math.abs(Number(a) - Number(b)) < 1, money);
  both('mileage', ours.mileage, site.mileage, (a, b) => Math.abs(Number(a) - Number(b)) <= Math.max(50, Number(b) * 0.01), (n) => `${Number(n).toLocaleString('en-CA')} km`);
  // Photos: we must have some, and they should be the website's photos.
  if (!ours.photos?.length) set('photos', 'missing', 'No photos in our data');
  else if (!site.images.length) set('photos', 'not_shown', 'No photos published on the vehicle page');
  else {
    const siteKeys = new Set(site.images.map(photoKey));
    const shared = ours.photos.filter((p) => siteKeys.has(photoKey(p))).length;
    set('photos', shared ? 'pass' : 'fail', `${ours.photos.length} in our data, ${site.images.length} on the website, ${shared} matching`);
  }
  const siteAvailable = /InStock|InStoreOnly|OnlineOnly|LimitedAvailability|PreOrder/i.test(site.availability || '');
  const siteSold = /SoldOut|OutOfStock|Discontinued/i.test(site.availability || '');
  if (ours.status !== 'available') set('availability', siteAvailable ? 'fail' : 'pass', siteAvailable ? 'Sold/removed here but still for sale on the website' : '');
  else if (siteSold) set('availability', 'fail', `For sale here but ${site.availability} on the website`);
  else if (siteAvailable) set('availability', 'pass');
  else set('availability', 'not_shown', 'Availability not published');
  return checks;
}

const KEY_FIELDS = ['vin', 'stock_number', 'trim', 'price', 'photos', 'availability'];

/**
 * Check up to `limit` vehicles against their pages on the dealership's website and save the report.
 * Vehicles without a detail page address can't be checked (the feed should provide it).
 */
export async function validateInventory({ limit = 10, vehicleIds = null, actor = 'user', delayMs = null } = {}) {
  const dealer = getDealership();
  const pool = (
    vehicleIds?.length
      ? all(`SELECT * FROM vehicles WHERE dealership_id = ? AND id IN (${vehicleIds.map(() => '?').join(',')})`, tenantId(), ...vehicleIds)
      : all(`SELECT * FROM vehicles WHERE dealership_id = ? AND status = 'available' ORDER BY (detail_url = '') ASC, updated_at DESC LIMIT ?`, tenantId(), Math.min(50, limit))
  ).map(presentVehicle);
  if (!pool.length) throw httpError(400, 'No vehicles to check yet. Import or sync the inventory first.');
  const siteHost = (() => {
    try {
      return new URL(dealer.website).host.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  const robotsCache = new Map();
  const results = [];
  let lastFetch = 0;
  for (const v of pool.slice(0, limit)) {
    const base = { vehicle_id: v.id, title: vehicleTitle(v), stock_number: v.stock_number, vin: v.vin, url: v.detail_url };
    if (!v.detail_url) {
      results.push({ ...base, result: 'not_checked', reason: 'No vehicle page address in our data (the inventory feed should include it)', checks: {} });
      continue;
    }
    let url;
    try {
      url = new URL(v.detail_url);
    } catch {
      results.push({ ...base, result: 'not_checked', reason: 'Invalid vehicle page address', checks: {} });
      continue;
    }
    if (!siteHost || url.host.replace(/^www\./, '') !== siteHost) {
      results.push({ ...base, result: 'not_checked', reason: `Only pages on the dealership's website (${siteHost || 'set the website in the profile'}) are checked`, checks: {} });
      continue;
    }
    try {
      if (!robotsCache.has(url.origin)) {
        const r = await fetchPublic(`${url.origin}/robots.txt`, { accept: 'text/plain' }).catch(() => ({ status: 404, text: '' }));
        robotsCache.set(url.origin, r.status === 200 ? parseRobots(r.text) : { rules: [], delaySeconds: null });
      }
      const robots = robotsCache.get(url.origin);
      if (!robotsAllows(robots, url.pathname + url.search)) {
        results.push({ ...base, result: 'not_checked', reason: 'robots.txt does not allow reading this page', checks: {} });
        continue;
      }
      const wait = (delayMs ?? Math.max(10, robots.delaySeconds || 0) * 1000) - (Date.now() - lastFetch);
      if (lastFetch && wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastFetch = Date.now();
      const page = await fetchPublic(url.href);
      if (page.status === 404 || page.status === 410) {
        const checks = { availability: { status: v.status === 'available' ? 'fail' : 'pass', detail: 'The vehicle page no longer exists on the website' } };
        results.push({ ...base, result: v.status === 'available' ? 'fail' : 'pass', checks });
        continue;
      }
      if (page.status !== 200) {
        results.push({ ...base, result: 'not_checked', reason: `Website answered HTTP ${page.status}`, checks: {} });
        continue;
      }
      const site = readVehiclePage(page.text);
      if (!site.found) {
        results.push({ ...base, result: 'not_checked', reason: 'The page has no machine-readable vehicle data', checks: {} });
        continue;
      }
      const checks = compareVehicle(v, site);
      const failed = KEY_FIELDS.filter((f) => ['fail', 'missing'].includes(checks[f]?.status));
      results.push({ ...base, result: failed.length ? 'fail' : 'pass', failed, checks, website: { name: site.name, price: site.price, availability: site.availability, photos: site.images.length } });
    } catch (err) {
      results.push({ ...base, result: 'not_checked', reason: err.message, checks: {} });
    }
  }
  const passed = results.filter((r) => r.result === 'pass').length;
  const failed = results.filter((r) => r.result === 'fail').length;
  const report = { checked_at: new Date().toISOString(), website: siteHost, fields: KEY_FIELDS, results, passed, failed, not_checked: results.length - passed - failed };
  const { lastInsertRowid } = run(
    'INSERT INTO inventory_validations (dealership_id, created_by, passed, failed, report) VALUES (?, ?, ?, ?, ?)',
    tenantId(),
    actor,
    passed,
    failed,
    JSON.stringify(report),
  );
  logActivity(actor, 'inventory.validated', `${passed} passed, ${failed} failed, ${report.not_checked} not checked`);
  return { id: Number(lastInsertRowid), ...report };
}

export function latestValidation() {
  const row = get('SELECT * FROM inventory_validations WHERE dealership_id = ? ORDER BY id DESC LIMIT 1', tenantId());
  return row ? { id: row.id, created_at: row.created_at, created_by: row.created_by, ...parseJson(row.report, {}) } : null;
}
