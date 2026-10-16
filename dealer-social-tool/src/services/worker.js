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

// Inventory feeds sync every `inventory_sync_minutes` (60 by default); after failures the wait doubles (up to 8×).
const feedDue = (d) => {
  if (!d.feed_last_synced_at) return true;
  const minutes = Math.max(15, d.inventory_sync_minutes || 60) * Math.min(8, 2 ** (d.feed_failures || 0));
  return Date.now() - new Date(d.feed_last_synced_at).getTime() >= minutes * 60_000;
};

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
      `SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.dealership_id = ? AND m.role = 'admin' ORDER BY m.created_at LIMIT 1`,
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
    if (!config.pilotMode) await forEachDealership(dealershipsWithDueRules(), 'autopilot', () => runDueRules());
    await forEachDealership(dealershipsWithDuePosts(), 'publisher', () => publishDuePosts());

    // Heavier network work every ~10 ticks (5 minutes at the default interval).
    if (ticks % 10 === 0) {
      // Pilot: nothing is read back from social networks (comments carry customers' personal information).
      if (!config.pilotMode) await forEachDealership(allDealershipIds(), 'sync', async () => {
        await refreshMetrics();
        await syncComments();
      });
      await forEachDealership(allDealershipIds(), 'feed', async (d) => {
        if (!d.inventory_feed_url || !entitlements(d).features.inventoryFeed) return;
        if (!feedDue(d)) return;
        await syncInventoryFeed(d, { trigger: 'schedule' });
      });
    }
    if (ticks % 120 === 0) {
      if (!config.pilotMode) {
        await sendTrialReminders();
        await sendMonthlyReports();
      }
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
