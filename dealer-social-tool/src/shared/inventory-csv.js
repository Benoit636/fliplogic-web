// Reading inventory exports and feeds: CSV/TSV (DMS, Excel), the Facebook/Meta automotive catalog feed (XML or CSV)
// and other provider XML feeds with the usual field names. Pure functions shared by the server and the browser demo.
// Only the vehicle fields below are read; anything else (customer names, costs, notes…) is ignored and never stored.

export const MAX_ROWS = 5000;
export const MAX_PHOTOS = 20;
const CONDITIONS = ['new', 'used', 'certified'];
const STATUSES = ['available', 'pending', 'sold'];

/** Lower-case, strip accents and punctuation: "N° de stock" → "ndestock", "Kilométrage (km)" → "kilometragekm". */
export const headerKey = (h) =>
  String(h || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// English and Canadian-French names that DMS and website exports use for each field.
const ALIASES = {
  stock_number: ['stock', 'stock #', 'stock number', 'stock no', 'stocknumber', 'stock_no', 'stk', 'stk #', 'no de stock', 'n° de stock', 'numéro de stock', 'inventaire', 'no inventaire', 'stock_id'],
  vin: ['vin', 'vin #', 'vin number', 'niv', 'no de série', 'numéro de série', 'serial number', 'vehicle_identification_number'],
  year: ['year', 'model year', 'yr', 'année', 'annee', 'année modèle'],
  make: ['make', 'manufacturer', 'brand', 'marque', 'fabricant'],
  model: ['model', 'modèle', 'modele'],
  trim: ['trim', 'series', 'trim level', 'version', 'garniture', 'niveau'],
  condition: ['condition', 'type', 'new/used', 'new_used', 'new or used', 'stock type', 'état', 'etat', 'neuf/usagé', 'neuf/occasion', 'catégorie', 'state_of_vehicle', 'vehicle condition', 'inventory type'],
  price: ['price', 'internet price', 'selling price', 'sale price', 'list price', 'our price', 'prix', 'prix de vente', 'prix internet', 'prix affiché', 'sale_price', 'msrp'],
  mileage: ['mileage', 'miles', 'odometer', 'kilometers', 'kilometres', 'km', 'kms', 'odometer km', 'kilométrage', 'kilometrage', 'odomètre', 'mileage.value', 'mileage value'],
  exterior_color: ['color', 'colour', 'exterior color', 'exterior colour', 'ext color', 'couleur', 'couleur extérieure'],
  features: ['features', 'options', 'description', 'highlights', 'équipements', 'equipements', 'caractéristiques', 'options et équipements'],
  photos: ['photos', 'photo', 'images', 'image', 'image urls', 'image_urls', 'photo urls', 'photo_urls', 'picture urls', 'imagelist', 'image list', 'image.url', 'image_link', 'additional_image_link', 'photo url'],
  status: ['status', 'statut', 'disponibilité', 'availability'],
  detail_url: ['url', 'vdp', 'vdp url', 'vehicle url', 'detail url', 'details url', 'vehicle_url', 'link', 'lien', 'page url', 'website url'],
};
// Numbered photo columns/tags: "image[0].url", "Photo1", "image_2"…
const PHOTO_KEY = /^(image|photo|picture|img)(s)?\d+(url)?$|^(image|photo)\d*url$/;
const ALIAS_KEYS = Object.fromEntries(Object.entries(ALIASES).map(([field, names]) => [field, names.map(headerKey)]));
export const CSV_FIELDS = Object.keys(ALIASES);

/** Excel in French Canada saves with ";" — pick the delimiter that splits the header row best. */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  text = String(text).replace(/^﻿/, ''); // Excel's byte-order mark
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Which column holds which field, and which columns are ignored. Several photo columns are all kept. */
export function mapHeaders(headers) {
  const mapping = {};
  const keys = headers.map(headerKey);
  for (const [field, aliases] of Object.entries(ALIAS_KEYS)) {
    const idx = keys.findIndex((k, i) => aliases.includes(k) && !Object.values(mapping).includes(i));
    if (idx >= 0) mapping[field] = idx;
  }
  const photoColumns = keys.map((k, i) => (PHOTO_KEY.test(k) && mapping.photos !== i ? i : -1)).filter((i) => i >= 0);
  const used = new Set([...Object.values(mapping), ...photoColumns]);
  const ignored = headers.map((h, i) => (used.has(i) ? null : String(h).trim())).filter(Boolean);
  return { mapping, ignored, photoColumns };
}

export const normaliseVin = (vin) =>
  String(vin ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
// 17 characters, letters I, O and Q are never used.
export const isValidVin = (vin) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

const number = (v) => {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === '') return null;
  let s = String(v).replace(/[\s  $]/g, '');
  // French format "41 500,00 $": a comma followed by 1–2 digits at the end is the decimal mark.
  s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

/** Demonstrators: new vehicles used by the dealership (Démo in French). */
export const isDemoCondition = (value) => /^(demo|demonstrator|demonstrateur|newdemo|demonew)/.test(headerKey(value));

export function normaliseCondition(value) {
  const c = headerKey(value);
  if (!c) return undefined;
  if (isDemoCondition(value)) return 'new';
  if (c.startsWith('n')) return 'new'; // new, neuf, neuve
  if (c.startsWith('c') || c.includes('cpo') || c.includes('certif')) return 'certified';
  return 'used'; // used, usagé, occasion, pre-owned, demo…
}

function normaliseStatus(value) {
  const s = headerKey(value);
  if (!s) return undefined;
  if (['available', 'instock', 'disponible', 'active', 'forsale', 'intransit', 'enroute'].includes(s)) return 'available';
  if (['sold', 'vendu', 'vendue', 'delivered', 'livre', 'outofstock', 'notavailable', 'unavailable', 'removed'].includes(s)) return 'sold';
  if (['pending', 'onhold', 'hold', 'deposit', 'reserve', 'reservee', 'enattente', 'availablefororder', 'preorder'].includes(s)) return 'pending';
  return null;
}

export function parsePhotoList(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s|;,]+/);
  return [...new Set(list.map((p) => String(p).trim()).filter((p) => /^https?:\/\/\S+$/i.test(p) || /^\/media\/\d+\/[\w-]+\.(jpg|png|webp)$/.test(p)))].slice(0, MAX_PHOTOS);
}

/**
 * Clean one vehicle's fields. Returns { vehicle, error }: `vehicle` has only the fields that were given.
 * `partial` allows updates that don't repeat make/model.
 */
export function normaliseVehicle(input, { partial = false } = {}) {
  const v = {};
  const str = (k, max = 200) => {
    if (input[k] !== undefined) v[k] = String(input[k] ?? '').trim().slice(0, max);
  };
  ['make', 'model', 'trim', 'exterior_color'].forEach((k) => str(k, 80));
  str('features', 2000);
  if (input.stock_number !== undefined) v.stock_number = String(input.stock_number ?? '').trim().toUpperCase().slice(0, 40);
  if (input.vin !== undefined) v.vin = normaliseVin(input.vin);
  for (const k of ['year', 'mileage']) {
    const n = number(input[k]);
    if (n !== undefined) v[k] = n === null ? null : Math.round(n);
  }
  const price = number(input.price);
  if (price !== undefined) v.price = price === null ? null : Math.round(price * 100) / 100;
  if (input.condition !== undefined && String(input.condition).trim() !== '') {
    v.condition = normaliseCondition(input.condition);
    v.is_demo = isDemoCondition(input.condition) ? 1 : 0;
  }
  if (input.is_demo !== undefined) v.is_demo = input.is_demo && input.is_demo !== '0' ? 1 : 0;
  if (input.detail_url !== undefined) {
    const url = String(input.detail_url ?? '').trim();
    v.detail_url = /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : '';
  }
  if (input.status !== undefined && String(input.status).trim() !== '') v.status = normaliseStatus(input.status);
  if (input.photos !== undefined) v.photos = parsePhotoList(input.photos);

  const maxYear = new Date().getFullYear() + 2;
  if (!partial && (!v.make || !v.model)) return { error: 'Make and model are required' };
  if (partial && (v.make === '' || v.model === '')) return { error: 'Make and model are required' };
  if (v.vin && !isValidVin(v.vin)) return { error: `VIN "${v.vin}" isn't valid (17 letters/numbers, no I, O or Q)` };
  if (v.year != null && (Number.isNaN(v.year) || v.year < 1950 || v.year > maxYear)) return { error: `Year must be between 1950 and ${maxYear}` };
  if (Number.isNaN(v.price) || v.price < 0 || v.price > 5_000_000) return { error: 'Price must be a number' };
  if (Number.isNaN(v.mileage) || v.mileage < 0 || v.mileage > 2_000_000) return { error: 'Mileage must be a number' };
  if (v.condition && !CONDITIONS.includes(v.condition)) return { error: 'Condition must be new or used' };
  if (v.status === null) return { error: `Status "${input.status}" isn't recognised (use available, pending or sold)` };
  if (v.status && !STATUSES.includes(v.status)) return { error: 'Invalid status' };
  return { vehicle: v };
}

// ---------- XML feeds (Meta automotive catalog, provider exports) ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (t) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** Small tolerant XML reader: elements, attributes ignored, CDATA kept. Enough for inventory feeds. */
export function parseXml(text) {
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][\s\S]*?>|<(\/?)([\w:.-]+)[^>]*?(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[3]) {
      if (m[2] === '/') {
        if (stack.length > 1 && stack.some((n) => n.name === m[3])) while (stack.length > 1 && stack.pop().name !== m[3]);
      } else {
        const node = { name: m[3], children: [], text: '' };
        top.children.push(node);
        if (m[4] !== '/') stack.push(node);
      }
    } else if (m[5] !== undefined) top.text += decodeEntities(m[5]);
  }
  return root;
}

const VEHICLE_HINT = new Set(['vin', 'vehicleid', 'make', 'model', 'stocknumber', 'stock']);
/** The repeated element that holds one vehicle each (<listing>, <vehicle>, <item>…). */
function findRecords(root) {
  const counts = new Map();
  const walk = (n) => {
    for (const c of n.children) {
      if (c.children.some((g) => VEHICLE_HINT.has(headerKey(g.name)))) counts.set(c.name, (counts.get(c.name) || []).concat([c]));
      walk(c);
    }
  };
  walk(root);
  return [...counts.values()].sort((a, b) => b.length - a.length)[0] || [];
}

/** Flatten one vehicle element into { key: value | [values] } ("mileage.value", "image.url", "photos.photo"…). */
function flattenRecord(node) {
  const out = {};
  const add = (key, value) => {
    value = value.trim();
    if (!value) return;
    if (out[key] === undefined) out[key] = value;
    else out[key] = [].concat(out[key], value);
  };
  const walk = (n, prefix) => {
    for (const c of n.children) {
      const key = prefix ? `${prefix}.${c.name}` : c.name;
      if (c.children.length) walk(c, key);
      else add(key, c.text);
    }
  };
  walk(node, '');
  return out;
}

function recordsToTable(records) {
  const headers = [];
  for (const r of records) for (const k of Object.keys(r)) if (!headers.includes(k)) headers.push(k);
  // Repeated values (several photos) become one cell separated by "|", which the photo reader splits.
  const rows = records.map((r) => headers.map((h) => [].concat(r[h] ?? '').join('|')));
  return { headers, rows };
}

/** Turn a CSV/TSV/XML export or feed into vehicle rows ready to match against inventory. */
export function readInventory(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  let headers;
  let rows;
  let format;
  if (/^\s*</.test(text)) {
    const records = findRecords(parseXml(text)).map(flattenRecord);
    if (!records.length) return { error: 'No vehicles found in that XML file' };
    ({ headers, rows } = recordsToTable(records));
    format = 'xml';
  } else {
    const table = parseCsv(text);
    if (table.length < 2) return { error: 'The file needs a header row and at least one vehicle' };
    [headers, ...rows] = table;
    format = 'csv';
  }
  const { mapping, ignored, photoColumns } = mapHeaders(headers);
  if (mapping.make === undefined || mapping.model === undefined) {
    return { error: `Couldn't find Make and Model columns. Columns found: ${headers.map((h) => String(h).trim()).filter(Boolean).slice(0, 40).join(', ')}` };
  }
  if (rows.length > MAX_ROWS) return { error: `That file has ${rows.length} vehicles; the limit is ${MAX_ROWS}` };
  if (headers.some((h) => headerKey(h) === 'stateofvehicle' || headerKey(h) === 'vehicleid')) format = `meta-${format}`;
  const items = rows.map((cells, i) => {
    const input = {};
    for (const [field, idx] of Object.entries(mapping)) input[field] = String(cells[idx] ?? '').trim();
    const extraPhotos = photoColumns.map((i2) => String(cells[i2] ?? '').trim()).filter(Boolean);
    if (extraPhotos.length) input.photos = [input.photos, ...extraPhotos].filter(Boolean).join('|');
    if (!input.status) delete input.status;
    if (!input.condition) delete input.condition;
    if (input.photos === '' || input.photos === undefined) delete input.photos; // an empty photo cell keeps existing photos
    if (!input.detail_url) delete input.detail_url;
    const { vehicle, error } = normaliseVehicle(input);
    return { line: format.endsWith('xml') ? i + 1 : i + 2, vehicle, error };
  });
  return { items, mapped: [...Object.keys(mapping), ...(photoColumns.length && !mapping.photos ? ['photos'] : [])], ignored, format };
}

/** Kept for older callers: CSV text in, vehicle rows out. */
export const readInventoryCsv = readInventory;
