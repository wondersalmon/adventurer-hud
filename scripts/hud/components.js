import { createAbilityComponents } from "./ability-components.js";
import { createActorHeader } from "./actor-header.js";

export function createHudComponents(context) {
  return { ...createAbilityComponents(context), ...createActorHeader(context) };
}
