// Forward social-media leads to the dealership's CRM as an ADF/XML email — the format
// virtually every automotive CRM (VinSolutions, DealerSocket, Elead, …) accepts.
import { config } from '../config.js';
import { run, logActivity, nowIso } from '../db.js';
import { tenantId } from '../tenant.js';
import { getDealership } from './dealership.js';
import { getVehicle } from './inventory.js';
import { getPost } from './posts.js';
import { sendEmail } from './mailer.js';
import { PLATFORMS } from '../config.js';

const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function buildAdf(message, dealer, vehicle) {
  const kind = `${PLATFORMS[message.platform]?.label || message.platform} ${message.kind}`;
  const vehicleXml = vehicle
    ? `
    <vehicle interest="buy" status="${vehicle.condition === 'new' ? 'new' : 'used'}">
      <year>${xml(vehicle.year)}</year>
      <make>${xml(vehicle.make)}</make>
      <model>${xml(vehicle.model)}</model>
      ${vehicle.trim ? `<trim>${xml(vehicle.trim)}</trim>` : ''}
      ${vehicle.vin ? `<vin>${xml(vehicle.vin)}</vin>` : ''}
      ${vehicle.stock_number ? `<stock>${xml(vehicle.stock_number)}</stock>` : ''}
      ${vehicle.price != null ? `<price type="asking">${xml(vehicle.price)}</price>` : ''}
    </vehicle>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<?adf version="1.0"?>
<adf>
  <prospect status="new">
    <requestdate>${xml(message.received_at || nowIso())}</requestdate>${vehicleXml}
    <customer>
      <contact>
        <name part="full">${xml(message.author)}</name>
      </contact>
      <comments>${xml(`${kind}: ${message.text}`)}</comments>
    </customer>
    <vendor>
      <vendorname>${xml(dealer.name)}</vendorname>
    </vendor>
    <provider>
      <name part="full">${xml(config.productName)}</name>
      <service>${xml(kind)}</service>
    </provider>
  </prospect>
</adf>`;
}

/** Send a lead to the CRM once. Returns true when an email was sent. */
export async function forwardLead(message) {
  const dealer = getDealership();
  if (!dealer.crm_lead_email || !message.is_lead || message.forwarded_at) return false;
  const post = message.post_id ? getPost(message.post_id) : null;
  const vehicle = post?.vehicle_id ? getVehicle(post.vehicle_id) : null;
  await sendEmail({
    to: dealer.crm_lead_email,
    subject: `Social media lead: ${message.author}${vehicle ? ` — ${vehicle.year} ${vehicle.make} ${vehicle.model}` : ''}`,
    text: buildAdf(message, dealer, vehicle),
    plainOnly: true,
  });
  run('UPDATE inbox_messages SET forwarded_at = ? WHERE id = ? AND dealership_id = ?', nowIso(), message.id, tenantId());
  logActivity('bot', 'lead.forwarded_to_crm', `${message.author} → ${dealer.crm_lead_email}`);
  return true;
}
