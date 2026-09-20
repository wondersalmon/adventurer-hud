# Changelog

## 0.3.1

- Synchronized the Russian and English localization dictionaries.
- Added HUD settings to the window controls menu.
- Made combat mode manually available outside an active encounter.
- Added temporary HP and maximum HP modifier statistics.
- Replaced combat skills and tools with weapons, spells and action filters.
- Added active condition display and owner-controlled condition removal.

## 0.3.0

- Added actor portrait and identity to every HUD mode.
- Added automatic combat mode with combat statistics and regular-mode fallback.
- Converted all source comments to English.
- Added local validation, linting, tests, release packaging and GitHub Actions workflows.
- Added new Russian localization for the combat interface; English synchronization is intentionally deferred.

## 0.2.0

- Moved persistent HUD state to Foundry user and client settings.
- Added a Token Controls button and a default `Shift+R` keybinding.
- Added automatic actor switching when token selection changes.
- Completed English and Russian localization of the HUD and notifications.
- Added per-user visibility settings for HUD sections.
- Added one-time migration of the previous macro's local storage values.

## 0.1.0

- Added the initial Foundry VTT module scaffold.
- Split the working macro into bootstrap, HUD logic, constants, styles and template files.
- Added an assignable keybinding and a public `open()` API.
