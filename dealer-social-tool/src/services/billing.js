// Stripe subscription billing: Checkout to subscribe, Customer Portal to manage, webhooks to stay in sync.
import Stripe from 'stripe';
import { config } from '../config.js';
import { get, run, logActivity } from '../db.js';
import { runWithTenant } from '../tenant.js';
import { PLANS, PLAN_KEYS } from '../plans.js';
import { getDealershipById, updateBilling } from './dealership.js';
import { httpError } from './errors.js';

let stripe;
export const stripeEnabled = () => !!config.stripeSecretKey;

export function getStripe() {
  if (stripe) return stripe;
  if (!stripeEnabled()) throw httpError(503, 'Online billing is not set up yet — contact support to activate your plan');
  stripe = new Stripe(config.stripeSecretKey);
  return stripe;
}

/** For tests: inject a fake Stripe client. */
export function setStripeClient(client) {
  stripe = client;
}

export function planForPrice(priceId) {
  for (const plan of PLAN_KEYS) {
    for (const interval of ['month', 'year']) {
      if (priceId && config.stripePrices[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
}

async function ensureCustomer(dealership, user) {
  if (dealership.stripe_customer_id) return dealership.stripe_customer_id;
  const customer = await getStripe().customers.create({
    email: user.email,
    name: dealership.name,
    metadata: { dealership_id: String(dealership.id) },
  });
  updateBilling(dealership.id, { stripe_customer_id: customer.id });
  return customer.id;
}

export async function createCheckout(dealershipId, user, { plan, interval = 'month' }) {
  if (!PLANS[plan]) throw httpError(400, 'Unknown plan');
  if (!['month', 'year'].includes(interval)) throw httpError(400, 'interval must be month or year');
  const price = config.stripePrices[plan][interval];
  if (!price) throw httpError(503, `The ${PLANS[plan].name} ${interval}ly price is not configured yet`);
  const dealership = getDealershipById(dealershipId);
  if (dealership.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(dealership.subscription_status)) {
    return createPortal(dealershipId); // change plans in the portal when already subscribed
  }
  const customer = await ensureCustomer(dealership, user);
  const subscriptionData = { metadata: { dealership_id: String(dealership.id) } };
  // Keep the remaining free-trial days when a dealer adds a card early.
  if (dealership.subscription_status === 'trialing' && dealership.trial_ends_at && new Date(dealership.trial_ends_at) - Date.now() > 48 * 3600_000) {
    subscriptionData.trial_end = Math.floor(new Date(dealership.trial_ends_at).getTime() / 1000);
  }
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: String(dealership.id),
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: subscriptionData,
    ...(process.env.STRIPE_AUTOMATIC_TAX === '1' ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } } : {}),
    success_url: `${config.appUrl}/app#/billing?checkout=success`,
    cancel_url: `${config.appUrl}/app#/billing?checkout=cancelled`,
  });
  return { url: session.url };
}

export async function createPortal(dealershipId) {
  const dealership = getDealershipById(dealershipId);
  if (!dealership.stripe_customer_id) throw httpError(400, 'No billing account yet — choose a plan first');
  const session = await getStripe().billingPortal.sessions.create({
    customer: dealership.stripe_customer_id,
    return_url: `${config.appUrl}/app#/billing`,
  });
  return { url: session.url };
}

function dealershipForSubscription(sub) {
  const fromMeta = Number(sub.metadata?.dealership_id);
  if (fromMeta && getDealershipById(fromMeta)) return fromMeta;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  return get('SELECT id FROM dealerships WHERE stripe_customer_id = ?', customerId)?.id || null;
}

/** Mirror a Stripe subscription onto the dealership. */
export function syncSubscription(sub) {
  const dealershipId = dealershipForSubscription(sub);
  if (!dealershipId) return null;
  const item = sub.items?.data?.[0];
  const mapped = planForPrice(item?.price?.id);
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const before = getDealershipById(dealershipId);
  const updated = updateBilling(dealershipId, {
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.status === 'canceled' ? null : sub.id,
    subscription_status: sub.status,
    plan: mapped?.plan ?? before.plan,
    billing_interval: mapped?.interval ?? before.billing_interval,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : before.trial_ends_at,
  });
  runWithTenant(dealershipId, () => logActivity('billing', 'subscription.updated', `${updated.plan} · ${updated.subscription_status}`));
  return updated;
}

export async function handleWebhook(rawBody, signature) {
  if (!config.stripeWebhookSecret) throw httpError(503, 'Webhook secret not configured');
  let event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    throw httpError(400, `Invalid signature: ${err.message}`);
  }
  if (get('SELECT id FROM stripe_events WHERE id = ?', event.id)) return { duplicate: true };

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      if (obj.subscription) {
        const sub = await getStripe().subscriptions.retrieve(typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id);
        if (!sub.metadata?.dealership_id && obj.client_reference_id) sub.metadata = { ...sub.metadata, dealership_id: obj.client_reference_id };
        syncSubscription(sub);
      }
      break;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      syncSubscription(obj);
      break;
    case 'invoice.payment_failed': {
      const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
      const d = get('SELECT id FROM dealerships WHERE stripe_customer_id = ?', customerId);
      if (d) runWithTenant(d.id, () => logActivity('billing', 'invoice.payment_failed', obj.hosted_invoice_url || ''));
      break;
    }
    default:
      break;
  }
  run('INSERT INTO stripe_events (id, type) VALUES (?, ?)', event.id, event.type);
  return { received: true, type: event.type };
}
