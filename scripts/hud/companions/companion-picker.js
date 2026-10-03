// @ts-check
import { reportFailure } from "../../diagnostics.js";
/** @param {Pick<import('../../../types/hud.js').CompanionPanelOptions, 'DialogV2' | 't' | 'escapeHTML' | 'isCurrent'>} options */
export function createCompanionPicker({ DialogV2, t, escapeHTML, isCurrent }) {
  /** @type {any} Native DialogV2. */
  let picker = null;
  /** @param {{ choices: import('../../../types/hud.js').CompanionChoice[], title: string, onSelect: (choice: import('../../../types/hud.js').CompanionChoice) => unknown }} options */
  const choose = async ({ choices, title, onSelect }) => {
    if (!choices.length)
      return ui.notifications.warn(t("Companions.NoCandidates"));
    await picker?.close();
    if (!isCurrent()) return;
    const content = document.createElement("div");
    content.innerHTML = `<div class="ws-companion-picker-fields"><label>${title}<select name="companion" aria-label="${title}">${choices.map((choice, index) => `<option value="${index}">${escapeHTML(choice.name)}</option>`).join("")}</select></label></div>`;
    const currentPicker = new DialogV2({
      classes: ["ws-companion-picker"],
      window: { title },
      position: {
        width: Math.min(380, Math.max(270, window.innerWidth - 32)),
        height: "auto"
      },
      content,
      buttons: [
        {
          action: "selectcompanion",
          label: t("Companions.Select"),
          default: true,
          callback: async (_event, button) => {
            if (!isCurrent()) return;
            const fields = button.form.elements;
            const choice =
              choices[Number(fields.namedItem("companion")?.value)];
            if (!choice) return;
            try {
              await onSelect(choice);
            } catch (error) {
              reportFailure("hud.companions.select", error, { t });
              throw error;
            }
          }
        },
        { action: "close", label: t("Actor.Cancel") }
      ]
    });
    picker = currentPicker;
    return currentPicker.render({ force: true });
  };
  /** @param {import('../../../types/hud.js').CompanionEntry} entry @param {(uuid: string | null) => unknown} operation */
  const withToken = async (entry, operation) => {
    if (entry.tokenOptions.length > 1 && !entry.token)
      return choose({
        title: t("Companions.ChooseToken"),
        choices: entry.tokenOptions.map((token, index) => ({
          uuid: token.uuid,
          name: `${token.name ?? token.actor.name} · ${t("Companions.Token")} ${index + 1}`
        })),
        onSelect: choice => operation(choice.uuid)
      });
    return operation(
      entry.token?.uuid ??
        (entry.tokenOptions.length === 1 ? entry.tokenOptions[0].uuid : null)
    );
  };

  return {
    choose,
    withToken,
    close: () => picker?.close(),
    dispose() {
      void picker
        ?.close()
        .catch(error => reportFailure("hud.companions.context", error, { t }));
    }
  };
}
