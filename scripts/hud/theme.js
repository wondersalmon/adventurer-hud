export function synchronizeHudTheme(element, theme) {
  element.classList.toggle("ws-theme-light", theme === "light");
  element.classList.toggle("ws-theme-dark", theme === "dark");
  if (theme === "light" || theme === "dark") {
    element.removeAttribute("data-ws-auto-theme");
    return;
  }
  const nativeTheme = element.closest(".theme-light, .theme-dark");
  const scheme = nativeTheme
    ? nativeTheme.classList.contains("theme-light")
      ? "light"
      : "dark"
    : element.ownerDocument.defaultView?.getComputedStyle?.(
        element.parentElement ?? element
      )?.colorScheme;
  element.dataset.wsAutoTheme = scheme === "light" ? "light" : "dark";
}

export function watchHudTheme(element, getTheme) {
  const Observer = element.ownerDocument.defaultView?.MutationObserver;
  if (!Observer) return () => {};
  const observer = new Observer(() => synchronizeHudTheme(element, getTheme()));
  for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
    observer.observe(ancestor, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }
  return () => observer.disconnect();
}
