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
  AlarmClock, Ban, Check, BadgeCheck, CalendarCheck, CalendarClock, CalendarX, CheckCheck, CircleDashed,
  CircleOff, CircleX, ClipboardList, DoorOpen, Clock, FileCheck, Flag, Forward, Gift, History, House, Lock,
  LogOut, Megaphone, PackageCheck, PackageOpen, PencilLine, Scale, SlidersHorizontal, Split, Trash2,
  Send, TriangleAlert, Truck, Undo2,
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
    pending:             s('warn', Clock),                // awaiting approval
    approved:            s('info', BadgeCheck),           // items chosen, stock set aside
    needs_items:         s('warn', TriangleAlert),        // approved, but its stock was used
    fulfilled:           s('good', CheckCheck, true),
    partially_fulfilled: s('good', CircleDashed),
    referred:            s('info', Forward),
    declined:            s('bad', CircleX, true),
  },
  // A slip's place in the week, as the Picking Slips list shows it —
  // see features/pickingSlips/slipViews.js slipState, which folds the
  // gate's outcome (dispatch_events) in over the slip's own status.
  pickingSlip: {
    pending:       s('neutral', CircleDashed),            // on the floor, nobody has it
    in_progress:   s('info', PackageOpen),                // being packed
    complete:      s('warn', PackageCheck),               // packed, waiting at the gate
    dispatched:    s('good', Truck),
    collected:     s('good', CheckCheck, true),
    not_collected: s('bad', CircleX, true),
    cancelled:     s('neutral', Ban, true),
  },
  // An outbound email's outcome (features/communications on the server).
  message: {
    sent:    s('good', CheckCheck, true),
    stubbed: s('neutral', CircleDashed),                  // sending switched off; nothing left
    failed:  s('bad', CircleX, true),
  },
  // Derived from AVAILABLE server-side (stock.repository.js getManifest).
  // All soft: on a list of sixty products a solid red pill per row
  // shouts over the numbers. The row's coloured edge carries urgency.
  inventory: {
    in_stock:  s('good', Check),
    low_stock: s('warn', TriangleAlert),
    shortfall: s('bad', CircleX),
  },
  // A receipt line's expiry date, against today.
  expiry: {
    ok:      s('neutral', CalendarCheck),
    soon:    s('warn', Clock),                            // 15 to 30 days
    urgent:  s('bad', AlarmClock),                        // 14 days or less
    expired: s('bad', CalendarX, true),
  },
  // A closed day on the operating calendar.
  closure: {
    public_holiday: s('info', Flag),
    closure:        s('warn', CalendarX),
  },
  // Settings → Connections: one outside service's health.
  connection: {
    ok:      s('good', Check),
    warning: s('warn', TriangleAlert),
    down:    s('bad', CircleX, true),
    off:     s('neutral', CircleDashed),
  },
  // A collection reminder's email or WhatsApp leg.
  reminder: {
    pending:   s('neutral', Clock),
    sending:   s('info', Send),
    sent:      s('good', CheckCheck),
    failed:    s('bad', CircleX, true),
    cancelled: s('neutral', Ban),
  },
  // A visit in the door log (Volunteer log).
  visit: {
    on_site: s('good', DoorOpen),
    closed:  s('neutral', LogOut),
  },
  // Any record that can be switched off rather than deleted — a user,
  // a product, a supplier. Active is the normal case, so it is quiet;
  // inactive is the one worth a glance.
  record: {
    active:   s('neutral', Check),
    inactive: s('warn', CircleOff),
  },
};

// A "N variances" tag beside a status, not a status itself.
export const VARIANCE_STYLE = s('warn', Scale);

/** The style for a status, or a plain grey one if it is not listed. */
export const statusStyle = (kind, status) => STATUS_STYLES[kind]?.[status] ?? s('neutral', null);
