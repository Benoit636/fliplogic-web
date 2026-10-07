// One-time Stripe setup: creates the Starter/Pro/Elite products and prices, the customer
// portal configuration and the webhook endpoint, then prints the .env lines to paste.
//   STRIPE_SECRET_KEY=sk_live_... APP_URL=https://app.yourdomain.com npm run stripe:setup
import Stripe from 'stripe';
import { config } from '../src/config.js';
import { PLANS } from '../src/plans.js';

if (!config.stripeSecretKey) {
  console.error('Set STRIPE_SECRET_KEY first (test key sk_test_… to try it, live key when you launch).');
  process.exit(1);
}
const stripe = new Stripe(config.stripeSecretKey);
const currency = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const env = [];
const portalProducts = [];

for (const [key, plan] of Object.entries(PLANS)) {
  const product = await stripe.products.create({
    name: `${config.productName} ${plan.name}`,
    description: plan.tagline,
    metadata: { plan: key },
  });
  const monthly = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: plan.monthly * 100,
    recurring: { interval: 'month' },
    lookup_key: `${key}_monthly_${currency}`,
    metadata: { plan: key },
  });
  const yearly = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: plan.yearly * 100,
    recurring: { interval: 'year' },
    lookup_key: `${key}_yearly_${currency}`,
    metadata: { plan: key },
  });
  env.push(`STRIPE_PRICE_${key.toUpperCase()}_MONTHLY=${monthly.id}`, `STRIPE_PRICE_${key.toUpperCase()}_YEARLY=${yearly.id}`);
  portalProducts.push({ product: product.id, prices: [monthly.id, yearly.id] });
  console.log(`✓ ${plan.name}: ${currency.toUpperCase()} ${plan.monthly}/mo, ${plan.yearly}/yr`);
}

await stripe.billingPortal.configurations.create({
  business_profile: { headline: `${config.productName} — manage your subscription` },
  features: {
    customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations', products: portalProducts },
  },
  default_return_url: `${config.appUrl}/app#/billing`,
});
console.log('✓ Customer portal configured');

if (config.appUrl.startsWith('https://')) {
  const hook = await stripe.webhookEndpoints.create({
    url: `${config.appUrl}/webhooks/stripe`,
    enabled_events: [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed',
      'invoice.payment_failed',
    ],
  });
  env.push(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
  console.log(`✓ Webhook endpoint → ${hook.url}`);
} else {
  console.log('! APP_URL is not https — skipped webhook creation. For local testing run: stripe listen --forward-to localhost:3000/webhooks/stripe');
}

console.log('\nAdd these lines to your .env and restart:\n');
console.log(env.join('\n'));
