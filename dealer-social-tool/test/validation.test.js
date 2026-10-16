// Website validation: compare imported vehicles with the dealership's own vehicle pages (schema.org data).
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import { tenantTest as test } from './helpers.js';
import { updateDealership } from '../src/services/dealership.js';
import { importVehiclesCsv, listVehicles } from '../src/services/inventory.js';
import { validateInventory, latestValidation, parseRobots, robotsAllows, readVehiclePage } from '../src/services/validation.js';

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const ROBOTS = `# Crawl-Delay directive: crawlers should wait 10 seconds
User-agent: *
Disallow: /json/*
Disallow: /used/detail.html
Allow: /
User-agent: OrangeBot
Disallow: /`;

// Same structure as the real vwmoncton.com (D2C Media) vehicle pages.
const page = ({ name, vin, sku, trim, km, price, avail = 'InStock', photos, stock }) => `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":["AutoDealer"],"name":"Volkswagen Moncton"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Product","Vehicle","Car"],"name":"${name}","sku":"${sku}",
"vehicleIdentificationNumber":"${vin}","vehicleConfiguration":"${trim}","image":${JSON.stringify(photos)},
"mileageFromOdometer":{"@type":"QuantitativeValue","value":${km},"unitCode":"KMT"},
"offers":{"@type":"Offer","availability":"https://schema.org/${avail}","priceCurrency":"CAD","price":${price}}}</script></head>
<body><div class="stock">Stock:${stock}</div></body></html>`;
const photo = (id, n) => `https://imagescdn.d2cmedia.ca/cb6/1919/${id}/${n}/car.jpg`;

function site(pages) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname);
    if (u.pathname === '/robots.txt') return new Response(ROBOTS, { status: 200 });
    if (pages[u.pathname]) return new Response(pages[u.pathname], { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('Not found', { status: 404 });
  };
  return calls;
}

test('robots.txt rules are respected', () => {
  const r = parseRobots(ROBOTS);
  assert.equal(robotsAllows(r, '/used/2022-Acura-ILX-id14465391.html'), true);
  assert.equal(robotsAllows(r, '/json/newcarsdetails_en.json'), false);
  assert.equal(robotsAllows(r, '/used/detail.html'), false);
  assert.equal(robotsAllows(parseRobots('User-agent: *\nDisallow: /'), '/used/x.html'), false);
});

test('validation report: pass, price/stock discrepancies, missing photos, sold on the website, robots and off-site pages', async () => {
  updateDealership({ website: 'https://www.vwmoncton.com' });
  const base = 'https://93.184.216.34';
  const url = (p) => `${base}${p}`;
  // Our imported data (as an authorized feed would provide it).
  importVehiclesCsv(
    [
      'Stock,VIN,Year,Make,Model,Trim,Mileage,Price,New/Used,Photos,URL',
      `800205V,19UDE2F79NA800205,2022,Acura,ILX,Premium,63683,24523,Used,${photo(1, 1)}|${photo(1, 2)},${url('/used/2022-Acura-ILX-id1.html')}`,
      `000001A,WAUAUGFF0P1000001,2023,Audi,A3,Komfort,21000,36995,Used,${photo(2, 1)},${url('/used/2023-Audi-A3-id2.html')}`,
      `,1V2HR2CA5SC000103,2026,Volkswagen,Atlas,Highline,4500,58995,New,,${url('/demos/2026-Volkswagen-Atlas-id3.html')}`,
      `S4,1V2FR2CA5TC000204,2027,Volkswagen,Taos,Trendline,10,32995,New,${photo(4, 1)},${url('/new/inventory/2027-Volkswagen-Taos-id4.html')}`,
      `S5,1V2FR2CA5TC000205,2027,Volkswagen,Jetta,GLI,10,39995,New,${photo(5, 1)},${url('/used/detail.html')}`,
      `S6,1V2FR2CA5TC000206,2027,Volkswagen,Golf,R,10,49995,New,${photo(6, 1)},https://other-dealer.example.com/car-6.html`,
      `S7,1V2FR2CA5TC000207,2027,Volkswagen,ID.4,Pro,10,54995,New,${photo(7, 1)},`,
    ].join('\n'),
  );
  updateDealership({ website: base });
  const calls = site({
    '/used/2022-Acura-ILX-id1.html': page({ name: '2022 Acura ILX Premium', vin: '19UDE2F79NA800205', sku: '1', trim: 'Premium', km: 63683, price: 24523, photos: [photo(1, 1), photo(1, 2)], stock: '800205V' }),
    '/used/2023-Audi-A3-id2.html': page({ name: '2023 Audi A3 Komfort', vin: 'WAUAUGFF0P1000001', sku: '2', trim: 'Komfort', km: 21000, price: 35995, photos: [photo(2, 1)], stock: '000002A' }),
    '/demos/2026-Volkswagen-Atlas-id3.html': page({ name: '2026 Volkswagen Atlas Highline', vin: '1V2HR2CA5SC000103', sku: '3', trim: 'Highline', km: 4500, price: 58995, photos: [photo(3, 1)], stock: 'D1103' }),
    '/new/inventory/2027-Volkswagen-Taos-id4.html': page({ name: '2027 Volkswagen Taos Trendline', vin: '1V2FR2CA5TC000204', sku: '4', trim: 'Trendline', km: 10, price: 32995, avail: 'SoldOut', photos: [photo(4, 1)], stock: 'S4' }),
  });
  const r = await validateInventory({ limit: 10, delayMs: 0 });
  const by = (model) => r.results.find((x) => x.title.includes(model));

  assert.equal(by('ILX').result, 'pass');
  assert.deepEqual(Object.values(by('ILX').checks).map((c) => c.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);

  const audi = by('A3');
  assert.equal(audi.result, 'fail');
  assert.deepEqual(audi.failed, ['stock_number', 'price']);
  assert.match(audi.checks.price.detail, /Ours: \$36,995 · Website: \$35,995/);

  const atlas = by('Atlas');
  assert.equal(atlas.result, 'fail', 'missing information is flagged');
  assert.equal(atlas.checks.stock_number.status, 'missing');
  assert.match(atlas.checks.stock_number.detail, /website: D1103/);
  assert.equal(atlas.checks.photos.status, 'missing');

  assert.equal(by('Taos').checks.availability.status, 'fail', 'sold on the website but available here');

  assert.equal(by('Jetta').result, 'not_checked');
  assert.match(by('Jetta').reason, /robots\.txt/);
  assert.ok(!calls.includes('/used/detail.html'), 'disallowed pages are never requested');
  assert.match(by('Golf').reason, /Only pages on the dealership's website/);
  assert.match(by('ID.4').reason, /No vehicle page address/);

  // 3 above + the 2 test vehicles added by hand without a page address.
  assert.deepEqual([r.passed, r.failed, r.not_checked], [1, 3, 5]);
  assert.equal(calls.filter((p) => p === '/robots.txt').length, 1, 'robots.txt read once');
  assert.equal(latestValidation().failed, 3);
  assert.equal(listVehicles({ status: 'all' }).length, 9);
});

test('a vehicle page that no longer exists means the vehicle is gone from the website', async () => {
  updateDealership({ website: 'https://93.184.216.34' });
  importVehiclesCsv(`Stock,VIN,Make,Model,Price,Photos,URL\nX1,1V2FR2CA5TC000209,Volkswagen,Tiguan,39995,https://i/1.jpg,https://93.184.216.34/used/gone-id9.html`);
  site({});
  const r = await validateInventory({ limit: 1, delayMs: 0, vehicleIds: [listVehicles({ q: 'X1' })[0].id] });
  assert.equal(r.results[0].result, 'fail');
  assert.match(r.results[0].checks.availability.detail, /no longer exists/);
  assert.equal(readVehiclePage('<html>no data</html>').found, false);
});
