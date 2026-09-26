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
    const uses = adapter.itemUsesData(item, activityId);
    const useState = itemAvailability(adapter, actor, item, activityId);
    const unavailableLabel = useState.reason ? t(useState.reason) : "";
    const showsDetails = Boolean(
      showsRange ||
      activationBadge ||
      uses ||
      (!inFavorites && unavailableLabel) ||
      (visibility.itemDetails &&
        (concentration || ritual || attackBonus || damageFormula || saveDc))
    );

    return `
        <div class="ws-combat-item-card ${unavailableLabel ? "ws-unavailable-card" : ""} ${
          showsDetails ? "ws-detailed-card" : ""
        } ${hasSideActions ? "ws-has-side-actions" : ""}">
          <button
            type="button"
            class="ws-combat-item ws-button ${unavailableLabel ? "ws-item-depleted" : ""}"
            data-action="${activityId ? "useactivity" : "useitem"}"
            data-item-id="${escapeHTML(item.id)}"
            ${unavailableLabel ? `title="${escapeHTML(unavailableLabel)}"` : ""}
            ${useState.blocked ? 'disabled aria-disabled="true"' : ""}
            ${activityId ? `data-activity-id="${escapeHTML(activityId)}"` : ""}
          >
            <img src="${escapeHTML(item.img ?? "icons/svg/item-bag.svg")}" alt="">

            <span class="ws-combat-item-content">
              <strong>${escapeHTML(activityId ? `${item.name}: ${adapter.itemActivities(item).find(activity => activity.id === activityId)?.name ?? t("Quick.ActivityMissing")}` : item.name)}</strong>
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
                    </small>
                  `
                  : ""
              }
              ${!inFavorites && unavailableLabel ? `<small class="ws-item-unavailable"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>${unavailableLabel}</small>` : ""}
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
            title="${t("Combat.OpenDescriptionHint")}"
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
  return combatItemButton;
}
