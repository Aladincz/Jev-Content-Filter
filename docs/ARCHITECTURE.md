# Architecture

## Components

```
toolbar icon ──► background.js ──► api.js ──► api.typesafe.ai
                     ▲
                     │ chrome.runtime.sendMessage
                     │
  manifest.content_scripts ──► content.js (per page)
                                  ├─ panel (criteria, key, modes)
                                  ├─ filtering pipeline
                                  └─ MutationObserver
```

| File | Responsibility |
| --- | --- |
| `src/content.js` | Everything the user sees and all DOM work. Reads/writes `storage.local`, decides which ads to ask about, applies the display mode. |
| `src/background.js` | `action.onClicked` (inject on unsupported sites + open the panel) and the `filterContent` message handler. Owns no UI. |
| `src/api.js` | TypeSafe Jev client: builds `questions`, chunks them, reads `answers[id].probability`, 30 s `AbortSignal.timeout`. |

The banner script holds **no** credentials logic: the key never leaves
`background.js` + `storage.local`, and never reaches the page's DOM.

## Message protocol

`content.js` → `background.js`

```jsonc
{ "action": "filterContent",
  "criteria": "iMac 27\" 2019, 16 GB",
  "content": ["ad text 1", "ad text 2"] }        // up to 10 per message
```

`background.js` → `content.js`

```jsonc
{ "probabilities": [0.12, 0.91] }                // 0..1, probability of NOT matching
{ "error": "NO_API_KEY" }                        // short machine code
```

Error codes: `NO_API_KEY`, `UNAUTHORIZED`, `HTTP_<status>`, `TIMEOUT`,
`BAD_RESPONSE`, `UNKNOWN`. `content.js` maps them to localized strings
(`errorMessage()`), so no user-facing text is produced in the background.

`background.js` → `content.js` (toolbar icon): `{ "action": "showToolbar" }`.

## Storage keys (`chrome.storage.local`)

| Key | Type | Meaning |
| --- | --- | --- |
| `jevApiKey` | string | TypeSafe API key |
| `jevCriteria` | string | Last applied criteria (re-applied on every page load) |
| `jevMode` | `"hide"` \| `"opacity"` | Display mode |
| `jevPluginActive` | boolean | `false` = panel hidden, restore button shown |

`manifest.json` declares `browser_specific_settings.gecko.id`, so this storage
survives extension reloads. Removing and re-adding a temporary add-on still
clears it.

## DOM contract

| Name | Kind | Purpose |
| --- | --- | --- |
| `.inzeraty` | selector | One ad container (Bazoš listing) |
| `.jev-hide` | class | `display: none !important` — collapsed, no gap |
| `.jev-dim` | class | `opacity: .2` + `pointer-events: none` |
| `.jev-green` | class | `background: #E8F5E8` — evaluated and kept |
| `.jev-ad` | class | `position: relative` so the badge can be absolute |
| `data-jev-prob` | attribute | Probability that the ad does not match |
| `data-jev-state` | attribute | `done` \| `error` — *has been processed* |
| `#jev-filter-toolbar` | id | The panel |
| `#jev-restore-btn` | id | Shown while the plugin is switched off |

**No inline styles are ever written.** That is why *Clear* restores the page
exactly, and why Bazoš's `display: flex` on `.inzeraty` is never clobbered.

## Filtering pipeline

1. `init()` reads storage, then builds the panel (so the API key input is never
   empty because of a race).
2. `filterPage()` collects `.inzeraty:not([data-jev-state])`.
3. For each ad: normalized text (`\s+` → space, trimmed, 1200 chars).
4. Cache lookup by `criteria + "\u0000" + text`. Hits are free.
5. Misses are sent in one `filterContent` message (≤ 10 ads each).
6. Every ad gets `data-jev-prob` **or** `data-jev-state="error"`.
7. `applyMode()` toggles `jev-hide` / `jev-dim` / `jev-green` and badges.
8. Status line: `Filtered: done/total (errors: n)`.

## Why there is no request loop

Two invariants, both cheap and both essential:

1. **Every processed ad is marked** (`done` or `error`). A failed ad can never be
   picked up again by the observer — that unbounded retry is what burned ~86M
   tokens in the previous build.
2. **At most one pipeline at a time** (`isFiltering`) and **at most one observer**
   (`observer`), with a 500 ms debounce (`observerTimeout`).

The observer also exits immediately when `adsPending().length === 0`, which is
the common case after the first pass, so page mutations stay cheap.

## Re-entry guard

The manifest injects `dist/content.js` on every supported page; the toolbar icon
may inject it again. `globalThis.__jevFilterLoaded` makes the second copy call
`__jevShowToolbar()` and stop — no second observer, interval or panel.

## Localization pipeline

```
locales/cs.json  ──┐
locales/en.json  ──┴─► scripts/i18n-build.mjs ──► _locales/<loc>/messages.json
                                                     ▲
manifest.json: "__MSG_extName__", "__MSG_extDescription__",
               "__MSG_actionTitle__", default_locale: "cs"
```

`src/content.js` uses `t(key)` → `chrome.i18n.getMessage(key)` with a fallback
key so a missing translation degrades to the key name instead of crashing.
`npm run i18n:check` (exit 1 on missing/extra/empty keys) is the CI hook.

## Build

`esbuild --bundle --format=iife --target=firefox115`, two entry points
(`src/background.js`, `src/content.js`) → `dist/`. `prebuild` regenerates
`_locales/` first, so a broken locale fails the build.
