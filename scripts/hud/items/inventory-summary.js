export function renderInventorySummary({ data, t, escapeHTML, formatNumber }) {
  const number = value =>
    value === Infinity ? "∞" : value == null ? "—" : formatNumber(value);
  return `<div class="ws-inventory-summary">
    <div class="ws-inventory-stat ws-inventory-weight">
      <span><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i>${t("Inventory.Weight")}</span>
      <strong><span>${number(data.weight)} / ${number(data.maxWeight)}</span> <small>${escapeHTML(data.units)}</small></strong>
    </div>
    <div class="ws-inventory-stat ws-inventory-gold">
      <span><i class="fa-solid fa-coins" aria-hidden="true"></i>${t("Inventory.Gold")}</span>
      <strong><span>${number(data.gold)}</span> <small>${t("Inventory.GoldUnit")}</small></strong>
    </div>
  </div>`;
}
