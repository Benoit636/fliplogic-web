import { test } from 'node:test';
import { openDb } from '../src/db.js';
import { enterTenant } from '../src/tenant.js';
import { signup } from '../src/services/auth.js';
import { updateDealership } from '../src/services/dealership.js';
import { createAccount } from '../src/services/accounts.js';
import { createVehicle } from '../src/services/inventory.js';

/** Fresh in-memory database with one demo dealership, selected as the current tenant. */
export function setupDb() {
  openDb(':memory:');
  return addDealership('owner@test.example', 'Test Motors');
}

/** Another dealership in the same database (to test isolation). Becomes the current tenant. */
export function addDealership(email, name) {
  const { user, dealership, token } = signup({ name: 'Owner', email, password: 'password123', dealershipName: name, timezone: 'America/Moncton' });
  enterTenant(dealership.id);
  updateDealership({ city: 'Moncton', phone: '555-0100', default_hashtags: '#TestMotors' });
  createAccount({ platform: 'facebook', display_name: name });
  createAccount({ platform: 'instagram', display_name: '@testmotors' });
  const truck = createVehicle({
    year: 2022,
    make: 'Ford',
    model: 'F-150',
    trim: 'XLT',
    price: 44900,
    mileage: 58000,
    photos: ['https://img.example/f150.jpg'],
  });
  const suv = createVehicle({ year: 2024, make: 'Volkswagen', model: 'Tiguan', price: 36495, mileage: 18000 });
  return { truck, suv, user, dealership, token };
}

/** A test that starts with a fresh database and tenant. */
export function tenantTest(name, fn) {
  return test(name, async () => fn(setupDb()));
}
