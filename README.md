# Simple Rolls

A compact player-focused rolls HUD for Foundry VTT 14 and the D&D 5e system.

## Compatibility

- Foundry VTT 14
- D&D 5e 5.3+
- Native D&D 5e rolls
- Midi-QOL interoperability through the native roll event

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
- Russian localization (English combat strings will be synchronized later)
- Migration of the previous macro's saved window state

## Opening the HUD

Use the dice button under Token Controls, press `Shift+R`, assign a different shortcut under Foundry's Configure Controls screen, or call the public module API from a macro:

```js
game.modules.get("simple-rolls").api.open();
```

The combat layout appears only for the selected token's combatant while an active
combat is running. The module never adds a token to combat and never removes one.

## Development

Requires Node.js 22 or newer.

```shell
npm ci
npm run check
npm run build
```

The build produces `dist/simple-rolls.zip` and a matching `dist/module.json`.
Pull requests and pushes to `main` run formatting, linting, tests, manifest
validation and a package build. Tags named `v<module version>` publish both
artifacts to a GitHub release.

To prepare a new version, update `package.json` and its lock file, then run
`npm run version:sync`. Commit the result before creating the matching tag.

## Structure

- `module.json` — Foundry package manifest
- `scripts/simple-rolls.js` — module bootstrap, keybinding and public API
- `scripts/rolls-hud.js` — window, actor data and roll workflow
- `scripts/constants.js` — D&D 5e ability, skill and tool metadata
- `scripts/settings.js` — Foundry settings, persistence and legacy migration
- `scripts/module-id.js` — shared module identifier
- `styles/simple-rolls.css` — complete adaptive HUD styling
- `templates/rolls-hud.hbs` — root Handlebars template
- `lang/` — English and Russian localization
- `tests/` — manifest and localization tests
- `tools/` — validation, version synchronization and reproducible packaging
