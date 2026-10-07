// Post objectives for the "Create Post" flow: what the manager wants to achieve with a
// New or Used vehicle post, which details we ask for, and how the copy should feel.
// Pure module (no imports) so the server, the browser and the demo all share it.

export const FIELDS = {
  year: { label: 'Year', type: 'number', placeholder: '2024', inputmode: 'numeric', half: true },
  make: { label: 'Make', placeholder: 'Volkswagen', half: true },
  model: { label: 'Model', placeholder: 'Tiguan', half: true },
  trim: { label: 'Trim', placeholder: 'Comfortline', half: true },
  mileage: { label: 'Mileage', type: 'number', placeholder: '42000', inputmode: 'numeric', half: true },
  price: { label: 'Price', placeholder: '$32,995', inputmode: 'decimal', half: true },
  previous_price: { label: 'Was (old price)', placeholder: '$34,995', inputmode: 'decimal', half: true },
  stock_number: { label: 'Stock #', placeholder: 'R2401', half: true },
  exterior_color: { label: 'Colour', placeholder: 'Kings Red', half: true },
  payment: { label: 'Payment', placeholder: '$189 bi-weekly', half: true },
  finance_offer: { label: 'Finance offer', placeholder: '1.99% for 60 months', half: true },
  lease_offer: { label: 'Lease offer', placeholder: '$299/mo for 48 months', half: true },
  dealer_incentive: { label: 'Dealer incentive', placeholder: '$2,000 off or free winter tires', half: true },
  offer_expires: { label: 'Offer ends', type: 'date', half: true },
  available_count: { label: 'How many in stock', type: 'number', placeholder: '6', inputmode: 'numeric', half: true },
  features: { label: 'Key selling points', type: 'textarea', placeholder: 'One per line, e.g.\nHeated seats\nApple CarPlay\nAWD' },
  notes: { label: 'Anything else to mention?', type: 'textarea', placeholder: 'e.g. One local owner, just serviced, winter tires included' },
};

const USED_BASE = ['year', 'make', 'model', 'trim', 'mileage', 'price', 'stock_number', 'features', 'notes'];
const NEW_BASE = ['year', 'make', 'model', 'trim', 'price', 'features', 'notes'];

export const OBJECTIVES = {
  used: [
    {
      key: 'used_fresh_arrival',
      label: 'Fresh Arrival',
      emoji: '🚨',
      hint: 'Just hit the lot. Get eyes on it first.',
      fields: USED_BASE,
      angle:
        'Fresh arrival on the used lot. Create first-look excitement and gentle urgency (good used vehicles move fast). Lead with the vehicle, not the dealership.',
    },
    {
      key: 'used_featured',
      label: 'Featured Vehicle',
      emoji: '⭐',
      hint: 'Showcase one great vehicle.',
      fields: USED_BASE,
      angle: 'Showcase post. Paint the picture of owning it: who it suits, why it stands out, the 3 best reasons to come see it.',
    },
    {
      key: 'used_price_drop',
      label: 'Price Drop',
      emoji: '💥',
      hint: 'Announce a new lower price.',
      fields: ['year', 'make', 'model', 'trim', 'mileage', 'price', 'previous_price', 'stock_number', 'features', 'notes'],
      labels: { price: 'New price' },
      angle: 'Price reduction. Lead with the savings (old price to new price when both are given) and make the value obvious. Urgency without hype.',
    },
    {
      key: 'used_aged',
      label: 'Needs to Move',
      emoji: '🔥',
      hint: 'Aged unit? Make it the deal of the week.',
      fields: USED_BASE,
      labels: { notes: 'Your best offer or angle (optional)' },
      angle:
        'This unit needs to sell this week. Frame it as the deal of the week / priced to move with real value and a strong reason to act now. NEVER mention how long it has been in stock, never say "aged", never imply anything is wrong with it.',
    },
    {
      key: 'used_manager_special',
      label: 'Manager Special',
      emoji: '🏷️',
      hint: 'A hand-picked deal from the manager.',
      fields: USED_BASE,
      labels: { notes: 'What makes it special? (the offer)' },
      angle: 'Manager special. Exclusive, hand-picked, limited-time feel. Mention the stock number so buyers can ask for it.',
    },
    {
      key: 'used_trade_in',
      label: 'Trade-In Spotlight',
      emoji: '🔁',
      hint: 'Just traded in, ready for its next owner.',
      fields: USED_BASE,
      angle:
        'Freshly traded in by a local customer and ready for its next owner. Warm, honest tone. Do not invent its history (owners, accidents, service records) unless given. Close with an invitation to get their own trade appraised.',
    },
  ],
  new: [
    {
      key: 'new_vehicle_arrival',
      label: 'New Arrival',
      emoji: '✨',
      hint: 'A brand-new model just landed.',
      fields: ['year', 'make', 'model', 'trim', 'exterior_color', 'price', 'stock_number', 'features', 'notes'],
      labels: { price: 'Price / starting at' },
      angle: 'Brand-new vehicle just arrived. Showroom excitement, what is new or exciting about it, invite people to be first to test drive.',
    },
    {
      key: 'new_monthly_offer',
      label: 'Monthly Offer',
      emoji: '📅',
      hint: 'This month’s payment, finance or lease deal.',
      fields: [
        'year',
        'make',
        'model',
        'trim',
        'payment',
        'finance_offer',
        'lease_offer',
        'dealer_incentive',
        'offer_expires',
        'available_count',
        'features',
        'notes',
      ],
      required: ['model'],
      angle:
        'This month’s offer. Lead with the offer itself (payment / rate / lease) exactly as given, then the vehicle. State the expiry date when given. Offers need the compliance note.',
    },
    {
      key: 'new_model_spotlight',
      label: 'Model Spotlight',
      emoji: '🔍',
      hint: 'Show off a model and why people love it.',
      fields: ['year', 'make', 'model', 'trim', 'price', 'features', 'notes'],
      labels: { price: 'Starting at (optional)' },
      required: ['model'],
      angle: 'Educational model spotlight. What makes this model great for local drivers, the standout features, an invitation for a full walk-around.',
    },
    {
      key: 'new_demo_special',
      label: 'Demo Special',
      emoji: '🚘',
      hint: 'Low-km demo at a great price.',
      fields: ['year', 'make', 'model', 'trim', 'mileage', 'price', 'previous_price', 'stock_number', 'offer_expires', 'features', 'notes'],
      labels: { previous_price: 'MSRP / was', price: 'Demo price' },
      angle: 'Demo vehicle special: new-vehicle feel with low kilometres at a demo price. Only mention warranty details if given.',
    },
    {
      key: 'new_leftover',
      label: 'Leftover Inventory',
      emoji: '📢',
      hint: 'Last year’s models, best offers.',
      fields: [
        'year',
        'make',
        'model',
        'trim',
        'price',
        'payment',
        'finance_offer',
        'dealer_incentive',
        'available_count',
        'offer_expires',
        'features',
        'notes',
      ],
      required: ['model'],
      angle: 'Previous model-year clear-out. Making room for new models, limited units left, best offers of the year. Positive, not desperate.',
    },
    {
      key: 'new_trade_up_event',
      label: 'Trade-Up Event',
      emoji: '🔁',
      hint: 'Get people to trade into something new.',
      fields: ['make', 'model', 'dealer_incentive', 'finance_offer', 'offer_expires', 'notes'],
      labels: { offer_expires: 'Event ends', notes: 'Event details (dates, perks)' },
      required: [],
      angle: 'Trade-up event. Their current vehicle could be worth more than they think; invite them for a free appraisal and to trade up into a new vehicle.',
    },
    {
      key: 'new_manager_special',
      label: 'Manager Special',
      emoji: '🏷️',
      hint: 'A hand-picked deal on a new vehicle.',
      fields: ['year', 'make', 'model', 'trim', 'price', 'payment', 'stock_number', 'offer_expires', 'features', 'notes'],
      labels: { notes: 'What makes it special? (the offer)' },
      angle: 'Manager special on a new vehicle. Exclusive, limited-time feel. Mention the stock number so buyers can ask for it.',
    },
  ],
};

export const OBJECTIVE_LIST = [...OBJECTIVES.used.map((o) => ({ ...o, condition: 'used' })), ...OBJECTIVES.new.map((o) => ({ ...o, condition: 'new' }))];
export const OBJECTIVE_BY_KEY = Object.fromEntries(OBJECTIVE_LIST.map((o) => [o.key, o]));

export const requiredFields = (objective) => objective.required ?? ['make', 'model'];
export const fieldLabel = (objective, key) => objective.labels?.[key] || FIELDS[key]?.label || key;

/** Missing required details, as readable labels. */
export function missingFields(objectiveKey, details = {}) {
  const o = OBJECTIVE_BY_KEY[objectiveKey];
  if (!o) return [];
  return requiredFields(o)
    .filter((k) => !String(details[k] ?? '').trim())
    .map((k) => fieldLabel(o, k));
}

// ---------- helpers ----------

const clean = (v) => String(v ?? '').trim();

/** "$32995" / "32,995" / 32995 → "$32,995"; anything wordier is kept as typed. */
export function formatMoney(v) {
  const s = clean(v);
  if (!s) return '';
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && /^[$\d,.\s]+$/.test(s) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : s;
}

const toNumber = (v) => {
  const n = Number(clean(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function vehicleName(d) {
  return [d.year, d.make, d.model, d.trim].map(clean).filter(Boolean).join(' ');
}

function sellingPoints(d, max = 5) {
  return clean(d.features)
    .split(/\n|;|,(?=\s*[A-Z])/)
    .map((s) => s.replace(/^[-•*✅\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function formatDate(value) {
  const s = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const tagify = (s) => `#${String(s).replace(/[^a-z0-9]/gi, '')}`;

/** True when the post mentions money terms, so the compliance line should be added. */
export const mentionsPricing = (d) => ['price', 'payment', 'finance_offer', 'lease_offer', 'dealer_incentive'].some((k) => clean(d[k]));

/** Plain-language facts for the AI prompt (only what the manager typed). */
export function briefFacts(objective, details, unit = 'km') {
  const lines = [];
  for (const key of objective.fields) {
    const v = clean(details[key]);
    if (!v) continue;
    let value = v;
    if (['price', 'previous_price'].includes(key)) value = formatMoney(v);
    if (key === 'mileage') value = `${Number(v.replace(/[^\d]/g, '')).toLocaleString('en-US')} ${unit}`;
    if (key === 'offer_expires') value = formatDate(v);
    lines.push(`${fieldLabel(objective, key)}: ${value}`);
  }
  return lines.join('\n');
}

// ---------- template writer (used when AI is not available) ----------

function draft(objective, d, dealer) {
  const name = vehicleName(d) || [d.make, d.model].map(clean).filter(Boolean).join(' ') || 'this vehicle';
  const short = [d.year, d.make, d.model].map(clean).filter(Boolean).join(' ') || name;
  const unit = dealer.distance_unit || 'km';
  const km = toNumber(d.mileage) != null ? `${toNumber(d.mileage).toLocaleString('en-US')} ${unit}` : '';
  const price = formatMoney(d.price);
  const was = formatMoney(d.previous_price);
  const savings =
    toNumber(d.previous_price) && toNumber(d.price) && toNumber(d.previous_price) > toNumber(d.price) ? toNumber(d.previous_price) - toNumber(d.price) : null;
  const spec = [clean(d.exterior_color), km, price && (objective.key === 'new_model_spotlight' ? `from ${price}` : price)].filter(Boolean).join(' • ');
  const points = sellingPoints(d);
  const bullets = points.length ? points.map((p) => `✅ ${p}`).join('\n') : '';
  const stock = clean(d.stock_number) ? `Ask for stock #${clean(d.stock_number)}.` : '';
  const expires = clean(d.offer_expires) ? `⏳ Offer ends ${formatDate(d.offer_expires)}.` : '';
  const offerLines = [
    clean(d.payment) && `💰 ${clean(d.payment)}`,
    clean(d.finance_offer) && `🏦 Finance: ${clean(d.finance_offer)}`,
    clean(d.lease_offer) && `📝 Lease: ${clean(d.lease_offer)}`,
    clean(d.dealer_incentive) && `🎁 ${clean(d.dealer_incentive)}`,
    toNumber(d.available_count) && `📦 ${toNumber(d.available_count)} in stock`,
  ]
    .filter(Boolean)
    .join('\n');
  const notes = clean(d.notes);
  const store = dealer.name || 'our dealership';

  switch (objective.key) {
    case 'used_fresh_arrival':
      return {
        hook: `🚨 Fresh on the lot: ${name}!`,
        lines: [`Just arrived at ${store} and it won’t be here long.`, spec, bullets, notes, 'Be the first to see it.'],
      };
    case 'used_featured':
      return { hook: `⭐ Featured vehicle: ${name}`, lines: ['Here’s why this one stands out:', bullets, spec, notes, 'Come see it in person this week.'] };
    case 'used_price_drop':
      return {
        hook: `💥 Price drop on our ${name}!`,
        lines: [
          was && price
            ? `Was ${was}, now ${price}${savings ? ` (you save $${savings.toLocaleString('en-US')})` : ''}.`
            : price
              ? `New lower price: ${price}.`
              : 'We just lowered the price.',
          km,
          bullets,
          notes,
          'Deals like this go fast.',
        ],
      };
    case 'used_aged':
      return {
        hook: `🔥 Deal of the week: ${name}`,
        lines: [
          'Priced to move and ready for a test drive today.',
          spec,
          bullets,
          notes,
          'We want this one in your driveway, not on our lot. Come make it yours this week.',
        ],
      };
    case 'used_manager_special':
    case 'new_manager_special':
      return {
        hook: `🏷️ Manager’s Special: ${name}`,
        lines: [notes || 'Hand-picked by our manager for a special deal.', spec, offerLines, bullets, expires, stock || 'Limited time only.'],
      };
    case 'used_trade_in':
      return {
        hook: `🔁 Fresh trade-in: ${name}`,
        lines: [
          `Just traded in here at ${store} and ready for its next owner.`,
          spec,
          bullets,
          notes,
          'Curious what your vehicle is worth? Ask us for a free trade appraisal.',
        ],
      };
    case 'new_vehicle_arrival':
      return {
        hook: `✨ It’s here! The brand-new ${name} just arrived.`,
        lines: [bullets, spec, notes, 'Come see it in person and book the first test drive.'],
      };
    case 'new_monthly_offer': {
      const headline = clean(d.payment)
        ? `${short} from ${clean(d.payment)}`
        : clean(d.finance_offer)
          ? `${clean(d.finance_offer)} on the ${short}`
          : clean(d.lease_offer)
            ? `Lease the ${short}: ${clean(d.lease_offer)}`
            : `Special offers on the ${short}`;
      return { hook: `📅 This month at ${store}: ${headline}`, lines: [offerLines, bullets, notes, expires] };
    }
    case 'new_model_spotlight':
      return {
        hook: `🔍 Model spotlight: the ${short}`,
        lines: [
          'Here’s what drivers love about it:',
          bullets,
          spec && `Starting ${spec.startsWith('from') ? spec : `at ${spec}`}`,
          notes,
          'Want the full walk-around? We’ll show you every feature.',
        ],
      };
    case 'new_demo_special':
      return {
        hook: `🚘 Demo special: ${name}${km ? ` with only ${km}` : ''}`,
        lines: [
          'New-vehicle feel at a demo price.',
          was && price ? `MSRP ${was}, demo price ${price}.` : price && `Demo price: ${price}.`,
          bullets,
          notes,
          expires,
          stock,
        ],
      };
    case 'new_leftover':
      return {
        hook: `📢 Last call on ${short || 'last year’s models'}!`,
        lines: [
          `We’re making room for the new model year, so ${toNumber(d.available_count) ? `the last ${toNumber(d.available_count)}` : 'the remaining'} units are getting our best offers.`,
          price && `Now ${price}.`,
          offerLines,
          bullets,
          notes,
          expires,
        ],
      };
    case 'new_trade_up_event': {
      const target = [clean(d.make), clean(d.model)].filter(Boolean).join(' ');
      return {
        hook: `🔁 Trade-Up Event at ${store}!`,
        lines: [
          'Your current vehicle could be worth more than you think.',
          target && `Trade up into a new ${target}.`,
          offerLines,
          notes,
          expires.replace('Offer ends', 'Event ends'),
          'Bring your vehicle in for a free appraisal.',
        ],
      };
    }
    default:
      return { hook: name, lines: [spec, bullets, notes] };
  }
}

/**
 * Template copy for one platform. `rules` = { maxChars, maxHashtags }.
 * Returns { title, content, hashtags, image_idea }.
 */
export function writeObjectivePost({ objectiveKey, details = {}, dealer = {}, platform, rules }) {
  const objective = OBJECTIVE_BY_KEY[objectiveKey];
  const { hook, lines } = draft(objective, details, dealer);
  const pricing = mentionsPricing(details);
  const body = lines.filter((l) => clean(l));
  const cta = dealer.call_to_action || 'Call or message us to book a test drive.';
  let content;
  if (platform === 'x') {
    const plainHook = hook.toLowerCase();
    const extra = body
      .flatMap((l) => l.split('\n'))
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('✅') && !plainHook.includes(l.replace(/^[^\w$]+/, '').toLowerCase()));
    content = [hook, extra || '', cta].filter(Boolean).join(' ');
  } else {
    const parts = [hook, ...body, cta];
    if (dealer.phone && platform !== 'linkedin') parts.push(`📞 ${dealer.phone}`);
    if (pricing && dealer.compliance_notes) parts.push(dealer.compliance_notes);
    content = parts.join('\n\n');
  }
  if (platform === 'linkedin' || platform === 'google_business') content = content.replace(/^[^\w$#(\n]+[ \t]*/gm, '');

  const tags = (dealer.default_hashtags || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  if (clean(details.make)) tags.push(tagify(details.make));
  if (clean(details.make) && clean(details.model)) tags.push(tagify(`${details.make}${details.model}`));
  tags.push(objective.condition === 'new' || objectiveKey.startsWith('new_') ? '#NewCars' : '#UsedCars');
  const hashtags = [...new Set(tags)].slice(0, rules?.maxHashtags ?? 5);

  const max = rules?.maxChars ?? 63206;
  const budget = max - (hashtags.join(' ').length + 2);
  if (content.length > budget) content = `${content.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;

  const name = vehicleName(details);
  return {
    title: `${objective.label}${name ? `: ${name}` : ''}`,
    content,
    hashtags,
    image_idea: name ? `Bright exterior photo of the ${name}, front three-quarter angle, clean background` : 'Photo of the showroom or the featured vehicles',
  };
}
