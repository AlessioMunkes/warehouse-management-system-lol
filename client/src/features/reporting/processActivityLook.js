// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/processActivityLook.js
//
// The icon and colour of each activity's circle on the process flow
// map (ProcessFlow.jsx). The circle used to be a grey dot sized by the
// traffic through the step; the count under the label already says
// that, so the circle now says what the step IS.
//
// The ids are the activity ids in server/src/features/reporting/
// processFlow.js, shared across the five processes (purchase orders,
// pallets, stock lots, donations, benevolent requests). Where two
// processes use the same id it means the same thing ('raised',
// 'approved', 'cancelled').
//
// Tone, the same five the status badges use:
//   info     a normal step on the way
//   good     the work is done (received in full, dispatched, issued)
//   warn     an exception that still moves on (short, flagged, late)
//   bad      it did not happen or was lost (uncollected, written off)
//   neutral  bookkeeping, neither good nor bad (adjustment, on hand)
// ─────────────────────────────────────────────────────────────
import {
  BadgeCheck, Ban, CalendarX, CheckCheck, Circle, CircleDashed, CircleHelp, CircleX,
  ClipboardList, Clock, FileCheck2, FilePlus2, FileText, FileX2, Flag, FlaskConical,
  HandCoins, Hourglass, ListChecks, Lock, Mail, PackageCheck, PackageMinus, PackageOpen,
  PackageX, PhoneCall, RotateCcw, Ruler, Scale, Share2, SlidersHorizontal, Tags, Trash2,
  TriangleAlert, Truck, Undo2, UserCheck, Warehouse,
} from 'lucide-react';

const look = (icon, tone) => ({ icon, tone });

const LOOK = {
  // Purchase orders
  raised:              look(FilePlus2, 'info'),
  approved:            look(BadgeCheck, 'info'),
  in_transit:          look(Truck, 'info'),
  delivery:            look(PackageOpen, 'info'),
  delivery_problem:    look(TriangleAlert, 'warn'),
  short:               look(PackageMinus, 'warn'),
  follow_up_needed:    look(Flag, 'warn'),
  follow_up_order:     look(ClipboardList, 'warn'),
  reopened:            look(RotateCcw, 'warn'),
  closed:              look(Lock, 'neutral'),
  complete:            look(CheckCheck, 'good'),
  returned:            look(Undo2, 'bad'),
  // Pallets
  generated:           look(FileText, 'info'),
  claimed:             look(UserCheck, 'info'),
  packing:             look(ListChecks, 'info'),
  flagged:             look(Flag, 'warn'),
  variance:            look(Scale, 'warn'),
  shortfall:           look(PackageX, 'warn'),
  unit_mismatch:       look(Ruler, 'warn'),
  packed:              look(PackageCheck, 'good'),
  wrong_day:           look(CalendarX, 'warn'),
  collected:           look(Truck, 'good'),
  collected_late:      look(Clock, 'warn'),
  not_collected:       look(CircleX, 'bad'),
  // Stock lots
  delivered:           look(PackageOpen, 'info'),
  delivered_late:      look(Clock, 'warn'),
  decanted:            look(FlaskConical, 'info'),
  dispatched:          look(Truck, 'good'),
  wasted:              look(Trash2, 'bad'),
  adjusted:            look(SlidersHorizontal, 'neutral'),
  used_up:             look(CheckCheck, 'good'),
  in_stock:            look(Warehouse, 'neutral'),
  // Donations
  received:            look(HandCoins, 'info'),
  classified:          look(Tags, 'info'),
  unclassified:        look(CircleHelp, 'warn'),
  committed:           look(PackageCheck, 'good'),
  awaiting_donor:      look(Hourglass, 'warn'),
  certificate_queued:  look(Mail, 'info'),
  certificate:         look(FileCheck2, 'good'),
  certificate_failed:  look(FileX2, 'bad'),
  cancelled:           look(Ban, 'bad'),
  // Benevolent requests
  requested:           look(PhoneCall, 'info'),
  reversed:            look(Undo2, 'warn'),
  fulfilled:           look(CheckCheck, 'good'),
  partially_fulfilled: look(CircleDashed, 'warn'),
  referred:            look(Share2, 'neutral'),
  declined:            look(CircleX, 'bad'),
};

// Fill, ring and icon colour per tone. Tokens, so dark mode follows.
export const TONE_COLOURS = {
  info:    { fill: 'var(--info-soft)',   ink: 'var(--info-ink)' },
  good:    { fill: 'var(--good-soft)',   ink: 'var(--good-ink)' },
  warn:    { fill: 'var(--warn-soft)',   ink: 'var(--warn-ink)' },
  bad:     { fill: 'var(--danger-soft)', ink: 'var(--danger-ink)' },
  neutral: { fill: 'var(--surface-2)',   ink: 'var(--ink-soft)' },
};

/**
 * The icon and colours for one activity. An id this table does not
 * know still gets a circle: blue if it is on the reference path, amber
 * if it is a deviation, the same split the map's lines use.
 */
export const activityLook = (id, expected = true) => {
  const found = LOOK[id] ?? look(Circle, expected ? 'info' : 'warn');
  return { ...found, ...TONE_COLOURS[found.tone] };
};

export const KNOWN_ACTIVITIES = Object.keys(LOOK);
