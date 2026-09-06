// vAuto adapter.
//
// isSupportedPage() and every selector below are confirmed against a real
// completed appraisal page. vAuto's entire UI is built from Stencil web
// components nested several levels deep in **open shadow roots** — even
// elements with stable, predictable ids (the Competitive Vehicles button,
// its results table, the Make/Model/Trim selects, condition checkboxes)
// live inside one shadow tree or another, not in the plain document. Plain
// `document.querySelector` can't see past a shadow boundary, so every
// lookup here goes through `deepQuerySelector`, which walks into every
// shadow root it finds until it locates the element.
//
// What's confirmed real:
//   - Make/Model/Trim: native <select> elements with stable ids.
//   - Condition: Black Book's Extra Clean/Clean/Average/Rough checkboxes,
//     which map directly onto FlipLogic's excellent/good/average/rough.
//     Each is an <ids-checkbox> wrapper around a plain <input> nested in
//     its own shadow root — see isChecked() below.
//   - Appraised Value / Reconditioning: vAuto's own formatted-input
//     components, identified by id, read through their own shadow root.
//   - VIN / Year / Mileage / retail range / comparable count: all read
//     from the "Competitive Set" table (opened via
//     #comp-set-vehicles-table-btn), the one place on the page that
//     renders this as plain text rather than nested shadow DOM. The
//     appraised vehicle's own row is marked with a `.highlight` class and
//     a "My Vehicle" chip.
//   - VIN / Year / Mileage fallbacks (findVinFromForm / findYearFromForm /
//     findMileageFromForm): on a real appraisal where the vehicle wasn't
//     among its own comps (no highlighted row at all), all three are
//     still readable straight off the page's own fields — confirmed real
//     against two separate appraisals missing this data. Neither field
//     has an id/name to target directly, so VIN and year are found by
//     scanning every <vauto-appraisal-formatted-input>'s value for one
//     shaped like a VIN or a model year; mileage has no equivalently
//     distinctive value shape (indistinguishable from a price by content
//     alone), so it's found by position instead — the sibling immediately
//     after the VIN field, confirmed consistent across every appraisal
//     seen.

window.FlipLogicAdapters = window.FlipLogicAdapters || {};

// Walks into every open shadow root under `root` until it finds a match.
// Needed because vAuto nests most of its UI inside shadow DOM, which plain
// document.querySelector cannot see past.
function deepQuerySelector(selector, root = document) {
  const found = root.querySelector(selector);
  if (found) return found;
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      const nested = deepQuerySelector(selector, el.shadowRoot);
      if (nested) return nested;
    }
  }
  return null;
}

function deepGetElementById(id, root = document) {
  return deepQuerySelector(`#${id}`, root);
}

function deepQuerySelectorAll(selector, root = document, results = []) {
  results.push(...root.querySelectorAll(selector));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) deepQuerySelectorAll(selector, el.shadowRoot, results);
  }
  return results;
}

// Fallback for when the appraised vehicle isn't marked "My Vehicle" in its
// own Competitive Set (observed on a real appraisal where the vehicle
// simply wasn't among its own comps) — every <vauto-appraisal-formatted-
// input> on the page shares the same generic classes/no id, so instead of
// targeting one by selector, scan all of their live values for one that
// matches a VIN's shape. Confirmed against real markup: the VIN field's
// underlying <input> carries the real VIN as its .value.
function findVinFromForm() {
  const hosts = deepQuerySelectorAll('vauto-appraisal-formatted-input');
  for (const host of hosts) {
    const value = host.shadowRoot?.querySelector('input')?.value;
    if (value && /^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) {
      return value.toUpperCase();
    }
  }
  return null;
}

// Same situation as findVinFromForm() — year is a required backend field,
// but with no "My Vehicle" comp row there's no other source for it. The
// page's own Year field is a plain 4-digit value, same generic
// formatted-input shape as VIN, so it's found the same way: scan every
// instance for a value that's shaped like a model year rather than
// targeting one field by selector.
function findYearFromForm() {
  const currentYear = new Date().getFullYear();
  const hosts = deepQuerySelectorAll('vauto-appraisal-formatted-input');
  for (const host of hosts) {
    const value = host.shadowRoot?.querySelector('input')?.value;
    if (value && /^\d{4}$/.test(value)) {
      const year = Number(value);
      if (year >= 1980 && year <= currentYear + 1) return year;
    }
  }
  return null;
}

// Same no-comp-row situation again, but mileage has no value shape
// distinctive enough to scan for (unlike VIN or a 4-digit year, it'd be
// impossible to tell apart from a price). Confirmed real instead by
// position: on every appraisal page seen, the Odometer field is the very
// next <vauto-appraisal-formatted-input> sibling right after the VIN
// field, inside the same parent element — so once the VIN field is found,
// its next matching sibling is the mileage.
function findMileageFromForm() {
  const hosts = deepQuerySelectorAll('vauto-appraisal-formatted-input');
  for (const host of hosts) {
    const value = host.shadowRoot?.querySelector('input')?.value;
    if (value && /^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) {
      const siblings = Array.from(host.parentElement?.children || []).filter(
        (el) => el.tagName === 'VAUTO-APPRAISAL-FORMATTED-INPUT'
      );
      const mileageHost = siblings[siblings.indexOf(host) + 1];
      return parseKm(mileageHost?.shadowRoot?.querySelector('input')?.value);
    }
  }
  return null;
}

function parseCurrency(text) {
  if (!text) return null;
  const n = Number(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseKm(text) {
  if (!text) return null;
  const n = Number(String(text).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getShadowInputValue(el) {
  const input = el && el.shadowRoot ? el.shadowRoot.querySelector('input') : null;
  return input ? input.value : null;
}

async function ensureCompetitiveSetOpen() {
  let table = deepQuerySelector('.comp-set-table-container');
  if (table) return { table, openedByUs: false };

  const openBtn = deepQuerySelector('#comp-set-vehicles-table-btn');
  if (!openBtn) return { table: null, openedByUs: false };
  openBtn.click();

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    table = deepQuerySelector('.comp-set-table-container');
    if (table) return { table, openedByUs: true };
  }
  return { table: null, openedByUs: false };
}

function closeCompetitiveSetModal(table) {
  const modalRoot = table.closest('[part="modal-viewport"]');
  modalRoot?.querySelector('.modal-close')?.click();
}

async function extractFromCompetitiveSet() {
  const { table, openedByUs } = await ensureCompetitiveSetOpen();
  if (!table) return null;

  const rows = Array.from(table.querySelectorAll('.row-container'));
  let myVehicle = null;
  const prices = [];

  for (const row of rows) {
    const priceText = row.querySelector('[data-column="price"] .number-cell')?.textContent;
    const price = parseCurrency(priceText);
    if (price) prices.push(price);

    if (row.classList.contains('highlight') && row.textContent.includes('My Vehicle')) {
      const attrText = row.querySelector('.attribute')?.textContent || '';
      const vinMatch = attrText.match(/VIN:\s*([A-HJ-NPR-Z0-9]{17})/i);
      const nameText = row.querySelector('.vehicle-name')?.textContent || '';
      const yearMatch = nameText.match(/^(\d{4})/);
      const odoText = row.querySelector('[data-column="odometer"] .number-cell')?.textContent;

      myVehicle = {
        vin: vinMatch ? vinMatch[1].toUpperCase() : null,
        year: yearMatch ? Number(yearMatch[1]) : null,
        mileage: parseKm(odoText),
      };
    }
  }

  if (openedByUs) closeCompetitiveSetModal(table);

  if (prices.length === 0) return { myVehicle, low: null, avg: null, high: null, count: 0 };

  const sorted = [...prices].sort((a, b) => a - b);
  return {
    myVehicle,
    low: sorted[0],
    high: sorted[sorted.length - 1],
    avg: sorted[Math.floor(sorted.length / 2)],
    count: prices.length,
  };
}

const CONDITION_CHECKBOX_MAP = {
  ExtraClean: 'excellent',
  Clean: 'good',
  Average: 'average',
  Rough: 'rough',
};

// The condition checkboxes are <ids-checkbox id="..."> wrapper components —
// found directly by id since the wrapper itself sits in the light DOM, but
// its `.checked` property lives on the plain <input> nested one level
// inside its own shadow root, not on the wrapper. Reading `.checked`
// straight off the wrapper (the original approach) silently reads as
// unchecked no matter what's actually selected, which is why condition
// never came through on live captures despite being visibly set in vAuto.
function isChecked(el) {
  if (!el) return false;
  if (el.checked) return true;
  return !!el.shadowRoot?.querySelector('input')?.checked;
}

function readCondition() {
  for (const [id, mapped] of Object.entries(CONDITION_CHECKBOX_MAP)) {
    if (isChecked(deepGetElementById(id))) return mapped;
  }
  return null;
}

window.FlipLogicAdapters.vauto = {
  id: 'vauto',
  label: 'vAuto',

  isSupportedPage() {
    const isAppraisalPage = /\/Va\/Appraisal\/Default\.aspx/i.test(window.location.pathname);
    const isCompleted = new URLSearchParams(window.location.search).get('AppraisalStatus') === 'Completed';
    return isAppraisalPage && isCompleted;
  },

  async extract() {
    const make = deepQuerySelector('#trim-detail-Make-select-list')?.value || null;
    const model = deepQuerySelector('#trim-detail-Model-select-list')?.value || null;
    const trim = deepQuerySelector('#series-select-list')?.value || null;
    const condition = readCondition();

    const appraisalToolValue = parseCurrency(getShadowInputValue(deepQuerySelector('#appraised-value-input')));
    const estimatedReconCost = parseCurrency(
      getShadowInputValue(deepQuerySelector('#pt-qa-costs-step-field-reconditioning'))
    );

    const comps = await extractFromCompetitiveSet();
    const vin = comps?.myVehicle?.vin || findVinFromForm();

    if (!comps || !vin || comps.low == null) {
      return {
        ok: false,
        reason: 'incomplete',
        message:
          "Could not read the Competitive Set — open the \"Competitive Vehicles\" panel on this appraisal and try again.",
      };
    }

    return {
      ok: true,
      payload: {
        vin,
        year: comps.myVehicle?.year ?? findYearFromForm(),
        make,
        model,
        trim,
        mileage: comps.myVehicle?.mileage ?? findMileageFromForm(),
        condition,
        appraisalToolValue,
        lowRetail: comps.low,
        avgRetail: comps.avg,
        highRetail: comps.high,
        comparableCount: comps.count,
        estimatedReconCost,
      },
    };
  },
};
