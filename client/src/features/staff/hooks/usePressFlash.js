// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/usePressFlash.js
//
// The button a worker pressed flashes once.
//
// On a phone in a gloved hand, in a loud warehouse, there is no click to
// hear and often no visible change until the server answers. The flash
// says "that press landed" on the one control that was pressed, and
// nothing else on the screen moves.
//
// One listener for the whole floor shell rather than a prop on every
// button: the flows use several kinds of button (StepPrimitives, the
// shared ui Button, plain .stf-btn), and a press on any of them should
// feel the same. The look is .is-pressed in staff.css, which also
// switches it off for anyone who has asked for less movement.
//
// Disabled buttons do not flash: nothing happened.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';

export const PRESSED_CLASS = 'is-pressed';
const PRESSABLE = 'button, [role="button"], a.stf-btn';
const FLASH_MS = 400;

export default function usePressFlash(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;

    const timers = new Map();
    const onClick = (event) => {
      const el = event.target?.closest?.(PRESSABLE);
      // Only the floor's own screens, including a dialog one of them opened.
      if (!el || !el.closest('.stf-shell') || el.disabled || el.getAttribute('aria-disabled') === 'true') return;

      // Pressed again before the last flash ended: start it over.
      clearTimeout(timers.get(el));
      el.classList.remove(PRESSED_CLASS);
      // Reading a layout property makes the browser notice the class
      // went away, so adding it back restarts the animation.
      void el.offsetWidth;
      el.classList.add(PRESSED_CLASS);
      timers.set(el, setTimeout(() => { el.classList.remove(PRESSED_CLASS); timers.delete(el); }, FLASH_MS));
    };

    // Capture: a handler further down that stops the event must not
    // also stop the flash.
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      for (const [el, timer] of timers) { clearTimeout(timer); el.classList.remove(PRESSED_CLASS); }
    };
  }, [active]);
}
