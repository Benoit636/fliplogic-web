import { openDb } from '../src/db.js';
import { updateDealership } from '../src/services/dealership.js';
import { createAccount } from '../src/services/accounts.js';
import { createVehicle } from '../src/services/inventory.js';

/** Fresh in-memory database with a small demo dealership. */
export function setupDb() {
  openDb(':memory:');
  updateDealership({ name: 'Test Motors', city: 'Moncton', phone: '555-0100', default_hashtags: '#TestMotors' });
  createAccount({ platform: 'facebook', display_name: 'Test Motors' });
  createAccount({ platform: 'instagram', display_name: '@testmotors' });
  const truck = createVehicle({ year: 2022, make: 'Ford', model: 'F-150', trim: 'XLT', price: 44900, mileage: 58000, photos: ['https://img.example/f150.jpg'] });
  const suv = createVehicle({ year: 2024, make: 'Volkswagen', model: 'Tiguan', price: 36495, mileage: 18000 });
  return { truck, suv };
}
