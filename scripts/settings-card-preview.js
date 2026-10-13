import { createCombatItemCardRenderer } from "./hud/items/combat-item-card.js";
import { cardDetailFields, SETTINGS } from "./settings-schema.js";
import { synchronizeHudTheme, synchronizeHudTypography } from "./hud/theme.js";

/** Show the same inert cards as the GM card-details preview, grouped by policy. */
export function updateMechanicsPreviews(root, t) {
  for (const preview of root.querySelectorAll(
    '[data-mechanics-preview="gmActionDisplay"]'
  )) {
    const mode = root.querySelector('[name="gmActionDisplay"]')?.value;
    preview.dataset.mode = mode;
    preview.innerHTML = `<div class="ws-rolls-dialog" data-card-preview="${SETTINGS.gmCardDetailFields}"><div class="ws-shell"></div></div>`;
    updateCardPreviews(root, t);
    const shell = preview.querySelector(".ws-shell");
    const cards = [...shell.children];
    if (mode === "all") continue;
    const escape = value => foundry.utils.escapeHTML(String(value));
    shell.innerHTML = `${mode === "items" ? `<div class="ws-mechanics-example-tabs"><span>${escape(t("Combat.Weapons"))} · 1</span><span>${escape(t("Combat.Spells"))} · 1</span></div>` : ""}${cards.map((card, index) => `<div class="ws-mechanics-example-group"><div class="ws-section-header">${escape(t(index === 0 ? "Combat.Action" : "Combat.BonusAction"))} · 1</div>${card.outerHTML}</div>`).join("")}`;
  }
}

/** Illustrative data only: never resolve or mutate world documents. */
export function updateCardPreviews(root, t) {
  const read = key => root.querySelector(`[name="${key}"]`)?.value;
  for (const preview of root.querySelectorAll("[data-card-preview]")) {
    const key = preview.dataset.cardPreview;
    const gm = key === SETTINGS.gmCardDetailFields;
    const fields = cardDetailFields(
      read(gm ? SETTINGS.gmCardDetails : SETTINGS.cardDetails),
      [...root.querySelectorAll(`[name="${key}"]:checked`)].map(
        input => input.value
      )
    );
    synchronizeHudTheme(preview, read(SETTINGS.theme));
    synchronizeHudTypography(preview, {
      family: read(SETTINGS.fontFamily),
      style: read(SETTINGS.fontStyle),
      size: read(SETTINGS.fontSize),
      pixels: read(SETTINGS.fontSizePx)
    });
    const adapter = {
      itemRole: item => item.type,
      itemActivities: () => [],
      itemActivation: item => (item.type === "spell" ? "bonus" : "action"),
      itemAttackBonus: item => (item.type === "weapon" ? "+7" : ""),
      itemSaveDc: item => (item.type === "spell" ? "15" : ""),
      itemDamageFormula: (_actor, item) =>
        item.type === "spell" ? "2d6" : "1d8 + 4",
      itemDamageTypes: item => [
        t(
          item.type === "spell"
            ? "Settings.CardPreview.Fire"
            : "Settings.CardPreview.Slashing"
        )
      ],
      itemRangeData: item => ({
        value: item.type === "spell" ? 60 : 5,
        units: "ft"
      }),
      rangeUnitLabel: () => t("Settings.CardPreview.Feet"),
      itemUsesData: item =>
        item.type === "spell" ? { value: 2, max: 3 } : null,
      hasItemProperty: () => true,
      weaponMastery: () => ({
        label: t("Settings.CardPreview.Mastery"),
        available: true
      }),
      spellComponents: () =>
        ["V", "S", "M"].map(abbreviation => ({
          abbreviation,
          label: t(`Settings.CardPreview.${abbreviation}`)
        }))
    };
    const renderer = createCombatItemCardRenderer({
      actor: { isOwner: true },
      adapter,
      escapeHTML: value => foundry.utils.escapeHTML(String(value ?? "")),
      hudState: { favoriteEntries: [] },
      t,
      visibility: { gm, cardDetailFields: fields, favorites: true },
      recordCards: false
    });
    const shell = preview.querySelector(".ws-shell");
    shell.innerHTML = ["weapon", "spell"]
      .map(type =>
        renderer({
          id: `preview-${type}`,
          type,
          name: t(
            type === "spell"
              ? "Settings.CardPreview.Spell"
              : "Settings.CardPreview.Weapon"
          ),
          img: type === "spell" ? "icons/svg/book.svg" : "icons/svg/sword.svg"
        })
      )
      .join("");
    // Render the normal card, but make all example controls inert and unfocusable.
    for (const element of shell.querySelectorAll("[data-action]")) {
      element.removeAttribute("data-action");
      element.removeAttribute("data-item-id");
      element.disabled = true;
      element.tabIndex = -1;
    }
  }
}
