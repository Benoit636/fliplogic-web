// In-browser stand-in for the Dealer Social server, so the real dashboard can be tried with
// sample data and no account. It answers the same /api routes; nothing leaves the browser.
(function () {
  const STORE_KEY = 'dealer-social-demo-v2';
  // Same goals, fields and template copy as the real server.
  let OBJ = null;
  const objectivesReady = import('./shared/objectives.js').then((m) => {
    OBJ = m;
    for (const o of m.OBJECTIVE_LIST) POST_TYPES[o.key] = `${o.condition === 'new' ? 'New' : 'Used'} · ${o.label}`;
  });
  const DAY = 86_400_000;

  const PLATFORMS = {
    facebook: { label: 'Facebook', maxChars: 63206, requiresMedia: false, maxHashtags: 5, live_supported: true },
    instagram: { label: 'Instagram', maxChars: 2200, requiresMedia: true, maxHashtags: 20, live_supported: true },
    tiktok: { label: 'TikTok', maxChars: 2200, requiresMedia: true, maxHashtags: 8, live_supported: true },
    x: { label: 'X (Twitter)', maxChars: 280, requiresMedia: false, maxHashtags: 2, live_supported: true },
    linkedin: { label: 'LinkedIn', maxChars: 3000, requiresMedia: false, maxHashtags: 5, live_supported: true },
    google_business: { label: 'Google Business Profile', maxChars: 1500, requiresMedia: false, maxHashtags: 0, live_supported: true },
  };
  const POST_TYPES = {
    vehicle_spotlight: 'Vehicle spotlight',
    new_arrival: 'New arrival',
    price_drop: 'Price drop',
    sold_celebration: 'Sold / happy customer',
    promotion: 'Sales promotion',
    event: 'Dealership event',
    service_tip: 'Service & maintenance tip',
    review_highlight: 'Customer review highlight',
    holiday: 'Holiday / seasonal',
    engagement: 'Community engagement question',
    team_spotlight: 'Team spotlight',
    custom: 'Custom',
  };
  const VEHICLE_TYPES = ['vehicle_spotlight', 'new_arrival', 'price_drop', 'sold_celebration'];
  const STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected'];
  const PLANS = {
    starter: {
      name: 'Starter', tagline: 'Get consistent on social without hiring', monthly: 149, yearly: 1490,
      limits: { socialAccounts: 3, users: 3, aiPostsPerMonth: 150, aiChatTurnsPerMonth: 0, autopilotRules: 2 },
      features: { assistant: false, autopilot: false, inventoryFeed: false },
      highlights: ['3 social accounts', '150 AI-written posts / month', 'Content studio, calendar & approvals', 'Inbox with AI suggested replies', 'Inventory CSV import', '2 scheduled autopilot rules (drafts for approval)'],
    },
    pro: {
      name: 'Pro', tagline: 'Your AI social media manager, on autopilot', monthly: 299, yearly: 2990, popular: true,
      limits: { socialAccounts: 6, users: 10, aiPostsPerMonth: 600, aiChatTurnsPerMonth: 1500, autopilotRules: 15 },
      features: { assistant: true, autopilot: true, inventoryFeed: true },
      highlights: ['All 6 networks', '600 AI-written posts / month', 'AI assistant chat that does the work', 'Full autopilot mode & auto-replies', 'Automatic inventory feed sync', 'Sold / price-drop / new-arrival automations'],
    },
    elite: {
      name: 'Elite', tagline: 'For high-volume stores and groups', monthly: 499, yearly: 4990,
      limits: { socialAccounts: 20, users: 50, aiPostsPerMonth: 2000, aiChatTurnsPerMonth: 5000, autopilotRules: 100 },
      features: { assistant: true, autopilot: true, inventoryFeed: true },
      highlights: ['Up to 20 social accounts', '2,000 AI-written posts / month', '5,000 AI assistant messages / month', 'Everything in Pro', 'Up to 50 team members', 'Priority support & onboarding call'],
    },
  };

  const iso = (t) => new Date(t).toISOString();
  const now = () => Date.now();
  const title = (v) => [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
  const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
  const tag = (s) => `#${String(s).replace(/[^a-z0-9]/gi, '')}`;
  function err(status, message) {
    return Object.assign(new Error(message), { status });
  }

  // Vehicle "photos" drawn as SVG so the demo needs no image hosting.
  function photo(color, label) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#11151c"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><g fill="#fff" opacity=".92"><rect x="150" y="190" width="340" height="80" rx="28"/><path d="M210 190l50-58h130l58 58z"/><circle cx="230" cy="275" r="34" fill="#11151c" stroke="#fff" stroke-width="10"/><circle cx="410" cy="275" r="34" fill="#11151c" stroke="#fff" stroke-width="10"/></g><text x="320" y="360" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  // ---------- seed ----------
  function seed() {
    const t = now();
    const d = {
      id: 1, name: 'Riverside Motors', brands: 'Volkswagen, pre-owned all makes', website: 'https://www.example-dealer.com',
      phone: '(506) 555-0123', address: '123 Main Street', city: 'Moncton, NB',
      brand_voice: 'Warm, upbeat and neighbourly. Proudly local. Straight talk, no pressure. A little playful with emojis on Instagram and TikTok.',
      default_hashtags: '#RiversideMotors #Moncton', call_to_action: 'Book your test drive today — call us or send a DM!',
      compliance_notes: 'Prices exclude taxes and fees. Vehicle subject to prior sale.', autonomy: 'assist', language: 'English',
      distance_unit: 'km', timezone: 'America/Moncton', inventory_feed_url: '', feed_marks_sold: 1, feed_last_synced_at: null,
      feed_last_result: '', crm_lead_email: '', plan: 'pro', billing_interval: 'month', subscription_status: 'trialing',
      trial_ends_at: iso(t + 11 * DAY), current_period_end: null, stripe_customer_id: null,
    };
    const vehicles = [
      [2025, 'Volkswagen', 'Atlas', 'Execline', 'new', 62995, 12, 'Pure Grey', '3rd row seating, 4MOTION AWD, panoramic sunroof, Harman Kardon audio', '#5b6470'],
      [2024, 'Volkswagen', 'Tiguan', 'Comfortline', 'certified', 36495, 18200, 'Kings Red', 'AWD, heated seats, Apple CarPlay, adaptive cruise', '#a3212c'],
      [2022, 'Ford', 'F-150', 'XLT', 'used', 44900, 58000, 'Agate Black', '4x4, 5.0L V8, tow package, crew cab', '#2b2f36'],
      [2023, 'Toyota', 'RAV4', 'Hybrid XLE', 'used', 38750, 31000, 'Blueprint', 'Hybrid AWD, 6.0L/100km, blind spot monitor', '#28508f'],
      [2021, 'Honda', 'Civic', 'EX', 'used', 23995, 64000, 'Platinum White', 'Sunroof, heated seats, Honda Sensing', '#8c96a3'],
      [2025, 'Volkswagen', 'ID.4', 'Pro S', 'new', 54995, 8, 'Aurora Red', 'All-electric, up to 400 km range, DC fast charging, heat pump', '#c2343a'],
      [2020, 'Jeep', 'Wrangler', 'Sahara', 'used', 39900, 72000, 'Sarge Green', 'Removable top, 4x4, LED lights', '#4b5a3a'],
    ].map(([year, make, model, trim, condition, price, mileage, exterior_color, features, color], i) => ({
      id: i + 1, stock_number: `R${2400 + i}`, vin: '', year, make, model, trim, condition, price, mileage, exterior_color, features,
      photos: [photo(color, `${year} ${make} ${model}`)], status: 'available', previous_price: null, sold_celebrated: 0,
      last_posted_at: null, created_at: iso(t - (20 - i * 2) * DAY), updated_at: iso(t - (20 - i * 2) * DAY),
    }));
    vehicles[4].status = 'sold';
    vehicles[6].previous_price = 42900;

    const s = {
      dealership: d, vehicles, posts: [], inbox: [], activity: [], chats: {}, usage: { ai_posts: 0, ai_chat_turns: 0 }, seq: 100,
      accounts: [
        { id: 1, platform: 'facebook', display_name: 'Riverside Motors', mode: 'simulated', external_id: '', has_token: false, token_hint: '', enabled: true, last_error: null },
        { id: 2, platform: 'instagram', display_name: '@riversidemotors', mode: 'simulated', external_id: '', has_token: false, token_hint: '', enabled: true, last_error: null },
        { id: 3, platform: 'google_business', display_name: 'Riverside Motors – Moncton', mode: 'simulated', external_id: '', has_token: false, token_hint: '', enabled: true, last_error: null },
        { id: 4, platform: 'tiktok', display_name: '@riversidemotors', mode: 'simulated', external_id: '', has_token: false, token_hint: '', enabled: true, last_error: null },
      ],
      rules: [
        { id: 1, name: 'Daily vehicle spotlight', post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'], days_of_week: [1, 2, 3, 4, 5, 6], time_of_day: '10:15', instructions: '', enabled: true, last_run_at: iso(t - DAY), next_run_at: iso(t + 0.6 * DAY) },
        { id: 2, name: 'New arrivals', post_type: 'new_arrival', platforms: ['facebook', 'instagram', 'tiktok'], days_of_week: [2, 4], time_of_day: '18:30', instructions: '', enabled: true, last_run_at: iso(t - 3 * DAY), next_run_at: iso(t + 1.4 * DAY) },
        { id: 3, name: 'Sold celebrations', post_type: 'sold_celebration', platforms: ['facebook', 'instagram'], days_of_week: [5], time_of_day: '16:00', instructions: '', enabled: true, last_run_at: null, next_run_at: iso(t + 2.2 * DAY) },
        { id: 4, name: 'Weekly service tip', post_type: 'service_tip', platforms: ['facebook', 'google_business'], days_of_week: [3], time_of_day: '09:30', instructions: 'Mention our Saturday service hours', enabled: false, last_run_at: null, next_run_at: null },
      ],
      team: {
        members: [
          { id: 1, email: 'demo@riverside.example', name: 'Demo Manager', role: 'owner', last_login_at: iso(t) },
          { id: 2, email: 'sam@riverside.example', name: 'Sam Leger', role: 'manager', last_login_at: iso(t - 2 * DAY) },
          { id: 3, email: 'rep@riverside.example', name: 'Julie Cormier', role: 'staff', last_login_at: iso(t - 5 * DAY) },
        ],
        invites: [],
      },
    };
    state = s;
    // A few weeks of history so analytics and the calendar have something to show.
    const history = [
      ['vehicle_spotlight', 1, 'facebook', 19], ['vehicle_spotlight', 1, 'instagram', 19], ['new_arrival', 2, 'facebook', 16],
      ['new_arrival', 2, 'instagram', 16], ['new_arrival', 2, 'tiktok', 16], ['service_tip', null, 'facebook', 13],
      ['service_tip', null, 'google_business', 13], ['vehicle_spotlight', 3, 'facebook', 11], ['vehicle_spotlight', 3, 'instagram', 11],
      ['review_highlight', null, 'facebook', 9], ['vehicle_spotlight', 4, 'facebook', 6], ['vehicle_spotlight', 4, 'instagram', 6],
      ['engagement', null, 'facebook', 4], ['price_drop', 7, 'facebook', 2], ['price_drop', 7, 'instagram', 2], ['vehicle_spotlight', 6, 'tiktok', 1],
    ];
    for (const [type, vid, platform, daysAgo] of history) {
      const v = vid && s.vehicles.find((x) => x.id === vid);
      const p = makePost({ postType: type, vehicle: v, platform, source: type === 'vehicle_spotlight' ? 'autopilot' : 'ai' });
      p.status = 'published';
      p.published_at = iso(t - daysAgo * DAY + 10 * 3600_000);
      p.scheduled_at = p.published_at;
      p.created_at = iso(t - (daysAgo + 1) * DAY);
      p.external_url = '';
      p.external_id = `sim_${platform}_${p.id}`;
      if (v) v.last_posted_at = p.published_at;
      s.posts.push(p);
    }
    const upcoming = [
      ['vehicle_spotlight', 6, ['facebook', 'instagram'], 0.7, 'scheduled'],
      ['new_arrival', 1, ['facebook', 'instagram', 'tiktok'], 1.4, 'scheduled'],
      ['sold_celebration', 5, ['facebook', 'instagram'], 2.3, 'pending_approval'],
      ['service_tip', null, ['facebook'], 3.1, 'pending_approval'],
    ];
    for (const [type, vid, platforms, inDays, status] of upcoming) {
      const v = vid && s.vehicles.find((x) => x.id === vid);
      for (const platform of platforms) {
        const p = makePost({ postType: type, vehicle: v, platform, source: 'autopilot', instructions: type === 'service_tip' ? 'Winter tires: book your swap before the first snow. Our shop is open Saturdays.' : '' });
        p.status = status;
        p.scheduled_at = iso(t + inDays * DAY);
        s.posts.push(p);
      }
    }
    const messages = [
      ['facebook', 'comment', 'Jessica Martin', 'Is the Tiguan still available? What would payments look like?', null, 2, 'lead', 'positive', 'high', 1, 'Hi Jessica! Yes, it is. We just sent you a DM with the details, or call us at (506) 555-0123 to book a test drive.'],
      ['google_business', 'review', 'Sandra Leblanc', 'Our salesperson was amazing, no pressure at all. Best car buying experience we have had!', 5, null, 'praise', 'positive', 'low', 0, 'Thank you so much, Sandra! We’re thrilled you had a great experience. Enjoy the new ride! 🙌'],
      ['facebook', 'dm', 'Kevin Arsenault', 'Hi, do you take trade-ins? I have a 2016 Civic with 140k.', null, null, 'lead', 'positive', 'high', 1, 'Hi Kevin! Absolutely, we take trade-ins. Send us a few photos of the Civic and we’ll get you a quick estimate. Or drop by anytime!'],
      ['google_business', 'review', 'Paul Richard', 'Waited 3 hours for an oil change even with an appointment. Disappointed.', 2, null, 'complaint', 'negative', 'high', 0, 'Hi Paul, we’re really sorry about the wait. That’s not the experience we want for you. Please call us at (506) 555-0123 so our service manager can make it right.'],
      ['instagram', 'comment', 'amy.gallant', 'Do you have any hybrids in stock?', null, 4, 'question', 'neutral', 'normal', 0, 'Great question, Amy! Yes: we have a 2023 RAV4 Hybrid XLE on the lot right now. Send us a DM and we’ll share the details!'],
      ['facebook', 'comment', 'crypto_king_88', 'Make $5000 a week from home!! DM me https://bit.ly/xxxx', null, 1, 'spam', 'neutral', 'low', 0, ''],
    ];
    messages.forEach(([platform, kind, author, text, rating, postIdx, intent, sentiment, priority, lead, reply], i) => {
      s.inbox.push({
        id: i + 1, platform, kind, author, text, rating, post_id: postIdx ? s.posts[postIdx].id : null, sentiment, intent, priority,
        is_lead: !!lead, suggested_reply: reply, reply: null, status: 'new', received_at: iso(t - (i * 5 + 2) * 3600_000), replied_at: null,
      });
    });
    log('autopilot', 'content.generated', '2 vehicle_spotlight post(s) for 2025 Volkswagen ID.4 Pro S via claude', t - 5 * 3600_000);
    log('bot', 'inbox.received', 'Facebook comment from Jessica Martin → lead', t - 2 * 3600_000);
    log('scheduler', 'post.published', 'Facebook (Riverside Motors, simulated)', t - DAY);
    return s;
  }

  // ---------- storage ----------
  let state;
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return (state = JSON.parse(raw));
    } catch {}
    return seed();
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {}
  }
  window.demoReset = () => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {}
    seed();
    save();
  };

  function log(actor, action, details = '', at = now()) {
    state.activity.unshift({ id: ++state.seq, at: iso(at), actor, action, details });
    state.activity = state.activity.slice(0, 200);
  }

  // ---------- posts ----------
  function defaultTags(d = state.dealership) {
    return d.default_hashtags.split(/[\s,]+/).filter(Boolean).map((x) => (x.startsWith('#') ? x : `#${x}`));
  }

  function writeCopy(postType, v, d, instructions, platform) {
    const t = v ? title(v) : '';
    const line = v ? [[v.exterior_color, t].filter(Boolean).join(' '), [v.mileage != null && `${Number(v.mileage).toLocaleString()} ${d.distance_unit}`, v.price != null && money(v.price)].filter(Boolean).join(' • ')].filter(Boolean).join(' — ') : '';
    const bodies = {
      vehicle_spotlight: [`🚗 Spotlight: ${t}`, line, v?.features && `Highlights: ${v.features}`],
      new_arrival: [`✨ Just arrived at ${d.name}: ${t}!`, line, v?.features && `Loaded with ${v.features}.`, 'Be the first to take it for a spin.'],
      price_drop: [`💥 Price drop on our ${t}!`, v?.previous_price ? `Was ${money(v.previous_price)}, now ${money(v.price)}.` : line, v?.features && `Features: ${v.features}`],
      sold_celebration: [`🎉 Congratulations to the newest owner of this ${t}!`, `Thank you for choosing ${d.name}, and enjoy the ride!`],
      promotion: [`🔥 Special event at ${d.name}!`, instructions || 'Great savings across our lineup this month.'],
      event: [`📅 You're invited! Join us at ${d.name}.`, instructions || 'Food, fun and test drives for the whole family.'],
      service_tip: ['🔧 Service tip of the week:', instructions || 'Check your tire pressure monthly. It improves fuel economy, handling and tire life.', 'Our service team is here to help.'],
      review_highlight: ['⭐⭐⭐⭐⭐ Our customers say it best:', instructions ? `"${instructions}"` : '"No pressure at all. Best car buying experience we have had!"', `Thank you for trusting ${d.name}.`],
      holiday: [`🎊 Happy holidays from the whole team at ${d.name}!`, instructions || 'Wishing you and your family safe travels.'],
      engagement: ['🤔 Quick question for our community:', instructions || 'What was your very first car? Tell us in the comments! 👇'],
      team_spotlight: [`👋 Meet the team at ${d.name}!`, instructions || 'The friendly faces who make every visit a great one.'],
      custom: [instructions || `News from ${d.name}.`],
    };
    const lines = (bodies[postType] || bodies.custom).filter(Boolean);
    if (instructions && !['promotion', 'event', 'service_tip', 'review_highlight', 'holiday', 'engagement', 'team_spotlight', 'custom'].includes(postType)) lines.push(instructions);
    if (!['holiday', 'engagement', 'sold_celebration'].includes(postType) && d.call_to_action) lines.push(d.call_to_action);
    if (d.phone && platform !== 'x') lines.push(`📞 ${d.phone}`);
    if (v?.price != null && postType !== 'sold_celebration' && d.compliance_notes && platform !== 'x') lines.push(d.compliance_notes);
    const rules = PLATFORMS[platform];
    let content = lines.join(platform === 'x' ? ' ' : '\n\n');
    const tags = [...defaultTags(d)];
    if (v) tags.push(tag(v.make), tag(`${v.make}${v.model}`));
    const hashtags = [...new Set(tags)].slice(0, rules.maxHashtags);
    const budget = rules.maxChars - (hashtags.join(' ').length + 2);
    if (content.length > budget) content = `${content.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
    return { content, hashtags };
  }

  function makePost({ postType, vehicle, platform, source = 'ai', instructions = '', batch }) {
    const { content, hashtags } = writeCopy(postType, vehicle, state.dealership, instructions, platform);
    return {
      id: ++state.seq, platform, post_type: postType, title: vehicle ? `${title(vehicle)} – ${POST_TYPES[postType].toLowerCase()}` : POST_TYPES[postType],
      content, hashtags, media: vehicle ? vehicle.photos.slice(0, 4) : [], image_idea: vehicle ? `Best exterior 3/4 front photo of the ${title(vehicle)}` : 'Bright photo of the showroom or team',
      vehicle_id: vehicle ? vehicle.id : null, status: 'draft', source, batch_id: batch || null, scheduled_at: null, published_at: null,
      external_id: null, external_url: null, error: null, metrics: {}, created_at: iso(now()), updated_at: iso(now()),
    };
  }

  function composeText(p) {
    const tags = (p.hashtags || []).map((x) => (x.startsWith('#') ? x : `#${x}`));
    const missing = tags.filter((x) => !p.content.toLowerCase().includes(x.toLowerCase()));
    return missing.length ? `${p.content.trim()}\n\n${missing.join(' ')}` : p.content.trim();
  }
  function warnings(p) {
    const r = PLATFORMS[p.platform];
    const w = [];
    const text = composeText(p);
    if (!p.content.trim()) w.push('Post has no text');
    if (text.length > r.maxChars) w.push(`${text.length}/${r.maxChars} characters — too long for ${r.label}`);
    if (r.requiresMedia && !(p.media || []).length) w.push(`${r.label} requires a photo or video`);
    if ((p.hashtags || []).length > r.maxHashtags) w.push(`${p.hashtags.length} hashtags — ${r.label} works best with ${r.maxHashtags} or fewer`);
    return w;
  }
  function seeded(n) {
    const x = Math.sin(n * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }
  const BASE = { facebook: 900, instagram: 1400, tiktok: 3000, x: 500, linkedin: 350, google_business: 600 };
  function metrics(p) {
    if (p.status !== 'published' || !p.external_id) return {}; // posted by hand: no numbers to show
    const hours = Math.max(0, (now() - new Date(p.published_at).getTime()) / 3600_000);
    const growth = 0.08 + 0.92 * (1 - Math.exp(-hours / 18));
    const r = seeded(p.id);
    const reach = Math.round(BASE[p.platform] * (0.5 + r) * (p.vehicle_id ? 1.25 : 1) * growth);
    const likes = Math.round(reach * (0.03 + r * 0.04));
    return {
      reach, impressions: Math.round(reach * 1.4), likes, comments: Math.round(likes * (0.08 + r * 0.1)),
      shares: Math.round(likes * (0.05 + r * 0.08)), clicks: Math.round(reach * (0.01 + r * 0.02)), leads: p.vehicle_id ? Math.round(reach * 0.002 * (0.5 + r)) : 0,
    };
  }
  const present = (p) => p && { ...p, metrics: metrics(p), warnings: warnings(p) };
  function findPost(id) {
    const p = state.posts.find((x) => x.id === Number(id));
    if (!p) throw err(404, 'Post not found');
    return p;
  }
  const sortKey = (p) => p.scheduled_at || p.published_at || p.created_at;
  function listPosts(q) {
    let rows = state.posts.slice();
    if (q.status) {
      const set = q.status.split(',');
      rows = rows.filter((p) => set.includes(p.status));
    }
    if (q.platform) rows = rows.filter((p) => p.platform === q.platform);
    if (q.batch_id) rows = rows.filter((p) => p.batch_id === q.batch_id);
    const when = (p) => p.published_at || p.scheduled_at || p.created_at;
    if (q.from) rows = rows.filter((p) => when(p) >= q.from);
    if (q.to) rows = rows.filter((p) => when(p) <= q.to);
    rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id - a.id);
    return rows.slice(0, Number(q.limit || 500)).map(present);
  }
  const counts = () => Object.fromEntries(STATUSES.map((s) => [s, state.posts.filter((p) => p.status === s).length]));

  function publish(p, actor = 'user') {
    if (!state.accounts.some((a) => a.platform === p.platform && a.enabled)) {
      p.status = 'failed';
      p.error = `No ${PLATFORMS[p.platform].label} account connected`;
      log(actor, 'post.failed', `#${p.id}: ${p.error}`);
      return;
    }
    const blocking = warnings(p).filter((w) => /too long|requires a photo|no text/.test(w));
    if (blocking.length) {
      p.status = 'failed';
      p.error = blocking.join('; ');
      log(actor, 'post.failed', `#${p.id}: ${p.error}`);
      return;
    }
    p.status = 'published';
    p.published_at = iso(now());
    p.external_id = `sim_${p.platform}_${p.id}`;
    p.external_url = '';
    p.error = null;
    if (p.vehicle_id) {
      const v = state.vehicles.find((x) => x.id === p.vehicle_id);
      if (v) v.last_posted_at = p.published_at;
    }
    log(actor, 'post.published', `#${p.id} to ${PLATFORMS[p.platform].label} (simulated)`);
  }
  // Due scheduled posts go out whenever the demo is opened.
  function runScheduler() {
    for (const p of state.posts) if (p.status === 'scheduled' && p.scheduled_at <= iso(now())) publish(p, 'scheduler');
  }

  function generate({ post_type, platforms = [], vehicle_id, instructions = '', scheduled_at, actor = 'user', details, media }) {
    if (OBJ?.OBJECTIVE_BY_KEY[post_type]) return generateObjective({ post_type, platforms, vehicle_id, details, media });
    if (!POST_TYPES[post_type]) throw err(400, 'Unknown post type');
    const wanted = [...new Set(platforms)].filter((x) => PLATFORMS[x]);
    if (!wanted.length) throw err(400, 'Pick at least one platform');
    const vehicle = vehicle_id ? state.vehicles.find((v) => v.id === Number(vehicle_id)) : null;
    if (VEHICLE_TYPES.includes(post_type) && !vehicle) throw err(400, 'Pick a vehicle for this type of post');
    const limit = PLANS[state.dealership.plan].limits.aiPostsPerMonth;
    if (state.usage.ai_posts + wanted.length > limit) throw err(402, `Monthly AI post limit reached (${state.usage.ai_posts}/${limit}). Upgrade your plan for more.`);
    state.usage.ai_posts += wanted.length;
    const batch = `b${++state.seq}`;
    const posts = wanted.map((platform) => {
      const p = makePost({ postType: post_type, vehicle, platform, instructions, batch, source: actor === 'user' ? 'ai' : 'ai' });
      p.scheduled_at = scheduled_at || null;
      p.status = actor === 'user' ? 'draft' : state.dealership.autonomy === 'autopilot' && scheduled_at ? 'scheduled' : 'pending_approval';
      state.posts.push(p);
      return p;
    });
    if (vehicle) {
      vehicle.last_posted_at = iso(now());
      if (post_type === 'sold_celebration') vehicle.sold_celebrated = 1;
    }
    log(actor, 'content.generated', `${posts.length} ${post_type} post(s)${vehicle ? ` for ${title(vehicle)}` : ''}`);
    return { engine: 'claude', batch_id: batch, posts: posts.map(present) };
  }

  function generateObjective({ post_type, platforms, vehicle_id, details = {}, media }) {
    const objective = OBJ.OBJECTIVE_BY_KEY[post_type];
    const wanted = [...new Set(platforms)].filter((x) => PLATFORMS[x]);
    const vehicle = vehicle_id ? state.vehicles.find((v) => v.id === Number(vehicle_id)) : null;
    const fromVehicle = {};
    if (vehicle) for (const k of ['year', 'make', 'model', 'trim', 'mileage', 'price', 'previous_price', 'stock_number', 'exterior_color', 'features']) if (vehicle[k] != null && vehicle[k] !== '') fromVehicle[k] = String(vehicle[k]);
    const facts = { ...fromVehicle, ...Object.fromEntries(Object.entries(details || {}).filter(([, v]) => String(v ?? '').trim())) };
    const missing = OBJ.missingFields(post_type, facts);
    if (missing.length) throw err(400, `Please add: ${missing.join(', ')}`);
    state.usage.ai_posts += wanted.length;
    const batch = `b${++state.seq}`;
    const photos = Array.isArray(media) && media.length ? media : vehicle ? vehicle.photos.slice(0, 4) : [];
    const posts = wanted.map((platform) => {
      const copy = OBJ.writeObjectivePost({ objectiveKey: post_type, details: facts, dealer: state.dealership, platform, rules: PLATFORMS[platform] });
      const p = {
        id: ++state.seq, platform, post_type, ...copy, media: photos, vehicle_id: vehicle ? vehicle.id : null, status: 'draft', source: 'ai', batch_id: batch,
        scheduled_at: null, published_at: null, external_id: null, external_url: null, error: null, metrics: {},
        brief: { condition: objective.condition, objective: post_type, details: facts }, created_at: iso(now()), updated_at: iso(now()),
      };
      state.posts.push(p);
      return p;
    });
    if (vehicle) vehicle.last_posted_at = iso(now());
    log('user', 'content.generated', `${posts.length} ${post_type} post(s) for ${OBJ.vehicleName(facts) || 'a vehicle'}`);
    return { engine: 'claude', batch_id: batch, posts: posts.map(present) };
  }

  // ---------- analytics ----------
  function analytics(days) {
    const from = iso(now() - days * DAY);
    const posts = state.posts.filter((p) => p.status === 'published' && p.published_at >= from).map(present);
    const M = ['reach', 'impressions', 'likes', 'comments', 'shares', 'clicks', 'leads'];
    const empty = () => Object.fromEntries([['posts', 0], ...M.map((m) => [m, 0])]);
    const add = (t, p) => {
      t.posts++;
      for (const m of M) t[m] += p.metrics[m] || 0;
    };
    const rates = (t) => {
      const e = t.likes + t.comments + t.shares;
      return { ...t, engagements: e, engagement_rate: t.reach ? +((e / t.reach) * 100).toFixed(2) : 0 };
    };
    const totals = empty();
    const byP = {};
    const byT = {};
    const daily = {};
    for (const p of posts) {
      add(totals, p);
      add((byP[p.platform] ??= empty()), p);
      add((byT[p.post_type] ??= empty()), p);
      add((daily[p.published_at.slice(0, 10)] ??= empty()), p);
    }
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = iso(now() - i * DAY).slice(0, 10);
      const x = daily[day] || empty();
      series.push({ day, posts: x.posts, reach: x.reach, engagements: x.likes + x.comments + x.shares });
    }
    const score = (p) => p.metrics.likes + 2 * p.metrics.comments + 3 * p.metrics.shares;
    return {
      days, totals: rates(totals),
      by_platform: Object.entries(byP).map(([platform, t]) => ({ platform, label: PLATFORMS[platform].label, ...rates(t) })),
      by_type: Object.entries(byT).map(([type, t]) => ({ type, label: POST_TYPES[type], ...rates(t) })),
      series,
      top_posts: posts.sort((a, b) => score(b) - score(a)).slice(0, 5).map((p) => ({ id: p.id, platform: p.platform, post_type: p.post_type, title: p.title, content: p.content.slice(0, 160), metrics: p.metrics, external_url: '' })),
    };
  }

  // ---------- plan / usage ----------
  function entitlements() {
    const d = state.dealership;
    const plan = PLANS[d.plan];
    return { plan: d.plan, planName: plan.name, active: true, reason: '', limits: plan.limits, features: plan.features };
  }
  function usageSummary() {
    return {
      ...entitlements(),
      usage: {
        aiPostsThisMonth: state.usage.ai_posts, aiChatsThisMonth: state.usage.ai_chat_turns, socialAccounts: state.accounts.length,
        users: state.team.members.length, autopilotRules: state.rules.length,
      },
    };
  }
  function me() {
    const d = state.dealership;
    return {
      user: { id: 1, email: 'demo@riverside.example', name: 'Demo Manager', is_superadmin: false }, role: 'owner',
      dealership: { id: 1, name: d.name, plan: d.plan, subscription_status: d.subscription_status, trial_ends_at: d.trial_ends_at, entitlements: entitlements() },
      dealerships: [{ id: 1, name: d.name, role: 'owner' }], product_name: 'Dealer Social',
    };
  }

  // ---------- inbox ----------
  function triage(text, author, rating) {
    const t = text.toLowerCase();
    const has = (...w) => w.some((x) => t.includes(x));
    const first = (author || '').split(/\s+/)[0] || 'there';
    const phone = state.dealership.phone ? ` at ${state.dealership.phone}` : '';
    if (has('http://', 'https://', 'crypto', 'dm me for')) return { intent: 'spam', sentiment: 'neutral', priority: 'low', is_lead: false, suggested_reply: '' };
    if (has('terrible', 'worst', 'rude', 'never again', 'disappointed', 'problem') || (rating && rating <= 2))
      return { intent: 'complaint', sentiment: 'negative', priority: 'high', is_lead: false, suggested_reply: `Hi ${first}, we're really sorry to hear this. Please send us a DM or call us${phone} so a manager can help personally.` };
    if (has('price', 'available', 'trade', 'financ', 'lease', 'test drive', 'how much', 'payment'))
      return { intent: 'lead', sentiment: 'positive', priority: 'high', is_lead: true, suggested_reply: `Hi ${first}! Thanks for reaching out. We just sent you a DM with the details, or call us${phone} to book a test drive.` };
    if (t.includes('?')) return { intent: 'question', sentiment: 'neutral', priority: 'normal', is_lead: false, suggested_reply: `Great question, ${first}! Send us a DM or call${phone} and our team will get you an answer right away.` };
    return { intent: 'praise', sentiment: 'positive', priority: 'low', is_lead: false, suggested_reply: `Thank you so much, ${first}! We appreciate you. 🙌` };
  }
  const SAMPLES = [
    ['facebook', 'comment', 'Marc Doiron', 'How much for the F-150? Still available?'],
    ['instagram', 'comment', 'lily.b', 'That ID.4 is gorgeous 😍'],
    ['google_business', 'review', 'Nathalie Gaudet', 'Quick, friendly service and they explained everything. Will be back!', 5],
    ['facebook', 'comment', 'Tom Hebert', 'Do you do financing for first-time buyers?'],
    ['facebook', 'comment', 'win_big_now', 'Claim your prize now https://scam.example'],
    ['instagram', 'dm', 'chris_maritimes', 'Are you open on Sundays?'],
  ];
  function ingest([platform, kind, author, text, rating]) {
    const tr = triage(text, author, rating);
    const m = { id: ++state.seq, platform, kind, author, text, rating: rating || null, post_id: null, ...tr, reply: null, status: 'new', received_at: iso(now()), replied_at: null };
    if (state.dealership.autonomy === 'autopilot') {
      if (tr.intent === 'spam') m.status = 'dismissed';
      else if (tr.intent === 'lead' || tr.intent === 'complaint') m.status = 'escalated';
      else if (tr.suggested_reply) Object.assign(m, { status: 'replied', reply: tr.suggested_reply, replied_at: iso(now()) });
    }
    state.inbox.unshift(m);
    log('bot', 'inbox.received', `${PLATFORMS[platform].label} ${kind} from ${author} → ${tr.intent}`);
    return m;
  }
  const PRI = { urgent: 0, high: 1, normal: 2, low: 3 };

  // ---------- chat (scripted demo of the AI assistant) ----------
  function nextSlot(daysAhead, hour, minute) {
    const d = new Date(now() + daysAhead * DAY);
    d.setHours(hour, minute, 0, 0);
    return iso(d);
  }
  function chatReply(text) {
    const t = text.toLowerCase();
    const available = state.vehicles.filter((v) => v.status === 'available');
    if (/plan|week|calendar/.test(t)) {
      const picks = available.slice().sort((a, b) => (a.last_posted_at || '').localeCompare(b.last_posted_at || '')).slice(0, 4);
      const lines = [];
      picks.forEach((v, i) => {
        const r = generate({ post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'], vehicle_id: v.id, scheduled_at: nextSlot(i + 1, 10, 15), actor: 'bot' });
        lines.push(`• ${new Date(r.posts[0].scheduled_at).toLocaleDateString(undefined, { weekday: 'long' })} 10:15: ${title(v)} spotlight (posts #${r.posts.map((p) => p.id).join(', #')})`);
      });
      const tip = generate({ post_type: 'service_tip', platforms: ['facebook', 'google_business'], instructions: 'Winter tire swap season: book early, we’re open Saturdays.', scheduled_at: nextSlot(3, 9, 30), actor: 'bot' });
      lines.push(`• ${new Date(tip.posts[0].scheduled_at).toLocaleDateString(undefined, { weekday: 'long' })} 9:30: winter tire service tip (posts #${tip.posts.map((p) => p.id).join(', #')})`);
      return {
        reply: `Here's next week, built from your current inventory and the vehicles we haven't featured recently:\n\n${lines.join('\n')}\n\nYou're in Assist mode, so all ${lines.length * 2} posts are waiting in Approvals. Approve them and they'll go out on schedule.\n\nNext step: want me to add a new-arrival post for the Atlas on TikTok too?`,
        tools: ['get_overview', 'search_inventory', 'generate_posts'],
      };
    }
    if (/inbox|comment|repl|lead|review/.test(t)) {
      const open = state.inbox.filter((m) => m.status === 'new');
      const leads = open.filter((m) => m.is_lead);
      const lines = open.filter((m) => m.intent !== 'spam').map((m) => `• ${m.author} (${PLATFORMS[m.platform].label} ${m.kind}, ${m.intent}): drafted a reply`);
      return {
        reply: open.length
          ? `I went through ${open.length} new message${open.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}\n\n🔥 Hot leads: ${leads.map((m) => m.author).join(', ') || 'none right now'}. Call them today; they asked about buying or trading.\n\nReplies are saved as suggestions in the Inbox for you to send (Assist mode). Spam is flagged for dismissal.`
          : 'Your inbox is clear. No new comments, messages or reviews right now.',
        tools: ['list_inbox', 'reply_to_message'],
      };
    }
    if (/how did|stats|analytic|month|result|perform/.test(t)) {
      const a = analytics(30);
      const best = a.by_platform.slice().sort((x, y) => y.reach - x.reach)[0];
      const bestType = a.by_type.slice().sort((x, y) => y.engagement_rate - x.engagement_rate)[0];
      return {
        reply: `Last 30 days:\n\n• ${a.totals.posts} posts published\n• ${a.totals.reach.toLocaleString()} people reached\n• ${a.totals.engagement_rate}% engagement rate\n• ${a.totals.leads} leads attributed to vehicle posts\n\n${best ? `${best.label} is your strongest network (${best.reach.toLocaleString()} reach). ` : ''}${bestType ? `${bestType.label} posts get the best engagement (${bestType.engagement_rate}%). ` : ''}\n\nRecommendation: post more vehicle spotlights with a clear price, and add a TikTok carousel for new arrivals. It gets the widest reach for its effort.`,
        tools: ['get_analytics'],
      };
    }
    if (/sold/.test(t)) {
      const v = state.vehicles.find((x) => t.includes(x.model.toLowerCase())) || state.vehicles.find((x) => x.status === 'available');
      v.status = 'sold';
      const r = generate({ post_type: 'sold_celebration', platforms: ['facebook', 'instagram'], vehicle_id: v.id, actor: 'bot' });
      return { reply: `Done. The ${title(v)} is marked sold, and I wrote a celebration post for Facebook and Instagram (#${r.posts.map((p) => p.id).join(', #')}). They're in Approvals. Add a photo of the happy owner before approving, if you have one!`, tools: ['update_vehicle', 'generate_posts'] };
    }
    if (/autopilot|every|rule/.test(t)) {
      const rule = { id: ++state.seq, name: 'Weekday spotlight', post_type: 'vehicle_spotlight', platforms: ['facebook', 'instagram'], days_of_week: [1, 2, 3, 4, 5], time_of_day: '10:00', instructions: '', enabled: true, last_run_at: null, next_run_at: nextSlot(1, 10, 0) };
      state.rules.push(rule);
      log('bot', 'autopilot.rule_created', rule.name);
      return { reply: 'Set up: a vehicle spotlight every weekday at 10:00 on Facebook and Instagram. Each time, I’ll pick the car that has gone longest without being featured. You can change it under Autopilot.', tools: ['save_autopilot_rule'] };
    }
    if (/new|arrival|newest|post/.test(t)) {
      const v = available.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const platforms = [...new Set(state.accounts.filter((a) => a.enabled).map((a) => a.platform))];
      const r = generate({ post_type: 'new_arrival', platforms, vehicle_id: v.id, actor: 'bot' });
      return { reply: `Your newest arrival is the ${title(v)}. I wrote a version for each connected account (${platforms.map((p) => PLATFORMS[p].label).join(', ')}): posts #${r.posts.map((p) => p.id).join(', #')}. They're waiting in Approvals.`, tools: ['search_inventory', 'generate_posts'] };
    }
    return {
      reply: 'I can plan your week, post specific vehicles, work through the inbox, mark cars sold, set up autopilot rules, or explain your results. Try one of the suggestions above!\n\n(This demo uses scripted answers. The real assistant is powered by Claude and understands any request.)',
      tools: [],
    };
  }

  // ---------- router ----------
  function route(method, path, q, body) {
    const d = state.dealership;
    const seg = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
    const [a, b, c] = seg;
    const idOf = (x) => Number(x);

    if (a === 'public' && b === 'plans') return { plans: PLANS, trial_days: 14, product_name: 'Dealer Social', sales_email: 'sales@example.com' };
    if (a === 'me') {
      if (!b) return me();
      if (b === 'dealerships') throw err(400, 'Adding rooftops is available in the full product');
      return { ok: true };
    }
    if (a === 'auth') return { ok: true };
    if (a === 'meta')
      return { ai_enabled: true, ai_model: 'demo mode', platforms: PLATFORMS, post_types: POST_TYPES, post_statuses: STATUSES,
        general_post_types: ['promotion', 'event', 'service_tip', 'review_highlight', 'holiday', 'engagement', 'team_spotlight', 'custom'],
        objectives: OBJ.OBJECTIVES, fields: OBJ.FIELDS,
        oauth: { meta: { label: 'Facebook & Instagram', platforms: ['facebook', 'instagram'], configured: true }, google: { label: 'Google Business Profile', platforms: ['google_business'], configured: true }, linkedin: { label: 'LinkedIn', platforms: ['linkedin'], configured: true }, x: { label: 'X (Twitter)', platforms: ['x'], configured: true }, tiktok: { label: 'TikTok', platforms: ['tiktok'], configured: true } },
        billing_enabled: true, plans: PLANS, role: 'owner', user: me().user, product_name: 'Dealer Social', support_email: 'support@example.com' };
    if (a === 'dashboard') {
      const t = iso(now());
      return {
        dealership: d, subscription: usageSummary(), post_counts: counts(),
        inbox: { new: state.inbox.filter((m) => m.status === 'new').length, escalated: state.inbox.filter((m) => m.status === 'escalated').length, leads: state.inbox.filter((m) => m.is_lead && m.status !== 'dismissed').length },
        upcoming: listPosts({ status: 'scheduled', from: t }).reverse().slice(0, 8), needs_approval: listPosts({ status: 'pending_approval', limit: 5 }),
        failed: listPosts({ status: 'failed', limit: 5 }), analytics: analytics(7), activity: state.activity.slice(0, 25), accounts: state.accounts,
        inventory: ['available', 'pending', 'sold'].map((s) => ({ status: s, n: state.vehicles.filter((v) => v.status === s).length })).filter((r) => r.n),
        checklist: { profile: !!(d.phone && d.city), accounts: state.accounts.length > 0, live_account: state.accounts.some((x) => x.mode === 'live'), inventory: state.vehicles.length > 0, first_post: counts().published > 0, autopilot: state.rules.length > 0 },
      };
    }
    if (a === 'activity') return state.activity;
    if (a === 'dealership') {
      if (method === 'PUT') {
        if (body.autonomy === 'autopilot' && !PLANS[d.plan].features.autopilot) throw err(402, 'Full autopilot is available on the Pro plan and above');
        Object.assign(d, body, { feed_marks_sold: body.feed_marks_sold === undefined ? d.feed_marks_sold : body.feed_marks_sold ? 1 : 0 });
        log('user', 'dealership.updated', body.autonomy ? `autonomy: ${body.autonomy}` : 'profile');
      }
      return d;
    }
    if (a === 'accounts') {
      if (method === 'GET') return state.accounts;
      if (method === 'POST') {
        if (state.accounts.length >= PLANS[d.plan].limits.socialAccounts) throw err(402, `Your ${PLANS[d.plan].name} plan includes ${PLANS[d.plan].limits.socialAccounts} social accounts. Upgrade to add more.`);
        const acct = { id: ++state.seq, platform: body.platform, display_name: body.display_name, mode: 'simulated', external_id: '', has_token: false, token_hint: '', enabled: true, last_error: null };
        state.accounts.push(acct);
        return acct;
      }
      const acct = state.accounts.find((x) => x.id === idOf(b));
      if (method === 'DELETE') {
        state.accounts = state.accounts.filter((x) => x !== acct);
        return null;
      }
      Object.assign(acct, { display_name: body.display_name ?? acct.display_name, enabled: body.enabled ?? acct.enabled });
      return acct;
    }
    if (a === 'oauth') {
      if (c === 'start') return { url: `#/settings?connect=demo-${b}` };
      const provider = b === 'pending' ? c.replace('demo-', '') : '';
      const options = {
        meta: [['facebook', 'Riverside Motors'], ['instagram', '@riversidemotors'], ['facebook', 'Riverside Motors Service Centre']],
        google: [['google_business', 'Riverside Motors – Moncton']],
        linkedin: [['linkedin', 'Riverside Motors Ltd.']],
        x: [['x', '@RiversideMotors']],
        tiktok: [['tiktok', '@riversidemotors']],
      }[provider] || [];
      if (seg[3] === 'connect') {
        for (const i of body.indexes || []) {
          const [platform, name] = options[i];
          const existing = state.accounts.find((x) => x.platform === platform && x.display_name === name);
          if (existing) Object.assign(existing, { mode: 'live', token_hint: '••••demo', has_token: true });
          else state.accounts.push({ id: ++state.seq, platform, display_name: name, mode: 'live', external_id: 'demo', has_token: true, token_hint: '••••demo', enabled: true, last_error: null });
        }
        log('user', 'account.connected', `${(body.indexes || []).length} account(s) via ${provider}`);
        return { connected: (body.indexes || []).length };
      }
      return options.map(([platform, display_name], index) => ({ index, platform, display_name, external_id: 'demo', already_connected: state.accounts.some((x) => x.platform === platform && x.display_name === display_name && x.mode === 'live') }));
    }
    if (a === 'vehicles') {
      if (b === 'import') {
        const lines = String(body).trim().split(/\r?\n/);
        const head = lines.shift().split(',').map((h) => h.trim().toLowerCase());
        let created = 0;
        for (const line of lines) {
          const cells = line.split(',');
          const get = (...names) => cells[head.findIndex((h) => names.includes(h))]?.trim();
          if (!get('make') || !get('model')) continue;
          state.vehicles.push({ id: ++state.seq, stock_number: get('stock', 'stock #', 'stock_number') || '', vin: get('vin') || '', year: Number(get('year')) || null, make: get('make'), model: get('model'), trim: get('trim') || '', condition: 'used', price: Number(String(get('price') || '').replace(/[^0-9.]/g, '')) || null, mileage: Number(String(get('mileage', 'odometer', 'km') || '').replace(/[^0-9]/g, '')) || null, exterior_color: get('color', 'exterior color') || '', features: get('features', 'options') || '', photos: [photo('#3d5a80', `${get('year') || ''} ${get('make')} ${get('model')}`)], status: 'available', previous_price: null, sold_celebrated: 0, last_posted_at: null, created_at: iso(now()), updated_at: iso(now()) });
          created++;
        }
        return { created, updated: 0, errors: [] };
      }
      if (b === 'sync-feed') throw err(400, 'Add your inventory feed URL in Settings first');
      if (method === 'GET' && !b) {
        let rows = state.vehicles.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
        if (q.status) rows = rows.filter((v) => v.status === q.status);
        if (q.q) rows = rows.filter((v) => `${v.year} ${v.make} ${v.model} ${v.trim} ${v.stock_number}`.toLowerCase().includes(q.q.toLowerCase()));
        return rows;
      }
      if (method === 'POST') {
        const v = { id: ++state.seq, stock_number: '', vin: '', trim: '', exterior_color: '', features: '', condition: 'used', status: 'available', previous_price: null, sold_celebrated: 0, last_posted_at: null, created_at: iso(now()), updated_at: iso(now()), ...body };
        v.year = Number(v.year) || null;
        v.price = v.price ? Number(v.price) : null;
        v.mileage = v.mileage ? Number(v.mileage) : null;
        v.photos = v.photos?.length ? v.photos : [photo('#3d5a80', `${v.year || ''} ${v.make} ${v.model}`)];
        state.vehicles.push(v);
        return v;
      }
      const v = state.vehicles.find((x) => x.id === idOf(b));
      if (!v) throw err(404, 'Vehicle not found');
      if (method === 'DELETE') {
        state.vehicles = state.vehicles.filter((x) => x !== v);
        return null;
      }
      if (method === 'PATCH') {
        const price = body.price ? Number(body.price) : v.price;
        if (price < v.price) v.previous_price = v.price;
        Object.assign(v, body, { price, year: Number(body.year ?? v.year) || null, mileage: body.mileage ? Number(body.mileage) : v.mileage, updated_at: iso(now()) });
        if (!v.photos?.length) v.photos = [photo('#3d5a80', title(v))];
      }
      return v;
    }
    if (a === 'posts') {
      if (!b && method === 'GET') return listPosts(q);
      if (!b && method === 'POST') {
        const p = makePost({ postType: body.post_type || 'custom', platform: body.platform, source: 'manual' });
        Object.assign(p, { content: body.content || '', hashtags: body.hashtags || [] });
        state.posts.push(p);
        return present(p);
      }
      if (b === 'approve-batch') return body.ids.map((i) => route('POST', `/api/posts/${i}/approve`, {}, {}));
      const p = findPost(b);
      const locked = ['published', 'publishing'].includes(p.status);
      if (!c) {
        if (method === 'GET') return present(p);
        if (method === 'DELETE') {
          state.posts = state.posts.filter((x) => x !== p);
          log('user', 'post.deleted', `#${p.id}`);
          return null;
        }
        if (locked) throw err(409, `Post is ${p.status} and can no longer be edited`);
        for (const k of ['content', 'hashtags', 'media', 'scheduled_at']) if (body[k] !== undefined) p[k] = body[k];
        p.updated_at = iso(now());
        log('user', 'post.edited', `#${p.id}`);
        return present(p);
      }
      if (c === 'rewrite') {
        const ins = String(body.instruction || '').toLowerCase();
        let content = p.content;
        if (/short|brief|concise/.test(ins)) content = content.split('\n\n').slice(0, 2).join('\n\n');
        else if (/french|français/.test(ins)) content = `${content}\n\n🇫🇷 Venez l’essayer! Appelez-nous au ${state.dealership.phone}.`;
        else if (/fun|emoji|playful/.test(ins)) content = `🔥😎 ${content.replace(/\.$/, '!')} 🚀`;
        else content = `${content.split('\n\n')[0]}\n\nDon’t miss it: these don’t stay on our lot for long!\n\n${content.split('\n\n').slice(1).join('\n\n')}`;
        return { content, hashtags: p.hashtags };
      }
      if (locked) throw err(409, `Post is already ${p.status}`);
      if (c === 'submit') p.status = 'pending_approval';
      if (c === 'mark-posted') {
        Object.assign(p, { status: 'published', published_at: iso(now()), external_id: null, external_url: body?.url || null, error: null });
        log('user', 'post.posted_manually', `#${p.id} on ${PLATFORMS[p.platform].label}`);
      }
      if (c === 'approve') {
        p.status = p.scheduled_at ? 'scheduled' : 'approved';
        p.error = null;
        log('user', 'post.approved', `#${p.id}`);
      }
      if (c === 'reject') {
        p.status = 'rejected';
        p.error = body.reason || null;
      }
      if (c === 'schedule') {
        p.scheduled_at = body.scheduled_at || iso(now());
        p.status = 'scheduled';
        log('user', 'post.scheduled', `#${p.id} for ${p.scheduled_at}`);
      }
      if (c === 'unschedule') Object.assign(p, { status: 'draft', scheduled_at: null });
      if (c === 'publish') publish(p);
      runScheduler();
      return present(p);
    }
    if (a === 'generate') return generate(body || {});
    if (a === 'media') {
      // Keep the (already resized) photo in the browser as a data URL.
      if (!(body instanceof Blob)) throw err(400, 'Upload a JPG, PNG or WebP photo');
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ url: reader.result });
        reader.readAsDataURL(body);
      });
    }
    if (a === 'chat') {
      if (method === 'GET') return state.chats[b] || [];
      const id = body.conversation_id || `c${++state.seq}`;
      const limit = PLANS[d.plan].limits.aiChatTurnsPerMonth;
      if (!limit) throw err(402, 'The AI assistant is available on the Pro plan and above');
      state.usage.ai_chat_turns++;
      const r = chatReply(body.message);
      (state.chats[id] ??= []).push({ role: 'user', text: body.message }, { role: 'assistant', text: r.reply, tools: r.tools });
      return { conversation_id: id, reply: r.reply, actions: r.tools.map((tool) => ({ tool, ok: true })) };
    }
    if (a === 'autopilot') {
      if (method === 'GET') return state.rules;
      if (method === 'POST' && !c) {
        if (state.rules.length >= PLANS[d.plan].limits.autopilotRules) throw err(402, 'Upgrade to add more autopilot rules');
        const rule = { id: ++state.seq, enabled: true, last_run_at: null, next_run_at: nextSlot(1, Number(body.time_of_day.split(':')[0]), Number(body.time_of_day.split(':')[1])), ...body };
        state.rules.push(rule);
        return rule;
      }
      const rule = state.rules.find((x) => x.id === idOf(c));
      if (method === 'DELETE') {
        state.rules = state.rules.filter((x) => x !== rule);
        return null;
      }
      if (seg[3] === 'run') {
        const pick = {
          vehicle_spotlight: () => state.vehicles.filter((v) => v.status === 'available').sort((x, y) => (x.last_posted_at || '').localeCompare(y.last_posted_at || ''))[0],
          new_arrival: () => state.vehicles.filter((v) => v.status === 'available' && !v.last_posted_at)[0],
          price_drop: () => state.vehicles.find((v) => v.status === 'available' && v.previous_price > v.price),
          sold_celebration: () => state.vehicles.find((v) => v.status === 'sold' && !v.sold_celebrated),
        }[rule.post_type];
        const v = pick ? pick() : null;
        rule.last_run_at = iso(now());
        if (pick && !v) return { skipped: true, reason: 'No matching vehicle in inventory right now' };
        return { skipped: false, ...generate({ post_type: rule.post_type, platforms: rule.platforms, vehicle_id: v?.id, instructions: rule.instructions, scheduled_at: iso(now() + 3600_000), actor: 'autopilot' }) };
      }
      Object.assign(rule, body);
      if (body.enabled === false) rule.next_run_at = null;
      else if (!rule.next_run_at) rule.next_run_at = nextSlot(1, 10, 0);
      return rule;
    }
    if (a === 'inbox') {
      if (b === 'simulate') return Array.from({ length: Math.min(10, body.count || 3) }, () => ingest(SAMPLES[Math.floor(Math.random() * SAMPLES.length)]));
      if (b === 'sync') return { added: 0 };
      if (!b) {
        let rows = state.inbox.slice();
        if (q.status) rows = rows.filter((m) => m.status === q.status);
        if (q.lead === '1') rows = rows.filter((m) => m.is_lead);
        return rows.sort((x, y) => PRI[x.priority] - PRI[y.priority] || y.received_at.localeCompare(x.received_at));
      }
      const m = state.inbox.find((x) => x.id === idOf(b));
      if (c === 'reply') Object.assign(m, { reply: body.text, status: 'replied', replied_at: iso(now()) });
      if (c === 'dismiss') m.status = 'dismissed';
      if (c === 'escalate') Object.assign(m, { status: 'escalated', is_lead: true });
      log('user', `inbox.${c === 'reply' ? 'replied' : c === 'dismiss' ? 'dismissed' : 'escalated'}`, `#${m.id} ${m.author}`);
      return m;
    }
    if (a === 'analytics') return b === 'refresh' ? { updated: state.posts.filter((p) => p.status === 'published').length } : analytics(Math.min(365, Number(q.days || 30)));
    if (a === 'team') {
      if (b === 'invites' && method === 'POST') {
        state.team.invites.push({ id: ++state.seq, email: body.email, role: body.role, expires_at: iso(now() + 7 * DAY), created_at: iso(now()) });
        return { invite_url: 'https://app.dealersocial.example/invite?token=demo', emailed: true };
      }
      if (b === 'invites' && method === 'DELETE') state.team.invites = state.team.invites.filter((x) => x.id !== idOf(c));
      if (b === 'members' && method === 'PATCH') state.team.members.find((x) => x.id === idOf(c)).role = body.role;
      if (b === 'members' && method === 'DELETE') state.team.members = state.team.members.filter((x) => x.id !== idOf(c));
      return state.team;
    }
    if (a === 'billing') {
      if (b === 'checkout') {
        Object.assign(d, { plan: body.plan, billing_interval: body.interval || 'month', subscription_status: 'active', current_period_end: iso(now() + (body.interval === 'year' ? 365 : 30) * DAY), stripe_customer_id: 'cus_demo' });
        log('billing', 'subscription.updated', `${d.plan} · active`);
        return { url: '#/billing?checkout=success' };
      }
      if (b === 'portal') throw err(400, 'In the full product this opens Stripe’s secure billing portal (card, invoices, cancel).');
      return { ...usageSummary(), subscription_status: d.subscription_status, trial_ends_at: d.trial_ends_at, current_period_end: d.current_period_end, billing_interval: d.billing_interval, has_billing_account: !!d.stripe_customer_id, billing_enabled: true, plans: PLANS };
    }
    throw err(404, 'Not found');
  }

  load();
  runScheduler();
  save();

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const idx = url.pathname.indexOf('/api/');
    if (idx === -1) return realFetch(input, init);
    const path = url.pathname.slice(idx);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string' && (init.headers?.['content-type'] || '').includes('json')) body = JSON.parse(body);
    await new Promise((r) => setTimeout(r, path.includes('/chat') || path.includes('/generate') ? 700 : 60));
    try {
      await objectivesReady;
      const data = await route(method, path, Object.fromEntries(url.searchParams), body);
      save();
      if (data === null) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(data), { status: method === 'POST' && ['generate', 'posts', 'accounts', 'vehicles'].includes(path.split('/')[2]) && path.split('/').length === 3 ? 201 : 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      save();
      return new Response(JSON.stringify({ error: e.message || 'Something went wrong' }), { status: e.status || 500, headers: { 'content-type': 'application/json' } });
    }
  };

  // The artifact viewer blocks native dialogs; accept confirmations in the demo.
  window.confirm = () => true;
  window.prompt = (msg, def) => def ?? '';
})();
