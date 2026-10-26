import { askJevBatch } from "./api.js";

/**
 * Toolbar icon click.
 *
 * On supported sites the content script is injected automatically by the
 * manifest, so this only re-injects on other sites and then asks the already
 * running instance to show its panel. The content script guards against
 * duplicate instances, so a second injection is harmless.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/content.js"]
    });
  } catch {
    // Restricted pages (about:, chrome:, add-on store) cannot be scripted.
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "showToolbar" });
  } catch {
    // No content script on this page.
  }
});

/**
 * Classify ads on behalf of the content script.
 *
 * Errors are returned as short machine codes ("NO_API_KEY", "HTTP_413", ...)
 * so the content script can translate them with chrome.i18n.
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action !== "filterContent") return undefined;

  (async () => {
    try {
      const { jevApiKey } = await chrome.storage.local.get("jevApiKey");
      const apiKey = (jevApiKey || "").trim();
      if (!apiKey) throw new Error("NO_API_KEY");

      const texts = Array.isArray(request.content) ? request.content : [];
      if (texts.length === 0) {
        sendResponse({ probabilities: [] });
        return;
      }

      const probabilities = await askJevBatch(apiKey, request.criteria, texts);
      sendResponse({ probabilities });
    } catch (error) {
      const code = error?.name === "TimeoutError" ? "TIMEOUT" : error?.message || "UNKNOWN";
      sendResponse({ error: code });
    }
  })();

  return true; // keep the message channel open for the async response
});
