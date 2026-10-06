// Rebuilds the clickable demo (demo/) from the real app in public/, so the two never drift.
// The demo runs entirely in the browser: demo/mock-api.js answers the /api routes with sample data.
//   node demo/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, s) => {
  fs.mkdirSync(path.dirname(path.join(here, p)), { recursive: true });
  fs.writeFileSync(path.join(here, p), s);
};

function patch(source, replacements, file) {
  let out = source;
  for (const [from, to] of replacements) {
    if (!out.includes(from)) throw new Error(`demo build: "${from.slice(0, 60)}…" not found in ${file}; update demo/build.mjs`);
    out = out.split(from).join(to);
  }
  return out;
}

// --- dashboard app ---
write(
  'app.js',
  patch(
    read('public/app.js'),
    [
      [
        `<a class="btn small" href="/api/export" download>⬇ Export everything (JSON)</a>`,
        `<button class="small" disabled title="Available in the full product">⬇ Export everything (JSON)</button>`,
      ],
      [
        `$('#logout').onclick = () => fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'fetch' } }).then(() => (location.href = '/login'));`,
        `$('#logout').onclick = () => {\n    window.demoReset();\n    location.hash = '#/create';\n    location.reload();\n  };`,
      ],
      ['<button class="small" id="logout">Log out</button>', '<button class="small" id="logout">Reset demo</button>'],
    ],
    'public/app.js',
  ),
);

write(
  'app.html',
  patch(
    read('public/app.html'),
    [
      ['<title>Dealer Social</title>', '<title>Dealer Social — Live demo</title>'],
      ['    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />\n', ''],
      ['<script type="module" src="app.js"></script>', '<script src="mock-api.js" charset="utf-8"></script>\n    <script type="module" src="app.js"></script>'],
      [
        '      <main>\n        <header class="topbar">',
        '      <main>\n        <div class="demo-bar">Live demo with sample data for “Riverside Motors”. Nothing is posted anywhere and AI copy is simulated. Your changes stay in this browser. <a href="index.html">← Product page</a></div>\n        <header class="topbar">',
      ],
    ],
    'public/app.html',
  ),
);

write(
  'styles.css',
  `${read('public/styles.css')}
.demo-bar { background: var(--warn-soft); color: var(--warn); padding: 8px 24px; font-size: 13px; border-bottom: 1px solid var(--border); }
.demo-bar a { color: inherit; font-weight: 600; }
.demo-strip { display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; background: var(--accent); color: #fff; padding: 10px 16px; font-size: 14px; }
.demo-strip a { color: #fff; font-weight: 700; }
`,
);

write('shared/objectives.js', read('src/shared/objectives.js'));

// --- marketing page (artifact pages are wrapped in their own <html>/<body>) ---
const landing = read('public/landing.html');
let body = landing.match(/<body class="landing">([\s\S]*)<\/body>/)[1];
body = body
  .replaceAll('href="/signup"', 'href="app.html"')
  .replaceAll('href="/login"', 'href="app.html"')
  .replace(/<a href="\/(privacy|terms|data-deletion)">[^<]*<\/a>\s*/g, '')
  .replaceAll('href="/"', 'href="index.html"')
  .replace('<script type="module" src="landing.js"></script>', '<script src="mock-api.js" charset="utf-8"></script>\n    <script type="module" src="landing.js"></script>')
  .replace('Start free trial</a>', 'Open the demo</a>');
write(
  'index.html',
  `<title>Dealer Social</title>
<link rel="stylesheet" href="styles.css" />
<div class="landing">
<div class="demo-strip">Interactive demo: the dealer app runs in your browser with sample data. <a href="app.html">Open the dealer app →</a></div>
${body}
</div>
`,
);
write('landing.js', patch(read('public/landing.js'), [['href="/signup?plan=${key}&interval=${interval}"', 'href="app.html"']], 'public/landing.js'));

console.log('Demo rebuilt in', here);
