import { get, updateRow } from '../db.js';

const EDITABLE = [
  'name',
  'brands',
  'website',
  'phone',
  'address',
  'city',
  'brand_voice',
  'default_hashtags',
  'call_to_action',
  'compliance_notes',
  'autonomy',
  'language',
  'distance_unit',
];

export function getDealership() {
  return get('SELECT * FROM dealership WHERE id = 1');
}

export function updateDealership(fields) {
  if (fields.autonomy && !['assist', 'autopilot'].includes(fields.autonomy)) {
    throw Object.assign(new Error('autonomy must be "assist" or "autopilot"'), { status: 400 });
  }
  if (fields.distance_unit && !['km', 'mi'].includes(fields.distance_unit)) {
    throw Object.assign(new Error('distance_unit must be "km" or "mi"'), { status: 400 });
  }
  updateRow('dealership', 1, fields, EDITABLE);
  return getDealership();
}

export function defaultHashtags(dealer = getDealership()) {
  return dealer.default_hashtags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
}

export const isAutopilot = () => getDealership().autonomy === 'autopilot';
