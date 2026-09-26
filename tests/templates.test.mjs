import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Handlebars from "handlebars";
import { fragment } from "./helpers/rendering.mjs";

const engine = Handlebars.create();
engine.registerHelper("checked", value => (value ? "checked" : ""));
for (const template of ["settings.hbs", "reset-settings.hbs"]) {
  test(
    template + " renders one root and preserves button semantics",
    async () => {
      const source = await readFile(
        new URL("../templates/" + template, import.meta.url),
        "utf8"
      );
      const root = fragment(
        engine.compile(source)({
          groups: [
            {
              label: "Interface",
              settings: [
                {
                  key: "enabled",
                  name: "Enabled <flag>",
                  hint: "A & B",
                  value: true
                },
                { key: "disabled", name: "Disabled", value: false }
              ]
            }
          ],
          resetLabel: "Reset",
          saveLabel: "Save",
          cancelLabel: "Cancel",
          confirmLabel: "Reset settings?"
        })
      );
      assert.equal(root.children.length, 1);
      assert.equal(root.querySelectorAll('button[type="submit"]').length, 1);
      assert.equal(
        root.querySelector("button[data-action]").getAttribute("type"),
        "button"
      );
      if (template === "settings.hbs") {
        assert.equal(root.querySelectorAll("input[checked]").length, 1);
        assert.equal(
          root.querySelector('label[for="adventurer-hud-enabled"]').textContent,
          "Enabled <flag>"
        );
        assert.equal(root.querySelector(".hint").textContent, "A & B");
        assert.equal(root.querySelectorAll("flag").length, 0);
      }
    }
  );
}
