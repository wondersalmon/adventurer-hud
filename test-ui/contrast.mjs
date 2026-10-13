/** Measure solid CSS colors composited over the actual ancestor backgrounds. */
export async function measureTextContrast(
  locator,
  { backgroundPseudo = null } = {}
) {
  return locator.evaluate(async (node, backgroundPseudo) => {
    const ancestors = [];
    for (let current = node; current; current = current.parentElement)
      ancestors.unshift(current);
    getComputedStyle(node).backgroundColor;
    await Promise.all(
      ancestors.flatMap(element =>
        element.getAnimations().map(animation => animation.finished)
      )
    );
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "white"; // Browser canvas beneath a transparent document.
    ctx.fillRect(0, 0, 1, 1);
    for (const element of ancestors) {
      const style = getComputedStyle(element);
      if (style.backgroundImage !== "none" || Number(style.opacity) !== 1)
        throw new Error(
          "Contrast helper requires solid backgrounds and opacity 1"
        );
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
    }
    // Callers may name a solid pseudo-element that covers the text (e.g. nav arrows).
    if (backgroundPseudo) {
      const style = getComputedStyle(node, backgroundPseudo);
      if (style.backgroundImage !== "none" || Number(style.opacity) !== 1)
        throw new Error(
          "Contrast helper requires a solid pseudo-element background"
        );
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(0, 0, 1, 1);
    }
    const background = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    ctx.fillStyle = getComputedStyle(node).color;
    ctx.fillRect(0, 0, 1, 1);
    const foreground = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    const luminance = channels =>
      channels
        .map(value => {
          const v = value / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
          0
        );
    const fg = luminance(foreground),
      bg = luminance(background);
    return {
      ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      foreground,
      background
    };
  }, backgroundPseudo);
}
