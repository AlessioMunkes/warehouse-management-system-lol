// ─────────────────────────────────────────────────────────────
// client/src/features/assistant/components/AssistantPanel.jsx
//
// The chat window. Anchored bottom-right above its launcher on a
// computer; a sheet across the bottom of a phone.
//
// modal='trap-focus', NOT modal={true}. The difference matters:
// focus is trapped, so a keyboard or screen-reader user is contained
// and cannot tab into the page behind (and the Close button inside
// the popup is their way out, which is why Base UI requires it) —
// but page scroll stays unlocked and the app behind stays visible
// and clickable. Someone reading "check the pallet against the slip"
// needs to look at the slip while they read it. A dimmed, blocked
// page would make the help and the work mutually exclusive, which is
// the opposite of the point.
//
// Nothing here is generated. Every answer is a block of text the
// server chose out of helpCatalog.js, so this file's job is to lay
// out four fixed shapes — a topic, a pointer to a screen, a question
// back, and an honest "not covered" — and nothing else.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Link, useNavigate } from 'react-router-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Send, ArrowRight, Loader2 } from 'lucide-react';
import { pathForScreen } from '../screenPaths';
import useAssistant from '../useAssistant';

// ── One answer ───────────────────────────────────────────────

function TopicAnswer({ topic, onOpenTopic }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{topic.title}</p>

      {/* The catalog writes in paragraphs separated by a blank line.
          Split rather than dangerouslySetInnerHTML: this text is
          ours, but the day someone pastes a topic in from elsewhere
          it should still be impossible for it to carry markup. */}
      {topic.body.split('\n\n').map((para, i) => (
        <p key={i} className="whitespace-pre-line">{para}</p>
      ))}

      {topic.steps?.length > 0 && (
        <ol className="ml-4 list-decimal space-y-1">
          {topic.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}

      {topic.related?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {topic.related.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpenTopic(r.id, r.title)}
              className="rounded-[4px] border px-2 py-1 text-xs hover:bg-muted/60"
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavigateAnswer({ screen, onClose }) {
  const to = pathForScreen(screen.id);

  // The app has already moved by the time this renders — see the
  // onNavigate handler below. So this confirms rather than offers,
  // and keeps a link for the one case where it did not: an id this
  // build has no route for. Then the sentence still answers the
  // question and nothing is broken.
  return (
    <div className="space-y-2">
      {to
        ? <p>Opened <span className="font-semibold">{screen.label}</span>.</p>
        : <p>That is on <span className="font-semibold">{screen.label}</span>.</p>}
      {to && (
        // buttonVariants on the Link, NOT <Button asChild><Link/></Button>.
        // This project's Button is a plain styled <button> — Base UI,
        // not Radix, so there is no asChild and no render prop, and
        // wrapping a Link in one nests an <a> inside a <button>.
        // Invalid HTML, and two focusable things in one control for
        // anyone on a keyboard.
        <Link
          to={to}
          onClick={onClose}
          className={buttonVariants({ size: 'sm', variant: 'secondary' })}
        >
          Go to {screen.label} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

function ClarifyAnswer({ question, options, onPick }) {
  return (
    <div className="space-y-2">
      <p>{question}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            className="rounded-[4px] border px-2.5 py-1.5 text-xs hover:bg-muted/60"
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotCoveredAnswer({ closest, onOpenTopic }) {
  return (
    <div className="space-y-2">
      {/* Says what to do next. "I don't know" on its own leaves
          someone exactly as stuck as they were. */}
      <p>
        I do not have an answer for that one. Someone on the floor or your
        manager will know.
      </p>
      {closest && (
        <button
          type="button"
          onClick={() => onOpenTopic(closest.id, closest.title)}
          className="rounded-[4px] border px-2.5 py-1.5 text-xs hover:bg-muted/60"
        >
          Did you mean: {closest.title}?
        </button>
      )}
    </div>
  );
}

function Answer({ entry, onOpenTopic, onPick, onClose }) {
  switch (entry.kind) {
    case 'topic':       return <TopicAnswer topic={entry.topic} onOpenTopic={onOpenTopic} />;
    case 'navigate':    return <NavigateAnswer screen={entry.screen} onClose={onClose} />;
    case 'clarify':     return <ClarifyAnswer question={entry.question} options={entry.options} onPick={onPick} />;
    case 'not_covered': return <NotCoveredAnswer closest={entry.closest} onOpenTopic={onOpenTopic} />;
    default:            return <p>{entry.text}</p>;
  }
}

// ── The panel ────────────────────────────────────────────────

export default function AssistantPanel({ open, onOpenChange, screen }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  // "Take me to inventory" actually takes them there.
  //
  // The panel stays open on a computer — it sits beside the page, so
  // you land on the screen with the help still in view and nothing
  // lost if the guess was wrong. On a phone it covers the page, so
  // staying open would mean navigating somewhere you cannot see;
  // there it closes.
  //
  // Nothing here decides WHETHER they may go: the server only ever
  // returns a screen their role allows, and pathForScreen returns
  // null for anything this build has no route for.
  const handleNavigate = useCallback((target) => {
    const to = pathForScreen(target.id);
    if (!to) return;
    navigate(to);
    if (!window.matchMedia?.('(min-width: 640px)')?.matches) onOpenChange(false);
  }, [navigate, onOpenChange]);

  const { entries, busy, suggestions, ask, openTopic } =
    useAssistant({ open, screen, onNavigate: handleNavigate });

  // Keep the newest answer in view. 'auto' rather than 'smooth' —
  // this fires on every answer, and a panel that slides on its own
  // is exactly what ACC-08 asks us not to do.
  //
  // Optional-called: scrollIntoView is a layout API, and there are
  // real environments without one (jsdom, a screenshot renderer).
  // Scrolling is a nicety; throwing here would take the whole panel
  // down with it.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: 'auto' });
  }, [entries.length, busy]);

  const submit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    ask(text);
    inputRef.current?.focus();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal="trap-focus" disablePointerDismissal>
      <Dialog.Portal>
        <Dialog.Popup
          aria-label="Help"
          className={[
            'fixed z-[60] flex flex-col overflow-hidden rounded-t-[8px] border bg-popover text-sm text-popover-foreground shadow-xl',
            'transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0',
            // Phone: across the bottom, resting on the tab bar.
            //
            // --wms-launcher-bottom and --wms-assistant-h are set by
            // AssistantLauncher from a measurement of the tab bar.
            // NOT --stf-tabbar-h, which staff.css declares on the
            // staff shell's own element and which is therefore
            // invisible to anything rendered above it — including
            // this panel and the toast stack.
            'inset-x-0 bottom-[calc(var(--wms-launcher-bottom,1rem)-1rem)]',
            'max-h-[calc(100dvh-var(--wms-assistant-h,4.75rem)-2rem)]',
            // Computer: a small window tucked above the launcher, so
            // the screen behind stays readable while you use it.
            'sm:inset-x-auto sm:right-4 sm:bottom-[var(--wms-assistant-h,4.75rem)]',
            'sm:h-[32rem] sm:w-[23rem] sm:rounded-[8px]',
          ].join(' ')}
        >
          <header className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold">Help</p>
              <p className="truncate text-xs text-muted-foreground">
                Ask me how to do something
              </p>
            </div>
            {/* Required inside the popup when focus is trapped: it is
                how a touch screen-reader user gets out. */}
            <Dialog.Close
              render={
                <Button type="button" variant="ghost" size="icon" aria-label="Close help">
                  <X />
                </Button>
              }
            />
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {entries.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Type a question in your own words, or start with one of these.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openTopic(s.id, s.title)}
                      className="w-full rounded-[4px] border px-2.5 py-2 text-left text-xs hover:bg-muted/60"
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* polite, not assertive: an answer is not an emergency,
                and interrupting a screen reader mid-sentence to read
                it out is worse than waiting for the pause. */}
            <div aria-live="polite" aria-atomic="false" className="space-y-3">
              {entries.map((entry) => (
                entry.from === 'user' ? (
                  <p
                    key={entry.key}
                    className="ml-auto w-fit max-w-[85%] rounded-[6px] bg-muted px-2.5 py-1.5"
                  >
                    {entry.text}
                  </p>
                ) : (
                  <div key={entry.key} className="max-w-[95%] leading-relaxed">
                    <Answer
                      entry={entry}
                      onOpenTopic={openTopic}
                      onPick={(o) => ask(o)}
                      onClose={() => onOpenChange(false)}
                    />
                  </div>
                )
              ))}
            </div>

            {busy && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Looking that up…
              </p>
            )}

            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t px-3 py-2">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="How do I…"
              aria-label="Ask a question"
              maxLength={300}
              disabled={busy}
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={busy || !draft.trim()}>
              <Send />
            </Button>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
