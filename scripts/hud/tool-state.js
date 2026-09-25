export async function createHudToolState({
  actor,
  adapter,
  cache,
  isRendered,
  scheduleRefresh
}) {
  const loadTools = () =>
    adapter.getTools(actor, {
      cache,
      localize: value => game.i18n.localize(value),
      resolveUuid: fromUuid
    });
  const tools = adapter.capabilities.tools ? await loadTools() : [];
  const toolState = {
    tools,
    normalTools: tools.filter(tool => !tool.isMusic),
    instruments: tools.filter(tool => tool.isMusic)
  };

  let version = 0;
  const refreshTools = async () => {
    if (!adapter.capabilities.tools) return;
    const requested = ++version;
    try {
      const next = await loadTools();
      if (requested !== version || !isRendered()) return;
      toolState.tools = next;
      toolState.normalTools = next.filter(tool => !tool.isMusic);
      toolState.instruments = next.filter(tool => tool.isMusic);
      scheduleRefresh();
    } catch (error) {
      console.warn("Adventurer HUD | tool refresh failed", error);
    }
  };

  return { toolState, refreshTools };
}
