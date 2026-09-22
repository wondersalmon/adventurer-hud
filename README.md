# Adventurer HUD

[Русская версия](README.ru.md)

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3–6.x](https://img.shields.io/badge/D%26D_5e-5.3–6.x-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)
![Dependencies: none](https://img.shields.io/badge/deps-none-2f855a?style=flat-square)

A player-focused character and combat HUD for Foundry VTT 14 with D&D 5e.

![Adventurer HUD](docs/media/image.png)

## Install

In Foundry VTT, open **Install Module**, paste this manifest URL, and select
**Install**:

```text
https://github.com/wondersalmon/adventurer-hud/releases/latest/download/module.json
```

## Compatibility

- Foundry VTT 14
- D&D 5e 5.3–6.x
- No required module dependencies

The HUD uses native Foundry and D&D 5e APIs. It works without automation
modules and forwards roll events for interoperability with modules such as
Midi-QOL. Modules that replace native roll workflows can still alter roll
behavior.

## Features

- Regular, combat, and death-save layouts
- Checks, saves, skills, tools, spells, weapons, and actions
- HP, temporary HP, AC, speed, initiative, class resources, conditions, and spell slots
- Native item use and roll modifier keys
- Automatic mode detection for regular, combat, and death-save states
- Responsive layout, font sizing, and persistent window geometry
- Configurable Token Controls button and keybinding (`Shift+R` by default)

![Adventurer HUD demonstration](docs/media/demo.webp)

## Usage

Open the HUD with the dice button under Token Controls or its configurable
keybinding. Combat mode activates when the selected character is in an active
combat; the module never adds or removes combatants.

Combat item cards use the native D&D 5e workflow. Their book buttons open item
sheets without using the item. Optional details include range, attack bonus,
damage, activation, resource cost, concentration, and ritual markers.

A macro can also open the HUD through its public API:

```js
game.modules.get("adventurer-hud").api.open();
```

## Configuration

Open **Adventurer HUD settings** from Foundry's Module Settings or the HUD title
menu. Common options and reset controls appear directly in Foundry's Module
Settings; granular options are under **Additional settings**. The title menu
also provides keep-open and window reset controls.

Settings are stored per user; window size and position are stored per client.

## Development

Requires Node.js 22 or newer.

```text
npm ci
npm run check
npm run build
```

System adapters live in `scripts/systems`, version-specific D&D 5e helpers in
`scripts/dnd5e`, and mode renderers and shared UI components in `scripts/hud`.
Render dispatch lives in `scripts/render`. See the
[system adapter guide](docs/system-adapters.md) to add
support for another game system.
