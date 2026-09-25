// ─────────────────────────────────────────────────────────────
// client/src/components/layout/staffTasks.js
// @sentinel script-51-staff-tasks-list
// @sentinel script-52-illustrated-icons
//
// The warehouse worker's four tasks, in one place: the bottom tab bar
// renders them as tabs and the dashboard renders them as tiles, so a
// task cannot end up with a flask on the bar and a beaker on the
// dashboard. Its own file rather than an export from the tab bar,
// which react-refresh will not have (a module Vite hot-reloads has to
// export components only).
// ─────────────────────────────────────────────────────────────
import {
  LayoutDashboard, PackageOpen, HandCoins, PackageCheck, FlaskConical, ClipboardCheck,
} from 'lucide-react';
import { STAFF } from '../../routes/paths';

// Script 52: back to the illustrated task icons from /icons, the same
// drawings the landing page uses. The lucide glyph stays on each task
// as `icon` and is what renders if the drawing 404s, so a wrong path
// can never leave a tab or a tile blank.

// Order matches the shift: goods come in (received, or donated),
// get packed, get decanted, go out.
//
// Donation Intake is on the bar rather than in the drawer: it is
// worked as routinely as receiving or packing, not occasionally.
// Feed the Soil and Benevolent Requests stay in the drawer — this
// list is the "every shift" set, not every staff destination.
//
// `exact` on Home: every task lives under /noc/..., so a prefix match
// lit Home up on Receiving, Packing and Decanting as well.
//
// Script 51: lifted out of StaffTabBar.jsx, because the worker's dashboard is now the same
// five destinations as big cards. One list, so a task cannot end up
// with a flask on the bar and a beaker on the dashboard.
export const STAFF_TABS = [
  // Home has no drawing in /icons, so it keeps its glyph.
  { label: 'Home',      to: STAFF.home,      icon: LayoutDashboard, exact: true },
  { label: 'Receiving', to: STAFF.receiving, icon: PackageOpen,     image: '/icons/receiving-icon.svg' },
  { label: 'Donation',  to: STAFF.donation,  icon: HandCoins,       image: '/icons/donate-icon.svg' },
  { label: 'Packing',   to: STAFF.packing,   icon: PackageCheck,    image: '/icons/packing-icon.svg' },
  { label: 'Decanting', to: STAFF.decanting, icon: FlaskConical,    image: '/icons/decanting-icon.svg' },
  { label: 'Dispatch',  to: STAFF.dispatch,  icon: ClipboardCheck,  image: '/icons/dispatch-icon.svg' },
];

