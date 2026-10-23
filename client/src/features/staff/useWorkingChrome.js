// ─────────────────────────────────────────────────────────────
// client/src/features/staff/useWorkingChrome.js
//
// Whether a floor screen is "being worked", so a phone can give the
// work the room. On a phone the app's top bar, the task's own pinned
// header, its pinned Finish bar and the bottom tab bar took about 400
// of 844 pixels, leaving the lines being counted in a strip between
// them. While the worker is working, they step back (the CSS is under
// "Working on a phone" in the floor screens section of index.css):
//   the top bar and the tab bar go,
//   the task's header shrinks to its title,
//   the Finish bar keeps its main button and one line of what is
//   missing ("Start over" and other second buttons wait).
//
// WORKING means: scrolled down the task, or typing in a field (the
// phone's keyboard is up and room is shortest then). Scrolling back up,
// reaching the top, or leaving the field on a screen too short to
// scroll brings everything back, and so does opening another screen.
//
// Only phones: on a tablet or desk the CSS does nothing with it.
//
// The top bar belongs to ManagerLayout, outside the floor shell, so it
// is reached through an attribute on <html>, data-stf-working, removed
// again when the screen goes.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

// Scrolled less than this from the top: not working, whatever else.
const TOP = 24;
// A scroll smaller than this either way is a wobble, not a direction.
const STEP = 8;
// After the bars change, scrolling is not read for this long. Hiding
// them changes the page's height, the browser moves the scroll position
// to match, and that move read as "scrolled up" brought the bars back,
// which moved it again: the bars flickered.
const SETTLE_MS = 350;

const isTypingField = (el) => Boolean(el?.matches?.(
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select',
));

export default function useWorkingChrome(rootRef, pathname) {
  const [working, setWorking] = useState(false);
  // What the listeners last asked for, and when, to tell a scroll the
  // worker made from one the bars changing caused.
  const state = useRef({ working: false, changedAt: 0 });

  // A new screen starts with everything showing.
  const [screen, setScreen] = useState(pathname);
  if (screen !== pathname) {
    setScreen(pathname);
    setWorking(false);
  }
  useEffect(() => { state.current.working = working; }, [working]);

  useEffect(() => {
    const root = rootRef.current;
    // ManagerLayout's <main> is what scrolls; the floor shell sits in it.
    const scroller = root?.parentElement?.closest('main') ?? null;
    if (!root || !scroller) return undefined;

    const set = (next) => {
      if (state.current.working === next) return;
      state.current = { working: next, changedAt: Date.now() };
      setWorking(next);
    };

    let lastY = scroller.scrollTop;
    const onScroll = () => {
      const y = scroller.scrollTop;
      const settling = Date.now() - state.current.changedAt < SETTLE_MS;
      if (!settling) {
        if (y < TOP) set(false);
        else if (y - lastY > STEP) set(true);
        else if (lastY - y > STEP) set(false);
      }
      lastY = y;
    };
    const onFocusIn = (e) => { if (isTypingField(e.target)) set(true); };
    // Out of the field on a screen too short to scroll: there is no
    // scrolling up to bring the bars back, so they come back now.
    const onFocusOut = () => {
      setTimeout(() => {
        if (!isTypingField(document.activeElement) && scroller.scrollTop < TOP) set(false);
      }, 0);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, [rootRef]);

  useEffect(() => {
    const html = document.documentElement;
    if (working) html.setAttribute('data-stf-working', '');
    else html.removeAttribute('data-stf-working');
    return () => html.removeAttribute('data-stf-working');
  }, [working]);

  return working;
}
