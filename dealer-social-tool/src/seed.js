// Loads a demo dealership so you can explore every screen: `npm run seed`
import { openDb, get, run } from './db.js';
import { updateDealership } from './services/dealership.js';
import { createAccount } from './services/accounts.js';
import { createVehicle } from './services/inventory.js';
import { createRule } from './services/autopilot.js';

openDb();

if (get('SELECT COUNT(*) AS n FROM vehicles').n > 0) {
  console.log('Database already has inventory — skipping seed. Delete the database file to start fresh.');
  process.exit(0);
}

updateDealership({
  name: 'Riverside Motors',
  brands: 'Volkswagen, pre-owned all makes',
  city: 'Moncton, NB',
  address: '123 Main Street',
  phone: '(506) 555-0123',
  website: 'https://www.example-dealer.com',
  brand_voice: 'Warm, upbeat and neighbourly. Proudly local. Straight talk, no pressure. A little playful with emojis on Instagram and TikTok.',
  default_hashtags: '#RiversideMotors #Moncton',
  call_to_action: 'Book your test drive today — call us or send a DM!',
});

for (const [platform, display_name] of [
  ['facebook', 'Riverside Motors'],
  ['instagram', '@riversidemotors'],
  ['google_business', 'Riverside Motors – Moncton'],
  ['tiktok', '@riversidemotors'],
]) {
  createAccount({ platform, display_name, mode: 'simulated' });
}

const photo = (seed) => `https://picsum.photos/seed/${seed}/1080/1080`;
const vehicles = [
  { year: 2025, make: 'Volkswagen', model: 'Atlas', trim: 'Execline', condition: 'new', price: 62995, mileage: 12, exterior_color: 'Pure Grey', features: '3rd row seating, 4MOTION AWD, panoramic sunroof, Harman Kardon audio', photos: [photo('atlas')] },
  { year: 2024, make: 'Volkswagen', model: 'Tiguan', trim: 'Comfortline', condition: 'certified', price: 36495, mileage: 18200, exterior_color: 'Kings Red', features: 'AWD, heated seats, Apple CarPlay, adaptive cruise', photos: [photo('tiguan')] },
  { year: 2022, make: 'Ford', model: 'F-150', trim: 'XLT', condition: 'used', price: 44900, mileage: 58000, exterior_color: 'Agate Black', features: '4x4, 5.0L V8, tow package, crew cab', photos: [photo('f150')] },
  { year: 2023, make: 'Toyota', model: 'RAV4', trim: 'Hybrid XLE', condition: 'used', price: 38750, mileage: 31000, exterior_color: 'Blueprint', features: 'Hybrid AWD, 6.0L/100km, blind spot monitor', photos: [photo('rav4')] },
  { year: 2021, make: 'Honda', model: 'Civic', trim: 'EX', condition: 'used', price: 23995, mileage: 64000, exterior_color: 'Platinum White', features: 'Sunroof, heated seats, Honda Sensing', photos: [photo('civic')] },
  { year: 2025, make: 'Volkswagen', model: 'ID.4', trim: 'Pro S', condition: 'new', price: 54995, mileage: 8, exterior_color: 'Aurora Red', features: 'All-electric, up to 400 km range, DC fast charging, heat pump', photos: [photo('id4')] },
  { year: 2020, make: 'Jeep', model: 'Wrangler', trim: 'Sahara', condition: 'used', price: 39900, mileage: 72000, exterior_color: 'Sarge Green', features: 'Removable top, 4x4, LED lights', photos: [photo('wrangler')] },
];
const created = vehicles.map(createVehicle);
// One sold car so the "sold celebration" autopilot has something to do.
run(`UPDATE vehicles SET status = 'sold' WHERE id = ?`, created[4].id);

createRule({ name: 'Daily vehicle spotlight', post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'], days_of_week: [1, 2, 3, 4, 5, 6], time_of_day: '10:15' });
createRule({ name: 'New arrivals', post_type: 'new_arrival', platforms: ['facebook', 'instagram', 'tiktok'], days_of_week: [2, 4], time_of_day: '18:30' });
createRule({ name: 'Sold celebrations', post_type: 'sold_celebration', platforms: ['facebook', 'instagram'], days_of_week: [5], time_of_day: '16:00' });
createRule({ name: 'Weekly service tip', post_type: 'service_tip', platforms: ['facebook', 'google_business'], days_of_week: [3], time_of_day: '09:30', enabled: false });

console.log(`Seeded Riverside Motors demo: ${created.length} vehicles, 4 simulated accounts, 4 autopilot rules.`);
