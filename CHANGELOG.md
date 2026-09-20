# Changelog

## 0.6.6

- Fixed HUD sections collapsing to nearly zero height inside resized windows.
- Restored usable full-window vertical scrolling in every mode.

## 0.6.5

- Added a collapsed-by-default condition picker with enable/disable controls and separate active-condition removal buttons.
- Fixed live condition and class-feature resource updates.
- Added consumable class features, including Focus Points, to combat resources when they expose limited uses.
- Added attack bonuses and damage formulas to weapon and spell cards.
- Added character class and level information, including multiclass summaries.
- Added Heroic Inspiration controls to every mode and short/long rest controls to regular mode.
- Made death-save mode manually accessible outside zero HP while keeping death-save rolls gated by character state.
- Moved mode navigation directly below the actor header and added an option to hide manual navigation.
- Strengthened vertical scrolling for the full HUD, skills, tools, condition picker and combat item lists.
- Reviewed the settings surface and retained distinct visibility controls where they affect independent HUD sections.

## 0.6.0

- Reworked responsive grids so controls gain columns instead of stretching excessively in wide windows.
- Added full-window scrolling and independent scrolling for combat item lists.
- Added selectable HUD font sizes and larger, clearer ability controls.
- Moved combat initiative beside the actor name, removed it from regular mode and highlighted unrolled initiative.
- Hid temporary HP and maximum-HP modifiers when their values are zero.
- Added class/custom resource cards and per-section combat visibility settings.
- Grouped spells by level with prepared/all filtering and spell-slot indicators.
- Added best-effort resource costs to action cards.
- Added live active-effect updates and direct condition removal.
- Added consistent navigation among regular, combat and death-save modes.
- Removed redundant mode subtitles below actor names.

## 0.5.0

- Added optional adaptive layout and responsive typography.
- Improved narrow combat layouts for filters, items, statistics and saves.
- Added minimum widths for adaptive and fixed layouts.
- Moved keep-open and window-reset controls into the title-bar menu.
- Added optional combat-card details for spell and weapon range, activation, concentration and rituals.
- Added description buttons for weapons, spells, features and other combat items.
- Made the configurable Foundry keybinding toggle the HUD open and closed.

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
- Added initial combat-interface localization.

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
