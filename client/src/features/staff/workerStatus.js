// ─────────────────────────────────────────────────────────────
// client/src/features/staff/workerStatus.js
//
// How a status is drawn on the warehouse floor.
//
// The pill itself is the manager's (components/ui/status-badge.jsx),
// so a status has the same shape, tint and icon size on both sides.
// What each status MEANS to a worker is set here, not taken from the
// manager's table (lib/statusStyles.js): that table is written for
// the office, where a packed pallet is amber because it is still
// waiting at the gate. On the floor a packed pallet is finished work,
// so it is green.
//
//   tone: good (green) · warn (amber) · bad (red) · info (blue) · neutral (grey)
// ─────────────────────────────────────────────────────────────
import {
  Ban, Check, CheckCheck, CircleDashed, CircleX, Flag, History, House, PackageCheck,
  PackageOpen, Scale, Trash2, TriangleAlert, Truck,
} from 'lucide-react';

const s = (tone, icon, strong = false) => ({ tone, icon, strong });

export const WORKER_STATUS = {
  // A pallet on the packing list.
  slip: {
    pending:     s('neutral', CircleDashed),
    in_progress: s('info', PackageOpen),
    complete:    s('good', PackageCheck),
    collected:   s('good', CheckCheck, true),
    cancelled:   s('neutral', Ban),
  },
  // One line on a pallet.
  line: {
    pending:   s('neutral', CircleDashed),
    confirmed: s('good', Check),
    differs:   s('warn', Scale),
    flagged:   s('bad', Flag),
  },
  // A delivery, by how far its order has come.
  delivery: {
    completed:   s('good', CheckCheck, true),
    partial:     s('info', PackageOpen),
    discrepancy: s('bad', Flag),
  },
  // A pallet at the gate.
  dispatch: {
    collected:      s('good', CheckCheck, true),
    late_collected: s('warn', History),
    not_collected:  s('bad', CircleX),
    cancelled:      s('neutral', Ban),
  },
  // A Feed the Soil record.
  kit: {
    assigned:   s('warn', House),
    logged:     s('info', Scale),
    dispatched: s('good', Truck, true),
  },
  // A donated item against the product list.
  match: {
    matched:   s('good', Check),
    unmatched: s('warn', TriangleAlert),
  },
  // A note beside a record, not a status of its own.
  note: {
    wastage: s('warn', Trash2),
  },
};

/** The style for a worker status, or a plain grey pill if it is not listed. */
export const workerStatus = (kind, status) => WORKER_STATUS[kind]?.[status] ?? s('neutral', null);
