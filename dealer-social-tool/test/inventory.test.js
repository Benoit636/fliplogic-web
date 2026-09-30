import assert from 'node:assert/strict';
import { tenantTest as test } from './helpers.js';
import { importVehiclesCsv, listVehicles, parseCsv, updateVehicle, nextPriceDrop, nextVehicleToFeature, markVehiclePosted } from '../src/services/inventory.js';


test('parseCsv handles quotes, escaped quotes and CRLF', (fixtures) => {
  const rows = parseCsv('a,b,c\r\n"1,5","say ""hi""",x\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1,5', 'say "hi"', 'x']]);
});

test('CSV import maps common DMS headers and updates existing vehicles by VIN', (fixtures) => {
  const csv = [
    'Stock #,VIN,Year,Make,Model,Trim,Internet Price,Odometer,Exterior Color,Options,Photo URLs',
    'A100,1FTFW1E50NFA00001,2022,Ram,1500,Big Horn,"$41,500","35,000 km",White,"Tow pkg, 4x4",https://img/1.jpg|https://img/2.jpg',
    'A101,,2021,Kia,Soul,EX,19995,50000,Blue,,',
    'A102,,2020,,NoMake,,1,1,,,',
  ].join('\n');
  const first = importVehiclesCsv(csv);
  assert.equal(first.created, 2);
  assert.equal(first.errors.length, 1);
  const ram = listVehicles({ q: 'Ram' })[0];
  assert.equal(ram.price, 41500);
  assert.equal(ram.mileage, 35000);
  assert.deepEqual(ram.photos, ['https://img/1.jpg', 'https://img/2.jpg']);

  const second = importVehiclesCsv('VIN,Make,Model,Price\n1FTFW1E50NFA00001,Ram,1500,39900');
  assert.equal(second.updated, 1);
  assert.equal(listVehicles({ q: 'Ram' })[0].previous_price, 41500);
});

test('price drops and featured rotation', (fixtures) => {
  const [suv, truck] = listVehicles();
  assert.equal(nextPriceDrop(), undefined);
  updateVehicle(truck.id, { price: 42000 });
  assert.equal(nextPriceDrop().id, truck.id);

  markVehiclePosted(truck.id);
  assert.equal(nextVehicleToFeature().id, suv.id, 'never-featured vehicles come first');
});
