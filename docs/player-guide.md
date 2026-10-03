# Player HUD

[About the module](../README.md) · [GM HUD](gm-guide.md) · [Русский](player-guide.ru.md)

Select your character's token and press **Shift+R** to open or close the HUD. Without a token, it opens your only available character or offers a choice. The portrait opens the sheet; the pin locks window position and size. **⋮** provides settings and manual mode controls.

## Character and actions

Exploration provides checks, saves, skills, tools, spells, inventory and rests. Combat actions appear when your character participates in a started encounter. Roll initiative after the token joins combat; use **End turn** on your turn.

Click **HP** for damage `-7`, healing `+5` or a new value `12`; temporary HP has a separate field. At 0 HP, death saves appear when needed. Crosshairs beside your name select your token and center the camera in either mode.

Search and filters help find actions. Inventory shows weight, capacity and gold. Favorites follows your character sheet; the header star enables editing.

Actions use D&D 5e dialogs and resources. Choose among an item's activities in its card. **Shift+left-click** skips that choice and requests a quick roll; **Alt/Ctrl+left-click** requests advantage/disadvantage where supported. **Right-click** opens the item sheet; **Shift+right-click** shares its description in chat.

Hover over a card or focus it with the keyboard to read its description. The pin button or **F2** keeps it open; **Escape** closes it. Disable automatic previews in **Additional settings → Cards and actions**. **Features** shows entries with an activation by default, including Epic Actions. Enable **Show passive features** in that tab to switch to Darkvision and other passive traits; **Show active features** switches back; the choice is remembered for this character.

## Companions on scene and in combat

**Companions** automatically lists owned characters and creatures except your main character. **On scene** opens by default; **All** includes creatures without a token here. Rows provide sheets, health, AC and effects, updating with ownership and token changes.

Select a row to open its actions in the same window; choose another companion below **Return to …**. Returning restores your original character token even outside the companion's vision. Switching selects the token, centers the camera and uses its vision; disable **Follow companion selection** to change only the panel. Ping marks a companion without changing selection.

In **All**, **Add to scene** beside a creature places its prototype token. Choose a map position; **Escape** or right-click cancels. Ownership and token-creation permission are required; players cannot place during a pause. Once placed, the button disappears without adding a duplicate row. Multiple tokens share a row, with an instance picker when needed. Cast summoning spells through D&D 5e.

![Companions panel](../media/summons-panel.png)

## Familiar senses

For **Find Familiar (2024)**, use the companion row's eye from your character panel. It adds the familiar's configured senses; your character stays selected with their actions available. The camera moves to the familiar while movement still controls your character. Disable **Move camera with shared senses** in **Companions** settings to keep the camera still. A green eye and message show that sharing is active.

Activate sharing on your character's turn; it lasts until the start of their next turn, or six seconds of advanced **game time** outside combat. Track the Bonus Action and other spell requirements yourself. Press the eye again or return to your own senses to stop early. Changing token or panel, reopening or closing the HUD also stops sharing.

An unavailable eye shows the reason below its row. Both tokens must be on this scene and controllable; the familiar needs vision and more than 0 HP. In combat, your character must participate and have the current turn. If several character tokens exist, select the intended one first. See [GM setup](gm-guide.md#players-companions).
