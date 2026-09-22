import { calculateResourceValue } from "../runtime-helpers.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    canRollActor,
    DialogV2,
    escapeHTML,
    formatMod,
    getCombatant,
    hudState,
    inspirationControl,
    modeNavigation,
    savingThrowsSection,
    shortcutHint,
    t,
    tf,
    visibility
  } = context;

  const configLabel = config =>
    game.i18n.localize(config?.label ?? config ?? "");

  const activationLabel = item => {
    const type = adapter.itemActivation(item);
    const common = {
      action: "Combat.Action",
      bonus: "Combat.BonusAction",
      reaction: "Combat.Reaction",
      special: "Combat.Special"
    }[type];

    if (common) {
      return t(common);
    }

    return adapter.activationLabel(type, { localizeConfig: configLabel });
  };

  const itemRange = item => {
    const range = adapter.itemRangeData(item);
    const value = range.value === 0 ? 0 : range.value || "";
    const { long, units } = range;
    const unit = adapter.rangeUnitLabel(units, {
      localizeConfig: configLabel
    });

    if (range.special) {
      return escapeHTML(range.special);
    }

    if (!value && !unit) {
      return t("Combat.RangeUnknown");
    }

    const distance = long ? `${value}/${long}` : value;

    return escapeHTML([distance, unit].filter(part => part !== "").join(" "));
  };

  const combatItems = category => adapter.combatItems(actor, category);

  const inventoryCategories = () => [
    ["equipped", "fa-shield-halved", "Inventory.Equipped"],
    ["consumables", "fa-flask", "Inventory.Consumables"],
    ["other", "fa-box-open", "Inventory.Other"]
  ];

  const inventoryItems = category =>
    actor.items.filter(item => adapter.inventoryCategory(item) === category);

  const combatItemButton = item => {
    const role = adapter.itemRole(item);
    const isSpell = role === "spell";
    const isWeapon = role === "weapon";
    const showsRange = isSpell || isWeapon;
    const concentration =
      isSpell && adapter.hasItemProperty(item, "concentration");
    const ritual = isSpell && adapter.hasItemProperty(item, "ritual");
    const activation = adapter.itemActivation(item);
    const resourceCost = adapter.itemResourceCost(actor, item, {
      fallbackLabel: t("Combat.Resource")
    });
    const attackBonus =
      isSpell || isWeapon ? adapter.itemAttackBonus(item) : "";
    const damageFormula =
      isSpell || isWeapon ? adapter.itemDamageFormula(actor, item) : "";
    const uses = adapter.itemUsesData(item);
    const showsDetails =
      visibility.itemDetails &&
      (showsRange ||
        activation ||
        concentration ||
        ritual ||
        resourceCost ||
        attackBonus ||
        damageFormula ||
        uses);

    return `
        <div class="ws-combat-item-card ${
          showsDetails ? "ws-detailed-card" : ""
        }">
          <button
            type="button"
            class="ws-combat-item ws-button"
            data-action="useitem"
            data-item-id="${escapeHTML(item.id)}"
            title="${escapeHTML(item.name)}"
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(item.name)}</strong>
              ${
                showsDetails
                  ? `
                    <small class="ws-spell-meta">
                      ${
                        showsRange
                          ? `
                            <span title="${t("Combat.Range")}">
                              <i class="fa-solid fa-crosshairs"></i>
                              ${itemRange(item)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        activation
                          ? `
                            <span title="${t("Combat.Activation")}">
                              <i class="fa-solid fa-hourglass-half"></i>
                              ${escapeHTML(activationLabel(item))}
                            </span>
                          `
                          : ""
                      }
                      ${
                        attackBonus
                          ? `
                            <span title="${t("Combat.AttackBonus")}">
                              <i class="fa-solid fa-bullseye"></i>
                              ${escapeHTML(attackBonus)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        damageFormula
                          ? `
                            <span title="${t("Combat.DamageFormula")}">
                              <i class="fa-solid fa-burst"></i>
                              ${escapeHTML(damageFormula)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        uses
                          ? `
                            <span title="${t("Inventory.Charges")}">
                              <i class="fa-solid fa-battery-half"></i>
                              ${uses.value}/${uses.max}
                            </span>
                          `
                          : ""
                      }
                      ${
                        concentration
                          ? `<b title="${t("Combat.Concentration")}">${t("Combat.ConcentrationShort")}</b>`
                          : ""
                      }
                      ${
                        ritual
                          ? `<b title="${t("Combat.Ritual")}">${t("Combat.RitualShort")}</b>`
                          : ""
                      }
                      ${
                        resourceCost
                          ? `<b title="${t("Combat.ResourceCost")}"><i class="fa-solid fa-battery-half"></i> ${escapeHTML(resourceCost)}</b>`
                          : ""
                      }
                    </small>
                  `
                  : ""
              }
            </span>

            <i class="fa-solid fa-dice-d20"></i>
          </button>

          <button
            type="button"
            class="ws-item-description ws-button"
            data-action="openitem"
            data-item-id="${escapeHTML(item.id)}"
            title="${t("Combat.OpenDescription")}"
            aria-label="${t("Combat.OpenDescription")}: ${escapeHTML(item.name)}"
          >
            <i class="fa-solid fa-book-open"></i>
          </button>
        </div>
      `;
  };

  const combatCategories = () =>
    [
      ["weapons", "fa-swords", "Combat.Weapons", visibility.combatWeapons],
      [
        "spells",
        "fa-wand-magic-sparkles",
        "Combat.Spells",
        visibility.combatSpells
      ],
      ["action", "fa-circle-play", "Combat.Action", visibility.combatActions],
      ["bonus", "fa-bolt", "Combat.BonusAction", visibility.combatBonusActions],
      ["reaction", "fa-shield", "Combat.Reaction", visibility.combatReactions],
      ["special", "fa-star", "Combat.Special", visibility.combatSpecial]
    ].filter(([, , , visible]) => visible);

  const spellSlots = level => {
    if (level <= 0) {
      return `<span>${t("Combat.Cantrip")}</span>`;
    }

    const pools = adapter.spellSlots(actor, level);

    if (!pools.length) {
      return `<span>${t("Combat.NoSlots")}</span>`;
    }

    return pools
      .map(([value, max]) => {
        const dots =
          max <= 10
            ? Array.from(
                { length: max },
                (_, index) =>
                  `<i class="ws-slot ${index < value ? "ws-slot-filled" : ""}"></i>`
              ).join("")
            : "";

        return `
            <span class="ws-spell-slots" title="${value}/${max}">
              ${dots}<b>${value}/${max}</b>
            </span>
          `;
      })
      .join("");
  };

  const spellGroups = items => {
    const filtered = hudState.preparedSpellsOnly
      ? items.filter(item => adapter.isPreparedSpell(item))
      : items;
    const levels = new Map();

    for (const item of filtered) {
      const level = adapter.spellLevel(item);
      const spells = levels.get(level) ?? [];
      spells.push(item);
      levels.set(level, spells);
    }

    return [...levels.entries()]
      .sort(([a], [b]) => a - b)
      .map(
        ([level, spells]) => `
            <section class="ws-spell-level">
              <div class="ws-spell-level-heading">
                <strong>${
                  level === 0
                    ? t("Combat.Cantrips")
                    : tf("Combat.SpellLevel", { level })
                }</strong>
                ${spellSlots(level)}
              </div>
              <div class="ws-combat-item-grid">
                ${spells.map(combatItemButton).join("")}
              </div>
            </section>
          `
      )
      .join("");
  };

  const combatActions = () => {
    const categories = combatCategories();

    if (!categories.length) {
      return "";
    }

    if (
      !categories.some(([category]) => category === hudState.combatCategory)
    ) {
      hudState.combatCategory = categories[0][0];
    }

    const items = combatItems(hudState.combatCategory);

    return `
        <div class="ws-combat-actions">
          <div class="ws-combat-filters">
            ${categories
              .map(
                ([category, icon, label]) => `
                  <button
                    type="button"
                    class="ws-combat-filter ws-button ${
                      hudState.combatCategory === category ? "ws-active" : ""
                    }"
                    data-action="combatfilter"
                    data-category="${category}"
                    title="${t(label)}"
                  >
                    <i class="fa-solid ${icon}"></i>
                    <span>${t(label)}</span>
                    <small>${combatItems(category).length}</small>
                  </button>
                `
              )
              .join("")}
          </div>

          ${
            hudState.combatCategory === "spells"
              ? `
                <div class="ws-spell-filter" role="group" aria-label="${t("Combat.SpellFilter")}">
                  <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "ws-active" : ""}" data-action="spellfilter" data-prepared="true">
                    ${t("Combat.Prepared")}
                  </button>
                  <button type="button" class="ws-button ${hudState.preparedSpellsOnly ? "" : "ws-active"}" data-action="spellfilter" data-prepared="false">
                    ${t("Combat.AllSpells")}
                  </button>
                </div>
              `
              : ""
          }

          <div class="ws-combat-item-list">
            ${
              items.length
                ? hudState.combatCategory === "spells"
                  ? spellGroups(items) ||
                    `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
                  : `<div class="ws-combat-item-grid">${items.map(combatItemButton).join("")}</div>`
                : `<div class="ws-empty">${t("Combat.Empty")}</div>`
            }
          </div>
        </div>
      `;
  };

  const configuredStatuses = () => {
    const statuses = Array.isArray(CONFIG.statusEffects)
      ? CONFIG.statusEffects
      : [...(CONFIG.statusEffects?.values?.() ?? [])];
    return statuses.filter(status => status?.id);
  };

  const activeStatuses = () => {
    const configured = configuredStatuses();
    const byId = new Map(configured.map(status => [status.id, status]));
    const statuses = new Map();

    for (const id of actor.statuses ?? []) {
      const status = byId.get(id) ?? { id, name: id };
      statuses.set(id, { ...status, statusId: id });
    }

    for (const effect of actor.effects ?? []) {
      const effectStatuses = [...(effect.statuses ?? [])];

      if (effect.disabled || !effectStatuses.length) {
        continue;
      }

      for (const id of effectStatuses) {
        const configuredStatus = byId.get(id) ?? {};
        statuses.set(id, {
          ...configuredStatus,
          id,
          statusId: id,
          effectId: effect.id,
          name: configuredStatus.name ?? configuredStatus.label ?? effect.name,
          img:
            configuredStatus.img ??
            configuredStatus.icon ??
            effect.img ??
            effect.icon
        });
      }
    }

    return [...statuses.values()];
  };

  const combatStatuses = () => {
    if (!visibility.conditions) {
      return "";
    }

    const statuses = activeStatuses();
    const statusLabel = status =>
      game.i18n.localize(status.name ?? status.label ?? status.id);
    const statusIcon = status =>
      status.img ?? status.icon ?? "icons/svg/aura.svg";

    if (!statuses.length) {
      return "";
    }

    return `
        <div class="ws-combat-statuses">
          <div class="ws-active-conditions">
            ${statuses
              .map(status => {
                const label = statusLabel(status);

                return `
                  <button
                    type="button"
                    class="ws-status ws-button"
                    data-action="removestatus"
                    data-status-id="${escapeHTML(status.id)}"
                    ${status.effectId ? `data-effect-id="${escapeHTML(status.effectId)}"` : ""}
                    title="${escapeHTML(
                      tf("Combat.RemoveCondition", { condition: label })
                    )}"
                    ${canRollActor ? "" : "disabled"}
                  >
                    <img src="${escapeHTML(statusIcon(status))}" alt="">
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
  };

  const combatInitiative = () => {
    const combatant = getCombatant();

    if (!visibility.initiative || !combatant) {
      return "";
    }

    const rolled = combatant.initiative != null;

    return `
        <button
          type="button"
          class="ws-header-initiative ws-button ${rolled ? "" : "ws-unrolled"}"
          data-action="initiative"
          title="${rolled ? t("Initiative.Rolled") : t("Initiative.Roll")}"
          ${rolled || !canRollActor ? "disabled" : ""}
        >
          <span>${t("Labels.Initiative")}</span>
          <strong>${rolled ? combatant.initiative : "—"}</strong>
        </button>
      `;
  };

  const combatResources = () => {
    if (!visibility.combatResources) {
      return "";
    }

    const actorResources = adapter.actorResources(actor);
    const featureResources = adapter.featureResources(actor);

    const actorLabels = new Set(
      actorResources.map(resource =>
        String(resource.label).trim().toLocaleLowerCase()
      )
    );
    const resources = [
      ...actorResources,
      ...featureResources.filter(
        resource =>
          !actorLabels.has(String(resource.label).trim().toLocaleLowerCase())
      )
    ];

    if (!resources.length) {
      return "";
    }

    return `
        <div class="ws-combat-resources ${hudState.resourcesExpanded ? "ws-expanded" : ""}">
          <button type="button" class="ws-resources-toggle ws-button" data-action="toggleresources" aria-expanded="${hudState.resourcesExpanded}">
            <span><i class="fa-solid fa-battery-three-quarters"></i>${t("Combat.ClassResources")}</span>
            <span>${resources.length}<i class="fa-solid fa-chevron-${hudState.resourcesExpanded ? "up" : "down"}"></i></span>
          </button>
          <div class="ws-resource-grid">
            ${resources
              .map(
                resource => `
                <button
                  type="button"
                  class="ws-combat-stat ws-resource-link ws-button"
                  data-action="openresource"
                  ${resource.itemId ? `data-item-id="${resource.itemId}"` : `data-resource-id="${escapeHTML(resource.id)}"`}
                  title="${t("Combat.ManageResource")}"
                >
                  <span>${escapeHTML(resource.label)}</span>
                  <strong>${resource.value} / ${resource.max || "—"}</strong>
                </button>
              `
              )
              .join("")}
          </div>
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
    const { current, max } = adapter.resourceData(actor, {
      item,
      resourceId
    });
    const nextValue = calculateResourceValue({
      amount,
      current,
      direction,
      max
    });

    if (nextValue === null || nextValue === current) {
      return false;
    }

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
          const direction = target.dataset.direction;
          const changed = await changeResource({
            amount: input?.value,
            direction,
            item,
            resourceId
          });

          if (!changed) {
            return;
          }

          await dialog.close();
        }
      },
      buttons: [
        {
          action: "close",
          label: t("Actor.Cancel")
        }
      ]
    });

    return dialog.render({ force: true });
  };

  const openHpDialog = field => {
    const hp = adapter.combatStats(actor).hp;
    const isTemp = field === "temp";
    const current = Number(hp[field] ?? 0);
    const content = document.createElement("div");
    content.innerHTML = `
        <div class="ws-hp-dialog-content">
          <label>
            <span>${t(isTemp ? "Combat.TempHP" : "Combat.HP")}</span>
            <input type="number" name="value" value="${current}" min="0" step="1">
          </label>
          <button type="button" data-action="savehp">
            <i class="fa-solid fa-check"></i>${t("Combat.SaveHP")}
          </button>
        </div>
      `;

    const dialog = new DialogV2({
      classes: ["ws-hp-dialog"],
      window: {
        title: t(isTemp ? "Combat.EditTempHP" : "Combat.EditHP")
      },
      position: { width: 280, height: "auto" },
      content,
      actions: {
        savehp: async function () {
          const input = dialog.element.querySelector('[name="value"]');
          let value = Math.max(0, Number(input?.value ?? current) || 0);

          if (!isTemp) {
            value = Math.min(value, Math.max(0, Number(hp.max ?? 0)));
          }

          await adapter.updateHp(actor, field, value);
          await dialog.close();
        }
      },
      buttons: [
        {
          action: "close",
          label: t("Actor.Cancel")
        }
      ]
    });

    return dialog.render({ force: true });
  };

  function combatHTML() {
    const combatant = getCombatant();
    const { ac, hp, speed, speedUnits: units } = adapter.combatStats(actor);
    const isTurn = game.combat?.combatant?.id === combatant?.id;

    return `
        <div
          id="ws-combat"
          class="ws-view ws-combat-view"
        >
          ${actorHeader(`${combatInitiative()}${inspirationControl()}`)}

          ${modeNavigation("combat")}

          <div class="ws-combat-heading ${visibility.modeHeadings ? "" : "ws-hidden"}">
            <span>
              <i class="fa-solid fa-shield-halved"></i>
              ${t("Labels.Combat")}
            </span>

            ${isTurn ? `<b>${t("Combat.YourTurn")}</b>` : ""}
          </div>

          <div class="ws-combat-stats ${visibility.combatStats ? "" : "ws-hidden"}">
            <button
              type="button"
              class="ws-combat-stat ws-combat-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="value"
              title="${t("Combat.EditHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.HP")}</span>
              <strong>
                ${Number(hp.value ?? 0)} / ${Number(hp.max ?? 0)}
              </strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            <button
              type="button"
              class="ws-combat-stat ws-combat-temp-hp ws-editable-stat ws-button"
              data-action="edithp"
              data-hp-field="temp"
              title="${t("Combat.EditTempHP")}"
              ${canRollActor ? "" : "disabled"}
            >
              <span>${t("Combat.TempHP")}</span>
              <strong>${Number(hp.temp ?? 0)}</strong>
              <i class="fa-solid fa-pen"></i>
            </button>

            ${
              Number(hp.tempmax ?? 0) !== 0
                ? `
                  <div class="ws-combat-stat ws-combat-temp-max">
                    <span>${t("Combat.TempMax")}</span>
                    <strong>${formatMod(hp.tempmax)}</strong>
                  </div>
                `
                : ""
            }

            <div class="ws-combat-stat">
              <span>${t("Combat.AC")}</span>
              <strong>${ac}</strong>
            </div>

            <div class="ws-combat-stat">
              <span>${t("Combat.Speed")}</span>
              <strong>${speed}${units ? ` ${escapeHTML(units)}` : ""}</strong>
            </div>

          </div>

          ${combatResources()}

          ${combatStatuses()}

          ${
            visibility.savingThrows
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${savingThrowsSection("combat")}
                </div>
              `
              : ""
          }

          ${combatActions()}

          ${shortcutHint()}
        </div>
      `;
  }

  return {
    changeResource,
    combatActions,
    combatHTML,
    combatInitiative,
    combatItemButton,
    combatItems,
    combatStatuses,
    inventoryCategories,
    inventoryItems,
    openHpDialog,
    openResourceDialog,
    spellGroups
  };
}
