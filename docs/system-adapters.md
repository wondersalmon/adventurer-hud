# System adapters

Adventurer HUD keeps its interface system-neutral and delegates actor data,
rolls, and document updates to the adapter selected by `game.system.id`. The
bundled D&D 5e adapter is registered in `scripts/systems/index.js`.

## Registration lifecycle

An integration module can listen for the registration hook at module scope. Do
not wrap this listener in another `init` hook: Adventurer HUD emits it from its
own `init` handler.

```js
Hooks.once("adventurerHudRegisterSystemAdapters", systems => {
  systems.register(
    systems.define({
      id: "example-system",
      actorTypes: ["character"],
      capabilities: {
        abilityChecks: true,
        inventory: true,
        skills: true
      },

      isActorSupported: actor => actor.type === "character",
      classSummary: actor => actor.system.details?.level ?? "",
      abilityDefinitions: () => [
        ["might", "MGT", "fa-hand-fist"],
        ["agility", "AGI", "fa-person-running"]
      ],
      abilityData: (actor, id) => actor.system.abilities?.[id] ?? {},
      abilityTotal: data => Number(data.total ?? data.mod ?? 0),
      rollAbility: (actor, { key, event }) => actor.rollAbility(key, { event }),

      skillDefinitions: ({ localize }) => [
        ["athletics", localize("EXAMPLE.SkillAthletics"), "fa-dumbbell"]
      ],
      skillData: (actor, id) => actor.system.skills?.[id] ?? {},
      rollSkill: (actor, { key, event }) => actor.rollSkill(key, { event }),

      inventoryCategory: item => (item.system.equipped ? "equipped" : "other"),
      itemRole: item => (item.type === "weapon" ? "weapon" : "other"),
      useItem: (item, { event }) => item.use({ event })
    })
  );
});
```

After Adventurer HUD has initialized, the same registry is available through
its public API:

```js
const systems = game.modules.get("adventurer-hud").api.systems;
systems.get(game.system.id);
systems.list();
systems.define(adapter); // Validate and normalize without registering.
systems.register(adapter);
```

Adapter IDs must be unique. Passing `{ replace: true }` as the second argument
to `register` intentionally replaces an existing adapter.

## Capabilities and required methods

All capabilities default to `false`. Enable only mechanics that the adapter
actually implements.
When `deathSaves` is enabled, the death-save control appears beneath the HP bar
at 0 HP in both exploration and combat; it does not create a separate mode.

| Capability                                               | Required adapter methods                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `activityChoice`                                         | `itemActivities`, `useActivity`                                         |
| `abilityChecks`                                          | `abilityData`, `abilityTotal`, `rollAbility`                            |
| `savingThrows`                                           | Ability methods above, `saveProficiency`                                |
| `skills`                                                 | `skillDefinitions`, `skillData`, `skillProficiency`, `rollSkill`        |
| `tools`                                                  | `getTools`, `rollTool`                                                  |
| `combat`                                                 | `combatStats`, `updateHp`, `rollInitiative`                             |
| `deathSaves`                                             | `deathData`, `rollDeathSave`                                            |
| `inspiration`                                            | `inspiration`, `toggleInspiration`                                      |
| `rests`                                                  | `shortRest`, `longRest`                                                 |
| `resources`                                              | `actorResources`, `featureResources`, `resourceData`, `updateResource`  |
| `conditions`                                             | No adapter method; uses Foundry actor statuses and Active Effects       |
| `inventory`                                              | `inventoryCategory`, `useItem`                                          |
| `weapons`                                                | `combatItems`, `useItem`                                                |
| `spells`                                                 | `combatItems`, `isPreparedSpell`, `spellLevel`, `spellSlots`, `useItem` |
| `actions`, `bonusActions`, `reactions`, `specialActions` | `combatItems`, `useItem`                                                |

Every adapter must define `id` and should define `isActorSupported`. It should
also provide `abilityDefinitions` when checks or saves are enabled and may
provide `classSummary` for the actor header.

Read-only methods have safe empty defaults. Unsupported roll and mutation
methods throw an explicit error, so interactive capabilities must not be
enabled without their required implementations.

## Method contract

### Actor and roll methods

| Method                                        | Expected result                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `isActorSupported(actor)`                     | Whether the actor can be opened in the HUD                                 |
| `classSummary(actor, { formatLevel })`        | Short class/level text                                                     |
| `abilityDefinitions()`                        | Array of `[id, shortLabel, fontAwesomeIcon]`                               |
| `abilityData(actor, id)`                      | System-specific ability record                                             |
| `abilityTotal(data, type)`                    | Numeric check or save modifier                                             |
| `saveProficiency(actor, id)`                  | Proficiency multiplier                                                     |
| `skillDefinitions({ localize })`              | Array of `[id, localizedLabel, fontAwesomeIcon]`                           |
| `skillData(actor, id)`                        | Skill record containing its total                                          |
| `skillProficiency(actor, id)`                 | Proficiency multiplier                                                     |
| `getTools(actor, helpers)`                    | Promise resolving to `{ id, name, proficiency, ability, isMusic, icon }[]` |
| `rollAbility(actor, { type, key, event })`    | Check or saving-throw result                                               |
| `rollSkill(actor, { key, event })`            | Skill-roll result                                                          |
| `rollTool(actor, { key, event })`             | Tool-roll result                                                           |
| `rollInitiative(actor, { combatant, event })` | Initiative result without creating or deleting combatants                  |
| `rollDeathSave(actor, { event })`             | Death-save result                                                          |

Forward the original browser event whenever the system supports it. This lets
the system and automation modules interpret modifier keys. A successful roll
or item action should return a truthy value when the HUD is expected to close
after the action; cancellation should return `null`, `undefined`, or `false`.

### Combat, resources, and actor updates

| Method                                                    | Expected result                                                |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `combatStats(actor)`                                      | `{ hp: { value, max, temp, tempmax }, ac, speed, speedUnits }` |
| `deathData(actor)`                                        | `{ hp, success, failure, dead, stable }`                       |
| `inspiration(actor)`                                      | Boolean inspiration state                                      |
| `toggleInspiration(actor)`                                | Promise for the document update                                |
| `shortRest(actor)`, `longRest(actor)`                     | Rest result                                                    |
| `updateHp(actor, { value, temp })`                        | Update current and temporary HP together                       |
| `actorResources(actor)`                                   | Normalized actor-resource array                                |
| `featureResources(actor)`                                 | Normalized item-resource array                                 |
| `resourceData(actor, { item, resourceId })`               | `{ actorResource, current, max }`                              |
| `updateResource(actor, { item, resourceId, value, max })` | Promise for the resource update                                |

A normalized resource is `{ id, label, value, max, itemId }`. Use `itemId:
null` for actor fields and the owning item ID for item-backed resources.

### Items and spells

| Method                                     | Expected result                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `combatItems(actor, category)`             | Items for `weapons`, `spells`, `action`, `bonus`, `reaction`, or `special`     |
| `inventoryCategory(item)`                  | `equipped`, `consumables`, `other`, or `null`                                  |
| `itemRole(item)`                           | `weapon`, `spell`, or `other`                                                  |
| `useItem(item, { event })`                 | Native item-use result                                                         |
| `useActivity(item, activityId, { event })` | Native use result for the selected activity; needed for inline activity choice |
| `itemUsesData(item)`                       | `{ value, max }` or `null`                                                     |
| `itemActivation(item)`                     | Activation identifier                                                          |
| `itemRangeData(item)`                      | `{ value, long, units, special }`                                              |
| `itemAttackBonus(item)`                    | Display-ready attack bonus                                                     |
| `itemDamageFormula(actor, item)`           | Display-ready damage formula                                                   |
| `itemResourceCost(actor, item, helpers)`   | Display-ready resource cost                                                    |
| `hasItemProperty(item, property)`          | Whether concentration, ritual, or another property applies                     |
| `isPreparedSpell(item)`                    | Whether a spell belongs in the prepared filter                                 |
| `spellLevel(item)`                         | Numeric spell level                                                            |
| `spellSlots(actor, level)`                 | Array of `[remaining, maximum]` pools                                          |

Metadata helpers have empty defaults, so integrations can add detailed cards
incrementally. `activationLabel` and `rangeUnitLabel` may be implemented when
raw system identifiers need localized display labels.

See [`scripts/systems/registry.js`](../scripts/systems/registry.js) for every
default and [`scripts/systems/dnd5e.js`](../scripts/systems/dnd5e.js) for the
complete production implementation.

## Compatibility declaration

Adventurer HUD's `module.json` currently declares D&D 5e only. To distribute
an adapter for another system, add that system to `relationships.systems` with
tested compatibility bounds. An external adapter module must also declare
Adventurer HUD as a required module.

## Adding a bundled system

1. Add its adapter under `scripts/systems/`.
2. Register it in `scripts/systems/index.js`.
3. Add fixture and contract tests for every enabled capability.
4. Add required English fallback strings and matching translations.
5. Add the system to `relationships.systems` in `module.json`.
6. Test installation, activation, rendering, rolls, and document updates in a
   clean world for every declared system version.
