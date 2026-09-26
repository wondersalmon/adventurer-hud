import { resolveHpChanges } from "./hp-input.js";

export function createHpDialogController({
  actor,
  adapter,
  canStartMutation = () => true,
  DialogV2,
  t
}) {
  const openHpDialog = () => {
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
      window: { title: t("Combat.EditHP") },
      position: { width: 280, height: "auto" },
      content,
      buttons: [
        {
          action: "savehp",
          label: t("Combat.SaveHP"),
          icon: "fa-solid fa-check",
          default: true,
          callback: async (_event, button) => {
            const fields = button.form.elements;
            const latestHp = adapter.combatStats(actor).hp;
            const next = resolveHpChanges({
              valueInput: fields.namedItem("value")?.value,
              tempInput: fields.namedItem("temp")?.value,
              value: Number(latestHp.value ?? 0),
              temp: Number(latestHp.temp ?? 0),
              max: Number(latestHp.max ?? 0)
            });
            if (!next) return;
            const { value, temp, damage } = next;
            if (
              (damage !== undefined
                ? damage !== 0
                : value !== Number(latestHp.value ?? 0)) ||
              temp !== Number(latestHp.temp ?? 0)
            ) {
              if (!canStartMutation()) return;
              await adapter.updateHp(actor, next);
            }
          }
        },
        { action: "close", label: t("Actor.Cancel") }
      ]
    });

    return dialog.render({ force: true });
  };

  return { openHpDialog };
}
