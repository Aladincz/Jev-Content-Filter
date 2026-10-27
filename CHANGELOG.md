# Changelog

All notable changes to this fork. Older notes live in
[developer-journal.md](developer-journal.md) and [docs/history](docs/history).

## [Unreleased]

Planned work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md). The two next items
are per-domain site modules and a settings screen for the activation regime.

## [1.1.0] — 2026-10-26

First version of the `jev-extension-fork` tree.

### Added
- Localization infrastructure: `locales/*.json` as the source of truth,
  generated `_locales/<lang>/messages.json`, `npm run i18n:build`,
  `npm run i18n:check`, `npm run i18n:add -- <lang>`. Czech (default) and English.
- Batched API calls (10 ads per request) and an in-memory decision cache.
- Green tint on ads that were evaluated and kept (visual confirmation).
- Dynamic criteria field (auto-growing textarea, Enter applies, Shift+Enter adds
  a new line).
- Documentation: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, MIT `LICENSE`,
  `CHANGELOG.md`; old notes moved to `docs/history/`.

### Changed
- The content script is declared in the manifest, so the panel and the last
  criteria survive page navigation instead of dying with the old document.
- The plugin is **off by default**; it is turned on with the toolbar icon.
  Filtering never starts by itself — the last query usually belongs to another
  section.
- The mode button is a single button that shows the **action** (Hide / Dim) with
  a tooltip describing the effect, instead of a label of the current state.
- Clearing the filter keeps the API key.
- `browser_specific_settings.gecko.id` added, so `storage.local` survives
  rebuilds.

### Fixed
- Ads that failed to classify are marked `data-jev-state="error"`, so the
  mutation observer can no longer start an endless request loop (the leak that
  burned ~86M tokens).
- Duplicate content-script instances are prevented by a `globalThis` guard.
- Inline styles are no longer written, so *Clear* restores the page exactly and
  the site's own `display: flex` on ad containers is preserved.

### Removed
- Dead code: root `background.js` (unused JevClient path), `popup.html` and
  `popup.js` (never referenced by the manifest).
