# Adventurer HUD

[Русская версия](README.ru.md)

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3+](https://img.shields.io/badge/D%26D_5e-5.3%2B-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)

Adventurer HUD is a compact HUD for [D&D 5e](https://github.com/foundryvtt/dnd5e). Players get character actions in exploration and combat; GMs get a dedicated panel for managing creatures and encounters.

The player panel now uses a [two-column layout](media/layout.png) by default, adapting to one column in narrow windows.

- [Player guide](docs/player-guide.md) — character actions, spells, favorites, editor and dice.
- [GM guide](docs/gm-guide.md) — encounter setup, creature actions and turn controls.

- [Companions guide](docs/companions-guide.md) — ownership, summons and shared senses.
- [Version 2.0](docs/release-2.0.md) — new features and bug fixes.

![Adventurer HUD demonstration](media/demo.gif)

## Installation

In Foundry VTT, select **Install Module**, search for **Adventurer HUD** in the official module catalog, and click **Install**. You can also open the [Adventurer HUD package page](https://foundryvtt.com/packages/adventurer-hud).

Alternatively, paste this manifest URL into **Install Module**:

```text
https://github.com/wondersalmon/adventurer-hud/releases/latest/download/module.json
```

## Supported systems

For Foundry VTT 14:

- D&D 5e 5.3+

## Usage

Press `Shift+R` to open or close the HUD. Players select their character's token; GMs can enable the dedicated GM panel in GM settings or switch panel types in the window header. Change the shortcut in **Configure Controls**.

Enable **Open on login** to open the HUD when entering the world. Enable the **Token Controls button** for a player HUD button or a dedicated GM button. The [player](docs/player-guide.md) and [GM](docs/gm-guide.md) guides explain each mode.

## AI disclosure

AI tools were used during development and code review.
