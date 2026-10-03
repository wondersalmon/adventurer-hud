import { resolveHpChanges } from "./hp-input.js";
import {
  reportFailure,
  beginDiagnostic,
  diagnosticRef
} from "../diagnostics.js";

export function createHpDialogController({
  actor,
  adapter,
  canStartMutation = () => true,
  DialogV2,
  canEditActor = async () => true,
  t
}) {
  let currentDialog = null;
  let disposed = false;
  const openHpDialog = () => {
    if (disposed) return;
    if (currentDialog) return currentDialog;
    const hp = adapter.combatStats(actor).hp;
    const content = document.createElement("div");
    content.innerHTML = `
      <div class="ws-hp-dialog-content">
        <label>
          <span>${t("Combat.HP")}</span>
          <input type="text" name="value" placeholder="${Number(hp.value ?? 0)}" inputmode="numeric" pattern="[+-]?[0-9]+" autocomplete="off">
        </label>
        <label>
          <span>${t("Combat.TempHP")}</span>
          <input type="text" name="temp" placeholder="${Number(hp.temp ?? 0)}" inputmode="numeric" pattern="[+-]?[0-9]+" autocomplete="off">
        </label>
        <small>${t("Combat.HPInputHint")}</small>
      </div>
    `;

    const dialog = new DialogV2({
      classes: ["ws-hp-dialog"],
      window: { title: `${t("Combat.EditHP")} · ${actor.name ?? ""}` },
      position: { width: 280, height: "auto" },
      content,
      buttons: [
        {
          action: "savehp",
          label: t("Combat.SaveHP"),
          icon: "fa-solid fa-check",
          default: true,
          callback: async (_event, button) => {
            const trace = beginDiagnostic("hud.hp.save", {
              actor: diagnosticRef(actor, "actor")
            });
            try {
              if (
                disposed ||
                actor.isOwner === false ||
                !(await canEditActor()) ||
                disposed
              ) {
                trace.finish(
                  disposed ? "stale" : "rejected",
                  disposed ? "session-replaced" : "no-permission"
                );
                return ui.notifications.warn(t("Warnings.NoPermission"));
              }
              const fields = button.form.elements;
              const latestHp = adapter.combatStats(actor).hp;
              const next = resolveHpChanges({
                valueInput: fields.namedItem("value")?.value,
                tempInput: fields.namedItem("temp")?.value,
                value: Number(latestHp.value ?? 0),
                temp: Number(latestHp.temp ?? 0),
                max: Number(latestHp.max ?? 0)
              });
              if (!next) {
                trace.finish("rejected", "invalid-input", { valid: false });
                return;
              }
              const { value, temp, damage } = next;
              trace.step("validated", {
                valid: true,
                kind:
                  damage > 0
                    ? "damage"
                    : damage < 0
                      ? "healing"
                      : temp !== Number(latestHp.temp ?? 0)
                        ? "temporary"
                        : "absolute"
              });
              if (
                (damage !== undefined
                  ? damage !== 0
                  : value !== Number(latestHp.value ?? 0)) ||
                temp !== Number(latestHp.temp ?? 0)
              ) {
                if (
                  disposed ||
                  actor.isOwner === false ||
                  !canStartMutation()
                ) {
                  trace.finish(
                    disposed ? "stale" : "rejected",
                    disposed
                      ? "session-replaced"
                      : actor.isOwner === false
                        ? "no-permission"
                        : "mutation-guard"
                  );
                  return;
                }
                await adapter.updateHp(actor, next);
                trace.finish("completed");
              }
            } catch (error) {
              trace.finish("error", "native-error");
              reportFailure("hud.hp.save", error, { t });
              throw error;
            } finally {
              trace.finish(
                disposed ? "stale" : "cancelled",
                disposed ? "session-replaced" : "no-change"
              );
            }
          }
        },
        { action: "close", label: t("Actor.Cancel") }
      ]
    });

    currentDialog = dialog;
    dialog.addEventListener?.(
      "close",
      () => {
        if (currentDialog === dialog) currentDialog = null;
      },
      { once: true }
    );
    return Promise.resolve(dialog.render({ force: true }))
      .then(async result => {
        if (disposed && dialog.rendered) await dialog.close();
        return result;
      })
      .catch(error => {
        if (currentDialog === dialog) currentDialog = null;
        throw error;
      });
  };

  return {
    openHpDialog,
    dispose() {
      disposed = true;
      void Promise.resolve(
        currentDialog?.rendered ? currentDialog.close?.() : undefined
      ).catch(error => reportFailure("hud.hp.close", error, { t }));
      currentDialog = null;
    }
  };
}
