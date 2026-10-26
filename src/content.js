// Jev Content Filter - content script.
//
// The manifest loads this automatically on every supported page, so filtering
// survives navigation (pagination) instead of dying with the old document.
// The toolbar icon injects it manually on other sites; a global guard below
// keeps a second injection from creating duplicate observers.

const ADS_SELECTOR = ".inzeraty";
const PROCESSED_ATTR = "data-jev-state"; // "done" | "error"
const CACHE_LIMIT = 2000;
const OBSERVER_DELAY_MS = 500;
const MAX_TEXT_LENGTH = 1200;
const STYLE_ID = "jev-filter-styles";
const CRITERIA_MAX_HEIGHT = 120;

let currentMode = "hide"; // "hide" | "opacity"
let currentCriteria = "";
let savedApiKey = "";
let isPluginActive = true;
let isFiltering = false;

let observer = null;
let observerTimeout = null;
let criteriaInput = null;
let apiKeyInput = null;
let statusLabel = null;
let modeButton = null;

/** criteria+text -> probability, so a re-apply never pays twice. */
const decisionCache = new Map();

function t(key, fallback = "") {
  try {
    return chrome.i18n.getMessage(key) || fallback || key;
  } catch {
    return fallback || key;
  }
}

const STYLE_TEXT = `
.jev-hide { display: none !important; }
.jev-dim { opacity: 0.2 !important; pointer-events: none !important; }
.jev-green { background-color: #E8F5E8 !important; }
.jev-ad { position: relative; }
.jev-badge {
  position: absolute; top: 5px; right: 5px; z-index: 1000;
  background: #111; color: #fff; padding: 2px 5px; border-radius: 3px;
  font: 11px/1.4 sans-serif; opacity: .85;
}
.jev-toolbar {
  position: fixed; top: 0; left: 0; width: 100%; box-sizing: border-box;
  display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  padding: 10px; z-index: 9999999;
  background: #2c3e50; color: #fff; font-family: sans-serif;
  border-bottom: 2px solid #34495e; box-shadow: 0 2px 5px rgba(0,0,0,.3);
}
.jev-input {
  padding: 5px 10px; border: 1px solid #34495e; border-radius: 4px;
  background: #34495e; color: #fff; font-size: 14px;
}
.jev-input::placeholder { color: #bdc3c7; }
.jev-input:focus { outline: none; border-color: #3498db; }
.jev-criteria {
  width: 320px; max-width: 60vw; min-height: 31px;
  line-height: 1.25; resize: none; overflow-y: auto; font-family: inherit;
}
.jev-btn, .jev-mode-btn {
  padding: 5px 10px; border: none; border-radius: 4px;
  background: #3498db; color: #fff; font-size: 14px; cursor: pointer;
}
.jev-btn:hover, .jev-mode-btn:hover { background: #2980b9; }
.jev-close { background: #e74c3c; }
.jev-close:hover { background: #c0392b; }
.jev-group { display: flex; gap: 5px; align-items: center; }
.jev-clear { font-size: 20px; line-height: 1; cursor: pointer; color: #bdc3c7; }
.jev-clear:hover { color: #fff; }
.jev-status { font-size: 12px; color: #bdc3c7; }
.jev-restore {
  position: fixed; bottom: 20px; right: 20px; z-index: 9999999;
  padding: 10px 15px; min-width: 120px; border: none; border-radius: 4px;
  background: #e67e22; color: #fff; font-size: 14px; cursor: pointer;
}
@media print { .jev-hide { display: block !important; } }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  (document.head || document.documentElement).appendChild(style);
}


function setStatus(text) {
  if (statusLabel) statusLabel.textContent = text || "";
}

/** The single mode button always shows the ACTION, never the current state. */
function updateModeButton() {
  if (!modeButton) return;
  const switchToHide = currentMode !== "hide";
  modeButton.textContent = switchToHide ? t("modeHide") : t("modeDim");
  modeButton.title = switchToHide ? t("modeSwitchToHideTitle") : t("modeSwitchToDimTitle");
}

/** Grow the criteria field with its content, up to CRITERIA_MAX_HEIGHT. */
function autosizeCriteria() {
  if (!criteriaInput) return;
  criteriaInput.style.height = "auto";
  criteriaInput.style.height = `${Math.min(criteriaInput.scrollHeight, CRITERIA_MAX_HEIGHT)}px`;
}

function buildToolbar() {
  if (document.getElementById("jev-filter-toolbar") || !document.body) return;
  injectStyles();

  const toolbar = document.createElement("div");
  toolbar.id = "jev-filter-toolbar";
  toolbar.className = "jev-toolbar";

  // --- API key -------------------------------------------------------------
  const keyGroup = document.createElement("div");
  keyGroup.className = "jev-group";

  apiKeyInput = document.createElement("input");
  apiKeyInput.type = "password";
  apiKeyInput.className = "jev-input";
  apiKeyInput.style.width = "180px";
  apiKeyInput.placeholder = t("apiKeyPlaceholder");
  apiKeyInput.value = savedApiKey;

  const saveButton = document.createElement("button");
  saveButton.className = "jev-btn";
  saveButton.textContent = t("apiKeySave");
  saveButton.onclick = () => {
    savedApiKey = apiKeyInput.value.trim();
    chrome.storage.local.set({ jevApiKey: savedApiKey });
    saveButton.textContent = t("apiKeySaved");
    window.setTimeout(() => {
      saveButton.textContent = t("apiKeySave");
    }, 2000);
  };

  keyGroup.append(apiKeyInput, saveButton);

  // --- criteria ------------------------------------------------------------
  const criteriaGroup = document.createElement("div");
  criteriaGroup.className = "jev-group";

  criteriaInput = document.createElement("textarea");
  criteriaInput.rows = 1;
  criteriaInput.className = "jev-input jev-criteria";
  criteriaInput.placeholder = t("criteriaPlaceholder");
  criteriaInput.value = currentCriteria;
  criteriaInput.addEventListener("input", autosizeCriteria);
  criteriaInput.addEventListener("keydown", (event) => {
    // Enter applies; Shift+Enter inserts a line break.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyCriteria();
    }
  });

  const clearButton = document.createElement("span");
  clearButton.className = "jev-clear";
  clearButton.textContent = "\u00d7";
  clearButton.title = t("clearTitle");
  clearButton.onclick = clearFilter;

  criteriaGroup.append(criteriaInput, clearButton);

  // --- mode / apply / close ------------------------------------------------
  modeButton = document.createElement("button");
  modeButton.className = "jev-mode-btn";
  modeButton.onclick = cycleMode;
  updateModeButton();

  const applyButton = document.createElement("button");
  applyButton.className = "jev-btn";
  applyButton.textContent = t("apply");
  applyButton.onclick = applyCriteria;

  const closeButton = document.createElement("button");
  closeButton.className = "jev-btn jev-close";
  closeButton.textContent = t("close");
  closeButton.onclick = () => setActive(false);

  statusLabel = document.createElement("span");
  statusLabel.className = "jev-status";

  toolbar.append(keyGroup, criteriaGroup, modeButton, applyButton, closeButton, statusLabel);
  document.body.prepend(toolbar);
  autosizeCriteria();

  updateStatus();
}

function removeToolbar() {
  const toolbar = document.getElementById("jev-filter-toolbar");
  if (toolbar) toolbar.remove();
  criteriaInput = null;
  apiKeyInput = null;
  statusLabel = null;
  modeButton = null;
}

function showRestoreButton() {
  if (document.getElementById("jev-restore-btn") || !document.body) return;
  injectStyles();
  const button = document.createElement("button");
  button.id = "jev-restore-btn";
  button.className = "jev-restore";
  button.textContent = t("showPanel");
  button.onclick = () => setActive(true);
  document.body.appendChild(button);
}

function removeRestoreButton() {
  const button = document.getElementById("jev-restore-btn");
  if (button) button.remove();
}

/** Turn the whole plugin on/off. The state is persisted, so it also holds on
 *  the next page. Turning it off restores the page to its original look. */
function setActive(active) {
  isPluginActive = active;
  chrome.storage.local.set({ jevPluginActive: active });

  if (active) {
    removeRestoreButton();
    buildToolbar();
    applyMode();
    setupObserver();
    // Deliberately no filterPage(): activating the panel must not re-run the
    // previous query on a page that may be a completely different section.
    setStatus(currentCriteria ? t("statusReady") : "");
    return;
  }

  teardownObserver();
  resetAllAds();
  removeToolbar();
  showRestoreButton();
}

/** Called when the toolbar icon is clicked (or a second script injection
 *  happens): show the panel without creating a second instance. */
function showToolbar() {
  if (!isPluginActive) {
    setActive(true);
    return;
  }
  buildToolbar();
}


// --- criteria / mode -----------------------------------------------------

function applyCriteria() {
  if (!criteriaInput) return;

  currentCriteria = criteriaInput.value.trim();
  savedApiKey = apiKeyInput ? apiKeyInput.value.trim() : savedApiKey;
  chrome.storage.local.set({ jevCriteria: currentCriteria, jevApiKey: savedApiKey });

  resetAllAds();
  decisionCache.clear();

  if (!currentCriteria) {
    setStatus("");
    return;
  }
  filterPage();
}

function clearFilter() {
  // The API key is intentionally kept: clearing the filter must not force the
  // user to paste the key again.
  currentCriteria = "";
  chrome.storage.local.set({ jevCriteria: "" });
  if (criteriaInput) criteriaInput.value = "";
  resetAllAds();
  decisionCache.clear();
  setStatus("");
}

function cycleMode() {
  currentMode = currentMode === "hide" ? "opacity" : "hide";
  chrome.storage.local.set({ jevMode: currentMode });
  updateModeButton();
  applyMode();
}

// --- DOM helpers ---------------------------------------------------------

function adsAll() {
  return Array.from(document.querySelectorAll(ADS_SELECTOR));
}

function adsPending() {
  return Array.from(document.querySelectorAll(`${ADS_SELECTOR}:not([${PROCESSED_ATTR}])`));
}

function normalizeText(element) {
  return (element.innerText || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

function cacheKey(criteria, text) {
  return `${criteria}\u0000${text}`;
}

function remember(criteria, text, probability) {
  if (decisionCache.size >= CACHE_LIMIT) {
    const oldest = decisionCache.keys().next().value;
    decisionCache.delete(oldest);
  }
  decisionCache.set(cacheKey(criteria, text), probability);
}

function ensureBadge(element, probability) {
  element.classList.add("jev-ad");
  let badge = element.querySelector(".jev-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "jev-badge";
    element.appendChild(badge);
  }
  badge.title = t("badgeTitle");
  badge.textContent = `${Math.round(probability * 100)}%`;
}

function removeBadge(element) {
  const badge = element.querySelector(".jev-badge");
  if (badge) badge.remove();
  element.classList.remove("jev-ad");
}

/** Apply the current display mode. Hiding uses display:none (via .jev-hide),
 *  so hidden ads leave no empty gap behind. */
function applyMode() {
  document.querySelectorAll(`${ADS_SELECTOR}[data-jev-prob]`).forEach((element) => {
    const probability = Number.parseFloat(element.dataset.jevProb);
    const shouldHide = probability > 0.5;

    element.classList.toggle("jev-hide", shouldHide && currentMode === "hide");
    element.classList.toggle("jev-dim", shouldHide && currentMode === "opacity");
    // Light green marks the ads the model evaluated and kept - a visual check
    // that the filter really ran. Hidden ads never keep the tint.
    element.classList.toggle("jev-green", !shouldHide);

    if (shouldHide) ensureBadge(element, probability);
    else removeBadge(element);
  });
}

function resetAllAds() {
  adsAll().forEach((element) => {
    element.classList.remove("jev-hide", "jev-dim", "jev-green", "jev-ad");
    element.removeAttribute("data-jev-prob");
    element.removeAttribute(PROCESSED_ATTR);
    removeBadge(element);
  });
}

function updateStatus() {
  const total = adsAll().length;
  if (total === 0) {
    setStatus(t("statusNoAds"));
    return;
  }

  const done = document.querySelectorAll(`${ADS_SELECTOR}[data-jev-prob]`).length;
  const failed = document.querySelectorAll(`${ADS_SELECTOR}[${PROCESSED_ATTR}="error"]`).length;
  const suffix = failed ? ` (${t("statusErrors")}: ${failed})` : "";
  setStatus(`${t("statusDone")}: ${done}/${total}${suffix}`);
}

function errorMessage(code) {
  if (!code) return t("errNetwork");
  if (code === "NO_API_KEY") return t("errNoApiKey");
  if (code === "TIMEOUT" || code === "NetworkError") return t("errNetwork");
  if (code === "BAD_RESPONSE") return t("errApiShape");
  return `${t("errApi")} ${code}`;
}


// --- filtering -----------------------------------------------------------

async function filterPage() {
  if (!currentCriteria || isFiltering) return;

  const ads = adsPending();
  if (ads.length === 0) {
    updateStatus();
    return;
  }

  isFiltering = true;
  setStatus(t("statusFiltering"));

  const texts = ads.map(normalizeText);

  try {
    const probabilities = new Array(ads.length).fill(undefined);
    const missing = [];

    texts.forEach((text, index) => {
      const cached = decisionCache.get(cacheKey(currentCriteria, text));
      if (typeof cached === "number") probabilities[index] = cached;
      else missing.push(index);
    });

    if (missing.length > 0) {
      const response = await chrome.runtime.sendMessage({
        action: "filterContent",
        criteria: currentCriteria,
        content: missing.map((index) => texts[index])
      });

      if (!response || response.error) {
        // Mark everything as processed. Without this, failed ads stay
        // "pending" forever and every DOM mutation starts another request
        // loop - the bug that burned tokens and memory.
        ads.forEach((element) => element.setAttribute(PROCESSED_ATTR, "error"));
        setStatus(errorMessage(response?.error));
        return;
      }

      const fresh = response.probabilities || [];
      missing.forEach((adIndex, order) => {
        const probability = fresh[order];
        if (typeof probability === "number") {
          probabilities[adIndex] = probability;
          remember(currentCriteria, texts[adIndex], probability);
        }
      });
    }

    ads.forEach((element, index) => {
      const probability = probabilities[index];
      if (typeof probability === "number") {
        element.dataset.jevProb = String(probability);
        element.setAttribute(PROCESSED_ATTR, "done");
      } else {
        element.setAttribute(PROCESSED_ATTR, "error");
      }
    });

    applyMode();
    updateStatus();
  } catch {
    ads.forEach((element) => element.setAttribute(PROCESSED_ATTR, "error"));
    setStatus(t("errNetwork"));
  } finally {
    isFiltering = false;
  }
}

// --- observer ------------------------------------------------------------

function setupObserver() {
  if (observer) return;

  observer = new MutationObserver(() => {
    if (observerTimeout || isFiltering || !currentCriteria) return;
    if (adsPending().length === 0) return;

    observerTimeout = window.setTimeout(() => {
      observerTimeout = null;
      filterPage();
    }, OBSERVER_DELAY_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function teardownObserver() {
  if (observerTimeout) {
    window.clearTimeout(observerTimeout);
    observerTimeout = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// --- boot ----------------------------------------------------------------

function init() {
  injectStyles();

  chrome.storage.local.get(
    ["jevApiKey", "jevCriteria", "jevMode", "jevPluginActive"],
    (result) => {
      savedApiKey = result.jevApiKey || "";
      currentCriteria = result.jevCriteria || "";
      currentMode = result.jevMode === "opacity" ? "opacity" : "hide";
      isPluginActive = result.jevPluginActive === true;

      chrome.runtime.onMessage.addListener((request) => {
        if (request?.action === "showToolbar") showToolbar();
      });

      if (!isPluginActive) {
        showRestoreButton();
        return;
      }

      buildToolbar();
      setupObserver();

      // Criteria are only restored into the input. Filtering never starts on
      // its own: the last query usually belongs to a different section.
      setStatus(currentCriteria ? t("statusReady") : "");
    }
  );
}

// Re-entry guard: the manifest injects this script on every supported page and
// the toolbar icon can inject it once more. A second copy must only re-open the
// panel - never create another observer, toolbar or request loop.
if (globalThis.__jevFilterLoaded) {
  globalThis.__jevShowToolbar?.();
} else {
  globalThis.__jevFilterLoaded = true;
  globalThis.__jevShowToolbar = showToolbar;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
}
