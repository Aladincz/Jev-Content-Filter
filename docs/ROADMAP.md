# Roadmap

Ordered by value, not by effort. Effort: **S** ≈ hours, **M** ≈ a day,
**L** ≈ a week or more.

## Next (before 1.0)

| Item | Effort | Notes |
| --- | --- | --- |
| **Activation regime settings** | S | Done in 1.1: the plugin is **off by default**, it is turned on with the toolbar icon, and filtering never starts by itself (the last criteria are only pre-filled). What remains is a settings screen to choose the regime: manual (current), auto-on per domain, or per tab. |
| Options page | M | Move the API key out of the injected panel, add threshold + batch size, list supported sites. `chrome.storage.local` already holds everything needed. |
| Persisted decision cache | S | The cache is in-memory today, so page 2 pays again for identical ads. Move to `storage.session`/`local` with a size cap. |
| Tests + CI | M | Unit tests for pure helpers (`normalizeText`, `cacheKey`, `errorMessage`), one integration test against a saved Bazoš HTML fixture (jsdom), CI running `npm run build` + `npm run i18n:check`. |
| Narrow `host_permissions` | S | `<all_urls>` is only needed because the icon injects on arbitrary sites. Either drop the feature or ask for the permission on demand. |

## Site adapters (any page, any server)

> **Hard requirement (see the developer journal):** every domain gets its own
> module — `src/sites/bazos.js`, `src/sites/ebay.js`, … — holding its selector,
> text extraction and pagination quirks. The core (panel, pipeline, API client,
> i18n) must stay free of any site-specific knowledge. Adding a site is a new
> module plus a registration entry, never a patch of the core.

The ad container is hardcoded (`ADS_SELECTOR = ".inzeraty"`). Replace it with an
adapter registry:

```js
const ADAPTERS = [
  { id: "bazos", matches: /(^|\.)bazos\.(cz|sk|pl|at)$/,
    selector: "div.inzeraty", text: (el) => el.innerText },
  { id: "ebay",  matches: /(^|\.)ebay\./,
    selector: "li.s-item, li.s-card", text: (el) => el.innerText },
  // ...
];
```

| Target | Effort | Notes |
| --- | --- | --- |
| eBay | M | Result cards are re-rendered on scroll; the observer already handles that, but the selector must tolerate multiple card variants (`s-item`, `s-card`, `.srp-results`). |
| Facebook Marketplace | L | Infinite scroll + obfuscated class names. Needs structural matching (role/grid) and an anchor on the item link, not a class. Also login-walled, so testing is manual. |
| Aukro / Sbazar / Vinted | M each | Straightforward list markup; same adapter shape. |
| Adapter fallback | S | When no adapter matches, let the user click an element to define a selector (stored per domain). Turns the extension into a generic tool. |

## Prompt inside the site's own search field

Idea: type the criteria into Bazoš's search box so the server pre-filters.

- **Works** when criteria are short and keyword-like (`imac 27 2019`): fewer pages
  to scan, fewer API calls.
- **Conflicts** with the results: Bazoš's search is full-text AND/OR across title
  and description, so `imac 2019 16GB do 15000` returns almost nothing, while the
  AI filter would have accepted 40 ads. Overwriting the user's own query is also
  rude.
- **Suggested shape**: an explicit *"use as search seed"* button that only
  extracts keywords (never the whole sentence), keeps the original query in
  storage, and clearly shows "search was narrowed by the extension — undo".
  Effort: M. Worth doing only after adapters exist.

## Other System One models

`src/api.js` hardcodes `model: "jev-latest"`. TypeSafe exposes more System One
models (e.g. **Laya**).

- Expose a model selector in the panel/options page, persisted as
  `jevModel`; default stays `jev-latest`.
- Show the model in the status line so results are reproducible.
- Allow a per-model threshold: a cheap model may need a different cut-off than an
  expensive one.
- Effort: S for the plumbing, M including UI + docs per model.

## Browser ports

| Target | Effort | Notes |
| --- | --- | --- |
| Chrome / Edge / Brave | S | Almost ready: `chrome.*` is the same; MV3 needs `background.service_worker` instead of `background.scripts`, and `minimum_chrome_version`. Keep both manifests by generating them from one source. |
| Firefox for Android | S | Should work as-is, but the panel needs a responsive layout (it is a fixed full-width bar today). |
| Safari | L | `xcrun safari-web-extension-converter`, needs an Apple developer account for distribution. |

## Official release

| Item | Effort | Notes |
| --- | --- | --- |
| Icons + screenshots | S | 48/96/128 px icons; 2–3 screenshots for the store listing. |
| Privacy policy page | S | Required by AMO/CWS because of `host_permissions` + a third-party API. State exactly what is sent: ad text + criteria, to `api.typesafe.ai`, nothing else. |
| AMO (unlisted first) | S | Sign the XPI, then iterate; "listed" requires review and a stable ID. |
| Chrome Web Store | M | $5 developer account, review, separate packaging. |
| Versioning + changelog | S | Semantic version; `CHANGELOG.md` generated from the journal. |

## Quality / known issues

- **Threshold is hardcoded** (`0.5` in `applyMode`/`filterPage`). Make it a
  setting; some criteria sets want 0.3, others 0.8.
- **Only `innerText` is analyzed** — price, location and image alt text are
  ignored. A structured extraction (title/price/description per adapter) would
  improve accuracy for numeric criteria.
- **No explanation** of a decision. `noul` returns a probability; showing the
  model's reason would help users refine criteria.
- **No undo per ad** — a hidden ad cannot be revealed individually without
  clearing everything.
- **Badge overlap** — the absolute badge can cover a site's own "TOP" label.
- **No keyboard shortcut** (`commands` API) to toggle the panel or apply.
- **Panel is not responsive** — it is a fixed full-width bar; on narrow windows
  and Firefox for Android it needs wrapping/collapsing rules.
- **Batch size is fixed at 10**; large batches may hit 413 on some plans. Make it
  configurable and halve it automatically on `HTTP_413`.
- **No cancellation** of in-flight requests when navigating away.
- **Panel accessibility**: no `aria-*` attributes, no focus management.
