# Jev Content Filter

A browser extension that hides classified ads you don't care about. You write
your criteria in plain language, the extension asks the
[TypeSafe Jev](https://typesafe.ai) System One API about every ad on the page, and
the ads that do not match disappear — collapsed, not just faded out.

> **Status: work in progress.** Usable on Bazoš.cz right now. Interfaces, storage
> keys and selectors may still change before 1.0.

## Features (implemented)

- ✅ Ad filtering on Bazoš.cz / .sk / .pl / .at (`div.inzeraty`)
- ✅ Criteria in Czech or English, evaluated per ad
- ✅ **Two display modes** — *Hide* (`display: none`, no empty gaps) and *Dim*
  (`opacity: .2`), with the active mode highlighted
- ✅ **Green tint** on ads the model evaluated and kept — a visual check that
  filtering actually ran
- ✅ **Survives navigation** — the filter re-applies on pagination, because the
  content script is declared in the manifest
- ✅ **Batched API calls** (10 ads per request) + in-memory decision cache
- ✅ **No retry loops** — ads that failed are marked and never re-requested
- ✅ **Localization** (Czech, English) with tooling to add more
- ✅ API key stored in `storage.local` with a stable extension ID, so it
  survives rebuilds
- ✅ Clear filter restores the page exactly (no leftover inline styles)

## Install

### As a user (temporary add-on)

1. Download or clone this repository.
2. `npm install && npm run build` (generates `_locales/` and `dist/`).
3. Firefox → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
   → select `manifest.json`.
4. Open a Bazoš listing, paste your TypeSafe API key into the panel.

A temporary add-on is removed when Firefox closes. For daily use, install it
permanently (sign it via AMO as *unlisted*, or use Developer Edition with
`xpinstall.signatures.required = false`).

### As a developer

```powershell
npm install
npm run build     # i18n:build + esbuild -> dist/
npm run dev       # esbuild --watch
npm run check     # localization consistency
```

`dist/` is generated and git-ignored; `_locales/` is generated but committed so
the repository can be loaded directly as an unpacked extension.

## Usage

| Element | What it does |
| --- | --- |
| **API key** + Save | Stored locally, sent only as a bearer token to `api.typesafe.ai` |
| **Criteria** | Free text, e.g. `iMac 27" 2019, 5K, min. 16 GB RAM, do 15 000 Kč` |
| **Apply** / Enter | Re-evaluates every ad on the page |
| **Hide / Dim** | Switches how non-matching ads are suppressed |
| **×** | Clears the filter and restores the page (keeps the API key) |
| **Close** | Turns the plugin off for this browser profile and shows a restore button |

Green background = the ad was evaluated and kept. Hidden ads never stay green.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, message protocol, storage
  keys, DOM contract, leak guards, i18n pipeline
- [Roadmap](docs/ROADMAP.md) — planned site adapters, other System One models,
  browser ports, store release, known issues

## Project structure

```
manifest.json          MV3 manifest (content_scripts, i18n placeholders)
src/background.js      toolbar click + message router + API calls
src/api.js             TypeSafe Jev client (batched, 30 s timeout)
src/content.js         panel, filtering pipeline, observer, display modes
locales/<locale>.json  translation source of truth
_locales/<locale>/     generated messages.json (do not edit by hand)
scripts/i18n-*.mjs     localization tooling
docs/                  architecture and roadmap
```

## Localization

```powershell
npm run i18n:add -- de     # scaffold locales/de.json with empty values
npm run i18n:build         # regenerate _locales/*/messages.json
npm run i18n:check         # fail on missing / extra / empty keys
```

Default locale is `cs` (`default_locale` in `manifest.json`). Adding a language
needs no manifest change — Firefox negotiates from `navigator.languages`.

## Naming

The repository uses the working title **Jev Content Filter**. Candidates for a
public release:

| Name | Why |
| --- | --- |
| **AdSieve** | "Sieve" describes exactly what it does; short, brandable, works in CZ |
| **JevLens** | Suggests looking at ads through an AI lens; ties to the Jev API |
| **Síto** | Czech for sieve; very memorable locally, weaker internationally |
| **JevSift** | Verb + product, reads well next to "Jev" |
| **Greenlight** | Ties to the green tint that marks kept ads |

## Credits

- Original project this fork grew from: **jev-extension** (the 1.0.0 tree in this
  workspace). Please keep that attribution when you redistribute.
- AI classification: **TypeSafe Jev** System One API.
- Bundling: [esbuild](https://esbuild.github.io).

## License

[MIT](LICENSE) — use it, fork it, sell it, change it. The only requirement is
keeping the copyright notice, so the original source stays credited.
