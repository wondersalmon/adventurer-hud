// @ts-check
/** Personal block layout; never changes native documents or roll handlers. */
/** @type {[string, string, string][]} */
export const HUD_LAYOUT_BLOCKS = [
  ["shared-senses", ".ws-familiar-vision", "Companions.VisionAction"],
  ["identity", ".ws-actor-header, .ws-gm-identity", "HudLayout.Identity"],
  ["modes", ".ws-mode-navigation", "Labels.Mode"],
  ["return", ".ws-companion-navigation", "HudLayout.Return"],
  ["hp", ".ws-regular-health, .ws-health-stack", "Combat.HP"],
  ["rests", ".ws-exploration-rests", "Labels.Rests"],
  ["effects", ".ws-combat-statuses", "HudLayout.Effects"],
  ["favorites", ".ws-player-favorites", "Quick.Favorites"],
  [
    "stats",
    ".ws-regular-stats, .ws-player-stats, .ws-gm-info > .ws-combat-stats",
    "HudLayout.Stats"
  ],
  ["abilities", ".ws-ability-table, .ws-gm-saves", "HudLayout.Abilities"],
  ["companions", ".ws-companions-panel", "Companions.Title"],
  ["actions", ".ws-combat-actions, .ws-exploration-nav", "HudLayout.Actions"],
  ["resources", ".ws-gm-resources", "HudLayout.Resources"],
  ["traits", ".ws-gm-traits", "HudLayout.Traits"],
  ["search", ".ws-global-search, .ws-item-search", "Quick.Search"],
  ["hints", ".ws-shortcuts", "HudLayout.Hints"]
];

/** @param {Partial<import('../../../types/hud.js').HudState>|undefined} state @param {string} key */
export const hudElementHidden = (state, key) =>
  Object.values(state?.hudLayouts ?? {}).some(preference =>
    preference.hidden.includes(key)
  );

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
  const view = root.querySelector(".ws-player-layout, .ws-gm-body");
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
  if (!view) {
    oldMenu?.remove();
    return;
  }
  const mode = view.closest("#ws-combat") ? "combat" : "regular";
  view.setAttribute("data-hud-layout-mode", mode);
  const lanes = [
    view.querySelector(".ws-player-info, .ws-gm-info"),
    view.querySelector(".ws-player-actions, .ws-gm-action-column")
  ];
  if (!lanes[0] || !lanes[1]) return;
  lanes.forEach((lane, index) =>
    lane?.setAttribute("data-hud-lane", index ? "actions" : "info")
  );
  /** @type {Map<string, HTMLElement>} */
  const nodes = new Map();
  for (const [key, selector, label] of HUD_LAYOUT_BLOCKS) {
    const node = /** @type {HTMLElement|null} */ (
      root.querySelector(`[data-hud-block="${key}"]`) ??
        root.querySelector(selector)
    );
    if (!node) continue;
    if (
      (key === "search" || key === "hints" || key === "rests") &&
      !lanes.includes(node.parentElement)
    ) {
      const customized = ["info", "actions"].some(lane =>
        state.hudLayouts[`${mode}:${lane}`]?.order.includes(key)
      );
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
        } else lanes[1]?.prepend(node);
      }
    }
    if (
      (key === "search" || key === "hints" || key === "rests") &&
      !state.hudEditing &&
      !["info", "actions"].some(lane =>
        state.hudLayouts[`${mode}:${lane}`]?.order.includes(key)
      )
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
      key !== "rests"
    )
      continue;
    node.dataset.hudBlock = key;
    node.dataset.hudLabel = t(label);
    if (!node.dataset.hudHome)
      node.dataset.hudHome = footer ? "footer" : lane ? "actions" : "info";
    nodes.set(key, node);
  }
  for (const [index, lane] of lanes.entries()) {
    const name = index ? "actions" : "info";
    const order = state.hudLayouts[`${mode}:${name}`]?.order ?? [];
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
  const tabPreference = state.hudLayouts[`${mode}:tabs`] ?? {
    order: [],
    hidden: []
  };
  for (const button of root.querySelectorAll(
    ".ws-combat-filters [data-category], .ws-exploration-section > [data-view]"
  )) {
    const key = `tab:${button.getAttribute("data-category") ?? button.getAttribute("data-view")}`;
    let node = /** @type {HTMLElement} */ (button.parentElement);
    if (
      !node.classList.contains("ws-exploration-section") &&
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
  }
  /** @type {HTMLElement|null} */
  let tabAnchor = null;
  for (const key of [...tabPreference.order].reverse()) {
    const node = nodes.get(key);
    if (!node) continue;
    if (tabAnchor && tabAnchor.parentElement === node.parentElement) {
      if (node.nextElementSibling !== tabAnchor) tabAnchor.before(node);
    } else if (node !== node.parentElement?.lastElementChild)
      node.parentElement?.append(node);
    tabAnchor = node;
  }
  const hidden = new Set(
    ["info", "actions", "footer", "tabs"].flatMap(
      lane => state.hudLayouts[`${mode}:${lane}`]?.hidden ?? []
    )
  );
  for (const key of ["search", "hints"])
    if (hudElementHidden(state, key)) hidden.add(key);
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
    node.querySelector(":scope > .ws-hud-block-tools")?.remove();
    if (!state.hudEditing || hidden.has(key)) continue;
    const tools = root.ownerDocument.createElement("div");
    tools.className = "ws-hud-block-tools";
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
        ["up", "fa-arrow-up", "ItemLayout.Up"],
        ["down", "fa-arrow-down", "ItemLayout.Down"],
        ["column", "fa-arrows-left-right", "HudLayout.OtherColumn"]
      ]) {
        if (key.startsWith("tab:") && direction === "column") continue;
        const control = button("hudblockmove", icon, label, node);
        control.dataset.hudDirection = direction;
        tools.append(control);
      }
    }
    tools.append(
      button("hudblockhide", "fa-eye-slash", "ItemLayout.Hide", node)
    );
    node.prepend(tools);
  }
  oldMenu?.remove();
  if (!state.hudEditing) {
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
  const menu = root.ownerDocument.createElement("details");
  menu.className = "ws-hud-layout-menu";
  menu.open = oldMenu?.hasAttribute("open") ?? false;
  const summary = root.ownerDocument.createElement("summary");
  summary.textContent = `${t("HudLayout.HiddenBlocks")} · ${hidden.size}`;
  menu.append(summary);
  for (const key of hidden) {
    const node = nodes.get(key) ?? root.ownerDocument.createElement("div");
    if (!nodes.has(key)) {
      node.dataset.hudBlock = key;
      node.dataset.hudLabel = key.startsWith("tab:")
        ? key.slice(4)
        : t(HUD_LAYOUT_BLOCKS.find(block => block[0] === key)?.[2] ?? key);
    }
    const row = root.ownerDocument.createElement("div");
    row.className = "ws-hud-layout-restore";
    const name = root.ownerDocument.createElement("span");
    name.textContent = node.dataset.hudLabel ?? "";
    row.append(name, button("hudblockhide", "fa-eye", "ItemLayout.Show", node));
    menu.append(row);
  }
  const hint = root.ownerDocument.createElement("small");
  hint.textContent = t("HudLayout.Hint");
  menu.append(hint);
  lanes[0]?.prepend(menu);
  restoreFocus();
}

/** @param {HTMLElement} root @param {import('../../../types/hud.js').HudState} state @param {HTMLElement} target @param {boolean} hide */
export function changeHudLayout(root, state, target, hide = false) {
  if (!state.hudEditing) return false;
  const view = root.querySelector("[data-hud-layout-mode]");
  const key = target.dataset.hudKey;
  const nodes = [...root.querySelectorAll("[data-hud-block]")];
  const node = nodes.find(node => node.getAttribute("data-hud-block") === key);
  if (!view || !key || (!node && !hide)) return false;
  const mode = view.getAttribute("data-hud-layout-mode");
  const shared = key === "search" || key === "hints";
  const lane = node?.parentElement;
  const laneName = key.startsWith("tab:")
    ? "tabs"
    : (lane?.getAttribute("data-hud-lane") ?? "footer");
  if (hide) {
    const scope = `${mode}:${laneName}`;
    const preference = state.hudLayouts[scope] ?? { order: [], hidden: [] };
    const wasHidden = Object.entries(state.hudLayouts).some(
      ([scope, value]) =>
        (shared || scope.startsWith(`${mode}:`)) && value.hidden.includes(key)
    );
    if (wasHidden)
      for (const [scope, value] of Object.entries(state.hudLayouts)) {
        if (shared || scope.startsWith(`${mode}:`))
          value.hidden = value.hidden.filter(id => id !== key);
      }
    else
      state.hudLayouts[scope] = {
        ...preference,
        hidden: [...preference.hidden, key]
      };
    if (key === "search") state.searchQuery = "";
    if (!wasHidden && key.startsWith("tab:")) {
      const category = key.slice(4);
      if (state.combatCategory === category) state.combatCategory = null;
      if (state.currentView === category) {
        state.currentView = "main";
        if (category === "skills") state.explorationSkillsCollapsed = true;
      }
    }
    return true;
  }
  if (key.startsWith("tab:") && node) {
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
    return true;
  }
  if (!node || !lane?.hasAttribute("data-hud-lane")) return false;
  const other = [...view.querySelectorAll("[data-hud-lane]")].find(
    candidate => candidate !== lane
  );
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
  if (
    destination &&
    destination !== node &&
    destination.parentElement?.hasAttribute("data-hud-lane")
  )
    destination.before(node);
  else if (target.dataset.hudDirection === "column" && other)
    other.append(node);
  else if (target.dataset.hudDirection === "up" && peers[index - 1])
    peers[index - 1].before(node);
  else if (target.dataset.hudDirection === "down" && peers[index + 1])
    peers[index + 1].after(node);
  else return false;
  for (const name of ["info", "actions"]) {
    const parent = view.querySelector(`[data-hud-lane="${name}"]`);
    const scope = `${mode}:${name}`;
    const preference = state.hudLayouts[scope] ?? { order: [], hidden: [] };
    const present = [...(parent?.children ?? [])]
      .filter(child => child.hasAttribute("data-hud-block"))
      .map(child => child.getAttribute("data-hud-block") ?? "");
    const available = new Set(
      nodes.map(node => node.getAttribute("data-hud-block"))
    );
    state.hudLayouts[scope] = {
      ...preference,
      order: [...present, ...preference.order.filter(id => !available.has(id))]
    };
  }
  return true;
}

/** @param {{element:HTMLElement,isActive:()=>boolean,move:(event:Event,target:HTMLElement)=>unknown}} options */
export function bindHudLayoutDrag({ element, isActive, move }) {
  /** @type {HTMLElement|null} */
  let source = null;
  /** @param {Event} event */
  const start = event => {
    const grip = /** @type {Element|null} */ (event.target)?.closest?.(
      ".ws-hud-block-grip"
    );
    if (!grip || !isActive()) return;
    source = /** @type {HTMLElement|null} */ (grip.closest("[data-hud-block]"));
    event.stopPropagation();
    /** @type {DragEvent} */ (event).dataTransfer?.setData(
      "text/plain",
      source?.dataset.hudBlock ?? ""
    );
  };
  /** @param {Event} event */
  const destination = event => {
    let node = /** @type {HTMLElement|null} */ (
      /** @type {Element|null} */ (event.target)?.closest?.("[data-hud-block]")
    );
    if (source?.dataset.hudBlock?.startsWith("tab:"))
      return source.isConnected &&
        isActive() &&
        node !== source &&
        node?.dataset.hudBlock?.startsWith("tab:") &&
        node.parentElement === source.parentElement
        ? node
        : null;
    while (node && !node.parentElement?.hasAttribute("data-hud-lane"))
      node = /** @type {HTMLElement|null} */ (
        node.parentElement?.closest("[data-hud-block]")
      );
    return source?.isConnected &&
      isActive() &&
      node !== source &&
      node?.parentElement?.hasAttribute("data-hud-lane") &&
      node.closest("[data-hud-layout-mode]") ===
        source.closest("[data-hud-layout-mode]")
      ? node
      : null;
  };
  /** @param {Event} event */
  const over = event => {
    if (destination(event)) event.preventDefault();
  };
  /** @param {Event} event */
  const drop = event => {
    const node = destination(event);
    if (!node || !source) return;
    event.preventDefault();
    event.stopPropagation();
    const target = element.ownerDocument.createElement("button");
    target.dataset.hudKey = source.dataset.hudBlock;
    target.dataset.hudDestination = node.dataset.hudBlock;
    source = null;
    void move(event, target);
  };
  const end = () => {
    source = null;
  };
  /** @type {[string,(event:Event)=>void][]} */
  const listeners = [
    ["dragstart", start],
    ["dragover", over],
    ["drop", drop],
    ["dragend", end]
  ];
  for (const [type, handler] of listeners)
    element.addEventListener(type, handler, true);
  return () => {
    source = null;
    for (const [type, handler] of listeners)
      element.removeEventListener(type, handler, true);
  };
}
