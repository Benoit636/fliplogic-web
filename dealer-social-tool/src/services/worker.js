// Background loop: publishes due posts, runs autopilot rules, refreshes metrics and syncs comments.
import { logActivity } from '../db.js';
import { runDueRules } from './autopilot.js';
import { publishDuePosts, refreshMetrics } from './publisher.js';
import { syncComments } from './inbox.js';

let timer;
let running = false;
let ticks = 0;

export async function tick() {
  if (running) return;
  running = true;
  try {
    await runDueRules();
    await publishDuePosts();
    // Heavier network work every ~10 ticks (5 minutes at the default interval).
    if (ticks % 10 === 0) {
      await refreshMetrics();
      await syncComments();
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
