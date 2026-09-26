import { tokenForActor } from "../runtime-helpers.js";
import { openActorPicker } from "./actor-picker.js";

export async function selectHudActor({
  actorOverride,
  adapter,
  DialogV2,
  language,
  onSelect,
  t,
  tf
}) {
  const selected = canvas.tokens.controlled;
  if (selected.length > 1) {
    ui.notifications.warn(t("Warnings.OneToken"));
    return null;
  }

  const selectedToken = selected[0] ?? null;
  const actor = actorOverride ?? selectedToken?.actor ?? null;
  const token = tokenForActor(selectedToken, actor);

  if (!actor) {
    const availableActors = game.actors.filter(
      candidate => adapter.isActorSupported(candidate) && candidate.isOwner
    );
    if (!availableActors.length) {
      ui.notifications.warn(t("Warnings.NoActor"));
    } else if (availableActors.length === 1) {
      return { actor: availableActors[0], token: null };
    } else {
      await openActorPicker({
        actors: availableActors,
        DialogV2,
        document,
        escapeHTML: foundry.utils.escapeHTML,
        lang: language,
        onSelect,
        t,
        viewportWidth: window.innerWidth
      });
    }
    return null;
  }

  if (!adapter.isActorSupported(actor)) {
    ui.notifications.warn(
      tf("Warnings.UnsupportedActor", { actor: actor.name })
    );
    return null;
  }

  return { actor, token };
}
