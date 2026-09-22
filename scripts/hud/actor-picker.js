export function openActorPicker({
  actors,
  DialogV2,
  document,
  escapeHTML,
  lang,
  onSelect,
  t,
  viewportWidth
}) {
  const content = document.createElement("div");
  content.innerHTML = `<div class="ws-actor-picker-list">${[...actors]
    .sort((a, b) => a.name.localeCompare(b.name, lang))
    .map(
      actor => `
        <button
          type="button"
          class="ws-actor-picker-entry"
          data-action="selectactor"
          data-actor-id="${escapeHTML(actor.id)}"
        >
          <img src="${escapeHTML(actor.img ?? "icons/svg/mystery-man.svg")}" alt="">
          <span>${escapeHTML(actor.name)}</span>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      `
    )
    .join("")}</div>`;

  const actorsById = new Map(actors.map(actor => [actor.id, actor]));
  const picker = new DialogV2({
    classes: ["ws-actor-picker"],
    window: { title: t("Actor.Select") },
    position: {
      width: Math.min(380, Math.max(280, viewportWidth - 32)),
      height: "auto"
    },
    content,
    actions: {
      selectactor: async function (_event, target) {
        const actor = actorsById.get(target.dataset.actorId);
        await picker.close();
        if (actor) await onSelect(actor);
      }
    },
    buttons: [{ action: "close", label: t("Actor.Cancel") }]
  });

  return picker.render({ force: true });
}
