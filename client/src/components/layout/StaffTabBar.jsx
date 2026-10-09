// ─────────────────────────────────────────────────────────────
// client/src/components/layout/StaffTabBar.jsx
// @sentinel script-49-staff-tabbar-in-app
// @sentinel script-51-staff-tabbar-shared-tasks
// @sentinel script-52-illustrated-icons
//
// The bottom tab bar for warehouse workers: Home, Receiving, Donation,
// Packing, Decanting and Dispatch (listed in staffTasks.js, which the
// dashboard shares). It stays on screen during a task, so a packer can
// switch to the gate and come back.
//
// Less frequent tasks (Feed the Soil, Benevolent Requests) are in the
// menu instead. The Packing tab shows a dot while spare pallets are
// waiting on the floor.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { STAFF_TABS } from './staffTasks';
import { STAFF } from '../../routes/paths';
import { useT } from '../../translations';


const isCurrent = (pathname, to, exact) =>
  pathname === to || (!exact && pathname.startsWith(`${to}/`));

// The tab's drawing, falling back to its lucide icon if the image fails to load.
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

// packingBadge: how many unclaimed pallets are on the floor (from
// useSpareSlipAlert). Packing is the only tab with a badge.
export default function StaffTabBar({ packingBadge = 0 }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const t = useT();

  return (
    <nav className="stf-tabbar" aria-label={t('tabs.label')}>
      {STAFF_TABS.map((tab) => {
        const current = isCurrent(pathname, tab.to, tab.exact);
        const hasBadge = tab.to === STAFF.packing && packingBadge > 0;
        const label = t(tab.key);
        return (
          <button
            key={tab.to}
            type="button"
            className={`stf-tab${current ? ' is-current' : ''}`}
            // aria-current tells screen readers which tab is open.
            aria-current={current ? 'page' : undefined}
            aria-label={hasBadge ? t('tabs.new', { label, n: packingBadge }) : undefined}
            onClick={() => navigate(tab.to)}
          >
            <span className="stf-tab-icon-wrap">
              <TabIcon tab={tab} />
              {hasBadge ? <span className="stf-tab-badge" aria-hidden="true" /> : null}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
