// Compare imported vehicles with the dealership's website and print a pass/fail report.
//   npm run validate-inventory -- --number 001 [--limit 10]
// Reads one page per vehicle on the dealership's own website, respecting robots.txt and its crawl delay.
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { runWithTenant } from '../src/tenant.js';
import { getDealershipByNumber } from '../src/services/dealership.js';
import { validateInventory } from '../src/services/validation.js';

const { values: a } = parseArgs({ options: { number: { type: 'string' }, limit: { type: 'string', default: '10' } } });
openDb();
const dealer = a.number && getDealershipByNumber(a.number);
if (!dealer) {
  console.error('Add --number with the dealer number, like --number 001');
  process.exit(1);
}
const report = await runWithTenant(dealer.id, () => validateInventory({ limit: Number(a.limit), actor: 'cli' }));
const mark = { pass: '✔', fail: '✖', missing: '…', not_shown: '–' };
console.log(`\nInventory check for Dealer #${dealer.dealer_number} ${dealer.name} against ${report.website} (${report.checked_at})`);
console.log(`${report.passed} passed · ${report.failed} failed · ${report.not_checked} not checked\n`);
for (const r of report.results) {
  console.log(`${r.result === 'pass' ? '✔ PASS' : r.result === 'fail' ? '✖ FAIL' : '– NOT CHECKED'}  ${r.title}  (stock ${r.stock_number || '—'}, VIN ${r.vin || '—'})`);
  if (r.reason) console.log(`        ${r.reason}`);
  for (const [field, c] of Object.entries(r.checks)) console.log(`        ${mark[c.status] || '?'} ${field}${c.detail ? `: ${c.detail}` : ''}`);
}
console.log('\n✔ matches  ✖ differs  … missing in our data  – not published on the website\n');
