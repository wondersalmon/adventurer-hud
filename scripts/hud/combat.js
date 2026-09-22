import { createCombatResourceController } from "./combat-resources.js";

export function createCombatRenderer(context) {
  const {
    actor,
    actorHeader,
    adapter,
    abilityChecksSection,
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

  const { changeResource, combatResources, openHpDialog, openResourceDialog } =
    createCombatResourceController({
      actor,
      adapter,
      DialogV2,
      escapeHTML,
      hudState,
      t,
      tf,
      visibility
    });

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
            visibility.abilityChecks
              ? `
                <div class="ws-divider"></div>
                <div class="ws-ability-table">
                  ${abilityChecksSection("combat")}
                </div>
              `
              : ""
          }

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
