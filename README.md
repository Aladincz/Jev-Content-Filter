# Jev Content Filter

Firefox (and Chromium-compatible) WebExtension that filters ads on classifieds
pages with [TypeSafe Jev](https://typesafe.ai) AI. You type criteria, the
extension asks the model for every ad whether it matches, and the ads that do not
match are hidden — collapsed, not just faded out.

> **Status: work in progress.** The extension is usable on Bazoš.cz; the site
> selector list, the UI and the test coverage are still evolving.

## What it does

- Reads the ads on the page (`div.inzeraty` on Bazoš), asks the model in
  **batches** whether each one matches your criteria, and hides the ones that do
  not.
- Two display modes: **Hide** (`display: none` — the page closes up, no empty
  holes) and **Dim** (`opacity: .2` for eyeballing the results).
- Keeps working after pagination: the content script is declared in
  `manifest.json`, so it re-attaches on every page load and re-applies the last
  criteria.
- Caches decisions per criteria+text in memory, so re-applying or switching the
  display mode costs no API calls.
- Marks ads that failed as processed, so a broken API key can never turn the
  mutation observer into an infinite request loop.

## Install (development)

```powershell
npm install
npm run build          # generates _locales/ and dist/
```

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** and pick `manifest.json`
3. Open e.g. `https://pc.bazos.cz/?hledat=imac`
4. Paste your TypeSafe API key into the panel, type criteria, press **Apply**

`manifest.json` declares a fixed `browser_specific_settings.gecko.id`
(`jev-content-filter@local`), so the API key you save survives rebuilding and
reloading the extension. A *Remove* + re-add of a temporary add-on still clears
`storage.local` — install the add-on permanently if that bothers you.

## Build

```powershell
npm run build    # one-off
npm run dev      # esbuild --watch (rebuild on save)
npm run check    # localization consistency check
```

`dist/` is generated and git-ignored. `_locales/` is generated too but is
committed, so the repository can be loaded directly as an unpacked extension.

## Project layout

```
manifest.json          MV3 manifest (content_scripts, i18n placeholders)
src/background.js      message router + API calls (no key ever logged)
src/api.js             TypeSafe Jev client (batched, 30 s timeout)
src/content.js         toolbar, filtering, observer, display modes
locales/<locale>.json  source of truth for translations
_locales/<locale>/     generated messages.json (do not edit)
scripts/i18n-*.mjs     localization tooling
```

## Localization

All user-visible strings go through `chrome.i18n` (`t("...")` in
`src/content.js`). Sources are flat JSON files in `locales/`; the
`_locales/<locale>/messages.json` files WebExtensions require are **generated**.

```powershell
# 1. scaffold a new language (copies keys from the default locale, empty values)
npm run i18n:add -- de

# 2. translate locales/de.json, then rebuild and verify
npm run i18n:build
npm run i18n:check
```

`i18n:check` fails when a locale is missing keys, has extra keys or empty
values, and reports values that are still identical to the default locale (fine
for a WIP translation). `npm run build` runs `i18n:build` automatically.

The default locale is `cs` (`default_locale` in `manifest.json`). Adding a
language to `locales/` is enough — no manifest change is needed, Firefox
negotiates from `navigator.languages`.

## Design notes

- **Persistence.** The old build injected the script only on toolbar click, so
  every navigation silently dropped the filter. `content_scripts` fixes that.
  A `globalThis.__jevFilterLoaded` guard makes the extra injection from the
  toolbar icon a no-op that only re-opens the panel.
- **No gaps.** Filtered ads get the `.jev-hide` class (`display: none
  !important`). Inline styles are never touched, so clearing the filter restores
  the page exactly — and Bazoš's `display: flex` on `.inzeraty` is preserved.
- **Cost.** One request per 10 ads instead of one per ad, plus an in-memory
  decision cache.
- **Safety.** Ads that errored are marked `data-jev-state="error"` and never
  retried automatically. The API key is only read from `chrome.storage.local`
  and is never written to the console.

## Known limitations

- `host_permissions` is `<all_urls>` because the toolbar icon can inject the
  panel on arbitrary sites. Narrow it if you only care about Bazoš.
- The ad selector is hardcoded to `.inzeraty`; eBay/Aukro/Sbazar support was
  advertised in older notes but is not implemented here.
- Pages filtered by builds ≤ 1.0.x may still carry inline styles from that
  version; reload the page once.
- The `@opengeni/jev` dependency is kept for the stateful/batch experiments it
  started from; `src/api.js` is the code path actually used.

## License

ISC
