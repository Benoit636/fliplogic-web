import assert from 'node:assert/strict';
import { tenantTest as test } from './helpers.js';
import { importVehiclesCsv, listVehicles, parseCsv, updateVehicle, nextPriceDrop, nextVehicleToFeature, markVehiclePosted } from '../src/services/inventory.js';

test('parseCsv handles quotes, escaped quotes and CRLF', (fixtures) => {
  const rows = parseCsv('a,b,c\r\n"1,5","say ""hi""",x\r\n');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['1,5', 'say "hi"', 'x'],
  ]);
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

// ---- Phase 2: real inventory ----
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../src/db.js';
import { createVehicle } from '../src/services/inventory.js';
import { readInventoryCsv, normaliseVehicle, isValidVin } from '../src/shared/inventory-csv.js';
import { addDealership } from './helpers.js';
import { enterTenant } from '../src/tenant.js';

const DMS = [
  'Stock #,VIN,Year,Make,Model,Trim,Odometer,Internet Price,New/Used,Exterior Color,Options,Photo URLs,Customer Name',
  'V100,3VV2B7AX5RM000001,2024,Volkswagen,Tiguan,Comfortline,12,"$39,995",New,White,"Heated seats",https://img/v100.jpg,Jane Buyer',
  'U200,1VWSA7A39NC000002,2022,Volkswagen,Jetta,Highline,"41,250 km","$27,495",Used,Grey,,https://img/u200a.jpg|https://img/u200b.jpg,',
  'U300,,2021,Toyota,RAV4,LE,58900,29900,Certified,Blue,,,',
].join('\n');

test('re-importing the same export updates vehicles instead of duplicating them', () => {
  const before = listVehicles({ status: 'all' }).length;
  const first = importVehiclesCsv(DMS);
  assert.deepEqual([first.created, first.updated, first.unchanged, first.errors.length], [3, 0, 0, 0]);
  assert.deepEqual(first.ignored_columns, ['Customer Name'], 'unknown columns (like customer names) are ignored');
  assert.equal(JSON.stringify(listVehicles({ status: 'all' })).includes('Jane Buyer'), false);

  const again = importVehiclesCsv(DMS);
  assert.deepEqual([again.created, again.updated, again.unchanged], [0, 0, 3]);
  assert.equal(listVehicles({ status: 'all' }).length, before + 3);

  // Next day: price drop on the Jetta, VIN typed in lower case, U300 now has a VIN, a new arrival.
  const next = DMS.replace('"$27,495"', '"$26,495"').replace('1VWSA7A39NC000002', '1vwsa7a39nc000002').replace('U300,,', 'U300,2T3P1RFV5MC000003,') + '\nN400,3VWC57BU5RM000004,2024,Volkswagen,Jetta,Comfortline,8,31995,New,Red,,,';
  const r = importVehiclesCsv(next);
  assert.deepEqual([r.created, r.updated, r.unchanged], [1, 2, 1]);
  assert.deepEqual(r.rows.find((x) => x.stock_number === 'U200').changes, ['price']);
  const jetta = listVehicles({ q: 'U200' })[0];
  assert.equal(jetta.price, 26495);
  assert.equal(jetta.previous_price, 27495);
  assert.equal(listVehicles({ q: 'U300' })[0].vin, '2T3P1RFV5MC000003', 'matched by stock #, VIN added');
  assert.equal(listVehicles({ status: 'all' }).length, before + 4);
});

test('fields: stock #, VIN, year, make, model, trim, mileage, price, new/used and photos', () => {
  importVehiclesCsv(DMS);
  const t = listVehicles({ q: 'V100' })[0];
  assert.deepEqual(
    [t.stock_number, t.vin, t.year, t.make, t.model, t.trim, t.mileage, t.price, t.condition, t.photos],
    ['V100', '3VV2B7AX5RM000001', 2024, 'Volkswagen', 'Tiguan', 'Comfortline', 12, 39995, 'new', ['https://img/v100.jpg']],
  );
  const j = listVehicles({ q: 'U200' })[0];
  assert.equal(j.mileage, 41250);
  assert.deepEqual(j.photos, ['https://img/u200a.jpg', 'https://img/u200b.jpg']);
  assert.equal(listVehicles({ q: 'U300' })[0].condition, 'certified');
});

test('French Excel export: semicolons, accents, BOM and "41 500,00 $" prices', () => {
  const fr = '﻿No de stock;NIV;Année;Marque;Modèle;Version;Kilométrage;Prix;Neuf/Usagé;Couleur\nF1;3VV2B7AX5RM000009;2023;Volkswagen;Atlas;Highline;22 500;41 500,00 $;Usagé;Noir\nF2;;2025;Volkswagen;ID.4;Pro;10;54 995 $;Neuf;Bleu';
  const r = importVehiclesCsv(fr);
  assert.equal(r.created, 2, JSON.stringify(r.errors));
  const atlas = listVehicles({ q: 'F1' })[0];
  assert.deepEqual([atlas.year, atlas.model, atlas.trim, atlas.mileage, atlas.price, atlas.condition], [2023, 'Atlas', 'Highline', 22500, 41500, 'used']);
  assert.equal(listVehicles({ q: 'F2' })[0].condition, 'new');
});

test('bad rows are skipped with a reason; duplicates inside the file are caught', () => {
  const r = importVehiclesCsv(
    [
      'Stock,VIN,Year,Make,Model,Price',
      'A1,1FTFW1E50NFA00001,2022,Ford,F-150,40000',
      'A2,NOTAVIN,2022,Ford,Ranger,30000',
      'A3,,1890,Ford,Model T,1',
      'A1,,2022,Ford,F-150,39000',
      'A4,1FTFW1E50NFA00001,2022,Ford,F-150,38000',
      'A5,,2022,,Escape,1',
    ].join('\n'),
  );
  assert.equal(r.created, 1);
  assert.equal(r.duplicates_in_file, 2);
  const reasons = r.errors.map((e) => `${e.row}: ${e.error}`).join('\n');
  assert.match(reasons, /3: VIN "NOTAVIN" isn't valid/);
  assert.match(reasons, /4: Year must be between/);
  assert.match(reasons, /5: Same vehicle as line 2/);
  assert.match(reasons, /6: Same vehicle as line 2/);
  assert.match(reasons, /7: Make and model are required/);
});

test('a VIN and stock # that point at two different vehicles is refused, not merged', () => {
  importVehiclesCsv('Stock,VIN,Make,Model\nB1,1FTFW1E50NFA00011,Ford,F-150\nB2,1FTFW1E50NFA00022,Ford,Ranger');
  const r = importVehiclesCsv('Stock,VIN,Make,Model\nB2,1FTFW1E50NFA00011,Ford,F-150');
  assert.equal(r.updated, 0);
  assert.match(r.errors[0].error, /VIN matches .*F-150 but stock #B2 belongs to .*Ranger/);
  const r2 = importVehiclesCsv('Stock,VIN,Make,Model\nB1,1FTFW1E50NFA00099,Ford,F-150');
  assert.match(r2.errors[0].error, /Stock #B1 is already used by .*VIN 1FTFW1E50NFA00011/);
});

test('preview (dry run) saves nothing; "mark missing as sold" only removes imported vehicles that left the file', () => {
  const before = listVehicles({ status: 'all' }).length; // 2 vehicles added by hand in the fixtures
  const preview = importVehiclesCsv(DMS, { dryRun: true });
  assert.equal(preview.created, 3);
  assert.equal(listVehicles({ status: 'all' }).length, before, 'nothing saved');
  importVehiclesCsv(DMS);
  const withoutJetta = DMS.split('\n').filter((l) => !l.startsWith('U200')).join('\n') + '\nN500,3VWC57BU5RM000005,2024,Volkswagen,Taos,Trendline,5,32995,New,Blue,,,';
  const dry = importVehiclesCsv(withoutJetta, { dryRun: true, markMissingSold: true });
  assert.equal(dry.marked_sold, 1, 'only the Jetta left the file; vehicles added by hand are never removed');
  assert.equal(listVehicles({ status: 'sold' }).length, 0);
  importVehiclesCsv(withoutJetta, { markMissingSold: true });
  const jetta = listVehicles({ q: 'U200', status: 'all' })[0];
  assert.equal(jetta.status, 'sold');
  assert.ok(jetta.removed_at);
  assert.equal(listVehicles({ status: 'available' }).length, before + 3);
  // It comes back if it reappears in the file.
  const back = importVehiclesCsv(DMS + '\nN500,3VWC57BU5RM000005,2024,Volkswagen,Taos,Trendline,5,32995,New,Blue,,,', { markMissingSold: true });
  assert.equal(back.restored, 1);
  assert.equal(listVehicles({ q: 'U200' })[0].status, 'available');
  const tiny = importVehiclesCsv('Stock,Make,Model\nZ1,Kia,Soul', { markMissingSold: true, dryRun: true });
  assert.equal(tiny.marked_sold, 0);
  assert.match(tiny.warning, /fewer than 3/);
});

test('an incomplete feed never wipes out the lot', () => {
  const rows = Array.from({ length: 12 }, (_, i) => `S${i},Volkswagen,Jetta,${30000 + i}`);
  importVehiclesCsv(['Stock,Make,Model,Price', ...rows].join('\n'));
  const partial = importVehiclesCsv(['Stock,Make,Model,Price', ...rows.slice(0, 3)].join('\n'), { markMissingSold: true });
  assert.equal(partial.marked_sold, 0);
  assert.match(partial.warning, /9 of 12 vehicles are missing/);
});

test('adding or editing a vehicle by hand cannot duplicate a VIN or stock #', (a) => {
  createVehicle({ make: 'VW', model: 'Golf', vin: '3vwc57bu5rm000004', stock_number: 'g1' });
  assert.throws(() => createVehicle({ make: 'VW', model: 'Golf R', vin: '3VWC57BU5RM000004' }), /already in inventory/);
  assert.throws(() => createVehicle({ make: 'VW', model: 'GTI', stock_number: 'G1' }), /already used/);
  assert.throws(() => updateVehicle(a.truck.id, { stock_number: 'G1' }), /already used/);
  assert.throws(() => createVehicle({ make: 'VW', model: 'Golf', vin: 'short' }), /isn't valid/);
  // Another dealership may have the same VIN (it's their own inventory).
  addDealership('owner@b.example', 'B Motors');
  assert.equal(createVehicle({ make: 'VW', model: 'Golf', vin: '3VWC57BU5RM000004' }).vin, '3VWC57BU5RM000004');
  enterTenant(a.dealership.id);
});

test('search: every word must match, across stock #, VIN, year, make, model and trim', () => {
  importVehiclesCsv(DMS);
  assert.deepEqual(listVehicles({ q: '2022 jetta' }).map((v) => v.stock_number), ['U200']);
  assert.deepEqual(listVehicles({ q: 'C000002' }).map((v) => v.stock_number), ['U200'], 'end of a VIN');
  assert.deepEqual(listVehicles({ q: 'volkswagen highline' }).map((v) => v.stock_number), ['U200']);
  assert.equal(listVehicles({ q: 'jetta 2024' }).length, 0);
  assert.deepEqual(listVehicles({ q: 'volkswagen', condition: 'new' }).map((v) => v.stock_number), ['V100']);
  assert.ok(listVehicles({ condition: 'used' }).every((v) => v.condition !== 'new'));
  assert.equal(listVehicles({ q: '%' }).length, listVehicles().length, 'wildcards are literal');
  importVehiclesCsv('Stock,Make,Model\nNOYEAR1,Kia,Soul');
  assert.equal(listVehicles({ q: 'NOYEAR1' }).length, 1, 'vehicles without a year are found too');
});

test('shared CSV helpers', () => {
  assert.equal(isValidVin('3VV2B7AX5RM000001'), true);
  assert.equal(isValidVin('3VV2B7AX5RM00000I'), false, 'no I, O or Q');
  assert.equal(normaliseVehicle({ make: 'a', model: 'b', status: 'vendu' }).vehicle.status, 'sold');
  assert.match(normaliseVehicle({ make: 'a', model: 'b', status: 'lost' }).error, /isn't recognised/);
  assert.match(readInventoryCsv('Name,Phone\nx,y').error, /Make and Model/);
  assert.deepEqual(normaliseVehicle({ make: 'a', model: 'b', photos: 'javascript:alert(1) https://ok/x.jpg /media/1/abc.png' }).vehicle.photos, ['https://ok/x.jpg', '/media/1/abc.png']);
});

test('migration 5 keeps the first copy of repeated VINs / stock numbers and adds unique indexes', () => {
  const db = new DatabaseSync(':memory:');
  for (const sql of MIGRATIONS.slice(0, 4)) db.exec(sql);
  db.exec(`INSERT INTO dealerships (name) VALUES ('A');
    INSERT INTO vehicles (dealership_id, make, model, vin, stock_number) VALUES (1,'VW','Golf',' 3vwc57bu5rm000004 ','s1'), (1,'VW','Golf','3VWC57BU5RM000004','S1'), (1,'VW','Polo','','S2');`);
  db.exec(MIGRATIONS[4]);
  const rows = db.prepare('SELECT vin, stock_number FROM vehicles ORDER BY id').all().map((r) => [r.vin, r.stock_number]);
  assert.deepEqual(rows, [['3VWC57BU5RM000004', 'S1'], ['', ''], ['', 'S2']]);
  assert.throws(() => db.exec(`INSERT INTO vehicles (dealership_id, make, model, vin) VALUES (1,'x','y','3VWC57BU5RM000004')`), /UNIQUE/);
});
