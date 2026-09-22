export function subscribeHudDocuments({ actor, hooks, scheduleRefresh }) {
  const refreshActorEffect = effect => {
    if (effect?.parent?.uuid === actor.uuid) {
      scheduleRefresh("conditions");
    }
  };

  const refreshActorItem = item => {
    if (item?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
    }
  };

  const subscriptions = [
    [
      "updateActor",
      updatedActor => {
        if (updatedActor.uuid === actor.uuid) scheduleRefresh();
      }
    ],
    ["createActiveEffect", refreshActorEffect],
    ["updateActiveEffect", refreshActorEffect],
    ["deleteActiveEffect", refreshActorEffect],
    ["createItem", refreshActorItem],
    ["updateItem", refreshActorItem],
    ["deleteItem", refreshActorItem],
    ["createCombat", () => scheduleRefresh()],
    ["updateCombat", () => scheduleRefresh()],
    ["deleteCombat", () => scheduleRefresh()],
    ["createCombatant", () => scheduleRefresh()],
    ["updateCombatant", () => scheduleRefresh()],
    ["deleteCombatant", () => scheduleRefresh()]
  ];

  const hookIds = subscriptions.map(([hook, callback]) => [
    hook,
    hooks.on(hook, callback)
  ]);

  return () => {
    for (const [hook, id] of hookIds) hooks.off(hook, id);
  };
}
