// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/ManagerLayout.jsx
//
// The Zoho-style shell: a persistent left sidebar plus a top bar,
// wrapping every manager-area screen (dashboard, beneficiaries,
// picking slips, purchase orders, reporting, products, and — for an
// admin — suppliers/users). Replaces TopNavbar for these screens;
// TopNavbar itself is untouched and still used by the phone-first
// staff flows (receiving/decanting/dispatch/packing), which are a
// deliberately different, simpler chrome for a different device
// context (a tablet at the gate, not a manager at a desk).
//
// Nav items are gated by ROLE, not by whether the route happens to
// resolve for the current user — a worker never reaching this shell
// at all is the real gate (every route here requires manager/admin,
// see App.jsx); the role checks below only decide which items an
// admin sees that a manager doesn't (Suppliers, Users) and vice
// versa (nothing, today — every manager-only screen is also
// admin-reachable).
//
// Script 52: the disabled search box is gone from the top bar. It sat
// there through every screen advertising something that does not
// exist, and a control nobody can use is worse than no control.
// The note below is kept for whoever builds the real one.
//
// (was) Search is a placeholder, not wired to anything yet — cross-entity
// search (suppliers/products/beneficiaries/POs from one box) is a
// real, larger feature flagged separately, not a fake input that
// silently does nothing forever. It says so.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { STAFF, ADMIN } from '../../../routes/paths';
import NotificationBell from '../../notifications/components/NotificationBell';
import LogoutConfirmDialog from '@/components/ui/log-out-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Plus, LogOut, EyeOff, Eye, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import {
  ShellContext, useInsideShell,
  ReducedMotionContext, MOTION_KEY, readStoredMotion, applyMotionAttribute,
  readStoredSidebar, writeStoredSidebar,
} from './shellContext';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { NAV_SECTIONS, homeForRole } from './navSections';
import { SidebarNav, AppNavDrawer } from './AppNav';

const ROLE_LABELS = {
  warehouse_worker: 'Warehouse staff',
  manager: 'Manager',
  admin: 'Admin',
  guest: 'Guest',
};

// to: null items are admin-only and simply omitted for a manager,
// rather than shown disabled — a manager was never going to reach
// them anyway (App.jsx blocks the route), so a greyed-out link would
// just be a dead end with extra steps.
// Ordered by how often a manager actually reaches for each — same
// reasoning PickingSlipManagementPage.jsx's own quick actions use.
const QUICK_CREATE = [
  { to: STAFF.pickingSlips, label: 'Picking slip' },
  { to: STAFF.purchaseOrders, label: 'Purchase order' },
  // Product creation is admin-only since script 35 — every write in
  // product.routes.js is requireRole(ADMIN), and App.jsx gates the
  // route to match. Offering it to a manager is a shortcut to a screen
  // that bounces them.
  { to: ADMIN.products, label: 'Product', roles: ['admin'] },
  { to: STAFF.beneficiaries, label: 'Beneficiary' },
];

// An entry with no `roles` is for everyone who reaches this shell.
// Filtering here rather than at the render site means the next
// admin-only shortcut is one word, not another conditional.
const quickCreateFor = (role) =>
  QUICK_CREATE.filter((item) => !item.roles || item.roles.includes(role));

export default function ManagerLayout({ children }) {
  // Already inside a shell — ProtectedRoute supplied one at the route
  // level. Render the children and nothing else, so the ten pages that
  // call this directly did not need rewriting.
  const alreadyInShell = useInsideShell();
  if (alreadyInShell) return <>{children}</>;

  return <ManagerLayoutShell>{children}</ManagerLayoutShell>;
}

function ManagerLayoutShell({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [reducedMotion, setReducedMotionState] = useState(readStoredMotion);
  // Seeded from storage at first render, not in an effect: an effect
  // would paint the rail open and then snap it shut on every load.
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(readStoredSidebar);

  // Functional update, so the keyboard shortcut below can share it
  // without capturing a stale value in its one-time listener.
  const toggleSidebar = () => setSidebarCollapsedState((previous) => {
    const next = !previous;
    writeStoredSidebar(next);
    return next;
  });

  const setReducedMotion = (next) => {
    setReducedMotionState(next);
    applyMotionAttribute(next);
    try { localStorage.setItem(MOTION_KEY, String(next)); } catch { /* nothing we can do */ }
  };

  // On mount too, not only on change: a reload restores the value from
  // storage but nothing would have re-marked the document for CSS.
  useEffect(() => { applyMotionAttribute(reducedMotion); }, [reducedMotion]);

  // Ctrl/⌘-B, the shortcut every editor-shaped app uses for this. On
  // window rather than the button so it works wherever focus happens to
  // be, and preventDefault because Ctrl-B is the browser's bookmark
  // sidebar in Firefox.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'b' && event.key !== 'B') return;
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();
      setSidebarCollapsedState((previous) => {
        const next = !previous;
        writeStoredSidebar(next);
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';
  const sections = NAV_SECTIONS(user?.role);
  const homeTo = homeForRole(user?.role);

  const handleConfirmLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate('/login');
  };

  return (
   <ShellContext.Provider value={true}>
    <ReducedMotionContext.Provider value={{ reducedMotion, setReducedMotion }}>
    {/* h-screen + overflow-hidden, not min-h-screen: min-h-screen let this
        wrapper grow taller than the viewport, so the whole page (sidebar
        included) scrolled together in document flow and <main>'s own
        overflow-y-auto never had a bounded parent to engage against.
        Pinning the wrapper to the viewport height, plus min-h-0 on the flex
        children below (flex items refuse to shrink under their content by
        default), is what makes only <main> scroll while the sidebar and
        top bar hold still. */}
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-line bg-surface py-4 sm:flex ${
          sidebarCollapsed ? 'w-16 px-2' : 'w-56 px-3'
        } ${
          // The width animates, unless the person has asked the app to
          // stop moving — the same setting the eye button holds, two
          // controls apart in the same bar.
          reducedMotion ? '' : 'transition-[width] duration-200 ease-linear'
        }`}
      >
        <SidebarNav
          sections={sections}
          pathname={location.pathname}
          homeTo={homeTo}
          collapsed={sidebarCollapsed}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* ── Top bar ───────────────────────────────────────── */}
        <header className="shrink-0 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          {/* Same breakpoint as the sidebar above, so exactly one of the
              two is ever on screen. */}
          <AppNavDrawer className="sm:hidden" />

          {/* The mirror of that breakpoint: below sm the nav IS the
              drawer beside this, which has nothing to collapse. */}
          <Button
            type="button" variant="ghost" size="icon"
            className="hidden sm:inline-flex"
            onClick={toggleSidebar}
            aria-pressed={sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>

          <div className="relative hidden max-w-xs flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search coming soon"
              disabled
              title="Coming soon"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Popover open={quickCreateOpen} onOpenChange={setQuickCreateOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Quick create">
                  <Plus />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                {quickCreateFor(user?.role).map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setQuickCreateOpen(false)}
                    className="block rounded-[4px] px-2.5 py-1.5 text-sm hover:bg-muted/50"
                  >
                    {item.label}
                  </Link>
                ))}
              </PopoverContent>
            </Popover>

            {/* Was TopNavbar's "Less movement" button. TaskGrid and
                StockHealthBar read it; deleting that bar without moving
                this would have deleted the feature. */}
            <Button
              type="button" variant="ghost" size="icon"
              onClick={() => setReducedMotion(!reducedMotion)}
              aria-pressed={reducedMotion}
              aria-label={reducedMotion ? 'Allow movement' : 'Reduce movement'}
              title={reducedMotion ? 'Movement reduced' : 'Reduce movement'}
            >
              {reducedMotion ? <EyeOff /> : <Eye />}
            </Button>

            <ThemeToggle />

            <NotificationBell />

            {user ? (
              <span className="ml-2 hidden text-sm sm:inline">
                {user.firstName} {user.lastName}
                <span className="text-muted-foreground"> · {roleLabel}</span>
              </span>
            ) : null}

            <Button
              type="button" variant="ghost" size="icon"
              onClick={() => setLogoutOpen(true)}
              aria-label="Log out"
            >
              <LogOut />
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <LogoutConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={handleConfirmLogout}
      />
    </div>
    </ReducedMotionContext.Provider>
   </ShellContext.Provider>
  );
}
