// Inventory integration: authorized feeds (Meta automotive catalog XML/CSV, provider CSV), hourly sync,
// removal of sold vehicles, and never promoting a vehicle that's no longer available.
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import { tenantTest as test } from './helpers.js';
import { get, run } from '../src/db.js';
import { tenantId } from '../src/tenant.js';
import { listVehicles, syncInventoryFeed, listInventorySyncs, downloadFeed } from '../src/services/inventory.js';
import { getDealership, updateDealership, presentDealership } from '../src/services/dealership.js';
import { createPostsFromIdea } from '../src/services/content.js';
import { approvePost, getPost, submitForApproval } from '../src/services/posts.js';
import { tick } from '../src/services/worker.js';

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const listing = ({ id, vin, stock, year, make, model, trim, km, price, state = 'USED', avail = 'AVAILABLE', photos = 2 }) => `
  <listing>
    <vehicle_id>${id}</vehicle_id><vin>${vin}</vin>${stock ? `<stock_number>${stock}</stock_number>` : ''}
    <url>https://www.vwmoncton.com/used/${year}-${make}-${model}-id${id}.html</url>
    <title>${year} ${make} ${model} ${trim}</title><make>${make}</make><model>${model}</model><year>${year}</year><trim>${trim}</trim>
    <mileage><value>${km}</value><unit>KM</unit></mileage>
    ${Array.from({ length: photos }, (_, i) => `<image><url>https://imagescdn.d2cmedia.ca/x/1919/${id}/${i + 1}/${make}-${model}-${year}.jpg</url></image>`).join('')}
    <price>${price} CAD</price><state_of_vehicle>${state}</state_of_vehicle><availability>${avail}</availability>
  </listing>`;
const CARS = [
  { id: 14465391, vin: '19UDE2F79NA800205', stock: '800205V', year: 2022, make: 'Acura', model: 'ILX', trim: 'Premium', km: 63683, price: 24523 },
  { id: 14519800, vin: 'WAUAUGFF0P1000001', stock: '000001A', year: 2023, make: 'Audi', model: 'A3', trim: 'Komfort', km: 21000, price: 36995 },
  { id: 14119111, vin: '1V2HR2CA5SC000103', stock: 'D1103', year: 2026, make: 'Volkswagen', model: 'Atlas', trim: 'Highline', km: 4500, price: 58995, state: 'DEMO' },
  { id: 14499203, vin: '1V2FR2CA5TC000203', stock: 'N0203', year: 2027, make: 'Volkswagen', model: 'Atlas', trim: 'Comfortline', km: 10, price: 52495, state: 'NEW' },
];
const feed = (cars) => `<?xml version="1.0" encoding="UTF-8"?><listings><title>Volkswagen Moncton</title>${cars.map(listing).join('')}</listings>`;

function serve(body, { status = 200, checkAuth } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {}, redirect: init.redirect });
    if (checkAuth && init.headers?.authorization !== checkAuth) return new Response('denied', { status: 401 });
    return new Response(typeof body === 'function' ? body() : body, { status, headers: { 'content-type': 'application/xml' } });
  };
  return calls;
}

test('Meta automotive catalog feed (as D2C Media and most dealer websites provide it) imports new, used and demo vehicles', async () => {
  updateDealership({ inventory_feed_url: 'https://partner:s3cret@93.184.216.34/feeds/1919/facebook.xml' });
  const calls = serve(feed(CARS), { checkAuth: `Basic ${Buffer.from('partner:s3cret').toString('base64')}` });
  const r = await syncInventoryFeed(getDealership(), { trigger: 'manual' });
  assert.equal(r.format, 'meta-xml');
  assert.deepEqual([r.created, r.errors.length], [4, 0]);
  assert.equal(calls[0].url, 'https://93.184.216.34/feeds/1919/facebook.xml', 'credentials are sent as a header, not in the address');
  assert.equal(calls[0].redirect, 'manual');
  const acura = listVehicles({ q: '800205V' })[0];
  assert.deepEqual(
    [acura.vin, acura.stock_number, acura.year, acura.make, acura.model, acura.trim, acura.mileage, acura.price, acura.condition, acura.status, acura.source],
    ['19UDE2F79NA800205', '800205V', 2022, 'Acura', 'ILX', 'Premium', 63683, 24523, 'used', 'available', 'feed'],
  );
  assert.equal(acura.detail_url, 'https://www.vwmoncton.com/used/2022-Acura-ILX-id14465391.html');
  assert.equal(acura.photos.length, 2);
  const demo = listVehicles({ q: 'D1103' })[0];
  assert.deepEqual([demo.condition, demo.is_demo, demo.mileage], ['new', true, 4500]);
  assert.equal(listVehicles({ q: 'N0203' })[0].is_demo, false);
  const [sync] = listInventorySyncs();
  assert.deepEqual([sync.ok, sync.trigger, sync.format, sync.created], [1, 'manual', 'meta-xml', 4]);
});

test('the feed address is stored encrypted and never sent to the browser in full', () => {
  updateDealership({ inventory_feed_url: 'https://feeds.example.ca/export?key=TOP-SECRET-KEY' });
  const raw = get('SELECT inventory_feed_url FROM dealerships WHERE id = ?', tenantId()).inventory_feed_url;
  assert.match(raw, /^enc1:/);
  assert.ok(!raw.includes('TOP-SECRET'));
  const shown = presentDealership(getDealership());
  assert.equal(shown.inventory_feed_url, 'https://feeds.example.ca/…');
  assert.equal(shown.inventory_feed_configured, true);
  assert.ok(!JSON.stringify(shown).includes('TOP-SECRET'));
  assert.throws(() => updateDealership({ inventory_sync_minutes: 5 }), /15 to 1440/);
});

test('sold or removed vehicles leave the feed, their posts are withdrawn, and they can never be promoted', async () => {
  updateDealership({ inventory_feed_url: 'https://93.184.216.34/feed.xml', feed_marks_sold: true });
  serve(feed(CARS));
  await syncInventoryFeed(getDealership());
  const audi = listVehicles({ q: 'Audi' })[0];
  const { posts } = await createPostsFromIdea({ postType: 'used_featured', vehicleId: audi.id, platforms: ['facebook'] });
  submitForApproval(posts[0].id);

  serve(feed(CARS.filter((c) => c.make !== 'Audi'))); // the Audi sold overnight
  const r = await syncInventoryFeed(getDealership());
  assert.equal(r.marked_sold, 1);
  const gone = listVehicles({ q: 'Audi', status: 'all' })[0];
  assert.equal(gone.status, 'sold');
  assert.ok(gone.removed_at);
  assert.equal(getPost(posts[0].id).status, 'rejected');
  assert.match(getPost(posts[0].id).error, /no longer in the inventory/);
  assert.throws(() => approvePost(posts[0].id), /no longer available/);
  await assert.rejects(createPostsFromIdea({ postType: 'used_featured', vehicleId: gone.id, platforms: ['facebook'] }), /no longer available/);
  assert.ok(!listVehicles({ status: 'available' }).some((v) => v.id === gone.id), 'not offered in the vehicle picker');

  // Availability in the feed is respected too.
  serve(feed(CARS.filter((c) => c.make !== 'Audi').map((c) => (c.make === 'Acura' ? { ...c, avail: 'NOT_AVAILABLE' } : c))));
  await syncInventoryFeed(getDealership());
  assert.equal(listVehicles({ q: 'Acura', status: 'all' })[0].status, 'sold');
});

test('a broken or partial feed is recorded and does not wipe the inventory', async () => {
  updateDealership({ inventory_feed_url: 'https://93.184.216.34/feed.xml', feed_marks_sold: true });
  serve(feed(CARS));
  await syncInventoryFeed(getDealership());
  serve('Service unavailable', { status: 503 });
  await assert.rejects(syncInventoryFeed(getDealership()), /HTTP 503/);
  const d = getDealership();
  assert.equal(d.feed_failures, 1);
  assert.match(d.feed_last_error, /503/);
  assert.equal(listInventorySyncs()[0].ok, 0);
  assert.equal(listVehicles({ status: 'available' }).filter((v) => v.source === 'feed').length, 4, 'nothing removed');
  serve(feed([]));
  await assert.rejects(syncInventoryFeed(getDealership()), /No vehicles found/);
});

test('feeds can only come from public addresses, including after redirects', async () => {
  await assert.rejects(downloadFeed('http://127.0.0.1/feed.xml'), /private network/);
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
  await assert.rejects(downloadFeed('https://93.184.216.34/feed.xml'), /private network/);
});

test('the worker syncs each feed every 60 minutes by default', async () => {
  updateDealership({ inventory_feed_url: 'https://93.184.216.34/feed.xml' });
  const calls = serve(feed(CARS));
  await tick(); // first tick: never synced → sync now
  const after = calls.length;
  assert.ok(after >= 1);
  await tick();
  assert.equal(calls.filter((c) => c.url.includes('feed.xml')).length, after, 'not again within the hour');
  run('UPDATE dealerships SET feed_last_synced_at = ? WHERE id = ?', new Date(Date.now() - 61 * 60_000).toISOString(), tenantId());
  for (let i = 0; i < 10; i++) await tick(); // the feed check runs every 10th tick
  assert.ok(calls.filter((c) => c.url.includes('feed.xml')).length > after, 'synced again after 60 minutes');
});
