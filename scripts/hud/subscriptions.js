import { hpChange } from "./health-feedback.js";

export function subscribeHudDocuments({
  actor,
  hooks,
  scheduleRefresh,
  readHp,
  onHpChange,
  onInitiativeRequest,
  onInitiativeRolled,
  isCurrentCombatant
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
        const change = hpChange(previousHp, nextHp);
        if (change) onHpChange?.(change);
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
    [
      "createCombatant",
      combatant => {
        if (combatant?.initiative == null && isCurrentCombatant?.(combatant)) {
          onInitiativeRequest?.();
        }
        scheduleRefresh();
      }
    ],
    [
      "updateCombatant",
      (combatant, changes) => {
        scheduleRefresh();
        if (
          changes?.initiative != null &&
          combatant?.initiative != null &&
          isCurrentCombatant?.(combatant)
        ) {
          onInitiativeRolled?.();
        }
      }
    ],
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
