// ─────────────────────────────────────────────────────────────
// client/src/components/layout/staffTasks.js
// @sentinel script-51-staff-tasks-list
// @sentinel script-52-illustrated-icons
//
// The warehouse worker's everyday tasks. The bottom tab bar and the
// dashboard both use this list, so they always match. (It lives in its
// own file because component files may only export components.)
// ─────────────────────────────────────────────────────────────
import {
  LayoutDashboard, PackageOpen, HandCoins, PackageCheck, FlaskConical, ClipboardCheck,
} from 'lucide-react';
import { STAFF } from '../../routes/paths';

// In the order of a shift: goods come in (received or donated), get
// packed, decanted and sent out. `image` is the illustrated icon; `icon`
// is the fallback if it doesn't load. Home is `exact` because every task
// URL starts with /noc. Feed the Soil and Benevolent Requests are in the
// menu rather than here.
export const STAFF_TABS = [
  // Home has no drawing in /icons, so it keeps its glyph.
  { label: 'Home',      to: STAFF.home,      icon: LayoutDashboard, exact: true },
  { label: 'Receiving', to: STAFF.receiving, icon: PackageOpen,     image: '/icons/receiving-icon.svg' },
  { label: 'Donation',  to: STAFF.donation,  icon: HandCoins,       image: '/icons/donate-icon.svg' },
  { label: 'Packing',   to: STAFF.packing,   icon: PackageCheck,    image: '/icons/packing-icon.svg' },
  { label: 'Decanting', to: STAFF.decanting, icon: FlaskConical,    image: '/icons/decanting-icon.svg' },
  { label: 'Dispatch',  to: STAFF.dispatch,  icon: ClipboardCheck,  image: '/icons/dispatch-icon.svg' },
];

