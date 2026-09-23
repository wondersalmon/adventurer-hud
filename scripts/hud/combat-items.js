export function createCombatItemRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  t,
  visibility
}) {
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

  return {
    combatActions,
    combatItemButton,
    combatItems,
    inventoryCategories,
    inventoryItems,
    spellGroups
  };
}
