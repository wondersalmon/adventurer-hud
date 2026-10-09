import { rollDiceTray } from "../dnd5e/dice-tray.js";
import { reportFailure } from "../diagnostics.js";

export const TRAY_DICE = Object.freeze([2, 4, 6, 8, 10, 12, 20, 100]);

const DIE_FACES = {
  2: "M10 20a10 13 0 1 0 20 0a10 13 0 1 0-20 0 M15 9v22 M25 9v22",
  4: "M20 5 36 33H4Z M20 5v28 M4 33l16-9 16 9",
  6: "M20 4 35 12v17L20 37 5 29V12Z M5 12l15 8 15-8 M20 20v17",
  8: "M20 3 35 20 20 37 5 20Z M5 20h30 M20 3l7 17-7 17-7-17Z",
  10: "M20 3 36 16 28 33 20 38 12 33 4 16Z M20 3v35 M4 16l16 8 16-8 M12 33l8-9 8 9",
  12: "M20 3 35 14 30 32H10L5 14Z M20 11l10 8-4 11H14l-4-11Z M20 3v8 M35 14l-5 5 M30 32l-4-2 M10 32l4-2 M5 14l5 5",
  20: "M20 3 35 11v18L20 37 5 29V11Z M20 3 11 26h18Z M5 11l24 15 6-15 M5 29l6-3 9 11 9-11 6 3",
  100: "M20 3 35 11v18L20 37 5 29V11Z M20 3v34 M5 11l15 10 15-10 M5 29l15-8 15 8"
};

export function diceTrayFormula(counts, extra = "") {
  const dice = TRAY_DICE.filter(die => counts[die] > 0)
    .map(die => `${counts[die]}d${die}`)
    .join(" + ");
  const text = extra.trim();
  return dice && text ? `${dice} + (${text})` : dice || text;
}

// Use Foundry's existing interface context; never create or close a shared context.
export function playDiceTraySound(effect) {
  const audio = globalThis.game?.audio;
  const context = audio?.interface;
  if (
    !context ||
    context.state !== "running" ||
    audio.globalMute ||
    audio.locked
  )
    return () => {};
  const nodes = new Set();
  const stop = () => {
    for (const { oscillator, gain } of nodes) {
      oscillator.onended = null;
      try {
        oscillator.stop();
      } catch {
        /* Already ended. */
      }
      oscillator.disconnect();
      gain.disconnect();
    }
    nodes.clear();
  };
  try {
    const volume = Number(game.settings.get("core", "globalInterfaceVolume"));
    if (!Number.isFinite(volume) || volume <= 0) return stop;
    const notes =
      effect === "ws-tray-nat20"
        ? [
            [0, 523, 784, 0.26, "sine"],
            [0.1, 659, 988, 0.3, "sine"],
            [0.2, 784, 1175, 0.35, "sine"],
            [0.32, 1047, 1568, 0.48, "sine"]
          ]
        : effect === "ws-tray-nat1"
          ? [
              [0, 620, 180, 0.32, "sawtooth"],
              [0.1, 310, 120, 0.38, "triangle"]
            ]
          : [
              [0, 135, 60, 0.16, "triangle"],
              [0.12, 260, 70, 0.12, "square"]
            ];
    for (const [delay, frequency, endFrequency, duration, type] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const node = { oscillator, gain };
      nodes.add(node);
      const start = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        Math.min(1, volume) * (effect === "ws-tray-nat1" ? 0.09 : 0.055),
        start + 0.008
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        nodes.delete(node);
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    }
  } catch (error) {
    stop();
    reportFailure("hud.dice-tray.audio", error, { notify: false });
  }
  return stop;
}

export function bindDiceTray({ app, actor, t, isActive }) {
  const root = app.element;
  const doc = root.ownerDocument;
  const viewport = doc.defaultView ?? globalThis.window;
  let tray = null;
  let anchor = null;
  let counts = {};
  let extra = "";
  const messageModes = ["public", "gm", "blind", "self"];
  let messageMode = globalThis.game?.user?.isGM
    ? "self"
    : game.settings.get("core", "messageMode");
  if (!messageModes.includes(messageMode)) messageMode = "public";
  const canRoll = () => Boolean(globalThis.game?.user?.isGM || actor?.isOwner);
  let busy = false;
  let effectTimer = null;
  let stopSound = () => {};
  let mimicClicks = 0;
  let lastMimicClick = 0;
  const clearEffect = () => {
    stopSound();
    stopSound = () => {};
    clearTimeout(effectTimer);
    effectTimer = null;
    tray?.classList.remove("ws-tray-mimic", "ws-tray-nat20", "ws-tray-nat1");
  };
  const showEffect = (...effects) => {
    if (!tray || !isActive()) return;
    clearEffect();
    // Restart a consecutive identical effect without forcing a layout read.
    const target = tray;
    effectTimer = setTimeout(() => {
      if (tray !== target || !isActive()) return;
      target.classList.add(...effects);
      stopSound = playDiceTraySound(effects[0]);
      effectTimer = setTimeout(clearEffect, 1600);
    }, 0);
  };
  const close = (focus = false) => {
    clearEffect();
    mimicClicks = 0;
    lastMimicClick = 0;
    tray?.remove();
    tray = null;
    anchor?.setAttribute("aria-expanded", "false");
    if (focus && anchor?.isConnected) anchor.focus();
    anchor = null;
  };
  app.closeDiceTray = close;
  const position = () => {
    if (!tray) return;
    if (!isActive() || !anchor?.isConnected) return close();
    const windowRect = root.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const scale =
      windowRect.width / (root.offsetWidth || windowRect.width) || 1;
    const left = Math.max(4, windowRect.left);
    const right = Math.min(viewport.innerWidth - 4, windowRect.right);
    const top = Math.max(4, windowRect.top);
    const bottom = Math.min(viewport.innerHeight - 4, windowRect.bottom);
    tray.style.width = `${Math.min(300, Math.max(1, (right - left) / scale))}px`;
    tray.style.maxHeight = `${Math.max(1, (bottom - top) / scale)}px`;
    const size = tray.getBoundingClientRect();
    tray.style.left = `${(Math.max(left, Math.min(rect.right - size.width, right - size.width)) - windowRect.left) / scale}px`;
    tray.style.top = `${(Math.max(top, Math.min(rect.top - size.height - 6, bottom - size.height)) - windowRect.top) / scale}px`;
  };
  const sync = () => {
    if (!tray) return;
    for (const button of tray.querySelectorAll("[data-die]")) {
      const count = counts[button.dataset.die] ?? 0;
      button.querySelector("small").textContent = count;
      button.classList.toggle("ws-die-selected", count > 0);
      button.setAttribute(
        "aria-label",
        `d${button.dataset.die}: ${count}. ${t("DiceTray.Gestures")}`
      );
    }
    const formula = diceTrayFormula(counts, extra);
    tray.querySelector("output").textContent = formula;
    const rollButton = tray.querySelector('[data-dice-tray="roll"]');
    rollButton.disabled = busy || !formula;
    if (!formula) {
      rollButton.title = t("DiceTray.Empty");
      rollButton.setAttribute("aria-description", t("DiceTray.Empty"));
    } else {
      rollButton.removeAttribute("title");
      rollButton.removeAttribute("aria-description");
    }
    position();
  };
  const roll = async formula => {
    if (busy || !formula || !canRoll() || !isActive()) return;
    busy = true;
    sync();
    try {
      const rolledTray = tray;
      let natural20 = false;
      let natural1 = false;
      const total = await rollDiceTray(
        actor,
        formula,
        isActive,
        result => {
          for (const die of result.dice ?? []) {
            if (die.faces !== 20) continue;
            for (const face of die.results ?? []) {
              if (face.active === false || face.discarded || face.rerolled)
                continue;
              if (face.result === 20) natural20 = true;
              if (face.result === 1) natural1 = true;
            }
          }
        },
        messageMode
      );
      if (
        tray &&
        tray === rolledTray &&
        canRoll() &&
        isActive() &&
        total != null
      ) {
        counts = {};
        const labels = [
          natural20 && t("DiceTray.Natural20"),
          natural1 && t("DiceTray.Natural1")
        ].filter(Boolean);
        tray.querySelector("[data-dice-result]").textContent =
          `${formula} = ${total}${labels.length ? ` · ${labels.join(" · ")}` : ""}`;
        clearEffect();
        if (natural20 || natural1)
          showEffect(
            ...[
              natural20 && "ws-tray-nat20",
              natural1 && "ws-tray-nat1"
            ].filter(Boolean)
          );
      }
    } catch (error) {
      reportFailure("hud.dice-tray.roll", error, { t });
      if (tray)
        tray.querySelector("[data-dice-result]").textContent =
          t("DiceTray.Invalid");
    } finally {
      busy = false;
      sync();
    }
  };
  const open = button => {
    anchor = button;
    tray = doc.createElement("section");
    tray.className = "ws-dice-tray";
    tray.setAttribute("role", "dialog");
    tray.setAttribute("aria-label", t("DiceTray.Title"));
    tray.innerHTML = `<div class="ws-tray-fortune" aria-hidden="true"><span class="ws-tray-rune">✦</span><span class="ws-tray-sparks"></span></div><div class="ws-tray-face" aria-hidden="true"><span class="ws-tray-eyes"></span><span class="ws-tray-teeth"></span></div><header><strong data-dice-tray="mimic" role="button" tabindex="0"><i class="fa-solid fa-dice" aria-hidden="true"></i>${t("DiceTray.Title")}</strong><button type="button" class="ws-button" data-dice-tray="close" aria-label="${t("DiceTray.Close")}">×</button></header>
      <div class="ws-dice-grid">${TRAY_DICE.map(die => `<button type="button" class="ws-button" data-die="${die}"><svg class="ws-die-face" viewBox="0 0 40 40" aria-hidden="true"><path d="${DIE_FACES[die]}"/></svg><span>d${die}</span><small>0</small></button>`).join("")}</div>
      <div class="ws-dice-shortcuts" aria-label="${t("DiceTray.Gestures")}"><div class="ws-shortcuts">
        <span><kbd>${t("Shortcuts.LeftClick")}</kbd> +1</span>
        <span><kbd>${t("Shortcuts.RightClick")}</kbd> −1</span>
      </div><div class="ws-shortcuts">
        <span><kbd>Shift</kbd> ${t("Shortcuts.Fast")}</span>
        <span><kbd>Alt</kbd> ${t("Shortcuts.Advantage")}</span>
        <span><kbd>Ctrl</kbd> ${t("Shortcuts.Disadvantage")}</span>
      </div></div>
      <div class="ws-dice-formula"><label for="ws-dice-formula">${t("DiceTray.Formula")}</label><div class="ws-dice-formula-row"><span class="ws-dice-formula-symbol" aria-hidden="true">Σ</span><input id="ws-dice-formula" type="text" maxlength="256" data-dice-formula placeholder="+5 / 1d6"><button type="button" class="ws-button" data-dice-tray="clear" title="${t("DiceTray.Clear")}" aria-label="${t("DiceTray.Clear")}"><i class="fa-solid fa-eraser" aria-hidden="true"></i></button></div></div>
      <label class="ws-dice-visibility">${t("DiceTray.Visibility")}<select data-dice-visibility aria-label="${t("DiceTray.Visibility")}">${messageModes.map(mode => `<option value="${mode}" ${mode === messageMode ? "selected" : ""}>${t(`DiceTray.Mode.${mode}`)}</option>`).join("")}</select></label>
      <output aria-live="polite"></output><div class="ws-dice-commands"><button type="button" class="ws-button" data-dice-tray="roll"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i>${t("DiceTray.Roll")}</button></div><div data-dice-result role="status"></div>`;
    root.append(tray);
    tray.querySelector("input").value = extra;
    anchor.setAttribute("aria-expanded", "true");
    sync();
    tray.querySelector("[data-die]").focus();
  };
  const click = event => {
    const button = event.target.closest?.("[data-dice-tray], [data-die]");
    if (!button || !root.contains(button) || !isActive()) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.die) {
      const die = Number(button.dataset.die);
      if (!TRAY_DICE.includes(die)) return;
      if (event.altKey || event.ctrlKey || event.shiftKey)
        void roll(
          event.altKey
            ? `2d${die}kh`
            : event.ctrlKey
              ? `2d${die}kl`
              : `1d${die}`
        );
      else {
        counts[die] = (counts[die] ?? 0) + 1;
        sync();
      }
    } else {
      switch (button.dataset.diceTray) {
        case "toggle":
          if (tray) close(true);
          else if (canRoll()) open(button);
          break;
        case "mimic": {
          const now = Date.now();
          mimicClicks = now - lastMimicClick < 1500 ? mimicClicks + 1 : 1;
          lastMimicClick = now;
          if (mimicClicks >= 5) {
            mimicClicks = 0;
            showEffect("ws-tray-mimic");
          }
          break;
        }
        case "close":
          close(true);
          break;
        case "clear":
          clearEffect();
          counts = {};
          extra = "";
          tray.querySelector("input").value = "";
          sync();
          break;
        case "roll":
          void roll(diceTrayFormula(counts, extra));
          break;
      }
    }
  };
  const context = event => {
    const button = event.target.closest?.("[data-die]");
    if (!tray?.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const die = Number(button.dataset.die);
    counts[die] = Math.max(0, (counts[die] ?? 0) - 1);
    sync();
  };
  const input = event => {
    if (event.target.matches?.("[data-dice-visibility]")) {
      if (messageModes.includes(event.target.value))
        messageMode = event.target.value;
      return;
    }
    if (!event.target.matches?.("[data-dice-formula]")) return;
    extra = event.target.value;
    sync();
  };
  const outside = event => {
    if (tray && !tray.contains(event.target) && !anchor?.contains(event.target))
      close();
  };
  const key = event => {
    if (!tray) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (
      ["Enter", " "].includes(event.key) &&
      event.target.matches?.('[data-dice-tray="mimic"]')
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.target.click();
    } else if (
      event.key === "Enter" &&
      event.target.matches?.("[data-dice-formula]")
    ) {
      event.preventDefault();
      event.stopPropagation();
      void roll(diceTrayFormula(counts, extra));
    } else if (event.key === "Tab") {
      const focusable = [
        ...tray.querySelectorAll(
          'button:not(:disabled), input, select, [data-dice-tray="mimic"]'
        )
      ];
      const index = focusable.indexOf(doc.activeElement);
      if (
        (event.shiftKey && index <= 0) ||
        (!event.shiftKey && index === focusable.length - 1)
      ) {
        event.preventDefault();
        focusable[event.shiftKey ? focusable.length - 1 : 0].focus();
      }
    }
  };
  root.addEventListener("click", click, true);
  root.addEventListener("contextmenu", context, true);
  root.addEventListener("input", input);
  root.addEventListener("change", input);
  doc.addEventListener("pointerdown", outside, true);
  doc.addEventListener("keydown", key, true);
  viewport.addEventListener?.("resize", position);
  root.addEventListener("scroll", position, true);
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(position) : null;
  observer?.observe(root);
  const changes =
    typeof MutationObserver === "function"
      ? new MutationObserver(records => {
          if (tray && (!tray.isConnected || !anchor?.isConnected)) close();
          else if (tray && records.some(record => record.target === root))
            position();
        })
      : null;
  changes?.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"]
  });
  return () => {
    close();
    observer?.disconnect();
    changes?.disconnect();
    if (app.closeDiceTray === close) app.closeDiceTray = null;
    root.removeEventListener("click", click, true);
    root.removeEventListener("contextmenu", context, true);
    root.removeEventListener("input", input);
    root.removeEventListener("change", input);
    doc.removeEventListener("pointerdown", outside, true);
    doc.removeEventListener("keydown", key, true);
    viewport.removeEventListener?.("resize", position);
    root.removeEventListener("scroll", position, true);
  };
}
