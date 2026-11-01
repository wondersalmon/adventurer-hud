# SC Initiative integration

Install and activate **SC - Venaerys's Initiative**, then open Adventurer HUD's **Configure → GM → World rules** and enable its integration. It is off by default and applies to everyone in the world. If SC is missing, the switch is disabled and explains what to install; if it is inactive, the hint explains how to activate it.

In a phased encounter the HUD shows the current visible phase and, when enabled in SC, its Movement or Actions half. **Tracker** opens SC's own tracker for rolls, configuration and phase management. Hidden phases and DCs are not revealed to players.

Players can act together within their phase. **Moved** finishes movement and **Done** finishes the displayed participant, including a companion or an additional critical turn of the same token. Other owned participants remain available. The GM has per-creature completion controls and native Previous/Next phase controls. SC decides when phases advance automatically.

After marking a participant, its button offers **Undo movement** or **Undo done** while that phase and half remain current. Undo does not return to an earlier phase. A companion's card offers the same controls without leaving your hero; when several tokens are eligible, choose the exact one.

**Extra turn** identifies additional turns in the HUD and roster. The phase summary counts your visible, owned, living participants and how many have finished the current half; hidden participants are excluded.

Shared senses follow the caster's phase; the 2024 familiar activity requires the Actions half. Existing ownership, token selection and shared-senses preferences still apply.

Use SC 1.0.5 or later with its Done/Moved API. If that API is unavailable, the HUD directs you to update SC; use its tracker meanwhile. SC controls native turn events and system automation, whose limits are described in [SC's documentation](https://github.com/Shattered-Codex/sc-venaerys-initiative#readme).

Disabling integration restores the HUD's usual initiative controls without changing the encounter or disabling SC. Personal backups and resets preserve this world setting.

**Troubleshooting → Diagnostic report** shows the integration state, module versions and available SC commands, with an explanation when integration is unavailable. Downloaded reports include this status without combatant names, document IDs, phase names or hidden DCs.
