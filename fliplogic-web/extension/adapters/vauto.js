// vAuto adapter — page detection confirmed, field extraction still a
// placeholder.
//
// isSupportedPage() below is real: confirmed against an actual completed
// appraisal URL (provision.vauto.app.coxautoinc.com/Va/Appraisal/Default.aspx
// with AppraisalStatus=Completed). That page is behind vAuto's own login,
// so it can't be fetched or inspected remotely — extract() still can't be
// written without seeing the page's actual markup, the same reason the
// AutoTrader comps scraper needed real DevTools screenshots before its
// selectors were written, not guesses.
//
// To finish this: on that completed-appraisal page, open DevTools and
// either "Copy outerHTML" on the appraisal summary panel or screenshot it
// with the element inspector open on the fields below. Then replace
// extract() with the real selectors.
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
    const isAppraisalPage = /\/Va\/Appraisal\/Default\.aspx/i.test(window.location.pathname);
    const isCompleted = new URLSearchParams(window.location.search).get('AppraisalStatus') === 'Completed';
    return isAppraisalPage && isCompleted;
  },

  extract() {
    return {
      ok: false,
      reason: 'not_configured',
      message:
        "This page is recognized as a completed vAuto appraisal, but field extraction hasn't been wired up to the real page markup yet.",
    };
  },
};
