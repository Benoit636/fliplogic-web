// Create a dealership and its first Dealer Admin, from the server's command line.
//
//   npm run create-dealer -- --preset vw-moncton --admin-email you@dealer.ca
//   npm run create-dealer -- --name "Smith Motors" --admin-email gm@smith.ca [--number 002] [--city ...] [--province NB]
//   npm run create-dealer -- --invite-admin --number 001 --admin-email you@dealer.ca   (new link for an existing dealer)
//
// Prints a single-use setup link (valid 3 days). The admin opens it and chooses their own password.
import { parseArgs } from 'node:util';
import { openDb } from '../src/db.js';
import { config } from '../src/config.js';
import { PRESETS, createDealerWithAdmin, inviteDealerAdmin } from '../src/services/setup.js';

const { values: a } = parseArgs({
  options: {
    preset: { type: 'string' },
    name: { type: 'string' },
    number: { type: 'string' },
    'admin-email': { type: 'string' },
    'invite-admin': { type: 'boolean', default: false },
    address: { type: 'string' },
    city: { type: 'string' },
    province: { type: 'string' },
    'postal-code': { type: 'string' },
    phone: { type: 'string' },
    website: { type: 'string' },
    brands: { type: 'string' },
    timezone: { type: 'string' },
  },
});

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

openDb();
try {
  if (!a['admin-email']) fail('Add --admin-email you@yourdealer.ca (the person who will run the dealership account).');
  let result;
  if (a['invite-admin']) {
    if (!a.number) fail('Add --number with the dealer number, like --number 001');
    result = inviteDealerAdmin(a.number, a['admin-email']);
  } else {
    const preset = a.preset ? PRESETS[a.preset] : null;
    if (a.preset && !preset) fail(`Unknown preset "${a.preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
    const name = a.name || preset?.name;
    if (!name) fail('Add --name "Dealership name" (or --preset vw-moncton).');
    const extra = Object.fromEntries(
      [
        ['address', a.address],
        ['city', a.city],
        ['province', a.province],
        ['postal_code', a['postal-code']],
        ['phone', a.phone],
        ['website', a.website],
        ['brands', a.brands],
        ['timezone', a.timezone],
      ].filter(([, v]) => v !== undefined),
    );
    result = createDealerWithAdmin({
      name,
      dealerNumber: a.number ?? preset?.dealerNumber,
      adminEmail: a['admin-email'],
      profile: { ...(preset?.profile || {}), ...extra },
    });
    console.log(`\n✔ Created Dealer #${result.dealership.dealer_number}: ${result.dealership.name}`);
  }
  if (!/^https:\/\//.test(config.appUrl)) console.warn(`\n⚠ APP_URL is ${config.appUrl}. Set APP_URL to the public https address so this link works for others.`);
  console.log(`\nSetup link for ${a['admin-email']} (Dealer Admin, single use, expires in ${result.expires_in_days} days):\n\n  ${result.invite_url}\n`);
  console.log('Send it only to that person. They open it, choose their own password, and can then invite their staff from More tools → Team.\n');
} catch (err) {
  fail(err.message);
}
