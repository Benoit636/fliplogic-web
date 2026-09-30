// Platform-owner console: customers, revenue, usage and manual plan overrides.
const view = document.getElementById('view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

async function api(method, path, body) {
  const res = await fetch(`/api/admin${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg, error = false) {
  const el = document.createElement('div');
  el.className = `toast ${error ? 'error' : ''}`;
  el.textContent = msg;
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.remove(), 4000);
}

const STATUS_CLASS = { active: 'good', comped: 'good', trialing: 'info', past_due: 'warn', canceled: 'bad', unpaid: 'bad' };
let filter = '';

async function render() {
  const { totals: t, dealerships } = await api('GET', '/overview');
  const rows = dealerships.filter((d) => !filter || `${d.name} ${d.owner_email} ${d.city}`.toLowerCase().includes(filter));
  view.innerHTML = `
    <div class="kpis">
      ${[
        ['MRR', money(t.mrr), `ARR ${money(t.arr)}`],
        ['Paying dealerships', t.paying, `ARPA ${money(t.arpa)}/mo`],
        ['In trial', t.trialing, `${t.signups_30d} signups in 30 days`],
        ['Past due', t.past_due, `${t.canceled} canceled`],
        ['Comped', t.comped, `${t.users} users total`],
        ['Posts published (30d)', t.published_30d.toLocaleString(), `${t.dealerships} dealerships`],
      ]
        .map(([l, v, sub]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`)
        .join('')}
    </div>
    <div class="card">
      <div class="card-head"><h2>Customers</h2><input id="search" placeholder="Search dealership, owner, city…" value="${esc(filter)}" style="max-width:320px;margin-left:auto"></div>
      <div class="table-wrap"><table>
        <tr><th>Dealership</th><th>Owner</th><th>Plan</th><th>Status</th><th class="num">MRR</th><th>Trial / renews</th><th class="num">Accts (live)</th><th class="num">Vehicles</th><th class="num">Posts 30d</th><th class="num">AI posts / chats</th><th>Last active</th><th></th></tr>
        ${rows
          .map(
            (d) => `<tr>
          <td><strong>${esc(d.name)}</strong><div class="small muted">#${d.id} · ${esc(d.city || '')} · since ${date(d.created_at)}</div></td>
          <td class="small">${esc(d.owner_email || '—')}</td>
          <td>${esc(d.plan)}${d.billing_interval === 'year' ? ' <span class="badge">yearly</span>' : ''}</td>
          <td><span class="badge ${STATUS_CLASS[d.subscription_status] || ''}">${esc(d.subscription_status)}</span></td>
          <td class="num">${money(d.mrr)}</td>
          <td class="small">${d.subscription_status === 'trialing' ? `trial ends ${date(d.trial_ends_at)}` : date(d.current_period_end)}</td>
          <td class="num">${d.accounts} (${d.live_accounts})</td>
          <td class="num">${d.vehicles}</td>
          <td class="num">${d.published_30d}</td>
          <td class="num">${d.ai_posts_month} / ${d.ai_chats_month}</td>
          <td class="small">${date(d.last_user_activity)}</td>
          <td class="row" style="flex-wrap:nowrap">
            <button class="small" data-open="${d.id}">Open</button>
            <button class="small" data-trial="${d.id}">+14d trial</button>
            <button class="small" data-edit="${d.id}" data-plan="${esc(d.plan)}" data-status="${esc(d.subscription_status)}">Plan…</button>
          </td></tr>`,
          )
          .join('') || '<tr><td colspan="12"><div class="empty">No dealerships yet</div></td></tr>'}
      </table></div>
      <p class="small muted">“Plan…” overrides are for pilots, comped accounts and sales-led deals. Stripe-billed changes should be made in Stripe; webhooks keep this table in sync.</p>
    </div>`;
  const search = document.getElementById('search');
  search.oninput = () => {
    filter = search.value.toLowerCase();
    render().then(() => {
      const s = document.getElementById('search');
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    });
  };
}

view.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.open) {
      await api('POST', `/dealerships/${b.dataset.open}/open`);
      location.href = '/app#/dashboard';
    }
    if (b.dataset.trial) {
      await api('PATCH', `/dealerships/${b.dataset.trial}`, { extend_trial_days: 14 });
      toast('Trial extended by 14 days');
      render();
    }
    if (b.dataset.edit) {
      const plan = prompt('Plan (starter, pro, elite):', b.dataset.plan);
      if (!plan) return;
      const status = prompt('Status (active, comped, trialing, past_due, canceled):', b.dataset.status === 'trialing' ? 'comped' : b.dataset.status);
      if (!status) return;
      await api('PATCH', `/dealerships/${b.dataset.edit}`, { plan: plan.trim(), subscription_status: status.trim() });
      toast('Updated');
      render();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

render().catch((err) => (view.innerHTML = `<div class="empty">${esc(err.message)}</div>`));
