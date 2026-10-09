import { test, expect } from "@playwright/test";
import { layoutFixture } from "./layout-fixture.mjs";
import { loadHudModules } from "./module-fixture.mjs";

for (const lang of ["en", "ru"]) {
  for (const theme of ["dark", "light"]) {
    test(`GM external actor and folder drops show a stable hint: ${lang}/${theme}`, async ({
      page
    }) => {
      const fixture = await layoutFixture(lang);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setContent(`<style>${fixture.baseline}\n${fixture.css}</style>
        <div id="directory" draggable="true">Actors</div>
        <section class="ws-rolls-dialog ws-theme-${theme}" style="width:1000px">
          <div class="window-content" style="height:420px"><div class="ws-shell">${fixture.bodies["gm-features"]}</div></div>
        </section>`);
      await loadHudModules(page, {
        "hud/gm/gm-actor-drop.js": ["bindGmActorDrop"]
      });
      await page.evaluate(lang => {
        window.enabled = true;
        window.enrolled = [];
        const actors = new Map(
          ["one", "two"].map(id => [
            id,
            {
              id,
              uuid: `Actor.${id}`,
              documentName: "Actor",
              type: "npc",
              isOwner: true,
              getTokenDocument: async () => ({
                toObject: () => ({ actorId: id })
              })
            }
          ])
        );
        actors.set("encounter", {
          id: "encounter",
          uuid: "Actor.encounter",
          documentName: "Actor",
          type: "encounter",
          isOwner: true,
          system: {
            getPlaceableMembers: async () => [
              {
                actor: actors.get("one"),
                quantity: { value: 2 }
              },
              { actor: actors.get("two"), quantity: { value: 1 } }
            ]
          }
        });
        const scene = { id: "scene", tokens: new Map() };
        const selected = { id: "selected" };
        window.game = {
          user: { isGM: true },
          actors,
          settings: {
            get: (_id, key) => (key === "gmActorDrop" ? window.enabled : false)
          }
        };
        const Token = {
          canUserCreate: () => true,
          createCombatants: async (tokens, { combat }) => {
            if (combat !== selected) throw Error("Wrong encounter");
            window.enrolled.push(tokens.map(token => token.actor.id));
          }
        };
        window.CONFIG = { Token: { documentClass: Token } };
        window.canvas = {
          scene,
          tokens: {
            activate() {},
            deactivate() {},
            placeTokens: async (data, options) => {
              if (!options.preConfirm() || !(await options.preCommit()))
                return [];
              return data.map((item, index) => {
                const token = {
                  id: `token-${index}`,
                  actor: actors.get(item.actorId),
                  parent: scene,
                  isOwner: true
                };
                scene.tokens.set(token.id, token);
                return token;
              });
            }
          }
        };
        const Actor = {
          fromDropData: async data =>
            data.type === "Folder"
              ? {
                  type: "Actor",
                  contents: [actors.get("one")],
                  getSubfolders: () => [{ contents: [actors.get("two")] }]
                }
              : actors.get(data.uuid.split(".").at(-1))
        };
        window.foundry = {
          utils: {
            getDocumentClass: type => (type === "Token" ? Token : Actor)
          }
        };
        window.ui = { notifications: { warn() {}, error() {} } };
        window.binding = bindGmActorDrop({
          root: document.querySelector(".ws-rolls-dialog"),
          controller: { isGM: () => true, getCombat: () => selected },
          isCurrent: () => true,
          performSceneAction: callback => callback(),
          t: () =>
            lang === "ru"
              ? "Перенесите сюда для добавления существ"
              : "Drop here to add creatures"
        });
        window.drag = (
          type,
          internal = false,
          hover = true,
          uuid = `${type}.one`
        ) => {
          const data = new DataTransfer();
          data.setData("text/plain", JSON.stringify({ type, uuid }));
          const source = internal
            ? document.querySelector(".ws-gm-creature")
            : document.querySelector("#directory");
          source.dispatchEvent(
            new DragEvent("dragstart", { bubbles: true, dataTransfer: data })
          );
          const roster = document.querySelector(".ws-gm-combat");
          if (hover)
            roster.dispatchEvent(
              new DragEvent("dragover", {
                bubbles: true,
                cancelable: true,
                dataTransfer: data
              })
            );
          return data;
        };
      }, lang);
      const before = await page.locator(".ws-gm-combat").boundingBox();
      await page.evaluate(() => {
        window.transfer = window.drag("Folder", false, false);
      });
      const hint = page.locator(".ws-gm-drop-hint");
      await expect(hint).toBeVisible();
      await expect(hint).not.toHaveClass(/ws-drop-active/);
      await page.evaluate(() =>
        document.querySelector(".ws-gm-combat").dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: window.transfer
          })
        )
      );
      await expect(hint).toHaveClass(/ws-drop-active/);
      await expect(hint).toContainText(
        lang === "ru" ? "Перенесите" : "Drop here"
      );
      expect(
        (await page.locator(".ws-gm-combat").boundingBox()).height
      ).toBeCloseTo(before.height, 1);
      const box = await hint.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(before.x);
      expect(box.x + box.width).toBeLessThanOrEqual(before.x + before.width);
      expect(
        await hint.evaluate(node => getComputedStyle(node).pointerEvents)
      ).toBe("none");
      await page.evaluate(() => {
        const data = new DataTransfer();
        const source = document.querySelector("#directory");
        source.addEventListener(
          "dragstart",
          event => {
            event.dataTransfer.setData(
              "text/plain",
              JSON.stringify({ type: "Folder", uuid: "Folder.one" })
            );
            event.stopPropagation();
          },
          { once: true }
        );
        source.dispatchEvent(
          new DragEvent("dragstart", { bubbles: true, dataTransfer: data })
        );
        window.transfer = data;
      });
      await expect(hint).toBeVisible();
      await page.evaluate(() =>
        document.querySelector(".ws-gm-combat").dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: window.transfer
          })
        )
      );
      await expect(hint).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => window.enrolled))
        .toEqual([["one", "two"]]);
      await page.evaluate(() => {
        const transfer = window.drag("Actor", false, true, "Actor.encounter");
        document.querySelector(".ws-gm-combat").dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer
          })
        );
      });
      await expect
        .poll(() => page.evaluate(() => window.enrolled))
        .toEqual([
          ["one", "two"],
          ["one", "one", "two"]
        ]);
      await page.evaluate(() => window.drag("Item"));
      await expect(hint).toHaveCount(0);
      await page.evaluate(() => window.drag("Actor", true));
      await expect(hint).toHaveCount(0);
      await page.evaluate(() => {
        window.drag("Actor");
        window.enabled = false;
        window.binding.sync();
      });
      await expect(hint).toHaveCount(0);
      await page.evaluate(() => window.drag("Actor"));
      await expect(hint).toHaveCount(0);
      await page.evaluate(() => {
        window.binding.dispose();
        window.enabled = true;
        window.drag("Folder");
      });
      await expect(hint).toHaveCount(0);
      await page.locator(".ws-shell").evaluate((node, body) => {
        node.innerHTML = body;
      }, fixture.bodies["gm-empty"]);
      await page.evaluate(lang => {
        window.binding = bindGmActorDrop({
          root: document.querySelector(".ws-rolls-dialog"),
          controller: { isGM: () => true },
          isCurrent: () => true,
          performSceneAction: callback => callback(),
          t: key =>
            key === "GM.DropSources"
              ? lang === "ru"
                ? "Акторы, Encounter или папки акторов"
                : "Actors, Encounters or actor folders"
              : lang === "ru"
                ? "Перенесите сюда для добавления существ"
                : "Drop here to add creatures"
        });
        window.drag("Actor", false, false);
      }, lang);
      await expect(hint).toBeVisible();
      for (const width of [270, 1000]) {
        await page.locator(".ws-rolls-dialog").evaluate((node, width) => {
          node.style.width = width + "px";
        }, width);
        expect(
          await hint.evaluate(node => {
            const bounds = node.getBoundingClientRect();
            return [...node.children].every(child => {
              const rect = child.getBoundingClientRect();
              return (
                rect.top >= bounds.top &&
                rect.bottom <= bounds.bottom &&
                rect.left >= bounds.left &&
                rect.right <= bounds.right
              );
            });
          })
        ).toBe(true);
      }
      await page.evaluate(() => window.binding.dispose());
      expect(errors).toEqual([]);
    });
  }
}
