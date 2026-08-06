// Bridges the popup to whichever provider adapter matches this page.
// Adapters register themselves on window.FlipLogicAdapters (see
// adapters/vauto.js) — this script doesn't know provider-specific details.
// extract() is async (the vAuto adapter may need to open a panel and wait
// for it to render), so the response is sent from inside a promise chain
// and the listener returns true to keep the message channel open for it.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'FL_EXTRACT') return undefined;

  const adapter = window.FlipLogicAdapters && window.FlipLogicAdapters.vauto;
  if (!adapter) {
    sendResponse({ ok: false, reason: 'no_adapter' });
    return undefined;
  }
  if (!adapter.isSupportedPage()) {
    sendResponse({ ok: false, reason: 'unsupported_page' });
    return undefined;
  }

  Promise.resolve(adapter.extract())
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, reason: 'extract_error', message: err.message }));
  return true;
});
