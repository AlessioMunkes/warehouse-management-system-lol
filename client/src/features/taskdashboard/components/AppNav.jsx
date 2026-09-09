// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/AppNav.jsx
//
// The navigation itself, rendered three ways from one definition: the
// desktop sidebar, the drawer behind ManagerLayout's hamburger, and the
// drawer behind StaffShell's. Components only — the section data lives
// in navSections.js — so this module stays Fast Refresh clean.
//
// StaffShell shares it rather than growing its own copy because a
// worker inside a picking task should be able to reach any screen they
// are allowed to open without backing out to /noc first. Its bottom tab
// bar stays: that is the four-task switcher, this is everything else.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { useAuth } from '../../../context/AuthContext';
import { NAV_SECTIONS, homeForRole } from './navSections';
import batchesLogo from '../../../assets/Batches_Logo.jpeg';

const NavLink = ({ to, label, icon: Icon, active, onNavigate }) => (
  <Link
    to={to}
    onClick={onNavigate}
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

// The brand block and the section list. `onNavigate` closes the drawer
// on tap; the desktop sidebar passes nothing, having nothing to close.
export const SidebarNav = ({ sections, pathname, homeTo, onNavigate }) => (
  <>
    <Link to={homeTo} onClick={onNavigate} className="mb-6 flex items-center gap-2 px-2">
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
              <NavLink
                key={item.to}
                {...item}
                active={pathname === item.to}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  </>
);

// The hamburger and its drawer, self-contained: it reads the role and
// the current path itself so a shell can drop it in with no props.
//
// `className` is how each shell places it — ManagerLayout hides it at
// the width its sidebar appears (sm:hidden); StaffShell always shows it,
// having no sidebar at any width.
export const AppNavDrawer = ({ className = '' }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const sections = NAV_SECTIONS(user?.role);
  const homeTo = homeForRole(user?.role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button" variant="ghost" size="icon"
          className={className}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 px-3 py-4">
        {/* Sheet needs a title for screen readers; the brand block is
            the visible heading. */}
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarNav
          sections={sections}
          pathname={location.pathname}
          homeTo={homeTo}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
};
