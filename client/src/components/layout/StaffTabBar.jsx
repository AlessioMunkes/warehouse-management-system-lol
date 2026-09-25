// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffTabBar.jsx
// @sentinel script-49-staff-tabbar-in-app
// @sentinel script-51-staff-tabbar-shared-tasks
// @sentinel script-52-illustrated-icons
//
// Script 51: the tab list moved to staffTasks.js, shared with the
// dashboard, and the bar shows at every width again (staff.css).
//
// How warehouse staff move between their most-used tasks on a PHONE.
//
// This app is installed as a PWA and used on a phone, so on a narrow
// screen the navigation lives at the bottom where the thumb already
// is. From sm up the app shell's sidebar is on screen and lists the
// same destinations, so staff.css hides this bar there (script 49) —
// one set of task links on screen at a time, not two.
//
// The tab bar is present on every staff page including mid-task, so
// a packer interrupted by a driver at the gate can switch to
// dispatch and come back. Task pages keep their own progress in
// component state, and the step flows re-enter at step 1 — a
// deliberate simplification for Milestone 3, noted in HANDOFF.md.
//
// Script 49: the icons are the sidebar's own lucide icons (see
// navSections.js) rather than the Canva PNG/SVG set, so a task has
// one picture everywhere in the app.
//
// NOT EVERY STAFF DESTINATION IS HERE. Feed the Soil and Benevolent
// Requests are reached from the drawer (AppNavDrawer, in StaffShell's
// app bar on every page) rather than this bar — they're worked far
// less often than the five below, and this bar is the "every shift"
// set, not the full list. Donation Intake IS one of the five: it's a
// task worked as routinely as receiving or packing, not an occasional
// one, so it belongs at the thumb rather than a tap away in the
// drawer.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { STAFF_TABS } from './staffTasks';


const isCurrent = (pathname, to, exact) =>
  pathname === to || (!exact && pathname.startsWith(`${to}/`));

// The drawing, with the lucide glyph behind it: if the file 404s the
// <img> reports it once and the tab falls back rather than going
// blank.
function TabIcon({ tab }) {
  const [broken, setBroken] = useState(false);
  const Icon = tab.icon;
  if (tab.image && !broken) {
    return (
      <img
        className="stf-tab-icon"
        src={tab.image}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="stf-tab-glyph" aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}

export default function StaffTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="stf-tabbar" aria-label="Warehouse tasks">
      {STAFF_TABS.map((tab) => {
        const current = isCurrent(pathname, tab.to, tab.exact);
        return (
          <button
            key={tab.to}
            type="button"
            className={`stf-tab${current ? ' is-current' : ''}`}
            // aria-current is what a screen reader announces; the
            // fill on .is-current is only visible to sighted users.
            aria-current={current ? 'page' : undefined}
            onClick={() => navigate(tab.to)}
          >
            <TabIcon tab={tab} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
