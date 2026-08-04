// Bridges the popup to whichever provider adapter matches this page.
// Adapters register themselves on window.FlipLogicAdapters (see
// adapters/vauto.js) — this script doesn't know provider-specific details.
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

  sendResponse(adapter.extract());
  return undefined;
});
