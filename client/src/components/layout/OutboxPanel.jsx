// ─────────────────────────────────────────────────────────────
// client/src/components/layout/OutboxPanel.jsx
//
// What is waiting to send on this phone, one line each, opened from the
// offline bar.
//
// The bar can only say "3 things could not be sent". This is where a
// worker finds out which three, why, and what to do about each one:
// most just wait; one the server refused can be tried again or
// discarded. Before this list existed a refused item sat on the phone
// for good with "tell your manager" and nothing a manager could do.
//
// Discarding is the only way work leaves this list without reaching the
// server, so it takes two taps and says what is being thrown away.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useT } from '../../translations';

const savedWords = (at, t) => {
  const d = new Date(at);
  const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return t('offline.atTime', { time });
  return t('offline.onDate', { date: d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), time });
};

// Why this one is still here, in the worker's words.
const stateOf = (item, { online, otherOwner }, t) => {
  if (otherOwner) return t('offline.state.other', { name: item.userName || t('offline.someoneElse') });
  if (item.reason === 'stale') return t('offline.state.stale');
  if (item.permanent) return item.error || t('offline.state.refused');
  if (item.reason === 'signin') return t('offline.state.signin');
  if (!online) return t('offline.state.noSignal');
  if (item.reason === 'later') return t('offline.state.later');
  return t('offline.state.waiting');
};

export default function OutboxPanel({ open, onOpenChange, items, online, isOther, onRetry, onDiscard }) {
  const t = useT();
  const [confirming, setConfirming] = useState(null);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setConfirming(null); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('offline.panel.title')}</DialogTitle>
          <DialogDescription>{t('offline.panel.intro')}</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('offline.panel.empty')}</p>
        ) : (
          <ul className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto px-1">
            {items.map((item) => {
              const otherOwner = isOther(item);
              const stuck = Boolean(item.permanent) && !otherOwner;
              return (
                <li key={item.id} className="rounded-lg border border-line p-3">
                  <p className="text-sm font-semibold" translate="no">{item.label || t('offline.panel.unnamed')}</p>
                  <p className="text-xs text-muted-foreground">{t('offline.panel.saved', { when: savedWords(item.savedAt, t) })}</p>
                  <p className={`mt-1 text-sm ${stuck ? 'font-medium text-destructive' : ''}`}>{stateOf(item, { online, otherOwner }, t)}</p>

                  {otherOwner ? null : confirming === item.id ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-sm">{t('offline.panel.discardWarning')}</p>
                      <div className="flex gap-2">
                        <button type="button" className="rounded-[4px] bg-destructive px-3 py-2 text-sm font-semibold text-white"
                          onClick={() => { setConfirming(null); onDiscard(item.id); }}>
                          {t('offline.panel.discardYes')}
                        </button>
                        <button type="button" className="rounded-[4px] border border-line px-3 py-2 text-sm font-semibold"
                          onClick={() => setConfirming(null)}>
                          {t('offline.panel.keep')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      {stuck ? (
                        <button type="button" className="rounded-[4px] bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                          onClick={() => onRetry(item.id)}>
                          {t('offline.panel.tryAgain')}
                        </button>
                      ) : null}
                      <button type="button" className="rounded-[4px] border border-line px-3 py-2 text-sm font-semibold"
                        onClick={() => setConfirming(item.id)}>
                        {t('offline.panel.discard')}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
