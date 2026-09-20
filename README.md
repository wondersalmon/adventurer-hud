# Adventurer HUD

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3–6.x](https://img.shields.io/badge/D%26D_5e-5.3–6.x-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)
![Dependencies: none](https://img.shields.io/badge/deps-none-2f855a?style=flat-square)

A player-focused character, rolls and combat HUD for Foundry VTT 14 and the
D&D 5e system.

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

- Compact checks, saves, skills, tools, initiative and death saves HUD
- Actor portrait and name in every HUD mode
- Automatic combat layout with HP, AC, speed, initiative, turn and concentration status
- Manual fallback between regular, combat and death-save layouts
- Native D&D 5e roll calls with modifier-key forwarding
- Token Controls button and configurable keybinding (`Shift+R` by default)
- Automatic updates when the selected token changes
- Per-user section visibility and behavior settings
- Persistent client window size and position
- Synchronized English and Russian localization
- Migration of the previous macro's saved window state

## Opening the HUD

Use the dice button under Token Controls, press `Shift+R`, assign a different shortcut under Foundry's Configure Controls screen, or call the public module API from a macro:

```js
game.modules.get("adventurer-hud").api.open();
```

The combat layout opens automatically for the selected token's combatant while
an active combat is running, and it can also be opened manually. The module never
adds a token to combat and never removes one.

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
- `scripts/settings.js` — Foundry settings, persistence and legacy migration
- `scripts/module-id.js` — shared module identifier
- `styles/adventurer-hud.css` — complete adaptive HUD styling
- `templates/rolls-hud.hbs` — root Handlebars template
- `lang/` — English and Russian localization
- `tests/` — manifest and localization tests
- `tools/` — validation, version synchronization and reproducible packaging
