import { hpChange } from "./health-feedback.js";

export function subscribeHudDocuments({
  actor,
  hooks,
  scheduleRefresh,
  readHp,
  onHpChange,
  onInitiativeRequest,
  onInitiativeRolled,
  onTurnStart,
  onToolsChange,
  isCurrentCombatant,
  isPlayersTurn
}) {
  let previousHp = readHp?.() ?? null;
  let wasPlayersTurn = Boolean(isPlayersTurn?.());
  const refreshCombat = () => {
    scheduleRefresh();
    const playersTurn = Boolean(isPlayersTurn?.());
    if (playersTurn && !wasPlayersTurn) onTurnStart?.();
    wasPlayersTurn = playersTurn;
  };
  const refreshActorEffect = effect => {
    if (effect?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
    }
  };

  const refreshActorItem = item => {
    if (item?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
      if (item.type === "tool") void onToolsChange?.();
    }
  };

  const subscriptions = [
    [
      "updateActor",
      (updatedActor, changes) => {
        if (updatedActor.uuid !== actor.uuid) return;
        const nextHp = readHp?.() ?? null;
        const change = hpChange(previousHp, nextHp);
        if (change) onHpChange?.(change);
        previousHp = nextHp;
        scheduleRefresh();
        if (
          changes?.system?.tools ||
          Object.keys(changes ?? {}).some(
            key => key === "system.tools" || key.startsWith("system.tools.")
          )
        ) {
          void onToolsChange?.();
        }
      }
    ],
    ["createActiveEffect", refreshActorEffect],
    ["updateActiveEffect", refreshActorEffect],
    ["deleteActiveEffect", refreshActorEffect],
    ["createItem", refreshActorItem],
    ["updateItem", refreshActorItem],
    ["deleteItem", refreshActorItem],
    ["createCombat", refreshCombat],
    ["updateCombat", refreshCombat],
    ["deleteCombat", refreshCombat],
    [
      "createCombatant",
      combatant => {
        if (combatant?.initiative == null && isCurrentCombatant?.(combatant)) {
          onInitiativeRequest?.();
        }
        refreshCombat();
      }
    ],
    [
      "updateCombatant",
      (combatant, changes) => {
        refreshCombat();
        if (
          changes?.initiative != null &&
          combatant?.initiative != null &&
          isCurrentCombatant?.(combatant)
        ) {
          onInitiativeRolled?.();
        }
      }
    ],
    ["deleteCombatant", refreshCombat]
  ];

  const hookIds = subscriptions.map(([hook, callback]) => [
    hook,
    hooks.on(hook, callback)
  ]);

  return () => {
    for (const [hook, id] of hookIds) hooks.off(hook, id);
  };
}
