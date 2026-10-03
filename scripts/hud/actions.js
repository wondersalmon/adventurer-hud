import {
  reportFailure,
  beginDiagnostic,
  diagnosticRef
} from "../diagnostics.js";
import { createGmActions } from "./gm/gm-actions.js";
import { createActorActions } from "./actor-actions.js";
import { createItemActions } from "./items/item-actions.js";
import { createViewActions } from "./view-actions.js";

// Commands using the displayed actor reject stale selections and companion links.
const ACTOR_ACTIONS = new Set([
  "initiative",
  "ability",
  "skill",
  "tool",
  "death",
  "edithp",
  "inspiration",
  "shortrest",
  "longrest",
  "useitem",
  "useactivity",
  "togglefavorite",
  "removefavorite",
  "togglespellprepared",
  "openitem",
  "gmsheet",
  "actorcenter",
  "gmremove"
]);

/** @param {import('../../types/hud.js').HudActionsOptions} options */
export function createHudActions(options) {
  const {
    actor,
    gmController,
    gmCombatantId,
    t,
    companionActions = {},
    validateActorAction = null
  } = options;
  const actions = {
    ...createGmActions(options),
    ...createActorActions(options),
    ...createItemActions(options),
    ...createViewActions(options)
  };
  Object.assign(actions, companionActions);
  for (const [name, action] of Object.entries(actions)) {
    actions[name] = async function (...args) {
      const trace = beginDiagnostic("hud.action." + name, {
        actor: diagnosticRef(actor, "actor"),
        alt: Boolean(args[0]?.altKey),
        ctrl: Boolean(args[0]?.ctrlKey),
        shift: Boolean(args[0]?.shiftKey),
        input: args[0]?.type === "keydown" ? "keyboard" : "pointer"
      });
      try {
        if (
          validateActorAction &&
          (ACTOR_ACTIONS.has(name) || name === "endturn")
        ) {
          const allowed = validateActorAction();
          if (!(allowed instanceof Promise ? await allowed : allowed)) {
            trace.finish("stale", "session-replaced");
            return ui.notifications.warn(t("Companions.Unavailable"));
          }
        }
        if (
          actor?.type === "npc" &&
          [
            "inspiration",
            "shortrest",
            "longrest",
            "death",
            "togglefavorite",
            "removefavorite"
          ].includes(name)
        )
          return;
        if (gmController && !gmController.isGM()) return;
        if (gmController && ACTOR_ACTIONS.has(name)) {
          if (!actor) return;
          const selected = gmController.sync();
          if (
            selected?.id !== gmCombatantId ||
            (selected?.token?.actor ?? selected?.actor)?.uuid !== actor?.uuid
          )
            return;
        }
        const result = await action.apply(this, args);
        trace.finish("dispatched");
        return result;
      } catch (error) {
        trace.finish("error", "native-error");
        reportFailure(`hud.action.${name}`, error, { t });
      } finally {
        trace.finish("rejected", "action-unavailable");
      }
    };
  }

  return actions;
}
