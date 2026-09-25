import { healthWidths } from "./health-feedback.js";

export function renderHealthBar({ hp, canEdit, formatMod, t }) {
  const value = Number(hp.value ?? 0);
  const max = Number(hp.max ?? 0);
  const temp = Number(hp.temp ?? 0);
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const { normal, temp: temporary } = healthWidths({ value, temp, max });
  const condition =
    value <= 0
      ? { key: "Combat.Unconscious", className: "ws-health-unconscious" }
      : max <= 0 || percent > 50
        ? null
        : percent <= 10
          ? { key: "Combat.CriticalHP", className: "ws-health-critical" }
          : { key: "Combat.Bloodied", className: "ws-health-bloodied" };
  const color =
    percent <= 0
      ? "var(--muted)"
      : percent >= 70
        ? "var(--success)"
        : percent > 50
          ? "var(--warning)"
          : `hsl(3 65% ${Math.round(35 + percent * 0.3)}%)`;

  return `
    <button type="button" class="ws-health-button ws-button" data-action="edithp"
      title="${t("Combat.EditHP")} · ${t("Combat.HealToMaxHint")}" ${canEdit ? "" : "disabled"}>
      <span class="ws-health-label"><span>${t("Combat.HP")}</span><strong>${value}/${max}</strong>
        ${temp > 0 ? `<small>+${temp} ${t("Combat.TempHP")}</small>` : ""}
        ${condition ? `<span class="ws-health-condition ${condition.className}"><i class="fa-solid fa-droplet" aria-hidden="true"></i>${t(condition.key)}</span>` : ""}
      </span>
      <span class="ws-health-track" aria-hidden="true">
        <span class="ws-health-fill" style="width: ${normal}%; background: ${color}"></span>
        <span class="ws-health-temp-fill" style="width: ${temporary}%"></span>
      </span>
      ${Number(hp.tempmax ?? 0) !== 0 ? `<small>${t("Combat.TempMax")} ${formatMod(hp.tempmax)}</small>` : ""}
    </button>
  `;
}
