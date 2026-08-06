// vAuto adapter.
//
// isSupportedPage() and every selector below are confirmed against a real
// captured completed appraisal (a full `$0.shadowRoot.innerHTML` dump of
// <profit-time-guided-appraisal>, vAuto's Angular Elements root component)
// — not guessed. vAuto's UI is built from Stencil web components, several
// with their own nested shadow roots, which is why extraction here reads
// `.shadowRoot` / `.value` / `.checked` directly off live elements instead
// of matching static HTML.
//
// What's confirmed real:
//   - Make/Model/Trim: native <select> elements with stable ids.
//   - Condition: Black Book's Extra Clean/Clean/Average/Rough checkboxes,
//     which map directly onto FlipLogic's excellent/good/average/rough.
//   - Appraised Value / Reconditioning: vAuto's own formatted-input
//     components, identified by id, read through their own shadow root.
//   - VIN / Year / Mileage / retail range / comparable count: all read
//     from the "Competitive Set" table (the modal listing comparable
//     vehicles), which is the one place on the page that renders this as
//     plain text rather than nested shadow DOM. The appraised vehicle's
//     own row is marked with a `.highlight` class and a "My Vehicle" chip.
//
// What's inferred rather than directly observed: the internal shadow-DOM
// shape of <vauto-appraisal-formatted-input> (assumed to be a <label> +
// <input> pair) — reasonable for this component family, but only the two
// fields actually queried here (appraised value, recon cost) have been
// exercised against real markup.

window.FlipLogicAdapters = window.FlipLogicAdapters || {};

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
  let table = document.querySelector('.comp-set-table-container');
  if (table) return { table, openedByUs: false };

  const openBtn = document.querySelector('#comp-set-vehicles-table-btn');
  if (!openBtn) return { table: null, openedByUs: false };
  openBtn.click();

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    table = document.querySelector('.comp-set-table-container');
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

function readCondition() {
  for (const [id, mapped] of Object.entries(CONDITION_CHECKBOX_MAP)) {
    const el = document.getElementById(id);
    if (el?.checked) return mapped;
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
    const make = document.querySelector('#trim-detail-Make-select-list')?.value || null;
    const model = document.querySelector('#trim-detail-Model-select-list')?.value || null;
    const trim = document.querySelector('#series-select-list')?.value || null;
    const condition = readCondition();

    const appraisalToolValue = parseCurrency(getShadowInputValue(document.querySelector('#appraised-value-input')));
    const estimatedReconCost = parseCurrency(
      getShadowInputValue(document.querySelector('#pt-qa-costs-step-field-reconditioning'))
    );

    const comps = await extractFromCompetitiveSet();

    if (!comps || !comps.myVehicle?.vin || comps.low == null) {
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
        vin: comps.myVehicle.vin,
        year: comps.myVehicle.year,
        make,
        model,
        trim,
        mileage: comps.myVehicle.mileage,
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
