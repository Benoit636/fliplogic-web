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
  const [{ totals: t, dealerships }, pages] = await Promise.all([api('GET', '/overview'), api('GET', '/pages')]);
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
    <form class="card" id="new-dealer" style="margin-bottom:16px">
      <div class="card-head"><h2>Add a dealership</h2><span class="small muted">Creates the dealership and a single-use setup link for its first Dealer Admin (valid 3 days). No passwords are shared.</span></div>
      <div class="row">
        <input name="name" placeholder="Dealership name" required style="flex:2;min-width:200px">
        <input name="dealer_number" placeholder="Dealer # (auto)" inputmode="numeric" pattern="\\d{3,6}" style="flex:1;min-width:120px">
        <input name="admin_email" type="email" placeholder="Admin email" required style="flex:2;min-width:200px">
        <button class="primary">Create</button>
      </div>
      <div id="new-dealer-link" class="small" style="margin-top:8px"></div>
    </form>
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h2>Facebook Pages</h2><span class="small muted">Nothing is published to a Page until you unlock it. Unlock a test Page first; a dealership’s live Page only with the dealer’s explicit approval.</span></div>
      <div class="table-wrap"><table>
        <tr><th>Dealership</th><th>Page</th><th>Status</th><th></th></tr>
        ${
          pages
            .map(
              (p) => `<tr>
          <td>${esc(p.dealership)}<div class="small muted">Dealer #${esc(p.dealer_number || p.dealership_id)}</div></td>
          <td><strong>${esc(p.display_name)}</strong><div class="small muted">${esc(p.platform)} · ID ${esc(p.external_id)}</div>${p.last_error ? `<div class="small" style="color:var(--bad)">${esc(p.last_error)}</div>` : ''}</td>
          <td>${p.publish_allowed ? `<span class="badge ${p.is_test ? 'info' : 'good'}">${p.is_test ? 'Test Page — on' : 'LIVE Page — on'}</span><div class="small muted">${esc(p.unlocked_by || '')} · ${date(p.unlocked_at)}</div>` : '<span class="badge warn">🔒 Locked</span>'}</td>
          <td><div class="row" style="flex-wrap:nowrap">${
            p.publish_allowed
              ? `<button class="small danger" data-lock="${p.id}">Lock</button>`
              : `<button class="small" data-unlock="${p.id}" data-kind="test" data-name="${esc(p.display_name)}">Unlock as test Page</button><button class="small danger" data-unlock="${p.id}" data-kind="live" data-name="${esc(p.display_name)}">Unlock live Page…</button>`
          }</div></td></tr>`,
            )
            .join('') || '<tr><td colspan="4"><div class="empty">No Pages connected yet</div></td></tr>'
        }
      </table></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Customers</h2><input id="search" placeholder="Search dealership, owner, city…" value="${esc(filter)}" style="max-width:320px;margin-left:auto"></div>
      <div class="table-wrap"><table>
        <tr><th>Dealership</th><th>Owner</th><th>Plan</th><th>Status</th><th class="num">MRR</th><th>Trial / renews</th><th class="num">Accts (live)</th><th class="num">Vehicles</th><th class="num">Posts 30d</th><th class="num">AI posts / chats</th><th>Last active</th><th></th></tr>
        ${
          rows
            .map(
              (d) => `<tr>
          <td><strong>${esc(d.name)}</strong><div class="small muted">Dealer #${esc(d.dealer_number || d.id)} · ${esc(d.city || '')} · since ${date(d.created_at)}</div></td>
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
          <td><div class="row" style="flex-wrap:nowrap">
            <button class="small" data-open="${d.id}">Open</button>
            <button class="small" data-admin-link="${esc(d.dealer_number)}">Admin link</button>
            <button class="small" data-trial="${d.id}">+14d trial</button>
            <button class="small" data-edit="${d.id}" data-plan="${esc(d.plan)}" data-status="${esc(d.subscription_status)}">Plan…</button>
          </div></td></tr>`,
            )
            .join('') || '<tr><td colspan="12"><div class="empty">No dealerships yet</div></td></tr>'
        }
      </table></div>
      <p class="small muted">“Plan…” overrides are for pilots, comped accounts and sales-led deals. Stripe-billed changes should be made in Stripe; webhooks keep this table in sync.</p>
    </div>`;
  document.getElementById('new-dealer').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/dealerships', Object.fromEntries(new FormData(e.target)));
      await render();
      showLink(`Dealer #${r.dealership.dealer_number} ${r.dealership.name} created. Send this setup link to the admin only:`, r.invite_url);
    } catch (err) {
      toast(err.message, true);
    }
  };
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

function showLink(text, url) {
  const box = document.getElementById('new-dealer-link');
  box.innerHTML = `${esc(text)} <input readonly value="${esc(url)}" style="margin-top:4px">`;
  box.querySelector('input').select();
}

view.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.open) {
      await api('POST', `/dealerships/${b.dataset.open}/open`);
      location.href = '/app#/dashboard';
    }
    if (b.dataset.adminLink) {
      const email = prompt(`Email of the Dealer Admin for dealer #${b.dataset.adminLink}:`);
      if (!email) return;
      const r = await api('POST', `/dealerships/${encodeURIComponent(b.dataset.adminLink)}/admin-invite`, { admin_email: email.trim() });
      showLink(`Single-use setup link for ${email.trim()}:`, r.invite_url);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (b.dataset.unlock) {
      const live = b.dataset.kind === 'live';
      const typed = prompt(`${live ? 'LIVE Page: posts will appear on the dealership’s real Facebook Page.\n' : ''}Type the Page name to confirm: ${b.dataset.name}`);
      if (!typed) return;
      if (live && !confirm(`Has the dealership explicitly approved publishing to “${b.dataset.name}”? Every post still needs a Dealer Admin’s approval.`)) return;
      await api('POST', `/pages/${b.dataset.unlock}/unlock`, { confirm_name: typed.trim(), kind: b.dataset.kind, approve_live: live });
      toast(live ? 'Live Page unlocked' : 'Test Page unlocked');
      render();
    }
    if (b.dataset.lock) {
      await api('POST', `/pages/${b.dataset.lock}/lock`);
      toast('Page locked');
      render();
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
