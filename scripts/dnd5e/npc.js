const label = config => {
  const key =
    typeof config === "string" ? config : (config?.label ?? config?.name);
  return typeof key === "string" ? game.i18n.localize(key) : "";
};

export function npcResource(actor, key) {
  const resource = actor.system.resources?.[key];
  if (!(resource?.max > 0)) return null;
  return {
    max: resource.max,
    value: resource.value ?? Math.max(0, resource.max - (resource.spent ?? 0))
  };
}

export function npcMovement(actor) {
  const movement = actor.system.attributes.movement ?? {};
  const speeds = movement.speeds ?? movement;
  const config = CONFIG.DND5E;
  const units = label(
    config.movementUnits?.[movement.units]?.abbreviation ??
      config.movementUnits?.[movement.units] ??
      movement.units
  );
  const types = Object.keys(
    config.movementTypes ?? {
      walk: "",
      fly: "",
      swim: "",
      climb: "",
      burrow: ""
    }
  );
  const format = key =>
    `${label(config.movementTypes?.[key] ?? key)} ${speeds[key]} ${units}${key === "fly" && movement.hover ? ` (${game.i18n.localize("DND5E.MOVEMENT.Hover")})` : ""}`.trim();
  const secondary = types
    .filter(key => key !== "walk" && Number(speeds[key]) > 0)
    .map(format);
  if (movement.special) secondary.push(movement.special);
  return {
    primary: `${speeds.walk ?? 0} ${units}`.trim(),
    secondary: secondary.join(" · "),
    summary:
      [...(Number(speeds.walk) > 0 ? [format("walk")] : []), ...secondary].join(
        " · "
      ) ||
      movement.speed ||
      "—"
  };
}

export function movementSummary(actor) {
  return npcMovement(actor).summary;
}

export function npcTraits(actor) {
  return [
    ["dr", "GM.Resistances"],
    ["di", "GM.DamageImmunities"],
    ["ci", "GM.ConditionImmunities"],
    ["dv", "GM.Vulnerabilities"]
  ]
    .map(([key, title]) => {
      const trait = actor.system.traits?.[key];
      const choices =
        key === "ci" ? CONFIG.DND5E.conditionTypes : CONFIG.DND5E.damageTypes;
      const values = [...(trait?.value ?? [])].map(value =>
        label(choices?.[value] ?? value)
      );
      if (trait?.custom) values.push(trait.custom);
      const bypasses = [...(trait?.bypasses ?? [])].map(value =>
        label(CONFIG.DND5E.itemProperties?.[value] ?? value)
      );
      return { title, text: values.join(", "), bypasses: bypasses.join(", ") };
    })
    .filter(trait => trait.text);
}
