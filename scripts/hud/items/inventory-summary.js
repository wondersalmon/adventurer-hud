export function renderInventorySummary({ data, t, escapeHTML, formatNumber }) {
  const number = value =>
    value === Infinity ? "∞" : value == null ? "—" : formatNumber(value);
  return `<div class="ws-inventory-summary">
    <div class="ws-inventory-stat ws-inventory-weight">
      <span><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i>${t("Inventory.Weight")}</span>
      <strong><span>${number(data.weight)} / ${number(data.maxWeight)}</span> <small>${escapeHTML(data.units)}</small></strong>
    </div>
    <div class="ws-inventory-stat ws-inventory-currency">
      <span><i class="fa-solid fa-coins" aria-hidden="true"></i>${t("Inventory.Currency")}</span>
      <div class="ws-inventory-coins">
      ${data.coins.length ? data.coins.map(coin => `<strong class="ws-coin ws-coin-${escapeHTML(coin.type)}" title="${t(`Inventory.Coin.${coin.type}.Name`)}" aria-label="${escapeHTML(`${number(coin.value)} ${t(`Inventory.Coin.${coin.type}.Name`)}`)}"><span>${number(coin.value)}</span> <small>${t(`Inventory.Coin.${coin.type}.Unit`)}</small></strong>`).join("") : `<strong class="ws-empty-coins">${t("Inventory.NoCoins")}</strong>`}
      </div>
    </div>
  </div>`;
}
