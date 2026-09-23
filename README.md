# Adventurer HUD

[Русская версия](README.ru.md)

[![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-2f855a?style=flat-square)](https://foundryvtt.com/)
[![D&D 5e 5.3+](https://img.shields.io/badge/D%26D_5e-5.3%2B-2f855a?style=flat-square)](https://github.com/foundryvtt/dnd5e)

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
- D&D 5e 5.3 or newer; manifest verified version: 6.0.3
- No required modules

The HUD uses Foundry and D&D 5e roll workflows. Other modules may change how
those rolls behave; Adventurer HUD does not require an automation module.

## Features

- Exploration and combat layouts with an inline death-save control at 0 HP
- Checks, saves, skills, tools, spells, weapons, and actions
- HP, temporary HP, AC, speed, initiative, class resources, conditions, and spell slots
- Native item use and roll modifier keys
- Live item search, an inline activity chooser, and per-character favorites
- Automatic switching between exploration and combat
- Responsive layout, text sizing, optional animated feedback, and saved window position
- Configurable keybinding (`Shift+R` by default) and optional Token Controls button

![Adventurer HUD demonstration](docs/media/demo.webp)

## Usage

Press `Shift+R` to open the HUD for the selected token, or for your assigned
character when no token is selected. You can enable a Token Controls button in
Additional settings. Combat mode activates when the actor joins a started
combat. The HUD does not add combatants.

Item cards use the D&D 5e workflow. The book button opens the item sheet.
Search matches item and activity names in combat, spells, and inventory. The
star saves an item or activity to your favorites for that character. For items
with several activities, click the card to choose one, or Shift-click to use
the native item workflow.

Roll buttons accept the native modifier keys: `Shift` fast-forwards a normal
roll, `Alt` requests advantage, and `Ctrl` requests disadvantage. Exact behavior
can be adjusted by D&D 5e or automation-module settings.

Click the HP bar to edit current and temporary HP. Enter `12` to set a value,
`+5` to add, or `-3` to take damage from temporary HP first and then regular HP.
The temporary HP field changes temporary HP directly. Leave a field blank to
keep it unchanged. The bar appears in exploration and combat.

At 0 HP, the HUD turns gray, labels the character Unconscious, and shows a red
death-save roll button below the HP bar in either layout. It does not show
success or failure counters; after three failures it shows a death message.
D&D 5e handles the result of each roll.

The exploration skills view initially shows proficient and expert skills;
switch to All skills to see the full list. The choice is saved for your user.

A macro can also open the HUD through its public API:

```js
game.modules.get("adventurer-hud").api.open();
```

## Configuration

Open the module settings from Foundry's Module Settings or the HUD title menu.
The main settings cover language, text size, closing after rolls, token
selection, and manual mode navigation. **Additional settings** groups search
and favorites, item use, and HUD display and controls.

Turn off **HUD visual effects** to remove damage, healing, HP, and initiative
animations. HP colors and status labels remain. The Token Controls button
setting takes effect after reloading Foundry. The HUD title menu also has pin,
close-after-roll, and window-reset controls.

Options and favorites are saved per user. Window size and position are saved
for each client. HUD favorites do not change favorites on the D&D 5e sheet.

## AI disclosure

AI tools assisted with development and review.

## Development

Requires Node.js 22 or newer.

```text
npm ci
npm run check
npm run build
```

See the [system adapter guide](docs/system-adapters.md) for the adapter contract
and the steps for adding a game system. HUD code lives in `scripts/hud`, D&D 5e
helpers in `scripts/dnd5e`, and styles in `styles`.
