export function createDeathRenderer(context) {
  const {
    actorHeader,
    canRollActor,
    canRollDeathSave,
    deathData,
    inspirationControl,
    modeNavigation,
    shortcutHint,
    t
  } = context;

  const deathPips = (value, type) =>
    Array.from(
      { length: 3 },
      (_, index) => `
          <span
            class="
              ws-death-pip
              ws-death-${type}
              ${index < value ? "ws-death-filled" : ""}
            "
          ></span>
        `
    ).join("");

  const deathTracker = () => {
    const { failure, success } = deathData();

    return `
        <div class="ws-death-tracker">

        <div class="ws-death-track">
          <span class="ws-death-label">
            ${t("Death.Successes")}
          </span>

          <div class="ws-death-pips">
            ${deathPips(success, "success")}
          </div>
        </div>

        <div class="ws-death-track">
          <span class="ws-death-label">
            ${t("Death.Failures")}
          </span>

          <div class="ws-death-pips">
            ${deathPips(failure, "failure")}
          </div>
        </div>

        </div>
      `;
  };

  function deathHTML() {
    return `
        <div
          id="ws-death"
          class="ws-view ws-death-view"
        >
          ${actorHeader(inspirationControl())}

          ${modeNavigation("death")}

          <div class="ws-death-heading">

            <div class="ws-death-heading-icon">
              <i
                class="
                  fa-solid
                  fa-heart-pulse
                "
              ></i>
            </div>

            <div>
              <strong>
                ${t("Labels.DeathSaves")}
              </strong>

              <span>
                ${t("Death.ZeroHP")}
              </span>
            </div>

          </div>

          ${deathTracker()}

          ${
            canRollActor && canRollDeathSave()
              ? `
                <div class="ws-death-roll-section">
                  <button
                    type="button"
                    class="ws-death-roll ws-button"
                    data-action="death"
                    aria-label="${t("Death.Roll")}"
                  >
                    <span>
                      <i class="fa-solid fa-dice-d20"></i>
                      ${t("Death.Roll")}
                    </span>

                    <i
                      class="fa-solid fa-chevron-right ws-arrow"
                    ></i>
                  </button>
                </div>
              `
              : ""
          }

          ${shortcutHint()}
        </div>
      `;
  }

  return { deathHTML };
}
