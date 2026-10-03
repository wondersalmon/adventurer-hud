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
  visibility
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
    { activityId = null, inFavorites = false } = {}
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
    const favorite = isFavorite(hudState.favoriteEntries, item.id, activityId);
    const role = adapter.itemRole(item);
    const passive =
      item.type === "feat" && !adapter.itemActivities(item).length;
    const isSpell = role === "spell";
    const isWeapon = role === "weapon";
    const preparation = isSpell ? adapter.spellPreparation?.(item) : null;
    const canPrepare = Boolean(preparation?.canPrepare);
    const showFavorite =
      visibility.favorites &&
      ((inFavorites && hudState.favoriteEdit) ||
        (!offersActivities && (!favorite || hudState.favoriteEdit)));
    const hasSideActions = canPrepare || showFavorite;
    const descriptionHint = t("Combat.OpenDescriptionHint");
    const activityName = activityId
      ? adapter
          .itemActivities(item)
          .find(activity => activity.id === activityId)?.name
      : null;
    const name =
      activityId && activityName ? `${item.name}: ${activityName}` : item.name;
    const activation = isSpell
      ? adapter.itemActivation?.(detailsItem, activityId)
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
      adapter.hasItemProperty(detailsItem, "concentration");
    const ritual =
      visibility.itemDetails &&
      isSpell &&
      adapter.hasItemProperty(detailsItem, "ritual");
    const showAttackDetails =
      visibility.attackDetails ?? visibility.itemDetails;
    const attackBonus = showAttackDetails
      ? adapter.itemAttackBonus(detailsItem, activityId)
      : "";
    const damageFormula = visibility.itemDetails
      ? adapter.itemDamageFormula(actor, detailsItem, activityId)
      : "";
    const saveDc = showAttackDetails
      ? adapter.itemSaveDc?.(detailsItem, activityId)
      : "";
    const attackDetails = showAttackDetails
      ? (adapter.itemAttackDetails?.(detailsItem, activityId) ?? [])
      : [];
    const uses =
      adapter.itemResourceData?.(actor, usageItem, usageActivityId) ??
      adapter.itemUsesData(usageItem, usageActivityId);
    const useState = passive
      ? { blocked: false, reason: null }
      : itemAvailability(adapter, actor, usageItem, usageActivityId);
    const unavailableReason = passive
      ? null
      : (useState.reason ?? (uses?.value === 0 ? "Quick.NoCharges" : null));
    const unavailableLabel = unavailableReason ? t(unavailableReason) : "";
    if (diagnosticsRecording())
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
          blocked: useState.blocked,
          reason: unavailableReason
        },
        { detailed: true }
      );
    const showsDetails = Boolean(
      showsRange ||
      activationBadge ||
      attackDetails.length ||
      uses ||
      (!inFavorites && unavailableLabel) ||
      attackBonus ||
      saveDc ||
      (visibility.itemDetails && (concentration || ritual || damageFormula))
    );

    return `
        <div class="ws-combat-item-card ${unavailableLabel ? "ws-unavailable-card" : ""} ${
          showsDetails ? "ws-detailed-card" : ""
        } ${hasSideActions ? "ws-has-side-actions" : ""}"
          data-description-item-id="${escapeHTML(item.id)}"
          ${useState.blocked && !passive ? `tabindex="0" role="group" aria-label="${escapeHTML(name)}"` : ""}
          title="${escapeHTML(descriptionHint)}">
          <button
            type="button"
            class="ws-combat-item ws-button ${unavailableLabel ? "ws-item-depleted" : ""}"
            data-action="${passive ? "openitem" : usageActivityId ? "useactivity" : "useitem"}"
            data-item-id="${escapeHTML(usageItem.id)}"
            title="${escapeHTML([unavailableLabel, descriptionHint].filter(Boolean).join("\n"))}"
            aria-label="${escapeHTML(name)}"
            aria-description="${escapeHTML(descriptionHint)}"
            ${useState.blocked && !passive ? 'disabled aria-disabled="true"' : ""}
            ${usageActivityId ? `data-activity-id="${escapeHTML(usageActivityId)}"` : ""}
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(name)}</strong>
              ${
                showsDetails
                  ? `
                    <small class="ws-spell-meta">
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
                      ${attackDetails.length > 1 ? attackDetails.map(detail => `<span title="${escapeHTML(detail.name)}">${escapeHTML(detail.name)}: ${detail.attack ? `<i class="fa-solid fa-bullseye"></i> ${escapeHTML(detail.attack)}` : ""}${detail.dc ? ` ${t("Combat.SaveDCShort")} ${escapeHTML(detail.dc)}` : ""}</span>`).join("") : ""}
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
                              ${itemRange(detailsItem, activityId)}
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
                    </small>
                  `
                  : ""
              }
              ${!inFavorites && unavailableLabel ? `<small class="ws-item-unavailable"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${unavailableLabel}</small>` : ""}
            </span>

            <i class="fa-solid ${passive ? "fa-book-open" : offersActivities ? "fa-chevron-down" : "fa-dice-d20"}"></i>
          </button>

          ${
            hasSideActions
              ? `<div class="ws-item-side-actions">
            ${
              showFavorite
                ? `<button type="button" class="ws-item-favorite ws-button ${favorite ? "ws-active" : ""}" data-action="${favorite || inFavorites ? "removefavorite" : "togglefavorite"}" data-item-id="${escapeHTML(item.id)}" ${activityId ? `data-activity-id="${escapeHTML(activityId)}"` : ""} title="${t(favorite || inFavorites ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(favorite || inFavorites ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" ${actor.isOwner === false ? "disabled" : ""}><i class="fa-${favorite ? "solid" : "regular"} fa-star"></i></button>`
                : ""
            }
            ${canPrepare ? `<button type="button" class="ws-item-prepare ws-button ${preparation.prepared ? "ws-active" : ""}" data-action="togglespellprepared" data-item-id="${escapeHTML(item.id)}" title="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" aria-label="${t(preparation.prepared ? "Combat.UnprepareSpell" : "Combat.PrepareSpell")}" ${actor.isOwner ? "" : "disabled"}><i class="fa-${preparation.prepared ? "solid" : "regular"} fa-bookmark"></i></button>` : ""}
          </div>`
              : ""
          }

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
                        ${visibility.favorites && (!selected || hudState.favoriteEdit) ? `<button type="button" class="ws-button ws-item-favorite ${selected ? "ws-active" : ""}" data-action="${selected ? "removefavorite" : "togglefavorite"}" data-item-id="${escapeHTML(item.id)}" data-activity-id="${escapeHTML(activity.id)}" title="${t(selected ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" aria-label="${t(selected ? "Quick.RemoveFavorite" : "Quick.AddFavorite")}" ${actor.isOwner === false ? "disabled" : ""}><i class="fa-${selected ? "solid" : "regular"} fa-star"></i></button>` : ""}
                      </div>`;
                    })
                    .join("")}
                </div>`
              : ""
          }
        </div>
      `;
  };
  combatItemButton.withUsageTargets = withUsageTargets;
  return combatItemButton;
}
