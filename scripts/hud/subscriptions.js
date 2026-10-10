import { recordDiagnostic } from "../diagnostics.js";
import { hpChange } from "./health-feedback.js";

// Foundry updates can contain nested objects, flattened keys or deletion keys.
export function changesPath(changes, path) {
  if (changes == null) return true;
  return Object.entries(changes).some(([key, value]) => {
    const normalized = key.replace(/(^|\.)-=/g, "$1");
    if (normalized === path || normalized.startsWith(`${path}.`)) return true;
    return (
      path.startsWith(`${normalized}.`) &&
      (value == null ||
        typeof value !== "object" ||
        changesPath(value, path.slice(normalized.length + 1)))
    );
  });
}

export function subscribeHudDocuments({
  actor,
  isActorCurrent = () => true,
  onActorReplacement,
  getCombat,
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
  isPlayersTurn,
  getTurnKey
}) {
  let previousHp = readHp?.() ?? null;
  let wasPlayersTurn = Boolean(isPlayersTurn?.());
  const turnKeys = new Set();
  const initialTurnKey = getTurnKey?.();
  if (initialTurnKey) turnKeys.add(initialTurnKey);
  let observedCombat = getCombat?.();
  const actorInCombat = candidate =>
    Boolean(
      candidate &&
      [
        ...(getCombat?.()?.combatants?.values?.() ??
          getCombat?.()?.combatants ??
          [])
      ].some(
        entry =>
          (entry.token?.actor ?? entry.actor)?.uuid === candidate.uuid ||
          (!candidate.isToken && candidate.id && entry.actorId === candidate.id)
      )
    );
  const recoverActor = () => {
    if (!actor || isActorCurrent()) return false;
    return Boolean(onActorReplacement?.());
  };
  const refreshCombat = document => {
    if (recoverActor()) return;
    const combat = getCombat?.();
    const changed = combat !== observedCombat;
    const eventCombat =
      document?.documentName === "Combatant" || document?.parent?.combatants
        ? document.parent
        : [
              ...(combat?.combatants?.values?.() ?? combat?.combatants ?? [])
            ].includes(document)
          ? combat
          : document;
    if (
      getCombat &&
      eventCombat &&
      eventCombat !== combat &&
      eventCombat !== observedCombat &&
      !changed
    )
      return;
    observedCombat = combat;
    onCombatChange?.({ follow: true });
    scheduleRefresh();
    const playersTurn = Boolean(isPlayersTurn?.());
    const turnKey = getTurnKey?.();
    if (playersTurn && (turnKey ? !turnKeys.has(turnKey) : !wasPlayersTurn))
      onTurnStart?.();
    if (turnKey) {
      if (turnKeys.size >= 64) turnKeys.delete(turnKeys.values().next().value);
      turnKeys.add(turnKey);
    }
    wasPlayersTurn = playersTurn;
  };
  const refreshActorEffect = effect => {
    if (recoverActor()) return;
    const parentActor = effect?.parent?.parent ?? effect?.parent;
    if (actorInCombat(parentActor)) onCombatChange?.({ follow: false });
    if (
      actor &&
      (effect?.parent?.uuid === actor.uuid ||
        effect?.parent?.parent?.uuid === actor.uuid)
    ) {
      scheduleRefresh();
      void onStatusChange?.();
    }
  };

  const refreshActorItem = (item, changes, structural = false) => {
    if (recoverActor()) return;
    if (actor && item?.parent?.uuid === actor.uuid) {
      scheduleRefresh();
      if (
        structural ||
        [
          "effects",
          "system.equipped",
          "system.attunement",
          "system.attuned"
        ].some(path => changesPath(changes, path))
      )
        void onStatusChange?.();
      if (item.type === "tool") void onToolsChange?.();
    }
  };

  const subscriptions = [
    ...["createActor", "deleteActor"].map(hook => [
      hook,
      updatedActor => {
        if (recoverActor()) return;
        if (actorInCombat(updatedActor)) onCombatChange?.({ follow: false });
      }
    ]),
    [
      "updateActor",
      (updatedActor, changes) => {
        if (recoverActor()) return;
        if (
          actorInCombat(updatedActor) &&
          [
            "ownership",
            "type",
            "statuses",
            "effects",
            "system.attributes.hp",
            "name",
            "img"
          ].some(path => changesPath(changes, path))
        )
          onCombatChange?.({ follow: false });
        if (!actor || updatedActor.uuid !== actor.uuid) return;
        const nextHp = readHp?.() ?? null;
        const change = hpChange(previousHp, nextHp);
        if (change) onHpChange?.(change);
        previousHp = nextHp;
        if (
          ["effects", "statuses", "system.attributes.exhaustion"].some(path =>
            changesPath(changes, path)
          )
        )
          void onStatusChange?.();
        scheduleRefresh();
        if (changesPath(changes, "system.tools")) {
          void onToolsChange?.();
        }
      }
    ],
    ["createActiveEffect", refreshActorEffect],
    ["updateActiveEffect", refreshActorEffect],
    ["deleteActiveEffect", refreshActorEffect],
    ["createItem", item => refreshActorItem(item, {}, true)],
    ["updateItem", refreshActorItem],
    ["deleteItem", item => refreshActorItem(item, {}, true)],
    ["dnd5e.postUseActivity", activity => refreshActorItem(activity?.item, {})],
    [
      "dnd5e.postUseLinkedSpell",
      activity => refreshActorItem(activity?.item, {})
    ],
    [
      "dnd5e.postActivityConsumption",
      activity => refreshActorItem(activity?.item, {})
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
        refreshCombat(combatant);
      }
    ],
    [
      "updateCombatant",
      (combatant, changes) => {
        refreshCombat(combatant);
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
    [
      "updateUser",
      (updatedUser, changes) => {
        const current =
          updatedUser === game.user ||
          (updatedUser?.id && updatedUser.id === game.user?.id);
        if (
          !changesPath(changes, "role") &&
          !(
            current &&
            ["permissions", "character"].some(path =>
              changesPath(changes, path)
            )
          )
        )
          return;
        onCombatChange?.({ follow: false });
        scheduleRefresh();
      }
    ],
    ...(onCombatChange
      ? [
          ["canvasReady", () => refreshCombat()],
          [
            "deleteToken",
            token => {
              if (recoverActor()) return;
              if (token?.parent?.id === canvas.scene?.id) refreshCombat();
            }
          ],
          [
            "updateToken",
            (token, changes) => {
              if (recoverActor()) return;
              if (token?.parent?.id !== canvas.scene?.id) return;
              if (
                token?.actor?.uuid === actor?.uuid ||
                actorInCombat(token?.actor) ||
                ["actorId", "actorLink", "ownership"].some(path =>
                  changesPath(changes, path)
                )
              )
                onCombatChange({ follow: false });
            }
          ]
        ]
      : [])
  ];

  const hookIds = subscriptions.map(([hook, callback]) => [
    hook,
    hooks.on(hook, (...args) => {
      recordDiagnostic("hud.hook", { reason: hook }, { detailed: true });
      return callback(...args);
    })
  ]);

  recordDiagnostic(
    "hud.subscriptions",
    { listeners: hookIds.length },
    { detailed: true }
  );
  return () => {
    recordDiagnostic("hud.subscriptions", { listeners: 0 }, { detailed: true });
    for (const [hook, id] of hookIds) hooks.off(hook, id);
  };
}
