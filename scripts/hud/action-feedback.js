// DOM locks are shared by the actor and scene runners so either may finish first.
const locks = new WeakMap();
const feedback = new WeakMap();

export function lockActionButton(button, owner) {
  let lock = locks.get(button);
  if (!lock) {
    lock = { disabled: button.disabled, owners: new Set() };
    locks.set(button, lock);
  }
  lock.owners.add(owner);
  button.disabled = true;
}

export function unlockActionButton(button, owner) {
  const lock = locks.get(button);
  if (!lock) return;
  lock.owners.delete(owner);
  if (!lock.owners.size) {
    button.disabled = lock.disabled;
    locks.delete(button);
  }
}

export function updateActionFeedback(root, owner, phase, t) {
  if (!root?.ownerDocument || !root.querySelector) return;
  let state = feedback.get(root);
  if (!state && !phase) return;
  if (!state) {
    state = { owners: new Map(), busy: root.getAttribute("aria-busy") };
    feedback.set(root, state);
  }
  if (phase) state.owners.set(owner, { phase, t });
  else state.owners.delete(owner);
  const values = [...state.owners.values()];
  const current = values.find(value => value.phase === "pending") ?? values[0];
  let indicator = root.querySelector("[data-hud-action-feedback]");
  if (!current) {
    indicator?.remove();
    if (state.busy === null) root.removeAttribute("aria-busy");
    else root.setAttribute("aria-busy", state.busy);
    feedback.delete(root);
    return;
  }
  root.setAttribute("aria-busy", String(current.phase === "pending"));
  if (!indicator) {
    const header = root.querySelector(".window-header");
    if (!header) return;
    indicator = root.ownerDocument.createElement("span");
    indicator.dataset.hudActionFeedback = "";
    indicator.className = "ws-action-feedback";
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");
    indicator.setAttribute("aria-atomic", "true");
    const title = header.querySelector(".window-title");
    if (title) title.after(indicator);
    else header.append(indicator);
  }
  const label = current.t(
    current.phase === "pending" ? "Actions.Pending" : "Actions.Cooldown"
  );
  if (indicator.textContent !== label) indicator.textContent = label;
  indicator.dataset.phase = current.phase;
  indicator.title = label;
  indicator.dataset.tooltip = label;
}
