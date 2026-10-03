import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { installSettings } from "../tests/helpers/foundry.mjs";
import { prepareSettingsGroups } from "../scripts/settings-form.js";
import {
  getAdvancedSettingGroups,
  getCompanionSettingGroups,
  getGmSettingGroups
} from "../scripts/settings-schema.js";

const engine = Handlebars.create();
engine.registerHelper("checked", value => (value ? "checked" : ""));
const template = engine.compile(
  await readFile(new URL("../templates/settings.hbs", import.meta.url), "utf8")
);
const css = await readFile(
  new URL("../styles/dialogs.css", import.meta.url),
  "utf8"
);
const strings = JSON.parse(
  await readFile(new URL("../lang/ru.json", import.meta.url), "utf8")
);
const t = key => strings[`ADVENTURER_HUD.${key}`] ?? key;

for (const section of ["advanced", "companions", "gm"]) {
  test(`${section} settings render selections and dependent controls without overflow`, async ({
    page
  }) => {
    installSettings({ isGM: true, values: { showCompanions: false } });
    const groups = prepareSettingsGroups({
      groups:
        section === "gm"
          ? getGmSettingGroups()
          : section === "companions"
            ? getCompanionSettingGroups()
            : getAdvancedSettingGroups(),
      readValue: key => game.settings.get("adventurer-hud", key),
      t
    });
    const body = template({ groups, saveLabel: "Сохранить" });
    for (const width of [360, 620]) {
      await page.setViewportSize({ width: width + 30, height: 1000 });
      await page.setContent(
        `<style>body{margin:10px;background:#18181b;color:#eee;font:14px Arial}*{box-sizing:border-box}section{width:${width}px}.form-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,45%);gap:8px;margin:12px 0}.hint{grid-column:1/-1;margin:0;color:#bbb}.form-fields{min-width:0}select{width:100%;min-width:0}input,select,button{font:inherit}fieldset{min-width:0}legend{max-width:100%;overflow-wrap:anywhere}button{padding:8px}${css}</style><section class="adventurer-hud-settings">${body}</section>`
      );
      await expect(page.locator('[data-action="reset"]')).toHaveCount(0);
      if (section === "gm") {
        await expect(
          page.locator('select[name="gmActionDisplay"]')
        ).toHaveValue("types");
        await expect(
          page.locator('select[name="gmSelectionMode"]')
        ).toHaveValue("turn");
        await expect(page.locator('select[name="gmCardDetails"]')).toHaveValue(
          "full"
        );
        await expect(
          page.locator('input[name="gmHideSearch"]')
        ).not.toBeChecked();
        await page
          .locator('select[name="gmActionDisplay"]')
          .selectOption("all");
        await expect(
          page.locator('select[name="gmActionDisplay"]')
        ).toHaveValue("all");
      } else {
        await expect(page.locator('input[name="debugWindowSize"]')).toHaveCount(
          0
        );
        await expect(
          page.locator('[data-parent-key="showCompanions"]')
        ).toHaveCount(section === "companions" ? 1 : 0);
        for (const control of await page
          .locator('[data-parent-key="showCompanions"]')
          .all())
          await expect(control).toBeDisabled();
      }
      expect(
        await page
          .locator("section")
          .evaluate(node => node.scrollWidth <= node.clientWidth + 1)
      ).toBe(true);
    }
  });
}
