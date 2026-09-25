import {
  isFavorite,
  matchesItemSearch,
  usableActivities
} from "./quick-access.js";

export function createCombatItemRenderer({
  actor,
  adapter,
  canRollActor = false,
  escapeHTML,
  hudState,
  t,
  tf,
  visibility
}) {
  const configLabel = config =>
    game.i18n.localize(config?.label ?? config ?? "");

  const itemRange = (item, activityId) => {
    const range = adapter.itemRangeData(item, activityId);
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

  const searchItems = items =>
    visibility.search
      ? items.filter(item =>
          matchesItemSearch(adapter, item, hudState.searchQuery)
        )
      : items;

  const searchControl = () =>
    visibility.search
      ? `<div class="ws-item-search">
          <input type="search" data-action="searchitems" value="${escapeHTML(hudState.searchQuery)}" placeholder="${t("Quick.Search")}" aria-label="${t("Quick.Search")}">
          <button type="button" class="ws-button" data-action="clearsearch" title="${t("Quick.ClearSearch")}" aria-label="${t("Quick.ClearSearch")}"><i class="fa-solid fa-xmark"></i></button>
        </div>`
      : "";

  const combatItemButton = (item, { activityId = null } = {}) => {
    const activities = usableActivities(adapter, item);
    const offersActivities =
      visibility.activityPicker && !activityId && activities.length > 1;
    const favorite = isFavorite(hudState.favoriteEntries, item.id, activityId);
    const role = adapter.itemRole(item);
    const isSpell = role === "spell";
    const isWeapon = role === "weapon";
    const preparation = isSpell ? adapter.spellPreparation?.(item) : null;
    const canPrepare = Boolean(preparation?.canPrepare);
    const hasSideActions =
      canPrepare || (visibility.favorites && !offersActivities);
    const activation = isSpell
      ? adapter.itemActivation?.(item, activityId)
      : "";
    const activationBadge = {
      action: ["A", "Combat.Action"],
      bonus: ["BA", "Combat.BonusAction"],
      reaction: ["R", "Combat.Reaction"]
    }[activation];
    const showsRange = isSpell || isWeapon;
    const concentration =
      visibility.itemDetails &&
      isSpell &&
      adapter.hasItemProperty(item, "concentration");
    const ritual =
      visibility.itemDetails &&
      isSpell &&
      adapter.hasItemProperty(item, "ritual");
    const resourceCost = adapter.itemResourceCost(actor, item, {
      fallbackLabel: t("Combat.Resource"),
      activityId
    });
    const attackBonus = visibility.itemDetails
      ? adapter.itemAttackBonus(item, activityId)
      : "";
    const damageFormula = visibility.itemDetails
      ? adapter.itemDamageFormula(actor, item, activityId)
      : "";
    const saveDc =
      visibility.itemDetails && isSpell
        ? adapter.itemSaveDc?.(item, activityId)
        : "";
    const uses = adapter.itemUsesData(item);
    const unavailableLabel = uses?.value === 0 ? t("Quick.NoCharges") : "";
    const showsDetails = Boolean(
      showsRange ||
      activationBadge ||
      resourceCost ||
      uses ||
      unavailableLabel ||
      (visibility.itemDetails &&
        (concentration || ritual || attackBonus || damageFormula || saveDc))
    );

    return `
        <div class="ws-combat-item-card ${
          showsDetails ? "ws-detailed-card" : ""
        } ${hasSideActions ? "ws-has-side-actions" : ""}">
          <button
            type="button"
            class="ws-combat-item ws-button ${unavailableLabel ? "ws-item-depleted" : ""}"
            data-action="${activityId ? "useactivity" : "useitem"}"
            data-item-id="${escapeHTML(item.id)}"
            ${activityId ? `data-activity-id="${escapeHTML(activityId)}"` : ""}
            title="${escapeHTML(item.name)}"
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(activityId ? `${item.name}: ${activities.find(activity => activity.id === activityId)?.name ?? ""}` : item.name)}</strong>
              ${
                showsDetails
                  ? `
                    <small class="ws-spell-meta">
                      ${activationBadge ? `<b class="ws-activation-badge" title="${t(activationBadge[1])}">${activationBadge[0]}</b>` : ""}
                      ${
                        visibility.itemDetails && attackBonus
                          ? `
                            <span title="${t("Combat.AttackBonus")}">
                              <i class="fa-solid fa-bullseye"></i>
                              ${escapeHTML(attackBonus)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        visibility.itemDetails && saveDc
                          ? `<span title="${t("Combat.SaveDC")}"><i class="fa-solid fa-shield-heart"></i>${t("Combat.SaveDCShort")} ${escapeHTML(saveDc)}</span>`
                          : ""
                      }
                      ${
                        visibility.itemDetails && damageFormula
                          ? `
                            <span title="${t("Combat.DamageFormula")}">
                              <i class="fa-solid fa-burst"></i>
                              ${escapeHTML(damageFormula)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        showsRange
                          ? `
                            <span title="${t("Combat.Range")}">
                              <i class="fa-solid fa-crosshairs"></i>
                              ${itemRange(item, activityId)}
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
                        visibility.itemDetails && concentration
                          ? `<b title="${t("Combat.Concentration")}">${t("Combat.ConcentrationShort")}</b>`
                          : ""
                      }
                      ${
                        visibility.itemDetails && ritual
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
              ${unavailableLabel ? `<small class="ws-item-unavailable"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${unavailableLabel}</small>` : ""}
            </span>

            <i class="fa-solid ${offersActivities ? "fa-chevron-down" : "fa-dice-d20"}"></i>
          </button>

          ${
            hasSideActions
              ? `<div class="ws-item-side-actions">
            ${
              visibility.favorites && !offersActivities
                ? `<button type="button" class="ws-item-favorite ws-button ${favorite ? "ws-active" : ""}" data-action="togglefavorite" data-item-id="${escapeHTML(item.id)}" ${activityId ? `data-activity-id="${escapeHTML(activityId)}"` : ""} title="${t(favorite ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(favorite ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}"><i class="fa-${favorite ? "solid" : "regular"} fa-star"></i></button>`
                : ""
            }
            ${canPrepare ? `<button type="button" class="ws-item-prepare ws-button ${preparation.prepared ? "ws-active" : ""}" data-action="togglespellprepared" data-item-id="${escapeHTML(item.id)}" title="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" aria-label="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" ${actor.isOwner ? "" : "disabled"}><i class="fa-${preparation.prepared ? "solid" : "regular"} fa-bookmark"></i></button>` : ""}
          </div>`
              : ""
          }

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
          ${
            offersActivities && hudState.openActivityItemId === item.id
              ? `<div class="ws-activity-menu" role="group" aria-label="${t("Quick.ChooseActivity")}">
                  ${activities
                    .map(activity => {
                      const selected = isFavorite(
                        hudState.favoriteEntries,
                        item.id,
                        activity.id
                      );
                      return `<div class="ws-activity-option">
                        <button type="button" class="ws-button" data-action="useactivity" data-item-id="${escapeHTML(item.id)}" data-activity-id="${escapeHTML(activity.id)}">${escapeHTML(activity.name ?? item.name)}</button>
                        ${visibility.favorites ? `<button type="button" class="ws-button ws-item-favorite ${selected ? "ws-active" : ""}" data-action="togglefavorite" data-item-id="${escapeHTML(item.id)}" data-activity-id="${escapeHTML(activity.id)}" title="${t(selected ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(selected ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}"><i class="fa-${selected ? "solid" : "regular"} fa-star"></i></button>` : ""}
                      </div>`;
                    })
                    .join("")}
                </div>`
              : ""
          }
        </div>
      `;
  };

  const favoriteSection = () => {
    if (!visibility.favorites) return "";
    const entries = hudState.favoriteEntries
      .map(entry => ({ ...entry, item: actor.items.get(entry.itemId) }))
      .filter(
        entry =>
          entry.item &&
          (!entry.activityId ||
            usableActivities(adapter, entry.item).some(
              activity => activity.id === entry.activityId
            ))
      );
    if (!entries.length) return "";
    return `<section class="ws-favorites">
      <button type="button" class="ws-section-toggle ws-button" data-action="togglefavorites"
        aria-expanded="${hudState.favoritesExpanded}">
        <span><i class="fa-solid fa-star"></i> ${t("Quick.Favorites")} · ${entries.length}</span>
        <i class="fa-solid fa-chevron-${hudState.favoritesExpanded ? "up" : "down"}"></i>
      </button>
      ${hudState.favoritesExpanded ? `<div class="ws-combat-item-grid">${entries.map(({ item, activityId }) => combatItemButton(item, { activityId })).join("")}</div>` : ""}
    </section>`;
  };

  const combatCategories = () => {
    const visible = [
      ["weapons", "fa-swords", "Combat.Weapons", visibility.combatWeapons],
      [
        "spells",
        "fa-wand-magic-sparkles",
        "Combat.Spells",
        visibility.combatSpells
      ],
      [
        "action",
        "fa-circle-play",
        "Combat.Action",
        visibility.showActionTypes && visibility.combatActions
      ],
      [
        "bonus",
        "fa-bolt",
        "Combat.BonusAction",
        visibility.showActionTypes && visibility.combatBonusActions
      ],
      [
        "reaction",
        "fa-shield",
        "Combat.Reaction",
        visibility.showActionTypes && visibility.combatReactions
      ],
      [
        "special",
        "fa-star",
        "Combat.Special",
        visibility.showActionTypes && visibility.combatSpecial
      ]
    ].filter(([, , , enabled]) => enabled);
    if (!visible.length) return [];
    const indexed = adapter.combatItemsByCategory?.(
      actor,
      visible.map(([category]) => category)
    );
    return visible
      .map(([category, icon, label]) => [
        category,
        icon,
        label,
        indexed ? (indexed.get(category) ?? []) : combatItems(category)
      ])
      .filter(([, , , items]) => items.length > 0);
  };

  const categoryButton = ([category, icon, label, items]) => `
    <button type="button" class="ws-combat-filter ws-button ${hudState.combatCategory === category ? "ws-active" : ""}"
      data-action="combatfilter" data-category="${category}" title="${t(label)}" aria-expanded="${hudState.combatCategory === category}">
      <i class="fa-solid ${icon}"></i><span>${t(label)}</span><small>${items.length}</small>
    </button>`;

  const spellSlots = level => {
    if (level <= 0) {
      return `<span>${t("Combat.Cantrip")}</span>`;
    }

    const pools = adapter.spellSlots(actor, level);

    if (!pools.length) {
      return `<span>${t("Combat.NoSlots")}</span>`;
    }

    return pools
      .map(([value, max, pool]) => {
        const dots =
          max <= 10
            ? Array.from(
                { length: max },
                (_, index) =>
                  `<i class="ws-slot ${index < value ? "ws-slot-filled" : ""}"></i>`
              ).join("")
            : "";

        const label = t(
          pool === "pact" ? "Combat.PactSlots" : "Combat.SpellSlots"
        );
        const kind = `<span class="ws-slot-kind" aria-hidden="true">${t(pool === "pact" ? "Combat.PactSlotsShort" : "Combat.SpellSlotsShort")}</span>`;
        const poolClass = pool === "pact" ? "ws-pact-slots" : "";
        if (!pool || !canRollActor) {
          return `<span class="ws-spell-slots ${poolClass}" title="${label}: ${value}/${max}">${kind}${dots}<b>${value}/${max}</b></span>`;
        }

        return `<button type="button" class="ws-spell-slots ws-spell-slots-edit ws-button ${poolClass}"
          data-action="openspellslots" data-level="${level}" data-pool="${escapeHTML(pool)}"
          title="${t("Combat.EditSpellSlots")}: ${label} ${value}/${max}"
          aria-label="${t("Combat.EditSpellSlots")}: ${label} ${value}/${max}">
          ${kind}${dots}<b>${value}/${max}</b>
        </button>`;
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

    const selectedCategory = categories.find(
      ([category]) => category === hudState.combatCategory
    );
    if (hudState.combatCategory && !selectedCategory) {
      hudState.combatCategory = null;
    }
    const items = selectedCategory ? searchItems(selectedCategory[3]) : [];
    const primary = categories.filter(
      ([category]) => category === "weapons" || category === "spells"
    );
    const actionTypes = categories.filter(
      ([category]) => category !== "weapons" && category !== "spells"
    );
    const selectedAction = actionTypes.find(
      ([category]) => category === hudState.combatCategory
    );

    return `
        <div class="ws-combat-actions">
          <div class="ws-combat-filters">
            ${primary.map(categoryButton).join("")}
            ${
              actionTypes.length
                ? `
              <button type="button" class="ws-combat-filter ws-button ${selectedAction ? "ws-active" : ""}"
                data-action="toggleactionmenu" aria-expanded="${hudState.actionMenuOpen}">
                <i class="fa-solid ${selectedAction?.[1] ?? "fa-circle-play"}"></i>
                <span>${selectedAction ? t(selectedAction[2]) : t("Combat.ActionTypes")}</span>
                <small><i class="fa-solid fa-chevron-down"></i></small>
              </button>`
                : ""
            }
          </div>
          ${hudState.actionMenuOpen && actionTypes.length ? `<div class="ws-action-menu">${actionTypes.map(categoryButton).join("")}</div>` : ""}

          ${hudState.combatCategory ? searchControl() : ""}

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

          ${
            hudState.combatCategory
              ? `<div class="ws-combat-item-list">
            ${
              items.length
                ? hudState.combatCategory === "spells"
                  ? spellGroups(items) ||
                    `<div class="ws-empty">${t("Combat.EmptyPrepared")}</div>`
                  : `<div class="ws-combat-item-grid">${items.map(combatItemButton).join("")}</div>`
                : `<div class="ws-empty">${t(hudState.searchQuery ? "Quick.NoResults" : "Combat.Empty")}</div>`
            }
          </div>`
              : ""
          }
        </div>
      `;
  };

  return {
    combatActions,
    combatItemButton,
    combatItems,
    favoriteSection,
    inventoryCategories,
    inventoryItems,
    searchControl,
    searchItems,
    spellGroups
  };
}
