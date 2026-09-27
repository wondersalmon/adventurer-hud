import { prepareHudOpenContext } from "../scripts/hud/open-context.js";
import { openActorHud } from "../scripts/hud/actor-session.js";
import { openEmptyGmHud } from "../scripts/hud/empty-gm.js";
import { createLatestRefresh } from "../scripts/hud/async-refresh.js";
import type {
  ActorOpenContext,
  EmptyGmOpenContext,
  HudAdapter
} from "../types/hud.js";

declare const actor: ActorOpenContext;
declare const emptyGm: EmptyGmOpenContext;
declare const adapter: HudAdapter;
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
