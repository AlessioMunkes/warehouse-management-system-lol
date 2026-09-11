// ───────────────────────────────────────────────────────────
// client/src/features/staff/components/TaskPage.jsx
//
// A whole-screen task: sticky head, scrolling body, sticky commit bar.
//
// This replaces the <Dialog> both staff flows used to render into. A
// dialog was the wrong container for the primary work of a screen:
//   - on a laptop it is a 560px box on a 1350px display, so the work
//     scrolls inside a small window surrounded by empty background
//   - on a phone it fights the fixed tab bar for the bottom of the
//     screen, which is where the commit button wants to be
//   - Escape and the backdrop dismiss it, which for a half-counted
//     delivery is a data-loss gesture with no confirmation
//   - the browser back button does not close it, and a refresh loses
//     it entirely
//
// `side` is the second pane. Above 1024px it sits to the right of the
// body as a sticky column — the running summary and the thing you
// press when you are done. Below that it drops beneath the body in
// normal flow, because a tablet at a loading bay has one column.
// ───────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export default function TaskPage({ title, sub, children, side, actions, note }) {
  const headingRef = useRef(null);

  // Same reason StepScreen does it: the heading changes when the task
  // does, and without moving focus a screen-reader user stays parked
  // on a control that no longer exists.
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <section className="stf-task">
      <header className="stf-task-head">
        <h1 className="stf-task-title" ref={headingRef} tabIndex={-1}>{title}</h1>
        {sub ? <p className="stf-task-sub">{sub}</p> : null}
      </header>

      <div className="stf-task-cols">
        <div className="stf-task-main">{children}</div>
        {side ? <aside className="stf-task-side">{side}</aside> : null}
      </div>

      {actions || note ? (
        <footer className="stf-task-foot">
          {/* The reason above the button, not hidden in a tooltip. A
              disabled primary with no explanation is a dead end, and
              on this screen the missing thing is usually a field the
              worker has scrolled past. */}
          {note ? <p className="stf-task-note" role="status">{note}</p> : null}
          {actions}
        </footer>
      ) : null}
    </section>
  );
}
