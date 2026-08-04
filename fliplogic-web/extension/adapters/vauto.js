// vAuto adapter — UNVERIFIED PLACEHOLDER.
//
// This has not been tested against a real vAuto page. It exists so the
// rest of the capture pipeline (popup, background, submission to
// FlipLogic) can be built and demoed end-to-end today, without pretending
// scraping logic works when it's never seen real markup — the same reason
// the AutoTrader comps scraper needed real DevTools screenshots before its
// selectors were written, not guesses.
//
// To finish this: grab a completed appraisal in vAuto, open DevTools,
// and either "Copy outerHTML" on the appraisal summary panel or screenshot
// it with the element inspector open on the fields below. Then replace
// isSupportedPage() and extract() with the real selectors.
//
// Fields FlipLogic needs out of that panel:
//   VIN, Year, Make, Model, Trim, Mileage, Condition,
//   vAuto's own appraised value, Low/Avg/High retail (or however vAuto
//   labels its retail range), and the comparable count behind it.

window.FlipLogicAdapters = window.FlipLogicAdapters || {};

window.FlipLogicAdapters.vauto = {
  id: 'vauto',
  label: 'vAuto',

  isSupportedPage() {
    // Best-guess URL pattern — unverified. Replace once we know vAuto's
    // real appraisal-summary route.
    return /appraisal|valuation/i.test(window.location.pathname);
  },

  extract() {
    return {
      ok: false,
      reason: 'not_configured',
      message:
        "This vAuto adapter hasn't been wired up to real page markup yet — capture isn't available on this page yet.",
    };
  },
};
