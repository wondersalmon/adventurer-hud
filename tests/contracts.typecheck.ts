import { prepareHudOpenContext } from "../scripts/hud/open-context.js";
import { openActorHud } from "../scripts/hud/actor-session.js";
import { openEmptyGmHud } from "../scripts/hud/empty-gm.js";
import { createLatestRefresh } from "../scripts/hud/async-refresh.js";
import {
  moveItemLayout,
  pruneItemLayouts
} from "../scripts/hud/items/item-layout.js";
import { bindItemLayoutInteractions } from "../scripts/hud/items/item-layout-interactions.js";
import { restoreSettingsBackup } from "../scripts/settings-backup.js";
import {
  completeScTurn,
  scTurnLabel
} from "../scripts/compatibility/sc-venaerys-initiative.js";
import type {
  ActorOpenContext,
  EmptyGmOpenContext,
  HudAdapter
} from "../types/hud.js";
import type {
  CompanionActions,
  CompanionNavigation,
  CompanionEntry
} from "../types/hud.js";

declare const companionActions: CompanionActions;
companionActions.opencompanion?.(null, {
  dataset: { companionUuid: "Actor.owl" }
});
// @ts-expect-error Navigation always identifies the owner with a UUID string.
const invalidNavigation: CompanionNavigation = { ownerUuid: 42 };
void invalidNavigation;
// @ts-expect-error Native input events must not be replaced by a string.
companionActions.initiative?.("Alt", { dataset: {} });
// @ts-expect-error Entries require exact-token choices and scene presence.
const invalidEntry: CompanionEntry = {
  uuid: "Actor.owl",
  actor: null,
  token: null,
  reason: null
};
void invalidEntry;

declare const actor: ActorOpenContext;
declare const emptyGm: EmptyGmOpenContext;
declare const adapter: HudAdapter;
// @ts-expect-error Completion guards must return a boolean, not a pending choice.
completeScTurn({}, {}, async () => true);
// @ts-expect-error Phase states require the complete typed status contract.
scTurnLabel({ half: "movement" }, key => key);
declare const state: import("../types/hud.js").HudState;
declare const element: HTMLElement;
// @ts-expect-error Activity identities must be strings, never document objects.
pruneItemLayouts(state, [{ id: "item", activityIds: [{}] }]);
// @ts-expect-error Reordering requires a string item/activity key.
moveItemLayout(state, "combat:action", 42, "target", []);
// @ts-expect-error Restore validates serialized input, not arbitrary objects.
restoreSettingsBackup({ format: 1 });
bindItemLayoutInteractions({
  element,
  isActive: () => true,
  // @ts-expect-error Drag handlers receive native Events, not strings.
  move: (event: string) => event
});
const openHud = async () => {};

openActorHud(actor, { openHud });
openEmptyGmHud(emptyGm, { openHud });
prepareHudOpenContext({ actorOverride: null, adapter, openHud });

// Negative checks ensure boundaries keep rejecting incompatible collaborators.
// @ts-expect-error A GM session without an actor cannot start the actor session.
openActorHud(emptyGm, { openHud });
// @ts-expect-error Actor sessions cannot masquerade as empty GM sessions.
openEmptyGmHud(actor, { openHud });
// @ts-expect-error Opening must be awaited; synchronous callbacks are incompatible.
openActorHud(actor, { openHud: () => {} });
prepareHudOpenContext({
  actorOverride: null,
  // @ts-expect-error An incomplete adapter cannot satisfy the native D&D contract.
  adapter: { id: "dnd5e" },
  openHud
});
// @ts-expect-error Cleanup identity is a required session boundary.
openActorHud({ ...actor, session: undefined }, { openHud });
createLatestRefresh<number>({
  load: async () => 1,
  isCurrent: () => true,
  onError: () => {},
  // @ts-expect-error Refreshed values must match the loader's result type.
  apply: (value: string) => {
    void value;
  }
});
