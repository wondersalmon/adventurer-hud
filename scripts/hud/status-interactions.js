/** Only Ctrl + primary pointer click removes a status; keyboard clicks have detail 0. */
export function isStatusRemovalEvent(event) {
  return Boolean(
    event?.ctrlKey &&
    event.type === "click" &&
    !(event.button > 0) &&
    event.detail !== 0
  );
}

/** Capture the pointer removal gesture before native application routing. */
export function bindStatusInteractions({ element, isActive, remove }) {
  const activate = event => {
    const status = event.target?.closest?.("[data-status-id]");
    if (
      !isActive() ||
      !status ||
      !element.contains(status) ||
      !isStatusRemovalEvent(event)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    void remove(event, status);
  };
  element.addEventListener("click", activate, true);
  return () => {
    element.removeEventListener("click", activate, true);
  };
}
