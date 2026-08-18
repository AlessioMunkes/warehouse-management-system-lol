// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffTabBar.jsx
//
// How warehouse staff move between their four tasks.
//
// This app is installed as a PWA and used on a phone, so the
// navigation lives at the bottom where the thumb already is. A
// sidebar was the other candidate and was rejected: on a phone it
// has to collapse behind a hamburger, which hides all four
// destinations behind a tap and gives no sense of where you are.
//
// The tab bar is present on EVERY staff page including mid-task, so
// a packer interrupted by a driver at the gate can switch to
// dispatch and come back. Task pages keep their own progress in
// component state, and the step flows re-enter at step 1 — a
// deliberate simplification for Milestone 3, noted in HANDOFF.md.
// ─────────────────────────────────────────────────────────────
import { useLocation, useNavigate } from 'react-router-dom';
import { STAFF } from '../../routes/paths';

// Order matches the shift: goods come in, get packed, get decanted,
// go out.
//
// Icons follow the landing page's convention — /icons/*.svg served from
// client/public, the same as noc-icon.svg and the rest. The Canva task
// icons were exported as PNG, so ICON_EXT is one place to change if you
// keep them that way rather than converting.
//
// Each tab falls back to a Tabler glyph if its image 404s, so a wrong
// path can never leave a tab unlabelled.
const ICON_EXT = 'svg';
const TABS = [
  { label: 'Home',      to: STAFF.home,      icon: null,               glyph: 'ti ti-home' },
  { label: 'Receiving', to: STAFF.receiving, icon: 'receiving-icon',   glyph: 'ti ti-truck-delivery' },
  { label: 'Packing',   to: STAFF.packing,   icon: 'packing-icon',     glyph: 'ti ti-package' },
  { label: 'Decanting', to: STAFF.decanting, icon: 'decanting-icon',   glyph: 'ti ti-flask' },
  { label: 'Dispatch',  to: STAFF.dispatch,  icon: 'dispatch-icon',    glyph: 'ti ti-clipboard-check' },
];

const isCurrent = (pathname, to) =>
  pathname === to || pathname.startsWith(`${to}/`);

export default function StaffTabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="stf-tabbar" aria-label="Warehouse tasks">
      {TABS.map((tab) => {
        const current = isCurrent(pathname, tab.to);
        return (
          <button
            key={tab.to}
            type="button"
            className={`stf-tab${current ? ' is-current' : ''}`}
            // aria-current is what a screen reader announces; the
            // border on .is-current is only visible to sighted users.
            aria-current={current ? 'page' : undefined}
            onClick={() => navigate(tab.to)}
          >
            {tab.icon ? (
              <img
                className="stf-tab-icon"
                src={`/icons/${tab.icon}.${ICON_EXT}`}
                alt=""
                aria-hidden="true"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <span className="stf-tab-glyph" aria-hidden="true">
                <i className={tab.glyph} />
              </span>
            )}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
