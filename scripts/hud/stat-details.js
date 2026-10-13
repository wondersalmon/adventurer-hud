// @ts-check
import { createLatestRefresh } from "./async-refresh.js";
import { reportFailure } from "../diagnostics.js";

/** Load the same AC breakdown as the native sheet only while the block is open.
 * @param {{actor: any, adapter: import('../../types/hud.js').HudAdapter, getRoot: () => HTMLElement | null, isCurrent: () => boolean}} options
 */
export function createArmorClassRefresh({
  actor,
  adapter,
  getRoot,
  isCurrent
}) {
  return createLatestRefresh({
    isCurrent,
    load: async () => {
      const node = getRoot()?.querySelector(
        ".ws-armor-class-details:not([hidden])"
      );
      const html = node ? await adapter.armorClassAttribution?.(actor) : null;
      return { node, html };
    },
    apply: ({ node, html }) => {
      if (
        node &&
        html &&
        getRoot()?.contains(node) &&
        !node.hasAttribute("hidden")
      )
        node.innerHTML = html;
    },
    onError: error =>
      reportFailure("hud.armor-class.refresh", error, { level: "warn" })
  });
}
