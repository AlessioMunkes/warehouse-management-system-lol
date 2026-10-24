// ─────────────────────────────────────────────────────────────
// client/src/features/onboarding/useWelcome.js
//
// Whether this person still has their welcome card to see.
//
// PER PERSON, ON THIS DEVICE. The coachmarks (staff/useCoachmark.js)
// are per browser, because they point at a control, and once anyone on
// a shared tablet has seen where the toggle is, it is on screen for the
// next person too. A welcome is said to someone: on a tablet the whole
// shift shares, each new worker gets their own the first time they
// sign in there. So the key carries the user id.
//
// Storage that cannot be read (a private window, storage switched off)
// counts as seen, the same rule useCoachmark uses: better no card than
// the same card on every load.
//
// Volunteers (guests) are not here: their home screen already greets
// them and explains the shift (GuestHomePage).
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';

export const WELCOME_ROLES = ['warehouse_worker', 'manager', 'admin'];

const keyFor = (userId) => `wms_welcome_seen:${userId}`;

const seen = (userId) => {
  try {
    return localStorage.getItem(keyFor(userId)) === 'true';
  } catch {
    return true;
  }
};

export default function useWelcome(user) {
  // Who closed theirs in this session, so the card goes the moment it
  // is closed even when storage refuses the write.
  const [closedFor, setClosedFor] = useState(null);

  const open = Boolean(user?.id)
    && WELCOME_ROLES.includes(user.role)
    && closedFor !== user.id
    && !seen(user.id);

  const dismiss = () => {
    if (!user?.id) return;
    setClosedFor(user.id);
    try { localStorage.setItem(keyFor(user.id), 'true'); } catch { /* shown again next time, at worst */ }
  };

  return { open, dismiss };
}
