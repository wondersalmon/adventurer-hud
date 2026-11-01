// @ts-check
import {
  HUD_LAYOUT_BLOCKS,
  hudElementHidden,
  toggleHudBlockHidden,
  resetHudBlockPreferences,
  restoreHudLayoutSnapshot,
  hudLaneOrder
} from "./hud-layout-model.js";
import { synchronizeExtraColumn } from "./extra-column.js";
export {
  HUD_LAYOUT_BLOCKS,
  hudElementHidden,
  captureHudLayoutUndo,
  rememberHudLayoutChange
} from "./hud-layout-model.js";
export { bindHudLayoutDrag } from "./hud-layout-interactions.js";
/** @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state */
export function undoHudLayout(root, state) {
  const snapshot = state.hudLayoutUndo;
  if (
    !state.hudEditing ||
    !snapshot ||
    root
      .querySelector("[data-hud-layout-mode]")
      ?.getAttribute("data-hud-layout-mode") !== snapshot.mode
  )
    return false;
  restoreHudLayoutSnapshot(state);
  // Rebuild from the saved snapshot even if the renderer's markup did not change.
  for (const home of root.querySelectorAll("[data-hud-home-slot]")) {
    const key = home.getAttribute("data-hud-home-slot");
    const node = [...root.querySelectorAll("[data-hud-block]")].find(
      node => node.getAttribute("data-hud-block") === key
    );
    if (node) home.after(node);
  }
  return true;
}

/** @param {HTMLElement} root @param {HTMLElement} node @param {string} key */
function rememberBlockHome(root, node, key) {
  if (root.querySelector(`[data-hud-home-slot="${key}"]`)) return;
  const home = root.ownerDocument.createElement("span");
  home.setAttribute("data-hud-home-slot", key);
  home.hidden = true;
  node.before(home);
}

/** @param {string} key @param {(key:string)=>string} t */
function blockLabel(key, t) {
  const tabs = /** @type {Record<string,string>} */ ({
    skills: "Labels.Skills",
    spells: "Combat.Spells",
    inventory: "Inventory.Title",
    weapons: "Combat.Weapons",
    action: "Combat.Action",
    bonus: "Combat.BonusAction",
    reaction: "Combat.Reaction",
    special: "Combat.Special",
    features: "Combat.Features",
    equipped: "Inventory.Equipped",
    consumables: "Inventory.Consumables",
    other: "Inventory.Other",
    legendary: "GM.LegendaryActions",
    lair: "GM.LairActions"
  });
  return key.startsWith("tab:")
    ? tabs[key.slice(4)]
      ? t(tabs[key.slice(4)])
      : key.slice(4)
    : t(HUD_LAYOUT_BLOCKS.find(block => block[0] === key)?.[2] ?? key);
}

// Keep keyboard targets alive when editor controls change after a move/resize.
/** @param {HTMLElement} current @param {HTMLElement} next */
function updateEditorControls(current, next) {
  const identity = (/** @type {Element} */ node) => {
    const control =
      node.tagName === "DETAILS"
        ? null
        : node.hasAttribute("data-action")
          ? node
          : node.querySelector("[data-action]");
    return JSON.stringify([
      node.tagName,
      control?.getAttribute("data-action"),
      control?.getAttribute("data-hud-key"),
      control?.getAttribute("data-hud-direction")
    ]);
  };
  const previous = new Map(
    [...current.children].map(node => [identity(node), node])
  );
  for (const attribute of [...current.attributes])
    if (!next.hasAttribute(attribute.name))
      current.removeAttribute(attribute.name);
  for (const attribute of next.attributes)
    if (current.getAttribute(attribute.name) !== attribute.value)
      current.setAttribute(attribute.name, attribute.value);
  let index = 0;
  for (const child of [...next.children]) {
    const key = identity(child);
    const existing = previous.get(key);
    const node = existing ?? child;
    if (existing) {
      previous.delete(key);
      if (!child.children.length && existing.textContent !== child.textContent)
        existing.textContent = child.textContent;
      updateEditorControls(
        /** @type {HTMLElement} */ (existing),
        /** @type {HTMLElement} */ (child)
      );
    }
    if (current.children[index] !== node)
      current.insertBefore(node, current.children[index] ?? null);
    index++;
  }
  for (const node of previous.values()) node.remove();
}

/** @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state @param {(key:string)=>string} t */
export function synchronizeHudLayout(root, state, t) {
  const focused = /** @type {HTMLElement|null} */ (
    root.ownerDocument.activeElement
  );
  const restoreFocus = () => {
    if (
      focused?.isConnected &&
      root.contains(focused) &&
      root.ownerDocument.activeElement !== focused &&
      !focused.closest(".ws-hud-block-hidden")
    )
      focused.focus({ preventScroll: true });
  };
  const view = root.querySelector(
    ".ws-player-layout, .ws-gm-body, .ws-gm-preparation"
  );
  root.classList.toggle("ws-hud-editing", Boolean(state.hudEditing));
  const header = root.querySelector(".window-header");
  let badge = header?.querySelector(".ws-hud-edit-badge");
  if (!state.hudEditing) badge?.remove();
  else if (header) {
    if (!badge) {
      badge = root.ownerDocument.createElement("span");
      badge.className = "ws-hud-edit-badge";
      header.querySelector('[data-action="togglehudedit"]')?.before(badge);
    }
    badge.textContent = t("HudLayout.Editing");
  }
  const oldMenu = root.querySelector(".ws-hud-layout-menu");
  const oldControls = /** @type {HTMLElement|null} */ (
    root.querySelector(".ws-hud-layout-controls")
  );
  if (!view) {
    oldControls?.remove();
    return;
  }
  const preparation = view.classList.contains("ws-gm-preparation");
  const mode = preparation
    ? "preparation"
    : view.closest("#ws-combat")
      ? "combat"
      : "regular";
  view.setAttribute("data-hud-layout-mode", mode);
  if (!preparation)
    synchronizeExtraColumn(/** @type {HTMLElement} */ (view), state, mode, t);
  const lanes = [
    view.querySelector(
      ".ws-player-info, .ws-gm-info, .ws-gm-preparation-controls"
    ),
    view.querySelector(
      ".ws-player-actions, .ws-gm-action-column, .ws-gm-preparation-rosters"
    )
  ];
  if (!lanes[0] || !lanes[1]) return;
  const extraLane = view.querySelector('[data-hud-lane="extra"]');
  if (extraLane) lanes.push(extraLane);
  const laneNames = extraLane
    ? ["info", "actions", "extra"]
    : ["info", "actions"];
  const playerFooter = /** @type {HTMLElement|null} */ (
    root.querySelector(".ws-player-footer")
  );
  if (playerFooter) {
    lanes.push(playerFooter);
    laneNames.push("footer");
  }
  lanes.forEach((lane, index) =>
    lane?.setAttribute("data-hud-lane", laneNames[index])
  );
  /** @type {Map<string, HTMLElement>} */
  const nodes = new Map();
  const combatSections = [
    ...view.querySelectorAll(".ws-combat-category-section")
  ];
  const exploration = [
    ...view.querySelectorAll(".ws-exploration-section"),
    ...combatSections
  ];
  const tabPreference = state.hudLayouts[`${mode}:tabs`] ?? {
    order: [],
    hidden: []
  };
  for (const section of exploration) {
    const control = section.querySelector("[data-view], [data-category]");
    if (!control) continue;
    const node = /** @type {HTMLElement} */ (section);
    const key = `tab:${control.getAttribute("data-view") ?? control.getAttribute("data-category")}`;
    node.dataset.hudBlock = key;
    node.dataset.hudLabel =
      control.querySelector(".ws-nav-main, span")?.textContent?.trim() ?? key;
    nodes.set(key, node);
    rememberBlockHome(root, node, key);
  }
  // Interpret the released grouped layout without rewriting saved preferences.
  const sectionKeys = [...nodes.keys()];
  const explicitlyPlaced = new Set(
    laneNames.flatMap(name => state.hudLayouts[`${mode}:${name}`]?.order ?? [])
  );
  const groupedKeys = [
    ...tabPreference.order,
    ...sectionKeys.filter(key => !tabPreference.order.includes(key))
  ].filter(key => sectionKeys.includes(key) && !explicitlyPlaced.has(key));
  /** @param {string} name */
  const laneOrder = name => hudLaneOrder(state, mode, name, sectionKeys);
  if (
    exploration.length &&
    (combatSections.length ||
      !laneNames.some(name =>
        state.hudLayouts[`${mode}:${name}`]?.order.includes("actions")
      ))
  ) {
    for (const key of groupedKeys) {
      const node = nodes.get(key);
      if (node) lanes[1]?.append(node);
    }
  }
  for (const [key, selector, label] of HUD_LAYOUT_BLOCKS) {
    if (key === "actions" && combatSections.length) continue;
    const node = /** @type {HTMLElement|null} */ (
      root.querySelector(`[data-hud-block="${key}"]`) ??
        root.querySelector(selector)
    );
    if (!node) continue;
    if (
      ["search", "hints", "rests", "sc-phase"].includes(key) &&
      !lanes.includes(node.parentElement)
    ) {
      const customized = laneNames.some(lane => laneOrder(lane).includes(key));
      if (state.hudEditing || customized) {
        let home = root.querySelector(`[data-hud-home-slot="${key}"]`);
        if (!home) {
          home = root.ownerDocument.createElement("span");
          home.setAttribute("data-hud-home-slot", key);
          home.setAttribute("hidden", "");
          node.before(home);
        }
        if (key === "rests") {
          const health = nodes.get("hp");
          if (health) health.after(node);
          else lanes[0]?.append(node);
        } else if (key === "sc-phase") lanes[0]?.prepend(node);
        else lanes[1]?.prepend(node);
      }
    }
    if (
      ["search", "hints", "rests", "sc-phase"].includes(key) &&
      !state.hudEditing &&
      !laneNames.some(lane => laneOrder(lane).includes(key))
    )
      root.querySelector(`[data-hud-home-slot="${key}"]`)?.after(node);
    // Only whole blocks are movable; nested native controls keep their structure.
    const lane = lanes.indexOf(node.parentElement);
    const footer = node.parentElement?.classList.contains("ws-footer-effects");
    if (
      lane < 0 &&
      !footer &&
      !node.dataset.hudBlock &&
      key !== "search" &&
      key !== "hints" &&
      key !== "rests" &&
      key !== "sc-phase" &&
      key !== "weight"
    )
      continue;
    node.dataset.hudBlock = key;
    node.dataset.hudLabel =
      key === "recent-actions"
        ? (node.getAttribute("aria-label") ?? t(label))
        : t(label);
    if (!node.dataset.hudHome)
      node.dataset.hudHome = footer
        ? "footer"
        : key === "sc-phase" && lane < 0
          ? "info"
          : lane
            ? "actions"
            : "info";
    nodes.set(key, node);
    rememberBlockHome(root, node, key);
  }
  // Responsive default homes follow the native columns, independent of saved placement.
  if (view.classList.contains("ws-player-layout")) {
    const wide = view.classList.contains("ws-player-columns");
    const lane = lanes[wide ? 1 : 0];
    for (const key of ["favorites", "companions"]) {
      const home = root.querySelector(`[data-hud-home-slot="${key}"]`);
      if (!home || !lane || home.parentElement === lane) continue;
      const anchor =
        key === "favorites"
          ? wide
            ? null
            : (nodes.get("effects") ?? nodes.get("hp"))
          : wide
            ? root.querySelector('[data-hud-home-slot="favorites"]')
            : nodes.get("abilities");
      if (anchor?.parentElement === lane) anchor.after(home);
      else lane.prepend(home);
    }
  }
  for (const [index, lane] of lanes.entries()) {
    if (!lane) continue;
    const name = laneNames[index];
    const order = laneOrder(name);
    /** @type {HTMLElement|null} */
    let anchor = null;
    for (const key of [...order].reverse()) {
      const node = nodes.get(key);
      if (!node) continue;
      if (anchor) {
        if (node.parentElement !== lane || node.nextElementSibling !== anchor)
          lane?.insertBefore(node, anchor);
      } else if (node.parentElement !== lane || node !== lane?.lastElementChild)
        lane?.append(node);
      anchor = node;
    }
  }
  for (const button of root.querySelectorAll(
    ".ws-combat-filters [data-category]"
  )) {
    const key = `tab:${button.getAttribute("data-category") ?? button.getAttribute("data-view")}`;
    let node = /** @type {HTMLElement} */ (button.parentElement);
    if (
      !node.classList.contains("ws-exploration-section") &&
      !node.classList.contains("ws-combat-category-section") &&
      !node.classList.contains("ws-hud-tab")
    ) {
      node = root.ownerDocument.createElement("div");
      node.className = "ws-hud-tab";
      button.before(node);
      node.append(button);
    }
    node.dataset.hudBlock = key;
    node.dataset.hudLabel =
      button.querySelector(".ws-nav-main, span")?.textContent?.trim() ??
      button.textContent?.trim() ??
      key;
    nodes.set(key, node);
    rememberBlockHome(root, node, key);
  }
  const hints = nodes.get("hints");
  const hintsPlaced = laneNames.some(name =>
    state.hudLayouts[`${mode}:${name}`]?.order.includes("hints")
  );
  if (hints && lanes[0] && !hintsPlaced) lanes[0].append(hints);
  // Keep the default footer slot until End turn is explicitly placed.
  const turnSlot = playerFooter?.querySelector(":scope > .ws-footer-turn");
  const turnPlaced = laneNames.some(name =>
    state.hudLayouts[`${mode}:${name}`]?.order.includes("end-turn")
  );
  if (turnSlot && playerFooter && !turnPlaced) {
    const footerControls = playerFooter.querySelector(
      ":scope > .ws-footer-controls"
    );
    if (footerControls) footerControls.before(turnSlot);
    else playerFooter.append(turnSlot);
  }
  /** @type {HTMLElement|null} */
  let tabAnchor = null;
  for (const key of [...tabPreference.order].reverse()) {
    const node = nodes.get(key);
    if (!node || node.parentElement?.hasAttribute("data-hud-lane")) continue;
    if (tabAnchor && tabAnchor.parentElement === node.parentElement) {
      if (node.nextElementSibling !== tabAnchor) tabAnchor.before(node);
    } else if (node !== node.parentElement?.lastElementChild)
      node.parentElement?.append(node);
    tabAnchor = node;
  }
  const hidden = new Set(
    ["info", "actions", "extra", "footer", "tabs"].flatMap(
      lane => state.hudLayouts[`${mode}:${lane}`]?.hidden ?? []
    )
  );
  if (hidden.has("currency")) hidden.add("weight");
  for (const key of ["search", "hints"])
    if (hudElementHidden(state, key)) hidden.add(key);
  if (exploration.length && hidden.has("actions")) {
    hidden.delete("actions");
    for (const key of sectionKeys) hidden.add(key);
  }
  // Mode navigation stays available at the top, including with legacy layouts.
  hidden.delete("modes");
  /** @param {string} action @param {string} icon @param {string} label @param {HTMLElement} node */
  const button = (action, icon, label, node) => {
    const control = root.ownerDocument.createElement("button");
    control.type = "button";
    control.className = "ws-button";
    control.dataset.action = action;
    control.dataset.hudKey = node.dataset.hudBlock ?? "";
    control.title = t(label);
    control.setAttribute("aria-label", `${t(label)}: ${node.dataset.hudLabel}`);
    const glyph = root.ownerDocument.createElement("i");
    glyph.className = `fa-solid ${icon}`;
    glyph.setAttribute("aria-hidden", "true");
    control.append(glyph);
    return control;
  };
  for (const [key, node] of nodes) {
    node.classList.toggle("ws-hud-block-hidden", hidden.has(key));
    const previousTools = /** @type {HTMLElement|null} */ (
      node.querySelector(":scope > .ws-hud-block-tools")
    );
    if (!state.hudEditing || hidden.has(key) || key === "weight") {
      previousTools?.remove();
      continue;
    }
    const peers = [...(node.parentElement?.children ?? [])].filter(
      peer =>
        peer.hasAttribute("data-hud-block") &&
        !hidden.has(peer.getAttribute("data-hud-block") ?? "")
    );
    const index = peers.indexOf(node);
    const signature = JSON.stringify([
      node.dataset.hudLabel,
      node.parentElement?.hasAttribute("data-hud-lane"),
      lanes.indexOf(node.parentElement),
      lanes.length,
      index,
      peers.length,
      [
        "ItemLayout.Drag",
        "ItemLayout.Top",
        "ItemLayout.Up",
        "ItemLayout.Down",
        "ItemLayout.Bottom",
        "HudLayout.ColumnLeft",
        "HudLayout.ColumnRight",
        "ItemLayout.Hide",
        "HudLayout.ResetBlock"
      ].map(t)
    ]);
    if (previousTools?.dataset.editorSignature === signature) continue;
    const tools = root.ownerDocument.createElement("div");
    tools.className = "ws-hud-block-tools";
    tools.dataset.editorSignature = signature;
    const grip = button(
      "hudblockmove",
      "fa-grip-vertical",
      "ItemLayout.Drag",
      node
    );
    grip.classList.add("ws-hud-block-grip");
    grip.draggable = true;
    if (
      node.parentElement?.hasAttribute("data-hud-lane") ||
      key.startsWith("tab:")
    )
      tools.append(grip);
    const title = root.ownerDocument.createElement("span");
    title.textContent = node.dataset.hudLabel ?? "";
    tools.append(title);
    if (
      node.parentElement?.hasAttribute("data-hud-lane") ||
      key.startsWith("tab:")
    ) {
      for (const [direction, icon, label] of [
        ["top", "fa-angles-up", "ItemLayout.Top"],
        ["up", "fa-arrow-up", "ItemLayout.Up"],
        ["down", "fa-arrow-down", "ItemLayout.Down"],
        ["bottom", "fa-angles-down", "ItemLayout.Bottom"],
        ["left", "fa-arrow-left", "HudLayout.ColumnLeft"],
        ["right", "fa-arrow-right", "HudLayout.ColumnRight"]
      ]) {
        if (
          key.startsWith("tab:") &&
          !node.parentElement?.hasAttribute("data-hud-lane") &&
          ["left", "right"].includes(direction)
        )
          continue;
        const control = button("hudblockmove", icon, label, node);
        control.dataset.hudDirection = direction;
        if (["up", "top"].includes(direction)) control.disabled = index <= 0;
        if (["down", "bottom"].includes(direction))
          control.disabled = index < 0 || index === peers.length - 1;
        if (direction === "left")
          control.disabled = lanes.indexOf(node.parentElement) <= 0;
        if (direction === "right")
          control.disabled =
            lanes.indexOf(node.parentElement) >= lanes.length - 1;
        tools.append(control);
      }
    }
    tools.append(
      button("hudblockhide", "fa-eye-slash", "ItemLayout.Hide", node)
    );
    tools.append(
      button(
        "hudblockreset",
        "fa-arrow-rotate-left",
        "HudLayout.ResetBlock",
        node
      )
    );
    if (previousTools) updateEditorControls(previousTools, tools);
    else node.prepend(tools);
  }
  if (playerFooter) {
    playerFooter.hidden =
      !state.hudEditing &&
      ![...playerFooter.children].some(
        child =>
          !child.hasAttribute("hidden") &&
          !child.classList.contains("ws-hud-block-hidden") &&
          Boolean(
            child.textContent?.trim() ||
            child.querySelector("button, .ws-combat-statuses")
          )
      );
  }
  if (!state.hudEditing) {
    oldControls?.remove();
    // Hiding identity must not hide independently visible rest controls.
    const rests = nodes.get("rests");
    if (hidden.has("identity") && rests?.closest(".ws-actor-header")) {
      const health = nodes.get("hp");
      if (health) health.after(rests);
      else lanes[0]?.append(rests);
    }
    restoreFocus();
    return;
  }
  // Read all toolbar heights before writing padding, including wrapped controls.
  const editorSpacing = [...root.querySelectorAll(".ws-hud-block-tools")].map(
    tools => {
      const toolbar = /** @type {HTMLElement} */ (tools);
      return {
        parent: /** @type {HTMLElement|null} */ (toolbar.parentElement),
        value: `${Math.max(58, (toolbar.offsetHeight || 0) + 8)}px`
      };
    }
  );
  for (const { parent, value } of editorSpacing)
    if (
      parent &&
      parent.style.getPropertyValue("--ws-hud-editor-space") !== value
    )
      parent.style.setProperty("--ws-hud-editor-space", value);
  const controlsSignature = JSON.stringify([
    mode,
    Boolean(extraLane),
    state.hudLayoutUndo?.mode === mode,
    [...hidden].map(key => [
      key,
      nodes.get(key)?.dataset.hudLabel ?? blockLabel(key, t)
    ]),
    [
      "HudLayout.HiddenBlocks",
      "ItemLayout.Show",
      "HudLayout.ResetBlock",
      "HudLayout.Hint",
      "HudLayout.Undo",
      "HudLayout.RemoveColumn",
      "HudLayout.AddColumn",
      "HudLayout.ResetLayout",
      "HudLayout.InventorySummary"
    ].map(t)
  ]);
  if (oldControls?.dataset.editorSignature === controlsSignature) {
    restoreFocus();
    return;
  }
  const menu = root.ownerDocument.createElement("details");
  menu.className = "ws-hud-layout-menu";
  menu.open = oldMenu?.hasAttribute("open") ?? false;
  const summary = root.ownerDocument.createElement("summary");
  summary.textContent = `${t("HudLayout.HiddenBlocks")} · ${[...hidden].filter(key => key !== "weight" && key !== "currency").length}`;
  menu.append(summary);
  for (const key of hidden) {
    if (key === "weight" || key === "currency") continue;
    const node = nodes.get(key) ?? root.ownerDocument.createElement("div");
    if (!nodes.has(key)) {
      node.dataset.hudBlock = key;
      node.dataset.hudLabel = blockLabel(key, t);
    }
    const row = root.ownerDocument.createElement("div");
    row.className = "ws-hud-layout-restore";
    const name = root.ownerDocument.createElement("span");
    name.textContent = node.dataset.hudLabel ?? "";
    row.append(
      name,
      button("hudblockhide", "fa-eye", "ItemLayout.Show", node),
      button(
        "hudblockreset",
        "fa-arrow-rotate-left",
        "HudLayout.ResetBlock",
        node
      )
    );
    menu.append(row);
  }
  const hint = root.ownerDocument.createElement("small");
  hint.textContent = t("HudLayout.Hint");
  menu.append(hint);
  const controls = root.ownerDocument.createElement("div");
  controls.className = "ws-hud-layout-controls";
  controls.dataset.editorSignature = controlsSignature;
  const undo = root.ownerDocument.createElement("button");
  undo.type = "button";
  undo.className = "ws-button ws-hud-layout-undo";
  undo.dataset.action = "hudlayoutundo";
  undo.textContent = t("HudLayout.Undo");
  undo.disabled = !state.hudLayoutUndo || state.hudLayoutUndo.mode !== mode;
  const extraControl = root.ownerDocument.createElement("button");
  extraControl.type = "button";
  extraControl.className = "ws-button";
  extraControl.dataset.action = "hudcolumnadd";
  extraControl.textContent = t(
    extraLane ? "HudLayout.RemoveColumn" : "HudLayout.AddColumn"
  );
  const reset = root.ownerDocument.createElement("button");
  reset.type = "button";
  reset.className = "ws-button";
  reset.dataset.action = "hudlayoutreset";
  reset.textContent = t("HudLayout.ResetLayout");
  controls.append(undo, reset);
  if (!preparation) controls.append(extraControl);
  if (!preparation) {
    const inventory = root.ownerDocument.createElement("div");
    inventory.dataset.hudBlock = "weight";
    inventory.dataset.hudLabel = t("HudLayout.InventorySummary");
    const row = root.ownerDocument.createElement("div");
    row.className = "ws-hud-layout-fixed";
    const label = root.ownerDocument.createElement("span");
    label.textContent = inventory.dataset.hudLabel;
    const toggle = button(
      "hudblockhide",
      hidden.has("weight") ? "fa-eye" : "fa-eye-slash",
      hidden.has("weight") ? "ItemLayout.Show" : "ItemLayout.Hide",
      inventory
    );
    toggle.setAttribute("aria-pressed", String(!hidden.has("weight")));
    row.append(label, toggle);
    controls.append(row);
  }
  controls.append(menu);
  if (oldControls) updateEditorControls(oldControls, controls);
  else lanes[0]?.prepend(controls);
  restoreFocus();
}

/** @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state @param {HTMLElement} target @param {boolean} hide */
export function changeHudLayout(root, state, target, hide = false) {
  if (!state.hudEditing) return false;
  const focused = /** @type {HTMLElement|null} */ (
    root.ownerDocument.activeElement
  );
  const view = root.querySelector("[data-hud-layout-mode]");
  const key = target.dataset.hudKey;
  const nodes = [...root.querySelectorAll("[data-hud-block]")];
  const node = nodes.find(node => node.getAttribute("data-hud-block") === key);
  if (!view || !key || key === "modes" || (!node && !hide)) return false;
  if (!hide && (key === "weight" || key === "currency")) return false;
  const mode = view.getAttribute("data-hud-layout-mode");
  const lane = node?.parentElement;
  const laneName =
    key.startsWith("tab:") && !lane?.hasAttribute("data-hud-lane")
      ? "tabs"
      : (lane?.getAttribute("data-hud-lane") ?? "footer");
  if (hide) {
    const sectionKeys = [
      "tab:skills",
      "tab:spells",
      "tab:inventory",
      ...[
        ...view.querySelectorAll(
          ".ws-exploration-section[data-hud-block], .ws-combat-category-section[data-hud-block]"
        )
      ].map(section => section.getAttribute("data-hud-block") ?? "")
    ];
    toggleHudBlockHidden(state, mode ?? "", key, laneName, sectionKeys);
    return true;
  }
  if (key.startsWith("tab:") && node && !lane?.hasAttribute("data-hud-lane")) {
    const destination = nodes.find(
      candidate =>
        candidate.getAttribute("data-hud-block") ===
        target.dataset.hudDestination
    );
    const peers = [...(lane?.children ?? [])].filter(
      child =>
        child.getAttribute("data-hud-block")?.startsWith("tab:") &&
        !child.classList.contains("ws-hud-block-hidden")
    );
    const index = peers.indexOf(node);
    if (
      destination &&
      destination !== node &&
      destination.parentElement === lane &&
      destination.getAttribute("data-hud-block")?.startsWith("tab:")
    )
      destination.before(node);
    else if (target.dataset.hudDirection === "top" && index > 0)
      peers[0].before(node);
    else if (
      target.dataset.hudDirection === "bottom" &&
      index >= 0 &&
      index < peers.length - 1
    )
      peers[peers.length - 1].after(node);
    else if (target.dataset.hudDirection === "up" && peers[index - 1])
      peers[index - 1].before(node);
    else if (target.dataset.hudDirection === "down" && peers[index + 1])
      peers[index + 1].after(node);
    else return false;
    const preference = state.hudLayouts[`${mode}:tabs`] ?? {
      order: [],
      hidden: []
    };
    const available = new Set(
      peers.map(child => child.getAttribute("data-hud-block"))
    );
    state.hudLayouts[`${mode}:tabs`] = {
      ...preference,
      order: [
        ...[...(lane?.children ?? [])]
          .filter(child =>
            child.getAttribute("data-hud-block")?.startsWith("tab:")
          )
          .map(child => child.getAttribute("data-hud-block") ?? ""),
        ...preference.order.filter(
          id =>
            !available.has(id) &&
            ![...(lane?.children ?? [])].some(
              child => child.getAttribute("data-hud-block") === id
            )
        )
      ]
    };
    if (focused?.isConnected && node.contains(focused))
      focused.focus({ preventScroll: true });
    return true;
  }
  if (!node || !lane?.hasAttribute("data-hud-lane")) return false;
  const laneList = [...root.querySelectorAll("[data-hud-lane]")].filter(
    lane => !lane.hasAttribute("data-action")
  );
  const other = laneList[(laneList.indexOf(lane) + 1) % laneList.length];
  const adjacent =
    laneList[
      laneList.indexOf(lane) + (target.dataset.hudDirection === "left" ? -1 : 1)
    ];
  const targetLane = target.dataset.hudLane
    ? laneList.find(
        candidate =>
          candidate.getAttribute("data-hud-lane") === target.dataset.hudLane
      )
    : null;
  const destinationKey = target.dataset.hudDestination;
  const destination = nodes.find(
    candidate => candidate.getAttribute("data-hud-block") === destinationKey
  );
  const peers = [...lane.children].filter(
    child =>
      child.hasAttribute("data-hud-block") &&
      !child.classList.contains("ws-hud-block-hidden")
  );
  const index = peers.indexOf(node);
  if (targetLane && targetLane !== lane) targetLane.prepend(node);
  else if (
    destination &&
    destination !== node &&
    destination.parentElement?.hasAttribute("data-hud-lane")
  )
    destination.before(node);
  else if (target.dataset.hudDirection === "column" && other)
    other.prepend(node);
  else if (
    ["left", "right"].includes(target.dataset.hudDirection ?? "") &&
    adjacent
  )
    adjacent.prepend(node);
  else if (target.dataset.hudDirection === "top" && index > 0)
    peers[0].before(node);
  else if (
    target.dataset.hudDirection === "bottom" &&
    index >= 0 &&
    index < peers.length - 1
  )
    peers[peers.length - 1].after(node);
  else if (target.dataset.hudDirection === "up" && peers[index - 1])
    peers[index - 1].before(node);
  else if (target.dataset.hudDirection === "down" && peers[index + 1])
    peers[index + 1].after(node);
  else return false;
  saveHudLaneOrders(view, state, mode ?? "", nodes);
  if (focused?.isConnected && node.contains(focused))
    focused.focus({ preventScroll: true });
  return true;
}

/** @param {Element} view @param {import('../../../types/hud.js').HudState} state @param {string} mode @param {Element[]} nodes */
function saveHudLaneOrders(view, state, mode, nodes) {
  const layout = view.closest(".ws-player-frame") ?? view;
  for (const name of ["info", "actions", "extra", "footer"]) {
    const parent = layout.querySelector(`[data-hud-lane="${name}"]`);
    if (!parent) continue;
    const scope = `${mode}:${name}`;
    const preference = state.hudLayouts[scope] ?? { order: [], hidden: [] };
    const present = [...(parent?.children ?? [])]
      .filter(child => {
        const key = child.getAttribute("data-hud-block");
        return key && key !== "weight" && key !== "currency";
      })
      .map(child => child.getAttribute("data-hud-block") ?? "");
    const available = new Set(
      nodes
        .map(node => node.getAttribute("data-hud-block"))
        .filter(key => key !== "weight" && key !== "currency")
    );
    state.hudLayouts[scope] = {
      ...preference,
      order: [...present, ...preference.order.filter(id => !available.has(id))]
    };
  }
}

/** @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state @param {HTMLElement} target */
export function resetHudBlock(root, state, target) {
  const focused = /** @type {HTMLElement|null} */ (
    root.ownerDocument.activeElement
  );
  const view = root.querySelector("[data-hud-layout-mode]");
  const mode = view?.getAttribute("data-hud-layout-mode");
  const key = target.dataset.hudKey;
  if (!state.hudEditing || !view || !mode || !key || key === "modes")
    return false;
  const nodes = [...root.querySelectorAll("[data-hud-block]")];
  const node = nodes.find(node => node.getAttribute("data-hud-block") === key);
  const home = root.querySelector(`[data-hud-home-slot="${key}"]`);
  if (
    mode === "regular" &&
    key.startsWith("tab:") &&
    Object.entries(state.hudLayouts).some(
      ([scope, value]) =>
        scope.startsWith("regular:") && value.hidden.includes("actions")
    )
  )
    changeHudLayout(root, state, target, true);
  resetHudBlockPreferences(state, mode, key);
  if (!node || !home?.parentElement) return true;
  node.classList.remove("ws-hud-block-hidden");
  const parent = home.parentElement;
  const homes = [...parent.children].filter(child =>
    child.hasAttribute("data-hud-home-slot")
  );
  const index = homes.indexOf(home);
  /** @param {Element[]} slots */
  const neighbor = slots =>
    slots
      .map(slot =>
        nodes.find(
          candidate =>
            candidate.getAttribute("data-hud-block") ===
              slot.getAttribute("data-hud-home-slot") &&
            candidate.parentElement === parent &&
            candidate !== node
        )
      )
      .find(Boolean);
  const next = neighbor(homes.slice(index + 1));
  const previous = neighbor(homes.slice(0, index).reverse());
  if (next) next.before(node);
  else if (previous) previous.after(node);
  else home.after(node);
  if (parent.hasAttribute("data-hud-lane"))
    saveHudLaneOrders(view, state, mode, nodes);
  else if (key.startsWith("tab:")) {
    const preference = state.hudLayouts[`${mode}:tabs`] ?? {
      order: [],
      hidden: []
    };
    const peers = [...parent.children].filter(child =>
      child.getAttribute("data-hud-block")?.startsWith("tab:")
    );
    const keys = peers.map(child => child.getAttribute("data-hud-block") ?? "");
    state.hudLayouts[`${mode}:tabs`] = {
      ...preference,
      order: [...keys, ...preference.order.filter(id => !keys.includes(id))]
    };
  }
  if (focused?.isConnected && node.contains(focused))
    focused.focus({ preventScroll: true });
  return true;
}

/** Reset only this mode's block layout; native cards and other preferences remain intact.
 * @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state
 */
export function resetHudLayout(root, state) {
  const mode = root
    .querySelector("[data-hud-layout-mode]")
    ?.getAttribute("data-hud-layout-mode");
  if (!state.hudEditing || !mode) return false;
  const keys = new Set([
    "search",
    "hints",
    ...[...root.querySelectorAll("[data-hud-block]")].map(node =>
      node.getAttribute("data-hud-block")
    )
  ]);
  for (const key of keys) {
    if (!key || key === "modes") continue;
    const target = root.ownerDocument.createElement("button");
    target.dataset.hudKey = key;
    resetHudBlock(root, state, target);
  }
  for (const scope of Object.keys(state.hudLayouts))
    if (scope.startsWith(`${mode}:`)) delete state.hudLayouts[scope];
  return true;
}
