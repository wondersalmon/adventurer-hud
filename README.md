# Adventurer HUD

[Русская версия](README.ru.md)

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3+](https://img.shields.io/badge/D%26D_5e-5.3%2B-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)

> A customizable D&D 5e HUD for players and GMs, with character actions, encounter management, companions, shared senses and editable layouts.

The player panel now uses a [two-column layout](media/layout.webp) by default, adapting to one column in narrow windows.

This beta adds optional SC phased initiative compatibility. Stable installations retain the existing initiative behavior.

- [Player guide](docs/player-guide.md) — character actions, spells, favorites, editor and dice.
- [GM guide](docs/gm-guide.md) — encounter setup, creature actions and turn controls.

- [Companions guide](docs/companions-guide.md) — ownership, summons and shared senses.
- [Version 2.0](docs/release-2.0.md) — new features and bug fixes.

![Adventurer HUD demonstration](media/layout.webp)

## GM panel

Prepare encounters, manage initiative and turns, and access creature actions from one panel. Drag NPCs, actor folders or Encounters from Actors and compendiums into the creature list. Creature controls include HP, effects, visibility, defeat, ping and token focus; the layout can be customized. See the [GM guide](docs/gm-guide.md).

![GM panel with the creature roster, character controls and actions](media/gm-w.webp)

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
