import {
  recordDiagnostic,
  diagnosticRef,
  diagnosticsRecording
} from "../../diagnostics.js";
import {
  isFavorite,
  itemAvailability,
  usableActivities
} from "./quick-access.js";

export function createCombatItemCardRenderer({
  actor,
  adapter,
  escapeHTML,
  hudState,
  t,
  visibility,
  recordCards = true
}) {
  let usageTargets = null;
  let indexedRender = false;
  // The index lives only for a synchronous render, never across document changes.
  const withUsageTargets = render => {
    const previous = usageTargets;
    const previousIndexed = indexedRender;
    usageTargets = null;
    indexedRender = true;
    try {
      return render();
    } finally {
      usageTargets = previous;
      indexedRender = previousIndexed;
    }
  };
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

  const combatItemButton = (
    item,
    {
      activityId = null,
      inFavorites = false,
      activityOption = false,
      inventory = false
    } = {}
  ) => {
    if (
      indexedRender &&
      !usageTargets &&
      !activityId &&
      item.type === "spell"
    ) {
      usageTargets = adapter.itemUsageTargets?.(actor) ?? null;
    }
    const usage = !activityId
      ? adapter.itemUsageTarget?.(actor, item, usageTargets)
      : null;
    const usageItem = usage?.item ?? item;
    const usageActivityId = usage?.activityId ?? activityId;
    const detailsItem = usage?.detailsItem ?? item;
    const activities = usableActivities(adapter, item);
    const offersActivities =
      visibility.activityPicker && !usageActivityId && activities.length > 1;
    const detailActivities = adapter.itemActivities(detailsItem);
    // An unresolved parent or removed Activity has no unambiguous per-action details.
    const hideActivityDetails = activityId
      ? !detailActivities.some(activity => activity.id === activityId)
      : !usageActivityId && detailActivities.length > 1;
    const favorite = isFavorite(hudState.favoriteEntries, item.id, activityId);
    const role = adapter.itemRole(item);
    const passive =
      item.type === "feat" && !adapter.itemActivities(item).length;
    const isSpell = role === "spell";
    const isWeapon = role === "weapon";
    const detailFields = visibility.cardDetailFields;
    const showDetail = (key, legacy) =>
      Array.isArray(detailFields) ? detailFields.includes(key) : legacy;
    const preparation = isSpell ? adapter.spellPreparation?.(item) : null;
    const unpreparedFavorite =
      inFavorites && preparation?.canPrepare && !preparation.prepared;
    const canPrepare = !inFavorites && Boolean(preparation?.canPrepare);
    const showFavorite = visibility.favorites;
    const activityName = activityId
      ? adapter
          .itemActivities(item)
          .find(activity => activity.id === activityId)?.name
      : null;
    const name =
      activityId && activityName ? `${item.name}: ${activityName}` : item.name;
    const activation =
      !hideActivityDetails && showDetail("activation", isSpell)
        ? adapter.itemActivation?.(detailsItem, activityId)
        : "";
    const activationBadge = {
      action: ["A", "Combat.Action"],
      bonus: ["BA", "Combat.BonusAction"],
      reaction: ["R", "Combat.Reaction"]
    }[activation];
    const activityRange = activityId
      ? adapter.itemRangeData?.(detailsItem, activityId)
      : null;
    const hasActivityRange =
      activityRange &&
      [
        activityRange.value,
        activityRange.long,
        activityRange.units,
        activityRange.special
      ].some(value => value !== undefined && value !== null && value !== "");
    const showsRange =
      !hideActivityDetails &&
      showDetail("range", isSpell || isWeapon) &&
      (isSpell || isWeapon || hasActivityRange);
    const concentration =
      showDetail("concentration", visibility.itemDetails) &&
      isSpell &&
      adapter.hasItemProperty(detailsItem, "concentration");
    const ritual =
      showDetail("ritual", visibility.itemDetails) &&
      isSpell &&
      adapter.hasItemProperty(detailsItem, "ritual");
    const showAttackDetails =
      !hideActivityDetails &&
      showDetail("attack", visibility.attackDetails ?? visibility.itemDetails);
    const attackBonus = showAttackDetails
      ? adapter.itemAttackBonus(detailsItem, activityId)
      : "";
    const mastery =
      showDetail("mastery", !visibility.gm && visibility.itemDetails) &&
      isWeapon
        ? adapter.weaponMastery?.(actor, detailsItem)
        : null;
    const damageFormula =
      !hideActivityDetails && showDetail("damage", visibility.itemDetails)
        ? adapter.itemDamageFormula(actor, detailsItem, activityId)
        : "";
    const saveDc = showAttackDetails
      ? adapter.itemSaveDc?.(detailsItem, activityId)
      : "";
    const attackDetails = showAttackDetails
      ? (adapter.itemAttackDetails?.(detailsItem, activityId) ?? [])
      : [];
    const damageTypes =
      !hideActivityDetails && showDetail("damageType", false)
        ? (adapter.itemDamageTypes?.(detailsItem, activityId) ?? [])
        : [];
    const components =
      isSpell && showDetail("components", false)
        ? (adapter.spellComponents?.(detailsItem) ?? [])
        : [];
    const uses =
      adapter.itemResourceData?.(actor, usageItem, usageActivityId) ??
      adapter.itemUsesData(usageItem, usageActivityId);
    const useState = passive
      ? { blocked: false, reason: null }
      : itemAvailability(adapter, actor, usageItem, usageActivityId);
    const unavailableReason = passive
      ? null
      : unpreparedFavorite
        ? "Combat.UnpreparedSpell"
        : (useState.reason ?? (uses?.value === 0 ? "Quick.NoCharges" : null));
    const unavailableLabel = unavailableReason ? t(unavailableReason) : "";
    if (recordCards && diagnosticsRecording())
      recordDiagnostic(
        "hud.card",
        {
          item: diagnosticRef(item, "item"),
          source: diagnosticRef(usageItem, "item"),
          details: diagnosticRef(detailsItem, "item"),
          type: item.type,
          activation,
          activities: activities.map(a => ({
            type: a.type,
            activation: a.activation?.type
          })),
          description: Boolean(item.system?.description?.value),
          blocked: useState.blocked || unpreparedFavorite,
          reason: unavailableReason
        },
        { detailed: true }
      );
    const showUnavailable =
      !inFavorites &&
      unavailableLabel &&
      (!Array.isArray(detailFields) || detailFields.length);
    const showCharges = !hideActivityDetails && showDetail("charges", true);
    const inventoryInfo = inventory ? adapter.inventoryInfo?.(item) : null;
    const inventoryMarkup = inventoryInfo
      ? [
          inventoryInfo.quantity !== null
            ? `<span class="ws-inventory-quantity" title="${escapeHTML(t("Inventory.Quantity"))}" aria-label="${escapeHTML(`${t("Inventory.Quantity")}: ${inventoryInfo.quantity}`)}">× ${escapeHTML(inventoryInfo.quantity)}</span>`
            : "",
          inventoryInfo.attunement
            ? (() => {
                const label = t(
                  inventoryInfo.attuned
                    ? "Inventory.Attuned"
                    : inventoryInfo.attunement === "required"
                      ? "Inventory.AttunementRequired"
                      : "Inventory.AttunementOptional"
                );
                return `<span class="ws-inventory-attunement ${inventoryInfo.attuned ? "ws-attuned" : "ws-not-attuned"}" title="${escapeHTML(label)}"><i class="fa-${inventoryInfo.attuned ? "solid" : "regular"} fa-sun" aria-hidden="true"></i>${escapeHTML(label)}</span>`;
              })()
            : ""
        ].join("")
      : "";
    const showsDetails = Boolean(
      inventoryMarkup ||
      mastery ||
      showsRange ||
      activationBadge ||
      attackDetails.length ||
      (showCharges && uses) ||
      damageTypes.length ||
      components.length ||
      showUnavailable ||
      attackBonus ||
      saveDc ||
      concentration ||
      ritual ||
      damageFormula
    );

    const metadataMarkup = showsDetails
      ? `
                    <small class="ws-spell-meta">
                      ${inventoryMarkup}
                      ${activationBadge ? `<b class="ws-activation-badge" title="${t(activationBadge[1])}">${activationBadge[0]}</b>` : ""}
                      ${
                        showAttackDetails &&
                        attackBonus &&
                        attackDetails.length < 2
                          ? `
                            <span title="${t("Combat.AttackBonus")}">
                              <i class="fa-solid fa-bullseye"></i>
                              ${escapeHTML(attackBonus)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        showAttackDetails && saveDc && attackDetails.length < 2
                          ? `<span title="${t("Combat.SaveDC")}"><i class="fa-solid fa-shield-heart"></i>${t("Combat.SaveDCShort")} ${escapeHTML(saveDc)}</span>`
                          : ""
                      }

                      ${components.length ? `<span class="ws-spell-components" aria-label="${t("Combat.SpellComponents")}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>${components.map(component => `<span class="ws-spell-component" title="${escapeHTML(component.label)}">${escapeHTML(component.abbreviation ?? component.label)}</span>`).join("")}</span>` : ""}
                      ${mastery ? `<span class="ws-weapon-mastery ${mastery.available ? "ws-mastery-available" : ""}" title="${t("Combat.WeaponMastery")}"><i class="fa-solid fa-hand-fist" aria-hidden="true"></i>${escapeHTML(mastery.label)}</span>` : ""}
                      ${attackDetails.length > 1 ? attackDetails.map(detail => `<span title="${escapeHTML(detail.name)}">${escapeHTML(detail.name)}: ${detail.attack ? `<i class="fa-solid fa-bullseye"></i> ${escapeHTML(detail.attack)}` : ""}${detail.dc ? ` ${t("Combat.SaveDCShort")} ${escapeHTML(detail.dc)}` : ""}</span>`).join("") : ""}
                      ${
                        damageFormula
                          ? `
                            <span title="${t("Combat.DamageFormula")}">
                              <i class="fa-solid fa-burst"></i>
                              ${escapeHTML(damageFormula)}${damageTypes.length ? ` <span class="ws-damage-types">${escapeHTML(damageTypes.join(", "))}</span>` : ""}
                            </span>
                          `
                          : ""
                      }
                      ${!damageFormula && damageTypes.length ? `<span class="ws-damage-types">${escapeHTML(damageTypes.join(", "))}</span>` : ""}
                      ${
                        showsRange
                          ? `
                            <span title="${t("Combat.Range")}">
                              <i class="fa-solid fa-crosshairs"></i>
                              ${itemRange(detailsItem, activityId)}
                            </span>
                          `
                          : ""
                      }
                      ${
                        showCharges && uses
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
                          ? `<span class="ws-concentration-icon" title="${t("Combat.Concentration")}" aria-label="${t("Combat.Concentration")}"><i class="fa-solid fa-brain" aria-hidden="true"></i></span>`
                          : ""
                      }
                      ${
                        ritual
                          ? `<b title="${t("Combat.Ritual")}">${t("Combat.RitualShort")}</b>`
                          : ""
                      }
                    </small>
                  `
      : "";

    if (activityOption)
      return `<div class="ws-activity-option" data-description-item-id="${escapeHTML(item.id)}" ${useState.blocked ? `tabindex="0" role="group" aria-label="${escapeHTML(name)}"` : ""}>
      <button type="button" class="ws-button" data-action="useactivity" data-item-id="${escapeHTML(item.id)}" data-activity-id="${escapeHTML(activityId)}" aria-label="${escapeHTML(name)}" title="${escapeHTML(unavailableLabel)}" ${useState.blocked ? 'disabled aria-disabled="true"' : ""}><span class="ws-combat-item-content"><strong>${escapeHTML(activityName ?? item.name)}</strong>${metadataMarkup}${showUnavailable ? `<small class="ws-item-unavailable">${escapeHTML(unavailableLabel)}</small>` : ""}</span></button>
      ${showFavorite ? `<button type="button" class="ws-button ws-item-favorite ${favorite ? "ws-active" : ""}" data-action="${favorite ? "removefavorite" : "togglefavorite"}" data-item-id="${escapeHTML(item.id)}" data-activity-id="${escapeHTML(activityId)}" title="${t(favorite ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(favorite ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" ${actor.isOwner === false ? "disabled" : ""}><i class="fa-${favorite ? "solid" : "regular"} fa-star"></i></button>` : ""}
    </div>`;

    return `
        <div class="ws-combat-item-card ${isSpell ? "ws-spell-card" : ""} ${unavailableLabel || unpreparedFavorite ? "ws-unavailable-card" : ""} ${
          showsDetails ? "ws-detailed-card" : ""
        } ${visibility.hideItemOpenButton === false ? "ws-has-side-actions" : ""} ${showFavorite ? "ws-has-favorite-control" : ""}"
          data-description-item-id="${escapeHTML(item.id)}"
          ${unpreparedFavorite ? 'data-unprepared="true"' : ""}
          ${(useState.blocked || unpreparedFavorite) && !passive ? `tabindex="0" role="group" aria-label="${escapeHTML(name)}"` : ""}
          >
          <button
            type="button"
            class="ws-combat-item ws-button ${unavailableLabel ? "ws-item-depleted" : ""}"
            data-action="${passive ? "openitem" : usageActivityId ? "useactivity" : "useitem"}"
            data-item-id="${escapeHTML(usageItem.id)}"
            title="${escapeHTML(unavailableLabel)}"
            aria-label="${escapeHTML(name)}"
            ${(useState.blocked || unpreparedFavorite) && !passive ? 'disabled aria-disabled="true"' : ""}
            ${usageActivityId ? `data-activity-id="${escapeHTML(usageActivityId)}"` : ""}
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(name)}</strong>
              ${metadataMarkup}
              ${showUnavailable ? `<small class="ws-item-unavailable"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${unavailableLabel}</small>` : ""}
            </span>

            ${offersActivities ? '<i class="ws-item-usage-icon fa-solid fa-chevron-down" aria-hidden="true"></i>' : ""}
          </button>

          ${canPrepare ? `<button type="button" aria-pressed="${Boolean(preparation.prepared)}" class="ws-item-prepare ws-button ${preparation.prepared ? "ws-active" : ""}" data-action="togglespellprepared" data-item-id="${escapeHTML(item.id)}" title="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" aria-label="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" ${actor.isOwner ? "" : "disabled"}><i class="fa-${preparation.prepared ? "solid" : "regular"} fa-bookmark"></i></button>` : ""}

          ${visibility.hideItemOpenButton === false ? `<div class="ws-item-side-actions"><button type="button" class="ws-item-open ws-button" data-action="openitem" data-item-id="${escapeHTML(item.id)}" title="${t("Combat.OpenItem")}" aria-label="${t("Combat.OpenItem")}"><i class="fa-solid fa-book-open" aria-hidden="true"></i></button></div>` : ""}

            ${
              showFavorite
                ? `<button type="button" class="ws-item-favorite ws-button ${favorite ? "ws-active" : ""}" data-action="${favorite || inFavorites ? "removefavorite" : "togglefavorite"}" data-item-id="${escapeHTML(item.id)}" ${activityId ? `data-activity-id="${escapeHTML(activityId)}"` : ""} title="${t(favorite || inFavorites ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(favorite || inFavorites ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" ${actor.isOwner === false ? "disabled" : ""}><i class="fa-${favorite ? "solid" : "regular"} fa-star"></i></button>`
                : ""
            }

          ${
            offersActivities && hudState.openActivityItemId === item.id
              ? `<div class="ws-activity-menu" role="group" aria-label="${t("Quick.ChooseActivity")}">
                  ${activities.map(activity => combatItemButton(item, { activityId: activity.id, activityOption: true })).join("")}
                </div>`
              : ""
          }
        </div>
      `;
  };
  combatItemButton.withUsageTargets = withUsageTargets;
  return combatItemButton;
}
