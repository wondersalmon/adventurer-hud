import { createLatestRefresh } from "./async-refresh.js";
import { reportFailure } from "../diagnostics.js";

export async function createHudToolState({
  actor,
  adapter,
  isRendered,
  scheduleRefresh
}) {
  const loadTools = () =>
    adapter.getTools(actor, {
      localize: value => game.i18n.localize(value)
    });
  const tools = await loadTools();
  const toolState = {
    tools,
    normalTools: tools.filter(tool => !tool.isMusic),
    instruments: tools.filter(tool => tool.isMusic)
  };

  const refreshTools = createLatestRefresh({
    load: loadTools,
    isCurrent: isRendered,
    apply: next => {
      toolState.tools = next;
      toolState.normalTools = next.filter(tool => !tool.isMusic);
      toolState.instruments = next.filter(tool => tool.isMusic);
      scheduleRefresh();
    },
    onError: error => {
      reportFailure("hud.tools.refresh", error, { level: "warn" });
    }
  });

  return { toolState, refreshTools };
}
