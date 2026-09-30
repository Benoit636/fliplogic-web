// Background loop for every dealership: autopilot rules, due posts, metrics, comments,
// inventory feeds, trial reminders and nightly backups.
import { config } from '../config.js';
import { all, get, run, logActivity, backupDatabase, nowIso } from '../db.js';
import { runWithTenant } from '../tenant.js';
import { entitlements } from '../plans.js';
import { runDueRules, dealershipsWithDueRules } from './autopilot.js';
import { publishDuePosts, refreshMetrics } from './publisher.js';
import { dealershipsWithDuePosts } from './posts.js';
import { syncComments } from './inbox.js';
import { syncInventoryFeed } from './inventory.js';
import { getDealershipById } from './dealership.js';
import { sendEmail } from './mailer.js';
import { sendMonthlyReports } from './reports.js';

let timer;
let running = false;
let ticks = 0;
let lastBackupDay = '';

const FEED_INTERVAL_MS = 6 * 3600_000;

function activeDealership(id) {
  const d = getDealershipById(id);
  return d && entitlements(d).active ? d : null;
}

async function forEachDealership(ids, label, fn) {
  for (const id of ids) {
    const d = activeDealership(id);
    if (!d) continue;
    await runWithTenant(id, async () => {
      try {
        await fn(d);
      } catch (err) {
        logActivity('system', `${label}.error`, err.message);
      }
    });
  }
}

const allDealershipIds = () => all('SELECT id FROM dealerships').map((r) => r.id);

async function sendTrialReminders() {
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const rows = all(`SELECT id FROM dealerships WHERE subscription_status = 'trialing' AND trial_ends_at BETWEEN ? AND ?`, nowIso(), soon);
  for (const { id } of rows) {
    if (get(`SELECT 1 FROM activity_log WHERE dealership_id = ? AND action = 'billing.trial_reminder'`, id)) continue;
    const owner = get(
      `SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.dealership_id = ? AND m.role = 'owner' ORDER BY m.created_at LIMIT 1`,
      id,
    );
    const d = getDealershipById(id);
    if (owner) {
      await sendEmail({
        to: owner.email,
        subject: `Your ${config.productName} trial ends soon`,
        text: `Hi ${owner.name || 'there'},\n\nThe free trial for ${d.name} ends on ${new Date(d.trial_ends_at).toDateString()}. Choose a plan to keep your posts and autopilot running without interruption.`,
        actionUrl: `${config.appUrl}/app#/billing`,
        actionLabel: 'Choose a plan',
      });
    }
    runWithTenant(id, () => logActivity('billing', 'billing.trial_reminder', owner?.email || ''));
  }
}

export async function tick() {
  if (running) return;
  running = true;
  try {
    await forEachDealership(dealershipsWithDueRules(), 'autopilot', () => runDueRules());
    await forEachDealership(dealershipsWithDuePosts(), 'publisher', () => publishDuePosts());

    // Heavier network work every ~10 ticks (5 minutes at the default interval).
    if (ticks % 10 === 0) {
      await forEachDealership(allDealershipIds(), 'sync', async () => {
        await refreshMetrics();
        await syncComments();
      });
      await forEachDealership(allDealershipIds(), 'feed', async (d) => {
        if (!d.inventory_feed_url || !entitlements(d).features.inventoryFeed) return;
        if (d.feed_last_synced_at && Date.now() - new Date(d.feed_last_synced_at).getTime() < FEED_INTERVAL_MS) return;
        await syncInventoryFeed(d);
      });
    }
    if (ticks % 120 === 0) {
      await sendTrialReminders();
      await sendMonthlyReports();
      run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
      const today = new Date().toISOString().slice(0, 10);
      if (today !== lastBackupDay && config.env !== 'test') {
        lastBackupDay = today;
        backupDatabase();
      }
    }
    ticks++;
  } catch (err) {
    logActivity('system', 'worker.error', err.message);
  } finally {
    running = false;
  }
}

export function startWorker(intervalSeconds) {
  stopWorker();
  timer = setInterval(tick, intervalSeconds * 1000);
  timer.unref?.();
  setTimeout(tick, 1000).unref?.();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
