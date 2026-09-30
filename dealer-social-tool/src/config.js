import fs from 'node:fs';
import path from 'node:path';

// Minimal .env loader so the project has no extra dependency for it.
function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();

export const config = {
  port: Number(process.env.PORT || 3000),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  databasePath: process.env.DATABASE_PATH || './data/dealer-social.db',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-5-5',
  schedulerIntervalSeconds: Number(process.env.SCHEDULER_INTERVAL_SECONDS || 30),
  metaVerifyToken: process.env.META_VERIFY_TOKEN || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaGraphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
};

export const PLATFORMS = {
  facebook: { label: 'Facebook', maxChars: 63206, requiresMedia: false, maxHashtags: 5 },
  instagram: { label: 'Instagram', maxChars: 2200, requiresMedia: true, maxHashtags: 20 },
  tiktok: { label: 'TikTok', maxChars: 2200, requiresMedia: true, maxHashtags: 8 },
  x: { label: 'X (Twitter)', maxChars: 280, requiresMedia: false, maxHashtags: 2 },
  linkedin: { label: 'LinkedIn', maxChars: 3000, requiresMedia: false, maxHashtags: 5 },
  google_business: { label: 'Google Business Profile', maxChars: 1500, requiresMedia: false, maxHashtags: 0 },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS);

export const POST_TYPES = {
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

export const POST_TYPE_KEYS = Object.keys(POST_TYPES);

// Post types that are about one specific vehicle.
export const VEHICLE_POST_TYPES = ['vehicle_spotlight', 'new_arrival', 'price_drop', 'sold_celebration'];

export const POST_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'rejected',
];
