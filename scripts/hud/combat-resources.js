import { calculateResourceValue } from "../runtime-helpers.js";
import { resolveHpChanges } from "./hp-input.js";

export function createCombatResourceController({
  actor,
  adapter,
  DialogV2,
  escapeHTML,
  hudState,
  t,
  tf,
  visibility
}) {
  const combatResources = () => {
    if (!visibility.combatResources) return "";

    const actorResources = adapter.actorResources(actor);
    const featureResources = adapter.featureResources(actor);
    const resources = [...actorResources, ...featureResources];

    if (!resources.length) return "";

    return `
      <div class="ws-combat-resources ${hudState.resourcesExpanded ? "ws-expanded" : ""}">
        <button type="button" class="ws-resources-toggle ws-button" data-action="toggleresources" aria-expanded="${hudState.resourcesExpanded}">
          <span><i class="fa-solid fa-battery-three-quarters"></i>${t("Combat.ClassResources")}</span>
          <span>${resources.length}<i class="fa-solid fa-chevron-${hudState.resourcesExpanded ? "up" : "down"}"></i></span>
        </button>
        ${
          hudState.resourcesExpanded
            ? `<div class="ws-resource-grid">
          ${resources
            .map(
              resource => `
              <button
                type="button"
                class="ws-combat-stat ws-resource-link ws-button"
                data-action="openresource"
                ${resource.itemId ? `data-item-id="${escapeHTML(resource.itemId)}"` : `data-resource-id="${escapeHTML(resource.id)}"`}
                title="${t("Combat.ManageResource")}"
              >
                <span>${escapeHTML(resource.label)}</span>
                <strong>${resource.value} / ${resource.max || "—"}</strong>
              </button>
            `
            )
            .join("")}
        </div>`
            : ""
        }
        ${
          hudState.resourcesExpanded
            ? `<div class="ws-resource-shortcuts ws-shortcuts">
                <span><kbd>${t("Combat.ResourceConsumeKeys")}</kbd> ${t("Combat.ResourceConsumeOne")}</span>
                <span><kbd>${t("Combat.ResourceRestoreKeys")}</kbd> ${t("Combat.ResourceRestoreOne")}</span>
              </div>`
            : ""
        }
      </div>
    `;
  };

  const changeResource = async ({
    amount = 1,
    direction,
    item = null,
    resourceId = null
  }) => {
    const { current, max } = adapter.resourceData(actor, { item, resourceId });
    const nextValue = calculateResourceValue({
      amount,
      current,
      direction,
      max
    });

    if (nextValue === null || nextValue === current) return false;

    await adapter.updateResource(actor, {
      item,
      resourceId,
      value: nextValue,
      max
    });
    return true;
  };

  const openResourceDialog = ({ item = null, resourceId = null } = {}) => {
    const { actorResource, current, max } = adapter.resourceData(actor, {
      item,
      resourceId
    });
    const content = document.createElement("div");
    content.innerHTML = `
      <div class="ws-resource-dialog-content">
        <p>${escapeHTML(item?.name ?? actorResource?.label ?? resourceId)}</p>
        <label>
          <span>${t("Combat.ResourceAmount")}</span>
          <input type="number" name="amount" value="1" min="1" max="${Math.max(1, current, max)}" step="1">
        </label>
        <small>${tf("Combat.ResourceRemaining", { current, max })}</small>
        <div class="ws-resource-dialog-actions">
          <button type="button" data-action="changeresource" data-direction="consume" ${current <= 0 ? "disabled" : ""}>
            <i class="fa-solid fa-minus"></i>${t("Combat.Consume")}
          </button>
          <button type="button" data-action="changeresource" data-direction="restore" ${max <= 0 || current >= max ? "disabled" : ""}>
            <i class="fa-solid fa-plus"></i>${t("Combat.Restore")}
          </button>
          <button type="button" data-action="changeresource" data-direction="restoreAll" ${max <= 0 || current >= max ? "disabled" : ""}>
            <i class="fa-solid fa-angles-up"></i>${t("Combat.RestoreAll")}
          </button>
        </div>
      </div>
    `;

    const dialog = new DialogV2({
      classes: ["ws-resource-dialog"],
      window: { title: t("Combat.ManageResource") },
      position: { width: 320, height: "auto" },
      content,
      actions: {
        changeresource: async function (_event, target) {
          const input = dialog.element.querySelector('[name="amount"]');
          const changed = await changeResource({
            amount: input?.value,
            direction: target.dataset.direction,
            item,
            resourceId
          });
          if (changed) await dialog.close();
        }
      },
      buttons: [{ action: "close", label: t("Actor.Cancel") }]
    });

    return dialog.render({ force: true });
  };

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
            const { value, temp } = next;
            if (
              value !== Number(latestHp.value ?? 0) ||
              temp !== Number(latestHp.temp ?? 0)
            ) {
              await adapter.updateHp(actor, { value, temp });
            }
          }
        },
        { action: "close", label: t("Actor.Cancel") }
      ]
    });

    return dialog.render({ force: true });
  };

  const openSpellSlotsDialog = ({ level, pool }) => {
    const currentPool = () =>
      adapter.spellSlots(actor, level).find(([, , key]) => key === pool);
    const slots = currentPool();
    if (!slots) return;

    const [value, max] = slots;
    const label =
      adapter.spellSlotKind?.(pool) === "pact"
        ? t("Combat.PactSlots")
        : `${t("Combat.SpellSlots")} · ${tf("Combat.SpellLevel", { level })}`;
    const content = document.createElement("div");
    content.innerHTML = `<div class="ws-spell-slots-dialog-content">
      <label><span>${label} (0–${max})</span>
        <input type="number" name="value" min="0" max="${max}" step="1" value="${value}" required>
      </label>
    </div>`;

    const dialog = new DialogV2({
      classes: ["ws-spell-slots-dialog"],
      window: { title: t("Combat.EditSpellSlots") },
      position: { width: 280, height: "auto" },
      content,
      buttons: [
        {
          action: "saveslots",
          label: t("Combat.SaveSlots"),
          icon: "fa-solid fa-check",
          default: true,
          callback: async (_event, button) => {
            const input = button.form.elements.namedItem("value")?.value;
            const next = Number(input);
            if (input === "" || !Number.isInteger(next)) return;
            const latest = currentPool();
            if (!latest) return;
            await adapter.updateSpellSlots(actor, {
              pool,
              value: Math.min(latest[1], Math.max(0, next))
            });
          }
        },
        { action: "close", label: t("Actor.Cancel") }
      ]
    });

    return dialog.render({ force: true });
  };

  return {
    changeResource,
    combatResources,
    openHpDialog,
    openResourceDialog,
    openSpellSlotsDialog
  };
}
