// Subscription plans. Prices are in USD per dealership (rooftop) and are only
// displayed here — Stripe Price IDs in .env decide what customers are charged.
export const PLANS = {
  starter: {
    name: 'Starter',
    tagline: 'Get consistent on social without hiring',
    monthly: 149,
    yearly: 1490,
    limits: { socialAccounts: 3, users: 3, aiPostsPerMonth: 150, aiChatTurnsPerMonth: 0, autopilotRules: 2 },
    features: { assistant: false, autopilot: false, inventoryFeed: false, liveInbox: true, prioritySupport: false },
    highlights: [
      '3 social accounts',
      '150 AI-written posts / month',
      'Content studio, calendar & approvals',
      'Inbox with AI suggested replies',
      'Inventory CSV import',
      '2 scheduled autopilot rules (drafts for approval)',
    ],
  },
  pro: {
    name: 'Pro',
    tagline: 'Your AI social media manager, on autopilot',
    monthly: 299,
    yearly: 2990,
    popular: true,
    limits: { socialAccounts: 6, users: 10, aiPostsPerMonth: 600, aiChatTurnsPerMonth: 1500, autopilotRules: 15 },
    features: { assistant: true, autopilot: true, inventoryFeed: true, liveInbox: true, prioritySupport: false },
    highlights: [
      'All 6 networks',
      '600 AI-written posts / month',
      'AI assistant chat that does the work',
      'Full autopilot mode & auto-replies',
      'Automatic inventory feed sync',
      'Sold / price-drop / new-arrival automations',
    ],
  },
  elite: {
    name: 'Elite',
    tagline: 'For high-volume stores and groups',
    monthly: 499,
    yearly: 4990,
    limits: { socialAccounts: 20, users: 50, aiPostsPerMonth: 2000, aiChatTurnsPerMonth: 5000, autopilotRules: 100 },
    features: { assistant: true, autopilot: true, inventoryFeed: true, liveInbox: true, prioritySupport: true },
    highlights: [
      'Up to 20 social accounts',
      '2,000 AI-written posts / month',
      '5,000 AI assistant messages / month',
      'Everything in Pro',
      'Up to 50 team members',
      'Priority support & onboarding call',
    ],
  },
};

export const PLAN_KEYS = Object.keys(PLANS);
export const TRIAL_PLAN = 'pro';

const ACTIVE = ['trialing', 'active', 'comped'];
const GRACE_DAYS = 7;

/** What a dealership may do right now, based on plan and billing status. */
export function entitlements(dealership, now = new Date()) {
  const plan = PLANS[dealership.plan] || PLANS[TRIAL_PLAN];
  let active = ACTIVE.includes(dealership.subscription_status);
  let reason = '';
  if (dealership.subscription_status === 'trialing' && dealership.trial_ends_at && new Date(dealership.trial_ends_at) < now) {
    active = false;
    reason = 'Your free trial has ended. Choose a plan to keep publishing.';
  }
  if (dealership.subscription_status === 'past_due') {
    const since = new Date(dealership.status_changed_at || now);
    active = now - since < GRACE_DAYS * 86_400_000;
    reason = active ? 'Payment failed — please update your card.' : 'Payment is overdue. Update your card to resume publishing.';
  }
  if (['canceled', 'unpaid', 'incomplete', 'incomplete_expired'].includes(dealership.subscription_status)) {
    active = false;
    reason = 'Your subscription is not active. Choose a plan to resume.';
  }
  return { plan: dealership.plan, planName: plan.name, active, reason, limits: plan.limits, features: plan.features };
}
