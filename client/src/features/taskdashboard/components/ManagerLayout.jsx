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
// Search is a placeholder, not wired to anything yet — cross-entity
// search (suppliers/products/beneficiaries/POs from one box) is a
// real, larger feature flagged separately, not a fake input that
// silently does nothing forever. It says so.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { STAFF, ADMIN } from '../../../routes/paths';
import NotificationBell from '../../notifications/components/NotificationBell';
import LogoutConfirmDialog from '@/components/ui/log-out-dialog';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  LayoutDashboard, Users2, ClipboardList, ShoppingCart,
  BarChart3, HeartHandshake, Package, Truck, Search, Plus, LogOut,
} from 'lucide-react';
import batchesLogo from '../../../assets/Batches_Logo.jpeg';

const ROLE_LABELS = {
  warehouse_worker: 'Warehouse staff',
  manager: 'Manager',
  admin: 'Admin',
  finance: 'Finance',
  guest: 'Guest',
};

// to: null items are admin-only and simply omitted for a manager,
// rather than shown disabled — a manager was never going to reach
// them anyway (App.jsx blocks the route), so a greyed-out link would
// just be a dead end with extra steps.
const NAV_SECTIONS = (role) => [
  {
    label: 'Overview',
    items: [
      { to: '/manager', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: STAFF.beneficiaries, label: 'Beneficiaries', icon: Users2 },
      { to: STAFF.pickingSlips, label: 'Picking Slips', icon: ClipboardList },
      { to: STAFF.purchaseOrders, label: 'Purchase Orders', icon: ShoppingCart },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: ADMIN.products, label: 'Products', icon: Package },
      role === 'admin' ? { to: ADMIN.suppliers, label: 'Suppliers', icon: Truck } : null,
    ].filter(Boolean),
  },
  {
    label: 'Insights',
    items: [
      { to: STAFF.reporting, label: 'Reporting', icon: BarChart3 },
      { to: STAFF.impactReport, label: 'Impact Report', icon: HeartHandshake },
    ],
  },
  role === 'admin' ? {
    label: 'Admin',
    items: [
      { to: ADMIN.users, label: 'Users', icon: Users2 },
    ],
  } : null,
].filter(Boolean);

// Ordered by how often a manager actually reaches for each — same
// reasoning PickingSlipManagementPage.jsx's own quick actions use.
const QUICK_CREATE = [
  { to: STAFF.pickingSlips, label: 'Picking slip' },
  { to: STAFF.purchaseOrders, label: 'Purchase order' },
  { to: ADMIN.products, label: 'Product' },
  { to: STAFF.beneficiaries, label: 'Beneficiary' },
];

const NavLink = ({ to, label, icon: Icon, active }) => (
  <Link
    to={to}
    className={`flex items-center gap-2.5 rounded-[4px] px-3 py-2 text-sm transition-colors ${
      active
        ? 'bg-[#2b3336] text-white font-medium'
        : 'text-[#2b3336] hover:bg-[#f3efe9]'
    }`}
  >
    <Icon className="size-4 shrink-0" />
    {label}
  </Link>
);

export default function ManagerLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : '';
  const sections = NAV_SECTIONS(user?.role);

  const handleConfirmLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#faf8f5]">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[#e9e3dd] bg-white px-3 py-4 sm:flex">
        <Link to="/manager" className="mb-6 flex items-center gap-2 px-2">
          <img src={batchesLogo} alt="" className="h-8 w-8 rounded-[4px] object-cover" />
          <div>
            <p className="text-sm font-semibold leading-tight">Batches</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Nourish Our Children</p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.to} {...item} active={location.pathname === item.to} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Top bar ───────────────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-[#e9e3dd] bg-white px-4 py-2.5">
          <div className="relative hidden max-w-xs flex-1 sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search coming soon"
              disabled
              title="Cross-entity search isn't built yet — this is a placeholder, not a bug."
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
                {QUICK_CREATE.map((item) => (
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

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <LogoutConfirmDialog
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
