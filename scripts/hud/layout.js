export const LAYOUT_SCHEMA = Object.freeze({
  regular: Object.freeze({
    navigation: ".ws-mode-navigation",
    abilities: ".ws-ability-table",
    destinations: ".ws-nav-grid",
    shortcuts: ".ws-shortcuts"
  }),
  combat: Object.freeze({
    navigation: ".ws-mode-navigation",
    heading: ".ws-combat-heading",
    stats: ".ws-combat-stats",
    resources: ".ws-combat-resources",
    conditions: ".ws-combat-statuses",
    saves: ".ws-ability-table",
    actions: ".ws-combat-actions",
    shortcuts: ".ws-shortcuts"
  }),
  death: Object.freeze({
    navigation: ".ws-mode-navigation",
    heading: ".ws-death-heading",
    tracker: ".ws-death-tracker",
    roll: ".ws-death-roll-section",
    shortcuts: ".ws-shortcuts"
  })
});

export function normalizeModeLayout(mode, saved = {}) {
  const defaults = Object.keys(LAYOUT_SCHEMA[mode] ?? {});
  const savedOrder = Array.isArray(saved.order) ? saved.order : [];
  const order = [
    ...savedOrder.filter(id => defaults.includes(id)),
    ...defaults.filter(id => !savedOrder.includes(id))
  ];

  return {
    order: [...new Set(order)],
    hidden: (Array.isArray(saved.hidden) ? saved.hidden : []).filter(id =>
      defaults.includes(id)
    )
  };
}
