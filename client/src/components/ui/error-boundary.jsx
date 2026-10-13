// ─────────────────────────────────────────────────────────────
// client/src/components/ui/error-boundary.jsx
//
// What a screen shows when it cannot be drawn. Without this, an error
// while a screen renders, or its file failing to arrive, takes the
// whole app down to a blank white page with nothing to say why.
//
// It wraps each screen on its own (App.jsx), inside the sidebar and
// top bar, so the rest of the app stays where it is and the person can
// simply go somewhere else. Reload fetches the screen again, which is
// the fix when the app was updated while the tab was open and the old
// page is asking for files that are no longer there.
//
// A class, because React only offers this through one.
// ─────────────────────────────────────────────────────────────
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // For whoever opens the console to find out what happened.
    console.error('[screen failed]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-bold text-ink">This screen could not be opened</h1>
        <p className="text-sm text-muted-foreground">
          Reload the page to try again. If it keeps happening, tell an administrator what you were doing.
        </p>
        <button type="button" onClick={() => window.location.reload()}
          className="mt-1 inline-flex h-9 items-center rounded-3xl bg-ink px-5 text-sm font-bold text-on-ink">
          Reload
        </button>
        {error?.message ? <p className="mt-2 max-w-full break-words text-xs text-muted-foreground">Details: {error.message}</p> : null}
      </div>
    );
  }
}
