// ─────────────────────────────────────────────────────────────
// client/src/lib/statusStyles.js
//
// How every status in every list is drawn, in one place.
//
// THREE SIGNALS, SO NO TWO STATUSES LOOK ALIKE
//   tone   — the colour, which is the MEANING and is shared on purpose:
//            green done · amber needs someone · red gone wrong ·
//            blue on its way · grey nothing to do
//   strong — solid fill or soft tint, to tell apart two statuses that
//            share a meaning (pending approval vs partly received are
//            both amber; one is soft, one solid)
//   icon   — each status's own picture, so it never rests on colour
//            alone (ACC-03) and survives a colour-blind reader or a
//            greyscale printout
//
// StatusStyles.test.js fails if any two statuses in the same list
// share all three.
// ─────────────────────────────────────────────────────────────
import {
  Ban, BadgeCheck, CalendarClock, CheckCheck, CircleDashed, CircleX, ClipboardList, Clock,
  FileCheck, Flag, Forward, Gift, History, House, Lock, Megaphone, PackageCheck, PackageOpen,
  PencilLine, Scale, SlidersHorizontal, Split, Trash2, TriangleAlert, Truck, Undo2,
} from 'lucide-react';

const s = (tone, icon, strong = false) => ({ tone, icon, strong });

export const STATUS_STYLES = {
  purchaseOrder: {
    pending:            s('warn', Clock),                 // waiting on a sign-off
    partially_received: s('warn', PackageOpen, true),     // some in, rest to chase
    approved:           s('info', BadgeCheck),            // signed off, not sent yet
    in_transit:         s('info', Truck, true),           // on its way
    completed:          s('good', CheckCheck, true),
    follow_up_required: s('bad', TriangleAlert),
    returned:           s('bad', Undo2, true),
  },
  delivery: {
    recorded: s('good', FileCheck),
    closed:   s('good', Lock, true),
    flagged:  s('bad', Flag, true),
  },
  dispatch: {
    awaiting:       s('info', Clock),
    collected:      s('good', CheckCheck, true),
    late_collected: s('warn', History),
    not_collected:  s('bad', CircleX, true),
    cancelled:      s('neutral', Ban),
  },
  kit: {
    assigned:   s('warn', House),                         // with the household
    logged:     s('info', Scale),                         // compost in, to go out
    dispatched: s('good', Truck, true),
  },
  volunteerEvent: {
    DRAFT:     s('warn', PencilLine),
    SCHEDULED: s('info', CalendarClock),
    PUBLISHED: s('good', Megaphone, true),
    COMPLETED: s('neutral', CheckCheck),
    CANCELLED: s('bad', Ban, true),
  },
  ledger: {
    received:   s('good', PackageCheck, true),
    donated:    s('good', Gift),
    dispatched: s('info', Truck, true),
    picked:     s('info', ClipboardList),
    wastage:    s('bad', Trash2, true),
    adjustment: s('warn', SlidersHorizontal),
    decanted:   s('neutral', Split),
  },
  communityRequest: {
    pending:             s('warn', Clock),
    fulfilled:           s('good', CheckCheck, true),
    partially_fulfilled: s('good', CircleDashed),
    referred:            s('info', Forward),
    declined:            s('bad', CircleX, true),
  },
};

// A "N variances" tag beside a status, not a status itself.
export const VARIANCE_STYLE = s('warn', Scale);

/** The style for a status, or a plain grey one if it is not listed. */
export const statusStyle = (kind, status) => STATUS_STYLES[kind]?.[status] ?? s('neutral', null);
