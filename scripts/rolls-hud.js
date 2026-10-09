// @ts-check
import { prepareHudOpenContext } from "./hud/open-context.js";
import { openActorHud } from "./hud/actor-session.js";
import { openEmptyGmHud } from "./hud/empty-gm.js";
import { dnd5eAdapter } from "./dnd5e/index.js";
import { createTaskQueue } from "./task-queue.js";
import { reportFailure } from "./diagnostics.js";

const queueOpening = createTaskQueue();

/** @type {import('../types/hud.js').OpenHud} */
export function openRollsHud(
  actorOverride = null,
  navigation = null,
  recovery = undefined
) {
  return queueOpening(() =>
    recovery && !recovery.isCurrent()
      ? undefined
      : openHud(actorOverride, navigation, recovery)
  );
}

async function openHud(actorOverride, navigation, recovery) {
  try {
    const context = await prepareHudOpenContext({
      actorOverride,
      navigation,
      recovery,
      adapter: dnd5eAdapter,
      openHud: openRollsHud
    });
    if (!context) return;
    if (context.actorContext) {
      await openActorHud(
        { ...context, actorContext: context.actorContext },
        { openHud: openRollsHud }
      );
    } else if (context.gmActive && context.gmController) {
      await openEmptyGmHud(
        {
          ...context,
          gmActive: true,
          actorContext: null,
          gmController: context.gmController
        },
        { openHud: openRollsHud }
      );
    }
  } catch (error) {
    reportFailure("hud.open", error);
  }
}
