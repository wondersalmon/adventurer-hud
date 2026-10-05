import { readFile } from "node:fs/promises";
import { hudFixture } from "../tests/helpers/hud.mjs";
import { itemCollection } from "../tests/helpers/rendering.mjs";
import { createHudPresentation } from "../scripts/hud/presentation.js";
import { createHudActorContext } from "../scripts/hud/actor-context.js";
import { createHudState } from "../scripts/hud/state.js";
import {
  createGmCombatController,
  renderGmCombatHeader
} from "../scripts/hud/gm/gm-combat.js";
import { readHudVisibility } from "../scripts/hud/visibility.js";
import { dnd5eAdapter } from "../scripts/dnd5e/index.js";
import { createModuleTranslator } from "../scripts/localization.js";
import {
  renderCompanionList,
  renderFamiliarVision,
  renderCompanionNavigation,
  renderCompanionSection
} from "../scripts/hud/companions/companion-panel.js";

export async function layoutFixture(
  language = "ru",
  { documentation = false } = {}
) {
  const manifest = JSON.parse(
    await readFile(new URL("../module.json", import.meta.url), "utf8")
  );
  const css = (
    await Promise.all(
      manifest.styles.map(file =>
        readFile(new URL("../" + file, import.meta.url), "utf8")
      )
    )
  ).join("\n");
  const portrait =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><rect width="50" height="50" fill="#465362"/><circle cx="25" cy="18" r="10" fill="#b4bdc6"/><path d="M8 50Q8 28 25 28Q42 28 42 50" fill="#b4bdc6"/></svg>'
    );
  const f = await hudFixture({
    isGM: true,
    values: { language, showModeNavigation: true }
  });
  const actor = f.actor;
  actor.name = "Александриэль — хранительница северной границы";
  actor.img = portrait;
  actor.system.details.level = 12;
  actor.system.attributes.hp = { value: 128, max: 245, temp: 18 };
  actor.system.attributes.encumbrance = { value: 87.5, max: 180 };
  actor.system.currency = { gp: 1234, pp: 10, ep: 0, sp: 3, cp: 5 };
  actor.system.attributes.movement = {
    walk: 30,
    fly: 60,
    swim: 30,
    units: "ft",
    special: "Телепортация между видимыми тенями"
  };
  actor.system.resources = {
    legres: { value: 2, max: 3 },
    legact: { value: 2, max: 3 }
  };
  actor.system.traits = {
    di: {
      value: new Set(["fire", "poison"]),
      custom: "Урон от немагического оружия"
    },
    ci: { value: new Set(["frightened", "poisoned"]) }
  };
  CONFIG.DND5E.damageTypes = { fire: "Огонь", poison: "Яд" };
  CONFIG.DND5E.spellPreparationStates = {
    always: { value: 2 },
    prepared: { value: 1 },
    unprepared: { value: 0 }
  };
  CONFIG.DND5E.conditionTypes = { frightened: "Испуг", poisoned: "Отравление" };
  CONFIG.DND5E.movementTypes = {
    walk: "Ходьба",
    fly: "Полёт",
    swim: "Плавание"
  };
  CONFIG.DND5E.movementUnits = { ft: { label: "фт", abbreviation: "фт" } };
  for (const id of ["str", "dex", "con", "int", "wis", "cha"])
    actor.system.abilities[id] = {
      mod: 3,
      check: { total: 3 },
      save: { total: 7, prof: 1 },
      saveProf: 1,
      value: 16
    };
  const skillNames = [
    "Акробатика",
    "Анализ",
    "Атлетика",
    "Внимательность",
    "Выживание",
    "Выступление",
    "Запугивание",
    "История",
    "Ловкость рук",
    "Магия",
    "Медицина",
    "Обман",
    "Природа",
    "Проницательность",
    "Религия",
    "Скрытность",
    "Убеждение",
    "Уход за животными"
  ];
  for (const [index, label] of skillNames.entries()) {
    CONFIG.DND5E.skills["s" + index] = { label };
    actor.system.skills["s" + index] = { prof: 1, total: (index % 3) + 5 };
  }
  CONFIG.statusEffects = Array.from({ length: 7 }, (_, index) => ({
    id: "status" + index,
    name: [
      "Ослепление",
      "Испуг",
      "Отравление",
      "Истощение",
      "Оглушение",
      "Опутывание",
      "Очарование"
    ][index],
    img: portrait
  }));
  actor.statuses = new Set(
    documentation ? [] : CONFIG.statusEffects.map(s => s.id)
  );
  const items = Array.from({ length: 27 }, (_, index) => {
    const type = index < 8 ? "weapon" : index < 20 ? "spell" : "feat";
    const activity = {
      id: "a" + index,
      name: "Дополнительная активность",
      type: "attack",
      canUse: true,
      use: async () => {},
      activation: { type: index >= 24 ? "legendary" : "action" },
      labels: { toHit: "+9", damage: "2к8 + 5" },
      save: { dc: { value: 17 } },
      uses: { max: 3, spent: 1 }
    };
    return {
      id: "i" + index,
      uuid: "Actor.hero.Item.i" + index,
      name:
        (type === "weapon"
          ? "Зачарованная алебарда стража древних врат"
          : type === "spell"
            ? "Многослойный защитный барьер архимага"
            : "Могущественная способность древнего существа") +
        " " +
        index,
      type,
      img: portrait,
      system: {
        level: (index - 8) % 6,
        prepared: 1,
        canPrepare: type === "spell",
        equipped: true,
        properties: new Set(),
        activities: new Map([[activity.id, activity]]),
        uses: { max: 3, value: 2, spent: 1 },
        range: { value: 60, long: 120, units: "ft" }
      }
    };
  });
  const multiActivity = items[21];
  const firstActivity = [...multiActivity.system.activities.values()][0];
  multiActivity.system.activities.set("alternative", {
    ...firstActivity,
    id: "alternative",
    name: "Альтернативное действие"
  });
  items.push({
    id: "class",
    name: "Воин / Волшебник",
    type: "class",
    system: { levels: 12 }
  });
  actor.items = itemCollection(items);
  actor.system.favorites = items.slice(0, 6).map((item, index) => ({
    id: ".Item." + item.id,
    type: "item",
    sort: index
  }));
  for (let i = 1; i <= 6; i++)
    actor.system.spells["spell" + i] = { value: 3, max: 4 };
  const tools = Array.from({ length: 9 }, (_, index) => ({
    id: "tool" + index,
    name: "Инструменты искусного мастера и реставратора " + index,
    img: portrait,
    proficiency: 1,
    ability: "dex",
    isMusic: index >= 6
  }));
  const { t, tf } = await createModuleTranslator({ language, i18n: game.i18n });
  CONFIG.Token = { documentClass: { canUserCreate: () => true } };
  canvas.tokens.placeTokens = async () => [];
  const bodies = {};
  for (const scenario of [
    "player-main",
    "player-main-no-favorites",
    "player-combat",
    "player-combat-footer",
    "player-main-footer",
    "player-combat-spells",
    "player-combat-inventory",
    "player-combat-skills",
    "player-combat-edit",
    "player-skills",
    "player-tools",
    "player-spells",
    "player-inventory",
    "player-companions",
    "player-companions-vision",
    "player-companions-all",
    "player-companions-all-vision",
    "player-companions-combat",
    "companion-actions",
    "companion-exploration",
    "gm-features",
    "gm-actions",
    "gm-spells",
    "gm-empty",
    "gm-preparation",
    "gm-defeated"
  ]) {
    const gm = scenario.startsWith("gm");
    const companion = scenario.startsWith("companion-");
    actor.type = gm || companion ? "npc" : "character";
    actor.name = companion
      ? "Сова — фамильяр Александриэль"
      : gm
        ? "Древний костяной дракон — хранитель потерянного храма"
        : "Александриэль — хранительница северной границы";
    canvas.scene = { id: "scene" };
    CONFIG.Token = { documentClass: { canUserCreate: () => true } };
    canvas.tokens.placeTokens = async () => [];
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: "npc" + index,
      actorId: actor.id,
      sceneId: "scene",
      tokenId: "t" + index,
      name: "Страж забытого северного храма " + index,
      initiative: 18 - index,
      players: [],
      token: {
        id: "t" + index,
        uuid: "Scene.scene.Token.t" + index,
        parent: canvas.scene,
        texture: { src: portrait },
        actor
      }
    }));
    canvas.scene.tokens = itemCollection(entries.map(entry => entry.token));
    const combat = {
      id: "battle",
      name: "Оборона древнего храма — финальная схватка",
      scene: canvas.scene,
      started: true,
      round: 3,
      turn: 0,
      turns: entries,
      combatants: itemCollection(entries),
      combatant: entries[0]
    };
    game.combat = combat;
    game.combats = itemCollection([combat]);
    const controller = gm ? createGmCombatController({ memory: {} }) : null;
    if (scenario === "gm-defeated") entries[0].defeated = true;
    const selected =
      scenario === "gm-defeated" ? entries[0] : controller?.sync();
    const visibility = {
      ...readHudVisibility(),
      playerFooter: scenario.endsWith("-footer"),
      ...(scenario === "player-main-no-favorites" ? { favorites: false } : {}),
      ...(companion ? { favorites: false } : {}),
      ...(gm
        ? {
            modeNavigation: false,
            favorites: false,
            combatSkills: false,
            gm: true,
            actionTypesOnly: scenario === "gm-actions",
            search: scenario !== "gm-actions",
            attackDetails: true
          }
        : {})
    };
    const state = createHudState({
      companionsExpanded: scenario.startsWith("player-companions"),
      currentView:
        companion ||
        scenario.startsWith("player-companions") ||
        scenario.startsWith("player-main")
          ? "main"
          : scenario.replace("player-", ""),
      combatCategory:
        scenario === "player-combat-inventory"
          ? "inventory"
          : scenario === "player-combat-skills"
            ? "skills"
            : scenario.endsWith("spells")
              ? "spells"
              : "features",
      combatAbilitiesExpanded: true,
      gmSpeedsExpanded: true,
      gmLegendaryExpanded: true,
      proficientSkillsOnly: false,
      favoriteEntries: items
        .slice(0, 6)
        .map(item => ({ itemId: item.id, activityId: null }))
    });
    if (scenario === "gm-empty" || scenario === "gm-preparation") {
      if (scenario === "gm-preparation") {
        combat.started = false;
        const player = { ...actor, type: "character", name: "Player Hero" };
        const entry = {
          ...entries[0],
          id: "player",
          name: player.name,
          actor: player,
          token: { ...entries[0].token, actor: player }
        };
        combat.turns = [...entries, entry];
      }
      const empty = {
        isGM: () => true,
        getCombat: () => (scenario === "gm-preparation" ? combat : null),
        combats: () => [],
        roster: () => (scenario === "gm-preparation" ? entries : [])
      };
      bodies[scenario] =
        '<div class="ws-view ws-combat-view">' +
        renderGmCombatHeader({
          controller: empty,
          selectedId: null,
          adapter: dnd5eAdapter,
          escapeHTML: foundry.utils.escapeHTML,
          t,
          tf
        }) +
        "</div>";
      continue;
    }
    const presentation = createHudPresentation({
      companion,
      companions:
        companion || scenario.startsWith("player-companions")
          ? {
              navigationHTML: () =>
                renderFamiliarVision({
                  active: scenario.endsWith("-vision")
                    ? { name: "Сова — фамильяр Александриэль" }
                    : null,
                  ownerName: actor.name,
                  t,
                  tf,
                  escapeHTML: foundry.utils.escapeHTML
                }) +
                renderCompanionNavigation({
                  companion,
                  ownerName: "Александриэль — хранительница северной границы",
                  tf,
                  escapeHTML: foundry.utils.escapeHTML,
                  t,
                  currentUuid: "Actor.owl",
                  entries: [
                    {
                      uuid: "Scene.scene.Token.wolf",
                      actor: {
                        ...actor,
                        name: "Лютый волк — призыв хранительницы северной границы"
                      },
                      token: entries[1].token,
                      tokenOptions: []
                    },
                    {
                      uuid: "Actor.mephit",
                      actor: { ...actor, name: "Мефит — спутник вне сцены" },
                      token: null,
                      tokenOptions: []
                    }
                  ]
                }),
              sectionHTML: () =>
                renderCompanionSection({
                  visible: !companion,
                  expanded: state.companionsExpanded,
                  count: 3,
                  t,
                  body: renderCompanionList({
                    owner: actor,
                    visionUuid: scenario.endsWith("-vision")
                      ? "Actor.owl"
                      : null,
                    filter: scenario.includes("-all") ? "all" : "scene",
                    adapter: dnd5eAdapter,
                    t,
                    escapeHTML: foundry.utils.escapeHTML,
                    entries: [
                      {
                        uuid: "Actor.owl",
                        kind: "familiar",
                        name: "Сова",
                        actor: {
                          ...actor,
                          name: "Сова",
                          effects: [
                            {
                              name: "Благословение",
                              img: "icons/svg/aura.svg",
                              statuses: new Set()
                            },
                            {
                              name: "Отравлен",
                              img: "icons/svg/poison.svg",
                              statuses: new Set(["poisoned"])
                            }
                          ],
                          system: {
                            ...actor.system,
                            attributes: {
                              ...actor.system.attributes,
                              ac: { value: 11 },
                              hp: { value: 1, max: 1, temp: 0 }
                            }
                          }
                        },
                        token: entries[0].token,
                        tokenOptions: [],
                        reason: null
                      },
                      {
                        uuid: "Scene.scene.Token.wolf",
                        kind: "summon",
                        name: "Лютый волк — призыв хранительницы северной границы",
                        actor: {
                          ...actor,
                          name: "Лютый волк — призыв хранительницы северной границы",
                          system: {
                            ...actor.system,
                            attributes: {
                              ...actor.system.attributes,
                              ac: { value: 14 },
                              hp: { value: 22, max: 37, temp: 0 }
                            }
                          }
                        },
                        token: entries[1].token,
                        tokenOptions: [],
                        reason: null
                      },
                      {
                        uuid: "Actor.mephit",
                        kind: "companion",
                        actor: {
                          ...actor,
                          id: "mephit",
                          uuid: "Actor.mephit",
                          name: "Мефит — спутник вне сцены"
                        },
                        token: null,
                        tokenOptions: [],
                        reason: null
                      }
                    ]
                  })
                })
            }
          : null,
      actorContext: createHudActorContext({
        actor,
        token: entries[0].token,
        getCombat: () => combat,
        combatantId: entries[0].id
      }),
      adapter: dnd5eAdapter,
      gmActive: gm,
      gmController: controller,
      gmCombatant: selected,
      hudState: state,
      visibility,
      toolState: {
        tools,
        normalTools: tools.filter(t => !t.isMusic),
        instruments: tools.filter(t => t.isMusic)
      },
      t,
      tf
    });
    bodies[scenario] = (
      gm ||
      scenario === "companion-actions" ||
      scenario.startsWith("player-combat") ||
      scenario === "player-companions-combat"
        ? presentation.combatHTML()
        : presentation.normalHTML()
    ).replace("ws-view ws-hidden", "ws-view");
  }
  const baseline =
    '*{box-sizing:border-box}body{margin:0;padding:20px;background:#363b40;font:14px Arial,sans-serif}button,input,select{font:inherit}button{height:32px;line-height:normal;border:1px solid #666;border-radius:4px;background:#25282e;padding:4px;color:inherit}input,select{background:#25282e;border:1px solid #666;border-radius:4px;color:#eee;min-width:0}i.fa-solid{display:inline-block;width:1em;min-width:1em}i.fa-solid:before{content:"◇"}strong,b{font-weight:700}.window-header{display:flex;height:30px;gap:8px;align-items:center;padding:0 8px;background:#12161a;color:#ddd}.window-header b{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.window-content>form{margin:0}.dialog-content{width:100%}';
  return { bodies, css, baseline };
}
