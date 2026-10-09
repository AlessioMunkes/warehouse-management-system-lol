// ─────────────────────────────────────────────────────────────
// client/src/components/layout/AccountMenu.jsx
//
// The menu behind a person's name in the top bar:
//
//   Profile            who you are signed in as (read only)
//   Help               how to do each job your role does
//   Shortcuts          the keyboard shortcuts
//   Change language…   warehouse staff only: the floor is what is translated
//   Log out
//
// Profile is read only on purpose. A name, email or role is changed by
// an admin on the Users screen, and the window says so.
//
// On a phone the name does not fit in the bar, so the button is the
// person's initials; the menu's first line says the name in full.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import LanguagePicker from '../../features/staff/LanguagePicker';
import { helpFor } from './helpContent';
import { shortcutGroups } from './shortcuts';
import useKeyboardShortcuts from './useKeyboardShortcuts';

const ROLE_LABELS = {
  warehouse_worker: 'Warehouse staff',
  manager: 'Manager',
  admin: 'Admin',
};

const initialsOf = (user) =>
  `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '?';

const Row = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-b-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    {/* A person's own details are data, never translated. */}
    <dd className="text-sm font-medium break-words" translate="no">{value}</dd>
  </div>
);

const Key = ({ children }) => (
  <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-line bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">
    {children}
  </kbd>
);

// One chord is keys pressed together ("Ctrl + B"); chords follow one
// another ("G then H").
const Keys = ({ keys }) => (
  <span className="flex shrink-0 items-center gap-1" translate="no">
    {/* Keyed by position: "G then G" repeats a key. */}
    {keys.map((chord, i) => (
      <span key={i} className="flex items-center gap-1">
        {i > 0 ? <span className="text-xs text-muted-foreground">then</span> : null}
        {chord.map((k, j) => (
          <span key={k} className="flex items-center gap-1">
            {j > 0 ? <span className="text-xs text-muted-foreground">+</span> : null}
            <Key>{k}</Key>
          </span>
        ))}
      </span>
    ))}
  </span>
);

const itemClass =
  'block w-full rounded-[4px] px-3 py-2 text-left text-sm font-semibold hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-none';

export default function AccountMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);       // 'profile' | 'help' | 'shortcuts' | 'language'
  const isWorker = user?.role === 'warehouse_worker';

  // ? opens the list of shortcuts from anywhere.
  useKeyboardShortcuts(user?.role, { onOpenShortcuts: () => setView('shortcuts') });

  if (!user) return null;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const show = (next) => { setOpen(false); setView(next); };
  const close = (isOpen) => { if (!isOpen) setView(null); };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Account menu for ${fullName}`}
            className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span aria-hidden="true" translate="no" className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initialsOf(user)}
            </span>
            <span className="hidden sm:inline" translate="no">{fullName}</span>
            <span className="hidden text-muted-foreground sm:inline">· {roleLabel}</span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-0 p-1.5">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 pb-2 pt-1.5">
            <p className="min-w-0 truncate text-sm text-muted-foreground" translate="no">
              {fullName}{user.username ? ` (${user.username})` : ''}
            </p>
            <button type="button" aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="py-1">
            <button type="button" className={itemClass} onClick={() => show('profile')}>Profile</button>
          </div>
          <div className="border-t border-line py-1">
            <button type="button" className={itemClass} onClick={() => show('help')}>Help</button>
            <button type="button" className={itemClass} onClick={() => show('shortcuts')}>Shortcuts</button>
            {isWorker ? (
              <button type="button" className={itemClass} onClick={() => show('language')}>Change language…</button>
            ) : null}
          </div>
          <div className="border-t border-line pt-1">
            <button type="button" className={itemClass} onClick={() => { setOpen(false); onLogout(); }}>Log out</button>
          </div>
        </PopoverContent>
      </Popover>

      {/* ── Profile ─────────────────────────────────────────── */}
      <Dialog open={view === 'profile'} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>
              These details can only be changed by an admin. Ask an admin if your name or email is wrong.
            </DialogDescription>
          </DialogHeader>
          <dl>
            <Row label="Name" value={fullName || 'Not recorded'} />
            <Row label="Username" value={user.username || 'Not recorded'} />
            <Row label="Registered email" value={user.email || 'No email on record'} />
            <div className="flex flex-col gap-0.5 py-2.5">
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="text-sm font-medium">{roleLabel}</dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>

      {/* ── Help ────────────────────────────────────────────── */}
      <Dialog open={view === 'help'} onOpenChange={close}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Help</DialogTitle>
            <DialogDescription>Choose what you are doing to see the steps.</DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
            {helpFor(user.role).map((topic) => (
              <details key={topic.title} className="group border-b border-line last:border-b-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold">
                  {topic.title}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ol className="list-decimal space-y-1.5 pb-4 pl-5 text-sm text-muted-foreground">
                  {topic.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </details>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Still stuck? Tap the chat button at the bottom of the screen to ask the assistant, or ask your manager.
          </p>
        </DialogContent>
      </Dialog>

      {/* ── Shortcuts ───────────────────────────────────────── */}
      <Dialog open={view === 'shortcuts'} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Shortcuts</DialogTitle>
            <DialogDescription>
              For a keyboard. They do nothing while you are typing in a field.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 max-h-[60vh] space-y-5 overflow-y-auto px-1">
            {shortcutGroups(user.role).map((group) => (
              <section key={group.title}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">{group.title}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.does} className="flex items-center justify-between gap-4 border-b border-line py-2 text-sm last:border-b-0">
                      <span>{item.does}</span>
                      <Keys keys={item.keys} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Change language (warehouse staff) ───────────────── */}
      <Dialog open={view === 'language'} onOpenChange={close}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change language</DialogTitle>
            <DialogDescription>The screens change as soon as you choose. It is saved to your account.</DialogDescription>
          </DialogHeader>
          <LanguagePicker />
        </DialogContent>
      </Dialog>
    </>
  );
}
