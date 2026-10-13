// Platform-owner setup: create a dealership and invite its first Dealer Admin.
// No passwords are set here: the admin receives a single-use link and chooses their own.
import { logActivity } from '../db.js';
import { runWithTenant } from '../tenant.js';
import { createDealership, getDealershipById, getDealershipByNumber, updateDealership } from './dealership.js';
import { createInvite } from './auth.js';
import { httpError } from './errors.js';

const ADMIN_INVITE_DAYS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Starting profile for the pilot store. Everything here can be edited later in Accounts & Settings. */
export const PRESETS = {
  'vw-moncton': {
    name: 'Volkswagen Moncton',
    dealerNumber: '001',
    profile: {
      brands: 'Volkswagen, pre-owned all makes',
      city: 'Moncton',
      province: 'NB',
      timezone: 'America/Moncton',
      language: 'English and French',
      distance_unit: 'km',
      default_hashtags: '#VWMoncton #Moncton #Volkswagen',
      brand_color: '#001E50',
      accent_color: '#0040C5',
    },
  },
};

export function createDealerWithAdmin({ name, dealerNumber, adminEmail, profile = {} }) {
  if (!EMAIL_RE.test(String(adminEmail || ''))) throw httpError(400, 'A valid admin email is required');
  const { timezone, ...rest } = profile;
  const dealership = createDealership({ name, timezone, dealerNumber });
  runWithTenant(dealership.id, () => {
    if (Object.keys(rest).length) updateDealership(rest);
    logActivity('system', 'dealership.created', `Dealer #${dealership.dealer_number} ${dealership.name}`);
  });
  const invite = createInvite(dealership.id, { email: adminEmail, role: 'admin', days: ADMIN_INVITE_DAYS });
  return { dealership: getDealershipById(dealership.id), ...invite };
}

/** New admin link for an existing dealership (lost or expired link, or a second admin). */
export function inviteDealerAdmin(dealerNumber, adminEmail) {
  const dealership = getDealershipByNumber(dealerNumber);
  if (!dealership) throw httpError(404, `No dealership with number ${dealerNumber}`);
  const invite = createInvite(dealership.id, { email: adminEmail, role: 'admin', days: ADMIN_INVITE_DAYS });
  runWithTenant(dealership.id, () => logActivity('system', 'admin.invited', adminEmail));
  return { dealership, ...invite };
}
