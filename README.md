# Adventurer HUD

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3–6.x](https://img.shields.io/badge/D%26D_5e-5.3–6.x-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)
![Dependencies: none](https://img.shields.io/badge/deps-none-2f855a?style=flat-square)

A player-focused character, rolls and combat HUD for Foundry VTT 14 and the
D&D 5e system.

## Installation

In Foundry VTT, choose **Install Module**, paste the following manifest URL and
select **Install**:

```text
https://github.com/wondersalmon/adventurer-hud/releases/latest/download/module.json
```

[Open the latest manifest](https://github.com/wondersalmon/adventurer-hud/releases/latest/download/module.json)

## Compatibility

- Foundry VTT 14
- D&D 5e 5.3–6.x
- No required module dependencies
- Native D&D 5e rolls
- Optional Midi-QOL interoperability through the native roll event

Adventurer HUD works with Foundry and the D&D 5e system alone. It has no required
module, automation-library or UI-framework dependencies. Its rolls and document
updates use the public native Foundry and D&D 5e APIs, which keeps interference
with other modules to a minimum. Modules that replace the same native roll
workflows may still affect their behavior; Midi-QOL is supported through those
native roll events.

## Features

- Compact checks, saves, skills, tools and death saves HUD
- Actor portrait and name in every HUD mode
- Character class and level, Heroic Inspiration, and native rest controls
- Automatic combat layout with HP, optional temporary/max-HP values, AC, speed, resources and initiative
- Configurable weapons, spells and action-type tabs with native item use
- Prepared/all spell filters, spell-level groups and remaining spell-slot indicators
- Optional range, attack bonus, damage formula, activation, resource cost, concentration and ritual details on combat cards
- Collapsible condition controls, removable active conditions and live updates
- Manual fallback between regular, combat and death-save layouts
- Native D&D 5e roll calls with modifier-key forwarding
- Token Controls button and configurable keybinding (`Shift+R` by default)
- Automatic updates when the selected token changes
- Per-user section visibility, font-size and behavior settings
- Persistent client window size and position
- Optional adaptive grids, spacing and typography for narrow and wide windows
- Window behavior and geometry controls in the title-bar menu
- Synchronized English and Russian localization
- Migration of the previous macro's saved window state

## Opening the HUD

Use the dice button under Token Controls or press `Shift+R` to toggle the HUD.
The shortcut can be reassigned under Foundry's Configure Controls screen. The
public module API can also open the HUD from a macro:

```js
game.modules.get("adventurer-hud").api.open();
```

The combat layout opens automatically for the selected token's combatant while
an active combat is running, and it can also be opened manually. The module never
adds a token to combat and never removes one.

## Combat HUD

Combat mode groups owned items into weapons, spells, actions, bonus actions,
reactions and special actions. Selecting a card uses the item through the native
D&D 5e workflow; the book button opens its sheet without using it. Spell cards
are grouped by level, can be filtered to prepared spells, and show the available
spell slots. Cards can show range, activation, resource cost, concentration and
ritual markers, while weapon cards can show normal and long range. This
additional information can be disabled without hiding item-sheet buttons.

Active configured conditions are displayed with the character's combat data.
An owner can remove an individual condition directly from the HUD, and effect
changes refresh the open HUD automatically. Initiative appears beside the actor
name and is highlighted until rolled. It can be rolled only when the GM has
already added the selected token to combat; the module never changes combat
membership.

## Configuration

All options are per-user and available under Foundry's Module Settings:

- adaptive layout, responsive typography and a selectable base font size;
- automatic combat mode and automatic selected-token tracking;
- keep the HUD open after rolls;
- additional combat-card information;
- visibility of combat resources and each combat item tab;
- optional manual navigation among HUD modes;
- visibility of initiative, checks, saves, skills, tools, death saves and shortcut hints.

The title-bar menu provides quick access to module settings, the keep-open toggle
and window-geometry reset. Window size and position are stored per client. The
open/close shortcut is configurable through Foundry's Configure Controls screen.

## Development

Requires Node.js 22 or newer.

```shell
npm ci
npm run check
npm run build
```

The build produces `dist/adventurer-hud.zip` and a matching `dist/module.json`.
Pull requests and pushes to `main` run formatting, linting, tests, manifest
validation and a package build. Tags named `v<module version>` publish both
artifacts to a GitHub release.

To prepare a new version, update `package.json` and its lock file, then run
`npm run version:sync`. Commit the result before creating the matching tag.

## Roadmap

- A touch-first mobile layout is planned for a later release. It will focus on
  the assigned character, large roll controls, bottom navigation and on-screen
  advantage/disadvantage controls instead of keyboard modifiers.

## Structure

- `module.json` — Foundry package manifest
- `scripts/adventurer-hud.js` — module bootstrap, keybinding and public API
- `scripts/rolls-hud.js` — window, actor data and roll workflow
- `scripts/constants.js` — D&D 5e ability, skill and tool metadata
- `scripts/settings.js` — per-user settings, window persistence and legacy migration
- `scripts/module-id.js` — shared module identifier
- `styles/adventurer-hud.css` — complete adaptive HUD styling
- `templates/rolls-hud.hbs` — root Handlebars template
- `lang/` — English and Russian localization
- `tests/` — manifest and localization tests
- `tools/` — validation, version synchronization and reproducible packaging
