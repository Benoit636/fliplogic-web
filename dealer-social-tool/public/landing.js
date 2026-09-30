const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

document.getElementById('year').textContent = new Date().getFullYear();

let plans = {};
let interval = 'month';

function render() {
  document.getElementById('pricing-cards').innerHTML = Object.entries(plans)
    .map(([key, p]) => {
      const price = interval === 'year' ? Math.round(p.yearly / 12) : p.monthly;
      return `<div class="card l-plan ${p.popular ? 'popular' : ''}">
        ${p.popular ? '<span class="badge info">Most popular</span>' : ''}
        <h3>${esc(p.name)}</h3>
        <p class="muted small">${esc(p.tagline)}</p>
        <div class="l-price">$${price}<span>/mo</span></div>
        <div class="small muted">${interval === 'year' ? `billed $${p.yearly.toLocaleString()} yearly` : 'billed monthly'}</div>
        <ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        <a class="btn ${p.popular ? 'primary' : ''}" href="/signup?plan=${key}&interval=${interval}">Start free trial</a>
      </div>`;
    })
    .join('');
}

document.getElementById('interval-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  interval = b.dataset.interval;
  document.querySelectorAll('#interval-tabs button').forEach((x) => x.classList.toggle('active', x === b));
  render();
});

fetch('/api/public/plans')
  .then((r) => r.json())
  .then((d) => {
    plans = d.plans;
    render();
    if (d.sales_email) document.getElementById('sales-link').href = `mailto:${d.sales_email}`;
  })
  .catch(() => {});
