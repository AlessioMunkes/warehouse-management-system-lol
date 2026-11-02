// ─────────────────────────────────────────────────────────────
// client/src/features/staff/useWorkingChrome.js
//
// Whether a floor screen is "being worked", so a phone can give the
// work the room. On a phone the app's top bar, the task's own pinned
// header, its pinned Finish bar and the bottom tab bar took about 400
// of 844 pixels, leaving the lines being counted in a strip between
// them. While the worker is working, they slide out of the way (the
// CSS is under "Working on a phone" in the floor screens section of
// index.css):
//   the top bar slides up (the tab bar stays: it is the way round),
//   the task's header slides up until only its title shows,
//   the Finish bar slides down until only its main button shows
//   ("Start over" and other second buttons wait).
// They only ever slide over the page; nothing changes height, so the
// lines being worked never move except by the worker's own scrolling.
//
// WORKING means: scrolled down the task, or typing in a field (the
// phone's keyboard is up and room is shortest then). Scrolling back up,
// reaching the very top, pulling down at the top, or leaving the field
// on a screen too short to scroll brings everything back, and so does
// opening another screen.
//
// THE TOP. A page at the top cannot be scrolled further up to ask for
// the bars, so reaching the top brings them back, and so does pulling
// down there (a swipe, or the mouse wheel).
//
// Only phones: on a tablet or desk the CSS does nothing with it.
//
// The top bar belongs to ManagerLayout, outside the floor shell, so it
// is reached through attributes on <html>: data-stf-floor while a floor
// screen is open (the top bar is laid over the page, ready to slide),
// data-stf-working while it is being worked. Both go with the screen.
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

// At the top: this close to it counts.
const AT_TOP = 2;
// Leaving a field on a page scrolled less than this: nothing to scroll
// back up through, so the bars come back.
const TOP = 24;
// A pull down at the top this far (in pixels) asks for the bars.
const PULL = 24;
// A scroll smaller than this either way is a wobble, not a direction.
const STEP = 8;
// After the bars change, scrolling is not read for this long, so a
// flick that is still settling cannot turn them straight back.
const SETTLE_MS = 250;

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

    // How far things go (index.css, "Working on a phone"):
    //   --app-topbar-h   the top bar's height: the page starts below it
    //   --stf-head-fold  how much of the task header may go above the
    //                    top, so its title is what stays (the view
    //                    toggle above it goes)
    //   --stf-foot-fold  how much of the Finish bar may go below the
    //                    bottom, so its main button is what stays
    //                    ("Start over" under it goes)
    // Read again each time the bars go: what a screen puts in its header
    // and bar changes as the work goes on.
    const html = document.documentElement;
    const measure = () => {
      const bar = document.querySelector('.app-topbar');
      if (bar) html.style.setProperty('--app-topbar-h', `${bar.offsetHeight}px`);
      const title = root.querySelector('.stf-task-head .stf-task-title');
      html.style.setProperty('--stf-head-fold', `${title ? Math.max(0, title.offsetTop - 8) : 0}px`);
      const foot = root.querySelector('.stf-task-foot');
      const main = foot?.querySelector('.stf-btn-primary');
      const extra = foot?.querySelector('.stf-btn-secondary');
      const fold = foot && main && extra
        ? foot.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom - 8
        : 0;
      html.style.setProperty('--stf-foot-fold', `${Math.max(0, fold)}px`);
    };
    html.setAttribute('data-stf-floor', '');
    measure();
    window.addEventListener('resize', measure);

    const set = (next) => {
      if (state.current.working === next) return;
      if (next) measure();
      state.current = { working: next, changedAt: Date.now() };
      setWorking(next);
    };

    let lastY = scroller.scrollTop;
    const onScroll = () => {
      const y = scroller.scrollTop;
      const settling = Date.now() - state.current.changedAt < SETTLE_MS;
      if (y <= AT_TOP) set(false);
      else if (!settling) {
        if (y - lastY > STEP) set(true);
        else if (lastY - y > STEP) set(false);
      }
      lastY = y;
    };
    // Pulling down at the top: the page cannot scroll up, so no scroll
    // event says so.
    const atTop = () => scroller.scrollTop <= AT_TOP;
    const onWheel = (e) => { if (e.deltaY < 0 && atTop()) set(false); };
    let touchY = null;
    const onTouchStart = (e) => { touchY = e.touches?.[0]?.clientY ?? null; };
    const onTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY;
      if (touchY !== null && y !== undefined && y - touchY > PULL && atTop()) set(false);
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
    scroller.addEventListener('wheel', onWheel, { passive: true });
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      html.removeAttribute('data-stf-floor');
      window.removeEventListener('resize', measure);
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
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
