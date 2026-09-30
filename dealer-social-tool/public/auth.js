// Login, signup, password reset and invite acceptance.
const view = document.getElementById('auth-view');
const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function post(path, body) {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function form(html, onSubmit) {
  view.innerHTML = html;
  const f = view.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    const err = f.querySelector('.form-error');
    err.textContent = '';
    btn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(f)));
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
}

const field = (name, label, type = 'text', extra = '') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" ${extra} required></label>`;

const pages = {
  '/login': () =>
    form(
      `<h1>Welcome back</h1>
      <form class="stack">
        ${field('email', 'Email', 'email', 'autocomplete="email" autofocus')}
        ${field('password', 'Password', 'password', 'autocomplete="current-password"')}
        <div class="form-error"></div>
        <button class="primary" type="submit">Log in</button>
      </form>
      <p class="small"><a href="/forgot">Forgot your password?</a> · New here? <a href="/signup">Start a free trial</a></p>`,
      async (d) => {
        await post('login', d);
        location.href = params.get('next') || '/app';
      },
    ),

  '/signup': () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    form(
      `<h1>Start your free trial</h1>
      <p class="muted">14 days of Pro, no credit card. Your AI social media manager is ready in minutes.</p>
      <form class="stack">
        ${field('dealership_name', 'Dealership name', 'text', 'placeholder="Riverside Motors" autofocus')}
        ${field('name', 'Your name', 'text', 'autocomplete="name"')}
        ${field('email', 'Work email', 'email', 'autocomplete="email"')}
        ${field('password', 'Password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8"')}
        <input type="hidden" name="timezone" value="${esc(tz)}">
        <div class="form-error"></div>
        <button class="primary" type="submit">Create my account</button>
        <p class="small muted">By signing up you agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>.</p>
      </form>
      <p class="small">Already have an account? <a href="/login">Log in</a></p>`,
      async (d) => {
        await post('signup', d);
        const plan = params.get('plan');
        location.href = plan ? `/app#/billing?plan=${encodeURIComponent(plan)}&interval=${encodeURIComponent(params.get('interval') || 'month')}` : '/app#/dashboard';
      },
    );
  },

  '/forgot': () =>
    form(
      `<h1>Reset your password</h1>
      <form class="stack">
        ${field('email', 'Email', 'email', 'autofocus')}
        <div class="form-error"></div>
        <button class="primary" type="submit">Email me a reset link</button>
      </form>
      <p class="small"><a href="/login">Back to log in</a></p>`,
      async (d) => {
        const r = await post('forgot', d);
        view.innerHTML = `<h1>Check your email</h1><p>${esc(r.message)}</p><p><a href="/login">Back to log in</a></p>`;
      },
    ),

  '/reset': () =>
    form(
      `<h1>Choose a new password</h1>
      <form class="stack">
        ${field('password', 'New password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8" autofocus')}
        <div class="form-error"></div>
        <button class="primary" type="submit">Save and log in</button>
      </form>`,
      async (d) => {
        await post('reset', { token: params.get('token'), password: d.password });
        location.href = '/app';
      },
    ),

  '/invite': async () => {
    const token = params.get('token');
    const res = await fetch(`/api/auth/invite/${encodeURIComponent(token || '')}`);
    const info = await res.json();
    if (!res.ok) {
      view.innerHTML = `<h1>Invite not valid</h1><p>${esc(info.error)}</p><p><a href="/login">Log in</a></p>`;
      return;
    }
    const accept = async (d) => {
      await post(`invite/${encodeURIComponent(token)}/accept`, d);
      location.href = '/app';
    };
    if (info.logged_in_as && info.logged_in_as.toLowerCase() === info.email.toLowerCase()) {
      return form(
        `<h1>Join ${esc(info.dealership_name)}</h1><p>You'll join as <strong>${esc(info.role)}</strong>.</p>
        <form class="stack"><div class="form-error"></div><button class="primary" type="submit">Accept invite</button></form>`,
        accept,
      );
    }
    form(
      `<h1>Join ${esc(info.dealership_name)}</h1>
      <p class="muted">You've been invited as <strong>${esc(info.role)}</strong> (${esc(info.email)}).</p>
      <form class="stack">
        ${info.existing_user ? '' : field('name', 'Your name')}
        ${field('password', info.existing_user ? 'Your existing password' : 'Choose a password (8+ characters)', 'password', 'minlength="8"')}
        <div class="form-error"></div>
        <button class="primary" type="submit">Accept invite</button>
      </form>`,
      accept,
    );
  },
};

(pages[location.pathname] || pages['/login'])();
