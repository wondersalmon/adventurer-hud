# SC 1.0.3: automatic phase advancement stalls after a GM dialog

## Bug and reproduction

1. Enable automatic phase advancement in SC and leave one unfinished combatant in the current phase.
2. Open a dialog on the active GM's client and mark the last combatant Done/Moved.
3. Close the dialog: the phase may remain waiting, with `TypeError: Illegal invocation` in the console.

The error was also reproduced with the HUD closed by calling `GmBusyProbe.request()`: the waiting queue is populated, but the timer never starts. The temporary workaround is **Next phase** in SC.

## Cause and proposed fix in SC

In [GmBusyProbe.js](https://github.com/Shattered-Codex/sc-venaerys-initiative/blob/dfaf9cb0929135e9a0dc2dd0202dc21cd4c3b010/scripts/services/GmBusyProbe.js#L70), the browser timer is called as `this.setTimer(...)`, with the service instance as its receiver instead of the browser global. The fix belongs in SC's internal service.

Replace the constructor's default timer functions with safe wrappers:

```js
constructor({
  onChange = () => {},
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = timer => globalThis.clearTimeout(timer)
} = {}) {
  this.onChange = onChange;
  this.setTimer = setTimer;
  this.clearTimer = clearTimer;
}
```
