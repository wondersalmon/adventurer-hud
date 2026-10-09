/** Keep the guarded removal gesture identical for dispatch and native handlers. */
export function isStatusRemovalEvent(event) {
  return Boolean(
    event?.ctrlKey &&
    (event.type === "click"
      ? !(event.button > 0)
      : event.type === "keydown" &&
        ["Enter", " "].includes(event.key) &&
        !event.repeat)
  );
}

/** Bind both pointer and keyboard removal; prevent native button double activation. */
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
  element.addEventListener("keydown", activate, true);
  return () => {
    element.removeEventListener("click", activate, true);
    element.removeEventListener("keydown", activate, true);
  };
}
