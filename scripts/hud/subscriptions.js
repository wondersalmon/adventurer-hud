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
  onStatusChange,
  onCombatChange,
  isCurrentCombatant,
  isPlayersTurn
}) {
  let previousHp = readHp?.() ?? null;
  let wasPlayersTurn = Boolean(isPlayersTurn?.());
  const refreshCombat = () => {
    onCombatChange?.({ follow: true });
    scheduleRefresh();
    const playersTurn = Boolean(isPlayersTurn?.());
    if (playersTurn && !wasPlayersTurn) onTurnStart?.();
    wasPlayersTurn = playersTurn;
  };
  const refreshActorEffect = effect => {
    onCombatChange?.({ follow: false });
    if (
      actor &&
      (effect?.parent?.uuid === actor.uuid ||
        effect?.parent?.parent?.uuid === actor.uuid)
    ) {
      scheduleRefresh();
      void onStatusChange?.();
    }
  };

  const refreshActorItem = item => {
    onCombatChange?.({ follow: false });
    if (actor && item?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
      void onStatusChange?.();
      if (item.type === "tool") void onToolsChange?.();
    }
  };

  const subscriptions = [
    [
      "updateActor",
      (updatedActor, changes) => {
        onCombatChange?.({ follow: false });
        if (!actor || updatedActor.uuid !== actor.uuid) return;
        const nextHp = readHp?.() ?? null;
        const change = hpChange(previousHp, nextHp);
        if (change) onHpChange?.(change);
        previousHp = nextHp;
        void onStatusChange?.();
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
    ["dnd5e.postUseActivity", activity => refreshActorItem(activity?.item)],
    ["dnd5e.postUseLinkedSpell", activity => refreshActorItem(activity?.item)],
    [
      "dnd5e.postActivityConsumption",
      activity => refreshActorItem(activity?.item)
    ],
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
    ["deleteCombatant", refreshCombat],
    ...(onCombatChange
      ? [
          ["canvasReady", refreshCombat],
          ["deleteToken", refreshCombat],
          ["updateToken", () => onCombatChange({ follow: false })],
          ["updateUser", () => onCombatChange({ follow: false })]
        ]
      : [])
  ];

  const hookIds = subscriptions.map(([hook, callback]) => [
    hook,
    hooks.on(hook, callback)
  ]);

  return () => {
    for (const [hook, id] of hookIds) hooks.off(hook, id);
  };
}
