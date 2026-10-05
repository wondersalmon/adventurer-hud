import { createAbilityComponents } from "./ability-components.js";
import { createActorHeader } from "./actor-header.js";

export function createHudComponents(context) {
  return { ...createAbilityComponents(context), ...createActorHeader(context) };
}

export function diceTrayButton(t) {
  return `<button type="button" class="ws-button" data-dice-tray="toggle" aria-haspopup="dialog" aria-expanded="false" title="${t("DiceTray.Title")}" aria-label="${t("DiceTray.Title")}"><i class="fa-solid fa-dice" aria-hidden="true"></i></button>`;
}
