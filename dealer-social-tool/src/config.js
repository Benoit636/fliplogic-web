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

const env = process.env;
const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 3000),
  appUrl: (env.APP_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  appSecret: env.APP_SECRET || 'dev-insecure-secret-change-me',
  productName: env.PRODUCT_NAME || 'Dealer Social',
  supportEmail: env.SUPPORT_EMAIL || 'support@example.com',
  superadminEmails: list(env.SUPERADMIN_EMAILS),
  databasePath: env.DATABASE_PATH || './data/dealer-social.db',
  backupDir: env.BACKUP_DIR || './data/backups',
  trialDays: Number(env.TRIAL_DAYS || 14),

  anthropicApiKey: env.ANTHROPIC_API_KEY || '',
  aiModel: env.AI_MODEL || 'claude-opus-5-5',
  schedulerIntervalSeconds: Number(env.SCHEDULER_INTERVAL_SECONDS || 30),

  stripeSecretKey: env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  stripePrices: {
    starter: { month: env.STRIPE_PRICE_STARTER_MONTHLY || '', year: env.STRIPE_PRICE_STARTER_YEARLY || '' },
    pro: { month: env.STRIPE_PRICE_PRO_MONTHLY || '', year: env.STRIPE_PRICE_PRO_YEARLY || '' },
    elite: { month: env.STRIPE_PRICE_ELITE_MONTHLY || '', year: env.STRIPE_PRICE_ELITE_YEARLY || '' },
  },

  emailFrom: env.EMAIL_FROM || 'Dealer Social <no-reply@example.com>',
  resendApiKey: env.RESEND_API_KEY || '',

  metaAppId: env.META_APP_ID || '',
  metaAppSecret: env.META_APP_SECRET || '',
  metaVerifyToken: env.META_VERIFY_TOKEN || '',
  metaGraphVersion: env.META_GRAPH_VERSION || 'v21.0',
  googleClientId: env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
  tiktokClientKey: env.TIKTOK_CLIENT_KEY || '',
  tiktokClientSecret: env.TIKTOK_CLIENT_SECRET || '',
  linkedinClientId: env.LINKEDIN_CLIENT_ID || '',
  linkedinClientSecret: env.LINKEDIN_CLIENT_SECRET || '',
  linkedinVersion: env.LINKEDIN_VERSION || '202608',
  xClientId: env.X_CLIENT_ID || '',
  xClientSecret: env.X_CLIENT_SECRET || '',
};

export const isProduction = config.env === 'production';

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

export const POST_STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected'];
