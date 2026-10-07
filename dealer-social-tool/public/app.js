// Dealer Social Tool — single-page dashboard (no build step).
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');

const state = { meta: null, dealership: null, me: null, chatId: null };
try {
  state.chatId = localStorage.getItem('ds.chatId');
} catch {}

// ---------- utilities ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => Number(n || 0).toLocaleString();
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString()}`);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const ago = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const platformLabel = (p) => state.meta?.platforms[p]?.label || p;
const typeLabel = (t) => state.meta?.post_types[t] || t;
const PLATFORM_ICON = { facebook: '📘', instagram: '📸', tiktok: '🎵', x: '✖️', linkedin: '💼', google_business: '📍' };
const pIcon = (p) => PLATFORM_ICON[p] || '•';

const STATUS_BADGE = {
  draft: ['Draft', ''],
  pending_approval: ['Needs approval', 'warn'],
  approved: ['Approved', 'info'],
  scheduled: ['Scheduled', 'info'],
  publishing: ['Publishing…', 'info'],
  published: ['Published', 'good'],
  failed: ['Failed', 'bad'],
  rejected: ['Rejected', 'bad'],
};
const statusBadge = (s) => `<span class="badge ${STATUS_BADGE[s]?.[1] || ''}">${STATUS_BADGE[s]?.[0] || esc(s)}</span>`;

async function api(method, path, body, { raw = false } = {}) {
  const headers = { 'x-requested-with': 'fetch' };
  if (body !== undefined) headers['content-type'] = raw ? 'text/plain' : 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  if (res.status === 401) {
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
    throw new Error('Please log in');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

function toast(message, type = '', link = null) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = ` ${link.label} →`;
    a.style.color = 'inherit';
    a.style.fontWeight = '700';
    el.append(a);
  }
  $('#toast-root').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

/** Run an async action with error toasts and a busy button. */
async function act(btn, fn, success) {
  if (btn) btn.disabled = true;
  try {
    const result = await fn();
    if (success) toast(typeof success === 'function' ? success(result) : success);
    return result;
  } catch (err) {
    toast(err.message, 'error', err.status === 402 ? { href: '#/billing', label: 'See plans' } : null);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openModal(title, bodyHtml, { wide = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" style="${wide ? 'width:min(960px,100%)' : ''}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="x icon-btn" data-close>✕</button></div>
    <div class="modal-body">${bodyHtml}</div></div></div>`;
  const backdrop = $('.modal-backdrop', root);
  const close = () => (root.innerHTML = '');
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  return { el: $('.modal', root), close };
}

// ---------- shared components ----------
function postCard(p, { actions = true } = {}) {
  const warnings = p.warnings?.length ? `<div class="warn-list">⚠️ ${p.warnings.map(esc).join('<br>⚠️ ')}</div>` : '';
  const img = p.media?.[0] ? `<img class="thumb" src="${esc(p.media[0])}" alt="" loading="lazy">` : '';
  const when = p.published_at ? `Published ${fmtDate(p.published_at)}` : p.scheduled_at ? `🕒 ${fmtDate(p.scheduled_at)}` : '';
  const m = p.metrics || {};
  const metrics =
    p.status === 'published' ? `<div class="small muted">👁 ${num(m.reach)} · ❤️ ${num(m.likes)} · 💬 ${num(m.comments)} · 🔁 ${num(m.shares)}</div>` : '';
  const buttons = !actions
    ? ''
    : `<div class="row">
      <button class="small" data-edit="${p.id}">Edit</button>
      ${p.status === 'pending_approval' || p.status === 'draft' ? `<button class="small good" data-approve="${p.id}">Approve</button>` : ''}
      ${p.status === 'pending_approval' ? `<button class="small danger" data-reject="${p.id}">Reject</button>` : ''}
      ${!['published', 'publishing'].includes(p.status) ? `<button class="small" data-publish="${p.id}">Publish now</button>` : ''}
      ${p.external_url ? `<a class="btn small" href="${esc(p.external_url)}" target="_blank" rel="noopener">View ↗</a>` : ''}
    </div>`;
  return `<div class="post-card" data-post="${p.id}">
    <div class="row"><strong>${pIcon(p.platform)} ${esc(platformLabel(p.platform))}</strong><span class="spacer"></span>${statusBadge(p.status)}</div>
    <div class="small muted">${esc(typeLabel(p.post_type))}${p.source !== 'manual' ? ` · by ${p.source === 'autopilot' ? 'autopilot' : 'AI'}` : ''} ${when ? `· ${when}` : ''}</div>
    ${img}
    <div class="text">${esc(p.content)}</div>
    ${p.hashtags?.length ? `<div class="tags">${esc(p.hashtags.join(' '))}</div>` : ''}
    ${p.error ? `<div class="small" style="color:var(--bad)">${esc(p.error)}</div>` : ''}
    ${warnings}${metrics}${buttons}
  </div>`;
}

/** Wire post-card buttons inside a container; `refresh` re-renders after changes. */
function bindPostActions(root, refresh) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) return openPostEditor(Number(b.dataset.edit), refresh);
    if (b.dataset.approve) return act(b, () => api('POST', `/posts/${b.dataset.approve}/approve`), 'Approved').then(refresh);
    if (b.dataset.reject) {
      const reason = prompt('Reason (optional) — helps the bot learn what you want:') ?? null;
      if (reason === null) return;
      return act(b, () => api('POST', `/posts/${b.dataset.reject}/reject`, { reason }), 'Rejected').then(refresh);
    }
    if (b.dataset.publish) {
      if (!confirm('Publish this post right now?')) return;
      return act(
        b,
        () => api('POST', `/posts/${b.dataset.publish}/publish`),
        (p) => (p.status === 'published' ? 'Published 🎉' : `Failed: ${p.error}`),
      ).then(refresh);
    }
  });
}

async function openPostEditor(id, onChange = () => {}) {
  const p = await api('GET', `/posts/${id}`);
  const rules = state.meta.platforms[p.platform];
  const locked = ['published', 'publishing'].includes(p.status);
  const { el, close } = openModal(
    `${pIcon(p.platform)} ${platformLabel(p.platform)} post #${p.id}`,
    `
    <div class="stack">
      <div class="row">${statusBadge(p.status)} <span class="muted small">${esc(typeLabel(p.post_type))}</span></div>
      <label class="field"><span>Post text</span><textarea id="pe-content" rows="9" ${locked ? 'disabled' : ''}>${esc(p.content)}</textarea></label>
      <div class="char-count" id="pe-count"></div>
      <label class="field"><span>Hashtags (space separated)</span><input id="pe-tags" value="${esc(p.hashtags.join(' '))}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span>Photo / video URLs (one per line)${rules.requiresMedia ? ' — required' : ''}</span><textarea id="pe-media" rows="2" ${locked ? 'disabled' : ''}>${esc(p.media.join('\n'))}</textarea></label>
      ${p.image_idea ? `<div class="small muted">📷 Photo idea: ${esc(p.image_idea)}</div>` : ''}
      <label class="field"><span>Publish time</span><input type="datetime-local" id="pe-when" value="${toLocalInput(p.scheduled_at)}" ${locked ? 'disabled' : ''}></label>
      ${!locked && state.meta.ai_enabled ? `<div class="row"><input id="pe-ai" placeholder="Ask the AI to rewrite: shorter, more fun, add a French version…"><button id="pe-rewrite">✨ Rewrite</button></div>` : ''}
      ${p.error ? `<div style="color:var(--bad)">${esc(p.error)}</div>` : ''}
    </div>
    <div class="modal-foot">
      ${
        !locked
          ? `<button class="danger" id="pe-delete">Delete</button><span class="spacer"></span>
      <button id="pe-copy">📋 Copy text</button>
      <button id="pe-posted" title="Use this when you posted it yourself">✔ I posted it</button>
      <button id="pe-save">Save</button>
      <button id="pe-schedule" class="primary">Approve & schedule</button>
      <button id="pe-publish" class="good">Publish now</button>`
          : `<button data-close>Close</button>`
      }
    </div>`,
  );
  const content = $('#pe-content', el);
  const tags = $('#pe-tags', el);
  const counter = () => {
    const tagText = tags.value.trim();
    const len = content.value.trim().length + (tagText ? tagText.length + 2 : 0);
    const c = $('#pe-count', el);
    c.textContent = `${len} / ${rules.maxChars} characters`;
    c.classList.toggle('over', len > rules.maxChars);
  };
  content.addEventListener('input', counter);
  tags.addEventListener('input', counter);
  counter();
  if (locked) return;

  const payload = () => ({
    content: content.value,
    hashtags: tags.value.split(/\s+/).filter(Boolean),
    media: $('#pe-media', el).value.split(/\s+/).filter(Boolean),
    scheduled_at: fromLocalInput($('#pe-when', el).value),
  });
  const done = () => {
    close();
    onChange();
  };
  $('#pe-save', el).onclick = (e) => act(e.target, () => api('PATCH', `/posts/${id}`, payload()), 'Saved').then((r) => r && done());
  $('#pe-copy', el).onclick = async () => {
    const text = composeClient({ content: content.value, hashtags: tags.value.split(/\s+/).filter(Boolean) });
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into the app.');
    } catch {
      content.focus();
      content.select();
      toast('Text selected. Press copy on your keyboard.');
    }
  };
  $('#pe-posted', el).onclick = (e) =>
    act(
      e.target,
      async () => {
        await api('PATCH', `/posts/${id}`, payload());
        return api('POST', `/posts/${id}/mark-posted`);
      },
      'Marked as posted',
    ).then((r) => r && done());
  $('#pe-schedule', el).onclick = (e) =>
    act(
      e.target,
      async () => {
        const body = payload();
        await api('PATCH', `/posts/${id}`, body);
        return api('POST', `/posts/${id}/schedule`, { scheduled_at: body.scheduled_at || new Date().toISOString() });
      },
      (r) => `Scheduled for ${fmtDate(r.scheduled_at)}`,
    ).then((r) => r && done());
  $('#pe-publish', el).onclick = (e) =>
    confirm('Publish this post right now?') &&
    act(
      e.target,
      async () => {
        await api('PATCH', `/posts/${id}`, payload());
        return api('POST', `/posts/${id}/publish`);
      },
      (r) => (r.status === 'published' ? 'Published 🎉' : `Failed: ${r.error}`),
    ).then((r) => r && done());
  $('#pe-delete', el).onclick = (e) => confirm('Delete this post?') && act(e.target, () => api('DELETE', `/posts/${id}`), 'Deleted').then(done);
  const rewrite = $('#pe-rewrite', el);
  if (rewrite)
    rewrite.onclick = (e) =>
      act(
        e.target,
        async () => {
          const r = await api('POST', `/posts/${id}/rewrite`, { instruction: $('#pe-ai', el).value || 'Make it more engaging' });
          content.value = r.content;
          tags.value = r.hashtags.join(' ');
          counter();
        },
        'Rewritten — review and save',
      );
}

function platformChecks(name, selected = []) {
  return `<div class="checks">${Object.entries(state.meta.platforms)
    .map(
      ([k, p]) =>
        `<label class="check"><input type="checkbox" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}> ${pIcon(k)} ${esc(p.label)}</label>`,
    )
    .join('')}</div>`;
}
const checkedValues = (root, name) => $$(`input[name="${name}"]:checked`, root).map((i) => i.value);
const typeOptions = (selected) =>
  Object.entries(state.meta.post_types)
    .map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`)
    .join('');

async function refreshBadges() {
  try {
    const [pending, inbox] = await Promise.all([api('GET', '/posts?status=pending_approval'), api('GET', '/inbox?status=new')]);
    $('#count-approvals').textContent = pending.length || '';
    $('#count-inbox').textContent = inbox.length || '';
  } catch {}
}

// ---------- views ----------
const views = {};

views.dashboard = async () => {
  const d = await api('GET', '/dashboard');
  const t = d.analytics.totals;
  const inv = Object.fromEntries(d.inventory.map((r) => [r.status, r.n]));
  const steps = [
    ['profile', 'Fill in your dealership profile & brand voice', '#/settings'],
    ['accounts', 'Connect your social accounts', '#/settings'],
    ['inventory', 'Add your inventory (CSV or feed)', '#/inventory'],
    ['first_post', 'Publish your first post', '#/create'],
    ['autopilot', 'Turn on an autopilot rule', '#/autopilot'],
  ];
  const done = steps.filter(([k]) => d.checklist[k]).length;
  view.innerHTML = `
    ${
      done < steps.length
        ? `<div class="card checklist" style="margin-bottom:16px"><div class="card-head"><h2>🚀 Get set up</h2><span class="muted small">${done}/${steps.length} done</span></div>
      <div class="meter" style="margin-bottom:10px"><div style="width:${(done / steps.length) * 100}%"></div></div>
      ${steps.map(([k, label, href]) => `<div class="list-item"><span>${d.checklist[k] ? '✅' : '⬜'}</span><a class="grow ${d.checklist[k] ? 'done' : ''}" href="${href}">${label}</a></div>`).join('')}</div>`
        : ''
    }
    <div class="kpis">
      <div class="kpi"><div class="label">Needs approval</div><div class="value">${d.post_counts.pending_approval}</div><div class="sub"><a href="#/approvals">Review →</a></div></div>
      <div class="kpi"><div class="label">Scheduled</div><div class="value">${d.post_counts.scheduled}</div><div class="sub"><a href="#/calendar">Calendar →</a></div></div>
      <div class="kpi"><div class="label">New messages</div><div class="value">${d.inbox.new}</div><div class="sub">${d.inbox.leads} leads · ${d.inbox.escalated} escalated</div></div>
      <div class="kpi"><div class="label">Reach (7 days)</div><div class="value">${num(t.reach)}</div><div class="sub">${t.posts} posts · ${t.engagement_rate}% engagement</div></div>
      <div class="kpi"><div class="label">Inventory</div><div class="value">${inv.available || 0}</div><div class="sub">available · ${inv.sold || 0} sold</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>Coming up</h2><div class="actions"><a class="btn small" href="#/create">+ Create post</a></div></div>
        ${d.upcoming.length ? d.upcoming.map((p) => `<div class="list-item"><div>${pIcon(p.platform)}</div><div class="grow"><div class="clip">${esc(p.content.split('\n')[0])}</div><div class="small muted">${fmtDate(p.scheduled_at)} · ${esc(typeLabel(p.post_type))}</div></div><button class="small" data-edit="${p.id}">Open</button></div>`).join('') : '<div class="empty">Nothing scheduled. Ask the <a href="#/assistant">AI assistant</a> to plan your week.</div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Waiting for you</h2></div>
        ${[...d.needs_approval, ...d.failed].length ? [...d.needs_approval, ...d.failed].map((p) => `<div class="list-item"><div>${pIcon(p.platform)}</div><div class="grow"><div class="clip">${esc(p.content.split('\n')[0])}</div><div class="small muted">${statusBadge(p.status)} ${esc(p.error || '')}</div></div><button class="small" data-edit="${p.id}">Open</button></div>`).join('') : '<div class="empty">All caught up ✨</div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Bot activity</h2><div class="actions"><button class="small" id="dash-activity">See all</button></div></div>
        ${
          d.activity.length
            ? d.activity
                .slice(0, 12)
                .map(
                  (a) =>
                    `<div class="list-item"><span class="badge ${a.actor === 'bot' || a.actor === 'autopilot' ? 'info' : ''}">${esc(a.actor)}</span><div class="grow small"><strong>${esc(a.action)}</strong> ${esc(a.details)}</div><span class="small muted">${ago(a.at)}</span></div>`,
                )
                .join('')
            : '<div class="empty">No activity yet</div>'
        }
      </div>
      <div class="card"><div class="card-head"><h2>Connected accounts</h2><div class="actions"><a class="btn small" href="#/settings">Manage</a></div></div>
        ${d.accounts.length ? d.accounts.map((a) => `<div class="list-item"><div>${pIcon(a.platform)}</div><div class="grow">${esc(a.display_name)}<div class="small muted">${esc(platformLabel(a.platform))}</div></div><span class="badge ${a.mode === 'live' ? 'good' : ''}">${a.mode === 'live' ? 'Connected' : 'Practice'}</span>${a.enabled ? '' : '<span class="badge bad">off</span>'}</div>`).join('') : '<div class="empty">No accounts connected</div>'}
      </div>
    </div>`;
  view.onclick = (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openPostEditor(Number(b.dataset.edit), () => route());
  };
  $('#dash-activity').onclick = async () => {
    const rows = await api('GET', '/activity');
    openModal(
      'Activity log',
      `<div class="table-wrap"><table><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr>${rows.map((a) => `<tr><td class="small">${fmtDate(a.at)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="small">${esc(a.details)}</td></tr>`).join('')}</table></div>`,
      { wide: true },
    );
  };
};

views.assistant = async () => {
  const history = state.chatId ? await api('GET', `/chat/${state.chatId}`).catch(() => []) : [];
  const suggestions = [
    'Plan and draft next week’s posts for Facebook and Instagram',
    'Post about our newest arrival on every connected account',
    'Go through the inbox: draft replies and tell me who the hot leads are',
    'How did our social media do this month? What should we post more of?',
    'Set up autopilot: a vehicle spotlight every weekday at 10am on Facebook and Instagram',
    'Mark the Civic as sold and write a celebration post',
  ];
  view.innerHTML = `<div class="chat card">
    <div class="card-head"><h2>🤖 Dealer Social bot</h2><span class="muted small">Your AI social media manager — it can write, schedule, publish, answer the inbox and report.</span>
      <div class="actions"><button class="small" id="chat-new">New conversation</button></div></div>
    <div class="chat-log" id="chat-log"></div>
    <div class="suggestions" id="chat-suggest">${suggestions.map((s) => `<button class="small">${esc(s)}</button>`).join('')}</div>
    <form class="chat-input" id="chat-form"><textarea id="chat-text" placeholder="Tell the bot what you need…" required></textarea><button class="primary" id="chat-send">Send</button></form>
  </div>`;
  const log = $('#chat-log');
  const add = (role, text, tools = []) => {
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = `${esc(text)}${tools.length ? `<div class="tools">${[...new Set(tools)].map((t) => `<span class="badge info">🔧 ${esc(t.replace(/_/g, ' '))}</span>`).join('')}</div>` : ''}`;
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };
  if (!history.length)
    add(
      'assistant',
      `Hi! I run ${state.dealership?.name || 'your dealership'}’s social media. Ask me to create posts, plan your calendar, handle comments and reviews, or explain what’s working.${state.meta.ai_enabled ? '' : '\n\n⚠️ Add a Claude API key (ANTHROPIC_API_KEY) to switch me on.'}`,
    );
  history.forEach((m) => add(m.role, m.text, m.tools || []));

  const send = async (text) => {
    if (!text.trim()) return;
    add('user', text);
    $('#chat-text').value = '';
    const typing = add('assistant', 'Working on it…');
    typing.classList.add('typing');
    $('#chat-send').disabled = true;
    try {
      const r = await api('POST', '/chat', { message: text, conversation_id: state.chatId });
      state.chatId = r.conversation_id;
      try {
        localStorage.setItem('ds.chatId', state.chatId);
      } catch {}
      typing.remove();
      add(
        'assistant',
        r.reply,
        r.actions.map((a) => a.tool),
      );
      refreshBadges();
    } catch (err) {
      typing.remove();
      add('assistant', `⚠️ ${err.message}`);
    } finally {
      $('#chat-send').disabled = false;
    }
  };
  $('#chat-form').onsubmit = (e) => {
    e.preventDefault();
    send($('#chat-text').value);
  };
  $('#chat-text').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send($('#chat-text').value);
    }
  };
  $('#chat-suggest').onclick = (e) => e.target.tagName === 'BUTTON' && send(e.target.textContent);
  $('#chat-new').onclick = () => {
    state.chatId = null;
    try {
      localStorage.removeItem('ds.chatId');
    } catch {}
    route();
  };
};

views.studio = async () => {
  const [vehicles, accounts] = await Promise.all([api('GET', '/vehicles'), api('GET', '/accounts')]);
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const connected = [...new Set(accounts.filter((a) => a.enabled).map((a) => a.platform))];
  // New and used vehicle posts live in Create Post; this screen covers everything else.
  const vehicleMode = params.has('vehicle');
  const types = vehicleMode ? ['sold_celebration', 'vehicle_spotlight', 'price_drop'] : state.meta.general_post_types;
  const options = types.map((k) => `<option value="${k}" ${k === params.get('type') ? 'selected' : ''}>${esc(typeLabel(k))}</option>`).join('');
  view.innerHTML = `<div class="grid cols-2" style="align-items:start">
    <form class="card stack" id="studio-form">
      <h2>${vehicleMode ? 'Vehicle post' : 'Events, service tips, reviews and more'}</h2>
      ${vehicleMode ? '' : '<p class="small muted">For new or used vehicle posts, use <a href="#/create">Create Post</a>.</p>'}
      <label class="field"><span>Post type</span><select name="post_type">${options}</select></label>
      ${vehicleMode ? `<label class="field"><span>Vehicle</span><select name="vehicle_id">${vehicles.map((v) => `<option value="${v.id}" ${String(v.id) === params.get('vehicle') ? 'selected' : ''}>${esc([v.year, v.make, v.model, v.trim].join(' '))}</option>`).join('')}</select></label>` : ''}
      <div class="field"><span class="small muted">Platforms</span>${platformChecks('platforms', connected.length ? connected : ['facebook', 'instagram'])}</div>
      <label class="field"><span>Details for the AI (offer, event date, angle, tone…)</span><textarea name="instructions" placeholder="e.g. Mention our 0% financing event this weekend, playful tone"></textarea></label>
      <label class="field"><span>Schedule for (optional)</span><input type="datetime-local" name="when"></label>
      <div class="row"><button class="primary" id="studio-go">✨ Create posts</button></div>
    </form>
    <div class="card"><div class="card-head"><h2>Preview</h2><div class="actions" id="studio-actions"></div></div><div id="studio-out" class="post-grid"><div class="empty" style="grid-column:1/-1">Your posts will appear here, one per platform. Edit anything before approving.</div></div></div>
  </div>`;
  let batch = [];
  const renderOut = async () => {
    if (!batch.length) return;
    batch = await Promise.all(batch.map((p) => api('GET', `/posts/${p.id}`).catch(() => null))).then((r) => r.filter(Boolean));
    $('#studio-out').innerHTML = batch.map((p) => postCard(p)).join('') || '<div class="empty">All posts removed</div>';
    $('#studio-actions').innerHTML = batch.some((p) => ['draft', 'pending_approval'].includes(p.status))
      ? `<button class="good small" id="studio-approve-all">Approve all</button>`
      : '';
    const all = $('#studio-approve-all');
    if (all) all.onclick = (e) => act(e.target, () => api('POST', '/posts/approve-batch', { ids: batch.map((p) => p.id) }), 'All approved').then(renderOut);
  };
  bindPostActions($('#studio-out'), renderOut);
  $('#studio-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      post_type: f.get('post_type'),
      vehicle_id: f.get('vehicle_id') ? Number(f.get('vehicle_id')) : undefined,
      platforms: checkedValues(e.target, 'platforms'),
      instructions: f.get('instructions'),
      scheduled_at: fromLocalInput(f.get('when')),
    };
    $('#studio-out').innerHTML = '<div class="empty" style="grid-column:1/-1">✨ Writing…</div>';
    const r = await act($('#studio-go'), () => api('POST', '/generate', body));
    if (!r) return ($('#studio-out').innerHTML = '<div class="empty" style="grid-column:1/-1">Something went wrong — try again.</div>');
    batch = r.posts;
    renderOut();
  };
};

views.approvals = async () => {
  const posts = await api('GET', '/posts?status=pending_approval');
  view.innerHTML = `<div class="card"><div class="card-head"><h2>Posts waiting for your OK</h2><span class="muted small">The bot never publishes these until you approve (assist mode).</span>
    <div class="actions">${posts.length ? '<button class="good" id="approve-all">Approve all</button>' : ''}</div></div>
    <div class="post-grid" id="approval-list">${posts.map((p) => postCard(p)).join('') || '<div class="empty" style="grid-column:1/-1">Nothing waiting. 🎉</div>'}</div></div>`;
  bindPostActions($('#approval-list'), () => route());
  const all = $('#approve-all');
  if (all)
    all.onclick = (e) =>
      act(e.target, () => api('POST', '/posts/approve-batch', { ids: posts.map((p) => p.id) }), `${posts.length} posts approved`).then(() => route());
};

views.calendar = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const base = params.get('m') ? new Date(`${params.get('m')}-01T00:00:00`) : new Date();
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  const posts = await api('GET', `/posts?from=${start.toISOString()}&to=${end.toISOString()}&limit=1000`);
  const byDay = {};
  for (const p of posts) {
    const when = p.published_at || p.scheduled_at;
    if (!when) continue;
    const key = new Date(when).toDateString();
    (byDay[key] ??= []).push(p);
  }
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const today = new Date().toDateString();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const items = (byDay[d.toDateString()] || []).sort((a, b) => (a.published_at || a.scheduled_at).localeCompare(b.published_at || b.scheduled_at));
    cells += `<div class="cal-day ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${d.toDateString() === today ? 'today' : ''}">
      <div class="d">${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
      ${items.map((p) => `<div class="cal-post ${p.status}" data-edit="${p.id}" title="${esc(p.content.slice(0, 200))}">${pIcon(p.platform)} ${new Date(p.published_at || p.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${esc(p.title || typeLabel(p.post_type))}</div>`).join('')}
    </div>`;
  }
  view.innerHTML = `<div class="card">
    <div class="card-head"><a class="btn small" href="#/calendar?m=${monthKey(prev)}">←</a><h2>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><a class="btn small" href="#/calendar?m=${monthKey(next)}">→</a>
      <div class="actions"><span class="badge info">Scheduled</span><span class="badge warn">Needs approval</span><span class="badge good">Published</span><span class="badge bad">Failed</span><a class="btn small" href="#/create">+ Create post</a></div></div>
    <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-head">${d}</div>`).join('')}${cells}</div></div>`;
  view.onclick = (e) => {
    const el = e.target.closest('[data-edit]');
    if (el) openPostEditor(Number(el.dataset.edit), () => route());
  };
};

views.posts = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const status = params.get('status') || '';
  const platform = params.get('platform') || '';
  const posts = await api('GET', `/posts?${new URLSearchParams({ ...(status && { status }), ...(platform && { platform }) })}`);
  const filters = ['', ...state.meta.post_statuses];
  view.innerHTML = `<div class="card">
    <div class="tabs">${filters.map((s) => `<button class="${s === status ? 'active' : ''}" data-status="${s}">${s ? STATUS_BADGE[s][0] : 'All'}</button>`).join('')}
      <select id="pf" style="width:auto;margin-left:auto"><option value="">All platforms</option>${Object.entries(state.meta.platforms)
        .map(([k, p]) => `<option value="${k}" ${k === platform ? 'selected' : ''}>${esc(p.label)}</option>`)
        .join('')}</select></div>
    <div class="table-wrap"><table><tr><th></th><th>Post</th><th>Type</th><th>Status</th><th>When</th><th class="num">Reach</th><th class="num">Likes</th><th></th></tr>
    ${posts.map((p) => `<tr><td>${pIcon(p.platform)}</td><td style="max-width:420px"><div class="clip">${esc(p.content.split('\n')[0])}</div><div class="small muted">#${p.id} · ${esc(p.source)}</div></td><td class="small">${esc(typeLabel(p.post_type))}</td><td>${statusBadge(p.status)}</td><td class="small">${fmtDate(p.published_at || p.scheduled_at || p.created_at)}</td><td class="num">${p.status === 'published' ? num(p.metrics.reach) : ''}</td><td class="num">${p.status === 'published' ? num(p.metrics.likes) : ''}</td><td><button class="small" data-edit="${p.id}">Open</button></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty">No posts</div></td></tr>'}
    </table></div></div>`;
  const go = (s, pf) => (location.hash = `#/posts?${new URLSearchParams({ ...(s && { status: s }), ...(pf && { platform: pf }) })}`);
  $$('[data-status]').forEach((b) => (b.onclick = () => go(b.dataset.status, platform)));
  $('#pf').onchange = (e) => go(status, e.target.value);
  view.onclick = (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openPostEditor(Number(b.dataset.edit), () => route());
  };
};

views.inbox = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const status = params.get('status') ?? 'new';
  const messages = await api('GET', `/inbox?${status === 'leads' ? 'lead=1' : status ? `status=${status}` : ''}`);
  const tabs = [
    ['new', 'New'],
    ['escalated', 'Escalated'],
    ['leads', '🔥 Leads'],
    ['replied', 'Replied'],
    ['dismissed', 'Dismissed'],
    ['', 'All'],
  ];
  const sentiment = { positive: 'good', negative: 'bad', neutral: '' };
  const priority = { urgent: 'bad', high: 'warn', normal: 'info', low: '' };
  view.innerHTML = `<div class="card">
    <div class="card-head"><div class="tabs" style="margin:0">${tabs.map(([k, l]) => `<button class="${k === status ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div class="actions"><button class="small" id="inbox-sync">↻ Sync comments</button><button class="small" id="inbox-sim">+ Simulate messages</button></div></div>
    <div id="inbox-list">${
      messages
        .map(
          (m) => `<div class="list-item" data-msg="${m.id}">
      <div style="font-size:20px">${pIcon(m.platform)}</div>
      <div class="grow stack" style="gap:6px">
        <div class="row"><strong>${esc(m.author)}</strong><span class="small muted">${esc(m.kind)}${m.rating ? ` · ${'★'.repeat(m.rating)}` : ''} · ${ago(m.received_at)}</span>
          ${m.is_lead ? '<span class="badge warn">🔥 Lead</span>' : ''}${m.intent ? `<span class="badge">${esc(m.intent)}</span>` : ''}${m.sentiment ? `<span class="badge ${sentiment[m.sentiment]}">${esc(m.sentiment)}</span>` : ''}${m.priority ? `<span class="badge ${priority[m.priority]}">${esc(m.priority)}</span>` : ''}<span class="badge">${esc(m.status)}</span></div>
        <div>${esc(m.text)}</div>
        ${
          m.reply
            ? `<div class="small" style="border-left:3px solid var(--good);padding-left:8px">↩ ${esc(m.reply)}</div>`
            : ['new', 'escalated'].includes(m.status) && m.intent !== 'spam'
              ? `<textarea rows="2" data-reply-text>${esc(m.suggested_reply || '')}</textarea>
        <div class="row"><button class="small primary" data-reply="${m.id}">Send reply</button><button class="small" data-escalate="${m.id}">Escalate &amp; send to CRM</button><button class="small" data-dismiss="${m.id}">Dismiss</button></div>`
              : m.status === 'new'
                ? `<div class="row"><button class="small" data-dismiss="${m.id}">Dismiss spam</button></div>`
                : ''
        }
      </div></div>`,
        )
        .join('') || '<div class="empty">Inbox zero 🎉</div>'
    }</div></div>`;
  $$('[data-tab]').forEach((b) => (b.onclick = () => (location.hash = `#/inbox?status=${b.dataset.tab}`)));
  $('#inbox-sim').onclick = (e) =>
    act(
      e.target,
      () => api('POST', '/inbox/simulate', { count: 3 }),
      (r) => `${r.length} messages received and triaged`,
    ).then(() => {
      route();
      refreshBadges();
    });
  $('#inbox-sync').onclick = (e) =>
    act(
      e.target,
      () => api('POST', '/inbox/sync'),
      (r) => `${r.added} new comments`,
    ).then(() => route());
  $('#inbox-list').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const done = () => {
      route();
      refreshBadges();
    };
    if (b.dataset.reply) {
      const text = $('[data-reply-text]', b.closest('[data-msg]')).value;
      act(b, () => api('POST', `/inbox/${b.dataset.reply}/reply`, { text }), 'Reply sent').then(done);
    }
    if (b.dataset.dismiss) act(b, () => api('POST', `/inbox/${b.dataset.dismiss}/dismiss`)).then(done);
    if (b.dataset.escalate) act(b, () => api('POST', `/inbox/${b.dataset.escalate}/escalate`), 'Escalated').then(done);
  };
};

function vehicleForm(v = {}) {
  return `<form class="form-grid" id="vehicle-form">
    ${[
      ['year', 'Year', 'number'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['trim', 'Trim'],
      ['price', 'Price', 'number'],
      ['mileage', `Odometer (${state.dealership?.distance_unit || 'km'})`, 'number'],
      ['exterior_color', 'Color'],
      ['stock_number', 'Stock #'],
      ['vin', 'VIN'],
    ]
      .map(
        ([k, l, t = 'text']) =>
          `<label class="field"><span>${l}</span><input name="${k}" type="${t}" value="${esc(v[k] ?? '')}" ${['make', 'model'].includes(k) ? 'required' : ''}></label>`,
      )
      .join('')}
    <label class="field"><span>Condition</span><select name="condition">${['new', 'used', 'certified'].map((c) => `<option ${v.condition === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Status</span><select name="status">${['available', 'pending', 'sold'].map((c) => `<option ${v.status === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field full"><span>Features / highlights</span><textarea name="features" rows="2">${esc(v.features || '')}</textarea></label>
    <label class="field full"><span>Photo URLs (one per line)</span><textarea name="photos" rows="3">${esc((v.photos || []).join('\n'))}</textarea></label>
    <div class="full row"><span class="spacer"></span><button class="primary">Save vehicle</button></div>
  </form>`;
}

function openVehicleEditor(v, done) {
  const { el, close } = openModal(v?.id ? 'Edit vehicle' : 'Add vehicle', vehicleForm(v || {}));
  $('#vehicle-form', el).onsubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.photos = body.photos.split(/\s+/).filter(Boolean);
    act(e.submitter, () => (v?.id ? api('PATCH', `/vehicles/${v.id}`, body) : api('POST', '/vehicles', body)), 'Vehicle saved').then((r) => {
      if (r) {
        close();
        done();
      }
    });
  };
}

views.inventory = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const q = params.get('q') || '';
  const vehicles = await api('GET', `/vehicles?${new URLSearchParams(q ? { q } : {})}`);
  const unit = state.dealership?.distance_unit || 'km';
  view.innerHTML = `<div class="card">
    <div class="card-head"><form id="inv-search" style="flex:1;max-width:340px"><input name="q" placeholder="Search make, model, stock #…" value="${esc(q)}"></form>
      <div class="actions">${state.dealership?.inventory_feed_url ? '<button class="small" id="inv-sync">↻ Sync feed now</button>' : ''}<label class="btn small">⬆ Import CSV<input type="file" id="inv-csv" accept=".csv,text/csv" hidden></label><button class="small primary" id="inv-add">+ Add vehicle</button></div></div>
    <div class="table-wrap"><table><tr><th></th><th>Vehicle</th><th>Condition</th><th class="num">Price</th><th class="num">${unit}</th><th>Status</th><th>Last posted</th><th></th></tr>
    ${
      vehicles
        .map(
          (v) => `<tr><td>${v.photos[0] ? `<img src="${esc(v.photos[0])}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px">` : ''}</td>
      <td><strong>${esc([v.year, v.make, v.model].join(' '))}</strong> ${esc(v.trim)}<div class="small muted">${esc(v.exterior_color)} ${v.stock_number ? `· #${esc(v.stock_number)}` : ''}</div></td>
      <td>${esc(v.condition)}</td><td class="num">${money(v.price)}${v.previous_price > v.price ? `<div class="small" style="color:var(--good)">↓ from ${money(v.previous_price)}</div>` : ''}</td><td class="num">${num(v.mileage)}</td>
      <td><span class="badge ${v.status === 'available' ? 'good' : v.status === 'sold' ? 'info' : 'warn'}">${v.status}</span></td>
      <td class="small">${v.last_posted_at ? ago(v.last_posted_at) : '<span class="badge warn">never</span>'}</td>
      <td><div class="row" style="flex-wrap:nowrap"><a class="btn small" href="${v.status === 'sold' ? `#/studio?vehicle=${v.id}&type=sold_celebration` : `#/create?vehicle=${v.id}`}">✨ Create post</a><button class="small" data-vedit="${v.id}">Edit</button><button class="small danger" data-vdel="${v.id}">✕</button></div></td></tr>`,
        )
        .join('') ||
      '<tr><td colspan="8"><div class="empty">No vehicles yet. Add one or import a CSV export from your DMS (columns like Stock, VIN, Year, Make, Model, Trim, Price, Mileage, Color, Features, Photos).</div></td></tr>'
    }
    </table></div></div>`;
  $('#inv-search').onsubmit = (e) => {
    e.preventDefault();
    location.hash = `#/inventory?q=${encodeURIComponent(new FormData(e.target).get('q'))}`;
  };
  $('#inv-add').onclick = () => openVehicleEditor(null, route);
  const sync = $('#inv-sync');
  if (sync)
    sync.onclick = () =>
      act(
        sync,
        () => api('POST', '/vehicles/sync-feed'),
        (r) => `Feed synced: ${r.summary}`,
      ).then(route);
  $('#inv-csv').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = await act(null, async () => api('POST', '/vehicles/import', await file.text(), { raw: true }));
    if (r) toast(`Imported: ${r.created} added, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} errors` : ''}`);
    route();
  };
  view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.vedit)
      openVehicleEditor(
        vehicles.find((v) => v.id === Number(b.dataset.vedit)),
        route,
      );
    if (b.dataset.vdel && confirm('Delete this vehicle?')) act(b, () => api('DELETE', `/vehicles/${b.dataset.vdel}`), 'Deleted').then(route);
  };
};

function ruleForm(r = {}) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sel = r.days_of_week || [1, 2, 3, 4, 5];
  return `<form class="stack" id="rule-form">
    <label class="field"><span>Name</span><input name="name" required value="${esc(r.name || '')}" placeholder="Daily vehicle spotlight"></label>
    <label class="field"><span>What to post</span><select name="post_type">${typeOptions(r.post_type || 'vehicle_spotlight')}</select></label>
    <div class="field"><span class="small muted">Where</span>${platformChecks('platforms', r.platforms || ['facebook', 'instagram'])}</div>
    <div class="field"><span class="small muted">Days</span><div class="checks">${days.map((d, i) => `<label class="check"><input type="checkbox" name="days" value="${i}" ${sel.includes(i) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
    <label class="field"><span>Time</span><input type="time" name="time_of_day" value="${esc(r.time_of_day || '10:00')}"></label>
    <label class="field"><span>Standing instructions for the bot</span><textarea name="instructions" placeholder="e.g. Always mention our free lifetime oil changes">${esc(r.instructions || '')}</textarea></label>
    <div class="row"><span class="spacer"></span><button class="primary">Save rule</button></div>
  </form>`;
}

function openRuleEditor(rule, done) {
  const { el, close } = openModal(rule?.id ? 'Edit autopilot rule' : 'New autopilot rule', ruleForm(rule || {}));
  $('#rule-form', el).onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = {
      name: f.get('name'),
      post_type: f.get('post_type'),
      platforms: checkedValues(e.target, 'platforms'),
      days_of_week: checkedValues(e.target, 'days').map(Number),
      time_of_day: f.get('time_of_day'),
      instructions: f.get('instructions'),
    };
    act(e.submitter, () => (rule?.id ? api('PATCH', `/autopilot/rules/${rule.id}`, body) : api('POST', '/autopilot/rules', body)), 'Rule saved').then((r) => {
      if (r) {
        close();
        done();
      }
    });
  };
}

views.autopilot = async () => {
  const [rules, dealer] = await Promise.all([api('GET', '/autopilot/rules'), api('GET', '/dealership')]);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  view.innerHTML = `<div class="stack">
    <div class="card"><div class="card-head"><h2>Bot autonomy</h2></div>
      <div class="grid cols-2">
        <label class="check" style="border-radius:10px;padding:12px;align-items:flex-start"><input type="radio" name="autonomy" value="assist" ${dealer.autonomy === 'assist' ? 'checked' : ''}><div><strong>Assist (recommended to start)</strong><div class="small muted">The bot writes and plans; every post and reply waits for your approval.</div></div></label>
        <label class="check" style="border-radius:10px;padding:12px;align-items:flex-start"><input type="radio" name="autonomy" value="autopilot" ${dealer.autonomy === 'autopilot' ? 'checked' : ''}><div><strong>Full autopilot</strong><div class="small muted">The bot publishes on schedule and answers simple comments on its own. Leads and complaints are still escalated to you.</div></div></label>
      </div></div>
    <div class="card"><div class="card-head"><h2>Recurring rules</h2><span class="muted small">The bot creates these posts automatically, picking the right vehicle each time.</span><div class="actions"><button class="primary small" id="rule-add">+ New rule</button></div></div>
      <div class="table-wrap"><table><tr><th>On</th><th>Rule</th><th>Where</th><th>When</th><th>Next run</th><th></th></tr>
      ${
        rules
          .map(
            (
              r,
            ) => `<tr><td><input type="checkbox" data-toggle="${r.id}" ${r.enabled ? 'checked' : ''}></td><td><strong>${esc(r.name)}</strong><div class="small muted">${esc(typeLabel(r.post_type))}</div></td><td>${r.platforms.map(pIcon).join(' ')}</td><td class="small">${r.days_of_week.map((d) => days[d]).join(', ')} at ${esc(r.time_of_day)}</td><td class="small">${r.enabled ? fmtDate(r.next_run_at) : '—'}${r.last_run_at ? `<div class="muted">last ${ago(r.last_run_at)}</div>` : ''}</td>
        <td><div class="row" style="flex-wrap:nowrap"><button class="small" data-run="${r.id}">Run now</button><button class="small" data-redit="${r.id}">Edit</button><button class="small danger" data-rdel="${r.id}">✕</button></div></td></tr>`,
          )
          .join('') || '<tr><td colspan="6"><div class="empty">No rules yet</div></td></tr>'
      }
      </table></div></div></div>`;
  $$('input[name="autonomy"]').forEach(
    (i) => (i.onchange = () => act(null, () => api('PUT', '/dealership', { autonomy: i.value }), `Mode: ${i.value}`).then(loadShell)),
  );
  $('#rule-add').onclick = () => openRuleEditor(null, route);
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.redit)
      openRuleEditor(
        rules.find((r) => r.id === Number(b.dataset.redit)),
        route,
      );
    if (b?.dataset.rdel && confirm('Delete this rule?')) act(b, () => api('DELETE', `/autopilot/rules/${b.dataset.rdel}`)).then(route);
    if (b?.dataset.run)
      act(
        b,
        () => api('POST', `/autopilot/rules/${b.dataset.run}/run`),
        (r) => (r.skipped ? r.reason : `${r.posts.length} posts created`),
      ).then(() => {
        route();
        refreshBadges();
      });
  };
  view.onchange = (e) => {
    const t = e.target.dataset?.toggle;
    if (t) act(null, () => api('PATCH', `/autopilot/rules/${t}`, { enabled: e.target.checked })).then(route);
  };
};

views.analytics = async () => {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = Number(params.get('days') || 30);
  const a = await api('GET', `/analytics?days=${days}`);
  const t = a.totals;
  const max = Math.max(1, ...a.series.map((s) => s.reach));
  view.innerHTML = `<div class="stack">
    <div class="row"><div class="tabs" style="margin:0">${[7, 30, 90].map((d) => `<button class="${d === days ? 'active' : ''}" data-days="${d}">Last ${d} days</button>`).join('')}</div><span class="spacer"></span><button class="small" id="an-refresh">↻ Refresh numbers</button></div>
    <div class="kpis" style="margin:0">
      ${[
        ['Posts', t.posts],
        ['Reach', t.reach],
        ['Engagements', t.engagements],
        ['Engagement rate', `${t.engagement_rate}%`],
        ['Link clicks', t.clicks],
        ['Leads', t.leads],
      ]
        .map(([l, v]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${typeof v === 'number' ? num(v) : v}</div></div>`)
        .join('')}
    </div>
    <div class="card"><div class="card-head"><h2>Daily reach</h2></div>
      <div class="bars">${a.series.map((s) => `<div class="bar" style="height:${(s.reach / max) * 100}%" title="${s.day}: ${num(s.reach)} reach, ${s.posts} posts"></div>`).join('')}</div>
      <div class="bars-axis"><span>${a.series[0]?.day || ''}</span><span>${a.series.at(-1)?.day || ''}</span></div></div>
    <div class="grid cols-2">
      <div class="card"><div class="card-head"><h2>By platform</h2></div><div class="table-wrap"><table><tr><th>Platform</th><th class="num">Posts</th><th class="num">Reach</th><th class="num">Eng. rate</th></tr>
        ${a.by_platform.map((r) => `<tr><td>${pIcon(r.platform)} ${esc(r.label)}</td><td class="num">${r.posts}</td><td class="num">${num(r.reach)}</td><td class="num">${r.engagement_rate}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No data yet</td></tr>'}</table></div></div>
      <div class="card"><div class="card-head"><h2>By post type</h2></div><div class="table-wrap"><table><tr><th>Type</th><th class="num">Posts</th><th class="num">Reach</th><th class="num">Eng. rate</th></tr>
        ${a.by_type.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.posts}</td><td class="num">${num(r.reach)}</td><td class="num">${r.engagement_rate}%</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No data yet</td></tr>'}</table></div></div>
    </div>
    <div class="card"><div class="card-head"><h2>Top posts</h2><div class="actions"><a class="btn small" href="#/assistant">Ask the bot for insights →</a></div></div>
      ${a.top_posts.map((p) => `<div class="list-item"><div>${pIcon(p.platform)}</div><div class="grow"><div class="clip">${esc(p.content)}</div><div class="small muted">${esc(typeLabel(p.post_type))} · 👁 ${num(p.metrics.reach)} · ❤️ ${num(p.metrics.likes)} · 💬 ${num(p.metrics.comments)} · 🔁 ${num(p.metrics.shares)}</div></div>${p.external_url ? `<a class="btn small" target="_blank" rel="noopener" href="${esc(p.external_url)}">View ↗</a>` : ''}</div>`).join('') || '<div class="empty">Publish a few posts to see what works best.</div>'}</div>
  </div>`;
  $$('[data-days]').forEach((b) => (b.onclick = () => (location.hash = `#/analytics?days=${b.dataset.days}`)));
  $('#an-refresh').onclick = (e) =>
    act(
      e.target,
      () => api('POST', '/analytics/refresh'),
      (r) => `${r.updated} posts updated`,
    ).then(route);
};

const COMMON_TZ = [
  'America/Moncton',
  'America/Halifax',
  'America/St_Johns',
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Winnipeg',
  'America/Regina',
  'America/Denver',
  'America/Edmonton',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Anchorage',
  'Pacific/Honolulu',
];
function timezones(selected) {
  const list = COMMON_TZ.includes(selected) ? COMMON_TZ : [selected, ...COMMON_TZ];
  return list.map((z) => `<option ${z === selected ? 'selected' : ''}>${esc(z)}</option>`).join('');
}

async function openConnectPicker(stateToken) {
  let options;
  try {
    options = await api('GET', `/oauth/pending/${encodeURIComponent(stateToken)}`);
  } catch (err) {
    return toast(err.message, 'error');
  }
  const { el, close } = openModal(
    'Choose what to connect',
    options.length
      ? `<div class="stack">${options.map((o) => `<label class="check" style="border-radius:8px"><input type="checkbox" value="${o.index}" ${o.already_connected ? '' : 'checked'}> ${pIcon(o.platform)} ${esc(o.display_name)} <span class="small muted">${esc(platformLabel(o.platform))}${o.already_connected ? ' · already connected (refresh token)' : ''}</span></label>`).join('')}
      <div class="row"><span class="spacer"></span><button class="primary" id="connect-go">Connect selected</button></div></div>`
      : '<div class="empty">No pages or profiles were found on that login. Make sure you are an admin of the page/location and granted all permissions.</div>',
  );
  const go = $('#connect-go', el);
  if (go)
    go.onclick = () =>
      act(
        go,
        () => api('POST', `/oauth/pending/${encodeURIComponent(stateToken)}/connect`, { indexes: $$('input:checked', el).map((i) => Number(i.value)) }),
        (r) => `${r.connected} account(s) connected`,
      ).then((r) => {
        if (!r) return;
        close();
        location.hash = '#/settings';
      });
}

views.settings = async () => {
  const [d, accounts] = await Promise.all([api('GET', '/dealership'), api('GET', '/accounts')]);
  const field = (k, l, type = 'input', ph = '') =>
    type === 'textarea'
      ? `<label class="field full"><span>${l}</span><textarea name="${k}" rows="2" placeholder="${esc(ph)}">${esc(d[k])}</textarea></label>`
      : `<label class="field"><span>${l}</span><input name="${k}" value="${esc(d[k])}" placeholder="${esc(ph)}"></label>`;
  view.innerHTML = `<div class="stack">
    <form class="card" id="dealer-form"><div class="card-head"><h2>Dealership profile</h2><span class="muted small">The bot uses this for every post and reply.</span></div>
      <div class="form-grid">
        ${field('name', 'Dealership name')}${field('brands', 'Brands you sell', 'input', 'Volkswagen, pre-owned all makes')}
        ${field('city', 'City', 'input', 'Moncton, NB')}${field('address', 'Address')}
        ${field('phone', 'Phone')}${field('website', 'Website')}
        ${field('brand_voice', 'Brand voice', 'textarea', 'Friendly, upbeat, community-focused…')}
        ${field('call_to_action', 'Default call to action')}${field('default_hashtags', 'Always-on hashtags', 'input', '#YourDealer #YourCity')}
        ${field('compliance_notes', 'Compliance / legal line (added when prices are shown)', 'textarea')}
        ${field('language', 'Post language(s)', 'input', 'English, or English and French')}
        <label class="field"><span>Odometer unit</span><select name="distance_unit"><option value="km" ${d.distance_unit === 'km' ? 'selected' : ''}>Kilometres</option><option value="mi" ${d.distance_unit === 'mi' ? 'selected' : ''}>Miles</option></select></label>
        <label class="field"><span>Time zone (autopilot schedules use it)</span><select name="timezone">${timezones(d.timezone)}</select></label>
        <label class="field full"><span>Inventory feed URL (CSV from your DMS or website provider — synced every 6 hours, Pro plan)</span><input name="inventory_feed_url" value="${esc(d.inventory_feed_url)}" placeholder="https://…/inventory.csv"></label>
        <label class="check full" style="border-radius:8px"><input type="checkbox" name="feed_marks_sold" value="1" ${d.feed_marks_sold ? 'checked' : ''}> Mark vehicles as sold when they disappear from the feed (creates “sold” celebration posts)</label>
        <label class="field full"><span>CRM lead email (leads from comments, DMs and reviews are forwarded in ADF/XML — the format your CRM already accepts)</span><input name="crm_lead_email" type="email" value="${esc(d.crm_lead_email || '')}" placeholder="leads@yourstore.crm-provider.com"></label>
        ${d.feed_last_synced_at ? `<div class="full small muted">Last feed sync ${ago(d.feed_last_synced_at)}: ${esc(d.feed_last_result)}</div>` : ''}
        <div class="full row"><span class="spacer"></span><button class="primary">Save profile</button></div>
      </div></form>
    <div class="card"><div class="card-head"><h2>Connected accounts</h2><div class="actions"><button class="small" id="acct-add">Advanced: add manually</button></div></div>
      <div class="row" style="margin-bottom:10px">${Object.entries(state.meta.oauth)
        .map(
          ([k, o]) =>
            `<button class="${o.configured ? 'primary' : ''} small" data-oauth="${k}" ${o.configured ? '' : 'disabled title="Not configured on this server yet"'}>🔗 Connect ${esc(o.label)}</button>`,
        )
        .join('')}</div>
      <p class="small muted">Connect your pages once and Create Post can publish to them directly. Until a page is connected, you get ready-to-copy posts instead. <strong>Practice</strong> accounts are for training only: nothing is really posted.</p>
      <div class="table-wrap"><table><tr><th>Platform</th><th>Name</th><th>Mode</th><th>Token</th><th>On</th><th></th></tr>
      ${accounts.map((a) => `<tr><td>${pIcon(a.platform)} ${esc(platformLabel(a.platform))}</td><td>${esc(a.display_name)}${a.last_error ? `<div class="small" style="color:var(--bad)">⚠️ ${esc(a.last_error)}</div>` : ''}</td><td><span class="badge ${a.mode === 'live' ? 'good' : ''}">${a.mode === 'live' ? 'Connected' : 'Practice'}</span></td><td class="small muted">${esc(a.token_hint || '—')}</td><td><input type="checkbox" data-aon="${a.id}" ${a.enabled ? 'checked' : ''}></td><td><button class="small" data-aedit="${a.id}">Edit</button> <button class="small danger" data-adel="${a.id}">✕</button></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No accounts yet</div></td></tr>'}
      </table></div></div>
    <form class="card" id="pw-form"><div class="card-head"><h2>Your password</h2></div><div class="form-grid">
      <label class="field"><span>Current password</span><input type="password" name="current_password" required autocomplete="current-password"></label>
      <label class="field"><span>New password</span><input type="password" name="new_password" required minlength="8" autocomplete="new-password"></label>
      <div class="full row"><span class="spacer"></span><button>Change password</button></div></div></form>
    ${state.me?.role === 'owner' ? `<div class="card"><div class="card-head"><h2>Your data</h2><div class="actions"><a class="btn small" href="/api/export" download>⬇ Export everything (JSON)</a></div></div><p class="small muted">Download your inventory, posts, inbox and settings at any time. To delete your dealership, email ${esc(state.meta.support_email)} from an owner address.</p></div>` : ''}</div>`;
  $('#dealer-form').onsubmit = (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    body.feed_marks_sold = !!body.feed_marks_sold;
    act(e.submitter, () => api('PUT', '/dealership', body), 'Profile saved').then(loadShell);
  };
  $('#pw-form').onsubmit = (e) => {
    e.preventDefault();
    act(
      e.submitter,
      () =>
        fetch('/api/me/password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
          body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
        }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error);
          e.target.reset();
        }),
      'Password changed',
    );
  };
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.get('connect_error')) toast(`Connection failed: ${params.get('connect_error')}`, 'error');
  if (params.get('connect')) openConnectPicker(params.get('connect'));
  const accountEditor = (a) => {
    const { el, close } = openModal(
      a ? 'Edit account' : 'Connect account',
      `<form class="stack" id="acct-form">
      <label class="field"><span>Platform</span><select name="platform" ${a ? 'disabled' : ''}>${Object.entries(state.meta.platforms)
        .map(([k, p]) => `<option value="${k}" ${a?.platform === k ? 'selected' : ''}>${esc(p.label)}${p.live_supported ? '' : ' (practice only)'}</option>`)
        .join('')}</select></label>
      <label class="field"><span>Display name</span><input name="display_name" required value="${esc(a?.display_name || '')}" placeholder="Riverside Motors"></label>
      <label class="field"><span>Mode</span><select name="mode"><option value="simulated">Practice (nothing is posted)</option><option value="live" ${a?.mode === 'live' ? 'selected' : ''}>Live</option></select></label>
      <label class="field"><span>Page ID / account ID (live)</span><input name="external_id" value="${esc(a?.external_id || '')}"></label>
      <label class="field"><span>Access token (live)${a?.has_token ? ' — leave blank to keep current' : ''}</span><input name="access_token" type="password" autocomplete="off"></label>
      <div class="row"><span class="spacer"></span><button class="primary">Save</button></div></form>`,
    );
    $('#acct-form', el).onsubmit = (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      act(e.submitter, () => (a ? api('PATCH', `/accounts/${a.id}`, body) : api('POST', '/accounts', body)), 'Account saved').then((r) => {
        if (r) {
          close();
          route();
        }
      });
    };
  };
  $('#acct-add').onclick = () => accountEditor(null);
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.oauth) act(b, () => api('POST', `/oauth/${b.dataset.oauth}/start`)).then((r) => r && (location.href = r.url));
    if (b?.dataset.aedit) accountEditor(accounts.find((a) => a.id === Number(b.dataset.aedit)));
    if (b?.dataset.adel && confirm('Disconnect this account?')) act(b, () => api('DELETE', `/accounts/${b.dataset.adel}`)).then(route);
  };
  view.onchange = (e) => {
    const id = e.target.dataset?.aon;
    if (id) act(null, () => api('PATCH', `/accounts/${id}`, { enabled: e.target.checked }));
  };
};

views.team = async () => {
  const team = await api('GET', '/team');
  const isOwner = state.me?.role === 'owner';
  const roleSelect = (m) =>
    isOwner && m.id !== state.me.user.id
      ? `<select data-role="${m.id}" style="width:auto">${['owner', 'manager', 'staff'].map((r) => `<option ${r === m.role ? 'selected' : ''}>${r}</option>`).join('')}</select>`
      : `<span class="badge">${esc(m.role)}</span>`;
  view.innerHTML = `<div class="stack">
    <div class="card"><div class="card-head"><h2>Team members</h2><span class="small muted">Owners manage billing & team · Managers approve, publish and configure · Staff draft posts and work the inbox</span></div>
      <div class="table-wrap"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr>
      ${team.members.map((m) => `<tr><td>${esc(m.name || '—')}</td><td>${esc(m.email)}</td><td>${roleSelect(m)}</td><td class="small">${m.last_login_at ? ago(m.last_login_at) : 'never'}</td><td>${isOwner && m.id !== state.me.user.id ? `<button class="small danger" data-remove="${m.id}">Remove</button>` : ''}</td></tr>`).join('')}
      </table></div></div>
    ${
      isOwner
        ? `<form class="card" id="invite-form"><div class="card-head"><h2>Invite someone</h2></div><div class="row">
      <input type="email" name="email" placeholder="name@dealership.com" required style="flex:1;min-width:200px">
      <select name="role" style="width:auto"><option value="staff">Staff</option><option value="manager">Manager</option><option value="owner">Owner</option></select>
      <button class="primary">Send invite</button></div><div id="invite-link" class="small" style="margin-top:8px"></div></form>`
        : ''
    }
    ${team.invites.length ? `<div class="card"><div class="card-head"><h2>Pending invites</h2></div>${team.invites.map((i) => `<div class="list-item"><div class="grow">${esc(i.email)} <span class="badge">${esc(i.role)}</span><div class="small muted">expires ${fmtDate(i.expires_at)}</div></div>${isOwner ? `<button class="small" data-revoke="${i.id}">Revoke</button>` : ''}</div>`).join('')}</div>` : ''}
  </div>`;
  const inviteForm = $('#invite-form');
  if (inviteForm)
    inviteForm.onsubmit = async (e) => {
      e.preventDefault();
      const r = await act(e.submitter, () => api('POST', '/team/invites', Object.fromEntries(new FormData(e.target))));
      if (!r) return;
      toast(r.emailed ? 'Invite emailed' : 'Invite created');
      $('#invite-link').innerHTML = `Share this link if the email doesn’t arrive: <input readonly value="${esc(r.invite_url)}" style="margin-top:4px">`;
      setTimeout(route, r.emailed ? 0 : 60_000);
    };
  view.onclick = (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.remove && confirm('Remove this person from the dealership?'))
      act(b, () => api('DELETE', `/team/members/${b.dataset.remove}`), 'Removed').then(route);
    if (b?.dataset.revoke) act(b, () => api('DELETE', `/team/invites/${b.dataset.revoke}`), 'Invite revoked').then(route);
  };
  view.onchange = (e) => {
    const uid = e.target.dataset?.role;
    if (uid) act(null, () => api('PATCH', `/team/members/${uid}`, { role: e.target.value }), 'Role updated').then(route);
  };
};

views.billing = async () => {
  const b = await api('GET', '/billing');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.get('checkout') === 'success') toast('Thanks! Your subscription is active 🎉');
  let interval = params.get('interval') === 'year' ? 'year' : b.billing_interval || 'month';
  const isOwner = state.me?.role === 'owner';
  const statusText =
    {
      trialing: `Free trial — ends ${b.trial_ends_at ? new Date(b.trial_ends_at).toLocaleDateString() : 'soon'}`,
      active: `Active — renews ${b.current_period_end ? new Date(b.current_period_end).toLocaleDateString() : ''}`,
      past_due: 'Payment failed — please update your card',
      canceled: 'Canceled',
      unpaid: 'Unpaid',
      comped: 'Complimentary plan',
    }[b.subscription_status] || b.subscription_status;
  const meter = (label, used, limit) => {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 100;
    return `<div class="stack" style="gap:4px"><div class="row small"><span>${label}</span><span class="spacer"></span><span class="muted">${num(used)} / ${limit ? num(limit) : '—'}</span></div><div class="meter ${pct >= 100 ? 'full' : ''}"><div style="width:${pct}%"></div></div></div>`;
  };
  const render = () => {
    view.innerHTML = `<div class="stack">
      <div class="card"><div class="card-head"><h2>Current plan: ${esc(b.planName)}</h2><span class="badge ${b.active ? 'good' : 'bad'}">${esc(statusText)}</span>
        <div class="actions">${isOwner && b.has_billing_account && b.billing_enabled ? '<button class="small" id="portal">Manage billing, invoices & card</button>' : ''}</div></div>
        ${b.reason ? `<div class="banner bad">${esc(b.reason)}</div>` : ''}
        <div class="grid cols-2">
          ${meter('AI-written posts this month', b.usage.aiPostsThisMonth, b.limits.aiPostsPerMonth)}
          ${meter('AI assistant messages this month', b.usage.aiChatsThisMonth, b.limits.aiChatTurnsPerMonth)}
          ${meter('Social accounts', b.usage.socialAccounts, b.limits.socialAccounts)}
          ${meter('Team members', b.usage.users, b.limits.users)}
          ${meter('Autopilot rules', b.usage.autopilotRules, b.limits.autopilotRules)}
        </div></div>
      <div class="row" style="justify-content:center"><div class="tabs" style="margin:0"><button data-int="month" class="${interval === 'month' ? 'active' : ''}">Monthly</button><button data-int="year" class="${interval === 'year' ? 'active' : ''}">Yearly — 2 months free</button></div></div>
      <div class="l-pricing">${Object.entries(b.plans)
        .map(([key, p]) => {
          const current = key === b.plan && ['active', 'past_due', 'comped'].includes(b.subscription_status);
          const price = interval === 'year' ? Math.round(p.yearly / 12) : p.monthly;
          return `<div class="card l-plan ${p.popular ? 'popular' : ''}">
          ${p.popular ? '<span class="badge info">Most popular</span>' : ''}<h3>${esc(p.name)}</h3><p class="small muted">${esc(p.tagline)}</p>
          <div class="l-price">$${price}<span>/mo</span></div><div class="small muted">${interval === 'year' ? `billed $${p.yearly.toLocaleString()} yearly` : 'billed monthly'} · USD</div>
          <ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
          ${current ? '<button disabled>Current plan</button>' : isOwner ? `<button class="${p.popular ? 'primary' : ''}" data-plan="${key}">${b.subscription_status === 'active' ? 'Switch' : 'Choose'} ${esc(p.name)}</button>` : '<span class="small muted">Ask the owner to change plans</span>'}
        </div>`;
        })
        .join('')}</div>
      ${b.billing_enabled ? '' : `<p class="small muted" style="text-align:center">Online payment isn’t switched on for this server yet — contact <a href="mailto:${esc(state.meta.support_email)}">${esc(state.meta.support_email)}</a> to activate a plan.</p>`}
    </div>`;
  };
  render();
  view.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.int) {
      interval = btn.dataset.int;
      render();
    }
    if (btn.dataset.plan) act(btn, () => api('POST', '/billing/checkout', { plan: btn.dataset.plan, interval })).then((r) => r?.url && (location.href = r.url));
    if (btn.id === 'portal') act(btn, () => api('POST', '/billing/portal')).then((r) => r?.url && (location.href = r.url));
  };
};

// ---------- Create Post: New/Used → objective → details → review → publish ----------
// One guided flow built for a busy sales manager on a phone. Kept in `wiz` so leaving the
// screen (to connect an account, say) and coming back doesn't lose the work.

const CORE_PLATFORMS = ['facebook', 'instagram', 'linkedin'];
const PLATFORM_HOME = {
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  linkedin: 'https://www.linkedin.com/feed/',
  x: 'https://x.com/compose/post',
  tiktok: 'https://www.tiktok.com/upload',
  google_business: 'https://business.google.com/',
};
const STEPS = ['New or used', 'Goal', 'Details', 'Review & post'];
let wiz = freshWizard();

function freshWizard() {
  return { step: 'condition', condition: null, objective: null, details: {}, photos: [], vehicleId: null, posts: [], include: {}, results: null };
}

const isManager = () => ['owner', 'manager'].includes(state.me?.role);
const objectiveDef = () => (state.meta.objectives[wiz.condition] || []).find((o) => o.key === wiz.objective);
const liveAccounts = (accounts) => accounts.filter((a) => a.enabled && a.mode === 'live');
const composeClient = (p) => {
  const tags = (p.hashtags || []).filter((t) => !p.content.toLowerCase().includes(t.toLowerCase()));
  return tags.length ? `${p.content.trim()}\n\n${tags.join(' ')}` : p.content.trim();
};

function stepper(active) {
  return `<ol class="stepper" aria-label="Progress">${STEPS.map((s, i) => `<li class="${i < active ? 'done' : i === active ? 'current' : ''}">${s}</li>`).join('')}</ol>`;
}

async function shrinkPhoto(file) {
  // Phones produce 4–12 MB photos; 1600px JPEG is plenty for social and uploads fast on LTE.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob || file;
  } catch {
    return file;
  }
}

async function uploadPhoto(file) {
  const blob = await shrinkPhoto(file);
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': blob.type || 'image/jpeg', 'x-requested-with': 'fetch' },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Photo upload failed');
  return data.url;
}

views.create = async (opts) => {
  // Coming back to Create Post after finishing one starts a new post.
  if (!opts?.internal && wiz.step === 'done') wiz = freshWizard();
  // "Create post" from the inventory screen: start with that vehicle filled in.
  const vehicleParam = new URLSearchParams(location.hash.split('?')[1] || '').get('vehicle');
  if (vehicleParam) {
    history.replaceState(null, '', '#/create');
    const v = await api('GET', `/vehicles/${Number(vehicleParam)}`).catch(() => null);
    if (v) {
      const details = {};
      for (const k of ['year', 'make', 'model', 'trim', 'mileage', 'stock_number', 'exterior_color', 'features'])
        if (v[k] != null && v[k] !== '') details[k] = String(v[k]);
      if (v.price != null) details.price = `$${Number(v.price).toLocaleString()}`;
      if (v.previous_price != null) details.previous_price = `$${Number(v.previous_price).toLocaleString()}`;
      wiz = { ...freshWizard(), step: 'objective', condition: v.condition === 'new' ? 'new' : 'used', vehicleId: v.id, details, photos: [...(v.photos || [])] };
    }
  }
  if (wiz.step === 'condition') return renderCondition();
  if (wiz.step === 'objective') return renderObjective();
  if (wiz.step === 'details') return renderDetails();
  if (wiz.step === 'review') return renderReview();
  return renderDone();
};

const goTo = (step) => {
  wiz.step = step;
  view.onclick = view.onchange = view.oninput = null;
  views.create({ internal: true });
  window.scrollTo(0, 0);
};

async function renderCondition() {
  const [recent, accounts] = await Promise.all([api('GET', '/posts?limit=5'), api('GET', '/accounts')]);
  const connected = liveAccounts(accounts);
  view.innerHTML = `<div class="create">
    <h2 class="create-q">What do you want to post about?</h2>
    <div class="cond-grid">
      <button class="cond-card cond-new" data-cond="new"><span class="cond-emoji" aria-hidden="true">✨</span><span class="cond-title">New vehicles</span><span class="cond-sub">Arrivals, monthly offers, demos, leftovers, events</span></button>
      <button class="cond-card cond-used" data-cond="used"><span class="cond-emoji" aria-hidden="true">🚗</span><span class="cond-title">Used vehicles</span><span class="cond-sub">Fresh arrivals, price drops, specials, trade-ins</span></button>
    </div>
    ${
      connected.length
        ? `<p class="small muted">Posting to: ${connected.map((a) => `${pIcon(a.platform)} ${esc(a.display_name)}`).join(' · ')}</p>`
        : `<div class="banner info">🔗 No social accounts connected yet. You can still create posts and copy them to Facebook, Instagram or LinkedIn yourself. <a class="btn small" href="#/settings">Connect accounts</a></div>`
    }
    <p class="small"><a href="#/studio">Something else? Events, service tips, reviews →</a></p>
    ${
      recent.length
        ? `<div class="card"><div class="card-head"><h3>Recent posts</h3><div class="actions"><a class="btn small" href="#/posts">See all</a></div></div>
      ${recent.map((p) => `<div class="list-item"><div>${pIcon(p.platform)}</div><div class="grow"><div class="clip">${esc(p.content.split('\n')[0])}</div><div class="small muted">${statusBadge(p.status)} ${fmtDate(p.published_at || p.scheduled_at || p.created_at)}</div></div><button class="small" data-edit="${p.id}">Open</button></div>`).join('')}</div>`
        : ''
    }
  </div>`;
  view.onclick = (e) => {
    const cond = e.target.closest('[data-cond]');
    if (cond) {
      wiz = { ...freshWizard(), condition: cond.dataset.cond };
      return goTo('objective');
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) openPostEditor(Number(ed.dataset.edit), () => route());
  };
}

function renderObjective() {
  const list = state.meta.objectives[wiz.condition];
  view.innerHTML = `<div class="create">
    ${stepper(1)}
    <div class="row"><button class="small" id="back">← Back</button><h2 class="create-h">${wiz.condition === 'new' ? 'New vehicle' : 'Used vehicle'}: what’s the goal?</h2></div>
    <div class="objective-grid">${list
      .map(
        (o) => `<button class="objective ${wiz.objective === o.key ? 'selected' : ''}" data-objective="${o.key}">
          <span class="objective-emoji" aria-hidden="true">${o.emoji}</span><span><span class="objective-label">${esc(o.label)}</span><span class="objective-hint">${esc(o.hint)}</span></span></button>`,
      )
      .join('')}</div>
  </div>`;
  $('#back').onclick = () => goTo('condition');
  view.onclick = (e) => {
    const b = e.target.closest('[data-objective]');
    if (!b) return;
    if (wiz.objective !== b.dataset.objective) wiz.posts = [];
    wiz.objective = b.dataset.objective;
    goTo('details');
  };
}

async function renderDetails() {
  const o = objectiveDef();
  const required = o.required ?? ['make', 'model'];
  const vehicles = (await api('GET', '/vehicles?status=available')).filter((v) => (wiz.condition === 'new' ? v.condition === 'new' : v.condition !== 'new'));
  const fieldHtml = (key) => {
    const f = state.meta.fields[key];
    const label = `${esc(o.labels?.[key] || f.label)}${required.includes(key) ? ' <span class="req">*</span>' : ''}`;
    const value = esc(wiz.details[key] ?? '');
    const control =
      f.type === 'textarea'
        ? `<textarea id="f-${key}" name="${key}" rows="3" placeholder="${esc(f.placeholder || '')}">${value}</textarea>`
        : `<input id="f-${key}" name="${key}" type="${f.type === 'date' ? 'date' : 'text'}" ${f.inputmode ? `inputmode="${f.inputmode}"` : ''} placeholder="${esc(f.placeholder || '')}" value="${value}" autocomplete="off">`;
    return `<label class="field ${f.half ? '' : 'full'}" for="f-${key}"><span>${label}${key === 'mileage' ? ` (${esc(state.dealership.distance_unit)})` : ''}</span>${control}</label>`;
  };
  view.innerHTML = `<form class="create" id="details-form" novalidate>
    ${stepper(2)}
    <div class="row"><button type="button" class="small" id="back">← Back</button><h2 class="create-h">${o.emoji} ${esc(o.label)}</h2></div>
    ${
      vehicles.length
        ? `<label class="field" for="pick-vehicle"><span>Fill in from your inventory (optional)</span><select id="pick-vehicle"><option value="">Choose a vehicle…</option>${vehicles
            .map(
              (v) =>
                `<option value="${v.id}" ${wiz.vehicleId === v.id ? 'selected' : ''}>${esc([v.year, v.make, v.model, v.trim].filter(Boolean).join(' '))}${v.stock_number ? ` · #${esc(v.stock_number)}` : ''}</option>`,
            )
            .join('')}</select></label>`
        : ''
    }
    <div class="form-grid compact">${o.fields.map(fieldHtml).join('')}</div>
    <div class="field full"><span class="small muted">Photos <span class="muted">(posts with photos get far more attention; Instagram needs one)</span></span>
      <div class="photo-grid" id="photo-grid"></div>
      <div class="row">
        <label class="btn" for="photo-input">📷 Add photos</label>
        <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp,image/*" multiple hidden>
        <span class="small muted" id="photo-status"></span>
      </div>
    </div>
    <div class="form-error" id="details-error"></div>
    <div class="action-bar"><button class="primary big" id="generate" type="submit">✨ Create my post</button></div>
  </form>`;

  const form = $('#details-form');
  const readForm = () => {
    for (const key of o.fields) wiz.details[key] = $(`#f-${key}`, form).value.trim();
  };
  const drawPhotos = () => {
    $('#photo-grid').innerHTML = wiz.photos
      .map(
        (url, i) =>
          `<div class="photo"><img src="${esc(url)}" alt="Photo ${i + 1}">${i === 0 ? '<span class="badge info">Cover</span>' : ''}<button type="button" class="photo-x" data-remove="${i}" aria-label="Remove photo">✕</button></div>`,
      )
      .join('');
  };
  drawPhotos();

  $('#back').onclick = () => {
    readForm();
    goTo('objective');
  };
  const pick = $('#pick-vehicle');
  if (pick)
    pick.onchange = () => {
      const v = vehicles.find((x) => x.id === Number(pick.value));
      wiz.vehicleId = v ? v.id : null;
      if (!v) return;
      for (const key of o.fields) {
        const val = v[key];
        if (val != null && val !== '' && $(`#f-${key}`, form)) $(`#f-${key}`, form).value = key === 'price' && val ? `$${Number(val).toLocaleString()}` : val;
      }
      for (const url of v.photos || []) if (!wiz.photos.includes(url)) wiz.photos.push(url);
      drawPhotos();
    };
  $('#photo-grid').onclick = (e) => {
    const b = e.target.closest('[data-remove]');
    if (!b) return;
    wiz.photos.splice(Number(b.dataset.remove), 1);
    drawPhotos();
  };
  $('#photo-input').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    const status = $('#photo-status');
    let done = 0;
    for (const file of files) {
      status.textContent = `Uploading ${done + 1} of ${files.length}…`;
      try {
        wiz.photos.push(await uploadPhoto(file));
        drawPhotos();
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error');
      }
      done++;
    }
    status.textContent = '';
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    readForm();
    const missing = required.filter((k) => !wiz.details[k]).map((k) => o.labels?.[k] || state.meta.fields[k].label);
    if (missing.length) {
      $('#details-error').textContent = `Please add: ${missing.join(', ')}`;
      $(`#f-${required.find((k) => !wiz.details[k])}`, form)?.focus();
      return;
    }
    await generate($('#generate'));
  };
}

async function generate(btn) {
  const label = btn?.textContent;
  // Nothing else can be pressed while the post is being written.
  const locked = [...view.querySelectorAll('.action-bar button, #back, #again')].filter((b) => !b.disabled);
  locked.forEach((b) => (b.disabled = true));
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✨ Writing your post…';
  }
  const previous = wiz.posts;
  try {
    const accounts = await api('GET', '/accounts');
    const extra = liveAccounts(accounts)
      .map((a) => a.platform)
      .filter((p) => !CORE_PLATFORMS.includes(p));
    const platforms = [...CORE_PLATFORMS, ...new Set(extra)];
    const r = await api('POST', '/generate', {
      post_type: wiz.objective,
      details: wiz.details,
      media: wiz.photos,
      vehicle_id: wiz.vehicleId || undefined,
      platforms,
    });
    // The new version replaces the drafts from the previous attempt (only once it exists).
    for (const p of previous) if (p.status === 'draft') await api('DELETE', `/posts/${p.id}`).catch(() => {});
    wiz.posts = r.posts;
    wiz.include = Object.fromEntries(r.posts.map((p) => [p.id, !(p.platform === 'instagram' && !p.media.length)]));
    goTo('review');
  } catch (err) {
    locked.forEach((b) => (b.disabled = false));
    toast(err.message, 'error', err.status === 402 ? { href: '#/billing', label: 'See plans' } : null);
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}

async function renderReview() {
  const accounts = await api('GET', '/accounts');
  const live = new Set(liveAccounts(accounts).map((a) => a.platform));
  const manager = isManager();
  const cards = wiz.posts
    .map((p) => {
      const rules = state.meta.platforms[p.platform];
      const connected = live.has(p.platform);
      const needsPhoto = rules.requiresMedia && !p.media.length;
      return `<article class="variant ${wiz.include[p.id] ? '' : 'off'}" data-post="${p.id}">
        <header class="variant-head">
          <label class="variant-toggle"><input type="checkbox" data-include="${p.id}" ${wiz.include[p.id] ? 'checked' : ''} ${needsPhoto ? 'disabled' : ''}> <strong>${pIcon(p.platform)} ${esc(rules.label)}</strong></label>
          <span class="badge ${connected ? 'good' : ''}">${connected ? 'Connected' : 'Copy & post yourself'}</span>
        </header>
        ${needsPhoto ? `<div class="small" style="color:var(--warn)">${esc(rules.label)} needs a photo. Go back and add one to post here.</div>` : ''}
        ${p.media[0] ? `<img class="variant-photo" src="${esc(p.media[0])}" alt="">` : ''}
        <textarea class="variant-text" data-content="${p.id}" aria-label="${esc(rules.label)} post text">${esc(p.content)}</textarea>
        <input class="variant-tags" data-tags="${p.id}" value="${esc(p.hashtags.join(' '))}" aria-label="Hashtags" placeholder="#hashtags">
        <div class="char-count" data-count="${p.id}"></div>
      </article>`;
    })
    .join('');
  view.innerHTML = `<div class="create">
    ${stepper(3)}
    <div class="row"><button class="small" id="back">← Change details</button><span class="spacer"></span><button class="small" id="again">↻ Try another version</button></div>
    <h2 class="create-h">Here’s your post. Edit anything, then choose where it goes.</h2>
    <div class="variants">${cards}</div>
    <div class="schedule-row" id="schedule-row" hidden>
      <label class="field" for="when"><span>Post on</span><input type="datetime-local" id="when" value="${toLocalInput(new Date(Date.now() + 3600_000).toISOString())}"></label>
      <button class="primary" id="confirm-schedule">Schedule</button>
    </div>
    <div class="action-bar">
      ${
        manager
          ? `<button class="primary big" id="publish"></button><button id="schedule">🕒 Schedule</button>`
          : `<button class="primary big" id="submit">Send to my manager for approval</button>`
      }
      <button id="save-draft">Save draft</button>
    </div>
  </div>`;

  const counter = (id) => {
    const p = wiz.posts.find((x) => x.id === id);
    const max = state.meta.platforms[p.platform].maxChars;
    const text = composeClient({ content: $(`[data-content="${id}"]`).value, hashtags: $(`[data-tags="${id}"]`).value.split(/\s+/).filter(Boolean) });
    const el = $(`[data-count="${id}"]`);
    el.textContent = `${text.length.toLocaleString()} / ${max.toLocaleString()} characters`;
    el.classList.toggle('over', text.length > max);
  };
  const selected = () => wiz.posts.filter((p) => wiz.include[p.id]);
  const refreshButtons = () => {
    const connectedCount = selected().filter((p) => live.has(p.platform)).length;
    const pub = $('#publish');
    if (pub)
      pub.textContent = connectedCount ? `Publish now (${connectedCount} account${connectedCount === 1 ? '' : 's'})` : 'Done: get my posts ready to copy';
    const sch = $('#schedule');
    if (sch) {
      sch.disabled = !connectedCount;
      sch.title = connectedCount ? '' : 'Connect an account in Settings to schedule posts';
    }
    for (const id of ['publish', 'submit', 'save-draft']) if ($(`#${id}`)) $(`#${id}`).disabled = !selected().length;
  };
  for (const p of wiz.posts) counter(p.id);
  refreshButtons();

  // Keep edits in memory as the manager types, so going back and forth never loses them.
  view.oninput = (e) => {
    const id = Number(e.target.dataset.content || e.target.dataset.tags);
    if (!id) return;
    const p = wiz.posts.find((x) => x.id === id);
    if (e.target.dataset.content) p.content = e.target.value;
    else
      p.hashtags = e.target.value
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => (t.startsWith('#') ? t : `#${t}`));
    counter(id);
  };
  view.onchange = (e) => {
    const id = Number(e.target.dataset.include);
    if (!id) return;
    wiz.include[id] = e.target.checked;
    e.target.closest('.variant').classList.toggle('off', !e.target.checked);
    refreshButtons();
  };
  $('#back').onclick = () => goTo('details');
  $('#again').onclick = (e) => generate(e.target);

  const run = async (btn, mode, when) => {
    btn.disabled = true;
    try {
      wiz.results = await finish(mode, live, when);
      goTo('done');
    } catch (err) {
      toast(err.message, 'error', err.status === 402 ? { href: '#/billing', label: 'See plans' } : null);
      btn.disabled = false;
    }
  };
  if ($('#publish')) $('#publish').onclick = (e) => run(e.target, 'publish');
  if ($('#submit')) $('#submit').onclick = (e) => run(e.target, 'submit');
  $('#save-draft').onclick = (e) => run(e.target, 'draft');
  if ($('#schedule'))
    $('#schedule').onclick = () => {
      $('#schedule-row').hidden = false;
      $('#schedule-row').scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('#when').focus();
    };
  if ($('#confirm-schedule'))
    $('#confirm-schedule').onclick = (e) => {
      const when = fromLocalInput($('#when').value);
      if (!when || new Date(when) < Date.now() - 60_000) return toast('Pick a time in the future', 'error');
      run(e.target, 'schedule', when);
    };
}

/** Save edits, drop unticked platforms, then publish / schedule / submit / keep as draft. */
async function finish(mode, live, when) {
  const results = [];
  for (const p of wiz.posts) {
    if (!wiz.include[p.id]) {
      await api('DELETE', `/posts/${p.id}`).catch(() => {});
      continue;
    }
    let post = await api('PATCH', `/posts/${p.id}`, { content: p.content, hashtags: p.hashtags });
    const connected = live.has(p.platform);
    let outcome = 'draft';
    if (mode === 'submit') {
      post = await api('POST', `/posts/${p.id}/submit`);
      outcome = 'submitted';
    } else if (connected && mode === 'publish') {
      post = await api('POST', `/posts/${p.id}/publish`);
      outcome = post.status === 'published' ? 'published' : 'failed';
    } else if (connected && mode === 'schedule') {
      post = await api('POST', `/posts/${p.id}/schedule`, { scheduled_at: when });
      outcome = 'scheduled';
    } else if (!connected && mode !== 'draft') {
      outcome = 'manual';
    }
    results.push({ post, outcome });
  }
  wiz.posts = [];
  refreshBadges();
  return results;
}

function renderDone() {
  const r = wiz.results || [];
  const line = ({ post, outcome }) => {
    const label = `${pIcon(post.platform)} ${esc(platformLabel(post.platform))}`;
    if (outcome === 'published')
      return `<li>✅ Posted to ${label}${post.external_url ? ` · <a href="${esc(post.external_url)}" target="_blank" rel="noopener">View post ↗</a>` : ''}</li>`;
    if (outcome === 'failed')
      return `<li>⚠️ ${label} didn’t go through: ${esc(post.error || 'unknown error')} <button class="small" data-edit="${post.id}">Fix &amp; retry</button></li>`;
    if (outcome === 'scheduled') return `<li>🕒 ${label} scheduled for ${fmtDate(post.scheduled_at)}</li>`;
    if (outcome === 'submitted') return `<li>📨 ${label} sent to your manager for approval</li>`;
    if (outcome === 'draft') return `<li>💾 ${label} saved as a draft in My Posts</li>`;
    return '';
  };
  const manual = r.filter((x) => x.outcome === 'manual');
  const canShare = !!navigator.canShare;
  view.innerHTML = `<div class="create">
    <h2 class="create-q">${manual.length && manual.length === r.length ? 'Your post is ready to share 🎉' : 'Done! 🎉'}</h2>
    ${r.some((x) => x.outcome !== 'manual') ? `<ul class="result-list">${r.map(line).join('')}</ul>` : ''}
    ${
      manual.length
        ? `<div class="stack"><p class="muted">These accounts aren’t connected, so copy each post and paste it into the app. <a href="#/settings">Connect them</a> to publish in one tap next time.</p>
        ${manual
          .map(
            ({ post }) => `<div class="card manual" data-post="${post.id}">
          <div class="card-head"><h3>${pIcon(post.platform)} ${esc(platformLabel(post.platform))}</h3><span class="badge" data-state="${post.id}">Not posted yet</span></div>
          ${post.media[0] ? `<img class="variant-photo" src="${esc(post.media[0])}" alt="">` : ''}
          <textarea class="variant-text" readonly>${esc(composeClient(post))}</textarea>
          <div class="row">
            <button class="primary" data-copy="${post.id}">📋 Copy text</button>
            ${canShare ? `<button data-share="${post.id}">📤 Share…</button>` : ''}
            ${post.media[0] ? `<a class="btn" href="${esc(post.media[0])}" download>⬇ Save photo</a>` : ''}
            <a class="btn" href="${PLATFORM_HOME[post.platform]}" target="_blank" rel="noopener">Open ${esc(platformLabel(post.platform))} ↗</a>
            <button data-posted="${post.id}">✔ I posted it</button>
          </div></div>`,
          )
          .join('')}</div>`
        : ''
    }
    <div class="action-bar static"><button class="primary big" id="another">✍️ Create another post</button><a class="btn" href="#/posts">My Posts</a></div>
  </div>`;
  const find = (id) => manual.find((x) => x.post.id === Number(id))?.post;
  view.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'another') {
      wiz = freshWizard();
      return goTo('condition');
    }
    if (b.dataset.edit) return openPostEditor(Number(b.dataset.edit), () => {});
    if (b.dataset.copy) {
      const text = composeClient(find(b.dataset.copy));
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied. Paste it into the app.');
      } catch {
        const ta = b.closest('.card').querySelector('textarea');
        ta.focus();
        ta.select();
        toast('Text selected. Press copy on your keyboard.');
      }
    }
    if (b.dataset.share) {
      const post = find(b.dataset.share);
      try {
        const data = { text: composeClient(post) };
        if (post.media[0]) {
          const blob = await (await fetch(post.media[0])).blob();
          const file = new File([blob], 'vehicle.jpg', { type: blob.type || 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) data.files = [file];
        }
        await navigator.share(data);
      } catch (err) {
        if (err.name !== 'AbortError') toast('Sharing isn’t available here. Use Copy text instead.', 'error');
      }
    }
    if (b.dataset.posted) {
      await act(b, () => api('POST', `/posts/${b.dataset.posted}/mark-posted`), 'Marked as posted');
      const badge = $(`[data-state="${b.dataset.posted}"]`);
      if (badge) {
        badge.textContent = 'Posted';
        badge.classList.add('good');
      }
      b.disabled = true;
    }
  };
}

// ---------- shell & router ----------
const TITLES = {
  create: 'Create Post',
  dashboard: 'Overview',
  assistant: 'AI Assistant',
  studio: 'Other Posts',
  approvals: 'Approvals',
  calendar: 'Content Calendar',
  posts: 'My Posts',
  inbox: 'Inbox',
  inventory: 'Inventory',
  autopilot: 'Autopilot',
  analytics: 'Analytics',
  settings: 'Accounts & Settings',
  team: 'Team',
  billing: 'Plan & Billing',
};

function renderBanner() {
  const d = state.me?.dealership;
  if (!d) return ($('#banner-root').innerHTML = '');
  const e = d.entitlements;
  let html = '';
  if (!e.active) html = `<div class="banner bad">⛔ ${esc(e.reason)} <a class="btn small" href="#/billing">Choose a plan</a></div>`;
  else if (d.subscription_status === 'past_due')
    html = `<div class="banner bad">⚠️ ${esc(e.reason)} <a class="btn small" href="#/billing">Update card</a></div>`;
  else if (d.subscription_status === 'trialing' && d.trial_ends_at) {
    const days = Math.max(0, Math.ceil((new Date(d.trial_ends_at) - Date.now()) / 86_400_000));
    html = `<div class="banner info">🎁 Free trial of ${esc(e.planName)}: ${days} day${days === 1 ? '' : 's'} left. <a class="btn small" href="#/billing">Choose a plan</a></div>`;
  }
  $('#banner-root').innerHTML = html;
}

function renderUserBox() {
  const me = state.me;
  const options = me.dealerships.map((d) => `<option value="${d.id}" ${d.id === me.dealership?.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
  $('#user-box').innerHTML = `
    ${me.dealerships.length > 1 || me.user.is_superadmin ? `<select id="dealer-switch">${options}${me.dealership && !me.dealerships.some((d) => d.id === me.dealership.id) ? `<option selected>${esc(me.dealership.name)} (support)</option>` : ''}</select>` : ''}
    <div class="clip">${esc(me.user.name || me.user.email)} · <span class="muted">${esc(me.role || '')}</span></div>
    <div class="row" style="gap:6px"><button class="small" id="add-rooftop">+ Rooftop</button>${me.user.is_superadmin ? '<a class="btn small" href="/admin">Admin</a>' : ''}<button class="small" id="logout">Log out</button></div>`;
  const sw = $('#dealer-switch');
  if (sw)
    sw.onchange = () =>
      fetch('/api/me/switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
        body: JSON.stringify({ dealership_id: Number(sw.value) }),
      }).then(() => ((location.hash = '#/dashboard'), location.reload()));
  $('#logout').onclick = () => fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }).then(() => (location.href = '/login'));
  $('#add-rooftop').onclick = () => {
    const { el, close } = openModal(
      'Add another dealership (rooftop)',
      `<form class="stack" id="rooftop-form"><p class="small muted">Each rooftop has its own inventory, accounts, team and subscription. It starts with a free trial.</p>
      <label class="field"><span>Dealership name</span><input name="name" required></label><div class="row"><span class="spacer"></span><button class="primary">Create</button></div></form>`,
    );
    $('#rooftop-form', el).onsubmit = (e) => {
      e.preventDefault();
      act(e.submitter, () =>
        fetch('/api/me/dealerships', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
          body: JSON.stringify({ name: new FormData(e.target).get('name'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error);
          close();
          location.hash = '#/settings';
          location.reload();
        }),
      );
    };
  };
}

async function loadShell() {
  const meRes = await fetch('/api/me');
  if (meRes.status === 401) return (location.href = '/login');
  state.me = await meRes.json();
  if (!state.me.dealership) {
    view.innerHTML = `<div class="card stack" style="max-width:520px"><h2>You’re not part of a dealership yet</h2><p class="muted">Ask your manager for an invite, or create your own dealership.</p><div class="row"><button class="primary" id="add-rooftop">Create a dealership</button><button id="logout">Log out</button></div></div>`;
    renderUserBox();
    throw new Error('no dealership');
  }
  const [meta, dealer] = await Promise.all([api('GET', '/meta'), api('GET', '/dealership')]);
  state.meta = meta;
  state.dealership = dealer;
  renderUserBox();
  renderBanner();
  $('#dealer-name').textContent = dealer.name;
  // Only the platform owner needs to know how AI is configured.
  $('#ai-status').hidden = meta.ai_enabled || !state.me.user.is_superadmin;
  $('#ai-status').innerHTML = 'AI writing is off: posts use built-in templates. Set ANTHROPIC_API_KEY on the server to turn it on.';
  $('#mode-badge').innerHTML = dealer.autonomy === 'autopilot' ? '<a href="#/autopilot" class="badge good">🚀 Autopilot on</a>' : '';
}

async function route() {
  let name = (location.hash.replace(/^#\//, '').split('?')[0] || 'create').trim();
  if (!views[name]) name = 'create';
  const render = views[name];
  $$('#nav a, #tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  if ($('#nav-more a.active')) $('#nav-more').open = true;
  $('#view-title').textContent = TITLES[name] || 'Create Post';
  $('#sidebar').classList.remove('open');
  view.onclick = null;
  view.onchange = null;
  view.oninput = null;
  try {
    await render();
  } catch (err) {
    view.innerHTML = `<div class="empty">⚠️ ${esc(err.message)}</div>`;
  }
  refreshBadges();
}

$('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
$('#tab-more').onclick = () => {
  $('#sidebar').classList.toggle('open');
  $('#nav-more').open = true;
};
// Tapping "Create" while already on it starts a fresh post.
$('#tabbar a[data-view="create"]').addEventListener('click', () => {
  if (location.hash.startsWith('#/create')) {
    wiz = freshWizard();
    route();
  }
});
window.addEventListener('hashchange', route);
loadShell()
  .then(route)
  .catch((err) => err.message !== 'no dealership' && (view.innerHTML = `<div class="empty">Could not reach the server: ${esc(err.message)}</div>`));
setInterval(refreshBadges, 60_000);
