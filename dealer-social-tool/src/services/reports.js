// Monthly "here's what your AI social manager did" email to owners and managers — the
// single best reminder of value, sent on the 1st of each month (dealership local time).
import { config } from '../config.js';
import { all, get, logActivity } from '../db.js';
import { runWithTenant } from '../tenant.js';
import { localParts } from '../time.js';
import { entitlements } from '../plans.js';
import { analyticsSummary } from './analytics.js';
import { getDealershipById } from './dealership.js';
import { sendEmail } from './mailer.js';

const n = (v) => Number(v || 0).toLocaleString('en-US');

export function monthlyReportText(dealer, summary, leads) {
  const t = summary.totals;
  const best = summary.by_platform.sort((a, b) => b.reach - a.reach)[0];
  const top = summary.top_posts[0];
  return [
    `Here's what ${config.productName} did for ${dealer.name} over the last 30 days:`,
    `• ${n(t.posts)} posts published\n• ${n(t.reach)} people reached\n• ${n(t.engagements)} likes, comments and shares (${t.engagement_rate}% engagement)\n• ${n(leads)} leads flagged from comments, messages and reviews`,
    best ? `Your strongest network was ${best.label} with ${n(best.reach)} reach.` : '',
    top ? `Top post: "${top.content.slice(0, 120)}${top.content.length > 120 ? '…' : ''}"` : '',
    t.posts === 0 ? 'Nothing was published this month — turn on an autopilot rule and your pages will stay active automatically.' : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function sendMonthlyReports(now = new Date()) {
  let sent = 0;
  for (const { id } of all('SELECT id FROM dealerships')) {
    const dealer = getDealershipById(id);
    if (!entitlements(dealer).active) continue;
    const local = localParts(now, dealer.timezone);
    if (local.day !== 1 || local.hour < 8) continue;
    const period = `${local.year}-${String(local.month).padStart(2, '0')}`;
    if (get(`SELECT 1 FROM activity_log WHERE dealership_id = ? AND action = 'report.monthly' AND details = ?`, id, period)) continue;
    await runWithTenant(id, async () => {
      const summary = analyticsSummary(30);
      const since = new Date(now - 30 * 86_400_000).toISOString();
      const leads = get('SELECT COUNT(*) AS c FROM inbox_messages WHERE dealership_id = ? AND is_lead = 1 AND received_at >= ?', id, since).c;
      const recipients = all(
        `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.dealership_id = ? AND m.role IN ('owner', 'manager')`,
        id,
      );
      for (const r of recipients) {
        await sendEmail({
          to: r.email,
          subject: `${dealer.name}: your social media results this month`,
          text: monthlyReportText(dealer, summary, leads),
          actionUrl: `${config.appUrl}/app#/analytics`,
          actionLabel: 'See full analytics',
        });
      }
      logActivity('system', 'report.monthly', period);
      sent++;
    });
  }
  return sent;
}
