// Description gestures use the displayed item, even when rolls use a Cast source.
export function bindItemDescriptionInteractions({
  element,
  openItem,
  isActive
}) {
  const route = (event, { keyboard = false } = {}) => {
    if (!isActive()) return;
    const card = event.target?.closest?.("[data-description-item-id]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    // The context-menu key opens the sheet without sending it to chat.
    void openItem(keyboard ? { shiftKey: false } : event, {
      dataset: { itemId: card.dataset.descriptionItemId }
    });
  };
  const onContextMenu = event => {
    if (event.button === 2) route(event);
  };
  const onKeyDown = event => {
    if (event.key === "ContextMenu") route(event, { keyboard: true });
  };
  element.addEventListener("contextmenu", onContextMenu);
  element.addEventListener("keydown", onKeyDown);
  return () => {
    element.removeEventListener("contextmenu", onContextMenu);
    element.removeEventListener("keydown", onKeyDown);
  };
}
