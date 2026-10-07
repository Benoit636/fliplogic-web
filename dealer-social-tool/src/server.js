import { config, isProduction } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { aiEnabled } from './ai/client.js';
import { stripeEnabled } from './services/billing.js';
import { startWorker, stopWorker } from './services/worker.js';

if (isProduction && config.appSecret === 'dev-insecure-secret-change-me') {
  console.error("APP_SECRET must be set in production (it encrypts your customers' social tokens).");
  process.exit(1);
}

openDb();
startWorker(config.schedulerIntervalSeconds);

const server = createApp().listen(config.port, () => {
  console.log(`${config.productName} running on ${config.appUrl} (port ${config.port})`);
  console.log(aiEnabled() ? `AI: ${config.aiModel}` : 'AI: off (set ANTHROPIC_API_KEY) — using templates');
  console.log(stripeEnabled() ? 'Billing: Stripe' : 'Billing: off (set STRIPE_SECRET_KEY) — trials and admin-comped plans only');
  if (!config.superadminEmails.length) console.log('Tip: set SUPERADMIN_EMAILS to your email to open the /admin console.');
});

function shutdown() {
  stopWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
