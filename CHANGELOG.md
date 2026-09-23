# Changelog

## 0.12.0

- Added live search across combat actions, spells, and inventory, matching item and activity names while keeping the query across category changes.
- Added an inline chooser for items with multiple usable D&D 5e activities. The selected activity uses the native system workflow; Shift-click continues to use the native item shortcut.
- Added per-user, per-character favorites for items and individual activities, available in exploration and combat modes.
- Restored Additional Settings with separate controls for search, favorites, and the activity chooser; reorganized settings into quick access, item use, window controls, and death saves.
- Allowed items with different activity activation types to appear in each matching combat category.

## 0.11.0

- Moved manual mode navigation into Foundry's main module settings and removed the Additional Settings screen and its template.
- Removed the mode-heading, automatic-combat, and adaptive-layout settings. Mode headings remain visible, combat detection remains automatic, and the HUD always uses the responsive layout.
- Fixed active-effect changes leaving actor statistics stale, resources with matching labels hiding each other, and resource costs missing their fallback label.
- Extracted HUD actions and window lifecycle from the application controller, split combat items and conditions into focused renderers, and removed the unused condition-only refresh path.
- Split HUD styles into ordered dialog, base, combat, shared, death-save, and responsive files.
- Ignored the local maintenance context document in Git.

## 0.10.1

- Disabled the optional Token Controls button by default; it can still be enabled in the module settings.
- Replaced the keep-open preference with an opt-in close-after-roll setting.
- Removed redundant exploration and combat visibility controls; supported sections are now always available when provided by the active system adapter.
- Removed obsolete settings migrations and legacy storage keys ahead of the public release.

## 0.10.0

- Applied visibility and runtime settings to the open HUD without resetting its current view, filters, or expanded sections.
- Coalesced Foundry document updates into one prioritized refresh per frame and centralized hook cleanup.
- Reorganized actor selection, window geometry, title controls, combat resources, and settings refresh behavior into focused modules.
- Replaced duplicated setting lists with one declarative settings schema and expanded escaping for system-adapter data.
- Made localization validation discover every JavaScript source file automatically.

## 0.9.3

- Fixed the dedicated title-bar pin control and added behavioral coverage for its placement, state, and Escape handling.

## 0.9.2

- Added a collapsed-by-default ability-check section to combat mode and moved the pin toggle from the title menu to a dedicated, stateful title-bar button.
- Small fixes

## 0.9.1

- Split the HUD monolith into a focused application controller, shared components, and separate exploration, combat, and death-save renderers.
- Preserved the HUD's attached actor when settings trigger a refresh, escaped custom condition labels, and localized the dialog close action.
- Expanded adapter and renderer regression coverage for system isolation, damage formulas, resources, spell slots, roll delegation, and condition markup.
- Forwarded initiative advantage and disadvantage shortcuts through the D&D adapter without creating combatants.
- Added collapsible exploration checks and combat saves, both expanded by default, improved narrow resource cards, and added an optional Escape-resistant pinned window mode.
- Rebalanced text sizes to Small, Medium, Large, and Extra Large while migrating existing preferences to equivalent visual scales.
- Prevented multiclass summaries from colliding with header controls at narrow widths while retaining the full summary in a tooltip.
- Renamed the user-facing regular mode to Exploration, added a Token Controls visibility setting, and expanded user and adapter documentation.

## 0.9.0

- Added an inventory browser to exploration mode with Equipped, Consumables, and Other filters.
- Added remaining-charge indicators to inventory and combat item cards when an item has limited uses.
- Added an optional inventory visibility setting and English/Russian inventory localization.
- Added D&D 5e adapter coverage for inventory categories and charge data in both 5.3 and 6.x item shapes.
- Added a public system-adapter registry with capability-driven UI and safe defaults for unsupported mechanics.
- Moved D&D-specific data access, rolls, item use, resources, rests, and combat normalization behind the bundled D&D 5e adapter.
- Added contributor documentation and contract tests for implementing future game-system integrations.

## 0.8.7

- Added initiative to the exploration HUD for characters already added to an encounter, including before combat starts.
- Fixed the extra-large text-size option and aligned class-resource shortcut hints with the HUD's other keyboard hints.
- Moved selected-token following into the main settings and shortcut hints into Additional Settings; Additional Settings and Reset Settings now remain at the bottom of the module section.
- Completed the Foundry VTT 14 manifest metadata with the package type, project, documentation, support, license, author, and media links.
- Added regression coverage for exploration-mode initiative, typography, resource hints, settings placement, and release manifest URLs.

## 0.8.6

- Fixed the Foundry V14 settings application and restored common options directly in Module Settings while keeping granular controls under Additional Settings.
- Added a reset-to-defaults control and made selected-token following opt-in.
- Fixed concentration removal, added full resource restoration, and added Shift-click quick resource adjustments.
- Removed the free-form layout editor and replaced its useful visibility controls with explicit settings for mode headings, combat statistics, and active conditions.
- Preserved manual access to death-save mode before death saves become active and expanded regression coverage for settings templates and HUD state.

## 0.8.5

- Extracted version-tolerant D&D 5e actor and item adapters with dedicated 5.3 and 6.x fixtures.
- Replaced three manual-mode flags with one explicit HUD state and centralized mode resolution.
- Centralized layout schemas and saved-layout normalization.
- Added mode and exploration-view render dispatchers; exploration subviews are attached one at a time.
- Added targeted refreshes for active conditions and combat action filters while retaining full refreshes for structural changes.
- Replaced the flat Foundry settings list with a grouped Adventurer HUD settings application while preserving existing setting keys and user preferences.
- Expanded regression coverage for compatibility adapters, mode priority, view dispatch, layouts, and settings groups.
- Streamlined the project documentation and added a complete Russian README with reciprocal language links.

## 0.7.9

- Fixed automatic actor tracking so changing or deselecting a token refreshes the complete actor/token context.
- Allowed initiative rolls for an owned actor when its combatant is known without requiring the token to remain selected.
- Prevented restoring resources that do not define a finite maximum and centralized resource-value clamping.
- Changed migration bookkeeping to per-user scope and stopped overwriting an existing manual-navigation preference.
- Added regression tests for token context, combatant selection, resource bounds, setting defaults and migrations.

## 0.7.8

- Added a collapsible saving-throw section, expanded by default.
- Added the spell browser to exploration mode with prepared/all filtering.
- Kept inspiration beside the actor identity and moved rest controls below the header in exploration mode.
- Reduced active condition controls to compact icon-only buttons.
- Added resource restoration alongside resource consumption.
- Made active-combat initiative lookup resilient to combat recreation.
- Replaced nested action-list scrolling with the HUD window's shared scrollbar.
- Increased the extra-large text-size option.
- Confirmed manual mode navigation is hidden by default and English provides the localization fallback set.

## 0.7.5

- Fixed the owned-character picker when the HUD is opened without a selected token.
- Changed compact combat saving throws to a two-column layout and kept combat filters at two columns at the minimum width.
- Replaced the conditions browser with removable chips for currently active conditions.
- Added editable current and temporary HP cards; temporary HP now remains visible at zero.
- Disabled manual mode navigation by default.

## 0.7.0

- Added a persistent per-user layout editor with drag-and-drop section ordering, hide/add controls, and access to all HUD modes while editing.
- Opened Adventurer HUD's category directly when using the title-menu settings action.
- Resolved roll-data variables in damage formulas and added the weapon ability modifier when it is applied implicitly by D&D 5e.
- Moved the combat saving-throw label above its buttons to reduce horizontal usage.
- Added resource-consumption dialogs for class-feature and custom actor resources.
- Made class resources collapsible in narrow combat layouts.

## 0.6.7

- Replaced the nested percentage-height scroller with Foundry's native window-content scrolling.
- Added an owned-character picker when no token is selected.

## 0.6.6

- Fixed HUD sections collapsing to nearly zero height inside resized windows.
- Restored usable full-window vertical scrolling in every mode.

## 0.6.5

- Added a collapsed-by-default condition picker with enable/disable controls and separate active-condition removal buttons.
- Fixed live condition and class-feature resource updates.
- Added consumable class features, including Focus Points, to combat resources when they expose limited uses.
- Added attack bonuses and damage formulas to weapon and spell cards.
- Added character class and level information, including multiclass summaries.
- Added Heroic Inspiration controls to every mode and short/long rest controls to exploration mode.
- Made death-save mode manually accessible outside zero HP while keeping death-save rolls gated by character state.
- Moved mode navigation directly below the actor header and added an option to hide manual navigation.
- Strengthened vertical scrolling for the full HUD, skills, tools, condition picker and combat item lists.
- Reviewed the settings surface and retained distinct visibility controls where they affect independent HUD sections.

## 0.6.0

- Reworked responsive grids so controls gain columns instead of stretching excessively in wide windows.
- Added full-window scrolling and independent scrolling for combat item lists.
- Added selectable HUD font sizes and larger, clearer ability controls.
- Moved combat initiative beside the actor name, removed it from exploration mode and highlighted unrolled initiative.
- Hid temporary HP and maximum-HP modifiers when their values are zero.
- Added class/custom resource cards and per-section combat visibility settings.
- Grouped spells by level with prepared/all filtering and spell-slot indicators.
- Added best-effort resource costs to action cards.
- Added live active-effect updates and direct condition removal.
- Added consistent navigation among exploration, combat and death-save modes.
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
- Added automatic combat mode with combat statistics and exploration-mode fallback.
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
