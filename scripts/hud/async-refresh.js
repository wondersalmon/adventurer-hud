export function createLatestRefresh({ load, apply, isCurrent, onError }) {
  let version = 0;
  return async () => {
    const requested = ++version;
    try {
      const value = await load();
      if (requested !== version || !isCurrent()) return;
      apply(value);
    } catch (error) {
      onError(error);
    }
  };
}
