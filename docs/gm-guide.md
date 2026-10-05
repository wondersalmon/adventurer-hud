# GM HUD

[About the module](../README.md) · [Player HUD](player-guide.md) · [Companions](companions-guide.md) · [Version 2.0](release-2.0.md) · [Русский](gm-guide.ru.md)

Enable **Use GM panel** in GM settings, then press **Shift+R** to open or close it. Use **⋮** to switch to the character panel; the pin locks the window's position and size. GM and player modes have separate display settings.

![GM panel](../media/gm-w.gif)

## Preparing and running combat

During preparation, add chosen creatures or all creatures on the scene, roll initiative and start combat. The preparation buttons roll all participants or only NPCs through Foundry, preserving existing initiative results. The same all/NPC buttons are available in the combat toolbar (under More on narrow panels). **Other initiative options** contains selected-creature rolls, rerolls and reset. If the scene has several encounters, select the intended one in the panel: its participants and combat commands apply to that encounter.

Select a participant to open their actions, including player characters. Switching cards lets you inspect a creature; previous/next turn and ending the current turn advance combat. Token navigation and ping help locate creatures on the map.

**Automatic creature selection** offers manual selection, following the current turn, or selecting the next NPC after ending a turn from the HUD. When following turns, player turns keep the last NPC card. Manual selection pauses following; **Follow turn** enables it again.

Removing defeated NPCs is a manual operation that deletes tokens while keeping creatures in the Actor directory. Companions with player owners are excluded from the group removal list.

## Creature actions and features

The card shows health, AC, movement, saves, conditions and resources. Click **HP** to enter damage `-7`, healing `+5` or an absolute value; open the creature's sheet for full editing. Abilities use the normal D&D 5e mechanics and dialogs.

Choose a single action list or grouping in GM settings. Grouping uses activity activation types, including **Epic Actions**, **Villain Actions**, legendary actions and reactions. **Features** shows entries with an activation by default, including Epic Actions. Enable **Show passive features** in that tab to switch to Darkvision and other passive traits; the choice is remembered for this character. A custom section name in another sheet does not create an action type: a custom category needs a corresponding system activity activation type.

If an ability is missing, check its item and activities in the full sheet, then HUD grouping and filters. The single list is useful for checking creatures with unusual abilities. Card details and search are configured independently of the player panel.

Ownership, token setup, summons and shared senses are covered in the [companions guide](companions-guide.md).

## Settings and help

For an intermittent problem, choose **Record a problem**, reproduce it, then **The problem happened — stop** and **Download report**. Recording stops automatically after 10 minutes. You can preview the report and add an optional expected/actual result. It contains recent HUD actions, anonymous references and technical context; raw error text is excluded unless you enable it. Review that optional text before sharing. Nothing is uploaded automatically; reloading clears this tab's history.
