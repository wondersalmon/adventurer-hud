import { readFile } from "node:fs/promises";

const routedPages = new WeakSet();
const origin = "https://adventurer-hud.test";

/** Load production ESM and its imports through a file-backed browser route. */
export async function loadHudModules(page, modules) {
  if (!routedPages.has(page)) {
    await page.route(`${origin}/scripts/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (!/^\/scripts\/[\w/.-]+\.js$/.test(path) || path.includes(".."))
        return route.abort();
      await route.fulfill({
        contentType: "text/javascript",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: await readFile(new URL(`..${path}`, import.meta.url), "utf8")
      });
    });
    routedPages.add(page);
  }
  await page.evaluate(
    async ({ origin, modules }) => {
      for (const [path, names] of Object.entries(modules)) {
        const loaded = await import(origin + "/scripts/" + path);
        for (const name of names) window[name] = loaded[name];
      }
    },
    { origin, modules }
  );
}
