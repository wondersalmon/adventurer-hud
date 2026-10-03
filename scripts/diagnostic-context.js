import { MODULE_ID } from "./module-id.js";
// Only explicitly selected, observable documents can be referenced. Instances and
// document identities are separate: synthetic Actor replacement is significant.
let instances = new WeakMap(),
  identities = new Map(),
  next = 0;
export function clearDiagnosticReferences() {
  instances = new WeakMap();
  identities = new Map();
}
export function diagnosticRef(document, kind = "document") {
  try {
    if (!document || typeof document !== "object") return null;
    const actor = document.actor ?? document;
    if (!globalThis.game?.user?.isGM && !actor.isOwner && !actor.isObservable)
      return null;
    if (document.hidden && !globalThis.game?.user?.isGM) return null;
    if (!instances.has(document)) instances.set(document, "instance-" + ++next);
    const uuid = document.uuid;
    if (uuid && !identities.has(uuid)) {
      if (identities.size >= 1024)
        identities.delete(identities.keys().next().value);
      identities.set(uuid, kind + "-" + ++next);
    }
    return {
      ref: uuid ? identities.get(uuid) : instances.get(document),
      instance: instances.get(document)
    };
  } catch {
    return null;
  }
}
const keys = [
  "language",
  "theme",
  "fontSize",
  "companionAutoFocus",
  "companionVisionPan",
  "showCompanions",
  "showCompanionEffects",
  "showItemDescriptions",
  "showSearch",
  "showFavorites",
  "gmEnabled",
  "gmFollowTurn",
  "gmAutoAdvance",
  "autoUpdateActor",
  "showModeNavigation",
  "showItemDetails",
  "gmShowItemDetails",
  "gmShowAttackDetails",
  "gmFilterActions",
  "gmActionTypesOnly",
  "gmHideSearch",
  "showActionTypes",
  "showActivityPicker",
  "pinWindow",
  "gmPinWindow"
];
const word = value =>
  typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value)
    ? value
    : null;
export function diagnosticContext() {
  try {
    const state = globalThis.__adventurerHud;
    const app = state?.app;
    const actor = state?.actor;
    const permitted = diagnosticRef(actor, "actor");
    const canvas = globalThis.canvas;
    const game = globalThis.game;
    const settings = {};
    for (const key of keys) {
      try {
        const value = game?.settings?.get(MODULE_ID, key);
        if (
          typeof value === "boolean" ||
          typeof value === "number" ||
          word(value)
        )
          settings[key] = value;
      } catch {
        /* Unknown setting on older installations. */
      }
    }
    const controlled = (canvas?.tokens?.controlled ?? [])
      .slice(0, 20)
      .map(token => diagnosticRef(token.document ?? token, "token"))
      .filter(Boolean);
    const element = app?.element;
    const selected = element?.querySelector?.(".ws-combat-filter.ws-active");
    const combat = game?.combats?.get?.(state?.gm?.combatId) ?? game?.combat;
    const tokenId = state?.tokenUuid?.match(/\.Token\.([^.]+)$/)?.[1];
    const token = tokenId
      ? canvas?.scene?.tokens?.get?.(tokenId)
      : actor?.token;
    const ownerId =
      state?.companionNavigation?.ownerUuid?.match(/^Actor\.([^.]+)$/)?.[1];
    const owner = ownerId
      ? game?.actors?.get?.(ownerId)
      : game?.user?.character;
    const combatant = combat?.combatant;
    return {
      panel: {
        open: Boolean(app?.rendered),
        mode: word(state?.preset),
        companion: Boolean(state?.companionNavigation?.companionUuid),
        category: word(selected?.dataset?.category),
        passive:
          element
            ?.querySelector?.('[data-action="featurefilter"]')
            ?.getAttribute("aria-pressed") === "true",
        filter: word(
          element?.querySelector?.(
            '[data-companion-filter][aria-pressed="true"]'
          )?.dataset?.companionFilter
        ),
        searchActive: Boolean(
          element?.querySelector?.('[data-action="searchitems"]')?.value
        ),
        width: Number(app?.position?.width) || null,
        height: Number(app?.position?.height) || null
      },
      actor: permitted
        ? {
            ...permitted,
            type: word(actor.type),
            owner: Boolean(actor.isOwner),
            synthetic: Boolean(actor.isToken),
            token: diagnosticRef(token, "token"),
            base: diagnosticRef(token?.baseActor, "actor"),
            linked: Boolean(token?.actorLink),
            onScene: Boolean(
              token && canvas?.scene && token.parent === canvas.scene
            )
          }
        : null,
      owner: diagnosticRef(owner, "actor"),
      controlled,
      tokenVision: canvas?.visibility?.tokenVision !== false,
      combat: {
        exists: Boolean(combat),
        started: Boolean(combat?.started),
        current: diagnosticRef(combatant?.token, "token"),
        hasInitiative:
          combatant?.token && diagnosticRef(combatant.token, "token")
            ? combatant.initiative != null
            : null
      },
      viewport: {
        width: globalThis.innerWidth ?? null,
        height: globalThis.innerHeight ?? null
      },
      settings
    };
  } catch {
    return { unavailable: true };
  }
}
export function diagnosticPlatform() {
  const ua = globalThis.navigator?.userAgent ?? "";
  const match = ua.match(/(Firefox|Edg|Chrome|Version)\/(\d+)/);
  return {
    browser: match ? { family: match[1], major: Number(match[2]) } : null,
    os: /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Mac/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null
  };
}
