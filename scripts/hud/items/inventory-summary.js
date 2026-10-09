export function renderInventorySummary({
  data,
  t,
  escapeHTML,
  formatNumber,
  interactive = false,
  disabled = false
}) {
  const tag = interactive ? "button" : "div";
  const attributes = interactive
    ? `type="button" data-action="actorinventory" ${disabled ? "disabled" : ""}`
    : "";
  const label = key =>
    escapeHTML(
      `${t(key)}${interactive ? ` — ${t("Inventory.OpenSheet")}` : ""}`
    );
  const number = value =>
    value === Infinity ? "∞" : value == null ? "—" : formatNumber(value);
  return `<${tag} ${attributes} class="ws-inventory-summary" ${interactive ? `title="${escapeHTML(t("Inventory.OpenSheet"))}" aria-label="${escapeHTML(t("Inventory.OpenSheet"))}"` : ""}>
    <div class="ws-inventory-stat ws-inventory-weight" data-load="${data.loadState ?? "normal"}" title="${label("Inventory.Weight")}: ${number(data.weight)} / ${number(data.maxWeight)} ${escapeHTML(data.units)} — ${escapeHTML(t(`Inventory.Load.${data.loadState ?? "normal"}`))}" aria-label="${label("Inventory.Weight")}">
      <span><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i>${t("Inventory.Weight")}</span>
      <strong><span>${number(data.weight)}<span class="ws-weight-capacity"> / ${number(data.maxWeight)}</span></span> <small>${escapeHTML(data.units)}</small></strong>
    </div>
    <div class="ws-inventory-stat ws-inventory-currency" title="${label("Inventory.Currency")}" aria-label="${label("Inventory.Currency")}">
      <span><i class="fa-solid fa-coins" aria-hidden="true"></i>${t("Inventory.Currency")}</span>
      <div class="ws-inventory-coins">
      ${data.coins.length ? data.coins.map(coin => `<strong class="ws-coin ws-coin-${escapeHTML(coin.type)}" title="${t(`Inventory.Coin.${coin.type}.Name`)}" aria-label="${escapeHTML(`${number(coin.value)} ${t(`Inventory.Coin.${coin.type}.Name`)}`)}"><span>${number(coin.value)}</span> <small>${t(`Inventory.Coin.${coin.type}.Unit`)}</small></strong>`).join("") : `<strong class="ws-empty-coins">${t("Inventory.NoCoins")}</strong>`}
      </div>
    </div>
  </${tag}>`;
}
