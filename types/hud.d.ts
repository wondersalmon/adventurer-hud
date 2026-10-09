import type { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import type { createHudActorContext } from "../scripts/hud/actor-context.js";
import type { createGmCombatController } from "../scripts/hud/gm/gm-combat.js";

/** Foundry owns document internals; HUD boundaries retain native documents. */
export type HudAdapter = typeof dnd5eAdapter;
export type ActorContext = ReturnType<typeof createHudActorContext>;
export type GmController = ReturnType<typeof createGmCombatController>;
export type Translate = (key: string) => string;
export type Format = (key: string, values: Record<string, unknown>) => string;
export interface CompanionNavigation {
  ownerUuid: string;
  companionUuid?: string | null;
  tokenUuid?: string | null;
  ownerTokenUuid?: string | null;
}
export interface CompanionReference {
  uuid: string;
  actor: any;
  token?: any;
}
export interface CompanionEntry {
  uuid: string;
  actor: any | null;
  token: any | null;
  tokenOptions: any[];
  sceneTokens: any[];
  reason: string | null;
}
export interface CompanionTarget {
  dataset: { companionUuid?: string; companionFilter?: string };
}
export type HudInputEvent = Event & {
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
};
export type CompanionActions = Partial<
  Record<
    | "companionplace"
    | "companionvisionstop"
    | "companionvision"
    | "companionfilter"
    | "companioninitiative"
    | "companionsinitiative"
    | "togglecompanions"
    | "companionback"
    | "opencompanion"
    | "companionsheet"
    | "companionping"
    | "initiative",
    (event: HudInputEvent | null, target: CompanionTarget) => unknown
  >
>;
export interface CompanionPanelOptions {
  currentMode?: () => string;
  owner: any;
  companion: CompanionEntry | null;
  actorContext: ActorContext;
  hudState: HudState;
  adapter: HudAdapter;
  DialogV2: any;
  t: Translate;
  tf: Format;
  escapeHTML(value: unknown): string;
  isCurrent(): boolean;
  refreshHud(): void;
  navigate(navigation: CompanionNavigation): Promise<void>;
  ownerTokenUuid: string | null;
  savePanelState(): Promise<unknown>;
  closeHud(): unknown;
}
export type OpenHud = (
  actor?: ActorContext["actor"] | null,
  navigation?: CompanionNavigation | null,
  recovery?: HudActorRecovery
) => Promise<void>;
export interface HudActorRecovery {
  token: ActorContext["token"];
  hudState: HudState;
  isCurrent(): boolean;
}
export type RefreshRegion = "full" | "actions" | "search";
export interface RefreshScheduler {
  schedule(region?: RefreshRegion): void;
  flush(): void;
  cancel(): void;
}
export interface LatestRefreshOptions<T> {
  load(): Promise<T>;
  apply(value: T): void;
  isCurrent(): boolean;
  onError(error: unknown): void;
}
export interface HudOpenContext {
  state: HudRuntimeState;
  reusedApp: any;
  gmActive: boolean;
  DialogV2: any;
  t: Translate;
  tf: Format;
  adapter: HudAdapter;
  actorContext: ActorContext | null;
  recoveryState?: HudState;
  session: object;
  gmController: GmController | null;
  gmCombatant: any;
  companionOwner?: any;
  focusToken?: boolean;
  companion?: CompanionEntry | null;
}
/** ApplicationV2/Foundry handles are external, dynamic runtime objects. */
export interface HudRuntimeState {
  app?: any;
  actor?: ActorContext["actor"] | null;
  actorUuid?: string | null;
  tokenUuid?: string | null;
  position?: any;
  preset?: "gm" | "player";
  session?: object;
  gm?: Record<string, unknown>;
  companionNavigation?: CompanionNavigation | null;
}
export type ActorOpenContext = HudOpenContext & { actorContext: ActorContext };
export type EmptyGmOpenContext = HudOpenContext & {
  gmActive: true;
  actorContext: null;
  gmController: GmController;
};
export interface SessionCallbacks {
  openHud: OpenHud;
}
export type ItemLayouts = Record<string, { order: string[]; hidden: string[] }>;
export interface HudLayoutUndo {
  mode: string;
  hudLayouts: ItemLayouts;
  itemLayouts: ItemLayouts;
  viewState: Partial<
    Pick<
      HudState,
      | "currentView"
      | "combatCategory"
      | "explorationSkillsCollapsed"
      | "searchQuery"
    >
  >;
}
export interface ItemLayoutEntry {
  key: string;
  name: string;
  html: string;
}
export interface HudState {
  explorationSkillsCollapsed: boolean;
  combatCategory: string | null;
  conditionsExpanded: boolean;
  currentView: string;
  favoritesExpanded: boolean;
  itemLayouts: ItemLayouts;
  hudLayouts: ItemLayouts;
  hudEditing: boolean;
  hudLayoutUndo: HudLayoutUndo | null;
  itemHiddenExpanded: string | null;
  companionsExpanded: boolean;
  companionFilter: "scene" | "all" | "familiars";
  forcedMode: "regular" | "combat" | null;
  inventoryCategory: string;
  preparedSpellsOnly: boolean;
  showPassiveFeatures: boolean;
  proficientSkillsOnly: boolean;
  renderedMode: string | null;
  searchQuery: string;
  openActivityItemId: string | null;
  favoriteEntries: ({ itemId: string; activityId: string } | null)[];
  gmSpeedsExpanded?: boolean;
  gmLegendaryExpanded?: boolean;
}
export interface HudActionsOptions {
  actor?: ActorContext["actor"];
  adapter?: HudAdapter;
  canRollActor: boolean;
  canStartMutation?: () => boolean;
  focusActorToken?: () => Promise<void>;
  pingActorToken?: () => Promise<void>;
  canRollDeathSave?: () => boolean;
  combatModeAvailable?: () => boolean;
  currentMode?: () => string;
  getCombatState?: ActorContext["getCombatState"];
  gmController?: GmController | null;
  gmCombatantId?: string;
  openGmSelection?: () => Promise<unknown>;
  onGmCombatChange?: (options?: { follow?: boolean }) => void;
  onPlayerTurnEnded?: () => unknown;
  hudState?: HudState;
  openHpDialog?: () => unknown;
  performAndRefresh?: (callback: () => unknown) => Promise<unknown>;
  performSceneAction?: (callback: () => unknown) => Promise<unknown>;
  refreshHud?: (region?: RefreshRegion | null) => void;
  savePanelState?: () => Promise<unknown>;
  resetWindow?: () => Promise<unknown>;
  performRoll?: (callback: () => unknown) => Promise<unknown>;
  setView?: (view: string) => void;
  t: Translate;
  toggleFavoriteEntry?: (
    itemId: string,
    activityId?: string
  ) => Promise<unknown>;
  removeFavoriteEntry?: (
    itemId: string,
    activityId?: string
  ) => Promise<unknown>;
  updateSearch?: (query: string) => void;
  visibility?: ReturnType<
    typeof import("../scripts/hud/visibility.js").readHudVisibility
  >;
  togglePin: () => Promise<unknown>;
  companionActions?: CompanionActions;
  validateActorAction?: () => boolean | Promise<boolean>;
  isSessionCurrent?: () => boolean;
}

export interface CompanionChoice {
  uuid: string;
  name: string;
}
export type CompanionResolver = (
  uuid: string | undefined,
  tokenUuid?: string | null
) => Promise<CompanionEntry | null>;
export type CompanionNavigateTo = (
  uuid: string | null,
  tokenUuid?: string | null,
  returnTokenUuid?: string | null
) => Promise<void>;
export interface CompanionRosterDependencies {
  resolved: CompanionResolver;
  navigateTo: CompanionNavigateTo;
  vision: ReturnType<
    typeof import("../scripts/hud/companions/familiar-vision.js").createFamiliarVision
  > | null;
}
export interface CompanionActionDependencies extends CompanionRosterDependencies {
  placement: ReturnType<
    typeof import("../scripts/hud/companions/companion-placement.js").createCompanionPlacement
  >;
  picker: ReturnType<
    typeof import("../scripts/hud/companions/companion-picker.js").createCompanionPicker
  >;
  refresh(): Promise<unknown>;
  getEntries(): CompanionEntry[];
}
