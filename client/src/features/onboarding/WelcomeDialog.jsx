// ─────────────────────────────────────────────────────────────
// client/src/features/onboarding/WelcomeDialog.jsx
//
// The card a worker, manager or admin sees the first time they sign in
// (useWelcome.js decides when). Four lines on how their side of the
// system works, the last always pointing at the round Help button,
// which has no word on it and is easy to miss.
//
// Each role is told only about its own screens, by the names its menu
// uses. When a menu or a screen's name changes, change it here too.
//
// The warehouse worker's card is translated, like every floor screen;
// managers and admins work in English, like the rest of their screens.
// ─────────────────────────────────────────────────────────────
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useT } from '../../translations';

// [lead, rest] per line: the lead is the thing to remember, in bold.
const MANAGER = [
  ['Your dashboard', 'shows today at a glance. Needs attention, at the top, lists what to act on first.'],
  ['The menu', 'groups your work: Inbound for purchase orders, Stock for inventory, Outbound for picking slips and collections.'],
  ['Operations reports', 'answer questions asked in plain words, such as how much rice went out last month.'],
];

const ADMIN = [
  ['Master data', 'is where you set up users, products and suppliers.'],
  ['Settings', 'holds how the warehouse is set up and its connections, such as email.'],
  ['Logs', 'show who changed what, and what was archived.'],
];

export default function WelcomeDialog({ user, open, onClose }) {
  const t = useT();
  if (!open || !user) return null;

  const worker = user.role === 'warehouse_worker';
  const title = user.firstName ? t('welcome.title', { name: user.firstName }) : t('welcome.titleNoName');
  const points = worker
    ? [t('welcome.worker.tasks'), t('welcome.worker.views'), t('welcome.worker.offline')].map((text) => [null, text])
    : (user.role === 'admin' ? ADMIN : MANAGER);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('welcome.intro')}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed">
          {points.map(([lead, rest]) => (
            <li key={rest}>
              {lead ? <><strong className="font-semibold">{lead}</strong>{' '}</> : null}
              {rest}
            </li>
          ))}
          <li>{t('welcome.help')}</li>
        </ol>
        <DialogFooter>
          <Button type="button" onClick={onClose} autoFocus>{t('welcome.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
