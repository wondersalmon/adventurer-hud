export const SC_MODULE_ID = "sc-venaerys-initiative";

/** Foundry lists installed modules even when they are inactive in this world. */
export const scModule = () => globalThis.game?.modules?.get?.(SC_MODULE_ID);
