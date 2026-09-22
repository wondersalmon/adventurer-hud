# System adapters

Adventurer HUD renders system-neutral UI and delegates game data and document
actions to an adapter selected by `game.system.id`. The bundled D&D 5e adapter
is registered in `scripts/systems/index.js`.

## Registering an adapter

Built-in adapters can be imported and registered from `scripts/systems/index.js`.
An integration module can register during Foundry's `init` phase:

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
      skillDefinitions: ({ localize }) => [
        ["athletics", localize("EXAMPLE.SkillAthletics"), "fa-dumbbell"]
      ],
      skillData: (actor, id) => actor.system.skills?.[id] ?? {},
      rollAbility: (actor, { key, event }) => actor.rollAbility(key, { event }),
      rollSkill: (actor, { key, event }) => actor.rollSkill(key, { event }),
      inventoryCategory: item => (item.system.equipped ? "equipped" : "other"),
      itemRole: item => (item.type === "weapon" ? "weapon" : "other"),
      useItem: (item, { event }) => item.use({ event })
    })
  );
});
```

Every capability defaults to `false`. Adapter methods have safe empty defaults,
so an adapter only needs to implement the sections it enables. Roll or mutation
methods should still be implemented for every enabled interactive section.

The same API is available after initialization:

```js
const systems = game.modules.get("adventurer-hud").api.systems;
systems.get(game.system.id);
systems.list();
systems.register(adapter);
```

## Capabilities

Supported capability keys are:

```text
abilityChecks, actions, bonusActions, combat, conditions, deathSaves,
inspiration, inventory, reactions, resources, rests, savingThrows, skills,
specialActions, spells, tools, weapons
```

Disabled capabilities remove their associated HUD controls. This prevents a new
adapter from having to emulate D&D-specific mechanics.

## Normalized values

Adapters should return plain values suitable for rendering:

- Ability definitions: `[id, shortLabel, fontAwesomeIcon]`.
- Skill definitions: `[id, localizedLabel, fontAwesomeIcon]`.
- Combat statistics: `{ hp: { value, max, temp, tempmax }, ac, speed, speedUnits }`.
- Item roles: `weapon`, `spell`, or `other`.
- Inventory categories: `equipped`, `consumables`, `other`, or `null`.
- Resources: `{ id, label, value, max, itemId }`.
- Item uses: `{ value, max }` or `null`.
- Spell slots: an array of `[remaining, maximum]` pairs.

See `scripts/systems/dnd5e.js` for the complete production implementation.

## Adding a system to this package

1. Add the adapter under `scripts/systems/`.
2. Register it in `scripts/systems/index.js`.
3. Add fixture and contract tests for its supported capabilities.
4. Add its localization strings without removing the complete English fallback.
5. Add the system to `relationships.systems` in `module.json` with tested
   compatibility bounds.
6. Test installation and activation in a clean world for every declared system.

An external integration module must declare Adventurer HUD as a dependency and
must ensure its target system is allowed by the distributed manifests.
