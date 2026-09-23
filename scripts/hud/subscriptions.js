export function subscribeHudDocuments({
  actor,
  hooks,
  scheduleRefresh,
  readHp,
  onHpChange
}) {
  let previousHp = readHp?.() ?? null;
  const refreshActorEffect = effect => {
    if (effect?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
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
        if (updatedActor.uuid !== actor.uuid) return;
        const nextHp = readHp?.() ?? null;
        if (previousHp && nextHp) {
          const before = previousHp.value + previousHp.temp;
          const after = nextHp.value + nextHp.temp;
          if (after !== before)
            onHpChange?.(after > before ? "heal" : "damage");
        }
        previousHp = nextHp;
        scheduleRefresh();
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
